'use client';
import {useEffect,useRef,useState} from 'react';
import {Anchor,ArrowRight,Check,Headphones,Play,RotateCcw,Square,Volume2,X} from 'lucide-react';
import {Progress} from '@/components/ui/progress';
import {animals,makeExpedition} from '@/lib/expedition.mjs';
import {OceanAudio} from '@/lib/ocean-audio.mjs';

export default function Home(){
 const [screen,setScreen]=useState('intro'),[index,setIndex]=useState(0),[ready,setReady]=useState(false),[loaded,setLoaded]=useState(0),[error,setError]=useState(''),[playing,setPlaying]=useState(''),[elapsed,setElapsed]=useState(0),[learned,setLearned]=useState(false),[heard,setHeard]=useState(false),[answer,setAnswer]=useState<boolean|null>(null),[score,setScore]=useState(0),[narrating,setNarrating]=useState(false);
 const engine=useRef<OceanAudio|null>(null),plans=useRef<ReturnType<typeof makeExpedition>>([]),raf=useRef(0),busy=useRef(false),answered=useRef(false),alive=useRef(true),voice=useRef<SpeechSynthesisVoice|null>(null);
 const a=animals[index];
 const base=()=>new URL('./',window.location.href).pathname;
 function audio(){return engine.current||(engine.current=new OceanAudio());}
 function silence(){if('speechSynthesis' in window){window.speechSynthesis.cancel();setNarrating(false);}}
 function stop(){audio().stop();cancelAnimationFrame(raf.current);busy.current=false;setPlaying('');setElapsed(0);}
 function pickFemaleVoice(){
  if(!('speechSynthesis' in window))return null;
  const voices=window.speechSynthesis.getVoices().filter(v=>/^en(-|_)/i.test(v.lang)||/^en$/i.test(v.lang));
  const preferred=['Samantha','Ava','Serena','Zira','Aria','Jenny','Victoria','Karen','Moira','Tessa','Google US English','Microsoft Aria','Microsoft Jenny'];
  for(const name of preferred){const match=voices.find(v=>v.name.toLowerCase().includes(name.toLowerCase()));if(match)return match;}
  return voices.find(v=>/female|woman|girl/i.test(v.name))||voices[0]||null;
 }
 function speak(text:string,onDone?:()=>void){
  if(!('speechSynthesis' in window)){onDone?.();return;}
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);
  voice.current=voice.current||pickFemaleVoice();
  if(voice.current)utterance.voice=voice.current;
  utterance.lang='en-US';utterance.rate=.9;utterance.pitch=1.08;utterance.volume=1;
  utterance.onstart=()=>alive.current&&setNarrating(true);
  utterance.onend=()=>{if(alive.current)setNarrating(false);onDone?.();};
  utterance.onerror=()=>{if(alive.current)setNarrating(false);onDone?.();};
  window.speechSynthesis.speak(utterance);
 }
 function narrateAnimal(animal=animals[index]){speak(`Meet the ${animal.name}. First, listen to its voice. Tap the blue sound button.`);}
 useEffect(()=>{alive.current=true;const setVoice=()=>{voice.current=pickFemaleVoice();};setVoice();if('speechSynthesis' in window)window.speechSynthesis.onvoiceschanged=setVoice;const hide=()=>{if(document.hidden){engine.current?.interrupt();silence();cancelAnimationFrame(raf.current);busy.current=false;setPlaying('');setElapsed(0);}};document.addEventListener('visibilitychange',hide);return()=>{alive.current=false;document.removeEventListener('visibilitychange',hide);engine.current?.interrupt();cancelAnimationFrame(raf.current);silence();if('speechSynthesis' in window)window.speechSynthesis.onvoiceschanged=null;};},[]);
 function load(){
  setError('');
  try{const e=audio();void e.unlock().catch(()=>{if(alive.current)setError('Tap “Load sounds” to try again.');});
   void e.load(base(),(n:number)=>{if(alive.current)setLoaded(n);}).then(()=>{if(alive.current){e.prepare(plans.current);setReady(true);setError('');narrateAnimal(animals[0]);}}).catch(()=>{if(alive.current)setError('The sounds could not load. Check your connection, then try again.');});
  }catch{setError('Sound is unavailable. Please try Safari or Chrome.');}
 }
 function start(){plans.current=makeExpedition();setIndex(0);setScore(0);setAnswer(null);answered.current=false;setLearned(false);setHeard(false);setReady(false);setLoaded(0);setScreen('game');silence();speak('Welcome, Ocean Explorer! Use your ears to find the animal hiding in each ocean recording.',load);}
 function play(kind:string){
  if(busy.current||!ready||narrating)return;
  silence();setError('');setElapsed(0);busy.current=true;setPlaying(kind);
  const plan=plans.current[index];const duration=kind==='learn'?Math.min(5,audio().buffers.get(a.id)?.duration||5):plan.duration;
  const layers=kind==='learn'?[{id:a.id,start:0,duration,offset:0,gain:.9,pan:0}]:plan.layers;
  const running=audio().play(layers,duration,()=>{cancelAnimationFrame(raf.current);busy.current=false;setPlaying('');setElapsed(0);if(kind==='learn'){setLearned(true);speak(`That was the ${a.name}. Now tap the headphones and listen for it in the mystery recording.`);}else{setHeard(true);speak(`Did you hear the ${a.name}? Tap yes or no.`);}},()=>{cancelAnimationFrame(raf.current);busy.current=false;setPlaying('');setError('Sound paused. Tap play to try again.');});
  if(running){let stalledAt=performance.now(),lastTime=running.context.currentTime;const tick=()=>{if(!audio().active)return;const now=running.context.currentTime;setElapsed(Math.max(0,Math.min(duration,now-running.origin)));if(now>lastTime+.005){lastTime=now;stalledAt=performance.now();}else if(performance.now()-stalledAt>4000){audio().interrupt();busy.current=false;setPlaying('');setError('Sound paused. Tap play to wake it up.');return;}raf.current=requestAnimationFrame(tick);};raf.current=requestAnimationFrame(tick);}
 }
 function choose(value:boolean){
  if(!heard||busy.current||answered.current||narrating)return;
  answered.current=true;setAnswer(value);const present=plans.current[index].present;const correct=value===present;if(correct)setScore(s=>s+1);
  const praise=correct?'Great listening!':'Good try!';
  const reveal=present?`Yes, the ${a.name} was hiding in that recording.`:`No, the ${a.name} was not in that recording.`;
  speak(`${praise} ${reveal} ${a.fact}`);
 }
 function next(){stop();silence();if(index===4){setScreen('done');speak(`Mission complete! You found ${score} out of 5 sounds. Great exploring!`);return;}const ni=index+1;setIndex(ni);setLearned(false);setHeard(false);setAnswer(null);answered.current=false;setError('');setTimeout(()=>narrateAnimal(animals[ni]),120);}
 useEffect(()=>{const context=(document as any).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();try{Promise.resolve(context.registerTool({name:'answer_ocean_recording',description:'Answer whether the target animal was present, after the child has listened to the mystery recording.',inputSchema:{type:'object',properties:{present:{type:'boolean'}},required:['present'],additionalProperties:false},annotations:{readOnlyHint:false},execute:(input:any)=>{if(typeof input?.present!=='boolean'||Object.keys(input).length!==1)throw Error('Expected only present: boolean');if(screen!=='game'||!heard||playing||answered.current)throw Error('Listen to the recording before answering.');choose(input.present);return {accepted:true,correct:input.present===plans.current[index].present};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}return()=>lifecycle.abort();},[screen,heard,playing,index,narrating]);
 return <main className="expedition">
  <header><span className="brand"><Anchor aria-hidden="true"/> <span>Ocean Sound<br className="mobile-break"/> Explorer</span></span></header>
  {screen==='intro'?<section className="console intro">
   <div className="intro-photo"><img src="./animals/dolphin.webp" alt="A bottlenose dolphin leaping out of the ocean"/><span className="mission-tag"><Headphones size={18}/> USE YOUR EARS</span></div>
   <div className="intro-body"><span className="eyebrow">OCEAN SOUND MISSION</span><h1>Who’s calling<br/>down there?</h1><button className="primary big" onClick={start}><Play fill="currentColor"/> Start listening</button><span className="small">5 ocean friends · Real animal sounds</span></div>
  </section>:screen==='done'?<section className="console done"><span className="medal" aria-hidden="true">🏅</span><span className="eyebrow">MISSION COMPLETE</span><h1>Ocean explorer!</h1><div className="collected">{animals.map(an=><img key={an.id} src={'./animals/'+an.id+'.webp'} alt={an.name}/>)}</div><p className="score">{score} / 5</p><button className="primary big" onClick={start}><RotateCcw/> Play again</button></section>:<>
   <div className="journey"><span>{index+1} / 5</span><div className="steps" aria-label={`${index} of 5 animals completed`}>{animals.map((an,i)=><span key={an.id} className={i<index?'visited':i===index?'current':''}>{i<index?<Check size={18}/>:i+1}</span>)}</div><span className="stars">★ {score}</span></div>
   <section className="console game">
    <div className="animal-panel"><div className="animal-photo"><img src={'./animals/'+a.id+'.webp'} alt={a.name}/><span className="animal-sticker" aria-hidden="true">{a.icon}</span></div><div className="animal-title"><h1>{a.name}</h1></div></div>
    <div className="control-panel">
     {!ready?<div className="loading" role="status"><Headphones size={36}/><h2>Getting sounds…</h2><Progress value={loaded*20} aria-label="Recordings loaded"/><p>{loaded} / 5</p>{error&&<><p role="alert">{error}</p><button className="primary big" onClick={load}>Load sounds</button></>}</div>:<>
     <button aria-label={`Hear the ${a.name}`} className={'primary big audio-button '+(playing==='learn'?'is-playing':'')} disabled={narrating||(!!playing&&playing!=='learn')} onClick={()=>playing==='learn'?stop():play('learn')}>{playing==='learn'?<Square fill="currentColor"/>:<Volume2/>}{playing==='learn'?'Stop':'Hear me'}</button>
     <button aria-label="Play mystery ocean recording" className={'mix-button big '+(playing==='mix'?'is-playing':'')} disabled={!learned||narrating||(!!playing&&playing!=='mix')} onClick={()=>playing==='mix'?stop():play('mix')}>{playing==='mix'?<Square fill="currentColor"/>:<Headphones/>}{playing==='mix'?'Stop':heard?'Listen again':'Mystery sound'}</button>
     <div className={'waveform '+(playing?'moving':'')} aria-hidden="true">{[3,6,4,8,5,10,7,4,8,11,6,9,4,7,10,5,8,4,6,3,7,5,9,4,6,3].map((height,i)=><i key={i} style={{height:height*3,animationDelay:`${i*-.09}s`}}/>)}</div>
     <div className="play-status" aria-live="polite">{playing?`${Math.ceil((playing==='mix'?10:5)-elapsed)}s`:narrating?'🔊 Listen…':!learned?'① Hear me':!heard?'② Mystery sound':'③ Was I there?'}</div>
     <div className="answers"><button className="yes" disabled={!heard||!!playing||answer!==null||narrating} onClick={()=>choose(true)}><Check/><span>Yes</span></button><button className="no" disabled={!heard||!!playing||answer!==null||narrating} onClick={()=>choose(false)}><X/><span>No</span></button></div>
     {error&&<p className="error" role="alert">{error}</p>}
     {answer!==null&&<div className="feedback" role="status"><div className="feedback-title"><span aria-hidden="true">{answer===plans.current[index].present?'🌟':'💙'}</span><h2>{answer===plans.current[index].present?'You got it!':'Good try!'}</h2></div><button className="primary big" disabled={narrating} onClick={next}>{index===4?'Finish':'Next'}<ArrowRight/></button></div>}
     </>}
    </div>
   </section>
  </>}
  <footer><a href="./credits.html">For grown-ups · Credits</a></footer>
 </main>;
}
