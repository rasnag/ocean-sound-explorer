import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {animals} from '../lib/expedition.mjs';

test('every game animal uses a bundled same-origin MP3',async()=>{
 for(const animal of animals){
  assert.equal(animal.source,undefined,`${animal.id} must not load from a remote URL`);
  await access(new URL(`../public/audio/${animal.id}.mp3`,import.meta.url));
 }
});
