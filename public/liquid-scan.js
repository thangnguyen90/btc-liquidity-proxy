const els = {
  searchInput: document.getElementById('searchInput'),
  searchClear: document.getElementById('searchClear'),
  intervalInput: document.getElementById('intervalInput'),
  limitInput: document.getElementById('limitInput'),
  sideFilter: document.getElementById('sideFilter'),
  probFilter: document.getElementById('probFilter'),
  sortInput: document.getElementById('sortInput'),
  marginInput: document.getElementById('marginInput'),
  leverageInput: document.getElementById('leverageInput'),
  autoPaperEnabledInput: document.getElementById('autoPaperEnabledInput'),
  autoPaperPointInput: document.getElementById('autoPaperPointInput'),
  autoPaperMinDistInput: document.getElementById('autoPaperMinDistInput'),
  autoPaperButton: document.getElementById('autoPaperButton'),
  refreshButton: document.getElementById('refreshButton'),
  scanStatus: document.getElementById('scanStatus'),
  visibleCount: document.getElementById('visibleCount'),
  processedMetric: document.getElementById('processedMetric'),
  timeMetric: document.getElementById('timeMetric'),
  highProbMetric: document.getElementById('highProbMetric'),
  aboveMetric: document.getElementById('aboveMetric'),
  belowMetric: document.getElementById('belowMetric'),
  scanBody: document.getElementById('scanBody'),
  openPaperBody: document.getElementById('openPaperBody'),
  closedPaperBody: document.getElementById('closedPaperBody'),
  closedPaperCount: document.getElementById('closedPaperCount'),
  liquidPaperStats: document.getElementById('liquidPaperStats'),
  liquidPaperLiveStatus: document.getElementById('liquidPaperLiveStatus'),
  actionResult: document.getElementById('actionResult'),
};

let scanData = null;
let renderedRows = [];
let paperTrades = [];
let autoPaperRunning = false;
let liquidPaperStream = null;
const paperSort = { key: 'opened', dir: 'desc' };
const scanSort = { key: 'sweepProb', dir: 'desc' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

function fmtPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toFixed(4).replace(/\.?0+$/, '');
  if (Math.abs(n) >= 0.01) return n.toFixed(5).replace(/\.?0+$/, '');
  return n.toFixed(8).replace(/\.?0+$/, '');
}

function fmtPct(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function fmt(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function fmtTime(value) {
  return value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
}

function updateLiveStatus(data, source = 'sse') {
  if (!els.liquidPaperLiveStatus) return;
  const trades = data?.trades ?? [];
  const latestMarkAt = Math.max(0, ...trades.map((t) => Number(t.markUpdatedAt ?? 0)).filter(Number.isFinite));
  const markAge = latestMarkAt > 0 ? Math.max(0, Math.round((Date.now() - latestMarkAt) / 1000)) : null;
  const markSource = trades.find((t) => t.markSource)?.markSource ?? source;
  els.liquidPaperLiveStatus.textContent = markAge == null
    ? `Live: ${source}`
    : `Live: ${markSource}, tick ${markAge}s ago`;
}

function distanceToEntry(trade) {
  const mark = Number(trade.markPrice);
  const entry = Number(trade.entryPrice);
  if (!Number.isFinite(mark) || !Number.isFinite(entry) || entry <= 0) return null;
  return trade.side === 'LONG'
    ? ((mark - entry) / entry) * 100
    : ((entry - mark) / entry) * 100;
}

function liquidPaperSortValue(trade, key) {
  if (key === 'symbol') return trade.symbol ?? '';
  if (key === 'side') return trade.side ?? '';
  if (key === 'status') return trade.status ?? '';
  if (key === 'entry') return Number(trade.entryPrice ?? 0);
  if (key === 'mark') return Number(trade.markPrice ?? 0);
  if (key === 'toEntry') return distanceToEntry(trade) ?? Number.POSITIVE_INFINITY;
  if (key === 'sweepDistance') return Number(trade.sweepDistancePct ?? trade.entryPlan?.targetDistancePct ?? 0);
  if (key === 'feasibleLeverage') return Number(trade.feasibleLeverage ?? trade.entryPlan?.feasibleLeverage ?? 0);
  if (key === 'margin') return Number(trade.marginUsdt ?? 0);
  if (key === 'pnl') return Number(trade.pnl ?? 0);
  if (key === 'roe') return Number(trade.roe ?? 0);
  if (key === 'signalRoe') return Number(trade.signalRoe ?? -999);
  if (key === 'hunt') return Number(trade.huntScore ?? trade.huntSignal?.score ?? 0);
  if (key === 'note') return trade.note ?? '';
  return Date.parse(trade.openedAt ?? trade.entryReadyAt ?? trade.createdAt ?? 0) || 0;
}

function sortLiquidPaperRows(rows) {
  const dir = paperSort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = liquidPaperSortValue(a, paperSort.key);
    const bv = liquidPaperSortValue(b, paperSort.key);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });
}

function liquidPaperRowClass(trade) {
  if (trade.signalType !== 'LIQUID_KILL_ZONE') return '';
  return trade.side === 'LONG' ? 'liquid-paper-kill-long' : 'liquid-paper-kill-short';
}

function updateLiquidPaperSortHeaders() {
  document.querySelectorAll('[data-paper-sort]').forEach((th) => {
    const active = th.dataset.paperSort === paperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (paperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

function updateScanSortHeaders() {
  document.querySelectorAll('[data-scan-sort]').forEach((th) => {
    const active = th.dataset.scanSort === scanSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (scanSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

function fmtNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

function probClass(prob) {
  if (prob >= 80) return 'confidence-high';
  if (prob >= 55) return 'confidence-medium';
  return 'confidence-low';
}

function zoneText(zones) {
  return (zones ?? []).slice(0, 3).map((z) => {
    const dist = Number(z.distancePct);
    return `${fmtPrice(z.price)} (${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%)`;
  }).join('<br>');
}

function killZoneCell(cluster) {
  const main = cluster?.mainKillZone;
  const far = cluster?.farKillZone;
  if (!main && !far) return '-';
  const dir = cluster.direction === 'above' ? 'trên' : 'dưới';
  const active = main ?? far;
  const lowDist = Number(active.distancePctLow ?? 0);
  const highDist = Number(active.distancePctHigh ?? 0);
  const near = cluster.nearSweep
    ? `<small>near ${fmtPrice(cluster.nearSweep.low)} - ${fmtPrice(cluster.nearSweep.high)}</small>`
    : '';
  const exhaustion = cluster.exhaustionZone
    ? `<small>exhaust ${fmtPrice(cluster.exhaustionZone.low)} - ${fmtPrice(cluster.exhaustionZone.high)}</small>`
    : '';
  const farLine = far
    ? `<small>far ${fmtPrice(far.low)} - ${fmtPrice(far.high)}</small>`
    : '';
  const farPeaks = far?.peaks?.length
    ? `<small>peaks ${far.peaks.slice(0, 3).map((z) => fmtPrice(z.price)).join(' / ')}</small>`
    : '';
  const warn = cluster.isOneSided || (!main && far) ? '<small class="near-target">kill zone</small>' : '';
  return `
    <strong>${fmtPrice(active.low)} - ${fmtPrice(active.high)}</strong>
    <small>${dir} ${lowDist >= 0 ? '+' : ''}${lowDist.toFixed(2)}% → ${highDist >= 0 ? '+' : ''}${highDist.toFixed(2)}%</small>
    ${near}
    ${exhaustion}
    ${farLine}
    ${farPeaks}
    ${warn}
  `;
}

function meaning(row) {
  if (row.killZoneCluster?.isOneSided) {
    const side = row.heavySide === 'above' ? 'trên' : 'dưới';
    return `Thanh khoản ${side} một chiều: target gần có thể chỉ là quét lần 1, ưu tiên nhìn main kill zone để tránh thoát/short quá sớm.`;
  }
  if (row.killZoneCluster?.farKillZone) {
    const side = row.killZoneCluster.farKillZone.direction === 'above' ? 'trên' : 'dưới';
    return `Có far kill zone phía ${side}: nếu momentum expansion tiếp diễn, giá có thể bỏ qua target gần và chạy tới vùng xa.`;
  }
  if (row.heavySide === 'above') {
    return `Trên dày hơn: ưu tiên LONG theo lực hút lên vùng thanh khoản, target là cụm phía trên.`;
  }
  return `Dưới dày hơn: ưu tiên SHORT theo lực kéo xuống vùng thanh khoản, target là cụm phía dưới.`;
}

function isKillZoneRow(row) {
  const cluster = row.killZoneCluster;
  return Boolean(cluster?.mainKillZone || cluster?.farKillZone || cluster?.isOneSided);
}

function liquidSignalType(row) {
  return isKillZoneRow(row) ? 'LIQUID_KILL_ZONE' : 'LIQUID_SCAN';
}

function killZoneDistancePct(row) {
  const zone = row.killZoneCluster?.farKillZone
    ?? row.killZoneCluster?.mainKillZone
    ?? row.killZoneCluster?.exhaustionZone
    ?? null;
  if (!zone) return null;
  const a = Math.abs(Number(zone.distancePctLow ?? 0));
  const b = Math.abs(Number(zone.distancePctHigh ?? 0));
  return Math.max(a, b);
}

function entryCell(plan) {
  if (!plan) return '-';
  const distance = Number(plan.targetDistancePct ?? plan.entryDistancePct ?? 0);
  const tp = plan.takeProfitPrice ? `<small>TP tham khảo ${fmtPrice(plan.takeProfitPrice)}</small>` : '';
  const sl = plan.stopLossPrice ? `<small>SL tham khảo ${fmtPrice(plan.stopLossPrice)}</small>` : '';
  return `
    <strong>${fmtPrice(plan.entryPrice)}</strong>
    <small>limit pullback ${Number(plan.entryDistancePct ?? 0) >= 0 ? '+' : ''}${Number(plan.entryDistancePct ?? 0).toFixed(2)}%</small>
    <small>target ${distance >= 0 ? '+' : ''}${distance.toFixed(2)}%</small>
    ${tp}
    ${sl}
  `;
}

function sweepCell(plan) {
  if (!plan) return '-';
  const side = plan.sweepDirection === 'UP' ? 'LONG' : 'SHORT';
  const cls = side === 'LONG' ? 'liquid-long' : 'liquid-short';
  const text = plan.sweepDirection === 'UP' ? 'hút lên target' : 'kéo xuống target';
  return `
    <span class="liq-side ${cls}">${side}</span>
    <small>${text}</small>
  `;
}

function setupCell(plan) {
  if (!plan) return '-';
  const cls = plan.side === 'LONG' ? 'liquid-long' : 'liquid-short';
  const sweep = plan.sweepDirection === 'UP' ? 'hút lên target' : 'kéo xuống target';
  return `
    <span class="liq-side ${cls}">${plan.side}</span>
    <small>theo hướng ${sweep}</small>
    <small>chờ pullback khớp</small>
  `;
}

function huntCell(signal) {
  if (!signal) return '<span class="muted">-</span>';
  const isUp = signal.side === 'UP';
  const cls = isUp ? 'liquid-long' : 'liquid-short';
  const label = isUp ? 'RUNUP HUNT' : 'DUMP HUNT';
  const dist = Number(signal.targetDistancePct ?? 0);
  const rsi = Number(signal.rsi ?? NaN);
  const volX = Number(signal.volX ?? 0);
  const move = isUp ? Number(signal.runupPct ?? 0) : Number(signal.drawdownPct ?? 0);
  return `
    <span class="liq-side ${cls}">${label} ${signal.score}</span>
    <small>${isUp ? 'hut len cum short liq' : 'hut xuong cum long liq'}</small>
    <small>dist ${dist >= 0 ? '+' : ''}${dist.toFixed(2)}% - move ${move.toFixed(1)}%</small>
    <small>RSI ${Number.isFinite(rsi) ? rsi.toFixed(0) : '-'} - vol ${volX.toFixed(1)}x</small>
  `;
}

function huntTradeCell(trade) {
  const signal = trade.huntSignal ?? (trade.huntType ? { type: trade.huntType, score: trade.huntScore } : null);
  if (!signal?.type) return '<span class="muted">-</span>';
  const isUp = String(signal.type).includes('RUNUP');
  const cls = isUp ? 'liquid-long' : 'liquid-short';
  const label = isUp ? 'RUNUP' : 'DUMP';
  const score = Number(signal.score ?? 0);
  const dist = Number(signal.targetDistancePct ?? 0);
  const rsi = Number(signal.rsi ?? NaN);
  return `
    <span class="liq-side ${cls}">${label} ${Number.isFinite(score) ? score.toFixed(0) : '-'}</span>
    <small>${Number.isFinite(dist) && dist !== 0 ? `dist ${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%` : escapeHtml(signal.type)}</small>
    <small>${Number.isFinite(rsi) ? `RSI ${rsi.toFixed(0)}` : ''}</small>
  `;
}

function showActionResult(value) {
  els.actionResult.style.display = 'block';
  els.actionResult.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function getOrdersToken() {
  return localStorage.getItem('orders_token') ?? null;
}

async function api(url, opts = {}) {
  const token = getOrdersToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-orders-token': token } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function isSamePlannedTrade(trade, row) {
  const plan = row.entryPlan;
  if (!plan) return false;
  if (trade.symbol !== row.symbol) return false;
  if (trade.side !== plan.side) return false;
  if (!String(trade.source ?? '').startsWith('liquid-scan')) return false;
  if (trade.status === 'CLOSED') return false;
  const openedAt = Date.parse(trade.openedAt ?? trade.createdAt ?? 0) || 0;
  return Date.now() - openedAt < 4 * 60 * 60 * 1000;
}

function huntNote(signal) {
  if (!signal) return null;
  const score = Number(signal.score ?? 0);
  const dist = Number(signal.targetDistancePct ?? 0);
  const rsi = Number(signal.rsi ?? NaN);
  const volX = Number(signal.volX ?? 0);
  return [
    `hunt=${signal.type}`,
    `huntScore=${score}`,
    `huntDist=${dist.toFixed(2)}%`,
    Number.isFinite(rsi) ? `huntRSI=${rsi.toFixed(0)}` : null,
    `huntVol=${volX.toFixed(1)}x`,
  ].filter(Boolean).join(' ');
}

function actionCell(row, idx) {
  if (!row.entryPlan?.entryPrice || !row.entryPlan?.side) return '-';
  return `
    <div class="liquid-actions">
      <button type="button" class="liquid-action-btn paper" data-action="paper" data-row="${idx}">Paper</button>
      <button type="button" class="liquid-action-btn binance" data-action="binance" data-row="${idx}">Binance</button>
    </div>
    <small>${row.entryPlan.side} LIMIT pullback</small>
  `;
}

async function loadScan() {
  const interval = els.intervalInput.value;
  const limit = els.limitInput.value;
  const url = `/api/liquid-scan?interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`;
  els.refreshButton.disabled = true;
  els.scanStatus.textContent = 'Scanning...';
  els.scanBody.innerHTML = '<tr><td colspan="17" class="table-empty">Đang scan liquidation top symbol...</td></tr>';

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    scanData = await res.json();
    els.scanStatus.textContent = `${scanData.processed}/${scanData.requested} symbols · ${new Date(scanData.scannedAt).toLocaleTimeString('vi-VN')}`;
    render();
    await loadAutoPaperTrades();
    await autoCreatePaperTests({ silent: true });
  } catch (err) {
    els.scanStatus.textContent = 'Scan failed';
    els.scanBody.innerHTML = `<tr><td colspan="17" class="table-empty">Lỗi scan: ${escapeHtml(err.message)}</td></tr>`;
  } finally {
    els.refreshButton.disabled = false;
  }
}

function filteredRows() {
  const search = els.searchInput.value.trim().toUpperCase();
  const side = els.sideFilter.value;
  const minProb = Number(els.probFilter.value);
  const sort = scanSort.key || els.sortInput.value;
  let rows = [...(scanData?.rows ?? [])];

  if (search) rows = rows.filter((row) => row.symbol.includes(search));
  if (side !== 'all') rows = rows.filter((row) => row.heavySide === side);
  if (minProb > 0) rows = rows.filter((row) => row.sweepProb >= minProb);

  rows.sort((a, b) => {
    let av;
    let bv;
    if (sort === 'bias') {
      av = Math.abs(a.bias);
      bv = Math.abs(b.bias);
    } else if (sort === 'hunt') {
      av = Number(a.huntSignal?.score ?? 0);
      bv = Number(b.huntSignal?.score ?? 0);
    } else if (sort === 'heavyPct') {
      av = Number(a.heavyPct ?? 0);
      bv = Number(b.heavyPct ?? 0);
    } else if (sort === 'distance') {
      av = -Math.abs(a.sweepTarget?.distancePct ?? 999);
      bv = -Math.abs(b.sweepTarget?.distancePct ?? 999);
    } else if (sort === 'quoteVolume') {
      av = Number(a.quoteVolume ?? 0);
      bv = Number(b.quoteVolume ?? 0);
    } else {
      av = Number(a.sweepProb ?? 0);
      bv = Number(b.sweepProb ?? 0);
    }
    const dir = scanSort.dir === 'asc' ? 1 : -1;
    return (av - bv) * dir;
  });

  return rows;
}

function renderMetrics(rows) {
  const all = scanData?.rows ?? [];
  els.visibleCount.textContent = rows.length;
  els.processedMetric.textContent = scanData ? String(scanData.processed) : '-';
  els.timeMetric.textContent = scanData ? `${scanData.interval} · ${new Date(scanData.scannedAt).toLocaleString('vi-VN')}` : '-';
  els.highProbMetric.textContent = String(all.filter((r) => r.sweepProb >= 80).length);
  els.aboveMetric.textContent = String(all.filter((r) => r.heavySide === 'above').length);
  els.belowMetric.textContent = String(all.filter((r) => r.heavySide === 'below').length);
}

function render() {
  const rows = filteredRows();
  renderedRows = rows;
  renderMetrics(rows);
  updateScanSortHeaders();

  if (!scanData) {
    els.scanBody.innerHTML = '<tr><td colspan="17" class="table-empty">Bấm Scan để tải dữ liệu.</td></tr>';
    return;
  }
  if (rows.length === 0) {
    els.scanBody.innerHTML = '<tr><td colspan="17" class="table-empty">Không có symbol phù hợp filter.</td></tr>';
    return;
  }

  els.scanBody.innerHTML = rows.map((row, idx) => {
    const sideClass = row.heavySide === 'above' ? 'liquid-above' : 'liquid-below';
    const sideText = row.heavySide === 'above' ? 'TRÊN DÀY' : 'DƯỚI DÀY';
    const target = row.sweepTarget
      ? `${fmtPrice(row.sweepTarget.price)} <small>${fmtPct(row.sweepTarget.distancePct)}</small>`
      : '-';
    const nearBadge = row.isNearTarget ? '<small class="near-target">Đang sát target</small>' : '';
    const detailUrl = `/?symbol=${encodeURIComponent(row.symbol)}&interval=${encodeURIComponent(scanData.interval)}`;
    const glassUrl = `https://www.coinglass.com/pro/futures/LiquidationHeatMapNew?coin=${encodeURIComponent(row.symbol.replace(/USDT$/, ''))}`;

    return `
      <tr>
        <td>
          <a class="symbol-link" href="${detailUrl}">${escapeHtml(row.symbol)}</a>
          <small><a class="muted-link" href="${glassUrl}" target="_blank" rel="noopener">CoinGlass</a></small>
        </td>
        <td>${fmtPrice(row.markPrice)}</td>
        <td class="${row.change24hPct >= 0 ? 'positive' : 'negative'}">${fmtPct(row.change24hPct)}</td>
        <td><span class="liq-side ${sideClass}">${sideText}</span><small>${row.heavyPct.toFixed(1)}%</small></td>
        <td><span class="confidence-pill ${probClass(row.sweepProb)}">${row.sweepProb}%</span><small>${escapeHtml(row.sweepLabel)}</small></td>
        <td>${huntCell(row.huntSignal)}</td>
        <td>${target}${nearBadge}</td>
        <td>${killZoneCell(row.killZoneCluster)}</td>
        <td>${sweepCell(row.entryPlan)}</td>
        <td>${entryCell(row.entryPlan)}</td>
        <td>${setupCell(row.entryPlan)}</td>
        <td>${fmtNum(row.liquidityAbove)}</td>
        <td>${fmtNum(row.liquidityBelow)}</td>
        <td class="${row.bias >= 0 ? 'positive' : 'negative'}">${row.bias >= 0 ? '+' : ''}${row.bias.toFixed(3)}</td>
        <td>${zoneText(row.strongestAbove)}</td>
        <td>${zoneText(row.strongestBelow)}</td>
        <td>${escapeHtml(meaning(row))}</td>
        <td>${actionCell(row, idx)}</td>
      </tr>
    `;
  }).join('');
}

async function createPaperFromRow(row, button) {
  const plan = row.entryPlan;
  const marginUsdt = Number(els.marginInput.value || 1);
  const leverage = Number(els.leverageInput.value || 10);
  if (!plan?.entryPrice || !plan?.side) throw new Error('Entry plan missing.');
  button.disabled = true;
  const payload = {
    symbol: row.symbol,
    side: plan.side,
    marginUsdt,
    leverage,
    entryPrice: plan.entryPrice,
    status: 'PENDING',
    source: 'liquid-scan',
    note: [
      `sweepProb=${row.sweepProb}%`,
      `type=${liquidSignalType(row)}`,
      huntNote(row.huntSignal),
      `heavySide=${row.heavySide}`,
      `target=${row.sweepTarget?.price ?? '-'}`,
      `killZone=${row.killZoneCluster?.mainKillZone ? `${row.killZoneCluster.mainKillZone.low}-${row.killZoneCluster.mainKillZone.high}` : '-'}`,
      `farKill=${row.killZoneCluster?.farKillZone ? `${row.killZoneCluster.farKillZone.low}-${row.killZoneCluster.farKillZone.high}` : '-'}`,
      `tp=${plan.takeProfitPrice ?? '-'}`,
      `sl=${plan.stopLossPrice ?? '-'}`,
    ].join(' | '),
    takeProfitPrice: plan.takeProfitPrice,
    stopLossPrice: plan.stopLossPrice,
    signalType: liquidSignalType(row),
    signalPoint: row.sweepProb,
    signalMarkPrice: row.markPrice,
    sweepTargetPrice: row.sweepTarget?.price ?? null,
    sweepDistancePct: plan.targetDistancePct,
    feasibleLeverage: plan.feasibleLeverage,
    feasibilityScore: plan.feasibilityScore,
    rewardPct: plan.rewardPct,
    riskPct: plan.riskPct,
    rr: plan.rr,
    heavySide: row.heavySide,
    huntSignal: row.huntSignal ?? null,
    entryPlan: plan,
  };
  const data = await api('/api/liquid-paper-trades', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  showActionResult(data);
  await loadAutoPaperTrades();
}

async function placeBinanceFromRow(row, button) {
  const plan = row.entryPlan;
  const marginUsdt = Number(els.marginInput.value || 1);
  const leverage = Number(els.leverageInput.value || 10);
  if (!plan?.entryPrice || !plan?.side) throw new Error('Entry plan missing.');
  const binanceSide = plan.side === 'LONG' ? 'BUY' : 'SELL';
  const ok = confirm(`Đặt lệnh thật Binance LIMIT ${plan.side} ${row.symbol}\nMargin $${marginUsdt}, lev ${leverage}x\nEntry ${fmtPrice(plan.entryPrice)}\nTP ${fmtPrice(plan.takeProfitPrice)} | SL ${fmtPrice(plan.stopLossPrice)}?`);
  if (!ok) return;
  button.disabled = true;
  const payload = {
    symbol: row.symbol,
    side: binanceSide,
    orderType: 'LIMIT',
    notionalUsdt: marginUsdt * leverage,
    leverage,
    limitPrice: plan.entryPrice,
    takeProfitPrice: plan.takeProfitPrice,
    stopLossPrice: plan.stopLossPrice,
    dryRun: false,
  };
  const data = await api('/api/order', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  showActionResult(data);
}

async function autoCreatePaperTests({ silent = false } = {}) {
  if (autoPaperRunning) return;
  if (silent && !els.autoPaperEnabledInput.checked) return;
  const minPoint = Number(els.autoPaperPointInput.value || 75);
  const minDist = Number(els.autoPaperMinDistInput?.value ?? 2);
  const candidates = renderedRows.filter((row) => {
    const killZone = isKillZoneRow(row);
    if (!killZone && Number(row.sweepProb) <= minPoint) return false;
    if (!row.entryPlan?.entryPrice || !row.entryPlan?.side) return false;
    const dist = Math.max(
      Math.abs(Number(row.sweepTarget?.distancePct ?? row.entryPlan?.targetDistancePct ?? 0)),
      Number(killZoneDistancePct(row) ?? 0),
    );
    if (minDist > 0 && dist < minDist) return false;
    return true;
  });
  if (candidates.length === 0) {
    if (!silent) showActionResult(`Không có dòng visible nào có kill zone hoặc point > ${minPoint} và dist ≥ ${minDist}%.`);
    return;
  }

  await loadAutoPaperTrades();
  const marginUsdt = Number(els.marginInput.value || 1);
  const leverage = Number(els.leverageInput.value || 10);
  const toCreate = candidates.filter((row) => !paperTrades.some((trade) => isSamePlannedTrade(trade, row)));
  if (toCreate.length === 0) {
    if (!silent) showActionResult(`Tất cả tín hiệu point > ${minPoint} đã có paper test đang mở/chờ.`);
    return;
  }

  if (!silent) {
    const killCount = toCreate.filter(isKillZoneRow).length;
    const ok = confirm(`Tạo ${toCreate.length} paper trade PENDING cho Liquid Scan (${killCount} kill-zone)?`);
    if (!ok) return;
  }

  autoPaperRunning = true;
  els.autoPaperButton.disabled = true;
  try {
    const results = [];
    for (const row of toCreate) {
      const plan = row.entryPlan;
      try {
        const data = await api('/api/liquid-paper-trades', {
          method: 'POST',
          body: JSON.stringify({
            symbol: row.symbol,
            side: plan.side,
            marginUsdt,
            leverage,
            entryPrice: plan.entryPrice,
            status: 'PENDING',
            source: `liquid-scan-auto-${row.sweepProb}`,
            note: [
              `autoPaper point>${minPoint}`,
              `type=${liquidSignalType(row)}`,
              `sweepProb=${row.sweepProb}%`,
              huntNote(row.huntSignal),
              `heavySide=${row.heavySide}`,
              `target=${row.sweepTarget?.price ?? '-'}`,
              `killZone=${row.killZoneCluster?.mainKillZone ? `${row.killZoneCluster.mainKillZone.low}-${row.killZoneCluster.mainKillZone.high}` : '-'}`,
              `farKill=${row.killZoneCluster?.farKillZone ? `${row.killZoneCluster.farKillZone.low}-${row.killZoneCluster.farKillZone.high}` : '-'}`,
              `tp=${plan.takeProfitPrice ?? '-'}`,
              `sl=${plan.stopLossPrice ?? '-'}`,
            ].join(' | '),
            takeProfitPrice: plan.takeProfitPrice,
            stopLossPrice: plan.stopLossPrice,
            signalType: liquidSignalType(row),
            signalPoint: row.sweepProb,
            signalMarkPrice: row.markPrice,
            sweepTargetPrice: row.sweepTarget?.price ?? null,
            sweepDistancePct: plan.targetDistancePct,
            feasibleLeverage: plan.feasibleLeverage,
            feasibilityScore: plan.feasibilityScore,
            rewardPct: plan.rewardPct,
            riskPct: plan.riskPct,
            rr: plan.rr,
            heavySide: row.heavySide,
            huntSignal: row.huntSignal ?? null,
            entryPlan: plan,
          }),
        });
        results.push({ symbol: row.symbol, ok: true, id: data.trade?.id });
      } catch (err) {
        results.push({ symbol: row.symbol, ok: false, error: err.message });
      }
    }

    const summary = { mode: silent ? 'auto' : 'manual', minPoint, created: results.filter((r) => r.ok).length, skippedDuplicate: candidates.length - toCreate.length, results };
    showActionResult(summary);
    await loadAutoPaperTrades();
  } finally {
    els.autoPaperButton.disabled = false;
    autoPaperRunning = false;
  }
}

async function loadAutoPaperTrades() {
  try {
    const data = await api('/api/liquid-paper-trades');
    paperTrades = data.trades ?? [];
    updateLiveStatus(data, 'poll');
    renderAutoPaperTrades();
  } catch (err) {
    els.openPaperBody.innerHTML = `<tr><td colspan="15" class="table-empty">Lỗi tải paper: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function startLiquidPaperStream() {
  if (!window.EventSource || liquidPaperStream) return;
  liquidPaperStream = new EventSource('/api/liquid-paper-trades-stream');
  liquidPaperStream.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error) {
        els.openPaperBody.innerHTML = `<tr><td colspan="15" class="table-empty">Stream lỗi: ${escapeHtml(data.error)}</td></tr>`;
        return;
      }
      paperTrades = data.trades ?? [];
      updateLiveStatus(data, 'sse');
      renderAutoPaperTrades();
    } catch { /* ignore malformed SSE packet */ }
  };
  liquidPaperStream.onerror = () => {
    if (els.liquidPaperLiveStatus) els.liquidPaperLiveStatus.textContent = 'Live: reconnecting...';
    liquidPaperStream.close();
    liquidPaperStream = null;
    setTimeout(startLiquidPaperStream, 3000);
  };
}

function renderAutoPaperTrades() {
  const all = paperTrades.filter((t) => String(t.source ?? '').startsWith('liquid-scan'));
  updateLiquidPaperSortHeaders();

  const open = sortLiquidPaperRows(all.filter((t) => t.status !== 'CLOSED')).slice(0, 80);
  const closed = sortLiquidPaperRows(all.filter((t) => t.status === 'CLOSED')).slice(0, 200);

  // ── Stats bar ──
  const realizedPnl = closed.reduce((s, t) => s + Number(t.pnl ?? 0), 0);
  const unrealizedPnl = open.filter((t) => t.status === 'OPEN').reduce((s, t) => s + Number(t.pnl ?? 0), 0);
  const wins = closed.filter((t) => Number(t.pnl ?? 0) > 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length * 100) : null;
  const statsEl = els.liquidPaperStats;
  if (statsEl) {
    statsEl.style.display = all.length ? 'flex' : 'none';
    statsEl.innerHTML = `
      <div class="lp-stat"><span>Open</span><strong>${open.filter((t) => t.status === 'OPEN').length}</strong></div>
      <div class="lp-stat"><span>Pending</span><strong>${open.filter((t) => t.status === 'PENDING').length}</strong></div>
      <div class="lp-divider"></div>
      <div class="lp-stat"><span>Closed</span><strong>${closed.length}</strong></div>
      <div class="lp-stat"><span>Win Rate</span><strong class="${winRate != null && winRate >= 50 ? 'positive' : 'negative'}">${winRate != null ? `${winRate.toFixed(0)}%` : '-'} <small style="font-size:11px;font-weight:400">(${wins}/${closed.length})</small></strong></div>
      <div class="lp-divider"></div>
      <div class="lp-stat"><span>Realized PnL</span><strong class="${realizedPnl > 0 ? 'positive' : realizedPnl < 0 ? 'negative' : ''}">${realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(4)} USDT</strong></div>
      <div class="lp-stat"><span>Unrealized</span><strong class="${unrealizedPnl > 0 ? 'positive' : unrealizedPnl < 0 ? 'negative' : ''}">${unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(4)} USDT</strong></div>
    `;
  }

  // ── Open / Pending table ──
  if (open.length === 0) {
    els.openPaperBody.innerHTML = '<tr><td colspan="15" class="table-empty">Không có trade đang mở.</td></tr>';
  } else {
    els.openPaperBody.innerHTML = open.map((trade) => {
      const pnl = Number(trade.pnl ?? 0);
      const roe = Number(trade.roe ?? 0);
      const signalPnl = Number(trade.signalPnl ?? 0);
      const signalRoe = Number(trade.signalRoe ?? 0);
      const sweepDistance = Number(trade.sweepDistancePct ?? trade.entryPlan?.targetDistancePct ?? 0);
      const feasibleLev = Number(trade.feasibleLeverage ?? trade.entryPlan?.feasibleLeverage ?? 0);
      const feasibility = Number(trade.feasibilityScore ?? trade.entryPlan?.feasibilityScore ?? 0);
      const rr = Number(trade.rr ?? trade.entryPlan?.rr ?? 0);
      const toEntry = distanceToEntry(trade);
      const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : '';
      const signalClass = signalPnl > 0 ? 'positive' : signalPnl < 0 ? 'negative' : '';
      const entryClass = toEntry == null ? '' : toEntry <= 0 ? 'positive' : 'negative';
      const statusCls = trade.status === 'OPEN' ? 'positive' : 'neutral';
      const rowClass = liquidPaperRowClass(trade);
      return `
        <tr class="${rowClass}">
          <td><a class="symbol-link" href="/?symbol=${encodeURIComponent(trade.symbol)}">${escapeHtml(trade.symbol)}</a></td>
          <td><span class="liq-side ${trade.side === 'LONG' ? 'liquid-long' : 'liquid-short'}">${escapeHtml(trade.side)}</span></td>
          <td class="${statusCls}">${escapeHtml(trade.status)}</td>
          <td>${fmtPrice(trade.entryPrice)}</td>
          <td>${fmtPrice(trade.markPrice)}</td>
          <td class="${entryClass}">${toEntry == null ? '-' : `${fmt(toEntry, 2)}%`}</td>
          <td class="${Math.abs(sweepDistance) >= 1 ? 'positive' : 'neutral'}">${fmt(Math.abs(sweepDistance), 2)}%</td>
          <td>${feasibleLev ? `${fmt(feasibleLev, 0)}x` : '-'}<small>score ${fmt(feasibility, 0)} · RR ${fmt(rr, 2)}</small></td>
          <td>${fmt(trade.marginUsdt, 2)} / ${fmt(trade.leverage, 0)}x</td>
          <td class="${pnlClass}">${fmt(pnl, 4)}</td>
          <td class="${pnlClass}">${fmt(roe, 2)}%</td>
          <td class="${signalClass}">${fmt(signalPnl, 4)}<small>${fmt(signalRoe, 2)}%</small></td>
          <td>${huntTradeCell(trade)}</td>
          <td>${escapeHtml(trade.note ?? '')}</td>
          <td>${fmtTime(trade.openedAt ?? trade.entryReadyAt ?? trade.createdAt)}</td>
        </tr>
      `;
    }).join('');
  }

  // ── Closed table ──
  if (els.closedPaperCount) els.closedPaperCount.textContent = `${closed.length} closed`;
  if (closed.length === 0) {
    els.closedPaperBody.innerHTML = '<tr><td colspan="12" class="table-empty">Chưa có closed trade.</td></tr>';
  } else {
    els.closedPaperBody.innerHTML = closed.map((trade) => {
      const pnl = Number(trade.pnl ?? 0);
      const roe = Number(trade.roe ?? 0);
      const signalPnl = Number(trade.signalPnl ?? 0);
      const signalRoe = Number(trade.signalRoe ?? 0);
      const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : '';
      const signalClass = signalPnl > 0 ? 'positive' : signalPnl < 0 ? 'negative' : '';
      const outcome = trade.outcome ?? (pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : '-');
      const outcomeCls = outcome === 'TP' || outcome === 'WIN' ? 'positive' : outcome === 'SL' || outcome === 'LOSS' ? 'negative' : '';
      const rowClass = liquidPaperRowClass(trade);
      return `
        <tr class="${rowClass}">
          <td><a class="symbol-link" href="/?symbol=${encodeURIComponent(trade.symbol)}">${escapeHtml(trade.symbol)}</a></td>
          <td><span class="liq-side ${trade.side === 'LONG' ? 'liquid-long' : 'liquid-short'}">${escapeHtml(trade.side)}</span></td>
          <td class="${outcomeCls}"><strong>${escapeHtml(outcome)}</strong></td>
          <td>${fmtPrice(trade.entryPrice)}</td>
          <td>${fmtPrice(trade.exitPrice ?? trade.markPrice)}</td>
          <td>${fmt(trade.marginUsdt, 2)} / ${fmt(trade.leverage, 0)}x</td>
          <td class="${pnlClass}">${fmt(pnl, 4)}</td>
          <td class="${pnlClass}">${fmt(roe, 2)}%</td>
          <td class="${signalClass}">${fmt(signalPnl, 4)}<small>${fmt(signalRoe, 2)}%</small></td>
          <td>${escapeHtml(trade.note ?? '')}</td>
          <td>${fmtTime(trade.openedAt ?? trade.createdAt)}</td>
          <td>${fmtTime(trade.closedAt)}</td>
        </tr>
      `;
    }).join('');
  }
}

els.scanBody.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action][data-row]');
  if (!button) return;
  const row = renderedRows[Number(button.dataset.row)];
  if (!row) return;
  try {
    if (button.dataset.action === 'paper') await createPaperFromRow(row, button);
    if (button.dataset.action === 'binance') await placeBinanceFromRow(row, button);
  } catch (err) {
    alert(`Error: ${err.message}`);
    showActionResult(`Error: ${err.message}`);
  } finally {
    button.disabled = false;
  }
});
els.autoPaperButton.addEventListener('click', autoCreatePaperTests);
document.querySelectorAll('[data-paper-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.paperSort;
    if (paperSort.key === key) {
      paperSort.dir = paperSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      paperSort.key = key;
      paperSort.dir = ['symbol', 'side', 'status', 'note'].includes(key) ? 'asc' : 'desc';
    }
    renderAutoPaperTrades();
  });
});

els.refreshButton.addEventListener('click', loadScan);
els.intervalInput.addEventListener('change', loadScan);
els.limitInput.addEventListener('change', loadScan);
els.searchInput.addEventListener('input', () => {
  els.searchClear.style.display = els.searchInput.value ? '' : 'none';
  render();
});
els.searchClear.addEventListener('click', () => {
  els.searchInput.value = '';
  els.searchClear.style.display = 'none';
  render();
});
els.sideFilter.addEventListener('change', render);
els.probFilter.addEventListener('change', render);
els.sortInput.addEventListener('change', () => {
  scanSort.key = els.sortInput.value;
  scanSort.dir = 'desc';
  render();
});
document.querySelectorAll('[data-scan-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.scanSort;
    if (scanSort.key === key) {
      scanSort.dir = scanSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      scanSort.key = key;
      scanSort.dir = 'desc';
    }
    els.sortInput.value = key;
    render();
  });
});

loadScan();
loadAutoPaperTrades();
startLiquidPaperStream();
