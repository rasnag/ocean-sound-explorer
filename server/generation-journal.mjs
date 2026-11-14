// Dedicated local generation storage. Reuse accepted encrypted-journal mechanics
// with a separate directory, branded wrapper and generation-domain-derived keys.
import {createHmac} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import {ownData,ownMethod,privateKey,environmentSnapshot} from './continuation-journal.mjs';
import {createSyntheticQueueJournal} from './queue-journal.mjs';
const brands=new WeakSet();
export const isSyntheticGenerationJournal=value=>brands.has(value);
export async function createSyntheticGenerationJournal(input){
 const o=ownData(input,['env','directory','keys'],['testHooks']);environmentSnapshot(o.env);const keys=ownData(o.keys,['keyForHousehold','keyForOperator']);
 const derive=(key,label)=>{const k=privateKey(key);try{return createHmac('sha256',k).update('generation-local-01\\0'+label).digest();}finally{k.fill(0);}};
 const h=ownMethod(keys,'keyForHousehold'),op=ownMethod(keys,'keyForOperator');
 let fresh=(await readdir(o.directory)).length===0;
 const delegate=await createSyntheticQueueJournal({env:o.env,directory:o.directory,keys:{keyForHousehold:id=>derive(h(id),'household'),keyForOperator:()=>derive(op(),'operator')},...(o.testHooks?{testHooks:o.testHooks}:{})});
 const value=Object.freeze({namespace_verifier:delegate.namespace_verifier,claimFreshNamespace(){if(!fresh)throw Object.assign(new Error('Generation namespace requires recovery.'),{code:'recovery_quarantined',status:503});fresh=false;return delegate.namespace_verifier;},seal:delegate.seal,fact:delegate.fact,append(record){fresh=false;return delegate.append(record);},records:delegate.records,close:delegate.close});brands.add(value);return value;
}
