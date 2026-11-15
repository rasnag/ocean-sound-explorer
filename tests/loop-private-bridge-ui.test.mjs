// Actual HTTP/client/React and recovery regression candidates. NOT RUN BY THE AUTHOR.
import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';import {performance} from 'node:perf_hooks';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createRequire,registerHooks} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';import {resolve} from 'node:path';
import {privateBridgeFixture,readyBridgeSource} from './private-bridge-fixture.mjs';
import {reviewRead,reviewCommand} from './loop-review-service.test.mjs';
import {createSyntheticReviewJournal,observeSyntheticReviewIntegrity} from '../server/review-journal.mjs';
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
 let mounted;const tick=()=>new Promise(r=>setTimeout(r,25)),text=()=>document.body.textContent;
 async function until(predicate,label='DOM condition'){
  const deadline=performance.now()+60000;
  do{await act(async()=>{await tick();});if(predicate())return;}while(performance.now()<deadline);
  throw Error('Private React deadline exceeded: '+label+'; indexCalls='+indexCalls+'; readCalls='+readCalls+'; heldReached='+reached);
 }
 async function click(label){const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert(button&&!button.disabled,label);await act(async()=>button.click());}
 async function poll(){const count=readCalls;await act(async()=>{for(const fn of [...pollers])fn();});await until(()=>readCalls>count,'actual family poll completion');await act(async()=>{await tick();});}
 try{
  const {default:Home}=await import(urls[0]);mounted=createRoot(document.getElementById('root'));await act(async()=>mounted.render(React.createElement(Home)));await until(()=>document.getElementById('family-child'),'child selector');
  await act(async()=>{const select=document.getElementById('family-child');select.value='0';select.dispatchEvent(new Event('change',{bubbles:true}));});await until(()=>text().includes('Readiness awaiting confirmation'),'pending readiness');
  assert(text().includes('1 awaiting readiness confirmation, already counted as used'));assert(!text().includes('Open investigation introduction'));
  await act(async()=>{f.bridgeOutage(false);await f.bridge.reconcile(f.founderToken,{...x.scope,command_id:x.command.command.command_id});});await poll();await until(()=>text().includes('Open investigation introduction'),'acknowledged introduction action');
  // Positive held-response control: no newer read, so the actual response renders.
  hold=true;reached=false;await click('Open investigation introduction');await until(()=>reached,'positive actual authorized open reached');await act(async()=>{release();await tick();});await until(()=>document.querySelector('[aria-label="Opened investigation"]'),'positive held response rendered');assert(text().includes(x.snapshot.adventure.opening));
  await poll();assert(document.querySelector('[aria-label="Opened investigation"]'),'A healthy production poll must retain the displayed entry');await click('Close investigation view');
  hold=true;reached=false;await click('Open investigation introduction');await until(()=>reached,'negative actual authorized open reached');
  await act(async()=>{const v=await reviewRead(f,x.scope);f.reviewOutage(true);await f.review.command(f.founderToken,reviewCommand(x.scope,v,'WithdrawTestSnapshot',{snapshot_id:x.snapshot.snapshot_id,reason:'Invented held-response withdrawal.'}));});
  // This route calls onObserved -> captureAcknowledged -> read directly.
  // It does not invoke focus/pageshow/refresh or change children.
  await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.startsWith('View request 1:')&&!b.disabled),'direct request action');const indices=indexCalls,reads=readCalls;
  const viewButton=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('View request 1:'));await act(async()=>viewButton.click());await until(()=>readCalls>reads&&text().includes('Readiness unavailable'),'newer direct read closes availability');assert.equal(indexCalls,indices,'Held-response test must bypass the old refresh fence');
  await act(async()=>{release();await tick();});assert(!document.querySelector('[aria-label="Opened investigation"]'));assert(!text().includes(x.snapshot.adventure.opening));
  await act(async()=>{f.reviewOutage(false);const pending=(await f.db.query('SELECT c.command_id FROM review_slice_commands c LEFT JOIN review_slice_acknowledgements a USING(household_id,command_id) WHERE a.command_id IS NULL')).rows;for(const p of pending)await f.review.reconcile(f.founderToken,{...x.scope,command_id:p.command_id});});await poll();await until(()=>text().includes('Readiness withdrawn'),'acknowledged withdrawal');assert.equal(f.legacyCalls(),0);assert.equal(f.playCalls().start,0);assert.equal(f.playCalls().commit,0);
 }finally{release?.();if(mounted)await act(async()=>mounted.unmount());hook.deregister();dom.window.close();for(const[k,d]of prior){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
const first=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0];
const deniedIntegrity=e=>e?.code==='recovery_quarantined'&&e.status===503;
async function projection(f,x){return f.db.transaction(tx=>f.queueAdapter.project(tx,{household_id:f.adult.householdId,request_id:x.scope.request_id,child_id:f.children[0].child_id,consent_epoch:1}));}
async function selectedHome(f){const i=await f.family.index(f.adult.sessionToken);return f.family.read(f.adult.sessionToken,{view_context:i.view_context,child_id:f.children[0].child_id});}
async function immutableEffects(f){const out={};for(const table of ['production_receipts','private_bridge_commands','private_bridge_bindings','private_bridge_ready_events','private_bridge_acks','private_bridge_delivery_work','entitlement_claims','entitlement_transitions','capacity_reservations','assignments','published_revisions'])out[table]=(await f.db.query('SELECT * FROM '+table)).rows;return out;}
async function assertDeadlineViews(f,x,late){const q=await projection(f,x),h=await selectedHome(f),overdue=await f.queueAdapter.founderRead(f.founderToken,{filter:'overdue'});assert.equal(q.late,late);assert.equal(h.requests.find(r=>r.request_id===x.scope.request_id).overdue,late);assert.equal(overdue.requests.some(r=>r.request_id===x.scope.request_id),late);return q;}
test('private deadlines: paired on-time, exactly-due and genuinely late readiness retain original clocks across unsent support updates',async t=>{
 for(const timing of ['on-time','exactly-due','late'])await t.test(timing,async sub=>{
  const f=await privateBridgeFixture(sub),x=await readyBridgeSource(f,'Invented deadline control '+timing),original=await projection(f,x),due=Date.parse(original.receipt.original_due_at);
  if(timing!=='on-time'){f.advance(due-f.clock()+(timing==='late'?1:0));await f.loginAgain();}
  const ack=await f.bridge.makeReady(f.founderToken,x.command),late=timing==='late';assert.equal(Date.parse(ack.ready_at)>due,late);if(timing==='exactly-due')assert.equal(Date.parse(ack.ready_at),due);
  if(f.clock()<=due){f.advance(due-f.clock()+1000);if(timing==='on-time')await f.loginAgain();}
  const q=await assertDeadlineViews(f,x,late);assert.equal(q.state,'accepted');assert.equal(q.can_cancel,false);const effects=await immutableEffects(f);
  await f.queueAdapter.founderCommand(f.founderToken,{command_id:randomUUID(),household_id:f.adult.householdId,request_id:x.scope.request_id,expected_version:q.aggregate_version,consent_epoch:1,action:'PrepareLateUpdate',payload:{message:'Invented unsent deadline support update.',revised_estimate:new Date(f.clock()+90000).toISOString()}});
  const after=await assertDeadlineViews(f,x,late);assert.equal(after.breach_observed,late);assert.equal(after.late_update.sent,false);assert.deepEqual(after.receipt,original.receipt);assert.equal(Date.parse(after.receipt.original_due_at)-Date.parse(after.receipt.original_received_at),86400000);assert.deepEqual(await immutableEffects(f),effects);
  const status=await f.bridge.status(f.founderToken,{...x.scope,command_id:x.command.command.command_id});assert.equal(status.ready_at,ack.ready_at);assert.equal(status.acknowledged_at,ack.acknowledged_at);assert.equal(status.delivery_state,'not_attempted');
  const v=await reviewRead(f,x.scope);await f.review.command(f.founderToken,reviewCommand(x.scope,v,'WithdrawTestSnapshot',{snapshot_id:x.snapshot.snapshot_id,reason:'Invented withdrawal must preserve historical timing.'}));await assertDeadlineViews(f,x,late);assert.deepEqual(await immutableEffects(f),effects);
  assert.deepEqual(f.playCalls(),{start:0,commit:0,resume:0,reconcile:0});for(const table of ['play_sessions','play_events'])assert.equal(Number((await first(f.db,'SELECT count(*) n FROM '+table)).n),0);
 });
});
test('private deadlines: absent readiness remains overdue; primary readiness stops the clock before ACK',async t=>{
 const f=await privateBridgeFixture(t),x=await readyBridgeSource(f),q=await projection(f,x);assert.equal(q.late,false);f.bridgeOutage(true);const pending=await f.bridge.makeReady(f.founderToken,x.command);assert.equal(pending.status,'retryable_unacknowledged');f.advance(Date.parse(q.receipt.original_due_at)-f.clock()+1);await f.loginAgain();await assertDeadlineViews(f,x,false);assert.equal((await selectedHome(f)).requests[0].state,'readiness_pending');
 f.bridgeOutage(false);const ack=await f.bridge.reconcile(f.founderToken,{...x.scope,command_id:x.command.command.command_id});assert.equal(ack.ready_at,pending.ready_at);assert(Date.parse(ack.acknowledged_at)>Date.parse(q.receipt.original_due_at));await assertDeadlineViews(f,x,false);
 const cleanup=[];try{const other=await privateBridgeFixture({after:fn=>cleanup.push(fn)}),y=await readyBridgeSource(other,'Invented overdue without readiness control.'),original=await projection(other,y);other.advance(Date.parse(original.receipt.original_due_at)-other.clock()+1);await other.loginAgain();await assertDeadlineViews(other,y,true);assert.equal(Number((await first(other.db,'SELECT count(*) n FROM private_bridge_commands')).n),0);}finally{for(const fn of cleanup.reverse())await fn();}
});
test('private deadline metadata: inconsistent owned events refuse projection instead of falling back to wall time',async t=>{
 const f=await privateBridgeFixture(t),x=await readyBridgeSource(f);await f.bridge.makeReady(f.founderToken,x.command);assert.equal((await projection(f,x)).late,false);
 await f.db.exec("SET session_replication_role='replica'");try{await f.db.query('DELETE FROM private_bridge_ready_events');}finally{await f.db.exec("SET session_replication_role='origin'");}
 await assert.rejects(()=>projection(f,x),deniedIntegrity);await assert.rejects(()=>selectedHome(f),e=>e.status===503);assert.equal(f.legacyCalls(),0);
});
function assertPrivateFree(events,secrets){assert(events.length);for(const e of events){assert.deepEqual(Object.keys(e).sort(),['boundary','component','expected_hash','observed_hash']);assert(['review-journal','review-service'].includes(e.component));assert.match(e.boundary,/^[a-z0-9_:-]{1,100}$/);for(const k of ['expected_hash','observed_hash'])assert(e[k]===null||/^[0-9a-f]{64}$/.test(e[k]));}const text=JSON.stringify(events);for(const secret of secrets)if(secret)assert(!text.includes(secret));}
test('private integrity diagnostics: actual producer-history mismatch captures opaque differences, generic denial and healthy control',async t=>{
 const f=await privateBridgeFixture(t),words='Invented private diagnostic question '+randomUUID(),x=await readyBridgeSource(f,words);assert.deepEqual(f.reviewDiagnostics(),[]);assert.equal((await reviewRead(f,x.scope)).snapshots.length,1);
 await f.db.exec("SET session_replication_role='replica'");try{await f.db.query("UPDATE review_slice_snapshots SET output_digest=repeat('f',64)");}finally{await f.db.exec("SET session_replication_role='origin'");}
 await assert.rejects(()=>reviewRead(f,x.scope),e=>deniedIntegrity(e)&&e.message==='Local TEST review unavailable.');const events=f.reviewDiagnostics(),event=events.find(e=>e.component==='review-service'&&e.boundary==='materialized-snapshot');assert(event);assert.notEqual(event.expected_hash,event.observed_hash);assertPrivateFree(events,[words,x.snapshot.adventure.opening,f.founderToken,f.adult.sessionToken]);assert.equal(Number((await first(f.db,'SELECT count(*) n FROM private_bridge_commands')).n),0);
});
test('private integrity diagnostics: actual storage corruption, one-use denial, sink failures and restored healthy reopen',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'loop-private-diagnostic-')),household=randomBytes(32),operator=randomBytes(32),events=[];let journal,throwSink=false;
 const stop=observeSyntheticReviewIntegrity(e=>{events.push(e);if(throwSink)throw Error('Invented diagnostic sink failure');});const stopAsync=observeSyntheticReviewIntegrity(()=>Promise.reject(Error('Invented asynchronous diagnostic sink failure')));
 t.after(async()=>{stop();stopAsync();await journal?.close();household.fill(0);operator.fill(0);await rm(directory,{recursive:true,force:true});});
 const options={env:{LOOP_ENV:'local-synthetic'},directory,keys:{keyForHousehold:()=>household,keyForOperator:()=>operator}};
 journal=await createSyntheticReviewJournal(options);assert.deepEqual(events,[]);await journal.claimFreshNamespace();throwSink=true;await assert.rejects(()=>journal.claimFreshNamespace(),deniedIntegrity);assert.deepEqual(await journal.records('operator'),[]);throwSink=false;
 const privateText='Invented private diagnostic payload '+randomUUID(),h=randomUUID(),fact={format:'queue-committed-fact-v1',scope:'household',household_id:h,consent_epoch:1,record_id:randomUUID(),command_id:randomUUID(),primary_commit_id:randomUUID(),actor_id:randomUUID(),actor_kind:'founder',original_session_hash:'1'.repeat(64),recorded_at:'2026-11-14T00:00:00.000Z',aggregate_version:1,canonical_digest:'2'.repeat(64),namespace_verifier:journal.namespace_verifier,command:{synthetic:true,words:privateText},result:{synthetic:true},effect:{synthetic:true}};
 await journal.append(await journal.seal(fact));await journal.close();events.length=0;journal=await createSyntheticReviewJournal(options);assert.equal((await journal.records(h)).length,1);assert.deepEqual(events,[]);
 const marker=join(directory,'review-namespace.json'),original=await readFile(marker),damaged=JSON.parse(original.toString('utf8'));damaged.log_identity=damaged.log_identity.replace(/\d/g,d=>String((Number(d)+1)%10));const damagedBytes=Buffer.from(JSON.stringify(damaged)+'\n','utf8');assert.equal(damagedBytes.length,original.length);await writeFile(marker,damagedBytes);const refused=await readFile(marker);throwSink=true;
 await assert.rejects(()=>journal.records(h),e=>deniedIntegrity(e)&&e.message==='Local TEST review journal unavailable.');assert.deepEqual(await readFile(marker),refused);const mismatch=events.find(e=>e.boundary==='marker-validation');assert(mismatch);assert.notEqual(mismatch.expected_hash,mismatch.observed_hash);assertPrivateFree(events,[privateText,household.toString('hex'),operator.toString('hex'),h,fact.command_id,directory]);
 await writeFile(marker,original);await assert.rejects(()=>journal.records(h),deniedIntegrity);await journal.close();throwSink=false;events.length=0;journal=await createSyntheticReviewJournal(options);assert.equal((await journal.records(h)).length,1);assert.deepEqual(events,[]);assert.deepEqual(await readFile(marker),original);
});
