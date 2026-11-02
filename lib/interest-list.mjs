import { createHmac, timingSafeEqual } from 'node:crypto';

export const CONSENT_VERSION = 'interest-2026-11-02';
export const CONSENT_TEXT =
  'I am 18 or older and would like Curiosity Loop to email me about future pilot places and project updates.';
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const reply = (data, status = 200) => Response.json(data, { status, headers });
const hash = (secret, value) =>
  createHmac('sha256', secret).update(value).digest('hex');

export function createInterestHandler({
  create,
  remove,
  secret,
  now = Date.now,
  log = () => {},
}) {
  return async function handle(request) {
    if (request.method !== 'POST')
      return reply({ error: 'Use the interest form to join.' }, 405);
    if (!secret || secret.length < 32)
      return reply(
        {
          error: 'The list is temporarily unavailable. Please try again later.',
        },
        503,
      );
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return reply({ error: 'Please use the form on this website.' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return reply({ error: 'Invalid request.' }, 415);
    let data;
    try {
      const raw = await request.text();
      if (raw.length > 2048)
        return reply({ error: 'This submission is too large.' }, 413);
      data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error();
    } catch {
      return reply({ error: 'Please check the form and try again.' }, 400);
    }
    try {
      if (data.action === 'leave') {
        const token = typeof data.token === 'string' ? data.token : '';
        if (!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token))
          return reply({ error: 'This removal link is invalid.' }, 400);
        const [id, signature] = token.split('.');
        const expected = hash(secret, `leave:${id}`);
        if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
          return reply({ error: 'This removal link is invalid.' }, 400);
        await remove(`interest/signups/${id}.json`);
        return reply({ ok: true });
      }
      if (data.action !== 'join')
        return reply({ error: 'Invalid request.' }, 400);
      if (data.website) return reply({ ok: true }); // Honeypot, never store the submission.
      const email =
        typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
        return reply(
          { error: 'Please enter a valid adult email address.' },
          400,
        );
      if (data.consent !== true || data.consentVersion !== CONSENT_VERSION)
        return reply(
          { error: 'Please agree to the contact permission below.' },
          400,
        );
      // One write per network per minute. Vercel supplies this header; raw IPs are never saved.
      const ip =
        request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
        'unknown';
      const minute = Math.floor(now() / 60000);
      const reserved = await create(
        `interest/limits/${minute}/${hash(secret, `ip:${ip}`)}.json`,
        '{}',
      );
      if (!reserved)
        return reply(
          { error: 'Please wait a minute before submitting again.' },
          429,
        );
      const id = hash(secret, `email:${email}`);
      const created = await create(
        `interest/signups/${id}.json`,
        JSON.stringify({
          email,
          joinedAt: new Date(now()).toISOString(),
          consentVersion: CONSENT_VERSION,
          consentText: CONSENT_TEXT,
          source: 'homepage',
          emailVerified: false,
        }),
      );
      // A repeated signup must not expose the original subscriber's removal link.
      return reply({
        ok: true,
        ...(created
          ? { removalToken: `${id}.${hash(secret, `leave:${id}`)}` }
          : {}),
      });
    } catch {
      log('interest_list_storage_failure'); // No submitted data, tokens, or provider error messages.
      return reply(
        { error: 'We could not save that just now. Please try again later.' },
        503,
      );
    }
  };
}
