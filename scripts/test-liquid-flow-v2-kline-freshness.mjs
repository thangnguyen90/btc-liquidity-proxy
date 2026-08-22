import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  KLINE_CACHE_MANAGED_LIVE_GROUP_VERSION,
  KlineCache,
} from '../src/klineCache.js';
import {
  LIQUID_FLOW_V2_KLINE_FRESHNESS_VERSION,
  evaluateLiquidFlowV2KlineFreshness,
  liquidFlowV2StaleWaitClassification,
  suppressLiquidFlowV2RecoveredSignal,
} from '../src/liquidFlowV2Freshness.js';

function kline(openTime, closeTime, close = 1) {
  return { openTime, closeTime, open: close, high: close, low: close, close, quoteVolume: 1 };
}

const now = 2_000_000_000;
const staleRows = Array.from({ length: 3 }, (_, index) => kline(
  now - (40 - index * 5) * 60_000,
  now - (35 - index * 5) * 60_000,
));
const freshRows = Array.from({ length: 3 }, (_, index) => kline(
  now - (15 - index * 5) * 60_000,
  now - (10 - index * 5) * 60_000,
));

let restCalls = 0;
const cache = new KlineCache({
  now: () => now,
  client: {
    async getKlines() {
      restCalls += 1;
      return freshRows;
    },
  },
});
cache._subscribe = () => {};
cache._cache.set(cache._key('BTCUSDT', '5m'), staleRows);

assert.deepEqual(cache.needsRefresh(['BTCUSDT'], '5m', 3, 12 * 60_000), ['BTCUSDT']);
await cache.seed(['BTCUSDT'], '5m', 3, { maxAgeMs: 12 * 60_000 });
assert.equal(restCalls, 1, 'a full-length but stale cache must be refreshed through REST');
assert.deepEqual(cache.needsRefresh(['BTCUSDT'], '5m', 3, 12 * 60_000), []);
await cache.seed(['BTCUSDT'], '5m', 3, { maxAgeMs: 12 * 60_000 });
assert.equal(restCalls, 1, 'fresh cache must not generate repeated REST traffic');

const freshAll = evaluateLiquidFlowV2KlineFreshness({
  now,
  klinesByInterval: {
    '5m': [kline(now - 10 * 60_000, now - 5 * 60_000)],
    '15m': [kline(now - 30 * 60_000, now - 15 * 60_000)],
    '1h': [kline(now - 90 * 60_000, now - 30 * 60_000)],
    '4h': [kline(now - 6 * 60 * 60_000, now - 2 * 60 * 60_000)],
  },
});
assert.equal(freshAll.fresh, true);
assert.equal(freshAll.version, LIQUID_FLOW_V2_KLINE_FRESHNESS_VERSION);

const stale5m = evaluateLiquidFlowV2KlineFreshness({
  now,
  klinesByInterval: {
    '5m': [kline(now - 40 * 60_000, now - 35 * 60_000)],
    '15m': [kline(now - 30 * 60_000, now - 15 * 60_000)],
    '1h': [kline(now - 90 * 60_000, now - 30 * 60_000)],
    '4h': [kline(now - 6 * 60 * 60_000, now - 2 * 60 * 60_000)],
  },
});
assert.equal(stale5m.fresh, false);
assert.deepEqual(stale5m.staleIntervals, ['5m']);
const wait = liquidFlowV2StaleWaitClassification(stale5m);
assert.equal(wait.labelKey, 'WAIT');
assert.equal(wait.phase, 'WAIT');
assert.equal(wait.dataStale, true);
assert.equal(wait.warmingUp, true);
assert.equal(suppressLiquidFlowV2RecoveredSignal({
  recoveringFromStale: true,
  signalCandleClosedAt: now - 16 * 60_000,
  now,
}), true, 'old READY episodes must not replay after stale recovery');
assert.equal(suppressLiquidFlowV2RecoveredSignal({
  recoveringFromStale: true,
  signalCandleClosedAt: now - 5 * 60_000,
  now,
}), false, 'a genuinely fresh READY candle may fire after recovery');

class FakeSocket extends EventEmitter {
  static urls = [];

  constructor(url) {
    super();
    this.url = url;
    this.readyState = 1;
    FakeSocket.urls.push(url);
  }

  ping() {}
  terminate() {
    this.terminated = true;
    this.emit('close');
  }
}

const socketCache = new KlineCache({
  now: () => now,
  client: {},
  WebSocketImpl: FakeSocket,
});
socketCache.subscribe(['BTCUSDT'], '5m');
const streamUrl = FakeSocket.urls[0];
assert.match(
  streamUrl,
  /^wss:\/\/fstream\.binance\.com\/market\/stream\?streams=btcusdt@kline_5m$/,
  'kline cache must use the working Binance futures market-stream endpoint',
);
const entry = socketCache._conns.get(streamUrl);
entry.ws.emit('open');
const timerBeforePong = entry.staleTimer;
entry.ws.emit('pong');
assert.equal(entry.staleTimer, timerBeforePong, 'pong must not reset the market-data stale timer');
assert.equal(socketCache.stats('5m').lastTickAt, null);
entry.ws.emit('message', JSON.stringify({
  data: {
    k: {
      s: 'BTCUSDT', i: '5m', t: now - 5 * 60_000, T: now, o: '1', h: '1', l: '1', c: '1',
      v: '1', q: '1', n: 1, V: '0.5', Q: '0.5', x: false,
    },
  },
}));
assert.equal(socketCache.stats('5m').lastTickAt, now);
assert.equal(socketCache.stats('15m').lastTickAt, null, 'stream health is tracked per interval');

const managed = socketCache.subscribeGroup('liquid-v2', ['ETHUSDT', 'BTCUSDT'], '5m');
assert.equal(managed.version, KLINE_CACHE_MANAGED_LIVE_GROUP_VERSION);
assert.equal(managed.symbols, 2);
assert.equal(managed.connections, 1);
assert.equal(managed.changed, true);
const managedKey = 'managed:liquid-v2|5m:0';
const managedEntry = socketCache._conns.get(managedKey);
assert.ok(managedEntry, 'managed group must own a dedicated connection key');
assert.match(managedEntry.url, /btcusdt@kline_5m\/ethusdt@kline_5m$/);
managedEntry.ws.emit('open');
managedEntry.ws.emit('message', JSON.stringify({
  data: {
    k: {
      s: 'BTCUSDT', i: '5m', t: now, T: now + 5 * 60_000, o: '1', h: '1.1', l: '1', c: '1.05',
      v: '2', q: '2.1', n: 2, V: '1.2', Q: '1.25', x: false,
    },
  },
}));
assert.deepEqual(socketCache.liveCoverage(['BTCUSDT', 'ETHUSDT'], '5m'), {
  version: KLINE_CACHE_MANAGED_LIVE_GROUP_VERSION,
  interval: '5m',
  evaluatedAt: now,
  total: 2,
  live: 1,
  missing: 1,
  coveragePct: 50,
  ticked: 1,
  newestTickAt: now,
  newestTickAgeMs: 0,
  missingSymbols: ['ETHUSDT'],
});
const urlCountBeforeRepeat = FakeSocket.urls.length;
assert.equal(
  socketCache.subscribeGroup('liquid-v2', ['BTCUSDT', 'ETHUSDT'], '5m').changed,
  false,
  'same managed universe must not reconnect',
);
assert.equal(FakeSocket.urls.length, urlCountBeforeRepeat);
const oldManagedSocket = managedEntry.ws;
assert.equal(socketCache.subscribeGroup('liquid-v2', ['BTCUSDT'], '5m').changed, true);
assert.equal(oldManagedSocket.terminated, true, 'universe replacement must stop the old managed socket');
assert.notEqual(socketCache._conns.get(managedKey)?.ws, oldManagedSocket);

socketCache._clearTimers(entry);
entry.ws.removeAllListeners();
socketCache._disconnect(managedKey);

console.log('Liquid Flow V2 kline freshness tests passed.');
