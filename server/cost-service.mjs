// COST-LOCAL-01, STAGE2. Local synthetic records only.
// Architecture v1.2, ADR-E03/E04/E06; SHA-256
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// Household -> consent -> founder/session -> request -> profile -> source locks.
// Immutable primary intent -> independent append outside locks -> fresh source
// and authority -> atomic effects/ACK. An intended result is never an ACK proof.
// Full 05-A/B/D/G and 11-C remain OPEN. No executed verification is claimed.
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {types} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {ownData,ownMethod,canonical,privateKey,uuid,environmentSnapshot} from './continuation-journal.mjs';
import {serializeQueueWork} from './request-queue.mjs';
import {isSyntheticCostJournal} from './cost-journal.mjs';
import {summarizeCostLedger} from '../lib/loop/cost-ledger.mjs';

const MAX=9007199254740990,AMOUNT=1000000000000;
const statuses={validation_failed:400,denied:403,conflict:409,source_metadata_unavailable:503,journal_unavailable:503,configuration_missing:503,recovery_quarantined:503};
const error=code=>Object.assign(new Error('Local synthetic cost unavailable.'),{code,status:statuses[code]});
const fail=code=>{throw error(code);};
function normalize(e){
 if(Object.hasOwn(statuses,e?.code))return error(e.code);
 if(e?.status===401||e?.status===403)return error('denied');
 return error('configuration_missing');
}
const first=async(tx,sql,args=[])=>(await tx.query(sql,args)).rows[0];
const query=async(tx,sql,args=[])=>(await tx.query(sql,args)).rows;
const hash=v=>createHash('sha256').update(v).digest('hex');
const copy=v=>JSON.parse(canonical(v));
const same=(a,b)=>canonical(a)===canonical(b);
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const terminals=['draft_ready','failed','unsupported','cancelled','uncertain'];
const stages=['intake','generation_supervision','adaptation','grounding','assets','safety_review','playtest_fast','playtest_medium','playtest_slow','correction','support','incident','rules_design','player_engineering','outcome_modelling','pattern_testing','stabilization'];
const lineOwner={C1:'G1',C2:'G1',C3:'G2',C4:'G3',C5:'I1'};
const classification='synthetic-unsettled-fixture';
function int(v,max=MAX,min=0,code='validation_failed'){
 if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<min||v>max)fail(code);return v;
}
function dbint(v,min=0){
 if(typeof v!=='number'&&typeof v!=='string'&&typeof v!=='bigint')fail('recovery_quarantined');
 if(typeof v==='string'&&!/^(0|[1-9][0-9]*)$/.test(v))fail('recovery_quarantined');
 return int(Number(v),MAX,min,'recovery_quarantined');
}
function instant(v,code='recovery_quarantined'){
 const n=v instanceof Date?v.getTime():typeof v==='string'?Date.parse(v):NaN;
 if(!Number.isSafeInteger(n)||n<0||n>253402300799999)fail(code);
 const s=new Date(n).toISOString();if(s.length!==24)fail(code);return s;
}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
// Bound traversal before reading any supplied nested property. In particular,
// canonical alone is not a cycle or recursion-depth limiter.
function snapshot(input,limit=16384){
 const active=new Set();let nodes=0;
 function visit(v,depth){
  if(++nodes>50000||depth>14)fail('validation_failed');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v)||Object.is(v,-0))fail('validation_failed');return v;}
  if(typeof v==='string'){if(v.length>1048576)fail('validation_failed');return v;}
  if(!v||typeof v!=='object'||types.isProxy(v)||active.has(v))fail('validation_failed');
  active.add(v);
  try{
   if(Array.isArray(v)){
    const d=Object.getOwnPropertyDescriptors(v),n=d.length?.value;
    if(!Number.isSafeInteger(n)||n<0||n>1000||Reflect.ownKeys(d).length!==n+1)fail('validation_failed');
    const out=[];for(let i=0;i<n;i++){const x=d[String(i)];if(!x?.enumerable||!Object.hasOwn(x,'value'))fail('validation_failed');out.push(visit(x.value,depth+1));}return out;
   }
   const data=ownData(v,[],Reflect.ownKeys(v)),out=Object.create(null);
   if(Object.keys(data).length>40)fail('validation_failed');
   for(const k of Object.keys(data))out[k]=visit(data[k],depth+1);return out;
  }finally{active.delete(v);}
 }
 const out=visit(input,0);if(Buffer.byteLength(canonical(out))>limit)fail('validation_failed');return out;
}
function scope(v,extra=[]){
 const s=ownData(v,['household_id','request_id','scope_version',...extra]);
 if(!uuid(s.household_id)||!uuid(s.request_id))fail('validation_failed');int(s.scope_version,MAX,1);return s;
}
function pin(v){
 const p=ownData(v,['consent_epoch','profile_version','scope_version','inventory_digest']);
 for(const k of ['consent_epoch','profile_version','scope_version'])int(p[k],MAX,1);
 if(!hex(p.inventory_digest))fail('validation_failed');return p;
}
function nullable(v,max){if(v!==null)int(v,max);}
function cash(p){
 nullable(p.cash_micro_usd,AMOUNT);
 if(p.cash_state==='unknown'){if(p.cash_micro_usd!==null)fail('validation_failed');}
 else if(p.cash_state!=='estimated'||p.cash_micro_usd===null)fail('validation_failed');
}
function parseCommand(value){
 const c=ownData(value,['command_id','expected_version','source_pin','action','payload']);
 if(!uuid(c.command_id))fail('validation_failed');int(c.expected_version,MAX-1);c.source_pin=pin(c.source_pin);
 let p;
 if(c.action==='CaptureAttempt'){
  p=ownData(c.payload,['job_id','attempt_id']);if(!uuid(p.job_id)||!uuid(p.attempt_id))fail('validation_failed');
 }else if(c.action==='OpenComparison'){
  p=ownData(c.payload,['fixture_id']);if(p.fixture_id!=='comparison-v1')fail('validation_failed');
 }else if(c.action==='RecordAttemptUsage'){
  p=ownData(c.payload,['entry_id','attempt_id','supersedes_entry_id','input_tokens','output_tokens','cash_state','cash_micro_usd','rate']);
  if(!uuid(p.attempt_id))fail('validation_failed');
  nullable(p.input_tokens,1000000000);nullable(p.output_tokens,1000000000);cash(p);
  if(p.rate!==null){
   const r=ownData(p.rate,['kind','rate_id','input_micro_usd_per_token','output_micro_usd_per_token']);
   if(r.kind!=='invented-scenario-rate'||r.rate_id!=='toy-rate-v1'||r.input_micro_usd_per_token!==3||r.output_micro_usd_per_token!==7
    ||p.input_tokens===null||p.output_tokens===null||p.cash_state!=='estimated')fail('validation_failed');
   const total=int(3*p.input_tokens+7*p.output_tokens,AMOUNT);if(total!==p.cash_micro_usd)fail('validation_failed');p.rate=r;
  }
 }else if(c.action==='RecordScenarioCash'){
  p=ownData(c.payload,['entry_id','owner','line','supersedes_entry_id','cash_state','cash_micro_usd']);
  if(!Object.hasOwn(lineOwner,p.line)||p.owner!==lineOwner[p.line])fail('validation_failed');cash(p);
 }else if(c.action==='RecordStageTime'){
  p=ownData(c.payload,['entry_id','owner','stage','slot','supersedes_entry_id','minutes','payment_status','basis']);
  if(!['direct','G1','G2','G3','I1'].includes(p.owner)||!stages.includes(p.stage)||p.payment_status!=='unpaid')fail('validation_failed');
  int(p.slot,4,1);nullable(p.minutes,525600);if(p.basis!==(p.minutes===null?'unknown':'synthetic'))fail('validation_failed');
 }else fail('validation_failed');
 if(Object.hasOwn(p,'entry_id')){
  if(!uuid(p.entry_id)||!(p.supersedes_entry_id===null||uuid(p.supersedes_entry_id))||p.entry_id===p.supersedes_entry_id)fail('validation_failed');
 }
 c.payload=p;return copy(c);
}
function descriptor(){return {
 fixture_id:'comparison-v1',classification_basis:'fictional-comparison-only',
 productions:[{id:'G1',classification:'fictional-settled',investment_refs:[]},{id:'G2',classification:'fictional-new',investment_refs:['I1']},{id:'G3',classification:'fictional-new',investment_refs:['I1']}],
 investments:[{id:'I1',associated_first_game_id:'G2',reviewed_release_ref:null}],sample_n:{fictional_settled:1,fictional_new:2},
 denominator_basis:'closed-reference-population-assumption',eligible_population:['G2','G3'],reference_n:2,delivered_referencing_n:0,actual_reuse_share:null,delivered_unique_game_n:0
};}
function entryFor(c,recorded_at){
 let p=copy(c.payload),owner,kind,source_identity;
 if(c.action==='CaptureAttempt'){
  p={entry_id:c.command_id,attempt_id:p.attempt_id,supersedes_entry_id:null,input_tokens:null,output_tokens:null,cash_state:'unknown',cash_micro_usd:null,rate:null};
 }
 if(c.action==='CaptureAttempt'||c.action==='RecordAttemptUsage'){owner='direct';kind='usage';source_identity='usage/'+p.attempt_id;}
 else if(c.action==='RecordScenarioCash'){owner=p.owner;kind='cash';source_identity='comparison-v1/cash/'+p.line;}
 else if(c.action==='RecordStageTime'){owner=p.owner;kind='time';source_identity='time/'+owner+'/'+p.stage+'/'+p.slot;}
 else return null;
 return {entry_id:p.entry_id,source_identity,owner,kind,supersedes_entry_id:p.supersedes_entry_id,is_current:true,recorded_at,source_pin:copy(c.source_pin),payload:p};
}
const result=(row,status='acknowledged')=>({status,synthetic_only:true,command_id:row.command_id,version:dbint(row.aggregate_version,1)});

export async function createSyntheticCostService(input){
 try{return await build(input);}catch(e){throw normalize(e);}
}
async function build(input){
 const o=ownData(input,['env','db','auth','queue','generation','journal','keys','clock']);
 try{environmentSnapshot(o.env);}catch{fail('configuration_missing');}
 const {db,journal,clock}=o;
 if(!(db instanceof PGlite)||!isSyntheticCostJournal(journal)||typeof clock!=='function')fail('configuration_missing');
 const requireFounder=ownMethod(o.auth,'requireFounder'),queueRead=ownMethod(o.queue,'founderRead'),project=ownMethod(o.queue,'project');
 const generationRead=ownMethod(o.generation,'read');
 ownData(o.keys,['keyForHousehold']);const householdKey=ownMethod(o.keys,'keyForHousehold');
 const seal=ownMethod(journal,'seal'),fact=ownMethod(journal,'fact'),append=ownMethod(journal,'append'),records=ownMethod(journal,'records'),claimFreshNamespace=ownMethod(journal,'claimFreshNamespace');
 const namespace=ownData(journal,['namespace_verifier'],['seal','fact','append','records','claimFreshNamespace','close']).namespace_verifier;
 if(!hex(namespace))fail('configuration_missing');
 let closed=false;
 const now=()=>int(clock(),253402300799999,0,'configuration_missing');now();
 const iso=()=>new Date(now()).toISOString();
 function keyed(h,label,v){
  const key=privateKey(householdKey(h));
  try{return createHmac('sha256',key).update('cost-local-01\0'+label+'\0').update(canonical(v)).digest('hex');}finally{key.fill(0);}
 }
 const digest=(h,actor,epoch,command)=>keyed(h,'command',{actor_id:actor,consent_epoch:epoch,command});
 async function founder(tx,token,id){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||Buffer.from(token,'base64url').toString('base64url')!==token)fail('denied');
  const identity=await first(tx,'SELECT role,enabled FROM founder_identities WHERE identity_id=$1 FOR UPDATE',[id]);
  const session=await first(tx,'SELECT identity_id,expires_at,revoked_at FROM founder_sessions WHERE token_hash=$1 FOR UPDATE',[hash(token)]);
  if(!identity?.enabled||identity.role!=='founder'||!session||session.identity_id!==id||session.revoked_at||now()>=Date.parse(session.expires_at))fail('denied');
 }
 async function authority(token,s,work){
  if(closed)fail('configuration_missing');
  return serializeQueueWork(async()=>{
   let actor;try{actor=await requireFounder(token);}catch{fail('denied');}
   if(!uuid(actor?.identityId))fail('denied');
   return db.transaction(async tx=>{
    if(!await first(tx,'SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[s.household_id]))fail('denied');
    const consent=await first(tx,'SELECT consent_epoch,state,policy_version FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[s.household_id]);
    if(consent?.state!=='active'||consent.policy_version!=='TEST-v1')fail('denied');
    await founder(tx,token,actor.identityId);const epoch=dbint(consent.consent_epoch,1);
    const w=await first(tx,'SELECT child_id FROM wonder_requests WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[s.household_id,s.request_id]);if(!w)fail('denied');
    const d=await project(tx,{household_id:s.household_id,request_id:s.request_id,child_id:w.child_id,consent_epoch:epoch});
    if(d.scope_version!==s.scope_version||d.state!=='accepted'||d.scope_kind==='alternative'&&d.agreement_version!==d.scope_version)fail('conflict');
    const profile=await first(tx,'SELECT current_version,consent_epoch FROM child_setup_profiles WHERE household_id=$1 AND child_id=$2 FOR UPDATE',[s.household_id,w.child_id]);
    if(!profile||dbint(profile.consent_epoch,1)!==epoch)fail('denied');
    // No request text is retained in a cost context or fact.
    const a={h:s.household_id,id:actor.identityId,epoch,child:w.child_id,profile_version:dbint(profile.current_version,1),session_hash:hash(token)};
    const out=await work(tx,a);
    await founder(tx,token,a.id);
    const end=await first(tx,'SELECT consent_epoch,state FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[a.h]);
    if(end?.state!=='active'||dbint(end.consent_epoch,1)!==epoch)fail('denied');return out;
   });
  });
 }
 function sourceError(e){
  if(e?.code==='denied'||e?.status===401||e?.status===403)fail('denied');
  if(e?.code==='journal_unavailable')fail('journal_unavailable');
  fail('source_metadata_unavailable');
 }
 // This preflight deliberately excludes sealed generation commands, content,
 // digests, questions, provider payloads, and attempt lease recovery.
 async function anchors(tx,s,a){
  try{
   const head=await first(tx,'SELECT job_id FROM generation_slice_request_heads WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[a.h,s.request_id]);
   const jobs=await query(tx,'SELECT job_id,request_id,child_id,consent_epoch,request_scope_version,original_scope_version,profile_version,version,state,parent_revision_id,current_revision_id,fence FROM generation_slice_jobs WHERE household_id=$1 AND request_id=$2 ORDER BY job_id LIMIT 65 FOR UPDATE',[a.h,s.request_id]);
   if(jobs.length>64||head&&!jobs.some(j=>j.job_id===head.job_id)||!head&&jobs.length)fail('source_metadata_unavailable');
   const commands=await query(tx,'SELECT c.command_id,c.job_id,c.aggregate_version,c.record_id,c.primary_commit_id,a.command_id AS ack,a.record_id AS ack_record,a.primary_commit_id AS ack_commit FROM generation_slice_commands c JOIN generation_slice_jobs j USING(household_id,job_id) LEFT JOIN generation_slice_acknowledgements a ON a.household_id=c.household_id AND a.command_id=c.command_id WHERE c.household_id=$1 AND j.request_id=$2 ORDER BY c.job_id,c.aggregate_version LIMIT 1001',[a.h,s.request_id]);
   if(commands.length>1000)fail('source_metadata_unavailable');
   const revisions=await query(tx,'SELECT r.revision_id,r.parent_revision_id,r.job_id,r.command_id FROM generation_slice_revisions r JOIN generation_slice_jobs j USING(household_id,job_id) WHERE r.household_id=$1 AND j.request_id=$2 ORDER BY r.revision_id LIMIT 4097 FOR UPDATE OF r',[a.h,s.request_id]);
   if(revisions.length>4096)fail('source_metadata_unavailable');
   const attempts=await query(tx,'SELECT t.job_id,t.attempt_id,t.completion_id,t.state FROM generation_slice_attempts t JOIN generation_slice_jobs j USING(household_id,job_id) WHERE t.household_id=$1 AND j.request_id=$2 ORDER BY t.attempt_id LIMIT 65 FOR UPDATE OF t',[a.h,s.request_id]);
   if(attempts.length>64)fail('source_metadata_unavailable');
   for(const j of jobs){
    for(const k of ['job_id','request_id','child_id'])if(!uuid(j[k]))fail('source_metadata_unavailable');
    for(const k of ['consent_epoch','request_scope_version','original_scope_version','profile_version','version'])j[k]=dbint(j[k],1);
    j.fence=dbint(j.fence);
    if(j.request_id!==s.request_id||j.child_id!==a.child||![...terminals,'queued','running'].includes(j.state)
     ||![j.parent_revision_id,j.current_revision_id].every(x=>x===null||uuid(x)))fail('source_metadata_unavailable');
    const cs=commands.filter(c=>c.job_id===j.job_id),rs=revisions.filter(r=>r.job_id===j.job_id);
    if(cs.length!==j.version||rs.length>64)fail('source_metadata_unavailable');
    for(let i=0;i<cs.length;i++){
     const c=cs[i];c.aggregate_version=dbint(c.aggregate_version,1);
     if(c.aggregate_version!==i+1||['command_id','record_id','primary_commit_id'].some(k=>!uuid(c[k])))fail('source_metadata_unavailable');
     if(c.ack&&(c.ack!==c.command_id||c.ack_record!==c.record_id||c.ack_commit!==c.primary_commit_id))fail('source_metadata_unavailable');
    }
    for(const r of rs)if(!uuid(r.revision_id)||!(r.parent_revision_id===null||uuid(r.parent_revision_id))||!cs.some(c=>c.command_id===r.command_id))fail('source_metadata_unavailable');
    if(j.current_revision_id&&!rs.some(r=>r.revision_id===j.current_revision_id))fail('source_metadata_unavailable');
    if(j.parent_revision_id&&!revisions.some(r=>r.revision_id===j.parent_revision_id))fail('source_metadata_unavailable');
   }
   for(const t of attempts)if(!uuid(t.attempt_id)||!uuid(t.completion_id)||!jobs.some(j=>j.job_id===t.job_id)||!['authorized',...terminals].includes(t.state))fail('source_metadata_unavailable');
   if(new Set(attempts.map(t=>t.attempt_id)).size!==attempts.length||new Set(attempts.map(t=>t.completion_id)).size!==attempts.length)fail('source_metadata_unavailable');
   // Public generation.read is household-pending-sensitive. Do not convert its
   // temporary upstream uncertainty into a permanent cost retirement.
   const pending=!!await first(tx,'SELECT c.command_id FROM generation_slice_commands c LEFT JOIN generation_slice_acknowledgements a USING(household_id,command_id) WHERE c.household_id=$1 AND a.command_id IS NULL LIMIT 1',[a.h]);
   return copy({household_id:a.h,request_id:s.request_id,child_id:a.child,consent_epoch:a.epoch,profile_version:a.profile_version,scope_version:s.scope_version,head:head?.job_id??null,jobs,commands,revisions,attempts,pending});
  }catch(e){sourceError(e);}
 }
 const eligible=(j,s,a)=>j.consent_epoch===a.epoch&&j.profile_version===a.profile_version&&j.request_scope_version===s.scope_version;
 function validatePublic(input,j,b){
  try{
   // Inspect only descriptor-backed fields needed for metadata validation. The
   // trusted producer has already validated private contents and keyed digests.
   const v=ownData(input,['status','mock_only','request','job','revisions','pending']);
   if(v.status!=='generation_view'||v.mock_only!==true||!Array.isArray(v.pending)||v.pending.length||!Array.isArray(v.revisions)||v.revisions.length>64)fail('source_metadata_unavailable');
   const job=ownData(v.job,['job_id','state','version','fence','current_revision_id','parent_revision_id','is_current','mock_case']);
   if(job.job_id!==j.job_id||job.state!==j.state||job.version!==j.version||job.fence!==j.fence||job.current_revision_id!==j.current_revision_id||job.parent_revision_id!==j.parent_revision_id||job.is_current!==(b.head===j.job_id))fail('source_metadata_unavailable');
   const expected=b.revisions.filter(r=>r.job_id===j.job_id).map(r=>r.revision_id);
   if(j.parent_revision_id&&!expected.includes(j.parent_revision_id))expected.push(j.parent_revision_id);
   const ids=[];
   for(let i=0;i<v.revisions.length;i++){
    const d=Object.getOwnPropertyDescriptor(v.revisions,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('source_metadata_unavailable');
    const r=ownData(d.value,['revision_id','parent_revision_id','adventure','output_digest','diff','source_scope_version','request_scope_version','status','publish_authority','lineage','validation','review_evidence','usage','pattern_classification']);
    const l=ownData(r.lineage,['profile_version','provider','model','model_config_version','prompt_version','pattern_version','pattern_digest','pattern_digest_kind','asset_digest','asset_digest_kind','engine_version','validator_version','input_digest','output_digest','attempt_id']);
    const u=ownData(r.usage,['kind','provider_usage','estimated_cash','billed_cash','cash_state']);
    const validation=ownData(r.validation,['structure','facts','human_review']);
    if(!uuid(r.revision_id)||ids.includes(r.revision_id)||!expected.includes(r.revision_id)||r.status!=='draft'||r.publish_authority!==false||r.pattern_classification!==classification
     ||!same(u,{kind:'mock',provider_usage:null,estimated_cash:null,billed_cash:null,cash_state:'unknown'})
     ||!same(validation,{structure:'passed',facts:'pending',human_review:'pending'})
     ||l.provider!=='deterministic-local-mock'||l.model!=='mock-fixture-1'||l.model_config_version!=='local-mock-v1'||l.prompt_version!=='mock-prompt-1'
     ||l.pattern_version!=='fixture-1'||l.engine_version!=='fixture-engine-1'||l.validator_version!=='mock-validator-1'
     ||l.pattern_digest_kind!=='unreleased-fixture-rule-descriptor'||l.asset_digest_kind!=='fixture-allowlist-labels-only'
     ||!Number.isSafeInteger(l.profile_version)||l.profile_version<1||!(l.attempt_id===null||uuid(l.attempt_id))
     ||!Array.isArray(r.review_evidence)||r.review_evidence.length)fail('source_metadata_unavailable');
    const meta=b.revisions.find(x=>x.revision_id===r.revision_id);
    if(!meta||r.parent_revision_id!==meta.parent_revision_id)fail('source_metadata_unavailable');
    ids.push(r.revision_id);
   }
   if(!same(ids.sort(),expected.sort()))fail('source_metadata_unavailable');
   // Nothing from request/adventure/diff/content digests escapes this function.
  }catch(e){sourceError(e);}
 }
 async function inventory(tx,s,a,b){
  const current=await anchors(tx,s,a);if(current.pending)fail('journal_unavailable');
  if(!same(current,b))fail('conflict');
  const out=[],blocked=[];
  for(const j of current.jobs){
   if(!eligible(j,s,a))continue;
   if(!terminals.includes(j.state)){blocked.push(j.job_id);continue;}
   const meta=current.attempts.find(t=>t.job_id===j.job_id);
   if(!meta){if(j.state!=='cancelled'||j.fence!==1||j.version!==2)fail('source_metadata_unavailable');continue;}
   const t=await first(tx,'SELECT job_id,attempt_id,completion_id,fence,started_at,lease_until,state FROM generation_slice_attempts WHERE household_id=$1 AND job_id=$2 FOR UPDATE',[a.h,j.job_id]);
   if(!t||t.attempt_id!==meta.attempt_id||t.completion_id!==meta.completion_id||t.state!==j.state||t.state!==meta.state||dbint(t.fence,1)!==(j.state==='cancelled'?j.fence-1:j.fence))fail('source_metadata_unavailable');
   const dispatch=current.commands.find(c=>c.command_id===t.attempt_id&&c.job_id===j.job_id),completion=current.commands.find(c=>c.command_id===t.completion_id&&c.job_id===j.job_id);
   if(!dispatch?.ack||dispatch.aggregate_version!==2||j.state!=='cancelled'&&!completion?.ack)fail('source_metadata_unavailable');
   const started_at=instant(t.started_at,'source_metadata_unavailable'),lease_until=instant(t.lease_until,'source_metadata_unavailable');
   if(Date.parse(lease_until)<Date.parse(started_at))fail('source_metadata_unavailable');
   out.push({job_id:j.job_id,attempt_id:t.attempt_id,completion_id:t.completion_id,state:j.state,fence:dbint(t.fence,1),started_at,lease_until,
    revision_ids:current.revisions.filter(r=>r.job_id===j.job_id).map(r=>r.revision_id).sort(),dispatch_state:'unknown',failure_class:null,latency_ms:null,
    usage_kind:'mock',provider_usage:null,estimated_cash:null,billed_cash:null,cash_state:'unknown',classification});
  }
  const metadata={anchors:current,attempts:out};
  const source_pin={consent_epoch:a.epoch,profile_version:a.profile_version,scope_version:s.scope_version,inventory_digest:keyed(a.h,'source-inventory',metadata)};
  const head=current.jobs.find(j=>j.job_id===current.head);
  let availability='available';
  if(!head)availability='not_requested';
  else if(head.consent_epoch!==a.epoch||head.profile_version!==a.profile_version)availability='stale_profile';
  else if(head.request_scope_version!==s.scope_version)availability='stale_scope';
  else if(blocked.length)availability='in_progress';
  return {metadata,attempts:out,source:{availability,pin:source_pin,capturable_attempt_ids:out.map(t=>t.attempt_id).sort(),blocked_job_ids:blocked.sort(),classification}};
 }
 async function source(token,s){
  const b=await authority(token,s,(tx,a)=>anchors(tx,s,a));if(b.pending)fail('journal_unavailable');
  for(const j of b.jobs){
   if(j.consent_epoch!==b.consent_epoch||j.profile_version!==b.profile_version||j.request_scope_version!==s.scope_version||!terminals.includes(j.state))continue;
   let v;try{v=await generationRead(token,{...s,job_id:j.job_id});}catch(e){sourceError(e);}
   // A pending DTO has a different exact shape.
   try{
    const status=ownData(v,[],['status','mock_only','request','job','revisions','pending']).status;
    if(status==='generation_pending')fail('journal_unavailable');
    validatePublic(v,j,b);
   }finally{v=null;}
  }
  return authority(token,s,(tx,a)=>inventory(tx,s,a,b));
 }
 async function pinSource(tx,s,a,b){
  const v=await inventory(tx,s,a,b.metadata.anchors);
  if(!same(v.metadata,b.metadata)||!same(v.source.pin,b.source.pin))fail('conflict');return v;
 }
 async function globalKey(tx,a,s,id){
  const other=await first(tx,'SELECT household_id,request_id,actor_id FROM cost_slice_commands WHERE command_id=$1 UNION ALL SELECT household_id,request_id,actor_id FROM cost_slice_absences WHERE command_id=$1',[id]);
  if(other&&(other.household_id!==a.h||other.request_id!==s.request_id||other.actor_id!==a.id))fail('denied');
 }
 async function absence(tx,h,id){return first(tx,'SELECT * FROM cost_slice_absences WHERE household_id=$1 AND command_id=$2',[h,id]);}
 async function refuseRetired(tx,a,s,id){await globalKey(tx,a,s,id);if(await absence(tx,a.h,id))fail('conflict');}
 function owns(row,a,s){if(!row||row.household_id!==a.h||row.request_id!==s.request_id||row.actor_id!==a.id)fail('denied');}
 async function decoded(row){
  try{
   const f=await fact(row.sealed_fact),v=scope(f.command,['command']),c=parseCommand(v.command);
   const e=ownData(f.effect,['metadata','attempt','entry','comparison']);
   if(f.format!=='queue-committed-fact-v1'||f.scope!=='household'||f.actor_kind!=='founder'||f.household_id!==row.household_id||f.command_id!==row.command_id
    ||f.record_id!==row.record_id||f.primary_commit_id!==row.primary_commit_id||f.actor_id!==row.actor_id||f.original_session_hash!==row.original_session_hash
    ||f.consent_epoch!==dbint(row.consent_epoch,1)||f.aggregate_version!==dbint(row.aggregate_version,1)||f.recorded_at!==instant(row.recorded_at)
    ||f.namespace_verifier!==namespace||row.namespace_verifier!==namespace||f.canonical_digest!==row.canonical_digest
    ||digest(row.household_id,row.actor_id,f.consent_epoch,f.command)!==row.canonical_digest
    ||v.household_id!==row.household_id||v.request_id!==row.request_id||v.scope_version!==dbint(row.scope_version,1)
    ||c.command_id!==row.command_id||c.action!==row.action||c.expected_version+1!==f.aggregate_version||!same(f.result,result(row)))fail('recovery_quarantined');
   const m=ownData(e.metadata,['anchors','attempts']),b=m.anchors;
   if(b.household_id!==row.household_id||b.request_id!==row.request_id||b.child_id!==row.child_id||b.consent_epoch!==f.consent_epoch
    ||b.profile_version!==dbint(row.profile_version,1)||b.scope_version!==v.scope_version||b.pending!==false
    ||!same(c.source_pin,{consent_epoch:b.consent_epoch,profile_version:b.profile_version,scope_version:b.scope_version,inventory_digest:keyed(row.household_id,'source-inventory',m)}))fail('recovery_quarantined');
   if(!same(e.entry,entryFor(c,f.recorded_at))||!same(e.comparison,c.action==='OpenComparison'?descriptor():null))fail('recovery_quarantined');
   const expected=c.action==='CaptureAttempt'?m.attempts.find(t=>t.job_id===c.payload.job_id&&t.attempt_id===c.payload.attempt_id):null;
   if(c.action==='CaptureAttempt'&&!expected||!same(e.attempt,expected??null))fail('recovery_quarantined');
   // Also apply the real pure validator to every stored attempt inventory.
   summarizeCostLedger({source_attempts:m.attempts,attempts:[],entries:[],comparison:null,blocked_job_ids:b.jobs.filter(j=>eligible(j,v,{epoch:b.consent_epoch,profile_version:b.profile_version})&&!terminals.includes(j.state)).map(j=>j.job_id)});
   return f;
  }catch(e){if(e?.code==='journal_unavailable')throw e;fail('recovery_quarantined');}
 }
 async function history(tx,h){
  const rows=await query(tx,'SELECT c.*,a.command_id AS ack,a.record_id AS ack_record,a.primary_commit_id AS ack_commit FROM cost_slice_commands c LEFT JOIN cost_slice_acknowledgements a USING(household_id,command_id) WHERE c.household_id=$1 ORDER BY c.request_id,c.aggregate_version',[h]);
  const markers=await query(tx,'SELECT * FROM cost_slice_absences WHERE household_id=$1 ORDER BY request_id,command_id',[h]);
  const independent=await records(h),seen=new Set(),versions=new Map(),retired=new Map();
  if(!Array.isArray(independent))fail('recovery_quarantined');
  for(const r of independent){
   const row=rows.find(x=>x.command_id===r.command_id);
   if(!row||seen.has(r.command_id)||!same(row.sealed_fact,r))fail('recovery_quarantined');seen.add(r.command_id);
  }
  for(const m of markers){
   if(!uuid(m.command_id)||!uuid(m.request_id)||!uuid(m.actor_id)||!['absent','fenced'].includes(m.resolution))fail('recovery_quarantined');
   const row=rows.find(x=>x.command_id===m.command_id);instant(m.recorded_at);
   if(m.resolution==='absent'?(m.original_version!==null||!!row):(!row||row.ack||row.request_id!==m.request_id||row.actor_id!==m.actor_id||dbint(m.original_version,1)!==dbint(row.aggregate_version,1)))fail('recovery_quarantined');
   retired.set(m.command_id,m);
  }
  for(const id of new Set(markers.map(m=>m.request_id)))if(markers.filter(m=>m.request_id===id&&m.resolution==='absent').length>64)fail('recovery_quarantined');
  const attempts=await query(tx,'SELECT * FROM cost_slice_attempts WHERE household_id=$1',[h]);
  const entries=await query(tx,'SELECT * FROM cost_slice_entries WHERE household_id=$1',[h]);
  const comparisons=await query(tx,'SELECT * FROM cost_slice_comparisons WHERE household_id=$1',[h]);
  let na=0,ne=0,nc=0;const out=[];
  for(const row of rows){
   const version=(versions.get(row.request_id)??0)+1;versions.set(row.request_id,version);
   if(version>1000||dbint(row.aggregate_version,1)!==version)fail('recovery_quarantined');
   const f=await decoded(row),a=attempts.find(t=>t.command_id===row.command_id),e=entries.find(t=>t.command_id===row.command_id),c=comparisons.find(t=>t.command_id===row.command_id);
   if(row.ack&&(!seen.has(row.command_id)||row.ack_record!==row.record_id||row.ack_commit!==row.primary_commit_id||retired.has(row.command_id)))fail('recovery_quarantined');
   if(row.ack&&f.effect.attempt){
    na++;if(!a||!same(a,{household_id:h,request_id:row.request_id,attempt_id:f.effect.attempt.attempt_id,command_id:row.command_id}))fail('recovery_quarantined');
   }else if(a)fail('recovery_quarantined');
   if(row.ack&&f.effect.entry){
    ne++;const x=f.effect.entry;
    if(!e||!same(e,{household_id:h,request_id:row.request_id,entry_id:x.entry_id,command_id:row.command_id,source_identity:x.source_identity,kind:x.kind,owner:x.owner,supersedes_entry_id:x.supersedes_entry_id}))fail('recovery_quarantined');
   }else if(e)fail('recovery_quarantined');
   if(row.ack&&f.effect.comparison){nc++;if(!c||!same(c,{household_id:h,request_id:row.request_id,command_id:row.command_id}))fail('recovery_quarantined');}
   else if(c)fail('recovery_quarantined');
   out.push({row,f,retired:retired.get(row.command_id)??null});
  }
  if(na!==attempts.length||ne!==entries.length||nc!==comparisons.length)fail('recovery_quarantined');
  // Counts above supplement exact row equality; they are not the integrity test.
  for(const request_id of versions.keys()){
   try{ledger(out,{household_id:h,request_id,scope_version:1},[]);}catch{fail('recovery_quarantined');}
  }
  return out;
 }
 function ledger(rows,s,source_attempts){
  const all=rows.filter(x=>x.row.request_id===s.request_id),acked=all.filter(x=>x.row.ack);
  const attempts=acked.filter(x=>x.f.effect.attempt).map(x=>copy(x.f.effect.attempt));
  const entries=acked.filter(x=>x.f.effect.entry).map(x=>copy(x.f.effect.entry));
  const superseded=new Set(entries.map(e=>e.supersedes_entry_id).filter(Boolean));
  for(const e of entries)e.is_current=!superseded.has(e.entry_id);
  const comparison=acked.find(x=>x.f.effect.comparison)?.f.effect.comparison??null;
  return {version:all.length?dbint(all.at(-1).row.aggregate_version,1):0,attempts,entries,comparison:copy(comparison),source_attempts};
 }
 function projectView(rows,s,b){
  const l=ledger(rows,s,b.attempts);
  const summary=summarizeCostLedger({source_attempts:l.source_attempts,attempts:l.attempts,entries:l.entries,comparison:l.comparison,blocked_job_ids:b.source.blocked_job_ids});
  return {status:'cost_view',synthetic_only:true,scope:copy(s),version:l.version,source:copy(b.source),attempts:l.attempts,entries:l.entries,comparison:l.comparison,summary,pending:[]};
 }
 function changed(item,rows,b){
  return !!item.retired||rows.some(x=>x.row.request_id===item.row.request_id&&dbint(x.row.aggregate_version,1)>dbint(item.row.aggregate_version,1))
   ||!same(item.f.effect.metadata.anchors,b);
 }
 async function livePending(tx,rows,s,b){
  const out=[];
  for(const item of rows.filter(x=>x.row.request_id===s.request_id&&!x.row.ack)){
   if(changed(item,rows,b))continue;
   const actor=await first(tx,'SELECT role,enabled FROM founder_identities WHERE identity_id=$1',[item.row.actor_id]);
   if(actor?.enabled&&actor.role==='founder')out.push(item);
  }
  return out;
 }
 async function retire(tx,item){
  if(item.row.ack)fail('recovery_quarantined');
  if(!item.retired)await tx.query("INSERT INTO cost_slice_absences(household_id,command_id,request_id,actor_id,recorded_at,resolution,original_version) VALUES($1,$2,$3,$4,$5,'fenced',$6)",[item.row.household_id,item.row.command_id,item.row.request_id,item.row.actor_id,iso(),item.row.aggregate_version]);
 }
 async function prefinish(token,s,row){
  return authority(token,s,async(tx,a)=>{
   await globalKey(tx,a,s,row.command_id);const rows=await history(tx,a.h),item=rows.find(x=>x.row.command_id===row.command_id);owns(item?.row,a,s);
   if(!same(item.row.sealed_fact,row.sealed_fact))fail('recovery_quarantined');
   if(item.row.ack)return {done:result(item.row)};
   if(item.retired)return {done:result(item.row,'cost_command_fenced')};
   const b=await anchors(tx,s,a);if(b.pending)fail('journal_unavailable');
   const actor=await first(tx,'SELECT role,enabled FROM founder_identities WHERE identity_id=$1',[item.row.actor_id]);
   if(changed(item,rows,b)||!actor?.enabled||actor.role!=='founder'){
    await retire(tx,item);return {done:result(item.row,'cost_command_fenced')};
   }
   return {rows,item};
  });
 }
 function finishResult(v,reconciling){if(v.status==='cost_command_fenced'&&!reconciling)fail('conflict');return v;}
 async function finish(token,s,row,reconciling=false){
  let before=await prefinish(token,s,row);if(before.done)return finishResult(before.done,reconciling);
  let b=await source(token,s);
  let checked=await authority(token,s,async(tx,a)=>{
   await pinSource(tx,s,a,b);const rows=await history(tx,a.h),item=rows.find(x=>x.row.command_id===row.command_id);owns(item?.row,a,s);
   if(item.row.ack)return {done:result(item.row)};
   if(changed(item,rows,b.metadata.anchors)){await retire(tx,item);return {done:result(row,'cost_command_fenced')};}
   return {rows,item};
  });
  if(checked.done)return finishResult(checked.done,reconciling);
  let appendFailed=false;
  try{
   // Older superseded facts remain forensic intents. They receive no effects.
   const older=checked.rows.filter(x=>!x.row.ack&&x.row.request_id===s.request_id&&dbint(x.row.aggregate_version,1)<dbint(row.aggregate_version,1));
   for(const item of [...older,checked.item])if(await append(item.row.sealed_fact)!=='queue-fsync:'+item.row.record_id)fail('recovery_quarantined');
  }catch(e){if(e?.code==='recovery_quarantined')throw e;appendFailed=true;}
  before=await prefinish(token,s,row);if(before.done)return finishResult(before.done,reconciling);
  // Real explicit-ID terminal validation is repeated after append, outside the
  // global serializer and all transactions. Queued/running reads never occur.
  b=await source(token,s);
  const outcome=await authority(token,s,async(tx,a)=>{
   await globalKey(tx,a,s,row.command_id);
   const rows=await history(tx,a.h),item=rows.find(x=>x.row.command_id===row.command_id);owns(item?.row,a,s);
   if(item.row.ack)return result(item.row);
   const current=await pinSource(tx,s,a,b);
   if(changed(item,rows,current.metadata.anchors)||!same(item.f.effect.metadata,current.metadata)){
    await retire(tx,item);return result(row,'cost_command_fenced');
   }
   if(appendFailed)return result(row,'retryable_unacknowledged');
   if(!(await records(a.h)).some(r=>same(r,item.row.sealed_fact)))fail('recovery_quarantined');
   validateEffect(rows,s,item.f.command.command,item.f.effect);
   const e=item.f.effect;
   if(e.attempt)await tx.query('INSERT INTO cost_slice_attempts(household_id,request_id,attempt_id,command_id) VALUES($1,$2,$3,$4)',[a.h,s.request_id,e.attempt.attempt_id,row.command_id]);
   if(e.comparison)await tx.query('INSERT INTO cost_slice_comparisons(household_id,request_id,command_id) VALUES($1,$2,$3)',[a.h,s.request_id,row.command_id]);
   if(e.entry){const x=e.entry;await tx.query('INSERT INTO cost_slice_entries(household_id,request_id,entry_id,command_id,source_identity,kind,owner,supersedes_entry_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.h,s.request_id,x.entry_id,row.command_id,x.source_identity,x.kind,x.owner,x.supersedes_entry_id]);}
   await tx.query('INSERT INTO cost_slice_acknowledgements(household_id,command_id,record_id,primary_commit_id,acknowledged_at) VALUES($1,$2,$3,$4,$5)',[a.h,row.command_id,row.record_id,row.primary_commit_id,iso()]);
   return result(row);
  });
  return finishResult(outcome,reconciling);
 }
 function validateEffect(rows,s,c,effect){
  const l=ledger(rows,s,effect.metadata.attempts),entry=effect.entry;
  if(c.action==='CaptureAttempt'){
   if(!effect.attempt||l.attempts.some(t=>t.attempt_id===effect.attempt.attempt_id)||l.attempts.length>=64)fail('conflict');
  }
  if(c.action==='OpenComparison'&&l.comparison)fail('conflict');
  if(entry){
   if(rows.some(x=>x.row.command_id!==c.command_id&&x.f.effect.entry?.entry_id===entry.entry_id))fail('conflict');
   if(entry.owner!=='direct'&&!l.comparison)fail('conflict');
   const group=l.entries.filter(x=>x.source_identity===entry.source_identity),leaf=group.find(x=>x.is_current);
   if(entry.supersedes_entry_id===null){if(group.length||c.action==='RecordAttemptUsage')fail('conflict');}
   else if(!leaf||leaf.entry_id!==entry.supersedes_entry_id||leaf.owner!==entry.owner||leaf.kind!==entry.kind)fail('conflict');
   if(c.action==='RecordAttemptUsage'&&!l.attempts.some(t=>t.attempt_id===c.payload.attempt_id))fail('conflict');
   const prior=l.entries.find(x=>x.entry_id===entry.supersedes_entry_id);if(prior)prior.is_current=false;
   l.entries.push(copy(entry));
  }
  if(effect.attempt)l.attempts.push(copy(effect.attempt));
  if(effect.comparison)l.comparison=copy(effect.comparison);
  summarizeCostLedger({source_attempts:effect.metadata.attempts,attempts:l.attempts,entries:l.entries,comparison:l.comparison,blocked_job_ids:effect.metadata.anchors.jobs.filter(j=>j.consent_epoch===c.source_pin.consent_epoch&&j.profile_version===c.source_pin.profile_version&&j.request_scope_version===s.scope_version&&!terminals.includes(j.state)).map(j=>j.job_id)});
 }

 await serializeQueueWork(()=>db.transaction(async tx=>{
  if(!await first(tx,'SELECT version FROM schema_migrations WHERE version=15'))fail('configuration_missing');
  const n=await first(tx,'SELECT namespace_verifier FROM cost_slice_namespace WHERE singleton=true FOR UPDATE');if(!n)fail('configuration_missing');
  if(n.namespace_verifier===null){
   const counts=await first(tx,'SELECT (SELECT count(*) FROM cost_slice_commands)+(SELECT count(*) FROM cost_slice_acknowledgements)+(SELECT count(*) FROM cost_slice_absences)+(SELECT count(*) FROM cost_slice_attempts)+(SELECT count(*) FROM cost_slice_entries)+(SELECT count(*) FROM cost_slice_comparisons) AS n');
   if(dbint(counts.n)!==0||await claimFreshNamespace()!==namespace)fail('recovery_quarantined');
   await tx.query('UPDATE cost_slice_namespace SET namespace_verifier=$1 WHERE singleton=true',[namespace]);
  }else if(n.namespace_verifier!==namespace)fail('recovery_quarantined');
  const households=await query(tx,'SELECT household_id FROM households ORDER BY household_id');
  for(const h of households)await history(tx,h.household_id);
 }));

 async function list(token,input){
  ownData(snapshot(input),[]);
  const q=await queueRead(token,{filter:'accepted'}),out=[];
  const view=ownData(q,[],Reflect.ownKeys(q));
  if(!Array.isArray(view.requests)||view.requests.length>1000)fail('source_metadata_unavailable');
  for(const r of view.requests){
   const s=copy(scope({household_id:r.household_id,request_id:r.request_id,scope_version:r.scope_version}));
   try{await authority(token,s,async()=>{});if(out.some(x=>x.household_id===s.household_id&&x.request_id===s.request_id))fail('source_metadata_unavailable');out.push(s);}
   catch(e){if(!['denied','conflict'].includes(e?.code))throw e;}
  }
  const requests=[];
  for(const s of out){try{await authority(token,s,async()=>{});requests.push(s);}catch(e){if(!['denied','conflict'].includes(e?.code))throw e;}}
  try{await requireFounder(token);}catch{fail('denied');}
  return {status:'cost_list',synthetic_only:true,requests};
 }
 async function read(token,input){
  const s=copy(scope(snapshot(input))),b=await source(token,s);
  return authority(token,s,async(tx,a)=>{
   await pinSource(tx,s,a,b);const rows=await history(tx,a.h),live=await livePending(tx,rows,s,b.metadata.anchors);
   if(live.length)return {status:'cost_pending',synthetic_only:true,pending:live.filter(x=>x.row.actor_id===a.id).map(x=>({command_id:x.row.command_id}))};
   return projectView(rows,s,b);
  });
 }
 async function command(token,input){
  const v=scope(snapshot(input),['command']),s=copy({household_id:v.household_id,request_id:v.request_id,scope_version:v.scope_version}),c=parseCommand(v.command),envelope={...s,command:c};
  const prior=await authority(token,s,async(tx,a)=>{
   await refuseRetired(tx,a,s,c.command_id);const rows=await history(tx,a.h),old=rows.find(x=>x.row.command_id===c.command_id);
   if(!old)return null;owns(old.row,a,s);
   // Bind to recorded actor/epoch, never a replacement session token.
   if(old.row.canonical_digest!==digest(a.h,old.row.actor_id,dbint(old.row.consent_epoch,1),envelope))fail('conflict');return old.row;
  });
  if(prior)return finish(token,s,prior);
  const b=await source(token,s);
  const row=await authority(token,s,async(tx,a)=>{
   await refuseRetired(tx,a,s,c.command_id);const rows=await history(tx,a.h),old=rows.find(x=>x.row.command_id===c.command_id);
   if(old){owns(old.row,a,s);if(old.row.canonical_digest!==digest(a.h,old.row.actor_id,dbint(old.row.consent_epoch,1),envelope))fail('conflict');return old.row;}
   const current=await pinSource(tx,s,a,b);
   if(!same(c.source_pin,current.source.pin))fail('conflict');
   const selected=rows.filter(x=>x.row.request_id===s.request_id),version=selected.length?dbint(selected.at(-1).row.aggregate_version,1):0;
   if(selected.length>=1000)fail('configuration_missing');if(c.expected_version!==version)fail('conflict');
   if((await livePending(tx,rows,s,current.metadata.anchors)).length)fail('journal_unavailable');
   const recorded_at=iso(),effect={metadata:copy(current.metadata),attempt:null,entry:entryFor(c,recorded_at),comparison:c.action==='OpenComparison'?descriptor():null};
   if(c.action==='CaptureAttempt'){
    effect.attempt=copy(current.attempts.find(t=>t.job_id===c.payload.job_id&&t.attempt_id===c.payload.attempt_id)??null);
    if(!effect.attempt)fail('conflict');
   }
   validateEffect(rows,s,c,effect);
   const record_id=randomUUID(),primary_commit_id=randomUUID(),canonical_digest=digest(a.h,a.id,a.epoch,envelope),aggregate_version=version+1;
   const f={format:'queue-committed-fact-v1',scope:'household',household_id:a.h,consent_epoch:a.epoch,record_id,command_id:c.command_id,primary_commit_id,
    actor_id:a.id,actor_kind:'founder',original_session_hash:a.session_hash,recorded_at,aggregate_version,canonical_digest,namespace_verifier:namespace,
    command:envelope,result:{status:'acknowledged',synthetic_only:true,command_id:c.command_id,version:aggregate_version},effect};
   const sealed=await seal(f);
   await tx.query('INSERT INTO cost_slice_commands(household_id,command_id,request_id,scope_version,child_id,profile_version,actor_id,consent_epoch,original_session_hash,aggregate_version,action,record_id,primary_commit_id,canonical_digest,namespace_verifier,recorded_at,sealed_fact) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)',
    [a.h,c.command_id,s.request_id,s.scope_version,a.child,a.profile_version,a.id,a.epoch,a.session_hash,aggregate_version,c.action,record_id,primary_commit_id,canonical_digest,namespace,recorded_at,JSON.stringify(sealed)]);
   return first(tx,'SELECT * FROM cost_slice_commands WHERE household_id=$1 AND command_id=$2',[a.h,c.command_id]);
  });
  return finish(token,s,row);
 }
 async function reconcile(token,input){
  const v=scope(snapshot(input),['command_id']);if(!uuid(v.command_id))fail('validation_failed');
  const s=copy({household_id:v.household_id,request_id:v.request_id,scope_version:v.scope_version});
  const outcome=await authority(token,s,async(tx,a)=>{
   await globalKey(tx,a,s,v.command_id);const rows=await history(tx,a.h),found=rows.find(x=>x.row.command_id===v.command_id);
   const marker=await absence(tx,a.h,v.command_id);
   if(marker){
    if(marker.actor_id!==a.id||marker.request_id!==s.request_id)fail('denied');
    return {done:{status:marker.resolution==='absent'?'cost_command_absent':'cost_command_fenced',synthetic_only:true,command_id:v.command_id,version:marker.resolution==='absent'?0:dbint(marker.original_version,1)}};
   }
   if(found){owns(found.row,a,s);return {row:found.row};}
   const n=await first(tx,"SELECT count(*) AS n FROM cost_slice_absences WHERE household_id=$1 AND request_id=$2 AND resolution='absent'",[a.h,s.request_id]);
   if(dbint(n.n)>=64)fail('configuration_missing');
   await tx.query("INSERT INTO cost_slice_absences(household_id,command_id,request_id,actor_id,recorded_at,resolution,original_version) VALUES($1,$2,$3,$4,$5,'absent',NULL)",[a.h,v.command_id,s.request_id,a.id,iso()]);
   return {done:{status:'cost_command_absent',synthetic_only:true,command_id:v.command_id,version:0}};
  });
  return outcome.done??finish(token,s,outcome.row,true);
 }
 const guarded=fn=>async(...args)=>{
  try{
   if(closed)fail('configuration_missing');const out=await fn(...args);
   if(Buffer.byteLength(canonical(out))>1048576)fail('source_metadata_unavailable');return freeze(out);
  }catch(e){throw normalize(e);}
 };
 return Object.freeze({list:guarded(list),read:guarded(read),command:guarded(command),reconcile:guarded(reconcile),close(){closed=true;}});
}

