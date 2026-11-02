import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInterestHandler,
  CONSENT_VERSION,
} from '../lib/interest-list.mjs';

function setup() {
  const records = new Map();
  let time = Date.now();
  const handler = createInterestHandler({
    secret: 'a'.repeat(64),
    now: () => time,
    create: async (path, value) => {
      if (records.has(path)) return false;
      records.set(path, value);
      return true;
    },
    remove: async (path) => records.delete(path),
  });
  const request = (body, origin = 'https://example.com') =>
    handler(
      new Request('https://example.com/api/interest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin,
          'x-vercel-forwarded-for': '192.0.2.1',
        },
        body: JSON.stringify(body),
      }),
    );
  const signup = {
    action: 'join',
    email: ' PARENT@example.com ',
    consent: true,
    consentVersion: CONSENT_VERSION,
  };
  return { records, request, signup, advance: () => (time += 61000) };
}
test('saves adult email and consent privately, deduplicates without leaking removal token', async () => {
  const s = setup();
  const first = await s.request(s.signup);
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.match(result.removalToken, /^[a-f0-9]{64}\.[a-f0-9]{64}$/);
  const entries = [...s.records].filter(([p]) =>
    p.startsWith('interest/signups/'),
  );
  assert.equal(entries.length, 1);
  assert.equal(JSON.parse(entries[0][1]).email, 'parent@example.com');
  assert.ok(!entries[0][0].includes('parent'));
  assert.ok(!JSON.stringify([...s.records.keys()]).includes('192.0.2.1'));
  s.advance();
  const repeated = await s.request(s.signup);
  assert.equal((await repeated.json()).removalToken, undefined);
});
test('rejects missing permission, invalid email, cross-origin requests and oversized data without storage writes', async () => {
  const s = setup();
  for (const body of [
    { ...s.signup, consent: false },
    { ...s.signup, email: 'not-an-email' },
    { ...s.signup, consentVersion: 'old' },
  ])
    assert.equal((await s.request(body)).status, 400);
  assert.equal(
    (await s.request(s.signup, 'https://attacker.example')).status,
    403,
  );
  assert.equal(
    (await s.request({ ...s.signup, extra: 'a'.repeat(2100) })).status,
    413,
  );
  assert.equal(s.records.size, 0);
});
test('throttles repeated network submissions and silently discards honeypot entries', async () => {
  const s = setup();
  await s.request(s.signup);
  assert.equal(
    (await s.request({ ...s.signup, email: 'other@example.com' })).status,
    429,
  );
  s.advance();
  await s.request({ ...s.signup, website: 'spam' });
  assert.equal(
    [...s.records.keys()].filter((p) => p.startsWith('interest/signups/'))
      .length,
    1,
  );
});
test('only a valid private removal link deletes a signup; retries are idempotent', async () => {
  const s = setup();
  const result = await (await s.request(s.signup)).json();
  assert.equal(
    (
      await s.request({
        action: 'leave',
        token: result.removalToken.slice(0, -1) + 'z',
      })
    ).status,
    400,
  );
  assert.equal(
    (await s.request({ action: 'leave', token: result.removalToken })).status,
    200,
  );
  assert.equal(
    [...s.records.keys()].filter((p) => p.startsWith('interest/signups/'))
      .length,
    0,
  );
  assert.equal(
    (await s.request({ action: 'leave', token: result.removalToken })).status,
    200,
  );
});
test('storage failure is a failure response, never a false confirmation', async () => {
  const handler = createInterestHandler({
    secret: 'a'.repeat(64),
    create: async () => {
      throw new Error('private provider details');
    },
    remove: async () => {},
  });
  const response = await handler(
    new Request('https://example.com/api/interest', {
      method: 'POST',
      headers: {
        origin: 'https://example.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'join',
        email: 'a@example.com',
        consent: true,
        consentVersion: CONSENT_VERSION,
      }),
    }),
  );
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('private provider details'));
});
