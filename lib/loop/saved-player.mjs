import {createPlayer,validateAdventure} from './player-engine.mjs';
import {createAssistedPlayer,validateAssistedAdventure} from './assisted-player.mjs';

const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const fail=()=>{throw new TypeError('Unsupported saved player input or acknowledgement.');};
function exact(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
  const own=Reflect.ownKeys(value);
  if(own.length!==keys.length||own.some(k=>!keys.includes(k)))fail();
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!d.enumerable||!('value'in d))fail();}
}
function frozen(value){if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
function stable(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  return Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
}
const equal=(a,b)=>stable(a)===stable(b);
const cursor=v=>Number.isSafeInteger(v)&&v>=0;
const predictions=['stable','tips','not_sure'];
const configurations=['balanced','offset'];
function validateSpec(spec){if(spec?.engine_version==='fixture-engine-1')validateAdventure(spec);else validateAssistedAdventure(spec);if(!uuid(spec.revision_id))fail();}
function player(spec,state){
  return spec.engine_version==='fixture-engine-1'?createPlayer(spec,{playId:state.play_id,consentEpoch:state.consent_epoch})
    :createAssistedPlayer(spec,{playId:state.play_id,consentEpoch:state.consent_epoch,startingPath:state.starting_path,startingReason:state.starting_reason});
}
function validateState(s,spec){
  if(!s||!uuid(s.play_id)||!Number.isSafeInteger(s.consent_epoch)||s.consent_epoch<1)fail();
  const engine=player(spec,s),initial=engine.snapshot();
  exact(s,Object.keys(initial));
  for(const key of ['contract_version','play_id','consent_epoch','revision_id','pattern_version','engine_version'])if(s[key]!==initial[key])fail();
  if(!cursor(s.sequence)||!Array.isArray(s.trials)||s.trials.length>s.sequence/3)fail();
  const ids=new Set();let prior=0;
  for(let i=0;i<s.trials.length;i++){
    const t=s.trials[i];
    exact(t,['trial_id','prediction','configuration','outcome','prediction_action_id','configuration_action_id','test_action_id','action_sequence','play_id','revision_id','pattern_version']);
    if(t.trial_id!==s.play_id+':trial:'+(i+1)||!predictions.includes(t.prediction)||!configurations.includes(t.configuration)
      ||t.outcome!==spec.outcomes[t.configuration]||t.play_id!==s.play_id||t.revision_id!==s.revision_id||t.pattern_version!==s.pattern_version
      ||!cursor(t.action_sequence)||t.action_sequence<prior+3||t.action_sequence>s.sequence)fail();
    for(const key of ['prediction_action_id','configuration_action_id','test_action_id']){if(!uuid(t[key])||ids.has(t[key]))fail();ids.add(t[key]);}
    // Validate each finite trial with the accepted engine, never executable content.
    const p=player(spec,s),base={contract_version:s.contract_version,play_id:s.play_id,consent_epoch:s.consent_epoch,revision_id:s.revision_id,pattern_version:s.pattern_version};
    p.dispatch({...base,action_id:t.prediction_action_id,expected_sequence:0,action:{kind:'predict',prediction:t.prediction}});
    p.dispatch({...base,action_id:t.configuration_action_id,expected_sequence:1,action:{kind:'configure',configuration:t.configuration}});
    const tested=p.dispatch({...base,action_id:t.test_action_id,expected_sequence:2,action:{kind:'test',prediction_action_id:t.prediction_action_id,configuration_action_id:t.configuration_action_id}});
    if(tested.trials[0].outcome!==t.outcome)fail();prior=t.action_sequence;
  }
  for(const [key,values]of [['prediction',predictions],['configuration',configurations]]){
    if(s[key]!==null&&!values.includes(s[key]))fail();
    const ref=s[key+'_action_id'];
    if((s[key]===null)!==(ref===null)||(ref!==null&&(!uuid(ref)||ids.has(ref))))fail();
  }
  if(s.prediction_action_id&&s.prediction_action_id===s.configuration_action_id)fail();
  if(s.current_result!==null&&(!equal(s.current_result,s.trials.at(-1))||s.prediction!==null||s.configuration!==null))fail();
  if(s.comparison!==null&&(!Array.isArray(s.comparison)||s.comparison.length!==2||s.comparison[0]===s.comparison[1]
    ||s.comparison.some(id=>!s.trials.some(t=>t.trial_id===id))))fail();
  if(spec.engine_version==='fixture-engine-2'){
    if(s.starting_path!=='medium'||typeof s.starting_reason!=='string'||!s.starting_reason.trim()
      ||typeof s.help_open!=='boolean'||typeof s.side_thread_open!=='boolean'||![null,1,2,3].includes(s.help_level)||!Array.isArray(s.help_history))fail();
    let last=0;
    for(const h of s.help_history){exact(h,['level','action_id','sequence']);if(![1,2,3].includes(h.level)||!uuid(h.action_id)||!cursor(h.sequence)||h.sequence<=last||h.sequence>s.sequence)fail();last=h.sequence;}
    if(s.help_level!==(s.help_history.at(-1)?.level??null)||(s.help_open&&s.help_level===null))fail();
  }
}
function validateReceipt(r,spec,playId){
  exact(r,['status','mode','acknowledgement_scope','production_ready','play_id','action_id','primary_commit_id','durability_ref','checkpoint','events']);
  if(r.status!=='acknowledged'||r.mode!=='local-synthetic'||r.production_ready!==false||r.acknowledgement_scope!=='single-host-process-recovery-only'
    ||r.play_id!==playId||!uuid(r.play_id)||!(r.action_id===null||uuid(r.action_id))||!uuid(r.primary_commit_id)
    ||typeof r.durability_ref!=='string'||!uuid(r.durability_ref.slice('local-fsync:'.length))||!r.durability_ref.startsWith('local-fsync:'))fail();
  const c=r.checkpoint;exact(c,['checkpoint_id','last_action_sequence','last_event_sequence','state']);
  if(!uuid(c.checkpoint_id)||!cursor(c.last_action_sequence)||!cursor(c.last_event_sequence))fail();
  validateState(c.state,spec);
  if(c.state.play_id!==playId||c.last_action_sequence!==c.state.sequence||c.last_event_sequence!==c.state.sequence+c.state.trials.length)fail();
  if(!Array.isArray(r.events)||(c.state.sequence===0?(r.action_id!==null||r.events.length!==0):(r.action_id===null||r.events.length<1||r.events.length>2)))fail();
  const eventData={prediction_recorded:['prediction'],configuration_committed:['configuration'],test_resolved:['trial_id','prediction_action_id','configuration_action_id','configuration','outcome'],progress_saved:['checkpoint_id','last_action_sequence','primary_commit_id','durability_ref'],comparison_viewed:['trial_ids'],help_used:['level'],help_closed:['open'],side_thread_changed:['open']};
  for(let i=0;i<r.events.length;i++){
    const e=r.events[i];exact(e,['contract_version','kind','event_type','event_id','play_id','action_id','sequence','action_sequence','server_at','revision_id','pattern_version','source','data']);
    if(!Object.hasOwn(eventData,e.event_type)||e.contract_version!=='1.1.0'||e.kind!=='play_event'||e.source!=='server_observation'
      ||e.play_id!==playId||e.action_id!==r.action_id||e.event_id!==r.action_id+':event:'+(i+1)||e.action_sequence!==c.state.sequence
      ||e.sequence!==c.last_event_sequence-r.events.length+i+1||e.revision_id!==spec.revision_id||e.pattern_version!==spec.pattern_version
      ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(e.server_at)||!Number.isFinite(Date.parse(e.server_at)))fail();
    exact(e.data,eventData[e.event_type]);
    const s=c.state,d=e.data;
    if(e.event_type==='prediction_recorded'&&(d.prediction!==s.prediction||s.prediction_action_id!==r.action_id))fail();
    if(e.event_type==='configuration_committed'&&(d.configuration!==s.configuration||s.configuration_action_id!==r.action_id))fail();
    if(e.event_type==='test_resolved'){
      const t=s.trials.at(-1);if(!t||t.test_action_id!==r.action_id||t.action_sequence!==s.sequence)fail();
      for(const k of eventData.test_resolved)if(d[k]!==t[k])fail();
      if(r.events.length!==2||r.events[1].event_type!=='progress_saved')fail();
    }
    if(e.event_type==='progress_saved'&&(i!==1||r.events[0].event_type!=='test_resolved'||d.checkpoint_id!==c.checkpoint_id||d.last_action_sequence!==s.sequence||d.primary_commit_id!==r.primary_commit_id||d.durability_ref!==r.durability_ref))fail();
    if(e.event_type==='comparison_viewed'&&!equal(d.trial_ids,s.comparison))fail();
    if(e.event_type==='help_used'&&(spec.engine_version!=='fixture-engine-2'||d.level!==s.help_level||!s.help_open||s.help_history.at(-1)?.action_id!==r.action_id))fail();
    if(e.event_type==='help_closed'&&(spec.engine_version!=='fixture-engine-2'||d.open!==false||s.help_open))fail();
    if(e.event_type==='side_thread_changed'&&(spec.engine_version!=='fixture-engine-2'||d.open!==s.side_thread_open))fail();
  }
}
function validateAction(action,s,spec){
  const keys={predict:['kind','prediction'],configure:['kind','configuration'],test:['kind','prediction_action_id','configuration_action_id'],compare:['kind','trial_ids'],help:['kind','level'],close_help:['kind'],side_thread:['kind','open']};
  if(!action||!Object.hasOwn(keys,action.kind))fail();exact(action,keys[action.kind]);
  if(action.kind==='predict'&&!predictions.includes(action.prediction))fail();
  if(action.kind==='configure'&&!configurations.includes(action.configuration))fail();
  if(action.kind==='test'&&(!s.prediction_action_id||!s.configuration_action_id||action.prediction_action_id!==s.prediction_action_id||action.configuration_action_id!==s.configuration_action_id))fail();
  if(action.kind==='compare'&&(!Array.isArray(action.trial_ids)||action.trial_ids.length!==2||action.trial_ids[0]===action.trial_ids[1]||action.trial_ids.some(id=>!s.trials.some(t=>t.trial_id===id))))fail();
  if(['help','close_help','side_thread'].includes(action.kind)&&spec.engine_version!=='fixture-engine-2')fail();
  if(action.kind==='help'&&![1,2,3].includes(action.level))fail();
  if(action.kind==='side_thread'&&typeof action.open!=='boolean')fail();
}
/** Bounded memory-only pending intent; request must return the actual HTTP status/body. */
export function createSavedPlayerClient(options){
  exact(options,Object.hasOwn(options??{},'newActionId')?['request','newActionId']:['request']);
  const {request,newActionId=()=>globalThis.crypto.randomUUID()}=options;
  if(typeof request!=='function'||typeof newActionId!=='function')fail();
  let state={phase:'idle',play_id:null,confirmed:null,adventure:null,history:[],pending_action_id:null,error:null,retryable:false};
  let selectedPlay=null;
  let operation=null,inFlight=false,lifecycle=0;
  const listeners=new Set(),pins=new Map(),issued=new Set();
  const snapshot=()=>frozen(structuredClone(state));
  const emit=patch=>{state={...state,...patch};for(const listener of listeners){try{listener(snapshot());}catch{/* Observers do not control receipts. */}}};
  function id(){const value=newActionId();if(!uuid(value)||issued.has(value))fail();issued.add(value);return value;}
  function clear(phase,error){operation=null;if(phase==='denied'){pins.clear();selectedPlay=null;}emit({phase,play_id:phase==='failed'?selectedPlay:null,confirmed:null,adventure:null,history:[],pending_action_id:null,error,retryable:false});}
  function acceptFull(body,op){
    exact(body,['mode','production_ready','adventure','result','history']);
    if(body.mode!=='local-synthetic'||body.production_ready!==false)fail();validateSpec(body.adventure);
    const r=body.result;
    if(op.kind==='open'&&op.body.play_id!==null&&r.play_id!==op.body.play_id)fail();
    if(op.kind==='replay'&&r.play_id===op.body.play_id)fail();
    validateReceipt(r,body.adventure,r.play_id);
    if(!Array.isArray(body.history)||!body.history.length)fail();
    const seen=new Set();
    for(const item of body.history){exact(item,['play_id','trial_count','incomplete']);if(!uuid(item.play_id)||seen.has(item.play_id)||item.incomplete!==true||!(item.trial_count===null||cursor(item.trial_count)))fail();seen.add(item.play_id);}
    if(!seen.has(r.play_id)||body.history.find(h=>h.play_id===r.play_id).trial_count!==r.checkpoint.state.trials.length)fail();
    const old=pins.get(r.play_id),pin={spec:body.adventure,epoch:r.checkpoint.state.consent_epoch,sequence:r.checkpoint.last_action_sequence,event:r.checkpoint.last_event_sequence};
    if(old&&(!equal(old.spec,pin.spec)||old.epoch!==pin.epoch||pin.sequence<old.sequence||pin.event<old.event))fail();
    pins.set(r.play_id,structuredClone(pin));
    selectedPlay=r.play_id;
    emit({phase:'ready',play_id:r.play_id,confirmed:structuredClone(r),adventure:structuredClone(body.adventure),history:structuredClone(body.history),pending_action_id:null,error:null,retryable:false});
  }
  function acceptAction(r,op){
    const prior=state.confirmed,s=prior.checkpoint.state;
    validateReceipt(r,state.adventure,op.body.play_id);
    if(r.action_id!==op.body.command.action_id||r.checkpoint.last_action_sequence!==s.sequence+1||r.checkpoint.state.consent_epoch!==s.consent_epoch
      ||r.checkpoint.last_event_sequence!==prior.checkpoint.last_event_sequence+(op.body.command.action.kind==='test'?2:1))fail();
    const next=r.checkpoint.state,a=op.body.command.action;
    const expectedType={predict:'prediction_recorded',configure:'configuration_committed',test:'test_resolved',compare:'comparison_viewed',help:'help_used',close_help:'help_closed',side_thread:'side_thread_changed'}[a.kind];
    if(r.events[0].event_type!==expectedType)fail();
    const expected=structuredClone(s);expected.sequence++;
    switch(a.kind){
      case 'predict':Object.assign(expected,{prediction:a.prediction,prediction_action_id:r.action_id,current_result:null});break;
      case 'configure':Object.assign(expected,{configuration:a.configuration,configuration_action_id:r.action_id,current_result:null});break;
      case 'test':{
        const t={trial_id:s.play_id+':trial:'+(s.trials.length+1),prediction:s.prediction,configuration:s.configuration,outcome:state.adventure.outcomes[s.configuration],prediction_action_id:s.prediction_action_id,configuration_action_id:s.configuration_action_id,test_action_id:r.action_id,action_sequence:s.sequence+1,play_id:s.play_id,revision_id:s.revision_id,pattern_version:s.pattern_version};
        Object.assign(expected,{trials:[...s.trials,t],current_result:t,prediction:null,configuration:null,prediction_action_id:null,configuration_action_id:null});break;
      }
      case 'compare':expected.comparison=a.trial_ids;break;
      case 'help':Object.assign(expected,{help_open:true,help_level:a.level,help_history:[...s.help_history,{level:a.level,action_id:r.action_id,sequence:s.sequence+1}]});break;
      case 'close_help':expected.help_open=false;break;
      case 'side_thread':expected.side_thread_open=a.open;break;
    }
    if(!equal(expected,next))fail();
    const pin=pins.get(s.play_id);if(!pin)fail();pin.sequence=next.sequence;pin.event=r.checkpoint.last_event_sequence;
    emit({phase:'ready',confirmed:structuredClone(r),history:state.history.map(h=>h.play_id===s.play_id?{...h,trial_count:next.trials.length}:h),pending_action_id:null,error:null,retryable:false});
  }
  async function run(op){
    if(inFlight)fail();inFlight=true;const generation=lifecycle;
    emit({phase:op.kind==='open'?'loading':'pending',pending_action_id:op.id,error:null,retryable:true});
    let response;
    try{response=await request(op.path,JSON.parse(op.bytes));}
    catch{if(generation===lifecycle)emit({phase:'failed',error:'Not confirmed. Keep this page open and Retry the original operation.'});return snapshot();}
    finally{inFlight=false;}
    if(generation!==lifecycle||operation!==op)return snapshot();
    if(response?.status===403){clear('denied','Access closed. This local fixture cannot disclose play content.');return snapshot();}
    if(response?.status===409){emit({phase:'conflict',error:'Conflict. Reload confirmed progress; the pending change will be discarded.',retryable:false});return snapshot();}
    if(response?.status===503){emit({phase:'pending',error:'Pending, not confirmed. Retry the original operation when the local server is available.'});return snapshot();}
    if(response?.status!==200){emit({phase:'failed',error:'Not confirmed. The request failed. Retry or reload confirmed progress.'});return snapshot();}
    try{if(op.kind==='action')acceptAction(response.body,op);else acceptFull(response.body,op);operation=null;}
    catch{clear('failed','Unsupported acknowledgement. Content unavailable; reload the original play.');}
    return snapshot();
  }
  function prepare(kind,path,body,actionId=null){const op={kind,path,body:frozen(structuredClone(body)),bytes:JSON.stringify(body),id:actionId};operation=op;return run(op);}
  async function open(playId=null){
    if(playId!==null&&!uuid(playId))fail();if(inFlight||operation)fail();
    selectedPlay=playId;
    lifecycle++;emit({play_id:playId,confirmed:null,adventure:null,history:[],pending_action_id:null,error:null,retryable:false});
    return prepare('open','/saved/open',{play_id:playId});
  }
  async function dispatch(action){
    if(inFlight||operation||state.phase!=='ready'||!state.confirmed)fail();
    const s=state.confirmed.checkpoint.state;validateAction(action,s,state.adventure);const actionId=id();
    return prepare('action','/saved/action',{play_id:s.play_id,command:{contract_version:'1.1.0',play_id:s.play_id,action_id:actionId,expected_sequence:s.sequence,consent_epoch:s.consent_epoch,revision_id:s.revision_id,pattern_version:s.pattern_version,action:structuredClone(action)}},actionId);
  }
  async function retry(){if(inFlight||!operation||!['failed','pending'].includes(state.phase))fail();return run(operation);}
  async function reload(){
    if(inFlight)fail();const playId=selectedPlay??state.play_id??operation?.body.play_id??null;
    // Caller must present the discard warning/choice before invoking this method.
    lifecycle++;operation=null;return prepare('open','/saved/open',{play_id:playId});
  }
  async function replay(){
    if(inFlight||operation||state.phase!=='ready'||!state.play_id)fail();const commandId=id();
    return prepare('replay','/saved/replay',{play_id:state.play_id,command_id:commandId},commandId);
  }
  function subscribe(listener){if(typeof listener!=='function')fail();listeners.add(listener);return()=>listeners.delete(listener);}
  return Object.freeze({snapshot,subscribe,open,dispatch,retry,reload,replay});
}
