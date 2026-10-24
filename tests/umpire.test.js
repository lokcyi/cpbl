import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyze,normalizePitches} from '../lib/analysis.js';
import {officialZone,displayPoint,rectangleDistance,calledDecision,evaluateUmpire,umpireCsv} from '../lib/umpire.js';
import {collectPlayers,profileFromResponse} from '../lib/players.js';
const point=(x,z,call='StrikeCalled',content='')=>({index:1,batterId:'0000005569',batter:'曾頌恩',pitcher:'投手',inning:1,half:'上',battingSide:'away',atBatKey:'1:1:1:0000005569',x,z,located:true,call,content});
const game=pitches=>({id:'2026-C-4',umpire:'測試主審',pitches});
const profiles={'0000005569':{heightCm:180,fetchedAt:'2026-10-24',source:'official'}};

test('called pitch context reverses post-call counts but preserves pre-play outs, including walks and strikeouts',()=>{
  const row=(b,s,o,isB,isS,text)=>({BallCnt:b,StrikeCnt:s,OutCnt:o,IsBall:isB,IsStrike:isS,IsSpecialEvent:'0',Content:text});
  const ps=normalizePitches({LiveLog:[row(1,0,1,'1','0','壞球。'),row(4,2,2,'1','0','壞球。四壞球上壘。'),row(2,3,1,'0','1','好球沒揮棒。三振。'),row(null,null,null,'1','0','壞球。')]});
  assert.deepEqual(ps.map(p=>[p.ballsBefore,p.strikesBefore,p.outsBefore]),[[0,0,1],[3,2,2],[2,2,1],[null,null,null]]);
});
test('official height frame matches Tseng at 178 cm; missing height does not silently use default',()=>{
  const z=officialZone(178);assert.equal(z.bottom,.4806);assert.equal(z.top,.9523);assert.equal(z.right-z.left,.4316);
  for(const h of [undefined,null,'',0,-1,999])assert.equal(officialZone(h),null);
});
test('sphere overlap handles straight edges and rounded corners',()=>{
  const z=officialZone(180),r=.0365;
  assert.ok(rectangleDistance({x:0,z:.7},z)<0);
  assert.ok(rectangleDistance({x:z.right+r*.9,z:.7},z)<r);
  assert.ok(rectangleDistance({x:z.right+r*.8,z:z.top+r*.8},z)>r);
  assert.equal(rectangleDistance({x:z.right,z:.7},z),0);
});
test('strict and non-boundary denominators stay distinct; swings/fouls are excluded',()=>{
  const p=[point(0,.7),point(.4,.7,'BallCalled'),point(.4,.7),point(.2158+.0365+.005,.7,'BallCalled'),point(0,.7,'StrikeSwinging','揮棒落空。'),point(0,.7,'FoulBallNotFieldable','擊出界外球。')];
  const r=evaluateUmpire(game(p),profiles,{plane:'front',radiusCm:3.65,toleranceCm:2});
  assert.equal(r.summary.called,4);assert.equal(r.summary.eligible,4);assert.equal(r.summary.accuracy,3/4);
  assert.equal(r.summary.borderline,1);assert.equal(r.summary.clearAccuracy,2/3);assert.equal(r.summary.falseStrikes,1);
  assert.equal(r.summary.calledStrikes,2);assert.equal(r.summary.calledStrikeAccuracy,.5);
});
test('height and trajectory omissions lower coverage instead of padding accuracy',()=>{
  const g=game([point(0,.7)]);
  const missing=evaluateUmpire(g,{}, {plane:'front'});assert.equal(missing.summary.accuracy,null);assert.equal(missing.summary.reasons.missing_height,1);
  const middle=evaluateUmpire(g,profiles);assert.equal(middle.summary.reasons.missing_trajectory,1);assert.equal(middle.summary.coverage,0);
  const front=evaluateUmpire(g,profiles,{plane:'front'});assert.equal(front.summary.coverage,1);
});
test('conflicting sources are not arbitrarily treated as correct; checked/swinging pitches excluded',()=>{
  assert.equal(calledDecision(point(0,.7,'BallCalled','好球沒揮棒。')),'CONFLICT');
  assert.equal(calledDecision(point(0,.7,'StrikeCalled','揮棒落空。')),null);
  assert.equal(calledDecision(point(0,.7,'HitByPitch','觸身球。')),null);
});
test('middle plane reconstructs all eight official-example points',async()=>{
  const raw=JSON.parse(await readFile(new URL('../research/cpbl_raw/2026-C-4.json',import.meta.url),'utf8'));
  const reference=JSON.parse(await readFile(new URL('../research/strike-zone/official-zone-verification.json',import.meta.url),'utf8'));
  const a=analyze(raw),pitches=a.pitches.filter(p=>p.batterId==='0000005569'&&p.pitcherId==='0000005555'&&p.inning===11);
  assert.equal(pitches.length,8);
  pitches.forEach((p,i)=>{const point=displayPoint(p);assert.ok(point.point);assert.ok(Math.abs(point.point.x-reference.pitches[i].displayPlane.side)<1e-10);assert.ok(Math.abs(point.point.z-reference.pitches[i].displayPlane.height)<1e-10);});
  const r=evaluateUmpire(game(pitches),{'0000005569':{heightCm:178}},{toleranceCm:0});
  assert.equal(r.summary.called,5);assert.equal(r.summary.eligible,5);assert.equal(r.summary.matches,5);
});
test('invalid trajectories cannot become zero points',()=>{
  const p={...point(0,.7),zoneTime:.4,trajectory:{X:[1,1,1],Y:[0,0,0],Z:[0,0,0]}};
  assert.equal(displayPoint(p).point,null);assert.equal(displayPoint(p).reason,'invalid_trajectory');
});
test('every batter appears even without an evaluable call; separate at-bats retained',()=>{
  const r=evaluateUmpire(game([point(0,.7),{...point(0,.7),atBatKey:'2:1:2:0000005569'}, {...point(0,.7,'StrikeSwinging'),batterId:'0000001111',batter:'其他打者'}]),profiles,{plane:'front'});
  assert.equal(r.batters.length,2);assert.equal(r.batters[0].atBats.length,2);assert.equal(r.batters[1].summary.accuracy,null);
});
test('CSV has a standard header plus calculation settings per row',()=>{
  const r=evaluateUmpire(game([point(.4,.7)]),profiles,{plane:'front'}),csv=umpireCsv(r);
  assert.ok(csv.startsWith('\uFEFF"gameId"'));assert.ok(csv.includes('"radiusCm"'));assert.ok(csv.includes('"front"'));assert.equal(csv.split('\r\n').length,2);
});
test('player collector deduplicates IDs, preserves unknown height and handles partial failures',async()=>{
  let count=0;const request=async path=>{count++;const id=path.slice(8);if(id==='0000001111')throw new Error('offline');return {raw:{Data:{Player:{Basic:{Acnt:id,CHName:'打者',Height:178}}}},fetchedAt:'2026-10-24'};};
  const result=await collectPlayers(['0000005569','0000005569','bad','0000001111'],{request});
  assert.equal(count,2);assert.equal(result.players['0000005569'].heightCm,178);assert.equal(result.errors.length,1);
  assert.equal(profileFromResponse({Data:{Player:{Basic:{Acnt:'0000005569'}}}},'now').heightCm,null);
});
test('rejects unsafe analysis settings',()=>{
  assert.throws(()=>evaluateUmpire(game([]),{}, {radiusCm:-1}),/settings/);
  assert.throws(()=>evaluateUmpire(game([]),{}, {plane:'unknown'}),/settings/);
});

test('team impact attributes both innings and call directions, excludes uncertain calls and balances totals',()=>{
  const pitches=[point(0,.7,'BallCalled'),point(.5,.7),{...point(0,.7,'BallCalled'),battingSide:'home'},{...point(.5,.7),battingSide:'home'},point(.5,.7),point(.2523,.7,'BallCalled'),point(0,.7),{...point(.5,.7),battingSide:'unknown'}];
  const r=evaluateUmpire({...game(pitches),away:{name:'客隊'},home:{name:'主隊'}},profiles,{plane:'front'});
  assert.deepEqual(r.rows.slice(0,4).map(p=>p.benefitingSide),['away','home','home','away']);
  assert.equal(r.rows[0].benefitingTeam,'客隊');assert.equal(r.rows[0].harmedTeam,'主隊');
  assert.equal(r.rows[5].benefitingSide,null);assert.equal(r.rows[6].benefitingSide,null);
  assert.equal(r.impact.total,6);assert.equal(r.impact.unattributed,1);
  assert.deepEqual(r.impact.teams.map(t=>[t.benefited,t.harmed,t.net,t.battingBenefits,t.fieldingBenefits]),[[2,3,-1,1,1],[3,2,1,1,2]]);
  assert.equal(r.impact.teams.reduce((sum,t)=>sum+t.net,0),0);
  assert.ok(umpireCsv(r).includes('"benefitingTeam"'));
});
