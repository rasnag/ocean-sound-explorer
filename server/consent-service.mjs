import {createHash} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';

const policy='TEST-v1';
const fail=code=>{throw Object.assign(new Error('Synthetic permission operation unavailable.'),{code,status:{denied:403,validation_failed:400,conflict:409,rate_limited:429}[code]??503});};
function exact(value,keys) {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length!==keys.length || keys.some(k=>!Object.hasOwn(value,k)
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))fail('validation_failed');
}
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const canonical=x=>x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const clone=x=>structuredClone(x);
const number=x=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<0)fail('unavailable');return n;};

/** Trusted, local-only factory; never accept caller-supplied identity or SQL. */
export async function createSyntheticConsentService(options={}) {
  resolveLoopConfig(options?.env);
  if(!options||typeof options!=='object'||Array.isArray(options)
    || Object.keys(options).some(k=>!['env','db','access','clock','policyVersion'].includes(k)))fail('validation_failed');
  const {db,access,clock=Date.now,policyVersion}=options;
  if(policyVersion!==policy||typeof clock!=='function'||!access||typeof access.withSession!=='function')fail('validation_failed');
  const {PGlite}=await import('@electric-sql/pglite');
  if(!(db instanceof PGlite))fail('validation_failed');
  const now=()=>{const at=clock();if(!Number.isSafeInteger(at)||at<0||at>8640000000000000)fail('unavailable');return at;};now();
  if((await db.query('SELECT version FROM schema_migrations WHERE version=7')).rows.length!==1)fail('unavailable');
  await db.query('SELECT singleton FROM consent_global_throttle WHERE singleton=true');

  const latest=async(tx,h)=>(await tx.query('SELECT * FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[h])).rows[0];
  function projection(row) {
    const state=!row?'absent':row.policy_version!==policy?'policy_mismatch':row.state;
    const active=state==='active';
    return {status:'consent',synthetic_only:true,policy_version:policy,state,consent_epoch:row?number(row.consent_epoch):0,
      required_service:active,optional_contact:active&&row.optional_contact,optional_story:active&&row.optional_story};
  }
  async function status(token) {
    return access.withSession(token,async(tx,scope)=>projection(await latest(tx,scope.householdId)));
  }
  async function quota(tx,h,at) {
    // Issuer singleton and household are already locked by withSession.
    await tx.query('INSERT INTO consent_household_throttle VALUES($1,$2,0) ON CONFLICT DO NOTHING',[h,at]);
    for(const [table,limit,where,args] of [
      ['consent_global_throttle',120,'singleton=true',[]],
      ['consent_household_throttle',30,'household_id=$1',[h]],
    ]) {
      const row=(await tx.query(`SELECT * FROM ${table} WHERE ${where} FOR UPDATE`,args)).rows[0];
      if(!row)fail('unavailable');
      let start=number(row.window_started_ms),count=number(row.attempts);
      if(at<start)fail('rate_limited');
      if(at-start>=60000){start=at;count=0;}
      if(count>=limit)fail('rate_limited');
      if(args.length)await tx.query(`UPDATE ${table} SET window_started_ms=$2,attempts=$3 WHERE household_id=$1`,[h,start,count+1]);
      else await tx.query(`UPDATE ${table} SET window_started_ms=$1,attempts=$2 WHERE singleton=true`,[start,count+1]);
    }
  }
  async function mutate(token,input,kind) {
    const record=kind==='record';
    exact(input,record?['command_id','policy_version','required_service','optional_contact','optional_story']:['command_id','policy_version']);
    if(!uuid(input.command_id)||input.policy_version!==policy)fail('validation_failed');
    if(record && (['required_service','optional_contact','optional_story'].some(k=>typeof input[k]!=='boolean')
      || !input.required_service&&(input.optional_contact||input.optional_story)))fail('validation_failed');
    // Validate and snapshot before yielding, so caller mutation cannot alter intent.
    const command=clone(input);
    return access.withSession(token,async(tx,{adultId,householdId:h})=>{
      const hash=createHash('sha256').update(canonical({adultId,kind,command})).digest('hex');
      const prior=(await tx.query('SELECT canonical_digest,result FROM consent_commands WHERE household_id=$1 AND command_id=$2',[h,command.command_id])).rows[0];
      if(prior){if(prior.canonical_digest!==hash)fail('conflict');return clone(prior.result);}
      let row=await latest(tx,h),epoch=row?number(row.consent_epoch):0;
      const affirmative=record&&command.required_service;
      if(affirmative)await quota(tx,h,now());
      const sameActive=affirmative&&row?.state==='active'&&row.policy_version===policy;
      const withdraw=!affirmative&&row?.state==='active';
      if(affirmative&&!sameActive || withdraw) {
        if(epoch>=Number.MAX_SAFE_INTEGER)fail('unavailable');
        epoch++;
        await tx.query("UPDATE service_consents SET state='withdrawn',optional_contact=false,optional_story=false WHERE household_id=$1 AND state='active'",[h]);
        await tx.query('INSERT INTO service_consents(household_id,consent_epoch,state,policy_version,optional_contact,optional_story,record_receipt_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [h,epoch,affirmative?'active':'withdrawn',policy,affirmative&&command.optional_contact,affirmative&&command.optional_story,command.command_id]);
      } else if(sameActive) {
        await tx.query('UPDATE service_consents SET optional_contact=$3,optional_story=$4,record_receipt_id=$5 WHERE household_id=$1 AND consent_epoch=$2',
          [h,epoch,command.optional_contact,command.optional_story,command.command_id]);
      }
      const result={status:'recorded',synthetic_only:true,command_id:command.command_id,operation:kind,
        outcome:affirmative?'active':record?'refused':'withdrawn',consent_epoch:epoch,policy_version:policy};
      await tx.query('INSERT INTO consent_commands(household_id,command_id,adult_id,command_kind,canonical_digest,result) VALUES($1,$2,$3,$4,$5,$6)',
        [h,command.command_id,adultId,kind,hash,JSON.stringify(result)]);
      return clone(result);
    });
  }
  return Object.freeze({status,record:(token,command)=>mutate(token,command,'record'),withdraw:(token,command)=>mutate(token,command,'withdraw')});
}
