import http from 'node:http';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';

const denied = status => Object.assign(new Error('Request denied.'), {status});
const script = `document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const s=document.getElementById('status');s.textContent='Signing in…';try{const r=await fetch('/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(f)))});f.elements.password.value='';f.elements.totp.value='';if(r.ok)location.assign('/founder');else s.textContent='Sign-in failed. Please try again later.';}catch{s.textContent='Sign-in failed. Please try again later.';}});`;
const form = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Local synthetic login</title><main><h1>Local synthetic login</h1><p>Invented developer identities only. Session policy is provisional.</p><form><p><label for="username">Username</label><input id="username" name="username" autocomplete="username" required maxlength="128"></p><p><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024"></p><p><label for="totp">Authenticator code</label><input id="totp" name="totp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required maxlength="6"></p><button type="submit">Sign in</button></form><p id="status" role="status"></p></main><script src="/login.js" defer></script></html>`;
const founderPage = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic founder</title><main><h1>Synthetic founder workspace</h1><p>Local authorization probe only.</p></main></html>';

function cookie(req) {
  const values = req.headers.cookie;
  if (values === undefined) return undefined;
  if (typeof values !== 'string' || values.length > 4096) throw denied(401);
  const seen = new Set();
  let token;
  for (const part of values.split(';')) {
    const match = /^\s*([!#$%&'*+.^_`|~0-9A-Za-z-]+)=([^;\s]*)\s*$/.exec(part);
    if (!match || seen.has(match[1])) throw denied(401);
    seen.add(match[1]);
    if (match[1] === 'loop_session') {
      if (!/^[A-Za-z0-9_-]{43}$/.test(match[2]) || Buffer.from(match[2], 'base64url').toString('base64url') !== match[2]) throw denied(401);
      token = match[2];
    }
  }
  return token;
}
async function body(req, allowEmpty) {
  const length = req.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > 4096)) throw denied(413);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw denied(413);
    chunks.push(chunk);
  }
  if (allowEmpty && size === 0) return {};
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) throw denied(415);
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch { throw denied(400); }
}

/** Real HTTP server; explicit IPv4 loopback binding is mandatory. */
export function createSyntheticAuthServer({auth, env, logger} = {}) {
  resolveLoopConfig(env);
  if (!auth || ['login', 'logout', 'requireFounder'].some(name => typeof auth[name] !== 'function')) throw new Error('Invalid local authentication configuration.');
  const emit = event => { try { if (typeof logger === 'function') logger({event, mode: 'local-synthetic'}); } catch {} };
  const server = http.createServer({maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000}, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const send = (status, value, type) => {
      res.statusCode = status;
      if (type) res.setHeader('Content-Type', type);
      res.end(type ? value : JSON.stringify(value));
    };
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw denied(403);
      const host = `127.0.0.1:${address.port}`;
      const count = name => req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === name).length;
      if (req.headers.host !== host || count('host') !== 1) throw denied(403);
      if (count('cookie') > 1) throw denied(401);
      const token = cookie(req);
      if (req.method === 'POST') {
        if (count('origin') !== 1 || req.headers.origin !== `http://${host}`) throw denied(403);
        const input = await body(req, req.url === '/logout');
        if (req.url === '/login') {
          // Browser-proposed role, subject, expiry or session identifiers confer no authority.
          const session = await auth.login({username: input.username, password: input.password, totp: input.totp});
          res.setHeader('Set-Cookie', `loop_session=${session.token}; HttpOnly; SameSite=Strict; Path=/`);
          return send(200, {success: true});
        }
        if (req.url === '/logout') {
          await auth.logout(token);
          res.setHeader('Set-Cookie', 'loop_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
          return send(200, {success: true});
        }
      } else if (req.method === 'GET') {
        if (req.url === '/login') return send(200, form, 'text/html; charset=utf-8');
        if (req.url === '/login.js') return send(200, script, 'text/javascript; charset=utf-8');
        if (req.url === '/founder') {
          await auth.requireFounder(token);
          return send(200, founderPage, 'text/html; charset=utf-8');
        }
      }
      return send(404, {error: 'Request unavailable.'});
    } catch (error) {
      emit('http_request_denied');
      const status = [400, 401, 403, 413, 415, 429].includes(error?.status) ? error.status : 500;
      send(status, {error: status === 429 ? 'Authentication temporarily unavailable.' : 'Request denied.'});
    }
  });
  const listen = server.listen;
  server.listen = function (...args) {
    const first = args[0];
    const object = first && typeof first === 'object';
    const port = object ? first.port : first;
    const host = object ? first.host : args[1];
    if (!Number.isInteger(port) || port < 0 || port > 65535 || host !== '127.0.0.1'
      || (object && (first.path !== undefined || first.fd !== undefined || first.handle !== undefined))) throw new Error('Explicit 127.0.0.1 binding required.');
    return listen.apply(this, args);
  };
  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  return server;
}
