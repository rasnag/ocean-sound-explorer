// AUTHORED, NOT RUN BY THE AUTHOR. Supplementary actual-producer fixture,
// NOT empty-store or browser acceptance. No successful service response is stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {performance} from 'node:perf_hooks';
import {privateBridgeFixture,readyBridgeSource} from './private-bridge-fixture.mjs';
import {createSyntheticJourneyPlay} from '../server/journey-play.mjs';
import {createSyntheticPlayJournal} from '../server/play-journal.mjs';
import {createSyntheticFamilySpace} from '../server/family-space.mjs';
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('actual saved reopen reduces repeated transaction work and rejects a receipt held across withdrawal',{timeout:180000},async t=>{
 const f=await privateBridgeFixture(t),x=await readyBridgeSource(f,'Invented transaction-local saved reopen control.');
 const ready=await f.bridge.makeReady(f.founderToken,x.command);assert.equal(ready.status,'acknowledged');
 const env={LOOP_ENV:'local-synthetic'},directory=await mkdtemp(join(tmpdir(),'loop-journey-priority-'));
 let journal,server;
 f.cleanup(async()=>{
  if(server?.listening)await new Promise(done=>{server.close(done);server.closeAllConnections?.();});
  await journal?.close();
  const owned=await realpath(directory),temporary=await realpath(tmpdir());
  assert.equal(dirname(owned),temporary);assert(basename(owned).startsWith('loop-journey-priority-'));
  await rm(owned,{recursive:true,force:true});
 });
 journal=await createSyntheticPlayJournal({env,directory});
 const journey=await createSyntheticJourneyPlay({env,db:f.db,access:f.access,bridge:f.bridge.familyAdapter,journal,clock:f.clock});
 const reached=gate(),release=gate();let hold=false,reconciles=0;
 const family=await createSyntheticFamilySpace({env,db:f.db,access:f.access,bridge:f.bridge.familyAdapter,queue:f.queueAdapter,clock:f.clock,policyVersion:'TEST-v1',
  content:{question:f.capture.question,revision:async()=>{throw Error('Private content must not use the legacy resolver');}},
  play:{resume:async(...args)=>{
   const receipt=await journey.familyPlay.resume(...args);
   if(hold){hold=false;assert.equal(receipt.status,'acknowledged');reached.resolve();await release.promise;}
   return receipt;
  },reconcile:(...args)=>{reconciles++;return journey.familyPlay.reconcile(...args);}}
 });
 const opened=await f.openFamilyServer({family,journey:{context:journey.context,start:journey.start,open:journey.open,action:journey.action,trial:async()=>{throw Error('Trial is not exercised by this supplementary fixture');}}});server=opened.server;
 async function http(path,body){
  const response=await fetch(new URL(path,opened.origin),{method:body===undefined?'GET':'POST',headers:{Cookie:'loop_adult_session='+f.adult.sessionToken,Connection:'close',...(body===undefined?{}:{Origin:opened.origin,'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 async function post(path,body){const response=await http(path,body);assert.equal(response.status,200,path);return response.body;}
 const selected=f.selection(),selection={view_context:selected.view_context,child_id:selected.child_id},binding={...selection,assignment_id:ready.assignment_id,revision_id:ready.revision_id};
 const started=await post('/adult/journey/start',{...binding,command_id:randomUUID()});assert.equal(started.status,'journey_started');binding.play_id=started.play_id;
 let receipt=started.result;
 async function action(value){
  const command={contract_version:'1.1.0',play_id:binding.play_id,action_id:randomUUID(),expected_sequence:receipt.checkpoint.state.sequence,consent_epoch:receipt.checkpoint.state.consent_epoch,revision_id:binding.revision_id,pattern_version:'fixture-1',action:value};
  receipt=await post('/adult/journey/action',{...binding,command});assert.equal(receipt.status,'acknowledged');return command;
 }
 await action({kind:'predict',prediction:'tips'});await action({kind:'configure',configuration:'offset'});
 await action({kind:'test',prediction_action_id:receipt.checkpoint.state.prediction_action_id,configuration_action_id:receipt.checkpoint.state.configuration_action_id});assert.equal(receipt.checkpoint.state.trials.length,1);
 const tables=['journey_play_bindings','play_sessions','play_start_commands','play_action_commands','play_events','play_checkpoints','entitlement_periods','entitlement_claims','entitlement_transitions','capacity_reservations','production_receipts','private_bridge_commands','private_bridge_acks'];
 async function audit(){const value={};for(const table of tables)value[table]=(await f.db.query('SELECT to_jsonb(t) value FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;return value;}
 const before=await audit(),transaction=f.db.transaction,descriptor=Object.getOwnPropertyDescriptor(f.db,'transaction'),metrics=[];let sample=null,pending;
 // Observe real SQL on this fixture's sole connection. The actual transaction
 // handle remains the one branded by adult-access; query results are unchanged.
 Object.defineProperty(f.db,'transaction',{configurable:true,writable:true,value:function(work,...rest){
  const current=sample,row={queries:0,namespaces:0};if(current)current.transactions.push(row);
  return transaction.call(this,tx=>work(new Proxy(tx,{get(target,key){
   if(key==='query')return(sql,...args)=>{row.queries++;if(String(sql).replace(/\s+/g,' ').trim()==='SELECT namespace_verifier FROM private_bridge_namespace WHERE singleton=true')row.namespaces++;return target.query(sql,...args);};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }})),...rest);
 }});
 async function measured(kind,work){const row={kind,transactions:[]},at=performance.now();sample=row;try{return await work();}finally{sample=null;row.elapsed_ms=performance.now()-at;row.sql_calls=row.transactions.reduce((n,x)=>n+x.queries,0);row.namespace_checks=row.transactions.reduce((n,x)=>n+x.namespaces,0);metrics.push(row);}}
 try{
  // Repeating both operations proves the reuse is not a completed-request cache.
  for(let i=0;i<2;i++){
   const view=await measured('read',()=>post('/adult/family/read',selection));
   assert.equal(view.plays.length,1);assert.equal(view.plays[0].play_id,binding.play_id);assert.equal(view.plays[0].trial_count,1);
   const saved=await measured('open',()=>post('/adult/family/open',{...binding,entry_kind:'play'}));
   assert.equal(saved.state,'resume');assert.deepEqual(saved.receipt,receipt);assert.equal(saved.assignment.question,'Invented transaction-local saved reopen control.');
  }
  for(const row of metrics){
   // Original guarded diagnostic measured19/16 namespace validations. Assert
   // reduced actual work, not wall-clock throughput or a compiler/source mirror.
   assert(row.namespace_checks>0&&row.namespace_checks<(row.kind==='read'?19:16),JSON.stringify(row));
   assert(row.transactions.filter(tx=>tx.namespaces>0).length>=4,'Current checks must remain in separate pre/raw/post transactions');
  }
  assert.equal(reconciles,0,'Acknowledged reads must not invoke repair');assert.deepEqual(await audit(),before);
  assert.equal(Number((await f.db.query('SELECT count(*) n FROM journey_play_bindings')).rows[0].n),1);
  hold=true;pending=http('/adult/family/open',{...binding,entry_kind:'play'});
  await Promise.race([reached.promise,pending.then(()=>{throw Error('Expected the real checked resume boundary to be held');})]);
  await post('/adult/consent/withdraw',{command_id:randomUUID(),policy_version:'TEST-v1'});
  assert.equal((await http('/adult/family/read',selection)).status,403,'Fresh authority must deny before releasing the old receipt');
  assert.equal((await http('/adult/journey/open',binding)).status,403);
  release.resolve();const denied=await pending;assert.equal(denied.status,403);assert(!JSON.stringify(denied.body).includes('Invented transaction-local saved reopen control.'));
  assert.equal((await http('/adult/family/open',{...binding,entry_kind:'play'})).status,403);
  assert.deepEqual(await audit(),before,'Reads/denials must preserve play, booking, trial, deadline and journal acknowledgement rows');
 }finally{
  release.resolve();await pending?.catch(()=>{});
  if(descriptor)Object.defineProperty(f.db,'transaction',descriptor);else Reflect.deleteProperty(f.db,'transaction');
  t.diagnostic('ACTUAL supplementary saved-reopen SQL work and latency, not throughput/browser acceptance: '+JSON.stringify(metrics));
 }
});
