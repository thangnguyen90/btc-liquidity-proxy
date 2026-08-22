export const LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_VERSION =
  'LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_V1_20260818';

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

function trueRange(bars, index) {
  const bar = bars[index];
  const previousClose = finite(bars[index - 1]?.close, finite(bar?.open, 0));
  return Math.max(
    finite(bar?.high, 0) - finite(bar?.low, 0),
    Math.abs(finite(bar?.high, 0) - previousClose),
    Math.abs(finite(bar?.low, 0) - previousClose),
  );
}

function atr(bars = [], period = 14) {
  const values = [];
  for (let index = Math.max(1, bars.length - period); index < bars.length; index += 1) {
    const range = trueRange(bars, index);
    if (range > 0) values.push(range);
  }
  return values.length >= 8
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

export function buildFadingWaveLivePumpSnapshot(klines = [], now = Date.now()) {
  const bars = (Array.isArray(klines) ? klines : [])
    .filter((bar) => finite(bar?.close, 0) > 0)
    .sort((a, b) => finite(a?.openTime, 0) - finite(b?.openTime, 0))
    .slice(-240);
  const live = bars.at(-1)?.closeTime && finite(bars.at(-1).closeTime, 0) > now
    ? bars.at(-1)
    : null;
  const closed = bars.filter((bar) => finite(bar?.closeTime, Infinity) <= now).slice(-220);
  const empty = {
    version: LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_VERSION,
    ready: false,
    shortReady: false,
    stage: live ? 'LIVE_NO_MATCH' : 'NO_LIVE_CANDLE',
    closedCandleCount: closed.length,
    liveCandleOpenAt: finite(live?.openTime, null),
    liveCandleCloseAt: finite(live?.closeTime, null),
  };
  if (!live || closed.length < 110) return empty;

  const closes = closed.map((bar) => finite(bar.close, 0));
  const ema13Series = emaSeries(closes, 13);
  const ema25Series = emaSeries(closes, 25);
  const ema99Series = emaSeries(closes, 99);
  const ema13 = ema13Series.at(-1);
  const ema25 = ema25Series.at(-1);
  const ema99 = ema99Series.at(-1);
  const ema99Prior = ema99Series.at(-13);
  const ema99Slope12Pct = ema99Prior > 0 ? (ema99 - ema99Prior) / ema99Prior * 100 : null;
  const lastClosed = closed.at(-1);
  const lastClosedPrice = finite(lastClosed?.close, 0);
  const downReturn12Pct = closes.at(-13) > 0
    ? (lastClosedPrice - closes.at(-13)) / closes.at(-13) * 100
    : null;
  const belowEma99Bars = closed.slice(-12).filter((bar, index, rows) => {
    const sourceIndex = ema99Series.length - rows.length + index;
    return finite(bar.close, Infinity) < finite(ema99Series[sourceIndex], -Infinity);
  }).length;

  const recent = closed.slice(-48);
  let peakIndex = 0;
  for (let index = 1; index < recent.length; index += 1) {
    if (finite(recent[index]?.high, 0) > finite(recent[peakIndex]?.high, 0)) peakIndex = index;
  }
  const priorWavePeak = finite(recent[peakIndex]?.high, 0);
  const barsSinceWavePeak = recent.length - 1 - peakIndex;
  const liveOpen = finite(live.open, 0);
  const liveHigh = finite(live.high, 0);
  const liveLow = finite(live.low, 0);
  const liveClose = finite(live.close, 0);
  const waveDrawdownPct = priorWavePeak > 0 && liveOpen > 0
    ? (priorWavePeak - liveOpen) / priorWavePeak * 100
    : null;
  const liveRange = Math.max(liveHigh - liveLow, 1e-12);
  const liveAtr = atr(closed, 14);
  const livePumpHighPct = liveOpen > 0 ? (liveHigh - liveOpen) / liveOpen * 100 : null;
  const liveMarkPumpPct = liveOpen > 0 ? (liveClose - liveOpen) / liveOpen * 100 : null;
  const liveGivebackPct = liveHigh > 0 ? (liveHigh - liveClose) / liveHigh * 100 : null;
  const liveUpperWickShare = Math.max(0, liveHigh - Math.max(liveOpen, liveClose)) / liveRange;
  const liveRangeAtr = liveAtr > 0 ? liveRange / liveAtr : null;
  const baselineVolume = median(closed.slice(-20).map(quoteVolume));
  const liveVolumeX = baselineVolume > 0 ? quoteVolume(live) / baselineVolume : null;
  const liveTakerDeltaPct = takerDeltaPct(live);
  const trendReady = ema13 < ema25
    && ema25 < ema99
    && ema99Slope12Pct <= -0.15
    && lastClosedPrice < ema99
    && downReturn12Pct <= -1.5
    && belowEma99Bars >= 8
    && barsSinceWavePeak >= 6
    && waveDrawdownPct >= 3;
  const livePumpReady = livePumpHighPct >= 4
    && liveMarkPumpPct >= 2
    && liveGivebackPct >= 0.6
    && liveGivebackPct <= 6
    && liveUpperWickShare >= 0.08
    && liveRangeAtr >= 2.5
    && liveVolumeX >= 1.8
    && liveTakerDeltaPct >= 8
    && liveHigh >= ema99 * 1.005
    && liveClose >= ema99;
  const shortReady = trendReady && livePumpReady;

  return {
    ...empty,
    ready: true,
    shortReady,
    stage: shortReady ? 'LIVE_PUMP_SHORT_READY' : trendReady ? 'FADING_WAVE_WATCH' : 'NO_DOWNTREND',
    readyAt: shortReady ? finite(live.openTime, null) : null,
    detectedAt: shortReady ? now : null,
    ema13,
    ema25,
    ema99,
    ema99Slope12Pct,
    downReturn12Pct,
    belowEma99Bars,
    priorWavePeak,
    barsSinceWavePeak,
    waveDrawdownPct,
    liveOpen,
    liveHigh,
    liveLow,
    liveClose,
    livePumpHighPct,
    liveMarkPumpPct,
    liveGivebackPct,
    liveUpperWickShare,
    liveRangeAtr,
    liveVolumeX,
    liveTakerDeltaPct,
  };
}
