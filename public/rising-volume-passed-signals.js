import {renderRatioDiagnostics,installRatioChartInteraction} from './rising-volume-ratio-diagnostics.js?v=20261012-binance-chart-v2';
const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(x,n=4)=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('vi-VN',{maximumFractionDigits:n});
const time=x=>x?new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}):'—';
const states={CLOSED:'Đã đóng',OPEN:'Đang mở · audit fill',PARTIALLY_CLOSED:'Chốt một phần',BLOCKED:'Không vào lệnh',
  AWAITING_AUDIT:'Đã gửi · chờ audit khớp',UNKNOWN:'Kết quả gửi chưa rõ'};
const reasons={EXISTING_POSITION:'Đã có vị thế',EXISTING_ORDER:'Đã có entry chờ',MAX_OPEN_POSITIONS:'Đã đủ cap',
  PRICE_OR_AGE_BLOCKED:'Giá lệch / tín hiệu quá tuổi',PROTECTION_DISABLED:'Protection coin đang tắt',
  UNRESOLVED_PREVIOUS_ORDER:'Lệnh trước chưa rõ kết quả',RUNTIME_OFF:'Execution đang tắt',CONTROL_CHANGED:'Cấu hình đã đổi'};
const target=new URLSearchParams(location.search).get('passed');
let current=null,page=1;
export function renderPassedSignals(next) {
  current=next;const list=document.getElementById('passed-list'),status=document.getElementById('passed-status');
  if(!list)return;
  if(next?.version!=='RISING_VOLUME_PASSED_LEDGER_REAL_PNL_V1_20261012'){
    status.textContent='Runtime chưa cung cấp danh sách PASS đã lưu; không suy từ ratio khi xem.';list.innerHTML='';return;
  }
  const open=new Set([...list.querySelectorAll('.ratio-curve[open]')].map(n=>n.closest('[data-pass-id]').dataset.passId));
  const side=document.getElementById('passed-side').value,state=document.getElementById('passed-state').value;
  const search=document.getElementById('passed-search').value.trim().toUpperCase();
  let rows=(next.rows??[]).filter(r=>(side==='ALL'||r.side===side)&&(!search||r.symbol.includes(search))
    &&(state==='ALL'||(state==='ENTERED'?['OPEN','CLOSED','PARTIALLY_CLOSED'].includes(r.orderState):r.orderState===state)));
  const selected=(next.rows??[]).find(r=>r.id===target);
  if(selected)rows=[selected,...rows.filter(r=>r.id!==target)];
  page=Math.max(1,Math.min(page,Math.ceil(rows.length/10)||1));
  status.textContent=`${rows.length}/${next.total} tín hiệu PASS được lưu · 14 ngày · ${time(next.updatedAt)}. Không phải số lệnh thắng/thua.`;
  list.innerHTML=rows.slice((page-1)*10,page*10).map(r=>{
    const signed=x=>x==null?'—':`${x>0?'+':''}${num(x,6)}`;
    return `<article class="passed-row ${r.side==='LONG'?'long':'short'} ${r.id===target?'pass-selected':''}" data-pass-id="${esc(r.id)}">
      <div class="signal-head"><div><a class="coin" href="https://www.binance.com/en/futures/${encodeURIComponent(r.symbol)}" target="_blank" rel="noopener">${esc(r.symbol)}</a><span class="bias ${r.side==='LONG'?'long':'short'}">${esc(r.side)} · 1m liền mạch · RATIO PASS</span></div><a href="${esc(r.url)}">Mở bản ghi PASS</a></div>
      <p class="muted">Nến đóng ${esc(time(r.closedAt))} · ratio lưu ${esc(time(r.passedAt))}</p>
      <div class="passed-metrics"><div><span>Binance</span><strong>${esc(states[r.orderState]??r.orderState)}</strong><small>${esc(reasons[r.attemptStatus]??r.attemptStatus)}</small></div>
        <div><span>Margin dự kiến · đòn bẩy</span><strong>${num(r.marginUsdt)} USDT ×${num(r.leverage,0)}</strong><small>Margin audit ${num(r.actualMarginUsdt)} USDT</small></div>
        <div><span>Giá khớp</span><strong>${num(r.fillPrice,10)}</strong><small>${esc(time(r.filledAt))}</small></div>
        <div><span>PnL ròng đã chốt · USDT</span><strong class="${r.netRealizedPnlUsdt>0?'pnl-positive':r.netRealizedPnlUsdt<0?'pnl-negative':''}">${signed(r.netRealizedPnlUsdt)}</strong><small>ROE ${r.realizedRoePct==null?'—':signed(r.realizedRoePct)+'%'}</small></div></div>
      <p class="muted">${esc(r.pnlNote)}${r.exitedAt?` · Đóng ${esc(time(r.exitedAt))}`:''}${r.closeReason?` · ${esc(r.closeReason)}`:''}${r.orderId?` · Order ${esc(r.orderId)}`:''}</p>
      ${renderRatioDiagnostics({...r,ratioDiagnostics:r.ratioDiagnostics})}</article>`;
  }).join('')||'<p class="muted">Chưa có bản ghi PASS khớp bộ lọc. Không dùng dữ liệu ratio hôm nay để gán PASS cho mẫu cũ.</p>';
  for(const n of list.querySelectorAll('.ratio-curve'))n.open=open.has(n.closest('[data-pass-id]').dataset.passId)||n.closest('[data-pass-id]').dataset.passId===target;
  document.getElementById('passed-previous').disabled=page<=1;
  document.getElementById('passed-next').disabled=page*10>=rows.length;
  document.getElementById('passed-page').textContent=`${page}/${Math.ceil(rows.length/10)||1}`;
}
export function installPassedSignals() {
  const list=document.getElementById('passed-list');if(!list)return;
  installRatioChartInteraction(list);
  for(const id of ['passed-side','passed-state','passed-search'])document.getElementById(id).addEventListener(id==='passed-search'?'input':'change',()=>{page=1;renderPassedSignals(current);});
  document.getElementById('passed-previous').addEventListener('click',()=>{page--;renderPassedSignals(current);});
  document.getElementById('passed-next').addEventListener('click',()=>{page++;renderPassedSignals(current);});
}
