import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {resolveLoopConfig} from '../lib/loop/environment.mjs';

const branded = new WeakSet();
const openDirectories = new Set();
export const playError = code => Object.assign(new Error('Synthetic play operation unavailable.'), {code});
export function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw playError('validation_failed');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(k => !keys.includes(k))) throw playError('validation_failed');
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value,key);
    if (!d || !d.enumerable || !('value' in d)) throw playError('validation_failed');
  }
}
export function canonical(value) {
  const seen = new Set();
  function visit(v) {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (!v || typeof v !== 'object' || seen.has(v)) throw playError('validation_failed');
    seen.add(v);
    let result;
    if (Array.isArray(v)) {
      if (Reflect.ownKeys(v).length !== v.length+1) throw playError('validation_failed');
      const items=[];
      for(let i=0;i<v.length;i++) {
        const d=Object.getOwnPropertyDescriptor(v,String(i));
        if(!d || !d.enumerable || !('value' in d)) throw playError('validation_failed');
        items.push(visit(d.value));
      }
      result='['+items.join(',')+']';
    } else {
      if(![Object.prototype,null].includes(Object.getPrototypeOf(v))) throw playError('validation_failed');
      const keys=Reflect.ownKeys(v);
      if(keys.some(k=>typeof k!=='string')) throw playError('validation_failed');
      result='{'+keys.sort().map(k=>{
        const d=Object.getOwnPropertyDescriptor(v,k);
        if(!d.enumerable || !('value' in d)) throw playError('validation_failed');
        return JSON.stringify(k)+':'+visit(d.value);
      }).join(',')+'}';
    }
    seen.delete(v);
    return result;
  }
  return visit(value);
}
export const digest = value => createHash('sha256').update(canonical(value),'utf8').digest('hex');
export const isSyntheticPlayJournal = value => branded.has(value);
const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
function validateRecord(record) {
  exactObject(record,['version','synthetic_only','record_id','household_id','play_id','primary_commit_id','command_digest','result']);
  if(record.version!==1 || record.synthetic_only!==true
    || ['record_id','household_id','play_id','primary_commit_id'].some(k=>!uuid(record[k]))
    || !/^[0-9a-f]{64}$/.test(record.command_digest)) throw playError('validation_failed');
  const r=record.result;
  exactObject(r,['status','mode','acknowledgement_scope','production_ready','play_id','action_id','primary_commit_id','durability_ref','checkpoint','events']);
  if(r.status!=='acknowledged' || r.mode!=='local-synthetic'
    || r.acknowledgement_scope!=='single-host-process-recovery-only' || r.production_ready!==false
    || r.play_id!==record.play_id || r.primary_commit_id!==record.primary_commit_id
    || r.durability_ref!=='local-fsync:'+record.record_id
    || !(r.action_id===null || uuid(r.action_id)) || !Array.isArray(r.events)) throw playError('validation_failed');
  exactObject(r.checkpoint,['checkpoint_id','last_action_sequence','last_event_sequence','state']);
  if(!uuid(r.checkpoint.checkpoint_id) || !Number.isSafeInteger(r.checkpoint.last_action_sequence)
    || r.checkpoint.last_action_sequence<0 || !Number.isSafeInteger(r.checkpoint.last_event_sequence)
    || r.checkpoint.last_event_sequence<0) throw playError('validation_failed');
  canonical(record);
}
async function safeDirectory(directory) {
  if(typeof directory!=='string' || !path.isAbsolute(directory) || path.resolve(directory)!==directory) throw playError('validation_failed');
  let cursor=directory;
  while(true) {
    const stat=await lstat(cursor);
    if(stat.isSymbolicLink() || !stat.isDirectory()) throw playError('recovery_required');
    const parent=path.dirname(cursor);
    if(parent===cursor) break;
    cursor=parent;
  }
  if(await realpath(directory)!==directory) throw playError('recovery_required');
  const stat=await lstat(directory);
  if(typeof process.getuid==='function' && (stat.uid!==process.getuid() || (stat.mode & 0o022)!==0)) throw playError('recovery_required');
  return stat;
}

/** Caller supplies an existing exclusively owned synthetic directory. No production data. */
export async function createSyntheticPlayJournal(options) {
  exactObject(options,Object.hasOwn(options??{},'testHooks')?['env','directory','testHooks']:['env','directory']);
  const {env,directory,testHooks}=options;
  resolveLoopConfig(env);
  if(testHooks!==undefined) {
    exactObject(testHooks,['beforeAppend']);
    if(typeof testHooks.beforeAppend!=='function') throw playError('validation_failed');
  }
  const hook=testHooks?.beforeAppend;
  let handle,closed=false,broken=false,tail=Promise.resolve();
  const filename=path.join(directory,'play-journal.log');
  try {
    const directoryStat=await safeDirectory(directory);
    if(openDirectories.has(directory)) throw playError('journal_unavailable');
    openDirectories.add(directory);
    try {
      const stat=await lstat(filename);
      if(!stat.isFile() || stat.isSymbolicLink() || stat.nlink!==1) throw playError('recovery_required');
    } catch(e) { if(e.code!=='ENOENT') throw e; }
    handle=await open(filename,constants.O_RDWR|constants.O_APPEND|constants.O_CREAT|(constants.O_NOFOLLOW??0),0o600);
    const original=await handle.stat();
    if(!original.isFile() || original.nlink!==1
      || (typeof process.getuid==='function' && original.uid!==process.getuid())) throw playError('recovery_required');
    async function checkPath() {
      const d=await safeDirectory(directory),s=await lstat(filename),h=await handle.stat();
      if(d.dev!==directoryStat.dev || d.ino!==directoryStat.ino || !s.isFile() || s.isSymbolicLink()
        || s.nlink!==1 || s.dev!==original.dev || s.ino!==original.ino
        || h.dev!==s.dev || h.ino!==s.ino) throw playError('recovery_required');
    }
    async function load() {
      await checkPath();
      const stat=await handle.stat();
      if(!Number.isSafeInteger(stat.size) || stat.size>128*1024*1024) throw playError('recovery_required');
      const bytes=Buffer.alloc(stat.size);
      let offset=0;
      while(offset<bytes.length) {
        const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);
        if(!bytesRead) throw playError('recovery_required');
        offset+=bytesRead;
      }
      const records=new Map();
      offset=0;
      while(offset<bytes.length) {
        // 8 hex byte count, space, 64 hex SHA256, space, canonical UTF8 JSON, LF.
        if(bytes.length-offset<75) throw playError('recovery_required');
        const prefix=bytes.subarray(offset,offset+74).toString('ascii');
        if(!/^[0-9a-f]{8} [0-9a-f]{64} $/.test(prefix)) throw playError('recovery_required');
        const size=parseInt(prefix.slice(0,8),16),end=offset+74+size;
        if(size<2 || size>8*1024*1024 || end>=bytes.length || bytes[end]!==10) throw playError('recovery_required');
        const payload=bytes.subarray(offset+74,end);
        if(createHash('sha256').update(payload).digest('hex')!==prefix.slice(9,73)) throw playError('recovery_required');
        let record;
        try {
          record=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload));
          validateRecord(record);
          if(canonical(record)!==payload.toString('utf8') || records.has(record.record_id)) throw Error();
        } catch { throw playError('recovery_required'); }
        records.set(record.record_id,record);
        offset=end+1;
      }
      return records;
    }
    await load();
    function serial(fn) {
      const result=tail.then(async()=>{
        if(closed) throw playError('journal_unavailable');
        if(broken) throw playError('recovery_required');
        return fn();
      });
      tail=result.catch(()=>{});
      return result;
    }
    const adapter=Object.freeze({
      append(input) {
        let record;
        try { validateRecord(input); record=JSON.parse(canonical(input)); }
        catch { return Promise.reject(playError('validation_failed')); }
        return serial(async()=>{
          const records=await load(),previous=records.get(record.record_id);
          if(previous) {
            if(canonical(previous)!==canonical(record)) throw playError('conflict');
            return record.result.durability_ref;
          }
          if(hook) await hook(structuredClone(record)); // Return value is deliberately ignored.
          await checkPath();
          const payload=Buffer.from(canonical(record),'utf8');
          if(payload.length>8*1024*1024) throw playError('validation_failed');
          const frame=Buffer.concat([Buffer.from(payload.length.toString(16).padStart(8,'0')+' '+createHash('sha256').update(payload).digest('hex')+' '),payload,Buffer.from('\n')]);
          try {
            let written=0;
            while(written<frame.length) {
              const result=await handle.write(frame,written,frame.length-written,null);
              if(!result.bytesWritten) throw Error();
              written+=result.bytesWritten;
            }
            await handle.sync();
            const confirmed=(await load()).get(record.record_id);
            if(canonical(confirmed)!==canonical(record)) throw Error();
          } catch { broken=true; throw playError('recovery_required'); }
          return record.result.durability_ref;
        });
      },
      read(recordId) {
        if(!uuid(recordId)) return Promise.reject(playError('validation_failed'));
        return serial(async()=>{
          try { const value=(await load()).get(recordId); return value?structuredClone(value):null; }
          catch { broken=true; throw playError('recovery_required'); }
        });
      },
      async close() {
        await tail;
        if(closed) return;
        closed=true;
        try { await handle.close(); } finally { openDirectories.delete(directory); }
      },
    });
    branded.add(adapter);
    return adapter;
  } catch(e) {
    if(handle) await handle.close().catch(()=>{});
    // A failed second open must not remove the first adapter's ownership.
    if(handle) openDirectories.delete(directory);
    if(['validation_failed','recovery_required','journal_unavailable'].includes(e?.code)) throw playError(e.code);
    throw playError('journal_unavailable');
  }
}
