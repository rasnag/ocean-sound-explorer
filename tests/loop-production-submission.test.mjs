// Authored stage-family tests. Exact execution evidence belongs to REPORT.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createRequire,registerHooks} from 'node:module';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {createEntitlementKernel} from '../lib/loop/entitlements.mjs';
import {createSyntheticAdultAccess} from '../server/adult-access.mjs';
import {createSyntheticConsentService} from '../server/consent-service.mjs';
import {createSyntheticChildSetup} from '../server/child-setup.mjs';
import {createSyntheticWonderCapture} from '../server/wonder-capture.mjs';
import {createSyntheticWonderJournal} from '../server/wonder-journal.mjs';
import {createSyntheticProductionJournal} from '../server/production-journal.mjs';
import {createSyntheticProductionSubmission} from '../server/production-submission.mjs';
import {createSyntheticFamilySpace} from '../server/family-space.mjs';
import {createSyntheticAdultAccessServer} from '../server/adult-http.mjs';
const env={LOOP_ENV:'local-synthetic'},policyVersion='TEST-v1';
async function fixture(t){
 const db=await createSyntheticDatabase(env),dirs=[];let captureJournal,journal,server;
 let at=1800000000000,outage=false;const delivered=new Map(),materials=new Map(),clock=()=>at;
 t.after(async()=>{if(server?.listening)await new Promise(done=>{server.close(done);server.closeAllConnections?.();});await journal?.close();await captureJournal?.close();await db.close();for(const d of dirs){assert.equal(dirname(resolve(d)),resolve(tmpdir()));assert(basename(d).startsWith('loop-production-ui-'));await rm(d,{recursive:true,force:true});}});
 await migrate(db);for(let i=0;i<2;i++)dirs.push(await mkdtemp(join(tmpdir(),'loop-production-ui-')));
 const keys={keyForHousehold:h=>{if(!materials.has(h))throw Error('Missing invented key');return Buffer.from(materials.get(h));}};
 const access=await createSyntheticAdultAccess({env,db,clock,policy:{challengeTtlMs:600000,sessionTtlMs:3600000,resendCooldownMs:1,requestWindowMs:60000,maxRequests:1000,maxVerifyAttempts:1000},deliver:async x=>delivered.set(x.email,x.token)});
 const consent=await createSyntheticConsentService({env,db,access,clock,policyVersion}),setup=await createSyntheticChildSetup({env,db,access,clock,policyVersion}),kernel=createEntitlementKernel({env,clock});
 captureJournal=await createSyntheticWonderJournal({env,directory:dirs[0]});const capture=await createSyntheticWonderCapture({env,db,access,clock,policyVersion,journal:captureJournal,keys});
 journal=await createSyntheticProductionJournal({env,directory:dirs[1],keys,testHooks:{beforeAppend:async()=>{if(outage)throw Error('Invented outage');}}});
 const email='production-ui@example.invalid';await access.request({email,purpose:'join'});const adult=await access.verify({token:delivered.get(email)});assert.equal(adult.status,'verified');materials.set(adult.householdId,randomBytes(32));
 await consent.record(adult.sessionToken,{command_id:randomUUID(),policy_version:policyVersion,required_service:true,optional_contact:false,optional_story:false});
 const children=[];for(const initial of [true,false]){const state=await setup.status(adult.sessionToken);children.push((await setup.save(adult.sessionToken,{command_id:randomUUID(),setup_context:state.setup_context,operation:'create',initial,profile:{nickname:initial?'Invented Production':'Invented Sibling',age:6,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}})).child);}
 const entitlement=randomUUID();await db.query('INSERT INTO entitlements VALUES($1,$2)',[adult.householdId,entitlement]);await db.transaction(tx=>kernel.activateTrial(tx,{household_id:adult.householdId,consent_epoch:1},{command_id:randomUUID(),entitlement_id:entitlement},{synthetic:true,policy_version:'ui-test-trial',allowance:3,duration_seconds:3600,allocation_scope:'household'}));
 const capacity={policy_version:'TEST-CAPACITY-v1',offer_version:randomUUID(),bucket_id:randomUUID(),starts_at:new Date(at).toISOString(),ends_at:new Date(at+3600000).toISOString(),coverage_end:new Date(at+90000000).toISOString(),limit:1,synthetic_only:true};
 let production=await createSyntheticProductionSubmission({env,db,access,capture,kernel,journal,keys,capacity,clock,policyVersion});
 const family=await createSyntheticFamilySpace({env,db,access,clock,policyVersion,content:{question:capture.question,revision:async()=>{throw Error('No revision fixture');}},play:{resume:async()=>{throw Error('No play fixture');},reconcile:async()=>{throw Error('No play fixture');}}});
 server=createSyntheticAdultAccessServer({env,access,consent,setup,capture,family,production:{eligibility:(...a)=>production.eligibility(...a),status:(...a)=>production.status(...a),submit:(...a)=>production.submit(...a),reconcile:(...a)=>production.reconcile(...a)}});await new Promise(done=>server.listen(0,'127.0.0.1',done));
 return {db,adult,children,access,consent,kernel,capture,family,capacity,get production(){return production;},clock,origin:'http://127.0.0.1:'+server.address().port,outage:v=>{outage=v;},advance:n=>{at+=n;},async reopen(){await journal.close();journal=await createSyntheticProductionJournal({env,directory:dirs[1],keys});production=await createSyntheticProductionSubmission({env,db,access,capture,kernel,journal,keys,capacity,clock,policyVersion});}};
}
async function browser(t,f){
 const require=createRequire(new URL('../package.json',import.meta.url)),{JSDOM}=require('jsdom');const nativeFetch=globalThis.fetch,requests=[];let lose=false,held=false,release;
 const names=['window','document','navigator','HTMLElement','Node','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch'],prior=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:f.origin+'/loop-preview/family',pretendToBeVisual:true});
 const transport=async(route,options={})=>{if(String(route).startsWith('/adult/production/'))requests.push({route:String(route),body:JSON.parse(options.body)});const response=await nativeFetch(new URL(route,f.origin),{...options,headers:{...options.headers,Origin:f.origin,Cookie:'loop_adult_session='+f.adult.sessionToken}});if(String(route)==='/adult/production/submit'){if(lose){lose=false;await response.arrayBuffer();throw Error('Invented FIRST reply loss');}if(held){held=false;await new Promise(done=>release=done);}}return response;};
 for(const n of names)Object.defineProperty(globalThis,n,{value:n==='IS_REACT_ACT_ENVIRONMENT'?true:n==='fetch'?transport:dom.window[n],configurable:true,writable:true});
 for(const n of ['getItem','setItem','removeItem','clear'])dom.window.Storage.prototype[n]=()=>{throw Error('Private storage forbidden');};
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),urls=[new URL('../app/LoopFamilyHome.tsx',import.meta.url).href,new URL('../app/LoopWonderCapture.tsx',import.meta.url).href];
 const hook=registerHooks({resolve(s,c,next){if(s==='./LoopWonderCapture')return {url:urls[1],shortCircuit:true};return next(s,c);},load(url,c,next){if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};if(urls.includes(url)){const ts=require('typescript'),compiled=ts.transpileModule(require('node:fs').readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:new URL(url).pathname,reportDiagnostics:true});assert(!(compiled.diagnostics??[]).some(d=>d.category===ts.DiagnosticCategory.Error));return {format:'module',source:compiled.outputText,shortCircuit:true};}return next(url,c);}});
 const {default:Home}=await import(urls[0]);let root;
 const text=()=>document.body.textContent;
 async function until(check){for(let i=0;i<260;i++){await act(async()=>{await new Promise(done=>setTimeout(done,15));});if(check())return;}throw Error('Production UI condition timed out: '+text());}
 async function choose(position){await act(async()=>{const s=document.getElementById('family-child');assert(s);s.value=String(position);s.dispatchEvent(new Event('change',{bubbles:true}));});await until(()=>document.getElementById('wonder-title'));}
 async function mount(){root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(Home)));await until(()=>document.getElementById('family-child'));await choose(0);}
 async function unmount(){if(root){await act(async()=>root.unmount());root=null;}}
 async function click(label){const b=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert(b&&!b.disabled,'Required enabled action: '+label);await act(async()=>b.click());}
 async function input(id,value){await act(async()=>{const e=document.getElementById(id);Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));});}
 async function save(question){await click('Start a wonder');await input('family-wonder',question);await input('family-wonder-context','Invented separate context');await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Review saved-only wonder'&&!b.disabled));await click('Review saved-only wonder');await click('Confirm saved-only wonder');await until(()=>text().includes('Wonder saved. No investigation has been requested.'));await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Review production request 1'&&!b.disabled));assert.equal(document.getElementById('family-wonder'),null,'Acknowledged save closes the editor so production review is reachable');}
 async function review(){await click('Review production request 1');await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Confirm production request'&&!b.disabled));assert.equal(document.activeElement.id,'production-confirm-title');}
 t.after(async()=>{release?.();await unmount();hook.deregister();dom.window.close();for(const [n,d]of prior){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}});
 return {text,until,mount,unmount,choose,click,save,review,requests,lose:()=>{lose=true;},hold:()=>{held=true;},isHeld:()=>typeof release==='function',release:async()=>{await act(async()=>{release?.();await new Promise(done=>setTimeout(done,20));});}};
}

test('real React/HTTP separates saving from production, retains first uncertain intent and recovers after reload',async t=>{
 const f=await fixture(t),b=await browser(t,f);await b.mount();await b.save('  Invented exact words 🛶\n  ');
 assert.equal((await f.db.query('SELECT * FROM production_commands')).rows.length,0);assert.equal((await f.db.query('SELECT * FROM entitlement_claims')).rows.length,0);
 await b.review();assert(b.text().includes('Invented exact words'));f.outage(true);b.lose();await b.click('Confirm production request');await b.until(()=>b.text().includes('Not confirmed requested.'));
 const first=b.requests.find(r=>r.route.endsWith('/submit')).body;assert.deepEqual(Object.keys(first.command).sort(),['contract_version','record_type','command','idempotency_key','child_id','wonder_id','wonder_version','consent_epoch','offer_version','scope_version'].sort());assert(!JSON.stringify(first).includes('Invented exact words'));assert(!b.text().includes('Wonder saved. No investigation has been requested.'));
 await b.click('Retry original production request');await b.until(()=>b.text().includes('The server may hold this request'));const submits=b.requests.filter(r=>r.route.endsWith('/submit'));assert.equal(submits.length,2);assert.deepEqual(submits[1].body,first);
 assert.equal((await f.db.query('SELECT * FROM production_commands')).rows.length,1);assert.equal((await f.db.query('SELECT * FROM production_acknowledgements')).rows.length,0);assert(!document.querySelector('[aria-label="Selected child space"]'));
 await b.unmount();await f.reopen();await b.mount();await b.until(()=>b.text().includes('Reconcile pending production 1'));await b.click('Reconcile pending production 1');await b.until(()=>b.text().includes('Request received. A production place is booked.'));await b.until(()=>document.querySelector('[aria-label="Selected child space"]'));
 assert(!b.text().includes('Wonder saved. No investigation has been requested.'));const row=(await f.db.query('SELECT * FROM production_receipts')).rows[0];assert.equal(new Date(row.original_due_at)-new Date(row.original_received_at),86400000);assert.equal((await f.db.query('SELECT * FROM wonder_requests')).rows.length,1);assert.equal((await f.db.query('SELECT * FROM production_capacity_bookings')).rows.length,1);
 const rec=b.requests.find(r=>r.route.endsWith('/reconcile'));assert.deepEqual(Object.keys(rec.body).sort(),['selection','idempotency_key'].sort());assert.equal(rec.body.idempotency_key,first.command.idempotency_key);
 await b.save('A second invented wonder');await b.click('Review production request 1');await b.until(()=>b.text().includes('No production place is available.'));assert(b.text().includes('Keep saved-only wonder'));assert.equal((await f.db.query('SELECT * FROM production_commands')).rows.length,1);assert.equal((await f.db.query('SELECT * FROM wonder_requests WHERE original_received_at IS NULL')).rows.length,1);
});

test('a held actual production reply cannot restore sibling or withdrawn private content',async t=>{
 const f=await fixture(t),b=await browser(t,f);await b.mount();await b.save('Invented first child private words');await b.review();b.hold();await b.click('Confirm production request');await b.until(b.isHeld);
 assert.equal((await f.db.query('SELECT * FROM production_acknowledgements')).rows.length,1,'Hold is after the actual acknowledged server result');
 await b.choose(1);await b.until(()=>b.text().includes('Invented Sibling’s wonders'));await b.release();assert(!b.text().includes('Invented first child private words'));assert(!b.text().includes('Request received. A production place is booked.'));
 await f.consent.withdraw(f.adult.sessionToken,{command_id:randomUUID(),policy_version:policyVersion});await b.click('Retry production access');await b.until(()=>b.text().includes('Test permission needed'));assert(!document.getElementById('production-title'));assert(!b.text().includes('Invented Sibling'));
});

test('actual core released capacity frees the configured window; completed usage remains counted',async t=>{
 const f=await fixture(t),index=await f.family.index(f.adult.sessionToken),child=f.children[0],selection={view_context:index.view_context,child_id:child.child_id,profile_version:child.profile_version},intents=[];
 for(let i=0;i<3;i++){
  const saved=await f.capture.save(f.adult.sessionToken,{...selection,command_id:randomUUID(),operation:'create',question:'Invented capacity lifecycle '+i,parent_context:null});assert.equal(saved.state,'acknowledged');
  const e=await f.production.eligibility(f.adult.sessionToken,{selection,wonder_id:saved.request_id,wonder_version:saved.source_scope_version});assert.equal(e.status,'eligible');
  intents.push({selection,command:{contract_version:'1.1.0',record_type:'submit',command:'SubmitProduction',idempotency_key:randomUUID(),child_id:child.child_id,wonder_id:saved.request_id,wonder_version:saved.source_scope_version,consent_epoch:e.consent_epoch,offer_version:e.offer_version,scope_version:e.scope_version}});
 }
 const first=await f.production.submit(f.adult.sessionToken,intents[0]);assert.equal(first.status,'acknowledged');assert.equal((await f.production.submit(f.adult.sessionToken,intents[1])).status,'no_capacity');
 await f.db.transaction(async tx=>{
  await f.kernel.apply(tx,{household_id:f.adult.householdId,consent_epoch:1},{contract_version:'1.1.0',transition_id:randomUUID(),request_id:first.receipt.request_id,period_id:first.receipt.period_id,policy_version:'ui-test-trial',expected_version:1,consent_epoch:1,quantity:1,kind:'release',from:'pending',to:'released',cause:'CancelRequest',cause_id:randomUUID()},{});
  await tx.query("UPDATE capacity_reservations SET state='released' WHERE household_id=$1 AND reservation_id=$2",[f.adult.householdId,first.receipt.booking_id]);
 });
 const second=await f.production.submit(f.adult.sessionToken,intents[1]);assert.equal(second.status,'acknowledged');
 // Trusted capacity lifecycle fixture only; no assignment readiness/publication
 // or human content approval is claimed by setting this core usage state.
 await f.db.query("UPDATE capacity_reservations SET state='completed' WHERE household_id=$1 AND reservation_id=$2",[f.adult.householdId,second.receipt.booking_id]);
 const denied=await f.production.submit(f.adult.sessionToken,intents[2]);assert.equal(denied.status,'no_capacity');assert(!Object.hasOwn(denied,'receipt'));
 const counts=(await f.db.query("SELECT c.state,count(*) n FROM production_capacity_bookings b JOIN capacity_reservations c ON c.household_id=b.household_id AND c.request_id=b.request_id AND c.reservation_id=b.booking_id WHERE b.bucket_id=$1 GROUP BY c.state",[f.capacity.bucket_id])).rows;assert.deepEqual(Object.fromEntries(counts.map(r=>[r.state,Number(r.n)])),{released:1,completed:1});
 assert.deepEqual(await f.production.submit(f.adult.sessionToken,intents[0]),first);assert.deepEqual(await f.production.submit(f.adult.sessionToken,intents[1]),second);
 assert.equal((await f.db.query('SELECT * FROM production_commands')).rows.length,2);assert.equal((await f.db.query('SELECT original_received_at FROM wonder_requests WHERE request_id=$1',[intents[2].command.wonder_id])).rows[0].original_received_at,null);
});
