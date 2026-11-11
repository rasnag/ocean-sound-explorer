import {createAssistedPlayer, validateAssistedAdventure} from './assisted-player.mjs';

const paths = Object.freeze(['fast', 'medium', 'slow']);
const fail = () => { throw new TypeError('Unsupported local shell intent or play identity.'); };
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) fail();
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || !d.enumerable) fail();
  }
}
function validId(id) {
  if (typeof id !== 'string' || !id.trim() || [...id].length > 2000
    || /[<>]|(?:javascript|data|vbscript)\s*:|\beval\s*\(|\bfunction\s*\(|=>/i.test(id)) fail();
}

/** Strict memory-only navigation. No server events, persistence or receipts. */
export function createPlayerShell(adventure, options) {
  validateAssistedAdventure(adventure);
  exact(options, ['newPlayId', 'consentEpoch']);
  if (typeof options.newPlayId !== 'function' || !Number.isSafeInteger(options.consentEpoch)
    || options.consentEpoch < 1) fail();
  const spec = structuredClone(adventure);
  const factory = options.newPlayId, epoch = options.consentEpoch;
  const groups = [], retained = new Map();
  let group, path = 'medium', view = 'opening', preparing = false;
  function guard() { if (preparing) fail(); }
  function prepare(kind, previous) {
    guard(); preparing = true;
    try {
      const ids = {};
      for (const name of paths) {
        const id = factory(Object.freeze({kind, path: name,
          from_play_id: previous ? previous.players[name].snapshot().play_id : null,
          revision_id: spec.revision_id}));
        validId(id);
        if (retained.has(id) || Object.values(ids).includes(id)) fail();
        ids[name] = id;
      }
      const players = Object.freeze(Object.fromEntries(paths.map(name => [name,
        Object.freeze(createAssistedPlayer(spec, {playId: ids[name], consentEpoch: epoch,
          startingPath: name, startingReason: 'Explicit synthetic developer path; no child classification.'}))])));
      return {session_id: ids.medium, players, feedback: new Map(), wonders: new Map()};
    } finally { preparing = false; }
  }
  function install(next) {
    groups.push(next);
    for (const name of paths) retained.set(next.players[name].snapshot().play_id, {group: next, path: name});
    group = next;
  }
  install(prepare('start', null));
  const state = () => group.players[path].snapshot();
  function current() {
    return Object.freeze({session_id: group.session_id, path, players: group.players});
  }
  function snapshot() {
    const active = state();
    return structuredClone({view, active_play_id: active.play_id, path,
      recap: {status: 'paused', trials: active.trials,
        untested_choices: Boolean(active.prediction_action_id || active.configuration_action_id)},
      plays: groups.flatMap(item => paths.map(name => {
        const actual = item.players[name].snapshot();
        return {play_id: actual.play_id, path: name, state: actual};
      })),
      feedback: group.feedback.get(path) ?? null,
      new_wonder: group.wonders.get(path) ?? null});
  }
  function requireView(...allowed) { guard(); if (!allowed.includes(view)) fail(); }
  function start() { requireView('opening'); view = 'playing'; return snapshot(); }
  function finish() { requireView('opening', 'playing', 'ending', 'new-wonder'); view = 'ending'; return snapshot(); }
  function resume() { requireView('ending'); view = 'playing'; return snapshot(); }
  function choosePath(next) {
    guard(); if (!paths.includes(next)) fail();
    path = next; return snapshot();
  }
  function replay() {
    requireView('ending');
    const next = prepare('replay', group);
    install(next); view = 'opening'; return snapshot();
  }
  function returnToPlay(playId) {
    guard(); validId(playId);
    const target = retained.get(playId); if (!target) fail();
    group = target.group; path = target.path; view = 'ending'; return snapshot();
  }
  function feedback(choice) {
    requireView('ending'); if (!['fits', 'different', 'not_now'].includes(choice)) fail();
    group.feedback.set(path, {source: 'parent', choice, status: 'not_saved_or_sent'});
    return snapshot();
  }
  function newWonder() {
    requireView('ending');
    group.wonders.set(path, {from_play_id: state().play_id, revision_id: spec.revision_id,
      requires_child_confirmation: true, status: 'unavailable', production_submitted: false});
    view = 'new-wonder'; return snapshot();
  }
  return Object.freeze({current, snapshot, start, finish, resume, choosePath, replay, returnToPlay, feedback, newWonder});
}
