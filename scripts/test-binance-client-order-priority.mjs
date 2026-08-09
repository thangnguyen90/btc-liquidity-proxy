import assert from 'node:assert/strict';
import { BinanceClient } from '../src/binanceClient.js';

const scheduled = [];
const gate = {
  schedule(meta, run) {
    scheduled.push(meta);
    return run();
  },
  reportAuthSuccess() {},
  reportAuthFailure() {},
  reportRateLimit() {},
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const path = new URL(url).pathname;
  if (path === '/fapi/v2/positionRisk' || path === '/fapi/v1/openOrders') {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/fapi/v1/premiumIndex') {
    return new Response('{"markPrice":"100"}', { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unexpected test URL: ${url}`);
};

try {
  const client = new BinanceClient({ baseUrl: 'https://fapi.binance.test', rateGate: gate });
  const urgent = {
    priority: 1,
    dropOnCongestion: false,
    dedupeKey: 'live-card-test-key',
    source: 'live-card-test',
  };
  await client.getPositions({ apiKey: 'key', apiSecret: 'secret', ...urgent });
  await client.getOpenOrders({ symbol: 'BTCUSDT', apiKey: 'key', apiSecret: 'secret', ...urgent });
  await client.getPremiumIndex('BTCUSDT', urgent);

  assert.equal(scheduled.length, 3);
  for (const meta of scheduled) {
    assert.equal(meta.priority, 1);
    assert.equal(meta.dropOnCongestion, false);
    assert.match(meta.dedupeKey, /custom:live-card-test-key$/);
    assert.equal(meta.source, 'live-card-test');
  }
  assert.equal(scheduled[0].weight, 5, 'position preflight weight stays 5');
  assert.equal(scheduled[1].weight, 1, 'symbol-scoped openOrders must use weight 1, not global weight 40');
  assert.equal(scheduled[2].weight, 1, 'symbol premiumIndex must use weight 1');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Binance live-card priority tests passed');
