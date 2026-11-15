import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,unlink,rm} from 'node:fs/promises';
import {createRequire,registerHooks} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {createSyntheticPlayJournal} from '../server/play-journal.mjs';
import {createSyntheticSavedServer} from '../server/saved-preview.mjs';
import {createSavedPlayerClient,bindExistingPlayRequest} from '../lib/loop/saved-player.mjs';
import {endingFixtureAdventure} from '../lib/loop/ending-fixture.mjs';

test('bound transport rejects local scope changes without inventing HTTP authority',async()=>{
  const playId=randomUUID(),other=randomUUID();let calls=0;
  const request=async()=>{calls++;throw Error('Unexpected transport call');};
  const bound=bindExistingPlayRequest({playId,request});
  for(const [route,body]of [['/saved/open',{play_id:null}],['/saved/open',{play_id:other}],['/saved/replay',{play_id:playId,command_id:randomUUID()}],['/saved/action',{play_id:playId,command:{contract_version:'1.1.0',play_id:other,action_id:randomUUID(),expected_sequence:0,consent_epoch:1,revision_id:randomUUID(),pattern_version:'fixture-1',action:{kind:'predict',prediction:'stable'}}}]]){
    await assert.rejects(()=>bound(route,body),e=>e.code==='saved_binding_unavailable');assert.equal(calls,0);
  }
  for(const invalid of [null,other]){
    const client=createSavedPlayerClient({request:bound});await client.open(invalid);
    assert.equal(client.snapshot().phase,'failed');assert.equal(client.snapshot().confirmed,null);assert.equal(client.snapshot().adventure,null);assert.equal(calls,0);
  }
  assert.throws(()=>bindExistingPlayRequest({playId,request,extra:true}));
  assert.throws(()=>bindExistingPlayRequest({playId:'invalid',request}));
});

async function harness(work){
  const app=path.dirname(path.dirname(fileURLToPath(import.meta.url))),require=createRequire(new URL('../package.json',import.meta.url));
  const {JSDOM,VirtualConsole}=require('jsdom'),ts=require('typescript'),React=require('react');
  const db=await createSyntheticDatabase({LOOP_ENV:'local-synthetic'}),directory=await mkdtemp(path.join(os.tmpdir(),'saved-binding-'));
  let journal,server,reactRoot,dom,hook,temporary;const previous=new Map();
  try{
    await migrate(db);
    const scope={household_id:randomUUID(),child_id:randomUUID(),assignment_id:randomUUID(),play_id:randomUUID(),revision_id:randomUUID(),consent_epoch:1};
    const adventure={...structuredClone(endingFixtureAdventure),revision_id:scope.revision_id},requestId=randomUUID();
    await db.transaction(async tx=>{
      await tx.query('INSERT INTO households VALUES($1)',[scope.household_id]);
      await tx.query("INSERT INTO service_consents VALUES($1,1,'active')",[scope.household_id]);
      await tx.query('INSERT INTO children(household_id,child_id) VALUES($1,$2)',[scope.household_id,scope.child_id]);
      await tx.query('INSERT INTO wonder_requests(household_id,request_id,child_id) VALUES($1,$2,$3)',[scope.household_id,requestId,scope.child_id]);
      await tx.query('INSERT INTO request_source_scopes(household_id,request_id,source_scope_version) VALUES($1,$2,1)',[scope.household_id,requestId]);
      await tx.query("INSERT INTO adventure_revisions(household_id,revision_id,request_id,source_scope_version,pattern_version,engine_version,status,payload_ref) VALUES($1,$2,$3,1,'fixture-1',$4,'published','synthetic:binding-test-not-content-approval')",[scope.household_id,scope.revision_id,requestId,adventure.engine_version]);
      await tx.query('INSERT INTO published_revisions(household_id,revision_id) VALUES($1,$2)',[scope.household_id,scope.revision_id]);
      await tx.query('INSERT INTO assignments VALUES($1,$2,$3,$4,$5)',[scope.household_id,scope.assignment_id,requestId,scope.child_id,scope.revision_id]);
    });
    journal=await createSyntheticPlayJournal({env:{LOOP_ENV:'local-synthetic'},directory});let loseTest=false;
    server=createSyntheticSavedServer({db,journal,env:{LOOP_ENV:'local-synthetic'},scope,adventure,testHooks:{beforeRespond:async({route,body})=>{
      if(loseTest&&route==='/saved/action'&&body.command.action.kind==='test'){loseTest=false;throw Error('Invented postcommit reply loss');}
    }}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port,nativeFetch=globalThis.fetch;
    const http=async(route,body)=>{const r=await nativeFetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
    // This is a component/producer integration fixture, NOT bridge Start or real authentication evidence.
    assert.equal((await http('/saved/open',{play_id:scope.play_id})).status,200);
    const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
    dom=new JSDOM('<div id="root"></div>',{url:origin+'/family/play?assignment=opaque-test&keep=1#resume',pretendToBeVisual:true,virtualConsole:vc});
    let defaultCalls=0;
    const defaultFetch=(url,options)=>{defaultCalls++;assert.equal(options.credentials,'omit');return nativeFetch(new URL(url,origin),options);};
    const names=['window','document','navigator','HTMLElement','Node','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch','Audio'];
    for(const name of names){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='fetch'?defaultFetch:dom.window[name]});}
    for(const name of ['pause','load'])Object.defineProperty(dom.window.HTMLMediaElement.prototype,name,{configurable:true,value(){}});
    Object.defineProperty(dom.window.HTMLMediaElement.prototype,'play',{configurable:true,value(){return Promise.resolve();}});
    hook=registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};return next(url,context);}});
    temporary=path.join(app,'app/.saved-binding-test-'+randomUUID()+'.mjs');
    const compiled=ts.transpileModule(await readFile(path.join(app,'app/LoopSavedPlayer.tsx'),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
    await writeFile(temporary,compiled.outputText,{flag:'wx'});
    const {default:Component}=await import(pathToFileURL(temporary).href),{createRoot}=require('react-dom/client');
    const host=dom.window.document.getElementById('root');
    let strictMode=false;
    const render=async(props={},fresh=false,strict)=>{if(strict!==undefined)strictMode=strict;if(fresh&&reactRoot){await React.act(async()=>reactRoot.unmount());reactRoot=null;}if(!reactRoot)reactRoot=createRoot(host);const component=React.createElement(Component,props);await React.act(async()=>reactRoot.render(strictMode?React.createElement(React.StrictMode,null,component):component));};
    const wait=async condition=>{const until=Date.now()+12000;while(!condition()){assert(Date.now()<until,'binding UI did not settle');await React.act(async()=>new Promise(r=>setTimeout(r,15)));}};
    const find=id=>host.querySelector(`[data-testid="${id}"]`),phase=()=>find('saved-status')?.getAttribute('data-phase');
    const click=async button=>{assert(button&&!button.disabled,'expected active control');await React.act(async()=>button.click());};
    await work({scope,adventure,db,http,host,render,wait,find,phase,click,dom,React,errors,lose:()=>{loseTest=true;},defaultCalls:()=>defaultCalls});
  }finally{
    if(reactRoot){const React=require('react');await React.act(async()=>reactRoot.unmount());}
    hook?.deregister();if(temporary)await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});dom?.window.close();
    for(const [name,d]of previous){if(d)Object.defineProperty(globalThis,name,d);else delete globalThis[name];}
    if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r));}if(journal)await journal.close();await db.close();
    assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));await rm(directory,{recursive:true,force:true});
  }
}

test('actual injected existing-play UI saves, retries and resumes without changing the assignment URL',async()=>{
  await harness(async({scope,adventure,db,http,host,render,wait,find,phase,click,dom,lose,defaultCalls,errors})=>{
    const calls=[],request=async(route,body)=>{calls.push(structuredClone({route,body}));return http(route,body);};
    const integration={mode:'authenticated-existing-play',playId:scope.play_id,bindingKey:'opaque-binding-not-dom-or-wire',request};
    const url=dom.window.location.href,sameUrl=()=>assert.equal(dom.window.location.href,url);
    await render({integration},false,true);await wait(()=>phase()==='ready');sameUrl();assert.equal(defaultCalls(),0);assert(!host.querySelector('[role="alert"]'),'StrictMode must not produce a spurious unavailable alert');
    assert(!host.textContent.includes('Stopping it ends access'));assert(!host.textContent.includes('one invented household'));assert(!host.textContent.includes('old memory-only player'));
    assert(!find('saved-replay'));assert(!host.querySelector('nav[aria-label="Retained local plays"]'));assert(!host.querySelector('a[href="/loop-preview"]'));
    assert(!host.innerHTML.includes(integration.bindingKey));assert(!JSON.stringify(calls).includes(integration.bindingKey));
    const before=calls.length;await render({integration:{...integration}});assert.equal(calls.length,before);assert.equal(find('saved-root').getAttribute('data-play-id'),scope.play_id);
    await click(find('saved-start'));await wait(()=>find('saved-test'));sameUrl();
    await click(host.querySelector('button[data-prediction="stable"]'));await wait(()=>phase()==='ready');sameUrl();
    await click(host.querySelector('button[data-configuration="balanced"]'));await wait(()=>phase()==='ready');
    lose();await click(find('saved-test'));await wait(()=>phase()==='pending'&&host.querySelector('[role="alert"]')?.textContent.includes('Pending'));
    assert.equal(host.querySelectorAll('[data-testid="saved-trial"]').length,0);const original=structuredClone(calls.at(-1));
    await click(find('saved-retry'));await wait(()=>phase()==='ready');assert.deepEqual(calls.at(-1),original);sameUrl();
    assert.equal(host.querySelectorAll('[data-testid="saved-trial"]').length,1);
    await click([...host.querySelectorAll('button')].find(b=>b.textContent==='Pause and look back'));sameUrl();assert(!host.textContent.includes('Nothing has been submitted or sent'));assert(host.textContent.includes('No new intake is submitted here'));
    await click([...host.querySelectorAll('button')].find(b=>b.textContent==='Resume this play'));await wait(()=>phase()==='ready');sameUrl();
    await click([...host.querySelectorAll('button')].find(b=>b.textContent==='Reload confirmed progress'));
    await click([...host.querySelectorAll('button')].find(b=>b.textContent==='Discard page intent and reload'));await wait(()=>phase()==='ready');sameUrl();
    await render({integration:{...integration,bindingKey:'fresh-browser-same-bound-play'}},true);await wait(()=>phase()==='ready');sameUrl();
    assert.equal(host.querySelectorAll('[data-testid="saved-trial"]').length,1);assert.equal((await db.query('SELECT count(*)::int n FROM play_sessions')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int n FROM play_action_commands')).rows[0].n,3);
    assert(calls.filter(x=>x.route==='/saved/open').every(x=>x.body.play_id===scope.play_id));assert(calls.every(x=>x.route!=='/saved/replay'));assert.equal(defaultCalls(),0);
    await db.transaction(async tx=>{await tx.query('SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[scope.household_id]);await tx.query("INSERT INTO service_consents VALUES($1,2,'withdrawn')",[scope.household_id]);});
    await click(find('saved-start'));await wait(()=>phase()==='denied');sameUrl();
    assert(!host.textContent.includes(adventure.opening));assert.equal(host.querySelectorAll('[data-testid="saved-trial"]').length,0);assert(!find('saved-start'));assert.equal(errors.length,0);
  });
});

test('invalid or changed bindings never fall back to preview or resurrect prior private UI',async()=>{
  await harness(async({scope,adventure,http,host,render,wait,phase,dom,defaultCalls,React})=>{
    let suppliedCalls=0;const request=async(route,body)=>{suppliedCalls++;return http(route,body);};
    const integration={mode:'authenticated-existing-play',playId:scope.play_id,bindingKey:'stable-binding',request};
    const url=dom.window.location.href;
    const accessor={...integration};Object.defineProperty(accessor,'request',{enumerable:true,get(){throw Error('Accessor must never be called');}});
    for(const invalid of [undefined,null,false,1,'invalid',{}, {...integration,extra:true},{...integration,playId:'invalid'},{...integration,request:null},accessor]){
      const count=suppliedCalls;await render({integration:invalid},true);assert(host.querySelector('[role="alert"]'));assert(!host.querySelector('[data-testid="saved-root"]'));assert.equal(suppliedCalls,count);assert.equal(defaultCalls(),0);assert.equal(dom.window.location.href,url);assert(!host.querySelector('[data-testid="saved-replay"]'));assert(!host.querySelector('a[href="/loop-preview"]'));
    }
    await render({integration},true);await wait(()=>phase()==='ready');const before=suppliedCalls;
    await render({});assert(!host.querySelector('[data-testid="saved-root"]'));assert.equal(suppliedCalls,before);assert.equal(defaultCalls(),0);assert.equal(dom.window.location.href,url);
    await render({integration});assert(!host.querySelector('[data-testid="saved-root"]'),'mode removal must stay closed');assert.equal(suppliedCalls,before);
    await render({integration},true);await wait(()=>phase()==='ready');const readyCount=suppliedCalls;
    let otherCalls=0;const other=async(route,body)=>{otherCalls++;return http(route,body);};
    await render({integration:{...integration,request:other}});assert(!host.querySelector('[data-testid="saved-root"]'));assert(!host.textContent.includes(adventure.opening));assert.equal(otherCalls,0);assert.equal(suppliedCalls,readyCount);
    await render({integration});assert(!host.querySelector('[data-testid="saved-root"]'),'same-key transport latch must stay closed');assert.equal(suppliedCalls,readyCount);
    let release,held=false;const heldRequest=async(route,body)=>{const result=await http(route,body);held=true;await new Promise(r=>{release=r;});return result;};
    await render({integration:{...integration,bindingKey:'held',request:heldRequest}},true);await wait(()=>held);
    const alternate=await http('/saved/replay',{play_id:scope.play_id,command_id:randomUUID()});assert.equal(alternate.status,200);const nextPlay=alternate.body.result.play_id;
    const changed={...integration,playId:nextPlay,bindingKey:'new-current-binding'};await render({integration:changed});await wait(()=>phase()==='ready');assert.equal(host.querySelector('[data-testid="saved-root"]').getAttribute('data-play-id'),nextPlay);
    await React.act(async()=>release());assert.equal(phase(),'ready');assert.equal(host.querySelector('[data-testid="saved-root"]').getAttribute('data-play-id'),nextPlay);assert.equal(dom.window.location.href,url);assert.equal(defaultCalls(),0);
    let releaseSame,heldSame=false,heldCalls=0;const heldSameRequest=async(route,body)=>{heldCalls++;const result=await http(route,body);heldSame=true;await new Promise(r=>{releaseSame=r;});return result;};
    const sameKey={...integration,bindingKey:'held-same-key',request:heldSameRequest};await render({integration:sameKey},true);await wait(()=>heldSame);
    const oldCount=heldCalls,newCount=otherCalls;await render({integration:{...sameKey,request:other}});assert(!host.querySelector('[data-testid="saved-root"]'));assert(!host.textContent.includes(adventure.opening));
    await React.act(async()=>releaseSame());assert(!host.querySelector('[data-testid="saved-root"]'));assert.equal(heldCalls,oldCount);assert.equal(otherCalls,newCount);
    await render({integration:sameKey});assert(!host.querySelector('[data-testid="saved-root"]'));assert.equal(heldCalls,oldCount);assert.equal(otherCalls,newCount);
    const corrupt=async()=>({status:200,body:{mode:'local-synthetic',production_ready:false,adventure:{},result:{forged:true},history:[]}});
    await render({integration:{...integration,bindingKey:'malformed-ack',request:corrupt}},true);await wait(()=>phase()==='failed');assert(!host.textContent.includes(adventure.opening));assert.equal(defaultCalls(),0);
    // No-prop developer preview still uses its unchanged default transport/query behavior.
    dom.window.history.replaceState(null,'','/loop-preview/saved');await render({},true);await wait(()=>phase()==='ready');assert(defaultCalls()>0);assert.equal(new URL(dom.window.location.href).searchParams.get('play'),scope.play_id);assert(host.querySelector('[data-testid="saved-replay"]'));assert(host.textContent.includes('Stopping it ends access'));
    const previewUrl=dom.window.location.href,defaultBefore=defaultCalls(),suppliedBefore=suppliedCalls;await render({integration});assert(host.querySelector('[role="alert"]'));assert(!host.querySelector('[data-testid="saved-root"]'));assert(!host.querySelector('[data-testid="saved-replay"]'));assert(!host.querySelector('a[href="/loop-preview"]'));assert.equal(defaultCalls(),defaultBefore);assert.equal(suppliedCalls,suppliedBefore);assert.equal(dom.window.location.href,previewUrl);
  });
});
