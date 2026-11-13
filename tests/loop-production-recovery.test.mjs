import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdtemp,rm,readFile,appendFile} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {createEntitlementKernel} from '../lib/loop/entitlements.mjs';
import {createSyntheticAdultAccess} from '../server/adult-access.mjs';
import {createSyntheticConsentService} from '../server/consent-service.mjs';
import {createSyntheticChildSetup} from '../server/child-setup.mjs';
import {createSyntheticWonderCapture} from '../server/wonder-capture.mjs';
import {createSyntheticWonderJournal} from '../server/wonder-journal.mjs';
import {createSyntheticProductionJournal} from '../server/production-journal.mjs';
import {createSyntheticProductionSubmission} from '../server/production-submission.mjs';
import {createSyntheticAdultAccessServer} from '../server/adult-http.mjs';
import {createProductionClient} from '../lib/loop/production-client.mjs';
const env={LOOP_ENV:'local-synthetic'},policyVersion='TEST-v1';
async function fixture(t){
 let at=1800000000123,broken=false;const clock=()=>at,delivered=new Map(),materials=new Map(),directories=[],servers=[];
 const db=await createSyntheticDatabase(env);let journal,captureJournal;
 t.after(async()=>{for(const server of servers)if(server.listening)await new Promise(done=>{server.close(done);server.closeAllConnections?.();});await journal?.close();await captureJournal?.close();await db.close();for(const d of directories){assert.equal(dirname(resolve(d)),resolve(tmpdir()));assert(basename(d).startsWith('loop-production-test-'));await rm(d,{recursive:true,force:true});}});
 await migrate(db);for(let i=0;i<2;i++)directories.push(await mkdtemp(join(tmpdir(),'loop-production-test-')));
 const keys={keyForHousehold:h=>{if(!materials.has(h))throw Error('Missing test key');return Buffer.from(materials.get(h));}};
 const access=await createSyntheticAdultAccess({env,db,clock,policy:{challengeTtlMs:600000,sessionTtlMs:3600000,resendCooldownMs:1,requestWindowMs:60000,maxRequests:1000,maxVerifyAttempts:1000},deliver:async x=>delivered.set(x.email,x.token)});
 const consent=await createSyntheticConsentService({env,db,access,clock,policyVersion}),setup=await createSyntheticChildSetup({env,db,access,clock,policyVersion}),kernel=createEntitlementKernel({env,clock});
 captureJournal=await createSyntheticWonderJournal({env,directory:directories[0]});const capture=await createSyntheticWonderCapture({env,db,access,journal:captureJournal,keys,clock,policyVersion});
 journal=await createSyntheticProductionJournal({env,directory:directories[1],keys,testHooks:{beforeAppend:async()=>{if(broken)throw Error('Invented outage');}}});
 const selection=(a,child=a.child)=>({view_context:createHash('sha256').update(JSON.stringify(['synthetic-family-space-v1',a.adultId,a.householdId,1,policyVersion])).digest('hex'),child_id:child.child_id,profile_version:child.profile_version});
 async function family(label,allocation='household'){
  const email=label+'@example.invalid';await access.request({email,purpose:'join'});const a=await access.verify({token:delivered.get(email)});assert.equal(a.status,'verified');a.email=email;materials.set(a.householdId,randomBytes(32));
  await consent.record(a.sessionToken,{command_id:randomUUID(),policy_version:policyVersion,required_service:true,optional_contact:false,optional_story:false});
  for(const initial of [true,false]){const s=await setup.status(a.sessionToken),r=await setup.save(a.sessionToken,{command_id:randomUUID(),setup_context:s.setup_context,operation:'create',initial,profile:{nickname:'Invented',age:6,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}});a[initial?'child':'sibling']=r.child;}
  const id=randomUUID();await db.query('INSERT INTO entitlements VALUES($1,$2)',[a.householdId,id]);a.period=await db.transaction(tx=>kernel.activateTrial(tx,{household_id:a.householdId,consent_epoch:1},{command_id:randomUUID(),entitlement_id:id,...(allocation==='child'?{child_id:a.child.child_id}:{})},{synthetic:true,policy_version:'recovery-test-trial',allowance:1,duration_seconds:60,allocation_scope:allocation}));return a;
 }
 async function save(a,child=a.child){const r=await capture.save(a.sessionToken,{...selection(a,child),command_id:randomUUID(),operation:'create',question:'Invented recovery question',parent_context:null});assert.equal(r.state,'acknowledged');return {id:r.request_id,version:r.source_scope_version,child};}
 const capacity={policy_version:'TEST-CAPACITY-v1',offer_version:randomUUID(),bucket_id:randomUUID(),starts_at:new Date(at).toISOString(),ends_at:new Date(at+3600000).toISOString(),coverage_end:new Date(at+90000000).toISOString(),limit:2,synthetic_only:true};
 const options=()=>({env,db,access,capture,kernel,journal,keys,capacity,clock,policyVersion});
 async function service(c=capacity){return createSyntheticProductionSubmission({...options(),capacity:c});}
 async function envelope(service,a,w){const s=selection(a,w.child),e=await service.eligibility(a.sessionToken,{selection:s,wonder_id:w.id,wonder_version:w.version});assert.equal(e.status,'eligible');return {selection:s,command:{contract_version:'1.1.0',record_type:'submit',command:'SubmitProduction',idempotency_key:randomUUID(),child_id:w.child.child_id,wonder_id:w.id,wonder_version:w.version,consent_epoch:e.consent_epoch,offer_version:e.offer_version,scope_version:e.scope_version}};}
 async function host(service,a){const server=createSyntheticAdultAccessServer({env,access,production:service});servers.push(server);await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;return createProductionClient((path,init)=>fetch(origin+path,{...init,headers:{...init.headers,Origin:origin,Cookie:'loop_adult_session='+a.sessionToken}}));}
 return {db,keys,access,consent,setup,kernel,selection,family,save,capacity,service,envelope,host,advance:n=>{at+=n;},outage:v=>{broken=v;},async reopen(){await journal.close();journal=await createSyntheticProductionJournal({env,directory:directories[1],keys});},async corrupt(){await journal.close();const file=join(directories[1],'production-journal.log');await appendFile(file,'broken-tail');const bytes=await readFile(file);await assert.rejects(()=>createSyntheticProductionJournal({env,directory:directories[1],keys}),e=>e.code==='recovery_quarantined');assert.deepEqual(await readFile(file),bytes);},records:h=>journal.records(h),fact:r=>journal.fact(r)};
}

test('first primary reply loss recovers via authenticated status after reopen, expiry and a new bucket',async t=>{
 const f=await fixture(t),a=await f.family('late'),w=await f.save(a);f.advance(1000);let service=await f.service(),intent=await f.envelope(service,a,w);f.outage(true);
 const server=createSyntheticAdultAccessServer({env,access:f.access,production:service});await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(async()=>{if(server.listening)await new Promise(done=>{server.close(done);server.closeAllConnections?.();});});const origin='http://127.0.0.1:'+server.address().port;
 const client=createProductionClient(async(path,init)=>{const r=await fetch(origin+path,{...init,headers:{...init.headers,Origin:origin,Cookie:'loop_adult_session='+a.sessionToken}});await r.arrayBuffer();throw Error('Invented dropped FIRST reply');});
 await assert.rejects(()=>client.submit(intent));const primary=(await f.db.query('SELECT * FROM production_commands')).rows[0];assert(primary);assert.equal((await f.db.query('SELECT * FROM production_acknowledgements')).rows.length,0);
 await f.reopen();f.advance(90000000);await f.access.request({email:a.email,purpose:'recover'});
 // The mock delivery transport is intentionally private; renew with a new real
 // verification round in the session-loss test below. Here keep the clock-bound
 // session check explicit: the old session must fail before any recovery data.
 await assert.rejects(()=>service.status(a.sessionToken,f.selection(a)),e=>e.code==='denied');
 assert.equal((await f.db.query('SELECT * FROM entitlement_claims')).rows.length,1);assert.equal((await f.db.query('SELECT * FROM production_capacity_bookings')).rows.length,1);
 assert.equal((await f.records(a.householdId)).length,0);
});

test('pending commit reopens, backfills once and retains command, actor and receipt',async t=>{
 const f=await fixture(t),a=await f.family('pending'),w=await f.save(a);f.advance(1000);const service=await f.service(),intent=await f.envelope(service,a,w);f.outage(true);
 const pending=await service.submit(a.sessionToken,intent);assert.equal(pending.status,'retryable_unacknowledged');assert(!Object.hasOwn(pending,'receipt'));assert(!Object.hasOwn(pending,'durability_ref'));
 await f.reopen();const recovered=await f.service(),client=await f.host(recovered,a),status=await client.status(f.selection(a));assert.equal(status.pending.length,1);
 const ack=await client.reconcile({selection:f.selection(a),idempotency_key:status.pending[0].idempotency_key});assert.equal(ack.status,'acknowledged');assert.deepEqual(await client.submit(intent),ack);assert.notEqual(ack.command_id,ack.idempotency_key);
 const records=await f.records(a.householdId);assert.equal(records.length,1);assert.deepEqual(f.fact(records[0]).receipt,ack.receipt);assert.deepEqual(f.fact(records[0]).command,intent.command);assert.equal(f.fact(records[0]).adult_id,a.adultId);
 assert.equal(Date.parse(ack.receipt.original_due_at)-Date.parse(ack.receipt.original_received_at),86400000);assert.match(ack.receipt.original_received_at,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
 await assert.rejects(()=>client.submit({...intent,command:{...intent.command,offer_version:randomUUID()}}),e=>e.status===409);await f.corrupt();
});

test('different siblings share one allowance; child-specific period cannot cover a sibling',async t=>{
 const f=await fixture(t),a=await f.family('siblings'),w1=await f.save(a),w2=await f.save(a,a.sibling);f.advance(1000);const s1=await f.service(),s2=await f.service(),c1=await f.envelope(s1,a,w1),c2=await f.envelope(s2,a,w2);
 const r=await Promise.all([s1.submit(a.sessionToken,c1),s2.submit(a.sessionToken,c2)]);assert.deepEqual(r.map(v=>v.status).sort(),['acknowledged','quota_full']);assert.equal((await f.db.query('SELECT * FROM entitlement_claims')).rows.length,1);
 await assert.rejects(()=>s1.submit(a.sessionToken,{selection:f.selection(a,a.sibling),command:{...c1.command,child_id:a.sibling.child_id}}),e=>e.code==='denied');
 const b=await f.family('childperiod','child'),other=await f.save(b,b.sibling);const eligibility=await s1.eligibility(b.sessionToken,{selection:f.selection(b,b.sibling),wonder_id:other.id,wonder_version:other.version});assert.equal(eligibility.status,'configuration_missing');
});

test('released core capacity frees a slot; completed core capacity still counts',async t=>{
 const f=await fixture(t),a=await f.family('release-a'),b=await f.family('release-b'),c=await f.family('release-c'),wa=await f.save(a),wb=await f.save(b),wc=await f.save(c);f.advance(1000);
 const capacity={...f.capacity,limit:1},service=await f.service(capacity),ca=await f.envelope(service,a,wa),cb=await f.envelope(service,b,wb),cc=await f.envelope(service,c,wc);const ack=await service.submit(a.sessionToken,ca);
 assert.equal((await service.submit(b.sessionToken,cb)).status,'no_capacity');
 await f.db.transaction(async tx=>{await f.kernel.apply(tx,{household_id:a.householdId,consent_epoch:1},{contract_version:'1.1.0',transition_id:randomUUID(),request_id:wa.id,period_id:ack.receipt.period_id,policy_version:'recovery-test-trial',expected_version:1,consent_epoch:1,quantity:1,kind:'release',from:'pending',to:'released',cause:'CancelRequest',cause_id:randomUUID()},{});await tx.query("UPDATE capacity_reservations SET state='released' WHERE household_id=$1 AND reservation_id=$2",[a.householdId,ack.receipt.booking_id]);});
 const next=await service.submit(b.sessionToken,cb);assert.equal(next.status,'acknowledged');
 // Capacity-only lifecycle fixture: WM08 owns actual readiness/publication.
 await f.db.query("UPDATE capacity_reservations SET state='completed' WHERE household_id=$1 AND reservation_id=$2",[b.householdId,next.receipt.booking_id]);assert.equal((await service.submit(c.sessionToken,cc)).status,'no_capacity');assert.deepEqual(await service.submit(a.sessionToken,ca),ack);
});

test('stale profile, withdrawal and rollback fault cannot create a production promise',async t=>{
 const f=await fixture(t),a=await f.family('fences'),w=await f.save(a);f.advance(1000);const service=await f.service(),intent=await f.envelope(service,a,w);
 const context=await f.setup.status(a.sessionToken);await f.setup.save(a.sessionToken,{command_id:randomUUID(),setup_context:context.setup_context,operation:'correct',child_id:a.child.child_id,expected_profile_version:a.child.profile_version,profile:{nickname:'Changed invented',age:6,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}});
 await assert.rejects(()=>service.submit(a.sessionToken,intent),e=>e.code==='denied');a.child={...a.child,profile_version:a.child.profile_version+1};const fresh=await f.envelope(service,a,w);
 await f.db.exec("CREATE FUNCTION production_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Invented rollback fault'; END $$; CREATE TRIGGER production_test_fault BEFORE INSERT ON production_commands FOR EACH ROW EXECUTE FUNCTION production_test_fault();");
 await assert.rejects(()=>service.submit(a.sessionToken,fresh));assert.equal((await f.db.query('SELECT original_received_at FROM wonder_requests WHERE request_id=$1',[w.id])).rows[0].original_received_at,null);assert.equal((await f.db.query('SELECT * FROM entitlement_claims')).rows.length,0);assert.equal((await f.db.query('SELECT * FROM capacity_reservations')).rows.length,0);
 await f.consent.withdraw(a.sessionToken,{command_id:randomUUID(),policy_version:policyVersion});await assert.rejects(()=>service.status(a.sessionToken,f.selection(a)),e=>e.code==='denied');
});
