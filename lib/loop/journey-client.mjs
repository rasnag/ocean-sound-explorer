// RAM-only protected journey transport. No household/session authority or browser storage.
import {createSavedPlayerClient} from './saved-player.mjs';
const fail=()=>{throw new TypeError('Unsupported TEST journey response or binding.');};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
function exact(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)fail();for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}}
function selected(v){exact(v,['view_context','child_id']);if(!/^[0-9a-f]{64}$/.test(v.view_context)||!uuid(v.child_id))fail();return {...v};}
function base(v){if(v.mode!=='local-synthetic'||v.production_ready!==false)fail();}
function instant(v){if(typeof v!=='string'||!Number.isSafeInteger(Date.parse(v))||new Date(v).toISOString()!==v)fail();}
export function validateJourneyContext(v,s){exact(v,['mode','production_ready','status','available','view_context','child_id','profile_version']);base(v);if(v.status!=='journey_context'||v.available!==true||v.view_context!==s.view_context||v.child_id!==s.child_id||!positive(v.profile_version))fail();return v;}
export function validateJourneyTrial(v){exact(v,['status','mode','production_ready','test_only','state','activation_id','entitlement_id','period_id','policy_version','allowance','trial_start','trial_end']);base(v);if(v.status!=='journey_trial'||v.test_only!==true||!['active','expired'].includes(v.state)||v.policy_version!=='TEST-JOURNEY-TRIAL-v1'||v.allowance!==8||!uuid(v.entitlement_id)||!uuid(v.period_id)||typeof v.activation_id!=='string'||!/^local-test-journey-trial-v1:[0-9a-f-]{36}$/.test(v.activation_id))fail();instant(v.trial_start);instant(v.trial_end);if(Date.parse(v.trial_end)-Date.parse(v.trial_start)!==86400000)fail();return v;}
function receipt(v,id,revision){
 if(v.status==='retryable_unacknowledged'){exact(v,['status','mode','production_ready','play_id','action_id','primary_commit_id']);base(v);if(v.play_id!==id||!uuid(v.primary_commit_id)||!(v.action_id===null||uuid(v.action_id)))fail();return;}
 exact(v,['status','mode','acknowledgement_scope','production_ready','play_id','action_id','primary_commit_id','durability_ref','checkpoint','events']);base(v);
 if(v.status!=='acknowledged'||v.play_id!==id||v.acknowledgement_scope!=='single-host-process-recovery-only'||!uuid(v.primary_commit_id)||!/^local-fsync:[0-9a-f-]{36}$/.test(v.durability_ref)||!(v.action_id===null||uuid(v.action_id)))fail();
 exact(v.checkpoint,['checkpoint_id','last_action_sequence','last_event_sequence','state']);const c=v.checkpoint,s=c.state;
 if(!uuid(c.checkpoint_id)||![c.last_action_sequence,c.last_event_sequence].every(n=>Number.isSafeInteger(n)&&n>=0)||s?.play_id!==id||s?.revision_id!==revision||s.sequence!==c.last_action_sequence||!positive(s.consent_epoch)||!Array.isArray(s.trials)||!Array.isArray(v.events))fail();
 const stateKeys=['contract_version','play_id','consent_epoch','revision_id','pattern_version','engine_version','sequence','trials','current_result','prediction','configuration','prediction_action_id','configuration_action_id','comparison'];
 if(s.engine_version==='fixture-engine-2')stateKeys.push('starting_path','starting_reason','help_level','help_open','help_history','side_thread_open');else if(s.engine_version!=='fixture-engine-1')fail();exact(s,stateKeys);
 if(s.contract_version!=='1.1.0'||s.pattern_version!=='fixture-1')fail();
 for(const e of v.events){exact(e,['contract_version','kind','event_type','event_id','play_id','action_id','sequence','action_sequence','server_at','revision_id','pattern_version','source','data']);if(e.play_id!==id||e.revision_id!==revision||e.source!=='server_observation'||!Number.isSafeInteger(e.sequence)||e.action_sequence!==s.sequence||typeof e.server_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(e.server_at))fail();}
}
export function validateJourneyStart(v,b){exact(v,['mode','production_ready','status','assignment_id','revision_id','play_id','result']);base(v);if(!['journey_started','journey_pending'].includes(v.status)||v.assignment_id!==b.assignment_id||v.revision_id!==b.revision_id||!uuid(v.play_id))fail();receipt(v.result,v.play_id,v.revision_id);if((v.status==='journey_started')!==(v.result.status==='acknowledged'))fail();return v;}
export function createJourneyClient(fetcher=(...a)=>globalThis.fetch(...a)){
 if(typeof fetcher!=='function')fail();
 async function post(name,body,signal){signal?.throwIfAborted();const r=await fetcher('/adult/journey/'+name,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});signal?.throwIfAborted();if(!r.ok)throw Object.assign(new Error('TEST journey access unavailable.'),{status:r.status});const value=await r.json();signal?.throwIfAborted();return value;}
 // signal is a local lifecycle option, never part of the exact parent wire body.
 const context=async(input,{signal}={})=>{const s=selected(input);return validateJourneyContext(await post('context',s,signal),s);};
 const trial=async input=>validateJourneyTrial(await post('trial',selected(input)));
 async function start(input){exact(input,['view_context','child_id','assignment_id','revision_id','command_id']);selected({view_context:input.view_context,child_id:input.child_id});if(['assignment_id','revision_id','command_id'].some(k=>!uuid(input[k])))fail();const c=structuredClone(input);return validateJourneyStart(await post('start',c),c);}
 function bind(input,options){
  exact(input,['view_context','child_id','assignment_id','revision_id','play_id']);exact(options,['profileVersion','current','onDenied']);
  const s=selected({view_context:input.view_context,child_id:input.child_id});if(['assignment_id','revision_id','play_id'].some(k=>!uuid(input[k]))||!positive(options.profileVersion)||typeof options.current!=='function'||typeof options.onDenied!=='function')fail();
  const binding=Object.freeze({...input}),controllers=new Set();let closed=false;
  const close=()=>{closed=true;for(const c of controllers)c.abort();controllers.clear();};
  function current(){if(closed||!options.current())throw Object.assign(new Error('Play binding closed.'),{status:403});}
  async function check(signal){current();const c=await context(s,{signal});current();if(c.profile_version!==options.profileVersion)throw Object.assign(new Error('Profile changed.'),{status:403});}
  const denied=()=>({status:403,body:{error:'Access closed.'}});
  const request=async(path,body)=>{
   if(path==='/saved/open')exact(body,['play_id']);else if(path==='/saved/action'){exact(body,['play_id','command']);exact(body.command,['contract_version','play_id','action_id','expected_sequence','consent_epoch','revision_id','pattern_version','action']);if(body.command.play_id!==binding.play_id||body.command.revision_id!==binding.revision_id)fail();}else fail();
   if(body.play_id!==binding.play_id)fail();
   if(closed)return denied();
   const controller=new AbortController();controllers.add(controller);
   try{
    await check(controller.signal);const value=await post(path==='/saved/open'?'open':'action',{...binding,...(path==='/saved/action'?{command:structuredClone(body.command)}:{})},controller.signal);
    await check(controller.signal);
    if(path==='/saved/open'){
     // Reuse the accepted full finite-state/receipt/history validator, without I/O.
     const verifier=createSavedPlayerClient({request:async()=>({status:200,body:value})});await verifier.open(binding.play_id);if(verifier.snapshot().phase!=='ready')fail();
    }else receipt(value,binding.play_id,binding.revision_id);
    current();return {status:value.status==='retryable_unacknowledged'?503:200,body:value};
   }catch(e){
    // Explicitly retired leases cannot emit a late denial into a newer host generation.
    if(closed||controller.signal.aborted)return denied();
    if(e?.status===403){close();options.onDenied();return denied();}
    if([400,404,409,503].includes(e?.status))return {status:e.status,body:{error:'Unavailable.'}};
    throw e;
   }finally{controllers.delete(controller);}
  };
  return Object.freeze({request,close});
 }
 return Object.freeze({context,trial,start,bind});
}
