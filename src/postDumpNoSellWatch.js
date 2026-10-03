export const POST_DUMP_NO_SELL_WATCH_VERSION = 'POST_DUMP_NO_SELL_WATCH_V3_LONG_IMPULSE_ENTRY_20260927';

export const POST_DUMP_NO_SELL_STAGE = Object.freeze({
  BUY_IMPULSE: 'BUY_IMPULSE',
  NO_SELL_CONFIRMATION: 'NO_SELL_CONFIRMATION',
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

function findDumpContext(rows15m, impulseAt) {
  const rows = rows15m
    .filter((row) => closeTime(row) < impulseAt)
    .slice(-97);
  if (rows.length < 36) return null;

  let selected = null;
  for (let index = 20; index <= rows.length - 3; index += 1) {
    const current = rows[index];
    const currentLow = value(current, 'low', 3);
    const prior = rows.slice(Math.max(0, index - 32), index);
    const priorHigh = Math.max(...prior.map((row) => value(row, 'high', 2)).filter(Number.isFinite));
    if (!(currentLow > 0) || !(priorHigh > 0)) continue;
    const dumpPct = ((currentLow / priorHigh) - 1) * 100;
    const dumpDepthPct = Math.abs(Math.min(0, dumpPct));
    const currentVolume = value(current, 'quoteVolume', 7);
    const priorMedianVolume = median(prior.slice(-20).map((row) => value(row, 'quoteVolume', 7)));
    const dumpVolumeRatio = currentVolume > 0 && priorMedianVolume > 0
      ? currentVolume / priorMedianVolume
      : null;
    const qualified = dumpDepthPct >= 8 || (dumpDepthPct >= 4 && dumpVolumeRatio >= 2.5);
    if (!qualified) continue;
    selected = {
      dumpAt: closeTime(current),
      dumpPrice: currentLow,
      dumpFromPrice: priorHigh,
      dumpPct,
      dumpDepthPct,
      dumpVolumeRatio,
    };
  }
  return selected;
}

function candidateForImpulse(rows5m, rows15m, impulseIndex) {
  const impulse = rows5m[impulseIndex];
  const impulseAt = closeTime(impulse);
  const dump = findDumpContext(rows15m, impulseAt);
  if (!dump) return { reason: 'NO_RECENT_DUMP' };

  const baseRows = rows5m
    .slice(Math.max(0, impulseIndex - 48), impulseIndex)
    .filter((row) => closeTime(row) > dump.dumpAt)
    .slice(-36);
  if (baseRows.length < 6) return { reason: 'INSUFFICIENT_ACCUMULATION_BASE' };
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
  const atr14 = atr(beforeImpulse);
  const ema13 = ema(beforeImpulse.map((row) => value(row, 'close', 4)), 13);
  const ema25 = ema(beforeImpulse.map((row) => value(row, 'close', 4)), 25);
  const risePct = impulseOpen > 0 ? ((impulseClose / impulseOpen) - 1) * 100 : null;
  const rangeAtr = atr14 > 0 ? (impulseHigh - impulseLow) / atr14 : null;
  const volumeRatio = impulseVolume > 0 && medianVolume > 0 ? impulseVolume / medianVolume : null;
  const candleRange = impulseHigh - impulseLow;
  const closeLocationPct = candleRange > 0 ? ((impulseClose - impulseLow) / candleRange) * 100 : null;
  const brokeBase = impulseClose > baseHigh;
  const brokeEma = impulseClose > ema13 && impulseClose > ema25;
  const strongRange = risePct >= 1.2 || rangeAtr >= 1.5;

  if (!(impulseClose > impulseOpen)) return { reason: 'IMPULSE_NOT_GREEN' };
  if (!brokeBase) return { reason: 'BASE_NOT_BROKEN' };
  if (!brokeEma) return { reason: 'EMA_NOT_RECLAIMED' };
  if (!strongRange) return { reason: 'BUY_RANGE_TOO_SMALL' };
  if (!(volumeRatio >= 1.8)) return { reason: 'BUY_VOLUME_TOO_LOW' };
  if (!(impulseTakerBuyPct >= 58)) return { reason: 'TAKER_BUY_TOO_LOW' };
  if (!(closeLocationPct >= 75)) return { reason: 'STRONG_CLOSE_NOT_CONFIRMED' };

  return {
    reason: 'ACCEPTED',
    dump,
    baseLow,
    baseHigh,
    baseRangePct,
    impulseAt,
    impulseOpen,
    impulseHigh,
    impulseLow,
    impulseClose,
    impulseVolume,
    impulseEma13: ema13,
    impulseEma25: ema25,
    atr14,
    risePct,
    rangeAtr,
    volumeRatio,
    impulseTakerBuyPct,
    closeLocationPct,
  };
}

function scoreCandidate(candidate, confirmed) {
  const dumpScore = clamp((candidate.dump.dumpDepthPct - 4) * 2.5, 10, 25);
  const rangeScore = clamp((candidate.risePct - 1.2) * 6, 5, 15);
  const volumeScore = clamp((candidate.volumeRatio - 1.8) * 8, 5, 15);
  const buyScore = clamp((candidate.impulseTakerBuyPct - 58) * 1.25, 5, 15);
  const confirmationScore = confirmed ? 25 : 5;
  return clamp(round(dumpScore + rangeScore + volumeScore + buyScore + confirmationScore, 1), 0, 100);
}

/**
 * Closed-candle, causal inverse of the post-pump no-buy watch. LONG keeps its
 * original behavior: the first qualified buy impulse can execute; confirmation
 * remains a Discord update and never creates a second entry.
 */
export function evaluatePostDumpNoSellWatch({ symbol, rows5m = [], rows15m = [] } = {}) {
  const clean5m = rows5m.filter((row) => closeTime(row) != null).sort((a, b) => closeTime(a) - closeTime(b));
  const clean15m = rows15m.filter((row) => closeTime(row) != null).sort((a, b) => closeTime(a) - closeTime(b));
  if (clean5m.length < 40 || clean15m.length < 36) return { watch: null, reason: 'INSUFFICIENT_DATA' };

  let candidate = null;
  let lastReason = 'NO_BUY_IMPULSE';
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
  const emaDistanceAtr = latestAtr14 > 0 && latestClose > latestEma13
    ? (latestClose - latestEma13) / latestAtr14
    : 0;
  const moveAboveBasePct = latestClose > candidate.baseHigh
    ? ((latestClose / candidate.baseHigh) - 1) * 100
    : 0;
  const overextended = latestRsi14 > 75 || emaDistanceAtr > 2 || moveAboveBasePct > 5;

  const impulseBody = Math.max(candidate.impulseClose - candidate.impulseOpen, candidate.atr14 * 0.1);
  const minFollowLow = followRows.length
    ? Math.min(...followRows.map((row) => value(row, 'low', 3)).filter(Number.isFinite))
    : candidate.impulseClose;
  const pullbackPct = Math.max(0, ((candidate.impulseClose - minFollowLow) / impulseBody) * 100);
  const followVolumeRatio = followRows.length && candidate.impulseVolume > 0
    ? (followRows.reduce((sum, row) => sum + value(row, 'quoteVolume', 7), 0) / followRows.length) / candidate.impulseVolume
    : null;
  const followTakerBuyPct = followRows.length ? takerBuyPct(followRows) : null;
  const followTakerSellPct = Number.isFinite(followTakerBuyPct) ? 100 - followTakerBuyPct : null;
  const noBreakdown = followRows.length
    ? followRows.every((row) => value(row, 'close', 4) > candidate.baseHigh)
      && latestClose > latestEma13
    : true;
  const higherLow = followRows.length < 2
    || value(followRows.at(-1), 'low', 3) >= value(followRows[0], 'low', 3);
  const noSellConfirmed = followRows.length >= 2
    && pullbackPct <= 35
    && Number.isFinite(followVolumeRatio) && followVolumeRatio <= 0.6
    && Number.isFinite(followTakerSellPct) && followTakerSellPct <= 45
    && noBreakdown
    && higherLow;

  if (followRows.length >= 2 && !noSellConfirmed) {
    return {
      watch: null,
      reason: noBreakdown ? 'SELL_FORCE_NOT_WEAK' : 'BASE_LOST',
      diagnostics: {
        pullbackPct: round(pullbackPct, 1),
        followVolumeRatio: round(followVolumeRatio, 2),
        followTakerSellPct: round(followTakerSellPct, 1),
      },
    };
  }

  const stage = overextended
    ? POST_DUMP_NO_SELL_STAGE.LATE_NO_CHASE
    : noSellConfirmed
      ? POST_DUMP_NO_SELL_STAGE.NO_SELL_CONFIRMATION
      : POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE;
  const label = overextended
    ? 'ĐÃ BƠM QUÁ XA · KHÔNG LONG ĐUỔI'
    : noSellConfirmed
      ? 'KHÔNG CÒN LỰC BÁN · CHỜ RETEST LONG'
      : 'HỒI MẠNH SAU XẢ · CẢNH BÁO SỚM';
  const observedAt = overextended || noSellConfirmed ? closeTime(latest) : candidate.impulseAt;
  const entryLow = Math.min(candidate.baseHigh, candidate.impulseEma13);
  const entryHigh = Math.max(candidate.baseHigh, candidate.impulseEma13);

  return {
    reason: 'ACCEPTED',
    watch: {
      version: POST_DUMP_NO_SELL_WATCH_VERSION,
      symbol: String(symbol ?? '').trim().toUpperCase(),
      side: 'LONG',
      stage,
      label,
      watchOnly: true,
      binanceEligible: false,
      executionCandidate: stage === POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE,
      observedAt,
      priceAtWatch: round(latestClose, 10),
      score: scoreCandidate(candidate, noSellConfirmed),
      dumpAt: candidate.dump.dumpAt,
      dumpPrice: round(candidate.dump.dumpPrice, 10),
      dumpPct: round(candidate.dump.dumpPct, 2),
      dumpDepthPct: round(candidate.dump.dumpDepthPct, 2),
      dumpVolumeRatio: round(candidate.dump.dumpVolumeRatio, 2),
      accumulationBaseLow: round(candidate.baseLow, 10),
      accumulationBaseHigh: round(candidate.baseHigh, 10),
      impulseAt: candidate.impulseAt,
      impulseRisePct: round(candidate.risePct, 2),
      impulseRangeAtr: round(candidate.rangeAtr, 2),
      impulseVolumeRatio: round(candidate.volumeRatio, 2),
      impulseTakerBuyPct: round(candidate.impulseTakerBuyPct, 1),
      followBars: followRows.length,
      pullbackPct: round(pullbackPct, 1),
      followVolumeRatio: round(followVolumeRatio, 2),
      followTakerSellPct: round(followTakerSellPct, 1),
      rsi14: round(latestRsi14, 1),
      emaDistanceAtr: round(emaDistanceAtr, 2),
      moveAboveBasePct: round(moveAboveBasePct, 2),
      retestZone: { low: round(entryLow, 10), high: round(entryHigh, 10) },
      invalidationPrice: round(Math.min(candidate.baseLow, candidate.impulseOpen), 10),
      note: overextended
        ? 'Giá đã hồi quá xa khỏi vùng/EMA hoặc RSI quá cao; chỉ theo dõi, tuyệt đối không LONG đuổi.'
        : noSellConfirmed
          ? 'Lực bán sau nhịp hồi vẫn yếu; chỉ quan sát retest vùng đỉnh tích lũy/EMA13, không LONG đuổi.'
          : 'Cây hồi đầu tiên vừa đóng; chờ thêm 2-3 nến 5m xác nhận thiếu lực bán.',
    },
  };
}
