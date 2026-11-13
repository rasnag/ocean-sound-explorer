// CODEX-04-C. Disposable local synthetic service; no generation or sending.
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {ownData,ownMethod,environmentSnapshot,canonical,privateKey,uuid} from './continuation-journal.mjs';
import {queueJournalError} from './queue-journal.mjs';
const fail=code=>{throw queueJournalError(code);};
const first=async(tx,sql,args=[])=>(await tx.query(sql,args)).rows[0];
const same=(a,b)=>canonical(a)===canonical(b);
const copy=v=>structuredClone(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
const positive=v=>Number.isSafeInteger(v)&&v>0;
const integer=(v,min=0)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<min)fail('recovery_quarantined');return n;};
const tokenOK=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v)&&Buffer.from(v,'base64url').toString('base64url')===v;
let tail=Promise.resolve();
export function serializeQueueWork(work){const p=tail.then(work);tail=p.catch(()=>{});return p;}
const bounded=rows=>{if(rows.length>1000)fail('recovery_quarantined');return rows;};
const iso=v=>new Date(v).toISOString();
const terminal=s=>['declined','cancelled'].includes(s);
const publicState={'submitted':'received','awaiting-clarification':'clarification','fit-review':'fit_review','alternative-proposed':'alternative_pending','agreed-scope':'agreed_scope',accepted:'accepted',declined:'declined',cancelled:'cancelled'};
function selection(input){const s=ownData(input,['view_context','child_id','profile_version']);if(typeof s.view_context!=='string'||!/^[0-9a-f]{64}$/.test(s.view_context)||!uuid(s.child_id)||!positive(s.profile_version))fail('validation_failed');return s;}
function text(v,max,nullable=false){if(nullable&&v===null)return;if(typeof v!=='string'||v.length>max||!v.trim())fail('validation_failed');}
function command(input,founder){
 const c=ownData(input,founder?['command_id','household_id','request_id','expected_version','consent_epoch','action','payload']:['command_id','request_id','expected_version','consent_epoch','action','payload']);
 if(!uuid(c.command_id)||!uuid(c.request_id)||founder&&!uuid(c.household_id)||!Number.isSafeInteger(c.expected_version)||c.expected_version<0||c.expected_version>=Number.MAX_SAFE_INTEGER||!positive(c.consent_epoch))fail('validation_failed');
 const shapes=founder?{RequestClarification:['message'],ProposeAlternative:['interpretation'],AcceptRequest:['scope_version','agreement_version'],DeclineRequest:['reason'],PrepareLateUpdate:['message','revised_estimate']}:{AnswerClarification:['answer'],CorrectRequest:['question','parent_context'],AgreeAlternative:['scope_version'],CancelRequest:['reason']};
 if(!Object.hasOwn(shapes,c.action))fail('validation_failed');c.payload=ownData(c.payload,shapes[c.action]);
 for(const [k,v]of Object.entries(c.payload)){
  if(k==='scope_version'){if(!positive(v))fail('validation_failed');}
  else if(k==='agreement_version'){if(!Number.isSafeInteger(v)||v<0)fail('validation_failed');}
  else if(k==='revised_estimate'){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||iso(v)!==v)fail('validation_failed');}
  else if(k==='parent_context'){if(!(v===null||typeof v==='string'&&v.length<=2000))fail('validation_failed');}
  else text(v,k==='question'?4000:2000);
 }
 return copy(c);
}

// Migration-012 production authentication prefix: issuer -> global intake ->
// household -> account/session -> consent/domain. Uses the actual issuer tables.
// Other family APIs continue to use the accepted access.withSession directly.
export async function withProductionQueueSession(db,token,clock,work){
 if(!tokenOK(token))fail('denied');const digest=hash(token);
 return db.transaction(async tx=>{
  if(!await first(tx,'SELECT singleton FROM adult_access_throttle WHERE singleton=true FOR UPDATE'))fail('denied');
  if(!await first(tx,'SELECT singleton FROM queue_intake_lock WHERE singleton=true FOR UPDATE'))fail('configuration_missing');
  const locator=await first(tx,'SELECT a.household_id,a.adult_id FROM adult_sessions s JOIN adult_accounts a ON a.adult_id=s.adult_id WHERE s.token_hash=$1',[digest]);
  if(!locator)fail('denied');
  await tx.query('SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[locator.household_id]);
  async function check(){
   const a=await first(tx,'SELECT enabled,household_id FROM adult_accounts WHERE adult_id=$1 FOR UPDATE',[locator.adult_id]);
   const s=await first(tx,'SELECT * FROM adult_sessions WHERE token_hash=$1 FOR UPDATE',[digest]),at=clock();
   if(!Number.isSafeInteger(at)||!a?.enabled||a.household_id!==locator.household_id||!s||s.adult_id!==locator.adult_id||s.revoked_at||at<Date.parse(s.issued_at)||at>=Date.parse(s.expires_at))fail('denied');
  }
  await check();const result=await work(tx,{adultId:locator.adult_id,householdId:locator.household_id});await check();return result;
 });
}
export async function readProductionIntake(tx){
 const r=await first(tx,'SELECT c.*,a.command_id AS acknowledged FROM queue_operator_commands c LEFT JOIN queue_operator_acknowledgements a USING(command_id,record_id,primary_commit_id) ORDER BY c.aggregate_version DESC LIMIT 1');
 if(!r)return {paused:false,pending:false};
 return {paused:r.paused,pending:!r.acknowledged};
}

export async function createSyntheticRequestQueue(input){
 const o=ownData(input,['env','db','auth','access','capture','kernel','journal','keys','clock','policyVersion']);environmentSnapshot(o.env);
 const {db,clock,journal}=o;if(o.policyVersion!=='TEST-v1'||typeof clock!=='function')fail('validation_failed');
 ownData(o.keys,['keyForHousehold','keyForOperator']);
 const householdKey=ownMethod(o.keys,'keyForHousehold'),operatorKey=ownMethod(o.keys,'keyForOperator'),withSession=ownMethod(o.access,'withSession'),requireFounder=ownMethod(o.auth,'requireFounder'),question=ownMethod(o.capture,'question'),apply=ownMethod(o.kernel,'apply');
 const seal=ownMethod(journal,'seal'),fact=ownMethod(journal,'fact'),records=ownMethod(journal,'records'),append=ownMethod(journal,'append');
 const namespace=journal.namespace_verifier;if(typeof namespace!=='string'||!/^[0-9a-f]{64}$/.test(namespace))fail('validation_failed');
 const now=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<0||n>253402300799999)fail('validation_failed');return n;};now();
 const {PGlite}=await import('@electric-sql/pglite');if(!(db instanceof PGlite)||!await first(db,'SELECT version FROM schema_migrations WHERE version=12'))fail('configuration_missing');
 await serializeQueueWork(()=>db.transaction(async tx=>{
  const r=await first(tx,'SELECT * FROM queue_journal_namespace WHERE singleton=true FOR UPDATE');if(!r)fail('configuration_missing');
  if(r.namespace_verifier===null){
   const n=await first(tx,'SELECT (SELECT count(*) FROM queue_commands)+(SELECT count(*) FROM queue_operator_commands) n');if(Number(n.n)!==0)fail('recovery_quarantined');
   await tx.query('UPDATE queue_journal_namespace SET namespace_verifier=$1 WHERE singleton=true',[namespace]);
  }else if(r.namespace_verifier!==namespace)fail('recovery_quarantined');
 }));
 function digest(scope,actor,epoch,c){let key;try{key=privateKey(scope==='operator'?operatorKey():householdKey(scope));return createHmac('sha256',key).update('queue-command-v1\0').update(canonical({scope,actor_id:actor,consent_epoch:epoch,command:c})).digest('hex');}finally{key?.fill(0);}}
 async function founderCheck(tx,token,id){
  if(!tokenOK(token))fail('denied');
  const identity=await first(tx,'SELECT identity_id,role,enabled FROM founder_identities WHERE identity_id=$1 FOR UPDATE',[id]);
  const session=await first(tx,'SELECT * FROM founder_sessions WHERE token_hash=$1 FOR UPDATE',[hash(token)]);
  if(!identity?.enabled||identity.role!=='founder'||!session||session.identity_id!==id||session.revoked_at||Date.parse(session.expires_at)<=now())fail('denied');
 }
 async function consent(tx,h){
  if(!await first(tx,'SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[h]))fail('denied');
  const c=await first(tx,'SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[h]);
  if(!c||c.state!=='active'||c.policy_version!=='TEST-v1')fail('denied');return integer(c.consent_epoch,1);
 }
 async function familyCheck(tx,actor,s,token){
  const epoch=await consent(tx,actor.householdId),profiles=bounded((await tx.query('SELECT * FROM child_setup_profiles WHERE household_id=$1 ORDER BY child_id FOR UPDATE',[actor.householdId])).rows);
  const child=profiles.find(p=>p.child_id===s.child_id),context=hash(JSON.stringify(['synthetic-family-space-v1',actor.adultId,actor.householdId,epoch,'TEST-v1']));
  if(!profiles.some(p=>p.is_initial)||profiles.some(p=>integer(p.consent_epoch,1)!==epoch)||!child||integer(child.current_version,1)!==s.profile_version||s.view_context!==context)fail('denied');
  const session=await first(tx,'SELECT * FROM adult_sessions WHERE token_hash=$1',[hash(token)]),a=await first(tx,'SELECT enabled,household_id FROM adult_accounts WHERE adult_id=$1',[actor.adultId]);
  if(!a?.enabled||a.household_id!==actor.householdId||!session||session.adult_id!==actor.adultId||session.revoked_at||now()<Date.parse(session.issued_at)||now()>=Date.parse(session.expires_at))fail('denied');
  return {h:actor.householdId,id:actor.adultId,kind:'parent',epoch,child:s.child_id,profile:s.profile_version};
 }
 async function authorized(token,kind,h,s,work){
  if(kind==='parent')return withSession(token,async(tx,actor)=>{const a=await familyCheck(tx,actor,s,token);const out=await work(tx,a);const end=await familyCheck(tx,actor,s,token);if(!same(a,end))fail('denied');return out;});
  const locator=await requireFounder(token);if(!uuid(locator?.identityId))fail('denied');
  return db.transaction(async tx=>{
   await founderCheck(tx,token,locator.identityId);
   const epoch=h?await consent(tx,h):0;
   const a={h:h??null,id:locator.identityId,kind:'founder',epoch};
   const out=await work(tx,a);
   await founderCheck(tx,token,locator.identityId);if(h&&await consent(tx,h)!==epoch)fail('denied');return out;
  });
 }
 async function commandRows(tx,h){return bounded((await tx.query(h==='operator'?'SELECT * FROM queue_operator_commands ORDER BY aggregate_version LIMIT 1001':'SELECT * FROM queue_commands WHERE household_id=$1 ORDER BY request_id,aggregate_version LIMIT 1001',h==='operator'?[]:[h])).rows);}
 async function checked(tx,row,operator=false){
  const f=await fact(row.sealed_record),scope=operator?'operator':row.household_id;
  if(f.scope!==(operator?'operator':'household')||f.household_id!==(operator?null:row.household_id)||f.command_id!==row.command_id||f.record_id!==row.record_id||f.primary_commit_id!==row.primary_commit_id||f.actor_id!==row.actor_id||f.actor_kind!==(operator?'founder':row.actor_kind)||f.original_session_hash!==row.original_session_hash||f.consent_epoch!==(operator?0:integer(row.consent_epoch,1))||f.aggregate_version!==integer(row.aggregate_version,1)||f.recorded_at!==iso(row.recorded_at)||f.canonical_digest!==row.canonical_digest||f.namespace_verifier!==namespace||row.namespace_verifier!==namespace||digest(scope,f.actor_id,f.consent_epoch,f.command)!==f.canonical_digest)fail('recovery_quarantined');
  if(operator){if(f.effect.intake?.version!==f.aggregate_version||f.effect.intake.paused!==row.paused||f.command.command_id!==row.command_id)fail('recovery_quarantined');}
  else{
   if(f.command.request_id!==row.request_id||f.command.command_id!==row.command_id)fail('recovery_quarantined');
   const history=await first(tx,'SELECT * FROM queue_history WHERE household_id=$1 AND command_id=$2',[row.household_id,row.command_id]),snap=f.effect.snapshot;
   if(!history||history.record_id!==row.record_id||integer(history.aggregate_version,1)!==f.aggregate_version||!snap||snap.aggregate_version!==f.aggregate_version||snap.scope_version!==integer(history.scope_version,1)||snap.agreement_version!==integer(history.agreement_version)||snap.storage_state!==history.state||snap.breach_observed!==history.breach_observed)fail('recovery_quarantined');
  }
  const ack=await first(tx,operator?'SELECT * FROM queue_operator_acknowledgements WHERE command_id=$1':'SELECT * FROM queue_acknowledgements WHERE household_id=$1 AND command_id=$2',operator?[row.command_id]:[row.household_id,row.command_id]);
  if(ack&&(ack.record_id!==row.record_id||ack.primary_commit_id!==row.primary_commit_id||ack.durability_ref!=='queue-fsync:'+row.record_id))fail('recovery_quarantined');
  return {f,ack:!!ack};
 }
 async function inspect(txRows,scope){
  const persisted=await records(scope),seen=new Set();
  for(const r of persisted){const p=txRows.find(v=>v.row.command_id===r.command_id);if(!p||!same(r,p.row.sealed_record)||!same(await fact(r),p.f))fail('recovery_quarantined');seen.add(r.command_id);}
  for(const r of txRows)if(r.ack&&!seen.has(r.row.command_id))fail('recovery_quarantined');
 }
 async function snapshot(token,kind,h,s){return authorized(token,kind,h,s,async(tx,a)=>{const scope=h??a.h??'operator',rows=await commandRows(tx,scope),out=[];for(const row of rows)out.push({row,...await checked(tx,row,scope==='operator')});return {a,scope,rows:out};});}
 function own(row,a,requestId){if(!row||row.actor_id!==a.id||row.actor_kind!==undefined&&row.actor_kind!==a.kind||a.h&&integer(row.consent_epoch,1)!==a.epoch||requestId&&row.request_id!==requestId)fail('denied');}
 async function original(tx,h,id,child){
  const w=await first(tx,'SELECT * FROM wonder_requests WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[h,id]);if(!w||child&&w.child_id!==child)fail('denied');
  const p=await first(tx,`SELECT c.*,a.durability_ref FROM production_commands c JOIN production_acknowledgements a USING(household_id,command_id,record_id,primary_commit_id) WHERE c.household_id=$1 AND c.request_id=$2`,[h,id]);
  if(!p||p.durability_ref!=='production-fsync:'+p.record_id)fail('journal_unavailable');
  const r=await first(tx,'SELECT * FROM production_receipts WHERE household_id=$1 AND receipt_id=$2 AND request_id=$3',[h,p.receipt_id,id]);
  const source=await first(tx,'SELECT * FROM wonder_source_payloads WHERE household_id=$1 AND request_id=$2 AND source_scope_version=$3',[h,id,p.wonder_version]);
  if(!r||!source||Date.parse(w.original_received_at)!==Date.parse(r.original_received_at)||Date.parse(r.original_due_at)-Date.parse(r.original_received_at)!==86400000)fail('recovery_quarantined');
  const words=await question(tx,{household_id:h,request_id:id,source_scope_version:integer(p.wonder_version,1),payload_ref:source.payload_ref});
  const receipt={receipt_id:r.receipt_id,request_id:id,booking_id:r.booking_id,claim_id:r.claim_id,period_id:r.period_id,original_received_at:iso(r.original_received_at).replace('.000Z','Z'),original_due_at:iso(r.original_due_at).replace('.000Z','Z'),deadline_interval_seconds:86400};
  return {w,p,source,receipt,question:words.question};
 }
 async function state(tx,h,id,child,allowPending=false){
  const base=await original(tx,h,id,child),rows=bounded((await tx.query('SELECT * FROM queue_commands WHERE household_id=$1 AND request_id=$2 ORDER BY aggregate_version LIMIT 1001',[h,id])).rows),history=[];
  let current={request_id:id,question:base.question,current_question:base.question,parent_context:null,parent_context_ref:base.source.payload_ref,interpretation:null,scope_version:1,aggregate_version:0,storage_state:'submitted',scope_kind:'original',agreement_version:0,agreement:null,clarification:null,alternative:null,revised_estimate:null,late_update:null,fit:null,breach_observed:false,source_scope_version:integer(base.p.wonder_version,1)};
  for(const row of rows){const c=await checked(tx,row);if(!c.ack&&!allowPending)fail('journal_unavailable');current=copy(c.f.effect.snapshot);history.push(copy(c.f.effect.history));}
  if(current.question!==base.question||!same(current.receipt??base.receipt,base.receipt))fail('recovery_quarantined');
  const late=current.breach_observed||!terminal(current.storage_state)&&now()>Date.parse(base.receipt.original_due_at);
  return {base,rows,current,detail:{...copy(current),receipt:base.receipt,state:publicState[current.storage_state],history,late,can_cancel:!terminal(current.storage_state),delivered:false}};
 }
 async function project(tx,input){
  const v=ownData(input,['household_id','request_id','child_id','consent_epoch']);if(!uuid(v.household_id)||!uuid(v.request_id)||!uuid(v.child_id)||!positive(v.consent_epoch))fail('validation_failed');
  if(await consent(tx,v.household_id)!==v.consent_epoch)fail('denied');
  const st=await state(tx,v.household_id,v.request_id,v.child_id);if(integer(st.base.p.consent_epoch,1)!==v.consent_epoch)fail('denied');return st.detail;
 }
 async function currentScope(tx,input){
  const v=ownData(input,['household_id','request_id','child_id','consent_epoch','scope_version']);if(!positive(v.scope_version))fail('validation_failed');
  const d=await project(tx,{household_id:v.household_id,request_id:v.request_id,child_id:v.child_id,consent_epoch:v.consent_epoch});
  if(d.scope_version!==v.scope_version||terminal(d.storage_state)||d.clarification&&!d.clarification.answer||d.scope_kind==='alternative'&&d.agreement_version!==d.scope_version)fail('conflict');
  return {request_id:d.request_id,original_question:d.question,question:d.current_question,parent_context:d.parent_context,parent_context_ref:d.parent_context_ref,interpretation:d.interpretation,scope_version:d.scope_version,source_scope_version:d.source_scope_version,agreement_version:d.agreement_version,fit:copy(d.fit),generation_implemented:false};
 }
 async function finish(token,kind,h,s,row){
  const before=await snapshot(token,kind,h,s);own(row,before.a);const actual=before.rows.find(p=>p.row.command_id===row.command_id);if(!actual||!same(actual.row,row))fail('recovery_quarantined');await inspect(before.rows,before.scope);
  let ref;try{ref=await append(row.sealed_record);}catch(e){if(e?.code==='recovery_quarantined')throw e;return authorized(token,kind,h,s,async(tx,a)=>{const r=await first(tx,h?'SELECT * FROM queue_commands WHERE household_id=$1 AND command_id=$2':'SELECT * FROM queue_operator_commands WHERE command_id=$1',h?[h,row.command_id]:[row.command_id]);own(r,a);if(!same(r,row))fail('recovery_quarantined');const checkedFact=await checked(tx,r,!h);return pendingResult(checkedFact.f);});}
  if(ref!=='queue-fsync:'+row.record_id||!(await records(before.scope)).some(r=>same(r,row.sealed_record)))fail('recovery_quarantined');
  return authorized(token,kind,h,s,async(tx,a)=>{
   const r=await first(tx,h?'SELECT * FROM queue_commands WHERE household_id=$1 AND command_id=$2':'SELECT * FROM queue_operator_commands WHERE command_id=$1',h?[h,row.command_id]:[row.command_id]);own(r,a);if(!same(r,row))fail('recovery_quarantined');const c=await checked(tx,r,!h);
   if(!c.ack)await tx.query(h?'INSERT INTO queue_acknowledgements(household_id,command_id,record_id,primary_commit_id,durability_ref,acknowledged_at) VALUES($1,$2,$3,$4,$5,$6)':'INSERT INTO queue_operator_acknowledgements(command_id,record_id,primary_commit_id,durability_ref,acknowledged_at) VALUES($1,$2,$3,$4,$5)',h?[h,r.command_id,r.record_id,r.primary_commit_id,ref,iso(now())]:[r.command_id,r.record_id,r.primary_commit_id,ref,iso(now())]);
   return {...copy(c.f.result),status:'acknowledged',primary_commit_id:r.primary_commit_id,durability_ref:ref};
  });
 }
 function pendingResult(f){const r=copy(f.result);delete r.receipt;delete r.primary_commit_id;delete r.durability_ref;r.status='retryable_unacknowledged';return r;}
 async function mutate(token,kind,h,s,c){return serializeQueueWork(async()=>{
  const before=await snapshot(token,kind,h,s);await inspect(before.rows,before.scope);
  const row=await authorized(token,kind,h,s,async(tx,a)=>{
   if(c.consent_epoch!==a.epoch)fail('denied');const all=await commandRows(tx,a.h),prior=all.find(r=>r.command_id===c.command_id),d=digest(a.h,a.id,a.epoch,c);
   if(prior){own(prior,a,c.request_id);if(prior.canonical_digest!==d)fail('conflict');return prior;}
   if(all.length>=1000)fail('configuration_missing');
   for(const r of all)if(!(await checked(tx,r)).ack)fail('journal_unavailable');
   const st=await state(tx,a.h,c.request_id,a.child);if(integer(st.base.p.consent_epoch,1)!==a.epoch)fail('denied');
   if(st.current.aggregate_version!==c.expected_version||terminal(st.current.storage_state))fail('conflict');
   const n=copy(st.current),scopes={},at=iso(now()),recordId=randomUUID(),commitId=randomUUID();
   if(!st.rows.length){scopes['1']={kind:'original',previous_scope_version:null,question:st.base.question,parent_context_ref:st.base.source.payload_ref};}
   const from=n.storage_state;
   const unresolved=n.clarification&&!n.clarification.answer;
   switch(c.action){
    case 'RequestClarification':
     if(n.clarification||n.storage_state==='accepted')fail('conflict');n.clarification={message:c.payload.message,answer:null,requested_at:at,requested_by:a.id};n.storage_state='awaiting-clarification';break;
    case 'AnswerClarification':
     if(!unresolved)fail('conflict');n.clarification={...n.clarification,answer:c.payload.answer,answered_at:at,answered_by:a.id};n.storage_state=n.scope_kind==='alternative'?'alternative-proposed':'fit-review';break;
    case 'CorrectRequest':
    case 'ProposeAlternative':{
     if(c.action==='ProposeAlternative'&&unresolved)fail('conflict');
     const previous=n.scope_version;if(previous>=Number.MAX_SAFE_INTEGER)fail('configuration_missing');n.scope_version++;
     n.scope_kind=c.action==='CorrectRequest'?'correction':'alternative';n.agreement_version=0;n.agreement=null;n.fit=null;
     if(c.action==='CorrectRequest'){n.current_question=c.payload.question;n.parent_context=c.payload.parent_context;n.parent_context_ref=null;n.interpretation=null;n.alternative=null;n.storage_state='fit-review';}
     else{n.interpretation=c.payload.interpretation;n.alternative={interpretation:c.payload.interpretation,scope_version:n.scope_version,proposed_at:at,proposed_by:a.id};n.storage_state='alternative-proposed';}
     scopes[String(n.scope_version)]={kind:n.scope_kind,previous_scope_version:previous,question:n.current_question,parent_context:n.parent_context,parent_context_ref:n.parent_context_ref,interpretation:n.interpretation};break;
    }
    case 'AgreeAlternative':
     if(unresolved||n.scope_kind!=='alternative'||c.payload.scope_version!==n.scope_version)fail('conflict');n.agreement_version=n.scope_version;n.agreement={scope_version:n.scope_version,actor_id:a.id,recorded_at:at};n.storage_state='agreed-scope';break;
    case 'AcceptRequest':
     if(unresolved||n.storage_state==='accepted'||c.payload.scope_version!==n.scope_version||c.payload.agreement_version!==n.agreement_version||n.scope_kind==='alternative'&&n.agreement_version!==n.scope_version)fail('conflict');
     n.fit={decision:'supported_current_scope',scope_version:n.scope_version,agreement_version:n.agreement_version,interpretation:n.interpretation??n.current_question,actor_id:a.id,recorded_at:at};n.storage_state='accepted';break;
    case 'DeclineRequest':n.storage_state='declined';break;
    case 'CancelRequest':n.storage_state='cancelled';break;
    case 'PrepareLateUpdate':
     if(Date.parse(c.payload.revised_estimate)<=now())fail('validation_failed');n.revised_estimate=c.payload.revised_estimate;n.late_update={status:'DRAFT',message:c.payload.message,revised_estimate:c.payload.revised_estimate,prepared_at:at,prepared_by:a.id,sent:false};break;
    default:fail('validation_failed');
   }
   n.aggregate_version++;n.receipt=copy(st.base.receipt);n.breach_observed=!!st.detail.late;
   // Always lock household/request before entering the accepted kernel. The
   // kernel re-locks those already-held rows; it cannot acquire them late.
   if(['AcceptRequest','DeclineRequest','CancelRequest'].includes(c.action)){
    const r=st.base.receipt,claim=await first(tx,'SELECT * FROM entitlement_claims WHERE household_id=$1 AND request_id=$2',[a.h,c.request_id]);
    if(!claim||claim.period_id!==r.period_id||!['pending','reserved'].includes(claim.state))fail('conflict');
    const p=await first(tx,'SELECT * FROM entitlement_periods WHERE household_id=$1 AND period_id=$2',[a.h,r.period_id]);
    if(!p||Date.parse(r.original_received_at)<Date.parse(p.trial_start)||Date.parse(r.original_received_at)>=Date.parse(p.trial_end))fail('recovery_quarantined');
    if(c.action!=='AcceptRequest'||claim.state==='pending')await apply(tx,{household_id:a.h,consent_epoch:a.epoch},{contract_version:'1.1.0',transition_id:c.command_id,request_id:c.request_id,period_id:r.period_id,policy_version:p.policy_version,expected_version:integer(claim.version,1),consent_epoch:a.epoch,quantity:1,kind:c.action==='AcceptRequest'?'reserve':'release',from:claim.state,to:c.action==='AcceptRequest'?'reserved':'released',cause:c.action,cause_id:c.command_id},{});
    const mapping=await first(tx,'SELECT * FROM production_capacity_bookings WHERE household_id=$1 AND request_id=$2 AND booking_id=$3',[a.h,c.request_id,r.booking_id]);if(!mapping)fail('recovery_quarantined');
    await tx.query('SELECT bucket_id FROM production_capacity_buckets WHERE bucket_id=$1 FOR UPDATE',[mapping.bucket_id]);
    const cap=await first(tx,'SELECT * FROM capacity_reservations WHERE household_id=$1 AND request_id=$2 AND reservation_id=$3 FOR UPDATE',[a.h,c.request_id,r.booking_id]);
    if(!cap||cap.state!=='booked'||integer(cap.source_scope_version,1)!==integer(st.base.p.scope_version,1)||await first(tx,'SELECT assignment_id FROM assignments WHERE household_id=$1 AND request_id=$2',[a.h,c.request_id]))fail('conflict');
    if(c.action!=='AcceptRequest')await tx.query("UPDATE capacity_reservations SET state='released' WHERE household_id=$1 AND reservation_id=$2 AND state='booked'",[a.h,r.booking_id]);
   }
   if(!st.rows.length)await tx.query('INSERT INTO queue_requests(household_id,request_id,child_id,receipt_id,original_source_scope_version) VALUES($1,$2,$3,$4,$5)',[a.h,c.request_id,st.base.w.child_id,st.base.receipt.receipt_id,st.base.p.wonder_version]);
   const history={command_id:c.command_id,recorded_at:at,actor_id:a.id,actor_kind:a.kind,action:c.action,from:publicState[from],to:publicState[n.storage_state],scope_version:n.scope_version,aggregate_version:n.aggregate_version,payload:copy(c.payload)};
   const result=c.action==='AcceptRequest'?{contract_version:'1.1.0',record_type:'result',command:'AcceptRequest',command_id:c.command_id,idempotency_key:c.command_id,status:'acknowledged',aggregate_version:n.aggregate_version,receipt:copy(st.base.receipt)}:{status:'acknowledged',command_id:c.command_id,action:c.action,request_id:c.request_id,aggregate_version:n.aggregate_version};
   const f={format:'queue-committed-fact-v1',scope:'household',household_id:a.h,consent_epoch:a.epoch,record_id:recordId,command_id:c.command_id,primary_commit_id:commitId,actor_id:a.id,actor_kind:a.kind,original_session_hash:hash(token),recorded_at:at,aggregate_version:n.aggregate_version,canonical_digest:d,namespace_verifier:namespace,command:c,result,effect:{snapshot:n,history,scopes}};
   const sealed=await seal(f);
   await tx.query('INSERT INTO queue_commands(household_id,command_id,request_id,actor_id,actor_kind,original_session_hash,consent_epoch,aggregate_version,recorded_at,canonical_digest,namespace_verifier,record_id,primary_commit_id,sealed_record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)',[a.h,c.command_id,c.request_id,a.id,a.kind,f.original_session_hash,a.epoch,n.aggregate_version,at,d,namespace,recordId,commitId,JSON.stringify(sealed)]);
   for(const [v,p]of Object.entries(scopes))await tx.query('INSERT INTO queue_scopes(household_id,request_id,scope_version,previous_scope_version,kind,command_id,record_id,payload_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.h,c.request_id,Number(v),p.previous_scope_version,p.kind,c.command_id,recordId,'queue-fact:'+recordId]);
   await tx.query('INSERT INTO queue_history(household_id,request_id,aggregate_version,command_id,record_id,scope_version,agreement_version,state,breach_observed,payload_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[a.h,c.request_id,n.aggregate_version,c.command_id,recordId,n.scope_version,n.agreement_version,n.storage_state,n.breach_observed,'queue-fact:'+recordId]);
   return first(tx,'SELECT * FROM queue_commands WHERE household_id=$1 AND command_id=$2',[a.h,c.command_id]);
  });
  return finish(token,kind,h??before.a.h,s,row);
 });}
 async function familyRead(token,input){const v=ownData(input,['selection','request_id']),s=selection(v.selection);if(!uuid(v.request_id))fail('validation_failed');return serializeQueueWork(async()=>{
  const before=await snapshot(token,'parent',null,s);await inspect(before.rows,before.scope);
  return authorized(token,'parent',null,s,async(tx,a)=>({status:'request_status',request:await project(tx,{household_id:a.h,request_id:v.request_id,child_id:a.child,consent_epoch:a.epoch})}));
 });}
 async function founderRead(token,input){const v=ownData(input,['filter']);if(!['all','received','clarification','alternative_pending','accepted','overdue','terminal'].includes(v.filter))fail('validation_failed');
  return serializeQueueWork(async()=>{
   const intake=await readIntakeInternal(token),ids=await authorized(token,'founder',null,null,async tx=>bounded((await tx.query('SELECT DISTINCT household_id FROM production_commands ORDER BY household_id LIMIT 1001')).rows));const requests=[];
   for(const {household_id:h}of ids){let before;try{before=await snapshot(token,'founder',h,null);}catch(e){if(e.code==='denied')continue;throw e;}await inspect(before.rows,h);
    const list=await authorized(token,'founder',h,null,async(tx,a)=>{
     const rows=bounded((await tx.query('SELECT request_id,child_id,consent_epoch FROM production_commands WHERE household_id=$1 ORDER BY request_id LIMIT 1001',[h])).rows),out=[];
     for(const r of rows){if(integer(r.consent_epoch,1)!==a.epoch)continue;const st=await state(tx,h,r.request_id,r.child_id);out.push({household_id:h,child_id:r.child_id,consent_epoch:a.epoch,...st.detail});}return out;
    });requests.push(...list);
   }
   // Fresh exact-session authorization after the last independently read scope.
   return authorized(token,'founder',null,null,async()=>({status:'queue',requests:requests.filter(r=>v.filter==='all'||v.filter==='overdue'&&r.late||v.filter==='terminal'&&terminal(r.storage_state)||r.state===v.filter),intake}));
  });
 }
 async function readIntakeInternal(token){const before=await snapshot(token,'founder',null,null);await inspect(before.rows,'operator');return authorized(token,'founder',null,null,async tx=>{
  await tx.query('SELECT singleton FROM queue_intake_lock WHERE singleton=true FOR UPDATE');const rows=await commandRows(tx,'operator'),r=rows.at(-1);if(!r)return {version:0,paused:false,reason:''};const c=await checked(tx,r,true);if(!c.ack)fail('journal_unavailable');return copy(c.f.effect.intake);
 });}
 async function setIntake(token,input){const c=ownData(input,['command_id','expected_version','paused','reason']);if(!uuid(c.command_id)||!Number.isSafeInteger(c.expected_version)||c.expected_version<0||c.expected_version>=Number.MAX_SAFE_INTEGER||typeof c.paused!=='boolean'||typeof c.reason!=='string'||c.reason.length>2000||c.paused&&!c.reason.trim())fail('validation_failed');const command=copy(c);
  return serializeQueueWork(async()=>{
   const before=await snapshot(token,'founder',null,null);await inspect(before.rows,'operator');
   const row=await authorized(token,'founder',null,null,async(tx,a)=>{
    await tx.query('SELECT singleton FROM queue_intake_lock WHERE singleton=true FOR UPDATE');const rows=await commandRows(tx,'operator'),prior=rows.find(r=>r.command_id===command.command_id),d=digest('operator',a.id,0,command);
    if(prior){own(prior,a);if(prior.canonical_digest!==d)fail('conflict');return prior;}
    for(const r of rows)if(!(await checked(tx,r,true)).ack)fail('journal_unavailable');
    const version=rows.length?integer(rows.at(-1).aggregate_version,1):0;if(version!==command.expected_version)fail('conflict');
    const at=iso(now()),recordId=randomUUID(),commitId=randomUUID(),intake={version:version+1,paused:command.paused,reason:command.reason};
    const result={status:'acknowledged',command_id:command.command_id,action:'SetIntake',aggregate_version:version+1};
    const f={format:'queue-committed-fact-v1',scope:'operator',household_id:null,consent_epoch:0,record_id:recordId,command_id:command.command_id,primary_commit_id:commitId,actor_id:a.id,actor_kind:'founder',original_session_hash:hash(token),recorded_at:at,aggregate_version:version+1,canonical_digest:d,namespace_verifier:namespace,command,result,effect:{intake}};
    const sealed=await seal(f);await tx.query('INSERT INTO queue_operator_commands(command_id,actor_id,original_session_hash,aggregate_version,paused,recorded_at,record_id,primary_commit_id,canonical_digest,namespace_verifier,sealed_record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)',[command.command_id,a.id,f.original_session_hash,version+1,command.paused,at,recordId,commitId,d,namespace,JSON.stringify(sealed)]);return first(tx,'SELECT * FROM queue_operator_commands WHERE command_id=$1',[command.command_id]);
   });return finish(token,'founder',null,null,row);
  });
 }
 function recoveryInput(input,operatorAllowed,reconcile){
  const v=ownData(input,[],['scope','household_id',...(reconcile?['command_id']:[])]);
  if(v.scope==='operator'&&operatorAllowed)ownData(input,reconcile?['scope','command_id']:['scope']);
  else{ownData(input,reconcile?['household_id','command_id']:['household_id']);if(!uuid(v.household_id))fail('validation_failed');}
  if(reconcile&&!uuid(v.command_id))fail('validation_failed');return v;
 }
 async function founderStatus(token,input){const v=recoveryInput(input,true,false),h=v.household_id??null;return serializeQueueWork(async()=>{const b=await snapshot(token,'founder',h,null);await inspect(b.rows,b.scope);return authorized(token,'founder',h,null,async()=>({status:'queue_status',writes_closed:b.rows.some(r=>!r.ack),pending:b.rows.filter(r=>!r.ack&&r.row.actor_id===b.a.id&&(!h||r.row.actor_kind==='founder')).map(r=>({command_id:r.row.command_id,...(h?{request_id:r.row.request_id}:{scope:'operator'})}))}));});}
 async function founderReconcile(token,input){const v=recoveryInput(input,true,true),h=v.household_id??null;return serializeQueueWork(async()=>{const b=await snapshot(token,'founder',h,null);await inspect(b.rows,b.scope);const r=b.rows.find(r=>r.row.command_id===v.command_id);own(r?.row,b.a);return finish(token,'founder',h,null,r.row);});}
 async function familyStatus(token,input){const v=ownData(input,['selection']),s=selection(v.selection);return serializeQueueWork(async()=>{const b=await snapshot(token,'parent',null,s);await inspect(b.rows,b.scope);return authorized(token,'parent',null,s,async(tx,a)=>{const pending=[];for(const r of b.rows){if(r.ack||r.row.actor_kind!=='parent'||r.row.actor_id!==a.id||integer(r.row.consent_epoch,1)!==a.epoch)continue;const w=await first(tx,'SELECT child_id FROM wonder_requests WHERE household_id=$1 AND request_id=$2',[a.h,r.row.request_id]);if(w?.child_id===a.child)pending.push({command_id:r.row.command_id,request_id:r.row.request_id});}return {status:'queue_status',pending,writes_closed:b.rows.some(r=>!r.ack)};});});}
 async function familyReconcile(token,input){const v=ownData(input,['selection','command_id']),s=selection(v.selection);if(!uuid(v.command_id))fail('validation_failed');return serializeQueueWork(async()=>{const b=await snapshot(token,'parent',null,s);await inspect(b.rows,b.scope);const r=b.rows.find(r=>r.row.command_id===v.command_id);own(r?.row,b.a);await authorized(token,'parent',null,s,async(tx,a)=>{await original(tx,a.h,r.row.request_id,a.child);});return finish(token,'parent',b.a.h,s,r.row);});}
 return Object.freeze({founderRead,familyRead,founderCommand(token,input){const c=command(input,true);return mutate(token,'founder',c.household_id,null,c);},familyCommand(token,input){const v=ownData(input,['selection','command']),s=selection(v.selection),c=command(v.command,false);return mutate(token,'parent',null,s,c);},setIntake,readIntake:token=>serializeQueueWork(()=>readIntakeInternal(token)),founderStatus,founderReconcile,familyStatus,familyReconcile,project,currentScope});
}
