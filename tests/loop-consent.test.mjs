import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {seedSynthetic} from '../db/synthetic-fixtures.mjs';
import {createSyntheticAdultAccess} from '../server/adult-access.mjs';
import {createSyntheticConsentService} from '../server/consent-service.mjs';
import {createSyntheticPlayService} from '../server/play-service.mjs';
import {createSyntheticPlayJournal} from '../server/play-journal.mjs';
import {fixtureAdventure} from '../lib/loop/fixture-adventure.mjs';
const env={LOOP_ENV:'local-synthetic'};
const command=(extra={})=>({command_id:randomUUID(),policy_version:'TEST-v1',required_service:true,optional_contact:false,optional_story:false,...extra});
const withdrawal=()=>({command_id:randomUUID(),policy_version:'TEST-v1'});
async function fixture(run,{seed=false,append}={}) {
 const db=await createSyntheticDatabase(env);let journal,directory,at=1900000000000;const captures=[];
 try {
  await migrate(db);if(seed)await seedSynthetic(db);
  const access=await createSyntheticAdultAccess({db,env,clock:()=>at,deliver:async m=>captures.push(m),policy:{challengeTtlMs:60000,sessionTtlMs:600000,resendCooldownMs:1,requestWindowMs:60000,maxRequests:50,maxVerifyAttempts:50}});
  const consent=await createSyntheticConsentService({db,env,access,clock:()=>at,policyVersion:'TEST-v1'});
  const account=async(householdId=randomUUID(),name=randomUUID())=>{
   const actor={adultId:randomUUID(),householdId,email:'test-'+name+'@example.invalid'};
   await access.seedAccount(actor);at+=2;await access.request({email:actor.email,purpose:'recover'});
   const verified=await access.verify({token:captures.at(-1).token});assert.equal(verified.status,'verified');return {...actor,token:verified.sessionToken};
  };
  async function player() {
   const row=(await db.query('SELECT * FROM assignments ORDER BY household_id LIMIT 1')).rows[0];
   const actor=await account(row.household_id);
   directory=await mkdtemp(path.join(os.tmpdir(),'curiosity-consent-unit-'));
   journal=await createSyntheticPlayJournal({env,directory,testHooks:{beforeAppend:async record=>{if(append)await append({record,actor,consent,db});}}});
   const scope={household_id:row.household_id,child_id:row.child_id,assignment_id:row.assignment_id,revision_id:row.revision_id,play_id:randomUUID(),consent_epoch:1};
   const service=createSyntheticPlayService({env,db,journal,catalog:[{household_id:row.household_id,revision_id:row.revision_id,spec:{...structuredClone(fixtureAdventure),revision_id:row.revision_id},starting_path:'medium',starting_reason:'Invented consent ordering test.'}]});
   const start={contract_version:'1.1.0',command_id:randomUUID(),play_id:scope.play_id,consent_epoch:1,revision_id:scope.revision_id,pattern_version:'fixture-1',engine_version:'fixture-engine-1'};
   return {actor,scope,service,start,resume:{play_id:scope.play_id,revision_id:scope.revision_id,consent_epoch:1}};
  }
  await run({db,access,consent,account,player,advance:ms=>{at+=ms;}});
 } finally {
  if(journal)await journal.close();await db.close();
  if(directory){assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('curiosity-consent-unit-'));await rm(directory,{recursive:true,force:true});}
 }
}

test('consent snapshots intent, rejects accessors, binds receipts to current adult and preserves refusal history',async()=>{
 await fixture(async({db,access,consent,account,advance})=>{
  const a=await account(),b=await account(a.householdId);
  let invoked=false;const accessor=command();Object.defineProperty(accessor,'required_service',{get(){invoked=true;return true;}});
  await assert.rejects(()=>consent.record(a.token,accessor),e=>e.code==='validation_failed');assert.equal(invoked,false);
  const first=command({optional_story:true}),pending=consent.record(a.token,first);first.optional_story=false;const receipt=await pending;
  assert.equal((await consent.status(a.token)).optional_story,true);
  await assert.rejects(()=>consent.record(b.token,{...first,optional_story:true}),e=>e.code==='conflict');
  const refusal=command({required_service:false});const values=await Promise.all([consent.record(a.token,refusal),consent.record(a.token,refusal)]);assert.deepEqual(values[0],values[1]);assert.equal(values[0].consent_epoch,2);
  assert.equal((await consent.status(a.token)).state,'withdrawn');
  const renewal=await consent.record(a.token,command());assert.equal(renewal.consent_epoch,3);
  assert.deepEqual(await consent.record(a.token,{...first,optional_story:true}),receipt,'old receipt cannot reapply old flags or epoch');
  assert.equal((await consent.status(a.token)).optional_story,false);
  assert.equal((await db.query("SELECT count(*)::int n FROM service_consents WHERE household_id=$1 AND state='active' AND consent_epoch<3",[a.householdId])).rows[0].n,0);
  await access.logout(a.token);await assert.rejects(()=>consent.status(a.token),e=>e.code==='denied');assert.equal((await consent.status(b.token)).state,'active');
  advance(600001);await assert.rejects(()=>consent.record(b.token,command()),e=>e.code==='denied');
 });
});

test('withdrawal after primary play commit but before journal acknowledgement prevents private response',async()=>{
 let calls=0;
 await fixture(async({player,consent})=>{
  const {actor,scope,service,start,resume}=await player();
  await assert.rejects(()=>service.start(scope,start),e=>e.code==='denied');
  assert.equal(calls,1);assert.equal((await consent.status(actor.token)).state,'withdrawn');
  await assert.rejects(()=>service.resume(scope,resume),e=>e.code==='denied');
 },{seed:true,append:async({actor,consent})=>{calls++;await consent.withdraw(actor.token,withdrawal());}});
});

test('play acknowledged before withdrawal stays a recorded fact but future private reads fail',async()=>{
 await fixture(async({player,consent,db})=>{
  const {actor,scope,service,start,resume}=await player();
  assert.equal((await service.start(scope,start)).status,'acknowledged');
  assert.equal((await service.resume(scope,resume)).status,'acknowledged');
  await consent.withdraw(actor.token,withdrawal());
  await assert.rejects(()=>service.resume(scope,resume),e=>e.code==='denied');
  assert.equal((await db.query('SELECT count(*)::int n FROM play_sessions WHERE household_id=$1 AND play_id=$2',[scope.household_id,scope.play_id])).rows[0].n,1);
  await consent.record(actor.token,command());await assert.rejects(()=>service.start(scope,start),e=>e.code==='denied');
 },{seed:true});
});
