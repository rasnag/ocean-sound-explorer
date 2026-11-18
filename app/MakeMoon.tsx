import {useEffect,useRef,useState} from 'react';
import './moon.css';

type PhaseKey='new'|'crescent'|'half'|'gibbous'|'full';
type Round={label:string;title:string;instruction:string;button:string;target:PhaseKey|null};

const rounds:Round[]=[
 {label:'First, explore',title:'Move the Moon!',instruction:'Drag it around Earth. Watch what you see.',button:"I'm ready!",target:null},
 {label:'Challenge 1',title:'Make a thin moon',instruction:'Move the Moon until it looks like a banana.',button:'Next challenge',target:'crescent'},
 {label:'Challenge 2',title:'Make a full moon',instruction:'Move the Moon until you see a bright circle.',button:'Unlock my mission',target:'full'}
];

function classify(angle:number):{key:PhaseKey;label:string}{
 const a=((angle%(Math.PI*2))+Math.PI*2)%(Math.PI*2),light=(1+Math.cos(a))/2;
 if(light>.91)return{key:'full',label:'Full moon'};
 if(light<.08)return{key:'new',label:'New moon'};
 if(light<.36)return{key:'crescent',label:'Thin moon'};
 if(light<.64)return{key:'half',label:'Half moon'};
 return{key:'gibbous',label:'Almost full'};
}

function paintPhase(canvas:HTMLCanvasElement,angle:number){
 const context=canvas.getContext('2d');if(!context)return;
 const size=canvas.width,r=size*.42,cx=size/2,cy=size/2,light=(1+Math.cos(angle))/2,waxing=Math.sin(angle)<0;
 context.clearRect(0,0,size,size);context.save();context.beginPath();context.arc(cx,cy,r,0,Math.PI*2);context.clip();context.fillStyle='#27334b';context.fillRect(0,0,size,size);
 if(light>.015){
  context.fillStyle='#f2f2e9';context.beginPath();
  if(light<=.5){const edge=r*(1-4*light),litRight=waxing;context.arc(cx,cy,r,-Math.PI/2,Math.PI/2,!litRight);context.ellipse(cx,cy,Math.abs(edge),r,0,Math.PI/2,-Math.PI/2,edge<0?!litRight:litRight);}
  else{const shadow=r*(4*light-3),litRight=waxing;context.arc(cx,cy,r,-Math.PI/2,Math.PI/2,!litRight);context.ellipse(cx,cy,Math.abs(shadow),r,0,Math.PI/2,-Math.PI/2,shadow<0?litRight:!litRight);}
  context.closePath();context.fill();
 }
 context.restore();context.beginPath();context.arc(cx,cy,r,0,Math.PI*2);context.strokeStyle='rgba(255,255,255,.25)';context.lineWidth=2;context.stroke();
}

export default function MakeMoon(){
 const [round,setRound]=useState(0),[angle,setAngle]=useState(0),[dragged,setDragged]=useState(false),[mission,setMission]=useState(false);
 const [solved,setSolved]=useState(true),[sparks,setSparks]=useState(0);
 const space=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),dragging=useRef(false);
 const phase=classify(angle),data=rounds[round];
 const radius=29.5,moonX=50+Math.cos(angle)*radius,moonY=50+Math.sin(angle)*radius;

 useEffect(()=>{if(canvas.current)paintPhase(canvas.current,angle);},[angle]);
 useEffect(()=>{if(!data.target){setSolved(true);return;}const hit=phase.key===data.target;if(hit&&!solved){setSparks(n=>n+1);navigator.vibrate?.(45);}setSolved(hit);},[phase.key,data.target]);

 function move(clientX:number,clientY:number){const rect=space.current?.getBoundingClientRect();if(!rect)return;setAngle(Math.atan2(clientY-rect.top-rect.height/2,clientX-rect.left-rect.width/2));setDragged(true);}
 function advance(){if(round<rounds.length-1){setRound(round+1);setSolved(false);}else setMission(true);}
 function reset(){setRound(0);setAngle(0);setSolved(true);setDragged(false);setMission(false);}

 return <main className="moon-app">
  <div className="moon-brand"><a href="/">Curiosity Loop</a><span className="moon-progress" aria-label="Game progress">{rounds.map((_,i)=><i key={i} className={i<round?'done':i===round?'current':''}/>)}</span></div>
  {mission?<section className="moon-mission"><div className="mission-icon" aria-hidden="true">🌙</div><p className="moon-eyebrow">Your real-world mission</p><h1>Find the Moon</h1><p>Look outside tonight. Is the Moon thin, half, or full?</p><button className="moon-restart" onClick={reset}>Play again ↻</button></section>:<section className="moon-game">
   <header className="moon-prompt"><p className="moon-eyebrow">{data.label}</p><h1>{data.title}</h1><p>{data.instruction}</p></header>
   <div className="moon-space" ref={space} onPointerMove={e=>{if(dragging.current)move(e.clientX,e.clientY)}} onPointerUp={()=>dragging.current=false} onPointerCancel={()=>dragging.current=false}>
    <div className="moon-sun" aria-label="Sun"/><div className="light-ray"/><div className="moon-orbit" aria-hidden="true"/>
    <div className="earth-wrap"><div className="earth" aria-label="Earth">🌍</div><span>YOU ARE HERE</span></div>
    <button className={`moon-handle ${dragged?'dragged':''}`} style={{left:`${moonX}%`,top:`${moonY}%`}} aria-label="Drag the moon around Earth" onPointerDown={e=>{dragging.current=true;e.currentTarget.setPointerCapture(e.pointerId);move(e.clientX,e.clientY)}} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();setAngle(a=>a+(['ArrowLeft','ArrowUp'].includes(e.key)?-.16:.16));setDragged(true)}}>
      <span style={{background:`linear-gradient(${Math.atan2(-Math.sin(angle),-Math.cos(angle))*180/Math.PI+90}deg,#edf1f4 0 49%,#39445b 51% 100%)`}}/>
    </button>
    {solved&&data.target&&Array.from({length:12},(_,i)=><b className="moon-spark" key={`${sparks}-${i}`} style={{'--x':`${((i%4)-1.5)*42}px`,'--y':`${(Math.floor(i/4)-1)*55}px`} as React.CSSProperties}>{i%2?'✦':'★'}</b>)}
   </div>
   <div className="phase-card" aria-live="polite"><canvas ref={canvas} width="112" height="112" aria-label="Moon shape seen from Earth"/><div><small>What you see from Earth</small><strong>{phase.label}</strong></div><span className={solved&&data.target?'show':''}>You found it!</span></div>
   <button className="moon-primary" disabled={!solved} onClick={advance}>{data.button}</button>
  </section>}
 </main>;
}
