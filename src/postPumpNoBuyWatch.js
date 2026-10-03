export const POST_PUMP_NO_BUY_WATCH_VERSION = 'POST_PUMP_NO_BUY_WATCH_V2_CONFIRMATION_ENTRY_20260927';

export const POST_PUMP_NO_BUY_STAGE = Object.freeze({
  SELL_IMPULSE: 'SELL_IMPULSE',
  NO_BUY_CONFIRMATION: 'NO_BUY_CONFIRMATION',
  LATE_NO_CHASE: 'LATE_NO_CHASE',
});

const round = (value, digits = 4) => value == null || !Number.isFinite(Number(value))
  ? null
  : Number(Number(value).toFixed(digits));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function value(row, name, index) {
  return finite(row?.[name] ?? row?.[index]);
}

function closeTime(row) {
  return finite(row?.closeTime ?? row?.[6]);
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ema(values, period) {
  const rows = values.filter(Number.isFinite);
  if (rows.length < period) return null;
  const alpha = 2 / (period + 1);
  let current = rows.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (const item of rows.slice(period)) current = (item * alpha) + (current * (1 - alpha));
  return current;
}

function atr(rows, period = 14) {
  if (rows.length < period + 1) return null;
  const sample = rows.slice(-(period + 1));
  const ranges = sample.slice(1).map((row, index) => {
    const previousClose = value(sample[index], 'close', 4);
    const high = value(row, 'high', 2);
    const low = value(row, 'low', 3);
    if (![previousClose, high, low].every(Number.isFinite)) return null;
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  }).filter(Number.isFinite);
  return ranges.length === period ? ranges.reduce((sum, item) => sum + item, 0) / period : null;
}

function rsi(rows, period = 14) {
  const closes = rows.map((row) => value(row, 'close', 4)).filter(Number.isFinite);
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let index = closes.length - period; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const ratio = gains / losses;
  return 100 - (100 / (1 + ratio));
}

function takerBuyPct(rows = []) {
  let quoteVolume = 0;
  let takerBuyQuoteVolume = 0;
  for (const row of rows) {
    const quote = value(row, 'quoteVolume', 7);
    const buy = value(row, 'takerBuyQuoteVolume', 10);
    if (!(quote > 0) || buy == null) continue;
    quoteVolume += quote;
    takerBuyQuoteVolume += buy;
  }
  return quoteVolume > 0 ? (takerBuyQuoteVolume / quoteVolume) * 100 : null;
}

function findPumpContext(rows15m, impulseAt) {
  const rows = rows15m
    .filter((row) => closeTime(row) < impulseAt)
    .slice(-97);
  if (rows.length < 36) return null;

  let selected = null;
  for (let index = 20; index <= rows.length - 3; index += 1) {
    const current = rows[index];
    const currentHigh = value(current, 'high', 2);
    const prior = rows.slice(Math.max(0, index - 32), index);
    const priorLow = Math.min(...prior.map((row) => value(row, 'low', 3)).filter(Number.isFinite));
    if (!(currentHigh > 0) || !(priorLow > 0)) continue;
    const pumpPct = ((currentHigh / priorLow) - 1) * 100;
    const currentVolume = value(current, 'quoteVolume', 7);
    const priorMedianVolume = median(prior.slice(-20).map((row) => value(row, 'quoteVolume', 7)));
    const pumpVolumeRatio = currentVolume > 0 && priorMedianVolume > 0
      ? currentVolume / priorMedianVolume
      : null;
    const qualified = pumpPct >= 8 || (pumpPct >= 4 && pumpVolumeRatio >= 2.5);
    if (!qualified) continue;
    selected = {
      pumpAt: closeTime(current),
      pumpPrice: currentHigh,
      pumpFromPrice: priorLow,
      pumpPct,
      pumpVolumeRatio,
    };
  }
  return selected;
}

function candidateForImpulse(rows5m, rows15m, impulseIndex) {
  const impulse = rows5m[impulseIndex];
  const impulseAt = closeTime(impulse);
  const pump = findPumpContext(rows15m, impulseAt);
  if (!pump) return { reason: 'NO_RECENT_PUMP' };

  const afterPump = rows5m
    .slice(Math.max(0, impulseIndex - 48), impulseIndex)
    .filter((row) => closeTime(row) > pump.pumpAt)
    .slice(-36);
  const baseRows = afterPump;
  if (baseRows.length < 6) return { reason: 'INSUFFICIENT_DISTRIBUTION_BASE' };

  const baseCloses = baseRows.map((row) => value(row, 'close', 4)).filter(Number.isFinite);
  const baseLow = Math.min(...baseCloses);
  const baseHigh = Math.max(...baseCloses);
  const baseRangePct = baseLow > 0 ? ((baseHigh / baseLow) - 1) * 100 : null;
  if (!(baseLow > 0) || !(baseHigh > 0) || baseRangePct > 8) return { reason: 'BASE_NOT_USABLE' };

  const beforeImpulse = rows5m.slice(0, impulseIndex + 1);
  const previousVolumes = rows5m
    .slice(Math.max(0, impulseIndex - 20), impulseIndex)
    .map((row) => value(row, 'quoteVolume', 7));
  const medianVolume = median(previousVolumes);
  const impulseOpen = value(impulse, 'open', 1);
  const impulseHigh = value(impulse, 'high', 2);
  const impulseLow = value(impulse, 'low', 3);
  const impulseClose = value(impulse, 'close', 4);
  const impulseVolume = value(impulse, 'quoteVolume', 7);
  const impulseTakerBuyPct = takerBuyPct([impulse]);
  const impulseTakerSellPct = Number.isFinite(impulseTakerBuyPct) ? 100 - impulseTakerBuyPct : null;
  const atr14 = atr(beforeImpulse);
  const ema13 = ema(beforeImpulse.map((row) => value(row, 'close', 4)), 13);
  const ema25 = ema(beforeImpulse.map((row) => value(row, 'close', 4)), 25);
  const dropPct = impulseOpen > 0 ? ((impulseClose / impulseOpen) - 1) * 100 : null;
  const rangeAtr = atr14 > 0 ? (impulseHigh - impulseLow) / atr14 : null;
  const volumeRatio = impulseVolume > 0 && medianVolume > 0 ? impulseVolume / medianVolume : null;
  const candleRange = impulseHigh - impulseLow;
  const closeLocationPct = candleRange > 0 ? ((impulseClose - impulseLow) / candleRange) * 100 : null;
  const brokeBase = impulseClose < baseLow;
  const brokeEma = impulseClose < ema13 && impulseClose < ema25;
  const strongRange = dropPct <= -1.2 || rangeAtr >= 1.5;

  if (!(impulseClose < impulseOpen)) return { reason: 'IMPULSE_NOT_RED' };
  if (!brokeBase) return { reason: 'BASE_NOT_BROKEN' };
  if (!brokeEma) return { reason: 'EMA_NOT_BROKEN' };
  if (!strongRange) return { reason: 'SELL_RANGE_TOO_SMALL' };
  if (!(volumeRatio >= 1.8)) return { reason: 'SELL_VOLUME_TOO_LOW' };
  if (!(impulseTakerSellPct >= 58)) return { reason: 'TAKER_SELL_TOO_LOW' };
  if (!(closeLocationPct <= 25)) return { reason: 'WEAK_CLOSE_NOT_CONFIRMED' };

  return {
    reason: 'ACCEPTED',
    pump,
    baseLow,
    baseHigh,
    baseRangePct,
    impulse,
    impulseAt,
    impulseOpen,
    impulseHigh,
    impulseLow,
    impulseClose,
    impulseVolume,
    impulseEma13: ema13,
    impulseEma25: ema25,
    atr14,
    dropPct,
    rangeAtr,
    volumeRatio,
    impulseTakerSellPct,
    closeLocationPct,
  };
}

function scoreCandidate(candidate, confirmed) {
  const pumpScore = clamp((candidate.pump.pumpPct - 4) * 2.5, 10, 25);
  const rangeScore = clamp((Math.abs(candidate.dropPct) - 1.2) * 6, 5, 15);
  const volumeScore = clamp((candidate.volumeRatio - 1.8) * 8, 5, 15);
  const sellScore = clamp((candidate.impulseTakerSellPct - 58) * 1.25, 5, 15);
  const confirmationScore = confirmed ? 25 : 5;
  return clamp(round(pumpScore + rangeScore + volumeScore + sellScore + confirmationScore, 1), 0, 100);
}

/**
 * Causal, closed-candle detector for a sell impulse after a recent pump.
 * Stage one is observe-only. Stage two becomes an execution candidate only after buy
 * force stays weak for 2-3 closed 5m candles; late/overextended cases never execute.
 */
export function evaluatePostPumpNoBuyWatch({ symbol, rows5m = [], rows15m = [] } = {}) {
  const clean5m = rows5m.filter((row) => closeTime(row) != null).sort((a, b) => closeTime(a) - closeTime(b));
  const clean15m = rows15m.filter((row) => closeTime(row) != null).sort((a, b) => closeTime(a) - closeTime(b));
  if (clean5m.length < 40 || clean15m.length < 36) {
    return { watch: null, reason: 'INSUFFICIENT_DATA' };
  }

  let candidate = null;
  let lastReason = 'NO_SELL_IMPULSE';
  const firstIndex = Math.max(25, clean5m.length - 4);
  for (let index = clean5m.length - 1; index >= firstIndex; index -= 1) {
    const tested = candidateForImpulse(clean5m, clean15m, index);
    if (tested.reason === 'ACCEPTED') {
      candidate = { ...tested, impulseIndex: index };
      break;
    }
    lastReason = tested.reason;
  }
  if (!candidate) return { watch: null, reason: lastReason };

  const followRows = clean5m.slice(candidate.impulseIndex + 1, candidate.impulseIndex + 4);
  const latest = clean5m[Math.min(clean5m.length - 1, candidate.impulseIndex + followRows.length)];
  const latestRows = clean5m.slice(0, clean5m.indexOf(latest) + 1);
  const latestClose = value(latest, 'close', 4);
  const latestEma13 = ema(latestRows.map((row) => value(row, 'close', 4)), 13);
  const latestAtr14 = atr(latestRows);
  const latestRsi14 = rsi(latestRows);
  const emaDistanceAtr = latestAtr14 > 0 && latestEma13 > latestClose
    ? (latestEma13 - latestClose) / latestAtr14
    : 0;
  const moveBelowBasePct = candidate.baseLow > latestClose
    ? ((candidate.baseLow / latestClose) - 1) * 100
    : 0;

  const overextended = latestRsi14 < 25 || emaDistanceAtr > 2 || moveBelowBasePct > 5;

  const impulseBody = Math.max(candidate.impulseOpen - candidate.impulseClose, candidate.atr14 * 0.1);
  const maxFollowHigh = followRows.length
    ? Math.max(...followRows.map((row) => value(row, 'high', 2)).filter(Number.isFinite))
    : candidate.impulseClose;
  const reboundPct = Math.max(0, ((maxFollowHigh - candidate.impulseClose) / impulseBody) * 100);
  const followVolumeRatio = followRows.length && candidate.impulseVolume > 0
    ? (followRows.reduce((sum, row) => sum + value(row, 'quoteVolume', 7), 0) / followRows.length) / candidate.impulseVolume
    : null;
  const followTakerBuyPct = followRows.length ? takerBuyPct(followRows) : null;
  const noReclaim = followRows.length
    ? followRows.every((row) => value(row, 'close', 4) < candidate.baseLow)
      && latestClose < latestEma13
    : true;
  const lowerHigh = followRows.length < 2
    || value(followRows.at(-1), 'high', 2) <= value(followRows[0], 'high', 2);
  const noBuyConfirmed = followRows.length >= 2
    && reboundPct <= 35
    && Number.isFinite(followVolumeRatio) && followVolumeRatio <= 0.6
    && Number.isFinite(followTakerBuyPct) && followTakerBuyPct <= 45
    && noReclaim
    && lowerHigh;

  if (followRows.length >= 2 && !noBuyConfirmed) {
    return {
      watch: null,
      reason: noReclaim ? 'BUY_FORCE_NOT_WEAK' : 'BASE_RECLAIMED',
      diagnostics: {
        reboundPct: round(reboundPct, 1),
        followVolumeRatio: round(followVolumeRatio, 2),
        followTakerBuyPct: round(followTakerBuyPct, 1),
      },
    };
  }

  const stage = overextended
    ? POST_PUMP_NO_BUY_STAGE.LATE_NO_CHASE
    : noBuyConfirmed
      ? POST_PUMP_NO_BUY_STAGE.NO_BUY_CONFIRMATION
      : POST_PUMP_NO_BUY_STAGE.SELL_IMPULSE;
  const label = overextended
    ? 'ĐÃ XẢ QUÁ XA · KHÔNG SHORT ĐUỔI'
    : noBuyConfirmed
      ? 'KHÔNG CÓ LỰC MUA · CHỜ RETEST SHORT'
      : 'XẢ MẠNH SAU BƠM · CẢNH BÁO SỚM';
  const observedAt = overextended || noBuyConfirmed ? closeTime(latest) : candidate.impulseAt;
  const entryLow = Math.min(candidate.baseLow, candidate.impulseEma13);
  const entryHigh = Math.max(candidate.baseLow, candidate.impulseEma13);

  return {
    reason: 'ACCEPTED',
    watch: {
      version: POST_PUMP_NO_BUY_WATCH_VERSION,
      symbol: String(symbol ?? '').trim().toUpperCase(),
      side: 'SHORT',
      stage,
      label,
      watchOnly: true,
      binanceEligible: false,
      executionCandidate: stage === POST_PUMP_NO_BUY_STAGE.NO_BUY_CONFIRMATION,
      observedAt,
      priceAtWatch: round(latestClose, 10),
      score: scoreCandidate(candidate, noBuyConfirmed),
      pumpAt: candidate.pump.pumpAt,
      pumpPrice: round(candidate.pump.pumpPrice, 10),
      pumpPct: round(candidate.pump.pumpPct, 2),
      pumpVolumeRatio: round(candidate.pump.pumpVolumeRatio, 2),
      distributionBaseLow: round(candidate.baseLow, 10),
      distributionBaseHigh: round(candidate.baseHigh, 10),
      impulseAt: candidate.impulseAt,
      impulseDropPct: round(candidate.dropPct, 2),
      impulseRangeAtr: round(candidate.rangeAtr, 2),
      impulseVolumeRatio: round(candidate.volumeRatio, 2),
      impulseTakerSellPct: round(candidate.impulseTakerSellPct, 1),
      followBars: followRows.length,
      reboundPct: round(reboundPct, 1),
      followVolumeRatio: round(followVolumeRatio, 2),
      followTakerBuyPct: round(followTakerBuyPct, 1),
      rsi14: round(latestRsi14, 1),
      emaDistanceAtr: round(emaDistanceAtr, 2),
      moveBelowBasePct: round(moveBelowBasePct, 2),
      retestZone: {
        low: round(entryLow, 10),
        high: round(entryHigh, 10),
      },
      invalidationPrice: round(Math.max(candidate.baseHigh, candidate.impulseOpen), 10),
      note: overextended
        ? 'Giá đã xả quá xa khỏi vùng/EMA hoặc RSI quá thấp; chỉ theo dõi, tuyệt đối không SHORT đuổi.'
        : noBuyConfirmed
          ? 'Lực mua sau nhịp xả vẫn yếu; chỉ quan sát retest vùng đáy phân phối/EMA13, không SHORT đuổi.'
          : 'Cây xả đầu tiên vừa đóng; chờ thêm 2-3 nến 5m xác nhận thiếu lực mua.',
    },
  };
}
