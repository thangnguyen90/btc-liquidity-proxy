import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [server, html, client, css, navigation, worker] = await Promise.all([
  read('../src/server.js'),
  read('../public/push-signal-manager.html'),
  read('../public/push-signal-manager.js'),
  read('../public/push-signal-manager.css'),
  read('../src/localAiNavigation.js'),
  read('../public/opposite-liquidity-push-sw.js'),
]);

assert.match(server, /DiscordPushManager/);
assert.match(server, /buildDiscordPushRouteCatalog\(process\.env\)/);
assert.match(server, /discordPushManager\.wrapFetch/);
assert.match(server, /pathname === '\/api\/discord-push-manager'/);
assert.match(server, /pathname === '\/api\/discord-push-manager\/routes'/);
assert.match(server, /pathname === '\/push-signal-manager'/);
assert.match(html, /id="routes"/);
assert.match(html, /data-opposite-liquidity-push/);
assert.match(html, /CHỈ ĐIỀU KHIỂN WEB PUSH/);
assert.match(html, /DISCORD_PUSH_MANAGER_UI_V1_20261004/);
assert.match(client, /fetch\('\/api\/discord-push-manager'/);
assert.match(client, /fetch\('\/api\/discord-push-manager\/routes'/);
assert.match(client, /data-route-id/);
assert.match(css, /\.route-card/);
assert.match(navigation, /PUSH_SIGNAL_MANAGER_HREF/);
assert.match(worker, /DISCORD_ROUTE_PREFIX/);

console.log('push signal manager page tests: OK');
