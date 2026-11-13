// CODEX-04-C: encrypted PRIMARY-COMMITTED facts, local synthetic only.
// Single process / exclusive directory. No hosted or multi-host durability claim.
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {types} from 'node:util';
import {createHash,createHmac,createCipheriv,createDecipheriv,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {ownData,ownMethod,environmentSnapshot,canonical,privateKey,uuid,parseStrictJSON} from './continuation-journal.mjs';

const directories=new Set();
const MAX_FILE=16*1024*1024,MAX_LINE=140000,MAX_RECORDS=10000;
const MAX_PRIVATE_BYTES=60000,MAX_FACT_BYTES=70000,MAX_NODES=4096,MAX_DEPTH=8;
const FACT='queue-committed-fact-v1';
const FACT_FIELDS=['format','scope','household_id','consent_epoch','record_id','command_id',
 'primary_commit_id','actor_id','actor_kind','original_session_hash','recorded_at',
 'aggregate_version','canonical_digest','namespace_verifier','command','result','effect'];
const HEADER_FIELDS=['version','scope','household_id','command_id','record_id','primary_commit_id','canonical_digest','namespace_verifier'];
const RECORD_FIELDS=[...HEADER_FIELDS,'nonce','ciphertext','tag'];
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const hash=v=>createHash('sha256').update(v).digest('hex');
const equalHex=(a,b)=>hex(a)&&hex(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const b64=(v,max)=>typeof v==='string'&&v.length<=max&&/^[A-Za-z0-9+/]*={0,2}$/.test(v)&&Buffer.from(v,'base64').toString('base64')===v;
export const queueJournalError=code=>Object.assign(new Error('Local synthetic queue journal unavailable.'),{
 code,status:({validation_failed:400,denied:403,conflict:409})[code]??503
});
const fail=code=>{throw queueJournalError(code);};
const copy=v=>parseStrictJSON(canonical(v));
const identity=r=>(r.scope==='operator'?'operator':r.household_id)+':'+r.command_id;
const scopeId=r=>r.scope==='operator'?'operator':r.household_id;
function validScope(scope,household){return scope==='household'&&uuid(household)||scope==='operator'&&household===null;}
function header(r){return Object.fromEntries(HEADER_FIELDS.map(k=>[k,r[k]]));}
function canonicalTime(v){
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||v.startsWith('0000-'))return false;
 const n=Date.parse(v);return Number.isFinite(n)&&new Date(n).toISOString()===v;
}

// Inspect descriptors before reading values. Never invoke toJSON, iterators,
// accessors or proxy traps. JSON text duplicate keys are rejected by the shared
// strict parser before this validation on decrypt; an object cannot retain two
// own members with the same name. HTTP parsing remains the service's duty.
function privateObject(input,budget){
 function visit(v,depth){
  if(++budget.nodes>MAX_NODES||depth>MAX_DEPTH)fail('validation_failed');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='string'){if(v.length>16000)fail('validation_failed');return v;}
  if(typeof v==='number'){if(!Number.isFinite(v))fail('validation_failed');return Object.is(v,-0)?0:v;}
  if(!v||typeof v!=='object'||types.isProxy(v))fail('validation_failed');
  if(budget.active.has(v))fail('validation_failed');
  budget.active.add(v);
  try{
   if(Array.isArray(v)){
    const d=Object.getOwnPropertyDescriptors(v),length=d.length;
    if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value>1024
      ||Reflect.ownKeys(d).length!==length.value+1)fail('validation_failed');
    const out=[];
    for(let i=0;i<length.value;i++){
     const item=d[String(i)];if(!item?.enumerable||!Object.hasOwn(item,'value'))fail('validation_failed');
     out.push(visit(item.value,depth+1));
    }
    return out;
   }
   const d=ownData(v,[],Reflect.ownKeys(v)),out=Object.create(null),names=Object.keys(d);
   if(names.length>256)fail('validation_failed');
   for(const name of names){
    if(name.length>200||['__proto__','prototype','constructor'].includes(name))fail('validation_failed');
    out[name]=visit(d[name],depth+1);
   }
   return out;
  }finally{budget.active.delete(v);}
 }
 if(!input||typeof input!=='object'||types.isProxy(input)||Array.isArray(input))fail('validation_failed');
 return visit(input,0);
}
function factCopy(input,namespace){
 let f;
 try{f=ownData(input,FACT_FIELDS);}catch{fail('validation_failed');}
 if(f.format!==FACT||!validScope(f.scope,f.household_id)
   ||['record_id','command_id','primary_commit_id','actor_id'].some(k=>!uuid(f[k]))
   ||!(f.scope==='household'?positive(f.consent_epoch):f.consent_epoch===0)
   ||!['founder','parent'].includes(f.actor_kind)||f.scope==='operator'&&f.actor_kind!=='founder'
   ||!hex(f.original_session_hash)||!canonicalTime(f.recorded_at)||!positive(f.aggregate_version)
   ||!hex(f.canonical_digest)||!hex(f.namespace_verifier)||f.namespace_verifier!==namespace)fail('validation_failed');
 const budget={nodes:0,active:new Set()};
 f.command=privateObject(f.command,budget);f.result=privateObject(f.result,budget);f.effect=privateObject(f.effect,budget);
 if(Buffer.byteLength(canonical({command:f.command,result:f.result,effect:f.effect}))>MAX_PRIVATE_BYTES
   ||Buffer.byteLength(canonical(f))>MAX_FACT_BYTES)fail('validation_failed');
 return copy(f);
}
function recordCopy(input){
 let r;try{r=ownData(input,RECORD_FIELDS);}catch{fail('recovery_quarantined');}
 if(r.version!==1||!validScope(r.scope,r.household_id)
   ||['command_id','record_id','primary_commit_id'].some(k=>!uuid(r[k]))
   ||!hex(r.canonical_digest)||!hex(r.namespace_verifier)
   ||!b64(r.nonce,16)||Buffer.from(r.nonce,'base64').length!==12
   ||!b64(r.tag,24)||Buffer.from(r.tag,'base64').length!==16
   ||!b64(r.ciphertext,100000)||!r.ciphertext.length)fail('recovery_quarantined');
 return copy(r);
}
async function safeDirectory(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||path.resolve(directory)!==directory)fail('validation_failed');
 for(let cursor=directory;;){
  const s=await lstat(cursor);if(s.isSymbolicLink()||!s.isDirectory())fail('recovery_quarantined');
  const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
 }
 if(await realpath(directory)!==directory)fail('recovery_quarantined');
 const s=await lstat(directory);
 if(typeof process.getuid==='function'&&(s.uid!==process.getuid()||(s.mode&0o022)!==0))fail('recovery_quarantined');
 return s;
}

/** Existing exclusively owned directory. Exact trusted key adapter:
 * {keyForHousehold(uuid): Buffer32, keyForOperator(): Buffer32}.
 * Keys are synchronous, copied, separately domain-derived and zeroed locally.
 * Windows ACL ownership/exclusive process access are setup prerequisites.
 * The namespace is a persisted random journal identity, not a content digest.
 */
export async function createSyntheticQueueJournal(input){
 let options,keyForHousehold,keyForOperator,beforeAppend;
 try{
  options=ownData(input,['env','directory','keys'],['testHooks']);environmentSnapshot(options.env);
  ownData(options.keys,['keyForHousehold','keyForOperator']);
  keyForHousehold=ownMethod(options.keys,'keyForHousehold');keyForOperator=ownMethod(options.keys,'keyForOperator');
  if(options.testHooks!==undefined){
   const h=ownData(options.testHooks,['beforeAppend']);if(typeof h.beforeAppend!=='function')fail('validation_failed');beforeAppend=h.beforeAppend;
  }
 }catch{fail('validation_failed');}
 const directory=options.directory;
 let handle,owned=false,closing=false,closed=false,broken=false,tail=Promise.resolve();
 let namespace,manifestLine;
 const filename=typeof directory==='string'?path.join(directory,'queue-journal.log'):null;
 function material(r,label){
  let key;
  try{
   // There is deliberately no fallback from operator to household material.
   key=privateKey(r.scope==='operator'?keyForOperator():keyForHousehold(r.household_id));
   return createHmac('sha256',key).update('queue-v1\0'+r.scope+'\0'+label+'\0'+namespace).digest();
  }catch{fail('recovery_quarantined');}finally{key?.fill(0);}
 }
 function frameMAC(frame){
  const key=material(frame.record,'frame');
  try{return createHmac('sha256',key).update(canonical(frame)).digest('hex');}finally{key.fill(0);}
 }
 function usable(){if(closing||closed)fail('journal_unavailable');if(broken)fail('recovery_quarantined');}
 function seal(inputFact){
  usable();const f=factCopy(inputFact,namespace);
  const h={version:1,scope:f.scope,household_id:f.household_id,command_id:f.command_id,
   record_id:f.record_id,primary_commit_id:f.primary_commit_id,canonical_digest:f.canonical_digest,namespace_verifier:namespace};
  const key=material(h,'encryption'),nonce=randomBytes(12);
  try{
   const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(canonical(h)));
   const bytes=Buffer.from(canonical(f));
   try{
    const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
    return recordCopy({...h,nonce:nonce.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')});
   }finally{bytes.fill(0);}
  }finally{key.fill(0);}
 }
 function decode(inputRecord){
  let key,bytes;
  try{
   const r=recordCopy(inputRecord);if(r.namespace_verifier!==namespace)fail('recovery_quarantined');
   key=material(r,'encryption');
   const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(r.nonce,'base64'));
   decipher.setAAD(Buffer.from(canonical(header(r))));decipher.setAuthTag(Buffer.from(r.tag,'base64'));
   bytes=Buffer.concat([decipher.update(Buffer.from(r.ciphertext,'base64')),decipher.final()]);
   if(bytes.length>MAX_FACT_BYTES)fail('recovery_quarantined');
   const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),f=factCopy(parseStrictJSON(text),namespace);
   if(canonical(f)!==text||f.scope!==r.scope||f.household_id!==r.household_id
    ||f.command_id!==r.command_id||f.record_id!==r.record_id||f.primary_commit_id!==r.primary_commit_id
    ||f.canonical_digest!==r.canonical_digest)fail('recovery_quarantined');
   return f;
  }catch{fail('recovery_quarantined');}finally{key?.fill(0);bytes?.fill(0);}
 }
 try{
  const directoryStat=await safeDirectory(directory);
  if(directories.has(directory))fail('journal_unavailable');directories.add(directory);owned=true;
  let exists=true;
  try{const s=await lstat(filename);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail('recovery_quarantined');}
  catch(e){if(e.code==='ENOENT')exists=false;else throw e;}
  handle=await open(filename,constants.O_RDWR|constants.O_APPEND|(exists?0:constants.O_CREAT|constants.O_EXCL)|(constants.O_NOFOLLOW??0),0o600);
  const original=await handle.stat();
  if(!original.isFile()||original.nlink!==1||typeof process.getuid==='function'&&(original.uid!==process.getuid()||(original.mode&0o077)!==0))fail('recovery_quarantined');
  async function checkPath(){
   const d=await safeDirectory(directory),s=await lstat(filename),h=await handle.stat();
   if(d.dev!==directoryStat.dev||d.ino!==directoryStat.ino||!s.isFile()||s.isSymbolicLink()||s.nlink!==1
    ||s.dev!==original.dev||s.ino!==original.ino||h.dev!==s.dev||h.ino!==s.ino)fail('recovery_quarantined');
  }
  async function writeAll(bytes){
   let offset=0;
   while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,null);if(!bytesWritten)throw Error();offset+=bytesWritten;}
   await handle.sync();
  }
  if(!exists){
   manifestLine=canonical({format:'queue-journal-v1',journal_id:randomUUID()});
   await writeAll(Buffer.from(manifestLine+'\n'));
   if(process.platform!=='win32'){
    const d=await open(directory,constants.O_RDONLY);try{await d.sync();}finally{await d.close();}
   }
  }
  async function load(){
   await checkPath();const reader=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let bytes;
   try{
    const s=await reader.stat();
    if(s.dev!==original.dev||s.ino!==original.ino||s.nlink!==1||!Number.isSafeInteger(s.size)||s.size<1||s.size>MAX_FILE)fail('recovery_quarantined');
    bytes=Buffer.alloc(s.size);let offset=0;
    while(offset<bytes.length){const {bytesRead}=await reader.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)fail('recovery_quarantined');offset+=bytesRead;}
   }finally{await reader.close();}
   await checkPath();if(bytes.at(-1)!==10)fail('recovery_quarantined');
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('recovery_quarantined');}
   const lines=text.split('\n');lines.pop();const first=lines.shift();let manifest;
   try{manifest=ownData(parseStrictJSON(first),['format','journal_id']);}catch{fail('recovery_quarantined');}
   if(manifest.format!=='queue-journal-v1'||!uuid(manifest.journal_id)||canonical(manifest)!==first
    ||manifestLine!==undefined&&manifestLine!==first)fail('recovery_quarantined');
   manifestLine=first;const currentNamespace=hash('queue-namespace-v1\0'+first);
   if(namespace!==undefined&&namespace!==currentNamespace)fail('recovery_quarantined');namespace=currentNamespace;
   const records=new Map(),ids=new Set(),commits=new Set();let sequence=0,previous=hash(first);
   for(const line of lines){
    if(Buffer.byteLength(line)>MAX_LINE||records.size>=MAX_RECORDS)fail('recovery_quarantined');
    let frame;try{frame=ownData(parseStrictJSON(line),['sequence','previous','record','mac']);}catch{fail('recovery_quarantined');}
    const r=recordCopy(frame.record),base={sequence:frame.sequence,previous:frame.previous,record:r};
    if(frame.sequence!==sequence+1||frame.previous!==previous||r.namespace_verifier!==namespace
     ||!equalHex(frame.mac,frameMAC(base))||canonical(frame)!==line)fail('recovery_quarantined');
    decode(r);
    const id=identity(r),commit=scopeId(r)+':'+r.primary_commit_id;
    if(records.has(id)||ids.has(r.record_id)||commits.has(commit))fail('recovery_quarantined');
    records.set(id,r);ids.add(r.record_id);commits.add(commit);sequence++;previous=frame.mac;
   }
   return {records,sequence,previous};
  }
  // Authenticate and decrypt every persisted fact, including the final frame.
  // Wrong keys/corrupt tails fail without writing, truncating or renaming bytes.
  await load();
  function serial(work){
   if(closing||closed)return Promise.reject(queueJournalError('journal_unavailable'));
   const result=tail.then(async()=>{
    if(broken)fail('recovery_quarantined');
    try{return await work();}catch(e){
     if(e?.code==='recovery_quarantined')broken=true;
     throw queueJournalError(['validation_failed','conflict','journal_unavailable','recovery_quarantined'].includes(e?.code)?e.code:'journal_unavailable');
    }
   });tail=result.catch(()=>{});return result;
  }
  function append(inputRecord){
   let r,f;
   try{usable();r=recordCopy(inputRecord);f=decode(r);}
   catch(e){return Promise.reject(queueJournalError(e?.code==='journal_unavailable'?'journal_unavailable':'recovery_quarantined'));}
   return serial(async()=>{
    const loaded=await load(),id=identity(r),prior=loaded.records.get(id);
    if(prior){
     // Equality is equality of authenticated committed facts, not random nonce.
     // Resealing the exact same fact is an idempotent retry.
     if(canonical(decode(prior))!==canonical(f))fail('conflict');
     return 'queue-fsync:'+prior.record_id;
    }
    if(loaded.records.size>=MAX_RECORDS)fail('journal_unavailable');
    for(const old of loaded.records.values()){
     if(old.record_id===r.record_id||scopeId(old)===scopeId(r)&&old.primary_commit_id===r.primary_commit_id)fail('conflict');
    }
    if(beforeAppend)try{await beforeAppend(copy(r));}catch{fail('journal_unavailable');}
    await checkPath();
    const base={sequence:loaded.sequence+1,previous:loaded.previous,record:r};
    const bytes=Buffer.from(canonical({...base,mac:frameMAC(base)})+'\n');
    if(bytes.length>MAX_LINE||(await handle.stat()).size+bytes.length>MAX_FILE)fail('journal_unavailable');
    try{
     await writeAll(bytes);
     const confirmed=(await load()).records.get(id);
     if(!confirmed||canonical(confirmed)!==canonical(r)||canonical(decode(confirmed))!==canonical(f))throw Error();
    }catch{broken=true;fail('recovery_quarantined');}
    return 'queue-fsync:'+r.record_id;
   });
  }
  let closePromise;
  return Object.freeze({namespace_verifier:namespace,seal,append,
   fact(inputRecord){usable();return decode(inputRecord);},
   records(scope){
    if(scope!=='operator'&&!uuid(scope))return Promise.reject(queueJournalError('validation_failed'));
    return serial(async()=>{
     const out=[];for(const r of (await load()).records.values())if(scopeId(r)===scope)out.push(copy(r));return out;
    });
   },
   close(){
    if(closePromise)return closePromise;
    closing=true;
    closePromise=(async()=>{await tail;try{await handle.close();}finally{closed=true;directories.delete(directory);}})();
    return closePromise;
   }
  });
 }catch(e){
  if(handle)await handle.close().catch(()=>{});
  if(owned)directories.delete(directory);
  throw queueJournalError(['validation_failed','journal_unavailable','recovery_quarantined'].includes(e?.code)?e.code:'journal_unavailable');
 }
}
