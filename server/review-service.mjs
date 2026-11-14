// REVIEW-LOCAL-01: invented review evidence and isolated TEST snapshots only.
// Architecture 1.2 / ADR-E03/04/05/06 / SHA256
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// Generation owns draft validation/digests. This service never derives its output
// digest, publishes, assigns, consumes allowance, dispatches or starts a player.
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {ownData,ownMethod,canonical,privateKey,uuid,environmentSnapshot} from './continuation-journal.mjs';
import {serializeQueueWork} from './request-queue.mjs';
import {validateFixtureDraft} from '../lib/loop/draft-fixture.mjs';
import {isSyntheticReviewJournal} from './review-journal.mjs';

const statuses={validation_failed:400,denied:403,conflict:409,configuration_missing:503,journal_unavailable:503,recovery_quarantined:503};
const error=code=>Object.assign(new Error('Local TEST review unavailable.'),{code,status:statuses[code]});
const fail=code=>{throw error(code);};
function normalized(e){
 if(Object.hasOwn(statuses,e?.code))return error(e.code);
 if([401,403].includes(e?.status))return error('denied');
 return error('configuration_missing');
}
const first=async(tx,sql,args=[])=>(await tx.query(sql,args)).rows[0];
const hash=v=>createHash('sha256').update(v).digest('hex');
const copy=v=>JSON.parse(canonical(v));
const same=(a,b)=>canonical(a)===canonical(b);
const positive=v=>Number.isSafeInteger(v)&&v>0&&v<Number.MAX_SAFE_INTEGER;
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const ABSENCE_LIMIT=64;
const checkNames=['facts','age','safety','outcomes','help','difficulty','playtest'];
const pinNames=['child_id','consent_epoch','profile_version','scope_version','job_id','job_version','fence','state','revision_id','output_digest','valid'];
const revisionNames=['revision_id','parent_revision_id','adventure','output_digest','diff','source_scope_version','request_scope_version','status','publish_authority','lineage','validation','review_evidence','usage','pattern_classification'];
function integer(v,min=0){
 const n=Number(v);
 if(!Number.isSafeInteger(n)||n<min||n>=Number.MAX_SAFE_INTEGER)fail('recovery_quarantined');
 return n;
}
function safeText(v,max=2000){
 if(typeof v!=='string'||!v.trim()||v.length>max||Buffer.byteLength(v)>max*3
  ||/[<>&\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|(?:[a-z][a-z0-9+.-]*:\/\/|(?:data|javascript|vbscript|file):|www\.|\/\/)|\b(?:eval|Function)\s*\(/i.test(v))fail('validation_failed');
 return v;
}
function scope(input,extra=[]){
 const s=ownData(input,['household_id','request_id','scope_version',...extra]);
 if(!uuid(s.household_id)||!uuid(s.request_id)||!positive(s.scope_version))fail('validation_failed');
 return s;
}
function parseCommand(input){
 const c=ownData(input,['command_id','expected_version','revision_id','output_digest','action','payload']);
 if(!uuid(c.command_id)||!Number.isSafeInteger(c.expected_version)||c.expected_version<0||c.expected_version>=Number.MAX_SAFE_INTEGER
  ||!(c.revision_id===null||uuid(c.revision_id))||!(c.output_digest===null||hex(c.output_digest)))fail('validation_failed');
 if(c.action==='RecordTestReview'){
  const p=ownData(c.payload,['synthetic','checks','notes']),checks=ownData(p.checks,checkNames);
  if(p.synthetic!==true||checkNames.some(k=>typeof checks[k]!=='boolean'))fail('validation_failed');
  safeText(p.notes);c.payload={synthetic:true,checks,notes:p.notes};
 }else if(c.action==='ReleaseTestSnapshot'){
  const p=ownData(c.payload,['predecessor_snapshot_id']);
  if(!(p.predecessor_snapshot_id===null||uuid(p.predecessor_snapshot_id)))fail('validation_failed');
  c.payload=p;
 }else if(c.action==='WithdrawTestSnapshot'){
  const p=ownData(c.payload,['snapshot_id','reason']);
  if(!uuid(p.snapshot_id))fail('validation_failed');safeText(p.reason);c.payload=p;
 }else fail('validation_failed');
 return copy(c);
}
function requestView(d,s){
 const receipt=ownData(d.receipt,['receipt_id','request_id','booking_id','claim_id','period_id','original_received_at','original_due_at','deadline_interval_seconds']);
 if(['receipt_id','request_id','booking_id','claim_id','period_id'].some(k=>!uuid(receipt[k]))
  ||receipt.request_id!==s.request_id||receipt.deadline_interval_seconds!==86400
  ||typeof receipt.original_received_at!=='string'||typeof receipt.original_due_at!=='string'
  ||!Number.isFinite(Date.parse(receipt.original_received_at))
  ||Date.parse(receipt.original_due_at)-Date.parse(receipt.original_received_at)!==86400000)fail('recovery_quarantined');
 safeText(d.question,4000);safeText(d.current_question,4000);
 if(d.interpretation!==null)safeText(d.interpretation,4000);
 return copy({original_question:d.question,current_question:d.current_question,interpretation:d.interpretation,scope_version:s.scope_version,receipt});
}
function validatedGeneration(input,s,pin,request){
 // Canonical traversal rejects nested proxies/accessors before array iteration.
 let v;
 try{v=ownData(input,['status','mock_only','request','job','revisions','pending']);v=copy(v);}catch{fail('validation_failed');}
 if(v.status!=='generation_view'||v.mock_only!==true||!Array.isArray(v.pending)||v.pending.length
  ||!Array.isArray(v.revisions)||v.revisions.length>64)fail('conflict');
 ownData(v.request,['original_question','current_question','interpretation','scope_version','receipt']);
 if(!same(v.request,request))fail('conflict');
 const j=ownData(v.job,['job_id','state','version','fence','current_revision_id','parent_revision_id','is_current','mock_case']);
 if(j.job_id!==pin.job_id||j.state!=='draft_ready'||j.version!==pin.job_version||j.fence!==pin.fence
  ||j.current_revision_id!==pin.revision_id||j.is_current!==true)fail('conflict');
 const ids=new Set();let selected=null;
 for(const inputRevision of v.revisions){
  const r=ownData(inputRevision,revisionNames);
  if(!uuid(r.revision_id)||ids.has(r.revision_id)||!(r.parent_revision_id===null||uuid(r.parent_revision_id))
   ||!hex(r.output_digest)||!positive(r.source_scope_version)||!positive(r.request_scope_version)
   ||r.status!=='draft'||r.publish_authority!==false||r.pattern_classification!=='synthetic-unsettled-fixture')fail('validation_failed');
  ids.add(r.revision_id);
  const validation=ownData(r.validation,['structure','facts','human_review']);
  const usage=ownData(r.usage,['kind','provider_usage','estimated_cash','billed_cash','cash_state']);
  const lineage=ownData(r.lineage,['profile_version','provider','model','model_config_version','prompt_version','pattern_version','pattern_digest','pattern_digest_kind','asset_digest','asset_digest_kind','engine_version','validator_version','input_digest','output_digest','attempt_id']);
  if(!same(validation,{structure:'passed',facts:'pending',human_review:'pending'})
   ||!same(usage,{kind:'mock',provider_usage:null,estimated_cash:null,billed_cash:null,cash_state:'unknown'})
   ||!Array.isArray(r.review_evidence)||r.review_evidence.length||!Array.isArray(r.diff)||r.diff.length>5
   ||lineage.provider!=='deterministic-local-mock'||lineage.model!=='mock-fixture-1'
   ||lineage.model_config_version!=='local-mock-v1'||lineage.prompt_version!=='mock-prompt-1'
   ||lineage.pattern_version!=='fixture-1'||lineage.engine_version!=='fixture-engine-1'
   ||lineage.validator_version!=='mock-validator-1'||lineage.output_digest!==r.output_digest
   ||!positive(lineage.profile_version)||!hex(lineage.pattern_digest)||!hex(lineage.asset_digest)
   ||lineage.pattern_digest_kind!=='unreleased-fixture-rule-descriptor'||lineage.asset_digest_kind!=='fixture-allowlist-labels-only'
   ||!(lineage.input_digest===null||hex(lineage.input_digest))||!(lineage.attempt_id===null||uuid(lineage.attempt_id)))fail('validation_failed');
  for(const diff of r.diff){
   const d=ownData(diff,['field','from_revision','to_revision']);
   if(!['opening','limits','help','offscreen','side_thread'].includes(d.field)||!uuid(d.from_revision)||d.to_revision!==r.revision_id)fail('validation_failed');
  }
  const adventure=validateFixtureDraft(r.adventure);
  if(adventure.revision_id!==r.revision_id)fail('validation_failed');
  if(r.revision_id===pin.revision_id){
   if(r.output_digest!==pin.output_digest||r.request_scope_version!==s.scope_version||lineage.profile_version!==pin.profile_version)fail('conflict');
   selected={revision_id:r.revision_id,output_digest:r.output_digest,adventure};
  }
 }
 if(!selected)fail('conflict');return copy(selected);
}
const acknowledgement=(row,status='acknowledged')=>({status,synthetic_only:true,command_id:row.command_id,version:integer(row.aggregate_version,1)});

export async function createSyntheticReviewService(input){
 try{return await buildService(input);}catch(e){throw normalized(e);}
}
async function buildService(input){
 const o=ownData(input,['env','db','auth','queue','generation','journal','keys','clock']);
 try{environmentSnapshot(o.env);}catch{fail('configuration_missing');}
 const {db,journal,clock}=o;
 if(!(db instanceof PGlite)||!isSyntheticReviewJournal(journal)||typeof clock!=='function')fail('configuration_missing');
 const requireFounder=ownMethod(o.auth,'requireFounder'),queueRead=ownMethod(o.queue,'founderRead'),project=ownMethod(o.queue,'project');
 const generationRead=ownMethod(o.generation,'read');
 ownData(o.keys,['keyForHousehold']);const householdKey=ownMethod(o.keys,'keyForHousehold');
 const seal=ownMethod(journal,'seal'),fact=ownMethod(journal,'fact'),append=ownMethod(journal,'append'),records=ownMethod(journal,'records');
 const claimFreshNamespace=ownMethod(journal,'claimFreshNamespace'),namespace=journal.namespace_verifier;
 if(!hex(namespace))fail('configuration_missing');
 let closed=false;
 const now=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<0||n>253402300799999)fail('configuration_missing');return n;};now();
 const iso=()=>new Date(now()).toISOString();
 function digest(h,actor,epoch,command){
  const key=privateKey(householdKey(h));
  try{return createHmac('sha256',key).update('review-local-01\0command\0').update(canonical({actor_id:actor,consent_epoch:epoch,command})).digest('hex');}
  finally{key.fill(0);}
 }
 async function founder(tx,token,actor){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||Buffer.from(token,'base64url').toString('base64url')!==token)fail('denied');
  const id=await first(tx,'SELECT role,enabled FROM founder_identities WHERE identity_id=$1 FOR UPDATE',[actor]);
  const session=await first(tx,'SELECT * FROM founder_sessions WHERE token_hash=$1 FOR UPDATE',[hash(token)]);
  if(!id?.enabled||id.role!=='founder'||!session||session.identity_id!==actor||session.revoked_at
   ||now()>=new Date(session.expires_at).getTime())fail('denied');
 }
 async function authority(token,s,work){
  if(closed)fail('configuration_missing');
  return serializeQueueWork(async()=>{
   let actor;try{actor=await requireFounder(token);}catch{fail('denied');}
   if(!uuid(actor?.identityId))fail('denied');
   return db.transaction(async tx=>{
    // Match generation's household -> consent -> founder -> request -> profile
    // authority ordering, using the actual queue projection under these locks.
    if(!await first(tx,'SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[s.household_id]))fail('denied');
    const consent=await first(tx,'SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[s.household_id]);
    if(!consent||consent.state!=='active'||consent.policy_version!=='TEST-v1')fail('denied');
    await founder(tx,token,actor.identityId);
    const epoch=integer(consent.consent_epoch,1);
    const w=await first(tx,'SELECT child_id FROM wonder_requests WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[s.household_id,s.request_id]);
    if(!w)fail('denied');
    const d=await project(tx,{household_id:s.household_id,request_id:s.request_id,child_id:w.child_id,consent_epoch:epoch});
    if(d.scope_version!==s.scope_version||d.state!=='accepted'||d.scope_kind==='alternative'&&d.agreement_version!==d.scope_version)fail('conflict');
    const profile=await first(tx,'SELECT current_version,consent_epoch FROM child_setup_profiles WHERE household_id=$1 AND child_id=$2 FOR UPDATE',[s.household_id,w.child_id]);
    if(!profile||integer(profile.consent_epoch,1)!==epoch)fail('denied');
    const a={h:s.household_id,id:actor.identityId,epoch,child:w.child_id,profile_version:integer(profile.current_version,1),session_hash:hash(token),request:requestView(d,s)};
    const out=await work(tx,a);
    await founder(tx,token,a.id);
    const end=await first(tx,'SELECT consent_epoch,state FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[a.h]);
    if(end?.state!=='active'||integer(end.consent_epoch,1)!==epoch)fail('denied');
    return out;
   });
  });
 }
 async function currentPin(tx,s,a){
  const pending=await first(tx,'SELECT c.command_id FROM generation_slice_commands c LEFT JOIN generation_slice_acknowledgements k USING(household_id,command_id) WHERE c.household_id=$1 AND k.command_id IS NULL LIMIT 1',[a.h]);
  if(pending)fail('journal_unavailable');
  const head=await first(tx,'SELECT job_id FROM generation_slice_request_heads WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[a.h,s.request_id]);
  const p={child_id:a.child,consent_epoch:a.epoch,profile_version:a.profile_version,scope_version:s.scope_version,job_id:null,job_version:null,fence:null,state:null,revision_id:null,output_digest:null,valid:false};
  if(!head)return p;
  const j=await first(tx,'SELECT * FROM generation_slice_jobs WHERE household_id=$1 AND job_id=$2 FOR UPDATE',[a.h,head.job_id]);
  if(!j||j.request_id!==s.request_id)fail('recovery_quarantined');
  Object.assign(p,{job_id:j.job_id,job_version:integer(j.version,1),fence:integer(j.fence),state:j.state,revision_id:j.current_revision_id});
  const latest=await first(tx,'SELECT c.command_id FROM generation_slice_commands c JOIN generation_slice_acknowledgements k USING(household_id,command_id,record_id,primary_commit_id) WHERE c.household_id=$1 AND c.job_id=$2 AND c.aggregate_version=$3',[a.h,j.job_id,j.version]);
  if(!latest)fail('recovery_quarantined');
  if(j.current_revision_id){
   const r=await first(tx,'SELECT * FROM generation_slice_revisions WHERE household_id=$1 AND revision_id=$2 FOR UPDATE',[a.h,j.current_revision_id]);
   if(!r||r.job_id!==j.job_id||!hex(r.output_digest))fail('recovery_quarantined');p.output_digest=r.output_digest;
  }
  p.valid=j.state==='draft_ready'&&uuid(p.revision_id)&&hex(p.output_digest)&&j.child_id===a.child
   &&integer(j.consent_epoch,1)===a.epoch&&integer(j.profile_version,1)===a.profile_version
   &&integer(j.request_scope_version,1)===s.scope_version;
  return p;
 }
 async function source(token,s){
  const b=await authority(token,s,async(tx,a)=>({pin:await currentPin(tx,s,a),request:a.request}));
  if(!b.pin.valid)return {...b,revision:null};
  // Public generation read is deliberately outside any review transaction and
  // outside serializeQueueWork: generation owns that same serializer itself.
  const v=await generationRead(token,{...s,job_id:null});
  if(ownData(v,[],['status','mock_only','request','job','revisions','pending']).status==='generation_pending')fail('journal_unavailable');
  return {...b,revision:validatedGeneration(v,s,b.pin,b.request)};
 }
 async function pinSource(tx,s,a,b,required=false){
  const p=await currentPin(tx,s,a);
  if(!same(p,b.pin)||!same(a.request,b.request)||required&&(!p.valid||!b.revision))fail('conflict');
 }
 async function decoded(row){
  try{
   const f=await fact(row.sealed_fact),v=scope(f.command,['command']),c=parseCommand(v.command);
   const effect=ownData(f.effect,['pin','request','review','snapshot','withdrawal']),p=ownData(effect.pin,pinNames);
   if(f.format!=='queue-committed-fact-v1'||f.scope!=='household'||f.actor_kind!=='founder'
    ||f.household_id!==row.household_id||f.command_id!==row.command_id||f.actor_id!==row.actor_id
    ||f.original_session_hash!==row.original_session_hash||f.consent_epoch!==integer(row.consent_epoch,1)
    ||f.aggregate_version!==integer(row.aggregate_version,1)||f.recorded_at!==new Date(row.recorded_at).toISOString()
    ||f.record_id!==row.record_id||f.primary_commit_id!==row.primary_commit_id||f.namespace_verifier!==namespace
    ||row.namespace_verifier!==namespace||f.canonical_digest!==row.canonical_digest
    ||digest(row.household_id,f.actor_id,f.consent_epoch,f.command)!==row.canonical_digest
    ||v.household_id!==row.household_id||v.request_id!==row.request_id||v.scope_version!==integer(row.scope_version,1)
    ||c.command_id!==row.command_id||c.action!==row.action||c.expected_version+1!==f.aggregate_version
    ||c.revision_id!==row.revision_id||c.output_digest!==row.output_digest
    ||p.child_id!==row.child_id||p.consent_epoch!==f.consent_epoch||p.profile_version!==integer(row.profile_version,1)
    ||p.scope_version!==v.scope_version||p.job_id!==row.generation_job_id||p.job_version!==integer(row.generation_version,1)
    ||p.fence!==integer(row.generation_fence)||p.state!=='draft_ready'||p.valid!==true
    ||p.revision_id!==c.revision_id||p.output_digest!==c.output_digest
    ||!same(f.result,acknowledgement(row)))fail('recovery_quarantined');
   const expectedReview=c.action==='RecordTestReview'?{revision_id:c.revision_id,output_digest:c.output_digest,...c.payload}:null;
   if(!same(effect.review,expectedReview))fail('recovery_quarantined');
   if(c.action==='ReleaseTestSnapshot'){
    const snap=ownData(effect.snapshot,['snapshot_id','revision_id','output_digest','predecessor_snapshot_id','adventure']);
    if(!uuid(snap.snapshot_id)||snap.revision_id!==c.revision_id||snap.output_digest!==c.output_digest
     ||snap.predecessor_snapshot_id!==c.payload.predecessor_snapshot_id
     ||validateFixtureDraft(snap.adventure).revision_id!==c.revision_id)fail('recovery_quarantined');
   }else if(effect.snapshot!==null)fail('recovery_quarantined');
   if(!same(effect.withdrawal,c.action==='WithdrawTestSnapshot'?c.payload:null))fail('recovery_quarantined');
   return f;
  }catch{fail('recovery_quarantined');}
 }
 async function history(tx,h){
  const rows=(await tx.query('SELECT c.*,a.command_id AS ack,a.record_id AS ack_record,a.primary_commit_id AS ack_commit FROM review_slice_commands c LEFT JOIN review_slice_acknowledgements a USING(household_id,command_id) WHERE c.household_id=$1 ORDER BY c.request_id,c.aggregate_version LIMIT 1001',[h])).rows;
  if(rows.length>1000)fail('recovery_quarantined');
  const absences=(await tx.query('SELECT * FROM review_slice_absences WHERE household_id=$1 LIMIT 65',[h])).rows;
  if(absences.length>ABSENCE_LIMIT)fail('recovery_quarantined');
  for(const marker of absences){
   if(!uuid(marker.command_id)||!uuid(marker.request_id)||!uuid(marker.actor_id)||rows.some(x=>x.command_id===marker.command_id)
    ||!await first(tx,'SELECT request_id FROM wonder_requests WHERE household_id=$1 AND request_id=$2',[h,marker.request_id])
    ||!await first(tx,'SELECT identity_id FROM founder_identities WHERE identity_id=$1',[marker.actor_id]))fail('recovery_quarantined');
  }
  const independent=await records(h),seen=new Set(),versions=new Map(),out=[];
  for(const r of independent){
   const row=rows.find(x=>x.command_id===r.command_id);
   if(!row||!same(row.sealed_fact,r))fail('recovery_quarantined');seen.add(r.command_id);
  }
  const reviews=(await tx.query('SELECT * FROM review_slice_reviews WHERE household_id=$1',[h])).rows;
  const snapshots=(await tx.query('SELECT * FROM review_slice_snapshots WHERE household_id=$1',[h])).rows;
  const withdrawals=(await tx.query('SELECT * FROM review_slice_withdrawals WHERE household_id=$1',[h])).rows;
  let nr=0,ns=0,nw=0;
  for(const row of rows){
   const f=await decoded(row),version=(versions.get(row.request_id)??0)+1;versions.set(row.request_id,version);
   if(integer(row.aggregate_version,1)!==version||row.ack&&(!seen.has(row.command_id)||row.ack_record!==row.record_id||row.ack_commit!==row.primary_commit_id))fail('recovery_quarantined');
   const r=reviews.find(x=>x.command_id===row.command_id),s=snapshots.find(x=>x.command_id===row.command_id),w=withdrawals.find(x=>x.command_id===row.command_id);
   if(row.ack&&f.effect.review){
    nr++;if(!r||r.request_id!==row.request_id||r.revision_id!==row.revision_id||r.output_digest!==row.output_digest)fail('recovery_quarantined');
   }else if(r)fail('recovery_quarantined');
   if(row.ack&&f.effect.snapshot){
    ns++;const x=f.effect.snapshot;
    if(!s||s.request_id!==row.request_id||s.snapshot_id!==x.snapshot_id||s.revision_id!==x.revision_id||s.output_digest!==x.output_digest||s.predecessor_snapshot_id!==x.predecessor_snapshot_id)fail('recovery_quarantined');
   }else if(s)fail('recovery_quarantined');
   if(row.ack&&f.effect.withdrawal){
    nw++;if(!w||w.request_id!==row.request_id||w.snapshot_id!==f.effect.withdrawal.snapshot_id)fail('recovery_quarantined');
   }else if(w)fail('recovery_quarantined');
   out.push({row,f});
  }
  if(nr!==reviews.length||ns!==snapshots.length||nw!==withdrawals.length)fail('recovery_quarantined');
  return out;
 }
 function fenced(rows,item,a,s,pin){
  return rows.some(x=>x.row.request_id===s.request_id&&integer(x.row.aggregate_version,1)>integer(item.row.aggregate_version,1))
   ||!same(item.f.effect.pin,pin)||!same(item.f.effect.request,a.request);
 }
 async function livePending(tx,rows,a,s,pin){
  const live=[];
  for(const item of rows.filter(x=>!x.row.ack&&x.row.request_id===s.request_id)){
   if(fenced(rows,item,a,s,pin))continue;
   // Original session is provenance. A new current session may recover it.
   // No extra cross-household identity locks: a higher committed request version
   // fences superseded work even if the old actor is restored concurrently.
   const actor=await first(tx,'SELECT role,enabled FROM founder_identities WHERE identity_id=$1',[item.row.actor_id]);
   if(actor?.enabled&&actor.role==='founder')live.push(item);
  }
  return live;
 }
 async function pending(tx,rows,a,s,pin){
  const live=await livePending(tx,rows,a,s,pin);
  return live.length?{status:'review_pending',synthetic_only:true,pending:live.filter(x=>x.row.actor_id===a.id).map(x=>({command_id:x.row.command_id}))}:null;
 }
 async function absence(tx,a,id){
  return first(tx,'SELECT * FROM review_slice_absences WHERE household_id=$1 AND command_id=$2',[a.h,id]);
 }
 async function refuseRetired(tx,a,id){if(await absence(tx,a,id))fail('conflict');}
 function projection(rows,s,b){
  const all=rows.filter(x=>x.row.request_id===s.request_id),selected=all.filter(x=>x.row.ack),current=selected.filter(x=>same(x.f.effect.pin,b.pin));
  const review=b.revision?current.filter(x=>x.f.effect.review).at(-1)?.f.effect.review??null:null;
  const withdrawn=new Set(selected.filter(x=>x.f.effect.withdrawal).map(x=>x.f.effect.withdrawal.snapshot_id));
  const snapshots=selected.filter(x=>x.f.effect.snapshot).map(x=>{
   const snap=x.f.effect.snapshot;
   return {...copy(snap),withdrawn:withdrawn.has(snap.snapshot_id),is_current_revision:!!b.revision&&same(x.f.effect.pin,b.pin)};
  });
  const missing=!b.revision?['revision']:review?checkNames.filter(k=>!review.checks[k]):[...checkNames,'notes'];
  return {status:'review_view',synthetic_only:true,request:copy(b.request),version:all.length?integer(all.at(-1).row.aggregate_version,1):0,
   revision:copy(b.revision),review:copy(review),snapshots,readiness:{eligible:missing.length===0,missing},pending:[]};
 }
 function ownRow(row,a,s){
  if(!row||row.actor_id!==a.id||row.request_id!==s.request_id)fail('denied');
 }
 async function currentRow(tx,a,s,row){
  ownRow(row,a,s);await refuseRetired(tx,a,row.command_id);
  const rows=await history(tx,a.h),item=rows.find(x=>x.row.command_id===row.command_id);
  if(!item||!same(item.row.sealed_fact,row.sealed_fact))fail('recovery_quarantined');
  return {rows,item};
 }
 async function finish(token,s,row,reconciling=false){
  // Historical bare ACK is not current-source review eligibility.
  const early=await authority(token,s,async(tx,a)=>{
   const {item}=await currentRow(tx,a,s,row);return item.row.ack?acknowledgement(row):null;
  });if(early)return early;
  let b=await source(token,s);
  async function verify(tx,a){
   const state=await currentRow(tx,a,s,row);if(state.item.row.ack)return {...state,done:acknowledgement(row)};
   const pin=await currentPin(tx,s,a);
   if(fenced(state.rows,state.item,a,s,pin)){
    if(!reconciling)fail('conflict');
    return {...state,done:acknowledgement(row,'review_command_fenced')};
   }
   await pinSource(tx,s,a,b,true);return state;
  }
  const before=await authority(token,s,verify);if(before.done)return before.done;
  try{
   // Preserve older superseded intents as forensic facts only. Never apply/ACK.
   const older=before.rows.filter(x=>!x.row.ack&&x.row.request_id===s.request_id&&integer(x.row.aggregate_version,1)<integer(row.aggregate_version,1));
   for(const x of [...older,before.item]){
    const ref=await append(x.row.sealed_fact);if(ref!=='queue-fsync:'+x.row.record_id)fail('recovery_quarantined');
   }
  }catch(e){
   if(e?.code==='recovery_quarantined')throw e;
   b=await source(token,s);
   return authority(token,s,async(tx,a)=>{const v=await verify(tx,a);return v.done??acknowledgement(row,'retryable_unacknowledged');});
  }
  b=await source(token,s);
  return authority(token,s,async(tx,a)=>{
   const state=await verify(tx,a);if(state.done)return state.done;
   if(!(await records(a.h)).some(r=>same(r,row.sealed_fact)))fail('recovery_quarantined');
   const effect=state.item.f.effect,c=state.item.f.command.command;
   // Materialized facts and ACK are atomic, after independent durability and
   // current authority/source rechecks. Unacknowledged intents have no effects.
   if(effect.review)await tx.query('INSERT INTO review_slice_reviews(household_id,request_id,command_id,revision_id,output_digest) VALUES($1,$2,$3,$4,$5)',[a.h,s.request_id,c.command_id,c.revision_id,c.output_digest]);
   if(effect.snapshot){const x=effect.snapshot;await tx.query('INSERT INTO review_slice_snapshots(household_id,request_id,snapshot_id,command_id,revision_id,output_digest,predecessor_snapshot_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.h,s.request_id,x.snapshot_id,c.command_id,x.revision_id,x.output_digest,x.predecessor_snapshot_id]);}
   if(effect.withdrawal)await tx.query('INSERT INTO review_slice_withdrawals(household_id,request_id,snapshot_id,command_id) VALUES($1,$2,$3,$4)',[a.h,s.request_id,effect.withdrawal.snapshot_id,c.command_id]);
   await tx.query('INSERT INTO review_slice_acknowledgements(household_id,command_id,record_id,primary_commit_id,acknowledged_at) VALUES($1,$2,$3,$4,$5)',[a.h,row.command_id,row.record_id,row.primary_commit_id,iso()]);
   return acknowledgement(row);
  });
 }

 await serializeQueueWork(()=>db.transaction(async tx=>{
  if(!await first(tx,'SELECT version FROM schema_migrations WHERE version=14'))fail('configuration_missing');
  const n=await first(tx,'SELECT * FROM review_slice_namespace WHERE singleton=true FOR UPDATE');
  if(!n)fail('configuration_missing');
  if(n.namespace_verifier===null){
   const counts=await first(tx,'SELECT (SELECT count(*) FROM review_slice_absences)+(SELECT count(*) FROM review_slice_commands)+(SELECT count(*) FROM review_slice_reviews)+(SELECT count(*) FROM review_slice_snapshots)+(SELECT count(*) FROM review_slice_withdrawals)+(SELECT count(*) FROM review_slice_acknowledgements) AS n');
   if(integer(counts.n)!==0||await claimFreshNamespace()!==namespace)fail('recovery_quarantined');
   await tx.query('UPDATE review_slice_namespace SET namespace_verifier=$1 WHERE singleton=true',[namespace]);
  }else if(n.namespace_verifier!==namespace)fail('recovery_quarantined');
  const households=(await tx.query('SELECT household_id FROM households ORDER BY household_id LIMIT 1001')).rows;
  if(households.length>1000)fail('recovery_quarantined');
  for(const h of households)await history(tx,h.household_id);
 }));

 async function read(token,input){
  const s=copy(scope(input));
  const b=await source(token,s);
  return authority(token,s,async(tx,a)=>{
   const rows=await history(tx,a.h),pin=await currentPin(tx,s,a),p=await pending(tx,rows,a,s,pin);if(p)return p;
   await pinSource(tx,s,a,b);return projection(rows,s,b);
  });
 }
 async function list(token,input){
  ownData(input,[]);
  const q=await queueRead(token,{filter:'accepted'}),out=[];
  for(const r of q.requests){
   const s=copy(scope({household_id:r.household_id,request_id:r.request_id,scope_version:r.scope_version}));
   try{
    await authority(token,s,async(tx,a)=>{
     // A valid accepted scope remains selectable while generation awaits its
     // independent journal. Pending readiness is not an authority revocation;
     // read/command still fail closed until the original generation key ACKs.
     try{await currentPin(tx,s,a);}catch(e){if(e?.code!=='journal_unavailable')throw e;}
    });out.push(s);
   }catch(e){if(!['denied','conflict','journal_unavailable'].includes(e?.code))throw e;}
  }
  // Recheck all listed scopes after the potentially held queue response.
  const requests=[];
  for(const s of out){try{await authority(token,s,async()=>{});requests.push(s);}catch(e){if(!['denied','conflict'].includes(e?.code))throw e;}}
  try{await requireFounder(token);}catch{fail('denied');}
  return {status:'review_list',synthetic_only:true,requests};
 }
 async function command(token,input){
  const v=scope(input,['command']),s=copy({household_id:v.household_id,request_id:v.request_id,scope_version:v.scope_version});
  const c=parseCommand(v.command),envelope={...s,command:c};
  // Original-key lookup precedes CAS, pending throttles and source validation.
  const prior=await authority(token,s,async(tx,a)=>{
   await refuseRetired(tx,a,c.command_id);
   const rows=await history(tx,a.h),old=rows.find(x=>x.row.command_id===c.command_id);
   if(!old)return null;
   ownRow(old.row,a,s);
   if(old.row.canonical_digest!==digest(a.h,a.id,a.epoch,envelope))fail('conflict');return old.row;
  });
  if(prior)return finish(token,s,prior);
  const b=await source(token,s);
  const row=await authority(token,s,async(tx,a)=>{
   await refuseRetired(tx,a,c.command_id);
   const rows=await history(tx,a.h),old=rows.find(x=>x.row.command_id===c.command_id);
   if(old){ownRow(old.row,a,s);if(old.row.canonical_digest!==digest(a.h,a.id,a.epoch,envelope))fail('conflict');return old.row;}
   if((await livePending(tx,rows,a,s,await currentPin(tx,s,a))).length)fail('journal_unavailable');
   if(rows.length>=1000)fail('configuration_missing');
   await pinSource(tx,s,a,b,true);
   const view=projection(rows,s,b);
   if(c.expected_version!==view.version||c.revision_id!==b.revision.revision_id||c.output_digest!==b.revision.output_digest)fail('conflict');
   const effect={pin:copy(b.pin),request:copy(b.request),review:null,snapshot:null,withdrawal:null};
   if(c.action==='RecordTestReview')effect.review={revision_id:c.revision_id,output_digest:c.output_digest,...copy(c.payload)};
   if(c.action==='ReleaseTestSnapshot'){
    if(!view.readiness.eligible||view.snapshots.some(x=>x.revision_id===c.revision_id))fail('conflict');
    const predecessor=c.payload.predecessor_snapshot_id;
    if(predecessor===null?view.snapshots.length!==0:!view.snapshots.some(x=>x.snapshot_id===predecessor&&x.revision_id!==c.revision_id))fail('conflict');
    effect.snapshot={snapshot_id:randomUUID(),revision_id:c.revision_id,output_digest:c.output_digest,predecessor_snapshot_id:predecessor,adventure:copy(b.revision.adventure)};
   }
   if(c.action==='WithdrawTestSnapshot'){
    if(!view.snapshots.some(x=>x.snapshot_id===c.payload.snapshot_id&&!x.withdrawn))fail('conflict');effect.withdrawal=copy(c.payload);
   }
   const record_id=randomUUID(),primary_commit_id=randomUUID(),recorded_at=iso(),version=view.version+1;
   if(!positive(version))fail('configuration_missing');
   const canonical_digest=digest(a.h,a.id,a.epoch,envelope);
   const result={status:'acknowledged',synthetic_only:true,command_id:c.command_id,version};
   const f={format:'queue-committed-fact-v1',scope:'household',household_id:a.h,command_id:c.command_id,record_id,primary_commit_id,
    actor_id:a.id,actor_kind:'founder',original_session_hash:a.session_hash,consent_epoch:a.epoch,recorded_at,aggregate_version:version,
    canonical_digest,namespace_verifier:namespace,command:envelope,result,effect};
   const sealed=await seal(f);
   await tx.query('INSERT INTO review_slice_commands(household_id,command_id,request_id,scope_version,child_id,profile_version,actor_id,consent_epoch,original_session_hash,aggregate_version,action,generation_job_id,generation_version,generation_fence,revision_id,output_digest,recorded_at,record_id,primary_commit_id,canonical_digest,namespace_verifier,sealed_fact) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)',
    [a.h,c.command_id,s.request_id,s.scope_version,a.child,a.profile_version,a.id,a.epoch,a.session_hash,version,c.action,b.pin.job_id,b.pin.job_version,b.pin.fence,c.revision_id,c.output_digest,recorded_at,record_id,primary_commit_id,canonical_digest,namespace,JSON.stringify(sealed)]);
   return first(tx,'SELECT * FROM review_slice_commands WHERE household_id=$1 AND command_id=$2',[a.h,c.command_id]);
  });
  return finish(token,s,row);
 }
 async function reconcile(token,input){
  const v=scope(input,['command_id']);if(!uuid(v.command_id))fail('validation_failed');
  const s=copy({household_id:v.household_id,request_id:v.request_id,scope_version:v.scope_version});
  const outcome=await authority(token,s,async(tx,a)=>{
   const rows=await history(tx,a.h),found=rows.find(x=>x.row.command_id===v.command_id);
   if(found){ownRow(found.row,a,s);return {row:found.row};}
   const old=await absence(tx,a,v.command_id);
   if(old&&(old.actor_id!==a.id||old.request_id!==s.request_id))fail('denied');
   if(!old){
    const n=await first(tx,'SELECT count(*) AS n FROM review_slice_absences WHERE household_id=$1',[a.h]);
    if(integer(n.n)>=ABSENCE_LIMIT)fail('configuration_missing');
    await tx.query('INSERT INTO review_slice_absences(household_id,command_id,request_id,actor_id,recorded_at) VALUES($1,$2,$3,$4,$5)',[a.h,v.command_id,s.request_id,a.id,iso()]);
   }
   const selected=rows.filter(x=>x.row.request_id===s.request_id);
   return {result:{status:'review_command_absent',synthetic_only:true,command_id:v.command_id,version:selected.length?integer(selected.at(-1).row.aggregate_version,1):0}};
  });
  return outcome.result??finish(token,s,outcome.row,true);
 }
 const guarded=fn=>async(...args)=>{try{return await fn(...args);}catch(e){throw normalized(e);}};
 return Object.freeze({list:guarded(list),read:guarded(read),command:guarded(command),reconcile:guarded(reconcile),close(){closed=true;}});
}
