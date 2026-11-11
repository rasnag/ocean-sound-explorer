import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerShell} from '../lib/loop/player-shell.mjs';
import {endingFixtureAdventure as spec} from '../lib/loop/ending-fixture.mjs';
import {assistedFixtureAdventure} from '../lib/loop/assisted-fixture.mjs';
import {validateAssistedAdventure} from '../lib/loop/assisted-player.mjs';

function fixture() {
  let count = 0, fault = null;
  const requests = [];
  const shell = createPlayerShell(spec, {consentEpoch: 1, newPlayId: request => {
    requests.push({...request});
    if (fault) return fault(request);
    return `ending-test-${++count}`;
  }});
  const state = () => shell.current().players[shell.current().path].snapshot();
  const send = (id, action) => {
    const s = state();
    return shell.current().players[shell.current().path].dispatch({contract_version: s.contract_version,
      play_id: s.play_id, revision_id: s.revision_id, pattern_version: s.pattern_version,
      consent_epoch: s.consent_epoch, expected_sequence: s.sequence, action_id: id, action});
  };
  const reject = call => { const before = shell.snapshot(); assert.throws(call); assert.deepEqual(shell.snapshot(), before); };
  return {shell, requests, state, send, reject, fault: value => { fault = value; }};
}

test('ending fixture retains the complete accepted finite profile without editing its source', () => {
  assert.equal(validateAssistedAdventure(spec), true);
  for (const key of Object.keys(assistedFixtureAdventure).filter(key => !['revision_id','opening','offscreen'].includes(key))) {
    assert.deepEqual(spec[key], assistedFixtureAdventure[key], key);
  }
  assert.notEqual(spec.revision_id, assistedFixtureAdventure.revision_id);
  assert.match(spec.offscreen, /grown-up/);
  assert.match(assistedFixtureAdventure.offscreen, /Unimplemented/);
});

test('strict construction, paths and intents fail without state changes', () => {
  for (const options of [{}, {newPlayId: () => 'same', consentEpoch: 1},
    {newPlayId: () => '', consentEpoch: 1}, {newPlayId: () => Promise.resolve('id'), consentEpoch: 1},
    {newPlayId: () => 'id', consentEpoch: 0}, {newPlayId: () => 'id', consentEpoch: 1, extra: true}]) {
    assert.throws(() => createPlayerShell(spec, options));
  }
  const f = fixture();
  f.reject(() => f.shell.replay()); f.reject(() => f.shell.feedback('fits'));
  f.reject(() => f.shell.choosePath('expert')); f.reject(() => f.shell.returnToPlay('foreign'));
  assert(Object.isFrozen(f.shell.current())); assert(Object.isFrozen(f.shell.current().players));
});

test('ending preserves zero tests, pending input references, actual trials and optional handoffs', () => {
  const {shell, state, send, reject} = fixture();
  const originalId = state().play_id;
  shell.finish(); assert.deepEqual(shell.snapshot().recap.trials, []);
  shell.resume(); send('p1', {kind: 'predict', prediction: 'tips'});
  send('c1', {kind: 'configure', configuration: 'balanced'});
  const pending = state(); shell.finish(); assert.equal(shell.snapshot().recap.untested_choices, true);
  shell.resume(); assert.deepEqual(state(), pending);
  send('t1', {kind: 'test', prediction_action_id: 'p1', configuration_action_id: 'c1'});
  send('p2', {kind: 'predict', prediction: 'not_sure'});
  const actual = state(); shell.finish();
  assert.equal(shell.snapshot().recap.status, 'paused');
  assert.deepEqual(shell.snapshot().recap.trials, actual.trials);
  shell.feedback('fits'); reject(() => shell.feedback('mastered'));
  assert.deepEqual(shell.snapshot().feedback, {source: 'parent', choice: 'fits', status: 'not_saved_or_sent'});
  shell.newWonder(); assert.deepEqual(shell.snapshot().new_wonder, {from_play_id: originalId,
    revision_id: spec.revision_id, requires_child_confirmation: true, status: 'unavailable', production_submitted: false});
  shell.finish(); assert.deepEqual(state(), actual);
  const copy = shell.snapshot(); copy.recap.trials.length = 0; copy.plays[1].state.trials[0].outcome = 'forged';
  assert.deepEqual(state(), actual);
});

test('replay requests path-scoped identities atomically and retains engines across navigation', () => {
  const f = fixture(), {shell, state, requests, reject} = f;
  const old = Object.fromEntries(shell.snapshot().plays.map(item => [item.path, item.play_id]));
  shell.start(); f.send('p', {kind: 'predict', prediction: 'tips'});
  const prior = state(); shell.finish(); shell.replay();
  assert.equal(shell.snapshot().view, 'opening'); assert.equal(shell.snapshot().plays.length, 6);
  const fresh = state().play_id; assert.notEqual(fresh, old.medium);
  for (const request of requests.slice(3)) assert.deepEqual(request, {kind: 'replay', path: request.path,
    from_play_id: old[request.path], revision_id: spec.revision_id});
  shell.start(); f.send('fresh-p', {kind: 'predict', prediction: 'stable'}); const newer = state();
  shell.returnToPlay(old.medium); shell.resume(); assert.deepEqual(state(), prior);
  shell.returnToPlay(fresh); shell.resume(); assert.deepEqual(state(), newer);
  shell.finish();
  for (const position of [1,2,3]) {
    let call = 0;
    f.fault(() => { if (++call === position) throw Error('Synthetic ID failure'); return `unused-${position}-${call}`; });
    reject(() => shell.replay()); assert.equal(call, position);
  }
  f.fault(request => request.path === 'slow' ? old.slow : `unused-${request.path}`);
  reject(() => shell.replay());
  f.fault(() => old.medium); reject(() => shell.replay());
  assert.deepEqual(state(), newer);
});
