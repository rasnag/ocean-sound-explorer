// CODEX-04-B: dedicated single-process local synthetic committed-fact journal.
// No hosted durability, remote erasure or multi-host locking claim.
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash,createHmac,createCipheriv,createDecipheriv,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {ownData,ownMethod,environmentSnapshot,canonical,privateKey,uuid,parseStrictJSON} from './continuation-journal.mjs';
export {ownData,ownMethod,environmentSnapshot,canonical,privateKey,uuid,parseStrictJSON};

const brands=new WeakSet(),directories=new Set();
const MAX_FILE=16*1024*1024,MAX_LINE=131072,MAX_RECORDS=10000;
const FORMAT='production-committed-fact-v1';
export const productionError=code=>Object.assign(new Error('Local synthetic production unavailable.'),{code,status:({validation_failed:400,denied:403,conflict:409,ineligible:409,quota_full:409,no_capacity:409})[code]??503});
const fail=code=>{throw productionError(code);};
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200;
const positive=v=>Number.isSafeInteger(v)&&v>0;
const hash=v=>createHash('sha256').update(v).digest('hex');
export const keyed=(key,label,value)=>createHmac('sha256',key).update('production-v1\0'+label+'\0').update(canonical(value)).digest('hex');
export const isSyntheticProductionJournal=value=>brands.has(value);
const equalHex=(a,b)=>hex(a)&&hex(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const b64=(v,max)=>typeof v==='string'&&v.length<=max&&Buffer.from(v,'base64').toString('base64')===v;
const snapshot=v=>parseStrictJSON(canonical(v));
function time(v){
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v))fail('validation_failed');
 const n=Date.parse(v);if(!Number.isFinite(n)||new Date(n).toISOString()!==v.slice(0,-1)+'.000Z'||v.startsWith('0000-'))fail('validation_failed');return n;
}
function commandCopy(input){
 const c=ownData(input,['contract_version','record_type','command','idempotency_key','child_id','wonder_id','wonder_version','consent_epoch','offer_version','scope_version']);
 if(c.contract_version!=='1.1.0'||c.record_type!=='submit'||c.command!=='SubmitProduction'||!id(c.idempotency_key)||!uuid(c.child_id)||!uuid(c.wonder_id)||!uuid(c.offer_version)||!positive(c.wonder_version)||!positive(c.consent_epoch)||!positive(c.scope_version))fail('validation_failed');return snapshot(c);
}
function receiptCopy(input){
 const r=ownData(input,['receipt_id','request_id','booking_id','claim_id','period_id','original_received_at','original_due_at','deadline_interval_seconds']);
 if(['receipt_id','request_id','booking_id','claim_id','period_id'].some(k=>!uuid(r[k]))||r.deadline_interval_seconds!==86400||time(r.original_due_at)-time(r.original_received_at)!==86400000)fail('validation_failed');return snapshot(r);
}
function factCopy(input,namespace){
 const f=ownData(input,['format','household_id','adult_id','command_id','record_id','primary_commit_id','canonical_digest','namespace_verifier','command','receipt'],['binding']);
 if(f.format!==FORMAT||['household_id','adult_id','command_id','record_id','primary_commit_id'].some(k=>!uuid(f[k]))||!hex(f.canonical_digest)||f.namespace_verifier!==namespace)fail('validation_failed');
 f.command=commandCopy(f.command);f.receipt=receiptCopy(f.receipt);
 if(f.receipt.request_id!==f.command.wonder_id)fail('validation_failed');
 // Optional binding stores only the original authorization/source provenance.
 // It is encrypted along with the command and receipt; never rewritten on retry.
 if(f.binding!==undefined){
  const b=ownData(f.binding,['profile_version','consent_epoch','wonder_version','scope_version']);
  if(Object.values(b).some(v=>!positive(v))||b.consent_epoch!==f.command.consent_epoch||b.wonder_version!==f.command.wonder_version||b.scope_version!==f.command.scope_version)fail('validation_failed');f.binding=b;
 }
 return snapshot(f);
}
function header(r){return {version:r.version,household_id:r.household_id,command_id:r.command_id,record_id:r.record_id,primary_commit_id:r.primary_commit_id,canonical_digest:r.canonical_digest,namespace_verifier:r.namespace_verifier};}
function recordCopy(input){
 const r=ownData(input,['version','household_id','command_id','record_id','primary_commit_id','canonical_digest','namespace_verifier','nonce','ciphertext','tag']);
 if(r.version!==1||['household_id','command_id','record_id','primary_commit_id'].some(k=>!uuid(r[k]))||!hex(r.canonical_digest)||!hex(r.namespace_verifier)||!b64(r.nonce,16)||Buffer.from(r.nonce,'base64').length!==12||!b64(r.tag,24)||Buffer.from(r.tag,'base64').length!==16||!b64(r.ciphertext,100000)||!r.ciphertext.length)fail('recovery_quarantined');return snapshot(r);
}
async function safeDirectory(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||path.resolve(directory)!==directory)fail('validation_failed');
 for(let cursor=directory;;){const s=await lstat(cursor);if(s.isSymbolicLink()||!s.isDirectory())fail('recovery_quarantined');const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;}
 if(await realpath(directory)!==directory)fail('recovery_quarantined');const s=await lstat(directory);
 if(typeof process.getuid==='function'&&(s.uid!==process.getuid()||(s.mode&0o022)!==0))fail('recovery_quarantined');return s;
}

/** Existing exclusively owned directory. Keys: {keyForHousehold(household_id)}.
 * The callback returns a 32-byte Buffer synchronously; the journal copies it.
 * Windows ACL ownership is a caller prerequisite. Do not share this directory
 * between processes. Store namespace_verifier with primary committed facts.
 */
export async function createSyntheticProductionJournal(input){
 const options=ownData(input,['env','directory','keys'],['testHooks']);environmentSnapshot(options.env);
 ownData(options.keys,['keyForHousehold']);const keyForHousehold=ownMethod(options.keys,'keyForHousehold');
 let beforeAppend;if(options.testHooks!==undefined){const h=ownData(options.testHooks,['beforeAppend']);if(typeof h.beforeAppend!=='function')fail('validation_failed');beforeAppend=h.beforeAppend;}
 const directory=options.directory;if(typeof directory!=='string')fail('validation_failed');
 const filename=path.join(directory,'production-journal.log');
 let handle,owned=false,closing=false,closed=false,broken=false,tail=Promise.resolve(),namespace,manifestLine;
 function material(household,label){let key;try{key=privateKey(keyForHousehold(household));return createHmac('sha256',key).update('production-'+label+'-v1').digest();}catch{fail('recovery_quarantined');}finally{key?.fill(0);}}
 function frameMAC(frame){const key=material(frame.record.household_id,'frame');try{return createHmac('sha256',key).update(canonical(frame)).digest('hex');}finally{key.fill(0);}}
 function usable(){if(closing||closed)fail('journal_unavailable');if(broken)fail('recovery_quarantined');}
 function seal(inputFact){
  usable();const f=factCopy(inputFact,namespace),h={version:1,household_id:f.household_id,command_id:f.command_id,record_id:f.record_id,primary_commit_id:f.primary_commit_id,canonical_digest:f.canonical_digest,namespace_verifier:namespace};
  const key=material(h.household_id,'encryption'),nonce=randomBytes(12);
  try{const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(canonical(h)));const ciphertext=Buffer.concat([cipher.update(canonical(f),'utf8'),cipher.final()]);if(ciphertext.length>70000)fail('validation_failed');return recordCopy({...h,nonce:nonce.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')});}finally{key.fill(0);}
 }
 function decode(inputRecord){
  let key,bytes;
  try{
   const r=recordCopy(inputRecord);if(r.namespace_verifier!==namespace)fail('recovery_quarantined');key=material(r.household_id,'encryption');
   const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(r.nonce,'base64'));decipher.setAAD(Buffer.from(canonical(header(r))));decipher.setAuthTag(Buffer.from(r.tag,'base64'));
   bytes=Buffer.concat([decipher.update(Buffer.from(r.ciphertext,'base64')),decipher.final()]);
   const f=factCopy(parseStrictJSON(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),namespace);
   if(canonical(f)!==bytes.toString('utf8')||f.household_id!==r.household_id||f.command_id!==r.command_id||f.record_id!==r.record_id||f.primary_commit_id!==r.primary_commit_id||f.canonical_digest!==r.canonical_digest)fail('recovery_quarantined');return f;
  }catch{fail('recovery_quarantined');}finally{key?.fill(0);bytes?.fill(0);}
 }
 try{
  const directoryStat=await safeDirectory(directory);if(directories.has(directory))fail('journal_unavailable');directories.add(directory);owned=true;
  let exists=true;try{const s=await lstat(filename);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail('recovery_quarantined');}catch(e){if(e.code==='ENOENT')exists=false;else throw e;}
  // Never accept an existing zero-length file as a fresh history.
  handle=await open(filename,constants.O_RDWR|constants.O_APPEND|(exists?0:constants.O_CREAT|constants.O_EXCL)|(constants.O_NOFOLLOW??0),0o600);
  const original=await handle.stat();if(!original.isFile()||original.nlink!==1||typeof process.getuid==='function'&&(original.uid!==process.getuid()||(original.mode&0o077)!==0))fail('recovery_quarantined');
  async function checkPath(){const d=await safeDirectory(directory),s=await lstat(filename),h=await handle.stat();if(d.dev!==directoryStat.dev||d.ino!==directoryStat.ino||!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.dev!==original.dev||s.ino!==original.ino||h.dev!==s.dev||h.ino!==s.ino)fail('recovery_quarantined');}
  async function writeAll(bytes){let offset=0;while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,null);if(!bytesWritten)throw Error();offset+=bytesWritten;}await handle.sync();}
  if(!exists){
   manifestLine=canonical({format:'production-journal-v1',journal_id:randomUUID()});
   await writeAll(Buffer.from(manifestLine+'\n'));
   // Persist the newly created directory entry on platforms supporting it.
   if(process.platform!=='win32'){const d=await open(directory,constants.O_RDONLY);try{await d.sync();}finally{await d.close();}}
  }
  async function load(){
   await checkPath();const reader=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let bytes;
   try{const s=await reader.stat();if(s.dev!==original.dev||s.ino!==original.ino||s.nlink!==1||!Number.isSafeInteger(s.size)||s.size<1||s.size>MAX_FILE)fail('recovery_quarantined');bytes=Buffer.alloc(s.size);let offset=0;while(offset<bytes.length){const {bytesRead}=await reader.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)fail('recovery_quarantined');offset+=bytesRead;}}finally{await reader.close();}
   await checkPath();if(bytes.at(-1)!==10)fail('recovery_quarantined');
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('recovery_quarantined');}
   const lines=text.split('\n');lines.pop();const first=lines.shift();let manifest;
   try{manifest=ownData(parseStrictJSON(first),['format','journal_id']);}catch{fail('recovery_quarantined');}
   if(manifest.format!=='production-journal-v1'||!uuid(manifest.journal_id)||canonical(manifest)!==first||manifestLine!==undefined&&manifestLine!==first)fail('recovery_quarantined');
   manifestLine=first;const currentNamespace=hash('production-namespace-v1\0'+first);if(namespace!==undefined&&namespace!==currentNamespace)fail('recovery_quarantined');namespace=currentNamespace;
   const records=new Map(),ids=new Set(),commits=new Set();let sequence=0,previous=hash(first);
   for(const line of lines){
    if(Buffer.byteLength(line)>MAX_LINE||records.size>=MAX_RECORDS)fail('recovery_quarantined');let frame;
    try{frame=ownData(parseStrictJSON(line),['sequence','previous','record','mac']);}catch{fail('recovery_quarantined');}
    const r=recordCopy(frame.record),base={sequence:frame.sequence,previous:frame.previous,record:r};
    if(frame.sequence!==sequence+1||frame.previous!==previous||r.namespace_verifier!==namespace||!equalHex(frame.mac,frameMAC(base))||canonical(frame)!==line)fail('recovery_quarantined');
    decode(r);const identity=r.household_id+':'+r.command_id,commit=r.household_id+':'+r.primary_commit_id;
    if(records.has(identity)||ids.has(r.record_id)||commits.has(commit))fail('recovery_quarantined');
    records.set(identity,r);ids.add(r.record_id);commits.add(commit);sequence++;previous=frame.mac;
   }
   return {records,sequence,previous};
  }
  // Authenticate/decrypt ALL frames now, including a corrupt final frame.
  await load();
  function serial(work){
   if(closing||closed)return Promise.reject(productionError('journal_unavailable'));
   const result=tail.then(async()=>{if(broken)fail('recovery_quarantined');try{return await work();}catch(e){if(e?.code==='recovery_quarantined')broken=true;throw productionError(['validation_failed','journal_unavailable','recovery_quarantined'].includes(e?.code)?e.code:'journal_unavailable');}});
   tail=result.catch(()=>{});return result;
  }
  function append(inputRecord){
   let r;try{usable();r=recordCopy(inputRecord);decode(r);}catch(e){return Promise.reject(productionError(e?.code==='journal_unavailable'?'journal_unavailable':'recovery_quarantined'));}
   return serial(async()=>{
    const loaded=await load(),identity=r.household_id+':'+r.command_id,prior=loaded.records.get(identity);
    if(prior){if(canonical(prior)!==canonical(r))fail('recovery_quarantined');return 'production-fsync:'+r.record_id;}
    if(loaded.records.size>=MAX_RECORDS)fail('journal_unavailable');
    for(const old of loaded.records.values())if(old.record_id===r.record_id||old.household_id===r.household_id&&old.primary_commit_id===r.primary_commit_id)fail('recovery_quarantined');
    if(beforeAppend)try{await beforeAppend(snapshot(r));}catch{fail('journal_unavailable');}
    await checkPath();const base={sequence:loaded.sequence+1,previous:loaded.previous,record:r},frame={...base,mac:frameMAC(base)},bytes=Buffer.from(canonical(frame)+'\n');
    if(bytes.length>MAX_LINE||(await handle.stat()).size+bytes.length>MAX_FILE)fail('journal_unavailable');
    try{await writeAll(bytes);const confirmed=(await load()).records.get(identity);if(!confirmed||canonical(confirmed)!==canonical(r))throw Error();decode(confirmed);}catch{broken=true;fail('recovery_quarantined');}
    return 'production-fsync:'+r.record_id;
   });
  }
  const adapter=Object.freeze({namespace_verifier:namespace,seal,
   fact(inputRecord){usable();return decode(inputRecord);},
   append,
   // Reconciliation backfills only an exact primary-committed sealed record.
   // Authorization, primary existence, coverage and acknowledgement are owned
   // by the service. This operation never applies a domain command.
   reconcile:append,
   records(household){if(!uuid(household))return Promise.reject(productionError('validation_failed'));return serial(async()=>{const result=[];for(const r of (await load()).records.values())if(r.household_id===household)result.push(snapshot(r));return result;});},
   async close(){if(closed)return;closing=true;await tail;if(closed)return;closed=true;try{await handle.close();}finally{directories.delete(directory);}}
  });brands.add(adapter);return adapter;
 }catch(e){if(handle)await handle.close().catch(()=>{});if(owned)directories.delete(directory);throw productionError(['validation_failed','journal_unavailable','recovery_quarantined'].includes(e?.code)?e.code:'journal_unavailable');}
}
