// Actual local CLI. Importing this module creates no server or process hook.
import {createInterface} from 'node:readline';
import {readFile,lstat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {TOTP,Secret} from 'otpauth';
import {startJourneyDemo} from './journey-demo.mjs';
import {createProtectedJourney,validateJourneyDirectory} from './journey-composition.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
export async function runJourneyLocal(args=process.argv.slice(2)){
 if(args.length>1||!process.stdin.isTTY)throw new Error('Use an interactive local terminal: node server/journey-local.mjs [absolute-owned-store-directory]');
 const directory=await validateJourneyDirectory(args[0]??join(dirname(root),'journey-local-store'));
 let assets,assetsClosed=false;
 const createAssets=async()=>{
  const {createServer}=await import('vite');
  const vite=await createServer({configFile:false,root,mode:'development',appType:'spa',define:{'import.meta.env.VITE_LOOP_PREVIEW':JSON.stringify('1')},server:{middlewareMode:true,hmr:false,ws:false,fs:{strict:true,allow:[root]}}});
  async function close(){if(assetsClosed)return;assetsClosed=true;await vite.close();}
  assets={close,async serve(req,res,next){
   try{
    const url=new URL(req.url,'http://127.0.0.1'),path=url.pathname;
    const preview=/^\/loop-preview(?:\/(?:join|setup|family))?\/?$/.test(path);
    const virtual=['/@vite/client','/@react-refresh'].includes(path)||path.startsWith('/@id/__x00__');
    const source=/^\/(?:app|lib|components)\/[A-Za-z0-9_./-]+\.(?:tsx?|m?js|css)$/.test(path);
    const dependency=/^\/node_modules\/\.vite\/deps\/[A-Za-z0-9_.-]+\.(?:js|map)$/.test(path);
    if(req.method!=='GET'||path.includes('%')||path.split('/').some(s=>s==='.'||s==='..')||!(preview||virtual||source||dependency))return next();
    if(source||dependency){let p=join(root,path.slice(1));while(p!==root){const stat=await lstat(p);if(stat.isSymbolicLink())throw Error();p=dirname(p);}}
    if(preview){const html=await vite.transformIndexHtml(path,await readFile(join(root,'index.html'),'utf8'));res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
    vite.middlewares(req,res,next);
   }catch{next(new Error('Local assets unavailable.'));}
  }};return assets;
 };
 const demo=await startJourneyDemo({env:{LOOP_ENV:'local-synthetic'},directory,createAssets,createProtectedJourney:async config=>{
  const core=await createProtectedJourney(config);
  // Worker closes HTTP first. This wrapper then closes Vite before the core.
  return {...core,close:async()=>{try{await assets?.close();}finally{await core.close();}}};
 }});
 const lines=createInterface({input:process.stdin,output:process.stdout});let stopped=false;
 const stop=async()=>{if(stopped)return;stopped=true;lines.close();try{await demo.close();process.stdout.write('Stopped. The owned synthetic store was preserved.\n');}catch{process.stderr.write('Stopped with incomplete cleanup; inspect local resources before restarting.\n');process.exitCode=1;}};
 process.stdout.write('LOCAL SYNTHETIC ONLY — use invented data.\nParent: '+demo.parentOrigin+'\nFounder: '+demo.founderOrigin+'\nCommands: inbox | operator | status | quit\nStore preserved across restart. No real email, AI, payment or scientific approval.\n');
 lines.on('line',line=>{void (async()=>{
  const command=line.trim();if(command==='quit')return stop();if(stopped)return;
  const s=await demo.getDemoState();
  if(command==='operator'){const otp=new TOTP({secret:Secret.fromBase32(s.operator.totpSecret),algorithm:'SHA1',digits:6,period:30}).generate();process.stdout.write('Invented founder username: '+s.operator.username+'\nPassword: '+s.operator.password+'\nCurrent code: '+otp+'\n');}
  else if(command==='inbox'){for(const x of s.mockInbox)process.stdout.write(JSON.stringify(x)+'\n');if(!s.mockInbox.length)process.stdout.write('No invented challenges captured in this process. Request a new challenge after a restart.\n');}
  else if(command==='status')process.stdout.write(JSON.stringify({mode:s.mode,production_ready:s.production_ready,working:s.working,simulated:s.simulated,missing:s.missing})+'\n');
  else process.stdout.write('Commands: inbox | operator | status | quit\n');
 })().catch(()=>process.stderr.write('Local console operation unavailable.\n'));});
 lines.once('close',()=>{void stop();});
 const signal=()=>{void stop();};process.once('SIGINT',signal);process.once('SIGTERM',signal);
 return {parentOrigin:demo.parentOrigin,founderOrigin:demo.founderOrigin,async close(){process.off('SIGINT',signal);process.off('SIGTERM',signal);await stop();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runJourneyLocal().catch(()=>{process.stderr.write('Local journey did not start. Use an interactive terminal and a dedicated canonical store outside the application. Existing or partial stores are never reset automatically.\n');process.exitCode=1;});
