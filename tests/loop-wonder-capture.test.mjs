// CODEX-04-A actual local synthetic integration checks; no production or legal clearance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdtemp,readFile,appendFile,rename,rm,realpath,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {createSyntheticAdultAccess} from '../server/adult-access.mjs';
import {createSyntheticConsentService} from '../server/consent-service.mjs';
import {createSyntheticChildSetup} from '../server/child-setup.mjs';
import {createSyntheticFamilySpace} from '../server/family-space.mjs';
import {createSyntheticAdultAccessServer} from '../server/adult-http.mjs';
import {createSyntheticWonderJournal} from '../server/wonder-journal.mjs';
import {createSyntheticWonderCapture} from '../server/wonder-capture.mjs';
import {createWonderCaptureClient} from '../lib/loop/wonder-capture-client.mjs';
const env={LOOP_ENV:'local-synthetic'},policyVersion='TEST-v1';
async function fixture(work){
 const db=await createSyntheticDatabase(env),directory=await mkdtemp(join(tmpdir(),'loop-wonder-test-'));let journal,server;
 let at=1800000000000,fault=null;const delivered=new Map(),materials=new Map();
 try{
  await migrate(db);const clock=()=>at;
  journal=await createSyntheticWonderJournal({env,directory,testHooks:{beforeAppend:async r=>{if(fault)await fault(r);}}});
  const access=await createSyntheticAdultAccess({env,db,clock,policy:{challengeTtlMs:600000,sessionTtlMs:3600000,resendCooldownMs:1,requestWindowMs:60000,maxRequests:1000,maxVerifyAttempts:1000},deliver:async m=>delivered.set(m.email,m.token)});
  const consent=await createSyntheticConsentService({env,db,access,clock,policyVersion}),setup=await createSyntheticChildSetup({env,db,access,clock,policyVersion});
  const keys={keyForHousehold:h=>{if(!materials.has(h))throw Error('Invented missing key');return Buffer.from(materials.get(h));}};
  async function adult(label,h){const email=label+'@example.invalid';if(h)await access.seedAccount({email,adultId:randomUUID(),householdId:h});await access.request({email,purpose:'join'});const a=await access.verify({token:delivered.get(email)});assert.equal(a.status,'verified');if(!materials.has(a.householdId))materials.set(a.householdId,randomBytes(32));await consent.record(a.sessionToken,{command_id:randomUUID(),policy_version:policyVersion,required_service:true,optional_contact:false,optional_story:false});return a;}
  async function child(a,name,initial=true){const s=await setup.status(a.sessionToken);return (await setup.save(a.sessionToken,{command_id:randomUUID(),setup_context:s.setup_context,operation:'create',initial,profile:{nickname:name,age:6,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}})).child;}
  const A=await adult('capture-alpha'),B=await adult('capture-beta'),one=await child(A,'Invented Alpha'),two=await child(A,'Invented Sibling',false),other=await child(B,'Invented Beta');
  const scope=(a,c)=>({view_context:createHash('sha256').update(JSON.stringify(['synthetic-family-space-v1',a.adultId,a.householdId,1,policyVersion])).digest('hex'),child_id:c.child_id,profile_version:c.profile_version});
  const command=(a=A,c=one,text='  Invented question 🛶\n  ')=>(()=>({command_id:randomUUID(),...scope(a,c),operation:'create',question:text,parent_context:'Separately attributed invented parent context.'}))();
  const make=()=>createSyntheticWonderCapture({env,db,access,journal,keys,clock,policyVersion});let service=await make();
  const start=async(extra={})=>{server=createSyntheticAdultAccessServer({env,access,consent,setup,capture:service,...extra});await new Promise(done=>server.listen(0,'127.0.0.1',done));return 'http://127.0.0.1:'+server.address().port;};
  await work({db,directory,access,consent,setup,A,B,one,two,other,scope,command,keys,materials,make,start,
   get service(){return service;},get journal(){return journal;},setFault(fn){fault=fn;},advance(ms){at+=ms;},
   async reopen(){await journal.close();journal=await createSyntheticWonderJournal({env,directory});service=await make();return service;}
  });
 }finally{
  if(server)await new Promise(done=>{server.close(done);server.closeAllConnections?.();});if(journal)await journal.close();await db.close();
  const absolute=resolve(directory);assert.equal(dirname(absolute),resolve(tmpdir()));assert(basename(absolute).startsWith('loop-wonder-test-'));assert.equal(await realpath(absolute),absolute);assert(!(await lstat(absolute)).isSymbolicLink());await rm(absolute,{recursive:true,force:true});
 }
}
const rejected=(work,code)=>assert.rejects(work,e=>!code||e.code===code);

test('actual HTTP/client stores exact separate words, duplicates and append-only corrections without production accounting',async()=>fixture(async f=>{
 const origin=await f.start(),cookie='loop_adult_session='+f.A.sessionToken;
 let lose=false;const transport=async(path,options)=>{const response=await fetch(origin+path,{...options,headers:{...options.headers,Origin:origin,Cookie:cookie}});if(lose){lose=false;await response.arrayBuffer();throw Error('Invented lost response after actual server completion');}return response;};
 const client=createWonderCaptureClient(transport),c=f.command(),before=(await f.db.query('SELECT count(*) n FROM entitlement_claims')).rows;
 lose=true;await assert.rejects(()=>client.save(c));const a=await client.save(c);assert.equal(a.state,'acknowledged');assert.equal(a.production_ready,false);
 assert.deepEqual(await client.save(c),a);await assert.rejects(()=>client.save({...c,question:'Changed invented question'}),e=>e.status===409);
 const s=await client.status(f.scope(f.A,f.one));assert.equal(s.saved[0].question,c.question);assert.equal(s.saved[0].parent_context,c.parent_context);
 const correction={...f.command(),operation:'correct',request_id:a.request_id,expected_source_scope_version:1,question:'Corrected invented question'};
 const corrected=await client.save(correction);assert.equal(corrected.request_id,a.request_id);assert.equal(corrected.source_scope_version,2);assert.deepEqual(await client.save(c),a);
 const versions=(await f.db.query('SELECT * FROM request_source_scopes WHERE household_id=$1 AND request_id=$2 ORDER BY source_scope_version',[f.A.householdId,a.request_id])).rows;assert.equal(versions.length,2);
 await f.access.withSession(f.A.sessionToken,async tx=>{assert.deepEqual(await f.service.question(tx,{household_id:f.A.householdId,request_id:a.request_id,source_scope_version:1,payload_ref:versions[0].payload_ref}),{question:c.question});});
 await rejected(()=>f.db.query("UPDATE wonder_source_payloads SET question_utf16_base64='eAA=' WHERE household_id=$1",[f.A.householdId]));
 await rejected(()=>f.db.query('UPDATE wonder_capture_commands SET acknowledged=false WHERE household_id=$1',[f.A.householdId]));
 assert.deepEqual((await f.db.query('SELECT count(*) n FROM entitlement_claims')).rows,before);assert.equal(Number((await f.db.query('SELECT count(*) n FROM wonder_requests WHERE original_received_at IS NOT NULL')).rows[0].n),0);
 const large={...f.command(),question:'x'+'\u0001'.repeat(3999),parent_context:'家'.repeat(2000)};assert.equal((await client.save(large)).state,'acknowledged');
 const old=await fetch(origin+'/adult/consent',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(5000)})});assert.equal(old.status,413);
}));

test('primary-only correction hides older text, blocks family Saved, and explicit reconciliation survives reopen',async()=>fixture(async f=>{
 const first=await f.service.save(f.A.sessionToken,f.command()),correction={...f.command(),operation:'correct',request_id:first.request_id,expected_source_scope_version:1,question:'Uncertain invented successor'};
 f.setFault(async()=>{throw Error('Invented pre-append failure');});const pending=await f.service.save(f.A.sessionToken,correction);assert.equal(pending.state,'retryable_unacknowledged');
 const status=await f.service.status(f.A.sessionToken,f.scope(f.A,f.one));assert.deepEqual(status.saved,[]);assert.equal(status.pending[0].command_id,correction.command_id);
 const family=await createSyntheticFamilySpace({env,db:f.db,access:f.access,policyVersion,content:{question:f.service.question,revision:async()=>{throw Error('No invented revisions');}},play:{resume:async()=>{throw Error('No invented plays');},reconcile:async()=>{throw Error('No invented plays');}}});
 await assert.rejects(()=>family.read(f.A.sessionToken,{view_context:correction.view_context,child_id:f.one.child_id}));
 await rejected(()=>f.service.save(f.A.sessionToken,f.command()),'journal_unavailable');
 await f.reopen();const recovered=await f.service.reconcile(f.A.sessionToken,{...f.scope(f.A,f.one),command_id:correction.command_id});assert.equal(recovered.state,'acknowledged');assert.deepEqual(await f.service.save(f.A.sessionToken,correction),recovered);
 const projected=await family.read(f.A.sessionToken,{view_context:correction.view_context,child_id:f.one.child_id});assert.equal(projected.saved_wonders[0].question,correction.question);
 assert.equal(Number((await f.db.query('SELECT count(*) n FROM request_source_scopes WHERE household_id=$1 AND request_id=$2',[f.A.householdId,first.request_id])).rows[0].n),2);
}));

test('snapshots input before yield, rejects getters and proxies without invoking their traps, and isolates actors',async()=>fixture(async f=>{
 const c=f.command(),original=structuredClone(c),saving=f.service.save(f.A.sessionToken,c);c.question='Caller mutation';const a=await saving;
 assert.equal((await f.service.status(f.A.sessionToken,f.scope(f.A,f.one))).saved[0].question,original.question);
 let reads=0;const accessor=Object.defineProperty(f.command(),'question',{enumerable:true,get(){reads++;throw Error();}});await rejected(()=>f.service.save(f.A.sessionToken,accessor),'validation_failed');
 const proxy=new Proxy(f.command(),{getPrototypeOf(){reads++;throw Error();},ownKeys(){reads++;throw Error();}});await rejected(()=>f.service.save(f.A.sessionToken,proxy),'validation_failed');assert.equal(reads,0);
 await rejected(()=>f.service.save(f.B.sessionToken,original),'denied');await rejected(()=>f.service.save(f.A.sessionToken,{...original,...f.scope(f.A,f.two)}),'conflict');
 const peer=await (async()=>{const email='capture-peer@example.invalid',adultId=randomUUID();await f.access.seedAccount({email,adultId,householdId:f.A.householdId});return {adultId};})();assert(peer.adultId);
 await f.access.withSession(f.A.sessionToken,async tx=>{await rejected(()=>f.service.question(tx,{household_id:f.B.householdId,request_id:a.request_id,source_scope_version:1,payload_ref:'wonder-capture:'+original.command_id}),'recovery_quarantined');});
 const exact={...f.command(),question:'x\u0000\ud800  ',parent_context:''};await f.service.save(f.A.sessionToken,exact);const own=await f.service.status(f.A.sessionToken,f.scope(f.A,f.one));assert(own.saved.some(r=>r.question===exact.question&&r.parent_context===''));
}));

test('same key precedes CAS/throttle; competing corrections append one successor',async()=>fixture(async f=>{
 const c=f.command(),a=await f.service.save(f.A.sessionToken,c),correction={...f.command(),operation:'correct',request_id:a.request_id,expected_source_scope_version:1};
 const races=await Promise.allSettled([f.service.save(f.A.sessionToken,correction),f.service.save(f.A.sessionToken,{...correction,command_id:randomUUID()})]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected'&&r.reason.code==='conflict').length,1);
 await f.db.query('UPDATE wonder_capture_throttle SET attempts=30 WHERE household_id=$1',[f.A.householdId]);assert.deepEqual(await f.service.save(f.A.sessionToken,c),a);await rejected(()=>f.service.save(f.A.sessionToken,f.command()),'rate_limited');
}));

test('profile race and withdrawal at real journal boundary cannot acknowledge stale private results',async()=>fixture(async f=>{
 let entered,release;const paused=new Promise(done=>entered=done),gate=new Promise(done=>release=done);
 f.setFault(async()=>{entered();await gate;});const c=f.command(),pending=f.service.save(f.A.sessionToken,c);await paused;
 const setup=await f.setup.status(f.A.sessionToken);await f.setup.save(f.A.sessionToken,{command_id:randomUUID(),setup_context:setup.setup_context,operation:'correct',child_id:f.one.child_id,expected_profile_version:1,profile:{nickname:'Changed Invented',age:7,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}});release();await rejected(()=>pending,'denied');
 await rejected(()=>f.service.status(f.A.sessionToken,f.scope(f.A,f.one)),'denied');
 const next={...f.scope(f.A,f.one),profile_version:2};const status=await f.service.status(f.A.sessionToken,next);assert.equal(status.pending.length,1);
 f.setFault(null);const recovered=await f.service.reconcile(f.A.sessionToken,{...next,command_id:c.command_id});assert.equal(recovered.state,'acknowledged');assert.equal(recovered.source_scope_version,1);assert.equal(Number((await f.db.query('SELECT profile_version FROM wonder_capture_commands WHERE household_id=$1 AND command_id=$2',[f.A.householdId,c.command_id])).rows[0].profile_version),1);assert.equal(Number((await f.db.query('SELECT count(*) n FROM request_source_scopes')).rows[0].n),1);await rejected(()=>f.service.save(f.A.sessionToken,c),'denied');
 await f.consent.withdraw(f.A.sessionToken,{command_id:randomUUID(),policy_version:policyVersion});await rejected(()=>f.service.status(f.A.sessionToken,next),'denied');
 await f.consent.record(f.A.sessionToken,{command_id:randomUUID(),policy_version:policyVersion,required_service:true,optional_contact:false,optional_story:false});await rejected(()=>f.service.status(f.A.sessionToken,next),'denied');
}));

test('encrypted journal, key loss/wrong key, duplicate open, replacement and corrupt tail fail closed',async()=>fixture(async f=>{
 const c=f.command();await f.service.save(f.A.sessionToken,c);const filename=join(f.directory,'wonder-journal.log'),bytes=await readFile(filename);
 for(const text of [c.question,c.parent_context])assert(!bytes.includes(Buffer.from(text)));for(const key of f.materials.values())assert(!bytes.includes(key));
 await assert.rejects(()=>createSyntheticWonderJournal({env,directory:f.directory}));
 const material=f.materials.get(f.A.householdId);f.materials.delete(f.A.householdId);await rejected(()=>f.service.save(f.A.sessionToken,c),'recovery_quarantined');f.materials.set(f.A.householdId,randomBytes(32));await rejected(()=>f.service.status(f.A.sessionToken,f.scope(f.A,f.one)),'recovery_quarantined');f.materials.set(f.A.householdId,material);
 await f.journal.close();await appendFile(filename,'invented corrupt tail');await assert.rejects(()=>createSyntheticWonderJournal({env,directory:f.directory}),e=>e.code==='recovery_quarantined');
}));

test('opened journal file replacement is not accepted as a fresh command history',async()=>fixture(async f=>{
 await f.service.save(f.A.sessionToken,f.command());await rename(join(f.directory,'wonder-journal.log'),join(f.directory,'invented-retired.log'));
 await rejected(()=>f.service.status(f.A.sessionToken,f.scope(f.A,f.one)));
}));

test('actual React and HTTP preserve save identity, recover pending correction after reload, and fence a withdrawn late acknowledgement',async()=>fixture(async f=>{
 const {createRequire,registerHooks}=await import('node:module'),{pathToFileURL}=await import('node:url');
 const require=createRequire(new URL('../package.json',import.meta.url)),{JSDOM}=require('jsdom');let React,createRoot,act;
 const family=await createSyntheticFamilySpace({env,db:f.db,access:f.access,policyVersion,
  content:{question:f.service.question,revision:async()=>{throw Error('No revision exists in this source-only fixture');}},
  play:{resume:async()=>{throw Error('No play exists in this source-only fixture');},reconcile:async()=>{throw Error('No play exists in this source-only fixture');}}});
 let holdSave=false,saveHeld=false,releaseSave,loseResponse=false,statusUnavailable=false,rootElement,hook,dom;
 const capture={...f.service,status:async(...args)=>{if(statusUnavailable)throw Error('Invented transient capture status outage');return f.service.status(...args);},save:async(...args)=>{const result=await f.service.save(...args);if(holdSave){holdSave=false;saveHeld=true;await new Promise(done=>releaseSave=done);}return result;}};
 const origin=await f.start({family,capture}),nativeFetch=globalThis.fetch,cookie='loop_adult_session='+f.A.sessionToken,commands=[];
 const names=['window','document','navigator','HTMLElement','Node','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch'];
 const prior=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const transport=async(route,options={})=>{
  if(String(route)==='/adult/wonder/save')commands.push(JSON.parse(options.body));
  const response=await nativeFetch(new URL(route,origin),{...options,headers:{...(options.headers??{}),Origin:origin,Cookie:cookie}});
  if(loseResponse&&String(route)==='/adult/wonder/save'){loseResponse=false;await response.arrayBuffer();throw Error('Invented delivery loss after real response');}
  return response;
 };
 try{
  dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:origin+'/loop-preview/family',pretendToBeVisual:true});
  for(const name of names)Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='fetch'?transport:dom.window[name],configurable:true,writable:true});
  for(const name of ['getItem','setItem','removeItem','clear'])dom.window.Storage.prototype[name]=()=>{throw Error('Private browser storage is forbidden');};
  React=require('react');({createRoot}=require('react-dom/client'));({act}=React);
  const homeURL=new URL('../app/LoopFamilyHome.tsx',import.meta.url).href,captureURL=new URL('../app/LoopWonderCapture.tsx',import.meta.url).href;
  hook=registerHooks({resolve(specifier,context,next){if(specifier==='./LoopWonderCapture')return{url:captureURL,shortCircuit:true};return next(specifier,context);},load(url,context,next){if(url.endsWith('.css'))return{format:'module',source:'',shortCircuit:true};if([homeURL,captureURL].includes(url)){const ts=require('typescript'),compiled=ts.transpileModule(require('node:fs').readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:new URL(url).pathname,reportDiagnostics:true});assert(!(compiled.diagnostics??[]).some(d=>d.category===ts.DiagnosticCategory.Error));return{format:'module',source:compiled.outputText,shortCircuit:true};}return next(url,context);}});
  const {default:Home}=await import(homeURL),pause=()=>new Promise(done=>setTimeout(done,15));
  const text=()=>document.body.textContent;
  async function until(check){for(let i=0;i<240;i++){await act(async()=>{await pause();});if(check())return;}throw Error('Actual capture UI condition timed out');}
  async function mount(){rootElement=createRoot(document.getElementById('root'));await act(async()=>rootElement.render(React.createElement(Home)));await until(()=>document.getElementById('family-child'));await act(async()=>{const select=document.getElementById('family-child');select.value='0';select.dispatchEvent(new Event('change',{bubbles:true}));});await until(()=>document.getElementById('wonder-title'));}
  async function click(label){const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert(button&&!button.disabled,'Required actual UI action is unavailable');await act(async()=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));}
  async function enter(id,value){await act(async()=>{const input=document.getElementById(id);assert(input);Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
  async function reviewAndConfirm(){await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Review saved-only wonder'&&!b.disabled));await click('Review saved-only wonder');await until(()=>document.getElementById('wonder-confirm-title'));await click('Confirm saved-only wonder');}
  await mount();await click('Start a wonder');await enter('family-wonder','  Invented UI question 🛶\n  ');await enter('family-wonder-context','Parent context stays separate.');
  statusUnavailable=true;await act(async()=>window.dispatchEvent(new Event('focus')));await until(()=>text().includes('Capture access could not be confirmed.'));
  const retainedQuestion=document.getElementById('family-wonder').value;
  statusUnavailable=false;await click('Retry capture access');await until(()=>!text().includes('Capture access could not be confirmed.'));
  assert.equal(document.getElementById('family-wonder').value,retainedQuestion);assert.equal(document.getElementById('family-wonder-context').value,'Parent context stays separate.');
  loseResponse=true;await reviewAndConfirm();
  await until(()=>text().includes('The response may have been lost.'));assert(!document.querySelector('[aria-label="Selected child space"]'));
  await click('Retry original save');await until(()=>text().includes('Wonder saved. No investigation has been requested.'));await until(()=>document.querySelector('[aria-label="Selected child space"]'));
  assert.equal(commands.length,2);assert.equal(commands[0].command_id,commands[1].command_id);assert.equal(Number((await f.db.query('SELECT count(*) n FROM wonder_requests')).rows[0].n),1);
  assert.equal((await f.service.status(f.A.sessionToken,f.scope(f.A,f.one))).saved[0].parent_context,'Parent context stays separate.');
  await click('Correct saved wonder 1');await enter('family-wonder','Distinct invented UI correction');f.setFault(async()=>{throw Error('Invented journal outage');});await reviewAndConfirm();await until(()=>text().includes('Pending confirmations'));
  assert(!document.querySelector('[aria-label="Selected child space"]'));assert(![...document.querySelectorAll('p.family-question')].some(p=>p.textContent.includes('Invented UI question')));
  const pending=await f.service.status(f.A.sessionToken,f.scope(f.A,f.one));assert.equal(pending.pending.length,1);const pendingId=pending.pending[0].command_id;
  await act(async()=>rootElement.unmount());rootElement=null;await mount();await until(()=>text().includes('Reconcile pending capture 1'));assert(!document.querySelector('[aria-label="Selected child space"]'));
  f.setFault(null);await click('Reconcile pending capture 1');await until(()=>text().includes('Wonder saved. No investigation has been requested.'));await until(()=>document.querySelector('[aria-label="Selected child space"]')?.textContent.includes('Distinct invented UI correction'));
  assert.equal(Number((await f.db.query('SELECT count(*) n FROM request_source_scopes')).rows[0].n),2);assert.equal((await f.service.reconcile(f.A.sessionToken,{...f.scope(f.A,f.one),command_id:pendingId})).source_scope_version,2);
  await f.db.query('UPDATE wonder_capture_throttle SET attempts=30 WHERE household_id=$1',[f.A.householdId]);
  await click('Start a wonder');await enter('family-wonder','Rejected invented question remains unsent');await reviewAndConfirm();
  await until(()=>text().includes('Save was not accepted. A local test limit was reached.'));
  assert(!text().includes('The response may have been lost.'));
  await until(()=>document.querySelector('[aria-label="Selected child space"]')?.textContent.includes('Distinct invented UI correction'));
  assert.equal(Number((await f.db.query('SELECT count(*) n FROM wonder_requests')).rows[0].n),1);
  await click('Discard page intent after checking pending commands');
  await f.db.query('UPDATE wonder_capture_throttle SET attempts=0 WHERE household_id=$1',[f.A.householdId]);
  await click('Start a wonder');await enter('family-wonder','Late invented acknowledgement must stay hidden');holdSave=true;await reviewAndConfirm();await until(()=>saveHeld);
  const withdrawn=await transport('/adult/consent/withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command_id:randomUUID(),policy_version:policyVersion})});assert.equal(withdrawn.status,200);
  await act(async()=>window.dispatchEvent(new Event('focus')));await until(()=>text().includes('Test permission needed'));await act(async()=>{releaseSave();await pause();});
  assert(!text().includes('Wonder saved.'));assert(!document.getElementById('family-wonder'));assert(!text().includes('Late invented acknowledgement'));assert.equal(dom.window.location.search+dom.window.location.hash,'');
 }finally{
  releaseSave?.();if(rootElement)await act(async()=>rootElement.unmount());hook?.deregister();dom?.window.close();
  for(const name of names){const descriptor=prior.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
 }
}));


test('capture producer preserves the accepted per-child family projection bound without blocking exact retries or corrections',async()=>fixture(async f=>{
 const original=f.command(),saved=await f.service.save(f.A.sessionToken,original);
 await f.db.transaction(async tx=>{
  for(let n=0;n<98;n++){
   const id=randomUUID();await tx.query('INSERT INTO wonder_requests(household_id,request_id,child_id,payload_ref) VALUES($1,$2,$3,$4)',[f.A.householdId,id,f.one.child_id,'synthetic:bounded-legacy']);
   await tx.query('INSERT INTO request_source_scopes(household_id,request_id,source_scope_version,payload_ref) VALUES($1,$2,1,$3)',[f.A.householdId,id,'synthetic:bounded-legacy']);
  }
 });
 const last=f.command(),lastResult=await f.service.save(f.A.sessionToken,last);assert.equal(lastResult.state,'acknowledged');
 await rejected(()=>f.service.save(f.A.sessionToken,f.command()),'rate_limited');
 assert.equal(Number((await f.db.query('SELECT count(*) n FROM wonder_requests WHERE household_id=$1 AND child_id=$2',[f.A.householdId,f.one.child_id])).rows[0].n),100);
 assert.deepEqual(await f.service.save(f.A.sessionToken,last),lastResult);
 assert.deepEqual(await f.service.save(f.A.sessionToken,original),saved);
 const correction={...f.command(),operation:'correct',request_id:saved.request_id,expected_source_scope_version:1,question:'A corrected bounded invented question'};
 assert.equal((await f.service.save(f.A.sessionToken,correction)).source_scope_version,2);
 assert.equal((await f.service.save(f.A.sessionToken,f.command(f.A,f.two))).state,'acknowledged');
 const family=await createSyntheticFamilySpace({env,db:f.db,access:f.access,policyVersion,content:{question:async(tx,ref)=>ref.payload_ref==='synthetic:bounded-legacy'?{question:'An invented legacy question'}:f.service.question(tx,ref),revision:async()=>{throw Error('No invented revisions');}},play:{resume:async()=>{throw Error('No invented plays');},reconcile:async()=>{throw Error('No invented plays');}}});
 const home=await family.read(f.A.sessionToken,{view_context:original.view_context,child_id:f.one.child_id});
 assert.equal(home.saved_wonders.length,100);assert.equal(home.requests.length,0);
 assert(home.saved_wonders.some(x=>x.question===correction.question));
}));
