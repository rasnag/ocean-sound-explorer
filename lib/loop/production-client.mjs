// RAM-only production transport. The caller retains an uncertain command/key.
const fail=()=>{throw new TypeError('Production response could not be confirmed.');};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const pos=v=>Number.isSafeInteger(v)&&v>0;
function exact(v,keys){
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();
 const d=Object.getOwnPropertyDescriptors(v);if(Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))fail();return Object.fromEntries(keys.map(k=>[k,d[k].value]));
}
function select(v){const s=exact(v,['view_context','child_id','profile_version']);if(typeof s.view_context!=='string'||!/^[0-9a-f]{64}$/.test(s.view_context)||!uuid(s.child_id)||!pos(s.profile_version))fail();return {...s,child_id:s.child_id.toLowerCase()};}
function command(v){const c=exact(v,['contract_version','record_type','command','idempotency_key','child_id','wonder_id','wonder_version','consent_epoch','offer_version','scope_version']);if(c.contract_version!=='1.1.0'||c.record_type!=='submit'||c.command!=='SubmitProduction'||['idempotency_key','child_id','wonder_id','offer_version'].some(k=>!uuid(c[k]))||['wonder_version','consent_epoch','scope_version'].some(k=>!pos(c[k])))fail();for(const k of ['idempotency_key','child_id','wonder_id','offer_version'])c[k]=c[k].toLowerCase();return c;}
function time(v){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v)||v.startsWith('0000-'))fail();const n=Date.parse(v);if(!Number.isFinite(n)||new Date(n).toISOString()!==v.replace('Z','.000Z'))fail();return n;}
function receipt(v){const r=exact(v,['receipt_id','request_id','booking_id','claim_id','period_id','original_received_at','original_due_at','deadline_interval_seconds']);if(['receipt_id','request_id','booking_id','claim_id','period_id'].some(k=>!uuid(r[k]))||r.deadline_interval_seconds!==86400||time(r.original_due_at)-time(r.original_received_at)!==86400000)fail();return r;}
function validate(v,kind,body){
 if(kind==='status'){
  const r=exact(v,['status','pending','writes_closed']);if(r.status!=='production_status'||typeof r.writes_closed!=='boolean'||!Array.isArray(r.pending)||r.pending.length>1000)fail();const seen=new Set();
  for(const p of r.pending){const a=exact(p,['idempotency_key','wonder_id','wonder_version']);if(!uuid(a.idempotency_key)||!uuid(a.wonder_id)||!pos(a.wonder_version)||seen.has(a.idempotency_key))fail();seen.add(a.idempotency_key);}return structuredClone(r);
 }
 if(kind==='eligibility'){
  if(v?.status==='eligible'){const r=exact(v,['status','offer_version','consent_epoch','scope_version']);if(!uuid(r.offer_version)||!pos(r.consent_epoch)||!pos(r.scope_version))fail();return r;}
  const r=exact(v,['status']);if(!['ineligible','quota_full','no_capacity','configuration_missing'].includes(r.status))fail();return r;
 }
 const fields=['contract_version','record_type','command','command_id','idempotency_key','status','aggregate_version'],ack=v?.status==='acknowledged';
 const r=exact(v,ack?[...fields,'receipt','primary_commit_id','durability_ref']:fields);
 const key=kind==='submit'?body.command.idempotency_key:body.idempotency_key;
 if(r.contract_version!=='1.1.0'||r.record_type!=='result'||r.command!=='SubmitProduction'||!uuid(r.command_id)||r.idempotency_key!==key||!Number.isSafeInteger(r.aggregate_version)||r.aggregate_version<0||!['acknowledged','retryable_unacknowledged','conflict','denied','ineligible','quota_full','no_capacity','configuration_missing','recovery_quarantined'].includes(r.status))fail();
 if(ack){r.receipt=receipt(r.receipt);if(!uuid(r.primary_commit_id)||typeof r.durability_ref!=='string'||!/^production-fsync:[0-9a-f-]{36}$/.test(r.durability_ref)||!uuid(r.durability_ref.slice(17))||!pos(r.aggregate_version)||kind==='submit'&&r.receipt.request_id!==body.command.wonder_id)fail();}
 return structuredClone(r);
}
export function createProductionClient(fetcher=globalThis.fetch){
 if(typeof fetcher!=='function')fail();
 async function request(kind,input){
  let body;
  if(kind==='status')body=select(input);
  else if(kind==='submit'){const v=exact(input,['selection','command']);body={selection:select(v.selection),command:command(v.command)};if(body.selection.child_id!==body.command.child_id)fail();}
  else if(kind==='eligibility'){const v=exact(input,['selection','wonder_id','wonder_version']);if(!uuid(v.wonder_id)||!pos(v.wonder_version))fail();body={selection:select(v.selection),wonder_id:v.wonder_id.toLowerCase(),wonder_version:v.wonder_version};}
  else{const v=exact(input,['selection','idempotency_key']);if(!uuid(v.idempotency_key))fail();body={selection:select(v.selection),idempotency_key:v.idempotency_key.toLowerCase()};}
  const bytes=JSON.stringify(body);
  const response=await fetcher('/adult/production/'+kind,{method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:bytes});
  if(!response.ok)throw Object.assign(new Error('Production confirmation unavailable.'),{status:response.status});
  return validate(await response.json(),kind,body);
 }
 return Object.freeze({eligibility:input=>request('eligibility',input),submit:input=>request('submit',input),status:input=>request('status',input),reconcile:input=>request('reconcile',input)});
}
