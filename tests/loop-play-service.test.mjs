import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {fixtureAdventure} from '../lib/loop/fixture-adventure.mjs';
import {assistedFixtureAdventure} from '../lib/loop/assisted-fixture.mjs';
import {createPlayer} from '../lib/loop/player-engine.mjs';
import {createAssistedPlayer} from '../lib/loop/assisted-player.mjs';
import {createSyntheticPlayJournal} from '../server/play-journal.mjs';
import {createSyntheticPlayService} from '../server/play-service.mjs';
import {createSyntheticPlayServer} from '../server/play-http.mjs';
const env={LOOP_ENV:'local-synthetic'};
const denied=(fn,codes)=>assert.rejects(fn,e=>codes.includes(e.code));
function noData(value) {
  if(!value||typeof value!=='object') return;
  assert(!Object.hasOwn(value,'checkpoint'));assert(!Object.hasOwn(value,'events'));
  assert.notEqual(value.status,'acknowledged');assert.notEqual(value.event_type,'progress_saved');
  Object.values(value).forEach(noData);
}
async function fixture(t,version='fixture-engine-2') {
  const db=await createSyntheticDatabase(env),directory=await mkdtemp(path.join(os.tmpdir(),'loop-play-test-'));
  let fault,closed=false;
  const journal=await createSyntheticPlayJournal({env,directory,testHooks:{beforeAppend:async r=>{if(fault)await fault(r);}}});
  t.after(async()=>{if(!closed)await journal.close();await db.close();await rm(directory,{recursive:true,force:true});});
  await migrate(db);
  const scope={household_id:randomUUID(),child_id:randomUUID(),assignment_id:randomUUID(),play_id:randomUUID(),revision_id:randomUUID(),consent_epoch:1};
  const request=randomUUID(),spec={...structuredClone(version==='fixture-engine-1'?fixtureAdventure:assistedFixtureAdventure),revision_id:scope.revision_id};
  await db.transaction(async tx=>{
    await tx.query('INSERT INTO households VALUES($1)',[scope.household_id]);
    await tx.query("INSERT INTO service_consents VALUES($1,1,'active')",[scope.household_id]);
    await tx.query('INSERT INTO children(household_id,child_id) VALUES($1,$2)',[scope.household_id,scope.child_id]);
    await tx.query('INSERT INTO wonder_requests(household_id,request_id,child_id) VALUES($1,$2,$3)',[scope.household_id,request,scope.child_id]);
    await tx.query('INSERT INTO request_source_scopes(household_id,request_id,source_scope_version) VALUES($1,$2,1)',[scope.household_id,request]);
    await tx.query("INSERT INTO adventure_revisions(household_id,revision_id,request_id,source_scope_version,pattern_version,engine_version,status) VALUES($1,$2,$3,1,'fixture-1',$4,'published')",[scope.household_id,scope.revision_id,request,version]);
    await tx.query('INSERT INTO published_revisions(household_id,revision_id) VALUES($1,$2)',[scope.household_id,scope.revision_id]);
    await tx.query('INSERT INTO assignments VALUES($1,$2,$3,$4,$5)',[scope.household_id,scope.assignment_id,request,scope.child_id,scope.revision_id]);
  });
  const entry={household_id:scope.household_id,revision_id:scope.revision_id,spec,starting_path:'medium',starting_reason:'Synthetic human-selected test path.'};
  const make=(database=db,catalog=[entry])=>createSyntheticPlayService({db:database,env,catalog,journal,clock:()=>1900000000123});
  const service=make();
  const player=version==='fixture-engine-1'?createPlayer(spec,{playId:scope.play_id,consentEpoch:1}):createAssistedPlayer(spec,{playId:scope.play_id,consentEpoch:1,startingPath:'medium',startingReason:entry.starting_reason});
  const start={contract_version:'1.1.0',command_id:randomUUID(),play_id:scope.play_id,consent_epoch:1,revision_id:scope.revision_id,pattern_version:'fixture-1',engine_version:version};
  const resume={play_id:scope.play_id,revision_id:scope.revision_id,consent_epoch:1};
  const command=action=>({contract_version:'1.1.0',play_id:scope.play_id,action_id:randomUUID(),expected_sequence:player.snapshot().sequence,consent_epoch:1,revision_id:scope.revision_id,pattern_version:'fixture-1',action});
  const send=async action=>{const cmd=command(action),result=await service.commit(scope,cmd);assert.equal(result.status,'acknowledged');assert.deepEqual(result.checkpoint.state,player.dispatch(cmd));return {cmd,result};};
  const snapshot=async()=>{const out={};for(const table of ['play_sessions','play_service_metadata','play_start_commands','play_action_commands','play_checkpoints','play_events'])out[table]=(await db.query(`SELECT * FROM ${table} WHERE household_id=$1 AND play_id=$2`,[scope.household_id,scope.play_id])).rows;return out;};
  return {db,journal,directory,scope,entry,make,service,player,start,resume,command,send,snapshot,setFault:f=>{fault=f;},closeJournal:async()=>{await journal.close();closed=true;}};
}
for(const version of ['fixture-engine-1','fixture-engine-2']) test('real primary transitions and original retry receipts '+version,async t=>{
  const f=await fixture(t,version),{service,scope}=f;
  const started=await service.start(scope,f.start);assert.deepEqual(started.events,[]);assert.equal(started.checkpoint.last_event_sequence,0);
  assert.deepEqual(await service.start(scope,f.start),started);
  await denied(()=>service.commit(scope,f.command({kind:'test',prediction_action_id:randomUUID(),configuration_action_id:randomUUID()})),['validation_failed']);
  const p=await f.send({kind:'predict',prediction:'tips'}),c=await f.send({kind:'configure',configuration:'offset'});
  assert.equal(c.result.checkpoint.state.trials.length,0);
  const tested=await f.send({kind:'test',prediction_action_id:p.cmd.action_id,configuration_action_id:c.cmd.action_id});
  assert.equal(tested.result.checkpoint.last_event_sequence,4);assert.equal(tested.result.checkpoint.state.trials.length,1);
  assert.deepEqual(tested.result.events.map(e=>e.event_type),['test_resolved','progress_saved']);
  assert(tested.result.events.every(e=>e.server_at==='2030-03-17T17:46:40Z'));
  await f.send({kind:'predict',prediction:'not_sure'});
  assert.deepEqual(await service.commit(scope,tested.cmd),tested.result);
  await denied(()=>service.commit(scope,{...tested.cmd,action:{kind:'predict',prediction:'stable'}}),['conflict']);
  await denied(()=>service.commit(scope,{...tested.cmd,action_id:randomUUID()}),['conflict']);
  const before=await f.snapshot();
  for(const extra of [{server_at:'2000-01-01T00:00:00Z'},{outcome:'stable'},{scope}])await denied(()=>service.commit(scope,{...f.command({kind:'configure',configuration:'balanced'}),...extra}),['validation_failed']);
  for(const field of ['household_id','child_id','assignment_id','revision_id'])await denied(()=>service.resume({...scope,[field]:randomUUID()},f.resume),['denied']);
  assert.deepEqual(await f.snapshot(),before);
  const pair=[f.command({kind:'configure',configuration:'balanced'}),f.command({kind:'configure',configuration:'offset'})];
  const race=await Promise.allSettled(pair.map(cmd=>service.commit(scope,cmd)));
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.reason?.code==='conflict').length,1);
  f.player.dispatch(pair[race.findIndex(r=>r.status==='fulfilled')]);
  assert.deepEqual((await service.resume(scope,f.resume)).checkpoint.state,f.player.snapshot());
});
test('real SQL rollback at each gameplay write boundary',async t=>{
  const f=await fixture(t);await f.service.start(f.scope,f.start);
  for(const table of ['play_action_commands','play_events','play_checkpoints','play_sessions']) {
    let injected=false;
    const wrapper={query:(...args)=>f.db.query(...args),transaction:fn=>f.db.transaction(tx=>fn(new Proxy(tx,{get(target,key){
      if(key==='query')return async(sql,...args)=>{if(!injected&&new RegExp('(?:insert\\s+into|update)\\s+'+table+'\\b','i').test(sql)){injected=true;throw Object.assign(Error('Synthetic SQL failure'),{code:'23514'});}return target.query(sql,...args);};
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }})))};
    const before=await f.snapshot();await denied(()=>f.make(wrapper).commit(f.scope,f.command({kind:'predict',prediction:'tips'})),['23514','recovery_required']);
    assert(injected);assert.deepEqual(await f.snapshot(),before);
  }
});
test('pending Configure and Test hide all progress over actual HTTP; backfill applies once',async t=>{
  const f=await fixture(t);await f.service.start(f.scope,f.start);
  const token=randomBytes(32).toString('base64url');
  const server=createSyntheticPlayServer({service:f.service,env,capabilities:new Map([[token,f.scope]])});
  assert.throws(()=>server.listen(0,'0.0.0.0'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port;
  const post=(route,input,headers={})=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...headers},body:JSON.stringify(input)});
  const p=await f.send({kind:'predict',prediction:'tips'});
  let c;
  for(const action of [{kind:'configure',configuration:'offset'},{kind:'test',prediction_action_id:p.cmd.action_id,configuration_action_id:null}]) {
    if(action.kind==='test')action.configuration_action_id=c.action_id;
    const cmd=f.command(action);if(action.kind==='configure')c=cmd;
    f.setFault(async()=>{throw Error('Synthetic outage');});
    const pending=await f.service.commit(f.scope,cmd);assert.equal(pending.status,'retryable_unacknowledged');noData(pending);
    noData(await f.service.resume(f.scope,f.resume));
    const response=await post('/play/resume',f.resume);assert.equal(response.status,503);noData(await response.json());
    const before=await f.snapshot();await denied(()=>f.service.commit(f.scope,{...cmd,action_id:randomUUID()}),['journal_unavailable']);assert.deepEqual(await f.snapshot(),before);
    if(action.kind==='test')assert.deepEqual(before.play_action_commands.at(-1).result.events.map(e=>e.event_type),['test_resolved','progress_saved']);
    f.setFault(null);const result=await f.service.commit(f.scope,cmd);assert.equal(result.status,'acknowledged');assert.equal(result.primary_commit_id,pending.primary_commit_id);
    assert.deepEqual(result.checkpoint.state,f.player.dispatch(cmd));assert.deepEqual(await f.service.commit(f.scope,cmd),result);
    assert.equal((await f.snapshot()).play_events.length,before.play_events.length);
  }
  const response=await post('/play/resume',f.resume);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert(!response.headers.has('access-control-allow-origin'));
  assert.equal((await post('/play/resume',f.resume,{Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await post('/play/resume',f.resume,{'X-Forwarded-Host':'localhost'})).status,403);
  assert.equal((await post('/play/resume',{...f.resume,password:'synthetic'})).status,400);
});
test('independent process reopen, killed writer, checksum and truncation fail closed',async t=>{
  const f=await fixture(t);const result=await f.service.start(f.scope,f.start),id=result.durability_ref.slice(12),record=await f.journal.read(id);
  await f.closeJournal();
  const moduleUrl=new URL('../server/play-journal.mjs',import.meta.url).href;
  const script=`import {createSyntheticPlayJournal} from ${JSON.stringify(moduleUrl)};const j=await createSyntheticPlayJournal({env:{LOOP_ENV:'local-synthetic'},directory:process.argv[1]});console.log(JSON.stringify(await j.read(process.argv[2])));await j.close();`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script,f.directory,id],{encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout),record);
  const crashDir=await mkdtemp(path.join(os.tmpdir(),'loop-play-crash-'));t.after(()=>rm(crashDir,{recursive:true,force:true}));
  const crash=`import {createSyntheticPlayJournal} from ${JSON.stringify(moduleUrl)};const j=await createSyntheticPlayJournal({env:{LOOP_ENV:'local-synthetic'},directory:process.argv[1]});await j.append(JSON.parse(process.argv[2]));process.kill(process.pid,'SIGKILL');`;
  assert.notEqual(spawnSync(process.execPath,['--input-type=module','-e',crash,crashDir,JSON.stringify(record)],{timeout:30000}).status,0);
  const reopened=await createSyntheticPlayJournal({env,directory:crashDir});assert.deepEqual(await reopened.read(id),record);await reopened.close();
  const bytes=await readFile(path.join(crashDir,'play-journal.log'));
  for(const damage of ['checksum','truncation']) {
    const directory=await mkdtemp(path.join(os.tmpdir(),'loop-play-damage-'));t.after(()=>rm(directory,{recursive:true,force:true}));
    const altered=damage==='truncation'?bytes.subarray(0,bytes.length-1):Buffer.from(bytes);
    if(damage==='checksum') {const index=altered.indexOf(Buffer.from('Synthetic'));assert(index>74);altered[index]=115;}
    await writeFile(path.join(directory,'play-journal.log'),altered);
    await denied(()=>createSyntheticPlayJournal({env,directory}),['recovery_required']);
  }
});
test('withdrawal-first denies duplicates and original epoch cannot be rewritten',async t=>{
  const f=await fixture(t);await f.service.start(f.scope,f.start);const accepted=await f.send({kind:'predict',prediction:'tips'});const before=await f.snapshot();
  await f.db.transaction(async tx=>{await tx.query('SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[f.scope.household_id]);await tx.query("INSERT INTO service_consents VALUES($1,2,'withdrawn')",[f.scope.household_id]);});
  await denied(()=>f.service.commit(f.scope,accepted.cmd),['denied']);await denied(()=>f.service.resume(f.scope,f.resume),['denied']);assert.deepEqual(await f.snapshot(),before);
});
