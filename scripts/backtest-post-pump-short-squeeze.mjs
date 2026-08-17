import { detectPostPumpKillShort } from '../src/postPumpKillShortDetector.js';

const BASE = process.env.BINANCE_FUTURES_BASE_URL ?? 'https://fapi.binance.com';
const DAYS = Math.max(1, Math.min(14, Number(process.env.POST_PUMP_SQUEEZE_DAYS ?? 7)));
const UNIVERSE_LIMIT = Math.max(50, Math.min(250, Number(process.env.POST_PUMP_SQUEEZE_UNIVERSE ?? 150)));
const MIN_QUOTE_VOLUME = Math.max(0, Number(process.env.POST_PUMP_SQUEEZE_MIN_QUOTE_VOLUME ?? 2_000_000));
const LEVERAGE = 5;
const FEE_ROE = 0.4;
const HOLD_BARS = 48; // 4h on 5m candles
const TP_PRICE_PCT = 2;
const SL_PRICE_PCT = 4;
const REQUEST_DELAY_MS = Math.max(50, Number(process.env.POST_PUMP_SQUEEZE_REQUEST_DELAY_MS ?? 120));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 3) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

async function getJson(path, attempt = 0) {
  const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(20_000) });
  if ((response.status === 418 || response.status === 429 || response.status >= 500) && attempt < 7) {
    await sleep(750 * (attempt + 1));
    return getJson(path, attempt + 1);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status} ${path}: ${JSON.stringify(payload).slice(0, 180)}`);
  return payload;
}

async function getPaged(path, startTime, endTime, limit) {
  const rows = [];
  let cursor = startTime;
  while (cursor <= endTime) {
    const separator = path.includes('?') ? '&' : '?';
    const page = await getJson(`${path}${separator}startTime=${Math.trunc(cursor)}&endTime=${Math.trunc(endTime)}&limit=${limit}`);
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    const lastTime = finite(Array.isArray(page.at(-1)) ? page.at(-1)?.[0] : page.at(-1)?.timestamp, null);
    if (lastTime == null || page.length < limit) break;
    cursor = lastTime + 5 * 60_000;
    await sleep(REQUEST_DELAY_MS);
  }
  return rows;
}

async function getKlines(symbol, startTime, endTime) {
  const raw = await getPaged(`/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=5m`, startTime, endTime, 1500);
  return raw.map((row) => ({
    openTime: finite(row[0]),
    open: finite(row[1]),
    high: finite(row[2]),
    low: finite(row[3]),
    close: finite(row[4]),
    volume: finite(row[5]),
    closeTime: finite(row[6]),
    quoteVolume: finite(row[7], 0),
    takerBuyQuote: finite(row[10], 0),
  })).filter((row) => row.openTime != null && row.close > 0);
}

async function getOpenInterest(symbol, startTime, endTime) {
  const raw = [];
  let cursor = startTime;
  const windowMs = 499 * 5 * 60_000;
  while (cursor <= endTime) {
    const chunkEnd = Math.min(endTime, cursor + windowMs);
    const query = new URLSearchParams({
      symbol,
      period: '5m',
      startTime: String(Math.trunc(cursor)),
      endTime: String(Math.trunc(chunkEnd)),
      limit: '500',
    });
    const page = await getJson(`/futures/data/openInterestHist?${query}`);
    if (Array.isArray(page)) raw.push(...page);
    const lastTime = finite(page?.at(-1)?.timestamp, null);
    cursor = lastTime != null && lastTime >= cursor ? lastTime + 5 * 60_000 : chunkEnd + 5 * 60_000;
    await sleep(REQUEST_DELAY_MS);
  }
  // Use contract/base quantity rather than USD value so a price rise alone cannot fake OI growth.
  return new Map(raw.map((row) => [finite(row.timestamp), finite(row.sumOpenInterest)]));
}

function emaSeries(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length < period) return output;
  let value = values.slice(0, period).reduce((sum, row) => sum + row, 0) / period;
  output[period - 1] = value;
  const alpha = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    value = values[index] * alpha + value * (1 - alpha);
    output[index] = value;
  }
  return output;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pct(from, to) {
  return from > 0 ? (to / from - 1) * 100 : null;
}

function barTakerDelta(bar) {
  return bar.quoteVolume > 0 ? (bar.takerBuyQuote * 2 - bar.quoteVolume) / bar.quoteVolume * 100 : null;
}

function findPriceCandidates(symbol, bars, sessionStart) {
  const closes = bars.map((row) => row.close);
  const ema25 = emaSeries(closes, 25);
  const watchRows = [];
  const readyRows = [];
  const oldRows = [];
  let lastWatchAt = -Infinity;
  let lastReadyAt = -Infinity;
  let lastOldAt = -Infinity;

  for (let index = 320; index < bars.length - 1; index += 1) {
    const bar = bars[index];
    if (bar.closeTime < sessionStart) continue;
    const base = bars.slice(index - 12, index);
    const baseHigh = Math.max(...base.map((row) => row.high));
    const baseLow = Math.min(...base.map((row) => row.low));
    const baseStart = base[0]?.close;
    const baseEnd = base.at(-1)?.close;
    const baseRangePct = pct(baseLow, baseHigh);
    const baseReturnPct = pct(baseStart, baseEnd);
    const firstHalfLow = Math.min(...base.slice(0, 6).map((row) => row.low));
    const lastHalfLow = Math.min(...base.slice(6).map((row) => row.low));
    const lowsHolding = lastHalfLow >= firstHalfLow * 0.985;

    const contextStart = Math.max(0, index - 300);
    const contextEnd = index - 13;
    let peakIndex = contextStart;
    for (let cursor = contextStart + 1; cursor <= contextEnd; cursor += 1) {
      if (bars[cursor].high > bars[peakIndex].high) peakIndex = cursor;
    }
    const peak = bars[peakIndex].high;
    const prePeakStart = Math.max(contextStart, peakIndex - 288);
    const prePeakLow = Math.min(...bars.slice(prePeakStart, peakIndex + 1).map((row) => row.low));
    const pumpPct = pct(prePeakLow, peak);
    const drawdownPct = peak > 0 ? (peak - baseEnd) / peak * 100 : null;
    const crashSegment = bars.slice(peakIndex, index - 11);
    const crashPeakVolume = Math.max(...crashSegment.map((row) => row.quoteVolume), 0);
    const baseMedianVolume = median(base.map((row) => row.quoteVolume));
    const volumeFadeRatio = crashPeakVolume > 0 ? baseMedianVolume / crashPeakVolume : null;
    const contextPass = pumpPct >= 30
      && drawdownPct >= 25 && drawdownPct <= 75
      && index - peakIndex >= 12
      && baseRangePct <= 6
      && Math.abs(baseReturnPct) <= 3.5
      && lowsHolding
      && volumeFadeRatio != null && volumeFadeRatio <= 0.65;
    if (!contextPass) {
      // Still evaluate the current legacy detector on the same closed history.
    } else if (bar.closeTime - lastWatchAt >= 6 * 60 * 60_000) {
      watchRows.push({
        symbol, index, signalAt: bar.closeTime, pumpPct, drawdownPct, baseRangePct,
        baseReturnPct, volumeFadeRatio, baseHigh, baseLow, peak, peakIndex,
      });
      lastWatchAt = bar.closeTime;
    }

    const vol20 = median(bars.slice(index - 20, index).map((row) => row.quoteVolume));
    const volumeX = vol20 > 0 ? bar.quoteVolume / vol20 : null;
    const takerDeltaPct = barTakerDelta(bar);
    const bodyPct = pct(bar.open, bar.close);
    const closePosition = bar.high > bar.low ? (bar.close - bar.low) / (bar.high - bar.low) : 0;
    const ready = contextPass
      && bar.close >= baseHigh * 1.002
      && bar.close > ema25[index]
      && volumeX >= 1.8
      && takerDeltaPct >= 5
      && bodyPct > 0
      && closePosition >= 0.65;
    if (ready && bar.closeTime - lastReadyAt >= 12 * 60 * 60_000) {
      readyRows.push({
        symbol, index, signalAt: bar.closeTime, pumpPct, drawdownPct, baseRangePct,
        baseReturnPct, volumeFadeRatio, baseHigh, baseLow, peak, peakIndex,
        volumeX, takerDeltaPct, bodyPct, closePosition,
      });
      lastReadyAt = bar.closeTime;
    }

    if (bar.closeTime - lastOldAt >= 12 * 60 * 60_000) {
      const history = bars.slice(Math.max(0, index - 241), index + 1);
      const legacy = detectPostPumpKillShort(history);
      if (legacy.pass && legacy.action === 'SHORT') {
        oldRows.push({ symbol, index, signalAt: bar.closeTime, ...legacy });
        lastOldAt = bar.closeTime;
      }
    }
  }
  return { watchRows, readyRows, oldRows };
}

function enrichDerivatives(signal, bars, oiMap) {
  const baseStart = signal.index - 12;
  const beforeBreakout = signal.index - 1;
  const oiStart = oiMap.get(bars[baseStart]?.openTime);
  const oiBefore = oiMap.get(bars[beforeBreakout]?.openTime);
  const oiNow = oiMap.get(bars[signal.index]?.openTime);
  const oiTwoBarsAgo = oiMap.get(bars[signal.index - 2]?.openTime);
  const oiBuildPct = pct(oiStart, oiBefore);
  const oiReleasePct = pct(oiTwoBarsAgo, oiNow);
  const baseQuote = bars.slice(baseStart, signal.index).reduce((sum, row) => sum + row.quoteVolume, 0);
  const baseBuy = bars.slice(baseStart, signal.index).reduce((sum, row) => sum + row.takerBuyQuote, 0);
  const baseTakerDeltaPct = baseQuote > 0 ? (baseBuy * 2 - baseQuote) / baseQuote * 100 : null;
  const oiBuildPass = oiBuildPct != null && oiBuildPct >= 2 && baseTakerDeltaPct != null && baseTakerDeltaPct <= 0;
  const releasePass = oiReleasePct != null && oiReleasePct <= -0.5;
  const flowReleasePass = signal.takerDeltaPct >= 15 && signal.volumeX >= 2.2;
  return {
    ...signal,
    oiBuildPct,
    oiReleasePct,
    baseTakerDeltaPct,
    oiBuildPass,
    squeezeConfirmPass: oiBuildPass && (releasePass || flowReleasePass),
  };
}

function directionalRoe(side, entry, exit) {
  const pricePct = side === 'LONG' ? pct(entry, exit) : pct(exit, entry);
  return pricePct * LEVERAGE - FEE_ROE;
}

function evaluate(signal, bars, side) {
  const entryIndex = signal.index + 1;
  const entryBar = bars[entryIndex];
  if (!entryBar) return { ...signal, side, outcome: 'OPEN' };
  const entry = entryBar.open;
  const target = side === 'LONG' ? entry * 1.02 : entry * 0.98;
  const stop = side === 'LONG' ? entry * 0.96 : entry * 1.04;
  const lastIndex = Math.min(bars.length - 1, entryIndex + HOLD_BARS - 1);
  let mfeRoe = -Infinity;
  let maeRoe = Infinity;
  for (let index = entryIndex; index <= lastIndex; index += 1) {
    const bar = bars[index];
    const favorable = side === 'LONG' ? bar.high : bar.low;
    const adverse = side === 'LONG' ? bar.low : bar.high;
    mfeRoe = Math.max(mfeRoe, directionalRoe(side, entry, favorable));
    maeRoe = Math.min(maeRoe, directionalRoe(side, entry, adverse));
    const hitTarget = side === 'LONG' ? bar.high >= target : bar.low <= target;
    const hitStop = side === 'LONG' ? bar.low <= stop : bar.high >= stop;
    // Conservative same-candle ordering: count SL before TP.
    if (hitStop || hitTarget) {
      const exit = hitStop ? stop : target;
      return {
        ...signal, side, entry, exit, exitAt: bar.closeTime,
        outcome: hitStop ? 'SL' : 'TP', netRoe: directionalRoe(side, entry, exit), mfeRoe, maeRoe,
      };
    }
  }
  const exitBar = bars[lastIndex];
  if (!exitBar || lastIndex < entryIndex + HOLD_BARS - 1) {
    return { ...signal, side, entry, outcome: 'OPEN', netRoe: 0, mfeRoe, maeRoe };
  }
  return {
    ...signal, side, entry, exit: exitBar.close, exitAt: exitBar.closeTime,
    outcome: 'TIMEOUT', netRoe: directionalRoe(side, entry, exitBar.close), mfeRoe, maeRoe,
  };
}

function summarize(trades) {
  const settled = trades.filter((row) => row.outcome !== 'OPEN');
  const wins = settled.filter((row) => row.netRoe > 0);
  const profits = wins.reduce((sum, row) => sum + row.netRoe, 0);
  const losses = Math.abs(settled.filter((row) => row.netRoe < 0).reduce((sum, row) => sum + row.netRoe, 0));
  return {
    signals: trades.length,
    settled: settled.length,
    wins: wins.length,
    losses: settled.length - wins.length,
    winRatePct: settled.length ? round(wins.length / settled.length * 100, 1) : null,
    avgNetRoe: settled.length ? round(settled.reduce((sum, row) => sum + row.netRoe, 0) / settled.length) : null,
    totalNetRoe: round(settled.reduce((sum, row) => sum + row.netRoe, 0)),
    profitFactor: losses > 0 ? round(profits / losses, 2) : profits > 0 ? null : 0,
    avgMfeRoe: settled.length ? round(settled.reduce((sum, row) => sum + row.mfeRoe, 0) / settled.length) : null,
    avgMaeRoe: settled.length ? round(settled.reduce((sum, row) => sum + row.maeRoe, 0) / settled.length) : null,
    tp: settled.filter((row) => row.outcome === 'TP').length,
    sl: settled.filter((row) => row.outcome === 'SL').length,
    timeout: settled.filter((row) => row.outcome === 'TIMEOUT').length,
  };
}

async function mapConcurrent(values, concurrency, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        output[index] = await worker(values[index]);
      } catch (error) {
        output[index] = { error: error?.message ?? String(error) };
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return output;
}

async function main() {
  const serverTime = finite((await getJson('/fapi/v1/time')).serverTime, Date.now());
  const sessionStart = serverTime - DAYS * 24 * 60 * 60_000;
  const fetchStart = sessionStart - 36 * 60 * 60_000;
  const tickers = await getJson('/fapi/v1/ticker/24hr');
  const universe = tickers
    .filter((row) => String(row.symbol).endsWith('USDT') && row.symbol !== 'BTCUSDT')
    .map((row) => ({ symbol: row.symbol, quoteVolume: finite(row.quoteVolume, 0) }))
    .filter((row) => row.quoteVolume >= MIN_QUOTE_VOLUME)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, UNIVERSE_LIMIT);

  const fetched = await mapConcurrent(universe, 2, async ({ symbol }) => ({
    symbol,
    bars: await getKlines(symbol, fetchStart, serverTime),
  }));
  const histories = new Map(fetched.filter((row) => row?.bars?.length).map((row) => [row.symbol, row.bars]));
  const errors = fetched.filter((row) => row?.error).map((row) => row.error);

  const priceCandidates = [];
  const watches = [];
  const legacySignals = [];
  for (const [symbol, bars] of histories) {
    const detected = findPriceCandidates(symbol, bars, sessionStart);
    priceCandidates.push(...detected.readyRows);
    watches.push(...detected.watchRows);
    legacySignals.push(...detected.oldRows);
  }

  const candidateSymbols = [...new Set(priceCandidates.map((row) => row.symbol))];
  const oiFetched = await mapConcurrent(candidateSymbols, 2, async (symbol) => ({
    symbol,
    oi: await getOpenInterest(symbol, fetchStart, serverTime),
  }));
  const oiBySymbol = new Map(oiFetched.filter((row) => row?.oi).map((row) => [row.symbol, row.oi]));
  const enriched = priceCandidates.map((signal) => enrichDerivatives(
    signal,
    histories.get(signal.symbol),
    oiBySymbol.get(signal.symbol) ?? new Map(),
  ));
  const priceOnlyTrades = enriched.map((signal) => evaluate(signal, histories.get(signal.symbol), 'LONG'));
  const oiBuildTrades = enriched.filter((row) => row.oiBuildPass).map((signal) => evaluate(signal, histories.get(signal.symbol), 'LONG'));
  const confirmedTrades = enriched.filter((row) => row.squeezeConfirmPass).map((signal) => evaluate(signal, histories.get(signal.symbol), 'LONG'));
  const absorptionTrades = enriched
    .filter((row) => row.baseTakerDeltaPct != null && row.baseTakerDeltaPct <= -1)
    .map((signal) => evaluate(signal, histories.get(signal.symbol), 'LONG'));
  const absorptionOiGuardTrades = enriched
    .filter((row) => row.baseTakerDeltaPct != null && row.baseTakerDeltaPct <= -1
      && row.oiBuildPct != null && row.oiBuildPct <= 0.5)
    .map((signal) => evaluate(signal, histories.get(signal.symbol), 'LONG'));
  const legacyTrades = legacySignals.map((signal) => evaluate(signal, histories.get(signal.symbol), 'SHORT'));

  const midpoint = sessionStart + (serverTime - sessionStart) / 2;
  const splitSummary = (trades) => ({
    EARLY_HALF: summarize(trades.filter((row) => row.signalAt < midpoint)),
    RECENT_HALF: summarize(trades.filter((row) => row.signalAt >= midpoint)),
  });

  const watchOutcomes = watches.map((watch) => {
    const bars = histories.get(watch.symbol);
    const end = Math.min(bars.length - 1, watch.index + 144);
    const path = bars.slice(watch.index + 1, end + 1);
    const entry = bars[watch.index + 1]?.open;
    const maxHigh = path.length ? Math.max(...path.map((row) => row.high)) : null;
    const minLow = path.length ? Math.min(...path.map((row) => row.low)) : null;
    return {
      ...watch,
      next12hMfePricePct: entry > 0 && maxHigh != null ? pct(entry, maxHigh) : null,
      next12hMaePricePct: entry > 0 && minLow != null ? pct(entry, minLow) : null,
    };
  });

  const compactTrade = (row) => ({
    symbol: row.symbol,
    signalAt: new Date(row.signalAt).toISOString(),
    outcome: row.outcome,
    netRoe: round(row.netRoe),
    mfeRoe: round(row.mfeRoe),
    maeRoe: round(row.maeRoe),
    pumpPct: round(row.pumpPct),
    drawdownPct: round(row.drawdownPct),
    oiBuildPct: round(row.oiBuildPct),
    oiReleasePct: round(row.oiReleasePct),
    baseTakerDeltaPct: round(row.baseTakerDeltaPct),
    breakoutTakerDeltaPct: round(row.takerDeltaPct),
    volumeX: round(row.volumeX),
  });

  const result = {
    version: 'POST_PUMP_SHORT_SQUEEZE_BACKTEST_V1_20260815',
    generatedAt: new Date(serverTime).toISOString(),
    period: { from: new Date(sessionStart).toISOString(), to: new Date(serverTime).toISOString(), days: DAYS },
    assumptions: {
      universe: `Top ${UNIVERSE_LIMIT} current USDT perpetuals by quote volume, min ${MIN_QUOTE_VOLUME}`,
      entry: 'Next 5m candle open after a closed READY candle',
      exit: `TP ${TP_PRICE_PCT}% price / SL ${SL_PRICE_PCT}% price / timeout ${HOLD_BARS * 5}m`,
      leverage: LEVERAGE,
      feeRoe: FEE_ROE,
      intrabar: 'Conservative: SL before TP when both touched in one candle',
      oiBuild: '60m OI contract quantity +2% while 60m base taker delta <=0',
      confirmation: 'OI falls >=0.5% over 10m OR breakout taker delta >=15 and volume >=2.2x',
      absorption: '60m base taker delta <=-1% while the 5m base still holds; no OI growth requirement',
    },
    coverage: {
      requested: universe.length,
      fetched: histories.size,
      errors: errors.slice(0, 10),
      priceWatchSetups: watches.length,
      priceReadyCandidates: priceCandidates.length,
      readySymbolsWithOi: oiBySymbol.size,
      legacySignals: legacySignals.length,
    },
    summary: {
      LEGACY_POST_PUMP_KILL_SHORT: summarize(legacyTrades),
      NEW_PRICE_ONLY: summarize(priceOnlyTrades),
      NEW_OI_BUILD: summarize(oiBuildTrades),
      NEW_OI_BUILD_CONFIRM: summarize(confirmedTrades),
      NEW_TAKER_SELL_ABSORPTION: summarize(absorptionTrades),
      NEW_TAKER_SELL_ABSORPTION_OI_GUARD: summarize(absorptionOiGuardTrades),
    },
    summaryByHalf: {
      LEGACY_POST_PUMP_KILL_SHORT: splitSummary(legacyTrades),
      NEW_PRICE_ONLY: splitSummary(priceOnlyTrades),
      NEW_TAKER_SELL_ABSORPTION: splitSummary(absorptionTrades),
      NEW_TAKER_SELL_ABSORPTION_OI_GUARD: splitSummary(absorptionOiGuardTrades),
    },
    watchForward12h: {
      setups: watchOutcomes.length,
      reachedPlus2Pct: watchOutcomes.length ? round(watchOutcomes.filter((row) => row.next12hMfePricePct >= 2).length / watchOutcomes.length * 100, 1) : null,
      reachedPlus5Pct: watchOutcomes.length ? round(watchOutcomes.filter((row) => row.next12hMfePricePct >= 5).length / watchOutcomes.length * 100, 1) : null,
      fellMinus4Pct: watchOutcomes.length ? round(watchOutcomes.filter((row) => row.next12hMaePricePct <= -4).length / watchOutcomes.length * 100, 1) : null,
    },
    trades: {
      LEGACY: legacyTrades.map(compactTrade),
      PRICE_ONLY: priceOnlyTrades.map(compactTrade),
      OI_BUILD: oiBuildTrades.map(compactTrade),
      OI_BUILD_CONFIRM: confirmedTrades.map(compactTrade),
      TAKER_SELL_ABSORPTION: absorptionTrades.map(compactTrade),
      TAKER_SELL_ABSORPTION_OI_GUARD: absorptionOiGuardTrades.map(compactTrade),
    },
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
