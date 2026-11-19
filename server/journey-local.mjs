// Actual local CLI. Importing this module creates no listener or process hook.
import {createInterface} from 'node:readline';
import {readFile,lstat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TOTP,Secret} from 'otpauth';
import {startJourneyDemo} from './journey-demo.mjs';
import {createProtectedJourney,validateJourneyDirectory} from './journey-composition.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const progressDependency='/node_modules/.vite/deps/@base-ui_react_progress.js';
const progressMap=progressDependency+'.map';
// Vite's physical client environment module also needs this confined route.
const dependencyPath=path=>path===progressDependency||path===progressMap||path==='/node_modules/vite/dist/client/env.mjs'||/^\/node_modules\/\.vite\/deps\/[A-Za-z0-9_.-]+\.(?:js|map)$/.test(path);
async function confinedStat(path){
 let p=join(root,path.slice(1)),leaf;
 while(p!==root){
  const stat=await lstat(p);
  if(stat.isSymbolicLink())throw Error('Linked asset unavailable.');
  leaf??=stat;
  p=dirname(p);
 }
 return leaf;
}
const critical=['/app/main.tsx','/app/page.tsx','/components/ui/progress.tsx','/app/LoopAdultAccess.tsx','/app/LoopChildSetup.tsx','/app/LoopFamilyHome.tsx','/app/LoopSavedPlayer.tsx','/@vite/client','/@vite/env'];
async function bounded(work,ms){let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Asset preflight timed out.')),ms);})]);}finally{clearTimeout(timer);}}
/** Real project config, bounded read-only transforms, and no listening Vite server. */
export async function createJourneyAssets(){
 const {createServer}=await import('vite');
 const vite=await createServer({configFile:join(root,'vite.config.ts'),root,mode:'development',appType:'spa',define:{'import.meta.env.VITE_LOOP_PREVIEW':JSON.stringify('1')},server:{middlewareMode:true,hmr:false,ws:false,fs:{strict:true,allow:[root]}}});
 let closed=false,closePromise;
 const close=()=>closePromise??=(async()=>{closed=true;await vite.close();})();
 async function health(){
  const checked=[];
  try{
   if(closed||vite.config.server.hmr!==false||vite.config.server.ws!==false||vite.config.server.fs.strict!==true||vite.config.server.fs.allow.length!==1||resolve(vite.config.server.fs.allow[0])!==root)throw Error('Asset configuration unavailable.');
   await bounded(async()=>{
    let progressImport;
    for(const path of critical){
     if(closed)throw Error();
     const result=await vite.transformRequest(path);
     if(!result||typeof result.code!=='string'||!result.code.trim())throw Error('Critical module unavailable.');
     if(path==='/components/ui/progress.tsx'){
      progressImport=[...result.code.matchAll(/\bimport\s+(?:[^;\n]*?\sfrom\s*)?["']([^"']+)["']/g)]
       .map(match=>match[1]).find(value=>value===progressDependency||value.startsWith(progressDependency+'?v=')&&/^[a-f0-9]+$/.test(value.slice(progressDependency.length+3)));
     }
     checked.push(path);
    }
    if(!progressImport||!dependencyPath(progressDependency)||!dependencyPath(progressMap))throw Error('Progress dependency route unavailable.');
    // Use the generated URL, including Vite's version, to resolve the optimized
    // module and wait for its generation without binding an HTTP listener.
    const optimized=await vite.transformRequest(progressImport);
    if(!optimized||typeof optimized.code!=='string'||!optimized.code.trim())throw Error('Progress dependency unavailable.');
    for(const path of [progressDependency,progressMap]){
     const stat=await confinedStat(path);
     if(!stat?.isFile()||stat.size===0)throw Error('Progress asset unavailable.');
     checked.push(path);
    }
   },5000);
   return {kind:'vite-transform-preflight',ready:!closed,checked};
  }catch{return {kind:'vite-transform-preflight',ready:false,checked};}
 }
 async function serve(req,res,next){
  try{
   if(closed)throw Error();const url=new URL(req.url,'http://127.0.0.1'),path=url.pathname;
   const preview=/^\/loop-preview(?:\/(?:join|setup|family))?\/?$/.test(path);
   const virtual=['/@vite/client','/@vite/env','/@react-refresh','/@id/__x00__react-refresh'].includes(path);
   const source=/^\/(?:app|lib|components)\/[A-Za-z0-9_./-]+\.(?:tsx?|m?js|css)$/.test(path);
   const dependency=dependencyPath(path);
   if(req.method!=='GET'||path.includes('%')||path.split('/').some(s=>s==='.'||s==='..')||[...url.searchParams.keys()].some(k=>!['v','t','import'].includes(k))||!(preview||virtual||source||dependency))return next();
   if(source||dependency)await confinedStat(path);
   if(preview){const html=await vite.transformIndexHtml(path,await readFile(join(root,'index.html'),'utf8'));res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
   vite.middlewares(req,res,next);
  }catch{next(new Error('Local assets unavailable.'));}
 }
 try{const initial=await health();if(!initial.ready)throw Error('Critical asset preflight failed.');return Object.freeze({serve,close,health});}catch(e){await close();throw e;}
}
/** Called only behind the parent's real Host/Origin/cookie/header guard.
 * The frozen launcher omits /@vite/env; this exact Root seam supplies that one
 * Vite module without changing the worker or broadening its asset namespace. */
export function journeyAssetSeam(delegate,assets){
 const serve=async(req,res)=>{
  if(req.url==='/@vite/env')return new Promise(done=>{
   const finish=()=>{res.off('finish',finish);res.off('close',finish);done();};res.once('finish',finish);res.once('close',finish);
   assets.serve(req,res,error=>{if(!res.headersSent){res.statusCode=error?503:404;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(error?'Local assets unavailable.':'Not found.');}else res.destroy();});
  });
  return delegate(req,res);
 };
 Object.defineProperty(serve,'journeyHealth',{value:()=>assets.health()});return serve;
}
export async function runJourneyLocal(args=process.argv.slice(2)){
 if(args.length>1||!process.stdin.isTTY)throw new Error('Use an interactive local terminal: node server/journey-local.mjs [absolute-owned-store-directory]');
 const directory=await validateJourneyDirectory(args[0]??join(dirname(root),'journey-local-store'));let assets;
 const demo=await startJourneyDemo({env:{LOOP_ENV:'local-synthetic'},directory,createAssets:async()=>{assets=await createJourneyAssets();return {serve:assets.serve,close:assets.close};},createProtectedJourney:async config=>{
  const core=await createProtectedJourney({...config,serve:journeyAssetSeam(config.serve,assets)});
  return {...core,close:async()=>{try{await assets.close();}finally{await core.close();}}};
 }});
 const lines=createInterface({input:process.stdin,output:process.stdout});let stopped=false,stopPromise;
 const stop=()=>stopPromise??=(async()=>{stopped=true;lines.close();try{await demo.close();process.stdout.write('Stopped. The owned synthetic store was preserved.\n');}catch{process.stderr.write('Stopped with incomplete cleanup; preserve the store and inspect local resources before restarting.\n');process.exitCode=1;}})();
 process.stdout.write('LOCAL SYNTHETIC ONLY — use invented data.\nParent: '+demo.parentOrigin+'\nFounder: '+demo.founderOrigin+'\nCommands: inbox | operator | status | quit\nStartup checks are not full browser proof; unverified stages remain MISSING.\nStore preserved across restart. No real email, AI, payment or scientific approval.\n');
 lines.on('line',line=>{void(async()=>{
  const command=line.trim();if(command==='quit')return stop();if(stopped)return;const s=await demo.getDemoState();
  if(command==='operator'){const otp=new TOTP({secret:Secret.fromBase32(s.operator.totpSecret),algorithm:'SHA1',digits:6,period:30}).generate();process.stdout.write('Invented founder username: '+s.operator.username+'\nPassword: '+s.operator.password+'\nCurrent code: '+otp+'\n');}
  else if(command==='inbox'){for(const x of s.mockInbox)process.stdout.write(JSON.stringify(x)+'\n');if(!s.mockInbox.length)process.stdout.write('No invented challenges captured in this process. Request a new challenge after a restart.\n');}
  else if(command==='status')process.stdout.write(JSON.stringify({mode:s.mode,production_ready:s.production_ready,working:s.working,simulated:s.simulated,missing:s.missing})+'\n');
  else process.stdout.write('Commands: inbox | operator | status | quit\n');
 })().catch(()=>process.stderr.write('Local console operation unavailable.\n'));});
 lines.once('close',()=>{void stop();});const signal=()=>{void stop();};process.once('SIGINT',signal);process.once('SIGTERM',signal);
 return {parentOrigin:demo.parentOrigin,founderOrigin:demo.founderOrigin,async close(){process.off('SIGINT',signal);process.off('SIGTERM',signal);await stop();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runJourneyLocal().catch(()=>{process.stderr.write('Local journey did not start. Use an interactive terminal and a dedicated canonical store outside the application. Existing or partial stores are never reset automatically.\n');process.exitCode=1;});
