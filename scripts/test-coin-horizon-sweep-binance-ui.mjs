import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import {
  COIN_HORIZON_LOWER_ROUTE,
  COIN_HORIZON_SWEEP_ROUTES,
  COIN_HORIZON_UPPER_ROUTE,
} from '../src/coinHorizonSweepBinance.js';
import { COINGLASS_HYBRID_LIQUIDITY_ROUTES } from '../src/coinglassHybridLiquidityBinance.js';

const dir = await mkdtemp(join(tmpdir(), 'horizon-binance-ui-'));
const controls = new AutoEntryControls(join(dir, 'fixture.json'));
controls.seed([...COIN_HORIZON_SWEEP_ROUTES, ...COINGLASS_HYBRID_LIQUIDITY_ROUTES]);
const localLibs = join(process.cwd(), '.playwright-libs', 'root', 'usr', 'lib', 'x86_64-linux-gnu');
const libraryPath = [existsSync(localLibs) ? localLibs : '', process.env.LD_LIBRARY_PATH ?? ''].filter(Boolean).join(':');
const browser = await chromium.launch({ headless: true, env: { ...process.env, ...(libraryPath ? { LD_LIBRARY_PATH: libraryPath } : {}) } });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  const writes = [];
  await page.route('**/*', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/auto-entry-controls') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON(); writes.push(body); controls.update(body);
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        ...controls.read(), canEdit: true, dailyStats: { date: '2026-09-13', totals: {}, routes: {} },
      }) });
    }
    const files = { '/binance-auto-controls': 'binance-auto-controls.html', '/binance-auto-controls.js': 'binance-auto-controls.js', '/binance-auto-controls.css': 'binance-auto-controls.css' };
    if (!files[path]) return route.fulfill({ status: 403, body: 'Network disabled in test' });
    return route.fulfill({ contentType: path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html',
      body: await readFile(join(process.cwd(), 'public', files[path]), 'utf8') });
  });
  await page.goto('http://controls.test/binance-auto-controls');
  const upperRow = page.locator('#routes tr').filter({ has: page.locator('input[aria-label^="UPPER LONG coin-horizon"]') });
  const lowerRow = page.locator('#routes tr').filter({ has: page.locator('input[aria-label^="LOWER SHORT coin-horizon"]') });
  await upperRow.waitFor(); await lowerRow.waitFor();
  assert.equal(await upperRow.locator('input[type=checkbox]').isChecked(), false);
  assert.equal(await lowerRow.locator('input[type=checkbox]').isChecked(), false);
  assert.match(await upperRow.textContent(), /LONG MARKET/);
  assert.match(await lowerRow.textContent(), /SHORT MARKET/);
  assert.match(await upperRow.textContent(), /TP động/);
  assert.match(await lowerRow.textContent(), /SL −25% ROE/);
  assert.equal(await upperRow.locator('input[type=number]').count(), 2, 'Horizon exposes margin and leverage inputs');
  assert.equal(await upperRow.locator('input[aria-label^="TP ROE"]').count(), 0, 'dynamic Horizon TP has no fake fixed-TP input');
  const hybridRow = page.locator('#routes tr').filter({ hasText: 'HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY' }).first();
  assert.equal(await hybridRow.locator('input[type=number]').count(), 3, 'fixed-TP other route exposes margin, leverage and TP inputs');
  const hybridOrder = await page.locator('#routes tr').evaluateAll((rows) => rows
    .filter((row) => row.textContent.includes('coinglass-hybrid-liquidity'))
    .map((row) => `${row.children[1].firstChild.textContent}:${row.children[0].firstChild.textContent}`));
  assert.deepEqual(hybridOrder, [
    'primary:HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY',
    'primary:HYBRID_LOWER_FIRST_LONG_FLUSH_READY',
    'secondary:HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY',
    'secondary:HYBRID_LOWER_FIRST_LONG_FLUSH_READY',
  ], 'UPPER/LOWER are adjacent within each Hybrid stream');
  assert.equal(await page.locator('#horizon-draft-toggle').count(), 0);

  await upperRow.locator('input[type=checkbox]').check();
  await page.waitForFunction(() => [...document.querySelectorAll('#routes tr')]
    .some((row) => row.querySelector('input[aria-label^="UPPER LONG coin-horizon"]') && row.textContent.includes('ON')));
  assert.equal(controls.read().routes[entryRoute(COIN_HORIZON_UPPER_ROUTE).key].enabled, true);
  assert.equal(controls.read().routes[entryRoute(COIN_HORIZON_LOWER_ROUTE).key].enabled, false);
  assert.equal(controls.read().enabled, false, 'route checkbox does not silently enable master');
  await page.reload();
  const reloadedUpper = page.locator('#routes tr').filter({ has: page.locator('input[aria-label^="UPPER LONG coin-horizon"]') });
  await reloadedUpper.waitFor();
  assert.equal(await reloadedUpper.locator('input[type=checkbox]').isChecked(), true);
  assert.deepEqual(writes.map((write) => write.action), ['route']);
  assert.deepEqual(errors, []);
  console.log('Coin Horizon controls UI PASS: real independent LONG/SHORT rows, default OFF and persisted route toggle.');
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
