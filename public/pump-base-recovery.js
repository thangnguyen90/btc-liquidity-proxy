import { PUMP_BASE_FRAMES, PUMP_BASE_STAGES, pumpBaseCardKey } from './pump-base-recovery-model.js';
import { installLiveCardWhitelistUi } from './live-card-whitelist-ui.js';
import { PostMoveLivePriceSocket } from './post-move-live-prices.js';
import { SUPPORT_LABELS, SUPPORT_TYPES, livePumpSupport, pumpSupportKey } from './pump-support-model.js';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const price = v => Number.isFinite(v) && v > 0 ? v.toLocaleString('en-US', { maximumSignificantDigits: 7 }) : '—';
const num = v => Number.isFinite(v) ? v.toFixed(2) : '—';
const time = v => new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
let interval = '15m', sortKey = 'stage', direction = 1, page = 0, requestId = 0, controller;
const snapshots = new Map(), ticks = new Map();
const brokenSupport = new Map();
let displayedRows = [];
const rank = { VOLUME_RECOVERY: 0, RECOVERING: 1, AT_BASE: 2, WEAKENED: 3 };
const socket = new PostMoveLivePriceSocket({ onTick: t => {
  ticks.set(t.symbol, t);
  for (const r of displayedRows) if(r.symbol === t.symbol && r.support?.stop > 0 && t.markPrice <= r.support.stop && t.eventAt >= (r.support.confirmedAt ?? 0) && t.eventAt <= Date.now()+2000 && Date.now()-t.eventAt <= 15000) {
    brokenSupport.set(`${r.id}:${r.support.confirmedAt ?? 0}`, Date.now());
  }
}, onState: s => { $('socket-status').textContent = `MARK SOCKET · ${s.detail}`; } });
$('stage').insertAdjacentHTML('beforeend', Object.entries(PUMP_BASE_STAGES).map(([k,v]) => `<option value="${k}">${v}</option>`).join(''));
$('frame-tabs').innerHTML = Object.keys(PUMP_BASE_FRAMES).map(k => `<button class="timeframe-tab" id="tab-${k}" role="tab" aria-controls="frame-panel" data-frame="${k}">${k}<small data-count="${k}">Chưa tải</small></button>`).join('');
installLiveCardWhitelistUi({ page: 'pump-base', label: 'Bơm · trả chân · hồi', root: $('stage-cards') });
installLiveCardWhitelistUi({ page: 'pump-support', label: 'Hỗ trợ LONG tham khảo', root: $('support-cards') });

function visibleRecords() {
  const search = $('search').value.trim().toUpperCase(), stage = $('stage').value, sweep = $('sweep').value;
  return (snapshots.get(interval)?.records ?? []).filter(r => r.symbol.includes(search) && (stage === 'ALL' || r.stage === stage)
    && (sweep === 'ALL' || r.sweptBelow === (sweep === 'BELOW'))).sort((a,b) => {
    const x = sortKey === 'stage' ? rank[a.stage] : a[sortKey], y = sortKey === 'stage' ? rank[b.stage] : b[sortKey];
    return direction * (typeof x === 'string' ? x.localeCompare(y) : x - y) || b.pumpAt - a.pumpAt || a.symbol.localeCompare(b.symbol);
  });
}
function render() {
  const s = snapshots.get(interval);
  for (const b of $('frame-tabs').querySelectorAll('button')) { b.setAttribute('aria-selected', String(b.dataset.frame === interval)); b.tabIndex = b.dataset.frame === interval ? 0 : -1; }
  $('frame-panel').setAttribute('aria-labelledby', `tab-${interval}`);
  for (const [k, snap] of snapshots) document.querySelector(`[data-count="${k}"]`).textContent = `${snap.totalCases} case · ${snap.covered}/${snap.totalSymbols} coin`;
  $('stage-cards').innerHTML = Object.entries(PUMP_BASE_STAGES).map(([stage, label]) => `<article class="stage-${stage}" data-live-card-key="${pumpBaseCardKey(interval, stage)}" data-binance-card-avg-roe=""><span>${label}</span><strong>${s?.counts[stage] ?? '—'}</strong><small>WHITELIST OFF · chưa có lệnh đóng</small></article>`).join('');
  $('support-cards').innerHTML = Object.entries(SUPPORT_LABELS).map(([status,label])=>`<article data-live-card-key="${pumpSupportKey(interval,status)}" data-binance-card-avg-roe=""><span>${label}</span><strong data-support-count="${status}">0</strong><small>WHITELIST OFF · chưa có lệnh đóng</small></article>`).join('');
  $('coverage').textContent = s ? `${interval} · ${s.totalCases} case / ${s.uniqueCoins} coin · cache đủ và mới ${s.covered}/${s.totalSymbols} coin · cập nhật ${time(s.generatedAt)} · bổ sung cache: ${({ WARMING:'đang bổ sung chậm', PAUSED_RATE_GATE:'tạm dừng do rate gate', CACHE_READY:'đủ cache', IDLE:'chờ lượt', RETRY_LATER:'chờ thử lại' })[s.warmup] ?? s.warmup}` : 'Đang tải khung này…';
  $('exclusions').textContent = s ? `Thiếu nến: ${s.excluded.INSUFFICIENT_DATA} · đứt chuỗi nến: ${s.excluded.DATA_GAP} · cache cũ: ${s.excluded.STALE_DATA} · đủ dữ liệu nhưng không có mẫu: ${s.excluded.NO_PATTERN}. Số case là snapshot quan sát, không phải lệnh hoặc tỷ lệ thắng.` : '';
  const filtered = visibleRecords();
  const pages = Math.max(1, Math.ceil(filtered.length / 50)); page = Math.min(page, pages - 1);
  const rows = filtered.slice(page * 50, page * 50 + 50);
  displayedRows = rows;
  $('rows').innerHTML = rows.length ? rows.map(r => {
    const maxVol = Math.max(...r.volumeSequence, 1);
    return `<tr class="stage-${r.stage}" data-support-row="${esc(r.id)}"><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(r.symbol)}" target="_blank" rel="noopener">${esc(r.symbol)}</a><small>${interval} · chỉ quan sát</small></td>
      <td class="support-cell"><b data-support-status>Đang kiểm tra hỗ trợ</b><small>${SUPPORT_TYPES[r.support?.type] ?? 'Chưa có vùng'} · ${price(r.support?.zoneLow)} – ${price(r.support?.zoneHigh)}</small><small data-support-distance></small></td>
      <td class="support-entry"><strong data-support-entry>—</strong><small data-support-range></small><small>${r.support?.confirmedAt ? `Nến xác nhận ${time(r.support.confirmedAt)}` : 'Cần nến retest giữ vùng + nến vượt đỉnh'}</small></td>
      <td>${price(r.support?.stop)} / ${price(r.support?.target)}<small>Mốc vô hiệu / kháng cự gần nhất · không phải lệnh SL/TP</small><small data-support-rr></small></td>
      <td><span class="stage-badge">${PUMP_BASE_STAGES[r.stage]}</span><small>${esc(r.reason)}</small></td>
      <td><b>${price(r.close)}</b><small data-live="${esc(r.symbol)}" data-foot="${r.pumpOpen}" data-low="${r.retestLow}">Chờ MARK socket</small><small>Nến đóng ${time(r.updatedAt)}</small></td>
      <td>${time(r.pumpAt)}<small>Trả chân ${time(r.retestAt)}</small></td>
      <td>${num(r.pumpRangeAtr)} ATR<small>Mở → đỉnh +${num(r.pumpRisePct)}% · vol ${num(r.pumpVolumeRatio)}×</small></td>
      <td>${price(r.pumpOpen)} / ${price(r.pumpHigh)}<small>Đáy nến gốc ${price(r.pumpLow)}</small></td>
      <td>${r.sweptBelow ? 'QUÉT DƯỚI CHÂN' : 'VỀ QUANH CHÂN'}<small>Đáy sau trả ${price(r.troughLow)} · trả ${num(r.retracePct)}% nhịp mở–đỉnh</small></td>
      <td>+${num(r.reboundPct)}%<small>Giá đóng so với đáy sau trả chân</small></td>
      <td>${num(r.volumeRatio)}× nền<div class="vol-bars" aria-hidden="true">${r.volumeSequence.map(v => `<i style="height:${Math.max(2,22*v/maxVol)}px"></i>`).join('')}</div><small>${r.volumeSequence.map(v => Intl.NumberFormat('en', { notation:'compact' }).format(v)).join(' → ')}<br>${r.volIncreasing ? 'Volume tăng 3 nến' : 'Volume chưa tăng đều'}</small></td>
      <td>${r.ageBars} / 96 nến<small>Không kéo dài mẫu quá 96 nến</small></td></tr>`;
  }).join('') : `<tr><td colspan="13" class="empty">${s ? 'Không có case khớp bộ lọc trong phần dữ liệu đã phủ. Xem độ phủ bên trên.' : 'Đang đọc cache…'}</td></tr>`;
  $('page-status').textContent = `${filtered.length} case · trang ${page+1}/${pages}`;
  $('prev').disabled = page === 0; $('next').disabled = page >= pages-1;
  for (const b of document.querySelectorAll('[data-sort]')) { b.closest('th').removeAttribute('aria-sort'); if (b.dataset.sort === sortKey) b.closest('th').setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending'); }
  if (!document.hidden) socket.setSymbols(rows.map(r => r.symbol));
  renderLive();
}
function renderLive() {
  if (document.hidden) return;
  for (const cell of document.querySelectorAll('[data-live]')) {
    const t = ticks.get(cell.dataset.live), fresh = t && Date.now() - t.eventAt <= 15000 && t.eventAt <= Date.now()+2000;
    cell.className = fresh && t.markPrice < Number(cell.dataset.foot) ? 'live-warning' : 'live-mark';
    cell.textContent = fresh ? `MARK ${price(t.markPrice)}${t.markPrice < Number(cell.dataset.low) ? ' · dưới đáy trả chân' : t.markPrice < Number(cell.dataset.foot) ? ' · dưới chân nến' : ''}` : 'Chưa có MARK mới · không phải giá live';
  }
  const counts=Object.fromEntries(Object.keys(SUPPORT_LABELS).map(k=>[k,0]));
  const byId=new Map(displayedRows.map(r=>[r.id,r]));
  for(const row of document.querySelectorAll('[data-support-row]')) {
    const r=byId.get(row.dataset.supportRow), p=r?.support;
    if(!r) continue;
    const evaluation=livePumpSupport(p,ticks.get(r.symbol),{snapshotAt:snapshots.get(interval)?.generatedAt,invalidated:brokenSupport.has(`${r.id}:${p?.confirmedAt ?? 0}`)});
    counts[evaluation.status]++;
    row.classList.toggle('support-ready',evaluation.status==='READY');
    row.classList.toggle('support-broken',evaluation.status==='BROKEN');
    row.dataset.supportState=evaluation.status;
    row.querySelector('[data-support-status]').textContent=SUPPORT_LABELS[evaluation.status];
    row.querySelector('[data-support-distance]').textContent=evaluation.distancePct != null ? `MARK cách mép hỗ trợ ${num(evaluation.distancePct)}%` : '';
    row.querySelector('[data-support-entry]').textContent=evaluation.status==='READY' ? price(p.entry) : '—';
    row.querySelector('[data-support-range]').textContent=evaluation.status==='READY' ? `Vùng còn hợp lệ ${price(p.entryLow)} – ${price(p.entryHigh)} · MARK ${price(evaluation.live)}` : p?.confirmedAt ? 'Không có entry live đạt lúc này' : 'Chưa xác nhận · chưa cấp entry';
    row.querySelector('[data-support-rr]').textContent=evaluation.rr != null ? `R:R tại MARK ${num(evaluation.rr)} · đã trừ chi phí giả định 0,12%` : p?.rr != null ? `R:R nến xác nhận ${num(p.rr)} · không phải R:R live` : 'Chưa đủ dữ liệu R:R';
  }
  for(const cell of document.querySelectorAll('[data-support-count]')) cell.textContent=counts[cell.dataset.supportCount];
  $('support-summary').textContent=`${counts.READY} case có hỗ trợ LONG + entry live đạt / ${displayedRows.length} dòng đang xem · xanh = đạt tại MARK mới, đỏ = mất hỗ trợ`;
  for(const [key,at] of brokenSupport) if(Date.now()-at>4*86400000) brokenSupport.delete(key);
}
async function load() {
  if (document.hidden) return;
  controller?.abort(); controller = new AbortController();
  const current = ++requestId, frame = interval, abort = controller;
  const timeout = setTimeout(() => abort.abort(), 20000);
  $('scan-status').textContent = 'Đang cập nhật từ cache dùng chung…'; $('scan-status').classList.remove('scan-error');
  try {
    const response = await fetch(`/api/pump-base-recovery?interval=${frame}`, { signal: abort.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (current !== requestId) return;
    snapshots.set(frame, data); render();
    $('scan-status').textContent = `Đã cập nhật ${time(data.generatedAt)} · tự làm mới 30 giây · Discord khi pass ${data.supportDiscord?.configured ? 'ON' : 'OFF'} · 50 dòng/trang`;
  } catch (e) {
    if (current !== requestId) return;
    $('scan-status').textContent = `Không cập nhật được (${e.name === 'AbortError' ? 'quá thời gian chờ' : e.message}). Dữ liệu đang hiển thị có thể cũ.`;
    $('scan-status').classList.add('scan-error');
  } finally { clearTimeout(timeout); }
}
function choose(frame) { interval = frame; page = 0; render(); load(); }
$('frame-tabs').addEventListener('click', e => { const b = e.target.closest('[data-frame]'); if (b) choose(b.dataset.frame); });
$('frame-tabs').addEventListener('keydown', e => { if (!['ArrowLeft','ArrowRight'].includes(e.key)) return; e.preventDefault(); const frames = Object.keys(PUMP_BASE_FRAMES); choose(frames[(frames.indexOf(interval)+(e.key==='ArrowRight'?1:4))%5]); $(`tab-${interval}`).focus(); });
for (const id of ['search','stage','sweep']) $(id).addEventListener('input', () => { page=0; render(); });
document.querySelector('thead').addEventListener('click', e => { const b = e.target.closest('[data-sort]'); if (!b) return; direction = b.dataset.sort === sortKey ? -direction : 1; sortKey=b.dataset.sort; page=0; render(); });
$('prev').onclick = () => { page--; render(); }; $('next').onclick = () => { page++; render(); }; $('refresh').onclick = load;
document.addEventListener('visibilitychange', () => { if (document.hidden) { controller?.abort(); socket.disconnect(); } else { render(); load(); } });
window.addEventListener('pagehide', () => { controller?.abort(); socket.disconnect(); });
setInterval(load, 30000); setInterval(renderLive, 1000); render(); load();
