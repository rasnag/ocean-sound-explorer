// REVIEW-LOCAL-01: independent encrypted TEST-review committed-fact journal.
// Architecture 1.2 / ADR-E04/E05, SHA256
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// Reuses accepted queue encryption, authenticated hash chain, fsync, pathname
// replacement checks and idempotent append. Distinct review-domain subkeys and
// an authenticated namespace marker prevent adopting another service's store.
// Local single-process storage only; Windows ACL ownership remains a setup gate.
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
const markerName='review-namespace.json';

async function directoryState(directory){
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
function protectedFile(s){
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||!Number.isSafeInteger(s.size)||s.size>1024
  ||typeof process.getuid==='function'&&(s.uid!==process.getuid()||(s.mode&0o077)!==0))fail('recovery_quarantined');
}

export async function createSyntheticReviewJournal(input){
 let delegate;
 try{
  const o=ownData(input,['env','directory','keys'],['testHooks']);
  try{environmentSnapshot(o.env);}catch{fail('configuration_missing');}
  ownData(o.keys,['keyForHousehold','keyForOperator']);
  const household=ownMethod(o.keys,'keyForHousehold'),operator=ownMethod(o.keys,'keyForOperator');
  function derive(raw,label){
   const key=privateKey(raw);
   try{return createHmac('sha256',key).update('review-local-01\0'+label+'\0').digest();}
   finally{key.fill(0);}
  }
  function markerMAC(namespace){
   const key=derive(operator(),'namespace-marker');
   try{return createHmac('sha256',key).update(canonical({format:'review-journal-v1',namespace_verifier:namespace})).digest('hex');}
   finally{key.fill(0);}
  }
  const directory=o.directory,initialDirectory=await directoryState(directory),names=await readdir(directory);
  let fresh=names.length===0;
  if(!fresh&&(names.length!==2||!names.includes(markerName)||!names.includes('queue-journal.log')))fail('recovery_quarantined');
  const filename=path.join(directory,markerName);
  let markerStat,markerText,namespace,closed=false;
  async function readMarker(){
   const d=await directoryState(directory);
   if(d.dev!==initialDirectory.dev||d.ino!==initialDirectory.ino)fail('recovery_quarantined');
   const entry=await lstat(filename);protectedFile(entry);
   if(markerStat&&(entry.dev!==markerStat.dev||entry.ino!==markerStat.ino||entry.size!==markerStat.size))fail('recovery_quarantined');
   const reader=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
   try{
    const s=await reader.stat();protectedFile(s);
    if(s.dev!==entry.dev||s.ino!==entry.ino||s.size!==entry.size)fail('recovery_quarantined');
    const bytes=Buffer.alloc(s.size);let offset=0;
    while(offset<bytes.length){const r=await reader.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)fail('recovery_quarantined');offset+=r.bytesRead;}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const m=ownData(parseStrictJSON(text),['format','namespace_verifier','mac']);
    if(m.format!=='review-journal-v1'||!hex(m.namespace_verifier)||!hex(m.mac)||canonical(m)+'\n'!==text
     ||!timingSafeEqual(Buffer.from(m.mac,'hex'),Buffer.from(markerMAC(m.namespace_verifier),'hex'))
     ||namespace!==undefined&&m.namespace_verifier!==namespace||markerText!==undefined&&markerText!==text)fail('recovery_quarantined');
    const after=await lstat(filename);protectedFile(after);
    if(after.dev!==s.dev||after.ino!==s.ino||after.size!==s.size)fail('recovery_quarantined');
    markerStat=s;markerText=text;namespace=m.namespace_verifier;
   }finally{await reader.close();}
  }
  // Authenticate even an empty existing journal before opening its delegate.
  // The accepted queue manifest alone contains no key authenticator when empty.
  if(!fresh)await readMarker();
  delegate=await createSyntheticQueueJournal({env:o.env,directory,keys:{
   keyForHousehold:id=>derive(household(id),'household'),
   keyForOperator:()=>derive(operator(),'operator'),
  },...(o.testHooks!==undefined?{testHooks:o.testHooks}:{})});
  if(fresh){
   namespace=delegate.namespace_verifier;
   const bytes=Buffer.from(canonical({format:'review-journal-v1',namespace_verifier:namespace,mac:markerMAC(namespace)})+'\n');
   const writer=await open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
   try{
    protectedFile(await writer.stat());let offset=0;
    while(offset<bytes.length){const r=await writer.write(bytes,offset,bytes.length-offset,null);if(!r.bytesWritten)fail('journal_unavailable');offset+=r.bytesWritten;}
    await writer.sync();markerStat=await writer.stat();
   }finally{await writer.close();}
   if(process.platform!=='win32'){
    const dir=await open(directory,constants.O_RDONLY);try{await dir.sync();}finally{await dir.close();}
   }
   await readMarker();
  }else if(namespace!==delegate.namespace_verifier)fail('recovery_quarantined');
  async function checked(work){
   try{
    if(closed)fail('journal_unavailable');await readMarker();
    const result=await work();await readMarker();return result;
   }catch(e){throw normalize(e);}
  }
  const journal=Object.freeze({
   namespace_verifier:namespace,
   claimFreshNamespace(){
    return checked(async()=>{
     if(!fresh)fail('recovery_quarantined');
     // This is a one-use initialization capability, never a reset operation.
     fresh=false;return namespace;
    });
   },
   seal(value){return checked(()=>delegate.seal(value));},
   fact(value){return checked(()=>delegate.fact(value));},
   append(value){fresh=false;return checked(()=>delegate.append(value));},
   records(householdId){return checked(()=>delegate.records(householdId));},
   async close(){if(closed)return;closed=true;await delegate.close();},
  });
  brands.add(journal);return journal;
 }catch(e){
  if(delegate)await delegate.close().catch(()=>{});
  throw normalize(e);
 }
}
