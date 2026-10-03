import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessLiqScanSweepRejectLong } from '../src/liqScanSweepRejectLong.js';
import {
  LocalAiLiquiditySweepRejectDiscordNotifier,
  buildLiqScanSweepRejectDiscordPayload,
  detectLiqScanSweepRejectEvent,
  normalizeLiqScanSweepAlert,
} from '../src/localAiLiquiditySweepRejectDiscord.js';

const start = Date.UTC(2026, 9, 1, 8, 0);
let now = start + 30 * 60_000 + 1_000;
const candle = (minute, open, high, low, close, duration = 5, takerBuyPct = 50) => ({
  openTime: start + minute * 60_000,
  closeTime: start + (minute + duration) * 60_000 - 1,
  open, high, low, close,
  quoteVolume: 100,
  takerBuyQuoteVolume: takerBuyPct,
});

const shortAlert = {
  symbol: 'SHORTUSDT', isAlert: true, dominantSide: 'ABOVE', dominantPct: 69.1,
  imbalanceScore: 62, markPrice: 100, evaluatedAt: new Date(start).toISOString(),
  killZoneCluster: { mainKillZone: { low: 104, high: 105, mid: 104.5 } },
};
const shortBars = [
  candle(0, 100, 102, 99, 101),
  candle(5, 101, 106, 100, 104.5),
  candle(10, 104.5, 105, 101, 102),
  candle(15, 102, 103, 99, 100),
  candle(20, 100, 101, 98, 99),
  candle(25, 99, 100, 98, 99.5),
];
const shortTrack = normalizeLiqScanSweepAlert(shortAlert);
const shortEvent = detectLiqScanSweepRejectEvent({ track: shortTrack, candles5m: shortBars, markPrice: 99.5, now });
assert.equal(shortEvent.side, 'SHORT');
assert.equal(shortEvent.state, 'REJECTED_AFTER_SWEEP');
assert.equal(shortEvent.dominantPct, 69.1);
const shortPayload = buildLiqScanSweepRejectDiscordPayload(shortEvent, 'http://127.0.0.1:19082');
assert.equal(shortPayload.embeds[0].color, 0xf43f5e);
assert.match(shortPayload.embeds[0].title, /QUÉT TRÊN \+ REJECT.*SHORT WATCH/);
assert.match(shortPayload.embeds[0].description, /OBSERVE ONLY/);

const longAlert = {
  symbol: 'LONGUSDT', isAlert: true, dominantSide: 'BELOW', dominantPct: 72.4,
  imbalanceScore: 67, markPrice: 100, evaluatedAt: new Date(start).toISOString(),
  killZoneCluster: { mainKillZone: { low: 95, high: 96, mid: 95.5 } },
};
const longBars = [
  candle(0, 100, 101, 98, 99),
  candle(5, 99, 100, 97, 98),
  candle(10, 98, 98, 94, 95.5),
  candle(15, 95.5, 97, 95, 96.5, 5, 60),
  candle(20, 96.5, 98, 96, 97.5, 5, 60),
  candle(25, 97.5, 99, 97, 98, 5, 60),
];
const longTrack = normalizeLiqScanSweepAlert(longAlert);
const longEvent = detectLiqScanSweepRejectEvent({ track: longTrack, candles5m: longBars, markPrice: 98, now });
assert.equal(longEvent.side, 'LONG');
assert.equal(longEvent.state, 'REJECTED_AFTER_SWEEP');
const longPayload = buildLiqScanSweepRejectDiscordPayload(longEvent, 'http://127.0.0.1:19082');
assert.equal(longPayload.embeds[0].color, 0x16c784);
assert.match(longPayload.embeds[0].title, /QUÉT DƯỚI \+ REJECT.*LONG WATCH/);

const longAssessment = assessLiqScanSweepRejectLong({
  symbol: 'LONGUSDT',
  generatedAt: new Date(now).toISOString(),
  freshness: { stale: false },
  market: { markPrice: 98 },
  trend: { frames: [{ interval: '5m', atr14: 1 }] },
  zones: { resistances: [{ low: 100 }] },
  liqScanCandleContext: {
    '5m': longBars,
    '15m': [
      candle(0, 100, 101, 94, 96.5, 15, 55),
      candle(15, 96.5, 99, 96, 98, 15, 60),
    ],
  },
}, longAlert, now);
assert.equal(longAssessment.side, 'LONG');
assert.ok(longAssessment.sweepAt > 0);
assert.ok(longAssessment.rejectAt > 0);
assert.ok(['WATCH_NO_CHASE', 'LONG_SETUP_CONFIRMED'].includes(longAssessment.state));

const directory = await mkdtemp(join(tmpdir(), 'local-ai-liq-sweep-reject-'));
const requests = [];
try {
  const notifier = new LocalAiLiquiditySweepRejectDiscordNotifier({
    stateFile: join(directory, 'state.json'),
    enabled: true,
    webhookUrl: 'https://discord.com/api/webhooks/123/token',
    baseUrl: 'http://127.0.0.1:19082',
    now: () => now,
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 204 };
    },
  });
  assert.equal((await notifier.arm(shortAlert)).armed, true);
  const first = await notifier.scan({
    getRows: symbol => symbol === 'SHORTUSDT' ? shortBars : [],
    getMark: () => 99.5,
  });
  assert.equal(first.detected, 1);
  assert.equal(first.sent, 1);
  assert.equal(requests.length, 1);
  assert.equal(notifier.snapshot().tracked, 0);

  await notifier.arm(shortAlert);
  const duplicate = await notifier.scan({ getRows: () => shortBars, getMark: () => 99.5 });
  assert.equal(duplicate.sent, 0, 'same route stays deduped during cooldown');
  assert.equal(requests.length, 1);

  const disabled = new LocalAiLiquiditySweepRejectDiscordNotifier({
    stateFile: join(directory, 'disabled-state.json'),
    enabled: false,
    webhookUrl: 'https://discord.com/api/webhooks/123/token',
    now: () => now,
    fetchImpl: async () => {
      throw new Error('disabled notifier must not call Discord');
    },
  });
  assert.equal(disabled.configured(), false);
  assert.equal(disabled.snapshot().enabled, false);
  assert.deepEqual(await disabled.arm(shortAlert), { armed: false, reason: 'DISABLED' });
  const disabledScan = await disabled.scan({ getRows: () => shortBars, getMark: () => 99.5 });
  assert.equal(disabledScan.sent, 0);
  assert.equal(disabledScan.detected, 0);
  assert.equal(disabledScan.enabled, false);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('local AI two-sided LiqScan sweep/reject Discord tests: OK');
