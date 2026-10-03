import {
  TOXIC_TWO_SIDE_OBSERVATION_VERSION,
  TOXIC_TWO_SIDE_TIERS,
  toxicTwoSideCardKey,
  toxicTwoSideTier,
} from '../public/toxic-two-side-model.js';

const DAY_MS = 24 * 60 * 60_000;

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function candleValue(row, key, index) {
  return finite(row?.[key], finite(row?.[index]));
}

function closedCandles(rows = [], now = Date.now()) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      openTime: candleValue(row, 'openTime', 0),
      open: candleValue(row, 'open', 1),
      high: candleValue(row, 'high', 2),
      low: candleValue(row, 'low', 3),
      close: candleValue(row, 'close', 4),
      closeTime: candleValue(row, 'closeTime', 6),
      quoteVolume: candleValue(row, 'quoteVolume', 7),
    }))
    .filter((row) => row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0
      && row.closeTime > 0 && row.closeTime <= now)
    .sort((a, b) => a.closeTime - b.closeTime);
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const alpha = 2 / (period + 1);
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (const item of values.slice(period)) value = item * alpha + value * (1 - alpha);
  return value;
}

function trendState(rows = []) {
  const values = rows.map((row) => row.close);
  if (values.length < 26) return 'NO_DATA';
  const close = values.at(-1);
  const ema13 = ema(values, 13);
  const ema25 = ema(values, 25);
  const ema99 = ema(values, 99);
  const aboveLong = ema99 == null || close > ema99;
  const belowLong = ema99 == null || close < ema99;
  if (close > ema13 && ema13 >= ema25 && aboveLong) return 'UP';
  if (close < ema13 && ema13 <= ema25 && belowLong) return 'DOWN';
  return 'MIXED';
}

function atrPct(rows = [], period = 14) {
  if (rows.length < period + 1) return null;
  const selected = rows.slice(-(period + 1));
  const ranges = selected.slice(1).map((row, index) => {
    const previousClose = selected[index].close;
    return Math.max(
      row.high - row.low,
      Math.abs(row.high - previousClose),
      Math.abs(row.low - previousClose),
    );
  });
  const atr = ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
  return selected.at(-1).close > 0 ? (atr / selected.at(-1).close) * 100 : null;
}

function fakeBreaks(rows = [], lookback = 6, sample = 36) {
  const selected = rows.slice(-(sample + lookback));
  let upper = 0;
  let lower = 0;
  for (let index = lookback; index < selected.length; index += 1) {
    const row = selected[index];
    const prior = selected.slice(index - lookback, index);
    const priorHigh = Math.max(...prior.map((item) => item.high));
    const priorLow = Math.min(...prior.map((item) => item.low));
    if (row.high > priorHigh && row.close < priorHigh) upper += 1;
    if (row.low < priorLow && row.close > priorLow) lower += 1;
  }
  return { upper, lower, total: upper + lower, twoSided: upper >= 2 && lower >= 2 };
}

function flipRate(rows = [], sample = 18) {
  const closes = rows.slice(-(sample + 1)).map((row) => row.close);
  const directions = closes.slice(1).map((value, index) => Math.sign(value - closes[index])).filter(Boolean);
  if (directions.length < 3) return null;
  let flips = 0;
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index] !== directions[index - 1]) flips += 1;
  }
  return (flips / (directions.length - 1)) * 100;
}

function range24hFromCandles(rows = [], now = Date.now()) {
  const selected = rows.filter((row) => row.closeTime > now - DAY_MS);
  if (!selected.length) return null;
  const high = Math.max(...selected.map((row) => row.high));
  const low = Math.min(...selected.map((row) => row.low));
  return low > 0 ? ((high - low) / low) * 100 : null;
}

function classifyVolatility({ range24hPct, atr1hPct, atr4hPct }) {
  if (range24hPct >= 60 || atr1hPct >= 8 || atr4hPct >= 15) return { points: 30, band: 'EXTREME' };
  if (range24hPct >= 35 || atr1hPct >= 5 || atr4hPct >= 10) return { points: 20, band: 'HIGH' };
  if (range24hPct >= 20 || atr1hPct >= 3 || atr4hPct >= 6) return { points: 10, band: 'WATCH' };
  return { points: 0, band: 'NORMAL' };
}

function classifyTurnover(value) {
  if (value >= 200) return 20;
  if (value >= 100) return 14;
  if (value >= 50) return 8;
  return 0;
}

export function selectToxicTwoSideSupplyFallbackMarkets({
  marketRows = [],
  supplyRows = [],
  limit = 12,
} = {}) {
  const covered = new Set((Array.isArray(supplyRows) ? supplyRows : [])
    .filter((row) => finite(row?.marketCapUsd) > 0)
    .map((row) => String(row?.symbol ?? '').toUpperCase()));
  return (Array.isArray(marketRows) ? marketRows : [])
    .filter((row) => !covered.has(String(row?.symbol ?? '').toUpperCase()))
    .filter((row) => finite(row?.range24hPct, 0) >= 35
      || Math.abs(finite(row?.change24hPct, 0)) >= 30)
    .sort((left, right) => finite(right?.range24hPct, 0) - finite(left?.range24hPct, 0)
      || finite(right?.quoteVolume, 0) - finite(left?.quoteVolume, 0))
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function analyzeToxicTwoSideCoin({ market = {}, supply = null, klines = {}, now = Date.now() } = {}) {
  const frames = Object.fromEntries(['5m', '15m', '1h', '4h'].map((interval) => {
    const rows = closedCandles(klines?.[interval], now);
    return [interval, { rows, state: trendState(rows), atrPct: atrPct(rows) }];
  }));
  const tickerRange = finite(market?.range24hPct);
  const range24hPct = tickerRange ?? range24hFromCandles(frames['15m'].rows, now);
  const marketCapUsd = finite(supply?.marketCapUsd);
  const quoteVolume24h = finite(market?.quoteVolume, 0);
  const binanceTurnoverPct = marketCapUsd > 0
    ? (quoteVolume24h / marketCapUsd) * 100
    : null;
  const fundingRatePct = finite(market?.fundingRate) == null ? null : finite(market.fundingRate) * 100;
  const change24hPct = finite(market?.change24hPct);
  const shortUp = ['5m', '15m'].some((interval) => frames[interval].state === 'UP');
  const shortDown = ['5m', '15m'].some((interval) => frames[interval].state === 'DOWN');
  const longUp = ['1h', '4h'].some((interval) => frames[interval].state === 'UP');
  const longDown = ['1h', '4h'].some((interval) => frames[interval].state === 'DOWN');
  const trendConflict = (shortUp && longDown) || (shortDown && longUp);
  const fundingDivergence = change24hPct != null && fundingRatePct != null && (
    (change24hPct <= -15 && fundingRatePct > 0.02)
    || (change24hPct >= 15 && fundingRatePct < -0.02)
  );
  const sweeps = fakeBreaks(frames['5m'].rows);
  const volatility = classifyVolatility({
    range24hPct,
    atr1hPct: frames['1h'].atrPct,
    atr4hPct: frames['4h'].atrPct,
  });
  const turnoverPoints = classifyTurnover(binanceTurnoverPct);
  const sweepPoints = sweeps.twoSided ? 20 : sweeps.total >= 4 ? 10 : 0;
  const score = Math.min(100, volatility.points + turnoverPoints
    + (trendConflict ? 15 : 0)
    + (fundingDivergence ? 15 : 0)
    + sweepPoints);
  const tier = toxicTwoSideTier(score);
  const reasons = [];
  if (volatility.points) reasons.push(`Biên/ATR ${volatility.band.toLowerCase()} (+${volatility.points})`);
  if (turnoverPoints) reasons.push(`Volume futures/cap ${round(binanceTurnoverPct)}% (+${turnoverPoints})`);
  if (trendConflict) reasons.push('5m–15m ngược 1h–4h (+15)');
  if (fundingDivergence) reasons.push('Funding ngược biến động 24h (+15)');
  if (sweepPoints) reasons.push(`Phá giả ${sweeps.upper} trên/${sweeps.lower} dưới (+${sweepPoints})`);
  const dataChecks = [range24hPct, marketCapUsd, frames['5m'].state !== 'NO_DATA' ? 1 : null,
    frames['1h'].atrPct, frames['4h'].atrPct].filter((value) => value != null).length;
  return {
    symbol: String(market?.symbol ?? '').toUpperCase(),
    score,
    tier,
    tierLabel: TOXIC_TWO_SIDE_TIERS[tier],
    whitelistKey: toxicTwoSideCardKey(tier),
    markPrice: finite(market?.markPrice),
    change24hPct: round(change24hPct),
    range24hPct: round(range24hPct),
    quoteVolume24h: round(quoteVolume24h),
    marketCapUsd: round(marketCapUsd),
    binanceTurnoverPct: round(binanceTurnoverPct),
    fundingRatePct: round(fundingRatePct, 4),
    atr1hPct: round(frames['1h'].atrPct),
    atr4hPct: round(frames['4h'].atrPct),
    trend: Object.fromEntries(Object.entries(frames).map(([interval, frame]) => [interval, frame.state])),
    trendConflict,
    fundingDivergence,
    sweeps,
    flipRate5mPct: round(flipRate(frames['5m'].rows)),
    reasons,
    dataQuality: { checks: dataChecks, total: 5, complete: dataChecks === 5 },
    observation: {
      version: TOXIC_TWO_SIDE_OBSERVATION_VERSION,
      evaluatedAt: now,
      tier,
      score,
      watchOnly: true,
      binanceEligible: false,
    },
  };
}

export function buildToxicTwoSideMarketSnapshot({ marketRows = [], supplyRows = [], getKlines, now = Date.now() } = {}) {
  const supplyBySymbol = new Map((Array.isArray(supplyRows) ? supplyRows : [])
    .map((row) => [String(row?.symbol ?? '').toUpperCase(), row]));
  const rows = (Array.isArray(marketRows) ? marketRows : [])
    .map((market) => analyzeToxicTwoSideCoin({
      market,
      supply: supplyBySymbol.get(String(market?.symbol ?? '').toUpperCase()) ?? null,
      klines: Object.fromEntries(['5m', '15m', '1h', '4h'].map((interval) => [
        interval,
        typeof getKlines === 'function' ? getKlines(market.symbol, interval, interval === '5m' ? 80 : 120) : [],
      ])),
      now,
    }))
    .sort((left, right) => right.score - left.score || right.range24hPct - left.range24hPct
      || left.symbol.localeCompare(right.symbol));
  const counts = Object.fromEntries(Object.keys(TOXIC_TWO_SIDE_TIERS)
    .map((tier) => [tier, rows.filter((row) => row.tier === tier).length]));
  return {
    version: TOXIC_TWO_SIDE_OBSERVATION_VERSION,
    generatedAt: new Date(now).toISOString(),
    rows,
    counts,
    universe: rows.length,
    scored: rows.filter((row) => row.dataQuality.checks >= 2).length,
    complete: rows.filter((row) => row.dataQuality.complete).length,
    methodology: {
      volatility: '0/10/20/30: range24h hoặc ATR1h/4h',
      turnover: '0/8/14/20: Binance quoteVolume24h / CoinGecko market cap',
      trendConflict: '15: 5m–15m đối nghịch 1h–4h',
      fundingDivergence: '15: |24h|≥15% và funding đi ngược',
      fakeBreaks: '10/20: phá rolling high/low 5m rồi đóng trở lại',
      tiers: 'EXTREME≥75, HIGH≥60, WATCH≥45, NORMAL<45',
    },
    observeOnly: true,
    execution: {
      binanceEnabled: false,
      affectsEntry: false,
      affectsSize: false,
      affectsStopLoss: false,
      affectsTakeProfit: false,
    },
  };
}
