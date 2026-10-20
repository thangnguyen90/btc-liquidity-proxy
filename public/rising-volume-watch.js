import {RISING_VOLUME_VERSION,risingVolumeKey,RISING_VOLUME_PATTERN_VERSION,
  RISING_VOLUME_PATTERN_LABELS,risingVolumePatternKey} from './rising-volume-model.js';
import {binanceCardAvgRoeAttrs} from './binance-card-visibility.js';
import {installLiveCardWhitelistUi} from './live-card-whitelist-ui.js';
import {renderRatioDiagnostics,installRatioChartInteraction} from './rising-volume-ratio-diagnostics.js?v=20261012-binance-chart-v2';
import {renderPassedSignals,installPassedSignals} from './rising-volume-passed-signals.js?v=20261012-pass-pnl-v1';
const $=id=>document.getElementById(id);
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(value,digits=2)=>value==null||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString('en-US',{maximumFractionDigits:digits});
const compact=value=>value==null||!Number.isFinite(Number(value))?'—':new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(Number(value));
const price=value=>fmt(value,10);
const time=value=>!value?'—':new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
const pageSize=50;let offset=0,data=null,sequence=0,controller=null,searchTimer=null;
const selectedId=new URLSearchParams(location.search).get('id');
const entryStatus=status=>({SUBMITTED:'ĐÃ GỬI MARKET',FILLED:'ĐÃ KHỚP',CHECKING:'ĐANG KIỂM TRA',SUBMITTING:'ĐANG GỬI',
  EXISTING_POSITION:'KHÔNG VÀO · đã có vị thế',EXISTING_ORDER:'KHÔNG VÀO · có lệnh entry chờ',
  MAX_OPEN_POSITIONS:'KHÔNG VÀO · đủ cap 50',PROTECTION_DISABLED:'KHÔNG VÀO · protection coin đang tắt',
  PRICE_OR_AGE_BLOCKED:'KHÔNG VÀO · giá lệch hoặc tín hiệu cũ',RUNTIME_OFF:'KHÔNG VÀO · execution/dry-run chưa cho phép',
  ACCOUNT_DATA_MISSING:'KHÔNG VÀO · thiếu dữ liệu tài khoản',CONTROL_CHANGED:'KHÔNG VÀO · setting đã đổi',
  UNRESOLVED_PREVIOUS_ORDER:'KHÔNG VÀO · lệnh trước chưa rõ kết quả',ERROR_OR_UNKNOWN:'LỖI / CHƯA RÕ · không gửi lại',
  UNKNOWN:'CHƯA RÕ · không gửi lại',STATE_ERROR:'KHÔNG VÀO · lỗi lưu ledger'})[status]??(String(status).startsWith('RATIO_')?`CHỈ DISCORD · ${status}`:status);
const closedSummary=c=>`CLOSED ${c.closedCount??0} · AvgROE ${c.closedAvgRoe==null?'—':`${fmt(c.closedAvgRoe)}%`}`;

function renderBinance() {
  const d=data.discord,discordStatus=$('discord-status');
  discordStatus.textContent=!d?'Chưa nhận trạng thái Discord.':`Discord ${d.configured?'ON':'OFF'} · chỉ 1m liền mạch LONG/SHORT · đã gửi ${d.sent??0} · chờ ${d.pending??0} · chưa rõ ${d.uncertain??0} · bị từ chối ${d.rejected??0}${d.error?` · lỗi ${d.error}`:''}`;
  discordStatus.classList.toggle('error',!!d?.error);
  const b=data.binance,status=$('binance-status');
  if(!b){status.textContent='Chưa nhận trạng thái Binance. Không kết luận route đã bật.';$('binance-attempts').textContent='Chưa có dữ liệu.';return;}
  const routes=(b.routes??[]).map(r=>`${r.side}: ${r.enabled?'ON':'OFF'} · margin ${fmt(r.marginUsdt??b.marginUsdt)} USDT${r.enabledAt?` · bật ${time(Date.parse(r.enabledAt))}`:''}`).join(' | ');
  const versionWarning=b.version==='RISING_VOLUME_1M_SUSTAINED_RATIO_LONG2_SHORT1_5X_TP10_SL30_V2_20261011'?'':'CHƯA ÁP DỤNG GATE RATIO V2: runtime đang chạy phiên bản cũ. ';
  status.textContent=`${versionWarning}Master ${b.masterEnabled?'ON':'OFF'} · Execution ${b.executionEnabled===true?'ON':b.executionEnabled===false?'OFF':'chưa rõ'} · ${routes} · chỉ tín hiệu mới sau bật/start.${b.error?` Lỗi: ${b.error}`:''}`;
  status.classList.toggle('error',!!b.error||b.failClosed===true);
  $('binance-attempts').innerHTML=(b.attempts??[]).map(a=>`<article class="execution-attempt ${a.side==='SHORT'?'short':'long'}">
    <b>${escapeHtml(a.symbol)} · ${escapeHtml(a.side)}</b><span>${time(a.at)} · ${escapeHtml(entryStatus(a.status))}</span>
    ${a.risingVolumeRatioProof?`<span>Ratio tài khoản top trader: ${a.risingVolumeRatioProof.pass?'PASS':'CHƯA PASS'} · biên nền ${fmt(a.risingVolumeRatioProof.widthPct)}% · đổi ${fmt(a.risingVolumeRatioProof.changePct)}% / ${fmt(a.risingVolumeRatioProof.transitionMinutes,0)}m · margin ${fmt(a.marginUsdt)} USDT ×5</span>`:''}
    ${a.orderId?`<span>Order ${escapeHtml(a.orderId)} · TP/SL dự kiến ${price(a.takeProfitPrice)} / ${price(a.stopLossPrice)} · neo lại giá khớp</span>`:''}
    ${a.error?`<span class="execution-error">${escapeHtml(a.error)}</span>`:''}</article>`).join('')||'<p class="muted">Chưa có lần xử lý tín hiệu mới. Không hồi lệnh từ các mẫu lịch sử.</p>';
}

export function buildVolumeChart(rows=[],unit='volume',maxBars=28) {
  const series=rows.slice(-maxBars),values=series.map(r=>Number(r[unit]));
  if(!series.length || values.some(v=>!Number.isFinite(v)||v<0))return '<p class="muted">Không đủ dữ liệu biểu đồ.</p>';
  const max=Math.max(1,...values),width=800,height=190,left=54,top=12,bottom=160,plotWidth=730;
  const barWidth=plotWidth/series.length;
  const y=value=>bottom-value/max*(bottom-top);
  const bars=series.map((r,i)=>{
    const readout=`${time(r.closeTime)} · Giá đóng ${price(r.close)} · VOL coin ${fmt(r.volume,3)} · VOL USDT ${fmt(r.quoteVolume,2)}`;
    return `<rect class="volume-bar" tabindex="0" role="button" aria-label="${escapeHtml(readout)}" data-readout="${escapeHtml(readout)}" x="${left+i*barWidth+2}" y="${y(values[i])}" width="${Math.max(2,barWidth-4)}" height="${Math.max(1,bottom-y(values[i]))}" fill="${Number(r.close)>=Number(r.open)?'#30dfa3':'#ff718b'}"><title>${escapeHtml(readout)}</title></rect>`;
  }).join('');
  const maPoints=values.map((_,i)=>i<4?null:`${left+(i+.5)*barWidth},${y(values.slice(i-4,i+1).reduce((a,b)=>a+b,0)/5)}`).filter(Boolean).join(' ');
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ volume ${unit==='volume'?'coin':'USDT'} và MA5">
    <line x1="${left}" y1="${bottom}" x2="790" y2="${bottom}" stroke="#235443"/><line x1="${left}" y1="${y(max/2)}" x2="790" y2="${y(max/2)}" stroke="#235443" stroke-dasharray="3 6"/>
    <text x="2" y="22" fill="#9abbb0" font-size="11">${compact(max)}</text><text x="2" y="${y(max/2)}" fill="#9abbb0" font-size="11">${compact(max/2)}</text>
    ${bars}<polyline points="${maPoints}" fill="none" stroke="#ffcb63" stroke-width="2" pointer-events="none"/>
    <text x="${left}" y="182" fill="#9abbb0" font-size="11">${escapeHtml(time(series[0].closeTime))}</text><text x="790" y="182" text-anchor="end" fill="#9abbb0" font-size="11">${escapeHtml(time(series.at(-1).closeTime))}</text></svg>
    <p class="chart-note">VOL ${unit==='volume'?'coin':'USDT'} · đường vàng MA5 cùng đơn vị · rê chuột hoặc chạm cột để xem; chạm lại để đóng.</p><div class="chart-readout" role="status" hidden></div></div>`;
}

function renderRow(row,{highlight=false}={}) {
  const long=row.side==='LONG',direction=long?'giá tăng':'giá giảm';
  const history=$('view').value==='history';
  const attempt=data.binance?.attempts?.find(a=>a.id===row.id);
  const executionText=attempt?entryStatus(attempt.status):row.interval==='1m'&&row.volumePattern==='SUSTAINED'
    ?'Binance: xem nhật ký rule · chưa có bản ghi khớp trong 100 lần gần nhất':'OBSERVE ONLY · không thuộc rule MARKET 1m liền mạch';
  const pattern=RISING_VOLUME_PATTERN_LABELS[row.volumePattern]?row.volumePattern:'UNKNOWN';
  const patternDetail=pattern==='UNKNOWN'?'Thiếu/cũ/gap chuỗi 30 nến 1m lúc quan sát; không suy từ khung lớn.':
    `${row.pattern1mElevatedBars}/10 nến giữ nền 1m · ${row.pattern1mDropCount} nhịp tụt ≥75% về mức thấp · TB10/nền20 ${fmt(row.pattern1mMeanRatio)}×`;
  const hasMinuteChart=(row.volume1mChart?.length??0)>=30;
  const minuteChart=hasMinuteChart?`<h4 class="chart-heading">Volume nến 1 phút dùng phân loại · 20 nến nền + 10 nến đang xét</h4>${buildVolumeChart(row.volume1mChart,$('unit').value,30)}`:
    '<p class="snapshot-warning">Chưa lưu đủ 30 nến 1m. Biểu đồ khung tín hiệu không thay thế dữ liệu 1m để phân loại.</p>';
  return `<article class="signal ${long?'long':'short'}${highlight?' highlight':''}" id="signal-${encodeURIComponent(row.id)}">
    <div class="signal-head"><div><a class="coin" href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">${escapeHtml(row.symbol)}</a><span class="bias ${long?'long':'short'}">${escapeHtml(row.interval)} · ${escapeHtml(row.side)} · ${direction}</span></div>
      <div class="coin-actions"><a href="https://www.binance.com/en/futures/${encodeURIComponent(row.symbol)}" target="_blank" rel="noopener noreferrer">Binance ↗</a><a href="/rising-volume-watch?view=history&id=${encodeURIComponent(row.id)}">Mẫu đã lưu</a></div></div>
    <div class="signal-meta">Phát hiện ${time(row.firstObservedAt??row.observedAt)} · Nến đóng ${time(row.closedAt)} (UTC+7)${history?` · ${row.active?'đợt này đang đạt điều kiện':'mẫu lịch sử, không khẳng định còn active'}`:''}</div>
    <div class="pattern-row"><span class="pattern-badge ${pattern.toLowerCase()}">${escapeHtml(RISING_VOLUME_PATTERN_LABELS[pattern])}</span><span>${escapeHtml(patternDetail)}${history?' · loại lúc phát hiện':' · loại hiện tại'}${row.volumePatternSource==='FROZEN_CHART_LEGACY'?' · phân loại từ chart gốc đã lưu':''}</span></div>
    <p class="entry-status">${escapeHtml(executionText)}</p>
    ${renderRatioDiagnostics(row)}
    <div class="signal-metrics">
      <div class="metric"><span>Giá đóng / 5 nến</span><strong>${price(row.price)}</strong><small>${row.priceChangePct>=0?'+':''}${fmt(row.priceChangePct)}% · không phải giá entry</small></div>
      <div class="metric"><span>Nền volume × trước đó</span><strong>${fmt(row.volumeRatio)}×</strong><small>${row.aboveBaseline}/5 nến vượt nền cũ</small></div>
      <div class="metric"><span>MA5 volume coin</span><strong>${compact(row.ma5)}</strong><small>↑ 3 bước · +${fmt(row.maGrowthPct)}%</small></div>
      <div class="metric"><span>Volume nến cuối</span><strong>${compact(row.lastBaseVolume)} coin</strong><small>${compact(row.lastQuoteVolume)} USDT</small></div>
      <div class="metric"><span>Taker mua / 5 nến</span><strong>${row.takerBuyPct==null?'Thiếu dữ liệu':`${fmt(row.takerBuyPct)}%`}</strong><small>Thông tin thêm, không phải gate</small></div>
    </div>
    <details class="snapshot"${highlight?' open':''}><summary>Biểu đồ volume & snapshot ${history?'lúc phát hiện':'nến đóng gần nhất'}</summary>
      ${history?'<p class="snapshot-warning">Snapshot gốc được giữ nguyên; không dùng giá hôm nay để viết lại tín hiệu.</p>':''}
      ${minuteChart}
      ${row.interval==='1m'&&hasMinuteChart?'':`<details class="signal-frame-chart"><summary>Biểu đồ khung tín hiệu ${escapeHtml(row.interval)} · không dùng để xét liền mạch 1m</summary>${buildVolumeChart(row.chart,$('unit').value)}</details>`}
    </details></article>`;
}

function render() {
  if(!data)return;
  renderBinance();
  renderPassedSignals(data.passedSignals);
  const openDetails=new Map([...$('signals').querySelectorAll('.signal')].map(article=>[article.id,{
    snapshot:article.querySelector('.snapshot')?.open,frame:article.querySelector('.signal-frame-chart')?.open,ratio:article.querySelector('.ratio-curve')?.open}]));
  $('updated').textContent=data.lastScanAt?`Quét ${time(data.lastScanAt)} · UTC+7`:'Đang khởi động bộ quét…';
  $('coverage').innerHTML=Object.entries(data.coverage??{}).map(([frame,c])=>
    `<span class="${c.ready<c.requested?'pending':''}"><b>${escapeHtml(frame)}</b> · ${c.ready}/${c.requested} coin đủ dữ liệu · thiếu ${c.INSUFFICIENT??0} · cũ/gap/lỗi ${(c.STALE??0)+(c.GAP??0)+(c.INVALID??0)}</span>`).join('')||'<span class="pending">Đang lấy danh sách Binance USDT perpetual…</span>';
  $('patterns').innerHTML=(data.patterns??[]).map(c=>{
    const key=risingVolumePatternKey(c.pattern);
    return `<article class="pattern-card ${c.pattern.toLowerCase()}" data-live-card-key="${escapeHtml(key)}" ${binanceCardAvgRoeAttrs(c.closedCount>0?c.closedAvgRoe:null)}>
      <span class="heading">${escapeHtml(RISING_VOLUME_PATTERN_LABELS[c.pattern])}</span><strong>${c.active}</strong><p>hiện tại · <span class="long-count">LONG ${c.activeLong}</span> / <span class="short-count">SHORT ${c.activeShort}</span></p>
      <p>${c.pattern==='SUSTAINED'?'Nền volume 1m được duy trì · cho phép cột lên xuống nhẹ':c.pattern==='BURSTY'?'Volume 1m cao rồi tụt rất thấp · không duy trì nền':'Có dữ liệu 1m, chưa rõ hai kiểu trên'}</p><p>${c.observations} đợt đã lưu theo loại lúc phát hiện</p><p>${closedSummary(c)}</p></article>`;
  }).join('');
  $('cohorts').innerHTML=(data.cohorts??[]).map(c=>{
    const key=risingVolumeKey(c.interval,c.side);
    // No synthetic trades: only REAL closed AvgROE may expose the shared control.
    const avg=c.closedCount>0?c.closedAvgRoe:null;
    return `<article class="cohort ${c.side==='LONG'?'long':'short'}" data-live-card-key="${escapeHtml(key)}" ${binanceCardAvgRoeAttrs(avg)}><span class="heading">${escapeHtml(c.interval)} · ${escapeHtml(c.side)}</span><strong>${c.active}</strong><p>đang đạt điều kiện</p><p>${c.observations} đợt quan sát đã lưu</p><p>${closedSummary(c)}</p></article>`;
  }).join('');
  let rows=data.rows??[];
  if(selectedId && data.detail && !rows.some(r=>r.id===selectedId))rows=[data.detail,...rows];
  const renderRows=items=>items.map(row=>renderRow(row,{highlight:row.id===selectedId})).join('');
  $('signals').innerHTML=!rows.length?
    '<div class="empty">Chưa có tín hiệu khớp bộ lọc. Xem độ phủ ở trên: coin thiếu/cũ dữ liệu chưa được kết luận là không có tín hiệu.</div>':
    $('pattern').value!=='ALL'?renderRows(rows):['SUSTAINED','BURSTY','OTHER','UNKNOWN'].map(pattern=>{
      const members=rows.filter(row=>(RISING_VOLUME_PATTERN_LABELS[row.volumePattern]?row.volumePattern:'UNKNOWN')===pattern);
      return members.length?`<section class="pattern-section ${pattern.toLowerCase()}"><h3>${escapeHtml(RISING_VOLUME_PATTERN_LABELS[pattern])}</h3>${renderRows(members)}</section>`:'';
    }).join('');
  $('signals').querySelectorAll('.signal').forEach(article=>{
    const previous=openDetails.get(article.id);if(!previous)return;
    article.querySelector('.snapshot').open=previous.snapshot;
    const frame=article.querySelector('.signal-frame-chart');if(frame&&previous.frame!==undefined)frame.open=previous.frame;
    const ratio=article.querySelector('.ratio-curve');if(ratio&&previous.ratio!==undefined)ratio.open=previous.ratio;
  });
  $('result-count').textContent=`${data.total} kết quả${$('view').value==='history'?' lịch sử':' hiện tại'}`;
  $('page-label').textContent=data.total?`${data.offset+1}–${Math.min(data.offset+data.limit,data.total)} / ${data.total}`:'0 kết quả';
  $('previous').disabled=offset===0;$('next').disabled=offset+pageSize>=data.total;
}

async function load() {
  const seq=++sequence;controller?.abort();controller=new AbortController();
  const requestController=controller;
  const timeout=setTimeout(()=>requestController.abort(),12000);
  const params=new URLSearchParams({view:$('view').value,search:$('search').value,side:$('side').value,
    interval:$('interval').value,pattern:$('pattern').value,offset:String(offset),limit:String(pageSize)});
  if(selectedId)params.set('id',selectedId);
  $('refresh').disabled=true;$('status').className='status';$('status').textContent='Đang tải…';
  try {
    const response=await fetch(`/api/rising-volume?${params}`,{signal:requestController.signal,cache:'no-store'});
    const next=await response.json();if(!response.ok)throw new Error(next.error??`HTTP ${response.status}`);
    if(seq!==sequence)return;
    if(next.version!==RISING_VOLUME_VERSION||next.patternVersion!==RISING_VOLUME_PATTERN_VERSION)throw new Error('Phiên bản dữ liệu không khớp. Hãy reload trang.');
    data=next;render();$('status').textContent=next.error?`Bộ quét đang lỗi: ${next.error} · giữ dữ liệu cũ.`:
      'Tự cập nhật 15 giây · đọc trang không submit Binance · runner riêng chỉ xử lý tín hiệu mới 1m liền mạch.';
    $('status').classList.toggle('error',Boolean(next.error));
  } catch(error) {
    if(seq!==sequence)return;
    $('status').className='status error';$('status').textContent=`Không tải được: ${error.name==='AbortError'?'quá thời gian chờ':error.message}. ${data?'Đang hiển thị dữ liệu lần trước.':''}`;
  } finally {clearTimeout(timeout);if(seq===sequence)$('refresh').disabled=false;}
}

const initial=new URLSearchParams(location.search);
for(const id of ['view','side','interval','pattern']){const value=initial.get(id);if(value && [...$(id).options].some(o=>o.value===value))$(id).value=value;}
if(selectedId)$('view').value='history';
if(initial.get('search'))$('search').value=initial.get('search').slice(0,40);
$('filters').addEventListener('submit',event=>{event.preventDefault();void load();});
for(const id of ['view','side','interval','pattern'])$(id).addEventListener('change',()=>{offset=0;void load();});
$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{offset=0;void load();},300);});
$('unit').addEventListener('change',render);
$('previous').addEventListener('click',()=>{offset=Math.max(0,offset-pageSize);void load();});
$('next').addEventListener('click',()=>{offset+=pageSize;void load();});
function toggleChart(target) {
  const bar=target.closest?.('.volume-bar');if(!bar)return;
  const readout=bar.closest('.chart').querySelector('.chart-readout');
  if(!readout.hidden && readout.textContent===bar.dataset.readout){readout.hidden=true;return;}
  readout.textContent=bar.dataset.readout;readout.hidden=false;
}
$('signals').addEventListener('click',event=>toggleChart(event.target));
$('signals').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('.volume-bar')){event.preventDefault();toggleChart(event.target);}});
installLiveCardWhitelistUi({page:'rising-volume',label:'VOLUME TĂNG DẦN · WHITELIST THỐNG KÊ'});
installRatioChartInteraction($('signals'));
installPassedSignals();
void load();setInterval(()=>{if(!document.hidden)void load();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});
