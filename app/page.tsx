'use client';
import {useEffect,useRef,useState} from 'react';
import {Anchor,ArrowRight,Check,Headphones,Play,RotateCcw,Square,Volume2,VolumeX,X} from 'lucide-react';
import {Progress} from '@/components/ui/progress';
import {animals,makeExpedition} from '@/lib/expedition.mjs';
import {OceanAudio} from '@/lib/ocean-audio.mjs';
const story='Captain! Our underwater microphone recorded a whole ocean of sounds. Some animals were close, some far away, and some called at the same time. Learn each animal’s voice, then help us figure out who was in the recording.';
export default function Home(){
 const [screen,setScreen]=useState('intro'),[index,setIndex]=useState(0),[ready,setReady]=useState(false),[loaded,setLoaded]=useState(0),[error,setError]=useState(''),[playing,setPlaying]=useState(''),[elapsed,setElapsed]=useState(0),[learned,setLearned]=useState(false),[heard,setHeard]=useState(false),[answer,setAnswer]=useState<boolean|null>(null),[score,setScore]=useState(0),[voice,setVoice]=useState(true);
 const engine=useRef<OceanAudio|null>(null),plans=useRef<ReturnType<typeof makeExpedition>>([]),raf=useRef(0),busy=useRef(false),answered=useRef(false),alive=useRef(true);
 const a=animals[index];
 const base=()=>new URL('./',window.location.href).pathname;
 function audio(){return engine.current||(engine.current=new OceanAudio());}
 function speak(text:string){if(!voice||!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=.87;window.speechSynthesis.speak(u);}
 function silence(){if('speechSynthesis' in window)window.speechSynthesis.cancel();}
 function stop(){audio().stop();cancelAnimationFrame(raf.current);busy.current=false;setPlaying('');setElapsed(0);}
 useEffect(()=>{alive.current=true;const hide=()=>{if(document.hidden){engine.current?.interrupt();silence();cancelAnimationFrame(raf.current);busy.current=false;setPlaying('');setElapsed(0);}};document.addEventListener('visibilitychange',hide);return()=>{alive.current=false;document.removeEventListener('visibilitychange',hide);engine.current?.interrupt();cancelAnimationFrame(raf.current);silence();};},[]);
 function load(){
  setError('');
  try{const e=audio();void e.unlock().catch(()=>{if(alive.current)setError('Tap “Load sounds” to try again.');});
   void e.load(base(),(n:number)=>{if(alive.current)setLoaded(n);}).then(()=>{if(alive.current){setReady(true);setError('');}}).catch(()=>{if(alive.current)setError('The sounds could not load. Check your connection, then try again.');});
  }catch{setError('Sound is unavailable. Please try Safari or Chrome.');}
 }
 function start(){plans.current=makeExpedition();setIndex(0);setScore(0);setAnswer(null);answered.current=false;setLearned(false);setHeard(false);setScreen('game');load();speak('Meet the beluga whale! Tap the yellow button to hear its voice.');}
 function play(kind:string){
  if(busy.current||!ready)return;
  silence();setError('');setElapsed(0);busy.current=true;setPlaying(kind);
  const plan=plans.current[index];const duration=kind==='learn'?Math.min(5,audio().buffers.get(a.id)?.duration||5):plan.duration;
  const layers=kind==='learn'?[{id:a.id,start:0,duration,offset:0,gain:.85,pan:0}]:plan.layers;
  const running=audio().play(layers,duration,()=>{cancelAnimationFrame(raf.current);busy.current=false;setPlaying('');setElapsed(0);if(kind==='learn')setLearned(true);else setHeard(true);},()=>{cancelAnimationFrame(raf.current);busy.current=false;setPlaying('');setError('Sound paused. Tap the play button to try again.');});
  if(running){let stalledAt=performance.now(),lastTime=running.context.currentTime;const tick=()=>{if(!audio().active)return;const now=running.context.currentTime;setElapsed(Math.max(0,Math.min(duration,now-running.origin)));if(now>lastTime+.005){lastTime=now;stalledAt=performance.now();}else if(performance.now()-stalledAt>4000){audio().interrupt();busy.current=false;setPlaying('');setError('Sound paused. Tap play to wake it up.');return;}raf.current=requestAnimationFrame(tick);};raf.current=requestAnimationFrame(tick);}
 }
 function choose(value:boolean){if(!heard||busy.current||answered.current)return;answered.current=true;setAnswer(value);const correct=value===plans.current[index].present;if(correct)setScore(s=>s+1);speak((correct?'Great listening, Captain! ': 'Good exploring! ')+(plans.current[index].present?'Yes, the '+a.name+' was there. ':'This time, the '+a.name+' was not there. ')+a.fact);}
 function next(){stop();silence();if(index===4){setScreen('done');speak('Expedition complete! You listened to five ocean friends. Well done, Captain!');return;}setIndex(i=>i+1);setLearned(false);setHeard(false);setAnswer(null);answered.current=false;setError('');speak('Meet the '+animals[index+1].name+'. Tap the yellow button to hear its voice.');}
 // Supported browsers can expose the same answer action to an assistive agent.
 useEffect(()=>{const context=(document as any).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();try{Promise.resolve(context.registerTool({name:'answer_ocean_recording',description:'Answer whether the target animal was present, after the child has listened to the mystery recording.',inputSchema:{type:'object',properties:{present:{type:'boolean'}},required:['present'],additionalProperties:false},annotations:{readOnlyHint:false},execute:(input:any)=>{if(typeof input?.present!=='boolean'||Object.keys(input).length!==1)throw Error('Expected only present: boolean');if(screen!=='game'||!heard||playing||answered.current)throw Error('Listen to the recording before answering.');choose(input.present);return {accepted:true,correct:input.present===plans.current[index].present};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}return()=>lifecycle.abort();},[screen,heard,playing,index,voice]);
 return <main className="expedition">
  <header><span className="brand"><Anchor aria-hidden="true"/> <span>Ocean Sound<br className="mobile-break"/> Explorer</span></span><button className="voice-toggle" aria-label={voice?'Turn spoken help off':'Turn spoken help on'} aria-pressed={voice} onClick={()=>{silence();setVoice(!voice);}}>{voice?<Volume2/>:<VolumeX/>}<span>Spoken help</span></button></header>
  {screen==='intro'?<section className="console intro">
   <div className="intro-photo"><img src="./animals/dolphin.webp" alt="A bottlenose dolphin leaping out of the ocean"/><span className="mission-tag"><Headphones size={18}/> MISSION: LISTEN!</span></div>
   <div className="intro-body"><span className="eyebrow">AHOY, LITTLE EXPLORER</span><h1>Who’s calling<br/>down there?</h1><button className="story-button" onClick={()=>speak(story)}><Volume2/> Hear your mission</button><p className="story">{story}</p><button className="primary big" onClick={start}><Play fill="currentColor"/> Let’s explore!</button><span className="small">5 ocean friends · Real animal sounds</span></div>
  </section>:screen==='done'?<section className="console done"><span className="medal" aria-hidden="true">🏅</span><span className="eyebrow">MISSION COMPLETE</span><h1>Ocean explorer!</h1><p>You listened to all five friends.</p><div className="collected">{animals.map(an=><img key={an.id} src={'./animals/'+an.id+'.webp'} alt={an.name}/>)}</div><p className="score">{score} / 5 sounds spotted</p><button className="primary big" onClick={start}><RotateCcw/> Explore again!</button><span className="small">A whole new set of mystery recordings.</span></section>:<>
   <div className="journey"><span>Animal {index+1} of 5</span><div className="steps" aria-label={`${index} of 5 animals completed`}>{animals.map((an,i)=><span key={an.id} className={i<index?'visited':i===index?'current':''}>{i<index?<Check size={18}/>:i+1}</span>)}</div><span className="stars">★ {score}</span></div>
   <section className="console game">
    <div className="animal-panel"><div className="animal-photo"><img src={'./animals/'+a.id+'.webp'} alt={a.name}/><span className="animal-sticker" aria-hidden="true">{a.icon}</span></div><div className="animal-title"><span className="eyebrow">MEET YOUR OCEAN FRIEND</span><h1>{a.name}</h1><p>{a.hint}</p></div></div>
    <div className="control-panel">
     {!ready?<div className="loading" role="status"><Headphones size={36}/><h2>Gathering ocean sounds…</h2><Progress value={loaded*20} aria-label="Recordings loaded"/><p>{loaded} of 5 ready</p>{error&&<><p role="alert">{error}</p><button className="primary big" onClick={load}>Load sounds</button></>}</div>:<>
     <div className="listen-step"><span className="step-number">1</span><span>Learn my voice</span>{learned&&<Check className="step-check"/>}</div>
     <button className={'primary big audio-button '+(playing==='learn'?'is-playing':'')} disabled={!!playing&&playing!=='learn'} onClick={()=>playing==='learn'?stop():play('learn')}>{playing==='learn'?<Square fill="currentColor"/>:<Volume2/>}{playing==='learn'?'Stop':'Hear my voice'}</button>
     <div className="listen-step second"><span className="step-number">2</span><span>Listen for me</span>{heard&&<Check className="step-check"/>}</div>
     <button className={'mix-button big '+(playing==='mix'?'is-playing':'')} disabled={!learned||(!!playing&&playing!=='mix')} onClick={()=>playing==='mix'?stop():play('mix')}>{playing==='mix'?<Square fill="currentColor"/>:<Headphones/>}{playing==='mix'?'Stop recording':heard?'Hear it again':'Mystery recording'}</button>
     <div className={'waveform '+(playing?'moving':'')} aria-hidden="true">{[3,6,4,8,5,10,7,4,8,11,6,9,4,7,10,5,8,4,6,3,7,5,9,4,6,3].map((height,i)=><i key={i} style={{height:height*3,animationDelay:`${i*-.09}s`}}/>)}</div>
     <div className="play-status" aria-live="polite">{playing?`${playing==='mix'?'Ocean recording':'Animal voice'} · ${Math.ceil((playing==='mix'?10:5)-elapsed)}s`:!learned?'First, hear your animal’s voice.':!heard?'Now try the mystery recording.':'Was your animal in there?'}</div>
     <div className="answers"><button className="yes" disabled={!heard||!!playing||answer!==null} onClick={()=>choose(true)}><Check/><span>Yes!</span></button><button className="no" disabled={!heard||!!playing||answer!==null} onClick={()=>choose(false)}><X/><span>No!</span></button></div>
     {error&&<p className="error" role="alert">{error}</p>}
     {answer!==null&&<div className="feedback" role="status"><div className="feedback-title"><span aria-hidden="true">{answer===plans.current[index].present?'🌟':'💙'}</span><h2>{answer===plans.current[index].present?'Super listening!':'Good exploring!'}</h2></div><p>{plans.current[index].present?'Yes, I was in there!':'I wasn’t in this recording.'}</p><p className="fact">{a.fact}</p><button className="primary big" onClick={next}>{index===4?'Finish expedition':'Next friend'}<ArrowRight/></button></div>}
     </>}
    </div>
   </section>
  </>}
  <footer><a href="./credits.html">For grown-ups · Sounds & photo credits</a><span>Made for curious ears.</span></footer>
 </main>;
}
