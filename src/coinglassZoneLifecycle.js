export const COINGLASS_ZONE_LIFECYCLE_VERSION =
  'COINGLASS_ZONE_LIFECYCLE_V16_LONG_00_06_VN_TIME_GATE_20260903';
export const COINGLASS_ZONE_LIFECYCLE_DISCORD_VERSION =
  'COINGLASS_ZONE_LIFECYCLE_DISCORD_V16_LONG_00_06_VN_TIME_GATE_20260903';

export const COINGLASS_ZONE_STATES = Object.freeze({
  FRESH: 'FRESH',
  APPROACHING: 'APPROACHING',
  SWEPT: 'SWEPT',
  REJECTED: 'REJECTED',
  ACCEPTED: 'ACCEPTED',
});

const DEFAULTS = Object.freeze({
  edgeLagBars: 2,
  minHeatmapPersistenceBars: 3,
  minScanPersistence: 2,
  approachDistancePct: 4,
  maxZoneDistancePct: 15,
  minStrength: 20,
  rejectionBufferPct: 0.1,
  acceptanceBufferPct: 0.1,
  zoneMatchPct: 1.25,
  minTargetDistancePct: 1,
  maxTargetDistancePct: 15,
  leverage: 5,
  marginUsdt: 2,
  acceptedBreakoutMarginUsdt: 10,
  unconfirmedBounceLongMarginUsdt: 5,
  fixedTakeProfitRoePct: 0,
  supportReclaimMarginUsdt: 3,
  supportReclaimMinLowerWickRangeRatio: 0.2,
  supportReclaimMinCloseLocationRatio: 0.65,
  strongShortMarginUsdt: 2,
  largeTargetThresholdPct: 5,
  largeTargetMarginUsdt: 2,
  longSingleTargetMaxPct: 3,
  longTp1DistancePct: 2,
  longTp1CloseRatio: 0.7,
  longTp2CapPct: 5,
  shortSingleTargetMaxPct: 3,
  shortTp1DistancePct: 2,
  shortTp1CloseRatio: 0.7,
  shortTp2CapPct: 5,
  shortStrongWaveChange24hPct: 10,
  shortStrongTakeProfitRoePct: 5,
  shortStrongTp1DistancePct: 1,
  shortStrongTp1CloseRatio: 0.8,
  shortStrongTp2CapPct: 3,
  trackExpiryMs: 18 * 60_000,
});

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compactNumber(value, digits = 8) {
  const number = finite(value);
  if (number == null) return '—';
  return Number(number.toFixed(digits)).toString();
}

function normalizeConfig(overrides = {}) {
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [
    key,
    Math.max(0, finite(overrides?.[key], value)),
  ]));
}

function normalizedBand(zone = {}, referencePrice = 0) {
  const midpoint = finite(zone.price);
  if (!(midpoint > 0)) return null;
  const fallbackHalfWidth = Math.max(midpoint * 0.001, referencePrice * 0.0005);
  let bandLow = finite(zone.bandLow, midpoint - fallbackHalfWidth);
  let bandHigh = finite(zone.bandHigh, midpoint + fallbackHalfWidth);
  if (bandLow > bandHigh) [bandLow, bandHigh] = [bandHigh, bandLow];
  if (bandLow === bandHigh) {
    bandLow -= fallbackHalfWidth;
    bandHigh += fallbackHalfWidth;
  }
  return { midpoint, bandLow, bandHigh };
}

function edgeGap(zone = {}, heatmap = {}) {
  const lastX = finite(zone.lastX);
  const lastHeatmapX = finite(
    heatmap.lastHeatmapX,
    Math.max(-1, ...(Array.isArray(heatmap.edgeZones) ? heatmap.edgeZones : heatmap.zones ?? [])
      .map((candidate) => finite(candidate?.lastX, -1))),
  );
  return lastX == null || lastHeatmapX < 0 ? null : Math.max(0, lastHeatmapX - lastX);
}

export function coinglassActiveEdgeZones(row = {}, overrides = {}) {
  const config = normalizeConfig(overrides);
  const heatmap = row?.heatmap ?? {};
  const referencePrice = finite(heatmap.currentPrice, finite(row.lastPrice));
  if (!(referencePrice > 0) || row.status !== 'OK' || row.stale === true) return [];
  const sourceZones = Array.isArray(heatmap.edgeZones) && heatmap.edgeZones.length
    ? heatmap.edgeZones
    : Array.isArray(heatmap.zones) ? heatmap.zones : [];
  return sourceZones.flatMap((zone) => {
    const band = normalizedBand(zone, referencePrice);
    const gap = edgeGap(zone, heatmap);
    const persistenceBars = Math.max(0, finite(zone.persistenceBars, 0));
    const strength = Math.max(0, finite(zone.strength, 0));
    if (!band || gap == null || gap > config.edgeLagBars
      || persistenceBars < config.minHeatmapPersistenceBars || strength < config.minStrength) return [];
    const side = band.midpoint >= referencePrice ? 'ABOVE' : 'BELOW';
    const distancePct = side === 'ABOVE'
      ? Math.max(0, ((band.bandLow / referencePrice) - 1) * 100)
      : Math.max(0, (1 - (band.bandHigh / referencePrice)) * 100);
    if (distancePct > config.maxZoneDistancePct) return [];
    const attractionScore = strength
      * Math.exp(-distancePct / 6)
      * (1 + Math.min(50, persistenceBars) / 100);
    return [{
      ...zone,
      ...band,
      side,
      distancePct: Number(distancePct.toFixed(4)),
      edgeGapBars: gap,
      persistenceBars,
      strength,
      attractionScore: Number(attractionScore.toFixed(4)),
    }];
  }).sort((left, right) => right.attractionScore - left.attractionScore);
}

function bandsMatch(previous = {}, current = {}, referencePrice = 0, config = DEFAULTS) {
  const overlaps = Math.max(previous.bandLow, current.bandLow) <= Math.min(previous.bandHigh, current.bandHigh);
  const tolerance = Math.max(
    referencePrice * config.zoneMatchPct / 100,
    Math.abs(current.bandHigh - current.bandLow),
  );
  return overlaps || Math.abs(finite(previous.midpoint, 0) - finite(current.midpoint, 0)) <= tolerance;
}

function candleFor(row = {}) {
  const candle = row?.heatmap?.latestCandle ?? {};
  const close = finite(candle.close, finite(row?.heatmap?.currentPrice, finite(row.lastPrice)));
  return {
    open: finite(candle.open, close),
    high: finite(candle.high, close),
    low: finite(candle.low, close),
    close,
    openTime: finite(candle.openTime),
  };
}

function timeframeAgreement(row = {}, zone = {}, config = DEFAULTS) {
  const matched = [];
  for (const range of ['12h', '24h']) {
    const frame = row?.qualifiedTimeframes?.[range];
    if (!frame?.heatmap) continue;
    const frameRow = { ...row, heatmap: frame.heatmap, status: 'OK', stale: false };
    if (coinglassActiveEdgeZones(frameRow, config).some((candidate) => (
      bandsMatch(zone, candidate, finite(frame.heatmap.currentPrice, 0), config)
    ))) matched.push(range);
  }
  return matched;
}

function terminalDirection(zoneSide, state) {
  if (state === COINGLASS_ZONE_STATES.REJECTED) return zoneSide === 'ABOVE' ? 'SHORT' : 'LONG';
  if (state === COINGLASS_ZONE_STATES.ACCEPTED) return zoneSide === 'ABOVE' ? 'LONG' : 'SHORT';
  return null;
}

function structuralInvalidation(zone, side) {
  return side === 'LONG' ? zone.bandLow : zone.bandHigh;
}

function classifyLongSetup(track = {}, side = null, config = DEFAULTS) {
  if (side !== 'LONG') return { label: null, ready: false, candidate: false };
  if (track.zoneSide === 'ABOVE' && track.state === COINGLASS_ZONE_STATES.ACCEPTED) {
    return {
      label: 'BREAKOUT_ACCEPTED_LONG_READY',
      ready: false,
      candidate: false,
      reason: 'ABOVE_ZONE_ACCEPTED_NOT_SUPPORT_RECLAIM',
    };
  }
  const candidate = track.zoneSide === 'BELOW'
    && track.state === COINGLASS_ZONE_STATES.REJECTED
    && track.swept === true;
  if (!candidate) {
    return {
      label: 'UNCLASSIFIED_LONG',
      ready: false,
      candidate: false,
      reason: 'NOT_BELOW_SWEPT_REJECTED',
    };
  }
  const candle = track.candle ?? {};
  const range = Math.max(0, finite(candle.high, 0) - finite(candle.low, 0));
  const lowerWick = Math.max(0, Math.min(
    finite(candle.open, finite(candle.close, 0)),
    finite(candle.close, 0),
  ) - finite(candle.low, 0));
  const lowerWickRangeRatio = range > 0 ? lowerWick / range : 0;
  const closeLocationRatio = range > 0
    ? (finite(candle.close, 0) - finite(candle.low, 0)) / range
    : 0;
  const bullishClose = finite(candle.close, 0) > finite(candle.open, 0);
  const reclaimedZone = finite(candle.close, 0) > finite(track.zone?.bandHigh, 0)
    * (1 + config.rejectionBufferPct / 100);
  const ready = bullishClose
    && reclaimedZone
    && lowerWickRangeRatio >= config.supportReclaimMinLowerWickRangeRatio
    && closeLocationRatio >= config.supportReclaimMinCloseLocationRatio;
  return {
    label: ready ? 'SUPPORT_RECLAIM_LONG_READY' : 'UNCONFIRMED_BOUNCE_LONG',
    ready,
    candidate: true,
    reason: ready ? 'BELOW_ZONE_SWEPT_REJECTED_WITH_BULLISH_LOWER_WICK' : 'RECLAIM_LACKS_BULLISH_WICK_CONFIRMATION',
    bullishClose,
    reclaimedZone,
    lowerWickRangeRatio: Number(lowerWickRangeRatio.toFixed(4)),
    closeLocationRatio: Number(closeLocationRatio.toFixed(4)),
  };
}

function buildEntryPlan({ row, track, activeZones, config }) {
  const side = terminalDirection(track.zoneSide, track.state);
  const entryPrice = finite(track.currentPrice);
  if (!side || !(entryPrice > 0)) return { complete: false, reason: 'NOT_TERMINAL' };
  const targetPool = activeZones.filter((zone) => (
    side === 'LONG' ? zone.bandLow > entryPrice : zone.bandHigh < entryPrice
  )).sort((left, right) => left.distancePct - right.distancePct || right.attractionScore - left.attractionScore);
  const targetZone = targetPool[0] ?? null;
  const zoneTakeProfitPrice = targetZone
    ? side === 'LONG' ? targetZone.bandLow : targetZone.bandHigh
    : null;
  const zoneTargetDistancePct = zoneTakeProfitPrice > 0
    ? Math.abs(zoneTakeProfitPrice / entryPrice - 1) * 100
    : null;
  const complete = Boolean(
    zoneTakeProfitPrice > 0
    && zoneTargetDistancePct >= config.minTargetDistancePct
    && zoneTargetDistancePct <= config.maxTargetDistancePct,
  );
  const useLongPartialTakeProfit = side === 'LONG'
    && zoneTargetDistancePct > config.longSingleTargetMaxPct;
  const change24hPct = finite(row?.change24hPct, finite(row?.priceChangePercent24h));
  const strongUpWaveShort = side === 'SHORT'
    && change24hPct >= config.shortStrongWaveChange24hPct;
  const longSetup = classifyLongSetup(track, side, config);
  const acceptedBreakoutLong = track.state === COINGLASS_ZONE_STATES.ACCEPTED
    && track.zoneSide === 'ABOVE'
    && side === 'LONG'
    && longSetup.label === 'BREAKOUT_ACCEPTED_LONG_READY';
  const acceptedBreakoutShort = track.state === COINGLASS_ZONE_STATES.ACCEPTED
    && track.zoneSide === 'BELOW'
    && side === 'SHORT';
  const acceptedBreakout = acceptedBreakoutLong || acceptedBreakoutShort;
  const fixedTakeProfitRoePct = config.fixedTakeProfitRoePct > 0
    ? config.fixedTakeProfitRoePct
    : null;
  const fixedTakeProfitDistancePct = fixedTakeProfitRoePct == null
    ? null
    : fixedTakeProfitRoePct / Math.max(1, config.leverage);
  const strongShortScalpDistancePct = config.shortStrongTakeProfitRoePct
    / Math.max(1, config.leverage);
  const shortTp1DistancePct = strongUpWaveShort
    ? config.shortStrongTp1DistancePct
    : config.shortTp1DistancePct;
  const shortTp1CloseRatio = strongUpWaveShort
    ? config.shortStrongTp1CloseRatio
    : config.shortTp1CloseRatio;
  const shortTp2CapPct = strongUpWaveShort
    ? config.shortStrongTp2CapPct
    : config.shortTp2CapPct;
  const shortPartialThresholdPct = strongUpWaveShort
    ? shortTp1DistancePct
    : config.shortSingleTargetMaxPct;
  const useShortPartialTakeProfit = side === 'SHORT' && !strongUpWaveShort
    && zoneTargetDistancePct > shortPartialThresholdPct;
  const takeProfitLegs = fixedTakeProfitDistancePct != null
    ? [{
        key: 'TP_FULL',
        closeRatio: 1,
        distancePct: fixedTakeProfitDistancePct,
        distanceFraction: (side === 'LONG' ? 1 : -1) * fixedTakeProfitDistancePct / 100,
        price: entryPrice * (1 + (side === 'LONG' ? 1 : -1) * fixedTakeProfitDistancePct / 100),
      }]
    : useLongPartialTakeProfit
    ? [
        {
          key: 'TP1',
          closeRatio: config.longTp1CloseRatio,
          distancePct: config.longTp1DistancePct,
          distanceFraction: config.longTp1DistancePct / 100,
          price: entryPrice * (1 + config.longTp1DistancePct / 100),
        },
        {
          key: 'TP2',
          closeRatio: 1 - config.longTp1CloseRatio,
          distancePct: Math.min(zoneTargetDistancePct, config.longTp2CapPct),
          distanceFraction: Math.min(zoneTargetDistancePct, config.longTp2CapPct) / 100,
          price: Math.min(zoneTakeProfitPrice, entryPrice * (1 + config.longTp2CapPct / 100)),
        },
      ]
    : strongUpWaveShort
      ? [{
          key: 'TP_FULL',
          closeRatio: 1,
          distancePct: strongShortScalpDistancePct,
          distanceFraction: -strongShortScalpDistancePct / 100,
          price: entryPrice * (1 - strongShortScalpDistancePct / 100),
        }]
    : useShortPartialTakeProfit
      ? [
          {
            key: 'TP1',
            closeRatio: shortTp1CloseRatio,
            distancePct: shortTp1DistancePct,
            distanceFraction: -shortTp1DistancePct / 100,
            price: entryPrice * (1 - shortTp1DistancePct / 100),
          },
          {
            key: 'TP2',
            closeRatio: 1 - shortTp1CloseRatio,
            distancePct: Math.min(zoneTargetDistancePct, shortTp2CapPct),
            distanceFraction: -Math.min(zoneTargetDistancePct, shortTp2CapPct) / 100,
            price: Math.max(zoneTakeProfitPrice, entryPrice * (1 - shortTp2CapPct / 100)),
          },
        ]
    : zoneTakeProfitPrice > 0
      ? [{
          key: 'TP_FULL',
          closeRatio: 1,
          distancePct: zoneTargetDistancePct,
          distanceFraction: zoneTargetDistancePct / 100,
          price: zoneTakeProfitPrice,
        }]
      : [];
  const takeProfitPrice = takeProfitLegs.at(-1)?.price ?? zoneTakeProfitPrice;
  const effectiveTargetDistancePct = takeProfitPrice > 0
    ? Math.abs(takeProfitPrice / entryPrice - 1) * 100
    : null;
  const hasHigherTimeframeAgreement = Array.isArray(track.timeframeAgreement)
    && track.timeframeAgreement.some((range) => range === '12h' || range === '24h');
  const largeTargetEligible = side === 'LONG'
    && track.zoneSide === 'ABOVE'
    && track.state === COINGLASS_ZONE_STATES.ACCEPTED
    && hasHigherTimeframeAgreement
    && zoneTargetDistancePct > config.largeTargetThresholdPct;
  const unconfirmedBounceLong = side === 'LONG'
    && track.zoneSide === 'BELOW'
    && track.state === COINGLASS_ZONE_STATES.REJECTED
    && longSetup.label === 'UNCONFIRMED_BOUNCE_LONG';
  const marginUsdt = acceptedBreakout
    ? config.acceptedBreakoutMarginUsdt
    : longSetup.ready
    ? config.supportReclaimMarginUsdt
    : unconfirmedBounceLong
      ? config.unconfirmedBounceLongMarginUsdt
    : largeTargetEligible
      ? config.largeTargetMarginUsdt
    : strongUpWaveShort
      ? config.strongShortMarginUsdt
      : config.marginUsdt;
  return {
    complete,
    reason: complete ? 'CONFIRMED_TERMINAL_WITH_NEXT_ACTIVE_EDGE_ZONE' : 'NO_VALID_NEXT_EDGE_TARGET',
    side,
    entryType: 'MARKET_ON_CONFIRMED_TRANSITION',
    entryPrice,
    takeProfitPrice,
    targetDistancePct: effectiveTargetDistancePct == null ? null : Number(effectiveTargetDistancePct.toFixed(3)),
    zoneTakeProfitPrice,
    zoneTargetDistancePct: zoneTargetDistancePct == null ? null : Number(zoneTargetDistancePct.toFixed(3)),
    takeProfitMode: fixedTakeProfitRoePct != null
      ? `FIXED_FULL_${compactNumber(fixedTakeProfitRoePct, 3)}ROE`
      : useLongPartialTakeProfit
      ? 'LONG_PARTIAL_70_30'
      : strongUpWaveShort
        ? 'SHORT_SCALP_FULL_5ROE_STRONG_WAVE'
      : useShortPartialTakeProfit
        ? 'SHORT_PARTIAL_70_30'
        : 'SINGLE_FULL',
    takeProfitLegs: takeProfitLegs.map((leg) => ({
      ...leg,
      price: Number(leg.price.toPrecision(12)),
      closeRatio: Number(leg.closeRatio.toFixed(4)),
      distancePct: Number(leg.distancePct.toFixed(3)),
      distanceFraction: Number(leg.distanceFraction.toFixed(6)),
    })),
    stopLossPrice: null,
    stopLossRoePct: null,
    stopLossPolicy: 'COINGLASS_ZONE_LIFECYCLE_TP_ONLY_NO_SL',
    leverage: config.leverage,
    marginUsdt,
    marginRule: acceptedBreakout
      ? 'ACCEPTED_BREAKOUT_MARGIN'
      : longSetup.ready
      ? 'SUPPORT_RECLAIM_LONG_READY_MARGIN'
      : unconfirmedBounceLong
        ? 'UNCONFIRMED_BOUNCE_LONG_MARGIN'
      : largeTargetEligible
        ? `LONG_ABOVE_ACCEPTED_HTF_TARGET_GT_${compactNumber(config.largeTargetThresholdPct, 3)}PCT`
      : strongUpWaveShort
        ? 'STRONG_UP_WAVE_SHORT_MARGIN'
        : 'BASE_MARGIN',
    signalLabel: side === 'LONG'
      ? longSetup.label
      : acceptedBreakoutShort
        ? 'BREAKDOWN_ACCEPTED_SHORT_READY'
        : null,
    supportReclaim: side === 'LONG' ? longSetup : null,
    structuralInvalidationPrice: structuralInvalidation(track.zone, side),
    targetZone,
    change24hPct,
    acceptedBreakout,
    acceptedBreakoutLong,
    acceptedBreakoutShort,
    unconfirmedBounceLong,
    shortWaveClass: side === 'SHORT' ? strongUpWaveShort ? 'STRONG_UP_WAVE' : 'NORMAL' : null,
    takeProfitRoePct: fixedTakeProfitRoePct
      ?? (strongUpWaveShort ? config.shortStrongTakeProfitRoePct : null),
  };
}

function eventId(track) {
  return [
    'ZLC1', track.symbol, track.zoneSide, track.state,
    compactNumber(track.zone.bandLow, 10), compactNumber(track.zone.bandHigh, 10), track.firstSeenAt,
  ].join(':');
}

export function advanceCoinglassZoneLifecycle({
  rows = [],
  previous = {},
  now = Date.now(),
  config: overrides = {},
} = {}) {
  const config = normalizeConfig(overrides);
  const previousTracks = previous?.tracks && typeof previous.tracks === 'object' ? previous.tracks : {};
  const tracks = {};
  const events = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const symbol = String(row?.symbol ?? '').trim().toUpperCase();
    if (!symbol || row?.status !== 'OK' || row?.stale === true) continue;
    const activeZones = coinglassActiveEdgeZones(row, config);
    const currentPrice = finite(row?.heatmap?.currentPrice, finite(row.lastPrice));
    const candle = candleFor(row);
    if (!(currentPrice > 0) || !(candle.close > 0)) continue;

    const usedZones = new Set();
    for (const zoneSide of ['ABOVE', 'BELOW']) {
      const key = `${symbol}:${zoneSide}`;
      const prior = previousTracks[key] ?? null;
      const priorMatch = prior?.zone
        ? activeZones.find((candidate) => !usedZones.has(candidate) && bandsMatch(prior.zone, candidate, currentPrice, config))
        : null;
      // Preserve the original side while price crosses through a tracked band;
      // otherwise an ABOVE zone would become BELOW exactly when ACCEPTED.
      const zone = priorMatch
        ?? activeZones.find((candidate) => !usedZones.has(candidate) && candidate.side === zoneSide);
      if (!zone) continue;
      usedZones.add(zone);
      const matched = Boolean(prior?.zone && bandsMatch(prior.zone, zone, currentPrice, config));
      const scanCount = matched ? Math.max(1, finite(prior.scanCount, 1)) + 1 : 1;
      const sweptBefore = matched && [
        COINGLASS_ZONE_STATES.SWEPT,
        COINGLASS_ZONE_STATES.REJECTED,
        COINGLASS_ZONE_STATES.ACCEPTED,
      ].includes(prior.state);
      const touchedNow = zoneSide === 'ABOVE' ? candle.high >= zone.bandLow : candle.low <= zone.bandHigh;
      const swept = sweptBefore || touchedNow;
      const rejection = swept && (zoneSide === 'ABOVE'
        ? candle.close < zone.bandLow * (1 - config.rejectionBufferPct / 100)
        : candle.close > zone.bandHigh * (1 + config.rejectionBufferPct / 100));
      const acceptance = swept && (zoneSide === 'ABOVE'
        ? candle.close > zone.bandHigh * (1 + config.acceptanceBufferPct / 100)
        : candle.close < zone.bandLow * (1 - config.acceptanceBufferPct / 100));
      let state = COINGLASS_ZONE_STATES.FRESH;
      if (scanCount >= config.minScanPersistence) {
        if (acceptance) state = COINGLASS_ZONE_STATES.ACCEPTED;
        else if (rejection) state = COINGLASS_ZONE_STATES.REJECTED;
        else if (swept) state = COINGLASS_ZONE_STATES.SWEPT;
        else if (zone.distancePct <= config.approachDistancePct) state = COINGLASS_ZONE_STATES.APPROACHING;
      }
      const trackedZone = { ...zone, side: zoneSide };
      const track = {
        version: COINGLASS_ZONE_LIFECYCLE_VERSION,
        symbol,
        zoneSide,
        state,
        previousState: matched ? prior.state : null,
        firstSeenAt: matched ? prior.firstSeenAt : now,
        lastSeenAt: now,
        scanCount,
        currentPrice,
        candle,
        zone: trackedZone,
        swept,
        timeframeAgreement: timeframeAgreement(row, trackedZone, config),
      };
      track.entryPlan = buildEntryPlan({ row, track, activeZones, config });
      tracks[key] = track;
      const stateChanged = state !== COINGLASS_ZONE_STATES.FRESH && (!matched || prior.state !== state);
      if (stateChanged) {
        events.push({
          id: eventId(track),
          version: COINGLASS_ZONE_LIFECYCLE_VERSION,
          discordVersion: COINGLASS_ZONE_LIFECYCLE_DISCORD_VERSION,
          generatedAt: now,
          ...track,
          shouldEnter: [COINGLASS_ZONE_STATES.REJECTED, COINGLASS_ZONE_STATES.ACCEPTED].includes(state)
            && track.entryPlan.complete,
        });
      }
    }
  }

  for (const [key, track] of Object.entries(previousTracks)) {
    if (tracks[key] || now - finite(track?.lastSeenAt, 0) > config.trackExpiryMs) continue;
    tracks[key] = { ...track, missedScans: Math.max(0, finite(track.missedScans, 0)) + 1 };
  }

  return {
    state: {
      ...previous,
      version: COINGLASS_ZONE_LIFECYCLE_VERSION,
      tracks,
      updatedAt: new Date(now).toISOString(),
    },
    events,
  };
}

function discordColor(event = {}) {
  if (event.state === COINGLASS_ZONE_STATES.APPROACHING) return 0xfacc15;
  if (event.state === COINGLASS_ZONE_STATES.SWEPT) return 0xf97316;
  if (event.entryPlan?.side === 'LONG') return 0x22c55e;
  if (event.entryPlan?.side === 'SHORT') return 0xef4444;
  return 0x64748b;
}

function externalLinks(event = {}) {
  const symbol = String(event.symbol ?? '').replace(/[^A-Z0-9]/g, '');
  const coin = symbol.replace(/USDT$/, '');
  return {
    binance: symbol ? `https://www.binance.com/en/futures/${symbol}` : null,
    coinglass: coin ? `https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${coin}` : null,
  };
}

export function buildCoinglassZoneLifecycleDiscordPayload({
  event = {},
  execution = null,
  pageUrl = '',
} = {}) {
  const plan = event.entryPlan ?? {};
  const links = externalLinks(event);
  const isEntry = event.shouldEnter === true;
  const stateLabel = `${event.previousState ?? 'NEW'} → ${event.state ?? 'UNKNOWN'}`;
  const direction = plan.signalLabel ?? plan.side ?? 'CHỜ';
  const binanceDecision = execution?.decision ?? (isEntry ? 'CHƯA THỰC THI' : 'KHÔNG VÀO Ở STATE NÀY');
  const timeGateNote = execution?.decision === 'BLOCKED_LONG_RULE_TIME_WINDOW_00_06_VN'
    ? '\nKhông vào từ **00:00–05:59 giờ Việt Nam**; Discord chỉ báo để theo dõi.'
    : '';
  const partialTpText = Array.isArray(plan.takeProfitLegs) && plan.takeProfitLegs.length >= 2
    ? [
        `MARKET ~${compactNumber(plan.entryPrice)}`,
        ...plan.takeProfitLegs.map((leg) => (
          `${leg.key} **${compactNumber(leg.price)}** `
          + `(${plan.side === 'SHORT' ? '-' : '+'}${compactNumber(leg.distancePct, 2)}%, `
          + `đóng ${compactNumber(Number(leg.closeRatio) * 100, 0)}%)`
        )),
        `Vùng CoinGlass gốc **${compactNumber(plan.zoneTakeProfitPrice)}** `
          + `(${plan.side === 'SHORT' ? '-' : '+'}${compactNumber(plan.zoneTargetDistancePct, 2)}%)`,
        plan.shortWaveClass === 'STRONG_UP_WAVE'
          ? `Sóng SHORT: **MẠNH — ưu tiên chốt sớm** · change24h **+${compactNumber(plan.change24hPct, 2)}%**`
          : null,
        plan.shortWaveClass === 'STRONG_UP_WAVE'
          ? 'SL **BAN ĐẦU KHÔNG ĐẶT** · runner chỉ dời về entry sau TP1 + ROE ≥5%; hyper-volatile/ZKP/4 được loại trừ'
          : 'SL **KHÔNG ĐẶT — entry Zone Lifecycle chạy TP-only**',
      ].filter(Boolean).join('\n')
    : null;
  const strongShortScalpText = plan.takeProfitMode === 'SHORT_SCALP_FULL_5ROE_STRONG_WAVE'
    ? `MARKET ~${compactNumber(plan.entryPrice)}\nTP **${compactNumber(plan.takeProfitPrice)}** (+${compactNumber(plan.takeProfitRoePct, 2)}% ROE, đóng 100%)\nSau khi SHORT đóng mới bật **LONG WATCH**; chỉ LONG $1 khi nến 5m quét EMA13/25, đóng reclaim, taker-buy xác nhận và 15m còn trên EMA99.\nSL **KHÔNG ĐẶT — riêng Zone Lifecycle chạy TP-only**`
    : null;
  const fixedRoeText = String(plan.takeProfitMode ?? '').startsWith('FIXED_FULL_')
    ? `MARKET ~${compactNumber(plan.entryPrice)}\nTP **${compactNumber(plan.takeProfitPrice)}** (+${compactNumber(plan.takeProfitRoePct, 2)}% ROE, đóng 100%)\nSL **KHÔNG ĐẶT — riêng Zone Lifecycle chạy TP-only**`
    : null;
  const longClassificationText = plan.side === 'LONG'
    ? plan.signalLabel === 'SUPPORT_RECLAIM_LONG_READY'
      ? [
          `**SUPPORT_RECLAIM_LONG_READY** · Binance **$${compactNumber(plan.marginUsdt, 2)}**`,
          'Vùng hỗ trợ CoinGlass phía dưới đã **SWEPT → REJECTED**, nến đóng lấy lại vùng.',
          `Nến tăng **${plan.supportReclaim?.bullishClose ? 'CÓ' : 'KHÔNG'}** · râu dưới **${compactNumber(Number(plan.supportReclaim?.lowerWickRangeRatio) * 100, 1)}% range** · close ở **${compactNumber(Number(plan.supportReclaim?.closeLocationRatio) * 100, 1)}% range**.`,
          'Đây là hỗ trợ bật ngắn đã xác nhận cấu trúc; **không đồng nghĩa đảo xu hướng dài hạn**.',
          '⚠️ Nếu giá vẫn dưới EMA99 dốc xuống hoặc bounce đi kèm OI giảm/taker-buy yếu thì vẫn có rủi ro **hồi quang phản chiếu**.',
        ].join('\n')
      : plan.signalLabel === 'BREAKOUT_ACCEPTED_LONG_READY'
        ? '**BREAKOUT_ACCEPTED_LONG_READY** · xuyên và giữ vùng phía trên; không phải case chạm hỗ trợ bật lên.'
        : `**${plan.signalLabel ?? 'UNCONFIRMED_BOUNCE_LONG'}** · chưa đạt bộ râu dưới + vị trí đóng nến của SUPPORT_RECLAIM.`
    : null;
  const shortClassificationText = plan.signalLabel === 'BREAKDOWN_ACCEPTED_SHORT_READY'
    ? `**BREAKDOWN_ACCEPTED_SHORT_READY** · xuyên và giữ dưới vùng thanh lý phía dưới; Binance **$${compactNumber(plan.marginUsdt, 2)}** khi executor còn xác nhận state hợp lệ.`
    : null;
  return {
    username: 'CoinGlass Zone Lifecycle',
    embeds: [{
      color: discordColor(event),
      title: `[ZONE LIFECYCLE] ${event.symbol ?? 'UNKNOWN'} · ${direction} · ${event.state ?? 'NO_DATA'}`,
      description: isEntry
        ? `**ĐÃ XÁC NHẬN ĐIỂM VÀO** · Binance **$${compactNumber(plan.marginUsdt, 2)} x${plan.leverage ?? 5}**\nRule độc lập với CoinGlass Qualified hiện hữu.`
        : '**CHỜ XÁC NHẬN** · Không gửi lệnh Binance ở trạng thái này.',
      fields: [
        {
          name: '🔄 TRẠNG THÁI',
          value: `${stateLabel}\nTheo dõi **${event.scanCount ?? 0} scan** · vùng tồn tại **${event.zone?.persistenceBars ?? 0} bars** · mép phải gap **${event.zone?.edgeGapBars ?? '—'}**`,
          inline: false,
        },
        {
          name: event.zoneSide === 'ABOVE' ? '🟡 VÙNG PHÍA TRÊN' : '🟡 VÙNG PHÍA DƯỚI',
          value: `**${compactNumber(event.zone?.bandLow)} – ${compactNumber(event.zone?.bandHigh)}**\nGiá ${compactNumber(event.currentPrice)} · cách ${compactNumber(event.zone?.distancePct, 3)}% · lực ${compactNumber(event.zone?.strength, 0)}/100`,
          inline: false,
        },
        {
          name: '🕯️ XÁC NHẬN GIÁ',
          value: `H ${compactNumber(event.candle?.high)} · L ${compactNumber(event.candle?.low)} · C ${compactNumber(event.candle?.close)}\nKhung trùng mép phải: **${event.timeframeAgreement?.length ? event.timeframeAgreement.join(' + ') : 'chưa có 12h/24h bổ sung'}**`,
          inline: false,
        },
        ...(longClassificationText ? [{
          name: '🧭 PHÂN LOẠI LONG',
          value: longClassificationText,
          inline: false,
        }] : []),
        ...(shortClassificationText ? [{
          name: '🧭 PHÂN LOẠI SHORT',
          value: shortClassificationText,
          inline: false,
        }] : []),
        {
          name: isEntry ? '🎯 ENTRY / TP / SL' : '⏳ KẾ HOẠCH',
          value: plan.complete
            ? fixedRoeText
              ? fixedRoeText
              : strongShortScalpText
                ? strongShortScalpText
              : partialTpText
              ? partialTpText
              : `MARKET ~${compactNumber(plan.entryPrice)}\nTP **${compactNumber(plan.takeProfitPrice)}** (${compactNumber(plan.targetDistancePct, 2)}%, đóng 100%)\nSL **KHÔNG ĐẶT — riêng Zone Lifecycle chạy TP-only**`
            : `Chưa có vùng TP mép phải đúng hướng: ${plan.reason ?? 'NO_PLAN'}.`,
          inline: false,
        },
        {
          name: '🤖 BINANCE',
          value: `**${binanceDecision}**${execution?.orderId ? ` · orderId ${execution.orderId}` : ''}${timeGateNote}${execution?.error ? `\n${String(execution.error).slice(0, 300)}` : ''}`,
          inline: false,
        },
        {
          name: '🔗 MỞ BIỂU ĐỒ',
          value: [
            links.coinglass ? `[CoinGlass](${links.coinglass})` : null,
            links.binance ? `[Binance](${links.binance})` : null,
            pageUrl ? `[Trang quét](${pageUrl})` : null,
          ].filter(Boolean).join(' · '),
          inline: false,
        },
      ],
      footer: {
        text: `${COINGLASS_ZONE_LIFECYCLE_DISCORD_VERSION} · ${isEntry ? `BINANCE $${compactNumber(plan.marginUsdt, 2)} ENABLED` : 'OBSERVE'}`,
      },
      timestamp: new Date(finite(event.generatedAt, Date.now())).toISOString(),
    }],
  };
}
