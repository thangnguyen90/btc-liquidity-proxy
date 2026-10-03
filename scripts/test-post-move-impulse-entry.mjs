import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureImpulseEntry, evaluateImpulseEntry, validateImpulseEntryLive, impulseEntryBtcContext } from '../src/postMoveImpulseEntry.js';
import { PostMoveImpulseEntryTracker } from '../src/postMoveImpulseEntryTracker.js';
import { IMPULSE_ENTRY_VERSION, impulseEntryCardKey } from '../public/impulse-entry-model.js';
import { normalizeLiquidLiveCardKey, liquidLiveCardKeysOfTrade, matchLiveCardWhitelistKeys } from '../src/liquidLiveCardWhitelist.js';
import { isBinanceCardAvgRoeEligible } from '../public/binance-card-visibility.js';

const barMs = 300_000, start = 1790000000000;
function fixture(side = 'LONG', method = 'RETEST') {
  const prior = Array.from({ length: 40 }, (_, i) => ({
    open: 100, high: i === 5 ? 110 : 100.5, low: 99.5, close: 100, closeTime: start + i * barMs,
  }));
  const impulseAt = start + 40 * barMs;
  const impulse = { open: 100, high: 103, low: 99.8, close: 102, closeTime: impulseAt };
  const follow = method === 'RETEST' ? [
    { open: 101.4, high: 102, low: 100.9, close: 101.7 },
    { open: 101.7, high: 103.2, low: 101.6, close: 103.1 },
  ] : [
    { open: 102.1, high: 102.5, low: 102, close: 102.2 },
    { open: 102.2, high: 102.6, low: 102.1, close: 102.3 },
    { open: 102.3, high: 103.3, low: 102.2, close: 103.1 },
  ];
  const mirror = r => side === 'LONG' ? r : { ...r, open: 200 - r.open, high: 200 - r.low, low: 200 - r.high, close: 200 - r.close };
  const rows = [...prior, impulse, ...follow.map((r, i) => ({ ...r, closeTime: impulseAt + (i + 1) * barMs }))].map(mirror);
  const watch = { symbol: 'TESTUSDT', side, stage: side === 'LONG' ? 'BUY_IMPULSE' : 'SELL_IMPULSE',
    watchOnly: true, binanceEligible: false, impulseAt, observedAt: impulseAt,
    accumulationBaseHigh: 101, distributionBaseLow: 99, invalidationPrice: side === 'LONG' ? 99 : 101,
    retestZone: side === 'LONG' ? { low: 100.8, high: 101.2 } : { low: 98.8, high: 99.2 } };
  const setup = captureImpulseEntry(watch, rows, impulseAt + 1);
  return { rows, watch, setup, impulseAt, now: rows.at(-1).closeTime + 1000 };
}

for (const side of ['LONG', 'SHORT']) {
  for (const method of ['RETEST', 'BASE_BREAK']) {
    const f = fixture(side, method);
    assert(f.setup);
    const result = evaluateImpulseEntry(f.setup, f.rows, f.now);
    assert.equal(result.status, 'READY', `${side} ${method}`);
    assert.equal(result.plan.method, method);
    assert(result.plan.rr >= 1.5);
    assert.equal(validateImpulseEntryLive(f.setup, result.plan, { price: f.rows.at(-1).close, at: f.now }, f.now), 'PASS');
    // The same open/current candle must never confirm a pattern.
    assert.equal(evaluateImpulseEntry(f.setup, f.rows, f.rows.at(-1).closeTime).status, 'WAITING');
    const future = { ...f.rows.at(-1), closeTime: f.now + barMs, high: 1000, low: 0.01 };
    assert.deepEqual(evaluateImpulseEntry(f.setup, [...f.rows, future], f.now), result);
    assert.equal(validateImpulseEntryLive(f.setup, result.plan, null, f.now), 'WAIT_LIVE');
    assert.equal(validateImpulseEntryLive(f.setup, result.plan, { price: result.plan.entry, at: f.now - 15001 }, f.now), 'WAIT_LIVE');
    assert.equal(validateImpulseEntryLive(f.setup, result.plan, { price: result.plan.entry, at: f.now + 1 }, f.now), 'WAIT_LIVE');
    const chase = result.plan.entry + (side === 'LONG' ? 1 : -1) * f.setup.atr;
    assert.equal(validateImpulseEntryLive(f.setup, result.plan, { price: chase, at: f.now }, f.now), 'PRICE_TOO_FAR');
    assert.equal(validateImpulseEntryLive(f.setup, result.plan, { price: result.plan.stop, at: f.now }, f.now), 'STOP_BROKEN');
    assert.equal(validateImpulseEntryLive(f.setup, result.plan, { price: result.plan.trigger, at: f.now }, f.now), 'TRIGGER_LOST');
    assert.equal(validateImpulseEntryLive(f.setup, result.plan, {}, f.now + 90001), 'PASS_EXPIRED');
  }
}
const f = fixture();
assert.equal(captureImpulseEntry({ ...f.watch, stage: 'NO_SELL_CONFIRMATION' }, f.rows, f.now), null);
assert.equal(captureImpulseEntry({ ...f.watch, stage: 'LATE_NO_CHASE' }, f.rows, f.now), null);
assert.equal(captureImpulseEntry({ ...f.watch, binanceEligible: true }, f.rows, f.now), null);
const noTarget = evaluateImpulseEntry({ ...f.setup, targets: [] }, f.rows, f.now);
assert.equal(noTarget.status, 'WAITING');
assert.equal(noTarget.reason, 'INSUFFICIENT_TARGET_ROOM');
const nearTarget = evaluateImpulseEntry({ ...f.setup, targets: [103.15, 110] }, f.rows, f.now);
assert.equal(nearTarget.status, 'WAITING', 'cannot skip nearest resistance');
const broken = structuredClone(f.rows);
broken[41].low = 98;
assert.equal(evaluateImpulseEntry(f.setup, broken, f.now).status, 'INVALIDATED');
assert.equal(evaluateImpulseEntry(f.setup, f.rows.filter((_, i) => i !== 41), f.now).reason, 'DATA_GAP');
assert.equal(evaluateImpulseEntry(f.setup, f.rows.slice(0, 41), f.setup.expiresAt + 1).status, 'EXPIRED');
assert.equal(impulseEntryBtcContext([], f.now, 'LONG').direction, 'UNKNOWN');
const rising = Array.from({ length: 13 }, (_, i) => ({ open: 100+i, high: 101+i, low: 99+i, close:100+i, closeTime:f.impulseAt+(i-12)*barMs }));
assert.equal(impulseEntryBtcContext(rising, f.impulseAt+1, 'LONG').alignment, 'ALIGNED');
assert.equal(impulseEntryBtcContext(rising, f.impulseAt+1, 'SHORT').alignment, 'OPPOSED');

for (const side of ['LONG', 'SHORT']) for (const method of ['RETEST', 'BASE_BREAK']) {
  const key = impulseEntryCardKey(side, method);
  assert.equal(normalizeLiquidLiveCardKey(key), key);
  const tradeKeys = liquidLiveCardKeysOfTrade({ side, impulseEntryObservation: { version: IMPULSE_ENTRY_VERSION, side, method } });
  assert(tradeKeys.includes(key));
  assert.equal(matchLiveCardWhitelistKeys(tradeKeys, []).allowed, false);
  assert.equal(matchLiveCardWhitelistKeys(tradeKeys, [key]).allowed, true);
  assert(!liquidLiveCardKeysOfTrade({ side, impulseEntryObservation: { side, method, version: 'old' } }).includes(key));
}
assert.equal(normalizeLiquidLiveCardKey('btc-session:ENTRY:LONG:UNKNOWN'), null);
assert.equal(isBinanceCardAvgRoeEligible(null), false);
assert.equal(isBinanceCardAvgRoeEligible(4), false);
assert.equal(isBinanceCardAvgRoeEligible(4.01), true);

const dir = await mkdtemp(join(tmpdir(), 'impulse-entry-test-'));
try {
  let now = f.impulseAt - 1000;
  const messages = [];
  const args = { stateFile: join(dir, 'state.json'), now: () => now,
    webhookUrl: () => 'https://discord.com/api/webhooks/test/token',
    fetchImpl: async (_url, req) => { messages.push(JSON.parse(req.body)); return { ok: true }; } };
  const tracker = new PostMoveImpulseEntryTracker(args);
  const input = { watches: [f.watch], getRows: () => f.rows,
    getQuote: () => ({ price: 103.1, at: now }), btcRows: [] };
  now = f.impulseAt + 1;
  await tracker.process(input);
  assert.equal(messages.length, 0, 'raw impulse must not send');
  assert.equal(tracker.snapshot().counts.WAITING, 1);
  now = f.now;
  await tracker.process({ ...input, watches: [] });
  assert.equal(messages.length, 1, 'retained impulse survives absence from scanner');
  assert.match(messages[0].embeds[0].title, /ĐẠT ĐIỂM VÀO/);
  assert.equal(messages[0].embeds[0].color, 0x2ecc71);
  await tracker.process(input);
  assert.equal(messages.length, 1, 'no repeat on next tick');
  const restarted = new PostMoveImpulseEntryTracker(args);
  await restarted.process(input);
  assert.equal(messages.length, 1, 'no repeat after restart');
  assert.equal(JSON.parse(await readFile(args.stateFile, 'utf8')).records[0].status, 'SENT');
  const fresh = new PostMoveImpulseEntryTracker({ ...args, stateFile: join(dir, 'fresh.json') });
  await fresh.process(input);
  assert.equal(fresh.snapshot().records.length, 0, 'new tracker never imports old impulse');

  // Pending setup can survive restart and pass after startup, but cannot replay an old pass.
  now = f.impulseAt - 1000;
  const pendingArgs = { ...args, stateFile: join(dir, 'pending.json') };
  const pending = new PostMoveImpulseEntryTracker(pendingArgs);
  now = f.impulseAt + 1;
  await pending.process(input);
  now = f.impulseAt + barMs;
  const resumed = new PostMoveImpulseEntryTracker(pendingArgs);
  now = f.now;
  await resumed.process({ ...input, watches: [] });
  assert.equal(resumed.snapshot().counts.SENT, 1);

  now = f.impulseAt - 1000;
  let calls = 0;
  const rateArgs = { ...args, stateFile: join(dir, 'rate.json'), fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? { ok: false, status: 429, json: async () => ({ retry_after: 10 }) } : { ok: true };
  } };
  const rate = new PostMoveImpulseEntryTracker(rateArgs);
  now = f.impulseAt + 1; await rate.process(input);
  now = f.now; await rate.process(input);
  now += 1000; await rate.process(input); assert.equal(calls, 1);
  now += 10000; await rate.process(input); assert.equal(calls, 2);
  assert.equal(rate.snapshot().counts.SENT, 1);

  now = f.impulseAt - 1000;
  let networkCalls = 0;
  const uncertain = new PostMoveImpulseEntryTracker({ ...args, stateFile: join(dir, 'uncertain.json'),
    fetchImpl: async () => { networkCalls += 1; throw new Error('timeout'); } });
  now = f.impulseAt + 1; await uncertain.process(input);
  now = f.now; await uncertain.process(input); await uncertain.process(input);
  assert.equal(networkCalls, 1);
  assert.equal(uncertain.snapshot().counts.DELIVERY_UNKNOWN, 1);
} finally { await rm(dir, { recursive: true, force: true }); }

console.log('Impulse entry: mirrored retest/base, causal candles, live/RR, persistence, Discord and whitelist checks passed');
