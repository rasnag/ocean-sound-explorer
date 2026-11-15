// Actual disposable composition; no SQL publication seeds or parent-auth substitutes.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {reviewFixture,readyReviewRequest,recordAll,reviewRead,reviewCommand} from './loop-review-service.test.mjs';
import {createSyntheticPrivateBridgeJournal} from '../server/private-bridge-journal.mjs';
import {createSyntheticPrivateBridge} from '../server/private-bridge.mjs';
import {createEntitlementKernel} from '../lib/loop/entitlements.mjs';
import {createSyntheticFamilySpace} from '../server/family-space.mjs';
import {createSyntheticPlayJournal} from '../server/play-journal.mjs';
import {createSyntheticPlayService} from '../server/play-service.mjs';
import {createSyntheticAdultAccessServer} from '../server/adult-http.mjs';
export async function privateBridgeFixture(t){
 const f=await reviewFixture(t),g=f.generationOptions(),keys=f.journalOptions().keys;
 const directory=await mkdtemp(join(tmpdir(),'loop-private-bridge-')),playDirectory=await mkdtemp(join(tmpdir(),'loop-private-bridge-'));
 let journal,bridge,family,playJournal,play,selected=null,outage=false,hook=null;const servers=[];
 const calls={start:0,commit:0,resume:0,reconcile:0};
 const journalOptions=()=>({env:g.env,directory,keys,testHooks:{beforeAppend:async()=>{if(hook){const fn=hook;hook=null;await fn();}if(outage)throw Error('Invented bridge append outage');}}});
 const bridgeOptions=(override={})=>({env:g.env,db:f.db,auth:g.auth,review:{acquireBridgeSource:(...a)=>f.review.acquireBridgeSource(...a),assertBridgeActivation:(...a)=>f.review.assertBridgeActivation(...a),readPublishedBridgeSnapshot:(...a)=>f.review.readPublishedBridgeSnapshot(...a)},queue:f.queueAdapter,kernel:createEntitlementKernel({env:g.env,clock:f.clock}),journal,keys:g.keys,policyVersion:'TEST-v1',clock:f.clock,...override});
 const unavailable=()=>{throw Object.assign(new Error('Local TEST player unavailable.'),{code:'configuration_missing',status:503});};
 async function familyWith(adapter){return createSyntheticFamilySpace({env:g.env,db:f.db,access:f.access,content:{question:f.capture.question,revision:async()=>{throw Error('Bridge content must never reach the legacy resolver');}},play:{resume:(...a)=>{if(!play)unavailable();return play.resume(...a);},reconcile:(...a)=>{if(!play)unavailable();return play.reconcile(...a);}},queue:f.queueAdapter,clock:f.clock,policyVersion:'TEST-v1',...(adapter===undefined?{}:{bridge:adapter})});}
 async function reopenBridge(){bridge?.close();await journal?.close();journal=await createSyntheticPrivateBridgeJournal(journalOptions());bridge=await createSyntheticPrivateBridge(bridgeOptions());family=await familyWith(bridge.familyAdapter);}
 async function prepareBridgePlay(snapshot){if(selected){assert.equal(selected,snapshot.snapshot_id);return;}playJournal=await createSyntheticPlayJournal({env:g.env,directory:playDirectory});const actual=createSyntheticPlayService({env:g.env,db:f.db,journal:playJournal,clock:f.clock,catalog:[{household_id:f.adult.householdId,revision_id:snapshot.revision_id,spec:snapshot.adventure,starting_path:'medium',starting_reason:'Invented fixed local TEST path; no ability assessment.'}]});play=Object.freeze(Object.fromEntries(['start','commit','resume','reconcile'].map(k=>[k,(...args)=>{calls[k]++;return actual[k](...args);}])));selected=snapshot.snapshot_id;}
 f.cleanup(async()=>{for(const server of servers)if(server.listening)await new Promise(done=>{server.close(done);server.closeAllConnections?.();});bridge?.close();await journal?.close();await playJournal?.close();for(const dir of [directory,playDirectory]){assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert(basename(dir).startsWith('loop-private-bridge-'));await rm(dir,{recursive:true,force:true});}});
 await reopenBridge();
 return {...f,get generation(){return f.generation;},get review(){return f.review;},get founderToken(){return f.founderToken;},get family(){return family;},get bridge(){return bridge;},bridgeDirectory:directory,bridgeOptions,bridgeJournalOptions:journalOptions,bridgeOutage:v=>{outage=v;},beforeBridgeAppend:fn=>{hook=fn;},reopenBridge,prepareBridgePlay,playCalls:()=>({...calls}),familyWith,async openFamilyServer(overrides={}){const forwarding={index:(...a)=>family.index(...a),read:(...a)=>family.read(...a),open:(...a)=>family.open(...a)};const server=createSyntheticAdultAccessServer({env:g.env,access:f.access,consent:f.consent,setup:f.setup,capture:f.capture,production:f.production,queue:f.queueAdapter,family:forwarding,...overrides});servers.push(server);await new Promise(done=>server.listen(0,'127.0.0.1',done));return {server,origin:'http://127.0.0.1:'+server.address().port};}};
}
export async function readyBridgeSource(f,words='Invented private readiness question.'){
 const scope=await readyReviewRequest(f,words);await recordAll(f,scope);let view=await reviewRead(f,scope);
 assert.equal((await f.review.command(f.founderToken,reviewCommand(scope,view,'ReleaseTestSnapshot',{predecessor_snapshot_id:null}))).status,'acknowledged');
 view=await reviewRead(f,scope);const snapshot=view.snapshots.find(x=>x.revision_id===view.revision.revision_id);assert(snapshot&&!snapshot.withdrawn);
 const acquired=await f.review.acquireBridgeSource(f.founderToken,{...scope,snapshot_id:snapshot.snapshot_id});assert.deepEqual(acquired.adventure,snapshot.adventure);await f.prepareBridgePlay(snapshot);
 return {scope,view,snapshot,command:{...scope,command:{command_id:randomUUID(),expected_version:0,action:'MakeAssignmentReady',source:acquired.pin}}};
}
