import { DUMP_CAP_FRAMES, DUMP_CAP_STAGES, dumpCapCardKey } from './dump-cap-rejection-model.js';
import { installLiveCardWhitelistUi } from './live-card-whitelist-ui.js';
import { PostMoveLivePriceSocket } from './post-move-live-prices.js';
import {
  RESISTANCE_LABELS,
  RESISTANCE_TYPES,
  dumpResistanceKey,
  liveDumpResistance,
} from './dump-resistance-model.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const price = value => Number.isFinite(value) && value > 0
  ? value.toLocaleString('en-US', { maximumSignificantDigits: 7 }) : '—';
const num = value => Number.isFinite(value) ? value.toFixed(2) : '—';
const time = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

let interval = '15m';
let sortKey = 'stage';
let direction = 1;
let page = 0;
let requestId = 0;
let controller;
const snapshots = new Map();
const ticks = new Map();
const brokenResistance = new Map();
let displayedRows = [];
const rank = { VOLUME_REJECTION: 0, REJECTING: 1, AT_CAP: 2, INVALIDATED: 3 };

const socket = new PostMoveLivePriceSocket({
  onTick: tick => {
    ticks.set(tick.symbol, tick);
    for (const row of displayedRows) {
      const plan = row.resistance;
      if (row.symbol === tick.symbol && plan?.stop > 0 && tick.markPrice >= plan.stop
        && tick.eventAt >= (plan.confirmedAt ?? 0) && tick.eventAt <= Date.now() + 2000
        && Date.now() - tick.eventAt <= 15000) {
        brokenResistance.set(`${row.id}:${plan.confirmedAt ?? 0}`, Date.now());
      }
    }
  },
  onState: state => { $('socket-status').textContent = `MARK SOCKET · ${state.detail}`; },
});

$('stage').insertAdjacentHTML('beforeend', Object.entries(DUMP_CAP_STAGES)
  .map(([key, label]) => `<option value="${key}">${label}</option>`).join(''));
$('frame-tabs').innerHTML = Object.keys(DUMP_CAP_FRAMES).map(frame => (
  `<button class="timeframe-tab" id="tab-${frame}" role="tab" aria-controls="frame-panel" data-frame="${frame}">${frame}<small data-count="${frame}">Chưa tải</small></button>`
)).join('');
installLiveCardWhitelistUi({ page: 'dump-cap', label: 'Xả · hồi đỉnh · từ chối', root: $('stage-cards') });
installLiveCardWhitelistUi({ page: 'dump-resistance', label: 'Kháng cự SHORT tham khảo', root: $('resistance-cards') });

function visibleRecords() {
  const search = $('search').value.trim().toUpperCase();
  const stage = $('stage').value;
  const sweep = $('sweep').value;
  return (snapshots.get(interval)?.records ?? []).filter(row => row.symbol.includes(search)
    && (stage === 'ALL' || row.stage === stage)
    && (sweep === 'ALL' || row.sweptAbove === (sweep === 'ABOVE'))).sort((a, b) => {
    const left = sortKey === 'stage' ? rank[a.stage] : a[sortKey];
    const right = sortKey === 'stage' ? rank[b.stage] : b[sortKey];
    return direction * (typeof left === 'string' ? left.localeCompare(right) : left - right)
      || b.dumpAt - a.dumpAt || a.symbol.localeCompare(b.symbol);
  });
}

function render() {
  const snapshot = snapshots.get(interval);
  for (const button of $('frame-tabs').querySelectorAll('button')) {
    button.setAttribute('aria-selected', String(button.dataset.frame === interval));
    button.tabIndex = button.dataset.frame === interval ? 0 : -1;
  }
  $('frame-panel').setAttribute('aria-labelledby', `tab-${interval}`);
  for (const [frame, saved] of snapshots) {
    document.querySelector(`[data-count="${frame}"]`).textContent = `${saved.totalCases} case · ${saved.covered}/${saved.totalSymbols} coin`;
  }
  $('stage-cards').innerHTML = Object.entries(DUMP_CAP_STAGES).map(([stage, label]) => (
    `<article class="stage-${stage}" data-live-card-key="${dumpCapCardKey(interval, stage)}" data-binance-card-avg-roe=""><span>${label}</span><strong>${snapshot?.counts[stage] ?? '—'}</strong><small>WHITELIST OFF · chưa có lệnh đóng</small></article>`
  )).join('');
  $('resistance-cards').innerHTML = Object.entries(RESISTANCE_LABELS).map(([status, label]) => (
    `<article data-live-card-key="${dumpResistanceKey(interval, status)}" data-binance-card-avg-roe=""><span>${label}</span><strong data-resistance-count="${status}">0</strong><small>WHITELIST OFF · chưa có lệnh đóng</small></article>`
  )).join('');
  const warmup = snapshot ? ({
    WARMING: 'đang bổ sung chậm', PAUSED_RATE_GATE: 'tạm dừng do rate gate',
    CACHE_READY: 'đủ cache', IDLE: 'chờ lượt', RETRY_LATER: 'chờ thử lại',
  })[snapshot.warmup] ?? snapshot.warmup : '';
  $('coverage').textContent = snapshot
    ? `${interval} · ${snapshot.totalCases} case / ${snapshot.uniqueCoins} coin · cache đủ và mới ${snapshot.covered}/${snapshot.totalSymbols} coin · cập nhật ${time(snapshot.generatedAt)} · bổ sung cache: ${warmup}`
    : 'Đang tải khung này…';
  $('exclusions').textContent = snapshot
    ? `Thiếu nến: ${snapshot.excluded.INSUFFICIENT_DATA} · đứt chuỗi nến: ${snapshot.excluded.DATA_GAP} · cache cũ: ${snapshot.excluded.STALE_DATA} · đủ dữ liệu nhưng không có mẫu: ${snapshot.excluded.NO_PATTERN}. Số case là snapshot quan sát, không phải lệnh hoặc tỷ lệ thắng.`
    : '';
  const filtered = visibleRecords();
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  page = Math.min(page, pages - 1);
  const rows = filtered.slice(page * 50, page * 50 + 50);
  displayedRows = rows;
  $('rows').innerHTML = rows.length ? rows.map(row => {
    const maxVolume = Math.max(...row.volumeSequence, 1);
    const plan = row.resistance;
    return `<tr class="stage-${row.stage}" data-resistance-row="${esc(row.id)}"><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}" target="_blank" rel="noopener">${esc(row.symbol)}</a><small>${interval} · chỉ quan sát</small></td>
      <td class="resistance-cell"><b data-resistance-status>Đang kiểm tra kháng cự</b><small>${RESISTANCE_TYPES[plan?.type] ?? 'Chưa có vùng'} · ${price(plan?.zoneLow)} – ${price(plan?.zoneHigh)}</small><small data-resistance-distance></small></td>
      <td class="resistance-entry"><strong data-resistance-entry>—</strong><small data-resistance-range></small><small>${plan?.confirmedAt ? `Nến xác nhận ${time(plan.confirmedAt)}` : 'Cần nến retest giữ dưới vùng + nến phá đáy'}</small></td>
      <td>${price(plan?.stop)} / ${price(plan?.target)}<small>Mốc vô hiệu / hỗ trợ gần nhất · không phải lệnh SL/TP</small><small data-resistance-rr></small></td>
      <td><span class="stage-badge">${DUMP_CAP_STAGES[row.stage]}</span><small>${esc(row.reason)}</small></td>
      <td><b>${price(row.close)}</b><small data-live="${esc(row.symbol)}" data-cap="${row.dumpOpen}" data-high="${row.retestHigh}">Chờ MARK socket</small><small>Nến đóng ${time(row.updatedAt)}</small></td>
      <td>${time(row.dumpAt)}<small>Hồi đỉnh ${time(row.retestAt)}</small></td>
      <td>${num(row.dumpRangeAtr)} ATR<small>Mở → đáy −${num(row.dumpFallPct)}% · vol ${num(row.dumpVolumeRatio)}×</small></td>
      <td>${price(row.dumpOpen)} / ${price(row.dumpLow)}<small>Đỉnh nến gốc ${price(row.dumpHigh)}</small></td>
      <td>${row.sweptAbove ? 'QUÉT TRÊN ĐỈNH' : 'VỀ QUANH ĐỈNH'}<small>Đỉnh sau hồi ${price(row.peakHigh)} · hồi ${num(row.retracePct)}% nhịp mở–đáy</small></td>
      <td>−${num(row.rejectionPct)}%<small>Giá đóng so với đỉnh sau hồi</small></td>
      <td>${num(row.volumeRatio)}× nền<div class="vol-bars" aria-hidden="true">${row.volumeSequence.map(value => `<i style="height:${Math.max(2, 22 * value / maxVolume)}px"></i>`).join('')}</div><small>${row.volumeSequence.map(value => Intl.NumberFormat('en', { notation: 'compact' }).format(value)).join(' → ')}<br>${row.volumeIncreasing ? 'Volume tăng 3 nến' : 'Volume chưa tăng đều'}</small></td>
      <td>${row.ageBars} / 96 nến<small>Không kéo dài mẫu quá 96 nến</small></td></tr>`;
  }).join('') : `<tr><td colspan="13" class="empty">${snapshot ? 'Không có case khớp bộ lọc trong phần dữ liệu đã phủ. Xem độ phủ bên trên.' : 'Đang đọc cache…'}</td></tr>`;
  $('page-status').textContent = `${filtered.length} case · trang ${page + 1}/${pages}`;
  $('prev').disabled = page === 0;
  $('next').disabled = page >= pages - 1;
  for (const button of document.querySelectorAll('[data-sort]')) {
    button.closest('th').removeAttribute('aria-sort');
    if (button.dataset.sort === sortKey) button.closest('th').setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');
  }
  if (!document.hidden) socket.setSymbols(rows.map(row => row.symbol));
  renderLive();
}

function renderLive() {
  if (document.hidden) return;
  for (const cell of document.querySelectorAll('[data-live]')) {
    const tick = ticks.get(cell.dataset.live);
    const fresh = tick && Date.now() - tick.eventAt <= 15000 && tick.eventAt <= Date.now() + 2000;
    cell.className = fresh && tick.markPrice > Number(cell.dataset.cap) ? 'live-warning' : 'live-mark';
    cell.textContent = fresh
      ? `MARK ${price(tick.markPrice)}${tick.markPrice > Number(cell.dataset.high) ? ' · trên đỉnh hồi' : tick.markPrice > Number(cell.dataset.cap) ? ' · trên đỉnh nến xả' : ''}`
      : 'Chưa có MARK mới · không phải giá live';
  }
  const counts = Object.fromEntries(Object.keys(RESISTANCE_LABELS).map(key => [key, 0]));
  const byId = new Map(displayedRows.map(row => [row.id, row]));
  for (const element of document.querySelectorAll('[data-resistance-row]')) {
    const row = byId.get(element.dataset.resistanceRow);
    const plan = row?.resistance;
    if (!row) continue;
    const evaluation = liveDumpResistance(plan, ticks.get(row.symbol), {
      snapshotAt: snapshots.get(interval)?.generatedAt,
      invalidated: brokenResistance.has(`${row.id}:${plan?.confirmedAt ?? 0}`),
    });
    counts[evaluation.status] += 1;
    element.classList.toggle('resistance-ready', evaluation.status === 'READY');
    element.classList.toggle('resistance-broken', evaluation.status === 'BROKEN');
    element.dataset.resistanceState = evaluation.status;
    element.querySelector('[data-resistance-status]').textContent = RESISTANCE_LABELS[evaluation.status];
    element.querySelector('[data-resistance-distance]').textContent = evaluation.distancePct != null
      ? `MARK cách mép kháng cự ${num(evaluation.distancePct)}%` : '';
    element.querySelector('[data-resistance-entry]').textContent = evaluation.status === 'READY' ? price(plan.entry) : '—';
    element.querySelector('[data-resistance-range]').textContent = evaluation.status === 'READY'
      ? `Vùng còn hợp lệ ${price(plan.entryLow)} – ${price(plan.entryHigh)} · MARK ${price(evaluation.live)}`
      : plan?.confirmedAt ? 'Không có entry live đạt lúc này' : 'Chưa xác nhận · chưa cấp entry';
    element.querySelector('[data-resistance-rr]').textContent = evaluation.rr != null
      ? `R:R tại MARK ${num(evaluation.rr)} · đã trừ chi phí giả định 0,12%`
      : plan?.rr != null ? `R:R nến xác nhận ${num(plan.rr)} · không phải R:R live` : 'Chưa đủ dữ liệu R:R';
  }
  for (const cell of document.querySelectorAll('[data-resistance-count]')) {
    cell.textContent = counts[cell.dataset.resistanceCount];
  }
  $('resistance-summary').textContent = `${counts.READY} case có kháng cự SHORT + entry live đạt / ${displayedRows.length} dòng đang xem · đỏ = đạt tại MARK mới, tím = mất kháng cự`;
  for (const [key, at] of brokenResistance) if (Date.now() - at > 4 * 86400000) brokenResistance.delete(key);
}

async function load() {
  if (document.hidden) return;
  controller?.abort();
  controller = new AbortController();
  const current = ++requestId;
  const frame = interval;
  const abort = controller;
  const timeout = setTimeout(() => abort.abort(), 20000);
  $('scan-status').textContent = 'Đang cập nhật từ cache dùng chung…';
  $('scan-status').classList.remove('scan-error');
  try {
    const response = await fetch(`/api/dump-cap-rejection?interval=${frame}`, { signal: abort.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (current !== requestId) return;
    snapshots.set(frame, data);
    render();
    $('scan-status').textContent = `Đã cập nhật ${time(data.generatedAt)} · tự làm mới 30 giây · Discord khi pass ${data.resistanceDiscord?.configured ? 'ON' : 'OFF'} · 50 dòng/trang`;
  } catch (error) {
    if (current !== requestId) return;
    $('scan-status').textContent = `Không cập nhật được (${error.name === 'AbortError' ? 'quá thời gian chờ' : error.message}). Dữ liệu đang hiển thị có thể cũ.`;
    $('scan-status').classList.add('scan-error');
  } finally {
    clearTimeout(timeout);
  }
}

function choose(frame) {
  interval = frame;
  page = 0;
  render();
  load();
}

$('frame-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-frame]');
  if (button) choose(button.dataset.frame);
});
$('frame-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const frames = Object.keys(DUMP_CAP_FRAMES);
  choose(frames[(frames.indexOf(interval) + (event.key === 'ArrowRight' ? 1 : 4)) % 5]);
  $(`tab-${interval}`).focus();
});
for (const id of ['search', 'stage', 'sweep']) $(id).addEventListener('input', () => { page = 0; render(); });
document.querySelector('thead').addEventListener('click', event => {
  const button = event.target.closest('[data-sort]');
  if (!button) return;
  direction = button.dataset.sort === sortKey ? -direction : 1;
  sortKey = button.dataset.sort;
  page = 0;
  render();
});
$('prev').onclick = () => { page -= 1; render(); };
$('next').onclick = () => { page += 1; render(); };
$('refresh').onclick = load;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    controller?.abort();
    socket.disconnect();
  } else {
    render();
    load();
  }
});
window.addEventListener('pagehide', () => { controller?.abort(); socket.disconnect(); });
setInterval(load, 30000);
setInterval(renderLive, 1000);
render();
load();
