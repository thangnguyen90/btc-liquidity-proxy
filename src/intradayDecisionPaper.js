import crypto from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_STORE = {
  version: 1,
  settings: {
    timeframe: '1h',
    decisionEveryMinutes: 15,
    repeatCooldownMinutes: 240,
    lookbackDays: 30,
    minClosed: 8,
    minPredictionScore: 78,
    minSignalScore: 60,
    comboStatsValidFrom: process.env.INTRADAY_DECISION_COMBO_STATS_VALID_FROM ?? '2026-07-20T05:40:00.000Z',
    maxOpenPositions: null,
    maxEntriesPerRun: null,
    maxEntriesPerComboPerRun: Math.max(1, Number(process.env.INTRADAY_DECISION_MAX_ENTRIES_PER_COMBO_PER_RUN ?? 5)),
    maxOpenPerCombo: Math.max(1, Number(process.env.INTRADAY_DECISION_MAX_OPEN_PER_COMBO ?? 10)),
    maxSignalAgeSeconds: Math.max(15, Number(process.env.INTRADAY_DECISION_MAX_SIGNAL_AGE_SECONDS ?? 90)),
    maxAdverseEntryDriftPct: Math.max(0, Number(process.env.INTRADAY_DECISION_MAX_ADVERSE_ENTRY_DRIFT_PCT ?? 0.15)),
    maxBreakoutAgeBars: Math.max(0, Number(process.env.INTRADAY_DECISION_MAX_BREAKOUT_AGE_BARS ?? 2)),
    marginUsdt: 10,
    leverage: 10,
    takeProfitRoe: 15,
    stopLossRoe: 15,
    breakEvenTriggerRoe: 7,
    breakEvenLockRoe: 0,
    trailingEarlyTriggerRoe: null,
    trailingEarlyLockRoe: null,
    trailingStartRoe: 15,
    trailingStartLockRoe: 5,
    trailingStepRoe: 5,
    maxHoldHours1h: 8,
    maxHoldHours4h: 24,
  },
  lastRun: null,
  decisions: [],
  trades: [],
};

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function directionForSide(side) {
  return side === 'LONG' ? 'UP' : side === 'SHORT' ? 'DOWN' : 'FLAT';
}

function candleName(value) {
  const raw = value && typeof value === 'object'
    ? (value.name ?? value.pattern ?? value.label ?? value.direction)
    : value;
  return normalize(raw || 'NO_DATA');
}

function btcCandleOf(candidate = {}) {
  return candidate.btcCandlePatternAtEntry
    ?? candidate.btcCandlePattern5m
    ?? candidate.btcCandlePattern
    ?? candidate.btcCandle
    ?? null;
}

export function btcRegimeGate({ side, trend = {}, btcCandlePattern = null, signalScore = 0 } = {}) {
  const direction = normalize(trend.direction);
  const normalizedSide = normalize(side);
  const regime = direction === 'UP' ? 'SW_UP' : direction === 'DOWN' ? 'SW_DOWN' : 'SW_FLAT';
  const pattern = candleName(btcCandlePattern);
  const bearish = pattern.includes('BEARISH') || pattern === 'SHOOTING_STAR';
  const bullish = pattern.includes('BULLISH') || pattern === 'HAMMER';
  const aligned = directionForSide(normalizedSide) === direction && direction !== 'FLAT';
  const confirmsRegime = direction === 'UP' ? bullish : direction === 'DOWN' ? bearish : false;
  const reversesRegime = direction === 'UP' ? bearish : direction === 'DOWN' ? bullish : false;

  let tier = 'NEUTRAL';
  let label = `${regime}_NEUTRAL`;
  let marginCapUsdt = null;
  let minSignalScore = null;
  let reason = `${regime}; nến BTC ${pattern}`;

  if (direction === 'FLAT' || !['LONG', 'SHORT'].includes(normalizedSide)) {
    reason = `BTC chưa có hướng sideway rõ; nến ${pattern}`;
  } else if (!aligned) {
    marginCapUsdt = 1;
    if (confirmsRegime) {
      tier = 'RISK';
      label = `${regime}_${normalizedSide}_RISK`;
      reason = `${normalizedSide} ngược ${regime}, nến BTC ${pattern} xác nhận hướng BTC; chỉ TEST $1`;
    } else if (reversesRegime) {
      tier = 'WATCH';
      label = `${regime}_${normalizedSide}_REVERSAL_WATCH`;
      minSignalScore = 80;
      reason = `${normalizedSide} ngược ${regime} nhưng nến BTC ${pattern} có dấu hiệu đảo; cần signal >= 80 và chỉ TEST $1`;
    } else {
      tier = 'WATCH';
      label = `${regime}_${normalizedSide}_COUNTER_TEST`;
      reason = `${normalizedSide} ngược ${regime}; chưa có nến BTC đảo chiều rõ, chỉ TEST $1`;
    }
  } else if (confirmsRegime) {
    tier = 'GOOD';
    label = `${regime}_${normalizedSide}_GOOD`;
    reason = `${normalizedSide} thuận ${regime}, nến BTC ${pattern} xác nhận; giữ size rule gốc`;
  } else if (reversesRegime) {
    tier = 'WATCH';
    label = `${regime}_${normalizedSide}_REVERSAL_WATCH`;
    marginCapUsdt = 1;
    reason = `${normalizedSide} thuận ${regime} nhưng nến BTC ${pattern} báo đảo; giảm còn TEST $1`;
  } else {
    label = `${regime}_${normalizedSide}_ALIGNED`;
    reason = `${normalizedSide} thuận ${regime}; nến BTC ${pattern} trung tính, giữ size rule gốc`;
  }

  return {
    version: 'BTC_REGIME_GATE_V1',
    tier,
    label,
    regime,
    trendDirection: direction || 'FLAT',
    trendStrength: normalize(trend.strength) || 'UNKNOWN',
    macro4hDirection: normalize(trend.macro4h?.direction) || 'FLAT',
    macro4hStrength: normalize(trend.macro4h?.strength) || 'UNKNOWN',
    btcCandle: pattern,
    aligned,
    marginCapUsdt,
    minSignalScore,
    signalScore: number(signalScore, 0),
    reason,
  };
}

function validTimeframe(value) {
  return String(value).toLowerCase() === '4h' ? '4h' : '1h';
}

function timestamp(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timeframeMs(value) {
  const match = String(value ?? '').toLowerCase().match(/^(\d+)(m|h)$/);
  if (!match) return 15 * 60_000;
  const amount = Math.max(1, Number(match[1]));
  return amount * (match[2] === 'h' ? 60 * 60_000 : 60_000);
}

function tradeRoe(trade, mark) {
  const entry = number(trade.entryPrice);
  const leverage = Math.max(1, number(trade.leverage, 10));
  if (!entry || !mark) return null;
  const move = trade.side === 'SHORT' ? (entry - mark) / entry : (mark - entry) / entry;
  return move * leverage * 100;
}

function exitPriceForRoe(entry, side, leverage, roe) {
  const move = Math.abs(roe) / 100 / leverage;
  if (roe >= 0) return side === 'SHORT' ? entry * (1 - move) : entry * (1 + move);
  return side === 'SHORT' ? entry * (1 + move) : entry * (1 - move);
}

function fixedStopLoss(entry, side, leverage, stopLossRoe) {
  return exitPriceForRoe(
    entry,
    side,
    leverage,
    -Math.abs(number(stopLossRoe, 15)),
  );
}

export function progressiveLockedStopRoe(peakRoe, settings) {
  const peak = number(peakRoe, 0);
  const breakEvenTrigger = number(settings?.breakEvenTriggerRoe, 7);
  const breakEvenLock = number(settings?.breakEvenLockRoe, 0);
  const start = number(settings?.trailingStartRoe, 15);
  const startLock = number(settings?.trailingStartLockRoe, 5);
  const step = Math.max(1, number(settings?.trailingStepRoe, 5));
  if (peak < breakEvenTrigger) return null;
  if (peak < start) return breakEvenLock;
  return startLock + (Math.floor((peak - start) / step) * step);
}

function updateProgressiveStop(trade, roe, settings) {
  const currentRoe = number(roe);
  if (currentRoe == null) return { hit: false, exit: null };
  const peak = Math.max(number(trade.peakRoe, 0), currentRoe);
  trade.peakRoe = +peak.toFixed(3);
  const nextLock = progressiveLockedStopRoe(peak, settings);
  const previousLock = trade.lockedStopRoe == null
    ? null
    : number(trade.lockedStopRoe);
  if (nextLock != null && (previousLock == null || nextLock > previousLock)) {
    trade.lockedStopRoe = nextLock;
  }
  const lockedRoe = trade.lockedStopRoe == null
    ? null
    : number(trade.lockedStopRoe);
  if (lockedRoe == null) return { hit: false, exit: null };
  const entry = number(trade.entryPrice);
  const leverage = Math.max(1, number(trade.leverage, settings?.leverage ?? 10));
  const exit = exitPriceForRoe(entry, trade.side, leverage, lockedRoe);
  trade.sl = exit;
  return { hit: currentRoe <= lockedRoe, exit, lockedRoe };
}

function candidateSide(signal) {
  const side = normalize(signal.side ?? signal.action ?? signal.direction);
  if (side === 'BUY' || side === 'LONG') return 'LONG';
  if (side === 'SELL' || side === 'SHORT') return 'SHORT';
  return 'UNKNOWN';
}

function candidateType(signal) {
  return String(signal.signalType ?? signal.type ?? signal.stage ?? signal.setupType ?? signal.source ?? 'UNKNOWN');
}

function canonicalSignalStage(value) {
  const text = normalize(value);
  const orderedStages = [
    ['PRE_BREAKDOWN', 'PRE_BREAKDOWN'],
    ['PRE_BREAKOUT', 'PRE_BREAKOUT'],
    ['SQUEEZE_SHORT', 'SQUEEZE_SHORT'],
    ['BR_LIKE_SHORT', 'BR_LIKE_SHORT'],
    ['BR_LIKE', 'BR_LIKE'],
    ['PUMP_BREAKOUT', 'PUMP_BREAKOUT'],
    ['BREAKDOWN', 'BREAKDOWN'],
    ['BREAKOUT', 'BREAKOUT'],
    ['SQUEEZE', 'SQUEEZE'],
    ['RUNNER', 'RUNNER'],
    ['EMA_PULLBACK', 'EMA_PULLBACK'],
    ['MA60_VOLUME_CLUSTER', 'MA60_VOLUME_CLUSTER'],
    ['SC_SPRING', 'SC_SPRING'],
    ['EARLY_DUMP', 'EARLY_DUMP'],
    ['DUMP', 'DUMP'],
  ];
  return orderedStages.find(([token]) => text.includes(token))?.[1] ?? text;
}

export function decisionSignalFingerprint(candidate = {}) {
  const observedAt = timestamp(candidate.observedAt ?? candidate.scannedAt) ?? Date.now();
  const interval = String(candidate.timeframe ?? candidate.interval ?? '15m').toLowerCase();
  const intervalMs = timeframeMs(interval);
  const stage = canonicalSignalStage(candidate.decisionStage ?? candidate.signalType ?? candidate.stage);
  const rawAge = number(candidate.breakoutAge);
  const eventAt = /BREAKOUT|BREAKDOWN/.test(stage) && rawAge != null
    ? observedAt - (Math.max(0, rawAge) * intervalMs)
    : observedAt;
  const eventBucket = Math.floor(eventAt / intervalMs);
  return [
    normalize(candidate.source),
    normalize(candidate.symbol),
    candidateSide(candidate),
    stage,
    normalize(interval),
    eventBucket,
  ].join('|');
}

export function decisionEntryTiming(candidate = {}, marketPrice, settings = {}, now = Date.now()) {
  const signalEntry = number(candidate.entry ?? candidate.entryPrice ?? candidate.markPrice);
  const observedAt = timestamp(candidate.observedAt ?? candidate.scannedAt);
  const signalAgeMs = observedAt == null ? null : Math.max(0, now - observedAt);
  const entryVsSignalPct = signalEntry && marketPrice
    ? ((marketPrice - signalEntry) / signalEntry) * 100
    : null;
  const side = candidateSide(candidate);
  const adverseChasePct = entryVsSignalPct == null
    ? null
    : side === 'SHORT' ? -entryVsSignalPct : entryVsSignalPct;
  const breakoutAge = number(candidate.breakoutAge);
  const stage = canonicalSignalStage(candidate.decisionStage ?? candidate.signalType ?? candidate.stage);
  const maxSignalAgeMs = Math.max(15, number(settings.maxSignalAgeSeconds, 90)) * 1000;
  const maxChase = Math.max(0, number(settings.maxAdverseEntryDriftPct, 0.15));
  const maxBreakoutAge = Math.max(0, number(settings.maxBreakoutAgeBars, 2));
  let blockReason = null;
  if (!signalEntry) blockReason = 'Thiếu entry gốc nên không thể kiểm tra chase';
  else if (signalAgeMs == null) blockReason = 'Thiếu thời gian phát tín hiệu';
  else if (signalAgeMs > maxSignalAgeMs) blockReason = `Tín hiệu đã cũ ${(signalAgeMs / 1000).toFixed(0)}s > ${maxSignalAgeMs / 1000}s`;
  else if (/BREAKOUT|BREAKDOWN/.test(stage) && breakoutAge != null && breakoutAge > maxBreakoutAge) {
    blockReason = `${stage} đã qua ${breakoutAge} nến > ${maxBreakoutAge} nến`;
  } else if (adverseChasePct != null && adverseChasePct > maxChase) {
    blockReason = `Market đã chase ${adverseChasePct.toFixed(3)}% > ${maxChase}% so với entry gốc`;
  }
  return {
    signalEntry,
    observedAt,
    signalAgeMs,
    entryVsSignalPct,
    adverseChasePct,
    breakoutAge,
    blockReason,
  };
}

function comboContextKey(value) {
  const parts = String(value ?? '').split('|').map((part) => normalize(part)).filter(Boolean);
  if (parts.length < 3) return '';
  // Gate is deliberately excluded here: the live EMA evaluation gate is checked
  // separately, while historical gate labels changed over time. Stage, side, TF,
  // BTC correlation, BTC phase and relation must still match exactly.
  return parts.slice(0, Math.min(6, parts.length)).join('|');
}

function bestCatalogMatch(candidate, catalog = []) {
  const combo = String(candidate.combo ?? '').trim();
  const side = candidate.side;
  const timeframe = normalize(candidate.timeframe);
  const type = canonicalSignalStage(candidate.decisionStage ?? candidate.signalType);
  const comboKey = comboContextKey(combo);
  if (!comboKey) return null;
  const modelSource = candidate.modelSource ?? candidate.source;
  let best = null;
  let bestScore = -1;
  for (const row of catalog) {
    if (String(row.side) !== side) continue;
    if (modelSource && row.source && normalize(row.source) !== normalize(modelSource)) continue;
    const rowType = canonicalSignalStage(row.signalType ?? String(row.combo).split('|')[0]);
    if (!type || rowType !== type) continue;
    const rowTf = normalize(row.timeframe);
    if (!timeframe || rowTf !== timeframe) continue;
    const rowCombo = String(row.combo ?? '').trim();
    const rowComboKey = comboContextKey(rowCombo);
    if (comboKey && rowComboKey !== comboKey) continue;
    let score = 0;
    if (combo && rowCombo === combo) score += 100;
    else if (comboKey && rowComboKey === comboKey) score += 70;
    score += 35;
    score += 20;
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return bestScore >= 55 ? { row: best, matchScore: bestScore } : null;
}

export class IntradayDecisionPaper {
  constructor({ file, evaluationFile, getCandidates, getCatalog, getTrend, getMark, getMarkInfo, getSignalVersion, setSymbols, onStateChange, enrichTradeForLog, logger = console }) {
    this.file = file;
    this.evaluationFile = evaluationFile;
    this.getCandidates = getCandidates;
    this.getCatalog = getCatalog;
    this.getTrend = getTrend;
    this.getMark = getMark;
    this.getMarkInfo = getMarkInfo;
    this.getSignalVersion = getSignalVersion;
    this.setSymbols = setSymbols;
    this.onStateChange = onStateChange;
    this.enrichTradeForLog = enrichTradeForLog;
    this.logger = logger;
    this.store = structuredClone(DEFAULT_STORE);
    this.running = false;
    this.writeChain = Promise.resolve();
    this.timer = null;
    this.tickFlushTimer = null;
    this.lastTickBroadcastAt = 0;
    this.signalVersion = null;
    this.signalVersionTimer = null;
    this.queuedRun = null;
    this.queuedRunTimer = null;
  }

  async init() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.store = {
        ...structuredClone(DEFAULT_STORE),
        ...parsed,
        settings: {
          ...DEFAULT_STORE.settings,
          ...(parsed.settings ?? {}),
          maxOpenPositions: null,
          maxEntriesPerRun: null,
          trailingEarlyTriggerRoe: null,
          trailingEarlyLockRoe: null,
        },
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        trades: Array.isArray(parsed.trades) ? parsed.trades : [],
      };
      // The old default was not user-configurable, so migrate it to -15% ROE.
      if (Number(parsed.settings?.stopLossRoe) === 10) this.store.settings.stopLossRoe = 15;
    } catch {}
    for (const trade of this.store.trades) {
      if (trade.status !== 'OPEN') continue;
      const entry = number(trade.entryPrice);
      const leverage = Math.max(1, number(trade.leverage, this.store.settings.leverage));
      if (!entry) continue;
      trade.originalSl ??= number(trade.sl);
      trade.originalTp ??= number(trade.tp);
      trade.tp = null;
      trade.takeProfitMode = 'PROGRESSIVE_ROE_TRAIL';
      trade.peakRoe = Math.max(0, number(trade.peakRoe, trade.liveRoe ?? 0));
      const lockedStopRoe = progressiveLockedStopRoe(trade.peakRoe, this.store.settings);
      if (lockedStopRoe != null) {
        trade.lockedStopRoe = Math.max(number(trade.lockedStopRoe, lockedStopRoe), lockedStopRoe);
        trade.sl = exitPriceForRoe(entry, trade.side, leverage, trade.lockedStopRoe);
      } else {
        trade.lockedStopRoe = null;
        trade.sl = fixedStopLoss(entry, trade.side, leverage, this.store.settings.stopLossRoe);
      }
      trade.stopLossRoe = this.store.settings.stopLossRoe;
    }
    this.refreshSymbols();
    await this.persist();
    this.timer = setInterval(() => this.tick().catch((error) => this.logger.warn('[DecisionPaper]', error.message)), 60_000);
    this.timer.unref?.();
    this.signalVersion = String(this.getSignalVersion?.() ?? '');
    this.signalVersionTimer = setInterval(() => this.checkSignalVersion(), 2_000);
    this.signalVersionTimer.unref?.();
    return this.getState();
  }

  checkSignalVersion() {
    const next = String(this.getSignalVersion?.() ?? '');
    if (!next || next === this.signalVersion) return;
    this.signalVersion = next;
    this.queueRun({ trigger: 'signal-live' });
  }

  queueRun({ trigger = 'signal-live', timeframe = null } = {}) {
    this.queuedRun = { trigger, timeframe };
    if (this.queuedRunTimer) return;
    this.queuedRunTimer = setTimeout(async () => {
      this.queuedRunTimer = null;
      if (this.running) {
        this.queueRun(this.queuedRun ?? { trigger, timeframe });
        return;
      }
      const queued = this.queuedRun ?? { trigger, timeframe };
      this.queuedRun = null;
      try {
        await this.runNow(queued);
      } catch (error) {
        this.logger.warn('[DecisionPaper:SignalLive]', error.message);
      }
      if (this.queuedRun) this.queueRun(this.queuedRun);
    }, 350);
    this.queuedRunTimer.unref?.();
  }

  refreshSymbols() {
    this.setSymbols?.(this.store.trades.filter((trade) => trade.status === 'OPEN').map((trade) => trade.symbol));
  }

  freshMarketEntry(symbol, maxAgeMs = 5_000) {
    const info = this.getMarkInfo?.(symbol);
    const price = number(info?.markPrice);
    const at = number(info?.at);
    const ageMs = at == null ? null : Math.max(0, Date.now() - at);
    if (!price || at == null || ageMs > maxAgeMs) return null;
    return { price, at, ageMs };
  }

  async warmMarketEntries(symbols, timeoutMs = 2_500) {
    const unique = [...new Set(symbols.map((symbol) => String(symbol ?? '').toUpperCase()).filter(Boolean))];
    if (!unique.length) return;
    const openSymbols = this.store.trades
      .filter((trade) => trade.status === 'OPEN')
      .map((trade) => trade.symbol);
    this.setSymbols?.([...new Set([...openSymbols, ...unique])]);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (unique.every((symbol) => this.freshMarketEntry(symbol))) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async persist() {
    this.writeChain = this.writeChain.then(async () => {
      if (typeof this.enrichTradeForLog === 'function') {
        this.store.trades = this.store.trades.map((trade) => this.enrichTradeForLog(trade));
      }
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(this.store, null, 2)}\n`, 'utf8');
      await rename(temporary, this.file);
      if (this.evaluationFile) {
        const evaluationRows = this.store.trades.map((trade) => ({
          ...trade,
          createdAt: trade.openedAt,
          originalSource: trade.source,
          score: trade.signalScore,
          timeframe: trade.decisionTimeframe,
        }));
        await mkdir(dirname(this.evaluationFile), { recursive: true });
        const evaluationTemporary = `${this.evaluationFile}.${process.pid}.tmp`;
        await writeFile(evaluationTemporary, `${JSON.stringify(evaluationRows, null, 2)}\n`, 'utf8');
        await rename(evaluationTemporary, this.evaluationFile);
      }
    });
    return this.writeChain;
  }

  emitState(reason = 'update') {
    try { this.onStateChange?.(this.getState(), reason); } catch {}
  }

  scheduleTickFlush() {
    if (this.tickFlushTimer) return;
    this.tickFlushTimer = setTimeout(() => {
      this.tickFlushTimer = null;
      this.persist().catch((error) => this.logger.warn('[DecisionPaper:TickPersist]', error.message));
    }, 5_000);
    this.tickFlushTimer.unref?.();
  }

  handlePriceTick({ symbol, markPrice, eventTime = Date.now() } = {}) {
    const normalizedSymbol = String(symbol ?? '').toUpperCase();
    const mark = number(markPrice);
    if (!normalizedSymbol || !mark) return;
    let changed = false;
    let closed = false;
    for (const trade of this.store.trades) {
      if (trade.status !== 'OPEN' || String(trade.symbol ?? '').toUpperCase() !== normalizedSymbol) continue;
      const roe = tradeRoe(trade, mark);
      trade.markPrice = mark;
      trade.liveRoe = roe == null ? null : +roe.toFixed(3);
      trade.livePnl = roe == null ? null : +(number(trade.marginUsdt, 10) * roe / 100).toFixed(4);
      trade.updatedAt = new Date(eventTime).toISOString();
      let outcome = null;
      let exit = mark;
      const trailing = updateProgressiveStop(trade, roe, this.store.settings);
      if (trailing.hit) { outcome = 'TRAILING_SL'; exit = trailing.exit; }
      else if (trade.lockedStopRoe == null && (trade.side === 'LONG' ? mark <= trade.sl : mark >= trade.sl)) {
        outcome = 'SL';
        exit = trade.sl;
      }
      if (outcome) {
        const closedRoe = tradeRoe(trade, exit) ?? roe ?? 0;
        trade.status = 'CLOSED';
        trade.outcome = outcome;
        trade.exitPrice = exit;
        trade.closedAt = new Date(eventTime).toISOString();
        trade.roe = +closedRoe.toFixed(3);
        trade.pnl = +(number(trade.marginUsdt, 10) * closedRoe / 100).toFixed(4);
        closed = true;
      }
      changed = true;
    }
    if (!changed) return;
    if (closed) {
      this.refreshSymbols();
      this.persist().catch((error) => this.logger.warn('[DecisionPaper:SocketClose]', error.message));
    } else {
      this.scheduleTickFlush();
    }
    const now = Date.now();
    if (closed || now - this.lastTickBroadcastAt >= 750) {
      this.lastTickBroadcastAt = now;
      this.emitState(closed ? 'socket-close' : 'socket-tick');
    }
  }

  async updateSettings(input = {}) {
    const current = this.store.settings;
    const timeframe = validTimeframe(input.timeframe ?? current.timeframe);
    this.store.settings = {
      ...current,
      timeframe,
      lookbackDays: Math.max(7, Math.min(365, number(input.lookbackDays, current.lookbackDays))),
      minClosed: Math.max(3, Math.min(100, number(input.minClosed, current.minClosed))),
      maxOpenPositions: null,
      maxEntriesPerRun: null,
      maxEntriesPerComboPerRun: Math.max(1, Math.min(20, number(input.maxEntriesPerComboPerRun, current.maxEntriesPerComboPerRun ?? 5))),
      maxOpenPerCombo: Math.max(1, Math.min(50, number(input.maxOpenPerCombo, current.maxOpenPerCombo ?? 10))),
      decisionEveryMinutes: Math.max(5, Math.min(240, number(input.decisionEveryMinutes, current.decisionEveryMinutes))),
      repeatCooldownMinutes: Math.max(15, Math.min(1440, number(input.repeatCooldownMinutes, current.repeatCooldownMinutes))),
      maxSignalAgeSeconds: Math.max(15, Math.min(600, number(input.maxSignalAgeSeconds, current.maxSignalAgeSeconds ?? 90))),
      maxAdverseEntryDriftPct: Math.max(0, Math.min(5, number(input.maxAdverseEntryDriftPct, current.maxAdverseEntryDriftPct ?? 0.15))),
      maxBreakoutAgeBars: Math.max(0, Math.min(20, number(input.maxBreakoutAgeBars, current.maxBreakoutAgeBars ?? 2))),
    };
    await this.persist();
    this.emitState('settings');
    return this.getState();
  }

  async tick() {
    await this.updateOpenTrades();
    const intervalMs = number(this.store.settings.decisionEveryMinutes, 15) * 60 * 1000;
    const lastAt = Date.parse(this.store.lastRun?.ranAt ?? '') || 0;
    if (!lastAt || Date.now() - lastAt >= intervalMs) await this.runNow({ trigger: 'scheduler' });
  }

  async updateOpenTrades({ trend = null } = {}) {
    let changed = false;
    const now = Date.now();
    for (const trade of this.store.trades) {
      if (trade.status !== 'OPEN') continue;
      const markInfo = this.getMarkInfo?.(trade.symbol);
      const mark = number(markInfo?.markPrice ?? this.getMark?.(trade.symbol));
      if (!mark) continue;
      const priceAt = number(markInfo?.at);
      if (priceAt && now - priceAt > 5_000) continue;
      const roe = tradeRoe(trade, mark);
      trade.markPrice = mark;
      trade.liveRoe = roe == null ? null : +roe.toFixed(3);
      trade.livePnl = roe == null ? null : +(number(trade.marginUsdt, 10) * roe / 100).toFixed(4);
      trade.updatedAt = new Date(priceAt ?? now).toISOString();
      let outcome = null;
      let exit = mark;
      const trailing = updateProgressiveStop(trade, roe, this.store.settings);
      if (trailing.hit) { outcome = 'TRAILING_SL'; exit = trailing.exit; }
      else if (trade.lockedStopRoe == null && (trade.side === 'LONG' ? mark <= trade.sl : mark >= trade.sl)) {
        outcome = 'SL';
        exit = trade.sl;
      }
      const maxHoldHours = trade.decisionTimeframe === '4h'
        ? number(this.store.settings.maxHoldHours4h, 24)
        : number(this.store.settings.maxHoldHours1h, 8);
      if (!outcome && now - Date.parse(trade.openedAt) >= maxHoldHours * 60 * 60 * 1000) outcome = 'TIMEOUT';
      if (!outcome && trend?.strength === 'STRONG' && directionForSide(trade.side) !== trend.direction) outcome = 'TREND_REVERSAL';
      if (!outcome) { changed = true; continue; }
      const closedRoe = tradeRoe(trade, exit) ?? roe ?? 0;
      trade.status = 'CLOSED';
      trade.outcome = outcome;
      trade.exitPrice = exit;
      trade.closedAt = new Date().toISOString();
      trade.roe = +closedRoe.toFixed(3);
      trade.pnl = +(number(trade.marginUsdt, 10) * closedRoe / 100).toFixed(4);
      changed = true;
    }
    if (changed) {
      this.refreshSymbols();
      await this.persist();
      this.emitState('trade-update');
    }
  }

  async runNow({ trigger = 'manual', timeframe = null } = {}) {
    if (this.running) return this.getState();
    this.running = true;
    try {
      const tf = validTimeframe(timeframe ?? this.store.settings.timeframe);
      const trend = await this.getTrend(tf);
      await this.updateOpenTrades({ trend });
      const catalogPayload = await this.getCatalog({
        days: this.store.settings.lookbackDays,
        minClosed: this.store.settings.minClosed,
        limit: 100,
        trend,
      });
      const catalog = catalogPayload.recommendations ?? [];
      const rawCandidates = await this.getCandidates(tf);
      const alreadyProcessed = new Set(this.store.decisions
        .filter((decision) => decision.signalFingerprint
          && !String(decision.reason ?? '').startsWith('Chưa có Binance Last Price'))
        .map((decision) => decision.signalFingerprint));
      const seen = new Set();
      const candidates = rawCandidates.filter((candidate) => {
        const key = decisionSignalFingerprint(candidate);
        if (alreadyProcessed.has(key)) return false;
        if (!candidate.symbol || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((candidate) => ({
        ...candidate,
        side: candidateSide(candidate),
        signalType: candidateType(candidate),
      }));
      await this.warmMarketEntries(candidates.map((candidate) => candidate.symbol));

      const evaluated = candidates.map((candidate) => {
        const match = bestCatalogMatch(candidate, catalog);
        const stats = match?.row ?? null;
        const decisionRule = candidate.decisionRule ?? null;
        const independent = /DOC_LAP|BTC_CORR_RAC/.test(String(stats?.combo ?? candidate.combo ?? ''));
        const aligned = directionForSide(candidate.side) === trend.direction;
        const counterStrong = trend.strength === 'STRONG' && !aligned && !independent && trend.direction !== 'FLAT';
        const macro = trend.macro4h;
        const macroCounterStrong = macro?.strength === 'STRONG'
          && directionForSide(candidate.side) !== macro.direction
          && macro.direction !== 'FLAT'
          && !independent;
        const signalScore = number(candidate.score, 0);
        const regimeGate = btcRegimeGate({
          side: candidate.side,
          trend,
          btcCandlePattern: btcCandleOf(candidate),
          signalScore,
        });
        let decision = 'REJECT';
        let reason = 'Không có combo lịch sử đủ tin cậy';
        if (decisionRule && decisionRule.allow === false) {
          reason = `${decisionRule.label ?? 'SIGNAL_RULE_BLOCK'}: ${decisionRule.reason ?? 'không đạt rule tín hiệu hiện tại'}`;
        } else if (stats) {
          if (macroCounterStrong) reason = `Ngược trend 4h ${macro.direction} mạnh`;
          else if (counterStrong) reason = `Ngược trend ${tf} ${trend.direction} mạnh`;
          else if (stats.grade === 'A' && stats.predictionScore >= this.store.settings.minPredictionScore && signalScore >= this.store.settings.minSignalScore) {
            decision = 'ENTER';
            reason = `Combo exact A ${stats.predictionScore}/100 · signal ${signalScore} · ${aligned ? 'thuận trend' : independent ? 'độc lập BTC' : 'trend yếu/flat'}${decisionRule ? ` · rule ${decisionRule.tier ?? '-'} $${decisionRule.marginUsdt ?? this.store.settings.marginUsdt}` : ''}`;
          } else if (stats.grade === 'A' || stats.grade === 'B') {
            decision = 'WATCH';
            reason = `Combo ${stats.grade} nhưng chưa đủ entry gate · prediction ${stats.predictionScore} · signal ${signalScore}`;
          } else reason = `Combo ${stats.grade} không đạt paper gate`;
        }
        const signalEntry = number(candidate.entry ?? candidate.entryPrice ?? candidate.markPrice);
        const marketEntry = this.freshMarketEntry(candidate.symbol);
        const entry = marketEntry?.price ?? null;
        const timing = decisionEntryTiming(candidate, entry, this.store.settings);
        if (decision === 'ENTER' && !entry) {
          decision = 'WATCH';
          reason = 'Chưa có Binance Last Price mới trong 5 giây';
        } else if (decision === 'ENTER' && timing.blockReason) {
          decision = 'WATCH';
          reason = `LIVE ENTRY BLOCK: ${timing.blockReason}`;
        } else if (decision === 'ENTER' && regimeGate.minSignalScore != null && signalScore < regimeGate.minSignalScore) {
          decision = 'WATCH';
          reason = `BTC REGIME GATE: ${regimeGate.reason}; signal ${signalScore} < ${regimeGate.minSignalScore}`;
        }
        reason = `${reason} · BTC ${regimeGate.label}`;
        const decisionScore = (number(stats?.predictionScore, 0) * 0.75) + (signalScore * 0.25);
        return { candidate, stats, decisionRule, regimeGate, matchScore: match?.matchScore ?? null, decision, reason, entry, signalEntry, marketEntry, timing, decisionScore, aligned, independent };
      }).sort((a, b) => b.decisionScore - a.decisionScore);

      const active = this.store.trades.filter((trade) => trade.status === 'OPEN');
      const activeSymbols = new Set(active.map((trade) => trade.symbol));
      const comboKeyOf = (value) => comboContextKey(value) || normalize(value);
      const openByCombo = new Map();
      for (const trade of active) {
        const comboKey = comboKeyOf(trade.combo);
        openByCombo.set(comboKey, (openByCombo.get(comboKey) ?? 0) + 1);
      }
      const enteredByCombo = new Map();
      const repeatCutoff = Date.now() - number(this.store.settings.repeatCooldownMinutes, 240) * 60 * 1000;
      const recentEntryKeys = new Set(this.store.decisions
        .filter((decision) => decision.decision === 'ENTER' && Date.parse(decision.runAt) >= repeatCutoff)
        .map((decision) => `${decision.source}|${decision.symbol}|${decision.side}|${normalize(decision.signalType)}`));
      const nowIso = new Date().toISOString();
      const decisions = [];
      for (const row of evaluated) {
        const comboKey = comboKeyOf(row.stats?.combo ?? row.candidate.combo);
        const repeatKey = `${row.candidate.source}|${row.candidate.symbol}|${row.candidate.side}|${normalize(row.candidate.signalType)}`;
        if (row.decision === 'ENTER' && recentEntryKeys.has(repeatKey)) {
          row.decision = 'WATCH';
          row.reason = `Đã ENTER cùng tín hiệu trong ${this.store.settings.repeatCooldownMinutes} phút gần nhất`;
        } else if (row.decision === 'ENTER' && activeSymbols.has(row.candidate.symbol)) {
          row.decision = 'WATCH';
          row.reason = 'Đã có paper cùng symbol; không mở thêm cùng hoặc ngược chiều';
        } else if (row.decision === 'ENTER'
            && (openByCombo.get(comboKey) ?? 0) >= this.store.settings.maxOpenPerCombo) {
          row.decision = 'WATCH';
          row.reason = `Combo đã có ${openByCombo.get(comboKey)} lệnh mở; tối đa ${this.store.settings.maxOpenPerCombo}`;
        } else if (row.decision === 'ENTER'
            && (enteredByCombo.get(comboKey) ?? 0) >= this.store.settings.maxEntriesPerComboPerRun) {
          row.decision = 'WATCH';
          row.reason = `Combo đã đủ ${this.store.settings.maxEntriesPerComboPerRun} entry trong chu kỳ`;
        }
        const decision = {
          id: crypto.randomUUID(), runAt: nowIso, timeframe: tf, trigger,
          symbol: row.candidate.symbol, side: row.candidate.side, source: row.candidate.source,
          signalType: row.candidate.signalType, signalScore: number(row.candidate.score),
          combo: row.stats?.combo ?? row.candidate.combo ?? null,
          predictionScore: number(row.stats?.predictionScore), comboGrade: row.stats?.grade ?? null,
          adjustedWr: number(row.stats?.adjustedWr), avgRoe: number(row.stats?.avgRoe),
          medianRoe: number(row.stats?.medianRoe), profitFactor: number(row.stats?.profitFactor),
          tailLossRatio: number(row.stats?.tailLossRatio), decision: row.decision, reason: row.reason,
          matchScore: number(row.matchScore),
          decisionStage: row.candidate.decisionStage ?? canonicalSignalStage(row.candidate.signalType),
          decisionRule: row.decisionRule ? { ...row.decisionRule } : null,
          btcRegimeGate: { ...row.regimeGate },
          btcRegimeGateLabel: row.regimeGate.label,
          btcRegimeAtEntry: row.regimeGate.regime,
          btcCandleAtDecision: row.regimeGate.btcCandle,
          candidateCombo: row.candidate.combo ?? null,
          trend: { ...trend }, entry: row.entry, signalEntry: row.signalEntry,
          marketEntryAt: row.marketEntry?.at ? new Date(row.marketEntry.at).toISOString() : null,
          marketEntryAgeMs: row.marketEntry?.ageMs ?? null,
          marketEntrySource: row.entry ? 'BINANCE_LAST_SOCKET' : null,
          signalFingerprint: decisionSignalFingerprint(row.candidate),
          signalObservedAt: row.timing?.observedAt ? new Date(row.timing.observedAt).toISOString() : null,
          signalAgeMs: row.timing?.signalAgeMs ?? null,
          breakoutAge: row.timing?.breakoutAge ?? null,
          entryVsSignalPct: row.timing?.entryVsSignalPct == null ? null : +row.timing.entryVsSignalPct.toFixed(4),
          adverseChasePct: row.timing?.adverseChasePct == null ? null : +row.timing.adverseChasePct.toFixed(4),
        };
        decisions.push(decision);
        if (row.decision !== 'ENTER') continue;
        activeSymbols.add(row.candidate.symbol);
        openByCombo.set(comboKey, (openByCombo.get(comboKey) ?? 0) + 1);
        enteredByCombo.set(comboKey, (enteredByCombo.get(comboKey) ?? 0) + 1);
        recentEntryKeys.add(repeatKey);
        const leverage = number(this.store.settings.leverage, 10);
        const originalTp = number(row.candidate.tp ?? row.candidate.takeProfit)
          ?? exitPriceForRoe(row.entry, row.candidate.side, leverage, this.store.settings.takeProfitRoe);
        const originalSl = number(row.candidate.sl ?? row.candidate.stopLoss);
        const sl = fixedStopLoss(
          row.entry,
          row.candidate.side,
          leverage,
          this.store.settings.stopLossRoe,
        );
        const baseMarginUsdt = number(row.decisionRule?.marginUsdt, this.store.settings.marginUsdt);
        const marginUsdt = row.regimeGate.marginCapUsdt == null
          ? baseMarginUsdt
          : Math.min(baseMarginUsdt, row.regimeGate.marginCapUsdt);
        this.store.trades.unshift({
          id: crypto.randomUUID(), decisionId: decision.id, status: 'OPEN', outcome: null,
          symbol: row.candidate.symbol, side: row.candidate.side, source: row.candidate.source,
          signalType: row.candidate.signalType, combo: decision.combo, comboGrade: decision.comboGrade,
          predictionScore: decision.predictionScore, signalScore: decision.signalScore,
          decisionTimeframe: tf, trendAtEntry: { ...trend }, analysis: { ...decision },
          btcRegimeGate: { ...row.regimeGate },
          btcRegimeGateLabel: row.regimeGate.label,
          btcRegimeAtEntry: row.regimeGate.regime,
          btcCandleAtDecision: row.regimeGate.btcCandle,
          marginUsdt, leverage, entryPrice: row.entry,
          signalEntry: row.signalEntry,
          signalFingerprint: decision.signalFingerprint,
          signalObservedAt: decision.signalObservedAt,
          signalAgeMs: decision.signalAgeMs,
          breakoutAge: decision.breakoutAge,
          entryVsSignalPct: decision.entryVsSignalPct,
          adverseChasePct: decision.adverseChasePct,
          marketEntryAt: decision.marketEntryAt,
          marketEntryAgeMs: decision.marketEntryAgeMs,
          marketEntrySource: decision.marketEntrySource,
          markPrice: row.entry, tp: null, originalTp, sl, originalSl,
          stopLossRoe: this.store.settings.stopLossRoe,
          takeProfitMode: 'PROGRESSIVE_ROE_TRAIL', peakRoe: 0, lockedStopRoe: null,
          openedAt: nowIso, updatedAt: nowIso,
        });
      }
      this.store.decisions = [...decisions, ...this.store.decisions].slice(0, 2000);
      this.store.lastRun = {
        ranAt: nowIso, trigger, timeframe: tf, trend, scanned: rawCandidates.length, received: candidates.length,
        entered: decisions.filter((row) => row.decision === 'ENTER').length,
        watched: decisions.filter((row) => row.decision === 'WATCH').length,
        rejected: decisions.filter((row) => row.decision === 'REJECT').length,
        catalogSize: catalog.length,
      };
      this.refreshSymbols();
      await this.persist();
      this.emitState('decision-run');
      return this.getState();
    } finally {
      this.running = false;
    }
  }

  getState({ decisionLimit = 500 } = {}) {
    const trades = this.store.trades.map((trade) => ({ ...trade }));
    const closed = trades.filter((trade) => trade.status === 'CLOSED');
    const wins = closed.filter((trade) => number(trade.pnl, 0) > 0).length;
    return {
      settings: { ...this.store.settings }, lastRun: this.store.lastRun,
      summary: {
        total: trades.length, open: trades.filter((trade) => trade.status === 'OPEN').length,
        closed: closed.length, wins, losses: closed.filter((trade) => number(trade.pnl, 0) < 0).length,
        wr: closed.length ? +(wins / closed.length * 100).toFixed(2) : null,
        pnl: +closed.reduce((sum, trade) => sum + number(trade.pnl, 0), 0).toFixed(4),
      },
      trades,
      decisions: this.store.decisions.slice(0, Math.max(1, Math.min(2000, number(decisionLimit, 500)))),
      decisionRetention: 2000,
      running: this.running,
    };
  }
}
