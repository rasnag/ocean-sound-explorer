// COST-LOCAL-01: independent local synthetic cost journal.
// Architecture v1.2 / ADR-E03,E04,E06, SHA256
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// Accepted queue AES-GCM, authenticated hash chain and fsync are reused intact.
// Cost subkeys use actual NUL separators. No generation/review store is adopted.
// Primary/journal/ACK equality, empty-primary refusal and current authority are
// cost-service obligations: this filesystem adapter has no primary DB access.
// Existing exclusive private directory and Windows ACL capability are prerequisites.
import {createHmac,timingSafeEqual} from 'node:crypto';
import {open,lstat,realpath,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {ownData,ownMethod,privateKey,environmentSnapshot,canonical,parseStrictJSON} from './continuation-journal.mjs';
import {createSyntheticQueueJournal} from './queue-journal.mjs';

const brands=new WeakSet();
export const isSyntheticCostJournal=value=>brands.has(value);
const statuses={validation_failed:400,denied:403,conflict:409,configuration_missing:503,journal_unavailable:503,recovery_quarantined:503};
const error=code=>Object.assign(new Error('Local synthetic cost journal unavailable.'),{code,status:statuses[code]});
const fail=code=>{throw error(code);};
const normalize=e=>error(Object.hasOwn(statuses,e?.code)?e.code:'journal_unavailable');
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const markerName='cost-namespace.json',logName='queue-journal.log',FORMAT='cost-journal-v2';
const actions=['CaptureAttempt','OpenComparison','RecordAttemptUsage','RecordScenarioCash','RecordStageTime'];
const identity=s=>String(s.dev)+':'+String(s.ino);

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
function protectedFile(s,max){
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||!Number.isSafeInteger(s.size)||s.size<1||s.size>max
  ||typeof process.getuid==='function'&&(s.uid!==process.getuid()||(s.mode&0o077)!==0))fail('recovery_quarantined');
}
// Enforce the cost command domain as well as cryptographic separation. The
// accepted delegate independently validates the full committed-fact envelope.
function costFact(value){
 const f=ownData(value,['format','scope','household_id','consent_epoch','record_id','command_id','primary_commit_id','actor_id','actor_kind','original_session_hash','recorded_at','aggregate_version','canonical_digest','namespace_verifier','command','result','effect']);
 const envelope=ownData(f.command,['household_id','request_id','scope_version','command']);
 const command=ownData(envelope.command,['command_id','expected_version','source_pin','action','payload']);
 const result=ownData(f.result,['status','synthetic_only','command_id','version']);
 if(f.format!=='queue-committed-fact-v1'||f.scope!=='household'||f.actor_kind!=='founder'
  ||envelope.household_id!==f.household_id||command.command_id!==f.command_id||!actions.includes(command.action)
  ||result.status!=='acknowledged'||result.synthetic_only!==true||result.command_id!==f.command_id
  ||result.version!==f.aggregate_version||!Number.isSafeInteger(command.expected_version)
  ||Object.is(command.expected_version,-0)||command.expected_version<0||command.expected_version>=9007199254740990
  ||command.expected_version+1!==f.aggregate_version)fail('validation_failed');
 return value;
}

export async function createSyntheticCostJournal(input){
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
   try{const out=createHmac('sha256',key).update('cost-local-01\0'+label+'\0').digest();derived.add(out);return out;}
   finally{key.fill(0);}
  }
  function markerMAC(body){
   const key=derive(operator(),'namespace-marker');
   try{return createHmac('sha256',key).update(canonical(body)).digest('hex');}
   finally{key.fill(0);derived.delete(key);}
  }
  const directory=o.directory,initialDirectory=await directoryState(directory),names=await readdir(directory);
  let fresh=names.length===0,closed=false,closing=false,broken=false,claimed=false;
  if(!fresh&&(names.length!==2||!names.includes(markerName)||!names.includes(logName)))fail('recovery_quarantined');
  const filename=path.join(directory,markerName),logfile=path.join(directory,logName);
  let markerStat,markerText,namespace,logIdentity,logSize=0,tail=Promise.resolve();
  async function paths(){
   const d=await directoryState(directory);
   if(identity(d)!==identity(initialDirectory))fail('recovery_quarantined');
   const namesNow=await readdir(directory);
   if(namesNow.length!==2||!namesNow.includes(markerName)||!namesNow.includes(logName))fail('recovery_quarantined');
   const s=await lstat(logfile);protectedFile(s,16*1024*1024);
   if(logIdentity!==undefined&&identity(s)!==logIdentity||s.size<logSize)fail('recovery_quarantined');
   return s;
  }
  async function readMarker(){
   const log=await paths(),entry=await lstat(filename);protectedFile(entry,2048);
   if(markerStat&&(identity(entry)!==identity(markerStat)||entry.size!==markerStat.size))fail('recovery_quarantined');
   const reader=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let bytes;
   try{
    const s=await reader.stat();protectedFile(s,2048);
    if(identity(s)!==identity(entry)||s.size!==entry.size)fail('recovery_quarantined');
    bytes=Buffer.alloc(s.size);let offset=0;
    while(offset<bytes.length){const r=await reader.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)fail('recovery_quarantined');offset+=r.bytesRead;}
    let text,m;
    try{
     text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
     m=ownData(parseStrictJSON(text),['format','namespace_verifier','directory_identity','log_identity','marker_identity','mac']);
    }catch{fail('recovery_quarantined');}
    const body={format:m.format,namespace_verifier:m.namespace_verifier,directory_identity:m.directory_identity,log_identity:m.log_identity,marker_identity:m.marker_identity};
    if(m.format!==FORMAT||!hex(m.namespace_verifier)||!hex(m.mac)||canonical(m)+'\n'!==text
     ||m.directory_identity!==identity(initialDirectory)||m.log_identity!==identity(log)||m.marker_identity!==identity(s)
     ||!timingSafeEqual(Buffer.from(m.mac,'hex'),Buffer.from(markerMAC(body),'hex'))
     ||namespace!==undefined&&m.namespace_verifier!==namespace||markerText!==undefined&&markerText!==text)fail('recovery_quarantined');
    const after=await lstat(filename);protectedFile(after,2048);
    if(identity(after)!==identity(s)||after.size!==s.size)fail('recovery_quarantined');
    markerStat=s;markerText=text;namespace=m.namespace_verifier;logIdentity=m.log_identity;logSize=log.size;
   }finally{bytes?.fill(0);await reader.close();}
   await paths();
  }
  // Authenticate an existing empty store BEFORE opening the queue delegate.
  // Neither wrong operator keys nor a foreign namespace may rewrite evidence.
  if(!fresh)await readMarker();
  try{
   delegate=await createSyntheticQueueJournal({env:o.env,directory,keys:{
    keyForHousehold:id=>derive(household(id),'household'),
    keyForOperator:()=>derive(operator(),'operator')
   },...(o.testHooks!==undefined?{testHooks:o.testHooks}:{})});
  }finally{wipe();}
  if(fresh){
   namespace=delegate.namespace_verifier;
   const log=await lstat(logfile);protectedFile(log,16*1024*1024);logIdentity=identity(log);logSize=log.size;
   const writer=await open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
   let bytes;
   try{
    const initial=await writer.stat();
    if(!initial.isFile()||initial.nlink!==1)fail('recovery_quarantined');
    const body={format:FORMAT,namespace_verifier:namespace,directory_identity:identity(initialDirectory),log_identity:logIdentity,marker_identity:identity(initial)};
    bytes=Buffer.from(canonical({...body,mac:markerMAC(body)})+'\n');
    let offset=0;while(offset<bytes.length){const r=await writer.write(bytes,offset,bytes.length-offset,null);if(!r.bytesWritten)fail('journal_unavailable');offset+=r.bytesWritten;}
    await writer.sync();markerStat=await writer.stat();protectedFile(markerStat,2048);
   }finally{bytes?.fill(0);await writer.close();}
   if(process.platform!=='win32'){
    const dir=await open(directory,constants.O_RDONLY);try{await dir.sync();}finally{await dir.close();}
   }
   await readMarker();
  }else if(namespace!==delegate.namespace_verifier)fail('recovery_quarantined');
  async function verify(){
   await readMarker();
   // records() reloads/authenticates the ENTIRE accepted hash chain and checks
   // the held log descriptor against its pathname, even for seal/fact/claim.
   const operatorRecords=await delegate.records('operator');
   if(operatorRecords.length)fail('recovery_quarantined');
   await readMarker();
  }
  function checked(work){
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
   claimFreshNamespace(){return checked(async()=>{
    if(!fresh||claimed)return null;claimed=true;fresh=false;return namespace;
   }).then(value=>{if(value===null)fail('recovery_quarantined');return value;});},
   seal(value){return checked(()=>delegate.seal(costFact(value)));},
   fact(value){return checked(()=>{
    const f=delegate.fact(value);try{return costFact(f);}catch{fail('recovery_quarantined');}
   });},
   append(value){return checked(async()=>{
    try{costFact(delegate.fact(value));}catch{fail('recovery_quarantined');}
    fresh=false;return delegate.append(value);
   });},
   records(householdId){return checked(async()=>{
    const records=await delegate.records(householdId);
    for(const r of records)try{costFact(delegate.fact(r));}catch{fail('recovery_quarantined');}
    return records;
   });},
   close(){
    if(closePromise)return closePromise;closing=true;
    closePromise=(async()=>{
     await tail;let failure;
     try{await verify();}catch(e){failure=normalize(e);}
     try{await delegate.close();await readMarker();}catch(e){failure??=normalize(e);}
     finally{closed=true;wipe();}
     if(failure)throw failure;
    })();return closePromise;
   }
  });
  await verify();wipe();brands.add(journal);return journal;
 }catch(e){
  if(delegate)await delegate.close().catch(()=>{});wipe();throw normalize(e);
 }
}
