// CODEX-04-A RAM-only local synthetic transport; no persistent private browser state.
const fail=()=>{throw new TypeError('Local wonder response could not be confirmed.');};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const pos=v=>Number.isSafeInteger(v)&&v>0;
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();const d=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))fail();return value;}
function select(input,extra=[]){exact(input,['view_context','child_id','profile_version',...extra]);if(typeof input.view_context!=='string'||!/^[0-9a-f]{64}$/.test(input.view_context)||!uuid(input.child_id)||!pos(input.profile_version))fail();return {...input,child_id:input.child_id.toLowerCase()};}
function validateReference(r){exact(r,['command_id','request_id','source_scope_version','child_id']);if(!uuid(r.command_id)||!uuid(r.request_id)||!uuid(r.child_id)||!pos(r.source_scope_version))fail();}
function validate(value,scope,kind,commandId){
 const common=['status','synthetic_only','policy_version','state'];
 if(value?.status!=='wonder_capture'||value.synthetic_only!==true||value.policy_version!=='TEST-v1')fail();
 if(kind==='status'){
  exact(value,[...common,'view_context','child_id','profile_version','saved','pending','writes_closed']);
  if(value.state!=='capture_ready'||value.view_context!==scope.view_context||value.child_id!==scope.child_id||value.profile_version!==scope.profile_version||typeof value.writes_closed!=='boolean'||!Array.isArray(value.saved)||!Array.isArray(value.pending)||value.saved.length>1000||value.pending.length>1000)fail();
  const seen=new Set();for(const r of value.saved){exact(r,['request_id','source_scope_version','question','parent_context']);if(!uuid(r.request_id)||!pos(r.source_scope_version)||typeof r.question!=='string'||!r.question.trim()||r.question.length>4000||!(r.parent_context===null||typeof r.parent_context==='string'&&r.parent_context.length<=2000)||seen.has(r.request_id))fail();seen.add(r.request_id);}
  const commands=new Set();for(const r of value.pending){validateReference(r);if(r.child_id!==scope.child_id||commands.has(r.command_id))fail();commands.add(r.command_id);if(seen.has(r.request_id))fail();}
 }else{
  const acknowledged=value.state==='acknowledged';if(!acknowledged&&value.state!=='retryable_unacknowledged')fail();
  exact(value,[...common,'command_id','request_id','source_scope_version','child_id','view_context',...(acknowledged?['acknowledgement_scope','production_ready']:['writes_closed'])]);
  validateReference({command_id:value.command_id,request_id:value.request_id,source_scope_version:value.source_scope_version,child_id:value.child_id});
  if(value.command_id!==commandId||value.child_id!==scope.child_id||value.view_context!==scope.view_context||acknowledged&&(value.acknowledgement_scope!=='single-host-process-recovery-only'||value.production_ready!==false)||!acknowledged&&value.writes_closed!==true)fail();
 }
 return structuredClone(value);
}
export function createWonderCaptureClient(fetcher=globalThis.fetch){
 if(typeof fetcher!=='function')fail();
 async function request(kind,input){
  let body;
  if(kind==='save'){
   const common=['view_context','child_id','profile_version','command_id','operation','question','parent_context'];
   exact(input,input?.operation==='correct'?[...common,'request_id','expected_source_scope_version']:common);
   if(!['create','correct'].includes(input.operation)||!uuid(input.command_id)||typeof input.question!=='string'||!input.question.trim()||input.question.length>4000||!(input.parent_context===null||typeof input.parent_context==='string'&&input.parent_context.length<=2000)||input.operation==='correct'&&(!uuid(input.request_id)||!pos(input.expected_source_scope_version)))fail();
   body={...input,...select({view_context:input.view_context,child_id:input.child_id,profile_version:input.profile_version}),command_id:input.command_id.toLowerCase()};if(body.request_id)body.request_id=body.request_id.toLowerCase();
  }else{body=select(input,kind==='reconcile'?['command_id']:[]);if(kind==='reconcile'){if(!uuid(body.command_id))fail();body.command_id=body.command_id.toLowerCase();}}
  // Serialize synchronously before yielding; the caller retains its original intent.
  const bytes=JSON.stringify(body);
  const response=await fetcher('/adult/wonder/'+kind,{method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:bytes});
  if(!response.ok)throw Object.assign(new Error('Wonder confirmation unavailable.'),{status:response.status});
  return validate(await response.json(),body,kind,body.command_id);
 }
 return Object.freeze({status:input=>request('status',input),save:input=>request('save',input),reconcile:input=>request('reconcile',input)});
}
