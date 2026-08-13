import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AUTO_BINANCE_ENTRY_POLICY_VERSION,
  authorizeLiquidFlowV2AutoOrder,
  authorizeLiveCardAutoOrder,
  evaluateAutoBinanceEntryPolicy,
  liveCardOnlyAutoBinanceEnabled,
} from '../src/autoBinancePolicy.js';
import { ceilQuantityAtMinimumNotional } from '../src/orderQuantityPolicy.js';

const exclusiveEnv = {};
assert.equal(AUTO_BINANCE_ENTRY_POLICY_VERSION, 'LIVE_CARD_AND_LIQ_FLOW_READY_V7_HTF5_20260813');
assert.equal(liveCardOnlyAutoBinanceEnabled(exclusiveEnv), true);
assert.equal(liveCardOnlyAutoBinanceEnabled({ LIVE_CARD_WHITELIST_ONLY_AUTO_BINANCE: 'false' }), false);
assert.equal(ceilQuantityAtMinimumNotional({
  steppedQuantity: 49.9,
  stepSize: 0.1,
  markPrice: 0.1,
  requestedNotional: 5,
  minimumNotional: 5,
  enabled: true,
}), 50);
assert.equal(ceilQuantityAtMinimumNotional({
  steppedQuantity: 4,
  stepSize: 1,
  markPrice: 1.02,
  requestedNotional: 5,
  minimumNotional: 5,
  enabled: true,
}), null, 'Must reject a lot-size ceil that exceeds the 1% notional cap.');

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

const liquidFlowBasePayload = authorizeLiquidFlowV2AutoOrder({
  symbol: 'BASEUSDT',
  side: 'BUY',
  dryRun: false,
});
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: liquidFlowBasePayload,
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'LIQUID_FLOW_V2_READY_FILL');

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
assert.match(serverSource, /placeOrder\(authorizeLiquidFlowV2AutoOrder\(\{/);
assert.match(serverSource, /'PRE_UP_BASE_LONG'/);
assert.match(serverSource, /'PRE_DOWN_BASE_SHORT'/);
assert.match(serverSource, /LIQ_FLOW_V2_PRE_BINANCE_MARGIN_USDT \?\? 5/);
assert.match(serverSource, /LIQ_FLOW_V2_PRE_BINANCE_LEVERAGE \?\? 5/);
assert.match(serverSource, /LIQ_FLOW_V2_BASE_LONG_BINANCE_MARGIN_USDT \?\? 2/);
assert.match(serverSource, /allowMinNotionalCeil: profile\.cohort === 'PRE_EMA99'/);
assert.match(serverSource, /ceilQuantityAtMinimumNotional\(\{/);
assert.match(serverSource, /klineCache\.on\('candleTick', \(event\) => \{/);
assert.match(serverSource, /event\?\.interval === '5m'/);
assert.match(serverSource, /klineCache\.on\('candleClose', scheduleLiquidHeatmapFlowV2FastScan\)/);
assert.match(serverSource, /klineCache\.subscribe\(symbols, '15m'\)/);
assert.match(serverSource, /klineCache\.subscribe\(symbols, '1h'\)/);
assert.match(serverSource, /klineCache\.subscribe\(symbols, '4h'\)/);
const v2RealLabelsSource = serverSource.slice(
  serverSource.indexOf('const LIQUID_FLOW_V2_AUTO_REAL_LABELS'),
  serverSource.indexOf('async function notifyLiquidFlowV2Binance'),
);
assert.match(v2RealLabelsSource, /HTF_BEAR_15M_EMA99_PUMP_REJECT/);
assert.match(v2RealLabelsSource, /HTF_BULL_15M_EMA99_DUMP_RECLAIM/);
assert.ok(serverSource.includes('LIQ_FLOW_V2_HTF_BINANCE_MARGIN_USDT ?? 5'));
assert.ok(serverSource.includes('LIQ_FLOW_V2_HTF_BINANCE_LEVERAGE ?? 5'));
assert.doesNotMatch(v2RealLabelsSource, /PUMP_DISTRIBUTION_WATCH/);
assert.doesNotMatch(v2RealLabelsSource, /PUMP_DISTRIBUTION_SHORT_READY/);
const v2RefreshTimerSource = serverSource.slice(
  serverSource.indexOf('const liquidFlowV2RefreshTimer'),
  serverSource.indexOf('async function refreshLiquidMarketDirectionHealth'),
);
assert.doesNotMatch(v2RefreshTimerSource, /if \(!liquidFlowV2SseClients\.size\) return;/);
assert.match(v2RefreshTimerSource, /refreshLiquidHeatmapFlowV2Symbol/);

console.log('auto Binance exclusive policy tests passed');
