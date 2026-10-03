import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import {
  injectOppositeLiquidityToast,
  OPPOSITE_LIQUIDITY_TOAST_VERSION,
} from '../src/oppositeLiquidityToast.js';

const publicDir = new URL('../public/', import.meta.url);
const htmlFiles = (await readdir(publicDir)).filter(name => name.endsWith('.html'));
for (const name of htmlFiles) {
  const source = await readFile(new URL(name, publicDir), 'utf8');
  const rendered = injectOppositeLiquidityToast(source);
  assert.equal((rendered.match(/\/opposite-liquidity-toast\.css\?v=20261004-4/g) ?? []).length, 1,
    `${name} must load the opposite-liquidity toast stylesheet once`);
  assert.equal((rendered.match(/\/opposite-liquidity-toast\.js\?v=20261004-4/g) ?? []).length, 1,
    `${name} must load the opposite-liquidity toast client once`);
  assert.equal((rendered.match(/\/opposite-liquidity\.webmanifest\?v=20261004-1/g) ?? []).length, 1,
    `${name} must expose one PWA manifest`);
  assert.equal(injectOppositeLiquidityToast(rendered), rendered, `${name} toast injection must be idempotent`);
}

const [client, css, serviceWorker, managerHtml, manifest, icon, server] = await Promise.all([
  readFile(new URL('../public/opposite-liquidity-toast.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/opposite-liquidity-toast.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/opposite-liquidity-push-sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/opposite-liquidity-manager.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/opposite-liquidity.webmanifest', import.meta.url), 'utf8'),
  readFile(new URL('../public/opposite-liquidity-icon.svg', import.meta.url), 'utf8'),
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
]);
assert.match(OPPOSITE_LIQUIDITY_TOAST_VERSION, /SITEWIDE_TOAST_V4_TRUE_WEB_PUSH_PWA/);
assert.match(client, /scanner\?\.browserNotifications/);
assert.match(client, /\/api\/opposite-liquidity-manager/);
assert.match(client, /FIRST_LOAD_RECENT_MS/);
assert.match(client, /Binance:/);
assert.match(client, /Notification\.requestPermission\(\)/);
assert.match(client, /registration\.showNotification/);
assert.match(client, /registration\.pushManager\.subscribe/);
assert.match(client, /registration\.pushManager\.getSubscription/);
assert.match(client, /applicationServerKey/);
assert.match(client, /\/api\/opposite-liquidity-web-push\/subscriptions/);
assert.match(client, /iPhone\/iPad: Safari/);
assert.match(client, /side === 'LONG' \? '🔴' : '🟢'/);
assert.match(client, /LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH:/);
assert.match(client, /serviceWorker\.register/);
assert.doesNotMatch(client, /ai-signal-review|priority-engine-zone/i,
  'toast client must not subscribe to unrelated signal types');
assert.match(css, /\.opposite-liquidity-toast-stack/);
assert.match(css, /\.opposite-liquidity-toast\.is-long/);
assert.match(serviceWorker, /LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH/);
assert.match(serviceWorker, /addEventListener\('push'/);
assert.match(serviceWorker, /registration\.showNotification/);
assert.match(serviceWorker, /notificationclick/);
assert.match(managerHtml, /data-opposite-liquidity-push/);
assert.match(managerHtml, /data-opposite-liquidity-push-help/);
assert.equal(JSON.parse(manifest).start_url, '/opposite-liquidity-manager');
assert.match(manifest, /opposite-liquidity-icon\.svg/);
assert.match(icon, /<svg/);
assert.match(server, /injectOppositeLiquidityToast\(html\)/);
assert.match(server, /OppositeLiquidityWebPushService/);
assert.match(server, /\/api\/opposite-liquidity-web-push\/config/);
assert.match(server, /\/api\/opposite-liquidity-web-push\/subscriptions/);

console.log(`opposite liquidity site-wide toast: ${htmlFiles.length}/${htmlFiles.length} HTML pages covered`);
