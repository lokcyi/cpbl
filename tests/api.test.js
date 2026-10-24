import test from 'node:test';
import assert from 'node:assert/strict';
import {validDate,validGame,upstream,handleApi} from '../lib/upstream.js';
test('validates calendar dates and fixed-format game identifiers',()=>{
  assert.equal(validDate('2026-07-21'),true);assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('../secret'),false);
  assert.equal(validGame('2026-C-1'),true);assert.equal(validGame('https://example.com'),false);assert.equal(validGame('2026-A-0'),false);
});
test('rejects upstream paths outside allowlist before making a request',async()=>{
  await assert.rejects(upstream('https://example.com'),/Invalid/);
  await assert.rejects(upstream('games/../../secret'),/Invalid/);
});
test('upstream fetch is deduplicated and cached',async()=>{
  let count=0;
  const fetcher=async()=>{count++;await new Promise(r=>setTimeout(r,5));return {ok:true,json:async()=>({Data:{Game:{GameId:'2026-A-9999'}}})};};
  const [a,b]=await Promise.all([upstream('games/2026-A-9999',{fetcher}),upstream('games/2026-A-9999',{fetcher})]);
  assert.equal(count,1);assert.equal(a.raw.Data.Game.GameId,b.raw.Data.Game.GameId);
  assert.equal((await upstream('games/2026-A-9999',{fetcher})).cacheHit,true);assert.equal(count,1);
});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}
test('API rejects invalid queries and mutations',async()=>{
  const bad=response();await handleApi('game',{method:'GET',url:'/api/game?id=bad'},bad);assert.equal(bad.statusCode,400);
  const post=response();await handleApi('schedule',{method:'POST',url:'/api/schedule'},post);assert.equal(post.statusCode,405);assert.equal(post.headers.Allow,'GET');
});
