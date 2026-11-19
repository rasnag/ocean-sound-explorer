// Founder-only TEST readiness and verified read-only activity. No parent credentials.
// Engineering 1.2 SHA256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
import {createHash} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
import {ownData} from './continuation-journal.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const fail=code=>{throw Object.assign(new Error('Local TEST journey unavailable.'),{code,status:{validation_failed:400,denied:403,conflict:409}[code]??503});};
const first=async(tx,q,a=[])=>(await tx.query(q,a)).rows[0];
const base={mode:'local-synthetic',production_ready:false};
export async function createJourneyFounder({env,db,auth,review,bridge,play,clock=Date.now}){
 resolveLoopConfig(env);
 function scope(input,extra=[]){const s=ownData(input,['household_id','request_id','scope_version',...extra]);if(!uuid(s.household_id)||!uuid(s.request_id)||!Number.isSafeInteger(s.scope_version)||s.scope_version<1||extra.some(k=>!uuid(s[k])))fail('validation_failed');return structuredClone(s);}
 async function fence(token,s){
  const actor=await auth.requireFounder(token);
  return db.transaction(async tx=>{
   await tx.query('SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[s.household_id]);
   const c=await first(tx,'SELECT consent_epoch,state,policy_version FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[s.household_id]);
   const w=await first(tx,'SELECT child_id FROM wonder_requests WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[s.household_id,s.request_id]);
   const p=w&&await first(tx,'SELECT current_version,consent_epoch FROM child_setup_profiles WHERE household_id=$1 AND child_id=$2',[s.household_id,w.child_id]);
   const session=await first(tx,'SELECT i.identity_id,i.enabled,i.role,s.revoked_at,s.expires_at FROM founder_sessions s JOIN founder_identities i USING(identity_id) WHERE s.token_hash=$1',[createHash('sha256').update(token).digest('hex')]);
   if(!c||c.state!=='active'||c.policy_version!=='TEST-v1'||!w||!p||Number(p.consent_epoch)!==Number(c.consent_epoch)||!session?.enabled||session.identity_id!==actor.identityId||session.role!=='founder'||session.revoked_at||clock()>=new Date(session.expires_at).getTime())fail('denied');
   return {actor:actor.identityId,child:w.child_id,epoch:Number(c.consent_epoch),profile:Number(p.current_version)};
  });
 }
 async function guarded(token,s,work){const before=await fence(token,s),result=await work(before),after=await fence(token,s);if(JSON.stringify(before)!==JSON.stringify(after))fail('denied');return result;}
 async function binding(s){return first(db,'SELECT b.*,c.scope_version FROM private_bridge_bindings b JOIN private_bridge_commands c USING(household_id,command_id,request_id) WHERE b.household_id=$1 AND b.request_id=$2',[s.household_id,s.request_id]);}
 async function list(token,input){ownData(input,[]);await auth.requireFounder(token);const result=await review.list(token,{});await auth.requireFounder(token);return {...base,status:'journey_list',requests:result.requests};}
 async function read(token,input){const s=scope(input);return guarded(token,s,async a=>{const view=await review.read(token,s),b=await binding(s);const ready=b?await bridge.status(token,{...s,command_id:b.command_id}):null;return {...base,status:'journey_founder',scope:s,review:view,ready,activity_input:b?{household_id:s.household_id,request_id:s.request_id,child_id:a.child,assignment_id:b.assignment_id,revision_id:b.revision_id}:null};});}
 async function ready(token,input){
  const v=scope(input,['snapshot_id','command_id']),s={household_id:v.household_id,request_id:v.request_id,scope_version:v.scope_version};
  return guarded(token,s,async()=>{
   const prior=await bridge.status(token,{...s,command_id:v.command_id});
   if(prior.status!=='bridge_command_absent'){
    const b=await binding(s);
    // An absent/not-yet-visible projection is uncertainty, not a changed command.
    // The bridge still authenticates the original command/history on reconcile.
    if(b&&(b.command_id!==v.command_id||b.snapshot_id!==v.snapshot_id||Number(b.scope_version)!==s.scope_version))fail('conflict');
    return bridge.reconcile(token,{...s,command_id:v.command_id});
   }
   const acquired=await review.acquireBridgeSource(token,{...s,snapshot_id:v.snapshot_id});return bridge.makeReady(token,{...s,command:{command_id:v.command_id,expected_version:0,action:'MakeAssignmentReady',source:acquired.pin}});
  });
 }
 async function recover(token,input,write){const v=scope(input,['command_id']),s={household_id:v.household_id,request_id:v.request_id,scope_version:v.scope_version};return guarded(token,s,()=>bridge[write?'reconcile':'status'](token,v));}
 async function activity(token,input){ownData(input,['household_id','request_id','child_id','assignment_id','revision_id']);if(Object.values(input).some(v=>!uuid(v)))fail('validation_failed');await auth.requireFounder(token);const result=await play.founderHistory(token,structuredClone(input));await auth.requireFounder(token);return result;}
 return Object.freeze({list,read,ready,status:(t,v)=>recover(t,v,false),reconcile:(t,v)=>recover(t,v,true),activity});
}
