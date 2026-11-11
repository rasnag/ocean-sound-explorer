import {fixtureAudio} from './fixture-audio.mjs';

export const fixedLines = Object.freeze({
  ready: Object.freeze({text: 'Take your time. You can try an idea.', src: fixtureAudio.source}),
  test: Object.freeze({text: 'Look at what happened. You can try again.', src: fixtureAudio.source}),
  compare: Object.freeze({text: 'Look at your two tries together.', src: fixtureAudio.source}),
});

// Gesture-driven native media controller. No source selection or game actions.
export function createFixedAudio({audio, onState}) {
  if (!audio || typeof audio.play !== 'function' || typeof audio.pause !== 'function'
    || typeof audio.addEventListener !== 'function' || typeof audio.removeEventListener !== 'function'
    || typeof onState !== 'function') throw new TypeError('Audio element and state callback required.');
  let state = {muted: false, status: 'idle', line_id: null};
  let generation = 0, destroyed = false;
  const snapshot = () => ({...state});
  const emit = update => {
    if (destroyed) return;
    state = {...state,...update}; onState(snapshot());
  };
  const stop = () => { try { audio.pause(); audio.currentTime = 0; } catch { /* Detached media can be unavailable. */ } };
  const unavailable = () => {
    if (destroyed) return;
    generation++; stop(); emit({status: state.muted ? 'muted' : 'unavailable'});
  };
  const ended = () => {
    if (destroyed || state.line_id === null) return;
    generation++; emit({status: state.muted ? 'muted' : 'ended'});
  };
  audio.addEventListener('error', unavailable);
  audio.addEventListener('ended', ended);
  function play(id) {
    if (!Object.hasOwn(fixedLines, id)) throw new TypeError('Unknown fixed system line.');
    if (destroyed) return snapshot();
    const token = ++generation;
    stop();
    emit({line_id: id, status: state.muted ? 'muted' : 'idle'});
    if (state.muted) return snapshot();
    try {
      audio.src = fixedLines[id].src;
      audio.muted = false;
      // Keep this synchronous: the browser gesture must reach play directly.
      const pending = audio.play();
      Promise.resolve(pending).then(() => {
        if (!destroyed && generation === token && !state.muted) emit({status: 'playing'});
      }, () => {
        if (!destroyed && generation === token) unavailable();
      });
    } catch { if (!destroyed && generation === token) unavailable(); }
    return snapshot();
  }
  function mute(value) {
    if (typeof value !== 'boolean') throw new TypeError('Mute requires a boolean.');
    if (destroyed) return snapshot();
    generation++; stop(); audio.muted = value;
    emit({muted: value, status: value ? 'muted' : 'idle'});
    return snapshot();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; generation++;
    audio.removeEventListener('error', unavailable);
    audio.removeEventListener('ended', ended);
    stop();
    try { audio.removeAttribute('src'); } catch { /* No external cleanup is needed. */ }
  }
  return {play, replay: () => state.line_id === null ? snapshot() : play(state.line_id), mute, destroy, snapshot};
}
