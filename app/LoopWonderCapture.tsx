import React,{useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createWonderCaptureClient} from '../lib/loop/wonder-capture-client.mjs';
import {createProductionClient} from '../lib/loop/production-client.mjs';
export type WonderScope={view_context:string;child_id:string;profile_version:number;nickname:string};
type Saved={request_id:string;source_scope_version:number;question:string;parent_context:string|null};
type Pending={command_id:string;request_id:string;source_scope_version:number;child_id:string};
type Command={view_context:string;child_id:string;profile_version:number;command_id:string;operation:'create'|'correct';question:string;parent_context:string;request_id?:string;expected_source_scope_version?:number};
type ProductionCommand={contract_version:'1.1.0';record_type:'submit';command:'SubmitProduction';idempotency_key:string;child_id:string;wonder_id:string;wonder_version:number;consent_epoch:number;offer_version:string;scope_version:number};
type ProductionPending={idempotency_key:string;wonder_id:string;wonder_version:number};
type Eligibility={status:string;offer_version?:string;consent_epoch?:number;scope_version?:number};
type Phase='unsent'|'editing'|'confirming'|'saving'|'awaiting_confirmation'|'saved-only'|'conflict'|'denied';
const accessWarning='Capture access could not be confirmed. Your unsent or uncertain page intent is retained. Retry access before continuing.';
const api=createWonderCaptureClient(),production=createProductionClient();
const selection=(s:WonderScope)=>({view_context:s.view_context,child_id:s.child_id,profile_version:s.profile_version});
const localTime=(s:string)=>new Date(s).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
const explanation:Record<string,string>={no_capacity:'No production place is available. No investigation was requested.',quota_full:'No allowance is available for this request. No investigation was requested.',ineligible:'This saved wonder is not currently eligible for production. No investigation was requested.',configuration_missing:'Production is unavailable while test configuration or confirmation needs attention. No new investigation was requested.'};
/** Kept in this source file so the family route introduces no new child import. */
function ProductionRequest({scope,visible,fence,saved,captureBusy,onStart,onAcknowledged,onDenied,onLock}:{scope:WonderScope|null;visible:boolean;fence:number;saved:Saved[];captureBusy:boolean;onStart:()=>void;onAcknowledged:()=>Promise<void>;onDenied:()=>void;onLock:(locked:boolean)=>void}){
 const [target,setTarget]=useState<Saved|null>(null),[eligible,setEligible]=useState<Eligibility|null>(null),[pending,setPending]=useState<ProductionPending[]>([]),[ready,setReady]=useState(false),[closed,setClosed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false),[online,setOnline]=useState(true);
 const live=useRef(false),generation=useRef(0),sequence=useRef(0),flight=useRef(false),intent=useRef<ProductionCommand|null>(null),current=useRef(scope),shown=useRef(visible),heading=useRef<HTMLHeadingElement>(null);
 const identity=scope?JSON.stringify([fence,scope.view_context,scope.child_id,scope.profile_version]):JSON.stringify([fence,null]);
 current.current=scope;shown.current=visible;
 useLayoutEffect(()=>{++generation.current;++sequence.current;intent.current=null;flight.current=false;setTarget(null);setEligible(null);setPending([]);setReady(false);setClosed(false);setBusy(false);setMessage('');setUncertain(false);onLock(false);},[identity,onLock]);
 const refresh=useCallback(async()=>{
  const s=current.current;if(!s||!shown.current)return;const guard=generation.current,id=++sequence.current;
  try{const r=await production.status(selection(s));if(!live.current||guard!==generation.current||id!==sequence.current||!shown.current)return;setPending(r.pending);setClosed(r.writes_closed);setReady(true);if(r.pending.length){setUncertain(true);onLock(true);setMessage('Confirmation pending. No production receipt is confirmed here. Recover the existing request; do not create another.');}}
  catch(e){if(!live.current||guard!==generation.current||id!==sequence.current)return;setReady(false);setPending([]);if((e as {status?:number}).status===403){intent.current=null;setTarget(null);setEligible(null);setMessage('');onDenied();}else setMessage('Production access could not be confirmed. Any uncertain request identity is retained on this page. Retry production access.');}
 },[onDenied,onLock]);
 useEffect(()=>{live.current=true;const connect=()=>setOnline(navigator.onLine);connect();window.addEventListener('online',connect);window.addEventListener('offline',connect);return()=>{live.current=false;++generation.current;window.removeEventListener('online',connect);window.removeEventListener('offline',connect);};},[]);
 useEffect(()=>{if(visible)void refresh();},[visible,identity,refresh]);
 useEffect(()=>{const check=()=>{if(document.visibilityState!=='hidden')void refresh();};window.addEventListener('focus',check);const timer=setInterval(check,15000);return()=>{window.removeEventListener('focus',check);clearInterval(timer);};},[refresh]);
 useEffect(()=>{if(target&&eligible?.status==='eligible')heading.current?.focus();},[target,eligible]);
 async function review(item:Saved){
  const s=current.current;if(!s||!shown.current||flight.current||captureBusy||!ready||closed||intent.current||pending.length||!online)return;
  const guard=generation.current;flight.current=true;setBusy(true);setTarget(item);setEligible(null);setMessage('Checking current eligibility. This does not book production.');
  try{const r=await production.eligibility({selection:selection(s),wonder_id:item.request_id,wonder_version:item.source_scope_version});if(!live.current||guard!==generation.current||!shown.current)return;setEligible(r);setMessage(r.status==='eligible'?'Eligibility is advisory. Confirm explicitly to request production.':explanation[r.status]??'Production is unavailable.');}
  catch(e){if(!live.current||guard!==generation.current)return;if((e as {status?:number}).status===403)onDenied();else setMessage('Eligibility could not be confirmed. Nothing was requested. Check access and review again.');}
  finally{if(live.current&&guard===generation.current){flight.current=false;setBusy(false);}}
 }
 async function perform(command:ProductionCommand|null,key?:string){
  const s=current.current;if(!s||!shown.current||flight.current||!online)return;
  const guard=generation.current;flight.current=true;++sequence.current;setBusy(true);setUncertain(true);onLock(true);onStart();setMessage('Confirmation pending. Keep this page open; no receipt is confirmed yet.');
  try{
   const r=command?await production.submit({selection:selection(s),command}):await production.reconcile({selection:selection(s),idempotency_key:key!});
   if(!live.current||guard!==generation.current)return;
   if(r.status==='acknowledged'){
    intent.current=null;setTarget(null);setEligible(null);setUncertain(false);onLock(false);setMessage('Request received. A production place is booked. Received '+localTime(r.receipt.original_received_at)+'. Original due time: '+localTime(r.receipt.original_due_at)+'.');
    await refresh();if(live.current&&guard===generation.current)await onAcknowledged();
   }else if(r.status==='retryable_unacknowledged'){setClosed(true);setMessage('Confirmation pending. The server may hold this request, but its receipt is not confirmed. Retry the original request or reconcile its existing key.');await refresh();}
   else if(Object.hasOwn(explanation,r.status)){intent.current=null;setUncertain(false);onLock(false);setEligible({status:r.status});setMessage(explanation[r.status]);await refresh();if(live.current&&guard===generation.current)await onAcknowledged();}
   else setMessage('This request needs recovery. Keep its original identity and check production access; do not create a replacement request.');
  }catch(e){if(!live.current||guard!==generation.current)return;if((e as {status?:number}).status===403){intent.current=null;setTarget(null);setEligible(null);onDenied();}else setMessage('Not confirmed requested. The first reply may have been lost. Retry the original production request or check pending confirmations. Do not create another request.');}
  finally{if(live.current&&guard===generation.current){flight.current=false;setBusy(false);}}
 }
 function confirm(){
  const s=current.current,e=eligible;if(!s||!target||e?.status!=='eligible'||!e.offer_version||!e.consent_epoch||!e.scope_version||flight.current||captureBusy||!ready||closed||!online||intent.current)return;
  const c:ProductionCommand={contract_version:'1.1.0',record_type:'submit',command:'SubmitProduction',idempotency_key:crypto.randomUUID(),child_id:s.child_id,wonder_id:target.request_id,wonder_version:target.source_scope_version,consent_epoch:e.consent_epoch,offer_version:e.offer_version,scope_version:e.scope_version};
  // Set before the first await. A lost FIRST reply retains this exact intent.
  intent.current=c;void perform(c);
 }
 if(!visible||!scope)return null;
 return <section className="production-request" aria-labelledby="production-title"><h3 id="production-title">Request an investigation</h3><p>Saving and production are separate. Only a confirmed production request books a place and starts the original 24-hour commitment.</p>
  {!online&&<p role="alert">Offline. Keep this page open. No new confirmation can be checked.</p>}{message&&<p role="status">{message}</p>}
  {!ready&&<p>Production controls are paused until current access is confirmed.</p>}
  <button type="button" disabled={busy||!online} onClick={()=>void refresh()}>Retry production access</button>
  {closed&&<p>New production is paused while existing confirmation or recovery needs attention.</p>}
  {uncertain&&intent.current&&<button type="button" disabled={busy||!online} onClick={()=>void perform(intent.current)}>Retry original production request</button>}
  {pending.length>0&&<div><h4>Pending production confirmations</h4><p>These references are not confirmed receipts. Recovery preserves the original request and clock.</p>{pending.map((p,i)=><div className="family-card" key={p.idempotency_key}><p>Pending production {i+1} · source version {p.wonder_version}</p><button type="button" disabled={busy||!online} onClick={()=>void perform(null,p.idempotency_key)}>Reconcile pending production {i+1}</button></div>)}</div>}
  {!uncertain&&!pending.length&&saved.map((w,i)=><div className="family-card" key={w.request_id}><p className="family-question">{w.question}</p><button type="button" disabled={busy||captureBusy||!online||!ready||closed} onClick={()=>void review(w)}>Review production request {i+1}</button></div>)}
  {target&&!uncertain&&<div className="wonder-confirm" role="region" aria-labelledby="production-confirm-title"><h4 id="production-confirm-title" tabIndex={-1} ref={heading}>Production for {scope.nickname}</h4><h5>Child’s exact words</h5><p className="family-question">{target.question}</p><h5>Parent context</h5><p className="family-question">{target.parent_context??'No parent context supplied.'}</p>
   {eligible?.status==='eligible'?<><p>Confirm production to book an investigation within 24 hours of the original successful server receipt. The exact receipt and deadline appear only after confirmation. Current availability can change before submission.</p><button type="button" disabled={busy||captureBusy||!ready||closed||!online} onClick={confirm}>Confirm production request</button></>:<p>{eligible?explanation[eligible.status]:'Checking eligibility…'}</p>}
   <button type="button" disabled={busy} onClick={()=>{setTarget(null);setEligible(null);setMessage('Wonder remains saved-only. No production request was made by this review.');}}>Keep saved-only wonder</button>
  </div>}
 </section>;
}
export default function LoopWonderCapture({scope,visible,fence,onAcknowledged,onDenied,onUncertain}:{scope:WonderScope|null;visible:boolean;fence:number;onAcknowledged:()=>Promise<void>;onDenied:()=>void;onUncertain:()=>void}){
 const [phase,setPhase]=useState<Phase>('unsent'),[question,setQuestion]=useState(''),[context,setContext]=useState(''),[opened,setOpened]=useState(false);
 const [saved,setSaved]=useState<Saved[]>([]),[pending,setPending]=useState<Pending[]>([]),[target,setTarget]=useState<Saved|null>(null),[message,setMessage]=useState(''),[ready,setReady]=useState(false),[closed,setClosed]=useState(false),[online,setOnline]=useState(true),[busy,setBusy]=useState(false),[productionLocked,setProductionLocked]=useState(false);
 const mounted=useRef(false),generation=useRef(0),statusSequence=useRef(0),inFlight=useRef(false),intent=useRef<Command|null>(null),current=useRef(scope),shown=useRef(visible),heading=useRef<HTMLHeadingElement>(null),review=useRef<HTMLButtonElement>(null);
 const identity=scope?JSON.stringify([fence,scope.view_context,scope.child_id,scope.profile_version]):JSON.stringify([fence,null]);
 const activeIdentity=useRef(identity);current.current=scope;shown.current=visible;
 useLayoutEffect(()=>{activeIdentity.current=identity;++generation.current;++statusSequence.current;intent.current=null;inFlight.current=false;setQuestion('');setContext('');setTarget(null);setSaved([]);setPending([]);setMessage('');setPhase('unsent');setOpened(false);setReady(false);setBusy(false);setClosed(false);setProductionLocked(false);},[identity]);
 const refresh=useCallback(async()=>{
  const s=current.current;if(!s||!shown.current)return;const guard=generation.current,id=++statusSequence.current;
  try{const result=await api.status(selection(s));if(!mounted.current||guard!==generation.current||id!==statusSequence.current||!shown.current)return;setSaved(result.saved);setPending(result.pending);setClosed(result.writes_closed);setReady(true);setMessage(previous=>previous===accessWarning?'':previous);}
  catch(error){if(!mounted.current||guard!==generation.current||id!==statusSequence.current)return;setReady(false);setSaved([]);setPending([]);if((error as {status?:number}).status===403){intent.current=null;setQuestion('');setContext('');setOpened(false);setPhase('denied');onDenied();}else setMessage(accessWarning);}
 },[onDenied]);
 useEffect(()=>{mounted.current=true;const connectivity=()=>setOnline(navigator.onLine);connectivity();window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);return()=>{mounted.current=false;++generation.current;window.removeEventListener('online',connectivity);window.removeEventListener('offline',connectivity);};},[]);
 useEffect(()=>{if(visible)void refresh();},[visible,identity,refresh]);
 useEffect(()=>{const check=()=>{if(document.visibilityState!=='hidden')void refresh();};const timer=setInterval(check,15000);window.addEventListener('focus',check);return()=>{clearInterval(timer);window.removeEventListener('focus',check);};},[refresh]);
 useEffect(()=>{if(phase==='confirming')heading.current?.focus();},[phase]);
 const productionStart=useCallback(()=>{setMessage('');setTarget(null);setOpened(false);setPhase('unsent');onUncertain();},[onUncertain]);
 const productionAcknowledged=useCallback(async()=>{setMessage('');await refresh();await onAcknowledged();},[refresh,onAcknowledged]);
 const lockProduction=useCallback((value:boolean)=>setProductionLocked(value),[]);
 async function perform(command:Command|null,pendingCommand?:Pending){
  const s=current.current;if(!s||!shown.current||!ready||inFlight.current||!online||productionLocked)return;
  const guard=generation.current;inFlight.current=true;setBusy(true);setPhase('saving');setMessage('Checking confirmation…');onUncertain();
  try{const result=command?await api.save(command):await api.reconcile({...selection(s),command_id:pendingCommand!.command_id});if(!mounted.current||guard!==generation.current)return;
   if(result.state==='retryable_unacknowledged'){setPhase('awaiting_confirmation');setClosed(true);setMessage('Confirmation pending. This wonder is not confirmed saved. Keep this page open; retry this same command or reconcile its pending reference.');await refresh();return;}
   intent.current=null;setQuestion('');setContext('');setTarget(null);setPhase('saved-only');setMessage('Wonder saved. No investigation has been requested. There is no production deadline.');await refresh();if(mounted.current&&guard===generation.current)await onAcknowledged();
  }catch(error){if(!mounted.current||guard!==generation.current)return;const status=(error as {status?:number}).status;
   if(status===403){intent.current=null;setQuestion('');setContext('');setSaved([]);setPending([]);setPhase('denied');setMessage('Access changed. Select a child again after checking access.');onDenied();}
   else if(status===429){setPhase('conflict');setMessage('Save was not accepted. A local test limit was reached. Check pending commands, then discard this page intent to keep editing.');await refresh();if(mounted.current&&guard===generation.current)await onAcknowledged();}
   else if(status===409){setPhase('conflict');setMessage('This command conflicts with current source history. Check the pending list before explicitly discarding this page intent.');await refresh();}
   else{setPhase('awaiting_confirmation');setMessage('Not confirmed saved. The response may have been lost. Keep this page open and retry the original command; do not start another save.');}
  }finally{if(mounted.current&&guard===generation.current){inFlight.current=false;setBusy(false);}}
 }
 function beginCorrection(item:Saved){if(intent.current||busy||productionLocked)return;setTarget(item);setQuestion(item.question);setContext(item.parent_context??'');setOpened(true);setPhase('editing');setMessage('Correction creates a new source version; earlier words remain in history.');}
 function confirm(){if(!ready||!online||closed||!scope||!question.trim()||question.length>4000||context.length>2000||intent.current||busy||productionLocked)return;setPhase('confirming');setMessage('');}
 function save(){if(!scope||!ready||!online||closed||phase!=='confirming'||intent.current||busy||productionLocked)return;const c:Command={...selection(scope),command_id:crypto.randomUUID(),operation:target?'correct':'create',question,parent_context:context,...(target?{request_id:target.request_id,expected_source_scope_version:target.source_scope_version}:{})};intent.current=c;void perform(c);}
 function discard(){if(busy||pending.length||productionLocked)return;intent.current=null;setQuestion('');setContext('');setTarget(null);setPhase('unsent');setOpened(false);setMessage('Page intent discarded. This does not cancel a server command.');}
 const uncertain=phase==='saving'||phase==='awaiting_confirmation'||phase==='conflict'||Boolean(intent.current);
 // Keep recovery RAM mounted during temporary access hiding; remove private DOM.
 return <>
 {visible&&scope&&activeIdentity.current===identity&&<section className="wonder-capture" aria-labelledby="wonder-title"><h3 id="wonder-title">Capture a wonder</h3><p>Keep {scope.nickname}’s own words. Saving does not request an investigation.</p>
  {!online&&<p role="alert">Offline. Nothing is confirmed saved by this page. Keep the page open.</p>}{message&&<p role={phase==='conflict'||phase==='denied'?'alert':'status'}>{message}</p>}
  {!ready&&<><p role="status">Checking current capture access. Saved sources are hidden until confirmed. You can keep an unsent draft here.</p><button type="button" disabled={busy||!online} onClick={()=>void refresh()}>Retry capture access</button></>}
  <button type="button" disabled={busy||uncertain||productionLocked} onClick={()=>{setOpened(true);setPhase('editing');setTarget(null);setQuestion('');setContext('');setMessage('');}}>Start a wonder</button>
  {closed&&<p role="status">New saves are paused while a pending command or journal problem needs confirmation.</p>}
  {opened&&(ready||!target)&&phase!=='confirming'&&<div><label htmlFor="family-wonder">What did your child ask?</label><textarea id="family-wonder" maxLength={4000} value={question} disabled={busy||uncertain||productionLocked} onChange={e=>{setQuestion(e.target.value);setPhase('editing');}}/><label htmlFor="family-wonder-context">Parent context (optional; separate from the child’s words)</label><textarea id="family-wonder-context" maxLength={2000} value={context} disabled={busy||uncertain||productionLocked} onChange={e=>setContext(e.target.value)}/>{!uncertain&&<p role="status">Unsent draft on this page only. This has not been saved or requested.</p>}<button type="button" ref={review} disabled={!ready||!online||busy||uncertain||closed||productionLocked||!question.trim()} onClick={confirm}>Review saved-only wonder</button></div>}
  {ready&&phase==='confirming'&&<div className="wonder-confirm" role="region" aria-labelledby="wonder-confirm-title"><h4 id="wonder-confirm-title" tabIndex={-1} ref={heading}>Confirm for {scope.nickname}</h4><h5>Child’s exact words</h5><p className="family-question">{question}</p><h5>Parent context</h5><p className="family-question">{context||'No parent context supplied.'}</p><p>{target?'Append a correction to this saved-only wonder.':'Save this wonder only.'} No investigation is requested and no 24-hour production deadline starts.</p><button type="button" disabled={!ready||closed||busy||!online||productionLocked} onClick={save}>Confirm saved-only wonder</button><button type="button" disabled={busy} onClick={()=>{setPhase('editing');queueMicrotask(()=>review.current?.focus());}}>Back to exact words</button></div>}
  {uncertain&&intent.current&&phase!=='conflict'&&<button type="button" disabled={busy||!online||productionLocked} onClick={()=>void perform(intent.current)}>Retry original save</button>}
  {phase==='conflict'&&!pending.length&&<button type="button" disabled={busy||productionLocked} onClick={discard}>Discard page intent after checking pending commands</button>}
  {ready&&<>{pending.length>0&&<div><h4>Pending confirmations</h4><p>These references do not mean Saved. Reconcile each existing command.</p>{pending.map((p,i)=><div className="family-card" key={p.command_id}><p>Pending capture {i+1} · source version {p.source_scope_version}</p><button type="button" disabled={busy||!online||productionLocked} onClick={()=>void perform(null,p)}>Reconcile pending capture {i+1}</button></div>)}</div>}<div><h4>Correct a saved-only source</h4>{uncertain?<p>Saved sources are hidden while this update awaits confirmation.</p>:saved.length?saved.map((item,i)=><div className="family-card" key={item.request_id}><p className="family-question">{item.question}</p><p>Source version {item.source_scope_version}</p><button type="button" disabled={busy||uncertain||closed||productionLocked} onClick={()=>beginCorrection(item)}>Correct saved wonder {i+1}</button></div>):<p>No capture-owned confirmed sources available for correction.</p>}</div></>}
 </section>}
 <ProductionRequest scope={scope} visible={visible&&activeIdentity.current===identity} fence={fence} saved={ready?saved:[]} captureBusy={busy||uncertain||Boolean(opened)} onStart={productionStart} onAcknowledged={productionAcknowledged} onDenied={onDenied} onLock={lockProduction}/>
 </>;
}
