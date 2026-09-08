import {animals} from './expedition.mjs';

export class OceanAudio {
 constructor(){this.context=null;this.buffers=new Map();this.nodes=[];this.generation=0;this.loading=null;this.active=false;}
 // Must be called in the actual click handler, before any await.
 unlock(){
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
 play(layers,duration,onComplete=()=>{},onError=()=>{}){
  this.stop();
  const token=this.generation;
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
 stop(){this.generation++;this.active=false;for(const node of this.nodes){node.onended=null;try{node.stop?.();}catch{}try{node.disconnect();}catch{}}this.nodes=[];}
 interrupt(){this.stop();const old=this.context;this.context=null;if(old)void old.close().catch(()=>{});}
}
