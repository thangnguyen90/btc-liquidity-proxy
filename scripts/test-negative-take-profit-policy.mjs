import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE,
  BINANCE_NEGATIVE_TP_TO_ENTRY_VERSION,
  normalizeNegativeTpRoe,
  shouldMoveNegativeTpToEntry,
} from '../src/negativeTakeProfitPolicy.js';

assert.match(BINANCE_NEGATIVE_TP_TO_ENTRY_VERSION, /V4_CAP_TSL_INDEPENDENT_ROE20/);
assert.equal(BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE, -20);
assert.equal(normalizeNegativeTpRoe('-20'), -20);
assert.equal(normalizeNegativeTpRoe('invalid'), -20);
assert.equal(shouldMoveNegativeTpToEntry({ roe: -20 }), true);
assert.equal(shouldMoveNegativeTpToEntry({ roe: -20.01 }), true);
assert.equal(shouldMoveNegativeTpToEntry({ roe: -19.99 }), false);
assert.equal(shouldMoveNegativeTpToEntry({ roe: -20, capTsl: true }), true);
assert.equal(shouldMoveNegativeTpToEntry({ roe: -80, capTsl: true }), true);
assert.equal(shouldMoveNegativeTpToEntry({ roe: null }), false);

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
assert.match(serverSource, /handleNegativeTimeoutTp\(symbol, pos\)/);
assert.match(serverSource, /handleEightHourNegativeTakeProfit\(symbol, pos, roe\)/);
assert.match(serverSource, /BINANCE_NEGATIVE_TP_AFTER_8H_MS/);
assert.match(serverSource, /BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION/);
assert.doesNotMatch(serverSource, /NEG_TP_TIMEOUT_MS/);
assert.doesNotMatch(serverSource, /\[NegTp\].*user\/Liquid Flow V2 keeps its own TP plan/);
assert.match(serverSource, /t !== 'LIMIT' && t !== 'TAKE_PROFIT' && t !== 'TAKE_PROFIT_MARKET'/);
assert.match(ordersHtml, /TP về entry khi ROE ≤ -20% vẫn chạy/);
assert.match(ordersJs, /TP về entry khi ROE ≤ -20% vẫn chạy/);

console.log('negative TP-to-entry policy tests passed.');
