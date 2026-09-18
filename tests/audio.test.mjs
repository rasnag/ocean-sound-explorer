import test from 'node:test';
import assert from 'node:assert/strict';
import {makeExpedition} from '../lib/expedition.mjs';
import {OceanAudio} from '../lib/ocean-audio.mjs';

test('native media starts synchronously in a tap and stop cannot award completion',()=>{
 const engine=new OceanAudio();let gesture=true,played=0,done=0;
 const player={currentTime:0,pause(){},play(){assert.ok(gesture);played++;return Promise.resolve();}};
 engine.player=player;engine.clips.set(JSON.stringify([[],10]),'blob:test');
 const playback=engine.play([],10,()=>done++);gesture=false;
 assert.equal(played,1);assert.equal(playback.context.currentTime,0);
 player.currentTime=4;assert.equal(playback.context.currentTime,4);
 const callback=player.onended;engine.stop();callback();assert.equal(done,0);
});

test('the expedition has two confidence rounds followed by three ocean rounds',()=>{
 const plans=makeExpedition();
 assert.equal(plans.length,5);
 assert.deepEqual(plans.map(plan=>plan.target),['owl','horse','dolphin','humpback','sperm']);
 assert.deepEqual(plans.map(plan=>plan.warmup),[true,true,false,false,false]);
 assert.equal(new Set(plans.map(plan=>plan.target)).size,5);
 for(const plan of plans)assert.ok(plan.options.includes(plan.target));
});

test('Web Audio playback schedules every source during the initiating gesture',()=>{
 let gesture=false;const calls=[];const param={setValueAtTime(){},linearRampToValueAtTime(){}};
 class Context{state='suspended';currentTime=12;sampleRate=44100;destination={};
  resume(){assert.ok(gesture);calls.push('resume');this.state='running';return Promise.resolve();}
  createBuffer(){return {duration:.0001};}
  createBufferSource(){return {connect(){},disconnect(){},stop(){},start(...args){assert.ok(gesture,'source started outside gesture');calls.push(args);}};}
  createGain(){return {gain:param,connect(){},disconnect(){}};}
  close(){this.state='closed';return Promise.resolve();}
 }
 globalThis.AudioContext=Context;
 const engine=new OceanAudio();engine.buffers.set('owl',{duration:12});
 gesture=true;const result=engine.play([{id:'owl',start:0,duration:1,offset:0,gain:.9,pan:0}],1);gesture=false;
 assert.ok(result);assert.equal(calls.filter(Array.isArray).length,3);
 engine.stop();delete globalThis.AudioContext;
});
