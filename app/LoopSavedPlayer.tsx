import React, {useEffect, useRef, useState} from 'react';
import {createSavedPlayerClient} from '../lib/loop/saved-player.mjs';
import {createFixedAudio, fixedLines} from '../lib/loop/fixed-audio.mjs';
import './loop-saved-player.css';

const guesses: Record<string,string> = {stable: 'Stays steady', tips: 'Tips over', not_sure: 'Not sure yet'};
const places: Record<string,string> = {balanced: 'Block in the middle', offset: 'Block near the edge'};
const results: Record<string,string> = {stable: 'Stayed steady', tips: 'Tipped over'};
const uuid = (v: string | null) => v !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
async function request(path: string, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal});
    return {status: response.status, body: await response.json()};
  } finally { clearTimeout(timer); }
}
function Balance({configuration, outcome}: {configuration: string | null; outcome?: string | null}) {
  return <figure className="saved-model"><svg viewBox="0 0 320 180" role="img"
    aria-label={`${configuration ? places[configuration] : 'Choose a position'}. ${outcome ? results[outcome] : 'Not tested yet'}.`}>
    <path d="M140 158 L160 112 L180 158 Z" fill="#408996"/>
    <path d="M105 162 H215" stroke="#214858" strokeWidth="7" strokeLinecap="round"/>
    <g transform={`rotate(${outcome === 'tips' ? 14 : 0} 160 106)`}>
      <rect x="38" y="100" width="244" height="12" rx="6" fill="#81543a"/>
      {configuration && <rect x={configuration === 'offset' ? 236 : 138} y="50" width="44" height="48" rx="7" fill="#efb62e" stroke="#5a3c12" strokeWidth="3"/>}
    </g>
  </svg><figcaption>{configuration ? places[configuration] : 'Choose a block position'} · {outcome ? results[outcome] : 'Not tested yet'}</figcaption></figure>;
}
function Sound({active}: {active: boolean}) {
  const audio = useRef<HTMLAudioElement>(null);
  const media = useRef<ReturnType<typeof createFixedAudio> | null>(null);
  const muted = useRef(true);
  const [state, setState] = useState({muted: true, status: 'muted', line_id: null as string | null});
  useEffect(() => {
    if (!active || !audio.current) return;
    const controller = createFixedAudio({audio: audio.current, onState: setState});
    media.current = controller; controller.mute(muted.current);
    return () => {media.current = null; controller.destroy();};
  }, [active]);
  return <section aria-label="Optional system sound"><audio ref={audio} preload="none" data-testid="system-audio"/>
    <p data-testid="audio-text">{fixedLines.ready.text}</p>
    <div className="saved-buttons"><button type="button" data-testid="audio-play" disabled={!active} onClick={() => media.current?.play('ready')}>Listen</button>
      <button type="button" data-testid="audio-replay" disabled={!active} onClick={() => media.current?.replay()}>Replay sound</button>
      <button type="button" data-testid="audio-mute" disabled={!active} aria-pressed={state.muted} onClick={() => {muted.current = !muted.current; media.current?.mute(muted.current);}}>{state.muted ? 'Unmute sound' : 'Mute sound'}</button></div>
    <p data-testid="audio-status" role="status">{state.status === 'unavailable' ? 'Sound unavailable. The words remain here; you can keep investigating.' : state.muted ? 'Sound muted. Unmute, then press Listen if you want sound.' : state.status === 'playing' ? 'Sound playing.' : 'Sound is optional. Press Listen to start.'}</p>
    <p>Synthetic test tone only; not an approved voice recording.</p>
  </section>;
}
export default function LoopSavedPlayer() {
  const [client] = useState(() => createSavedPlayerClient({request}));
  const [snap, setSnap] = useState(() => client.snapshot());
  const [view, setView] = useState<'opening' | 'playing' | 'ending'>('opening');
  const [reloadChoice, setReloadChoice] = useState(false);
  const [localError, setLocalError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    const unsubscribe = client.subscribe(next => {if (active) setSnap(next);});
    const params = new URL(window.location.href).searchParams;
    const play = params.get('play');
    if (params.size > 1 || (params.size === 1 && !params.has('play')) || (play !== null && !uuid(play))) {
      setLocalError('Unsupported local play address. Return to the preview shell.');
    } else {void client.open(play).catch(() => {if (active) setLocalError('Local play unavailable. Return to the preview shell.');});}
    return () => {active = false; unsubscribe();};
  }, [client]);
  useEffect(() => {
    if (snap.phase !== 'ready' || !snap.play_id) return;
    const url = new URL(window.location.href);
    url.search = ''; url.searchParams.set('play', snap.play_id); url.hash = '';
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [snap.phase, snap.play_id]);
  useEffect(() => {heading.current?.focus();}, [view, snap.play_id, snap.phase === 'denied']);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (snap.pending_action_id || snap.phase === 'pending' || snap.phase === 'loading') {event.preventDefault(); event.returnValue = '';}
    };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [snap.pending_action_id, snap.phase]);
  const state = snap.confirmed?.checkpoint.state;
  const adventure = snap.adventure;
  const ready = snap.phase === 'ready';
  const busy = snap.phase === 'loading' || snap.phase === 'pending';
  const invoke = async (work: () => Promise<unknown>) => {
    setLocalError('');
    try {await work();} catch {setLocalError('That action is unavailable until the current operation is confirmed or reloaded.');}
  };
  // Entering play is a current Resume read, never another Start or Replay.
  // Recheck after the introduction or paused recap rather than enabling controls
  // from a receipt that may have become stale while the parent was reading.
  const enterPlay = () => void invoke(async () => {
    const selected = client.snapshot();
    if (selected.phase !== 'ready' || !selected.play_id) return;
    const playId = selected.play_id;
    const resumed = await client.open(playId);
    if (resumed.phase === 'ready' && resumed.play_id === playId) setView('playing');
  });
  const send = (action: Parameters<typeof client.dispatch>[0]) => void invoke(() => client.dispatch(action));
  const retryOriginal = () => void invoke(async () => {
    const previousPlay = client.snapshot().play_id;
    const reconciled = await client.retry();
    if (reconciled.phase === 'ready' && reconciled.play_id !== previousPlay) {
      setView('opening');
      setReloadChoice(false);
    }
  });
  const status = snap.phase === 'ready' ? 'Confirmed on this local server'
    : snap.phase === 'idle' ? 'Not opened. Waiting for the local fixture.'
      : snap.phase === 'loading' ? 'Opening the local server play…'
        : snap.phase === 'pending' ? 'Saving / Pending — not confirmed. Retry the original operation.'
          : snap.phase === 'conflict' ? 'Conflict. Reload confirmed progress before continuing.'
            : snap.phase === 'denied' ? 'Access closed. Play content is unavailable.' : 'Not confirmed. Retry or reload the local server state.';
  return <main className="saved-player" data-testid="saved-root" data-play-id={snap.play_id ?? ''}
    data-revision-id={adventure?.revision_id ?? ''} aria-labelledby="saved-title">
    <p className="saved-label">Synthetic · unreviewed · local-server-only</p>
    <h1 id="saved-title" ref={heading} tabIndex={-1}>{view === 'ending' ? 'Pause and look back' : 'Your idea comes first'}</h1>
    <p data-testid="saved-status" data-phase={snap.phase} role="status" aria-live="polite">{status}</p>
    {snap.error && <p role="alert">{snap.error}</p>}{localError && <p role="alert">{localError}</p>}
    <p>Local test only. Confirmed progress returns on refresh while this demo server keeps running. Stopping it ends access. Unconfirmed changes may be lost if you close or refresh.</p>
    {['pending', 'failed'].includes(snap.phase) && <button type="button" data-testid="saved-retry" onClick={retryOriginal}>Retry original operation</button>}
    {snap.phase !== 'denied' && !busy && <button type="button" onClick={() => setReloadChoice(true)}>Reload confirmed progress</button>}
    {reloadChoice && <section aria-label="Reload choice"><p>Reload discards the pending page intent. A command may already have reached the server. Reload reads that same play’s current confirmed state; it never merges or creates a replay.</p>
      <button type="button" onClick={() => {setReloadChoice(false); void invoke(() => client.reload());}}>Discard page intent and reload</button>
      <button type="button" onClick={() => setReloadChoice(false)}>Keep this page</button></section>}
    {state && adventure && <>
      {!ready && <p>Shown below: last-confirmed state only. No pending choice or result is presented as a new acknowledgement.</p>}
      {view === 'opening' && <section aria-label="Introduction"><p>{adventure.opening}</p>
        <p>Your role: propose a position and predict what will happen. Grown-up’s one job: read the words and ask, “What do you think will happen?”</p>
        <p>Start checks this play’s current confirmed progress and access on the local server.</p>
        <button type="button" data-testid="saved-start" disabled={!ready} onClick={enterPlay}>Start investigating</button></section>}
      {view === 'playing' && <section aria-label="Investigation">
        <p>{adventure.opening}</p>
        <fieldset disabled={!ready}><legend>1. What do you think will happen?</legend><div className="saved-buttons">{Object.keys(guesses).map(prediction => <button type="button" key={prediction} data-prediction={prediction} aria-pressed={state.prediction === prediction} onClick={() => send({kind: 'predict', prediction})}>{guesses[prediction]}</button>)}</div></fieldset>
        <fieldset disabled={!ready}><legend>2. Where will you put the block?</legend>
          <Balance configuration={state.current_result?.configuration ?? state.configuration} outcome={state.current_result?.outcome}/>
          <div className="saved-buttons">{Object.keys(places).map(configuration => <button type="button" key={configuration} data-configuration={configuration} aria-pressed={state.configuration === configuration} onClick={() => send({kind: 'configure', configuration})}>{places[configuration]}</button>)}</div>
        </fieldset>
        <button type="button" data-testid="saved-test" disabled={!ready || !state.prediction_action_id || !state.configuration_action_id}
          onClick={() => send({kind: 'test', prediction_action_id: state.prediction_action_id, configuration_action_id: state.configuration_action_id})}>3. Test</button>
        {state.current_result && <section aria-label="This try"><h2>This try</h2><p>{results[state.current_result.outcome]}</p><p>In this invented toy, {state.current_result.configuration === 'balanced' ? 'the middle position stays steady' : 'the edge position tips'}. The position determines the result.</p><p>Choose a fresh guess and position to try again.</p></section>}
        {adventure.engine_version === 'fixture-engine-2' && <section aria-label="Optional clues"><h2>Want a clue?</h2>
          <div className="saved-buttons">{[1,2,3].map(level => <button type="button" key={level} data-testid={`help-${level}`} disabled={!ready} aria-expanded={state.help_open && state.help_level === level} onClick={() => send({kind: 'help', level})}>{['A nudge','A bigger nudge','Show an example'][level - 1]}</button>)}</div>
          {state.help_open && <section data-testid="help-panel" aria-label="Optional clue"><p>{adventure.help[state.help_level - 1]}</p>
            {state.help_level === 3 && <div data-testid="show-it-example"><h3>Separate demonstration example · not your try</h3><Balance configuration="balanced" outcome="stable"/><Balance configuration="offset" outcome="tips"/></div>}
            <button type="button" data-testid="close-help" disabled={!ready} onClick={() => send({kind: 'close_help'})}>Close clue</button></section>}
          <button type="button" data-testid="side-thread-toggle" disabled={!ready} aria-expanded={state.side_thread_open} onClick={() => send({kind: 'side_thread', open: !state.side_thread_open})}>{state.side_thread_open ? 'Close optional question' : 'An optional pretend question'}</button>
          {state.side_thread_open && <p data-testid="side-thread">{adventure.side_thread}</p>}
        </section>}
      </section>}
      <section aria-labelledby="saved-tries"><h2 id="saved-tries">Your confirmed tries · incomplete play</h2>
        {!state.trials.length && <p>No Test yet. Choices alone do not produce a try.</p>}
        <ol className="saved-trials">{state.trials.map((trial, index) => <li key={trial.trial_id} data-testid="saved-trial"><h3>Try {index + 1}</h3><Balance configuration={trial.configuration} outcome={trial.outcome}/>
          <dl><dt>Guess</dt><dd>{guesses[trial.prediction]}</dd><dt>Position</dt><dd>{places[trial.configuration]}</dd><dt>Result</dt><dd>{results[trial.outcome]}</dd></dl></li>)}</ol>
        <button type="button" disabled={!ready || state.trials.length < 2} onClick={() => send({kind: 'compare', trial_ids: state.trials.slice(-2).map(trial => trial.trial_id)})}>Compare the latest two tries</button>
        {state.comparison && <p>Comparing tries {state.comparison.map(id => state.trials.findIndex(t => t.trial_id === id) + 1).join(' and ')}. Look at their positions, guesses and results above.</p>}
      </section>
      {view !== 'ending' ? <button type="button" onClick={() => setView('ending')}>Pause and look back</button> : <section aria-label="Paused recap">
        <p>This play is incomplete. Pausing does not create a completion event.</p>
        {(state.prediction_action_id || state.configuration_action_id) && <p>There are untested confirmed choices.</p>}
        <p>{state.trials.length > 1 ? 'What changed between the positions you tried?' : 'What would you like to try next?'}</p>
        <h2>An idea away from the screen</h2><p>{adventure.offscreen}</p>
        <p>Resume checks this play’s current confirmed progress and access on the local server.</p>
        <button type="button" disabled={!ready} onClick={enterPlay}>Resume this play</button>
        <p>New wonder intake and optional parent feedback are unavailable here. Nothing has been submitted or sent.</p>
      </section>}
      <button type="button" data-testid="saved-replay" disabled={!ready} onClick={() => void invoke(async () => {await client.replay(); if (client.snapshot().phase === 'ready') setView('opening');})}>Start a separate replay</button>
      <nav aria-label="Retained local plays"><h2>Other local plays</h2><p>Opening a retained play does not create a replay.</p>
        <div className="saved-buttons">{snap.history.filter(h => h.play_id !== snap.play_id).map(h => <button type="button" key={h.play_id} data-saved-play={h.play_id} disabled={!ready} onClick={() => void invoke(async () => {await client.open(h.play_id);setView('opening');})}>Play {snap.history.findIndex(item => item.play_id === h.play_id) + 1}: {h.trial_count === null ? 'confirmation pending' : `${h.trial_count} tries`} · incomplete</button>)}</div>
      </nav>
      <details><summary>For the grown-up: about this toy</summary><p>{adventure.limits}</p>
        <p>This test uses one invented household. It does not verify real parents or provide production storage. Confirmation covers only this running local server; its play list and replay tracking end when it stops.</p>
        <p>The old memory-only player and its three developer paths remain separate. This server selects one path; it is not a child score.</p></details>
      <Sound key={snap.play_id} active={view === 'playing' && snap.phase !== 'denied'}/>
    </>}
    <a href="/loop-preview">Return to preview shell</a>
  </main>;
}
