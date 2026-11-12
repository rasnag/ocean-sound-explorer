import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createFamilySpaceClient} from '../lib/loop/family-space-client.mjs';
import './loop-family-home.css';
type Child={child_id:string;profile_version:number;nickname:string;is_initial:boolean};
type Source={request_id:string;source_scope_version:number;question:string};
type Assignment=Source&{assignment_id:string;revision_id:string};
type Play=Omit<Assignment,'request_id'>&{play_id:string;status:string;last_action_sequence?:number;trial_count?:number};
type Request=Source&{received_at:string;due_at:string;state:string;overdue:boolean};
type Allowance={period_id:string;allocation_scope:string;trial_start:string;trial_end:string;allowance:number;pending:number;reserved:number;consumed:number;released:number;remaining:number;state:string};
type Index={state:string;view_context?:string;children?:Child[]};
type Home=Index&{selected_child:Child;saved_wonders:Source[];requests:Request[];ready:Assignment[];plays:Play[];previous:Assignment[];allowances:Allowance[]};
type Entry=Index&{selected_child:Child;assignment:Assignment;adventure:{revision_id:string;opening:string;limits:string};receipt?:{play_id:string;checkpoint:{state:{sequence:number;revision_id:string;trials:Array<{prediction:string;configuration:string;outcome:string}>}}}};
const api=createFamilySpaceClient();
const date=(value:string)=>new Date(value).toLocaleString();
export default function LoopFamilyHome(){
 const [index,setIndex]=useState<Index|null>(null),[home,setHome]=useState<Home|null>(null),[entry,setEntry]=useState<Entry|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[capturing,setCapturing]=useState(false),[draft,setDraft]=useState(''),[notice,setNotice]=useState('');
 const live=useRef(false),generation=useRef(0),authSequence=useRef(0),readSequence=useRef(0),openSequence=useRef(0);
 const authority=useRef<Index|null>(null),selected=useRef<Child|null>(null),chosen=useRef<Home|null>(null);
 const clearIntent=useCallback(()=>{setDraft('');setCapturing(false);setEntry(null);setNotice('');},[]);
 const clearSelection=useCallback(()=>{++generation.current;selected.current=null;chosen.current=null;setHome(null);setBusy(false);clearIntent();},[clearIntent]);
 const read=useCallback(async(next:Index,child:Child)=>{
  const guard=generation.current,id=++readSequence.current;
  try {const result:Home=await api.read({view_context:next.view_context,child_id:child.child_id});
   if(!live.current||guard!==generation.current||id!==readSequence.current||selected.current?.child_id!==child.child_id)return;
   if(result.state!=='child_space'||result.view_context!==next.view_context||result.selected_child?.child_id!==child.child_id||result.selected_child.profile_version!==child.profile_version)throw Error('Changed scope');
   chosen.current=result;setHome(result);setError('');
   setEntry(previous=>{if(!previous)return null;const assignment=result.ready.find(a=>a.assignment_id===previous.assignment.assignment_id&&a.revision_id===previous.assignment.revision_id);if(!assignment)return null;
    if(previous.receipt){const play=result.plays.find(p=>p.play_id===previous.receipt?.play_id);if(play?.status!=='confirmed'||play.last_action_sequence!==previous.receipt.checkpoint.state.sequence)return null;}return previous;});
  }catch(failure){if(live.current&&guard===generation.current&&id===readSequence.current){chosen.current=null;setHome(null);setEntry(null);setError('Family details could not be confirmed. Retry to check access.');if((failure as {status?:number}).status===403){authority.current=null;setIndex(null);clearSelection();}}}
  finally{if(live.current&&guard===generation.current&&id===readSequence.current)setBusy(false);}
 },[clearSelection]);
 const refresh=useCallback(async()=>{
  ++openSequence.current;
  const id=++authSequence.current,guard=generation.current;
  try {const next:Index=await api.index();if(!live.current||id!==authSequence.current||guard!==generation.current)return;
   const prior=authority.current;const child=selected.current;
   if(next.state!=='select_child'||!next.view_context||!Array.isArray(next.children)){clearSelection();authority.current=next;setIndex(next);setError('');setBusy(false);return;}
   if(prior?.view_context&&prior.view_context!==next.view_context){clearSelection();authority.current=next;setIndex(next);setBusy(false);setError('');return;}
   const current=child&&next.children.find(c=>c.child_id===child.child_id&&c.profile_version===child.profile_version);
   if(child&&!current)clearSelection();authority.current=next;setIndex(next);setError('');
   if(current)await read(next,current);else setBusy(false);
  }catch(failure){if(live.current&&id===authSequence.current&&guard===generation.current){if((failure as {status?:number}).status===403){clearSelection();authority.current=null;}else ++generation.current;chosen.current=null;setHome(null);setEntry(null);setIndex(null);setBusy(false);setError('Family access could not be confirmed. Retry or sign in again.');}}
 },[clearSelection,read]);
 useEffect(()=>{live.current=true;void refresh();const check=()=>{if(document.visibilityState!=='hidden')void refresh();};const timer=setInterval(check,15000);window.addEventListener('focus',check);window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',check);
  return()=>{live.current=false;++generation.current;++authSequence.current;++readSequence.current;++openSequence.current;authority.current=null;selected.current=null;chosen.current=null;clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);document.removeEventListener('visibilitychange',check);};
 },[refresh]);
 function choose(position:string){const next=authority.current;const child=next?.children?.[Number(position)];clearSelection();setError('');if(position===''||!next||!child){setBusy(false);return;}selected.current=child;setBusy(true);void read(next,child);}
 async function open(item:Assignment|Play,kind:'assignment'|'play'){
  const selectedHome=chosen.current;if(!selectedHome)return;const guard=generation.current,id=++openSequence.current;setBusy(true);setEntry(null);setError('');setNotice('');
  try {const result:Entry=await api.open({view_context:selectedHome.view_context,child_id:selectedHome.selected_child.child_id,entry_kind:kind,assignment_id:item.assignment_id,revision_id:item.revision_id,...(kind==='play'?{play_id:(item as Play).play_id}:{})});
   if(!live.current||guard!==generation.current||id!==openSequence.current)return;
   if(result.state==='confirmation_pending'){setNotice('Your saved progress is awaiting confirmation. Retry opening it when ready.');return;}
   if(!['introduction','resume'].includes(result.state)||result.view_context!==selectedHome.view_context||result.selected_child?.child_id!==selectedHome.selected_child.child_id||result.assignment?.assignment_id!==item.assignment_id||result.adventure?.revision_id!==item.revision_id||kind==='play'&&result.receipt?.play_id!==(item as Play).play_id)throw Error('Changed investigation');
   setEntry(result);
  }catch{if(live.current&&guard===generation.current&&id===openSequence.current){chosen.current=null;setHome(null);setEntry(null);setError('That investigation could not be confirmed. Retry checking access.');}}
  finally{if(live.current&&guard===generation.current&&id===openSequence.current)setBusy(false);}
 }
 const childPosition=index?.children?.findIndex(c=>c.child_id===selected.current?.child_id)??-1;
 return <main className="loop-family" aria-labelledby="family-title">
  <p className="family-label">Local synthetic preview · invented families only</p><h1 id="family-title">Your curiosity space</h1>
  <nav aria-label="Family help"><a href="/loop-preview/setup">Child setup and test permissions</a><a href="/loop-preview/join">Sign in or recover access</a><a href="/loop-preview">Preview home</a></nav>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!index&&!error&&<p role="status">Checking family access…</p>}
  {error&&<button type="button" onClick={()=>{setError('');void refresh();}}>Retry access</button>}
  {index?.state==='permission_required'&&<section><h2>Test permission needed</h2><p>Review test permissions before opening invented child information.</p><a href="/loop-preview/setup">Review test permissions</a></section>}
  {index?.state==='setup_required'&&<section><h2>Set up an invented child</h2><a href="/loop-preview/setup">Open child setup</a></section>}
  {index?.state==='setup_unavailable'&&<section><h2>Setup needs attention</h2><p>Earlier child details cannot be reattached automatically. Get help through test settings.</p><a href="/loop-preview/setup">Open test settings</a></section>}
  {index?.state==='select_child'&&<section aria-label="Choose a child"><label htmlFor="family-child">Whose curiosity?</label><select id="family-child" value={childPosition<0?'':String(childPosition)} onChange={e=>choose(e.target.value)}><option value="">Choose a child</option>{index.children?.map((c,i)=><option key={c.child_id} value={i}>{c.nickname}</option>)}</select></section>}
  {busy&&<p role="status">Checking the selected investigation…</p>}
  {home&&<article aria-label="Selected child space"><h2>{home.selected_child.nickname}’s wonders</h2><p>Explore together. These are ideas and tries, never scores.</p>
   <section><h3>Capture a wonder</h3><p>Keep the child’s own words.</p><button type="button" onClick={()=>setCapturing(true)}>Start a wonder</button>{capturing&&<div><label htmlFor="family-wonder">What did your child ask?</label><textarea id="family-wonder" maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)}/><p role="status">Unsent draft on this page only. This has not been saved or requested.</p></div>}</section>
   <section><h3>Saved wonders</h3><p>Saved questions have no production deadline.</p>{home.saved_wonders.length?home.saved_wonders.map(w=><p className="family-question" key={w.request_id}>{w.question}</p>):<p>No saved questions yet. Start with a wonder above.</p>}</section>
   <section><h3>Investigation requests</h3><p>Viewing a request does not change or cancel it.</p>{home.requests.length?home.requests.map(r=><div className="family-card" key={r.request_id}><p className="family-question">{r.question}</p><p>{({received:'Received',accepted:'Accepted',ready:'Ready',closed:'Closed'} as Record<string,string>)[r.state]??'Needs attention'}{r.overdue?' · Overdue':''}</p><p>Received {date(r.received_at)}. Original due time: {date(r.due_at)}.</p></div>):<p>No investigations requested. A draft does not start a request.</p>}</section>
   <section><h3>Ready investigations</h3>{home.ready.length?home.ready.map(a=><div className="family-card" key={a.assignment_id}><p className="family-question">{a.question}</p><button type="button" onClick={()=>void open(a,'assignment')}>Open investigation introduction</button></div>):<p>Nothing ready yet.</p>}</section>
   <section><h3>Saved plays</h3>{home.plays.length?home.plays.map(p=><div className="family-card" key={p.play_id}><p className="family-question">{p.question}</p><p>{p.status==='confirmed'?`${p.trial_count} confirmed ${p.trial_count===1?'try':'tries'}`:'Progress awaiting confirmation'}</p><button type="button" onClick={()=>void open(p,'play')}>Open saved investigation</button></div>):<p>No saved plays yet.</p>}</section>
   <section><h3>Previously tried</h3>{home.previous.length?home.previous.map(a=><p key={a.assignment_id} className="family-question">{a.question}</p>):<p>Investigations appear here after a confirmed try. This does not mean completed.</p>}</section>
   <section><h3>Trial and allowance</h3>{home.allowances.length?home.allowances.map(a=><div key={a.period_id} className="family-card"><p>{a.state==='expired'?'Trial ended':'Trial active'} · {a.allocation_scope==='household'?'Shared family allowance':'This child’s allowance'}</p><p>{date(a.trial_start)} to {date(a.trial_end)}</p>{a.remaining===0&&<p>No allowance remaining in this period. Existing requests and permitted investigations stay listed. New production eligibility needs a separate current check.</p>}<p>{a.remaining} available · {a.pending} pending · {a.reserved} reserved · {a.consumed} used · {a.released} released</p>{a.state==='expired'&&<p>Previously submitted requests keep their submission-time eligibility. Existing permitted investigations and saved progress remain available. New requests need a separate current eligibility check.</p>}</div>):<p>Trial not activated. Opening this page does not start one.</p>}</section>
  </article>}
  {home&&entry&&<section className="family-entry" aria-label="Opened investigation"><h2>{entry.receipt?'Saved investigation':'Investigation introduction'}</h2><p className="family-question">{entry.assignment.question}</p><p>{entry.adventure.opening}</p><p>{entry.adventure.limits}</p><p>Grown-up: read together and ask what your child thinks will happen.</p>{entry.receipt&&<><h3>Confirmed tries</h3>{entry.receipt.checkpoint.state.trials.length?entry.receipt.checkpoint.state.trials.map((t,i)=><p key={i}>Try {i+1}: predicted {t.prediction}, placed {t.configuration}, result {t.outcome}.</p>):<p>No confirmed tests in this play yet.</p>}</>}<p>This local view opens the exact introduction or confirmed saved record. It does not start a new play.</p><button type="button" onClick={()=>setEntry(null)}>Close investigation view</button></section>}
 </main>;
}
