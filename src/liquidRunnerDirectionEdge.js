import { liquidScanTargetKind } from './liquidScanEvalRule.js';
import { liquidScanCycleFamily } from './liquidScanCycleEdge.js';

export const LIQUID_RUNNER_DIRECTION_VERSION = 'LIQUID_RUNNER_DIRECTION_V1_20260726';

const EPISODE_MS = 15 * 60 * 1000;
const RECENT_EPISODES = 8;
const PULSE_EPISODES = 4;
const RECOVERY_EPISODES = 3;
const MIN_CLOSED = 12;
const MIN_EPISODES = 4;
const MIN_DAYS = 2;

function finiteNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function bounded(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tradeEntryMs(trade = {}) {
  const value = Date.parse(
    trade.openedAt
      ?? trade.entryReadyAt
      ?? trade.createdAt
      ?? '',
  );
  return Number.isFinite(value) ? value : 0;
}

function tradeClosedMs(trade = {}) {
  const value = Date.parse(trade.closedAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

function tradeDay(trade = {}) {
  return String(
    trade.createdAt
      ?? trade.openedAt
      ?? trade.closedAt
      ?? '',
  ).slice(0, 10);
}

export function liquidRunnerPlannedTpRoe(trade = {}) {
  const side = String(trade.side ?? '').toUpperCase();
  const entry = finiteNumber(trade.entryPrice ?? trade.entryPlan?.entryPrice);
  const takeProfit = finiteNumber(
    trade.takeProfitPrice
      ?? trade.tp
      ?? trade.entryPlan?.takeProfitPrice
      ?? trade.entryPlan?.targetPrice,
  );
  const leverage = finiteNumber(trade.leverage);
  if (!(entry > 0) || !(takeProfit > 0) || !(leverage > 0)) return null;
  if (side === 'LONG') return ((takeProfit - entry) / entry) * 100 * leverage;
  if (side === 'SHORT') return ((entry - takeProfit) / entry) * 100 * leverage;
  return null;
}

function reachBucket(plannedTpRoe) {
  if (plannedTpRoe == null) return 'REACH_NO_DATA';
  if (plannedTpRoe >= 60) return 'STRETCHED_60_PLUS';
  if (plannedTpRoe >= 45) return 'REACH_45_60';
  if (plannedTpRoe >= 30) return 'REACH_30_45';
  return 'REACH_LT_30';
}

function candleRelation(trade = {}) {
  const side = String(trade.side ?? '').toUpperCase();
  const direction = String(
    trade.candlePatternAtEntry?.direction
      ?? trade.candlePatternAtEntry?.name
      ?? '',
  ).toUpperCase();
  if (!['BULLISH', 'BEARISH'].includes(direction)) return 'CANDLE_NEUTRAL';
  const expected = side === 'LONG' ? 'BULLISH' : side === 'SHORT' ? 'BEARISH' : '';
  return direction === expected ? 'CANDLE_ALIGNED' : 'CANDLE_COUNTER';
}

export function liquidRunnerDirectionRelation(trade = {}) {
  const side = String(trade.side ?? '').toUpperCase();
  const health = trade.btcHealth ?? {};
  const btcDirection = String(
    health.btcTrendDir
      ?? trade.btcTrendDir
      ?? '',
  ).toLowerCase();
  const corr = finiteNumber(trade.btcCorr);
  if (
    !['LONG', 'SHORT'].includes(side)
    || !['up', 'down'].includes(btcDirection)
    || corr == null
  ) {
    return {
      relation: 'REL_NO_DATA',
      score: null,
      corr,
      btcDirection: btcDirection || null,
    };
  }
  const sideSign = side === 'LONG' ? 1 : -1;
  const btcSign = btcDirection === 'up' ? 1 : -1;
  const score = sideSign * btcSign * corr;
  const relation = score >= 0.3
    ? 'ALIGNED_STRONG'
    : score >= 0.1
      ? 'ALIGNED_WEAK'
      : score > -0.1
        ? 'INDEPENDENT'
        : score > -0.3
          ? 'COUNTER_WEAK'
          : 'COUNTER_STRONG';
  return {
    relation,
    score,
    corr,
    btcDirection,
  };
}

export function liquidRunnerDirectionCohorts(trade = {}) {
  const side = String(trade.side ?? '').toUpperCase() || 'SIDE_NO_DATA';
  const targetKind = String(liquidScanTargetKind(trade)).toUpperCase();
  const plannedTpRoe = liquidRunnerPlannedTpRoe(trade);
  const reach = reachBucket(plannedTpRoe);
  const cycleFamily = liquidScanCycleFamily(trade);
  const direction = liquidRunnerDirectionRelation(trade);
  const candle = candleRelation(trade);
  const eligible = ['LONG', 'SHORT'].includes(side)
    && targetKind === 'LOCAL_SWEEP'
    && plannedTpRoe != null
    && plannedTpRoe >= 30;
  const keys = [
    `EXACT | ${side} | ${reach} | ${cycleFamily} | ${direction.relation} | ${candle}`,
    `CYCLE | ${side} | ${reach} | ${cycleFamily} | ${direction.relation}`,
    `RELATION | ${side} | ${reach} | ${direction.relation} | ${candle}`,
    `REACH | ${side} | ${reach}`,
    `SIDE | ${side}`,
  ];
  return {
    eligible,
    side,
    targetKind,
    plannedTpRoe,
    reach,
    cycleFamily,
    directionRelation: direction.relation,
    directionScore: direction.score,
    candleRelation: candle,
    exactKey: keys[0],
    keys: [...new Set(keys)],
  };
}

function netRoeOf(trade = {}) {
  const saved = finiteNumber(trade.netRoe);
  if (saved != null) return saved;
  const margin = finiteNumber(trade.marginUsdt);
  const netPnl = finiteNumber(trade.netPnl);
  if (margin > 0 && netPnl != null) return (netPnl / margin) * 100;

  const entry = finiteNumber(trade.entryPrice);
  const exit = finiteNumber(trade.exitPrice);
  const quantity = finiteNumber(trade.quantity);
  if (margin > 0 && entry > 0 && exit > 0 && quantity > 0) {
    const sideMult = String(trade.side ?? '').toUpperCase() === 'LONG' ? 1 : -1;
    const gross = (exit - entry) * quantity * sideMult;
    const feeRate = Math.max(0, finiteNumber(trade.feeRate, 0.0004));
    const fee = (Math.abs(entry * quantity) + Math.abs(exit * quantity)) * feeRate;
    return ((gross - fee) / margin) * 100;
  }

  const grossPnl = finiteNumber(trade.grossPnl ?? trade.pnl);
  const fee = finiteNumber(trade.feeUsdt ?? trade.estimatedFeeUsdt, 0);
  if (margin > 0 && grossPnl != null) return ((grossPnl - fee) / margin) * 100;
  return finiteNumber(trade.roe);
}

function validClosedRecord(trade = {}) {
  if (String(trade.status ?? '').toUpperCase() !== 'CLOSED') return false;
  if (String(trade.outcome ?? '').toUpperCase() === 'INVALID') return false;
  return tradeClosedMs(trade) > 0 && netRoeOf(trade) != null;
}

function historyRecord(trade = {}) {
  const netRoe = netRoeOf(trade);
  return {
    id: trade.id ?? null,
    entryMs: tradeEntryMs(trade),
    closedMs: tradeClosedMs(trade),
    day: tradeDay(trade),
    netRoe: bounded(netRoe, -25, 25),
    highHit: netRoe >= 30,
    cohorts: liquidRunnerDirectionCohorts(trade),
  };
}

function episodeRows(records = []) {
  const episodes = new Map();
  for (const record of records) {
    const bucket = Math.floor(record.entryMs / EPISODE_MS) * EPISODE_MS;
    const key = `${record.day}:${bucket}`;
    if (!episodes.has(key)) {
      episodes.set(key, {
        key,
        day: record.day,
        availableAt: record.closedMs,
        closed: 0,
        highHits: 0,
        roeSum: 0,
      });
    }
    const episode = episodes.get(key);
    episode.closed += 1;
    episode.highHits += record.highHit ? 1 : 0;
    episode.roeSum += record.netRoe;
    episode.availableAt = Math.max(episode.availableAt, record.closedMs);
  }
  return [...episodes.values()]
    .map((episode) => ({
      ...episode,
      netRoe: episode.closed > 0 ? episode.roeSum / episode.closed : 0,
    }))
    .sort((a, b) => a.availableAt - b.availableAt);
}

function metricsFromEpisodes(episodes = []) {
  const days = new Map();
  let closed = 0;
  let highHits = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let roeSum = 0;
  for (const episode of episodes) {
    const value = finiteNumber(episode.netRoe, 0);
    const episodeClosed = Math.max(0, Number(episode.closed ?? 0));
    closed += episodeClosed;
    highHits += Math.max(0, Number(episode.highHits ?? 0));
    roeSum += value;
    if (value > 0) grossWin += value;
    else if (value < 0) grossLoss += Math.abs(value);
    days.set(episode.day, (days.get(episode.day) ?? 0) + value);
  }
  const positiveDays = [...days.values()].filter((value) => value > 0).length;
  const negativeDays = [...days.values()].filter((value) => value < 0).length;
  return {
    closed,
    highHits,
    hitRate: closed > 0 ? (highHits / closed) * 100 : 0,
    episodes: episodes.length,
    days: days.size,
    positiveDays,
    negativeDays,
    avgNetRoe: episodes.length > 0 ? roeSum / episodes.length : 0,
    profitFactor: grossLoss > 0
      ? grossWin / grossLoss
      : grossWin > 0
        ? 9.99
        : 0,
  };
}

function evidenceFromRecords(records = []) {
  const episodes = episodeRows(records);
  const recentEpisodes = episodes.slice(-RECENT_EPISODES);
  const pulseEpisodes = recentEpisodes.slice(-PULSE_EPISODES);
  return {
    all: metricsFromEpisodes(episodes),
    recent: metricsFromEpisodes(recentEpisodes),
    pulse: metricsFromEpisodes(pulseEpisodes),
    prior: metricsFromEpisodes(episodes.slice(0, Math.max(0, episodes.length - RECENT_EPISODES))),
    recovery: metricsFromEpisodes(recentEpisodes.slice(-RECOVERY_EPISODES)),
  };
}

function enoughEvidence(metrics = {}) {
  return Number(metrics.closed ?? 0) >= MIN_CLOSED
    && Number(metrics.episodes ?? 0) >= MIN_EPISODES
    && Number(metrics.days ?? 0) >= MIN_DAYS;
}

function positiveRunnerEdge(metrics = {}) {
  return Number(metrics.hitRate ?? 0) >= 12
    && Number(metrics.avgNetRoe ?? 0) > 0
    && Number(metrics.profitFactor ?? 0) >= 1.05;
}

function negativeRunnerEdge(metrics = {}) {
  return Number(metrics.hitRate ?? 0) < 8
    || Number(metrics.avgNetRoe ?? 0) <= -0.25
    || Number(metrics.profitFactor ?? 0) < 0.9;
}

function compactMetrics(metrics = {}) {
  return {
    closed: Math.max(0, Math.round(finiteNumber(metrics.closed, 0))),
    highHits: Math.max(0, Math.round(finiteNumber(metrics.highHits, 0))),
    hitRate: +finiteNumber(metrics.hitRate, 0).toFixed(2),
    episodes: Math.max(0, Math.round(finiteNumber(metrics.episodes, 0))),
    days: Math.max(0, Math.round(finiteNumber(metrics.days, 0))),
    positiveDays: Math.max(0, Math.round(finiteNumber(metrics.positiveDays, 0))),
    negativeDays: Math.max(0, Math.round(finiteNumber(metrics.negativeDays, 0))),
    avgNetRoe: +finiteNumber(metrics.avgNetRoe, 0).toFixed(3),
    profitFactor: +finiteNumber(metrics.profitFactor, 0).toFixed(3),
  };
}

function baseResult(cohort, { snapshot, selectedKey = null } = {}) {
  return {
    version: LIQUID_RUNNER_DIRECTION_VERSION,
    basis: snapshot ? 'SNAPSHOT' : 'BACKFILL_CAUSAL',
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    affectsSl: false,
    affectsTp: false,
    eligible: cohort.eligible,
    side: cohort.side,
    plannedTpRoe: cohort.plannedTpRoe,
    reachTier: cohort.reach,
    targetKind: cohort.targetKind,
    directionRelation: cohort.directionRelation,
    directionScore: cohort.directionScore,
    candleRelation: cohort.candleRelation,
    cycleFamily: cohort.cycleFamily,
    cohortKey: cohort.exactKey,
    selectedCohortKey: selectedKey,
  };
}

function evaluateEvidence({
  cohort,
  selectedKey,
  records,
  snapshot,
}) {
  const common = baseResult(cohort, { snapshot, selectedKey });
  if (!cohort.eligible) {
    const reasons = [];
    if (!['LONG', 'SHORT'].includes(cohort.side)) reasons.push('không có hướng LONG/SHORT');
    if (cohort.targetKind !== 'LOCAL_SWEEP') reasons.push(`target ${cohort.targetKind} không phải LOCAL_SWEEP`);
    if (cohort.plannedTpRoe == null) reasons.push('thiếu entry/TP/leverage tại snapshot');
    else if (cohort.plannedTpRoe < 30) reasons.push(`TP dự kiến ${cohort.plannedTpRoe.toFixed(1)}% ROE < 30%`);
    return {
      ...common,
      tier: 'UNRATED',
      code: 'R30_DIR_UNRATED',
      label: null,
      reason: reasons.join('; ') || 'không thuộc cohort Runner Direction',
      history: compactMetrics(),
      recent: compactMetrics(),
      pulse: compactMetrics(),
    };
  }

  const evidence = evidenceFromRecords(records);
  const all = evidence.all;
  const recent = evidence.recent;
  const pulse = evidence.pulse;
  const prior = evidence.prior;
  const recovery = evidence.recovery;
  const sufficient = enoughEvidence(all);
  const recentSufficient = recent.closed >= 8 && recent.episodes >= 4;
  const pulseSufficient = pulse.closed >= 4 && pulse.episodes >= 3;
  const priorPositive = enoughEvidence(prior)
    ? positiveRunnerEdge(prior)
    : positiveRunnerEdge(all);
  const recentPositive = recentSufficient && positiveRunnerEdge(recent);
  const recentNegative = recentSufficient && negativeRunnerEdge(recent);
  const pulseNegative = pulseSufficient && negativeRunnerEdge(pulse);
  const recoveryPositive = recovery.closed >= 3
    && recovery.episodes >= RECOVERY_EPISODES
    && recovery.hitRate >= 12
    && recovery.avgNetRoe > 0.25
    && recovery.profitFactor >= 1.15;

  let tier = 'NEW';
  let code = 'R30_DIR_NEW';
  let reason = `Đang gom mẫu causal: ${all.closed} đóng / ${all.episodes} episode / ${all.days} ngày.`;

  if (cohort.reach === 'STRETCHED_60_PLUS') {
    tier = 'STRETCHED';
    code = 'R30_DIR_STRETCHED';
    reason = `TP dự kiến ${cohort.plannedTpRoe.toFixed(1)}% ROE thuộc vùng >=60%; lịch sử gần đây cho thấy vùng này khó đạt, chỉ gắn nhãn theo dõi.`;
  } else if (sufficient && (recentNegative || pulseNegative) && recoveryPositive) {
    tier = 'RECOVERY';
    code = 'R30_DIR_RECOVERY';
    reason = 'Edge runner từng suy giảm nhưng 3 episode mới nhất đang phục hồi.';
  } else if (sufficient && (recentNegative || pulseNegative)) {
    tier = 'FADED';
    code = 'R30_DIR_FADED';
    reason = priorPositive
      ? 'Edge runner lịch sử từng dương nhưng hit-rate/PF/AvgNetROE gần đây đã suy giảm.'
      : 'Cửa sổ runner gần nhất đang yếu; không dùng kết quả cũ để gọi PRIME.';
  } else if (sufficient && recentPositive && (priorPositive || positiveRunnerEdge(all))) {
    tier = 'PRIME';
    code = 'R30_DIR_PRIME';
    reason = 'Khả năng đạt TP và edge walk-forward gần nhất cùng đạt ngưỡng PRIME.';
  } else if (sufficient && recentPositive) {
    tier = 'RECOVERY';
    code = 'R30_DIR_RECOVERY';
    reason = 'Cửa sổ gần nhất đã dương nhưng nền lịch sử chưa đủ ổn định.';
  } else if (sufficient) {
    tier = positiveRunnerEdge(all) ? 'PRIME' : negativeRunnerEdge(all) ? 'FADED' : 'WATCH';
    code = `R30_DIR_${tier}`;
    reason = tier === 'PRIME'
      ? 'Cohort causal đủ mẫu và edge runner tổng vẫn dương.'
      : tier === 'FADED'
        ? 'Cohort causal đủ mẫu nhưng edge runner tổng đang yếu.'
        : 'Cohort đủ mẫu nhưng bằng chứng đạt 30% chưa rõ ràng.';
  }

  return {
    ...common,
    tier,
    code,
    label: `R30 ${tier}`,
    reason: `${reason} Hướng ${cohort.directionRelation}, nến ${cohort.candleRelation}, chu kỳ ${cohort.cycleFamily}. History hit ${all.hitRate.toFixed(1)}%, PF ${all.profitFactor.toFixed(2)}, AvgNetROE ${all.avgNetRoe >= 0 ? '+' : ''}${all.avgNetRoe.toFixed(2)}%; recent hit ${recent.hitRate.toFixed(1)}%, PF ${recent.profitFactor.toFixed(2)}, Avg ${recent.avgNetRoe >= 0 ? '+' : ''}${recent.avgNetRoe.toFixed(2)}%.`,
    history: compactMetrics(all),
    recent: compactMetrics(recent),
    pulse: compactMetrics(pulse),
  };
}

function addRecordToBuckets(buckets, record) {
  if (!record.cohorts.eligible) return;
  for (const key of record.cohorts.keys) {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(record);
  }
}

function selectBucket(cohort, buckets) {
  let fallback = { key: cohort.exactKey, records: buckets.get(cohort.exactKey) ?? [] };
  for (const key of cohort.keys) {
    const records = buckets.get(key) ?? [];
    if (records.length > fallback.records.length) fallback = { key, records };
    if (enoughEvidence(evidenceFromRecords(records).all)) return { key, records };
  }
  return fallback;
}

function evaluateFromBuckets(trade, buckets, { snapshot = false } = {}) {
  const cohort = liquidRunnerDirectionCohorts(trade);
  if (!cohort.eligible) {
    return evaluateEvidence({
      cohort,
      selectedKey: null,
      records: [],
      snapshot,
    });
  }
  const selected = selectBucket(cohort, buckets);
  return evaluateEvidence({
    cohort,
    selectedKey: selected.key,
    records: selected.records,
    snapshot,
  });
}

export function evaluateLiquidRunnerDirectionSnapshot(
  trade = {},
  historicalTrades = [],
) {
  const entryMs = tradeEntryMs(trade) || Date.now();
  const buckets = new Map();
  for (const historical of historicalTrades) {
    if (!validClosedRecord(historical)) continue;
    if (tradeClosedMs(historical) >= entryMs) continue;
    addRecordToBuckets(buckets, historyRecord(historical));
  }
  return evaluateFromBuckets(trade, buckets, { snapshot: true });
}

export function deriveLiquidRunnerDirectionSnapshots(trades = []) {
  const rows = trades
    .filter((trade) => trade && typeof trade === 'object')
    .map((trade, index) => ({
      trade,
      index,
      entryMs: tradeEntryMs(trade),
    }))
    .sort((a, b) => a.entryMs - b.entryMs || a.index - b.index);
  const closedEvents = trades
    .filter(validClosedRecord)
    .map(historyRecord)
    .sort((a, b) => a.closedMs - b.closedMs);
  const buckets = new Map();
  const snapshots = new Map();
  let eventIndex = 0;

  for (const row of rows) {
    const entryMs = row.entryMs || 0;
    while (
      eventIndex < closedEvents.length
      && closedEvents[eventIndex].closedMs < entryMs
    ) {
      addRecordToBuckets(buckets, closedEvents[eventIndex]);
      eventIndex += 1;
    }
    const snapshot = evaluateFromBuckets(row.trade, buckets, { snapshot: false });
    if (row.trade.id != null) snapshots.set(String(row.trade.id), snapshot);
  }
  return snapshots;
}
