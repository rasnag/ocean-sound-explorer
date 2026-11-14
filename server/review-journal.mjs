// REVIEW-JOURNAL-01: persisted identity boundary for the local TEST journal.
// Architecture v1.2 / ADR-E04/E05, SHA256
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// Queue encryption, committed-fact grammar, hash chain and fsync stay unchanged.
// V1 stores remain historical evidence: this runtime never adopts or migrates them.
// Existing exclusive private directory / Windows ACL ownership remain prerequisites.
import {createHmac,timingSafeEqual} from 'node:crypto';
import {open,lstat,realpath,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {ownData,ownMethod,privateKey,environmentSnapshot,canonical,parseStrictJSON} from './continuation-journal.mjs';
import {createSyntheticQueueJournal} from './queue-journal.mjs';

const brands=new WeakSet();
export const isSyntheticReviewJournal=value=>brands.has(value);
const statuses={validation_failed:400,denied:403,conflict:409,configuration_missing:503,journal_unavailable:503,recovery_quarantined:503};
const error=code=>Object.assign(new Error('Local TEST review journal unavailable.'),{code,status:statuses[code]});
const fail=code=>{throw error(code);};
const normalize=e=>error(Object.hasOwn(statuses,e?.code)?e.code:'journal_unavailable');
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const markerName='review-namespace.json',logName='queue-journal.log',FORMAT='review-journal-v2';
const MAX_MARKER=2048,MAX_LOG=16*1024*1024;
const identity=s=>s.dev.toString(10)+':'+s.ino.toString(10);
const persistedIdentity=v=>typeof v==='string'&&v.length<=128&&/^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(v);
const stat=filename=>lstat(filename,{bigint:true});

// A missing/retyped observed pathname is compromised evidence. Ordinary I/O
// failures remain retryable; they are not all converted into integrity failures.
async function observed(work){
 try{return await work();}catch(e){
  if(['ENOENT','ENOTDIR','ELOOP'].includes(e?.code))fail('recovery_quarantined');
  throw e;
 }
}
async function directoryState(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||path.resolve(directory)!==directory)fail('validation_failed');
 for(let cursor=directory;;){
  const s=await observed(()=>stat(cursor));
  if(s.isSymbolicLink()||!s.isDirectory())fail('recovery_quarantined');
  const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
 }
 if(await observed(()=>realpath(directory))!==directory)fail('recovery_quarantined');
 const s=await observed(()=>stat(directory));
 if(typeof process.getuid==='function'&&(s.uid!==BigInt(process.getuid())||(s.mode&0o022n)!==0n))fail('recovery_quarantined');
 return s;
}
function protectedFile(s,max,empty=false){
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.size<(empty?0n:1n)||s.size>BigInt(max)
  ||typeof process.getuid==='function'&&(s.uid!==BigInt(process.getuid())||(s.mode&0o077n)!==0n))fail('recovery_quarantined');
}
function sameFile(a,b){return identity(a)===identity(b)&&a.size===b.size;}

export async function createSyntheticReviewJournal(input){
 let delegate;
 const derived=new Set();
 const wipe=()=>{for(const key of derived)key.fill(0);derived.clear();};
 try{
  const o=ownData(input,['env','directory','keys'],['testHooks']);
  try{environmentSnapshot(o.env);}catch{fail('configuration_missing');}
  ownData(o.keys,['keyForHousehold','keyForOperator']);
  const household=ownMethod(o.keys,'keyForHousehold'),operator=ownMethod(o.keys,'keyForOperator');
  function derive(raw,label){
   const key=privateKey(raw);
   // Byte-identical accepted review derivation: these are actual NUL bytes.
   try{const out=createHmac('sha256',key).update('review-local-01\0'+label+'\0').digest();derived.add(out);return out;}
   finally{key.fill(0);}
  }
  function markerMAC(body){
   const key=derive(operator(),'namespace-marker');
   try{return createHmac('sha256',key).update(canonical(body)).digest('hex');}
   finally{key.fill(0);derived.delete(key);}
  }
  function authentic(body,mac){
   const expected=Buffer.from(markerMAC(body),'hex'),actual=Buffer.from(mac,'hex');
   try{return timingSafeEqual(actual,expected);}finally{actual.fill(0);expected.fill(0);}
  }
  const directory=o.directory,initialDirectory=await directoryState(directory);
  const names=await observed(()=>readdir(directory));
  let fresh=names.length===0,closed=false,closing=false,broken=false;
  if(!fresh&&(names.length!==2||!names.includes(markerName)||!names.includes(logName)))fail('recovery_quarantined');
  const filename=path.join(directory,markerName),logfile=path.join(directory,logName);
  let markerStat,markerText,namespace,logIdentity,logSize=0n,tail=Promise.resolve();
  async function checkDirectory(){
   const d=await directoryState(directory);
   if(identity(d)!==identity(initialDirectory))fail('recovery_quarantined');
  }
  async function inspectLog(){
   await checkDirectory();
   const entry=await observed(()=>stat(logfile));protectedFile(entry,MAX_LOG);
   if(logIdentity!==undefined&&identity(entry)!==logIdentity||entry.size<logSize)fail('recovery_quarantined');
   const reader=await observed(()=>open(logfile,constants.O_RDONLY|(constants.O_NOFOLLOW??0)));
   try{
    const s=await reader.stat({bigint:true});protectedFile(s,MAX_LOG);
    if(!sameFile(s,entry))fail('recovery_quarantined');
    const after=await observed(()=>stat(logfile));protectedFile(after,MAX_LOG);
    if(!sameFile(after,s))fail('recovery_quarantined');
    await checkDirectory();return s;
   }finally{await reader.close();}
  }
  async function paths(){
   await checkDirectory();
   const current=await observed(()=>readdir(directory));
   if(current.length!==2||!current.includes(markerName)||!current.includes(logName))fail('recovery_quarantined');
   return inspectLog();
  }
  async function readMarker(){
   const log=await paths(),entry=await observed(()=>stat(filename));protectedFile(entry,MAX_MARKER);
   if(markerStat&&!sameFile(entry,markerStat))fail('recovery_quarantined');
   const reader=await observed(()=>open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0)));let bytes;
   try{
    const s=await reader.stat({bigint:true});protectedFile(s,MAX_MARKER);
    if(!sameFile(s,entry))fail('recovery_quarantined');
    // Conversion is bounded above; dev/ino never pass through Number.
    bytes=Buffer.alloc(Number(s.size));let offset=0;
    while(offset<bytes.length){const r=await reader.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)fail('recovery_quarantined');offset+=r.bytesRead;}
    let text,m;
    try{
     text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
     m=ownData(parseStrictJSON(text),['format','namespace_verifier','directory_path','directory_identity','log_identity','marker_identity','mac']);
    }catch{fail('recovery_quarantined');}
    const body={format:m.format,namespace_verifier:m.namespace_verifier,directory_path:m.directory_path,directory_identity:m.directory_identity,log_identity:m.log_identity,marker_identity:m.marker_identity};
    if(m.format!==FORMAT||!hex(m.namespace_verifier)||!hex(m.mac)
     ||![m.directory_identity,m.log_identity,m.marker_identity].every(persistedIdentity)
     ||m.directory_path!==directory||m.directory_identity!==identity(initialDirectory)
     ||m.log_identity!==identity(log)||m.marker_identity!==identity(s)
     ||canonical(m)+'\n'!==text||!authentic(body,m.mac)
     ||namespace!==undefined&&m.namespace_verifier!==namespace||markerText!==undefined&&text!==markerText)fail('recovery_quarantined');
    const held=await reader.stat({bigint:true}),after=await observed(()=>stat(filename));
    protectedFile(held,MAX_MARKER);protectedFile(after,MAX_MARKER);
    if(!sameFile(held,s)||!sameFile(after,s))fail('recovery_quarantined');
    markerStat=s;markerText=text;namespace=m.namespace_verifier;logIdentity=m.log_identity;logSize=log.size;
   }finally{bytes?.fill(0);await reader.close();}
   await paths();
  }
  // Authenticate exact fields and all persisted identities before delegate
  // adoption. A rejected existing store is never opened for creation/reset.
  if(!fresh)await readMarker();
  try{
   delegate=await createSyntheticQueueJournal({env:o.env,directory,keys:{
    keyForHousehold:id=>derive(household(id),'household'),
    keyForOperator:()=>derive(operator(),'operator'),
   },...(o.testHooks!==undefined?{testHooks:o.testHooks}:{})});
  }finally{wipe();}
  if(fresh){
   await checkDirectory();
   const current=await observed(()=>readdir(directory));
   if(current.length!==1||current[0]!==logName)fail('recovery_quarantined');
   namespace=delegate.namespace_verifier;
   const log=await inspectLog();logIdentity=identity(log);logSize=log.size;
   const writer=await open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
   let bytes;
   try{
    const initial=await writer.stat({bigint:true});protectedFile(initial,MAX_MARKER,true);
    if(initial.size!==0n)fail('recovery_quarantined');
    // The marker's OWN fstat identity is obtained before computing its MAC.
    const body={format:FORMAT,namespace_verifier:namespace,directory_path:directory,directory_identity:identity(initialDirectory),log_identity:logIdentity,marker_identity:identity(initial)};
    bytes=Buffer.from(canonical({...body,mac:markerMAC(body)})+'\n');
    if(bytes.length>MAX_MARKER)fail('validation_failed');
    let offset=0;
    while(offset<bytes.length){const r=await writer.write(bytes,offset,bytes.length-offset,null);if(!r.bytesWritten)fail('journal_unavailable');offset+=r.bytesWritten;}
    await writer.sync();markerStat=await writer.stat({bigint:true});protectedFile(markerStat,MAX_MARKER);
    const entry=await observed(()=>stat(filename));protectedFile(entry,MAX_MARKER);
    if(identity(initial)!==identity(markerStat)||markerStat.size!==BigInt(bytes.length)||!sameFile(entry,markerStat))fail('recovery_quarantined');
   }finally{bytes?.fill(0);await writer.close();}
   if(process.platform!=='win32'){
    const dir=await open(directory,constants.O_RDONLY);try{await dir.sync();}finally{await dir.close();}
   }
   await readMarker();
  }else if(namespace!==delegate.namespace_verifier)fail('recovery_quarantined');
  async function verify(){
   await readMarker();
   // records reloads and authenticates EVERY delegate frame, including facts
   // outside this selected scope, and checks its held log descriptor/path.
   // Do not import cost-specific command restrictions into review.
   await delegate.records('operator');
   await readMarker();
  }
  function checked(work){
   if(broken)return Promise.reject(error('recovery_quarantined'));
   if(closing||closed)return Promise.reject(error('journal_unavailable'));
   const result=tail.then(async()=>{
    try{
     if(broken)fail('recovery_quarantined');await verify();
     const result=await work();await verify();return result;
    }catch(e){
     if(e?.code==='recovery_quarantined')broken=true;
     throw normalize(e);
    }finally{wipe();}
   });tail=result.catch(()=>{});return result;
  }
  let closePromise;
  const journal=Object.freeze({
   namespace_verifier:namespace,
   claimFreshNamespace(){
    // Logical one-use denial is deliberately outside checked's integrity catch.
    // It neither resets the capability nor poisons healthy existing storage.
    return checked(async()=>{if(!fresh)return null;fresh=false;return namespace;})
     .then(value=>{if(value===null)fail('recovery_quarantined');return value;});
   },
   seal(value){return checked(()=>delegate.seal(value));},
   fact(value){return checked(()=>delegate.fact(value));},
   append(value){return checked(()=>{fresh=false;return delegate.append(value);});},
   records(householdId){return checked(()=>delegate.records(householdId));},
   close(){
    if(closePromise)return closePromise;closing=true;
    closePromise=(async()=>{
     await tail;
     try{
      // Close is resource release, not a recovery/adoption operation. Integrity
      // failure remains sticky but must not break existing fixture teardown.
      if(!broken)try{await verify();}catch(e){if(e?.code==='recovery_quarantined')broken=true;}
     }finally{
      try{await delegate.close();}catch(e){throw normalize(e);}
      finally{closed=true;wipe();}
     }
    })();return closePromise;
   },
  });
  await verify();wipe();brands.add(journal);return journal;
 }catch(e){
  try{if(delegate)await delegate.close().catch(()=>{});}finally{wipe();}
  throw normalize(e);
 }
}
