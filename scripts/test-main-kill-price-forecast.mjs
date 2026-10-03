import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { buildMainKillPriceForecast } from '../src/mainKillPriceForecast.js';
import { buildLocalAiMainKillGapWatchSnapshot } from '../src/localAiMainKillGapWatch.js';

const now = Date.UTC(2026, 9, 2, 15, 0);
const analysis = {
  symbol: 'TESTUSDT', generatedAt: new Date(now - 1000).toISOString(), freshness: { stale: false },
  market: { markPrice: 100 },
  trend: { frames: ['5m', '15m', '1h'].map(interval => ({ interval, state: 'UP', closeTime: now - 1000, atrPct: 1 })) },
  zones: { resistances: [{ low: 102, high: 103 }], supports: [{ low: 97, high: 98 }] },
  liqScan: { current: { dominantSide: 'ABOVE', killZoneCluster: { mainKillZone: { low: 105, high: 106 } } } },
};
const gap = { direction: 'UPPER', mainKillZone: { low: 105, high: 106 }, lifecycle: { active: true }, depth: { coverageEnough: true } };
const evaluation = { evaluatedAt: now - 1000, marketRegime: 'SW_DOWN', marketBias: 'SHORT_BIAS', candidates: [{ symbol: 'TESTUSDT', side: 'SHORT' }] };
const predict = (changes = {}) => buildMainKillPriceForecast({ analysis, gap, evaluation, now, ...changes });
const up = predict();
assert.equal(up.direction, 'UP', 'candidate side cannot override closed candles');
assert.equal(up.target.low, 102);
assert.equal(up.nextTarget.low, 105);
assert.equal(up.invalidation.price, 97);
assert.equal(up.target.distancePct, 2);
assert.ok(up.reasons.some(text => text.includes('BTC đang nghiêng ngược')));

const down = structuredClone(analysis);
down.trend.frames.forEach(frame => { frame.state = 'DOWN'; });
const lower = predict({ analysis: down, gap: { ...gap, direction: 'LOWER', mainKillZone: { low: 94, high: 95 } } });
assert.equal(lower.direction, 'DOWN');
assert.equal(lower.target.high, 98);
assert.equal(lower.nextTarget.high, 95);
assert.equal(lower.invalidation.price, 103);
assert.equal(lower.invalidation.crossing, 'ABOVE');

const conflict = predict({ gap: { ...gap, direction: 'LOWER', mainKillZone: { low: 94, high: 95 } } });
assert.equal(conflict.target.low, 102);
assert.equal(conflict.nextTarget, null);
assert.ok(conflict.reasons.some(text => text.includes('MAIN ngược hướng')));
const mixed = structuredClone(analysis);
mixed.trend.frames[0].state = 'DOWN';
assert.equal(predict({ analysis: mixed }).target, null);
assert.equal(predict({ analysis: { ...analysis, freshness: { stale: true } } }).target, null);
assert.equal(predict({ analysis: { ...analysis, generatedAt: new Date(now - 360000).toISOString() } }).direction, null);
const futureBar = structuredClone(analysis);
futureBar.trend.frames[0].closeTime = now + 1000;
assert.equal(predict({ analysis: futureBar }).direction, null);
const oldBar = structuredClone(analysis);
oldBar.trend.frames[1].closeTime = now - 30 * 60000;
assert.equal(predict({ analysis: oldBar }).direction, null);
const noZones = { ...analysis, zones: {} };
assert.equal(predict({ analysis: noZones, gap: { ...gap, lifecycle: { active: false } } }).target, null);
assert.equal(predict({ analysis: noZones, gap: { ...gap, mainKillZone: { low: 99, high: 101 } } }).target, null);
assert.equal(predict({ analysis: noZones }).target.source, 'MAIN_KILL');
assert.equal(predict({ evaluation: { ...evaluation, evaluatedAt: now - 21 * 60000 } }).btcContext, null);
assert.equal(predict({ analysis: {} }).binanceEligible, false);
assert.equal(buildLocalAiMainKillGapWatchSnapshot({ evaluation, analyses: [analysis], now }).rows[0].priceForecast.direction, 'UP');

const source = await readFile(new URL('../public/main-kill-gap-watch.js', import.meta.url), 'utf8');
const render = runInNewContext(`(${source.slice(source.indexOf('function forecastMarkup('), source.indexOf('function renderWithForecasts('))})`, {
  price: value => String(value), num: value => String(value), esc: value => String(value).replaceAll('<', '&lt;'),
});
assert.match(render(up), /102 – 103/);
assert.match(render(up), /105 – 106/);
assert.match(render(up), /dưới 97/);
assert.match(render(null), /Chưa có dự báo/);
assert.match(render(predict({ analysis: {} })), /Chưa xác định vùng giá/);
assert.match(render({ ...up, reasons: ['<script>'] }), /&lt;script>/);
console.log('main kill conditional price forecast tests: OK');
