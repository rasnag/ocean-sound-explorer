// PLAYABLE-JOURNEY-LOCAL-01 correction3. Invented local data only; no workflow seeds.
// Engineering 1.2 SHA256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
import {lstat,realpath,readdir,mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import {Secret} from 'otpauth';
import {PGlite} from '@electric-sql/pglite';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
import {migrate} from '../db/migrate.mjs';
import {createFounderAuth} from '../lib/loop/founder-auth.mjs';
import {createEntitlementKernel} from '../lib/loop/entitlements.mjs';
import {MOCK_LIMITS,createSyntheticMockProvider} from '../lib/loop/draft-fixture.mjs';
import {createSyntheticAdultAccess} from './adult-access.mjs';
import {createSyntheticConsentService} from './consent-service.mjs';
import {createSyntheticChildSetup} from './child-setup.mjs';
import {createJourneyOnboarding} from './journey-onboarding.mjs';
import {createSyntheticWonderJournal} from './wonder-journal.mjs';
import {createSyntheticWonderCapture} from './wonder-capture.mjs';
import {createSyntheticProductionJournal} from './production-journal.mjs';
import {createSyntheticProductionSubmission} from './production-submission.mjs';
import {createSyntheticQueueJournal} from './queue-journal.mjs';
import {createSyntheticRequestQueue,serializeQueueWork} from './request-queue.mjs';
import {createSyntheticGenerationJournal} from './generation-journal.mjs';
import {createSyntheticGenerationService} from './generation-service.mjs';
import {createSyntheticReviewJournal} from './review-journal.mjs';
import {createSyntheticReviewService} from './review-service.mjs';
import {createSyntheticPrivateBridgeJournal} from './private-bridge-journal.mjs';
import {createSyntheticPrivateBridge} from './private-bridge.mjs';
import {createSyntheticPlayJournal} from './play-journal.mjs';
import {createSyntheticJourneyPlay} from './journey-play.mjs';
import {createSyntheticFamilySpace} from './family-space.mjs';
import {createSyntheticCostJournal} from './cost-journal.mjs';
import {createSyntheticCostService} from './cost-service.mjs';
import {createSyntheticContinuationJournal,parseStrictJSON,ownData} from './continuation-journal.mjs';
import {createSyntheticContinuationService} from './continuation-service.mjs';
import {createJourneyFounder} from './journey-founder.mjs';
import {createSyntheticAdultAccessServer} from './adult-http.mjs';
import {createSyntheticAuthServer} from './loop-auth.mjs';
const appRoot=resolve(fileURLToPath(new URL('../',import.meta.url)));
const names=['wonder','production','queue','generation','review','bridge','play','cost','continuation'];
const stages=['signup','setup','trial','capture','submit','mock-generation','review','readiness','play','save','reload','resume','activity'];
const simulationStages=['signup','setup','trial','mock-generation','review'];
const fail=()=>{throw Object.assign(new Error('Owned local synthetic store unavailable.'),{code:'configuration_missing',status:503});};
const sha=v=>createHash('sha256').update(v).digest('hex');
const within=(a,b)=>{const r=relative(a,b);return !r||!isAbsolute(r)&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\');};
async function components(path,allowMissingLeaf=false){let p=path,leaf=true;for(;;){try{const s=await lstat(p);if(s.isSymbolicLink()||!s.isDirectory())fail();}catch(e){if(!(allowMissingLeaf&&leaf&&e.code==='ENOENT'))throw e;}const parent=dirname(p);if(parent===p)break;p=parent;leaf=false;}}
export async function validateJourneyDirectory(directory){
 if(typeof directory!=='string'||!isAbsolute(directory)||resolve(directory)!==directory||directory.includes('\0'))fail();
 await components(directory,true);await components(appRoot);const root=await realpath(appRoot),parent=await realpath(dirname(directory));
 if(parent!==dirname(directory)||within(root,directory)||within(directory,root))fail();
 try{if(await realpath(directory)!==directory)fail();}catch(e){if(e.code!=='ENOENT')throw e;}return directory;
}
async function file(path){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail();if(typeof process.getuid==='function'&&(s.uid!==process.getuid()||(s.mode&0o077)!==0))fail();return readFile(path);}
async function writeNew(path,bytes){const h=await open(path,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}}
async function replaceOwner(directory,value){const temp=join(directory,'owner.next');await writeNew(temp,JSON.stringify(value));await rename(temp,join(directory,'owner.json'));}
async function closeHTTP(server){if(!server?.listening)return;await new Promise((done,reject)=>{server.close(e=>e?reject(e):done());server.closeIdleConnections?.();server.closeAllConnections?.();});}
async function bounded(work,ms){let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Readiness check unavailable.')),ms);})]);}finally{clearTimeout(timer);}}
/** UNLISTENED servers. The optional serve.journeyHealth is a trusted-process-only
 * read-only asset preflight, not a constructor option or HTTP/user authority.
 * Startup checks cannot establish the complete browser journey: those stages stay MISSING. */
export async function createProtectedJourney(input){
 const o=ownData(input,['env','directory'],['serve']);resolveLoopConfig(o.env);if(o.serve!==undefined&&typeof o.serve!=='function')fail();
 const healthDescriptor=o.serve&&Object.getOwnPropertyDescriptor(o.serve,'journeyHealth');
 const assetHealth=healthDescriptor&&Object.hasOwn(healthDescriptor,'value')&&typeof healthDescriptor.value==='function'?healthDescriptor.value:null;
 const env=Object.freeze({LOOP_ENV:'local-synthetic'}),directory=await validateJourneyDirectory(o.directory);
 try{await mkdir(directory,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 await components(directory);if(await realpath(directory)!==directory)fail();const stat=await lstat(directory);if(typeof process.getuid==='function'&&(stat.uid!==process.getuid()||(stat.mode&0o077)!==0))fail();
 let lock,db,parentServer,founderServer,generation,review,bridge,cost,master,operatorKey,closing=false,keysUsable=false,closePromise;
 const journals=[],journalByName=new Map(),inbox=[];
 // HTTP admission closes immediately; private key callbacks are not exported.
 // Existing owning operations/journal verification may drain before key destruction.
 const gated=value=>Object.freeze(Object.fromEntries(Object.entries(value).filter(([,v])=>typeof v==='function').map(([k,v])=>[k,async(...args)=>{if(closing)fail();const result=await v.apply(value,args);if(closing)fail();return result;}])));
 async function close(){return closePromise??=(async()=>{
  closing=true;const errors=[];
  for(const s of [parentServer,founderServer])try{await closeHTTP(s);}catch(e){errors.push(e);}
  for(const s of [generation,review,bridge,cost])try{await s?.close?.();}catch(e){errors.push(e);}
  try{await serializeQueueWork(async()=>{});}catch(e){errors.push(e);}
  for(const j of [...journals].reverse())try{await j.close();}catch(e){errors.push(e);}
  try{await db?.close();}catch(e){errors.push(e);}
  // Cost journal close still authenticates marker/history with these private keys.
  // Refuse/wipe only AFTER all journal and DB close attempts, even on failure.
  keysUsable=false;master?.fill(0);operatorKey?.fill(0);
  if(lock){try{await lock.close();await unlink(join(directory,'.journey-lock'));}catch(e){errors.push(e);}lock=null;}
  if(errors.length)throw new AggregateError(errors,'Local synthetic cleanup incomplete.');
 })();}
 try{
  lock=await open(join(directory,'.journey-lock'),'wx',0o600);
  const existing=(await readdir(directory)).filter(n=>n!=='.journey-lock'),fresh=existing.length===0;let owner,operator;
  if(fresh){
   const at=Math.floor(Date.now()/1000)*1000;
   owner={format:'protected-journey-store-v1',directory,state:'initializing',key_digest:null,operator_digest:null,capacity:{policy_version:'TEST-CAPACITY-v1',offer_version:randomUUID(),bucket_id:randomUUID(),starts_at:new Date(at).toISOString(),ends_at:new Date(at+30*86400000).toISOString(),coverage_end:new Date(at+31*86400000).toISOString(),limit:64,synthetic_only:true},journal_files:null};
   await writeNew(join(directory,'owner.json'),JSON.stringify(owner));const keys=randomBytes(64);try{await writeNew(join(directory,'keys.bin'),keys);owner.key_digest=sha(keys);}finally{keys.fill(0);}
   operator={username:'invented-local-founder',password:randomBytes(32).toString('base64url'),totpSecret:new Secret({size:20}).base32};const bytes=Buffer.from(JSON.stringify(operator));await writeNew(join(directory,'operator.json'),bytes);owner.operator_digest=sha(bytes);
   await mkdir(join(directory,'primary'),{mode:0o700});for(const name of names)await mkdir(join(directory,name),{mode:0o700});
  }else{
   if(existing.some(n=>!['owner.json','keys.bin','operator.json','primary',...names].includes(n)))fail();
   owner=ownData(parseStrictJSON((await file(join(directory,'owner.json'))).toString('utf8')),['format','directory','state','key_digest','operator_digest','capacity','journal_files']);
   if(owner.format!=='protected-journey-store-v1'||owner.directory!==directory||owner.state!=='ready'||!/^\w{64}$/.test(owner.key_digest??'')||!/^\w{64}$/.test(owner.operator_digest??''))fail();
   const operatorBytes=await file(join(directory,'operator.json'));if(sha(operatorBytes)!==owner.operator_digest)fail();operator=parseStrictJSON(operatorBytes.toString('utf8'));ownData(owner.journal_files,names);
   for(const name of ['primary',...names]){await components(join(directory,name));if(await realpath(join(directory,name))!==join(directory,name))fail();}
   if(!(await readdir(join(directory,'primary'))).length)fail();
   for(const name of names){const expected=owner.journal_files[name],actual=await readdir(join(directory,name));if(!Array.isArray(expected)||!expected.length||expected.some(n=>typeof n!=='string'||!/^[A-Za-z0-9_.-]+$/.test(n))||JSON.stringify([...expected].sort())!==JSON.stringify(actual.sort()))fail();for(const n of expected)await file(join(directory,name,n));}
  }
  ownData(operator,['username','password','totpSecret']);if(operator.username!=='invented-local-founder'||typeof operator.password!=='string'||operator.password.length<32||!/^[A-Z2-7]{32,128}$/.test(operator.totpSecret))fail();
  const keyBytes=await file(join(directory,'keys.bin'));try{if(keyBytes.length!==64||sha(keyBytes)!==owner.key_digest)fail();master=Buffer.from(keyBytes.subarray(0,32));operatorKey=Buffer.from(keyBytes.subarray(32));keysUsable=true;}finally{keyBytes.fill(0);}
  const household={keyForHousehold:h=>{if(!keysUsable||typeof h!=='string'||!/^[0-9a-f-]{36}$/.test(h))fail();return createHmac('sha256',master).update('journey-household-v1\0'+h).digest();}};
  const keys={...household,keyForOperator:()=>{if(!keysUsable)fail();return Buffer.from(operatorKey);}},continuationKeys={...household,receiptDedupeKey:createHmac('sha256',operatorKey).update('journey-continuation-v1').digest()};
  const clock=()=>Math.floor(Date.now()/1000)*1000;
  db=new PGlite(join(directory,'primary'));await db.waitReady;await migrate(db);if((await db.query('SELECT version FROM schema_migrations WHERE version>17')).rows.length)fail();
  const auth=await createFounderAuth({env,db,clock,sessionTtlMs:3600000});if(fresh)await auth.provisionSyntheticIdentity({...operator,role:'founder'});else{const rows=(await db.query('SELECT username,role FROM founder_identities')).rows;if(rows.length!==1||rows[0].username!==operator.username||rows[0].role!=='founder')fail();}
  const access=await createSyntheticAdultAccess({env,db,clock,policy:{challengeTtlMs:600000,sessionTtlMs:172800000,resendCooldownMs:1000,requestWindowMs:60000,maxRequests:60,maxVerifyAttempts:120},deliver:async value=>{if(closing||!value.email.endsWith('@example.invalid'))fail();if(inbox.length>=256)inbox.shift();inbox.push({...value});}});
  const consent=await createSyntheticConsentService({env,db,access,clock,policyVersion:'TEST-v1'}),setup=await createSyntheticChildSetup({env,db,access,clock,policyVersion:'TEST-v1'}),kernel=createEntitlementKernel({env,clock}),onboarding=await createJourneyOnboarding({env,db,access,setup,kernel,clock});
  async function journal(factory,name,extra={}){const value=await factory({env,directory:join(directory,name),...extra});journals.push(value);journalByName.set(name,value);return value;}
  const capture=await createSyntheticWonderCapture({env,db,access,clock,policyVersion:'TEST-v1',keys:household,journal:await journal(createSyntheticWonderJournal,'wonder')});
  const production=await createSyntheticProductionSubmission({env,db,access,capture,kernel,clock,policyVersion:'TEST-v1',capacity:owner.capacity,keys:household,journal:await journal(createSyntheticProductionJournal,'production',{keys:household})});
  const queue=await createSyntheticRequestQueue({env,db,auth,access,capture,kernel,clock,policyVersion:'TEST-v1',keys,journal:await journal(createSyntheticQueueJournal,'queue',{keys})});
  generation=await createSyntheticGenerationService({env,db,auth,queue,clock,keys:household,limits:MOCK_LIMITS,provider:createSyntheticMockProvider({mode:'valid'}),journal:await journal(createSyntheticGenerationJournal,'generation',{keys})});
  review=await createSyntheticReviewService({env,db,auth,queue,generation,clock,keys:household,journal:await journal(createSyntheticReviewJournal,'review',{keys})});
  bridge=await createSyntheticPrivateBridge({env,db,auth,review,queue,kernel,clock,policyVersion:'TEST-v1',keys:household,journal:await journal(createSyntheticPrivateBridgeJournal,'bridge',{keys})});
  const play=await createSyntheticJourneyPlay({env,db,access,bridge:bridge.familyAdapter,clock,journal:await journal(createSyntheticPlayJournal,'play')});
  const family=await createSyntheticFamilySpace({env,db,access,clock,policyVersion:'TEST-v1',queue,bridge:bridge.familyAdapter,play:play.familyPlay,content:{question:capture.question,revision:async()=>{fail();}}});
  cost=await createSyntheticCostService({env,db,auth,queue,generation,clock,keys:household,journal:await journal(createSyntheticCostJournal,'cost',{keys})});
  const continuation=await createSyntheticContinuationService({env,db,auth,access,clock,keys:continuationKeys,journal:await journal(createSyntheticContinuationJournal,'continuation',{keys:continuationKeys})});continuationKeys.receiptDedupeKey.fill(0);
  const founder=await createJourneyFounder({env,db,auth,review,bridge,play,clock});
  const served=o.serve?async(req,res)=>{if(closing)fail();return o.serve(req,res);}:undefined;
  parentServer=createSyntheticAdultAccessServer({env,access:gated(access),consent:gated(consent),setup:gated(onboarding),capture:gated(capture),production:gated(production),queue:gated(queue),family:gated(family),continuation:gated(continuation),journey:gated({context:play.context,start:play.start,open:play.open,action:play.action,trial:onboarding.ensureTrial}),...(served?{serve:served}:{})});
  founderServer=createSyntheticAuthServer({env,auth:gated(auth),queue:gated(queue),generation:gated(generation),review:gated(review),cost:gated(cost),continuation:gated(continuation),journey:gated(founder)});
  if(fresh){owner.journal_files={};for(const name of names)owner.journal_files[name]=(await readdir(join(directory,name))).sort();owner.state='ready';await replaceOwner(directory,owner);}
  async function readCoreReadiness(){
   try{
    if(closing||!keysUsable)return false;
    const migrations=(await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows;if(migrations.length!==17||migrations.some((r,i)=>Number(r.version)!==i+1))return false;
    const keyFile=await file(join(directory,'keys.bin'));try{if(keyFile.length!==64||sha(keyFile)!==owner.key_digest)return false;}finally{keyFile.fill(0);}
    for(const [name,table,column]of [['queue','queue_journal_namespace','namespace_verifier'],['generation','generation_slice_namespace','namespace_verifier'],['review','review_slice_namespace','namespace_verifier'],['bridge','private_bridge_namespace','namespace_verifier']]){
     const rows=(await db.query('SELECT '+column+' value FROM '+table+' WHERE singleton=true')).rows;if(rows.length!==1||rows[0].value!==journalByName.get(name).namespace_verifier)return false;
    }
    return !closing;
   }catch{return false;}
  }
  return Object.freeze({parentServer,founderServer,close,async getDemoState(){
   if(closing)fail();const coreReady=await readCoreReadiness();let assetsReady=false;
   if(coreReady&&assetHealth)try{const a=await bounded(()=>assetHealth(),6000);assetsReady=a?.kind==='vite-transform-preflight'&&a.ready===true&&Array.isArray(a.checked)&&['/app/main.tsx','/app/LoopAdultAccess.tsx','/app/LoopChildSetup.tsx','/app/LoopFamilyHome.tsx','/app/LoopSavedPlayer.tsx','/@vite/client','/@vite/env'].every(p=>a.checked.includes(p));}catch{}
   if(closing)fail();
   // A transform/namespace check cannot prove Start/save/restart/browser behavior.
   // No WORKING claims are minted from wiring or a caller's bare boolean.
   const simulated=coreReady&&assetsReady?[...simulationStages]:[];
   return {mode:'local-synthetic',production_ready:false,operator:{...operator},mockInbox:inbox.map(x=>({...x})),working:[],simulated,missing:stages.filter(s=>!simulated.includes(s))};
  }});
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Owned local synthetic startup and cleanup failed.');}throw Object.assign(new Error('Owned local synthetic store unavailable.'),{code:'configuration_missing',status:503,cause:error});}
}
