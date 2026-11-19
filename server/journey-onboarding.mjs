// Automatic LOCAL TEST trial after actual consent + successful first-child setup.
// Engineering 1.2 SHA256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// Eight / 24h is an invented fixture, not the public offer or eligibility policy.
import {createHash} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
import {isSyntheticAdultAccess} from './adult-access.mjs';
import {journeyViewContext,readJourneySelection,validateJourneySelection} from './private-play-authority.mjs';
import {playError} from './play-journal.mjs';
const policy=Object.freeze({synthetic:true,policy_version:'TEST-JOURNEY-TRIAL-v1',allowance:8,duration_seconds:86400,allocation_scope:'household'});
const first=async(tx,sql,args=[])=>(await tx.query(sql,args)).rows[0];
const fail=code=>{throw Object.assign(playError(code),{status:{denied:403,conflict:409,validation_failed:400}[code]??503});};
function entitlementId(h){const bytes=createHash('sha256').update('local-test-journey-trial-v1\0'+h).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const s=bytes.toString('hex');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);}
export async function createJourneyOnboarding({env,db,access,setup,kernel,clock=Date.now}){
 resolveLoopConfig(env);
 if(!isSyntheticAdultAccess(access,db)||typeof setup?.status!=='function'||typeof setup?.save!=='function'||typeof kernel?.activateTrial!=='function'||typeof clock!=='function')fail('validation_failed');
 if((await db.query('SELECT version FROM schema_migrations WHERE version=17')).rows.length!==1)fail('recovery_required');
 const now=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<0||n>253402300799999)fail('recovery_required');return n;};now();
 async function ensure(tx,actor,selection){
  const s=await readJourneySelection(tx,actor,selection),h=actor.householdId;
  const initial=await first(tx,'SELECT * FROM child_setup_profiles WHERE household_id=$1 AND is_initial=true',[h]);
  // Require the real setup command/version history, not just a child row.
  const saved=initial&&await first(tx,"SELECT command_id FROM child_setup_commands WHERE household_id=$1 AND child_id=$2 AND operation='create' AND result->'child'->>'is_initial'='true'",[h,initial.child_id]);
  if(!initial||!saved||Number(initial.consent_epoch)!==s.consent_epoch)fail('denied');
  const entitlement_id=entitlementId(h),activation_id='local-test-journey-trial-v1:'+h;
  await tx.query('INSERT INTO entitlements(household_id,entitlement_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[h,entitlement_id]);
  const result=await kernel.activateTrial(tx,{household_id:h,consent_epoch:s.consent_epoch},{command_id:activation_id,entitlement_id},policy);
  if(result.uncommitted!==true||result.policy_version!==policy.policy_version||result.allowance!==8)fail('recovery_required');
  // Internal uncommitted:true never crosses the committed access transaction.
  return {status:'journey_trial',mode:'local-synthetic',production_ready:false,test_only:true,state:now()>=Date.parse(result.trial_end)?'expired':'active',activation_id,entitlement_id,period_id:result.period_id,policy_version:result.policy_version,allowance:result.allowance,trial_start:result.trial_start,trial_end:result.trial_end};
 }
 async function ensureTrial(token,input){
  const c=validateJourneySelection(input);
  return access.withSession(token,(tx,actor)=>ensure(tx,actor,c));
 }
 async function save(token,input){
  const result=await setup.save(token,input);
  if(result.status!=='child_saved')fail('recovery_required');
  // BOTH a fresh save and an exact replay reach this hook. If activation fails,
  // setup remains committed and its same original command can safely retry.
  await access.withSession(token,async(tx,actor)=>{
   const c=await first(tx,'SELECT consent_epoch,state,policy_version FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[actor.householdId]);
   if(!c||c.state!=='active'||c.policy_version!=='TEST-v1')fail('denied');
   return ensure(tx,actor,{view_context:journeyViewContext(actor,Number(c.consent_epoch)),child_id:result.child.child_id});
  });
  return result;
 }
 return Object.freeze({status:token=>setup.status(token),save,ensureTrial});
}
