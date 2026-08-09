import {
  binanceCardAvgRoeAttrs,
  isBinanceCardAvgRoeEligible,
} from './binance-card-visibility.js';
import {
  matchesLiquidStableMechanismFilter,
  normalizeLiquidStableMechanismFilter,
} from './liquid-stable-mechanism-filter.js';

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
  liquidMarketHealth: document.getElementById('liquidMarketHealth'),
  liquidMarketHealthLabel: document.getElementById('liquidMarketHealthLabel'),
  liquidMarketHealthConfidence: document.getElementById('liquidMarketHealthConfidence'),
  liquidMarketHealthDescription: document.getElementById('liquidMarketHealthDescription'),
  liquidMarketHealthLive: document.getElementById('liquidMarketHealthLive'),
  liquidMarketHealthLiveText: document.getElementById('liquidMarketHealthLiveText'),
  liquidMarketLongScore: document.getElementById('liquidMarketLongScore'),
  liquidMarketShortScore: document.getElementById('liquidMarketShortScore'),
  liquidMarketLongBar: document.getElementById('liquidMarketLongBar'),
  liquidMarketShortBar: document.getElementById('liquidMarketShortBar'),
  liquidMarketLongDetail: document.getElementById('liquidMarketLongDetail'),
  liquidMarketLongWave: document.getElementById('liquidMarketLongWave'),
  liquidMarketShortDetail: document.getElementById('liquidMarketShortDetail'),
  liquidMarketShortWave: document.getElementById('liquidMarketShortWave'),
  liquidMarketBreadth1h: document.getElementById('liquidMarketBreadth1h'),
  liquidMarketBreadth3h: document.getElementById('liquidMarketBreadth3h'),
  liquidMarketBreadth6h: document.getElementById('liquidMarketBreadth6h'),
  liquidMarketBtc15m: document.getElementById('liquidMarketBtc15m'),
  liquidMarketBtc1h: document.getElementById('liquidMarketBtc1h'),
  liquidMarketBtc6h: document.getElementById('liquidMarketBtc6h'),
  liquidMarketHealthReasons: document.getElementById('liquidMarketHealthReasons'),
  liquidMarketHealthSample: document.getElementById('liquidMarketHealthSample'),
  liquidMarketHealthPending: document.getElementById('liquidMarketHealthPending'),
  liquidShortEdgeCycle: document.getElementById('liquidShortEdgeCycle'),
  liquidShortEdgeCycleLabel: document.getElementById('liquidShortEdgeCycleLabel'),
  liquidShortEdgeCycleAge: document.getElementById('liquidShortEdgeCycleAge'),
  liquidShortEdgeShortSlope: document.getElementById('liquidShortEdgeShortSlope'),
  liquidShortEdgeLongSlope: document.getElementById('liquidShortEdgeLongSlope'),
  liquidShortEdgeDrop: document.getElementById('liquidShortEdgeDrop'),
  liquidShortEdgeBtc15m: document.getElementById('liquidShortEdgeBtc15m'),
  liquidShortEdgeDeclineSamples: document.getElementById('liquidShortEdgeDeclineSamples'),
  liquidShortEdgeTransition: document.getElementById('liquidShortEdgeTransition'),
  shortWaveStatsSection: document.getElementById('shortWaveStatsSection'),
  shortWaveStatsMeta: document.getElementById('shortWaveStatsMeta'),
  shortWaveStatsGrid: document.getElementById('shortWaveStatsGrid'),
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
  liquidPaperOverview: document.getElementById('liquidPaperOverview'),
  liquidStage2Section: document.getElementById('liquidStage2Section'),
  liquidStage2Stats: document.getElementById('liquidStage2Stats'),
  liquidStage3Section: document.getElementById('liquidStage3Section'),
  liquidStage3Stats: document.getElementById('liquidStage3Stats'),
  liquidStage3Filter: document.getElementById('liquidStage3Filter'),
  liquidLongCorrReboundSection: document.getElementById('liquidLongCorrReboundSection'),
  liquidLongCorrReboundStats: document.getElementById('liquidLongCorrReboundStats'),
  liquidStableMechanismSection: document.getElementById('liquidStableMechanismSection'),
  liquidStableMechanismStats: document.getElementById('liquidStableMechanismStats'),
  liquidStableMechanismFilter: document.getElementById('liquidStableMechanismFilter'),
  liquidLongBtcExpansionSection: document.getElementById('liquidLongBtcExpansionSection'),
  liquidLongBtcExpansionStats: document.getElementById('liquidLongBtcExpansionStats'),
  liquidComboBtcBreadthSection: document.getElementById('liquidComboBtcBreadthSection'),
  liquidComboBtcBreadthStats: document.getElementById('liquidComboBtcBreadthStats'),
  liquidStage4Section: document.getElementById('liquidStage4Section'),
  liquidStage4Stats: document.getElementById('liquidStage4Stats'),
  liquidStage4Filter: document.getElementById('liquidStage4Filter'),
  liquidEdgeActivePointSection: document.getElementById('liquidEdgeActivePointSection'),
  liquidEdgeActivePointStats: document.getElementById('liquidEdgeActivePointStats'),
  liquidMarketPointPhaseSection: document.getElementById('liquidMarketPointPhaseSection'),
  liquidMarketPointPhaseStats: document.getElementById('liquidMarketPointPhaseStats'),
  liquidBtcWaveSection: document.getElementById('liquidBtcWaveSection'),
  liquidBtcWaveStats: document.getElementById('liquidBtcWaveStats'),
  liquidBtcWaveFilter: document.getElementById('liquidBtcWaveFilter'),
  liquidBtcWaveRangeNote: document.getElementById('liquidBtcWaveRangeNote'),
  liquidWaveContinuationStats: document.getElementById('liquidWaveContinuationStats'),
  liquidLongMarketSection: document.getElementById('liquidLongMarketSection'),
  liquidLongMarketStats: document.getElementById('liquidLongMarketStats'),
  liquidLongMarketFilter: document.getElementById('liquidLongMarketFilter'),
  liquidLongSessionSection: document.getElementById('liquidLongSessionSection'),
  liquidLongSessionStats: document.getElementById('liquidLongSessionStats'),
  liquidLongSessionFilter: document.getElementById('liquidLongSessionFilter'),
  liquidLongMechanismSection: document.getElementById('liquidLongMechanismSection'),
  liquidLongMechanismStats: document.getElementById('liquidLongMechanismStats'),
  liquidLongPointPhaseSection: document.getElementById('liquidLongPointPhaseSection'),
  liquidLongPointPhaseStats: document.getElementById('liquidLongPointPhaseStats'),
  liquidRunner30Section: document.getElementById('liquidRunner30Section'),
  liquidRunner30Stats: document.getElementById('liquidRunner30Stats'),
  liquidRunnerDirectionSection: document.getElementById('liquidRunnerDirectionSection'),
  liquidRunnerDirectionStats: document.getElementById('liquidRunnerDirectionStats'),
  liquidRunnerDirectionFilter: document.getElementById('liquidRunnerDirectionFilter'),
  liquidComboTodaySection: document.getElementById('liquidComboTodaySection'),
  liquidComboTodaySummary: document.getElementById('liquidComboTodaySummary'),
  liquidComboTodayGood: document.getElementById('liquidComboTodayGood'),
  liquidComboCycleSection: document.getElementById('liquidComboCycleSection'),
  liquidComboCycleSummary: document.getElementById('liquidComboCycleSummary'),
  liquidComboCycleStable: document.getElementById('liquidComboCycleStable'),
  liquidComboCycleFormingWrap: document.getElementById('liquidComboCycleFormingWrap'),
  liquidComboCycleFormingSummary: document.getElementById('liquidComboCycleFormingSummary'),
  liquidComboCycleForming: document.getElementById('liquidComboCycleForming'),
  liquidComboStats: document.getElementById('liquidComboStats'),
  liquidPaperDateFrom: document.getElementById('liquidPaperDateFrom'),
  liquidPaperDateTo: document.getElementById('liquidPaperDateTo'),
  liquidPaperDateFilter: document.getElementById('liquidPaperDateFilter'),
  liquidPaperDateSearchButton: document.getElementById('liquidPaperDateSearchButton'),
  liquidPaperTodayButton: document.getElementById('liquidPaperTodayButton'),
  liquidPaperAllDatesButton: document.getElementById('liquidPaperAllDatesButton'),
  liquidPaperDateStatus: document.getElementById('liquidPaperDateStatus'),
  liquidPaperLiveStatus: document.getElementById('liquidPaperLiveStatus'),
  liquidPaperSocketText: document.getElementById('liquidPaperSocketText'),
  liquidLiveCardStatus: document.getElementById('liquidLiveCardStatus'),
  actionResult: document.getElementById('actionResult'),
};

let scanData = null;
let renderedRows = [];
let paperTrades = [];
let liquidPaperSummary = null;
let liquidPaperComboStats = [];
let liquidComboCycleStats = null;
let liquidPaperDateFrom = '';
let liquidPaperDateTo = '';
let liquidPaperDateMode = 'today';
let liquidPaperDraftDateFrom = '';
let liquidPaperDraftDateTo = '';
let liquidPaperDraftDateMode = 'today';
let liquidPaperDateDirty = false;
let liquidPaperKnownToday = '';
let liquidPaperDateRolloverTimer = null;
let liquidPaperLoadRequestId = 0;
let liquidPaperLoadController = null;
let liquidStage3Filter = 'all';
let liquidStableMechanismFilter = 'all';
let liquidStage4Filter = 'all';
let liquidBtcWaveFilter = 'all';
let liquidLongMarketFilter = 'all';
let liquidLongSessionFilter = 'all';
let liquidRunnerDirectionFilter = 'all';
let autoPaperRunning = false;
let liquidPaperStream = null;
let liquidPaperSocketMode = 'connecting';
let liquidPaperLastMarkAt = 0;
let liquidLiveCardEnabledKeys = new Set();
let liquidLiveCardConfig = null;
let liquidPaperMarkSource = 'sse';
let liquidPaperSocketHealthTimer = null;
let liquidPaperClosedTotals = { count: 0, wins: 0, pnl: 0 };
let liquidPaperClosedTotalsReady = false;
let liquidPaperClosedGroupStats = null;
let liquidPaperClosedGroupStatsDirty = true;
let liquidMarketHealthData = null;
let liquidMarketHealthResponseAt = 0;
let liquidMarketHealthPollTimer = null;
let liquidMarketHealthClockTimer = null;
let shortWaveStatsData = null;
const LIQUID_SOCKET_FRESH_MS = 5_000;
const LIQUID_SOCKET_STALE_MS = 15_000;
const LIQUID_PAPER_DAY_TIME_ZONE = 'Asia/Bangkok';
const paperSort = { key: 'opened', dir: 'desc' };
const scanSort = { key: 'sweepProb', dir: 'desc' };

const liquidPaperDayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LIQUID_PAPER_DAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function liquidPaperDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(
    liquidPaperDayFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function liquidPaperTradeDayKey(trade) {
  return liquidPaperDayKey(trade?.createdAt ?? trade?.openedAt ?? trade?.closedAt ?? '');
}

function liquidPaperTradeMatchesDateRange(trade) {
  const day = liquidPaperTradeDayKey(trade);
  if (!day) return false;
  if (liquidPaperDateFrom && day < liquidPaperDateFrom) return false;
  if (liquidPaperDateTo && day > liquidPaperDateTo) return false;
  return true;
}

function liquidPaperSelectedRangeLabel() {
  if (!liquidPaperDateFrom && !liquidPaperDateTo) return 'toàn bộ lịch sử';
  if (liquidPaperDateFrom === liquidPaperDateTo) return liquidPaperDateFrom;
  if (!liquidPaperDateFrom) return `đến ${liquidPaperDateTo}`;
  if (!liquidPaperDateTo) return `từ ${liquidPaperDateFrom}`;
  return `${liquidPaperDateFrom} → ${liquidPaperDateTo}`;
}

function syncLiquidPaperDateControls() {
  if (els.liquidPaperDateFrom) els.liquidPaperDateFrom.value = liquidPaperDraftDateFrom;
  if (els.liquidPaperDateTo) els.liquidPaperDateTo.value = liquidPaperDraftDateTo;
  els.liquidPaperTodayButton?.classList.toggle('is-active', liquidPaperDraftDateMode === 'today');
  els.liquidPaperAllDatesButton?.classList.toggle('is-active', liquidPaperDraftDateMode === 'all');
  els.liquidPaperTodayButton?.setAttribute('aria-pressed', String(liquidPaperDraftDateMode === 'today'));
  els.liquidPaperAllDatesButton?.setAttribute('aria-pressed', String(liquidPaperDraftDateMode === 'all'));
  if (els.liquidPaperDateStatus) {
    els.liquidPaperDateStatus.textContent = liquidPaperDateDirty
      ? `Chưa áp dụng · bấm Search · ${LIQUID_PAPER_DAY_TIME_ZONE}`
      : liquidPaperDateMode === 'today'
        ? `Tự chuyển ngày mới · ${LIQUID_PAPER_DAY_TIME_ZONE}`
        : liquidPaperDateMode === 'all'
          ? 'Toàn bộ lịch sử'
          : `Khoảng ngày cố định · ${LIQUID_PAPER_DAY_TIME_ZONE}`;
  }
}

function setLiquidPaperDateSearchLoading(loading) {
  const button = els.liquidPaperDateSearchButton;
  if (button) {
    button.disabled = loading;
    button.classList.toggle('is-loading', loading);
    button.textContent = loading ? 'Đang tải...' : 'Search';
  }
  for (const control of [
    els.liquidPaperDateFrom,
    els.liquidPaperDateTo,
    els.liquidPaperTodayButton,
    els.liquidPaperAllDatesButton,
  ]) {
    if (control) control.disabled = loading;
  }
  els.liquidPaperDateFilter?.setAttribute('aria-busy', String(loading));
  if (loading && els.liquidPaperDateStatus) {
    els.liquidPaperDateStatus.textContent =
      `Đang tải ${liquidPaperSelectedRangeLabel()} · ${LIQUID_PAPER_DAY_TIME_ZONE}`;
  }
}

function setLiquidPaperToday({ reload = true, showLoading = false } = {}) {
  const today = liquidPaperDayKey();
  liquidPaperKnownToday = today;
  liquidPaperDateFrom = today;
  liquidPaperDateTo = today;
  liquidPaperDateMode = 'today';
  liquidPaperDraftDateFrom = today;
  liquidPaperDraftDateTo = today;
  liquidPaperDraftDateMode = 'today';
  liquidPaperDateDirty = false;
  syncLiquidPaperDateControls();
  if (reload) loadAutoPaperTrades({ showDateLoading: showLoading });
}

function stageLiquidPaperAllDates() {
  liquidPaperDraftDateFrom = '';
  liquidPaperDraftDateTo = '';
  liquidPaperDraftDateMode = 'all';
  liquidPaperDateDirty = liquidPaperDateMode !== 'all';
  syncLiquidPaperDateControls();
}

function stageLiquidPaperDateInputs(changedField) {
  let from = els.liquidPaperDateFrom?.value || '';
  let to = els.liquidPaperDateTo?.value || '';
  if (from && to && from > to) {
    if (changedField === 'from') to = from;
    else from = to;
  }
  liquidPaperDraftDateFrom = from;
  liquidPaperDraftDateTo = to;
  const today = liquidPaperDayKey();
  liquidPaperDraftDateMode = from === today && to === today
    ? 'today'
    : (!from && !to ? 'all' : 'custom');
  liquidPaperDateDirty = from !== liquidPaperDateFrom || to !== liquidPaperDateTo;
  syncLiquidPaperDateControls();
}

function applyLiquidPaperDateSearch() {
  liquidPaperDateFrom = liquidPaperDraftDateFrom;
  liquidPaperDateTo = liquidPaperDraftDateTo;
  liquidPaperDateMode = liquidPaperDraftDateMode;
  liquidPaperDateDirty = false;
  syncLiquidPaperDateControls();
  loadAutoPaperTrades({ showDateLoading: true });
}

function checkLiquidPaperDateRollover() {
  const today = liquidPaperDayKey();
  if (!today || today === liquidPaperKnownToday) return;
  liquidPaperKnownToday = today;
  if (liquidPaperDateMode !== 'today') return;
  liquidPaperDateFrom = today;
  liquidPaperDateTo = today;
  if (!liquidPaperDateDirty) {
    liquidPaperDraftDateFrom = today;
    liquidPaperDraftDateTo = today;
    liquidPaperDraftDateMode = 'today';
  }
  syncLiquidPaperDateControls();
  loadAutoPaperTrades();
}

function initializeLiquidPaperDateRange() {
  setLiquidPaperToday({ reload: false });
  if (!liquidPaperDateRolloverTimer) {
    liquidPaperDateRolloverTimer = window.setInterval(checkLiquidPaperDateRollover, 30_000);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkLiquidPaperDateRollover();
  });
  window.addEventListener('focus', checkLiquidPaperDateRollover);
}

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

const MARKET_DIRECTION_LABELS = {
  LONG_FAVORED: 'LONG FAVORED',
  SHORT_FAVORED: 'SHORT FAVORED',
  MARKET_CHOP: 'MARKET CHOP',
  MARKET_DISPERSION: 'MARKET DISPERSION',
  MARKET_TRANSITION: 'MARKET TRANSITION',
  MARKET_SHOCK: 'MARKET SHOCK',
  NO_DATA: 'NO DATA',
};

const SHORT_WAVE_LABELS = {
  SHORT_BUILDUP: 'SHORT BUILDUP',
  SHORT_IMPULSE: 'SHORT IMPULSE',
  SHORT_PEAK: 'SHORT PEAK',
  SHORT_FADE: 'SHORT FADE',
  BTC_CRASH_RECLAIM: 'BTC CRASH RECLAIM',
  SHORT_RELOAD: 'SHORT RELOAD',
  SHORT_NEUTRAL: 'SHORT NEUTRAL',
  SHORT_NO_DATA: 'SHORT NO DATA',
};

const LONG_WAVE_LABELS = {
  LONG_BUILDUP: 'LONG BUILDUP',
  LONG_IMPULSE: 'LONG IMPULSE',
  LONG_PEAK: 'LONG PEAK',
  LONG_FADE: 'LONG FADE',
  BTC_RALLY_REJECT: 'BTC RALLY REJECT',
  LONG_RELOAD: 'LONG RELOAD',
  LONG_NEUTRAL: 'LONG NEUTRAL',
  LONG_NO_DATA: 'LONG NO DATA',
};

function marketPct(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function marketBreadthPair(up, down) {
  const upValue = Number(up);
  const downValue = Number(down);
  if (!Number.isFinite(upValue) || !Number.isFinite(downValue)) return '-- / --';
  return `${upValue.toFixed(0)}% / ${downValue.toFixed(0)}%`;
}

function setMarketDirectionalValue(element, value) {
  if (!element) return;
  const n = Number(value);
  element.textContent = marketPct(value, 2);
  element.style.color = !Number.isFinite(n)
    ? ''
    : n > 0
      ? 'var(--green)'
      : n < 0
        ? 'var(--red)'
        : 'var(--muted)';
}

function renderLiquidMarketHealthClock() {
  if (!els.liquidMarketHealthLive || !els.liquidMarketHealthLiveText) return;
  const ageSeconds = liquidMarketHealthResponseAt > 0
    ? Math.max(0, Math.floor((Date.now() - liquidMarketHealthResponseAt) / 1000))
    : null;
  const socket = liquidMarketHealthData?.socket;
  const stale = Boolean(socket?.isStale) || (ageSeconds != null && ageSeconds > 60);
  const state = ageSeconds == null ? 'connecting' : stale ? 'stale' : 'live';
  els.liquidMarketHealthLive.classList.remove('is-connecting', 'is-live', 'is-stale');
  els.liquidMarketHealthLive.classList.add(`is-${state}`);
  if (state === 'connecting') {
    els.liquidMarketHealthLiveText.textContent = 'Realtime đang kết nối...';
  } else if (state === 'stale') {
    els.liquidMarketHealthLiveText.textContent = `Socket nến chậm · refresh ${ageSeconds}s`;
  } else {
    els.liquidMarketHealthLiveText.textContent = `Socket nến ổn · refresh ${ageSeconds}s · rolling 1h/3h/6h`;
  }
  renderLiquidShortEdgeCycle(liquidMarketHealthData?.shortEdgeCycle);
}

const SHORT_EDGE_CYCLE_LABELS = {
  SHORT_EDGE_INTACT: 'EDGE CHƯA DECAY',
  SHORT_EDGE_DECAY: 'EDGE DECAY ACTIVE',
  SHORT_EDGE_RECOVERY: 'EDGE RECOVERY / RELOAD',
  SHORT_EDGE_NO_DATA: 'EDGE NO DATA',
};

const SHORT_EDGE_TRANSITION_LABELS = {
  EDGE_INTACT_TO_DECAY: 'EDGE INTACT → EDGE DECAY',
  EDGE_DECAY_TO_RECOVERY: 'EDGE DECAY → RECOVERY',
};

function shortEdgeSigned(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return `${n >= 0 ? '+' : ''}${n.toFixed(0)}`;
}

function shortEdgeAgeText(startedAt) {
  const at = Number(startedAt);
  if (!Number.isFinite(at) || at <= 0) return '--';
  const minutes = Math.max(0, (Date.now() - at) / 60_000);
  if (minutes < 1) return '0 phút trong trạng thái';
  if (minutes < 60) return `${Math.floor(minutes)} phút trong chu kỳ`;
  return `${Math.floor(minutes / 60)}h ${Math.floor(minutes % 60)}m trong chu kỳ`;
}

function renderLiquidShortEdgeCycle(cycle = null) {
  const phase = String(cycle?.phase ?? 'SHORT_EDGE_NO_DATA').toUpperCase();
  if (els.liquidShortEdgeCycle) els.liquidShortEdgeCycle.dataset.edgePhase = phase;
  if (els.liquidShortEdgeCycleLabel) {
    els.liquidShortEdgeCycleLabel.textContent = SHORT_EDGE_CYCLE_LABELS[phase] ?? phase.replaceAll('_', ' ');
  }
  if (els.liquidShortEdgeCycleAge) {
    els.liquidShortEdgeCycleAge.textContent = shortEdgeAgeText(cycle?.phaseStartedAt);
  }
  if (els.liquidShortEdgeShortSlope) {
    els.liquidShortEdgeShortSlope.textContent = shortEdgeSigned(cycle?.shortScoreSlope);
  }
  if (els.liquidShortEdgeLongSlope) {
    els.liquidShortEdgeLongSlope.textContent = shortEdgeSigned(cycle?.longScoreSlope);
  }
  if (els.liquidShortEdgeDrop) {
    const drop = Number(cycle?.shortScoreDropFromPeak);
    els.liquidShortEdgeDrop.textContent = Number.isFinite(drop) ? `${drop.toFixed(0)} điểm` : '--';
  }
  if (els.liquidShortEdgeBtc15m) {
    els.liquidShortEdgeBtc15m.textContent = marketPct(cycle?.btcRet15m, 2);
  }
  if (els.liquidShortEdgeDeclineSamples) {
    const count = Number(cycle?.declineSamples);
    els.liquidShortEdgeDeclineSamples.textContent = Number.isFinite(count) ? `${count} mẫu` : '--';
  }
  if (els.liquidShortEdgeTransition) {
    const transition = cycle?.lastTransition;
    const transitionLabel = SHORT_EDGE_TRANSITION_LABELS[transition?.type];
    els.liquidShortEdgeTransition.textContent = transitionLabel
      ? `Lần đổi gần nhất: ${transitionLabel} · ${fmtTime(transition.at)}`
      : cycle?.dataAvailable
        ? 'Chưa ghi nhận lần đổi EDGE DECAY/RECOVERY kể từ khi service theo dõi.'
        : 'Chưa đủ score dynamics để xác định chu kỳ.';
  }
}

function renderLiquidMarketDirectionHealth(data) {
  if (!els.liquidMarketHealth || !data) return;
  liquidMarketHealthData = data;
  liquidMarketHealthResponseAt = Date.now();
  const label = String(data.label ?? data.rawLabel ?? 'NO_DATA').toUpperCase();
  const scores = data.scores ?? {};
  const breadth = data.breadth;
  const btc = data.btc;
  const dynamics = data.scoreDynamics ?? null;
  const longScore = Math.max(0, Math.min(100, Number(scores.long ?? 0)));
  const shortScore = Math.max(0, Math.min(100, Number(scores.short ?? 0)));

  els.liquidMarketHealth.dataset.marketLabel = label;
  els.liquidMarketHealth.classList.remove('is-loading');
  els.liquidMarketHealthLabel.textContent = MARKET_DIRECTION_LABELS[label] ?? label.replaceAll('_', ' ');
  els.liquidMarketHealthConfidence.textContent = `confidence ${Number(scores.confidence ?? 0).toFixed(0)}%`;
  els.liquidMarketHealthDescription.textContent = data.description ?? 'Đang đánh giá thị trường.';
  els.liquidMarketLongScore.textContent = longScore.toFixed(0);
  els.liquidMarketShortScore.textContent = shortScore.toFixed(0);
  els.liquidMarketLongBar.style.width = `${longScore}%`;
  els.liquidMarketShortBar.style.width = `${shortScore}%`;
  if (els.liquidMarketLongWave) {
    const longWaveState = String(dynamics?.longWaveState ?? 'LONG_NO_DATA').toUpperCase();
    els.liquidMarketLongWave.dataset.longWave = longWaveState;
    els.liquidMarketLongWave.textContent = dynamics?.longWaveLabel ?? LONG_WAVE_LABELS[longWaveState] ?? longWaveState.replaceAll('_', ' ');
    els.liquidMarketLongWave.title = dynamics?.longWaveDescription ?? 'Nhãn nhịp LONG chỉ dùng để quan sát.';
  }
  if (els.liquidMarketShortWave) {
    const waveState = String(dynamics?.shortWaveState ?? 'SHORT_NO_DATA').toUpperCase();
    els.liquidMarketShortWave.dataset.shortWave = waveState;
    els.liquidMarketShortWave.textContent = dynamics?.shortWaveLabel ?? SHORT_WAVE_LABELS[waveState] ?? waveState.replaceAll('_', ' ');
    els.liquidMarketShortWave.title = dynamics?.shortWaveDescription ?? 'Nhãn nhịp SHORT chỉ dùng để quan sát.';
  }

  if (breadth) {
    els.liquidMarketLongDetail.textContent = dynamics
      ? `prev ${dynamics.longScorePrev ?? '-'} · peak ${dynamics.longScorePeak ?? '-'} · slope ${Number(dynamics.longScoreSlope ?? 0) >= 0 ? '+' : ''}${dynamics.longScoreSlope ?? '-'} · drop ${dynamics.longScoreDropFromPeak ?? '-'}`
      : `EMA20 ${Number(breadth.aboveEma20Pct ?? 0).toFixed(0)}% · vol confirm ${Number(breadth.confirmedUpPct ?? 0).toFixed(0)}%`;
    els.liquidMarketShortDetail.textContent = dynamics
      ? `prev ${dynamics.shortScorePrev ?? '-'} · peak ${dynamics.shortScorePeak ?? '-'} · slope ${Number(dynamics.shortScoreSlope ?? 0) >= 0 ? '+' : ''}${dynamics.shortScoreSlope ?? '-'} · drop ${dynamics.shortScoreDropFromPeak ?? '-'}`
      : `Dưới EMA20 ${Number(breadth.belowEma20Pct ?? 0).toFixed(0)}% · vol confirm ${Number(breadth.confirmedDownPct ?? 0).toFixed(0)}%`;
    els.liquidMarketBreadth1h.textContent = marketBreadthPair(breadth.up1hPct, breadth.down1hPct);
    els.liquidMarketBreadth3h.textContent = marketBreadthPair(breadth.up3hPct, breadth.down3hPct);
    els.liquidMarketBreadth6h.textContent = marketBreadthPair(breadth.up6hPct, breadth.down6hPct);
  } else {
    els.liquidMarketLongDetail.textContent = 'Chưa đủ breadth';
    els.liquidMarketShortDetail.textContent = 'Chưa đủ breadth';
    els.liquidMarketBreadth1h.textContent = '-- / --';
    els.liquidMarketBreadth3h.textContent = '-- / --';
    els.liquidMarketBreadth6h.textContent = '-- / --';
  }
  setMarketDirectionalValue(els.liquidMarketBtc15m, btc?.ret15m);
  setMarketDirectionalValue(els.liquidMarketBtc1h, btc?.ret1h);
  setMarketDirectionalValue(els.liquidMarketBtc6h, btc?.ret6h);

  const reasons = Array.isArray(data.reasons) ? data.reasons : [];
  els.liquidMarketHealthReasons.innerHTML = reasons.length
    ? reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')
    : '<span>Chưa có lý do xác nhận.</span>';
  els.liquidMarketHealthSample.textContent = `Sample ${Number(data.sampleSize ?? 0)}/${Number(data.universeSize ?? data.minSample ?? 0)} · ${fmtTime(data.evaluatedAt)}`;
  els.liquidMarketHealthPending.textContent = data.pendingLabel
    ? `Đang xác nhận ${MARKET_DIRECTION_LABELS[data.pendingLabel] ?? data.pendingLabel} · ${Number(data.pendingCount ?? 0)}/${Number(data.hysteresisSamples ?? 2)} nến 5m`
    : `Nhãn giữ qua ${Number(data.hysteresisSamples ?? 2)} nến 5m`;
  renderLiquidMarketHealthClock();
}

async function loadLiquidMarketDirectionHealth() {
  try {
    const response = await fetch('/api/liquid-market-direction-health', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderLiquidMarketDirectionHealth(await response.json());
  } catch (error) {
    if (els.liquidMarketHealthLiveText) {
      els.liquidMarketHealthLive.classList.remove('is-connecting', 'is-live');
      els.liquidMarketHealthLive.classList.add('is-stale');
      els.liquidMarketHealthLiveText.textContent = `Realtime lỗi · ${error.message}`;
    }
  }
}

function renderShortWaveStats(data) {
  if (!els.shortWaveStatsGrid || !data) return;
  shortWaveStatsData = data;
  const rows = Array.isArray(data.rows) ? data.rows.filter((row) => row.total > 0) : [];
  if (els.shortWaveStatsMeta) {
    els.shortWaveStatsMeta.textContent = `${Number(data.snapshotCount ?? 0)} snapshot / ${Number(data.totalTrades ?? 0)} lệnh · coverage ${Number(data.coveragePct ?? 0).toFixed(1)}%`;
  }
  if (!rows.length) {
    els.shortWaveStatsGrid.innerHTML = '<div class="short-wave-stats-empty">Chưa có lệnh mới mang snapshot nhịp SHORT để thống kê.</div>';
    return;
  }
  els.shortWaveStatsGrid.innerHTML = rows.map((row) => {
    const closedPnl = Number(row.closedPnl ?? 0);
    const activePnl = Number(row.activePnl ?? 0);
    const avgRoe = row.avgRoe == null ? '-' : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const pf = row.profitFactor == null ? '-' : Number(row.profitFactor).toFixed(2);
    const sources = Object.entries(row.sources ?? {}).map(([source, count]) => `${source} ${count}`).join(' · ');
    const waveClass = row.waveFamily === 'LONG_SCORE' ? 'liquid-long-wave' : 'liquid-short-wave';
    const waveAttribute = row.waveFamily === 'LONG_SCORE' ? 'data-long-wave' : 'data-short-wave';
    const liveKey = `market-wave:${row.waveFamily}:${row.state}:${row.side}`;
    return `<article class="short-wave-stat-card" data-wave-state="${escapeHtml(row.state)}" data-side="${escapeHtml(row.side)}" ${liquidLiveCardAttr(liveKey, row.avgRoe)}>
      <div class="short-wave-stat-title">
        <span class="${waveClass}" ${waveAttribute}="${escapeHtml(row.state)}" title="${escapeHtml(row.description ?? '')}">${escapeHtml(row.label)}</span>
        <em>${row.waveFamily === 'LONG_SCORE' ? 'LONG SCORE' : 'SHORT SCORE'}</em>
        <b class="short-wave-side">${escapeHtml(row.side)}</b>
      </div>
      <strong class="${closedPnl >= 0 ? 'is-positive' : 'is-negative'}">PnL đóng ${fmtMoney(closedPnl)}</strong>
      <div>${row.wins ?? 0}W/${row.losses ?? 0}L · WR ${wr} · PF ${pf}</div>
      <div>${row.closed ?? 0} đóng · ${row.open ?? 0} active · ${row.pending ?? 0} pending · AvgROE ${avgRoe}</div>
      <div>${row.positiveDays ?? 0}/${row.days ?? 0} ngày dương · PnL active <span class="${activePnl >= 0 ? 'is-positive' : 'is-negative'}">${fmtMoney(activePnl)}</span></div>
      <small>${escapeHtml(sources || 'Chưa xác định nguồn')}</small>
    </article>`;
  }).join('');
  decorateLiquidLiveCardToggles();
}

async function loadShortWaveStats() {
  try {
    const response = await fetch('/api/short-wave-stats', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderShortWaveStats(await response.json());
  } catch (error) {
    if (els.shortWaveStatsMeta) els.shortWaveStatsMeta.textContent = `Lỗi thống kê · ${error.message}`;
  }
}

function startLiquidMarketDirectionHealth() {
  loadLiquidMarketDirectionHealth();
  loadShortWaveStats();
  if (!liquidMarketHealthPollTimer) {
    liquidMarketHealthPollTimer = window.setInterval(() => {
      loadLiquidMarketDirectionHealth();
      loadShortWaveStats();
    }, 20_000);
  }
  if (!liquidMarketHealthClockTimer) {
    liquidMarketHealthClockTimer = window.setInterval(renderLiquidMarketHealthClock, 1_000);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadLiquidMarketDirectionHealth();
      loadShortWaveStats();
    }
  });
}

function renderLiquidSocketHealth() {
  const status = els.liquidPaperLiveStatus;
  if (!status) return;

  const ageMs = liquidPaperLastMarkAt > 0 ? Math.max(0, Date.now() - liquidPaperLastMarkAt) : null;
  const ageSeconds = ageMs == null ? null : Math.round(ageMs / 1000);
  let health = 'connecting';
  let label = 'Socket đang kết nối...';

  if (liquidPaperSocketMode === 'reconnecting') {
    health = 'down';
    label = 'Socket đang kết nối lại...';
  } else if (liquidPaperSocketMode === 'unsupported') {
    health = 'down';
    label = 'Trình duyệt không hỗ trợ socket';
  } else if (liquidPaperSocketMode === 'open' && ageMs == null) {
    health = 'slow';
    label = 'Socket đã mở · đang chờ tick';
  } else if (liquidPaperSocketMode === 'open' && ageMs <= LIQUID_SOCKET_FRESH_MS) {
    health = 'live';
    label = `Socket ổn · ${liquidPaperMarkSource} · tick ${ageSeconds}s`;
  } else if (liquidPaperSocketMode === 'open' && ageMs <= LIQUID_SOCKET_STALE_MS) {
    health = 'slow';
    label = `Socket chậm · ${liquidPaperMarkSource} · tick ${ageSeconds}s`;
  } else if (liquidPaperSocketMode === 'open') {
    health = 'down';
    label = `Socket mất tick · ${liquidPaperMarkSource} · ${ageSeconds}s`;
  }

  status.classList.remove('is-connecting', 'is-live', 'is-slow', 'is-down');
  status.classList.add(`is-${health}`);
  status.dataset.socketState = health;
  status.title = 'Xanh: tick ≤ 5s · Vàng: tick 6–15s · Đỏ: mất tick > 15s hoặc đang kết nối lại';
  if (els.liquidPaperSocketText) els.liquidPaperSocketText.textContent = label;
}

function ensureLiquidSocketHealthTimer() {
  if (liquidPaperSocketHealthTimer) return;
  liquidPaperSocketHealthTimer = window.setInterval(renderLiquidSocketHealth, 1_000);
}

function updateLiveStatus(data, source = 'sse') {
  const trades = data?.trades ?? [];
  const marks = data?.marks ?? [];
  const latestMarkAt = Math.max(
    0,
    ...trades.map((t) => Number(t.markUpdatedAt ?? 0)).filter(Number.isFinite),
    ...marks.map((mark) => Number(mark.markUpdatedAt ?? 0)).filter(Number.isFinite),
  );
  const markSource = marks.find((mark) => mark.markSource)?.markSource
    ?? trades.find((t) => t.markSource)?.markSource
    ?? source;
  if (latestMarkAt > 0) {
    liquidPaperLastMarkAt = Math.max(liquidPaperLastMarkAt, latestMarkAt);
    liquidPaperMarkSource = markSource;
  }
  renderLiquidSocketHealth();
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
  if (key === 'eval') return trade.liquidEvalTier ?? 'WATCH';
  if (key === 'stage2') return ({ RISK: 1, WATCH: 2, A: 3, A_PLUS: 4 })[trade.liquidStage2Tier] ?? 0;
  if (key === 'stage3') return ({ RISK: 1, WATCH: 2, GOOD: 3, GOOD_PLUS: 4 })[trade.liquidStage3Tier] ?? 0;
  if (key === 'stage4') return ({ UNRATED: 0, NEW: 1, FADED: 2, RECOVERY: 3, ACTIVE: 4 })[trade.liquidStage4Tier] ?? 0;
  if (key === 'btcWave') return ({
    UNRATED: 0,
    NO_DATA: 1,
    TRANSITION: 2,
    EXHAUSTED: 3,
    CONTINUATION: 4,
  })[trade.liquidBtcWaveTier] ?? 0;
  if (key === 'longReversal') return ({
    UNRATED: 0,
    NO_DATA: 1,
    NO_EDGE: 2,
    TEST: 3,
    CORE: 4,
    CORE_AND_TEST: 5,
    DECOUPLED: 5,
    ABSORPTION: 5,
    MULTI_EDGE: 6,
  })[trade.liquidLongReversalTier] ?? 0;
  if (key === 'longMarket') return ({
    UNRATED: 0,
    NO_DATA: 1,
    HEADWIND: 2,
    TRANSITION: 3,
    LATE: 4,
    RECLAIM: 5,
    TAILWIND: 6,
  })[trade.liquidLongMarketTier] ?? 0;
  if (key === 'longSession') return ({
    UNRATED: 0,
    NO_DATA: 1,
    WARMUP: 2,
    BREAKDOWN: 3,
    WATCH: 4,
    HEALTHY: 5,
  })[trade.liquidLongSessionTier] ?? 0;
  if (key === 'runnerDirection') return ({
    UNRATED: 0,
    STRETCHED: 1,
    NEW: 2,
    FADED: 3,
    WATCH: 4,
    RECOVERY: 5,
    PRIME: 6,
  })[trade.liquidRunnerDirectionTier] ?? 0;
  if (key === 'status') return trade.status ?? '';
  if (key === 'entry') return Number(trade.entryPrice ?? 0);
  if (key === 'tp') return liquidTakeProfitPrice(trade) ?? 0;
  if (key === 'mark') return Number(trade.markPrice ?? 0);
  if (key === 'toEntry') return distanceToEntry(trade) ?? Number.POSITIVE_INFINITY;
  if (key === 'sweepDistance') return Number(trade.sweepDistancePct ?? trade.entryPlan?.targetDistancePct ?? 0);
  if (key === 'feasibleLeverage') return Number(trade.feasibleLeverage ?? trade.entryPlan?.feasibleLeverage ?? 0);
  if (key === 'margin') return Number(trade.marginUsdt ?? 0);
  if (key === 'pnl') return Number(trade.netPnl ?? trade.pnl ?? 0);
  if (key === 'roe') return Number(trade.netRoe ?? trade.roe ?? 0);
  if (key === 'signalRoe') return Number(trade.signalRoe ?? -999);
  if (key === 'hunt') return Number(trade.huntScore ?? trade.huntSignal?.score ?? 0);
  if (key === 'btcTrend') return Number(trade.btcHealth?.btcTrendScore ?? trade.btcTrendScore ?? -999);
  if (key === 'combo') return liquidTradeCombo(trade);
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
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Server trả về ${res.headers.get('content-type') ?? 'nội dung không phải JSON'} (HTTP ${res.status}). Hãy reload trang rồi thử lại.`);
  }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function liquidLiveCardAttr(key, avgRoe) {
  return `data-liquid-live-key="${escapeHtml(key)}" ${binanceCardAvgRoeAttrs(avgRoe)}`;
}

function liquidLiveCardToggleHtml(key, avgRoe) {
  if (!isBinanceCardAvgRoeEligible(Number(avgRoe))) return '';
  return `<label class="liquid-live-card-toggle" title="Lưu card vào whitelist ứng viên; quyền lệnh thật được bật riêng tại Orders.">
    <input type="checkbox" data-liquid-live-toggle data-key="${escapeHtml(key)}"><span>WHITELIST</span>
  </label>`;
}

function renderLiquidLiveCardStatus() {
  const el = els.liquidLiveCardStatus;
  if (!el) return;
  const config = liquidLiveCardConfig;
  if (!config) {
    el.className = 'liquid-live-card-status';
    el.innerHTML = '<strong>LIQUID CARD WHITELIST</strong><span>Đang tải danh sách ứng viên · chưa card nào được cấp quyền lệnh thật tại đây.</span>';
    return;
  }
  const count = [...liquidLiveCardEnabledKeys].filter((key) => (
    !key.startsWith('ema:')
    && !key.startsWith('edge:')
    && !key.startsWith('recommended:')
  )).length;
  el.className = 'liquid-live-card-status';
  el.innerHTML = `<strong>LIQUID CARD WHITELIST · ĐÃ LƯU</strong>
    <span>${count} card trong whitelist ứng viên · chưa cấp lệnh thật tại đây · vào trang Orders để bật riêng checkbox LỆNH THẬT.</span>`;
}

function decorateLiquidLiveCardToggles() {
  document.querySelectorAll('[data-liquid-live-key]').forEach((card) => {
    const key = String(card.dataset.liquidLiveKey ?? '');
    if (!key) return;
    const checked = liquidLiveCardEnabledKeys.has(key);
    let toggle = card.querySelector(':scope > .liquid-live-card-toggle');
    const avgRoe = Number(card.dataset.binanceCardAvgRoe);
    if (!isBinanceCardAvgRoeEligible(avgRoe)) {
      toggle?.remove();
      card.classList.remove('liquid-live-enabled');
      return;
    }
    card.classList.toggle('liquid-live-enabled', checked);
    if (!toggle) {
      toggle = document.createElement('label');
      toggle.className = 'liquid-live-card-toggle';
      toggle.title = 'Lưu card vào whitelist ứng viên. Thao tác này chưa cho phép đặt lệnh thật.';
      toggle.innerHTML = '<input type="checkbox" data-liquid-live-toggle><span>WHITELIST</span>';
      card.appendChild(toggle);
    }
    const input = toggle.querySelector('input');
    input.checked = checked;
    input.dataset.key = key;
  });
  renderLiquidLiveCardStatus();
}

async function loadLiquidLiveCardWhitelist() {
  const data = await api('/api/live-card-whitelist');
  liquidLiveCardConfig = data;
  liquidLiveCardEnabledKeys = new Set(Array.isArray(data.enabledKeys) ? data.enabledKeys : []);
  decorateLiquidLiveCardToggles();
  return data;
}

async function updateLiquidLiveCardToggle(input) {
  const key = String(input.dataset.key ?? '');
  const enabled = input.checked;
  if (!key) return;
  if (enabled) {
    const ok = confirm(`Thêm card này vào whitelist ứng viên?\n\n${key}\n\nThao tác này CHƯA đánh lệnh thật. Muốn cho phép Binance phải bật checkbox LỆNH THẬT riêng tại trang Orders.`);
    if (!ok) {
      input.checked = false;
      return;
    }
  }
  input.disabled = true;
  try {
    const data = await api('/api/live-card-whitelist', {
      method: 'POST',
      body: JSON.stringify({ key, enabled }),
    });
    liquidLiveCardConfig = data;
    liquidLiveCardEnabledKeys = new Set(Array.isArray(data.enabledKeys) ? data.enabledKeys : []);
    decorateLiquidLiveCardToggles();
  } catch (error) {
    input.checked = !enabled;
    alert(`Không lưu được whitelist: ${error.message}`);
  } finally {
    input.disabled = false;
  }
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
  const marginUsdt = Number(els.marginInput.value || 10);
  const leverage = Number(els.leverageInput.value || 10);
  if (!plan?.entryPrice || !plan?.side) throw new Error('Entry plan missing.');
  const marketEntry = Number(row.markPrice);
  const paperEntry = Number.isFinite(marketEntry) && marketEntry > 0 ? marketEntry : Number(plan.entryPrice);
  button.disabled = true;
  const payload = {
    symbol: row.symbol,
    side: plan.side,
    marginUsdt,
    leverage,
    entryPrice: paperEntry,
    status: 'OPEN',
    source: 'liquid-scan',
    note: [
      `marketPaper=1`,
      `setupEntry=${plan.entryPrice}`,
      `marketEntry=${paperEntry}`,
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
    signalTimeframe: scanData?.interval ?? els.intervalInput.value ?? '15m',
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
  const marginUsdt = Number(els.marginInput.value || 10);
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
  const marginUsdt = Number(els.marginInput.value || 10);
  const leverage = Number(els.leverageInput.value || 10);
  const toCreate = candidates.filter((row) => !paperTrades.some((trade) => isSamePlannedTrade(trade, row)));
  if (toCreate.length === 0) {
    if (!silent) showActionResult(`Tất cả tín hiệu point > ${minPoint} đã có paper test đang mở/chờ.`);
    return;
  }

  if (!silent) {
    const killCount = toCreate.filter(isKillZoneRow).length;
    const ok = confirm(`Tạo ${toCreate.length} paper trade MARKET/OPEN cho Liquid Scan (${killCount} kill-zone)?`);
    if (!ok) return;
  }

  autoPaperRunning = true;
  els.autoPaperButton.disabled = true;
  try {
    const results = [];
    for (const row of toCreate) {
      const plan = row.entryPlan;
      try {
        const marketEntry = Number(row.markPrice);
        const paperEntry = Number.isFinite(marketEntry) && marketEntry > 0 ? marketEntry : Number(plan.entryPrice);
        const data = await api('/api/liquid-paper-trades', {
          method: 'POST',
          body: JSON.stringify({
            symbol: row.symbol,
            side: plan.side,
            marginUsdt,
            leverage,
            entryPrice: paperEntry,
            status: 'OPEN',
            source: `liquid-scan-auto-${row.sweepProb}`,
            note: [
              `autoPaper point>${minPoint}`,
              `marketPaper=1`,
              `setupEntry=${plan.entryPrice}`,
              `marketEntry=${paperEntry}`,
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
            signalTimeframe: scanData?.interval ?? els.intervalInput.value ?? '15m',
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

async function loadAutoPaperTrades({ showDateLoading = false } = {}) {
  const requestId = ++liquidPaperLoadRequestId;
  const requestedFrom = liquidPaperDateFrom;
  const requestedTo = liquidPaperDateTo;
  liquidPaperLoadController?.abort();
  const controller = new AbortController();
  liquidPaperLoadController = controller;
  if (showDateLoading) setLiquidPaperDateSearchLoading(true);
  try {
    const qs = new URLSearchParams();
    if (requestedFrom) qs.set('from', requestedFrom);
    if (requestedTo) qs.set('to', requestedTo);
    const data = await api(
      `/api/liquid-paper-trades${qs.toString() ? `?${qs}` : ''}`,
      { signal: controller.signal },
    );
    if (
      requestId !== liquidPaperLoadRequestId
      || requestedFrom !== liquidPaperDateFrom
      || requestedTo !== liquidPaperDateTo
    ) return;
    paperTrades = data.trades ?? [];
    liquidPaperClosedGroupStatsDirty = true;
    liquidPaperSummary = data.summary ?? null;
    liquidPaperComboStats = data.comboStats ?? [];
    liquidComboCycleStats = data.comboCycleStats ?? null;
    updateLiveStatus(data, 'poll');
    renderAutoPaperTrades();
  } catch (err) {
    if (err?.name === 'AbortError' || requestId !== liquidPaperLoadRequestId) return;
    els.openPaperBody.innerHTML = `<tr><td colspan="31" class="table-empty">Lỗi tải paper: ${escapeHtml(err.message)}</td></tr>`;
  } finally {
    if (liquidPaperLoadController === controller) {
      liquidPaperLoadController = null;
      setLiquidPaperDateSearchLoading(false);
      syncLiquidPaperDateControls();
    }
  }
}

function liquidTradeCombo(t) {
  return String(t.liquidCombo ?? '-');
}

function fmtMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(3)}`;
}

function renderClosedPnl(value) {
  const pnl = Number(value);
  const cls = !Number.isFinite(pnl) || pnl === 0
    ? 'neutral'
    : pnl > 0
      ? 'positive'
      : 'negative';
  return `<span class="liquid-closed-pnl ${cls}">${fmtMoney(pnl)}</span>`;
}

function renderAvgRoe(value) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  const roe = Number(value);
  const cls = roe === 0 ? 'neutral' : roe > 0 ? 'positive' : 'negative';
  return `<span class="liquid-avg-roe ${cls}">${fmtPct(roe, 1)}</span>`;
}

function renderLiquidBtcTrendBadge(t) {
  const h = t?.btcHealth ?? {};
  const dir = String(h.btcTrendDir ?? t?.btcTrendDir ?? '').toLowerCase();
  const score = Number(h.btcTrendScore ?? t?.btcTrendScore);
  const pct6h = Number(h.pct6h);
  const side = String(t?.side ?? '').toUpperCase();
  const corr = Number(t?.btcCorr);
  if (!dir && !Number.isFinite(score)) {
    return '<span title="Lenh cu chua luu BTC snapshot" style="font-size:10px;font-weight:900;color:var(--muted)">BTC NO DATA</span>';
  }
  const expected = side === 'LONG' ? 'up' : side === 'SHORT' ? 'down' : '';
  const aligned = dir && expected ? dir === expected : null;
  const trendText = dir ? `BTC ${dir.toUpperCase()}${Number.isFinite(score) ? ` ${score}` : ''}` : 'BTC ?';
  const pctText = Number.isFinite(pct6h) ? `${pct6h >= 0 ? '+' : ''}${pct6h.toFixed(2)}%/6h` : '';
  const color = dir === 'up' ? '#34d399' : dir === 'down' ? '#fb7185' : '#9daaa5';
  const relColor = aligned == null ? 'var(--muted)' : aligned ? '#34d399' : '#fb7185';
  const relText = aligned == null ? '-' : aligned ? 'THUAN BTC' : 'NGUOC BTC';
  const title = [
    `btcTrend=${dir || '-'}`,
    Number.isFinite(score) ? `score=${score}` : '',
    Number.isFinite(pct6h) ? `pct6h=${pct6h.toFixed(2)}%` : '',
    Number.isFinite(corr) ? `corr=${corr.toFixed(2)}` : '',
    `side=${side || '-'}`,
  ].filter(Boolean).join(' | ');
  const wave = t?.marketDirectionAtSignal?.scoreDynamics;
  const waveHtml = wave?.shortWaveState
    ? `<span class="liquid-short-wave" data-short-wave="${escapeHtml(wave.shortWaveState)}" title="${escapeHtml(wave.shortWaveDescription ?? 'Snapshot nhịp SHORT tại entry')}">${escapeHtml(wave.shortWaveLabel ?? wave.shortWaveState)}</span>`
    : '';
  const longWaveHtml = wave?.longWaveState
    ? `<span class="liquid-long-wave" data-long-wave="${escapeHtml(wave.longWaveState)}" title="${escapeHtml(wave.longWaveDescription ?? 'Snapshot nhịp LONG tại entry')}">${escapeHtml(wave.longWaveLabel ?? wave.longWaveState)}</span>`
    : '';
  return `<div title="${escapeHtml(title)}" style="display:flex;flex-direction:column;gap:3px;align-items:flex-start">
    <span style="display:inline-flex;gap:4px;align-items:center;padding:2px 6px;border-radius:4px;border:1px solid ${color};background:rgba(15,23,42,.25);color:${color};font-size:10px;font-weight:950;line-height:1.15">${escapeHtml(trendText)}${pctText ? `<small style="font-size:9px;font-weight:850;color:${color}">${escapeHtml(pctText)}</small>` : ''}</span>
    <span style="font-size:10px;font-weight:950;color:${relColor}">${relText}</span>
    ${waveHtml}
    ${longWaveHtml}
  </div>`;
}

function renderLiquidComboCell(t) {
  const combo = liquidTradeCombo(t);
  if (!combo || combo === '-') return '<span class="muted">-</span>';
  const short = combo.length > 42 ? `${combo.slice(0, 42)}...` : combo;
  return `<span class="pump-combo-tag" title="${escapeHtml(combo)}">${escapeHtml(short)}</span>`;
}

function renderLiquidEvalBadge(t) {
  const tier = String(t.liquidEvalTier ?? 'WATCH').toUpperCase();
  const color = tier === 'GOOD' ? '#34d399' : tier === 'RISK' ? '#fb7185' : '#fbbf24';
  const label = String(t.liquidEvalLabel ?? tier);
  const title = [t.liquidEvalReason, t.liquidEvalVersion].filter(Boolean).join(' | ');
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:900;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidStage2Badge(t) {
  const tier = String(t.liquidStage2Tier ?? 'WATCH').toUpperCase();
  const color = tier === 'A_PLUS' ? '#2dd4bf' : tier === 'A' ? '#34d399' : tier === 'RISK' ? '#fb7185' : '#fbbf24';
  const label = String(t.liquidStage2Label ?? t.liquidStage2Code ?? tier.replace('_PLUS', '+'));
  const title = [t.liquidStage2Reason, t.liquidStage2TargetKind, t.liquidStage2Version].filter(Boolean).join(' | ');
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidStage3Badge(t) {
  const tier = String(t.liquidStage3Tier ?? 'WATCH').toUpperCase();
  const color = tier === 'GOOD_PLUS' ? '#2dd4bf' : tier === 'GOOD' ? '#34d399' : tier === 'RISK' ? '#fb7185' : '#fbbf24';
  const targetMargin = Number(t.liquidStage3TargetMarginUsdt);
  const sizeLabel = tier === 'GOOD_PLUS' && Number.isFinite(targetMargin) && targetMargin > 0
    ? ` · $${targetMargin.toFixed(0)}`
    : '';
  const label = `${String(t.liquidStage3Label ?? t.liquidStage3Code ?? tier.replace('_PLUS', '+'))}${sizeLabel}`;
  const title = [
    t.liquidStage3Reason,
    t.liquidStage3ComboKey,
    t.liquidStage3Version,
    t.liquidStage3SizeApplied ? `size applied $${Number(t.marginUsdt ?? 0).toFixed(2)}` : '',
  ].filter(Boolean).join(' | ');
  const badges = [
    `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`,
  ];
  if (t.liquidLongCorrReboundMatched === true) {
    const reboundTitle = [
      t.liquidLongCorrReboundReason,
      t.liquidLongCorrReboundComboKey,
      t.liquidLongCorrReboundCycleKey,
      t.liquidLongCorrReboundVersion,
      t.liquidLongCorrReboundPaperSizeApplied
        ? `PAPER TEST $${Number(t.liquidLongCorrReboundAppliedMarginUsdt ?? t.liquidLongCorrReboundPaperTestMarginUsdt ?? 10).toFixed(0)}`
        : 'HISTORY/DERIVED · size cũ giữ nguyên',
      'Không ảnh hưởng Binance/entry/SL/TP',
    ].filter(Boolean).join(' | ');
    const reboundSize = t.liquidLongCorrReboundPaperSizeApplied
      ? ` · TEST $${Number(t.liquidLongCorrReboundAppliedMarginUsdt ?? t.liquidLongCorrReboundPaperTestMarginUsdt ?? 10).toFixed(0)}`
      : '';
    badges.push(`<span title="${escapeHtml(reboundTitle)}" style="display:inline-flex;padding:3px 6px;border:1px solid #2dd4bf;border-radius:4px;color:#2dd4bf;font-size:10px;font-weight:950;white-space:nowrap">LONG CORR REBOUND${escapeHtml(reboundSize)}</span>`);
  }
  if (t.liquidStableMechanismMatched === true) {
    badges.push(renderLiquidStableMechanismBadge(t));
  }
  if (t.liquidLongBtcExpansionMatched === true) {
    badges.push(renderLiquidLongBtcExpansionBadge(t));
  }
  if (t.liquidComboBtcBreadthMatched === true) {
    badges.push(renderLiquidComboBtcBreadthBadge(t));
  }
  return badges.length === 1
    ? badges[0]
    : `<span style="display:inline-flex;gap:4px;align-items:center;flex-wrap:wrap">${badges.join('')}</span>`;
}

function renderLiquidLongBtcExpansionBadge(t) {
  const confirmations = [];
  if (t.liquidLongBtcExpansionBtcCandleConfirmed === true) confirmations.push('BTC CANDLE ✓');
  if (t.liquidLongBtcExpansionPointAligned === true) confirmations.push('POINT ✓');
  if (t.liquidLongBtcExpansionFarRunner === true) confirmations.push('FAR RUNNER');
  if (t.liquidLongBtcExpansionOneSidedConfirmed === true) confirmations.push('ONE-SIDED 90+');
  const suffix = confirmations.length ? ` · ${confirmations.join(' · ')}` : '';
  const layerTier = String(t.liquidLongBtcExpansionLayerTier ?? 'CANDIDATE').toUpperCase();
  const label = layerTier === 'PRIME_TEST'
    ? 'LONG EXPANSION PRIME TEST'
    : layerTier === 'SELECTED'
      ? 'LONG EXPANSION SELECTED'
      : 'LONG BTC EXPANSION';
  const color = layerTier === 'PRIME_TEST'
    ? '#2dd4bf'
    : layerTier === 'SELECTED'
      ? '#a3e635'
      : '#84cc16';
  const title = [
    t.liquidLongBtcExpansionReason,
    `BTC phase ${t.liquidLongBtcExpansionBtcPhase ?? '-'}`,
    `Stage 3 ${t.liquidLongBtcExpansionStage3Tier ?? '-'}`,
    `target ${t.liquidLongBtcExpansionTargetKind ?? '-'}`,
    `BTC candle ${t.liquidLongBtcExpansionBtcCandlePattern ?? '-'}`,
    `market point ${t.liquidLongBtcExpansionMarketPointTier ?? '-'} · ${t.liquidLongBtcExpansionMarketPointRelation ?? '-'}`,
    `signal point ${t.liquidLongBtcExpansionSignalPoint ?? '-'}`,
    `one-sided ${t.liquidLongBtcExpansionOneSidedPct ?? '-'}%`,
    t.liquidLongBtcExpansionBasis,
    t.liquidLongBtcExpansionVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size/entry/SL/TP/Binance',
  ].filter(Boolean).join(' | ');
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}${escapeHtml(suffix)}</span>`;
}

function renderLiquidComboBtcBreadthBadge(t) {
  const side = String(t.liquidComboBtcBreadthSide ?? t.side ?? '').toUpperCase();
  const tier = String(t.liquidComboBtcBreadthTier ?? 'UNRATED').toUpperCase();
  const color = side === 'SHORT' ? '#fb7185' : '#34d399';
  const favorable = Array.isArray(t.liquidComboBtcBreadthFavorableBreadth)
    ? t.liquidComboBtcBreadthFavorableBreadth.join('/')
    : '-';
  const opposing = Array.isArray(t.liquidComboBtcBreadthOpposingBreadth)
    ? t.liquidComboBtcBreadthOpposingBreadth.join('/')
    : '-';
  const label = t.liquidComboBtcBreadthLabel
    ?? `LIQ COMBO ${side || '-'} · BTC-BREADTH ${tier.replaceAll('_', ' ')}`;
  const title = [
    t.liquidComboBtcBreadthReason,
    `history ${t.liquidComboBtcBreadthHistoryTier ?? '-'} · closed ${t.liquidComboBtcBreadthHistory?.closed ?? '-'}`,
    `BTC1h ${t.liquidComboBtcBreadthBtcRet1h ?? '-'}% · BTC6h ${t.liquidComboBtcBreadthBtcRet6h ?? '-'}%`,
    `breadth thuận ${favorable} · ngược ${opposing} · lead ${t.liquidComboBtcBreadthBreadthLeadCount ?? '-'}/3`,
    `market ${t.liquidComboBtcBreadthMarketLabel ?? '-'} · sample ${t.liquidComboBtcBreadthMarketSampleKey ?? '-'}`,
    t.liquidComboBtcBreadthBasis,
    t.liquidComboBtcBreadthVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size/entry/SL/TP/Binance',
  ].filter(Boolean).join(' | ');
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidStableMechanismBadge(t) {
  const tier = String(t.liquidStableMechanismTier ?? 'UNRATED').toUpperCase();
  const color = tier === 'GOOD' ? '#2dd4bf' : tier === 'TEST' ? '#fbbf24' : '#94a3b8';
  const variant = t.liquidStableMechanismVariant
    ? ` · ${String(t.liquidStableMechanismVariant).replaceAll('_', ' ')}`
    : '';
  const label = `${String(t.liquidStableMechanismLabel ?? t.liquidStableMechanismCode ?? 'STABLE MECHANISM')}${variant}`;
  const title = [
    t.liquidStableMechanismReason,
    t.liquidStableMechanismComboKey,
    t.liquidStableMechanismCycleKey,
    t.liquidStableMechanismBasis,
    t.liquidStableMechanismVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size/SL/TP/Binance',
  ].filter(Boolean).join(' | ');
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidStage4Badge(t) {
  const tier = String(t.liquidStage4Tier ?? 'UNRATED').toUpperCase();
  if (tier === 'UNRATED') return '<span class="muted">-</span>';
  const colors = {
    ACTIVE: '#2dd4bf',
    RECOVERY: '#60a5fa',
    FADED: '#fb7185',
    NEW: '#fbbf24',
  };
  const color = colors[tier] ?? '#9daaa5';
  const label = String(t.liquidStage4Label ?? `EDGE ${tier}`);
  const history = t.liquidStage4History ?? {};
  const recent = t.liquidStage4Recent ?? {};
  const pulse = t.liquidStage4Pulse ?? {};
  const title = [
    t.liquidStage4Reason,
    t.liquidStage4CycleFamily,
    t.liquidStage4SelectedCohortKey,
    `history ${Number(history.closed ?? 0)} closed / ${Number(history.episodes ?? 0)} episodes / ${Number(history.days ?? 0)} days`,
    `recent PF ${Number(recent.profitFactor ?? 0).toFixed(2)} · AvgNetROE ${Number(recent.avgNetRoe ?? 0).toFixed(2)}%`,
    `pulse PF ${Number(pulse.profitFactor ?? 0).toFixed(2)} · AvgNetROE ${Number(pulse.avgNetRoe ?? 0).toFixed(2)}%`,
    t.liquidStage4Basis,
    t.liquidStage4Version,
    'OBSERVE ONLY · không gate/chặn/đổi size',
  ].filter(Boolean).join(' | ');
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidEdgeActivePointBadge(t) {
  const tier = String(t.liquidEdgeActivePointTier ?? 'UNRATED').toUpperCase();
  if (tier === 'UNRATED') return '<span class="muted">-</span>';
  const colors = {
    GOOD: '#2dd4bf',
    WATCH: '#fbbf24',
    RISK: '#fb7185',
    NO_DATA: '#94a3b8',
  };
  const color = colors[tier] ?? '#94a3b8';
  const label = String(t.liquidEdgeActivePointLabel ?? `EA POINT ${tier.replaceAll('_', ' ')}`);
  const numberOrDash = (value, digits = 1) => {
    const number = Number(value);
    return value == null || !Number.isFinite(number) ? '-' : number.toFixed(digits);
  };
  const title = [
    t.liquidEdgeActivePointReason,
    `wave ${t.liquidEdgeActivePointWaveState ?? '-'}`,
    `SHORT ${numberOrDash(t.liquidEdgeActivePointShortScore)} · LONG ${numberOrDash(t.liquidEdgeActivePointLongScore)} · gap ${numberOrDash(t.liquidEdgeActivePointGap)}`,
    `slope SHORT ${numberOrDash(t.liquidEdgeActivePointShortSlope)} · LONG ${numberOrDash(t.liquidEdgeActivePointLongSlope)}`,
    `drop peak ${numberOrDash(t.liquidEdgeActivePointDropFromPeak)} · BTC15m ${numberOrDash(t.liquidEdgeActivePointBtcRet15m, 2)}%`,
    t.liquidEdgeActivePointBasis,
    t.liquidEdgeActivePointVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size',
  ].filter(Boolean).join(' | ');
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidMarketPointPhaseBadge(t) {
  const tier = String(t.liquidMarketPointPhaseTier ?? '').toUpperCase();
  if (!tier) return '<span class="muted">-</span>';
  const colors = {
    CROSS_TO_LONG: '#34d399',
    POST_CROSS_TO_LONG_30M: '#2dd4bf',
    LONG_DOMINANT: '#60a5fa',
    CROSS_TO_SHORT: '#fb7185',
    POST_CROSS_TO_SHORT_30M: '#f97316',
    SHORT_DOMINANT: '#f43f5e',
    POINT_TIE: '#c084fc',
    OUTSIDE_DISPERSION: '#64748b',
    NO_DATA: '#94a3b8',
  };
  const color = colors[tier] ?? '#94a3b8';
  const numberOrDash = (value, digits = 1) => {
    const number = Number(value);
    return value == null || !Number.isFinite(number) ? '-' : number.toFixed(digits);
  };
  const age = numberOrDash(t.liquidMarketPointPhaseCrossAgeMinutes, 1);
  const title = [
    t.liquidMarketPointPhaseReason,
    `market ${t.liquidMarketPointPhaseMarketLabel ?? '-'}`,
    `LONG ${numberOrDash(t.liquidMarketPointPhaseLongScore)} · SHORT ${numberOrDash(t.liquidMarketPointPhaseShortScore)} · gap ${numberOrDash(t.liquidMarketPointPhaseGap)}`,
    `cross ${t.liquidMarketPointPhaseCrossFrom ?? '-'} → ${t.liquidMarketPointPhaseCrossTo ?? '-'} · age ${age}m`,
    `relation ${t.liquidMarketPointPhaseTradeRelation ?? '-'}`,
    t.liquidMarketPointPhaseBasis,
    t.liquidMarketPointPhaseVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size',
  ].filter(Boolean).join(' | ');
  const label = String(t.liquidMarketPointPhaseLabel ?? tier.replaceAll('_', ' '));
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidBtcWaveBadge(t) {
  const tier = String(t.liquidBtcWaveTier ?? 'UNRATED').toUpperCase();
  if (tier === 'UNRATED') {
    return '<span title="Chỉ đánh giá BTC Wave cho Liquid Stage 3 GOOD/GOOD+ · OBSERVE ONLY" style="display:inline-flex;padding:3px 6px;border:1px solid #64748b;border-radius:4px;color:#94a3b8;font-size:10px;font-weight:950;white-space:nowrap">BTC WAVE · N/A</span>';
  }
  const colors = {
    CONTINUATION: '#34d399',
    EXHAUSTED: '#fbbf24',
    TRANSITION: '#fb7185',
    NO_DATA: '#94a3b8',
  };
  const color = colors[tier] ?? '#94a3b8';
  const title = [
    t.liquidBtcWaveReason,
    t.liquidBtcWaveCycleFamily,
    `dir ${t.liquidBtcWaveDirection ?? '-'} · score ${t.liquidBtcWaveTrendScore ?? '-'}`,
    `pct6h ${t.liquidBtcWavePct6h ?? '-'}% · pct24h ${t.liquidBtcWavePct24h ?? '-'}% · RSI1h ${t.liquidBtcWaveRsi1h ?? '-'}`,
    `EMA1h ${t.liquidBtcWaveEmaTrend1h ?? '-'} · regime ${t.liquidBtcWaveMarketRegime ?? '-'} · OBV ${t.liquidBtcWaveObvTrend ?? '-'}`,
    `momentum ${t.liquidBtcWaveMomentum ?? '-'} · flow ${t.liquidBtcWaveFlow ?? '-'}`,
    `BTC candle ${t.liquidBtcWaveBtcCandlePattern ?? t.liquidBtcWaveBtcCandleDirection ?? '-'}`,
    Array.isArray(t.liquidBtcWaveMissingFields) && t.liquidBtcWaveMissingFields.length
      ? `missing ${t.liquidBtcWaveMissingFields.join(', ')}`
      : '',
    t.liquidBtcWaveBasis,
    t.liquidBtcWaveVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size',
  ].filter(Boolean).join(' | ');
  const label = String(t.liquidBtcWaveLabel ?? `BTC WAVE · ${tier.replace('_', ' ')}`);
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidLongSessionBadge(t) {
  const tier = String(t.liquidLongSessionTier ?? 'UNRATED').toUpperCase();
  if (tier === 'UNRATED') {
    return '<span title="Chỉ đánh giá sức khỏe phiên cho LONG · OBSERVE ONLY" style="display:inline-flex;padding:3px 6px;border:1px solid #64748b;border-radius:4px;color:#94a3b8;font-size:10px;font-weight:950;white-space:nowrap">LONG SESSION · N/A</span>';
  }
  const colors = {
    HEALTHY: '#34d399',
    WATCH: '#fbbf24',
    BREAKDOWN: '#fb7185',
    WARMUP: '#60a5fa',
    NO_DATA: '#94a3b8',
  };
  const history = t.liquidLongSessionHistory ?? {};
  const color = colors[tier] ?? '#94a3b8';
  const title = [
    t.liquidLongSessionReason,
    `day ${t.liquidLongSessionDay ?? '-'}`,
    `trước entry ${history.closed ?? 0} đóng · WR ${history.winRate == null ? '-' : `${Number(history.winRate).toFixed(1)}%`}`,
    `PnL ${fmtMoney(history.realizedPnl ?? 0)} · PF ${Number(history.profitFactor ?? 0).toFixed(2)} · AvgROE ${history.avgRoe == null ? '-' : `${Number(history.avgRoe).toFixed(1)}%`}`,
    t.liquidLongSessionBasis,
    t.liquidLongSessionVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size',
  ].filter(Boolean).join(' | ');
  const label = String(t.liquidLongSessionLabel ?? `LONG SESSION · ${tier}`);
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidLongMarketBadge(t) {
  const tier = String(t.liquidLongMarketTier ?? 'UNRATED').toUpperCase();
  if (tier === 'UNRATED') {
    return '<span title="Chỉ đánh giá trạng thái thị trường cho LONG · OBSERVE ONLY" style="display:inline-flex;padding:3px 6px;border:1px solid #64748b;border-radius:4px;color:#94a3b8;font-size:10px;font-weight:950;white-space:nowrap">LONG STATE · N/A</span>';
  }
  const colors = {
    TAILWIND: '#34d399',
    RECLAIM: '#2dd4bf',
    LATE: '#fbbf24',
    HEADWIND: '#fb7185',
    TRANSITION: '#60a5fa',
    NO_DATA: '#94a3b8',
  };
  const color = colors[tier] ?? '#94a3b8';
  const title = [
    t.liquidLongMarketReason,
    `dir ${t.liquidLongMarketDirection ?? '-'} · score ${t.liquidLongMarketTrendScore ?? '-'}`,
    `EMA1h ${t.liquidLongMarketEmaTrend1h ?? '-'} · regime ${t.liquidLongMarketRegime ?? '-'}`,
    `pct6h ${t.liquidLongMarketPct6h ?? '-'}% · pct24h ${t.liquidLongMarketPct24h ?? '-'}% · RSI1h ${t.liquidLongMarketRsi1h ?? '-'}`,
    `OBV ${t.liquidLongMarketObvTrend ?? '-'} · BTC candle ${t.liquidLongMarketBtcCandleName ?? t.liquidLongMarketBtcCandleDirection ?? '-'}`,
    Array.isArray(t.liquidLongMarketMissingFields) && t.liquidLongMarketMissingFields.length
      ? `missing ${t.liquidLongMarketMissingFields.join(', ')}`
      : '',
    t.liquidLongMarketBasis,
    t.liquidLongMarketVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size',
  ].filter(Boolean).join(' | ');
  const label = String(t.liquidLongMarketLabel ?? `LONG ${tier.replaceAll('_', ' ')}`);
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidLongReversalBadge(t) {
  const tier = String(t.liquidLongReversalTier ?? 'UNRATED').toUpperCase();
  if (tier === 'UNRATED') {
    return '<span title="Chỉ đánh giá cho lệnh LONG · OBSERVE ONLY" style="display:inline-flex;padding:3px 6px;border:1px solid #64748b;border-radius:4px;color:#94a3b8;font-size:10px;font-weight:950;white-space:nowrap">LONG · N/A</span>';
  }
  const title = [
    t.liquidLongReversalReason,
    `ALT ${t.liquidLongReversalAltCandle ?? '-'} · target ${t.liquidLongReversalTargetKind ?? '-'}`,
    `BTC pct6h ${t.liquidLongReversalPct6h ?? '-'}% · trend score ${t.liquidLongReversalTrendScore ?? '-'}`,
    `EMA1h ${t.liquidLongReversalEmaTrend1h ?? '-'} · corr ${t.liquidLongReversalBtcCorr ?? '-'} · BTC candle ${t.liquidLongReversalBtcCandle ?? '-'}`,
    Array.isArray(t.liquidLongReversalMissingFields) && t.liquidLongReversalMissingFields.length
      ? `missing ${t.liquidLongReversalMissingFields.join(', ')}`
      : '',
    t.liquidLongReversalBasis,
    t.liquidLongReversalVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size',
  ].filter(Boolean).join(' | ');
  const badges = [];
  if (t.liquidLongCapitulationMatched === true) {
    badges.push('<span style="display:inline-flex;padding:3px 6px;border:1px solid #34d399;border-radius:4px;color:#34d399;font-size:10px;font-weight:950;white-space:nowrap">LONG CORE · CAPITULATION</span>');
  }
  if (t.liquidLongControlledSellMatched === true) {
    badges.push('<span style="display:inline-flex;padding:3px 6px;border:1px solid #60a5fa;border-radius:4px;color:#60a5fa;font-size:10px;font-weight:950;white-space:nowrap">LONG TEST · CONTROLLED SELL</span>');
  }
  if (t.liquidLongDecoupledReboundMatched === true) {
    badges.push('<span style="display:inline-flex;padding:3px 6px;border:1px solid #2dd4bf;border-radius:4px;color:#2dd4bf;font-size:10px;font-weight:950;white-space:nowrap">LONG EDGE · DECOUPLED REBOUND</span>');
  }
  if (t.liquidLongBtcAbsorptionMatched === true) {
    badges.push('<span style="display:inline-flex;padding:3px 6px;border:1px solid #c084fc;border-radius:4px;color:#c084fc;font-size:10px;font-weight:950;white-space:nowrap">LONG EDGE · BTC ABSORPTION</span>');
  }
  if (!badges.length) {
    const noData = tier === 'NO_DATA';
    badges.push(`<span style="display:inline-flex;padding:3px 6px;border:1px solid ${noData ? '#94a3b8' : '#fbbf24'};border-radius:4px;color:${noData ? '#94a3b8' : '#fbbf24'};font-size:10px;font-weight:950;white-space:nowrap">${noData ? 'LONG · NO DATA' : 'LONG · NO EDGE'}</span>`);
  }
  return `<span title="${escapeHtml(title)}" style="display:flex;flex-direction:column;align-items:flex-start;gap:3px">${badges.join('')}</span>`;
}

function renderLiquidLongPointPhaseBadge(t) {
  const tier = String(t.liquidLongPointPhaseTier ?? 'UNRATED').toUpperCase();
  if (tier === 'UNRATED') return '<span class="muted">-</span>';
  const colors = {
    SHORT_PRESSURE: '#fb7185',
    SHORT_FADE: '#fbbf24',
    BALANCED: '#2dd4bf',
    LONG_TAKEOVER: '#60a5fa',
    SHORT_RELOAD: '#f43f5e',
    TRANSITION: '#c084fc',
    NO_DATA: '#94a3b8',
  };
  const color = colors[tier] ?? '#94a3b8';
  const numberOrDash = (value, digits = 1) => {
    const number = Number(value);
    return value == null || !Number.isFinite(number) ? '-' : number.toFixed(digits);
  };
  const title = [
    t.liquidLongPointPhaseReason,
    `LONG ${numberOrDash(t.liquidLongPointPhaseLongScore)} · SHORT ${numberOrDash(t.liquidLongPointPhaseShortScore)} · gap L-S ${numberOrDash(t.liquidLongPointPhaseGap)}`,
    `slope LONG ${numberOrDash(t.liquidLongPointPhaseLongSlope)} · SHORT ${numberOrDash(t.liquidLongPointPhaseShortSlope)}`,
    `wave ${t.liquidLongPointPhaseWaveState ?? '-'} · drop peak ${numberOrDash(t.liquidLongPointPhaseShortDropFromPeak)}`,
    `dominant samples ${Number(t.liquidLongPointPhaseDominantSamples ?? 0)} · cross ${t.liquidLongPointPhaseCrossConfirmed ? 'confirmed' : 'no'}`,
    t.liquidLongPointPhaseBasis,
    t.liquidLongPointPhaseVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size',
  ].filter(Boolean).join(' | ');
  const label = String(t.liquidLongPointPhaseLabel ?? `LM · ${tier.replaceAll('_', ' ')}`);
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidRunner30Badge(t) {
  if (t.liquidRunner30Matched !== true) return '<span class="muted">-</span>';
  const label = String(t.liquidRunner30Label ?? 'RUNNER 30 · CANDIDATE');
  const plannedTpRoe = Number(t.liquidRunner30PlannedTpRoe);
  const title = [
    t.liquidRunner30Reason,
    Number.isFinite(plannedTpRoe) ? `planned TP ${plannedTpRoe.toFixed(1)}% ROE` : '',
    t.liquidRunner30Version,
    'OBSERVE ONLY',
  ].filter(Boolean).join(' | ');
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid #a3e635;border-radius:4px;color:#a3e635;font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function renderLiquidRunnerDirectionBadge(t) {
  const tier = String(t.liquidRunnerDirectionTier ?? 'UNRATED').toUpperCase();
  if (tier === 'UNRATED') return '<span class="muted">-</span>';
  const colors = {
    PRIME: '#2dd4bf',
    RECOVERY: '#60a5fa',
    WATCH: '#fbbf24',
    FADED: '#fb7185',
    STRETCHED: '#f97316',
    NEW: '#a3a3a3',
  };
  const color = colors[tier] ?? '#9daaa5';
  const label = String(t.liquidRunnerDirectionLabel ?? `R30 ${tier}`);
  const history = t.liquidRunnerDirectionHistory ?? {};
  const recent = t.liquidRunnerDirectionRecent ?? {};
  const pulse = t.liquidRunnerDirectionPulse ?? {};
  const plannedTpRoe = Number(t.liquidRunnerDirectionPlannedTpRoe);
  const directionScore = Number(t.liquidRunnerDirectionScore);
  const title = [
    t.liquidRunnerDirectionReason,
    Number.isFinite(plannedTpRoe) ? `planned TP ${plannedTpRoe.toFixed(1)}% ROE` : '',
    t.liquidRunnerDirectionReachTier,
    `${t.liquidRunnerDirectionRelation ?? 'REL_NO_DATA'}${Number.isFinite(directionScore) ? ` score ${directionScore.toFixed(2)}` : ''}`,
    t.liquidRunnerDirectionCandleRelation,
    t.liquidRunnerDirectionCycleFamily,
    t.liquidRunnerDirectionSelectedCohortKey,
    `history hit ${Number(history.hitRate ?? 0).toFixed(1)}% (${Number(history.highHits ?? 0)}/${Number(history.closed ?? 0)}) · PF ${Number(history.profitFactor ?? 0).toFixed(2)} · AvgNetROE ${Number(history.avgNetRoe ?? 0).toFixed(2)}%`,
    `recent hit ${Number(recent.hitRate ?? 0).toFixed(1)}% · PF ${Number(recent.profitFactor ?? 0).toFixed(2)} · AvgNetROE ${Number(recent.avgNetRoe ?? 0).toFixed(2)}%`,
    `pulse hit ${Number(pulse.hitRate ?? 0).toFixed(1)}% · PF ${Number(pulse.profitFactor ?? 0).toFixed(2)}`,
    t.liquidRunnerDirectionBasis,
    t.liquidRunnerDirectionVersion,
    'OBSERVE ONLY · không gate/chặn/đổi size',
  ].filter(Boolean).join(' | ');
  return `<span title="${escapeHtml(title)}" style="display:inline-flex;padding:3px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:10px;font-weight:950;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function liquidNetPnl(t) {
  return Number(t.netPnl ?? t.pnl ?? 0);
}

function liquidNetRoe(t) {
  return Number(t.netRoe ?? t.roe ?? 0);
}

function liquidTakeProfitPrice(t) {
  const value = Number(t.takeProfitPrice ?? t.tp ?? t.entryPlan?.takeProfitPrice);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function liquidTakeProfitRoe(t) {
  const entry = Number(t.entryPrice);
  const tp = liquidTakeProfitPrice(t);
  const leverage = Number(t.leverage);
  if (!(entry > 0) || !(tp > 0) || !(leverage > 0)) return null;
  const movePct = String(t.side ?? '').toUpperCase() === 'SHORT'
    ? ((entry - tp) / entry) * 100
    : ((tp - entry) / entry) * 100;
  return movePct * leverage;
}

function renderLiquidTakeProfit(t) {
  const tp = liquidTakeProfitPrice(t);
  const tpRoe = liquidTakeProfitRoe(t);
  if (tp == null) return '<span class="muted">-</span>';
  return `<span class="positive">${fmtPrice(tp)}</span><small>${tpRoe == null ? '-' : `${fmtPct(tpRoe, 1)} ROE`}</small>`;
}

function renderLiquidNetPnl(t) {
  const net = liquidNetPnl(t);
  const gross = Number(t.grossPnl ?? t.pnl ?? 0);
  const fee = Number(t.estimatedFeeUsdt ?? t.feeUsdt ?? 0);
  return `${fmt(net, 4)}<small title="Gross trừ phí Binance dự tính">gross ${fmt(gross, 4)} · fee ${fmt(fee, 4)}</small>`;
}

function summarizeLiquidPaperRows(rows) {
  const pick = (margin) => {
    const m = Number(margin);
    if (Number.isFinite(m) && m <= 1.01) return 'test1';
    if (Number.isFinite(m) && m >= 9.5 && m <= 10.5) return 'test10';
    return 'other';
  };
  const makeGroup = (label) => ({
    label, total: 0, open: 0, pending: 0, closed: 0, wins: 0, losses: 0,
    realizedPnl: 0, unrealizedPnl: 0, roeSum: 0,
  });
  const byMargin = {
    test10: makeGroup('TEST $10'),
    test1: makeGroup('TEST $1'),
    other: makeGroup('Other'),
  };
  const summary = {
    total: rows.length, open: 0, pending: 0, closed: 0, wins: 0, losses: 0,
    tpHits: 0, slHits: 0, realizedPnl: 0, unrealizedPnl: 0, roeSum: 0,
    byMargin,
  };
  for (const row of rows) {
    const status = String(row.status ?? '');
    const pnl = liquidNetPnl(row);
    const roe = liquidNetRoe(row);
    const group = byMargin[pick(row.marginUsdt)];
    group.total += 1;
    if (status === 'CLOSED') {
      summary.closed += 1;
      group.closed += 1;
      summary.realizedPnl += pnl;
      group.realizedPnl += pnl;
      summary.roeSum += Number.isFinite(roe) ? roe : 0;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) { summary.wins += 1; group.wins += 1; }
      else { summary.losses += 1; group.losses += 1; }
      const closeNote = String(row.closeNote ?? row.status ?? '').toUpperCase();
      if (closeNote.includes('TP')) summary.tpHits += 1;
      if (closeNote.includes('SL')) summary.slHits += 1;
    } else if (status === 'PENDING' || status === 'ENTRY_READY') {
      summary.pending += 1;
      group.pending += 1;
    } else if (status === 'OPEN') {
      summary.open += 1;
      group.open += 1;
      summary.unrealizedPnl += pnl;
      group.unrealizedPnl += pnl;
    }
  }
  const finishGroup = (group) => ({
    ...group,
    wr: group.closed ? +(group.wins / group.closed * 100).toFixed(1) : null,
    avgRoe: group.closed ? +(group.roeSum / group.closed).toFixed(1) : null,
    realizedPnl: +group.realizedPnl.toFixed(4),
    unrealizedPnl: +group.unrealizedPnl.toFixed(4),
    netPnl: +(group.realizedPnl + group.unrealizedPnl).toFixed(4),
  });
  return {
    ...summary,
    winRate: summary.closed ? +(summary.wins / summary.closed * 100).toFixed(1) : null,
    avgRoe: summary.closed ? +(summary.roeSum / summary.closed).toFixed(1) : null,
    realizedPnl: +summary.realizedPnl.toFixed(4),
    unrealizedPnl: +summary.unrealizedPnl.toFixed(4),
    totalPnl: +(summary.realizedPnl + summary.unrealizedPnl).toFixed(4),
    byMargin: {
      test10: finishGroup(byMargin.test10),
      test1: finishGroup(byMargin.test1),
      other: finishGroup(byMargin.other),
    },
  };
}

function combineLiquidStatRows(closedRow = {}, activeRow = {}) {
  const combined = { ...closedRow, ...activeRow };
  for (const key of [
    'total', 'open', 'pending', 'closed', 'wins', 'losses', 'highHits',
    'realizedPnl', 'unrealizedPnl', 'roeSum', 'grossWin', 'grossLoss',
    'snapshot', 'backfill',
    'recentClosed', 'recentWins', 'recentLosses', 'recentPnl',
    'recentRoeSum', 'recentGrossWin', 'recentGrossLoss',
    'positiveDays', 'observedDays', 'recentPositiveDays',
    'confirmedTotal', 'confirmedOpen', 'confirmedClosed', 'confirmedWins',
    'confirmedPnl', 'freshTotal', 'freshOpen', 'freshClosed', 'freshWins',
    'freshPnl',
    'bad0To15Open', 'bad0To15Closed', 'bad0To15Wins', 'bad0To15Pnl',
    'bad16To60Open', 'bad16To60Closed', 'bad16To60Wins', 'bad16To60Pnl',
    'badOver60Open', 'badOver60Closed', 'badOver60Wins', 'badOver60Pnl',
    'pointCount', 'longScoreSum', 'shortScoreSum', 'gapSum',
  ]) {
    combined[key] = Number(closedRow[key] ?? 0) + Number(activeRow[key] ?? 0);
  }
  combined.wr = combined.closed ? (combined.wins / combined.closed) * 100 : null;
  combined.avgRoe = combined.closed ? combined.roeSum / combined.closed : null;
  combined.netPnl = combined.realizedPnl + combined.unrealizedPnl;
  combined.profitFactor = combined.grossLoss > 0
    ? combined.grossWin / combined.grossLoss
    : combined.grossWin > 0
      ? 9.99
      : 0;
  combined.recentWr = combined.recentClosed
    ? (combined.recentWins / combined.recentClosed) * 100
    : null;
  combined.recentAvgRoe = combined.recentClosed
    ? combined.recentRoeSum / combined.recentClosed
    : null;
  combined.recentProfitFactor = combined.recentGrossLoss > 0
    ? combined.recentGrossWin / combined.recentGrossLoss
    : combined.recentGrossWin > 0
      ? 9.99
      : 0;
  combined.confirmedWr = combined.confirmedClosed
    ? (combined.confirmedWins / combined.confirmedClosed) * 100
    : null;
  combined.freshWr = combined.freshClosed
    ? (combined.freshWins / combined.freshClosed) * 100
    : null;
  return combined;
}

function combineLiquidPaperSummaries(closedSummary, activeSummary) {
  const combined = combineLiquidStatRows(closedSummary, activeSummary);
  combined.tpHits = Number(closedSummary?.tpHits ?? 0) + Number(activeSummary?.tpHits ?? 0);
  combined.slHits = Number(closedSummary?.slHits ?? 0) + Number(activeSummary?.slHits ?? 0);
  combined.winRate = combined.wr;
  combined.totalPnl = combined.netPnl;
  combined.byMargin = {};
  for (const key of ['test10', 'test1', 'other']) {
    combined.byMargin[key] = combineLiquidStatRows(
      closedSummary?.byMargin?.[key],
      activeSummary?.byMargin?.[key],
    );
  }
  return combined;
}

function combineLiquidStageStats(closedStats, activeStats, keyOf) {
  const order = [];
  const rows = new Map();
  for (const row of [...closedStats, ...activeStats]) {
    const key = keyOf(row);
    if (!rows.has(key)) {
      rows.set(key, row);
      order.push(key);
      continue;
    }
    rows.set(key, combineLiquidStatRows(rows.get(key), row));
  }
  return order.map((key) => combineLiquidStatRows(rows.get(key), {}));
}

function getLiquidPaperClosedGroupStats() {
  if (liquidPaperClosedGroupStats && !liquidPaperClosedGroupStatsDirty) {
    return liquidPaperClosedGroupStats;
  }
  const closedRows = paperTrades.filter((trade) => (
    String(trade.source ?? '').startsWith('liquid-scan')
    && trade.status === 'CLOSED'
  ));
  const runner30 = closedRows.filter((trade) => trade.liquidRunner30Matched === true);
  liquidPaperClosedGroupStats = {
    overview: summarizeLiquidPaperRows(closedRows),
    stage2: summarizeLiquidStage2(closedRows),
    stage3: summarizeLiquidStage3(closedRows),
    longCorrRebound: summarizeLiquidLongCorrRebound(closedRows),
    stableMechanism: summarizeLiquidStableMechanisms(closedRows),
    longBtcExpansion: summarizeLiquidLongBtcExpansion(closedRows),
    comboBtcBreadth: summarizeLiquidComboBtcBreadth(closedRows),
    stage4: summarizeLiquidStage4(closedRows),
    edgeActivePoint: summarizeLiquidEdgeActivePoint(closedRows),
    marketPointPhase: summarizeLiquidMarketPointPhases(closedRows),
    btcWave: summarizeLiquidBtcWave(closedRows),
    waveContinuation: summarizeLiquidWaveContinuation(closedRows),
    longMarket: summarizeLiquidLongMarket(closedRows),
    longSession: summarizeLiquidLongSession(closedRows),
    longMechanism: summarizeLiquidLongMechanisms(closedRows),
    longPointPhase: summarizeLiquidLongPointPhases(closedRows),
    runnerDirection: summarizeLiquidRunnerDirection(closedRows),
    runner30: {
      closed: runner30.length,
      highHits: runner30.filter((trade) => liquidNetRoe(trade) >= 30).length,
      allHighHits: closedRows.filter((trade) => liquidNetRoe(trade) >= 30).length,
      allClosed: closedRows.length,
      roeSum: runner30.reduce((sum, trade) => sum + liquidNetRoe(trade), 0),
      realizedPnl: runner30.reduce((sum, trade) => sum + liquidNetPnl(trade), 0),
      version: runner30.find((trade) => trade.liquidRunner30Version)?.liquidRunner30Version ?? '',
    },
  };
  liquidPaperClosedGroupStatsDirty = false;
  return liquidPaperClosedGroupStats;
}

function renderLiquidPaperOverview(activeRows = []) {
  const el = els.liquidPaperOverview;
  if (!el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const summary = combineLiquidPaperSummaries(
    closedStats.overview,
    summarizeLiquidPaperRows(activeRows),
  );
  if (!summary) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const wr = summary.closed > 0 ? Math.round(summary.winRate ?? 0) : null;
  const allCard = {
    label: 'Tong filter',
    title: `${summary.open ?? 0} open · ${summary.pending ?? 0} pending · ${summary.closed ?? 0} closed`,
    detail: `WR ${wr == null ? '-' : `${wr}%`}`,
    pnl: Number(summary.unrealizedPnl),
    realizedPnl: Number(summary.realizedPnl),
    unrealizedPnl: Number(summary.unrealizedPnl),
    open: Number(summary.open ?? 0),
    pending: Number(summary.pending ?? 0),
    closed: Number(summary.closed ?? 0),
    avgRoe: summary.avgRoe,
  };
  const cards = [allCard, summary.byMargin?.test10, summary.byMargin?.test1, summary.byMargin?.other].filter(Boolean);
  el.style.display = cards.length ? 'grid' : 'none';
  el.innerHTML = cards.map((row) => {
    const activePnl = Number(row.unrealizedPnl ?? 0);
    const closedPnl = Number(row.realizedPnl ?? 0);
    const cls = activePnl > 0 ? 'good' : activePnl < 0 ? 'bad' : 'neutral';
    const detail = row.detail
      ?? `WR ${row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`} · ${row.wins ?? 0}W/${row.losses ?? 0}L · AvgROE ${renderAvgRoe(row.avgRoe)}`;
    const sub = `Đã đóng ${row.closed ?? 0} · PnL đóng ${renderClosedPnl(closedPnl)}<br>Active ${row.open ?? 0} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending ?? 0}<br>${detail}`;
    const liveKey = row === allCard
      ? 'overview:all'
      : row.label === 'TEST $10'
        ? 'overview:margin:test10'
        : row.label === 'TEST $1'
          ? 'overview:margin:test1'
          : 'overview:margin:other';
    return `<div class="pump-paper-metric ${cls}" ${liquidLiveCardAttr(liveKey, row.avgRoe)}>
      <span class="pump-paper-metric-label">${escapeHtml(row.label ?? 'Group')}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>${sub}</small>
    </div>`;
  }).join('');
}

function summarizeLiquidStage2(rows) {
  const order = ['A_PLUS', 'A', 'WATCH', 'RISK'];
  const groups = new Map(order.map((tier) => [tier, {
    tier, total: 0, open: 0, pending: 0, closed: 0, wins: 0, losses: 0,
    realizedPnl: 0, unrealizedPnl: 0, roeSum: 0,
  }]));
  for (const trade of rows) {
    const tier = String(trade.liquidStage2Tier ?? 'WATCH').toUpperCase();
    const group = groups.get(tier) ?? groups.get('WATCH');
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    group.total += 1;
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) group.wins += 1;
      else if (pnl < 0) group.losses += 1;
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  return order.map((tier) => {
    const row = groups.get(tier);
    return {
      ...row,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      netPnl: row.realizedPnl + row.unrealizedPnl,
    };
  });
}

function renderLiquidStage2Stats(activeRows = []) {
  const section = els.liquidStage2Section;
  const el = els.liquidStage2Stats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.stage2,
    summarizeLiquidStage2(activeRows),
    (row) => row.tier,
  );
  const total = stats.reduce((sum, row) => sum + row.total, 0);
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = stats.map((row) => {
    const labels = { A_PLUS: 'A+ · GOOD+', A: 'A · GOOD', WATCH: 'WATCH', RISK: 'RISK' };
    const cls = row.tier === 'A_PLUS' || row.tier === 'A' ? 'good' : row.tier === 'RISK' ? 'bad' : 'neutral';
    return `<div class="pump-paper-metric ${cls}" ${liquidLiveCardAttr(`stage2:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">${labels[row.tier]}</span>
      <strong class="${row.unrealizedPnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(row.unrealizedPnl)}</strong>
      <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(row.unrealizedPnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · ${row.wins}W/${row.losses}L · AvgROE ${renderAvgRoe(row.avgRoe)}</small>
    </div>`;
  }).join('');
}

function summarizeLiquidStage3(rows) {
  const sides = ['LONG', 'SHORT'];
  const order = ['GOOD_PLUS', 'GOOD', 'WATCH', 'RISK'];
  const groups = new Map(sides.flatMap((side) => order.map((tier) => [`${side}:${tier}`, {
    side, tier, total: 0, open: 0, pending: 0, closed: 0, wins: 0, losses: 0,
    realizedPnl: 0, unrealizedPnl: 0, roeSum: 0,
  }])));
  for (const trade of rows) {
    const side = String(trade.side ?? '').toUpperCase();
    if (!sides.includes(side)) continue;
    const tier = String(trade.liquidStage3Tier ?? 'WATCH').toUpperCase();
    const group = groups.get(`${side}:${tier}`) ?? groups.get(`${side}:WATCH`);
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    group.total += 1;
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) group.wins += 1;
      else if (pnl < 0) group.losses += 1;
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  return sides.flatMap((side) => order.map((tier) => {
    const row = groups.get(`${side}:${tier}`);
    return {
      ...row,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      netPnl: row.realizedPnl + row.unrealizedPnl,
    };
  })).filter((row) => row.total > 0);
}

function renderLiquidStage3Stats(activeRows = []) {
  const section = els.liquidStage3Section;
  const el = els.liquidStage3Stats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.stage3,
    summarizeLiquidStage3(activeRows),
    (row) => `${row.side}:${row.tier}`,
  ).filter((row) => row.total > 0);
  const total = stats.reduce((sum, row) => sum + row.total, 0);
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = stats.map((row) => {
    const labels = { GOOD_PLUS: 'GOOD+ · COMBO · $10', GOOD: 'GOOD', WATCH: 'WATCH / WATCH+', RISK: 'RISK' };
    const cls = row.tier === 'GOOD_PLUS' || row.tier === 'GOOD' ? 'good' : row.tier === 'RISK' ? 'bad' : 'neutral';
    return `<div class="pump-paper-metric ${cls}" ${liquidLiveCardAttr(`stage3:${row.side}:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">${row.side} · ${labels[row.tier]}</span>
      <strong class="${row.unrealizedPnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(row.unrealizedPnl)}</strong>
      <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(row.unrealizedPnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · ${row.wins}W/${row.losses}L · AvgROE ${renderAvgRoe(row.avgRoe)}</small>
    </div>`;
  }).join('');
}

function summarizeLiquidLongCorrRebound(rows) {
  const group = {
    tier: 'GOOD',
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
  };
  for (const trade of rows) {
    if (trade.liquidLongCorrReboundMatched !== true) continue;
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    group.total += 1;
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) group.wins += 1;
      else if (pnl < 0) group.losses += 1;
      if (roe > 0) group.grossWin += roe;
      else if (roe < 0) group.grossLoss += Math.abs(roe);
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  if (!group.total) return [];
  return [{
    ...group,
    wr: group.closed ? (group.wins / group.closed) * 100 : null,
    avgRoe: group.closed ? group.roeSum / group.closed : null,
    netPnl: group.realizedPnl + group.unrealizedPnl,
    profitFactor: group.grossLoss > 0
      ? group.grossWin / group.grossLoss
      : group.grossWin > 0
        ? 9.99
        : 0,
  }];
}

function renderLiquidLongCorrReboundStats(activeRows = []) {
  const section = els.liquidLongCorrReboundSection;
  const el = els.liquidLongCorrReboundStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.longCorrRebound,
    summarizeLiquidLongCorrRebound(activeRows),
    (row) => row.tier,
  );
  const row = stats[0];
  section.style.display = row?.total ? 'block' : 'none';
  if (!row?.total) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="pump-paper-metric good" ${liquidLiveCardAttr('long-corr-rebound:GOOD', row.avgRoe)}>
    <span class="pump-paper-metric-label">LONG CORR REBOUND · PAPER TEST $10</span>
    <strong class="${row.netPnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(row.netPnl)}</strong>
    <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(row.unrealizedPnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · ${row.wins}W/${row.losses}L · AvgROE ${renderAvgRoe(row.avgRoe)} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}<br>Lệnh auto mới TEST $10 · lịch sử giữ nguyên size · Binance chỉ khi chủ động bật whitelist</small>
  </div>`;
}

function summarizeLiquidStableMechanisms(rows = []) {
  const order = [
    'LONG_SOFT_CORR_REBOUND',
    'LONG_DECOUPLED_RESET',
    'SHORT_CORR_FADE_CORE',
    'SHORT_FAILED_BOUNCE',
    'SHORT_BEAR_DRIVE',
    'SHORT_DECOUPLED_HOT_FADE',
  ];
  const groups = new Map(order.map((code) => [code, {
    code,
    label: code.replaceAll('_', ' '),
    tier: 'WATCH',
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    snapshot: 0,
    backfill: 0,
  }]));
  for (const trade of rows) {
    if (trade.liquidStableMechanismMatched !== true) continue;
    const code = String(trade.liquidStableMechanismCode ?? '').toUpperCase();
    const group = groups.get(code);
    if (!group) continue;
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    const status = String(trade.status ?? '').toUpperCase();
    group.label = trade.liquidStableMechanismLabel ?? group.label;
    group.tier = String(trade.liquidStableMechanismTier ?? group.tier).toUpperCase();
    group.total += 1;
    if (String(trade.liquidStableMechanismBasis ?? '').toUpperCase().startsWith('DERIVED')) {
      group.backfill += 1;
    } else {
      group.snapshot += 1;
    }
    if (status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) {
        group.wins += 1;
        group.grossWin += pnl;
      } else if (pnl < 0) {
        group.losses += 1;
        group.grossLoss += Math.abs(pnl);
      }
    } else if (status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  return order.map((code) => groups.get(code)).filter((row) => row.total > 0).map((row) => ({
    ...row,
    wr: row.closed ? (row.wins / row.closed) * 100 : null,
    avgRoe: row.closed ? row.roeSum / row.closed : null,
    netPnl: row.realizedPnl + row.unrealizedPnl,
    profitFactor: row.grossLoss > 0
      ? row.grossWin / row.grossLoss
      : row.grossWin > 0
        ? 9.99
        : 0,
  }));
}

function renderLiquidStableMechanismStats(activeRows = []) {
  const section = els.liquidStableMechanismSection;
  const el = els.liquidStableMechanismStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.stableMechanism,
    summarizeLiquidStableMechanisms(activeRows),
    (row) => row.code,
  ).filter((row) => row.total > 0);
  section.style.display = stats.length ? 'block' : 'none';
  if (!stats.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = stats.map((row) => {
    const cardClass = row.avgRoe > 3.5 ? 'good' : row.avgRoe < -1 ? 'bad' : 'neutral';
    const tierLabel = row.tier === 'TEST' ? 'TEST · ÍT NGÀY' : row.tier;
    return `<div class="pump-paper-metric ${cardClass}" ${liquidLiveCardAttr(`stable-mechanism:${row.code}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">${escapeHtml(row.label)} · ${escapeHtml(tierLabel)}</span>
      <strong class="${row.netPnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(row.netPnl)}</strong>
      <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(row.unrealizedPnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · ${row.wins}W/${row.losses}L · AvgROE ${renderAvgRoe(row.avgRoe)} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}<br>Snapshot ${row.snapshot} · backfill ${row.backfill} · OBSERVE ONLY</small>
    </div>`;
  }).join('');
}

function summarizeLiquidLongBtcExpansion(rows = []) {
  const definitions = [
    ['CANDIDATE', 'LIQ LONG · BTC EXPANSION CANDIDATE', (trade) => trade.liquidLongBtcExpansionMatched === true],
    ['SELECTED', 'LIQ LONG · EXPANSION SELECTED', (trade) => trade.liquidLongBtcExpansionSelected === true],
    ['PRIME_TEST', 'LIQ LONG · EXPANSION PRIME TEST', (trade) => trade.liquidLongBtcExpansionPrimeTest === true],
    ['ONE_SIDED_90', 'ONE-SIDED 90+ CONFIRMED', (trade) => trade.liquidLongBtcExpansionOneSidedConfirmed === true],
    ['BTC_CANDLE_CONFIRMED', 'BTC CANDLE CONFIRMED', (trade) => trade.liquidLongBtcExpansionBtcCandleConfirmed === true],
    ['POINT_ALIGNED', 'POINT ALIGNED', (trade) => trade.liquidLongBtcExpansionPointAligned === true],
    ['FAR_RUNNER', 'FAR RUNNER', (trade) => trade.liquidLongBtcExpansionFarRunner === true],
  ];
  return definitions.map(([code, label, matches]) => {
    const group = {
      code,
      label,
      total: 0,
      open: 0,
      pending: 0,
      closed: 0,
      wins: 0,
      losses: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      roeSum: 0,
      grossWin: 0,
      grossLoss: 0,
      snapshot: 0,
      backfill: 0,
    };
    for (const trade of rows) {
      if (!matches(trade)) continue;
      const pnl = liquidNetPnl(trade);
      const roe = liquidNetRoe(trade);
      const status = String(trade.status ?? '').toUpperCase();
      group.total += 1;
      if (String(trade.liquidLongBtcExpansionBasis ?? '').toUpperCase().startsWith('DERIVED')) {
        group.backfill += 1;
      } else {
        group.snapshot += 1;
      }
      if (status === 'CLOSED') {
        group.closed += 1;
        group.realizedPnl += pnl;
        group.roeSum += Number.isFinite(roe) ? roe : 0;
        if (pnl > 0) {
          group.wins += 1;
          group.grossWin += pnl;
        } else if (pnl < 0) {
          group.losses += 1;
          group.grossLoss += Math.abs(pnl);
        }
      } else if (status === 'OPEN') {
        group.open += 1;
        group.unrealizedPnl += pnl;
      } else {
        group.pending += 1;
      }
    }
    return {
      ...group,
      wr: group.closed ? (group.wins / group.closed) * 100 : null,
      avgRoe: group.closed ? group.roeSum / group.closed : null,
      netPnl: group.realizedPnl + group.unrealizedPnl,
      profitFactor: group.grossLoss > 0
        ? group.grossWin / group.grossLoss
        : group.grossWin > 0 ? 9.99 : 0,
    };
  }).filter((row) => row.total > 0);
}

function renderLiquidLongBtcExpansionStats(activeRows = []) {
  const section = els.liquidLongBtcExpansionSection;
  const el = els.liquidLongBtcExpansionStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.longBtcExpansion,
    summarizeLiquidLongBtcExpansion(activeRows),
    (row) => row.code,
  ).filter((row) => row.total > 0);
  section.style.display = stats.length ? 'block' : 'none';
  if (!stats.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = stats.map((row) => {
    const cls = row.avgRoe > 3.5 ? 'good' : row.avgRoe < -1 ? 'bad' : 'neutral';
    return `<div class="pump-paper-metric ${cls}" ${liquidLiveCardAttr(`long-btc-expansion:${row.code}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">${escapeHtml(row.label)}</span>
      <strong class="${row.netPnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(row.netPnl)}</strong>
      <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(row.unrealizedPnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · ${row.wins}W/${row.losses}L · AvgROE ${renderAvgRoe(row.avgRoe)} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}<br>Snapshot ${row.snapshot} · backfill ${row.backfill} · OBSERVE ONLY · không cấp Binance</small>
    </div>`;
  }).join('');
}

function summarizeLiquidComboBtcBreadth(rows = []) {
  const definitions = [
    ['LONG', 'LIQ COMBO LONG · BTC-BREADTH WATCH'],
    ['SHORT', 'LIQ COMBO SHORT · BTC-BREADTH PRIME TEST'],
  ];
  return definitions.map(([side, fallbackLabel]) => {
    const group = {
      side,
      label: fallbackLabel,
      tier: side === 'SHORT' ? 'PRIME_TEST' : 'WATCH_LOW_SAMPLE',
      total: 0,
      open: 0,
      pending: 0,
      closed: 0,
      wins: 0,
      losses: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      roeSum: 0,
      grossWin: 0,
      grossLoss: 0,
      snapshot: 0,
      backfill: 0,
    };
    for (const trade of rows) {
      if (trade.liquidComboBtcBreadthMatched !== true) continue;
      if (String(trade.liquidComboBtcBreadthSide ?? trade.side ?? '').toUpperCase() !== side) continue;
      const pnl = liquidNetPnl(trade);
      const roe = liquidNetRoe(trade);
      const status = String(trade.status ?? '').toUpperCase();
      group.label = trade.liquidComboBtcBreadthLabel ?? group.label;
      group.tier = String(trade.liquidComboBtcBreadthTier ?? group.tier).toUpperCase();
      group.total += 1;
      if (String(trade.liquidComboBtcBreadthBasis ?? '').toUpperCase().startsWith('DERIVED')) {
        group.backfill += 1;
      } else {
        group.snapshot += 1;
      }
      if (status === 'CLOSED') {
        group.closed += 1;
        group.realizedPnl += pnl;
        group.roeSum += Number.isFinite(roe) ? roe : 0;
        if (pnl > 0) group.wins += 1;
        else if (pnl < 0) group.losses += 1;
        if (roe > 0) group.grossWin += roe;
        else if (roe < 0) group.grossLoss += Math.abs(roe);
      } else if (status === 'OPEN') {
        group.open += 1;
        group.unrealizedPnl += pnl;
      } else {
        group.pending += 1;
      }
    }
    return {
      ...group,
      wr: group.closed ? (group.wins / group.closed) * 100 : null,
      avgRoe: group.closed ? group.roeSum / group.closed : null,
      netPnl: group.realizedPnl + group.unrealizedPnl,
      profitFactor: group.grossLoss > 0
        ? group.grossWin / group.grossLoss
        : group.grossWin > 0 ? 9.99 : 0,
    };
  });
}

function renderLiquidComboBtcBreadthStats(activeRows = []) {
  const section = els.liquidComboBtcBreadthSection;
  const el = els.liquidComboBtcBreadthStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.comboBtcBreadth,
    summarizeLiquidComboBtcBreadth(activeRows),
    (row) => row.side,
  );
  section.style.display = 'block';
  el.innerHTML = stats.map((row) => {
    const side = String(row.side ?? '').toUpperCase();
    const cls = row.avgRoe > 2 ? 'good' : row.avgRoe < 0 ? 'bad' : 'neutral';
    const sampleWarning = side === 'LONG' ? ' · LOW SAMPLE' : '';
    if (row.total <= 0) {
      return `<div class="pump-paper-metric neutral" ${liquidLiveCardAttr(`combo-btc-breadth:${side}:${row.tier}`, row.avgRoe)}>
        <span class="pump-paper-metric-label">${escapeHtml(row.label)}${escapeHtml(sampleWarning)}</span>
        <strong>NO DATA</strong>
        <small>0 l&#7879;nh kh&#7899;p trong kho&#7843;ng ng&#224;y &#273;ang ch&#7885;n.<br>Ch&#7881; hi&#7875;n th&#7889;ng k&#234; khi c&#243; snapshot/backfill causal h&#7907;p l&#7879;.<br>OBSERVE ONLY &middot; kh&#244;ng c&#7845;p Binance</small>
      </div>`;
    }
    return `<div class="pump-paper-metric ${cls}" ${liquidLiveCardAttr(`combo-btc-breadth:${side}:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">${escapeHtml(row.label)}${escapeHtml(sampleWarning)}</span>
      <strong class="${row.netPnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(row.netPnl)}</strong>
      <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(row.unrealizedPnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · ${row.wins}W/${row.losses}L · AvgROE ${renderAvgRoe(row.avgRoe)} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}<br>Snapshot ${row.snapshot} · backfill ${row.backfill} · OBSERVE ONLY · không cấp Binance</small>
    </div>`;
  }).join('');
}

function summarizeLiquidStage4(rows) {
  const sides = ['LONG', 'SHORT'];
  const stage3Order = ['GOOD_PLUS', 'GOOD'];
  const order = ['ACTIVE', 'RECOVERY', 'FADED', 'NEW'];
  const groups = new Map(sides.flatMap((side) => stage3Order.flatMap((stage3Tier) => order.map((tier) => [`${side}:${stage3Tier}:${tier}`, {
    side,
    stage3Tier,
    tier,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    snapshot: 0,
    backfill: 0,
  }]))));
  for (const trade of rows) {
    const side = String(trade.side ?? '').toUpperCase();
    const stage3Tier = String(trade.liquidStage3Tier ?? '').toUpperCase();
    const tier = String(trade.liquidStage4Tier ?? 'UNRATED').toUpperCase();
    if (!sides.includes(side) || !stage3Order.includes(stage3Tier) || !order.includes(tier)) continue;
    const group = groups.get(`${side}:${stage3Tier}:${tier}`);
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    group.total += 1;
    if (String(trade.liquidStage4Basis ?? '').toUpperCase() === 'SNAPSHOT') group.snapshot += 1;
    else group.backfill += 1;
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) {
        group.wins += 1;
        group.grossWin += pnl;
      } else if (pnl < 0) {
        group.losses += 1;
        group.grossLoss += Math.abs(pnl);
      }
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  return sides.flatMap((side) => stage3Order.flatMap((stage3Tier) => order.map((tier) => {
    const row = groups.get(`${side}:${stage3Tier}:${tier}`);
    return {
      ...row,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      profitFactor: row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0
          ? 9.99
          : 0,
      netPnl: row.realizedPnl + row.unrealizedPnl,
    };
  }))).filter((row) => row.total > 0);
}

function summarizeLiquidEdgeActivePoint(rows) {
  const order = ['GOOD', 'WATCH', 'RISK', 'NO_DATA'];
  const groups = new Map(order.map((tier) => [tier, {
    tier,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
  }]));
  for (const trade of rows) {
    const tier = String(trade.liquidEdgeActivePointTier ?? 'UNRATED').toUpperCase();
    if (!order.includes(tier)) continue;
    const group = groups.get(tier);
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    group.total += 1;
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) {
        group.wins += 1;
        group.grossWin += pnl;
      } else if (pnl < 0) {
        group.losses += 1;
        group.grossLoss += Math.abs(pnl);
      }
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  return order.map((tier) => {
    const row = groups.get(tier);
    return {
      ...row,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      profitFactor: row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0
          ? 9.99
          : 0,
      netPnl: row.realizedPnl + row.unrealizedPnl,
    };
  });
}

function liquidBtcWaveRecentDays() {
  return [...new Set(paperTrades
    .filter((trade) => String(trade.source ?? '').startsWith('liquid-scan') && trade.status === 'CLOSED')
    .map((trade) => liquidPaperTradeDayKey(trade))
    .filter(Boolean))]
    .sort()
    .slice(-5);
}

function summarizeLiquidBtcWave(rows) {
  const sides = ['LONG', 'SHORT'];
  const stage3Order = ['GOOD_PLUS', 'GOOD'];
  const order = ['CONTINUATION', 'EXHAUSTED', 'TRANSITION', 'NO_DATA'];
  const recentDays = liquidBtcWaveRecentDays();
  const recentDaySet = new Set(recentDays);
  const groups = new Map(sides.flatMap((side) => stage3Order.flatMap((stage3Tier) => order.map((tier) => [`${side}:${stage3Tier}:${tier}`, {
    side,
    stage3Tier,
    tier,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    snapshot: 0,
    backfill: 0,
    recentDayCount: recentDays.length,
    recentFrom: recentDays[0] ?? null,
    recentTo: recentDays.at(-1) ?? null,
    recentClosed: 0,
    recentWins: 0,
    recentLosses: 0,
    recentPnl: 0,
    recentRoeSum: 0,
    recentGrossWin: 0,
    recentGrossLoss: 0,
  }]))));
  for (const trade of rows) {
    const side = String(trade.side ?? '').toUpperCase();
    const stage3Tier = String(trade.liquidStage3Tier ?? '').toUpperCase();
    const tier = String(trade.liquidBtcWaveTier ?? 'UNRATED').toUpperCase();
    if (!sides.includes(side) || !stage3Order.includes(stage3Tier) || !order.includes(tier)) continue;
    const group = groups.get(`${side}:${stage3Tier}:${tier}`);
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    group.total += 1;
    if (String(trade.liquidBtcWaveBasis ?? '').toUpperCase().startsWith('DERIVED')) group.backfill += 1;
    else group.snapshot += 1;
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) {
        group.wins += 1;
        group.grossWin += pnl;
      } else if (pnl < 0) {
        group.losses += 1;
        group.grossLoss += Math.abs(pnl);
      }
      const tradeDay = liquidPaperTradeDayKey(trade);
      if (recentDaySet.has(tradeDay)) {
        group.recentClosed += 1;
        group.recentPnl += pnl;
        group.recentRoeSum += Number.isFinite(roe) ? roe : 0;
        if (pnl > 0) {
          group.recentWins += 1;
          group.recentGrossWin += pnl;
        } else if (pnl < 0) {
          group.recentLosses += 1;
          group.recentGrossLoss += Math.abs(pnl);
        }
      }
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  return sides.flatMap((side) => stage3Order.flatMap((stage3Tier) => order.map((tier) => {
    const row = groups.get(`${side}:${stage3Tier}:${tier}`);
    return {
      ...row,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      profitFactor: row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0
          ? 9.99
          : 0,
      netPnl: row.realizedPnl + row.unrealizedPnl,
      recentWr: row.recentClosed ? (row.recentWins / row.recentClosed) * 100 : null,
      recentAvgRoe: row.recentClosed ? row.recentRoeSum / row.recentClosed : null,
      recentProfitFactor: row.recentGrossLoss > 0
        ? row.recentGrossWin / row.recentGrossLoss
        : row.recentGrossWin > 0
          ? 9.99
          : 0,
    };
  }))).filter((row) => row.total > 0);
}

function summarizeLiquidWaveContinuation(rows) {
  const stage3Order = ['GOOD_PLUS', 'GOOD'];
  const order = ['SHORT_CONTINUATION_EDGE_INTACT', 'SHORT_CONTINUATION_AFTER_EDGE_DECAY'];
  const groups = new Map(stage3Order.flatMap((stage3Tier) => order.map((tier) => [`${stage3Tier}:${tier}`, {
    stage3Tier,
    tier,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    bad0To15Open: 0,
    bad0To15Closed: 0,
    bad0To15Wins: 0,
    bad0To15Pnl: 0,
    bad16To60Open: 0,
    bad16To60Closed: 0,
    bad16To60Wins: 0,
    bad16To60Pnl: 0,
    badOver60Open: 0,
    badOver60Closed: 0,
    badOver60Wins: 0,
    badOver60Pnl: 0,
  }])));
  for (const trade of rows) {
    const stage3Tier = String(trade.liquidStage3Tier ?? '').toUpperCase();
    const tier = String(trade.liquidWaveContinuationTier ?? 'UNRATED').toUpperCase();
    if (!stage3Order.includes(stage3Tier) || !order.includes(tier)) continue;
    const group = groups.get(`${stage3Tier}:${tier}`);
    const status = String(trade.status ?? '').toUpperCase();
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    const badAge = Number(trade.liquidWaveContinuationEdgeDecayAgeMinutes);
    const badBucket = tier !== 'SHORT_CONTINUATION_AFTER_EDGE_DECAY' || !Number.isFinite(badAge)
      ? null
      : badAge <= 15
        ? 'bad0To15'
        : badAge <= 60
          ? 'bad16To60'
          : 'badOver60';
    group.total += 1;
    if (status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) {
        group.wins += 1;
        group.grossWin += pnl;
      } else if (pnl < 0) {
        group.losses += 1;
        group.grossLoss += Math.abs(pnl);
      }
      if (badBucket) {
        group[`${badBucket}Closed`] += 1;
        group[`${badBucket}Pnl`] += pnl;
        if (pnl > 0) group[`${badBucket}Wins`] += 1;
      }
    } else if (status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
      if (badBucket) group[`${badBucket}Open`] += 1;
    } else {
      group.pending += 1;
    }
  }
  return stage3Order.flatMap((stage3Tier) => order.map((tier) => {
    const row = groups.get(`${stage3Tier}:${tier}`);
    return {
      ...row,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      profitFactor: row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0
          ? 9.99
          : 0,
    };
  })).filter((row) => row.total > 0);
}

function summarizeLiquidLongMarket(rows) {
  const order = ['TAILWIND', 'RECLAIM', 'LATE', 'HEADWIND', 'TRANSITION', 'NO_DATA'];
  const recentDays = liquidBtcWaveRecentDays();
  const recentDaySet = new Set(recentDays);
  const groups = new Map(order.map((tier) => [tier, {
    tier,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    snapshot: 0,
    backfill: 0,
    recentDayCount: recentDays.length,
    recentFrom: recentDays[0] ?? null,
    recentTo: recentDays.at(-1) ?? null,
    recentClosed: 0,
    recentWins: 0,
    recentLosses: 0,
    recentPnl: 0,
    recentRoeSum: 0,
    recentGrossWin: 0,
    recentGrossLoss: 0,
  }]));
  for (const trade of rows) {
    if (String(trade.side ?? '').toUpperCase() !== 'LONG') continue;
    const tier = String(trade.liquidLongMarketTier ?? 'UNRATED').toUpperCase();
    if (!order.includes(tier)) continue;
    const group = groups.get(tier);
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    group.total += 1;
    if (String(trade.liquidLongMarketBasis ?? '').toUpperCase().startsWith('DERIVED')) group.backfill += 1;
    else group.snapshot += 1;
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) {
        group.wins += 1;
        group.grossWin += pnl;
      } else if (pnl < 0) {
        group.losses += 1;
        group.grossLoss += Math.abs(pnl);
      }
      const tradeDay = liquidPaperTradeDayKey(trade);
      if (recentDaySet.has(tradeDay)) {
        group.recentClosed += 1;
        group.recentPnl += pnl;
        group.recentRoeSum += Number.isFinite(roe) ? roe : 0;
        if (pnl > 0) {
          group.recentWins += 1;
          group.recentGrossWin += pnl;
        } else if (pnl < 0) {
          group.recentLosses += 1;
          group.recentGrossLoss += Math.abs(pnl);
        }
      }
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  return order.map((tier) => {
    const row = groups.get(tier);
    return {
      ...row,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      profitFactor: row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0
          ? 9.99
          : 0,
      netPnl: row.realizedPnl + row.unrealizedPnl,
      recentWr: row.recentClosed ? (row.recentWins / row.recentClosed) * 100 : null,
      recentAvgRoe: row.recentClosed ? row.recentRoeSum / row.recentClosed : null,
      recentProfitFactor: row.recentGrossLoss > 0
        ? row.recentGrossWin / row.recentGrossLoss
        : row.recentGrossWin > 0
          ? 9.99
          : 0,
    };
  }).filter((row) => row.total > 0);
}

function summarizeLiquidLongSession(rows) {
  const order = ['HEALTHY', 'WATCH', 'BREAKDOWN', 'WARMUP', 'NO_DATA'];
  const recentDays = liquidBtcWaveRecentDays();
  const recentDaySet = new Set(recentDays);
  const groups = new Map(order.map((tier) => [tier, {
    tier,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    snapshot: 0,
    backfill: 0,
    recentFrom: recentDays[0] ?? null,
    recentTo: recentDays.at(-1) ?? null,
    recentClosed: 0,
    recentWins: 0,
    recentLosses: 0,
    recentPnl: 0,
    recentRoeSum: 0,
    recentGrossWin: 0,
    recentGrossLoss: 0,
  }]));
  const dailyPnl = new Map(order.map((tier) => [tier, new Map()]));
  for (const trade of rows) {
    if (String(trade.side ?? '').toUpperCase() !== 'LONG') continue;
    const tier = String(trade.liquidLongSessionTier ?? 'NO_DATA').toUpperCase();
    if (!order.includes(tier)) continue;
    const group = groups.get(tier);
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    group.total += 1;
    if (String(trade.liquidLongSessionBasis ?? '').toUpperCase().startsWith('DERIVED')) group.backfill += 1;
    else group.snapshot += 1;
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) {
        group.wins += 1;
        group.grossWin += pnl;
      } else if (pnl < 0) {
        group.losses += 1;
        group.grossLoss += Math.abs(pnl);
      }
      const tradeDay = liquidPaperTradeDayKey(trade);
      if (tradeDay) {
        const dayMap = dailyPnl.get(tier);
        dayMap.set(tradeDay, Number(dayMap.get(tradeDay) ?? 0) + pnl);
      }
      if (recentDaySet.has(tradeDay)) {
        group.recentClosed += 1;
        group.recentPnl += pnl;
        group.recentRoeSum += Number.isFinite(roe) ? roe : 0;
        if (pnl > 0) {
          group.recentWins += 1;
          group.recentGrossWin += pnl;
        } else if (pnl < 0) {
          group.recentLosses += 1;
          group.recentGrossLoss += Math.abs(pnl);
        }
      }
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  return order.map((tier) => {
    const row = groups.get(tier);
    const dayMap = dailyPnl.get(tier);
    return {
      ...row,
      positiveDays: [...dayMap.values()].filter((pnl) => pnl > 0).length,
      observedDays: dayMap.size,
      recentPositiveDays: recentDays.filter((day) => Number(dayMap.get(day) ?? 0) > 0).length,
      recentDayCount: recentDays.length,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      profitFactor: row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0
          ? 9.99
          : 0,
      netPnl: row.realizedPnl + row.unrealizedPnl,
      recentWr: row.recentClosed ? (row.recentWins / row.recentClosed) * 100 : null,
      recentAvgRoe: row.recentClosed ? row.recentRoeSum / row.recentClosed : null,
      recentProfitFactor: row.recentGrossLoss > 0
        ? row.recentGrossWin / row.recentGrossLoss
        : row.recentGrossWin > 0
          ? 9.99
          : 0,
    };
  }).filter((row) => row.total > 0);
}

function summarizeLiquidLongMechanisms(rows) {
  const configs = [
    {
      key: 'CAPITULATION',
      field: 'liquidLongCapitulationMatched',
      label: 'LONG CORE · CAPITULATION',
      condition: 'Nến coin đang bán + target EXHAUSTION',
    },
    {
      key: 'CONTROLLED_SELL',
      field: 'liquidLongControlledSellMatched',
      label: 'LONG TEST · CONTROLLED SELL',
      condition: 'BTC pct6h [-0.50%, -0.15%) + trend score [35, 50)',
    },
    {
      key: 'DECOUPLED_REBOUND',
      field: 'liquidLongDecoupledReboundMatched',
      label: 'LONG EDGE · DECOUPLED REBOUND',
      condition: 'BTC dưới EMA1h + coin/BTC corr < -0.30',
    },
    {
      key: 'BTC_ABSORPTION',
      field: 'liquidLongBtcAbsorptionMatched',
      label: 'LONG EDGE · BTC ABSORPTION',
      condition: 'BTC Doji/Hammer/Pin bar + |pct6h| ≤ 0.15%',
    },
  ];
  const recentDays = liquidBtcWaveRecentDays();
  const recentDaySet = new Set(recentDays);
  const groups = new Map(configs.map((config) => [config.key, {
    ...config,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    snapshot: 0,
    backfill: 0,
    recentFrom: recentDays[0] ?? null,
    recentTo: recentDays.at(-1) ?? null,
    recentClosed: 0,
    recentWins: 0,
    recentLosses: 0,
    recentPnl: 0,
    recentRoeSum: 0,
    recentGrossWin: 0,
    recentGrossLoss: 0,
  }]));
  const dailyPnl = new Map(configs.map(({ key }) => [key, new Map()]));
  for (const trade of rows) {
    if (String(trade.side ?? '').toUpperCase() !== 'LONG') continue;
    for (const config of configs) {
      if (trade[config.field] !== true) continue;
      const group = groups.get(config.key);
      const pnl = liquidNetPnl(trade);
      const roe = liquidNetRoe(trade);
      group.total += 1;
      if (String(trade.liquidLongReversalBasis ?? '').toUpperCase().startsWith('DERIVED')) group.backfill += 1;
      else group.snapshot += 1;
      if (trade.status === 'CLOSED') {
        group.closed += 1;
        group.realizedPnl += pnl;
        group.roeSum += Number.isFinite(roe) ? roe : 0;
        if (pnl > 0) {
          group.wins += 1;
          group.grossWin += pnl;
        } else if (pnl < 0) {
          group.losses += 1;
          group.grossLoss += Math.abs(pnl);
        }
        const tradeDay = liquidPaperTradeDayKey(trade);
        if (tradeDay) {
          const dayMap = dailyPnl.get(config.key);
          dayMap.set(tradeDay, Number(dayMap.get(tradeDay) ?? 0) + pnl);
        }
        if (recentDaySet.has(tradeDay)) {
          group.recentClosed += 1;
          group.recentPnl += pnl;
          group.recentRoeSum += Number.isFinite(roe) ? roe : 0;
          if (pnl > 0) {
            group.recentWins += 1;
            group.recentGrossWin += pnl;
          } else if (pnl < 0) {
            group.recentLosses += 1;
            group.recentGrossLoss += Math.abs(pnl);
          }
        }
      } else if (trade.status === 'OPEN') {
        group.open += 1;
        group.unrealizedPnl += pnl;
      } else {
        group.pending += 1;
      }
    }
  }
  return configs.map(({ key }) => {
    const row = groups.get(key);
    const dayMap = dailyPnl.get(key);
    const positiveDays = [...dayMap.values()].filter((pnl) => pnl > 0).length;
    return {
      ...row,
      positiveDays,
      observedDays: dayMap.size,
      recentPositiveDays: recentDays.filter((day) => Number(dayMap.get(day) ?? 0) > 0).length,
      recentDayCount: recentDays.length,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      profitFactor: row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0
          ? 9.99
          : 0,
      netPnl: row.realizedPnl + row.unrealizedPnl,
      recentWr: row.recentClosed ? (row.recentWins / row.recentClosed) * 100 : null,
      recentAvgRoe: row.recentClosed ? row.recentRoeSum / row.recentClosed : null,
      recentProfitFactor: row.recentGrossLoss > 0
        ? row.recentGrossWin / row.recentGrossLoss
        : row.recentGrossWin > 0
          ? 9.99
          : 0,
    };
  }).filter((row) => row.total > 0);
}

function summarizeLiquidRunnerDirection(rows) {
  const sides = ['LONG', 'SHORT'];
  const order = ['PRIME', 'RECOVERY', 'WATCH', 'FADED', 'STRETCHED', 'NEW'];
  const groups = new Map(sides.flatMap((side) => order.map((tier) => [`${side}:${tier}`, {
    side,
    tier,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    highHits: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    snapshot: 0,
    backfill: 0,
  }])));
  for (const trade of rows) {
    const side = String(trade.side ?? '').toUpperCase();
    const tier = String(trade.liquidRunnerDirectionTier ?? 'UNRATED').toUpperCase();
    if (!sides.includes(side) || !order.includes(tier)) continue;
    const group = groups.get(`${side}:${tier}`);
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    group.total += 1;
    if (String(trade.liquidRunnerDirectionBasis ?? '').toUpperCase() === 'SNAPSHOT') group.snapshot += 1;
    else group.backfill += 1;
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (Number.isFinite(roe) && roe >= 30) group.highHits += 1;
      if (pnl > 0) {
        group.wins += 1;
        group.grossWin += pnl;
      } else if (pnl < 0) {
        group.losses += 1;
        group.grossLoss += Math.abs(pnl);
      }
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  return sides.flatMap((side) => order.map((tier) => {
    const row = groups.get(`${side}:${tier}`);
    return {
      ...row,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      hitRate: row.closed ? (row.highHits / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      profitFactor: row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0
          ? 9.99
          : 0,
      netPnl: row.realizedPnl + row.unrealizedPnl,
    };
  })).filter((row) => row.total > 0);
}

function renderLiquidStage4Stats(activeRows = []) {
  const section = els.liquidStage4Section;
  const el = els.liquidStage4Stats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.stage4,
    summarizeLiquidStage4(activeRows),
    (row) => `${row.side}:${row.stage3Tier}:${row.tier}`,
  ).filter((row) => row.total > 0);
  const total = stats.reduce((sum, row) => sum + row.total, 0);
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = stats.map((row) => {
    const classes = {
      ACTIVE: 'good',
      RECOVERY: 'neutral',
      FADED: 'bad',
      NEW: 'neutral',
    };
    const activePnl = Number(row.unrealizedPnl ?? 0);
    return `<div class="pump-paper-metric ${classes[row.tier] ?? 'neutral'}" ${liquidLiveCardAttr(`stage4:${row.side}:${row.stage3Tier}:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">${row.side} · ${row.stage3Tier === 'GOOD_PLUS' ? 'GOOD+' : row.stage3Tier} × EDGE ${row.tier}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · PF ${Number(row.profitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.avgRoe)}<br>Snapshot ${row.snapshot ?? 0} · Backfill ${row.backfill ?? 0}</small>
    </div>`;
  }).join('');
}

function renderLiquidEdgeActivePointStats(activeRows = []) {
  const section = els.liquidEdgeActivePointSection;
  const el = els.liquidEdgeActivePointStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.edgeActivePoint,
    summarizeLiquidEdgeActivePoint(activeRows),
    (row) => row.tier,
  );
  const total = stats.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  const classes = {
    GOOD: 'good',
    WATCH: 'neutral',
    RISK: 'bad',
    NO_DATA: 'neutral',
  };
  el.innerHTML = stats.map((row) => {
    const activePnl = Number(row.unrealizedPnl ?? 0);
    return `<div class="pump-paper-metric ${classes[row.tier] ?? 'neutral'}" ${liquidLiveCardAttr(`edge-point:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">EA POINT ${row.tier.replaceAll('_', ' ')}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>Chỉ SHORT · GOOD+ × EDGE ACTIVE · snapshot trước entry<br>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · PF ${Number(row.profitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.avgRoe)}</small>
    </div>`;
  }).join('');
}

function renderLiquidBtcWaveStats(activeRows = []) {
  const section = els.liquidBtcWaveSection;
  const el = els.liquidBtcWaveStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.btcWave,
    summarizeLiquidBtcWave(activeRows),
    (row) => `${row.side}:${row.stage3Tier}:${row.tier}`,
  ).filter((row) => row.total > 0);
  const total = stats.reduce((sum, row) => sum + row.total, 0);
  if (els.liquidBtcWaveRangeNote) {
    els.liquidBtcWaveRangeNote.textContent =
      `CONTINUATION / EXHAUSTED / TRANSITION / NO DATA từ snapshot tại entry · phạm vi ${liquidPaperSelectedRangeLabel()} · chỉ gắn nhãn, không chặn hay đổi size`;
  }
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  const classes = {
    CONTINUATION: 'good',
    EXHAUSTED: 'neutral',
    TRANSITION: 'bad',
    NO_DATA: 'neutral',
  };
  el.innerHTML = stats.map((row) => {
    const activePnl = Number(row.unrealizedPnl ?? 0);
    const recentRange = row.recentFrom && row.recentTo
      ? `${row.recentFrom.slice(5)}→${row.recentTo.slice(5)}`
      : '-';
    const recentDayCount = Number(row.recentDayCount ?? 0);
    const recentLabel = recentDayCount >= 5
      ? '5 ngày cuối trong range'
      : `${recentDayCount} ngày trong range`;
    return `<div class="pump-paper-metric ${classes[row.tier] ?? 'neutral'}" ${liquidLiveCardAttr(`btc-wave:${row.side}:${row.stage3Tier}:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">${row.side} · ${row.stage3Tier === 'GOOD_PLUS' ? 'GOOD+' : row.stage3Tier} × WAVE ${row.tier.replace('_', ' ')}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · PF ${Number(row.profitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.avgRoe)}<br>${recentLabel} ${recentRange}: ${row.recentClosed ?? 0} đóng · PnL ${renderClosedPnl(row.recentPnl)} · WR ${row.recentWr == null ? '-' : `${row.recentWr.toFixed(1)}%`} · PF ${Number(row.recentProfitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.recentAvgRoe)}<br>Snapshot ${row.snapshot ?? 0} · Backfill ${row.backfill ?? 0}</small>
    </div>`;
  }).join('');
}

function renderLiquidWaveContinuationStats(activeRows = []) {
  const el = els.liquidWaveContinuationStats;
  if (!el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.waveContinuation,
    summarizeLiquidWaveContinuation(activeRows),
    (row) => `${row.stage3Tier}:${row.tier}`,
  ).filter((row) => row.total > 0);
  if (!stats.length) {
    el.innerHTML = '<div class="table-empty">Chưa có lệnh SHORT × WAVE CONTINUATION đủ snapshot điểm thị trường trong range đã chọn.</div>';
    return;
  }
  const labels = {
    SHORT_CONTINUATION_EDGE_INTACT: 'SHORT CONTINUATION · EDGE CHƯA DECAY',
    SHORT_CONTINUATION_AFTER_EDGE_DECAY: 'SHORT CONTINUATION · SAU EDGE DECAY',
  };
  const classes = {
    SHORT_CONTINUATION_EDGE_INTACT: 'good',
    SHORT_CONTINUATION_AFTER_EDGE_DECAY: 'bad',
  };
  const badBucketLine = (row, prefix, label) => {
    const closed = Number(row[`${prefix}Closed`] ?? 0);
    const open = Number(row[`${prefix}Open`] ?? 0);
    const wins = Number(row[`${prefix}Wins`] ?? 0);
    const pnl = Number(row[`${prefix}Pnl`] ?? 0);
    const wr = closed ? `${(wins / closed * 100).toFixed(1)}%` : '-';
    return `${label}: ${closed} đóng / ${open} active · PnL đóng ${renderClosedPnl(pnl)} · WR ${wr}`;
  };
  el.innerHTML = stats.map((row) => {
    const activePnl = Number(row.unrealizedPnl ?? 0);
    const detail = row.tier === 'SHORT_CONTINUATION_AFTER_EDGE_DECAY'
      ? `Mốc decay causal = SHORT rơi khỏi peak/giảm liên tiếp + LONG tăng + BTC reclaim<br>${badBucketLine(row, 'bad0To15', 'Vào sau ≤15m')}<br>${badBucketLine(row, 'bad16To60', 'Vào sau 16–60m')}<br>${badBucketLine(row, 'badOver60', 'Vào sau >60m')}`
      : 'Tại entry chưa xuất hiện đủ điều kiện SHORT edge decay · không đồng nghĩa chắc chắn là tín hiệu tốt';
    return `<div class="pump-paper-metric ${classes[row.tier] ?? 'neutral'}" ${liquidLiveCardAttr(`wave-continuation:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">SHORT · ${row.stage3Tier === 'GOOD_PLUS' ? 'GOOD+' : 'GOOD'} × ${labels[row.tier] ?? row.tier}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · PF ${Number(row.profitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.avgRoe)}<br>${detail}</small>
    </div>`;
  }).join('');
}

function renderLiquidLongSessionStats(activeRows = []) {
  const section = els.liquidLongSessionSection;
  const el = els.liquidLongSessionStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.longSession,
    summarizeLiquidLongSession(activeRows),
    (row) => row.tier,
  ).filter((row) => row.total > 0);
  const total = stats.reduce((sum, row) => sum + row.total, 0);
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  const classes = {
    HEALTHY: 'good',
    WATCH: 'neutral',
    BREAKDOWN: 'bad',
    WARMUP: 'neutral',
    NO_DATA: 'neutral',
  };
  el.innerHTML = stats.map((row) => {
    const activePnl = Number(row.unrealizedPnl ?? 0);
    const recentRange = row.recentFrom && row.recentTo
      ? `${row.recentFrom.slice(5)}→${row.recentTo.slice(5)}`
      : '-';
    return `<div class="pump-paper-metric ${classes[row.tier] ?? 'neutral'}" ${liquidLiveCardAttr(`long-session:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">LONG SESSION · ${row.tier.replaceAll('_', ' ')}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>Snapshot causal: chỉ lệnh LONG đóng trước entry cùng ngày<br>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending}<br>Lịch sử: WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · PF ${Number(row.profitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.avgRoe)}<br>5D ${recentRange}: ${row.recentClosed ?? 0} đóng · PnL ${renderClosedPnl(row.recentPnl)} · WR ${row.recentWr == null ? '-' : `${row.recentWr.toFixed(1)}%`} · PF ${Number(row.recentProfitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.recentAvgRoe)}<br>Ổn định ngày 5D ${row.recentPositiveDays ?? 0}/${row.recentDayCount ?? 0} · toàn bộ ${row.positiveDays ?? 0}/${row.observedDays ?? 0}<br>Snapshot ${row.snapshot ?? 0} · Backfill ${row.backfill ?? 0}</small>
    </div>`;
  }).join('');
}

function renderLiquidLongMarketStats(activeRows = []) {
  const section = els.liquidLongMarketSection;
  const el = els.liquidLongMarketStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.longMarket,
    summarizeLiquidLongMarket(activeRows),
    (row) => row.tier,
  ).filter((row) => row.total > 0);
  const total = stats.reduce((sum, row) => sum + row.total, 0);
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  const classes = {
    TAILWIND: 'good',
    RECLAIM: 'good',
    LATE: 'neutral',
    HEADWIND: 'bad',
    TRANSITION: 'neutral',
    NO_DATA: 'neutral',
  };
  el.innerHTML = stats.map((row) => {
    const activePnl = Number(row.unrealizedPnl ?? 0);
    const recentRange = row.recentFrom && row.recentTo
      ? `${row.recentFrom.slice(5)}→${row.recentTo.slice(5)}`
      : '-';
    return `<div class="pump-paper-metric ${classes[row.tier] ?? 'neutral'}" ${liquidLiveCardAttr(`long-market:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">LONG ${row.tier.replaceAll('_', ' ')}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · PF ${Number(row.profitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.avgRoe)}<br>5D ${recentRange}: ${row.recentClosed ?? 0} đóng · PnL ${renderClosedPnl(row.recentPnl)} · WR ${row.recentWr == null ? '-' : `${row.recentWr.toFixed(1)}%`} · PF ${Number(row.recentProfitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.recentAvgRoe)}<br>Snapshot ${row.snapshot ?? 0} · Backfill ${row.backfill ?? 0}</small>
    </div>`;
  }).join('');
}

function renderLiquidLongMechanismStats(activeRows = []) {
  const section = els.liquidLongMechanismSection;
  const el = els.liquidLongMechanismStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.longMechanism,
    summarizeLiquidLongMechanisms(activeRows),
    (row) => row.key,
  ).filter((row) => row.total > 0);
  const total = stats.reduce((sum, row) => sum + row.total, 0);
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = stats.map((row) => {
    const activePnl = Number(row.unrealizedPnl ?? 0);
    const realizedPnl = Number(row.realizedPnl ?? 0);
    const cardClass = realizedPnl > 0 ? 'good' : realizedPnl < 0 ? 'bad' : 'neutral';
    const recentRange = row.recentFrom && row.recentTo
      ? `${row.recentFrom.slice(5)}→${row.recentTo.slice(5)}`
      : '-';
    return `<div class="pump-paper-metric ${cardClass}" ${liquidLiveCardAttr(`long-mechanism:${row.key}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">${escapeHtml(row.label)}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>${escapeHtml(row.condition)}<br>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending}<br>Lịch sử: WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · PF ${Number(row.profitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.avgRoe)}<br>5D ${recentRange}: ${row.recentClosed ?? 0} đóng · PnL ${renderClosedPnl(row.recentPnl)} · WR ${row.recentWr == null ? '-' : `${row.recentWr.toFixed(1)}%`} · PF ${Number(row.recentProfitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.recentAvgRoe)}<br>Ổn định ngày 5D ${row.recentPositiveDays ?? 0}/${row.recentDayCount ?? 0} · toàn bộ ${row.positiveDays ?? 0}/${row.observedDays ?? 0}<br>Snapshot ${row.snapshot ?? 0} · Backfill ${row.backfill ?? 0}</small>
    </div>`;
  }).join('');
}

function summarizeLiquidMarketPointPhases(rows) {
  const phases = [
    'CROSS_TO_LONG',
    'POST_CROSS_TO_LONG_30M',
    'LONG_DOMINANT',
    'CROSS_TO_SHORT',
    'POST_CROSS_TO_SHORT_30M',
    'SHORT_DOMINANT',
    'POINT_TIE',
  ];
  const groups = new Map();
  for (const phase of phases) {
    for (const side of ['LONG', 'SHORT']) {
      const key = `${phase}:${side}`;
      groups.set(key, {
        key,
        phase,
        side,
        total: 0,
        open: 0,
        pending: 0,
        closed: 0,
        wins: 0,
        losses: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        roeSum: 0,
        grossWin: 0,
        grossLoss: 0,
        pointCount: 0,
        longScoreSum: 0,
        shortScoreSum: 0,
        gapSum: 0,
        snapshot: 0,
        backfill: 0,
      });
    }
  }

  for (const trade of rows) {
    if (trade.liquidMarketPointPhaseEligible !== true) continue;
    const phase = String(trade.liquidMarketPointPhaseTier ?? '').toUpperCase();
    const side = String(trade.side ?? '').toUpperCase();
    const group = groups.get(`${phase}:${side}`);
    if (!group) continue;
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    const longScore = Number(trade.liquidMarketPointPhaseLongScore);
    const shortScore = Number(trade.liquidMarketPointPhaseShortScore);
    const gap = Number(trade.liquidMarketPointPhaseGap);
    group.total += 1;
    if (String(trade.liquidMarketPointPhaseBasis ?? '').toUpperCase().startsWith('ENTRY')) {
      group.snapshot += 1;
    } else {
      group.backfill += 1;
    }
    if (Number.isFinite(longScore) && Number.isFinite(shortScore) && Number.isFinite(gap)) {
      group.pointCount += 1;
      group.longScoreSum += longScore;
      group.shortScoreSum += shortScore;
      group.gapSum += gap;
    }
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) {
        group.wins += 1;
        group.grossWin += pnl;
      } else if (pnl < 0) {
        group.losses += 1;
        group.grossLoss += Math.abs(pnl);
      }
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }

  return [...groups.values()]
    .map((row) => ({
      ...row,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      profitFactor: row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0
          ? 9.99
          : 0,
      netPnl: row.realizedPnl + row.unrealizedPnl,
    }))
    .filter((row) => row.total > 0);
}

function renderLiquidMarketPointPhaseStats(activeRows = []) {
  const section = els.liquidMarketPointPhaseSection;
  const el = els.liquidMarketPointPhaseStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.marketPointPhase,
    summarizeLiquidMarketPointPhases(activeRows),
    (row) => row.key,
  ).filter((row) => row.total > 0);
  const total = stats.reduce((sum, row) => sum + row.total, 0);
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  const phaseLabels = {
    CROSS_TO_LONG: 'POINT CROSS · SHORT → LONG',
    POST_CROSS_TO_LONG_30M: 'POST CROSS → LONG · ≤30M',
    LONG_DOMINANT: 'LONG DOMINANT',
    CROSS_TO_SHORT: 'POINT CROSS · LONG → SHORT',
    POST_CROSS_TO_SHORT_30M: 'POST CROSS → SHORT · ≤30M',
    SHORT_DOMINANT: 'SHORT DOMINANT',
    POINT_TIE: 'POINT TIE',
  };
  el.innerHTML = stats.map((row) => {
    const activePnl = Number(row.unrealizedPnl ?? 0);
    const realizedPnl = Number(row.realizedPnl ?? 0);
    const pointCount = Number(row.pointCount ?? 0);
    const avgLong = pointCount ? Number(row.longScoreSum ?? 0) / pointCount : null;
    const avgShort = pointCount ? Number(row.shortScoreSum ?? 0) / pointCount : null;
    const avgGap = pointCount ? Number(row.gapSum ?? 0) / pointCount : null;
    const cardClass = realizedPnl > 0 ? 'good' : realizedPnl < 0 ? 'bad' : 'neutral';
    return `<div class="pump-paper-metric ${cardClass}">
      <span class="pump-paper-metric-label">${escapeHtml(row.side)} · ${escapeHtml(phaseLabels[row.phase] ?? row.phase)}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>Điểm TB LONG ${avgLong == null ? '-' : avgLong.toFixed(1)} · SHORT ${avgShort == null ? '-' : avgShort.toFixed(1)} · gap ${avgGap == null ? '-' : `${avgGap >= 0 ? '+' : ''}${avgGap.toFixed(1)}`}<br>Đã đóng ${row.closed} · ${row.wins}W/${row.losses}L · WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`}<br>PnL đóng ${renderClosedPnl(realizedPnl)} · PF ${Number(row.profitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.avgRoe)}<br>Active ${row.open} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending}<br>Snapshot ${row.snapshot ?? 0} · Backfill causal ${row.backfill ?? 0}</small>
    </div>`;
  }).join('');
}

function summarizeLiquidLongPointPhases(rows) {
  const order = [
    'SHORT_PRESSURE',
    'SHORT_FADE',
    'BALANCED',
    'LONG_TAKEOVER',
    'SHORT_RELOAD',
    'TRANSITION',
    'NO_DATA',
  ];
  const recentDays = liquidBtcWaveRecentDays();
  const recentDaySet = new Set(recentDays);
  const groups = new Map(order.map((tier) => [tier, {
    tier,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    pointCount: 0,
    longScoreSum: 0,
    shortScoreSum: 0,
    gapSum: 0,
    snapshot: 0,
    backfill: 0,
    recentFrom: recentDays[0] ?? null,
    recentTo: recentDays.at(-1) ?? null,
    recentClosed: 0,
    recentWins: 0,
    recentLosses: 0,
    recentPnl: 0,
    recentRoeSum: 0,
    recentGrossWin: 0,
    recentGrossLoss: 0,
  }]));
  const dailyPnl = new Map(order.map((tier) => [tier, new Map()]));
  for (const trade of rows) {
    const tier = String(trade.liquidLongPointPhaseTier ?? 'UNRATED').toUpperCase();
    if (!groups.has(tier)) continue;
    const group = groups.get(tier);
    const pnl = liquidNetPnl(trade);
    const roe = liquidNetRoe(trade);
    const longScore = trade.liquidLongPointPhaseLongScore == null
      ? NaN
      : Number(trade.liquidLongPointPhaseLongScore);
    const shortScore = trade.liquidLongPointPhaseShortScore == null
      ? NaN
      : Number(trade.liquidLongPointPhaseShortScore);
    const gap = trade.liquidLongPointPhaseGap == null
      ? NaN
      : Number(trade.liquidLongPointPhaseGap);
    group.total += 1;
    if (String(trade.liquidLongPointPhaseBasis ?? '').toUpperCase().startsWith('DERIVED')) group.backfill += 1;
    else group.snapshot += 1;
    if (Number.isFinite(longScore) && Number.isFinite(shortScore) && Number.isFinite(gap)) {
      group.pointCount += 1;
      group.longScoreSum += longScore;
      group.shortScoreSum += shortScore;
      group.gapSum += gap;
    }
    if (trade.status === 'CLOSED') {
      group.closed += 1;
      group.realizedPnl += pnl;
      group.roeSum += Number.isFinite(roe) ? roe : 0;
      if (pnl > 0) {
        group.wins += 1;
        group.grossWin += pnl;
      } else if (pnl < 0) {
        group.losses += 1;
        group.grossLoss += Math.abs(pnl);
      }
      const tradeDay = liquidPaperTradeDayKey(trade);
      if (tradeDay) {
        const dayMap = dailyPnl.get(tier);
        dayMap.set(tradeDay, Number(dayMap.get(tradeDay) ?? 0) + pnl);
      }
      if (recentDaySet.has(tradeDay)) {
        group.recentClosed += 1;
        group.recentPnl += pnl;
        group.recentRoeSum += Number.isFinite(roe) ? roe : 0;
        if (pnl > 0) {
          group.recentWins += 1;
          group.recentGrossWin += pnl;
        } else if (pnl < 0) {
          group.recentLosses += 1;
          group.recentGrossLoss += Math.abs(pnl);
        }
      }
    } else if (trade.status === 'OPEN') {
      group.open += 1;
      group.unrealizedPnl += pnl;
    } else {
      group.pending += 1;
    }
  }
  return order.map((tier) => {
    const row = groups.get(tier);
    const dayMap = dailyPnl.get(tier);
    return {
      ...row,
      positiveDays: [...dayMap.values()].filter((pnl) => pnl > 0).length,
      observedDays: dayMap.size,
      recentPositiveDays: recentDays.filter((day) => Number(dayMap.get(day) ?? 0) > 0).length,
      recentDayCount: recentDays.length,
      wr: row.closed ? (row.wins / row.closed) * 100 : null,
      avgRoe: row.closed ? row.roeSum / row.closed : null,
      profitFactor: row.grossLoss > 0 ? row.grossWin / row.grossLoss : row.grossWin > 0 ? 9.99 : 0,
      netPnl: row.realizedPnl + row.unrealizedPnl,
      recentWr: row.recentClosed ? (row.recentWins / row.recentClosed) * 100 : null,
      recentAvgRoe: row.recentClosed ? row.recentRoeSum / row.recentClosed : null,
      recentProfitFactor: row.recentGrossLoss > 0
        ? row.recentGrossWin / row.recentGrossLoss
        : row.recentGrossWin > 0
          ? 9.99
          : 0,
    };
  }).filter((row) => row.total > 0);
}

function renderLiquidLongPointPhaseStats(activeRows = []) {
  const section = els.liquidLongPointPhaseSection;
  const el = els.liquidLongPointPhaseStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.longPointPhase,
    summarizeLiquidLongPointPhases(activeRows),
    (row) => row.tier,
  ).filter((row) => row.total > 0);
  const total = stats.reduce((sum, row) => sum + row.total, 0);
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  const classes = {
    SHORT_PRESSURE: 'bad',
    SHORT_FADE: 'neutral',
    BALANCED: 'good',
    LONG_TAKEOVER: 'neutral',
    SHORT_RELOAD: 'bad',
    TRANSITION: 'neutral',
    NO_DATA: 'neutral',
  };
  el.innerHTML = stats.map((row) => {
    const activePnl = Number(row.unrealizedPnl ?? 0);
    const pointCount = Number(row.pointCount ?? 0);
    const avgLong = pointCount ? Number(row.longScoreSum ?? 0) / pointCount : null;
    const avgShort = pointCount ? Number(row.shortScoreSum ?? 0) / pointCount : null;
    const avgGap = pointCount ? Number(row.gapSum ?? 0) / pointCount : null;
    const recentRange = row.recentFrom && row.recentTo
      ? `${row.recentFrom.slice(5)}→${row.recentTo.slice(5)}`
      : '-';
    return `<div class="pump-paper-metric ${classes[row.tier] ?? 'neutral'}" ${liquidLiveCardAttr(`long-point:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">LM · ${row.tier.replaceAll('_', ' ')}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>Điểm TB LONG ${avgLong == null ? '-' : avgLong.toFixed(1)} · SHORT ${avgShort == null ? '-' : avgShort.toFixed(1)} · gap L-S ${avgGap == null ? '-' : `${avgGap >= 0 ? '+' : ''}${avgGap.toFixed(1)}`}<br>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending}<br>WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · PF ${Number(row.profitFactor ?? 0).toFixed(2)} · AvgROE ${renderAvgRoe(row.avgRoe)}<br>5D ${recentRange}: ${row.recentClosed ?? 0} đóng · PnL ${renderClosedPnl(row.recentPnl)} · WR ${row.recentWr == null ? '-' : `${row.recentWr.toFixed(1)}%`} · PF ${Number(row.recentProfitFactor ?? 0).toFixed(2)}<br>Ngày dương ${row.positiveDays ?? 0}/${row.observedDays ?? 0} · Snapshot ${row.snapshot ?? 0} · Backfill ${row.backfill ?? 0}</small>
    </div>`;
  }).join('');
}

function renderLiquidRunnerDirectionStats(activeRows = []) {
  const section = els.liquidRunnerDirectionSection;
  const el = els.liquidRunnerDirectionStats;
  if (!section || !el) return;
  const closedStats = getLiquidPaperClosedGroupStats();
  const stats = combineLiquidStageStats(
    closedStats.runnerDirection,
    summarizeLiquidRunnerDirection(activeRows),
    (row) => `${row.side}:${row.tier}`,
  ).filter((row) => row.total > 0);
  const total = stats.reduce((sum, row) => sum + row.total, 0);
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = stats.map((row) => {
    const classes = {
      PRIME: 'good',
      RECOVERY: 'neutral',
      WATCH: 'neutral',
      FADED: 'bad',
      STRETCHED: 'bad',
      NEW: 'neutral',
    };
    const activePnl = Number(row.unrealizedPnl ?? 0);
    const hitRate = row.closed ? (Number(row.highHits ?? 0) / row.closed) * 100 : null;
    return `<div class="pump-paper-metric ${classes[row.tier] ?? 'neutral'}" ${liquidLiveCardAttr(`runner-direction:${row.side}:${row.tier}`, row.avgRoe)}>
      <span class="pump-paper-metric-label">${row.side} · R30 ${row.tier}</span>
      <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
      <small>Đã đóng ${row.closed} · PnL đóng ${renderClosedPnl(row.realizedPnl)}<br>Active ${row.open} · PnL active ${fmtMoney(activePnl)} · Pending ${row.pending}<br>Hit ≥30% ${hitRate == null ? '-' : `${hitRate.toFixed(1)}%`} (${row.highHits ?? 0}/${row.closed}) · WR ${row.wr == null ? '-' : `${row.wr.toFixed(1)}%`} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}<br>AvgROE ${renderAvgRoe(row.avgRoe)} · Snapshot ${row.snapshot ?? 0} · Backfill ${row.backfill ?? 0}</small>
    </div>`;
  }).join('');
}

function renderLiquidRunner30Stats(activeRows = []) {
  const section = els.liquidRunner30Section;
  const el = els.liquidRunner30Stats;
  if (!section || !el) return;
  const closed = getLiquidPaperClosedGroupStats().runner30;
  const candidates = activeRows.filter((trade) => trade.liquidRunner30Matched === true);
  const active = candidates.filter((trade) => trade.status === 'OPEN');
  const pending = candidates.filter((trade) => trade.status !== 'OPEN');
  const total = closed.closed + active.length + pending.length;
  section.style.display = total ? 'block' : 'none';
  if (!total) {
    el.innerHTML = '';
    return;
  }
  const hitRate = closed.closed ? (closed.highHits / closed.closed) * 100 : null;
  const baselineRate = closed.allClosed ? (closed.allHighHits / closed.allClosed) * 100 : null;
  const highCoverage = closed.allHighHits ? (closed.highHits / closed.allHighHits) * 100 : null;
  const avgRoe = closed.closed
    ? closed.roeSum / closed.closed
    : null;
  const activePnl = active.reduce((sum, trade) => sum + liquidNetPnl(trade), 0);
  const version = candidates.find((trade) => trade.liquidRunner30Version)?.liquidRunner30Version
    ?? closed.version;
  el.innerHTML = `<div class="pump-paper-metric ${activePnl >= 0 ? 'good' : 'bad'}" ${liquidLiveCardAttr('runner30:CANDIDATE', avgRoe)}>
    <span class="pump-paper-metric-label">RUNNER 30 · CANDIDATE</span>
    <strong class="${activePnl >= 0 ? 'positive' : 'negative'}">${fmtMoney(activePnl)}</strong>
    <small>Đã đóng ${closed.closed} · PnL đóng ${renderClosedPnl(closed.realizedPnl)}<br>Active ${active.length} · PnL active ${fmtMoney(activePnl)} · Pending ${pending.length}<br>Hit Net ROE ≥30%: ${hitRate == null ? '-' : `${hitRate.toFixed(1)}%`} (${closed.highHits}/${closed.closed}) · nền ${baselineRate == null ? '-' : `${baselineRate.toFixed(1)}%`} · bắt ${highCoverage == null ? '-' : `${highCoverage.toFixed(1)}%`} tổng high<br>AvgROE ${renderAvgRoe(avgRoe)}${version ? ` · ${escapeHtml(version)}` : ''}</small>
  </div>`;
}

function renderLiquidComboStats(activeRows = []) {
  const el = els.liquidComboStats;
  if (!el) return;
  const rows = Array.isArray(liquidPaperComboStats) ? liquidPaperComboStats : [];
  if (!rows.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const activeByCombo = new Map();
  for (const trade of activeRows) {
    const key = liquidTradeCombo(trade);
    const current = activeByCombo.get(key) ?? { active: 0, pending: 0, pnl: 0 };
    if (trade.status === 'OPEN') {
      current.active += 1;
      current.pnl += liquidNetPnl(trade);
    } else {
      current.pending += 1;
    }
    activeByCombo.set(key, current);
  }
  el.style.display = 'grid';
  el.innerHTML = rows.map((row, index) => {
    const key = String(row.key ?? '-');
    const live = activeByCombo.get(key) ?? { active: 0, pending: 0, pnl: 0 };
    const parts = key.split('|').map((p) => p.trim()).filter(Boolean);
    const title = parts.slice(0, 3).join(' · ') || key;
    const tags = parts.slice(3).map((part) => {
      const upper = part.toUpperCase();
      const cls = upper.includes('BAD') || upper.includes('BLOCK') || upper.includes('RAC') || upper.includes('COUNTER') ? 'bad'
        : upper.includes('GOOD') || upper.includes('OK') || upper.includes('THUAN') || upper.includes('THEO') ? 'hot'
          : '';
      return `<span class="pump-combo-tag ${cls}" title="${escapeHtml(part)}">${escapeHtml(part)}</span>`;
    }).join('');
    const quality = String(row.quality ?? '').toLowerCase();
    const cardCls = quality.includes('good') ? 'good' : quality.includes('bad') ? 'bad' : 'neutral';
    const pnl = Number(row.pnl ?? 0);
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const avgRoe = renderAvgRoe(row.avgRoe);
    const plan = row.tradePlan ?? {};
    const planLabel = String(plan.label ?? '').trim() || 'TEST $1';
    const planMargin = Number(plan.marginUsdt);
    const planCls = Number.isFinite(planMargin) && planMargin <= 1.01 ? 'bad' : 'hot';
    const planTitle = plan.reason ? ` title="${escapeHtml(plan.reason)}"` : '';
    return `<div class="pump-combo-card ${cardCls}" ${liquidLiveCardAttr(`combo:${key}`, row.avgRoe)}>
      <div class="pump-combo-head">
        <div class="pump-combo-title">#${index + 1} ${escapeHtml(title)}</div>
        <span class="pump-combo-tag ${planCls}"${planTitle}>${escapeHtml(planLabel)}</span>
      </div>
      <div class="pump-combo-tags">${tags}</div>
      <div class="pump-combo-stats">
        <div>${row.wins ?? 0}W/${row.losses ?? 0}L · WR ${wr} · Closed ${row.closed ?? 0}/${row.total ?? 0}</div>
        <div class="pump-combo-pnl ${pnl >= 0 ? 'pos' : 'neg'}">PnL đóng ${renderClosedPnl(pnl)} · AvgROE ${avgRoe}</div>
        <div class="pump-combo-pnl ${live.pnl >= 0 ? 'pos' : 'neg'}">Active ${live.active} · PnL active ${fmtMoney(live.pnl)} · Pending ${live.pending}</div>
      </div>
    </div>`;
  }).join('');
}

function renderLiquidComboCycleCards(rows = [], { forming = false, liveByKey = new Map() } = {}) {
  return rows.map((row, index) => {
    const parts = String(row.comboKey ?? '-')
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    const title = parts.slice(0, 3).join(' · ') || String(row.comboKey ?? '-');
    const comboTags = parts.slice(3).map((part) => {
      const upper = part.toUpperCase();
      const cls = upper.includes('COUNTER') || upper.includes('RAC') || upper.includes('BLOCK')
        ? 'bad'
        : upper.includes('THUAN') || upper.includes('ALIGNED') || upper.includes('THEO')
          ? 'hot'
          : '';
      return `<span class="pump-combo-tag ${cls}" title="${escapeHtml(part)}">${escapeHtml(part)}</span>`;
    }).join('');
    const history = row.history ?? {};
    const recent = row.recent ?? {};
    const pnl = Number(history.pnl ?? 0);
    const live = liveByKey.get(String(row.key ?? '')) ?? {
      active: Number(row.active ?? 0),
      pending: Number(row.pending ?? 0),
      pnl: Number(row.activePnl ?? 0),
    };
    const activePnl = Number(live.pnl ?? 0);
    const label = forming ? 'ĐANG XÁC NHẬN' : 'ỔN ĐỊNH';
    const cardCls = forming ? 'neutral' : 'good';
    const liveKey = `${forming ? 'cycle-forming' : 'cycle-stable'}:${String(row.key ?? '')}`;
    return `<div class="pump-combo-card ${cardCls}" ${liquidLiveCardAttr(liveKey, history.avgRoe)}>
      <div class="pump-combo-head">
        <div class="pump-combo-title">#${index + 1} ${escapeHtml(title)}</div>
        <span class="pump-combo-tag ${forming ? '' : 'hot'}">${label}</span>
      </div>
      <div class="pump-combo-tags">
        ${comboTags}
        <span class="pump-combo-tag hot">${escapeHtml(row.dayMove ?? '-')}</span>
        <span class="pump-combo-tag hot">${escapeHtml(row.rsi4h ?? '-')}</span>
      </div>
      <div class="pump-combo-stats">
        <div>${history.wins ?? 0}W/${history.losses ?? 0}L · Closed ${history.closed ?? 0}/${row.total ?? 0} · ${history.episodes ?? 0} episode</div>
        <div>Ngày dương ${history.positiveDays ?? 0}/${history.days ?? 0} (${Number(history.positiveDayRate ?? 0).toFixed(0)}%) · PF ${Number(history.profitFactor ?? 0).toFixed(2)} · ngày lớn nhất ${Number(history.maxDayShare ?? 0).toFixed(0)}%</div>
        <div class="pump-combo-pnl ${pnl >= 0 ? 'pos' : 'neg'}">PnL đóng ${renderClosedPnl(pnl)} · AvgROE ${renderAvgRoe(history.avgRoe)}</div>
        <div>Gần đây ${recent.positiveDays ?? 0}/${recent.days ?? 0} ngày dương · PF ${Number(recent.profitFactor ?? 0).toFixed(2)}</div>
        <div class="pump-combo-pnl ${activePnl >= 0 ? 'pos' : 'neg'}">Active ${live.active ?? 0} · PnL active ${fmtMoney(activePnl)} · Pending ${live.pending ?? 0}</div>
      </div>
      ${forming ? '' : liquidLiveCardToggleHtml(liveKey, history.avgRoe)}
    </div>`;
  }).join('');
}

function liquidComboCycleLiveKey(trade = {}) {
  const health = trade.btcHealth ?? {};
  const pct24h = Number(health.pct24h ?? trade.btcPct24h);
  const rsi4h = Number(health.rsi4h ?? trade.btcRsi4h);
  if (!Number.isFinite(pct24h) || !Number.isFinite(rsi4h)) return null;
  const dayMove = pct24h >= 0.2 ? 'DAY_POS' : pct24h <= -0.2 ? 'DAY_NEG' : 'DAY_FLAT';
  const rsi = rsi4h < 50 ? 'RSI4_RESET' : rsi4h < 58 ? 'RSI4_BALANCED' : 'RSI4_HOT';
  return `${liquidTradeCombo(trade)} || CYCLE ${dayMove} | ${rsi}`;
}

function renderLiquidComboTodayCards(rows = [], { liveByKey = new Map() } = {}) {
  return rows.map((row, index) => {
    const parts = String(row.comboKey ?? '-')
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    const title = parts.slice(0, 3).join(' · ') || String(row.comboKey ?? '-');
    const comboTags = parts.slice(3).map((part) => {
      const upper = part.toUpperCase();
      const cls = upper.includes('COUNTER') || upper.includes('RAC') || upper.includes('BLOCK')
        ? 'bad'
        : upper.includes('THUAN') || upper.includes('ALIGNED') || upper.includes('THEO')
          ? 'hot'
          : '';
      return `<span class="pump-combo-tag ${cls}" title="${escapeHtml(part)}">${escapeHtml(part)}</span>`;
    }).join('');
    const today = row.today ?? {};
    const pnl = Number(today.pnl ?? 0);
    const live = liveByKey.get(String(row.key ?? '')) ?? {
      active: Number(row.active ?? 0),
      pending: Number(row.pending ?? 0),
      pnl: Number(row.activePnl ?? 0),
    };
    const activePnl = Number(live.pnl ?? 0);
    return `<div class="pump-combo-card good" ${liquidLiveCardAttr(`cycle-today:${String(row.key ?? '')}`, today.avgRoe)}>
      <div class="pump-combo-head">
        <div class="pump-combo-title">#${index + 1} ${escapeHtml(title)}</div>
        <span class="pump-combo-tag hot">ỔN ĐỊNH · HÔM NAY</span>
      </div>
      <div class="pump-combo-tags">
        ${comboTags}
        <span class="pump-combo-tag hot">${escapeHtml(row.dayMove ?? '-')}</span>
        <span class="pump-combo-tag hot">${escapeHtml(row.rsi4h ?? '-')}</span>
      </div>
      <div class="pump-combo-stats">
        <div>${today.wins ?? 0}W/${today.losses ?? 0}L · Closed ${today.closed ?? 0}/${row.total ?? 0} · ${today.episodes ?? 0} episode</div>
        <div>WR ${Number(row.winRate ?? 0).toFixed(1)}% · PF ${Number(today.profitFactor ?? 0).toFixed(2)}</div>
        <div class="pump-combo-pnl ${pnl >= 0 ? 'pos' : 'neg'}">PnL đóng ${renderClosedPnl(pnl)} · AvgROE ${renderAvgRoe(today.avgRoe)}</div>
        <div class="pump-combo-pnl ${activePnl >= 0 ? 'pos' : 'neg'}">Active ${live.active ?? 0} · PnL active ${fmtMoney(activePnl)} · Pending ${live.pending ?? 0}</div>
      </div>
    </div>`;
  }).join('');
}

function renderLiquidComboTodayStats(activeRows = []) {
  const section = els.liquidComboTodaySection;
  const el = els.liquidComboTodayGood;
  if (!section || !el) return;
  const stats = liquidComboCycleStats?.today ?? null;
  if (!stats) {
    section.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const rows = Array.isArray(stats.stableToday) ? stats.stableToday : [];
  const liveByKey = new Map();
  for (const trade of activeRows) {
    if (liquidPaperTradeDayKey(trade) !== stats.day) continue;
    const key = liquidComboCycleLiveKey(trade);
    if (!key) continue;
    const live = liveByKey.get(key) ?? { active: 0, pending: 0, pnl: 0 };
    if (trade.status === 'OPEN') {
      live.active += 1;
      live.pnl += liquidNetPnl(trade);
    } else {
      live.pending += 1;
    }
    liveByKey.set(key, live);
  }
  section.style.display = 'block';
  if (els.liquidComboTodaySummary) {
    els.liquidComboTodaySummary.textContent = [
      stats.day ?? '-',
      stats.timeZone ?? LIQUID_PAPER_DAY_TIME_ZONE,
      'chỉ combo thuộc nhóm ỔN ĐỊNH QUA NGÀY',
      'không yêu cầu PnL/PF hôm nay phải dương',
      'chỉ thống kê, không quản lý vào lệnh',
    ].join(' · ');
  }
  el.innerHTML = rows.length
    ? renderLiquidComboTodayCards(rows, { liveByKey })
    : '<div class="table-empty liquid-combo-cycle-empty">Hôm nay chưa có lệnh nào thuộc các combo đã được xác nhận ỔN ĐỊNH QUA NGÀY.</div>';
}

function renderLiquidComboCycleStats(activeRows = []) {
  const section = els.liquidComboCycleSection;
  const stableEl = els.liquidComboCycleStable;
  if (!section || !stableEl) return;
  const stats = liquidComboCycleStats;
  const stable = Array.isArray(stats?.stableGood) ? stats.stableGood : [];
  const forming = Array.isArray(stats?.formingGood) ? stats.formingGood : [];
  const liveByKey = new Map();
  for (const trade of activeRows) {
    const key = liquidComboCycleLiveKey(trade);
    if (!key) continue;
    const live = liveByKey.get(key) ?? { active: 0, pending: 0, pnl: 0 };
    if (trade.status === 'OPEN') {
      live.active += 1;
      live.pnl += liquidNetPnl(trade);
    } else {
      live.pending += 1;
    }
    liveByKey.set(key, live);
  }
  section.style.display = 'block';
  if (els.liquidComboCycleSummary) {
    const criteria = stats?.criteria?.stable ?? {};
    els.liquidComboCycleSummary.textContent = [
      'Toàn bộ lịch sử',
      'gom episode 15 phút',
      `ổn định ≥ ${criteria.minDays ?? 3} ngày`,
      `ngày dương ≥ ${criteria.minPositiveDayRate ?? 60}%`,
      `PF ≥ ${criteria.minProfitFactor ?? 1.2}`,
      'chỉ thống kê, không quản lý vào lệnh',
    ].join(' · ');
  }
  stableEl.innerHTML = stable.length
    ? renderLiquidComboCycleCards(stable, { liveByKey })
    : '<div class="table-empty liquid-combo-cycle-empty">Chưa có combo nào đủ chuẩn ổn định ≥3 ngày. Không nâng nhãn chỉ vì một cụm lệnh hoặc 2 ngày tốt.</div>';
  if (els.liquidComboCycleFormingWrap && els.liquidComboCycleForming) {
    els.liquidComboCycleFormingWrap.style.display = forming.length ? 'block' : 'none';
    if (els.liquidComboCycleFormingSummary) {
      els.liquidComboCycleFormingSummary.textContent = `Đang xác nhận thêm ngày: ${forming.length} combo tốt`;
    }
    els.liquidComboCycleForming.innerHTML = renderLiquidComboCycleCards(forming, { forming: true, liveByKey });
  }
}

function applyLiquidPaperLiveMark(trade, mark, feeRate = 0.0004) {
  const markPrice = Number(mark?.markPrice);
  if (!Number.isFinite(markPrice) || markPrice <= 0) return trade;
  const next = {
    ...trade,
    markPrice,
    markUpdatedAt: mark.markUpdatedAt ?? Date.now(),
    markSource: mark.markSource ?? 'ws',
  };
  if (next.status !== 'OPEN') return next;
  const entry = Number(next.entryPrice);
  const quantity = Number(next.quantity);
  const margin = Number(next.marginUsdt);
  if (!(entry > 0) || !(quantity > 0)) return next;
  const sideMult = String(next.side ?? '').toUpperCase() === 'LONG' ? 1 : -1;
  const pnl = (markPrice - entry) * quantity * sideMult;
  const roe = margin > 0 ? (pnl / margin) * 100 : null;
  const signalMark = Number(next.signalMarkPrice ?? next.openedSnapshot?.signalMarkPrice);
  const leverage = Number(next.leverage);
  const signalQuantity = signalMark > 0 && margin > 0 && leverage > 0
    ? (margin * leverage) / signalMark
    : null;
  const signalPnl = signalQuantity != null
    ? (markPrice - signalMark) * signalQuantity * sideMult
    : null;
  const signalRoe = signalPnl != null && margin > 0 ? (signalPnl / margin) * 100 : null;
  const safeFeeRate = Number.isFinite(Number(feeRate)) && Number(feeRate) >= 0
    ? Number(feeRate)
    : 0.0004;
  const estimatedFeeUsdt = (Math.abs(entry * quantity) + Math.abs(markPrice * quantity)) * safeFeeRate;
  const netPnl = pnl - estimatedFeeUsdt;
  const netRoe = margin > 0 ? (netPnl / margin) * 100 : null;
  return {
    ...next,
    pnl,
    roe,
    signalPnl,
    signalRoe,
    grossPnl: pnl,
    estimatedFeeUsdt,
    feeUsdt: estimatedFeeUsdt,
    netPnl,
    netRoe,
  };
}

function matchesCurrentLiquidPaperView(trade) {
  if (!String(trade?.source ?? '').startsWith('liquid-scan')) return false;
  if (
    liquidStage3Filter !== 'all'
    && String(trade?.liquidStage3Tier ?? 'WATCH').toUpperCase() !== liquidStage3Filter
  ) return false;
  if (!matchesLiquidStableMechanismFilter(trade, liquidStableMechanismFilter)) return false;
  if (
    liquidStage4Filter !== 'all'
    && String(trade?.liquidStage4Tier ?? 'UNRATED').toUpperCase() !== liquidStage4Filter
  ) return false;
  if (
    liquidBtcWaveFilter !== 'all'
    && String(trade?.liquidBtcWaveTier ?? 'UNRATED').toUpperCase() !== liquidBtcWaveFilter
  ) return false;
  if (
    liquidLongSessionFilter !== 'all'
    && String(trade?.liquidLongSessionTier ?? 'UNRATED').toUpperCase() !== liquidLongSessionFilter
  ) return false;
  if (
    liquidLongMarketFilter !== 'all'
    && String(trade?.liquidLongMarketTier ?? 'UNRATED').toUpperCase() !== liquidLongMarketFilter
  ) return false;
  if (
    liquidRunnerDirectionFilter !== 'all'
    && String(trade?.liquidRunnerDirectionTier ?? 'UNRATED').toUpperCase() !== liquidRunnerDirectionFilter
  ) return false;
  return true;
}

function recordLiquidPaperClosedTransition(previous, current) {
  if (!liquidPaperClosedTotalsReady) return;
  if (previous?.status === 'CLOSED' || current?.status !== 'CLOSED') return;
  if (String(current?.source ?? '').startsWith('liquid-scan')) {
    liquidPaperClosedGroupStatsDirty = true;
  }
  if (!matchesCurrentLiquidPaperView(current)) return;
  const pnl = liquidNetPnl(current);
  liquidPaperClosedTotals.count += 1;
  liquidPaperClosedTotals.pnl += pnl;
  if (pnl > 0) liquidPaperClosedTotals.wins += 1;
}

function mergeLiquidPaperLivePayload(data) {
  const updates = Array.isArray(data?.trades) ? data.trades : [];
  const updateById = new Map(updates.filter((trade) => trade?.id).map((trade) => [trade.id, trade]));
  const marksBySymbol = new Map(
    (Array.isArray(data?.marks) ? data.marks : [])
      .filter((mark) => mark?.symbol)
      .map((mark) => [String(mark.symbol).toUpperCase(), mark]),
  );
  const knownIds = new Set(paperTrades.map((trade) => trade.id));
  paperTrades = paperTrades.map((trade) => {
    const updated = updateById.has(trade.id) ? { ...trade, ...updateById.get(trade.id) } : trade;
    const mark = marksBySymbol.get(String(updated.symbol ?? '').toUpperCase());
    const current = mark ? applyLiquidPaperLiveMark(updated, mark, data?.feeRate) : updated;
    recordLiquidPaperClosedTransition(trade, current);
    return current;
  });
  for (const trade of updates) {
    if (!trade?.id || knownIds.has(trade.id)) continue;
    if (!liquidPaperTradeMatchesDateRange(trade)) continue;
    const mark = marksBySymbol.get(String(trade.symbol ?? '').toUpperCase());
    const current = mark ? applyLiquidPaperLiveMark(trade, mark, data?.feeRate) : trade;
    recordLiquidPaperClosedTransition(null, current);
    paperTrades.push(current);
  }
}

function startLiquidPaperStream() {
  ensureLiquidSocketHealthTimer();
  if (!window.EventSource) {
    liquidPaperSocketMode = 'unsupported';
    renderLiquidSocketHealth();
    return;
  }
  if (liquidPaperStream) return;
  if (liquidPaperSocketMode !== 'reconnecting') liquidPaperSocketMode = 'connecting';
  renderLiquidSocketHealth();
  liquidPaperStream = new EventSource('/api/liquid-paper-trades-stream');
  liquidPaperStream.onopen = () => {
    liquidPaperSocketMode = 'open';
    renderLiquidSocketHealth();
  };
  liquidPaperStream.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error) {
      els.openPaperBody.innerHTML = `<tr><td colspan="31" class="table-empty">Stream lỗi: ${escapeHtml(data.error)}</td></tr>`;
        return;
      }
      liquidPaperSocketMode = 'open';
      mergeLiquidPaperLivePayload(data);
      updateLiveStatus(data, 'sse');
      renderAutoPaperTrades({ liveOnly: true });
    } catch { /* ignore malformed SSE packet */ }
  };
  liquidPaperStream.onerror = () => {
    liquidPaperSocketMode = 'reconnecting';
    renderLiquidSocketHealth();
    liquidPaperStream.close();
    liquidPaperStream = null;
    setTimeout(startLiquidPaperStream, 3000);
  };
}

function renderAutoPaperTrades({ liveOnly = false } = {}) {
  const renderRows = liveOnly
    ? paperTrades.filter((trade) => trade.status !== 'CLOSED')
    : paperTrades;
  const sourceRows = renderRows.filter((t) => String(t.source ?? '').startsWith('liquid-scan'));
  const all = sourceRows.filter(matchesCurrentLiquidPaperView);
  updateLiquidPaperSortHeaders();
  const statsActiveRows = liveOnly
    ? sourceRows
    : sourceRows.filter((trade) => trade.status !== 'CLOSED');
  renderLiquidPaperOverview(statsActiveRows);
  renderLiquidStage2Stats(statsActiveRows);
  renderLiquidStage3Stats(statsActiveRows);
  renderLiquidLongCorrReboundStats(statsActiveRows);
  renderLiquidStableMechanismStats(statsActiveRows);
  renderLiquidLongBtcExpansionStats(statsActiveRows);
  renderLiquidComboBtcBreadthStats(statsActiveRows);
  renderLiquidStage4Stats(statsActiveRows);
  renderLiquidEdgeActivePointStats(statsActiveRows);
  renderLiquidMarketPointPhaseStats(statsActiveRows);
  renderLiquidBtcWaveStats(statsActiveRows);
  renderLiquidWaveContinuationStats(statsActiveRows);
  renderLiquidLongSessionStats(statsActiveRows);
  renderLiquidLongMarketStats(statsActiveRows);
  renderLiquidLongMechanismStats(statsActiveRows);
  renderLiquidLongPointPhaseStats(statsActiveRows);
  renderLiquidRunner30Stats(statsActiveRows);
  renderLiquidRunnerDirectionStats(statsActiveRows);
  renderLiquidComboTodayStats(statsActiveRows);
  renderLiquidComboCycleStats(statsActiveRows);
  renderLiquidComboStats(statsActiveRows);
  decorateLiquidLiveCardToggles();

  const allOpen = all.filter((trade) => trade.status !== 'CLOSED');
  const active = allOpen.filter((trade) => trade.status === 'OPEN');
  const pending = allOpen.filter((trade) => trade.status === 'PENDING');
  const allClosed = liveOnly ? [] : all.filter((trade) => trade.status === 'CLOSED');
  const open = sortLiquidPaperRows(allOpen).slice(0, 80);
  const closed = liveOnly ? [] : sortLiquidPaperRows(allClosed).slice(0, 200);

  // ── Stats bar ──
  if (!liveOnly) {
    const realizedPnl = allClosed.reduce((sum, trade) => sum + liquidNetPnl(trade), 0);
    liquidPaperClosedTotals = {
      count: allClosed.length,
      wins: allClosed.filter((trade) => liquidNetPnl(trade) > 0).length,
      pnl: realizedPnl,
    };
    liquidPaperClosedTotalsReady = true;
  }

  const activePnl = active.reduce((sum, trade) => sum + liquidNetPnl(trade), 0);
  const { count: closedCount, wins, pnl: realizedPnl } = liquidPaperClosedTotals;
  const winRate = closedCount > 0 ? (wins / closedCount * 100) : null;
  const statsEl = els.liquidPaperStats;
  if (statsEl) {
    statsEl.style.display = all.length || closedCount > 0 ? 'flex' : 'none';
    statsEl.innerHTML = `
      <div class="lp-stat"><span>Active</span><strong id="liquidActiveTotal">${active.length}</strong></div>
      <div class="lp-stat"><span>Pending</span><strong>${pending.length}</strong></div>
      <div class="lp-divider"></div>
      <div class="lp-stat"><span>Tổng đã đóng</span><strong id="liquidClosedTotal">${closedCount}</strong></div>
      <div class="lp-stat"><span>Win Rate</span><strong class="${winRate != null && winRate >= 50 ? 'positive' : 'negative'}">${winRate != null ? `${winRate.toFixed(0)}%` : '-'} <small style="font-size:11px;font-weight:400">(${wins}/${closedCount})</small></strong></div>
      <div class="lp-divider"></div>
      <div class="lp-stat"><span>PnL đã đóng</span><strong class="${realizedPnl > 0 ? 'positive' : realizedPnl < 0 ? 'negative' : ''}">${realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(4)} USDT</strong></div>
      <div class="lp-stat lp-stat-live"><span>PnL đang active</span><strong id="liquidActivePnl" class="${activePnl > 0 ? 'positive' : activePnl < 0 ? 'negative' : ''}">${activePnl >= 0 ? '+' : ''}${activePnl.toFixed(4)} USDT</strong></div>
    `;
  }
  if (els.closedPaperCount) els.closedPaperCount.textContent = `${closedCount} closed`;

  // ── Open / Pending table ──
  if (open.length === 0) {
    els.openPaperBody.innerHTML = '<tr><td colspan="31" class="table-empty">Không có trade đang mở trong nhãn đã chọn.</td></tr>';
  } else {
    els.openPaperBody.innerHTML = open.map((trade) => {
      const pnl = liquidNetPnl(trade);
      const roe = liquidNetRoe(trade);
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
          <td>${renderLiquidEvalBadge(trade)}</td>
          <td>${renderLiquidStage2Badge(trade)}</td>
          <td>${renderLiquidStage3Badge(trade)}</td>
          <td>${renderLiquidStage4Badge(trade)}</td>
          <td>${renderLiquidEdgeActivePointBadge(trade)}</td>
          <td>${renderLiquidMarketPointPhaseBadge(trade)}</td>
          <td>${renderLiquidBtcWaveBadge(trade)}</td>
          <td>${renderLiquidLongSessionBadge(trade)}</td>
          <td>${renderLiquidLongMarketBadge(trade)}</td>
          <td>${renderLiquidLongReversalBadge(trade)}</td>
          <td>${renderLiquidLongPointPhaseBadge(trade)}</td>
          <td>${renderLiquidRunner30Badge(trade)}</td>
          <td>${renderLiquidRunnerDirectionBadge(trade)}</td>
          <td class="${statusCls}">${escapeHtml(trade.status)}</td>
          <td>${fmtPrice(trade.entryPrice)}</td>
          <td>${renderLiquidTakeProfit(trade)}</td>
          <td>${fmtPrice(trade.markPrice)}</td>
          <td class="${entryClass}">${toEntry == null ? '-' : `${fmt(toEntry, 2)}%`}</td>
          <td class="${Math.abs(sweepDistance) >= 1 ? 'positive' : 'neutral'}">${fmt(Math.abs(sweepDistance), 2)}%</td>
          <td>${feasibleLev ? `${fmt(feasibleLev, 0)}x` : '-'}<small>score ${fmt(feasibility, 0)} · RR ${fmt(rr, 2)}</small></td>
          <td>${fmt(trade.marginUsdt, 2)} / ${fmt(trade.leverage, 0)}x</td>
          <td class="${pnlClass}">${renderLiquidNetPnl(trade)}</td>
          <td class="${pnlClass}">${fmt(roe, 2)}%</td>
          <td class="${signalClass}">${fmt(signalPnl, 4)}<small>${fmt(signalRoe, 2)}%</small></td>
          <td>${huntTradeCell(trade)}</td>
          <td>${renderLiquidBtcTrendBadge(trade)}</td>
          <td>${renderLiquidComboCell(trade)}</td>
          <td>${escapeHtml(trade.note ?? '')}</td>
          <td>${fmtTime(trade.openedAt ?? trade.entryReadyAt ?? trade.createdAt)}</td>
        </tr>
      `;
    }).join('');
  }

  if (liveOnly) return;

  // ── Closed table ──
  if (closed.length === 0) {
    els.closedPaperBody.innerHTML = '<tr><td colspan="28" class="table-empty">Chưa có closed trade trong nhãn đã chọn.</td></tr>';
  } else {
    els.closedPaperBody.innerHTML = closed.map((trade) => {
      const pnl = liquidNetPnl(trade);
      const roe = liquidNetRoe(trade);
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
          <td>${renderLiquidEvalBadge(trade)}</td>
          <td>${renderLiquidStage2Badge(trade)}</td>
          <td>${renderLiquidStage3Badge(trade)}</td>
          <td>${renderLiquidStage4Badge(trade)}</td>
          <td>${renderLiquidEdgeActivePointBadge(trade)}</td>
          <td>${renderLiquidMarketPointPhaseBadge(trade)}</td>
          <td>${renderLiquidBtcWaveBadge(trade)}</td>
          <td>${renderLiquidLongSessionBadge(trade)}</td>
          <td>${renderLiquidLongMarketBadge(trade)}</td>
          <td>${renderLiquidLongReversalBadge(trade)}</td>
          <td>${renderLiquidLongPointPhaseBadge(trade)}</td>
          <td>${renderLiquidRunner30Badge(trade)}</td>
          <td>${renderLiquidRunnerDirectionBadge(trade)}</td>
          <td class="${outcomeCls}"><strong>${escapeHtml(outcome)}</strong></td>
          <td>${fmtPrice(trade.entryPrice)}</td>
          <td>${renderLiquidTakeProfit(trade)}</td>
          <td>${fmtPrice(trade.exitPrice ?? trade.markPrice)}</td>
          <td>${fmt(trade.marginUsdt, 2)} / ${fmt(trade.leverage, 0)}x</td>
          <td class="${pnlClass}">${renderLiquidNetPnl(trade)}</td>
          <td class="${pnlClass}">${fmt(roe, 2)}%</td>
          <td class="${signalClass}">${fmt(signalPnl, 4)}<small>${fmt(signalRoe, 2)}%</small></td>
          <td>${renderLiquidBtcTrendBadge(trade)}</td>
          <td>${renderLiquidComboCell(trade)}</td>
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
document.addEventListener('change', (event) => {
  const input = event.target.closest?.('[data-liquid-live-toggle]');
  if (!input) return;
  updateLiquidLiveCardToggle(input).catch((error) => {
    input.checked = !input.checked;
    input.disabled = false;
    alert(`Không cập nhật được Binance whitelist: ${error.message}`);
  });
});
els.autoPaperButton.addEventListener('click', autoCreatePaperTests);
els.liquidPaperDateFrom?.addEventListener('change', () => stageLiquidPaperDateInputs('from'));
els.liquidPaperDateTo?.addEventListener('change', () => stageLiquidPaperDateInputs('to'));
els.liquidPaperTodayButton?.addEventListener('click', () => setLiquidPaperToday({ showLoading: true }));
els.liquidPaperAllDatesButton?.addEventListener('click', stageLiquidPaperAllDates);
els.liquidPaperDateSearchButton?.addEventListener('click', applyLiquidPaperDateSearch);
els.liquidStage3Filter?.addEventListener('change', () => {
  liquidStage3Filter = String(els.liquidStage3Filter.value || 'all').toUpperCase();
  if (liquidStage3Filter === 'ALL') liquidStage3Filter = 'all';
  renderAutoPaperTrades();
});
els.liquidStableMechanismFilter?.addEventListener('change', () => {
  liquidStableMechanismFilter = normalizeLiquidStableMechanismFilter(
    els.liquidStableMechanismFilter.value,
  );
  renderAutoPaperTrades();
});
els.liquidStage4Filter?.addEventListener('change', () => {
  liquidStage4Filter = String(els.liquidStage4Filter.value || 'all').toUpperCase();
  if (liquidStage4Filter === 'ALL') liquidStage4Filter = 'all';
  renderAutoPaperTrades();
});
els.liquidBtcWaveFilter?.addEventListener('change', () => {
  liquidBtcWaveFilter = String(els.liquidBtcWaveFilter.value || 'all').toUpperCase();
  if (liquidBtcWaveFilter === 'ALL') liquidBtcWaveFilter = 'all';
  renderAutoPaperTrades();
});
els.liquidLongSessionFilter?.addEventListener('change', () => {
  liquidLongSessionFilter = String(els.liquidLongSessionFilter.value || 'all').toUpperCase();
  if (liquidLongSessionFilter === 'ALL') liquidLongSessionFilter = 'all';
  renderAutoPaperTrades();
});
els.liquidLongMarketFilter?.addEventListener('change', () => {
  liquidLongMarketFilter = String(els.liquidLongMarketFilter.value || 'all').toUpperCase();
  if (liquidLongMarketFilter === 'ALL') liquidLongMarketFilter = 'all';
  renderAutoPaperTrades();
});
els.liquidRunnerDirectionFilter?.addEventListener('change', () => {
  liquidRunnerDirectionFilter = String(els.liquidRunnerDirectionFilter.value || 'all').toUpperCase();
  if (liquidRunnerDirectionFilter === 'ALL') liquidRunnerDirectionFilter = 'all';
  renderAutoPaperTrades();
});
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

startLiquidMarketDirectionHealth();
initializeLiquidPaperDateRange();
loadLiquidLiveCardWhitelist().catch((error) => {
  if (els.liquidLiveCardStatus) {
    els.liquidLiveCardStatus.className = 'liquid-live-card-status is-blocked';
    els.liquidLiveCardStatus.innerHTML = `<strong>LIQUID CARD WHITELIST · LỖI</strong><span>${escapeHtml(error.message)}</span>`;
  }
});
loadScan();
loadAutoPaperTrades().finally(startLiquidPaperStream);
