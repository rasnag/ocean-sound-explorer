// AUTHORED, NOT RUN BY THE AUTHOR. Development React + actual protected HTTP composition.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {journeyHarness,prepareJourney} from './loop-journey-composition.test.mjs';
import {createJourneyClient,validateJourneyContext,validateJourneyStart,validateJourneyTrial} from '../lib/loop/journey-client.mjs';
const require=createRequire(new URL('../package.json',import.meta.url));
test('journey client strict context/trial/Start schemas and existing-play mapper',async t=>{
 const h=await journeyHarness(t),x=await prepareJourney(h),selected={view_context:x.selection.view_context,child_id:x.selection.child_id};
 const fetcher=(path,options={})=>fetch(h.parentOrigin+path,{...options,headers:{...options.headers,Cookie:h.parentCookie,Origin:h.parentOrigin,Connection:'close'}});
 const client=createJourneyClient(fetcher),context=await client.context(selected),trial=await client.trial(selected),start=await client.start({...x.binding,command_id:randomUUID()});
 assert.throws(()=>validateJourneyContext({...context,extra:true},selected));assert.throws(()=>validateJourneyTrial({...trial,allowance:9}));assert.throws(()=>validateJourneyStart({...start,play_id:null},x.binding));
 let live=true,denied=0,calls=[];const transport=createJourneyClient(async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return fetcher(path,options);});
 const lease=transport.bind({...x.binding,play_id:start.play_id},{profileVersion:context.profile_version,current:()=>live,onDenied:()=>denied++});
 assert.equal((await lease.request('/saved/open',{play_id:start.play_id})).status,200);
 const actual=calls.find(c=>c.path==='/adult/journey/open');assert.deepEqual(Object.keys(actual.body).sort(),['view_context','child_id','assignment_id','revision_id','play_id'].sort());assert(!calls.some(c=>c.path.startsWith('/saved/')));
 await assert.rejects(()=>lease.request('/saved/open',{play_id:null}));await assert.rejects(()=>lease.request('/saved/replay',{play_id:start.play_id,command_id:randomUUID()}));live=false;assert.equal((await lease.request('/saved/open',{play_id:start.play_id})).status,403);assert.equal(denied,1);
});
test('development StrictMode: stable family binding survives poll/rerender; held private replies close on hide/denial',async t=>{
 assert.notEqual(process.env.NODE_ENV,'production','This check requires actual development React');
 const h=await journeyHarness(t),x=await prepareJourney(h),nativeFetch=globalThis.fetch;
 const {JSDOM}=require('jsdom'),React=require('react'),ts=require('typescript');let mounts=0,cleanups=0,root,hook;
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:h.parentOrigin+'/loop-preview/family',pretendToBeVisual:true});
 const globals=['window','document','navigator','HTMLElement','Node','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch','Audio'],prior=new Map();
 let hold=false,held=false,release,opens=0;
 const transport=async(path,options={})=>{
  const response=await nativeFetch(new URL(path,h.parentOrigin),{...options,headers:{...options.headers,Cookie:h.parentCookie,...(options.method==='POST'?{Origin:h.parentOrigin}:{}),Connection:'close'}});
  if(String(path)==='/adult/journey/open'){opens++;if(hold){hold=false;held=true;await new Promise(r=>{release=r;});}}
  return response;
 };
 try{
  for(const n of globals){prior.set(n,Object.getOwnPropertyDescriptor(globalThis,n));Object.defineProperty(globalThis,n,{configurable:true,writable:true,value:n==='IS_REACT_ACT_ENVIRONMENT'?true:n==='fetch'?transport:dom.window[n]});}
  for(const name of ['pause','load'])Object.defineProperty(dom.window.HTMLMediaElement.prototype,name,{configurable:true,value(){}});Object.defineProperty(dom.window.HTMLMediaElement.prototype,'play',{configurable:true,value(){return Promise.resolve();}});
  for(const name of ['getItem','setItem','removeItem','clear'])dom.window.Storage.prototype[name]=()=>{throw Error('Private browser storage forbidden');};
  hook=registerHooks({resolve(specifier,context,next){if(['./LoopWonderCapture','./LoopSavedPlayer'].includes(specifier)&&context.parentURL?.includes('/app/'))return {url:new URL(specifier+'.tsx',context.parentURL).href,shortCircuit:true};return next(specifier,context);},load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};if(url.endsWith('.tsx')){const source=require('node:fs').readFileSync(new URL(url),'utf8');return {format:'module',source:ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};}return next(url,context);}});
  const {default:Home}=await import('../app/LoopFamilyHome.tsx'),{createRoot}=require('react-dom/client');
  function Control(){React.useEffect(()=>{mounts++;return()=>{cleanups++;};},[]);return React.createElement(Home);}
  root=createRoot(document.getElementById('root'));
  const render=()=>React.act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Control))));
  const wait=async fn=>{for(let i=0;i<500;i++){await React.act(async()=>new Promise(r=>setTimeout(r,20)));if(fn())return;}throw Error('Actual journey UI did not settle');};
  const click=async text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert(b&&!b.disabled,text);await React.act(async()=>b.click());};
  const phase=()=>document.querySelector('[data-testid="saved-status"]')?.getAttribute('data-phase');
  await render();await wait(()=>document.getElementById('family-child'));assert.equal(mounts,2);assert.equal(cleanups,1);
  await React.act(async()=>{const select=document.getElementById('family-child');select.value='0';select.dispatchEvent(new Event('change',{bubbles:true}));});await wait(()=>document.body.textContent.includes('Invented Journey’s wonders'));
  await click('Test trial: check availability');await wait(()=>document.body.textContent.includes('TEST trial confirmed'));await click('Test trial: check availability');
  await click('Open investigation introduction');await wait(()=>document.querySelector('[aria-label="Opened investigation"]'));await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Start or resume this TEST investigation'));
  await click('Start or resume this TEST investigation');await wait(()=>phase()==='ready');const playId=document.querySelector('[data-testid="saved-root"]').getAttribute('data-play-id');
  const initialOpens=opens;await render();await React.act(async()=>window.dispatchEvent(new Event('focus')));await wait(()=>document.body.textContent.includes('Invented Journey’s wonders'));assert.equal(document.querySelector('[data-testid="saved-root"]').getAttribute('data-play-id'),playId);assert.equal(opens,initialOpens);
  await React.act(async()=>document.querySelector('[data-testid="saved-start"]').click());await wait(()=>document.querySelector('[data-testid="saved-test"]'));
  for(const selector of ['[data-prediction="tips"]','[data-configuration="offset"]','[data-testid="saved-test"]']){await React.act(async()=>document.querySelector(selector).click());await wait(()=>phase()==='ready');}
  assert.equal(document.querySelectorAll('[data-testid="saved-trial"]').length,1);
  await React.act(async()=>window.dispatchEvent(new Event('focus')));await wait(()=>document.body.textContent.includes('1 confirmed try'));assert.equal(document.querySelectorAll('[data-testid="saved-trial"]').length,1);assert.equal(document.querySelector('[data-testid="saved-root"]').getAttribute('data-play-id'),playId);
  assert(!document.querySelector('[data-testid="saved-replay"]'));assert.equal(dom.window.location.pathname,'/loop-preview/family');assert.equal(dom.window.location.search,'');
  hold=true;await click('Reload confirmed progress');await click('Discard page intent and reload');await wait(()=>held);
  await React.act(async()=>window.dispatchEvent(new Event('pagehide')));assert(!document.querySelector('[data-testid="saved-root"]'));await React.act(async()=>release());assert(!document.querySelector('[data-testid="saved-root"]'));
  await React.act(async()=>window.dispatchEvent(new Event('focus')));await wait(()=>document.getElementById('family-child'));
  await React.act(async()=>{const select=document.getElementById('family-child');select.value='0';select.dispatchEvent(new Event('change',{bubbles:true}));});await wait(()=>document.body.textContent.includes('Invented Journey’s wonders'));
  await click('Open saved investigation');await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Start or resume this TEST investigation'));await click('Start or resume this TEST investigation');await wait(()=>phase()==='ready');assert.equal(document.querySelector('[data-testid="saved-root"]').getAttribute('data-play-id'),playId);
  hold=true;held=false;await click('Reload confirmed progress');await click('Discard page intent and reload');await wait(()=>held);
  await h.post('/adult/consent/withdraw',{command_id:randomUUID(),policy_version:'TEST-v1'});await React.act(async()=>window.dispatchEvent(new Event('focus')));await wait(()=>!document.querySelector('[data-testid="saved-root"]'));await React.act(async()=>release());assert(!document.querySelector('[data-testid="saved-root"]'));assert(!document.body.textContent.includes(x.words));
 }finally{if(root)await React.act(async()=>root.unmount());hook?.deregister();for(const [name,d]of prior){if(d)Object.defineProperty(globalThis,name,d);else delete globalThis[name];}dom.window.close();}
});
