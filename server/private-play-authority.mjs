// Local TEST only. Engineering 1.2 / ADR-E03/E04/E05:
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// No copied producer MACs, public review reentry, queue serializer or parent impersonation.
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
import {isSyntheticAdultAccess} from './adult-access.mjs';
import {isSyntheticPrivateBridgeFamilyAdapter} from './private-bridge.mjs';
import {canonical,exactObject,playError} from './play-journal.mjs';
const brands=new WeakMap();
export const isPrivatePlayAuthority=(value,db)=>brands.get(value)===db;
const first=async(tx,sql,args=[])=>(await tx.query(sql,args)).rows[0];
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=code=>{throw playError(code);};
const number=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)fail('recovery_required');return n;};
const same=(a,b)=>canonical(a)===canonical(b);
export const journeyUUID=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export const journeyViewContext=(actor,epoch)=>hash(JSON.stringify(['synthetic-family-space-v1',actor.adultId,actor.householdId,epoch,'TEST-v1']));
export function validateJourneySelection(value){
 exactObject(value,['view_context','child_id']);
 if(!journeyUUID(value.child_id)||typeof value.view_context!=='string'||!/^[0-9a-f]{64}$/.test(value.view_context))fail('validation_failed');
 return structuredClone(value);
}
// Caller must already hold its actual issuer/session authority. Household then consent;
// profiles are plain snapshot reads protected by the household fence, not later locks.
export async function readJourneySelection(tx,actor,input){
 const c=validateJourneySelection(input),h=actor.householdId;
 if(!await first(tx,'SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[h]))fail('denied');
 const consent=await first(tx,'SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[h]);
 if(!consent||consent.state!=='active'||consent.policy_version!=='TEST-v1')fail('denied');
 const epoch=number(consent.consent_epoch),profiles=(await tx.query('SELECT * FROM child_setup_profiles WHERE household_id=$1 ORDER BY child_id',[h])).rows;
 if(profiles.length>100||!profiles.some(p=>p.is_initial)||profiles.some(p=>number(p.consent_epoch)!==epoch))fail('denied');
 const p=profiles.find(p=>p.child_id===c.child_id),context=journeyViewContext(actor,epoch);
 if(!p||context!==c.view_context)fail('denied');
 return {household_id:h,adult_id:actor.adultId,child_id:p.child_id,consent_epoch:epoch,profile_version:number(p.current_version),view_context:context,profile:structuredClone(p.profile)};
}
/** Backend-only DB-branded adapter. bridge is the actual bridge.familyAdapter. */
export function createPrivatePlayAuthority({env,db,access,bridge,clock=Date.now}){
 resolveLoopConfig(env);
 if(!(db instanceof PGlite)||!isSyntheticAdultAccess(access,db)||!isSyntheticPrivateBridgeFamilyAdapter(bridge,db)||typeof clock!=='function')fail('validation_failed');
 const now=()=>{const n=clock();if(!Number.isSafeInteger(n)||n<0||n>253402300799999)fail('recovery_required');return n;};now();
 async function parent(tx,token,scope){
  const actor=await access.requireSessionInTransaction(tx,token);
  if(actor.householdId!==scope.household_id)fail('denied');
  return actor;
 }
 // Snapshot reads only: never acquire adult issuer/account/session locks here.
 // The actual founder issuer's stored role, enabled flag, revocation and expiry apply.
 async function founder(tx,token){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||Buffer.from(token,'base64url').toString('base64url')!==token)fail('denied');
  const row=await first(tx,'SELECT i.identity_id,i.role,i.enabled,s.expires_at,s.revoked_at FROM founder_sessions s JOIN founder_identities i USING(identity_id) WHERE s.token_hash=$1',[hash(token)]);
  if(!row?.enabled||row.role!=='founder'||row.revoked_at||now()>=new Date(row.expires_at).getTime())fail('denied');
  return {identityId:row.identity_id,role:'founder'};
 }
 async function active(tx,h,epoch){
  if(!await first(tx,'SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[h]))fail('denied');
  const c=await first(tx,'SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[h]);
  if(!c||c.state!=='active'||c.policy_version!=='TEST-v1'||epoch!==undefined&&number(c.consent_epoch)!==epoch)fail('denied');
  return number(c.consent_epoch);
 }
 async function initial(tx,s){
  const row=await first(tx,'SELECT * FROM journey_play_bindings WHERE household_id=$1 AND assignment_id=$2',[s.household_id,s.assignment_id]);
  if(!row)return undefined;
  exactObject(row,['household_id','assignment_id','child_id','revision_id','consent_epoch','profile_version','play_id','start_command_id','started_at']);
  if(['household_id','assignment_id','child_id','revision_id','play_id','start_command_id'].some(k=>!journeyUUID(row[k])))fail('recovery_required');
  const ms=row.started_at instanceof Date?row.started_at.getTime():typeof row.started_at==='string'?Date.parse(row.started_at):NaN;
  if(!Number.isSafeInteger(ms)||ms<0||ms>253402300799999)fail('recovery_required');
  const started_at=new Date(ms).toISOString();if(typeof row.started_at==='string'&&row.started_at!==started_at)fail('recovery_required');
  // Normalize ONLY the trusted driver's persisted timestamp/integer columns.
  // The strict journal canonicalizer and all JSON payload validation stay unchanged.
  return {...row,consent_epoch:number(row.consent_epoch),profile_version:number(row.profile_version),started_at};
 }
 async function load(tx,s,adultId,lock){
  const h=s.household_id;
  const hint=await first(tx,'SELECT request_id FROM assignments WHERE household_id=$1 AND assignment_id=$2',[h,s.assignment_id]);
  if(!hint)fail('denied');
  const suffix=lock?' FOR UPDATE':'';
  const request=await first(tx,'SELECT * FROM wonder_requests WHERE household_id=$1 AND request_id=$2'+suffix,[h,hint.request_id]);
  const revision=await first(tx,'SELECT * FROM adventure_revisions WHERE household_id=$1 AND revision_id=$2'+suffix,[h,s.revision_id]);
  const assignment=await first(tx,'SELECT * FROM assignments WHERE household_id=$1 AND assignment_id=$2'+suffix,[h,s.assignment_id]);
  const p=await first(tx,'SELECT * FROM child_setup_profiles WHERE household_id=$1 AND child_id=$2',[h,s.child_id]);
  if(!request||request.child_id!==s.child_id||!revision||revision.request_id!==request.request_id||revision.status!=='published'
   ||!assignment||assignment.request_id!==request.request_id||assignment.child_id!==s.child_id||assignment.revision_id!==s.revision_id
   ||!p||number(p.consent_epoch)!==s.consent_epoch)fail('denied');
  // adult_id is required by the bridge's structural descriptor. For founder reads
  // it is the profile's actual created_by provenance, never a founder-as-parent actor.
  const descriptor={household_id:h,adult_id:adultId??p.created_by,child_id:s.child_id,consent_epoch:s.consent_epoch,profile_version:number(p.current_version)};
  const state=await bridge.inspectRequest(tx,descriptor,{request_id:request.request_id});
  if(state.ownership!=='bridge'||state.assignment_id!==s.assignment_id||state.revision_id!==s.revision_id)fail('denied');
  if(state.state!=='available')fail(state.state==='pending'?'journal_unavailable':'denied');
  const spec=await bridge.readRevision(tx,descriptor,{household_id:h,request_id:request.request_id,revision_id:s.revision_id,source_scope_version:number(revision.source_scope_version),pattern_version:revision.pattern_version,engine_version:revision.engine_version,payload_ref:revision.payload_ref});
  const entry={household_id:h,revision_id:s.revision_id,spec,starting_path:p.profile.starting_path,starting_reason:p.profile.reason};
  const bound=await initial(tx,s);
  if(bound&&(['child_id','revision_id'].some(k=>bound[k]!==s[k])||number(bound.consent_epoch)!==s.consent_epoch||number(bound.profile_version)!==number(p.current_version)))fail('denied');
  return {scope:{household_id:h,child_id:s.child_id,assignment_id:s.assignment_id,revision_id:s.revision_id,consent_epoch:s.consent_epoch},request_id:request.request_id,entry,initial:bound??null,profile_version:number(p.current_version)};
 }
 async function acquire(tx,actor,selection,ids){
  const selected=await readJourneySelection(tx,actor,selection);
  const loaded=await load(tx,{...selected,assignment_id:ids.assignment_id,revision_id:ids.revision_id},actor.adultId,true);
  return {...loaded,view_context:selected.view_context};
 }
 async function acquireScope(tx,actor,s){
  if(actor.householdId!==s.household_id)fail('denied');
  const out=await acquire(tx,actor,{view_context:journeyViewContext(actor,s.consent_epoch),child_id:s.child_id},s);
  if(out.scope.consent_epoch!==s.consent_epoch||!out.initial||out.initial.play_id!==s.play_id)fail('denied');
  return out;
 }
 async function acquireFounder(tx,token,input){
  const actor=await founder(tx,token),epoch=await active(tx,input.household_id);
  const out=await load(tx,{...input,consent_epoch:epoch},null,true);
  if(out.request_id!==input.request_id)fail('denied');
  if((await founder(tx,token)).identityId!==actor.identityId)fail('denied');
  return out;
 }
 async function assert(tx,s,entry,actor){
  const out=await load(tx,s,actor.role==='founder'?null:actor.adultId,false);
  if(!same(entry,out.entry))fail('denied');
 }
 async function bindInitial(tx,s,c){
  const p=await first(tx,'SELECT current_version,consent_epoch FROM child_setup_profiles WHERE household_id=$1 AND child_id=$2',[s.household_id,s.child_id]);
  if(!p||number(p.consent_epoch)!==s.consent_epoch)fail('denied');
  await tx.query('INSERT INTO journey_play_bindings(household_id,assignment_id,child_id,revision_id,consent_epoch,profile_version,play_id,start_command_id,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[s.household_id,s.assignment_id,s.child_id,s.revision_id,s.consent_epoch,number(p.current_version),s.play_id,c.command_id,new Date(now()).toISOString()]);
 }
 const adapter=Object.freeze({transaction:work=>access.ownTransaction(work),parent,founder,assert,initial,bindInitial,acquire,acquireScope,acquireFounder,selection:readJourneySelection});
 brands.set(adapter,db);return adapter;
}
