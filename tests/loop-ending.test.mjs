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

test('actual React navigation retains pending older and played newer groups in both directions', async () => {
  const {JSDOM} = await import('jsdom');
  const ts = (await import('typescript')).default;
  const {readFile, writeFile, unlink} = await import('node:fs/promises');
  const {randomUUID} = await import('node:crypto');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {url: 'http://local.invalid/loop-preview/player'});
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.HTMLMediaElement.prototype.load = () => {};
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
    let count = 0;
    await React.act(async () => root.render(React.createElement(LoopPlayer, {newPlayId: () => `roundtrip-${++count}`})));
    const id = () => host.querySelector('[data-testid="shell-root"]').getAttribute('data-play-id');
    const press = async selector => { const button = host.querySelector(selector); assert(button && !button.disabled); await React.act(async () => button.click()); };
    const oldId = id();
    await press('[data-testid="start-play"]');
    await press('[data-prediction="tips"]'); await press('[data-configuration="balanced"]');
    await press('[data-testid="finish-play"]');
    assert.match(host.querySelector('[data-testid="ending-recap"]').textContent, /try first/);
    await press('[data-testid="replay-play"]'); const newerId = id(); assert.notEqual(newerId, oldId);
    await press('[data-testid="start-play"]');
    await press('[data-prediction="not_sure"]'); await press('[data-configuration="offset"]');
    await press('[data-testid="test"]');
    const newerTrial = host.querySelector('[data-testid="trial"]').textContent;
    const navigate = async target => {
      const button = host.querySelector(`[data-testid="return-play"][data-target-play-id="${target}"]`);
      assert(button, 'retained play must stay reachable from either group');
      const details = button.closest('details'); await React.act(async () => details.querySelector('summary').click());
      await press(`[data-testid="return-play"][data-target-play-id="${target}"]`);
      assert.equal(id(), target); await press('[data-testid="resume-play"]');
    };
    await navigate(oldId);
    assert(host.querySelector('[data-testid="assisted-family"]'));
    assert.equal(host.querySelector('[data-prediction="tips"]').getAttribute('aria-pressed'), 'true');
    assert.equal(host.querySelector('button[data-configuration="balanced"]').getAttribute('aria-pressed'), 'true');
    assert.equal(host.querySelectorAll('[data-testid="trial"]').length, 0);
    await navigate(newerId);
    assert.equal(host.querySelectorAll('[data-testid="trial"]').length, 1);
    assert.equal(host.querySelector('[data-testid="trial"]').textContent, newerTrial);
    await press('[data-testid="finish-play"]');
    assert.match(host.querySelector('[data-testid="ending-recap"]').textContent, /another try/);
  } finally {
    if (root) await React.act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
    if (owned) await unlink(temporary);
  }
});
