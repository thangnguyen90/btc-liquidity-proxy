import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  collectPostMoveDualDirections,
  evaluatePostMoveDualDirectionPosition,
  postMovePositionPnl,
  POST_MOVE_DUAL_DIRECTION_PROFIT_CLOSE_VERSION,
} from '../src/postMoveDualDirectionProfitClose.js';

const longSnapshot = { timeframes: [
  { interval: '15m', items: [
    { symbol: 'BOTHUSDT', status: 'CONFIRMED' },
    { symbol: 'LONGONLYUSDT', status: 'BUILDING' },
    { symbol: 'WEAKUSDT', status: 'WEAKENED' },
  ] },
  { interval: '1h', items: [{ symbol: 'MULTIUSDT', status: 'BUILDING' }] },
] };
const shortSnapshot = { timeframes: [
  { interval: '15m', items: [
    { symbol: 'BOTHUSDT', status: 'BUILDING' },
    { symbol: 'MULTIUSDT', status: 'CONFIRMED' },
    { symbol: 'WEAKUSDT', status: 'CONFIRMED' },
  ] },
  { interval: '1h', items: [{ symbol: 'MULTIUSDT', status: 'CONFIRMED' }] },
] };

const dual = collectPostMoveDualDirections(longSnapshot, shortSnapshot);
assert.equal(POST_MOVE_DUAL_DIRECTION_PROFIT_CLOSE_VERSION, 'POST_MOVE_DUAL_DIRECTION_POSITIVE_PNL_CLOSE_V1_20260924');
assert.deepEqual([...dual.keys()], ['BOTHUSDT', 'MULTIUSDT']);
assert.deepEqual(dual.get('BOTHUSDT').intervals, ['15m']);
assert.deepEqual(dual.get('MULTIUSDT').intervals, ['1h'], 'different timeframes must not create a dual match');
assert.equal(dual.has('WEAKUSDT'), false);

assert.equal(evaluatePostMoveDualDirectionPosition({
  dualDirections: dual,
  position: { symbol: 'BOTHUSDT', positionAmt: '10', entryPrice: '1', markPrice: '1.01' },
}).action, 'CLOSE_MARKET');
assert.equal(evaluatePostMoveDualDirectionPosition({
  dualDirections: dual,
  position: { symbol: 'BOTHUSDT', positionAmt: '-10', entryPrice: '1', markPrice: '0.99' },
}).action, 'CLOSE_MARKET');
assert.equal(evaluatePostMoveDualDirectionPosition({
  dualDirections: dual,
  position: { symbol: 'BOTHUSDT', positionAmt: '10', entryPrice: '1', markPrice: '1' },
}).action, 'HOLD_NON_POSITIVE');
assert.equal(evaluatePostMoveDualDirectionPosition({
  dualDirections: dual,
  position: { symbol: 'BOTHUSDT', positionAmt: '10', entryPrice: '1', markPrice: '0.99' },
}).action, 'HOLD_NON_POSITIVE');
assert.equal(evaluatePostMoveDualDirectionPosition({
  dualDirections: dual,
  position: { symbol: 'LONGONLYUSDT', positionAmt: '10', unRealizedProfit: '3' },
}).action, 'IGNORE');
assert.ok(Math.abs(postMovePositionPnl({ positionAmt: '-2', entryPrice: '10' }, 9) - 2) < 1e-9);

const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(server, /reconcilePostMoveDualDirectionProfitClose/);
assert.match(server, /requirePositiveUnrealizedPnl/);
assert.match(server, /POST_MOVE_DUAL_DIRECTION_PROFIT_CLOSE_VERSION/);

console.log('post-move dual-direction positive-PnL close tests passed');
