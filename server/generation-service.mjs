// GENERATION-LOCAL-01: founder-only local mock engineering. Never publishes.
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {ownData,ownMethod,canonical,privateKey,uuid,environmentSnapshot} from './continuation-journal.mjs';
import {serializeQueueWork} from './request-queue.mjs';
import {isSyntheticGenerationJournal} from './generation-journal.mjs';
import {prepareFixtureInput,validateFixtureDraft,validateMockLimits,isSyntheticMockProvider} from '../lib/loop/draft-fixture.mjs';
const fail=code=>{throw Object.assign(new Error('Local mock draft unavailable.'),{code,status:({validation_failed:400,denied:403,conflict:409,journal_unavailable:503,recovery_quarantined:503,configuration_missing:503})[code]??503});};
const first=async(tx,sql,args=[])=>(await tx.query(sql,args)).rows[0];
const hash=value=>createHash('sha256').update(value).digest('hex');
const copy=value=>JSON.parse(canonical(value));
const same=(a,b)=>canonical(a)===canonical(b);
const integer=(v,min=0)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>=Number.MAX_SAFE_INTEGER)fail('recovery_quarantined');return n;};
const positive=v=>Number.isSafeInteger(v)&&v>0&&v<Number.MAX_SAFE_INTEGER;
const text=(v,max=2000)=>typeof v==='string'&&v.trim()&&v.length<=max;
const terminal=s=>['failed','unsupported','cancelled','uncertain','draft_ready'].includes(s);
const shapes={RequestGeneration:['mock_case'],StartMock:[],EditRevision:['revision_id','field','value'],Regenerate:['revision_id','field','mock_case'],CancelJob:['reason']};
const cases=['valid','invalid','unsupported','timeout','delayed'];
function scope(value,extra=[]){const v=ownData(value,['household_id','request_id','scope_version',...extra]);if(!uuid(v.household_id)||!uuid(v.request_id)||!positive(v.scope_version))fail('validation_failed');return v;}
function parseCommand(value){
 const c=ownData(value,['command_id','job_id','expected_version','action','payload']);
 if(!uuid(c.command_id)||!(c.job_id===null||uuid(c.job_id))||!Number.isSafeInteger(c.expected_version)||c.expected_version<0||c.expected_version>=Number.MAX_SAFE_INTEGER||!Object.hasOwn(shapes,c.action))fail('validation_failed');
 c.payload=ownData(c.payload,shapes[c.action]);canonical(c);
 if(Object.hasOwn(c.payload,'mock_case')&&!cases.includes(c.payload.mock_case))fail('validation_failed');
 if(Object.hasOwn(c.payload,'field')&&!['all','opening','help','offscreen'].includes(c.payload.field))fail('validation_failed');
 if(Object.hasOwn(c.payload,'revision_id')&&!(c.payload.revision_id===null||uuid(c.payload.revision_id)))fail('validation_failed');
 if(c.action==='EditRevision'&&(c.payload.field==='all'||!uuid(c.payload.revision_id)))fail('validation_failed');
 if(c.action==='CancelJob'&&!text(c.payload.reason))fail('validation_failed');
 if(c.action==='RequestGeneration'&&(c.job_id!==null||c.expected_version!==0)||c.action!=='RequestGeneration'&&!uuid(c.job_id))fail('validation_failed');return copy(c);
}
export async function createSyntheticGenerationService(input){
 const o=ownData(input,['env','db','auth','queue','journal','keys','clock','limits','provider']);environmentSnapshot(o.env);const limits=validateMockLimits(o.limits);
 const {db,journal,clock,provider}=o;if(!(db instanceof PGlite)||!isSyntheticGenerationJournal(journal)||!isSyntheticMockProvider(provider)||typeof clock!=='function')fail('configuration_missing');
 const requireFounder=ownMethod(o.auth,'requireFounder'),queueRead=ownMethod(o.queue,'founderRead'),project=ownMethod(o.queue,'project');ownData(o.keys,['keyForHousehold']);const householdKey=ownMethod(o.keys,'keyForHousehold');
 const seal=ownMethod(journal,'seal'),fact=ownMethod(journal,'fact'),records=ownMethod(journal,'records'),append=ownMethod(journal,'append'),claimFreshNamespace=ownMethod(journal,'claimFreshNamespace'),namespace=journal.namespace_verifier;
 if(typeof namespace!=='string'||!/^[a-f0-9]{64}$/.test(namespace))fail('configuration_missing');
 const active=new Map(),workerKey=(s,id)=>s.household_id+':'+id;let closed=false;
 const now=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<0||n>253402300799999)fail('configuration_missing');return n;};now();
 const iso=()=>new Date(now()).toISOString();
 const keyed=(h,label,v)=>{const key=privateKey(householdKey(h));try{return createHmac('sha256',key).update('generation-local-01\0'+label+'\0').update(canonical(v)).digest('hex');}finally{key.fill(0);}};
 await serializeQueueWork(()=>db.transaction(async tx=>{
  if(!await first(tx,'SELECT version FROM schema_migrations WHERE version=13'))fail('configuration_missing');
  const row=await first(tx,'SELECT * FROM generation_slice_namespace WHERE singleton=true FOR UPDATE');if(!row)fail('configuration_missing');
  if(row.namespace_verifier===null){if(integer((await first(tx,'SELECT count(*) AS n FROM generation_slice_commands')).n)!==0)fail('recovery_quarantined');if(claimFreshNamespace()!==namespace)fail('recovery_quarantined');await tx.query('UPDATE generation_slice_namespace SET namespace_verifier=$1 WHERE singleton=true',[namespace]);}
  else if(row.namespace_verifier!==namespace)fail('recovery_quarantined');
 }));
 async function founder(tx,token,actor){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail('denied');
  const id=await first(tx,'SELECT role,enabled FROM founder_identities WHERE identity_id=$1 FOR UPDATE',[actor]),session=await first(tx,'SELECT * FROM founder_sessions WHERE token_hash=$1 FOR UPDATE',[hash(token)]);
  if(!id?.enabled||id.role!=='founder'||!session||session.identity_id!==actor||session.revoked_at||now()>=new Date(session.expires_at).getTime())fail('denied');
 }
 async function authority(token,s,work){
  if(closed)fail('configuration_missing');
  return serializeQueueWork(async()=>{const a=await requireFounder(token);if(!uuid(a.identityId))fail('denied');return db.transaction(async tx=>{
   if(!await first(tx,'SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[s.household_id]))fail('denied');
   const consent=await first(tx,'SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[s.household_id]);if(!consent||consent.state!=='active'||consent.policy_version!=='TEST-v1')fail('denied');
   await founder(tx,token,a.identityId);const epoch=integer(consent.consent_epoch,1),w=await first(tx,'SELECT child_id FROM wonder_requests WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[s.household_id,s.request_id]);if(!w)fail('denied');
   const d=await project(tx,{household_id:s.household_id,request_id:s.request_id,child_id:w.child_id,consent_epoch:epoch});
   if(d.scope_version!==s.scope_version||d.state!=='accepted'||d.scope_kind==='alternative'&&d.agreement_version!==d.scope_version)fail('conflict');
   const profile=await first(tx,'SELECT current_version,consent_epoch FROM child_setup_profiles WHERE household_id=$1 AND child_id=$2 FOR UPDATE',[s.household_id,w.child_id]);if(!profile||integer(profile.consent_epoch,1)!==epoch)fail('denied');const ctx={h:s.household_id,id:a.identityId,epoch,child:w.child_id,profile_version:integer(profile.current_version,1),request:d,session_hash:hash(token)};const out=await work(tx,ctx);
   await founder(tx,token,a.identityId);const end=await first(tx,'SELECT consent_epoch,state FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[s.household_id]);if(end?.state!=='active'||integer(end.consent_epoch,1)!==epoch)fail('denied');return out;
  });});
 }
 const digest=(h,id,epoch,c)=>keyed(h,'command',{actor_id:id,consent_epoch:epoch,command:c});
 async function decoded(row){
  const f=await fact(row.sealed_fact);
  if(f.actor_kind!=='founder'||f.recorded_at!==new Date(row.recorded_at).toISOString()||f.scope!=='household'||f.household_id!==row.household_id||f.command_id!==row.command_id||f.actor_id!==row.actor_id||f.original_session_hash!==row.original_session_hash||f.consent_epoch!==integer(row.consent_epoch,1)||f.aggregate_version!==integer(row.aggregate_version,1)||f.record_id!==row.record_id||f.primary_commit_id!==row.primary_commit_id||f.namespace_verifier!==namespace||row.namespace_verifier!==namespace||f.canonical_digest!==row.canonical_digest||digest(row.household_id,f.actor_id,f.consent_epoch,f.command)!==row.canonical_digest||f.effect.job_id!==row.job_id||f.effect.version!==f.aggregate_version)fail('recovery_quarantined');return f;
 }
 async function journalCheck(tx,h){
  const rows=(await tx.query('SELECT c.*,a.command_id AS ack,a.record_id AS ack_record,a.primary_commit_id AS ack_commit FROM generation_slice_commands c LEFT JOIN generation_slice_acknowledgements a USING(household_id,command_id) WHERE c.household_id=$1 ORDER BY c.recorded_at,c.command_id LIMIT 1001',[h])).rows;if(rows.length>1000)fail('recovery_quarantined');
  const independent=await records(h),seen=new Set();
  for(const r of independent){const row=rows.find(x=>x.command_id===r.command_id);if(!row||!same(row.sealed_fact,r))fail('recovery_quarantined');await decoded(row);seen.add(r.command_id);}
  for(const row of rows){await decoded(row);if(row.ack&&(!seen.has(row.command_id)||row.ack_record!==row.record_id||row.ack_commit!==row.primary_commit_id))fail('recovery_quarantined');}
  return rows;
 }
 async function job(tx,s,id){const j=await first(tx,'SELECT * FROM generation_slice_jobs WHERE household_id=$1 AND job_id=$2 FOR UPDATE',[s.household_id,id]);if(!j||j.request_id!==s.request_id||integer(j.request_scope_version,1)!==s.scope_version)fail('denied');const p=await first(tx,'SELECT current_version,consent_epoch FROM child_setup_profiles WHERE household_id=$1 AND child_id=$2',[s.household_id,j.child_id]);if(!p||integer(p.current_version,1)!==integer(j.profile_version,1)||integer(p.consent_epoch,1)!==integer(j.consent_epoch,1))fail('conflict');return j;}
 async function currentJob(tx,s,head,a){if(!head)return null;const j=await first(tx,'SELECT * FROM generation_slice_jobs WHERE household_id=$1 AND job_id=$2',[a.h,head.job_id]);if(!j||j.request_id!==s.request_id)fail('recovery_quarantined');if(integer(j.request_scope_version,1)!==s.scope_version||integer(j.profile_version,1)!==a.profile_version||integer(j.consent_epoch,1)!==a.epoch)return null;return job(tx,s,j.job_id);}
 async function revision(tx,h,id){
  const r=await first(tx,'SELECT r.*,c.sealed_fact,c.original_session_hash,c.aggregate_version,c.actor_id,c.consent_epoch,c.record_id,c.primary_commit_id,c.canonical_digest,c.namespace_verifier,c.recorded_at FROM generation_slice_revisions r JOIN generation_slice_commands c USING(household_id,command_id) WHERE r.household_id=$1 AND r.revision_id=$2',[h,id]);if(!r)fail('recovery_quarantined');const f=await decoded(r),v=f.effect.revision;if(!v||v.revision_id!==id||keyed(h,'output',v.adventure)!==r.output_digest||v.output_digest!==r.output_digest)fail('recovery_quarantined');return copy(v);
 }
 async function store(tx,a,c,j,effect,result){
  const record_id=randomUUID(),primary_commit_id=randomUUID(),recorded_at=iso(),canonical_digest=digest(a.h,a.id,a.epoch,c),f={format:'queue-committed-fact-v1',scope:'household',household_id:a.h,command_id:c.command_id,record_id,primary_commit_id,actor_id:a.id,actor_kind:'founder',original_session_hash:a.session_hash,consent_epoch:a.epoch,recorded_at,aggregate_version:integer(j.version,1),canonical_digest,namespace_verifier:namespace,command:c,result:{...result,primary_commit_id},effect:{...effect,job_id:j.job_id,version:integer(j.version,1)}};
  const sealed=await seal(f);await tx.query('INSERT INTO generation_slice_commands(household_id,command_id,job_id,actor_id,consent_epoch,original_session_hash,aggregate_version,recorded_at,record_id,primary_commit_id,canonical_digest,namespace_verifier,sealed_fact) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[a.h,c.command_id,j.job_id,a.id,a.epoch,a.session_hash,j.version,recorded_at,record_id,primary_commit_id,canonical_digest,namespace,JSON.stringify(sealed)]);
  if(effect.revision){const r=effect.revision;await tx.query('INSERT INTO generation_slice_revisions VALUES($1,$2,$3,$4,$5,$6,$7)',[a.h,r.revision_id,j.job_id,c.command_id,r.parent_revision_id,r.output_digest,recorded_at]);}
  return first(tx,'SELECT * FROM generation_slice_commands WHERE household_id=$1 AND command_id=$2',[a.h,c.command_id]);
 }
 async function finish(token,s,row){
  let f;await authority(token,s,async(tx,a)=>{if(row.actor_id!==a.id||integer(row.consent_epoch,1)!==a.epoch)fail('denied');await job(tx,s,row.job_id);await journalCheck(tx,a.h);f=await decoded(row);});
  try{await append(row.sealed_fact);}catch{return authority(token,s,async(tx)=>{await job(tx,s,row.job_id);return {status:'retryable_unacknowledged',command_id:row.command_id,job_id:row.job_id,mock_only:true};});}
  return authority(token,s,async(tx,a)=>{
   const independent=await records(a.h);if(!independent.some(r=>same(r,row.sealed_fact)))fail('recovery_quarantined');const current=await first(tx,'SELECT * FROM generation_slice_commands WHERE household_id=$1 AND command_id=$2',[a.h,row.command_id]);if(!current||!same(current.sealed_fact,row.sealed_fact))fail('recovery_quarantined');
   await tx.query('INSERT INTO generation_slice_acknowledgements VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[a.h,row.command_id,row.record_id,row.primary_commit_id,iso()]);return {...copy(f.result),status:'acknowledged',mock_only:true};
  });
 }
 const mutationResult=j=>({status:'acknowledged',command_id:null,job_id:j.job_id,version:integer(j.version,1),mock_only:true});
 function makeRevision(a,j,adventure,parent,attempt){
  const d=validateFixtureDraft(adventure),revision_id=randomUUID();d.revision_id=revision_id;const output_digest=keyed(a.h,'output',d),changes=[];
  if(parent)for(const field of ['opening','limits','help','offscreen','side_thread'])if(!same(parent.adventure[field],d[field]))changes.push({field,from_revision:parent.revision_id,to_revision:revision_id});
  return {revision_id,parent_revision_id:parent?.revision_id??null,adventure:d,output_digest,diff:changes,source_scope_version:integer(j.original_scope_version,1),request_scope_version:integer(j.request_scope_version,1),status:'draft',publish_authority:false,lineage:{profile_version:integer(j.profile_version,1),provider:'deterministic-local-mock',model:'mock-fixture-1',model_config_version:'local-mock-v1',prompt_version:'mock-prompt-1',pattern_version:'fixture-1',pattern_digest:hash(canonical({pattern_version:'fixture-1',engine_version:'fixture-engine-1',configurations:d.configurations,outcomes:d.outcomes})),pattern_digest_kind:'unreleased-fixture-rule-descriptor',asset_digest:hash(canonical(d.assets)),asset_digest_kind:'fixture-allowlist-labels-only',engine_version:'fixture-engine-1',validator_version:'mock-validator-1',input_digest:attempt?.input_digest??parent?.lineage.input_digest??null,output_digest,attempt_id:attempt?.attempt_id??parent?.lineage.attempt_id??null},validation:{structure:'passed',facts:'pending',human_review:'pending'},review_evidence:[],usage:{kind:'mock',provider_usage:null,estimated_cash:null,billed_cash:null,cash_state:'unknown'},pattern_classification:'synthetic-unsettled-fixture'};
 }
 async function mutate(token,input){
  const v=scope(input,['command']),s={household_id:v.household_id,request_id:v.request_id,scope_version:v.scope_version},c={...parseCommand(v.command),request_id:v.request_id,request_scope_version:v.scope_version};let start=null,cancel=null;
  const row=await authority(token,s,async(tx,a)=>{
   const history=await journalCheck(tx,a.h),old=history.find(x=>x.command_id===c.command_id);
   if(old){if(old.actor_id!==a.id||old.canonical_digest!==digest(a.h,a.id,a.epoch,c))fail('conflict');return old;}
   if(history.some(x=>!x.ack))fail('journal_unavailable');if(history.length>=1000)fail('configuration_missing');
   const head=await first(tx,'SELECT * FROM generation_slice_request_heads WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[a.h,s.request_id]);let j=c.job_id?await job(tx,s,c.job_id):null,parent=null;
   if(j&&(integer(j.version,1)!==c.expected_version||head?.job_id!==j.job_id||integer(j.consent_epoch,1)!==a.epoch))fail('conflict');
   if(c.action==='RequestGeneration'||c.action==='Regenerate'){
    if(c.action==='RequestGeneration'&&await currentJob(tx,s,head,a)||c.action==='Regenerate'&&!terminal(j.state))fail('conflict');if(c.action==='RequestGeneration'&&head)cancel=head.job_id;
    if(c.action==='Regenerate'){if(c.payload.revision_id!==j.current_revision_id||!j.current_revision_id&&c.payload.field!=='all')fail('conflict');if(j.current_revision_id)parent=await revision(tx,a.h,j.current_revision_id);}
    const original=prepareFixtureInput({synthetic:true,original_question:a.request.question,interpretation:a.request.interpretation??(a.request.current_question!==a.request.question?a.request.current_question:null)});
    const id=c.command_id;await tx.query('INSERT INTO generation_slice_jobs(household_id,job_id,request_id,child_id,consent_epoch,request_scope_version,original_scope_version,profile_version,actor_id,version,state,mock_case,field,parent_revision_id,current_revision_id,fence,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12,$13,NULL,0,$14)',[a.h,id,s.request_id,a.child,a.epoch,s.scope_version,a.request.source_scope_version,a.profile_version,a.id,'queued',c.payload.mock_case,c.action==='Regenerate'?c.payload.field:'all',parent?.revision_id??null,iso()]);
    await tx.query('INSERT INTO generation_slice_request_heads VALUES($1,$2,$3) ON CONFLICT(household_id,request_id) DO UPDATE SET job_id=EXCLUDED.job_id',[a.h,s.request_id,id]);j=await job(tx,s,id);
    return store(tx,a,c,j,{kind:'requested',input:original,original_question:a.request.question,current_question:a.request.current_question,interpretation:a.request.interpretation}, {...mutationResult(j),command_id:c.command_id});
   }
   if(c.action==='StartMock'){
    if(j.state!=='queued'||await first(tx,'SELECT job_id FROM generation_slice_attempts WHERE household_id=$1 AND job_id=$2',[a.h,j.job_id]))fail('conflict');
    if([...active.values()].some(v=>!v.controller.signal.aborted)||integer((await first(tx,"SELECT count(*) AS n FROM generation_slice_jobs j JOIN generation_slice_request_heads h USING(household_id,job_id) JOIN generation_slice_attempts a USING(household_id,job_id) WHERE j.state='running' AND a.lease_until>$1",[iso()])).n)>=limits.concurrency)fail('conflict');
    const input=prepareFixtureInput({synthetic:true,original_question:a.request.question,interpretation:a.request.interpretation??(a.request.current_question!==a.request.question?a.request.current_question:null)});
    const attempt_id=c.command_id,completion_id=randomUUID(),fence=integer(j.fence)+1;
    await tx.query('INSERT INTO generation_slice_attempts VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.h,j.job_id,attempt_id,completion_id,fence,new Date(now()+limits.lease_ms).toISOString(),iso(),'authorized']);
    await tx.query("UPDATE generation_slice_jobs SET state='running',version=version+1,fence=$3 WHERE household_id=$1 AND job_id=$2",[a.h,j.job_id,fence]);j=await job(tx,s,j.job_id);start={s,job_id:j.job_id,attempt_id,completion_id,fence,input,input_digest:keyed(a.h,'input',input),mock_case:j.mock_case};
    return store(tx,a,c,j,{kind:'dispatch_authorized',attempt:{job_id:start.job_id,attempt_id:start.attempt_id,completion_id:start.completion_id,fence:start.fence,input:start.input,input_digest:start.input_digest,mock_case:start.mock_case}}, {...mutationResult(j),command_id:c.command_id});
   }
   if(c.action==='EditRevision'){
    if(j.state!=='draft_ready'||j.current_revision_id!==c.payload.revision_id)fail('conflict');if(integer((await first(tx,'SELECT count(*) AS n FROM generation_slice_revisions WHERE household_id=$1 AND job_id=$2',[a.h,j.job_id])).n)>=63)fail('configuration_missing');parent=await revision(tx,a.h,j.current_revision_id);const d=copy(parent.adventure);d[c.payload.field]=copy(c.payload.value);const r=makeRevision(a,j,d,parent,null);
    await tx.query('UPDATE generation_slice_jobs SET version=version+1,current_revision_id=$3 WHERE household_id=$1 AND job_id=$2',[a.h,j.job_id,r.revision_id]);j=await job(tx,s,j.job_id);return store(tx,a,c,j,{kind:'edited',revision:r},{...mutationResult(j),command_id:c.command_id});
   }
   if(c.action==='CancelJob'){
    if(j.state==='cancelled')fail('conflict');await tx.query("UPDATE generation_slice_jobs SET version=version+1,state='cancelled',fence=fence+1 WHERE household_id=$1 AND job_id=$2",[a.h,j.job_id]);await tx.query("UPDATE generation_slice_attempts SET state='cancelled' WHERE household_id=$1 AND job_id=$2",[a.h,j.job_id]);cancel=j.job_id;j=await job(tx,s,j.job_id);return store(tx,a,c,j,{kind:'cancelled',reason:c.payload.reason},{...mutationResult(j),command_id:c.command_id});
   }
   fail('validation_failed');
  });
  if(cancel)active.get(workerKey(s,cancel))?.controller.abort();const result=await finish(token,s,row);
  if(start&&result.status==='acknowledged'&&!active.has(workerKey(start.s,start.job_id)))void execute(token,start);
  return result;
 }
 async function complete(token,start,outcome,raw=null,errorClass=null){
  const {s}=start;let row;
  try{row=await authority(token,s,async(tx,a)=>{
   const history=await journalCheck(tx,a.h);if(history.some(x=>!x.ack))fail('journal_unavailable');const j=await job(tx,s,start.job_id),attempt=await first(tx,'SELECT * FROM generation_slice_attempts WHERE household_id=$1 AND job_id=$2 FOR UPDATE',[a.h,j.job_id]);
   if(j.state!=='running'||integer(j.fence)!==start.fence||attempt?.attempt_id!==start.attempt_id)return null;
   if(now()>=new Date(attempt.lease_until).getTime())outcome='uncertain';
   const c={command_id:attempt.completion_id,job_id:j.job_id,request_id:s.request_id,request_scope_version:s.scope_version,expected_version:integer(j.version,1),action:'MockCompletion',payload:{attempt_id:attempt.attempt_id,fence:start.fence,outcome}},effect={kind:'mock_completion',outcome,error_class:errorClass,attempt_id:attempt.attempt_id};let r=null;
   if(outcome==='draft_ready'){
    let d=validateFixtureDraft(raw),parent=j.parent_revision_id?await revision(tx,a.h,j.parent_revision_id):null;if(parent&&j.field!=='all'){const selected=copy(parent.adventure);selected[j.field]=d[j.field];d=validateFixtureDraft(selected);}r=makeRevision(a,j,d,parent,start);effect.revision=r;
   }else if(raw!==null){try{const retained=canonical(raw);if(Buffer.byteLength(retained)<=limits.max_output_bytes)effect.restricted_invalid_output=JSON.parse(retained);}catch{effect.invalid_output_retained=false;}}
   await tx.query('UPDATE generation_slice_jobs SET version=version+1,state=$3,current_revision_id=$4 WHERE household_id=$1 AND job_id=$2',[a.h,j.job_id,outcome,r?.revision_id??null]);await tx.query('UPDATE generation_slice_attempts SET state=$3 WHERE household_id=$1 AND job_id=$2',[a.h,j.job_id,outcome]);const current=await job(tx,s,j.job_id);return store(tx,a,c,current,effect,{...mutationResult(current),command_id:c.command_id});
  });return row?await finish(token,start.s,row):null;}catch{/* No private acknowledgement or late publication. Pending/lease is recovered explicitly. */return null;}
 }
 async function execute(token,start){
  const controller=new AbortController();active.set(workerKey(start.s,start.job_id),{controller});let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},limits.provider_timeout_ms);let raw=null;
  try{
   await authority(token,start.s,async(tx)=>{const j=await job(tx,start.s,start.job_id);if(j.state!=='running'||integer(j.fence)!==start.fence)fail('conflict');const rows=await journalCheck(tx,start.s.household_id);if(rows.some(r=>!r.ack))fail('journal_unavailable');});
   // Only this branded module can run. It owns no HTTP/client/key capability.
   const selected=provider.forCase(start.mock_case);if(!isSyntheticMockProvider(selected))fail('configuration_missing');raw=await selected.generate(start.input,{signal:controller.signal});validateFixtureDraft(raw);await complete(token,start,'draft_ready',raw);
  }catch(e){await complete(token,start,timedOut?'uncertain':e.code==='unsupported'?'unsupported':'failed',raw,e.code??'mock_failed');}
  finally{clearTimeout(timer);active.delete(workerKey(start.s,start.job_id));}
 }
 async function list(token,input){
  ownData(input,[]);const q=await queueRead(token,{filter:'accepted'}),out=[];
  for(const r of q.requests){const s={household_id:r.household_id,request_id:r.request_id,scope_version:r.scope_version};try{out.push(await authority(token,s,async(tx,a)=>{const head=await first(tx,'SELECT job_id FROM generation_slice_request_heads WHERE household_id=$1 AND request_id=$2',[a.h,s.request_id]);const j=await currentJob(tx,s,head,a);return {...s,job_id:j?.job_id??null,state:j?.state??'not_requested'};}));}catch(e){if(!['denied','conflict'].includes(e.code))throw e;}}
  await requireFounder(token);return {status:'generation_list',mock_only:true,requests:out};
 }
 async function read(token,input){
  const s=scope(input,['job_id']);if(!(s.job_id===null||uuid(s.job_id)))fail('validation_failed');let expired=null;
  let view=await authority(token,s,async(tx,a)=>{
   const rows=await journalCheck(tx,a.h),pending=rows.filter(r=>!r.ack&&r.actor_id===a.id).filter(r=>{const f=journal.fact(r.sealed_fact);return f.command.request_id===s.request_id&&f.command.request_scope_version===s.scope_version;}).map(r=>({command_id:r.command_id,job_id:r.job_id}));if(rows.some(r=>!r.ack))return {status:'generation_pending',mock_only:true,pending};
   const head=await first(tx,'SELECT job_id FROM generation_slice_request_heads WHERE household_id=$1 AND request_id=$2',[a.h,s.request_id]),j=s.job_id?await job(tx,s,s.job_id):await currentJob(tx,s,head,a);
   if(j?.state==='running'){const attempt=await first(tx,'SELECT * FROM generation_slice_attempts WHERE household_id=$1 AND job_id=$2',[a.h,j.job_id]);if(attempt&&now()>=new Date(attempt.lease_until).getTime())expired={s:{household_id:a.h,request_id:s.request_id,scope_version:s.scope_version},job_id:j.job_id,attempt_id:attempt.attempt_id,completion_id:attempt.completion_id,fence:integer(attempt.fence)};}
   const revisions=[];if(j){const saved=(await tx.query('SELECT revision_id FROM generation_slice_revisions WHERE household_id=$1 AND job_id=$2 ORDER BY created_at,revision_id LIMIT 64',[a.h,j.job_id])).rows;if(saved.length>63)fail('recovery_quarantined');for(const r of saved)revisions.push(await revision(tx,a.h,r.revision_id));if(j.parent_revision_id&&!revisions.some(r=>r.revision_id===j.parent_revision_id))revisions.unshift(await revision(tx,a.h,j.parent_revision_id));}
   return {status:'generation_view',mock_only:true,request:{original_question:a.request.question,current_question:a.request.current_question,interpretation:a.request.interpretation,scope_version:a.request.scope_version,receipt:a.request.receipt},job:j?{job_id:j.job_id,state:j.state,version:integer(j.version,1),fence:integer(j.fence),current_revision_id:j.current_revision_id,parent_revision_id:j.parent_revision_id,is_current:head?.job_id===j.job_id,mock_case:j.mock_case}:null,revisions,pending:[]};
  });
  if(expired){active.get(workerKey(expired.s,expired.job_id))?.controller.abort();const confirmed=await complete(token,expired,'uncertain',null,'lease_expired');if(confirmed?.status!=='acknowledged')return {status:'generation_pending',mock_only:true,pending:[]};view=await read(token,{household_id:s.household_id,request_id:s.request_id,scope_version:s.scope_version,job_id:s.job_id});}
  return view;
 }
 async function reconcile(token,input){const s=scope(input,['command_id']);if(!uuid(s.command_id))fail('validation_failed');const row=await authority(token,s,async(tx,a)=>{await journalCheck(tx,a.h);const r=await first(tx,'SELECT * FROM generation_slice_commands WHERE household_id=$1 AND command_id=$2',[a.h,s.command_id]);if(!r||r.actor_id!==a.id)fail('denied');return r;});return finish(token,s,row);}
 return Object.freeze({list,read,command:mutate,reconcile,close(){closed=true;for(const v of active.values())v.controller.abort();active.clear();}});
}
