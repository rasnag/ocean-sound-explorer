// Proposed local synthetic 03-C. No payment, capture, production or admission authority.
import {createHash,randomUUID} from 'node:crypto';
import {ownData,ownMethod,environmentSnapshot,canonical,privateKey,uuid,keyed,namespaceVerifier,isSyntheticContinuationJournal,continuationError} from './continuation-journal.mjs';
const policy='TEST-CONTINUATION-v1',contract='test-continuation-1',provenance='invented-payment-record';
const fail=code=>{throw continuationError(code);},copy=v=>structuredClone(v),same=(a,b)=>canonical(a)===canonical(b);
const hash=v=>createHash('sha256').update(v).digest('hex');
const positive=v=>Number.isSafeInteger(v)&&v>0;
const number=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0)fail('recovery_quarantined');return n;};
const instant=v=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||!Number.isSafeInteger(Date.parse(v))||new Date(v).toISOString()!==v)fail('validation_failed');return Date.parse(v);};
const commandFields=['contract_version','command_id','household_id','consent_epoch','expected_version','policy_version','synthetic_only','receipt_reference','allocation_scope','starts_at','ends_at','allowance','provenance_kind'];
function command(input){
 const v=ownData(input,commandFields,['child_id']);
 if(v.allocation_scope==='child')ownData(input,[...commandFields,'child_id']);else if(v.allocation_scope==='household')ownData(input,commandFields);else fail('validation_failed');
 if(v.contract_version!==contract||v.policy_version!==policy||v.synthetic_only!==true||v.provenance_kind!==provenance||!uuid(v.command_id)||v.command_id[14]!=='4'||!uuid(v.household_id)||v.child_id!==undefined&&!uuid(v.child_id)||!positive(v.consent_epoch)||!Number.isSafeInteger(v.expected_version)||v.expected_version<0||!positive(v.allowance)||typeof v.receipt_reference!=='string'||!/^TEST-CONTINUATION-[0-9a-f]{32}$/.test(v.receipt_reference)||instant(v.ends_at)<=instant(v.starts_at))fail('validation_failed');
 return Object.freeze({...v});
}
function locator(input,withCommand=false){const v=ownData(input,withCommand?['household_id','command_id']:['household_id']);if(!uuid(v.household_id)||withCommand&&(!uuid(v.command_id)||v.command_id[14]!=='4'))fail('validation_failed');return {...v};}
const policyData=c=>({synthetic:true,policy_version:policy,allowance:c.allowance,allocation_scope:c.allocation_scope,starts_at:c.starts_at,ends_at:c.ends_at,provenance_kind:provenance});
const base=(status,id)=>({contract_version:contract,synthetic_only:true,status,...(id?{command_id:id}:{})});
const health=new WeakMap();
export async function createSyntheticContinuationService(input){
 const options=ownData(input,['env','db','auth','access','journal','keys'],['clock']);environmentSnapshot(options.env);
 const {db,journal}=options,clock=options.clock??Date.now;
 if(typeof clock!=='function'||!isSyntheticContinuationJournal(journal))fail('validation_failed');
 const requireFounder=ownMethod(options.auth,'requireFounder'),withSession=ownMethod(options.access,'withSession'),keyForHousehold=ownMethod(options.keys,'keyForHousehold');
 const suppliedKeys=ownData(options.keys,['keyForHousehold','receiptDedupeKey']),globalKey=privateKey(suppliedKeys.receiptDedupeKey),namespace=namespaceVerifier(globalKey);
 if(journal.namespace_verifier!==namespace){globalKey.fill(0);fail('configuration_missing');}
 const append=ownMethod(journal,'append'),records=ownMethod(journal,'records'),decode=ownMethod(journal,'fact'),seal=ownMethod(journal,'seal');
 const now=()=>{const at=clock();if(!Number.isSafeInteger(at)||at<0||at>8640000000000000)fail('configuration_missing');return at;};now();
 const {PGlite}=await import('@electric-sql/pglite');if(!(db instanceof PGlite))fail('validation_failed');
 if((await db.query('SELECT version FROM schema_migrations WHERE version=10')).rows.length!==1)fail('configuration_missing');
 if(!health.has(journal))health.set(journal,{failed:false});const journalHealth=health.get(journal);let queue=Promise.resolve();
 function serial(work){const result=queue.then(work);queue=result.catch(()=>{});return result;}
 function fingerprint(actor,c){let key;try{key=privateKey(keyForHousehold(c.household_id));return keyed(key,'continuation-command-v1',{actor_id:actor,command:c});}catch{fail('recovery_quarantined');}finally{key?.fill(0);}}
 const receipt=c=>keyed(globalKey,'continuation-receipt-v1',c.receipt_reference);
 async function namespaceCheck(tx,initialize=false){
  const row=(await tx.query('SELECT key_verifier FROM continuation_namespace WHERE singleton=true FOR UPDATE')).rows[0];if(!row)fail('configuration_missing');
  if(row.key_verifier!==null&&row.key_verifier!==namespace)fail('recovery_quarantined');
  if(initialize&&row.key_verifier===null)await tx.query('UPDATE continuation_namespace SET key_verifier=$1 WHERE singleton=true',[namespace]);
 }
 async function domain(tx,h,expectedEpoch){
  if(!(await tx.query('SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[h])).rows.length)fail('denied');
  const c=(await tx.query('SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[h])).rows[0];
  if(!c||c.state!=='active'||c.policy_version!=='TEST-v1'||expectedEpoch!==undefined&&number(c.consent_epoch)!==expectedEpoch)fail('denied');
  const profiles=(await tx.query('SELECT * FROM child_setup_profiles WHERE household_id=$1 ORDER BY child_id FOR UPDATE',[h])).rows;
  if(profiles.length>100||!profiles.some(p=>p.is_initial)||profiles.some(p=>number(p.consent_epoch)!==number(c.consent_epoch)))fail('denied');
  return {h,epoch:number(c.consent_epoch),profiles:profiles.map(p=>({child_id:p.child_id,profile_version:number(p.current_version)}))};
 }
 async function founder(token,h,epoch,work){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||Buffer.from(token,'base64url').toString('base64url')!==token)fail('denied');
  const tokenHash=hash(token);let candidate;try{candidate=await requireFounder(token);}catch{fail('denied');} // Locator only.
  if(!candidate||!uuid(candidate.identityId))fail('denied');
  for(let attempt=0;attempt<3;attempt++)try{return await db.transaction(async tx=>{
   // Authorization prefix: identity -> exact supplied session. Never founder throttle.
   const identity=(await tx.query('SELECT identity_id,role,enabled FROM founder_identities WHERE identity_id=$1 FOR UPDATE',[candidate.identityId])).rows[0];
   const session=(await tx.query('SELECT identity_id,expires_at,revoked_at FROM founder_sessions WHERE token_hash=$1 FOR UPDATE',[tokenHash])).rows[0];
   const check=()=>{if(!identity?.enabled||identity.role!=='founder'||!session||session.identity_id!==identity.identity_id||session.revoked_at||now()>=new Date(session.expires_at).getTime())fail('denied');};check();
   if(!(await tx.query('SELECT singleton FROM adult_access_throttle WHERE singleton=true FOR UPDATE')).rows.length)fail('configuration_missing');
   const s=await domain(tx,h,epoch);await namespaceCheck(tx);const result=await work(tx,{...s,actor:identity.identity_id,sessionHash:tokenHash});check();return result;
  });}catch(e){if(attempt<2&&['40001','40P01'].includes(e?.code))continue;throw e;}
 }
 async function rows(tx,h){
  const r=(await tx.query('SELECT * FROM continuation_commands WHERE household_id=$1 ORDER BY command_id FOR UPDATE',[h])).rows;if(r.length>1000)fail('recovery_quarantined');
  // Normalize the trusted driver's timestamp before strict JSON comparisons.
  return r.map(row=>({...row,recorded_at:new Date(row.recorded_at).toISOString()}));
 }
 async function accountVersion(tx,h){const r=(await tx.query('SELECT version FROM continuation_accounts WHERE household_id=$1 FOR UPDATE',[h])).rows[0];return r?number(r.version):0;}
 function allowed(s,c){if(c.household_id!==s.h||c.consent_epoch!==s.epoch||c.child_id&&!s.profiles.some(p=>p.child_id===c.child_id))fail('denied');}
 async function primary(tx,row){
  let f;try{f=decode(row.recovery_record);}catch{fail('recovery_quarantined');}
  ownData(f,['format','command','actor_id','original_session_hash','consent_epoch','entitlement_id','period_id','primary_commit_id','record_id','result_ref','aggregate_version','recorded_at','canonical_digest','receipt_hmac','namespace_verifier','profiles']);
  const c=command(f.command);
  if(f.format!=='continuation-committed-fact-v1'||c.household_id!==row.household_id||c.command_id!==row.command_id||f.actor_id!==row.actor_id||f.original_session_hash!==row.original_session_hash||f.consent_epoch!==number(row.consent_epoch)||f.consent_epoch!==c.consent_epoch||f.entitlement_id!==row.entitlement_id||f.period_id!==row.period_id||f.primary_commit_id!==row.primary_commit_id||f.record_id!==row.record_id||f.result_ref!==row.result_ref||f.aggregate_version!==number(row.aggregate_version)||f.recorded_at!==new Date(row.recorded_at).toISOString()||f.canonical_digest!==row.canonical_digest||fingerprint(f.actor_id,c)!==row.canonical_digest||f.receipt_hmac!==row.receipt_hmac||receipt(c)!==row.receipt_hmac||f.namespace_verifier!==namespace||row.namespace_verifier!==namespace||row.policy_version!==policy||row.provenance_kind!==provenance)fail('recovery_quarantined');
  const p=(await tx.query('SELECT * FROM entitlement_periods WHERE household_id=$1 AND period_id=$2',[row.household_id,row.period_id])).rows[0];
  if(!p||p.entitlement_id!==f.entitlement_id||p.policy_version!==policy||number(p.allowance)!==c.allowance||p.allocation_scope!==c.allocation_scope||p.child_id!==(c.child_id??null)||new Date(p.trial_start).toISOString()!==c.starts_at||new Date(p.trial_end).toISOString()!==c.ends_at||!same(p.policy_json,policyData(c)))fail('recovery_quarantined');
  const g=(await tx.query('SELECT * FROM continuation_grants WHERE household_id=$1 AND command_id=$2',[row.household_id,row.command_id])).rows[0];
  if(Boolean(g)!==row.acknowledged)fail('recovery_quarantined');
  if(g&&(g.period_id!==row.period_id||g.entitlement_id!==row.entitlement_id||number(g.consent_epoch)!==number(row.consent_epoch)||g.policy_version!==policy||g.actor_id!==row.actor_id||g.canonical_digest!==row.canonical_digest||g.primary_commit_id!==row.primary_commit_id||g.result_ref!==row.result_ref||g.durability_ref!=='continuation-fsync:'+row.record_id))fail('recovery_quarantined');
  return f;
 }
 async function inspect(snapshot){
  let found;try{found=await records(snapshot.s.h);}catch(e){journalHealth.failed=true;throw e;}
  const byId=new Map(found.map(r=>[r.command_id,r]));
  for(const r of found){const p=snapshot.rows.find(c=>c.command_id===r.command_id);if(!p||!same(p.recovery_record,r))fail('recovery_quarantined');}
  for(const r of snapshot.rows)if(r.acknowledged&&!byId.has(r.command_id))fail('recovery_quarantined');
  return byId;
 }
 async function snapshot(token,c){return founder(token,c.household_id,undefined,async(tx,s)=>{const list=await rows(tx,s.h);for(const r of list)await primary(tx,r);return {s,rows:list};});}
 function ownRow(snapshot,id){const r=snapshot.rows.find(r=>r.command_id===id);if(!r||r.actor_id!==snapshot.s.actor||number(r.consent_epoch)!==snapshot.s.epoch)fail('denied');return r;}
 function result(row,f,ack){
  if(!ack)return {...base('retryable_unacknowledged',row.command_id),retry_reference:row.result_ref,state:'confirmation_pending'};
  const c=f.command;return {...base('acknowledged',row.command_id),aggregate_version:number(row.aggregate_version),result_ref:row.result_ref,primary_commit_id:row.primary_commit_id,durability_ref:'continuation-fsync:'+row.record_id,acknowledgement_scope:'single-host-process-recovery-only',production_ready:false,grant:{period_id:row.period_id,entitlement_id:row.entitlement_id,policy_version:policy,allocation_scope:c.allocation_scope,...(c.child_id?{child_id:c.child_id}:{}),starts_at:c.starts_at,ends_at:c.ends_at,allowance:c.allowance,provenance_kind:provenance,recorded_by:row.actor_id,recorded_at:f.recorded_at},state:now()>=Date.parse(c.ends_at)?'recorded_expired':'recorded_active'};
 }
 async function finish(token,c){
  const before=await snapshot(token,c),row=ownRow(before,c.command_id);const f=decode(row.recovery_record);allowed(before.s,f.command);
  await inspect(before);
  try{if(await append(row.recovery_record)!=='continuation-fsync:'+row.record_id)fail('recovery_quarantined');const durable=await records(c.household_id);if(!durable.some(r=>same(r,row.recovery_record)))fail('recovery_quarantined');}
  catch(e){journalHealth.failed=true;if(e.code==='recovery_quarantined')throw e;return founder(token,c.household_id,f.consent_epoch,async(tx,s)=>{const actual=(await rows(tx,s.h)).find(r=>r.command_id===c.command_id);if(!actual||actual.actor_id!==s.actor||!same(actual.recovery_record,row.recovery_record))fail('denied');const fact=await primary(tx,actual);allowed(s,fact.command);return result(actual,fact,false);});}
  // Fresh supplied session may belong to the SAME original actor. Original verifier stays immutable.
  return founder(token,c.household_id,f.consent_epoch,async(tx,s)=>{
   const actual=(await rows(tx,s.h)).find(r=>r.command_id===c.command_id);if(!actual||actual.actor_id!==s.actor||!same(actual.recovery_record,row.recovery_record))fail('denied');const fact=await primary(tx,actual);allowed(s,fact.command);
   if(!actual.acknowledged){
    await tx.query(`INSERT INTO continuation_grants(household_id,command_id,period_id,entitlement_id,consent_epoch,policy_version,actor_id,canonical_digest,primary_commit_id,result_ref,durability_ref,acknowledged_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[s.h,actual.command_id,actual.period_id,actual.entitlement_id,s.epoch,policy,s.actor,actual.canonical_digest,actual.primary_commit_id,actual.result_ref,'continuation-fsync:'+actual.record_id,new Date(now()).toISOString()]);
    await tx.query('UPDATE continuation_commands SET acknowledged=true WHERE household_id=$1 AND command_id=$2 AND acknowledged=false',[s.h,actual.command_id]);
   }
   journalHealth.failed=false;return result(actual,fact,true);
  });
 }
 function allocation(periods){
  if(!periods.length)fail('configuration_missing');const modes=new Set();
  for(const p of periods){const v=p.policy_json;
   if(!v||v.synthetic!==true||v.policy_version!==p.policy_version||number(p.allowance)!==v.allowance||v.allocation_scope!==p.allocation_scope)fail('configuration_missing');
   if(p.policy_version===policy){if(!same(v,policyData({allowance:number(p.allowance),allocation_scope:p.allocation_scope,starts_at:new Date(p.trial_start).toISOString(),ends_at:new Date(p.trial_end).toISOString()})))fail('configuration_missing');}
   else {if(!same(Object.keys(v).sort(),['allocation_scope','allowance','duration_seconds','policy_version','synthetic'].sort())||!positive(v.duration_seconds))fail('configuration_missing');}
   modes.add(p.allocation_scope);
  }
  if(modes.size!==1)fail('configuration_missing');return [...modes][0];
 }
 async function periodRows(tx,h,lock=false){
  if(lock)await tx.query('SELECT entitlement_id FROM entitlements WHERE household_id=$1 ORDER BY entitlement_id FOR UPDATE',[h]);
  return (await tx.query('SELECT * FROM entitlement_periods WHERE household_id=$1 ORDER BY period_id'+(lock?' FOR UPDATE':''),[h])).rows;
 }
 async function context(token,input){const c=locator(input);return serial(async()=>{
  const before=await snapshot(token,c);await inspect(before);
  return founder(token,c.household_id,undefined,async(tx,s)=>{const list=await rows(tx,s.h);if(!same(list,before.rows)||s.epoch!==before.s.epoch)fail('conflict');const periods=await periodRows(tx,s.h);return {...base('context'),household_id:s.h,consent_epoch:s.epoch,aggregate_version:await accountVersion(tx,s.h),allocation_scope:allocation(periods),children:s.profiles.map(p=>p.child_id),pending:list.filter(r=>r.actor_id===s.actor&&number(r.consent_epoch)===s.epoch&&!r.acknowledged).map(r=>({command_id:r.command_id})),writes_closed:journalHealth.failed||list.some(r=>!r.acknowledged)};});
 });}
 async function record(token,input){
  const c=command(input); // Complete primitive command snapshot before the first await.
  return serial(async()=>{
   const before=await snapshot(token,c);await inspect(before);
   await founder(token,c.household_id,c.consent_epoch,async(tx,s)=>{
    allowed(s,c);const list=await rows(tx,s.h),digest=fingerprint(s.actor,c),prior=list.find(r=>r.command_id===c.command_id);
    if(prior){if(prior.actor_id!==s.actor)fail('denied');if(prior.canonical_digest!==digest)fail('conflict');await primary(tx,prior);return;}
    if(!same(list,before.rows))fail('conflict');
    if(journalHealth.failed||list.some(r=>!r.acknowledged))fail('journal_unavailable');
    if(list.length>=1000)fail('configuration_missing');
    const version=await accountVersion(tx,s.h);if(version!==c.expected_version||version>=Number.MAX_SAFE_INTEGER)fail('conflict');
    const periods=await periodRows(tx,s.h,true);if(allocation(periods)!==c.allocation_scope)fail('conflict');
    if(periods.some(p=>p.policy_version===policy&&!list.some(r=>r.period_id===p.period_id)))fail('recovery_quarantined');
    const applicable=periods.filter(p=>p.allocation_scope==='household'||p.child_id===c.child_id);
    if(applicable.length>=100)fail('configuration_missing');
    const start=instant(c.starts_at),end=instant(c.ends_at),at=now();if(start>at||at>=end)fail('ineligible');
    if(applicable.some(p=>start<new Date(p.trial_end).getTime()&&new Date(p.trial_start).getTime()<end)||applicable.some(p=>new Date(p.trial_end).getTime()>start))fail('conflict');
    const receiptHMAC=receipt(c);if((await tx.query('SELECT command_id FROM continuation_commands WHERE receipt_hmac=$1',[receiptHMAC])).rows.length)fail('conflict');
    await namespaceCheck(tx,true);
    const entitlement=randomUUID(),period=randomUUID(),commit=randomUUID(),recordId=randomUUID(),recordedAt=new Date(now()).toISOString();
    const fact={format:'continuation-committed-fact-v1',command:{...c},actor_id:s.actor,original_session_hash:s.sessionHash,consent_epoch:s.epoch,entitlement_id:entitlement,period_id:period,primary_commit_id:commit,record_id:recordId,result_ref:'continuation-result:'+commit,aggregate_version:version+1,recorded_at:recordedAt,canonical_digest:digest,receipt_hmac:receiptHMAC,namespace_verifier:namespace,profiles:s.profiles};
    const recovery=seal(fact); // Crypto only. No journal I/O in this transaction.
    if(now()<start||now()>=end)fail('ineligible');
    await tx.query('INSERT INTO entitlements(household_id,entitlement_id) VALUES($1,$2)',[s.h,entitlement]);
    await tx.query(`INSERT INTO entitlement_periods(household_id,period_id,entitlement_id,policy_version,allowance,allocation_scope,child_id,trial_start,trial_end,policy_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[s.h,period,entitlement,policy,c.allowance,c.allocation_scope,c.child_id??null,c.starts_at,c.ends_at,JSON.stringify(policyData(c))]);
    await tx.query(`INSERT INTO continuation_commands(household_id,command_id,actor_id,original_session_hash,consent_epoch,policy_version,provenance_kind,entitlement_id,period_id,primary_commit_id,record_id,canonical_digest,receipt_hmac,namespace_verifier,aggregate_version,recorded_at,recovery_record,result_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[s.h,c.command_id,s.actor,s.sessionHash,s.epoch,policy,provenance,entitlement,period,commit,recordId,digest,receiptHMAC,namespace,version+1,recordedAt,JSON.stringify(recovery),fact.result_ref]);
    await tx.query('INSERT INTO continuation_accounts(household_id,version) VALUES($1,$2) ON CONFLICT(household_id) DO UPDATE SET version=EXCLUDED.version',[s.h,version+1]);
   });
   // This point is reached only after the primary command AND period committed.
   return finish(token,{household_id:c.household_id,command_id:c.command_id});
  });
 }
 async function status(token,input){const c=locator(input,true);return serial(async()=>{const before=await snapshot(token,c),row=ownRow(before,c.command_id);await inspect(before);return founder(token,c.household_id,number(row.consent_epoch),async(tx,s)=>{const current=(await rows(tx,s.h)).find(r=>r.command_id===c.command_id);if(!current||current.actor_id!==s.actor||!same(current.recovery_record,row.recovery_record))fail('denied');const f=await primary(tx,current);allowed(s,f.command);return result(current,f,current.acknowledged);});});}
 async function reconcile(token,input){const c=locator(input,true);return serial(()=>finish(token,c));}
 async function familySnapshot(token,c){return withSession(token,async(tx,actor)=>{
  const s=await domain(tx,actor.householdId),context=hash(JSON.stringify(['synthetic-family-space-v1',actor.adultId,s.h,s.epoch,'TEST-v1']));
  if(c.view_context!==context||!s.profiles.some(p=>p.child_id===c.child_id))fail('denied');await namespaceCheck(tx);
  const list=await rows(tx,s.h),facts=[];for(const row of list){const f=await primary(tx,row);facts.push(f);}
  return {s:{...s,context,adult:actor.adultId},rows:list,facts};
 });}
 async function familyStatus(token,input){
  const c=ownData(input,['view_context','child_id']);if(typeof c.view_context!=='string'||!/^[0-9a-f]{64}$/.test(c.view_context)||!uuid(c.child_id))fail('validation_failed');const selection={...c};
  return serial(async()=>{
   const before=await familySnapshot(token,selection);let available=true;try{await inspect(before);}catch{available=false;}
   const after=await familySnapshot(token,selection);if(!same(before,after))fail('conflict');let state='none';
   if(!available)state='unavailable';else{
    const matching=after.rows.map((r,i)=>({r,f:after.facts[i]})).filter(({r,f})=>number(r.consent_epoch)===after.s.epoch&&(f.command.allocation_scope==='household'||f.command.child_id===selection.child_id));
    if(matching.some(({r})=>!r.acknowledged))state='confirmation_pending';else if(matching.some(({f})=>Date.parse(f.command.starts_at)<=now()&&now()<Date.parse(f.command.ends_at)))state='recorded_active';else if(matching.length)state='recorded_expired';
   }
   return {status:'continuation_status',synthetic_only:true,policy_version:policy,view_context:selection.view_context,child_id:selection.child_id,state};
  });
 }
 return Object.freeze({context,record,status,reconcile,familyStatus});
}
