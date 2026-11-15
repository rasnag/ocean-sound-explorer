// Actual HTTP/client/React candidates. NOT RUN BY THE AUTHOR.
import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';import {resolve} from 'node:path';
import {privateBridgeFixture,readyBridgeSource} from './private-bridge-fixture.mjs';
import {reviewRead,reviewCommand} from './loop-review-service.test.mjs';
import {createFamilySpaceClient} from '../lib/loop/family-space-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function harness(f,guarded){
 const {origin}=await f.openFamilyServer(guarded?{family:guarded}:{}),native=globalThis.fetch,email='invented-queue-journey@example.invalid',prior=f.mockInbox().find(x=>x.email===email)?.token;f.advance(2);
 const requested=await native(origin+'/adult/request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,purpose:'recover'})});assert.equal(requested.status,200);assert.equal((await requested.json()).status,'check_inbox');
 const token=f.mockInbox().find(x=>x.email===email)?.token;assert(token&&token!==prior,'Real recovery must deliver a fresh challenge after cooldown');
 const challenge=await f.db.query('SELECT delivered_at,consumed_at,revoked_at FROM adult_challenges WHERE purpose=$1 ORDER BY issued_at DESC LIMIT 1',['recover']);assert(challenge.rows[0]?.delivered_at);assert.equal(challenge.rows[0].consumed_at,null);assert.equal(challenge.rows[0].revoked_at,null);
 const verified=await native(origin+'/adult/verify',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token})});assert.equal(verified.status,200);assert.deepEqual(await verified.json(),{status:'verified',restricted:true});const header=verified.headers.get('set-cookie');assert(header);assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);assert.match(header,/Path=\/adult/);const cookie=header.split(';')[0];
 const transport=(route,options={})=>native(new URL(route,origin),{...options,headers:{...options.headers,Cookie:cookie,...(options.method==='POST'?{Origin:origin}:{})}});
 return {origin,native,cookie,transport,client:createFamilySpaceClient(transport)};
}
test('private HTTP: actual recovery cookie, parser/origin/privacy headers and revoked recovery',async t=>{
 const f=await privateBridgeFixture(t),x=await readyBridgeSource(f),ack=await f.bridge.makeReady(f.founderToken,x.command),h=await harness(f),index=await h.client.index(),selection={view_context:index.view_context,child_id:f.children[0].child_id},body={...selection,entry_kind:'assignment',assignment_id:ack.assignment_id,revision_id:ack.revision_id};
 const response=await h.transport('/adult/family/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.deepEqual((await response.json()).adventure,x.snapshot.adventure);
 assert.equal((await h.native(h.origin+'/adult/family/open',{method:'POST',headers:{Origin:'https://invented.invalid','Content-Type':'application/json',Cookie:h.cookie},body:JSON.stringify(body)})).status,403);
 assert.equal((await h.native(h.origin+'/adult/family/open',{method:'POST',headers:{Origin:h.origin,'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
 assert.equal((await h.transport('/adult/family/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,ready:true})})).status,400);assert.equal((await h.client.read(selection)).ready.length,1);assert.equal(f.legacyCalls(),0);assert.equal(f.playCalls().start,0);assert.equal(f.playCalls().commit,0);
 const logout=await h.transport('/adult/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(logout.status,200);await assert.rejects(()=>h.client.read(selection),e=>e.status===403);const denied=await h.transport('/adult/family/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(denied.status,403);assert(!JSON.stringify(await denied.json()).includes(x.snapshot.adventure.opening));
});
test('private React: pending explanation, healthy poll retention and newer read fences a held authorized response',async t=>{
 const f=await privateBridgeFixture(t),x=await readyBridgeSource(f);f.bridgeOutage(true);await f.bridge.makeReady(f.founderToken,x.command);
 let hold=false,reached=false,release,indexCalls=0,readCalls=0;const guarded={index:(...a)=>{indexCalls++;return f.family.index(...a);},read:async(...a)=>{const value=await f.family.read(...a);readCalls++;return value;},open:async(...a)=>{const value=await f.family.open(...a);if(hold){hold=false;reached=true;await new Promise(r=>release=r);}return value;}};
 const h=await harness(f,guarded),require=createRequire(resolve(root,'package.json')),{JSDOM}=require('jsdom'),React=require('react'),{createRoot}=require('react-dom/client'),{act}=React;
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:h.origin+'/loop-preview/family',pretendToBeVisual:true});
 const globals=['window','document','navigator','HTMLElement','Node','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch','setInterval'],prior=new Map(globals.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),nativeInterval=globalThis.setInterval,pollers=[];
 for(const k of globals)Object.defineProperty(globalThis,k,{value:k==='setInterval'?((fn,ms,...args)=>{if(ms===15000)pollers.push(fn);return nativeInterval(fn,ms,...args);}):k==='fetch'?h.transport:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k],configurable:true,writable:true});
 for(const k of ['getItem','setItem','removeItem','clear'])dom.window.Storage.prototype[k]=()=>{throw Error('Private browser storage forbidden');};
 const urls=['app/LoopFamilyHome.tsx','app/LoopWonderCapture.tsx'].map(p=>pathToFileURL(resolve(root,p)).href);
 const hook=registerHooks({resolve(s,c,next){if(s==='./LoopWonderCapture')return {url:urls[1],shortCircuit:true};return next(s,c);},load(url,c,next){if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};if(urls.includes(url)){const ts=require('typescript'),compiled=ts.transpileModule(require('node:fs').readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:new URL(url).pathname,reportDiagnostics:true});assert(!(compiled.diagnostics??[]).some(d=>d.category===ts.DiagnosticCategory.Error));return {format:'module',source:compiled.outputText,shortCircuit:true};}return next(url,c);}});
 let mounted;const tick=()=>new Promise(r=>setTimeout(r,15)),text=()=>document.body.textContent;
 async function until(predicate){for(let n=0;n<200;n++){await act(async()=>{await tick();});if(predicate())return;}throw Error('Private React condition timed out');}
 async function click(label){const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert(button&&!button.disabled,label);await act(async()=>button.click());}
 async function poll(){const count=readCalls;await act(async()=>{for(const fn of [...pollers])fn();});await until(()=>readCalls>count);await act(async()=>{await tick();});}
 try{
  const {default:Home}=await import(urls[0]);mounted=createRoot(document.getElementById('root'));await act(async()=>mounted.render(React.createElement(Home)));await until(()=>document.getElementById('family-child'));
  await act(async()=>{const select=document.getElementById('family-child');select.value='0';select.dispatchEvent(new Event('change',{bubbles:true}));});await until(()=>text().includes('Readiness awaiting confirmation'));
  assert(text().includes('1 awaiting readiness confirmation, already counted as used'));assert(!text().includes('Open investigation introduction'));
  f.bridgeOutage(false);await f.bridge.reconcile(f.founderToken,{...x.scope,command_id:x.command.command.command_id});await poll();await until(()=>text().includes('Open investigation introduction'));
  // Positive held-response control: no newer read, so the actual response renders.
  hold=true;reached=false;await click('Open investigation introduction');await until(()=>reached);await act(async()=>{release();await tick();});await until(()=>document.querySelector('[aria-label="Opened investigation"]'));assert(text().includes(x.snapshot.adventure.opening));
  await poll();assert(document.querySelector('[aria-label="Opened investigation"]'),'A healthy production poll must retain the displayed entry');await click('Close investigation view');
  hold=true;reached=false;await click('Open investigation introduction');await until(()=>reached);
  const v=await reviewRead(f,x.scope);f.reviewOutage(true);await f.review.command(f.founderToken,reviewCommand(x.scope,v,'WithdrawTestSnapshot',{snapshot_id:x.snapshot.snapshot_id,reason:'Invented held-response withdrawal.'}));
  // This route calls onObserved -> captureAcknowledged -> read directly. It
  // deliberately does not invoke focus/pageshow/refresh or change children.
  await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.startsWith('View request 1:')&&!b.disabled));const indices=indexCalls,reads=readCalls;
  const viewButton=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('View request 1:'));await act(async()=>viewButton.click());await until(()=>readCalls>reads&&text().includes('Readiness unavailable'));assert.equal(indexCalls,indices,'Held-response test must bypass the old refresh fence');
  await act(async()=>{release();await tick();});assert(!document.querySelector('[aria-label="Opened investigation"]'));assert(!text().includes(x.snapshot.adventure.opening));
  f.reviewOutage(false);const pending=(await f.db.query('SELECT c.command_id FROM review_slice_commands c LEFT JOIN review_slice_acknowledgements a USING(household_id,command_id) WHERE a.command_id IS NULL')).rows;for(const p of pending)await f.review.reconcile(f.founderToken,{...x.scope,command_id:p.command_id});await poll();await until(()=>text().includes('Readiness withdrawn'));assert.equal(f.legacyCalls(),0);assert.equal(f.playCalls().start,0);assert.equal(f.playCalls().commit,0);
 }finally{release?.();if(mounted)await act(async()=>mounted.unmount());hook.deregister();dom.window.close();for(const[k,d]of prior){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
