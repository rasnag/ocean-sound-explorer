import http from 'node:http';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
import {validateSyntheticPlayScope} from './play-service.mjs';

const reject=status=>{throw Object.assign(new Error('Request unavailable.'),{status});};
async function readBody(req) {
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??'')) reject(400);
  const length=req.headers['content-length'];
  if(length!==undefined && (!/^\d+$/.test(length)||Number(length)>8192)) reject(413);
  let size=0;const chunks=[];
  for await(const chunk of req) {
    size+=chunk.length;if(size>8192) reject(413);chunks.push(chunk);
  }
  try {
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    if(!value||typeof value!=='object'||Array.isArray(value)) reject(400);
    return value;
  } catch { reject(400); }
}
/** Developer-issued opaque capabilities are synthetic fixtures, not adult identity proof. */
export function createSyntheticPlayServer({service,env,capabilities}) {
  resolveLoopConfig(env);
  if(!service||['start','commit','resume'].some(k=>typeof service[k]!=='function')||!(capabilities instanceof Map)||!capabilities.size) throw new TypeError('Invalid synthetic server configuration.');
  const scopes=new Map();
  for(const [token,scope] of capabilities) {
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||Buffer.from(token,'base64url').toString('base64url')!==token) throw new TypeError('Invalid synthetic capability.');
    scopes.set(token,Object.freeze(validateSyntheticPlayScope(scope)));
  }
  const routes=new Map([['/play/start','start'],['/play/action','commit'],['/play/resume','resume']]);
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:10000},async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const send=(status,value)=>{if(!res.destroyed&&!res.writableEnded){res.statusCode=status;res.end(JSON.stringify(value));}};
    try {
      const address=server.address();
      if(!address||typeof address==='string'||address.address!=='127.0.0.1') reject(403);
      const expected='127.0.0.1:'+address.port;
      const count=name=>req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()===name).length;
      if(count('host')!==1||req.headers.host!==expected) reject(403);
      if(count('origin')>1 || (req.headers.origin!==undefined&&req.headers.origin!=='http://'+expected)) reject(403);
      for(let i=0;i<req.rawHeaders.length;i+=2) {
        const name=req.rawHeaders[i].toLowerCase();
        // User-Agent describes the HTTP client and supplies no identity authority.
        // Keep rejecting every other matching identity header, including X-User-Agent.
        const identityHeader=name!=='user-agent'
          && /^(?:x-)?(?:household|child|assignment|play|revision|consent|identity|user)(?:-|$)/.test(name);
        if(name==='forwarded'||name.startsWith('x-forwarded-')||name==='cookie'||name==='proxy-authorization'
          || identityHeader) reject(403);
      }
      if(req.method!=='POST'||!routes.has(req.url)) reject(404);
      if(count('authorization')!==1) reject(401);
      const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization??'');
      if(!match) reject(401);
      const scope=scopes.get(match[1]);
      if(!scope) reject(403);
      const body=await readBody(req);
      const result=await service[routes.get(req.url)]({...scope},body);
      send(result?.status==='retryable_unacknowledged'?503:200,result);
    } catch(error) {
      const statuses={validation_failed:400,denied:403,conflict:409,recovery_required:503,journal_unavailable:503};
      const status=error?.status??statuses[error?.code]??503;
      send(status,{error:status===503?'Play recovery unavailable.':'Request unavailable.',code:statuses[error?.code]?error.code:status===503?'recovery_required':'denied'});
    }
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=10000;
  server.on('timeout',socket=>socket.destroy());
  const listen=server.listen;
  server.listen=function(...args) {
    const first=args[0],object=first&&typeof first==='object';
    const port=object?first.port:first,host=object?first.host:args[1];
    if(!Number.isInteger(port)||port<0||port>65535||host!=='127.0.0.1'
      || (object&&Reflect.ownKeys(first).some(k=>!['port','host','backlog','exclusive','ipv6Only'].includes(k)))
      || (!object&&args.length>4)) throw new Error('Explicit127.0.0.1 binding required.');
    return listen.apply(this,args);
  };
  server.on('clientError',(_error,socket)=>socket.end("HTTP/1.1 400 Bad Request\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"));
  return server;
}
