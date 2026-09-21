import { coinglassActiveEdgeZones } from './coinglassZoneLifecycle.js';

export const COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION =
  'COINGLASS_HYBRID_LIQUIDITY_HUNTER_V2_DIRECTIONAL_BINANCE_READY_20260913';
export const COINGLASS_HYBRID_LIQUIDITY_DISCORD_VERSION =
  'COINGLASS_HYBRID_LIQUIDITY_DISCORD_V2_BINANCE_EXECUTION_20260913';

const DEFAULTS = Object.freeze({
  maxZoneDistancePct: 25,
  minZonesPerSide: 2,
  maxSideScoreRatio: 3,
  maxCandidates: 8,
  impulseLookbackBars: 18,
  impulseBaselineBars: 20,
  minImpulseBodyPct: 2,
  minImpulseAtrRatio: 1.8,
  minImpulseVolumeX: 1.8,
  minBodyRetentionRatio: 0.6,
  minPostImpulseHoldRatio: 0.35,
  minUpperTakerBuyRatio: 0.52,
  maxLowerTakerBuyRatio: 0.48,
  minUpperBookBidRatio: 0.45,
  maxLowerBookBidRatio: 0.55,
  max5mKlineAgeMs: 12 * 60_000,
  max15mKlineAgeMs: 35 * 60_000,
});

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function compact(value, digits = 8) {
  const number = finite(value);
  return number == null ? '—' : Number(number.toFixed(digits)).toString();
}

function mean(values = []) {
  const usable = values.map((value) => finite(value)).filter((value) => value != null);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function normalizeKlines(rows = [], now = Date.now()) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    openTime: finite(row?.openTime, finite(row?.[0])),
    open: finite(row?.open, finite(row?.[1])),
    high: finite(row?.high, finite(row?.[2])),
    low: finite(row?.low, finite(row?.[3])),
    close: finite(row?.close, finite(row?.[4])),
    closeTime: finite(row?.closeTime, finite(row?.[6])),
    quoteVolume: finite(row?.quoteVolume, finite(row?.[7], 0)),
    takerBuyQuoteVolume: finite(row?.takerBuyQuoteVolume, finite(row?.[10], 0)),
  })).filter((row) => (
    row.openTime > 0 && row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0
    && (!(row.closeTime > 0) || row.closeTime <= now)
  )).sort((left, right) => left.openTime - right.openTime);
}

function emaSeries(values = [], period = 1) {
  const alpha = 2 / (Math.max(1, period) + 1);
  let current = null;
  return values.map((raw) => {
    const value = finite(raw);
    current = value == null ? current : current == null ? value : value * alpha + current * (1 - alpha);
    return current;
  });
}

function trueRange(row = {}, previousClose = null) {
  const high = finite(row.high, 0);
  const low = finite(row.low, 0);
  if (!(high > 0) || !(low > 0)) return 0;
  if (!(previousClose > 0)) return Math.max(0, high - low);
  return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
}

function summarizeSide(zones = [], side = 'ABOVE') {
  const rows = zones.filter((zone) => zone.side === side);
  const ordered = [...rows].sort((left, right) => left.distancePct - right.distancePct);
  const strongest = [...rows].sort((left, right) => right.attractionScore - left.attractionScore)[0] ?? null;
  return {
    side,
    count: rows.length,
    score: Number(rows.reduce((sum, zone) => sum + finite(zone.attractionScore, 0), 0).toFixed(3)),
    strength: Number(rows.reduce((sum, zone) => sum + finite(zone.strength, 0), 0).toFixed(3)),
    nearestDistancePct: ordered[0]?.distancePct ?? null,
    nearestZone: ordered[0] ?? null,
    strongestZone: strongest,
    zones: ordered.slice(0, 4),
  };
}

export function coinglassTwoSidedLiquidityProfile(row = {}, overrides = {}) {
  const config = { ...DEFAULTS, ...overrides };
  const zones = coinglassActiveEdgeZones(row, {
    maxZoneDistancePct: config.maxZoneDistancePct,
  });
  const upper = summarizeSide(zones, 'ABOVE');
  const lower = summarizeSide(zones, 'BELOW');
  const minScore = Math.min(upper.score, lower.score);
  const maxScore = Math.max(upper.score, lower.score);
  const sideScoreRatio = minScore > 0 ? maxScore / minScore : null;
  const eligible = upper.count >= config.minZonesPerSide
    && lower.count >= config.minZonesPerSide
    && sideScoreRatio != null
    && sideScoreRatio <= config.maxSideScoreRatio;
  return {
    version: COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION,
    symbol: String(row?.symbol ?? '').trim().toUpperCase(),
    currentPrice: finite(row?.heatmap?.currentPrice, finite(row?.lastPrice)),
    eligible,
    upper,
    lower,
    sideScoreRatio: sideScoreRatio == null ? null : Number(sideScoreRatio.toFixed(3)),
    balanceScore: sideScoreRatio == null ? 0 : Number(clamp(100 / sideScoreRatio, 0, 100).toFixed(1)),
    candidateScore: Number((minScore * (sideScoreRatio ? 1 / sideScoreRatio : 0)).toFixed(3)),
  };
}

export function selectCoinglassHybridLiquidityCandidates(rows = [], overrides = {}) {
  const maxCandidates = Math.max(1, Math.trunc(finite(overrides.maxCandidates, DEFAULTS.maxCandidates)));
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({ row, profile: coinglassTwoSidedLiquidityProfile(row, overrides) }))
    .filter(({ profile }) => profile.eligible)
    .sort((left, right) => right.profile.candidateScore - left.profile.candidateScore)
    .slice(0, maxCandidates);
}

function impulseCandidates(rows = [], config = DEFAULTS) {
  const start = Math.max(config.impulseBaselineBars, rows.length - config.impulseLookbackBars);
  const output = [];
  for (let index = start; index < rows.length; index += 1) {
    const candle = rows[index];
    const baseline = rows.slice(Math.max(0, index - config.impulseBaselineBars), index);
    if (baseline.length < Math.min(12, config.impulseBaselineBars)) continue;
    const baselineVolume = mean(baseline.map((row) => row.quoteVolume));
    const atr = mean(baseline.map((row, offset) => trueRange(
      row,
      offset > 0 ? baseline[offset - 1].close : rows[index - baseline.length - 1]?.close,
    )));
    const bodyPct = (candle.close / candle.open - 1) * 100;
    const range = candle.high - candle.low;
    const atrRatio = atr > 0 ? range / atr : null;
    const volumeX = baselineVolume > 0 ? candle.quoteVolume / baselineVolume : null;
    if (Math.abs(bodyPct) < config.minImpulseBodyPct
      || !(atrRatio >= config.minImpulseAtrRatio)
      || !(volumeX >= config.minImpulseVolumeX)) continue;
    output.push({
      index,
      direction: bodyPct > 0 ? 'UP' : 'DOWN',
      candle,
      bodyPct: Number(bodyPct.toFixed(3)),
      atrRatio: Number(atrRatio.toFixed(3)),
      volumeX: Number(volumeX.toFixed(3)),
      score: Math.abs(bodyPct) + atrRatio * 2 + volumeX,
    });
  }
  return output.sort((left, right) => right.score - left.score);
}

function recentTakerBuyRatio(rows = [], count = 3) {
  const recent = rows.slice(-Math.max(1, count));
  const quote = recent.reduce((sum, row) => sum + finite(row.quoteVolume, 0), 0);
  const buy = recent.reduce((sum, row) => sum + finite(row.takerBuyQuoteVolume, 0), 0);
  return quote > 0 ? buy / quote : null;
}

function emaCrossCount(rows = [], count = 12) {
  if (rows.length < 3) return 0;
  const closes = rows.map((row) => row.close);
  const ema25 = emaSeries(closes, 25);
  let crossings = 0;
  const start = Math.max(1, rows.length - count);
  for (let index = start; index < rows.length; index += 1) {
    const previous = closes[index - 1] - ema25[index - 1];
    const current = closes[index] - ema25[index];
    if ((previous < 0 && current >= 0) || (previous > 0 && current <= 0)) crossings += 1;
  }
  return crossings;
}

function largeWickCount(rows = [], count = 12) {
  return rows.slice(-count).filter((row) => {
    const range = row.high - row.low;
    if (!(range > 0)) return false;
    const upper = row.high - Math.max(row.open, row.close);
    const lower = Math.min(row.open, row.close) - row.low;
    return Math.max(upper, lower) / range >= 0.35;
  }).length;
}

function targetFromProfile(profile = {}, direction = 'UP') {
  const zone = direction === 'UP' ? profile.upper?.nearestZone : profile.lower?.nearestZone;
  if (!zone) return { targetPrice: null, targetDistancePct: null, targetBand: null };
  const targetPrice = direction === 'UP' ? finite(zone.bandLow) : finite(zone.bandHigh);
  const currentPrice = finite(profile.currentPrice);
  return {
    targetPrice,
    targetDistancePct: targetPrice > 0 && currentPrice > 0
      ? Number((Math.abs(targetPrice / currentPrice - 1) * 100).toFixed(3))
      : null,
    targetBand: { bandLow: zone.bandLow, bandHigh: zone.bandHigh, strength: zone.strength },
  };
}

export function evaluateCoinglassHybridLiquidityHunter({
  row = {},
  profile = null,
  klines5m = [],
  klines15m = [],
  openInterest = null,
  liquidation = null,
  now = Date.now(),
  config: overrides = {},
  streamId = 'primary',
} = {}) {
  const config = { ...DEFAULTS, ...overrides };
  const heatmap = profile ?? coinglassTwoSidedLiquidityProfile(row, config);
  const rows5m = normalizeKlines(klines5m, now);
  const rows15m = normalizeKlines(klines15m, now);
  const symbol = heatmap.symbol;
  const base = {
    version: COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION,
    generatedAt: now,
    streamId,
    symbol,
    observeOnly: true,
    heatmap,
    ready: false,
    label: 'TWO_SIDED_LIQUIDITY_WATCH',
    reason: 'WAIT_BINANCE_CONFIRMATION',
  };
  if (!heatmap.eligible) return { ...base, reason: 'NOT_TWO_SIDED_HEATMAP' };
  if (rows5m.length < 105 || rows15m.length < 105) return { ...base, reason: 'BINANCE_KLINE_WARMUP' };
  const last5mClosedAt = finite(rows5m.at(-1)?.closeTime, rows5m.at(-1)?.openTime + 5 * 60_000);
  const last15mClosedAt = finite(rows15m.at(-1)?.closeTime, rows15m.at(-1)?.openTime + 15 * 60_000);
  if (!(last5mClosedAt > 0) || now - last5mClosedAt > config.max5mKlineAgeMs
    || !(last15mClosedAt > 0) || now - last15mClosedAt > config.max15mKlineAgeMs) {
    return { ...base, reason: 'BINANCE_KLINE_STALE' };
  }

  const closes5m = rows5m.map((item) => item.close);
  const closes15m = rows15m.map((item) => item.close);
  const ema13 = emaSeries(closes5m, 13).at(-1);
  const ema25 = emaSeries(closes5m, 25).at(-1);
  const ema99 = emaSeries(closes5m, 99).at(-1);
  const ema25_15m = emaSeries(closes15m, 25).at(-1);
  const ema99_15m = emaSeries(closes15m, 99).at(-1);
  const last = rows5m.at(-1);
  const last15m = rows15m.at(-1);
  const takerBuyRatio = recentTakerBuyRatio(rows5m, 3);
  const impulse = impulseCandidates(rows5m, config)[0] ?? null;
  const afterImpulse = impulse ? rows5m.slice(impulse.index + 1) : [];
  const bodySize = impulse ? Math.abs(impulse.candle.close - impulse.candle.open) : 0;
  const bodyRetentionRatio = impulse && bodySize > 0
    ? impulse.direction === 'UP'
      ? (last.close - impulse.candle.open) / bodySize
      : (impulse.candle.open - last.close) / bodySize
    : null;
  const postImpulseHoldRatio = impulse && bodySize > 0
    ? impulse.direction === 'UP'
      ? ((afterImpulse.length ? Math.min(...afterImpulse.map((item) => item.low)) : last.low) - impulse.candle.open) / bodySize
      : (impulse.candle.open - (afterImpulse.length ? Math.max(...afterImpulse.map((item) => item.high)) : last.high)) / bodySize
    : null;
  const bullish5m = last.close > ema99 && ema13 >= ema25 * 0.998;
  const bullish15m = last15m.close > ema25_15m && last15m.close > ema99_15m * 0.985;
  const bearish5m = last.close < ema99 && ema13 <= ema25 * 1.002;
  const bearish15m = last15m.close < ema25_15m && last15m.close < ema99_15m * 1.015;
  const oiDeltaPct = finite(openInterest?.deltaPct);
  const oiDelta5mPct = finite(openInterest?.delta5mPct);
  const oiSupportsContinuation = oiDeltaPct == null || oiDeltaPct >= -0.2 || openInterest?.stabilizing === true;
  const shortLiquidationUsd = finite(liquidation?.shortLiquidationUsd, 0);
  const longLiquidationUsd = finite(liquidation?.longLiquidationUsd, 0);
  const shortBurstRatio = finite(liquidation?.shortBurstRatio);
  const longBurstRatio = finite(liquidation?.longBurstRatio);
  const bidDepthUsd = finite(row?.binanceLiquidity?.bidDepthUsd);
  const askDepthUsd = finite(row?.binanceLiquidity?.askDepthUsd);
  const orderBookBidRatio = bidDepthUsd >= 0 && askDepthUsd >= 0 && bidDepthUsd + askDepthUsd > 0
    ? bidDepthUsd / (bidDepthUsd + askDepthUsd)
    : null;
  const orderBookSupportsUpper = orderBookBidRatio == null || orderBookBidRatio >= config.minUpperBookBidRatio;
  const orderBookSupportsLower = orderBookBidRatio == null || orderBookBidRatio <= config.maxLowerBookBidRatio;
  const upperReady = impulse?.direction === 'UP'
    && bodyRetentionRatio >= config.minBodyRetentionRatio
    && postImpulseHoldRatio >= config.minPostImpulseHoldRatio
    && bullish5m && bullish15m
    && takerBuyRatio >= config.minUpperTakerBuyRatio
    && orderBookSupportsUpper
    && oiSupportsContinuation;
  const lowerReady = impulse?.direction === 'DOWN'
    && bodyRetentionRatio >= config.minBodyRetentionRatio
    && postImpulseHoldRatio >= config.minPostImpulseHoldRatio
    && bearish5m && bearish15m
    && takerBuyRatio <= config.maxLowerTakerBuyRatio
    && orderBookSupportsLower
    && oiSupportsContinuation;
  const crossings = emaCrossCount(rows5m);
  const wickCount = largeWickCount(rows5m);
  const whipsawReady = !upperReady && !lowerReady
    && crossings >= 3 && wickCount >= 3
    && shortLiquidationUsd > 0 && longLiquidationUsd > 0;
  const direction = upperReady ? 'UP' : lowerReady ? 'DOWN' : null;
  const target = direction ? targetFromProfile(heatmap, direction) : {
    targetPrice: null, targetDistancePct: null, targetBand: null,
  };
  const label = upperReady
    ? 'HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY'
    : lowerReady
      ? 'HYBRID_LOWER_FIRST_LONG_FLUSH_READY'
      : whipsawReady
        ? 'HYBRID_TWO_SIDED_WHIPSAW_RISK_READY'
        : 'TWO_SIDED_LIQUIDITY_WATCH';
  return {
    ...base,
    ready: upperReady || lowerReady || whipsawReady,
    observeOnly: !(upperReady || lowerReady),
    binanceEligible: upperReady || lowerReady,
    executionEligible: upperReady || lowerReady,
    side: upperReady ? 'LONG' : lowerReady ? 'SHORT' : null,
    confirmedAt: last5mClosedAt,
    candleCloseAt: last5mClosedAt,
    label,
    bias: upperReady ? 'UPPER_FIRST' : lowerReady ? 'LOWER_FIRST' : whipsawReady ? 'NO_TRADE_WHIPSAW' : 'WAIT',
    reason: upperReady
      ? 'UP_IMPULSE_RETAINED_WITH_EMA_TAKER_OI_CONFIRMATION'
      : lowerReady
        ? 'DOWN_IMPULSE_RETAINED_WITH_EMA_TAKER_OI_CONFIRMATION'
        : whipsawReady
          ? 'BOTH_SIDES_LIQUIDATED_WITH_REPEATED_EMA_CROSS_AND_WICKS'
          : 'TWO_SIDED_HEATMAP_WITHOUT_BINANCE_READY_CONFIRMATION',
    target,
    binance: {
      lastPrice: last.close,
      confirmedAt: last5mClosedAt,
      ema13,
      ema25,
      ema99,
      ema25_15m,
      ema99_15m,
      takerBuyRatio,
      impulse: impulse ? {
        direction: impulse.direction,
        openTime: impulse.candle.openTime,
        closeTime: impulse.candle.closeTime,
        open: impulse.candle.open,
        high: impulse.candle.high,
        low: impulse.candle.low,
        close: impulse.candle.close,
        bodyPct: impulse.bodyPct,
        atrRatio: impulse.atrRatio,
        volumeX: impulse.volumeX,
      } : null,
      bodyRetentionRatio,
      postImpulseHoldRatio,
      bullish5m,
      bullish15m,
      bearish5m,
      bearish15m,
      oiDeltaPct,
      oiDelta5mPct,
      oiStabilizing: openInterest?.stabilizing === true,
      shortLiquidationUsd,
      longLiquidationUsd,
      shortBurstRatio,
      longBurstRatio,
      emaCrossings: crossings,
      largeWickCount: wickCount,
      bidDepthUsd,
      askDepthUsd,
      orderBookBidRatio,
      orderBookSupportsUpper,
      orderBookSupportsLower,
    },
  };
}

export function coinglassHybridLiquidityDedupeKey(signal = {}) {
  const target = finite(signal?.target?.targetPrice);
  const targetKey = target > 0 ? Number(target.toPrecision(5)) : 'NO_TARGET';
  return [
    COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION,
    signal.streamId ?? 'primary',
    signal.symbol ?? 'UNKNOWN',
    signal.label ?? 'WATCH',
    targetKey,
  ].join(':');
}

function formatZoneList(summary = {}) {
  return (summary.zones ?? []).slice(0, 3).map((zone) => (
    `**${compact(zone.bandLow)}–${compact(zone.bandHigh)}** · cách ${compact(zone.distancePct, 2)}% · lực ${compact(zone.strength, 0)}`
  )).join('\n') || 'Không đủ cụm';
}

function usd(value) {
  const number = finite(value, 0);
  if (number >= 1_000_000) return `$${compact(number / 1_000_000, 2)}M`;
  if (number >= 1_000) return `$${compact(number / 1_000, 1)}K`;
  return `$${compact(number, 0)}`;
}

function ratioPct(value) {
  const number = finite(value);
  return number == null ? '—' : compact(number * 100, 1);
}

export function buildCoinglassHybridLiquidityDiscordPayload(signal = {}) {
  const symbol = String(signal.symbol ?? '').replace(/[^A-Z0-9]/g, '');
  const coin = symbol.replace(/USDT$/, '');
  const heatmap = signal.heatmap ?? {};
  const binance = signal.binance ?? {};
  const isWhipsaw = signal.bias === 'NO_TRADE_WHIPSAW';
  const execution = signal.binanceExecution ?? {};
  const binanceStatus = String(execution.status ?? (isWhipsaw ? 'ineligible' : 'pending')).toUpperCase();
  const orderDirection = signal.side === 'SHORT' ? 'SHORT' : 'LONG';
  const color = signal.bias === 'UPPER_FIRST' ? 0x22c55e
    : signal.bias === 'LOWER_FIRST' ? 0xef4444 : 0xf59e0b;
  return {
    username: 'Hybrid Liquidity Hunter',
    embeds: [{
      color,
      title: `[HYBRID LIQUIDITY] ${symbol} · ${signal.bias ?? 'WAIT'}`,
      description: isWhipsaw
        ? '**CẢNH BÁO QUÉT HAI ĐẦU — KHÔNG ĐÁNH GIỮA HỘP.** CoinGlass hai phía + Binance xác nhận whipsaw. **OBSERVE ONLY, không vào Binance.**'
        : `**${signal.label}**\nƯu tiên quét **${signal.bias}** sau khi CoinGlass xác nhận hai phía và Binance xác nhận impulse. **${orderDirection} MARKET · 1 USDT margin × 5x · TP +10% ROE** khi route đang bật và tín hiệu còn mới.`,
      fields: [
        {
          name: isWhipsaw ? '🔒 BINANCE' : '💰 BINANCE THẬT',
          value: isWhipsaw
            ? 'Không đủ điều kiện entry: nhãn whipsaw chỉ cảnh báo.'
            : `Trạng thái **${binanceStatus}** · ${orderDirection} MARKET · margin **1 USDT** · đòn bẩy **5x** · TP **+10% ROE** từ full-fill.`,
          inline: false,
        },
        {
          name: '🟡 CỤM PHÍA TRÊN',
          value: `${formatZoneList(heatmap.upper)}\nTổng score **${compact(heatmap.upper?.score, 1)}**`,
          inline: false,
        },
        {
          name: '🟡 CỤM PHÍA DƯỚI',
          value: `${formatZoneList(heatmap.lower)}\nTổng score **${compact(heatmap.lower?.score, 1)}**`,
          inline: false,
        },
        {
          name: '🚀 BINANCE IMPULSE / GIỮ GIÁ',
          value: binance.impulse
            ? `${binance.impulse.direction} **${compact(binance.impulse.bodyPct, 2)}%** · ${compact(binance.impulse.atrRatio, 2)} ATR · vol ${compact(binance.impulse.volumeX, 2)}x\nGiữ thân **${ratioPct(binance.bodyRetentionRatio)}%** · đáy/đỉnh pullback giữ **${ratioPct(binance.postImpulseHoldRatio)}%**`
            : 'Chưa có impulse đạt chuẩn',
          inline: false,
        },
        {
          name: '📊 TAKER / OI / THANH LÝ',
          value: `Taker-buy **${ratioPct(binance.takerBuyRatio)}%** · Book bid **${ratioPct(binance.orderBookBidRatio)}%** (${usd(binance.bidDepthUsd)} / ask ${usd(binance.askDepthUsd)})\nOI 1m **${compact(binance.oiDeltaPct, 3)}%** · OI 5m **${compact(binance.oiDelta5mPct, 3)}%**\nKill SHORT ${usd(binance.shortLiquidationUsd)} (${compact(binance.shortBurstRatio, 2)}x) · Kill LONG ${usd(binance.longLiquidationUsd)} (${compact(binance.longBurstRatio, 2)}x)`,
          inline: false,
        },
        {
          name: isWhipsaw ? '⚠️ HÀNH ĐỘNG' : '🎯 VÙNG THAM KHẢO',
          value: isWhipsaw
            ? 'Không vào giữa hộp. Chờ một phía `SWEPT → REJECTED` rồi mới đánh về phía còn lại.'
            : `Giá tham chiếu **${compact(binance.lastPrice)}**\nCụm kế tiếp **${compact(signal.target?.targetBand?.bandLow)}–${compact(signal.target?.targetBand?.bandHigh)}** · khoảng **${compact(signal.target?.targetDistancePct, 2)}%**`,
          inline: false,
        },
        {
          name: '🔗 MỞ BIỂU ĐỒ',
          value: [
            coin ? `[CoinGlass](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${coin})` : null,
            symbol ? `[Binance](https://www.binance.com/en/futures/${symbol})` : null,
          ].filter(Boolean).join(' · '),
          inline: false,
        },
      ],
      footer: {
        text: `${COINGLASS_HYBRID_LIQUIDITY_DISCORD_VERSION} · ${signal.streamId ?? 'primary'} · ${isWhipsaw ? 'OBSERVE_ONLY' : 'BINANCE_DIRECTIONAL'}`,
      },
      timestamp: new Date(finite(signal.generatedAt, Date.now())).toISOString(),
    }],
  };
}
