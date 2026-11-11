import React, {useState} from 'react';
import {getDiscoveryView} from '../lib/loop/discovery.mjs';
import './loop-discovery.css';

type Props = {snapshot?: unknown; clock?: () => number};
type FixtureState = 'open' | 'full' | 'paused' | 'unknown';

function exampleSnapshot(state: FixtureState, now: number) {
  if (state === 'unknown') return null;
  return {
    synthetic: true,
    version: 'discovery-example-v1',
    availability: state,
    expires_at: now + 3600000,
    offer: {
      version: 'fictional-example-v1',
      price_text: 'Fictional example price: no purchase is available.',
      trial_text: 'Fictional example trial: no trial is available.',
      allocation_text: 'Fictional example allocation: no investigations are allocated.',
      activation_text: 'Fictional example activation: nothing is activated here.',
      territory: 'US',
    },
  };
}

export default function LoopDiscovery({snapshot, clock = Date.now}: Props) {
  const fixturesEnabled = snapshot === undefined;
  const [fixture, setFixture] = useState(() => exampleSnapshot('unknown', clock()));
  const [optIn, setOptIn] = useState(false);
  const [interestResult, setInterestResult] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState(false);
  const [joinResult, setJoinResult] = useState(false);
  const [, refresh] = useState(0);
  const currentSnapshot = fixturesEnabled ? fixture : snapshot;
  const view = getDiscoveryView(currentSnapshot, clock());
  const status = {
    open: 'Open in this synthetic example. Real joining is unavailable in this local preview.',
    full: 'Full in this synthetic example. Joining is unavailable; no place or delivery is promised.',
    paused: 'Paused in this synthetic example. Joining is unavailable; no place or delivery is promised.',
    unknown: 'Availability unknown or unconfirmed. Joining is unavailable; no place or delivery is promised.',
  }[view.state as FixtureState];

  function changeFixture(state: FixtureState) {
    setFixture(exampleSnapshot(state, clock()));
    setOptIn(false);
    setInterestResult(false);
    setRecoveryResult(false);
    setJoinResult(false);
  }

  function join() {
    const fresh = getDiscoveryView(currentSnapshot, clock());
    setJoinResult(fresh.canJoin);
    refresh(value => value + 1);
  }

  return (
    <main className="loop-discovery">
      <a className="discovery-skip" href="#discovery-family">Skip to discovery</a>
      <p className="discovery-label">Local synthetic preview · no real joining</p>
      {fixturesEnabled && (
        <details className="discovery-fixtures">
          <summary>Developer fixture states</summary>
          <p>Explore fictional availability. These controls do not change a real service.</p>
          <div className="discovery-actions">
            {(['open', 'full', 'paused', 'unknown'] as const).map(state => (
              <button type="button" key={state} data-testid={`fixture-${state}`}
                onClick={() => changeFixture(state)}>{state}</button>
            ))}
          </div>
        </details>
      )}
      <section id="discovery-family" data-testid="discovery-family" aria-labelledby="discovery-title">
        <header>
          <p className="discovery-label">Curiosity Loop · United States (US) · ages 5–8</p>
          <h1 id="discovery-title">Follow a little wonder together.</h1>
          <p>A child brings the curiosity. A parent or grown-up explores alongside them, helps read and asks what they think will happen.</p>
        </header>
        <section className="discovery-card" aria-labelledby="demo-heading">
          <h2 id="demo-heading">Try an anonymous demo</h2>
          <p>No signup is required. These demos ask for no private child identity and do not create a private child history.</p>
          <div className="discovery-actions">
            <a href="/ocean-sound-explorer">Ocean Sound Explorer</a>
            <a href="/make-the-moon">Make the Moon</a>
          </div>
        </section>
        <section className="discovery-card" aria-labelledby="service-heading">
          <h2 id="service-heading">How reviewed investigations work</h2>
          <p>The planned service uses an AI-generated draft, followed by validation and mandatory human review, editing and playtesting before exact-version approval. A draft is never ready for children simply because AI produced it.</p>
          <p>The 24-hour commitment starts only at the confirmed original production-request receipt. Trying a demo, signing up or later operator acceptance never starts or resets that clock. This preview receives no production requests and promises no delivery.</p>
        </section>
        <section className="discovery-card" aria-labelledby="availability-heading">
          <h2 id="availability-heading">Availability</h2>
          <p data-testid="availability-status" role="status">{status}</p>
          {view.offer && (
            <div data-testid="offer" className="discovery-offer">
              <h3>Fictional example terms</h3>
              <p>These supplied synthetic terms are not an approved commercial offer.</p>
              <p>{view.offer.price_text}</p>
              <p>{view.offer.trial_text}</p>
              <p>{view.offer.allocation_text}</p>
              <p>{view.offer.activation_text}</p>
              <p>Geography: {view.offer.territory}</p>
            </div>
          )}
          <div className="discovery-actions">
            {view.canJoin && <button type="button" data-testid="join" onClick={join}>Join</button>}
            <button type="button" data-testid="adult-recovery" onClick={() => setRecoveryResult(true)}>Existing adult? Regain access</button>
          </div>
          {view.canJoin && joinResult && <p data-testid="join-result" role="status">Joining is not available in this local preview. No account, receipt or place has been created.</p>}
          {recoveryResult && <p data-testid="adult-recovery-result" role="status">Adult recovery is unavailable in this local preview. No identity check was performed and no reset was sent.</p>}
        </section>
        <section className="discovery-card" aria-labelledby="interest-heading">
          <h2 id="interest-heading">Optional adult interest demonstration</h2>
          <p>This separate choice is optional and is never required for Join. No contact details are collected here.</p>
          <label className="discovery-checkbox">
            <input type="checkbox" data-testid="interest-opt-in" checked={optIn}
              onChange={event => {setOptIn(event.target.checked); setInterestResult(false);}}/>
            <span>I choose to preview the optional adult-interest action.</span>
          </label>
          <button type="button" data-testid="interest-preview" disabled={!optIn}
            onClick={() => {if (optIn) setInterestResult(true);}}>Preview interest action</button>
          {interestResult && <p data-testid="interest-result" role="status">Not saved or sent. This is a local demonstration only; no consent or subscription has been recorded.</p>}
        </section>
      </section>
      <nav aria-label="Preview navigation"><a href="/loop-preview">Return to the local preview</a></nav>
    </main>
  );
}
