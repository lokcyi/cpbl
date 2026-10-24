import {number,csvCell} from './analysis.js';
export const UMPIRE_VERSION='1.1.0';
export const DEFAULT_OPTIONS={plane:'middle',radiusCm:3.65,toleranceCm:2};
const polynomial=(c,t)=>c[0]+c[1]*t+c[2]*t*t;
function crossing(c,plane){
  const [constant,b,a]=c,offset=constant-plane;
  if(a===0){const t=-offset/b;return Number.isFinite(t)&&t>0&&b<0?t:null;}
  const discriminant=b*b-4*a*offset;if(discriminant<0||!Number.isFinite(discriminant))return null;
  const q=-.5*(b+(Math.sign(b)||1)*Math.sqrt(discriminant));
  const roots=(q===0?[(-b+Math.sqrt(discriminant))/(2*a),(-b-Math.sqrt(discriminant))/(2*a)]:[q/a,offset/q]).filter(t=>Number.isFinite(t)&&t>0&&b+2*a*t<0);
  return roots.length?Math.min(...roots):null;
}
export function officialZone(heightCm){
  const h=number(heightCm);if(h===null||h<100||h>250)return null;
  return {bottom:h/100*.27,top:h/100*.535,left:-.2158,right:.2158,heightCm:h,source:'CPBL website height-ratio model'};
}
export function displayPoint(p,plane='middle'){
  if(!p.located||!Number.isFinite(p.x)||!Number.isFinite(p.z))return {point:null,reason:'missing_location'};
  if(plane==='front')return {point:{x:p.x,z:p.z},reason:null};
  const t=p.trajectory;
  if(!t||!['X','Y','Z'].every(k=>Array.isArray(t[k])&&t[k].length===3&&t[k].every(Number.isFinite)))return {point:null,reason:'missing_trajectory'};
  if(!Number.isFinite(p.zoneTime))return {point:null,reason:'missing_trajectory'};
  const front=crossing(t.X,.4318),middle=crossing(t.X,.2159);
  if(front===null||middle===null||front>=middle)return {point:null,reason:'invalid_trajectory'};
  const point={x:p.x-polynomial(t.Z,middle)+polynomial(t.Z,front),z:p.z+polynomial(t.Y,middle)-polynomial(t.Y,front)};
  return Object.values(point).every(Number.isFinite)?{point,reason:null}:{point:null,reason:'invalid_trajectory'};
}
export function calledDecision(p){
  const text=p.content??'';
  if(/揮棒落空|觸擊|擦棒|擊出|觸身/.test(text))return null;
  const fromText=/好球沒揮棒/.test(text)?'STRIKE':/壞球[。．]/.test(text)?'BALL':null;
  const fromTag=p.call==='StrikeCalled'?'STRIKE':['BallCalled','BallinDirt'].includes(p.call)?'BALL':null;
  if(fromText&&fromTag&&fromText!==fromTag)return 'CONFLICT';
  return fromText??fromTag;
}
// Signed distance to rectangle: negative inside, Euclidean outside (rounded corners).
export function rectangleDistance(point,zone){
  const dx=Math.max(zone.left-point.x,point.x-zone.right,0),dz=Math.max(zone.bottom-point.z,point.z-zone.top,0);
  if(dx||dz)return Math.hypot(dx,dz);
  return -Math.min(point.x-zone.left,zone.right-point.x,point.z-zone.bottom,zone.top-point.z)||0;
}
function summarize(rows){
  const calls=rows.filter(r=>r.called),eligible=calls.filter(r=>r.eligible),clear=eligible.filter(r=>!r.borderline),matches=eligible.filter(r=>r.matches).length;
  const strikes=eligible.filter(r=>r.called==='STRIKE'),balls=eligible.filter(r=>r.called==='BALL');
  const reasons={};for(const r of calls.filter(r=>!r.eligible))reasons[r.reason]=(reasons[r.reason]??0)+1;
  return {pitches:rows.length,called:calls.length,eligible:eligible.length,excluded:calls.length-eligible.length,reasons,matches,mismatches:eligible.length-matches,
    accuracy:eligible.length?matches/eligible.length:null,borderline:eligible.length-clear.length,clear:clear.length,
    clearMatches:clear.filter(r=>r.matches).length,clearAccuracy:clear.length?clear.filter(r=>r.matches).length/clear.length:null,
    calledStrikes:strikes.length,calledStrikeMatches:strikes.filter(r=>r.matches).length,calledStrikeAccuracy:strikes.length?strikes.filter(r=>r.matches).length/strikes.length:null,
    calledBalls:balls.length,calledBallMatches:balls.filter(r=>r.matches).length,calledBallAccuracy:balls.length?balls.filter(r=>r.matches).length/balls.length:null,
    falseStrikes:clear.filter(r=>!r.matches&&r.called==='STRIKE').length,falseBalls:clear.filter(r=>!r.matches&&r.called==='BALL').length,
    coverage:calls.length?eligible.length/calls.length:null};
}
export function evaluateUmpire(game,players={},options={}){
  const config={...DEFAULT_OPTIONS,...options};
  if(!['middle','front'].includes(config.plane)||!Number.isFinite(config.radiusCm)||config.radiusCm<0||config.radiusCm>5||!Number.isFinite(config.toleranceCm)||config.toleranceCm<0||config.toleranceCm>10)throw new Error('Invalid umpire analysis settings');
  const radius=config.radiusCm/100,tolerance=config.toleranceCm/100;
  const rows=game.pitches.map(p=>{
    const profile=players[p.batterId],zone=officialZone(profile?.heightCm),called=calledDecision(p),location=displayPoint(p,config.plane);
    const reason=called==='CONFLICT'?'conflicting_call':!called?'not_called':!zone?'missing_height':location.reason;
    const eligible=reason===null;
    const margin=eligible?rectangleDistance(location.point,zone)-radius:null;
    const expected=eligible?(margin<=1e-12?'STRIKE':'BALL'):null;
    return {...p,called,zone,point:location.point,heightFetchedAt:profile?.fetchedAt??null,heightSource:profile?.source??null,eligible,reason,expected,
      marginCm:margin===null?null:margin*100,borderline:eligible?Math.abs(margin)<=tolerance+1e-12:false,matches:eligible?called===expected:null};
  });
  for(const row of rows){
    const error=row.eligible&&row.matches===false&&!row.borderline;
    const knownSide=['away','home'].includes(row.battingSide);
    row.benefitingSide=error&&knownSide?(row.called==='BALL'?row.battingSide:row.battingSide==='away'?'home':'away'):null;
    row.harmedSide=row.benefitingSide?(row.benefitingSide==='away'?'home':'away'):null;
    row.benefitingTeam=row.benefitingSide?game[row.benefitingSide]?.name??null:null;
    row.harmedTeam=row.harmedSide?game[row.harmedSide]?.name??null:null;
    row.impactType=error?(row.called==='BALL'?'strike_called_ball':'ball_called_strike'):null;
  }
  const impact={scope:'Full game; evaluable non-borderline mismatches only; pitch counts, not runs',total:rows.filter(r=>r.impactType).length,unattributed:rows.filter(r=>r.impactType&&!r.benefitingSide).length,
    teams:['away','home'].map(side=>{const own=rows.filter(r=>r.benefitingSide===side),harmed=rows.filter(r=>r.harmedSide===side).length;return {side,name:game[side]?.name??null,benefited:own.length,harmed,net:own.length-harmed,battingBenefits:own.filter(r=>r.impactType==='strike_called_ball').length,fieldingBenefits:own.filter(r=>r.impactType==='ball_called_strike').length};})};
  const keys=[...new Set(rows.map(p=>p.batterId))];
  const batters=keys.map(id=>{const own=rows.filter(p=>p.batterId===id),first=own[0];return {id,name:first.batter,side:first.battingSide,zone:first.zone,profile:players[id]??null,rows:own,summary:summarize(own),atBats:[...new Map(own.map(r=>[r.atBatKey,{key:r.atBatKey,inning:r.inning,half:r.half}])).values()]};});
  return {version:UMPIRE_VERSION,gameId:game.id,umpire:game.umpire,options:config,method:'Official website height-ratio frame; assumed circular ball overlap at selected plane; not official ABS',rows,summary:summarize(rows),impact,batters};
}
export function umpireCsv(result){
  const fields=['gameId','version','plane','radiusCm','toleranceCm','index','inning','half','atBatKey','batter','pitcher','ballsBefore','strikesBefore','ballsAfter','strikesAfter','outsBefore','called','expected','eligible','reason','matches','borderline','impactType','benefitingSide','benefitingTeam','harmedSide','harmedTeam','marginCm','heightCm','zoneBottom','zoneTop','rawX','rawZ','displayX','displayZ','heightFetchedAt','heightSource'];
  const rows=result.rows.filter(r=>r.called).map(r=>({...r,gameId:result.gameId,version:result.version,...result.options,heightCm:r.zone?.heightCm,zoneBottom:r.zone?.bottom,zoneTop:r.zone?.top,rawX:r.x,rawZ:r.z,displayX:r.point?.x,displayZ:r.point?.z}));
  return '\uFEFF'+[fields.map(csvCell).join(','),...rows.map(r=>fields.map(k=>csvCell(r[k])).join(','))].join('\r\n');
}
