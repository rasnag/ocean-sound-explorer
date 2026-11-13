// Proposed ordered recovery tests. PGlite does NOT prove multi-connection row-lock races.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm,readFile,appendFile,rename,realpath,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {TOTP,Secret} from 'otpauth';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {createFounderAuth} from '../lib/loop/founder-auth.mjs';
import {createSyntheticAdultAccess} from '../server/adult-access.mjs';
import {createSyntheticConsentService} from '../server/consent-service.mjs';
import {createSyntheticChildSetup} from '../server/child-setup.mjs';
import {createEntitlementKernel} from '../lib/loop/entitlements.mjs';
import {createSyntheticContinuationJournal} from '../server/continuation-journal.mjs';
import {createSyntheticContinuationService} from '../server/continuation-service.mjs';
const env={LOOP_ENV:'local-synthetic'},ref=c=>({household_id:c.household_id,command_id:c.command_id});
const rejected=(work,code)=>assert.rejects(work,e=>!code||e.code===code);
async function fixture(work){
 const db=await createSyntheticDatabase(env),directory=await mkdtemp(join(tmpdir(),'loop-continuation-recovery-'));let at=1800000000000,journal,fault=null,failure;
 const originalOut=process.stdout.write,originalErr=process.stderr.write,captured=[];for(const stream of [process.stdout,process.stderr])stream.write=function(chunk,...args){captured.push(String(chunk));args.find(x=>typeof x==='function')?.();return true;};
 try{
  await migrate(db);const clock=()=>at,material=randomBytes(32),globalKey=randomBytes(32);let selectedKey=material;
  const keys={keyForHousehold:()=>{if(!selectedKey)throw Error('Missing invented key');return Buffer.from(selectedKey);},receiptDedupeKey:globalKey};
  journal=await createSyntheticContinuationJournal({env,directory,keys,testHooks:{beforeAppend:async r=>{if(fault)await fault(r);}}});
  const auth=await createFounderAuth({env,db,clock,sessionTtlMs:60000});
  async function identity(){const p={username:'invented-'+randomUUID(),role:'founder',password:randomBytes(24).toString('base64url'),totpSecret:new Secret({size:20}).base32};await auth.provisionSyntheticIdentity(p);return p;}
  const owner=await identity(),other=await identity(),otp=p=>new TOTP({secret:Secret.fromBase32(p.totpSecret),algorithm:'SHA1',digits:6,period:30}).generate({timestamp:at});
  const login=async p=>(await auth.login({username:p.username,password:p.password,totp:otp(p)})).token;
  let delivered;const access=await createSyntheticAdultAccess({env,db,clock,policy:{challengeTtlMs:600000,sessionTtlMs:3600000,resendCooldownMs:1,requestWindowMs:60000,maxRequests:100,maxVerifyAttempts:100},deliver:async m=>{delivered=m.token;}});
  await access.request({email:'recovery-fixture@example.invalid',purpose:'join'});const adult=await access.verify({token:delivered});assert.equal(adult.status,'verified');
  const consent=await createSyntheticConsentService({env,db,access,clock,policyVersion:'TEST-v1'}),setup=await createSyntheticChildSetup({env,db,access,clock,policyVersion:'TEST-v1'});
  await consent.record(adult.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1',required_service:true,optional_contact:false,optional_story:false});
  const s=await setup.status(adult.sessionToken);await setup.save(adult.sessionToken,{command_id:randomUUID(),setup_context:s.setup_context,operation:'create',initial:true,profile:{nickname:'Invented Recovery',age:6,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}});
  const entitlement=randomUUID(),kernel=createEntitlementKernel({env,clock});await db.query('INSERT INTO entitlements VALUES($1,$2)',[adult.householdId,entitlement]);await db.transaction(tx=>kernel.activateTrial(tx,{household_id:adult.householdId,consent_epoch:1},{command_id:randomUUID(),entitlement_id:entitlement},{synthetic:true,policy_version:'invented-recovery-trial',allowance:1,duration_seconds:1,allocation_scope:'household'}));at+=30000;
  const token=await login(owner),otherToken=await login(other);let service=await createSyntheticContinuationService({env,db,auth,access,journal,keys,clock});
  const command=()=>({contract_version:'test-continuation-1',command_id:randomUUID(),household_id:adult.householdId,consent_epoch:1,expected_version:0,policy_version:'TEST-CONTINUATION-v1',synthetic_only:true,receipt_reference:'TEST-CONTINUATION-'+randomBytes(16).toString('hex'),allocation_scope:'household',starts_at:new Date(at).toISOString(),ends_at:new Date(at+600000).toISOString(),allowance:2,provenance_kind:'invented-payment-record'});
  await work({db,directory,auth,access,consent,setup,adult,owner,other,token,otherToken,keys,material,globalKey,login,command,clock,captured,setKey(k){selectedKey=k;},advance(ms){at+=ms;},setFault(fn){fault=fn;},get service(){return service;},get journal(){return journal;},async reopen(){await journal.close();journal=await createSyntheticContinuationJournal({env,directory,keys});service=await createSyntheticContinuationService({env,db,auth,access,journal,keys,clock});}});
  for(const secret of [owner.password,owner.totpSecret,token,otherToken,adult.sessionToken,material.toString('hex'),globalKey.toString('hex')])assert(!captured.join('').includes(secret));
 }catch(e){failure={code:typeof e?.code==='string'&&/^[a-zA-Z0-9_]+$/.test(e.code)?e.code:'assertion',line:String(e?.stack??'').match(/loop-continuation-recovery\.test\.mjs:(\d+)/)?.[1]??'unknown'};}
 finally{if(journal)await journal.close();await db.close();const absolute=resolve(directory);if(dirname(absolute)!==resolve(tmpdir())||!basename(absolute).startsWith('loop-continuation-recovery-')||await realpath(absolute)!==absolute||(await lstat(absolute)).isSymbolicLink())throw Error('Unsafe fixture cleanup');await rm(absolute,{recursive:true,force:true});process.stdout.write=originalOut;process.stderr.write=originalErr;}
 if(failure)throw Error('Continuation recovery fixture failed: '+failure.code+' at '+failure.line);
}
const row=async(f,c)=>(await f.db.query('SELECT * FROM continuation_commands WHERE command_id=$1',[c.command_id])).rows[0];
const grantCount=async f=>Number((await f.db.query('SELECT count(*) n FROM continuation_grants')).rows[0].n);
async function paused(f,action){
 let entered,release;const boundary=new Promise(done=>entered=done),gate=new Promise(done=>release=done);
 f.setFault(async()=>{entered();await gate;});const c=f.command(),pending=f.service.record(f.token,c);await boundary;
 try{await action(c,pending);}finally{release();}
 return {c,pending};
}

test('logout at actual journal boundary denies final marker; fresh same-identity login reconciles exact committed provenance',async()=>fixture(async f=>{
 const {c,pending}=await paused(f,async()=>{await f.auth.logout(f.token);});await rejected(()=>pending,'denied');
 const before=await row(f,c);assert.equal(before.acknowledged,false);assert.equal(await grantCount(f),0);assert.equal((await f.journal.records(c.household_id)).length,1);
 await rejected(()=>f.service.reconcile(f.otherToken,ref(c)),'denied');assert.equal(await grantCount(f),0);
 f.advance(30000);const fresh=await f.login(f.owner);const ack=await f.service.reconcile(fresh,ref(c)),after=await row(f,c);
 assert.equal(ack.status,'acknowledged');assert.equal(ack.grant.period_id,before.period_id);assert.equal(ack.grant.entitlement_id,before.entitlement_id);assert.equal(ack.primary_commit_id,before.primary_commit_id);
 for(const key of ['actor_id','original_session_hash','canonical_digest','receipt_hmac','record_id','recorded_at','recovery_record','aggregate_version'])assert.deepEqual(after[key],before[key]);
 assert.equal(await grantCount(f),1);assert.equal(Number((await f.db.query('SELECT version FROM continuation_accounts')).rows[0].version),1);
}));

test('expiry at journal boundary denies old token; current fresh same-actor session can reconcile after expiry',async()=>fixture(async f=>{
 const {c,pending}=await paused(f,async()=>{f.advance(60000);});await rejected(()=>pending,'denied');assert.equal(await grantCount(f),0);
 const before=await row(f,c),fresh=await f.login(f.owner);assert.equal((await f.service.reconcile(fresh,ref(c))).grant.period_id,before.period_id);assert.equal(await grantCount(f),1);
}));

test('demotion before final acknowledgement denies; primary fact is not replaced or adopted by another founder',async()=>fixture(async f=>{
 const {c,pending}=await paused(f,async()=>{await f.db.query("UPDATE founder_identities SET role='family' WHERE username=$1",[f.owner.username]);});await assert.rejects(()=>pending);assert.equal(await grantCount(f),0);
 await rejected(()=>f.service.reconcile(f.otherToken,ref(c)),'denied');assert.equal((await row(f,c)).acknowledged,false);
}));

test('withdrawal at journal boundary denies marker and reconsent cannot attach the old epoch',async()=>fixture(async f=>{
 const {c,pending}=await paused(f,async()=>{await f.consent.withdraw(f.adult.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1'});});await rejected(()=>pending,'denied');assert.equal(await grantCount(f),0);
 await f.consent.record(f.adult.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1',required_service:true,optional_contact:false,optional_story:false});await rejected(()=>f.service.reconcile(f.token,ref(c)),'denied');assert.equal((await row(f,c)).acknowledged,false);
}));

test('journal contains actual primary-committed encrypted fact; reopen is exact, wrong household key and changed global namespace fail closed',async()=>fixture(async f=>{
 const c=f.command(),ack=await f.service.record(f.token,c),primary=await row(f,c),records=await f.journal.records(c.household_id);assert.equal(records.length,1);
 const fact=f.journal.fact(records[0]);assert.equal(fact.format,'continuation-committed-fact-v1');assert.equal(fact.period_id,primary.period_id);assert.equal(fact.primary_commit_id,primary.primary_commit_id);assert.equal(fact.actor_id,primary.actor_id);assert.deepEqual({...fact.command},c);
 const bytes=await readFile(join(f.directory,'continuation-journal.log'));for(const secret of [c.receipt_reference,f.owner.password,f.owner.totpSecret,f.token])assert(!bytes.includes(Buffer.from(secret)));assert(!bytes.includes(f.material));assert(!bytes.includes(f.globalKey));
 await assert.rejects(()=>createSyntheticContinuationJournal({env,directory:f.directory,keys:f.keys}));
 await f.reopen();assert.deepEqual(await f.service.record(f.token,c),ack);assert.equal((await f.journal.records(c.household_id)).length,1);
 f.setKey(randomBytes(32));await rejected(()=>f.service.status(f.token,ref(c)),'recovery_quarantined');f.setKey(f.material);
 await f.journal.close();await assert.rejects(()=>createSyntheticContinuationJournal({env,directory:f.directory,keys:{...f.keys,receiptDedupeKey:randomBytes(32)}}),e=>e.code==='recovery_quarantined');
}));

test('truncated/corrupt tail and file replacement are quarantined rather than treated as an empty receipt namespace',async()=>fixture(async f=>{
 const c=f.command();await f.service.record(f.token,c);await f.journal.close();await appendFile(join(f.directory,'continuation-journal.log'),'partial invented frame');await rejected(()=>createSyntheticContinuationJournal({env,directory:f.directory,keys:f.keys}),'recovery_quarantined');
}));

test('replacement of an opened journal path denies status',async()=>fixture(async f=>{
 const c=f.command();await f.service.record(f.token,c);await rename(join(f.directory,'continuation-journal.log'),join(f.directory,'retired-invented.log'));await rejected(()=>f.service.status(f.token,ref(c)));
}));

test('ordered rollback-before-primary has no journal fact; missing primary recovery range quarantines without new period or consumption',async()=>fixture(async f=>{
 await f.db.exec(`CREATE FUNCTION continuation_recovery_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Invented rollback' USING ERRCODE='23514'; END $$; CREATE TRIGGER continuation_recovery_abort BEFORE INSERT ON continuation_commands FOR EACH ROW EXECUTE FUNCTION continuation_recovery_abort();`);
 const c=f.command();await rejected(()=>f.service.record(f.token,c),'23514');assert.equal((await f.journal.records(c.household_id)).length,0);assert.equal(Number((await f.db.query('SELECT count(*) n FROM entitlement_periods WHERE policy_version=$1',['TEST-CONTINUATION-v1'])).rows[0].n),0);
 await f.db.exec('DROP TRIGGER continuation_recovery_abort ON continuation_commands');const ack=await f.service.record(f.token,c),stored=await row(f,c);
 // Explicit disposable restore-loss simulation, not a production recovery action.
 await f.db.query('DELETE FROM continuation_commands WHERE household_id=$1 AND command_id=$2',[c.household_id,c.command_id]);
 await rejected(()=>f.service.record(f.token,c),'recovery_quarantined');
 const p=(await f.db.query('SELECT period_id FROM entitlement_periods WHERE period_id=$1',[stored.period_id])).rows;assert.equal(p.length,1);assert.equal(p[0].period_id,ack.grant.period_id);assert.equal(Number((await f.db.query('SELECT count(*) n FROM entitlement_claims')).rows[0].n),0);assert.equal(await grantCount(f),0);
}));
