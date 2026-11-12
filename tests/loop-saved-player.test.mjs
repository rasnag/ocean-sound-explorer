import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {createSyntheticPlayJournal} from '../server/play-journal.mjs';
import {createSyntheticSavedServer} from '../server/saved-preview.mjs';
import {createSavedPlayerClient} from '../lib/loop/saved-player.mjs';
import {endingFixtureAdventure} from '../lib/loop/ending-fixture.mjs';
import {fixtureAdventure} from '../lib/loop/fixture-adventure.mjs';

const env={LOOP_ENV:'local-synthetic'};
async function seed(db,s,a){
  const request=randomUUID();
  await db.transaction(async tx=>{
    await tx.query('INSERT INTO households VALUES($1)',[s.household_id]);
    await tx.query("INSERT INTO service_consents VALUES($1,1,'active')",[s.household_id]);
    await tx.query('INSERT INTO children(household_id,child_id) VALUES($1,$2)',[s.household_id,s.child_id]);
    await tx.query('INSERT INTO wonder_requests(household_id,request_id,child_id) VALUES($1,$2,$3)',[s.household_id,request,s.child_id]);
    await tx.query('INSERT INTO request_source_scopes(household_id,request_id,source_scope_version) VALUES($1,$2,1)',[s.household_id,request]);
    await tx.query("INSERT INTO adventure_revisions(household_id,revision_id,request_id,source_scope_version,pattern_version,engine_version,status,payload_ref) VALUES($1,$2,$3,1,'fixture-1',$4,'published','synthetic:unreviewed-saved-test')",[s.household_id,s.revision_id,request,a.engine_version]);
    await tx.query('INSERT INTO published_revisions(household_id,revision_id) VALUES($1,$2)',[s.household_id,s.revision_id]);
    await tx.query('INSERT INTO assignments VALUES($1,$2,$3,$4,$5)',[s.household_id,s.assignment_id,request,s.child_id,s.revision_id]);
  });
}
async function fixture(engine,work){
  const db=await createSyntheticDatabase(env),directory=await mkdtemp(path.join(os.tmpdir(),'saved-player-test-'));
  let server,journal,outage=false,lost=null;
  try{
    await migrate(db);
    const scope={household_id:randomUUID(),child_id:randomUUID(),assignment_id:randomUUID(),play_id:randomUUID(),revision_id:randomUUID(),consent_epoch:1};
    const adventure={...structuredClone(engine===1?fixtureAdventure:endingFixtureAdventure),revision_id:scope.revision_id};
    await seed(db,scope,adventure);
    journal=await createSyntheticPlayJournal({env,directory,testHooks:{beforeAppend:async()=>{if(outage)throw Error('Invented journal fault');}}});
    server=createSyntheticSavedServer({db,journal,env,scope,adventure,testHooks:{beforeRespond:async r=>{if(lost?.(r)){lost=null;throw Error('Invented response loss');}return {forged:true};}}});
    assert.throws(()=>server.listen(0,'0.0.0.0'));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port,calls=[];
    const request=async(route,body,headers={})=>{
      calls.push(structuredClone({route,body}));
      const r=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
      assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
      assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert(r.headers.get('content-security-policy'));assert(!r.headers.has('access-control-allow-origin'));
      return {status:r.status,body:await r.json()};
    };
    await work({db,scope,adventure,request,calls,client:()=>createSavedPlayerClient({request,newActionId:randomUUID}),fault:value=>{outage=value;},lose:fn=>{lost=fn;}});
  }finally{
    if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(journal)await journal.close();await db.close();
    assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));await rm(directory,{recursive:true,force:true});
  }
}
for(const engine of [1,2])test(`real saved HTTP/PG/journal engine${engine}: pending, retry, conflict, history and withdrawal`,async()=>{
  await fixture(engine,async({db,scope,adventure,request,calls,client,fault,lose})=>{
    const a=client();await a.open();assert.equal(a.snapshot().phase,'ready');
    assert.deepEqual(a.snapshot().adventure,adventure);assert.equal(a.snapshot().confirmed.acknowledgement_scope,'single-host-process-recovery-only');
    await a.dispatch({kind:'predict',prediction:'tips'});await a.dispatch({kind:'configure',configuration:'offset'});
    const s=a.snapshot().confirmed.checkpoint.state;
    lose(r=>r.route==='/saved/action'&&r.body.command.action.kind==='test');
    await a.dispatch({kind:'test',prediction_action_id:s.prediction_action_id,configuration_action_id:s.configuration_action_id});
    assert.equal(a.snapshot().phase,'pending');assert.equal(a.snapshot().confirmed.checkpoint.state.trials.length,0);
    const original=structuredClone(calls.at(-1));await a.retry();assert.deepEqual(calls.at(-1),original);
    assert.equal(a.snapshot().confirmed.checkpoint.state.trials.length,1);
    assert.equal((await db.query('SELECT count(*)::int n FROM play_action_commands')).rows[0].n,3);
    const confirmed=a.snapshot().confirmed;fault(true);await a.dispatch({kind:'predict',prediction:'stable'});
    assert.equal(a.snapshot().phase,'pending');assert.deepEqual(a.snapshot().confirmed,confirmed);
    const pending=structuredClone(calls.at(-1)),count=calls.length;
    await assert.rejects(()=>a.dispatch({kind:'configure',configuration:'balanced'}));assert.equal(calls.length,count);
    const unavailable=await request('/saved/open',{play_id:scope.play_id});assert.equal(unavailable.status,503);
    for(const key of ['checkpoint','events','result','adventure','history'])assert(!Object.hasOwn(unavailable.body,key));
    fault(false);await a.retry();assert.deepEqual(calls.at(-1),pending);assert.equal(a.snapshot().confirmed.checkpoint.state.sequence,4);
    lose(r=>r.route==='/saved/replay');await a.replay();const replay=structuredClone(calls.at(-1));
    await a.retry();assert.deepEqual(calls.at(-1),replay);const newer=a.snapshot().play_id;
    assert.notEqual(newer,scope.play_id);assert.equal(a.snapshot().confirmed.checkpoint.state.trials.length,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM play_sessions')).rows[0].n,2);
    const b=client();await b.open(scope.play_id);assert.equal(b.snapshot().confirmed.checkpoint.state.trials.length,1);
    assert.equal(b.snapshot().adventure.revision_id,scope.revision_id);await b.open(newer);
    const c=client();await c.open(newer);await b.dispatch({kind:'predict',prediction:'not_sure'});
    await c.dispatch({kind:'configure',configuration:'balanced'});assert.equal(c.snapshot().phase,'conflict');
    await assert.rejects(()=>c.retry());await c.reload();assert.equal(c.snapshot().confirmed.checkpoint.state.sequence,1);
    for(const [body,headers]of [[{play_id:randomUUID()},{}],[{play_id:newer,extra:true},{}],[{play_id:newer},{Origin:'https://foreign.invalid'}],[{play_id:newer},{Cookie:'synthetic=1'}]]){
      const r=await request('/saved/open',body,headers);assert([400,403].includes(r.status));assert(!r.body.result);
    }
    const wrong=structuredClone(pending.body);wrong.play_id=newer;wrong.command.play_id=newer;wrong.command.revision_id=randomUUID();wrong.command.action_id=randomUUID();
    const before=(await db.query('SELECT count(*)::int n FROM play_action_commands')).rows[0].n;
    assert([400,403,409].includes((await request('/saved/action',wrong)).status));
    assert.equal((await db.query('SELECT count(*)::int n FROM play_action_commands')).rows[0].n,before);
    if(engine===2){await c.dispatch({kind:'help',level:3});assert.equal(c.snapshot().confirmed.checkpoint.state.help_level,3);await c.dispatch({kind:'close_help'});await c.dispatch({kind:'side_thread',open:true});}
    await db.transaction(async tx=>{await tx.query('SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[scope.household_id]);await tx.query("INSERT INTO service_consents VALUES($1,2,'withdrawn')",[scope.household_id]);});
    await c.reload();assert.equal(c.snapshot().phase,'denied');assert.equal(c.snapshot().confirmed,null);assert.equal(c.snapshot().adventure,null);assert.deepEqual(c.snapshot().history,[]);
  });
});

test('construction and malformed acknowledgement fail closed',async()=>{
  assert.throws(()=>createSavedPlayerClient({request:async()=>{},extra:true}));
  assert.throws(()=>createSavedPlayerClient({request:null}));
  const c=createSavedPlayerClient({request:async()=>({status:200,body:{mode:'local-synthetic',production_ready:false,result:{forged:true},adventure:{},history:[]}})});
  await c.open();assert.equal(c.snapshot().phase,'failed');assert.equal(c.snapshot().confirmed,null);
  await assert.rejects(()=>c.dispatch({kind:'test',outcome:'stable'}));
});
