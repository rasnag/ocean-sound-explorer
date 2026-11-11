import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, createHash} from 'node:crypto';
import http from 'node:http';
import {TOTP, Secret} from 'otpauth';
import {createSyntheticDatabase} from '../lib/loop/local-db.mjs';
import {migrate} from '../db/migrate.mjs';
import {createFounderAuth} from '../lib/loop/founder-auth.mjs';
import {createSyntheticAuthServer} from '../server/loop-auth.mjs';

const env = {LOOP_ENV: 'local-synthetic'};
test('real local PostgreSQL and HTTP enforce synthetic founder boundaries', async () => {
  let now = 1900000000000;
  const db = await createSyntheticDatabase(env);
  const logs = [], bodies = [], tokens = [];
  let server;
  const captured = [];
  const originalLog = console.log, originalError = console.error, originalStderr = process.stderr.write;
  console.log = (...args) => { captured.push(args.map(String).join(' ')); };
  console.error = (...args) => { captured.push(args.map(String).join(' ')); };
  process.stderr.write = function (chunk, encoding, callback) {
    captured.push(String(chunk));
    const cb = typeof encoding === 'function' ? encoding : callback;
    if (cb) cb();
    return true;
  };
  try {
    await migrate(db);
    const logger = value => logs.push(value);
    const auth = await createFounderAuth({db, env, clock: () => now, sessionTtlMs: 60000,
      rateLimit: {maxFailures: 5, windowMs: 60000}, logger});
    for (const bad of [{}, {LOOP_ENV: 'production'}, {LOOP_ENV: 'preview'}, {LOOP_ENV: 'local-synthetic', LOOP_DB_URL: 'postgres://invented.invalid/db'}]) {
      await assert.rejects(() => createFounderAuth({db, env: bad}));
      assert.throws(() => createSyntheticAuthServer({auth, env: bad}));
    }
    for (const sessionTtlMs of [0, -1, 3600001, NaN, Infinity, 1.5]) await assert.rejects(() => createFounderAuth({db, env, sessionTtlMs}));
    for (const rateLimit of [{maxFailures: 0, windowMs: 1}, {maxFailures: 1, windowMs: 0}, {maxFailures: Infinity, windowMs: 1}]) await assert.rejects(() => createFounderAuth({db, env, rateLimit}));
    const identity = role => ({username: `invented-${role}-${randomBytes(8).toString('hex')}`, role,
      password: randomBytes(24).toString('base64url'), totpSecret: new Secret({size: 20}).base32});
    const founder = identity('founder'), family = identity('family');
    const otp = p => new TOTP({secret: Secret.fromBase32(p.totpSecret), algorithm: 'SHA1', digits: 6, period: 30}).generate({timestamp: now});
    await auth.provisionSyntheticIdentity(founder); await auth.provisionSyntheticIdentity(family);
    await assert.rejects(() => auth.provisionSyntheticIdentity(founder));
    for (const args of [[0], [0, '0.0.0.0'], [0, '::'], ['invented-pipe'], [{port: 0}], [{port: 0, host: '127.0.0.1', path: 'invented'}]]) {
      const unsafe = createSyntheticAuthServer({auth, env});
      assert.throws(() => unsafe.listen(...args)); assert.equal(unsafe.listening, false);
    }
    server = createSyntheticAuthServer({auth, env, logger});
    assert.equal(server.listening, false);
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    const port = server.address().port, origin = `http://127.0.0.1:${port}`;
    const request = (route, {method = 'GET', input, raw, cookie, headers = {}} = {}) => new Promise((resolve, reject) => {
      const payload = raw ?? (input === undefined ? undefined : JSON.stringify(input));
      const req = http.request({hostname: '127.0.0.1', port, path: route, method,
        headers: {Host: `127.0.0.1:${port}`, Origin: origin, ...(payload === undefined ? {} : {'Content-Type': 'application/json'}), ...(cookie ? {Cookie: cookie} : {}), ...headers}}, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', chunk => {text += chunk;});
        res.on('end', () => {bodies.push(text); assert.match(res.headers['cache-control'] ?? '', /no-store/); resolve({status: res.statusCode, headers: res.headers, text});});
      });
      req.on('error', reject); req.setTimeout(10000, () => req.destroy(Error('Local request timeout.')));
      req.end(payload);
    });
    const login = (p, extra = {}) => request('/login', {method: 'POST', input: {username: p.username, password: p.password, totp: otp(p), ...extra}});
    const takeCookie = response => {const value = response.headers['set-cookie'][0]; assert.match(value, /HttpOnly/); assert.match(value, /SameSite=Strict/); assert.match(value, /Path=\//); const pair = value.split(';')[0]; tokens.push(pair.split('=')[1]); return pair;};
    const page = await request('/login'); assert.equal(page.status, 200); assert.match(page.text, /<label for="totp"/); assert.match(page.text, /synthetic/i);
    assert.equal((await request('/founder')).status, 401);
    const unknown = await login({...founder, username: `unknown-${randomBytes(8).toString('hex')}`});
    const wrong = await login(founder, {password: randomBytes(24).toString('base64url')});
    assert.equal(unknown.status, 401); assert.equal(wrong.status, 401); assert.equal(unknown.text, wrong.text);
    assert.equal((await login(founder, {totp: 'invalid'})).status, 401);
    assert.equal((await login(founder, {totp: String((Number(otp(founder)) + 1) % 1000000).padStart(6, '0')})).status, 401);
    const signed = await login(founder); assert.equal(signed.status, 200); assert.deepEqual(JSON.parse(signed.text), {success: true});
    const founderCookie = takeCookie(signed);
    assert.equal((await request('/founder', {cookie: founderCookie})).status, 200);
    assert.equal((await login(founder)).status, 429); // Fifth failure is replay; throttle commits independently of error response.
    now += 60001;
    const concurrent = await Promise.all([login(family, {role: 'founder', subject: founder.username, expiresAt: now + 99999999}), login(family)]);
    assert.deepEqual(concurrent.map(x => x.status).sort(), [200, 401]);
    const familyCookie = takeCookie(concurrent.find(x => x.status === 200));
    assert.equal((await request('/founder', {cookie: familyCookie})).status, 403);
    now += 30000;
    const renewed = await login(founder); assert.equal(renewed.status, 200); const currentCookie = takeCookie(renewed);
    assert.notEqual(currentCookie, founderCookie);
    for (const [headers, expected] of [[{Host: 'untrusted.invalid'}, 403], [{Origin: 'https://untrusted.invalid'}, 403], [{'Content-Type': 'text/plain'}, 415]]) {
      assert.equal((await request('/login', {method: 'POST', input: {}, headers})).status, expected);
    }
    assert.equal((await request('/login', {method: 'POST', raw: 'x'.repeat(4097)})).status, 413);
    assert.equal((await request('/login', {method: 'POST', raw: '{'})).status, 400);
    assert.equal((await request('/founder', {cookie: `${currentCookie}; ${currentCookie}`})).status, 401);
    assert.equal((await request('/founder', {cookie: 'loop_session=invalid'})).status, 401);
    assert.equal((await request('/logout', {method: 'POST', cookie: currentCookie, headers: {Origin: 'https://untrusted.invalid'}})).status, 403);
    assert.equal((await request('/founder', {cookie: currentCookie})).status, 200);
    const logout = await request('/logout', {method: 'POST', cookie: currentCookie}); assert.equal(logout.status, 200);
    assert.match(logout.headers['set-cookie'][0], /^loop_session=;/); assert.match(logout.headers['set-cookie'][0], /Max-Age=0/);
    assert.equal((await request('/founder', {cookie: currentCookie})).status, 401);
    now += 30000;
    const demotedCookie = takeCookie(await login(founder));
    await db.query('UPDATE founder_identities SET role=$1 WHERE username=$2', ['family', founder.username]);
    assert.equal((await request('/founder', {cookie: demotedCookie})).status, 403);
    await db.query('UPDATE founder_identities SET enabled=false WHERE username=$1', [founder.username]);
    assert.equal((await request('/founder', {cookie: demotedCookie})).status, 401);
    now += 60001;
    const expiringCookie = takeCookie(await login(family)); now += 60000;
    assert.equal((await request('/founder', {cookie: expiringCookie})).status, 401);
    for (let i = 0; i < 5; i++) await login(family, {password: 'invented-wrong-password'});
    assert.equal((await login(family)).status, 429);
    now += 60001;
    assert.equal((await login(family)).status, 200, 'correct credentials work after the lockout window');
    const sessions = (await db.query('SELECT * FROM founder_sessions')).rows;
    for (const token of tokens) assert(sessions.some(row => row.token_hash === createHash('sha256').update(token).digest('hex')));
    const publicEvidence = JSON.stringify({logs, bodies, captured});
    const sessionEvidence = JSON.stringify(sessions);
    const identities = JSON.stringify((await db.query('SELECT * FROM founder_identities')).rows);
    for (const secret of [founder.password, family.password, founder.totpSecret, family.totpSecret, ...tokens]) {
      assert(!publicEvidence.includes(secret), 'response/log/console/stderr secret absence');
      assert(!sessionEvidence.includes(secret), 'session storage contains only token verifiers');
    }
    for (const p of [founder, family]) assert(!identities.includes(p.password));
  } finally {
    console.log = originalLog; console.error = originalError; process.stderr.write = originalStderr;
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await db.close();
  }
});
