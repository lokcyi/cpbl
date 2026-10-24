import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../research/strike-zone/',import.meta.url);
const read=async name=>JSON.parse((await readFile(new URL(name,base),'utf8')).replace(/^\uFEFF/,''));
const game=(await read('../cpbl_raw/2026-C-4.json')).Data.Game;
const player=(await read('player-0000005569.json')).Data.Player.Basic;
const height=player.Height/100;
const evaluate=(c,t)=>c[0]+c[1]*t+c[2]*t*t;
function crossing(c,plane){
  const [constant,linear,quadratic]=c,offset=constant-plane;
  const roots=quadratic===0?[-offset/linear]:[(-linear+Math.sqrt(linear*linear-4*quadratic*offset))/(2*quadratic),(-linear-Math.sqrt(linear*linear-4*quadratic*offset))/(2*quadratic)];
  const valid=roots.filter(t=>Number.isFinite(t)&&t>0&&linear+2*quadratic*t<0);
  if(!valid.length)throw new Error('No forward crossing');
  return Math.min(...valid);
}
const pitches=game.LiveLog.filter(r=>r.HitterAcnt===player.Acnt&&r.PitcherAcnt==='0000005555'&&r.InningSeq===11&&r.Trackman).map(r=>{
  const tm=r.Trackman,p=tm.Pitch,poly=p.Flight.PolyFit.PitchTrajectory,l=p.Location;
  const front=crossing(poly.X,.4318),middle=crossing(poly.X,.2159);
  const x=l.PlateLocSide-evaluate(poly.Z,middle)+evaluate(poly.Z,front);
  const z=l.PlateLocHeight+evaluate(poly.Y,middle)-evaluate(poly.Y,front);
  return {pitch:r.PitchCnt,content:r.Content,called:tm.Play.PitchTag.PitchCall,taggedType:tm.Play.PitchTag.TaggedPitchType,
    raw:{side:l.PlateLocSide,height:l.PlateLocHeight},displayPlane:{side:x,height:z},svg:{x:(-x+.55)/1.1*384,y:(1.55-z)/1.4*512},frontTime:front,middleTime:middle};
});
const output={source:'https://stats.cpbl.com.tw/schedule/2026-C-4',verifiedAt:'2026-10-24',player:{id:player.Acnt,name:player.CHName,heightCm:player.Height},
  zone:{bottomM:height*.27,topM:height*.535,halfWidthM:.2158,widthM:.4316,missingHeightDefaultM:1.803},
  svg:{width:384,height:512,xRange:[-.55,.55],heightRange:[.15,1.55]},pitches};
assert.equal(player.Height,178);assert.equal(pitches.length,8);assert.equal(output.zone.bottomM,.4806);assert.equal(output.zone.topM,.9523);
assert.deepEqual(pitches.map(p=>p.pitch),[1,2,3,4,5,6,7,8]);
assert.equal(pitches.filter(p=>p.taggedType==='fastball').length,5);assert.equal(pitches.filter(p=>p.taggedType==='breakingball').length,3);
assert.ok(pitches[0].svg.y>512); // First ball is outside the illustrated viewport.
assert.ok(pitches[4].displayPlane.height>output.zone.topM); // Swinging strike remains red above the frame.
await writeFile(new URL('official-zone-verification.json',base),JSON.stringify(output,null,2));
console.log(JSON.stringify(output.zone));
console.log('Verified player height, 8 pitches, 5/3 pitch types, and display geometry.');
