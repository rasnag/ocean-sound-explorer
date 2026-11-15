// AUTHORED CHECKS: NOT RUN BY THE AUTHOR.
// Backend producer compositions below are NOT the empty-store HTTP/final-journey proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../db/migrate.mjs';
import {privateBridgeFixture} from './private-bridge-fixture.mjs';
import {readyReviewRequest,recordAll,reviewRead,reviewCommand} from './loop-review-service.test.mjs';
import {draftCommand} from './loop-generation-service.test.mjs';
import {createSyntheticPlayJournal} from '../server/play-journal.mjs';
import {createSyntheticPlayService} from '../server/play-service.mjs';
import {createPrivatePlayAuthority} from '../server/private-play-authority.mjs';
import {createSyntheticJourneyPlay} from '../server/journey-play.mjs';
import {createJourneyOnboarding} from '../server/journey-onboarding.mjs';
import {createSyntheticAdultAccess} from '../server/adult-access.mjs';
import {createSyntheticConsentService} from '../server/consent-service.mjs';
import {createSyntheticChildSetup} from '../server/child-setup.mjs';
import {createEntitlementKernel} from '../lib/loop/entitlements.mjs';
import {createSavedPlayerClient} from '../lib/loop/saved-player.mjs';
const env={LOOP_ENV:'local-synthetic'};
const first=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0];
const denied=e=>e?.code==='denied'||e?.status===403;
const count=async(db,table)=>Number((await first(db,'SELECT count(*) n FROM '+table)).n);
async function producer(f,words='Invented original question about a tipping boat.'){
 const s=await readyReviewRequest(f,words);await recordAll(f,s,'Invented deliberate TEST checklist; no human/factual endorsement.');
 const v=await reviewRead(f,s);await f.review.command(f.founderToken,reviewCommand(s,v,'ReleaseTestSnapshot',{predecessor_snapshot_id:null}));
 const view=await reviewRead(f,s),snapshot=view.snapshots.find(x=>x.revision_id===view.revision.revision_id);
 const source=await f.review.acquireBridgeSource(f.founderToken,{...s,snapshot_id:snapshot.snapshot_id});
 const ready=await f.bridge.makeReady(f.founderToken,{...s,command:{command_id:randomUUID(),expected_version:0,action:'MakeAssignmentReady',source:source.pin}});
 assert.equal(ready.status,'acknowledged');return {scope:s,snapshot,ready,words};
}
async function fixture(t){
 const f=await privateBridgeFixture(t),directory=await mkdtemp(join(tmpdir(),'loop-journey-play-'));
 let journal,journey,hook=null,outage=false;
 const options=()=>({env,db:f.db,access:f.access,bridge:f.bridge.familyAdapter,journal,clock:f.clock});
 async function reopen(){await journal?.close();journal=await createSyntheticPlayJournal({env,directory,testHooks:{beforeAppend:async record=>{if(hook){const fn=hook;hook=null;await fn(record);}if(outage)throw Error('Invented journal outage');}}});journey=await createSyntheticJourneyPlay(options());}
 f.cleanup(async()=>{await journal?.close();await rm(directory,{recursive:true,force:true});});await reopen();
 return {...f,get bridge(){return f.bridge;},get journey(){return journey;},get journal(){return journal;},reopenPlay:reopen,beforeAppend:fn=>{hook=fn;},playOutage:v=>{outage=v;},options,
  async ready(words){return producer(f,words);},
  body(x,child=f.children[0]){const s=f.selection(child);return {view_context:s.view_context,child_id:s.child_id,assignment_id:x.ready.assignment_id,revision_id:x.ready.revision_id};},
  founderInput(x){return {household_id:f.adult.householdId,request_id:x.scope.request_id,child_id:f.children[0].child_id,assignment_id:x.ready.assignment_id,revision_id:x.ready.revision_id};},
  raw(x,authority){return createSyntheticPlayService({env,db:f.db,journal,clock:f.clock,catalog:[{household_id:f.adult.householdId,revision_id:x.snapshot.revision_id,spec:x.snapshot.adventure,starting_path:f.children[0].profile.starting_path,starting_reason:f.children[0].profile.reason}],...(authority?{privateAuthority:authority}:{})});},
 };
}
const scope=(f,x,play_id)=>({household_id:f.adult.householdId,child_id:f.children[0].child_id,assignment_id:x.ready.assignment_id,revision_id:x.ready.revision_id,consent_epoch:1,play_id});
const startCommand=s=>({contract_version:'1.1.0',command_id:randomUUID(),play_id:s.play_id,consent_epoch:s.consent_epoch,revision_id:s.revision_id,pattern_version:'fixture-1',engine_version:'fixture-engine-1'});
const actionCommand=(s,sequence,action)=>({contract_version:'1.1.0',play_id:s.play_id,action_id:randomUUID(),expected_sequence:sequence,consent_epoch:s.consent_epoch,revision_id:s.revision_id,pattern_version:'fixture-1',action});
async function playRows(db){const result={};for(const table of ['journey_play_bindings','play_sessions','play_start_commands','play_action_commands','play_events','play_checkpoints'])result[table]=(await db.query('SELECT to_jsonb(t) value FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;return result;}
async function corrected(f){const s=await f.setup.status(f.adult.sessionToken),c=s.children.find(c=>c.child_id===f.children[0].child_id);return f.setup.save(f.adult.sessionToken,{command_id:randomUUID(),setup_context:s.setup_context,operation:'correct',child_id:c.child_id,expected_profile_version:c.profile_version,profile:{nickname:'Invented Revised',age:7,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}});}

test('journey: real producer source, read-only context/introduction and raw private bypass denial',async t=>{
 const f=await fixture(t),x=await f.ready(),body=f.body(x),token=f.adult.sessionToken;
 assert.equal((await f.journey.context(token,{view_context:body.view_context,child_id:body.child_id})).available,true);
 assert.equal((await f.family.open(token,{...body,entry_kind:'assignment'})).state,'introduction');
 const s=scope(f,x,randomUUID()),c=startCommand(s),raw=f.raw(x),before=await playRows(f.db);
 await assert.rejects(()=>raw.start(s,c),denied);
 await assert.rejects(()=>raw.start(s,c,token),denied);
 const authority=createPrivatePlayAuthority({...f.options(),bridge:f.bridge.familyAdapter});
 await assert.rejects(()=>f.raw(x,authority).start(s,c),denied);
 await assert.rejects(()=>f.journey.start(null,{...body,command_id:randomUUID()}),denied);
 await assert.rejects(()=>f.access.requireSessionInTransaction({query:()=>{}},token),denied);
 await assert.rejects(()=>f.db.transaction(tx=>f.access.requireSessionInTransaction(tx,token)),denied);
 await assert.rejects(()=>createSyntheticJourneyPlay({...f.options(),access:{...f.access}}));
 assert.throws(()=>createPrivatePlayAuthority({...f.options(),bridge:{...f.bridge.familyAdapter}}));
 const foreign=new PGlite();await foreign.waitReady;t.after(()=>foreign.close());
 assert.throws(()=>createPrivatePlayAuthority({...f.options(),db:foreign}));
 assert.deepEqual(await playRows(f.db),before);
});

test('journey: atomic original Start, concurrent clicks, lost reply, exact saved transport and one trial',async t=>{
 const f=await fixture(t),x=await f.ready(),body=f.body(x),token=f.adult.sessionToken,id=randomUUID();
 const before=await first(f.db,'SELECT original_received_at,original_due_at FROM production_receipts WHERE request_id=$1',[x.scope.request_id]);
 const replies=await Promise.all([f.journey.start(token,{...body,command_id:id}),f.journey.start(token,{...body,command_id:randomUUID()})]);
 assert.equal(replies[0].play_id,replies[1].play_id);assert.equal(replies[0].status,'journey_started');
 const started=await f.journey.start(token,{...body,command_id:id}),s=scope(f,x,started.play_id);
 assert.equal(started.play_id,replies[0].play_id);assert.equal(await count(f.db,'journey_play_bindings'),1);assert.equal(await count(f.db,'play_start_commands'),1);
 const request=async(path,payload)=>{try{return {status:200,body:path==='/saved/open'?await f.journey.open(token,{...body,play_id:payload.play_id}):await f.journey.action(token,{...body,...payload})};}catch(e){return {status:e.status??503,body:{error:'Unavailable'}};}};
 const client=createSavedPlayerClient({request});await client.open(started.play_id);assert.equal(client.snapshot().phase,'ready');
 await client.dispatch({kind:'predict',prediction:'tips'});await client.dispatch({kind:'configure',configuration:'offset'});
 const previous=client.snapshot().confirmed.checkpoint.state;
 await client.dispatch({kind:'test',prediction_action_id:previous.prediction_action_id,configuration_action_id:previous.configuration_action_id});
 assert.equal(client.snapshot().confirmed.checkpoint.state.trials.length,1);
 const saved=client.snapshot().confirmed;
 await f.reopenPlay();const reopened=await f.journey.open(token,{...body,play_id:s.play_id});assert.deepEqual(reopened.result,saved);
 assert.deepEqual(reopened.history,[{play_id:s.play_id,trial_count:1,incomplete:true}]);
 const events=(await f.db.query('SELECT payload FROM play_events ORDER BY sequence')).rows.flatMap(r=>r.payload.events);
 const timeline=await f.journey.founderHistory(f.founderToken,f.founderInput(x));assert.deepEqual(timeline.events,events);
 assert.equal(timeline.timestamp_provenance,'SERVER-ACCEPTED');assert.equal(timeline.watermark.action_sequence,3);assert.equal(timeline.watermark.event_sequence,4);
 assert.equal(timeline.help,'unavailable_for_this_toy_pattern');assert.equal(timeline.start_time_source,'owning-Start-transaction');assert(timeline.incomplete);
 assert.deepEqual(await first(f.db,'SELECT original_received_at,original_due_at FROM production_receipts WHERE request_id=$1',[x.scope.request_id]),before);
 assert.equal(await count(f.db,'entitlement_claims'),1);assert.equal((await first(f.db,'SELECT state FROM entitlement_claims')).state,'consumed');
});

test('journey: primary failure cannot commit a binding alone; original pending Start recovers once',async t=>{
 const f=await fixture(t),x=await f.ready(),body=f.body(x),token=f.adult.sessionToken,id=randomUUID();
 await f.db.exec("CREATE FUNCTION journey_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Invented binding failure'; END $$; CREATE TRIGGER journey_test_fault BEFORE INSERT ON journey_play_bindings FOR EACH ROW EXECUTE FUNCTION journey_test_fault()");
 await assert.rejects(()=>f.journey.start(token,{...body,command_id:id}));
 for(const table of ['play_sessions','play_start_commands','play_checkpoints','journey_play_bindings'])assert.equal(await count(f.db,table),0);
 await f.db.exec('DROP TRIGGER journey_test_fault ON journey_play_bindings; DROP FUNCTION journey_test_fault()');
 f.playOutage(true);const pending=await f.journey.start(token,{...body,command_id:id});assert.equal(pending.status,'journey_pending');
 const original=await first(f.db,'SELECT * FROM play_start_commands'),bound=await first(f.db,'SELECT * FROM journey_play_bindings');
 const before=await playRows(f.db),timeline=await f.journey.founderHistory(f.founderToken,f.founderInput(x));
 assert.equal(timeline.state,'pending_confirmation');assert.deepEqual(timeline.events,[]);assert.equal(timeline.start_at,null);assert.deepEqual(await playRows(f.db),before);
 f.playOutage(false);await f.reopenPlay();const recovered=await f.journey.start(token,{...body,command_id:id});assert.equal(recovered.status,'journey_started');assert.equal(recovered.play_id,pending.play_id);
 assert.equal((await first(f.db,'SELECT * FROM play_start_commands')).command_id,original.command_id);assert.deepEqual(await first(f.db,'SELECT * FROM journey_play_bindings'),bound);
 assert.equal(await count(f.db,'play_start_commands'),1);
});

test('journey: strict selected scope, existing-play requirement and reused command conflict',async t=>{
 const f=await fixture(t),x=await f.ready(),body=f.body(x),token=f.adult.sessionToken,id=randomUUID();
 const start=await f.journey.start(token,{...body,command_id:id}),before=await playRows(f.db);
 for(const patch of [{child_id:f.children[1].child_id},{revision_id:randomUUID()},{assignment_id:randomUUID()},{view_context:'0'.repeat(64)}])await assert.rejects(()=>f.journey.open(token,{...body,play_id:start.play_id,...patch}),denied);
 for(const patch of [{play_id:null},{household_id:f.adult.householdId},{consent_epoch:1}])await assert.rejects(()=>f.journey.open(token,{...body,play_id:start.play_id,...patch}),e=>e.code==='validation_failed');
 await assert.rejects(()=>f.journey.open(token,{...body,play_id:randomUUID()}),denied);
 const other=await f.anotherFamily(),selection=other.selection();await assert.rejects(()=>f.journey.open(other.adult.sessionToken,{...body,view_context:selection.view_context,child_id:selection.child_id,play_id:start.play_id}),denied);
 assert.deepEqual(await playRows(f.db),before);
 const second=await f.ready('Invented separately entered second question.');await assert.rejects(()=>f.journey.start(token,{...f.body(second),command_id:id}),e=>e.code==='conflict');
});

test('journey: action outage, same action recovery, conflict and read-only pending timeline',async t=>{
 const f=await fixture(t),x=await f.ready(),body=f.body(x),token=f.adult.sessionToken,started=await f.journey.start(token,{...body,command_id:randomUUID()}),s=scope(f,x,started.play_id);
 const c=actionCommand(s,0,{kind:'predict',prediction:'tips'});f.playOutage(true);
 assert.equal((await f.journey.action(token,{...body,play_id:s.play_id,command:c})).status,'retryable_unacknowledged');
 const before=await playRows(f.db),timeline=await f.journey.founderHistory(f.founderToken,f.founderInput(x));assert.equal(timeline.state,'pending_confirmation');assert.equal(timeline.watermark.action_sequence,0);assert.deepEqual(timeline.events,[]);assert.equal(timeline.pending.length,1);assert.deepEqual(await playRows(f.db),before);
 f.playOutage(false);const saved=await f.journey.action(token,{...body,play_id:s.play_id,command:c});assert.equal(saved.status,'acknowledged');assert.deepEqual(await f.journey.action(token,{...body,play_id:s.play_id,command:c}),saved);
 await assert.rejects(()=>f.journey.action(token,{...body,play_id:s.play_id,command:{...c,action_id:randomUUID()}}),e=>e.code==='conflict');
 await assert.rejects(()=>f.journey.action(token,{...body,play_id:s.play_id,command:{...c,action:{kind:'predict',prediction:'stable'}}}),e=>e.code==='conflict');assert.equal(await count(f.db,'play_action_commands'),1);
});

for(const kind of ['logout','consent','profile','pending_snapshot_withdrawal'])test('journey: actual '+kind+' during independent action append prevents ACK',async t=>{
 const f=await fixture(t),x=await f.ready(),body=f.body(x),token=f.adult.sessionToken,start=await f.journey.start(token,{...body,command_id:randomUUID()}),s=scope(f,x,start.play_id);
 f.beforeAppend(async()=>{
  if(kind==='logout')await f.access.logout(token);
  else if(kind==='consent')await f.consent.withdraw(token,{command_id:randomUUID(),policy_version:'TEST-v1'});
  else if(kind==='profile')await corrected(f);
  else{const v=await reviewRead(f,x.scope);f.reviewOutage(true);assert.equal((await f.review.command(f.founderToken,reviewCommand(x.scope,v,'WithdrawTestSnapshot',{snapshot_id:x.snapshot.snapshot_id,reason:'Invented selected snapshot withdrawal.'}))).status,'retryable_unacknowledged');}
 });
 await assert.rejects(()=>f.journey.action(token,{...body,play_id:s.play_id,command:actionCommand(s,0,{kind:'predict',prediction:'tips'})}),denied);
 assert.equal((await first(f.db,'SELECT ack_state FROM play_action_commands')).ack_state,'pending');
 await assert.rejects(()=>f.journey.open(token,{...body,play_id:s.play_id}));
});

test('journey: frozen reviewed content survives ordinary newer draft edits',async t=>{
 const f=await fixture(t),x=await f.ready(),body=f.body(x),token=f.adult.sessionToken,start=await f.journey.start(token,{...body,command_id:randomUUID()});
 const g=await f.generation.read(f.founderToken,{...x.scope,job_id:null});await f.generation.command(f.founderToken,draftCommand(x.scope,'EditRevision',g.job,{revision_id:g.job.current_revision_id,field:'opening',value:'Invented later draft, never replace frozen content.'}));
 assert.deepEqual((await f.journey.open(token,{...body,play_id:start.play_id})).adventure,x.snapshot.adventure);
});

test('journey founder history: separate actual founder authority, no activity, no repairs, concurrent parent completion',async t=>{
 const f=await fixture(t),x=await f.ready(),input=f.founderInput(x),body=f.body(x),token=f.adult.sessionToken;
 const before=await playRows(f.db);assert.equal((await f.journey.founderHistory(f.founderToken,input)).state,'no_activity');assert.deepEqual(await playRows(f.db),before);
 await assert.rejects(()=>f.journey.founderHistory(token,input),denied);await assert.rejects(()=>f.journey.founderHistory(f.founderToken,{...input,child_id:f.children[1].child_id}),denied);
 const start=await f.journey.start(token,{...body,command_id:randomUUID()}),s=scope(f,x,start.play_id);let timer;
 try{await Promise.race([Promise.all([f.journey.founderHistory(f.founderToken,input),f.journey.action(token,{...body,play_id:s.play_id,command:actionCommand(s,0,{kind:'predict',prediction:'tips'})})]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Founder read / parent action did not complete')),5000);})]);}finally{clearTimeout(timer);}
 const auth=f.generationOptions().auth,identity=(await auth.requireFounder(f.founderToken)).identityId;
 await f.db.query('UPDATE founder_identities SET enabled=false WHERE identity_id=$1',[identity]);await assert.rejects(()=>f.journey.founderHistory(f.founderToken,input),denied);await f.db.query('UPDATE founder_identities SET enabled=true WHERE identity_id=$1',[identity]);
 // Real DB transactions and real journal: revoke just AFTER the chain snapshot
 // transaction, BEFORE independent journal reads. Post-boundary authorization must deny.
 const original=f.db.transaction;let armed=true;
 f.db.transaction=async function(work){const result=await original.call(this,work);if(armed&&result?.start&&Array.isArray(result.commands)){armed=false;await f.db.query('UPDATE founder_identities SET enabled=false WHERE identity_id=$1',[identity]);}return result;};
 try{await assert.rejects(()=>f.journey.founderHistory(f.founderToken,input),denied);assert.equal(armed,false);}finally{f.db.transaction=original;await f.db.query('UPDATE founder_identities SET enabled=true WHERE identity_id=$1',[identity]);}
 const rows=await playRows(f.db);await f.journey.founderHistory(f.founderToken,input);assert.deepEqual(await playRows(f.db),rows);
 await f.consent.withdraw(token,{command_id:randomUUID(),policy_version:'TEST-v1'});await assert.rejects(()=>f.journey.founderHistory(f.founderToken,input),denied);
});

test('journey founder history: actual stored event mismatch fails closed rather than fabricating a timeline',async t=>{
 const f=await fixture(t),x=await f.ready(),body=f.body(x),token=f.adult.sessionToken,start=await f.journey.start(token,{...body,command_id:randomUUID()}),s=scope(f,x,start.play_id);
 await f.journey.action(token,{...body,play_id:s.play_id,command:actionCommand(s,0,{kind:'predict',prediction:'tips'})});
 await f.db.exec("ALTER TABLE play_events DISABLE TRIGGER play_event_append_only; UPDATE play_events SET payload='{\"events\":[]}'::jsonb; ALTER TABLE play_events ENABLE TRIGGER play_event_append_only");
 const before=await playRows(f.db);await assert.rejects(()=>f.journey.founderHistory(f.founderToken,f.founderInput(x)),e=>e.code==='recovery_required');assert.deepEqual(await playRows(f.db),before);
});

test('onboarding: actual empty persistent DB, setup commit / trial failure / same command retry and reopen',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'loop-journey-trial-'));let db,access,consent,setup,onboarding,delivered,failOnce=true,at=1800000000000;
 const clock=()=>at;
 async function reopen(){
  db=new PGlite(join(directory,'primary'));await db.waitReady;await migrate(db);
  access=await createSyntheticAdultAccess({env,db,clock,deliver:async x=>{delivered=x.token;},policy:{challengeTtlMs:600000,sessionTtlMs:172800000,resendCooldownMs:1,requestWindowMs:60000,maxRequests:100,maxVerifyAttempts:100}});
  consent=await createSyntheticConsentService({env,db,access,clock,policyVersion:'TEST-v1'});setup=await createSyntheticChildSetup({env,db,access,clock,policyVersion:'TEST-v1'});
  const actual=createEntitlementKernel({env,clock});onboarding=await createJourneyOnboarding({env,db,access,setup,clock,kernel:{activateTrial:async(...args)=>{const result=await actual.activateTrial(...args);if(failOnce){failOnce=false;throw Error('Invented post-kernel activation failure');}return result;}}});
 }
 t.after(async()=>{await db?.close();await rm(directory,{recursive:true,force:true});});await reopen();
 for(const table of ['households','adult_accounts','service_consents','children','wonder_requests','assignments','play_sessions','entitlement_periods'])assert.equal(await count(db,table),0);
 await access.request({email:'invented-journey@example.invalid',purpose:'join'});const adult=await access.verify({token:delivered}),token=adult.sessionToken;
 assert.equal((await onboarding.status(token)).state,'permission_required');assert.equal(await count(db,'entitlement_periods'),0);
 await consent.record(token,{command_id:randomUUID(),policy_version:'TEST-v1',required_service:true,optional_contact:false,optional_story:false});
 const status=await onboarding.status(token),command={command_id:randomUUID(),setup_context:status.setup_context,operation:'create',initial:true,profile:{nickname:'Invented Alpha',age:6,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}};
 await assert.rejects(()=>onboarding.save(token,command));assert.equal(await count(db,'children'),1);assert.equal(await count(db,'child_setup_commands'),1);assert.equal(await count(db,'entitlements'),0);assert.equal(await count(db,'entitlement_periods'),0);
 const saved=await onboarding.save(token,command),selection={view_context:createHash('sha256').update(JSON.stringify(['synthetic-family-space-v1',adult.adultId,adult.householdId,1,'TEST-v1'])).digest('hex'),child_id:saved.child.child_id};
 const trial=await onboarding.ensureTrial(token,selection);assert.equal(trial.allowance,8);assert.equal(Date.parse(trial.trial_end)-Date.parse(trial.trial_start),86400000);assert.equal(trial.test_only,true);assert(!Object.hasOwn(trial,'uncommitted'));
 assert.deepEqual(await onboarding.save(token,command),saved);assert.deepEqual(await onboarding.ensureTrial(token,selection),trial);
 const s=await onboarding.status(token);await onboarding.save(token,{...command,command_id:randomUUID(),setup_context:s.setup_context,initial:false,profile:{...command.profile,nickname:'Invented Beta'}});assert.deepEqual(await onboarding.ensureTrial(token,selection),trial);
 await db.close();db=null;await reopen();assert.deepEqual(await onboarding.ensureTrial(token,selection),trial);assert.equal(await count(db,'entitlement_periods'),1);
 at+=86400001;assert.deepEqual(await onboarding.ensureTrial(token,selection),{...trial,state:'expired'});assert.equal(await count(db,'entitlement_periods'),1);
 await consent.withdraw(token,{command_id:randomUUID(),policy_version:'TEST-v1'});await consent.record(token,{command_id:randomUUID(),policy_version:'TEST-v1',required_service:true,optional_contact:false,optional_story:false});
 assert.equal((await onboarding.status(token)).state,'setup_unavailable');await assert.rejects(()=>onboarding.ensureTrial(token,selection),denied);assert.equal(await count(db,'entitlement_periods'),1);
});
