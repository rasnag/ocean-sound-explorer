// Invented fixture data only. No network, credentials, factual-fit or publish capability.
import {types} from 'node:util';
import {ownData,canonical,parseStrictJSON} from '../../server/continuation-journal.mjs';
import {fixtureAdventure} from './fixture-adventure.mjs';
const brands=new WeakSet(),fail=()=>{throw Object.assign(new Error('Invalid local mock fixture.'),{status:400,code:'validation_failed'});};
export const MOCK_LIMITS=Object.freeze({policy_version:'local-mock-v1',max_attempts:1,provider_timeout_ms:1000,lease_ms:5000,max_elapsed_ms:10000,max_input_bytes:8192,max_output_bytes:65536,concurrency:1});
export function validateMockLimits(value){const v=ownData(value,Object.keys(MOCK_LIMITS));if(canonical(v)!==canonical(MOCK_LIMITS))fail();return Object.freeze({...v});}
function safe(value,max=2000){if(typeof value!=='string'||!value.trim()||value.length>max||/[<>\x00-\x08\x0b\x0c\x0e-\x1f]|(?:https?|data|javascript|file):|\b(?:eval|Function)\s*\(/i.test(value))fail();return value;}
export function prepareFixtureInput(value){const v=ownData(value,['synthetic','original_question','interpretation']);if(v.synthetic!==true)fail();safe(v.original_question,1000);if(v.interpretation!==null)safe(v.interpretation,1000);if(Buffer.byteLength(canonical(v))>MOCK_LIMITS.max_input_bytes)fail();return Object.freeze({...v});}
export function validateFixtureDraft(value){
 let v=value;if(typeof v==='string'){if(Buffer.byteLength(v)>MOCK_LIMITS.max_output_bytes)fail();try{v=parseStrictJSON(v);}catch{fail();}}
 if(types.isProxy(v))fail();v=ownData(v,['contract_version','revision_id','pattern_version','engine_version','status','opening','limits','configurations','outcomes','assets','help','difficulty','side_thread','offscreen']);
 if(v.contract_version!=='1.1.0'||v.status!=='draft'||v.pattern_version!=='fixture-1'||v.engine_version!=='fixture-engine-1')fail();
 // canonical traverses own descriptors, rejects accessors/proxies/cycles before
 // reading arrays. Do not spread or map an unvalidated provider collection.
 const bytes=canonical(v);if(Buffer.byteLength(bytes)>MOCK_LIMITS.max_output_bytes)fail();const d=parseStrictJSON(bytes);
 for(const k of ['revision_id','opening','limits','side_thread','offscreen'])safe(d[k]);
 if(canonical(d.configurations)!=='["balanced","offset"]'||canonical(d.outcomes)!=='{"balanced":"stable","offset":"tips"}'||canonical(d.difficulty)!=='["fast","medium","slow"]')fail();
 if(!Array.isArray(d.assets)||new Set(d.assets).size!==d.assets.length||d.assets.some(x=>x!=='fixture-balance')||!Array.isArray(d.help)||d.help.length!==3)fail();for(const x of d.help)safe(x);return d;
}
export function createSyntheticMockProvider(value){
 const {mode}=ownData(value,['mode']);if(!['valid','invalid','unsupported','timeout','delayed'].includes(mode))fail();
 const provider=Object.freeze({forCase(nextMode){return createSyntheticMockProvider({mode:nextMode});},async generate(input,options){prepareFixtureInput(input);const {signal}=ownData(options,['signal']);if(!(signal instanceof AbortSignal))fail();signal.throwIfAborted();
  if(mode==='unsupported')throw Object.assign(new Error('Invented unsupported fixture.'),{code:'unsupported'});
  if(mode==='timeout'||mode==='delayed')await new Promise((resolve,reject)=>{let timer;const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);reject(Object.assign(new Error('Mock cancelled.'),{code:'mock_aborted'}));};signal.addEventListener('abort',stop,{once:true});if(mode==='delayed')timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},700);});
  signal.throwIfAborted();const draft=structuredClone(fixtureAdventure);draft.revision_id='mock-fixture-draft';draft.opening='Where will you place the block? Predict, choose a position, then test.';draft.limits='Invented local fixture. Its two fixed toy rules are not a validated science model or a real investigation.';draft.help=['Look at the position labels.','Try changing only the position.','In this toy, balanced is stable and offset tips.'];draft.side_thread='Optional invented comparison, pending human content review.';draft.offscreen='Unreviewed placeholder. No real-world activity is approved by this fixture.';if(mode==='invalid')draft.outcomes.balanced='flies';return draft;
 }});brands.add(provider);return provider;
}
export const isSyntheticMockProvider=value=>brands.has(value);
