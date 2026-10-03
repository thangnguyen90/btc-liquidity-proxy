import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('public/binance-auto-controls.html', root), 'utf8');
const js = await readFile(new URL('public/binance-auto-controls.js', root), 'utf8');
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === 'win32'
    ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
    : {}),
});
const page = await browser.newPage();
const state = {
  enabled: false,
  routes: {},
  protectionExclusions: [],
  protectionFullBypasses: [],
  protectionExclusionEvents: [],
  dailyStats: null,
  canEdit: true,
};
let postAttempts = 0;
let envAuthAttempts = 0;
let storedAuthAttempts = 0;
let passwordAuthAttempts = 0;
let requirePasswordForGet = false;

await page.addInitScript(() => {
  if (!localStorage.getItem('test-no-seed')) {
    localStorage.setItem('orders_token', 'expired-token');
    localStorage.setItem('orders_creds', JSON.stringify({ apiKey: 'saved-key', apiSecret: 'saved-secret' }));
  }
  window.confirm = () => true;
});
await page.route('https://controls.test/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/binance-auto-controls') {
    await route.fulfill({ status: 200, contentType: 'text/html', body: html });
    return;
  }
  if (url.pathname === '/binance-auto-controls.js') {
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: js });
    return;
  }
  if (url.pathname === '/binance-auto-controls.css') {
    await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return;
  }
  if (url.pathname === '/api/auth/env') {
    envAuthAttempts += 1;
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'local only' }) });
    return;
  }
  if (url.pathname === '/api/auth') {
    storedAuthAttempts += 1;
    assert.deepEqual(request.postDataJSON(), { apiKey: 'saved-key', apiSecret: 'saved-secret' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'recovered-token' }) });
    return;
  }
  if (url.pathname === '/api/auth/orders-password') {
    passwordAuthAttempts += 1;
    assert.deepEqual(request.postDataJSON(), { password: 'controls-password' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'password-token' }) });
    return;
  }
  if (url.pathname === '/api/auto-entry-controls') {
    if (request.method() === 'POST') {
      postAttempts += 1;
      if (request.headers()['x-orders-token'] === 'expired-token') {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'expired' }) });
        return;
      }
      assert.equal(request.headers()['x-orders-token'], 'recovered-token');
      const body = request.postDataJSON();
      const symbol = body.symbol.toUpperCase().endsWith('USDT') ? body.symbol.toUpperCase() : `${body.symbol.toUpperCase()}USDT`;
      if (body.action === 'protection-exclusion-add') {
        state.protectionExclusions = [symbol];
        state.protectionFullBypasses = [];
      } else if (body.action === 'protection-full-bypass-add') {
        state.protectionExclusions = [];
        state.protectionFullBypasses = [symbol];
      }
    }
    const responseState = {
      ...state,
      canEdit: requirePasswordForGet
        ? request.headers()['x-orders-token'] === 'password-token'
        : state.canEdit,
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseState) });
    return;
  }
  await route.fulfill({ status: 404, body: 'not found' });
});

try {
  await page.goto('https://controls.test/binance-auto-controls');
  await page.locator('#protection-exclusion-symbol').fill('us');
  await page.locator('#protection-exclusion-add').click();
  await page.waitForFunction(() => document.querySelector('#protection-exclusion-count')?.textContent?.startsWith('1 coin'));
  assert.equal(await page.locator('#protection-exclusion-symbol').inputValue(), '', 'temporary input clears only after confirmed save');
  assert.equal(envAuthAttempts, 1, 'expired public session tries env auth once');
  assert.equal(storedAuthAttempts, 1, 'public session falls back to stored Orders credentials');
  assert.equal(postAttempts, 2, 'the rejected write is retried exactly once with the recovered token');

  await page.locator('#protection-full-bypass-symbol').fill('ususdt');
  await page.locator('#protection-full-bypass-add').click();
  await page.waitForFunction(() => document.querySelector('#protection-full-bypass-count')?.textContent?.startsWith('1 coin'));
  assert.equal(await page.locator('#protection-full-bypass-symbol').inputValue(), '', 'full-bypass input clears only after confirmed save');
  assert.deepEqual(state.protectionFullBypasses, ['USUSDT']);
  assert.deepEqual(state.protectionExclusions, []);

  requirePasswordForGet = true;
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.setItem('test-no-seed', '1'));
  await page.addInitScript(() => { window.prompt = () => 'controls-password'; });
  await page.reload();
  await page.locator('#unlock').waitFor({ state: 'visible' });
  await page.locator('#unlock').click();
  await page.waitForFunction(() => document.querySelector('#protection-full-bypass-symbol')?.disabled === false);
  assert.equal(passwordAuthAttempts, 1, 'public controls can unlock with ORDERS_PASSWORD without browser API credentials');
} finally {
  await browser.close();
}

console.log('Binance auto-controls session recovery passed: US/USUSDT saves in both protection inputs after a stale token.');
