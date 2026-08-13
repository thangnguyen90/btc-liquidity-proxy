import assert from 'node:assert/strict';
import { hasOpenProtectionOrder, isOpenProtectionOrder } from '../src/protectionOrderGuard.js';

const regularTp = {
  symbol: 'BTCUSDT',
  side: 'SELL',
  type: 'TAKE_PROFIT_MARKET',
  positionSide: 'BOTH',
};
const algoSl = {
  symbol: 'BTCUSDT',
  side: 'SELL',
  orderType: 'STOP_MARKET',
  positionSide: 'LONG',
};

assert.equal(isOpenProtectionOrder(regularTp, {
  symbol: 'BTCUSDT', closeSide: 'SELL', positionSide: 'BOTH', kind: 'TP',
}), true);
assert.equal(hasOpenProtectionOrder([regularTp], [], {
  symbol: 'BTCUSDT', closeSide: 'SELL', positionSide: 'BOTH', kind: 'TP',
}), true);
assert.equal(hasOpenProtectionOrder([], [algoSl], {
  symbol: 'BTCUSDT', closeSide: 'SELL', positionSide: 'LONG', kind: 'SL',
}), true);
assert.equal(hasOpenProtectionOrder([], [algoSl], {
  symbol: 'BTCUSDT', closeSide: 'BUY', positionSide: 'LONG', kind: 'SL',
}), false, 'opposite close side must not protect the position');
assert.equal(hasOpenProtectionOrder([], [algoSl], {
  symbol: 'BTCUSDT', closeSide: 'SELL', positionSide: 'SHORT', kind: 'SL',
}), false, 'hedge-mode position side must match');
assert.equal(hasOpenProtectionOrder([], [algoSl], {
  symbol: 'BTCUSDT', closeSide: 'SELL', positionSide: 'BOTH', kind: 'SL',
}), false, 'one-way mode must not accept a hedge-side order');
assert.equal(hasOpenProtectionOrder([{ ...regularTp, type: 'LIMIT' }], [], {
  symbol: 'BTCUSDT', closeSide: 'SELL', positionSide: 'BOTH', kind: 'TP',
}), false, 'ordinary limit orders are not TP protection');

console.log('protection order idempotency tests passed');
