// PLAYABLE-JOURNEY-LOCAL-01 BUILD1. Backend API; no HTTP routes or raw capability port.
// Engineering 1.2 SHA256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
import {randomUUID} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
import {createSyntheticPlayService,validateSyntheticPlayScope} from './play-service.mjs';
import {createPrivatePlayAuthority,journeyUUID,validateJourneySelection} from './private-play-authority.mjs';
import {canonical,exactObject,playError,isSyntheticPlayJournal} from './play-journal.mjs';
const fail=code=>{throw playError(code);};
const base={mode:'local-synthetic',production_ready:false};
const first=async(tx,sql,args=[])=>(await tx.query(sql,args)).rows[0];
const same=(a,b)=>canonical(a)===canonical(b);
function request(input,kind){
 const keys=['view_context','child_id','assignment_id','revision_id',kind==='start'?'command_id':'play_id',...(kind==='action'?['command']:[])];
 exactObject(input,keys);
 validateJourneySelection({view_context:input.view_context,child_id:input.child_id});
 if(keys.filter(k=>k.endsWith('_id')).some(k=>!journeyUUID(input[k])))fail('validation_failed');
 canonical(input);return structuredClone(input);
}
const boundary=fn=>async(...args)=>{try{return await fn(...args);}catch(e){const code=['validation_failed','denied','conflict','journal_unavailable','recovery_required'].includes(e?.code)?e.code:[401,403].includes(e?.status)?'denied':'recovery_required';throw Object.assign(playError(code),{status:{validation_failed:400,denied:403,conflict:409}[code]??503});}};
/**
 * context(token,{view_context,child_id}) is read-only.
 * start(token,{view_context,child_id,assignment_id,revision_id,command_id}) returns
 * {status:journey_started|journey_pending,mode,production_ready,assignment_id,
 * revision_id,play_id,result}. Only journey_started authorizes a UI mount.
 * open/action take the exact same selection and binding plus play_id; action adds
 * command. open returns the accepted five-key saved envelope; action the raw receipt.
 * familyPlay methods take an optional THIRD current adult credential; never nest a
 * raw operation inside withSession. founderHistory uses ONLY a real founder token.
 */
export async function createSyntheticJourneyPlay({env,db,access,bridge,journal,clock=Date.now}){
 resolveLoopConfig(env);
 const authority=createPrivatePlayAuthority({env,db,access,bridge,clock});
 if(!isSyntheticPlayJournal(journal)||(await db.query('SELECT version FROM schema_migrations WHERE version=17')).rows.length!==1)fail('validation_failed');
 const services=new Map();
 function service(acquired){
  const key=acquired.scope.household_id+':'+acquired.scope.revision_id,old=services.get(key);
  if(old){if(!same(old.entry,acquired.entry))fail('denied');return old.raw;}
  const raw=createSyntheticPlayService({env,db,catalog:[acquired.entry],journal,clock,privateAuthority:authority});
  services.set(key,{entry:structuredClone(acquired.entry),raw});return raw;
 }
 const selection=c=>({view_context:c.view_context,child_id:c.child_id});
 async function acquire(token,c){return access.withSession(token,async(tx,actor)=>{
  const out=await authority.acquire(tx,actor,selection(c),c);
  if(c.command_id){
   const prior=await first(tx,'SELECT play_id FROM play_start_commands WHERE household_id=$1 AND command_id=$2',[actor.householdId,c.command_id]);
   if(prior&&(!out.initial||prior.play_id!==out.initial.play_id))fail('conflict');
  }
  if(c.play_id&&(!out.initial||out.initial.play_id!==c.play_id))fail('denied');
  return out;
 });}
 function scope(a){if(!a.initial)fail('denied');return validateSyntheticPlayScope({...a.scope,play_id:a.initial.play_id});}
 const resumeInput=s=>({play_id:s.play_id,revision_id:s.revision_id,consent_epoch:s.consent_epoch});
 async function recovered(a,token){const s=scope(a),raw=service(a);let result=await raw.resume(s,resumeInput(s),token);if(result.status!=='acknowledged')result=await raw.reconcile(s,token);return result;}
 async function current(token,c,a,result){
  const after=await acquire(token,c);
  if(!same(after.scope,a.scope)||!same(after.entry,a.entry)||after.initial?.play_id!==result.play_id)fail('denied');
  return after;
 }
 async function context(token,input){
  const c=validateJourneySelection(input);
  return access.withSession(token,async(tx,actor)=>{const s=await authority.selection(tx,actor,c);return {...base,status:'journey_context',available:true,view_context:s.view_context,child_id:s.child_id,profile_version:s.profile_version};});
 }
 async function start(token,input){
  const c=request(input,'start');let a=await acquire(token,c),result;
  if(a.initial)result=await recovered(a,token);
  else{
   const s={...a.scope,play_id:randomUUID()},command={contract_version:'1.1.0',command_id:c.command_id,play_id:s.play_id,consent_epoch:s.consent_epoch,revision_id:s.revision_id,pattern_version:a.entry.spec.pattern_version,engine_version:a.entry.spec.engine_version};
   try{result=await service(a).start(s,command,token);}
   catch(e){
    if(e?.code!=='conflict')throw e;
    // Another explicit click won. No second Start: recover its durable identity.
    a=await acquire(token,c);if(!a.initial)throw e;result=await recovered(a,token);
   }
  }
  await current(token,c,a,result);
  return {...base,status:result.status==='acknowledged'?'journey_started':'journey_pending',assignment_id:c.assignment_id,revision_id:c.revision_id,play_id:result.play_id,result};
 }
 async function open(token,input){
  const c=request(input,'open'),a=await acquire(token,c),result=await recovered(a,token);
  await current(token,c,a,result);
  if(result.status!=='acknowledged')fail('journal_unavailable');
  return {...base,adventure:structuredClone(a.entry.spec),result,history:[{play_id:result.play_id,trial_count:result.checkpoint.state.trials.length,incomplete:true}]};
 }
 async function action(token,input){
  const c=request(input,'action'),a=await acquire(token,c),result=await service(a).commit(scope(a),c.command,token);
  await current(token,c,a,result);return result;
 }
 async function familyAcquire(s,token){
  const checked=validateSyntheticPlayScope(s);
  return access.withSession(token,(tx,actor)=>authority.acquireScope(tx,actor,checked));
 }
 const familyPlay=Object.freeze({
  resume:boundary(async(s,input,token)=>{const a=await familyAcquire(s,token);return service(a).resume(scope(a),input,token);}),
  reconcile:boundary(async(s,token)=>{const a=await familyAcquire(s,token);return service(a).reconcile(scope(a),token);}),
 });
 async function founderHistory(token,input){
  exactObject(input,['household_id','request_id','child_id','assignment_id','revision_id']);
  if(Object.values(input).some(v=>!journeyUUID(v)))fail('validation_failed');
  const c=structuredClone(input),a=await db.transaction(tx=>authority.acquireFounder(tx,token,c));
  if(!a.initial)return {...base,status:'journey_activity',household_id:c.household_id,request_id:c.request_id,child_id:c.child_id,assignment_id:c.assignment_id,revision_id:c.revision_id,play_id:null,state:'no_activity',events:[],pending:[],incomplete:true,start_at:null,start_time_source:'unavailable',timestamp_provenance:'SERVER-ACCEPTED',watermark:{action_sequence:0,event_sequence:0},help:'unavailable_for_this_toy_pattern'};
  const result=await service(a).verifiedFounderHistory(scope(a),token);
  const after=await db.transaction(tx=>authority.acquireFounder(tx,token,c));
  if(!same(a.scope,after.scope)||!same(a.entry,after.entry)||!same(a.initial,after.initial))fail('denied');
  return {...result,request_id:c.request_id};
 }
 return Object.freeze({context:boundary(context),start:boundary(start),open:boundary(open),action:boundary(action),familyPlay,founderHistory:boundary(founderHistory)});
}
