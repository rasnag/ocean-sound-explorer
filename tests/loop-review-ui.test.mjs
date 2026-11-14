// REVIEW-LOCAL-01: authored integration journeys; execution belongs to controller.
// Architecture 1.2 SHA256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {access} from 'node:fs/promises';
import {reviewFixture,readyReviewRequest,reviewRead,reviewCommand,ALL_CHECKS} from './loop-review-service.test.mjs';
import {bookAccepted,startDraft,waitDraft,draftCommand} from './loop-generation-service.test.mjs';
import {createSyntheticAuthServer} from '../server/loop-auth.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label='condition',timeout=9000){
 const deadline=Date.now()+timeout;
 do{if(await check())return;await delay(20);}while(Date.now()<deadline);
 assert.fail('Timed out waiting for '+(typeof label==='function'?label():label));
}
const json=r=>JSON.parse(r.text);
const checks=Object.keys(ALL_CHECKS);

// Transport only: every production method forwards to the actual fixture.
// Forwarding is necessary because reopenReview replaces the service instance.
async function founderHost(f){
 const options=f.generationOptions();
 const review=Object.freeze(Object.fromEntries(['list','read','command','reconcile'].map(name=>[name,(...args)=>f.review[name](...args)])));
 const generation=Object.freeze(Object.fromEntries(['list','read','command','reconcile'].map(name=>[name,(...args)=>f.generation[name](...args)])));
 const server=createSyntheticAuthServer({env:options.env,auth:options.auth,queue:options.queue,generation,review});
 const active=new Set();let cookie='',armed=false,held=null,closed=false;
 // Hold the actual HTTP response after the real host/service has produced it.
 // No auth, queue, generation or review method is replaced to manufacture data.
 server.prependListener('request',(req,res)=>{
  if(!armed||req.url!=='/founder/review/read')return;
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

async function browser(f,h){
 const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
 const page=await h.get('/founder/review');assert.equal(page.status,200);assert.match(page.headers['cache-control'],/no-store/);
 const dom=new JSDOM(page.text,{url:h.origin+'/founder/review',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.AbortController=globalThis.AbortController;w.TextEncoder=globalThis.TextEncoder;
 Object.defineProperty(w.crypto,'randomUUID',{value:randomUUID,configurable:true});
 const sent=[],flights=new Set(),intervals=new Set(),errors=[];let lose=false,stopped=false;
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
   const response=await h.request(route,{method:options.method,body:options.body,headers:options.headers,signal:options.signal});
   entry.status=response.status;entry.completed=true;
   if(String(route)==='/founder/review/command'&&lose){lose=false;throw Error('Invented lost actual HTTP command response');}
   // Real browser response.json creates objects in that browser's realm.
   return {ok:response.status>=200&&response.status<300,status:response.status,headers:{get:name=>response.headers[name.toLowerCase()]??null},json:async()=>w.JSON.parse(response.text)};
  })();
  flights.add(flight);flight.then(()=>flights.delete(flight),()=>flights.delete(flight));return flight;
 };
 const $=id=>w.document.getElementById(id),text=()=>w.document.body.textContent;
 async function stop(){
  if(stopped)return;
  w.dispatchEvent(new w.Event('pagehide'));w.dispatchEvent(new w.Event('unload'));stopped=true;
  h.release();await until(()=>flights.size===0,'browser requests stopped');
  assert.equal(intervals.size,0,'pagehide must clear authority polling');
  assert.equal($('review-view').childElementCount,0);assert.equal($('review-recovery').childElementCount,0);
  const count=sent.length;w.dispatchEvent(new w.Event('focus'));assert.equal(sent.length,count);
  assert.deepEqual(errors,[]);w.close();
 }
 f.cleanup(stop);
 const source=await h.get('/founder/review.js');assert.equal(source.status,200);w.eval(source.text);
 async function choose(s){
  await until(()=>[...$('review-request').options].some(o=>o.value&&JSON.parse(o.value)[1]===s.request_id),'accepted request option');
  $('review-request').value=[...$('review-request').options].find(o=>o.value&&JSON.parse(o.value)[1]===s.request_id).value;
  $('review-request').dispatchEvent(new w.Event('change',{bubbles:true}));
  await until(()=>$('review-notes')&&!$('review-record').disabled,'authorized private review');
 }
 function input(id,value){const e=$(id);assert(e,id);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));}
 function select(id,value){const e=$(id);assert(e,id);e.value=value;e.dispatchEvent(new w.Event('change',{bubbles:true}));}
 function tick(name,value){const e=$('review-'+name);assert(e,name);e.checked=value;e.dispatchEvent(new w.Event('change',{bubbles:true}));}
 async function click(id){await until(()=>$(id)&&!$(id).disabled,'enabled '+id);$(id).click();}
 async function confirmed(){await until(()=>$('review-notes')&&$('review-status').textContent.startsWith('Original TEST command independently acknowledged'),'independent ACK and authorized reread');}
 async function record(note='Invented browser checklist only.',values=ALL_CHECKS){for(const k of checks)tick(k,values[k]);input('review-notes',note);await click('review-record');await confirmed();}
 async function polls(n=3){const before=sent.filter(x=>x.route==='/founder/review/list'&&x.completed).length;await until(()=>sent.filter(x=>x.route==='/founder/review/list'&&x.completed).length>=before+n,'multiple completed authority polls');}
 return {w,$,text,sent,choose,input,select,tick,click,confirmed,record,polls,stop,lose(){lose=true;}};
}

// Canonical full rows, not counts: review operations must leave all other
// public tables unchanged. Deliberate generation/profile/auth changes receive
// their own explicit baseline outside the guarded review interval.
function canonical(v){
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
async function protectedRows(f){
 const names=(await f.db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename).filter(n=>!n.startsWith('review_slice_'));
 const result={};
 for(const name of names){const rows=(await f.db.query('SELECT * FROM "'+name.replaceAll('"','""')+'"')).rows.map(canonical).sort();result[name]=createHash('sha256').update(canonical(rows)).digest('hex');}
 return result;
}
async function count(f,name){assert(/^review_slice_[a-z_]+$/.test(name));return (await f.db.query('SELECT * FROM '+name)).rows.length;}
async function currentUI(b,f,s){
 const v=await reviewRead(f,s);
 await until(()=>b.$('review-notes')&&b.text().includes(v.revision?.revision_id??'No valid current draft'),()=> 'current source rendered '+v.revision?.revision_id+'; status='+b.$('review-status').textContent+'; error='+b.$('review-error').textContent+'; tail='+b.text().slice(-1200));
 return v;
}

// The inherited founder host deliberately has generation but no review service.
test('review HTTP: optional routes, actual founder-issued cookie, own Host and strict transport',async t=>{
 const f=await reviewFixture(t),s=await readyReviewRequest(f),h=await founderHost(f);
 const absent=await f.fetcher('/founder/review');assert.equal(absent.status,404);await absent.text();
 const defaultHome=await fetch(new URL('/founder',f.origins[1]),{headers:{Cookie:'loop_session='+f.founderToken,Connection:'close'}});assert.equal(defaultHome.status,200);assert(!(await defaultHome.text()).includes('href="/founder/review"'));
 const home=await h.get('/founder');assert.equal(home.status,200);assert(home.text.includes('href="/founder/review"'));
 const baseline=await protectedRows(f);
 for(const route of ['/founder/review','/founder/review.js','/founder/review.css']){
  const yes=await h.get(route);assert.equal(yes.status,200);assert.match(yes.headers['cache-control'],/no-store/);assert.match(yes.headers['content-security-policy'],/default-src 'none'/);
  const no=await h.get(route,{authenticated:false});assert.equal(no.status,401);assert.match(no.headers['cache-control'],/no-store/);
 }
 const read=await h.post('/founder/review/read',s);assert.equal(read.status,200);assert.equal(json(read).request.receipt.request_id,s.request_id);
 const cases=[
  [{authenticated:false},401],
  [{headers:{Host:'localhost:'+h.server.address().port}},403],
  [{headers:{Origin:'https://outside.invalid'}},403],
  [{headers:{'X-Household-Id':s.household_id}},403],
  [{headers:{Authorization:'Bearer invented'}},403],
  [{headers:{'Sec-Fetch-Site':'cross-site'}},403],
  [{extraHeaders:['Origin',h.origin]},403],
  [{extraHeaders:['X-Probe','one','X-Probe','two']},400],
  [{headers:{'Content-Type':'text/plain'}},415],
  [{headers:{'Content-Encoding':'gzip'}},415]
 ];
 for(const [options,status] of cases){const r=await h.post('/founder/review/list',{},options);assert.equal(r.status,status,JSON.stringify(options));assert.match(r.headers['cache-control'],/no-store/);}
 const duplicate=await h.request('/founder/review/read',{body:JSON.stringify(s).replace('"scope_version":'+s.scope_version,'"scope_version":'+s.scope_version+',"scope_version":'+s.scope_version)});assert.equal(duplicate.status,400);
 assert.equal((await h.request('/founder/review/list',{body:' '.repeat(17000)+'{}'})).status,413);
 assert.equal((await h.get('/founder/review?private=x')).status,400);
 for(const route of ['publish','assign','deliver'])assert.equal((await h.post('/founder/review/'+route,{})).status,404);
 const v=json(read),bad=reviewCommand(s,v,'PublishRevision',{});assert.equal((await h.post('/founder/review/command',bad)).status,400);
 assert.equal((await h.post('/founder/review/list',{})).status,200,'strict failures must not break the positive control');
 assert.equal(await count(f,'review_slice_commands'),0);assert.deepEqual(await protectedRows(f),baseline);
});

test('review UI: false keys block; malicious evidence fails; all true releases once with pinned revision and unchanged external rows',async t=>{
 const f=await reviewFixture(t),words='  Invented exact browser review question?\nOriginal  ',s=await readyReviewRequest(f,words),h=await founderHost(f),b=await browser(f,h);
 await b.choose(s);const baseline=await protectedRows(f),initial=await reviewRead(f,s);
 assert(b.text().includes(words));assert(b.text().includes('SYNTHETIC TEST ONLY'));assert(b.text().includes(initial.revision.output_digest));
 assert.equal(b.$('review-release').disabled,true);assert.equal(b.w.document.querySelectorAll('#review-view input[type=checkbox]').length,7);
 assert(b.w.document.querySelector('a[href="/founder/generation"]'));
 assert(![...b.w.document.querySelectorAll('button')].some(e=>/^(Publish|Assign|Deliver)(\s|$)/.test(e.textContent)));
 await b.record('Invented partially false browser review.',{...ALL_CHECKS,facts:false,playtest:false});
 let v=await reviewRead(f,s);assert.deepEqual(v.readiness,{eligible:false,missing:['facts','playtest']});assert(b.text().includes('Missing keys: facts, playtest'));assert(b.$('review-release').disabled);
 const blocked=await h.post('/founder/review/command',reviewCommand(s,v,'ReleaseTestSnapshot',{predecessor_snapshot_id:null}));assert.equal(blocked.status,409);assert.equal(await count(f,'review_slice_snapshots'),0);
 for(const payload of [{synthetic:true,checks:{facts:true},notes:'Invented incomplete evidence.'},{synthetic:true,checks:{...ALL_CHECKS},notes:'<script>publish()</script>'},{synthetic:true,checks:{...ALL_CHECKS},notes:'https://outside.invalid/private'},{synthetic:true,checks:{...ALL_CHECKS,facts:'yes'},notes:'Invented wrong boolean.'}]){
  assert.equal((await h.post('/founder/review/command',reviewCommand(s,v,'RecordTestReview',payload))).status,400);
 }
 assert.equal(await count(f,'review_slice_reviews'),1);
 await b.record();v=await reviewRead(f,s);assert(v.readiness.eligible);assert.equal(b.$('review-release').disabled,false);
 await b.click('review-release');await b.confirmed();v=await reviewRead(f,s);assert.equal(v.snapshots.length,1);
 const snapshot=v.snapshots[0];assert.equal(snapshot.revision_id,initial.revision.revision_id);assert.equal(snapshot.output_digest,initial.revision.output_digest);assert.deepEqual(snapshot.adventure,initial.revision.adventure);assert.equal(snapshot.adventure.status,'draft');
 const release=b.sent.find(x=>x.body.command?.action==='ReleaseTestSnapshot').body;
 assert.equal((await h.post('/founder/review/command',release)).status,200,'original-key replay');
 assert.equal((await h.post('/founder/review/command',reviewCommand(s,v,'ReleaseTestSnapshot',{predecessor_snapshot_id:null}))).status,409,'distinct-key duplicate');
 assert.equal(await count(f,'review_slice_snapshots'),1);assert(b.$('review-release').disabled);assert.deepEqual((await reviewRead(f,s)).request.receipt,initial.request.receipt);
 assert.deepEqual(await protectedRows(f),baseline);
});

test('review UI: actual edits and regeneration clear eligibility; correction and withdrawal append immutable lineage',async t=>{
 const f=await reviewFixture(t),s=await readyReviewRequest(f),h=await founderHost(f),b=await browser(f,h);await b.choose(s);await b.record();await b.click('review-release');await b.confirmed();
 let v=await reviewRead(f,s);const old=structuredClone(v.snapshots[0]),receipt=structuredClone(v.request.receipt),oldRows=(await f.db.query('SELECT * FROM review_slice_snapshots')).rows;
 const stale=reviewCommand(s,v,'RecordTestReview',{synthetic:true,checks:{...ALL_CHECKS},notes:'Invented stale source review.'});
 let g=await f.generation.read(f.founderToken,{...s,job_id:null});
 await f.generation.command(f.founderToken,draftCommand(s,'EditRevision',g.job,{revision_id:g.job.current_revision_id,field:'opening',value:'Invented actual edited successor opening.'}));
 v=await currentUI(b,f,s);assert.equal(v.review,null);assert.equal(v.readiness.eligible,false);for(const k of checks)assert.equal(b.$('review-'+k).checked,false);assert.equal(b.$('review-notes').value,'');assert(b.$('review-release').disabled);
 assert.equal((await h.post('/founder/review/command',stale)).status,409);
 const wrongDigest=reviewCommand(s,v,'RecordTestReview',{synthetic:true,checks:{...ALL_CHECKS},notes:'Invented changed digest.'});wrongDigest.command.output_digest='f'.repeat(64)===v.revision.output_digest?'e'.repeat(64):'f'.repeat(64);
 assert.equal((await h.post('/founder/review/command',wrongDigest)).status,409);
 let baseline=await protectedRows(f);await b.record('Invented fresh correction review.');b.select('review-predecessor',old.snapshot_id);await b.click('review-release');await b.confirmed();v=await reviewRead(f,s);
 assert.equal(v.snapshots.length,2);assert.equal(v.snapshots[1].predecessor_snapshot_id,old.snapshot_id);assert.deepEqual(v.snapshots[0].adventure,old.adventure);assert.equal(v.snapshots[0].is_current_revision,false);
 b.select('review-withdraw-target',old.snapshot_id);b.input('review-withdraw-reason','Invented separate historical withdrawal.');await b.click('review-withdraw');await b.confirmed();v=await reviewRead(f,s);
 assert.equal(v.snapshots[0].withdrawn,true);assert.deepEqual(v.snapshots[0].adventure,old.adventure);assert.equal(v.snapshots[1].withdrawn,false);assert(b.text().includes('Withdrawn TEST snapshot'));
 assert.deepEqual((await f.db.query('SELECT * FROM review_slice_snapshots WHERE snapshot_id=$1',[old.snapshot_id])).rows,oldRows);assert.equal(await count(f,'review_slice_withdrawals'),1);assert.deepEqual(await protectedRows(f),baseline);
 g=await f.generation.read(f.founderToken,{...s,job_id:null});
 await f.generation.command(f.founderToken,draftCommand(s,'Regenerate',g.job,{revision_id:g.job.current_revision_id,field:'help',mock_case:'valid'}));
 g=await f.generation.read(f.founderToken,{...s,job_id:null});await f.generation.command(f.founderToken,draftCommand(s,'StartMock',g.job,{}));await waitDraft(f,s);
 v=await currentUI(b,f,s);assert.equal(v.review,null);assert.equal(v.readiness.eligible,false);assert.equal(v.snapshots.filter(x=>x.is_current_revision).length,0);assert(b.$('review-release').disabled);for(const k of checks)assert.equal(b.$('review-'+k).checked,false);
 baseline=await protectedRows(f);await b.record('Invented fresh review after actual regeneration.');b.select('review-predecessor',v.snapshots[1].snapshot_id);await b.click('review-release');await b.confirmed();v=await reviewRead(f,s);
 assert.equal(v.snapshots.length,3);assert.equal(v.snapshots[2].predecessor_snapshot_id,v.snapshots[1].snapshot_id);assert.deepEqual(v.request.receipt,receipt);assert.deepEqual(v.snapshots[0].adventure,old.adventure);assert.deepEqual(await protectedRows(f),baseline);
});

test('review UI: unsent checklist, notes, correction and withdrawal choices survive multiple actual polls',async t=>{
 const f=await reviewFixture(t),s=await readyReviewRequest(f),h=await founderHost(f),b=await browser(f,h);await b.choose(s);await b.record();await b.click('review-release');await b.confirmed();const old=(await reviewRead(f,s)).snapshots[0];
 const g=await f.generation.read(f.founderToken,{...s,job_id:null});await f.generation.command(f.founderToken,draftCommand(s,'EditRevision',g.job,{revision_id:g.job.current_revision_id,field:'opening',value:'Invented unsent-control successor.'}));await currentUI(b,f,s);
 b.tick('facts',true);b.tick('help',true);b.input('review-notes','Invented unsent notes retained during polling.');b.select('review-predecessor',old.snapshot_id);b.select('review-withdraw-target',old.snapshot_id);b.input('review-withdraw-reason','Invented unsent reason.');
 const note=b.$('review-notes');note.focus();note.setSelectionRange(3,9);const before=await count(f,'review_slice_commands');await b.polls(3);
 assert.equal(b.$('review-notes'),note,'unchanged polls must preserve the actual control');assert.equal(note.value,'Invented unsent notes retained during polling.');assert.equal(b.w.document.activeElement,note);assert.equal(note.selectionStart,3);assert.equal(note.selectionEnd,9);
 for(const k of checks)assert.equal(b.$('review-'+k).checked,['facts','help'].includes(k));assert.equal(b.$('review-predecessor').value,old.snapshot_id);assert.equal(b.$('review-withdraw-target').value,old.snapshot_id);assert.equal(b.$('review-withdraw-reason').value,'Invented unsent reason.');assert.equal(await count(f,'review_slice_commands'),before);assert(b.$('review-release').disabled);
});

test('review UI: lost actual replies retain original identity through ACK uncertainty and independent-journal outage/reopen',async t=>{
 for(const outage of [false,true])await t.test(outage?'primary-only outage':'lost independently acknowledged reply',async sub=>{
  const f=await reviewFixture(sub),words='Invented private original recovery question.',s=await readyReviewRequest(f,words),h=await founderHost(f),b=await browser(f,h);await b.choose(s);const initial=await reviewRead(f,s);
  f.reviewOutage(outage);b.lose();for(const k of checks)b.tick(k,true);b.input('review-notes','Invented original recovery notes.');await b.click('review-record');
  await until(()=>b.$('review-error').textContent.includes('Outcome unknown'),'lost transport result');
  const original=b.sent.find(x=>x.route==='/founder/review/command').body;
  assert.equal(await count(f,'review_slice_commands'),1);assert.equal(await count(f,'review_slice_reviews'),1);assert.equal(await count(f,'review_slice_acknowledgements'),outage?0:1);
  await b.polls(3);assert.equal(b.$('review-view').childElementCount,0);assert(!b.text().includes(words));assert(!b.text().includes('Invented original recovery notes.'));assert(!b.$('review-status').textContent.includes('independently acknowledged and reread'));
  assert.equal(b.sent.filter(x=>x.route==='/founder/review/command').length,1,'polling cannot dispatch a replacement');assert(b.text().includes(original.command.command_id));
  if(outage){
   const pending=await h.post('/founder/review/read',s);assert.deepEqual(Object.keys(json(pending)).sort(),['pending','status','synthetic_only']);assert.equal(json(pending).status,'review_pending');assert.equal(json(pending).pending[0].command_id,original.command.command_id);
   const blocked=await h.post('/founder/review/command',reviewCommand(s,initial,'RecordTestReview',{synthetic:true,checks:{...ALL_CHECKS},notes:'Invented forbidden dependent command.'}));assert.equal(blocked.status,503);assert.equal(await count(f,'review_slice_commands'),1);
  }
  f.reviewOutage(false);await f.reopenReview();const baseline=await protectedRows(f);
  await b.click('review-reconcile');await b.confirmed();const reconciles=b.sent.filter(x=>x.route==='/founder/review/reconcile');assert.equal(reconciles.length,1);assert.equal(reconciles[0].body.command_id,original.command.command_id);
  assert.deepEqual(reconciles[0].body,{...s,command_id:original.command.command_id});assert.equal(b.sent.filter(x=>x.route==='/founder/review/command').length,1);
  const v=await reviewRead(f,s);assert.equal(v.review.notes,'Invented original recovery notes.');assert.equal(v.version,1);assert(v.readiness.eligible);assert.equal(await count(f,'review_slice_commands'),1);assert.equal(await count(f,'review_slice_reviews'),1);assert.equal(await count(f,'review_slice_acknowledgements'),1);assert.equal(await count(f,'review_slice_snapshots'),0);assert.deepEqual(await protectedRows(f),baseline);
 });
});

test('review HTTP/UI: actual consent withdrawal inside independent append prevents ACK and private projection',async t=>{
 const f=await reviewFixture(t),words='Invented append-time private question.',s=await readyReviewRequest(f,words),h=await founderHost(f),b=await browser(f,h);await b.choose(s);assert(b.text().includes(words));
 let entered=false;f.beforeReviewAppend(async()=>{entered=true;await f.consent.withdraw(f.adult.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1'});});
 for(const k of checks)b.tick(k,true);b.input('review-notes','Invented never-acknowledged append review.');await b.click('review-record');
 await until(()=>entered&&b.$('review-request').options.length===1&&!b.text().includes(words)&&!b.$('review-notes'),'append-time authority fence');
 const command=b.sent.find(x=>x.route==='/founder/review/command');assert.equal(command.status,403);assert.equal(await count(f,'review_slice_acknowledgements'),0);assert.equal(await count(f,'review_slice_snapshots'),0);
 assert.equal((await h.post('/founder/review/read',s)).status,403);assert.equal((await h.post('/founder/review/reconcile',{...s,command_id:command.body.command.command_id})).status,403);assert.equal(b.$('review-view').childElementCount,0);
});

test('review HTTP/UI: actual held private HTTP response cannot restore text after real consent withdrawal',async t=>{
 const f=await reviewFixture(t),words='Invented held private question never restored.',s=await readyReviewRequest(f,words),other=await f.anotherFamily(),otherScope=await bookAccepted({...f,...other},'Invented surviving other household question.');await startDraft(f,otherScope);await waitDraft(f,otherScope);
 const h=await founderHost(f),b=await browser(f,h);await b.choose(s);assert(b.text().includes(words));
 h.hold();await b.click('review-check');await until(()=>h.held(),'real host response held');assert(h.held().text.includes(words));assert.equal(json({text:h.held().text}).status,'review_view');
 await f.consent.withdraw(f.adult.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1'});
 const additions=[];const observer=new b.w.MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)additions.push(n.textContent??'');});observer.observe(b.$('review-view'),{childList:true,subtree:true});
 h.release();await until(()=>!b.text().includes(words)&&!b.$('review-notes'),'fresh availability blocks held reveal');await b.polls(2);observer.disconnect();
 assert(!additions.some(value=>value.includes(words)),'old response must not insert private text again');assert.equal(b.$('review-view').childElementCount,0);assert.equal((await h.post('/founder/review/read',s)).status,403);
 const listed=json(await h.post('/founder/review/list',{}));assert(!listed.requests.some(x=>x.request_id===s.request_id));assert(listed.requests.some(x=>x.request_id===otherScope.request_id));await b.choose(otherScope);assert(b.text().includes('Invented surviving other household question.'));assert(!b.text().includes(words));
});

test('review HTTP/UI: household/request/scope boundaries and changed child profile have real positive controls',async t=>{
 const f=await reviewFixture(t),a=await readyReviewRequest(f,'Invented boundary household A.'),other=await f.anotherFamily(),bScope=await bookAccepted({...f,...other},'Invented boundary household B.');await startDraft(f,bScope);await waitDraft(f,bScope);
 const h=await founderHost(f),b=await browser(f,h);await b.choose(a);await b.record('Invented household A review.');await b.choose(bScope);assert(b.text().includes('Invented boundary household B.'));assert(!b.text().includes('Invented boundary household A.'));await b.record('Invented household B review.');
 assert.equal((await h.post('/founder/review/read',{...a,household_id:bScope.household_id})).status,403);assert.equal((await h.post('/founder/review/read',{...a,request_id:randomUUID()})).status,403);assert.equal((await h.post('/founder/review/read',{...a,scope_version:a.scope_version+1})).status,409);
 assert.equal(json(await h.post('/founder/review/read',a)).review.notes,'Invented household A review.');assert.equal(json(await h.post('/founder/review/read',bScope)).review.notes,'Invented household B review.');
 await b.choose(a);const state=await f.setup.status(f.adult.sessionToken);await f.setup.save(f.adult.sessionToken,{command_id:randomUUID(),setup_context:state.setup_context,operation:'correct',child_id:f.children[0].child_id,expected_profile_version:f.children[0].profile_version,profile:{nickname:'Invented profile edit',age:7,calibration:{reads:'independent',counts_to_20:true,challenge:'some'}}});
 await until(()=>b.text().includes('No valid current draft')&&!b.$('review-notes')?.value,'profile invalidation');const v=await reviewRead(f,a);assert.equal(v.revision,null);assert.equal(v.review,null);assert.equal(v.readiness.eligible,false);assert(b.$('review-release').disabled);
 await b.choose(bScope);assert.equal(b.$('review-notes').value,'Invented household B review.');assert.equal((await reviewRead(f,bScope)).readiness.eligible,true);
});

test('review HTTP/UI: actual founder demotion, disabling and expiry clear private DOM',async t=>{
 for(const kind of ['role','enabled','expiry'])await t.test(kind,async sub=>{
  const f=await reviewFixture(sub),words='Invented private founder authority question.',s=await readyReviewRequest(f,words),h=await founderHost(f),b=await browser(f,h);await b.choose(s);assert(b.text().includes(words));
  if(kind==='role')await f.db.query("UPDATE founder_identities SET role='family'");
  else if(kind==='enabled')await f.db.query('UPDATE founder_identities SET enabled=false');
  else await f.db.query('UPDATE founder_sessions SET expires_at=$1',[new Date(f.clock()-1).toISOString()]);
  await until(()=>b.$('review-request').options.length===1&&!b.text().includes(words)&&!b.$('review-notes'),'real founder denial');
  const deniedStatus=kind==='role'?403:401;assert.equal((await h.post('/founder/review/list',{})).status,deniedStatus);assert.equal((await h.post('/founder/review/read',s)).status,deniedStatus);assert.equal(await count(f,'review_slice_commands'),0);
 });
});

test('review UI: hidden/pagehide clear private controls, stop polling/requests; owned hosts and temporary directories are cleaned',async t=>{
 let reviewDirectory,generationDirectory;
 await t.test('owned disposable journey',async sub=>{
  const f=await reviewFixture(sub),s=await readyReviewRequest(f,'Invented lifecycle private question.'),h=await founderHost(f),b=await browser(f,h);reviewDirectory=f.reviewDirectory;generationDirectory=f.generationDir;await b.choose(s);
  Object.defineProperty(b.w.document,'visibilityState',{configurable:true,value:'hidden'});b.w.document.dispatchEvent(new b.w.Event('visibilitychange'));assert.equal(b.$('review-view').childElementCount,0);assert(!b.text().includes('Invented lifecycle private question.'));
  Object.defineProperty(b.w.document,'visibilityState',{configurable:true,value:'visible'});b.w.document.dispatchEvent(new b.w.Event('visibilitychange'));await until(()=>b.$('review-notes'),'fresh visible authorized reread');
  h.hold();await b.click('review-check');await until(()=>h.held(),'in-flight response before pagehide');await b.stop();await h.close();assert.equal(h.active.size,0);
 });
 // The child test's fixture after-hook has now run, including its path guards.
 await assert.rejects(()=>access(reviewDirectory),e=>e.code==='ENOENT');await assert.rejects(()=>access(generationDirectory),e=>e.code==='ENOENT');
});
