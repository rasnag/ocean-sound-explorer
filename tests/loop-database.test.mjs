import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
import {migrate} from '../db/migrate.mjs';
import {seedSynthetic} from '../db/synthetic-fixtures.mjs';

const open = () => createSyntheticDatabase({LOOP_ENV:'local-synthetic'});
const rejectsCode = (fn, code) => assert.rejects(fn, error => error.code === code);
const tables = ['households','service_consents','children','wonder_requests',
  'request_source_scopes','capacity_reservations','entitlements',
  'adventure_revisions','published_revisions','assignments','play_sessions','play_events'];

async function count(db, table, household) {
  assert(tables.includes(table));
  return (await db.query(`select count(*)::int n from ${table} where household_id=$1`,[household])).rows[0].n;
}

async function eventUnique(db, params, columns) {
  let rejected;
  try {
    await db.query('insert into play_events values($1,$2,$3,$4,$5)',params);
  } catch (error) {
    rejected = error;
  }
  assert.equal(rejected?.code,'23505');
  const result = await db.query(`select a.attname
    from pg_index i join pg_class c on c.oid=i.indexrelid
    cross join lateral unnest(i.indkey) with ordinality k(attnum,position)
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
    where i.indrelid='play_events'::regclass and c.relname=$1
      and i.indisunique and k.position<=i.indnkeyatts
    order by k.position`,[rejected.constraint]);
  assert.deepEqual(result.rows.map(row => row.attname),columns);
}

test('local factory preserves guard failures and returns an empty real PostgreSQL engine', async () => {
  for (const env of [{}, {LOOP_ENV:'preview'}, {LOOP_ENV:'production'},
    {LOOP_ENV:'unknown'},
    {LOOP_ENV:'local-synthetic',LOOP_DB_URL:'postgres://remote.invalid/db'},
    {LOOP_ENV:'local-synthetic',LOOP_AI_ALLOWED:'true'},
    {LOOP_ENV:'local-synthetic',LOOP_SMTP_ALLOWED:'true'},
    {LOOP_ENV:'local-synthetic',VITE_LOOP_WORKER_CREDENTIAL:'invented'}]) {
    let expected;
    try { resolveLoopConfig(env); } catch (error) { expected = error; }
    assert(expected);
    await assert.rejects(() => createSyntheticDatabase(env),
      error => error.name === expected.name && error.message === expected.message);
  }
  const db = await open();
  try {
    assert.equal((await db.query("select to_regclass('households') name")).rows[0].name,null);
    assert.match((await db.query('select version() value')).rows[0].value,/PostgreSQL 18/);
  } finally { await db.close(); }
});

test('two fresh databases reproduce scoped fixtures, constraints and household deletion', async () => {
  for (let iteration=0; iteration<2; iteration++) {
    const db = await open();
    try {
      await migrate(db);
      await seedSynthetic(db);
      const versions = (await db.query('select * from schema_migrations order by version')).rows;
      await migrate(db);
      await seedSynthetic(db);
      assert.deepEqual((await db.query('select * from schema_migrations order by version')).rows,versions);
      const chains = await db.query(`select p.* from play_sessions p
        join assignments a using(household_id,assignment_id,child_id,revision_id)
        join adventure_revisions r using(household_id,revision_id,request_id)
        join published_revisions pub using(household_id,revision_id)
        join request_source_scopes s using(household_id,request_id,source_scope_version)
        join wonder_requests w using(household_id,request_id,child_id)
        order by p.household_id`);
      assert.equal(chains.rows.length,2);
      const [a,b] = chains.rows;
      for (const table of tables) {
        assert.equal(await count(db,table,a.household_id),1);
        assert.equal(await count(db,table,b.household_id),1);
      }
      assert.deepEqual((await db.query('select distinct pattern_version,engine_version from adventure_revisions')).rows,
        [{pattern_version:'fixture-1',engine_version:'fixture-engine-1'}]);
      await rejectsCode(() => db.query('insert into play_events values($1,$2,$3,2,$4)',
        [b.household_id,a.play_id,randomUUID(),{}]),'23503');
      await rejectsCode(() => db.query('insert into play_events values($1,$2,$3,0,$4)',
        [a.household_id,a.play_id,randomUUID(),{}]),'23514');
      const event = (await db.query('select * from play_events where household_id=$1',[a.household_id])).rows[0];
      await eventUnique(db,[a.household_id,a.play_id,event.action_id,2,{}],
        ['household_id','play_id','action_id']);
      await eventUnique(db,[a.household_id,a.play_id,randomUUID(),1,{}],
        ['household_id','play_id','sequence']);
      await rejectsCode(() => db.query('update play_sessions set sequence=-1 where household_id=$1',[a.household_id]),'23514');
      await rejectsCode(() => db.query("insert into service_consents values($1,0,'active')",[a.household_id]),'23514');
      const request = (await db.query('select * from wonder_requests where household_id=$1',[a.household_id])).rows[0];
      await rejectsCode(() => db.query('insert into request_source_scopes values($1,$2,0,$3)',
        [a.household_id,request.request_id,'synthetic:scope']),'23514');
      await rejectsCode(() => db.query("insert into capacity_reservations values($1,$2,$3,1,0,$4,'booked')",
        [a.household_id,randomUUID(),request.request_id,randomUUID()]),'23514');
      await rejectsCode(() => db.query("update adventure_revisions set payload_ref='synthetic:changed' where household_id=$1",[a.household_id]),'55000');
      await rejectsCode(() => db.query('update request_source_scopes set source_scope_version=2 where household_id=$1',[a.household_id]),'55000');
      const temporary = randomUUID();
      await assert.rejects(() => db.transaction(async tx => {
        await tx.query('insert into households values($1)',[temporary]);
        throw new Error('intentional rollback');
      }),/intentional rollback/);
      assert.equal(await count(db,'households',temporary),0);
      await db.query('delete from households where household_id=$1',[a.household_id]);
      for (const table of tables) {
        assert.equal(await count(db,table,a.household_id),0);
        assert.equal(await count(db,table,b.household_id),1);
      }
    } finally { await db.close(); }
  }
});

test('assignment scope failures remain immediate while duplicate request assignments cannot commit', async () => {
  const db = await open();
  try {
    await migrate(db);
    await seedSynthetic(db);
    const original = (await db.query('select * from assignments order by household_id limit 1')).rows[0];
    const h = original.household_id;
    const child = randomUUID(), request = randomUUID(), revision = randomUUID();
    await db.query('insert into children(household_id,child_id) values($1,$2)',[h,child]);
    await db.query('insert into wonder_requests(household_id,request_id,child_id) values($1,$2,$3)',[h,request,child]);
    await db.query('insert into request_source_scopes(household_id,request_id,source_scope_version) values($1,$2,1)',[h,request]);
    await db.query("insert into adventure_revisions(household_id,revision_id,request_id,source_scope_version,pattern_version,engine_version,status) values($1,$2,$3,1,'fixture-1','fixture-engine-1','published')",[h,revision,request]);
    await db.query('insert into published_revisions(household_id,revision_id) values($1,$2)',[h,revision]);
    const insert = (target, changes={}) => {
      const row = {...original,assignment_id:randomUUID(),...changes};
      return target.query('insert into assignments values($1,$2,$3,$4,$5)',
        [row.household_id,row.assignment_id,row.request_id,row.child_id,row.revision_id]);
    };
    // Each case also duplicates the existing request. Its relationship error
    // must be diagnosed rather than masked by that unrelated unique key.
    await rejectsCode(() => insert(db,{child_id:child}),'23503');
    await rejectsCode(() => insert(db,{revision_id:revision}),'23503');
    const draft = randomUUID();
    await db.query("insert into adventure_revisions(household_id,revision_id,request_id,source_scope_version,pattern_version,engine_version,status) values($1,$2,$3,1,'fixture-1','fixture-engine-1','draft')",[h,draft,original.request_id]);
    await rejectsCode(() => insert(db,{revision_id:draft}),'23503');
    const before = await count(db,'assignments',h);
    let reachedCommit = false;
    const marker = randomUUID();
    await assert.rejects(() => db.transaction(async tx => {
      await tx.query('insert into households values($1)',[marker]);
      await insert(tx);
      reachedCommit = true;
    }),error => error.code === '23505'
      && error.constraint === 'assignments_household_id_request_id_key');
    assert.equal(reachedCommit,true,'uniqueness must be enforced at commit');
    assert.equal(await count(db,'assignments',h),before);
    assert.equal(await count(db,'households',marker),0,'commit rejection rolls back the whole transaction');
    await insert(db,{request_id:request,child_id:child,revision_id:revision});
    assert.equal(await count(db,'assignments',h),before+1,'a valid new canonical chain remains insertable');
  } finally { await db.close(); }
});

test('migration checksums and actual SQL/registry failures preserve atomicity', async () => {
  const db = await open();
  try {
    const first = {version:100,sql:'create table migration_test(value integer);'};
    await migrate(db,{migrations:[first]});
    const before = (await db.query('select * from schema_migrations')).rows;
    await assert.rejects(() => migrate(db,{migrations:[{...first,sql:first.sql+' -- changed'}]}),
      error => error.code === 'MIGRATION_CHECKSUM_MISMATCH');
    assert.deepEqual((await db.query('select * from schema_migrations')).rows,before);
    await rejectsCode(() => migrate(db,{migrations:[{version:101,sql:'create table sql_partial(value integer); select 1/0;'}]}),'22012');
    assert.equal((await db.query("select to_regclass('sql_partial') name")).rows[0].name,null);
    await db.exec(`create function reject_migration() returns trigger language plpgsql as $$
      begin raise exception 'intentional registry failure' using errcode='23514'; end $$;
      create trigger reject_migration before insert on schema_migrations for each row execute function reject_migration();`);
    await rejectsCode(() => migrate(db,{migrations:[{version:102,sql:'create table registry_partial(value integer); insert into registry_partial values(1);'}]}),'23514');
    assert.equal((await db.query("select to_regclass('registry_partial') name")).rows[0].name,null);
    assert.deepEqual((await db.query('select * from schema_migrations')).rows,before);
  } finally { await db.close(); }
});
