import React, {useCallback, useEffect, useRef, useState} from 'react';
import './loop-adult-access.css';

type Phase='loading'|'request'|'check-inbox'|'invalid-link'|'restricted'|'error'|'signed-out';
type Scope={adultId:string;householdId:string};
type Reply={status?:string;adultId?:string;householdId?:string;restricted?:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function api(path:string,payload?:object):Promise<Reply> {
  const response=await fetch('/adult/'+path,{
    method:payload===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',
    headers:payload===undefined?undefined:{'Content-Type':'application/json'},
    body:payload===undefined?undefined:JSON.stringify(payload),
  });
  if (!response.ok) throw Error('Local access unavailable');
  return response.json();
}
function scopeOf(reply:Reply):Scope|null {
  return reply.status==='restricted' && reply.restricted===true && typeof reply.adultId==='string'
    && typeof reply.householdId==='string' && uuid.test(reply.adultId) && uuid.test(reply.householdId)
    ? {adultId:reply.adultId,householdId:reply.householdId}:null;
}

export default function LoopAdultAccess() {
  const [phase,setPhase]=useState<Phase>('loading');
  const [scope,setScope]=useState<Scope|null>(null);
  const [purpose,setPurpose]=useState<'join'|'recover'>('join');
  const [email,setEmail]=useState('');
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [cooldown,setCooldown]=useState(false);
  const [message,setMessage]=useState('Checking the local server session…');
  const revision=useRef(0),mounted=useRef(false),working=useRef(false),suppressRestore=useRef(false);
  const pendingEmail=useRef('');
  const queue=useRef<Promise<unknown>>(Promise.resolve());
  const statusRef=useRef<HTMLParagraphElement>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const enqueue=useCallback(<T,>(work:()=>Promise<T>):Promise<T>=>{
    const next=queue.current.then(work,work);
    queue.current=next.catch(()=>undefined);
    return next;
  },[]);
  const current=(id:number)=>mounted.current && revision.current===id;
  const announce=(next:Phase,text:string)=>{setPhase(next);setMessage(text);};
  const focusStatus=()=>{requestAnimationFrame(()=>{if(mounted.current)statusRef.current?.focus();});};
  const clearInputs=()=>{setEmail('');setCode('');};

  const revalidate=useCallback(async()=>{
    if (!mounted.current || working.current) return;
    const id=++revision.current;
    setScope(null);
    try {
      const result=await enqueue(async()=>{
        // A passive check must not revoke a newer session shared by another tab.
        if (suppressRestore.current) return {status:'signed_out'};
        return api('session');
      });
      if (!current(id)) return;
      const identity=scopeOf(result);
      if (identity) {
        setScope(identity);pendingEmail.current='';setEmail('');setCode('');
        setPhase('restricted');setMessage('Restricted local account only. All child features are unavailable.');
      } else {
        setPhase(previous=>['check-inbox','invalid-link','request'].includes(previous)?previous:'signed-out');
        setMessage(previous=>previous==='Checking the local server session…'?'Signed out. Request a synthetic test link to continue.':previous);
      }
    } catch {
      if (current(id)) {setScope(null);setPhase('error');setMessage('The local server could not confirm access. No verification is confirmed. Retry or return to the request form.');}
    }
  },[enqueue]);

  useEffect(()=>{
    mounted.current=true;
    void revalidate();
    const check=()=>{if(document.visibilityState!=='hidden')void revalidate();};
    window.addEventListener('focus',check);window.addEventListener('pageshow',check);
    document.addEventListener('visibilitychange',check);
    return ()=>{
      mounted.current=false;++revision.current;pendingEmail.current='';clearTimeout(timer.current);
      window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);
      document.removeEventListener('visibilitychange',check);
    };
  },[revalidate]);
  useEffect(()=>{
    if (phase!=='restricted') return;
    const interval=setInterval(()=>void revalidate(),15000);
    return ()=>clearInterval(interval);
  },[phase,revalidate]);

  function back() {
    ++revision.current;setScope(null);clearInputs();pendingEmail.current='';
    setBusy(false);setCooldown(false);clearTimeout(timer.current);
    announce('request','Use an invented address under example.invalid.');focusStatus();
  }
  async function send(resend=false) {
    if (working.current) return;
    const address=(resend?pendingEmail.current:email).trim().toLowerCase();
    if (address.length>80 || !/^[a-z0-9][a-z0-9._+-]{0,63}@example\.invalid$/.test(address)) {
      clearInputs();announce('error','Use only an invented address under the exact example.invalid domain.');focusStatus();return;
    }
    const id=++revision.current;
    working.current=true;setBusy(true);setScope(null);clearInputs();pendingEmail.current=address;
    setMessage('Requesting a local test code…');
    try {
      const reply=await enqueue(()=>api('request',{email:address,purpose}));
      if (!current(id)) return;
      if(reply.status!=='check_inbox') throw Error();
      announce('check-inbox','Check the trusted developer fixture. If eligible, it captured a test code. No email was sent.');
      setCooldown(true);clearTimeout(timer.current);
      // Presentation delay only; the persistent server policy is authoritative.
      timer.current=setTimeout(()=>{if(mounted.current)setCooldown(false);},1000);
      focusStatus();
    } catch {
      if(current(id)){announce('error','The local request could not be confirmed. No email was sent. Return to the request form or ask the developer for help.');focusStatus();}
    } finally {working.current=false;if(current(id))setBusy(false);}
  }
  async function verify() {
    if(working.current)return;
    const entered=code;setCode('');
    const id=++revision.current;working.current=true;setBusy(true);setScope(null);
    setMessage('Checking the test code…');
    try {
      const result=await enqueue(async()=>{
        const reply=await api('verify',{token:entered});
        if(!current(id)) {
          if(reply.status==='verified')await api('logout',{});
          return null;
        }
        if(reply.status!=='verified')return reply;
        const confirmed=await api('session');
        if(!current(id)){await api('logout',{});return null;}
        return confirmed;
      });
      if(!current(id) || !result)return;
      const identity=scopeOf(result);
      if(identity){
        suppressRestore.current=false;setScope(identity);pendingEmail.current='';clearInputs();
        announce('restricted','Restricted local account only. All child features are unavailable.');
      } else {
        announce('invalid-link','This test link cannot be used. It may be invalid or no longer available. Request another code or ask the developer for support.');
      }
      focusStatus();
    } catch {
      if(current(id)){setScope(null);announce('error','Verification could not be confirmed by the local server. Return to the request form and retry; no access is assumed.');focusStatus();}
    } finally {working.current=false;if(current(id))setBusy(false);}
  }
  async function signOut() {
    const id=++revision.current;suppressRestore.current=true;
    setScope(null);clearInputs();pendingEmail.current='';setBusy(true);
    announce('signed-out','Signing out of the local test…');
    try {
      await enqueue(()=>api('logout',{}));
      if(current(id)){announce('signed-out','Signed out of the local test.');focusStatus();}
    } catch {
      if(current(id)){announce('error','Local sign-out could not be confirmed. Account details are cleared here. Retry sign out before leaving this shared browser.');focusStatus();}
    } finally {if(current(id))setBusy(false);}
  }
  const hasCodePanel=['check-inbox','invalid-link'].includes(phase);
  const requestPanel=['request','signed-out','error'].includes(phase);
  return <main className="loop-adult" data-testid="adult-root"
    data-adult-id={phase==='restricted'?scope?.adultId:undefined}
    data-household-id={phase==='restricted'?scope?.householdId:undefined} aria-labelledby="adult-title">
    <p className="loop-adult-label">Local synthetic test</p>
    <h1 id="adult-title">Test adult access</h1>
    <p>Invented addresses only. This test establishes no real age, parental authority, consent or public admission. All child features are unavailable.</p>
    <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true"
      data-testid="adult-status" data-phase={phase} className="loop-adult-status">{message}</p>
    {requestPanel && <form onSubmit={event=>{event.preventDefault();void send();}} aria-busy={busy}>
      <fieldset disabled={busy}><legend>{purpose==='recover'?'Recover access':'Join'}</legend>
        <label htmlFor="adult-email">Invented email address</label>
        <input id="adult-email" type="email" autoComplete="off" spellCheck={false} maxLength={80}
          required value={email} placeholder="invented@example.invalid" onChange={event=>setEmail(event.target.value)}/>
        <p id="adult-email-help">Use only the exact example.invalid domain. No real email is sent.</p>
        <button type="submit">Send test link</button>
        <button type="button" onClick={()=>{setPurpose(purpose==='join'?'recover':'join');clearInputs();pendingEmail.current='';}}>
          {purpose==='join'?'Recover access':'Join'}
        </button>
      </fieldset>
    </form>}
    {hasCodePanel && <section aria-labelledby="adult-code-title">
      <h2 id="adult-code-title">Check the developer fixture</h2>
      <p>A trusted developer hands you the captured code directly. There is no inbox API or external delivery channel.</p>
      <form onSubmit={event=>{event.preventDefault();void verify();}} aria-busy={busy}>
        <label htmlFor="adult-code">Test link code</label>
        <input id="adult-code" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={128}
          required value={code} onChange={event=>setCode(event.target.value)} disabled={busy}/>
        <button type="submit" disabled={busy}>Verify test link</button>
      </form>
      <button type="button" disabled={busy || cooldown || !pendingEmail.current} onClick={()=>void send(true)}>Resend test link</button>
      {cooldown && <p>Resend pause active. Server limits may still apply after this pause.</p>}
      <button type="button" onClick={back}>Back to request</button>
    </section>}
    {phase==='restricted' && scope && <section aria-labelledby="adult-account-title">
      <h2 id="adult-account-title">Restricted account status</h2>
      <p>The invented account has a restricted local session. Recovery replaces older sessions, including in other tabs.</p>
      <p>No child information, private play, consent, trial or booking is available.</p>
      <button type="button" onClick={()=>void signOut()} disabled={busy}>Sign out</button>
    </section>}
    {phase==='error' && <div className="loop-adult-actions">
      <button type="button" onClick={back}>Back to request</button>
      <button type="button" onClick={()=>void revalidate()} disabled={busy}>Retry session check</button>
      <button type="button" onClick={()=>void signOut()} disabled={busy}>Sign out</button>
      <p>Support: ask the developer running this local fixture. Do not share real addresses or family information.</p>
    </div>}
    {phase==='loading' && <button type="button" onClick={back}>Back to request</button>}
    <p><a href="/loop-preview">Back to local preview</a></p>
  </main>;
}
