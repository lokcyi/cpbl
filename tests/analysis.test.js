import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyze,isPitch,number,pitchesCsv} from '../lib/analysis.js';
const read=id=>readFile(new URL('../research/cpbl_raw/'+id+'.json',import.meta.url),'utf8').then(JSON.parse);
for(const [id,total,called,scores] of [['2026-A-211',328,200,[9,6]],['2026-D-166',258,137,[3,0]],['2026-C-1',219,115,[0,3]]]){
  test(id+' reconstructs pitches against official box score and inning runs',async()=>{
    const result=analyze(await read(id));
    assert.equal(result.quality.pitches,total);assert.equal(result.quality.officialTotal,total);
    assert.equal(result.quality.called,called);assert.deepEqual([result.away.score,result.home.score],scores);
    assert.deepEqual(result.quality.issues,[]);
    assert.equal(result.trend.at(-1).away,scores[0]);assert.equal(result.trend.at(-1).home,scores[1]);
    for(const s of [result.away,result.home])assert.equal(s.reconstructedPitchCount,s.officialPitchCount);
  });
}
test('steal attached to a tracked pitch counts; pickoff and substitution do not',()=>{
  assert.equal(isPitch({IsSpecialEvent:'2',Trackman:{Play:{PitchTag:{PitchCall:'BallCalled'}}}}),true);
  assert.equal(isPitch({IsSpecialEvent:'3',IsBall:'0',IsStrike:'0'}),false);
  assert.equal(isPitch({IsSpecialEvent:'2',IsStrike:'1',Content:'好球沒揮棒。 一壘跑者盜壘上二壘。'}),true);
  assert.equal(isPitch({IsSpecialEvent:'0',IsBall:'1',Content:'裁定壞球-投手。裁定四壞球上壘。'}),false);
  assert.equal(isPitch({IsSpecialEvent:'4',IsChangePlayer:'1',Trackman:{Play:{PitchTag:{PitchCall:'StrikeCalled'}}}}),false);
});
for(const id of ['2026-A-212','2026-D-167'])test(id+' without tracking still reconciles pitches and classifies foul tips',async()=>{
  const raw=JSON.parse(await readFile(new URL('../data/games/'+id+'.json',import.meta.url),'utf8'));
  const a=analyze(raw);
  assert.equal(a.quality.pitches,a.quality.officialTotal);
  assert.equal(a.quality.located,0);
  assert.deepEqual(a.quality.issues,[]);
  assert.ok(a.pitches.some(p=>p.call==='FoulTip'));
  assert.ok(a.pitches.every(p=>p.x===null && p.speed===null));
});
test('zeros survive normalization; missing values remain missing',()=>{
  assert.equal(number(0),0);assert.equal(number('0'),0);assert.equal(number(null),null);assert.equal(number(''),null);assert.equal(number('invalid'),null);
});
test('unknown schema fails rather than displaying invented statistics',()=>assert.throws(()=>analyze({Data:{}}),/資料缺少/));
test('CSV quotes multiline text and neutralizes spreadsheet formulas',()=>{
  const csv=pitchesCsv([{pitcher:'=HYPERLINK("bad")',x:-0.2,content:'first,"quoted"\nsecond'}]);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(csv.includes('"-0.2"'));assert.ok(csv.includes('first,""quoted""\nsecond'));
});
test('missing tracking is surfaced without turning it into a zero coordinate',async()=>{
  const raw=await read('2026-C-1');
  const row=raw.Data.Game.LiveLog.find(r=>r.Trackman?.Pitch?.Location);
  row.Trackman.Pitch.Location={};
  const a=analyze(raw);assert.equal(a.pitches[0].x,null);assert.equal(a.pitches[0].located,false);
});
test('missing official aggregate inputs are unavailable rather than zero',async()=>{
  const raw=await read('2026-C-1');delete raw.Data.Game.Home.Pitchers[0].PitchCnt;delete raw.Data.Game.Home.Hitters[0].BasesONBallsCnt;
  const a=analyze(raw);assert.equal(a.quality.officialTotal,null);assert.equal(a.home.walks,null);assert.ok(a.quality.issues.some(s=>s.includes('不完整')));
});
