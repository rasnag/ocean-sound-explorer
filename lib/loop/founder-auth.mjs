import {randomBytes, randomUUID, createHash, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {TOTP, Secret} from 'otpauth';
import {resolveLoopConfig} from './environment.mjs';

const derive = promisify(scrypt);
const options = Object.freeze({N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024});
const digest = token => createHash('sha256').update(token).digest('hex');
const validToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
  && Buffer.from(token, 'base64url').toString('base64url') === token;
const failure = (status = 401) => Object.assign(new Error(status === 429 ? 'Authentication temporarily unavailable.' : status === 403 ? 'Access denied.' : 'Authentication failed.'), {status, statusCode: status});
const positive = (value, maximum) => Number.isSafeInteger(value) && value > 0 && value <= maximum;
const text = (value, maximum) => typeof value === 'string' && value.length > 0 && value.length <= maximum;

/** Provisional disposable local issuer; supplies no hosted/production identity claim. */
export async function createFounderAuth({db, env, clock = Date.now, sessionTtlMs = 600000,
  rateLimit = {maxFailures: 5, windowMs: 60000}, logger} = {}) {
  resolveLoopConfig(env);
  if (!db || typeof db.transaction !== 'function' || typeof db.query !== 'function'
    || typeof clock !== 'function' || !positive(sessionTtlMs, 3600000)
    || !rateLimit || !positive(rateLimit.maxFailures, 100)
    || !positive(rateLimit.windowMs, 3600000)) throw new Error('Invalid local authentication configuration.');
  const maxFailures = rateLimit.maxFailures, windowMs = rateLimit.windowMs;
  const now = () => {
    const value = clock();
    if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000 - sessionTtlMs) throw new Error('Invalid local authentication clock.');
    return value;
  };
  now();
  const emit = event => { try { if (typeof logger === 'function') logger({event, mode: 'local-synthetic'}); } catch {} };
  // Fixed-cost dummy verifier also runs for unknown users and malformed credentials.
  const dummySalt = randomBytes(16).toString('hex');
  const dummyHash = await derive(randomBytes(32), dummySalt, 64, options);
  const dummySecret = new Secret({size: 20}).base32;
  const otpFor = secret => new TOTP({secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30});

  async function provisionSyntheticIdentity({username, role, password, totpSecret} = {}) {
    if (!text(username, 128) || !['founder', 'family'].includes(role)
      || !text(password, 1024) || password.length < 16
      || typeof totpSecret !== 'string' || !/^[A-Z2-7]{32,128}$/.test(totpSecret)) throw new Error('Invalid synthetic identity configuration.');
    try { otpFor(totpSecret); } catch { throw new Error('Invalid synthetic identity configuration.'); }
    const salt = randomBytes(16).toString('hex');
    const hash = await derive(password, salt, 64, options);
    try {
      await db.query('INSERT INTO founder_identities(identity_id,username,role,password_salt,password_hash,totp_secret) VALUES($1,$2,$3,$4,$5,$6)',
        [randomUUID(), username, role, salt, hash.toString('hex'), totpSecret]);
    } catch { throw new Error('Synthetic identity could not be provisioned.'); }
    emit('synthetic_identity_provisioned');
  }

  async function login(input = {}) {
    const {username, password, totp} = input ?? {};
    let result;
    try {
      result = await db.transaction(async tx => {
        // Serialize the bounded global local throttle and OTP consumption together.
        const throttle = (await tx.query('SELECT window_started_ms,failures FROM founder_auth_throttle WHERE singleton=true FOR UPDATE')).rows[0];
        if (!throttle) throw new Error('Missing throttle.');
        const at = now();
        let start = Number(throttle.window_started_ms), failures = Number(throttle.failures);
        if (at < start || at - start >= windowMs) {
          start = at; failures = 0;
          await tx.query('UPDATE founder_auth_throttle SET window_started_ms=$1,failures=0 WHERE singleton=true', [start]);
        }
        if (failures >= maxFailures) return {status: 429};
        const identity = text(username, 128)
          ? (await tx.query('SELECT * FROM founder_identities WHERE username=$1 FOR UPDATE', [username])).rows[0] : undefined;
        const salt = identity?.password_salt ?? dummySalt;
        const expected = identity ? Buffer.from(identity.password_hash, 'hex') : dummyHash;
        const candidate = await derive(text(password, 1024) ? password : 'invalid-local-credential', salt, 64, options);
        const passwordOK = expected.length === candidate.length && timingSafeEqual(expected, candidate);
        const otp = otpFor(identity?.totp_secret ?? dummySecret);
        const delta = typeof totp === 'string' && /^\d{6}$/.test(totp)
          ? otp.validate({token: totp, timestamp: at, window: 0}) : null;
        const step = Math.floor(at / 30000);
        if (!identity || !identity.enabled || !passwordOK || delta !== 0 || step <= Number(identity.last_totp_step)) {
          await tx.query('UPDATE founder_auth_throttle SET failures=failures+1 WHERE singleton=true');
          return {status: failures + 1 >= maxFailures ? 429 : 401};
        }
        const token = randomBytes(32).toString('base64url');
        const expiresAt = new Date(at + sessionTtlMs).toISOString();
        await tx.query('UPDATE founder_identities SET last_totp_step=$1 WHERE identity_id=$2', [step, identity.identity_id]);
        await tx.query('INSERT INTO founder_sessions(token_hash,identity_id,expires_at) VALUES($1,$2,$3)', [digest(token), identity.identity_id, expiresAt]);
        return {token, expiresAt};
      });
    } catch { emit('authentication_error'); throw failure(); }
    if (result.status) { emit('authentication_denied'); throw failure(result.status); }
    emit('authentication_succeeded');
    return result;
  }

  async function requireFounder(token) {
    if (!validToken(token)) throw failure();
    let row;
    try {
      row = (await db.query(`SELECT i.identity_id,i.role,i.enabled,s.expires_at,s.revoked_at
        FROM founder_sessions s JOIN founder_identities i ON i.identity_id=s.identity_id WHERE s.token_hash=$1`, [digest(token)])).rows[0];
    } catch { throw failure(); }
    if (!row || !row.enabled || row.revoked_at || new Date(row.expires_at).getTime() <= now()) throw failure();
    if (row.role !== 'founder') throw failure(403);
    return {identityId: row.identity_id, role: 'founder'};
  }

  async function logout(token) {
    if (!validToken(token)) throw failure();
    try { await db.query('UPDATE founder_sessions SET revoked_at=COALESCE(revoked_at,$1) WHERE token_hash=$2', [new Date(now()).toISOString(), digest(token)]); }
    catch { throw failure(); }
    emit('session_revoked');
  }
  return Object.freeze({provisionSyntheticIdentity, login, requireFounder, logout});
}
