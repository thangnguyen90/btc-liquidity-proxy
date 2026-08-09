import assert from 'node:assert/strict';
import { BinanceAuthBlockedError, BinanceRateGate } from '../src/binanceRateGate.js';

process.env.BINANCE_AUTH_FAILURE_BLOCK_MS = '60000';

const gate = new BinanceRateGate({
  limitPerMin: 1200,
  concurrency: 1,
  authRecoveryProbeMs: 20,
});

const failingRequest = gate.schedule({
  requiresAuth: true,
  authScope: 'old-session-key',
  source: 'auth-failure-test',
}, async () => {
    const error = new Error('Invalid API-key, IP, or permissions for action');
    error.code = -2015;
    throw error;
  });
const failingAssertion = assert.rejects(
  failingRequest,
  /Invalid API-key/,
);
await gate._pumpNow();
await failingAssertion;
await new Promise((resolve) => setImmediate(resolve));

await assert.rejects(
  gate.schedule({
    requiresAuth: true,
    authScope: 'old-session-key',
    source: 'auth-block-test',
  }, async () => 'must-not-run'),
  (error) => error instanceof BinanceAuthBlockedError && error.code === -2015,
);
await new Promise((resolve) => setImmediate(resolve));

const publicRequest = gate.schedule({ source: 'public-market-test' }, async () => 'public-ok');
await gate._pumpNow();
assert.equal(
  await publicRequest,
  'public-ok',
  'public market requests must remain available while signed REST is blocked',
);
await new Promise((resolve) => setImmediate(resolve));

const validCredentialRequest = gate.schedule({
  requiresAuth: true,
  authScope: 'valid-env-key',
  source: 'valid-env-test',
}, async () => 'signed-ok');
await gate._pumpNow();
assert.equal(
  await validCredentialRequest,
  'signed-ok',
  'one invalid credential must not block a different API key',
);
await new Promise((resolve) => setImmediate(resolve));

assert.ok(gate.snapshot().authBlockedUntil > Date.now());
assert.deepEqual(
  gate.snapshot().authBlocks.map((row) => row.scope),
  ['old-session-key'],
);
assert.ok(
  Number(gate.snapshot().authBlocks[0]?.openedAt) > 0,
  'auth snapshot must expose the stable circuit openedAt for Discord dedupe',
);

await new Promise((resolve) => setTimeout(resolve, 25));
const recoveredRequest = gate.schedule({
  requiresAuth: true,
  authScope: 'old-session-key',
  source: 'auth-recovery-test',
}, async () => 'recovered');
await gate._pumpNow();
assert.equal(await recoveredRequest, 'recovered');
assert.equal(gate.snapshot().authBlockedUntil, 0, 'successful probe must close the credential circuit early');
console.log('Binance auth circuit test passed.');
