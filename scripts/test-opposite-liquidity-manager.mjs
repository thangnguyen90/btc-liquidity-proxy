import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [server, html, client, css, navigation] = await Promise.all([
  read('../src/server.js'),
  read('../public/opposite-liquidity-manager.html'),
  read('../public/opposite-liquidity-manager.js'),
  read('../public/opposite-liquidity-manager.css'),
  read('../src/localAiNavigation.js'),
]);

assert.match(server, /pathname === '\/api\/opposite-liquidity-manager'/);
assert.match(server, /managementSnapshot\(\{ recentLimit: 100 \}\)/);
assert.match(server, /managementSnapshot\(\{ attemptLimit: 200 \}\)/);
assert.match(server, /pathname === '\/opposite-liquidity-manager'/);
assert.match(server, /OPPOSITE_LIQUIDITY_MANAGER_V2_MANUAL_PRICE_PUSH_20261004/);
assert.match(server, /\/api\/manual-price-push-alerts/);
assert.match(html, /id="trackRows"/);
assert.match(html, /id="recentRows"/);
assert.match(html, /id="attemptRows"/);
assert.match(html, /SCANNER READ ONLY/);
assert.match(html, /data-opposite-liquidity-push/);
assert.match(html, /id="priceAlertForm"/);
assert.match(html, /id="priceAlertRows"/);
assert.match(html, /OPPOSITE_LIQUIDITY_MANAGER_UI_V4_MANUAL_PRICE_PUSH_20261004/);
assert.match(client, /Vượt trên → LONG/);
assert.match(client, /Vượt dưới → SHORT/);
assert.match(client, /fetch\('\/api\/opposite-liquidity-manager'/);
assert.match(client, /fetch\('\/api\/manual-price-push-alerts'/);
assert.match(client, /data-price-alert-action/);
assert.match(client, /pendingIntervals/);
assert.match(client, /binanceExecution/);
assert.match(client, /snapshot\?\.retest\?\.records/);
assert.match(html, /Retest LONG · thử nghiệm/);
assert.match(server, /oppositeLiquidityRetest.snapshot\(\)/);
const retestSource = await read('../src/oppositeLiquidityRetest.js');
assert.match(retestSource, /binanceEligible: false/);
assert.doesNotMatch(retestSource, /onQualified|placeOrder|submitOrder|autoEntryControls/);
assert.match(client, /setInterval/);
assert.match(css, /\.route-grid/);
assert.match(css, /\.long\s*\{\s*color:\s*var\(--red\)/);
assert.match(css, /\.short\s*\{\s*color:\s*var\(--green\)/);
assert.match(css, /\.price-alert-form/);
assert.match(navigation, /OPPOSITE_LIQUIDITY_MANAGER_HREF/);

console.log('opposite liquidity manager page tests: OK');
