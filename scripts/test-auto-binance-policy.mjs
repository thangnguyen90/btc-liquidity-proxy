import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AUTO_BINANCE_ENTRY_POLICY_VERSION,
  authorizeLiveCardAutoOrder,
  evaluateAutoBinanceEntryPolicy,
  liveCardOnlyAutoBinanceEnabled,
} from '../src/autoBinancePolicy.js';

const exclusiveEnv = {};
assert.equal(AUTO_BINANCE_ENTRY_POLICY_VERSION, 'LIVE_CARD_ONLY_V1_20260803');
assert.equal(liveCardOnlyAutoBinanceEnabled(exclusiveEnv), true);
assert.equal(liveCardOnlyAutoBinanceEnabled({ LIVE_CARD_WHITELIST_ONLY_AUTO_BINANCE: 'false' }), false);

const realLegacyPayload = { symbol: 'BTCUSDT', dryRun: false, source: 'auto-trader' };
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: realLegacyPayload,
  orderEnabled: true,
  env: exclusiveEnv,
}).allowed, false);

assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...realLegacyPayload, liveCardAuthorization: true },
  orderEnabled: true,
  env: exclusiveEnv,
}).allowed, false, 'A forgeable string property must not authorize an automatic order.');
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...realLegacyPayload, source: 'live-card-whitelist-edge' },
  orderEnabled: true,
  env: exclusiveEnv,
}).allowed, false, 'A forged live-card source string must not authorize an automatic order.');

const checkedCardPayload = authorizeLiveCardAutoOrder({
  symbol: 'BTCUSDT',
  dryRun: false,
  source: 'live-card-whitelist-liquid',
});
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: checkedCardPayload,
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'CHECKED_LIVE_CARD');

assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: realLegacyPayload,
  tokenIsAuthorized: true,
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'MANUAL_ORDERS_SESSION');

assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...realLegacyPayload, dryRun: true },
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'NO_REAL_ORDER');

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
for (const functionName of [
  'handlePostPumpDumpRiskRealOrder',
  'handlePostDumpBounceRiskRealOrder',
  'handlePostPumpKillShortRealOrder',
  'handleEmaSqueezeRealLongOrders',
  'handleEma99KillReclaimRealLongOrders',
  'autoPlaceBinanceOnEntryReady',
  'handleShakeoutReclaimRealOrders',
  'runAutoTradeScan',
  'runAvgDownScan',
  'handlePumpAutoOrder',
  'handleLiqAutoOrder',
  'handleAvgDown',
]) {
  const marker = `async function ${functionName}`;
  const start = serverSource.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} must exist.`);
  assert.match(
    serverSource.slice(start, start + 400),
    /if \(liveCardOnlyAutoBinanceEnabled\(\)\) return;/,
    `${functionName} must be hard-blocked by the exclusive auto-entry policy.`,
  );
}
assert.match(serverSource, /evaluateAutoBinanceEntryPolicy\(\{/);
assert.match(serverSource, /placeOrder\(authorizeLiveCardAutoOrder\(\{/);

console.log('auto Binance exclusive policy tests passed');
