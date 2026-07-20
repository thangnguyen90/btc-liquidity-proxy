const $ = (id) => document.getElementById(id);
let state = null;
let streamConnected = false;
let stream = null;
let closedPage = 1;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value,d=1) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('vi-VN',{maximumFractionDigits:d,minimumFractionDigits:d}) : '—';

function render(data){
  state=data; const run=data.lastRun; const summary=data.summary??{}; const trend=run?.trend;
  $('status').textContent=(run?`Lần cuối ${new Date(run.ranAt).toLocaleString('vi-VN')}`:'Chưa chạy quyết định')+` · ${streamConnected?'SOCKET LIVE':'ĐANG NỐI SOCKET'}`;
  $('timeframe').value=data.settings.timeframe; $('decisionEvery').value=String(data.settings.decisionEveryMinutes); $('lookback').value=String(data.settings.lookbackDays); $('minClosed').value=String(data.settings.minClosed);
  $('overview').innerHTML=`<article class="metric trend"><small>BTC TREND ${esc(run?.timeframe??data.settings.timeframe)} · AUTO ${data.settings.decisionEveryMinutes}M</small><b>${trend?`${esc(trend.direction)} · ${esc(trend.strength)}`:'—'}</b><p>${trend?`Score ${fmt(trend.score,0)} · move ${fmt(trend.pct)}% · RSI ${fmt(trend.rsi)} · 4h ${esc(trend.macro4h?.direction??'—')} ${esc(trend.macro4h?.strength??'')}`:'Chờ lần đánh giá đầu tiên'} · SL gốc -${fmt(data.settings.stopLossRoe)}% · Trail bắt đầu +15→khóa +5 · sau đó lũy tiến mỗi +5% ROE</p></article>${[['TÍN HIỆU NHẬN',run?.received],['ENTER / WATCH',run?`${run.entered} / ${run.watched}`:'—'],['PAPER OPEN',summary.open],['NET PNL',summary.pnl]].map(([k,v])=>`<article class="metric"><small>${k}</small><b>${v??'—'}</b></article>`).join('')}`;
  renderTrades(data.trades??[]); renderClosedTrades(); renderDecisions();
}
function tradeTone(t){
  const closed=t.status==='CLOSED';
  const raw=closed?(t.pnl??t.roe):(t.livePnl??t.liveRoe);
  const value=Number(raw);
  const positive=Number.isFinite(value)&&value>0;
  const negative=Number.isFinite(value)&&value<0;
  if(closed&&(positive||t.outcome==='TP'))return{tone:'win',label:'THẮNG',icon:'&#10003;',valueTone:'positive'};
  if(closed&&(negative||t.outcome==='SL'))return{tone:'loss',label:'THUA',icon:'&#10005;',valueTone:'negative'};
  if(closed)return{tone:'flat',label:'ĐÃ ĐÓNG',icon:'&#9632;',valueTone:'neutral'};
  if(positive)return{tone:'live-win',label:'ĐANG LỜI',icon:'',valueTone:'positive'};
  if(negative)return{tone:'live-loss',label:'ĐANG LỖ',icon:'',valueTone:'negative'};
  return{tone:'flat',label:'CHƯA ĐỔI',icon:'',valueTone:'neutral'};
}
function takeProfitPlan(t){
  if(t.takeProfitMode!=='PROGRESSIVE_ROE_TRAIL'&&Number.isFinite(Number(t.tp))){
    return{label:fmt(t.tp,6),detail:`TP cố định ${fmt(t.tp,6)}`};
  }
  if(t.status==='CLOSED')return{label:'TRAIL',detail:`TP lũy tiến · đã đóng ${esc(t.outcome??'')}`};
  const settings=state?.settings??{};
  const peak=Number(t.peakRoe??0);
  const start=Number(settings.trailingStartRoe??15);
  const startLock=Number(settings.trailingStartLockRoe??5);
  const step=Math.max(1,Number(settings.trailingStepRoe??5));
  let nextTrigger=start; let nextLock=startLock;
  if(peak>=start){nextTrigger=start+(Math.floor((peak-start)/step)+1)*step;nextLock=startLock+(nextTrigger-start)}
  return{label:'TRAIL',detail:`TP lũy tiến · không chốt cứng · mốc kế +${fmt(nextTrigger)}% → khóa +${fmt(nextLock)}%`};
}
function marketEntryDetail(t){
  if(t.marketEntrySource!=='BINANCE_LAST_SOCKET')return'';
  const signal=Number.isFinite(Number(t.signalEntry))?` · signal ${fmt(t.signalEntry,6)} · lệch ${fmt(t.entryVsSignalPct,2)}%`:'';
  return`Entry Binance Last ${fmt(t.entryPrice,6)}${signal} · tick ${fmt(t.marketEntryAgeMs,0)}ms`;
}
function renderTrades(rows){
  const visibleRows=rows.filter(t=>t.status==='OPEN');
  $('tradeMeta').textContent=`${visibleRows.length} lệnh đang mở`;
  $('trades').innerHTML=visibleRows.length?visibleRows.map(t=>{const result=tradeTone(t);const tpPlan=takeProfitPlan(t);const entryDetail=marketEntryDetail(t);const closed=t.status==='CLOSED';const lock=t.lockedStopRoe==null?'chưa kích hoạt':`+${fmt(t.lockedStopRoe)}%`;return `<article class="trade ${t.status==='OPEN'?'open':''} ${result.tone}"><div class="trade-head"><div><span class="badge ${String(t.side).toLowerCase()}">${esc(t.side)}</span><h3>${esc(t.symbol)}</h3></div><div class="trade-result"><span class="badge ${closed?'closed-status':''}">${closed?'<span class="closed-dot" aria-hidden="true">&#9632;</span> ':''}${esc(t.status)}${t.outcome?` · ${esc(t.outcome)}`:''}</span><span class="result-badge ${result.tone}">${result.icon?`<span class="result-icon" aria-hidden="true">${result.icon}</span>`:''}${result.label}</span></div></div><div class="sub">${esc(t.signalType)} · ${esc(t.decisionTimeframe)} · ${esc(t.comboGrade??'-')}</div><div class="trade-stats"><div><small>ENTRY${t.marketEntrySource==='BINANCE_LAST_SOCKET'?' · MARKET':' · SIGNAL'}</small><b>${fmt(t.entryPrice,6)}</b></div><div><small>LAST/EXIT</small><b>${fmt(t.exitPrice??t.markPrice,6)}</b></div><div><small>ROE</small><b class="${result.valueTone}">${fmt(t.roe??t.liveRoe)}%</b></div><div><small>PNL</small><b class="${result.valueTone}">${fmt(t.pnl??t.livePnl,3)}</b></div><div><small>TP</small><b class="trail-mode">${tpPlan.label}</b></div></div>${entryDetail?`<p class="analysis market-entry-detail">${entryDetail}</p>`:''}<p class="analysis trail-detail">${tpPlan.detail}</p><p class="analysis">Prediction ${fmt(t.predictionScore)} · Signal ${fmt(t.signalScore)} · Peak ${fmt(t.peakRoe)}% · SL khóa ${lock} · SL giá ${fmt(t.sl,6)}</p><p class="analysis">${esc(t.analysis?.reason??'')}</p></article>`}).join(''):'<div class="empty">Chưa có paper nào. Chạy một chu kỳ quyết định sau khi các scanner đã có tín hiệu.</div>';
}
function formatDuration(openedAt,closedAt){
  const elapsed=Date.parse(closedAt??'')-Date.parse(openedAt??'');
  if(!Number.isFinite(elapsed)||elapsed<0)return'—';
  const minutes=Math.floor(elapsed/60000);const hours=Math.floor(minutes/60);
  return hours?`${hours}h ${minutes%60}m`:`${minutes}m`;
}
function closedResult(t){
  const pnl=Number(t.pnl??0);
  if(pnl>0)return'WIN';
  if(pnl<0)return'LOSS';
  return'FLAT';
}
function renderClosedTrades(){
  if(!state)return;
  const filter=$('closedFilter').value;
  const all=(state.trades??[]).filter(t=>t.status==='CLOSED').sort((a,b)=>Date.parse(b.closedAt??0)-Date.parse(a.closedAt??0));
  const filtered=all.filter(t=>filter==='ALL'||closedResult(t)===filter);
  const pageSize=Math.max(1,Number($('closedPageSize').value)||25);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  closedPage=Math.min(Math.max(1,closedPage),totalPages);
  const start=(closedPage-1)*pageSize;
  const rows=filtered.slice(start,start+pageSize);
  const wins=all.filter(t=>closedResult(t)==='WIN').length;const losses=all.filter(t=>closedResult(t)==='LOSS').length;
  $('closedMeta').textContent=`${filtered.length}/${all.length} lệnh · ${wins} thắng · ${losses} thua`;
  $('closedPageInfo').textContent=`Trang ${closedPage}/${totalPages}`;
  $('closedPrev').disabled=closedPage<=1;
  $('closedNext').disabled=closedPage>=totalPages;
  $('closedTrades').innerHTML=rows.length?rows.map(t=>{const result=tradeTone(t);const entryMode=t.marketEntrySource==='BINANCE_LAST_SOCKET'?'MARKET':'SIGNAL';const lock=t.lockedStopRoe==null?'—':`+${fmt(t.lockedStopRoe)}%`;return `<tr class="closed-row ${result.tone}"><td><strong>${new Date(t.closedAt).toLocaleString('vi-VN')}</strong><div class="sub">Mở ${new Date(t.openedAt).toLocaleString('vi-VN')} · giữ ${formatDuration(t.openedAt,t.closedAt)}</div></td><td><span class="result-table-badge ${result.tone}">${result.icon?`<span aria-hidden="true">${result.icon}</span> `:''}${result.label}</span></td><td><strong>${esc(t.symbol)} · ${esc(t.side)}</strong><div class="sub">${esc(t.signalType)} · ${esc(t.decisionTimeframe)} · signal ${fmt(t.signalScore)}</div></td><td><strong>${entryMode}</strong><div class="sub">${t.signalEntry!=null?`Signal ${fmt(t.signalEntry,6)} · lệch ${fmt(t.entryVsSignalPct,2)}%`:'Không có signal entry'}</div></td><td><strong>${fmt(t.entryPrice,6)} → ${fmt(t.exitPrice??t.markPrice,6)}</strong><div class="sub">$${fmt(t.marginUsdt,0)} · ${fmt(t.leverage,0)}x</div></td><td><strong class="${result.valueTone}">${fmt(t.roe)}% · ${fmt(t.pnl,3)}</strong></td><td><strong>Peak ${fmt(t.peakRoe)}%</strong><div class="sub">SL khóa ${lock}</div></td><td><strong>${esc(t.comboGrade??'-')} · ${fmt(t.predictionScore)}/100</strong><div class="sub">${esc(t.combo??'')}</div></td><td><strong>${esc(t.outcome??'-')}</strong><div class="sub">${esc(t.analysis?.reason??'')}</div></td></tr>`}).join(''):'<tr><td colspan="9" class="empty">Chưa có lệnh đã đóng trong bộ lọc này.</td></tr>';
}
function renderDecisions(){
  if(!state)return; const filter=$('decisionFilter').value; const rows=(state.decisions??[]).filter(x=>filter==='ALL'||x.decision===filter).slice(0,300);
  $('decisions').innerHTML=rows.length?rows.map(d=>`<tr><td>${new Date(d.runAt).toLocaleString('vi-VN')}<div class="sub">${esc(d.timeframe)} · ${esc(d.source)}</div></td><td><span class="decision-badge ${String(d.decision).toLowerCase()}">${esc(d.decision)}</span></td><td><strong>${esc(d.symbol)} · ${esc(d.side)}</strong><div class="sub">${esc(d.signalType)} · score ${fmt(d.signalScore)}</div></td><td><strong>${esc(d.trend?.direction)} · ${esc(d.trend?.strength)}</strong><div class="sub">${fmt(d.trend?.score,0)}/100</div></td><td><strong>${esc(d.comboGrade??'-')} · ${fmt(d.predictionScore)}/100</strong><div class="sub">AdjWR ${fmt(d.adjustedWr)}% · Avg ${fmt(d.avgRoe)}% · PF ${fmt(d.profitFactor,2)} · Tail ${fmt(d.tailLossRatio)}x</div></td><td>${esc(d.reason)}<div class="sub">${esc(d.combo??'')}</div></td></tr>`).join(''):'<tr><td colspan="6" class="empty">Không có quyết định trong filter này.</td></tr>';
}
async function request(url,options){const response=await fetch(url,{cache:'no-store',headers:{'content-type':'application/json'},...options});const data=await response.json();if(!response.ok||data.error)throw new Error(data.error||`HTTP ${response.status}`);return data}
async function load(){try{render(await request('/api/intraday-decision-paper'))}catch(e){showError(e)} }
function showError(e){$('error').textContent=e.message;$('error').hidden=false}
function connectStream(){
  stream?.close();
  stream=new EventSource('/api/intraday-decision-paper/stream');
  stream.onopen=()=>{streamConnected=true;if(state)render(state)};
  stream.onmessage=(event)=>{try{streamConnected=true;const next=JSON.parse(event.data);render(next.event==='paper-tick'&&state?{...state,trades:next.trades,summary:next.summary}:next);$('error').hidden=true}catch{}};
  stream.onerror=()=>{streamConnected=false;if(state)render(state)};
}
async function act(button,fn){button.disabled=true;$('error').hidden=true;try{render(await fn())}catch(e){showError(e)}finally{button.disabled=false}}
$('run').addEventListener('click',()=>act($('run'),()=>request('/api/intraday-decision-paper/run',{method:'POST',body:JSON.stringify({timeframe:$('timeframe').value})})));
$('save').addEventListener('click',()=>act($('save'),()=>request('/api/intraday-decision-paper/settings',{method:'POST',body:JSON.stringify({timeframe:$('timeframe').value,decisionEveryMinutes:Number($('decisionEvery').value),lookbackDays:Number($('lookback').value),minClosed:Number($('minClosed').value)})})));
$('decisionFilter').addEventListener('change',renderDecisions);
$('closedFilter').addEventListener('change',()=>{closedPage=1;renderClosedTrades()});
$('closedPageSize').addEventListener('change',()=>{closedPage=1;renderClosedTrades()});
$('closedPrev').addEventListener('click',()=>{closedPage=Math.max(1,closedPage-1);renderClosedTrades()});
$('closedNext').addEventListener('click',()=>{closedPage+=1;renderClosedTrades()});
load(); connectStream(); setInterval(()=>{if(!streamConnected)load()},30000);
window.addEventListener('beforeunload',()=>stream?.close());
