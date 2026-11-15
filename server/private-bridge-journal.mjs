// PRIVATE-READINESS-LOCAL-01. TEST-only, separately keyed review-v2 storage.
import {createHmac} from 'node:crypto';
import {ownData,ownMethod,privateKey,environmentSnapshot} from './continuation-journal.mjs';
import {createSyntheticReviewJournal} from './review-journal.mjs';
const brands=new WeakSet();
export const isSyntheticPrivateBridgeJournal=value=>brands.has(value);
export async function createSyntheticPrivateBridgeJournal(input){
 const owned=new Set();let inner;
 const wipe=()=>{for(const b of owned)b.fill(0);owned.clear();};
 try{
  const o=ownData(input,['env','directory','keys'],['testHooks']);environmentSnapshot(o.env);
  ownData(o.keys,['keyForHousehold','keyForOperator']);
  const household=ownMethod(o.keys,'keyForHousehold'),operator=ownMethod(o.keys,'keyForOperator');
  function derive(value,domain){const key=privateKey(value);try{const out=createHmac('sha256',key).update('private-readiness-local-01\0storage\0'+domain+'\0').digest();owned.add(out);return out;}finally{key.fill(0);}}
  try{inner=await createSyntheticReviewJournal({env:o.env,directory:o.directory,keys:{keyForHousehold:h=>derive(household(h),'household'),keyForOperator:()=>derive(operator(),'operator')},...(o.testHooks===undefined?{}:{testHooks:o.testHooks})});}finally{wipe();}
  const methods=Object.fromEntries(['seal','fact','append','records','claimFreshNamespace','close'].map(k=>[k,ownMethod(inner,k)]));
  let tail=Promise.resolve(),closing=false,closePromise;
  function operation(name,args){if(closing)return Promise.reject(Object.assign(new Error('Local TEST bridge storage unavailable.'),{code:'journal_unavailable',status:503}));const result=tail.then(async()=>{try{return await methods[name](...args);}finally{wipe();}});tail=result.catch(()=>{});return result;}
  const journal=Object.freeze({namespace_verifier:inner.namespace_verifier,seal:v=>operation('seal',[v]),fact:v=>operation('fact',[v]),append:v=>operation('append',[v]),records:h=>operation('records',[h]),claimFreshNamespace:()=>operation('claimFreshNamespace',[]),close(){if(closePromise)return closePromise;closing=true;closePromise=tail.then(async()=>{try{await methods.close();}finally{wipe();}});return closePromise;}});
  brands.add(journal);return journal;
 }catch(e){try{await inner?.close();}finally{wipe();}throw e;}
}
