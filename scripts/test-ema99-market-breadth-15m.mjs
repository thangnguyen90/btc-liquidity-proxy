import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EMA99_MARKET_BREADTH_15M_VERSION,
  Ema99MarketBreadth15mDetector,
  Ema99MarketBreadth15mDiscordNotifier,
  classifyEma99MarketBreadth15m,
  collectEma99MarketBreadth15m,
  ema99MarketBreadth15mPayload,
  evaluateEma99Approach15m,
} from '../src/ema99MarketBreadth15m.js';

const INTERVAL = 15 * 60_000;
const now = Date.UTC(2026, 8, 13, 8, 0, 0);
const symbols = Array.from({ length: 200 }, (_, index) => `E${index}USDT`);

function bars(direction = 'FLAT') {
  return Array.from({ length: 110 }, (_, index) => {
    const final = index === 109;
    const close = final ? (direction === 'BELOW' ? 98 : direction === 'ABOVE' ? 102 : 100) : 100;
    return {
      openTime: now - (110 - index) * INTERVAL,
      closeTime: now - (109 - index) * INTERVAL - 1,
      open: 100,
      high: final ? Math.max(100.2, close + 0.2) : 100.2,
      low: final ? Math.min(99.8, close - 0.2) : 99.8,
      close,
      volume: 10_000,
      quoteVolume: 1_000_000,
    };
  });
}

const belowRows = bars('BELOW');
const below = evaluateEma99Approach15m({ symbol: 'BELOWUSDT', markPrice: 99.6 }, belowRows, now);
assert.equal(below.direction, 'FROM_BELOW');
assert.ok(below.absoluteDistancePct < below.nearLimitPct);
assert.ok(below.progressPct > 1);

const aboveRows = bars('ABOVE');
const above = evaluateEma99Approach15m({ symbol: 'ABOVEUSDT', markPrice: 100.4 }, aboveRows, now);
assert.equal(above.direction, 'FROM_ABOVE');
assert.ok(above.absoluteDistancePct < above.nearLimitPct);
assert.equal(evaluateEma99Approach15m({ symbol: 'FARUSDT', markPrice: 98 }, belowRows, now), null);

function fixture({ belowCount = 0, aboveCount = 0 } = {}) {
  const cacheRows = new Map();
  const marketRows = symbols.map((symbol, index) => {
    const direction = index < belowCount ? 'BELOW' : index < belowCount + aboveCount ? 'ABOVE' : 'FLAT';
    cacheRows.set(symbol, bars(direction));
    return {
      symbol,
      quoteVolume: 10_000_000,
      markPrice: direction === 'BELOW' ? 99.6 : direction === 'ABOVE' ? 100.4 : 100,
    };
  });
  const klineCache = {
    getIfCached: (symbol, interval) => interval === '15m' ? cacheRows.get(symbol) : [{
      openTime: now - 1, closeTime: now + 299_999, open: 100, high: 102, low: 98,
      close: marketRows.find((row) => row.symbol === symbol).markPrice,
    }],
    stats: () => ({ staleSec: 0 }),
    liveCoverage: () => ({ newestTickAgeMs: 0 }),
  };
  return collectEma99MarketBreadth15m({ marketRows, klineCache, now });
}

const watchMetrics = fixture({ belowCount: 10, aboveCount: 2 });
assert.equal(watchMetrics.processed, 200);
assert.equal(watchMetrics.fromBelowCount, 10);
assert.equal(watchMetrics.fromAboveCount, 2);
const watchCandidate = classifyEma99MarketBreadth15m(watchMetrics);
assert.equal(watchCandidate.direction, 'FROM_BELOW');
assert.equal(watchCandidate.severity, 'WATCH');
assert.equal(watchCandidate.observeOnly, true);

let clock = now;
const detector = new Ema99MarketBreadth15mDetector({ now: () => clock });
assert.equal(detector.observe(watchMetrics), null, 'WATCH requires 90s continuous observations');
for (let i = 0; i < 5; i++) {
  clock += 15_000;
  assert.equal(detector.observe({ ...watchMetrics, evaluatedAt: clock }), null);
}
clock += 15_000;
const watch = detector.observe({ ...watchMetrics, evaluatedAt: clock });
assert.equal(watch.version, EMA99_MARKET_BREADTH_15M_VERSION);
assert.equal(watch.severity, 'WATCH');

const dangerMetrics = fixture({ belowCount: 16, aboveCount: 1 });
const dangerDetector = new Ema99MarketBreadth15mDetector({ now: () => clock });
assert.equal(dangerDetector.observe({ ...dangerMetrics, evaluatedAt: clock }), null, 'DANGER is no longer immediate');
for (let i = 0; i < 5; i++) {
  clock += 15_000;
  assert.equal(dangerDetector.observe({ ...dangerMetrics, evaluatedAt: clock }), null);
}
clock += 15_000;
const danger = dangerDetector.observe({ ...dangerMetrics, evaluatedAt: clock });
assert.equal(danger.severity, 'DANGER');
const payload = ema99MarketBreadth15mPayload(danger);
assert.equal(payload.embeds[0].color, 0xf59e0b);
assert.match(payload.embeds[0].title, /EMA99 15M · HỘI TỤ MẠNH/);
assert.doesNotMatch(payload.embeds[0].title, /DANGER/);
assert.match(payload.embeds[0].description, /Không phải tín hiệu bơm\/xả toàn thị trường/);
assert.match(payload.embeds[0].description, /TỪ DƯỚI TIẾN LÊN EMA99/);
assert.match(payload.embeds[0].description, /không tự đặt\/chặn\/đóng lệnh Binance/);
assert.ok(payload.embeds[0].fields.every((field) => field.value.length <= 1024));

assert.equal(classifyEma99MarketBreadth15m({ ...watchMetrics, processed: 20 }), null);
assert.equal(classifyEma99MarketBreadth15m(fixture({ belowCount: 5, aboveCount: 5 })), null);

const dir = await mkdtemp(join(tmpdir(), 'ema99-market-breadth-'));
try {
  const stateFile = join(dir, 'state.json');
  let sends = 0;
  const notifier = new Ema99MarketBreadth15mDiscordNotifier({
    stateFile,
    webhookUrl: 'https://discord.invalid/test',
    now: () => clock,
    fetchImpl: async (_url, options) => {
      sends += 1;
      assert.match(options.body, /Market Shock Guard/);
      return { ok: true };
    },
  });
  assert.equal((await notifier.notify({ ...watch, observedAt: clock })).sent, 1);
  assert.equal((await notifier.notify({ ...watch, observedAt: clock })).reason, 'deduped');
  assert.equal(sends, 1);
  assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).version, EMA99_MARKET_BREADTH_15M_VERSION);
  clock += 90_001;
  assert.equal((await notifier.notify({ ...watch, observedAt: now })).reason, 'invalid_or_stale');
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log('EMA99 15m market breadth tests passed: dynamic ATR proximity, directional convergence, WATCH/DANGER, coverage, Discord colors/dedupe; mock only.');
