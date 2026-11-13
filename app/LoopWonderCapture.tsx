import React,{useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createWonderCaptureClient} from '../lib/loop/wonder-capture-client.mjs';
export type WonderScope={view_context:string;child_id:string;profile_version:number;nickname:string};
type Saved={request_id:string;source_scope_version:number;question:string;parent_context:string|null};
type Pending={command_id:string;request_id:string;source_scope_version:number;child_id:string};
type Command={view_context:string;child_id:string;profile_version:number;command_id:string;operation:'create'|'correct';question:string;parent_context:string;request_id?:string;expected_source_scope_version?:number};
type Phase='unsent'|'editing'|'confirming'|'saving'|'awaiting_confirmation'|'saved-only'|'conflict'|'denied';
const accessWarning='Capture access could not be confirmed. Your unsent or uncertain page intent is retained. Retry access before continuing.';
const api=createWonderCaptureClient();
export default function LoopWonderCapture({scope,visible,fence,onAcknowledged,onDenied,onUncertain}:{scope:WonderScope|null;visible:boolean;fence:number;onAcknowledged:()=>Promise<void>;onDenied:()=>void;onUncertain:()=>void}){
 const [phase,setPhase]=useState<Phase>('unsent'),[question,setQuestion]=useState(''),[context,setContext]=useState(''),[opened,setOpened]=useState(false);
 const [saved,setSaved]=useState<Saved[]>([]),[pending,setPending]=useState<Pending[]>([]),[target,setTarget]=useState<Saved|null>(null),[message,setMessage]=useState(''),[ready,setReady]=useState(false),[closed,setClosed]=useState(false),[online,setOnline]=useState(true),[busy,setBusy]=useState(false);
 const mounted=useRef(false),generation=useRef(0),statusSequence=useRef(0),inFlight=useRef(false),intent=useRef<Command|null>(null),current=useRef(scope),shown=useRef(visible),heading=useRef<HTMLHeadingElement>(null),review=useRef<HTMLButtonElement>(null);
 const identity=scope?JSON.stringify([fence,scope.view_context,scope.child_id,scope.profile_version]):JSON.stringify([fence,null]);
 const activeIdentity=useRef(identity);
 current.current=scope;shown.current=visible;
 useLayoutEffect(()=>{
  activeIdentity.current=identity;++generation.current;++statusSequence.current;intent.current=null;inFlight.current=false;
  setQuestion('');setContext('');setTarget(null);setSaved([]);setPending([]);setMessage('');setPhase('unsent');setOpened(false);setReady(false);setBusy(false);setClosed(false);
 },[identity]);
 const selection=useCallback((s:WonderScope)=>({view_context:s.view_context,child_id:s.child_id,profile_version:s.profile_version}),[]);
 const refresh=useCallback(async()=>{
  const s=current.current;if(!s||!shown.current)return;const guard=generation.current,id=++statusSequence.current;
  try{const result=await api.status(selection(s));if(!mounted.current||guard!==generation.current||id!==statusSequence.current||!shown.current)return;
   setSaved(result.saved);setPending(result.pending);setClosed(result.writes_closed);setReady(true);setMessage(previous=>previous===accessWarning?'':previous);
  }catch(error){if(!mounted.current||guard!==generation.current||id!==statusSequence.current)return;setReady(false);setSaved([]);setPending([]);
   if((error as {status?:number}).status===403){intent.current=null;setQuestion('');setContext('');setOpened(false);setPhase('denied');onDenied();}
   else setMessage(accessWarning);
  }
 },[onDenied,selection]);
 useEffect(()=>{mounted.current=true;const connectivity=()=>setOnline(navigator.onLine);connectivity();window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);return()=>{mounted.current=false;++generation.current;window.removeEventListener('online',connectivity);window.removeEventListener('offline',connectivity);};},[]);
 useEffect(()=>{if(visible)void refresh();},[visible,identity,refresh]);
 useEffect(()=>{const check=()=>{if(document.visibilityState!=='hidden')void refresh();};const timer=setInterval(check,15000);window.addEventListener('focus',check);return()=>{clearInterval(timer);window.removeEventListener('focus',check);};},[refresh]);
 useEffect(()=>{if(phase==='confirming')heading.current?.focus();},[phase]);
 async function perform(command:Command|null,pendingCommand?:Pending){
  const s=current.current;if(!s||!shown.current||!ready||inFlight.current||!online)return;
  const guard=generation.current;inFlight.current=true;setBusy(true);setPhase('saving');setMessage('Checking confirmation…');onUncertain();
  try{
   const result=command?await api.save(command):await api.reconcile({...selection(s),command_id:pendingCommand!.command_id});
   if(!mounted.current||guard!==generation.current)return;
   if(result.state==='retryable_unacknowledged'){setPhase('awaiting_confirmation');setClosed(true);setMessage('Confirmation pending. This wonder is not confirmed saved. Keep this page open; retry this same command or reconcile its pending reference.');await refresh();return;}
   intent.current=null;setQuestion('');setContext('');setTarget(null);setPhase('saved-only');setMessage('Wonder saved. No investigation has been requested. There is no production deadline.');
   await refresh();if(mounted.current&&guard===generation.current)await onAcknowledged();
  }catch(error){if(!mounted.current||guard!==generation.current)return;const status=(error as {status?:number}).status;
   if(status===403){intent.current=null;setQuestion('');setContext('');setSaved([]);setPending([]);setPhase('denied');setMessage('Access changed. Select a child again after checking access.');onDenied();}
   else if(status===429){setPhase('conflict');setMessage('Save was not accepted. A local test limit was reached. Check pending commands, then discard this page intent to keep editing.');await refresh();if(mounted.current&&guard===generation.current)await onAcknowledged();}
   else if(status===409){setPhase('conflict');setMessage('This command conflicts with current source history. Check the pending list before explicitly discarding this page intent.');await refresh();}
   else{setPhase('awaiting_confirmation');setMessage('Not confirmed saved. The response may have been lost. Keep this page open and retry the original command; do not start another save.');}
  }finally{if(mounted.current&&guard===generation.current){inFlight.current=false;setBusy(false);}}
 }
 function beginCorrection(item:Saved){if(intent.current||busy)return;setTarget(item);setQuestion(item.question);setContext(item.parent_context??'');setOpened(true);setPhase('editing');setMessage('Correction creates a new source version; earlier words remain in history.');}
 function confirm(){if(!ready||!online||closed||!scope||!question.trim()||question.length>4000||context.length>2000||intent.current||busy)return;setPhase('confirming');setMessage('');}
 function save(){if(!scope||!ready||!online||closed||phase!=='confirming'||intent.current||busy)return;const c:Command={...selection(scope),command_id:crypto.randomUUID(),operation:target?'correct':'create',question,parent_context:context,...(target?{request_id:target.request_id,expected_source_scope_version:target.source_scope_version}:{})};intent.current=c;void perform(c);}
 function discard(){if(busy||pending.length)return;intent.current=null;setQuestion('');setContext('');setTarget(null);setPhase('unsent');setOpened(false);setMessage('Page intent discarded. This does not cancel a server command.');}
 // Unmounted private DOM is never retained behind a CSS-only hiding rule.
 if(!visible||!scope||activeIdentity.current!==identity)return null;
 const uncertain=phase==='saving'||phase==='awaiting_confirmation'||phase==='conflict'||Boolean(intent.current);
 return <section className="wonder-capture" aria-labelledby="wonder-title">
  <h3 id="wonder-title">Capture a wonder</h3><p>Keep {scope.nickname}’s own words. Saving does not request an investigation.</p>
  {!online&&<p role="alert">Offline. Nothing is confirmed saved by this page. Keep the page open.</p>}
  {message&&<p role={phase==='conflict'||phase==='denied'?'alert':'status'}>{message}</p>}
  {!ready&&<><p role="status">Checking current capture access. Saved sources are hidden until confirmed. You can keep an unsent draft here.</p><button type="button" disabled={busy||!online} onClick={()=>void refresh()}>Retry capture access</button></>}
   <button type="button" disabled={busy||uncertain} onClick={()=>{setOpened(true);setPhase('editing');setTarget(null);setQuestion('');setContext('');setMessage('');}}>Start a wonder</button>
   {closed&&<p role="status">New saves are paused while a pending command or journal problem needs confirmation.</p>}
   {opened&&(ready||!target)&&phase!=='confirming'&&<div>
    <label htmlFor="family-wonder">What did your child ask?</label><textarea id="family-wonder" maxLength={4000} value={question} disabled={busy||uncertain} onChange={e=>{setQuestion(e.target.value);setPhase('editing');}}/>
    <label htmlFor="family-wonder-context">Parent context (optional; separate from the child’s words)</label><textarea id="family-wonder-context" maxLength={2000} value={context} disabled={busy||uncertain} onChange={e=>setContext(e.target.value)}/>
    {!uncertain&&<p role="status">Unsent draft on this page only. This has not been saved or requested.</p>}
    <button type="button" ref={review} disabled={!ready||!online||busy||uncertain||closed||!question.trim()} onClick={confirm}>Review saved-only wonder</button>
   </div>}
   {ready&&phase==='confirming'&&<div className="wonder-confirm" role="region" aria-labelledby="wonder-confirm-title">
    <h4 id="wonder-confirm-title" tabIndex={-1} ref={heading}>Confirm for {scope.nickname}</h4>
    <h5>Child’s exact words</h5><p className="family-question">{question}</p><h5>Parent context</h5><p className="family-question">{context||'No parent context supplied.'}</p>
    <p>{target?'Append a correction to this saved-only wonder.':'Save this wonder only.'} No investigation is requested and no 24-hour production deadline starts.</p>
    <button type="button" disabled={!ready||closed||busy||!online} onClick={save}>Confirm saved-only wonder</button><button type="button" disabled={busy} onClick={()=>{setPhase('editing');queueMicrotask(()=>review.current?.focus());}}>Back to exact words</button>
   </div>}
   {uncertain&&intent.current&&phase!=='conflict'&&<button type="button" disabled={busy||!online} onClick={()=>void perform(intent.current)}>Retry original save</button>}
   {phase==='conflict'&&!pending.length&&<button type="button" disabled={busy} onClick={discard}>Discard page intent after checking pending commands</button>}
  {ready&&<>
   {pending.length>0&&<div><h4>Pending confirmations</h4><p>These references do not mean Saved. Reconcile each existing command.</p>{pending.map((p,i)=><div className="family-card" key={p.command_id}><p>Pending capture {i+1} · source version {p.source_scope_version}</p><button type="button" disabled={busy||!online} onClick={()=>void perform(null,p)}>Reconcile pending capture {i+1}</button></div>)}</div>}
   <div><h4>Correct a saved-only source</h4>{uncertain?<p>Saved sources are hidden while this update awaits confirmation.</p>:saved.length?saved.map((item,i)=><div className="family-card" key={item.request_id}><p className="family-question">{item.question}</p><p>Source version {item.source_scope_version}</p><button type="button" disabled={busy||uncertain||closed} onClick={()=>beginCorrection(item)}>Correct saved wonder {i+1}</button></div>):<p>No capture-owned confirmed sources available for correction.</p>}</div>
  </>}
 </section>;
}
