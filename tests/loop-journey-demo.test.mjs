import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,writeFile,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {startJourneyDemo} from '../server/journey-demo.mjs';

const env={LOOP_ENV:'local-synthetic'};
const stages=['signup','setup','trial','capture','submit','mock-generation','review','readiness','play','save','reload','resume','activity'];
const good=()=>({mode:'local-synthetic',production_ready:false,operator:{username:'private-operator-sentinel',password:'private-password-sentinel',totpSecret:'private-seed-sentinel'},mockInbox:[{email:'invented@example.invalid',token:'private-token-sentinel',purpose:'join'}],working:['signup'],simulated:['mock-generation'],missing:[]});
function fake({getState=good,asset,closeError=false,factoryError=false}={}){
 const count={factory:0,coreClose:0,assetClose:0,assets:0,protected:0},refs={};
 const createProtectedJourney=async config=>{count.factory++;refs.config=config;if(factoryError)throw Error('private factory cause');
  const parentServer=http.createServer((req,res)=>{if(req.url==='/adult/session'){count.protected++;res.writeHead(403,{'Content-Type':'application/json'});res.end('{"status":"denied"}');return;}void config.serve(req,res);});
  const founderServer=http.createServer((req,res)=>{res.writeHead(401);res.end('Founder access required.');});
  Object.assign(refs,{parentServer,founderServer});return {parentServer,founderServer,close:async()=>{count.coreClose++;if(closeError)throw Error('private-password-sentinel');},getDemoState:getState};
 };
 const createAssets=asset?async()=>{count.assets++;return {serve:asset,close:async()=>{count.assetClose++;}};}:undefined;
 return {count,refs,createProtectedJourney,createAssets};
}
async function directory(t){const p=await mkdtemp(join(tmpdir(),'loop-demo-unit-'));t.after(async()=>{assert.equal(dirname(resolve(p)),resolve(tmpdir()));assert(basename(p).startsWith('loop-demo-unit-'));await rm(p,{recursive:true,force:true});});return p;}
async function run(t,opts={}){const dir=await directory(t),f=fake(opts);const api=await startJourneyDemo({env,directory:dir,createProtectedJourney:f.createProtectedJourney,createAssets:f.createAssets,timeoutMs:50});t.after(()=>api.close().catch(()=>{}));return {...f,api,dir};}
function request(origin,path='/',headers={},method='GET'){
 return new Promise((done,reject)=>{const u=new URL(origin),req=http.request({host:u.hostname,port:u.port,path,method,headers},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>done({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));});req.on('error',reject);req.end();});
}
const rejects=work=>assert.rejects(work,e=>['invalid_configuration','demo_unavailable'].includes(e.code));

test('demo facade binds real loopback servers, preserves protected denials and reports all capabilities without secrets',async t=>{
 const f=await run(t);assert.match(f.api.parentOrigin,/^http:\/\/127\.0\.0\.1:\d+$/);assert.notEqual(f.api.parentOrigin,f.api.founderOrigin);
 const home=await request(f.api.parentOrigin);assert.equal(home.status,200);assert.match(home.body,/Start as the parent/);assert.match(home.body,/not scientifically validated|scientifically validated answer/);assert.equal((home.body.match(/<tr><th scope="row">/g)||[]).length,13);
 for(const value of ['private-operator-sentinel','private-password-sentinel','private-seed-sentinel','private-token-sentinel','invented@example.invalid'])assert(!home.body.includes(value));
 assert(home.body.includes('MISSING'));assert(!('operator' in f.api));assert.equal(f.count.protected,0);
 const denied=await request(f.api.parentOrigin,'/adult/session');assert.equal(denied.status,403);assert.equal(denied.body,'{"status":"denied"}');assert.equal(denied.headers['set-cookie'],undefined);
 assert.equal((await request(f.api.founderOrigin,'/login')).status,401);
 assert.equal(home.headers['cache-control'],'no-store');assert.equal(home.headers['referrer-policy'],'no-referrer');assert.equal(home.headers['x-content-type-options'],'nosniff');assert.match(home.headers['content-security-policy'],/frame-ancestors 'none'/);assert.match(home.headers['content-type'],/text\/html; charset=utf-8/);
});
test('demo input rejection precedes assets or factory, with canonical frozen config on healthy control',async t=>{
 const dir=await directory(t),f=fake({asset:(req,res)=>res.end('asset')});
 for(const extra of [{parentPort:-1},{parentPort:1023},{parentPort:65536},{parentPort:12001,founderPort:12001},{timeoutMs:0},{timeoutMs:10001},{directory:'relative/path'},{host:'0.0.0.0'}])await rejects(()=>startJourneyDemo({env,directory:dir,createProtectedJourney:f.createProtectedJourney,createAssets:f.createAssets,...extra}));
 for(const bad of [{LOOP_ENV:'production'},{LOOP_ENV:'local-synthetic',LOOP_AI_ALLOWED:true}])await assert.rejects(()=>startJourneyDemo({env:bad,directory:dir,createProtectedJourney:f.createProtectedJourney,createAssets:f.createAssets}));
 assert.equal(f.count.factory,0);assert.equal(f.count.assets,0);
 const caller={LOOP_ENV:'local-synthetic',LOOP_AI_ALLOWED:false},api=await startJourneyDemo({env:caller,directory:dir,createProtectedJourney:f.createProtectedJourney});t.after(()=>api.close());caller.LOOP_ENV='production';assert.deepEqual(f.refs.config.env,{LOOP_ENV:'local-synthetic'});assert(Object.isFrozen(f.refs.config.env));
});
test('demo options reject accessors/proxies without invoking them',async t=>{
 const dir=await directory(t),f=fake();let reads=0;const opts={env,directory:dir,createProtectedJourney:f.createProtectedJourney};Object.defineProperty(opts,'parentPort',{get(){reads++;return 0;}});await rejects(()=>startJourneyDemo(opts));assert.equal(reads,0);
 await rejects(()=>startJourneyDemo({env:new Proxy(env,{ownKeys(){throw Error('should not run');}}),directory:dir,createProtectedJourney:f.createProtectedJourney}));assert.equal(f.count.factory,0);
});
test('demo rejects persistent stores inside frontend root and through a junction, preserves external store',async t=>{
 const dir=await directory(t),f=fake(),root=resolve(fileURLToPath(new URL('../',import.meta.url)));
 await rejects(()=>startJourneyDemo({env,directory:join(root,'private-store'),createProtectedJourney:f.createProtectedJourney}));
 const link=join(dir,'frontend-link');try{await symlink(root,link,'junction');}catch(e){if(!['EPERM','EACCES','ENOTSUP'].includes(e.code))throw e;t.diagnostic('Junction creation unavailable; direct inside/outside controls still executed.');}
 try{await readFile(join(link,'package.json'));await rejects(()=>startJourneyDemo({env,directory:join(link,'store'),createProtectedJourney:f.createProtectedJourney}));}catch(e){if(e.code!=='ENOENT')throw e;}
 await writeFile(join(dir,'keep.txt'),'persistent sentinel');const api=await startJourneyDemo({env,directory:dir,createProtectedJourney:f.createProtectedJourney});await api.close();assert.equal(await readFile(join(dir,'keep.txt'),'utf8'),'persistent sentinel');
});
test('demo home rejects wrong Host/opposite Origin and query home; direct nonGET gets405',async t=>{
 const {api}=await run(t);assert.equal((await request(api.parentOrigin,'/',{Host:'localhost:1'})).status,403);assert.equal((await request(api.parentOrigin,'/',{Origin:api.founderOrigin})).status,403);assert.equal((await request(api.parentOrigin,'/',{Origin:api.parentOrigin})).status,200);assert.equal((await request(api.parentOrigin,'/?v=1')).status,404);assert.equal((await request(api.parentOrigin,'/',{},'POST')).status,405);assert.equal((await request(api.parentOrigin,'/',{},'HEAD')).status,405);
});
test('demo asset delegation allows preview/.vite/virtual controls, rejects traversal or broader routes',async t=>{
 const paths=[],{api}=await run(t,{asset:(req,res)=>{paths.push(req.url);res.end('permitted asset');}});
 for(const path of ['/loop-preview/join','/loop-preview/setup/','/loop-preview/family','/node_modules/.vite/deps/a.js?v=123','/@id/__x00__react'])assert.equal((await request(api.parentOrigin,path)).status,200);
 for(const path of ['/loop-preview/player','/loop-preview/saved','/@fs/C:/outside','/app/../secret','/app/%2e%2e/secret','/app/%2fsecret','/@id/C:/outside','/@id/../../secret','/app/a.js?outside=1','//external/app/a'])assert.equal((await request(api.parentOrigin,path)).status,404,path);
 assert.equal(paths.length,5);
});
test('demo middleware next/malformed error/never-ended response all terminate safely',async t=>{
 const missing=await run(t,{asset:(req,res,next)=>next()});assert.equal((await request(missing.api.parentOrigin,'/app/missing.js')).status,404);
 const failed=await run(t,{asset:(req,res,next)=>next(Error('private-token-sentinel'))});const error=await request(failed.api.parentOrigin,'/app/a.js');assert.equal(error.status,503);assert(!error.body.includes('private-token-sentinel'));
 const stalled=await run(t,{asset:()=>{}});assert.equal((await request(stalled.api.parentOrigin,'/app/a.js')).status,503);
});
test('demo status validation handles omitted stages, duplicates, unknown IDs and accessor arrays safely',async t=>{
 let current=good();const f=await run(t,{getState:()=>current});const home=await request(f.api.parentOrigin);assert.equal((home.body.match(/<td>MISSING<\/td>/g)||[]).length,11);
 for(const modify of [x=>{x.working.push('signup');},x=>{x.working=['not-a-stage'];},x=>{x.production_ready=true;},x=>{Object.defineProperty(x.working,'0',{get(){throw Error('secret getter');}});}]){current=good();modify(current);const bad=await request(f.api.parentOrigin);assert.equal(bad.status,503);assert.equal(bad.body,'Local demo unavailable.');}
 current=good();current.working=stages;current.simulated=[];assert.equal((await request(f.api.parentOrigin)).status,200);
});
test('demo slow status and thrown secret error are bounded and generic',async t=>{
 const stalled=await run(t,{getState:()=>new Promise(()=>{})});assert.equal((await request(stalled.api.parentOrigin)).status,503);
 const failed=await run(t,{getState:()=>{throw Error('private-password-sentinel');}});const r=await request(failed.api.parentOrigin);assert.equal(r.status,503);assert(!r.body.includes('private-password-sentinel'));
});
test('demo trusted state channel returns isolated clone, never credentials in origins/close',async t=>{
 const f=await run(t);const state=await f.api.getDemoState();assert.equal(state.operator.password,'private-password-sentinel');state.operator.password='changed';assert.equal((await f.api.getDemoState()).operator.password,'private-password-sentinel');await f.api.close();await rejects(()=>f.api.getDemoState());
});
test('demo second bind failure closes first listener, core and assets exactly once',async t=>{
 const dir=await directory(t),occupied=http.createServer();await new Promise(done=>occupied.listen(0,'127.0.0.1',done));t.after(()=>new Promise(done=>occupied.close(done)));const f=fake({asset:()=>{}});
 await rejects(()=>startJourneyDemo({env,directory:dir,createProtectedJourney:f.createProtectedJourney,createAssets:f.createAssets,founderPort:occupied.address().port}));assert.equal(f.refs.parentServer.listening,false);assert.equal(f.count.coreClose,1);assert.equal(f.count.assetClose,1);
});
test('demo factory failure closes already-created assets',async t=>{
 const dir=await directory(t),f=fake({factoryError:true,asset:()=>{}});await rejects(()=>startJourneyDemo({env,directory:dir,createProtectedJourney:f.createProtectedJourney,createAssets:f.createAssets}));assert.equal(f.count.assetClose,1);
});
test('demo close is idempotent, closes active socket, attempts all cleanup and sanitizes errors',async t=>{
 let entered;const active=new Promise(done=>{entered=done;}),f=await run(t,{closeError:true,asset:()=>entered()});let socket;
 const req=http.request(f.api.parentOrigin+'/app/hang.js');req.on('socket',value=>{socket=value;});req.on('error',()=>{});req.end();await active;
 const disconnected=new Promise((done,reject)=>{const timer=setTimeout(()=>reject(Error('owned active socket did not close')),1000);socket.once('close',()=>{clearTimeout(timer);done();});});
 const first=f.api.close(),second=f.api.close();assert.equal(first,second);await assert.rejects(first,e=>e instanceof AggregateError&&!String(e).includes('private-password-sentinel')&&e.errors.every(x=>!String(x).includes('private-password-sentinel')));await disconnected;assert.equal(f.count.coreClose,1);assert.equal(f.count.assetClose,1);assert.equal(f.refs.parentServer.listening,false);assert(socket.destroyed);
});
test('demo rejects same or already-listening server without orphaning it',async t=>{
 const dir=await directory(t);for(const same of [true,false]){const parentServer=http.createServer(),founderServer=same?parentServer:http.createServer();if(!same)await new Promise(done=>parentServer.listen(0,'127.0.0.1',done));let closed=0;await rejects(()=>startJourneyDemo({env,directory:dir,createProtectedJourney:async()=>({parentServer,founderServer,close:async()=>{closed++;},getDemoState:good})}));assert.equal(parentServer.listening,false);assert.equal(founderServer.listening,false);assert.equal(closed,1);}
});
test('demo module import alone cannot create a listener',()=>{
 const moduleURL=new URL('../server/journey-demo.mjs',import.meta.url).href;
 const probe=spawnSync(process.execPath,['--input-type=module','-e',`import {Server} from 'node:http';Server.prototype.listen=()=>{throw Error('unexpected listener')};await import(${JSON.stringify(moduleURL)});`],{encoding:'utf8'});assert.equal(probe.status,0,probe.stderr);
});
