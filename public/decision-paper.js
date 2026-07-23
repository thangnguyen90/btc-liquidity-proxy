const $ = (id) => document.getElementById(id);
let state = null;
let streamConnected = false;
let stream = null;
let closedPage = 1;
let closedSort = {key:'closedAt',direction:'desc'};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value,d=1) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('vi-VN',{maximumFractionDigits:d,minimumFractionDigits:d}) : '—';

function localDateKey(value){
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))return'';
  return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function historyRange(){return{from:$('historyDateFrom').value,to:$('historyDateTo').value}}
function inHistoryRange(value){
  const {from,to}=historyRange();
  if(!from&&!to)return true;
  const day=localDateKey(value);
  return Boolean(day)&&(!from||day>=from)&&(!to||day<=to);
}
function filterHistoryRows(rows,field){return rows.filter(row=>inHistoryRange(row?.[field]))}
function historyRangeLabel(){
  const {from,to}=historyRange();
  const display=value=>value?new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN'):'…';
  if(!from&&!to)return'Toàn bộ thời gian';
  if(from&&to&&from===to)return`Ngày ${display(from)}`;
  return`${display(from)} – ${display(to)}`;
}
function updateHistoryRangeMeta(){
  const closed=filterHistoryRows((state?.trades??[]).filter(t=>t.status==='CLOSED'),'closedAt').length;
  const decisions=filterHistoryRows(state?.decisions??[],'runAt').length;
  $('historyRangeMeta').textContent=`${historyRangeLabel()} · ${closed} lệnh đóng · ${decisions} đánh giá`;
}
function mergeDecisionHistory(incoming=[],previous=[]){
  const merged=new Map();
  for(const row of [...incoming,...previous]){
    const key=row?.id??`${row?.runAt??''}|${row?.symbol??''}|${row?.side??''}|${row?.signalType??''}`;
    if(key&&!merged.has(key))merged.set(key,row);
  }
  return[...merged.values()].sort((a,b)=>Date.parse(b.runAt??0)-Date.parse(a.runAt??0)).slice(0,2000);
}
function renderHistoryOverview(){
  if(!state)return;
  const trades=filterHistoryRows((state.trades??[]).filter(t=>t.status==='CLOSED'),'closedAt');
  const decisions=filterHistoryRows(state.decisions??[],'runAt');
  const wins=trades.filter(t=>closedResult(t)==='WIN').length;
  const losses=trades.filter(t=>closedResult(t)==='LOSS').length;
  const flats=trades.length-wins-losses;
  const decided=wins+losses;
  const wr=decided?wins/decided*100:null;
  const pnl=trades.reduce((sum,t)=>sum+(Number(t.pnl)||0),0);
  const roeRows=trades.map(t=>Number(t.roe)).filter(Number.isFinite);
  const avgRoe=roeRows.length?roeRows.reduce((sum,value)=>sum+value,0)/roeRows.length:null;
  const enters=decisions.filter(d=>d.decision==='ENTER').length;
  const watches=decisions.filter(d=>d.decision==='WATCH').length;
  const rejects=decisions.filter(d=>d.decision==='REJECT').length;
  const pnlTone=pnl>0?'positive':pnl<0?'negative':'neutral';
  $('historyOverview').innerHTML=`<article class="metric history-scope-card"><small>PHẠM VI THỐNG KÊ</small><b>${esc(historyRangeLabel())}</b><p>Chỉ số bên phải và hai bảng bên dưới đang dùng đúng khoảng này.</p></article>`
    +`<article class="metric"><small>LỆNH ĐÃ ĐÓNG</small><b>${trades.length}</b><p>${wins} thắng · ${losses} thua · ${flats} hòa</p></article>`
    +`<article class="metric"><small>WIN RATE ĐÃ ĐÓNG</small><b>${wr==null?'—':`${fmt(wr)}%`}</b><p>Tính trên ${decided} lệnh có kết quả</p></article>`
    +`<article class="metric"><small>PNL ĐÃ ĐÓNG</small><b class="${pnlTone}">${fmt(pnl,3)}</b><p>Tổng PnL trong khoảng ngày</p></article>`
    +`<article class="metric"><small>AVG ROE ĐÃ ĐÓNG</small><b>${avgRoe==null?'—':`${fmt(avgRoe)}%`}</b><p>Trung bình ${roeRows.length} lệnh có ROE</p></article>`
    +`<article class="metric"><small>DECISION LOG</small><b>${decisions.length}</b><p>${enters} ENTER · ${watches} WATCH · ${rejects} REJECT</p></article>`;
}
function renderComboEvaluation(){
  if(!state)return;
  const cutoffText=state.settings?.comboStatsValidFrom??'2026-07-20T05:40:00.000Z';
  const cutoff=Date.parse(cutoffText);
  const allClosed=filterHistoryRows((state.trades??[]).filter(t=>t.status==='CLOSED'),'closedAt');
  const valid=allClosed.filter(t=>{
    const stage=t.decisionStage??t.analysis?.decisionStage;
    return Number.isFinite(cutoff)&&Date.parse(t.openedAt)>=cutoff&&Boolean(stage)&&Boolean(t.combo??t.analysis?.combo);
  });
  const groups=new Map();
  for(const trade of valid){
    const analysis=trade.analysis??{};
    const stage=String(trade.decisionStage??analysis.decisionStage).toUpperCase();
    const side=String(trade.side??'-').toUpperCase();
    const timeframe=String(trade.decisionTimeframe??analysis.timeframe??'-');
    const combo=String(trade.combo??analysis.combo??'-');
    const key=[stage,side,timeframe,combo].join('|');
    const group=groups.get(key)??{stage,side,timeframe,combo,closed:0,wins:0,losses:0,flats:0,roe:0,pnl:0,grossWin:0,grossLoss:0};
    const pnl=Number(trade.pnl)||0;const roe=Number(trade.roe)||0;
    group.closed+=1;group.roe+=roe;group.pnl+=pnl;
    if(pnl>0){group.wins+=1;group.grossWin+=pnl}else if(pnl<0){group.losses+=1;group.grossLoss+=Math.abs(pnl)}else group.flats+=1;
    groups.set(key,group);
  }
  const minClosed=Math.max(3,Number(state.settings?.minClosed)||8);
  const rows=[...groups.values()].map(group=>{
    const wr=group.closed?group.wins/group.closed*100:0;
    const avgRoe=group.closed?group.roe/group.closed:0;
    const pf=group.grossLoss>0?group.grossWin/group.grossLoss:group.grossWin>0?9.99:0;
    let grade='NO DATA';let tone='no-data';
    if(group.closed>=minClosed&&wr>=55&&avgRoe>0&&group.pnl>0&&pf>=1.15){grade='GOOD';tone='good'}
    else if(group.closed>=minClosed&&(wr<45||avgRoe<0||group.pnl<0||pf<0.8)){grade='RISK';tone='risk'}
    else if(group.closed>=minClosed){grade='WATCH';tone='watch'}
    return{...group,wr,avgRoe,pf,grade,tone};
  }).sort((a,b)=>b.closed-a.closed||b.avgRoe-a.avgRoe);
  const cutoffLabel=Number.isFinite(cutoff)?new Date(cutoff).toLocaleString('vi-VN'):'không hợp lệ';
  $('comboEvaluationScope').textContent=`Chỉ dùng paper có openedAt từ ${cutoffLabel}, có decisionStage và combo chuẩn. Filter ngày vẫn áp theo thời gian đóng.`;
  $('comboEvaluationMeta').textContent=`${valid.length} lệnh hợp lệ · loại ${allClosed.length-valid.length} lệnh cũ/sai stage · ${rows.length} nhóm · min ${minClosed}`;
  $('comboEvaluationRows').innerHTML=rows.length?rows.map(row=>`<tr><td><span class="combo-grade ${row.tone}">${row.grade}</span></td><td><strong>${esc(row.stage)}</strong></td><td><strong>${esc(row.side)} · ${esc(row.timeframe)}</strong></td><td><strong>${esc(row.combo)}</strong></td><td><strong>${row.closed}</strong></td><td>${row.wins} / ${row.losses} / ${row.flats}</td><td><strong>${fmt(row.wr)}%</strong></td><td><strong class="${row.avgRoe>0?'positive':row.avgRoe<0?'negative':'neutral'}">${fmt(row.avgRoe)}%</strong></td><td>${fmt(row.pf,2)}</td><td><strong class="${row.pnl>0?'positive':row.pnl<0?'negative':'neutral'}">${fmt(row.pnl,3)}</strong></td></tr>`).join(''):'<tr><td colspan="10" class="empty">Chưa có combo đóng lệnh hợp lệ sau mốc hiệu chỉnh trong khoảng ngày này.</td></tr>';
}

function candlePatternInfo(t){
  const p=t?.candlePatternAtEntry;
  const name=String(p?.name??p??'NO_DATA').toUpperCase();
  const labels={BULLISH_ENGULFING:'Bullish Engulfing',BEARISH_ENGULFING:'Bearish Engulfing',SHOOTING_STAR:'Shooting Star',BULLISH_PIN_BAR:'Bullish Pin Bar',BEARISH_PIN_BAR:'Bearish Pin Bar',BULLISH_CANDLE:'Bullish Candle',BEARISH_CANDLE:'Bearish Candle',HAMMER:'Hammer',DOJI:'Doji',NO_DATA:'No data',UNKNOWN:'No data'};
  const direction=String(p?.direction??(name.includes('BULLISH')||name==='HAMMER'?'BULLISH':name.includes('BEARISH')||name==='SHOOTING_STAR'?'BEARISH':'NEUTRAL')).toUpperCase();
  return{name,label:labels[name]??name.replaceAll('_',' '),timeframe:String(p?.timeframe??t?.candlePatternTimeframe??t?.decisionTimeframe??'-'),direction,reason:String(p?.reason??'')};
}
function candlePatternText(t){const p=candlePatternInfo(t);return`${p.label} · ${p.timeframe} · ${p.direction}`}
function btcCandlePatternInfo(t){
  return candlePatternInfo({
    ...t,
    candlePatternAtEntry:t?.btcCandlePatternAtEntry??t?.btcCandlePattern5m??null,
    candlePatternTimeframe:t?.btcCandlePatternAtEntry?.timeframe??t?.btcCandlePattern5m?.timeframe??'5m',
  });
}
function btcCandlePatternText(t){const p=btcCandlePatternInfo(t);return`${p.label} · ${p.timeframe} · ${p.direction}`}
function regimeGateInfo(row){
  const gate=row?.btcRegimeGate??row?.analysis?.btcRegimeGate??{};
  const tier=String(gate.tier??'NO DATA').toUpperCase();
  return{
    tier,
    label:String(gate.label??row?.btcRegimeGateLabel??'BTC_GATE_NO_DATA').toUpperCase(),
    regime:String(gate.regime??row?.btcRegimeAtEntry??'NO_DATA').toUpperCase(),
    candle:String(gate.btcCandle??row?.btcCandleAtDecision??'NO_DATA').toUpperCase(),
    reason:String(gate.reason??'Chưa có đánh giá BTC regime tại entry'),
    tone:tier==='GOOD'?'good':tier==='RISK'?'risk':tier==='WATCH'?'watch':'no-data',
  };
}
function regimeGateBadge(row){
  const gate=regimeGateInfo(row);
  return`<span class="regime-gate ${gate.tone}" title="${esc(gate.reason)}">BTC ${esc(gate.tier)} · ${esc(gate.regime)}</span>`;
}
function candlePatternCard(t){
  const p=candlePatternInfo(t);const btc=btcCandlePatternInfo(t);const tone=p.direction==='BULLISH'?'bullish':p.direction==='BEARISH'?'bearish':'neutral';
  return`<div class="candle-entry-detail ${tone}" data-candle-pattern><span>MẪU NẾN ENTRY</span><strong>${esc(p.label)} · ${esc(p.timeframe)} · ${esc(p.direction)}</strong><small>NẾN BTC · ${esc(btc.label)} · ${esc(btc.timeframe)} · ${esc(btc.direction)}</small>${p.reason?`<small>${esc(p.reason)}</small>`:''}</div>`;
}
function closedSortValue(trade,key){
  if(key==='closedAt'||key==='openedAt')return Date.parse(trade?.[key]??'')||0;
  if(key==='result'||key==='roe')return Number(trade?.roe??trade?.pnl??0)||0;
  if(key==='peakRoe')return Number(trade?.peakRoe)||0;
  if(key==='entryPrice')return Number(trade?.entryPrice)||0;
  if(key==='signal')return String(trade?.symbol??'').toUpperCase();
  if(key==='candle')return candlePatternInfo(trade).name;
  if(key==='btcCandle')return btcCandlePatternInfo(trade).name;
  if(key==='regimeGate')return `${regimeGateInfo(trade).tier}|${regimeGateInfo(trade).regime}`;
  if(key==='entryMode')return trade?.marketEntrySource==='BINANCE_LAST_SOCKET'?'MARKET':'SIGNAL';
  if(key==='combo')return `${String(trade?.comboGrade??'').toUpperCase()}|${String(trade?.combo??'').toUpperCase()}`;
  if(key==='outcome')return String(trade?.outcome??'').toUpperCase();
  return String(trade?.[key]??'').toUpperCase();
}
function sortClosedTrades(rows){
  const factor=closedSort.direction==='asc'?1:-1;
  return[...rows].sort((a,b)=>{
    const av=closedSortValue(a,closedSort.key);const bv=closedSortValue(b,closedSort.key);
    const compared=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'vi',{numeric:true});
    if(compared)return compared*factor;
    return((Date.parse(b.closedAt??'')||0)-(Date.parse(a.closedAt??'')||0));
  });
}
function updateClosedSortHeader(){
  document.querySelectorAll('[data-closed-sort]').forEach(button=>{
    const active=button.dataset.closedSort===closedSort.key;
    button.classList.toggle('active',active);
    button.closest('th')?.setAttribute('aria-sort',active?(closedSort.direction==='asc'?'ascending':'descending'):'none');
    const icon=button.querySelector('span');if(icon)icon.textContent=active?(closedSort.direction==='asc'?'▲':'▼'):'↕';
  });
}

function decorateDecisionCandlePatterns(){
  if(!state)return;
  const filter=$('closedFilter').value;
  const all=filterHistoryRows((state.trades??[]).filter(t=>t.status==='CLOSED'),'closedAt').sort((a,b)=>Date.parse(b.closedAt??0)-Date.parse(a.closedAt??0));
  const filtered=sortClosedTrades(all.filter(t=>filter==='ALL'||closedResult(t)===filter));
  const pageSize=Math.max(1,Number($('closedPageSize').value)||25);
  const rows=filtered.slice((closedPage-1)*pageSize,closedPage*pageSize);
  [...$('closedTrades').rows].forEach((row,index)=>{
    if(row.cells.length<=1)return;
    const trade=rows[index];
    if(!row.querySelector('[data-candle-pattern]')){
      const td=document.createElement('td');td.dataset.candlePattern='true';td.innerHTML=`<strong>${esc(candlePatternText(trade))}</strong>`;row.insertBefore(td,row.cells[4]??null);
    }
    if(!row.querySelector('[data-btc-candle-pattern]')){
      const td=document.createElement('td');td.dataset.btcCandlePattern='true';td.innerHTML=`<strong>${esc(btcCandlePatternText(trade))}</strong>`;row.insertBefore(td,row.cells[5]??null);
    }
  });
}

function render(data){
  if(state&&Array.isArray(data?.decisions))data={...data,decisions:mergeDecisionHistory(data.decisions,state.decisions??[])};
  state=data; const run=data.lastRun; const summary=data.summary??{}; const trend=run?.trend;
  const openPnl=(data.trades??[]).filter(t=>t.status==='OPEN').reduce((sum,t)=>sum+(Number(t.livePnl)||0),0);
  const recentCutoff=Date.now()-60*60*1000;
  const recentDecisions=(data.decisions??[]).filter(row=>{
    const timestamp=Date.parse(row.runAt??row.decidedAt??'');
    return Number.isFinite(timestamp)&&timestamp>=recentCutoff;
  });
  const recentEnter=recentDecisions.filter(row=>row.decision==='ENTER').length;
  const recentWatch=recentDecisions.filter(row=>row.decision==='WATCH').length;
  const recentReject=recentDecisions.filter(row=>row.decision==='REJECT').length;
  const triggerLabel=run?.trigger==='signal-live'?'SIGNAL LIVE':run?.trigger==='manual'?'THỦ CÔNG':'DỰ PHÒNG';
  $('status').textContent=(run?`Lần cuối ${new Date(run.ranAt).toLocaleString('vi-VN')} · ${triggerLabel}`:'Chưa chạy quyết định')+` · ${streamConnected?'SOCKET LIVE':'ĐANG NỐI SOCKET'}`;
  $('timeframe').value=data.settings.timeframe; $('decisionEvery').value=String(data.settings.decisionEveryMinutes); $('lookback').value=String(data.settings.lookbackDays); $('minClosed').value=String(data.settings.minClosed);
  $('overview').innerHTML=`<article class="metric trend"><small>LIVE · BTC TREND ${esc(run?.timeframe??data.settings.timeframe)} · SIGNAL-DRIVEN + ${data.settings.decisionEveryMinutes}M FALLBACK</small><b>${trend?`${esc(trend.direction)} · ${esc(trend.strength)}`:'—'}</b><p>${trend?`Score ${fmt(trend.score,0)} · move ${fmt(trend.pct)}% · RSI ${fmt(trend.rsi)} · 4h ${esc(trend.macro4h?.direction??'—')} ${esc(trend.macro4h?.strength??'')}`:'Chờ lần đánh giá đầu tiên'} · signal tối đa ${fmt(data.settings.maxSignalAgeSeconds??90,0)}s · chase tối đa ${fmt(data.settings.maxAdverseEntryDriftPct??0.15,2)}% · SL gốc -${fmt(data.settings.stopLossRoe)}%</p></article>${[['LẦN CHẠY GẦN NHẤT · MỚI/TỔNG',run?`${run.received} / ${run.scanned??run.received}`:'—',run?`${run.entered} ENTER · ${run.watched} WATCH · ${(run.rejected??0)} REJECT`:''],['60 PHÚT · ENTER/WATCH',`${recentEnter} / ${recentWatch}`,`${recentDecisions.length} tín hiệu đã đánh giá · ${recentReject} REJECT`],['LIVE · PAPER OPEN',summary.open,'Không phụ thuộc chu kỳ cuối có rỗng hay không'],['LIVE · PNL OPEN',fmt(openPnl,3),'PnL của toàn bộ paper đang mở']].map(([k,v,detail])=>`<article class="metric"><small>${k}</small><b>${v??'—'}</b>${detail?`<p>${detail}</p>`:''}</article>`).join('')}`;
  updateHistoryRangeMeta(); renderHistoryOverview(); renderComboEvaluation(); renderTrades(data.trades??[]); renderClosedTrades(); renderDecisions(); decorateDecisionCandlePatterns();
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
  const breakEvenTrigger=Number(settings.breakEvenTriggerRoe??7);
  const breakEvenLock=Number(settings.breakEvenLockRoe??0);
  const start=Number(settings.trailingStartRoe??15);
  const startLock=Number(settings.trailingStartLockRoe??5);
  const step=Math.max(1,Number(settings.trailingStepRoe??5));
  let nextTrigger=breakEvenTrigger;let nextLock=breakEvenLock;
  if(peak>=breakEvenTrigger){nextTrigger=start;nextLock=startLock}
  if(peak>=start){nextTrigger=start+(Math.floor((peak-start)/step)+1)*step;nextLock=startLock+(nextTrigger-start)}
  const lockText=nextLock===0?'SL về ENTRY':`khóa +${fmt(nextLock)}%`;
  return{label:'TRAIL',detail:`TP lũy tiến · không chốt cứng · mốc kế +${fmt(nextTrigger)}% → ${lockText}`};
}
function marketEntryDetail(t){
  if(t.marketEntrySource!=='BINANCE_LAST_SOCKET')return'';
  const signal=Number.isFinite(Number(t.signalEntry))?` · signal ${fmt(t.signalEntry,6)} · lệch ${fmt(t.entryVsSignalPct,2)}%`:'';
  return`Entry Binance Last ${fmt(t.entryPrice,6)}${signal} · tick ${fmt(t.marketEntryAgeMs,0)}ms`;
}
function renderTrades(rows){
  const visibleRows=rows.filter(t=>t.status==='OPEN');
  $('tradeMeta').textContent=`LIVE · ${visibleRows.length} lệnh đang mở · không theo filter ngày`;
  $('trades').innerHTML=visibleRows.length?visibleRows.map(t=>{const result=tradeTone(t);const tpPlan=takeProfitPlan(t);const entryDetail=marketEntryDetail(t);const closed=t.status==='CLOSED';const lock=t.lockedStopRoe==null?'chưa kích hoạt':`+${fmt(t.lockedStopRoe)}%`;return `<article class="trade ${t.status==='OPEN'?'open':''} ${result.tone}"><div class="trade-head"><div><span class="badge ${String(t.side).toLowerCase()}">${esc(t.side)}</span><h3>${esc(t.symbol)}</h3></div><div class="trade-result"><span class="badge ${closed?'closed-status':''}">${closed?'<span class="closed-dot" aria-hidden="true">&#9632;</span> ':''}${esc(t.status)}${t.outcome?` · ${esc(t.outcome)}`:''}</span><span class="result-badge ${result.tone}">${result.icon?`<span class="result-icon" aria-hidden="true">${result.icon}</span>`:''}${result.label}</span></div></div><div class="sub">${esc(t.signalType)} · ${esc(t.decisionTimeframe)} · ${esc(t.comboGrade??'-')}</div><div class="regime-gate-row">${regimeGateBadge(t)}</div>${candlePatternCard(t)}<div class="trade-stats"><div><small>ENTRY${t.marketEntrySource==='BINANCE_LAST_SOCKET'?' · MARKET':' · SIGNAL'}</small><b>${fmt(t.entryPrice,6)}</b></div><div><small>LAST/EXIT</small><b>${fmt(t.exitPrice??t.markPrice,6)}</b></div><div><small>ROE</small><b class="${result.valueTone}">${fmt(t.roe??t.liveRoe)}%</b></div><div><small>PNL</small><b class="${result.valueTone}">${fmt(t.pnl??t.livePnl,3)}</b></div><div><small>TP</small><b class="trail-mode">${tpPlan.label}</b></div></div>${entryDetail?`<p class="analysis market-entry-detail">${entryDetail}</p>`:''}<p class="analysis trail-detail">${tpPlan.detail}</p><p class="analysis">Prediction ${fmt(t.predictionScore)} · Signal ${fmt(t.signalScore)} · Peak ${fmt(t.peakRoe)}% · SL khóa ${lock} · SL giá ${fmt(t.sl,6)}</p><p class="analysis">${esc(t.analysis?.reason??'')}</p></article>`}).join(''):'<div class="empty">Chưa có paper nào. Chạy một chu kỳ quyết định sau khi các scanner đã có tín hiệu.</div>';
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
  const all=filterHistoryRows((state.trades??[]).filter(t=>t.status==='CLOSED'),'closedAt').sort((a,b)=>Date.parse(b.closedAt??0)-Date.parse(a.closedAt??0));
  const filtered=sortClosedTrades(all.filter(t=>filter==='ALL'||closedResult(t)===filter));
  const pageSize=Math.max(1,Number($('closedPageSize').value)||25);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  closedPage=Math.min(Math.max(1,closedPage),totalPages);
  const start=(closedPage-1)*pageSize;
  const rows=filtered.slice(start,start+pageSize);
  const wins=all.filter(t=>closedResult(t)==='WIN').length;const losses=all.filter(t=>closedResult(t)==='LOSS').length;
  $('closedMeta').textContent=`${filtered.length}/${all.length} lệnh · ${wins} thắng · ${losses} thua · ${historyRangeLabel()}`;
  $('closedPageInfo').textContent=`Trang ${closedPage}/${totalPages}`;
  $('closedPrev').disabled=closedPage<=1;
  $('closedNext').disabled=closedPage>=totalPages;
  updateClosedSortHeader();
  $('closedTrades').innerHTML=rows.length?rows.map(t=>{const result=tradeTone(t);const entryMode=t.marketEntrySource==='BINANCE_LAST_SOCKET'?'MARKET':'SIGNAL';const lock=t.lockedStopRoe==null?'—':`+${fmt(t.lockedStopRoe)}%`;return `<tr class="closed-row ${result.tone}"><td><strong>${new Date(t.closedAt).toLocaleString('vi-VN')}</strong><div class="sub">Giữ ${formatDuration(t.openedAt,t.closedAt)}</div></td><td><strong>${new Date(t.openedAt).toLocaleString('vi-VN')}</strong><div class="sub">${esc(t.decisionTimeframe??'-')} · ${esc(t.source??'-')}</div></td><td><span class="result-table-badge ${result.tone}">${result.icon?`<span aria-hidden="true">${result.icon}</span> `:''}${result.label}</span></td><td><strong>${esc(t.symbol)} · ${esc(t.side)}</strong><div class="sub">${esc(t.signalType)} · ${esc(t.decisionTimeframe)} · signal ${fmt(t.signalScore)}</div></td><td>${regimeGateBadge(t)}<div class="sub">${esc(regimeGateInfo(t).candle)}</div></td><td><strong>${entryMode}</strong><div class="sub">${t.signalEntry!=null?`Signal ${fmt(t.signalEntry,6)} · lệch ${fmt(t.entryVsSignalPct,2)}%`:'Không có signal entry'}</div></td><td><strong>${fmt(t.entryPrice,6)} → ${fmt(t.exitPrice??t.markPrice,6)}</strong><div class="sub">$${fmt(t.marginUsdt,0)} · ${fmt(t.leverage,0)}x</div></td><td><strong class="${result.valueTone}">${fmt(t.roe)}% · ${fmt(t.pnl,3)}</strong></td><td><strong>Peak ${fmt(t.peakRoe)}%</strong><div class="sub">SL khóa ${lock}</div></td><td><strong>${esc(t.comboGrade??'-')} · ${fmt(t.predictionScore)}/100</strong><div class="sub">${esc(t.combo??'')}</div></td><td><strong>${esc(t.outcome??'-')}</strong><div class="sub">${esc(t.analysis?.reason??'')}</div></td></tr>`}).join(''):'<tr><td colspan="13" class="empty">Chưa có lệnh đã đóng trong bộ lọc này.</td></tr>';
}
function renderDecisions(){
  if(!state)return; const filter=$('decisionFilter').value; const dated=filterHistoryRows(state.decisions??[],'runAt');const filtered=dated.filter(x=>filter==='ALL'||x.decision===filter);const rows=filtered.slice(0,300);
  $('decisionMeta').textContent=`${filtered.length}/${dated.length} tín hiệu · ${historyRangeLabel()}${filtered.length>300?' · hiện 300':''}`;
  $('decisions').innerHTML=rows.length?rows.map(d=>`<tr><td>${new Date(d.runAt).toLocaleString('vi-VN')}<div class="sub">${esc(d.timeframe)} · ${esc(d.source)}</div></td><td><span class="decision-badge ${String(d.decision).toLowerCase()}">${esc(d.decision)}</span></td><td><strong>${esc(d.symbol)} · ${esc(d.side)}</strong><div class="sub">${esc(d.signalType)} · score ${fmt(d.signalScore)}</div></td><td><strong>${esc(d.trend?.direction)} · ${esc(d.trend?.strength)}</strong><div class="sub">${fmt(d.trend?.score,0)}/100</div></td><td>${regimeGateBadge(d)}<div class="sub">${esc(regimeGateInfo(d).candle)}</div></td><td><strong>${esc(d.comboGrade??'-')} · ${fmt(d.predictionScore)}/100</strong><div class="sub">AdjWR ${fmt(d.adjustedWr)}% · Avg ${fmt(d.avgRoe)}% · PF ${fmt(d.profitFactor,2)} · Tail ${fmt(d.tailLossRatio)}x</div></td><td>${esc(d.reason)}<div class="sub">${esc(d.combo??'')}</div></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Không có quyết định trong filter này.</td></tr>';
}
async function request(url,options){const response=await fetch(url,{cache:'no-store',headers:{'content-type':'application/json'},...options});const data=await response.json();if(!response.ok||data.error)throw new Error(data.error||`HTTP ${response.status}`);return data}
async function load(){try{render(await request('/api/intraday-decision-paper?decisionLimit=2000'))}catch(e){showError(e)} }
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
$('closedFilter').addEventListener('change',()=>{closedPage=1;renderClosedTrades();decorateDecisionCandlePatterns()});
$('closedPageSize').addEventListener('change',()=>{closedPage=1;renderClosedTrades();decorateDecisionCandlePatterns()});
$('closedPrev').addEventListener('click',()=>{closedPage=Math.max(1,closedPage-1);renderClosedTrades();decorateDecisionCandlePatterns()});
$('closedNext').addEventListener('click',()=>{closedPage+=1;renderClosedTrades();decorateDecisionCandlePatterns()});
document.querySelectorAll('[data-closed-sort]').forEach(button=>button.addEventListener('click',()=>{
  const key=button.dataset.closedSort;
  if(closedSort.key===key)closedSort={key,direction:closedSort.direction==='asc'?'desc':'asc'};
  else closedSort={key,direction:['closedAt','openedAt','result','entryPrice','roe','peakRoe'].includes(key)?'desc':'asc'};
  closedPage=1;renderClosedTrades();decorateDecisionCandlePatterns();
}));
function applyHistoryRange(){
  const from=$('historyDateFrom');const to=$('historyDateTo');
  if(from.value&&to.value&&from.value>to.value)to.value=from.value;
  from.max=to.value||'';to.min=from.value||'';
  closedPage=1;updateHistoryRangeMeta();renderHistoryOverview();renderComboEvaluation();renderClosedTrades();renderDecisions();decorateDecisionCandlePatterns();
}
$('historyDateFrom').addEventListener('change',applyHistoryRange);
$('historyDateTo').addEventListener('change',()=>{
  if($('historyDateFrom').value&&$('historyDateTo').value<$('historyDateFrom').value)$('historyDateFrom').value=$('historyDateTo').value;
  applyHistoryRange();
});
document.querySelectorAll('[data-history-days]').forEach(button=>button.addEventListener('click',()=>{
  const days=Number(button.dataset.historyDays)||0;const end=new Date();const start=new Date(end);start.setDate(end.getDate()-Math.max(0,days-1));
  $('historyDateFrom').value=localDateKey(start);$('historyDateTo').value=localDateKey(end);applyHistoryRange();
}));
$('historyDateClear').addEventListener('click',()=>{$('historyDateFrom').value='';$('historyDateTo').value='';applyHistoryRange()});
load(); connectStream(); setInterval(()=>{if(!streamConnected)load()},30000);
window.addEventListener('beforeunload',()=>stream?.close());
