export const journeyPage=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TEST journey readiness and activity</title><link rel="stylesheet" href="/founder/journey.css"><main><h1>TEST journey readiness and activity</h1><p>LOCAL SYNTHETIC ONLY. Invented identities, fixed toy output and deliberate TEST checks. No real content, privacy or human endorsement.</p><nav><a href="/founder">Founder home</a> · <a href="/founder/queue">Accept requests</a> · <a href="/founder/generation">Mock generation</a> · <a href="/founder/review">Deliberate TEST review and snapshot</a></nav><p>First accept, generate, inspect the exact source and complete the TEST review workbench. Nothing here automatically approves or makes content ready.</p><button id="refresh" type="button">Check current requests</button><p id="status" role="status"></p><div id="requests"></div><section id="detail"></section><section id="activity"></section></main><script src="/founder/journey.js" defer></script></html>`;
export const journeyCSS=`body{font:17px/1.5 system-ui;max-width:960px;margin:auto;padding:24px;background:#f4f5ee;color:#183c38}button,select{font:inherit;margin:8px;padding:10px}section{margin:20px 0;padding:16px;border:1px solid #a9c2b6}pre{white-space:pre-wrap;overflow-wrap:anywhere}button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid #a96500}label{display:block}`;
export const journeyScript=`(()=>{
'use strict';
const $=id=>document.getElementById(id);let epoch=0,current=null,intent=null;
const element=(tag,text,parent)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.append(e);return e;};
const button=(text,parent,work)=>{const b=element('button',text,parent);b.type='button';b.addEventListener('click',()=>void work());return b;};
function clear(){++epoch;current=null;intent=null;for(const id of ['requests','detail','activity'])$(id).replaceChildren();}
async function post(name,body){const r=await fetch('/founder/journey/'+name,{method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok){if(r.status===401||r.status===403)clear();throw Error(r.status===503?'Unavailable or history gap; no activity is inferred.':'Access or command unavailable.');}return r.json();}
async function run(work){try{await work();}catch(e){$('status').textContent=e.message;}}
async function load(scope){const id=++epoch;$('detail').replaceChildren();$('activity').replaceChildren();$('status').textContent='Checking exact current source…';const v=await post('read',scope);if(id!==epoch||document.visibilityState==='hidden')return;current=v;render(v);$('status').textContent='Current TEST source checked. No readiness action was performed.';}
function render(v){
 const root=$('detail');root.replaceChildren();element('h2','Exact request and TEST snapshots',root);
 element('p','Original child words: '+(v.review.request?.original_question??'Unavailable'),root);
 element('p','Fixed deterministic balance/tips toy. An unrelated question remains a mismatch; this is not a science answer.',root);
 if(v.review.status!=='review_view'){element('p','Review confirmation pending. Recover the original review command in its workbench.',root);return;}
 const snapshots=v.review.snapshots.filter(s=>!s.withdrawn),label=element('label','Select an inspected, deliberately released TEST snapshot',root),select=element('select',undefined,label);
 for(const s of snapshots){const option=element('option',s.snapshot_id+' · revision '+s.revision_id,select);option.value=s.snapshot_id;}
 if(!snapshots.length)element('p','No usable TEST snapshot. Complete the review workbench first.',root);
 button('Make selected TEST snapshot privately ready',root,()=>run(async()=>{
  if(!select.value)throw Error('Choose an actual TEST snapshot.');if(!intent)intent={...v.scope,snapshot_id:select.value,command_id:crypto.randomUUID()};
  if(intent.snapshot_id!==select.value)throw Error('Recover the original readiness command before selecting another snapshot.');
  const id=epoch,r=await post('ready',intent);if(id!==epoch)return;$('status').textContent=r.status==='acknowledged'?'Private readiness acknowledged; notification not attempted.':'Pending, not confirmed. Keep the original command and check/reconcile it.';await refreshDetail(v.scope);
 }));
 for(const [name,text]of [['status','Check original readiness command'],['reconcile','Reconcile original readiness command']])button(text,root,()=>run(async()=>{const key=intent?.command_id??v.ready?.command_id;if(!key)throw Error('No readiness command is known.');const id=epoch,r=await post(name,{...v.scope,command_id:key});if(id!==epoch)return;$('status').textContent=r.status;await refreshDetail(v.scope);}));
 if(v.ready)element('p','Readiness: '+v.ready.status+' · available: '+v.ready.available+' · original ready time '+v.ready.ready_at+' · delivery '+v.ready.delivery_state,root);
 if(v.activity_input)button('Read actual confirmed play activity',root,()=>run(async()=>{
  const id=++epoch;$('activity').replaceChildren();const a=await post('activity',v.activity_input);if(id!==epoch||document.visibilityState==='hidden')return;
  const out=$('activity');element('h2','Actual server activity · incomplete play',out);element('p','Revision '+a.revision_id+' · play '+(a.play_id??'not started'),out);
  element('p','State: '+a.state+' · action watermark '+a.watermark.action_sequence+' · event watermark '+a.watermark.event_sequence,out);
  element('p','Time provenance: SERVER-ACCEPTED. Client clock is not chronology. Start: '+(a.start_at??'unavailable')+' ('+a.start_time_source+').',out);
  element('p','Help: '+a.help+'. No learning, completion, mastery or aha is inferred.',out);
  if(a.pending.length)element('p','Pending / unacknowledged history exists. This read never acknowledges or repairs it.',out);
  if(!a.events.length)element('p','No confirmed action events available. This does not imply no pending work.',out);
  for(const e of a.events){const item=element('section',undefined,out);element('h3',e.event_type,item);element('p','Event '+e.sequence+' · action '+e.action_sequence+' · revision '+e.revision_id,item);const time=element('time',e.server_at+' · SERVER-ACCEPTED',item);time.dateTime=e.server_at;element('pre',JSON.stringify(e.data,null,2),item);}
 }));
}
async function refreshDetail(s){const id=epoch,v=await post('read',s);if(id!==epoch)return;current=v;render(v);}
$('refresh').addEventListener('click',()=>run(async()=>{clear();const id=epoch,v=await post('list',{});if(id!==epoch)return;for(const s of v.requests)button('Open request '+s.request_id,$('requests'),()=>run(()=>load(s)));$('status').textContent=v.requests.length?'Choose the same accepted request.':'No current accepted requests available.';}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){clear();$('status').textContent='Private view cleared. Check current requests again when you return.';}});window.addEventListener('pagehide',clear);
})();`;
