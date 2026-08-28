import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildMarketDirectionSnapshot,
  buildLiquidMarketDirectionSignalLogRecord,
  deriveLiquidMarketDirectionScoreDynamics,
  evaluateLiquidMarketDirectionHealth,
  stabilizeLiquidMarketDirectionLabel,
} from '../src/liquidMarketDirectionHealth.js';
import {
  LIQUID_MARKET_DIRECTION_DISCORD_VERSION,
  buildMarketDirectionDiscordPayload,
  evaluateMarketDirectionDiscordTransition,
} from '../src/liquidMarketDirectionDiscord.js';

const NOW = Date.UTC(2026, 6, 28, 12, 0, 0);

function candles({ count = 100, intervalMs = 15 * 60_000, start = 100, stepPct = 0, alternating = false } = {}) {
  let close = start;
  return Array.from({ length: count }, (_, index) => {
    const direction = alternating && index % 2 ? -1 : 1;
    const open = close;
    close *= 1 + (stepPct * direction) / 100;
    const openTime = NOW - (count - index + 1) * intervalMs;
    return {
      openTime,
      closeTime: openTime + intervalMs - 1,
      open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close,
      volume: index >= count - 4 ? 130 : 100,
    };
  });
}

function btcSet(stepPct) {
  return {
    btcCandles5m: candles({ intervalMs: 5 * 60_000, stepPct, start: 60_000 }),
    btcCandles15m: candles({ intervalMs: 15 * 60_000, stepPct, start: 60_000 }),
    btcCandles1h: candles({ intervalMs: 60 * 60_000, stepPct, start: 60_000 }),
    btcHealth: {
      btcTrendDir: stepPct > 0 ? 'up' : stepPct < 0 ? 'down' : 'flat',
      btcTrendScore: Math.abs(stepPct) > 0 ? 82 : 10,
      emaTrend1h: stepPct >= 0 ? 'above' : 'below',
      rsi1h: stepPct > 0 ? 63 : stepPct < 0 ? 37 : 50,
      pct6h: stepPct * 6,
    },
  };
}

function universe(stepFactory, count = 80) {
  return Array.from({ length: count }, (_, index) => ({
    symbol: `ALT${index}USDT`,
    candles15m: candles({ stepPct: stepFactory(index) }),
  }));
}

const long = evaluateLiquidMarketDirectionHealth({
  universe: universe(() => 0.22),
  ...btcSet(0.12),
  now: NOW,
});
assert.equal(long.rawLabel, 'LONG_FAVORED');
assert.ok(long.scores.long > long.scores.short + 30);

const short = evaluateLiquidMarketDirectionHealth({
  universe: universe(() => -0.22),
  ...btcSet(-0.12),
  now: NOW,
});
assert.equal(short.rawLabel, 'SHORT_FAVORED');
assert.ok(short.scores.short > short.scores.long + 30);

const chop = evaluateLiquidMarketDirectionHealth({
  universe: universe(() => 0).map((row, index) => ({
    ...row,
    candles15m: candles({ stepPct: 0.01, alternating: true, start: 100 + index }),
  })),
  ...btcSet(0),
  now: NOW,
});
assert.equal(chop.rawLabel, 'MARKET_CHOP');

const dispersion = evaluateLiquidMarketDirectionHealth({
  universe: universe((index) => index % 2 ? 0.25 : -0.25),
  ...btcSet(0),
  now: NOW,
});
assert.equal(dispersion.rawLabel, 'MARKET_DISPERSION');

const noData = evaluateLiquidMarketDirectionHealth({
  universe: universe(() => 0.2, 5),
  ...btcSet(0.1),
  now: NOW,
});
assert.equal(noData.rawLabel, 'NO_DATA');
const noDataDynamics = deriveLiquidMarketDirectionScoreDynamics(null, noData);
assert.equal(noDataDynamics.shortWaveState, 'SHORT_NO_DATA');
assert.equal(noDataDynamics.shortScore, null);
assert.equal(noDataDynamics.longWaveState, 'LONG_NO_DATA');
assert.equal(noDataDynamics.longScore, null);
const recoveredSameSampleDynamics = deriveLiquidMarketDirectionScoreDynamics(
  { scores: { long: 0, short: 0 }, scoreDynamics: noDataDynamics },
  {
    sampleKey: noDataDynamics.sampleKey,
    evaluatedAt: NOW,
    rawLabel: 'MARKET_TRANSITION',
    scores: { long: 27, short: 29 },
    btc: { ret15m: 0.1 },
  },
);
assert.equal(recoveredSameSampleDynamics.shortScore, 29);
assert.equal(recoveredSameSampleDynamics.longScore, 27);
assert.equal(recoveredSameSampleDynamics.shortScoreSlope, 0);
assert.equal(recoveredSameSampleDynamics.longScoreSlope, 0);
assert.notEqual(recoveredSameSampleDynamics.shortWaveState, 'SHORT_NO_DATA');

const buildupDynamics = deriveLiquidMarketDirectionScoreDynamics(null, {
  sampleKey: 'score-1',
  evaluatedAt: NOW,
  scores: { long: 18, short: 55 },
  btc: { ret15m: -0.4 },
});
assert.equal(buildupDynamics.shortWaveState, 'SHORT_BUILDUP');
const impulseDynamics = deriveLiquidMarketDirectionScoreDynamics(
  { scores: { short: 55 }, scoreDynamics: buildupDynamics },
  {
    sampleKey: 'score-2',
    evaluatedAt: NOW + 300_000,
    scores: { long: 12, short: 62 },
    btc: { ret15m: -0.9 },
  },
);
assert.equal(impulseDynamics.shortWaveState, 'SHORT_IMPULSE');
assert.equal(impulseDynamics.shortWaveLabel, 'SHORT IMPULSE');
assert.equal(impulseDynamics.shortScorePeak, 62);
const reclaimDynamics = deriveLiquidMarketDirectionScoreDynamics(
  { scores: { short: 62 }, scoreDynamics: impulseDynamics },
  {
    sampleKey: 'score-3',
    evaluatedAt: NOW + 600_000,
    scores: { long: 35, short: 48 },
    btc: { ret15m: 0.2 },
  },
);
assert.equal(reclaimDynamics.shortWaveState, 'BTC_CRASH_RECLAIM');
assert.match(reclaimDynamics.shortWaveDescription, /bất lợi cho SHORT mới/i);
assert.equal(reclaimDynamics.shortScorePrev, 62);
assert.equal(reclaimDynamics.shortScoreDropFromPeak, 14);
assert.ok(reclaimDynamics.btcReclaimPct >= 1.1);

const longBuildupDynamics = deriveLiquidMarketDirectionScoreDynamics(null, {
  sampleKey: 'long-1',
  evaluatedAt: NOW,
  scores: { long: 55, short: 18 },
  btc: { ret15m: 0.4 },
});
assert.equal(longBuildupDynamics.longWaveState, 'LONG_BUILDUP');
const longImpulseDynamics = deriveLiquidMarketDirectionScoreDynamics(
  { scores: { long: 55 }, scoreDynamics: longBuildupDynamics },
  {
    sampleKey: 'long-2',
    evaluatedAt: NOW + 300_000,
    scores: { long: 62, short: 12 },
    btc: { ret15m: 0.9 },
  },
);
assert.equal(longImpulseDynamics.longWaveState, 'LONG_IMPULSE');
assert.equal(longImpulseDynamics.longScorePeak, 62);
const longRejectDynamics = deriveLiquidMarketDirectionScoreDynamics(
  { scores: { long: 62 }, scoreDynamics: longImpulseDynamics },
  {
    sampleKey: 'long-3',
    evaluatedAt: NOW + 600_000,
    scores: { long: 48, short: 35 },
    btc: { ret15m: -0.2 },
  },
);
assert.equal(longRejectDynamics.longWaveState, 'BTC_RALLY_REJECT');
assert.equal(longRejectDynamics.longScorePrev, 62);
assert.equal(longRejectDynamics.longScoreDropFromPeak, 14);
assert.ok(longRejectDynamics.btcRejectFromHighPct >= 1.1);

let state = stabilizeLiquidMarketDirectionLabel(null, { rawLabel: 'LONG_FAVORED', sampleKey: '1' }, 2);
assert.equal(state.committedLabel, 'LONG_FAVORED');
state = stabilizeLiquidMarketDirectionLabel(state, { rawLabel: 'SHORT_FAVORED', sampleKey: '2' }, 2);
assert.equal(state.committedLabel, 'LONG_FAVORED');
assert.equal(state.candidateCount, 1);
state = stabilizeLiquidMarketDirectionLabel(state, { rawLabel: 'SHORT_FAVORED', sampleKey: '3' }, 2);
assert.equal(state.committedLabel, 'SHORT_FAVORED');

const readyAfterWarmup = stabilizeLiquidMarketDirectionLabel(
  { committedLabel: 'NO_DATA', candidateLabel: null, candidateCount: 0, lastSampleKey: '4' },
  { rawLabel: 'MARKET_DISPERSION', sampleKey: '4' },
  2,
);
assert.equal(readyAfterWarmup.committedLabel, 'MARKET_DISPERSION');

const formingInsideCandle = stabilizeLiquidMarketDirectionLabel(
  { committedLabel: 'MARKET_TRANSITION', candidateLabel: null, candidateCount: 0, lastSampleKey: '5' },
  { rawLabel: 'SHORT_FAVORED', sampleKey: '5' },
  2,
);
assert.equal(formingInsideCandle.committedLabel, 'MARKET_TRANSITION');
assert.equal(formingInsideCandle.candidateLabel, 'SHORT_FAVORED');
assert.equal(formingInsideCandle.candidateCount, 0);

const sourceTrade = {
  id: 'trade-1',
  symbol: 'ETHUSDT',
  side: 'SHORT',
  status: 'OPEN',
  source: 'liquid-scan-auto-88',
  signalType: 'LIQUID_KILL_ZONE',
  signalTimeframe: '15m',
  createdAt: '2026-07-28T12:00:00.000Z',
  openedAt: '2026-07-28T12:00:00.000Z',
};
const sourceTradeBefore = JSON.stringify(sourceTrade);
const logRecord = buildLiquidMarketDirectionSignalLogRecord(sourceTrade, {
  ...dispersion,
  label: 'MARKET_DISPERSION',
  universeSize: 80,
}, NOW);
assert.equal(logRecord.tradeId, 'trade-1');
assert.equal(logRecord.marketDirection.label, 'MARKET_DISPERSION');
assert.equal(logRecord.marketDirection.affectsOrders, false);
assert.equal(logRecord.marketDirection.observationOnly, true);
assert.equal(JSON.stringify(sourceTrade), sourceTradeBefore, 'building sidecar record must not mutate trade JSON');

const embeddedSnapshot = buildMarketDirectionSnapshot({
  ...short,
  label: 'SHORT_FAVORED',
  universeSize: 80,
  scoreDynamics: reclaimDynamics,
});
const pumpOrEdgeTradeJson = JSON.stringify({
  ...sourceTrade,
  marketDirectionAtSignal: embeddedSnapshot,
});
const parsedPumpOrEdgeTrade = JSON.parse(pumpOrEdgeTradeJson);
assert.equal(parsedPumpOrEdgeTrade.id, sourceTrade.id);
assert.equal(parsedPumpOrEdgeTrade.marketDirectionAtSignal.label, 'SHORT_FAVORED');
assert.equal(parsedPumpOrEdgeTrade.marketDirectionAtSignal.affectsOrders, false);
assert.equal(parsedPumpOrEdgeTrade.marketDirectionAtSignal.observationOnly, true);
assert.equal(parsedPumpOrEdgeTrade.marketDirectionAtSignal.scoreDynamics.shortWaveState, 'BTC_CRASH_RECLAIM');
assert.equal(parsedPumpOrEdgeTrade.marketDirectionAtSignal.scoreDynamics.affectsOrders, false);

assert.deepEqual(
  evaluateMarketDirectionDiscordTransition('', { label: 'SHORT_FAVORED' }),
  { action: 'ARM_BASELINE', previousLabel: null, currentLabel: 'SHORT_FAVORED' },
);
assert.equal(
  evaluateMarketDirectionDiscordTransition('SHORT_FAVORED', { label: 'SHORT_FAVORED', pendingLabel: 'LONG_FAVORED' }).action,
  'NO_CHANGE',
  'pending/raw change must not notify before committed label changes',
);
assert.equal(
  evaluateMarketDirectionDiscordTransition('SHORT_FAVORED', { label: 'NO_DATA' }).action,
  'IGNORE_NO_DATA',
);
const directionDiscordPayload = buildMarketDirectionDiscordPayload({
  previousLabel: 'SHORT_FAVORED',
  market: {
    label: 'LONG_FAVORED',
    evaluatedAt: NOW,
    sampleKey: 'closed-5m',
    scores: { long: 68, short: 18, confidence: 91 },
    breadth: { up1hPct: 72, down1hPct: 12, up3hPct: 66, down3hPct: 18, up6hPct: 59, down6hPct: 22 },
    btc: { ret15m: 0.3, ret1h: 0.8, ret6h: 1.9, trend: 'UP' },
    sampleSize: 120,
    universeSize: 120,
    hysteresisSamples: 2,
    reasons: ['72% alt tăng trong 1h', 'BTC đồng thuận đi lên'],
  },
});
assert.ok(directionDiscordPayload);
assert.equal(directionDiscordPayload.embeds[0].color, 0x32eeb8);
assert.match(directionDiscordPayload.embeds[0].title, /SHORT FAVORED → LONG FAVORED/);
assert.match(directionDiscordPayload.embeds[0].description, /OBSERVE ONLY/);
assert.match(directionDiscordPayload.embeds[0].footer.text, new RegExp(LIQUID_MARKET_DIRECTION_DISCORD_VERSION));
assert.equal(buildMarketDirectionDiscordPayload({ previousLabel: 'SHORT_FAVORED', market: { label: 'SHORT_FAVORED' } }), null);
const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
const envExampleSource = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
assert.match(serverSource, /queueLiquidMarketDirectionDiscord\(data\)/);
assert.match(serverSource, /LIQUID_MARKET_DIRECTION_DISCORD_STATE_FILE/);
assert.match(serverSource, /AbortSignal\.timeout\(12_000\)/);
assert.match(envExampleSource, /^LIQUID_MARKET_DIRECTION_DISCORD_WEBHOOK_URL=$/m);

console.log('liquid market direction health tests: OK');
