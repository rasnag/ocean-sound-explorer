// COST-LOCAL-01 STAGE3. Architecture v1.2 / ADR-E03/E04/E06.
// SHA256 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// Browser-only transport. Authority, locks, journal durability and fencing remain
// server responsibilities. No storage, producer, provider or publication API.
export function createCostClient(fetcher=globalThis.fetch){
 const MAX=9007199254740990,AMOUNT=1000000000000,LIMIT=1048576;
 const classification='synthetic-unsettled-fixture';
 const states=['draft_ready','failed','unsupported','cancelled','uncertain'];
 const stages=['intake','generation_supervision','adaptation','grounding','assets','safety_review','playtest_fast','playtest_medium','playtest_slow','correction','support','incident','rules_design','player_engineering','outcome_modelling','pattern_testing','stabilization'];
 const owners=['direct','G1','G2','G3','I1'],lineOwner={C1:'G1',C2:'G1',C3:'G2',C4:'G3',C5:'I1'};
 const fail=(status=502)=>{throw Object.assign(new Error('Local synthetic cost confirmation unavailable.'),{status});};
 const require=value=>{if(!value)fail();};
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
 function integer(v,max=MAX,min=0){require(Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max);return v;}
 const nullable=(v,max)=>v===null?null:integer(v,max);
 const add=(a,b)=>integer(a+b);
 function exact(v,keys){
  require(v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v)));
  const d=Object.getOwnPropertyDescriptors(v);
  require(Reflect.ownKeys(d).length===keys.length&&keys.every(k=>d[k]?.enumerable&&Object.hasOwn(d[k],'value')));return v;
 }
 function array(v,max=1000){require(Array.isArray(v)&&v.length<=max);return v;}
 function unique(v){require(new Set(v).size===v.length);return v;}
 function ids(v,max=64){array(v,max);v.forEach(x=>require(uuid(x)));return unique(v);}
 function canonical(v){
  if(v===null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 }
 const equal=(a,b)=>canonical(a)===canonical(b);
 function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
 function snapshot(value){
  const active=new Set();let count=0;
  function visit(v,depth){
   require(++count<=200000&&depth<=20);
   if(v===null||typeof v==='boolean')return v;
   if(typeof v==='number'){require(Number.isFinite(v)&&!Object.is(v,-0));return v;}
   if(typeof v==='string'){require(v.length<=512);return v;}
   require(v&&typeof v==='object'&&!active.has(v));active.add(v);
   try{
    const d=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(d);
    if(Array.isArray(v)){
     const n=d.length?.value;integer(n,1000);require(keys.length===n+1);const out=[];
     for(let i=0;i<n;i++){const p=d[String(i)];require(p?.enumerable&&Object.hasOwn(p,'value'));out.push(visit(p.value,depth+1));}return out;
    }
    require([Object.prototype,null].includes(Object.getPrototypeOf(v))&&keys.length<=40);
    const out=Object.create(null);
    for(const k of keys){const p=d[k];require(typeof k==='string'&&p.enumerable&&Object.hasOwn(p,'value'));out[k]=visit(p.value,depth+1);}return out;
   }finally{active.delete(v);}
  }
  return visit(value,0);
 }
 function scope(v,extra=[]){exact(v,['household_id','request_id','scope_version',...extra]);require(uuid(v.household_id)&&uuid(v.request_id));integer(v.scope_version,MAX,1);}
 function pin(v){exact(v,['consent_epoch','profile_version','scope_version','inventory_digest']);for(const k of ['consent_epoch','profile_version','scope_version'])integer(v[k],MAX,1);require(typeof v.inventory_digest==='string'&&/^[0-9a-f]{64}$/.test(v.inventory_digest));}
 function instant(v){require(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v));const n=Date.parse(v);require(Number.isFinite(n)&&n>=0&&n<=253402300799999&&new Date(n).toISOString()===v);}
 function cash(p){nullable(p.cash_micro_usd,AMOUNT);require(p.cash_state==='unknown'?p.cash_micro_usd===null:p.cash_state==='estimated'&&p.cash_micro_usd!==null);}
 function payload(action,p,base=false){
  if(action==='CaptureAttempt'){exact(p,['job_id','attempt_id']);require(uuid(p.job_id)&&uuid(p.attempt_id));return;}
  if(action==='OpenComparison'){exact(p,['fixture_id']);require(p.fixture_id==='comparison-v1');return;}
  if(action==='RecordAttemptUsage'){
   exact(p,['entry_id','attempt_id','supersedes_entry_id','input_tokens','output_tokens','cash_state','cash_micro_usd','rate']);require(uuid(p.attempt_id));nullable(p.input_tokens,1000000000);nullable(p.output_tokens,1000000000);cash(p);
   if(p.rate!==null){
    exact(p.rate,['kind','rate_id','input_micro_usd_per_token','output_micro_usd_per_token']);
    require(equal(p.rate,{kind:'invented-scenario-rate',rate_id:'toy-rate-v1',input_micro_usd_per_token:3,output_micro_usd_per_token:7}));
    require(p.input_tokens!==null&&p.output_tokens!==null&&p.cash_state==='estimated');require(integer(add(3*p.input_tokens,7*p.output_tokens),AMOUNT)===p.cash_micro_usd);
   }
   if(!base)require(p.supersedes_entry_id!==null);
  }else if(action==='RecordScenarioCash'){
   exact(p,['entry_id','owner','line','supersedes_entry_id','cash_state','cash_micro_usd']);require(Object.hasOwn(lineOwner,p.line)&&p.owner===lineOwner[p.line]);cash(p);
  }else if(action==='RecordStageTime'){
   exact(p,['entry_id','owner','stage','slot','supersedes_entry_id','minutes','payment_status','basis']);
   require(owners.includes(p.owner)&&stages.includes(p.stage)&&p.payment_status==='unpaid');integer(p.slot,4,1);nullable(p.minutes,525600);require(p.basis===(p.minutes===null?'unknown':'synthetic'));
  }else fail();
  require(uuid(p.entry_id)&&(p.supersedes_entry_id===null||uuid(p.supersedes_entry_id))&&p.entry_id!==p.supersedes_entry_id);
 }
 function command(c){exact(c,['command_id','expected_version','source_pin','action','payload']);require(uuid(c.command_id));integer(c.expected_version,MAX-1);pin(c.source_pin);payload(c.action,c.payload);}
 function attempt(a){
  exact(a,['job_id','attempt_id','completion_id','state','fence','started_at','lease_until','revision_ids','dispatch_state','failure_class','latency_ms','usage_kind','provider_usage','estimated_cash','billed_cash','cash_state','classification']);
  for(const k of ['job_id','attempt_id','completion_id'])require(uuid(a[k]));require(states.includes(a.state));integer(a.fence,MAX,1);instant(a.started_at);instant(a.lease_until);require(Date.parse(a.lease_until)>=Date.parse(a.started_at));ids(a.revision_ids);
  require(a.dispatch_state==='unknown'&&a.failure_class===null&&a.latency_ms===null&&a.usage_kind==='mock'&&a.provider_usage===null&&a.estimated_cash===null&&a.billed_cash===null&&a.cash_state==='unknown'&&a.classification===classification);
 }
 function descriptor(){return {
  fixture_id:'comparison-v1',classification_basis:'fictional-comparison-only',
  productions:[{id:'G1',classification:'fictional-settled',investment_refs:[]},{id:'G2',classification:'fictional-new',investment_refs:['I1']},{id:'G3',classification:'fictional-new',investment_refs:['I1']}],
  investments:[{id:'I1',associated_first_game_id:'G2',reviewed_release_ref:null}],sample_n:{fictional_settled:1,fictional_new:2},
  denominator_basis:'closed-reference-population-assumption',eligible_population:['G2','G3'],reference_n:2,delivered_referencing_n:0,actual_reuse_share:null,delivered_unique_game_n:0
 };}
 function history(entries,attempts,comparison){
  const byId=new Map(),groups=new Map(),next=new Map(),captured=new Set(attempts.map(a=>a.attempt_id));
  for(const e of array(entries)){
   exact(e,['entry_id','source_identity','owner','kind','supersedes_entry_id','is_current','recorded_at','source_pin','payload']);
   require(uuid(e.entry_id)&&!byId.has(e.entry_id)&&typeof e.is_current==='boolean'&&owners.includes(e.owner));instant(e.recorded_at);pin(e.source_pin);
   require(comparison!==null||e.owner==='direct');const p=e.payload;let identity;
   if(e.kind==='usage'){payload('RecordAttemptUsage',p,true);require(e.owner==='direct'&&captured.has(p.attempt_id));identity='usage/'+p.attempt_id;}
   else if(e.kind==='cash'){payload('RecordScenarioCash',p);require(p.owner===e.owner);identity='comparison-v1/cash/'+p.line;}
   else if(e.kind==='time'){payload('RecordStageTime',p);require(p.owner===e.owner);identity='time/'+e.owner+'/'+p.stage+'/'+p.slot;}
   else fail();
   require(e.source_identity===identity&&e.entry_id===p.entry_id&&e.supersedes_entry_id===p.supersedes_entry_id);
   if(e.supersedes_entry_id!==null){const prior=byId.get(e.supersedes_entry_id);require(prior&&prior.source_identity===identity&&prior.owner===e.owner&&prior.kind===e.kind&&!next.has(prior.entry_id));next.set(prior.entry_id,e);}
   byId.set(e.entry_id,e);const group=groups.get(identity)??[];group.push(e);groups.set(identity,group);
  }
  const leaves=new Map();
  for(const [identity,group] of groups){
   const roots=group.filter(e=>e.supersedes_entry_id===null);require(roots.length===1);const root=roots[0];
   if(root.kind==='usage')require(root.payload.input_tokens===null&&root.payload.output_tokens===null&&root.payload.cash_state==='unknown'&&root.payload.cash_micro_usd===null&&root.payload.rate===null);
   let cursor=root,n=0;
   while(cursor){require(++n<=group.length);const successor=next.get(cursor.entry_id);require(cursor.is_current===!successor);if(!successor)leaves.set(identity,cursor);cursor=successor;}require(n===group.length);
  }
  for(const a of attempts)require(leaves.has('usage/'+a.attempt_id));return leaves;
 }
 function pool(selected,leaves,expectedCash,expectedTime,blocked=false){
  let amount=0,minutes=0,unknownMinutes=0;const missingCash=new Set(expectedCash),missingTime=new Set(expectedTime);
  for(const e of leaves.values()){
   if(!selected.includes(e.owner))continue;
   if(e.kind==='time'){
    if(e.payload.minutes===null){unknownMinutes=add(unknownMinutes,1);missingTime.add(e.source_identity);}
    else{minutes=add(minutes,e.payload.minutes);missingTime.delete(e.source_identity);}
   }else if(e.payload.cash_state==='unknown')missingCash.add(e.source_identity);
   else{amount=add(amount,e.payload.cash_micro_usd);missingCash.delete(e.source_identity);}
  }
  return {known_estimated_micro_usd:amount,unknown_cash_n:missingCash.size,known_minutes:minutes,unknown_minutes_n:unknownMinutes,missing_cash_sources:[...missingCash].sort(),missing_stages:[...missingTime].sort(),complete:!blocked&&!missingCash.size&&!missingTime.size};
 }
 function combine(a,b){return {known_estimated_micro_usd:add(a.known_estimated_micro_usd,b.known_estimated_micro_usd),unknown_cash_n:add(a.unknown_cash_n,b.unknown_cash_n),known_minutes:add(a.known_minutes,b.known_minutes),unknown_minutes_n:add(a.unknown_minutes_n,b.unknown_minutes_n),missing_cash_sources:[...a.missing_cash_sources,...b.missing_cash_sources].sort(),missing_stages:[...a.missing_stages,...b.missing_stages].sort(),complete:a.complete&&b.complete};}
 function summary(v,leaves){
  const s=v.summary;exact(s,['direct','comparison_direct','investment','scenario_total','attempt_coverage','delivered_unique_game_n','cost_per_delivered','valued_labour_micro_usd','allocation']);
  const sourceIds=v.source.capturable_attempt_ids,capturedIds=v.attempts.map(a=>a.attempt_id),open=v.comparison!==null;
  const usage=[...new Set([...sourceIds,...capturedIds])].map(x=>'usage/'+x);
  const direct=pool(['direct'],leaves,usage,stages.slice(0,9).map(x=>'time/direct/'+x+'/1'),v.source.blocked_job_ids.length>0);
  const comparison=pool(['G1','G2','G3'],leaves,open?['C1','C2','C3','C4'].map(x=>'comparison-v1/cash/'+x):[],open?['G1','G2','G3'].map(x=>'time/'+x+'/generation_supervision/1'):[]);
  const investment=pool(['I1'],leaves,open?['comparison-v1/cash/C5']:[],open?['time/I1/rules_design/1']:[]);
  for(const [key,value] of Object.entries({direct,comparison_direct:comparison,investment,scenario_total:combine(comparison,investment)}))require(equal(s[key],value));
  const c=s.attempt_coverage;exact(c,['source_attempt_n','captured_attempt_n','missing_attempt_ids','failed_n','cancelled_n','uncertain_n','unsupported_n']);
  require(c.source_attempt_n===sourceIds.length&&c.captured_attempt_n===capturedIds.length);ids(c.missing_attempt_ids);require(equal(c.missing_attempt_ids,sourceIds.filter(x=>!capturedIds.includes(x)).sort()));
  // Current source metadata is intentionally not exposed. Do not substitute
  // historical captures for source_attempts or fabricate uncaptured states.
  let terminalN=0;
  for(const state of ['failed','cancelled','uncertain','unsupported']){
   const count=integer(c[state+'_n'],sourceIds.length);terminalN=add(terminalN,count);
   // Captures are immutable historical snapshots. A current source attempt
   // may later be cancelled; its present state cannot be inferred from them.
  }
  require(terminalN<=sourceIds.length);
  require(s.delivered_unique_game_n===0&&s.cost_per_delivered===null&&s.valued_labour_micro_usd===null);
  if(!open){require(s.allocation===null);return;}
  const split=total=>{const n=BigInt(total);return [Number(n/2n+n%2n),Number(n/2n)];};
  const cashShares=split(investment.known_estimated_micro_usd),minuteShares=split(investment.known_minutes);
  const expected={rule:'equal-reference-v1',denominator_basis:'closed-reference-population-assumption',eligible_population:['G2','G3'],reference_n:2,delivered_referencing_n:0,actual_reuse_share:null,sample_n:{fictional_settled:1,fictional_new:2},shares:['G2','G3'].map((game_id,i)=>({game_id,cash_micro_usd:cashShares[i],minutes:minuteShares[i]})),unallocated_cash_micro_usd:0,unallocated_minutes:0,complete:investment.complete};
  require(equal(s.allocation,expected));
 }
 function validate(kind,r,input){
  require(r?.synthetic_only===true);
  if(kind==='list'){
   exact(r,['status','synthetic_only','requests']);require(r.status==='cost_list');const seen=new Set();
   for(const s of array(r.requests)){scope(s);const k=s.household_id+'/'+s.request_id;require(!seen.has(k));seen.add(k);}return r;
  }
  if(kind==='command'||kind==='reconcile'){
   exact(r,['status','synthetic_only','command_id','version']);const recovery=kind==='reconcile'&&['cost_command_absent','cost_command_fenced'].includes(r.status);
   require(recovery||['acknowledged','retryable_unacknowledged'].includes(r.status));require(uuid(r.command_id)&&r.command_id===(kind==='command'?input.command.command_id:input.command_id));
   integer(r.version,MAX,r.status==='cost_command_absent'?0:1);if(r.status==='cost_command_absent')require(r.version===0);
   if(kind==='command')require(r.version===input.command.expected_version+1);return r;
  }
  if(r.status==='cost_pending'){
   exact(r,['status','synthetic_only','pending']);const seen=new Set();
   for(const p of array(r.pending)){exact(p,['command_id']);require(uuid(p.command_id)&&!seen.has(p.command_id));seen.add(p.command_id);}return r;
  }
  exact(r,['status','synthetic_only','scope','version','source','attempts','entries','comparison','summary','pending']);require(r.status==='cost_view');scope(r.scope);require(equal(r.scope,input));integer(r.version,1000);array(r.pending,0);
  const source=r.source;exact(source,['availability','pin','capturable_attempt_ids','blocked_job_ids','classification']);pin(source.pin);
  require(source.pin.scope_version===input.scope_version&&source.classification===classification&&['available','not_requested','in_progress','stale_profile','stale_scope'].includes(source.availability));ids(source.capturable_attempt_ids);ids(source.blocked_job_ids);
  require(equal(source.capturable_attempt_ids,[...source.capturable_attempt_ids].sort())&&equal(source.blocked_job_ids,[...source.blocked_job_ids].sort()));
  if(source.availability==='in_progress')require(source.blocked_job_ids.length>0);
  if(source.availability==='available')require(source.blocked_job_ids.length===0);
  if(source.availability==='not_requested')require(!source.capturable_attempt_ids.length&&!source.blocked_job_ids.length);
  array(r.attempts,64).forEach(attempt);unique(r.attempts.map(a=>a.attempt_id));unique(r.attempts.map(a=>a.completion_id));
  require(r.comparison===null||equal(r.comparison,descriptor()));
  const leaves=history(r.entries,r.attempts,r.comparison);require(r.entries.length+(r.comparison===null?0:1)<=r.version);summary(r,leaves);return r;
 }
 // Small JSON grammar reader: JSON.parse alone loses duplicate member evidence.
 function parse(text){
  let i=0,nodes=0;
  const ws=()=>{while(i<text.length&&/[\x20\t\r\n]/.test(text[i]))i++;};
  function string(){
   require(text[i]==='"');const start=i++;
   while(i<text.length){const c=text[i++];if(c==='"'){const v=JSON.parse(text.slice(start,i));require(v.length<=512);return v;}if(c==='\\'){require(i<text.length);i++;}else require(c.charCodeAt(0)>=32);}fail();
  }
  function value(depth){
   require(++nodes<=200000&&depth<=20);ws();const c=text[i];
   if(c==='"')return string();
   if(c==='{'){
    i++;ws();const out=Object.create(null),seen=new Set();if(text[i]==='}'){i++;return out;}
    for(;;){ws();const k=string();require(!seen.has(k)&&seen.size<40);seen.add(k);ws();require(text[i++]===':');out[k]=value(depth+1);ws();const end=text[i++];if(end==='}')return out;require(end===',');}
   }
   if(c==='['){i++;ws();const out=[];if(text[i]===']'){i++;return out;}for(;;){require(out.length<1000);out.push(value(depth+1));ws();const end=text[i++];if(end===']')return out;require(end===',');}}
   for(const [word,v] of [['true',true],['false',false],['null',null]])if(text.startsWith(word,i)){i+=word.length;return v;}
   const match=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));require(match);i+=match[0].length;const v=Number(match[0]);require(Number.isFinite(v)&&!Object.is(v,-0));return v;
  }
  const result=value(0);ws();require(i===text.length);return result;
 }
 async function responseValue(response){
  const declared=response.headers?.get('content-length');
  if(declared!==null&&declared!==undefined)require(/^\d+$/.test(declared)&&Number.isSafeInteger(Number(declared))&&Number(declared)<=LIMIT);
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});let size=0,text='';
  if(response.body&&typeof response.body.getReader==='function'){
   const reader=response.body.getReader();let complete=false;
   try{for(;;){const part=await reader.read();if(part.done){complete=true;break;}require(part.value instanceof Uint8Array);size+=part.value.byteLength;require(size<=LIMIT);text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}
   finally{if(!complete)try{await reader.cancel();}catch{}reader.releaseLock();}
  }else{
   require(typeof response.arrayBuffer==='function');const bytes=new Uint8Array(await response.arrayBuffer());size=bytes.byteLength;require(size<=LIMIT);text=decoder.decode(bytes);
  }
  if(declared!==null&&declared!==undefined)require(Number(declared)===size);return parse(text);
 }
 if(typeof fetcher!=='function')fail(400);
 async function request(kind,value,options={}){
  let input,body;
  try{
   input=snapshot(value);
   if(kind==='list')exact(input,[]);
   else if(kind==='read')scope(input);
   else if(kind==='command'){scope(input,['command']);command(input.command);require(input.scope_version===input.command.source_pin.scope_version);}
   else{scope(input,['command_id']);require(uuid(input.command_id));}
   body=JSON.stringify(input);if(new TextEncoder().encode(body).byteLength>16384)fail(413);
  }catch(e){fail(e?.status===413?413:400);}
  const response=await fetcher('/founder/cost/'+kind,{method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body,signal:options?.signal});
  if(!response||![200,202].includes(response.status)){try{await response?.body?.cancel?.();}catch{}fail(Number.isInteger(response?.status)?response.status:502);}
  require(/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers?.get('content-type')??''));
  let result;try{result=validate(kind,await responseValue(response),input);}catch{fail();}
  require(response.status===(result.status==='retryable_unacknowledged'?202:200));
  // The strict grammar uses null-prototype dictionaries internally. Expose
  // ordinary immutable JSON DTOs to callers, matching the other local clients.
  return freeze(JSON.parse(JSON.stringify(result)));
 }
 return Object.freeze({list:(input={},options)=>request('list',input,options),read:(input,options)=>request('read',input,options),command:(input,options)=>request('command',input,options),reconcile:(input,options)=>request('reconcile',input,options)});
}
