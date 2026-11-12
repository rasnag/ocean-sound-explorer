import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';

const fields = ['challengeTtlMs','sessionTtlMs','resendCooldownMs','requestWindowMs','maxRequests','maxVerifyAttempts'];
const hash = value => createHash('sha256').update(value).digest('hex');
const tokenOK = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
  && Buffer.from(value,'base64url').toString('base64url') === value;
const uuidOK = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const failure = (status=503) => Object.assign(new Error(status===400 ? 'Invalid synthetic request.' : 'Local synthetic access unavailable.'), {status});
function shape(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype,null].includes(Object.getPrototypeOf(value))
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}
function emailValue(value) {
  if (typeof value !== 'string' || value.length > 160) throw failure(400);
  const email = value.trim().toLowerCase();
  if (email.length > 80 || !/^[a-z0-9][a-z0-9._+-]{0,63}@example\.invalid$/.test(email)) throw failure(400);
  return email;
}
const invalid = () => ({status:'invalid_link'});
const signedOut = () => ({status:'signed_out'});
const inbox = () => ({status:'check_inbox'});

/** Trusted constructor/setup API, never mounted directly as an HTTP handler. */
export async function createSyntheticAdultAccess(options = {}) {
  // Environment validation precedes imports, database access and secret generation.
  resolveLoopConfig(options?.env);
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['db','env','clock','policy','deliver'].includes(key))) throw failure(400);
  const {db, policy: suppliedPolicy, deliver, clock = Date.now} = options;
  if (!shape(suppliedPolicy,fields) || fields.some(key => !Number.isSafeInteger(suppliedPolicy[key]) || suppliedPolicy[key] <= 0)
    || typeof deliver !== 'function' || typeof clock !== 'function') throw failure(400);
  const policy = Object.freeze({...suppliedPolicy});
  const largestDuration = Math.max(...fields.slice(0,4).map(key => policy[key]));
  const now = () => {
    const at = clock();
    if (!Number.isSafeInteger(at) || at < 0 || at > 8640000000000000 - largestDuration) throw failure();
    return at;
  };
  now();
  const {PGlite} = await import('@electric-sql/pglite');
  if (!(db instanceof PGlite) || typeof db.transaction !== 'function' || typeof db.query !== 'function') throw failure(400);
  try {
    const result = await db.query(`SELECT version FROM schema_migrations WHERE version=6`);
    if (result.rows.length !== 1) throw failure();
    await db.query('SELECT singleton FROM adult_access_throttle WHERE singleton=true');
  } catch { throw failure(); }

  async function transaction(work,preserveDomainErrors=false) {
    for (let attempt=0; attempt<3; attempt++) {
      try {
        return await db.transaction(async tx => {
          // Universal issuer lock, then household -> account -> challenge -> session.
          // Also used by session/logout/setup: no inverse service lock acquisition.
          const throttle = (await tx.query('SELECT * FROM adult_access_throttle WHERE singleton=true FOR UPDATE')).rows[0];
          if (!throttle) throw failure();
          return work(tx,throttle,now());
        });
      } catch (error) {
        if (attempt < 2 && ['40001','40P01'].includes(error?.code)) continue;
        if(preserveDomainErrors)throw error;
        throw failure();
      }
    }
    throw failure();
  }
  async function budget(tx,row,at,kind,maximum) {
    const startKey = kind+'_started_ms', countKey = kind+'_count';
    let start = Number(row[startKey]), count = Number(row[countKey]);
    // A backward test clock cannot open a fresh window or mint more attempts.
    if (at < start) return false;
    if (at-start >= policy.requestWindowMs) { start=at; count=0; }
    if (count >= maximum) return false;
    await tx.query(`UPDATE adult_access_throttle SET ${startKey}=$1,${countKey}=$2 WHERE singleton=true`,[start,count+1]);
    return true;
  }
  async function account(tx,email) {
    const candidate = (await tx.query('SELECT adult_id,household_id FROM adult_accounts WHERE email=$1',[email])).rows[0];
    if (!candidate) return undefined;
    await tx.query('SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[candidate.household_id]);
    return (await tx.query('SELECT * FROM adult_accounts WHERE email=$1 FOR UPDATE',[email])).rows[0];
  }
  async function bySession(tx,token) {
    const candidate = (await tx.query(`SELECT a.email FROM adult_sessions s JOIN adult_accounts a ON a.adult_id=s.adult_id WHERE s.token_hash=$1`,[hash(token)])).rows[0];
    if (!candidate) return undefined;
    const identity = await account(tx,candidate.email);
    const session = (await tx.query('SELECT * FROM adult_sessions WHERE token_hash=$1 FOR UPDATE',[hash(token)])).rows[0];
    return identity && session ? {identity,session} : undefined;
  }
  const iso = at => new Date(at).toISOString();

  async function seedAccount(input) {
    if (!shape(input,['email','adultId','householdId']) || !uuidOK(input.adultId) || !uuidOK(input.householdId)) throw failure(400);
    const email = emailValue(input.email), adultId=input.adultId.toLowerCase(), householdId=input.householdId.toLowerCase();
    await transaction(async tx => {
      await tx.query('INSERT INTO households(household_id) VALUES($1) ON CONFLICT DO NOTHING',[householdId]);
      await tx.query('SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[householdId]);
      const existing = (await tx.query('SELECT * FROM adult_accounts WHERE email=$1 OR adult_id=$2 FOR UPDATE',[email,adultId])).rows;
      if (existing.length) {
        if (existing.length !== 1 || existing[0].adult_id !== adultId || existing[0].household_id !== householdId || existing[0].email !== email) throw failure();
        return; // Never update enabled or an existing mapping.
      }
      await tx.query('INSERT INTO adult_accounts(adult_id,household_id,email) VALUES($1,$2,$3)',[adultId,householdId,email]);
    });
  }

  async function request(input) {
    if (!shape(input,['email','purpose']) || !['join','recover'].includes(input.purpose)) throw failure(400);
    const email=emailValue(input.email), purpose=input.purpose;
    const challenge = await transaction(async (tx,row,at) => {
      if (!await budget(tx,row,at,'request',policy.maxRequests)) return undefined;
      const identity = await account(tx,email);
      if ((identity && !identity.enabled) || (!identity && purpose==='recover')) return undefined;
      const addressHash=hash(email);
      const throttle=(await tx.query('SELECT last_issued_ms FROM adult_address_throttle WHERE address_hash=$1 FOR UPDATE',[addressHash])).rows[0];
      if (throttle && at-Number(throttle.last_issued_ms) < policy.resendCooldownMs) return undefined;
      await tx.query(`INSERT INTO adult_address_throttle(address_hash,last_issued_ms) VALUES($1,$2)
        ON CONFLICT(address_hash) DO UPDATE SET last_issued_ms=EXCLUDED.last_issued_ms`,[addressHash,at]);
      await tx.query(`UPDATE adult_challenges SET revoked_at=$3 WHERE email=$1 AND purpose=$2 AND consumed_at IS NULL AND revoked_at IS NULL`,[email,purpose,iso(at)]);
      const token=randomBytes(32).toString('base64url');
      await tx.query(`INSERT INTO adult_challenges(token_hash,email,purpose,adult_id,household_id,issued_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[hash(token),email,purpose,identity?.adult_id ?? null,identity?.household_id ?? null,iso(at),iso(at+policy.challengeTtlMs)]);
      return {token};
    });
    if (!challenge) return inbox();
    // No transaction spans delivery. Pending challenges cannot verify. This is a
    // trusted in-process capture only, with a bounded technical callback timeout.
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(() => deliver({email,purpose,token:challenge.token})),
        new Promise((_,reject) => { timer=setTimeout(() => reject(failure()),2000); }),
      ]);
      await transaction(async (tx,_row,at) => {
        await account(tx,email);
        await tx.query(`UPDATE adult_challenges SET delivered_at=$2 WHERE token_hash=$1
          AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>$2 AND issued_at<=$2`,[hash(challenge.token),iso(at)]);
      });
      return inbox();
    } catch {
      // A callback may have captured before throwing. Its code remains unusable.
      try {
        await transaction(async (tx,_row,at) => {
          await account(tx,email);
          await tx.query('UPDATE adult_challenges SET revoked_at=COALESCE(revoked_at,$2) WHERE token_hash=$1',[hash(challenge.token),iso(at)]);
        });
      } catch { /* Pending delivery is fail-closed even if cleanup is unavailable. */ }
      throw failure();
    } finally { clearTimeout(timer); }
  }

  async function verify(input) {
    if (!shape(input,['token'])) throw failure(400);
    return transaction(async (tx,row,at) => {
      if (!await budget(tx,row,at,'verify',policy.maxVerifyAttempts) || !tokenOK(input.token)) return invalid();
      const tokenHash=hash(input.token);
      const candidate=(await tx.query('SELECT email FROM adult_challenges WHERE token_hash=$1',[tokenHash])).rows[0];
      if (!candidate) return invalid();
      let identity=await account(tx,candidate.email);
      const challenge=(await tx.query('SELECT * FROM adult_challenges WHERE token_hash=$1 FOR UPDATE',[tokenHash])).rows[0];
      if (!challenge || !challenge.delivered_at || challenge.consumed_at || challenge.revoked_at
        || at < new Date(challenge.issued_at).getTime() || at >= new Date(challenge.expires_at).getTime()) return invalid();
      if (challenge.adult_id) {
        if (!identity?.enabled || identity.adult_id!==challenge.adult_id || identity.household_id!==challenge.household_id) return invalid();
      } else {
        // Never reinterpret an unbound join challenge as authority over an
        // account created later by trusted setup or a different challenge.
        if (identity || challenge.purpose!=='join') return invalid();
        identity={adult_id:randomUUID(),household_id:randomUUID(),email:challenge.email,enabled:true};
        await tx.query('INSERT INTO households(household_id) VALUES($1)',[identity.household_id]);
        await tx.query('SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[identity.household_id]);
        await tx.query('INSERT INTO adult_accounts(adult_id,household_id,email) VALUES($1,$2,$3)',[identity.adult_id,identity.household_id,identity.email]);
      }
      const sessionToken=randomBytes(32).toString('base64url');
      await tx.query('UPDATE adult_challenges SET consumed_at=$2 WHERE token_hash=$1',[tokenHash,iso(at)]);
      await tx.query('UPDATE adult_sessions SET revoked_at=$2 WHERE adult_id=$1 AND revoked_at IS NULL',[identity.adult_id,iso(at)]);
      await tx.query('INSERT INTO adult_sessions(token_hash,adult_id,issued_at,expires_at) VALUES($1,$2,$3,$4)',[hash(sessionToken),identity.adult_id,iso(at),iso(at+policy.sessionTtlMs)]);
      return {status:'verified',sessionToken,adultId:identity.adult_id,householdId:identity.household_id,restricted:true};
    });
  }
  async function session(token) {
    if (!tokenOK(token)) return signedOut();
    return transaction(async (tx,_row,at) => {
      const found=await bySession(tx,token);
      if (!found || !found.identity.enabled || found.session.revoked_at
        || at < new Date(found.session.issued_at).getTime() || at >= new Date(found.session.expires_at).getTime()) return signedOut();
      return {status:'restricted',adultId:found.identity.adult_id,householdId:found.identity.household_id,restricted:true};
    });
  }
  async function logout(token) {
    if (!tokenOK(token)) return signedOut();
    await transaction(async (tx,_row,at) => {
      const found=await bySession(tx,token);
      if (found) await tx.query('UPDATE adult_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE token_hash=$1',[hash(token),iso(at)]);
    });
    return signedOut();
  }
  async function withSession(token,callback) {
    const denied=()=>Object.assign(new Error('Synthetic account unavailable.'),{code:'denied',status:403});
    if(!tokenOK(token)||typeof callback!=='function')throw denied();
    return transaction(async(tx,_row,at)=>{
      const found=await bySession(tx,token);
      if(!found||!found.identity.enabled||found.session.revoked_at
        ||at<new Date(found.session.issued_at).getTime()||at>=new Date(found.session.expires_at).getTime())throw denied();
      return callback(tx,Object.freeze({adultId:found.identity.adult_id,householdId:found.identity.household_id}));
    },true);
  }
  return Object.freeze({request,verify,session,logout,seedAccount,withSession});
}
