import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CONSENT_TEXT, CONSENT_VERSION } from '../lib/interest-list-copy';

export default function InterestList() {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [removalLink, setRemovalLink] = useState('');
  const [removed, setRemoved] = useState(false);
  const [token, setToken] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get('leave'),
  );
  useEffect(() => {
    const onHashChange = () =>
      setToken(new URLSearchParams(window.location.hash.slice(1)).get('leave'));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => {
    if (token) document.getElementById('interest-management')?.scrollIntoView();
  }, [token]);
  async function send(body: object) {
    const response = await fetch('/api/interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok || !result.ok)
      throw new Error(result.error || 'Please try again later.');
    return result;
  }
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setStatus('');
    try {
      const result = await send({
        action: 'join',
        email: form.get('email'),
        consent: form.get('consent') === 'on',
        consentVersion: CONSENT_VERSION,
        website: form.get('website'),
      });
      setJoined(true);
      if (result.removalToken)
        setRemovalLink(
          `${window.location.origin}/#leave=${result.removalToken}`,
        );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Please try again later.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    setStatus('');
    try {
      await send({ action: 'leave', token });
      setRemoved(true);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Please try again later.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (token)
    return (
      <div className="interest-form" id="interest-management">
        <h3>Leave the interest list</h3>
        {removed ? (
          <p role="status">
            You’ve been removed. Your email has been deleted from this list.
          </p>
        ) : (
          <>
            <p>
              Use this private link to remove your sign-up. This takes effect
              immediately.
            </p>
            <button
              className="about-cta"
              type="button"
              disabled={busy}
              onClick={leave}
            >
              {busy ? 'Removing…' : 'Remove my sign-up'}
            </button>
          </>
        )}
        <p role="alert">{status}</p>
      </div>
    );
  if (joined)
    return (
      <div className="interest-form">
        <h3 role="status">Thanks—you’re on the interest list.</h3>
        <p>
          If this email was already listed, we’ve kept the existing sign-up.
          There’s no pilot place or payment commitment yet.
        </p>
        {removalLink && (
          <>
            <p>
              Save this private link to leave the list later. We don’t send an
              automatic email.
            </p>
            <a className="removal-link" href={removalLink}>
              Your private removal link
            </a>
          </>
        )}
      </div>
    );
  return (
    <form className="interest-form" onSubmit={join}>
      <label htmlFor="interest-email">Your email (parent or grown-up)</label>
      <input
        id="interest-email"
        type="email"
        name="email"
        required
        maxLength={254}
        autoComplete="email"
        placeholder="you@example.com"
        aria-describedby="interest-privacy"
      />
      <div className="interest-honeypot" aria-hidden="true">
        <label>
          Leave this field blank
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="interest-consent">
        <input type="checkbox" name="consent" required />
        <span>{CONSENT_TEXT}</span>
      </label>
      <button className="about-cta" type="submit" disabled={busy}>
        {busy ? 'Joining…' : 'Join the interest list'}{' '}
        <span aria-hidden="true">→</span>
      </button>
      <p id="interest-privacy" className="interest-privacy">
        Rasna will use your email only for Curiosity Loop pilot invitations and
        project updates. It is stored privately with Vercel, alongside the date
        and your permission. We don’t ask for your child’s name or questions. A
        private removal link is shown after a new sign-up.{' '}
        <a href="#interest-privacy-details">More about your data</a>
      </p>
      <p role="alert">{status}</p>
    </form>
  );
}
