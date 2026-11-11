import {randomUUID} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';
import {createPlayer,validateAdventure} from '../lib/loop/player-engine.mjs';
import {createAssistedPlayer,validateAssistedAdventure} from '../lib/loop/assisted-player.mjs';
import {canonical,digest,exactObject,isSyntheticPlayJournal,playError} from './play-journal.mjs';

const scopeKeys=['household_id','child_id','assignment_id','play_id','revision_id','consent_epoch'];
const startKeys=['contract_version','command_id','play_id','consent_epoch','revision_id','pattern_version','engine_version'];
const actionKeys=['contract_version','play_id','action_id','expected_sequence','consent_epoch','revision_id','pattern_version','action'];
const resumeKeys=['play_id','revision_id','consent_epoch'];
const uuid=v=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const equal=(a,b)=>canonical(a)===canonical(b);
const clone=v=>structuredClone(v);
const healthByJournal=new WeakMap();
// PGlite supports one transaction at a time. All factory instances share this queue.
// Direct fixture SQL (including withdrawal) can run at the post-primary journal boundary.
let processQueue=Promise.resolve();
function serial(fn) {
  const result=processQueue.then(fn);
  processQueue=result.catch(()=>{});
  return result;
}
function freeze(value) {
  if(value && typeof value==='object') { Object.values(value).forEach(freeze);Object.freeze(value); }
  return value;
}
export function validateSyntheticPlayScope(scope) {
  exactObject(scope,scopeKeys);
  if(scopeKeys.filter(k=>k!=='consent_epoch').some(k=>!uuid(scope[k])) || !positive(scope.consent_epoch)) throw playError('validation_failed');
  return clone(scope);
}
function validateCommand(command,kind) {
  exactObject(command,kind==='start'?startKeys:kind==='action'?actionKeys:resumeKeys);
  if(!uuid(command.play_id)||!uuid(command.revision_id)||!positive(command.consent_epoch)) throw playError('validation_failed');
  if(kind!=='resume' && (command.contract_version!=='1.1.0'||command.pattern_version!=='fixture-1')) throw playError('validation_failed');
  if(kind==='start' && (!uuid(command.command_id)||!['fixture-engine-1','fixture-engine-2'].includes(command.engine_version))) throw playError('validation_failed');
  if(kind==='action' && (!uuid(command.action_id)||!Number.isSafeInteger(command.expected_sequence)||command.expected_sequence<0)) throw playError('validation_failed');
  canonical(command);
  return clone(command);
}
function matches(scope,command) {
  if(['play_id','revision_id','consent_epoch'].some(k=>scope[k]!==command[k])) throw playError('denied');
}
function engine(entry,scope) {
  return entry.spec.engine_version==='fixture-engine-1'
    ? createPlayer(entry.spec,{playId:scope.play_id,consentEpoch:scope.consent_epoch})
    : createAssistedPlayer(entry.spec,{playId:scope.play_id,consentEpoch:scope.consent_epoch,startingPath:entry.starting_path,startingReason:entry.starting_reason});
}
function binding(entry,scope) {
  return {...scope,spec_digest:digest(entry.spec),contract_version:entry.spec.contract_version,
    pattern_version:entry.spec.pattern_version,engine_version:entry.spec.engine_version,
    starting_path:entry.starting_path,starting_reason:entry.starting_reason};
}
function domainEvent(action,state) {
  switch(action.kind) {
    case 'predict': return ['prediction_recorded',{prediction:state.prediction}];
    case 'configure': return ['configuration_committed',{configuration:state.configuration}];
    case 'test': {
      const t=state.trials.at(-1);
      return ['test_resolved',{trial_id:t.trial_id,prediction_action_id:t.prediction_action_id,
        configuration_action_id:t.configuration_action_id,configuration:t.configuration,outcome:t.outcome}];
    }
    case 'compare': return ['comparison_viewed',{trial_ids:[...state.comparison]}];
    case 'help': return ['help_used',{level:state.help_level}];
    case 'close_help': return ['help_closed',{open:false}];
    case 'side_thread': return ['side_thread_changed',{open:state.side_thread_open}];
    default: throw playError('validation_failed');
  }
}
function candidate(scope,command,state,eventCursor,ids,serverAt) {
  const checkpoint={checkpoint_id:ids.checkpoint_id,last_action_sequence:state.sequence,
    last_event_sequence:eventCursor,state:clone(state)};
  const result={status:'acknowledged',mode:'local-synthetic',acknowledgement_scope:'single-host-process-recovery-only',
    production_ready:false,play_id:scope.play_id,action_id:command.action_id??null,
    primary_commit_id:ids.primary_commit_id,durability_ref:'local-fsync:'+ids.record_id,checkpoint,events:[]};
  if(command.action_id) {
    const [eventType,data]=domainEvent(command.action,state);
    const event=(type,payload,index)=>({contract_version:'1.1.0',kind:'play_event',event_type:type,
      event_id:command.action_id+':event:'+index,play_id:scope.play_id,action_id:command.action_id,
      sequence:eventCursor+index,action_sequence:state.sequence,server_at:serverAt,
      revision_id:scope.revision_id,pattern_version:'fixture-1',source:'server_observation',data:payload});
    result.events.push(event(eventType,data,1));
    if(command.action.kind==='test') result.events.push(event('progress_saved',{
      checkpoint_id:checkpoint.checkpoint_id,last_action_sequence:state.sequence,
      primary_commit_id:ids.primary_commit_id,durability_ref:result.durability_ref},2));
    checkpoint.last_event_sequence=eventCursor+result.events.length;
  }
  return result;
}
function makeRecord(scope,command,result,recordId) {
  return {version:1,synthetic_only:true,record_id:recordId,household_id:scope.household_id,
    play_id:scope.play_id,primary_commit_id:result.primary_commit_id,command_digest:digest({scope,command}),result};
}
const newIds=()=>({checkpoint_id:randomUUID(),primary_commit_id:randomUUID(),record_id:randomUUID()});
function idsFrom(row) {
  const ids={checkpoint_id:row.result?.checkpoint?.checkpoint_id,
    primary_commit_id:row.result?.primary_commit_id,record_id:row.journal_record?.record_id};
  if(Object.values(ids).some(v=>!uuid(v))) throw playError('recovery_required');
  return ids;
}
const pending=row=>({status:'retryable_unacknowledged',mode:'local-synthetic',production_ready:false,
  play_id:row.result.play_id,action_id:row.result.action_id,primary_commit_id:row.result.primary_commit_id});

/** Synchronous construction; all stateful operations below are async. */
export function createSyntheticPlayService({db,env,catalog,journal,clock=Date.now}) {
  resolveLoopConfig(env);
  if(!db || typeof db.transaction!=='function' || typeof db.query!=='function'
    || !isSyntheticPlayJournal(journal) || typeof clock!=='function'
    || !Array.isArray(catalog) || !catalog.length) throw playError('validation_failed');
  canonical(catalog);
  const entries=new Map();
  for(const item of catalog) {
    exactObject(item,['household_id','revision_id','spec','starting_path','starting_reason']);
    if(!uuid(item.household_id)||!uuid(item.revision_id)||item.spec.revision_id!==item.revision_id
      || !['fast','medium','slow'].includes(item.starting_path)
      || typeof item.starting_reason!=='string'||!item.starting_reason.trim()||item.starting_reason.length>2000) throw playError('validation_failed');
    try {
      if(item.spec.engine_version==='fixture-engine-1') validateAdventure(item.spec);
      else validateAssistedAdventure(item.spec);
    } catch { throw playError('validation_failed'); }
    const key=item.household_id+':'+item.revision_id;
    if(entries.has(key)) throw playError('validation_failed');
    entries.set(key,freeze(clone(item)));
  }
  if(!healthByJournal.has(journal)) healthByJournal.set(journal,{state:'healthy'});
  const health=healthByJournal.get(journal);
  const quarantined=new Set();
  const key=s=>s.household_id+':'+s.play_id;
  const params=s=>[s.household_id,s.play_id];
  async function rows(tx,sql,args) { return (await tx.query(sql,args)).rows; }
  async function authorize(tx,scope) {
    const household=await rows(tx,'SELECT household_id FROM households WHERE household_id=$1 FOR UPDATE',[scope.household_id]);
    if(household.length!==1) throw playError('denied');
    const consent=await rows(tx,'SELECT consent_epoch,state FROM service_consents WHERE household_id=$1 ORDER BY consent_epoch DESC LIMIT 1 FOR UPDATE',[scope.household_id]);
    if(consent.length!==1 || consent[0].state!=='active' || Number(consent[0].consent_epoch)!==scope.consent_epoch) throw playError('denied');
    const preliminary=await rows(tx,'SELECT request_id FROM assignments WHERE household_id=$1 AND assignment_id=$2',[scope.household_id,scope.assignment_id]);
    if(preliminary.length!==1) throw playError('denied');
    const requestId=preliminary[0].request_id;
    const request=await rows(tx,'SELECT child_id FROM wonder_requests WHERE household_id=$1 AND request_id=$2 FOR UPDATE',[scope.household_id,requestId]);
    if(request.length!==1||request[0].child_id!==scope.child_id) throw playError('denied');
    const revision=await rows(tx,'SELECT request_id,pattern_version,engine_version,status FROM adventure_revisions WHERE household_id=$1 AND revision_id=$2 FOR UPDATE',[scope.household_id,scope.revision_id]);
    const entry=entries.get(scope.household_id+':'+scope.revision_id);
    if(!entry || revision.length!==1 || revision[0].request_id!==requestId || revision[0].status!=='published'
      || revision[0].pattern_version!==entry.spec.pattern_version || revision[0].engine_version!==entry.spec.engine_version) throw playError('denied');
    const publication=await rows(tx,'SELECT revision_id FROM published_revisions WHERE household_id=$1 AND revision_id=$2',[scope.household_id,scope.revision_id]);
    const assignment=await rows(tx,'SELECT request_id,child_id,revision_id FROM assignments WHERE household_id=$1 AND assignment_id=$2 FOR UPDATE',[scope.household_id,scope.assignment_id]);
    const child=await rows(tx,'SELECT child_id FROM children WHERE household_id=$1 AND child_id=$2',[scope.household_id,scope.child_id]);
    if(publication.length!==1||child.length!==1||assignment.length!==1
      || assignment[0].request_id!==requestId || assignment[0].child_id!==scope.child_id || assignment[0].revision_id!==scope.revision_id) throw playError('denied');
    return entry;
  }
  async function chain(tx,scope,entry) {
    try {
      if(quarantined.has(key(scope))) throw playError('recovery_required');
      const sessions=await rows(tx,'SELECT * FROM play_sessions WHERE household_id=$1 AND play_id=$2 FOR UPDATE',params(scope));
      const metadata=await rows(tx,'SELECT binding FROM play_service_metadata WHERE household_id=$1 AND play_id=$2',params(scope));
      const starts=await rows(tx,'SELECT * FROM play_start_commands WHERE household_id=$1 AND play_id=$2',params(scope));
      const checkpoints=await rows(tx,'SELECT checkpoint FROM play_checkpoints WHERE household_id=$1 AND play_id=$2',params(scope));
      if(sessions.length!==1||metadata.length!==1||starts.length!==1||checkpoints.length!==1) throw Error();
      const session=sessions[0],stored=metadata[0].binding;
      if(['assignment_id','child_id','revision_id'].some(k=>session[k]!==scope[k])) throw playError('denied');
      if(stored.consent_epoch!==scope.consent_epoch) throw playError('denied');
      if(!equal(stored,binding(entry,scope))) throw Error();
      const player=engine(entry,scope),start=starts[0];
      validateCommand(start.command,'start');matches(scope,start.command);
      if(start.command.command_id!==start.command_id || start.command.engine_version!==entry.spec.engine_version) throw Error();
      function verifyRow(row,expected) {
        if(!['pending','acknowledged'].includes(row.ack_state)
          || row.canonical_digest!==digest({scope,command:row.command})
          || !equal(row.result,expected)
          || !equal(row.journal_record,makeRecord(scope,row.command,expected,row.journal_record.record_id))) throw Error();
      }
      verifyRow(start,candidate(scope,start.command,player.snapshot(),0,idsFrom(start)));
      const commands=await rows(tx,'SELECT * FROM play_action_commands WHERE household_id=$1 AND play_id=$2 ORDER BY sequence',params(scope));
      const events=await rows(tx,'SELECT * FROM play_events WHERE household_id=$1 AND play_id=$2 ORDER BY sequence',params(scope));
      if(events.length!==commands.length) throw Error();
      let eventCursor=0,latest=start,seenPending=start.ack_state==='pending';
      for(let i=0;i<commands.length;i++) {
        const row=commands[i],event=events[i];
        if(seenPending || Number(row.sequence)!==i+1 || row.command.action_id!==row.action_id
          || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/.test(row.server_at)
          || new Date(row.server_at).toISOString().replace(/\.\d{3}Z$/,'Z')!==row.server_at) throw Error();
        validateCommand(row.command,'action');matches(scope,row.command);
        const state=player.dispatch(row.command);
        const expected=candidate(scope,row.command,state,eventCursor,idsFrom(row),row.server_at);
        verifyRow(row,expected);
        if(event.action_id!==row.action_id || Number(event.sequence)!==i+1 || !equal(event.payload,{events:expected.events})) throw Error();
        eventCursor=expected.checkpoint.last_event_sequence;
        latest=row;seenPending=row.ack_state==='pending';
      }
      if(Number(session.sequence)!==commands.length || !equal(checkpoints[0].checkpoint,latest.result.checkpoint)) throw Error();
      return {player,start,commands,latest};
    } catch(error) {
      if(error?.code==='denied') throw error;
      quarantined.add(key(scope));
      throw playError('recovery_required');
    }
  }
  async function verifyJournal(row) {
    let actual;
    try { actual=await journal.read(row.journal_record.record_id); }
    catch { health.state='journal_unavailable';throw playError('recovery_required'); }
    if(!actual||!equal(actual,row.journal_record)||actual.result.durability_ref!=='local-fsync:'+actual.record_id) {
      health.state='journal_unavailable';throw playError('recovery_required');
    }
  }
  async function confirm(scope,row) {
    try {
      const reference=await journal.append(clone(row.journal_record));
      if(reference!==row.result.durability_ref) throw playError('recovery_required');
      await verifyJournal(row);
    } catch {
      health.state='journal_unavailable';
      return pending(row);
    }
    try {
      await db.transaction(async tx=>{
        const entry=await authorize(tx,scope),history=await chain(tx,scope,entry);
        const target=row.result.action_id===null?history.start:history.commands.find(c=>c.action_id===row.result.action_id);
        if(!target||!equal(target.journal_record,row.journal_record)) throw playError('recovery_required');
        if(target.ack_state==='pending') {
          const isStart=target.result.action_id===null;
          const table=isStart?'play_start_commands':'play_action_commands';
          const idColumn=isStart?'command_id':'action_id';
          const id=isStart?target.command_id:target.action_id;
          const changed=await rows(tx,`UPDATE ${table} SET ack_state='acknowledged' WHERE household_id=$1 AND play_id=$2 AND ${idColumn}=$3 AND ack_state='pending' RETURNING canonical_digest`,[scope.household_id,scope.play_id,id]);
          if(changed.length!==1||changed[0].canonical_digest!==row.canonical_digest) throw playError('recovery_required');
        }
      });
    } catch(error) {
      if(error?.code==='denied') throw playError('denied');
      return pending(row);
    }
    health.state='healthy';
    return clone(row.result);
  }
  async function receipt(scope,row) {
    if(row.ack_state==='pending') return confirm(scope,row);
    await verifyJournal(row);
    // Journal IO is outside the transaction. Recheck current authorization afterwards.
    await db.transaction(async tx=>{const entry=await authorize(tx,scope);await chain(tx,scope,entry);});
    return clone(row.result);
  }
  function prepare(scope,input,kind) {
    const s=validateSyntheticPlayScope(scope),c=validateCommand(input,kind);
    matches(s,c);return [s,c];
  }
  function operation(fn) {
    return serial(async()=>{
      try { return await fn(); }
      catch(error) {
        if(['validation_failed','denied','conflict','recovery_required','journal_unavailable','23514'].includes(error?.code)) throw playError(error.code);
        throw playError('recovery_required');
      }
    });
  }
  return Object.freeze({
    health:()=>({state:health.state}),
    async start(scope,input) {
      const [s,c]=prepare(scope,input,'start');
      return operation(async()=>{
        const row=await db.transaction(async tx=>{
          const entry=await authorize(tx,s);
          if(c.engine_version!==entry.spec.engine_version) throw playError('validation_failed');
          const sameId=await rows(tx,'SELECT * FROM play_start_commands WHERE household_id=$1 AND command_id=$2',[s.household_id,c.command_id]);
          if(sameId.length) {
            if(sameId[0].canonical_digest!==digest({scope:s,command:c})) throw playError('conflict');
            await chain(tx,s,entry);return sameId[0];
          }
          const existing=await rows(tx,'SELECT play_id FROM play_sessions WHERE household_id=$1 AND play_id=$2 FOR UPDATE',params(s));
          if(existing.length) throw playError('recovery_required');
          if(health.state!=='healthy') throw playError('journal_unavailable');
          const ids=newIds(),result=candidate(s,c,engine(entry,s).snapshot(),0,ids);
          const record=makeRecord(s,c,result,ids.record_id);
          await tx.query('INSERT INTO play_sessions(household_id,play_id,assignment_id,child_id,revision_id,sequence) VALUES($1,$2,$3,$4,$5,0)',[s.household_id,s.play_id,s.assignment_id,s.child_id,s.revision_id]);
          await tx.query('INSERT INTO play_service_metadata(household_id,play_id,binding) VALUES($1,$2,$3::jsonb)',[...params(s),canonical(binding(entry,s))]);
          await tx.query('INSERT INTO play_start_commands(household_id,play_id,command_id,canonical_digest,command,result,journal_record) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)',[...params(s),c.command_id,record.command_digest,canonical(c),canonical(result),canonical(record)]);
          await tx.query('INSERT INTO play_checkpoints(household_id,play_id,checkpoint) VALUES($1,$2,$3::jsonb)',[...params(s),canonical(result.checkpoint)]);
          return {command_id:c.command_id,command:c,canonical_digest:record.command_digest,result,journal_record:record,ack_state:'pending'};
        });
        return receipt(s,row);
      });
    },
    async commit(scope,input) {
      const [s,c]=prepare(scope,input,'action');
      return operation(async()=>{
        const row=await db.transaction(async tx=>{
          const entry=await authorize(tx,s),history=await chain(tx,s,entry);
          const duplicate=history.commands.find(row=>row.action_id===c.action_id);
          if(duplicate) {
            if(duplicate.canonical_digest!==digest({scope:s,command:c})) throw playError('conflict');
            if(history.latest.ack_state==='pending' && history.latest!==duplicate) throw playError('journal_unavailable');
            return duplicate;
          }
          if(history.latest.ack_state==='pending') throw playError('journal_unavailable');
          if(c.expected_sequence!==history.player.snapshot().sequence) throw playError('conflict');
          if(health.state!=='healthy') throw playError('journal_unavailable');
          let state;
          try { state=history.player.dispatch(c); } catch { throw playError('validation_failed'); }
          const instant=clock();
          if(typeof instant!=='number'||!Number.isFinite(instant)) throw playError('recovery_required');
          const serverAt=new Date(instant).toISOString().replace(/\.\d{3}Z$/,'Z'),ids=newIds();
          const result=candidate(s,c,state,history.latest.result.checkpoint.last_event_sequence,ids,serverAt);
          const record=makeRecord(s,c,result,ids.record_id);
          await tx.query('INSERT INTO play_action_commands(household_id,play_id,action_id,sequence,canonical_digest,command,server_at,result,journal_record) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9::jsonb)',[...params(s),c.action_id,state.sequence,record.command_digest,canonical(c),serverAt,canonical(result),canonical(record)]);
          await tx.query('INSERT INTO play_events(household_id,play_id,action_id,sequence,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[...params(s),c.action_id,state.sequence,canonical({events:result.events})]);
          await tx.query('UPDATE play_checkpoints SET checkpoint=$3::jsonb WHERE household_id=$1 AND play_id=$2',[...params(s),canonical(result.checkpoint)]);
          const changed=await rows(tx,'UPDATE play_sessions SET sequence=$3 WHERE household_id=$1 AND play_id=$2 AND sequence=$4 RETURNING sequence',[...params(s),state.sequence,c.expected_sequence]);
          if(changed.length!==1) throw playError('conflict');
          return {action_id:c.action_id,command:c,canonical_digest:record.command_digest,result,journal_record:record,ack_state:'pending'};
        });
        return receipt(s,row);
      });
    },
    async resume(scope,input) {
      const [s]=prepare(scope,input,'resume');
      return operation(async()=>{
        const latest=await db.transaction(async tx=>{const entry=await authorize(tx,s);return (await chain(tx,s,entry)).latest;});
        if(latest.ack_state!=='acknowledged') return pending(latest);
        return receipt(s,latest);
      });
    },
    async reconcile(scope) {
      const s=validateSyntheticPlayScope(scope);
      return operation(async()=>{
        const latest=await db.transaction(async tx=>{const entry=await authorize(tx,s);return (await chain(tx,s,entry)).latest;});
        return receipt(s,latest);
      });
    },
  });
}
