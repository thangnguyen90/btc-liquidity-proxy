import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');

assert.doesNotMatch(
  serverSource,
  /autoBtcLongEntryGuard|evaluateAutoBtcLongEntryGuard|guardBinanceClientAutoLongEntries/,
  'the chat-added global BTC LONG guard must stay removed',
);
assert.doesNotMatch(
  serverSource,
  /AUTO_LONG_BLOCKED_BTC_MARKET_REGIME/,
  'placeOrder must not globally reject LONG from the market-regime snapshot',
);
assert.match(
  serverSource,
  /autoEntryControls\.assertEntry\(payload,entryControl\.manual\)/,
  'master switch and exact route controls must remain active',
);
assert.match(
  serverSource,
  /evaluateAutoBinanceEntryPolicy\(\{/,
  'private route authorization must remain active',
);
assert.match(
  serverSource,
  /autoEntryControls\.guardClient\(client\)/,
  'signed client must remain protected by Auto Controls',
);
assert.match(
  serverSource,
  /coinLevelMarketRegimeGuard\.snapshot\(\)/,
  'market regime must remain available to strategies that explicitly use it',
);

console.log('global BTC LONG guard removal regression tests passed');
