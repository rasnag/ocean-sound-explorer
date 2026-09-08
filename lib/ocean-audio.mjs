import {animals} from './expedition.mjs';

export class OceanAudio {
 constructor(){this.context=null;this.buffers=new Map();this.nodes=[];this.generation=0;this.loading=null;this.active=false;this.clips=new Map();this.player=null;}
 // Must be called in the actual click handler, before any await.
 unlock(){
  // iPhone otherwise routes Web Audio as game effects, which the silent switch mutes.
  try{if(globalThis.navigator?.audioSession)globalThis.navigator.audioSession.type='playback';}catch{}
  if(!this.context || this.context.state==='closed'){
   const C=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!C)throw Error('This browser cannot play the recordings. Try Safari or Chrome.');
   this.context=new C();
  }
  const resumed=this.context.resume();
  // A silent BUFFER primes mobile output in the gesture, never a synthetic call.
  const prime=this.context.createBufferSource();prime.buffer=this.context.createBuffer(1,1,22050);prime.connect(this.context.destination);prime.start();
  return resumed;
 }
 async load(base,onProgress=()=>{}){
  if(this.buffers.size===animals.length)return;
  if(this.loading)return this.loading;
  const context=this.context;
  this.loading=Promise.all(animals.map(async({id})=>{
   if(this.buffers.has(id))return;
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
   try {
    const r=await fetch(`${base}audio/${id}.mp3`,{signal:controller.signal});if(!r.ok)throw Error('Recording unavailable');
    const buffer=await context.decodeAudioData(await r.arrayBuffer());
    // Normalize each real recording's RMS, with a peak ceiling; do not alter pitch.
    let energy=0,peak=0,count=0;
    for(let c=0;c<buffer.numberOfChannels;c++){const d=buffer.getChannelData(c);for(let i=0;i<d.length;i++){energy+=d[i]*d[i];peak=Math.max(peak,Math.abs(d[i]));count++;}}
    const scale=Math.min(.14/Math.max(Math.sqrt(energy/count),.0001),.8/Math.max(peak,.0001));
    for(let c=0;c<buffer.numberOfChannels;c++){const d=buffer.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=scale;}
    this.buffers.set(id,buffer);onProgress(this.buffers.size);
   } finally{clearTimeout(timeout);}
  })).then(()=>undefined).finally(()=>{this.loading=null;});
  return this.loading;
 }
 prepare(plans){
  this.stop();for(const url of this.clips.values())URL.revokeObjectURL(url);this.clips.clear();
  if(!this.player){this.player=new Audio();this.player.preload='auto';this.player.setAttribute('playsinline','');}
  for(const animal of animals){const duration=Math.min(5,this.buffers.get(animal.id).duration);const layers=[{id:animal.id,start:0,duration,offset:0,gain:.85,pan:0}];this.prepareClip(layers,duration);}
  for(const plan of plans)this.prepareClip(plan.layers,plan.duration);
 }
 prepareClip(layers,duration){
  // Render a real-audio collage ahead of the tap; native media playback avoids
  // iPhone's muted Web Audio effects channel. No oscillator or synthetic call.
  const rate=44100,frames=Math.ceil(duration*rate),left=new Float32Array(frames),right=new Float32Array(frames);
  for(const layer of layers){const b=this.buffers.get(layer.id);const offset=Math.min(layer.offset||0,Math.max(0,b.duration-layer.duration));const length=Math.min(layer.duration,b.duration-offset);const start=Math.round(layer.start*rate);const count=Math.floor(length*rate);const l=b.getChannelData(0),r=b.getChannelData(Math.min(1,b.numberOfChannels-1));const angle=((layer.pan||0)+1)*Math.PI/4;
   for(let j=0;j<count&&start+j<frames;j++){const t=j/rate;const fade=Math.max(0,Math.min(1,t/.08,(length-t)/.18));const sample=Math.min(l.length-1,Math.floor((offset+t)*b.sampleRate));left[start+j]+=l[sample]*layer.gain*fade*Math.cos(angle);right[start+j]+=r[sample]*layer.gain*fade*Math.sin(angle);}
  }
  const bytes=new ArrayBuffer(44+frames*4),v=new DataView(bytes);const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,36+frames*4,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,frames*4,true);
  for(let i=0;i<frames;i++){v.setInt16(44+i*4,Math.max(-1,Math.min(1,left[i]))*32767,true);v.setInt16(46+i*4,Math.max(-1,Math.min(1,right[i]))*32767,true);}
  this.clips.set(JSON.stringify([layers,duration]),URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})));
 }
 play(layers,duration,onComplete=()=>{},onError=()=>{}){
  this.stop();
  const token=this.generation;
  const clip=this.clips.get(JSON.stringify([layers,duration]));
  if(clip&&this.player){
   try{if(globalThis.navigator?.audioSession)globalThis.navigator.audioSession.type='playback';}catch{}
   const player=this.player;player.src=clip;player.currentTime=0;player.volume=1;player.muted=false;this.active=true;
   player.onended=()=>{if(token===this.generation){this.stop();onComplete();}};
   player.onerror=()=>{if(token===this.generation){this.stop();onError(Error('Media playback failed'));}};
   try{const started=player.play();Promise.resolve(started).catch(e=>{if(token===this.generation){this.stop();onError(e);}});}catch(e){this.stop();onError(e);return null;}
   return {origin:0,duration,context:{get currentTime(){return player.currentTime;}}};
  }
  // Resume AND all source.start calls run synchronously under this tap.
  const resume=this.unlock();const c=this.context;const origin=c.currentTime+.04;
  this.active=true;
  try{
   for(const layer of layers){
    const buffer=this.buffers.get(layer.id);if(!buffer)throw Error('Please load the recordings first.');
    const source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;
    const offset=Math.min(layer.offset||0,Math.max(0,buffer.duration-layer.duration));
    const length=Math.min(layer.duration,buffer.duration-offset);const start=origin+layer.start;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(layer.gain,start+.08);
    gain.gain.setValueAtTime(layer.gain,start+Math.max(.09,length-.18));gain.gain.linearRampToValueAtTime(0,start+length);
    source.connect(gain);
    if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=layer.pan||0;gain.connect(p);p.connect(c.destination);this.nodes.push(p);}else gain.connect(c.destination);
    source.start(start,offset,length);this.nodes.push(source,gain);
   }
   const end=c.createBufferSource();end.buffer=c.createBuffer(1,1,c.sampleRate);end.connect(c.destination);
   end.onended=()=>{if(this.generation===token && this.active){this.stop();onComplete();}};
   end.start(origin+duration);this.nodes.push(end);
  }catch(e){this.stop();onError(e);return null;}
  Promise.resolve(resume).catch(e=>{if(token===this.generation){this.stop();onError(e);}});
  return {origin,duration,context:c};
 }
 stop(){this.generation++;this.active=false;if(this.player){this.player.onended=null;this.player.onerror=null;this.player.pause();}for(const node of this.nodes){node.onended=null;try{node.stop?.();}catch{}try{node.disconnect();}catch{}}this.nodes=[];}
 interrupt(){this.stop();const old=this.context;this.context=null;if(old)void old.close().catch(()=>{});}
}
