const SSE_URL = '/api/shakeout-reclaim-stream';
const API_URL = '/api/shakeout-reclaim-signals';
const PAPER_API_URL = '/api/shakeout-paper-trades';
const PAPER_SSE_URL = '/api/shakeout-paper-trades-stream';
const SELF_LEARNING_API_URL = '/api/shakeout-self-learning';

let allSignals = [];
let total = 0;
let processed = 0;
let scannedAt = null;

const grid = document.getElementById('srGrid');
const confirmedCount = document.getElementById('confirmedCount');
const watchCount = document.getElementById('watchCount');
const totalScanned = document.getElementById('totalScanned');
const lastScan = document.getElementById('lastScan');
const scanStatus = document.getElementById('scanStatus');
const cachedCount = document.getElementById('cachedCount');
const totalCount = document.getElementById('totalCount');
const foundCount = document.getElementById('foundCount');
const searchInput = document.getElementById('searchInput');
const sideFilter = document.getElementById('sideFilter');
const stageFilter = document.getElementById('stageFilter');
const scoreFilter = document.getElementById('scoreFilter');
const sortSelect = document.getElementById('sortSelect');
const srPaperBody = document.getElementById('srPaperBody');
const srPaperSummary = document.getElementById('srPaperSummary');
const srSignalScoreStats = document.getElementById('srSignalScoreStats');
const srChaseStats = document.getElementById('srChaseStats');
const srStage2Stats = document.getElementById('srStage2Stats');
const srComboStats = document.getElementById('srComboStats');
const srMlStatus = document.getElementById('srMlStatus');
const srMlSummary = document.getElementById('srMlSummary');
const srMlGroups = document.getElementById('srMlGroups');
const srMlRefresh = document.getElementById('srMlRefresh');
const srPaperScrollTop = document.getElementById('srPaperScrollTop');
const srPaperScrollTopSpacer = document.getElementById('srPaperScrollTopSpacer');
const srPaperScroll = document.getElementById('srPaperScroll');
const srPaperTable = srPaperScroll?.querySelector('.sr-paper-table');

if (srPaperScrollTop && srPaperScrollTopSpacer && srPaperScroll && srPaperTable) {
  let syncingPaperScroll = false;
  const syncScroll = (source, target) => {
    if (syncingPaperScroll) return;
    syncingPaperScroll = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => { syncingPaperScroll = false; });
  };
  const updateTopScrollWidth = () => {
    srPaperScrollTopSpacer.style.width = `${srPaperTable.scrollWidth}px`;
    srPaperScrollTop.scrollLeft = srPaperScroll.scrollLeft;
  };
  srPaperScrollTop.addEventListener('scroll', () => syncScroll(srPaperScrollTop, srPaperScroll), { passive: true });
  srPaperScroll.addEventListener('scroll', () => syncScroll(srPaperScroll, srPaperScrollTop), { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateTopScrollWidth).observe(srPaperTable);
  window.addEventListener('resize', updateTopScrollWidth, { passive: true });
  requestAnimationFrame(updateTopScrollWidth);
}

let srPaperTrades = [];
let srLearningData = null;
let srMlSignalMap = new Map();
let srLegacySignalMap = new Map();
let srPaperSort = { key: 'status', dir: 'asc' };
let srClassFilter = 'all';
let srSideFilter = 'all';
let srDayFilter = 'all';
let srStage2Filter = 'all';
const srClassSelect = document.getElementById('srClassFilter');
const srSideSelect = document.getElementById('srSideFilter');
const srDaySelect = document.getElementById('srDayFilter');
const srStage2Select = document.getElementById('srStage2Filter');
const rerenderPaper = () => renderPaperTrades({ trades: srPaperTrades, summary: srPaperLastSummary, daily: srPaperLastDaily, variantCompare: srPaperLastVariant, realGateCompare: srPaperLastRealGate });
if (srClassSelect) srClassSelect.addEventListener('change', () => { srClassFilter = srClassSelect.value || 'all'; rerenderPaper(); });
if (srSideSelect) srSideSelect.addEventListener('change', () => { srSideFilter = srSideSelect.value || 'all'; rerenderPaper(); });
if (srDaySelect) srDaySelect.addEventListener('change', () => { srDayFilter = srDaySelect.value || 'all'; rerenderPaper(); });
if (srStage2Select) srStage2Select.addEventListener('change', () => { srStage2Filter = srStage2Select.value || 'all'; rerenderPaper(); });

function populateSrClassOptions(trades) {
  if (!srClassSelect) return;
  const classes = [...new Set(trades.map((t) => String(t.shakeoutClass || 'UNKNOWN')))].sort();
  const prev = srClassFilter;
  srClassSelect.innerHTML = '<option value="all">Tất cả</option>'
    + classes.map((c) => `<option value="${c}">${c}</option>`).join('');
  srClassSelect.value = classes.includes(prev) || prev === 'all' ? prev : 'all';
  if (srClassSelect.value !== prev) srClassFilter = 'all';
}

function paperTradeDay(t) {
  return String(t.createdAt ?? t.openedAt ?? t.closedAt ?? '').slice(0, 10);
}

function populateSrDayOptions(trades) {
  if (!srDaySelect) return;
  const days = [...new Set(trades.map(paperTradeDay).filter(Boolean))].sort().reverse();
  const prev = srDayFilter;
  srDaySelect.innerHTML = '<option value="all">Tất cả</option>'
    + days.map((d) => `<option value="${d}">${d}</option>`).join('');
  srDaySelect.value = days.includes(prev) || prev === 'all' ? prev : 'all';
  if (srDaySelect.value !== prev) srDayFilter = 'all';
}

function fmtPrice(p) {
  if (p == null || p === '') return '-';
  const v = Number(p);
  if (!Number.isFinite(v) || v <= 0) return '-';
  if (v >= 1000) return v.toLocaleString('en', { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(6);
}

function fmtPct(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function srMlSignalKey(item = {}) {
  return [item.symbol, item.side ?? item.action, item.stage].map((v) => String(v ?? '').toUpperCase()).join('|');
}

function getSrMlFlag(item = {}, model = 'candle') {
  if (model === 'legacy') {
    if (item.id && srLearningData?.legacyTradeFlags?.[item.id]) return srLearningData.legacyTradeFlags[item.id];
    return srLegacySignalMap.get(srMlSignalKey(item)) ?? null;
  }
  if (item.id && srLearningData?.tradeFlags?.[item.id]) return srLearningData.tradeFlags[item.id];
  return srMlSignalMap.get(srMlSignalKey(item)) ?? null;
}

function srCandleName(value) {
  if (value && typeof value === 'object') return String(value.name ?? 'UNKNOWN').toUpperCase();
  return String(value ?? 'UNKNOWN').toUpperCase();
}

function srCandlePatternCell(item = {}, compact = false) {
  const p5 = srCandleName(item.candlePatternAtEntry ?? item.symbolCandleAtEntry ?? item.candlePattern5m);
  const p15 = srCandleName(item.candlePattern15m);
  const btc = srCandleName(item.btcCandlePattern5m);
  const tone = p5.includes('BULLISH') || p5 === 'HAMMER'
    ? '#34d399'
    : p5.includes('BEARISH') || p5 === 'SHOOTING_STAR' ? '#fb7185' : '#fbbf24';
  const title = `Coin 5m=${p5}; Coin 15m=${p15}; BTC 5m=${btc}`;
  return `<span title="${escapeHtml(title)}" style="display:inline-block;padding:4px 7px;border:1px solid ${tone};color:${tone};background:#111827;border-radius:4px;font-size:10px;font-weight:950;white-space:nowrap">`
    + `${escapeHtml(p5)}`
    + `${compact ? '' : `<small style="display:block;margin-top:2px;font-size:9px;color:#94a3b8">15m ${escapeHtml(p15)} · BTC ${escapeHtml(btc)}</small>`}`
    + '</span>';
}

function srBtcCandlePatternCell(item = {}) {
  const btc = srCandleName(item.btcCandlePatternAtEntry ?? item.btcCandleAtEntry ?? item.btcCandlePattern5m);
  const tone = btc.includes('BULLISH') || btc === 'HAMMER'
    ? '#34d399'
    : btc.includes('BEARISH') || btc === 'SHOOTING_STAR' ? '#fb7185' : '#fbbf24';
  return `<span title="BTC 5m=${escapeHtml(btc)}" style="display:inline-block;padding:4px 7px;border:1px solid ${tone};color:${tone};background:#111827;border-radius:4px;font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(btc)}</span>`;
}

function srSideCandleGate(item = {}) {
  const tier = String(item.shakeoutSideCandleTier ?? '').toUpperCase();
  if (['GOOD', 'RISK', 'WATCH'].includes(tier)) {
    return {
      tier,
      label: tier === 'RISK' ? 'RISK · TEST $1' : tier,
      reason: String(item.shakeoutSideCandleReason ?? item.shakeoutSideCandleLabel ?? tier),
      rank: { RISK: 1, WATCH: 2, GOOD: 3 }[tier] ?? 0,
    };
  }

  const side = String(item.side ?? item.action ?? '').toUpperCase();
  const direction = String(
    item.btcTrendDir ?? item.btcHealth?.btcTrendDir ?? item.btcTrend?.direction ?? '',
  ).toUpperCase();
  const phase = String(
    item.regimeAtEntry ?? item.btcPhase ?? item.btcPhaseLabel ?? item.btcRegimeAtEntry
      ?? item.btcRegime ?? item.btcHealth?.regime ?? '',
  ).toUpperCase();
  const pct6h = Number(item.btcPct6hAtEntry ?? item.btcHealth?.pct6h ?? item.btcPct6h);
  const regime = phase === 'SW_UP' || direction === 'UP'
    ? 'SW_UP'
    : phase === 'SW_DOWN' || direction === 'DOWN'
      ? 'SW_DOWN'
      : phase.includes('DOWN') || ['WEAK', 'WEAK_DOWN'].includes(phase)
        ? 'SW_DOWN'
        : phase.includes('UP') || ['STRONG', 'WEAK_UP'].includes(phase)
          ? 'SW_UP'
          : Number.isFinite(pct6h) && pct6h > 0 ? 'SW_UP'
            : Number.isFinite(pct6h) && pct6h < 0 ? 'SW_DOWN' : 'SW_FLAT';
  const btcCandle = srCandleName(
    item.btcCandlePatternAtEntry ?? item.btcCandleAtEntry ?? item.btcCandlePattern5m,
  );
  const bias = btcCandle.includes('BEARISH') || btcCandle === 'SHOOTING_STAR'
    ? 'BEARISH'
    : btcCandle.includes('BULLISH') || btcCandle === 'HAMMER' ? 'BULLISH' : 'NEUTRAL';
  let derivedTier = 'WATCH';
  let reason = `${regime} + ${side || 'NO_SIDE'} + BTC ${btcCandle}: danh gia tu log cu`;
  if (regime === 'SW_DOWN' && side === 'LONG' && bias === 'BEARISH') {
    derivedTier = 'RISK';
    reason = `LONG nguoc SW_DOWN va nen BTC ${btcCandle} xac nhan giam`;
  } else if (regime === 'SW_DOWN' && side === 'SHORT' && bias === 'BEARISH') {
    derivedTier = 'GOOD';
    reason = `SHORT thuan SW_DOWN va nen BTC ${btcCandle} xac nhan giam`;
  } else if (regime === 'SW_UP' && side === 'SHORT' && bias === 'BULLISH') {
    derivedTier = 'RISK';
    reason = `SHORT nguoc SW_UP va nen BTC ${btcCandle} xac nhan tang`;
  } else if (regime === 'SW_UP' && side === 'LONG' && bias === 'BULLISH') {
    derivedTier = 'GOOD';
    reason = `LONG thuan SW_UP va nen BTC ${btcCandle} xac nhan tang`;
  }
  return {
    tier: derivedTier,
    label: derivedTier,
    reason,
    rank: { RISK: 1, WATCH: 2, GOOD: 3 }[derivedTier] ?? 0,
    regime,
  };
}

function srSideCandleGateBadge(item = {}) {
  const gate = srSideCandleGate(item);
  const colors = {
    GOOD: ['#052e1a', '#34d399', '#d1fae5'],
    WATCH: ['#422006', '#fbbf24', '#fde68a'],
    RISK: ['#7f1d1d', '#fb7185', '#fff1f2'],
  }[gate.tier];
  const context = `${String(item.regimeAtEntry ?? gate.regime ?? 'SW_FLAT').toUpperCase()} · ${String(item.side ?? '-').toUpperCase()}`;
  return `<span title="${escapeHtml(gate.reason)}" style="display:inline-block;padding:4px 7px;border:1px solid ${colors[1]};color:${colors[2]};background:${colors[0]};border-radius:4px;font-size:10px;font-weight:950;white-space:nowrap">`
    + `${escapeHtml(gate.label)}`
    + (context ? `<small style="display:block;margin-top:2px;font-size:9px;color:${colors[2]};opacity:.82">${escapeHtml(context)}</small>` : '')
    + '</span>';
}

function srStage2Gate(item = {}) {
  const storedTier = String(item.shakeoutStage2Tier ?? '').toUpperCase();
  if (['WATCH_PLUS', 'WATCH', 'RISK'].includes(storedTier)) {
    return {
      tier: storedTier,
      label: String(item.shakeoutStage2Label ?? storedTier.replace('_PLUS', '+')),
      code: String(item.shakeoutStage2Code ?? ''),
      modifier: String(item.shakeoutStage2Modifier ?? 'HOLD'),
      layer1Tier: String(item.shakeoutStage2Layer1Tier ?? 'NO_DATA'),
      setup: String(item.shakeoutStage2Setup ?? item.shakeoutClass ?? item.subtype ?? 'NO_SETUP'),
      variant: String(item.shakeoutStage2Variant ?? item.variant ?? 'NO_VARIANT'),
      fillQuality: String(item.shakeoutStage2FillQuality ?? 'NO_FILL_DATA'),
      flags: Array.isArray(item.shakeoutStage2Flags) ? item.shakeoutStage2Flags : [],
      reason: String(item.shakeoutStage2Reason ?? storedTier),
      auditCaptured: Boolean(item.shakeoutStage2AuditCaptured),
      derived: Boolean(item.shakeoutStage2Derived),
      twoLayer: Boolean(item.shakeoutStage2Layer1Tier),
      rank: { RISK: 1, WATCH: 2, WATCH_PLUS: 3 }[storedTier],
    };
  }

  // Không suy ngược RISK từ kết quả hoặc nến lịch sử. Thiếu Layer 1 thì chỉ WATCH.
  return {
    tier: 'WATCH',
    label: 'NO L1 DATA',
    code: 'S2_NO_LAYER1_DATA',
    modifier: 'HOLD',
    layer1Tier: 'NO_DATA',
    setup: 'NO_SETUP',
    variant: String(item.variant ?? 'NO_VARIANT'),
    fillQuality: 'NO_FILL_DATA',
    flags: [],
    reason: 'Lệnh cũ chưa lưu Layer 1 Side × BTC; không gắn RISK bằng dữ liệu hậu kiểm.',
    auditCaptured: false,
    derived: true,
    twoLayer: false,
    rank: 2,
  };
}

function srStage2Badge(item = {}) {
  const gate = srStage2Gate(item);
  const colors = {
    WATCH_PLUS: ['#052e1a', '#34d399', '#d1fae5'],
    WATCH: ['#422006', '#fbbf24', '#fde68a'],
    RISK: ['#7f1d1d', '#fb7185', '#fff1f2'],
  }[gate.tier];
  const delay = Number(item.shakeoutStage2FillDelayMinutes);
  const context = [
    gate.derived ? 'DERIVED V2' : 'LIVE V2',
    `${gate.setup}/${gate.variant}`,
    gate.fillQuality,
    Number.isFinite(delay) ? `${delay.toFixed(0)}m` : '',
  ].filter(Boolean).join(' · ');
  const audit = gate.flags.length ? `AUDIT: ${gate.flags.join(' + ')}` : 'AUDIT: CLEAN/NO DATA';
  const displayTier = gate.tier === 'WATCH_PLUS' ? 'WATCH+' : gate.tier;
  return `<span title="${escapeHtml(gate.reason)}" style="display:inline-block;max-width:190px;padding:4px 7px;border:1px solid ${colors[1]};color:${colors[2]};background:${colors[0]};border-radius:4px;font-size:10px;font-weight:950;white-space:normal;line-height:1.25">`
    + `${escapeHtml(displayTier)} · ${escapeHtml(gate.modifier)}`
    + `<small style="display:block;margin-top:2px;font-size:9px;opacity:.82">${escapeHtml(context)}</small>`
    + `<small style="display:block;margin-top:2px;font-size:8px;opacity:.68">${escapeHtml(audit)}</small>`
    + '</span>';
}

function srMlFlagBadge(item = {}, compact = false, model = 'candle') {
  if (srLearningData?.enabled === false) {
    return '<span class="sr-ml-flag muted" title="Python model đã tắt để giảm tải máy">PY OFF</span>';
  }
  const result = getSrMlFlag(item, model);
  if (!result) return '<span class="sr-ml-flag muted" title="Chưa chạy Python self-learning">PY ...</span>';
  const detail = `${result.reason ?? ''}${result.groupLevel ? ` · ${result.groupLevel}` : ''}`;
  return `<span class="sr-ml-flag ${escapeHtml(result.tone ?? 'muted')}" title="${escapeHtml(detail)}">`
    + `${escapeHtml(result.label ?? result.flag ?? 'PYTHON')}`
    + `${compact ? '' : `<small style="display:block;margin-top:2px;font-size:9px;font-weight:800">${escapeHtml(result.reason ?? '')}</small>`}`
    + '</span>';
}

function renderSrLearningPanel(data = srLearningData) {
  if (!srMlStatus || !srMlSummary || !srMlGroups) return;
  if (!data) {
    srMlStatus.textContent = 'Chưa có kết quả tự học.';
    srMlSummary.innerHTML = '';
    srMlGroups.innerHTML = '';
    return;
  }
  if (data.enabled === false) {
    srMlStatus.textContent = 'PY MODEL OFF · đã tắt train và chấm Python để giảm tải máy';
    srMlSummary.innerHTML = '';
    srMlGroups.innerHTML = '';
    return;
  }
  const t = data.training ?? {};
  const s = data.summary ?? {};
  srMlStatus.textContent = `${data.mode ?? 'ANALYSIS_ONLY'} · OLD ${t.legacy?.closedSamples ?? 0} mẫu / CANDLE ${t.candle?.closedSamples ?? 0} mẫu · ${t.candle?.method ?? 'PRIOR'} · ${t.lookbackDays ?? '-'} ngày · ${data.generatedAt ? new Date(data.generatedAt).toLocaleString('vi-VN') : '-'}`;
  const cards = [
    ['Closed học', t.closedSamples ?? 0, '#e2e8f0'],
    ['OLD Good live', s.legacyGood ?? 0, '#34d399'],
    ['OLD Risk live', s.legacyRisk ?? 0, '#fb7185'],
    ['PY Learned Good', s.signalLearnedGood ?? s.signalGood ?? 0, '#34d399'],
    ['PY Prior Watch', s.signalPriorWatch ?? 0, '#fbbf24'],
    ['PY High-Jump Prior', s.signalHighJumpPrior ?? 0, '#fb7185'],
    ['PY Candle Conflict', s.signalCandleConflict ?? 0, '#f97316'],
    ['PY BTC Conflict', s.signalBtcConflict ?? 0, '#ef4444'],
    ['PY Chase Prior', s.signalChasePrior ?? 0, '#e11d48'],
    ['PY Watch live', s.signalWatch ?? 0, '#fbbf24'],
    ['PY Risk live', s.signalRisk ?? 0, '#fb7185'],
    ['PY No data', s.signalNoData ?? 0, '#94a3b8'],
  ];
  srMlSummary.innerHTML = cards.map(([label, value, color]) => `<div class="sr-ml-stat"><span>${label}</span><strong style="color:${color}">${value}</strong></div>`).join('');
  const groupCard = (title, rows, tone) => {
    const body = (rows ?? []).slice(0, 5).map((row) => `<div title="${escapeHtml(row.group)}">${escapeHtml(row.group)} · n=${row.closed} · WR ${Number(row.adjustedWinRate ?? 0).toFixed(1)}% · ROE ${Number(row.avgNetRoe ?? 0) >= 0 ? '+' : ''}${Number(row.avgNetRoe ?? 0).toFixed(1)}%</div>`).join('');
    return `<div class="sr-ml-group"><strong style="color:${tone}">${title}</strong>${body || '<div>Chưa đủ mẫu.</div>'}</div>`;
  };
  srMlGroups.innerHTML = groupCard('Nhóm tốt Python học được', data.topGoodGroups, '#34d399')
    + groupCard('Nhóm rủi ro Python học được', data.topRiskGroups, '#fb7185')
    + groupCard('Nhóm tốt dữ liệu cũ', data.legacyTopGoodGroups, '#2dd4bf')
    + groupCard('Nhóm rủi ro dữ liệu cũ', data.legacyTopRiskGroups, '#f97316');
}

async function loadShakeoutLearning(force = false) {
  if (srMlRefresh) srMlRefresh.disabled = true;
  try {
    const response = await fetch(SELF_LEARNING_API_URL, {
      method: force ? 'POST' : 'GET',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    srLearningData = await response.json();
    srMlSignalMap = new Map((srLearningData.signalFlags ?? []).map((row) => [srMlSignalKey(row), row]));
    srLegacySignalMap = new Map((srLearningData.legacySignalFlags ?? []).map((row) => [srMlSignalKey(row), row]));
    renderSrLearningPanel();
    render();
    if (srPaperTrades.length) rerenderPaper();
  } catch (error) {
    if (srMlStatus) srMlStatus.textContent = `Python self-learning lỗi: ${error.message}`;
  } finally {
    if (srMlRefresh) srMlRefresh.disabled = false;
  }
}

function fmtSigned(v, suffix = '') {
  if (v == null || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const cls = n >= 0 ? 'var(--green)' : 'var(--red)';
  return `<span style="color:${cls};font-weight:800">${n >= 0 ? '+' : ''}${n.toFixed(2)}${suffix}</span>`;
}

function srFeeRate(t) {
  const n = Number(t?.feeRate ?? 0.0004);
  return Number.isFinite(n) && n >= 0 ? n : 0.0004;
}

function srEstimatedFee(t, markPrice = null) {
  if (!t || t.status === 'PENDING') return null;
  const entry = Number(t.entryPrice);
  const exit = Number(markPrice ?? t.markPrice ?? t.exitPrice ?? t.entryPrice);
  const qty = Math.abs(Number(t.originalQuantity ?? t.quantity));
  if (![entry, exit, qty].every(Number.isFinite) || entry <= 0 || exit <= 0 || qty <= 0) return null;
  return (Math.abs(entry * qty) + Math.abs(exit * qty)) * srFeeRate(t);
}

function srNetPnlValue(t) {
  const gross = Number(t?.grossPnl ?? t?.pnl);
  if (!Number.isFinite(gross)) return null;
  const fee = Number.isFinite(Number(t?.feeUsdt)) ? Number(t.feeUsdt) : Number(srEstimatedFee(t) ?? 0);
  return Number.isFinite(Number(t?.netPnl)) ? Number(t.netPnl) : gross - fee;
}

function srNetRoeValue(t) {
  if (Number.isFinite(Number(t?.netRoe))) return Number(t.netRoe);
  const net = srNetPnlValue(t);
  const margin = Number(t?.marginUsdt);
  if (net == null || !Number.isFinite(margin) || margin <= 0) return null;
  return (net / margin) * 100;
}

function formatSrNetPnl(t) {
  const net = srNetPnlValue(t);
  if (net == null) return '-';
  const gross = Number(t?.grossPnl ?? t?.pnl ?? net);
  const fee = Number.isFinite(Number(t?.feeUsdt)) ? Number(t.feeUsdt) : Number(srEstimatedFee(t) ?? 0);
  return `${fmtSigned(net)}<small style="display:block;color:var(--muted);font-size:10px;line-height:1.25">gross ${gross >= 0 ? '+' : ''}$${gross.toFixed(2)} Â· fee -$${fee.toFixed(3)}</small>`;
}

function timeAgo(ts) {
  if (!ts) return '-';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

const SR_PAPER_CANDLE_MS = 5 * 60 * 1000;

function srPaperCandleStart(ts) {
  const n = Number(ts);
  const base = Number.isFinite(n) && n > 0 ? n : Date.now();
  return Math.floor(base / SR_PAPER_CANDLE_MS) * SR_PAPER_CANDLE_MS;
}

function chip(label, cls = '') {
  return `<span class="sr-chip ${cls}">${label}</span>`;
}

function buildFactors(sig) {
  const f = sig.factors || {};
  const isShort = sig.action === 'SHORT';
  const impulseText = isShort ? 'Dump' : 'Pump';
  const pullText = isShort ? 'Bounce' : 'Drop';
  const confirmText = isShort ? 'Reject' : 'Reclaim';
  const chips = [];
  chips.push(chip(`5m vol ${Number(f.vol5mX ?? 0).toFixed(1)}x`, Number(f.vol5mX ?? 0) >= 2 ? 'ok' : 'warn'));
  chips.push(chip(`15m vol ${Number(f.vol15mX ?? 0).toFixed(1)}x`, Number(f.vol15mX ?? 0) >= 1.8 ? 'ok' : 'warn'));
  chips.push(chip(`${impulseText} 5m ${Number(f.move5mPct ?? 0).toFixed(1)}%`, Number(f.move5mPct ?? 0) >= 12 ? 'ok' : ''));
  chips.push(chip(`${impulseText} 15m ${Number(f.move15mPct ?? 0).toFixed(1)}%`, Number(f.move15mPct ?? 0) >= 14 ? 'ok' : ''));
  chips.push(chip(`${pullText} ${Number(f.drop5mPct ?? 0).toFixed(1)}%`, Number(f.drop5mPct ?? 0) >= 5 ? 'ok' : 'warn'));
  chips.push(chip(`EMA dist ${Number(f.emaZoneDistPct ?? 0).toFixed(2)}%`, Number(f.emaZoneDistPct ?? 99) <= 3 ? 'ok' : 'warn'));
  chips.push(chip(`${confirmText} ${Number(f.reclaimPct ?? 0).toFixed(1)}%`, Number(f.reclaimPct ?? 0) >= 1.8 ? 'ok' : ''));
  chips.push(chip(`Pull ${f.pullbackAge5m ?? '?'} bars`, Number(f.pullbackAge5m ?? 99) <= 4 ? 'ok' : ''));
  if (sig.entryMode === 'EMA99_LOW_SCORE') chips.push(chip('Entry EMA99', 'warn'));
  if (f.rsi5m != null) chips.push(chip(`RSI5 ${Number(f.rsi5m).toFixed(0)}`));
  if (f.rsi15m != null) chips.push(chip(`RSI15 ${Number(f.rsi15m).toFixed(0)}`));
  return chips.join('');
}

function noteNumber(text, key) {
  const re = new RegExp(`${key}=(-?\\d+(?:\\.\\d+)?)%?`, 'i');
  const m = String(text ?? '').match(re);
  return m ? Number(m[1]) : null;
}

function shakeoutPaperMarginLabel(item, fallback = 2) {
  const text = `${item?.note ?? ''} ${item?.source ?? ''}`;
  const match = text.match(/margin=\$(\d+(?:\.\d+)?)/i)
    || text.match(/test \$(\d+(?:\.\d+)?)/i)
    || text.match(/paper \$(\d+(?:\.\d+)?)/i);
  const value = match
    ? Number(match[1])
    : Number(item?.marginUsdt ?? item?.margin ?? item?.orderMarginUsdt);
  if (!Number.isFinite(value) || value <= 0) return `$${fallback}`;
  return `$${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}`;
}

function getShakeoutQuality(item = {}) {
  const note = `${item.note ?? ''} ${item.reason ?? ''} ${item.shakeoutClassReason ?? ''}`;
  const side = String(item.action ?? item.side ?? '').toUpperCase();
  const score = Number(item.score ?? 0);
  const cls = String(item.shakeoutClass ?? '').toUpperCase();
  const reason = String(item.shakeoutClassReason ?? '');
  const trap = String(item.trapRisk ?? item.riskFlags?.trapRisk ?? '').toUpperCase();
  const f = item.factors ?? {};
  const reclaim = Number(f.reclaimPct ?? noteNumber(note, side === 'SHORT' ? 'reject' : 'reclaim') ?? 0);
  const move = Number(f.move5mPct ?? noteNumber(note, side === 'SHORT' ? 'dump' : 'pump') ?? 0);
  const entryDist = Number(item.entryDistancePct ?? item.entryRawDistancePct ?? 0);
  const clamped = Boolean(item.entryWasClamped);
  const btcRegime = String(item.btcRegime ?? '').toUpperCase();
  const btcOpposed = item.btcRelation?.opposed === true;
  const weakClean = ['WEAK_RECLAIM', 'WEAK_REJECT'].includes(cls)
    && reason.includes('lacks strong confirmation');
  const storedQuality = String(item.shakeoutQuality ?? '').toUpperCase();
  if (['GOOD', 'BAD', 'TEST', 'CHASE'].includes(storedQuality)) {
    const qualityNote = String(item.note ?? '').match(/SHAKEOUT_QUALITY=([^|]+)/i)?.[1]?.trim();
    const isBadChaseGroup = /CHASE_BAD_GROUP_TEST_1/i.test(note);
    const isBtcUpShortBadGroup = /BTC_UP_SHORT_BAD_GROUP_TEST_1/i.test(note);
    return {
      tier: storedQuality,
      label: isBtcUpShortBadGroup
        ? 'BTC UP SHORT WEAK $1'
        : storedQuality === 'GOOD'
        ? 'GOOD SHAKEOUT $10'
        : storedQuality === 'BAD'
          ? 'LOW QUALITY $1'
          : storedQuality === 'CHASE'
            ? (isBadChaseGroup ? 'CHASE WEAK GROUP $1' : `CHASE CANDLE TEST ${shakeoutPaperMarginLabel(item, 2)}`)
            : 'TEST / WATCH $1',
      text: qualityNote || `server quality=${storedQuality}`,
    };
  }
  // Phân loại theo backtest (server lưu shakeoutQuality). Fallback tính client nếu trade cũ.
  const backtestQuality = String(item.shakeoutQuality ?? '').toUpperCase()
    || (['CLEAN_REJECT', 'CLEAN_RECLAIM'].includes(cls) || (cls === 'FALSE_RECLAIM' && side === 'SHORT')
      ? 'BAD'
      : (cls === 'WEAK_REJECT' && side === 'SHORT') ? 'MARGINAL' : 'GOOD');
  const reasons = [];

  // Loại XẤU theo backtest (net âm): FALSE_RECLAIM short, CLEAN_REJECT, CLEAN_RECLAIM.
  if (backtestQuality === 'BAD') reasons.push('loại xấu (backtest net âm → $1)');
  if (item.bottomReboundRisk || String(item.subtype ?? '') === 'BOTTOM_REBOUND_RISK') reasons.push('false bottom risk');
  if (trap === 'HIGH') reasons.push('trap HIGH');
  if (['FALSE_RECLAIM', 'FALSE_REJECT'].includes(cls) && ['MEDIUM', 'HIGH'].includes(trap) && reclaim < 5) {
    reasons.push(`false + confirm ${reclaim.toFixed(1)}%`);
  }
  if (reason.includes('BTC weak vs long') || reason.includes('BTC strong vs short')) reasons.push('BTC ngược chiều');
  if (reason.includes('weak/late')) reasons.push('confirm weak/late');
  if (clamped && entryDist >= 5) reasons.push('entry clamp xa');
  if (side === 'LONG' && btcRegime === 'WEAK' && !btcOpposed) reasons.push('BTC weak');
  if (side === 'SHORT' && btcRegime === 'STRONG' && !btcOpposed) reasons.push('BTC strong');

  // CLEAN_* bỏ khỏi goodClass — backtest cho thấy net âm. Reclaim/rebound LONG mới là tốt.
  const goodClass = ['STRONG_RECLAIM', 'STRONG_REJECT', 'BOTTOM_REBOUND'].includes(cls);
  const good = score >= 70
    && (trap === '' || trap === 'LOW')
    && !clamped
    && entryDist <= 3
    && reasons.length === 0
    && backtestQuality === 'GOOD'
    && (goodClass || weakClean || reclaim >= 3.5);

  if (good) {
    return {
      tier: 'GOOD',
      label: 'GOOD SHAKEOUT $10',
      text: `paper $10 · score ${score} · trap ${trap || 'LOW'} · entry ${entryDist.toFixed(1)}% · confirm ${reclaim.toFixed(1)}%`,
    };
  }
  if (reasons.length) {
    return {
      tier: 'BAD',
      label: 'LOW QUALITY $1',
      text: `paper $1 · ${reasons.slice(0, 3).join(' · ')}`,
    };
  }
  return {
    tier: 'TEST',
    label: 'TEST / WATCH $1',
    text: `paper $1 · score ${score} · trap ${trap || 'LOW'} · entry ${entryDist.toFixed(1)}% · move ${move.toFixed(1)}%`,
  };
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function btcDetailForShakeout(item = {}) {
  const rawPhase = String(
    item.btcPhase
      ?? item.btcPhaseLabel
      ?? item.btcRegimeAtEntry
      ?? item.btcRegime
      ?? item.btcTrendLabel
      ?? item.btcHealth?.phase
      ?? '',
  ).toUpperCase().replace(/\s+/g, '_');
  const gate = String(item.btcGate ?? item.realGate ?? item.autoTradeBlockReason ?? item.note ?? '').toUpperCase();
  const score = firstFiniteNumber(
    item.btcTrendScore,
    item.btcScore,
    item.btcTrend?.score,
    item.btcHealth?.score,
  );
  const pct6h = firstFiniteNumber(
    item.btcChange6hPct,
    item.btcPct6h,
    item.btcTrend?.pct6h,
    item.btcHealth?.pct6h,
    item.btc6hPct,
  );
  const regime = String(item.btcRegime ?? item.btcRegimeAtEntry ?? item.btcTrend?.regime ?? '').toUpperCase();
  const phase = rawPhase || (regime ? `BTC_${regime}` : '');
  const hasData = phase || score != null || pct6h != null || regime;
  if (!hasData) {
    return { label: 'BTC_NO_DATA', sub: 'khong co snapshot', tone: '#94a3b8', title: 'BTC detail: no data', sort: -999 };
  }

  let label = phase || 'BTC_DATA';
  if (phase.includes('UP_MID')) {
    if (regime.includes('STRONG') || (score != null && score >= 60) || (pct6h != null && pct6h >= 0.25)) label = 'UP_MID_STRONG';
    else if (regime.includes('WEAK') || gate.includes('WEAK_UP') || (score != null && score <= 55) || (pct6h != null && pct6h <= 0.10)) label = 'UP_MID_WEAK';
    else label = 'UP_MID_MID';
  } else if (phase.includes('DOWN_MID')) {
    if (regime.includes('STRONG') || (score != null && score >= 60) || (pct6h != null && pct6h <= -0.25)) label = 'DOWN_MID_STRONG';
    else if (regime.includes('WEAK') || gate.includes('WEAK_DOWN') || (score != null && score <= 55) || (pct6h != null && pct6h >= -0.10)) label = 'DOWN_MID_WEAK';
    else label = 'DOWN_MID_MID';
  } else if (phase.includes('UP_WEAK')) {
    label = 'UP_WEAK';
  } else if (phase.includes('DOWN_WEAK')) {
    label = 'DOWN_WEAK';
  } else if (phase.includes('UP_STRONG')) {
    label = 'UP_STRONG';
  } else if (phase.includes('DOWN_STRONG')) {
    label = 'DOWN_STRONG';
  }

  const scoreText = score == null ? 'score -' : `score ${score.toFixed(0)}`;
  const pctText = pct6h == null ? '6h -' : `${fmtSigned(pct6h, '%')}/6h`;
  const regimeText = regime ? regime.replace(/^BTC_/, '') : phase.replace(/^BTC_/, '') || '-';
  const isBadTone = label.includes('DOWN') || label.includes('WEAK');
  const tone = label.includes('NO_DATA') ? '#94a3b8' : isBadTone ? '#fbbf24' : '#34d399';
  return {
    label,
    sub: `${scoreText} · ${pctText}`,
    tone,
    title: `BTC detail=${label}; phase=${phase || '-'}; regime=${regimeText}; ${scoreText}; ${pctText}; gate=${gate || '-'}`,
    sort: score ?? (pct6h == null ? 0 : Math.round(pct6h * 10)),
  };
}

function shakeoutQualityBadge(item, compact = false) {
  const q = getShakeoutQuality(item);
  return `<div class="sr-quality-badge ${q.tier.toLowerCase()}" title="${escapeHtml(q.text)}">
    ${escapeHtml(q.label)}${compact ? '' : `<span>${escapeHtml(q.text)}</span>`}
  </div>`;
}

function shakeoutHighJumpRiskBadge(item, compact = false) {
  if (!item?.highJumpRisk) return '';
  const reason = String(item.highJumpRiskReason ?? 'Biên độ nến 5m quá lớn so với leverage dự kiến.');
  return `<div class="sr-jump-risk-badge" title="${escapeHtml(reason)}">
    HIGH JUMP RISK${compact ? '' : `<span>${escapeHtml(reason)} · paper ${shakeoutPaperMarginLabel(item, 10)} · 5x, không chặn</span>`}
  </div>`;
}

function getShakeoutRealGateDisplay(item = {}) {
  const stored = String(item.shakeoutRealGateLabel ?? '').toUpperCase();
  const reason = String(item.shakeoutRealGateReason ?? '');
  if (stored) {
    const isTest = stored === 'REAL_TEST';
    return {
      label: isTest ? 'REAL_TEST_OK' : stored,
      cls: stored === 'REAL_OK' ? 'ok' : stored === 'REAL_BLOCK' ? 'block' : 'test',
      text: isTest ? `cho market/test: ${reason || stored}` : (reason || stored),
    };
  }
  const score = Number(item.score ?? 0);
  const trap = String(item.trapRisk ?? item.riskFlags?.trapRisk ?? 'LOW').toUpperCase();
  const clsName = String(item.shakeoutClass ?? '').toUpperCase();
  const clsReason = String(item.shakeoutClassReason ?? '');
  const projected = getSrProjectedPnl(item).roe;
  const reasons = [];
  const warns = [];
  if (trap === 'HIGH') reasons.push('trap HIGH');
  if (clsReason.includes('BTC weak vs long') || clsReason.includes('BTC strong vs short')) reasons.push('BTC conflict');
  if (clsName === 'FALSE_RECLAIM' || clsName === 'FALSE_REJECT') warns.push(clsName.replace('_', ' '));
  if (trap === 'MEDIUM') warns.push('trap MEDIUM');
  if (score < 75) warns.push(`score ${score}<75`);
  if (Number.isFinite(projected) && projected < 10) warns.push(`tpRoe ${projected.toFixed(1)}%<10%`);
  if (reasons.length) return { label: 'REAL_BLOCK', cls: 'block', text: reasons.join(' · ') };
  if (warns.length) return { label: 'REAL_TEST_OK', cls: 'test', text: `cho market/test: ${warns.join(' · ')}` };
  return { label: 'REAL_OK', cls: 'ok', text: `score ${score} · trap ${trap}` };
}

function shakeoutRealGateBadge(item, compact = false) {
  const g = getShakeoutRealGateDisplay(item);
  const colors = {
    ok: ['#052e1a', '#34d399', '#d1fae5'],
    test: ['#422006', '#fbbf24', '#fde68a'],
    block: ['#7f1d1d', '#fb7185', '#fff'],
  }[g.cls] || ['#111827', '#38bdf8', '#e0f2fe'];
  return `<div style="margin-top:5px;padding:5px;color:${colors[2]};background:${colors[0]};border:2px solid ${colors[1]};font-size:10px;font-weight:900;line-height:1.35" title="${escapeHtml(g.text)}">
    ${escapeHtml(g.label)}${compact ? '' : `<br>${escapeHtml(g.text)}`}
  </div>`;
}

function buildTrapAlert(sig) {
  const flags = sig.riskFlags || {};
  if (sig.bottomReboundRisk || String(sig.subtype ?? '') === 'BOTTOM_REBOUND_RISK') {
    const reasons = Array.isArray(flags.bottomRiskReasons) && flags.bottomRiskReasons.length
      ? flags.bottomRiskReasons.join(' | ')
      : sig.autoTradeBlockReason || 'False-bottom risk: rebound may be distribution.';
    return `
      <div class="sr-trap-alert">
        <strong>FALSE BOTTOM / DISTRIBUTION RISK</strong>
        <span>${escapeHtml(reasons)}</span>
        <span style="margin-top:8px;font-weight:900">BLOCK PAPER + BINANCE AUTO</span>
      </div>
    `;
  }
  const risk = String(flags.trapRisk || 'LOW').toUpperCase();
  if (!['MEDIUM', 'HIGH'].includes(risk)) return '';
  const isShort = sig.action === 'SHORT';
  const title = risk === 'HIGH'
    ? `CANH BAO DO: NE ${isShort ? 'SHORT' : 'LONG'}`
    : `CANH BAO: ${isShort ? 'SHORT' : 'LONG'} CO RUI RO BAY`;
  const reasons = Array.isArray(flags.trapReasons) && flags.trapReasons.length
    ? flags.trapReasons.join(' | ')
    : 'Cau truc sau pump/dump dang yeu, tin hieu co the la bay.';
  return `
    <div class="sr-trap-alert">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(reasons)}</span>
    </div>
  `;
}

function buildEmaCompare(sig) {
  const entry = Number(sig.entry);
  const ema5 = Number(sig.ema99_5m ?? sig.ema99 ?? sig.factors?.ema99_5m);
  const ema15 = Number(sig.ema99_15m ?? sig.factors?.ema99_15m);
  const item = (label, value) => {
    const dist = Number.isFinite(entry) && entry > 0 && Number.isFinite(value) && value > 0
      ? ((entry - value) / value) * 100
      : null;
    const distText = dist == null ? '-' : `${dist >= 0 ? '+' : ''}${dist.toFixed(2)}% vs Entry`;
    const color = dist == null ? 'var(--muted)' : dist >= 0 ? 'var(--green)' : 'var(--red)';
    return `
      <div class="sr-price">
        <span>${label}</span>
        <strong>${fmtPrice(value)}</strong>
        <small style="color:${color}">${distText}</small>
      </div>
    `;
  };
  return `<div class="sr-ema-compare">${item('EMA99 5m', ema5)}${item('EMA99 15m', ema15)}</div>`;
}

function buildOrderDecision(sig) {
  const symbol = String(sig.symbol ?? '').toUpperCase();
  const side = String(sig.action ?? '').toUpperCase();
  const opposite = side === 'LONG' ? 'SHORT' : 'LONG';
  const now = Date.now();
  const currentCandle = srPaperCandleStart(now);
  const related = srPaperTrades.filter((t) =>
    String(t.symbol ?? '').toUpperCase() === symbol
    && String(t.source ?? '').startsWith('shakeout-auto'));
  const sameSide = related.filter((t) => String(t.side ?? '').toUpperCase() === side);
  const activeSame = sameSide.filter((t) => ['OPEN', 'PENDING'].includes(t.status));
  const activeOpposite = related.find((t) =>
    String(t.side ?? '').toUpperCase() === opposite
    && ['OPEN', 'PENDING'].includes(t.status));
  const latestSame = sameSide
    .slice()
    .sort((a, b) => Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0))[0];
  const trapRisk = String(sig.riskFlags?.trapRisk ?? 'LOW').toUpperCase();

  let paperTone = '#34d399';
  let paperTitle = 'PAPER: DU DIEU KIEN';
  let paperReason = 'Dang cho backend xu ly o vong scan tiep theo.';

  if (sig.stage !== 'RECLAIM_CONFIRMED') {
    paperTone = '#fbbf24';
    paperTitle = 'PAPER: CHUA VAO';
    paperReason = 'Tin hieu moi o SHAKEOUT WATCH, paper chi vao RECLAIM_CONFIRMED.';
  } else if (sig.paperTradeBlocked) {
    paperTone = '#fb7185';
    paperTitle = 'PAPER: TAM CHAN NHOM XAU';
    paperReason = sig.paperTradeBlockReason || sig.paperTradeBlockCode || 'Bi chan boi cohort gate.';
  } else if (Number(sig.score ?? 0) < 55) {
    paperTone = '#fb7185';
    paperTitle = 'PAPER: KHONG DU DIEM';
    paperReason = `Score ${sig.score ?? '-'} < 55.`;
  } else if (sig.bottomReboundRisk || sig.autoTradeBlocked
      || String(sig.subtype ?? '') === 'BOTTOM_REBOUND_RISK') {
    paperTone = '#fb7185';
    paperTitle = 'PAPER: BI BLOCK';
    paperReason = sig.autoTradeBlockReason || 'False-bottom / distribution risk.';
  } else if (activeOpposite) {
    paperTone = '#fb7185';
    paperTitle = 'PAPER: BLOCK HEDGE';
    paperReason = `Dang co ${opposite} ${activeOpposite.status} tu ${activeOpposite.source}; khong mo ${side} cung symbol.`;
  } else if (activeSame.length) {
    const scout = activeSame.find((t) => String(t.source ?? '').includes('-scout-'));
    const dynamic = activeSame.find((t) => t.btcDynamicEntry);
    const regular = activeSame.find((t) =>
      !String(t.source ?? '').includes('-scout-') && !t.btcDynamicEntry);
    paperTitle = 'PAPER: DA VAO';
    paperReason = [
      scout ? `Scout $${Number(scout.marginUsdt ?? 1).toFixed(0)} ${scout.status}` : '',
      dynamic
        ? `BTC Dynamic ${dynamic.status}${dynamic.btcDynamicLocked ? ' / entry da khoa' : ' / dang bam BTC'} @ ${fmtPrice(dynamic.entryPrice)}`
        : '',
      regular ? `${regular.variant ?? 'ORDER'} ${regular.status} @ ${fmtPrice(regular.entryPrice)}` : '',
    ].filter(Boolean).join(' | ');
  } else if (latestSame) {
    const latestCandle = srPaperCandleStart(Date.parse(latestSame.createdAt ?? 0));
    if (latestCandle === currentCandle) {
      paperTone = '#fbbf24';
      paperTitle = 'PAPER: DA PHAT NEN NAY';
      paperReason = `Da phat ${latestSame.status} luc ${new Date(latestSame.createdAt).toLocaleTimeString('vi-VN')}; se danh gia lai khi sang nen 5m moi.`;
    } else {
      paperTone = '#fbbf24';
      paperTitle = 'PAPER: CHUA TAO LENH';
      paperReason = 'Khong co lenh active; backend co the danh gia lai o vong scan hoac nen 5m tiep theo.';
    }
  }

  const realBlocked = ['MEDIUM', 'HIGH'].includes(trapRisk);
  const realTone = realBlocked ? '#fb7185' : '#94a3b8';
  const realText = realBlocked
    ? `BINANCE: KHONG VAO - trapRisk ${trapRisk} hien van bi chan cho lenh that.`
    : 'BINANCE: phu thuoc score, runtime Auto ON, vi the/open order, liquidity block va so du.';

  return `
    <div style="margin-top:9px;padding:9px 10px;border:2px solid ${paperTone};background:#111827;color:${paperTone};font-size:11px;font-weight:900;line-height:1.45">
      <div style="font-size:12px">${escapeHtml(paperTitle)}</div>
      <div style="color:#e5e7eb;font-weight:700">${escapeHtml(paperReason)}</div>
      <div style="margin-top:5px;padding-top:5px;border-top:1px solid #374151;color:${realTone}">${escapeHtml(realText)}</div>
    </div>
  `;
}

function buildCard(sig) {
  const confirmed = sig.stage === 'RECLAIM_CONFIRMED';
  const quality = getShakeoutQuality(sig);
  const isShort = sig.action === 'SHORT';
  const isBottomReboundRisk = !isShort
    && (sig.bottomReboundRisk || String(sig.subtype ?? '') === 'BOTTOM_REBOUND_RISK');
  const isBottomRebound = !isShort
    && !isBottomReboundRisk
    && (sig.bottomReboundQualified || String(sig.subtype ?? '') === 'BOTTOM_REBOUND');
  const isWeakClean = ['WEAK_RECLAIM', 'WEAK_REJECT'].includes(String(sig.shakeoutClass ?? ''))
    && String(sig.shakeoutClassReason ?? '').includes('lacks strong confirmation');
  const stageClass = isBottomReboundRisk ? 'bottom-rebound-risk'
    : isBottomRebound ? 'bottom-rebound'
    : isShort ? 'short' : (confirmed ? 'confirmed' : 'watch');
  const badgeClass = isBottomReboundRisk ? 'bottom-rebound-risk'
    : isBottomRebound ? 'bottom-rebound' : isShort ? 'short' : stageClass;
  const stageText = isBottomReboundRisk
    ? 'FALSE BOTTOM · AUTO BLOCKED'
    : isBottomRebound
    ? 'BOTTOM REBOUND · MARKET $5'
    : isShort
    ? (confirmed ? 'SHORT REJECT CONFIRMED' : 'SHORT PULLBACK WATCH')
    : (confirmed ? 'LONG RECLAIM CONFIRMED' : 'LONG SHAKEOUT WATCH');
  const detailUrl = `/?symbol=${encodeURIComponent(sig.symbol)}`;
  const changeColor = Number(sig.change24h ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';
  const classColor = isWeakClean
    ? ['rgba(15, 118, 110, .24)', '#2dd4bf', '#ccfbf1']
    : {
    red: ['#7f1d1d', '#fb7185', '#fff'],
    amber: ['#422006', '#fbbf24', '#fde68a'],
    cyan: ['#083344', '#22d3ee', '#a5f3fc'],
    pink: ['#4c0519', '#f472b6', '#fce7f3'],
    green: ['#052e1a', '#34d399', '#d1fae5'],
  }[sig.shakeoutClassColor || ''] || ['#111827', '#38bdf8', '#e0f2fe'];
  const classBadge = sig.shakeoutClass
    ? `<div class="sr-class-badge ${isWeakClean ? 'weak-clean' : ''}" style="border:${isWeakClean ? '' : `1px solid ${classColor[1]}`};background:${classColor[0]};color:${classColor[2]}">
        ${escapeHtml(sig.shakeoutClassLabel || sig.shakeoutClass)}
        <span style="font-weight:700;color:${classColor[2]};opacity:.85"> · ${escapeHtml(sig.shakeoutClassReason || '')}</span>
      </div>`
    : '';
  return `
    <article class="sr-card ${stageClass}${isWeakClean ? ' weak-clean' : ''}${sig.highJumpRisk ? ' sr-high-jump-risk' : ''} sr-quality-${quality.tier.toLowerCase()}">
      <div class="sr-top">
        <div>
          <a class="sr-symbol" href="${detailUrl}" target="_blank">${sig.symbol.replace(/USDT$/, '')}<span>USDT</span></a>
          <span class="sr-change" style="color:${changeColor}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="sr-right">
          <span class="sr-badge ${badgeClass}">${stageText}</span>
          <div class="sr-score"><strong>${sig.score ?? '-'}</strong><span class="sr-grade">${sig.grade ?? '-'}</span></div>
        </div>
      </div>

      <div class="sr-pattern">${sig.reason || ''}</div>
      <div style="margin-top:7px;display:flex;gap:7px;align-items:flex-start;flex-wrap:wrap">${srCandlePatternCell(sig)}${srMlFlagBadge(sig, false, 'legacy')}${srMlFlagBadge(sig, false, 'candle')}</div>
      ${shakeoutHighJumpRiskBadge(sig)}
      ${shakeoutQualityBadge(sig)}
      ${shakeoutRealGateBadge(sig)}
      ${classBadge}
      ${isBottomRebound ? `<div style="margin-top:8px;padding:9px;border:1px solid #22d3ee;background:#083344;color:#a5f3fc;font-weight:900">
        SONG HOI TU DAY · MARKET $5 · DCA +$10 KHI ROE ≤ -25% · NO SL<br>
        drawdown ${fmtPct(sig.factors?.bottomDeclinePct)} · rebound ${fmtPct(sig.factors?.bottomReboundPct)}
      </div>` : ''}
      ${isBottomReboundRisk ? `<div style="margin-top:8px;padding:10px;border:2px solid #fb7185;background:#7f1d1d;color:#fff;font-weight:900">
        HOI PHAN PHOI / DAY GIA · KHONG VAO LONG<br>
        drawdown ${fmtPct(sig.factors?.bottomDeclinePct)} · rebound ${fmtPct(sig.factors?.bottomReboundPct)}
      </div>` : ''}
      ${sig.btcStrongShortEma99 ? `<div style="margin-top:8px;padding:10px;border:2px solid #fbbf24;background:#422006;color:#fde68a;font-weight:900">
        BTC STRONG · SHORT CHO DUNG EMA99 5M<br>
        Khong vao MARKET · khong clamp entry ve 5%
      </div>` : ''}
      ${sig.btcIndependentShort ? `<div style="margin-top:8px;padding:10px;border:2px solid #22d3ee;background:#083344;color:#a5f3fc;font-weight:900">
        ${escapeHtml(sig.btcEntryClass)} · COIN KHONG THEO BTC<br>
        Entry theo cau truc coin · corr ${sig.btcRelation?.corr ?? '-'} · beta ${sig.btcRelation?.beta ?? '-'}
      </div>` : ''}
      ${buildTrapAlert(sig)}
      ${buildOrderDecision(sig)}

      <div class="sr-prices">
        <div class="sr-price"><span>Entry</span><strong>${fmtPrice(sig.entry)}</strong></div>
        <div class="sr-price"><span>SL</span><strong style="color:${isBottomRebound ? '#67e8f9' : 'var(--red)'}">${isBottomRebound ? 'NO SL' : isBottomReboundRisk ? 'AUTO BLOCK' : fmtPrice(sig.sl)}</strong></div>
        <div class="sr-price"><span>${isShort ? 'TP1 low' : 'TP1 high'}</span><strong style="color:var(--amber)">${fmtPrice(sig.tp1)}</strong></div>
        <div class="sr-price"><span>Runner TP</span><strong style="color:var(--green)">${fmtPrice(sig.tp)}</strong></div>
      </div>
      ${buildEmaCompare(sig)}

      <div class="sr-factors">${buildFactors(sig)}</div>
      <div style="color:var(--muted);font-size:12px;line-height:1.45">${sig.note || ''}</div>

      <div class="sr-footer">
        <span>${timeAgo(sig.scannedAt)} ago</span>
        <span>${isShort ? 'Dump expansion -> short kill -> reject' : 'Volume expansion -> shakeout -> reclaim'}</span>
      </div>
    </article>
  `;
}

function render() {
  const q = searchInput.value.trim().toUpperCase();
  const side = sideFilter.value;
  const stage = stageFilter.value;
  const minScore = Number(scoreFilter.value || 0);
  let rows = allSignals.slice();
  if (q) rows = rows.filter((s) => s.symbol.includes(q));
  if (side !== 'all') rows = rows.filter((s) => s.action === side);
  if (stage !== 'all') rows = rows.filter((s) => s.stage === stage);
  if (minScore > 0) rows = rows.filter((s) => Number(s.score ?? 0) >= minScore);

  const sort = sortSelect.value;
  rows.sort((a, b) => {
    if (sort === 'volume') return Number(b.factors?.vol5mX ?? 0) - Number(a.factors?.vol5mX ?? 0);
    if (sort === 'drop') return Number(b.factors?.drop5mPct ?? 0) - Number(a.factors?.drop5mPct ?? 0);
    if (sort === 'fresh') return Number(a.factors?.pullbackAge5m ?? 99) - Number(b.factors?.pullbackAge5m ?? 99);
    return Number(b.score ?? 0) - Number(a.score ?? 0);
  });

  confirmedCount.textContent = allSignals.filter((s) => s.stage === 'RECLAIM_CONFIRMED').length;
  watchCount.textContent = allSignals.filter((s) => s.stage !== 'RECLAIM_CONFIRMED').length;
  totalScanned.textContent = processed || '-';
  lastScan.textContent = scannedAt ? timeAgo(scannedAt) : '-';
  cachedCount.textContent = processed || 0;
  totalCount.textContent = total || 0;
  foundCount.textContent = allSignals.length;

  if (!rows.length) {
    grid.innerHTML = '<div class="empty">Chua co shakeout reclaim signal. Doi cache 5m/15m du hon hoac ha score filter.</div>';
    return;
  }
  grid.innerHTML = rows.map(buildCard).join('');
}

const srDailyStats = document.getElementById('srDailyStats');
const srVariantCompare = document.getElementById('srVariantCompare');
const srRealGateCompare = document.getElementById('srRealGateCompare');

function renderVariantCompare(vc) {
  if (!srVariantCompare) return;
  if (!Array.isArray(vc) || !vc.length) {
    srVariantCompare.innerHTML = '';
    return;
  }
  const cls = (v) => (Number(v) >= 0 ? 'sr-daily-pos' : 'sr-daily-neg');
  const sign = (v) => (Number(v) >= 0 ? '+' : '');
  const label = { MARKET: 'MARKET (vào ngay)', PENDING: 'PENDING (chờ chạm entry)' };
  const rows = vc.map((v) => `
    <tr>
      <td class="sr-daily-date">${escapeHtml(label[v.variant] ?? v.variant)}</td>
      <td>${v.total ?? 0}</td>
      <td>${v.closed ?? 0}</td>
      <td>${v.open ?? 0}${v.pending ? ` / ${v.pending} chờ` : ''}</td>
      <td class="sr-daily-pos">${v.wins ?? 0}</td>
      <td class="sr-daily-neg">${v.losses ?? 0}</td>
      <td>${v.winRate ?? 0}%</td>
      <td class="${cls(v.totalPnl)}">${sign(v.totalPnl)}$${Number(v.totalPnl ?? 0).toFixed(2)}</td>
      <td class="${cls(v.avgRoe)}">${v.avgRoe != null ? sign(v.avgRoe) + Number(v.avgRoe).toFixed(1) + '%' : '-'}</td>
    </tr>
  `).join('');
  srVariantCompare.innerHTML = `
    <div class="sr-daily-title">So sanh diem vao - MARKET vs PENDING (2 lenh / 1 tin hieu)</div>
    <table class="sr-daily-table">
      <thead>
        <tr>
          <th>Cach vao</th><th>Tong</th><th>Closed</th><th>Open/Cho</th><th>Win</th><th>Loss</th><th>WR</th><th>PnL ($)</th><th>Avg ROE</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRealGateCompare(rowsData) {
  if (!srRealGateCompare) return;
  if (!Array.isArray(rowsData) || !rowsData.length) {
    srRealGateCompare.innerHTML = '';
    return;
  }
  const cls = (v) => (Number(v) >= 0 ? 'sr-daily-pos' : 'sr-daily-neg');
  const sign = (v) => (Number(v) >= 0 ? '+' : '');
  const tone = { REAL_OK: 'color:#34d399', REAL_TEST: 'color:#fbbf24', REAL_BLOCK: 'color:#fb7185' };
  const rows = rowsData.map((v) => `
    <tr>
      <td class="sr-daily-date" style="${tone[v.label] || ''}">${escapeHtml(v.label)}</td>
      <td>${v.total ?? 0}</td>
      <td>${v.closed ?? 0}</td>
      <td>${v.open ?? 0}${v.pending ? ` / ${v.pending} chờ` : ''}</td>
      <td class="sr-daily-pos">${v.wins ?? 0}</td>
      <td class="sr-daily-neg">${v.losses ?? 0}</td>
      <td>${v.winRate ?? 0}%</td>
      <td class="${cls(v.totalPnl)}">${sign(v.totalPnl)}$${Number(v.totalPnl ?? 0).toFixed(2)}</td>
      <td class="${cls(v.avgRoe)}">${v.avgRoe != null ? sign(v.avgRoe) + Number(v.avgRoe).toFixed(1) + '%' : '-'}</td>
    </tr>
  `).join('');
  srRealGateCompare.innerHTML = `
    <div class="sr-daily-title">Phan loai danh that Binance - REAL_OK / TEST / BLOCK</div>
    <table class="sr-daily-table">
      <thead>
        <tr>
          <th>Real gate</th><th>Tong</th><th>Closed</th><th>Open/Cho</th><th>Win</th><th>Loss</th><th>WR</th><th>PnL ($)</th><th>Avg ROE</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function getShakeoutComboKey(t) {
  const stored = String(t?.shakeoutCombo ?? t?.combo ?? '').trim();
  if (stored && stored !== '-') return stored;
  const type = getShakeoutSignalType(t).toUpperCase();
  const side = String(t?.side ?? '-').toUpperCase();
  const timeframe = String(t?.signalTimeframe ?? t?.timeframe ?? t?.interval ?? '-');
  const score = Number(t?.score);
  const scoreBucket = Number.isFinite(score) ? `SCORE_${getShakeoutScoreBucket(t)}` : 'SCORE_NO_DATA';
  const btcGate = String(t?.shakeoutBtcGateLabel ?? t?.btcGateLabel ?? t?.btcPhaseLabel ?? t?.btcPhase ?? 'BTC_NO_DATA').toUpperCase();
  const realGate = String(t?.shakeoutRealGateLabel ?? t?.realGate ?? 'REAL_NO_DATA').toUpperCase();
  const quality = String(getShakeoutQuality(t).tier ?? t?.shakeoutQuality ?? 'QUALITY_UNKNOWN').toUpperCase();
  return [type, side, timeframe, btcGate, realGate, quality, scoreBucket].join(' | ');
}

function isShakeoutChaseTrade(t) {
  const quality = String(t?.shakeoutQuality ?? '').toUpperCase();
  const variant = String(t?.variant ?? '').toUpperCase();
  const tag = String(t?.tag ?? '').toUpperCase();
  const note = String(t?.note ?? '');
  return quality === 'CHASE'
    || variant === 'CHASE'
    || tag.includes('CHASE')
    || /CHASE_CANDLE_TEST/i.test(note)
    || /pending missed but candle turned/i.test(note);
}

function buildShakeoutGroupStats(trades, keyFn) {
  const map = new Map();
  for (const t of trades) {
    const key = keyFn(t);
    if (!map.has(key)) {
      map.set(key, {
        key,
        total: 0,
        open: 0,
        pending: 0,
        closed: 0,
        wins: 0,
        losses: 0,
        tpHits: 0,
        slHits: 0,
        pnl: 0,
        roeSum: 0,
      });
    }
    const row = map.get(key);
    row.total += 1;
    if (t.status === 'OPEN') row.open += 1;
    if (t.status === 'PENDING') row.pending += 1;
    if (t.status !== 'CLOSED' || t.outcome === 'INVALID') continue;
    row.closed += 1;
    const pnl = Number(srNetPnlValue(t) ?? t.pnl ?? 0);
    row.pnl += pnl;
    row.roeSum += Number(srNetRoeValue(t) ?? t.roe ?? 0);
    if (pnl > 0) row.wins += 1;
    else if (pnl < 0) row.losses += 1;
    if (['TP', 'RUNNER_TP'].includes(t.outcome)) row.tpHits += 1;
    if (t.outcome === 'SL') row.slHits += 1;
  }
  return [...map.values()].map((row) => {
    const avgRoe = row.closed ? +(row.roeSum / row.closed).toFixed(1) : null;
    const winRate = row.wins + row.losses ? +((row.wins / (row.wins + row.losses)) * 100).toFixed(1) : 0;
    return {
      ...row,
      pnl: +row.pnl.toFixed(4),
      avgRoe,
      winRate,
    };
  }).sort((a, b) =>
    b.closed - a.closed
    || Number(b.avgRoe ?? -999) - Number(a.avgRoe ?? -999)
    || b.pnl - a.pnl);
}

function renderShakeoutChaseStats(trades) {
  if (!srChaseStats) return;
  const chaseTrades = trades.filter(isShakeoutChaseTrade);
  if (!chaseTrades.length) {
    srChaseStats.innerHTML = '';
    return;
  }
  const groups = buildShakeoutGroupStats(chaseTrades, (t) => [
    getShakeoutSignalType(t).toUpperCase(),
    String(t?.side ?? '-').toUpperCase(),
    String(t?.signalTimeframe ?? t?.timeframe ?? t?.interval ?? '-'),
    `SCORE_${getShakeoutScoreBucket(t)}`,
    String(t?.shakeoutBtcGateLabel ?? t?.btcGateLabel ?? t?.btcPhaseLabel ?? t?.btcPhase ?? 'BTC_NO_DATA').toUpperCase(),
  ].join(' | ')).slice(0, 20);
  const total = buildShakeoutGroupStats(chaseTrades, () => 'ALL CHASE')[0];
  const sideRows = buildShakeoutGroupStats(chaseTrades, (t) => `CHASE ${String(t?.side ?? '-').toUpperCase()}`);
  const cls = (v) => (Number(v) >= 0 ? 'sr-daily-pos' : 'sr-daily-neg');
  const sign = (v) => (Number(v) >= 0 ? '+' : '');
  const rowHtml = (row) => `
    <tr class="${Number(row.pnl) >= 0 ? 'sr-score-good' : 'sr-score-bad'}">
      <td class="sr-daily-date" title="${escapeHtml(row.key)}">${escapeHtml(row.key)}</td>
      <td>${row.total}</td>
      <td>${row.closed}</td>
      <td>${row.open}${row.pending ? ` / ${row.pending} cho` : ''}</td>
      <td class="sr-daily-pos">${row.wins}</td>
      <td class="sr-daily-neg">${row.losses}</td>
      <td>${row.winRate}%</td>
      <td>${row.tpHits} / ${row.slHits}</td>
      <td class="${cls(row.pnl)}">${sign(row.pnl)}$${Number(row.pnl ?? 0).toFixed(2)}</td>
      <td class="${cls(row.avgRoe)}">${row.avgRoe != null ? sign(row.avgRoe) + Number(row.avgRoe).toFixed(1) + '%' : '-'}</td>
    </tr>
  `;
  srChaseStats.innerHTML = `
    <div class="sr-daily-title">Thong ke rieng lenh duoi gia / CHASE CANDLE TEST $2</div>
    <div class="sr-chase-summary">
      ${[total, ...sideRows].filter(Boolean).map((row) => `
        <div class="sr-chase-card ${Number(row.pnl) >= 0 ? 'good' : 'bad'}">
          <div>${escapeHtml(row.key)}</div>
          <strong class="${cls(row.pnl)}">${sign(row.pnl)}$${Number(row.pnl ?? 0).toFixed(2)}</strong>
          <span>${row.total} lenh · ${row.closed} closed · WR ${row.winRate}% · AvgROE ${row.avgRoe != null ? sign(row.avgRoe) + row.avgRoe + '%' : '-'}</span>
        </div>
      `).join('')}
    </div>
    <table class="sr-daily-table sr-score-stats-table sr-combo-stats-table">
      <thead>
        <tr>
          <th>Nhom chase</th><th>Tong</th><th>Closed</th><th>Open/Cho</th><th>Win</th><th>Loss</th><th>WR</th><th>TP/SL</th><th>PnL ($)</th><th>Avg ROE</th>
        </tr>
      </thead>
      <tbody>${groups.map(rowHtml).join('')}</tbody>
    </table>
  `;
}

function buildShakeoutComboStats(trades) {
  const map = new Map();
  for (const t of trades) {
    const key = getShakeoutComboKey(t);
    if (!map.has(key)) {
      map.set(key, {
        combo: key,
        total: 0,
        open: 0,
        pending: 0,
        closed: 0,
        wins: 0,
        losses: 0,
        tpHits: 0,
        slHits: 0,
        pnl: 0,
        roeSum: 0,
      });
    }
    const row = map.get(key);
    row.total += 1;
    if (t.status === 'OPEN') row.open += 1;
    if (t.status === 'PENDING') row.pending += 1;
    if (t.status !== 'CLOSED' || t.outcome === 'INVALID') continue;
    row.closed += 1;
    const pnl = Number(srNetPnlValue(t) ?? t.pnl ?? 0);
    row.pnl += pnl;
    row.roeSum += Number(srNetRoeValue(t) ?? t.roe ?? 0);
    if (pnl > 0) row.wins += 1;
    else if (pnl < 0) row.losses += 1;
    if (['TP', 'RUNNER_TP'].includes(t.outcome)) row.tpHits += 1;
    if (t.outcome === 'SL') row.slHits += 1;
  }
  return [...map.values()]
    .filter((row) => row.closed > 0 || row.open > 0 || row.pending > 0)
    .map((row) => {
      const avgRoe = row.closed ? +(row.roeSum / row.closed).toFixed(1) : null;
      const wr = row.wins + row.losses ? +((row.wins / (row.wins + row.losses)) * 100).toFixed(1) : 0;
      let verdict = 'NEUTRAL';
      if (row.closed >= 8 && wr >= 80 && Number(avgRoe ?? 0) >= 3) verdict = 'STRONG';
      else if (row.closed >= 5 && row.pnl > 0 && Number(avgRoe ?? 0) >= 1) verdict = 'GOOD';
      else if (row.closed >= 5 && (row.pnl < 0 || Number(avgRoe ?? 0) < 0)) verdict = 'BAD';
      return {
        ...row,
        winRate: wr,
        pnl: +row.pnl.toFixed(4),
        avgRoe,
        verdict,
      };
    })
    .sort((a, b) => {
      const rank = { STRONG: 0, GOOD: 1, NEUTRAL: 2, BAD: 3 };
      return (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9)
        || Number(b.closed >= 8) - Number(a.closed >= 8)
        || Number(b.avgRoe ?? -999) - Number(a.avgRoe ?? -999)
        || b.pnl - a.pnl
        || b.closed - a.closed;
    });
}

function renderShakeoutComboStats(trades) {
  if (!srComboStats) return;
  const rowsData = buildShakeoutComboStats(trades).slice(0, 40);
  if (!rowsData.length) {
    srComboStats.innerHTML = '';
    return;
  }
  const cls = (v) => (Number(v) >= 0 ? 'sr-daily-pos' : 'sr-daily-neg');
  const sign = (v) => (Number(v) >= 0 ? '+' : '');
  const rowClass = (v) => (
    v.verdict === 'STRONG' || v.verdict === 'GOOD'
      ? 'sr-score-good'
      : v.verdict === 'BAD'
        ? 'sr-score-bad'
        : 'sr-score-watch'
  );
  const rows = rowsData.map((row) => `
    <tr class="${rowClass(row)}">
      <td class="sr-daily-date" title="${escapeHtml(row.combo)}">${escapeHtml(row.combo)}</td>
      <td>${row.total}</td>
      <td>${row.closed}</td>
      <td>${row.open}${row.pending ? ` / ${row.pending} cho` : ''}</td>
      <td class="sr-daily-pos">${row.wins}</td>
      <td class="sr-daily-neg">${row.losses}</td>
      <td>${row.winRate}%</td>
      <td>${row.tpHits} / ${row.slHits}</td>
      <td class="${cls(row.pnl)}">${sign(row.pnl)}$${Number(row.pnl ?? 0).toFixed(2)}</td>
      <td class="${cls(row.avgRoe)}">${row.avgRoe != null ? sign(row.avgRoe) + Number(row.avgRoe).toFixed(1) + '%' : '-'}</td>
      <td><span class="sr-combo-verdict sr-combo-${row.verdict.toLowerCase()}">${escapeHtml(row.verdict)}</span></td>
    </tr>
  `).join('');
  srComboStats.innerHTML = `
    <div class="sr-daily-title">Thong ke combo Shakeout - theo filter hien tai</div>
    <table class="sr-daily-table sr-score-stats-table sr-combo-stats-table">
      <thead>
        <tr>
          <th>Combo</th><th>Tong</th><th>Closed</th><th>Open/Cho</th><th>Win</th><th>Loss</th><th>WR</th><th>TP/SL</th><th>PnL ($)</th><th>Avg ROE</th><th>Danh gia</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderDailyStats(daily) {
  if (!srDailyStats) return;
  if (!Array.isArray(daily) || !daily.length) {
    srDailyStats.innerHTML = '';
    return;
  }
  const totPnl = daily.reduce((s, d) => s + Number(d.netPnl ?? d.totalPnl ?? 0), 0);
  const cls = (v) => (Number(v) >= 0 ? 'sr-daily-pos' : 'sr-daily-neg');
  const sign = (v) => (Number(v) >= 0 ? '+' : '');
  const rows = daily.map((d) => `
    <tr>
      <td class="sr-daily-date">${escapeHtml(d.date)}</td>
      <td>${d.orders ?? 0}</td>
      <td class="sr-daily-pos">${d.wins ?? 0}</td>
      <td class="sr-daily-neg">${d.losses ?? 0}</td>
      <td>${d.tpHits ?? 0} / ${d.slHits ?? 0}</td>
      <td>${d.winRate ?? 0}%</td>
      <td class="${cls(d.netPnl ?? d.totalPnl)}">
        ${sign(d.netPnl ?? d.totalPnl)}$${Number(d.netPnl ?? d.totalPnl ?? 0).toFixed(2)}
        ${Number(d.feeUsdt ?? 0) > 0
          ? `<small style="display:block;color:var(--muted)">gross ${sign(d.grossPnl ?? d.totalPnl)}$${Number(d.grossPnl ?? d.totalPnl ?? 0).toFixed(2)} - fee $${Number(d.feeUsdt ?? 0).toFixed(2)}</small>`
          : ''}
        ${Number(d.openPartialRealizedPnl ?? 0) !== 0
          ? `<small style="display:block;color:#67e8f9">+$${Number(d.openPartialRealizedPnl).toFixed(2)} đã chốt từ lệnh mở</small>`
          : ''}
      </td>
      <td class="${cls(d.totalNetRoe ?? d.totalRoe)}">${sign(d.totalNetRoe ?? d.totalRoe)}${Number(d.totalNetRoe ?? d.totalRoe ?? 0).toFixed(0)}%</td>
    </tr>
  `).join('');
  srDailyStats.innerHTML = `
    <div class="sr-daily-title">Thong ke theo ngay - net PnL sau phi <span class="${cls(totPnl)}">${sign(totPnl)}$${totPnl.toFixed(2)}</span></div>
    <table class="sr-daily-table">
      <thead>
        <tr>
          <th>Ngay</th><th>Lenh</th><th>Win</th><th>Loss</th><th>TP/SL</th><th>WR</th><th>PnL ($)</th><th>ROE</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildSrPaperStats(trades) {
  const validClosed = trades.filter((t) => t.status === 'CLOSED' && t.outcome !== 'INVALID');
  const open = trades.filter((t) => t.status === 'OPEN');
  const pending = trades.filter((t) => t.status === 'PENDING');
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const wins = validClosed.filter((t) => Number(srNetPnlValue(t) ?? t.pnl ?? 0) > 0).length;
  const livePnl = trades
    .filter((t) => t.status === 'OPEN' || (t.status === 'CLOSED' && t.outcome !== 'INVALID'))
    .reduce((s, t) => s + Number(srNetPnlValue(t) ?? t.pnl ?? 0), 0);
  const grossPnl = trades
    .filter((t) => t.status === 'OPEN' || (t.status === 'CLOSED' && t.outcome !== 'INVALID'))
    .reduce((s, t) => s + Number(t.grossPnl ?? t.pnl ?? 0), 0);
  const feeUsdt = trades
    .filter((t) => t.status === 'OPEN' || (t.status === 'CLOSED' && t.outcome !== 'INVALID'))
    .reduce((s, t) => s + Number(t.feeUsdt ?? srEstimatedFee(t) ?? 0), 0);
  const liveRoe = trades
    .filter((t) => t.status === 'OPEN' || (t.status === 'CLOSED' && t.outcome !== 'INVALID'))
    .reduce((s, t) => s + Number(srNetRoeValue(t) ?? t.roe ?? 0), 0);
  const tpHits = validClosed.filter((t) => ['TP', 'RUNNER_TP'].includes(t.outcome)).length;
  const slHits = validClosed.filter((t) => t.outcome === 'SL').length;
  return {
    total: trades.length,
    open: open.length,
    pending: pending.length,
    closed: closed.length,
    invalid: closed.filter((t) => t.outcome === 'INVALID').length,
    cancelled: trades.filter((t) => t.status === 'CANCELLED').length,
    expired: trades.filter((t) => t.status === 'EXPIRED').length,
    wins,
    losses: validClosed.length - wins,
    tpHits,
    slHits,
    livePnl: +livePnl.toFixed(4),
    grossPnl: +grossPnl.toFixed(4),
    feeUsdt: +feeUsdt.toFixed(4),
    liveRoe: +liveRoe.toFixed(2),
    avgRoe: validClosed.length ? +(validClosed.reduce((s, t) => s + Number(srNetRoeValue(t) ?? t.roe ?? 0), 0) / validClosed.length).toFixed(1) : null,
  };
}

function buildSrPaperCompare(trades, key, labels) {
  return labels.map((label) => {
    const all = trades.filter((t) => key === 'variant'
      ? String(t.variant ?? '') === label
      : String(t.shakeoutRealGateLabel ?? 'REAL_TEST') === label);
    const closed = all.filter((t) => t.status === 'CLOSED' && t.outcome !== 'INVALID');
    const liveRows = all.filter((t) => t.status === 'OPEN' || (t.status === 'CLOSED' && t.outcome !== 'INVALID'));
    const wins = closed.filter((t) => Number(srNetPnlValue(t) ?? t.pnl ?? 0) > 0).length;
    const totalPnl = liveRows.reduce((s, t) => s + Number(srNetPnlValue(t) ?? t.pnl ?? 0), 0);
    const totalRoe = liveRows.reduce((s, t) => s + Number(srNetRoeValue(t) ?? t.roe ?? 0), 0);
    return {
      [key]: label,
      label,
      total: all.length,
      open: all.filter((t) => t.status === 'OPEN').length,
      pending: all.filter((t) => t.status === 'PENDING').length,
      closed: closed.length,
      wins,
      losses: closed.length - wins,
      winRate: closed.length ? +((wins / closed.length) * 100).toFixed(1) : 0,
      totalPnl: +totalPnl.toFixed(4),
      totalRoe: +totalRoe.toFixed(2),
      avgRoe: liveRows.length ? +(totalRoe / liveRows.length).toFixed(1) : null,
    };
  });
}

function buildSrDailyStats(trades) {
  const map = new Map();
  const getRow = (date) => {
    if (!map.has(date)) {
      map.set(date, {
        date,
        orders: 0,
        wins: 0,
        losses: 0,
        tpHits: 0,
        slHits: 0,
        winRate: 0,
        totalPnl: 0,
        grossPnl: 0,
        feeUsdt: 0,
        netPnl: 0,
        totalRoe: 0,
        totalNetRoe: 0,
        open: 0,
        pending: 0,
      });
    }
    return map.get(date);
  };
  for (const t of trades) {
    const date = paperTradeDay(t);
    if (!date) continue;
    const row = getRow(date);
    if (t.status === 'PENDING') {
      row.pending += 1;
      continue;
    }
    if (t.status === 'OPEN') {
      row.open += 1;
      const gross = Number(t.grossPnl ?? t.pnl ?? 0);
      const fee = Number(t.feeUsdt ?? srEstimatedFee(t) ?? 0);
      const net = Number(srNetPnlValue(t) ?? t.pnl ?? 0);
      row.grossPnl += gross;
      row.feeUsdt += fee;
      row.netPnl += net;
      row.totalPnl += net;
      row.totalRoe += Number(t.roe ?? 0);
      row.totalNetRoe += Number(srNetRoeValue(t) ?? t.roe ?? 0);
      continue;
    }
    if (t.status !== 'CLOSED' || t.outcome === 'INVALID') continue;
    row.orders += 1;
    const gross = Number(t.grossPnl ?? t.pnl ?? 0);
    const fee = Number(t.feeUsdt ?? srEstimatedFee(t) ?? 0);
    const pnl = Number(srNetPnlValue(t) ?? t.pnl ?? 0);
    row.grossPnl += gross;
    row.feeUsdt += fee;
    row.netPnl += pnl;
    row.totalPnl += pnl;
    row.totalRoe += Number(t.roe ?? 0);
    row.totalNetRoe += Number(srNetRoeValue(t) ?? t.roe ?? 0);
    if (pnl > 0) row.wins += 1;
    else row.losses += 1;
    if (['TP', 'RUNNER_TP'].includes(t.outcome)) row.tpHits += 1;
    if (t.outcome === 'SL') row.slHits += 1;
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      winRate: row.orders ? +((row.wins / row.orders) * 100).toFixed(1) : 0,
      totalPnl: +row.totalPnl.toFixed(4),
      grossPnl: +row.grossPnl.toFixed(4),
      feeUsdt: +row.feeUsdt.toFixed(4),
      netPnl: +row.netPnl.toFixed(4),
      totalRoe: +row.totalRoe.toFixed(2),
      totalNetRoe: +row.totalNetRoe.toFixed(2),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function getShakeoutScoreBucket(t) {
  const score = Number(t?.score ?? 0);
  if (score >= 90) return '90+';
  if (score >= 85) return '85-89';
  if (score >= 80) return '80-84';
  if (score >= 75) return '75-79';
  if (score >= 70) return '70-74';
  if (score >= 65) return '65-69';
  if (score >= 60) return '60-64';
  if (score >= 55) return '55-59';
  return '<55';
}

function getShakeoutSignalType(t) {
  return String(t?.signalType || t?.shakeoutClassLabel || t?.shakeoutClass || 'UNKNOWN');
}

function getLatestSrPaperDays(trades, count = 5) {
  return [...new Set(trades.map(paperTradeDay).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))]
    .sort()
    .slice(-count);
}

function buildSrSignalScoreStats(trades) {
  const map = new Map();
  for (const t of trades) {
    const key = [getShakeoutSignalType(t), String(t.side ?? '-'), getShakeoutScoreBucket(t)].join('|');
    if (!map.has(key)) {
      map.set(key, {
        signalType: getShakeoutSignalType(t),
        side: String(t.side ?? '-'),
        scoreBucket: getShakeoutScoreBucket(t),
        total: 0,
        closed: 0,
        open: 0,
        pending: 0,
        wins: 0,
        losses: 0,
        tpHits: 0,
        slHits: 0,
        pnl: 0,
        roeSum: 0,
      });
    }
    const row = map.get(key);
    row.total += 1;
    if (t.status === 'OPEN') row.open += 1;
    if (t.status === 'PENDING') row.pending += 1;
    if (t.status !== 'CLOSED' || t.outcome === 'INVALID') continue;
    row.closed += 1;
    const pnl = Number(srNetPnlValue(t) ?? t.pnl ?? 0);
    row.pnl += pnl;
    row.roeSum += Number(srNetRoeValue(t) ?? t.roe ?? 0);
    if (pnl > 0) row.wins += 1;
    else if (pnl < 0) row.losses += 1;
    if (['TP', 'RUNNER_TP'].includes(t.outcome)) row.tpHits += 1;
    if (t.outcome === 'SL') row.slHits += 1;
  }
  const bucketOrder = ['<55', '55-59', '60-64', '65-69', '70-74', '75-79', '80-84', '85-89', '90+'];
  return [...map.values()]
    .filter((row) => row.closed > 0 || row.open > 0 || row.pending > 0)
    .map((row) => ({
      ...row,
      winRate: row.wins + row.losses ? +((row.wins / (row.wins + row.losses)) * 100).toFixed(1) : 0,
      pnl: +row.pnl.toFixed(4),
      avgRoe: row.closed ? +(row.roeSum / row.closed).toFixed(1) : null,
    }))
    .sort((a, b) =>
      a.signalType.localeCompare(b.signalType)
      || a.side.localeCompare(b.side)
      || bucketOrder.indexOf(a.scoreBucket) - bucketOrder.indexOf(b.scoreBucket));
}

function renderSignalScoreStats(trades) {
  if (!srSignalScoreStats) return;
  const latestDays = getLatestSrPaperDays(trades, 5);
  const scoped = srDayFilter === 'all'
    ? trades.filter((t) => latestDays.includes(paperTradeDay(t)))
    : trades;
  const rowsData = buildSrSignalScoreStats(scoped);
  if (!rowsData.length) {
    srSignalScoreStats.innerHTML = '';
    return;
  }
  const cls = (v) => (Number(v) >= 0 ? 'sr-daily-pos' : 'sr-daily-neg');
  const sign = (v) => (Number(v) >= 0 ? '+' : '');
  const qualityClass = (row) => {
    if (row.closed < 3) return 'sr-score-watch';
    if (row.pnl > 0 && row.winRate >= 55) return 'sr-score-good';
    if (row.pnl < 0 || row.winRate < 45) return 'sr-score-bad';
    return 'sr-score-watch';
  };
  const rows = rowsData.map((row) => `
    <tr class="${qualityClass(row)}">
      <td class="sr-daily-date">${escapeHtml(row.signalType)}</td>
      <td class="${row.side === 'LONG' ? 'sr-paper-long' : row.side === 'SHORT' ? 'sr-paper-short' : ''}">${escapeHtml(row.side)}</td>
      <td>${escapeHtml(row.scoreBucket)}</td>
      <td>${row.total}</td>
      <td>${row.closed}</td>
      <td>${row.open}${row.pending ? ` / ${row.pending} cho` : ''}</td>
      <td class="sr-daily-pos">${row.wins}</td>
      <td class="sr-daily-neg">${row.losses}</td>
      <td>${row.winRate}%</td>
      <td>${row.tpHits} / ${row.slHits}</td>
      <td class="${cls(row.pnl)}">${sign(row.pnl)}$${Number(row.pnl ?? 0).toFixed(2)}</td>
      <td class="${cls(row.avgRoe)}">${row.avgRoe != null ? sign(row.avgRoe) + Number(row.avgRoe).toFixed(1) + '%' : '-'}</td>
    </tr>
  `).join('');
  const scopeText = srDayFilter === 'all'
    ? `5 ngay gan nhat UTC (${latestDays.join(', ') || '-'})`
    : `ngay ${srDayFilter}`;
  srSignalScoreStats.innerHTML = `
    <div class="sr-daily-title">Thong ke signal type x side x score bucket - ${escapeHtml(scopeText)}</div>
    <table class="sr-daily-table sr-score-stats-table">
      <thead>
        <tr>
          <th>Signal type</th><th>Side</th><th>Score</th><th>Tong</th><th>Closed</th><th>Open/Cho</th><th>Win</th><th>Loss</th><th>WR</th><th>TP/SL</th><th>PnL ($)</th><th>Avg ROE</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderShakeoutStage2Stats(trades) {
  if (!srStage2Stats) return;
  const twoLayerTrades = trades.filter((trade) => srStage2Gate(trade).twoLayer);
  const summarize = (all) => {
    const closed = all.filter((trade) => trade.status === 'CLOSED' && trade.outcome !== 'INVALID');
    const wins = closed.filter((trade) => Number(srNetPnlValue(trade) ?? 0) > 0).length;
    const pnlRows = all.filter((trade) =>
      trade.status === 'OPEN' || (trade.status === 'CLOSED' && trade.outcome !== 'INVALID'));
    const pnl = pnlRows.reduce((sum, trade) => sum + Number(srNetPnlValue(trade) ?? 0), 0);
    const avgRoe = closed.length
      ? closed.reduce((sum, trade) => sum + Number(srNetRoeValue(trade) ?? 0), 0) / closed.length
      : null;
    return {
      total: all.length,
      captured: all.filter((trade) => Boolean(trade.shakeoutStage2AuditCaptured)).length,
      open: all.filter((trade) => trade.status === 'OPEN').length,
      pending: all.filter((trade) => trade.status === 'PENDING').length,
      closed: closed.length,
      wins,
      losses: closed.length - wins,
      winRate: closed.length ? wins / closed.length * 100 : null,
      pnl,
      avgRoe,
    };
  };
  const tiers = ['WATCH_PLUS', 'WATCH', 'RISK'];
  const rows = tiers.map((tier) => {
    const all = twoLayerTrades.filter((trade) => srStage2Gate(trade).tier === tier);
    return {
      tier,
      ...summarize(all),
    };
  });

  const detailMap = new Map();
  for (const trade of twoLayerTrades) {
    const gate = srStage2Gate(trade);
    const key = [
      gate.layer1Tier,
      gate.setup,
      gate.variant,
      gate.fillQuality,
      gate.tier,
    ].join('|');
    const group = detailMap.get(key) ?? {
      layer1Tier: gate.layer1Tier,
      setup: gate.setup,
      variant: gate.variant,
      fillQuality: gate.fillQuality,
      tier: gate.tier,
      trades: [],
    };
    group.trades.push(trade);
    detailMap.set(key, group);
  }
  const detailRows = [...detailMap.values()]
    .map((group) => ({ ...group, ...summarize(group.trades) }))
    .sort((a, b) => b.total - a.total
      || String(a.layer1Tier).localeCompare(String(b.layer1Tier))
      || String(a.setup).localeCompare(String(b.setup))
      || String(a.variant).localeCompare(String(b.variant))
      || String(a.fillQuality).localeCompare(String(b.fillQuality)));

  const auditGroups = [
    {
      flag: 'AUDIT_CLEAN',
      trades: twoLayerTrades.filter((trade) =>
        trade.shakeoutStage2AuditCaptured && srStage2Gate(trade).flags.length === 0),
    },
    {
      flag: 'AUDIT_NOT_CAPTURED',
      trades: twoLayerTrades.filter((trade) => !trade.shakeoutStage2AuditCaptured),
    },
    ...['DUPLICATE_ACTIVE', 'BTC_CANDLE_CONFLICT', 'STALE_FILL', 'DRIFT_RISK'].map((flag) => ({
      flag,
      trades: twoLayerTrades.filter((trade) => srStage2Gate(trade).flags.includes(flag)),
    })),
  ].map((group) => ({ ...group, ...summarize(group.trades) }));

  const colors = { WATCH_PLUS: '#34d399', WATCH: '#fbbf24', RISK: '#fb7185' };
  const metricCells = (row) => `
    <td>${row.total}</td>
    <td>${row.open}/${row.pending}</td>
    <td>${row.closed}</td>
    <td>${row.wins}/${row.losses}</td>
    <td>${row.winRate == null ? '-' : `${row.winRate.toFixed(1)}%`}</td>
    <td style="color:${row.pnl >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:800">${row.pnl >= 0 ? '+' : ''}$${row.pnl.toFixed(2)}</td>
    <td style="color:${row.avgRoe == null ? 'var(--muted)' : row.avgRoe >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:800">${row.avgRoe == null ? '-' : `${row.avgRoe >= 0 ? '+' : ''}${row.avgRoe.toFixed(1)}%`}</td>`;
  srStage2Stats.innerHTML = `
    <div class="sr-daily-title">2 lớp observe-only · L1 Side × BTC → L2 setup + variant + fill · flags chỉ audit</div>
    <table class="sr-daily-table">
      <thead><tr><th>Nhãn L2</th><th>Tổng</th><th>Audit live</th><th>Open/Chờ</th><th>Closed</th><th>W/L</th><th>WR</th><th>Net PnL</th><th>Avg ROE</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td style="color:${colors[row.tier]};font-weight:900">${row.tier === 'WATCH_PLUS' ? 'WATCH+' : row.tier}</td>
          <td>${row.total}</td>
          <td>${row.captured}</td>
          <td>${row.open}/${row.pending}</td>
          <td>${row.closed}</td>
          <td>${row.wins}/${row.losses}</td>
          <td>${row.winRate == null ? '-' : `${row.winRate.toFixed(1)}%`}</td>
          <td style="color:${row.pnl >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:800">${row.pnl >= 0 ? '+' : ''}$${row.pnl.toFixed(2)}</td>
          <td style="color:${row.avgRoe == null ? 'var(--muted)' : row.avgRoe >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:800">${row.avgRoe == null ? '-' : `${row.avgRoe >= 0 ? '+' : ''}${row.avgRoe.toFixed(1)}%`}</td>
        </tr>`).join('')}</tbody>
    </table>
    <div style="margin-top:5px;color:#94a3b8;font-size:10px">${twoLayerTrades.length}/${trades.length} lệnh có snapshot L1 Side × BTC. Duplicate/stale/conflict/drift chỉ hiển thị ở dòng AUDIT; không được tự nâng hoặc hạ nhãn.</div>
    <div class="sr-daily-title" style="margin-top:12px">Chi tiết từng loại L1 × setup × variant × chất lượng fill</div>
    <table class="sr-daily-table">
      <thead><tr><th>L1</th><th>Setup</th><th>Variant</th><th>Fill</th><th>Nhãn L2</th><th>Tổng</th><th>Open/Chờ</th><th>Closed</th><th>W/L</th><th>WR</th><th>Net PnL</th><th>Avg ROE</th></tr></thead>
      <tbody>${detailRows.length ? detailRows.map((row) => `
        <tr>
          <td>${escapeHtml(row.layer1Tier)}</td>
          <td>${escapeHtml(row.setup)}</td>
          <td>${escapeHtml(row.variant)}</td>
          <td>${escapeHtml(row.fillQuality)}</td>
          <td style="color:${colors[row.tier]};font-weight:900">${row.tier === 'WATCH_PLUS' ? 'WATCH+' : escapeHtml(row.tier)}</td>
          ${metricCells(row)}
        </tr>`).join('') : '<tr><td colspan="12" style="text-align:center;color:var(--muted)">Chưa có lệnh đủ snapshot hai lớp.</td></tr>'}</tbody>
    </table>
    <div class="sr-daily-title" style="margin-top:12px">Thống kê riêng từng cờ audit</div>
    <table class="sr-daily-table">
      <thead><tr><th>Cờ audit</th><th>Tổng</th><th>Open/Chờ</th><th>Closed</th><th>W/L</th><th>WR</th><th>Net PnL</th><th>Avg ROE</th></tr></thead>
      <tbody>${auditGroups.map((row) => `
        <tr>
          <td style="font-weight:900">${escapeHtml(row.flag)}</td>
          ${metricCells(row)}
        </tr>`).join('')}</tbody>
    </table>
    <div style="margin-top:5px;color:#94a3b8;font-size:10px">Một lệnh có thể xuất hiện trong nhiều dòng cờ audit; bảng audit không dùng để quyết định nhãn.</div>
  `;
}

function getSrFilteredTrades(trades = srPaperTrades) {
  return trades.filter((t) =>
    (srClassFilter === 'all' || String(t.shakeoutClass || 'UNKNOWN') === srClassFilter)
    && (srSideFilter === 'all' || t.side === srSideFilter)
    && (srDayFilter === 'all' || paperTradeDay(t) === srDayFilter)
    && (srStage2Filter === 'all'
      || (srStage2Gate(t).twoLayer && srStage2Gate(t).tier === srStage2Filter)));
}

function renderSrPaperComputedStats(filtered) {
  const stats = buildSrPaperStats(filtered);
  const validClosed = Math.max(0, Number(stats.closed ?? 0) - Number(stats.invalid ?? 0));
  const winRate = validClosed > 0 ? Math.round(Number(stats.wins ?? 0) / validClosed * 100) : null;
  const filterText = [
    srDayFilter !== 'all' ? `ngày ${srDayFilter}` : '',
    srClassFilter !== 'all' ? `loại ${srClassFilter}` : '',
    srSideFilter !== 'all' ? srSideFilter : '',
    srStage2Filter !== 'all' ? `Stage 2 ${srStage2Filter}` : '',
  ].filter(Boolean).join(' · ');
  const liveText = `live PnL ${stats.livePnl >= 0 ? '+' : ''}$${Number(stats.livePnl ?? 0).toFixed(2)}`
    + ` · live ROE ${stats.liveRoe >= 0 ? '+' : ''}${Number(stats.liveRoe ?? 0).toFixed(1)}%`;
  srPaperSummary.textContent = `${filterText ? `${filterText} | ` : ''}${stats.open ?? 0} open - ${stats.pending ?? 0} pending - ${stats.closed ?? 0} closed`
    + (stats.expired ? ` - ${stats.expired} expired` : '')
    + (stats.cancelled ? ` - ${stats.cancelled} cancelled` : '')
    + (stats.invalid ? ` - ${stats.invalid} invalid` : '')
    + (winRate != null ? ` - WR ${winRate}% - avg ROE ${stats.avgRoe ?? '-'}%` : ' - auto confirmed >=60')
    + ` - ${liveText}`;
  renderVariantCompare(buildSrPaperCompare(filtered, 'variant', ['MARKET', 'PENDING']));
  renderRealGateCompare(buildSrPaperCompare(filtered, 'realGate', ['REAL_OK', 'REAL_TEST', 'REAL_BLOCK']));
  renderShakeoutChaseStats(filtered);
  renderShakeoutStage2Stats(filtered);
  renderShakeoutComboStats(filtered);
  renderSignalScoreStats(filtered);
  renderDailyStats(buildSrDailyStats(filtered));
}

function srPaperSortValue(t, key) {
  switch (key) {
    case 'variant': return String(t.variant ?? '');
    case 'pythonLegacy': return srPythonModelRank(getSrMlFlag(t, 'legacy'));
    case 'pythonCandle': return srPythonModelRank(getSrMlFlag(t, 'candle'));
    case 'sideCandle': return srSideCandleGate(t).rank;
    case 'stage2': return srStage2Gate(t).rank;
    case 'symbol': return String(t.symbol ?? '');
    case 'side': return String(t.side ?? '');
    case 'entry': return Number(t.entryPrice);
    case 'sl': return t.sl == null ? null : Number(t.sl);
    case 'tp': return t.tp == null ? null : Number(t.tp);
    case 'projectedPnl': return getSrProjectedPnl(t).roe;
    case 'btcDetail': return btcDetailForShakeout(t).sort;
    case 'mark': return Number(t.markPrice ?? t.exitPrice);
    case 'pnl': return srNetPnlValue(t);
    case 'roe': return srNetRoeValue(t);
    case 'score': return t.score == null ? null : Number(t.score);
    case 'source': return String(t.source ?? '');
    case 'time': return Date.parse(t.createdAt ?? '') || 0;
    case 'status': {
      const rank = { OPEN: 0, PENDING: 1, CLOSED: 2 };
      return rank[t.status] ?? 9;
    }
    default: return '';
  }
}

function srPythonModelRank(flag) {
  const value = String(flag?.label ?? flag?.flag ?? flag?.tier ?? '').toUpperCase();
  if (value.includes('GOOD') || value.includes('VERIFIED')) return 4;
  if (value.includes('WATCH')) return 3;
  if (value.includes('RISK')) return 2;
  if (value.includes('NO OOS')) return 1;
  return 0;
}

function getSrProjectedPnl(t) {
  const entry = Number(t.entryPrice ?? t.entry ?? t.markPrice);
  const tp = Number(t.tp);
  const leverage = Number(t.leverage);
  const margin = Number(t.marginUsdt);
  if (![entry, tp, leverage, margin].every(Number.isFinite) || entry <= 0 || leverage <= 0 || margin <= 0) {
    return { pnl: null, roe: null };
  }
  const sideMult = t.side === 'SHORT' ? -1 : 1;
  if (t.partialTpTaken) {
    const quantity = Number(t.quantity);
    const realizedPnl = Number(t.realizedPnl ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return { pnl: null, roe: null };
    const pnl = realizedPnl + (tp - entry) * quantity * sideMult;
    return { pnl, roe: pnl / margin * 100 };
  }
  const roe = ((tp - entry) / entry) * leverage * 100 * sideMult;
  return {
    roe,
    pnl: margin * roe / 100,
  };
}

function compareSrValues(a, b, dir) {
  const aMissing = a == null || (typeof a === 'number' && Number.isNaN(a));
  const bMissing = b == null || (typeof b === 'number' && Number.isNaN(b));
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;   // null luôn xuống cuối
  if (bMissing) return -1;
  const r = (typeof a === 'string' || typeof b === 'string')
    ? String(a).localeCompare(String(b), 'en')
    : a - b;
  return dir === 'asc' ? r : -r;
}

function sortSrPaperTrades(trades) {
  const { key, dir } = srPaperSort;
  return trades.slice().sort((a, b) => {
    const r = compareSrValues(srPaperSortValue(a, key), srPaperSortValue(b, key), dir);
    if (r !== 0) return r;
    // tie-break: lệnh mới nhất trước
    return Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0);
  });
}

function updateSrSortHeaders() {
  document.querySelectorAll('.sr-sort').forEach((th) => {
    const active = th.dataset.sort === srPaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sr-sort-mark');
    if (mark) mark.textContent = active ? (srPaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

document.querySelectorAll('.sr-sort').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (!key) return;
    if (srPaperSort.key === key) {
      srPaperSort.dir = srPaperSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      // số/giá mặc định desc, chữ mặc định asc
      srPaperSort = { key, dir: ['symbol', 'side', 'variant', 'source', 'status', 'btcDetail', 'stage2'].includes(key) ? 'asc' : 'desc' };
    }
    renderPaperTrades({ trades: srPaperTrades, summary: srPaperLastSummary, daily: srPaperLastDaily, variantCompare: srPaperLastVariant, realGateCompare: srPaperLastRealGate });
  });
});

let srPaperLastSummary = {};
let srPaperLastDaily = [];
let srPaperLastVariant = [];
let srPaperLastRealGate = [];

function renderPaperTrades(data) {
  const trades = Array.isArray(data?.trades) ? data.trades : [];
  srPaperTrades = trades;
  if (allSignals.length) render();
  srPaperLastSummary = data?.summary ?? {};
  srPaperLastDaily = Array.isArray(data?.daily) ? data.daily : [];
  srPaperLastVariant = Array.isArray(data?.variantCompare) ? data.variantCompare : [];
  srPaperLastRealGate = Array.isArray(data?.realGateCompare) ? data.realGateCompare : [];
  populateSrClassOptions(trades);
  populateSrDayOptions(trades);
  const filtered = getSrFilteredTrades(trades);
  renderSrPaperComputedStats(filtered);
  const rows = sortSrPaperTrades(filtered);
  updateSrSortHeaders();

  if (!rows.length) {
    srPaperBody.innerHTML = '<tr><td colspan="22" style="text-align:center;color:var(--muted);padding:16px">Khong co lenh khop filter (ngày/loại/side/Stage 2).</td></tr>';
    return;
  }

  srPaperBody.innerHTML = rows.map((t) => {
    const isClosed = t.status === 'CLOSED';
    const sideClass = t.side === 'LONG' ? 'sr-paper-long' : 'sr-paper-short';
    const isExpired = t.status === 'EXPIRED';
    const isCancelled = t.status === 'CANCELLED';
    const action = isClosed || isExpired || isCancelled
      ? `<button class="sr-paper-btn del" data-paper-delete="${escapeHtml(t.id)}">Del</button>`
      : `<button class="sr-paper-btn" data-paper-close="${escapeHtml(t.id)}">Close</button>`;
    const variant = String(t.variant ?? '').toUpperCase();
    const isLegacyBottomRisk = Boolean(t.bottomRebound)
      && String(t.trapRisk ?? '').toUpperCase() === 'HIGH';
    const isBottomRisk = Boolean(t.bottomReboundRisk)
      || String(t.subtype ?? '') === 'BOTTOM_REBOUND_RISK'
      || isLegacyBottomRisk;
    const isWeakCleanTrade = ['WEAK_RECLAIM', 'WEAK_REJECT'].includes(String(t.shakeoutClass ?? ''))
      && String(t.shakeoutClassReason ?? '').includes('lacks strong confirmation');
    const quality = getShakeoutQuality(t);
    const rowClass = `${isWeakCleanTrade
      ? 'sr-row-weak-clean'
      : isBottomRisk
      ? 'sr-row-bottom-rebound-risk'
      : t.bottomRebound || String(t.subtype ?? '') === 'BOTTOM_REBOUND'
        ? 'sr-row-bottom-rebound'
        : variant === 'MARKET' ? 'sr-row-market'
          : variant === 'PENDING' ? 'sr-row-pending' : ''}${t.highJumpRisk ? ' sr-row-high-jump-risk' : ''} sr-paper-quality-${quality.tier.toLowerCase()}`;
    const isNearMarketPending = String(t.note ?? '').includes('nearMarketEntry=');
    let variantBadge;
    if (variant === 'MARKET') {
      variantBadge = '<span class="sr-variant-badge market" title="Cách A: vào ngay theo giá market">A · MARKET</span>';
    } else if (variant === 'PENDING') {
      // PENDING chỉ thành vị thế khi giá chạm entry (status chuyển PENDING -> OPEN)
      variantBadge = t.status === 'PENDING'
        ? '<span class="sr-variant-badge pending waiting" title="Cách B: CHƯA khớp - đang chờ giá chạm entry, chưa có vị thế">B · CHỜ KHỚP</span>'
        : '<span class="sr-variant-badge pending" title="Cách B: ĐÃ khớp khi giá chạm entry">B · ĐÃ KHỚP</span>';
    } else if (variant === 'CHASE') {
      variantBadge = '<span class="sr-variant-badge pending" style="color:#fde68a;border-color:#fbbf24;background:#422006" title="CHASE: không chạm pending entry nhưng giá đã quay đầu từ hỗ trợ/kháng cự, vào paper test $2">CHASE · TEST $2</span>';
    } else {
      variantBadge = '<span class="sr-variant-badge none">-</span>';
    }
    if (isCancelled) {
      variantBadge = `<span class="sr-variant-badge pending" style="color:#fb7185;border-color:#fb7185" title="${escapeHtml(t.note)}">B · CANCELLED - MARKET ≤ -10%</span>`;
    }
    if (variant === 'PENDING' && isNearMarketPending && !isCancelled) {
      variantBadge = `<span class="sr-variant-badge pending${t.status === 'PENDING' ? ' waiting' : ''}" title="${escapeHtml(t.note)}">B · LIMIT GẦN MARKET</span>`;
    }
    if (t.btcStrongShortEma99) {
      variantBadge = `<span class="sr-variant-badge pending${t.status === 'PENDING' ? ' waiting' : ''}" style="color:#fde68a;border-color:#fbbf24;background:#422006" title="${escapeHtml(t.note)}">BTC STRONG · EMA99 EXACT</span>`;
    }
    if (String(t.source ?? '').includes('-scout-')) {
      variantBadge = `<span class="sr-variant-badge market" style="color:#a5f3fc;border-color:#22d3ee;background:#083344" title="${escapeHtml(t.note)}">SCOUT · MARKET $${Number(t.marginUsdt ?? 1).toFixed(0)}</span>`;
    }
    if (t.btcDynamicEntry) {
      const state = t.btcDynamicLocked ? 'LOCKED' : t.status === 'PENDING' ? 'FOLLOWING' : t.status;
      variantBadge = `<span class="sr-variant-badge pending${t.status === 'PENDING' ? ' waiting' : ''}" style="color:#fef08a;border-color:#eab308;background:#422006" title="${escapeHtml(t.note)}">BTC DYNAMIC · ${escapeHtml(state)}</span>`
        + `<div style="margin-top:5px;color:#fde68a;font-size:10px;font-weight:900;line-height:1.35">`
        + `MAX ${Number(t.btcDynamicMaxPct ?? 0).toFixed(0)}% · beta ${Number(t.btcDynamicBeta ?? 1).toFixed(2)}`
        + `<br>BTC ${fmtPrice(t.btcAnchorPrice)} → ${fmtPrice(t.btcLastPrice)}`
        + `</div>`;
    }
    if (t.shakeoutClass) {
      const classTone = isWeakCleanTrade
        ? ['rgba(15, 118, 110, .32)', '#2dd4bf', '#ccfbf1']
        : {
        FALSE_RECLAIM: ['#9f1239', '#fb7185', '#fff'],
        FALSE_REJECT: ['#9f1239', '#fb7185', '#fff'],
        WEAK_RECLAIM: ['#422006', '#fbbf24', '#fde68a'],
        WEAK_REJECT: ['#422006', '#fbbf24', '#fde68a'],
        STRONG_RECLAIM: ['#083344', '#22d3ee', '#a5f3fc'],
        STRONG_REJECT: ['#4c0519', '#f472b6', '#fce7f3'],
        CLEAN_RECLAIM: ['#052e1a', '#34d399', '#d1fae5'],
        CLEAN_REJECT: ['#3f1111', '#ef4444', '#fee2e2'],
        BOTTOM_REBOUND: ['#083344', '#22d3ee', '#a5f3fc'],
        TOP_REBOUND: ['#4c0519', '#f472b6', '#fce7f3'],
      }[String(t.shakeoutClass)] || ['#111827', '#38bdf8', '#e0f2fe'];
      variantBadge += `<div style="margin-top:5px;padding:4px;color:${classTone[2]};background:${classTone[0]};border:${isWeakCleanTrade ? '2px' : '1px'} solid ${classTone[1]};font-size:10px;font-weight:900;line-height:1.35;box-shadow:${isWeakCleanTrade ? '0 0 16px rgba(45,212,191,.18)' : 'none'}" title="${escapeHtml(t.shakeoutClassReason || '')}">`
        + `${escapeHtml(t.shakeoutClassLabel || t.shakeoutClass)}`
        + (t.shakeoutClassReason ? `<br>${escapeHtml(t.shakeoutClassReason)}` : '')
        + `</div>`;
    }
    variantBadge += shakeoutQualityBadge(t, true);
    variantBadge += shakeoutHighJumpRiskBadge(t, true);
    variantBadge += shakeoutRealGateBadge(t, true);
    if (t.btcIndependentShort) {
      variantBadge += `<div style="margin-top:5px;color:#a5f3fc;font-size:10px;font-weight:900;line-height:1.35">`
        + `${escapeHtml(t.btcEntryClass || 'INDEPENDENT')} · COIN STRUCTURE`
        + `<br>corr ${t.btcRelation?.corr ?? '-'} · beta ${t.btcRelation?.beta ?? '-'}`
        + `</div>`;
    }
    if (t.lossTpMovedToEntry) {
      variantBadge += `<div style="margin-top:5px;padding:4px;color:#fde68a;background:#422006;border:1px solid #fbbf24;font-size:10px;font-weight:900;line-height:1.35">`
        + `AM ${Math.abs(Number(t.lossTpTriggerRoe ?? 15)).toFixed(0)}% · TP VE ENTRY`
        + `<br>old TP ${fmtPrice(t.lossTpOriginalTp)}`
        + `</div>`;
    }
    if (t.partialTpTaken) {
      const closedPct = Math.round(Number(t.partialCloseRatio ?? 0.3) * 100);
      const runnerPct = Math.max(0, 100 - closedPct);
      variantBadge += `<div style="margin-top:5px;color:#67e8f9;font-size:10px;font-weight:900;line-height:1.35">`
        + `DA CAT ${closedPct}% · CON ${runnerPct}%`
        + `<br>REALIZED ${fmtSigned(Number(t.realizedPnl ?? 0))}`
        + `</div>`;
    }
    if (isBottomRisk) {
      const riskReason = t.autoTradeBlockReason
        || t.warning
        || 'Historical bottom rebound with trapRisk HIGH';
      variantBadge += `<div style="margin-top:5px;padding:5px;color:#fff;background:#9f1239;border:1px solid #fb7185;font-size:10px;font-weight:900;line-height:1.35">`
        + `${isLegacyBottomRisk ? 'LEGACY ' : ''}FALSE BOTTOM · AUTO BLOCKED`
        + `<br>${escapeHtml(riskReason)}`
        + `</div>`;
    } else if (t.bottomRebound || String(t.subtype ?? '') === 'BOTTOM_REBOUND') {
      variantBadge += `<div style="margin-top:5px;color:#67e8f9;font-size:10px;font-weight:900;line-height:1.35">`
        + `BOTTOM REBOUND · MARKET $${Number(t.marginBeforeDca ?? t.marginUsdt ?? 5).toFixed(0)} · NO SL`
        + (t.dcaTaken
          ? `<br>DCA +$${Number(t.dcaMarginUsdt ?? 10).toFixed(0)} @ ${fmtPrice(t.dcaPrice)} · AVG ${fmtPrice(t.entryPrice)}`
          : '<br>DCA +$10 khi ROE ≤ -25%')
        + `</div>`;
    }
    const projected = getSrProjectedPnl(t);
    const projectedHtml = projected.roe == null
      ? '-'
      : `<strong style="color:${projected.roe >= 20 ? '#34d399' : '#fbbf24'}">${fmtSigned(projected.pnl)} / ${fmtSigned(projected.roe, '%')}</strong>`;
    const btcDetail = btcDetailForShakeout(t);
    const btcDetailHtml = `<span style="display:inline-block;padding:3px 7px;border:1px solid ${btcDetail.tone};color:${btcDetail.tone};background:rgba(15,23,42,.55);border-radius:4px;font-weight:900;white-space:nowrap">${escapeHtml(btcDetail.label)}</span>`
      + `<div style="margin-top:3px;color:#94a3b8;font-size:10px;line-height:1.25;white-space:nowrap">${escapeHtml(btcDetail.sub)}</div>`;
    return `
      <tr class="${rowClass}" style="${isClosed ? 'opacity:.55' : ''}">
        <td>${variantBadge}</td>
        <td>${srMlFlagBadge(t, true, 'legacy')}</td>
        <td>${srMlFlagBadge(t, true, 'candle')}</td>
        <td>${srCandlePatternCell(t, true)}</td>
        <td>${srBtcCandlePatternCell(t)}</td>
        <td><a href="/?symbol=${encodeURIComponent(t.symbol)}" target="_blank" style="color:var(--text);font-weight:900;text-decoration:none">${escapeHtml(t.symbol)}</a></td>
        <td><span class="${sideClass}">${escapeHtml(t.side)}</span></td>
        <td>${fmtPrice(t.entryPrice)}</td>
        <td>${fmtPrice(t.sl)}</td>
        <td>${fmtPrice(t.tp)}</td>
        <td title="PnL tai TP theo entry, margin va leverage">${projectedHtml}</td>
        <td title="${escapeHtml(btcDetail.title)}">${btcDetailHtml}</td>
        <td data-srmark="${escapeHtml(t.id)}">${fmtPrice(t.markPrice)}</td>
        <td data-srpnl="${escapeHtml(t.id)}">${t.status === 'PENDING' ? '<span style="color:var(--muted)">chưa khớp</span>' : formatSrNetPnl(t)}</td>
        <td>${srSideCandleGateBadge(t)}</td>
        <td>${srStage2Badge(t)}</td>
        <td data-srroe="${escapeHtml(t.id)}">${t.status === 'PENDING' ? '-' : fmtSigned(srNetRoeValue(t), '%')}</td>
        <td>${t.partialTpTaken
          ? `<span style="display:inline-block;padding:3px 7px;border:1px solid #22d3ee;color:#67e8f9;background:#083344;border-radius:4px;font-weight:900" title="${escapeHtml(t.note)}">${escapeHtml(
            isClosed
              ? (t.outcome === 'RUNNER_TP'
                ? 'RUNNER TP'
                : t.outcome === 'PARTIAL_TRAIL' ? 'PARTIAL TRAIL' : 'PARTIAL BE')
              : '30% TP · 70% RUNNER',
          )}</span>`
          : t.recoveryMode
          ? `<span style="display:inline-block;padding:3px 7px;border:1px solid #f59e0b;color:#fbbf24;background:#422006;border-radius:4px;font-weight:900" title="${escapeHtml(t.note)}">${escapeHtml(
            isClosed
              ? (t.outcome === 'RECOVERY_BE' ? 'RECOVERY BE' : 'RECOVERY SL30')
              : 'RECOVERY',
          )}</span>`
          : escapeHtml(t.status)}</td>
        <td>${t.score ?? '-'}</td>
        <td>${escapeHtml(t.source)}</td>
        <td>${t.createdAt ? new Date(t.createdAt).toLocaleTimeString('vi-VN') : '-'}</td>
        <td>${action}</td>
      </tr>
    `;
  }).join('');
}

async function loadPaperTrades() {
  try {
    const res = await fetch(PAPER_API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderPaperTrades(await res.json());
  } catch (err) {
    srPaperSummary.textContent = `Paper loi: ${err.message}`;
  }
}

async function postPaperAction(path, payload) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await loadPaperTrades();
}

function applyPayload(data) {
  allSignals = Array.isArray(data?.signals) ? data.signals : [];
  total = Number(data?.total ?? 0);
  processed = Number(data?.processed ?? 0);
  scannedAt = Number(data?.scannedAt ?? Date.now());
  scanStatus.textContent = data?.stale ? `Dung cache cu: ${data.staleReason || 'REST congested'}` : 'Live scan 5m + 15m kline cache';
  render();
}

async function fetchOnce() {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    const data = await res.json();
    applyPayload(data);
  } catch (err) {
    scanStatus.textContent = `Fetch loi: ${err.message}`;
  }
}

function connectSse() {
  const es = new EventSource(SSE_URL);
  es.onopen = () => { scanStatus.textContent = 'SSE connected'; };
  es.onmessage = (ev) => {
    try { applyPayload(JSON.parse(ev.data)); }
    catch (err) { scanStatus.textContent = `Parse loi: ${err.message}`; }
  };
  es.onerror = () => {
    scanStatus.textContent = 'SSE reconnecting...';
  };
}

function connectPaperSse() {
  const es = new EventSource(PAPER_SSE_URL);
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data?.error) {
        srPaperSummary.textContent = `Paper stream loi: ${data.error}`;
        return;
      }
      renderPaperTrades(data);
    } catch (err) {
      srPaperSummary.textContent = `Paper stream parse loi: ${err.message}`;
    }
  };
  es.onerror = () => {
    srPaperSummary.textContent = 'Paper stream disconnected, dang dung fallback poll...';
  };
}

// ── Live price socket (số nhảy realtime cho Mark & PnL) ───────────────────────
// Dùng Last Price (miniTicker .c) để khớp với giá hiển thị trên Binance, không dùng Mark Price (lệch theo index/funding)
const PRICE_URLS = [
  'wss://fstream.binance.com/ws/!miniTicker@arr@1s',
  'wss://fstream.binancefuture.com/ws/!miniTicker@arr@1s',
];
let priceUrlIdx = 0;
const livePrices = new Map();
let srPaperStatsLiveRefreshAt = 0;

function applyLivePrices() {
  if (!Array.isArray(srPaperTrades) || !srPaperTrades.length) return;
  let changed = false;
  for (const t of srPaperTrades) {
    const p = livePrices.get(t.symbol);
    if (!Number.isFinite(p) || p <= 0) continue;
    t.markPrice = p;
    const markCell = srPaperBody.querySelector(`[data-srmark="${t.id}"]`);
    if (markCell) markCell.textContent = fmtPrice(p);
    if (t.status !== 'OPEN') continue; // PENDING chưa khớp / CLOSED đã chốt -> không tính lại PnL
    const entry = Number(t.entryPrice);
    const qty = Number(t.quantity);
    const margin = Number(t.marginUsdt);
    const realizedPnl = Number(t.realizedPnl ?? 0);
    if (!Number.isFinite(entry) || !Number.isFinite(qty) || !Number.isFinite(margin) || margin <= 0) continue;
    const sideMult = t.side === 'LONG' ? 1 : -1;
    const pnl = realizedPnl + (p - entry) * qty * sideMult;
    const roe = (pnl / margin) * 100;
    const feeUsdt = srEstimatedFee({ ...t, grossPnl: pnl, pnl, markPrice: p }, p) ?? 0;
    const netPnl = pnl - feeUsdt;
    const netRoe = (netPnl / margin) * 100;
    t.grossPnl = +pnl.toFixed(6);
    t.pnl = +pnl.toFixed(6);
    t.roe = +roe.toFixed(4);
    t.feeUsdt = +feeUsdt.toFixed(6);
    t.netPnl = +netPnl.toFixed(6);
    t.netRoe = +netRoe.toFixed(4);
    changed = true;
    const pnlCell = srPaperBody.querySelector(`[data-srpnl="${t.id}"]`);
    const roeCell = srPaperBody.querySelector(`[data-srroe="${t.id}"]`);
    if (pnlCell) pnlCell.innerHTML = formatSrNetPnl(t);
    if (roeCell) roeCell.innerHTML = fmtSigned(netRoe, '%');
  }
  if (changed && Date.now() - srPaperStatsLiveRefreshAt > 1500) {
    srPaperStatsLiveRefreshAt = Date.now();
    renderSrPaperComputedStats(getSrFilteredTrades());
  }
}

function connectPriceSocket() {
  let ws;
  try {
    ws = new WebSocket(PRICE_URLS[priceUrlIdx % PRICE_URLS.length]);
  } catch { setTimeout(connectPriceSocket, 3000); return; }
  ws.onmessage = (e) => {
    try {
      const rows = JSON.parse(e.data);
      if (!Array.isArray(rows)) return;
      for (const row of rows) {
        if (row.e !== '24hrMiniTicker') continue;
        const p = Number(row.c); // c = last price
        if (Number.isFinite(p)) livePrices.set(row.s, p);
      }
      applyLivePrices();
    } catch {}
  };
  ws.onclose = () => { priceUrlIdx++; setTimeout(connectPriceSocket, 3000); };
  ws.onerror = () => { try { ws.close(); } catch {} };
}

[searchInput, sideFilter, stageFilter, scoreFilter, sortSelect].forEach((el) => el.addEventListener('input', render));
srPaperBody.addEventListener('click', async (ev) => {
  const closeId = ev.target?.dataset?.paperClose;
  const deleteId = ev.target?.dataset?.paperDelete;
  if (!closeId && !deleteId) return;
  ev.target.disabled = true;
  try {
    if (closeId) await postPaperAction('/api/shakeout-paper-trades/close', { id: closeId });
    if (deleteId) await postPaperAction('/api/shakeout-paper-trades/delete', { id: deleteId });
  } catch (err) {
    srPaperSummary.textContent = `Paper action loi: ${err.message}`;
    ev.target.disabled = false;
  }
});
if (srMlRefresh) srMlRefresh.addEventListener('click', () => loadShakeoutLearning(true));
connectSse();
connectPaperSse();
fetchOnce();
loadPaperTrades();
loadShakeoutLearning();
setInterval(() => {
  lastScan.textContent = scannedAt ? timeAgo(scannedAt) : '-';
}, 1000);
setInterval(fetchOnce, 90_000);
setInterval(() => loadShakeoutLearning(), 5 * 60_000);
function schedulePaperPoll() {
  const delay = srPaperTrades.some((t) => t.status === 'OPEN') ? 3000 : 15000;
  setTimeout(async () => {
    await loadPaperTrades();
    schedulePaperPoll();
  }, delay);
}
schedulePaperPoll();
