export const COINGLASS_ZONE_LIFECYCLE_VERSION =
  'COINGLASS_ZONE_LIFECYCLE_V3_BINANCE_5USDT_TP_ONLY_20260828';
export const COINGLASS_ZONE_LIFECYCLE_DISCORD_VERSION =
  'COINGLASS_ZONE_LIFECYCLE_DISCORD_V3_TP_ONLY_5USDT_20260828';

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
  marginUsdt: 5,
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

function buildEntryPlan({ row, track, activeZones, config }) {
  const side = terminalDirection(track.zoneSide, track.state);
  const entryPrice = finite(track.currentPrice);
  if (!side || !(entryPrice > 0)) return { complete: false, reason: 'NOT_TERMINAL' };
  const targetPool = activeZones.filter((zone) => (
    side === 'LONG' ? zone.bandLow > entryPrice : zone.bandHigh < entryPrice
  )).sort((left, right) => left.distancePct - right.distancePct || right.attractionScore - left.attractionScore);
  const targetZone = targetPool[0] ?? null;
  const takeProfitPrice = targetZone
    ? side === 'LONG' ? targetZone.bandLow : targetZone.bandHigh
    : null;
  const targetDistancePct = takeProfitPrice > 0
    ? Math.abs(takeProfitPrice / entryPrice - 1) * 100
    : null;
  const complete = Boolean(
    takeProfitPrice > 0
    && targetDistancePct >= config.minTargetDistancePct
    && targetDistancePct <= config.maxTargetDistancePct,
  );
  return {
    complete,
    reason: complete ? 'CONFIRMED_TERMINAL_WITH_NEXT_ACTIVE_EDGE_ZONE' : 'NO_VALID_NEXT_EDGE_TARGET',
    side,
    entryType: 'MARKET_ON_CONFIRMED_TRANSITION',
    entryPrice,
    takeProfitPrice,
    targetDistancePct: targetDistancePct == null ? null : Number(targetDistancePct.toFixed(3)),
    stopLossPrice: null,
    stopLossRoePct: null,
    stopLossPolicy: 'COINGLASS_ZONE_LIFECYCLE_TP_ONLY_NO_SL',
    leverage: config.leverage,
    marginUsdt: config.marginUsdt,
    structuralInvalidationPrice: structuralInvalidation(track.zone, side),
    targetZone,
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
  const direction = plan.side ?? 'CHỜ';
  const binanceDecision = execution?.decision ?? (isEntry ? 'CHƯA THỰC THI' : 'KHÔNG VÀO Ở STATE NÀY');
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
        {
          name: isEntry ? '🎯 ENTRY / TP / SL' : '⏳ KẾ HOẠCH',
          value: plan.complete
            ? `MARKET ~${compactNumber(plan.entryPrice)}\nTP **${compactNumber(plan.takeProfitPrice)}** (${compactNumber(plan.targetDistancePct, 2)}%)\nSL **KHÔNG ĐẶT — riêng Zone Lifecycle chạy TP-only**`
            : `Chưa có vùng TP mép phải đúng hướng: ${plan.reason ?? 'NO_PLAN'}.`,
          inline: false,
        },
        {
          name: '🤖 BINANCE',
          value: `**${binanceDecision}**${execution?.orderId ? ` · orderId ${execution.orderId}` : ''}${execution?.error ? `\n${String(execution.error).slice(0, 300)}` : ''}`,
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
