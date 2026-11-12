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

test('adult service: delayed identity creation, one-use races, bound recovery, expiry and hash-only storage',async()=>fixture(async({db,access,options,messages,advance})=>{
  const A={email:'alpha@example.invalid',adultId:randomUUID(),householdId:randomUUID()};
  const B={email:'beta@example.invalid',adultId:randomUUID(),householdId:randomUUID()};
  await access.seedAccount(A);await access.seedAccount(B);
  const before=await Promise.all(['adult_accounts','households','adult_challenges'].map(t=>count(db,t)));
  await access.request({email:'unknown@example.invalid',purpose:'recover'});
  assert.equal(messages.length,0);
  assert.deepEqual(await Promise.all(['adult_accounts','households','adult_challenges'].map(t=>count(db,t))),before);
  const join=await requestCode(access,messages,'new@example.invalid');
  assert.equal(await count(db,'adult_accounts'),2);assert.equal(await count(db,'households'),2);
  const other=await createSyntheticAdultAccess(options);
  const raced=await Promise.all([access.verify({token:join}),other.verify({token:join})]);
  assert.deepEqual(raced.map(r=>r.status).sort(),['invalid_link','verified']);
  const joined=raced.find(r=>r.status==='verified');
  assert.equal(await count(db,'adult_accounts'),3);assert.equal(await count(db,'households'),3);
  assert.equal(joined.restricted,true);assert.notEqual(joined.householdId,A.householdId);
  const first=await requestCode(access,messages,A.email,'recover');
  const one=await access.verify({token:first});assert.equal(one.householdId,A.householdId);
  assert.deepEqual(await access.verify({token:first}),invalid);
  advance(1001);const replaced=await requestCode(access,messages,A.email,'recover');
  advance(1001);const current=await requestCode(access,messages,A.email,'recover');
  assert.deepEqual(await access.verify({token:replaced}),invalid);
  const rotated=await access.verify({token:current});
  assert.equal(rotated.adultId,A.adultId);assert.equal(rotated.householdId,A.householdId);
  assert.deepEqual(await other.session(one.sessionToken),out);
  assert.equal((await access.session(rotated.sessionToken)).status,'restricted');
  const bCode=await requestCode(access,messages,B.email,'recover');advance(policy.challengeTtlMs);
  assert.deepEqual(await access.verify({token:bCode}),invalid);
  const knownJoin=await requestCode(access,messages,A.email);
  const known=await access.verify({token:knownJoin});assert.equal(known.householdId,A.householdId);assert.equal(known.adultId,A.adultId);
  assert.equal(await count(db,'households'),3);
  for(const table of ['children','service_consents','entitlements','assignments','wonder_requests'])assert.equal(await count(db,table),0);
  const dump=[];
  for(const {tablename} of (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows){
    assert.match(tablename,/^[a-z_]+$/);dump.push((await db.query('SELECT row_to_json(t) FROM '+tablename+' t')).rows);
  }
  const stored=JSON.stringify(dump);
  for(const secret of [join,first,replaced,current,bCode,joined.sessionToken,one.sessionToken,rotated.sessionToken,known.sessionToken])assert(!stored.includes(secret));
  assert.equal((await db.query('SELECT token_hash FROM adult_sessions WHERE token_hash=$1',[createHash('sha256').update(known.sessionToken).digest('hex')])).rows.length,1);
  await db.query('UPDATE adult_accounts SET enabled=false WHERE adult_id=$1',[A.adultId]);
  assert.deepEqual(await access.session(known.sessionToken),out);advance(1001);
  const n=messages.length;assert.deepEqual(await access.request({email:A.email,purpose:'recover'}),inbox);assert.equal(messages.length,n);
  await access.seedAccount(A);assert.equal((await db.query('SELECT enabled FROM adult_accounts WHERE adult_id=$1',[A.adultId])).rows[0].enabled,false);
  await assert.rejects(()=>access.seedAccount({...A,householdId:B.householdId}));
  await assert.rejects(()=>db.query('UPDATE adult_accounts SET household_id=$1 WHERE adult_id=$2',[B.householdId,A.adultId]),e=>e.code==='55000');
  advance(policy.sessionTtlMs);assert.deepEqual(await access.session(joined.sessionToken),out);
  await access.logout(joined.sessionToken);await access.logout(joined.sessionToken);await access.logout(undefined);
}));

test('adult service: persistent cooldown, contending resends, global budgets, reset and delivery failure',async()=>fixture(async({db,access,options,messages,advance})=>{
  const email='limits@example.invalid';
  const first=await requestCode(access,messages,email);
  const other=await createSyntheticAdultAccess(options);
  await other.request({email,purpose:'join'});assert.equal(messages.length,1);
  advance(1001);
  await Promise.all([access.request({email,purpose:'join'}),other.request({email,purpose:'join'})]);
  assert.equal(messages.length,2);assert.deepEqual(await access.verify({token:first}),invalid);
  advance(policy.requestWindowMs+1);
  const n=messages.length;
  await Promise.all(Array.from({length:policy.maxRequests+5},(_,i)=>(i%2?access:other).request({email:`budget${i}@example.invalid`,purpose:'join'})));
  assert.equal(messages.length-n,policy.maxRequests);
  advance(policy.requestWindowMs+1);
  const valid=await requestCode(access,messages,'verify-budget@example.invalid');
  for(let i=0;i<policy.maxVerifyAttempts;i++)assert.deepEqual(await other.verify({token:'bad-'+i}),invalid);
  assert.deepEqual(await access.verify({token:valid}),invalid);
  advance(policy.requestWindowMs+1);
  assert.equal((await other.verify({token:valid})).status,'verified');
  advance(policy.requestWindowMs+1);
  let captured;
  const broken=await createSyntheticAdultAccess({...options,deliver:async value=>{captured=value;throw Error('PRIVATE MOCK FAILURE '+value.token);}});
  await assert.rejects(()=>broken.request({email:'failure@example.invalid',purpose:'join'}),e=>e.message==='Local synthetic access unavailable.' && !e.message.includes(captured?.token));
  assert.deepEqual(await broken.verify({token:captured.token}),invalid);
  assert.equal((await db.query("SELECT count(*) AS n FROM adult_accounts WHERE email='failure@example.invalid'")).rows[0].n,0);
  assert.equal((await db.query('SELECT revoked_at IS NOT NULL AS revoked FROM adult_challenges WHERE email=$1',[captured.email])).rows[0].revoked,true);
}));

test('adult service: constructor/input guards and account binding cannot be supplied by callers',async()=>fixture(async({db,access,options,messages})=>{
  for(const bad of [{},{LOOP_ENV:'production'},{LOOP_ENV:'preview'},{...env,LOOP_SMTP_ALLOWED:'true'}])await assert.rejects(()=>createSyntheticAdultAccess({...options,env:bad}));
  for(const p of [undefined,{...policy,maxRequests:0},{...policy,challengeTtlMs:1.5},{...policy,extra:1}])await assert.rejects(()=>createSyntheticAdultAccess({...options,policy:p}));
  await assert.rejects(()=>createSyntheticAdultAccess({...options,db:{transaction(){},query(){}}}));
  await assert.rejects(()=>createSyntheticAdultAccess({...options,clock:()=>NaN}));
  await assert.rejects(()=>createSyntheticAdultAccess({...options,deliver:null}));
  for(const email of ['real@example.com','x@example.invalid.com','x@sub.example.invalid','x@example.invalid\u200b','x'.repeat(65)+'@example.invalid'])await assert.rejects(()=>access.request({email,purpose:'join'}));
  await assert.rejects(()=>access.request({email:'valid@example.invalid',purpose:'recover',adultId:randomUUID()}));
  await assert.rejects(()=>access.request({email:'valid@example.invalid',purpose:'other'}));
  const code=await requestCode(access,messages,'later@example.invalid');
  const later={email:'later@example.invalid',adultId:randomUUID(),householdId:randomUUID()};await access.seedAccount(later);
  assert.deepEqual(await access.verify({token:code}),invalid,'unbound join cannot acquire a later setup identity');
  const known=await requestCode(access,messages,'  MIXED@EXAMPLE.INVALID  '.trim().toLowerCase());
  assert.equal(messages.at(-1).email,'mixed@example.invalid');
  const result=await access.verify({token:known});
  await db.query('DELETE FROM households WHERE household_id=$1',[result.householdId]);
  assert.deepEqual(await access.session(result.sessionToken),out);
}));

function raw(port,path,headers=[],method='GET',payload) {
  return new Promise((resolve,reject)=>{
    // A dedicated connection keeps deliberately hostile Host headers out of
    // fetch's pooled dispatcher and makes every wire-level case independent.
    const req=http.request({host:'127.0.0.1',port,path,method,headers,agent:false},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString(),headers:res.headers}));
    });req.on('error',reject);req.end(payload);
  });
}

test('adult HTTP: actual loopback, CSRF/header/cookie/body guards, rotation and assets on same server',async()=>fixture(async({access,messages,advance})=>{
  const server=createSyntheticAdultAccessServer({access,env,serve:async(_req,res)=>{
    setTimeout(()=>{res.setHeader('Content-Type','text/plain');res.end('synthetic asset');},5);
  }});
  for(const args of [[0],[0,'0.0.0.0'],[0,'::'],['pipe'],[{port:0,host:'127.0.0.1',path:'pipe'}]])assert.throws(()=>server.listen(...args));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port,origin=`http://127.0.0.1:${port}`,host=`127.0.0.1:${port}`;
  const send=(path,payload,extra={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(payload)});
  try {
    const input={email:'http@example.invalid',purpose:'join'};
    assert.equal((await fetch(origin+'/adult/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})).status,403);
    // Exercise the actual Host guard using an isolated native HTTP request.
    // Do not override Host through the shared fetch connection pool.
    const hostileHost=await raw(port,'/adult/request',[
      'Host','foreign.invalid','Origin',origin,'Content-Type','application/json',
    ],'POST',JSON.stringify(input));
    assert.equal(hostileHost.status,403);
    assert.deepEqual(JSON.parse(hostileHost.body),{error:'Request denied.'});
    assert.equal(messages.length,0,'rejected Host cannot issue a challenge');
    assert.deepEqual(await(await fetch(origin+'/adult/session')).json(),out,'ordinary same-origin traffic remains usable after hostile Host');
    const browserNavigation=await raw(port,'/loop-preview/join',['Host',host,'Sec-Fetch-User','?1','Sec-Fetch-Site','none','Cookie','harmless=one']);assert.equal(browserNavigation.status,200,'ordinary browser navigation metadata is not caller identity');assert.equal(browserNavigation.body,'synthetic asset');
    assert.equal((await raw(port,'/loop-preview/join',['Host',host,'Sec-Fetch-User','?1','Sec-Fetch-Site','cross-site'])).status,403);
    assert.equal((await raw(port,'/adult/session',['Host',host,'Sec-Fetch-User','?1','X-User-Id','invented'])).status,403);
    for(const headers of [{Origin:'https://foreign.invalid'},{Authorization:'Bearer invented'},{'X-Forwarded-Host':host},{Forwarded:'for=127.0.0.1'},{'X-Adult-Id':randomUUID()},{'X-Household-Id':randomUUID()}])assert.equal((await send('/adult/request',input,headers)).status,403);
    assert.equal((await send('/adult/request',{...input,householdId:randomUUID()})).status,400);
    assert.equal((await send('/adult/logout',{token:'not-allowed'})).status,400);
    assert.equal((await send('/adult/request',input,{'Content-Type':'text/plain'})).status,415);
    assert.equal((await fetch(origin+'/adult/request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{malformed'})).status,400);
    assert.equal((await fetch(origin+'/adult/request',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'x'.repeat(5000)})).status,413);
    assert.equal((await raw(port,'/adult/session',['Host',host,'Cookie','loop_adult_session=bad'])).status,400);
    const duplicate=await raw(port,'/adult/session',['Host',host,'Cookie','a=1','Cookie','b=2']);assert.equal(duplicate.status,400);
    assert.equal((await raw(port,'/adult/session',['Host',host,'Host',host])).status,403);
    assert.equal((await send('/adult/request',input)).status,200);
    const code=messages.at(-1).token;
    const verified=await send('/adult/verify',{token:code});assert.equal(verified.status,200);
    const text=await verified.text();assert.deepEqual(JSON.parse(text),{status:'verified',restricted:true});assert(!text.includes(code));assert(!text.includes('sessionToken'));
    const setCookie=verified.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);assert.match(setCookie,/Path=\/adult/);assert(!setCookie.includes('Domain='));
    const cookie=setCookie.split(';')[0];
    const status=await fetch(origin+'/adult/session',{headers:{Cookie:cookie}});const scope=await status.json();assert.equal(scope.status,'restricted');assert.equal(scope.restricted,true);
    const withUnrelated=await fetch(origin+'/adult/session',{headers:{Cookie:cookie+'; unrelated_local_fixture=one'}});assert.equal(withUnrelated.status,200,'unrelated well-formed cookie is not authority and cannot block this adult session');assert.deepEqual(await withUnrelated.json(),scope);
    assert.deepEqual(await(await fetch(origin+'/adult/session',{headers:{Cookie:'unrelated_local_fixture=one'}})).json(),out,'unrelated cookie alone grants no identity');
    assert.deepEqual(await(await fetch(origin+'/adult/session',{headers:{Cookie:'loop_session='+ 'A'.repeat(43)}})).json(),out,'founder cookie cannot become adult authority');
    assert.equal(status.headers.get('cache-control'),'no-store');assert.equal(status.headers.get('referrer-policy'),'no-referrer');
    for(const token of [code,'invalid']){const response=await send('/adult/verify',{token});assert.equal(response.status,200);assert.deepEqual(await response.json(),invalid);}
    assert.equal((await fetch(origin+'/adult/session',{headers:{Cookie:cookie+'; '+cookie}})).status,400);
    assert.equal((await fetch(origin+'/adult/session?token='+code)).status,404);
    for(const route of ['/adult/fixture-inbox','/adult/seedAccount','/child','/family','/founder']){
      const response=await fetch(origin+route,{headers:{Cookie:cookie}});assert.equal(response.status,404);const content=await response.text();assert(!content.includes(scope.householdId));assert(!content.includes(code));
    }
    const asset=await fetch(origin+'/loop-preview/join',{headers:{Cookie:'harmless=one'}});assert.equal(await asset.text(),'synthetic asset');
    advance(1001);await send('/adult/request',{email:input.email,purpose:'recover'});const recovery=messages.at(-1).token;
    await send('/adult/verify',{token:recovery});
    assert.deepEqual(await(await fetch(origin+'/adult/session',{headers:{Cookie:cookie}})).json(),out,'old browser cookie loses authority after recovery');
    const logout=await send('/adult/logout',{}, {Cookie:cookie});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  } finally {await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});}
}));


test('passive signed-out tab cannot revoke a newer shared-cookie session',async()=>fixture(async({access,messages,advance})=>{
  const server=createSyntheticAdultAccessServer({access,env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
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
  const temporary=path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))),'app/.adult-passive-test.mjs');
  try{
    const first=await requestCode(access,messages,'passive@example.invalid');
    assert.equal((await browserFetch('/adult/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:first})})).status,200);
    for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='fetch'?browserFetch:['requestAnimationFrame','cancelAnimationFrame'].includes(name)?dom.window[name].bind(dom.window):dom.window[name]});dom.window.fetch=browserFetch;
    hook=registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};return next(url,context);}});
    let exists=false;try{await fileAccess(temporary);exists=true;}catch{}assert(!exists,'preserve existing owned-test filename');
    const source=await readFile(new URL('../app/LoopAdultAccess.tsx',import.meta.url),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});await writeFile(temporary,compiled.outputText,{flag:'wx'});owned=true;
    const {default:Component}=await import(pathToFileURL(temporary).href),{createRoot}=require('react-dom/client');const host=dom.window.document.getElementById('root');reactRoot=createRoot(host);
    const phase=()=>host.querySelector('[data-testid="adult-status"]')?.getAttribute('data-phase');
    const wait=async condition=>{const until=Date.now()+10000;while(!condition()){assert(Date.now()<until,'actual adult UI did not settle');await React.act(async()=>new Promise(resolve=>setTimeout(resolve,20)));}};
    await React.act(async()=>reactRoot.render(React.createElement(Component)));await wait(()=>phase()==='restricted');
    const signOut=[...host.querySelectorAll('button')].find(x=>x.textContent==='Sign out');assert(signOut);await React.act(async()=>signOut.click());await wait(()=>phase()==='signed-out'&&host.textContent.includes('Signed out of the local test.'));assert.equal(cookie,'');
    // Another tab verifies through actual HTTP; browsers share this cookie jar.
    advance(1001);const next=await requestCode(access,messages,'passive@example.invalid','recover');assert.equal((await browserFetch('/adult/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:next})})).status,200);const before=await(await browserFetch('/adult/session')).json();assert.equal(before.status,'restricted');const start=requests.length;
    await React.act(async()=>{dom.window.dispatchEvent(new dom.window.Event('focus'));await new Promise(resolve=>setTimeout(resolve,0));while(pending.size)await Promise.allSettled([...pending]);});
    const passive=requests.slice(start);assert(!passive.some(x=>x.path==='/adult/logout'),'passive focus must never issue logout for a newer shared-cookie session');
    assert.equal(phase(),'signed-out','old tab stays locally signed out');assert.deepEqual(await(await browserFetch('/adult/session')).json(),before,'newer session remains active in the same intended household');assert.equal(errors.length,0,errors.map(String).join('\n'));
  }finally{
    if(reactRoot)await React.act(async()=>reactRoot.unmount());hook?.deregister();if(owned)await unlink(temporary);dom.window.close();for(const [name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
    await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.()});
  }
}));
