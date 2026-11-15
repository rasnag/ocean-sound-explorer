// Local composition facade only. Protected workflow and persistent stores belong to the integrator.
import {Server} from 'node:http';
import {realpathSync} from 'node:fs';
import {dirname,basename,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';

const STAGES=Object.freeze(['signup','setup','trial','capture','submit','mock-generation','review','readiness','play','save','reload','resume','activity']);
const LABELS=Object.freeze(['Parent sign-in','Child setup','Test trial','Save a wonder','Submit for production','Mock generation','TEST review','Make privately ready','Play','Save a try','Reload','Resume','Activity record']);
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const unavailable=()=>Object.assign(new Error('Local demo unavailable.'),{code:'demo_unavailable'});
const invalid=()=>Object.assign(new Error('Invalid local demo configuration.'),{code:'invalid_configuration'});
function data(value,required,optional=[]){
 if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw invalid();
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 if(keys.some(k=>typeof k!=='string'||![...required,...optional].includes(k)||!Object.hasOwn(descriptors[k],'value'))||required.some(k=>!Object.hasOwn(descriptors,k)))throw invalid();
 return Object.fromEntries(keys.map(k=>[k,descriptors[k].value]));
}
const string=(x,max=2048)=>{if(typeof x!=='string'||x.length>max)throw invalid();return x;};
function array(value,max){
 if(!Array.isArray(value)||types.isProxy(value)||value.length>max)throw invalid();
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
 if(keys.length!==value.length+1||keys.some(k=>typeof k!=='string'||k!=='length'&&!/^(?:0|[1-9]\d*)$/.test(k)||!Object.hasOwn(descriptors[k],'value')))throw invalid();
 return Array.from({length:value.length},(_,i)=>{if(!Object.hasOwn(descriptors,String(i)))throw invalid();return descriptors[i].value;});
}
function canonical(path){
 let current=resolve(path),tail=[];
 for(;;){try{return resolve(realpathSync.native(current),...tail.reverse());}catch(e){if(e.code!=='ENOENT')throw invalid();const parent=dirname(current);if(parent===current)throw invalid();tail.push(basename(current));current=parent;}}
}
function storagePath(path){
 if(typeof path!=='string'||!isAbsolute(path)||path.includes('\0'))throw invalid();
 const source=canonical(root),target=canonical(path),rel=relative(source,target);
 if(!rel||!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../'))throw invalid();
 return target;
}
function state(value){
 const x=data(value,['mode','production_ready','operator','mockInbox','working','simulated','missing']);
 if(x.mode!=='local-synthetic'||x.production_ready!==false)throw invalid();
 const operator=data(x.operator,['username','password','totpSecret']);for(const k of Object.keys(operator))string(operator[k],4096);
 const mockInbox=array(x.mockInbox,256).map(item=>{const row=data(item,['email','token','purpose']);for(const k of Object.keys(row))string(row[k],4096);return row;});
 const seen=new Set(),result={mode:x.mode,production_ready:false,operator,mockInbox};
 for(const key of ['working','simulated','missing']){
  const list=array(x[key],STAGES.length);
  result[key]=list.map(id=>{if(typeof id!=='string'||!STAGES.includes(id)||seen.has(id))throw invalid();seen.add(id);return id;});
 }
 return result;
}
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(info,parentOrigin,founderOrigin){
 const states=new Map();for(const [key,label]of [['working','WORKING'],['simulated','SIMULATED'],['missing','MISSING']])for(const id of info[key])states.set(id,label);
 const rows=STAGES.map((id,i)=>`<tr><th scope="row">${LABELS[i]}</th><td>${states.get(id)??'MISSING'}</td></tr>`).join('');
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Try Curiosity Engine locally</title><style>body{font:18px/1.55 system-ui;color:#183b36;background:#f5f6ef;max-width:900px;margin:auto;padding:24px}a{color:#075e54}nav{display:flex;gap:16px;flex-wrap:wrap}.start{display:inline-block;background:#075e54;color:white;padding:12px 20px;border-radius:8px}.banner{background:#fff0cf;padding:16px;border-left:5px solid #b16c00}section{margin:26px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid #c8d4ca}code{overflow-wrap:anywhere}*:focus-visible{outline:3px solid #b16c00}</style><main><p class="banner"><strong>LOCAL SYNTHETIC ONLY — invented data.</strong> No real email, AI provider, payments or scientific content approval. Do not enter real family information.</p><h1>Try one family journey</h1><nav aria-label="Choose your role"><a class="start" href="${escape(parentOrigin)}/loop-preview/join">Start as the parent</a><a href="${escape(founderOrigin)}/login">Open founder sign-in</a></nav><section><h2>Follow the same request</h2><ol><li>Use an invented parent address. In the local runner console, type <code>inbox</code> to obtain its simulated verification code.</li><li>Review TEST permissions, <a href="/loop-preview/setup">set up an invented child</a>, then use the explicit test-trial control in the <a href="/loop-preview/family">family page</a>.</li><li>Type: <q>What changes make this pretend platform tip?</q> Save it, then explicitly submit it for production.</li><li>Type <code>operator</code> in the local console for invented founder sign-in and a current code. In the <a href="${escape(founderOrigin)}/founder/queue">queue</a>, accept that same request.</li><li>Use the <a href="${escape(founderOrigin)}/founder/generation">mock generation workbench</a>, then the <a href="${escape(founderOrigin)}/founder/review">TEST review workbench</a>. Make the same revision privately ready through the integrated control.</li><li>Return to the family page. Play, wait for acknowledged save, reload and resume the same play, then inspect its activity. A MISSING capability below must not be treated as completed.</li></ol><p>The fixed toy balance/tips output is not real AI or a scientifically validated answer. An unrelated question remains a mismatch; its original words must not be silently changed.</p></section><section><h2>Demo capabilities</h2><p>Reported by the integrator, not observed completion. WORKING means code capability; SIMULATED means a fixture substitute; MISSING means absent or unverified. Even working code uses simulated verification, permissions, offers, provider output and TEST review.</p><table><thead><tr><th>Stage</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></section><p>No passwords, TOTP seeds or mock codes are served on this page. Obtain them only from the local runner console. Closing the demo preserves its local store.</p></main></html>`;
}
function respond(res,status,body='Local demo unavailable.'){
 if(res.writableEnded||res.destroyed)return;
 if(res.headersSent){res.destroy();return;}
 res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'"});res.end(body);
}
function requestAllowed(req){
 const address=req.socket?.localAddress,port=req.socket?.localPort;if(address!=='127.0.0.1'||!Number.isInteger(port))return false;
 const count=name=>req.rawHeaders.filter((_,i)=>i%2===0&&req.rawHeaders[i].toLowerCase()===name).length;
 const origin=`http://127.0.0.1:${port}`;
 return count('host')===1&&req.headers.host===`127.0.0.1:${port}`&&count('origin')<=1&&(req.headers.origin===undefined||req.headers.origin===origin);
}
function assetAllowed(raw){
 if(typeof raw!=='string'||!raw.startsWith('/')||raw.startsWith('//')||/[\\#\x00-\x20\x7f]/.test(raw))return false;
 const path=raw.split('?')[0];if(path.includes('%')||path.split('/').some(s=>s==='.'||s==='..'))return false;
 const url=new URL(raw,'http://127.0.0.1');if([...url.searchParams.keys()].some(k=>!['v','t','import'].includes(k)))return false;
 return /^\/loop-preview(?:\/(?:join|setup|family))?\/?$/.test(path)||['/app/','/lib/','/components/','/node_modules/','/@id/__x00__'].some(p=>path.startsWith(p))||['/@vite/client','/@react-refresh'].includes(path);
}
function deadline(work,ms){let timer;return Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(unavailable()),ms);timer.unref?.();})]).finally(()=>clearTimeout(timer));}
function listen(server,port){return new Promise((done,reject)=>{const error=()=>{server.removeListener('listening',ready);reject(unavailable());};const ready=()=>{server.removeListener('error',error);const a=server.address();if(!a||typeof a==='string'||a.address!=='127.0.0.1'){reject(unavailable());return;}done(`http://127.0.0.1:${a.port}`);};server.once('error',error);server.once('listening',ready);try{server.listen(port,'127.0.0.1');}catch{server.removeListener('error',error);server.removeListener('listening',ready);reject(unavailable());}});}
async function closeServer(server){
 if(!(server instanceof Server))return;
 await new Promise((done,reject)=>{let timer;const ended=error=>{clearTimeout(timer);if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')reject(unavailable());else done();};try{timer=setTimeout(()=>{server.closeAllConnections?.();},250);timer.unref?.();server.close(ended);server.closeIdleConnections?.();server.closeAllConnections?.();}catch{clearTimeout(timer);reject(unavailable());}});
}

/** No workflow seeds, SQL, credential output, process hooks or import-time listeners. */
export async function startJourneyDemo(options){
 const x=data(options,['env','directory','createProtectedJourney'],['createAssets','parentPort','founderPort','timeoutMs']);
 if(!x.env||typeof x.env!=='object'||types.isProxy(x.env)||Array.isArray(x.env)||![Object.prototype,null].includes(Object.getPrototypeOf(x.env)))throw invalid();
 data(x.env,['LOOP_ENV'],Object.keys(x.env).filter(k=>k!=='LOOP_ENV'));resolveLoopConfig(x.env);
 const env=Object.freeze({LOOP_ENV:'local-synthetic'}),directory=storagePath(x.directory),parentPort=x.parentPort??0,founderPort=x.founderPort??0,timeoutMs=x.timeoutMs??10000;
 const port=p=>Number.isInteger(p)&&(p===0||p>=1024&&p<=65535);
 if(typeof x.createProtectedJourney!=='function'||x.createAssets!==undefined&&typeof x.createAssets!=='function'||!port(parentPort)||!port(founderPort)||parentPort!==0&&parentPort===founderPort||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw invalid();
 let assets,core,parentOrigin='',founderOrigin='',closing=false,closePromise;
 const getDemoState=async()=>{if(closing||!core)throw unavailable();try{const result=state(await deadline(()=>core.getDemoState(),timeoutMs));if(closing)throw unavailable();return structuredClone(result);}catch{throw unavailable();}};
 const close=()=>closePromise??=(async()=>{closing=true;const errors=[];for(const s of new Set([core?.parentServer,core?.founderServer]))try{await closeServer(s);}catch{errors.push(new Error('HTTP cleanup failed.'));}try{await core?.close();}catch{errors.push(new Error('Core cleanup failed.'));}try{await assets?.close();}catch{errors.push(new Error('Asset cleanup failed.'));}if(errors.length)throw new AggregateError(errors,'Local demo cleanup failed.');})();
 const serve=async(req,res)=>{
  try{
   if(closing||!requestAllowed(req)){respond(res,403);return;}
   if(req.method!=='GET'){respond(res,405);return;}
   if(req.url==='/'){
    if(!parentOrigin||!founderOrigin){respond(res,503);return;}if(parentOrigin!==`http://127.0.0.1:${req.socket.localPort}`){respond(res,404,'Not found.');return;}
    const info=await getDemoState();respond(res,200,page(info,parentOrigin,founderOrigin));return;
   }
   if(!assetAllowed(req.url)||!assets){respond(res,404,'Not found.');return;}
   await new Promise(done=>{let timer;const complete=()=>{clearTimeout(timer);res.off('finish',complete);res.off('close',complete);done();};res.once('finish',complete);res.once('close',complete);timer=setTimeout(()=>{respond(res,503);if(!res.writableEnded)res.destroy();},timeoutMs);timer.unref?.();try{const result=assets.serve(req,res,error=>respond(res,error?503:404,error?'Local demo unavailable.':'Not found.'));Promise.resolve(result).catch(()=>respond(res,503));}catch{respond(res,503);}if(res.writableEnded||res.destroyed)complete();});
  }catch{respond(res,503);}
 };
 try{
  if(x.createAssets){assets=await x.createAssets();const a=data(assets,['serve','close']);if(typeof a.serve!=='function'||typeof a.close!=='function')throw invalid();}
  core=await x.createProtectedJourney({env,directory,serve});const c=data(core,['parentServer','founderServer','close','getDemoState']);
  if(!(c.parentServer instanceof Server)||!(c.founderServer instanceof Server)||c.parentServer===c.founderServer||c.parentServer.listening||c.founderServer.listening||typeof c.close!=='function'||typeof c.getDemoState!=='function')throw invalid();
  parentOrigin=await listen(c.parentServer,parentPort);founderOrigin=await listen(c.founderServer,founderPort);
  return Object.freeze({parentOrigin,founderOrigin,close,getDemoState});
 }catch{try{await close();}catch{}throw unavailable();}
}
