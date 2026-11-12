// CODEX-03-A actual HTTP/React integration regression, invented local data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {resolve,dirname,basename,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {mkdtemp,rm,realpath,readFile,writeFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));
const load=p=>import(pathToFileURL(resolve(root,p)).href);
// Load the actual candidate service; no auth or data-response stubs.
const {createSyntheticFamilySpace}=await load('server/family-space.mjs');
const env={LOOP_ENV:'local-synthetic'},policyVersion='TEST-v1';
const keys=(value,wanted)=>assert.deepEqual(Reflect.ownKeys(value).sort(),[...wanted].sort());
const clone=x=>structuredClone(x),hash=x=>createHash('sha256').update(x).digest('hex');
test('family space: real HTTP React scope, late replies, draft recovery and withdrawal',async()=>{
let at=1800000000000,db,journal,directory,server,ok=false,fault=false;
const outputs=[],sensitive=[];const originalOut=process.stdout.write,originalErr=process.stderr.write;
for(const stream of [process.stdout,process.stderr])stream.write=function(chunk,...args){outputs.push(String(chunk));args.find(x=>typeof x==='function')?.();return true;};
let diagnostic='unclassified';
try {
 const [{createSyntheticDatabase},{migrate},{createSyntheticAdultAccess},{createSyntheticConsentService},{createSyntheticChildSetup},{createEntitlementKernel},{createSyntheticPlayJournal},{createSyntheticPlayService},{fixtureAdventure},{createSyntheticAdultAccessServer}]=await Promise.all([
  load('lib/loop/local-db.mjs'),load('db/migrate.mjs'),load('server/adult-access.mjs'),load('server/consent-service.mjs'),load('server/child-setup.mjs'),load('lib/loop/entitlements.mjs'),load('server/play-journal.mjs'),load('server/play-service.mjs'),load('lib/loop/fixture-adventure.mjs'),load('server/adult-http.mjs')]);
 db=await createSyntheticDatabase(env);await migrate(db);directory=await mkdtemp(join(tmpdir(),'loop-family-probe-'));
 journal=await createSyntheticPlayJournal({env,directory,testHooks:{beforeAppend:async()=>{if(fault)throw Error('Invented journal fault');}}});
 const captured=new Map(),clock=()=>at;
 const access=await createSyntheticAdultAccess({env,db,clock,policy:{challengeTtlMs:600000,sessionTtlMs:3600000,resendCooldownMs:1,requestWindowMs:60000,maxRequests:1000,maxVerifyAttempts:1000},deliver:async x=>{captured.set(x.email,x.token);sensitive.push(x.email,x.token);}});
 const consent=await createSyntheticConsentService({env,db,access,clock,policyVersion});
 const setup=await createSyntheticChildSetup({env,db,access,clock,policyVersion});
 async function adult(label,householdId){const email=label+'@example.invalid';if(householdId)await access.seedAccount({email,adultId:randomUUID(),householdId});await access.request({email,purpose:'join'});const result=await access.verify({token:captured.get(email)});assert.equal(result.status,'verified');sensitive.push(result.sessionToken,result.adultId,result.householdId);return result;}
 async function permit(a){return consent.record(a.sessionToken,{command_id:randomUUID(),policy_version:policyVersion,required_service:true,optional_contact:false,optional_story:false});}
 async function child(a,nickname,initial=true){const status=await setup.status(a.sessionToken);const result=await setup.save(a.sessionToken,{command_id:randomUUID(),setup_context:status.setup_context,operation:'create',initial,profile:{nickname,age:6,calibration:{reads:'with-help',counts_to_20:true,challenge:'some'}}});sensitive.push(nickname,result.child.child_id);return result.child;}
 const A=await adult('familyalpha'),B=await adult('familybeta');await permit(A);await permit(B);
 const one=await child(A,'Invented Alpha'),two=await child(A,'Invented Sibling',false),other=await child(B,'Invented Beta');
 const revision=randomUUID(),spec={...clone(fixtureAdventure),revision_id:revision};
 const play=createSyntheticPlayService({env,db,journal,clock,catalog:[{household_id:A.householdId,revision_id:revision,spec,starting_path:'medium',starting_reason:'Invented developer-selected path, not an ability label.'}]});
 const questions=new Map(),revisions=new Map([[revision,spec]]);let calls=0,brokenRevision=false,badQuestion=null;
 const content={question:async(tx,d)=>{calls++;keys(d,['household_id','request_id','source_scope_version','payload_ref']);const row=(await tx.query('SELECT payload_ref FROM request_source_scopes WHERE household_id=$1 AND request_id=$2 AND source_scope_version=$3',[d.household_id,d.request_id,d.source_scope_version])).rows[0];assert(row&&row.payload_ref===d.payload_ref);const answer=questions.get(d.household_id+':'+d.request_id+':'+d.source_scope_version);assert(answer);return badQuestion??{question:answer};},revision:async(tx,d)=>{calls++;keys(d,['household_id','request_id','revision_id','source_scope_version','pattern_version','engine_version','payload_ref']);const row=(await tx.query('SELECT * FROM adventure_revisions WHERE household_id=$1 AND request_id=$2 AND revision_id=$3 AND source_scope_version=$4',[d.household_id,d.request_id,d.revision_id,d.source_scope_version])).rows[0];assert(row&&row.payload_ref===d.payload_ref&&row.pattern_version===d.pattern_version&&row.engine_version===d.engine_version);return {...clone(revisions.get(d.revision_id)),...(brokenRevision?{revision_id:randomUUID()}:{})};}};

 const family=await createSyntheticFamilySpace({env,db,access,content,play,clock,policyVersion});
 async function wonder(a,c,text,received=false){const id=randomUUID();await db.query('INSERT INTO wonder_requests(household_id,request_id,child_id,payload_ref,original_received_at) VALUES($1,$2,$3,$4,$5)',[a.householdId,id,c.child_id,'synthetic:question',received?new Date(at).toISOString():null]);await db.query('INSERT INTO request_source_scopes VALUES($1,$2,1,$3)',[a.householdId,id,'synthetic:question-v1']);questions.set(a.householdId+':'+id+':1',text);sensitive.push(text);return id;}
 const saved=await wonder(A,one,'  Why does the invented toy move?  '),siblingSaved=await wonder(A,two,'Why does the other invented toy move?'),foreignSaved=await wonder(B,other,'Why does the foreign invented toy move?');
 const kernel=createEntitlementKernel({env,clock}),entitlement=randomUUID(),kernelScope={household_id:A.householdId,consent_epoch:1};await db.query('INSERT INTO entitlements VALUES($1,$2)',[A.householdId,entitlement]);
 const policy={synthetic:true,policy_version:'family-fixture-policy',allowance:8,duration_seconds:120,allocation_scope:'household'};
 const period=await db.transaction(tx=>kernel.activateTrial(tx,kernelScope,{command_id:randomUUID(),entitlement_id:entitlement},policy));
 const transition=(request_id,kind,from,to,cause,expected_version,binding={})=>db.transaction(tx=>kernel.apply(tx,kernelScope,{contract_version:'1.1.0',transition_id:randomUUID(),request_id,period_id:period.period_id,policy_version:policy.policy_version,expected_version,consent_epoch:1,quantity:1,kind,from,to,cause,cause_id:randomUUID()},binding));
 async function production(text,stage){const request=await wonder(A,one,text,true),reservation=randomUUID();await db.query("INSERT INTO capacity_reservations VALUES($1,$2,$3,1,1,$4,'booked')",[A.householdId,reservation,request,randomUUID()]);await transition(request,'hold','none','pending','SubmitProduction',0);if(stage!=='pending')await transition(request,'reserve','pending','reserved','AcceptRequest',1);return {request,reservation};}
 const pending=await production('An invented received question','pending'),accepted=await production('An invented accepted question','reserved'),ready=await production('The original invented published question','reserved');
 const assignment=randomUUID();await db.transaction(async tx=>{await tx.query("INSERT INTO adventure_revisions VALUES($1,$2,$3,1,'fixture-1','fixture-engine-1','published',$4)",[A.householdId,revision,ready.request,'synthetic:unreviewed-relational-fixture']);await tx.query('INSERT INTO published_revisions(household_id,revision_id) VALUES($1,$2)',[A.householdId,revision]);await tx.query('INSERT INTO assignments VALUES($1,$2,$3,$4,$5)',[A.householdId,assignment,ready.request,one.child_id,revision]);await tx.query("UPDATE capacity_reservations SET state='completed' WHERE household_id=$1 AND reservation_id=$2",[A.householdId,ready.reservation]);await kernel.apply(tx,kernelScope,{contract_version:'1.1.0',transition_id:randomUUID(),request_id:ready.request,period_id:period.period_id,policy_version:policy.policy_version,expected_version:2,consent_epoch:1,quantity:1,kind:'consume',from:'reserved',to:'consumed',cause:'MakeAssignmentReady',cause_id:randomUUID()},{assignment_id:assignment});});
 // A newer source must not relabel the earlier published revision.
 await db.query('INSERT INTO request_source_scopes VALUES($1,$2,2,$3)',[A.householdId,ready.request,'synthetic:question-v2']);questions.set(A.householdId+':'+ready.request+':2','A newer invented correction');


 for(let i=0;i<5;i++)await production('Invented full-allowance question '+i,'pending');
 // Real HTTP/React evidence; native layout and task acceptance remain separate.
 const {createRequire,registerHooks}=await import('node:module');const require=createRequire(resolve(root,'package.json'));const {JSDOM}=require('jsdom');
 let cookie='',holdRead=false,heldRead,releaseRead,holdOpen=false,heldOpen,releaseOpen,failRead=false,failIndex=false;
 const guarded={...family,index:async(...args)=>{if(failIndex){failIndex=false;throw Error('invented transient failure');}return family.index(...args);},read:async(...args)=>{if(failRead){failRead=false;throw Error('invented transient failure');}const value=await family.read(...args);if(holdRead){holdRead=false;heldRead=true;await new Promise(resolve=>{releaseRead=resolve;});}return value;},open:async(...args)=>{const value=await family.open(...args);if(holdOpen){holdOpen=false;heldOpen=true;await new Promise(resolve=>{releaseOpen=resolve;});}return value;}};
 server=createSyntheticAdultAccessServer({env,access,consent,setup,family:guarded});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const nativeFetch=globalThis.fetch;
 async function recover(label){at+=2;await nativeFetch(origin+'/adult/request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:label+'@example.invalid',purpose:'recover'})});const r=await nativeFetch(origin+'/adult/verify',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:captured.get(label+'@example.invalid')})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
 cookie=await recover('familyalpha');const alphaCookie=cookie;
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:origin+'/loop-preview/family',pretendToBeVisual:true});
 const names=['window','document','navigator','HTMLElement','Node','Event','MouseEvent','IS_REACT_ACT_ENVIRONMENT','fetch'];const prior=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 const transport=async(route,options={})=>nativeFetch(new URL(route,origin),{...options,headers:{...(options.headers??{}),Cookie:cookie,...(options.method==='POST'?{Origin:origin}:{})}});
 for(const n of names)Object.defineProperty(globalThis,n,{value:n==='IS_REACT_ACT_ENVIRONMENT'?true:n==='fetch'?transport:dom.window[n],writable:true,configurable:true});
 for(const name of ['getItem','setItem','removeItem','clear'])dom.window.Storage.prototype[name]=()=>{throw Error('Browser storage forbidden');};
 const hook=registerHooks({load(url,context,next){if(url.endsWith('.css'))return{format:'module',source:'',shortCircuit:true};return next(url,context);}});
 const React=require('react'),{createRoot}=require('react-dom/client'),{act}=React;const ts=require('typescript'),temporary=resolve(root,'app/.family-space-unit-'+randomUUID()+'.mjs');const source=await readFile(resolve(root,'app/LoopFamilyHome.tsx'),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:'LoopFamilyHome.tsx',reportDiagnostics:true});assert(!(compiled.diagnostics??[]).some(d=>d.category===ts.DiagnosticCategory.Error));await writeFile(temporary,compiled.outputText,{flag:'wx'});const {default:Home}=await import(pathToFileURL(temporary).href);const rootElement=createRoot(document.getElementById('root'));
 const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
 async function until(predicate){for(let i=0;i<180;i++){await act(async()=>{await pause();});if(predicate())return;}throw Error('Prototype condition timed out');}
 const visible=()=>document.body.textContent;
 async function select(position){await act(async()=>{const e=document.getElementById('family-child');assert(e);e.value=String(position);e.dispatchEvent(new Event('change',{bubbles:true}));});}
 async function click(text){const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert(b);await act(async()=>{b.click();});}
 async function focus(){await act(async()=>{window.dispatchEvent(new Event('focus'));});}
 async function type(text){await act(async()=>{const el=document.getElementById('family-wonder');assert(el);Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));});}
 try {
  await act(async()=>{rootElement.render(React.createElement(Home));});await until(()=>document.getElementById('family-child'));
  await select(0);await until(()=>visible().includes('Invented Alpha’s wonders'));
  assert(visible().includes('No allowance remaining in this period.'));assert(visible().includes('The original invented published question'));assert(visible().includes('A newer invented correction'));
  await click('Start a wonder');await type('  An invented unsent question?  ');document.getElementById('family-wonder').focus();await focus();await until(()=>document.getElementById('family-wonder')?.value==='  An invented unsent question?  ');assert.equal(document.activeElement.id,'family-wonder');
  holdRead=true;heldRead=false;await focus();await until(()=>heldRead);await select(1);await until(()=>visible().includes('Invented Sibling’s wonders'));await act(async()=>{releaseRead();await pause();});assert(!visible().includes('Invented Alpha’s wonders'));assert(!visible().includes('The original invented published question'));
  await select(0);await until(()=>visible().includes('Invented Alpha’s wonders'));holdOpen=true;heldOpen=false;await click('Open investigation introduction');await until(()=>heldOpen);await select(1);await until(()=>visible().includes('Invented Sibling’s wonders'));await act(async()=>{releaseOpen();await pause();});assert(!document.querySelector('[aria-label="Opened investigation"]'));
  await select(0);await until(()=>visible().includes('Invented Alpha’s wonders'));await click('Start a wonder');await type('An invented retained draft');failRead=true;await focus();await until(()=>visible().includes('Family details could not be confirmed'));assert(!visible().includes('Invented Alpha’s wonders'));await click('Retry access');await until(()=>visible().includes('Invented Alpha’s wonders'));assert.equal(document.getElementById('family-wonder').value,'An invented retained draft');
  cookie=await recover('familybeta');await focus();await until(()=>visible().includes('Invented Beta'));assert(!visible().includes('Invented Alpha'));assert(!document.getElementById('family-wonder'));cookie=alphaCookie;await focus();await until(()=>visible().includes('Invented Alpha'));await select(0);await until(()=>visible().includes('Invented Alpha’s wonders'));
  const token=()=>cookie.slice('loop_adult_session='.length),beforeIndex=await family.index(token()),selection={view_context:beforeIndex.view_context,child_id:one.child_id};const originalRequests=(await family.read(token(),selection)).requests;
  await db.transaction(async tx=>{await kernel.apply(tx,kernelScope,{contract_version:'1.1.0',transition_id:randomUUID(),request_id:pending.request,period_id:period.period_id,policy_version:policy.policy_version,expected_version:1,consent_epoch:1,quantity:1,kind:'release',from:'pending',to:'released',cause:'CancelRequest',cause_id:randomUUID()});await tx.query("UPDATE capacity_reservations SET state='released' WHERE household_id=$1 AND reservation_id=$2",[A.householdId,pending.reservation]);});
  at+=86400001;cookie=await recover('familyalpha');const lateIndex=await family.index(token()),lateView=await family.read(token(),{view_context:lateIndex.view_context,child_id:one.child_id});
  const closed=lateView.requests.find(q=>q.request_id===pending.request),lateAccepted=lateView.requests.find(q=>q.request_id===accepted.request);assert.equal(closed.state,'closed');assert.equal(closed.overdue,false);assert.equal(lateAccepted.state,'accepted');assert.equal(lateAccepted.overdue,true);for(const item of [closed,lateAccepted])assert.equal(item.due_at,originalRequests.find(q=>q.request_id===item.request_id).due_at);
  await focus();await until(()=>visible().includes('Trial ended'));assert(visible().includes('Previously submitted requests keep their submission-time eligibility.'));assert(visible().includes('Closed'));assert(visible().includes('Accepted · Overdue'));
  holdRead=true;heldRead=false;await focus();await until(()=>heldRead);const withdrawn=await transport('/adult/consent/withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command_id:randomUUID(),policy_version:policyVersion})});assert.equal(withdrawn.status,200);await focus();await until(()=>visible().includes('Test permission needed'));await act(async()=>{releaseRead();await pause();});assert(!visible().includes('Invented Alpha'));
  const permitted=await transport('/adult/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command_id:randomUUID(),policy_version:policyVersion,required_service:true,optional_contact:false,optional_story:false})});assert.equal(permitted.status,200);await focus();await until(()=>visible().includes('Setup needs attention'));assert(!visible().includes('Invented Alpha'));
  at+=3600001;await focus();await until(()=>visible().includes('Family access could not be confirmed'));assert(!visible().includes('Invented Alpha'));
  for(const el of document.querySelectorAll('*'))for(const attr of el.attributes)for(const id of [A.householdId,B.householdId,one.child_id,two.child_id,other.child_id,assignment,revision])assert(!attr.value.includes(id));
  ok=true;
 } finally {await act(async()=>{rootElement.unmount();});await unlink(temporary);hook.deregister();for(const [n,d]of prior){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}dom.window.close();}
} catch(error) {
 diagnostic=(typeof error?.code==='string'&&/^[a-zA-Z0-9_]+$/.test(error.code)?error.code:'assertion')+' '+(String(error?.stack??'').match(/loop-family-space\.test\.mjs:(\d+)/)?.[1]??'unknown-line');
} finally {
 if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});
 if(journal)await journal.close();if(db)await db.close();
 if(directory){const absolute=await realpath(directory),base=await realpath(tmpdir());if(dirname(absolute)!==base||!basename(absolute).startsWith('loop-family-probe-'))throw Error('Refuse redirected fixture cleanup');await rm(absolute,{recursive:true,force:true});}
 process.stdout.write=originalOut;process.stderr.write=originalErr;
}
assert(ok,'Family-space integration failed at sanitized fixture line '+diagnostic);
});
