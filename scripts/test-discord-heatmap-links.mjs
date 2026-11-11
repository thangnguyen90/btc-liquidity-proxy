import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withDiscordHeatmapLinks, wrapDiscordHeatmapLinks } from '../src/discordHeatmapLinks.js';
import { DiscordPushManager } from '../src/discordPushManager.js';

const page = 'https://liquidity.nhathadev.trade/coinglass-heatmap-lab';
const url = 'https://discord.com/api/webhooks/123/test-only';
const original = { embeds: [{ title: '🔴 IRYSUSDT · tín hiệu', fields: [{ name: 'Entry', value: '0.1' }] }], allowed_mentions: { parse: [] } };
const saved = JSON.stringify(original);
const enriched = withDiscordHeatmapLinks(original);
assert.match(enriched.content, /symbol=IRYSUSDT&range=24h/);
assert.equal(JSON.stringify(original), saved);
assert.deepEqual(enriched.embeds, original.embeds);
assert.deepEqual(withDiscordHeatmapLinks(enriched), enriched);
const multi = withDiscordHeatmapLinks({ embeds: [
  { title: 'QUSDT · SHORT', description: 'QUSDT' }, { title: '龙虾USDT · LONG' },
  { title: '1000PEPEUSDT', description: 'btcusdt' },
] });
for (const symbol of ['QUSDT', '龙虾USDT', '1000PEPEUSDT', 'BTCUSDT']) {
  assert.ok(multi.content.includes(`symbol=${encodeURIComponent(symbol)}&range=24h`));
}
assert.equal(multi.content.match(/symbol=QUSDT&/g).length, 1);
assert.match(withDiscordHeatmapLinks({ content: 'Trạng thái thị trường' }).content, /Mở Model 1\/3/);
assert.match(withDiscordHeatmapLinks({ content: 'VERSION_IRYSUSDT_INTERNAL' }).content, /Mở Model 1\/3/);
const existing = { embeds: [{ title: 'QUSDT', fields: [{ name: 'Mở', value: `[Link](${page}?symbol=QUSDT&range=24h&signal=keep)` }] }] };
assert.equal(withDiscordHeatmapLinks(existing), existing);
const full = withDiscordHeatmapLinks({ content: 'x'.repeat(2000), embeds: [{ title: 'QUSDT' }] });
assert.equal(full.content.length, 2000);
assert.match(full.embeds[0].fields[0].value, /symbol=QUSDT/);
const maxed = { content: 'QUSDT ' + 'x'.repeat(1994), embeds: [
  { description: 'x'.repeat(4096) }, { description: 'x'.repeat(1904) },
] };
const bounded = withDiscordHeatmapLinks(maxed);
assert.equal(bounded.content, maxed.content);
assert.ok(bounded.embeds.every(e => !e.fields?.length));
assert.equal(bounded.embeds.length, 2);

let delivered;
const response = { ok: true, status: 204 };
const wrapped = wrapDiscordHeatmapLinks(async (input, init) => { delivered = { input, init }; return response; });
const signal = new AbortController().signal;
const options = { method: 'POST', body: saved, signal, redirect: 'error', headers: { 'content-type': 'application/json' } };
assert.equal(await wrapped(url, options), response);
assert.match(JSON.parse(delivered.init.body).content, /IRYSUSDT/);
assert.equal(delivered.init.signal, signal);
assert.equal(delivered.init.redirect, 'error');
assert.equal(options.body, saved);
for (const target of ['https://fapi.binance.com/api/webhooks/123/test-only', 'https://discord.com.evil.example/api/webhooks/123/test-only']) {
  await wrapped(target, options);
  assert.equal(delivered.init, options);
}
await wrapped(url, { ...options, method: 'GET' });
assert.equal(delivered.init.body, saved);
await wrapped(url, { ...options, body: '{bad' });
assert.equal(delivered.init.body, '{bad');
await wrapped(new URL(url + '?wait=true'), options);
assert.match(JSON.parse(delivered.init.body).content, /IRYSUSDT/);
await wrapped(new Request(url, { method: 'POST' }), options);
assert.match(JSON.parse(delivered.init.body).content, /IRYSUSDT/);
// Preserve upstream Push content hashes and its original message, even when delivery is enriched.
const manager = new DiscordPushManager({ routes: [], webPushService: {} });
let observed;
manager.observeSuccessfulDiscordPost = async item => { observed = item; };
await manager.wrapFetch(wrapped)(url, options);
await new Promise(resolve => setImmediate(resolve));
assert.equal(observed.body, saved);
assert.match(JSON.parse(delivered.init.body).content, /IRYSUSDT/);
let calls = 0;
await assert.rejects(wrapDiscordHeatmapLinks(async () => { calls++; throw Error('network'); })(url, options), /network/);
assert.equal(calls, 1);
const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.ok(server.includes('discordPushManager.wrapFetch(wrapDiscordHeatmapLinks(fetchBeforeDiscordPushBridge))'));
console.log('PASS Discord all-route Model 1/3 links, Unicode/multi-coin/dedupe/limits/transport/Push isolation');
