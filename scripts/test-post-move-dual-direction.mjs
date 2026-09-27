import assert from 'node:assert/strict';
import {
  POST_MOVE_DUAL_DIRECTION_UI_VERSION,
  buildDualDirectionKeys,
  isDualDirection,
} from '../public/post-move-dual-direction.js';

const longSnapshot = {
  timeframes: [
    { interval: '15m', items: [
      { symbol: 'BOTHUSDT', interval: '15m', status: 'CONFIRMED' },
      { symbol: 'LONGONLYUSDT', interval: '15m', status: 'BUILDING' },
      { symbol: 'WEAKLONGUSDT', interval: '15m', status: 'WEAKENED' },
    ] },
    { interval: '1h', items: [{ symbol: 'CROSSFRAMEUSDT', interval: '1h', status: 'CONFIRMED' }] },
  ],
};
const shortSnapshot = {
  timeframes: [
    { interval: '15m', items: [
      { symbol: 'BOTHUSDT', interval: '15m', status: 'BUILDING' },
      { symbol: 'WEAKLONGUSDT', interval: '15m', status: 'CONFIRMED' },
      { symbol: 'WEAKSHORTUSDT', interval: '15m', status: 'WEAKENED' },
      { symbol: 'CROSSFRAMEUSDT', interval: '15m', status: 'CONFIRMED' },
    ] },
  ],
};

const keys = buildDualDirectionKeys(longSnapshot, shortSnapshot);
assert.equal(POST_MOVE_DUAL_DIRECTION_UI_VERSION, 'POST_MOVE_DUAL_DIRECTION_UI_V1_20260924');
assert.deepEqual([...keys], ['15m|BOTHUSDT']);
assert.equal(isDualDirection({ interval: '15m', symbol: 'BOTHUSDT' }, keys), true);
assert.equal(isDualDirection({ interval: '1h', symbol: 'BOTHUSDT' }, keys), false);
assert.equal(isDualDirection({ interval: '15m', symbol: 'WEAKLONGUSDT' }, keys), false);
assert.equal(isDualDirection({ interval: '15m', symbol: 'WEAKSHORTUSDT' }, keys), false);
assert.equal(isDualDirection({ interval: '1h', symbol: 'CROSSFRAMEUSDT' }, keys), false);

console.log('post-move dual-direction tests: ok');
