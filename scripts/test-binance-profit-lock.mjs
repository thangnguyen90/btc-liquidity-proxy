import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BINANCE_PROFIT_LOCK_VERSION,
  LEGACY_TRAILING_STOP_DISABLED_VERSION,
  MANUAL_BINANCE_PROFIT_LOCK_FIRST_LOCK_ROE,
  MANUAL_BINANCE_PROFIT_LOCK_TRIGGER_ROE,
  ORDERS_EXCLUDED_PROFIT_LOCK_ROE,
  ORDERS_EXCLUDED_PROFIT_LOCK_TRIGGER_ROE,
  binanceProfitLockLifecycleKey,
  binanceProfitLockStopPrice,
  hasBinanceProfitLockStopAtTarget,
  isBinanceProfitLockImmediateTriggerError,
  isBinanceProfitLockTargetBreached,
  isManualBinanceProfitLockSource,
  isLiquidFlowV2ProfitLockSource,
  matchesManualLiquidFlowV2ProfitLockTrade,
  matchesLiquidFlowV2ProfitLockTrade,
  resolveBinanceProfitLockRoe,
  resolveManualBinanceProfitLockRoe,
  resolveOrdersExcludedBinanceProfitLockRoe,
} from '../src/binanceProfitLock.js';

assert.equal(BINANCE_PROFIT_LOCK_VERSION, 'BINANCE_PROFIT_LOCK_V13_GTE_REPLACE_ROLLBACK_20260820');
assert.equal(LEGACY_TRAILING_STOP_DISABLED_VERSION, 'LEGACY_TSL_DISABLED_V1_20260809');
assert.equal(MANUAL_BINANCE_PROFIT_LOCK_TRIGGER_ROE, 10);
assert.equal(MANUAL_BINANCE_PROFIT_LOCK_FIRST_LOCK_ROE, 1);
assert.equal(ORDERS_EXCLUDED_PROFIT_LOCK_TRIGGER_ROE, 10);
assert.equal(ORDERS_EXCLUDED_PROFIT_LOCK_ROE, 1);
assert.equal(isLiquidFlowV2ProfitLockSource('liquid-flow-v2-base'), true);
assert.equal(isLiquidFlowV2ProfitLockSource(null, 'LIQUID-FLOW-V2-MANUAL'), true);
assert.equal(isLiquidFlowV2ProfitLockSource('live-card-whitelist-edge'), false);
assert.equal(isManualBinanceProfitLockSource(null, null), true);
assert.equal(isManualBinanceProfitLockSource('liquid-flow-v2-manual'), true);
assert.equal(isManualBinanceProfitLockSource('orders-manual'), true);
assert.equal(isManualBinanceProfitLockSource('liquid-flow-v2-base'), false);
assert.equal(matchesLiquidFlowV2ProfitLockTrade({
  symbol: 'BANANAS31USDT',
  side: 'LONG',
  entryPrice: 0.008663,
  openedAt: 1_786_288_136_472,
  trades: [{
    symbol: 'BANANAS31USDT', side: 'LONG', binanceEntryState: 'FILLED',
    binanceEntryPrice: 0.008642, binanceEntryFilledAt: 1_786_288_135_834,
  }],
}), true);
assert.equal(matchesLiquidFlowV2ProfitLockTrade({
  symbol: 'BANANAS31USDT', side: 'LONG', entryPrice: 0.008663, openedAt: 1_786_300_000_000,
  trades: [{
    symbol: 'BANANAS31USDT', side: 'LONG', binanceEntryState: 'FILLED',
    binanceEntryPrice: 0.008642, binanceEntryFilledAt: 1_786_288_135_834,
  }],
}), false);
assert.equal(matchesManualLiquidFlowV2ProfitLockTrade({
  symbol: 'BLUAIUSDT', side: 'LONG', entryPrice: 0.0305, openedAt: 1_786_413_275_004,
  trades: [{
    symbol: 'BLUAIUSDT', side: 'LONG', binanceEntryState: 'FILLED', binanceEntryMode: 'MANUAL_MARKET',
    binanceEntryPrice: 0.0305, binanceEntryFilledAt: 1_786_413_275_004,
  }],
}), true);
assert.equal(matchesManualLiquidFlowV2ProfitLockTrade({
  symbol: 'BLUAIUSDT', side: 'LONG', entryPrice: 0.0305, openedAt: 1_786_413_275_004,
  trades: [{
    symbol: 'BLUAIUSDT', side: 'LONG', binanceEntryState: 'FILLED', binanceEntryMode: 'AUTO_MARKET',
    binanceEntryPrice: 0.0305, binanceEntryFilledAt: 1_786_413_275_004,
  }],
}), false);
assert.equal(resolveBinanceProfitLockRoe(4.99), null);
assert.equal(resolveBinanceProfitLockRoe(5), 1);
assert.equal(resolveBinanceProfitLockRoe(14.99), 1);
assert.equal(resolveBinanceProfitLockRoe(15), 5);
assert.equal(resolveBinanceProfitLockRoe(20), 10);
assert.equal(resolveBinanceProfitLockRoe(5, { triggerRoe: 6, firstLockRoe: 2 }), null);
assert.equal(resolveBinanceProfitLockRoe(6, { triggerRoe: 6, firstLockRoe: 2 }), 2);
assert.equal(resolveBinanceProfitLockRoe(6, { triggerRoe: 0, firstLockRoe: 1 }), null);
assert.equal(resolveBinanceProfitLockRoe(6, { triggerRoe: 5, firstLockRoe: -1 }), null);
assert.equal(resolveManualBinanceProfitLockRoe(9.99), null);
assert.equal(resolveManualBinanceProfitLockRoe(10), 1);
assert.equal(resolveManualBinanceProfitLockRoe(14.99), 1);
assert.equal(resolveManualBinanceProfitLockRoe(15), 5);
assert.equal(resolveOrdersExcludedBinanceProfitLockRoe(9.99), null);
assert.equal(resolveOrdersExcludedBinanceProfitLockRoe(10), 1);
assert.equal(resolveOrdersExcludedBinanceProfitLockRoe(15), 1);
assert.equal(resolveOrdersExcludedBinanceProfitLockRoe(20), 1);
assert.equal(resolveOrdersExcludedBinanceProfitLockRoe(100), 1);

assert.equal(binanceProfitLockStopPrice({ side: 'LONG', entryPrice: 100, leverage: 10, lockRoe: 1 }), 100.1);
assert.equal(binanceProfitLockStopPrice({ side: 'SHORT', entryPrice: 100, leverage: 10, lockRoe: 1 }), 99.9);
assert.equal(binanceProfitLockStopPrice({ side: 'LONG', entryPrice: 0, leverage: 10, lockRoe: 1 }), null);
assert.equal(binanceProfitLockStopPrice({ side: 'LONG', entryPrice: 100, leverage: 10, lockRoe: -1 }), null);
assert.equal(
  binanceProfitLockLifecycleKey({
    symbol: 'holousdt', side: 'LONG', entryPrice: 0.0861789425, openedAt: 1_786_511_961_095,
  }),
  'HOLOUSDT|LONG|0.0861789425000|1786511961095',
);
assert.notEqual(
  binanceProfitLockLifecycleKey({
    symbol: 'HOLOUSDT', side: 'LONG', entryPrice: 0.09073, openedAt: 1_786_507_769_000,
  }),
  binanceProfitLockLifecycleKey({
    symbol: 'HOLOUSDT', side: 'LONG', entryPrice: 0.0861789425, openedAt: 1_786_511_961_095,
  }),
);
assert.equal(binanceProfitLockLifecycleKey({ symbol: 'HOLOUSDT', side: 'LONG', entryPrice: 0 }), null);
assert.equal(isBinanceProfitLockImmediateTriggerError({ code: -2021 }), true);
assert.equal(isBinanceProfitLockImmediateTriggerError(new Error('Order would immediately trigger.')), true);
assert.equal(isBinanceProfitLockImmediateTriggerError(new Error('Invalid API-key')), false);
assert.equal(isBinanceProfitLockTargetBreached({ side: 'LONG', markPrice: 100, stopPrice: 100.1 }), true);
assert.equal(isBinanceProfitLockTargetBreached({ side: 'LONG', markPrice: 100.2, stopPrice: 100.1 }), false);
assert.equal(isBinanceProfitLockTargetBreached({ side: 'SHORT', markPrice: 100, stopPrice: 99.9 }), true);
assert.equal(isBinanceProfitLockTargetBreached({ side: 'SHORT', markPrice: 99.8, stopPrice: 99.9 }), false);
assert.equal(hasBinanceProfitLockStopAtTarget({
  orders: [{ symbol: 'ABCUSDT', side: 'SELL', orderType: 'STOP_MARKET', triggerPrice: '100.1' }],
  symbol: 'ABCUSDT', closeSide: 'SELL', stopPrice: 100.1,
}), true);
assert.equal(hasBinanceProfitLockStopAtTarget({
  orders: [{ symbol: 'ABCUSDT', side: 'SELL', orderType: 'TAKE_PROFIT_MARKET', triggerPrice: '100.1' }],
  symbol: 'ABCUSDT', closeSide: 'SELL', stopPrice: 100.1,
}), false);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.doesNotMatch(serverSource, /startTrailingStopScanner\s*\(/);
assert.match(serverSource, /isLiquidFlowV2ManagedPosition\(symbol, pos\)/);
assert.match(serverSource, /isManualBinanceManagedPosition\(symbol, pos\)/);
assert.match(serverSource, /const isLiquidFlowV2Position = isLiquidFlowV2ManagedPosition\(symbol, pos\)/);
assert.match(serverSource, /const usesRoe10Lock1 = isManualPosition \|\| isLiquidFlowV2Position/);
assert.doesNotMatch(serverSource, /!isManualPosition && isLiquidFlowV2ManagedPosition\(symbol, pos\)/);
assert.match(serverSource, /LIQUID_V2_ROE10_LOCK1/);
const liquidFlowMatcherBody = serverSource.match(/function isLiquidFlowV2ManagedPosition[\s\S]*?\n}/)?.[0] ?? '';
assert.doesNotMatch(liquidFlowMatcherBody, /isUserOrLiquidFlowV2ManagedSource/);
assert.match(serverSource, /function isTakeProfitUserOrLiquidFlowV2ManagedPosition/);
assert.match(serverSource, /const takeProfitUserOrV2Managed = isTakeProfitUserOrLiquidFlowV2ManagedPosition\(symbol, pos\)/);
assert.doesNotMatch(serverSource, /const skipTsl = tslExcludedSymbols\.has\(symbol\)/);
assert.doesNotMatch(serverSource, /if \(tslExcludedSymbols\.has\(p\.symbol\)\) continue;/);
assert.match(serverSource, /const isOrdersExcluded = isCapTslSymbol\(symbol\)/);
assert.match(serverSource, /isOrdersExcluded[\s\S]*resolveOrdersExcludedBinanceProfitLockRoe\(roe\)/);
assert.match(serverSource, /handleSlTrailByProfit\(symbol, pos, roe, markPrice\)\.catch/);
assert.match(serverSource, /resetBinanceProfitLockRuntime\(symbol, 'SOCKET_FULL_FILL'\)/);
assert.match(serverSource, /resetBinanceProfitLockRuntime\(symbol, 'POSITION_CLOSED'\)/);
assert.match(serverSource, /closeBinancePositionAtBreachedProfitLock/);
assert.match(serverSource, /profitLock:verifyReplacementAfterError/);
assert.match(serverSource, /restored old SL/);
assert.doesNotMatch(serverSource, /Place new SL FIRST/);
assert.match(serverSource, /profitLockArmedLifecycleKey/);
assert.doesNotMatch(serverSource, /startSlTrailSafetyScanner\(\);/);
assert.doesNotMatch(serverSource, /startMissingTpScanner\(\);/);
assert.doesNotMatch(serverSource, /recoverSignalProtectionAfterMarketFill/);
assert.match(serverSource, /'ORDER_TRADE_UPDATE', 'TRADE_LITE_VERIFIED'/);
assert.match(serverSource, /POSITION_PROTECTION_TRIGGER_VERSION/);
assert.match(serverSource, /roundedTakeProfitPrice != null[\s\S]*roundedStopLossPrice != null/);
assert.match(serverSource, /Legacy trailingStop\.js disabled/);

console.log('Binance profit-lock tests passed');
