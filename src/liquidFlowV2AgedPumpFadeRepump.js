export const LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_VERSION =
  'LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_V1_20260901';

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quoteVolume(bar = {}) {
  return finite(bar.quoteVolume, finite(bar.volume, 0));
}

function takerDeltaPct(bar = {}) {
  const quote = quoteVolume(bar);
  const takerBuy = finite(bar.takerBuyQuoteVolume, finite(bar.takerBuyQuote, 0));
  return quote > 0 ? (takerBuy * 2 - quote) / quote * 100 : null;
}

function emaSeries(values = [], period = 13) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push(values[index] * alpha + output[index - 1] * (1 - alpha));
  }
  return output;
}

function trueRange(bars = [], index = 0) {
  const bar = bars[index];
  const previousClose = finite(bars[index - 1]?.close, finite(bar?.open, 0));
  return Math.max(
    finite(bar?.high, 0) - finite(bar?.low, 0),
    Math.abs(finite(bar?.high, 0) - previousClose),
    Math.abs(finite(bar?.low, 0) - previousClose),
  );
}

function atrBefore(bars = [], index = 0, period = 14) {
  const ranges = [];
  for (let cursor = Math.max(1, index - period); cursor < index; cursor += 1) {
    const range = trueRange(bars, cursor);
    if (range > 0) ranges.push(range);
  }
  return ranges.length >= 8
    ? ranges.reduce((sum, value) => sum + value, 0) / ranges.length
    : null;
}

function lowerHighStructure(bars = []) {
  if (bars.length < 8) return { chunkHighs: [], lowerHighSteps: 0 };
  const chunkCount = Math.min(4, Math.floor(bars.length / 3));
  const chunkHighs = [];
  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    const from = Math.floor(chunk * bars.length / chunkCount);
    const to = Math.max(from + 1, Math.floor((chunk + 1) * bars.length / chunkCount));
    const highs = bars.slice(from, to).map((bar) => finite(bar?.high, 0));
    chunkHighs.push(median(highs));
  }
  let lowerHighSteps = 0;
  for (let index = 1; index < chunkHighs.length; index += 1) {
    if (finite(chunkHighs[index], Infinity) <= finite(chunkHighs[index - 1], 0) * 0.998) {
      lowerHighSteps += 1;
    }
  }
  return { chunkHighs, lowerHighSteps };
}

function closedBarsAt(klines = [], now = Date.now(), limit = 340) {
  return (Array.isArray(klines) ? klines : [])
    .filter((bar) => finite(bar?.close, 0) > 0 && finite(bar?.closeTime, Infinity) <= now)
    .sort((a, b) => finite(a?.openTime, 0) - finite(b?.openTime, 0))
    .slice(-limit);
}

function evaluateSignalAt(bars, signalIndex, ema13Series, ema25Series, ema99Series) {
  const signal = bars[signalIndex];
  if (!signal || signalIndex < 110) return null;

  // Leave at least eight completed 5m bars between the old peak and this
  // repump. This deliberately excludes the first pump and immediate aftershock.
  const contextStart = Math.max(0, signalIndex - 216);
  const contextEnd = signalIndex - 8;
  if (contextEnd <= contextStart) return null;
  let priorPeakIndex = contextStart;
  for (let cursor = contextStart + 1; cursor <= contextEnd; cursor += 1) {
    if (finite(bars[cursor]?.high, 0) > finite(bars[priorPeakIndex]?.high, 0)) {
      priorPeakIndex = cursor;
    }
  }
  const priorPeak = finite(bars[priorPeakIndex]?.high, 0);
  const prePeakStart = Math.max(contextStart, priorPeakIndex - 72);
  const prePeakLow = Math.min(...bars.slice(prePeakStart, priorPeakIndex + 1)
    .map((bar) => finite(bar?.low, Infinity)));
  const priorPumpPct = prePeakLow > 0 ? (priorPeak - prePeakLow) / prePeakLow * 100 : null;
  const barsSincePriorPeak = signalIndex - priorPeakIndex;

  const fadeBars = bars.slice(Math.min(priorPeakIndex + 2, signalIndex), signalIndex);
  if (fadeBars.length < 6) return null;
  const fadeStartClose = finite(fadeBars[0]?.close, 0);
  const signalOpen = finite(signal.open, 0);
  const fadeReturnPct = fadeStartClose > 0
    ? (signalOpen - fadeStartClose) / fadeStartClose * 100
    : null;
  const waveDrawdownPct = priorPeak > 0
    ? (priorPeak - signalOpen) / priorPeak * 100
    : null;
  const { chunkHighs, lowerHighSteps } = lowerHighStructure(fadeBars);

  const priorIndex = signalIndex - 1;
  const ema13 = finite(ema13Series[priorIndex], null);
  const ema25 = finite(ema25Series[priorIndex], null);
  const ema99 = finite(ema99Series[priorIndex], null);
  const ema25Prior = finite(ema25Series[Math.max(0, priorIndex - 12)], null);
  const ema25Slope12Pct = ema25Prior > 0 ? (ema25 - ema25Prior) / ema25Prior * 100 : null;
  const bearishFade = ema13 > 0 && ema25 > 0 && ema99 > 0
    && ema13 < ema25
    && ema25 < ema99
    && ema25Slope12Pct <= -0.35;

  const signalHigh = finite(signal.high, 0);
  const signalLow = finite(signal.low, 0);
  const signalClose = finite(signal.close, 0);
  const signalRange = Math.max(signalHigh - signalLow, 1e-12);
  const signalHighOpenPct = signalOpen > 0 ? (signalHigh - signalOpen) / signalOpen * 100 : null;
  const signalCloseOpenPct = signalOpen > 0 ? (signalClose - signalOpen) / signalOpen * 100 : null;
  const signalGivebackPct = signalHigh > 0 ? (signalHigh - signalClose) / signalHigh * 100 : null;
  const signalUpperWickShare = Math.max(
    0,
    signalHigh - Math.max(signalOpen, signalClose),
  ) / signalRange;
  const atr = atrBefore(bars, signalIndex, 14);
  const signalRangeAtr = atr > 0 ? signalRange / atr : null;
  const baselineVolume = median(bars.slice(Math.max(0, signalIndex - 20), signalIndex)
    .map(quoteVolume));
  const signalVolumeX = baselineVolume > 0 ? quoteVolume(signal) / baselineVolume : null;
  const signalTakerDeltaPct = takerDeltaPct(signal);
  const recentLocalHigh = Math.max(...bars.slice(Math.max(0, signalIndex - 12), signalIndex)
    .map((bar) => finite(bar?.high, 0)));
  const localHighSweepPct = recentLocalHigh > 0
    ? (signalHigh - recentLocalHigh) / recentLocalHigh * 100
    : null;

  const contextReady = priorPumpPct >= 10
    && barsSincePriorPeak >= 8
    && waveDrawdownPct >= 10
    && fadeReturnPct <= -2
    && lowerHighSteps >= 1
    && bearishFade;
  const repumpStrong = signalHighOpenPct >= 4.5
    && signalCloseOpenPct >= 1.5
    && signalRangeAtr >= 2.2
    && signalVolumeX >= 2.5
    && signalTakerDeltaPct >= 5
    && localHighSweepPct >= 0.5
    && signalHigh >= ema25 * 1.005;
  const rejectionReady = signalGivebackPct >= 1
    && signalGivebackPct <= 8
    && signalUpperWickShare >= 0.2
    && signalClose <= priorPeak * 0.98
    && signalClose <= ema99 * 1.01;
  const shortReady = contextReady && repumpStrong && rejectionReady;

  return {
    ready: true,
    watchReady: contextReady && !shortReady,
    shortReady,
    stage: shortReady ? 'REPUMP_SHORT_ALERT' : contextReady ? 'AGED_FADE_WATCH' : 'NO_MATCH',
    priorPeakAt: finite(bars[priorPeakIndex]?.closeTime, null),
    signalCandleClosedAt: finite(signal.closeTime, null),
    readyAt: shortReady ? finite(signal.closeTime, null) : null,
    priorPeak,
    prePeakLow,
    priorPumpPct,
    barsSincePriorPeak,
    waveDrawdownPct,
    fadeReturnPct,
    fadeBarCount: fadeBars.length,
    lowerHighSteps,
    fadeChunkHighs: chunkHighs,
    ema13,
    ema25,
    ema99,
    ema25Slope12Pct,
    signalOpen,
    signalHigh,
    signalLow,
    signalClose,
    signalHighOpenPct,
    signalCloseOpenPct,
    signalGivebackPct,
    signalUpperWickShare,
    signalRangeAtr,
    signalVolumeX,
    signalTakerDeltaPct,
    recentLocalHigh,
    localHighSweepPct,
    contextReady,
    repumpStrong,
    rejectionReady,
  };
}

// Closed-candle detector for an aged pump -> controlled fade -> sudden repump
// that sweeps recent SHORT positions and then gives back from the spike. It is
// intentionally independent from the live executable FADING_WAVE detector.
export function buildAgedPumpFadeRepumpSnapshot(klines = [], now = Date.now()) {
  const bars = closedBarsAt(klines, now, 340);
  const empty = {
    version: LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_VERSION,
    ready: false,
    watchReady: false,
    shortReady: false,
    stage: bars.length < 120 ? 'NO_DATA' : 'NO_MATCH',
    candleCount: bars.length,
    candleClosedAt: finite(bars.at(-1)?.closeTime, null),
  };
  if (bars.length < 120) return empty;

  const closes = bars.map((bar) => finite(bar?.close, 0));
  const ema13Series = emaSeries(closes, 13);
  const ema25Series = emaSeries(closes, 25);
  const ema99Series = emaSeries(closes, 99);
  const lastIndex = bars.length - 1;
  let selectedReady = null;
  let selectedWatch = null;
  for (let signalIndex = Math.max(110, lastIndex - 1); signalIndex <= lastIndex; signalIndex += 1) {
    const snapshot = evaluateSignalAt(
      bars,
      signalIndex,
      ema13Series,
      ema25Series,
      ema99Series,
    );
    if (!snapshot) continue;
    if (snapshot.shortReady) selectedReady = snapshot;
    else if (snapshot.watchReady) selectedWatch = snapshot;
  }
  return {
    ...empty,
    ...(selectedReady ?? selectedWatch ?? {}),
  };
}
