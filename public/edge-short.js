const SOURCES = [
  { id: 'pump',      label: 'Pump',       url: '/api/pump-signals',           stream: '/api/pump-stream' },
  { id: 'cap',       label: 'Cap',        url: '/api/cap-signals',            stream: '/api/cap-stream' },
  { id: 'killshort', label: 'Kill Short', url: '/api/killshort-signals',      stream: '/api/killshort-stream' },
  { id: 'ignition',  label: 'Ignition',   url: '/api/dump-ignition-signals',  stream: '/api/dump-ignition-stream' },
  { id: 'ppks',      label: 'Post Pump KS', url: '/api/post-pump-kill-short-signals', stream: '/api/post-pump-kill-short-stream' },
];

const state = {
  signalsBySource: { pump: [], cap: [], killshort: [], ignition: [], ppks: [] },
  rawSignals: [],
  rows: [],
  lastLoadedAt: null,
  errors: [],
  openStreams: 0, // how many SSE connections are currently open
};

let edgeOpenLimitSymbols = new Set();

const grid = document.getElementById('edgeGrid');
const statusEl = document.getElementById('edgeStatus');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const scoreFilter = document.getElementById('scoreFilter');
const sourceFilter = document.getElementById('sourceFilter');
const typeFilter = document.getElementById('typeFilter');
const sideFilter = document.getElementById('sideFilter');
const refreshButton = document.getElementById('refreshButton');
const autoRefreshInput = document.getElementById('autoRefreshInput');
const totalSignals = document.getElementById('totalSignals');
const rawSignals = document.getElementById('rawSignals');
const shortCount = document.getElementById('shortCount');
const avgEdge = document.getElementById('avgEdge');
const bestEdge = document.getElementById('bestEdge');
const lastScan = document.getElementById('lastScan');
const nextRefresh = document.getElementById('nextRefresh');
const scanMeta = document.getElementById('scanMeta');
const metaProcessed = document.getElementById('metaProcessed');
const visibleCount = document.getElementById('visibleCount');
const metaSources = document.getElementById('metaSources');
const edgePaperBody = document.getElementById('edgePaperBody');
const edgePaperCount = document.getElementById('edgePaperCount');
const edgePaperDayFilter = document.getElementById('edgePaperDayFilter');
const edgePaperPrev = document.getElementById('edgePaperPrev');
const edgePaperNext = document.getElementById('edgePaperNext');
const edgePaperPageLabel = document.getElementById('edgePaperPageLabel');
const edgePaperPageSizeSelect = document.getElementById('edgePaperPageSize');
const edgeComboStatsEl = document.getElementById('edgeComboStats');

let edgePaperTradesCache = [];
let edgePaperSummaryCache = null;
let edgePaperSort = { key: 'status', dir: 'asc' };
let edgePaperDay = 'all';
let edgePaperAvailableDays = [];
let edgePaperComboStats = [];
let edgePaperPage = 1;
let edgePaperPageSize = Number(edgePaperPageSizeSelect?.value || 300);
let edgePaperPagination = { page: 1, pageSize: 300, totalRows: 0, totalPages: 1 };

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  if (n >= 10000) return n.toLocaleString('en', { maximumFractionDigits: 1 });
  if (n >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 2 });
  if (n >= 100) return n.toFixed(3);
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(5);
  return n.toFixed(6);
}

function fmtPct(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function timeLabel(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '-';
  return new Date(n).toLocaleTimeString('vi');
}

function timeAgo(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const seconds = Math.max(0, Math.floor((Date.now() - n) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function gradeFromScore(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

function sideClassForAction(action) {
  const a = String(action ?? '').toUpperCase();
  if (a === 'LONG')  return 'long';
  if (a === 'SHORT') return 'short';
  return 'short'; // fallback
}

function normalizedType(sig) {
  return String(sig.type ?? '').toLowerCase();
}

function noteNumber(sig, pattern) {
  const m = String(sig.note ?? '').match(pattern);
  return m ? Number(m[1]) : null;
}

function earlyDumpMetrics(sig) {
  return {
    rangePct: noteNumber(sig, /range=([0-9.]+)%/i),
    bbwPct: noteNumber(sig, /BBW=([0-9.]+)%/i),
    atrPct: noteNumber(sig, /ATR%=([0-9.]+)%/i),
    chasePct: noteNumber(sig, /chase=([0-9.]+)%TP/i),
  };
}

function isEarlyDump(sig) {
  return String(sig.note ?? '').startsWith('EARLY_DUMP');
}

function isPrimeEarlyDump(sig) {
  if (!isEarlyDump(sig)) return false;
  const m = earlyDumpMetrics(sig);
  return Number(m.chasePct) >= 25 &&
    Number(m.rangePct) < 2 &&
    Number(m.atrPct) < 1;
}

function isStrongEarlyDump(sig) {
  const m = earlyDumpMetrics(sig);
  return isPrimeEarlyDump(sig) && Number(m.bbwPct) >= 2;
}

function signalHourVn(sig) {
  const ts = Number(sig.scannedAt);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    hour12: false,
  }).format(new Date(ts));
  return Number(hour);
}

function isGoodEarlyDumpHour(sig) {
  const hour = signalHourVn(sig);
  return hour != null && ((hour >= 1 && hour <= 4) || (hour >= 19 && hour <= 22));
}

function earlyDumpHourNote(sig) {
  const hour = signalHourVn(sig);
  const stable = 'Giờ ổn: 01-04, 19-22 VN';
  if (hour == null) return stable;
  return isGoodEarlyDumpHour(sig)
    ? `Giờ tốt ${String(hour).padStart(2, '0')}:00 VN`
    : stable;
}

function sourceLabel(source) {
  return SOURCES.find((s) => s.id === source)?.label ?? source;
}

function isShortType(type) {
  return /liq_top|bc_utad|utad|upthrust|pump_climax|climax_top|blowoff|top|short|fade|reject|rejection/.test(type);
}

function isLongWatch(sig, type) {
  if (sig.blockShort === true) return true;
  return /kill_short|spring|liq_flush|capitulation|sweep/.test(type);
}

function classifySignal(sig) {
  const action = String(sig.action ?? '').toUpperCase();
  const type = normalizedType(sig);

  if (action === 'SHORT' || isShortType(type) || sig.blockLong === true) return 'short';
  if (action === 'LONG' && isLongWatch(sig, type)) return 'watch';
  if (action === 'LONG') return 'long';
  return 'watch';
}

function calculateEdgeScore(sig) {
  const score = Number(sig.score);
  const base = Number.isFinite(score) ? score : 0;
  const type = normalizedType(sig);
  const bucket = classifySignal(sig);
  let edge = base;

  if (bucket === 'short') edge += 22;
  if (bucket === 'watch') edge -= 6;
  if (bucket === 'long') edge -= 22;

  if (/liq_top|liquidation_top/.test(type)) edge += 14;
  if (/bc_utad|utad|upthrust/.test(type)) edge += 12;
  if (/pump_climax|climax_top|blowoff/.test(type)) edge += 10;
  if (/top|fade|reject|rejection/.test(type)) edge += 8;
  if (/kill_short|spring|liq_flush/.test(type)) edge -= 10;

  if (sig.blockLong === true) edge += 6;
  if (sig.blockShort === true) edge -= 8;

  const change24h = Number(sig.change24h);
  if (Number.isFinite(change24h)) {
    if (bucket === 'short' && change24h >= 10) edge += 5;
    if (bucket === 'short' && change24h <= -8) edge -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(edge)));
}

function enrichSignal(sig, source, sourceScannedAt) {
  const edgeBucket = classifySignal(sig);
  const edgeScore = calculateEdgeScore(sig);
  const scannedAt = Number(sig.scannedAt ?? sourceScannedAt ?? Date.now());
  return {
    ...sig,
    source,
    sourceLabel: sourceLabel(source),
    edgeBucket,
    edgeScore,
    edgeGrade: gradeFromScore(edgeScore),
    scannedAt,
  };
}

function dedupeBySymbol(signals) {
  const bySymbol = new Map();

  for (const sig of signals) {
    if (!sig.symbol) continue;
    const current = bySymbol.get(sig.symbol);
    if (!current) {
      bySymbol.set(sig.symbol, sig);
      continue;
    }

    const better =
      sig.edgeScore > current.edgeScore ||
      (sig.edgeScore === current.edgeScore && Number(sig.score ?? 0) > Number(current.score ?? 0)) ||
      (sig.edgeScore === current.edgeScore && Number(sig.score ?? 0) === Number(current.score ?? 0) && sig.scannedAt > current.scannedAt);

    if (better) bySymbol.set(sig.symbol, sig);
  }

  return [...bySymbol.values()].sort((a, b) =>
    b.edgeScore - a.edgeScore ||
    Number(b.score ?? 0) - Number(a.score ?? 0) ||
    b.scannedAt - a.scannedAt
  );
}

// Merge signals from all sources and re-render
function rebuildSignals() {
  const all = Object.values(state.signalsBySource).flat();
  state.rawSignals = all;
  state.rows = dedupeBySymbol(all);
  state.lastLoadedAt = Date.now();
  const processed = all.length;
  const loadedSources = SOURCES
    .filter((s) => state.signalsBySource[s.id].length > 0)
    .map((s) => s.label);
  metaProcessed.textContent = processed || '-';
  metaSources.textContent = loadedSources.length ? loadedSources.join(', ') : '-';
  scanMeta.style.display = '';
}

// Apply data from one source (SSE push or REST response)
function applySourceData(sourceId, data) {
  const source = SOURCES.find((s) => s.id === sourceId);
  if (!source) return;
  const signals = Array.isArray(data.signals) ? data.signals : [];
  // Don't overwrite good data with an empty result
  if (signals.length === 0 && state.signalsBySource[sourceId].length > 0) return;
  const scannedAt = data.scannedAt;
  state.signalsBySource[sourceId] = signals.map((sig) => enrichSignal(sig, sourceId, scannedAt));
  rebuildSignals();
  render();
}

// Initial REST fetch for one source; retries if cache isn't warm yet
async function fetchSourceRest(source, attempt = 0) {
  try {
    if (attempt === 0) {
      statusEl.textContent = 'Đang tải...';
      statusEl.style.color = 'var(--amber)';
    }
    const res = await fetch(source.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    applySourceData(source.id, data);
    if ((data.processed ?? 0) === 0 && attempt < 8) {
      const delay = Math.min(5000 + attempt * 3000, 20_000);
      setTimeout(() => fetchSourceRest(source, attempt + 1), delay);
    }
  } catch (err) {
    state.errors.push(`${source.label}: ${err.message}`);
    render();
  }
}

// Update status indicator based on open SSE streams
function updateSseStatus() {
  const allOpen = state.openStreams === SOURCES.length;
  if (allOpen) {
    statusEl.textContent = `${state.rows.length} signals · ● Live`;
    statusEl.style.color = 'var(--green)';
    nextRefresh.textContent = 'SSE live';
  } else {
    statusEl.textContent = state.openStreams > 0
      ? `${state.rows.length} signals · ⚡ Partial (${state.openStreams}/${SOURCES.length})`
      : 'Reconnecting...';
    statusEl.style.color = 'var(--amber)';
    nextRefresh.textContent = `${state.openStreams}/${SOURCES.length} streams`;
  }
}

// Connect SSE for one source
function connectSse(source) {
  const es = new EventSource(source.stream);
  es.onopen = () => {
    state.openStreams = Math.min(state.openStreams + 1, SOURCES.length);
    updateSseStatus();
  };
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      applySourceData(source.id, data);
    } catch {}
  };
  es.onerror = () => {
    state.openStreams = Math.max(state.openStreams - 1, 0);
    updateSseStatus();
    // EventSource reconnects automatically
  };
  return es;
}

async function loadEdgeOpenLimitOrders() {
  const token = localStorage.getItem('orders_token') ?? '';
  if (!token) return;

  try {
    const [ordersRes, posRes] = await Promise.all([
      fetch('/api/open-orders', { headers: { 'x-orders-token': token } }),
      fetch('/api/positions', { headers: { 'x-orders-token': token } }),
    ]);
    const next = new Set();

    if (ordersRes.ok) {
      const orders = await ordersRes.json();
      const arr = Array.isArray(orders) ? orders : (orders.orders ?? []);
      arr
        .filter((order) => String(order.type ?? '').toUpperCase() === 'LIMIT' && !order.reduceOnly)
        .forEach((order) => next.add(order.symbol));
    }

    if (posRes.ok) {
      const positions = await posRes.json();
      const arr = Array.isArray(positions) ? positions : (positions.positions ?? []);
      arr
        .filter((position) => Number(position.positionAmt ?? 0) !== 0)
        .forEach((position) => next.add(position.symbol));
    }

    // Chỉ re-render nếu set thực sự thay đổi
    const prevSize = edgeOpenLimitSymbols.size;
    const prevKeys = [...edgeOpenLimitSymbols].join(',');
    const nextKeys = [...next].sort().join(',');
    edgeOpenLimitSymbols = next;
    if (next.size !== prevSize || [...next].sort().join(',') !== prevKeys) render();
  } catch {}
}

async function placeEdgeOrder(btn) {
  const row = btn.closest('.edge-order-row');
  const input = row?.querySelector('.edge-order-margin');
  const margin = Number(input?.value ?? 5);
  const symbol = btn.dataset.symbol;
  const action = btn.dataset.action;
  const entry = Number(btn.dataset.entry);
  const sl = btn.dataset.sl === '' ? null : Number(btn.dataset.sl);
  const tp = btn.dataset.tp === '' ? null : Number(btn.dataset.tp);
  const score = Number(btn.dataset.score);
  const type = btn.dataset.type ?? '';

  if (!margin || margin <= 0) {
    btn.textContent = 'Enter margin';
    return;
  }

  if (!symbol || !action || !Number.isFinite(entry) || entry <= 0) {
    btn.classList.add('error');
    btn.textContent = 'No entry';
    setTimeout(() => {
      btn.classList.remove('error');
      btn.textContent = 'LIMIT';
    }, 3000);
    return;
  }

  const token = localStorage.getItem('orders_token') ?? '';
  if (!token) {
    btn.classList.add('error');
    btn.textContent = 'Login first';
    setTimeout(() => {
      btn.classList.remove('error');
      btn.textContent = 'LIMIT';
    }, 3000);
    return;
  }

  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = 'Placing...';

  try {
    const response = await fetch('/api/pump-manual-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-orders-token': token },
      body: JSON.stringify({ symbol, action, entry, sl, tp, score, margin, type }),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error ?? 'Order failed');

    btn.classList.remove('loading');
    btn.classList.add('success');
    btn.textContent = data.marketFilled ? `MKT #${data.orderId}` : `#${data.orderId}`;
    if (input) input.disabled = true;
    edgeOpenLimitSymbols.add(symbol);

    if (row && !row.querySelector('.edge-order-exists')) {
      const badge = document.createElement('span');
      badge.className = 'edge-order-exists';
      badge.textContent = 'Has order';
      row.appendChild(badge);
    }
  } catch (error) {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.classList.add('error');
    const message = error?.message || 'Order failed';
    btn.textContent = message.length > 30 ? `${message.slice(0, 30)}...` : message;
    setTimeout(() => {
      btn.classList.remove('error');
      btn.textContent = 'LIMIT';
    }, 4000);
  }
}

function fmtPnlEdge(pnl) {
  if (pnl == null) return '<span style="color:var(--muted)">-</span>';
  const sign = pnl >= 0 ? '+' : '';
  const cls = pnl >= 0 ? 'positive' : 'negative';
  return `<span class="${cls}">${sign}$${Math.abs(pnl).toFixed(3)}</span>`;
}

function fmtEdgeMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.000';
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(3)}`;
}

function normalizeEdgeComboPart(value, fallback = '-') {
  const text = String(value ?? fallback).trim();
  return (text || fallback).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
}

function edgeTradeCombo(t = {}) {
  if (t.pumpCombo) return String(t.pumpCombo);
  const side = normalizeEdgeComboPart(t.side, 'SIDE');
  const type = normalizeEdgeComboPart(t.pumpSignalType ?? t.source, 'EDGE');
  const tf = normalizeEdgeComboPart(t.pumpSignalTimeframe ?? String(t.source ?? '').match(/(\d+[mh])/)?.[1], '-');
  const corr = Number(t.btcCorr);
  const corrBucket = Number.isFinite(corr)
    ? corr < 0.3 ? 'BTC_CORR_RAC' : corr < 0.5 ? 'BTC_CORR_YEU' : 'BTC_CORR_THEO'
    : 'BTC_CORR_NO_DATA';
  const h = t.btcHealth ?? {};
  const dir = normalizeEdgeComboPart(h.btcTrendDir ?? t.btcTrendDir, 'BTC_NO_DATA');
  const score = Number(h.btcTrendScore ?? t.btcTrendScore);
  const trend = dir === 'BTC_NO_DATA'
    ? dir
    : `BTC_${dir}_${Number.isFinite(score) ? (score < 45 ? 'WEAK' : score < 65 ? 'MID' : 'STRONG') : 'NO_SCORE'}`;
  const gate = normalizeEdgeComboPart(t.capGateLabel ?? t.emaStageGateLabel ?? '-', '-');
  return [type, side, tf, corrBucket, trend, `GATE_${gate}`].join(' | ');
}

function renderEdgeBtcCorrBadge(t) {
  const corr = Number(t?.btcCorr);
  if (!Number.isFinite(corr)) return '<span class="edge-chip" title="Lệnh cũ chưa lưu btcCorr">BTC NO DATA</span>';
  const cls = corr >= 0.5 ? 'good' : corr >= 0.3 ? 'warn' : 'bad';
  const label = corr >= 0.5 ? `✓ theo ${corr.toFixed(2)}` : corr >= 0.3 ? `~ yếu ${corr.toFixed(2)}` : `✗ rác ${corr.toFixed(2)}`;
  return `<span class="edge-chip ${cls}" title="Correlation coin/BTC lúc vào">${escapeHtml(label)}</span>`;
}

function renderEdgeBtcTrendBadge(t) {
  const h = t?.btcHealth ?? {};
  const dir = String(h.btcTrendDir ?? t?.btcTrendDir ?? h.regime ?? t?.btcRegime ?? '').toUpperCase();
  const score = Number(h.btcTrendScore ?? t?.btcTrendScore);
  if (!dir) return '<span class="edge-chip" title="Lệnh cũ chưa lưu BTC trend">BTC NO DATA</span>';
  const cls = dir.includes('UP') ? 'good' : dir.includes('DOWN') ? 'bad' : 'warn';
  const move = Number(h.btcMove6hPct);
  const tail = Number.isFinite(move) ? ` · ${move >= 0 ? '+' : ''}${move.toFixed(2)}%/6h` : '';
  return `<span class="edge-chip ${cls}" title="BTC trend lúc vào">${escapeHtml(`BTC ${dir} ${Number.isFinite(score) ? score.toFixed(0) : '-'}${tail}`)}</span>`;
}

function renderEdgeGateBadge(t) {
  const gate = String(t.capGateLabel ?? t.emaStageGateLabel ?? '-');
  if (!gate || gate === '-') return '<span class="edge-chip">GATE -</span>';
  const upper = gate.toUpperCase();
  const cls = upper.includes('BLOCK') || upper.includes('BAD') ? 'bad' : upper.includes('OK') || upper.includes('ALIGNED') ? 'good' : 'warn';
  const title = t.capGateReason ? ` title="${escapeHtml(t.capGateReason)}"` : ` title="${escapeHtml(gate)}"`;
  return `<span class="edge-chip ${cls}"${title}>${escapeHtml(gate)}</span>`;
}

function renderEdgePaperDayOptions(days = edgePaperAvailableDays) {
  if (!edgePaperDayFilter) return;
  const normalized = Array.isArray(days) ? days : [];
  const current = edgePaperDayFilter.value || edgePaperDay || 'all';
  edgePaperDayFilter.innerHTML = [
    '<option value="all">Tất cả</option>',
    ...normalized.map((day) => `<option value="${escapeHtml(day)}">${escapeHtml(day)}</option>`),
  ].join('');
  edgePaperDayFilter.value = normalized.includes(current) ? current : 'all';
  edgePaperDay = edgePaperDayFilter.value;
}

edgePaperDayFilter?.addEventListener('change', () => {
  edgePaperDay = edgePaperDayFilter.value || 'all';
  edgePaperPage = 1;
  loadEdgePaperTrades(true);
});

function renderEdgePaperPager(pagination = edgePaperPagination) {
  edgePaperPagination = pagination || edgePaperPagination;
  const page = Number(edgePaperPagination.page || 1);
  const totalPages = Math.max(1, Number(edgePaperPagination.totalPages || 1));
  const totalRows = Number(edgePaperPagination.totalRows || 0);
  if (edgePaperPageLabel) edgePaperPageLabel.textContent = `Page ${page}/${totalPages} - ${totalRows} rows`;
  if (edgePaperPrev) edgePaperPrev.disabled = page <= 1;
  if (edgePaperNext) edgePaperNext.disabled = page >= totalPages;
  if (edgePaperPageSizeSelect) edgePaperPageSizeSelect.value = String(edgePaperPagination.pageSize || edgePaperPageSize);
}

edgePaperPrev?.addEventListener('click', () => {
  if (edgePaperPage <= 1) return;
  edgePaperPage -= 1;
  loadEdgePaperTrades(true);
});

edgePaperNext?.addEventListener('click', () => {
  const totalPages = Math.max(1, Number(edgePaperPagination.totalPages || 1));
  if (edgePaperPage >= totalPages) return;
  edgePaperPage += 1;
  loadEdgePaperTrades(true);
});

edgePaperPageSizeSelect?.addEventListener('change', () => {
  edgePaperPageSize = Number(edgePaperPageSizeSelect.value || 300);
  edgePaperPage = 1;
  loadEdgePaperTrades(true);
});

function renderEdgeComboStats(rows = edgePaperComboStats) {
  if (!edgeComboStatsEl) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    edgeComboStatsEl.style.display = 'none';
    edgeComboStatsEl.innerHTML = '';
    return;
  }
  edgeComboStatsEl.style.display = '';
  edgeComboStatsEl.innerHTML = list.map((row, index) => {
    const key = String(row.key ?? '-');
    const parts = key.split('|').map((p) => p.trim()).filter(Boolean);
    const title = parts.slice(0, 3).join(' · ') || key;
    const tags = parts.slice(3).map((part) => {
      const upper = part.toUpperCase();
      const cls = upper.includes('BAD') || upper.includes('BLOCK') || upper.includes('RAC') ? 'bad'
        : upper.includes('GOOD') || upper.includes('OK') || upper.includes('THUAN') || upper.includes('THEO') ? 'hot'
          : '';
      return `<span class="edge-combo-tag ${cls}" title="${escapeHtml(part)}">${escapeHtml(part)}</span>`;
    }).join('');
    const quality = String(row.quality ?? '').toLowerCase();
    const cardCls = quality.includes('good') ? 'good' : quality.includes('bad') ? 'bad' : 'neutral';
    const pnl = Number(row.pnl ?? 0);
    const avgRoe = row.avgRoe == null ? '-' : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    const plan = row.tradePlan ?? {};
    const planLabel = String(plan.label ?? '').trim() || 'TEST $1';
    const planMargin = Number(plan.marginUsdt);
    const planCls = Number.isFinite(planMargin) && planMargin <= 1.01 ? 'bad' : 'hot';
    const planTitle = plan.reason ? ` title="${escapeHtml(plan.reason)}"` : '';
    return `<div class="edge-combo-card ${cardCls}">
      <div class="edge-combo-head">
        <div class="edge-combo-title">#${index + 1} ${escapeHtml(title)}</div>
        <span class="edge-combo-tag ${planCls}"${planTitle}>${escapeHtml(planLabel)}</span>
      </div>
      <div class="edge-combo-tags">${tags}</div>
      <div class="edge-combo-stats">
        <div>${row.wins ?? 0}W/${row.losses ?? 0}L · WR ${row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`} · Closed ${row.closed ?? 0}/${row.total ?? 0}</div>
        <div class="edge-combo-pnl ${pnl >= 0 ? 'pos' : 'neg'}">PnL ${fmtEdgeMoney(pnl)} · AvgROE ${avgRoe}</div>
      </div>
    </div>`;
  }).join('');
}

function edgePaperSortValue(trade, key) {
  if (key === 'symbol') return trade.symbol ?? '';
  if (key === 'side') return trade.side ?? '';
  if (key === 'entry') return Number(trade.entryPrice);
  if (key === 'sl') return trade.sl == null ? null : Number(trade.sl);
  if (key === 'tp') return trade.tp == null ? null : Number(trade.tp);
  if (key === 'mark') return Number(trade.markPrice ?? trade.exitPrice);
  if (key === 'pnl') return trade.pnl == null ? null : Number(trade.pnl);
  if (key === 'roe') return trade.roe == null ? null : Number(trade.roe);
  if (key === 'source') return trade.source ?? '';
  if (key === 'time') return Date.parse(trade.createdAt ?? '') || 0;
  if (key === 'status') {
    const order = { OPEN: 0, PENDING: 1, ENTRY_READY: 2, CLOSED: 3 };
    return order[trade.status] ?? 9;
  }
  return '';
}

function compareEdgePaperValues(a, b, dir) {
  const aMissing = a == null || Number.isNaN(a);
  const bMissing = b == null || Number.isNaN(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const result = typeof a === 'string' || typeof b === 'string'
    ? String(a).localeCompare(String(b), 'en')
    : a - b;
  return dir === 'asc' ? result : -result;
}

function sortEdgePaperTrades(trades) {
  const { key, dir } = edgePaperSort;
  return trades.slice().sort((a, b) => {
    const result = compareEdgePaperValues(edgePaperSortValue(a, key), edgePaperSortValue(b, key), dir);
    if (result !== 0) return result;
    return compareEdgePaperValues(edgePaperSortValue(a, 'time'), edgePaperSortValue(b, 'time'), 'desc');
  });
}

function updateEdgePaperSortHeaders() {
  document.querySelectorAll('[data-edge-paper-sort]').forEach((th) => {
    const active = th.dataset.edgePaperSort === edgePaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (edgePaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

function renderEdgePaperTrades(trades, summary) {
  edgePaperTradesCache = trades;
  edgePaperSummaryCache = summary;
  const open = trades.filter((trade) => trade.status === 'OPEN' || trade.status === 'PENDING' || trade.status === 'ENTRY_READY');
  const closed = trades.filter((trade) => trade.status === 'CLOSED');
  const all = sortEdgePaperTrades([...open, ...closed]);
  let countText = `${edgePaperDay && edgePaperDay !== 'all' ? `${edgePaperDay} · ` : ''}${open.length} open - ${closed.length} closed`;
  const totalRows = Number(edgePaperPagination?.totalRows ?? summary?.total ?? trades.length);
  countText = `${edgePaperDay && edgePaperDay !== 'all' ? `${edgePaperDay} · ` : ''}${summary?.open ?? open.length} open - ${summary?.closed ?? closed.length} closed · page ${edgePaperPagination.page || 1}/${edgePaperPagination.totalPages || 1} (${all.length}/${totalRows} rows)`;
  if (summary && summary.closed > 0) {
    const winRate = summary.closed > 0 ? Math.round(summary.wins / summary.closed * 100) : 0;
    countText += ` - TP ${summary.tpHits ?? 0} SL ${summary.slHits ?? 0} - WR ${winRate}%`;
    if (summary.avgRoe != null) countText += ` - AvgROE ${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`;
  }
  if (summary?.netPnl != null) {
    const net = Number(summary.netPnl);
    countText += ` - PnL ${net >= 0 ? '+' : ''}$${net.toFixed(3)}`;
  }
  edgePaperCount.textContent = countText;
  renderEdgeComboStats(edgePaperComboStats);

  if (!all.length) {
    edgePaperBody.innerHTML = '<tr><td colspan="17" class="empty-cell">No paper trades from Short Edge yet.</td></tr>';
    updateEdgePaperSortHeaders();
    return;
  }

  edgePaperBody.innerHTML = all.map((trade) => {
    const isLong = trade.side === 'LONG';
    const sideHtml = isLong
      ? '<span style="color:var(--green);font-weight:700">LONG</span>'
      : '<span style="color:var(--red);font-weight:700">SHORT</span>';
    const isClosed = trade.status === 'CLOSED';
    const mark = trade.markPrice ?? trade.exitPrice ?? '-';
    const actionButtons = isClosed
      ? `<button class="edge-paper-close-btn" style="opacity:.6" data-edge-paper-delete="${escapeHtml(trade.id)}">Del</button>`
      : `<button class="edge-paper-close-btn" data-edge-paper-close="${escapeHtml(trade.id)}">Close</button>`;
    const rowStyle = isClosed ? 'opacity:.5' : '';
    const slColor = isLong ? 'var(--red)' : 'var(--green)';
    const tpColor = isLong ? 'var(--green)' : 'var(--red)';
    const outcomeHtml = isClosed
      ? trade.outcome === 'TP' ? '<span style="color:var(--green);font-weight:700">TP</span>'
        : trade.outcome === 'SL' ? '<span style="color:var(--red);font-weight:700">SL</span>'
        : trade.outcome === 'TIMEOUT' ? '<span style="color:var(--amber);font-weight:700">Timeout</span>'
        : '<span style="color:var(--muted)">Manual</span>'
      : trade.status === 'PENDING' ? '<span style="color:var(--amber);font-weight:700">PENDING</span>'
      : '<span style="color:var(--green)">OPEN</span>';
    const dirClass = isLong ? 'long' : 'short';
    const scoreNum = Number((trade.source ?? '').match(/\d+/)?.[0]) || 0;
    const hasOrder = edgeOpenLimitSymbols.has(trade.symbol);
    const orderCell = isClosed
      ? '<td></td>'
      : `<td>
          <div style="display:flex;align-items:center;gap:4px">
            <input class="edge-order-margin" type="number" value="5" min="1" max="10000" step="1" style="width:46px;font-size:12px" title="Margin (USDT)" ${hasOrder ? 'disabled' : ''}>
            <button class="edge-order-btn ${dirClass}"
              type="button"
              data-symbol="${escapeHtml(trade.symbol)}"
              data-action="${escapeHtml(trade.side)}"
              data-entry="${Number(trade.entryPrice)}"
              data-sl="${trade.sl != null ? Number(trade.sl) : ''}"
              data-tp="${trade.tp != null ? Number(trade.tp) : ''}"
              data-score="${scoreNum}"
              data-type="edge-paper"
              style="padding:3px 8px;font-size:10px;white-space:nowrap"
              ${hasOrder ? 'disabled' : ''}>
              ${hasOrder ? 'Has order' : 'LIMIT'}
            </button>
          </div>
        </td>`;

    return `<tr data-id="${trade.id}" style="${rowStyle}">
      <td><a href="/?symbol=${encodeURIComponent(trade.symbol)}" target="_blank" style="color:var(--text);text-decoration:none;font-weight:700">${escapeHtml(trade.symbol.replace(/USDT$/, ''))}<span style="color:var(--muted);font-size:11px;font-weight:400">USDT</span></a></td>
      <td>${sideHtml}</td>
      <td>${fmtPrice(trade.entryPrice)}</td>
      <td style="font-size:11px;color:${slColor}">${trade.sl != null ? fmtPrice(trade.sl) : '<span style="color:var(--muted)">-</span>'}</td>
      <td style="font-size:11px;color:${tpColor}">${trade.tp != null ? fmtPrice(trade.tp) : '<span style="color:var(--muted)">-</span>'}</td>
      <td>${renderEdgeBtcCorrBadge(trade)}</td>
      <td>${renderEdgeBtcTrendBadge(trade)}</td>
      <td>${renderEdgeGateBadge(trade)}</td>
      <td data-cell-mark="${trade.id}">${fmtPrice(mark)}</td>
      <td data-cell-pnl="${trade.id}">${fmtPnlEdge(trade.pnl)}</td>
      <td data-cell-roe="${trade.id}">${trade.roe != null ? `<span style="color:${Number(trade.roe)>=0?'var(--green)':'var(--red)'}">${Number(trade.roe)>=0?'+':''}${Number(trade.roe).toFixed(1)}%</span>` : '-'}</td>
      <td style="font-size:11px">${outcomeHtml}</td>
      <td><span class="edge-chip" title="${escapeHtml(edgeTradeCombo(trade))}">${escapeHtml(edgeTradeCombo(trade))}</span></td>
      <td style="font-size:10px;color:var(--muted)">${escapeHtml(trade.source ?? '-')}</td>
      <td style="font-size:11px;color:var(--muted)">${new Date(trade.createdAt).toLocaleTimeString('vi')}</td>
      <td>${actionButtons}</td>
      ${orderCell}
    </tr>`;
  }).join('');
  updateEdgePaperSortHeaders();
}

// In-place PNL/MARK update — không re-render cả bảng để tránh flicker
function refreshEdgePaperPnl(trades) {
  const currentIds = new Set([...edgePaperBody.querySelectorAll('tr[data-id]')].map((r) => r.dataset.id));
  const newIds = new Set(trades.map((t) => t.id));
  let needFull = currentIds.size !== newIds.size;
  if (!needFull) { for (const id of newIds) { if (!currentIds.has(id)) { needFull = true; break; } } }
  if (needFull) { renderEdgePaperTrades(trades, edgePaperSummaryCache); return; }
  for (const t of trades) {
    if (t.status === 'CLOSED') continue;
    const mark = t.markPrice ?? t.exitPrice ?? '-';
    const markEl = edgePaperBody.querySelector(`[data-cell-mark="${t.id}"]`);
    const pnlEl  = edgePaperBody.querySelector(`[data-cell-pnl="${t.id}"]`);
    const roeEl  = edgePaperBody.querySelector(`[data-cell-roe="${t.id}"]`);
    if (markEl) markEl.textContent = fmtPrice(mark);
    if (pnlEl)  pnlEl.innerHTML    = fmtPnlEdge(t.pnl);
    if (roeEl)  roeEl.innerHTML    = t.roe != null
      ? `<span style="color:${Number(t.roe)>=0?'var(--green)':'var(--red)'}">${Number(t.roe)>=0?'+':''}${Number(t.roe).toFixed(1)}%</span>`
      : '-';
  }
  const open = trades.filter((t) => t.status !== 'CLOSED').length;
  const closed = trades.filter((t) => t.status === 'CLOSED').length;
  const summary = edgePaperSummaryCache;
  let countText = `${open} open - ${closed} closed`;
  const totalRows = Number(edgePaperPagination?.totalRows ?? summary?.total ?? trades.length);
  countText = `${edgePaperDay && edgePaperDay !== 'all' ? `${edgePaperDay} · ` : ''}${summary?.open ?? open} open - ${summary?.closed ?? closed} closed · page ${edgePaperPagination.page || 1}/${edgePaperPagination.totalPages || 1} (${trades.length}/${totalRows} rows)`;
  if (summary && summary.closed > 0) {
    const wr = Math.round(summary.wins / summary.closed * 100);
    countText += ` - TP ${summary.tpHits ?? 0} SL ${summary.slHits ?? 0} - WR ${wr}%`;
    if (summary.avgRoe != null) countText += ` - AvgROE ${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`;
  }
  if (summary?.netPnl != null) {
    const net = Number(summary.netPnl);
    countText += ` - PnL ${net >= 0 ? '+' : ''}$${net.toFixed(3)}`;
  }
  edgePaperCount.textContent = countText;
  renderEdgeComboStats(edgePaperComboStats);
}

let _edgePaperFetching = false;
async function loadEdgePaperTrades(forceRender = false) {
  if (_edgePaperFetching) return;
  _edgePaperFetching = true;
  try {
    const dayParam = encodeURIComponent(edgePaperDay || 'all');
    const pageParam = encodeURIComponent(edgePaperPage || 1);
    const pageSizeParam = encodeURIComponent(edgePaperPageSize || 300);
    const response = await fetch(`/api/edge-paper-trades?day=${dayParam}&page=${pageParam}&pageSize=${pageSizeParam}`, { cache: 'no-store' });
    if (!response.ok) { console.warn('[EdgePaper] Load failed HTTP', response.status); return; }
    const data = await response.json();
    const trades = data.trades ?? [];
    edgePaperSummaryCache = data.summary;
    edgePaperAvailableDays = data.availableDays ?? edgePaperAvailableDays;
    edgePaperComboStats = data.comboStats ?? [];
    edgePaperPagination = data.pagination ?? edgePaperPagination;
    edgePaperPage = Number(edgePaperPagination.page || edgePaperPage || 1);
    edgePaperPageSize = Number(edgePaperPagination.pageSize || edgePaperPageSize || 300);
    renderEdgePaperDayOptions(edgePaperAvailableDays);
    renderEdgePaperPager(edgePaperPagination);
    if (edgePaperTradesCache.length > 0 && !forceRender) {
      edgePaperTradesCache = trades;
      refreshEdgePaperPnl(trades);
    } else {
      renderEdgePaperTrades(trades, data.summary);
    }
  } catch (err) {
    console.warn('[EdgePaper] Load error:', err.message);
  } finally {
    _edgePaperFetching = false;
  }
}

let _edgePaperPollTimer = null;
function scheduleEdgePaperPoll() {
  clearTimeout(_edgePaperPollTimer);
  const hasOpen = edgePaperTradesCache.some((t) => t.status === 'OPEN');
  _edgePaperPollTimer = setTimeout(async () => {
    await loadEdgePaperTrades();
    scheduleEdgePaperPoll();
  }, hasOpen ? 3_000 : 15_000);
}

async function enterEdgePaperTrade(btn) {
  const symbol = btn.dataset.symbol;
  const side = btn.dataset.action;
  const entry = Number(btn.dataset.entry);
  const sl = btn.dataset.sl === '' ? null : Number(btn.dataset.sl);
  const tp = btn.dataset.tp === '' ? null : Number(btn.dataset.tp);
  const score = Number(btn.dataset.score);
  const type = btn.dataset.type ?? '';

  if (!symbol || !['LONG', 'SHORT'].includes(String(side).toUpperCase()) || !Number.isFinite(entry) || entry <= 0) {
    btn.textContent = 'No entry';
    setTimeout(() => { btn.textContent = '+ Paper'; }, 2000);
    return;
  }

  btn.disabled = true;
  btn.textContent = '...';

  try {
    const response = await fetch('/api/edge-paper-trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol,
        side,
        marginUsdt: 10,
        leverage: 10,
        entryPrice: entry,
        tp,
        sl,
        source: `edge-${score}`,
        note: type,
      }),
    });
    if (!response.ok) throw new Error('paper failed');
    btn.textContent = 'PENDING';
    setTimeout(() => {
      btn.textContent = '+ Paper';
      btn.disabled = false;
    }, 2000);
    loadEdgePaperTrades();
  } catch {
    btn.textContent = 'ERR';
    setTimeout(() => {
      btn.textContent = '+ Paper';
      btn.disabled = false;
    }, 2000);
  }
}

async function closeEdgePaperTrade(id) {
  const btn = document.querySelector(`[data-edge-paper-close="${id}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const res = await fetch('/api/edge-paper-trades/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await loadEdgePaperTrades(); scheduleEdgePaperPoll();
  } catch (err) {
    console.error('[EdgePaper] Close failed:', err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'ERR'; setTimeout(() => { btn.textContent = 'Close'; }, 2000); }
  }
}

async function deleteEdgePaperTrade(id) {
  const btn = document.querySelector(`[data-edge-paper-delete="${id}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const res = await fetch('/api/edge-paper-trades/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await loadEdgePaperTrades(); scheduleEdgePaperPoll();
  } catch (err) {
    console.error('[EdgePaper] Delete failed:', err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'ERR'; setTimeout(() => { btn.textContent = 'Del'; }, 2000); }
  }
}

function buildFactors(sig) {
  const chips = [];
  const type = normalizedType(sig);
  const primeEarlyDump = isPrimeEarlyDump(sig);
  const strongEarlyDump = isStrongEarlyDump(sig);

  chips.push({ label: `${sig.sourceLabel}`, ok: sig.edgeBucket === 'short' ? 'warn' : '' });
  chips.push({ label: `Base ${Number(sig.score ?? 0) || 0}`, ok: '' });
  if (primeEarlyDump) chips.push({ label: strongEarlyDump ? 'EARLY_DUMP PRIME' : 'EARLY_DUMP OK', ok: 'gold' });
  if (primeEarlyDump) chips.push({ label: earlyDumpHourNote(sig), ok: isGoodEarlyDumpHour(sig) ? 'gold' : '' });

  if (sig.edgeBucket === 'short') chips.push({ label: 'Short bias', ok: 'warn' });
  if (sig.edgeBucket === 'watch') chips.push({ label: 'Watch', ok: '' });
  if (sig.edgeBucket === 'long') chips.push({ label: 'Long', ok: 'ok' });

  if (sig.blockLong === true) chips.push({ label: 'Block long', ok: 'warn' });
  if (sig.blockShort === true) chips.push({ label: 'Block short', ok: 'ok' });

  const f = sig.factors || {};
  if (f.volX != null) chips.push({ label: `Vol ${Number(f.volX).toFixed(1)}x`, ok: Number(f.volX) >= 2 ? 'warn' : '' });
  if (f.sweepVolX != null) chips.push({ label: `Sweep ${Number(f.sweepVolX).toFixed(1)}x`, ok: Number(f.sweepVolX) >= 2 ? 'ok' : '' });
  if (f.revVolX != null) chips.push({ label: `Rev ${Number(f.revVolX).toFixed(1)}x`, ok: Number(f.revVolX) >= 2 ? 'ok' : '' });
  if (f.wickFrac != null) chips.push({ label: `Wick ${(Number(f.wickFrac) * 100).toFixed(0)}%`, ok: Number(f.wickFrac) >= 0.55 ? 'warn' : '' });
  if (f.closePos != null) chips.push({ label: `Close ${(Number(f.closePos) * 100).toFixed(0)}%`, ok: '' });
  if (/liq_top|bc_utad|upthrust|pump_climax|top|short/.test(type)) chips.push({ label: 'Edge type', ok: 'warn' });

  return chips.slice(0, 8)
    .map((chip) => `<span class="edge-factor ${chip.ok}">${escapeHtml(chip.label)}</span>`)
    .join('');
}

function buildThesis(sig) {
  if (isPrimeEarlyDump(sig)) {
    const m = earlyDumpMetrics(sig);
    const bbwText = Number(m.bbwPct) >= 2 ? ' · BBW ưu tiên' : '';
    return `EARLY_DUMP edge: chase ${Number(m.chasePct).toFixed(0)}%TP, range ${Number(m.rangePct).toFixed(2)}%, ATR ${Number(m.atrPct).toFixed(2)}%${bbwText}`;
  }
  if (sig.edgeBucket === 'short') {
    return 'Short edge: exhaustion/top/rejection signal ranked above same-symbol alternatives';
  }
  if (sig.edgeBucket === 'watch') {
    return 'Watch: reversal or short-squeeze signal kept as context, not primary short edge';
  }
  return 'Long signal: shown only when filters allow non-short context';
}

function buildCard(sig) {
  const sideClass = sig.edgeBucket;
  const highlightClass = isPrimeEarlyDump(sig) ? 'early-dump-edge' : '';
  const action = String(sig.action ?? '-').toUpperCase();
  const orderSideClass = sideClassForAction(action);
  const type = normalizedType(sig) || '-';
  const change = Number(sig.change24h);
  const changeClass = Number.isFinite(change) && change >= 0 ? 'positive' : 'negative';
  const gradeClass = `grade-${String(sig.edgeGrade || 'd').toLowerCase()}`;
  const detailUrl = `/?symbol=${encodeURIComponent(sig.symbol)}`;
  const markPrice = sig.markPrice ?? sig.price;
  const footerLeft = `${timeAgo(sig.scannedAt)} - ${timeLabel(sig.scannedAt)}`;
  const footerRight = sig.volume != null ? `Vol ${Number(sig.volume).toLocaleString('en', { maximumFractionDigits: 0 })}` : sig.sourceLabel;
  const orderEntry = Number(sig.entry ?? sig.altEntry);
  const canOrder = sig.symbol && ['LONG', 'SHORT'].includes(action) && Number.isFinite(orderEntry) && orderEntry > 0;
  const orderSl = sig.sl == null ? null : Number(sig.sl);
  const orderTp = sig.tp == null ? null : Number(sig.tp);

  return `
    <article class="edge-card ${sideClass} ${highlightClass}">
      <div class="edge-card-top">
        <div class="edge-symbol-wrap">
          <a class="edge-symbol" href="${detailUrl}" target="_blank" rel="noopener">
            ${escapeHtml(String(sig.symbol).replace(/USDT$/, ''))}<span class="sym-usdt">USDT</span>
          </a>
          <span class="edge-change ${changeClass}">${fmtPct(sig.change24h)} 24h - ${fmtPrice(markPrice)}</span>
        </div>
        <div class="edge-right">
          <span class="edge-action-badge ${sideClass}">${escapeHtml(action)}</span>
          <div class="edge-score-wrap">
            <span class="edge-score-num">${sig.edgeScore}</span>
            <span class="edge-grade ${gradeClass}">${sig.edgeGrade}</span>
          </div>
          <div class="edge-type-row">
            <span class="edge-type-badge source-${sig.source}">${escapeHtml(sig.sourceLabel)}</span>
            <span class="edge-type-badge short-type">${escapeHtml(type)}</span>
          </div>
        </div>
      </div>

      <div class="edge-thesis">
        <span class="edge-thesis-dot ${sideClass}"></span>
        <span>${escapeHtml(buildThesis(sig))}</span>
      </div>

      <div class="edge-prices">
        <div class="edge-price-cell">
          <span>Entry</span>
          <strong>${fmtPrice(sig.entry ?? sig.altEntry)}</strong>
        </div>
        <div class="edge-price-cell">
          <span>SL</span>
          <strong class="negative">${fmtPrice(sig.sl)}</strong>
        </div>
        <div class="edge-price-cell">
          <span>TP</span>
          <strong class="positive">${fmtPrice(sig.tp)}</strong>
        </div>
      </div>

      <div class="edge-factors">${buildFactors(sig)}</div>
      <div class="edge-reason">${escapeHtml(sig.reason || '-')}</div>
      <div class="edge-note">${escapeHtml(sig.note || '')}</div>

      <div class="edge-order-row">
        <input class="edge-order-margin" type="number" value="5" min="1" max="10000" step="1" title="Margin (USDT)" ${edgeOpenLimitSymbols.has(sig.symbol) ? 'disabled' : ''}>
        <span class="edge-order-label">USDT</span>
        <button
          class="edge-order-btn ${orderSideClass}"
          type="button"
          data-symbol="${escapeHtml(sig.symbol)}"
          data-action="${escapeHtml(action)}"
          data-entry="${canOrder ? orderEntry : ''}"
          data-sl="${Number.isFinite(orderSl) ? orderSl : ''}"
          data-tp="${Number.isFinite(orderTp) ? orderTp : ''}"
          data-score="${Number(sig.score ?? sig.edgeScore) || 0}"
          data-type="${escapeHtml(type)}"
          ${canOrder ? '' : 'disabled'}
        >LIMIT</button>
        ${edgeOpenLimitSymbols.has(sig.symbol) ? '<span class="edge-order-exists">Has order</span>' : ''}
        <button
          class="edge-paper-btn"
          type="button"
          data-symbol="${escapeHtml(sig.symbol)}"
          data-action="${escapeHtml(action)}"
          data-entry="${canOrder ? orderEntry : ''}"
          data-sl="${Number.isFinite(orderSl) ? orderSl : ''}"
          data-tp="${Number.isFinite(orderTp) ? orderTp : ''}"
          data-score="${Number(sig.edgeScore ?? sig.score) || 0}"
          data-type="${escapeHtml(type)}"
          ${canOrder ? '' : 'disabled'}
        >+ Paper</button>
      </div>

      <div class="edge-footer">
        <span>${escapeHtml(footerLeft)}</span>
        <span>${escapeHtml(footerRight)}</span>
      </div>
    </article>
  `;
}

function filteredRows() {
  const search = searchInput.value.trim().toUpperCase();
  const minScore = Number(scoreFilter.value) || 0;
  const source = sourceFilter.value;
  const type = typeFilter.value;
  const side = sideFilter.value;

  return state.rows.filter((sig) => {
    if (search && !String(sig.symbol ?? '').includes(search)) return false;
    if (sig.edgeScore < minScore) return false;
    if (source !== 'all' && sig.source !== source) return false;
    if (type !== 'all' && normalizedType(sig) !== type) return false;
    if (side !== 'all' && sig.edgeBucket !== side) return false;
    return true;
  });
}

function render() {
  const rows = filteredRows();
  const shortRows = state.rows.filter((sig) => sig.edgeBucket === 'short');
  const edgeScores = state.rows.map((sig) => sig.edgeScore);
  const visibleScores = rows.map((sig) => sig.edgeScore);
  const avg = edgeScores.length ? edgeScores.reduce((sum, n) => sum + n, 0) / edgeScores.length : null;
  const best = visibleScores.length ? Math.max(...visibleScores) : null;

  totalSignals.textContent = state.rows.length || '-';
  rawSignals.textContent = `Raw ${state.rawSignals.length}`;
  shortCount.textContent = shortRows.length || '-';
  shortCount.className = shortRows.length > 0 ? 'negative' : '';
  avgEdge.textContent = avg == null ? '-' : avg.toFixed(0);
  bestEdge.textContent = best == null ? 'Best -' : `Best ${best}`;
  visibleCount.textContent = rows.length;

  if (state.lastLoadedAt) {
    lastScan.textContent = timeLabel(state.lastLoadedAt);
  }

  updateSseStatus();

  if (rows.length === 0) {
    const title = state.rows.length === 0 ? 'No short edge yet' : 'No matching signals';
    const text = state.rows.length === 0
      ? (state.errors.length ? state.errors.join(' | ') : 'Live boards returned no usable signal.')
      : 'Try lowering filters.';
    grid.innerHTML = `<div class="edge-empty"><strong>${escapeHtml(title)}</strong>${escapeHtml(text)}</div>`;
    return;
  }

  grid.innerHTML = rows.map(buildCard).join('');
}

// Manual refresh: re-fetch all sources via REST
function manualRefresh() {
  state.errors = [];
  SOURCES.forEach((s) => fetchSourceRest(s));
}

searchInput.addEventListener('input', () => {
  searchClear.style.display = searchInput.value ? '' : 'none';
  render();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  render();
});

scoreFilter.addEventListener('change', render);
sourceFilter.addEventListener('change', render);
typeFilter.addEventListener('change', render);
sideFilter.addEventListener('change', render);
refreshButton.addEventListener('click', manualRefresh);
document.addEventListener('click', (event) => {
  const btn = event.target.closest('.edge-order-btn');
  if (!btn) return;
  placeEdgeOrder(btn);
});
document.addEventListener('click', (event) => {
  const th = event.target.closest('[data-edge-paper-sort]');
  if (!th || !th.classList.contains('edge-paper-sort')) return;
  const key = th.dataset.edgePaperSort;
  if (edgePaperSort.key === key) {
    edgePaperSort.dir = edgePaperSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    edgePaperSort = { key, dir: key === 'status' ? 'asc' : 'desc' };
  }
  renderEdgePaperTrades(edgePaperTradesCache, edgePaperSummaryCache);
});
document.addEventListener('click', (event) => {
  const paperBtn = event.target.closest('.edge-paper-btn');
  if (paperBtn) {
    enterEdgePaperTrade(paperBtn);
    return;
  }
  const closeBtn = event.target.closest('[data-edge-paper-close]');
  if (closeBtn) {
    closeEdgePaperTrade(closeBtn.dataset.edgePaperClose);
    return;
  }
  const deleteBtn = event.target.closest('[data-edge-paper-delete]');
  if (deleteBtn) {
    deleteEdgePaperTrade(deleteBtn.dataset.edgePaperDelete);
  }
});

// Boot: initial REST fetch (handles cold cache) + SSE for live updates
SOURCES.forEach((s) => fetchSourceRest(s));
SOURCES.forEach((s) => connectSse(s));
loadEdgeOpenLimitOrders();
loadEdgePaperTrades().then(() => scheduleEdgePaperPoll());
setInterval(loadEdgeOpenLimitOrders, 30_000);
