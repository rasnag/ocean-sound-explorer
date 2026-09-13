'use client';
import {useEffect,useRef,useState} from 'react';
import {Anchor,Check,Headphones,Play,RotateCcw,Square,Volume2} from 'lucide-react';
import {Progress} from '@/components/ui/progress';
import {animals,makeExpedition,ROUND_COUNT} from '@/lib/expedition.mjs';
import {OceanAudio} from '@/lib/ocean-audio.mjs';
export default function Home(){
 const [screen,setScreen]=useState('intro'),[index,setIndex]=useState(0),[ready,setReady]=useState(false),[loaded,setLoaded]=useState(0),[error,setError]=useState(''),[playing,setPlaying]=useState(false),[heard,setHeard]=useState(false),[answer,setAnswer]=useState<string|null>(null),[score,setScore]=useState(0);
 const engine=useRef<OceanAudio|null>(null),plans=useRef<any[]>([]),busy=useRef(false),alive=useRef(true);
 const plan=plans.current[index],target=animals.find(a=>a.id===plan?.target);
 const base=()=>new URL('./',window.location.href).pathname;
 function audio(){return engine.current||(engine.current=new OceanAudio());}
 function stop(){audio().stop();busy.current=false;setPlaying(false);}
 useEffect(()=>{alive.current=true;const hide=()=>{if(document.hidden){engine.current?.interrupt();busy.current=false;setPlaying(false);}};document.addEventListener('visibilitychange',hide);return()=>{alive.current=false;document.removeEventListener('visibilitychange',hide);engine.current?.interrupt();};},[]);
 function load(){setError('');try{const e=audio();void e.unlock();void e.load(base(),n=>alive.current&&setLoaded(n)).then(()=>{if(alive.current){e.prepare(plans.current);setReady(true);}}).catch(()=>alive.current&&setError('Sounds could not load. Tap to try again.'));}catch{setError('Sound is unavailable. Please try Safari or Chrome.');}}
 function start(){plans.current=makeExpedition();setIndex(0);setScore(0);setAnswer(null);setHeard(false);setReady(false);setLoaded(0);setScreen('game');load();}
 function play(){if(busy.current||!ready)return;setError('');busy.current=true;setPlaying(true);const p=plans.current[index];audio().play(p.layers,p.duration,()=>{busy.current=false;setPlaying(false);setHeard(true);},()=>{busy.current=false;setPlaying(false);setError('Oops — the sound stopped. Tap the big sound button to hear it again.');});}
 function choose(id:string){if(!heard||playing||answer)return;setAnswer(id);if(id===plan.target)setScore(s=>s+1);}
 function next(){stop();if(index===ROUND_COUNT-1){setScreen('done');return;}setIndex(i=>i+1);setHeard(false);setAnswer(null);setError('');}
 return <main className="expedition">
  <header><span className="brand"><Anchor aria-hidden="true"/> <span>Sound<br className="mobile-break"/> Explorer</span></span></header>
  {screen==='intro'?<section className="console intro"><div className="intro-photo"><img src="./animals/dolphin.webp" alt="A dolphin"/><span className="mission-tag"><Headphones size={18}/> SOUND MISSION</span></div><div className="intro-body"><span className="eyebrow">AHOY, EXPLORER!</span><h1>Who made<br/>that sound?</h1><p className="story">Start with two sounds you may know. Then unlock a mystery sound from the ocean.</p><button className="primary big" onClick={start}><Play fill="currentColor"/> Start!</button><span className="small">3 quick sounds · Easy first, then a surprise</span></div></section>:
  screen==='done'?<section className="console done"><span className="medal">🌊</span><span className="eyebrow">MISSION COMPLETE</span><h1>Great listening!</h1><p>You discovered {ROUND_COUNT} animal sounds.</p><p className="score">★ {score} / {ROUND_COUNT}</p><button className="primary big" onClick={start}><RotateCcw/> Play again!</button></section>:
  <><div className="journey"><span>Sound {index+1} of {ROUND_COUNT}</span><div className="steps">{Array.from({length:ROUND_COUNT},(_,i)=><span key={i} className={i<index?'visited':i===index?'current':''}>{i<index?<Check size={18}/>:i+1}</span>)}</div><span className="stars">★ {score}</span></div>
  <section className="console game"><div className="control-panel" style={{width:'100%',maxWidth:760,margin:'0 auto'}}>
   {!ready?<div className="loading" role="status"><Headphones size={36}/><h2>Getting your mystery sounds…</h2><Progress value={(loaded/animals.length)*100}/><p>{loaded} of {animals.length} sounds ready</p>{error&&<><p>{error}</p><button className="primary big" onClick={load}>Try again</button></>}</div>:<>
    <div style={{textAlign:'center'}}><span className="eyebrow">{index<2?`WARM-UP SOUND ${index+1}`:'OCEAN MYSTERY'}</span><h1>👂 Listen!</h1><h2>{index<2?'Which animal made this sound?':'New sound! Take a guess — who made it?'}</h2></div>
    <button className={'primary big audio-button '+(playing?'is-playing':'')} onClick={()=>playing?stop():play()}>{playing?<Square fill="currentColor"/>:<Volume2/>}{playing?'Stop':'▶ Hear the sound'}</button>
    {error&&<p className="error" role="alert">{error}</p>}
    {!heard&&!playing&&<p className="play-status">Tap the big sound button first.</p>}
    {heard&&<><p className="play-status">{index<2?'You know this one! Tap an animal.':'No wrong feeling here — take your best guess!'}</p><div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12}}>{plan.choices.map((a:any)=><button key={a.id} onClick={()=>choose(a.id)} disabled={!!answer} style={{padding:10,borderRadius:20,border:answer===a.id?'4px solid currentColor':'2px solid #d8e8ef',background:'white',fontSize:'1rem',fontWeight:800,cursor:'pointer',minWidth:0}}>{a.emoji?<span aria-hidden="true" style={{display:'grid',placeItems:'center',width:'100%',aspectRatio:'1/1',borderRadius:14,background:'#f3fbff',fontSize:'clamp(3.5rem,15vw,7rem)'}}>{a.emoji}</span>:<img src={'./animals/'+a.id+'.webp'} alt={a.name} style={{width:'100%',aspectRatio:'1/1',objectFit:'cover',borderRadius:14}}/>}<span style={{display:'block',marginTop:8}}>{a.name}</span></button>)}</div><button className="mix-button big" onClick={play} disabled={playing}><Volume2/> Hear it again</button></>}
    {answer&&<div className="feedback" role="status"><div className="feedback-title"><span>{answer===plan.target?'🌟':'✨'}</span><h2>{answer===plan.target?'You found it!':`Let’s find out — it was the ${target?.name}!`}</h2></div><p className="fact">{target?.fact}</p><button className="primary big" onClick={next}>{index===ROUND_COUNT-1?'Finish!':'Next sound →'}</button></div>}
   </>}
  </div></section></>}
  <footer><a href="./credits.html">For grown-ups · Sounds & photo credits</a><span>Made for curious ears.</span></footer>
 </main>;
}
