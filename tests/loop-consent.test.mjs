import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
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


// Standalone repository regression: no planning checkout, probes or external service needed.
test('standalone consent HTTP, role/isolation, lifecycle, SQL rollback, quota and log regression',async()=>{
const root=process.cwd(),load=n=>import(pathToFileURL(path.join(root,n)).href);
// Deliberately fails import on the accepted pre-10-B application.
const {createSyntheticConsentService}=await load('server/consent-service.mjs');
const {createSyntheticDatabase}=await load('lib/loop/local-db.mjs');
const {migrate}=await load('db/migrate.mjs');
const {seedSynthetic}=await load('db/synthetic-fixtures.mjs');
const {createSyntheticAdultAccess}=await load('server/adult-access.mjs');
const {createSyntheticAdultAccessServer}=await load('server/adult-http.mjs');
const {createSyntheticPlayService}=await load('server/play-service.mjs');
const {createSyntheticPlayJournal}=await load('server/play-journal.mjs');
const {fixtureAdventure}=await load('lib/loop/fixture-adventure.mjs');
const {createEntitlementKernel}=await load('lib/loop/entitlements.mjs');
const {createFounderAuth}=await load('lib/loop/founder-auth.mjs');
const require=createRequire(path.join(root,'package.json'));
const {TOTP,Secret}=await import(pathToFileURL(require.resolve('otpauth')).href);
const env={LOOP_ENV:'local-synthetic'},db=await createSyntheticDatabase(env);
let now=1900000000000,server,journal,directory;const captures=[];
const policy={challengeTtlMs:120000,sessionTtlMs:3600000,resendCooldownMs:1,requestWindowMs:60000,maxRequests:100,maxVerifyAttempts:100};
const reject=(fn,c)=>assert.rejects(fn,e=>e.code===c);
const record=(yes=true,extra={})=>({command_id:randomUUID(),policy_version:'TEST-v1',required_service:yes,optional_contact:false,optional_story:false,...extra});
const withdrawal=()=>({command_id:randomUUID(),policy_version:'TEST-v1'});
const output=[],stdoutWrite=process.stdout.write,stderrWrite=process.stderr.write;
const capture=function(chunk,encoding,callback){output.push(String(chunk));if(typeof encoding==='function')encoding();if(typeof callback==='function')callback();return true;};
process.stdout.write=capture;process.stderr.write=capture;
try{
 await migrate(db);assert.equal((await db.query('select count(*)::int n from schema_migrations where version=7')).rows[0].n,1);
 const access=await createSyntheticAdultAccess({db,env,policy,clock:()=>now,deliver:async m=>captures.push(m)});
 assert.equal(typeof access.withSession,'function');
 const construct=options=>createSyntheticConsentService({env,db,access,clock:()=>now,policyVersion:'TEST-v1',...options});
 for(const options of [{env:{}},{env:{LOOP_ENV:'production'}},{policyVersion:undefined},{policyVersion:'unknown'}])await assert.rejects(async()=>construct(options));
 const consent=await construct();
 const account=async(email,householdId=randomUUID())=>{const a={email,adultId:randomUUID(),householdId};await access.seedAccount(a);return a;};
 const verify=async a=>{now+=2;const n=captures.length;await access.request({email:a.email,purpose:'recover'});assert.equal(captures.length,n+1);const v=await access.verify({token:captures[n].token});assert.equal(v.status,'verified');return v.sessionToken;};
 const A=await account('consent-a@example.invalid'),B=await account('consent-b@example.invalid');let token=await verify(A);const other=await verify(B);
 const householdState=async h=>({consents:(await db.query('select to_jsonb(c) row from service_consents c where household_id=$1 order by consent_epoch',[h])).rows,receipts:(await db.query('select to_jsonb(c) row from consent_commands c where household_id=$1 order by command_id',[h])).rows});
 const bBefore=await householdState(B.householdId);
 const absent={status:'consent',synthetic_only:true,policy_version:'TEST-v1',state:'absent',consent_epoch:0,required_service:false,optional_contact:false,optional_story:false};
 assert.deepEqual(await consent.status(token),absent);
 await reject(()=>consent.status({adultId:A.adultId,householdId:A.householdId}),'denied');
 const countChildren=async()=>Number((await db.query('select count(*) n from children')).rows[0].n);
 const refusal=record(false),beforeChildren=await countChildren();const refused=await consent.record(token,refusal);
 assert.equal(refused.outcome,'refused');assert.equal(refused.consent_epoch,0);assert.deepEqual(await consent.record(token,refusal),refused);assert.deepEqual(await consent.status(token),absent);assert.equal(await countChildren(),beforeChildren);
 for(const bad of [record(true,{policy_version:'old'}),record(true,{householdId:B.householdId}),record(false,{optional_story:true}),{...record(),command_id:'bad'}])await reject(()=>consent.record(token,bad),'validation_failed');
 const command=record(),receipt=await consent.record(token,command);assert.deepEqual(receipt,{status:'recorded',synthetic_only:true,command_id:command.command_id,operation:'record',outcome:'active',consent_epoch:1,policy_version:'TEST-v1'});
 assert.deepEqual(await consent.record(token,command),receipt);await reject(()=>consent.record(token,{...command,optional_story:true}),'conflict');
 const active=await consent.status(token);assert.equal(active.state,'active');assert.equal(active.required_service,true);assert.equal(active.optional_story,false);assert.equal(active.optional_contact,false);
 assert.equal((await consent.record(token,record())).consent_epoch,1);
 assert.deepEqual(await householdState(B.householdId),bBefore,'A permission changes cannot alter B status/epoch/receipts');
 assert.equal((await consent.record(other,command)).consent_epoch,1,'dedupe is household scoped');
 const bAfter=await householdState(B.householdId);
 const marker=randomUUID();await assert.rejects(()=>access.withSession(token,async(tx,s)=>{assert.deepEqual(s,{adultId:A.adultId,householdId:A.householdId});await tx.query('insert into households values($1)',[marker]);throw Error('rollback callback');}));
 assert.equal((await db.query('select count(*)::int n from households where household_id=$1',[marker])).rows[0].n,0);
 const snapshot=async h=>(await db.query('select to_jsonb(c) row from service_consents c where household_id=$1 order by consent_epoch',[h])).rows;
 const failed=withdrawal(),prior=await snapshot(A.householdId);
 await db.exec(`create function controller_consent_fail() returns trigger language plpgsql as $$ begin if NEW.command_id='${failed.command_id}'::uuid then raise exception 'controlled receipt failure' using errcode='23514';end if;return NEW;end $$; create trigger controller_consent_fail before insert on consent_commands for each row execute function controller_consent_fail();`);
 await assert.rejects(()=>consent.withdraw(token,failed));assert.deepEqual(await snapshot(A.householdId),prior);assert.equal((await db.query('select count(*)::int n from consent_commands where command_id=$1',[failed.command_id])).rows[0].n,0);
 await db.exec('drop trigger controller_consent_fail on consent_commands; drop function controller_consent_fail();');
 server=createSyntheticAdultAccessServer({env,access,consent});assert.throws(()=>server.listen(0,'0.0.0.0'));await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const origin='http://127.0.0.1:'+server.address().port;
 const post=(route,data,headers={})=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(data),redirect:'manual'});
 const founderAuth=await createFounderAuth({db,env,clock:()=>now,sessionTtlMs:60000});
 const founder={username:'synthetic-consent-founder',role:'founder',password:randomBytes(24).toString('base64url'),totpSecret:new Secret({size:20}).base32};
 await founderAuth.provisionSyntheticIdentity(founder);
 const totp=new TOTP({secret:Secret.fromBase32(founder.totpSecret),algorithm:'SHA1',digits:6,period:30}).generate({timestamp:now});
 const founderSession=await founderAuth.login({username:founder.username,password:founder.password,totp});
 assert.equal((await founderAuth.requireFounder(founderSession.token)).role,'founder');
 const beforeFounderA=await householdState(A.householdId),beforeFounderB=await householdState(B.householdId);
 for(const Cookie of ['loop_session='+founderSession.token,'loop_adult_session='+founderSession.token]){
  assert.equal((await fetch(origin+'/adult/consent',{headers:{Cookie}})).status,403);
  assert.equal((await post('/adult/consent',record(),{Cookie})).status,403);
  assert.equal((await post('/adult/consent/withdraw',withdrawal(),{Cookie})).status,403);
 }
 assert.deepEqual(await householdState(A.householdId),beforeFounderA);assert.deepEqual(await householdState(B.householdId),beforeFounderB);
 now+=2;const n=captures.length;await post('/adult/request',{email:A.email,purpose:'recover'});assert.equal(captures.length,n+1);const vr=await post('/adult/verify',{token:captures[n].token});assert.equal(vr.status,200);const cookie=vr.headers.get('set-cookie')?.split(';')[0];assert(cookie);assert.match(vr.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict.*Path=\/adult/i);assert.deepEqual(await vr.json(),{status:'verified',restricted:true});
 await reject(()=>consent.status(token),'denied');
 const get=(headers={})=>fetch(origin+'/adult/consent',{headers:{Cookie:cookie,...headers}});
 let response=await get({'User-Agent':'Synthetic browser','Sec-Fetch-User':'?1','Sec-Fetch-Site':'same-origin'});assert.equal(response.status,200);assert.equal((await response.json()).state,'active');
 for(const headers of [{Origin:'https://foreign.invalid'},{'X-Household-ID':B.householdId},{Authorization:'Bearer invented'},{'X-Forwarded-Host':'127.0.0.1'}])assert.equal((await get(headers)).status,403);
 assert.equal((await get({Cookie:cookie+'; '+cookie})).status,400);
 assert.equal((await fetch(origin+'/adult/consent',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(record())})).status,403);
 assert.equal((await post('/adult/consent',record(),{Cookie:cookie,Origin:'https://foreign.invalid'})).status,403);
 assert.equal((await post('/adult/consent',record(true,{adultId:A.adultId}),{Cookie:cookie})).status,400);
 assert.equal((await post('/adult/consent',{...record(),padding:'x'.repeat(5000)},{Cookie:cookie})).status,413);
 response=await post('/adult/consent',record(),{Cookie:cookie});assert.equal(response.status,200);assert.equal((await response.json()).outcome,'active');
 const w=withdrawal();response=await post('/adult/consent/withdraw',w,{Cookie:cookie});assert.equal(response.status,200);const wr=await response.json();assert.equal(wr.consent_epoch,2);assert.equal(wr.outcome,'withdrawn');
 assert.deepEqual(await (await post('/adult/consent/withdraw',w,{Cookie:cookie})).json(),wr);assert.equal((await (await get()).json()).state,'withdrawn');assert.equal((await (await fetch(origin+'/adult/session',{headers:{Cookie:cookie}})).json()).status,'restricted');
 assert.deepEqual(await householdState(B.householdId),bAfter,'A withdrawal does not alter B permissions or receipts');
 assert.equal((await (await post('/adult/consent',record(),{Cookie:cookie})).json()).consent_epoch,3);
 assert.deepEqual(await householdState(B.householdId),bAfter,'A reconsent does not alter B');
 await post('/adult/consent/withdraw',withdrawal(),{Cookie:cookie});
 const aBeforeBWithdrawal=await householdState(A.householdId);await consent.withdraw(other,withdrawal());assert.deepEqual(await householdState(A.householdId),aBeforeBWithdrawal,'B withdrawal does not alter A');
 for(const r of [await get(),await post('/adult/consent',record(true,{policy_version:'wrong'}),{Cookie:cookie})]){assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert(!r.headers.get('access-control-allow-origin'));const text=await r.text();for(const secret of [A.adultId,A.householdId,A.email,cookie])assert(!text.includes(secret));}
 // Use the accepted fixture API, actual finite engine1 and actual journal.
 await seedSynthetic(db);const seeds=(await db.query('select a.*,e.entitlement_id from assignments a join entitlements e using(household_id) order by a.household_id')).rows;const seeded=seeds[0],neighbor=seeds[1];assert(neighbor);
 const F=await account('consent-fixture@example.invalid',seeded.household_id),ft=await verify(F);
 const scope={household_id:seeded.household_id,child_id:seeded.child_id,assignment_id:seeded.assignment_id,revision_id:seeded.revision_id,play_id:randomUUID(),consent_epoch:1};
 const spec={...structuredClone(fixtureAdventure),revision_id:scope.revision_id};directory=await mkdtemp(path.join(os.tmpdir(),'curiosity-consent-probe-'));journal=await createSyntheticPlayJournal({env,directory});
 const neighborScope={household_id:neighbor.household_id,child_id:neighbor.child_id,assignment_id:neighbor.assignment_id,revision_id:neighbor.revision_id,play_id:randomUUID(),consent_epoch:1};
 const play=createSyntheticPlayService({env,db,journal,clock:()=>now,catalog:[{household_id:scope.household_id,revision_id:scope.revision_id,spec,starting_path:'medium',starting_reason:'Invented consent integration fixture.'},{household_id:neighborScope.household_id,revision_id:neighborScope.revision_id,spec:{...structuredClone(fixtureAdventure),revision_id:neighborScope.revision_id},starting_path:'medium',starting_reason:'Independent invented household fixture.'}]});
 const start={contract_version:'1.1.0',command_id:randomUUID(),play_id:scope.play_id,consent_epoch:1,revision_id:scope.revision_id,pattern_version:'fixture-1',engine_version:'fixture-engine-1'};
 assert.equal((await play.start(scope,start)).status,'acknowledged');
 const action={contract_version:'1.1.0',play_id:scope.play_id,action_id:randomUUID(),expected_sequence:0,consent_epoch:1,revision_id:scope.revision_id,pattern_version:'fixture-1',action:{kind:'predict',prediction:'tips'}};
 assert.equal((await play.commit(scope,action)).status,'acknowledged');
 const resume={play_id:scope.play_id,revision_id:scope.revision_id,consent_epoch:1};assert.equal((await play.resume(scope,resume)).status,'acknowledged');
 const kernel=createEntitlementKernel({env,clock:()=>now}),trusted={household_id:scope.household_id,consent_epoch:1};
 const activation={command_id:randomUUID(),entitlement_id:seeded.entitlement_id},offer={synthetic:true,policy_version:'consent-probe-offer',allowance:1,duration_seconds:60,allocation_scope:'household'};
 const period=await db.transaction(tx=>kernel.activateTrial(tx,trusted,activation,offer));assert.equal((await db.transaction(tx=>kernel.readAllowance(tx,trusted,{period_id:period.period_id}))).remaining,1);
 const neighborStart={...start,command_id:randomUUID(),play_id:neighborScope.play_id,revision_id:neighborScope.revision_id};assert.equal((await play.start(neighborScope,neighborStart)).status,'acknowledged');
 const neighborResume={play_id:neighborScope.play_id,revision_id:neighborScope.revision_id,consent_epoch:1},neighborTrusted={household_id:neighborScope.household_id,consent_epoch:1};
 const neighborPeriod=await db.transaction(tx=>kernel.activateTrial(tx,neighborTrusted,{command_id:randomUUID(),entitlement_id:neighbor.entitlement_id},offer));
 const deniedFreshWrites=async()=>{
  const fresh={...scope,play_id:randomUUID()};
  await reject(()=>play.start(fresh,{...start,command_id:randomUUID(),play_id:fresh.play_id}),'denied');
  await reject(()=>db.transaction(tx=>kernel.activateTrial(tx,trusted,{command_id:randomUUID(),entitlement_id:seeded.entitlement_id},offer)),'denied');
  await reject(()=>play.commit(scope,action),'denied');
  await reject(()=>db.transaction(tx=>kernel.apply(tx,trusted,{contract_version:'1.1.0',transition_id:randomUUID(),request_id:seeded.request_id,period_id:period.period_id,policy_version:offer.policy_version,expected_version:0,consent_epoch:1,quantity:1,kind:'hold',from:'none',to:'pending',cause:'SubmitProduction',cause_id:randomUUID()},{})),'denied');
 };
 await db.query("update service_consents set policy_version='UNKNOWN' where household_id=$1 and consent_epoch=1",[scope.household_id]);
 await reject(()=>play.resume(scope,resume),'denied');await reject(()=>db.transaction(tx=>kernel.readAllowance(tx,trusted,{period_id:period.period_id})),'denied');assert.equal((await consent.status(ft)).state,'policy_mismatch');
 await deniedFreshWrites();
 await db.query("update service_consents set policy_version='TEST-v1' where household_id=$1 and consent_epoch=1",[scope.household_id]);assert.equal((await play.resume(scope,resume)).status,'acknowledged');
 assert.equal((await consent.record(ft,record(true,{optional_contact:true,optional_story:true}))).consent_epoch,1);
 let choices=await consent.status(ft);assert.equal(choices.optional_contact,true);assert.equal(choices.optional_story,true);assert.equal(choices.required_service,true);
 assert.equal((await play.resume(scope,resume)).status,'acknowledged');
 assert.equal((await consent.record(ft,record(true,{optional_contact:false,optional_story:true}))).consent_epoch,1);
 choices=await consent.status(ft);assert.equal(choices.optional_contact,false);assert.equal(choices.optional_story,true);assert.equal(choices.required_service,true);assert.equal((await play.resume(scope,resume)).status,'acknowledged');
 const fence=await consent.record(ft,record(false));assert.equal(fence.consent_epoch,2);assert.equal(fence.outcome,'refused');
 choices=await consent.status(ft);assert.equal(choices.state,'withdrawn');assert.equal(choices.required_service,false);assert.equal(choices.optional_contact,false);assert.equal(choices.optional_story,false);
 await reject(()=>play.resume(scope,resume),'denied');await reject(()=>play.commit(scope,action),'denied');await reject(()=>db.transaction(tx=>kernel.readAllowance(tx,trusted,{period_id:period.period_id})),'denied');
 await deniedFreshWrites();
 assert.equal((await play.resume(neighborScope,neighborResume)).status,'acknowledged','another household play remains usable');assert.equal((await db.transaction(tx=>kernel.readAllowance(tx,neighborTrusted,{period_id:neighborPeriod.period_id}))).remaining,1,'another household entitlement remains usable');
 const renewed=await consent.record(ft,record());assert.equal(renewed.consent_epoch,3);await reject(()=>play.resume(scope,resume),'denied');assert.equal((await db.query("select count(*)::int n from service_consents where household_id=$1 and state='active' and consent_epoch<3",[scope.household_id])).rows[0].n,0);
 choices=await consent.status(ft);assert.equal(choices.optional_contact,false);assert.equal(choices.optional_story,false);await deniedFreshWrites();
 // Serial single-engine orders, not multi-connection PostgreSQL concurrency proof.
 const same=record();const duplicates=await Promise.all([consent.record(ft,same),consent.record(ft,same)]);assert.deepEqual(duplicates[0],duplicates[1]);assert.equal(duplicates[0].consent_epoch,3);
 await consent.withdraw(ft,withdrawal());assert.equal((await consent.status(ft)).state,'withdrawn');
 // Distinct concurrent commands serialize as one active epoch, not two children or two permissions.
 const C=await account('consent-concurrent@example.invalid'),ct=await verify(C);
 const fresh=await Promise.all([consent.record(ct,record()),consent.record(ct,record())]);assert(fresh.every(x=>x.consent_epoch===1));
 assert.equal((await db.query("select count(*)::int n from service_consents where household_id=$1 and state='active'",[C.householdId])).rows[0].n,1);
 await Promise.all([consent.withdraw(ct,withdrawal()),consent.record(ct,record())]);
 const ordered=await consent.status(ct);assert(ordered.state==='active'&&ordered.consent_epoch===3||ordered.state==='withdrawn'&&ordered.consent_epoch===2);
 assert.equal((await db.query("select count(*)::int n from service_consents where household_id=$1 and state='active'",[C.householdId])).rows[0].n,ordered.state==='active'?1:0);
 // Household quota persists across service instances; withdrawal is never quota-blocked.
 const Q=await account('consent-quota@example.invalid'),qt=await verify(Q);now+=60001;
 for(let i=0;i<30;i++)await consent.record(qt,record());await consent.record(qt,record(false));const second=await construct();await reject(()=>second.record(qt,record()),'rate_limited');await second.withdraw(qt,withdrawal());now+=60000;assert.equal((await second.record(qt,record())).outcome,'active');
 const oldNow=now;now-=1000;await reject(()=>second.record(qt,record()),'rate_limited');now=oldNow;for(let i=1;i<30;i++)await second.record(qt,record());await reject(()=>consent.record(qt,record()),'rate_limited');now=oldNow+60001;
 // Fresh global window, five households stay below each per-household ceiling.
 const group=[];for(let i=0;i<5;i++){const a=await account('consent-global'+i+'@example.invalid');group.push(await verify(a));}
 now+=60001;for(let i=0;i<120;i++)await consent.record(group[i%5],record());await reject(()=>second.record(group[0],record()),'rate_limited');await second.record(group[1],record(false));await second.withdraw(group[0],withdrawal());now+=60000;await second.record(group[0],record());
 await access.logout(other);await reject(()=>consent.status(other),'denied');await db.query('update adult_accounts set enabled=false where adult_id=$1',[Q.adultId]);await reject(()=>consent.status(qt),'denied');now+=policy.sessionTtlMs+1;await reject(()=>consent.status(ft),'denied');
 const emitted=output.join('');for(const secret of [A.adultId,A.householdId,B.adultId,B.householdId,A.email,B.email,token,other,cookie,founderSession.token,founder.password,founder.totpSecret,...captures.flatMap(x=>[x.email,x.token])])assert(!emitted.includes(secret),'sensitive value leaked to process output');
 process.stdout.write=stdoutWrite;process.stderr.write=stderrWrite;
 console.log('Standalone app consent regression PASS: actual disposable PG, verified adult HTTP cookie, strict security, versioned permissions/refusal/dedupe/rollback, real play+entitlement withdrawal fencing and durable throttles. Synthetic single-connection evidence only.');
}finally{process.stdout.write=stdoutWrite;process.stderr.write=stderrWrite;if(server?.listening)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});if(journal)await journal.close();await db.close();if(directory){assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('curiosity-consent-probe-'));await rm(directory,{recursive:true,force:true});}}

});

test('withSession retries actual SQL serialization/deadlock failures at most three times without partial writes',async()=>{
 await fixture(async({db,access,account})=>{
  const a=await account();let attempts=0;const marker=randomUUID();
  const result=await access.withSession(a.token,async tx=>{
   attempts++;await tx.query('INSERT INTO households VALUES($1)',[marker]);
   if(attempts<3)await tx.exec("DO $$ BEGIN RAISE EXCEPTION 'synthetic retry' USING ERRCODE='40001'; END $$");
   return 'committed';
  });
  assert.equal(result,'committed');assert.equal(attempts,3);assert.equal((await db.query('SELECT count(*)::int n FROM households WHERE household_id=$1',[marker])).rows[0].n,1);
  const absent=randomUUID();attempts=0;
  await assert.rejects(()=>access.withSession(a.token,async tx=>{attempts++;await tx.query('INSERT INTO households VALUES($1)',[absent]);await tx.exec("DO $$ BEGIN RAISE EXCEPTION 'synthetic deadlock' USING ERRCODE='40P01'; END $$");}),e=>e.code==='40P01');
  assert.equal(attempts,3);assert.equal((await db.query('SELECT count(*)::int n FROM households WHERE household_id=$1',[absent])).rows[0].n,0);
 });
});
