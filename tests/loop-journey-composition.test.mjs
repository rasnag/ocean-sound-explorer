// AUTHORED, NOT RUN BY THE AUTHOR. Actual empty composition/HTTP/PG/journals.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,readFile,writeFile,symlink} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {TOTP,Secret} from 'otpauth';
import {PGlite} from '@electric-sql/pglite';
import {createProtectedJourney,validateJourneyDirectory} from '../server/journey-composition.mjs';
import {createJourneyAssets,journeyAssetSeam} from '../server/journey-local.mjs';
import {createAssistedPlayer} from '../lib/loop/assisted-player.mjs';
import {assistedFixtureAdventure} from '../lib/loop/assisted-fixture.mjs';
const env={LOOP_ENV:'local-synthetic'};
const first=async(db,q,a=[])=>(await db.query(q,a)).rows[0];
export async function journeyHarness(t,serve){
 const directory=await mkdtemp(join(tmpdir(),'loop-empty-journey-'));let core,parentOrigin,founderOrigin,parentCookie='',founderCookie='';
 async function open(){core=await createProtectedJourney({env,directory,...(serve?{serve}:{})});assert.equal(core.parentServer.listening,false);assert.equal(core.founderServer.listening,false);await new Promise(r=>core.parentServer.listen(0,'127.0.0.1',r));await new Promise(r=>core.founderServer.listen(0,'127.0.0.1',r));parentOrigin='http://127.0.0.1:'+core.parentServer.address().port;founderOrigin='http://127.0.0.1:'+core.founderServer.address().port;}
 async function close(){await core?.close();core=null;}
 async function inspect(work){assert(!core,'Never open a second live primary connection');const db=new PGlite(join(directory,'primary'));await db.waitReady;try{return await work(db);}finally{await db.close();}}
 async function httpCall(path,body,role='parent',extra={}){
  const origin=role==='founder'?founderOrigin:parentOrigin,cookie=role==='founder'?founderCookie:parentCookie;
  const headers={Connection:'close',...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json'}),...extra};
  // null means actual omission, distinct from a present empty/malformed Cookie.
  for(const k of Object.keys(headers))if(headers[k]===null)delete headers[k];
  const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();let value;try{value=JSON.parse(text);}catch{value=text;}return {status:r.status,body:value,headers:r.headers};
 }
 async function post(path,body,role='parent'){const r=await httpCall(path,body,role);assert([200,202].includes(r.status),path+' status '+r.status+' '+JSON.stringify(r.body));return r.body;}
 async function signup(email='invented-empty-journey@example.invalid'){
  await post('/adult/request',{email,purpose:'join'});const inbox=(await core.getDemoState()).mockInbox,token=inbox.filter(x=>x.email===email).at(-1).token;
  const verified=await httpCall('/adult/verify',{token});assert.equal(verified.body.status,'verified');parentCookie=verified.headers.get('set-cookie').split(';')[0];
  await post('/adult/consent',{command_id:randomUUID(),policy_version:'TEST-v1',required_service:true,optional_contact:false,optional_story:false});const status=(await httpCall('/adult/setup')).body;
  const command={command_id:randomUUID(),setup_context:status.setup_context,operation:'create',initial:true,profile:{nickname:'Invented Journey',age:6,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}};
  const saved=await post('/adult/setup',command),index=(await httpCall('/adult/family')).body,selection={view_context:index.view_context,child_id:saved.child.child_id,profile_version:saved.child.profile_version};
  const trial=await post('/adult/journey/trial',{view_context:selection.view_context,child_id:selection.child_id});assert.equal(trial.allowance,8);assert.deepEqual(await post('/adult/setup',command),saved);assert.deepEqual(await post('/adult/journey/trial',{view_context:selection.view_context,child_id:selection.child_id}),trial);return {selection,trial,child:saved.child};
 }
 async function founderLogin(){const s=await core.getDemoState(),op=s.operator,totp=new TOTP({secret:Secret.fromBase32(op.totpSecret),algorithm:'SHA1',digits:6,period:30}).generate();const r=await httpCall('/login',{username:op.username,password:op.password,totp},'founder');assert.equal(r.status,200);founderCookie=r.headers.get('set-cookie').split(';')[0];}
 t.after(async()=>{await close();assert.equal(dirname(directory),resolve(tmpdir()));await rm(directory,{recursive:true,force:true});});await open();
 return {directory,open,close,inspect,post,http:httpCall,signup,founderLogin,get core(){return core;},get parentOrigin(){return parentOrigin;},get founderOrigin(){return founderOrigin;},get parentCookie(){return parentCookie;},get founderCookie(){return founderCookie;}};
}
export async function prepareJourney(h){
 const family=await h.signup(),selection=family.selection,words='  What makes this invented platform tip when I move the block?  ';
 const saved=await h.post('/adult/wonder/save',{...selection,command_id:randomUUID(),operation:'create',question:words,parent_context:null});assert.equal(saved.state,'acknowledged');
 const offer=await h.post('/adult/production/eligibility',{selection,wonder_id:saved.request_id,wonder_version:saved.source_scope_version});assert.equal(offer.status,'eligible');
 const submit={selection,command:{contract_version:'1.1.0',record_type:'submit',command:'SubmitProduction',idempotency_key:randomUUID(),child_id:selection.child_id,wonder_id:saved.request_id,wonder_version:saved.source_scope_version,consent_epoch:offer.consent_epoch,offer_version:offer.offer_version,scope_version:offer.scope_version}};
 let booked=await h.post('/adult/production/submit',submit);if(booked.status==='retryable_unacknowledged')booked=await h.post('/adult/production/reconcile',{selection,idempotency_key:submit.command.idempotency_key});assert.equal(booked.status,'acknowledged');
 await h.founderLogin();const queue=(await h.post('/founder/queue/read',{filter:'all'},'founder')).requests.find(r=>r.request_id===saved.request_id);assert(queue);
 await h.post('/founder/queue/command',{command_id:randomUUID(),household_id:queue.household_id,request_id:queue.request_id,expected_version:queue.aggregate_version,consent_epoch:queue.consent_epoch,action:'AcceptRequest',payload:{scope_version:queue.scope_version,agreement_version:queue.agreement_version}},'founder');
 const scope={household_id:queue.household_id,request_id:queue.request_id,scope_version:queue.scope_version},generation=(action,job,payload)=>({...scope,command:{command_id:randomUUID(),job_id:job?.job_id??null,expected_version:job?.version??0,action,payload}});
 await h.post('/founder/generation/command',generation('RequestGeneration',null,{mock_case:'valid'}),'founder');let g=await h.post('/founder/generation/read',{...scope,job_id:null},'founder');await h.post('/founder/generation/command',generation('StartMock',g.job,{}),'founder');
 for(let i=0;i<150;i++){g=await h.post('/founder/generation/read',{...scope,job_id:null},'founder');if(g.job?.state==='draft_ready')break;await new Promise(r=>setTimeout(r,20));}assert.equal(g.job.state,'draft_ready');
 let v=await h.post('/founder/review/read',scope,'founder');const review=(action,payload)=>({...scope,command:{command_id:randomUUID(),expected_version:v.version,revision_id:v.revision.revision_id,output_digest:v.revision.output_digest,action,payload}});
 await h.post('/founder/review/command',review('RecordTestReview',{synthetic:true,checks:{facts:true,age:true,safety:true,outcomes:true,help:true,difficulty:true,playtest:true},notes:'Invented deliberate TEST evidence. No actual scientific or human endorsement.'}),'founder');
 v=await h.post('/founder/review/read',scope,'founder');await h.post('/founder/review/command',review('ReleaseTestSnapshot',{predecessor_snapshot_id:null}),'founder');v=await h.post('/founder/review/read',scope,'founder');
 const snapshot=v.snapshots.find(s=>s.revision_id===v.revision.revision_id),readyRequest={...scope,snapshot_id:snapshot.snapshot_id,command_id:randomUUID()},ready=await h.post('/founder/journey/ready',readyRequest,'founder');assert.equal(ready.status,'acknowledged');assert.equal((await h.post('/founder/journey/ready',readyRequest,'founder')).assignment_id,ready.assignment_id);
 const binding={view_context:selection.view_context,child_id:selection.child_id,assignment_id:ready.assignment_id,revision_id:ready.revision_id};return {...family,words,saved,submit,booked,scope,snapshot,ready,binding,activity:{household_id:scope.household_id,request_id:scope.request_id,child_id:selection.child_id,assignment_id:ready.assignment_id,revision_id:ready.revision_id}};
}
export async function startAndTest(h,x){
 const startRequest={...x.binding,command_id:randomUUID()},started=await h.post('/adult/journey/start',startRequest);assert.equal(started.status,'journey_started');const binding={...x.binding,play_id:started.play_id};let result=started.result;
 async function action(value,extra={}){const command={contract_version:'1.1.0',play_id:binding.play_id,action_id:randomUUID(),expected_sequence:result.checkpoint.state.sequence,consent_epoch:result.checkpoint.state.consent_epoch,revision_id:binding.revision_id,pattern_version:'fixture-1',action:value,...extra};const r=await h.http('/adult/journey/action',{...binding,command});if(r.status===200)result=r.body;return {r,command};}
 await action({kind:'predict',prediction:'tips'});await action({kind:'configure',configuration:'offset'});const s=result.checkpoint.state,tested=await action({kind:'test',prediction_action_id:s.prediction_action_id,configuration_action_id:s.configuration_action_id});assert.equal(result.checkpoint.state.trials.length,1);return {binding,startRequest,started,result,action,tested};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 test('actual empty composition: protected original journey, persistent same play and exact timeline',async t=>{
  const h=await journeyHarness(t);await h.close();await h.inspect(async db=>{for(const table of ['households','adult_accounts','service_consents','children','wonder_requests','assignments','play_sessions','entitlement_periods'])assert.equal(Number((await first(db,'SELECT count(*) n FROM '+table)).n),0);});await h.open();
  const x=await prepareJourney(h),before=await h.post('/founder/journey/activity',x.activity,'founder');assert.equal(before.state,'no_activity');const intro=await h.post('/adult/family/open',{...x.binding,entry_kind:'assignment'});assert.equal(intro.assignment.question,x.words);assert.equal(intro.state,'introduction');assert.equal((await h.http('/adult/journey/start')).status,404);
  const play=await startAndTest(h,x),open=await h.post('/adult/journey/open',play.binding);assert.deepEqual(open.result,play.result);assert.equal(open.history.length,1);assert.deepEqual(await h.post('/adult/journey/action',{...play.binding,command:play.tested.command}),play.result);assert.equal((await play.action({kind:'predict',prediction:'stable'},{client_at:'1900-01-01T00:00:00Z'})).r.status,400);
  const timeline=await h.post('/founder/journey/activity',x.activity,'founder');assert.equal(timeline.timestamp_provenance,'SERVER-ACCEPTED');assert.equal(timeline.watermark.action_sequence,3);assert.equal(timeline.watermark.event_sequence,4);assert.equal(timeline.help,'unavailable_for_this_toy_pattern');assert(timeline.incomplete);assert.deepEqual(timeline.events.map(e=>e.event_type),['prediction_recorded','configuration_committed','test_resolved','progress_saved']);
  const keyBytes=await readFile(join(h.directory,'keys.bin')),ownerBytes=await readFile(join(h.directory,'owner.json'));await h.close();
  await h.inspect(async db=>{const events=(await db.query('SELECT payload FROM play_events ORDER BY sequence')).rows.flatMap(r=>r.payload.events);assert.deepEqual(timeline.events,events);for(const table of ['journey_play_bindings','play_start_commands','entitlement_periods'])assert.equal(Number((await first(db,'SELECT count(*) n FROM '+table)).n),1);assert.equal((await first(db,'SELECT state FROM entitlement_claims')).state,'consumed');const receipt=await first(db,'SELECT * FROM production_receipts');assert.equal(new Date(receipt.original_received_at).toISOString().replace('.000Z','Z'),x.booked.receipt.original_received_at);assert.equal(new Date(receipt.original_due_at)-new Date(receipt.original_received_at),86400000);});
  await h.open();assert.deepEqual(await readFile(join(h.directory,'keys.bin')),keyBytes);assert.deepEqual(await readFile(join(h.directory,'owner.json')),ownerBytes);assert.deepEqual((await h.post('/adult/journey/open',play.binding)).result,play.result);assert.deepEqual(await h.post('/adult/journey/trial',{view_context:x.selection.view_context,child_id:x.selection.child_id}),x.trial);assert.equal((await h.post('/adult/journey/start',play.startRequest)).play_id,play.binding.play_id);assert.deepEqual((await h.post('/founder/journey/activity',x.activity,'founder')).events,timeline.events);
  await h.post('/adult/consent/withdraw',{command_id:randomUUID(),policy_version:'TEST-v1'});assert.equal((await h.http('/adult/journey/open',play.binding)).status,403);assert.equal((await h.http('/founder/journey/activity',x.activity,'founder')).status,403);
 });
 test('actual journey HTTP guards, navigation-only exception and separate cookie omission',async t=>{
  const h=await journeyHarness(t),x=await prepareJourney(h),p=await startAndTest(h,x);
  for(const path of ['/saved/open','/saved/action','/adult/journey/inbox'])assert.equal((await h.http(path,{play_id:p.binding.play_id})).status,404);
  const exact={...x.binding,command_id:randomUUID()};assert.equal((await h.http('/adult/journey/start',exact,'parent',{Cookie:null})).status,403);assert.equal((await h.http('/adult/journey/start',exact,'parent',{Cookie:''})).status,400);assert.equal((await h.http('/adult/journey/start',exact,'parent',{Cookie:'not-a-cookie'})).status,400);assert.equal((await h.http('/adult/journey/start',exact,'parent',{Cookie:h.founderCookie})).status,403);
  for(const patch of [{play_id:null},{household_id:x.scope.household_id},{revision_id:randomUUID()},{view_context:'0'.repeat(64)}])assert([400,403].includes((await h.http('/adult/journey/open',{...p.binding,...patch})).status));
  for(const [headers,status]of [[{Origin:h.founderOrigin},403],[{'X-Household':x.scope.household_id},403],[{'Content-Encoding':'gzip'},415]])assert.equal((await h.http('/adult/journey/open',p.binding,'parent',headers)).status,status);
  assert([401,403].includes((await h.http('/founder/journey/activity',x.activity,'founder',{Cookie:h.parentCookie})).status));
  const navigation={'Sec-Fetch-Site':'same-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
  for(const path of ['/founder/queue','/founder/generation','/founder/review','/founder/cost','/founder/continuation','/founder/journey']){
   assert.equal((await h.http(path,undefined,'founder',navigation)).status,200);
   assert([401,403].includes((await h.http(path,undefined,'founder',{...navigation,Cookie:null})).status));
   assert.equal((await h.http(path,undefined,'founder',{...navigation,'X-Role':'founder'})).status,403);
   assert.equal((await h.http(path+'?probe=1',undefined,'founder',navigation)).status,400);
   assert.equal((await h.http(path,undefined,'founder',{...navigation,'Sec-Fetch-Dest':'iframe'})).status,403);
  }
  for(const path of ['/founder/journey.js','/founder/journey.css','/founder/queue.js','/founder/generation.css','/founder/review.js'])assert.equal((await h.http(path,undefined,'founder',navigation)).status,403);
  assert.equal((await h.http('/founder/journey/activity',x.activity,'founder',navigation)).status,403);assert.equal((await h.http('/founder/journey/activity',undefined,'founder',navigation)).status,403);
  for(const path of ['/founder/journey','/founder/journey.js','/founder/journey.css']){assert.equal((await h.http(path,undefined,'founder')).status,200);assert([401,403].includes((await h.http(path,undefined,'founder',{Cookie:null})).status));}
  async function raw(path,body,headers,method='POST'){return new Promise((done,reject)=>{const u=new URL(h.founderOrigin),r=http.request({host:u.hostname,port:u.port,path,method,headers:['Host',u.host,...(method==='POST'?['Origin',h.founderOrigin]:[]),'Cookie',h.founderCookie,'Content-Type','application/json',...headers]},res=>{res.resume();res.on('end',()=>done(res.statusCode));});r.on('error',reject);r.end(body);});}
  assert.equal(await raw('/founder/journey/activity',JSON.stringify(x.activity),['X-Probe','one','X-Probe','two']),400);assert.equal(await raw('/founder/journey/activity','{"household_id":"x","household_id":"y"}',[]),400);
  const navHeaders=Object.entries(navigation).flat();assert.equal(await raw('/founder/queue','{}',[...navHeaders,'Content-Length','2'],'GET'),400);assert.equal(await raw('/founder/queue',undefined,[...navHeaders,'X-Probe','one','X-Probe','two'],'GET'),400);
  const opened=await h.http('/adult/journey/open',p.binding);assert.equal(opened.headers.get('cache-control'),'no-store');assert.equal(opened.headers.get('referrer-policy'),'no-referrer');
 });
 test('store refuses unmanaged, ancestor, symlink and partial-key directories without reset',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'loop-store-negative-'));t.after(()=>rm(dir,{recursive:true,force:true}));await writeFile(join(dir,'keep.txt'),'preserve');await assert.rejects(()=>createProtectedJourney({env,directory:dir}));assert.equal(await readFile(join(dir,'keep.txt'),'utf8'),'preserve');
  const root=resolve(fileURLToPath(new URL('../',import.meta.url)));for(const target of [root,dirname(root),join(root,'private-store')])await assert.rejects(()=>validateJourneyDirectory(target));const link=join(dir,'dangling');try{await symlink(join(dir,'absent'),link,'junction');await assert.rejects(()=>validateJourneyDirectory(join(link,'store')));}catch(e){if(!['EPERM','EACCES','ENOTSUP'].includes(e.code))throw e;t.diagnostic('Symlink creation unavailable; no synthetic pass for that OS facility.');}
  const h=await journeyHarness(t);await h.close();const keys=await readFile(join(h.directory,'keys.bin'));await writeFile(join(h.directory,'keys.bin'),keys.subarray(0,20));await assert.rejects(()=>h.open());assert.equal((await readFile(join(h.directory,'keys.bin'))).length,20);
 });
 test('startup readiness is a 13-stage partition, not a hard-coded WORKING claim',async t=>{
  let ready=false;const serve=async(_req,res)=>res.end('test asset');Object.defineProperty(serve,'journeyHealth',{value:async()=>({kind:'vite-transform-preflight',ready,checked:['/app/main.tsx','/app/LoopAdultAccess.tsx','/app/LoopChildSetup.tsx','/app/LoopFamilyHome.tsx','/app/LoopSavedPlayer.tsx','/@vite/client','/@vite/env']})});
  const h=await journeyHarness(t,serve),all=['signup','setup','trial','capture','submit','mock-generation','review','readiness','play','save','reload','resume','activity'];
  const partition=s=>{const ids=[...s.working,...s.simulated,...s.missing];assert.equal(ids.length,13);assert.equal(new Set(ids).size,13);assert.deepEqual([...ids].sort(),[...all].sort());assert.deepEqual(s.working,[]);};
  let state=await h.core.getDemoState();partition(state);assert.deepEqual(state.simulated,[]);ready=true;state=await h.core.getDemoState();partition(state);assert(state.simulated.includes('mock-generation'));assert(state.missing.includes('play'));
  ready=false;state=await h.core.getDemoState();partition(state);assert(state.missing.includes('signup'));ready=true;
  const bytes=await readFile(join(h.directory,'keys.bin'));try{await writeFile(join(h.directory,'keys.bin'),bytes.subarray(0,20));state=await h.core.getDemoState();partition(state);assert.deepEqual(state.simulated,[]);}finally{await writeFile(join(h.directory,'keys.bin'),bytes);}
 });
 test('actual project Vite preflight and exact env seam serve required modules without broad escapes',async t=>{
  const assets=await createJourneyAssets();t.after(()=>assets.close());const health=await assets.health();assert.equal(health.ready,true);assert(health.checked.includes('/app/page.tsx'));assert(health.checked.includes('/@vite/env'));
  let delegated=0;const serve=journeyAssetSeam(async(_req,res)=>{delegated++;res.statusCode=404;res.end('missing');},assets),h=await journeyHarness(t,serve);
  const response=await h.http('/@vite/env');assert.equal(response.status,200);assert.equal(delegated,0);assert.equal(typeof response.body,'string');assert.equal((await h.http('/@fs/private')).status,404);assert.equal(delegated,0);
 });
 test('accepted assisted finite-engine help control; client clock does not enter its command schema',()=>{
  const spec={...structuredClone(assistedFixtureAdventure),revision_id:randomUUID()},id=randomUUID(),player=createAssistedPlayer(spec,{playId:id,consentEpoch:1,startingPath:'medium',startingReason:'Invented manual control, not a score.'}),command={contract_version:'1.1.0',play_id:id,action_id:randomUUID(),expected_sequence:0,consent_epoch:1,revision_id:spec.revision_id,pattern_version:'fixture-1',action:{kind:'help',level:2}};
  const accepted=player.dispatch(command);assert.equal(accepted.help_open,true);assert.equal(accepted.help_level,2);assert.equal(accepted.help_history[0].action_id,command.action_id);assert.equal(accepted.trials.length,0);assert.throws(()=>player.dispatch({...command,action_id:randomUUID(),expected_sequence:1,client_at:'2999-01-01T00:00:00Z'}));
  // NOT saved-journal/founder help evidence. That09-A criterion remains unmet.
 });
}
