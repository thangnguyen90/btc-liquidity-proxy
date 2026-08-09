import { edgeShortBtcWaveState } from './edgeShortWave2b.js';

export const PUMP_OBSERVATION_VERSION = 'pump-source-wave-observe-v1';
export const PUMP_OBSERVATION_TIME_ZONE = 'Asia/Bangkok';

const SOURCE_ORDER = ['PUMP_NATIVE', 'EMA'];
const L1_ORDER = ['PRIME', 'GOOD', 'WATCH', 'RISK', 'NO_DATA'];
const TIER_ORDER = ['A', 'B', 'WATCH', 'BLOCK'];
const WAVE_ORDER = [
  'SHORT_TRANSITION',
  'SHORT_ALIGNED_ACTIVE',
  'SHORT_ALIGNED_EXHAUSTED',
  'SHORT_COUNTER_ACTIVE',
  'SHORT_COUNTER_EXHAUSTED',
  'LONG_TRANSITION',
  'LONG_ALIGNED_ACTIVE',
  'LONG_ALIGNED_EXHAUSTED',
  'LONG_COUNTER_ACTIVE',
  'LONG_COUNTER_EXHAUSTED',
  'WAVE_NO_DATA',
];

const L1_META = {
  PRIME: { label: 'PRIME', tone: 'GOOD' },
  GOOD: { label: 'GOOD', tone: 'GOOD' },
  WATCH: { label: 'WATCH', tone: 'WATCH' },
  RISK: { label: 'RISK', tone: 'RISK' },
  NO_DATA: { label: 'NO DATA', tone: 'NO_DATA' },
};

const WAVE_META = {
  SHORT_TRANSITION: { label: 'SHORT · BTC TRANSITION', tone: 'WATCH' },
  SHORT_ALIGNED_ACTIVE: { label: 'SHORT · BTC DRIVE ALIGNED', tone: 'GOOD' },
  SHORT_ALIGNED_EXHAUSTED: { label: 'SHORT · BTC EXHAUSTED ALIGNED', tone: 'WATCH' },
  SHORT_COUNTER_ACTIVE: { label: 'SHORT · BTC DRIVE COUNTER', tone: 'RISK' },
  SHORT_COUNTER_EXHAUSTED: { label: 'SHORT · BTC EXHAUSTED COUNTER', tone: 'WATCH' },
  LONG_TRANSITION: { label: 'LONG · BTC TRANSITION', tone: 'WATCH' },
  LONG_ALIGNED_ACTIVE: { label: 'LONG · BTC DRIVE ALIGNED', tone: 'GOOD' },
  LONG_ALIGNED_EXHAUSTED: { label: 'LONG · BTC EXHAUSTED ALIGNED', tone: 'WATCH' },
  LONG_COUNTER_ACTIVE: { label: 'LONG · BTC DRIVE COUNTER', tone: 'RISK' },
  LONG_COUNTER_EXHAUSTED: { label: 'LONG · BTC EXHAUSTED COUNTER', tone: 'WATCH' },
  WAVE_NO_DATA: { label: 'BTC WAVE · NO DATA', tone: 'NO_DATA' },
};

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value, fallback = 'NO_DATA') {
  const text = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return text || fallback;
}

function entryAt(trade = {}) {
  return Date.parse(trade.openedAt ?? trade.createdAt ?? '') || 0;
}

function bangkokDayStart(value) {
  const at = Number(value);
  if (!Number.isFinite(at) || at <= 0) return 0;
  const shifted = new Date(at + 7 * 60 * 60 * 1000);
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - 7 * 60 * 60 * 1000;
}

function bangkokDayKey(value) {
  const start = bangkokDayStart(value);
  return start > 0
    ? new Date(start + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : 'NO_DAY';
}

export function pumpObservationSourceFamily(trade = {}) {
  return String(trade.source ?? '').startsWith('emasq-') ? 'EMA' : 'PUMP_NATIVE';
}

function setupOf(trade = {}) {
  if (pumpObservationSourceFamily(trade) === 'EMA') {
    const source = String(trade.source ?? '').toLowerCase();
    if (source.includes('pre_breakout')) return 'PRE_BREAKOUT';
    if (source.includes('pre_breakdown')) return 'PRE_BREAKDOWN';
    if (source.includes('squeeze_short')) return 'SQUEEZE_SHORT';
    if (source.includes('squeeze')) return 'SQUEEZE';
    if (source.includes('breakdown')) return 'BREAKDOWN';
    if (source.includes('breakout')) return 'BREAKOUT';
    if (source.includes('runner')) return 'RUNNER';
    if (source.includes('br_like_short')) return 'BR_LIKE_SHORT';
    if (source.includes('br_like')) return 'BR_LIKE';
  }
  return normalize(
    trade.pumpSignalType
      ?? trade.signalType
      ?? trade.type
      ?? String(trade.source ?? '').replace(/^pump-\d+(?:-|$)/i, ''),
    'OTHER',
  );
}

function timeframeOf(trade = {}) {
  const sourceTf = String(trade.source ?? '').match(/^(?:emasq-)?(\d+[mh])-/i)?.[1];
  return normalize(
    trade.pumpSignalTimeframe
      ?? trade.interval
      ?? trade.timeframe
      ?? trade.pumpSignalFactors?.timeframe
      ?? sourceTf,
    'NO_TF',
  );
}

function sideOf(trade = {}) {
  const side = normalize(trade.side ?? trade.action, 'NO_SIDE');
  if (side.includes('SHORT')) return 'SHORT';
  if (side.includes('LONG')) return 'LONG';
  return 'NO_SIDE';
}

function relationOf(trade = {}) {
  const corr = finite(trade.btcCorr);
  if (corr == null) return 'REL_NO_DATA';
  if (corr < 0.3) return 'DOC_LAP';
  if (corr < 0.5) return 'THEO_YEU';
  const direction = normalize(
    trade.btcHealth?.btcTrendDir ?? trade.btcTrendDir,
    'NO_DATA',
  );
  const side = sideOf(trade);
  if (!['UP', 'DOWN'].includes(direction) || !['LONG', 'SHORT'].includes(side)) {
    return 'REL_NO_DATA';
  }
  const aligned = (side === 'LONG' && direction === 'UP')
    || (side === 'SHORT' && direction === 'DOWN');
  return aligned ? 'THUAN_BTC' : 'NGUOC_BTC';
}

function emaTierOf(trade = {}) {
  const tier = normalize(
    trade.pumpObsSourceTier
      ?? trade.emaLayer3Tier
      ?? trade.emaComboLayersSnapshot?.layer3?.tier
      ?? trade.sideCandleTier,
    'WATCH',
  );
  if (tier === 'GOOD_PLUS') return 'A';
  if (tier === 'GOOD') return 'B';
  if (tier === 'RISK' || tier === 'BLOCK') return 'BLOCK';
  return TIER_ORDER.includes(tier) ? tier : 'WATCH';
}

function nativeTierOf(trade = {}) {
  const saved = normalize(trade.pumpObsSourceTier, '');
  if (TIER_ORDER.includes(saved)) return saved;
  const canonical = normalize(trade.pumpCanonicalCandidateTier, '');
  if (['A', 'B', 'BLOCK'].includes(canonical)) return canonical;
  const nativeEval = normalize(trade.pumpEvalTier, '');
  if (['A', 'B', 'BLOCK'].includes(nativeEval)) return nativeEval;
  return 'WATCH';
}

function sourceTierOf(trade = {}) {
  return pumpObservationSourceFamily(trade) === 'EMA'
    ? emaTierOf(trade)
    : nativeTierOf(trade);
}

function sourceTierBasisOf(trade = {}) {
  if (trade.pumpObsSourceTierBasis) return String(trade.pumpObsSourceTierBasis);
  if (pumpObservationSourceFamily(trade) === 'EMA') return 'EMA_COMBO_L3';
  const canonical = normalize(trade.pumpCanonicalCandidateTier, '');
  if (['A', 'B', 'BLOCK'].includes(canonical)) return 'PUMP_CANONICAL_CANDIDATE';
  const nativeEval = normalize(trade.pumpEvalTier, '');
  if (['A', 'B', 'BLOCK'].includes(nativeEval)) return 'PUMP_EVAL_NATIVE';
  return 'PUMP_TIER_NO_DATA';
}

function waveSnapshotOf(trade = {}) {
  const wave = edgeShortBtcWaveState(trade);
  const side = sideOf(trade);
  if (side === 'NO_SIDE' || wave.state === 'NO_DATA') {
    return {
      key: 'WAVE_NO_DATA',
      meta: WAVE_META.WAVE_NO_DATA,
      wave,
      relation: 'NO_DATA',
    };
  }
  if (wave.state === 'TRANSITION') {
    const key = `${side}_TRANSITION`;
    return { key, meta: WAVE_META[key], wave, relation: 'TRANSITION' };
  }
  const aligned = (side === 'SHORT' && wave.direction === 'DOWN')
    || (side === 'LONG' && wave.direction === 'UP');
  const relation = aligned ? 'ALIGNED' : 'COUNTER';
  const phase = wave.state === 'EXHAUSTED' ? 'EXHAUSTED' : 'ACTIVE';
  const key = `${side}_${relation}_${phase}`;
  return { key, meta: WAVE_META[key] ?? WAVE_META.WAVE_NO_DATA, wave, relation };
}

export function pumpObservationStaticSnapshot(trade = {}, { derived = false } = {}) {
  const sourceFamily = pumpObservationSourceFamily(trade);
  const tier = sourceTierOf(trade);
  const tierBasis = sourceTierBasisOf(trade);
  const wave = waveSnapshotOf(trade);
  const setup = setupOf(trade);
  const side = sideOf(trade);
  const timeframe = timeframeOf(trade);
  const marketRelation = relationOf(trade);
  const pct6h = wave.wave.pct6h == null
    ? '-'
    : `${wave.wave.pct6h >= 0 ? '+' : ''}${wave.wave.pct6h.toFixed(2)}%`;
  return {
    pumpObsSourceFamily: sourceFamily,
    pumpObsSetup: setup,
    pumpObsSide: side,
    pumpObsTimeframe: timeframe,
    pumpObsMarketRelation: marketRelation,
    pumpObsSourceTier: tier,
    pumpObsSourceTierBasis: tierBasis,
    pumpObsTierLabel: `${sourceFamily} · TIER ${tier}`,
    pumpObsWaveKey: wave.key,
    pumpObsWaveLabel: wave.meta.label,
    pumpObsWaveTone: wave.meta.tone,
    pumpObsWaveState: wave.wave.state,
    pumpObsWaveRelation: wave.relation,
    pumpObsBtcDirection: wave.wave.direction || null,
    pumpObsBtcTrendScore: wave.wave.trendScore,
    pumpObsBtcPct6h: wave.wave.pct6h,
    pumpObsBtcRsi1h: wave.wave.rsi1h,
    pumpObsBtcEmaTrend1h: wave.wave.emaTrend1h || null,
    pumpObsBtcMarketRegime: wave.wave.marketRegime || null,
    pumpObsBtcObvTrend: wave.wave.obvTrend || null,
    pumpObsWaveReason:
      `${sourceFamily} · ${side} · ${setup} · tier ${tier} (${tierBasis})`
      + ` · BTC ${wave.wave.direction || 'NO_DATA'} ${wave.wave.state}`
      + ` · EMA1h ${wave.wave.emaTrend1h || '-'} · 6h ${pct6h}`
      + ` · RSI1h ${wave.wave.rsi1h ?? '-'} · OBV ${wave.wave.obvTrend || '-'}`
      + ' · OBSERVE ONLY · no gate/block/entry/size/SL/TP change',
    pumpObsVersion: PUMP_OBSERVATION_VERSION,
    pumpObsObservationOnly: true,
    pumpObsAffectsEntry: false,
    pumpObsAffectsMargin: false,
    pumpObsAffectsSl: false,
    pumpObsAffectsTp: false,
    pumpObsDerived: Boolean(derived),
  };
}

function estimateFee(trade = {}) {
  const saved = finite(trade.estimatedFeeUsdt ?? trade.feeUsdt);
  if (saved != null && saved >= 0) return saved;
  const margin = finite(trade.marginUsdt ?? trade.marginUsd ?? trade.margin, 0);
  const leverage = finite(trade.leverage, 10);
  return margin > 0 && leverage > 0 ? margin * leverage * 2 * 0.0004 : 0;
}

function netResult(trade = {}) {
  const grossPnl = finite(trade.pnl ?? trade.grossPnl, 0);
  const fee = estimateFee(trade);
  const netPnl = grossPnl - fee;
  const margin = finite(trade.marginUsdt ?? trade.marginUsd ?? trade.margin);
  const netRoe = margin != null && margin > 0
    ? netPnl / margin * 100
    : finite(trade.netRoe ?? trade.roe, 0);
  return { netPnl, netRoe };
}

function emptyAccumulator() {
  return {
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    pnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    pnlByDay: new Map(),
  };
}

function addClosed(accumulator, trade = {}) {
  if (String(trade.status ?? '').toUpperCase() !== 'CLOSED') return accumulator;
  const result = netResult(trade);
  accumulator.closed += 1;
  accumulator.pnl += result.netPnl;
  accumulator.roeSum += result.netRoe;
  if (result.netPnl > 0) {
    accumulator.wins += 1;
    accumulator.grossWin += result.netPnl;
  } else if (result.netPnl < 0) {
    accumulator.losses += 1;
    accumulator.grossLoss += Math.abs(result.netPnl);
  } else {
    accumulator.breakeven += 1;
  }
  const day = bangkokDayKey(entryAt(trade));
  accumulator.pnlByDay.set(day, (accumulator.pnlByDay.get(day) ?? 0) + result.netPnl);
  return accumulator;
}

function metricsOf(accumulator = emptyAccumulator()) {
  const decisive = accumulator.wins + accumulator.losses;
  const dayValues = [...accumulator.pnlByDay.values()];
  const positiveDays = dayValues.filter((value) => value > 0).length;
  const profitFactor = accumulator.grossLoss > 0
    ? accumulator.grossWin / accumulator.grossLoss
    : accumulator.grossWin > 0 ? 9.99 : 0;
  return {
    closed: accumulator.closed,
    wins: accumulator.wins,
    losses: accumulator.losses,
    breakeven: accumulator.breakeven,
    pnl: accumulator.pnl,
    wr: decisive > 0 ? accumulator.wins / decisive * 100 : null,
    avgRoe: accumulator.closed > 0 ? accumulator.roeSum / accumulator.closed : null,
    profitFactor,
    positiveDays,
    totalDays: dayValues.length,
    positiveDayRate: dayValues.length > 0 ? positiveDays / dayValues.length : 0,
  };
}

function l1Group(staticSnapshot = {}) {
  return [
    staticSnapshot.pumpObsSourceFamily,
    staticSnapshot.pumpObsSetup,
    staticSnapshot.pumpObsSide,
    staticSnapshot.pumpObsTimeframe,
    staticSnapshot.pumpObsMarketRelation,
  ].join(' | ');
}

function bestGroup(staticSnapshot = {}) {
  return [
    staticSnapshot.pumpObsSourceFamily,
    staticSnapshot.pumpObsSourceTier,
    staticSnapshot.pumpObsSetup,
    staticSnapshot.pumpObsSide,
  ].join(' | ');
}

function l1Verdict(metrics, relation, previousTier = null) {
  if (relation === 'REL_NO_DATA' || metrics.closed < 10) return 'NO_DATA';
  if (metrics.closed < 30) return 'WATCH';
  if (
    metrics.pnl > 0
    && metrics.avgRoe >= (previousTier === 'PRIME' ? 1.5 : 2.5)
    && metrics.wr >= (previousTier === 'PRIME' ? 65 : 70)
  ) return 'PRIME';
  if (
    metrics.pnl > 0
    && metrics.avgRoe >= (previousTier === 'GOOD' ? 0.25 : 0.75)
  ) return 'GOOD';
  if (
    metrics.pnl < 0
    && metrics.avgRoe <= (previousTier === 'RISK' ? 0 : -0.75)
  ) return 'RISK';
  return 'WATCH';
}

function l1Snapshot(staticSnapshot, accumulator, dayStartAt, previousTier = null, derived = true) {
  const metrics = metricsOf(accumulator);
  const tier = l1Verdict(metrics, staticSnapshot.pumpObsMarketRelation, previousTier);
  const meta = L1_META[tier];
  return {
    pumpObsL1Tier: tier,
    pumpObsL1Label: `${staticSnapshot.pumpObsSourceFamily} · ${meta.label}`,
    pumpObsL1Tone: meta.tone,
    pumpObsL1GroupKey: l1Group(staticSnapshot),
    pumpObsL1SamplesBeforeDay: metrics.closed,
    pumpObsL1WrBeforeDay: metrics.wr,
    pumpObsL1PnlBeforeDay: metrics.pnl,
    pumpObsL1AvgRoeBeforeDay: metrics.avgRoe,
    pumpObsL1FrozenDay: bangkokDayKey(dayStartAt),
    pumpObsL1PreviousTier: previousTier ?? 'NONE',
    pumpObsL1Reason:
      `${l1Group(staticSnapshot)} · frozen ${bangkokDayKey(dayStartAt)} Asia/Bangkok`
      + ` · prior closed ${metrics.closed} · WR ${metrics.wr == null ? '-' : `${metrics.wr.toFixed(1)}%`}`
      + ` · net PnL ${metrics.pnl.toFixed(3)} · AvgNetROE ${metrics.avgRoe == null ? '-' : `${metrics.avgRoe.toFixed(2)}%`}`
      + ' · OBSERVE ONLY · no gate/block/entry/size/SL/TP change',
    pumpObsL1Derived: Boolean(derived),
  };
}

function bestSnapshot(staticSnapshot, accumulator, dayStartAt, derived = true) {
  const metrics = metricsOf(accumulator);
  const eligibleTier = ['A', 'B'].includes(staticSnapshot.pumpObsSourceTier);
  const selected = eligibleTier
    && metrics.closed >= 10
    && metrics.pnl > 0
    && Number(metrics.avgRoe ?? 0) >= 1
    && metrics.profitFactor >= 1.2
    && metrics.positiveDayRate >= 0.5;
  return {
    pumpObsBestEligible: eligibleTier,
    pumpObsBestSelected: selected,
    pumpObsBestLabel: !eligibleTier
      ? 'PUMP BEST · N/A'
      : selected ? 'PUMP BEST' : 'PUMP A/B REMAINING',
    pumpObsBestTone: !eligibleTier ? 'NO_DATA' : selected ? 'GOOD' : 'WATCH',
    pumpObsBestGroupKey: bestGroup(staticSnapshot),
    pumpObsBestSamplesBeforeDay: metrics.closed,
    pumpObsBestWrBeforeDay: metrics.wr,
    pumpObsBestPnlBeforeDay: metrics.pnl,
    pumpObsBestAvgRoeBeforeDay: metrics.avgRoe,
    pumpObsBestProfitFactorBeforeDay: metrics.profitFactor,
    pumpObsBestPositiveDaysBeforeDay: metrics.positiveDays,
    pumpObsBestTotalDaysBeforeDay: metrics.totalDays,
    pumpObsBestFrozenDay: bangkokDayKey(dayStartAt),
    pumpObsBestReason:
      `${bestGroup(staticSnapshot)} · frozen ${bangkokDayKey(dayStartAt)} Asia/Bangkok`
      + ` · prior closed ${metrics.closed} · net PnL ${metrics.pnl.toFixed(3)}`
      + ` · AvgNetROE ${metrics.avgRoe == null ? '-' : `${metrics.avgRoe.toFixed(2)}%`}`
      + ` · PF ${metrics.profitFactor.toFixed(2)} · positive days ${metrics.positiveDays}/${metrics.totalDays}`
      + ` · ${selected ? 'SELECTED' : 'NOT SELECTED'}`
      + ' · OBSERVE ONLY · no gate/block/entry/size/SL/TP change',
    pumpObsBestDerived: Boolean(derived),
  };
}

function buildStatsMapsBefore(trades = [], cutoffAt = 0) {
  const l1Stats = new Map();
  const bestStats = new Map();
  for (const trade of trades) {
    const closedAt = Date.parse(trade.closedAt ?? '') || 0;
    if (!closedAt || closedAt > cutoffAt) continue;
    const staticSnapshot = pumpObservationStaticSnapshot(trade, { derived: true });
    const l1Key = l1Group(staticSnapshot);
    const bestKey = bestGroup(staticSnapshot);
    addClosed(l1Stats.get(l1Key) ?? (() => {
      const value = emptyAccumulator();
      l1Stats.set(l1Key, value);
      return value;
    })(), trade);
    addClosed(bestStats.get(bestKey) ?? (() => {
      const value = emptyAccumulator();
      bestStats.set(bestKey, value);
      return value;
    })(), trade);
  }
  return { l1Stats, bestStats };
}

export function buildPumpObservationEntryModel(trades = [], at = Date.now()) {
  const dayStartAt = bangkokDayStart(Number(at) || Date.now());
  const { l1Stats, bestStats } = buildStatsMapsBefore(trades, dayStartAt);
  return {
    version: PUMP_OBSERVATION_VERSION,
    dayStartAt,
    day: bangkokDayKey(dayStartAt),
    l1Stats,
    bestStats,
  };
}

export function pumpObservationSnapshotForEntry(
  trade = {},
  model = buildPumpObservationEntryModel([], entryAt(trade) || Date.now()),
) {
  const staticSnapshot = pumpObservationStaticSnapshot(trade, { derived: false });
  return {
    ...staticSnapshot,
    ...l1Snapshot(
      staticSnapshot,
      model.l1Stats?.get(l1Group(staticSnapshot)) ?? emptyAccumulator(),
      model.dayStartAt,
      null,
      false,
    ),
    ...bestSnapshot(
      staticSnapshot,
      model.bestStats?.get(bestGroup(staticSnapshot)) ?? emptyAccumulator(),
      model.dayStartAt,
      false,
    ),
  };
}

export function buildPumpObservationSnapshotMap(trades = []) {
  const entries = trades
    .map((trade, index) => ({
      trade,
      index,
      at: entryAt(trade),
      dayStartAt: bangkokDayStart(entryAt(trade)),
    }))
    .filter((entry) => entry.at > 0)
    .sort((left, right) => left.dayStartAt - right.dayStartAt || left.at - right.at);
  const closeEvents = trades
    .map((trade) => ({ trade, closedAt: Date.parse(trade.closedAt ?? '') || 0 }))
    .filter((event) => event.closedAt > 0)
    .sort((left, right) => left.closedAt - right.closedAt);
  const l1Stats = new Map();
  const bestStats = new Map();
  const previousL1Tier = new Map();
  const snapshots = new Map();
  let closeIndex = 0;
  let activeDayStartAt = null;
  let l1DaySnapshots = new Map();
  let bestDaySnapshots = new Map();

  for (const entry of entries) {
    if (entry.dayStartAt !== activeDayStartAt) {
      activeDayStartAt = entry.dayStartAt;
      l1DaySnapshots = new Map();
      bestDaySnapshots = new Map();
      while (closeIndex < closeEvents.length && closeEvents[closeIndex].closedAt <= activeDayStartAt) {
        const closedTrade = closeEvents[closeIndex].trade;
        const staticSnapshot = pumpObservationStaticSnapshot(closedTrade, { derived: true });
        const l1Key = l1Group(staticSnapshot);
        const bestKey = bestGroup(staticSnapshot);
        if (!l1Stats.has(l1Key)) l1Stats.set(l1Key, emptyAccumulator());
        if (!bestStats.has(bestKey)) bestStats.set(bestKey, emptyAccumulator());
        addClosed(l1Stats.get(l1Key), closedTrade);
        addClosed(bestStats.get(bestKey), closedTrade);
        closeIndex += 1;
      }
    }
    const staticSnapshot = pumpObservationStaticSnapshot(entry.trade, { derived: true });
    const l1Key = l1Group(staticSnapshot);
    const bestKey = bestGroup(staticSnapshot);
    if (!l1DaySnapshots.has(l1Key)) {
      const snapshot = l1Snapshot(
        staticSnapshot,
        l1Stats.get(l1Key) ?? emptyAccumulator(),
        activeDayStartAt,
        previousL1Tier.get(l1Key) ?? null,
        true,
      );
      l1DaySnapshots.set(l1Key, snapshot);
      previousL1Tier.set(l1Key, snapshot.pumpObsL1Tier);
    }
    if (!bestDaySnapshots.has(bestKey)) {
      bestDaySnapshots.set(
        bestKey,
        bestSnapshot(
          staticSnapshot,
          bestStats.get(bestKey) ?? emptyAccumulator(),
          activeDayStartAt,
          true,
        ),
      );
    }
    const savedCurrent = entry.trade.pumpObsVersion === PUMP_OBSERVATION_VERSION
      && entry.trade.pumpObsL1FrozenDay === bangkokDayKey(activeDayStartAt)
      && entry.trade.pumpObsBestFrozenDay === bangkokDayKey(activeDayStartAt);
    snapshots.set(entry.trade.id ?? `index:${entry.index}`, savedCurrent
      ? entry.trade
      : {
          ...staticSnapshot,
          ...l1DaySnapshots.get(l1Key),
          ...bestDaySnapshots.get(bestKey),
        });
  }
  return snapshots;
}

export function decoratePumpObservationTrades(trades = [], snapshots = new Map()) {
  return trades.map((trade, index) => {
    const storedSnapshot = trade.pumpObsVersion === PUMP_OBSERVATION_VERSION
      && trade.pumpObsL1Tier
      && trade.pumpObsBestLabel
      ? trade
      : null;
    const snapshot = snapshots.get(trade.id ?? `index:${index}`)
      ?? storedSnapshot
      ?? pumpObservationStaticSnapshot(trade, { derived: true });
    return { ...trade, ...snapshot };
  });
}

function emptyStatRow({ key, label, tone, sourceFamily }) {
  return {
    key,
    label,
    tone,
    sourceFamily,
    total: 0,
    active: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    closedPnl: 0,
    activePnl: 0,
    roeTotal: 0,
    grossWin: 0,
    grossLoss: 0,
    pnlByDay: new Map(),
  };
}

function statRows(trades, specs) {
  const rows = new Map(specs.map((spec) => [spec.key, emptyStatRow(spec)]));
  for (const trade of trades) {
    const spec = specs.find((candidate) => candidate.match(trade));
    if (!spec) continue;
    const row = rows.get(spec.key);
    const result = netResult(trade);
    row.total += 1;
    if (String(trade.status ?? '').toUpperCase() !== 'CLOSED') {
      row.active += 1;
      row.activePnl += result.netPnl;
      continue;
    }
    row.closed += 1;
    row.closedPnl += result.netPnl;
    row.roeTotal += result.netRoe;
    if (result.netPnl > 0) {
      row.wins += 1;
      row.grossWin += result.netPnl;
    } else if (result.netPnl < 0) {
      row.losses += 1;
      row.grossLoss += Math.abs(result.netPnl);
    } else {
      row.breakeven += 1;
    }
    const day = bangkokDayKey(entryAt(trade));
    row.pnlByDay.set(day, (row.pnlByDay.get(day) ?? 0) + result.netPnl);
  }
  return specs
    .map((spec) => rows.get(spec.key))
    .filter((row) => row.total > 0)
    .map((row) => {
      const decisive = row.wins + row.losses;
      const days = [...row.pnlByDay.values()];
      const profitFactor = row.grossLoss > 0
        ? row.grossWin / row.grossLoss
        : row.grossWin > 0 ? 9.99 : 0;
      return {
        key: row.key,
        label: row.label,
        tone: row.tone,
        sourceFamily: row.sourceFamily,
        total: row.total,
        active: row.active,
        closed: row.closed,
        wins: row.wins,
        losses: row.losses,
        breakeven: row.breakeven,
        wr: decisive > 0 ? +(row.wins / decisive * 100).toFixed(1) : null,
        avgRoe: row.closed > 0 ? +(row.roeTotal / row.closed).toFixed(2) : null,
        profitFactor: +profitFactor.toFixed(2),
        closedPnl: +row.closedPnl.toFixed(4),
        activePnl: +row.activePnl.toFixed(4),
        totalPnl: +(row.closedPnl + row.activePnl).toFixed(4),
        positiveDays: days.filter((value) => value > 0).length,
        negativeDays: days.filter((value) => value < 0).length,
        totalDays: days.length,
      };
    });
}

export function buildPumpObservationStats(trades = []) {
  const l1Specs = SOURCE_ORDER.flatMap((sourceFamily) => L1_ORDER.map((tier) => ({
    key: `${sourceFamily}|${tier}`,
    label: `${sourceFamily} · ${L1_META[tier].label}`,
    tone: L1_META[tier].tone,
    sourceFamily,
    match: (trade) => trade.pumpObsSourceFamily === sourceFamily
      && normalize(trade.pumpObsL1Tier, 'NO_DATA') === tier,
  })));
  const l2Specs = SOURCE_ORDER.flatMap((sourceFamily) => TIER_ORDER.map((tier) => ({
    key: `${sourceFamily}|${tier}`,
    label: `${sourceFamily} · TIER ${tier}`,
    tone: tier === 'A' ? 'GOOD' : tier === 'B' || tier === 'WATCH' ? 'WATCH' : 'RISK',
    sourceFamily,
    match: (trade) => trade.pumpObsSourceFamily === sourceFamily
      && normalize(trade.pumpObsSourceTier, 'WATCH') === tier,
  })));
  const l2bSpecs = SOURCE_ORDER.flatMap((sourceFamily) => WAVE_ORDER.map((waveKey) => ({
    key: `${sourceFamily}|${waveKey}`,
    label: `${sourceFamily} · ${WAVE_META[waveKey].label}`,
    tone: WAVE_META[waveKey].tone,
    sourceFamily,
    match: (trade) => trade.pumpObsSourceFamily === sourceFamily
      && normalize(trade.pumpObsWaveKey, 'WAVE_NO_DATA') === waveKey,
  })));
  const l2cSpecs = SOURCE_ORDER.flatMap((sourceFamily) => ['A', 'B'].flatMap((tier) => (
    WAVE_ORDER.map((waveKey) => ({
      key: `${sourceFamily}|${tier}|${waveKey}`,
      label: `${sourceFamily} · TIER ${tier} × ${WAVE_META[waveKey].label}`,
      tone: WAVE_META[waveKey].tone,
      sourceFamily,
      match: (trade) => trade.pumpObsSourceFamily === sourceFamily
        && normalize(trade.pumpObsSourceTier, 'WATCH') === tier
        && normalize(trade.pumpObsWaveKey, 'WAVE_NO_DATA') === waveKey,
    }))
  )));
  const l3Specs = SOURCE_ORDER.flatMap((sourceFamily) => [
    {
      key: `${sourceFamily}|BEST`,
      label: `${sourceFamily} · PUMP BEST`,
      tone: 'GOOD',
      sourceFamily,
      match: (trade) => trade.pumpObsSourceFamily === sourceFamily
        && trade.pumpObsBestEligible === true
        && trade.pumpObsBestSelected === true,
    },
    {
      key: `${sourceFamily}|REMAINING`,
      label: `${sourceFamily} · A/B REMAINING`,
      tone: 'WATCH',
      sourceFamily,
      match: (trade) => trade.pumpObsSourceFamily === sourceFamily
        && trade.pumpObsBestEligible === true
        && trade.pumpObsBestSelected !== true,
    },
  ]);
  return {
    version: PUMP_OBSERVATION_VERSION,
    timeZone: PUMP_OBSERVATION_TIME_ZONE,
    pnlBasis: 'NET_GROSS_MINUS_ESTIMATED_ROUND_TRIP_FEE',
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    affectsSl: false,
    affectsTp: false,
    layers: {
      l1: statRows(trades, l1Specs),
      l2: statRows(trades, l2Specs),
      l2b: statRows(trades, l2bSpecs),
      l2c: statRows(trades, l2cSpecs),
      l3: statRows(trades, l3Specs),
    },
  };
}
