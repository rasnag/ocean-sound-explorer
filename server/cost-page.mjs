// COST-LOCAL-01 STAGE3 / APPROVAL-011/012/013. Synthetic source bundle.
// Architecture v1.2 / ADR-E03/E04/E06 / SHA256
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// The service owns household/consent locks, source validation, immutable history,
// independent journal durability and append-time fencing. No browser authority.
import {createCostClient} from '../lib/loop/cost-client.mjs';

export const costCSS=`:root{font:17px/1.55 system-ui,sans-serif;color:#163c3c;background:#edf5f2}*{box-sizing:border-box}body{margin:0}main{max-width:960px;margin:auto;padding:clamp(12px,3vw,30px)}h1,h2,h3{line-height:1.25}section,fieldset{min-width:0;background:white;border:1px solid #8caea5;border-radius:10px;padding:16px;margin:16px 0}legend,label{font-weight:650}label{display:block;margin-top:12px}button,input,select{font:inherit;max-width:100%;min-height:48px}input,select{display:block;width:100%;padding:9px;border:2px solid #47766b;border-radius:6px;color:inherit;background:white}button{display:block;width:100%;padding:10px;margin:10px 0;border:2px solid #075d62;border-radius:7px;background:#075d62;color:white;cursor:pointer;overflow-wrap:anywhere}button:disabled{opacity:.55;cursor:default}input[type=checkbox]{width:44px;height:44px;min-height:44px;display:inline-block;vertical-align:middle;margin-right:12px}p,li,summary,code,pre,option{overflow-wrap:anywhere;word-break:break-word}pre{white-space:pre-wrap;font:inherit;padding:10px;background:#f0f6f4;border-radius:7px}nav{display:flex;flex-wrap:wrap;gap:18px}a{color:#075d62;min-height:44px;display:inline-block;padding:8px 0}*:focus-visible,[tabindex='-1']:focus{outline:3px solid #b65312;outline-offset:3px}.badge{padding:14px;border-left:6px solid #b56814;background:#fff2d7;font-weight:bold}#cost-error{color:#922c1e}#cost-status{font-weight:650}details{margin:14px 0}summary{min-height:48px;padding:10px 0;cursor:pointer}form{min-width:0}@media(max-width:420px){section,fieldset{padding:10px}main{padding:12px}}`;

export const costPage=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Invented local cost workbench</title><link rel="stylesheet" href="/founder/cost.css"><a href="#cost-main">Skip to cost workbench</a><main id="cost-main"><p class="badge">SYNTHETIC TEST ONLY · invented estimates and unpaid minutes</p><h1>Local synthetic cost workbench</h1><p>This private local workbench uses invented records only. Actual spending, provider usage, wages, settled live production and delivery remain unestablished.</p><nav aria-label="Founder workspace"><a href="/founder">Founder home</a><a href="/login">Sign in again</a></nav><p id="cost-status" role="status" tabindex="-1">Checking current founder access…</p><p id="cost-error" role="alert"></p><button id="cost-check" type="button">Read current authorized state</button><section><h2>Accepted invented requests</h2><label for="cost-request">Select opaque request IDs</label><select id="cost-request"><option value="">Choose a request</option></select><p>Selection only reads. Unsent controls stay in memory and are cleared when selection, source pin or page visibility changes.</p></section><div id="cost-recovery"></div><div id="cost-view"></div></main><script src="/founder/cost.js" defer></script></html>`;

function costBrowser(createClient){
 const api=createClient((...args)=>fetch(...args));
 const $=id=>document.getElementById(id),select=$('cost-request'),container=$('cost-view'),recovery=$('cost-recovery'),status=$('cost-status'),error=$('cost-error');
 const stages=['intake','generation_supervision','adaptation','grounding','assets','safety_review','playtest_fast','playtest_medium','playtest_slow','correction','support','incident','rules_design','player_engineering','outcome_modelling','pattern_testing','stabilization'];
 const ownerByLine={C1:'G1',C2:'G1',C3:'G2',C4:'G3',C5:'I1'};
 const toy={kind:'invented-scenario-rate',rate_id:'toy-rate-v1',input_micro_usd_per_token:3,output_micro_usd_per_token:7};
 let rows=[],selection=null,view=null,intent=null,pending=[],stamp='',recoveryStamp='',reading=false,writing=false,live=true,sequence=0,operation=0,timer=null;
 const controllers=new Set();
 const visible=()=>live&&document.visibilityState!=='hidden';
 const key=s=>s?JSON.stringify([s.household_id,s.request_id,s.scope_version]):'';
 const scope=s=>({household_id:s.household_id,request_id:s.request_id,scope_version:s.scope_version});
 const pinKey=v=>v?.status==='cost_view'?JSON.stringify(v.source.pin):'';
 function canon(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canon).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';}
 const same=(a,b)=>canon(a)===canon(b);
 function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
 function element(tag,text,attrs={}){const e=document.createElement(tag);if(text!==null)e.textContent=text;for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;}
 const paragraph=(p,text)=>p.append(element('p',text));
 function section(title){const s=element('section',null);s.append(element('h2',title));return s;}
 function button(p,id,text,run,disabled=false){const b=element('button',text,{id,type:'button'});b.disabled=disabled;b.addEventListener('click',run);p.append(b);return b;}
 function field(p,id,label,{max,pattern,type='text',value=''}={}){p.append(element('label',label,{for:id}));const e=element('input',null,{id,type,autocomplete:'off'});if(max!==undefined){e.min='0';e.max=String(max);e.step='1';}if(pattern)e.pattern=pattern;e.value=value;p.append(e);return e;}
 function choice(p,id,label,values){p.append(element('label',label,{for:id}));const e=element('select',null,{id});for(const [value,text]of values)e.append(element('option',text,{value}));p.append(e);return e;}
 function form(p,id,title){const f=element('form',null,{id}),set=element('fieldset',null);set.append(element('legend',title));f.append(set);p.append(f);return {f,set};}
 function submit(f,set,id,text,run){const b=element('button',text,{id,type:'submit'});set.append(b);f.addEventListener('submit',e=>{e.preventDefault();if(!f.reportValidity())return;try{run();}catch{error.textContent='Use the bounded IDs and whole invented quantities shown. Blank means unknown; zero is known synthetic zero.';}});}
 function quantity(e,max){if(e.value==='')return null;if(!/^(?:0|[1-9][0-9]*)$/.test(e.value))throw Error();const n=Number(e.value);if(!Number.isSafeInteger(n)||n>max)throw Error();return n;}
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
 function newId(){if(typeof crypto?.randomUUID!=='function')throw Error();return crypto.randomUUID();}
 function hide(){view=null;stamp='';container.replaceChildren();}
 function abort(){for(const c of controllers)c.abort();controllers.clear();reading=false;}
 function invalidate(){++sequence;abort();writing=false;++operation;hide();recovery.replaceChildren();recoveryStamp='';}
 function lock(){
  const blocked=writing||!!intent||pending.length>0||!view;
  for(const e of container.querySelectorAll('input,select,button'))e.disabled=blocked;
  select.disabled=writing;$('cost-check').disabled=writing;
 }
 function setRows(next){
  const selected=key(selection);
  if(!same(rows,next)){
   rows=next;select.replaceChildren(element('option','Choose a request',{value:''}));
   for(const s of rows)select.append(element('option',s.household_id+' / '+s.request_id+' / scope '+s.scope_version,{value:key(s)}));
  }
  select.value=rows.some(s=>key(s)===selected)?selected:'';
 }
 function denied(){
  invalidate();intent=null;pending=[];selection=null;rows=[];select.replaceChildren(element('option','Choose a request',{value:''}));error.textContent='Current access unavailable. Private details and unsent controls have been cleared.';status.textContent='Private details hidden.';lock();
 }
 function loseScope(){
  invalidate();pending=[];selection=null;select.value='';status.textContent='Request authority or scope changed. Choose a currently authorized scope. Any original command remains bound to its original scope.';recover();lock();
 }
 async function call(method,input){
  const c=new AbortController();controllers.add(c);const timeout=setTimeout(()=>c.abort(),15000);
  try{return await api[method](input,{signal:c.signal});}finally{clearTimeout(timeout);controllers.delete(c);}
 }
 function focusState(){const e=document.activeElement;return e?.id?{id:e.id,start:e.selectionStart,end:e.selectionEnd}:null;}
 function restoreFocus(s){const e=s&&$(s.id);if(!e||e.disabled)return;e.focus({preventScroll:true});if(typeof s.start==='number'&&typeof e.setSelectionRange==='function')try{e.setSelectionRange(s.start,s.end);}catch{}}
 function recover(){
  if(!visible())return;
  const sameScope=!!selection&&!!intent&&key(selection)===key(intent.input),signature=canon([intent?.input??null,intent?.ack??null,intent?.resolved??null,pending,writing,sameScope]);
  if(signature===recoveryStamp)return;recoveryStamp=signature;const focus=focusState();recovery.replaceChildren();
  if(intent){
   const box=section('Recover original command');
   paragraph(box,'No mutation is retried automatically. An unknown outcome blocks further writes. Recovery preserves the original envelope and key.');
   if(!sameScope){paragraph(box,'An original command is held in memory for another exact scope. Select that scope to recover it.');recovery.append(box);restoreFocus(focus);return;}
   paragraph(box,'Original command ID: '+(intent.input.command?.command_id??intent.input.command_id));
   if(intent.ack)paragraph(box,'Acknowledgement received. Saved requires a fresh authorized read containing the exact original materialized effect and history.');
   if(intent.resolved){
    paragraph(box,intent.resolved==='cost_command_absent'?'The original key is durably absent and retired. No saved effect is claimed.':'The original command is fenced. No saved effect is claimed.');
    button(box,'cost-dismiss','Dismiss absent or fenced result',()=>{if(writing)return;intent=null;pending=[];hide();recoveryStamp='';recover();lock();void refresh();},writing);
   }else{
    if(intent.input.command)button(box,'cost-retry','Retry original command',()=>void perform('command'),writing);
    button(box,'cost-reconcile','Recover original command',()=>void perform('reconcile'),writing);
   }
   recovery.append(box);
  }else if(pending.length){
   const box=section('Recover original command');paragraph(box,'Current actor-owned pending IDs only. The original envelope is unavailable after a page reload; an acknowledgement alone will not be labelled Saved.');
   for(const p of pending){paragraph(box,'Pending command ID: '+p.command_id);button(box,'cost-pending-'+p.command_id,'Recover original command',()=>{if(writing||intent||!selection)return;intent={input:freeze({...scope(selection),command_id:p.command_id}),ack:null,resolved:null};void perform('reconcile');},writing);}recovery.append(box);
  }
  restoreFocus(focus);
 }
 function materialized(v,i){
  if(!i?.ack||!i.input.command||v.status!=='cost_view'||key(v.scope)!==key(i.input)||v.version<i.ack.version)return false;
  const c=i.input.command,p=c.payload;
  if(i.ack.command_id!==c.command_id||i.ack.version!==c.expected_version+1)return false;
  if(c.action==='OpenComparison')return v.comparison?.fixture_id==='comparison-v1';
  if(c.action==='CaptureAttempt'){
   const a=v.attempts.find(x=>x.attempt_id===p.attempt_id&&x.job_id===p.job_id);
   const e=v.entries.find(x=>x.entry_id===c.command_id);
   return !!a&&!!e&&e.owner==='direct'&&e.kind==='usage'&&same(e.source_pin,c.source_pin)&&same(e.payload,{entry_id:c.command_id,attempt_id:p.attempt_id,supersedes_entry_id:null,input_tokens:null,output_tokens:null,cash_state:'unknown',cash_micro_usd:null,rate:null});
  }
  const e=v.entries.find(x=>x.entry_id===p.entry_id);
  return !!e&&same(e.payload,p)&&same(e.source_pin,c.source_pin)&&e.supersedes_entry_id===p.supersedes_entry_id;
 }
 async function perform(method){
  if(writing||!visible()||!intent||!selection||key(selection)!==key(intent.input)||intent.resolved)return;
  const original=intent,seq=sequence,op=++operation;writing=true;error.textContent='';hide();recover();lock();
  try{
   const input=method==='command'?original.input:{...scope(original.input),command_id:original.input.command?.command_id??original.input.command_id};
   const r=await call(method,input);
   if(!visible()||seq!==sequence||op!==operation||intent!==original)return;
   if(original.input.command&&r.status!=='cost_command_absent'&&r.version!==original.input.command.expected_version+1)throw Error();
   if(r.status==='acknowledged')original.ack=r;
   else if(['cost_command_absent','cost_command_fenced'].includes(r.status))original.resolved=r.status;
   status.textContent=r.status==='retryable_unacknowledged'?'Original command remains unacknowledged. Retry or recover it explicitly.':original.resolved?'Original command resolved without a saved effect. Dismiss explicitly.':'Acknowledgement received; checking exact materialized history…';
  }catch(e){
   if(seq!==sequence||op!==operation||!visible())return;
   if([401,403].includes(e?.status)){denied();return;}
   status.textContent=e?.status===409?'Source or version conflict. The original operation has not been retargeted. Recover its original key.':'Original outcome unavailable. Retry or recover the original command explicitly.';
   error.textContent='No saved effect is confirmed.';
  }finally{
   if(op===operation){writing=false;recoveryStamp='';recover();lock();if(visible())void refresh();}
  }
 }
 function send(action,payload){
  if(!visible()||writing||intent||pending.length||!view||!selection)return;
  const command={command_id:newId(),expected_version:view.version,source_pin:view.source.pin,action,payload};
  intent={input:freeze({...scope(selection),command}),ack:null,resolved:null};void perform('command');
 }
 function showPool(parent,title,p){
  const s=section(title);paragraph(s,'Invented estimate subtotal: '+p.known_estimated_micro_usd+' micro-USD (USD '+(p.known_estimated_micro_usd/1000000).toFixed(6)+').');
  paragraph(s,'Unpaid synthetic minutes: '+p.known_minutes+'. These minutes are never wages. Recorded unknown minutes: '+p.unknown_minutes_n+'. Unknown cash sources: '+p.unknown_cash_n+'.');
  paragraph(s,p.complete?'Bounded invented inventory complete. This is not completeness of actual expenditure.':'Bounded inventory incomplete; unknown and missing records remain unknown.');
  const d=element('details',null);d.append(element('summary','Inspect missing coverage'),element('pre',JSON.stringify({missing_cash_sources:p.missing_cash_sources,missing_stages:p.missing_stages},null,2)));s.append(d);parent.append(s);
 }
 function render(next,confirmed=false){
  if(!visible())return;
  if(next.status==='cost_pending'){hide();pending=next.pending;status.textContent='Confirmation pending. Private figures are hidden; no saved effect is confirmed.';recover();lock();return;}
  pending=[];
  if(intent){hide();recover();lock();return;}
  const nextStamp=canon(next);
  if(stamp===nextStamp&&view){recover();lock();return;}
  const sourceChanged=!!view&&pinKey(view)!==pinKey(next),focus=focusState();
  // Never copy unsent controls across an inventory/version change. An unchanged
  // poll returns above and leaves the actual input nodes, focus and caret intact.
  view=next;stamp=nextStamp;container.replaceChildren();
  const liveSource=section('Live source metadata');
  paragraph(liveSource,'Classification: synthetic-unsettled-fixture. Source availability: '+next.source.availability+'. Actual provider usage, actual cash, dispatch outcome, failure class and latency remain unknown where no source field establishes them.');
  paragraph(liveSource,'Household ID: '+next.scope.household_id+' · Request ID: '+next.scope.request_id+' · Scope version: '+next.scope.scope_version+' · Intent cursor: '+next.version+'.');
  const c=next.summary.attempt_coverage;
  paragraph(liveSource,'Current source attempts: '+c.source_attempt_n+'; historical captured attempts: '+c.captured_attempt_n+'; current missing captures: '+c.missing_attempt_ids.length+'. Failed: '+c.failed_n+'; cancelled: '+c.cancelled_n+'; uncertain: '+c.uncertain_n+'; unsupported: '+c.unsupported_n+'. These source counts and historical captures may cover different populations.');
  liveSource.append(element('pre',JSON.stringify(next.source,null,2)));
  for(const a of next.attempts){const d=element('details',null);d.append(element('summary','Captured attempt '+a.attempt_id+' · '+a.state),element('pre',JSON.stringify(a,null,2)));liveSource.append(d);}container.append(liveSource);
  const capture=section('Capture eligible attempt metadata');
  paragraph(capture,'Failures, cancellation, unsupported and uncertain outcomes are eligible too. Capturing creates an unknown usage base, never proof of a provider call or charge. Enter the matching job ID from your mock-generation record. Only an existing job and attempt pair can be captured.');
  const missing=next.source.capturable_attempt_ids.filter(id=>!next.attempts.some(a=>a.attempt_id===id));
  if(missing.length){
   const {f,set}=form(capture,'cost-capture-form','Eligible capture');const attempt=choice(set,'cost-capture-attempt','Eligible attempt ID',missing.map(x=>[x,x]));
   const job=field(set,'cost-capture-job','Existing job ID for this attempt (canonical UUID)',{pattern:'[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'});job.required=true;job.maxLength=36;
   submit(f,set,'cost-capture','Capture unknown attempt base',()=>{if(!uuid(job.value)||!missing.includes(attempt.value))throw Error();send('CaptureAttempt',{job_id:job.value,attempt_id:attempt.value});});
  }else paragraph(capture,'No currently eligible uncaptured attempt IDs. Blocked jobs cannot be captured.');container.append(capture);
  const leaf=identity=>next.entries.find(e=>e.source_identity===identity&&e.is_current);
  const usage=section('Correct invented attempt estimate');
  paragraph(usage,'Blank token or amount fields explicitly mean unknown. Enter 0 for known synthetic zero. Invented toy rate 3/7 means 3 input and 7 output micro-USD per token; it is not a provider price.');
  if(next.attempts.length){
   const {f,set}=form(usage,'cost-usage-form','Usage correction');const attempt=choice(set,'cost-usage-attempt','Captured attempt ID',next.attempts.map(a=>[a.attempt_id,a.attempt_id+' · '+a.state]));
   const input=field(set,'cost-input-tokens','Invented input tokens (blank = unknown)',{type:'number',max:1000000000});
   const output=field(set,'cost-output-tokens','Invented output tokens (blank = unknown)',{type:'number',max:1000000000});
   const amount=field(set,'cost-usage-cash','Invented cash micro-USD (blank = unknown; 0 = known synthetic zero)',{type:'number',max:1000000000000});
   const rate=field(set,'cost-toy-rate','Use invented toy rate 3/7, never a provider rate',{type:'checkbox'});
   function load(){const p=leaf('usage/'+attempt.value)?.payload;input.value=p?.input_tokens??'';output.value=p?.output_tokens??'';amount.value=p?.cash_micro_usd??'';rate.checked=p?.rate!==null&&!!p?.rate;}
   attempt.addEventListener('change',load);load();
   submit(f,set,'cost-usage','Correct invented estimate',()=>{
    const prior=leaf('usage/'+attempt.value);if(!prior)throw Error();const i=quantity(input,1000000000),o=quantity(output,1000000000);let cash=quantity(amount,1000000000000);
    if(rate.checked){if(i===null||o===null)throw Error();cash=3*i+7*o;if(cash>1000000000000)throw Error();}
    send('RecordAttemptUsage',{entry_id:newId(),attempt_id:attempt.value,supersedes_entry_id:prior.entry_id,input_tokens:i,output_tokens:o,cash_state:cash===null?'unknown':'estimated',cash_micro_usd:cash,rate:rate.checked?toy:null});
   });
  }else paragraph(usage,'Capture an eligible attempt before entering or correcting usage.');container.append(usage);
  showPool(container,'Live direct production',next.summary.direct);
  const scenario=section('Separate fictional comparison only');
  paragraph(scenario,'Fixed invented population: G1 fictional-settled (sample 1); G2 and G3 fictional-new (sample 2). I1 is stored once, referenced by G2/G3. These labels never classify the live source as settled. No deliveries exist.');
  if(!next.comparison)button(scenario,'cost-open-comparison','Open fixed fictional comparison',()=>send('OpenComparison',{fixture_id:'comparison-v1'}));
  else{
   paragraph(scenario,'Allocation denominator: closed fictional reference population G2/G3; reference N=2. Delivered referencing N=0; actual reuse share unavailable. Allocation is a derived view, never an additional cost.');
   const {f,set}=form(scenario,'cost-cash-form','Fictional comparison cash entry or correction');
   const line=choice(set,'cost-cash-line','Immutable fictional cash line and owner',Object.entries(ownerByLine).map(([l,o])=>[l,l+' → '+o]));
   const amount=field(set,'cost-scenario-cash','Invented micro-USD (blank = unknown; 0 = known synthetic zero)',{type:'number',max:1000000000000});
   const load=()=>{amount.value=leaf('comparison-v1/cash/'+line.value)?.payload.cash_micro_usd??'';};line.addEventListener('change',load);load();
   submit(f,set,'cost-scenario-cash-save','Record or correct invented estimate',()=>{const cash=quantity(amount,1000000000000),prior=leaf('comparison-v1/cash/'+line.value);send('RecordScenarioCash',{entry_id:newId(),owner:ownerByLine[line.value],line:line.value,supersedes_entry_id:prior?.entry_id??null,cash_state:cash===null?'unknown':'estimated',cash_micro_usd:cash});});
   scenario.append(element('pre',JSON.stringify(next.comparison,null,2)));
  }
  container.append(scenario);
  const time=section('Unpaid stage minutes');paragraph(time,'Minutes are explicitly invented whole unpaid minutes. Blank = unknown; 0 = known synthetic zero. Four slots represent separate invented activities. Assets can belong to direct work or I1; player_engineering can belong to I1. Provider latency never fills labour time.');
  const {f,set}=form(time,'cost-time-form','Time entry or correction');
  const owner=choice(set,'cost-time-owner','Immutable time owner',(next.comparison?['direct','G1','G2','G3','I1']:['direct']).map(x=>[x,x==='direct'?'Live direct production':x+' · fictional comparison']));
  const stage=choice(set,'cost-time-stage','Stage',stages.map(x=>[x,x]));const slot=choice(set,'cost-time-slot','Non-overlapping invented activity slot',['1','2','3','4'].map(x=>[x,x]));
  const minutes=field(set,'cost-minutes','Unpaid synthetic minutes (blank = unknown; 0 = known synthetic zero)',{type:'number',max:525600});
  const timeIdentity=()=>'time/'+owner.value+'/'+stage.value+'/'+slot.value;
  const loadTime=()=>{minutes.value=leaf(timeIdentity())?.payload.minutes??'';};for(const e of [owner,stage,slot])e.addEventListener('change',loadTime);loadTime();
  submit(f,set,'cost-time','Record or correct unpaid minutes',()=>{const n=quantity(minutes,525600),prior=leaf(timeIdentity());send('RecordStageTime',{entry_id:newId(),owner:owner.value,stage:stage.value,slot:Number(slot.value),supersedes_entry_id:prior?.entry_id??null,minutes:n,payment_status:'unpaid',basis:n===null?'unknown':'synthetic'});});container.append(time);
  showPool(container,'Fictional comparison direct',next.summary.comparison_direct);showPool(container,'Fictional investment I1 · counted once',next.summary.investment);showPool(container,'Fictional scenario total · direct plus I1 once',next.summary.scenario_total);
  if(next.summary.allocation){const allocation=section('Derived fictional allocation');paragraph(allocation,'Closed-reference-population assumption: G2/G3, denominator 2; sample settled 1 / new 2; delivered referencing 0; actual reuse share unavailable. Incomplete inputs remain incomplete. These shares do not add to scenario totals.');allocation.append(element('pre',JSON.stringify(next.summary.allocation,null,2)));container.append(allocation);}
  const history=section('Immutable correction history');paragraph(history,'Superseded records remain inspectable; only current leaves contribute to totals. Source edits do not erase acknowledged history.');
  for(const e of next.entries){const d=element('details',null);d.append(element('summary',e.source_identity+' · '+(e.is_current?'current':'superseded')+' · '+e.entry_id),element('pre',JSON.stringify(e,null,2)));history.append(d);}container.append(history);
  const denominator=section('No delivered-game denominator');paragraph(denominator,'Delivered unique game N=0. Cost per delivered game: unavailable. Valued labour: unavailable. Unpaid minutes are never wages. No actual cost, capacity or affordability claim follows.');container.append(denominator);
  if(sourceChanged)status.textContent='Source pin changed. Unsent controls were cleared. No original operation was retargeted.';
  else status.textContent=confirmed?'Saved: the exact original effect is present in fresh authorized history.':'Current authorized synthetic state. Unknown values remain unknown.';
  if(!sourceChanged)restoreFocus(focus);recover();lock();
 }
 async function refresh(){
  if(!visible()||reading||writing)return;reading=true;const seq=sequence,selected=selection?scope(selection):null,selectedKey=key(selected);
  const current=()=>visible()&&seq===sequence&&key(selection)===selectedKey;
  try{
   const list=await call('list',{});if(!current())return;setRows(list.requests);
   if(!selected){recover();lock();return;}
   if(!list.requests.some(s=>key(s)===selectedKey)){loseScope();return;}
   const next=await call('read',selected);if(!current())return;
   // Read may have been held across withdrawal. Obtain fresh list authority
   // AFTER that response, before revealing any of its private projection.
   const fresh=await call('list',{});if(!current())return;setRows(fresh.requests);
   if(!fresh.requests.some(s=>key(s)===selectedKey)){loseScope();return;}
   error.textContent='';let confirmed=false;
   if(intent&&key(intent.input)===selectedKey&&materialized(next,intent)){intent=null;confirmed=true;recoveryStamp='';}
   else if(intent?.ack&&!intent.input.command&&key(intent.input)===selectedKey&&next.status==='cost_view'&&next.version>=intent.ack.version){intent=null;recoveryStamp='';status.textContent='Acknowledgement received. Original envelope unavailable; inspect authorized history. No exact Saved confirmation is claimed.';render(next);status.textContent='Acknowledgement received. Original envelope unavailable; inspect authorized history. No exact Saved confirmation is claimed.';return;}
   render(next,confirmed);
  }catch(e){
   if(!current())return;
   if([401,403].includes(e?.status)){denied();return;}
   hide();recoveryStamp='';recover();lock();error.textContent='Current authorized state unavailable. Private figures and unsent controls are hidden.';
   if(e?.status===409)status.textContent='Source or scope conflict. The original command, if held, remains unchanged.';
  }finally{if(seq===sequence)reading=false;}
 }
 select.addEventListener('change',()=>{
  const next=rows.find(s=>key(s)===select.value);invalidate();pending=[];selection=next?scope(next):null;error.textContent='';status.textContent='Reading selected scope…';recover();lock();void refresh();
 });
 $('cost-check').addEventListener('click',()=>void refresh());
 function conceal(){invalidate();pending=[];selection=null;rows=[];select.replaceChildren(element('option','Choose a request',{value:''}));error.textContent='';status.textContent='Private details hidden. Select a current scope after returning.';lock();}
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')conceal();else void refresh();});
 window.addEventListener('pagehide',()=>{live=false;conceal();clearInterval(timer);timer=null;});
 window.addEventListener('pageshow',()=>{if(!live){live=true;timer=setInterval(()=>void refresh(),1500);}void refresh();});
 timer=setInterval(()=>void refresh(),1500);void refresh();
}
export const costScript=`(${costBrowser.toString()})(${createCostClient.toString()});`;
