import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BINANCE_PROFIT_LOCK_VERSION,
  FAST_WAVE_CHANGE_24H_ENABLED,
  FAST_WAVE_CHANGE_24H_THRESHOLD_PCT,
  FAST_WAVE_CANDLE_5M_LOOKBACK,
  FAST_WAVE_CANDLE_5M_RANGE_THRESHOLD_PCT,
  FAST_WAVE_CANDLE_15M_LOOKBACK,
  FAST_WAVE_CANDLE_15M_RANGE_THRESHOLD_PCT,
  FAST_WAVE_CANDLE_REVERSAL_BODY_MIN_RATIO,
  FAST_WAVE_CANDLE_WICK_MIN_RATIO,
  FAST_WAVE_PROFIT_LOCK_FIRST_LOCK_ROE,
  FAST_WAVE_PROFIT_LOCK_STEP_ROE,
  FAST_WAVE_PROFIT_LOCK_TRAIL_GAP_ROE,
  FAST_WAVE_PROFIT_LOCK_TRIGGER_ROE,
  LEGACY_TRAILING_STOP_DISABLED_VERSION,
  MANUAL_BINANCE_PROFIT_LOCK_FIRST_LOCK_ROE,
  MANUAL_BINANCE_PROFIT_LOCK_TRIGGER_ROE,
  MANUAL_FIVE_X_BREAK_EVEN_TRIGGER_ROE,
  MANUAL_FIVE_X_BREAK_EVEN_VERSION,
  MANUAL_LEVERAGE_BREAK_EVEN_VERSION,
  MANUAL_TEN_X_BREAK_EVEN_TRIGGER_ROE,
  ORDERS_EXCLUDED_PROFIT_LOCK_ROE,
  ORDERS_EXCLUDED_PROFIT_LOCK_TRIGGER_ROE,
  SHORT_TP_ONLY_BREAK_EVEN_LOCK_ROE,
  SHORT_TP_ONLY_BREAK_EVEN_TRIGGER_ROE,
  binanceProfitLockLifecycleKey,
  binanceProfitLockStopPrice,
  binancePositionPriceRoe,
  classifyBinanceFastWaveProfitLock,
  hasBinanceProfitLockStopAtTarget,
  isBinanceProfitLockImmediateTriggerError,
  isBinanceProfitLockTargetBreached,
  isManualBinanceProfitLockSource,
  isLiquidFlowV2ProfitLockSource,
  matchesManualLiquidFlowV2ProfitLockTrade,
  matchesLiquidFlowV2ProfitLockTrade,
  parseBinanceFastWaveSymbols,
  resolveBinanceFastWaveProfitLockRoe,
  resolveBinanceProfitLockRoe,
  resolveManualBinanceProfitLockRoe,
  resolveManualFiveXBreakEvenProfitLockRoe,
  resolveManualLeverageBreakEvenProfitLockRoe,
  resolveOrdersExcludedBinanceProfitLockRoe,
  resolveShortTpOnlyBreakEvenProfitLockRoe,
  summarizeBinanceCandleVolatility,
} from '../src/binanceProfitLock.js';

assert.equal(BINANCE_PROFIT_LOCK_VERSION, 'BINANCE_PROFIT_LOCK_V20_FAST_WAVE_RECOVERY_LOCK_20260902');
assert.equal(LEGACY_TRAILING_STOP_DISABLED_VERSION, 'LEGACY_TSL_DISABLED_V1_20260809');
assert.equal(MANUAL_BINANCE_PROFIT_LOCK_TRIGGER_ROE, 10);
assert.equal(MANUAL_BINANCE_PROFIT_LOCK_FIRST_LOCK_ROE, 1);
assert.equal(MANUAL_FIVE_X_BREAK_EVEN_TRIGGER_ROE, 6);
assert.match(MANUAL_FIVE_X_BREAK_EVEN_VERSION, /MANUAL_5X_BREAK_EVEN_SL_V1/);
assert.equal(MANUAL_TEN_X_BREAK_EVEN_TRIGGER_ROE, 12);
assert.match(MANUAL_LEVERAGE_BREAK_EVEN_VERSION, /MANUAL_5X_10X_BREAK_EVEN_SL_V2/);
assert.equal(ORDERS_EXCLUDED_PROFIT_LOCK_TRIGGER_ROE, 10);
assert.equal(ORDERS_EXCLUDED_PROFIT_LOCK_ROE, 1);
assert.equal(SHORT_TP_ONLY_BREAK_EVEN_TRIGGER_ROE, 10);
assert.equal(SHORT_TP_ONLY_BREAK_EVEN_LOCK_ROE, 0);
assert.equal(FAST_WAVE_CHANGE_24H_THRESHOLD_PCT, 10);
assert.equal(FAST_WAVE_CHANGE_24H_ENABLED, false);
assert.equal(FAST_WAVE_CANDLE_5M_RANGE_THRESHOLD_PCT, 4);
assert.equal(FAST_WAVE_CANDLE_15M_RANGE_THRESHOLD_PCT, 6);
assert.equal(FAST_WAVE_CANDLE_5M_LOOKBACK, 3);
assert.equal(FAST_WAVE_CANDLE_15M_LOOKBACK, 2);
assert.equal(FAST_WAVE_CANDLE_WICK_MIN_RATIO, 0.30);
assert.equal(FAST_WAVE_CANDLE_REVERSAL_BODY_MIN_RATIO, 0.55);
assert.equal(FAST_WAVE_PROFIT_LOCK_TRIGGER_ROE, 30);
assert.equal(FAST_WAVE_PROFIT_LOCK_FIRST_LOCK_ROE, 5);
assert.equal(FAST_WAVE_PROFIT_LOCK_STEP_ROE, 10);
assert.equal(FAST_WAVE_PROFIT_LOCK_TRAIL_GAP_ROE, 25);
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
assert.equal(resolveManualFiveXBreakEvenProfitLockRoe({ isManualPosition: true, leverage: 5, roe: 6 }), null);
assert.equal(resolveManualFiveXBreakEvenProfitLockRoe({ isManualPosition: true, leverage: 5, roe: 6.01 }), 0);
assert.equal(resolveManualFiveXBreakEvenProfitLockRoe({ isManualPosition: true, leverage: 5, roe: 10 }), 0);
assert.equal(resolveManualFiveXBreakEvenProfitLockRoe({ isManualPosition: true, leverage: 4, roe: 20 }), null);
assert.equal(resolveManualFiveXBreakEvenProfitLockRoe({ isManualPosition: false, leverage: 5, roe: 20 }), null);
assert.equal(resolveManualFiveXBreakEvenProfitLockRoe({ isManualPosition: true, leverage: 5, roe: NaN }), null);
assert.equal(resolveManualLeverageBreakEvenProfitLockRoe({ isManualPosition: true, leverage: 10, roe: 12 }), null);
assert.equal(resolveManualLeverageBreakEvenProfitLockRoe({ isManualPosition: true, leverage: 10, roe: 12.01 }), 0);
assert.equal(resolveManualLeverageBreakEvenProfitLockRoe({ isManualPosition: true, leverage: 10, roe: 15 }), 0);
assert.equal(resolveManualLeverageBreakEvenProfitLockRoe({ isManualPosition: false, leverage: 10, roe: 20 }), null);
assert.equal(resolveManualLeverageBreakEvenProfitLockRoe({ isManualPosition: true, leverage: 20, roe: 20 }), null);
assert.equal(resolveManualFiveXBreakEvenProfitLockRoe({ isManualPosition: true, leverage: 10, roe: 20 }), null);
assert.equal(resolveOrdersExcludedBinanceProfitLockRoe(9.99), null);
assert.equal(resolveOrdersExcludedBinanceProfitLockRoe(10), 1);
assert.equal(resolveOrdersExcludedBinanceProfitLockRoe(15), 1);
assert.equal(resolveOrdersExcludedBinanceProfitLockRoe(20), 1);
assert.equal(resolveOrdersExcludedBinanceProfitLockRoe(100), 1);
assert.equal(resolveShortTpOnlyBreakEvenProfitLockRoe(9.99), null);
assert.equal(resolveShortTpOnlyBreakEvenProfitLockRoe(10), 0);
assert.equal(resolveShortTpOnlyBreakEvenProfitLockRoe(14.99), 0);
assert.equal(resolveShortTpOnlyBreakEvenProfitLockRoe(15), 5);
assert.equal(resolveShortTpOnlyBreakEvenProfitLockRoe(20), 10);

const fastWaveSymbols = parseBinanceFastWaveSymbols(' zkpUSDT,4usdt ');
assert.deepEqual([...fastWaveSymbols], ['ZKPUSDT', '4USDT']);
const pendingCandleVolatility = summarizeBinanceCandleVolatility({ candles5m: [], candles15m: [] });
assert.equal(pendingCandleVolatility.hasCandleData, false);
assert.deepEqual(classifyBinanceFastWaveProfitLock({
  symbol: 'HEMIUSDT', side: 'LONG', isManualOrLiquidFlowV2: true,
  explicitSymbols: fastWaveSymbols, candleVolatility: pendingCandleVolatility,
}), {
  active: false,
  reason: 'CANDLE_DATA_PENDING',
  max5mRangePct: null,
  max15mRangePct: null,
  max5mWickRatio: null,
  max15mWickRatio: null,
});
assert.deepEqual(classifyBinanceFastWaveProfitLock({
  symbol: 'ZKPUSDT', side: 'LONG', isManualOrLiquidFlowV2: true,
  change24hPct: 1, explicitSymbols: fastWaveSymbols,
}), {
  active: false,
  reason: 'EXPLICIT_SYMBOL_WAIT_WICK_REVERSAL',
  change24hPct: 1,
  max5mRangePct: null,
  max15mRangePct: null,
  max5mWickRatio: null,
  max15mWickRatio: null,
});
assert.deepEqual(classifyBinanceFastWaveProfitLock({
  symbol: 'NEWUSDT', side: 'LONG', isManualOrLiquidFlowV2: true,
  change24hPct: 12.86, explicitSymbols: fastWaveSymbols,
}), {
  active: false,
  reason: 'NORMAL_CANDLE_RANGE',
  change24hPct: 12.86,
  max5mRangePct: null,
  max15mRangePct: null,
  max5mWickRatio: null,
  max15mWickRatio: null,
});
assert.deepEqual(classifyBinanceFastWaveProfitLock({
  symbol: 'NEWUSDT', side: 'LONG', isManualOrLiquidFlowV2: true,
  change24hPct: 12.86, explicitSymbols: fastWaveSymbols, change24hEnabled: true,
}), {
  active: false,
  reason: 'NORMAL_CANDLE_RANGE',
  change24hPct: 12.86,
  max5mRangePct: null,
  max15mRangePct: null,
  max5mWickRatio: null,
  max15mWickRatio: null,
});
assert.deepEqual(classifyBinanceFastWaveProfitLock({
  symbol: 'NEWUSDT', side: 'LONG', isManualOrLiquidFlowV2: true,
  change24hPct: 2, explicitSymbols: fastWaveSymbols, recentSameSideDca: true,
}), {
  active: false,
  reason: 'NORMAL_CANDLE_RANGE',
  change24hPct: 2,
  max5mRangePct: null,
  max15mRangePct: null,
  max5mWickRatio: null,
  max15mWickRatio: null,
});
assert.equal(classifyBinanceFastWaveProfitLock({
  symbol: 'ZKPUSDT', side: 'SHORT', isManualOrLiquidFlowV2: true,
  explicitSymbols: fastWaveSymbols,
}).active, false);
assert.equal(classifyBinanceFastWaveProfitLock({
  symbol: 'ZKPUSDT', side: 'LONG', isManualOrLiquidFlowV2: false,
  explicitSymbols: fastWaveSymbols,
}).active, false);
assert.equal(resolveBinanceFastWaveProfitLockRoe(29.99), null);
assert.equal(resolveBinanceFastWaveProfitLockRoe(30), 5);
assert.equal(resolveBinanceFastWaveProfitLockRoe(39.99), 5);
assert.equal(resolveBinanceFastWaveProfitLockRoe(40), 15);
assert.equal(resolveBinanceFastWaveProfitLockRoe(50), 25);

const skrCandleVolatility = summarizeBinanceCandleVolatility({
  side: 'SHORT',
  candles5m: [
    { open: 0.027, high: 0.0278, low: 0.0267, close: 0.0275 },
    { open: 0.0275, high: 0.0309, low: 0.0271, close: 0.0305 },
  ],
  candles15m: [{ open: 0.026, high: 0.0309, low: 0.0258, close: 0.0305 }],
});
assert.equal(skrCandleVolatility.active, true);
assert.equal(skrCandleVolatility.hasCandleData, true);
assert.equal(skrCandleVolatility.reason, 'CANDLE_BODY_REVERSAL_5M');
assert.ok(skrCandleVolatility.max5mRangePct > 13);
const skrPolicy = classifyBinanceFastWaveProfitLock({
  symbol: 'SKRUSDT', side: 'SHORT', isManualOrLiquidFlowV2: true,
  explicitSymbols: fastWaveSymbols, candleVolatility: skrCandleVolatility,
});
assert.equal(skrPolicy.active, true);
assert.equal(skrPolicy.reason, 'CANDLE_BODY_REVERSAL_5M');
assert.equal(skrPolicy.selectedDirection, 'BULLISH');

const alignedBullBody = summarizeBinanceCandleVolatility({
  side: 'LONG',
  candles5m: [{ open: 100, high: 108, low: 99.5, close: 107.8 }],
  candles15m: [],
});
assert.equal(alignedBullBody.active, false);
assert.equal(alignedBullBody.reason, 'DIRECTIONAL_BODY_ONLY');
assert.ok(alignedBullBody.max5mRangePct > 8);
assert.ok(alignedBullBody.max5mWickRatio < FAST_WAVE_CANDLE_WICK_MIN_RATIO);
assert.equal(classifyBinanceFastWaveProfitLock({
  symbol: 'ZKPUSDT', side: 'LONG', isManualOrLiquidFlowV2: true,
  explicitSymbols: fastWaveSymbols, candleVolatility: alignedBullBody,
}).reason, 'DIRECTIONAL_BODY_ONLY');

const upperWickVolatility = summarizeBinanceCandleVolatility({
  side: 'LONG',
  candles5m: [{ open: 100, high: 110, low: 99, close: 105 }],
});
assert.equal(upperWickVolatility.active, true);
assert.equal(upperWickVolatility.reason, 'CANDLE_WICK_5M');
assert.ok(upperWickVolatility.selectedWickRatio >= FAST_WAVE_CANDLE_WICK_MIN_RATIO);

const adverseBearBody = summarizeBinanceCandleVolatility({
  side: 'LONG',
  candles5m: [{ open: 100, high: 101, low: 94, close: 95 }],
});
assert.equal(adverseBearBody.active, true);
assert.equal(adverseBearBody.reason, 'CANDLE_BODY_REVERSAL_5M');
assert.ok(adverseBearBody.selectedBodyRatio >= FAST_WAVE_CANDLE_REVERSAL_BODY_MIN_RATIO);

const zkcCandleVolatility = summarizeBinanceCandleVolatility({
  side: 'LONG',
  candles5m: [{ open: 0.059, high: 0.0612, low: 0.05865, close: 0.0608 }],
  candles15m: [{ open: 0.0588, high: 0.0618, low: 0.05775, close: 0.0612 }],
});
assert.equal(zkcCandleVolatility.active, false);
assert.equal(zkcCandleVolatility.reason, 'DIRECTIONAL_BODY_ONLY');
const normalCandleVolatility = summarizeBinanceCandleVolatility({
  candles5m: [{ open: 100, high: 102, low: 99, close: 101 }],
  candles15m: [{ open: 100, high: 104, low: 99, close: 102 }],
});
assert.equal(normalCandleVolatility.active, false);
assert.equal(normalCandleVolatility.reason, 'NORMAL_CANDLE_RANGE');

assert.equal(binanceProfitLockStopPrice({ side: 'LONG', entryPrice: 100, leverage: 10, lockRoe: 1 }), 100.1);
assert.equal(binanceProfitLockStopPrice({ side: 'SHORT', entryPrice: 100, leverage: 10, lockRoe: 1 }), 99.9);
assert.equal(binanceProfitLockStopPrice({ side: 'SHORT', entryPrice: 100, leverage: 5, lockRoe: 0 }), 100);
assert.equal(binanceProfitLockStopPrice({ side: 'LONG', entryPrice: 0, leverage: 10, lockRoe: 1 }), null);
assert.equal(binanceProfitLockStopPrice({ side: 'LONG', entryPrice: 100, leverage: 10, lockRoe: -1 }), null);
assert.equal(binancePositionPriceRoe({ side: 'SHORT', entryPrice: 100, markPrice: 98, leverage: 5 }), 10);
assert.equal(binancePositionPriceRoe({ side: 'SHORT', entryPrice: 100, markPrice: 102, leverage: 5 }), -10);
assert.equal(binancePositionPriceRoe({ side: 'LONG', entryPrice: 100, markPrice: 102, leverage: 5 }), 10);
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
assert.match(serverSource, /isOrdersExcluded[\s\S]*resolveOrdersExcludedBinanceProfitLockRoe\(effectiveRoe\)/);
assert.match(serverSource, /handleSlTrailByProfit\(symbol, pos, roe, markPrice\)\.catch/);
assert.match(serverSource, /resetBinanceProfitLockRuntime\(symbol, 'SOCKET_FULL_FILL'\)/);
assert.match(serverSource, /resetBinanceProfitLockRuntime\(symbol, 'POSITION_CLOSED'\)/);
assert.doesNotMatch(serverSource, /closeBinancePositionAtBreachedProfitLock/);
assert.match(serverSource, /profitLock:verifyReplacementAfterError/);
assert.match(serverSource, /restored old SL/);
assert.match(serverSource, /FAST_WAVE_WICK_OR_REVERSAL_ROE30_GAP25/);
assert.match(serverSource, /const isShortTpOnlyBreakEven = isBotShortTpOnlyPosition \|\| isManualShortTpOnlyPosition/);
assert.match(serverSource, /resolveShortTpOnlyBreakEvenProfitLockRoe\(effectiveRoe\)/);
assert.match(serverSource, /resolveManualLeverageBreakEvenProfitLockRoe\(\{/);
assert.match(serverSource, /manualTenXBeforeFirstLock\) return/);
assert.match(serverSource, /Math\.max\(manualBaseLockRoe \?\? -Infinity, manualBreakEvenRoe\)/);
assert.match(serverSource, /matchesPositionSide\(o\)/);
assert.match(serverSource, /closingSide && \(t === 'STOP_MARKET' \|\| t === 'STOP'\)/);
assert.match(serverSource, /SHORT_TP_ONLY_ROE10_BREAK_EVEN/);
assert.doesNotMatch(serverSource, /if \(isTrackedBotShortTpOnlyPosition\(symbol, pos\) \|\| isTrackedManualShortTpOnlyPosition\(symbol, pos\)\) return/);
assert.doesNotMatch(serverSource, /recentSameSideDca:/);
assert.match(serverSource, /FastWaveProfitLock[\s\S]*không MARKET-close/);
assert.match(serverSource, /BINANCE_FAST_WAVE_SYMBOLS/);
assert.match(serverSource, /BINANCE_FAST_WAVE_CANDLE_5M_RANGE_PCT/);
assert.match(serverSource, /BINANCE_FAST_WAVE_CANDLE_15M_RANGE_PCT/);
assert.match(serverSource, /BINANCE_FAST_WAVE_CANDLE_WICK_MIN_RATIO/);
assert.match(serverSource, /BINANCE_FAST_WAVE_CANDLE_REVERSAL_BODY_MIN_RATIO/);
assert.match(serverSource, /tracking\?\.profitLockFastWave === fastWavePolicy\.active/);
assert.match(serverSource, /fastWaveRecoveryControls/);
assert.match(serverSource, /completeBinanceFastWaveRecovery/);
assert.match(serverSource, /fastWavePolicy\.reason === 'CANDLE_DATA_PENDING'/);
assert.match(serverSource, /binancePositionPriceRoe/);
assert.match(serverSource, /giữ nguyên position, không MARKET-close/);
assert.doesNotMatch(serverSource, /SlTrailEmergency/);
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
