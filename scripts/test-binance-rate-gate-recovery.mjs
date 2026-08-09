import assert from 'node:assert/strict';
import { BinanceRateGate } from '../src/binanceRateGate.js';

const keepAlive = setInterval(() => {}, 1000);

const coalesceGate = new BinanceRateGate({
  limitPerMin: 1200,
  concurrency: 2,
  maxQueue: 50,
  highWatermark: 20,
  taskTimeoutMs: 5000,
  maxQueueAgeMs: 5000,
});

let executions = 0;
const request = () => coalesceGate.schedule({
  method: 'GET',
  path: '/test/coalesce',
  dedupeKey: 'test:coalesce',
}, async () => {
  executions += 1;
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { ok: true };
});

const coalesced = await Promise.all([request(), request(), request(), request()]);
assert.equal(executions, 1, 'identical pending GET requests must share one execution');
assert.ok(coalesced.every((row) => row.ok === true));

const timeoutGate = new BinanceRateGate({
  limitPerMin: 1200,
  concurrency: 1,
  maxQueue: 50,
  highWatermark: 20,
  taskTimeoutMs: 5000,
  maxQueueAgeMs: 10000,
});

await assert.rejects(
  timeoutGate.schedule({ method: 'GET', path: '/test/hang' }, () => new Promise(() => {})),
  /timed out/i,
);
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(timeoutGate.snapshot().active, 0, 'timed-out task must release the active slot');

const recovered = await timeoutGate.schedule(
  { method: 'GET', path: '/test/recovered' },
  async () => 'recovered',
);
assert.equal(recovered, 'recovered', 'gate must accept work after timing out a hung task');

clearInterval(keepAlive);
console.log('PASS binance rate gate coalescing + hung-task recovery');
