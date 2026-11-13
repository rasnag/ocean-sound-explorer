// CODEX-04-C. RAM-only transport; cookies remain HttpOnly.
// This module never logs, persists, or puts private fields in a URL.
const unavailable=()=>{throw new TypeError('Queue confirmation unavailable.');};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const nonnegative=v=>Number.isSafeInteger(v)&&v>=0;
function object(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))unavailable();
 const descriptors=Object.getOwnPropertyDescriptors(v),out={};
 for(const k of Reflect.ownKeys(descriptors)){
  const d=descriptors[k];if(typeof k!=='string'||['__proto__','constructor','prototype'].includes(k)||!d.enumerable||!Object.hasOwn(d,'value'))unavailable();
  Object.defineProperty(out,k,{value:d.value,enumerable:true,writable:true,configurable:true});
 }
 return out;
}
function exact(v,keys){const out=object(v);if(Object.keys(out).length!==keys.length||keys.some(k=>!Object.hasOwn(out,k)))unavailable();return out;}
function json(v){
 let nodes=0;const active=new Set();
 function walk(x,depth){
  if(++nodes>60000||depth>16)unavailable();
  if(x===null||typeof x==='boolean')return x;
  if(typeof x==='string'){if(x.length>16000)unavailable();return x;}
  if(typeof x==='number'){if(!Number.isFinite(x))unavailable();return x;}
  if(!x||typeof x!=='object'||active.has(x))unavailable();active.add(x);
  try{
   if(Array.isArray(x)){
    const d=Object.getOwnPropertyDescriptors(x);if(!Object.hasOwn(d.length,'value')||x.length>1000||Reflect.ownKeys(d).length!==x.length+1)unavailable();
    const out=[];for(let i=0;i<x.length;i++){const item=d[String(i)];if(!item?.enumerable||!Object.hasOwn(item,'value'))unavailable();out.push(walk(item.value,depth+1));}return out;
   }
   return Object.fromEntries(Object.entries(object(x)).map(([k,item])=>[k,walk(item,depth+1)]));
  }finally{active.delete(x);}
 }
 const out=walk(v,0);if(JSON.stringify(out).length>4000000)unavailable();return out;
}
function selection(v){const s=exact(v,['view_context','child_id','profile_version']);if(typeof s.view_context!=='string'||!/^[0-9a-f]{64}$/.test(s.view_context)||!uuid(s.child_id)||!positive(s.profile_version))unavailable();return s;}
function instant(v){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)||v.startsWith('0000-'))unavailable();const at=Date.parse(v);if(!Number.isFinite(at)||new Date(at).toISOString()!==v.replace(/(?<!\.\d{3})Z$/,'.000Z'))unavailable();return at;}
function receipt(v){
 const r=exact(v,['receipt_id','request_id','booking_id','claim_id','period_id','original_received_at','original_due_at','deadline_interval_seconds']);
 if(['receipt_id','request_id','booking_id','claim_id','period_id'].some(k=>!uuid(r[k]))||r.deadline_interval_seconds!==86400||instant(r.original_due_at)-instant(r.original_received_at)!==86400000)unavailable();return r;
}
const states=['received','clarification','fit_review','alternative_pending','agreed_scope','accepted','declined','cancelled'];
export function validateQueueDetail(input,founder=false){
 const d=object(json(input));
 const allowed=['request_id','question','current_question','parent_context','parent_context_ref','interpretation','scope_version','aggregate_version','storage_state','scope_kind','agreement_version','agreement','clarification','alternative','revised_estimate','late_update','fit','breach_observed','source_scope_version','receipt','state','history','late','can_cancel','delivered',...(founder?['household_id','child_id','consent_epoch']:[])];
 if(Object.keys(d).some(k=>!allowed.includes(k))||!uuid(d.request_id)||typeof d.question!=='string'||!d.question.trim()||d.question.length>4000||typeof d.current_question!=='string'||!d.current_question.trim()||d.current_question.length>4000||!positive(d.scope_version)||!positive(d.source_scope_version)||!nonnegative(d.aggregate_version)||!nonnegative(d.agreement_version)||d.agreement_version!==0&&d.agreement_version!==d.scope_version||!states.includes(d.state)||!Array.isArray(d.history)||typeof d.late!=='boolean'||typeof d.can_cancel!=='boolean'||d.delivered!==false)unavailable();
 if(founder&&(!uuid(d.household_id)||!uuid(d.child_id)||!positive(d.consent_epoch)))unavailable();
 if(!(d.interpretation===null||typeof d.interpretation==='string'&&d.interpretation.length<=2000)||!(d.parent_context===null||typeof d.parent_context==='string'&&d.parent_context.length<=2000))unavailable();
 if(d.revised_estimate!==null)instant(d.revised_estimate);
 if(d.clarification!==null){const c=object(d.clarification);if(typeof c.message!=='string'||!(c.answer===null||typeof c.answer==='string'))unavailable();instant(c.requested_at);}
 if(d.alternative!==null){const a=object(d.alternative);if(typeof a.interpretation!=='string'||a.scope_version!==d.scope_version)unavailable();}
 if(d.late_update!==null){const l=object(d.late_update);if(l.status!=='DRAFT'||l.sent!==false||typeof l.message!=='string')unavailable();instant(l.revised_estimate);instant(l.prepared_at);}
 let version=0;
 for(const item of d.history){const h=object(item);if(!uuid(h.command_id)||!uuid(h.actor_id)||!['founder','parent'].includes(h.actor_kind)||!positive(h.scope_version)||h.aggregate_version!==++version||typeof h.action!=='string'||!states.includes(h.to))unavailable();instant(h.recorded_at);}
 if(version!==d.aggregate_version)unavailable();d.receipt=receipt(d.receipt);if(d.receipt.request_id!==d.request_id)unavailable();return d;
}
const parentShapes={AnswerClarification:['answer'],CorrectRequest:['question','parent_context'],AgreeAlternative:['scope_version'],CancelRequest:['reason']};
const founderShapes={RequestClarification:['message'],ProposeAlternative:['interpretation'],AcceptRequest:['scope_version','agreement_version'],DeclineRequest:['reason'],PrepareLateUpdate:['message','revised_estimate']};
function command(input,founder){
 const c=exact(input,['command_id',...(founder?['household_id']:[]),'request_id','expected_version','consent_epoch','action','payload']);
 if(!uuid(c.command_id)||!uuid(c.request_id)||founder&&!uuid(c.household_id)||!nonnegative(c.expected_version)||c.expected_version===Number.MAX_SAFE_INTEGER||!positive(c.consent_epoch))unavailable();
 const shapes=founder?founderShapes:parentShapes;if(typeof c.action!=='string'||!Object.hasOwn(shapes,c.action))unavailable();c.payload=exact(c.payload,shapes[c.action]);
 for(const [k,v]of Object.entries(c.payload)){
  if(k==='scope_version'){if(!positive(v))unavailable();}
  else if(k==='agreement_version'){if(!nonnegative(v))unavailable();}
  else if(k==='revised_estimate'){instant(v);if(new Date(v).toISOString()!==v)unavailable();}
  else if(k==='parent_context'){if(!(v===null||typeof v==='string'&&v.length<=2000))unavailable();}
  else if(typeof v!=='string'||!v.trim()||v.length>(k==='question'?4000:2000))unavailable();
 }
 return json(c);
}
function mutation(input,key,action,requestId){
 const v=object(json(input)),common=v.command==='AcceptRequest';
 const base=common?['contract_version','record_type','command','command_id','idempotency_key','status','aggregate_version']:['status','command_id','action',...(action==='SetIntake'?[]:['request_id']),'aggregate_version'];
 const ack=v.status==='acknowledged';exact(v,[...base,...(ack?[...(common?['receipt']:[]),'primary_commit_id','durability_ref']:[])]);
 if(!['acknowledged','retryable_unacknowledged'].includes(v.status)||v.command_id!==key||!positive(v.aggregate_version))unavailable();
 if(common){if(action!=='AcceptRequest'||v.contract_version!=='1.1.0'||v.record_type!=='result'||v.idempotency_key!==key)unavailable();if(ack){v.receipt=receipt(v.receipt);if(requestId&&v.receipt.request_id!==requestId)unavailable();}}
 else if(action&&v.action!==action||requestId&&v.request_id!==requestId)unavailable();
 if(ack&&(!uuid(v.primary_commit_id)||typeof v.durability_ref!=='string'||!v.durability_ref.startsWith('queue-fsync:')||!uuid(v.durability_ref.slice(12))))unavailable();return v;
}
function status(v,operator=false){const r=exact(json(v),['status','pending','writes_closed']);if(r.status!=='queue_status'||typeof r.writes_closed!=='boolean'||!Array.isArray(r.pending))unavailable();const seen=new Set();for(const p of r.pending){exact(p,operator?['command_id','scope']:['command_id','request_id']);if(!uuid(p.command_id)||seen.has(p.command_id)||operator?p.scope!=='operator':!uuid(p.request_id))unavailable();seen.add(p.command_id);}return r;}
function intake(v){const r=exact(json(v),['version','paused','reason']);if(!nonnegative(r.version)||typeof r.paused!=='boolean'||typeof r.reason!=='string'||r.reason.length>2000)unavailable();return r;}
export function createQueueClient(fetcher=(...args)=>globalThis.fetch(...args)){
 if(typeof fetcher!=='function')unavailable();
 async function request(path,body,signal){
  const bytes=body===undefined?undefined:JSON.stringify(body);
  const response=await fetcher(path,{method:bytes===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:bytes===undefined?undefined:{'Content-Type':'application/json'},body:bytes,signal});
  if(!response.ok)throw Object.assign(new Error('Current queue access or confirmation unavailable.'),{status:response.status});return json(await response.json());
 }
 async function familyRead(input,{signal}={}){
  const v=exact(input,['selection','request_id']),s=selection(v.selection);if(!uuid(v.request_id))unavailable();
  // Read the actual existing consent projection, never infer epoch 1.
  const permission=exact(await request('/adult/consent',undefined,signal),['status','synthetic_only','policy_version','state','consent_epoch','required_service','optional_contact','optional_story']);
  if(permission.status!=='consent'||permission.synthetic_only!==true||permission.policy_version!=='TEST-v1'||permission.state!=='active'||permission.required_service!==true||!positive(permission.consent_epoch))throw Object.assign(new Error('Current queue access unavailable.'),{status:403});
  const r=exact(await request('/adult/queue/read',{selection:s,request_id:v.request_id},signal),['status','request']);if(r.status!=='request_status')unavailable();const d=validateQueueDetail(r.request);if(d.request_id!==v.request_id)unavailable();return {status:r.status,request:d,consent_epoch:permission.consent_epoch};
 }
 async function familyCommand(input,{signal}={}){const v=exact(input,['selection','command']),c=command(v.command,false),body={selection:selection(v.selection),command:c};return mutation(await request('/adult/queue/command',body,signal),c.command_id,c.action,c.request_id);}
 async function familyStatus(input,{signal}={}){const v=exact(input,['selection']);return status(await request('/adult/queue/status',{selection:selection(v.selection)},signal));}
 async function familyReconcile(input,{signal}={}){const v=exact(input,['selection','command_id']);if(!uuid(v.command_id))unavailable();const r=await request('/adult/queue/reconcile',{selection:selection(v.selection),command_id:v.command_id},signal);return mutation(r,v.command_id,r.command==='AcceptRequest'?'AcceptRequest':r.action,r.request_id);}
 async function founderRead(input,{signal}={}){const v=exact(input,['filter']);if(!['all','received','clarification','alternative_pending','accepted','overdue','terminal'].includes(v.filter))unavailable();const r=exact(await request('/founder/queue/read',v,signal),['status','requests','intake']);if(r.status!=='queue'||!Array.isArray(r.requests))unavailable();return {status:r.status,requests:r.requests.map(x=>validateQueueDetail(x,true)),intake:intake(r.intake)};}
 async function founderCommand(input,{signal}={}){const c=command(input,true);return mutation(await request('/founder/queue/command',c,signal),c.command_id,c.action,c.request_id);}
 function recovery(input,reconcile){const v=object(input);if(v.scope==='operator')exact(v,reconcile?['scope','command_id']:['scope']);else{exact(v,reconcile?['household_id','command_id']:['household_id']);if(!uuid(v.household_id))unavailable();}if(reconcile&&!uuid(v.command_id))unavailable();return json(v);}
 async function founderStatus(input,{signal}={}){const v=recovery(input,false);return status(await request('/founder/queue/status',v,signal),v.scope==='operator');}
 async function founderReconcile(input,{signal}={}){const v=recovery(input,true),r=await request('/founder/queue/reconcile',v,signal);return mutation(r,v.command_id,r.command==='AcceptRequest'?'AcceptRequest':r.action,r.request_id);}
 async function readIntake({signal}={}){return intake(await request('/founder/queue/intake-read',{},signal));}
 async function setIntake(input,{signal}={}){const v=exact(input,['command_id','expected_version','paused','reason']);if(!uuid(v.command_id)||!nonnegative(v.expected_version)||typeof v.paused!=='boolean'||typeof v.reason!=='string'||v.reason.length>2000||v.paused&&!v.reason.trim())unavailable();return mutation(await request('/founder/queue/intake',v,signal),v.command_id,'SetIntake');}
 return Object.freeze({familyRead,familyCommand,familyStatus,familyReconcile,founderRead,founderCommand,founderStatus,founderReconcile,readIntake,setIntake});
}
