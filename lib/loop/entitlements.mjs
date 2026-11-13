import {createHash, randomUUID} from 'node:crypto';
import {resolveLoopConfig} from './environment.mjs';

const busy = new WeakSet();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = code => { const error = new Error('Entitlement operation failed.'); error.code = code; throw error; };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function exact(value, required, optional = []) {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key))
    || Reflect.ownKeys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('validation_failed');
}
const text = value => { if (typeof value !== 'string' || !value.trim()) fail('validation_failed'); };
const uuid = value => { if (typeof value !== 'string' || !uuidPattern.test(value)) fail('validation_failed'); };
const integer = (value, min = 1, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('validation_failed');
};
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const first = async (tx, sql, args) => (await tx.query(sql, args)).rows[0];
const iso = value => new Date(value).toISOString();

/** Internal synthetic kernel. The caller owns commit, recovery and acknowledgement.
 * Do not invoke concurrent methods on the same transaction, including through aliases.
 * trustedScope must come from a future trusted authentication owner, never a browser.
 */
export function createEntitlementKernel({env, clock = Date.now} = {}) {
  resolveLoopConfig(env);
  if (typeof clock !== 'function') fail('validation_failed');
  async function operation(tx, fn) {
    if (!tx || typeof tx.query !== 'function') fail('validation_failed');
    if (busy.has(tx)) fail('conflict');
    busy.add(tx);
    const savepoint = 'entitlement_' + randomUUID().replaceAll('-', '');
    let established = false;
    try {
      // PostgreSQL itself rejects autocommit with SQLSTATE 25P01.
      await tx.query('SAVEPOINT ' + savepoint);
      established = true;
      const result = await fn();
      await tx.query('RELEASE SAVEPOINT ' + savepoint);
      return result;
    } catch (error) {
      if (established) {
        try {
          await tx.query('ROLLBACK TO SAVEPOINT ' + savepoint);
          await tx.query('RELEASE SAVEPOINT ' + savepoint);
        } catch (recoveryError) {
          // Preserve the original SQLSTATE and expose recovery failure internally.
          error.recoveryError = recoveryError;
        }
      }
      throw error;
    } finally { busy.delete(tx); }
  }
  async function authorize(tx, scope) {
    exact(scope, ['household_id', 'consent_epoch']); uuid(scope.household_id); integer(scope.consent_epoch);
    if (!await first(tx, 'SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE', [scope.household_id])) fail('denied');
    const consent = await first(tx, 'SELECT consent_epoch,state,policy_version FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE', [scope.household_id]);
    if (!consent || consent.state !== 'active' || consent.policy_version!=='TEST-v1' || Number(consent.consent_epoch) !== scope.consent_epoch) fail('denied');
  }
  async function prior(tx, household, id, hash) {
    const row = await first(tx, 'SELECT canonical_digest,result FROM entitlement_commands WHERE household_id=$1 AND command_id=$2', [household, id]);
    if (row && row.canonical_digest !== hash) fail('conflict');
    return row?.result;
  }
  async function record(tx, household, id, kind, hash, period, result) {
    await tx.query('INSERT INTO entitlement_commands(household_id,command_id,command_kind,canonical_digest,period_id,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
      [household, id, kind, hash, period, JSON.stringify(result)]);
  }
  async function lockPeriod(tx, household, period) {
    // Read the grant identity before taking resource locks, then lock grant -> period.
    const identity = await first(tx, 'SELECT entitlement_id FROM entitlement_periods WHERE household_id=$1 AND period_id=$2', [household, period]);
    if (!identity) fail('denied');
    if (!await first(tx, 'SELECT entitlement_id FROM entitlements WHERE household_id=$1 AND entitlement_id=$2 FOR UPDATE', [household, identity.entitlement_id])) fail('denied');
    const row = await first(tx, 'SELECT * FROM entitlement_periods WHERE household_id=$1 AND period_id=$2 FOR UPDATE', [household, period]);
    if (!row) fail('denied');
    // Narrow new-policy visibility fence. No journal I/O in caller transactions.
    // A raw primary period, mismatched marker or prior consent epoch is not allowance.
    if (row.policy_version === 'TEST-CONTINUATION-v1') {
      const acknowledged = await first(tx, `SELECT g.period_id FROM continuation_grants g
        JOIN continuation_commands c ON c.household_id=g.household_id AND c.command_id=g.command_id
        AND c.period_id=g.period_id AND c.entitlement_id=g.entitlement_id AND c.consent_epoch=g.consent_epoch
        AND c.policy_version=g.policy_version AND c.actor_id=g.actor_id AND c.canonical_digest=g.canonical_digest
        AND c.primary_commit_id=g.primary_commit_id AND c.result_ref=g.result_ref
        WHERE g.household_id=$1 AND g.period_id=$2 AND g.entitlement_id=$3
        AND g.policy_version='TEST-CONTINUATION-v1' AND c.acknowledged=true
        AND g.durability_ref='continuation-fsync:'||c.record_id::text
        AND g.consent_epoch=(SELECT max(consent_epoch) FROM service_consents WHERE household_id=$1)`,
        [household,period,row.entitlement_id]);
      if (!acknowledged) fail('denied');
    }
    return row;
  }
  async function totals(tx, household, period) {
    const row = await first(tx, `SELECT count(*) FILTER (WHERE state='pending')::int AS pending,
      count(*) FILTER (WHERE state='reserved')::int AS reserved,
      count(*) FILTER (WHERE state='consumed')::int AS consumed
      FROM entitlement_claims WHERE household_id=$1 AND period_id=$2`, [household, period]);
    return row;
  }
  function nowMillis() {
    const value = clock();
    if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) fail('validation_failed');
    return value;
  }
  return {
    activateTrial(tx, trustedScope, command, policy) {
      return operation(tx, async () => {
        exact(command, ['command_id', 'entitlement_id'], ['child_id']); text(command.command_id); uuid(command.entitlement_id);
        exact(policy, ['synthetic', 'policy_version', 'allowance', 'duration_seconds', 'allocation_scope']);
        if (policy.synthetic !== true || !['household', 'child'].includes(policy.allocation_scope)) fail('validation_failed');
        text(policy.policy_version); integer(policy.allowance); integer(policy.duration_seconds);
        if (policy.allocation_scope === 'child') uuid(command.child_id);
        else if (Object.hasOwn(command, 'child_id')) fail('validation_failed');
        await authorize(tx, trustedScope);
        const h = trustedScope.household_id;
        if (!await first(tx, 'SELECT entitlement_id FROM entitlements WHERE household_id=$1 AND entitlement_id=$2 FOR UPDATE', [h, command.entitlement_id])) fail('denied');
        const existing = await first(tx, 'SELECT * FROM entitlement_periods WHERE household_id=$1 AND entitlement_id=$2 FOR UPDATE', [h, command.entitlement_id]);
        if (policy.allocation_scope === 'child' && !await first(tx, 'SELECT child_id FROM children WHERE household_id=$1 AND child_id=$2', [h, command.child_id])) fail('denied');
        const hash = digest({kind:'activate', scope:trustedScope, command, policy});
        const previous = await prior(tx, h, command.command_id, hash);
        if (previous) return previous;
        let result;
        if (existing) {
          if (canonical(existing.policy_json) !== canonical(policy) || existing.child_id !== (command.child_id ?? null)) fail('conflict');
          result = {uncommitted:true, period_id:existing.period_id, trial_start:iso(existing.trial_start), trial_end:iso(existing.trial_end), allowance:Number(existing.allowance), policy_version:existing.policy_version};
        } else {
          const start = nowMillis(), end = start + policy.duration_seconds * 1000;
          if (!Number.isSafeInteger(end) || !Number.isFinite(new Date(end).getTime()) || end <= start) fail('validation_failed');
          result = {uncommitted:true, period_id:randomUUID(), trial_start:iso(start), trial_end:iso(end), allowance:policy.allowance, policy_version:policy.policy_version};
          await tx.query(`INSERT INTO entitlement_periods(household_id,period_id,entitlement_id,policy_version,allowance,allocation_scope,child_id,trial_start,trial_end,policy_json)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
          [h, result.period_id, command.entitlement_id, policy.policy_version, policy.allowance, policy.allocation_scope, command.child_id ?? null, result.trial_start, result.trial_end, JSON.stringify(policy)]);
        }
        await record(tx, h, command.command_id, 'activate', hash, result.period_id, result);
        return result;
      });
    },
    apply(tx, trustedScope, transition, binding = {}) {
      return operation(tx, async () => {
        exact(transition, ['contract_version','transition_id','request_id','period_id','policy_version','expected_version','consent_epoch','quantity','kind','from','to','cause','cause_id']);
        const t = transition;
        for (const k of ['transition_id','policy_version','cause_id']) text(t[k]);
        uuid(t.request_id); uuid(t.period_id); integer(t.expected_version, 0, Number.MAX_SAFE_INTEGER - 1); integer(t.consent_epoch);
        const valid = t.contract_version === '1.1.0' && t.quantity === 1 && (
          (t.kind === 'hold' && t.from === 'none' && t.to === 'pending' && t.cause === 'SubmitProduction' && t.expected_version === 0) ||
          (t.kind === 'reserve' && t.from === 'pending' && t.to === 'reserved' && t.cause === 'AcceptRequest' && t.expected_version >= 1) ||
          (t.kind === 'consume' && t.from === 'reserved' && t.to === 'consumed' && t.cause === 'MakeAssignmentReady' && t.expected_version >= 1) ||
          (t.kind === 'release' && ['pending','reserved'].includes(t.from) && t.to === 'released' && ['DeclineRequest','CancelRequest'].includes(t.cause) && t.expected_version >= 1));
        if (!valid) fail('validation_failed');
        if (t.kind === 'consume') { exact(binding, ['assignment_id']); uuid(binding.assignment_id); }
        else exact(binding, []);
        await authorize(tx, trustedScope);
        if (t.consent_epoch !== trustedScope.consent_epoch) fail('denied');
        const h = trustedScope.household_id;
        const request = await first(tx, 'SELECT child_id,original_received_at FROM wonder_requests WHERE household_id=$1 AND request_id=$2 FOR UPDATE', [h, t.request_id]);
        if (!request) fail('denied');
        const period = await lockPeriod(tx, h, t.period_id);
        if (period.policy_version !== t.policy_version) fail('conflict');
        if (period.allocation_scope === 'child' && period.child_id !== request.child_id) fail('denied');
        const claim = await first(tx, 'SELECT * FROM entitlement_claims WHERE household_id=$1 AND request_id=$2 FOR UPDATE', [h, t.request_id]);
        const hash = digest({kind:'transition', scope:trustedScope, transition:t, binding});
        const previous = await prior(tx, h, t.transition_id, hash);
        if (previous) return previous;
        if (await first(tx, 'SELECT transition_id FROM entitlement_transitions WHERE household_id=$1 AND cause=$2 AND cause_id=$3', [h,t.cause,t.cause_id])) fail('conflict');
        if (t.kind === 'hold') {
          if (claim) fail('conflict');
          const received = request.original_received_at === null ? NaN : new Date(request.original_received_at).getTime();
          if (!Number.isFinite(received) || received < new Date(period.trial_start).getTime()
            || received >= new Date(period.trial_end).getTime() || received > nowMillis()) fail('ineligible');
          const used = await totals(tx, h, t.period_id);
          if (used.pending + used.reserved + used.consumed >= Number(period.allowance)) fail('quota_full');
        } else if (!claim || claim.period_id !== t.period_id || claim.state !== t.from || Number(claim.version) !== t.expected_version) fail('conflict');
        if (t.kind === 'consume') {
          // Relational fixture evidence only. WM08 owns exact current review,
          // approval, readiness and capacity completion in this outer transaction.
          const published = await first(tx, `SELECT r.revision_id FROM adventure_revisions r
            JOIN published_revisions p ON p.household_id=r.household_id AND p.revision_id=r.revision_id
            WHERE r.household_id=$1 AND r.request_id=$2 AND r.status='published'
            AND EXISTS (SELECT 1 FROM assignments a WHERE a.household_id=r.household_id
              AND a.revision_id=r.revision_id AND a.request_id=r.request_id AND a.assignment_id=$3 AND a.child_id=$4)
            ORDER BY r.revision_id FOR UPDATE OF r,p`, [h,t.request_id,binding.assignment_id,request.child_id]);
          if (!published) fail('denied');
          if (!await first(tx, `SELECT assignment_id FROM assignments WHERE household_id=$1 AND assignment_id=$2
            AND request_id=$3 AND child_id=$4 AND revision_id=$5 FOR UPDATE`, [h,binding.assignment_id,t.request_id,request.child_id,published.revision_id])) fail('denied');
        }
        const version = t.expected_version + 1;
        if (t.kind === 'hold') await tx.query('INSERT INTO entitlement_claims(household_id,request_id,period_id,state,version) VALUES($1,$2,$3,$4,$5)', [h,t.request_id,t.period_id,t.to,version]);
        else await tx.query('UPDATE entitlement_claims SET state=$3,version=$4 WHERE household_id=$1 AND request_id=$2', [h,t.request_id,t.to,version]);
        const result = {uncommitted:true, period_id:t.period_id, request_id:t.request_id, transition_id:t.transition_id, state:t.to, version};
        await record(tx,h,t.transition_id,'transition',hash,t.period_id,result);
        await tx.query(`INSERT INTO entitlement_transitions(household_id,transition_id,request_id,period_id,contract_version,policy_version,expected_version,consent_epoch,quantity,kind,"from","to",cause,cause_id,binding)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
        [h,t.transition_id,t.request_id,t.period_id,t.contract_version,t.policy_version,t.expected_version,t.consent_epoch,t.quantity,t.kind,t.from,t.to,t.cause,t.cause_id,JSON.stringify(binding)]);
        return result;
      });
    },
    readAllowance(tx, trustedScope, input) {
      return operation(tx, async () => {
        exact(input, ['period_id']); uuid(input.period_id);
        await authorize(tx, trustedScope);
        const period = await lockPeriod(tx,trustedScope.household_id,input.period_id);
        const counts = await totals(tx,trustedScope.household_id,input.period_id);
        const allowance = Number(period.allowance);
        return {uncommitted:true, period_id:input.period_id, ...counts, remaining:allowance-counts.pending-counts.reserved-counts.consumed, allowance};
      });
    },
  };
}
