import assert from 'node:assert/strict';
import { shouldAcceptLastPriceTick } from '../src/aggTradeTicker.js';
import { resolveEmaWarmupReadyTarget, warmupRetryDelayMs } from '../src/klineWarmupPolicy.js';
import { watchdogStartupGraceRemainingMs } from '../src/runtimeWatchdogPolicy.js';

assert.equal(resolveEmaWarmupReadyTarget(179, {
  configuredMinReady: 250,
  readyRatio: 0.95,
}), 171);
assert.equal(resolveEmaWarmupReadyTarget(179, {
  configuredMinReady: 170,
  readyRatio: 0.95,
}), 170);
assert.equal(resolveEmaWarmupReadyTarget(0, {
  configuredMinReady: 250,
  readyRatio: 0.95,
}), 0);

assert.equal(warmupRetryDelayMs(0, { baseMs: 90_000, maxMs: 900_000 }), 90_000);
assert.equal(warmupRetryDelayMs(1, { baseMs: 90_000, maxMs: 900_000 }), 180_000);
assert.equal(warmupRetryDelayMs(9, { baseMs: 90_000, maxMs: 900_000 }), 900_000);

assert.equal(shouldAcceptLastPriceTick({
  receivedAt: 12_100,
  eventTime: 10_000,
  lastEventTime: 9_000,
}), true, '2.1s event-loop delay must not freeze active marks');
assert.equal(shouldAcceptLastPriceTick({
  receivedAt: 21_000,
  eventTime: 10_000,
  lastEventTime: 9_000,
}), false, 'events older than 10s remain rejected');
assert.equal(shouldAcceptLastPriceTick({
  receivedAt: 12_000,
  eventTime: 8_999,
  lastEventTime: 9_000,
}), false, 'out-of-order prices remain rejected');

assert.equal(watchdogStartupGraceRemainingMs({
  now: 1_000_000,
  processStartedAt: 900_000,
  startupGraceMs: 3_600_000,
}), 3_500_000, 'external PM2 restarts must receive the full target startup grace');
assert.equal(watchdogStartupGraceRemainingMs({
  now: 5_000_000,
  processStartedAt: 900_000,
  startupGraceMs: 3_600_000,
}), 0, 'watchdog resumes checks after startup grace');

console.log('Runtime feed recovery policy tests passed.');
