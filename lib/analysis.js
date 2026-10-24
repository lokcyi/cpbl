export const ANALYSIS_VERSION = '0.3.0';
export const number = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const sum = (rows, key) => rows.reduce((n, r) => n + (number(r[key]) ?? 0), 0);
const completeSum = (rows,key) => rows.length && rows.every(r=>number(r[key])!==null) ? sum(rows,key) : null;
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const finite = a => a.filter(v => v !== null);
export const callLabels = { StrikeCalled:'判好球', BallCalled:'判壞球', BallinDirt:'落地壞球', StrikeSwinging:'揮空', StrikeSwingingBunting:'觸擊落空', FoulTip:'擦棒被捕', FoulBallNotFieldable:'界外', FoulBallFieldable:'界外', InPlay:'擊球進場', HitByPitch:'觸身球', Unknown:'未分類' };
export const typeLabels = { fastball:'快速球', breakingball:'變化球', Fastball:'快速球', Slider:'滑球', Curveball:'曲球', ChangeUp:'變速球', Sinker:'伸卡球', Cutter:'卡特球', Splitter:'指叉球', Unknown:'未分類' };
export function unwrapGame(raw) {
  const g = raw?.Data?.Game ?? raw?.Game ?? raw;
  if (!g?.GameId || !g.Visiting?.Team || !g.Home?.Team || !Array.isArray(g.LiveLog)) throw new Error('資料缺少比賽、隊伍或逐球紀錄，無法分析。');
  return g;
}
export function isPitch(r) {
  // A steal/pickoff can share a real pitch. Do not exclude all special events.
  const tag = r.Trackman?.Play?.PitchTag?.PitchCall;
  if (String(r.IsChangePlayer) === '1') return false;
  if (tag) return true;
  if (/裁定(?:壞球|好球)|故意四壞|故意保送/.test(r.Content ?? '')) return false;
  if (/好球沒揮棒|壞球。|揮棒落空|觸擊落空|擦棒被捕球/.test(r.Content ?? '') && (String(r.IsBall)==='1' || String(r.IsStrike)==='1')) return true;
  return String(r.IsSpecialEvent) === '0' && (String(r.IsBall) === '1' || String(r.IsStrike) === '1');
}
function inferCall(r) {
  if (r.Trackman?.Play?.PitchTag?.PitchCall) return r.Trackman.Play.PitchTag.PitchCall;
  const text = r.Content ?? '';
  if (/好球沒揮棒/.test(text)) return 'StrikeCalled';
  if (/觸身/.test(text)) return 'HitByPitch';
  if (/壞球/.test(text)) return 'BallCalled';
  if (/擦棒被捕球/.test(text)) return 'FoulTip';
  if (/觸擊落空/.test(text)) return 'StrikeSwingingBunting';
  if (/揮棒落空/.test(text)) return 'StrikeSwinging';
  if (/界外/.test(text) && !/接殺/.test(text)) return 'FoulBallNotFieldable';
  if (/擊出/.test(text)) return 'InPlay';
  return 'Unknown';
}
export function normalizePitches(g) {
  return g.LiveLog.flatMap((r, eventIndex) => {
    if (!isPitch(r)) return [];
    const tm = r.Trackman ?? {}, pitch = tm.Pitch ?? {}, release = pitch.Release ?? {}, loc = pitch.Location ?? {};
    const battingSide = String(r.VisitingHomeType) === '1' ? 'away' : String(r.VisitingHomeType) === '2' ? 'home' : 'unknown';
    const x = number(loc.PlateLocSide), z = number(loc.PlateLocHeight);
    const call=inferCall(r),ballsAfter=number(r.BallCnt),strikesAfter=number(r.StrikeCnt);
    const called=(['StrikeCalled','BallCalled','BallinDirt'].includes(call)||/好球沒揮棒|壞球。/.test(r.Content??''))&&['0','1'].includes(String(r.IsBall))&&['0','1'].includes(String(r.IsStrike));
    const before=(value,increment,max)=>value===null?null:value-increment>=0&&value-increment<=max?value-increment:null;
    return [{ index: eventIndex + 1, inning: number(r.InningSeq), half: battingSide === 'away' ? '上' : battingSide === 'home' ? '下' : '?', battingSide,
      pitchingSide: battingSide === 'away' ? 'home' : battingSide === 'home' ? 'away' : 'unknown',
      pitcherId:r.PitcherAcnt ?? '', pitcher:r.PitcherName ?? '', batterId:r.HitterAcnt ?? '', batter:r.HitterName ?? '', catcher:r.CatcherName ?? '',
      atBatKey:`${r.InningSeq}:${r.VisitingHomeType}:${r.BattingOrder}:${r.HitterAcnt}`,battingOrder:number(r.BattingOrder),
      ballsAfter,strikesAfter,call,
      ballsBefore:called?before(ballsAfter,String(r.IsBall)==='1'?1:0,3):null,
      strikesBefore:called?before(strikesAfter,String(r.IsStrike)==='1'?1:0,2):null,
      outsBefore:number(r.OutCnt),
      callSource:tm.Play?.PitchTag?.PitchCall ? 'Trackman' : '事件文字',
      pitchType:tm.Play?.PitchTag?.AutoPitchType ?? 'Unknown', taggedType:tm.Play?.PitchTag?.TaggedPitchType ?? '',
      speed:number(release.RelSpeed), spin:number(release.SpinRate), x,z, located:x !== null && z !== null,
      zoneTime:number(loc.ZoneTime),trajectory:pitch.Flight?.PolyFit?.PitchTrajectory??null,
      exitSpeed:number(tm.Hit?.Launch?.ExitSpeed), launchAngle:number(tm.Hit?.Launch?.Angle),
      content:r.Content ?? '', awayScore:number(r.VisitingScore), homeScore:number(r.HomeScore) }];
  });
}
function sideSummary(s, side, pitches) {
  const pitchers = Array.isArray(s.Pitchers) ? s.Pitchers : [], hitters = Array.isArray(s.Hitters) ? s.Hitters : [];
  const ps = pitches.filter(p => p.pitchingSide === side);
  const officialPitchCount = completeSum(pitchers, 'PitchCnt');
  const inningScores = (s.InningScore ?? []).map(r => ({ inning:number(r.Seq), runs:number(r.Score) })).sort((a,b)=>a.inning-b.inning);
  return { side, name:s.Team.Name, code:s.Team.Code, score:number(s.Score), hits:number(s.HittingCnt), errors:number(s.ErrorCnt),
    walks:completeSum(hitters,'BasesONBallsCnt'), strikeouts:completeSum(hitters,'StrikeOutCnt'),
    homeRuns:completeSum(hitters,'HomeRunCnt'), officialPitchCount, reconstructedPitchCount:ps.length, inningScores,
    averageSpeed:mean(finite(ps.map(p=>p.speed))), maxSpeed:ps.some(p=>p.speed !== null) ? Math.max(...finite(ps.map(p=>p.speed))) : null,
    pitchers: pitchers.map(p=>({id:p.PitcherAcnt,name:p.PitcherName,role:p.RoleType,innings:number(p.InningPitchedCnt),thirds:number(p.InningPitchedDiv3Cnt),pitches:number(p.PitchCnt),strikeouts:number(p.StrikeOutCnt),walks:number(p.BasesONBallsCnt),runs:number(p.RunCnt),earnedRuns:number(p.EarnedRunCnt),hits:number(p.HittingCnt)})),
    hitters:hitters.map(p=>({id:p.HitterAcnt,name:p.HitterName,position:p.DefendStation,pa:number(p.PlateAppearances),atBats:number(p.HitCnt),hits:number(p.HittingCnt),runs:number(p.ScoreCnt),rbi:number(p.RunBattedINCnt),walks:number(p.BasesONBallsCnt),strikeouts:number(p.StrikeOutCnt),homeRuns:number(p.HomeRunCnt)})) };
}
export function analyze(raw) {
  const g = unwrapGame(raw), pitches = normalizePitches(g);
  const away = sideSummary(g.Visiting,'away',pitches), home = sideSummary(g.Home,'home',pitches);
  const located = pitches.filter(p=>p.located).length;
  const called = pitches.filter(p=>['StrikeCalled','BallCalled'].includes(p.call));
  const officialTotal = away.officialPitchCount !== null && home.officialPitchCount !== null ? away.officialPitchCount + home.officialPitchCount : null;
  const issues = [];
  if(officialTotal===null) issues.push('官方投手用球資料不完整，無法核對重建投球數。');
  for (const s of [away,home]) {
    if (s.officialPitchCount !== null && s.officialPitchCount !== s.reconstructedPitchCount) issues.push(`${s.name}：官方用球 ${s.officialPitchCount}，重建 ${s.reconstructedPitchCount}，差 ${s.reconstructedPitchCount-s.officialPitchCount}。`);
    const runs=s.inningScores.filter(r=>r.runs !== null);
    if (!runs.length || s.score === null) issues.push(`${s.name}：逐局或總比分尚未完整，無法核對。`);
    else if (sum(runs,'runs') !== s.score) issues.push(`${s.name}：逐局得分加總與總比分不同。`);
  }
  if (pitches.some(p=>p.battingSide === 'unknown')) issues.push('部分投球缺少攻守方，未分配到球隊比較。');
  if (!pitches.length) issues.push('本場沒有可辨識的投球紀錄。');
  if (pitches.some(p=>p.call === 'Unknown')) issues.push('部分投球結果未分類，請查看原始逐球紀錄。');
  const inningMax = Math.max(9,...[away,home].flatMap(s=>s.inningScores.map(r=>r.inning??0)));
  let a=0,h=0;
  const trend=Array.from({length:inningMax},(_,i)=>{ const ar=away.inningScores.find(r=>r.inning===i+1)?.runs,hr=home.inningScores.find(r=>r.inning===i+1)?.runs; a+=ar??0;h+=hr??0;return {inning:i+1,away:a,home:h,awayRuns:ar??null,homeRuns:hr??null}; });
  return { version:ANALYSIS_VERSION,id:g.GameId,date:String(g.PreExeDate??'').slice(0,10),status:g.GameStatus,field:g.Field?.Abbe??'未提供',kind:g.KindCode,
    umpire:(g.Referee??[]).find(r=>r.Job==='主審')?.Name??'未提供',away,home,pitches,trend,
    quality:{events:g.LiveLog.length,pitches:pitches.length,officialTotal,located,coverage:pitches.length?located/pitches.length:null,called:called.length,calledLocated:called.filter(p=>p.located).length,issues},
    scoringEvents:g.LiveLog.filter(r=>String(r.IsScoreCnt)==='1').map(r=>({inning:r.InningSeq,half:String(r.VisitingHomeType)==='1'?'上':'下',batter:r.HitterName,content:r.Content,awayScore:r.VisitingScore,homeScore:r.HomeScore})) };
}
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formulas in untrusted names/content, but retain numeric negatives.
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(s)) s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
export function pitchesCsv(pitches) {
  const columns = ['index','inning','half','pitcher','batter','catcher','ballsAfter','strikesAfter','call','callSource','pitchType','taggedType','speed','spin','x','z','exitSpeed','launchAngle','content'];
  return '\uFEFF'+[columns.map(csvCell).join(','),...pitches.map(p=>columns.map(k=>csvCell(p[k])).join(','))].join('\r\n');
}
