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

test('actual React drawing shows chosen setup, reveals motion only on Test and retains visual tries', async () => {
  const {JSDOM} = await import('jsdom');
  const ts = (await import('typescript')).default;
  const {readFile, writeFile, unlink} = await import('node:fs/promises');
  const {randomUUID} = await import('node:crypto');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {url: 'http://local.invalid/loop-preview/player'});
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'IS_REACT_ACT_ENVIRONMENT'];
  const old = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, {value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name], configurable: true, writable: true});
  const temporary = new URL(`../app/.visual-test-${randomUUID()}.mjs`, import.meta.url);
  let root, owned = false;
  const React = await import('react');
  try {
    const source = await readFile(new URL('../app/LoopPlayer.tsx', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {compilerOptions: {jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
      transformers: {before: [context => file => ts.visitNode(file, function visit(node) {
        if (ts.isImportDeclaration(node) && !node.importClause && node.moduleSpecifier.text.endsWith('.css')) return undefined;
        return ts.visitEachChild(node, visit, context);
      })]}}).outputText;
    await writeFile(temporary, compiled, {flag: 'wx'}); owned = true;
    const {default: LoopPlayer} = await import(temporary.href);
    const {createRoot} = await import('react-dom/client');
    const document = dom.window.document, host = document.getElementById('root'); root = createRoot(host);
    await React.act(async () => root.render(React.createElement(LoopPlayer)));
    const model = () => host.querySelector('[data-testid="balance-model"]');
    const press = async selector => { const button = host.querySelector(selector); assert(button && !button.disabled); await React.act(async () => button.click()); };
    assert.equal(host.querySelector('details').open, false, 'parent model notes should not overwhelm the initial child controls');
    assert.equal(model().getAttribute('data-outcome'), 'unresolved');
    await press('[data-prediction="tips"]'); await press('[data-configuration="balanced"]');
    const middle = model().querySelector('g rect[stroke]').getAttribute('x');
    assert.match(model().querySelector('svg').getAttribute('aria-label'), /Not tested yet/);
    await press('[data-testid="test"]'); assert.equal(model().getAttribute('data-outcome'), 'stable');
    await press('[data-prediction="not_sure"]'); await press('[data-configuration="offset"]');
    assert.notEqual(model().querySelector('g rect[stroke]').getAttribute('x'), middle, 'block must visibly move when its position changes');
    const pendingTransform = model().querySelector('g').getAttribute('transform');
    assert.equal(model().getAttribute('data-outcome'), 'unresolved');
    await press('[data-testid="test"]');
    assert.equal(model().getAttribute('data-outcome'), 'tips');
    assert.notEqual(model().querySelector('g').getAttribute('transform'), pendingTransform, 'tilt appears only after actual Test');
    const retained = [...host.querySelectorAll('[data-testid="trial-model"]')];
    assert.deepEqual(retained.map(node => node.getAttribute('data-outcome')), ['stable', 'tips']);
    assert.deepEqual(retained.map(node => node.getAttribute('data-configuration')), ['balanced', 'offset']);
  } finally {
    if (root) await React.act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
    if (owned) await unlink(temporary);
  }
});
