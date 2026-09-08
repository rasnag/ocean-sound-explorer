import test from 'node:test';
import assert from 'node:assert/strict';
import {makeExpedition} from '../lib/expedition.mjs';
import {OceanAudio} from '../lib/ocean-audio.mjs';
test('native media starts synchronously in tap and stop cannot award completion',()=>{
 const e=new OceanAudio();let gesture=true,played=0,done=0;
 const player={currentTime:0,pause(){},play(){assert.ok(gesture);played++;return Promise.resolve();}};
 e.player=player;e.clips.set(JSON.stringify([[],10]),'blob:test');
 const p=e.play([],10,()=>done++);gesture=false;assert.equal(played,1);assert.equal(p.context.currentTime,0);player.currentTime=4;assert.equal(p.context.currentTime,4);
 const callback=player.onended;e.stop();callback();assert.equal(done,0);
});
test('100 expeditions: balanced answers, distinct mixes, real overlapping decoys and valid target timing',()=>{
 for(let k=0;k<100;k++){
  const plans=makeExpedition();assert.equal(plans.length,5);assert.equal(plans.filter(p=>p.present).length,3);
  assert.equal(new Set(plans.map(p=>JSON.stringify(p.layers.map(l=>[l.start,l.duration])))).size,5);
  for(const p of plans){const target=p.layers.filter(l=>l.id===p.target);assert.equal(target.length,p.present?1:0);assert.ok(new Set(p.layers.map(l=>l.id)).size>=3);
   for(const l of p.layers){assert.ok(l.start>=0&&l.start+l.duration<=p.duration+.001);assert.ok(l.gain>0&&l.gain<.5);}
   assert.ok(p.layers.some((a,i)=>p.layers.some((b,j)=>i!==j&&a.start<b.start+b.duration&&b.start<a.start+a.duration)));
  }
 }
});
test('mobile architecture: resume and EVERY source start happen in the same gesture, including delayed layers',async()=>{
 let gesture=false;const calls=[];const param={setValueAtTime(){},linearRampToValueAtTime(){}};
 class Context{state='suspended';currentTime=12;sampleRate=44100;destination={};
  resume(){assert.ok(gesture);calls.push('resume');this.state='running';return Promise.resolve();}
  createBuffer(){return {duration:.0001};}
  createBufferSource(){return {connect(){},disconnect(){},stop(){},start(...args){assert.ok(gesture,'source started outside gesture');calls.push(args);}};}
  createGain(){return {gain:param,connect(){},disconnect(){}};}
  close(){this.state='closed';return Promise.resolve();}
 }
 globalThis.AudioContext=Context;const e=new OceanAudio();for(const id of ['beluga','humpback','dolphin','pilot','sperm'])e.buffers.set(id,{duration:12});
 const p=makeExpedition()[0];gesture=true;const result=e.play(p.layers,10);gesture=false;
 assert.ok(result);assert.equal(calls.filter(Array.isArray).length,p.layers.length+2);
 assert.ok(calls.filter(Array.isArray).some(c=>c[0]>17),'future starts are scheduled immediately');
 const generation=e.generation;e.stop();assert.ok(e.generation>generation);assert.equal(e.active,false);
 e.interrupt();assert.equal(e.context,null);gesture=true;e.play(p.layers,10);gesture=false;assert.ok(e.context);e.stop();
 delete globalThis.AudioContext;
});
