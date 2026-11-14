import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
import {generationFixture,bookAccepted,draftCommand,draftRead} from './loop-generation-service.test.mjs';
import {createGenerationClient} from '../lib/loop/generation-client.mjs';
async function browser(t,f){
 const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),page=await f.fetcher('/founder/generation');assert.equal(page.status,200);assert.match(page.headers.get('cache-control'),/no-store/);const dom=new JSDOM(await page.text(),{url:f.origins[1]+'/founder/generation',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.AbortController=globalThis.AbortController;Object.defineProperty(w.crypto,'randomUUID',{value:randomUUID,configurable:true});
 let holdRead=false,release=null,held=false,loseReply=false;const sent=[];
 w.fetch=async(route,options={})=>{
  if(options.body)sent.push({route:String(route),body:JSON.parse(options.body)});const r=await f.fetcher(route,options);const text=await r.text();
  if(String(route)==='/founder/generation/read'&&holdRead&&!held){held=true;await new Promise(done=>{release=done;});}
  if(String(route)==='/founder/generation/command'&&loseReply){loseReply=false;throw Error('Invented lost first draft reply');}
  // Actual browser JSON belongs to the browser realm. This adapter prevents a
  // JSDOM/Node prototype mismatch without weakening the real client validator.
  return {ok:r.ok,status:r.status,json:async()=>w.JSON.parse(text)};
 };
 for(const name of ['getItem','setItem','removeItem','clear'])w.Storage.prototype[name]=()=>{throw Error('Private browser storage forbidden');};
 const source=await f.fetcher('/founder/generation.js');assert.equal(source.status,200);w.eval(await source.text());
 const $=id=>w.document.getElementById(id),text=()=>w.document.body.textContent;
 async function until(check){for(let i=0;i<220;i++){if(check())return;await new Promise(done=>setTimeout(done,20));}throw Error('UI condition timed out; status='+$('gen-status').textContent+'; error='+$('gen-error').textContent);}
 async function click(label){await until(()=>[...w.document.querySelectorAll('button')].some(b=>b.textContent===label&&!b.disabled));[...w.document.querySelectorAll('button')].find(b=>b.textContent===label).click();}
 async function choose(i=0){await until(()=>$('gen-request').options.length>i+1);$('gen-request').value=String(i);$('gen-request').dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>text().includes('Original question and scope'));}
 function select(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));}
 function input(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));}
 f.cleanup(async()=>{release?.();w.dispatchEvent(new w.Event('pagehide'));w.close();});
 return {w,$,text,until,click,choose,select,input,sent,hold:()=>{holdRead=true;held=false;},held:()=>held,release:()=>{holdRead=false;release?.();},lose:()=>{loseReply=true;}};
}
test('actual founder HTTP/UI: request, run, field edits, selective regeneration and exact revision differences',async t=>{
 const f=await generationFixture(t),s=await bookAccepted(f,'  Invented private UI question?\nOriginal  '),b=await browser(t,f);await b.choose();assert(b.text().includes('Original due time:'));assert(!b.text().includes('Published'));
 await b.click('Save mock generation request');await b.until(()=>b.text().includes('Mock request saved; not run yet.'));await b.click('Run mock generation');await b.until(()=>b.text().includes('Unreviewed draft preview'));assert.equal((await f.db.query('SELECT * FROM generation_slice_revisions')).rows.length,1);
 b.input('gen-value','Invented revised opening.');assert(b.text().includes('Unsent proposed revision'));assert.equal((await f.db.query('SELECT * FROM generation_slice_revisions')).rows.length,1);await b.click('Confirm new draft revision');await b.until(()=>b.$('gen-value')?.value==='Invented revised opening.'&&b.text().includes('Changed opening'));
 b.input('gen-value','<script>publish()</script>');await b.click('Confirm new draft revision');await b.until(()=>b.$('gen-error').textContent.includes('rejected'));assert.equal((await f.db.query('SELECT * FROM generation_slice_revisions')).rows.length,2);assert.equal(b.$('gen-value').value,'Invented revised opening.');
 b.select('gen-field','help');b.input('gen-value','Invented help one.\nInvented help two.\nInvented final reveal.');await b.click('Confirm new draft revision');await b.until(()=>b.text().includes('Changed help'));
 b.select('gen-regenerate-field','help');await b.click('Save regeneration request');await b.until(()=>b.text().includes('Mock request saved; not run yet.'));await b.click('Run mock generation');await b.until(()=>b.text().includes('Unreviewed draft preview')&&b.text().includes('Invented revised opening.')&&b.text().includes('Changed help'));
 const v=await draftRead(f,s),current=v.revisions.find(r=>r.revision_id===v.job.current_revision_id);assert.equal(current.adventure.opening,'Invented revised opening.');assert.notEqual(current.adventure.help[0],'Invented help one.');assert(b.text().includes('Invented help one.'));assert(b.text().includes('Look at the position labels.'));assert.equal(current.publish_authority,false);assert.equal((await f.db.query('SELECT * FROM assignments')).rows.length,0);
});
test('actual founder HTTP/UI: lost reply, independent journal reopen and original pending reference recovery',async t=>{
 const f=await generationFixture(t),s=await bookAccepted(f),b=await browser(t,f);await b.choose();f.generationOutage(true);b.lose();await b.click('Save mock generation request');await b.until(()=>b.text().includes('Reconcile pending draft change 1'));assert(!b.text().includes('Original question and scope'));const original=b.sent.find(x=>x.route==='/founder/generation/command').body.command.command_id;assert.equal((await f.db.query('SELECT * FROM generation_slice_commands')).rows.length,1);
 await f.reopenGeneration();f.generationOutage(false);await b.click('Reconcile pending draft change 1');await b.until(()=>b.text().includes('Mock request saved; not run yet.'));const recovered=b.sent.find(x=>x.route==='/founder/generation/reconcile').body.command_id;assert.equal(recovered,original);assert.equal((await f.db.query('SELECT * FROM generation_slice_jobs')).rows.length,1);assert.equal((await f.db.query('SELECT * FROM generation_slice_commands')).rows.length,1);
});
test('actual founder HTTP/UI: withdrawal cannot restore a held private response',async t=>{
 const f=await generationFixture(t),words='Invented private withdrawal words.',s=await bookAccepted(f,words),b=await browser(t,f);await b.choose();b.hold();await b.click('Check current draft');await b.until(()=>b.held());await f.consent.withdraw(f.adult.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1'});b.release();await b.until(()=>b.$('gen-request').options.length===1&&!b.text().includes(words)&&!b.text().includes('Original question and scope'));await new Promise(done=>setTimeout(done,30));assert(!b.$('gen-value'));await assert.rejects(()=>draftRead(f,s),e=>e.status===403);
});
test('actual generation host: authenticated no-store routes, strict JSON/Origin/identity/size and no publish endpoint',async t=>{
 const f=await generationFixture(t),s=await bookAccepted(f),base=f.origins[1],headers={'Content-Type':'application/json',Origin:base,Cookie:'loop_session='+f.founderToken};
 const naked=await fetch(base+'/founder/generation/list',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'});assert([401,403].includes(naked.status));assert.match(naked.headers.get('cache-control'),/no-store/);
 const wrongOrigin=await fetch(base+'/founder/generation/list',{method:'POST',headers:{...headers,Origin:'https://outside.invalid'},body:'{}'});assert.equal(wrongOrigin.status,403);
 const identity=await fetch(base+'/founder/generation/list',{method:'POST',headers:{...headers,'X-Household-Id':s.household_id},body:'{}'});assert.equal(identity.status,403);
 const shape={...s,job_id:null},raw=JSON.stringify(shape);assert(raw.includes('"scope_version":1'));const duplicate=await fetch(base+'/founder/generation/read',{method:'POST',headers,body:raw.replace('"scope_version":1','"scope_version":1,"scope_version":1')});assert.equal(duplicate.status,400);
 const oversized=await fetch(base+'/founder/generation/list',{method:'POST',headers,body:' '.repeat(17000)+'{}'});assert.equal(oversized.status,413);const queried=await fetch(base+'/founder/generation?private=x',{headers});assert.equal(queried.status,400);
 const publish=await fetch(base+'/founder/generation/publish',{method:'POST',headers,body:'{}'});assert.equal(publish.status,404);const badAction=await fetch(base+'/founder/generation/command',{method:'POST',headers,body:JSON.stringify({...s,command:{command_id:randomUUID(),job_id:null,expected_version:0,action:'PublishRevision',payload:{}}})});assert.equal(badAction.status,400);assert.equal((await f.db.query('SELECT * FROM generation_slice_jobs')).rows.length,0);
 const client=createGenerationClient(f.fetcher);assert.equal((await client.list({})).requests.length,1);assert.equal((await client.read({...s,job_id:null})).status,'generation_view');
});
