// PRIVATE-READINESS-LOCAL-01. TEST-only, separately keyed review-v2 storage.
import {createHmac} from 'node:crypto';
import {ownData,ownMethod,privateKey,environmentSnapshot,canonical} from './continuation-journal.mjs';
import {createSyntheticReviewJournal} from './review-journal.mjs';
const brands=new WeakSet();
export const isSyntheticPrivateBridgeJournal=value=>brands.has(value);
const unavailable=()=>Object.assign(new Error('Local TEST bridge storage unavailable.'),{code:'journal_unavailable',status:503});
export async function createSyntheticPrivateBridgeJournal(input){
 const owned=new Set();let inner;
 const wipe=()=>{for(const b of owned)b.fill(0);owned.clear();};
 try{
  const o=ownData(input,['env','directory','keys'],['testHooks']);environmentSnapshot(o.env);
  ownData(o.keys,['keyForHousehold','keyForOperator']);
  const household=ownMethod(o.keys,'keyForHousehold'),operator=ownMethod(o.keys,'keyForOperator');
  // Trusted local test instrumentation only. The inner journal receives only its
  // existing beforeAppend hook. Neither observer can manufacture a success.
  let observe,afterSeal,beforeAppend;
  if(o.testHooks!==undefined){const h=ownData(o.testHooks,[],['beforeAppend','onDerivedKey','afterSeal']);for(const name of Object.keys(h))if(typeof h[name]!=='function')throw unavailable();observe=h.onDerivedKey;afterSeal=h.afterSeal;beforeAppend=h.beforeAppend;}
  function derive(value,domain){
   const key=privateKey(value);owned.add(key);
   try{observe?.(key,'provider-clone');const out=createHmac('sha256',key).update('private-readiness-local-01\0storage\0'+domain+'\0').digest();owned.add(out);observe?.(out,'derived-'+domain);return out;}
   finally{key.fill(0);owned.delete(key);}
  }
  try{inner=await createSyntheticReviewJournal({env:o.env,directory:o.directory,keys:{keyForHousehold:h=>derive(household(h),'household'),keyForOperator:()=>derive(operator(),'operator')},...(beforeAppend?{testHooks:{beforeAppend}}:{})});}finally{wipe();}
  const methods=Object.fromEntries(['seal','fact','append','records','claimFreshNamespace','close'].map(k=>[k,ownMethod(inner,k)]));
  let tail=Promise.resolve(),closing=false,closePromise;
  function operation(name,args){
   if(closing)return Promise.reject(unavailable());
   const result=tail.then(async()=>{try{const value=await methods[name](...args);if(name==='seal'&&afterSeal)await afterSeal();return value;}catch(e){if(e?.code)throw e;throw unavailable();}finally{wipe();}});
   tail=result.catch(()=>{});return result;
  }
  const snapshot=v=>JSON.parse(canonical(v));
  const journal=Object.freeze({namespace_verifier:inner.namespace_verifier,
   async seal(v){return operation('seal',[snapshot(v)]);},async fact(v){return operation('fact',[snapshot(v)]);},async append(v){return operation('append',[snapshot(v)]);},
   records:h=>operation('records',[h]),claimFreshNamespace:()=>operation('claimFreshNamespace',[]),
   close(){if(closePromise)return closePromise;closing=true;closePromise=tail.then(async()=>{try{await methods.close();}finally{wipe();}});return closePromise;}
  });
  brands.add(journal);return journal;
 }catch(e){try{await inner?.close();}finally{wipe();}throw e;}
}
