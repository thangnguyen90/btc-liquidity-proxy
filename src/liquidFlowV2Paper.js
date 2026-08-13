import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const LIQUID_FLOW_V2_PAPER_VERSION = 'LIQUID_FLOW_V2_PAPER_V18_HTF_BINANCE_5USDT_20260813';

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 8) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function normalizeSettings(settings = {}) {
  return {
    autoEnabled: settings.autoEnabled !== false,
    marginUsdt: clamp(finite(settings.marginUsdt, 10), 1, 100),
    leverage: clamp(Math.round(finite(settings.leverage, 5)), 1, 50),
    baseSweepLeverage: clamp(Math.round(finite(settings.baseSweepLeverage, 5)), 1, 20),
    baseSweepMaxRiskRoe: clamp(finite(settings.baseSweepMaxRiskRoe, 25), 5, 50),
    hardStopRoe: clamp(finite(settings.hardStopRoe, 20), 5, 50),
    minTakeProfitRoe: clamp(finite(settings.minTakeProfitRoe, 10), 2, 30),
    baseBinanceEnabled: settings.baseBinanceEnabled === true,
    baseBinanceMarginUsdt: clamp(finite(settings.baseBinanceMarginUsdt, 2), 1, 20),
    baseLongBinanceMarginUsdt: clamp(finite(settings.baseLongBinanceMarginUsdt, 2), 1, 20),
    baseBinanceLeverage: clamp(Math.round(finite(settings.baseBinanceLeverage, 5)), 1, 20),
    preBinanceMarginUsdt: clamp(finite(settings.preBinanceMarginUsdt, 5), 1, 20),
    preBinanceLeverage: clamp(Math.round(finite(settings.preBinanceLeverage, 5)), 1, 20),
    htfBinanceEnabled: settings.htfBinanceEnabled !== false,
    htfBinanceMarginUsdt: clamp(finite(settings.htfBinanceMarginUsdt, 5), 1, 20),
    htfBinanceLeverage: clamp(Math.round(finite(settings.htfBinanceLeverage, 5)), 1, 20),
    baseSweepRetestBufferPct: clamp(finite(settings.baseSweepRetestBufferPct, 0.6), 0.1, 2),
    baseSweepEntryTimeoutMs: clamp(finite(settings.baseSweepEntryTimeoutMs, 30 * 60_000), 5 * 60_000, 2 * 60 * 60_000),
    cooldownMs: clamp(finite(settings.cooldownMs, 30 * 60_000), 5 * 60_000, 24 * 60 * 60_000),
    maxHoldMs: clamp(finite(settings.maxHoldMs, 4 * 60 * 60_000), 30 * 60_000, 48 * 60 * 60_000),
    roundTripFeeRate: clamp(finite(settings.roundTripFeeRate, 0.0008), 0, 0.01),
  };
}

function paperSideOfClassification(classification = {}) {
  if (classification.labelKey === 'UP_SWEEP_SHORT_READY') return 'SHORT';
  if (classification.labelKey === 'DOWN_SWEEP_LONG_READY') return 'LONG';
  if (classification.labelKey === 'UP_BASE_SWEEP_LONG_READY') return 'LONG';
  if (classification.labelKey === 'DOWN_BASE_SWEEP_SHORT_READY') return 'SHORT';
  if (classification.labelKey === 'PRE_UP_BASE_LONG') return 'LONG';
  if (classification.labelKey === 'PRE_DOWN_BASE_SHORT') return 'SHORT';
  if (classification.labelKey === 'HTF_BEAR_15M_EMA99_PUMP_REJECT') return 'SHORT';
  if (classification.labelKey === 'HTF_BULL_15M_EMA99_DUMP_RECLAIM') return 'LONG';
  if (classification.labelKey === 'PUMP_DISTRIBUTION_SHORT_READY') return 'SHORT';
  if (classification.labelKey === 'EXTENDED_EMA99_PANIC_RECLAIM_LONG') return 'LONG';
  if (classification.labelKey === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY') return 'LONG';
  return null;
}

function isBaseSweepClassification(classification = {}) {
  return classification.labelKey === 'UP_BASE_SWEEP_LONG_READY'
    || classification.labelKey === 'DOWN_BASE_SWEEP_SHORT_READY';
}

function isPreEma99Classification(classification = {}) {
  return classification.labelKey === 'PRE_UP_BASE_LONG'
    || classification.labelKey === 'PRE_DOWN_BASE_SHORT';
}

export function liquidFlowV2AutoBinanceProfile(classification = {}, settingsInput = {}) {
  const settings = normalizeSettings(settingsInput);
  if (isBaseSweepClassification(classification)) {
    const isLong = classification.labelKey === 'UP_BASE_SWEEP_LONG_READY';
    return {
      eligible: true,
      cohort: 'BASE',
      marginUsdt: isLong ? settings.baseLongBinanceMarginUsdt : settings.baseBinanceMarginUsdt,
      leverage: settings.baseBinanceLeverage,
      source: 'liquid-flow-v2-base',
    };
  }
  if (isPreEma99Classification(classification)) {
    return {
      eligible: true,
      cohort: 'PRE_EMA99',
      marginUsdt: settings.preBinanceMarginUsdt,
      leverage: settings.preBinanceLeverage,
      source: 'liquid-flow-v2-pre-ema99',
    };
  }
  if (
    classification.labelKey === 'HTF_BEAR_15M_EMA99_PUMP_REJECT'
    || classification.labelKey === 'HTF_BULL_15M_EMA99_DUMP_RECLAIM'
  ) {
    return {
      eligible: settings.htfBinanceEnabled,
      cohort: 'HTF_EMA99',
      marginUsdt: settings.htfBinanceMarginUsdt,
      leverage: settings.htfBinanceLeverage,
      source: 'liquid-flow-v2-htf',
    };
  }
  return { eligible: false, cohort: null, marginUsdt: null, leverage: null, source: null };
}

export function buildLiquidFlowV2PaperPlan(row = {}, settingsInput = {}) {
  const settings = normalizeSettings(settingsInput);
  const side = paperSideOfClassification(row.classification);
  const features = row.features ?? {};
  const candle = features.lastClosedCandle ?? {};
  const liveMark = finite(features.markPrice, finite(candle.close, 0));
  if (!side || liveMark <= 0 || row.classification?.phase !== 'READY') return null;

  const targetZone = side === 'SHORT' ? features.lowerZone : features.upperZone;
  const continuation = isBaseSweepClassification(row.classification);
  const baseStructure = side === 'SHORT' ? features.baseSweepShort : features.baseSweepLong;
  const breakoutLevel = finite(baseStructure?.breakoutLevel, null);
  const retestBufferPct = settings.baseSweepRetestBufferPct;
  const retestEntry = continuation && breakoutLevel != null
    ? side === 'SHORT'
      ? breakoutLevel * (1 - retestBufferPct / 100)
      : breakoutLevel * (1 + retestBufferPct / 100)
    : liveMark;
  const needsRetest = continuation && (side === 'SHORT'
    ? retestEntry > liveMark * 1.003
    : retestEntry < liveMark * 0.997);
  const entryPrice = needsRetest ? retestEntry : liveMark;
  const planLeverage = settings.leverage;
  const riskPct = settings.hardStopRoe / planLeverage;
  const rewardFloorPct = settings.minTakeProfitRoe / planLeverage;
  const targetZonePrice = finite(targetZone?.price, null);
  const zoneRewardPct = targetZonePrice != null
    ? side === 'SHORT'
      ? (entryPrice - targetZonePrice) / entryPrice * 100
      : (targetZonePrice - entryPrice) / entryPrice * 100
    : null;
  const rewardPct = clamp(
    zoneRewardPct != null && zoneRewardPct > 0 ? zoneRewardPct : riskPct * 1.5,
    rewardFloorPct,
    4,
  );
  const stopLoss = side === 'SHORT'
    ? entryPrice * (1 + riskPct / 100)
    : entryPrice * (1 - riskPct / 100);
  const takeProfit = side === 'SHORT'
    ? entryPrice * (1 - rewardPct / 100)
    : entryPrice * (1 + rewardPct / 100);

  return {
    side,
    leverage: planLeverage,
    entryPrice: round(entryPrice),
    entryBasis: needsRetest ? 'BASE_BREAKOUT_RETEST_LIMIT' : 'LIVE_MARK_AT_READY_SCAN',
    entryMode: needsRetest ? 'PULLBACK_LIMIT' : 'IMMEDIATE_MARK',
    entryTimeoutMs: continuation ? settings.baseSweepEntryTimeoutMs : null,
    liveMarkAtSignal: round(liveMark),
    retestBufferPct: continuation ? retestBufferPct : null,
    takeProfit: round(takeProfit),
    stopLoss: round(stopLoss),
    riskPct: round(riskPct, 4),
    hardStopRoe: round(settings.hardStopRoe, 2),
    minTakeProfitRoe: round(settings.minTakeProfitRoe, 2),
    rewardPct: round(rewardPct, 4),
    estimatedRiskRoe: round(riskPct * planLeverage, 2),
    estimatedRewardRoe: round(rewardPct * planLeverage, 2),
    rr: round(rewardPct / riskPct, 2),
    targetBasis: zoneRewardPct != null && zoneRewardPct > 0
      ? `OPPOSITE_V1_ZONE_WITH_${round(settings.minTakeProfitRoe, 2)}_ROE_FLOOR`
      : 'RISK_1_5R_FALLBACK',
    invalidationBasis: `FIXED_${round(settings.hardStopRoe, 2)}_ROE_AT_${planLeverage}X`,
  };
}

export function liquidFlowV2PaperMetrics(trade = {}, markInput = null, now = Date.now()) {
  const entry = finite(trade.entryPrice, 0);
  const mark = finite(markInput, finite(trade.exitPrice, entry));
  const leverage = finite(trade.leverage, 10);
  const marginUsdt = finite(trade.marginUsdt, 10);
  const rawReturnPct = entry > 0 && mark > 0
    ? (trade.side === 'SHORT' ? (entry - mark) : (mark - entry)) / entry * 100
    : 0;
  const grossRoe = rawReturnPct * leverage;
  const grossPnl = marginUsdt * grossRoe / 100;
  const fee = marginUsdt * leverage * finite(trade.roundTripFeeRate, 0.0008);
  return {
    markPrice: mark,
    rawReturnPct: round(rawReturnPct, 4),
    grossRoe: round(grossRoe, 3),
    grossPnl: round(grossPnl, 6),
    estimatedFee: round(fee, 6),
    netPnl: round(grossPnl - fee, 6),
    netRoe: round((grossPnl - fee) / marginUsdt * 100, 3),
    ageMs: Math.max(0, now - finite(trade.entryAt, now)),
  };
}

export function evaluateLiquidFlowV2PaperExit(trade = {}, markPrice, now = Date.now()) {
  if (trade.status !== 'OPEN') return null;
  const mark = finite(markPrice, 0);
  const tp = finite(trade.takeProfit, 0);
  const sl = finite(trade.stopLoss, 0);
  if (mark <= 0 || tp <= 0 || sl <= 0) return null;
  if (trade.side === 'SHORT') {
    if (mark <= tp) return { outcome: 'TP', exitPrice: tp, exitAt: now };
    if (mark >= sl) return { outcome: 'SL', exitPrice: sl, exitAt: now };
  } else if (trade.side === 'LONG') {
    if (mark >= tp) return { outcome: 'TP', exitPrice: tp, exitAt: now };
    if (mark <= sl) return { outcome: 'SL', exitPrice: sl, exitAt: now };
  }
  if (now - finite(trade.entryAt, now) >= finite(trade.maxHoldMs, 4 * 60 * 60_000)) {
    return { outcome: 'TIMEOUT', exitPrice: mark, exitAt: now };
  }
  return null;
}

export function summarizeLiquidFlowV2Paper(trades = [], marks = new Map(), now = Date.now()) {
  const decorated = trades.map((trade) => {
    const mark = ['OPEN', 'PENDING_ENTRY'].includes(trade.status)
      ? finite(marks.get(trade.symbol), finite(trade.entryPrice, 0))
      : finite(trade.exitPrice, finite(trade.entryPrice, 0));
    if (trade.status === 'PENDING_ENTRY') {
      return {
        ...trade,
        markPrice: mark,
        rawReturnPct: 0,
        grossRoe: 0,
        grossPnl: 0,
        estimatedFee: 0,
        netPnl: 0,
        netRoe: 0,
        ageMs: Math.max(0, now - finite(trade.pendingSince, now)),
      };
    }
    return { ...trade, ...liquidFlowV2PaperMetrics(trade, mark, now) };
  });
  const closed = decorated.filter((trade) => trade.status === 'CLOSED');
  const open = decorated.filter((trade) => trade.status === 'OPEN');
  const pending = decorated.filter((trade) => trade.status === 'PENDING_ENTRY');
  const cancelled = decorated.filter((trade) => trade.status === 'CANCELLED');
  const wins = closed.filter((trade) => trade.netPnl > 0).length;
  const losses = closed.filter((trade) => trade.netPnl <= 0).length;
  const netPnl = closed.reduce((sum, trade) => sum + finite(trade.netPnl, 0), 0);
  const avgRoe = closed.length ? closed.reduce((sum, trade) => sum + finite(trade.netRoe, 0), 0) / closed.length : 0;
  const grossProfit = closed.filter((trade) => trade.netPnl > 0).reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(closed.filter((trade) => trade.netPnl < 0).reduce((sum, trade) => sum + trade.netPnl, 0));
  return {
    total: decorated.length,
    open: open.length,
    pending: pending.length,
    cancelled: cancelled.length,
    closed: closed.length,
    wins,
    losses,
    winRate: closed.length ? wins / closed.length * 100 : 0,
    netPnl: round(netPnl, 6),
    avgRoe: round(avgRoe, 3),
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 3) : grossProfit > 0 ? null : 0,
    openPnl: round(open.reduce((sum, trade) => sum + finite(trade.netPnl, 0), 0), 6),
    trades: decorated.sort((a, b) => (
      finite(b.entryAt, finite(b.pendingSince, 0)) - finite(a.entryAt, finite(a.pendingSince, 0))
    )),
  };
}

export class LiquidFlowV2PaperManager {
  constructor({ file, settings = {}, now = () => Date.now(), onStateChange = null } = {}) {
    this.file = file;
    this.now = now;
    this.onStateChange = onStateChange;
    this.state = {
      version: LIQUID_FLOW_V2_PAPER_VERSION,
      createdAt: new Date(this.now()).toISOString(),
      updatedAt: null,
      settings: normalizeSettings(settings),
      trades: [],
    };
    this.marks = new Map();
    this.initialized = false;
    this.initPromise = null;
    this.saveLock = Promise.resolve();
  }

  async init() {
    if (this.initialized) return this.state;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        const parsed = JSON.parse(await readFile(this.file, 'utf8'));
        const runtimePolicy = this.state.settings;
        this.state = {
          ...this.state,
          ...(parsed && typeof parsed === 'object' ? parsed : {}),
          settings: normalizeSettings({
            ...(parsed?.settings ?? {}),
            leverage: runtimePolicy.leverage,
            baseSweepLeverage: runtimePolicy.baseSweepLeverage,
            hardStopRoe: runtimePolicy.hardStopRoe,
            minTakeProfitRoe: runtimePolicy.minTakeProfitRoe,
            baseBinanceEnabled: runtimePolicy.baseBinanceEnabled,
            baseBinanceMarginUsdt: runtimePolicy.baseBinanceMarginUsdt,
            htfBinanceEnabled: runtimePolicy.htfBinanceEnabled,
            htfBinanceMarginUsdt: runtimePolicy.htfBinanceMarginUsdt,
            htfBinanceLeverage: runtimePolicy.htfBinanceLeverage,
            baseLongBinanceMarginUsdt: runtimePolicy.baseLongBinanceMarginUsdt,
            baseBinanceLeverage: runtimePolicy.baseBinanceLeverage,
            preBinanceMarginUsdt: runtimePolicy.preBinanceMarginUsdt,
            preBinanceLeverage: runtimePolicy.preBinanceLeverage,
          }),
          trades: Array.isArray(parsed?.trades) ? parsed.trades : Array.isArray(parsed) ? parsed : [],
          version: LIQUID_FLOW_V2_PAPER_VERSION,
        };
      } catch (error) {
        if (error?.code !== 'ENOENT') console.warn(`[LiquidFlowV2Paper] load failed: ${error.message}`);
      }
      this.initialized = true;
      this.initPromise = null;
      this._notify('init');
      return this.state;
    })();
    return this.initPromise;
  }

  async updateSettings(patch = {}) {
    await this.init();
    this.state.settings = normalizeSettings({ ...this.state.settings, ...patch });
    await this._save('settings');
    return this.snapshot();
  }

  async createFromReadyTransitions(
    rows = [],
    transitionSymbols = new Set(),
    observedAt = this.now(),
    transitionLabelKeys = new Set(),
  ) {
    await this.init();
    if (!this.state.settings.autoEnabled) return [];
    const created = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const candidates = new Map();
      if (transitionSymbols.has(row.symbol) && row.classification?.phase === 'READY') {
        candidates.set(row.classification.labelKey, row.classification);
      }
      for (const classification of Array.isArray(row.classification?.secondaryLabels)
        ? row.classification.secondaryLabels
        : []) {
        if (classification?.phase !== 'READY') continue;
        if (!transitionLabelKeys.has(`${row.symbol}|${classification.labelKey}`)) continue;
        candidates.set(classification.labelKey, classification);
      }
      for (const classification of candidates.values()) {
        const effectiveRow = { ...row, classification };
        const plan = buildLiquidFlowV2PaperPlan(effectiveRow, this.state.settings);
        if (!plan) continue;
        const htfEma99Label = classification.labelKey === 'HTF_BEAR_15M_EMA99_PUMP_REJECT'
          || classification.labelKey === 'HTF_BULL_15M_EMA99_DUMP_RECLAIM';
        const distributionLabel = classification.labelKey === 'PUMP_DISTRIBUTION_SHORT_READY';
        const signalCandleClosedAt = distributionLabel
          ? row.features?.pumpDistribution15m?.readyAt
            ?? row.features?.pumpDistribution15m?.candleClosedAt
            ?? row.features?.candleClosedAt
          : htfEma99Label
            ? classification.ema99RetestCandleClosedAt
              ?? row.features?.ema99Retest5m?.candleClosedAt
              ?? row.features?.ema99Retest15m?.candleClosedAt
              ?? row.features?.candleClosedAt
            : row.features?.candleClosedAt;
        const signalKey = `${row.symbol}|${classification.labelKey}|${signalCandleClosedAt ?? observedAt}`;
        if (this.state.trades.some((trade) => trade.signalKey === signalKey)) continue;
        const activeConflict = this.state.trades.some((trade) => trade.symbol === row.symbol
          && ['OPEN', 'PENDING_ENTRY'].includes(trade.status)
          && (!distributionLabel || trade.labelKey === classification.labelKey));
        if (activeConflict) continue;
        const latestSameSide = this.state.trades
          .filter((trade) => trade.symbol === row.symbol
            && trade.side === plan.side
            && (!distributionLabel || trade.labelKey === classification.labelKey))
          .sort((a, b) => finite(b.entryAt, finite(b.pendingSince, 0)) - finite(a.entryAt, finite(a.pendingSince, 0)))[0];
        const latestStartedAt = finite(latestSameSide?.entryAt, finite(latestSameSide?.pendingSince, 0));
        if (latestSameSide && observedAt - latestStartedAt < this.state.settings.cooldownMs) continue;
        const pendingEntry = plan.entryMode === 'PULLBACK_LIMIT';
        const trade = {
          id: randomUUID(),
          signalKey,
          version: LIQUID_FLOW_V2_PAPER_VERSION,
          source: 'liquid-flow-v2',
          symbol: row.symbol,
          labelKey: classification.labelKey,
          label: classification.label,
          confidence: classification.confidence,
          status: pendingEntry ? 'PENDING_ENTRY' : 'OPEN',
          outcome: null,
          entryAt: pendingEntry ? null : observedAt,
          pendingSince: pendingEntry ? observedAt : null,
          entryExpiresAt: pendingEntry ? observedAt + plan.entryTimeoutMs : null,
          signalCandleClosedAt: signalCandleClosedAt ?? null,
          marginUsdt: this.state.settings.marginUsdt,
          leverage: this.state.settings.leverage,
          maxHoldMs: this.state.settings.maxHoldMs,
          roundTripFeeRate: this.state.settings.roundTripFeeRate,
          ...plan,
          snapshot: {
            change24hPct: row.features?.change24hPct ?? null,
            change1hPct: row.features?.change1hPct ?? null,
            volumeX: row.features?.volumeX ?? null,
            takerDeltaPct: row.features?.takerDeltaPct ?? null,
            openInterestDeltaPct: row.features?.openInterestDeltaPct ?? null,
            shortLiquidationUsd: row.features?.shortLiquidationUsd ?? null,
            longLiquidationUsd: row.features?.longLiquidationUsd ?? null,
            upperZone: row.features?.upperZone ?? null,
            lowerZone: row.features?.lowerZone ?? null,
            baseSweepLong: row.features?.baseSweepLong ?? null,
            baseSweepShort: row.features?.baseSweepShort ?? null,
            trend1h: row.features?.trend1h ?? null,
            trend4h: row.features?.trend4h ?? null,
            htfBearTier: row.features?.htfBearTier ?? null,
            htfBullTier: row.features?.htfBullTier ?? null,
            ema99RetestTimeframe: classification.ema99RetestTimeframe ?? null,
            ema99Retest5m: row.features?.ema99Retest5m ?? null,
            ema99Retest15m: row.features?.ema99Retest15m ?? null,
            pumpDistribution15m: row.features?.pumpDistribution15m ?? null,
            signalClosedPrice: row.features?.lastClosedCandle?.close ?? null,
            liveMarkAtSignal: plan.liveMarkAtSignal,
            evidence: classification.evidence ?? [],
          },
        };
        this.state.trades.push(trade);
        this.marks.set(trade.symbol, finite(row.features?.markPrice, trade.entryPrice));
        created.push(trade);
      }
    }
    if (created.length) await this._save('create');
    return created;
  }

  async handlePrice({ symbol: rawSymbol, markPrice, price, eventTime } = {}) {
    await this.init();
    const symbol = String(rawSymbol ?? '').toUpperCase();
    const mark = finite(markPrice, finite(price, 0));
    if (!symbol || mark <= 0) return [];
    this.marks.set(symbol, mark);
    const events = [];
    const now = finite(eventTime, this.now());
    for (const trade of this.state.trades) {
      if (trade.symbol !== symbol) continue;
      if (trade.status === 'PENDING_ENTRY') {
        const invalidated = trade.side === 'LONG'
          ? mark <= finite(trade.stopLoss, 0)
          : mark >= finite(trade.stopLoss, Infinity);
        if (invalidated || now >= finite(trade.entryExpiresAt, Infinity)) {
          Object.assign(trade, {
            status: 'CANCELLED',
            outcome: invalidated ? 'ENTRY_INVALIDATED' : 'ENTRY_TIMEOUT',
            cancelledAt: now,
            markPrice: mark,
          });
          events.push(trade);
          continue;
        }
        const filled = trade.side === 'LONG'
          ? mark <= finite(trade.entryPrice, 0)
          : mark >= finite(trade.entryPrice, Infinity);
        if (filled) {
          Object.assign(trade, {
            status: 'OPEN',
            entryAt: now,
            entryFilledAt: now,
            markPrice: trade.entryPrice,
          });
          events.push(trade);
        }
        continue;
      }
      if (trade.status !== 'OPEN') continue;
      const exit = evaluateLiquidFlowV2PaperExit(trade, mark, now);
      if (!exit) continue;
      const metrics = liquidFlowV2PaperMetrics(trade, exit.exitPrice, exit.exitAt);
      Object.assign(trade, exit, metrics, { status: 'CLOSED' });
      events.push(trade);
    }
    if (events.length) await this._save('price-event');
    return events;
  }

  async claimBinanceEntry(tradeId, claimedAt = this.now()) {
    await this.init();
    const trade = this.state.trades.find((row) => row.id === tradeId);
    if (!trade || trade.status !== 'OPEN') return null;
    if (!liquidFlowV2AutoBinanceProfile({ labelKey: trade.labelKey }, this.state.settings).eligible) return null;
    if (trade.binanceEntryState) return null;
    Object.assign(trade, {
      binanceEntryState: 'SUBMITTING',
      binanceEntryClaimedAt: claimedAt,
    });
    await this._save('binance-entry-claim');
    return { ...trade };
  }

  async recordBinanceEntryResult(tradeId, result = {}) {
    await this.init();
    const trade = this.state.trades.find((row) => row.id === tradeId);
    if (!trade) return null;
    Object.assign(trade, result, { binanceEntryUpdatedAt: this.now() });
    await this._save('binance-entry-result');
    return { ...trade };
  }

  snapshot() {
    const summary = summarizeLiquidFlowV2Paper(this.state.trades, this.marks, this.now());
    return {
      version: LIQUID_FLOW_V2_PAPER_VERSION,
      observationOnly: !this.state.settings.baseBinanceEnabled && !this.state.settings.htfBinanceEnabled,
      labelsObservationOnly: true,
      affectsBinance: this.state.settings.baseBinanceEnabled || this.state.settings.htfBinanceEnabled,
      settings: { ...this.state.settings },
      updatedAt: this.state.updatedAt,
      ...summary,
      trades: summary.trades.slice(0, 300),
    };
  }

  activeSymbols() {
    return [...new Set(this.state.trades
      .filter((trade) => ['OPEN', 'PENDING_ENTRY'].includes(trade.status))
      .map((trade) => trade.symbol))];
  }

  async _save(reason) {
    this.state.updatedAt = new Date(this.now()).toISOString();
    const payload = JSON.stringify(this.state, null, 2);
    this.saveLock = this.saveLock.catch(() => {}).then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tempFile = `${this.file}.${process.pid}.${this.now()}.tmp`;
      await writeFile(tempFile, payload, 'utf8');
      await rename(tempFile, this.file);
    });
    await this.saveLock;
    this._notify(reason);
  }

  _notify(reason) {
    try {
      this.onStateChange?.({ reason, snapshot: this.snapshot(), activeSymbols: this.activeSymbols() });
    } catch {}
  }
}
