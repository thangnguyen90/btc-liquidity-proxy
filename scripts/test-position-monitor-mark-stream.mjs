import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  POSITION_MONITOR_MARK_STREAM_VERSION,
  POSITION_MONITOR_MARK_STREAM_STALE_MS,
  POSITION_MONITOR_MARK_STREAM_URL,
  POSITION_PROTECTION_TRIGGER_VERSION,
  POSITION_USER_DATA_STREAM_VERSION,
  buildPositionMarkPriceStreamUrl,
  isBinanceListenKeyExpiredEvent,
  isBinanceListenKeyInvalidError,
  isBinanceSocketFullEntryFill,
  isBinanceTradeLiteExecution,
  parsePositionMarkPriceMessage,
  resolvePositionRoeMargin,
  waitForMatchingFullFillPosition,
} from '../src/positionMonitor.js';

assert.equal(
  POSITION_MONITOR_MARK_STREAM_VERSION,
  'POSITION_MONITOR_PER_SYMBOL_MARK_STREAM_V5_PRICE_ROE_20260831',
);
assert.equal(POSITION_MONITOR_MARK_STREAM_URL, 'wss://fstream.binance.com/market/stream');
assert.equal(POSITION_MONITOR_MARK_STREAM_STALE_MS, 15_000);
assert.equal(buildPositionMarkPriceStreamUrl([]), null);
assert.equal(
  buildPositionMarkPriceStreamUrl(['HOLOUSDT', 'BTCUSDT', 'holousdt']),
  'wss://fstream.binance.com/market/stream?streams=btcusdt@markPrice@1s/holousdt@markPrice@1s',
);
assert.equal(
  POSITION_PROTECTION_TRIGGER_VERSION,
  'POSITION_PROTECTION_SOCKET_FILL_V5_POSITION_VISIBILITY_RETRY_20260923',
);
let positionSyncs = 0;
const delayedPosition = await waitForMatchingFullFillPosition({
  symbol: 'AAVEUSDT',
  side: 'BUY',
  sync: async () => { positionSyncs += 1; },
  getPosition: () => positionSyncs < 3 ? null : { amt: 2, entry: 149.98, leverage: 10 },
  delaysMs: [0, 1, 1],
  sleep: async () => {},
});
assert.equal(positionSyncs, 3);
assert.equal(delayedPosition.entry, 149.98);
assert.equal(await waitForMatchingFullFillPosition({
  symbol: 'AAVEUSDT',
  side: 'BUY',
  sync: async () => {},
  getPosition: () => ({ amt: -2 }),
  delaysMs: [0, 1],
  sleep: async () => {},
}), null);
assert.equal(POSITION_USER_DATA_STREAM_VERSION, 'POSITION_USER_DATA_STREAM_V2_LISTEN_KEY_RECOVERY_20260816');
assert.equal(isBinanceListenKeyExpiredEvent({ e: 'listenKeyExpired' }), true);
assert.equal(isBinanceListenKeyExpiredEvent({ e: 'ORDER_TRADE_UPDATE' }), false);
assert.equal(isBinanceListenKeyInvalidError(new Error('This listenKey does not exist.')), true);
assert.equal(isBinanceListenKeyInvalidError(new Error('-1125: This listen key does not exist.')), true);
assert.equal(isBinanceListenKeyInvalidError(new Error('fetch failed')), false);
assert.equal(isBinanceSocketFullEntryFill({ x: 'TRADE', X: 'FILLED', l: '2', R: false }), true);
assert.equal(isBinanceSocketFullEntryFill({ x: 'TRADE', X: 'PARTIALLY_FILLED', l: '1', R: false }), false);
assert.equal(isBinanceSocketFullEntryFill({ x: 'TRADE', X: 'FILLED', l: '2', R: true }), false);
assert.equal(isBinanceSocketFullEntryFill({ x: 'NEW', X: 'NEW', l: '0', R: false }), false);
assert.equal(isBinanceTradeLiteExecution({ e: 'TRADE_LITE', s: '1000SATSUSDT', i: 123, l: '10' }), true);
assert.equal(isBinanceTradeLiteExecution({ e: 'TRADE_LITE', s: '1000SATSUSDT', i: 123, l: '0' }), false);
assert.equal(isBinanceTradeLiteExecution({ e: 'ORDER_TRADE_UPDATE', s: '1000SATSUSDT', i: 123, l: '10' }), false);
assert.deepEqual(parsePositionMarkPriceMessage({
  e: 'markPriceUpdate', s: 'CYSUSDT', p: '1.2762',
}), { symbol: 'CYSUSDT', markPrice: 1.2762 });
assert.deepEqual(parsePositionMarkPriceMessage({
  stream: 'cysusdt@markPrice@1s',
  data: { e: 'markPriceUpdate', s: 'CYSUSDT', p: '1.2762' },
}), { symbol: 'CYSUSDT', markPrice: 1.2762 });
assert.equal(parsePositionMarkPriceMessage({ result: null, id: 1 }), null);
assert.equal(parsePositionMarkPriceMessage({ e: 'bookTicker', s: 'CYSUSDT', p: '1.2762' }), null);
assert.equal(parsePositionMarkPriceMessage({ e: 'markPriceUpdate', s: 'CYSUSDT', p: '0' }), null);
assert.equal(resolvePositionRoeMargin({
  positionInitialMargin: '14.94', isolatedMargin: '25.46', positionAmt: '62', entryPrice: '1.2042', leverage: '5',
}), 14.94);
assert.equal(resolvePositionRoeMargin({
  initialMargin: '0', isolatedMargin: '25.46', positionAmt: '62', entryPrice: '1.2042', leverage: '5',
}), 25.46);
assert.equal(resolvePositionRoeMargin({ positionAmt: '62', entryPrice: '1.2042', leverage: '5' }), 14.93208);

const monitorSource = await readFile(new URL('../src/positionMonitor.js', import.meta.url), 'utf8');
assert.match(monitorSource, /binancePositionPriceRoe/);
assert.doesNotMatch(monitorSource, /const roe = \(upnl \/ margin\) \* 100/);
assert.match(monitorSource, /scheduleUserDataReconnect\(0, 'listen-key-expired'\)/);
assert.match(monitorSource, /scheduleUserDataReconnect\(0, 'keepalive-listen-key-invalid'\)/);
assert.match(monitorSource, /onUserDataReconnect\(\{/);
assert.match(monitorSource, /scheduleFullFillRetry\(symbol, fill, error\)/);
assert.match(monitorSource, /clearFullFillRetry\(key\)/);
assert.match(monitorSource, /restVerifiedAt: Date\.now\(\)/);
assert.match(monitorSource, /restVerifiedAt\) >= fillObservedAt/);
assert.match(monitorSource, /syncPositions\(\{ forceFresh: true \}\)/);
assert.doesNotMatch(monitorSource, /SOCKET_FULL_FILL_IGNORED/);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /onUserDataReconnect: async \(\{ reason, reconnected \}\)/);
assert.match(serverSource, /runMissedFillProtectionRecovery\(`USER_DATA_RECONNECT:\$\{reason\}`\)/);
assert.match(serverSource, /missedFillProtectionRecoveryRunning/);
assert.match(serverSource, /MISSED_FILL_RECONNECT_RECOVERY/);
assert.match(serverSource, /fallbackLongSlExpected[\s\S]*const expectsSl = Number\(protectionPlan\?\.slPrice\) > 0 \|\| fallbackLongSlExpected/);
assert.match(serverSource, /if \(protectionPlan\) protectionPlan\.appliedAt = null/);
assert.match(serverSource, /slTracking\.positions\[symbol\]\.slPlaced = false/);

console.log('Position monitor mark stream tests passed');
