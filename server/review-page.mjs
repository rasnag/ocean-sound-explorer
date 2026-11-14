// REVIEW-LOCAL-01 / DECISION-043 / APPROVAL-010: source bundle, TEST ONLY.
// Architecture 1.2 / ADR-E03/04/05/06 / SHA256
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// The unchanged stage1 service owns household/consent locks, current generation
// pins, immutable facts and independent durability. Browser state is advisory.
// No tests or browser verification are claimed by this response-only stage.
import {createReviewClient} from '../lib/loop/review-client.mjs';

export const reviewCSS=`:root{font:17px/1.55 system-ui,sans-serif;color:#173b3b;background:#edf5f2}*{box-sizing:border-box}body{margin:0}main{max-width:1000px;margin:auto;padding:clamp(14px,3vw,32px)}h1,h2,h3{line-height:1.25}nav{display:flex;flex-wrap:wrap;gap:18px}section{background:white;border:1px solid #aac4bd;border-radius:12px;padding:18px;margin:18px 0;min-width:0}button,input,textarea,select{font:inherit;max-width:100%}button{min-height:48px;background:#075d62;color:white;border:2px solid #075d62;border-radius:8px;padding:10px 16px;margin:7px 8px 7px 0;cursor:pointer;overflow-wrap:anywhere}button:disabled{opacity:.5;cursor:default}select,textarea{display:block;width:100%;min-height:48px;padding:10px;border:2px solid #47766b;border-radius:7px;background:white;color:inherit}textarea{min-height:130px}label{display:block;font-weight:650;margin-top:14px}.check{display:flex;align-items:center;gap:12px;min-height:48px;font-weight:500}.check input{width:24px;height:24px;flex-shrink:0}fieldset{min-width:0;border:1px solid #aac4bd;border-radius:8px}legend{font-weight:bold}pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:inherit;background:#f0f6f4;border-radius:8px;padding:12px}p,li,summary,code{overflow-wrap:anywhere}.private-text{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#075d62}*:focus-visible,[tabindex='-1']:focus{outline:3px solid #bd5d16;outline-offset:3px}.badge{border-left:6px solid #bf711d;padding:12px 16px;background:#fff5df;font-weight:bold}#review-error{color:#922c1e}#review-status{font-weight:650}.history{border-top:1px solid #aac4bd;padding-top:12px;margin-top:16px}details{margin:12px 0}summary{cursor:pointer;min-height:48px;padding:10px 0}@media(max-width:420px){section{padding:12px}button{width:100%;margin-right:0}}`;

export const reviewPage=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Invented TEST review workbench</title><link rel="stylesheet" href="/founder/review.css"><a href="#review-main">Skip to review workbench</a><main id="review-main"><p class="badge">SYNTHETIC TEST ONLY</p><h1>Invented review and TEST snapshots</h1><p>Every checklist result and note on this screen is invented test evidence. No actual human review, factual verification, scientific endorsement or content approval is established. TEST snapshots remain toy drafts.</p><nav aria-label="Founder workspace"><a href="/founder">Founder home</a><a href="/founder/generation">Draft workbench</a><a href="/login">Sign in again</a></nav><p id="review-status" role="status" tabindex="-1">Checking founder access…</p><p id="review-error" role="alert"></p><button id="review-check" type="button">Check current review</button><section><h2>Accepted invented requests</h2><label for="review-request">Choose an accepted test request</label><select id="review-request"><option value="">Choose an accepted request</option></select><p>Selecting a request only reads its current local test state.</p></section><div id="review-recovery"></div><div id="review-view"></div></main><script src="/founder/review.js" defer></script></html>`;

function reviewBrowser(createClient){
 const api=createClient((...args)=>fetch(...args));
 const $=id=>document.getElementById(id),status=$('review-status'),error=$('review-error'),select=$('review-request'),container=$('review-view'),recovery=$('review-recovery');
 const checkNames=['facts','age','safety','outcomes','help','difficulty','playtest'];
 const checkLabels={facts:'Invented facts checklist result',age:'Invented age checklist result',safety:'Invented safety checklist result',outcomes:'Invented supported-outcomes checklist result',help:'Invented help-ladder checklist result',difficulty:'Invented fast/medium/slow difficulty checklist result',playtest:'Invented playtest checklist result'};
 let rows=[],selection=null,view=null,pending=[],intent=null,draft=null,writing=false,reading=false,listFlight=false,live=true,sequence=0,readSequence=0,rendered='',recoveryStamp='',timer=null;
 const controllers=new Set();
 const visible=()=>live&&document.visibilityState!=='hidden';
 const key=s=>s?JSON.stringify([s.household_id,s.request_id,s.scope_version]):'';
 const scope=s=>({household_id:s.household_id,request_id:s.request_id,scope_version:s.scope_version});
 const source=v=>v?.status==='review_view'?JSON.stringify([v.request,v.revision]):'';
 const commandId=i=>i?.kind==='command'?i.input.command.command_id:i?.input.command_id;
 const hold=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(hold);Object.freeze(v);}return v;};
 function element(tag,text,attrs={}){const e=document.createElement(tag);if(text!==null)e.textContent=text;for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
 function section(title){const e=element('section',null);e.append(element('h2',title));return e;}
 const paragraph=(parent,text)=>parent.append(element('p',text));
 function button(parent,id,label,action,disabled=false){const b=element('button',label,{type:'button',id});b.disabled=disabled;b.addEventListener('click',action);parent.append(b);return b;}
 function field(parent,id,label,options){parent.append(element('label',label,{for:id}));const e=element('select',null,{id});for(const[value,text]of options)e.append(element('option',text,{value}));parent.append(e);return e;}
 function textarea(parent,id,label,value=''){parent.append(element('label',label,{for:id}));const e=element('textarea',null,{id,maxlength:'2000',autocomplete:'off',spellcheck:'false'});e.value=value;parent.append(e);return e;}
 function focusState(){const e=document.activeElement;return e?.id?{id:e.id,start:e.selectionStart,end:e.selectionEnd}:null;}
 function restoreFocus(saved){const e=saved&&$(saved.id);if(!e||e.disabled)return;e.focus({preventScroll:true});if(typeof saved.start==='number'&&typeof e.setSelectionRange==='function')e.setSelectionRange(saved.start,saved.end);}
 function captureDraft(){
  if(!view||view.status!=='review_view'||!$('review-notes'))return draft;
  return {source:source(view),checks:Object.fromEntries(checkNames.map(k=>[k,$('review-'+k).checked])),notes:$('review-notes').value,predecessor:$('review-predecessor')?.value??'',target:$('review-withdraw-target')?.value??'',reason:$('review-withdraw-reason')?.value??''};
 }
 function hide(keepDraft=false){if(keepDraft)draft=captureDraft();else draft=null;view=null;rendered='';container.replaceChildren();}
 function abortReads(){++readSequence;for(const c of controllers)c.abort();controllers.clear();reading=false;}
 function lock(){
  select.disabled=writing||!!intent;$('review-check').disabled=writing;
  for(const e of container.querySelectorAll('input,textarea,select'))e.disabled=writing||!!intent;
  updateButtons();
 }
 function setRows(next){
  const changed=JSON.stringify(rows)!==JSON.stringify(next),selectedKey=key(selection);rows=next;
  if(changed||select.options.length!==rows.length+1){
   select.replaceChildren(element('option','Choose an accepted request',{value:''}));
   rows.forEach((r,i)=>select.append(element('option','Invented request '+(i+1)+' · '+r.request_id.slice(0,8),{value:key(r)})));
  }
  select.value=rows.some(r=>key(r)===selectedKey)?selectedKey:'';lock();
 }
 function denied(message){
  ++sequence;abortReads();writing=false;selection=null;intent=null;pending=[];hide();recoveryStamp='';recovery.replaceChildren();setRows([]);
  status.textContent='Private TEST details hidden.';error.textContent=message;lock();
 }
 function loseScope(){
  ++sequence;abortReads();writing=false;selection=null;intent=null;pending=[];hide();recoveryStamp='';recovery.replaceChildren();select.value='';
  status.textContent='Request authority or scope changed. Private details hidden. Select a currently accepted request.';lock();
 }
 function recover(){
  if(!visible())return;
  const stamp=JSON.stringify([key(selection),commandId(intent),intent?.kind,intent?.ack?.version,intent?.rejected,writing,pending]);
  if(stamp===recoveryStamp)return;const focus=focusState();recoveryStamp=stamp;recovery.replaceChildren();
  if(!intent&&!pending.length){restoreFocus(focus);return;}
  const box=section('Original command recovery');
  paragraph(box,'Unknown or pending is not saved. Recovery uses the original command ID. No mutation is retried automatically.');
  if(intent){
   paragraph(box,'Original command ID: '+commandId(intent));
   if(intent.ack)paragraph(box,'An independent acknowledgement was received. A fresh authorized reread is still required before confirmation.');
   if(intent.rejected){
    paragraph(box,'This command was explicitly rejected. No successful save is claimed.');
    button(box,'review-dismiss','Dismiss rejected command and reread',()=>{intent=null;pending=[];recoveryStamp='';hide();recover();lock();void refresh(true);},writing);
   }else{
    if(intent.kind==='command')button(box,'review-retry','Retry original TEST command',()=>void perform('command'),writing);
    button(box,'review-reconcile','Reconcile original TEST command',()=>void perform('reconcile'),writing);
   }
  }else for(const p of pending){
   paragraph(box,'Actor-owned pending command: '+p.command_id);
   button(box,'review-pending-'+p.command_id,'Reconcile pending TEST command',()=>{
    if(writing||intent||!selection)return;
    intent={kind:'reconcile',input:hold({...scope(selection),command_id:p.command_id}),ack:null,rejected:false};void perform('reconcile');
   },writing);
  }
  if(!intent&&pending.length===0)paragraph(box,'No actor-owned recovery reference is available on this page.');
  recovery.append(box);restoreFocus(focus);
 }
 function unsent(){
  if(!view||!$('review-notes'))return false;
  const saved=view.review;
  return $('review-notes').value!==(saved?.notes??'')||checkNames.some(k=>$('review-'+k).checked!==(saved?.checks[k]??false));
 }
 function updateButtons(){
  const v=view?.status==='review_view'?view:null,blocked=writing||!!intent||!v?.revision;
  if($('review-record'))$('review-record').disabled=blocked;
  if($('review-release')){
   const predecessor=$('review-predecessor').value;
   const validPredecessor=v.snapshots.length===0?predecessor==='':v.snapshots.some(s=>s.snapshot_id===predecessor&&s.revision_id!==v.revision?.revision_id);
   $('review-release').disabled=blocked||!v.readiness.eligible||unsent()||!validPredecessor||v.snapshots.some(s=>s.revision_id===v.revision?.revision_id);
  }
  if($('review-withdraw')){
   const target=$('review-withdraw-target').value;
   $('review-withdraw').disabled=blocked||!v.snapshots.some(s=>s.snapshot_id===target&&!s.withdrawn)||!$('review-withdraw-reason').value.trim();
  }
  if($('review-unsent'))$('review-unsent').textContent=unsent()?'Unsent invented checklist changes. Record them before creating a TEST snapshot.':'Controls match the displayed recorded checklist. Only the server determines TEST eligibility.';
 }
 function preview(parent,adventure,id,label){
  const details=element('details',null,{id});details.append(element('summary',label),element('pre',JSON.stringify(adventure,null,2)));parent.append(details);
 }
 function render(next,{focus=false,confirmed=false}={}){
  if(!visible())return;
  if(next.status==='review_pending'){
   hide(true);pending=next.pending;recover();status.textContent='Confirmation pending. No private question, draft or checklist is shown.';lock();return;
  }
  pending=[];
  if(intent&&!confirmed){hide(true);recover();status.textContent='Original command outcome is not yet confirmed. Retry or reconcile that original command explicitly.';lock();return;}
  const stamp=JSON.stringify(next);
  if(stamp===rendered&&view){recover();if(focus)$('review-source-heading')?.focus();lock();return;}
  const savedFocus=focusState(),openDetails=new Set([...container.querySelectorAll('details[open]')].map(e=>e.id));
  const choices=confirmed?null:captureDraft(),oldSource=choices?.source??source(view),changed=!!oldSource&&oldSource!==source(next);
  draft=choices&&choices.source===source(next)?choices:null;view=next;rendered=stamp;container.replaceChildren();
  const q=next.request,original=section('Original and current request');original.querySelector('h2').id='review-source-heading';original.querySelector('h2').tabIndex=-1;
  paragraph(original,'Household: '+selection.household_id+' · Request: '+selection.request_id+' · Scope version: '+q.scope_version);
  original.append(element('h3','Exact original question'),element('p',q.original_question,{class:'private-text'}),element('h3','Exact current question'),element('p',q.current_question,{class:'private-text'}),element('h3','Separate interpretation'),element('p',q.interpretation??'No separate interpretation.',{class:'private-text'}));
  paragraph(original,'Original receipt and due time are unchanged. The following values are displayed exactly as returned.');
  original.append(element('pre',JSON.stringify(q.receipt,null,2)));container.append(original);
  const current=section('Exact current toy draft');
  if(!next.revision)paragraph(current,'No valid current draft is available. TEST snapshot creation is blocked. Check the draft workbench, then reread here.');
  else{
   paragraph(current,'Revision ID: '+next.revision.revision_id);paragraph(current,'Output digest: '+next.revision.output_digest);
   paragraph(current,'Finite fixture only: balanced → stable; offset → tips. No playable or published content is created here.');
   preview(current,next.revision.adventure,'review-draft-preview','Read finite draft data');
  }
  container.append(current);
  const readiness=section('Server-reported TEST readiness');
  paragraph(readiness,next.readiness.eligible?'Server reports eligible for an isolated TEST snapshot. This is no actual endorsement.':'TEST snapshot blocked.');
  paragraph(readiness,'Missing keys: '+(next.readiness.missing.length?next.readiness.missing.join(', '):'none'));
  paragraph(readiness,'Every edit or regeneration requires a fresh exact-source invented review. A stale digest or CAS conflict requires a current reread.');
  if(changed)paragraph(readiness,'The source changed. Earlier unsent checklist choices were cleared; prior eligibility is invalid.');
  if(next.review){readiness.append(element('h3','Recorded invented review'),element('pre',JSON.stringify(next.review,null,2)));}
  else paragraph(readiness,'No invented review is recorded for this exact current source.');container.append(readiness);
  const form=section('Record invented review evidence'),fieldset=element('fieldset',null);fieldset.append(element('legend','Seven invented boolean results'));
  paragraph(form,'These boxes record test data, including false results. They do not certify facts, safety, human review or actual playtesting.');
  for(const k of checkNames){
   const label=element('label',null,{class:'check',for:'review-'+k}),input=element('input',null,{type:'checkbox',id:'review-'+k});
   input.checked=draft?.checks[k]??next.review?.checks[k]??false;input.addEventListener('change',()=>{draft=captureDraft();updateButtons();});label.append(input,element('span',checkLabels[k]));fieldset.append(label);
  }
  form.append(fieldset);
  const notes=textarea(form,'review-notes','Invented review notes (required, up to 2000 characters)',draft?.notes??next.review?.notes??'');notes.required=true;
  notes.addEventListener('input',()=>{draft=captureDraft();error.textContent='';updateButtons();});
  paragraph(form,'Use plain invented notes. Links, markup and executable text are rejected. False checkbox values can be recorded and remain blocked.');
  form.append(element('p','',{id:'review-unsent'}));
  button(form,'review-record','Record invented review',()=>send('RecordTestReview',{synthetic:true,checks:Object.fromEntries(checkNames.map(k=>[k,$('review-'+k).checked])),notes:$('review-notes').value}));container.append(form);
  const snapshots=section('Create an isolated TEST snapshot or correction');
  paragraph(snapshots,'The server must report eligible for this exact revision. A correction names a prior immutable TEST snapshot; that earlier snapshot is preserved.');
  const predecessor=field(snapshots,'review-predecessor','Prior TEST snapshot for a correction',next.snapshots.length?[['','Choose a prior snapshot'],...next.snapshots.filter(s=>s.revision_id!==next.revision?.revision_id).map(s=>[s.snapshot_id,s.snapshot_id+(s.withdrawn?' · withdrawn':'')+(s.is_current_revision?' · current':' · stale')])]:[['','First TEST snapshot (no predecessor)']]);
  if(draft&&[...predecessor.options].some(o=>o.value===draft.predecessor))predecessor.value=draft.predecessor;
  predecessor.addEventListener('change',()=>{draft=captureDraft();updateButtons();});
  button(snapshots,'review-release',next.snapshots.length?'Create TEST snapshot/correction':'Create TEST snapshot',()=>send('ReleaseTestSnapshot',{predecessor_snapshot_id:next.snapshots.length?predecessor.value:null}));
  if(next.snapshots.some(s=>s.revision_id===next.revision?.revision_id))paragraph(snapshots,'This revision already has an immutable TEST snapshot. A distinct command cannot create another, even after withdrawal.');container.append(snapshots);
  const withdraw=section('Withdraw a TEST snapshot');
  const target=field(withdraw,'review-withdraw-target','TEST snapshot to withdraw',[['','Choose a snapshot'],...next.snapshots.filter(s=>!s.withdrawn).map(s=>[s.snapshot_id,s.snapshot_id+(s.is_current_revision?' · current':' · stale')])]);
  if(draft&&[...target.options].some(o=>o.value===draft.target))target.value=draft.target;
  const reason=textarea(withdraw,'review-withdraw-reason','Invented withdrawal reason',draft?.reason??'');
  for(const e of [target,reason])e.addEventListener(e===target?'change':'input',()=>{draft=captureDraft();updateButtons();});
  paragraph(withdraw,'Withdrawal appends a separate fact. It does not rewrite historical snapshot data. The command still pins the current source.');
  button(withdraw,'review-withdraw','Withdraw TEST snapshot',()=>send('WithdrawTestSnapshot',{snapshot_id:target.value,reason:reason.value}));container.append(withdraw);
  const history=section('Immutable TEST snapshot lineage and history');
  if(!next.snapshots.length)paragraph(history,'No independently acknowledged TEST snapshot is present.');
  next.snapshots.forEach((s,i)=>{
   const entry=element('div',null,{class:'history'});entry.append(element('h3','TEST snapshot '+(i+1)));
   paragraph(entry,'Snapshot ID: '+s.snapshot_id);paragraph(entry,'Revision ID: '+s.revision_id);paragraph(entry,'Output digest: '+s.output_digest);
   paragraph(entry,'Predecessor: '+(s.predecessor_snapshot_id??'none'));
   paragraph(entry,(s.is_current_revision?'Current source':'Stale source')+' · '+(s.withdrawn?'Withdrawn TEST snapshot':'Not withdrawn')+' · restricted immutable history');
   preview(entry,s.adventure,'review-snapshot-'+s.snapshot_id,'Read immutable finite snapshot data');history.append(entry);
  });container.append(history);
  for(const id of openDetails){const e=$(id);if(e)e.open=true;}
  draft=captureDraft();recover();lock();if(focus)$('review-source-heading').focus();else restoreFocus(savedFocus);
 }
 async function refresh(focus=false){
  if(!visible()||!selection||writing||reading)return false;
  const selected=scope(selection),guard=sequence,serial=++readSequence,c=new AbortController();controllers.add(c);reading=true;
  const current=()=>visible()&&guard===sequence&&serial===readSequence&&key(selection)===key(selected);
  try{
   const result=await api.read(selected,{signal:c.signal});if(!current())return false;
   // A held private response is never revealed on its old availability check.
   const fresh=await api.list({}, {signal:c.signal});if(!current())return false;setRows(fresh.requests);
   if(!rows.some(r=>key(r)===key(selected))){loseScope();return false;}
   const confirmed=!!intent?.ack&&result.status==='review_view';
   if(confirmed&&result.version<intent.ack.version)throw Object.assign(new Error('Reread unavailable.'),{status:502});
   if(confirmed){intent=null;draft=null;error.textContent='';}
   render(result,{focus,confirmed});
   if(result.status==='review_view'&&!intent)status.textContent=confirmed?'Original TEST command independently acknowledged and reread. No actual publication or endorsement occurred.':'Current local TEST state checked. Invented review only.';
   return result.status==='review_view'&&!intent;
  }catch(e){
   if(!current())return false;
   hide(true);pending=[];
   if(e.status===401||e.status===403){denied('Founder or test authority changed. Sign in and select a request again.');return false;}
   status.textContent='Current private TEST state could not be confirmed. Details hidden.';
   error.textContent=e.status===409?'Source or scope conflict. Check current authority; an original pending command must keep its original key.':'Check current access or explicitly recover the original command. No successful save is claimed.';
   recover();return false;
  }finally{controllers.delete(c);if(guard===sequence&&serial===readSequence)reading=false;lock();}
 }
 function send(action,payload){
  if(!visible()||writing||intent||!selection||view?.status!=='review_view'||!view.revision)return;
  updateButtons();const control=action==='RecordTestReview'?$('review-record'):action==='ReleaseTestSnapshot'?$('review-release'):$('review-withdraw');if(control?.disabled)return;
  const envelope={...scope(selection),command:{command_id:crypto.randomUUID(),expected_version:view.version,revision_id:view.revision.revision_id,output_digest:view.revision.output_digest,action,payload}};
  intent={kind:'command',input:hold(envelope),ack:null,rejected:false};void perform('command');
 }
 async function perform(kind){
  if(!visible()||writing||!intent||!selection||intent.rejected)return;
  const original=intent;if(key(original.input)!==key(selection))return;
  ++sequence;abortReads();const guard=sequence,c=new AbortController();controllers.add(c);writing=true;pending=[];hide();recoveryStamp='';recover();lock();error.textContent='';status.textContent='TEST command confirmation pending. Nothing is confirmed saved.';
  let reread=false;
  try{
   const input=kind==='command'?original.input:{...scope(original.input),command_id:commandId(original)};
   const result=await api[kind](input,{signal:c.signal});if(!visible()||guard!==sequence||intent!==original)return;
   if(result.status==='acknowledged'){original.ack=result;reread=true;status.textContent='Checking an independently authorized reread before confirmation…';}
   else{original.ack=null;status.textContent='Primary-only or pending result. Not saved. Explicitly retry or reconcile the original command.';reread=true;}
  }catch(e){
   if(!visible()||guard!==sequence||intent!==original)return;
   if(e.status===401||e.status===403){denied('Current founder or test authority changed. Private details are hidden.');return;}
   original.rejected=[400,413,415].includes(e.status);
   error.textContent=original.rejected?'Command rejected. Use bounded plain invented notes and the complete seven-boolean checklist. Dismiss this rejection before editing.':e.status===409?'CAS or source-pin conflict. The original key is retained. Check current source; reconciliation may require the local controller.':'Outcome unknown. Retain this page and explicitly retry or reconcile the original command.';
  }finally{
   controllers.delete(c);
   if(guard===sequence){writing=false;recoveryStamp='';recover();lock();if(reread)void refresh(true);}
  }
 }
 async function poll(){
  if(!visible()||writing||listFlight)return;listFlight=true;const guard=sequence,c=new AbortController();controllers.add(c);
  try{
   const result=await api.list({}, {signal:c.signal});if(!visible()||guard!==sequence)return;
   const selected=key(selection);setRows(result.requests);
   if(selected&&!rows.some(r=>key(r)===selected)){loseScope();return;}
   if(selection&&!reading)await refresh(false);
   else if(!selection)status.textContent=rows.length?'Choose an accepted invented request.':'No currently accepted invented requests are available.';
  }catch(e){
   if(!visible()||guard!==sequence)return;
   if(e.status===401||e.status===403)denied('Founder authority changed. Sign in again.');
   else{++sequence;abortReads();hide(true);pending=[];status.textContent='Current authority unavailable. Private details hidden.';error.textContent='No successful save is claimed. Original command recovery remains explicit.';recover();}
  }finally{controllers.delete(c);listFlight=false;lock();}
 }
 select.addEventListener('change',()=>{
  if(writing||intent)return;++sequence;abortReads();hide();pending=[];error.textContent='';selection=rows.find(r=>key(r)===select.value)??null;recoveryStamp='';recover();
  if(selection)void refresh(true);else status.textContent='Choose an accepted invented request.';
 });
 $('review-check').addEventListener('click',()=>{if(selection&&!writing)void refresh(true);else void poll();});
 const onFocus=()=>void poll();
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){
   ++sequence;abortReads();writing=false;hide();pending=[];rows=[];select.replaceChildren(element('option','Choose an accepted request',{value:''}));recovery.replaceChildren();recoveryStamp='';error.textContent='';status.textContent='Private details hidden while this page is not visible.';lock();
  }else void poll();
 });
 window.addEventListener('focus',onFocus);
 window.addEventListener('beforeunload',e=>{if(intent||unsent()){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',()=>{
  live=false;++sequence;abortReads();clearInterval(timer);timer=null;writing=false;hide();intent=null;pending=[];selection=null;rows=[];select.replaceChildren(element('option','Choose an accepted request',{value:''}));recovery.replaceChildren();recoveryStamp='';error.textContent='';status.textContent='Private details hidden.';
 });
 window.addEventListener('pageshow',()=>{if(!live){live=true;timer=setInterval(()=>void poll(),1000);}void poll();});
 timer=setInterval(()=>void poll(),1000);void poll();
}
export const reviewScript=`(${reviewBrowser.toString()})(${createReviewClient.toString()});`;
