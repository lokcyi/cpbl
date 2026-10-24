import {evaluateUmpire,umpireCsv,DEFAULT_OPTIONS,UMPIRE_VERSION} from './umpire.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=0)=>v===null||v===undefined?'—':Number(v).toFixed(d);
const pct=v=>v===null?'—':fmt(v*100,1)+'%';
const reasons={missing_height:'缺打者身高',missing_location:'缺球點',missing_trajectory:'缺軌跡／時間',invalid_trajectory:'無法換算平面',conflicting_call:'判決來源衝突',not_called:'非主審好壞球判決'};
const decision=v=>v==='STRIKE'?'好球':v==='BALL'?'壞球':v==='CONFLICT'?'來源衝突':'非判決';
const settings={...DEFAULT_OPTIONS,team:'all',showOthers:false,table:'errors',atBats:{}};
let active=null,result=null,players={},metadata={},generation=0;
let savedPlayers;
const download=(name,body,type)=>{const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
async function json(url,timeout=55000){const r=await fetch(url,{signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new Error('Request failed');return r.json();}
function metric(label,value,note){return `<div class="umpire-stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;}
export function umpireExport(){return result&&active&&result.gameId===active.id?{...result,profiles:players,profileStatus:metadata}:null;}
export async function mountUmpire(game,{live=false}={}){
  const request=++generation;active=game;result=null;players={};metadata={loading:true,live:false,failed:false};settings.atBats={};
  render();
  try{savedPlayers??=await json('/data/players/index.json',10000);if(request!==generation)return;const ids=new Set(game.pitches.map(p=>p.batterId));players=Object.fromEntries(Object.entries(savedPlayers.players).filter(([id])=>ids.has(id)));}
  catch{savedPlayers=null;}
  if(request!==generation)return;
  metadata.loading=live;render();
  const ids=[...new Set(game.pitches.map(p=>p.batterId))];
  if(live||ids.some(id=>!players[id])){
    metadata.loading=true;render();
    try{const response=await json('/api/players?id='+encodeURIComponent(game.id));if(request!==generation)return;Object.assign(players,response.players);metadata={loading:false,live:true,failed:response.errors?.length>0,errors:response.errors??[]};}
    catch{if(request!==generation)return;metadata={loading:false,live:false,failed:true};}
  }
  if(request!==generation)return;metadata.loading=false;render();
}
function selectedBatters(){return result.batters.filter(b=>settings.team==='all'||b.side===settings.team);}
function render(){
  const container=document.getElementById('umpire-content');if(!container||!active)return;
  result=evaluateUmpire(active,players,settings);
  const s=result.summary;
  const overview=document.getElementById('umpire-overview');
  if(overview){
    const card=(label,value,unit,note)=>`<article class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value} <small>${unit}</small></div><p>${note}</p></article>`;
    const ready=!metadata.loading,impact=result.impact;
    overview.innerHTML=card('疑似誤判率',ready?pct(s.clear?impact.total/s.clear:null):'—','',ready?`${impact.total} / ${s.clear} 顆可評估非邊界判決 · 排除邊界球`:'正在取得身高資料…')+
      ['home','away'].map(side=>{const team=impact.teams.find(t=>t.side===side);return card(`${side==='home'?'主場':'客場'}球隊誤判得利`,ready&&s.clear?team.benefited:'—','球',`${esc(active[side].name)} · ${ready?(s.clear?'非邊界疑似誤判受益球數':'無可評估非邊界判決'):'正在取得身高資料…'}`);}).join('');
  }
  container.innerHTML=`<div class="umpire-intro"><div><div class="eyebrow">UMPIRE DECISION REPORT</div><h3>主審 ${esc(active.umpire)} <span>好壞球判決分析</span></h3><p>依官網身高比例框與所選幾何模型計算的相符率，並非官方 ABS 裁定。</p></div><div class="download-group"><button class="outline-button" id="umpire-json">↓ 判決 JSON</button><button class="outline-button" id="umpire-csv">↓ 判決 CSV</button></div></div>
  <div class="umpire-controls"><label>球點平面<select id="umpire-plane"><option value="middle" ${settings.plane==='middle'?'selected':''}>官網中間平面</option><option value="front" ${settings.plane==='front'?'selected':''}>原始進壘平面</option></select></label><label>假設球半徑（cm）<input id="umpire-radius" type="number" min="0" max="5" step="0.05" value="${settings.radiusCm}"></label><label>邊界不確定帶（cm）<input id="umpire-tolerance" type="number" min="0" max="10" step="0.5" value="${settings.toleranceCm}"></label><p>距球體與框接觸邊界 ±${fmt(settings.toleranceCm,1)} cm 列為不確定；不自動改算正確。半徑 0 為球心模型。</p></div>
  <div class="umpire-stats">${metric('全場模型相符率',pct(s.accuracy),`${s.matches} / ${s.eligible} 顆可評估判決（含邊界）`)}${metric('非邊界相符率',pct(s.clearAccuracy),`${s.clearMatches} / ${s.clear} 顆非邊界判決`)}${metric('邊界不確定',s.borderline,'保留於全場相符率，另列不確定')}${metric('可評估覆蓋率',pct(s.coverage),`${s.eligible} / ${s.called} 顆好壞球判決`)}</div>
  <div class="umpire-breakdown"><span>判好球相符：<b>${pct(s.calledStrikeAccuracy)}</b>（${s.calledStrikeMatches}/${s.calledStrikes}）</span><span>判壞球相符：<b>${pct(s.calledBallAccuracy)}</b>（${s.calledBallMatches}/${s.calledBalls}）</span><span>非邊界框外判好球：<b>${s.falseStrikes}</b></span><span>非邊界框內判壞球：<b>${s.falseBalls}</b></span></div>
  <div class="umpire-coverage" role="status">${metadata.loading?'<span class="spinner"></span>正在取得官方打者身高；完成後自動更新。':metadata.failed?'部分最新身高資料未取得，已使用可用保存資料；缺身高者不評分。':metadata.live?'身高已由官方球員資料取得。':'身高使用保存的官方球員資料，取得時間列於每位打者卡片。'} 排除 ${s.excluded} 顆：${Object.entries(s.reasons).map(([k,v])=>`${reasons[k]??k} ${v}`).join('、')||'無'}。揮空、界外、擊球及觸身等不列入主審判決分母。</div>
  <details class="umpire-method"><summary>評估方法、公式與限制</summary><p>個人框下緣＝身高×27%，上緣＝身高×53.5%，左右±21.58 cm。缺身高時不使用預設 180.3 cm 參與評分。官網中間平面以官方前緣球點錨定軌跡後推至縱向 0.2159 m；缺軌跡不混用原始平面。</p><p>幾何模型採球體投影圓與矩形框接觸：球心到框的最短距離 ≤ 假設球半徑即模型好球（四角採圓角距離）。半徑是可調假設，不是已查核的中職 ABS 規則。邊界不確定帶只是敏感度設定，不能視為儀器實測誤差。</p><p>判好球／判壞球相符率的分母分別是實際被判好球／壞球且可評估的球。身高來自查詢時的球員名冊，可能與比賽當時不同；同一打者合併全場，卡片可切換打席。此結果不能解讀為偏袒、得分獲益或正式裁判評鑑。版本 ${UMPIRE_VERSION}。</p></details>
  <div class="umpire-batter-header"><h3>每位打者的好球帶</h3><div class="filters"><select id="umpire-team" aria-label="判決圖球隊"><option value="all" ${settings.team==='all'?'selected':''}>雙方打者</option><option value="away" ${settings.team==='away'?'selected':''}>${esc(active.away.name)}</option><option value="home" ${settings.team==='home'?'selected':''}>${esc(active.home.name)}</option></select><label class="inline-check"><input type="checkbox" id="umpire-other" ${settings.showOthers?'checked':''}>顯示其他投球</label></div></div>
  <div class="legend umpire-legend"><span><i style="background:#458c72"></i>模型相符</span><span><i style="background:#c6604c"></i>模型不符</span><span><i style="background:#d49d32"></i>邊界不確定</span><span><i style="background:#a5adb5"></i>不評估</span><span>實心＝判好球 · 空心＝判壞球 · 點選查看明細</span></div>
  <p class="filter-note">上方統計為全場；下方球隊與打席選擇只影響卡片及明細。圓點大小僅示意，計算使用上方設定半徑。</p>
  <div class="batter-zone-grid">${selectedBatters().map(b=>batterCard(b)).join('')||'<div class="empty">本場沒有可列出的打者投球。</div>'}</div>
  ${impactTable()}
  <div class="umpire-inspector" id="umpire-inspector" role="status" tabindex="-1">點選球點或明細中的事件編號，可查看個人好球帶、判決與計算位置。</div>
  <div class="panel-heading umpire-table-heading"><h3>判決明細</h3><select id="umpire-table-mode" aria-label="判決明細顯示"><option value="errors" ${settings.table==='errors'?'selected':""}>疑似誤判（排除邊界）</option><option value="mismatch" ${settings.table==='mismatch'?'selected':''}>模型不符與邊界球</option><option value="all" ${settings.table==='all'?'selected':''}>所有好壞球判決</option><option value="excluded" ${settings.table==='excluded'?'selected':''}>無法評估的判決</option></select></div><p class="filter-note">疑似誤判只列出可評估、模型不符且非邊界的判決，並非正式 ABS 裁定。</p><div class="table-wrap umpire-decision-table">${decisionTable()}</div>`;
  for(const [id,key] of [['umpire-plane','plane'],['umpire-radius','radiusCm'],['umpire-tolerance','toleranceCm'],['umpire-team','team'],['umpire-table-mode','table']])document.getElementById(id).addEventListener('change',e=>{
    if(key==='radiusCm'||key==='toleranceCm'){if(!e.target.checkValidity()||e.target.value===''){e.target.reportValidity();return;}settings[key]=Number(e.target.value);}else settings[key]=e.target.value;render();
  });
  const apply=document.createElement('button');apply.className='outline-button';apply.textContent='套用數值';apply.id='umpire-apply';
  apply.addEventListener('click',()=>{const radius=document.getElementById('umpire-radius'),tolerance=document.getElementById('umpire-tolerance');for(const input of [radius,tolerance])if(input.value===''||!input.reportValidity())return;settings.radiusCm=Number(radius.value);settings.toleranceCm=Number(tolerance.value);render();});
  container.querySelector('.umpire-controls').append(apply);
  document.getElementById('umpire-other').addEventListener('change',e=>{settings.showOthers=e.target.checked;render();});
  container.querySelectorAll('[data-atbat]').forEach(select=>select.addEventListener('change',e=>{settings.atBats[e.target.dataset.atbat]=e.target.value;render();}));
  const inspect=e=>{const target=e.target.closest('[data-umpire-pitch]');if(target)inspectPitch(Number(target.dataset.umpirePitch));};
  container.onclick=inspect;
  container.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('circle[data-umpire-pitch]')){e.preventDefault();inspect(e);}};
  document.getElementById('umpire-json').addEventListener('click',()=>download(active.id+'-umpire.json',JSON.stringify(umpireExport(),null,2),'application/json;charset=utf-8'));
  document.getElementById('umpire-csv').addEventListener('click',()=>download(active.id+'-umpire.csv',umpireCsv(result),'text/csv;charset=utf-8'));
}
function cardRows(b){const key=settings.atBats[b.id]??'all';return b.rows.filter(r=>key==='all'||r.atBatKey===key);}
function batterCard(b){
  const rows=cardRows(b),eligible=rows.filter(r=>r.eligible),matches=eligible.filter(r=>r.matches).length,boundary=eligible.filter(r=>r.borderline).length;
  const date=b.profile?.fetchedAt?String(b.profile.fetchedAt).slice(0,10):'未取得';
  return `<article class="batter-zone-card"><div class="batter-zone-title"><div><h4>${esc(b.name)}</h4><small>${esc(active[b.side]?.name??'隊伍未提供')} · ${b.zone?b.zone.heightCm+' cm':'缺少有效身高'}</small></div><strong>${pct(eligible.length?matches/eligible.length:null)}<small>${matches}/${eligible.length} 相符</small></strong></div><select data-atbat="${esc(b.id)}" aria-label="${esc(b.name)}打席"><option value="all">全場打席</option>${b.atBats.map((pa,i)=>`<option value="${esc(pa.key)}" ${settings.atBats[b.id]===pa.key?'selected':''}>${pa.inning}${pa.half} · 第 ${i+1} 打席</option>`).join('')}</select>${b.zone?zonePlot(rows,b.zone):'<div class="empty">無法取得個人身高<br>保留判決，不建立假設框評分。</div>'}<div class="batter-zone-foot">${b.zone?`框高 ${fmt(b.zone.bottom*100,2)}–${fmt(b.zone.top*100,2)} cm`:'個人框未建立'}<br>判決 ${rows.filter(r=>r.called).length} · 可評估 ${eligible.length} · 邊界 ${boundary}<br>身高資料 ${esc(date)}${rows.some(r=>r.called&&!r.eligible)?' · 部分判決缺資料':''}</div></article>`;
}
function zonePlot(rows,zone){
  const displayed=rows.filter(r=>r.point&&(settings.showOthers||r.called));
  const all=displayed;
  const xmax=Math.max(.65,...all.map(r=>Math.abs(r.point.x)+.08));
  const zmin=Math.min(0,...all.map(r=>r.point.z-.08)),zmax=Math.max(1.65,...all.map(r=>r.point.z+.08));
  const scale=Math.min(258/(xmax*2),292/(zmax-zmin));
  const x=v=>150-v*scale,y=v=>22+(zmax-v)*scale;
  const left=x(zone.right),right=x(zone.left),top=y(zone.top),bottom=y(zone.bottom);
  const dots=displayed.map(r=>{
    const color=!r.eligible?'#a5adb5':r.borderline?'#d49d32':r.matches?'#458c72':'#c6604c';
    const label=`事件 ${r.index}，${r.inning}${r.half}，${r.pitcher} 對 ${r.batter}，判${decision(r.called)}，${r.eligible?`模型${decision(r.expected)}${r.borderline?'，邊界不確定':''}`:reasons[r.reason]??'不評估'}`;
    return `<circle role="button" tabindex="0" aria-label="${esc(label)}" data-umpire-pitch="${r.index}" cx="${x(r.point.x)}" cy="${y(r.point.z)}" r="5" fill="${r.called==='BALL'?'#fff':color}" stroke="${color}" stroke-width="${r.matches===false?2.8:1.7}" ${r.borderline?'stroke-dasharray="2 1"':''}><title>${esc(label)}</title></circle>`;
  }).join('');
  return `<svg class="batter-zone-svg" viewBox="0 0 300 340" role="group" aria-label="個人好球帶判決圖"><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" fill="#f3f6ee" stroke="#53705d" stroke-width="1.6"/>${[1,2].map(i=>`<line x1="${left+(right-left)*i/3}" x2="${left+(right-left)*i/3}" y1="${top}" y2="${bottom}" stroke="#d3ddce"/><line x1="${left}" x2="${right}" y1="${top+(bottom-top)*i/3}" y2="${top+(bottom-top)*i/3}" stroke="#d3ddce"/>`).join('')}<text x="${left-5}" y="${top-5}" text-anchor="end" class="chart-axis">${fmt(zone.top*100,1)}</text><text x="${left-5}" y="${bottom+5}" text-anchor="end" class="chart-axis">${fmt(zone.bottom*100,1)}</text>${dots}<text x="150" y="330" text-anchor="middle" class="chart-axis">${settings.plane==='middle'?'官網中間平面':'原始進壘平面'} · 自動縮放 · cm</text>${displayed.length?'':'<text x="150" y="50" text-anchor="middle" class="chart-axis">本打席沒有可繪製的判決球點</text>'}</svg>`;
}
function displayRows(){return selectedBatters().flatMap(b=>cardRows(b)).filter(r=>r.called).sort((a,b)=>a.index-b.index);}
function impactTable(){
  const impact=result.impact;
  return `<div class="panel-heading"><h3>疑似誤判得利／受損統計</h3><span>全場 ${impact.total} 球</span></div><p class="filter-note">僅計可評估、模型不符且非邊界的判決。好球判壞球：打擊方受益；壞球判好球：防守方受益。以下為全場球數，不受球隊與打席篩選影響；淨受益＝受益－受損，不代表得分或勝率影響。${impact.unattributed?`其中 ${impact.unattributed} 球缺球隊資料，未歸屬。`:''}</p><div class="table-wrap"><table><thead><tr><th>球隊</th><th>受益球數</th><th>受損球數</th><th>淨受益球數</th><th>打擊時受益</th><th>防守時受益</th></tr></thead><tbody>${impact.teams.map(t=>`<tr><td>${esc(t.name??'隊伍未提供')}</td><td>${t.benefited}</td><td>${t.harmed}</td><td>${t.net>0?'+':''}${t.net}</td><td>${t.battingBenefits}</td><td>${t.fieldingBenefits}</td></tr>`).join('')}</tbody></table></div>`;
}
function decisionTable(){
  const rows=displayRows().filter(r=>settings.table==='all'||(settings.table==='errors'?r.eligible&&r.matches===false&&!r.borderline:settings.table==='excluded'?!r.eligible:r.eligible&&(!r.matches||r.borderline)));
  if(!rows.length)return '<div class="empty">目前條件沒有符合的判決。缺資料不會當成正確判決。</div>';
  return `<table><thead><tr><th>事件／局數</th><th>打者</th><th>投手</th><th>主審判決</th><th>模型判定</th><th>結果</th><th>有利球隊</th><th>不利球隊</th><th>距接觸邊界</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="text-button" data-umpire-pitch="${r.index}">#${r.index} · ${r.inning}${r.half}</button></td><td>${esc(r.batter)}</td><td>${esc(r.pitcher)}</td><td>${decision(r.called)}</td><td>${r.eligible?decision(r.expected):'—'}</td><td>${r.eligible?(r.borderline?'邊界不確定':r.matches?'相符':'不符'):esc(reasons[r.reason]??r.reason)}</td><td>${esc(r.benefitingTeam??(r.impactType?'隊伍未提供':'—'))}${r.benefitingSide?(r.impactType==='strike_called_ball'?'（打擊）':'（防守）'):''}</td><td>${esc(r.harmedTeam??(r.impactType?'隊伍未提供':'—'))}</td><td>${r.eligible?fmt(r.marginCm,2)+' cm':'—'}</td></tr>`).join('')}</tbody></table>`;
}
function inspectPitch(index){
  const r=result.rows.find(r=>r.index===index);if(!r)return;
  const el=document.getElementById('umpire-inspector');
  el.innerHTML=`<strong>事件 #${r.index} · ${r.inning}${r.half} · ${esc(r.pitcher)} → ${esc(r.batter)}</strong><p>${esc(r.content)}</p><p>主審：${decision(r.called)} · 模型：${r.eligible?decision(r.expected):'不評估（'+esc(reasons[r.reason]??r.reason)+'）'}${r.borderline?' · 邊界不確定':''}。${r.zone?`身高 ${r.zone.heightCm} cm；框下緣 ${fmt(r.zone.bottom*100,2)}、上緣 ${fmt(r.zone.top*100,2)} cm。`:''}</p><p>原始座標：${fmt(r.x,4)}, ${fmt(r.z,4)} m · 所選平面：${fmt(r.point?.x,4)}, ${fmt(r.point?.z,4)} m。距接觸邊界 ${fmt(r.marginCm,2)} cm（正值為外側，負值為內側）。</p>`;
  if(r.benefitingSide)el.insertAdjacentHTML('beforeend',`<p>此疑似誤判有利於：<strong>${esc(r.benefitingTeam??'隊伍未提供')}</strong>（${r.impactType==='strike_called_ball'?'打擊方':'防守方'}）；不利於：${esc(r.harmedTeam??'隊伍未提供')}。各計 1 球，不換算得分。</p>`);
  el.focus({preventScroll:true});
}
