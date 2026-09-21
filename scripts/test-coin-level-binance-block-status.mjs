import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCoinLevelBinanceBlockStatus, COIN_LEVEL_BINANCE_BLOCK_STATUS_VERSION } from '../public/coin-level-binance-block-status.js';

const now = Date.UTC(2026, 8, 20, 12);
const clearGate = { blockedUntil: 0, blockReason: '', authBlockedUntil: 0, authBlocks: [], congested: false, queue: 0, highWatermark: 700 };
const read = (gate, analyzeGate = clearGate) => buildCoinLevelBinanceBlockStatus({ gate, analyzeGate, scannedAt: now }, now);

assert.equal(read(clearGate).version, COIN_LEVEL_BINANCE_BLOCK_STATUS_VERSION);
assert.equal(read(clearGate).state, 'CLEAR');
assert.equal(read(clearGate).blocks.length, 0);

const limited = read({ ...clearGate, blockedUntil: now + 60_000, blockReason: 'Binance 429' });
assert.equal(limited.state, 'BLOCKED');
assert.equal(limited.blocks[0].type, 'HTTP_429');
assert.equal(limited.blocks[0].scope, 'REST chung');
assert.equal(limited.blocks[0].until, now + 60_000);

const banned = read(clearGate, { ...clearGate, blockedUntil: now + 120_000, blockReason: 'Binance 418' });
assert.equal(banned.blocks[0].type, 'HTTP_418');
assert.equal(banned.blocks[0].scope, 'REST phân tích');

const auth = read({ ...clearGate, authBlockedUntil: now + 120_000, authBlocks: [{ blockedUntil: now + 120_000, nextProbeAt: now + 30_000, reason: '-2015 Invalid API-key, IP, or permissions', source: 'position-monitor' }] });
assert.equal(auth.state, 'BLOCKED');
assert.equal(auth.blocks.length, 1);
assert.equal(auth.blocks[0].type, 'AUTH');
assert.equal(auth.blocks[0].nextProbeAt, now + 30_000);
assert.match(auth.blocks[0].reason, /-2015/);

assert.equal(read({ ...clearGate, blockedUntil: now - 1, blockReason: 'Binance 429' }).state, 'CLEAR');
const busy = read({ ...clearGate, congested: true, queue: 725 });
assert.equal(busy.state, 'CONGESTED');
assert.equal(busy.blocks.length, 0);
assert.equal(busy.queues[0].queued, 725);
assert.equal(buildCoinLevelBinanceBlockStatus(null, now).state, 'UNKNOWN');
assert.equal(buildCoinLevelBinanceBlockStatus({ gate: clearGate }, now).state, 'UNKNOWN');
assert.equal(buildCoinLevelBinanceBlockStatus({ gate: {}, analyzeGate: clearGate }, now).state, 'UNKNOWN');

const [html, client, server] = await Promise.all([
  readFile(new URL('../public/coin-level-analysis.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
]);
assert.match(html, /id="binance-block-panel"/);
assert.match(html, /id="binance-coin-issue"/);
assert.match(client, /\/api\/binance-rate-gate/);
assert.match(client, /showCoinBinanceIssue\(data\.symbol/);
assert.match(client, /showCoinBinanceIssue\(normalized, error\.message\)/);
assert.match(server, /requestUrl\.pathname === '\/api\/binance-rate-gate'/);
console.log('coin-level Binance block status: OK');
