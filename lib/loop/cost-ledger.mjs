// COST-LOCAL-01 / architecture v1.2, ADR-E03/E04/E06.
// SHA256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// Pure synchronous arithmetic. No database, provider or journal dependency.
import {types} from 'node:util';

const MAX=9007199254740990,AMOUNT=1000000000000;
const STATES=['draft_ready','failed','unsupported','cancelled','uncertain'];
const OWNERS=['direct','G1','G2','G3','I1'];
const STAGES=['intake','generation_supervision','adaptation','grounding','assets','safety_review','playtest_fast','playtest_medium','playtest_slow','correction','support','incident','rules_design','player_engineering','outcome_modelling','pattern_testing','stabilization'];
const DIRECT_STAGES=STAGES.slice(0,9);
const LINE_OWNER={C1:'G1',C2:'G1',C3:'G2',C4:'G3',C5:'I1'};
const CLASSIFICATION='synthetic-unsettled-fixture';
const fail=()=>{throw Object.assign(new Error('Invalid synthetic cost ledger.'),{code:'validation_failed',status:400});};
function integer(v,max=MAX,min=0){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<min||v>max)fail();return v;}
function nullable(v,max){return v===null?null:integer(v,max);}
function add(a,b){return integer(a+b);}
function id(v){if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v))fail();return v;}
function instant(v){
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||v.startsWith('0000-'))fail();
 const n=Date.parse(v);if(!Number.isFinite(n)||n<0||n>253402300799999||new Date(n).toISOString()!==v)fail();return v;
}
function object(v,fields){
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();
 const keys=Object.keys(v);if(keys.length!==fields.length||fields.some(k=>!Object.hasOwn(v,k)))fail();return v;
}
function list(v,max=1000){if(!Array.isArray(v)||v.length>max)fail();return v;}
function unique(values){if(new Set(values).size!==values.length)fail();return values;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function canonical(v){
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
// Copy the complete graph before schema reads. Node can reject proxies without
// invoking traps. Inspect array/object descriptors before reading any values.
function snapshot(input){
 const active=new Set();let nodes=0;
 function visit(v,depth){
  if(++nodes>50000||depth>12)fail();
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v)||Object.is(v,-0))fail();return v;}
  if(typeof v==='string'){if(v.length>512)fail();return v;}
  if(!v||typeof v!=='object'||types.isProxy(v)||active.has(v))fail();
  active.add(v);
  try{
   if(Array.isArray(v)){
    const d=Object.getOwnPropertyDescriptors(v),n=d.length?.value;
    if(!Number.isSafeInteger(n)||n<0||n>1000||Reflect.ownKeys(d).length!==n+1)fail();
    const out=[];for(let i=0;i<n;i++){const x=d[String(i)];if(!x?.enumerable||!Object.hasOwn(x,'value'))fail();out.push(visit(x.value,depth+1));}return out;
   }
   if(![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();
   const d=Object.getOwnPropertyDescriptors(v),out=Object.create(null),keys=Reflect.ownKeys(d);
   if(keys.length>40)fail();
   for(const k of keys){const x=d[k];if(typeof k!=='string'||!x.enumerable||!Object.hasOwn(x,'value'))fail();out[k]=visit(x.value,depth+1);}return out;
  }finally{active.delete(v);}
 }
 return visit(input,0);
}
function pin(v){
 object(v,['consent_epoch','profile_version','scope_version','inventory_digest']);
 for(const k of ['consent_epoch','profile_version','scope_version'])integer(v[k],MAX,1);
 if(typeof v.inventory_digest!=='string'||!/^[0-9a-f]{64}$/.test(v.inventory_digest))fail();
}
function attempt(v){
 object(v,['job_id','attempt_id','completion_id','state','fence','started_at','lease_until','revision_ids','dispatch_state','failure_class','latency_ms','usage_kind','provider_usage','estimated_cash','billed_cash','cash_state','classification']);
 for(const k of ['job_id','attempt_id','completion_id'])id(v[k]);
 if(!STATES.includes(v.state))fail();integer(v.fence,MAX,1);instant(v.started_at);instant(v.lease_until);
 if(Date.parse(v.lease_until)<Date.parse(v.started_at))fail();
 unique(list(v.revision_ids,64).map(id));
 if(v.dispatch_state!=='unknown'||v.failure_class!==null||v.latency_ms!==null||v.usage_kind!=='mock'
  ||v.provider_usage!==null||v.estimated_cash!==null||v.billed_cash!==null||v.cash_state!=='unknown'||v.classification!==CLASSIFICATION)fail();
 return v;
}
function attempts(values){
 list(values,64).forEach(attempt);unique(values.map(v=>v.attempt_id));unique(values.map(v=>v.completion_id));
 if(new Set(values.map(v=>v.job_id)).size>64)fail();return new Map(values.map(v=>[v.attempt_id,v]));
}
function cash(p){
 nullable(p.cash_micro_usd,AMOUNT);
 if(p.cash_state==='unknown'){if(p.cash_micro_usd!==null)fail();}
 else if(p.cash_state!=='estimated'||p.cash_micro_usd===null)fail();
}
function entry(e){
 object(e,['entry_id','source_identity','owner','kind','supersedes_entry_id','is_current','recorded_at','source_pin','payload']);
 id(e.entry_id);if(e.supersedes_entry_id!==null)id(e.supersedes_entry_id);
 if(e.supersedes_entry_id===e.entry_id||typeof e.is_current!=='boolean'||!OWNERS.includes(e.owner))fail();
 instant(e.recorded_at);pin(e.source_pin);const p=e.payload;let identity;
 if(e.kind==='usage'){
  object(p,['entry_id','attempt_id','supersedes_entry_id','input_tokens','output_tokens','cash_state','cash_micro_usd','rate']);
  id(p.attempt_id);nullable(p.input_tokens,1000000000);nullable(p.output_tokens,1000000000);cash(p);
  if(e.owner!=='direct')fail();identity='usage/'+p.attempt_id;
  if(p.rate!==null){
   object(p.rate,['kind','rate_id','input_micro_usd_per_token','output_micro_usd_per_token']);
   if(p.rate.kind!=='invented-scenario-rate'||p.rate.rate_id!=='toy-rate-v1'||p.rate.input_micro_usd_per_token!==3||p.rate.output_micro_usd_per_token!==7
    ||p.input_tokens===null||p.output_tokens===null||p.cash_state!=='estimated')fail();
   const amount=add(integer(3*p.input_tokens),integer(7*p.output_tokens));integer(amount,AMOUNT);
   if(amount!==p.cash_micro_usd)fail();
  }
 }else if(e.kind==='cash'){
  object(p,['entry_id','owner','line','supersedes_entry_id','cash_state','cash_micro_usd']);cash(p);
  if(!Object.hasOwn(LINE_OWNER,p.line)||LINE_OWNER[p.line]!==e.owner||p.owner!==e.owner)fail();
  identity='comparison-v1/cash/'+p.line;
 }else if(e.kind==='time'){
  object(p,['entry_id','owner','stage','slot','supersedes_entry_id','minutes','payment_status','basis']);
  if(p.owner!==e.owner||!STAGES.includes(p.stage)||p.payment_status!=='unpaid')fail();integer(p.slot,4,1);nullable(p.minutes,525600);
  if(p.basis!==(p.minutes===null?'unknown':'synthetic'))fail();identity='time/'+e.owner+'/'+p.stage+'/'+p.slot;
 }else fail();
 if(p.entry_id!==e.entry_id||p.supersedes_entry_id!==e.supersedes_entry_id||e.source_identity!==identity)fail();return e;
}
function history(values,captured,comparison){
 const byId=new Map(),groups=new Map(),successors=new Map();
 for(const e of list(values)){
  entry(e);if(byId.has(e.entry_id)||e.owner!=='direct'&&comparison===null)fail();byId.set(e.entry_id,e);
  if(e.kind==='usage'&&!captured.has(e.payload.attempt_id))fail();
  const group=groups.get(e.source_identity)??[];group.push(e);groups.set(e.source_identity,group);
 }
 for(const e of values){
  if(e.supersedes_entry_id===null)continue;
  const p=byId.get(e.supersedes_entry_id);
  if(!p||p.source_identity!==e.source_identity||p.owner!==e.owner||p.kind!==e.kind||successors.has(p.entry_id))fail();
  successors.set(p.entry_id,e);
 }
 const leaves=new Map();
 for(const [identity,group] of groups){
  const roots=group.filter(e=>e.supersedes_entry_id===null);if(roots.length!==1)fail();
  const root=roots[0];
  if(root.kind==='usage'&&(root.payload.input_tokens!==null||root.payload.output_tokens!==null||root.payload.cash_state!=='unknown'||root.payload.cash_micro_usd!==null||root.payload.rate!==null))fail();
  const seen=new Set();let cursor=root;
  while(cursor){
   if(seen.has(cursor.entry_id))fail();seen.add(cursor.entry_id);
   const next=successors.get(cursor.entry_id);
   if(cursor.is_current!==!next)fail();if(!next)leaves.set(identity,cursor);cursor=next;
  }
  if(seen.size!==group.length)fail();
 }
 for(const a of captured.values())if(!leaves.has('usage/'+a.attempt_id))fail();
 return leaves;
}
function descriptor(){return {
 fixture_id:'comparison-v1',classification_basis:'fictional-comparison-only',
 productions:[{id:'G1',classification:'fictional-settled',investment_refs:[]},{id:'G2',classification:'fictional-new',investment_refs:['I1']},{id:'G3',classification:'fictional-new',investment_refs:['I1']}],
 investments:[{id:'I1',associated_first_game_id:'G2',reviewed_release_ref:null}],
 sample_n:{fictional_settled:1,fictional_new:2},denominator_basis:'closed-reference-population-assumption',
 eligible_population:['G2','G3'],reference_n:2,delivered_referencing_n:0,actual_reuse_share:null,delivered_unique_game_n:0
};}
function pool(owners,leaves,expectedCash,expectedTime,blocked=false){
 let amount=0,minutes=0,unknownMinutes=0;
 const missingCash=new Set(expectedCash),missingTime=new Set(expectedTime);
 for(const e of leaves.values()){
  if(!owners.includes(e.owner))continue;
  if(e.kind==='time'){
   if(e.payload.minutes===null){unknownMinutes=add(unknownMinutes,1);missingTime.add(e.source_identity);}
   else{minutes=add(minutes,e.payload.minutes);missingTime.delete(e.source_identity);}
  }else if(e.payload.cash_state==='unknown')missingCash.add(e.source_identity);
  else{amount=add(amount,e.payload.cash_micro_usd);missingCash.delete(e.source_identity);}
 }
 return {known_estimated_micro_usd:amount,unknown_cash_n:missingCash.size,known_minutes:minutes,unknown_minutes_n:unknownMinutes,
  missing_cash_sources:[...missingCash].sort(),missing_stages:[...missingTime].sort(),complete:!blocked&&!missingCash.size&&!missingTime.size};
}
function combine(a,b){return {
 known_estimated_micro_usd:add(a.known_estimated_micro_usd,b.known_estimated_micro_usd),unknown_cash_n:add(a.unknown_cash_n,b.unknown_cash_n),
 known_minutes:add(a.known_minutes,b.known_minutes),unknown_minutes_n:add(a.unknown_minutes_n,b.unknown_minutes_n),
 missing_cash_sources:[...a.missing_cash_sources,...b.missing_cash_sources].sort(),missing_stages:[...a.missing_stages,...b.missing_stages].sort(),complete:a.complete&&b.complete
};}

/**
 * Exact pure input (no optional fields):
 * {source_attempts: Attempt[], attempts: Attempt[], entries: Entry[],
 *  comparison: Comparison|null, blocked_job_ids: UUID[]}.
 * source_attempts is current allowlisted source metadata; attempts contains
 * immutable captured snapshots, including acknowledged history after edits.
 * Attempt, Entry, payload, SourcePin and Comparison are the exact COST-LOCAL-01
 * service projection shapes validated above. Arrays may be empty; no defaults.
 * Returns exactly Summary. It neither reads dependencies nor mutates its input.
 * Missing stages include absent expected slot 1 and explicitly unknown slots.
 * unknown_minutes_n counts recorded unknown activities; absent stages are
 * separately enumerated in missing_stages (never fabricated time records).
 */
export function summarizeCostLedger(input){
 const v=object(snapshot(input),['source_attempts','attempts','entries','comparison','blocked_job_ids']);
 const source=attempts(v.source_attempts),captured=attempts(v.attempts);
 unique(list(v.blocked_job_ids,64).map(id));
 if(v.source_attempts.some(a=>v.blocked_job_ids.includes(a.job_id)))fail();
 if(v.comparison!==null&&canonical(v.comparison)!==canonical(descriptor()))fail();
 for(const [key,a] of captured){
  const current=source.get(key);
  // Captures can outlive the current source selection. An identity cannot move
  // to a different original dispatch, even when current metadata is refreshed.
  if(current&&['job_id','completion_id','fence','started_at','lease_until'].some(k=>a[k]!==current[k]))fail();
 }
 const leaves=history(v.entries,captured,v.comparison);
 const expectedUsage=[...new Set([...source.keys(),...captured.keys()])].map(x=>'usage/'+x);
 const direct=pool(['direct'],leaves,expectedUsage,DIRECT_STAGES.map(s=>'time/direct/'+s+'/1'),v.blocked_job_ids.length>0);
 const open=v.comparison!==null;
 const comparison_direct=pool(['G1','G2','G3'],leaves,open?['C1','C2','C3','C4'].map(x=>'comparison-v1/cash/'+x):[],open?['G1','G2','G3'].map(x=>'time/'+x+'/generation_supervision/1'):[]);
 const investment=pool(['I1'],leaves,open?['comparison-v1/cash/C5']:[],open?['time/I1/rules_design/1']:[]);
 let allocation=null;
 if(open){
  const split=allocatePool({cash_micro_usd:investment.known_estimated_micro_usd,minutes:investment.known_minutes,reference_ids:['G2','G3'],selected_ids:['G2','G3']});
  allocation={rule:'equal-reference-v1',denominator_basis:'closed-reference-population-assumption',eligible_population:['G2','G3'],reference_n:2,
   delivered_referencing_n:0,actual_reuse_share:null,sample_n:{fictional_settled:1,fictional_new:2},shares:split.shares,
   unallocated_cash_micro_usd:split.unallocated_cash_micro_usd,unallocated_minutes:split.unallocated_minutes,complete:investment.complete};
 }
 return freeze({direct,comparison_direct,investment,scenario_total:combine(comparison_direct,investment),
  attempt_coverage:{source_attempt_n:source.size,captured_attempt_n:captured.size,missing_attempt_ids:[...source.keys()].filter(x=>!captured.has(x)).sort(),
   failed_n:v.source_attempts.filter(a=>a.state==='failed').length,cancelled_n:v.source_attempts.filter(a=>a.state==='cancelled').length,
   uncertain_n:v.source_attempts.filter(a=>a.state==='uncertain').length,unsupported_n:v.source_attempts.filter(a=>a.state==='unsupported').length},
  delivered_unique_game_n:0,cost_per_delivered:null,valued_labour_micro_usd:null,allocation});
}

/**
 * Exact input: {cash_micro_usd:Amount|null, minutes:Int|null,
 * reference_ids:('G2'|'G3')[], selected_ids:('G2'|'G3')[]}.
 * Both lists are unique and sorted; selected_ids is a subset. Returns exactly
 * {shares:[{game_id,cash_micro_usd,minutes}],unallocated_cash_micro_usd,
 * unallocated_minutes,complete}. Unknown units stay null independently.
 * Remainders go to earlier reference IDs. Excluded shares remain residual.
 */
export function allocatePool(input){
 const v=object(snapshot(input),['cash_micro_usd','minutes','reference_ids','selected_ids']);
 nullable(v.cash_micro_usd,AMOUNT);nullable(v.minutes,MAX);
 for(const values of [v.reference_ids,v.selected_ids]){
  unique(list(values,2));if(values.some(x=>!['G2','G3'].includes(x))||canonical(values)!==canonical([...values].sort()))fail();
 }
 if(v.selected_ids.some(x=>!v.reference_ids.includes(x)))fail();
 const shares=v.selected_ids.map(game_id=>({game_id,cash_micro_usd:null,minutes:null}));
 function distribute(total,key){
  if(total===null)return null;
  if(!v.reference_ids.length)return total;
  // BigInt division avoids floating quotient/remainder ambiguity near MAX.
  const n=BigInt(v.reference_ids.length),q=BigInt(total)/n,r=BigInt(total)%n;
  let included=0;
  for(const share of shares){
   const index=v.reference_ids.indexOf(share.game_id),value=Number(q+(BigInt(index)<r?1n:0n));
   integer(value);share[key]=value;included=add(included,value);
  }
  const residual=integer(total-included);if(add(included,residual)!==total)fail();return residual;
 }
 const cashResidual=distribute(v.cash_micro_usd,'cash_micro_usd'),minuteResidual=distribute(v.minutes,'minutes');
 return freeze({shares,unallocated_cash_micro_usd:cashResidual,unallocated_minutes:minuteResidual,complete:v.cash_micro_usd!==null&&v.minutes!==null});
}
