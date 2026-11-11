import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COIN_LEVEL_OBSERVE_DIRECTION_FLIP_PROTECTION_VERSION,
  CoinLevelObserveDirectionFlipTracker,
  evaluateCoinLevelObserveFlipPosition,
  isEntryOrderAgainstCoinLevelFlip,
  partitionCoinLevelFlipEntries,
} from '../src/coinLevelObserveDirectionFlipProtection.js';

const watch = (symbol, side, observedAt) => ({ symbol, side, observedAt, watchOnly: true });
const snapshot = ({ long = [], short = [] } = {}) => ({
  earlyLongWatches: long,
  earlyShortWatches: short,
});

const tracker = new CoinLevelObserveDirectionFlipTracker({ carryMs: 30 * 60_000 });
assert.deepEqual(tracker.observe(snapshot({ long: [watch('KITEUSDT', 'LONG', 1_000)] }), 10_000), []);
assert.deepEqual(tracker.observe(snapshot(), 5 * 60_000), []);
const [flip] = tracker.observe(snapshot({ short: [watch('KITEUSDT', 'SHORT', 600_000)] }), 600_000);
assert.equal(flip.version, COIN_LEVEL_OBSERVE_DIRECTION_FLIP_PROTECTION_VERSION);
assert.equal(flip.symbol, 'KITEUSDT');
assert.equal(flip.fromDirection, 'LONG');
assert.equal(flip.toDirection, 'SHORT');
assert.deepEqual(tracker.observe(snapshot({ short: [watch('KITEUSDT', 'SHORT', 900_000)] }), 900_000), []);

const ambiguous = new CoinLevelObserveDirectionFlipTracker();
ambiguous.observe(snapshot({ long: [watch('BOTHUSDT', 'LONG', 1)] }), 1_000);
assert.deepEqual(ambiguous.observe(snapshot({
  long: [watch('BOTHUSDT', 'LONG', 2)],
  short: [watch('BOTHUSDT', 'SHORT', 2)],
}), 2_000), []);

const expired = new CoinLevelObserveDirectionFlipTracker({ carryMs: 5 * 60_000 });
expired.observe(snapshot({ long: [watch('OLDUSDT', 'LONG', 1)] }), 1_000);
assert.deepEqual(expired.observe(snapshot({ short: [watch('OLDUSDT', 'SHORT', 1_000_000)] }), 1_000_000), []);

assert.equal(evaluateCoinLevelObserveFlipPosition({
  flip,
  position: { symbol: 'KITEUSDT', positionAmt: '10', unRealizedProfit: '0.02' },
}).action, 'CLOSE_MARKET');
assert.equal(evaluateCoinLevelObserveFlipPosition({
  flip,
  position: { symbol: 'KITEUSDT', positionAmt: '10', unRealizedProfit: '-0.02' },
}).action, 'MOVE_TP_TO_ENTRY');
assert.equal(evaluateCoinLevelObserveFlipPosition({
  flip,
  position: { symbol: 'KITEUSDT', positionAmt: '10', unRealizedProfit: '0' },
}).action, 'MOVE_TP_TO_ENTRY');
assert.equal(evaluateCoinLevelObserveFlipPosition({
  flip,
  position: { symbol: 'KITEUSDT', positionAmt: '-10', unRealizedProfit: '1' },
}).action, 'IGNORE');
assert.ok(Math.abs(evaluateCoinLevelObserveFlipPosition({
  flip,
  position: { symbol: 'KITEUSDT', positionAmt: '10', entryPrice: '2', markPrice: '2.1' },
}).pnlUsdt - 1) < 1e-9);

assert.equal(isEntryOrderAgainstCoinLevelFlip({
  symbol: 'KITEUSDT', side: 'BUY', type: 'LIMIT', reduceOnly: false,
}, flip), true);
assert.equal(isEntryOrderAgainstCoinLevelFlip({
  symbol: 'KITEUSDT', side: 'SELL', type: 'LIMIT', reduceOnly: false,
}, flip), false);
assert.equal(isEntryOrderAgainstCoinLevelFlip({
  symbol: 'KITEUSDT', side: 'BUY', type: 'TAKE_PROFIT_MARKET', reduceOnly: false,
}, flip), false);
assert.equal(isEntryOrderAgainstCoinLevelFlip({
  symbol: 'KITEUSDT', side: 'BUY', type: 'LIMIT', reduceOnly: true,
}, flip), false);

const onFlip = { symbol: 'ONUSDT', fromDirection: 'SHORT', toDirection: 'LONG' };
const onDca = {
  orderId: 1541088545, symbol: 'ONUSDT', side: 'SELL', type: 'LIMIT',
  positionSide: 'BOTH', reduceOnly: false, price: '0.3000', origQty: '317', executedQty: '0',
};
const onShort = { symbol: 'ONUSDT', positionSide: 'BOTH', positionAmt: '-545' };
const onTp = { ...onDca, orderId: 1541040192, side: 'BUY', reduceOnly: true };
assert.deepEqual(partitionCoinLevelFlipEntries([onDca, onTp], onFlip, [onShort]),
  { cancel: [], retainedDca: [onDca] }, 'ONUSDT incident replay with active parent');
assert.deepEqual(partitionCoinLevelFlipEntries([onDca, onTp], onFlip, []),
  { cancel: [onDca], retainedDca: [] }, 'standalone old-side order remains cancellable');
const initialPartial = { ...onDca, executedQty: '120' };
assert.deepEqual(partitionCoinLevelFlipEntries([initialPartial], onFlip, [{ ...onShort, positionAmt: '-120' }]),
  { cancel: [initialPartial], retainedDca: [] }, 'partial standalone entry is not DCA');
assert.deepEqual(partitionCoinLevelFlipEntries([initialPartial], onFlip, [onShort]),
  { cancel: [], retainedDca: [initialPartial] }, 'larger active exposure retains the partially filled DCA');
const hedgeDca = { ...onDca, positionSide: 'SHORT' };
assert.deepEqual(partitionCoinLevelFlipEntries([hedgeDca], onFlip, [
  { ...onShort, positionSide: 'SHORT', positionAmt: '0' },
  { ...onShort, positionSide: 'LONG', positionAmt: '545' },
]), { cancel: [hedgeDca], retainedDca: [] }, 'a zero hedge leg is not a DCA parent');
assert.deepEqual(partitionCoinLevelFlipEntries([hedgeDca], onFlip, [{ ...onShort, positionSide: 'SHORT' }]),
  { cancel: [], retainedDca: [hedgeDca] });
const longDca = { symbol: 'KITEUSDT', side: 'BUY', type: 'LIMIT', executedQty: '0' };
assert.deepEqual(partitionCoinLevelFlipEntries([longDca], flip, [{ symbol: 'KITEUSDT', positionAmt: '10' }]),
  { cancel: [], retainedDca: [longDca] });
assert.throws(() => partitionCoinLevelFlipEntries([onDca], onFlip, null), /Position Risk/);
assert.throws(() => partitionCoinLevelFlipEntries([onDca], onFlip, [{ symbol: 'ONUSDT' }]), /position amount/);

const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(server, /reconcileCoinLevelObserveDirectionFlips\(snapshot\)/);
assert.match(server, /CLOSE_MARKET/);
assert.match(server, /MOVE_TP_TO_ENTRY/);
assert.match(server, /handleNegativeTimeoutTp\([\s\S]*force: true/);
assert.match(server, /partitionCoinLevelFlipEntries/);

const reconcileStart = server.indexOf('async function reconcileCoinLevelObserveDirectionFlips');
const reconcileEnd = server.indexOf('\nlet localAiTrendAutoEvaluationRunning', reconcileStart);
const reconcileSource = server.slice(reconcileStart, reconcileEnd);
const flipGuard = reconcileSource.indexOf("isBinanceProtectionExcluded(flip.symbol, 'COIN_LEVEL_OBSERVE_FLIP')");
const firstFlipMutation = reconcileSource.indexOf('client.cancelOrder');
assert.ok(flipGuard >= 0, 'direction-flip has an explicit protection-exclusion guard');
assert.ok(flipGuard < firstFlipMutation, 'direction-flip exclusion is checked before any Binance mutation');
const positionRead = reconcileSource.indexOf('const positionsBeforeCancel = await readPositions()');
const dcaPartition = reconcileSource.indexOf('partitionCoinLevelFlipEntries(openOrders, flip, positionsBeforeCancel)');
const afterCancelRead = reconcileSource.indexOf('cancelledEntry ? await readPositions() : positionsBeforeCancel');
assert.ok(positionRead > flipGuard && positionRead < dcaPartition && dcaPartition < firstFlipMutation,
  'live Binance position and DCA classification must come before cancellation');
assert.ok(afterCancelRead > firstFlipMutation, 're-read after cancellation before position protection decisions');

const negativeTpStart = server.indexOf('async function handleNegativeTimeoutTp');
const negativeTpEnd = server.indexOf('\nconst negTpLastRun', negativeTpStart);
const negativeTpSource = server.slice(negativeTpStart, negativeTpEnd);
const negativeTpGuard = negativeTpSource.indexOf("isBinanceProtectionExcluded(symbol, 'NEGATIVE_TP_MOVE')");
const negativeTpRestRead = negativeTpSource.indexOf('client.getOpenOrders');
const negativeTpCancel = negativeTpSource.indexOf('client.cancelOrder');
const negativeTpPlace = negativeTpSource.indexOf('client.placeFuturesOrder');
assert.ok(negativeTpGuard >= 0, 'direct TP-at-entry helper has a final exclusion guard');
assert.ok(negativeTpGuard < negativeTpRestRead, 'TP-at-entry exclusion is checked before REST reads');
assert.ok(negativeTpGuard < negativeTpCancel, 'TP-at-entry exclusion is checked before stale TP cancellation');
assert.ok(negativeTpGuard < negativeTpPlace, 'TP-at-entry exclusion is checked before LIMIT placement');

console.log('coin-level observe direction flip protection tests passed');
