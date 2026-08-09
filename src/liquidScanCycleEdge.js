import {
  LIQUID_SCAN_STAGE_3_VERSION,
  evaluateLiquidScanStage3,
  liquidScanTargetKind,
} from './liquidScanEvalRule.js';

export const LIQUID_SCAN_CYCLE_EDGE_VERSION = 'LIQUID_CYCLE_EDGE_V1_20260726';

const ELIGIBLE_STAGE_3_TIERS = new Set(['GOOD', 'GOOD_PLUS']);
const RECENT_EPISODES = 8;
const PULSE_EPISODES = 4;
const RECOVERY_EPISODES = 3;
const EPISODE_MS = 15 * 60 * 1000;
const MIN_CLOSED = 8;
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

function normalizedStage3(trade = {}) {
  const evaluated = evaluateLiquidScanStage3(trade);
  const useStored = String(trade.liquidStage3Version ?? '').startsWith(
    LIQUID_SCAN_STAGE_3_VERSION,
  );
  return {
    tier: String(
      useStored ? trade.liquidStage3Tier : evaluated.tier,
    ).toUpperCase(),
    code: String(
      useStored ? trade.liquidStage3Code : evaluated.code,
    ).toUpperCase(),
    targetKind: String(
      useStored
        ? trade.liquidStage2TargetKind
          ?? evaluated.targetKind
        : evaluated.targetKind,
    ).toUpperCase(),
  };
}

function oneSidedBucket(trade = {}) {
  const cluster = trade.entryPlan?.killZoneCluster ?? trade.killZoneCluster ?? {};
  const value = finiteNumber(cluster.oneSidedPct);
  if (value == null) return 'ONE_SIDE_NO_DATA';
  if (value >= 90) return 'ONE_SIDE_90_PLUS';
  if (value >= 75) return 'ONE_SIDE_75_89';
  if (value >= 50) return 'ONE_SIDE_50_74';
  return 'ONE_SIDE_LT_50';
}

export function liquidScanCycleFamily(trade = {}) {
  const health = trade.btcHealth ?? {};
  const direction = String(
    health.btcTrendDir
      ?? trade.btcTrendDir
      ?? '',
  ).trim().toUpperCase();
  const emaTrend = String(health.emaTrend1h ?? '').trim().toUpperCase();
  const regime = String(health.marketRegime ?? health.regime ?? '')
    .trim()
    .toUpperCase();

  if (
    direction === 'DOWN'
    && emaTrend === 'BELOW'
    && ['DOWN', 'WEAK_DOWN', 'SIDEWAY_DOWN'].includes(regime)
  ) {
    return 'BTC_DOWN_CONFIRMED';
  }
  if (
    direction === 'UP'
    && emaTrend === 'ABOVE'
    && ['UP', 'WEAK_UP', 'SIDEWAY_UP'].includes(regime)
  ) {
    return 'BTC_UP_CONFIRMED';
  }
  return 'BTC_TRANSITION_CHOP';
}

export function liquidScanCycleCohorts(trade = {}) {
  const stage3 = normalizedStage3(trade);
  const eligible = ELIGIBLE_STAGE_3_TIERS.has(stage3.tier);
  const side = String(trade.side ?? '').toUpperCase() || 'SIDE_NO_DATA';
  const targetKind = stage3.targetKind || liquidScanTargetKind(trade);
  const cycleFamily = liquidScanCycleFamily(trade);
  const structureBucket = stage3.code === 'GOOD_LONG_LOCAL_WEAK'
    ? oneSidedBucket(trade)
    : 'STRUCTURE_ANY';
  const parts = {
    side,
    tier: stage3.tier,
    code: stage3.code || stage3.tier,
    targetKind,
    cycleFamily,
    structureBucket,
  };
  const keys = [
    `EXACT | ${side} | ${parts.tier} | ${parts.code} | ${targetKind} | ${cycleFamily} | ${structureBucket}`,
    `CYCLE | ${side} | ${parts.tier} | ${parts.code} | ${targetKind} | ${cycleFamily}`,
    `STRUCTURE | ${side} | ${parts.tier} | ${parts.code} | ${targetKind} | ${structureBucket}`,
    `BRANCH | ${side} | ${parts.tier} | ${parts.code} | ${targetKind}`,
    `TIER | ${side} | ${parts.tier}`,
  ];
  return {
    eligible,
    ...parts,
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
  return {
    id: trade.id ?? null,
    entryMs: tradeEntryMs(trade),
    closedMs: tradeClosedMs(trade),
    day: tradeDay(trade),
    netRoe: bounded(netRoeOf(trade), -25, 25),
    cohorts: liquidScanCycleCohorts(trade),
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
        roeSum: 0,
      });
    }
    const episode = episodes.get(key);
    episode.closed += 1;
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
  let grossWin = 0;
  let grossLoss = 0;
  let roeSum = 0;
  let closed = 0;
  for (const episode of episodes) {
    const value = finiteNumber(episode.netRoe, 0);
    roeSum += value;
    closed += Number(episode.closed ?? 0);
    if (value > 0) grossWin += value;
    else if (value < 0) grossLoss += Math.abs(value);
    days.set(episode.day, (days.get(episode.day) ?? 0) + value);
  }
  const positiveDays = [...days.values()].filter((value) => value > 0).length;
  const negativeDays = [...days.values()].filter((value) => value < 0).length;
  const profitFactor = grossLoss > 0
    ? grossWin / grossLoss
    : grossWin > 0
      ? 9.99
      : 0;
  return {
    closed,
    episodes: episodes.length,
    days: days.size,
    positiveDays,
    negativeDays,
    avgNetRoe: episodes.length > 0 ? roeSum / episodes.length : 0,
    profitFactor,
  };
}

function evidenceFromRecords(records = []) {
  const episodes = episodeRows(records);
  const recentEpisodes = episodes.slice(-RECENT_EPISODES);
  const pulseEpisodes = recentEpisodes.slice(-PULSE_EPISODES);
  const priorEpisodes = episodes.slice(0, Math.max(0, episodes.length - RECENT_EPISODES));
  const recoveryEpisodes = recentEpisodes.slice(-RECOVERY_EPISODES);
  return {
    all: metricsFromEpisodes(episodes),
    recent: metricsFromEpisodes(recentEpisodes),
    pulse: metricsFromEpisodes(pulseEpisodes),
    prior: metricsFromEpisodes(priorEpisodes),
    recovery: metricsFromEpisodes(recoveryEpisodes),
  };
}

function enoughEvidence(metrics = {}) {
  return Number(metrics.closed ?? 0) >= MIN_CLOSED
    && Number(metrics.episodes ?? 0) >= MIN_EPISODES
    && Number(metrics.days ?? 0) >= MIN_DAYS;
}

function positiveEdge(metrics = {}) {
  return Number(metrics.avgNetRoe ?? 0) > 0
    && Number(metrics.profitFactor ?? 0) >= 1.05
    && Number(metrics.positiveDays ?? 0) >= Number(metrics.negativeDays ?? 0);
}

function negativeEdge(metrics = {}) {
  return Number(metrics.avgNetRoe ?? 0) <= -0.25
    || Number(metrics.profitFactor ?? 0) < 0.9;
}

function compactMetrics(metrics = {}) {
  return {
    closed: Math.max(0, Math.round(finiteNumber(metrics.closed, 0))),
    episodes: Math.max(0, Math.round(finiteNumber(metrics.episodes, 0))),
    days: Math.max(0, Math.round(finiteNumber(metrics.days, 0))),
    positiveDays: Math.max(0, Math.round(finiteNumber(metrics.positiveDays, 0))),
    negativeDays: Math.max(0, Math.round(finiteNumber(metrics.negativeDays, 0))),
    avgNetRoe: +finiteNumber(metrics.avgNetRoe, 0).toFixed(3),
    profitFactor: +finiteNumber(metrics.profitFactor, 0).toFixed(3),
  };
}

function evaluateEvidence({
  trade,
  cohort,
  selectedKey,
  records,
  snapshot,
}) {
  if (!cohort.eligible) {
    return {
      tier: 'UNRATED',
      code: 'LIQ_CYCLE_UNRATED',
      label: null,
      reason: 'Stage 4 chỉ đánh giá các nhãn Stage 3 GOOD/GOOD+.',
      version: LIQUID_SCAN_CYCLE_EDGE_VERSION,
      basis: snapshot ? 'SNAPSHOT' : 'BACKFILL_CAUSAL',
      observationOnly: true,
      affectsEntry: false,
      affectsMargin: false,
      affectsSl: false,
      affectsTp: false,
      cohortKey: cohort.exactKey,
      selectedCohortKey: null,
      cycleFamily: cohort.cycleFamily,
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
  const recentSufficient = recent.episodes >= 4 && recent.closed >= 4;
  const priorPositive = enoughEvidence(prior)
    ? positiveEdge(prior)
    : positiveEdge(all);
  const recentPositive = recentSufficient && positiveEdge(recent);
  const recentNegative = recentSufficient && negativeEdge(recent);
  const pulseSufficient = pulse.episodes >= 3 && pulse.closed >= 3;
  const pulseNegative = pulseSufficient && negativeEdge(pulse);
  const recoveryPositive = recovery.episodes >= RECOVERY_EPISODES
    && recovery.avgNetRoe > 0.25
    && recovery.profitFactor >= 1.15;

  let tier = 'NEW';
  let code = 'LIQ_CYCLE_NEW';
  let reason = `Đang gom mẫu causal: ${all.closed} đóng / ${all.episodes} episode / ${all.days} ngày.`;

  if (sufficient && (recentNegative || pulseNegative) && recoveryPositive) {
    tier = 'RECOVERY';
    code = 'LIQ_CYCLE_RECOVERY';
    reason = `Edge từng suy giảm nhưng ${recovery.episodes} episode mới nhất đang phục hồi; giữ quan sát, chưa xác nhận ACTIVE.`;
  } else if (sufficient && (recentNegative || pulseNegative)) {
    tier = 'FADED';
    code = 'LIQ_CYCLE_FADED';
    reason = priorPositive
      ? 'Edge lịch sử dương nhưng cửa sổ walk-forward gần nhất đã suy giảm.'
      : 'Cửa sổ walk-forward gần nhất đang âm; chưa dùng lịch sử cũ để gọi ACTIVE.';
  } else if (sufficient && recentPositive && (priorPositive || positiveEdge(all))) {
    tier = 'ACTIVE';
    code = 'LIQ_CYCLE_ACTIVE';
    reason = 'Edge lịch sử và cửa sổ walk-forward gần nhất cùng dương.';
  } else if (sufficient && recentPositive) {
    tier = 'RECOVERY';
    code = 'LIQ_CYCLE_RECOVERY';
    reason = 'Dữ liệu gần nhất dương nhưng nền lịch sử chưa đủ ổn định; đánh dấu phục hồi.';
  } else if (sufficient && positiveEdge(all)) {
    tier = 'ACTIVE';
    code = 'LIQ_CYCLE_ACTIVE';
    reason = 'Cohort causal đủ ngày/episode và edge tổng vẫn dương.';
  } else if (sufficient && negativeEdge(all)) {
    tier = 'FADED';
    code = 'LIQ_CYCLE_FADED';
    reason = 'Cohort causal đủ mẫu nhưng edge tổng đang âm.';
  }

  const basis = snapshot ? 'SNAPSHOT' : 'BACKFILL_CAUSAL';
  return {
    tier,
    code,
    label: `EDGE ${tier}`,
    reason: `${reason} PF ${all.profitFactor.toFixed(2)}, AvgNetROE ${all.avgNetRoe >= 0 ? '+' : ''}${all.avgNetRoe.toFixed(2)}%; recent PF ${recent.profitFactor.toFixed(2)}, Avg ${recent.avgNetRoe >= 0 ? '+' : ''}${recent.avgNetRoe.toFixed(2)}%; pulse PF ${pulse.profitFactor.toFixed(2)}, Avg ${pulse.avgNetRoe >= 0 ? '+' : ''}${pulse.avgNetRoe.toFixed(2)}%.`,
    version: LIQUID_SCAN_CYCLE_EDGE_VERSION,
    basis,
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    affectsSl: false,
    affectsTp: false,
    cohortKey: cohort.exactKey,
    selectedCohortKey: selectedKey,
    cycleFamily: cohort.cycleFamily,
    side: cohort.side,
    stage3Tier: cohort.tier,
    stage3Code: cohort.code,
    targetKind: cohort.targetKind,
    structureBucket: cohort.structureBucket,
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
    const metrics = evidenceFromRecords(records).all;
    if (enoughEvidence(metrics)) return { key, records };
  }
  return fallback;
}

function evaluateFromBuckets(trade, buckets, { snapshot = false } = {}) {
  const cohort = liquidScanCycleCohorts(trade);
  const selected = selectBucket(cohort, buckets);
  return evaluateEvidence({
    trade,
    cohort,
    selectedKey: selected.key,
    records: selected.records,
    snapshot,
  });
}

export function evaluateLiquidScanCycleEdgeSnapshot(
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

export function deriveLiquidScanCycleEdgeSnapshots(trades = []) {
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
