import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COIN_LEVEL_OBSERVE_LIVE_STATUS_VERSION,
  buildCoinLevelObserveLiveStatus,
} from '../src/coinLevelObserveLiveStatus.js';

const btw = buildCoinLevelObserveLiveStatus({
  watch: {
    side: 'LONG',
    priceAtWatch: 0.84,
    invalidationPrice: 0.8245335,
  },
  closedCandleActive: true,
  liveQuote: { price: 0.7935, at: 1_790_055_400_000, source: 'MARK_SOCKET_1S' },
});
assert.equal(btw.liveStatusVersion, COIN_LEVEL_OBSERVE_LIVE_STATUS_VERSION);
assert.equal(btw.liveState, 'INVALIDATED');
assert.equal(btw.liveInvalidated, true);
assert.equal(btw.liveNow, false, 'live mark below LONG invalidation must override stale closed-candle active state');
assert.ok(btw.liveMovePct < -5);

const activeLong = buildCoinLevelObserveLiveStatus({
  watch: { side: 'LONG', priceAtWatch: 0.84, invalidationPrice: 0.8245 },
  closedCandleActive: true,
  liveQuote: { price: 0.842, at: 2, source: 'MARK_SOCKET_1S' },
});
assert.equal(activeLong.liveState, 'ACTIVE');
assert.equal(activeLong.liveNow, true);

const invalidShort = buildCoinLevelObserveLiveStatus({
  watch: { side: 'SHORT', priceAtWatch: 1, invalidationPrice: 1.03 },
  closedCandleActive: true,
  liveQuote: { price: 1.04, at: 3, source: 'MARK_SOCKET_1S' },
});
assert.equal(invalidShort.liveState, 'INVALIDATED');
assert.equal(invalidShort.liveNow, false);

const unavailable = buildCoinLevelObserveLiveStatus({
  watch: { side: 'LONG', priceAtWatch: 1, invalidationPrice: 0.95 },
  closedCandleActive: true,
});
assert.equal(unavailable.liveState, 'ACTIVE_PRICE_UNAVAILABLE');
assert.equal(unavailable.liveNow, true, 'missing socket quote must preserve closed-candle state');

const [server, client, html] = await Promise.all([
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.html', import.meta.url), 'utf8'),
]);
assert.match(server, /buildCoinLevelObserveLiveStatus/);
assert.match(server, /MARK_SOCKET_1S/);
assert.match(server, /KLINE_5M_SOCKET/);
assert.match(client, /GIÁ LIVE ĐÃ VÔ HIỆU/);
assert.match(client, /Live \$\{price\(livePrice\)\}/);
assert.match(html, /Close 5m \/ giá live/);

console.log('Coin Level observe watch live-price invalidation overlay: OK');
