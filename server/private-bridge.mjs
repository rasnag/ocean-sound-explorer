// Trusted backend action only. No HTTP mutation, Start, grant or notification port.
// Architecture v1.2 / 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {ownData,ownMethod,canonical,privateKey,uuid,environmentSnapshot} from './continuation-journal.mjs';
import {serializeQueueWork} from './request-queue.mjs';
import {isSyntheticPrivateBridgeJournal} from './private-bridge-journal.mjs';
const adapters=new WeakMap();
export const isSyntheticPrivateBridgeFamilyAdapter=(value,db)=>adapters.get(value)===db;
const codes={validation_failed:400,denied:403,conflict:409,configuration_missing:503,journal_unavailable:503,recovery_quarantined:503};
const error=code=>Object.assign(new Error('Local TEST readiness unavailable.'),{code,status:codes[code]});
const fail=code=>{throw error(code);};
const normalize=e=>error(Object.hasOwn(codes,e?.code)?e.code:[401,403].includes(e?.status)?'denied':'configuration_missing');
const first=async(tx,q,a=[])=>(await tx.query(q,a)).rows[0];
const copy=v=>JSON.parse(canonical(v)),same=(a,b)=>canonical(a)===canonical(b);
const integer=(v,min=0)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>=Number.MAX_SAFE_INTEGER)fail('recovery_quarantined');return n;};
const positive=n=>Number.isSafeInteger(n)&&n>0&&n<Number.MAX_SAFE_INTEGER;
const hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const iso=v=>new Date(v).toISOString(),hash=v=>createHash('sha256').update(v).digest('hex');
const pinFields=['producer_version','household_id','request_id','child_id','consent_epoch','profile_version','source_scope_version','queue_scope_version','agreement_version','generation_job_id','generation_version','generation_fence','revision_id','output_digest','review_version','review_command_id','review_record_id','review_primary_commit_id','snapshot_id','snapshot_command_id','snapshot_record_id','snapshot_primary_commit_id'];
function source(value){const p=ownData(value,pinFields);for(const k of pinFields){if(k.endsWith('_id')&&!uuid(p[k]))fail('validation_failed');}if(p.producer_version!=='review-bridge-source-v1'||!hex(p.output_digest)||['consent_epoch','profile_version','source_scope_version','queue_scope_version','generation_version','review_version'].some(k=>!positive(p[k]))||['agreement_version','generation_fence'].some(k=>!Number.isSafeInteger(p[k])||p[k]<0||p[k]>=Number.MAX_SAFE_INTEGER))fail('validation_failed');return copy(p);}
function scope(value,extra){const s=ownData(value,['household_id','request_id','scope_version',...extra]);if(!uuid(s.household_id)||!uuid(s.request_id)||!positive(s.scope_version))fail('validation_failed');return s;}
function envelope(value){const v=scope(value,['command']),c=ownData(v.command,['command_id','expected_version','action','source']);if(!uuid(c.command_id)||c.expected_version!==0||c.action!=='MakeAssignmentReady')fail('validation_failed');return copy({household_id:v.household_id,request_id:v.request_id,scope_version:v.scope_version,command:{...c,source:source(c.source)}});}
function recovery(value){const v=scope(value,['command_id']);if(!uuid(v.command_id))fail('validation_failed');return copy(v);}
export async function createSyntheticPrivateBridge(input){try{return await build(input);}catch(e){throw normalize(e);}}
async function build(input){
 const o=ownData(input,['env','db','auth','review','queue','kernel','journal','keys','policyVersion','clock']);environmentSnapshot(o.env);
 const {db,journal}=o;if(!(db instanceof PGlite)||o.policyVersion!=='TEST-v1'||typeof o.clock!=='function'||!isSyntheticPrivateBridgeJournal(journal))fail('configuration_missing');
 const requireFounder=ownMethod(o.auth,'requireFounder'),project=ownMethod(o.queue,'project'),apply=ownMethod(o.kernel,'apply');
 const acquire=ownMethod(o.review,'acquireBridgeSource'),assertSource=ownMethod(o.review,'assertBridgeActivation'),published=ownMethod(o.review,'readPublishedBridgeSnapshot');
 ownData(o.keys,['keyForHousehold']);const keyForHousehold=ownMethod(o.keys,'keyForHousehold');
 const seal=ownMethod(journal,'seal'),fact=ownMethod(journal,'fact'),append=ownMethod(journal,'append'),records=ownMethod(journal,'records'),claim=ownMethod(journal,'claimFreshNamespace');
 const namespace=journal.namespace_verifier;if(!hex(namespace))fail('configuration_missing');let closed=false;
 const now=()=>{const n=o.clock();if(!Number.isSafeInteger(n)||n<0||n>253402300799999)fail('configuration_missing');return n;};now();
 function digest(h,actor,epoch,value){const key=privateKey(keyForHousehold(h));try{return createHmac('sha256',key).update('private-readiness-local-01\0command\0').update(canonical({actor_id:actor,consent_epoch:epoch,command:value})).digest('hex');}finally{key.fill(0);}}
 async function founder(tx,token,id){const i=await first(tx,'SELECT role,enabled FROM founder_identities WHERE identity_id=$1 FOR UPDATE',[id]),s=await first(tx,'SELECT * FROM founder_sessions WHERE token_hash=$1 FOR UPDATE',[hash(token)]);if(!i?.enabled||i.role!=='founder'||!s||s.identity_id!==id||s.revoked_at||now()>=new Date(s.expires_at).getTime())fail('denied');}
 async function resources(tx,h,r){
  const receipt=await first(tx,'SELECT * FROM production_receipts WHERE household_id=$1 AND request_id=$2',[h,r]);if(!receipt)fail('conflict');
  const mapping=await first(tx,'SELECT * FROM production_capacity_bookings WHERE household_id=$1 AND request_id=$2',[h,r]);if(!mapping||mapping.booking_id!==receipt.booking_id)fail('recovery_quarantined');
  const identity=await first(tx,'SELECT entitlement_id FROM entitlement_periods WHERE household_id=$1 AND period_id=$2',[h,receipt.period_id]);if(!identity)fail('recovery_quarantined');
  if(!await first(tx,'SELECT entitlement_id FROM entitlements WHERE household_id=$1 AND entitlement_id=$2 FOR UPDATE',[h,identity.entitlement_id]))fail('recovery_quarantined');
  const period=await first(tx,'SELECT * FROM entitlement_periods WHERE household_id=$1 AND period_id=$2 FOR UPDATE',[h,receipt.period_id]);
  const claimRow=await first(tx,'SELECT * FROM entitlement_claims WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[h,r]);
  const bucket=await first(tx,'SELECT * FROM production_capacity_buckets WHERE bucket_id=$1 FOR UPDATE',[mapping.bucket_id]);
  const capacity=await first(tx,'SELECT * FROM capacity_reservations WHERE household_id=$1 AND reservation_id=$2 FOR UPDATE',[h,receipt.booking_id]);
  const again=await first(tx,'SELECT * FROM production_capacity_bookings WHERE household_id=$1 AND request_id=$2',[h,r]);
  if(!period||!claimRow||!bucket?.synthetic_only||!capacity||!same(mapping,again)||claimRow.period_id!==period.period_id||capacity.request_id!==r)fail('recovery_quarantined');
  return {receipt,mapping,period,claim:claimRow,capacity};
 }
 async function authority(token,s,work){
  if(closed)fail('configuration_missing');let actor;try{actor=await requireFounder(token);}catch{fail('denied');}if(!uuid(actor?.identityId))fail('denied');
  return serializeQueueWork(()=>db.transaction(async tx=>{
   if(!await first(tx,'SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[s.household_id]))fail('denied');
   const consent=await first(tx,'SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[s.household_id]);if(!consent||consent.state!=='active'||consent.policy_version!=='TEST-v1')fail('denied');
   await founder(tx,token,actor.identityId);
   const request=await first(tx,'SELECT * FROM wonder_requests WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[s.household_id,s.request_id]);if(!request)fail('denied');
   await tx.query('SELECT child_id FROM children WHERE household_id=$1 AND child_id=$2 FOR UPDATE',[s.household_id,request.child_id]);
   const profile=await first(tx,'SELECT * FROM child_setup_profiles WHERE household_id=$1 AND child_id=$2 FOR UPDATE',[s.household_id,request.child_id]);if(!profile||integer(profile.consent_epoch,1)!==integer(consent.consent_epoch,1))fail('denied');
   const a={h:s.household_id,id:actor.identityId,epoch:integer(consent.consent_epoch,1),child:request.child_id,profile:integer(profile.current_version,1),session:hash(token),resources:await resources(tx,s.household_id,s.request_id)};
   const result=await work(tx,a);await founder(tx,token,a.id);const end=await first(tx,'SELECT state,consent_epoch FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1',[a.h]);if(end?.state!=='active'||integer(end.consent_epoch,1)!==a.epoch)fail('denied');return result;
  }));
 }
 const trusted=(a,r,q)=>({household_id:a.h,request_id:r,child_id:a.child,consent_epoch:a.epoch,profile_version:a.profile,queue_scope_version:q});
 async function decode(row){
  try{
   const f=await fact(row.sealed_fact),v=envelope(f.command),p=v.command.source;
   ownData(f,['format','scope','household_id','command_id','record_id','primary_commit_id','actor_id','actor_kind','original_session_hash','consent_epoch','recorded_at','aggregate_version','canonical_digest','namespace_verifier','command','result','effect']);
   ownData(f.effect,['pin','request','binding','transition','event','delivery']);
   if(f.format!=='queue-committed-fact-v1'||f.scope!=='household'||f.actor_kind!=='founder'||f.household_id!==row.household_id||f.command_id!==row.command_id||f.record_id!==row.record_id||f.primary_commit_id!==row.primary_commit_id||f.actor_id!==row.actor_id||f.original_session_hash!==row.original_session_hash||f.consent_epoch!==integer(row.consent_epoch,1)||f.aggregate_version!==1||integer(row.version,1)!==1||f.recorded_at!==iso(row.recorded_at)||f.namespace_verifier!==namespace||row.namespace_verifier!==namespace||f.canonical_digest!==row.canonical_digest||digest(row.household_id,row.actor_id,f.consent_epoch,v)!==row.canonical_digest||v.household_id!==row.household_id||v.request_id!==row.request_id||v.scope_version!==integer(row.scope_version,1)||v.command.command_id!==row.command_id||p.child_id!==row.child_id||p.profile_version!==integer(row.profile_version,1)||p.consent_epoch!==f.consent_epoch||!same(p,f.effect.pin))fail('recovery_quarantined');
   const b=f.effect.binding,e=f.effect.event;
   if(b.household_id!==row.household_id||b.command_id!==row.command_id||b.request_id!==row.request_id||b.child_id!==row.child_id||b.source_scope_version!==p.source_scope_version||b.queue_scope_version!==p.queue_scope_version||b.snapshot_id!==p.snapshot_id||b.revision_id!==p.revision_id||b.transition_id!==row.command_id||!uuid(b.assignment_id)||e.ready_at!==f.recorded_at||e.command_id!==row.command_id||e.assignment_id!==b.assignment_id||e.revision_id!==b.revision_id)fail('recovery_quarantined');
   const base={synthetic_only:true,command_id:row.command_id,version:1,assignment_id:b.assignment_id,revision_id:b.revision_id,ready_at:f.recorded_at,delivery_state:'not_attempted',acknowledgement_scope:'single-host-process-recovery-only'};
   if(!same(f.result,base))fail('recovery_quarantined');return f;
  }catch{fail('recovery_quarantined');}
 }
 async function history(tx,h){
  const ns=await first(tx,'SELECT namespace_verifier FROM private_bridge_namespace WHERE singleton=true');if(ns?.namespace_verifier!==namespace)fail('recovery_quarantined');
  const rows=(await tx.query('SELECT * FROM private_bridge_commands WHERE household_id=$1 ORDER BY command_id LIMIT 1001',[h])).rows;if(rows.length>1000)fail('recovery_quarantined');
  const independent=await records(h),out=[];
  for(const r of independent){const row=rows.find(x=>x.command_id===r.command_id);if(!row||!same(row.sealed_fact,r))fail('recovery_quarantined');}
  for(const row of rows){
   const f=await decode(row),b=await first(tx,'SELECT to_jsonb(b) AS value FROM private_bridge_bindings b WHERE household_id=$1 AND command_id=$2',[h,row.command_id]);
   if(!b||!same(b.value,f.effect.binding)||!(await first(tx,'SELECT private_bridge_complete($1,$2) AS valid',[h,row.command_id]))?.valid)fail('recovery_quarantined');
   const event=await first(tx,"SELECT to_jsonb(e)-'ready_at' AS value,ready_at FROM private_bridge_ready_events e WHERE household_id=$1 AND command_id=$2",[h,row.command_id]);
   const expected={...f.effect.event};delete expected.ready_at;
   const transition=await first(tx,'SELECT to_jsonb(t) AS value FROM entitlement_transitions t WHERE household_id=$1 AND transition_id=$2',[h,row.command_id]);
   const delivery=await first(tx,'SELECT to_jsonb(d) AS value FROM private_bridge_delivery_work d WHERE household_id=$1 AND command_id=$2',[h,row.command_id]);
   if(!event||iso(event.ready_at)!==f.recorded_at||!same(event.value,expected)||!transition||!same(transition.value,f.effect.transition)||!delivery||!same(delivery.value,f.effect.delivery))fail('recovery_quarantined');
   const receipt=await first(tx,'SELECT * FROM production_receipts WHERE household_id=$1 AND receipt_id=$2',[h,f.effect.binding.receipt_id]),r=f.effect.request.receipt;
   if(!receipt||r.receipt_id!==receipt.receipt_id||r.request_id!==receipt.request_id||r.booking_id!==receipt.booking_id||r.claim_id!==receipt.claim_id||r.period_id!==receipt.period_id||r.deadline_interval_seconds!==86400||iso(r.original_received_at)!==iso(receipt.original_received_at)||iso(r.original_due_at)!==iso(receipt.original_due_at))fail('recovery_quarantined');
   const ack=await first(tx,'SELECT * FROM private_bridge_acks WHERE household_id=$1 AND command_id=$2',[h,row.command_id]);
   if(ack&&(ack.record_id!==row.record_id||ack.primary_commit_id!==row.primary_commit_id||ack.durability_ref!=='queue-fsync:'+row.record_id||!independent.some(x=>same(x,row.sealed_fact))||new Date(ack.acknowledged_at)<new Date(row.recorded_at)))fail('recovery_quarantined');
   out.push({row,f,ack});
  }
  const absent=(await tx.query('SELECT * FROM private_bridge_absences WHERE household_id=$1 LIMIT 65',[h])).rows;if(absent.length>64||absent.some(x=>rows.some(r=>r.command_id===x.command_id)))fail('recovery_quarantined');
  for(const tab of ['private_bridge_bindings','private_bridge_ready_events','private_bridge_delivery_work']){const n=await first(tx,'SELECT count(*) AS n FROM '+tab+' WHERE household_id=$1',[h]);if(integer(n.n)!==rows.length)fail('recovery_quarantined');}
  return out;
 }
 async function availability(tx,item,current){
  const p=item.f.effect.pin,b=item.f.effect.binding;
  // Always authenticate producer history, including while primary-only.
  let allowed=true;
  try{await published(tx,{household_id:b.household_id,request_id:b.request_id,child_id:b.child_id,consent_epoch:p.consent_epoch,profile_version:p.profile_version,queue_scope_version:b.queue_scope_version},p);}catch(e){if(e?.code==='denied')allowed=false;else throw e;}
  return !!item.ack&&allowed&&current.consent_epoch===p.consent_epoch&&current.profile_version===p.profile_version;
 }
 async function result(tx,item,a){return {...copy(item.f.result),status:item.ack?'acknowledged':'retryable_unacknowledged',acknowledged_at:item.ack?iso(item.ack.acknowledged_at):null,available:await availability(tx,item,{consent_epoch:a.epoch,profile_version:a.profile})};}
 function own(item,a,s){if(item.row.actor_id!==a.id||item.row.request_id!==s.request_id)fail('denied');}
 async function lookup(tx,a,s,id){const all=await history(tx,a.h),item=all.find(x=>x.row.command_id===id);if(item)own(item,a,s);return {all,item};}
 async function retired(tx,a,s,id){const z=await first(tx,'SELECT * FROM private_bridge_absences WHERE household_id=$1 AND command_id=$2',[a.h,id]);if(z){if(z.actor_id!==a.id||z.request_id!==s.request_id)fail('denied');fail('conflict');}}
 async function finish(token,s,row){
  const before=await authority(token,s,async(tx,a)=>{const {item}=await lookup(tx,a,s,row.command_id);if(!item||!same(item.row.sealed_fact,row.sealed_fact))fail('recovery_quarantined');return {item,result:await result(tx,item,a)};});if(before.item.ack)return before.result;
  let appended=false;try{const ref=await append(row.sealed_fact);if(ref!=='queue-fsync:'+row.record_id||!(await records(row.household_id)).some(x=>same(x,row.sealed_fact)))fail('recovery_quarantined');appended=true;}catch(e){if(e?.code==='recovery_quarantined')throw e;}
  return authority(token,s,async(tx,a)=>{
   const {item}=await lookup(tx,a,s,row.command_id);if(!item||!same(item.row.sealed_fact,row.sealed_fact))fail('recovery_quarantined');
   if(appended&&!item.ack){if(!(await records(a.h)).some(x=>same(x,row.sealed_fact)))fail('recovery_quarantined');await tx.query('INSERT INTO private_bridge_acks(household_id,command_id,record_id,primary_commit_id,durability_ref,acknowledged_at) VALUES($1,$2,$3,$4,$5,$6)',[a.h,row.command_id,row.record_id,row.primary_commit_id,'queue-fsync:'+row.record_id,iso(now())]);item.ack=await first(tx,'SELECT * FROM private_bridge_acks WHERE household_id=$1 AND command_id=$2',[a.h,row.command_id]);}
   return result(tx,item,a);
  });
 }
 async function makeReady(token,input){
  const v=envelope(input),s={household_id:v.household_id,request_id:v.request_id,scope_version:v.scope_version},c=v.command;
  const prior=await authority(token,s,async(tx,a)=>{const {all,item}=await lookup(tx,a,s,c.command_id);if(item){if(item.row.canonical_digest!==digest(a.h,a.id,a.epoch,v))fail('conflict');return item.row;}await retired(tx,a,s,c.command_id);if(all.some(x=>x.row.request_id===s.request_id))fail('conflict');return null;});if(prior)return finish(token,s,prior);
  const acquired=await acquire(token,{...s,snapshot_id:c.source.snapshot_id});ownData(acquired,['pin','request','adventure']);if(!same(source(acquired.pin),c.source))fail('conflict');
  const row=await authority(token,s,async(tx,a)=>{
   const {all,item}=await lookup(tx,a,s,c.command_id);if(item){if(item.row.canonical_digest!==digest(a.h,a.id,a.epoch,v))fail('conflict');return item.row;}
   await retired(tx,a,s,c.command_id);if(all.some(x=>x.row.request_id===s.request_id))fail('conflict');if(all.some(x=>!x.ack))fail('journal_unavailable');if(all.length>=1000)fail('configuration_missing');
   const r=a.resources;if(r.claim.state!=='reserved'||r.capacity.state!=='booked')fail('conflict');
   const q=await project(tx,{household_id:a.h,request_id:s.request_id,child_id:a.child,consent_epoch:a.epoch});if(q.state!=='accepted'||q.scope_version!==s.scope_version||q.source_scope_version!==integer(r.capacity.source_scope_version,1))fail('conflict');
   const verified=await assertSource(tx,trusted(a,s.request_id,s.scope_version),c.source);if(!same(verified,acquired))fail('conflict');
   if(await first(tx,'SELECT revision_id FROM adventure_revisions WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[a.h,s.request_id])||await first(tx,'SELECT assignment_id FROM assignments WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[a.h,s.request_id]))fail('conflict');
   const record_id=randomUUID(),primary_commit_id=randomUUID(),assignment_id=randomUUID(),at=iso(now()),p=c.source;
   const binding={household_id:a.h,command_id:c.command_id,request_id:s.request_id,child_id:a.child,source_scope_version:p.source_scope_version,queue_scope_version:s.scope_version,snapshot_id:p.snapshot_id,revision_id:p.revision_id,assignment_id,receipt_id:r.receipt.receipt_id,booking_id:r.receipt.booking_id,claim_id:r.receipt.claim_id,period_id:r.receipt.period_id,transition_id:c.command_id};
   await tx.query("INSERT INTO adventure_revisions(household_id,revision_id,request_id,source_scope_version,pattern_version,engine_version,status,payload_ref) VALUES($1,$2,$3,$4,'fixture-1','fixture-engine-1','published',$5)",[a.h,p.revision_id,s.request_id,p.source_scope_version,'private-bridge:'+record_id]);
   await tx.query('INSERT INTO published_revisions(household_id,revision_id) VALUES($1,$2)',[a.h,p.revision_id]);await tx.query('INSERT INTO assignments(household_id,assignment_id,request_id,child_id,revision_id) VALUES($1,$2,$3,$4,$5)',[a.h,assignment_id,s.request_id,a.child,p.revision_id]);
   const transition={contract_version:'1.1.0',transition_id:c.command_id,request_id:s.request_id,period_id:r.period.period_id,policy_version:r.period.policy_version,expected_version:integer(r.claim.version,1),consent_epoch:a.epoch,quantity:1,kind:'consume',from:'reserved',to:'consumed',cause:'MakeAssignmentReady',cause_id:c.command_id};
   await apply(tx,{household_id:a.h,consent_epoch:a.epoch},transition,{assignment_id});
   const completed=await tx.query("UPDATE capacity_reservations SET state='completed' WHERE household_id=$1 AND reservation_id=$2 AND request_id=$3 AND state='booked' RETURNING reservation_id",[a.h,r.receipt.booking_id,s.request_id]);if(completed.rows.length!==1)fail('conflict');
   const event={household_id:a.h,command_id:c.command_id,request_id:s.request_id,event_id:randomUUID(),capacity_event_id:randomUUID(),assignment_id,revision_id:p.revision_id,transition_id:c.command_id,bucket_id:r.mapping.bucket_id,booking_id:r.receipt.booking_id,before_state:'booked',after_state:'completed',ready_at:at};
   const delivery={household_id:a.h,command_id:c.command_id,assignment_id,synthetic_only:true,state:'not_attempted'};
   const base={synthetic_only:true,command_id:c.command_id,version:1,assignment_id,revision_id:p.revision_id,ready_at:at,delivery_state:'not_attempted',acknowledgement_scope:'single-host-process-recovery-only'};
   const canonical_digest=digest(a.h,a.id,a.epoch,v),f={format:'queue-committed-fact-v1',scope:'household',household_id:a.h,command_id:c.command_id,record_id,primary_commit_id,actor_id:a.id,actor_kind:'founder',original_session_hash:a.session,consent_epoch:a.epoch,recorded_at:at,aggregate_version:1,canonical_digest,namespace_verifier:namespace,command:v,result:base,effect:{pin:p,request:verified.request,binding,transition:{household_id:a.h,...transition,binding:{assignment_id}},event,delivery}};
   const sealed=await seal(f);
   await tx.query('INSERT INTO private_bridge_commands(household_id,command_id,request_id,child_id,scope_version,profile_version,consent_epoch,actor_id,original_session_hash,version,recorded_at,record_id,primary_commit_id,canonical_digest,namespace_verifier,sealed_fact) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12,$13,$14,$15::jsonb)',[a.h,c.command_id,s.request_id,a.child,s.scope_version,a.profile,a.epoch,a.id,a.session,at,record_id,primary_commit_id,canonical_digest,namespace,canonical(sealed)]);
   for(const [table,value]of [['private_bridge_bindings',binding],['private_bridge_ready_events',event],['private_bridge_delivery_work',delivery]]){const names=Object.keys(value);await tx.query('INSERT INTO '+table+'('+names.join(',')+') VALUES('+names.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(value));}
   return first(tx,'SELECT * FROM private_bridge_commands WHERE household_id=$1 AND command_id=$2',[a.h,c.command_id]);
  });return finish(token,s,row);
 }
 async function recover(token,input,write){const v=recovery(input),s={household_id:v.household_id,request_id:v.request_id,scope_version:v.scope_version};const out=await authority(token,s,async(tx,a)=>{const {item}=await lookup(tx,a,s,v.command_id);if(item)return write?{row:item.row}:{value:await result(tx,item,a)};const old=await first(tx,'SELECT * FROM private_bridge_absences WHERE household_id=$1 AND command_id=$2',[a.h,v.command_id]);if(old&&(old.actor_id!==a.id||old.request_id!==s.request_id))fail('denied');if(write&&!old){if(integer((await first(tx,'SELECT count(*) AS n FROM private_bridge_absences WHERE household_id=$1',[a.h])).n)>=64)fail('configuration_missing');await tx.query('INSERT INTO private_bridge_absences(household_id,request_id,command_id,actor_id,recorded_at) VALUES($1,$2,$3,$4,$5)',[a.h,s.request_id,v.command_id,a.id,iso(now())]);}return {value:{status:'bridge_command_absent',synthetic_only:true,command_id:v.command_id,version:0}};});return out.value??finish(token,s,out.row);}
 function parentScope(input){const t=ownData(input,['household_id','adult_id','child_id','consent_epoch','profile_version']);if(!uuid(t.household_id)||!uuid(t.adult_id)||!uuid(t.child_id)||!positive(t.consent_epoch)||!positive(t.profile_version))fail('denied');return copy(t);}
 async function inspectRequest(tx,input,descriptor){if(closed)fail('configuration_missing');const t=parentScope(input),d=ownData(descriptor,['request_id']);if(!uuid(d.request_id))fail('validation_failed');const w=await first(tx,'SELECT child_id FROM wonder_requests WHERE household_id=$1 AND request_id=$2',[t.household_id,d.request_id]);if(w?.child_id!==t.child_id)fail('denied');
  const all=await history(tx,t.household_id),item=all.find(x=>x.row.request_id===d.request_id),binding=await first(tx,'SELECT command_id FROM private_bridge_bindings WHERE household_id=$1 AND request_id=$2',[t.household_id,d.request_id]),core=await first(tx,"SELECT revision_id FROM adventure_revisions WHERE household_id=$1 AND request_id=$2 AND payload_ref LIKE 'private-bridge:%'",[t.household_id,d.request_id]);
  if(!item){if(binding||core)fail('recovery_quarantined');return {ownership:'unbridged'};}
  if(!binding||!core||item.row.child_id!==t.child_id)fail('recovery_quarantined');
  const available=await availability(tx,item,t),b=item.f.effect.binding;let state=available?'available':item.ack?'unavailable':'pending';
  if(!available){const p=item.f.effect.pin;try{await published(tx,{household_id:t.household_id,request_id:d.request_id,child_id:t.child_id,consent_epoch:p.consent_epoch,profile_version:p.profile_version,queue_scope_version:b.queue_scope_version},p);}catch(e){if(e?.code!=='denied')throw e;const acknowledged=await first(tx,'SELECT snapshot_id FROM review_slice_withdrawals WHERE household_id=$1 AND snapshot_id=$2',[t.household_id,p.snapshot_id]);state=acknowledged?'withdrawn':'unavailable';}}
  return {ownership:'bridge',state,command_id:item.row.command_id,assignment_id:b.assignment_id,revision_id:b.revision_id,ready_at:item.f.result.ready_at,acknowledged_at:item.ack?iso(item.ack.acknowledged_at):null};
 }
 async function readRevision(tx,input,descriptor){const t=parentScope(input),d=ownData(descriptor,['household_id','request_id','revision_id','source_scope_version','pattern_version','engine_version','payload_ref']);if(d.household_id!==t.household_id)fail('denied');const state=await inspectRequest(tx,t,{request_id:d.request_id});if(state.ownership!=='bridge')fail('denied');if(state.state!=='available')fail(state.state==='pending'?'journal_unavailable':'denied');const item=(await history(tx,t.household_id)).find(x=>x.row.command_id===state.command_id),b=item.f.effect.binding;if(d.revision_id!==b.revision_id||d.source_scope_version!==b.source_scope_version||d.pattern_version!=='fixture-1'||d.engine_version!=='fixture-engine-1'||d.payload_ref!=='private-bridge:'+item.row.record_id)fail('recovery_quarantined');return published(tx,{household_id:t.household_id,request_id:b.request_id,child_id:b.child_id,consent_epoch:t.consent_epoch,profile_version:t.profile_version,queue_scope_version:b.queue_scope_version},item.f.effect.pin);}
 const guard=fn=>async(...args)=>{try{return await fn(...args);}catch(e){throw normalize(e);}};
 const familyAdapter=Object.freeze({inspectRequest:guard(inspectRequest),readRevision:guard(readRevision)});adapters.set(familyAdapter,db);
 await serializeQueueWork(()=>db.transaction(async tx=>{if(!await first(tx,'SELECT version FROM schema_migrations WHERE version=16'))fail('configuration_missing');const n=await first(tx,'SELECT * FROM private_bridge_namespace WHERE singleton=true FOR UPDATE');if(!n)fail('configuration_missing');if(n.namespace_verifier===null){const count=await first(tx,'SELECT (SELECT count(*) FROM private_bridge_commands)+(SELECT count(*) FROM private_bridge_absences)+(SELECT count(*) FROM private_bridge_bindings)+(SELECT count(*) FROM private_bridge_ready_events)+(SELECT count(*) FROM private_bridge_delivery_work)+(SELECT count(*) FROM private_bridge_acks) AS n');if(integer(count.n)!==0||await claim()!==namespace)fail('recovery_quarantined');await tx.query('UPDATE private_bridge_namespace SET namespace_verifier=$1 WHERE singleton=true',[namespace]);}else if(n.namespace_verifier!==namespace)fail('recovery_quarantined');const households=(await tx.query('SELECT household_id FROM households ORDER BY household_id LIMIT 1001')).rows;if(households.length>1000)fail('recovery_quarantined');for(const h of households)await history(tx,h.household_id);}));
 return Object.freeze({makeReady:guard(makeReady),status:guard((t,v)=>recover(t,v,false)),reconcile:guard((t,v)=>recover(t,v,true)),familyAdapter,close(){closed=true;}});
}
