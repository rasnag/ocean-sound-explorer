// Dedicated synthetic committed-fact journal. No capture-journal dependency.
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {types} from 'node:util';
import {createHmac,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
const brands=new WeakSet(),directories=new Set();
export const continuationError=code=>Object.assign(new Error('Local synthetic continuation unavailable.'),{code,status:({validation_failed:400,denied:403,conflict:409,ineligible:409,configuration_missing:503,recovery_quarantined:503,journal_unavailable:503})[code]??503});
const fail=code=>{throw continuationError(code);};
export function ownData(value,required,optional=[]){
 if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('validation_failed');
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors),out=Object.create(null);
 if(required.some(k=>!Object.hasOwn(descriptors,k))||keys.some(k=>typeof k!=='string'||!required.includes(k)&&!optional.includes(k)))fail('validation_failed');
 for(const k of keys){const d=descriptors[k];if(!d.enumerable||!Object.hasOwn(d,'value'))fail('validation_failed');out[k]=d.value;}
 return out;
}
export function ownMethod(value,name){
 if(!value||typeof value!=='object'||types.isProxy(value))fail('validation_failed');
 const d=Object.getOwnPropertyDescriptor(value,name);if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='function')fail('validation_failed');return d.value.bind(value);
}
export function environmentSnapshot(value){
 if(!value||typeof value!=='object'||types.isProxy(value))fail('validation_failed');
 const v=ownData(value,[],Reflect.ownKeys(value));resolveLoopConfig(v);return v;
}
export function canonical(v){
 if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(!v||typeof v!=='object'||types.isProxy(v))fail('validation_failed');
 if(Array.isArray(v)){
  const d=Object.getOwnPropertyDescriptors(v);if(Reflect.ownKeys(d).length!==v.length+1)fail('validation_failed');
  return '['+Array.from({length:v.length},(_,i)=>{const x=d[String(i)];if(!x?.enumerable||!Object.hasOwn(x,'value'))fail('validation_failed');return canonical(x.value);}).join(',')+']';
 }
 const data=ownData(v,[],Reflect.ownKeys(v));return '{'+Object.keys(data).sort().map(k=>JSON.stringify(k)+':'+canonical(data[k])).join(',')+'}';
}
export function privateKey(v){if(types.isProxy(v)||!Buffer.isBuffer(v)||v.length!==32)fail('recovery_quarantined');return Buffer.from(v);}
export const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export const namespaceVerifier=key=>createHmac('sha256',key).update('continuation-fixture-namespace-v1').digest('hex');
export const keyed=(key,label,value)=>createHmac('sha256',key).update(label+'\0').update(canonical(value)).digest('hex');
export const isSyntheticContinuationJournal=v=>brands.has(v);
// Strict JSON for the new HTTP routes: decoded duplicate member names are rejected.
export function parseStrictJSON(text){
 let i=0;const white=()=>{while(/[\x20\t\r\n]/.test(text[i]??'')&&i<text.length)i++;};
 function string(){const start=i++;let escaped=false;for(;i<text.length;i++){const ch=text[i];if(!escaped&&ch==='"'){i++;return JSON.parse(text.slice(start,i));}if(!escaped&&ch==='\\')escaped=true;else escaped=false;}throw Error();}
 function value(depth){
  if(depth>12)throw Error();white();const ch=text[i];
  if(ch==='"')return string();
  if(ch==='{'){i++;white();const out=Object.create(null),seen=new Set();if(text[i]==='}'){i++;return out;}for(;;){white();if(text[i]!=='"')throw Error();const key=string();if(seen.has(key))throw Error();seen.add(key);white();if(text[i++]!==':')throw Error();out[key]=value(depth+1);white();const end=text[i++];if(end==='}')return out;if(end!==',')throw Error();}}
  if(ch==='['){i++;white();const out=[];if(text[i]===']'){i++;return out;}for(;;){out.push(value(depth+1));white();const end=text[i++];if(end===']')return out;if(end!==',')throw Error();}}
  const match=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(i));if(!match)throw Error();i+=match[0].length;const v=JSON.parse(match[0]);if(typeof v==='number'&&!Number.isFinite(v))throw Error();return v;
 }
 try{if(typeof text!=='string')throw Error();const out=value(0);white();if(i!==text.length)throw Error();return out;}catch{fail('validation_failed');}
}
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const b64=(v,n)=>typeof v==='string'&&v.length<=n&&Buffer.from(v,'base64').toString('base64')===v;
function header(r){return {version:r.version,household_id:r.household_id,command_id:r.command_id,record_id:r.record_id,primary_commit_id:r.primary_commit_id,canonical_digest:r.canonical_digest,namespace_verifier:r.namespace_verifier};}
function recordCopy(input){
 const r=ownData(input,['version','household_id','command_id','record_id','primary_commit_id','canonical_digest','namespace_verifier','nonce','ciphertext','tag']);
 if(r.version!==1||['household_id','command_id','record_id','primary_commit_id'].some(k=>!uuid(r[k]))||!hex(r.canonical_digest)||!hex(r.namespace_verifier)||!b64(r.nonce,16)||Buffer.from(r.nonce,'base64').length!==12||!b64(r.tag,24)||Buffer.from(r.tag,'base64').length!==16||!b64(r.ciphertext,40000)||!r.ciphertext.length)fail('recovery_quarantined');
 return JSON.parse(canonical(r));
}
async function safeDirectory(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||path.resolve(directory)!==directory)fail('validation_failed');
 for(let cursor=directory;;){const s=await lstat(cursor);if(s.isSymbolicLink()||!s.isDirectory())fail('recovery_quarantined');const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;}
 if(await realpath(directory)!==directory)fail('recovery_quarantined');const s=await lstat(directory);
 if(typeof process.getuid==='function'&&(s.uid!==process.getuid()||(s.mode&0o022)!==0))fail('recovery_quarantined');return s;
}
/** Existing exclusively owned directory and injected fixture keys only.
 * Single-process writer; Windows ACL ownership is an explicit setup prerequisite.
 */
export async function createSyntheticContinuationJournal(input){
 const options=ownData(input,['env','directory','keys'],['testHooks']);environmentSnapshot(options.env);
 const k=ownData(options.keys,['keyForHousehold','receiptDedupeKey']),keyForHousehold=ownMethod(options.keys,'keyForHousehold'),globalKey=privateKey(k.receiptDedupeKey),namespace=namespaceVerifier(globalKey);
 let beforeAppend;if(options.testHooks!==undefined){const h=ownData(options.testHooks,['beforeAppend']);if(typeof h.beforeAppend!=='function')fail('validation_failed');beforeAppend=h.beforeAppend;}
 const directory=options.directory,filename=path.join(directory,'continuation-journal.log');
 let handle,owned=false,closing=false,closed=false,broken=false,tail=Promise.resolve();
 const mac=v=>keyed(globalKey,'continuation-frame-v1',v);
 function seal(fact){
  const snapshot=JSON.parse(canonical(fact));if(snapshot.format!=='continuation-committed-fact-v1'||snapshot.namespace_verifier!==namespace)fail('validation_failed');
  const h={version:1,household_id:snapshot.command.household_id,command_id:snapshot.command.command_id,record_id:snapshot.record_id,primary_commit_id:snapshot.primary_commit_id,canonical_digest:snapshot.canonical_digest,namespace_verifier:namespace};
  const key=privateKey(keyForHousehold(h.household_id)),material=createHmac('sha256',key).update('continuation-encryption-v1').digest(),nonce=randomBytes(12);
  try{const cipher=createCipheriv('aes-256-gcm',material,nonce);cipher.setAAD(Buffer.from(canonical(h)));const ciphertext=Buffer.concat([cipher.update(canonical(snapshot),'utf8'),cipher.final()]);return recordCopy({...h,nonce:nonce.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')});}finally{key.fill(0);material.fill(0);}
 }
 function fact(input){
  const r=recordCopy(input);if(r.namespace_verifier!==namespace)fail('recovery_quarantined');
  let key,material;
  try{key=privateKey(keyForHousehold(r.household_id));material=createHmac('sha256',key).update('continuation-encryption-v1').digest();const decipher=createDecipheriv('aes-256-gcm',material,Buffer.from(r.nonce,'base64'));decipher.setAAD(Buffer.from(canonical(header(r))));decipher.setAuthTag(Buffer.from(r.tag,'base64'));const bytes=Buffer.concat([decipher.update(Buffer.from(r.ciphertext,'base64')),decipher.final()]);const v=parseStrictJSON(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(canonical(v)!==bytes.toString('utf8')||v.format!=='continuation-committed-fact-v1'||v.command?.household_id!==r.household_id||v.command?.command_id!==r.command_id||v.record_id!==r.record_id||v.primary_commit_id!==r.primary_commit_id||v.canonical_digest!==r.canonical_digest||v.namespace_verifier!==namespace)fail('recovery_quarantined');return v;}catch{fail('recovery_quarantined');}finally{key?.fill(0);material?.fill(0);}
 }
 try{
  const directoryStat=await safeDirectory(directory);if(directories.has(directory))fail('journal_unavailable');directories.add(directory);owned=true;
  try{const s=await lstat(filename);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail('recovery_quarantined');}catch(e){if(e.code!=='ENOENT')throw e;}
  handle=await open(filename,constants.O_RDWR|constants.O_APPEND|constants.O_CREAT|(constants.O_NOFOLLOW??0),0o600);const original=await handle.stat();
  if(!original.isFile()||original.nlink!==1||typeof process.getuid==='function'&&(original.uid!==process.getuid()||(original.mode&0o077)!==0))fail('recovery_quarantined');
  async function checkPath(){const d=await safeDirectory(directory),s=await lstat(filename),h=await handle.stat();if(d.dev!==directoryStat.dev||d.ino!==directoryStat.ino||!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.dev!==original.dev||s.ino!==original.ino||h.dev!==s.dev||h.ino!==s.ino)fail('recovery_quarantined');}
  async function load(){
   await checkPath();const reader=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let bytes;
   try{const s=await reader.stat();if(s.dev!==original.dev||s.ino!==original.ino||s.nlink!==1||!Number.isSafeInteger(s.size)||s.size>16*1024*1024)fail('recovery_quarantined');bytes=Buffer.alloc(s.size);let offset=0;while(offset<bytes.length){const {bytesRead}=await reader.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)fail('recovery_quarantined');offset+=bytesRead;}}finally{await reader.close();}
   await checkPath();if(bytes.length&&bytes.at(-1)!==10)fail('recovery_quarantined');const records=new Map(),ids=new Set();let sequence=0,previous='0'.repeat(64);
   for(const line of bytes.toString('utf8').split('\n').slice(0,-1)){
    let frame;try{if(line.length>65536)throw Error();frame=ownData(parseStrictJSON(line),['sequence','previous','record','mac']);}catch{fail('recovery_quarantined');}
    if(frame.sequence!==sequence+1||frame.previous!==previous||!hex(frame.mac)||mac({sequence:frame.sequence,previous:frame.previous,record:frame.record})!==frame.mac||canonical(frame)!==line)fail('recovery_quarantined');
    const r=recordCopy(frame.record),id=r.household_id+':'+r.command_id;if(r.namespace_verifier!==namespace||records.has(id)||ids.has(r.record_id)||records.size>=10000)fail('recovery_quarantined');records.set(id,r);ids.add(r.record_id);sequence++;previous=frame.mac;
   }
   return {records,sequence,previous};
  }
  await load();
  function serial(work){if(closing||closed)return Promise.reject(continuationError('journal_unavailable'));const result=tail.then(async()=>{if(broken)fail('recovery_quarantined');try{return await work();}catch(e){if(e.code==='recovery_quarantined')broken=true;throw e;}});tail=result.catch(()=>{});return result;}
  const adapter=Object.freeze({namespace_verifier:namespace,seal,fact,
   append(input){let record;try{record=recordCopy(input);fact(record);}catch(e){return Promise.reject(e);}return serial(async()=>{
    const loaded=await load(),id=record.household_id+':'+record.command_id,prior=loaded.records.get(id);
    if(prior){if(canonical(prior)!==canonical(record))fail('recovery_quarantined');fact(prior);return 'continuation-fsync:'+record.record_id;}
    if(loaded.records.size>=10000)fail('journal_unavailable');
    if(beforeAppend)try{await beforeAppend(structuredClone(record));}catch{fail('journal_unavailable');}
    await checkPath();const frame={sequence:loaded.sequence+1,previous:loaded.previous,record};const bytes=Buffer.from(canonical({...frame,mac:mac(frame)})+'\n');
    if(bytes.length>65536||(await handle.stat()).size+bytes.length>16*1024*1024)fail('journal_unavailable');
    try{let offset=0;while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,null);if(!bytesWritten)throw Error();offset+=bytesWritten;}await handle.sync();const confirmed=(await load()).records.get(id);if(!confirmed||canonical(confirmed)!==canonical(record))throw Error();fact(confirmed);}catch{broken=true;fail('recovery_quarantined');}
    return 'continuation-fsync:'+record.record_id;
   });},
   records(household){if(!uuid(household))return Promise.reject(continuationError('validation_failed'));return serial(async()=>{const result=[];for(const r of (await load()).records.values())if(r.household_id===household){fact(r);result.push(structuredClone(r));}return result;});},
   async close(){if(closed)return;closing=true;await tail;if(closed)return;closed=true;try{await handle.close();}finally{directories.delete(directory);globalKey.fill(0);}}
  });brands.add(adapter);return adapter;
 }catch(e){if(handle)await handle.close().catch(()=>{});if(owned)directories.delete(directory);globalKey.fill(0);throw continuationError(['validation_failed','journal_unavailable','recovery_quarantined'].includes(e?.code)?e.code:'journal_unavailable');}
}
