// Authored regression. Not run by the author.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {request} from 'node:http';
import {mkdtemp,rm,symlink,unlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createJourneyAssets,journeyAssetSeam} from '../server/journey-local.mjs';
import {createProtectedJourney} from '../server/journey-composition.mjs';
import {startJourneyDemo} from '../server/journey-demo.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const deps='/node_modules/.vite/deps/';
const progress=deps+'@base-ui_react_progress.js';

function get(origin,path){
 // A raw request path preserves dot segments for the server's traversal guard.
 return new Promise((resolve,reject)=>{
  const url=new URL(origin);
  const req=request({hostname:url.hostname,port:url.port,path,headers:{Connection:'close'}},res=>{
   const chunks=[];
   res.on('data',chunk=>chunks.push(chunk));
   res.on('error',reject);
   res.on('end',()=>resolve({status:res.statusCode,type:res.headers['content-type']??'',body:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('error',reject);
  req.end();
 });
}

test('actual journey serves only the approved scoped progress dependency and its map',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'loop-journey-scoped-assets-'));
 let assets,demo,unrelatedFile,link;
 t.after(async()=>{
  try{await demo?.close();}finally{
   try{await assets?.close();}finally{
    try{if(link)await unlink(link);}finally{
     try{if(unrelatedFile)await unlink(unrelatedFile);}finally{await rm(directory,{recursive:true,force:true});}
    }
   }
  }
 });
 demo=await startJourneyDemo({
  env:{LOOP_ENV:'local-synthetic'},directory,
  createAssets:async()=>{assets=await createJourneyAssets();return {serve:assets.serve,close:assets.close};},
  createProtectedJourney:config=>createProtectedJourney({...config,serve:journeyAssetSeam(config.serve,assets)})
 });
 const health=await assets.health();
 assert.equal(health.ready,true);
 assert.ok(health.checked.includes(progress));
 assert.ok(health.checked.includes(progress+'.map'));
 const read=path=>get(demo.parentOrigin,path);
 const component=await read('/components/ui/progress.tsx');
 assert.equal(component.status,200);
 const imports=[...component.body.matchAll(/\bimport\s+(?:[^;\n]*?\sfrom\s*)?["']([^"']+)["']/g)].map(match=>match[1]);
 const imported=imports.find(path=>path.split('?')[0]===progress);
 assert.ok(imported,'The served component must import the exact generated dependency');
 const js=await read(imported);
 assert.equal(js.status,200);
 assert.match(js.type,/(?:java|ecma)script/i);
 assert.ok(js.body.length>100);
 assert.doesNotMatch(js.body,/<(?:!doctype|html)/i);
 const map=await read(progress+'.map');
 assert.equal(map.status,200);
 const sourceMap=JSON.parse(map.body);
 assert.equal(sourceMap.version,3);
 assert.ok(Array.isArray(sourceMap.sources)&&sourceMap.sources.length>0);

 const name='journey-scope-test-'+randomUUID();
 const unrelated=deps+'@'+name+'.js';
 const candidate=join(root,unrelated.slice(1));
 await writeFile(candidate,'export const unrelatedScopedSentinel = true;\n',{flag:'wx'});
 unrelatedFile=candidate;
 assert.equal((await read(unrelated)).status,404);
 const traversed=await read(deps+'../deps/@base-ui_react_progress.js');
 assert.equal(traversed.status,404);
 assert.notEqual(traversed.body,js.body);
 assert.equal((await read(progress+'?unapproved=1')).status,404);

 const outside=join(directory,'outside');
 const {mkdir}=await import('node:fs/promises');
 await mkdir(outside);
 const sentinel='private-symlink-confinement-sentinel';
 await writeFile(join(outside,'probe.js'),`export default ${JSON.stringify(sentinel)};\n`,{flag:'wx'});
 const linkedDirectory=join(root,'components',name);
 await symlink(outside,linkedDirectory,'junction');
 link=linkedDirectory;
 const denied=await read('/components/'+name+'/probe.js');
 assert.equal(denied.status,503);
 assert.ok(!denied.body.includes(sentinel));
});
