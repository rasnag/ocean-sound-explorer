// Proposed tests only. Actual PGlite/auth/HTTP/React; no acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import http from 'node:http';
import {mkdtemp,rm,realpath,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {TOTP,Secret} from 'otpauth';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {createFounderAuth} from '../lib/loop/founder-auth.mjs';
import {createSyntheticAdultAccess} from '../server/adult-access.mjs';
import {createSyntheticConsentService} from '../server/consent-service.mjs';
import {createSyntheticChildSetup} from '../server/child-setup.mjs';
import {createSyntheticFamilySpace} from '../server/family-space.mjs';
import {createEntitlementKernel} from '../lib/loop/entitlements.mjs';
import {createSyntheticContinuationJournal} from '../server/continuation-journal.mjs';
import {createSyntheticContinuationService} from '../server/continuation-service.mjs';
import {createSyntheticAuthServer} from '../server/loop-auth.mjs';
import {createSyntheticAdultAccessServer} from '../server/adult-http.mjs';
const env={LOOP_ENV:'local-synthetic'},policy='TEST-CONTINUATION-v1';
const rejected=(work,code)=>assert.rejects(work,e=>!code||e.code===code);
async function fixture(work){
 const db=await createSyntheticDatabase(env),directory=await mkdtemp(join(tmpdir(),'loop-continuation-test-'));let journal;const servers=[];
 let at=1800000000000,fault=null;const materials=new Map(),delivered=new Map(),sensitive=[],logs=[];
 const originalOut=process.stdout.write,originalErr=process.stderr.write;
 for(const stream of [process.stdout,process.stderr])stream.write=function(chunk,...args){logs.push(String(chunk));args.find(x=>typeof x==='function')?.();return true;};
 let failure;
 try{
  await migrate(db);const clock=()=>at,globalKey=randomBytes(32);sensitive.push(globalKey.toString('hex'));
  const keys={keyForHousehold:h=>{if(!materials.has(h))throw Error('Missing invented key');return Buffer.from(materials.get(h));},receiptDedupeKey:globalKey};
  journal=await createSyntheticContinuationJournal({env,directory,keys,testHooks:{beforeAppend:async r=>{if(fault)await fault(r);}}});
  const auth=await createFounderAuth({env,db,clock,sessionTtlMs:600000});
  async function identity(role='founder'){const p={username:'invented-'+randomUUID(),role,password:randomBytes(24).toString('base64url'),totpSecret:new Secret({size:20}).base32};await auth.provisionSyntheticIdentity(p);sensitive.push(p.password,p.totpSecret);return p;}
  const owner=await identity(),otherFounder=await identity(),familyIdentity=await identity('family');
  const otp=p=>new TOTP({secret:Secret.fromBase32(p.totpSecret),algorithm:'SHA1',digits:6,period:30}).generate({timestamp:at});
  const login=async p=>{const s=await auth.login({username:p.username,password:p.password,totp:otp(p)});sensitive.push(s.token);return s.token;};
  const access=await createSyntheticAdultAccess({env,db,clock,policy:{challengeTtlMs:600000,sessionTtlMs:3600000,resendCooldownMs:1,requestWindowMs:60000,maxRequests:1000,maxVerifyAttempts:1000},deliver:async m=>delivered.set(m.email,m.token)});
  const consent=await createSyntheticConsentService({env,db,access,clock,policyVersion:'TEST-v1'}),setup=await createSyntheticChildSetup({env,db,access,clock,policyVersion:'TEST-v1'});
  async function adult(label){const email=label+'@example.invalid';await access.request({email,purpose:'join'});const a=await access.verify({token:delivered.get(email)});assert.equal(a.status,'verified');sensitive.push(email,a.sessionToken);materials.set(a.householdId,randomBytes(32));await consent.record(a.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1',required_service:true,optional_contact:false,optional_story:false});const s=await setup.status(a.sessionToken),child=(await setup.save(a.sessionToken,{command_id:randomUUID(),setup_context:s.setup_context,operation:'create',initial:true,profile:{nickname:'Invented Explorer',age:6,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}})).child;return {...a,child};}
  const A=await adult('continuation-alpha'),B=await adult('continuation-beta'),kernel=createEntitlementKernel({env,clock});
  const trialPolicy={synthetic:true,policy_version:'invented-original-trial',allowance:2,duration_seconds:60,allocation_scope:'household'};
  const trials=new Map();for(const a of [A,B]){const entitlement=randomUUID();await db.query('INSERT INTO entitlements VALUES($1,$2)',[a.householdId,entitlement]);trials.set(a.householdId,await db.transaction(tx=>kernel.activateTrial(tx,{household_id:a.householdId,consent_epoch:1},{command_id:randomUUID(),entitlement_id:entitlement},trialPolicy)));}
  at+=120000;const token=await login(owner),otherToken=await login(otherFounder),familyToken=await login(familyIdentity);
  let service=await createSyntheticContinuationService({env,db,auth,access,journal,keys,clock});
  const content={question:async()=>({question:'Invented relational fixture question'}),revision:async()=>{throw Error('No revision in this fixture');}},play={resume:async()=>{throw Error('No play in this fixture');},reconcile:async()=>{throw Error('No play in this fixture');}};
  const family=await createSyntheticFamilySpace({env,db,access,content,play,clock,policyVersion:'TEST-v1'});
  const selection=async(a=A)=>({view_context:(await family.index(a.sessionToken)).view_context,child_id:a.child.child_id});
  const command=(a=A)=>({contract_version:'test-continuation-1',command_id:randomUUID(),household_id:a.householdId,consent_epoch:1,expected_version:0,policy_version:policy,synthetic_only:true,receipt_reference:'TEST-CONTINUATION-'+randomBytes(16).toString('hex'),allocation_scope:'household',starts_at:new Date(at).toISOString(),ends_at:new Date(at+60000).toISOString(),allowance:3,provenance_kind:'invented-payment-record'});
  async function start(server){servers.push(server);await new Promise(done=>server.listen(0,'127.0.0.1',done));return 'http://127.0.0.1:'+server.address().port;}
  await work({db,directory,auth,access,consent,setup,A,B,owner,otherFounder,familyIdentity,token,otherToken,familyToken,kernel,trials,trialPolicy,family,selection,command,keys,materials,sensitive,logs,login,otp,start,clock,get service(){return service;},get journal(){return journal;},setFault(fn){fault=fn;},advance(ms){at+=ms;},async reopen(){await journal.close();journal=await createSyntheticContinuationJournal({env,directory,keys});service=await createSyntheticContinuationService({env,db,auth,access,journal,keys,clock});}});
  for(const secret of sensitive)assert(!logs.join('').includes(secret),'Private stdout/stderr absence');
 }catch(e){failure={code:typeof e?.code==='string'&&/^[a-zA-Z0-9_]+$/.test(e.code)?e.code:'assertion',line:String(e?.stack??'').match(/loop-continuation\.test\.mjs:(\d+)/)?.[1]??'unknown'};}
 finally{
  for(const server of servers)if(server.listening)await new Promise(done=>{server.close(done);server.closeAllConnections?.();});if(journal)await journal.close();await db.close();
  const absolute=resolve(directory);if(dirname(absolute)!==resolve(tmpdir())||!basename(absolute).startsWith('loop-continuation-test-')||await realpath(absolute)!==absolute||(await lstat(absolute)).isSymbolicLink())throw Error('Unsafe fixture cleanup');await rm(absolute,{recursive:true,force:true});process.stdout.write=originalOut;process.stderr.write=originalErr;
 }
 if(failure)throw Error('Continuation fixture failed: '+failure.code+' at '+failure.line);
}
const ref=c=>({household_id:c.household_id,command_id:c.command_id});
async function effects(db){const result={};for(const table of ['entitlements','entitlement_periods','continuation_commands','continuation_grants','entitlement_claims','wonder_requests','capacity_reservations','assignments','play_sessions'])result[table]=Number((await db.query('SELECT count(*) n FROM '+table)).rows[0].n);return result;}
function transition(period,request,kind='hold',version=0){return {contract_version:'1.1.0',transition_id:randomUUID(),request_id:request,period_id:period,policy_version:policy,expected_version:version,consent_epoch:1,quantity:1,kind,from:kind==='hold'?'none':'pending',to:kind==='hold'?'pending':'reserved',cause:kind==='hold'?'SubmitProduction':'AcceptRequest',cause_id:randomUUID()};}

test('primary-only continuation is inaccessible to BOTH projection and kernel, then exact retry acknowledges once',async()=>fixture(async f=>{
 const c=f.command(),before=await effects(f.db);f.setFault(async()=>{throw Error('Invented pre-append failure');});
 const pending=await f.service.record(f.token,c);assert.equal(pending.status,'retryable_unacknowledged');assert(!Object.hasOwn(pending,'grant'));
 const row=(await f.db.query('SELECT * FROM continuation_commands WHERE command_id=$1',[c.command_id])).rows[0];assert.equal(row.acknowledged,false);
 assert.equal((await effects(f.db)).entitlement_periods,before.entitlement_periods+1);assert.equal((await effects(f.db)).continuation_grants,0);
 const scope={household_id:f.A.householdId,consent_epoch:1},selected=await f.selection();
 assert(!(await f.family.read(f.A.sessionToken,selected)).allowances.some(a=>a.period_id===row.period_id));
 await rejected(()=>f.db.transaction(tx=>f.kernel.readAllowance(tx,scope,{period_id:row.period_id})),'denied');
 const request=randomUUID();await f.db.query('INSERT INTO wonder_requests(household_id,request_id,child_id,original_received_at) VALUES($1,$2,$3,$4)',[scope.household_id,request,f.A.child.child_id,c.starts_at]);
 const hold=transition(row.period_id,request);await rejected(()=>f.db.transaction(tx=>f.kernel.apply(tx,scope,hold)),'denied');
 await f.db.query('DELETE FROM wonder_requests WHERE household_id=$1 AND request_id=$2',[scope.household_id,request]);
 assert.equal((await f.service.familyStatus(f.A.sessionToken,selected)).state,'confirmation_pending');
 await rejected(()=>f.service.record(f.token,{...c,allowance:4}),'conflict');await rejected(()=>f.service.record(f.token,f.command()),'journal_unavailable');
 await f.reopen();const ack=await f.service.reconcile(f.token,ref(c));assert.equal(ack.status,'acknowledged');assert.equal(ack.grant.period_id,row.period_id);
 assert.deepEqual(await f.service.record(f.token,c),ack);assert.equal((await effects(f.db)).continuation_commands,1);assert.equal((await effects(f.db)).continuation_grants,1);
 const after=await effects(f.db);for(const table of ['entitlement_claims','wonder_requests','capacity_reservations','assignments','play_sessions'])assert.equal(after[table],before[table]);
 assert((await f.family.read(f.A.sessionToken,selected)).allowances.some(a=>a.period_id===row.period_id));assert.equal((await f.db.transaction(tx=>f.kernel.readAllowance(tx,scope,{period_id:row.period_id}))).remaining,3);
 assert.equal((await f.service.familyStatus(f.A.sessionToken,selected)).state,'recorded_active');
 for(const forbidden of ['receipt_reference','recorded_by','actor_id','durability_ref','grant'])assert(!Object.hasOwn(await f.service.familyStatus(f.A.sessionToken,selected),forbidden));
}));

test('strict snapshots, dates, allocation, same-key conflict, globally deduplicated references and rollback',async()=>fixture(async f=>{
 let traps=0;const c=f.command(),original=structuredClone(c),saving=f.service.record(f.token,c);c.allowance=99;const ack=await saving;assert.equal(ack.grant.allowance,original.allowance);
 const getter=Object.defineProperty(f.command(),'allowance',{enumerable:true,get(){traps++;throw Error();}}),proxy=new Proxy(f.command(),{getPrototypeOf(){traps++;throw Error();},ownKeys(){traps++;throw Error();}});
 await rejected(()=>f.service.record(f.token,getter),'validation_failed');await rejected(()=>f.service.record(f.token,proxy),'validation_failed');assert.equal(traps,0);
 await rejected(()=>f.service.record(f.token,{...original,allowance:4}),'conflict');
 await rejected(()=>f.service.record(f.token,{...f.command(f.B),receipt_reference:original.receipt_reference}),'conflict');
 const before=await effects(f.db);
 for(const patch of [{amount:1},{currency:'USD'},{url:'https://example.invalid'},{receipt_reference:'bank receipt'},{allowance:'3'},{allowance:Infinity},{allowance:0},{starts_at:'2026-02-30T00:00:00.000Z'},{child_id:f.A.child.child_id}])await rejected(()=>f.service.record(f.token,{...f.command(f.B),...patch}),'validation_failed');
 const future=f.command(f.B);future.starts_at=new Date(f.clock()+1).toISOString();await rejected(()=>f.service.record(f.token,future),'ineligible');
 await rejected(()=>f.service.record(f.token,{...f.command(),expected_version:1}),'conflict');
 await rejected(()=>f.service.record(f.token,{...f.command(f.B),allocation_scope:'child',child_id:f.B.child.child_id}),'conflict');
 assert.deepEqual(await effects(f.db),before);
 await f.db.exec(`CREATE FUNCTION continuation_test_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Invented rollback' USING ERRCODE='23514'; END $$; CREATE TRIGGER continuation_test_abort BEFORE INSERT ON continuation_commands FOR EACH ROW EXECUTE FUNCTION continuation_test_abort();`);
 await rejected(()=>f.service.record(f.token,f.command(f.B)),'23514');assert.deepEqual(await effects(f.db),before);
 await f.db.exec('DROP TRIGGER continuation_test_abort ON continuation_commands');
 assert.equal((await f.journal.records(f.B.householdId)).length,0);
}));

test('period end rejects a new hold; original pre-expiry claim reserves without moved dates or allowance',async()=>fixture(async f=>{
 const trial=f.trials.get(f.A.householdId),scope={household_id:f.A.householdId,consent_epoch:1},old=randomUUID();
 await f.db.query('INSERT INTO wonder_requests(household_id,request_id,child_id,original_received_at) VALUES($1,$2,$3,$4)',[scope.household_id,old,f.A.child.child_id,trial.trial_start]);
 const oldHold={...transition(trial.period_id,old),policy_version:f.trialPolicy.policy_version};await f.db.transaction(tx=>f.kernel.apply(tx,scope,oldHold));
 const c=f.command(),ack=await f.service.record(f.token,c),period=ack.grant.period_id;
 const boundary=randomUUID();await f.db.query('INSERT INTO wonder_requests(household_id,request_id,child_id,original_received_at) VALUES($1,$2,$3,$4)',[scope.household_id,boundary,f.A.child.child_id,c.ends_at]);f.advance(60000);
 await rejected(()=>f.db.transaction(tx=>f.kernel.apply(tx,scope,transition(period,boundary))),'ineligible');
 await f.db.transaction(tx=>f.kernel.apply(tx,scope,{...transition(trial.period_id,old,'reserve',1),policy_version:f.trialPolicy.policy_version}));
 const claim=(await f.db.query('SELECT * FROM entitlement_claims WHERE request_id=$1',[old])).rows[0];assert.equal(claim.period_id,trial.period_id);assert.equal(claim.state,'reserved');
 const p=(await f.db.query('SELECT * FROM entitlement_periods WHERE period_id=$1',[trial.period_id])).rows[0];assert.equal(new Date(p.trial_start).toISOString(),trial.trial_start);assert.equal(new Date(p.trial_end).toISOString(),trial.trial_end);
 const historical=await f.service.record(f.token,c);assert.equal(historical.state,'recorded_expired');assert.deepEqual(historical.grant,ack.grant);
 const adjacent={...f.command(),expected_version:1};assert.equal(adjacent.starts_at,c.ends_at);assert.equal((await f.service.record(f.token,adjacent)).status,'acknowledged');
}));

test('actual founder password/TOTP HTTP, protected assets, adult-cookie isolation and safe request guards',async()=>fixture(async f=>{
 const server=createSyntheticAuthServer({env,auth:f.auth,continuation:f.service,logger:v=>f.logs.push(JSON.stringify(v))}),origin=await f.start(server),port=server.address().port;
 const request=(path,{method='GET',body,raw,headers={},cookie}={})=>new Promise((done,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{Origin:origin,...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',x=>text+=x);res.on('end',()=>done({status:res.statusCode,text,headers:res.headers}));});req.on('error',reject);req.end(raw??(body===undefined?undefined:JSON.stringify(body)));});
 const founderCookie='loop_session='+f.token,c=f.command();
 assert.equal((await request('/founder/continuation')).status,401);assert.equal((await request('/founder/continuation.js')).status,401);
 assert.equal((await request('/founder/continuation',{cookie:'loop_adult_session='+f.A.sessionToken})).status,401);
 assert.equal((await request('/founder/continuation',{cookie:'loop_session='+f.familyToken})).status,403);
 const page=await request('/founder/continuation',{cookie:founderCookie});assert.equal(page.status,200);assert.match(page.text,/No money is collected or verified/);assert.match(page.headers['cache-control'],/no-store/);
 const script=await request('/founder/continuation.js',{cookie:founderCookie});assert.equal(script.status,200);assert(!/localStorage|sessionStorage|randomUUID/.test(script.text));
 f.advance(30000);const credentials={username:f.owner.username,password:f.owner.password,totp:f.otp(f.owner)};
 const signed=await request('/login',{method:'POST',body:credentials});assert.equal(signed.status,200);assert.equal((await request('/login',{method:'POST',body:credentials})).status,401);
 const cookie=signed.headers['set-cookie'][0].split(';')[0];f.sensitive.push(cookie.split('=')[1]);
 const route='/founder/continuation/record';
 for(const options of [{headers:{Origin:'https://example.invalid'}},{headers:{'X-Founder-Role':'founder'}},{headers:{Authorization:'Bearer invented'}},{headers:{'Content-Encoding':'gzip'}},{raw:'{"household_id":"x","household_id":"y"}'},{raw:Buffer.from([0xff])},{raw:'x'.repeat(4097)},{cookie:'loop_session='+f.token+'; loop_session='+f.token}]){const r=await request(route,{method:'POST',body:c,cookie,...options});assert([400,401,403,413,415].includes(r.status));}
 assert.equal((await request(route+'?role=founder',{method:'POST',body:c,cookie})).status,400);
 const recorded=await request(route,{method:'POST',body:c,cookie});assert.equal(recorded.status,200);assert.equal(JSON.parse(recorded.text).status,'acknowledged');assert(!recorded.text.includes(c.receipt_reference));
 const adultOrigin=await f.start(createSyntheticAdultAccessServer({env,access:f.access,consent:f.consent,setup:f.setup,family:f.family,continuation:f.service}));
 const selection=await f.selection(),response=await fetch(adultOrigin+'/adult/continuation/status',{method:'POST',headers:{Origin:adultOrigin,'Content-Type':'application/json',Cookie:'loop_adult_session='+f.A.sessionToken},body:JSON.stringify(selection)});assert.equal(response.status,200);assert.equal((await response.json()).state,'recorded_active');
 const forged=await fetch(adultOrigin+'/adult/continuation/status',{method:'POST',headers:{Origin:adultOrigin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(selection)});assert.equal(forged.status,403);
 const logout=await request('/logout',{method:'POST',body:{},cookie});assert.equal(logout.status,200);assert.equal((await request('/founder/continuation',{cookie})).status,401);
}));

test('actual React discards delayed continuation status after withdrawal and leaves capture integration mounted',async()=>fixture(async f=>{
 const {createRequire,registerHooks}=await import('node:module'),require=createRequire(new URL('../package.json',import.meta.url)),{JSDOM}=require('jsdom');
 let held=false,release,holdNext=false;const guarded={...f.service,familyStatus:async(...args)=>{const value=await f.service.familyStatus(...args);if(holdNext){holdNext=false;held=true;await new Promise(done=>release=done);}return value;}};
 await f.service.record(f.token,f.command());
 const origin=await f.start(createSyntheticAdultAccessServer({env,access:f.access,consent:f.consent,setup:f.setup,family:f.family,continuation:guarded})),nativeFetch=globalThis.fetch;
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:origin+'/loop-preview/family',pretendToBeVisual:true}),names=['window','document','navigator','HTMLElement','Node','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch'],prior=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));let root,hook;
 try{
  const transport=(route,options={})=>nativeFetch(new URL(route,origin),{...options,headers:{...(options.headers??{}),Origin:origin,Cookie:'loop_adult_session='+f.A.sessionToken}});
  for(const n of names)Object.defineProperty(globalThis,n,{value:n==='IS_REACT_ACT_ENVIRONMENT'?true:n==='fetch'?transport:dom.window[n],writable:true,configurable:true});
  for(const name of ['getItem','setItem','removeItem','clear'])dom.window.Storage.prototype[name]=()=>{throw Error('Private storage forbidden');};
  const homeURL=new URL('../app/LoopFamilyHome.tsx',import.meta.url).href,captureURL=new URL('../app/LoopWonderCapture.tsx',import.meta.url).href;
  hook=registerHooks({resolve(specifier,context,next){if(specifier==='./LoopWonderCapture')return {url:captureURL,shortCircuit:true};return next(specifier,context);},load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};if([homeURL,captureURL].includes(url)){const ts=require('typescript'),r=ts.transpileModule(require('node:fs').readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:new URL(url).pathname,reportDiagnostics:true});assert(!(r.diagnostics??[]).some(d=>d.category===ts.DiagnosticCategory.Error));return {format:'module',source:r.outputText,shortCircuit:true};}return next(url,context);}});
  const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),{default:Home}=await import(homeURL);root=createRoot(document.getElementById('root'));
  async function until(check){for(let n=0;n<200;n++){await act(async()=>new Promise(done=>setTimeout(done,15)));if(check())return;}throw Error('UI timeout');}
  await act(async()=>root.render(React.createElement(Home)));await until(()=>document.getElementById('family-child'));
  await act(async()=>{const select=document.getElementById('family-child');select.value='0';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await until(()=>document.querySelector('[aria-label="Test continuation status"]')?.textContent.includes('Test continuation recorded.'));
  assert(document.body.textContent.includes('3 available'));f.advance(60000);await act(async()=>window.dispatchEvent(new Event('focus')));
  await until(()=>document.querySelector('[aria-label="Test continuation status"]')?.textContent.includes('Test continuation ended.'));
  const ended=[...document.querySelectorAll('.family-card')].find(card=>card.textContent.includes('Test continuation ended'));
  assert(ended&&ended.textContent.includes('3 remaining in ended period')&&!ended.textContent.includes('3 available'));
  holdNext=true;await act(async()=>window.dispatchEvent(new Event('focus')));await until(()=>held);assert(document.getElementById('wonder-title'));assert(document.querySelector('[aria-label="Selected child space"]'));
  await f.consent.withdraw(f.A.sessionToken,{command_id:randomUUID(),policy_version:'TEST-v1'});await act(async()=>window.dispatchEvent(new Event('focus')));await until(()=>document.body.textContent.includes('Test permission needed'));
  await act(async()=>{release();await new Promise(done=>setTimeout(done,30));});assert(!document.querySelector('[aria-label="Test continuation status"]'));assert(!document.getElementById('wonder-title'));assert(!document.body.textContent.includes('Invented Explorer'));
  assert.equal(dom.window.location.search+dom.window.location.hash,'');
 }finally{release?.();if(root){const {act}=require('react');await act(async()=>root.unmount());}hook?.deregister();dom.window.close();for(const [n,d]of prior){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}}
}));
