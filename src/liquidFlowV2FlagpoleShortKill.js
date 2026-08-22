export const LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_VERSION =
  'LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_V1_20260818';

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

function trueRange(bars, index) {
  const bar = bars[index];
  const previousClose = finite(bars[index - 1]?.close, finite(bar?.open, 0));
  return Math.max(
    finite(bar?.high, 0) - finite(bar?.low, 0),
    Math.abs(finite(bar?.high, 0) - previousClose),
    Math.abs(finite(bar?.low, 0) - previousClose),
  );
}

function atrBefore(bars, index, period = 14) {
  const values = [];
  for (let cursor = Math.max(1, index - period); cursor < index; cursor += 1) {
    const range = trueRange(bars, cursor);
    if (range > 0) values.push(range);
  }
  return values.length >= 8
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function closedBarsAt(klines = [], now = Date.now(), limit = 220) {
  return (Array.isArray(klines) ? klines : [])
    .filter((bar) => finite(bar?.closeTime, Infinity) <= now)
    .sort((a, b) => finite(a?.openTime, 0) - finite(b?.openTime, 0))
    .slice(-limit);
}

// Causal sequence:
// 1) a prior pump leg already happened;
// 2) price pulled back/consolidated for at least four closed 5m candles;
// 3) a tall bullish flagpole breaks the local high on volume/taker buy;
// 4) the next closed candle sweeps down and pulls its lower wick back up.
// Force-order BUY confirmation is deliberately applied by the classifier, not
// here, because liquidation data is a separate live stream.
export function buildFlagpoleShortKillSnapshot(klines = [], now = Date.now()) {
  const bars = closedBarsAt(klines, now, 220);
  const empty = {
    version: LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_VERSION,
    ready: false,
    candleCount: bars.length,
    candleClosedAt: finite(bars.at(-1)?.closeTime, null),
    watchReady: false,
    longReady: false,
    stage: 'NO_DATA',
  };
  if (bars.length < 60) return empty;

  const lastIndex = bars.length - 1;
  let selectedWatch = null;
  let selectedReady = null;
  for (let flagpoleIndex = Math.max(45, lastIndex - 2); flagpoleIndex < lastIndex; flagpoleIndex += 1) {
    const confirmationIndex = flagpoleIndex + 1;
    const flagpole = bars[flagpoleIndex];
    const confirmation = bars[confirmationIndex];
    if (!flagpole || !confirmation) continue;

    const contextStart = Math.max(0, flagpoleIndex - 48);
    const contextEnd = flagpoleIndex - 5;
    if (contextEnd <= contextStart) continue;
    let priorPeakIndex = contextStart;
    for (let cursor = contextStart + 1; cursor <= contextEnd; cursor += 1) {
      if (finite(bars[cursor]?.high, 0) > finite(bars[priorPeakIndex]?.high, 0)) {
        priorPeakIndex = cursor;
      }
    }
    const priorPeak = finite(bars[priorPeakIndex]?.high, 0);
    const prePumpStart = Math.max(contextStart, priorPeakIndex - 36);
    const prePumpLow = Math.min(...bars.slice(prePumpStart, priorPeakIndex + 1)
      .map((bar) => finite(bar?.low, Infinity)));
    const priorPumpPct = prePumpLow > 0 ? (priorPeak - prePumpLow) / prePumpLow * 100 : null;
    const pullbackBars = bars.slice(priorPeakIndex + 1, flagpoleIndex);
    const pullbackLow = pullbackBars.length
      ? Math.min(...pullbackBars.map((bar) => finite(bar?.low, Infinity)))
      : null;
    const pullbackPct = priorPeak > 0 && pullbackLow > 0
      ? (priorPeak - pullbackLow) / priorPeak * 100
      : null;
    const barsAfterPriorPeak = flagpoleIndex - priorPeakIndex;

    const priorBreakoutBars = bars.slice(Math.max(0, flagpoleIndex - 18), flagpoleIndex);
    const breakoutLevel = Math.max(...priorBreakoutBars.map((bar) => finite(bar?.high, 0)));
    const baselineVolume = median(bars.slice(flagpoleIndex - 20, flagpoleIndex).map(quoteVolume));
    const atr = atrBefore(bars, flagpoleIndex, 14);
    const previousClose = finite(bars[flagpoleIndex - 1]?.close, finite(flagpole.open, 0));
    const flagpoleOpen = finite(flagpole.open, 0);
    const flagpoleHigh = finite(flagpole.high, 0);
    const flagpoleLow = finite(flagpole.low, 0);
    const flagpoleClose = finite(flagpole.close, 0);
    const flagpoleRange = Math.max(flagpoleHigh - flagpoleLow, 1e-12);
    const flagpoleBodyPct = flagpoleOpen > 0 ? (flagpoleClose - flagpoleOpen) / flagpoleOpen * 100 : null;
    const flagpoleRangePct = previousClose > 0 ? flagpoleRange / previousClose * 100 : null;
    const flagpoleRangeAtr = atr > 0 ? flagpoleRange / atr : null;
    const flagpoleVolumeX = baselineVolume > 0 ? quoteVolume(flagpole) / baselineVolume : null;
    const flagpoleTakerDeltaPct = takerDeltaPct(flagpole);
    const flagpoleClosePosition = (flagpoleClose - flagpoleLow) / flagpoleRange;
    const flagpoleConfirmed = priorPumpPct >= 8
      && barsAfterPriorPeak >= 4
      && pullbackPct >= 2.5
      && flagpoleClose > flagpoleOpen
      && flagpoleHigh >= breakoutLevel * 1.002
      && flagpoleBodyPct >= 1.5
      && flagpoleRangePct >= 2.5
      && flagpoleRangeAtr >= 2.2
      && flagpoleVolumeX >= 2.5
      && flagpoleTakerDeltaPct >= 8
      && flagpoleClosePosition >= 0.72;
    if (!flagpoleConfirmed) continue;

    const confirmationOpen = finite(confirmation.open, 0);
    const confirmationHigh = finite(confirmation.high, 0);
    const confirmationLow = finite(confirmation.low, 0);
    const confirmationClose = finite(confirmation.close, 0);
    const confirmationRange = Math.max(confirmationHigh - confirmationLow, 1e-12);
    const confirmationLowerWick = Math.max(
      0,
      Math.min(confirmationOpen, confirmationClose) - confirmationLow,
    );
    const confirmationLowerWickShare = confirmationLowerWick / confirmationRange;
    const confirmationClosePosition = (confirmationClose - confirmationLow) / confirmationRange;
    const confirmationVolumeX = baselineVolume > 0 ? quoteVolume(confirmation) / baselineVolume : null;
    const confirmationTakerDeltaPct = takerDeltaPct(confirmation);
    const flagpoleMid = flagpoleOpen + (flagpoleClose - flagpoleOpen) * 0.55;
    const wickReclaimConfirmed = confirmationLowerWickShare >= 0.2
      && confirmationLow >= flagpoleOpen * 0.985
      && confirmationClose >= flagpoleMid
      && confirmationClose >= flagpoleClose * 0.995
      && confirmationClosePosition >= 0.6
      && confirmationVolumeX >= 1
      && confirmationTakerDeltaPct >= 0;
    const snapshot = {
      ...empty,
      ready: true,
      watchReady: !wickReclaimConfirmed,
      longReady: wickReclaimConfirmed,
      stage: wickReclaimConfirmed ? 'LONG_READY' : 'FLAGPOLE_WATCH',
      priorPeakAt: finite(bars[priorPeakIndex]?.closeTime, null),
      flagpoleAt: finite(flagpole.closeTime, null),
      readyAt: wickReclaimConfirmed ? finite(confirmation.closeTime, null) : null,
      priorPeak,
      prePumpLow,
      priorPumpPct,
      pullbackLow,
      pullbackPct,
      barsAfterPriorPeak,
      breakoutLevel,
      flagpoleBodyPct,
      flagpoleRangePct,
      flagpoleRangeAtr,
      flagpoleVolumeX,
      flagpoleTakerDeltaPct,
      flagpoleClosePosition,
      confirmationLowerWickShare,
      confirmationClosePosition,
      confirmationVolumeX,
      confirmationTakerDeltaPct,
      confirmationClose,
    };
    if (wickReclaimConfirmed) selectedReady = snapshot;
    else selectedWatch = snapshot;
  }
  return selectedReady ?? selectedWatch ?? empty;
}
