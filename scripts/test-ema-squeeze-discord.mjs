import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise only the production sender; never import/start the trading server.
const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const start = server.indexOf('function isEmaSqueezeDiscordEnabled()');
const end = server.indexOf('async function sendEma99KillReclaimDiscord(', start);
assert.ok(start > 0 && end > start);
const senderSource = server.slice(start, end);
const signals = [
  { symbol: 'TESTLONGUSDT', stage: 'SQUEEZE', action: 'LONG', interval: '15m', score: 82, grade: 'B' },
  { symbol: 'TESTSHORTUSDT', stage: 'SQUEEZE_SHORT', action: 'SHORT', interval: '5m', score: 80, grade: 'B' },
];

async function run(enabled, { webhook = true } = {}) {
  const env = { EMA_SQUEEZE_DISCORD_COOLDOWN_MS: '14400000' };
  if (webhook) env.EMA_SQUEEZE_WEBHOOK_URL = 'https://discord.invalid/test-mock-only';
  if (enabled !== undefined) env.EMA_SQUEEZE_DISCORD_ENABLED = enabled;
  const calls = [];
  const fired = new Map();
  const context = vm.createContext({
    process: { env },
    emaSqueezeDiscordFired: fired,
    console: { log() {}, warn() {} },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true }; },
  });
  vm.runInContext(senderSource, context);
  await context.sendEmaSqueezeDiscord(signals);
  await context.sendEmaSqueezeDiscord(signals);
  return { calls, fired, enabled: context.isEmaSqueezeDiscordEnabled() };
}

for (const flag of ['false', ' FALSE ', '0', '', 'invalid']) {
  const result = await run(flag);
  assert.equal(result.enabled, false);
  assert.equal(result.calls.length, 0, `Discord must not POST when disabled: ${flag}`);
  assert.equal(result.fired.size, 0, 'Muted signals must not consume Discord cooldown');
}
for (const flag of [undefined, 'true', ' TRUE ']) {
  const result = await run(flag);
  assert.equal(result.enabled, true);
  assert.equal(result.calls.length, 2, 'Legacy/re-enabled delivery keeps LONG/SHORT and dedupe');
  const titles = result.calls.map(call => JSON.parse(call.options.body).embeds[0].title);
  assert.match(titles[0], /EMA Squeeze LONG 15m/);
  assert.match(titles[1], /EMA Squeeze SHORT 5m/);
}
assert.equal((await run('true', { webhook: false })).calls.length, 0);
assert.equal((server.match(/await sendEmaSqueezeDiscord\(signals\);/g) ?? []).length, 2);
assert.equal((server.match(/await sendEmaSqueezeDiscord\(signals\);\s*await createEmaSqueezePaperTrades\(signals\);\s*await handleEmaSqueezeRealLongOrders\(signals\);/g) ?? []).length, 2,
  'Both background and HTTP scans retain independent paper/Binance execution');
assert.doesNotMatch(senderSource, /COIN_PUMP_WICK|EMA99_KILL_RECLAIM|EMA_SQUEEZE_REAL_ORDER_ENABLED/);
console.log('EMA Squeeze Discord mute: PASS (LONG/SHORT, both scan paths, legacy default, isolated delivery, no real POST/order)');
