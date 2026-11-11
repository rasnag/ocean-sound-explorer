import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {createEntitlementKernel} from '../lib/loop/entitlements.mjs';

const env = {LOOP_ENV:'local-synthetic'};
const policy = {synthetic:true,policy_version:'invented-test-policy',allowance:1,duration_seconds:60,allocation_scope:'household'};
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);
async function setup() {
  const db = await createSyntheticDatabase(env); await migrate(db);
  const household_id=randomUUID(), entitlement_id=randomUUID(), child_id=randomUUID();
  await db.query('INSERT INTO households VALUES($1)',[household_id]);
  await db.query("INSERT INTO service_consents VALUES($1,1,'active')",[household_id]);
  await db.query('INSERT INTO children(household_id,child_id) VALUES($1,$2)',[household_id,child_id]);
  await db.query('INSERT INTO entitlements VALUES($1,$2)',[household_id,entitlement_id]);
  let now=1900000000000;
  const kernel=createEntitlementKernel({env,clock:()=>now});
  const scope={household_id,consent_epoch:1};
  const activate=(command_id='activate')=>db.transaction(tx=>kernel.activateTrial(tx,scope,{command_id,entitlement_id},policy));
  async function request(received=now) {
    const id=randomUUID();
    await db.query('INSERT INTO wonder_requests(household_id,request_id,child_id,original_received_at) VALUES($1,$2,$3,$4)',[household_id,id,child_id,new Date(received).toISOString()]);
    return id;
  }
  const event=(period_id,request_id,kind='hold',expected_version=0)=>({contract_version:'1.1.0',transition_id:randomUUID(),request_id,period_id,policy_version:policy.policy_version,expected_version,consent_epoch:1,quantity:1,kind,
    from:kind==='hold'?'none':'pending',to:kind==='hold'?'pending':'released',cause:kind==='hold'?'SubmitProduction':'CancelRequest',cause_id:randomUUID()});
  const apply=t=>db.transaction(tx=>kernel.apply(tx,scope,t));
  const read=p=>db.transaction(tx=>kernel.readAllowance(tx,scope,{period_id:p}));
  return {db,kernel,scope,entitlement_id,activate,request,event,apply,read,advance:ms=>{now+=ms;}};
}

test('explicit activation, terminal release and last-unit serialization use actual PostgreSQL',async()=>{
  const f=await setup();
  try {
    assert.equal((await f.db.query('SELECT count(*)::int AS n FROM entitlement_periods')).rows[0].n,0);
    await rejects(()=>f.kernel.activateTrial(f.db,f.scope,{command_id:'outside',entitlement_id:f.entitlement_id},policy),'25P01');
    const p=await f.activate(); f.advance(1000);
    assert.deepEqual(await f.activate(),p);
    assert.deepEqual(await f.activate('second-command'),p);
    const requests=await Promise.all([f.request(),f.request()]);
    const events=requests.map(r=>f.event(p.period_id,r));
    const outcomes=await Promise.allSettled(events.map(f.apply));
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(x=>x.status==='rejected'&&x.reason.code==='quota_full').length,1);
    const index=outcomes.findIndex(x=>x.status==='fulfilled');
    assert.deepEqual(await f.apply(events[index]),outcomes[index].value);
    await rejects(()=>f.apply({...events[index],cause_id:'changed'}),'conflict');
    assert.equal((await f.read(p.period_id)).remaining,0);
    await f.apply(f.event(p.period_id,requests[index],'release',1));
    assert.equal((await f.read(p.period_id)).remaining,1);
    await rejects(()=>f.apply(f.event(p.period_id,requests[index])),'conflict');
  } finally {await f.db.close();}
});

test('outer rollback and actual SQL failure preserve caller transaction work',async()=>{
  const f=await setup();
  try {
    const p=await f.activate(), r=await f.request(), e=f.event(p.period_id,r);
    await assert.rejects(()=>f.db.transaction(async tx=>{await f.kernel.apply(tx,f.scope,e);throw Error('outer failure');}),/outer failure/);
    assert.equal((await f.read(p.period_id)).pending,0);
    await f.db.exec(`CREATE TABLE entitlement_test_marker(n integer);
      CREATE FUNCTION entitlement_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'synthetic failure' USING ERRCODE='23514'; END $$;
      CREATE TRIGGER entitlement_test_failure BEFORE INSERT ON entitlement_transitions FOR EACH ROW EXECUTE FUNCTION entitlement_test_failure();`);
    await f.db.transaction(async tx=>{
      await tx.exec('INSERT INTO entitlement_test_marker VALUES(1)');
      await rejects(()=>f.kernel.apply(tx,f.scope,e),'23514');
      assert.equal((await tx.query('SELECT count(*)::int AS n FROM entitlement_test_marker')).rows[0].n,1);
      assert.equal((await tx.query('SELECT count(*)::int AS n FROM entitlement_claims')).rows[0].n,0);
      await tx.exec('DROP TRIGGER entitlement_test_failure ON entitlement_transitions');
      assert.equal((await f.kernel.apply(tx,f.scope,e)).uncommitted,true);
    });
    assert.equal((await f.read(p.period_id)).pending,1);
  } finally {await f.db.close();}
});

test('stored receipt boundaries, immutable interval and current consent are enforced',async()=>{
  const f=await setup();
  try {
    const p=await f.activate();
    const before=await f.request(Date.parse(p.trial_start)-1), end=await f.request(Date.parse(p.trial_end));
    await rejects(()=>f.apply(f.event(p.period_id,before)),'ineligible');
    f.advance(61000);
    await rejects(()=>f.apply(f.event(p.period_id,end)),'ineligible');
    const eligible=await f.request(Date.parse(p.trial_start));
    await f.apply(f.event(p.period_id,eligible));
    await rejects(()=>f.db.query("UPDATE entitlement_periods SET trial_end=trial_end+interval '1 second'"),'55000');
    await rejects(()=>f.db.query("UPDATE wonder_requests SET original_received_at=original_received_at+interval '1 second' WHERE request_id=$1",[eligible]),'55000');
    await f.db.query("INSERT INTO service_consents VALUES($1,2,'withdrawn')",[f.scope.household_id]);
    await rejects(()=>f.read(p.period_id),'denied');
  } finally {await f.db.close();}
});
