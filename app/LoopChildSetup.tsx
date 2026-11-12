import React,{useCallback,useEffect,useRef,useState} from 'react';
import './loop-child-setup.css';
type Input={nickname:string;age:number;calibration:{reads:string;counts_to_20:boolean|'not-sure';challenge:string}};
type Child={child_id:string;profile_version:number;is_initial:boolean;profile:Input&{starting_path:'slow'|'medium'|'fast'}};
type Snapshot={state:string;setup_context?:string;children?:Child[]};
type Draft={nickname:string;age:string;reads:string;counts:string;challenge:string};
const empty=():Draft=>({nickname:'',age:'',reads:'',counts:'',challenge:''});
async function api(path:string,payload?:object){
 const r=await fetch('/adult/'+path,{method:payload===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:payload===undefined?undefined:{'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
 if(!r.ok)throw Error('Request could not be confirmed');return r.json();
}
export default function LoopChildSetup(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[draft,setDraft]=useState<Draft>(empty),[editing,setEditing]=useState<Child|null>(null),[adding,setAdding]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[required,setRequired]=useState(false),[contact,setContact]=useState(false),[story,setStory]=useState(false),[declined,setDeclined]=useState(false),[withdrawal,setWithdrawal]=useState(false);
 const live=useRef(false),revision=useRef(0),working=useRef(false),fence=useRef(''),current=useRef<Snapshot|null>(null),target=useRef<Child|null>(null),pending=useRef<object|null>(null),withdrawing=useRef(false);
 const clear=useCallback(()=>{setDraft(empty());setEditing(null);target.current=null;setAdding(false);pending.current=null;},[]);
 const refresh=useCallback(async()=>{
  if(!live.current||working.current||withdrawing.current)return;
  const id=++revision.current;
  try{
   const next:Snapshot=await api('setup');if(!live.current||id!==revision.current)return;
   const nextFence=next.setup_context??'';
   const selected=target.current;
   const changed=nextFence!==fence.current || Boolean(selected&&!next.children?.some(c=>c.child_id===selected.child_id&&c.profile_version===selected.profile_version));
   if(changed)clear();
   fence.current=nextFence;current.current=next;setSnapshot(next);
  }catch{if(live.current&&id===revision.current){fence.current='';current.current=null;setSnapshot(null);clear();setError('Access could not be confirmed. Sign in again or retry.');}}
 },[clear]);
 useEffect(()=>{
  live.current=true;void refresh();const check=()=>{if(document.visibilityState!=='hidden')void refresh();};
  const timer=setInterval(check,15000);window.addEventListener('focus',check);window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',check);
  return()=>{live.current=false;++revision.current;pending.current=null;clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);document.removeEventListener('visibilitychange',check);};
 },[refresh]);
 async function permission(){
  if(working.current||!required)return;working.current=true;setBusy(true);setError('');++revision.current;
  try{await api('consent',{command_id:crypto.randomUUID(),policy_version:'TEST-v1',required_service:true,optional_contact:contact,optional_story:story});if(live.current){setDeclined(false);setRequired(false);setContact(false);setStory(false);}}
  catch{if(live.current)setError('Test permission could not be confirmed. Retry when ready.');}
  finally{working.current=false;if(live.current){setBusy(false);await refresh();}}
 }
 async function withdraw(){
  if(working.current)return;working.current=true;withdrawing.current=true;++revision.current;setBusy(true);setWithdrawal(true);setSnapshot(null);current.current=null;clear();fence.current='';setError('');
  try{await api('consent/withdraw',{command_id:crypto.randomUUID(),policy_version:'TEST-v1'});if(live.current){withdrawing.current=false;setWithdrawal(false);}}
  catch{if(live.current)setError('Withdrawal is unconfirmed. Private details are hidden. Retry withdrawal.');}
  finally{working.current=false;if(live.current){setBusy(false);if(!withdrawing.current)await refresh();}}
 }
 function choose(child:Child|null){
  ++revision.current;pending.current=null;target.current=child;setEditing(child);setAdding(!child);setError('');
  setDraft(child?{nickname:child.profile.nickname,age:String(child.profile.age),reads:child.profile.calibration.reads,counts:String(child.profile.calibration.counts_to_20),challenge:child.profile.calibration.challenge}:empty());
 }
 async function save(retry=false){
  if(working.current||withdrawing.current)return;
  const context=fence.current;if(!context)return;
  if(!retry){
   const profile:Input={nickname:draft.nickname,age:Number(draft.age),calibration:{reads:draft.reads,counts_to_20:draft.counts==='not-sure'?'not-sure':draft.counts==='true',challenge:draft.challenge}};
   pending.current=editing?{command_id:crypto.randomUUID(),setup_context:context,operation:'correct',child_id:editing.child_id,expected_profile_version:editing.profile_version,profile}:{command_id:crypto.randomUUID(),setup_context:context,operation:'create',initial:current.current?.state==='setup_required',profile};
  }
  const command=pending.current;if(!command)return;working.current=true;setBusy(true);const id=++revision.current;setError('');
  try{
   // Reconcile authority before sending the original immutable intent, including retries.
   const before:Snapshot=await api('setup');if(!live.current||id!==revision.current)return;
   if(before.setup_context!==context){fence.current=before.setup_context??'';current.current=before;setSnapshot(before);clear();throw Error();}
   await api('setup',command);
   const after:Snapshot=await api('setup');if(!live.current||id!==revision.current)return;
   current.current=after;fence.current=after.setup_context??'';setSnapshot(after);clear();
  }catch{if(live.current&&id===revision.current)setError('Save could not be confirmed. Retry checks the current permission before retrying this same change.');}
  finally{working.current=false;if(live.current&&id===revision.current)setBusy(false);}
 }
 const phase=withdrawal?'withdrawal-unconfirmed':snapshot?.state??'access-unconfirmed';
 const form=snapshot?.state==='setup_required'||snapshot?.state==='complete'&&(adding||editing);
 const update=(key:keyof Draft,value:string)=>setDraft(d=>({...d,[key]:value}));
 return <main className="loop-child" data-testid="child-setup-root">
  <p className="test-label">Local synthetic test · TEST-v1</p><h1>Set up an invented child</h1>
  <p>Invented families only. These test permissions do not establish real consent, age or parental authority.</p>
  <p role="status" data-testid="child-setup-status" data-phase={phase}>{error|| (phase==='complete'?'Saved child profiles are ready to view.':phase==='setup_required'?'Choose a starting point together.':phase==='permission_required'?'Test permission is required before entering child details.':phase==='setup_unavailable'?'Retained test information needs review. Setup is unavailable.':'Checking local access…')}</p>
  {error&&<button disabled={busy} onClick={()=>{if(withdrawal)void withdraw();else if(pending.current)void save(true);else{setError('');void refresh();}}}>Retry{withdrawal?' withdrawal':''}</button>}
  {snapshot?.state==='permission_required'&&!withdrawal&&<section><h2>Test permissions</h2><p>TEST-v1 records invented setup answers and starting settings in this local fixture. Real privacy review and deletion arrangements are still pending.</p>
   <label><input type="checkbox" checked={required} onChange={e=>setRequired(e.target.checked)} disabled={busy}/>Allow required test recording</label>
   <label><input type="checkbox" checked={contact} onChange={e=>setContact(e.target.checked)} disabled={busy}/>Optional test contact</label>
   <label><input type="checkbox" checked={story} onChange={e=>setStory(e.target.checked)} disabled={busy}/>Optional test story use</label>
   <button disabled={busy||!required} onClick={()=>void permission()}>Continue with test permission</button><button disabled={busy} onClick={()=>{setRequired(false);setContact(false);setStory(false);setDeclined(true);}}>Decline</button>
   {declined&&<p>No child profile was created. You can leave or choose test permission later.</p>}</section>}
  {snapshot?.state==='complete'&&!withdrawal&&<section><h2>Invented children</h2>{snapshot.children?.map(child=><article key={child.child_id}><h3>{child.profile.nickname}</h3><p>Age {child.profile.age} · {{slow:'Gentle start',medium:'Middle start',fast:'Bigger challenge'}[child.profile.starting_path]}</p><p>A starting point from parent answers. It can change; it is not a score or assessment.</p><button disabled={busy} onClick={()=>choose(child)}>Correct {child.profile.nickname}’s profile</button></article>)}<button disabled={busy} onClick={()=>choose(null)}>Add another child</button></section>}
  {form&&!withdrawal&&<form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy||Boolean(error&&pending.current)}><legend>{editing?'Correct profile':adding?'Add another invented child':'First invented child'}</legend>
   <label>Nickname<input required maxLength={24} pattern="[A-Za-z]([A-Za-z '-]*[A-Za-z])?" autoComplete="off" value={draft.nickname} onChange={e=>update('nickname',e.target.value)}/></label>
   <label>Age<select required value={draft.age} onChange={e=>update('age',e.target.value)}><option value="">Choose age</option>{[5,6,7,8].map(a=><option key={a}>{a}</option>)}</select></label>
   <label>Reading<select required value={draft.reads} onChange={e=>update('reads',e.target.value)}><option value="">Choose an answer</option><option value="independent">Reads independently</option><option value="with-help">Reads with help</option><option value="not-yet">Not yet</option><option value="not-sure">Not sure</option></select></label>
   <label>Counts to 20<select required value={draft.counts} onChange={e=>update('counts',e.target.value)}><option value="">Choose an answer</option><option value="true">Yes</option><option value="false">Not yet</option><option value="not-sure">Not sure</option></select></label>
   <label>Enjoys a challenge<select required value={draft.challenge} onChange={e=>update('challenge',e.target.value)}><option value="">Choose an answer</option><option value="gentle">Gentle</option><option value="some">Some challenge</option><option value="bigger">Bigger challenge</option><option value="not-sure">Not sure</option></select></label>
   <button type="submit">Save {editing?'correction':'invented child'}</button></fieldset>{snapshot?.state==='complete'&&<button type="button" disabled={busy} onClick={()=>{clear();setError('');}}>Cancel</button>}</form>}
  {snapshot?.setup_context&&!withdrawal&&<button disabled={busy} onClick={()=>void withdraw()}>Withdraw test permission</button>}
  <p><a href="/loop-preview/join">Local adult access</a> · <a href="/loop-preview">Back to local preview</a></p>
 </main>;
}
