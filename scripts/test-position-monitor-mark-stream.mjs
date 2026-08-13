import assert from 'node:assert/strict';
import {
  POSITION_MONITOR_MARK_STREAM_VERSION,
  POSITION_MONITOR_MARK_STREAM_STALE_MS,
  POSITION_MONITOR_MARK_STREAM_URL,
  POSITION_PROTECTION_TRIGGER_VERSION,
  buildPositionMarkPriceStreamUrl,
  isBinanceSocketFullEntryFill,
  isBinanceTradeLiteExecution,
  parsePositionMarkPriceMessage,
  resolvePositionRoeMargin,
} from '../src/positionMonitor.js';

assert.equal(
  POSITION_MONITOR_MARK_STREAM_VERSION,
  'POSITION_MONITOR_PER_SYMBOL_MARK_STREAM_V4_20260812',
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
  'POSITION_PROTECTION_SOCKET_FILL_V3_DURABLE_WATERMARK_20260812',
);
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

console.log('Position monitor mark stream tests passed');
