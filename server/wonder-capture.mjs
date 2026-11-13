// CODEX-04-A local synthetic capture; real-data and public gates remain closed.
import {createHash,createHmac,createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {ownData,ownMethod,environmentSnapshot,canonical,wonderError,wonderUUID,privateKey,isSyntheticWonderJournal,recordHeader,recordMAC,authenticateWonderRecord} from './wonder-journal.mjs';
const policy='TEST-v1',maximum=1000;
const base=state=>({status:'wonder_capture',synthetic_only:true,policy_version:policy,state});
const fail=code=>{throw wonderError(code);};
const copy=value=>structuredClone(value),equal=(a,b)=>canonical(a)===canonical(b);
const integer=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)fail('recovery_quarantined');return n;};
const bounded=rows=>{if(rows.length>maximum)fail('recovery_quarantined');return rows;};
const selectKeys=['view_context','child_id','profile_version'];
function selection(input,extra=[]){
 const v=ownData(input,[...selectKeys,...extra]);
 if(typeof v.view_context!=='string'||!/^[0-9a-f]{64}$/.test(v.view_context)||!wonderUUID(v.child_id)||!Number.isSafeInteger(v.profile_version)||v.profile_version<1)fail('validation_failed');
 return {...v,child_id:v.child_id.toLowerCase()};
}
function command(input){
 const v=ownData(input,[...selectKeys,'command_id','operation','question','parent_context'],['request_id','expected_source_scope_version']);
 const fields=[...selectKeys,'command_id','operation','question','parent_context'];
 if(v.operation==='correct')fields.push('request_id','expected_source_scope_version');else if(v.operation!=='create')fail('validation_failed');
 ownData(input,fields);
 const s=selection({view_context:v.view_context,child_id:v.child_id,profile_version:v.profile_version});
 if(!wonderUUID(v.command_id)||typeof v.question!=='string'||!v.question.trim()||v.question.length>4000||!(v.parent_context===null||typeof v.parent_context==='string'&&v.parent_context.length<=2000))fail('validation_failed');
 if(v.operation==='correct'&&(!wonderUUID(v.request_id)||!Number.isSafeInteger(v.expected_source_scope_version)||v.expected_source_scope_version<1))fail('validation_failed');
 return {...v,...s,command_id:v.command_id.toLowerCase(),...(v.operation==='correct'?{request_id:v.request_id.toLowerCase()}:{})};
}
const encode=value=>value===null?null:Buffer.from(value,'utf16le').toString('base64');
function decode(value,limit){
 if(value===null)return null;
 if(typeof value!=='string'||value.length>Math.ceil(limit*2/3)*4||Buffer.from(value,'base64').toString('base64')!==value||Buffer.from(value,'base64').length%2)fail('recovery_quarantined');
 const text=Buffer.from(value,'base64').toString('utf16le');if(text.length>limit)fail('recovery_quarantined');return text;
}
const subkey=(key,label)=>createHmac('sha256',key).update(label).digest();
function fingerprint(key,actor,epoch,c){return createHmac('sha256',key).update('wonder-command-v1\0').update(canonical({adult_id:actor.adultId,household_id:actor.householdId,consent_epoch:epoch,command:c})).digest('hex');}
function encrypt(key,header,snapshot){
 const nonce=randomBytes(12),material=subkey(key,'wonder-encryption-v1'),cipher=createCipheriv('aes-256-gcm',material,nonce);
 try{cipher.setAAD(Buffer.from(canonical(header)));const ciphertext=Buffer.concat([cipher.update(canonical(snapshot),'utf8'),cipher.final()]);return {nonce:nonce.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')};}finally{material.fill(0);}
}
function decrypt(key,record){
 authenticateWonderRecord(record,key);const material=subkey(key,'wonder-encryption-v1');
 try{const decipher=createDecipheriv('aes-256-gcm',material,Buffer.from(record.envelope.nonce,'base64'));decipher.setAAD(Buffer.from(canonical(recordHeader(record))));decipher.setAuthTag(Buffer.from(record.envelope.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.envelope.ciphertext,'base64')),decipher.final()]).toString('utf8'));}catch{fail('recovery_quarantined');}finally{material.fill(0);}
}
let queue=Promise.resolve();
function serial(work){const result=queue.then(work);queue=result.catch(()=>{});return result;}
const health=new WeakMap();
const reference=row=>({command_id:row.command_id,request_id:row.request_id,source_scope_version:integer(row.source_scope_version),child_id:row.child_id});
const response=(s,row,ack)=>({...base(ack?'acknowledged':'retryable_unacknowledged'),...reference(row),view_context:s.context,...(ack?{acknowledgement_scope:'single-host-process-recovery-only',production_ready:false}:{writes_closed:true})});

export async function createSyntheticWonderCapture(input){
 const options=ownData(input,['env','db','access','journal','keys','policyVersion'],['clock']);
 environmentSnapshot(options.env);
 const {db,journal,policyVersion}=options,clock=options.clock??Date.now;
 if(policyVersion!==policy||typeof clock!=='function'||!isSyntheticWonderJournal(journal))fail('validation_failed');
 const withSession=ownMethod(options.access,'withSession'),keyForHousehold=ownMethod(options.keys,'keyForHousehold'),append=ownMethod(journal,'append'),records=ownMethod(journal,'records');
 const now=()=>{const t=clock();if(!Number.isSafeInteger(t)||t<0||t>8640000000000000)fail('validation_failed');return t;};now();
 const {PGlite}=await import('@electric-sql/pglite');if(!(db instanceof PGlite))fail('validation_failed');
 if((await db.query('SELECT version FROM schema_migrations WHERE version=9')).rows.length!==1)fail('unavailable');
 if(!health.has(journal))health.set(journal,{failed:false});const journalHealth=health.get(journal);
 function key(h){try{return privateKey(keyForHousehold(h));}catch{fail('recovery_quarantined');}}
 async function scope(tx,actor,c){
  const consent=(await tx.query('SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[actor.householdId])).rows[0];
  if(!consent||consent.state!=='active'||consent.policy_version!==policy)fail('denied');
  const epoch=integer(consent.consent_epoch);
  const profiles=bounded((await tx.query('SELECT * FROM child_setup_profiles WHERE household_id=$1 ORDER BY child_id FOR UPDATE',[actor.householdId])).rows);
  if(!profiles.some(p=>p.is_initial)||profiles.some(p=>integer(p.consent_epoch)!==epoch))fail('denied');
  const child=profiles.find(p=>p.child_id===c.child_id),context=createHash('sha256').update(JSON.stringify(['synthetic-family-space-v1',actor.adultId,actor.householdId,epoch,policy])).digest('hex');
  if(!child||integer(child.current_version)!==c.profile_version||context!==c.view_context)fail('denied');
  return {h:actor.householdId,adult:actor.adultId,epoch,context,child:c.child_id,profile:c.profile_version};
 }
 async function commandRows(tx,h){return bounded((await tx.query('SELECT * FROM wonder_capture_commands WHERE household_id=$1 ORDER BY request_id,source_scope_version LIMIT 1001',[h])).rows);}
 async function source(tx,row){
  const p=(await tx.query(`SELECT p.*,s.payload_ref AS scope_payload_ref,w.child_id,w.original_received_at FROM wonder_source_payloads p
   JOIN request_source_scopes s USING(household_id,request_id,source_scope_version)
   JOIN wonder_requests w USING(household_id,request_id)
   WHERE p.household_id=$1 AND p.request_id=$2 AND p.source_scope_version=$3`,[row.household_id,row.request_id,row.source_scope_version])).rows[0];
  if(!p||p.capture_command_id!==row.command_id||p.child_id!==row.child_id||integer(p.consent_epoch)!==integer(row.consent_epoch)||p.payload_ref!==p.scope_payload_ref)fail('recovery_quarantined');
  return p;
 }
 async function verifyPrimary(tx,row,material){
  const snapshot=decrypt(material,row.recovery_record),p=await source(tx,row);
  ownData(snapshot,['format','adult_id','consent_epoch','profile_version','command','request_id','source_scope_version','previous_source_scope_version','payload_ref','result_ref']);
  const c=command(snapshot.command);
  if(snapshot.format!=='wonder-recovery-v1'||snapshot.adult_id!==row.adult_id||snapshot.consent_epoch!==integer(row.consent_epoch)||snapshot.profile_version!==integer(row.profile_version)
   ||snapshot.request_id!==row.request_id||snapshot.source_scope_version!==integer(row.source_scope_version)||snapshot.previous_source_scope_version!==(p.previous_source_scope_version===null?null:integer(p.previous_source_scope_version))
   ||snapshot.payload_ref!==p.payload_ref||snapshot.result_ref!==row.result_ref||c.command_id!==row.command_id||c.child_id!==row.child_id||c.operation!==row.operation||c.profile_version!==integer(row.profile_version)
   ||row.recovery_record.household_id!==row.household_id||row.recovery_record.command_id!==row.command_id||row.recovery_record.canonical_digest!==row.canonical_digest||row.result_ref!=='wonder-fsync:'+row.recovery_record.record_id
   ||fingerprint(material,{adultId:row.adult_id,householdId:row.household_id},integer(row.consent_epoch),c)!==row.canonical_digest
   ||encode(c.question)!==p.question_utf16_base64||encode(c.parent_context)!==p.parent_context_utf16_base64)fail('recovery_quarantined');
  return {snapshot,p};
 }
 async function snapshot(token,c){
  return withSession(token,async(tx,actor)=>{const s=await scope(tx,actor,c),material=key(s.h);
   try{const rows=await commandRows(tx,s.h);for(const r of rows)await verifyPrimary(tx,r,material);return {s,rows,key:material};}catch(e){material.fill(0);throw e;}
  });
 }
 function sameSnapshot(before,after){if(!equal(before.s,after.s)||!equal(before.rows,after.rows))fail('conflict');}
 async function inspect(before){
  let found;try{found=await records(before.s.h,before.key);}catch(e){journalHealth.failed=true;throw e;}
  const byCommand=new Map(found.map(r=>[r.command_id,r]));
  for(const r of found){const primary=before.rows.find(p=>p.command_id===r.command_id);if(!primary||!equal(primary.recovery_record,r))fail('recovery_quarantined');}
  for(const r of before.rows)if(r.acknowledged&&!byCommand.has(r.command_id))fail('recovery_quarantined');
  return byCommand;
 }
 async function savedOnly(tx,s,requestId){
  const r=(await tx.query('SELECT * FROM wonder_requests WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[s.h,requestId])).rows[0];
  if(!r||r.child_id!==s.child)fail('denied');
  const related=(await tx.query(`SELECT (SELECT count(*) FROM entitlement_claims WHERE household_id=$1 AND request_id=$2) claims,
   (SELECT count(*) FROM capacity_reservations WHERE household_id=$1 AND request_id=$2) capacity,
   (SELECT count(*) FROM assignments WHERE household_id=$1 AND request_id=$2) assignments`,[s.h,requestId])).rows[0];
  if(r.original_received_at!==null||Object.values(related).some(v=>Number(v)!==0))fail('conflict');return r;
 }
 async function quota(tx,h){
  const at=now();await tx.query('INSERT INTO wonder_capture_throttle VALUES($1,$2,0) ON CONFLICT DO NOTHING',[h,at]);
  const r=(await tx.query('SELECT * FROM wonder_capture_throttle WHERE household_id=$1 FOR UPDATE',[h])).rows[0];let start=Number(r.window_started_ms),attempts=Number(r.attempts);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(attempts)||at<start)fail('rate_limited');if(at-start>=60000){start=at;attempts=0;}if(attempts>=30)fail('rate_limited');
  await tx.query('UPDATE wonder_capture_throttle SET window_started_ms=$2,attempts=$3 WHERE household_id=$1',[h,start,attempts+1]);
 }
 const profileAllowed=(row,s,historical)=>integer(row.profile_version)===s.profile||historical&&integer(row.profile_version)<s.profile;
 async function finish(token,c,row,historicalProfile=false){
  const before=await snapshot(token,c);
  try{
   const current=before.rows.find(r=>r.command_id===row.command_id);
   if(!current||current.adult_id!==before.s.adult||current.child_id!==before.s.child||integer(current.consent_epoch)!==before.s.epoch||!profileAllowed(current,before.s,historicalProfile)||!equal(current.recovery_record,row.recovery_record))fail('denied');
   await inspect(before);
   try{if(await append(current.recovery_record,before.key)!==current.result_ref)fail('recovery_quarantined');}
   catch(e){journalHealth.failed=true;
    if(e.code==='recovery_quarantined')throw e;
    return withSession(token,async(tx,actor)=>{const s=await scope(tx,actor,c),actual=(await commandRows(tx,s.h)).find(r=>r.command_id===current.command_id);if(!actual||!equal(actual.recovery_record,current.recovery_record))fail('recovery_quarantined');return response(s,actual,false);});
   }
   const durable=await records(before.s.h,before.key);if(!durable.some(r=>equal(r,current.recovery_record)))fail('recovery_quarantined');
   return await withSession(token,async(tx,actor)=>{
    const s=await scope(tx,actor,c),material=key(s.h);
    try{
     const actual=(await commandRows(tx,s.h)).find(r=>r.command_id===current.command_id);
     if(!actual||actual.adult_id!==s.adult||actual.child_id!==s.child||!profileAllowed(actual,s,historicalProfile)||integer(actual.consent_epoch)!==s.epoch||!equal(actual.recovery_record,current.recovery_record))fail('denied');
     await verifyPrimary(tx,actual,material);
     if(!actual.acknowledged){const changed=await tx.query('UPDATE wonder_capture_commands SET acknowledged=true WHERE household_id=$1 AND command_id=$2 AND acknowledged=false RETURNING command_id',[s.h,actual.command_id]);if(changed.rows.length!==1)fail('conflict');}
     journalHealth.failed=false;return response(s,actual,true);
    }finally{material.fill(0);}
   });
  }finally{before.key.fill(0);}
 }
 async function save(token,input){
  const c=command(input); // Complete primitive snapshot before the first yield.
  return serial(async()=>{
   const before=await snapshot(token,c);
   let row;
   try{
    await inspect(before);
    row=await withSession(token,async(tx,actor)=>{
     const s=await scope(tx,actor,c),rows=await commandRows(tx,s.h);sameSnapshot(before,{s,rows});const material=key(s.h);
     try{
      const digest=fingerprint(material,actor,s.epoch,c),prior=rows.find(r=>r.command_id===c.command_id);
      if(prior){if(prior.adult_id!==s.adult||prior.child_id!==s.child||prior.canonical_digest!==digest)fail('conflict');return prior;}
      if(journalHealth.failed||rows.some(r=>!r.acknowledged))fail('journal_unavailable');
      if(rows.length>=maximum)fail('rate_limited');
      // Preserve the accepted family projection's 100-request per-child bound.
      // Exact retries above and corrections below do not create another request.
      if(c.operation==='create'){
       const total=Number((await tx.query('SELECT count(*) total FROM wonder_requests WHERE household_id=$1 AND child_id=$2',[s.h,s.child])).rows[0].total);
       if(!Number.isSafeInteger(total)||total<0)fail('recovery_quarantined');
       if(total>=100)fail('rate_limited');
      }
      const requestId=c.operation==='create'?randomUUID():c.request_id;
      let version=1,previous=null;
      if(c.operation==='correct'){
       await savedOnly(tx,s,requestId);
       const sources=bounded((await tx.query('SELECT * FROM request_source_scopes WHERE household_id=$1 AND request_id=$2 ORDER BY source_scope_version',[s.h,requestId])).rows);
       const latest=sources.at(-1),owner=rows.find(r=>r.request_id===requestId&&integer(r.source_scope_version)===Number(latest?.source_scope_version));
       if(!latest||!owner||owner.adult_id!==s.adult||owner.child_id!==s.child||integer(owner.consent_epoch)!==s.epoch)fail('denied');
       if(!owner.acknowledged||integer(latest.source_scope_version)!==c.expected_source_scope_version)fail('conflict');
       if(c.expected_source_scope_version>=Number.MAX_SAFE_INTEGER)fail('unavailable');previous=c.expected_source_scope_version;version=previous+1;
      }
      await quota(tx,s.h);
      const payloadRef='wonder-capture:'+c.command_id,recordId=randomUUID(),resultRef='wonder-fsync:'+recordId;
      if(c.operation==='create')await tx.query('INSERT INTO wonder_requests(household_id,request_id,child_id,payload_ref) VALUES($1,$2,$3,$4)',[s.h,requestId,s.child,payloadRef]);
      await tx.query('INSERT INTO request_source_scopes(household_id,request_id,source_scope_version,payload_ref) VALUES($1,$2,$3,$4)',[s.h,requestId,version,payloadRef]);
      const header={version:1,synthetic_only:true,record_id:recordId,household_id:s.h,command_id:c.command_id,canonical_digest:digest};
      const recovery={format:'wonder-recovery-v1',adult_id:s.adult,consent_epoch:s.epoch,profile_version:s.profile,command:c,request_id:requestId,source_scope_version:version,previous_source_scope_version:previous,payload_ref:payloadRef,result_ref:resultRef};
      const record={...header,envelope:encrypt(material,header,recovery)};record.mac=recordMAC(record,material);
      await tx.query(`INSERT INTO wonder_capture_commands(household_id,command_id,adult_id,child_id,consent_epoch,profile_version,operation,request_id,source_scope_version,canonical_digest,recovery_record,result_ref)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[s.h,c.command_id,s.adult,s.child,s.epoch,s.profile,c.operation,requestId,version,digest,JSON.stringify(record),resultRef]);
      await tx.query(`INSERT INTO wonder_source_payloads(household_id,request_id,source_scope_version,capture_command_id,consent_epoch,payload_ref,previous_source_scope_version,question_utf16_base64,parent_context_utf16_base64,parent_context_source)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'parent')`,[s.h,requestId,version,c.command_id,s.epoch,payloadRef,previous,encode(c.question),encode(c.parent_context)]);
      return (await commandRows(tx,s.h)).find(r=>r.command_id===c.command_id);
     }finally{material.fill(0);}
    });
   }finally{before.key.fill(0);}
   return finish(token,c,row);
  });
 }
 async function reconcile(token,input){
  const c=selection(input,['command_id']);if(!wonderUUID(c.command_id))fail('validation_failed');c.command_id=c.command_id.toLowerCase();
  return serial(async()=>{
   const before=await snapshot(token,c);let row;
   try{await inspect(before);row=before.rows.find(r=>r.command_id===c.command_id);if(!row||row.adult_id!==before.s.adult||row.child_id!==before.s.child||integer(row.consent_epoch)!==before.s.epoch||integer(row.profile_version)>before.s.profile)fail('denied');}finally{before.key.fill(0);}
   // Current selection authorizes acknowledgement of an already committed fact;
   // the original profile/source lineage remains immutable and no new save occurs.
   return finish(token,c,row,true);
  });
 }
 async function status(token,input){
  const c=selection(input);
  return serial(async()=>{
   const before=await snapshot(token,c);
   try{
    await inspect(before);
    return await withSession(token,async(tx,actor)=>{
     const s=await scope(tx,actor,c),rows=await commandRows(tx,s.h);sameSnapshot(before,{s,rows});
     const own=rows.filter(r=>r.adult_id===s.adult&&r.child_id===s.child&&integer(r.consent_epoch)===s.epoch),latest=new Map(),saved=[];
     for(const r of own)latest.set(r.request_id,r);
     for(const r of latest.values()){
      if(!r.acknowledged)continue;
      const request=(await tx.query('SELECT original_received_at FROM wonder_requests WHERE household_id=$1 AND request_id=$2',[s.h,r.request_id])).rows[0];if(!request)fail('recovery_quarantined');if(request.original_received_at!==null)continue;
      await savedOnly(tx,s,r.request_id);
      const max=(await tx.query('SELECT max(source_scope_version) version FROM request_source_scopes WHERE household_id=$1 AND request_id=$2',[s.h,r.request_id])).rows[0];if(integer(max.version)!==integer(r.source_scope_version))fail('recovery_quarantined');
      const p=await source(tx,r);saved.push({request_id:r.request_id,source_scope_version:integer(r.source_scope_version),question:decode(p.question_utf16_base64,4000),parent_context:decode(p.parent_context_utf16_base64,2000)});
     }
     return {...base('capture_ready'),view_context:s.context,child_id:s.child,profile_version:s.profile,saved,pending:own.filter(r=>!r.acknowledged).map(reference),writes_closed:journalHealth.failed||rows.some(r=>!r.acknowledged)};
    });
   }finally{before.key.fill(0);}
  });
 }
 async function question(tx,input){
  const v=ownData(input,['household_id','request_id','source_scope_version','payload_ref']);
  if(!wonderUUID(v.household_id)||!wonderUUID(v.request_id)||!Number.isSafeInteger(v.source_scope_version)||v.source_scope_version<1||typeof v.payload_ref!=='string')fail('validation_failed');
  // Trusted caller owns authorization and transaction. No journal IO or session nesting.
  const r=(await tx.query(`SELECT p.*,c.acknowledged,c.result_ref,c.recovery_record,c.command_id,c.canonical_digest,c.child_id,c.consent_epoch AS command_epoch,s.payload_ref AS scope_ref
   FROM wonder_source_payloads p JOIN wonder_capture_commands c ON c.household_id=p.household_id AND c.command_id=p.capture_command_id AND c.request_id=p.request_id AND c.source_scope_version=p.source_scope_version
   JOIN request_source_scopes s ON s.household_id=p.household_id AND s.request_id=p.request_id AND s.source_scope_version=p.source_scope_version
   WHERE p.household_id=$1 AND p.request_id=$2 AND p.source_scope_version=$3`,[v.household_id.toLowerCase(),v.request_id.toLowerCase(),v.source_scope_version])).rows[0];
  if(!r||!r.acknowledged||r.payload_ref!==v.payload_ref||r.scope_ref!==v.payload_ref||r.result_ref!=='wonder-fsync:'+r.recovery_record.record_id||r.recovery_record.command_id!==r.command_id||r.recovery_record.canonical_digest!==r.canonical_digest||integer(r.command_epoch)!==integer(r.consent_epoch))fail('recovery_quarantined');
  const text=decode(r.question_utf16_base64,4000);if(typeof text!=='string'||!text.trim())fail('recovery_quarantined');return {question:text};
 }
 return Object.freeze({status,save,reconcile,question});
}
