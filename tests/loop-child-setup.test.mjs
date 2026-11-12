import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire,registerHooks} from 'node:module';
import {readFile,writeFile,unlink,access as fileAccess} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {createSyntheticAdultAccess} from '../server/adult-access.mjs';
import {createSyntheticAdultAccessServer} from '../server/adult-http.mjs';

import {createSyntheticConsentService} from '../server/consent-service.mjs';
import {createSyntheticChildSetup} from '../server/child-setup.mjs';
const env={LOOP_ENV:'local-synthetic'};
const policy={challengeTtlMs:120000,sessionTtlMs:600000,resendCooldownMs:1000,requestWindowMs:60000,maxRequests:20,maxVerifyAttempts:30};
const out={status:'signed_out'},invalid={status:'invalid_link'},inbox={status:'check_inbox'};
async function fixture(run,overrides={}) {
  const db=await createSyntheticDatabase(env);let at=1900000000000;const messages=[];
  try {
    await migrate(db);
    const options={db,env,clock:()=>at,policy:{...policy,...overrides},deliver:async message=>{messages.push(message);}};
    const access=await createSyntheticAdultAccess(options);
    await run({db,access,options,messages,advance:ms=>{at+=ms;}});
  } finally {await db.close();}
}
const count=async(db,table)=>Number((await db.query('SELECT count(*) AS n FROM '+table)).rows[0].n);
const requestCode=async(access,messages,email,purpose='join')=>{
  const before=messages.length;assert.deepEqual(await access.request({email,purpose}),inbox);
  assert.equal(messages.length,before+1);
  const message=messages[before];assert.deepEqual(Object.keys(message).sort(),['email','purpose','token']);
  assert.match(message.token,/^[A-Za-z0-9_-]{43}$/);return message.token;
};

test('child setup: real HTTP React flow preserves drafts, siblings, corrections, retries and withdrawal fences',async()=>fixture(async({db,access,options,messages,advance})=>{
  const consent=await createSyntheticConsentService({env,db,access,clock:options.clock,policyVersion:'TEST-v1'});
  const setup=await createSyntheticChildSetup({env,db,access,clock:options.clock,policyVersion:'TEST-v1'});
  let failWithdrawal=false,failSave=false,holdStatus=false,releaseStatus,heldStatus;
  const guardedConsent={...consent,withdraw:async(...args)=>{if(failWithdrawal){failWithdrawal=false;throw Error('fixture failure');}return consent.withdraw(...args);}};
  const guardedSetup={...setup,status:async(...args)=>{const answer=await setup.status(...args);if(holdStatus){holdStatus=false;heldStatus=answer;return new Promise(resolve=>{releaseStatus=()=>resolve(answer)});}return answer;},save:async(...args)=>{const saved=await setup.save(...args);if(failSave){failSave=false;throw Error('lost acknowledgment');}return saved;}};
  const server=createSyntheticAdultAccessServer({access,consent:guardedConsent,setup:guardedSetup,env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,require=createRequire(new URL('../package.json',import.meta.url));
  const {JSDOM,VirtualConsole}=require('jsdom'),ts=require('typescript'),React=require('react');
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM('<div id="root"></div>',{url:origin+'/loop-preview/join',pretendToBeVisual:true,virtualConsole:vc});
  const nativeFetch=globalThis.fetch,requests=[],pending=new Set();let cookie='',reactRoot,hook,owned=false;
  const names=['window','document','navigator','HTMLElement','Node','Event','MouseEvent','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT','fetch'];
  const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const browserFetch=(url,options={})=>{
    const target=new URL(url,origin);assert.equal(target.origin,origin);const method=options.method??'GET',headers={...options.headers,...(method==='POST'?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})};requests.push({path:target.pathname,method});
    const work=nativeFetch(target,{...options,headers}).then(response=>{const set=response.headers.get('set-cookie');if(set){const part=set.split(';')[0];cookie=part==='loop_adult_session='?'':part;}return response;});pending.add(work);work.finally(()=>pending.delete(work)).catch(()=>{});return work;
  };
  const temporary=path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))),'app/.child-setup-test.mjs');
  try{
    const first=await requestCode(access,messages,'passive@example.invalid');
    assert.equal((await browserFetch('/adult/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:first})})).status,200);
    for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='fetch'?browserFetch:['requestAnimationFrame','cancelAnimationFrame'].includes(name)?dom.window[name].bind(dom.window):dom.window[name]});dom.window.fetch=browserFetch;
    hook=registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};return next(url,context);}});
    let exists=false;try{await fileAccess(temporary);exists=true;}catch{}assert(!exists,'preserve existing owned-test filename');
    const source=await readFile(new URL('../app/LoopChildSetup.tsx',import.meta.url),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});await writeFile(temporary,compiled.outputText,{flag:'wx'});owned=true;
    const {default:Component}=await import(pathToFileURL(temporary).href),{createRoot}=require('react-dom/client');const host=dom.window.document.getElementById('root');reactRoot=createRoot(host);
    const phase=()=>host.querySelector('[data-testid="child-setup-status"]')?.getAttribute('data-phase');
    const wait=async condition=>{const until=Date.now()+10000;while(!condition()){assert(Date.now()<until,'actual adult UI did not settle');await React.act(async()=>new Promise(resolve=>setTimeout(resolve,20)));}};
    await React.act(async()=>reactRoot.render(React.createElement(Component)));await wait(()=>phase()==='permission_required');
    const button=text=>[...host.querySelectorAll('button')].find(x=>x.textContent===text);
    const click=async text=>{assert(button(text),text);await React.act(async()=>button(text).click());};
    assert.equal(host.querySelectorAll('input[type=checkbox]:checked').length,0);
    await click('Decline');assert.equal(await count(db,'children'),0);
    await React.act(async()=>host.querySelector('input[type=checkbox]').click());
    await click('Continue with test permission');await wait(()=>phase()==='setup_required');
    const set=async(selector,value)=>{const input=host.querySelector(selector);assert(input,selector);await React.act(async()=>{const proto=input.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});};
    const fill=async name=>{await set('input:not([type=checkbox])',name);const selects=host.querySelectorAll('select');for(const [i,value] of ['6','not-sure','not-sure','not-sure'].entries())await React.act(async()=>{selects[i].value=value;selects[i].dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
    await fill('Invented');const input=host.querySelector('input');input.focus();const beforeInput=input;
    await React.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));await React.act(async()=>new Promise(r=>setTimeout(r,100))); 
    assert.equal(host.querySelector('input'),beforeInput);assert.equal(beforeInput.value,'Invented');
    failSave=true;await click('Save invented child');await wait(()=>host.textContent.includes('Save could not be confirmed'));
    assert.equal(await count(db,'children'),1);await React.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));await React.act(async()=>new Promise(r=>setTimeout(r,100))); assert(host.textContent.includes('Save could not be confirmed'));
    await click('Retry');await wait(()=>phase()==='complete'&&!host.textContent.includes('Save could not be confirmed')&&button('Add another child')&&!button('Add another child').disabled);assert.equal(await count(db,'children'),1);assert(host.textContent.includes('Gentle start'));
    await click('Add another child');await fill('Twin');await click('Save invented child');await wait(()=>host.querySelectorAll('article').length===2);assert.equal(await count(db,'children'),2);
    await click('Correct Invented’s profile');await set('input','Updated');await click('Save correction');await wait(()=>host.textContent.includes('Updated')&&!host.querySelector('form'));assert.equal(await count(db,'child_profile_versions'),3);
    await React.act(async()=>reactRoot.unmount());reactRoot=createRoot(host);await React.act(async()=>reactRoot.render(React.createElement(Component)));await wait(()=>host.querySelectorAll('article').length===2);assert(host.textContent.includes('Updated'));
    failWithdrawal=true;await click('Withdraw test permission');await wait(()=>phase()==='withdrawal-unconfirmed'&&host.textContent.includes('Withdrawal is unconfirmed'));assert.equal(host.querySelectorAll('article').length,0);
    await React.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));assert.equal(host.querySelectorAll('article').length,0);
    await click('Retry withdrawal');await wait(()=>phase()==='permission_required');assert.equal(await count(db,'children'),2);
    // A delayed old private response must not restore data after a newer loss-of-access result.
    await access.request({email:'fresh@example.invalid',purpose:'join'});const fresh=await access.verify({token:messages.at(-1).token});
    await consent.record(fresh.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1',required_service:true,optional_contact:false,optional_story:false});
    const freshState=await setup.status(fresh.sessionToken);await setup.save(fresh.sessionToken,{command_id:randomUUID(),setup_context:freshState.setup_context,operation:'create',initial:true,profile:{nickname:'Fresh',age:6,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}});
    cookie='loop_adult_session='+fresh.sessionToken;
    await React.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));await wait(()=>host.querySelectorAll('article').length===1);
    holdStatus=true;await React.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));await wait(()=>Boolean(releaseStatus));assert.equal(heldStatus.state,'complete');
    await consent.withdraw(fresh.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1'});
    await React.act(async()=>dom.window.dispatchEvent(new dom.window.Event('focus')));await wait(()=>phase()==='permission_required');
    await React.act(async()=>{releaseStatus();await new Promise(resolve=>setTimeout(resolve,50));});assert.equal(phase(),'permission_required');assert.equal(host.querySelectorAll('article').length,0);
    assert.equal(errors.length,0,errors.map(String).join('\n'));
  }finally{
    if(reactRoot)await React.act(async()=>reactRoot.unmount());hook?.deregister();if(owned)await unlink(temporary);dom.window.close();for(const [name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.()});
  }
}));
