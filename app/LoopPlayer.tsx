import React, {useEffect, useRef, useState} from 'react';
import {createPlayer, validateAdventure} from '../lib/loop/player-engine.mjs';
import {fixtureAdventure} from '../lib/loop/fixture-adventure.mjs';
import {createAssistedPlayer, validateAssistedAdventure} from '../lib/loop/assisted-player.mjs';
import {assistedFixtureAdventure} from '../lib/loop/assisted-fixture.mjs';
import {endingFixtureAdventure} from '../lib/loop/ending-fixture.mjs';
import {createPlayerShell} from '../lib/loop/player-shell.mjs';
import {createFixedAudio, fixedLines} from '../lib/loop/fixed-audio.mjs';
import './loop-player.css';

type Adventure = typeof fixtureAdventure | typeof assistedFixtureAdventure;
type Path = 'fast' | 'medium' | 'slow';
type Player = ReturnType<typeof createAssistedPlayer>;
type Players = {fast: Player | null; medium: Player; slow: Player | null};
type IdRequest = {kind: 'start' | 'replay'; path: Path; from_play_id: string | null; revision_id: string};
type Action = {kind: 'predict'; prediction: string} | {kind: 'configure'; configuration: string}
  | {kind: 'test'; prediction_action_id: string; configuration_action_id: string}
  | {kind: 'compare'; trial_ids: string[]} | {kind: 'help'; level: number}
  | {kind: 'close_help'} | {kind: 'side_thread'; open: boolean};
const predictionLabels: Record<string,string> = {stable: 'Stays steady', tips: 'Tips over', not_sure: 'Not sure yet'};
const configurationLabels: Record<string,string> = {balanced: 'Block in the middle', offset: 'Block near the edge'};
const outcomeLabels: Record<string,string> = {stable: 'Stayed steady', tips: 'Tipped over'};
const pathInstructions: Record<Path,string> = {
  fast: 'Try your idea. More clues are here if you want them.',
  medium: 'Guess what will happen, choose a block position, then Test and compare.',
  slow: 'First choose a guess. Next choose a place. Then press Test. You can ask for a clue any time.',
};
function browserCryptoUUID(_request: IdRequest) {
  return globalThis.crypto.randomUUID();
}
function Unavailable() {
  return <main className="loop-player" aria-labelledby="player-unavailable">
    <h1 id="player-unavailable">Toy preview unavailable</h1>
    <p role="alert">This adventure or local play identity is unsupported. No test can run.</p>
    <a href="/loop-preview">Return to preview</a>
  </main>;
}
export default function LoopPlayer({adventure = endingFixtureAdventure, showShell = true, newPlayId = browserCryptoUUID}:
  {adventure?: Adventure; showShell?: boolean; newPlayId?: (request: IdRequest) => string}) {
  let valid: Adventure;
  try {
    if (typeof showShell !== 'boolean') throw new TypeError();
    if (showShell) validateAssistedAdventure(adventure);
    else if (adventure.engine_version === 'fixture-engine-1') validateAdventure(adventure);
    else validateAssistedAdventure(adventure);
    valid = structuredClone(adventure);
  } catch { return <Unavailable/>; }
  return showShell ? <ShellSession key={JSON.stringify(valid)} adventure={valid} newPlayId={newPlayId}/>
    : <PlayerSession key={JSON.stringify(valid)} adventure={valid}/>;
}
function ShellSession({adventure, newPlayId}: {adventure: Adventure; newPlayId: (request: IdRequest) => string}) {
  const [shell] = useState(() => {
    try { return createPlayerShell(adventure, {newPlayId, consentEpoch: 1}); } catch { return null; }
  });
  const [, refresh] = useState(0);
  const [error, setError] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const snap = shell?.snapshot();
  const adapter = shell?.current();
  useEffect(() => {
    setFeedbackOpen(false);
    heading.current?.focus();
  }, [snap?.view, snap?.active_play_id]);
  if (!shell || !snap || !adapter) return <Unavailable/>;
  function intent(work: () => unknown) {
    try { work(); setError(''); refresh(n => n + 1); }
    catch { setError('That local navigation could not be prepared. Your current play and tries are unchanged. You can resume or try again.'); }
  }
  // Every other retained group stays reachable, even after returning to an older play.
  const groupIndex = snap.plays.findIndex(item => item.play_id === adapter.players.fast.snapshot().play_id);
  const otherPlays = snap.plays.map((item, index) => ({...item, groupNumber: Math.floor(index / 3) + 1}))
    .filter((_item, index) => index < groupIndex || index >= groupIndex + 3);
  return <main className="loop-player loop-shell" data-testid="shell-root" data-play-id={snap.active_play_id} aria-labelledby="shell-title">
    <p className="loop-player-label">Synthetic toy preview · unreviewed</p>
    <h1 id="shell-title" ref={heading} tabIndex={-1}>{snap.view === 'opening' ? 'Your idea comes first'
      : snap.view === 'playing' ? 'Investigate your idea' : snap.view === 'new-wonder' ? 'Another wonder' : 'Pause and look back'}</h1>
    <p className="loop-shell-memory">Local preview only. Nothing is saved or sent. Closing or refreshing this page loses these plays.</p>
    {error && <p role="alert">{error}</p>}
    {snap.view === 'opening' && <section aria-label="Introduction">
      <p>{adventure.opening}</p>
      <p>Your role: propose a position and predict what will happen. You can change your idea and try again.</p>
      <p>Grown-up’s one job: read the words and ask, “What do you think will happen?”</p>
      <details className="loop-player-limits"><summary>For the grown-up: about this toy</summary><p>{adventure.limits}</p></details>
      <div className="loop-player-choices"><button type="button" data-testid="start-play" onClick={() => intent(() => shell.start())}>Start investigating</button>
        <button type="button" data-testid="finish-play" onClick={() => intent(() => shell.finish())}>Pause and look back</button></div>
    </section>}
    <div hidden={snap.view !== 'playing'}>
      <PlayerSession key={adapter.session_id} adventure={adventure} providedPlayers={adapter.players}
        providedPath={adapter.path} active={snap.view === 'playing'}
        onPath={next => intent(() => shell.choosePath(next))}
        onFinish={() => intent(() => shell.finish())}/>
    </div>
    {snap.view === 'ending' && <>
      <section data-testid="ending-recap" aria-labelledby="recap-title">
        <h2 id="recap-title">Your actual tries · paused</h2>
        <p>This play is incomplete and can be resumed.</p>
        {!snap.recap.trials.length && <p>No Test yet. Your choices have not produced a try.</p>}
        {snap.recap.untested_choices && <p>There are untested choices. They remain ready in this play.</p>}
        <ol className="loop-player-trials">{snap.recap.trials.map((trial, index) => <li data-testid="recap-trial" key={trial.trial_id}>
          <h3>Try {index + 1}</h3><TrialFields trial={trial}/>
        </li>)}</ol>
        <p>{snap.recap.trials.length > 1 ? 'You can discuss: what changed between the positions you tried?'
          : snap.recap.trials.length === 1 ? 'You can discuss: what might you change for another try?'
            : 'You can discuss: what would you like to try first?'}</p>
      </section>
      <section data-testid="offscreen" aria-labelledby="offscreen-title"><h2 id="offscreen-title">An idea away from the screen</h2><p>{adventure.offscreen}</p></section>
      <div className="loop-player-choices"><button type="button" data-testid="resume-play" onClick={() => intent(() => shell.resume())}>Resume this play</button>
        <button type="button" data-testid="replay-play" onClick={() => intent(() => shell.replay())}>Start a separate replay</button>
        <button type="button" data-testid="new-wonder" onClick={() => intent(() => shell.newWonder())}>Another wonder</button></div>
      <section aria-label="Optional parent feedback">
        <button type="button" data-testid="feedback-toggle" aria-expanded={feedbackOpen} aria-controls={feedbackOpen ? 'parent-feedback' : undefined}
          onClick={() => setFeedbackOpen(value => !value)}>Optional: grown-up feedback</button>
        {feedbackOpen && <div id="parent-feedback"><p>Parent choice, only on this page:</p><div className="loop-player-choices">
          <button type="button" data-testid="feedback-fits" onClick={() => intent(() => shell.feedback('fits'))}>Fits for us</button>
          <button type="button" data-testid="feedback-different" onClick={() => intent(() => shell.feedback('different'))}>Something different</button>
          <button type="button" data-testid="feedback-not-now" onClick={() => intent(() => shell.feedback('not_now'))}>Not now</button>
        </div></div>}
        {snap.feedback && <p data-testid="feedback-status" role="status">Parent choice: {snap.feedback.choice === 'fits' ? 'Fits for us' : snap.feedback.choice === 'different' ? 'Something different' : 'Not now'}. Not saved or sent.</p>}
      </section>
      <details className="loop-player-limits"><summary>For the grown-up: about this toy</summary><p>{adventure.limits}</p></details>
    </>}
    {snap.view === 'new-wonder' && <section data-testid="new-wonder-handoff" aria-label="New wonder handoff">
      <p>New wonder intake is unavailable in this local preview. No question or production request has been submitted.</p>
      <p>A connected intake must ask you to confirm the child explicitly before continuing. This page does not select or confirm a real child.</p>
      <p>The current play remains here. No new investigation has been booked.</p>
      <button type="button" data-testid="back-to-ending" onClick={() => intent(() => shell.finish())}>Back to ending</button>
    </section>}
    {otherPlays.length > 0 && <details className="loop-player-limits"><summary>For the grown-up: other local plays</summary>
      <p>Return to another retained synthetic play without clearing either play’s choices or tries.</p>
      {otherPlays.map(item => <button type="button" key={item.play_id} data-testid="return-play" data-target-play-id={item.play_id}
        onClick={() => intent(() => shell.returnToPlay(item.play_id))}>Local group {item.groupNumber}, developer path {item.path}, {item.state.trials.length} tries</button>)}
    </details>}
    <a href="/loop-preview">Return to preview shell</a>
  </main>;
}
function TrialFields({trial}: {trial: {prediction: string; configuration: string; outcome: string}}) {
  return <dl><dt>Guess</dt><dd data-field="prediction">{predictionLabels[trial.prediction]}</dd>
    <dt>Position</dt><dd data-field="configuration">{configurationLabels[trial.configuration]}</dd>
    <dt>Result</dt><dd data-field="outcome">{outcomeLabels[trial.outcome]}</dd></dl>;
}
function ToyBalance({configuration, outcome, compact = false}: {configuration: string | null; outcome?: string | null; compact?: boolean}) {
  const position = configuration ? configurationLabels[configuration] : 'Choose a block position';
  const result = outcome ? outcomeLabels[outcome] : 'Not tested yet';
  return <figure className={`loop-player-model${compact ? ' loop-player-model-small' : ''}`} aria-hidden={compact || undefined}
    data-testid={compact ? 'trial-model' : 'balance-model'} data-configuration={configuration || 'none'} data-outcome={outcome || 'unresolved'}>
    <svg viewBox="0 0 320 180" role="img" aria-label={`${position}. ${result}.`}>
      <path d="M140 158 L160 112 L180 158 Z" fill="#408996"/>
      <path d="M105 162 H215" stroke="#214858" strokeWidth="7" strokeLinecap="round"/>
      <g transform={`rotate(${outcome === 'tips' ? 14 : 0} 160 106)`}>
        <rect x="38" y="100" width="244" height="12" rx="6" fill="#81543a"/>
        {configuration && <rect x={configuration === 'offset' ? 236 : 138} y="50" width="44" height="48" rx="7" fill="#efb62e" stroke="#5a3c12" strokeWidth="3"/>}
      </g>
    </svg>
    <figcaption aria-hidden="true">{position}{outcome ? ` · ${result}` : ' · Ready for your idea'}</figcaption>
  </figure>;
}
function PlayerSession({adventure, providedPlayers, providedPath, onPath, onFinish, active = true}:
  {adventure: Adventure; providedPlayers?: Players; providedPath?: Path; onPath?: (path: Path) => void; onFinish?: () => void; active?: boolean}) {
  const assisted = adventure.engine_version === 'fixture-engine-2';
  const [players] = useState<Players>(() => providedPlayers ?? (assisted ? {
    fast: createAssistedPlayer(adventure, {playId: 'synthetic-script-a', consentEpoch: 1, startingPath: 'fast', startingReason: 'Explicit synthetic developer script A; no ability inference.'}),
    medium: createAssistedPlayer(adventure, {playId: 'synthetic-script-b', consentEpoch: 1, startingPath: 'medium', startingReason: 'Explicit synthetic developer default script B; no ability inference.'}),
    slow: createAssistedPlayer(adventure, {playId: 'synthetic-script-c', consentEpoch: 1, startingPath: 'slow', startingReason: 'Explicit synthetic developer script C; no ability inference.'}),
  } : {fast: null, medium: createPlayer(adventure, {playId: 'synthetic-local-play', consentEpoch: 1}), slow: null}));
  const [localPath, setLocalPath] = useState<Path>('medium');
  const path = providedPath ?? localPath;
  const [, refresh] = useState(0);
  const state = players[path]!.snapshot();
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const controller = useRef<ReturnType<typeof createFixedAudio> | null>(null);
  const mutePreference = useRef(false);
  const [audioState, setAudioState] = useState({muted: false, status: 'idle', line_id: null as string | null});
  useEffect(() => {
    if (!assisted || !active || !audioRef.current) return;
    const media = createFixedAudio({audio: audioRef.current, onState: setAudioState});
    controller.current = media;
    setAudioState(media.snapshot());
    if (mutePreference.current) media.mute(true);
    return () => { controller.current = null; media.destroy(); };
  }, [assisted, active, path]);
  function send(action: Action) {
    if (!active) return;
    const player = players[path]; if (!player) return;
    const current = player.snapshot();
    try {
      player.dispatch({contract_version: current.contract_version, play_id: current.play_id,
        action_id: `local-action-${current.sequence + 1}`, expected_sequence: current.sequence,
        consent_epoch: current.consent_epoch, revision_id: current.revision_id,
        pattern_version: current.pattern_version, action});
      refresh(n => n + 1); setError('');
    } catch { setError(['help','close_help','side_thread'].includes(action.kind) ? 'That optional choice could not be opened. You can keep investigating.' : 'That choice could not be applied. Choose your guess and position again.'); }
  }
  function switchPath(next: Path) {
    if (!active || !players[next]) return;
    if (onPath) onPath(next); else setLocalPath(next);
    setError('');
  }
  const ready = Boolean(state.prediction_action_id && state.configuration_action_id);
  const instruction = !state.prediction_action_id ? 'Choose what you think will happen.'
    : !state.configuration_action_id ? 'Choose the position to test.' : 'Tap Test to see what happens.';
  const explanation = state.current_result ? path === 'fast' ? 'What changed? Clues are optional.'
    : path === 'slow' ? `Look at the place. ${state.current_result.configuration === 'balanced' ? 'Middle: steady.' : 'Edge: tips.'} That is this toy’s rule.`
      : `In this invented toy, ${state.current_result.configuration === 'balanced' ? 'the middle position stays steady' : 'the edge position tips'}. The position determines the result.` : '';
  const line = audioState.line_id && Object.hasOwn(fixedLines, audioState.line_id)
    ? fixedLines[audioState.line_id as keyof typeof fixedLines] : fixedLines.ready;
  return <section className={onFinish ? 'loop-player-session' : 'loop-player'} aria-labelledby="loop-player-title">
    <div data-testid={assisted ? 'assisted-family' : undefined} className="loop-player-family">
      <p className="loop-player-label">Synthetic toy preview · unreviewed</p>
      <h1 id="loop-player-title">Pretend balance</h1>
      <p>{adventure.opening}</p>
      {assisted && <p data-testid="path-instruction">{pathInstructions[path]}</p>}
      <details className="loop-player-limits"><summary>For the grown-up: about this toy</summary><p>{adventure.limits}</p></details>
      {onFinish && <button type="button" data-testid="finish-play" onClick={onFinish}>Pause and look back</button>}
      <p className="loop-player-instruction" role="status">{instruction}</p>
      <fieldset><legend>1. What do you think will happen?</legend>
        <div className="loop-player-choices">{['stable','tips','not_sure'].map(prediction =>
          <button type="button" key={prediction} data-prediction={prediction} aria-pressed={state.prediction === prediction}
            onClick={() => send({kind: 'predict', prediction})}>{predictionLabels[prediction]}</button>)}</div>
      </fieldset>
      <fieldset><legend>2. Where will you put the block?</legend>
        <ToyBalance configuration={state.current_result?.configuration || state.configuration} outcome={state.current_result?.outcome}/>
        <div className="loop-player-choices">{['balanced','offset'].map(configuration =>
          <button type="button" key={configuration} data-configuration={configuration} aria-pressed={state.configuration === configuration}
            onClick={() => send({kind: 'configure', configuration})}>{configurationLabels[configuration]}</button>)}</div>
      </fieldset>
      <button type="button" className="loop-player-test" data-testid="test" disabled={!ready}
        onClick={() => { if (state.prediction_action_id && state.configuration_action_id) send({kind: 'test',
          prediction_action_id: state.prediction_action_id, configuration_action_id: state.configuration_action_id}); }}>3. Test</button>
      {error && <p role="alert">{error}</p>}
      <div aria-live="polite" aria-atomic="true">{state.current_result && <section data-testid="current-result" aria-labelledby="current-result-title">
        <h2 id="current-result-title">This try</h2><p>{outcomeLabels[state.current_result.outcome]}</p>
        {assisted && <p data-testid="result-explanation">{explanation}</p>}
        <p>Choose a fresh guess and position to try again.</p>
      </section>}</div>
      {assisted && <section aria-labelledby="help-title">
        <h2 id="help-title">Want a clue?</h2>
        <div className="loop-player-choices">{[1,2,3].map(level => <button type="button" key={level} data-testid={`help-${level}`}
          aria-expanded={state.help_open && state.help_level === level} aria-controls={state.help_open ? 'help-content' : undefined}
          onClick={() => send({kind: 'help', level})}>{['A nudge','A bigger nudge','Show an example'][level - 1]}</button>)}</div>
        {state.help_open && <section id="help-content" data-testid="help-panel" data-level={state.help_level} aria-label="Optional clue">
          <p>{adventure.help[(state.help_level || 1) - 1]}</p>
          {state.help_level === 3 && <div data-testid="show-it-example">
            <h3>Separate demonstration example · not your try</h3>
            <p>Example toy rule: middle stays steady; edge tips.</p>
            <ToyBalance configuration="balanced" outcome="stable" compact/>
            <ToyBalance configuration="offset" outcome="tips" compact/>
          </div>}
          <button type="button" data-testid="close-help" onClick={() => send({kind: 'close_help'})}>Close clue</button>
        </section>}
        <button type="button" data-testid="side-thread-toggle" aria-expanded={state.side_thread_open} aria-controls={state.side_thread_open ? 'side-content' : undefined}
          onClick={() => send({kind: 'side_thread', open: !state.side_thread_open})}>{state.side_thread_open ? 'Close optional question' : 'An optional pretend question'}</button>
        {state.side_thread_open && <p id="side-content" data-testid="side-thread">{adventure.side_thread}</p>}
      </section>}
      <section aria-labelledby="tries-title"><h2 id="tries-title">Compare your tries</h2>
        <p>Each try keeps its guess, position and result here while this page is open.</p>
        {!state.trials.length && <p>No tries yet. Make your choices, then Test.</p>}
        <ol className="loop-player-trials">{state.trials.map((trial, index) => <li key={trial.trial_id} data-testid="trial"
          data-prediction={trial.prediction} data-configuration={trial.configuration} data-outcome={trial.outcome}>
          <h3>Try {index + 1}</h3><ToyBalance configuration={trial.configuration} outcome={trial.outcome} compact/>
          <TrialFields trial={trial}/>
        </li>)}</ol>
        <button type="button" disabled={state.trials.length < 2} onClick={() => send({kind: 'compare', trial_ids: state.trials.slice(-2).map(trial => trial.trial_id)})}>Compare the latest two tries</button>
        {state.comparison && <p role="status">Comparing tries {state.comparison.map(id => state.trials.findIndex(trial => trial.trial_id === id) + 1).join(' and ')}. Look at their positions, guesses and results above.</p>}
      </section>
      {assisted && <section aria-label="Optional system sound">
        <audio ref={audioRef} data-testid="system-audio" preload="none"/>
        <p data-testid="audio-text">{line.text}</p>
        <div className="loop-player-choices">
          <button type="button" data-testid="audio-play" onClick={() => controller.current?.play('ready')}>Listen</button>
          <button type="button" data-testid="audio-replay" onClick={() => controller.current?.replay()}>Replay sound</button>
          <button type="button" data-testid="audio-mute" aria-pressed={audioState.muted} onClick={() => {
            mutePreference.current = !audioState.muted; controller.current?.mute(mutePreference.current);
          }}>{audioState.muted ? 'Unmute sound' : 'Mute sound'}</button>
        </div>
        <p data-testid="audio-status" role="status">{audioState.status === 'unavailable' ? 'Sound unavailable. The words remain here; you can keep investigating.'
          : audioState.status === 'muted' ? 'Sound muted. The words remain here.' : audioState.status === 'ended' ? 'Sound ended. Replay if you want.'
            : audioState.status === 'playing' ? 'Sound playing.' : 'Sound is optional. Press Listen to start.'}</p>
      </section>}
    </div>
    {assisted && <details className="loop-player-limits">
      <summary>For the grown-up: synthetic developer controls</summary>
      <p>Developer scripts A/B/C explicitly select fast/medium/slow authored text paths. They do not classify a child. Each keeps its own tries until this preview closes.</p>
      <div className="loop-player-choices">{(['fast','medium','slow'] as Path[]).map((name,index) => <button type="button" key={name}
        data-testid={`script-${name}`} aria-pressed={path === name} onClick={() => switchPath(name)}>{['A','B','C'][index]}</button>)}</div>
      <p>Synthetic test tone only; not an approved recording or stock voice sample.</p>
      <button type="button" data-testid="audio-error-fixture" onClick={() => {
        const audio = audioRef.current; if (audio) audio.dispatchEvent(new Event('error'));
      }}>Simulate media error (synthetic test only)</button>
      <p>This dispatches a simulated media error event; it does not test a failed download.</p>
    </details>}
    {!onFinish && <a href="/loop-preview">Return to preview shell</a>}
  </section>;
}
