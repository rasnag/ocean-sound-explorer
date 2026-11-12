import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
import {createSyntheticPlayService,validateSyntheticPlayScope} from './play-service.mjs';
import {canonical,exactObject,playError} from './play-journal.mjs';

const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const reject=status=>{throw Object.assign(new Error('Request unavailable.'),{status});};
const pending=()=>({status:'retryable_unacknowledged',mode:'local-synthetic',production_ready:false});
async function readBody(req){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))reject(400);
  const length=req.headers['content-length'];
  if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>8192))reject(400);
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>8192)reject(400);chunks.push(chunk);}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
  catch{reject(400);}
}
/** One trusted, developer-launched invented assignment; no parent authentication. */
export function createSyntheticSavedServer(options){
  const allowed=['db','journal','env','scope','adventure','clock','serve','testHooks'];
  if(!options||Reflect.ownKeys(options).some(k=>!allowed.includes(k)))throw playError('validation_failed');
  const {db,journal,env,scope,adventure,clock=Date.now,serve,testHooks}=options;
  resolveLoopConfig(env);
  const fixed=Object.freeze(validateSyntheticPlayScope(scope));
  if(serve!==undefined&&typeof serve!=='function')throw playError('validation_failed');
  if(testHooks!==undefined){exactObject(testHooks,['beforeRespond']);if(typeof testHooks.beforeRespond!=='function')throw playError('validation_failed');}
  canonical(adventure);
  const spec=structuredClone(adventure);
  if(spec.revision_id!==fixed.revision_id)throw playError('validation_failed');
  const service=createSyntheticPlayService({db,journal,env,clock,catalog:[{
    household_id:fixed.household_id,revision_id:fixed.revision_id,spec,
    starting_path:'medium',starting_reason:'Human-selected medium path for this explicitly invented local synthetic fixture; no child classification.',
  }]});
  const startCommand=s=>Object.freeze({contract_version:'1.1.0',command_id:randomUUID(),play_id:s.play_id,
    consent_epoch:s.consent_epoch,revision_id:s.revision_id,pattern_version:spec.pattern_version,engine_version:spec.engine_version});
  const registry=new Map([[fixed.play_id,{scope:fixed,start:startCommand(fixed),started:false}]]);
  const intents=new Map();
  const known=id=>{const entry=registry.get(id);if(!entry)throw playError('denied');return entry;};
  const resume=entry=>service.resume(entry.scope,{play_id:entry.scope.play_id,revision_id:entry.scope.revision_id,consent_epoch:entry.scope.consent_epoch});
  async function start(entry){
    const result=await service.start(entry.scope,entry.start);
    if(result.status==='acknowledged')entry.started=true;
    return result;
  }
  async function full(entry){
    const result=await resume(entry);
    if(result.status!=='acknowledged')return pending();
    const history=[];
    for(const item of registry.values()){
      // Every entry is currently authorized; denial aborts the entire response.
      const current=await resume(item);
      history.push({play_id:item.scope.play_id,trial_count:current.status==='acknowledged'?current.checkpoint.state.trials.length:null,incomplete:true});
    }
    // History IO must not turn a stale selected checkpoint into current resume.
    const current=await resume(entry);
    if(current.status!=='acknowledged')return pending();
    const selected=history.find(h=>h.play_id===entry.scope.play_id);
    selected.trial_count=current.checkpoint.state.trials.length;
    return {mode:'local-synthetic',production_ready:false,adventure:structuredClone(spec),result:current,history};
  }
  async function operate(route,body){
    if(route==='/saved/open'){
      exactObject(body,['play_id']);
      if(body.play_id!==null&&!uuid(body.play_id))throw playError('validation_failed');
      const entry=known(body.play_id??fixed.play_id);
      if(body.play_id===null&&!entry.started){const result=await start(entry);if(result.status!=='acknowledged')return pending();}
      return full(entry);
    }
    if(route==='/saved/action'){
      exactObject(body,['play_id','command']);
      if(!uuid(body.play_id))throw playError('validation_failed');
      const entry=known(body.play_id);
      return service.commit(entry.scope,body.command);
    }
    exactObject(body,['play_id','command_id']);
    if(!uuid(body.play_id)||!uuid(body.command_id))throw playError('validation_failed');
    const source=known(body.play_id);
    const authorized=await resume(source);
    if(authorized.status!=='acknowledged')return pending();
    let intent=intents.get(body.command_id);
    if(intent&&intent.from_play_id!==body.play_id)throw playError('conflict');
    if(!intent){
      let id;do{id=randomUUID();}while(registry.has(id));
      const nextScope=Object.freeze({...fixed,play_id:id});
      intent=Object.freeze({command_id:body.command_id,from_play_id:body.play_id,new_play_id:id,start_command:startCommand(nextScope)});
      // Retain the intent before any Start can commit or lose its response.
      intents.set(body.command_id,intent);
      registry.set(id,{scope:nextScope,start:intent.start_command,started:false});
    }
    const entry=known(intent.new_play_id);
    const result=await start(entry);
    return result.status==='acknowledged'?full(entry):pending();
  }
  const routes=new Set(['/saved/open','/saved/action','/saved/replay']);
  let tail=Promise.resolve();
  const serial=fn=>{const next=tail.then(fn);tail=next.catch(()=>{});return next;};
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:10000},async(req,res)=>{
    const api=(req.url??'').startsWith('/saved');
    const headers=()=>{
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Security-Policy',"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    };
    const send=(status,value)=>{if(!res.destroyed&&!res.writableEnded){headers();res.statusCode=status;res.end(JSON.stringify(value));}};
    try{
      const address=server.address();
      if(!address||typeof address==='string'||address.address!=='127.0.0.1')reject(403);
      const host='127.0.0.1:'+address.port;
      const count=name=>req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()===name).length;
      if(count('host')!==1||req.headers.host!==host)reject(403);
      if(count('origin')>1||(req.headers.origin!==undefined&&req.headers.origin!=='http://'+host))reject(403);
      const readonlyAssets=!api&&typeof serve==='function'&&['GET','HEAD'].includes(req.method);
      for(let i=0;i<req.rawHeaders.length;i+=2){
        const name=req.rawHeaders[i].toLowerCase();
        const identity=name!=='user-agent'&&/^(?:x-)?(?:household|child|assignment|play|revision|consent|identity|user)(?:-|$)/.test(name);
        if(name==='authorization'||name==='proxy-authorization'||(name==='cookie'&&!readonlyAssets)||name==='forwarded'||name.startsWith('x-forwarded-')||identity)reject(403);
      }
      if(!api){
        if(readonlyAssets){
          // Incidental browser cookies confer no authority over public local
          // assets and are not passed to their trusted development handler.
          delete req.headers.cookie;
          for(let i=req.rawHeaders.length-2;i>=0;i-=2)if(req.rawHeaders[i].toLowerCase()==='cookie')req.rawHeaders.splice(i,2);
          res.setHeader('Cache-Control','no-store');
          await serve(req,res);if(res.writableEnded||res.headersSent)return;
        }
        reject(404);
      }
      // The asset callback never sees the saved namespace, even malformed URLs.
      if(req.method!=='POST'||!routes.has(req.url))reject(404);
      const body=await readBody(req);
      await serial(async()=>{
        const result=await operate(req.url,body);
        if(testHooks)await testHooks.beforeRespond(structuredClone({route:req.url,body,result}));
        const acknowledged=result?.status==='acknowledged'||result?.result?.status==='acknowledged';
        send(acknowledged?200:503,acknowledged?result:pending());
      });
    }catch(error){
      const status=error?.status??({validation_failed:400,denied:403,conflict:409}[error?.code]??503);
      send(status,status===503?pending():{error:status===409?'Conflict. Reload confirmed progress.':'Request unavailable.'});
    }
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=10000;
  server.on('timeout',socket=>socket.destroy());
  const listen=server.listen;
  server.listen=function(...args){
    const first=args[0],object=first&&typeof first==='object';
    const port=object?first.port:first,host=object?first.host:args[1];
    if(!Number.isInteger(port)||port<0||port>65535||host!=='127.0.0.1'
      ||(object&&Reflect.ownKeys(first).some(k=>!['port','host','backlog','exclusive','ipv6Only'].includes(k)))
      ||(!object&&args.length>4))throw new Error('Explicit127.0.0.1 binding required.');
    return listen.apply(this,args);
  };
  server.on('clientError',(_error,socket)=>socket.end("HTTP/1.1 400 Bad Request\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"));
  return server;
}
