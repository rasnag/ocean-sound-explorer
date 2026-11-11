import test from 'node:test';
import assert from 'node:assert/strict';
import {assistedFixtureAdventure as spec} from '../lib/loop/assisted-fixture.mjs';
import {createAssistedPlayer, validateAssistedAdventure} from '../lib/loop/assisted-player.mjs';
import {createFixedAudio, fixedLines} from '../lib/loop/fixed-audio.mjs';
import {fixtureAudio} from '../lib/loop/fixture-audio.mjs';

const options = {playId: 'synthetic-assistance-test', consentEpoch: 1, startingPath: 'medium', startingReason: 'Explicit synthetic developer script.'};
for (const startingPath of ['fast','medium','slow']) test(`interleaved assistance preserves actual trials: ${startingPath}`, () => {
  const p = createAssistedPlayer(spec, {...options,startingPath});
  const envelope = (id, action) => ({contract_version: '1.1.0', play_id: options.playId, action_id: id,
    expected_sequence: p.snapshot().sequence, consent_epoch: 1, revision_id: spec.revision_id, pattern_version: 'fixture-1', action});
  const send = (id,action) => p.dispatch(envelope(id,action));
  const reject = value => { const before = p.snapshot(); assert.throws(() => p.dispatch(value)); assert.deepEqual(p.snapshot(),before); };
  send('p1',{kind:'predict',prediction:'tips'}); send('c1',{kind:'configure',configuration:'balanced'});
  const committed = p.snapshot();
  for (const level of [1,3,2,1]) {
    const id = `help-${p.snapshot().sequence}`;
    send(id,{kind:'help',level});
    assert.deepEqual(p.snapshot().help_history.at(-1),{level,action_id:id,sequence:p.snapshot().sequence});
  }
  send('close',{kind:'close_help'}); send('side',{kind:'side_thread',open:true});
  for (const key of ['prediction','configuration','prediction_action_id','configuration_action_id','current_result','trials']) assert.deepEqual(p.snapshot()[key],committed[key]);
  reject(envelope('p1',{kind:'help',level:2}));
  reject({...envelope('stale',{kind:'close_help'}),expected_sequence:0});
  reject(envelope('extra',{kind:'side_thread',open:false,extra:true}));
  send('t1',{kind:'test',prediction_action_id:'p1',configuration_action_id:'c1'});
  const first = structuredClone(p.snapshot().trials[0]);
  assert.equal(first.outcome,'stable'); assert.equal(first.action_sequence,p.snapshot().sequence);
  send('later-help',{kind:'help',level:3});
  send('p2',{kind:'predict',prediction:'stable'}); send('c2',{kind:'configure',configuration:'offset'});
  send('t2',{kind:'test',prediction_action_id:'p2',configuration_action_id:'c2'});
  assert.equal(p.snapshot().trials[1].outcome,'tips'); assert.deepEqual(p.snapshot().trials[0],first);
  send('compare',{kind:'compare',trial_ids:p.snapshot().trials.map(t=>t.trial_id)});
  const exposed = p.snapshot(); exposed.trials[0].outcome = 'forged'; exposed.help_history.length = 0;
  assert.deepEqual(p.snapshot().trials[0],first); assert.equal(p.snapshot().help_history.length,5);
});

test('finite profile and explicit construction reject unsupported content', () => {
  assert.equal(validateAssistedAdventure(spec),true);
  for (const change of [{html:'<script/>'},{opening:'<b>toy</b>'},{outcomes:{balanced:'tips',offset:'tips'}},{engine_version:'fixture-engine-1'}]) assert.throws(()=>validateAssistedAdventure({...spec,...change}));
  for (const key of Object.keys(options)) { const bad = {...options}; delete bad[key]; assert.throws(()=>createAssistedPlayer(spec,bad)); }
  assert.throws(()=>createAssistedPlayer(spec,{...options,startingReason:' '}));
});

class Media extends EventTarget {
  calls = 0; pauses = 0; pending = []; src = ''; currentTime = 0;
  play() { this.calls++; return new Promise((resolve,reject)=>this.pending.push({resolve,reject})); }
  pause() { this.pauses++; }
  removeAttribute() { this.src = ''; }
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
test('media gestures, error fallback and stale promises remain independent', async () => {
  const audio = new Media(), states = [];
  const c = createFixedAudio({audio,onState:s=>states.push(s)});
  for (const line of Object.values(fixedLines)) assert.equal(line.src,fixtureAudio.source);
  assert.throws(()=>c.play('unknown')); assert.equal(audio.calls,0);
  c.play('ready'); assert.equal(audio.calls,1); assert.equal(audio.src,fixtureAudio.source);
  const prior = audio.pending.shift(); c.mute(true); prior.resolve(); await tick();
  assert.equal(c.snapshot().status,'muted'); c.replay(); assert.equal(audio.calls,1);
  c.mute(false); assert.equal(audio.calls,1);
  c.play('test'); const failed = audio.pending.shift(); audio.dispatchEvent(new Event('error')); failed.resolve(); await tick();
  assert.equal(c.snapshot().status,'unavailable');
  c.play('compare'); audio.pending.shift().resolve(); await tick(); audio.dispatchEvent(new Event('ended'));
  assert.equal(c.snapshot().status,'ended');
  c.play('ready'); const last = audio.pending.shift(); c.destroy(); const count = states.length;
  last.reject(new Error('Synthetic stale failure')); await tick(); audio.dispatchEvent(new Event('ended'));
  assert.equal(states.length,count); assert(audio.pauses > 0);
});
