import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayer, validateAdventure} from '../lib/loop/player-engine.mjs';
import {fixtureAdventure} from '../lib/loop/fixture-adventure.mjs';

function session(spec = fixtureAdventure) {
  const player = createPlayer(spec, {playId: 'test-play', consentEpoch: 1});
  const envelope = (id, action) => ({contract_version: '1.1.0', play_id: 'test-play', action_id: id,
    expected_sequence: player.snapshot().sequence, consent_epoch: 1,
    revision_id: fixtureAdventure.revision_id, pattern_version: 'fixture-1', action});
  const reject = input => {
    const before = player.snapshot();
    assert.throws(() => player.dispatch(input));
    assert.deepEqual(player.snapshot(), before);
  };
  return {player, envelope, reject, send: (id, action) => player.dispatch(envelope(id, action))};
}

test('complete finite adventure contract rejects missing, extra, version, range and constant defects', () => {
  assert.equal(validateAdventure(fixtureAdventure), true);
  for (const key of Object.keys(fixtureAdventure)) {
    const bad = structuredClone(fixtureAdventure); delete bad[key];
    assert.throws(() => validateAdventure(bad), key);
  }
  for (const patch of [
    {contract_version: '2'}, {pattern_version: 'other'}, {engine_version: 'other'}, {status: 'published'},
    {opening: ''}, {limits: 'x'.repeat(2001)}, {revision_id: null}, {side_thread: 3}, {offscreen: ''},
    {configurations: ['offset', 'balanced']}, {outcomes: {balanced: 'tips', offset: 'tips'}},
    {outcomes: {balanced: 'stable', offset: 'tips', other: 'stable'}},
    {assets: ['unknown']}, {assets: ['fixture-balance', 'fixture-balance']},
    {help: ['a', 'b']}, {help: ['a', '', 'c']}, {difficulty: ['slow', 'medium', 'fast']},
    {html: '<script>no</script>'},
  ]) assert.throws(() => validateAdventure({...fixtureAdventure, ...patch}));
  assert.doesNotThrow(() => validateAdventure({...fixtureAdventure, assets: []}));
});

test('two fresh button-shaped tries retain immutable provenance and trusted results', () => {
  const {player, send, envelope, reject} = session();
  assert.equal(player.snapshot().sequence, 0);
  reject(envelope('early', {kind: 'test', prediction_action_id: 'p1', configuration_action_id: 'c1'}));
  send('p1', {kind: 'predict', prediction: 'tips'});
  send('c1', {kind: 'configure', configuration: 'balanced'});
  assert.deepEqual(player.snapshot().trials, []);
  assert.equal(player.snapshot().current_result, null);
  reject(envelope('foreign-ref', {kind: 'test', prediction_action_id: 'other-play:p1', configuration_action_id: 'c1'}));
  send('t1', {kind: 'test', prediction_action_id: 'p1', configuration_action_id: 'c1'});
  const first = player.snapshot().trials[0];
  assert.equal(first.outcome, 'stable');
  assert.equal(first.prediction_action_id, 'p1');
  assert.equal(first.configuration_action_id, 'c1');
  assert.equal(first.test_action_id, 't1');
  reject(envelope('reused-inputs', {kind: 'test', prediction_action_id: 'p1', configuration_action_id: 'c1'}));
  send('p2', {kind: 'predict', prediction: 'not_sure'});
  assert.equal(player.snapshot().current_result, null);
  send('c2', {kind: 'configure', configuration: 'offset'});
  send('t2', {kind: 'test', prediction_action_id: 'p2', configuration_action_id: 'c2'});
  assert.equal(player.snapshot().trials[1].outcome, 'tips');
  assert.deepEqual(player.snapshot().trials[0], first);
  const ids = player.snapshot().trials.map(trial => trial.trial_id);
  reject(envelope('same-trial', {kind: 'compare', trial_ids: [ids[0], ids[0]]}));
  reject(envelope('unknown-trial', {kind: 'compare', trial_ids: [ids[0], 'missing']}));
  send('compare', {kind: 'compare', trial_ids: ids});
  assert.equal(player.snapshot().sequence, 7);
  assert.deepEqual(player.snapshot().comparison, ids);
  const exposed = player.snapshot(); exposed.trials[0].outcome = 'tampered'; exposed.comparison.pop();
  assert.deepEqual(player.snapshot().trials[0], first);
  assert.deepEqual(player.snapshot().comparison, ids);
});

test('full envelope and unsupported-operation failures have no effects', () => {
  const {player, envelope, reject, send} = session();
  const input = envelope('a', {kind: 'predict', prediction: 'stable'});
  for (const key of Object.keys(input)) {
    const bad = structuredClone(input); delete bad[key]; reject(bad);
  }
  for (const patch of [{extra: true}, {play_id: 'other'}, {revision_id: 'other'}, {consent_epoch: 2},
    {contract_version: '0'}, {pattern_version: 'other'}, {action_id: ''}, {expected_sequence: -1},
    {expected_sequence: 0.5}, {expected_sequence: '0'}, {expected_sequence: 1}]) reject({...input, ...patch});
  for (const action of [{kind: 'configure', configuration: 'unknown'}, {kind: 'predict', prediction: 'wrong'},
    {kind: 'predict', prediction: 'tips', outcome: 'tips'}, {kind: 'help', level: 1},
    {kind: 'end'}, {kind: 'show_offscreen'},
    {kind: 'test', prediction_action_id: 'a', configuration_action_id: 'b', outcome: 'stable'}]) reject(envelope('bad', action));
  send('a', {kind: 'predict', prediction: 'stable'});
  reject(envelope('a', {kind: 'predict', prediction: 'tips'}));
  send('c1', {kind: 'configure', configuration: 'balanced'});
  send('c2', {kind: 'configure', configuration: 'offset'});
  reject(envelope('stale-reference', {kind: 'test', prediction_action_id: 'a', configuration_action_id: 'c1'}));
  assert.equal(player.snapshot().trials.length, 0);
});

test('caller mutation cannot replace pinned rules or committed input', () => {
  const supplied = structuredClone(fixtureAdventure);
  const {player, envelope, send} = session(supplied);
  supplied.outcomes.balanced = 'tips'; supplied.revision_id = 'changed'; supplied.configurations[0] = 'other';
  const prediction = envelope('p', {kind: 'predict', prediction: 'tips'});
  player.dispatch(prediction); prediction.action.prediction = 'stable';
  send('c', {kind: 'configure', configuration: 'balanced'});
  send('t', {kind: 'test', prediction_action_id: 'p', configuration_action_id: 'c'});
  assert.equal(player.snapshot().trials[0].outcome, 'stable');
  assert.equal(player.snapshot().trials[0].prediction, 'tips');
  assert.equal(player.snapshot().revision_id, fixtureAdventure.revision_id);
});
