// Synthetic local transitions only. No persistence, authorization service or effects.
const specKeys = ['contract_version', 'revision_id', 'pattern_version', 'engine_version', 'status', 'opening', 'limits', 'configurations', 'outcomes', 'assets', 'help', 'difficulty', 'side_thread', 'offscreen'];
const envelopeKeys = ['contract_version', 'play_id', 'action_id', 'expected_sequence', 'consent_epoch', 'revision_id', 'pattern_version', 'action'];
const predictions = ['stable', 'tips', 'not_sure'];
const configurations = ['balanced', 'offset'];
const fail = () => { throw new TypeError('Unsupported synthetic player input.'); };
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) fail();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail();
  }
}
function text(value, maximum = Infinity) {
  if (typeof value !== 'string' || !value.length || [...value].length > maximum) fail();
}
function array(value, expected) {
  if (!Array.isArray(value) || value.length !== expected.length
    || Reflect.ownKeys(value).length !== value.length + 1
    || expected.some((item, index) => value[index] !== item)) fail();
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Validate the complete adventure 1.1.0 finite fixture-1 profile. */
export function validateAdventure(spec) {
  exact(spec, specKeys);
  if (spec.contract_version !== '1.1.0' || spec.pattern_version !== 'fixture-1'
    || spec.engine_version !== 'fixture-engine-1' || spec.status !== 'draft') fail();
  for (const key of ['revision_id', 'opening', 'limits', 'side_thread', 'offscreen']) text(spec[key], 2000);
  array(spec.configurations, configurations);
  exact(spec.outcomes, configurations);
  if (spec.outcomes.balanced !== 'stable' || spec.outcomes.offset !== 'tips') fail();
  if (!Array.isArray(spec.assets) || spec.assets.length > 1) fail();
  array(spec.assets, spec.assets.length ? ['fixture-balance'] : []);
  if (!Array.isArray(spec.help) || spec.help.length !== 3) fail();
  array(spec.help, [spec.help[0], spec.help[1], spec.help[2]]);
  spec.help.forEach(item => text(item, 2000));
  array(spec.difficulty, ['fast', 'medium', 'slow']);
  return true;
}

/** Pure synchronous, memory-only player. Rejections throw and change nothing. */
export function createPlayer(spec, options) {
  validateAdventure(spec);
  exact(options, ['playId', 'consentEpoch']);
  text(options.playId);
  if (!Number.isSafeInteger(options.consentEpoch) || options.consentEpoch < 1) fail();
  const rules = freeze(structuredClone(spec));
  const playId = options.playId, epoch = options.consentEpoch;
  const usedIds = new Set();
  let state = {
    contract_version: rules.contract_version, play_id: playId, consent_epoch: epoch,
    revision_id: rules.revision_id, pattern_version: rules.pattern_version,
    engine_version: rules.engine_version, sequence: 0, trials: [], current_result: null,
    prediction: null, configuration: null, prediction_action_id: null,
    configuration_action_id: null, comparison: null,
  };
  const snapshot = () => structuredClone(state);
  function dispatch(envelope) {
    exact(envelope, envelopeKeys);
    text(envelope.action_id);
    text(envelope.play_id);
    text(envelope.revision_id);
    if (envelope.contract_version !== rules.contract_version || envelope.play_id !== playId
      || envelope.revision_id !== rules.revision_id || envelope.pattern_version !== rules.pattern_version
      || envelope.consent_epoch !== epoch || !Number.isSafeInteger(envelope.consent_epoch)
      || !Number.isSafeInteger(envelope.expected_sequence) || envelope.expected_sequence < 0
      || envelope.expected_sequence !== state.sequence || usedIds.has(envelope.action_id)) fail();
    const action = envelope.action;
    if (!action || typeof action !== 'object') fail();
    let update;
    switch (action.kind) {
      case 'predict':
        exact(action, ['kind', 'prediction']);
        if (!predictions.includes(action.prediction)) fail();
        update = {prediction: action.prediction, prediction_action_id: envelope.action_id, current_result: null};
        break;
      case 'configure':
        exact(action, ['kind', 'configuration']);
        if (!configurations.includes(action.configuration)) fail();
        update = {configuration: action.configuration, configuration_action_id: envelope.action_id, current_result: null};
        break;
      case 'test': {
        exact(action, ['kind', 'prediction_action_id', 'configuration_action_id']);
        text(action.prediction_action_id); text(action.configuration_action_id);
        if (!state.prediction_action_id || !state.configuration_action_id
          || action.prediction_action_id !== state.prediction_action_id
          || action.configuration_action_id !== state.configuration_action_id) fail();
        const trial = freeze({
          trial_id: `${playId}:trial:${state.trials.length + 1}`,
          prediction: state.prediction, configuration: state.configuration,
          outcome: rules.outcomes[state.configuration],
          prediction_action_id: state.prediction_action_id,
          configuration_action_id: state.configuration_action_id,
          test_action_id: envelope.action_id, action_sequence: state.sequence + 1,
          play_id: playId, revision_id: rules.revision_id, pattern_version: rules.pattern_version,
        });
        update = {trials: [...state.trials, trial], current_result: trial,
          prediction: null, configuration: null, prediction_action_id: null, configuration_action_id: null};
        break;
      }
      case 'compare':
        exact(action, ['kind', 'trial_ids']);
        if (!Array.isArray(action.trial_ids) || action.trial_ids.length !== 2) fail();
        array(action.trial_ids, [action.trial_ids[0], action.trial_ids[1]]);
        action.trial_ids.forEach(id => text(id));
        if (action.trial_ids[0] === action.trial_ids[1]
          || action.trial_ids.some(id => !state.trials.some(trial => trial.trial_id === id))) fail();
        update = {comparison: [...action.trial_ids]};
        break;
      default: fail();
    }
    const next = freeze({...state, ...update, sequence: state.sequence + 1});
    usedIds.add(envelope.action_id);
    state = next;
    return snapshot();
  }
  return {snapshot, dispatch};
}
