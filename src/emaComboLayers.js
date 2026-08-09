export const EMA_COMBO_LAYER_VERSION = 'EMA_COMBO_3L_OBSERVE_V1_20260726';
export const EMA_COMBO_LAYER_HISTORY_START = '2026-07-24';

const TIER_ORDER = ['GOOD_PLUS', 'GOOD', 'WATCH', 'RISK'];

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalize = (value, fallback = 'NO_DATA') => {
  const text = String(value ?? fallback)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return text || fallback;
};

export function emaComboTradeDay(trade = {}) {
  return String(trade.createdAt ?? trade.openedAt ?? trade.closedAt ?? '').slice(0, 10);
}

export function emaComboStage(trade = {}) {
  const source = String(trade.source ?? '').toLowerCase();
  const note = String(trade.note ?? '');
  if (source.includes('br_like_short') || note.includes('brLikeShort=Y')) return 'BR_LIKE_SHORT';
  if (source.includes('br_like') || note.includes('brLike=Y')) return 'BR_LIKE';
  if (trade.runnerCandidate || source.includes('runner') || note.includes('runner=Y')) return 'RUNNER';
  if (source.includes('pre_breakout')) return 'PRE_BREAKOUT';
  if (source.includes('pre_breakdown')) return 'PRE_BREAKDOWN';
  if (source.includes('breakout')) return 'BREAKOUT';
  if (source.includes('breakdown')) return 'BREAKDOWN';
  if (source.includes('squeeze_short')) return 'SQUEEZE_SHORT';
  if (source.includes('squeeze')) return 'SQUEEZE';
  return 'OTHER';
}

export function emaComboTimeframe(trade = {}) {
  return String(trade.source ?? '').match(/^emasq-(\d+[mh])-/i)?.[1]?.toLowerCase() ?? '5m';
}

export function emaComboScore(trade = {}) {
  const match = String(trade.source ?? '')
    .match(/^emasq-(?:\d+[mh]-)?[a-z_]+(?:-runner)?-(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function emaComboScoreBucket(trade = {}) {
  const score = emaComboScore(trade);
  if (!Number.isFinite(score)) return 'SCORE_NO_DATA';
  if (score >= 90) return 'SCORE_90_PLUS';
  if (score >= 80) return 'SCORE_80_89';
  if (score >= 70) return 'SCORE_70_79';
  return 'SCORE_LT_70';
}

export function emaComboCandleBucket(trade = {}) {
  const tier = normalize(
    trade.emaStageCandleTier
      ?? trade.sideCandleTier,
    'NO_DATA',
  );
  if (tier.includes('GOOD') || tier.includes('WATCH_PLUS')) return 'CANDLE_GOOD';
  if (tier.includes('RISK')) return 'CANDLE_RISK';
  if (tier === 'NO_DATA') return 'CANDLE_NO_DATA';
  return 'CANDLE_WATCH';
}

export function emaComboMarketRelation(trade = {}) {
  const corr = Number(trade.btcCorr);
  const direction = normalize(
    trade.btcHealth?.btcTrendDir
      ?? trade.btcTrendDir,
    'NO_DATA',
  );
  const side = normalize(trade.side ?? trade.action, 'NO_SIDE');
  if (!Number.isFinite(corr)) return 'CORR_NO_DATA';
  if (corr <= -0.3) return 'BTC_INVERSE';
  if (corr < 0.3) return 'BTC_INDEPENDENT';
  if (corr < 0.5) return 'BTC_WEAK_CORR';
  if (!['UP', 'DOWN'].includes(direction)) return 'BTC_FOLLOW_NO_DIR';
  const aligned = (side === 'LONG' && direction === 'UP')
    || (side === 'SHORT' && direction === 'DOWN');
  return aligned ? 'BTC_FOLLOW_ALIGNED' : 'BTC_FOLLOW_COUNTER';
}

export function emaComboLayerKeys(trade = {}) {
  const setupParts = [
    emaComboStage(trade),
    normalize(trade.side ?? trade.action, 'NO_SIDE'),
    emaComboTimeframe(trade),
    emaComboScoreBucket(trade),
  ];
  const marketParts = [
    emaComboMarketRelation(trade),
    emaComboCandleBucket(trade),
  ];
  return {
    setupKey: setupParts.join('|'),
    setupLabel: setupParts.join(' · '),
    marketKey: marketParts.join('|'),
    marketLabel: marketParts.join(' · '),
    comboKey: [...setupParts, ...marketParts].join('|'),
    comboLabel: `${setupParts.join(' · ')} × ${marketParts.join(' · ')}`,
  };
}

function estimateFee(trade = {}, feeRate = 0.0004) {
  const savedFee = Number(trade.estimatedFeeUsdt ?? trade.feeUsdt);
  if (Number.isFinite(savedFee) && savedFee >= 0) return savedFee;
  const entry = Number(trade.entryPrice);
  const exit = Number(trade.exitPrice ?? trade.markPrice ?? trade.entryPrice);
  const savedQuantity = Math.abs(Number(trade.originalQuantity ?? trade.quantity));
  const margin = Number(trade.marginUsdt ?? trade.marginUsd ?? trade.margin);
  const leverage = Number(trade.leverage);
  const inferredQuantity = Number.isFinite(margin) && margin > 0
    && Number.isFinite(leverage) && leverage > 0
    && Number.isFinite(entry) && entry > 0
    ? (margin * leverage) / entry
    : NaN;
  const quantity = Number.isFinite(savedQuantity) && savedQuantity > 0
    ? savedQuantity
    : inferredQuantity;
  if (![entry, exit, quantity].every(Number.isFinite)) return 0;
  if (entry <= 0 || exit <= 0 || quantity <= 0) return 0;
  return (Math.abs(entry * quantity) + Math.abs(exit * quantity)) * feeRate;
}

export function emaComboClosedMetrics(trade = {}, feeRate = 0.0004) {
  const grossPnl = finite(trade.pnl ?? trade.grossPnl);
  const feeUsdt = estimateFee(trade, feeRate);
  const netPnl = grossPnl - feeUsdt;
  const margin = Number(trade.marginUsdt ?? trade.marginUsd ?? trade.margin);
  const rawNetRoe = Number.isFinite(margin) && margin > 0
    ? (netPnl / margin) * 100
    : finite(trade.netRoe ?? trade.roe);
  return {
    grossPnl,
    feeUsdt,
    netPnl,
    rawNetRoe,
    cappedNetRoe: Math.max(-20, Math.min(20, rawNetRoe)),
  };
}

function createAccumulator() {
  return {
    closed: 0,
    netPnl: 0,
    netRoeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    dailyNetPnl: new Map(),
  };
}

function addObservation(accumulator, trade, feeRate) {
  if (String(trade.status ?? '').toUpperCase() !== 'CLOSED') return;
  const metrics = emaComboClosedMetrics(trade, feeRate);
  accumulator.closed += 1;
  accumulator.netPnl += metrics.netPnl;
  accumulator.netRoeSum += metrics.cappedNetRoe;
  if (metrics.netPnl > 0) accumulator.grossWin += metrics.netPnl;
  else if (metrics.netPnl < 0) accumulator.grossLoss += Math.abs(metrics.netPnl);
  const day = emaComboTradeDay(trade);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    accumulator.dailyNetPnl.set(
      day,
      (accumulator.dailyNetPnl.get(day) ?? 0) + metrics.netPnl,
    );
  }
}

function finalizeAccumulator(accumulator = createAccumulator()) {
  const dailyValues = [...accumulator.dailyNetPnl.values()];
  const profitFactor = accumulator.grossLoss > 0
    ? accumulator.grossWin / accumulator.grossLoss
    : accumulator.grossWin > 0 ? 9.99 : 0;
  return {
    closed: accumulator.closed,
    days: dailyValues.length,
    positiveDays: dailyValues.filter((value) => value > 0).length,
    negativeDays: dailyValues.filter((value) => value < 0).length,
    netPnl: +accumulator.netPnl.toFixed(4),
    avgNetRoe: accumulator.closed > 0
      ? +(accumulator.netRoeSum / accumulator.closed).toFixed(3)
      : 0,
    profitFactor: +Math.min(9.99, profitFactor).toFixed(3),
  };
}

function addModelObservation(modelMap, key, label, trade, feeRate) {
  if (!modelMap.has(key)) {
    modelMap.set(key, {
      key,
      label,
      accumulator: createAccumulator(),
    });
  }
  addObservation(modelMap.get(key).accumulator, trade, feeRate);
}

function finalizeModelMap(modelMap) {
  return new Map([...modelMap.entries()].map(([key, row]) => [
    key,
    {
      key,
      label: row.label,
      ...finalizeAccumulator(row.accumulator),
    },
  ]));
}

function positiveDayRequirement(days) {
  return Math.max(2, Math.ceil(days * 0.6));
}

function layerTier(evidence = {}) {
  if (evidence.closed < 15 || evidence.days < 2) return 'WATCH';
  if (
    evidence.avgNetRoe >= 0.25
    && evidence.profitFactor >= 1.05
    && evidence.positiveDays >= positiveDayRequirement(evidence.days)
  ) return 'GOOD';
  if (
    evidence.avgNetRoe <= -0.5
    && evidence.profitFactor < 0.9
    && evidence.negativeDays >= positiveDayRequirement(evidence.days)
  ) return 'RISK';
  return 'WATCH';
}

function layerReason(name, tier, evidence = {}) {
  const sample = `${evidence.closed ?? 0} closed/${evidence.days ?? 0} ngày`;
  const edge = `AvgNetROE ${finite(evidence.avgNetRoe).toFixed(2)}% · PF ${finite(evidence.profitFactor).toFixed(2)}`;
  if (tier === 'GOOD') return `${name}: prior-only dương (${sample}; ${edge}).`;
  if (tier === 'RISK') return `${name}: prior-only âm (${sample}; ${edge}).`;
  return `${name}: chưa đủ mẫu hoặc edge chưa ổn định (${sample}; ${edge}).`;
}

function emptyEvidence(key, label) {
  return {
    key,
    label,
    closed: 0,
    days: 0,
    positiveDays: 0,
    negativeDays: 0,
    netPnl: 0,
    avgNetRoe: 0,
    profitFactor: 0,
  };
}

export function buildEmaComboLayerModel(
  trades = [],
  cutoffDay,
  {
    feeRate = 0.0004,
    historyStart = EMA_COMBO_LAYER_HISTORY_START,
    maxHistoryDays = 7,
  } = {},
) {
  const normalizedCutoff = /^\d{4}-\d{2}-\d{2}$/.test(String(cutoffDay ?? ''))
    ? String(cutoffDay)
    : new Date().toISOString().slice(0, 10);
  const historyDays = [...new Set(
    trades
      .filter((trade) => String(trade.source ?? '').startsWith('emasq-'))
      .map(emaComboTradeDay)
      .filter((day) => (
        /^\d{4}-\d{2}-\d{2}$/.test(day)
        && day >= historyStart
        && day < normalizedCutoff
      )),
  )]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, maxHistoryDays)
    .sort();
  const historyDaySet = new Set(historyDays);
  const setup = new Map();
  const market = new Map();
  const combo = new Map();
  for (const trade of trades) {
    if (
      String(trade.source ?? '').startsWith('emasq-')
      && String(trade.status ?? '').toUpperCase() === 'CLOSED'
      && historyDaySet.has(emaComboTradeDay(trade))
    ) {
      const keys = emaComboLayerKeys(trade);
      addModelObservation(setup, keys.setupKey, keys.setupLabel, trade, feeRate);
      addModelObservation(market, keys.marketKey, keys.marketLabel, trade, feeRate);
      addModelObservation(combo, keys.comboKey, keys.comboLabel, trade, feeRate);
    }
  }
  return {
    version: EMA_COMBO_LAYER_VERSION,
    cutoffDay: normalizedCutoff,
    historyStart,
    historyDays,
    minimumConfirmedDays: 3,
    observationOnly: true,
    setup: finalizeModelMap(setup),
    market: finalizeModelMap(market),
    combo: finalizeModelMap(combo),
  };
}

function comboTier({
  setupTier,
  marketTier,
  comboEvidence,
  modelHistoryDays,
}) {
  const negativeCombo = comboEvidence.closed >= 15
    && comboEvidence.days >= 2
    && comboEvidence.avgNetRoe <= -0.5
    && comboEvidence.profitFactor < 0.9
    && comboEvidence.negativeDays >= positiveDayRequirement(comboEvidence.days);
  if (negativeCombo || (setupTier === 'RISK' && marketTier === 'RISK')) return 'RISK';

  const positiveCombo = comboEvidence.closed >= 15
    && comboEvidence.days >= 2
    && comboEvidence.avgNetRoe >= 0.5
    && comboEvidence.profitFactor >= 1.1
    && comboEvidence.positiveDays >= positiveDayRequirement(comboEvidence.days);
  if (!positiveCombo || setupTier === 'RISK' || marketTier === 'RISK') return 'WATCH';

  const confirmed = modelHistoryDays >= 3
    && comboEvidence.days >= 3
    && setupTier === 'GOOD'
    && marketTier === 'GOOD';
  return confirmed ? 'GOOD_PLUS' : 'GOOD';
}

function comboReason(tier, comboEvidence, historyDays) {
  const sample = `${comboEvidence.closed} closed/${comboEvidence.days} ngày`;
  const edge = `AvgNetROE ${comboEvidence.avgNetRoe.toFixed(2)}% · PF ${comboEvidence.profitFactor.toFixed(2)}`;
  if (tier === 'GOOD_PLUS') {
    return `Tổ hợp prior-only đã xác nhận (${sample}; ${edge}); đủ 3 ngày dữ liệu schema đầy đủ.`;
  }
  if (tier === 'GOOD') {
    return `Tổ hợp dương nhưng còn PROVISIONAL (${sample}; ${edge}); model hiện có ${historyDays} ngày đầy đủ, cần ít nhất 3 ngày để chọn.`;
  }
  if (tier === 'RISK') {
    return `Tổ hợp hoặc cả hai lớp có edge prior-only âm (${sample}; ${edge}).`;
  }
  return `Tổ hợp chưa đủ bằng chứng prior-only (${sample}; ${edge}).`;
}

export function evaluateEmaComboLayers(trade = {}, model = null) {
  if (!String(trade.source ?? '').startsWith('emasq-')) return null;
  const keys = emaComboLayerKeys(trade);
  const setupEvidence = model?.setup?.get(keys.setupKey)
    ?? emptyEvidence(keys.setupKey, keys.setupLabel);
  const marketEvidence = model?.market?.get(keys.marketKey)
    ?? emptyEvidence(keys.marketKey, keys.marketLabel);
  const comboEvidence = model?.combo?.get(keys.comboKey)
    ?? emptyEvidence(keys.comboKey, keys.comboLabel);
  const setupTier = layerTier(setupEvidence);
  const marketTier = layerTier(marketEvidence);
  const historyDays = Array.isArray(model?.historyDays) ? model.historyDays.length : 0;
  const tier = comboTier({
    setupTier,
    marketTier,
    comboEvidence,
    modelHistoryDays: historyDays,
  });
  return {
    version: EMA_COMBO_LAYER_VERSION,
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    affectsSl: false,
    affectsTp: false,
    cutoffDay: model?.cutoffDay ?? null,
    historyStart: model?.historyStart ?? EMA_COMBO_LAYER_HISTORY_START,
    historyDays: model?.historyDays ?? [],
    layer1: {
      key: keys.setupKey,
      label: keys.setupLabel,
      tier: setupTier,
      reason: layerReason('SETUP EMA', setupTier, setupEvidence),
      evidence: setupEvidence,
    },
    layer2: {
      key: keys.marketKey,
      label: keys.marketLabel,
      tier: marketTier,
      reason: layerReason('MARKET FIT', marketTier, marketEvidence),
      evidence: marketEvidence,
    },
    layer3: {
      key: keys.comboKey,
      label: keys.comboLabel,
      tier,
      reason: comboReason(tier, comboEvidence, historyDays),
      evidence: comboEvidence,
      selectionReady: tier === 'GOOD_PLUS',
      provisional: tier === 'GOOD',
    },
  };
}

export function emaComboLayersOfTrade(trade = {}, model = null) {
  const saved = trade.emaComboLayersSnapshot;
  if (
    saved
    && saved.version === EMA_COMBO_LAYER_VERSION
    && saved.layer1
    && saved.layer2
    && saved.layer3
  ) return saved;
  return evaluateEmaComboLayers(trade, model);
}

export function withEmaComboLayerFields(trade = {}, evaluation = null) {
  if (!evaluation) return trade;
  return {
    ...trade,
    emaComboLayersSnapshot: evaluation,
    emaLayerVersion: evaluation.version,
    emaLayerObservationOnly: true,
    emaLayer1Key: evaluation.layer1.key,
    emaLayer1Label: evaluation.layer1.label,
    emaLayer1Tier: evaluation.layer1.tier,
    emaLayer1Reason: evaluation.layer1.reason,
    emaLayer2Key: evaluation.layer2.key,
    emaLayer2Label: evaluation.layer2.label,
    emaLayer2Tier: evaluation.layer2.tier,
    emaLayer2Reason: evaluation.layer2.reason,
    emaLayer3Key: evaluation.layer3.key,
    emaLayer3Label: evaluation.layer3.label,
    emaLayer3Tier: evaluation.layer3.tier,
    emaLayer3Reason: evaluation.layer3.reason,
    emaLayer3SelectionReady: evaluation.layer3.selectionReady === true,
    emaLayer3Provisional: evaluation.layer3.provisional === true,
  };
}

export function emaComboTierOrder() {
  return [...TIER_ORDER];
}
