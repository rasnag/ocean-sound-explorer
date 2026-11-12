import {createHash,randomUUID} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
const policy='TEST-v1',reason='Starting point chosen from parent test answers, not a score or assessment.';
const fail=code=>{throw Object.assign(new Error('Synthetic setup operation unavailable.'),{code,status:{denied:403,validation_failed:400,conflict:409,rate_limited:429}[code]??503});};
function object(value,required,optional=[]) {
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('validation_failed');
 const keys=Reflect.ownKeys(value);
 if(required.some(k=>!Object.hasOwn(value,k))||keys.some(k=>typeof k!=='string'||!required.includes(k)&&!optional.includes(k)
  ||!Object.getOwnPropertyDescriptor(value,k).enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))fail('validation_failed');
}
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const pos=v=>Number.isSafeInteger(v)&&v>0;
const hash=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const copy=v=>structuredClone(v);
function derive(p) {
 object(p,['nickname','age','calibration']);object(p.calibration,['reads','counts_to_20','challenge']);
 const c=p.calibration;
 if(typeof p.nickname!=='string'||p.nickname.length>24||!/^[A-Za-z](?:[A-Za-z '-]*[A-Za-z])?$/.test(p.nickname)
  ||!Number.isInteger(p.age)||p.age<5||p.age>8
  ||!['independent','with-help','not-yet','not-sure'].includes(c.reads)
  ||![true,false,'not-sure'].includes(c.counts_to_20)||!['gentle','some','bigger','not-sure'].includes(c.challenge))fail('validation_failed');
 const starting_path=Object.values(c).includes('not-sure')||c.reads==='not-yet'||c.counts_to_20===false?'slow':c.reads==='independent'&&c.counts_to_20===true&&c.challenge==='bigger'?'fast':'medium';
 return {...copy(p),starting_path,provenance:'parent-calibration-v1',reason};
}
const safeNumber=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)fail('unavailable');return n;};
const entry=row=>({child_id:row.child_id,profile_version:safeNumber(row.current_version),is_initial:row.is_initial,profile:copy(row.profile)});
export async function createSyntheticChildSetup(options={}) {
 object(options,['env','db','access','policyVersion'],['clock']);object(options.env,[],Reflect.ownKeys(options.env));
 resolveLoopConfig(options.env);
 const {env,db,access,policyVersion,clock=Date.now}=options;
 if(policyVersion!==policy||!access||typeof access.withSession!=='function'||typeof clock!=='function')fail('validation_failed');
 const now=()=>{const t=clock();if(!Number.isSafeInteger(t)||t<0||t>8640000000000000)fail('unavailable');return t;};now();
 const {PGlite}=await import('@electric-sql/pglite');if(!(db instanceof PGlite))fail('validation_failed');
 if((await db.query('SELECT version FROM schema_migrations WHERE version=8')).rows.length!==1)fail('unavailable');
 async function scope(tx,actor) {
  const c=(await tx.query('SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[actor.householdId])).rows[0];
  if(!c||c.state!=='active'||c.policy_version!==policy)return null;
  const epoch=safeNumber(c.consent_epoch),context=hash(JSON.stringify(['synthetic-child-setup-v1',actor.adultId,actor.householdId,epoch,policy]));
  const rows=(await tx.query('SELECT * FROM child_setup_profiles WHERE household_id=$1 ORDER BY is_initial DESC,child_id FOR UPDATE',[actor.householdId])).rows;
  return {epoch,context,rows,blocked:rows.some(r=>safeNumber(r.consent_epoch)!==epoch)};
 }
 const base=state=>({status:'child_setup',synthetic_only:true,policy_version:policy,state});
 async function status(token) {
  return access.withSession(token,async(tx,actor)=>{
   const s=await scope(tx,actor);if(!s)return base('permission_required');if(s.blocked)return base('setup_unavailable');
   if(!s.rows.some(r=>r.is_initial))return {...base('setup_required'),setup_context:s.context};
   return {...base('complete'),setup_context:s.context,children:s.rows.map(entry)};
  });
 }
 async function quota(tx,h) {
  const at=now();await tx.query('INSERT INTO child_setup_throttle VALUES($1,$2,0) ON CONFLICT DO NOTHING',[h,at]);
  const r=(await tx.query('SELECT * FROM child_setup_throttle WHERE household_id=$1 FOR UPDATE',[h])).rows[0];
  let start=Number(r.window_started_ms),count=Number(r.attempts);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||at<start)fail('rate_limited');
  if(at-start>=60000){start=at;count=0;}if(count>=30)fail('rate_limited');
  await tx.query('UPDATE child_setup_throttle SET window_started_ms=$2,attempts=$3 WHERE household_id=$1',[h,start,count+1]);
 }
 const ack=(context,row)=>({status:'child_saved',synthetic_only:true,policy_version:policy,setup_context:context,child:entry(row)});
 async function save(token,input) {
  object(input,['command_id','setup_context','operation','profile'],['initial','child_id','expected_profile_version']);
  if(input.operation==='create')object(input,['command_id','setup_context','operation','initial','profile']);
  else if(input.operation==='correct')object(input,['command_id','setup_context','operation','child_id','expected_profile_version','profile']);
  else fail('validation_failed');
  if(!uuid(input.command_id)||typeof input.setup_context!=='string'||!/^[0-9a-f]{64}$/.test(input.setup_context)
   ||input.operation==='create'&&typeof input.initial!=='boolean'
   ||input.operation==='correct'&&(!uuid(input.child_id)||!pos(input.expected_profile_version)))fail('validation_failed');
  const profile=derive(input.profile),command=copy(input);command.command_id=command.command_id.toLowerCase();if(command.child_id)command.child_id=command.child_id.toLowerCase();
  return access.withSession(token,async(tx,actor)=>{
   const s=await scope(tx,actor);if(!s||s.blocked||s.context!==command.setup_context)fail('denied');
   const h=actor.householdId,correct=command.operation==='correct';
   let row=correct?s.rows.find(r=>r.child_id===command.child_id):undefined;
   if(correct&&!row)fail('denied');
   const digest=hash(canonical({adultId:actor.adultId,command}));
   const prior=(await tx.query('SELECT canonical_digest,result FROM child_setup_commands WHERE household_id=$1 AND command_id=$2',[h,command.command_id])).rows[0];
   if(prior){if(prior.canonical_digest!==digest)fail('conflict');return copy(prior.result);}
   const initial=s.rows.find(r=>r.is_initial);
   if(!correct&&command.initial&&initial){if(safeNumber(initial.current_version)===1&&canonical(initial.profile)===canonical(profile))return ack(s.context,initial);fail('conflict');}
   if(!correct&&!command.initial&&!initial)fail('conflict');
   if(correct&&safeNumber(row.current_version)!==command.expected_profile_version)fail('conflict');
   if(correct&&command.expected_profile_version>=Number.MAX_SAFE_INTEGER)fail('unavailable');
   await quota(tx,h);
   if(!correct) {
    row={child_id:randomUUID(),current_version:1,is_initial:command.initial,profile};
    await tx.query('INSERT INTO children(household_id,child_id,payload_ref) VALUES($1,$2,$3)',[h,row.child_id,'synthetic:versioned-child-profile']);
    await tx.query('INSERT INTO child_setup_profiles(household_id,child_id,consent_epoch,created_by,is_initial,current_version,profile) VALUES($1,$2,$3,$4,$5,1,$6)',[h,row.child_id,s.epoch,actor.adultId,row.is_initial,JSON.stringify(profile)]);
   } else {
    const version=command.expected_profile_version+1;
    const updated=await tx.query('UPDATE child_setup_profiles SET current_version=$4,profile=$5 WHERE household_id=$1 AND child_id=$2 AND current_version=$3 RETURNING *',[h,row.child_id,command.expected_profile_version,version,JSON.stringify(profile)]);
    if(updated.rows.length!==1)fail('conflict');row=updated.rows[0];
   }
   await tx.query('INSERT INTO child_profile_versions(household_id,child_id,profile_version,consent_epoch,changed_by,profile) VALUES($1,$2,$3,$4,$5,$6)',[h,row.child_id,Number(row.current_version),s.epoch,actor.adultId,JSON.stringify(profile)]);
   const result=ack(s.context,row);
   await tx.query('INSERT INTO child_setup_commands(household_id,command_id,child_id,adult_id,operation,canonical_digest,result) VALUES($1,$2,$3,$4,$5,$6,$7)',[h,command.command_id,row.child_id,actor.adultId,command.operation,digest,JSON.stringify(result)]);
   return copy(result);
  });
 }
 return Object.freeze({status,save});
}
