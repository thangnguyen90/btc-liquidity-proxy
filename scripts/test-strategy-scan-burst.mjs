import assert from 'node:assert/strict';
import {
  STRATEGY_SCAN_CANDLE_CLOSE_BURST_VERSION,
  createBurstCoalescer,
} from '../src/burstCoalescer.js';

let clock = 1_000;
let callbackRuns = 0;
const pending = [];
const gate = createBurstCoalescer(() => { callbackRuns += 1; }, {
  delayMs: 1_200,
  cooldownMs: 30_000,
  now: () => clock,
  setTimer: (fn, ms) => {
    const handle = { fn, ms, unref() {} };
    pending.push(handle);
    return handle;
  },
  clearTimer: (handle) => {
    const index = pending.indexOf(handle);
    if (index >= 0) pending.splice(index, 1);
  },
});

assert.match(STRATEGY_SCAN_CANDLE_CLOSE_BURST_VERSION, /V1_20260926$/);
assert.equal(gate.schedule(), true);
for (let index = 0; index < 500; index += 1) assert.equal(gate.schedule(), false);
assert.equal(pending.length, 1, '500 close events must produce one scheduled scan');
assert.equal(callbackRuns, 0);

pending.shift().fn();
assert.equal(callbackRuns, 1);
assert.equal(gate.schedule(), false, 'cooldown must block a second burst');

clock += 30_001;
assert.equal(gate.schedule(), true);
assert.equal(pending.length, 1);
pending.shift().fn();
assert.equal(callbackRuns, 2);

console.log('strategy scan candle-close burst tests passed');
