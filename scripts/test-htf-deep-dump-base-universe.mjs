import assert from 'node:assert/strict';
import {
  HTF_DEEP_DUMP_BASE_UNIVERSE_REQUIREMENTS,
  HTF_DEEP_DUMP_BASE_UNIVERSE_VERSION,
  scanHtfDeepDumpBaseUniverse,
  selectHtfDeepDumpBaseUniverse,
} from '../src/htfDeepDumpBaseUniverse.js';

const now = Date.UTC(2026, 8, 12, 12, 0, 0);
const intervalMs = {
  '5m': 5 * 60_000, '15m': 15 * 60_000, '1h': 60 * 60_000, '4h': 4 * 60 * 60_000,
};

function flatBars(interval, count) {
  const duration = intervalMs[interval];
  return Array.from({ length: count }, (_, index) => {
    const openTime = now - (count - index) * duration;
    return {
      openTime,
      closeTime: openTime + duration - 1,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 10,
      quoteVolume: 1_000,
      trades: 100,
    };
  });
}

const markets = Array.from({ length: 405 }, (_, index) => ({
  symbol: `COIN${String(index).padStart(3, '0')}USDT`,
  quoteVolume: 405 - index,
}));
markets.push({ ...markets[0], quoteVolume: 999_999 });

const selected = selectHtfDeepDumpBaseUniverse(markets, 999);
assert.equal(selected.length, 400, 'hard cap is exactly 400 symbols');
assert.equal(new Set(selected.map((row) => row.symbol)).size, 400, 'universe is unique');
assert.equal(selected[0].symbol, 'COIN000USDT');
assert.equal(selected.at(-1).symbol, 'COIN399USDT');

const bars = Object.fromEntries(Object.entries(HTF_DEEP_DUMP_BASE_UNIVERSE_REQUIREMENTS)
  .map(([interval, requirement]) => [interval, flatBars(interval, requirement.readBars)]));
const klineCache = {
  getIfCached(_symbol, interval, limit) {
    return bars[interval].slice(-limit);
  },
};

const scan = scanHtfDeepDumpBaseUniverse({
  marketRows: markets,
  klineCache,
  now,
  maxSymbols: 400,
});
assert.equal(scan.version, HTF_DEEP_DUMP_BASE_UNIVERSE_VERSION);
assert.equal(scan.requested, 400);
assert.equal(scan.processed, 400);
assert.deepEqual(scan.coverage, {
  '5m': 400, '15m': 400, '1h': 400, '4h': 400, all: 400,
});
assert.equal(scan.detected, 0, 'flat candles do not create false signals');
assert.equal(scan.rows.length, 0);

const partial = scanHtfDeepDumpBaseUniverse({
  marketRows: markets.slice(0, 3),
  klineCache: {
    getIfCached(symbol, interval, limit) {
      if (symbol === 'COIN001USDT' && interval === '4h') return bars[interval].slice(0, 10);
      return bars[interval].slice(-limit);
    },
  },
  now,
  maxSymbols: 400,
});
assert.equal(partial.requested, 3);
assert.equal(partial.processed, 2);
assert.equal(partial.coverage['4h'], 2);

const optional5mMissing = scanHtfDeepDumpBaseUniverse({
  marketRows: markets.slice(0, 2),
  klineCache: {
    getIfCached(_symbol, interval, limit) {
      if (interval === '5m') return [];
      return bars[interval].slice(-limit);
    },
  },
  now,
  maxSymbols: 400,
});
assert.equal(optional5mMissing.processed, 2, 'missing optional 5m cache keeps the 15m fallback live');
assert.equal(optional5mMissing.coverage['5m'], 0);

console.log('HTF deep-base universe: top 400, optional 5m and required 15m/1h/4h coverage passed.');
