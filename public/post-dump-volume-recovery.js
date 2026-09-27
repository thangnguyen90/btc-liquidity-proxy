import { buildDualDirectionKeys, isDualDirection } from './post-move-dual-direction.js?v=20260924-v1';
import { comparePostMoveLivePrice, PostMoveLivePriceSocket } from './post-move-live-prices.js?v=20260924-v1';
import { nextPostMoveSort, sortPostMoveRows } from './post-move-table-sort.js?v=20260924-v1';

const $ = (id) => document.getElementById(id);
const state = {
  timeframes: [], loading: false, activeInterval: '15m', dualKeys: new Set(), livePrices: new Map(), sort: null,
};

function formatNumber(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (Math.abs(number) >= 1000) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number);
  if (Math.abs(number) >= 1) return number.toFixed(Math.min(digits, 4));
  return number.toPrecision(5).replace(/0+$/, '').replace(/\.$/, '');
}

function formatPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatCompact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(number);
}

function formatTime(value) {
  const time = Number(value);
  if (!Number.isFinite(time)) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(time));
}

const STATUS = {
  CONFIRMED: { text: 'ĐÃ XÁC NHẬN', className: 'confirmed' },
  BUILDING: { text: 'ĐANG HỒI', className: 'building' },
  WEAKENED: { text: 'YẾU LẠI', className: 'weakened' },
};

const STATUS_SORT_RANK = { CONFIRMED: 3, BUILDING: 2, WEAKENED: 1 };
const sortableNumber = (value) => (value == null || value === '' ? null : Number(value));

function sortValue(item, key) {
  const values = {
    symbol: item.symbol,
    status: STATUS_SORT_RANK[item.status] ?? 0,
    stage: sortableNumber(item.moveStage?.rank),
    score: sortableNumber(item.score),
    live: sortableNumber(state.livePrices.get(item.symbol)?.markPrice ?? item.currentPrice),
    entry: sortableNumber(item.idealEntry?.midpoint),
    recovery: sortableNumber(item.recoveryPct),
    fromClose: sortableNumber(item.fromDumpClosePct),
    candle: Math.max(Math.abs(sortableNumber(item.dumpBodyPct)), Math.abs(sortableNumber(item.dumpLowPct))),
    volume: sortableNumber(item.dumpQuoteVolume),
    flowAt: sortableNumber(item.lift?.closeTime),
    confirmation: sortableNumber(item.confirmationPrice),
    invalidation: sortableNumber(item.invalidationPrice),
    anchorAt: sortableNumber(item.dumpAt),
  };
  return values[key];
}

function sortHeader(label, key, defaultDirection = 'desc') {
  const active = state.sort?.key === key;
  const direction = active ? state.sort.direction : null;
  const arrow = direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕';
  return `<th aria-sort="${active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sort-column${active ? ' active' : ''}" data-post-move-sort="${key}" data-default-direction="${defaultDirection}"><span>${label}</span><b>${arrow}</b></button></th>`;
}

function liveComparison(item, price = state.livePrices.get(item.symbol)?.markPrice ?? item.currentPrice) {
  return comparePostMoveLivePrice({
    price,
    snapshotPrice: item.currentPrice,
    zoneLow: item.idealEntry?.zoneLow,
    zoneHigh: item.idealEntry?.zoneHigh,
    midpoint: item.idealEntry?.midpoint,
  });
}

function livePriceCell(item) {
  const tick = state.livePrices.get(item.symbol);
  const comparison = liveComparison(item, tick?.markPrice ?? item.currentPrice);
  const movementClass = Number(comparison.deltaSnapshotPct) >= 0 ? 'live-up' : 'live-down';
  return `<div class="live-price-cell${comparison.inZone ? ' live-in-zone' : ''}" data-live-symbol="${item.symbol}" data-snapshot-price="${item.currentPrice}" data-zone-low="${item.idealEntry?.zoneLow ?? ''}" data-zone-high="${item.idealEntry?.zoneHigh ?? ''}" data-midpoint="${item.idealEntry?.midpoint ?? ''}">
    <strong class="live-price-value">${formatNumber(comparison.price)}</strong>
    <small class="live-price-delta ${movementClass}">${tick ? `${formatPct(comparison.deltaSnapshotPct)} từ cache` : 'chờ tick socket'}</small>
    <small class="live-cache-price">Cache ${formatNumber(item.currentPrice)}</small>
  </div>`;
}

function applyLiveTick(tick) {
  state.livePrices.set(tick.symbol, tick);
  document.querySelectorAll(`[data-live-symbol="${tick.symbol}"]`).forEach((cell) => {
    const comparison = comparePostMoveLivePrice({
      price: tick.markPrice,
      snapshotPrice: cell.dataset.snapshotPrice,
      zoneLow: cell.dataset.zoneLow,
      zoneHigh: cell.dataset.zoneHigh,
      midpoint: cell.dataset.midpoint,
    });
    cell.querySelector('.live-price-value').textContent = formatNumber(tick.markPrice);
    const delta = cell.querySelector('.live-price-delta');
    delta.textContent = `${formatPct(comparison.deltaSnapshotPct)} từ cache`;
    delta.className = `live-price-delta ${Number(comparison.deltaSnapshotPct) >= 0 ? 'live-up' : 'live-down'}`;
    cell.classList.toggle('live-in-zone', comparison.inZone);
    cell.closest('tr')?.classList.toggle('live-entry-touch-row', comparison.inZone);
  });
  document.querySelectorAll(`[data-entry-distance-symbol="${tick.symbol}"]`).forEach((node) => {
    const comparison = comparePostMoveLivePrice({ price: tick.markPrice, midpoint: node.dataset.midpoint });
    node.textContent = `Cách socket ${formatPct(comparison.distanceToMidPct)}`;
  });
}

const livePriceSocket = new PostMoveLivePriceSocket({
  onTick: applyLiveTick,
  onState: ({ state: socketState, detail }) => {
    const node = $('live-socket-status');
    if (!node) return;
    node.className = `live-socket-status ${socketState}`;
    node.textContent = `${socketState === 'connected' ? '● SOCKET LIVE' : '○ SOCKET'} · ${detail}`;
  },
});

async function fetchOptionalSnapshot(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function renderItemRows(items) {
  if (!items.length) return '<tr><td colspan="14" class="empty">Không có case phù hợp bộ lọc hiện tại.</td></tr>';
  return items.map((item) => {
    const meta = STATUS[item.status] ?? STATUS.BUILDING;
    const stage = item.moveStage ?? {};
    const dual = isDualDirection(item, state.dualKeys);
    const fromCloseClass = Number(item.fromDumpClosePct) >= 0 ? 'positive' : 'negative';
    const lift = item.lift
      ? `${formatTime(item.lift.closeTime)}<br><span class="positive">${formatPct(item.lift.pricePct)} · ${formatNumber(item.lift.volumeRatio, 2)}× nền</span>`
      : 'Chưa có nến xác nhận';
    const entry = item.idealEntry ?? {};
    const entryState = {
      IN_ZONE: '<span class="entry-state in-zone">ĐANG TRONG VÙNG</span>',
      WAIT_PULLBACK: '<span class="entry-state wait">CHỜ HỒI VỀ</span>',
      WAIT_RECLAIM: '<span class="entry-state wait">CHỜ RECLAIM</span>',
      AVOID_WEAKENED: '<span class="entry-state avoid">KHÔNG VÀO</span>',
    }[entry.state] ?? '<span class="entry-state wait">CHỜ DỮ LIỆU</span>';
    const idealEntry = Number.isFinite(Number(entry.midpoint))
      ? `<strong class="entry-price">${formatNumber(entry.midpoint)}</strong><br><small>${formatNumber(entry.zoneLow)} – ${formatNumber(entry.zoneHigh)}</small><br>${entryState}<br><small data-entry-distance-symbol="${item.symbol}" data-midpoint="${entry.midpoint}">Cách socket ${formatPct(liveComparison(item).distanceToMidPct)}</small>`
      : `${entryState}<br><small>Tín hiệu đã yếu lại</small>`;
    return `<tr class="${meta.className}-row${dual ? ' dual-direction-row' : ''}">
      <td><a class="coin-link" href="/coin-level-analysis?symbol=${encodeURIComponent(item.symbol)}">${item.symbol}</a><a class="binance-link" target="_blank" rel="noreferrer" href="https://www.binance.com/en/futures/${encodeURIComponent(item.symbol)}">Binance ↗</a></td>
      <td><span class="badge ${meta.className}">${meta.text}</span>${dual ? '<br><span class="dual-direction-badge" title="Cùng coin và cùng khung đang active ở cả LONG sau xả và SHORT sau bơm">↕ HAI CHIỀU</span>' : ''}</td>
      <td class="move-stage-cell"><span class="move-stage ${stage.tone ?? 'watch'}">${stage.label ?? 'CHƯA PHÂN LOẠI'}</span><small>${stage.entryHint ?? 'Chờ thêm dữ liệu nến đã đóng.'}</small></td>
      <td><span class="score">${Number(item.score).toFixed(1)}</span>/100</td>
      <td>${livePriceCell(item)}</td>
      <td class="ideal-entry-cell">${idealEntry}</td>
      <td class="positive">${Number(item.recoveryPct).toFixed(1)}%</td>
      <td class="${fromCloseClass}">${formatPct(item.fromDumpClosePct)}</td>
      <td><span class="negative">Body ${formatPct(item.dumpBodyPct)}</span><br>Low ${formatPct(item.dumpLowPct)}</td>
      <td>${formatCompact(item.dumpQuoteVolume)}<br>${formatNumber(item.dumpVolumeRatio, 2)}× nền</td>
      <td>${lift}</td>
      <td>${formatNumber(item.confirmationPrice)}</td>
      <td class="negative">${formatNumber(item.invalidationPrice)}</td>
      <td>${formatTime(item.dumpAt)}<br>${item.dumpAgeBars} nến trước</td>
    </tr>`;
  }).join('');
}

function renderZones() {
  const query = $('search').value.trim().toUpperCase();
  const selectedStatus = $('status').value;
  if (!state.timeframes.some((frame) => frame.interval === state.activeInterval)) {
    state.activeInterval = state.timeframes[0]?.interval ?? '15m';
  }
  $('timeframe-tabs').innerHTML = state.timeframes.map((frame) => {
    const active = frame.interval === state.activeInterval;
    const dualCount = (frame.items ?? []).filter((item) => isDualDirection(item, state.dualKeys)).length;
    return `<button type="button" role="tab" class="timeframe-tab${active ? ' active' : ''}" data-timeframe-tab="${frame.interval}" aria-selected="${active}" aria-controls="timeframe-panel-${frame.interval}">
      <span>${frame.label}</span><strong>${frame.stats?.matched ?? 0}</strong><small>${frame.stats?.confirmed ?? 0} xác nhận · ${dualCount} hai chiều</small>
    </button>`;
  }).join('');
  document.querySelectorAll('[data-timeframe-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeInterval = button.dataset.timeframeTab;
      renderZones();
    });
  });
  const activeFrames = state.timeframes.filter((frame) => frame.interval === state.activeInterval);
  $('timeframe-zones').innerHTML = activeFrames.map((frame) => {
    const filteredItems = (frame.items ?? []).filter((item) => (
      (!query || item.symbol.includes(query))
      && (selectedStatus === 'ALL' || item.status === selectedStatus)
    ));
    const items = sortPostMoveRows(filteredItems, state.sort, sortValue);
    const config = frame.config ?? {};
    const dualCount = (frame.items ?? []).filter((item) => isDualDirection(item, state.dualKeys)).length;
    const visibleCount = items.length === Number(frame.stats?.matched ?? 0)
      ? `${items.length}`
      : `${items.length}/${frame.stats?.matched ?? 0}`;
    return `<section id="timeframe-panel-${frame.interval}" class="timeframe-zone" data-interval="${frame.interval}" role="tabpanel" aria-label="Khung ${frame.label}">
      <div class="zone-head">
        <div>
          <p class="eyebrow">VÙNG ${frame.label} · ${frame.source === 'KLINE_CACHE_15M' ? 'CACHE GỐC' : 'GỘP TỪ 15M'}</p>
          <h3>Case trên nến ${frame.interval}</h3>
          <p class="muted">Xả: body ≥${config.minDumpBodyPct}% hoặc rút low ≥${config.minDumpLowPct}% · volume ≥${config.minDumpVolumeRatio}× nền · hồi tối thiểu ${config.minRecoveryPct}%</p>
        </div>
        <div class="zone-counts">
          <span class="case-count">${visibleCount} case</span>
          <span class="confirm-count">${frame.stats?.confirmed ?? 0} xác nhận</span>
          <span class="building-count">${frame.stats?.building ?? 0} đang hồi</span>
          <span>${frame.stats?.weakened ?? 0} yếu lại</span>
          <span class="dual-count">${dualCount} hai chiều</span>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>${sortHeader('Coin', 'symbol', 'asc')}${sortHeader('Trạng thái', 'status')}${sortHeader('Giai đoạn', 'stage')}${sortHeader('Điểm', 'score')}${sortHeader('Giá socket / cache', 'live')}${sortHeader('Điểm vào đẹp', 'entry')}${sortHeader('Hồi biên xả', 'recovery')}${sortHeader('Từ close xả', 'fromClose')}${sortHeader('Nến xả', 'candle')}${sortHeader('Vol nến xả', 'volume')}${sortHeader('Nến dòng tiền', 'flowAt')}${sortHeader('Mốc xác nhận', 'confirmation')}${sortHeader('Vô hiệu', 'invalidation')}${sortHeader('Thời gian xả', 'anchorAt')}</tr></thead>
        <tbody>${renderItemRows(items)}</tbody>
      </table></div>
    </section>`;
  }).join('') || '<div class="empty">Chưa có dữ liệu ba khung.</div>';
  document.querySelectorAll('[data-post-move-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      state.sort = nextPostMoveSort(state.sort, button.dataset.postMoveSort, button.dataset.defaultDirection);
      renderZones();
    });
  });
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  $('refresh').disabled = true;
  try {
    const [response, oppositePayload] = await Promise.all([
      fetch('/api/post-dump-volume-recovery', { cache: 'no-store' }),
      fetchOptionalSnapshot('/api/post-pump-volume-fade'),
    ]);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    state.dualKeys = buildDualDirectionKeys(payload, oppositePayload);
    state.timeframes = Array.isArray(payload.timeframes) ? payload.timeframes : [];
    $('total-cases').textContent = payload.summary?.totalCases ?? 0;
    $('unique-coins').textContent = payload.summary?.uniqueSymbols ?? 0;
    $('confirmed').textContent = payload.summary?.confirmed ?? 0;
    $('coverage').innerHTML = state.timeframes.map((frame) => {
      const ready = Math.max(0, Number(frame.stats?.scanned ?? 0) - Number(frame.stats?.excluded?.insufficientBars ?? 0));
      return `${frame.interval}: ${ready}/${frame.stats?.scanned ?? 0}`;
    }).join('<br>');
    $('updated').textContent = `Cập nhật ${formatTime(payload.generatedAt)} (VN) · ${payload.version} · xử lý ${payload.stats?.elapsedMs ?? 0}ms`;
    $('excluded').textContent = state.timeframes.map((frame) => (
      `${frame.interval}: thiếu cache ${frame.stats?.excluded?.insufficientBars ?? 0}, không đạt/không còn hồi ${frame.stats?.excluded?.noActiveRecovery ?? 0}`
    )).join(' · ') + '. Tự làm mới mỗi 15 giây.';
    renderZones();
    livePriceSocket.setSymbols([...new Set(state.timeframes.flatMap((frame) => (
      (frame.items ?? []).map((item) => item.symbol)
    )))].slice(0, 500));
  } catch (error) {
    $('updated').textContent = `Không tải được scanner: ${error.message}`;
    $('timeframe-zones').innerHTML = `<div class="empty">${error.message}</div>`;
  } finally {
    state.loading = false;
    $('refresh').disabled = false;
  }
}

$('search').addEventListener('input', renderZones);
$('status').addEventListener('change', renderZones);
$('refresh').addEventListener('click', load);
load();
setInterval(() => { if (!document.hidden) void load(); }, 15_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void load(); });
window.addEventListener('beforeunload', () => livePriceSocket.disconnect('page unload'));
