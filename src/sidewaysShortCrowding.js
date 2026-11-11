// Offline/reusable closed-candle setup detector. No notification or order execution.
export const SIDEWAYS_SHORT_CROWDING_VERSION = 'SIDEWAYS_ALLSHORT_PREBREAK_V1_20261107';
export const SIDEWAYS_SHORT_CROWDING_RULE = Object.freeze({
  windowsMinutes: Object.freeze([60, 120]),
  maxRangePct: 3, maxNetDriftPct: .8, maxEfficiency: .35,
  maxMedianCandleRangePct: .8, maxBodyInBasePct: 1.5,
  maxLatestBodyPct: .5, maxLatestVolumeX: 1.5,
  minPriorDrop24hPct: 8, maxHeight24hPct: 35,
  minShortPctEach: 60, thresholdOperator: '>', positionMaxAgeMs: 900000,
  maxLowerZoneDistancePct: 3, modelLagMinutes: Object.freeze([5, 10]),
  cooldownMs: 8 * 3600000, requiresBreakdown: false,
  observeOnly: true, affectsOrders: false,
});
const S = 300000;
const num = x => typeof x === 'number' && Number.isFinite(x);
const median = a => {
  const b = a.slice().sort((a, b) => a - b);
  return b.length ? (b[Math.floor((b.length - 1) / 2)] + b[Math.ceil((b.length - 1) / 2)]) / 2 : null;
};

export function shortCrowdingAt(points, at) {
  const r = SIDEWAYS_SHORT_CROWDING_RULE;
  if (!Array.isArray(points) || !num(at)) return {status: 'POSITION_MISSING_OR_STALE'};
  // Never borrow a snapshot first observed after the decision, even if its source timestamp is old.
  const p = points.filter(p => num(p?.observedAt) && p.observedAt <= at)
    .sort((a, b) => a.observedAt - b.observedAt || a.sourceAt - b.sourceAt).at(-1);
  if (!p || !num(p.sourceAt) || p.sourceAt > at || at - p.sourceAt > r.positionMaxAgeMs
      || p.sourceAt > p.observedAt || p.observedAt - p.sourceAt > r.positionMaxAgeMs
      || !Number.isInteger(p.whaleCount) || p.whaleCount < 10
      || ['whaleLong', 'smartLong', 'crowdLong'].some(k => !num(p[k]) || p[k] < 0 || p[k] > 100)) {
    return {status: 'POSITION_MISSING_OR_STALE'};
  }
  if (!['whaleLong', 'smartLong', 'crowdLong'].every(k => 100 - p[k] > r.minShortPctEach)) {
    return {status: 'NOT_ALL_THREE_SHORT_OVER_60'};
  }
  // A later timestamp-conflict annotation has no historical detection time: retain the first
  // observation in the primary replay and report a separate conflict-exclusion sensitivity.
  return {status: 'QUALIFIED', sourceAt: p.sourceAt, observedAt: p.observedAt,
    whaleShortPct: 100 - p.whaleLong, smartShortPct: 100 - p.smartLong,
    crowdShortPct: 100 - p.crowdLong, whaleCount: p.whaleCount,
    laterTimestampConflict: !!p.ambiguous};
}

export function sidewaysBaseAt(bars, i, feature, windowBars = 12) {
  const r = SIDEWAYS_SHORT_CROWDING_RULE;
  if (!Array.isArray(bars) || !Number.isInteger(i) || !r.windowsMinutes.includes(windowBars * 5)) {
    return {status: 'PRICE_HISTORY_MISSING'};
  }
  const a = bars.slice(i - windowBars + 1, i + 1), b = bars[i];
  if (a.length !== windowBars || i < 288 || !b || !feature || feature.at !== b.end
      || !num(feature.high24h) || feature.high24h < b.c
      || !num(feature.heightPct) || feature.heightPct < 0 || feature.heightPct > 100
      || a.some((x, j) => ![x.t, x.end, x.o, x.h, x.l, x.c, x.q].every(num)
        || x.end !== x.t + S || Math.min(x.o, x.l, x.c) <= 0
        || x.h < Math.max(x.o, x.c) || x.l > Math.min(x.o, x.c) || x.q < 0
        || (j > 0 && x.t !== a[j - 1].t + S))) return {status: 'PRICE_HISTORY_MISSING'};
  const volumeBars = bars.slice(i - 20, i);
  if (volumeBars.length !== 20 || volumeBars.some((x, j) => !num(x.q) || x.q < 0
      || x.t !== b.t - (20 - j) * S)) return {status: 'PRICE_HISTORY_MISSING'};
  const prior = a.slice(0, -1);
  const floor = Math.min(...prior.map(x => x.l)), ceiling = Math.max(...prior.map(x => x.h));
  const low = Math.min(...a.map(x => x.l)), high = Math.max(...a.map(x => x.h));
  const netDriftPct = 100 * (b.c / a[0].o - 1);
  const travel = a.slice(1).reduce((s, x, j) => s + Math.abs(x.c - a[j].c), 0);
  const efficiency = travel ? Math.abs(b.c - a[0].c) / travel : 0;
  const body = x => 100 * Math.abs(x.c / x.o - 1);
  const rangePct = 100 * (high / low - 1);
  const medianCandleRangePct = median(a.map(x => 100 * (x.h - x.l) / x.o));
  const maxBodyPct = Math.max(...a.map(body)), latestBodyPct = body(b);
  const volumeBase = volumeBars.reduce((s, x) => s + x.q, 0) / 20;
  const volumeX = volumeBase > 0 ? b.q / volumeBase : null;
  const drop24hPct = 100 * (1 - b.c / feature.high24h);
  const info = {at: b.end, referencePrice: b.c, windowMinutes: windowBars * 5,
    floor, ceiling, low, high, rangePct, netDriftPct, efficiency,
    medianCandleRangePct, maxBodyPct, latestBodyPct, volumeX,
    drop24hPct, height24hPct: feature.heightPct};
  // Critical: a breakdown candle must NOT create this early setup.
  if (b.c < floor || b.c > ceiling || latestBodyPct > r.maxLatestBodyPct) {
    return {status: 'ALREADY_LEFT_BASE_OR_IMPULSE', ...info};
  }
  if (rangePct > r.maxRangePct || Math.abs(netDriftPct) > r.maxNetDriftPct
      || efficiency > r.maxEfficiency || medianCandleRangePct > r.maxMedianCandleRangePct
      || maxBodyPct > r.maxBodyInBasePct || volumeX === null || volumeX > r.maxLatestVolumeX) {
    return {status: 'NOT_SIDEWAYS', ...info};
  }
  if (drop24hPct < r.minPriorDrop24hPct || feature.heightPct > r.maxHeight24hPct) {
    return {status: 'NOT_LOW_AFTER_DECLINE', ...info};
  }
  return {status: 'QUALIFIED', ...info, version: SIDEWAYS_SHORT_CROWDING_VERSION,
    purpose: 'WATCH_SETUP_BEFORE_BREAK', side: 'UNDECIDED', observeOnly: true, affectsOrders: false};
}

export function lowerZoneForBase(base, liq) {
  if (base?.status !== 'QUALIFIED') return {status: 'BASE_NOT_QUALIFIED'};
  if (liq?.status !== 'OK') return {status: liq?.status ?? 'MODEL_MISSING'};
  if (!num(liq.asOf) || liq.asOf > base.at - 5 * 60000 || !Array.isArray(liq.zones)) {
    return {status: 'MODEL_MISSING_OR_NOT_CAUSAL'};
  }
  // Require the shared band to stay below the whole frozen base, with a 0.1% buffer.
  const candidates = liq.zones.filter(z => num(z.low) && num(z.high) && z.low > 0
    && z.high >= z.low && z.high < base.low * .999
    && (1 - z.high / base.referencePrice) * 100 <= SIDEWAYS_SHORT_CROWDING_RULE.maxLowerZoneDistancePct)
    .sort((a, b) => b.high - a.high);
  const zone = candidates[0] ?? null;
  return {status: zone ? 'QUALIFIED' : 'NO_UNTOUCHED_LOWER_ZONE_WITHIN_3PCT',
    asOf: liq.asOf, zone, distancePct: zone ? 100 * (1 - zone.high / base.referencePrice) : null,
    upperScore: liq.upperScore, lowerScore: liq.lowerScore};
}
