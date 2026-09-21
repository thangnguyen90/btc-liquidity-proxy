#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION,
  LIQ_SCAN_HIGH_SCORE_DISCORD_THRESHOLD,
  LIQ_SCAN_HIGH_SCORE_BINANCE_THRESHOLD,
  LIQ_SCAN_HIGH_SCORE_THRESHOLD,
  LiqScanHighScoreDiscordNotifier,
  buildLiqScanHighScorePayload,
  collectLiqScanHighScoreState,
} from '../src/liqScanHighScoreDiscord.js';

let now = Date.UTC(2026, 8, 12, 12, 0, 0);
const validUrl = 'https://discord.com/api/webhooks/123456789/token_ABC-123';

function analysis(score = 81, dominantSide = 'ABOVE') {
  return {
    symbol: 'TESTUSDT',
    freshness: { stale: false },
    market: { markPrice: 0.75641 },
    trend: { bias: dominantSide === 'ABOVE' ? 'BULLISH' : 'BEARISH' },
    recommendation: {
      confirmation: dominantSide === 'ABOVE'
        ? { breakout: 'CONFIRMED_15M' } : { breakdown: 'CONFIRMED_15M' },
      longPlan: { entryZone: { low: 0.74, high: 0.75 }, invalidation: 0.72, targets: [0.78] },
      shortPlan: { entryZone: { low: 0.76, high: 0.77 }, invalidation: 0.79, targets: [0.72] },
    },
    liqScan: {
      evaluatedAt: new Date(now).toISOString(),
      imbalanceScore: score,
      sweepProbabilityPct: score,
      liquidityAbove: dominantSide === 'ABOVE' ? 697_410_000 : 10_000_000,
      liquidityBelow: dominantSide === 'BELOW' ? 697_410_000 : 0,
      totalLiquidity: 697_410_000,
      bias: dominantSide === 'ABOVE' ? 1 : -1,
      dominantSide,
      isAlert: score >= 40,
      stale: false,
    },
    coinglass: {
      available: true,
      combined: { liquidityBias: dominantSide === 'ABOVE' ? 'UPPER_FIRST' : 'LOWER_FIRST' },
      frames: [{
        range: '24h',
        scrapedAt: new Date(now).toISOString(),
        above: dominantSide === 'ABOVE' ? [{
          bandLow: 0.76473, bandHigh: 0.76624, effectiveAttractionScore: 50, lifecycle: 'FRESH',
        }] : [],
        below: dominantSide === 'BELOW' ? [{
          bandLow: 0.71, bandHigh: 0.72, effectiveAttractionScore: 50, lifecycle: 'FRESH',
        }] : [],
      }],
    },
  };
}

assert.equal(LIQ_SCAN_HIGH_SCORE_DISCORD_THRESHOLD, 65);
assert.equal(LIQ_SCAN_HIGH_SCORE_BINANCE_THRESHOLD, 80);
assert.equal(LIQ_SCAN_HIGH_SCORE_THRESHOLD, 80, 'legacy alias retains the Binance gate');
assert.equal(LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION, 'LIQ_SCAN_SCORE65_DISCORD_BINANCE80_V3_20260918');
assert.equal(collectLiqScanHighScoreState(analysis(64.99), now).active, false);
assert.equal(collectLiqScanHighScoreState(analysis(65), now).active, true, 'Discord includes exactly 65');
assert.equal(collectLiqScanHighScoreState(analysis(65), now).binanceEligible, false);
assert.equal(collectLiqScanHighScoreState(analysis(65), now).observeOnly, true);
assert.equal(collectLiqScanHighScoreState(analysis(80), now).binanceEligible, false,
  'Binance remains strict >80');
assert.equal(collectLiqScanHighScoreState(analysis(80.01), now).binanceEligible, true);
assert.equal(collectLiqScanHighScoreState(analysis(80.01), now).observeOnly, false);
assert.equal(collectLiqScanHighScoreState(analysis(99), now).side, 'LONG');
const down = collectLiqScanHighScoreState(analysis(99, 'BELOW'), now);
assert.equal(down.side, 'SHORT');
assert.equal(buildLiqScanHighScorePayload(down).embeds[0].color, 0xef4444);
assert.match(buildLiqScanHighScorePayload(down).embeds[0].title, /QUÉT DƯỚI/);
assert.deepEqual(buildLiqScanHighScorePayload(down).allowed_mentions, { parse: [] });
assert.ok(buildLiqScanHighScorePayload(down).embeds[0].fields.every((field) => field.value.length <= 1024));
assert.match(buildLiqScanHighScorePayload({
  ...down,binanceExecution:{status:'background-observe-only'},
}).embeds[0].description,/SCANNER NỀN CHỈ GỬI DISCORD/);

const stale = analysis(99);
stale.liqScan.evaluatedAt = new Date(now - 90_001).toISOString();
assert.equal(collectLiqScanHighScoreState(stale, now), null);

const directory = await mkdtemp(join(tmpdir(), 'liqscan-high-score-'));
const stateFile = join(directory, 'state.json');
const calls = [];
const executions = [];
const options = {
  stateFile,
  webhookUrl: () => validUrl,
  now: () => now,
  fetchImpl: async (_url, request) => {
    calls.push(JSON.parse(request.body));
    return { ok: true, status: 204 };
  },
  execute: async (event) => {
    executions.push(`${event.symbol}:${event.dominantSide}:${event.score}`);
    return {
      status: 'submitted', side: event.side, marginUsdt: 5, leverage: 5,
      takeProfitRoePct: 15, stopLossRoePct: event.side === 'LONG' ? 20 : 30,
    };
  },
};

let notifier = new LiqScanHighScoreDiscordNotifier(options);
assert.equal((await notifier.notify(analysis(64.99))).reason, 'below_discord_threshold');
assert.equal((await notifier.notify(analysis(65))).sent, 1, 'exactly 65 sends Discord');
assert.equal((await notifier.notify(analysis(75))).reason, 'same_high_score_episode');
assert.equal(calls.length, 1, 'rising score below the Binance tier does not spam');
assert.equal(executions.length, 0, '65-80 Discord alerts never invoke Binance');
assert.match(calls[0].embeds[0].description, /BINANCE chưa đủ strict >80/);
assert.equal((await notifier.notify(analysis(81))).sent, 1,
  'crossing the separately preserved Binance tier sends one upgrade alert');
assert.equal(executions.length, 1);
assert.match(calls[1].embeds[0].description, /BINANCE THẬT: SUBMITTED/);
assert.equal((await notifier.notify(analysis(99))).reason, 'same_high_score_episode');
assert.equal(calls.length, 2, 'same direction cannot spam after both tiers were notified');
assert.equal(executions.length, 1, 'same high-score episode cannot submit twice');

notifier = new LiqScanHighScoreDiscordNotifier(options);
assert.equal((await notifier.notify(analysis(95))).reason, 'same_high_score_episode', 'restart preserves dedupe');
assert.equal((await notifier.notify(analysis(64.99))).sent, 0, 'only a score below 65 resets the episode');
now += 1_000;
assert.equal((await notifier.notify(analysis(65))).sent, 1, 'a new crossing to exactly 65 sends again');
now += 1_000;
assert.equal((await notifier.notify(analysis(70, 'BELOW'))).sent, 1, 'direction flip above 65 sends');
assert.equal(calls.length, 4);
assert.equal(executions.length, 1, 'sub-80 direction alerts remain Discord-only');

const saved = JSON.parse(await readFile(stateFile, 'utf8'));
assert.equal(saved.version, LIQ_SCAN_HIGH_SCORE_DISCORD_VERSION);
assert.equal(saved.symbols.TESTUSDT.active, true);
assert.equal(saved.symbols.TESTUSDT.dominantSide, 'BELOW');

const legacyDirectory = await mkdtemp(join(tmpdir(), 'liqscan-high-score-legacy-'));
const legacyStateFile = join(legacyDirectory, 'state.json');
await writeFile(legacyStateFile, JSON.stringify({
  version: 'LIQ_SCAN_HIGH_SCORE_DISCORD_BINANCE_V2_20260916',
  symbols: { TESTUSDT: { active: true, dominantSide: 'ABOVE', score: 99, observedAt: now } },
}));
const legacyCalls=[];
const legacyNotifier=new LiqScanHighScoreDiscordNotifier({
  ...options,stateFile:legacyStateFile,fetchImpl:async()=>{legacyCalls.push(1);return {ok:true,status:204};},
});
assert.equal((await legacyNotifier.notify(analysis(95))).reason,'same_high_score_episode',
  'legacy active >80 state is inferred as both tiers notified and never replayed');
assert.equal(legacyCalls.length,0);

console.log('LiqScan >=65 Discord + strict >80 Binance: inclusive alert threshold, tier upgrade, reset, direction flip and restart dedupe passed.');
