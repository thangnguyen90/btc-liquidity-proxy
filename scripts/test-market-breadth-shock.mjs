import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MARKET_BREADTH_SHOCK_VERSION,
  MarketBreadthShockDetector,
  MarketBreadthShockDiscordNotifier,
  classifyMarketBreadthShock,
  collectMarketBreadthShockMetrics,
  marketBreadthShockPayload,
} from '../src/marketBreadthShock.js';

const start = Date.UTC(2026, 8, 13, 3, 30, 0);
const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', ...Array.from({ length: 197 }, (_, index) => `C${index}USDT`)];

function bars(movePct, { taker = 0.5, volumeRatio = 1 } = {}) {
  return Array.from({ length: 6 }, (_, index) => {
    const current = index === 5;
    const quoteVolume = current ? 100_000 * volumeRatio : 100_000;
    return {
      openTime: start - (6 - index) * 300_000,
      closeTime: start - (5 - index) * 300_000 - 1,
      open: 100,
      high: current && movePct > 0 ? 100 * (1 + movePct / 100) : 100.1,
      low: current && movePct < 0 ? 100 * (1 + movePct / 100) : 99.9,
      close: current ? 100 * (1 + movePct / 100) : 100,
      volume: quoteVolume / 100,
      quoteVolume,
      takerBuyQuoteVolume: quoteVolume * taker,
    };
  });
}

function fixture({ pump = 0, dump = 0, pumpMove = 1.2, dumpMove = -1.2, taker = 0.5, volumeRatio = 1 } = {}) {
  const rows = new Map();
  symbols.forEach((symbol, index) => {
    const movePct = index < pump ? pumpMove : index < pump + dump ? dumpMove : 0.02;
    rows.set(symbol, bars(movePct, { taker, volumeRatio: Math.abs(movePct) >= 0.75 ? volumeRatio : 1 }));
  });
  return {
    marketRows: symbols.map((symbol) => ({ symbol, quoteVolume: 10_000_000 })),
    cache: {
      getIfCached: (symbol) => rows.get(symbol),
      stats: () => ({ staleSec: 0 }),
      liveCoverage: () => ({ newestTickAgeMs: 0 }),
    },
  };
}

const pumpFixture = fixture({ pump: 70, dump: 3, taker: 0.68, volumeRatio: 2 });
const pumpMetrics = collectMarketBreadthShockMetrics({ marketRows: pumpFixture.marketRows, klineCache: pumpFixture.cache, now: start });
assert.equal(pumpMetrics.processed, 200);
assert.equal(pumpMetrics.strongUpCount, 70);
assert.equal(pumpMetrics.strongDownCount, 3);
assert.equal(pumpMetrics.waveUp.length, 30, 'Discord keeps the strongest 30 same-wave coins');
assert.equal(pumpMetrics.waveDown.length, 3);
assert.ok(pumpMetrics.takerBuyRatio > 0.67);
const pump = classifyMarketBreadthShock(pumpMetrics);
assert.equal(pump.direction, 'PUMP');
assert.equal(pump.severity, 'DANGER');
assert.ok(pump.score >= 90);
assert.equal(pump.observeOnly, true);

const dumpFixture = fixture({ pump: 2, dump: 65, taker: 0.31, volumeRatio: 2 });
const dumpMetrics = collectMarketBreadthShockMetrics({ marketRows: dumpFixture.marketRows, klineCache: dumpFixture.cache, now: start });
const dump = classifyMarketBreadthShock(dumpMetrics);
assert.equal(dump.direction, 'DUMP');
assert.equal(dump.severity, 'DANGER');
assert.ok(dump.directionalTakerRatio > 0.68);

const mixedFixture = fixture({ pump: 20, dump: 18, taker: 0.51, volumeRatio: 1 });
assert.equal(classifyMarketBreadthShock(collectMarketBreadthShockMetrics({ marketRows: mixedFixture.marketRows, klineCache: mixedFixture.cache, now: start })), null);
const thinMetrics = { ...pumpMetrics, processed: 20, coveragePct: 5 };
assert.equal(classifyMarketBreadthShock(thinMetrics), null, 'coverage fails closed');

const watchFixture = fixture({ pump: 35, dump: 2, pumpMove: 0.9, taker: 0.55, volumeRatio: 1.6 });
let clock = start;
const watchMetrics = collectMarketBreadthShockMetrics({ marketRows: watchFixture.marketRows, klineCache: watchFixture.cache, now: clock });
const detector = new MarketBreadthShockDetector({ now: () => clock });
assert.equal(detector.observe(watchMetrics), null, 'WATCH requires elapsed confirmation');
for (let i = 0; i < 3; i++) {
  clock += 15_000;
  assert.equal(detector.observe({ ...watchMetrics, evaluatedAt: clock }), null);
}
clock += 15_000;
const watch = detector.observe({ ...watchMetrics, evaluatedAt: clock });
assert.equal(watch.direction, 'PUMP');
assert.equal(watch.severity, 'WATCH');
assert.equal(watch.version, MARKET_BREADTH_SHOCK_VERSION);

const pumpPayload = marketBreadthShockPayload({ ...pump, observedAt: start, generatedAt: new Date(start).toISOString() });
assert.equal(pumpPayload.allowed_mentions.parse.length, 0);
assert.equal(pumpPayload.embeds[0].color, 0xff1744);
assert.match(pumpPayload.embeds[0].title, /KILL SHORT/);
assert.match(pumpPayload.embeds[0].description, /TẠM NÉ MỞ SHORT/);
assert.match(pumpPayload.embeds[0].description, /không tự đặt\/chặn\/đóng lệnh Binance/);
const pumpWaveField = pumpPayload.embeds[0].fields.find((field) => field.name.includes('BƠM MẠNH CÙNG SÓNG'));
assert.ok(pumpWaveField);
assert.match(pumpWaveField.value, /BTC/);
assert.match(pumpWaveField.value, /vol 2\.0×/);
assert.ok(pumpPayload.embeds[0].fields.every((field) => field.value.length <= 1024));
const dumpPayload = marketBreadthShockPayload({ ...dump, observedAt: start, generatedAt: new Date(start).toISOString() });
assert.equal(dumpPayload.embeds[0].color, 0xb00020);
assert.match(dumpPayload.embeds[0].title, /KILL LONG/);
assert.ok(dumpPayload.embeds[0].fields.some((field) => field.name.includes('SẬP MẠNH CÙNG SÓNG')));

const dir = await mkdtemp(join(tmpdir(), 'market-breadth-shock-'));
const stateFile = join(dir, 'state.json');
let sends = 0;
const notifier = new MarketBreadthShockDiscordNotifier({
  stateFile,
  webhookUrl: 'https://discord.invalid/test',
  now: () => clock,
  fetchImpl: async (_url, options) => {
    sends += 1;
    assert.match(options.body, /Market Shock Guard/);
    return { ok: true };
  },
});
const watchFresh = { ...watch, observedAt: clock, generatedAt: new Date(clock).toISOString() };
assert.equal((await notifier.notify(watchFresh)).sent, 1);
assert.equal((await notifier.notify(watchFresh)).reason, 'deduped');
const dangerFresh = { ...pump, persistence: watch.persistence, observedAt: clock, generatedAt: new Date(clock).toISOString(), dedupeKey: 'PUMP|DANGER' };
assert.equal((await notifier.notify(dangerFresh)).sent, 1, 'DANGER escalation is sent separately');
assert.equal(sends, 2);
assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).version, MARKET_BREADTH_SHOCK_VERSION);
clock += 90_001;
assert.equal((await notifier.notify({ ...dangerFresh, observedAt: start })).reason, 'invalid_or_stale');
await rm(dir, { recursive: true, force: true });

console.log('Market breadth shock: PUMP/DUMP WATCH+DANGER, coverage fail-closed, colors, persistence and Discord dedupe passed; mock only.');
