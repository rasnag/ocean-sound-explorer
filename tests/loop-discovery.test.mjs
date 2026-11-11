import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks, createRequire} from 'node:module';
import {getDiscoveryView} from '../lib/loop/discovery.mjs';

const terms = {version: 'invented-v1', price_text: 'Fictional price amber', trial_text: 'Fictional trial fern', allocation_text: 'Fictional allocation moss', activation_text: 'Fictional activation pine', territory: 'US'};
const snapshot = (availability = 'open') => ({synthetic: true, version: 'invented-snapshot-v1', availability, expires_at: 2000, offer: {...terms}});
const unknown = {state: 'unknown', canJoin: false, offer: null};

test('discovery validates every required field, exact keys, territory and safe clock boundary', () => {
  assert.deepEqual(getDiscoveryView(snapshot(), 1999), {state: 'open', canJoin: true, offer: terms});
  for (const key of Object.keys(snapshot())) {
    const bad = snapshot(); delete bad[key];
    assert.deepEqual(getDiscoveryView(bad, 1000), unknown, key);
  }
  for (const key of Object.keys(terms)) {
    const bad = snapshot(); delete bad.offer[key];
    assert.deepEqual(getDiscoveryView(bad, 1000), unknown, key);
    for (const value of ['', '  ', null, 3]) {
      const badValue = snapshot(); badValue.offer[key] = value;
      assert.deepEqual(getDiscoveryView(badValue, 1000), unknown, key);
    }
  }
  for (const bad of [null, undefined, [], {}, {...snapshot(), synthetic: false}, {...snapshot(), version: ' '},
    {...snapshot(), availability: 'unknown'}, {...snapshot(), expires_at: 2000.5},
    {...snapshot(), expires_at: Infinity}, {...snapshot(), extra: true},
    {...snapshot(), offer: {...terms, selected: true}}, {...snapshot(), offer: {...terms, territory: 'CA'}}]) {
    assert.deepEqual(getDiscoveryView(bad, 1000), unknown);
  }
  for (const now of [undefined, NaN, Infinity, '1000', 1000.5, Number.MAX_SAFE_INTEGER + 1, 2000, 2001]) {
    assert.deepEqual(getDiscoveryView(snapshot(), now), unknown);
  }
  for (const state of ['full', 'paused']) {
    assert.deepEqual(getDiscoveryView(snapshot(state), 1000), {state, canJoin: false, offer: null});
  }
  const supplied = snapshot(), result = getDiscoveryView(supplied, 1000);
  supplied.offer.price_text = 'caller changed';
  assert.equal(result.offer.price_text, terms.price_text);
  result.offer.trial_text = 'view changed';
  assert.equal(supplied.offer.trial_text, terms.trial_text);
});

test('real React controls keep local actions truthful, optional and closed after expiry', async () => {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const {JSDOM} = await import('jsdom');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {url: 'http://local.invalid/loop-preview/discover'});
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let attempts = 0;
  const forbidden = () => {attempts++; throw new Error('Transport or storage prohibited');};
  for (const name of names) Object.defineProperty(globalThis, name, {configurable: true, writable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'fetch' ? forbidden : dom.window[name]});
  dom.window.fetch = forbidden;
  for (const name of ['getItem', 'setItem', 'removeItem', 'clear']) dom.window.Storage.prototype[name] = forbidden;
  dom.window.navigator.sendBeacon = forbidden;
  dom.window.HTMLFormElement.prototype.submit = forbidden;
  dom.window.HTMLFormElement.prototype.requestSubmit = forbidden;
  const hook = registerHooks({load(url, context, next) {
    if (url.endsWith('.css')) return {format: 'module', source: '', shortCircuit: true};
    if (url.endsWith('/LoopDiscovery.tsx')) {
      const source = ts.transpileModule(require('node:fs').readFileSync(new URL(url), 'utf8'), {
        compilerOptions: {jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
      }).outputText;
      return {format: 'module', source, shortCircuit: true};
    }
    return next(url, context);
  }});
  let root;
  try {
    const React = await import('react');
    const {createRoot} = await import('react-dom/client');
    const {default: Discovery} = await import('../app/LoopDiscovery.tsx');
    const host = dom.window.document.getElementById('root');
    root = createRoot(host);
    let now = 1000, key = 0;
    const find = id => host.querySelector(`[data-testid="${id}"]`);
    const render = async value => React.act(async () => root.render(React.createElement(Discovery, {key: ++key, snapshot: value, clock: () => now})));
    const click = async id => React.act(async () => {assert(find(id)); find(id).click();});
    const closed = state => {
      assert(!find('join')); assert(!find('offer'));
      assert.match(find('availability-status').textContent, new RegExp(state, 'i'));
      assert(find('adult-recovery'));
    };
    await render(snapshot());
    assert(find('join')); assert(!find('interest-opt-in').checked); assert(find('interest-preview').disabled);
    for (const text of [terms.price_text, terms.trial_text, terms.allocation_text, terms.activation_text]) assert(find('offer').textContent.includes(text));
    for (const href of ['/ocean-sound-explorer', '/make-the-moon']) assert(host.querySelector(`a[href="${href}"]`));
    assert(!host.querySelector('form, textarea, select, input:not([type="checkbox"])'));
    await click('join'); assert.match(find('join-result').textContent, /not available.*local preview/i);
    await click('adult-recovery'); assert.match(find('adult-recovery-result').textContent, /unavailable.*local preview/i);
    await click('interest-opt-in'); assert(!find('interest-preview').disabled);
    await click('interest-preview'); assert.match(find('interest-result').textContent, /Not saved or sent/);
    await click('interest-opt-in'); assert(find('interest-preview').disabled); assert(!find('interest-result'));
    now = 2000; await click('join'); closed('unknown'); assert(!find('join-result'));
    now = 1000;
    for (const state of ['full', 'paused']) {await render(snapshot(state)); closed(state);}
    await render(undefined);
    assert(!find('discovery-family').querySelector('[data-testid^="fixture-"]'));
    await click('fixture-open'); assert(find('join')); assert.match(find('offer').textContent, /fictional example/i);
    await click('interest-opt-in'); await click('interest-preview'); await click('adult-recovery'); await click('join');
    await click('fixture-full'); closed('full');
    assert(!find('interest-opt-in').checked); assert(find('interest-preview').disabled);
    for (const id of ['interest-result', 'adult-recovery-result', 'join-result']) assert(!find(id));
    await click('fixture-paused'); closed('paused'); await click('fixture-unknown'); closed('unknown');
    assert.equal(attempts, 0);
    assert.equal(dom.window.document.cookie, '');
  } finally {
    if (root) {const React = await import('react'); await React.act(async () => root.unmount());}
    hook.deregister(); dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  }
});
