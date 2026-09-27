import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BINANCE_FAST_WAVE_RECOVERY_LOCK_ROE,
  BINANCE_FAST_WAVE_RECOVERY_LOCK_TRIGGER_ROE,
  BINANCE_FAST_WAVE_RECOVERY_TRIGGER_ROE,
  BINANCE_FAST_WAVE_RECOVERY_VERSION,
  BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE,
  BINANCE_NEGATIVE_TP_TO_ENTRY_VERSION,
  evaluateBinanceFastWaveRecovery,
  normalizeNegativeTpRoe,
  shouldBypassFastWaveRecoveryForNegativeTp,
  shouldMoveNegativeTpToEntry,
} from '../src/negativeTakeProfitPolicy.js';

assert.match(BINANCE_NEGATIVE_TP_TO_ENTRY_VERSION, /V6_ROE20_OVERRIDES_FAST_WAVE/);
assert.equal(BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE, -20);
assert.match(BINANCE_FAST_WAVE_RECOVERY_VERSION, /ARM_NEG20_LOCK1_AT10/);
assert.equal(BINANCE_FAST_WAVE_RECOVERY_TRIGGER_ROE, -20);
assert.equal(BINANCE_FAST_WAVE_RECOVERY_LOCK_TRIGGER_ROE, 10);
assert.equal(BINANCE_FAST_WAVE_RECOVERY_LOCK_ROE, 1);
assert.equal(normalizeNegativeTpRoe('-20'), -20);
assert.equal(normalizeNegativeTpRoe('invalid'), -20);
assert.equal(shouldMoveNegativeTpToEntry({ roe: -20 }), true);
assert.equal(shouldMoveNegativeTpToEntry({ roe: -20.01 }), true);
assert.equal(shouldMoveNegativeTpToEntry({ roe: -19.99 }), false);
assert.equal(shouldMoveNegativeTpToEntry({ roe: -20, capTsl: true }), true);
assert.equal(shouldMoveNegativeTpToEntry({ roe: -80, capTsl: true }), true);
assert.equal(shouldMoveNegativeTpToEntry({ roe: null }), false);
assert.equal(shouldBypassFastWaveRecoveryForNegativeTp({ roe: -20 }), true);
assert.equal(shouldBypassFastWaveRecoveryForNegativeTp({ roe: -50 }), true);
assert.equal(shouldBypassFastWaveRecoveryForNegativeTp({ roe: -19.99 }), false);
assert.equal(shouldBypassFastWaveRecoveryForNegativeTp({ roe: -30, thresholdRoe: -30 }), true);
assert.deepEqual(evaluateBinanceFastWaveRecovery({ roe: -20, fastWaveActive: true }), {
  action: 'ARM_RECOVERY', lockRoe: 1,
});
assert.deepEqual(evaluateBinanceFastWaveRecovery({ roe: -19.99, fastWaveActive: true }), {
  action: 'NORMAL_NEGATIVE_TP', lockRoe: 1,
});
assert.deepEqual(evaluateBinanceFastWaveRecovery({ roe: -40, fastWaveActive: false }), {
  action: 'NORMAL_NEGATIVE_TP', lockRoe: 1,
});
assert.deepEqual(evaluateBinanceFastWaveRecovery({ roe: 9.99, recoveryState: 'ARMED' }), {
  action: 'WAIT_RECOVERY', lockRoe: 1,
});
assert.deepEqual(evaluateBinanceFastWaveRecovery({ roe: 10, recoveryState: 'ARMED' }), {
  action: 'LOCK_SL', lockRoe: 1,
});

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
const ordersHtml = await readFile(new URL('../public/orders.html', import.meta.url), 'utf8');
const ordersJs = await readFile(new URL('../public/orders.js', import.meta.url), 'utf8');
assert.match(serverSource, /onRoeUpdate:[\s\S]*shouldMoveSymbolNegativeTpToEntry/);
assert.match(serverSource, /function isCapTslSymbol\(symbol\)/);
assert.match(serverSource, /function shouldMoveSymbolNegativeTpToEntry\(symbol, roe/);
assert.match(serverSource, /ORDERS_CAP_TSL_STATE_V1_DURABLE_20260815/);
assert.match(serverSource, /await loadOrdersCapTslSymbols\(\)/);
assert.match(serverSource, /await saveOrdersCapTslSymbols\(\)/);
assert.match(serverSource, /const isOrdersExcluded = isCapTslSymbol\(symbol\)/);
assert.doesNotMatch(serverSource, /if \(isCapTslSymbol\(symbol\)\) \{[\s\S]*negativeSince\.delete\(symbol\);[\s\S]*return;/);
assert.doesNotMatch(serverSource, /function negativeEntryGuardHasPriority[\s\S]*if \(isCapTslSymbol\(symbol\)\) return false;/);
assert.match(serverSource, /startStaleOrderCleanerScheduler\(\);[\s\S]*startNegTpScanner\(\);[\s\S]*runAfterKlineWarmup/);
assert.match(serverSource, /function routeNegativeTakeProfit\(symbol, pos, roe/);
assert.match(serverSource, /routeNegativeTakeProfit\(symbol, pos, roe/);
assert.match(serverSource, /deepLossOverridesFastWave[\s\S]*DEEP_LOSS_OVERRIDE_TO_ENTRY/);
assert.match(serverSource, /!deepLossOverridesFastWave[\s\S]*CANDLE_DATA_PENDING/);
assert.match(serverSource, /fastWaveRecoveryState/);
assert.match(serverSource, /TP_REWRITE_BLOCKED/);
assert.match(serverSource, /FAST_WAVE_RECOVERY_NEG20_TO_ROE10_LOCK1/);
assert.match(serverSource, /handleEightHourNegativeTakeProfit\(symbol, pos, roe\)/);
assert.match(serverSource, /resolveBinanceNegativeAgeTpConfig\(process.env\)/);
assert.match(serverSource, /BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION/);
assert.doesNotMatch(serverSource, /NEG_TP_TIMEOUT_MS/);
assert.doesNotMatch(serverSource, /\[NegTp\].*user\/Liquid Flow V2 keeps its own TP plan/);
assert.match(serverSource, /t !== 'LIMIT' && t !== 'TAKE_PROFIT' && t !== 'TAKE_PROFIT_MARKET'/);
assert.match(serverSource, /đã có lệnh close ở entry; TP xa còn lại đã được dọn, skip đặt trùng/);
assert.match(serverSource, /existingClose \|\| existingAlgo/);
assert.match(ordersHtml, /TP về entry khi ROE ≤ -20% vẫn chạy/);
assert.match(ordersJs, /TP về entry khi ROE ≤ -20% vẫn chạy/);

console.log('negative TP-to-entry policy tests passed.');
