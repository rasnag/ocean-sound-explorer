// COST-LOCAL-01 / actual private HTTP and browser integration tests.
// Architecture v1.2 / ADR-E03/E04/E06; SHA256
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {costFixture,readyCostRequest,costRead,costCommand,applyCost,stagePayload,tableHashes,unchanged} from './loop-cost-service.test.mjs';
import {bookAccepted,startDraft,waitDraft,draftRead,draftCommand} from './loop-generation-service.test.mjs';
import {createCostClient} from '../lib/loop/cost-client.mjs';import {createSyntheticAuthServer} from '../server/loop-auth.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label='condition',timeout=9000){const deadline=Date.now()+timeout;do{if(await check())return;await delay(20);}while(Date.now()<deadline);assert.fail('Timed out waiting for '+(typeof label==='function'?label():label));}
const json=r=>JSON.parse(r.text);
export async function founderCostHost(f){
 const options=f.generationOptions();
 const cost=Object.freeze(Object.fromEntries(['list','read','command','reconcile'].map(name=>[name,(...args)=>f.cost[name](...args)])));
 const generation=Object.freeze(Object.fromEntries(['list','read','command','reconcile'].map(name=>[name,(...args)=>f.generation[name](...args)])));
 const server=createSyntheticAuthServer({env:options.env,auth:options.auth,queue:options.queue,generation,cost});
 const active=new Set();let cookie='',armed=false,held=null,closed=false;
 // Hold the actual HTTP response after the real host/service has produced it.
 // No auth, queue, generation or cost method is replaced to manufacture data.
 server.prependListener('request',(req,res)=>{
  if(!armed||req.url!=='/founder/cost/read')return;
  armed=false;const end=res.end;
  res.end=function(...args){
   assert.equal(res.statusCode,200,'Hold requires a real successful read');
   held={text:String(args[0]),released:false,release(){if(this.released)return;this.released=true;end.apply(res,args);}};
   return res;
  };
 });
 async function close(){
  if(closed)return;closed=true;held?.release();
  for(const req of active)req.destroy();
  if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});
  assert.equal(server.listening,false);
  await until(()=>active.size===0,'all owned HTTP requests closed');
 }
 f.cleanup(close);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 function request(route,{method='POST',body='{}',headers={},extraHeaders=[],authenticated=true,signal}={}){
  assert.equal(closed,false);
  const url=new URL(route,origin);assert.equal(url.origin,origin,'Only the owned loopback host is permitted');
  const values={Host:url.host,Origin:origin,Connection:'close',...(authenticated&&cookie?{Cookie:cookie}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{}),...headers};
  if(body!==null)values['Content-Length']=Buffer.byteLength(body);
  const raw=[...Object.entries(values).flatMap(([k,v])=>[k,String(v)]),...extraHeaders];
  return new Promise((resolve,reject)=>{
   const req=http.request({hostname:'127.0.0.1',port:url.port,path:url.pathname+url.search,method,headers:raw,agent:false,signal},res=>{
    const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.once('error',reject);
    res.once('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));
   });
   active.add(req);req.once('close',()=>active.delete(req));req.once('error',reject);
   req.setTimeout(12000,()=>req.destroy(new Error('Owned HTTP request timed out')));
   req.end(body===null?undefined:body);
  });
 }
 const get=(route,options={})=>request(route,{...options,method:'GET',body:null});
 const post=(route,input,options={})=>request(route,{...options,body:JSON.stringify(input)});
 // Obtain the cookie through the actual host's login endpoint and real issuer.
 // A fresh TOTP period avoids replaying generationFixture's initial login code.
 f.advance(31000);
 const login=await post('/login',f.developerIdentity(),{authenticated:false});
 assert.equal(login.status,200);assert.deepEqual(json(login),{success:true});
 const issued=login.headers['set-cookie'];assert.equal(issued.length,1);
 assert.match(issued[0],/^loop_session=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/$/);
 cookie=issued[0].split(';')[0];
 return {server,origin,request,get,post,close,active,hold(){assert(!armed&&(!held||held.released));held=null;armed=true;},held:()=>held,release(){held?.release();}};
}

export function hostCostFetcher(h){return async(route,options={})=>{const r=await h.request(route,{method:options.method,body:options.body,headers:options.headers,signal:options.signal});return {ok:r.status>=200&&r.status<300,status:r.status,headers:{get:n=>r.headers[n.toLowerCase()]??null},json:async()=>JSON.parse(r.text),text:async()=>r.text,arrayBuffer:async()=>Uint8Array.from(Buffer.from(r.text)).buffer};};}
export async function costBrowser(f,h){
 const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
 const page=await h.get('/founder/cost');assert.equal(page.status,200);assert.match(page.headers['cache-control'],/no-store/);
 const dom=new JSDOM(page.text,{url:h.origin+'/founder/cost',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.AbortController=globalThis.AbortController;w.TextEncoder=globalThis.TextEncoder;w.TextDecoder=globalThis.TextDecoder;
 Object.defineProperty(w.crypto,'randomUUID',{value:randomUUID,configurable:true});
 const sent=[],flights=new Set(),intervals=new Set(),errors=[];let lose=false,stopped=false,beforeCommand=null,earlyDrop=null;
 const set=w.setInterval.bind(w),clear=w.clearInterval.bind(w);
 w.setInterval=(fn,ms,...args)=>{const id=set(fn,ms,...args);intervals.add(id);return id;};
 w.clearInterval=id=>{intervals.delete(id);clear(id);};
 w.addEventListener('error',e=>errors.push(e.error??e.message));
 for(const name of ['getItem','setItem','removeItem','clear'])w.Storage.prototype[name]=()=>{throw Error('Private browser storage forbidden');};
 w.fetch=(route,options={})=>{
  assert.equal(stopped,false,'No requests after page lifecycle shutdown');
  assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');
  assert.equal(options.referrerPolicy,'no-referrer');
  const entry={route:String(route),body:JSON.parse(options.body),completed:false};sent.push(entry);
  const flight=(async()=>{
   if(String(route)==='/founder/cost/command'&&beforeCommand){const hook=beforeCommand;beforeCommand=null;await hook(entry);}
   const actual=h.request(route,{method:options.method,body:options.body,headers:options.headers,signal:options.signal});
   if(String(route)==='/founder/cost/command'&&earlyDrop){
    const wait=earlyDrop;earlyDrop=null;flights.add(actual);
    actual.then(response=>{entry.status=response.status;entry.completed=true;flights.delete(actual);},()=>flights.delete(actual));
    await wait;throw Error('Invented client reply loss while actual HTTP command is still in flight');
   }
   const response=await actual;
   entry.status=response.status;entry.completed=true;
   if(String(route)==='/founder/cost/command'&&lose){lose=false;throw Error('Invented lost actual HTTP command response');}
   // Real browser response.json creates objects in that browser's realm.
   return {ok:response.status>=200&&response.status<300,status:response.status,headers:{get:name=>response.headers[name.toLowerCase()]??null},json:async()=>w.JSON.parse(response.text),text:async()=>response.text,arrayBuffer:async()=>Uint8Array.from(Buffer.from(response.text)).buffer};
  })();
  flights.add(flight);flight.then(()=>flights.delete(flight),()=>flights.delete(flight));return flight;
 };
 const $=id=>w.document.getElementById(id),text=()=>w.document.body.textContent;
 async function stop(){
  if(stopped)return;
  w.dispatchEvent(new w.Event('pagehide'));w.dispatchEvent(new w.Event('unload'));stopped=true;
  h.release();await until(()=>flights.size===0,'browser requests stopped');
  assert.equal(intervals.size,0,'pagehide must clear authority polling');
  assert.equal($('cost-view').childElementCount,0);assert.equal($('cost-recovery').childElementCount,0);
  const count=sent.length;w.dispatchEvent(new w.Event('focus'));assert.equal(sent.length,count);
  assert.deepEqual(errors,[]);w.close();
 }
 f.cleanup(stop);
 const source=await h.get('/founder/cost.js');assert.equal(source.status,200);w.eval(source.text);
 async function choose(s){
  await until(()=>[...$('cost-request').options].some(o=>o.value&&JSON.parse(o.value)[1]===s.request_id),'accepted cost request');
  $('cost-request').value=[...$('cost-request').options].find(o=>o.value&&JSON.parse(o.value)[1]===s.request_id).value;
  $('cost-request').dispatchEvent(new w.Event('change',{bubbles:true}));
  await until(()=>$('cost-minutes')&&!$('cost-time').disabled,'authorized synthetic cost controls');
 }
 function input(id,value){const e=$(id);assert(e,id);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));}
 function select(id,value){const e=$(id);assert(e,id);e.value=value;e.dispatchEvent(new w.Event('change',{bubbles:true}));}
 function tick(id,value){const e=$(id);assert(e,id);e.checked=value;e.dispatchEvent(new w.Event('change',{bubbles:true}));}
 async function click(id){await until(()=>$(id)&&!$(id).disabled,'enabled '+id);$(id).click();}
 async function confirmed(){await until(()=>$('cost-minutes')&&$('cost-status').textContent.startsWith('Saved:'),'independent ACK and exact authorized history');}
 async function polls(n=3){const before=sent.filter(x=>x.route==='/founder/cost/list'&&x.completed).length;await until(()=>sent.filter(x=>x.route==='/founder/cost/list'&&x.completed).length>=before+n,'multiple completed authority polls');}
 return {w,$,text,sent,choose,input,select,tick,click,confirmed,polls,stop,dropBeforeReply(wait){earlyDrop=wait;},beforeCommand(fn){beforeCommand=fn;},lose(){lose=true;}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 test('cost HTTP: optional routes and real founder cookie preserve strict private transport',async t=>{
  const f=await costFixture(t),s=await readyCostRequest(f),h=await founderCostHost(f);const absent=await f.fetcher('/founder/cost');assert.equal(absent.status,404);await absent.text();const home=await h.get('/founder');assert.equal(home.status,200);assert(home.text.includes('href="/founder/cost"'));const baseline=await tableHashes(f.db);
  for(const route of ['/founder/cost','/founder/cost.js','/founder/cost.css']){const yes=await h.get(route);assert.equal(yes.status,200);assert.match(yes.headers['cache-control'],/no-store/);assert.match(yes.headers['content-security-policy'],/default-src 'none'/);const no=await h.get(route,{authenticated:false});assert.equal(no.status,401);}
  const client=createCostClient(hostCostFetcher(h)),list=await client.list({});assert(list.requests.some(x=>x.request_id===s.request_id));const v=await client.read(s);assert.equal(v.status,'cost_view');assert.equal(v.version,0);const cmd=costCommand(s,v,'RecordStageTime',stagePayload());assert.equal((await client.command(cmd)).status,'acknowledged');assert.equal((await client.read(s)).summary.direct.known_minutes,2);
  for(const [options,status]of [[{authenticated:false},401],[{headers:{Host:'localhost:'+h.server.address().port}},403],[{headers:{Origin:'https://outside.invalid'}},403],[{headers:{'X-Household-Id':s.household_id}},403],[{headers:{Authorization:'Bearer invented'}},403],[{headers:{'Sec-Fetch-Site':'cross-site'}},403],[{extraHeaders:['Origin',h.origin]},403],[{extraHeaders:['X-Probe','one','X-Probe','two']},400],[{headers:{'Content-Type':'text/plain'}},415],[{headers:{'Content-Encoding':'gzip'}},415]])assert.equal((await h.post('/founder/cost/list',{},options)).status,status);
  const duplicate=JSON.stringify(s).replace('"scope_version":'+s.scope_version,'"scope_version":'+s.scope_version+',"scope_version":'+s.scope_version);assert.equal((await h.request('/founder/cost/read',{body:duplicate})).status,400);assert.equal((await h.request('/founder/cost/list',{body:Buffer.from([123,34,120,34,58,34,255,34,125])})).status,400);assert.equal((await h.request('/founder/cost/list',{body:' '.repeat(17000)+'{}'})).status,413);
  for(const route of ['/founder/cost?private=x','/founder/cost%2fread'])assert.equal((await h.get(route)).status,400);
  for(const route of ['publish','assign','deliver','invoice','bill'])assert.equal((await h.post('/founder/cost/'+route,{})).status,404);assert.equal((await h.post('/founder/cost/list',{})).status,200);assert.deepEqual(await tableHashes(f.db),baseline);
 });

 test('cost UI: actual capture, unknown/zero estimates, immutable corrections, one investment and stable poll inputs',async t=>{
  const f=await costFixture(t),s=await readyCostRequest(f),h=await founderCostHost(f),b=await costBrowser(f,h);await b.choose(s);assert.match(b.text(),/Actual provider usage.*remain unknown/);assert.match(b.text(),/Cost per delivered game: unavailable/);assert(!b.text().includes('Invented cost integration question.'));
  const job=(await f.db.query('SELECT job_id FROM generation_slice_jobs WHERE request_id=$1',[s.request_id])).rows[0].job_id;b.input('cost-capture-job',job);const node=b.$('cost-capture-job');node.focus();node.setSelectionRange(2,7);await b.polls(2);assert.equal(b.$('cost-capture-job'),node);assert.equal(b.w.document.activeElement,node);assert.equal(node.selectionStart,2);assert.equal(node.selectionEnd,7);assert.equal(node.value,job);
  const before=await tableHashes(f.db);await b.click('cost-capture');await b.confirmed();assert.equal((await costRead(f,s)).entries.length,1);b.input('cost-usage-cash','0');await b.click('cost-usage');await b.confirmed();let v=await costRead(f,s);assert.equal(v.summary.direct.unknown_cash_n,0);assert.equal(v.summary.direct.known_estimated_micro_usd,0);
  b.input('cost-input-tokens','100');b.input('cost-output-tokens','20');b.tick('cost-toy-rate',true);await b.click('cost-usage');await b.confirmed();assert.equal((await costRead(f,s)).summary.direct.known_estimated_micro_usd,440);b.input('cost-output-tokens','30');await b.click('cost-usage');await b.confirmed();v=await costRead(f,s);assert.equal(v.summary.direct.known_estimated_micro_usd,510);assert.equal(v.entries.filter(e=>e.kind==='usage').length,4);
  await b.click('cost-open-comparison');await b.confirmed();b.select('cost-cash-line','C5');b.input('cost-scenario-cash','12000000');await b.click('cost-scenario-cash-save');await b.confirmed();b.select('cost-time-owner','I1');b.select('cost-time-stage','player_engineering');b.input('cost-minutes','20');await b.click('cost-time');await b.confirmed();v=await costRead(f,s);assert.equal(v.summary.investment.known_estimated_micro_usd,12000000);assert.equal(v.summary.investment.known_minutes,20);assert.equal(v.summary.direct.known_minutes,0);assert.equal(v.summary.direct.known_estimated_micro_usd,510);assert.equal(v.summary.scenario_total.known_estimated_micro_usd,12000000);assert.match(b.text(),/denominator 2/);assert.match(b.text(),/actual reuse share unavailable/);assert.deepEqual(await tableHashes(f.db),before);await b.stop();
 });


 test('cost UI: lost real reply and independent outage retain one original key until exact history confirms saving',async t=>{
  const f=await costFixture(t),s=await readyCostRequest(f),h=await founderCostHost(f),b=await costBrowser(f,h);await b.choose(s);b.input('cost-minutes','1');b.lose();await b.click('cost-time');await until(()=>b.$('cost-retry'),'original recovery after lost real reply');assert.equal(b.$('cost-view').childElementCount,0);const first=b.sent.find(x=>x.route==='/founder/cost/command').body;await b.click('cost-retry');await b.confirmed();const calls=b.sent.filter(x=>x.route==='/founder/cost/command');assert.equal(calls.length,2);assert.deepEqual(calls[0].body,calls[1].body);assert.equal((await f.db.query('SELECT * FROM cost_slice_commands')).rows.length,1);
  f.costOutage(true);b.input('cost-minutes','2');await b.click('cost-time');await until(()=>b.$('cost-status').textContent.includes('unacknowledged')&&b.$('cost-reconcile'),'journal pending recovery');assert.equal(b.$('cost-view').childElementCount,0);assert.equal((await f.db.query('SELECT * FROM cost_slice_entries')).rows.length,1);f.costOutage(false);await f.reopenCost();await b.click('cost-reconcile');await b.confirmed();assert.equal((await costRead(f,s)).summary.direct.known_minutes,2);assert.equal((await f.db.query('SELECT * FROM cost_slice_commands')).rows.length,2);assert.equal((await f.db.query('SELECT * FROM cost_slice_entries')).rows.length,2);assert.equal(first.command.expected_version,0);await b.stop();
 });
 test('cost UI: actual stale source409 resolves absent key, requires explicit dismissal and only then a fresh command',async t=>{
  const f=await costFixture(t),s=await readyCostRequest(f),h=await founderCostHost(f),b=await costBrowser(f,h);await b.choose(s);const g=await draftRead(f,s);b.beforeCommand(async()=>{await f.generation.command(f.founderToken,draftCommand(s,'EditRevision',g.job,{revision_id:g.job.current_revision_id,field:'opening',value:'Invented source edit ahead of the real cost HTTP command.'}));});b.input('cost-minutes','1');await b.click('cost-time');await until(()=>b.$('cost-status').textContent.includes('conflict')&&b.$('cost-reconcile'),'retained stale operation');const old=b.sent.find(x=>x.route==='/founder/cost/command').body;assert.equal((await f.db.query('SELECT * FROM cost_slice_commands')).rows.length,0);await b.click('cost-reconcile');await until(()=>b.$('cost-dismiss'),'explicit absent dismissal');assert.equal((await f.db.query('SELECT resolution FROM cost_slice_absences')).rows[0].resolution,'absent');await b.click('cost-dismiss');await until(()=>b.$('cost-minutes')&&!b.$('cost-time').disabled,'fresh controls after explicit dismissal');b.input('cost-minutes','1');await b.click('cost-time');await b.confirmed();const latest=b.sent.filter(x=>x.route==='/founder/cost/command').at(-1).body;assert.notEqual(latest.command.command_id,old.command.command_id);assert.equal((await costRead(f,s)).summary.direct.known_minutes,1);await b.stop();
 });
 test('cost UI: stale pending Retry409 then reconcile exposes durable fenced dismissal without a false Saved',async t=>{
  const f=await costFixture(t),s=await readyCostRequest(f),h=await founderCostHost(f),b=await costBrowser(f,h);await b.choose(s);f.costOutage(true);b.input('cost-minutes','1');await b.click('cost-time');await until(()=>b.$('cost-status').textContent.includes('unacknowledged')&&b.$('cost-retry'),'pending original');f.costOutage(false);const g=await draftRead(f,s);await f.generation.command(f.founderToken,draftCommand(s,'EditRevision',g.job,{revision_id:g.job.current_revision_id,field:'opening',value:'Invented source edit while original cost was pending.'}));await b.click('cost-retry');await until(()=>b.$('cost-status').textContent.includes('conflict')&&b.$('cost-reconcile'),'original retry409');await b.click('cost-reconcile');await until(()=>b.$('cost-dismiss'),'durable fenced result');assert.equal((await f.db.query('SELECT resolution FROM cost_slice_absences')).rows[0].resolution,'fenced');assert.equal((await f.db.query('SELECT * FROM cost_slice_acknowledgements')).rows.length,0);assert(!b.$('cost-status').textContent.startsWith('Saved:'));await b.click('cost-dismiss');await until(()=>b.$('cost-minutes')&&!b.$('cost-time').disabled,'new explicit operation allowed');b.input('cost-minutes','2');await b.click('cost-time');await b.confirmed();assert.equal((await costRead(f,s)).summary.direct.known_minutes,2);assert.equal((await f.db.query('SELECT * FROM cost_slice_acknowledgements')).rows.length,1);await b.stop();
 });
 test('cost HTTP/UI: held actual private response after real withdrawal cannot restore IDs or totals',async t=>{
  const f=await costFixture(t),s=await readyCostRequest(f);await applyCost(f,s,'RecordStageTime',stagePayload());const h=await founderCostHost(f),b=await costBrowser(f,h);await b.choose(s);h.hold();await b.click('cost-check');await until(()=>h.held(),'held actual cost read');const actual=JSON.parse(h.held().text);assert.equal(actual.status,'cost_view');assert.equal(actual.scope.request_id,s.request_id);assert.equal(actual.summary.direct.known_minutes,2);await f.consent.withdraw(f.adult.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1'});const after=await tableHashes(f.db);h.release();await until(()=>b.$('cost-view').childElementCount===0&&b.$('cost-request').options.length===1,'private projection cleared');assert(!b.text().includes(s.request_id));assert(!b.text().includes('Intent cursor:'));assert.deepEqual(await tableHashes(f.db),after);await b.stop();
 });
 test('cost UI: selection change and pagehide invalidate held earlier responses and clean owned requests/timers',async t=>{
  const f=await costFixture(t),a=await readyCostRequest(f),c=await readyCostRequest(f,'Invented other request for held selection.');await applyCost(f,a,'RecordStageTime',stagePayload('direct','intake',1));await applyCost(f,c,'RecordStageTime',stagePayload('direct','intake',8));const h=await founderCostHost(f),b=await costBrowser(f,h);await b.choose(a);h.hold();await b.click('cost-check');await until(()=>h.held(),'held earlier selection');await b.choose(c);h.release();await delay(100);assert(b.$('cost-view').textContent.includes(c.request_id));assert(!b.$('cost-view').textContent.includes(a.request_id));b.input('cost-minutes','77');Object.defineProperty(b.w.document,'visibilityState',{value:'hidden',configurable:true});b.w.document.dispatchEvent(new b.w.Event('visibilitychange'));assert.equal(b.$('cost-view').childElementCount,0);assert.equal(b.$('cost-recovery').childElementCount,0);assert.equal(b.$('cost-request').options.length,1);await b.stop();
 });
 test('cost UI: actual founder demotion, disable and expiry clear private DOM',async t=>{
  for(const kind of ['role','enabled','expiry'])await t.test(kind,async sub=>{const f=await costFixture(sub),s=await readyCostRequest(f),h=await founderCostHost(f),b=await costBrowser(f,h);await b.choose(s);if(kind==='role')await f.db.query("UPDATE founder_identities SET role='family'");else if(kind==='enabled')await f.db.query('UPDATE founder_identities SET enabled=false');else await f.db.query('UPDATE founder_sessions SET expires_at=$1',[new Date(f.clock()-1).toISOString()]);const after=await tableHashes(f.db);await b.click('cost-check');await until(()=>b.$('cost-view').childElementCount===0&&b.$('cost-status').textContent.includes('hidden'),'current founder denial clears view');assert(!b.text().includes(s.request_id));assert.deepEqual(await tableHashes(f.db),after);await b.stop();});
 });


 test('cost client: actual wire positive control is frozen; forged summaries, identities, duplicate keys and invalid bytes are rejected',async t=>{
  const f=await costFixture(t),s=await readyCostRequest(f);await applyCost(f,s,'OpenComparison',{fixture_id:'comparison-v1'});const h=await founderCostHost(f),client=createCostClient(hostCostFetcher(h)),actual=await client.read(s);assert(Object.isFrozen(actual));assert(Object.isFrozen(actual.source.pin));assert(Object.isFrozen(actual.summary.allocation.shares));
  const forged=[];for(const mutate of [v=>v.question='Invented forbidden content',v=>v.scope.request_id=randomUUID(),v=>v.summary.direct.known_estimated_micro_usd++,v=>v.summary.allocation.shares[0].cash_micro_usd++,v=>v.summary.delivered_unique_game_n=1,v=>v.source.classification='settled',v=>v.summary.direct.known_minutes=1.5]){const v=structuredClone(actual);mutate(v);forged.push(JSON.stringify(v));}
  const raw=JSON.stringify(actual);forged.push(raw.replace('"status":"cost_view"','"status":"cost_view","status":"cost_view"'));forged.push(Buffer.from([123,34,120,34,58,34,255,34,125]));
  for(const body of forged){const fake=createCostClient(async()=>new Response(body,{status:200,headers:{'Content-Type':'application/json'}}));await assert.rejects(()=>fake.read(s),e=>e.status===502);}
  const mismatched=createCostClient(async()=>new Response(raw,{status:202,headers:{'Content-Type':'application/json'}}));await assert.rejects(()=>mismatched.read(s),e=>e.status===502);
  const cmd=costCommand(s,actual,'RecordStageTime',stagePayload()),wrong=createCostClient(async()=>new Response(JSON.stringify({status:'acknowledged',synthetic_only:true,command_id:randomUUID(),version:cmd.command.expected_version+1}),{status:200,headers:{'Content-Type':'application/json'}}));await assert.rejects(()=>wrong.command(cmd),e=>e.status===502);
  let calls=0,getters=0;const outgoing=createCostClient(async()=>{calls++;throw Error('Invalid input reached fetch');}),bad={...cmd};Object.defineProperty(bad,'command',{enumerable:true,get(){getters++;return cmd.command;}});await assert.rejects(()=>outgoing.command(bad),e=>e.status===400);assert.equal(getters,0);assert.equal(calls,0);
  const huge=createCostClient(async()=>new Response('{}',{status:200,headers:{'Content-Type':'application/json','Content-Length':'1048577'}}));await assert.rejects(()=>huge.read(s),e=>e.status===502);assert.equal((await client.read(s)).version,actual.version);
 });


 test('cost client: a real later source cancellation does not rewrite or invalidate its historical capture',async t=>{
  const f=await costFixture(t),s=await readyCostRequest(f);let v=await costRead(f,s);const g=await draftRead(f,s);await applyCost(f,s,'CaptureAttempt',{job_id:g.job.job_id,attempt_id:v.source.capturable_attempt_ids[0]});const old=(await costRead(f,s)).attempts[0];assert.equal(old.state,'draft_ready');const h=await founderCostHost(f),client=createCostClient(hostCostFetcher(h));assert.equal((await client.read(s)).summary.attempt_coverage.cancelled_n,0);await f.generation.command(f.founderToken,draftCommand(s,'CancelJob',g.job,{reason:'Invented cancellation after immutable capture.'}));const after=await tableHashes(f.db);v=await client.read(s);assert.equal(v.summary.attempt_coverage.cancelled_n,1);assert.equal(v.attempts[0].state,'draft_ready');assert.deepEqual(v.attempts[0],old);assert.equal(v.summary.direct.unknown_cash_n,1);assert.deepEqual(await tableHashes(f.db),after);
 });

 test('cost UI: starting a new in-flight operation clears the previous Saved confirmation before transport',async t=>{
  const f=await costFixture(t),s=await readyCostRequest(f),h=await founderCostHost(f),b=await costBrowser(f,h);await b.choose(s);b.input('cost-minutes','1');await b.click('cost-time');await b.confirmed();let signal,release;const held=new Promise(r=>signal=r),gate=new Promise(r=>release=r);b.beforeCommand(async()=>{signal();await gate;});b.input('cost-minutes','2');await b.click('cost-time');await held;try{assert(!b.$('cost-status').textContent.startsWith('Saved:'),'Prior Saved text must not describe the new unconfirmed operation');assert.match(b.$('cost-status').textContent,/confirm|acknowledg|saving|Saving/i);assert.equal(b.$('cost-view').childElementCount,0);}finally{release();}await b.confirmed();assert.equal((await costRead(f,s)).summary.direct.known_minutes,2);await b.stop();
 });

}
