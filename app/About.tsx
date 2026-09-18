import {useEffect} from 'react';
import {ArrowRight,Eye,Sparkles} from 'lucide-react';
import './about.css';

const loop=['Notice','Wonder','Explore','Notice more'];

export default function About(){
 useEffect(()=>{document.title='Curiosity Loop — Experiments in childhood curiosity';},[]);
 return <main className="about-site">
  <nav className="about-nav" aria-label="Main navigation">
   <a className="about-wordmark" href="/" aria-label="Curiosity Loop home"><span>✦</span> Curiosity Loop</a>
   <a href="#experiments">Experiments</a>
  </nav>

  <section className="about-hero">
   <div className="about-kicker"><Sparkles size={16}/> Experiments in childhood curiosity</div>
   <h1>Can technology make kids more curious about the <em>real world?</em></h1>
   <p>We’re building small experiments that begin on a screen—and end with a child noticing, wondering, listening, or looking more closely at the world around them.</p>
   <a className="about-cta" href="#experiments">Try an experiment <ArrowRight aria-hidden="true"/></a>
   <div className="about-orbit" aria-hidden="true"><span>🌍</span><i>🌙</i></div>
  </section>

  <section className="about-thesis" aria-labelledby="about-heading">
   <p className="about-section-label">About</p>
   <div>
    <h2 id="about-heading">Kids are already curious.</h2>
    <p>Technology is incredibly good at capturing their attention. Curiosity Loop asks whether it can do something different: <strong>spark curiosity that continues beyond the screen.</strong></p>
    <p>We build something small, put it in front of kids, watch what actually sparks curiosity, and use what we learn to build the next experiment.</p>
    <p className="about-not">The goal isn’t more screen time.<br/><strong>It’s more “Wait… what is that?” moments.</strong></p>
   </div>
  </section>

  <section className="loop-section" aria-labelledby="loop-heading">
   <div className="loop-intro"><p className="about-section-label">The curiosity loop</p><h2 id="loop-heading">The screen is the spark.<br/>Curiosity is the product.</h2></div>
   <ol className="loop-steps">{loop.map((step,index)=><li key={step}><span>0{index+1}</span><strong>{step}</strong>{index<loop.length-1&&<ArrowRight aria-hidden="true"/>}</li>)}</ol>
  </section>

  <section className="experiments" id="experiments" aria-labelledby="experiments-heading">
   <div className="experiments-heading"><div><p className="about-section-label">Try it</p><h2 id="experiments-heading">Current experiments</h2></div><p>Made for curious kids and the grown-ups exploring with them.</p></div>
   <div className="experiment-grid">
    <article className="experiment-card ocean-card">
     <div className="experiment-image"><img src="/animals/dolphin.webp" alt="A dolphin leaping from the ocean"/><span>Experiment 01</span></div>
     <div className="experiment-copy"><p>Listen · Guess · Discover</p><h3>Ocean Sound Explorer</h3><div className="experiment-question"><Eye size={18}/><span>Can animal sounds make a child want to know more about the animals behind them?</span></div><a href="/ocean-sound-explorer">Start listening <ArrowRight aria-hidden="true"/></a></div>
    </article>
    <article className="experiment-card moon-card">
     <div className="experiment-image"><div className="moon-art" aria-hidden="true"><span>☀️</span><i>🌍</i><b>🌙</b></div><span>Experiment 02</span></div>
     <div className="experiment-copy"><p>Move · Observe · Look up</p><h3>Make the Moon</h3><div className="experiment-question"><Eye size={18}/><span>Can a tiny simulation inspire a child to look for the real Moon later?</span></div><a href="/make-the-moon">Move the Moon <ArrowRight aria-hidden="true"/></a></div>
    </article>
   </div>
  </section>

  <footer className="about-footer"><a className="about-wordmark" href="/"><span>✦</span> Curiosity Loop</a><p>Small experiments. Real-world wonder.</p></footer>
 </main>;
}
