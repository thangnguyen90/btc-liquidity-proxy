import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LocalAiLiquidityBreakoutOppositeDepthDiscordNotifier,
  assessLiquidityBreakoutOppositeDepth,
  buildLiquidityBreakoutOppositeDepthDiscordPayload,
  detectLiquidityZoneBreakout,
} from '../src/localAiLiquidityBreakoutOppositeDepthDiscord.js';
import { normalizeLiqScanSweepAlert } from '../src/localAiLiquiditySweepRejectDiscord.js';

const start = Date.UTC(2026, 9, 3, 8, 0);
let now = start + 31 * 60_000;
const candle = (minute, open, high, low, close, intervalMinutes = 5) => ({
  openTime: start + minute * 60_000,
  closeTime: start + (minute + intervalMinutes) * 60_000 - 1,
  open, high, low, close,
});
const alert = (symbol, direction, low, high) => ({
  symbol,
  isAlert: true,
  dominantSide: direction,
  dominantPct: 70,
  imbalanceScore: 66,
  markPrice: 100,
  evaluatedAt: new Date(start).toISOString(),
  killZoneCluster: { mainKillZone: { low, high, mid: (low + high) / 2 } },
});
const analysis = (symbol, bidNotional, askNotional) => ({
  symbol,
  generatedAt: new Date(now).toISOString(),
  freshness: { stale: false },
  market: { markPrice: 108 },
  orderBookProfile: {
    source: 'BINANCE_FUTURES_DEPTH',
    totals: { bidNotional, askNotional },
    coverage: {
      bid: { farthestDistancePct: 7.2 },
      ask: { farthestDistancePct: 6.8 },
    },
  },
});

const upperAlert = alert('UPPERUSDT', 'ABOVE', 104, 105);
const upperTrack = normalizeLiqScanSweepAlert(upperAlert);
const upperBars = [
  candle(0, 100, 102, 99, 101),
  candle(5, 101, 105, 100, 104),
  candle(10, 104, 107, 103, 106),
  candle(15, 106, 108, 105.5, 107),
  candle(20, 107, 109, 106, 108),
  candle(25, 108, 109, 107, 108),
];
const upperBreakout = detectLiquidityZoneBreakout({ track: upperTrack, candles: upperBars, interval: '5m', now });
assert.equal(upperBreakout.side, 'LONG');
assert.equal(upperBreakout.interval, '5m');
assert.equal(upperBreakout.state, 'CLOSED_ABOVE_UPPER_ZONE');
const upperEvent = assessLiquidityBreakoutOppositeDepth({
  breakout: upperBreakout,
  analysis: analysis('UPPERUSDT', 800_000, 500_000),
});
assert.equal(upperEvent.depth.oppositeSide, 'BID_BELOW');
assert.equal(upperEvent.depth.oppositeRatio, 1.6);
assert.equal(assessLiquidityBreakoutOppositeDepth({
  breakout: upperBreakout,
  analysis: analysis('UPPERUSDT', 400_000, 500_000),
}), null, 'upper breakout needs the opposite BID total to be larger');
const upperPayload = buildLiquidityBreakoutOppositeDepthDiscordPayload(upperEvent, 'http://127.0.0.1:19082');
assert.equal(upperPayload.embeds[0].color, 0xf43f5e);
assert.match(upperPayload.embeds[0].title, /VƯỢT VÙNG TRÊN.*BID BÊN DƯỚI LỚN HƠN/);
assert.match(upperPayload.embeds[0].description, /NẾN 5M ĐÃ ĐÓNG/);
assert.match(upperPayload.embeds[0].fields[1].name, /TỔNG BÊN/);
assert.match(upperPayload.embeds[0].fields[2].value, /LONG theo hướng breakout/);

const upperBars15m = [
  candle(0, 100, 105, 99, 104, 15),
  candle(15, 104, 108, 103, 106, 15),
];
const upperBreakout15m = detectLiquidityZoneBreakout({
  track: upperTrack,
  candles: upperBars15m,
  interval: '15m',
  now,
});
assert.equal(upperBreakout15m.side, 'LONG');
assert.equal(upperBreakout15m.interval, '15m');
const upperEvent15m = assessLiquidityBreakoutOppositeDepth({
  breakout: upperBreakout15m,
  analysis: analysis('UPPERUSDT', 800_000, 500_000),
});
assert.notEqual(upperEvent15m.eventId, upperEvent.eventId, '5m and 15m must dedupe independently');
assert.notEqual(upperEvent15m.routeKey, upperEvent.routeKey, '5m and 15m must cool down independently');
assert.match(
  buildLiquidityBreakoutOppositeDepthDiscordPayload(upperEvent15m, 'http://127.0.0.1:19082')
    .embeds[0].description,
  /NẾN 15M ĐÃ ĐÓNG/,
);

const reenteredBars = [...upperBars.slice(0, -1), candle(25, 108, 109, 103, 104)];
assert.equal(detectLiquidityZoneBreakout({ track: upperTrack, candles: reenteredBars, interval: '5m', now }), null,
  'do not alert later when the latest closed candle has returned inside the zone');

const lowerAlert = alert('LOWERUSDT', 'BELOW', 95, 96);
const lowerTrack = normalizeLiqScanSweepAlert(lowerAlert);
const lowerBars = [
  candle(0, 100, 101, 98, 99),
  candle(5, 99, 100, 96, 97),
  candle(10, 97, 98, 94, 94.5),
  candle(15, 94.5, 95, 93, 94),
  candle(20, 94, 94.5, 92, 93),
  candle(25, 93, 94, 92.5, 93.5),
];
const lowerBreakout = detectLiquidityZoneBreakout({ track: lowerTrack, candles: lowerBars, interval: '5m', now });
const lowerEvent = assessLiquidityBreakoutOppositeDepth({
  breakout: lowerBreakout,
  analysis: { ...analysis('LOWERUSDT', 350_000, 700_000), market: { markPrice: 93.5 } },
});
assert.equal(lowerBreakout.side, 'SHORT');
assert.equal(lowerEvent.depth.oppositeSide, 'ASK_ABOVE');
assert.equal(lowerEvent.depth.oppositeRatio, 2);
const lowerPayload = buildLiquidityBreakoutOppositeDepthDiscordPayload(lowerEvent, 'http://127.0.0.1:19082');
assert.equal(lowerPayload.embeds[0].color, 0x16c784);
assert.match(lowerPayload.embeds[0].title, /VƯỢT VÙNG DƯỚI.*ASK BÊN TRÊN LỚN HƠN/);
assert.match(lowerPayload.embeds[0].fields[2].value, /SHORT theo hướng breakdown/);

const directory = await mkdtemp(join(tmpdir(), 'local-ai-liq-breakout-depth-'));
const requests = [];
try {
  const executions = [];
  const notifier = new LocalAiLiquidityBreakoutOppositeDepthDiscordNotifier({
    stateFile: join(directory, 'state.json'),
    enabled: true,
    webhookUrl: 'https://discord.com/api/webhooks/123/token',
    baseUrl: 'http://127.0.0.1:19082',
    now: () => now,
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 204 };
    },
    onQualified: async (event) => {
      executions.push(event.eventId);
      return { status: 'submitted', orderId: 77, takeProfitPrice: 110, stopLossPrice: 95 };
    },
  });
  assert.equal((await notifier.arm(upperAlert)).armed, true);
  let analysisCalls = 0;
  const first = await notifier.scan({
    getRows: (_symbol, interval) => interval === '15m' ? upperBars15m : upperBars,
    getAnalysis: () => {
      analysisCalls += 1;
      return analysis('UPPERUSDT', 800_000, 500_000);
    },
  });
  assert.equal(first.detected, 2);
  assert.equal(first.qualified, 2);
  assert.equal(first.sent, 2);
  assert.equal(requests.length, 2);
  assert.equal(executions.length, 2);
  assert.match(requests[0].embeds[0].fields.find((field) => field.name.includes('BINANCE MARKET')).value,
    /ĐÃ GỬI LONG/);
  assert.equal(analysisCalls, 1, 'Coin Level analysis is shared by simultaneous 5m and 15m events');
  assert.equal(notifier.snapshot().tracked, 0);
  const deliveredManagement = await notifier.managementSnapshot();
  assert.equal(deliveredManagement.recent.length, 2);
  assert.equal(deliveredManagement.browserNotifications.length, 2);
  assert.equal(deliveredManagement.tracks.length, 0);
  assert.equal(deliveredManagement.lastScan.sent, 2);
  assert.equal(deliveredManagement.lastScan.analyzedSymbols, 1);

  await notifier.arm(upperAlert);
  const duplicate = await notifier.scan({
    getRows: (_symbol, interval) => interval === '15m' ? upperBars15m : upperBars,
    getAnalysis: () => analysis('UPPERUSDT', 800_000, 500_000),
  });
  assert.equal(duplicate.sent, 0, 'same symbol/direction stays deduped during cooldown');
  assert.equal(requests.length, 2);
  assert.equal(executions.length, 2, 'Discord cooldown must also prevent a duplicate Binance callback');

  const batchRequests = [];
  const batchExecutions = [];
  let batchAnalysisCalls = 0;
  let activeAnalyses = 0;
  let peakActiveAnalyses = 0;
  const batchNotifier = new LocalAiLiquidityBreakoutOppositeDepthDiscordNotifier({
    stateFile: join(directory, 'batch-state.json'),
    enabled: true,
    webhookUrl: 'https://discord.com/api/webhooks/123/token',
    baseUrl: 'http://127.0.0.1:19082',
    now: () => now,
    maxPerScan: 1,
    analysisBatchSize: 2,
    fetchImpl: async (_url, init) => {
      batchRequests.push(JSON.parse(init.body));
      return { ok: true, status: 204 };
    },
    onQualified: async (event) => {
      batchExecutions.push(event.symbol);
      return { status: 'submitted', orderId: batchExecutions.length };
    },
  });
  for (let index = 0; index < 6; index += 1) {
    await batchNotifier.arm(alert(`BATCH${index}USDT`, 'ABOVE', 104, 105));
  }
  const scanBatch = () => batchNotifier.scan({
    getRows: (_symbol, interval) => interval === '5m' ? upperBars : [],
    getAnalysis: async (symbol) => {
      batchAnalysisCalls += 1;
      activeAnalyses += 1;
      peakActiveAnalyses = Math.max(peakActiveAnalyses, activeAnalyses);
      await new Promise((resolve) => setImmediate(resolve));
      activeAnalyses -= 1;
      const index = Number(symbol.match(/BATCH(\d+)/)?.[1]);
      return index >= 4
        ? analysis(symbol, index === 5 ? 1_500_000 : 900_000, 500_000)
        : analysis(symbol, 400_000, 500_000);
    },
  });
  const batchFirst = await scanBatch();
  assert.equal(batchFirst.detected, 6);
  assert.equal(batchFirst.analyzedSymbols, 6, 'all detected symbols are analyzed, not only the first limit');
  assert.equal(batchFirst.qualified, 2);
  assert.equal(batchFirst.selected, 1);
  assert.equal(batchFirst.deferredQualified, 1);
  assert.deepEqual(batchExecutions, ['BATCH5USDT'], 'strongest opposite-depth ratio is selected first');
  assert(peakActiveAnalyses <= 2, 'analysis concurrency stays within the configured batch size');
  const batchSecond = await scanBatch();
  assert.equal(batchSecond.sent, 1);
  assert.deepEqual(batchExecutions, ['BATCH5USDT', 'BATCH4USDT'],
    'qualified overflow remains pending and is delivered on the next scan');
  assert(batchAnalysisCalls >= 11, 'later scans continue assessing every still-pending breakout');
  assert.equal(batchRequests.length, 2);
  assert.equal(batchNotifier.snapshot().analysisBatchSize, 2);
  assert.equal(batchNotifier.snapshot().maxDeliveriesPerScan, 1);
  const batchManagement = await batchNotifier.managementSnapshot();
  assert.equal(batchManagement.lastScan.deferredQualified, 0);
  assert.equal(batchManagement.pending15m, 6);
  assert.equal(batchManagement.tracks.length, 6);

  const toastWithoutDiscord = new LocalAiLiquidityBreakoutOppositeDepthDiscordNotifier({
    stateFile: join(directory, 'toast-without-discord-state.json'),
    enabled: true,
    webhookUrl: 'https://discord.com/api/webhooks/123/token',
    now: () => now,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await toastWithoutDiscord.arm(lowerAlert);
  const failedDiscord = await toastWithoutDiscord.scan({
    getRows: (_symbol, interval) => interval === '5m' ? lowerBars : [],
    getAnalysis: () => analysis('LOWERUSDT', 350_000, 700_000),
  });
  assert.equal(failedDiscord.sent, 0);
  const toastManagement = await toastWithoutDiscord.managementSnapshot();
  assert.equal(toastManagement.recent.length, 0, 'Discord recent remains delivery-only');
  assert.equal(toastManagement.browserNotifications.length, 1,
    'qualified browser toast is retained even if Discord delivery fails');
  assert.equal(toastManagement.browserNotifications[0].discordDelivery.error, 'HTTP_503');

  const disabled = new LocalAiLiquidityBreakoutOppositeDepthDiscordNotifier({
    stateFile: join(directory, 'disabled.json'),
    enabled: false,
    webhookUrl: 'https://discord.com/api/webhooks/123/token',
    now: () => now,
    fetchImpl: async () => { throw new Error('disabled notifier must not post'); },
  });
  assert.deepEqual(await disabled.arm(upperAlert), { armed: false, reason: 'DISABLED' });
  assert.equal((await disabled.scan({ getRows: () => upperBars })).sent, 0);

  const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
  const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(server, /LocalAiLiquidityBreakoutOppositeDepthDiscordNotifier/);
  assert.match(server, /localAiLiquidityBreakoutOppositeDepthDiscord\.arm\(alert\)/);
  assert.match(server, /localAiLiquidityBreakoutOppositeDepthDiscord\.scan/);
  assert.match(server, /getRows: \(symbol, interval\) => klineCache\.getIfCached\(symbol, interval, 160\)/);
  assert.match(envExample, /LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_WEBHOOK_URL=/);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('local AI liquidity breakout + opposite depth Discord tests: OK');
