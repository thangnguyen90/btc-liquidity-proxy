import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoinGlassWebTop20Manager } from '../src/coinglassWebTop20.js';
import {
  COINGLASS_ZONE_LIFECYCLE_VERSION,
  advanceCoinglassZoneLifecycle,
  buildCoinglassZoneLifecycleDiscordPayload,
  coinglassActiveEdgeZones,
} from '../src/coinglassZoneLifecycle.js';
import {
  COINGLASS_ZONE_LIFECYCLE_BINANCE_VERSION,
  evaluateCoinglassZoneLifecycleBinanceEntry,
} from '../src/coinglassZoneLifecycleBinance.js';
import {
  COINGLASS_ZONE_LIFECYCLE_TP_ONLY_VERSION,
  resolveNonLiquidFlowV2TakeProfit,
  shouldSuppressCoinglassZoneLifecycleStopLoss,
} from '../src/shortTakeProfitPolicy.js';

function zone({ price, low, high, strength, side, lastX = 10, persistenceBars = 8 }) {
  return {
    price,
    bandLow: low,
    bandHigh: high,
    strength,
    side,
    lastX,
    persistenceBars,
  };
}

function row({ price, open = price, high = price, low = price, close = price, zones }) {
  return {
    symbol: 'TESTUSDT',
    status: 'OK',
    stale: false,
    lastPrice: price,
    heatmap: {
      currentPrice: price,
      lastHeatmapX: 10,
      latestCandle: { open, high, low, close, openTime: 123 },
      edgeZones: zones,
    },
  };
}

const upper = zone({ price: 105, low: 104, high: 106, strength: 100, side: 'ABOVE' });
const upperNext = zone({ price: 113, low: 112, high: 114, strength: 70, side: 'ABOVE' });
const lower = zone({ price: 95, low: 94, high: 96, strength: 85, side: 'BELOW' });
const historical = zone({ price: 90, low: 89, high: 91, strength: 100, side: 'BELOW', lastX: 4 });

const active = coinglassActiveEdgeZones(row({ price: 100, zones: [upper, lower, historical] }));
assert.deepEqual(active.map((item) => item.midpoint).sort((a, b) => a - b), [95, 105]);
assert.equal(active.some((item) => item.midpoint === 90), false, 'historical zone must not reach lifecycle');

const first = advanceCoinglassZoneLifecycle({
  rows: [row({ price: 100, zones: [upper, upperNext, lower] })],
  now: 1_000,
});
assert.equal(first.state.version, COINGLASS_ZONE_LIFECYCLE_VERSION);
assert.equal(first.state.tracks['TESTUSDT:ABOVE'].state, 'FRESH');
assert.equal(first.events.length, 0);

const approaching = advanceCoinglassZoneLifecycle({
  previous: first.state,
  rows: [row({ price: 102, open: 101, high: 103, low: 100, close: 102, zones: [upper, upperNext, lower] })],
  now: 2_000,
});
assert.equal(approaching.state.tracks['TESTUSDT:ABOVE'].state, 'APPROACHING');
assert.equal(approaching.events.some((event) => event.state === 'APPROACHING'), true);
assert.equal(approaching.events.find((event) => event.state === 'APPROACHING').shouldEnter, false);

const rejected = advanceCoinglassZoneLifecycle({
  previous: approaching.state,
  rows: [row({ price: 103, open: 102, high: 105, low: 101, close: 103, zones: [upper, upperNext, lower] })],
  now: 3_000,
});
const rejectedEvent = rejected.events.find((event) => event.zoneSide === 'ABOVE' && event.state === 'REJECTED');
assert.ok(rejectedEvent);
assert.equal(rejectedEvent.shouldEnter, true);
assert.equal(rejectedEvent.entryPlan.side, 'SHORT');
assert.equal(rejectedEvent.entryPlan.takeProfitPrice, 96);
assert.equal(rejectedEvent.entryPlan.stopLossPrice, null);
assert.equal(rejectedEvent.entryPlan.stopLossPolicy, 'COINGLASS_ZONE_LIFECYCLE_TP_ONLY_NO_SL');
assert.equal(rejectedEvent.entryPlan.marginUsdt, 5);

const shortEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: rejectedEvent,
  currentPrice: 102.8,
  positions: [],
  openOrders: [],
});
assert.equal(shortEntry.version, COINGLASS_ZONE_LIFECYCLE_BINANCE_VERSION);
assert.equal(shortEntry.decision, 'ENTER_MARKET');
assert.equal(shortEntry.stopLoss, null);
assert.equal(evaluateCoinglassZoneLifecycleBinanceEntry({
  event: rejectedEvent,
  currentPrice: 104.2,
  positions: [],
}).decision, 'BLOCKED_STATE_NO_LONGER_VALID');
assert.equal(evaluateCoinglassZoneLifecycleBinanceEntry({
  event: rejectedEvent,
  currentPrice: 102.8,
  positions: [{ symbol: 'TESTUSDT', positionAmt: '1' }],
}).decision, 'BLOCKED_EXISTING_POSITION');

const accepted = advanceCoinglassZoneLifecycle({
  previous: approaching.state,
  rows: [row({ price: 107, open: 103, high: 108, low: 102, close: 107, zones: [upper, upperNext, lower] })],
  now: 4_000,
});
const acceptedEvent = accepted.events.find((event) => event.zoneSide === 'ABOVE' && event.state === 'ACCEPTED');
assert.ok(acceptedEvent, 'crossed ABOVE zone must remain on original track and become ACCEPTED');
assert.equal(acceptedEvent.shouldEnter, true);
assert.equal(acceptedEvent.entryPlan.side, 'LONG');
assert.equal(acceptedEvent.entryPlan.takeProfitPrice, 112);
assert.equal(acceptedEvent.entryPlan.stopLossPrice, null);
assert.equal(acceptedEvent.entryPlan.stopLossRoePct, null);
assert.equal(acceptedEvent.entryPlan.stopLossPolicy, 'COINGLASS_ZONE_LIFECYCLE_TP_ONLY_NO_SL');
const acceptedEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: acceptedEvent,
  currentPrice: 107.2,
  positions: [],
  openOrders: [],
});
assert.equal(acceptedEntry.decision, 'ENTER_MARKET');
assert.equal(acceptedEntry.stopLoss, null);
assert.equal(acceptedEntry.stopLossRoePct, null);

const payload = buildCoinglassZoneLifecycleDiscordPayload({
  event: rejectedEvent,
  execution: { decision: 'SUBMITTED', orderId: 123 },
  pageUrl: 'http://localhost/coinglass-web-top20',
});
assert.equal(payload.embeds[0].color, 0xef4444);
assert.match(payload.embeds[0].title, /SHORT.*REJECTED/);
assert.match(payload.embeds[0].description, /\$5 x5/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /KHÔNG ĐẶT/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('BINANCE')).value, /SUBMITTED/);

const longPayload = buildCoinglassZoneLifecycleDiscordPayload({ event: acceptedEvent });
assert.match(longPayload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /Zone Lifecycle chạy TP-only/);
assert.equal(shouldSuppressCoinglassZoneLifecycleStopLoss({
  source: 'coinglass-zone-lifecycle',
}), true, COINGLASS_ZONE_LIFECYCLE_TP_ONLY_VERSION);
assert.equal(shouldSuppressCoinglassZoneLifecycleStopLoss({
  source: 'coinglass-web-qualified',
}), false, 'other CoinGlass routes must keep their own SL policy');

const preservedTarget = resolveNonLiquidFlowV2TakeProfit({
  side: 'SHORT',
  source: 'coinglass-zone-lifecycle',
  entryPrice: 100,
  leverage: 5,
  requestedTakeProfitPrice: 96,
});
assert.equal(preservedTarget.applied, false);
assert.equal(preservedTarget.takeProfitPrice, 96);

const managerDir = await mkdtemp(join(tmpdir(), 'coinglass-zone-lifecycle-'));
let executionCalls = 0;
const manager = new CoinGlassWebTop20Manager({
  rootDir: new URL('..', import.meta.url).pathname,
  dataDir: managerDir,
  onZoneLifecycleSignal: async () => {
    executionCalls += 1;
    return { decision: 'SUBMITTED', orderId: 456 };
  },
});
const originalWebhook = process.env.COINGLASS_ZONE_LIFECYCLE_DISCORD_WEBHOOK_URL;
const originalBinance = process.env.COINGLASS_ZONE_LIFECYCLE_BINANCE_ENABLED;
process.env.COINGLASS_ZONE_LIFECYCLE_DISCORD_WEBHOOK_URL = 'https://unit.test/zone-lifecycle';
process.env.COINGLASS_ZONE_LIFECYCLE_BINANCE_ENABLED = 'true';
const sent = [];
manager.postZoneLifecycleDiscord = async (message) => {
  sent.push(message);
  return { sent: true };
};
assert.equal((await manager.processZoneLifecycleRows([
  row({ price: 100, zones: [upper, upperNext, lower] }),
])).events, 0);
assert.equal((await manager.processZoneLifecycleRows([
  row({ price: 102, open: 101, high: 103, low: 100, close: 102, zones: [upper, upperNext, lower] }),
])).sent, 1);
const terminalResult = await manager.processZoneLifecycleRows([
  row({ price: 103, open: 102, high: 105, low: 101, close: 103, zones: [upper, upperNext, lower] }),
]);
assert.equal(terminalResult.submitted, 1);
assert.equal(executionCalls, 1);
assert.equal(sent.length, 2);
assert.equal(manager.config().zoneLifecycleMarginUsdt, 5);
if (originalWebhook == null) delete process.env.COINGLASS_ZONE_LIFECYCLE_DISCORD_WEBHOOK_URL;
else process.env.COINGLASS_ZONE_LIFECYCLE_DISCORD_WEBHOOK_URL = originalWebhook;
if (originalBinance == null) delete process.env.COINGLASS_ZONE_LIFECYCLE_BINANCE_ENABLED;
else process.env.COINGLASS_ZONE_LIFECYCLE_BINANCE_ENABLED = originalBinance;
await rm(managerDir, { recursive: true, force: true });

console.log('CoinGlass zone lifecycle tests passed.');
