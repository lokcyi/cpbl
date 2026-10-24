import {analyze,pitchesCsv,callLabels,typeLabels} from './analysis.js';
import {mountUmpire,umpireExport} from './umpire-view.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=0)=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=v=>v===null?'—':fmt(v*100,1)+'%';
const kinds={A:'一軍例行賽',D:'二軍例行賽',C:'台灣大賽',E:'季後挑戰賽'};
const statusLabel=s=>({FINISHED:'已完賽',PLAYING:'進行中',SCHEDULED:'未開始',POSTPONED:'延賽',CANCELLED:'取消'}[s]??s??'狀態未提供');
let samples=[],games=[],sampleMode=true,current=null,raw=null,provenance=null,selection=0,scheduleRequest=0,tablePage=0,playerTab='pitchers',dataTab='pitches';
const filters={inning:'all',pitcher:'all',call:'all',search:''};
const samplePath=id=>'/data/games/'+encodeURIComponent(id)+'.json';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
$('#date').value=today();
function notice(message,loading=false){const n=$('#notice');n.hidden=!message;n.className='notice'+(loading?' loading':'');n.textContent=message;}
function setBusy(value){$('#dashboard').setAttribute('aria-busy',String(value));}
async function getJson(url){
  const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
  let data;try{data=await response.json();}catch{throw new Error('服務未回傳可讀取的資料。');}
  if(!response.ok)throw new Error(data.error??`取得資料失敗（${response.status}）`);
  return data;
}
function gameCards(){
  const k=$('#kind').value;
  const list=games.filter(g=>k==='all'||g.KindCode===k);
  $('#games').innerHTML=list.length?list.map(g=>`<button class="game-card ${current?.id===g.GameId?'selected':''}" data-game="${esc(g.GameId)}" aria-pressed="${current?.id===g.GameId}"><span class="game-meta"><span>${esc(String(g.PreExeDate??'').slice(0,10))}</span><span>${esc(kinds[g.KindCode]??g.KindCode)}</span><span>${esc(g.Field?.Abbe)}</span></span><strong><span>${esc(g.Visiting.Team.Name)}</span><b>${fmt(g.Visiting.Score)}</b></strong><strong><span>${esc(g.Home.Team.Name)}</span><b>${fmt(g.Home.Score)}</b></strong></button>`).join(''):'<div class="empty">此日期與賽事類別沒有可顯示的比賽。<br>可以更換日期，或查看已驗證場次。</div>';
  $('#games').querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>loadGame(b.dataset.game,sampleMode)));
}
function showSamples(){scheduleRequest++;sampleMode=true;games=samples;$('#schedule-status').textContent=`已驗證資料快照 · ${samples.length} 場比賽 · 保存日期 2026-10-24`;gameCards();}
$('#samples-button').addEventListener('click',showSamples);
$('#kind').addEventListener('change',gameCards);
$('#schedule-form').addEventListener('submit',async e=>{
  e.preventDefault();const date=$('#date').value,request=++scheduleRequest;
  $('#search-button').disabled=true;$('#schedule-status').textContent='正在查詢官方賽程…';
  try{
    let response;
    try{response=await getJson('/api/schedule?date='+encodeURIComponent(date));}
    catch(error){
      try{const saved=await getJson('/data/schedule/'+date+'.json');response={raw:saved,source:'saved'};}
      catch{throw error;}
    }
    if(request!==scheduleRequest)return;
    sampleMode=false;games=response.raw.Data.Games;
    $('#schedule-status').textContent=`${date} · ${games.length} 場比賽 · ${response.source==='saved'?'批次收錄賽程':'官方賽程'}`;
    gameCards();
  }catch(error){
    if(request!==scheduleRequest)return;
    sampleMode=false;games=[];gameCards();$('#schedule-status').textContent='查詢未完成：'+error.message+' 可改看已驗證場次。';
  }finally{if(request===scheduleRequest)$('#search-button').disabled=false;else $('#search-button').disabled=false;}
});
async function loadGame(id,useSnapshot=false){
  const request=++selection;setBusy(true);notice('正在取得比賽資料並分析，請稍候…',true);
  try{
    let result;
    if(useSnapshot)result={raw:await getJson('/data/snapshots/'+encodeURIComponent(id)+'.json'),source:'snapshot',fetchedAt:null};
    else{
      try{result=await getJson('/api/game?id='+encodeURIComponent(id));}
      catch(error){
        try{
          const saved=await getJson(samplePath(id));
          let metadata;try{metadata=(await getJson('/data/manifest.json'))[id];}catch{}
          result={raw:saved,source:metadata?'saved':samples.some(g=>g.GameId===id)?'snapshot':'saved',fetchedAt:metadata?.fetchedAt??null,fallback:error.message};
        }
        catch{throw error;}
      }
    }
    const analysis=analyze(result.raw);
    if(request!==selection)return;
    raw=result.raw;current=analysis;provenance=result;
    filters.inning='all';filters.pitcher='all';filters.call='all';filters.search='';tablePage=0;
    notice(result.fallback?'官方連線暫時無法使用，已改用保存資料。'+result.fallback:'');
    renderDashboard();gameCards();
    const url=new URL(location.href);url.searchParams.set('game',id);url.searchParams.set('source',useSnapshot?'snapshot':'official');history.replaceState(null,'',url);
  }catch(error){if(request===selection)notice('無法載入本場：'+error.message+'。原有分析仍保留，可選其他場次重試。');}
  finally{if(request===selection)setBusy(false);}
}
function download(name,body,type){const blob=new Blob([body],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function filteredPitches(){return current.pitches.filter(p=>(filters.inning==='all'||String(p.inning)===filters.inning)&&(filters.pitcher==='all'||p.pitcherId===filters.pitcher)&&(filters.call==='all'||(filters.call==='called'?['StrikeCalled','BallCalled'].includes(p.call):p.call===filters.call)));}
function legend(){return `<div class="legend"><span><i class="away"></i>${esc(current.away.name)}</span><span><i class="home"></i>${esc(current.home.name)}</span></div>`;}
function kpi(label,value,unit,note,icon){return `<div class="kpi"><div class="kpi-label">${label}<span class="kpi-icon">${icon}</span></div><div class="kpi-value">${value}<small>${unit}</small></div><div class="kpi-note">${note}</div></div>`;}
function sourceText(){return provenance.source==='snapshot'?'已驗證快照 · 2026-10-24':provenance.source==='saved'?'批次收錄資料 · '+(provenance.fetchedAt?new Date(provenance.fetchedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'非即時'):'官方連線 · '+new Date(provenance.fetchedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});}
function renderDashboard(){
  const m=current,q=m.quality;
  const speeds=m.pitches.filter(p=>p.speed!==null).map(p=>p.speed);
  const max=speeds.length?Math.max(...speeds):null;
  const strikeCalled=m.pitches.filter(p=>p.call==='StrikeCalled').length;
  const header=`<div class="dashboard-header"><div><div class="eyebrow">GAME REPORT / ${esc(m.id)}</div><h2>一場比賽，完整視角</h2><p><span class="source-dot"></span>${esc(sourceText())}</p></div><div class="download-group"><button class="outline-button" id="refresh-game">↻ 更新</button><button class="outline-button" id="download-raw">↓ 原始 JSON</button><button class="outline-button" id="download-analysis">↓ 分析 JSON</button></div></div>`;
  $('#dashboard').innerHTML=header+`
    <section class="match-panel" aria-label="比賽結果"><div><div class="team-label">AWAY / 客隊</div><div class="team-name">${esc(m.away.name)}</div><div class="team-record">安打 ${fmt(m.away.hits)} · 失誤 ${fmt(m.away.errors)}</div></div><div class="match-center"><div class="match-date">${esc(m.date)} · ${esc(kinds[m.kind]??m.kind)}</div><div class="match-score">${fmt(m.away.score)}<span>:</span>${fmt(m.home.score)}</div><div class="match-details">${esc(m.field)} · 主審 ${esc(m.umpire)}<span class="badge">${esc(statusLabel(m.status))}</span></div></div><div class="team-second"><div class="team-label">HOME / 主隊</div><div class="team-name">${esc(m.home.name)}</div><div class="team-record">安打 ${fmt(m.home.hits)} · 失誤 ${fmt(m.home.errors)}</div></div></section>
    <section class="kpi-grid" aria-label="比賽重點數據">
      ${kpi('全場投球',fmt(q.officialTotal),'球',`官方用球 · 逐球重建 ${q.pitches} 球`,'↗')}
      ${kpi('最快球速',fmt(max,1),'km/h',`有球速紀錄 ${speeds.length} 球`,'⌁')}
      ${kpi('球點覆蓋率',pct(q.coverage),'',`${q.located} / ${q.pitches} 顆重建投球有座標`,'◎')}
      ${kpi('未揮棒明確判決',fmt(q.called),'球',`判好球 ${strikeCalled} · 判壞球 ${q.called-strikeCalled}`,'◇')}
    </section>
    <section id="umpire-overview" class="kpi-grid umpire-overview" aria-label="疑似誤判與兩隊得利統計" aria-live="polite"></section>
    <div class="two-columns"><section class="panel"><div class="panel-heading"><div><h2>比分走勢</h2><p>每局結束的累積得分</p></div>${legend()}</div>${scoreChart()}<div class="table-wrap">${inningTable()}</div><p class="score-foot">逐局得分取自官方表格；0 不表示該半局一定進行。</p></section><section class="panel"><div class="panel-heading"><div><h2>雙方表現比較</h2><p>單場官方成績，客隊在左、主隊在右</p></div><span class="badge">BOX SCORE</span></div>${legend()}<div class="compare-rows" style="margin-top:25px">${comparison()}</div></section></div>
    <section id="pitch-section"><div class="section-label"><h2><span class="step">02</span> 走進每一顆投球</h2><div class="filters"><select id="filter-inning" aria-label="篩選局數"><option value="all">所有局數</option>${[...new Set(m.pitches.map(p=>p.inning))].filter(v=>v!==null).sort((a,b)=>a-b).map(v=>`<option value="${v}">第 ${v} 局</option>`).join('')}</select><select id="filter-pitcher" aria-label="篩選投手"><option value="all">所有投手</option>${[...new Map(m.pitches.map(p=>[p.pitcherId,p.pitcher])).entries()].map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('')}</select><select id="filter-call" aria-label="篩選投球結果"><option value="all">所有投球結果</option><option value="called">明確好壞球判決</option>${[...new Set(m.pitches.map(p=>p.call))].map(c=>`<option value="${esc(c)}">${esc(callLabels[c]??c)}</option>`).join('')}</select></div></div><div id="pitch-content"></div></section>
    <section id="umpire-section" class="panel umpire-panel"><div class="section-label"><h2><span class="step">03</span> 主審好球帶與判決</h2><span class="badge">HEIGHT-BASED ZONE</span></div><div id="umpire-content"></div></section>
    <section id="players-section" class="panel players-panel"><div class="panel-heading player-heading"><div><h2><span class="step">04</span> 球員表現</h2><p>官方單場成績 · 不隨投球篩選變動</p></div><div class="tabs"><button class="tab ${playerTab==='pitchers'?'active':''}" data-player-tab="pitchers">投手</button><button class="tab ${playerTab==='hitters'?'active':''}" data-player-tab="hitters">打者</button></div></div><div id="player-content"></div></section>
    <section id="events-section" class="panel"><div class="panel-heading"><div><h2><span class="step">05</span> 比賽的細節</h2><p>從逐球資料回看比賽</p></div><button class="outline-button" id="download-csv">↓ 篩選逐球 CSV</button></div><div class="tabs data-tabs"><button class="tab ${dataTab==='pitches'?'active':''}" data-data-tab="pitches">逐球紀錄</button><button class="tab ${dataTab==='scoring'?'active':''}" data-data-tab="scoring">得分事件</button></div><div id="event-content"></div></section>
    <section class="quality-panel"><div class="quality-top"><strong>${q.issues.length?'△ 有資料差異待核對':'✓ 用球與逐局比分核對通過'}</strong><span>分析版本 ${esc(m.version)}</span></div><p>已辨識 ${q.pitches} 顆投球，原始紀錄 ${q.events} 筆（包含非投球事件）。有座標的明確好壞球判決：${q.calledLocated} / ${q.called}。</p>${q.issues.length?'<ul>'+q.issues.map(i=>`<li>${esc(i)}</li>`).join('')+'</ul>':''}<details><summary>資料範圍與計算限制</summary><p>核對通過只代表用球數及逐局比分加總一致，不代表所有欄位皆完成驗證。球種使用 Trackman 自動標籤，判決先採 Trackman 標記、缺漏時依事件文字分類。主審分析另採官網身高比例框，並明列幾何假設與排除數；不代表官方 ABS 改判統計。</p><p>${esc(sourceText())} · 比賽 ${esc(m.id)}</p></details></section>`;
  $('#dashboard').hidden=false;
  $('#refresh-game').addEventListener('click',()=>loadGame(m.id,false));
  $('#download-raw').addEventListener('click',()=>download(m.id+'-raw.json',JSON.stringify(raw,null,2),'application/json;charset=utf-8'));
  $('#download-analysis').addEventListener('click',()=>download(m.id+'-analysis.json',JSON.stringify({source:provenance.source,fetchedAt:provenance.fetchedAt,snapshotDate:provenance.source==='snapshot'?'2026-10-24':null,...current,umpireAnalysis:umpireExport()},null,2),'application/json;charset=utf-8'));
  $('#download-csv').addEventListener('click',()=>download(m.id+'-pitches.csv',pitchesCsv(filteredPitches().filter(matchesSearch)),'text/csv;charset=utf-8'));
  for(const key of ['inning','pitcher','call'])$('#filter-'+key).addEventListener('change',e=>{filters[key]=e.target.value;tablePage=0;renderPitchContent();renderEvents();});
  document.querySelectorAll('[data-player-tab]').forEach(b=>b.addEventListener('click',()=>{playerTab=b.dataset.playerTab;document.querySelectorAll('[data-player-tab]').forEach(t=>t.classList.toggle('active',t===b));renderPlayers();}));
  document.querySelectorAll('[data-data-tab]').forEach(b=>b.addEventListener('click',()=>{dataTab=b.dataset.dataTab;document.querySelectorAll('[data-data-tab]').forEach(t=>t.classList.toggle('active',t===b));renderEvents();}));
  renderPitchContent();renderPlayers();renderEvents();
  mountUmpire(m,{live:provenance.source==='official'});
}
function scoreChart(){
  const rows=current.trend,max=Math.max(1,...rows.flatMap(r=>[r.away,r.home]));
  const x=i=>30+i*(440/Math.max(rows.length-1,1)),y=v=>134-v/max*110;
  return `<svg class="chart-svg" viewBox="0 0 500 165" role="img" aria-label="累積比分走勢：客隊 ${fmt(current.away.score)} 分，主隊 ${fmt(current.home.score)} 分">${[0,.5,1].map(v=>`<line class="chart-grid" x1="30" x2="475" y1="${y(v*max)}" y2="${y(v*max)}"/><text class="chart-axis" x="10" y="${y(v*max)+3}">${fmt(v*max,Number.isInteger(v*max)?0:1)}</text>`).join('')}${['away','home'].map((side,j)=>`<polyline class="chart-line" stroke="${j?'#458c72':'#d57c49'}" points="${rows.map((r,i)=>`${x(i)},${y(r[side])}`).join(' ')}"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r[side])}" r="3" fill="${j?'#458c72':'#d57c49'}"><title>${r.inning} 局結束：${esc(current[side].name)} ${r[side]} 分</title></circle>`).join('')}`).join('')}${rows.map((r,i)=>`<text class="chart-axis" x="${x(i)}" y="156" text-anchor="middle">${r.inning}</text>`).join('')}<text class="chart-axis" x="490" y="156">局</text></svg>`;
}
function inningTable(){return `<table class="score-table"><thead><tr><th>球隊</th>${current.trend.map(r=>`<th>${r.inning}</th>`).join('')}<th>R</th><th>H</th><th>E</th></tr></thead><tbody>${['away','home'].map(s=>`<tr><td>${esc(current[s].name)}</td>${current.trend.map(r=>`<td class="${r[s+'Runs']>0?'run':''}">${fmt(r[s+'Runs'])}</td>`).join('')}<td>${fmt(current[s].score)}</td><td>${fmt(current[s].hits)}</td><td>${fmt(current[s].errors)}</td></tr>`).join('')}</tbody></table>`;}
function comparison(){return [['得分','score'],['安打','hits'],['保送','walks'],['被三振','strikeouts'],['全壘打','homeRuns'],['失誤','errors'],['投手用球','officialPitchCount']].map(([label,k])=>{const a=current.away[k],b=current.home[k],max=Math.max(a??0,b??0,1);return `<div class="compare-row"><strong>${fmt(a)}</strong><div class="compare-bar left"><i style="width:${(a??0)/max*100}%"></i></div><span>${label}</span><div class="compare-bar right"><i style="width:${(b??0)/max*100}%"></i></div><strong>${fmt(b)}</strong></div>`;}).join('');}
function renderPitchContent(){
  const ps=filteredPitches(),calls=ps.filter(p=>['StrikeCalled','BallCalled'].includes(p.call)),count={};
  for(const p of ps)count[p.pitchType]=(count[p.pitchType]??0)+1;
  const swings=ps.filter(p=>['StrikeSwinging','StrikeSwingingBunting','FoulTip','FoulBallNotFieldable','FoulBallFieldable','InPlay'].includes(p.call));
  const whiffs=ps.filter(p=>['StrikeSwinging','StrikeSwingingBunting'].includes(p.call)).length;
  $('#pitch-content').innerHTML=`<div class="filter-note">目前篩選 ${ps.length} 顆投球 · ${ps.filter(p=>p.located).length} 顆有球點；球員成績與比賽摘要維持全場。</div><div class="pitch-grid"><section class="panel"><div class="panel-heading"><div><h2>投球位置分布</h2><p>原始座標 · 圓點可查看投打資訊</p></div><span class="badge">${ps.filter(p=>p.located).length} PITCHES</span></div><div class="legend"><span><i style="background:#d57c49"></i>判好球</span><span><i style="background:#4a8e77"></i>判壞球</span><span><i style="background:#8c9eae"></i>其他結果</span></div><div class="zone-container">${pitchChart(ps)}</div><p class="zone-foot">橫軸與縱軸保留官方原始數值；尚未確認觀察視角。未套用個人好球帶，不以球點判定誤判。</p></section><section class="panel"><div class="panel-heading"><div><h2>球種與判決輪廓</h2><p>Trackman 自動球種標籤</p></div><span class="badge">PITCH MIX</span></div><div class="horizontal-bars">${ps.length?Object.entries(count).sort((a,b)=>b[1]-a[1]).map(([name,n])=>`<div class="bar-row"><div class="bar-label"><strong>${esc(typeLabels[name]??name)}</strong><span>${n} 球 · ${fmt(n/ps.length*100,1)}%</span></div><div class="bar-track"><span style="width:${n/ps.length*100}%"></span></div></div>`).join(''):'<div class="empty">目前篩選沒有投球。</div>'}</div><div class="call-stats"><div><small>判好球</small><strong>${calls.filter(p=>p.call==='StrikeCalled').length}</strong></div><div><small>判壞球</small><strong>${calls.filter(p=>p.call==='BallCalled').length}</strong></div><div><small>揮空率</small><strong>${pct(swings.length?whiffs/swings.length:null)}</strong></div></div><p class="mini-note">明確判決 ${calls.length} 球；其他 ${ps.length-calls.length} 球包含揮棒、擊球、觸身與其他結果。揮空 ${whiffs} / 可分類揮棒 ${swings.length}。</p></section></div>`;
}
function pitchChart(ps){
  const points=ps.filter(p=>p.located);
  if(!points.length)return '<div class="empty">目前篩選沒有可用球點。</div>';
  const xmin=Math.min(-.6,...points.map(p=>p.x))-.05,xmax=Math.max(.6,...points.map(p=>p.x))+.05;
  const zmin=Math.min(0,...points.map(p=>p.z))-.05,zmax=Math.max(1.5,...points.map(p=>p.z))+.05;
  const x=v=>45+(v-xmin)/(xmax-xmin)*310,y=v=>300-(v-zmin)/(zmax-zmin)*260;
  return `<svg class="chart-svg" viewBox="0 0 400 340" role="img" aria-label="${points.length} 顆投球的官方原始橫向及高度位置">${Array.from({length:5},(_,i)=>{const xx=xmin+(xmax-xmin)*i/4,zz=zmin+(zmax-zmin)*i/4;return `<line class="chart-grid" x1="45" x2="355" y1="${y(zz)}" y2="${y(zz)}"/><line class="chart-grid" x1="${x(xx)}" x2="${x(xx)}" y1="40" y2="300"/><text class="chart-axis" x="34" y="${y(zz)+3}" text-anchor="end">${fmt(zz,1)}</text><text class="chart-axis" x="${x(xx)}" y="318" text-anchor="middle">${fmt(xx,1)}</text>`;}).join('')}${points.map(p=>`<circle tabindex="0" cx="${x(p.x)}" cy="${y(p.z)}" r="4" fill="${p.call==='StrikeCalled'?'#d57c49':p.call==='BallCalled'?'#4a8e77':'#8c9eae'}" fill-opacity=".6" stroke="#fff" stroke-width=".5"><title>${esc(`${p.inning}${p.half} ${p.pitcher} → ${p.batter}｜${callLabels[p.call]??p.call}｜${fmt(p.speed,1)} km/h｜x ${fmt(p.x,3)} / z ${fmt(p.z,3)}`)}</title></circle>`).join('')}<text class="chart-axis" x="200" y="337" text-anchor="middle">橫向位置（原始值）</text><text class="chart-axis" x="46" y="23">高度（原始值）</text></svg>`;
}
function renderPlayers(){
  const pitching=playerTab==='pitchers';
  const cols=pitching?[['投手','name'],['局數','ip'],['用球','pitches'],['三振','strikeouts'],['保送','walks'],['被安打','hits'],['失分','runs'],['責失','earnedRuns']]:[['打者','name'],['打席','pa'],['打數','atBats'],['安打','hits'],['全壘打','homeRuns'],['打點','rbi'],['保送','walks'],['三振','strikeouts']];
  $('#player-content').innerHTML=`<div class="player-tables">${['away','home'].map(s=>`<div><h3 class="team-table-title">${esc(current[s].name)} <span class="muted">/ ${s==='away'?'客隊':'主隊'}</span></h3><div class="table-wrap"><table><thead><tr>${cols.map(([label])=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${current[s][playerTab].map(p=>`<tr>${cols.map(([,key])=>`<td>${key==='name'?esc(p[key]):key==='ip'?(p.innings===null||p.thirds===null?'—':`${p.innings}.${p.thirds}`):fmt(p[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>${current[s][playerTab].length?'':'<div class="empty">官方尚未提供球員成績。</div>'}</div></div>`).join('')}</div>`;
}
const matchesSearch=p=>!filters.search||[p.pitcher,p.batter,p.catcher,p.content].some(v=>v.toLowerCase().includes(filters.search.toLowerCase()));
function renderEvents(){
  if(dataTab==='scoring'){
    $('#event-content').innerHTML=`<div class="filter-note">全場得分事件，不受投球篩選影響。</div><div class="score-events">${current.scoringEvents.map(e=>`<div class="score-event"><strong>${esc(e.inning)}${esc(e.half)}</strong><p><span class="scoring-score">${fmt(e.awayScore)} : ${fmt(e.homeScore)}</span>${esc(e.content)}</p></div>`).join('')||'<div class="empty">本場沒有提供得分事件。</div>'}</div>`;return;
  }
  const rows=filteredPitches().filter(matchesSearch),maxPage=Math.max(0,Math.ceil(rows.length/25)-1);tablePage=Math.min(tablePage,maxPage);
  $('#event-content').innerHTML=`<div class="event-toolbar"><span class="filter-note">${rows.length} 顆符合篩選 · 球數為事件後狀態</span><input id="event-search" type="search" placeholder="搜尋投手、打者、捕手或事件…" aria-label="搜尋逐球紀錄" value="${esc(filters.search)}"></div><div class="table-wrap"><table class="events-table"><thead><tr><th>局數</th><th>投手 → 打者</th><th>球數（後）</th><th>結果</th><th>球速 km/h</th><th>轉速 rpm</th><th>事件內容</th></tr></thead><tbody>${rows.slice(tablePage*25,tablePage*25+25).map(p=>`<tr><td>${fmt(p.inning)}${esc(p.half)}</td><td>${esc(p.pitcher)} → ${esc(p.batter)}</td><td>${fmt(p.ballsAfter)}–${fmt(p.strikesAfter)}</td><td><span class="call-badge ${p.call==='StrikeCalled'?'strike':''}">${esc(callLabels[p.call]??p.call)}</span></td><td>${fmt(p.speed,1)}</td><td>${fmt(p.spin)}</td><td class="content">${esc(p.content)}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">找不到符合條件的投球，試試調整篩選。</div>'}</div><div class="pagination"><span>第 ${tablePage+1} / ${maxPage+1} 頁</span><button id="prev-page" ${tablePage===0?'disabled':''} aria-label="上一頁">←</button><button id="next-page" ${tablePage===maxPage?'disabled':''} aria-label="下一頁">→</button></div>`;
  $('#prev-page').addEventListener('click',()=>{tablePage--;renderEvents();});$('#next-page').addEventListener('click',()=>{tablePage++;renderEvents();});
  $('#event-search').addEventListener('input',e=>{const pos=e.target.selectionStart;filters.search=e.target.value;tablePage=0;renderEvents();$('#event-search').focus();try{$('#event-search').setSelectionRange(pos,pos);}catch{}});
}
$('#method-button').addEventListener('click',()=>$('#method-dialog').showModal());
$('#close-dialog').addEventListener('click',()=>$('#method-dialog').close());
$('#method-dialog').addEventListener('click',e=>{if(e.target===$('#method-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
try{
  const data=await getJson('/data/samples.json');samples=data.games;showSamples();
  const url=new URL(location.href),id=url.searchParams.get('game');
  await loadGame(id&&/^20\d{2}-[A-Z]-[1-9]\d{0,4}$/.test(id)?id:'2026-C-1',id?url.searchParams.get('source')==='snapshot':true);
}catch(error){$('#schedule-status').textContent='樣本未能載入，可用日期查詢官方場次。';notice(error.message);}
