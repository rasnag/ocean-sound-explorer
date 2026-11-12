import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,unlink,access} from 'node:fs/promises';
import {createRequire,registerHooks} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
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

test('actual React retries an uncertain Replay into the new introduction, retaining the old play',async()=>{
  await fixture(2,async({origin,lose,db})=>{
    const appRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url))),require=createRequire(new URL('../package.json',import.meta.url));
    const {JSDOM,VirtualConsole}=require('jsdom'),ts=require('typescript'),React=require('react');
    const vc=new VirtualConsole(),errors=[];vc.on('jsdomError',error=>errors.push(error));
    const dom=new JSDOM('<div id="root"></div>',{url:origin+'/loop-preview/saved',pretendToBeVisual:true,virtualConsole:vc});
    const names=['window','document','navigator','HTMLElement','Node','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch','Audio'];
    const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),nativeFetch=globalThis.fetch;
    const realFetch=(url,options)=>{const target=new URL(url,origin);assert.equal(target.origin,origin);return nativeFetch(target,options);};
    for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='fetch'?realFetch:dom.window[name]});
    dom.window.fetch=realFetch;
    for(const name of ['pause','load'])Object.defineProperty(dom.window.HTMLMediaElement.prototype,name,{configurable:true,value(){}});
    Object.defineProperty(dom.window.HTMLMediaElement.prototype,'play',{configurable:true,value(){return Promise.resolve();}});
    const hook=registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};return next(url,context);}});
    const temporary=path.join(appRoot,'app/.saved-replay-test.mjs');let owned=false,reactRoot;
    try{
      let exists=false;try{await access(temporary);exists=true;}catch{}assert(!exists,'preserve an existing test artifact');
      const source=await readFile(path.join(appRoot,'app/LoopSavedPlayer.tsx'),'utf8');
      const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
      await writeFile(temporary,compiled.outputText,{flag:'wx'});owned=true;
      const {default:Component}=await import(pathToFileURL(temporary).href),{createRoot}=require('react-dom/client');
      const host=dom.window.document.getElementById('root');reactRoot=createRoot(host);
      const find=id=>host.querySelector(`[data-testid="${id}"]`),phase=()=>find('saved-status')?.getAttribute('data-phase');
      const wait=async condition=>{const deadline=Date.now()+15000;while(!condition()){assert(Date.now()<deadline,'actual Replay UI did not settle');await React.act(async()=>new Promise(resolve=>setTimeout(resolve,25)));}};
      const click=async selector=>{const button=typeof selector==='string'?host.querySelector(selector):selector;assert(button&&!button.disabled,'missing active Replay control');await React.act(async()=>button.click());};
      await React.act(async()=>reactRoot.render(React.createElement(Component)));await wait(()=>phase()==='ready');
      await click(find('saved-start'));await wait(()=>find('saved-test'));
      for(const selector of ['button[data-prediction="stable"]','button[data-configuration="balanced"]','[data-testid="saved-test"]']){await click(selector);await wait(()=>phase()==='ready');}
      assert.equal(host.querySelectorAll('[data-testid="saved-trial"]').length,1);
      const original=find('saved-root').getAttribute('data-play-id');
      await click([...host.querySelectorAll('button')].find(button=>button.textContent==='Pause and look back'));
      let failureSent=false;lose(record=>{if(record.route==='/saved/replay'){failureSent=true;return true;}return false;});
      await click(find('saved-replay'));
      // Wait for the real 503, not just the initial synchronous pending phase.
      await wait(()=>failureSent&&phase()==='pending'&&host.querySelector('[role="alert"]')?.textContent.includes('Pending'));
      assert.equal(find('saved-root').getAttribute('data-play-id'),original);
      assert.equal(host.querySelectorAll('[data-testid="saved-trial"]').length,1);
      await click(find('saved-retry'));await wait(()=>phase()==='ready'&&find('saved-root').getAttribute('data-play-id')!==original);
      assert(find('saved-start'),'confirmed uncertain Replay must enter the new introduction');
      assert.equal(host.querySelectorAll('[data-testid="saved-trial"]').length,0);
      assert(host.querySelector(`button[data-saved-play="${original}"]`),'original history disappeared');
      assert.equal((await db.query('SELECT count(*)::int n FROM play_sessions')).rows[0].n,2,'Replay retry created an extra play');
      assert.equal(errors.length,0,errors.map(String).join('\n'));
    }finally{
      if(reactRoot)await React.act(async()=>reactRoot.unmount());hook.deregister();if(owned)await unlink(temporary);dom.window.close();
      for(const [name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
    }
  });
});
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
async function fixture(engine,work,{serve}={}){
  const db=await createSyntheticDatabase(env),directory=await mkdtemp(path.join(os.tmpdir(),'saved-player-test-'));
  let server,journal,outage=false,lost=null;
  try{
    await migrate(db);
    const scope={household_id:randomUUID(),child_id:randomUUID(),assignment_id:randomUUID(),play_id:randomUUID(),revision_id:randomUUID(),consent_epoch:1};
    const adventure={...structuredClone(engine===1?fixtureAdventure:endingFixtureAdventure),revision_id:scope.revision_id};
    await seed(db,scope,adventure);
    journal=await createSyntheticPlayJournal({env,directory,testHooks:{beforeAppend:async()=>{if(outage)throw Error('Invented journal fault');}}});
    server=createSyntheticSavedServer({db,journal,env,scope,adventure,...(serve?{serve}:{}),testHooks:{beforeRespond:async r=>{if(lost?.(r)){lost=null;throw Error('Invented response loss');}return {forged:true};}}});
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
    await work({db,scope,adventure,origin,request,calls,client:()=>createSavedPlayerClient({request,newActionId:randomUUID}),fault:value=>{outage=value;},lose:fn=>{lost=fn;}});
  }finally{
    if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(journal)await journal.close();await db.close();
    assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));await rm(directory,{recursive:true,force:true});
  }
}
test('ordinary browser cookies are stripped only for read-only trusted assets; saved APIs stay strict',async()=>{
  let assetCalls=0;
  await fixture(2,async({origin,request})=>{
    const page=await fetch(origin+'/loop-preview/saved',{headers:{Cookie:'invented_test_cookie=1'}});
    assert.equal(page.status,200);assert.equal(await page.text(),'Synthetic asset');assert.equal(assetCalls,1);
    assert.equal(page.headers.get('cache-control'),'no-store');
    const api=await request('/saved/open',{play_id:null},{Cookie:'invented_test_cookie=1'});
    assert.equal(api.status,403);assert(!api.body.result);assert.equal(assetCalls,1);
    const foreign=await fetch(origin+'/loop-preview/saved',{headers:{Cookie:'invented_test_cookie=1',Origin:'https://foreign.invalid'}});
    assert.equal(foreign.status,403);assert.equal(assetCalls,1);
    const post=await fetch(origin+'/loop-preview/saved',{method:'POST'});
    assert.equal(post.status,404);assert.equal(assetCalls,1);
  },{serve:async(req,res)=>{
    assert(!Object.hasOwn(req.headers,'cookie'));
    assert(!req.rawHeaders.some((name,index)=>index%2===0&&name.toLowerCase()==='cookie'));
    assetCalls++;res.writeHead(200,{'Content-Type':'text/plain'});res.end('Synthetic asset');
  }});
});
for(const engine of [1,2])test(`fresh client reconciles stored pending Test without the lost browser queue, engine${engine}`,async()=>{
  await fixture(engine,async({db,scope,client,fault})=>{
    const original=client();await original.open();
    await original.dispatch({kind:'predict',prediction:'tips'});await original.dispatch({kind:'configure',configuration:'offset'});
    const state=original.snapshot().confirmed.checkpoint.state;
    fault(true);await original.dispatch({kind:'test',prediction_action_id:state.prediction_action_id,configuration_action_id:state.configuration_action_id});
    assert.equal(original.snapshot().phase,'pending');assert.equal(original.snapshot().confirmed.checkpoint.state.trials.length,0);
    // The original client and its pending envelope are never used again.
    fault(false);const refreshed=client();await refreshed.open(scope.play_id);
    assert.equal(refreshed.snapshot().phase,'ready');assert.equal(refreshed.snapshot().confirmed.checkpoint.state.trials.length,1);
    assert.equal((await db.query('SELECT count(*)::int n FROM play_action_commands')).rows[0].n,3);
    assert.equal((await db.query("SELECT count(*)::int n FROM play_action_commands WHERE ack_state='pending'")).rows[0].n,0);
    await refreshed.dispatch({kind:'predict',prediction:'stable'});assert.equal(refreshed.snapshot().phase,'ready');
    await refreshed.replay();assert.equal(refreshed.snapshot().phase,'ready');
    assert.equal(refreshed.snapshot().confirmed.checkpoint.state.trials.length,0);
    await refreshed.dispatch({kind:'configure',configuration:'balanced'});assert.equal(refreshed.snapshot().phase,'ready');
  });
});
test('Replay Start failure before primary commit never poisons original reads or duplicates the intent',async()=>{
  await fixture(2,async({db,scope,request,client,fault})=>{
    const a=client();await a.open();await a.replay();const second=a.snapshot().play_id;
    fault(true);await a.dispatch({kind:'predict',prediction:'stable'});assert.equal(a.snapshot().phase,'pending');
    const command={play_id:scope.play_id,command_id:randomUUID()};
    const failed=await request('/saved/replay',command);assert.equal(failed.status,503);
    assert.equal((await db.query('SELECT count(*)::int n FROM play_sessions')).rows[0].n,2,'failed Start wrote a play');
    const b=client();await b.open(scope.play_id);assert.equal(b.snapshot().phase,'ready','unstarted replay produced a false403');
    assert.equal(b.snapshot().confirmed.checkpoint.state.trials.length,0);
    assert.equal(b.snapshot().history.length,2,'unstarted intent leaked as play history');
    assert(b.snapshot().history.some(item=>item.play_id===second&&item.trial_count===null));
    fault(false);await b.reload();assert.equal(b.snapshot().phase,'ready');
    const retried=await request('/saved/replay',command);assert.equal(retried.status,200);
    const third=retried.body.result.play_id;assert(![scope.play_id,second].includes(third));
    assert.equal((await db.query('SELECT count(*)::int n FROM play_sessions')).rows[0].n,3);
    const duplicate=await request('/saved/replay',command);assert.equal(duplicate.status,200);assert.equal(duplicate.body.result.play_id,third);
    assert.equal((await db.query('SELECT count(*)::int n FROM play_sessions')).rows[0].n,3);
  });
});
test('unsupported acknowledgement retains the selected replay and its revision pin for explicit reload',async()=>{
  await fixture(2,async({request,scope})=>{
    let corrupt=null;const calls=[];
    const a=createSavedPlayerClient({newActionId:randomUUID,request:async(route,body)=>{
      calls.push(structuredClone({route,body}));const result=await request(route,body);
      if(corrupt==='mode'){result.body.mode='unsupported';corrupt=null;}
      else if(corrupt==='revision'){const revision=randomUUID();result.body.adventure.revision_id=revision;result.body.result.checkpoint.state.revision_id=revision;corrupt=null;}
      return result;
    }});
    await a.open();await a.replay();const selected=a.snapshot().play_id;assert.notEqual(selected,scope.play_id);
    corrupt='mode';await a.open(selected);assert.equal(a.snapshot().phase,'failed');assert.equal(a.snapshot().confirmed,null);
    assert.equal(a.snapshot().play_id,selected);assert.equal(a.snapshot().retryable,false);await assert.rejects(()=>a.retry());
    corrupt='revision';await a.reload();assert.equal(calls.at(-1).body.play_id,selected);assert.equal(a.snapshot().phase,'failed','malformed packet erased the trusted revision pin');
    await a.reload();assert.equal(calls.at(-1).body.play_id,selected);assert.equal(a.snapshot().phase,'ready');assert.equal(a.snapshot().play_id,selected);
  });
});
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
