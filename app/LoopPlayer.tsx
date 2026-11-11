import React, {useState} from 'react';
import {createPlayer, validateAdventure} from '../lib/loop/player-engine.mjs';
import {fixtureAdventure} from '../lib/loop/fixture-adventure.mjs';
import './loop-player.css';

type Adventure = typeof fixtureAdventure;
type Action = {kind: 'predict'; prediction: string} | {kind: 'configure'; configuration: string}
  | {kind: 'test'; prediction_action_id: string; configuration_action_id: string}
  | {kind: 'compare'; trial_ids: string[]};
const predictionLabels: Record<string, string> = {stable: 'Stays steady', tips: 'Tips over', not_sure: 'Not sure yet'};
const configurationLabels: Record<string, string> = {balanced: 'Balanced position', offset: 'Offset position'};
const outcomeLabels: Record<string, string> = {stable: 'Stayed steady', tips: 'Tipped over'};

// Validation runs on every prop render, including mutations to the same object.
// A valid changed specification remounts the session instead of mixing revisions.
export default function LoopPlayer({adventure = fixtureAdventure}: {adventure?: Adventure}) {
  let valid: Adventure | null = null;
  try {
    validateAdventure(adventure);
    valid = structuredClone(adventure);
  } catch {
    valid = null;
  }
  if (!valid) return (
    <main className="loop-player" aria-labelledby="player-unavailable">
      <h1 id="player-unavailable">Toy preview unavailable</h1>
      <p role="alert">This adventure is unsupported. No test can run. Return to the preview shell.</p>
      <a href="/loop-preview">Return to preview</a>
    </main>
  );
  return <PlayerSession key={JSON.stringify(valid)} adventure={valid}/>;
}

function PlayerSession({adventure}: {adventure: Adventure}) {
  const [player] = useState(() => createPlayer(adventure, {playId: 'synthetic-local-play', consentEpoch: 1}));
  const [state, setState] = useState(() => player.snapshot());
  const [error, setError] = useState('');
  function send(action: Action) {
    const current = player.snapshot();
    try {
      const next = player.dispatch({
        contract_version: current.contract_version, play_id: current.play_id,
        action_id: `local-action-${current.sequence + 1}`, expected_sequence: current.sequence,
        consent_epoch: current.consent_epoch, revision_id: current.revision_id,
        pattern_version: current.pattern_version, action,
      });
      setState(next);
      setError('');
    } catch {
      setError('That choice could not be applied. Choose your guess and position again.');
    }
  }
  const ready = Boolean(state.prediction_action_id && state.configuration_action_id);
  const instruction = !state.prediction_action_id ? 'Choose what you think will happen.'
    : !state.configuration_action_id ? 'Choose the position to test.' : 'Tap Test to see what happens.';
  return (
    <main className="loop-player" aria-labelledby="loop-player-title">
      <p className="loop-player-label">Unreviewed synthetic development preview</p>
      <h1 id="loop-player-title">Pretend balance</h1>
      <p>{adventure.opening}</p>
      <aside aria-labelledby="player-limits"><h2 id="player-limits">For the grown-up: model limits</h2><p>{adventure.limits}</p></aside>
      <p className="loop-player-instruction" role="status">{instruction}</p>
      <fieldset>
        <legend>1. What do you think will happen?</legend>
        <div className="loop-player-choices">
          {['stable', 'tips', 'not_sure'].map(prediction => (
            <button type="button" key={prediction} data-prediction={prediction}
              aria-pressed={state.prediction === prediction}
              onClick={() => send({kind: 'predict', prediction})}>{predictionLabels[prediction]}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>2. Choose one position</legend>
        <div className="loop-player-choices">
          {['balanced', 'offset'].map(configuration => (
            <button type="button" key={configuration} data-configuration={configuration}
              aria-pressed={state.configuration === configuration}
              onClick={() => send({kind: 'configure', configuration})}>{configurationLabels[configuration]}</button>
          ))}
        </div>
      </fieldset>
      <button type="button" className="loop-player-test" data-testid="test" disabled={!ready}
        onClick={() => {
          if (state.prediction_action_id && state.configuration_action_id) send({kind: 'test',
            prediction_action_id: state.prediction_action_id, configuration_action_id: state.configuration_action_id});
        }}>3. Test</button>
      {error && <p role="alert">{error}</p>}
      <div aria-live="polite" aria-atomic="true">
        {state.current_result && <section data-testid="current-result" aria-labelledby="current-result-title">
          <h2 id="current-result-title">This try</h2><p>{outcomeLabels[state.current_result.outcome]}</p>
          <p>Choose a fresh guess and position to try again.</p>
        </section>}
      </div>
      <section aria-labelledby="tries-title">
        <h2 id="tries-title">Compare your tries</h2>
        <p>Each try keeps its guess, position and result here while this page is open.</p>
        {!state.trials.length && <p>No tries yet. Make your choices, then Test.</p>}
        <ol className="loop-player-trials">
          {state.trials.map((trial, index) => (
            <li key={trial.trial_id} data-testid="trial" data-prediction={trial.prediction}
              data-configuration={trial.configuration} data-outcome={trial.outcome}>
              <h3>Try {index + 1}</h3>
              <dl>
                <dt>Guess</dt><dd data-field="prediction">{predictionLabels[trial.prediction]}</dd>
                <dt>Position</dt><dd data-field="configuration">{configurationLabels[trial.configuration]}</dd>
                <dt>Result</dt><dd data-field="outcome">{outcomeLabels[trial.outcome]}</dd>
              </dl>
            </li>
          ))}
        </ol>
        <button type="button" disabled={state.trials.length < 2}
          onClick={() => send({kind: 'compare', trial_ids: state.trials.slice(-2).map(trial => trial.trial_id)})}>
          Compare the latest two tries
        </button>
        {state.comparison && <p role="status">Comparing tries {state.comparison.map(id => state.trials.findIndex(trial => trial.trial_id === id) + 1).join(' and ')}. Look at their positions, guesses and results above.</p>}
      </section>
      <a href="/loop-preview">Return to preview shell</a>
    </main>
  );
}
