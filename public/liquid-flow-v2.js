const els = {
  socketDot: document.getElementById('socketDot'),
  socketStatus: document.getElementById('socketStatus'),
  generatedAt: document.getElementById('generatedAt'),
  candidateCount: document.getElementById('candidateCount'),
  readyCount: document.getElementById('readyCount'),
  activeCount: document.getElementById('activeCount'),
  warmupCount: document.getElementById('warmupCount'),
  autoPaperEnabled: document.getElementById('autoPaperEnabled'),
  autoPaperState: document.getElementById('autoPaperState'),
  autoPaperRuleNote: document.getElementById('autoPaperRuleNote'),
  labelStats: document.getElementById('labelStats'),
  signalGrid: document.getElementById('signalGrid'),
  refreshButton: document.getElementById('refreshButton'),
  paperUpdatedAt: document.getElementById('paperUpdatedAt'),
  paperOpenCount: document.getElementById('paperOpenCount'),
  paperClosedCount: document.getElementById('paperClosedCount'),
  paperWinLoss: document.getElementById('paperWinLoss'),
  paperWinRate: document.getElementById('paperWinRate'),
  paperNetPnl: document.getElementById('paperNetPnl'),
  paperAvgRoe: document.getElementById('paperAvgRoe'),
  paperOpenList: document.getElementById('paperOpenList'),
  paperClosedList: document.getElementById('paperClosedList'),
  paperClosedPagination: document.getElementById('paperClosedPagination'),
  paperClosedPrev: document.getElementById('paperClosedPrev'),
  paperClosedNext: document.getElementById('paperClosedNext'),
  paperClosedPageInfo: document.getElementById('paperClosedPageInfo'),
  paperStatsFilters: document.getElementById('paperStatsFilters'),
  paperFromDay: document.getElementById('paperFromDay'),
  paperToDay: document.getElementById('paperToDay'),
  paperLabelFilter: document.getElementById('paperLabelFilter'),
  paperFilterToday: document.getElementById('paperFilterToday'),
  paperFilterAll: document.getElementById('paperFilterAll'),
  paperFilterNote: document.getElementById('paperFilterNote'),
  paperLabelBreakdown: document.getElementById('paperLabelBreakdown'),
  paperBinanceSettingsSyncState: document.getElementById('paperBinanceSettingsSyncState'),
};

const LIQUID_FLOW_V2_PAPER_BINANCE_CONTROL_UI_VERSION = 'LIQUID_FLOW_V2_PAPER_BINANCE_CONTROL_UI_V1_SHARED_SYNC_20260823';
const BINANCE_SIGNAL_SETTINGS_SYNC_CHANNEL = 'liquid-flow-v2-binance-signal-settings-sync';
const BINANCE_SIGNAL_SETTINGS_SYNC_STORAGE_KEY = 'liquid_flow_v2_binance_signal_settings_sync';
const BINANCE_SIGNAL_SETTINGS_SYNC_MS = 10_000;

let board = null;
let activeFilter = 'ALL';
let enabledWhitelistKeys = new Set();
let stream = null;
let reconnectTimer = null;
let closedPaperPage = 1;
let paperStatsView = null;
let paperStatsRequestSequence = 0;
let paperStatsReloadTimer = null;
let lastPaperStatsUpdatedAt = null;
const CLOSED_PAPER_PAGE_SIZE = 10;
const binanceEntryDrafts = new Map();
const binanceMarginDrafts = new Map();
const binanceOrderUiStates = new Map();
const binanceSignalSettingDrafts = new Map();
let binanceSignalSettingsData = { loaded: false, signals: {}, globalOrderEnabled: false, dryRun: true, error: '' };
let binanceSignalSettingsFingerprint = '';
let binanceSignalSettingsSyncTimer = null;
const binanceSignalSettingsChannel = typeof BroadcastChannel === 'function'
  ? new BroadcastChannel(BINANCE_SIGNAL_SETTINGS_SYNC_CHANNEL)
  : null;

function currentPaperView() {
  return paperStatsView ?? board?.paper ?? {};
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function number(value, digits = 1, suffix = '') {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? `${normalized.toFixed(digits)}${suffix}` : '--';
}

function compactUsd(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '--';
  if (Math.abs(normalized) >= 1e9) return `$${(normalized / 1e9).toFixed(2)}B`;
  if (Math.abs(normalized) >= 1e6) return `$${(normalized / 1e6).toFixed(2)}M`;
  if (Math.abs(normalized) >= 1e3) return `$${(normalized / 1e3).toFixed(1)}K`;
  return `$${normalized.toFixed(0)}`;
}

function price(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '--';
  if (normalized >= 1000) return normalized.toFixed(2);
  if (normalized >= 1) return normalized.toFixed(4);
  return normalized.toPrecision(6);
}

function signedClass(value) {
  const normalized = Number(value);
  return normalized > 0 ? 'is-positive' : normalized < 0 ? 'is-negative' : '';
}

function dateTime(value) {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString('vi-VN') : '--';
}

function duration(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return '--';
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

async function jsonApi(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data.code ?? null;
    throw error;
  }
  return data;
}

async function recoverOrdersToken() {
  const rawCredentials = localStorage.getItem('orders_creds');
  if (!rawCredentials) {
    const envResponse = await fetch('/api/auth/env', { method: 'POST', cache: 'no-store' });
    const envData = await envResponse.json();
    if (!envResponse.ok || !envData.token) return '';
    localStorage.setItem('orders_token', envData.token);
    return envData.token;
  }
  let credentials;
  try {
    credentials = JSON.parse(rawCredentials);
  } catch {
    return '';
  }
  if (!credentials?.apiKey || !credentials?.apiSecret) return '';
  const response = await fetch('/api/auth', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey: credentials.apiKey, apiSecret: credentials.apiSecret }),
  });
  const data = await response.json();
  if (!response.ok || !data.token) throw new Error(data.error ?? 'Không thể khôi phục phiên /orders.');
  localStorage.setItem('orders_token', data.token);
  return data.token;
}

async function ordersJsonApi(url, options = {}) {
  let token = localStorage.getItem('orders_token') ?? '';
  if (!token) token = await recoverOrdersToken();
  if (!token) {
    const error = new Error('Chưa đăng nhập Binance/Orders.');
    error.status = 401;
    throw error;
  }
  const request = () => jsonApi(url, {
    ...options,
    headers: { 'x-orders-token': token, ...(options.headers ?? {}) },
  });
  try {
    return await request();
  } catch (error) {
    if (error.status !== 401) throw error;
    localStorage.removeItem('orders_token');
    token = await recoverOrdersToken();
    if (!token) throw error;
    return request();
  }
}

function signalSettingsFingerprint(data = {}) {
  return JSON.stringify({
    version: data.version ?? '',
    globalOrderEnabled: data.globalOrderEnabled === true,
    dryRun: data.dryRun === true,
    signals: data.signals ?? {},
  });
}

function signalControlHtml(labelKey) {
  if (!binanceSignalSettingsData.loaded) {
    return `<span class="flow-v2-route-unsupported">${binanceSignalSettingsData.error ? 'CẦN LOGIN ORDERS' : 'ĐANG SYNC BINANCE…'}</span>`;
  }
  const setting = binanceSignalSettingsData.signals?.[labelKey];
  if (!setting?.supported) {
    return '<span class="flow-v2-route-unsupported">KHÔNG CÓ AUTO ROUTE</span>';
  }
  const draft = binanceSignalSettingDrafts.get(labelKey);
  const enabled = draft?.enabled ?? setting.enabled;
  const configuredMargin = Number(draft?.marginUsdt ?? setting.marginUsdt);
  const margin = Number.isFinite(configuredMargin) ? configuredMargin : '';
  const leverage = Number(setting.leverage) || 5;
  const effective = enabled && binanceSignalSettingsData.globalOrderEnabled && !binanceSignalSettingsData.dryRun;
  const gateNote = enabled && !effective
    ? binanceSignalSettingsData.dryRun ? ' · dry-run tổng' : ' · Orders tổng đang tắt'
    : '';
  const stateNote = draft ? 'chưa lưu' : setting.source === 'PERSISTED' ? 'đã lưu' : 'mặc định';
  return `<div class="flow-v2-signal-order-control" data-label-key="${escapeHtml(labelKey)}">
    <label class="flow-v2-row-switch">
      <input class="js-signal-binance-enabled" type="checkbox" ${enabled ? 'checked' : ''}>
      <span>${enabled ? 'BẬT' : 'TẮT'}</span>
    </label>
    <div class="flow-v2-row-margin">
      <input class="js-signal-binance-margin" type="number" min="0.01" max="10000" step="0.01" value="${escapeHtml(margin)}" aria-label="Margin USD ${escapeHtml(labelKey)}">
      <button class="js-signal-binance-save" type="button">LƯU</button>
    </div>
    <small class="js-signal-binance-status ${effective ? 'is-positive' : enabled ? 'is-negative' : ''}">${stateNote} · $${escapeHtml(margin)} x${leverage}${gateNote}</small>
  </div>`;
}

function updateBinanceSettingsSyncState(ok, note = '') {
  if (!els.paperBinanceSettingsSyncState) return;
  els.paperBinanceSettingsSyncState.classList.toggle('is-live', ok);
  els.paperBinanceSettingsSyncState.textContent = ok ? `BINANCE SYNC${note ? ` · ${note}` : ''}` : 'BINANCE CHƯA SYNC';
}

async function loadBinanceSignalSettings({ quiet = false } = {}) {
  try {
    const data = await ordersJsonApi('/api/liquid-flow-v2-binance-signal-settings');
    const nextFingerprint = signalSettingsFingerprint(data);
    const changed = nextFingerprint !== binanceSignalSettingsFingerprint;
    binanceSignalSettingsData = { ...data, loaded: true, error: '' };
    binanceSignalSettingsFingerprint = nextFingerprint;
    updateBinanceSettingsSyncState(true);
    if (changed && Array.isArray(currentPaperView()?.labelStats)) {
      renderPaperLabelBreakdown(currentPaperView());
    }
    return data;
  } catch (error) {
    if (!binanceSignalSettingsData.loaded) {
      binanceSignalSettingsData = { ...binanceSignalSettingsData, error: error.message };
      if (Array.isArray(currentPaperView()?.labelStats)) renderPaperLabelBreakdown(currentPaperView());
    }
    updateBinanceSettingsSyncState(false);
    if (!quiet) console.warn('[LiquidFlowV2] Binance signal settings:', error.message);
    return null;
  }
}

function announceBinanceSignalSettingsChange(labelKey) {
  const message = { version: LIQUID_FLOW_V2_PAPER_BINANCE_CONTROL_UI_VERSION, labelKey, updatedAt: Date.now() };
  binanceSignalSettingsChannel?.postMessage(message);
  try { localStorage.setItem(BINANCE_SIGNAL_SETTINGS_SYNC_STORAGE_KEY, JSON.stringify(message)); } catch {}
}

async function submitLiquidFlowV2BinanceOrder(requestBody, token) {
  return jsonApi('/api/liquid-flow-v2-binance-order', {
    method: 'POST',
    headers: { 'x-orders-token': token },
    body: JSON.stringify(requestBody),
  });
}

function renderHeaderLegacy(data) {
  els.candidateCount.textContent = data.candidateCount ?? 0;
  els.readyCount.textContent = data.readyCount ?? 0;
  els.activeCount.textContent = data.activeCount ?? 0;
  els.warmupCount.textContent = data.warmupCount ?? 0;
  const telemetry = data.telemetry ?? {};
  const socketText = telemetry.socketState === 'OPEN'
    ? `Force-order socket ổn · ${telemetry.symbols ?? 0} symbol có event`
    : `Force-order ${telemetry.socketState ?? 'WARMING_UP'} · nhãn READY sẽ thận trọng hơn`;
  els.socketStatus.textContent = socketText;
  els.socketDot.className = `flow-v2-socket-dot ${telemetry.socketState === 'OPEN' ? 'is-open' : 'is-connecting'}`;
  els.generatedAt.textContent = `Snapshot ${new Date(data.generatedAt).toLocaleTimeString('vi-VN')} · ${escapeHtml(data.version)}`;
}

function renderHeader(data) {
  els.candidateCount.textContent = data.candidateCount ?? 0;
  els.readyCount.textContent = data.readyCount ?? 0;
  els.activeCount.textContent = data.activeCount ?? 0;
  els.warmupCount.textContent = data.warmupCount ?? 0;
  const telemetry = data.telemetry ?? {};
  const staleDataCount = Number(data.staleDataCount ?? 0);
  const klineSocketStale = data.klineTelemetry?.m5?.isStale === true;
  const fadingLiveTotal = Number(data.fadingWaveLiveCoverage?.total ?? 0);
  const fadingLiveCount = Number(data.fadingWaveLiveCoverage?.live ?? 0);
  const fadingLiveMissing = fadingLiveTotal > 0 && fadingLiveCount < fadingLiveTotal;
  const socketText = staleDataCount > 0
    ? `KLINE STALE ${staleDataCount}/${data.candidateCount ?? 0} coin - fail-closed, no paper/Discord/Binance entry`
    : fadingLiveMissing
      ? `FADING LIVE 5M ${fadingLiveCount}/${fadingLiveTotal} coin - coin thiếu nến live tự fail-closed`
    : klineSocketStale
      ? `Kline WS stale - REST fallback dang giu nen fresh - Force-order ${telemetry.socketState ?? 'WARMING_UP'}`
      : telemetry.socketState === 'OPEN'
        ? `Kline live ${fadingLiveCount}/${fadingLiveTotal} + force-order socket OK - ${telemetry.symbols ?? 0} symbol co event`
        : `Force-order ${telemetry.socketState ?? 'WARMING_UP'} - READY dang fail-safe`;
  els.socketStatus.textContent = socketText;
  els.socketDot.className = `flow-v2-socket-dot ${staleDataCount > 0 ? 'is-error' : fadingLiveMissing || klineSocketStale ? 'is-connecting' : telemetry.socketState === 'OPEN' ? 'is-open' : 'is-connecting'}`;
  els.generatedAt.textContent = `Snapshot ${new Date(data.generatedAt).toLocaleTimeString('vi-VN')} - stale ${staleDataCount} - live5m ${fadingLiveCount}/${fadingLiveTotal} - ${escapeHtml(data.version)}`;
}

function renderLabelStats(stats = []) {
  els.labelStats.innerHTML = stats.map((stat) => {
    const eligible = stat.whitelistEligible === true;
    const checked = eligible && enabledWhitelistKeys.has(stat.whitelistKey);
    const whitelistControl = eligible ? `
        <label class="flow-v2-whitelist" title="Checkbox chỉ lưu whitelist thống kê; không điều khiển rule Binance BASE riêng">
          <input type="checkbox" data-whitelist-key="${escapeHtml(stat.whitelistKey)}" ${checked ? 'checked' : ''}>
          <span>WHITELIST</span>
        </label>` : `
        <span class="flow-v2-whitelist is-locked" title="Chỉ hiện checkbox khi paper CLOSED AvgROE > 4%">CHỜ AVGROE &gt; 4%</span>`;
    return `
      <article class="flow-v2-label-card ${stat.side === 'SHORT' ? 'is-short' : 'is-long'} ${checked ? 'is-whitelisted' : ''}">
        ${whitelistControl}
        <h3>${escapeHtml(stat.title)}</h3>
        <strong>${Number(stat.active ?? 0)} active</strong>
        <p>${escapeHtml(stat.description)}</p>
        <small>${Number(stat.transitions ?? 0)} lần chuyển nhãn trong phiên · max confidence ${Number(stat.maxConfidence ?? 0)}% · paper ${Number(stat.paperClosed ?? 0)} closed / AvgROE ${stat.paperAvgRoe == null ? '--' : `${Number(stat.paperAvgRoe).toFixed(1)}%`}</small>
      </article>
    `;
  }).join('') || '<div class="flow-v2-empty">Chưa có định nghĩa nhãn.</div>';
}

function zoneRow(label, zone, kind) {
  const distance = Number(zone?.distancePct);
  const width = Number.isFinite(distance) ? Math.max(4, Math.min(100, Math.abs(distance) / 8 * 100)) : 4;
  return `
    <div class="flow-v2-zone-row is-${kind}">
      <span>${label}</span>
      <div class="flow-v2-zone-track"><i style="--zone-width:${width}%"></i></div>
      <b>${price(zone?.price)} · ${number(distance, 2, '%')}</b>
    </div>
  `;
}

function evidenceHtml(rows = []) {
  const labels = {
    'post-pump-30': 'Pump truoc do >=30%',
    'post-pump-drawdown': 'Da xa 25-75% tu dinh',
    'post-pump-base-range': 'Base 5m co hep <=6%',
    'post-pump-base-flat': 'Base di ngang',
    'post-pump-lows-hold': 'Nua sau khong tao day sau',
    'base-sell-absorption': 'Sell-flow trong base duoc hap thu',
    'post-pump-breakout': 'Dong breakout dinh base',
    'breakout-taker': 'Taker mua xac nhan',
    'bullish-close': 'Nen tang dong gan dinh',
    zone: 'Vùng đã quét',
    candle: 'Nến xác nhận',
    'closed-5m-confirmation': 'Nến 5m kế tiếp xác nhận',
    'closed-taker': 'Taker của nến xác nhận',
    'liquidation-ended': 'Liquidation đã kết thúc',
    'force-socket-open': 'Force-order socket đang mở',
    'positive-day-pullback': 'Pullback trong ngày còn tăng',
    taker: 'Taker đảo',
    oi: 'OI giảm',
    liquidation: 'Liq burst',
    'base-sweep': 'Quét mép base',
    'base-hold': 'Giữ reclaim/reject',
    breakout: 'Breakout/breakdown',
    'ema99-wick-touch': 'Râu chạm EMA99',
    'ema99-reclaim': 'Mark reclaim/reject',
    'wick-rebound': 'Bật khỏi râu',
    'ema-stack': 'EMA cùng hướng',
    'ema99-slope': 'Dốc EMA99 giữ hướng',
    pullback: 'Pullback từ đỉnh',
    bounce: 'Hồi từ đáy',
    'taker-guard': 'Taker không phá hướng',
    'htf-bear': '1h/4h giảm',
    'htf-bull': '1h/4h tăng',
    'ema99-15m-touch': 'Chạm EMA99 15m',
    'pump-15m': 'Pump 15m',
    'dump-15m': 'Dump 15m',
    'reject-15m': 'Đóng reject 15m',
    'reclaim-15m': 'Đóng reclaim 15m',
    'volume-15m': 'Volume 15m',
    'taker-15m': 'Taker 15m',
    'strong-pump': 'Pump mạnh trước base',
    'sideway-range': 'Sideway co hẹp',
    'lower-highs': 'Đỉnh thấp dần',
    'upper-wicks': 'Râu trên phân phối',
    'volume-fade': 'Volume suy giảm',
    'taker-fade': 'Taker mua suy yếu',
    breakdown: 'Thủng support',
    'failed-retest': 'Retest thất bại',
    'sell-flow': 'Sell-flow xác nhận',
    volume: 'Volume xác nhận',
    'top-liquidity-rank': 'Top 150 thanh khoản',
    'day-already-up': 'Ngày đã tăng ít nhất 5%',
    'prior-pump-leg': 'Đã có nhịp pump trước',
    'post-pump-pullback': 'Đã pullback sau pump',
    'flagpole-breakout': 'Cột cờ breakout đủ mạnh',
    'flagpole-volume-taker': 'Volume/taker xác nhận cột cờ',
    'wick-pullback-reclaim': 'Nến kế tiếp rút râu/reclaim',
    'force-buy-short-kill': 'Force BUY đang kill short',
    'short-liquidation-burst': 'Kill short tăng đột biến',
    'oi-not-expanding': 'OI không mở rộng',
    'day-not-strong-positive': 'Ngày không tăng quá mạnh',
    'fading-wave-downtrend': 'Sóng tàn đang downtrend',
    'wave-peak-aged': 'Đỉnh sóng đã qua đủ lâu',
    'wave-drawdown': 'Đã rơi khỏi đỉnh sóng',
    'live-pump-high': 'Nến live đang dựng đứng',
    'live-range-atr': 'Range live lớn so với ATR',
    'live-volume-taker': 'Volume/taker mua bùng lên',
    'live-giveback-wick': 'Đã rút khỏi đỉnh trong nến',
    'live-ema99-sweep': 'Nến live quét lên EMA99',
    'day-loss': 'Ngày giảm ít nhất 5%',
    'prior-ema-compression': 'EMA nén trước tín hiệu',
    'compression-density': 'Mật độ EMA nén',
    'breakdown-volume': 'Breakdown kèm volume',
    'bearish-body': 'Thân nến giảm',
    'ema-fan-order': 'EMA fan bearish',
    'ema-fan-widening': 'Khoảng EMA mở rộng',
    'rsi-guard': 'RSI không quá bán sâu',
    'entry-distance-cap': 'Không đuổi xa EMA13',
  };
  return rows.map((row) => `<span class="${row.matched ? 'is-hit' : ''}">${labels[row.name] ?? row.name}</span>`).join('');
}

function secondaryLabelsHtml(classification = {}, features = {}) {
  const distribution = features.pumpDistribution15m ?? {};
  const postPump = features.postPumpShortSqueeze5m ?? {};
  const flagpole = features.flagpoleShortKill5m ?? {};
  return (classification.secondaryLabels ?? []).map((secondary) => {
    const flagpoleShortKill = secondary.labelKey === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY';
    const postPumpLabel = secondary.labelKey?.startsWith('POST_PUMP') && !flagpoleShortKill;
    const stage = flagpoleShortKill
      ? flagpole.stage ?? secondary.phase ?? 'WATCH'
      : postPumpLabel
        ? postPump.stage ?? secondary.phase ?? 'WATCH'
        : distribution.stage ?? secondary.phase ?? 'WATCH';
    return `
    <section class="flow-v2-secondary-label ${secondary.side === 'SHORT' ? 'is-short' : 'is-long'}">
      <div class="flow-v2-secondary-head">
        <b>${escapeHtml(secondary.label)} · ${Number(secondary.confidence ?? 0)}%</b>
        <span>${escapeHtml(stage)}</span>
      </div>
      <p>${escapeHtml(secondary.reason)}</p>
      ${flagpoleShortKill
        ? `<small>Pump trước ${number(flagpole.priorPumpPct, 1, '%')} · pullback ${number(flagpole.pullbackPct, 1, '%')} · flagpole ${number(flagpole.flagpoleBodyPct, 1, '%')} · volume ${number(flagpole.flagpoleVolumeX, 2, 'x')} · râu dưới ${number(Number(flagpole.confirmationLowerWickShare) * 100, 1, '%')}</small>`
        : postPumpLabel
        ? `<small>Pump ${number(postPump.pumpPct, 1, '%')} · drawdown ${number(postPump.drawdownFromPeakPct, 1, '%')} · base ${number(postPump.baseRangePct, 1, '%')} · volume fade ${number(postPump.volumeFadeRatio, 2, 'x')}</small>`
        : ''}
      ${flagpoleShortKill || postPumpLabel ? '' : `<small>Pump ${number(distribution.pumpPct, 1, '%')} · drawdown ${number(distribution.drawdownFromPeakPct, 1, '%')} · ${escapeHtml(distribution.unwindTier ?? '--')} · peak ${number(distribution.barsSincePeak, 0, ' nến 15m trước')}</small>`}
      <div class="flow-v2-evidence">${evidenceHtml(secondary.evidence)}</div>
    </section>
  `;
  }).join('');
}

function paperForSignal(row) {
  const trades = board?.paper?.trades ?? [];
  return trades.find((trade) => trade.symbol === row.symbol && trade.status === 'OPEN')
    ?? trades.find((trade) => trade.symbol === row.symbol && trade.labelKey === row.classification?.labelKey)
    ?? null;
}

function paperBinanceState(trade) {
  const state = String(trade?.binanceEntryState ?? '');
  if (!state) return '';
  const detail = state === 'FILLED'
    ? `BINANCE $${number(trade.binanceMarginUsdt, 0)} · ${number(trade.binanceLeverage, 0, 'x')}`
    : `BINANCE ${state}`;
  return ` · ${escapeHtml(detail)}`;
}

function entryStateHtml(row) {
  const trade = paperForSignal(row);
  if (trade?.status === 'PENDING_ENTRY') {
    return `<div class="flow-v2-entry-state is-pending">CHỜ RETEST · ${trade.side} LIMIT ${price(trade.entryPrice)} · mark ${price(trade.markPrice)} · ${number(trade.leverage, 0, 'x')}</div>`;
  }
  if (trade?.status === 'OPEN') {
    return `<div class="flow-v2-entry-state is-open">PAPER OPEN · ${trade.side} @ ${price(trade.entryPrice)} · TP ${price(trade.takeProfit)} · SL ${price(trade.stopLoss)} · ${number(trade.leverage, 0, 'x')}${paperBinanceState(trade)}</div>`;
  }
  if (trade?.status === 'CLOSED') {
    return `<div class="flow-v2-entry-state is-closed">PAPER ${escapeHtml(trade.outcome)} · NET ${number(trade.netPnl, 4, ' USDT')} · ${number(trade.netRoe, 1, '% ROE')}</div>`;
  }
  if (row.classification?.phase === 'READY') {
    return `<div class="flow-v2-entry-state">READY · ${board?.paper?.settings?.autoEnabled ? 'đang tạo paper tại mark live của lần scan' : 'Auto Paper đang tắt'}</div>`;
  }
  return '<div class="flow-v2-entry-state">CHƯA VÀO · PRE quét râu 5m live; nhãn sweep khác chờ xác nhận</div>';
}

function signalCard(row) {
  const f = row.features ?? {};
  const c = row.classification ?? {};
  const flagpole = f.flagpoleShortKill5m ?? {};
  const flagpoleDetails = c.labelKey === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY' ? `
    <div class="flow-v2-metrics">
      <div><span>PUMP TRƯỚC</span><b>${number(flagpole.priorPumpPct, 1, '%')}</b></div>
      <div><span>PULLBACK</span><b>${number(flagpole.pullbackPct, 1, '%')}</b></div>
      <div><span>FLAGPOLE BODY</span><b>${number(flagpole.flagpoleBodyPct, 1, '%')}</b></div>
      <div><span>RANGE / ATR</span><b>${number(flagpole.flagpoleRangeAtr, 2, 'x')}</b></div>
      <div><span>FLAG VOL</span><b>${number(flagpole.flagpoleVolumeX, 2, 'x')}</b></div>
      <div><span>RÂU DƯỚI</span><b>${number(Number(flagpole.confirmationLowerWickShare) * 100, 1, '%')}</b></div>
      <div><span>FORCE BUY BURST</span><b>${number(f.shortLiquidationBurst, 2, 'x')}</b></div>
      <div><span>FORCE BUY 5M</span><b>${compactUsd(f.shortLiquidationUsd)}</b></div>
    </div>` : '';
  const fadingWave = f.fadingWaveLivePump5m ?? {};
  const fadingWaveDetails = c.labelKey === 'FADING_WAVE_LIVE_PUMP_SHORT_READY' ? `
    <div class="flow-v2-metrics">
      <div><span>EMA99 SLOPE</span><b>${number(fadingWave.ema99Slope12Pct, 2, '%')}</b></div>
      <div><span>12 NẾN</span><b>${number(fadingWave.downReturn12Pct, 2, '%')}</b></div>
      <div><span>WAVE DRAWDOWN</span><b>${number(fadingWave.waveDrawdownPct, 1, '%')}</b></div>
      <div><span>LIVE HIGH/OPEN</span><b>${number(fadingWave.livePumpHighPct, 1, '%')}</b></div>
      <div><span>LIVE MARK/OPEN</span><b>${number(fadingWave.liveMarkPumpPct, 1, '%')}</b></div>
      <div><span>RANGE / ATR</span><b>${number(fadingWave.liveRangeAtr, 2, 'x')}</b></div>
      <div><span>LIVE VOL</span><b>${number(fadingWave.liveVolumeX, 2, 'x')}</b></div>
      <div><span>GIVEBACK</span><b>${number(fadingWave.liveGivebackPct, 1, '%')}</b></div>
    </div>` : '';
  const htfRetestTimeframe = c.ema99RetestTimeframe === '5m' ? '5M' : '15M';
  const htfRetest = htfRetestTimeframe === '5M' ? f.ema99Retest5m : f.ema99Retest15m;
  const sideClass = c.side === 'SHORT' ? 'is-short' : c.side === 'LONG' ? 'is-long' : 'is-wait';
  const rank = row.moverRank ? `#${row.moverRank} TOP ${row.moverSide === 'UP' ? 'TĂNG' : 'GIẢM'}` : 'ABS MOVER';
  const missingPrefix = c.warmingUp ? 'Thiếu/warmup' : 'Telemetry thiếu (không chặn nhãn)';
  const warm = c.missing?.length ? `<div class="flow-v2-warm">${missingPrefix}: ${c.missing.map(escapeHtml).join(' · ')}</div>` : '';
  return `
    <article class="flow-v2-signal-card ${sideClass}" data-side="${escapeHtml(c.side ?? '')}" data-phase="${escapeHtml(c.phase ?? 'WAIT')}">
      <div class="flow-v2-card-head">
        <div class="flow-v2-symbol"><strong>${escapeHtml(row.symbol)}</strong><span>${rank}</span></div>
        <div class="flow-v2-badge">${escapeHtml(c.label)} · ${Number(c.confidence ?? 0)}%</div>
      </div>
      <div class="flow-v2-card-body">
        <div class="flow-v2-metrics">
          <div><span>24H</span><b class="${signedClass(f.change24hPct)}">${number(f.change24hPct, 1, '%')}</b></div>
          <div><span>1H CLOSED</span><b class="${signedClass(f.change1hPct)}">${number(f.change1hPct, 2, '%')}</b></div>
          <div><span>VOL X</span><b>${number(f.volumeX, 2, 'x')}</b></div>
          <div><span>TAKER Δ</span><b class="${signedClass(f.takerDeltaPct)}">${number(f.takerDeltaPct, 1, '%')}</b></div>
          <div><span>OI Δ ~1M</span><b class="${signedClass(f.openInterestDeltaPct)}">${number(f.openInterestDeltaPct, 2, '%')}</b></div>
          <div><span>KILL SHORT</span><b>${compactUsd(f.shortLiquidationUsd)}</b></div>
          <div><span>KILL LONG</span><b>${compactUsd(f.longLiquidationUsd)}</b></div>
          <div><span>MARK</span><b>${price(f.markPrice)}</b></div>
          <div><span>EMA99 5M</span><b>${price(f.ema99)}</b></div>
          <div><span>CÁCH EMA99</span><b class="${Math.abs(Number(f.ema99DistancePct)) <= 1.2 ? 'is-positive' : ''}">${number(f.ema99DistancePct, 2, '%')}</b></div>
          <div><span>RÂU→EMA99</span><b>${number(c.side === 'SHORT' ? f.ema99ShortTouchDistancePct : f.ema99LongTouchDistancePct, 2, '%')}</b></div>
          <div><span>BẬT RÂU</span><b>${number(c.side === 'SHORT' ? f.rejectFromApproachHighPct : f.reboundFromApproachLowPct, 2, '%')}</b></div>
          <div><span>HTF TIER</span><b>${escapeHtml(c.side === 'SHORT' ? f.htfBearTier : f.htfBullTier)}</b></div>
          <div><span>EMA99 ${htfRetestTimeframe}</span><b>${price(htfRetest?.ema99)}</b></div>
          <div><span>${htfRetestTimeframe} CLOSE→EMA</span><b>${number(htfRetest?.closeDistancePct, 2, '%')}</b></div>
        </div>
        <div class="flow-v2-zones">
          ${zoneRow('Vùng trên', f.upperZone, 'upper')}
          ${zoneRow('Vùng dưới', f.lowerZone, 'lower')}
        </div>
        <p class="flow-v2-reason">${escapeHtml(c.reason)}</p>
        ${flagpoleDetails}
        ${fadingWaveDetails}
        <div class="flow-v2-evidence">${evidenceHtml(c.evidence)}</div>
        ${secondaryLabelsHtml(c, f)}
        ${entryStateHtml(row)}
        ${warm}
      </div>
    </article>
  `;
}

function paperRow(trade) {
  const pnlClass = signedClass(trade.netPnl);
  const normalizedSide = String(trade.side ?? '').toUpperCase();
  const sideClass = normalizedSide === 'LONG' ? 'is-long' : normalizedSide === 'SHORT' ? 'is-short' : '';
  const normalizedOutcome = String(trade.outcome ?? '').toUpperCase();
  const netPnl = Number(trade.netPnl);
  const resultClass = trade.status === 'CANCELLED'
    ? 'is-cancelled'
    : normalizedOutcome.includes('TP') || (Number.isFinite(netPnl) && netPnl > 0)
      ? 'is-win'
      : normalizedOutcome.includes('SL') || (Number.isFinite(netPnl) && netPnl < 0)
        ? 'is-loss'
        : 'is-flat';
  const emaFanWaitingConfirmation = trade.status === 'PENDING_ENTRY'
    && trade.labelKey === 'EMA_FAN_LONG_READY'
    && trade.entryConfirmationState !== 'WAIT_RETEST_TOUCH';
  const status = trade.status === 'PENDING_ENTRY'
    ? `${emaFanWaitingConfirmation ? 'CHỜ NẾN 5M XÁC NHẬN' : 'CHỜ RETEST'} · ${number(trade.leverage, 0, 'x')}`
    : trade.status === 'OPEN'
    ? `${number(trade.netRoe, 1, '%')} · ${number(trade.netPnl, 4, ' USDT')}`
    : trade.status === 'CANCELLED'
    ? `${escapeHtml(trade.outcome)} · KHÔNG FILL`
    : `${escapeHtml(trade.outcome)} · ${number(trade.netRoe, 1, '%')}`;
  const canOrder = trade.status === 'OPEN'
    || (trade.status === 'PENDING_ENTRY' && trade.labelKey !== 'EMA_FAN_LONG_READY');
  const serverOrderState = String(trade.binanceEntryState ?? '');
  const uiState = binanceOrderUiStates.get(String(trade.id)) ?? null;
  const lockedByServer = serverOrderState === 'SUBMITTING';
  const controlsLocked = lockedByServer || uiState?.pending === true;
  const tradeId = String(trade.id);
  const settings = board?.paper?.settings ?? {};
  const entryDraft = binanceEntryDrafts.get(tradeId) ?? trade.entryPrice;
  const defaultMargin = trade.labelKey === 'UP_BASE_SWEEP_LONG_READY'
    ? settings.baseLongBinanceMarginUsdt ?? 2
    : settings.baseBinanceMarginUsdt ?? 2;
  const marginDraft = binanceMarginDrafts.get(tradeId) ?? defaultMargin;
  const leverageDraft = 5;
  const serverEntryPrice = Number(trade.binanceEntryPrice);
  const serverOrderMessage = serverOrderState === 'FILLED' && serverEntryPrice > 0
    ? `ĐÃ VÀO LỆNH GIÁ ${price(serverEntryPrice)}`
    : serverOrderState === 'MANUAL_LIMIT_SUBMITTED' && serverEntryPrice > 0
      ? `ĐÃ ĐẶT LIMIT GIÁ ${price(serverEntryPrice)}`
      : lockedByServer
        ? 'ĐANG GỬI LỆNH...'
        : `$${number(marginDraft, 2)} × ${number(leverageDraft, 0, 'x')}`;
  const orderStatusText = uiState?.message ?? serverOrderMessage;
  const orderControls = canOrder ? `
    <div class="flow-v2-real-order" data-flow-trade-id="${escapeHtml(trade.id)}">
      <div class="flow-v2-real-inputs">
        <label>ENTRY<input data-flow-entry type="number" min="0" step="any" value="${escapeHtml(entryDraft)}" ${controlsLocked ? 'disabled' : ''}></label>
        <label>MARGIN<input data-flow-margin type="number" min="0.01" max="10000" step="0.5" value="${escapeHtml(marginDraft)}" ${controlsLocked ? 'disabled' : ''}></label>
        <label>LEV<input data-flow-leverage type="number" min="5" max="5" step="1" value="${escapeHtml(leverageDraft)}" readonly ${controlsLocked ? 'disabled' : ''}></label>
      </div>
      <div class="flow-v2-real-buttons"><button type="button" data-flow-order-type="LIMIT" ${controlsLocked ? 'disabled' : ''}>LIMIT THẬT</button><button type="button" class="is-market" data-flow-order-type="MARKET" ${controlsLocked ? 'disabled' : ''}>MARKET THẬT</button></div>
      <small class="${uiState?.error ? 'is-error' : uiState?.success ? 'is-success' : ''}">${escapeHtml(orderStatusText)}</small>
    </div>` : '';
  return `
    <article class="flow-v2-paper-row ${sideClass} ${resultClass} ${canOrder ? 'has-real-order' : ''}">
      <div><strong><span class="flow-v2-paper-symbol">${escapeHtml(trade.symbol)}</span> · <span class="flow-v2-paper-side">${escapeHtml(trade.side)}</span></strong><small>${escapeHtml(trade.label ?? trade.labelKey ?? '--')}</small><small>${dateTime(trade.entryAt ?? trade.pendingSince)}${paperBinanceState(trade)}</small>${paperExternalLinks(trade.symbol)}</div>
      <span>${trade.status === 'PENDING_ENTRY' ? 'Limit chờ' : 'Entry'}<br><b>${price(trade.entryPrice)}</b></span>
      <span>TP / SL<br><b>${price(trade.takeProfit)} / ${price(trade.stopLoss)}</b></span>
      <span>Mark / age<br><b>${price(trade.markPrice)} · ${duration(trade.ageMs)}</b></span>
      <span class="flow-v2-paper-result ${pnlClass}">${status}</span>
      ${orderControls}
    </article>
  `;
}

async function placeLiquidFlowV2BinanceOrder(tradeId, orderType) {
  const visibleTrades = [
    ...(paperStatsView?.openTrades ?? []),
    ...(board?.paper?.trades ?? []),
  ];
  const trade = visibleTrades.find((row) => String(row.id) === String(tradeId));
  if (!trade) return;
  const container = els.paperOpenList.querySelector(`[data-flow-trade-id="${CSS.escape(String(tradeId))}"]`);
  const entryPrice = Number(container?.querySelector('[data-flow-entry]')?.value);
  const marginUsdt = Number(container?.querySelector('[data-flow-margin]')?.value);
  const leverage = 5;
  if (orderType === 'LIMIT' && !(entryPrice > 0)) {
    binanceOrderUiStates.set(String(tradeId), { error: true, message: 'Entry LIMIT không hợp lệ' });
    renderPaper(currentPaperView());
    return;
  }
  if (!(marginUsdt > 0) || marginUsdt > 10_000) {
    binanceOrderUiStates.set(String(tradeId), { error: true, message: 'Margin phải trong khoảng 0-10,000 USDT' });
    renderPaper(currentPaperView());
    return;
  }
  let token = localStorage.getItem('orders_token') ?? '';
  if (!token) {
    try {
      token = await recoverOrdersToken();
    } catch (error) {
      binanceOrderUiStates.set(String(tradeId), { error: true, message: error.message });
      renderPaper(currentPaperView());
      return;
    }
  }
  if (!token) {
    binanceOrderUiStates.set(String(tradeId), {
      error: true,
      message: `Mở /orders trên đúng ${location.host} rồi đăng nhập`,
    });
    renderPaper(currentPaperView());
    return;
  }
  const detail = `${trade.symbol} ${trade.side} · ${orderType}${orderType === 'LIMIT' ? ` @ ${price(entryPrice)}` : ''} · $${number(marginUsdt, 2)} × ${number(leverage, 0, 'x')}`;
  if (!confirm(
    `Đặt LỆNH THẬT Binance?\n\n${detail}`
    + '\n\nVị thế mới: TP/SL lấy theo plan và neo theo fill.'
    + '\nDCA cùng chiều: chỉ thêm khối lượng, giữ nguyên TP/SL đang có.',
  )) return;

  binanceOrderUiStates.set(String(tradeId), { pending: true, message: `ĐANG ĐẶT ${orderType}...` });
  renderPaper(currentPaperView());
  try {
    const requestBody = { tradeId, orderType, entryPrice, marginUsdt, leverage };
    let result;
    try {
      result = await submitLiquidFlowV2BinanceOrder(requestBody, token);
    } catch (error) {
      if (error.status !== 401) throw error;
      localStorage.removeItem('orders_token');
      token = await recoverOrdersToken();
      if (!token) throw new Error(`Phiên /orders của ${location.host} đã hết hạn; hãy đăng nhập lại.`);
      result = await submitLiquidFlowV2BinanceOrder(requestBody, token);
    }
    const protectionNote = result.protectionSuppressedForDca ? ' · DCA GIỮ TP/SL CŨ' : '';
    binanceOrderUiStates.set(String(tradeId), {
      success: true,
      message: result.orderType === 'MARKET'
        ? `ĐÃ VÀO LỆNH GIÁ ${price(result.entryPrice)}${protectionNote}`
        : `ĐÃ ĐẶT LIMIT GIÁ ${price(result.entryPrice ?? entryPrice)}${protectionNote}`,
    });
  } catch (error) {
    binanceOrderUiStates.set(String(tradeId), { error: true, message: error.message });
  }
  renderPaper(currentPaperView());
}

function paperTradeTimestamp(trade) {
  const raw = trade.closedAt ?? trade.cancelledAt ?? trade.entryAt ?? trade.pendingSince ?? 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function paperExternalLinks(symbol) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  if (!normalizedSymbol) return '';
  const coin = normalizedSymbol.replace(/USDT$/, '');
  const binanceUrl = `https://www.binance.com/vi/futures/${encodeURIComponent(normalizedSymbol)}`;
  const coinglassUrl = `https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=${encodeURIComponent(coin)}`;
  return `
    <small class="flow-v2-paper-links">
      <a class="is-binance" href="${binanceUrl}" target="_blank" rel="noopener noreferrer" aria-label="Mở ${escapeHtml(normalizedSymbol)} trên Binance Futures">BINANCE ↗</a>
      <a class="is-coinglass" href="${coinglassUrl}" target="_blank" rel="noopener noreferrer" aria-label="Mở heatmap ${escapeHtml(coin)} trên Coinglass">COINGLASS ↗</a>
    </small>
  `;
}

function renderClosedPaperPage(paper = {}) {
  if (Array.isArray(paper.closedTrades) && paper.pagination) {
    const pagination = paper.pagination;
    closedPaperPage = Number(pagination.page) || 1;
    els.paperClosedList.innerHTML = paper.closedTrades.map(paperRow).join('')
      || '<div class="flow-v2-empty">Chưa có lệnh đóng.</div>';
    els.paperClosedPageInfo.textContent = `Trang ${closedPaperPage} / ${pagination.totalPages ?? 1} · ${pagination.totalRecords ?? 0} lệnh`;
    els.paperClosedPrev.disabled = closedPaperPage <= 1;
    els.paperClosedNext.disabled = closedPaperPage >= Number(pagination.totalPages ?? 1);
    els.paperClosedPagination.classList.toggle('is-empty', Number(pagination.totalRecords ?? 0) === 0);
    return;
  }
  const closed = (paper.trades ?? [])
    .filter((trade) => ['CLOSED', 'CANCELLED'].includes(trade.status))
    .sort((a, b) => paperTradeTimestamp(b) - paperTradeTimestamp(a));
  const totalPages = Math.max(1, Math.ceil(closed.length / CLOSED_PAPER_PAGE_SIZE));
  closedPaperPage = Math.min(Math.max(1, closedPaperPage), totalPages);
  const start = (closedPaperPage - 1) * CLOSED_PAPER_PAGE_SIZE;
  const pageRows = closed.slice(start, start + CLOSED_PAPER_PAGE_SIZE);

  els.paperClosedList.innerHTML = pageRows.map(paperRow).join('')
    || '<div class="flow-v2-empty">Chưa có lệnh đóng.</div>';
  els.paperClosedPageInfo.textContent = `Trang ${closedPaperPage} / ${totalPages} · ${closed.length} lệnh`;
  els.paperClosedPrev.disabled = closedPaperPage <= 1;
  els.paperClosedNext.disabled = closedPaperPage >= totalPages;
  els.paperClosedPagination.classList.toggle('is-empty', closed.length === 0);
}

function renderPaperLabelBreakdown(paper = {}) {
  const rows = paper.labelStats ?? [];
  els.paperLabelBreakdown.innerHTML = rows.map((stat) => `
    <tr>
      <td><strong>${escapeHtml(stat.label)}</strong><small>${escapeHtml(stat.key)}</small></td>
      <td>${signalControlHtml(stat.key)}</td>
      <td>${stat.open ?? 0} / ${stat.pending ?? 0}</td>
      <td>${stat.closed ?? 0}${stat.cancelled ? ` <small>· hủy ${stat.cancelled}</small>` : ''}</td>
      <td>${stat.wins ?? 0} / ${stat.losses ?? 0}</td>
      <td>${stat.closed ? number(stat.winRate, 1, '%') : '--'}</td>
      <td>${stat.profitFactor == null ? ((stat.netPnl ?? 0) > 0 ? '∞' : '--') : number(stat.profitFactor, 2)}</td>
      <td class="${signedClass(stat.netPnl)}">${number(stat.netPnl, 4, ' USDT')}</td>
      <td class="${signedClass(stat.avgRoe)}">${stat.closed ? number(stat.avgRoe, 1, '%') : '--'}</td>
    </tr>`).join('') || '<tr><td colspan="9">Không có giao dịch trong bộ lọc.</td></tr>';
}

function syncPaperLabelOptions(paper = {}) {
  const selected = paper.filters?.labelKey ?? els.paperLabelFilter.value ?? 'ALL';
  els.paperLabelFilter.innerHTML = [
    '<option value="ALL">Tất cả nhãn</option>',
    ...(paper.labels ?? []).map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`),
  ].join('');
  els.paperLabelFilter.value = [...els.paperLabelFilter.options].some((option) => option.value === selected) ? selected : 'ALL';
}

function renderPaper(paper = {}) {
  const settings = paper.settings ?? {};
  els.autoPaperEnabled.checked = settings.autoEnabled === true;
  els.autoPaperState.textContent = settings.autoEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT';
  els.autoPaperRuleNote.textContent = `Paper $${number(settings.marginUsdt, 0)} · mọi nhãn ${number(settings.leverage, 0, 'x')} · SL -${number(settings.hardStopRoe, 0, '%')} / TP tối thiểu +${number(settings.minTakeProfitRoe, 0, '%')} gross ROE · HTF 15m chỉ paper đánh giá; PRE thử Binance $${number(settings.preBinanceMarginUsdt, 0)} × ${number(settings.preBinanceLeverage, 0, 'x')}; BASE LONG/SHORT $${number(settings.baseBinanceMarginUsdt, 0)} × ${number(settings.baseBinanceLeverage, 0, 'x')}.`;
  els.paperUpdatedAt.textContent = paper.updatedAt ? `Cập nhật ${new Date(paper.updatedAt).toLocaleString('vi-VN')}` : 'Chưa có paper trade.';
  els.paperOpenCount.textContent = `${paper.open ?? 0} / ${paper.pending ?? 0}`;
  els.paperClosedCount.textContent = paper.closed ?? 0;
  els.paperWinLoss.textContent = `${paper.wins ?? 0} / ${paper.losses ?? 0}`;
  els.paperWinRate.textContent = paper.closed ? number(paper.winRate, 1, '%') : '--';
  els.paperNetPnl.textContent = number(paper.netPnl, 4, ' USDT');
  els.paperNetPnl.className = signedClass(paper.netPnl);
  els.paperAvgRoe.textContent = paper.closed ? number(paper.avgRoe, 1, '%') : '--';
  els.paperAvgRoe.className = signedClass(paper.avgRoe);
  const trades = paper.trades ?? [];
  const open = paper.openTrades ?? trades.filter((trade) => ['OPEN', 'PENDING_ENTRY'].includes(trade.status));
  els.paperOpenList.innerHTML = open.map(paperRow).join('') || '<div class="flow-v2-empty">Chưa có lệnh mở; hệ thống đang chờ nhãn READY.</div>';
  if (Array.isArray(paper.labelStats)) {
    syncPaperLabelOptions(paper);
    renderPaperLabelBreakdown(paper);
    const filters = paper.filters ?? {};
    const range = filters.fromDay || filters.toDay
      ? `${filters.fromDay || 'đầu lịch sử'} → ${filters.toDay || 'hiện tại'}`
      : 'toàn bộ lịch sử';
    const selectedLabel = els.paperLabelFilter.selectedOptions[0]?.textContent ?? 'Tất cả nhãn';
    els.paperFilterNote.textContent = `Ngày vào paper · Asia/Bangkok · ${range} · ${selectedLabel}`;
  }
  renderClosedPaperPage(paper);
  els.autoPaperRuleNote.textContent += ` EMA FAN thường: chạm EMA13 +${number(settings.emaFanRegularLimitBufferPct, 1, '%')} trong ${number((settings.emaFanRegularEntryTimeoutMs ?? 0) / 60_000, 0, 'm')} chỉ arm retest; phải có nến 5m đóng reclaim EMA13 + higher-low + taker mua và fan chưa co/đảo, rồi paper mới OPEN và Binance MARKET $${number(settings.emaFanBinanceMarginUsdt, 0)}. EMA FAN IMPULSE: MARKET Binance $${number(settings.emaFanImpulseBinanceMarginUsdt, 0)} ngay. Tất cả ${number(settings.emaFanBinanceLeverage, 0, 'x')}; SHORT vẫn PAPER ONLY; TP +${number(settings.emaFanTakeProfitRoe, 0, '%')} / SL -${number(settings.emaFanHardStopRoe, 0, '%')}.`;
}

function filteredRows() {
  const rows = [...(board?.rows ?? [])];
  const classifications = (row) => [
    row.classification,
    ...(Array.isArray(row.classification?.secondaryLabels) ? row.classification.secondaryLabels : []),
  ];
  if (activeFilter === 'READY') return rows.filter((row) => classifications(row).some((item) => item?.phase === 'READY'));
  if (activeFilter === 'SHORT') return rows.filter((row) => classifications(row).some((item) => item?.side === 'SHORT'));
  if (activeFilter === 'LONG') return rows.filter((row) => classifications(row).some((item) => item?.side === 'LONG'));
  return rows;
}

function renderSignals() {
  const rows = filteredRows();
  els.signalGrid.innerHTML = rows.map(signalCard).join('')
    || '<div class="flow-v2-empty">Không có symbol khớp bộ lọc ở snapshot này.</div>';
}

function render(data) {
  board = data;
  renderHeader(data);
  renderLabelStats(data.stats);
  renderPaper(paperStatsView ?? data.paper);
  renderSignals();
  const incomingPaperUpdatedAt = data.paper?.updatedAt ?? null;
  if (paperStatsView && incomingPaperUpdatedAt !== lastPaperStatsUpdatedAt && !paperStatsReloadTimer) {
    paperStatsReloadTimer = setTimeout(() => {
      paperStatsReloadTimer = null;
      loadPaperStats();
    }, 750);
  }
}

async function updateAutoPaper(enabled) {
  els.autoPaperEnabled.disabled = true;
  els.autoPaperState.textContent = 'ĐANG LƯU';
  try {
    const paper = await jsonApi('/api/liquid-flow-v2-paper-settings', {
      method: 'POST',
      body: JSON.stringify({ autoEnabled: enabled }),
    });
    board = { ...(board ?? {}), paper };
    if (paperStatsView) paperStatsView = { ...paperStatsView, settings: paper.settings, updatedAt: paper.updatedAt };
    renderPaper(currentPaperView());
    renderSignals();
    await loadPaperStats();
  } catch (error) {
    els.autoPaperEnabled.checked = !enabled;
    els.autoPaperState.textContent = 'LỖI';
    alert(`Không lưu được Auto Paper: ${error.message}`);
  } finally {
    els.autoPaperEnabled.disabled = false;
  }
}

async function loadWhitelist() {
  const data = await jsonApi('/api/live-card-whitelist');
  enabledWhitelistKeys = new Set(data.enabledKeys ?? []);
  if (board) renderLabelStats(board.stats);
}

function bangkokToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function loadPaperStats({ resetPage = false } = {}) {
  if (resetPage) closedPaperPage = 1;
  const requestSequence = ++paperStatsRequestSequence;
  const params = new URLSearchParams({
    labelKey: els.paperLabelFilter.value || 'ALL',
    page: String(closedPaperPage),
    pageSize: String(CLOSED_PAPER_PAGE_SIZE),
  });
  if (els.paperFromDay.value) params.set('fromDay', els.paperFromDay.value);
  if (els.paperToDay.value) params.set('toDay', els.paperToDay.value);
  const buttons = els.paperStatsFilters.querySelectorAll('button');
  buttons.forEach((button) => { button.disabled = true; });
  els.paperFilterNote.textContent = 'Đang tổng hợp toàn bộ lịch sử paper...';
  try {
    const paper = await jsonApi(`/api/liquid-flow-v2-paper-stats?${params}`);
    if (requestSequence !== paperStatsRequestSequence) return;
    paperStatsView = paper;
    closedPaperPage = paper.pagination?.page ?? closedPaperPage;
    lastPaperStatsUpdatedAt = paper.updatedAt ?? null;
    renderPaper(paper);
  } catch (error) {
    if (requestSequence !== paperStatsRequestSequence) return;
    els.paperFilterNote.textContent = `Không tải được thống kê: ${error.message}`;
  } finally {
    if (requestSequence === paperStatsRequestSequence) {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }
}

function captureBinanceSignalSettingDraft(control) {
  const labelKey = control?.dataset?.labelKey ?? '';
  const enabledInput = control?.querySelector('.js-signal-binance-enabled');
  const marginInput = control?.querySelector('.js-signal-binance-margin');
  if (!labelKey || !enabledInput || !marginInput) return;
  binanceSignalSettingDrafts.set(labelKey, { enabled: enabledInput.checked, marginUsdt: marginInput.value });
  const switchText = control.querySelector('.flow-v2-row-switch span');
  const status = control.querySelector('.js-signal-binance-status');
  if (switchText) switchText.textContent = enabledInput.checked ? 'BẬT' : 'TẮT';
  if (status) {
    status.textContent = 'chưa lưu';
    status.className = 'js-signal-binance-status';
  }
}

async function saveBinanceSignalSetting(button) {
  const control = button.closest('.flow-v2-signal-order-control');
  const labelKey = control?.dataset?.labelKey ?? '';
  const enabledInput = control?.querySelector('.js-signal-binance-enabled');
  const marginInput = control?.querySelector('.js-signal-binance-margin');
  const status = control?.querySelector('.js-signal-binance-status');
  const marginUsdt = Number(marginInput?.value);
  if (!Number.isFinite(marginUsdt) || marginUsdt < 0.01 || marginUsdt > 10_000) {
    status.textContent = 'Margin phải trong khoảng 0.01..10000 USDT.';
    status.className = 'js-signal-binance-status is-negative';
    return;
  }
  button.disabled = true;
  status.textContent = 'Đang lưu…';
  status.className = 'js-signal-binance-status';
  try {
    const response = await ordersJsonApi('/api/liquid-flow-v2-binance-signal-settings', {
      method: 'POST',
      body: JSON.stringify({ labelKey, enabled: enabledInput.checked, marginUsdt }),
    });
    binanceSignalSettingsData.signals[labelKey] = response.setting;
    binanceSignalSettingsData.globalOrderEnabled = response.globalOrderEnabled;
    binanceSignalSettingsData.dryRun = response.dryRun;
    binanceSignalSettingsFingerprint = signalSettingsFingerprint(binanceSignalSettingsData);
    binanceSignalSettingDrafts.delete(labelKey);
    updateBinanceSettingsSyncState(true, 'ĐÃ LƯU');
    renderPaperLabelBreakdown(currentPaperView());
    announceBinanceSignalSettingsChange(labelKey);
  } catch (error) {
    status.textContent = `Không lưu được: ${error.message}`;
    status.className = 'js-signal-binance-status is-negative';
  } finally {
    button.disabled = false;
  }
}

async function toggleWhitelist(input) {
  const key = input.dataset.whitelistKey;
  const enabled = input.checked;
  if (enabled && !confirm(`Thêm nhãn V2 vào whitelist thống kê?\n\n${key}\n\nCheckbox không cấp lệnh; rule Binance PRE/BASE chạy độc lập.`)) {
    input.checked = false;
    return;
  }
  input.disabled = true;
  try {
    const data = await jsonApi('/api/live-card-whitelist', {
      method: 'POST',
      body: JSON.stringify({ key, enabled }),
    });
    enabledWhitelistKeys = new Set(data.enabledKeys ?? []);
    renderLabelStats(board?.stats ?? []);
  } catch (error) {
    input.checked = !enabled;
    alert(`Không lưu được whitelist: ${error.message}`);
  } finally {
    input.disabled = false;
  }
}

async function loadBoard() {
  els.refreshButton.disabled = true;
  try {
    render(await jsonApi('/api/liquid-flow-v2'));
  } catch (error) {
    console.error('[LiquidFlowV2] load board failed:', error);
    els.socketStatus.textContent = `Không tải được V2: ${error.message}`;
    els.socketDot.className = 'flow-v2-socket-dot is-error';
  } finally {
    els.refreshButton.disabled = false;
  }
}

function connectStream() {
  if (!window.EventSource || stream) return;
  stream = new EventSource('/api/liquid-flow-v2-stream');
  stream.onopen = () => {
    els.socketDot.className = 'flow-v2-socket-dot is-open';
  };
  stream.onmessage = (event) => {
    try { render(JSON.parse(event.data)); } catch (error) {
      console.error('[LiquidFlowV2] stream render failed:', error);
    }
  };
  stream.onerror = () => {
    els.socketDot.className = 'flow-v2-socket-dot is-error';
    stream.close();
    stream = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectStream, 3000);
  };
}

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
    renderSignals();
  });
});

els.labelStats.addEventListener('change', (event) => {
  const input = event.target.closest('[data-whitelist-key]');
  if (input) toggleWhitelist(input);
});
els.paperLabelBreakdown.addEventListener('input', (event) => {
  const input = event.target.closest('.js-signal-binance-margin');
  if (input) captureBinanceSignalSettingDraft(input.closest('.flow-v2-signal-order-control'));
});
els.paperLabelBreakdown.addEventListener('change', (event) => {
  const input = event.target.closest('.js-signal-binance-enabled');
  if (input) captureBinanceSignalSettingDraft(input.closest('.flow-v2-signal-order-control'));
});
els.paperLabelBreakdown.addEventListener('click', (event) => {
  const button = event.target.closest('.js-signal-binance-save');
  if (button) saveBinanceSignalSetting(button);
});
els.paperOpenList.addEventListener('input', (event) => {
  const input = event.target.closest('[data-flow-entry], [data-flow-margin]');
  const container = input?.closest('[data-flow-trade-id]');
  if (!input || !container) return;
  const tradeId = container.dataset.flowTradeId;
  if (input.matches('[data-flow-entry]')) binanceEntryDrafts.set(tradeId, input.value);
  if (input.matches('[data-flow-margin]')) binanceMarginDrafts.set(tradeId, input.value);
});
els.paperOpenList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-flow-order-type]');
  const container = button?.closest('[data-flow-trade-id]');
  if (button && container) placeLiquidFlowV2BinanceOrder(container.dataset.flowTradeId, button.dataset.flowOrderType);
});
els.refreshButton.addEventListener('click', loadBoard);
els.autoPaperEnabled.addEventListener('change', () => updateAutoPaper(els.autoPaperEnabled.checked));
els.paperClosedPrev.addEventListener('click', () => {
  closedPaperPage = Math.max(1, closedPaperPage - 1);
  if (paperStatsView) loadPaperStats();
  else renderClosedPaperPage(board?.paper ?? {});
});
els.paperClosedNext.addEventListener('click', () => {
  closedPaperPage += 1;
  if (paperStatsView) loadPaperStats();
  else renderClosedPaperPage(board?.paper ?? {});
});
els.paperStatsFilters.addEventListener('submit', (event) => {
  event.preventDefault();
  loadPaperStats({ resetPage: true });
});
els.paperFilterToday.addEventListener('click', () => {
  const today = bangkokToday();
  els.paperFromDay.value = today;
  els.paperToDay.value = today;
  loadPaperStats({ resetPage: true });
});
els.paperFilterAll.addEventListener('click', () => {
  els.paperFromDay.value = '';
  els.paperToDay.value = '';
  els.paperLabelFilter.value = 'ALL';
  loadPaperStats({ resetPage: true });
});
binanceSignalSettingsChannel?.addEventListener('message', () => loadBinanceSignalSettings({ quiet: true }));
window.addEventListener('storage', (event) => {
  if (event.key === BINANCE_SIGNAL_SETTINGS_SYNC_STORAGE_KEY) loadBinanceSignalSettings({ quiet: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadBinanceSignalSettings({ quiet: true });
});
binanceSignalSettingsSyncTimer = setInterval(() => {
  if (document.visibilityState === 'visible') loadBinanceSignalSettings({ quiet: true });
}, BINANCE_SIGNAL_SETTINGS_SYNC_MS);
window.addEventListener('beforeunload', () => {
  clearInterval(binanceSignalSettingsSyncTimer);
  binanceSignalSettingsChannel?.close();
});
Promise.allSettled([loadWhitelist(), loadBoard(), loadPaperStats(), loadBinanceSignalSettings()]).finally(connectStream);
