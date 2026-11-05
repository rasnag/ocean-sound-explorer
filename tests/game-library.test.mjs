import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {games} from '../lib/games.mjs';

test('every public game has a distinct playable route and valid scripts',()=>{
  assert.equal(games.length,10);
  assert.equal(new Set(games.map(g=>g.slug)).size,10);
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
  for(const game of games){
    if(['ocean-sound-explorer','make-the-moon'].includes(game.slug)){
      assert.ok(config.rewrites.some(r=>r.source==='/'+game.slug&&r.destination==='/index.html'));
      continue;
    }
    const html=readFileSync(new URL(`../public/${game.slug}/index.html`,import.meta.url),'utf8');
    assert.ok(html.length>1000,game.slug);
    assert.doesNotMatch(html,/\{\{CHILD\}\}/,game.slug);
    assert.doesNotMatch(html,/<(?:a|button)[^>]*\bid=["']wa["']/i,game.slug);
    for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
      new Script(match[1],{filename:game.slug});
    }
  }
});
