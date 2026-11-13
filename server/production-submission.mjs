// CODEX-04-B. Disconnected synthetic service; no hosted durability claim.
import {createHash,randomUUID} from 'node:crypto';
import {ownData,ownMethod,environmentSnapshot,canonical,privateKey,uuid,keyed,isSyntheticProductionJournal,productionError} from './production-journal.mjs';
const fail=code=>{throw productionError(code);};
const first=async(tx,sql,args=[])=>(await tx.query(sql,args)).rows[0];
const same=(a,b)=>canonical(a)===canonical(b);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const number=v=>{const n=Number(v);if(!positive(n))fail('recovery_quarantined');return n;};
const clone=v=>structuredClone(v);
const selectionFields=['view_context','child_id','profile_version'];
const commandFields=['contract_version','record_type','command','idempotency_key','child_id','wonder_id','wonder_version','consent_epoch','offer_version','scope_version'];
let tail=Promise.resolve();
function serial(work){const result=tail.then(work);tail=result.catch(()=>{});return result;}
function select(input){
 const s=ownData(input,selectionFields);
 if(typeof s.view_context!=='string'||!/^[0-9a-f]{64}$/.test(s.view_context)||!uuid(s.child_id)||!positive(s.profile_version))fail('validation_failed');
 return {...s,child_id:s.child_id.toLowerCase()};
}
function command(input){
 const c=ownData(input,commandFields);
 if(c.contract_version!=='1.1.0'||c.record_type!=='submit'||c.command!=='SubmitProduction'||!uuid(c.idempotency_key)||!uuid(c.child_id)||!uuid(c.wonder_id)||!uuid(c.offer_version)||!positive(c.wonder_version)||!positive(c.consent_epoch)||!positive(c.scope_version))fail('validation_failed');
 for(const k of ['idempotency_key','child_id','wonder_id','offer_version'])c[k]=c[k].toLowerCase();return c;
}
function instant(v){
 if(typeof v!=='string')fail('validation_failed');const n=Date.parse(v);
 if(!Number.isSafeInteger(n)||n<0||n>253402214399000||new Date(n).toISOString()!==v)fail('validation_failed');return n;
}
function receiptTime(n){
 if(!Number.isSafeInteger(n)||n%1000||n<0)fail('ineligible');const s=new Date(n).toISOString();
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(s))fail('ineligible');return s.replace('.000Z','Z');
}
function capacityCopy(input){
 if(input===undefined||input===null)return null;
 const c=ownData(input,['policy_version','offer_version','bucket_id','starts_at','ends_at','limit','coverage_end','synthetic_only']);
 if(c.policy_version!=='TEST-CAPACITY-v1'||!uuid(c.offer_version)||!uuid(c.bucket_id)||!positive(c.limit)||c.synthetic_only!==true)fail('validation_failed');
 if(instant(c.ends_at)<=instant(c.starts_at)||instant(c.coverage_end)<instant(c.ends_at))fail('validation_failed');
 return Object.freeze({...c,offer_version:c.offer_version.toLowerCase(),bucket_id:c.bucket_id.toLowerCase()});
}
const receipt=row=>({receipt_id:row.receipt_id,request_id:row.request_id,booking_id:row.booking_id,claim_id:row.claim_id,period_id:row.period_id,original_received_at:receiptTime(new Date(row.original_received_at).getTime()),original_due_at:receiptTime(new Date(row.original_due_at).getTime()),deadline_interval_seconds:86400});
const result=(key,id,status,version=0)=>({contract_version:'1.1.0',record_type:'result',command:'SubmitProduction',command_id:id,idempotency_key:key,status,aggregate_version:version});
const benign=new Set(['ineligible','quota_full','no_capacity','configuration_missing']);

export async function createSyntheticProductionSubmission(input){
 const o=ownData(input,['env','db','access','capture','kernel','journal','keys','capacity'],['clock','policyVersion']);environmentSnapshot(o.env);
 const {db,journal}=o,clock=o.clock??Date.now,capacity=capacityCopy(o.capacity);
 if((o.policyVersion??'TEST-v1')!=='TEST-v1'||typeof clock!=='function'||!isSyntheticProductionJournal(journal))fail('validation_failed');
 const withSession=ownMethod(o.access,'withSession'),question=ownMethod(o.capture,'question'),apply=ownMethod(o.kernel,'apply'),readAllowance=ownMethod(o.kernel,'readAllowance'),keyForHousehold=ownMethod(o.keys,'keyForHousehold');
 const append=ownMethod(journal,'append'),records=ownMethod(journal,'records'),fact=ownMethod(journal,'fact'),seal=ownMethod(journal,'seal');
 const namespace=journal.namespace_verifier;
 if(typeof namespace!=='string'||!/^[0-9a-f]{64}$/.test(namespace))fail('validation_failed');
 const now=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<0||n>253402214399000)fail('validation_failed');return n;};now();
 const {PGlite}=await import('@electric-sql/pglite');if(!(db instanceof PGlite))fail('validation_failed');
 if(!await first(db,'SELECT version FROM schema_migrations WHERE version=11'))fail('configuration_missing');
 function material(h){try{return privateKey(keyForHousehold(h));}catch{fail('recovery_quarantined');}}
 async function bucket(tx,lock=false){
  if(!capacity)fail('configuration_missing');
  const b=await first(tx,'SELECT * FROM production_capacity_buckets WHERE bucket_id=$1'+(lock?' FOR UPDATE':''),[capacity.bucket_id]);
  if(!b||!same({policy_version:b.policy_version,offer_version:b.offer_version,bucket_id:b.bucket_id,starts_at:new Date(b.starts_at).toISOString(),ends_at:new Date(b.ends_at).toISOString(),coverage_end:new Date(b.coverage_end).toISOString(),limit:Number(b.limit),synthetic_only:b.synthetic_only},capacity))fail('recovery_quarantined');return b;
 }
 if(capacity)await serial(()=>db.transaction(async tx=>{
  await tx.query(`INSERT INTO production_capacity_buckets(bucket_id,policy_version,offer_version,starts_at,ends_at,coverage_end,"limit",synthetic_only) VALUES($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT DO NOTHING`,[capacity.bucket_id,capacity.policy_version,capacity.offer_version,capacity.starts_at,capacity.ends_at,capacity.coverage_end,capacity.limit]);await bucket(tx,true);
 }));
 async function scope(tx,actor,s){
  const c=await first(tx,'SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[actor.householdId]);
  if(!c||c.state!=='active'||c.policy_version!=='TEST-v1')fail('denied');const epoch=number(c.consent_epoch);
  const profiles=(await tx.query('SELECT * FROM child_setup_profiles WHERE household_id=$1 ORDER BY child_id FOR UPDATE',[actor.householdId])).rows;
  if(profiles.length>100||!profiles.some(p=>p.is_initial)||profiles.some(p=>number(p.consent_epoch)!==epoch))fail('denied');
  const child=profiles.find(p=>p.child_id===s.child_id),context=createHash('sha256').update(JSON.stringify(['synthetic-family-space-v1',actor.adultId,actor.householdId,epoch,'TEST-v1'])).digest('hex');
  if(!child||number(child.current_version)!==s.profile_version||context!==s.view_context)fail('denied');
  return {h:actor.householdId,adult:actor.adultId,child:s.child_id,profile:s.profile_version,epoch,context};
 }
 const fingerprint=(key,s,c)=>keyed(key,'command',{household_id:s.h,adult_id:s.adult,consent_epoch:s.epoch,command:c});
 async function rows(tx,h){const r=(await tx.query('SELECT * FROM production_commands WHERE household_id=$1 ORDER BY command_id LIMIT 1001',[h])).rows;if(r.length>1000)fail('recovery_quarantined');return r;}
 async function verify(tx,row,key){
  if(row.namespace_verifier!==namespace)fail('recovery_quarantined');const f=fact(row.sealed_record),c=command(f.command);
  if(f.household_id!==row.household_id||f.adult_id!==row.adult_id||f.command_id!==row.command_id||f.record_id!==row.record_id||f.primary_commit_id!==row.primary_commit_id||f.canonical_digest!==row.canonical_digest||f.namespace_verifier!==namespace||c.idempotency_key!==row.idempotency_key||c.child_id!==row.child_id||c.wonder_id!==row.request_id||c.wonder_version!==number(row.wonder_version)||c.scope_version!==number(row.scope_version)||c.consent_epoch!==number(row.consent_epoch)||!same(f.binding,{profile_version:number(row.profile_version),consent_epoch:number(row.consent_epoch),wonder_version:number(row.wonder_version),scope_version:number(row.scope_version)})||fingerprint(key,{h:row.household_id,adult:row.adult_id,epoch:number(row.consent_epoch)},c)!==row.canonical_digest)fail('recovery_quarantined');
  const r=await first(tx,`SELECT r.*,w.original_received_at AS request_received,b.bucket_id,c.reservation_id,c.source_scope_version AS capacity_scope FROM production_receipts r JOIN wonder_requests w USING(household_id,request_id) JOIN production_capacity_bookings b USING(household_id,request_id,booking_id) JOIN capacity_reservations c ON c.household_id=b.household_id AND c.reservation_id=b.booking_id AND c.request_id=b.request_id JOIN entitlement_claims e ON e.household_id=r.household_id AND e.request_id=r.request_id AND e.period_id=r.period_id WHERE r.household_id=$1 AND r.receipt_id=$2`,[row.household_id,row.receipt_id]);
  if(!r||r.request_id!==row.request_id||new Date(r.request_received).getTime()!==new Date(r.original_received_at).getTime()||number(r.capacity_scope)!==c.scope_version||!same(receipt(r),f.receipt))fail('recovery_quarantined');
  const a=await first(tx,'SELECT * FROM production_acknowledgements WHERE household_id=$1 AND command_id=$2',[row.household_id,row.command_id]);
  if(a&&(a.record_id!==row.record_id||a.primary_commit_id!==row.primary_commit_id||a.durability_ref!=='production-fsync:'+row.record_id))fail('recovery_quarantined');return {f,ack:!!a};
 }
 async function snapshot(token,s){return withSession(token,async(tx,actor)=>{
  const scoped=await scope(tx,actor,s),key=material(scoped.h);try{const list=await rows(tx,scoped.h),facts=[];for(const r of list)facts.push(await verify(tx,r,key));return {s:scoped,rows:list,facts};}finally{key.fill(0);}
 });}
 async function inspect(before){
  const durable=await records(before.s.h),found=new Set();
  for(const r of durable){const p=before.rows.find(v=>v.command_id===r.command_id);if(!p||!same(p.sealed_record,r))fail('recovery_quarantined');fact(r);found.add(r.command_id);}
  for(let i=0;i<before.rows.length;i++)if(before.facts[i].ack&&!found.has(before.rows[i].command_id))fail('recovery_quarantined');
 }
 function own(row,s){if(!row||row.adult_id!==s.adult||row.child_id!==s.child||number(row.consent_epoch)!==s.epoch||number(row.profile_version)>s.profile)fail('denied');}
 async function finish(token,s,row){
  const before=await snapshot(token,s);own(row,before.s);const current=before.rows.find(r=>r.command_id===row.command_id);
  if(!current||!same(current,row))fail('recovery_quarantined');await inspect(before);
  let ref;
  try{ref=await append(row.sealed_record);}catch(e){
   if(e?.code==='recovery_quarantined')throw e;
   return withSession(token,async(tx,actor)=>{const scoped=await scope(tx,actor,s);own(row,scoped);const actual=await first(tx,'SELECT * FROM production_commands WHERE household_id=$1 AND command_id=$2',[scoped.h,row.command_id]);if(!actual||!same(actual,row))fail('recovery_quarantined');return result(row.idempotency_key,row.command_id,'retryable_unacknowledged',1);});
  }
  if(ref!=='production-fsync:'+row.record_id||!(await records(before.s.h)).some(r=>same(r,row.sealed_record)))fail('recovery_quarantined');
  return withSession(token,async(tx,actor)=>{
   const scoped=await scope(tx,actor,s);own(row,scoped);const actual=await first(tx,'SELECT * FROM production_commands WHERE household_id=$1 AND command_id=$2',[scoped.h,row.command_id]);
   if(!actual||!same(actual,row))fail('recovery_quarantined');const key=material(scoped.h);
   try{const checked=await verify(tx,actual,key);if(!checked.ack)await tx.query('INSERT INTO production_acknowledgements(household_id,command_id,record_id,primary_commit_id,durability_ref) VALUES($1,$2,$3,$4,$5)',[scoped.h,row.command_id,row.record_id,row.primary_commit_id,ref]);return {...result(row.idempotency_key,row.command_id,'acknowledged',1),receipt:clone(checked.f.receipt),primary_commit_id:row.primary_commit_id,durability_ref:ref};}finally{key.fill(0);}
  });
 }
 async function source(tx,s,id,version){
  const w=await first(tx,'SELECT * FROM wonder_requests WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[s.h,id]);if(!w||w.child_id!==s.child)fail('denied');
  const latest=await first(tx,'SELECT * FROM request_source_scopes WHERE household_id=$1 AND request_id=$2 ORDER BY source_scope_version DESC LIMIT 1',[s.h,id]);
  const owner=await first(tx,'SELECT * FROM wonder_capture_commands WHERE household_id=$1 AND request_id=$2 AND source_scope_version=$3',[s.h,id,version]);
  if(!latest||number(latest.source_scope_version)!==version||!owner||owner.child_id!==s.child||owner.adult_id!==s.adult||number(owner.consent_epoch)!==s.epoch||number(owner.profile_version)>s.profile||!owner.acknowledged)fail('denied');
  await question(tx,{household_id:s.h,request_id:id,source_scope_version:version,payload_ref:latest.payload_ref});return w;
 }
 async function period(tx,s,at){
  await tx.query('SELECT entitlement_id FROM entitlements WHERE household_id=$1 ORDER BY entitlement_id FOR UPDATE',[s.h]);
  const list=(await tx.query("SELECT * FROM entitlement_periods WHERE household_id=$1 AND (allocation_scope='household' OR child_id=$2) ORDER BY period_id FOR UPDATE",[s.h,s.child])).rows;
  if(list.length>100)fail('configuration_missing');let full=false;
  for(const p of list){
   const v=p.policy_json;if(!v||v.synthetic!==true||v.policy_version!==p.policy_version||Number(p.allowance)!==v.allowance||v.allocation_scope!==p.allocation_scope)fail('configuration_missing');
   if(at<new Date(p.trial_start).getTime()||at>=new Date(p.trial_end).getTime())continue;
   if(p.policy_version==='TEST-CONTINUATION-v1'){
    const g=await first(tx,`SELECT g.period_id FROM continuation_grants g JOIN continuation_commands c ON c.household_id=g.household_id AND c.command_id=g.command_id AND c.period_id=g.period_id AND c.entitlement_id=g.entitlement_id AND c.consent_epoch=g.consent_epoch AND c.policy_version=g.policy_version AND c.actor_id=g.actor_id AND c.canonical_digest=g.canonical_digest AND c.primary_commit_id=g.primary_commit_id AND c.result_ref=g.result_ref WHERE g.household_id=$1 AND g.period_id=$2 AND g.entitlement_id=$3 AND g.consent_epoch=$4 AND c.acknowledged=true AND g.policy_version='TEST-CONTINUATION-v1' AND g.durability_ref='continuation-fsync:'||c.record_id::text`,[s.h,p.period_id,p.entitlement_id,s.epoch]);if(!g)continue;
   }
   const counts=await readAllowance(tx,{household_id:s.h,consent_epoch:s.epoch},{period_id:p.period_id});if(counts.remaining>0)return p;full=true;
  }
  fail(full?'quota_full':list.length?'ineligible':'configuration_missing');
 }
 function offer(key,s,p,id,version){const hash=keyed(key,'offer',{capacity,household_id:s.h,adult_id:s.adult,child_id:s.child,profile_version:s.profile,consent_epoch:s.epoch,period_id:p.period_id,wonder_id:id,wonder_version:version});return hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-8'+hash.slice(17,20)+'-'+hash.slice(20,32);}
 function timeAllowed(p,b,actual){const rounded=Math.floor(actual/1000)*1000;for(const t of [actual,rounded])if(t<new Date(p.trial_start).getTime()||t>=new Date(p.trial_end).getTime()||t<new Date(b.starts_at).getTime()||t>=new Date(b.ends_at).getTime())fail('ineligible');if(rounded+86400000>new Date(b.coverage_end).getTime())fail('configuration_missing');receiptTime(rounded);receiptTime(rounded+86400000);return rounded;}
 async function available(tx,b){const r=await first(tx,"SELECT count(*) n FROM production_capacity_bookings b JOIN capacity_reservations c ON c.household_id=b.household_id AND c.request_id=b.request_id AND c.reservation_id=b.booking_id WHERE b.bucket_id=$1 AND c.state IN ('booked','completed')",[b.bucket_id]);if(Number(r.n)>=Number(b.limit))fail('no_capacity');}
 async function eligibility(token,input){
  const v=ownData(input,['selection','wonder_id','wonder_version']),s=select(v.selection);if(!uuid(v.wonder_id)||!positive(v.wonder_version))fail('validation_failed');const id=v.wonder_id.toLowerCase(),version=v.wonder_version;
  return serial(async()=>{const before=await snapshot(token,s);await inspect(before);return withSession(token,async(tx,actor)=>{
   const scoped=await scope(tx,actor,s);await source(tx,scoped,id,version);
   try{if(before.rows.some((r,i)=>!before.facts[i].ack))fail('configuration_missing');const p=await period(tx,scoped,now()),b=await bucket(tx,true);timeAllowed(p,b,now());await available(tx,b);const key=material(scoped.h);try{return {status:'eligible',offer_version:offer(key,scoped,p,id,version),consent_epoch:scoped.epoch,scope_version:version};}finally{key.fill(0);}}catch(e){if(benign.has(e?.code))return {status:e.code};throw e;}
  });});
 }
 async function submit(token,input){
  const v=ownData(input,['selection','command']),s=select(v.selection),c=command(v.command);if(s.child_id!==c.child_id)fail('denied');
  return serial(async()=>{
   const before=await snapshot(token,s);await inspect(before);let row;
   try{row=await withSession(token,async(tx,actor)=>{
    const scoped=await scope(tx,actor,s),list=await rows(tx,scoped.h),key=material(scoped.h);
    try{
     if(!same(list,before.rows)||!same(scoped,before.s))fail('conflict');
     const prior=list.find(r=>r.idempotency_key===c.idempotency_key),digest=fingerprint(key,scoped,c);
     if(prior){own(prior,scoped);if(prior.canonical_digest!==digest)fail('conflict');return prior;}
     if(c.consent_epoch!==scoped.epoch)fail('denied');const w=await source(tx,scoped,c.wonder_id,c.wonder_version);
     if(c.scope_version!==c.wonder_version)fail('conflict');if(w.original_received_at!==null||list.some(r=>r.request_id===c.wonder_id))fail('conflict');
     const p=await period(tx,scoped,now()),b=await bucket(tx,true),actual=now(),received=timeAllowed(p,b,actual);await available(tx,b);
     if(c.offer_version!==offer(key,scoped,p,c.wonder_id,c.wonder_version))fail('conflict');
     if(list.some((r,i)=>!before.facts[i]?.ack)||list.length>=1000)fail('configuration_missing');
     // All new effects are in this issuer/household/request/period/bucket transaction.
     const commandId=randomUUID(),recordId=randomUUID(),commitId=randomUUID(),bookingId=randomUUID();
     await tx.query('UPDATE wonder_requests SET original_received_at=$3 WHERE household_id=$1 AND request_id=$2 AND original_received_at IS NULL',[scoped.h,c.wonder_id,receiptTime(received)]);
     await apply(tx,{household_id:scoped.h,consent_epoch:scoped.epoch},{contract_version:'1.1.0',transition_id:commandId,request_id:c.wonder_id,period_id:p.period_id,policy_version:p.policy_version,expected_version:0,consent_epoch:scoped.epoch,quantity:1,kind:'hold',from:'none',to:'pending',cause:'SubmitProduction',cause_id:c.idempotency_key},{});
     await tx.query("INSERT INTO capacity_reservations(household_id,reservation_id,request_id,source_scope_version,units,idempotency_key,state) VALUES($1,$2,$3,$4,1,$5,'booked')",[scoped.h,bookingId,c.wonder_id,c.scope_version,commandId]);
     await tx.query('INSERT INTO production_capacity_bookings(household_id,request_id,booking_id,bucket_id) VALUES($1,$2,$3,$4)',[scoped.h,c.wonder_id,bookingId,b.bucket_id]);
     const r={receipt_id:randomUUID(),request_id:c.wonder_id,booking_id:bookingId,claim_id:randomUUID(),period_id:p.period_id,original_received_at:receiptTime(received),original_due_at:receiptTime(received+86400000),deadline_interval_seconds:86400};
     await tx.query('INSERT INTO production_receipts(household_id,receipt_id,request_id,booking_id,claim_id,period_id,original_received_at,original_due_at,deadline_interval_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,86400)',[scoped.h,r.receipt_id,r.request_id,r.booking_id,r.claim_id,r.period_id,r.original_received_at,r.original_due_at]);
     const sealed=seal({format:'production-committed-fact-v1',household_id:scoped.h,adult_id:scoped.adult,command_id:commandId,record_id:recordId,primary_commit_id:commitId,canonical_digest:digest,namespace_verifier:namespace,command:c,receipt:r,binding:{profile_version:scoped.profile,consent_epoch:scoped.epoch,wonder_version:c.wonder_version,scope_version:c.scope_version}});
     await tx.query('INSERT INTO production_commands(household_id,command_id,idempotency_key,adult_id,child_id,profile_version,consent_epoch,request_id,wonder_version,scope_version,receipt_id,canonical_digest,namespace_verifier,primary_commit_id,record_id,sealed_record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[scoped.h,commandId,c.idempotency_key,scoped.adult,scoped.child,scoped.profile,scoped.epoch,c.wonder_id,c.wonder_version,c.scope_version,r.receipt_id,digest,namespace,commitId,recordId,JSON.stringify(sealed)]);
     // Crossing expiry while doing SQL rolls the entire NEW command back.
     timeAllowed(p,b,now());return await first(tx,'SELECT * FROM production_commands WHERE household_id=$1 AND command_id=$2',[scoped.h,commandId]);
    }finally{key.fill(0);}
   });}catch(e){if(benign.has(e?.code))return result(c.idempotency_key,randomUUID(),e.code);throw e;}
   return finish(token,s,row);
  });
 }
 async function status(token,input){const s=select(input);return serial(async()=>{
  const before=await snapshot(token,s);await inspect(before);return withSession(token,async(tx,actor)=>{
   const scoped=await scope(tx,actor,s),list=await rows(tx,scoped.h);if(!same(scoped,before.s)||!same(list,before.rows))fail('conflict');
   return {status:'production_status',pending:list.filter((r,i)=>!before.facts[i].ack&&r.adult_id===scoped.adult&&r.child_id===scoped.child&&number(r.consent_epoch)===scoped.epoch&&number(r.profile_version)<=scoped.profile).map(r=>({idempotency_key:r.idempotency_key,wonder_id:r.request_id,wonder_version:number(r.wonder_version)})),writes_closed:before.facts.some(f=>!f.ack)};
  });
 });}
 async function reconcile(token,input){const v=ownData(input,['selection','idempotency_key']),s=select(v.selection);if(!uuid(v.idempotency_key))fail('validation_failed');const id=v.idempotency_key.toLowerCase();return serial(async()=>{
  const before=await snapshot(token,s);await inspect(before);const row=before.rows.find(r=>r.idempotency_key===id);own(row,before.s);return finish(token,s,row);
 });}
 return Object.freeze({eligibility,submit,status,reconcile});
}
