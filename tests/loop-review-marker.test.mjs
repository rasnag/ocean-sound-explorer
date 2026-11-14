// REVIEW-JOURNAL-01: real regression cases; controller checkpoints in the report.
// Architecture v1.2 SHA256
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// All review facts, authority, generation, primary rows and journals are real
// disposable integrations. Invented checks never constitute human approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,rm,rename,copyFile,readFile,writeFile,readdir,lstat,realpath,unlink,symlink,link,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {reviewFixture,readyReviewRequest,reviewRead,recordAll,reviewCommand,ALL_CHECKS} from './loop-review-service.test.mjs';
import {createSyntheticReviewJournal} from '../server/review-journal.mjs';
import {canonical} from '../server/continuation-journal.mjs';

const markerName='review-namespace.json',logName='queue-journal.log';
const quarantine=e=>e?.code==='recovery_quarantined'&&e.status===503;
const denied=e=>e?.code==='denied'&&e.status===403;
const unavailable=e=>e?.code==='journal_unavailable'&&e.status===503;
const id=s=>s.dev.toString(10)+':'+s.ino.toString(10);
const stat=p=>lstat(p,{bigint:true});
function stable(v){
 if(v===null)return 'null';
 if(v instanceof Date)return JSON.stringify(['date',v.toISOString()]);
 if(v instanceof Uint8Array)return JSON.stringify(['bytes',Buffer.from(v).toString('hex')]);
 if(typeof v==='bigint')return JSON.stringify(['bigint',v.toString()]);
 if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
 if(typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
 return JSON.stringify(v);
}
async function rows(f){
 const result={cost:{},noncost:{}};
 for(const {tablename:name}of(await f.db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows){
  const values=(await f.db.query('SELECT * FROM "'+name.replaceAll('"','""')+'"')).rows.map(stable).sort();
  result[name.startsWith('cost_slice_')?'cost':'noncost'][name]=createHash('sha256').update(stable(values)).digest('hex');
 }
 return result;
}
async function disk(directory){
 const result={};
 for(const name of(await readdir(directory)).sort()){
  const filename=join(directory,name),s=await stat(filename);
  const meta={identity:id(s),links:s.nlink.toString(),size:s.size.toString(),mode:s.mode.toString(),uid:s.uid.toString()};
  if(s.isSymbolicLink())result[name]={...meta,kind:'symlink',target:await readlink(filename),bytes:await readFile(filename)};
  else if(s.isDirectory())result[name]={...meta,kind:'directory',entries:(await readdir(filename)).sort()};
  else result[name]={...meta,kind:'file',bytes:await readFile(filename)};
 }
 return result;
}
async function rejected(f,directory,run,predicate=quarantine){
 const beforeRows=await rows(f),beforeDisk=await disk(directory);
 try{await assert.rejects(run,predicate);}finally{
  assert.deepEqual(await rows(f),beforeRows,'Every cost and non-cost primary row must remain unchanged');
  assert.deepEqual(await disk(directory),beforeDisk,'Rejected evidence, identities and bytes must remain unchanged');
 }
}
async function probeOpen(options){
 let journal;
 try{journal=await createSyntheticReviewJournal(options);await journal.records('operator');}
 finally{await journal?.close();}
}
async function ownedRoot(f){
 const root=await mkdtemp(join(tmpdir(),'loop-review-marker-'));
 async function guard(){
  assert.equal(dirname(resolve(root)),resolve(tmpdir()));
  assert(/^loop-review-marker-[A-Za-z0-9]+$/.test(basename(root)));
  const s=await stat(root);assert(s.isDirectory()&&!s.isSymbolicLink());
  assert.equal(await realpath(root),resolve(root));
 }
 await guard();f.cleanup(async()=>{await guard();await rm(root,{recursive:true,force:true});});return root;
}
async function prepared(t,populated=true){
 const f=await reviewFixture(t),scope=await readyReviewRequest(f,'Invented marker-bound review question.');
 if(populated){
  assert.equal((await recordAll(f,scope,'Invented marker-bound checklist, no actual approval.')).status,'acknowledged');
  const v=await reviewRead(f,scope);
  assert.equal((await f.review.command(f.founderToken,reviewCommand(scope,v,'ReleaseTestSnapshot',{predecessor_snapshot_id:null}))).status,'acknowledged');
 }
 const view=await reviewRead(f,scope),namespace=f.reviewOptions().journal.namespace_verifier;
 return {f,scope,view,namespace};
}
async function closeReview(f){f.review.close();await f.reviewOptions().journal.close();}
async function restored(f,scope,view,namespace){
 await f.reopenReview();assert.equal(f.reviewOptions().journal.namespace_verifier,namespace);
 assert.deepEqual(await reviewRead(f,scope),view,'A new legitimate instance preserves exact TEST history');
}

// Produces genuinely authenticated marker bodies using the accepted review
// derivation. There is intentionally no old-format reader in runtime code.
function signed(keys,body){
 const raw=keys.keyForOperator(),copy=Buffer.from(raw);let derived;
 try{
  derived=createHmac('sha256',copy).update('review-local-01\0namespace-marker\0').digest();
  const mac=createHmac('sha256',derived).update(canonical(body)).digest('hex');
  return Buffer.from(canonical({...body,mac})+'\n');
 }finally{copy.fill(0);derived?.fill(0);raw.fill(0);}
}
function bodyOf(bytes){const {mac,...body}=JSON.parse(bytes.toString('utf8'));assert.equal(typeof mac,'string');return body;}

for(const populated of [false,true]){
 for(const kind of ['marker','log','directory','relocation'])test('review marker: '+(populated?'populated':'empty')+' '+kind+' copy/relocation is refused; original restoration reopens',async t=>{
  const {f,scope,view,namespace}=await prepared(t,populated),root=await ownedRoot(f),options=f.reviewJournalOptions();
  await closeReview(f);const originalBytes=await disk(f.reviewDirectory);
  if(kind==='marker'||kind==='log'){
   const name=kind==='marker'?markerName:logName,target=join(f.reviewDirectory,name),backup=join(root,'original');
   const originalStat=await stat(target),bytes=await readFile(target);
   await rename(target,backup);
   try{
    await copyFile(backup,target);assert.notEqual(id(await stat(target)),id(originalStat));
    assert.deepEqual(await readFile(target),bytes);
    await rejected(f,f.reviewDirectory,()=>probeOpen(options));
    assert.deepEqual(await readFile(backup),bytes);
   }finally{await unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});await rename(backup,target);}
  }else if(kind==='directory'){
   const backup=join(root,'original-directory'),replacement=join(root,'replacement');
   await mkdir(replacement,{mode:0o700});
   for(const name of [markerName,logName])await copyFile(join(f.reviewDirectory,name),join(replacement,name));
   const originalIdentity=id(await stat(f.reviewDirectory));
   await rename(f.reviewDirectory,backup);await rename(replacement,f.reviewDirectory);
   try{
    assert.notEqual(id(await stat(f.reviewDirectory)),originalIdentity);
    for(const name of [markerName,logName])assert.deepEqual(await readFile(join(f.reviewDirectory,name)),originalBytes[name].bytes);
    await rejected(f,f.reviewDirectory,()=>probeOpen(options));
    assert.deepEqual(await disk(backup),originalBytes);
   }finally{await rename(f.reviewDirectory,replacement);await rename(backup,f.reviewDirectory);}
  }else{
   const relocated=join(root,'relocated'),originalIdentity=id(await stat(f.reviewDirectory));
   await rename(f.reviewDirectory,relocated);
   try{
    assert.equal(id(await stat(relocated)),originalIdentity,'A rename retains identity but changes resolved path');
    assert.deepEqual(await disk(relocated),originalBytes);
    await rejected(f,relocated,()=>probeOpen({...options,directory:relocated}));
   }finally{await rename(relocated,f.reviewDirectory);}
  }
  assert.deepEqual(await disk(f.reviewDirectory),originalBytes);
  await restored(f,scope,view,namespace);
 });
}

test('review marker: v2 canonical body contains exact bigint identities and untouched reopen preserves bytes',async t=>{
 const {f,scope,view,namespace}=await prepared(t),directory=f.reviewDirectory;
 const bytes=await readFile(join(directory,markerName)),m=JSON.parse(bytes.toString('utf8'));
 assert.deepEqual(Object.keys(m).sort(),['format','namespace_verifier','directory_path','directory_identity','log_identity','marker_identity','mac'].sort());
 assert.equal(m.format,'review-journal-v2');assert.equal(m.directory_path,await realpath(directory));
 assert.equal(m.directory_identity,id(await stat(directory)));assert.equal(m.log_identity,id(await stat(join(directory,logName))));assert.equal(m.marker_identity,id(await stat(join(directory,markerName))));
 for(const field of ['directory_identity','log_identity','marker_identity'])assert.match(m[field],/^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/);
 assert.equal(canonical(m)+'\n',bytes.toString('utf8'));
 assert.deepEqual(signed(f.reviewJournalOptions().keys,bodyOf(bytes)),bytes);
 const before=await disk(directory),beforeRows=await rows(f);await closeReview(f);await restored(f,scope,view,namespace);
 assert.deepEqual(await disk(directory),before);assert.deepEqual(await rows(f),beforeRows);
});

for(const kind of ['marker','log','directory'])test('review marker: in-process '+kind+' replacement is sticky when the OS permits replacement',async t=>{
 const {f,scope,view,namespace}=await prepared(t),root=await ownedRoot(f),journal=f.reviewOptions().journal;
 const row=(await f.db.query('SELECT sealed_fact FROM review_slice_commands ORDER BY aggregate_version LIMIT 1')).rows[0];
 const fact=await journal.fact(row.sealed_fact),originalBytes=await disk(f.reviewDirectory);
 const backup=join(root,'original'),replacement=join(root,'replacement');
 let target;
 if(kind==='directory'){
  await mkdir(replacement,{mode:0o700});for(const name of [markerName,logName])await copyFile(join(f.reviewDirectory,name),join(replacement,name));
  target=f.reviewDirectory;const prior=id(await stat(target)),beforeRows=await rows(f);
  try{await rename(target,backup);}catch(e){
   if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(e.code))throw e;
   // Windows forbids moving an active directory containing the held journal.
   // This is NOT an executed app-side sticky-directory assertion.
   assert.equal(id(await stat(target)),prior);assert.deepEqual(await disk(target),originalBytes);
   assert.deepEqual(await reviewRead(f,scope),view);assert.deepEqual(await rows(f),beforeRows);
   t.skip('Windows blocked active-directory replacement: '+e.code+'; live original unchanged; app-side sticky directory branch not exercised. Closed-store substitution is separately tested.');return;
  }
  await rename(replacement,target);assert.notEqual(id(await stat(target)),prior);
 }else{
  target=join(f.reviewDirectory,kind==='marker'?markerName:logName);const prior=id(await stat(target));
  await rename(target,backup);await copyFile(backup,target);assert.notEqual(id(await stat(target)),prior);
 }
 try{await rejected(f,f.reviewDirectory,()=>journal.records(scope.household_id));}
 finally{
  if(kind==='directory'){await rename(target,replacement);await rename(backup,target);}
  else{await unlink(target);await rename(backup,target);}
 }
 assert.deepEqual(await disk(f.reviewDirectory),originalBytes);
 for(const call of [()=>journal.records(scope.household_id),()=>journal.seal(fact),()=>journal.fact(row.sealed_fact),()=>journal.append(row.sealed_fact),()=>journal.claimFreshNamespace()])await rejected(f,f.reviewDirectory,call);
 const beforeRows=await rows(f),beforeDisk=await disk(f.reviewDirectory);
 await journal.close();await journal.close();
 assert.deepEqual(await rows(f),beforeRows);assert.deepEqual(await disk(f.reviewDirectory),beforeDisk);
 await assert.rejects(()=>journal.records(scope.household_id),quarantine);
 await restored(f,scope,view,namespace);
});

test('review marker: wrong operator key authenticates neither empty nor populated store; wrong household key rejects actual facts',async t=>{
 const {f,scope,view,namespace}=await prepared(t),options=f.reviewJournalOptions(),root=await ownedRoot(f),emptyDirectory=join(root,'empty');
 await mkdir(emptyDirectory,{mode:0o700});
 const empty=await createSyntheticReviewJournal({...options,directory:emptyDirectory}),emptyNamespace=empty.namespace_verifier;await empty.close();
 await rejected(f,emptyDirectory,()=>probeOpen({...options,directory:emptyDirectory,keys:{...options.keys,keyForOperator:()=>Buffer.alloc(32,93)}}));
 const proper=await createSyntheticReviewJournal({...options,directory:emptyDirectory});
 try{assert.equal(proper.namespace_verifier,emptyNamespace);assert.deepEqual(await proper.records(scope.household_id),[]);}finally{await proper.close();}
 await closeReview(f);
 for(const keys of [{...options.keys,keyForOperator:()=>Buffer.alloc(32,94)},{...options.keys,keyForHousehold:()=>Buffer.alloc(32,95)}])await rejected(f,f.reviewDirectory,()=>probeOpen({...options,keys}));
 await restored(f,scope,view,namespace);
});

for(const kind of ['malformed','empty','truncated','oversized','extra-field-authenticated','wrong-format-authenticated','wrong-identity-authenticated','wrong-namespace-authenticated','noncanonical','duplicate-field','v1-authenticated'])test('review marker: '+kind+' quarantines unchanged',async t=>{
 const {f,scope,view,namespace}=await prepared(t),options=f.reviewJournalOptions(),filename=join(f.reviewDirectory,markerName);
 await closeReview(f);const original=await readFile(filename),body=bodyOf(original);let bytes;
 if(kind==='malformed')bytes=Buffer.from('{broken\n');
 else if(kind==='empty')bytes=Buffer.alloc(0);
 else if(kind==='truncated')bytes=original.subarray(0,original.length-5);
 else if(kind==='oversized')bytes=Buffer.alloc(2049,32);
 else if(kind==='extra-field-authenticated')bytes=signed(options.keys,{...body,extra:'invented'});
 else if(kind==='wrong-format-authenticated')bytes=signed(options.keys,{...body,format:'review-journal-v3'});
 else if(kind==='wrong-identity-authenticated')bytes=signed(options.keys,{...body,marker_identity:'0001:0002'});
 else if(kind==='wrong-namespace-authenticated')bytes=signed(options.keys,{...body,namespace_verifier:body.namespace_verifier==='a'.repeat(64)?'b'.repeat(64):'a'.repeat(64)});
 else if(kind==='noncanonical')bytes=Buffer.from(JSON.stringify(JSON.parse(original),null,2)+'\n');
 else if(kind==='duplicate-field')bytes=Buffer.from(original.toString().replace('{','{"format":"review-journal-v2",'));
 else{
  const oldBody={format:'review-journal-v1',namespace_verifier:namespace};bytes=signed(options.keys,oldBody);
  const m=JSON.parse(bytes);assert.deepEqual(Object.keys(m).sort(),['format','namespace_verifier','mac'].sort());
  assert.deepEqual(bytes,signed(options.keys,oldBody),'Genuine baseline review-domain v1 MAC, not a relabelled v2 marker');
 }
 try{await writeFile(filename,bytes);await rejected(f,f.reviewDirectory,()=>probeOpen(options));assert.deepEqual(await readFile(filename),bytes);}
 finally{await writeFile(filename,original);}
 await restored(f,scope,view,namespace);
});

for(const kind of ['missing-marker','missing-log','extra-file','extra-directory','log-truncated','log-tampered'])test('review marker: '+kind+' preserves all rejected evidence',async t=>{
 const {f,scope,view,namespace}=await prepared(t),options=f.reviewJournalOptions(),root=await ownedRoot(f);
 await closeReview(f);const before=await disk(f.reviewDirectory);let restore;
 if(kind.startsWith('missing-')){
  const target=join(f.reviewDirectory,kind==='missing-marker'?markerName:logName),backup=join(root,'original');
  await rename(target,backup);restore=()=>rename(backup,target);
 }else if(kind==='extra-file'){
  const target=join(f.reviewDirectory,'unexpected');await writeFile(target,'Invented unexpected evidence.\n',{flag:'wx',mode:0o600});restore=()=>unlink(target);
 }else if(kind==='extra-directory'){
  const target=join(f.reviewDirectory,'unexpected');await mkdir(target,{mode:0o700});
  restore=async()=>{assert.equal(dirname(resolve(target)),resolve(f.reviewDirectory));assert.equal(await realpath(target),resolve(target));await rm(target,{recursive:true,force:true});};
 }else{
  const target=join(f.reviewDirectory,logName),original=await readFile(target);let bytes;
  if(kind==='log-truncated')bytes=original.subarray(0,original.length-1);
  else{bytes=Buffer.from(original);const at=bytes.indexOf(Buffer.from('"mac":"'));assert(at>0);bytes[at+7]=bytes[at+7]===97?98:97;}
  await writeFile(target,bytes);restore=()=>writeFile(target,original);
 }
 try{await rejected(f,f.reviewDirectory,()=>probeOpen(options));}finally{await restore();}
 assert.deepEqual(await disk(f.reviewDirectory),before);await restored(f,scope,view,namespace);
});

for(const kind of ['symlink','hardlink'])for(const name of [markerName,logName])test('review marker: '+kind+' '+name+' is refused when supported',async t=>{
 const {f,scope,view,namespace}=await prepared(t),options=f.reviewJournalOptions(),root=await ownedRoot(f),target=join(f.reviewDirectory,name),backup=join(root,'original');
 await closeReview(f);const bytes=await readFile(target);await rename(target,backup);let made=false;
 try{
  try{if(kind==='symlink')await symlink(backup,target,'file');else await link(backup,target);made=true;}
  catch(e){
   if(['EPERM','EACCES','ENOSYS','ENOTSUP','EOPNOTSUPP'].includes(e.code)){t.skip('Platform cannot create owned '+kind+' fixture: '+e.code);return;}
   throw e;
  }
  if(kind==='symlink')assert((await stat(target)).isSymbolicLink());
  else{assert.equal(id(await stat(target)),id(await stat(backup)));assert((await stat(target)).nlink>1n);}
  assert.deepEqual(await readFile(target),bytes);
  await rejected(f,f.reviewDirectory,()=>probeOpen(options));assert.deepEqual(await readFile(backup),bytes);
 }finally{if(made)await unlink(target);await rename(backup,target);}
 await restored(f,scope,view,namespace);
});

test('review marker: duplicate fresh claim cannot reset or poison healthy storage',async t=>{
 const {f}=await prepared(t,false),root=await ownedRoot(f),directory=join(root,'fresh'),options={...f.reviewJournalOptions(),directory};
 await mkdir(directory,{mode:0o700});let journal=await createSyntheticReviewJournal(options);
 try{
  const namespace=journal.namespace_verifier;assert.equal(await journal.claimFreshNamespace(),namespace);
  for(let n=0;n<2;n++){await rejected(f,directory,()=>journal.claimFreshNamespace());assert.deepEqual(await journal.records('operator'),[]);}
  const before=await disk(directory);await journal.close();journal=await createSyntheticReviewJournal(options);
  assert.equal(journal.namespace_verifier,namespace);await rejected(f,directory,()=>journal.claimFreshNamespace());
  assert.deepEqual(await journal.records('operator'),[]);assert.deepEqual(await disk(directory),before);
 }finally{await journal.close();}
});

test('review marker: real immutable TEST snapshot and original-key retry survive unchanged reopen without duplicates',async t=>{
 const f=await reviewFixture(t),scope=await readyReviewRequest(f);await recordAll(f,scope,'Invented reopen checklist, never human approval.');
 const v=await reviewRead(f,scope),command=reviewCommand(scope,v,'ReleaseTestSnapshot',{predecessor_snapshot_id:null});
 const ack=await f.review.command(f.founderToken,command);assert.equal(ack.status,'acknowledged');
 const view=await reviewRead(f,scope),namespace=f.reviewOptions().journal.namespace_verifier,beforeRows=await rows(f),beforeDisk=await disk(f.reviewDirectory);
 assert.equal(view.snapshots.length,1);assert.equal(view.snapshots[0].adventure.status,'draft');
 await f.reopenReview();assert.equal(f.reviewOptions().journal.namespace_verifier,namespace);assert.deepEqual(await reviewRead(f,scope),view);
 assert.deepEqual(await f.review.command(f.founderToken,command),ack);
 assert.deepEqual(await f.review.reconcile(f.founderToken,{...scope,command_id:command.command.command_id}),ack);
 assert.deepEqual(await reviewRead(f,scope),view);assert.deepEqual(await rows(f),beforeRows);assert.deepEqual(await disk(f.reviewDirectory),beforeDisk);
});

test('review marker: actual append outage stays retryable; unchanged reopen recovers exactly the original key',async t=>{
 const f=await reviewFixture(t),scope=await readyReviewRequest(f),v=await reviewRead(f,scope);
 const command=reviewCommand(scope,v,'RecordTestReview',{synthetic:true,checks:{...ALL_CHECKS},notes:'Invented outage recovery, original key only.'});
 f.reviewOutage(true);const before=await disk(f.reviewDirectory);
 assert.equal((await f.review.command(f.founderToken,command)).status,'retryable_unacknowledged');
 assert.deepEqual(await disk(f.reviewDirectory),before);
 const pending=await reviewRead(f,scope);assert.equal(pending.status,'review_pending');assert(!Object.hasOwn(pending,'revision'));
 assert.deepEqual(pending.pending,[{command_id:command.command.command_id}]);
 assert.equal((await f.db.query('SELECT * FROM review_slice_acknowledgements')).rows.length,0);
 f.reviewOutage(false);await f.reopenReview();
 assert.equal((await f.review.reconcile(f.founderToken,{...scope,command_id:command.command.command_id})).status,'acknowledged');
 const afterRows=await rows(f),afterDisk=await disk(f.reviewDirectory);
 assert.equal((await f.review.command(f.founderToken,command)).status,'acknowledged');
 assert.equal((await reviewRead(f,scope)).review.notes,command.command.payload.notes);
 assert.equal((await f.db.query('SELECT * FROM review_slice_commands')).rows.length,1);
 assert.equal((await f.db.query('SELECT * FROM review_slice_acknowledgements')).rows.length,1);
 assert.deepEqual(await rows(f),afterRows);assert.deepEqual(await disk(f.reviewDirectory),afterDisk);
});

test('review marker: real TEST withdrawal inside append denies ACK and all private recovery paths',async t=>{
 const f=await reviewFixture(t),scope=await readyReviewRequest(f),v=await reviewRead(f,scope);
 const command=reviewCommand(scope,v,'RecordTestReview',{synthetic:true,checks:{...ALL_CHECKS},notes:'Invented never-acknowledged withdrawal note.'});let entered=false;
 f.beforeReviewAppend(async()=>{entered=true;await f.consent.withdraw(f.adult.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1'});});
 await assert.rejects(()=>f.review.command(f.founderToken,command),denied);assert(entered);
 for(const call of [()=>reviewRead(f,scope),()=>f.review.command(f.founderToken,command),()=>f.review.reconcile(f.founderToken,{...scope,command_id:command.command.command_id})])await rejected(f,f.reviewDirectory,call,denied);
 assert.equal((await f.db.query('SELECT * FROM review_slice_acknowledgements')).rows.length,0);
 assert.equal((await f.db.query('SELECT * FROM review_slice_reviews')).rows.length,0);
 assert.equal((await f.db.query('SELECT * FROM review_slice_snapshots')).rows.length,0);
 await f.reopenReview();await assert.rejects(()=>reviewRead(f,scope),denied);
});

test('review marker: close waits for an actual held append, releases once, and permits new-instance original recovery',async t=>{
 const f=await reviewFixture(t),scope=await readyReviewRequest(f),v=await reviewRead(f,scope);
 const command=reviewCommand(scope,v,'RecordTestReview',{synthetic:true,checks:{...ALL_CHECKS},notes:'Invented append and close interleaving.'});
 f.reviewOutage(true);assert.equal((await f.review.command(f.founderToken,command)).status,'retryable_unacknowledged');f.reviewOutage(false);
 const row=(await f.db.query('SELECT * FROM review_slice_commands WHERE command_id=$1',[command.command.command_id])).rows[0],journal=f.reviewOptions().journal;
 let signal,release;const reached=new Promise(r=>signal=r),gate=new Promise(r=>release=r);
 f.beforeReviewAppend(async()=>{signal();await gate;});
 const appending=journal.append(row.sealed_fact);const observedAppend=appending.then(value=>({value}),error=>({error}));await reached;
 let closing;
 try{
  closing=journal.close();assert.equal(journal.close(),closing);
  await assert.rejects(()=>journal.records(scope.household_id),unavailable);
 }finally{release();}
 const result=await observedAppend;assert.equal(result.error,undefined);assert.equal(result.value,'queue-fsync:'+row.record_id);await closing;
 await f.reopenReview();assert.equal((await f.review.reconcile(f.founderToken,{...scope,command_id:command.command.command_id})).status,'acknowledged');
 assert.equal((await reviewRead(f,scope)).review.notes,command.command.payload.notes);
 assert.equal((await f.db.query('SELECT * FROM review_slice_commands')).rows.length,1);
 assert.equal((await f.db.query('SELECT * FROM review_slice_acknowledgements')).rows.length,1);
});
