import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION,
  buildCoinglassHybridLiquidityDiscordPayload,
  coinglassTwoSidedLiquidityProfile,
  evaluateCoinglassHybridLiquidityHunter,
  selectCoinglassHybridLiquidityCandidates,
} from '../src/coinglassHybridLiquidityHunter.js';
import { CoinGlassWebTop20Manager } from '../src/coinglassWebTop20.js';

const now = Date.UTC(2026, 8, 1, 8, 0, 0);

function makeTrendKlines({ intervalMs, count = 140, impulseIndex = null } = {}) {
  const rows = [];
  let previousClose = 100;
  for (let index = 0; index < count; index += 1) {
    const open = previousClose;
    const impulse = index === impulseIndex;
    const close = impulse ? open * 1.035 : open * 1.00035;
    const high = impulse ? close * 1.003 : close * 1.0015;
    const low = impulse ? open * 0.999 : open * 0.998;
    rows.push({
      openTime: now - (count - index) * intervalMs,
      closeTime: now - (count - index - 1) * intervalMs - 1,
      open,
      high,
      low,
      close,
      quoteVolume: impulse ? 4_000 : 1_000,
      takerBuyQuoteVolume: impulse || index >= count - 3 ? 580 : 510,
    });
    previousClose = close;
  }
  return rows;
}

const klines5m = makeTrendKlines({ intervalMs: 5 * 60_000, impulseIndex: 132 });
const klines15m = makeTrendKlines({ intervalMs: 15 * 60_000 });
const currentPrice = klines5m.at(-1).close;
const zone = (price, strength) => ({
  price,
  bandLow: price * 0.998,
  bandHigh: price * 1.002,
  strength,
  persistenceBars: 8,
  lastX: 100,
});
const row = {
  symbol: 'TESTUSDT',
  status: 'OK',
  stale: false,
  lastPrice: currentPrice,
  heatmap: {
    currentPrice,
    lastHeatmapX: 100,
    edgeZones: [
      zone(currentPrice * 1.05, 100),
      zone(currentPrice * 1.1, 80),
      zone(currentPrice * 0.95, 95),
      zone(currentPrice * 0.9, 85),
    ],
  },
};

const profile = coinglassTwoSidedLiquidityProfile(row);
assert.equal(profile.eligible, true);
assert.equal(profile.upper.count, 2);
assert.equal(profile.lower.count, 2);
assert.equal(selectCoinglassHybridLiquidityCandidates([row], { maxCandidates: 8 }).length, 1);

const signal = evaluateCoinglassHybridLiquidityHunter({
  row,
  profile,
  klines5m,
  klines15m,
  openInterest: { deltaPct: 0.1, delta5mPct: 0.2, stabilizing: false },
  liquidation: { shortLiquidationUsd: 25_000, longLiquidationUsd: 3_000, shortBurstRatio: 2.2 },
  now,
  streamId: 'primary',
});
assert.equal(signal.version, COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION);
assert.equal(signal.ready, true);
assert.equal(signal.observeOnly, false);
assert.equal(signal.binanceEligible, true);
assert.equal(signal.executionEligible, true);
assert.equal(signal.side, 'LONG');
assert.equal(signal.confirmedAt, klines5m.at(-1).closeTime);
assert.equal(signal.label, 'HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY');
assert.equal(signal.bias, 'UPPER_FIRST');
assert.equal(signal.target.targetPrice > currentPrice, true);
assert.equal(signal.target.targetDistancePct > 0, true);
assert.match(buildCoinglassHybridLiquidityDiscordPayload(signal).embeds[0].description, /1 USDT margin × 5x/);

const stale = evaluateCoinglassHybridLiquidityHunter({
  row,
  profile,
  klines5m,
  klines15m,
  now: now + 60 * 60_000,
});
assert.equal(stale.ready, false);
assert.equal(stale.reason, 'BINANCE_KLINE_STALE');

const oneSidedRow = {
  ...row,
  heatmap: { ...row.heatmap, edgeZones: row.heatmap.edgeZones.slice(0, 2) },
};
assert.equal(coinglassTwoSidedLiquidityProfile(oneSidedRow).eligible, false);

const previousEnabled = process.env.COINGLASS_HYBRID_LIQUIDITY_ENABLED;
const previousWebhook = process.env.COINGLASS_HYBRID_LIQUIDITY_DISCORD_WEBHOOK_URL;
process.env.COINGLASS_HYBRID_LIQUIDITY_ENABLED = 'true';
process.env.COINGLASS_HYBRID_LIQUIDITY_DISCORD_WEBHOOK_URL = 'https://discord.invalid/test';
const dataDir = await mkdtemp(join(tmpdir(), 'coinglass-hybrid-'));
try {
  const sentPayloads = [];
  let executionCalls = 0;
  const manager = new CoinGlassWebTop20Manager({
    rootDir: process.cwd(),
    dataDir,
    onHybridLiquidityScan: async () => [signal],
    onHybridLiquiditySignal: async () => ({
      status: executionCalls++ === 0 ? 'submitted' : 'deduped',
    }),
  });
  manager.postHybridLiquidityDiscord = async (payload) => {
    sentPayloads.push(payload);
    return { sent: true };
  };
  const first = await manager.processHybridLiquidityRows([row]);
  const second = await manager.processHybridLiquidityRows([row]);
  assert.equal(first.sent, 1);
  assert.equal(first.submitted, 1);
  assert.equal(second.sent, 0);
  assert.equal(second.submitted, 0);
  assert.equal(executionCalls, 2, 'Binance runner owns its dedupe and is not blocked by Discord dedupe');
  assert.equal(sentPayloads.length, 1);
} finally {
  if (previousEnabled == null) delete process.env.COINGLASS_HYBRID_LIQUIDITY_ENABLED;
  else process.env.COINGLASS_HYBRID_LIQUIDITY_ENABLED = previousEnabled;
  if (previousWebhook == null) delete process.env.COINGLASS_HYBRID_LIQUIDITY_DISCORD_WEBHOOK_URL;
  else process.env.COINGLASS_HYBRID_LIQUIDITY_DISCORD_WEBHOOK_URL = previousWebhook;
  await rm(dataDir, { recursive: true, force: true });
}

console.log('coinglass hybrid liquidity hunter tests passed');
