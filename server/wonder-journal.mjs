// CODEX-04-A single-host synthetic recovery adapter; no production recovery claim.
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {types} from 'node:util';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';

const branded=new WeakSet(),directories=new Set();
export const wonderError=code=>Object.assign(new Error('Local synthetic wonder unavailable.'),{code,status:({validation_failed:400,denied:403,conflict:409,rate_limited:429})[code]??503});
export function ownData(value,required,optional=[]) {
 if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value))throw wonderError('validation_failed');
 if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw wonderError('validation_failed');
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors),out=Object.create(null);
 if(required.some(k=>!Object.hasOwn(descriptors,k))||keys.some(k=>typeof k!=='string'||!required.includes(k)&&!optional.includes(k)))throw wonderError('validation_failed');
 for(const k of keys){const d=descriptors[k];if(!d.enumerable||!Object.hasOwn(d,'value'))throw wonderError('validation_failed');out[k]=d.value;}
 return out;
}
export function environmentSnapshot(value){
 if(!value||typeof value!=='object'||types.isProxy(value))throw wonderError('validation_failed');
 const snapshot=ownData(value,[],Reflect.ownKeys(value));resolveLoopConfig(snapshot);return snapshot;
}
export function ownMethod(value,name){
 if(!value||typeof value!=='object'||types.isProxy(value))throw wonderError('validation_failed');
 const d=Object.getOwnPropertyDescriptor(value,name);
 if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='function')throw wonderError('validation_failed');
 return d.value.bind(value);
}
export function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(!value||typeof value!=='object'||types.isProxy(value))throw wonderError('validation_failed');
 if(Array.isArray(value)){
  const d=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(d).length!==value.length+1)throw wonderError('validation_failed');
  return '['+Array.from({length:value.length},(_,i)=>{const x=d[String(i)];if(!x?.enumerable||!Object.hasOwn(x,'value'))throw wonderError('validation_failed');return canonical(x.value);}).join(',')+']';
 }
 const v=ownData(value,[],Reflect.ownKeys(value));
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
export const isSyntheticWonderJournal=value=>branded.has(value);
export const wonderUUID=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function privateKey(value){
 if(types.isProxy(value)||!Buffer.isBuffer(value)||value.length!==32)throw wonderError('recovery_quarantined');
 return Buffer.from(value);
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const b64=(value,max)=>typeof value==='string'&&value.length<=max&&/^[A-Za-z0-9+/]*={0,2}$/.test(value)&&Buffer.from(value,'base64').toString('base64')===value;
export function recordHeader(record){return {version:record.version,synthetic_only:record.synthetic_only,record_id:record.record_id,household_id:record.household_id,command_id:record.command_id,canonical_digest:record.canonical_digest};}
export function recordMAC(record,key){
 return createHmac('sha256',key).update('wonder-journal-auth-v1\0').update(canonical({...recordHeader(record),envelope:record.envelope})).digest('hex');
}
function recordCopy(input){
 const r=ownData(input,['version','synthetic_only','record_id','household_id','command_id','canonical_digest','envelope','mac']);
 const e=ownData(r.envelope,['nonce','ciphertext','tag']);
 if(r.version!==1||r.synthetic_only!==true||['record_id','household_id','command_id'].some(k=>!wonderUUID(r[k])||r[k]!==r[k].toLowerCase())||!hex(r.canonical_digest)||!hex(r.mac)
  ||!b64(e.nonce,16)||Buffer.from(e.nonce,'base64').length!==12||!b64(e.tag,24)||Buffer.from(e.tag,'base64').length!==16||!b64(e.ciphertext,100000)||!e.ciphertext.length)throw wonderError('validation_failed');
 return JSON.parse(canonical({...r,envelope:{...e}}));
}
export function authenticateWonderRecord(input,key){
 const record=recordCopy(input),material=privateKey(key);
 try{if(!timingSafeEqual(Buffer.from(record.mac,'hex'),Buffer.from(recordMAC(record,material),'hex')))throw wonderError('recovery_quarantined');return record;}
 finally{material.fill(0);}
}
async function safeDirectory(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||path.resolve(directory)!==directory)throw wonderError('validation_failed');
 let cursor=directory;
 for(;;){const s=await lstat(cursor);if(s.isSymbolicLink()||!s.isDirectory())throw wonderError('recovery_quarantined');const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;}
 if(await realpath(directory)!==directory)throw wonderError('recovery_quarantined');
 const stat=await lstat(directory);
 if(typeof process.getuid==='function'&&(stat.uid!==process.getuid()||(stat.mode&0o022)!==0))throw wonderError('recovery_quarantined');
 return stat;
}

/** Existing exclusively owned directory; Windows ACL ownership remains a caller prerequisite. */
export async function createSyntheticWonderJournal(input){
 const options=ownData(input,['env','directory'],['testHooks']);environmentSnapshot(options.env);
 const {directory}=options;let hook;
 if(options.testHooks!==undefined){const h=ownData(options.testHooks,['beforeAppend']);if(typeof h.beforeAppend!=='function')throw wonderError('validation_failed');hook=h.beforeAppend;}
 let handle,owned=false,closing=false,closed=false,broken=false,tail=Promise.resolve();
 const filename=path.join(directory,'wonder-journal.log');
 try{
  const directoryStat=await safeDirectory(directory);
  if(directories.has(directory))throw wonderError('journal_unavailable');
  directories.add(directory);owned=true;
  try{const s=await lstat(filename);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw wonderError('recovery_quarantined');}catch(e){if(e.code!=='ENOENT')throw e;}
  handle=await open(filename,constants.O_RDWR|constants.O_APPEND|constants.O_CREAT|(constants.O_NOFOLLOW??0),0o600);
  const original=await handle.stat();
  if(!original.isFile()||original.nlink!==1||typeof process.getuid==='function'&&(original.uid!==process.getuid()||(original.mode&0o077)!==0))throw wonderError('recovery_quarantined');
  async function checkPath(){
   const d=await safeDirectory(directory),s=await lstat(filename),h=await handle.stat();
   if(d.dev!==directoryStat.dev||d.ino!==directoryStat.ino||!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.dev!==original.dev||s.ino!==original.ino||h.dev!==s.dev||h.ino!==s.ino)throw wonderError('recovery_quarantined');
  }
  async function load(){
   await checkPath();
   // Reopen for every verification, rather than verifying only the writer handle.
   const reader=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
   let bytes;
   try{
    const s=await reader.stat();if(s.dev!==original.dev||s.ino!==original.ino||s.nlink!==1||!Number.isSafeInteger(s.size)||s.size>64*1024*1024)throw wonderError('recovery_quarantined');
    bytes=Buffer.alloc(s.size);let offset=0;
    while(offset<bytes.length){const {bytesRead}=await reader.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)throw wonderError('recovery_quarantined');offset+=bytesRead;}
   }finally{await reader.close();}
   await checkPath();
   const records=new Map(),ids=new Set();let offset=0;
   while(offset<bytes.length){
    if(bytes.length-offset<75)throw wonderError('recovery_quarantined');
    const prefix=bytes.subarray(offset,offset+74).toString('ascii');
    if(!/^[0-9a-f]{8} [0-9a-f]{64} $/.test(prefix))throw wonderError('recovery_quarantined');
    const size=parseInt(prefix.slice(0,8),16),end=offset+74+size;
    if(size<2||size>131072||end>=bytes.length||bytes[end]!==10)throw wonderError('recovery_quarantined');
    const payload=bytes.subarray(offset+74,end);if(hash(payload)!==prefix.slice(9,73))throw wonderError('recovery_quarantined');
    let r;try{r=recordCopy(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload)));if(canonical(r)!==payload.toString('utf8'))throw Error();}catch{throw wonderError('recovery_quarantined');}
    const identity=r.household_id+':'+r.command_id;
    if(ids.has(r.record_id)||records.has(identity)||records.size>=10000)throw wonderError('recovery_quarantined');
    ids.add(r.record_id);records.set(identity,r);offset=end+1;
   }
   return records;
  }
  await load();
  function serial(work){
   if(closing||closed)return Promise.reject(wonderError('journal_unavailable'));
   const result=tail.then(async()=>{if(broken)throw wonderError('recovery_quarantined');try{return await work();}catch(e){if(e.code==='recovery_quarantined')broken=true;throw e;}});
   tail=result.catch(()=>{});return result;
  }
  const adapter=Object.freeze({
   append(input,key){
    let record,material;try{material=privateKey(key);record=authenticateWonderRecord(input,material);}catch(e){material?.fill(0);return Promise.reject(e);}
    return serial(async()=>{
     const records=await load(),prior=records.get(record.household_id+':'+record.command_id);
     for(const r of records.values())if(r.household_id===record.household_id)authenticateWonderRecord(r,material);
     if(prior){if(canonical(prior)!==canonical(record))throw wonderError('recovery_quarantined');return 'wonder-fsync:'+record.record_id;}
     if(records.size>=10000)throw wonderError('journal_unavailable');
     if(hook)try{await hook(structuredClone(record));}catch{throw wonderError('journal_unavailable');}
     await checkPath();const payload=Buffer.from(canonical(record),'utf8');
     if(payload.length>131072)throw wonderError('validation_failed');
     const frame=Buffer.concat([Buffer.from(payload.length.toString(16).padStart(8,'0')+' '+hash(payload)+' '),payload,Buffer.from('\n')]);
     if((await handle.stat()).size+frame.length>64*1024*1024)throw wonderError('journal_unavailable');
     try{let offset=0;while(offset<frame.length){const {bytesWritten}=await handle.write(frame,offset,frame.length-offset,null);if(!bytesWritten)throw Error();offset+=bytesWritten;}await handle.sync();
      const confirmed=(await load()).get(record.household_id+':'+record.command_id);
      if(!confirmed||canonical(authenticateWonderRecord(confirmed,material))!==canonical(record))throw Error();
     }catch{broken=true;throw wonderError('recovery_quarantined');}
     return 'wonder-fsync:'+record.record_id;
    }).finally(()=>material.fill(0));
   },
   records(householdId,key){
    if(!wonderUUID(householdId)||householdId!==householdId.toLowerCase())return Promise.reject(wonderError('validation_failed'));
    let material;try{material=privateKey(key);}catch(e){return Promise.reject(e);}
    return serial(async()=>{const result=[];for(const r of (await load()).values())if(r.household_id===householdId){if(result.length>=1000)throw wonderError('recovery_quarantined');result.push(authenticateWonderRecord(r,material));}return result;}).finally(()=>material.fill(0));
   },
   async close(){if(closed)return;closing=true;await tail;if(closed)return;closed=true;try{await handle.close();}finally{directories.delete(directory);}}
  });
  branded.add(adapter);return adapter;
 }catch(e){if(handle)await handle.close().catch(()=>{});if(owned)directories.delete(directory);throw wonderError(['validation_failed','recovery_quarantined','journal_unavailable'].includes(e?.code)?e.code:'journal_unavailable');}
}
