// Actual HTTP/client/React tests. NOT RUN BY THE AUTHOR.
import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';import {resolve} from 'node:path';
import {privateBridgeFixture,readyBridgeSource} from './private-bridge-fixture.mjs';
import {reviewRead,reviewCommand} from './loop-review-service.test.mjs';
import {createFamilySpaceClient} from '../lib/loop/family-space-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function harness(t,f,guarded){
 const {origin}=await f.openFamilyServer(guarded?{family:guarded}:{}),native=globalThis.fetch;
 await native(origin+'/adult/request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'invented-queue-journey@example.invalid',purpose:'recover'})});
 const token=f.mockInbox().find(x=>x.email==='invented-queue-journey@example.invalid').token;
 const verified=await native(origin+'/adult/verify',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token})});assert.equal(verified.status,200);const cookie=verified.headers.get('set-cookie').split(';')[0];
 const transport=(route,options={})=>native(new URL(route,origin),{...options,headers:{...options.headers,Cookie:cookie,...(options.method==='POST'?{Origin:origin}:{})}});
 return {origin,native,cookie,transport,client:createFamilySpaceClient(transport)};
}
test('private HTTP: real adult cookie, origin/parser fences and private response headers',async t=>{
 const f=await privateBridgeFixture(t),x=await readyBridgeSource(f),ack=await f.bridge.makeReady(f.founderToken,x.command),h=await harness(t,f),index=await h.client.index(),selection={view_context:index.view_context,child_id:f.children[0].child_id},body={...selection,entry_kind:'assignment',assignment_id:ack.assignment_id,revision_id:ack.revision_id};
 const response=await h.transport('/adult/family/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.deepEqual((await response.json()).adventure,x.snapshot.adventure);
 assert.equal((await h.native(h.origin+'/adult/family/open',{method:'POST',headers:{Origin:'https://invented.invalid','Content-Type':'application/json',Cookie:h.cookie},body:JSON.stringify(body)})).status,403);
 assert.equal((await h.native(h.origin+'/adult/family/open',{method:'POST',headers:{Origin:h.origin,'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
 const malformed=await h.transport('/adult/family/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,ready:true})});assert.equal(malformed.status,400);assert.equal((await h.client.read(selection)).ready.length,1);assert.equal(f.playCalls().start,0);assert.equal(f.playCalls().commit,0);
});
test('private React: a held introduction cannot return after a newer withdrawn read',async t=>{
 const f=await privateBridgeFixture(t),x=await readyBridgeSource(f);await f.bridge.makeReady(f.founderToken,x.command);
 let hold=false,reached=false,release;const guarded={index:(...a)=>f.family.index(...a),read:(...a)=>f.family.read(...a),open:async(...a)=>{const value=await f.family.open(...a);if(hold){hold=false;reached=true;await new Promise(r=>release=r);}return value;}};
 const h=await harness(t,f,guarded),require=createRequire(resolve(root,'package.json')),{JSDOM}=require('jsdom'),React=require('react'),{createRoot}=require('react-dom/client'),{act}=React;
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:h.origin+'/loop-preview/family',pretendToBeVisual:true});
 const globals=['window','document','navigator','HTMLElement','Node','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch'],prior=new Map(globals.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of globals)Object.defineProperty(globalThis,k,{value:k==='fetch'?h.transport:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k],configurable:true,writable:true});
 for(const k of ['getItem','setItem','removeItem','clear'])dom.window.Storage.prototype[k]=()=>{throw Error('Private browser storage forbidden');};
 const urls=['app/LoopFamilyHome.tsx','app/LoopWonderCapture.tsx'].map(p=>pathToFileURL(resolve(root,p)).href);
 const hook=registerHooks({resolve(s,c,next){if(s==='./LoopWonderCapture')return {url:urls[1],shortCircuit:true};return next(s,c);},load(url,c,next){if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};if(urls.includes(url)){const ts=require('typescript'),compiled=ts.transpileModule(require('node:fs').readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:new URL(url).pathname,reportDiagnostics:true});assert(!(compiled.diagnostics??[]).some(d=>d.category===ts.DiagnosticCategory.Error));return {format:'module',source:compiled.outputText,shortCircuit:true};}return next(url,c);}});
 const {default:Home}=await import(urls[0]),mounted=createRoot(document.getElementById('root'));
 const tick=()=>new Promise(r=>setTimeout(r,15)),text=()=>document.body.textContent;
 async function until(predicate){for(let n=0;n<160;n++){await act(async()=>{await tick();});if(predicate())return;}throw Error('Private React condition timed out');}
 t.after(async()=>{release?.();await act(async()=>mounted.unmount());hook.deregister();dom.window.close();for(const[k,d]of prior){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 await act(async()=>mounted.render(React.createElement(Home)));await until(()=>document.getElementById('family-child'));
 await act(async()=>{const select=document.getElementById('family-child');select.value='0';select.dispatchEvent(new Event('change',{bubbles:true}));});await until(()=>text().includes('Open investigation introduction'));
 hold=true;await act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent==='Open investigation introduction').click();});await until(()=>reached);
 const view=await reviewRead(f,x.scope);await f.review.command(f.founderToken,reviewCommand(x.scope,view,'WithdrawTestSnapshot',{snapshot_id:x.snapshot.snapshot_id,reason:'Invented held-response withdrawal.'}));
 await act(async()=>window.dispatchEvent(new Event('focus')));await until(()=>text().includes('Readiness withdrawn'));await act(async()=>{release();await tick();});assert(!document.querySelector('[aria-label="Opened investigation"]'));assert(!text().includes(x.snapshot.adventure.opening));assert.equal(f.playCalls().start,0);assert.equal(f.playCalls().commit,0);
});
