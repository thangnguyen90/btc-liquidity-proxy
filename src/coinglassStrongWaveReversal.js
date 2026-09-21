export const COINGLASS_STRONG_WAVE_REVERSAL_VERSION =
  'COINGLASS_STRONG_WAVE_REVERSAL_V1_SHORT_5ROE_THEN_5M_RECLAIM_20260830';
export const COINGLASS_STRONG_WAVE_REVERSAL_MARGIN_USDT = 1;
export const COINGLASS_STRONG_WAVE_REVERSAL_LEVERAGE = 5;
export const COINGLASS_STRONG_WAVE_REVERSAL_WATCH_MS = 6 * 60 * 60_000;

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compact(value, digits = 8) {
  const number = finite(value);
  return number == null ? '—' : Number(number.toFixed(digits)).toString();
}

function emaSeries(values = [], period = 1) {
  const alpha = 2 / (Math.max(1, period) + 1);
  const output = [];
  let current = null;
  for (const raw of values) {
    const value = finite(raw);
    current = value == null ? current : current == null ? value : value * alpha + current * (1 - alpha);
    output.push(current);
  }
  return output;
}

function normalizedClosedKlines(rows = [], now = Date.now()) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    openTime: finite(row?.openTime, finite(row?.[0])),
    open: finite(row?.open, finite(row?.[1])),
    high: finite(row?.high, finite(row?.[2])),
    low: finite(row?.low, finite(row?.[3])),
    close: finite(row?.close, finite(row?.[4])),
    closeTime: finite(row?.closeTime, finite(row?.[6])),
    quoteVolume: finite(row?.quoteVolume, finite(row?.[7])),
    takerBuyQuoteVolume: finite(row?.takerBuyQuoteVolume, finite(row?.[10])),
  })).filter((row) => (
    row.openTime > 0
    && row.open > 0
    && row.high > 0
    && row.low > 0
    && row.close > 0
    && (!(row.closeTime > 0) || row.closeTime <= now)
  )).sort((left, right) => left.openTime - right.openTime);
}

function indicatorRows(rows = []) {
  const closes = rows.map((row) => row.close);
  const ema13 = emaSeries(closes, 13);
  const ema25 = emaSeries(closes, 25);
  const ema99 = emaSeries(closes, 99);
  return rows.map((row, index) => ({
    ...row,
    ema13: ema13[index],
    ema25: ema25[index],
    ema99: ema99[index],
    index,
  }));
}

function decisionBase(watch = {}) {
  return {
    version: COINGLASS_STRONG_WAVE_REVERSAL_VERSION,
    watchId: watch.id ?? null,
    symbol: String(watch.symbol ?? '').trim().toUpperCase(),
    side: 'LONG',
    ready: false,
  };
}

export function createCoinglassStrongWaveReversalWatch({ event = {}, execution = {}, now = Date.now() } = {}) {
  const strongShort = execution?.decision === 'SUBMITTED'
    && event?.shouldEnter === true
    && event?.entryPlan?.side === 'SHORT'
    && event?.entryPlan?.shortWaveClass === 'STRONG_UP_WAVE'
    && event?.entryPlan?.takeProfitMode === 'SHORT_SCALP_FULL_5ROE_STRONG_WAVE';
  if (!strongShort) return null;
  const filledAt = finite(execution?.filledAt, now);
  return {
    id: `${event.id}:STRONG_WAVE_REVERSAL_LONG`,
    version: COINGLASS_STRONG_WAVE_REVERSAL_VERSION,
    lifecycleEventId: event.id,
    symbol: String(event.symbol ?? '').trim().toUpperCase(),
    streamId: null,
    status: 'ARMED_SHORT_EXIT',
    shortOrderId: execution.orderId ?? null,
    shortEntryPrice: finite(execution.binanceEntryPrice, finite(event.entryPlan?.entryPrice)),
    shortFilledAt: filledAt,
    shortObservedOpen: false,
    shortClosedAt: null,
    lastEvaluatedCandleCloseTime: null,
    rejectedZone: {
      bandLow: finite(event.zone?.bandLow),
      bandHigh: finite(event.zone?.bandHigh),
    },
    createdAt: now,
    expiresAt: now + COINGLASS_STRONG_WAVE_REVERSAL_WATCH_MS,
    updatedAt: now,
  };
}

export function evaluateCoinglassStrongWaveReversal({
  watch = {},
  klines5m = [],
  klines15m = [],
  currentPrice,
  now = Date.now(),
  minTakerBuyRatio = 0.52,
  sweepTolerancePct = 0.15,
  reclaimBufferPct = 0.05,
  minLowerWickRangeRatio = 0.25,
  maxEntrySlippagePct = 0.75,
  minTargetDistancePct = 1,
  maxTargetDistancePct = 3,
  leverage = COINGLASS_STRONG_WAVE_REVERSAL_LEVERAGE,
  marginUsdt = COINGLASS_STRONG_WAVE_REVERSAL_MARGIN_USDT,
} = {}) {
  const base = decisionBase(watch);
  const mark = finite(currentPrice);
  const shortClosedAt = finite(watch.shortClosedAt);
  if (!base.symbol || watch.status !== 'WAIT_RECLAIM' || !(shortClosedAt > 0)) {
    return { ...base, decision: 'WAIT_SHORT_EXIT_CONFIRMATION' };
  }
  if (now >= finite(watch.expiresAt, 0)) return { ...base, decision: 'EXPIRED_REVERSAL_WATCH' };
  if (!(mark > 0)) return { ...base, decision: 'WAIT_INVALID_MARK_PRICE' };

  const rows5m = indicatorRows(normalizedClosedKlines(klines5m, now));
  const rows15m = indicatorRows(normalizedClosedKlines(klines15m, now));
  const lastEvaluated = finite(watch.lastEvaluatedCandleCloseTime, 0);
  const eligible = rows5m.filter((row) => (
    row.index >= 98
    && finite(row.closeTime, row.openTime + 5 * 60_000) > shortClosedAt
    && finite(row.closeTime, row.openTime + 5 * 60_000) > lastEvaluated
  ));
  if (!eligible.length) return { ...base, decision: 'WAIT_NEW_CLOSED_5M_CANDLE' };

  let lastFailure = 'WAIT_5M_RECLAIM';
  let lastEvidence = null;
  for (const candle of eligible) {
    const candleCloseTime = finite(candle.closeTime, candle.openTime + 5 * 60_000);
    const frame15m = [...rows15m].reverse().find((row) => (
      row.index >= 98 && finite(row.closeTime, row.openTime + 15 * 60_000) <= candleCloseTime
    ));
    const range = candle.high - candle.low;
    const body = Math.abs(candle.close - candle.open);
    const lowerWick = Math.max(0, Math.min(candle.open, candle.close) - candle.low);
    const lowerWickRangeRatio = range > 0 ? lowerWick / range : 0;
    const closeLocation = range > 0 ? (candle.close - candle.low) / range : 0;
    const takerBuyRatio = candle.quoteVolume > 0
      ? candle.takerBuyQuoteVolume / candle.quoteVolume
      : null;
    const touchedFastEma = candle.low <= candle.ema13 * (1 + sweepTolerancePct / 100);
    const reclaimed = candle.close >= candle.ema13 * (1 + reclaimBufferPct / 100)
      && candle.close > candle.ema25;
    const wickConfirmed = candle.close > candle.open
      && lowerWickRangeRatio >= minLowerWickRangeRatio
      && closeLocation >= 0.65
      && lowerWick >= body * 0.5;
    const takerBuyConfirmed = takerBuyRatio != null && takerBuyRatio >= minTakerBuyRatio;
    const bullish5m = candle.ema13 > candle.ema25 && candle.ema25 > candle.ema99
      && candle.close > candle.ema99;
    const bullish15m = frame15m
      && frame15m.close > frame15m.ema99
      && frame15m.ema13 >= frame15m.ema25 * 0.995;
    const evidence = {
      candleOpenTime: candle.openTime,
      candleCloseTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      ema13: candle.ema13,
      ema25: candle.ema25,
      ema99: candle.ema99,
      ema99_15m: frame15m?.ema99 ?? null,
      takerBuyRatio,
      lowerWickRangeRatio,
      closeLocation,
      touchedFastEma,
      reclaimed,
      wickConfirmed,
      takerBuyConfirmed,
      bullish5m,
      bullish15m: Boolean(bullish15m),
    };
    lastEvidence = evidence;
    if (!touchedFastEma) lastFailure = 'WAIT_EMA13_25_SWEEP';
    else if (!reclaimed) lastFailure = 'WAIT_CLOSE_RECLAIM';
    else if (!wickConfirmed) lastFailure = 'WAIT_LOWER_WICK_CONFIRMATION';
    else if (!takerBuyConfirmed) lastFailure = 'WAIT_TAKER_BUY_CONFIRMATION';
    else if (!bullish5m || !bullish15m) lastFailure = 'WAIT_BULLISH_5M_15M_STRUCTURE';
    else {
      const entrySlippagePct = Math.abs(mark / candle.close - 1) * 100;
      if (entrySlippagePct > maxEntrySlippagePct || mark < candle.ema13 * 0.998) {
        lastFailure = 'WAIT_MARK_STILL_ABOVE_RECLAIM';
        continue;
      }
      const zoneTarget = finite(watch.rejectedZone?.bandLow);
      const cappedTarget = mark * (1 + maxTargetDistancePct / 100);
      const takeProfitPrice = zoneTarget > mark ? Math.min(zoneTarget, cappedTarget) : null;
      const targetDistancePct = takeProfitPrice > 0 ? (takeProfitPrice / mark - 1) * 100 : null;
      if (!(targetDistancePct >= minTargetDistancePct)) {
        lastFailure = 'WAIT_VALID_REJECTED_ZONE_TARGET';
        continue;
      }
      return {
        ...base,
        ready: true,
        decision: 'ENTER_LONG_MARKET',
        currentPrice: mark,
        takeProfitPrice,
        targetDistancePct: Number(targetDistancePct.toFixed(3)),
        stopLossPrice: null,
        stopLossPolicy: 'COINGLASS_ZONE_LIFECYCLE_LONG_TP_ONLY_NO_SL',
        leverage: Math.max(1, finite(leverage, COINGLASS_STRONG_WAVE_REVERSAL_LEVERAGE)),
        marginUsdt: Math.max(0.01, finite(marginUsdt, COINGLASS_STRONG_WAVE_REVERSAL_MARGIN_USDT)),
        evidence,
        lastEvaluatedCandleCloseTime: candleCloseTime,
      };
    }
  }
  return {
    ...base,
    decision: lastFailure,
    evidence: lastEvidence,
    lastEvaluatedCandleCloseTime: finite(eligible.at(-1)?.closeTime, eligible.at(-1)?.openTime + 5 * 60_000),
  };
}

export function buildCoinglassStrongWaveReversalDiscordPayload({ decision = {}, execution = {}, pageUrl = '' } = {}) {
  const symbol = String(decision.symbol ?? '').replace(/[^A-Z0-9]/g, '');
  const coin = symbol.replace(/USDT$/, '');
  const evidence = decision.evidence ?? {};
  return {
    username: 'CoinGlass Zone Lifecycle',
    embeds: [{
      color: 0x22c55e,
      title: `[ZONE REVERSAL LONG] ${symbol} · 5m EMA RECLAIM`,
      description: `SHORT scalp đã thoát, nến 5m quét EMA13/25 rồi reclaim. Binance **$${compact(decision.marginUsdt, 2)} x${decision.leverage ?? 5}**.`,
      fields: [
        {
          name: '🔎 XÁC NHẬN NHÂN QUẢ',
          value: `L ${compact(evidence.low)} · C ${compact(evidence.close)}\nEMA13 ${compact(evidence.ema13)} · EMA25 ${compact(evidence.ema25)} · EMA99 5m ${compact(evidence.ema99)}\nTaker-buy **${compact(Number(evidence.takerBuyRatio) * 100, 1)}%** · râu dưới **${compact(Number(evidence.lowerWickRangeRatio) * 100, 1)}% range**`,
          inline: false,
        },
        {
          name: '🎯 ENTRY / TP / SL',
          value: `MARKET ~${compact(decision.currentPrice)}\nTP **${compact(decision.takeProfitPrice)}** (+${compact(decision.targetDistancePct, 2)}% giá)\nSL **KHÔNG ĐẶT — riêng Zone Lifecycle LONG này**`,
          inline: false,
        },
        {
          name: '🤖 BINANCE',
          value: `**${execution.decision ?? 'CHƯA THỰC THI'}**${execution.orderId ? ` · orderId ${execution.orderId}` : ''}`,
          inline: false,
        },
        {
          name: '🔗 MỞ BIỂU ĐỒ',
          value: [
            coin ? `[CoinGlass](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${coin})` : null,
            symbol ? `[Binance](https://www.binance.com/en/futures/${symbol})` : null,
            pageUrl ? `[Trang quét](${pageUrl})` : null,
          ].filter(Boolean).join(' · '),
          inline: false,
        },
      ],
      footer: { text: `${COINGLASS_STRONG_WAVE_REVERSAL_VERSION} · causal 5m + 15m` },
      timestamp: new Date().toISOString(),
    }],
  };
}
