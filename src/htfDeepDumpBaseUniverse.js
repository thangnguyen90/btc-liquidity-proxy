import { buildHtfDeepDumpBaseReclaimSnapshot } from './htfDeepDumpBaseReclaim.js';

export const HTF_DEEP_DUMP_BASE_UNIVERSE_VERSION =
  'HTF_DEEP_BASE_LONG_SHORT_UNIVERSE_V4_SHORT_LARGE_REBOUND_20260914';

export const HTF_DEEP_DUMP_BASE_UNIVERSE_REQUIREMENTS = Object.freeze({
  '5m': Object.freeze({
    minBars: 30, readBars: 80, seedBars: 80, maxAgeMs: 10 * 60_000, optional: true,
  }),
  '15m': Object.freeze({ minBars: 30, readBars: 220, seedBars: 220, maxAgeMs: 25 * 60_000 }),
  '1h': Object.freeze({ minBars: 100, readBars: 120, seedBars: 120, maxAgeMs: 75 * 60_000 }),
  '4h': Object.freeze({ minBars: 65, readBars: 120, seedBars: 120, maxAgeMs: 270 * 60_000 }),
});

const finite = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function lastClosedAt(rows = [], now = Date.now()) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const closeTime = finite(rows[index]?.closeTime, 0);
    if (closeTime > 0 && closeTime <= now) return closeTime;
  }
  return null;
}

function intervalReady(rows, interval, now) {
  const requirement = HTF_DEEP_DUMP_BASE_UNIVERSE_REQUIREMENTS[interval];
  if (!requirement || !Array.isArray(rows) || rows.length < requirement.minBars) return false;
  const closedAt = lastClosedAt(rows, now);
  return closedAt != null && now - closedAt <= requirement.maxAgeMs;
}

export function selectHtfDeepDumpBaseUniverse(marketRows = [], maxSymbols = 400) {
  const limit = Math.max(1, Math.min(400, Math.floor(finite(maxSymbols, 400))));
  const bySymbol = new Map();
  for (const market of Array.isArray(marketRows) ? marketRows : []) {
    const symbol = String(market?.symbol ?? '').trim().toUpperCase();
    if (!symbol || bySymbol.has(symbol)) continue;
    bySymbol.set(symbol, { ...market, symbol });
  }
  return [...bySymbol.values()]
    .sort((left, right) => finite(right.quoteVolume) - finite(left.quoteVolume)
      || left.symbol.localeCompare(right.symbol))
    .slice(0, limit);
}

export function scanHtfDeepDumpBaseUniverse({
  marketRows = [],
  klineCache,
  now = Date.now(),
  maxSymbols = 400,
} = {}) {
  const universe = selectHtfDeepDumpBaseUniverse(marketRows, maxSymbols);
  const coverage = { '5m': 0, '15m': 0, '1h': 0, '4h': 0, all: 0 };
  const rows = [];
  for (const market of universe) {
    const klines5m = klineCache?.getIfCached?.(
      market.symbol,
      '5m',
      HTF_DEEP_DUMP_BASE_UNIVERSE_REQUIREMENTS['5m'].readBars,
    ) ?? [];
    const klines15m = klineCache?.getIfCached?.(
      market.symbol,
      '15m',
      HTF_DEEP_DUMP_BASE_UNIVERSE_REQUIREMENTS['15m'].readBars,
    ) ?? [];
    const klines1h = klineCache?.getIfCached?.(
      market.symbol,
      '1h',
      HTF_DEEP_DUMP_BASE_UNIVERSE_REQUIREMENTS['1h'].readBars,
    ) ?? [];
    const klines4h = klineCache?.getIfCached?.(
      market.symbol,
      '4h',
      HTF_DEEP_DUMP_BASE_UNIVERSE_REQUIREMENTS['4h'].readBars,
    ) ?? [];
    const ready5m = intervalReady(klines5m, '5m', now);
    const ready15m = intervalReady(klines15m, '15m', now);
    const ready1h = intervalReady(klines1h, '1h', now);
    const ready4h = intervalReady(klines4h, '4h', now);
    coverage['5m'] += Number(ready5m);
    coverage['15m'] += Number(ready15m);
    coverage['1h'] += Number(ready1h);
    coverage['4h'] += Number(ready4h);
    if (!ready15m || !ready1h || !ready4h) continue;
    coverage.all += 1;
    const feature = buildHtfDeepDumpBaseReclaimSnapshot({
      symbol: market.symbol,
      klines5m: ready5m ? klines5m : [],
      klines15m,
      klines1h,
      klines4h,
      now,
    });
    if (!feature.events.length) continue;
    rows.push({
      symbol: market.symbol,
      dataFreshness: { fresh: true, stale: false },
      features: { htfDeepDumpBaseReclaim: feature },
    });
  }
  return {
    version: HTF_DEEP_DUMP_BASE_UNIVERSE_VERSION,
    generatedAt: now,
    requested: universe.length,
    processed: coverage.all,
    detected: rows.length,
    coverage,
    symbols: universe.map((market) => market.symbol),
    rows,
  };
}
