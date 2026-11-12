import http from 'node:http';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';

const deny = status => Object.assign(new Error('Request denied.'),{status});
const tokenOK = value => typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value)
  && Buffer.from(value,'base64url').toString('base64url')===value;
const cookieName='loop_adult_session';
const clearCookie=`${cookieName}=; HttpOnly; SameSite=Strict; Path=/adult; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
function cookies(req) {
  const header=req.headers.cookie;
  if (header===undefined) return undefined;
  if (typeof header!=='string' || header.length>4096) throw deny(400);
  const seen=new Set(); let token;
  for (const part of header.split(';')) {
    const match=/^\s*([!#$%&'*+.^_`|~0-9A-Za-z-]+)=([\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*)\s*$/.exec(part);
    if (!match || seen.has(match[1])) throw deny(400);
    seen.add(match[1]);
    if (match[1]===cookieName) {
      if (!tokenOK(match[2])) throw deny(400);
      token=match[2];
    } // Other well-formed cookies never supply adult authority.
  }
  return token;
}
async function body(req,keys) {
  const length=req.headers['content-length'];
  if (length!==undefined && (!/^\d+$/.test(length) || Number(length)>4096)) throw deny(413);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) throw deny(415);
  if (req.headers['content-encoding']!==undefined) throw deny(415);
  const chunks=[];let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>4096) throw deny(413);
    chunks.push(chunk);
  }
  let value;
  try { value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))); }
  catch { throw deny(400); }
  if (!value || typeof value!=='object' || Array.isArray(value)
    || !(Array.isArray(keys[0])?keys:[keys]).some(shape=>Object.keys(value).length===shape.length&&shape.every(key=>Object.hasOwn(value,key)))) throw deny(400);
  return value;
}
function assetPath(url) {
  const allowed=url.pathname==='/' || /^\/loop-preview(?:\/(?:join|setup|family))?\/?$/.test(url.pathname)
    || /^\/(?:app|lib|components|node_modules)\//.test(url.pathname)
    || /^\/@(?:vite\/client|react-refresh|id\/)/.test(url.pathname);
  return allowed && [...url.searchParams.keys()].every(key=>['v','t','import'].includes(key));
}

/** Local HTTP only; production identity and cookie policy are unconfigured. */
export function createSyntheticAdultAccessServer(options={}) {
  resolveLoopConfig(options?.env);
  if (!options || typeof options!=='object' || Array.isArray(options)
    || Object.keys(options).some(key=>!['access','env','serve','consent','setup','family'].includes(key))) throw deny(400);
  const {access,serve,consent,setup,family}=options;
  if (!access || ['request','verify','session','logout'].some(key=>typeof access[key]!=='function')
    || (serve!==undefined && typeof serve!=='function')) throw deny(400);
  if(consent!==undefined&&(!consent||['status','record','withdraw'].some(k=>typeof consent[k]!=='function')))throw deny(400);
  if(setup!==undefined&&(!setup||['status','save'].some(k=>typeof setup[k]!=='function')))throw deny(400);
  if(family!==undefined&&(!family||['index','read','open'].some(k=>typeof family[k]!=='function')))throw deny(400);
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:10000},async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,value)=>{
      if (res.writableEnded || res.destroyed) return;
      res.statusCode=status;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(JSON.stringify(value));
    };
    try {
      const address=server.address();
      if (!address || typeof address==='string' || address.address!=='127.0.0.1') throw deny(403);
      const host=`127.0.0.1:${address.port}`,origin=`http://${host}`;
      const count=name=>req.rawHeaders.filter((_,i)=>i%2===0 && req.rawHeaders[i].toLowerCase()===name).length;
      if (count('host')!==1 || req.headers.host!==host) throw deny(403);
      for (let i=0;i<req.rawHeaders.length;i+=2) {
        const name=req.rawHeaders[i].toLowerCase();
        // These exact standard browser metadata names supply no identity.
        // User, X-User-Id and all other identity headers remain rejected.
        const identityHeader=!['user-agent','sec-fetch-user'].includes(name)
          && /(?:^|-)(?:identity|adult|household|user|role|bearer|session)(?:-|$)/.test(name);
        if (name==='authorization' || name==='proxy-authorization' || name==='forwarded'
          || name.startsWith('x-forwarded-') || name==='x-original-url' || name==='x-rewrite-url'
          || identityHeader) throw deny(403);
      }
      if (count('origin')>1 || (req.headers.origin!==undefined && req.headers.origin!==origin)) throw deny(403);
      if (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) throw deny(403);
      if (count('cookie')>1) throw deny(400);
      if (typeof req.url!=='string' || !req.url.startsWith('/') || req.url.startsWith('//')
        || /[\\\x00-\x20\x7f]/.test(req.url)) throw deny(400);
      const url=new URL(req.url,origin);
      const api=url.pathname==='/adult' || url.pathname.startsWith('/adult/');
      const token=cookies(req);
      if (api) {
        if (url.search || url.hash || req.url!==url.pathname) return send(404,{error:'Request unavailable.'});
        if (req.method==='POST' && (count('origin')!==1 || req.headers.origin!==origin)) throw deny(403);
        if(family&&url.pathname==='/adult/family'&&req.method==='GET')return send(200,await family.index(token));
        if(family&&url.pathname==='/adult/family/read'&&req.method==='POST')return send(200,await family.read(token,await body(req,['view_context','child_id'])));
        if(family&&url.pathname==='/adult/family/open'&&req.method==='POST')return send(200,await family.open(token,await body(req,[['view_context','child_id','entry_kind','assignment_id','revision_id'],['view_context','child_id','entry_kind','assignment_id','revision_id','play_id']])));
        if(setup&&url.pathname==='/adult/setup'&&req.method==='GET')return send(200,await setup.status(token));
        if(setup&&url.pathname==='/adult/setup'&&req.method==='POST')return send(200,await setup.save(token,await body(req,[['command_id','setup_context','operation','initial','profile'],['command_id','setup_context','operation','child_id','expected_profile_version','profile']])));
        if(consent && url.pathname==='/adult/consent' && req.method==='GET')return send(200,await consent.status(token));
        if(consent && url.pathname==='/adult/consent' && req.method==='POST')return send(200,await consent.record(token,await body(req,['command_id','policy_version','required_service','optional_contact','optional_story'])));
        if(consent && url.pathname==='/adult/consent/withdraw' && req.method==='POST')return send(200,await consent.withdraw(token,await body(req,['command_id','policy_version'])));
        if (req.method==='POST' && url.pathname==='/adult/request') {
          return send(200,await access.request(await body(req,['email','purpose'])));
        }
        if (req.method==='POST' && url.pathname==='/adult/verify') {
          const result=await access.verify(await body(req,['token']));
          if (result.status!=='verified') return send(200,{status:'invalid_link'});
          if (!tokenOK(result.sessionToken) || result.restricted!==true) throw deny(503);
          res.setHeader('Set-Cookie',`${cookieName}=${result.sessionToken}; HttpOnly; SameSite=Strict; Path=/adult`);
          return send(200,{status:'verified',restricted:true});
        }
        if (req.method==='GET' && url.pathname==='/adult/session') {
          const result=await access.session(token);
          if (result.status!=='restricted') return send(200,{status:'signed_out'});
          return send(200,{status:'restricted',adultId:result.adultId,householdId:result.householdId,restricted:true});
        }
        if (req.method==='POST' && url.pathname==='/adult/logout') {
          await body(req,[]);
          await access.logout(token);
          res.setHeader('Set-Cookie',clearCookie);
          return send(200,{status:'signed_out'});
        }
        return send(404,{error:'Request unavailable.'});
      }
      if (serve && req.method==='GET' && assetPath(url)) {
        // Vite's middleware may return before its response has finished. Keep
        // this request alive through both the callback and response completion.
        let cleanup;
        const finished=new Promise((resolve,reject)=>{
          const done=()=>{cleanup();resolve();};
          const failed=()=>{cleanup();reject(deny(503));};
          cleanup=()=>{res.off('finish',done);res.off('close',failed);};
          res.once('finish',done);res.once('close',failed);
        });
        // Attach rejection handling immediately, including synchronous faults.
        const observed=finished.catch(()=>undefined);
        try { await serve(req,res); await finished; }
        finally { cleanup(); await observed; }
        return;
      }
      return send(404,{error:'Request unavailable.'});
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const domain={denied:403,validation_failed:400,conflict:409,rate_limited:429};
      const status=Object.hasOwn(domain,error?.code)?domain[error.code]:([400,403,413,415,503].includes(error?.status)?error.status:503);
      send(status,{error:status===503?'Local synthetic access unavailable.':'Request denied.'});
    }
  });
  const listen=server.listen;
  server.listen=function(...args) {
    const first=args[0], object=first && typeof first==='object';
    const port=object?first.port:first,host=object?first.host:args[1];
    if (!Number.isInteger(port) || port<0 || port>65535 || host!=='127.0.0.1'
      || (object && Object.keys(first).some(key=>!['port','host','backlog','exclusive','signal','ipv6Only','reusePort'].includes(key)))) {
      throw new Error('Explicit 127.0.0.1 binding required.');
    }
    return listen.apply(this,args);
  };
  server.on('clientError',(_error,socket)=>{
    socket.end('HTTP/1.1 400 Bad Request\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  return server;
}
