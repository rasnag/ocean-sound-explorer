// REVIEW-LOCAL-01 / APPROVAL-010: browser-only transport for invented evidence.
// Architecture 1.2 / ADR-E03/04/05/06 / SHA256
// 02adc2e0bf0910092f0888a126cdebe98adc35a177679bf124e0e79393532b79.
// Server transactions, current source pins and independent journal ACKs own
// authority. This client has no publication, player or persistent storage API.
export function createReviewClient(fetcher=globalThis.fetch){
 const names=['facts','age','safety','outcomes','help','difficulty','playtest'];
 const fail=(status=502)=>{throw Object.assign(new Error('Local TEST review confirmation unavailable.'),{status});};
 const id=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
 const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min&&v<Number.MAX_SAFE_INTEGER;
 const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
 const bytes=v=>new TextEncoder().encode(v).byteLength;
 function exact(v,keys){
  if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();
  const d=Object.getOwnPropertyDescriptors(v);
  if(Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))fail();
  return v;
 }
 function snapshot(value){
  const seen=new Set();let count=0;
  function visit(v,depth){
   if(++count>200000||depth>20)fail();
   if(v===null||typeof v==='boolean'||typeof v==='string')return v;
   if(typeof v==='number'){if(!Number.isFinite(v))fail();return v;}
   if(!v||typeof v!=='object'||seen.has(v))fail();
   seen.add(v);let out;
   try{
    const d=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(d);
    if(Array.isArray(v)){
     if(!Object.hasOwn(d.length??{},'value')||!integer(d.length.value)||d.length.value>1000||keys.length!==d.length.value+1)fail();
     out=[];
     for(let i=0;i<d.length.value;i++){
      const p=d[String(i)];if(!p?.enumerable||!Object.hasOwn(p,'value'))fail();out.push(visit(p.value,depth+1));
     }
    }else{
     if(![Object.prototype,null].includes(Object.getPrototypeOf(v))||keys.some(k=>typeof k!=='string'))fail();
     out=Object.create(null);
     for(const k of keys.sort()){
      const p=d[k];if(!p.enumerable||!Object.hasOwn(p,'value'))fail();out[k]=visit(p.value,depth+1);
     }
    }
   }finally{seen.delete(v);}
   return out;
  }
  return visit(value,0);
 }
 const equal=(a,b)=>JSON.stringify(snapshot(a))===JSON.stringify(snapshot(b));
 function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
 function text(v,max=2000,fixture=false){
  if(typeof v!=='string'||!v.trim()||v.length>max)fail();
  const forbidden=fixture?/[<>\x00-\x08\x0b\x0c\x0e-\x1f]|(?:https?|data|javascript|file):|\b(?:eval|Function)\s*\(/i:/[<>&\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|(?:[a-z][a-z0-9+.-]*:\/\/|(?:data|javascript|vbscript|file):|www\.|\/\/)|\b(?:eval|Function)\s*\(/i;
  if(forbidden.test(v)||!fixture&&bytes(v)>max*3)fail();
 }
 function array(v,max=1000){if(!Array.isArray(v)||v.length>max)fail();return v;}
 function scope(v,extra=[]){
  exact(v,['household_id','request_id','scope_version',...extra]);
  if(!id(v.household_id)||!id(v.request_id)||!integer(v.scope_version,1))fail();
 }
 function checks(v){exact(v,names);if(names.some(k=>typeof v[k]!=='boolean'))fail();}
 function adventure(v,revision){
  exact(v,['contract_version','revision_id','pattern_version','engine_version','status','opening','limits','configurations','outcomes','assets','help','difficulty','side_thread','offscreen']);
  if(v.contract_version!=='1.1.0'||v.revision_id!==revision||!id(v.revision_id)||v.pattern_version!=='fixture-1'||v.engine_version!=='fixture-engine-1'||v.status!=='draft')fail();
  if(!equal(v.configurations,['balanced','offset'])||!equal(v.difficulty,['fast','medium','slow']))fail();
  exact(v.outcomes,['balanced','offset']);if(v.outcomes.balanced!=='stable'||v.outcomes.offset!=='tips')fail();
  array(v.assets,1);if(new Set(v.assets).size!==v.assets.length||v.assets.some(x=>x!=='fixture-balance'))fail();
  array(v.help,3);if(v.help.length!==3)fail();v.help.forEach(x=>text(x,2000,true));
  for(const k of ['opening','limits','side_thread','offscreen'])text(v[k],2000,true);
  if(bytes(JSON.stringify(v))>65536)fail();
 }
 function command(v){
  exact(v,['command_id','expected_version','revision_id','output_digest','action','payload']);
  if(!id(v.command_id)||!integer(v.expected_version)||!integer(v.expected_version+1,1)
   ||!(v.revision_id===null||id(v.revision_id))||!(v.output_digest===null||hex(v.output_digest))
   ||(v.revision_id===null)!==(v.output_digest===null))fail();
  if(v.action==='RecordTestReview'){
   exact(v.payload,['synthetic','checks','notes']);if(v.payload.synthetic!==true)fail();checks(v.payload.checks);text(v.payload.notes);
  }else if(v.action==='ReleaseTestSnapshot'){
   exact(v.payload,['predecessor_snapshot_id']);if(!(v.payload.predecessor_snapshot_id===null||id(v.payload.predecessor_snapshot_id)))fail();
  }else if(v.action==='WithdrawTestSnapshot'){
   exact(v.payload,['snapshot_id','reason']);if(!id(v.payload.snapshot_id))fail();text(v.payload.reason);
  }else fail();
 }
 function validate(kind,r,input){
  if(r?.synthetic_only!==true)fail();
  if(kind==='list'){
   exact(r,['status','synthetic_only','requests']);if(r.status!=='review_list')fail();
   const seen=new Set();for(const s of array(r.requests)){
    scope(s);const key=s.household_id+'/'+s.request_id;if(seen.has(key))fail();seen.add(key);
   }
   return r;
  }
  if(kind==='command'||kind==='reconcile'){
   exact(r,['status','synthetic_only','command_id','version']);
   if(!['acknowledged','retryable_unacknowledged'].includes(r.status)||!id(r.command_id)||!integer(r.version,1)
    ||r.command_id!==(kind==='command'?input.command.command_id:input.command_id)
    ||kind==='command'&&r.version!==input.command.expected_version+1)fail();
   return r;
  }
  if(r.status==='review_pending'){
   exact(r,['status','synthetic_only','pending']);const seen=new Set();
   for(const p of array(r.pending)){exact(p,['command_id']);if(!id(p.command_id)||seen.has(p.command_id))fail();seen.add(p.command_id);}
   return r;
  }
  exact(r,['status','synthetic_only','request','version','revision','review','snapshots','readiness','pending']);
  if(r.status!=='review_view'||!integer(r.version)||array(r.pending,0).length)fail();
  const q=exact(r.request,['original_question','current_question','interpretation','scope_version','receipt']);
  if(q.scope_version!==input.scope_version)fail();text(q.original_question,4000);text(q.current_question,4000);if(q.interpretation!==null)text(q.interpretation,4000);
  const receipt=exact(q.receipt,['receipt_id','request_id','booking_id','claim_id','period_id','original_received_at','original_due_at','deadline_interval_seconds']);
  if(['receipt_id','request_id','booking_id','claim_id','period_id'].some(k=>!id(receipt[k]))||receipt.request_id!==input.request_id
   ||receipt.deadline_interval_seconds!==86400||typeof receipt.original_received_at!=='string'||typeof receipt.original_due_at!=='string'
   ||!Number.isFinite(Date.parse(receipt.original_received_at))||!Number.isFinite(Date.parse(receipt.original_due_at))
   ||Date.parse(receipt.original_due_at)-Date.parse(receipt.original_received_at)!==86400000)fail();
  if(r.revision!==null){
   exact(r.revision,['revision_id','output_digest','adventure']);if(!id(r.revision.revision_id)||!hex(r.revision.output_digest))fail();adventure(r.revision.adventure,r.revision.revision_id);
  }
  if(r.review!==null){
   const review=exact(r.review,['revision_id','output_digest','synthetic','checks','notes']);
   if(!r.revision||!integer(r.version,1)||review.synthetic!==true||review.revision_id!==r.revision.revision_id||review.output_digest!==r.revision.output_digest)fail();
   checks(review.checks);text(review.notes);
  }
  const ids=new Map(),revisions=new Set();
  for(const s of array(r.snapshots)){
   exact(s,['snapshot_id','revision_id','output_digest','predecessor_snapshot_id','withdrawn','is_current_revision','adventure']);
   if(!id(s.snapshot_id)||ids.has(s.snapshot_id)||!id(s.revision_id)||revisions.has(s.revision_id)||!hex(s.output_digest)
    ||typeof s.withdrawn!=='boolean'||typeof s.is_current_revision!=='boolean'
    ||(s.predecessor_snapshot_id===null?ids.size!==0:!id(s.predecessor_snapshot_id)||!ids.has(s.predecessor_snapshot_id)))fail();
   adventure(s.adventure,s.revision_id);
   const current=!!r.revision&&s.revision_id===r.revision.revision_id;
   if(s.is_current_revision!==current||current&&(s.output_digest!==r.revision.output_digest||!equal(s.adventure,r.revision.adventure)))fail();
   ids.set(s.snapshot_id,s);revisions.add(s.revision_id);
  }
  if(r.snapshots.length>r.version)fail();
  exact(r.readiness,['eligible','missing']);array(r.readiness.missing,8);
  const missing=!r.revision?['revision']:r.review?names.filter(k=>!r.review.checks[k]):[...names,'notes'];
  if(typeof r.readiness.eligible!=='boolean'||r.readiness.eligible!==(missing.length===0)||!equal(r.readiness.missing,missing))fail();
  return r;
 }
 if(typeof fetcher!=='function')fail(400);
 async function request(kind,value,options={}){
  let input,body;
  try{
   input=snapshot(value);body=JSON.stringify(input);
   if(bytes(body)>16384)fail(413);
   if(kind==='list')exact(input,[]);
   else if(kind==='read')scope(input);
   else if(kind==='command'){scope(input,['command']);command(input.command);}
   else{scope(input,['command_id']);if(!id(input.command_id))fail();}
  }catch(e){fail(e?.status===413?413:400);}
  const response=await fetcher('/founder/review/'+kind,{method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body,signal:options.signal});
  if(!response.ok)fail(Number.isInteger(response.status)?response.status:502);
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers?.get('content-type')??''))fail();
  let r;
  try{r=validate(kind,snapshot(await response.json()),input);}catch{fail();}
  if(response.status!==(r.status==='retryable_unacknowledged'?202:200))fail();
  return freeze(r);
 }
 return Object.freeze({list:(input={},options)=>request('list',input,options),read:(input,options)=>request('read',input,options),command:(input,options)=>request('command',input,options),reconcile:(input,options)=>request('reconcile',input,options)});
}
