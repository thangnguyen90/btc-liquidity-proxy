#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { COINGLASS_WEB_TOP20_VERSION } from '../src/coinglassWebTop20.js';

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? fallback) : fallback;
}

async function writeJsonAtomic(path, payload) {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

async function loginVisible(page) {
  if (/\/login(?:[/?#]|$)/i.test(page.url())) return true;
  return page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    return [...document.querySelectorAll('a,button')].some((element) => (
      visible(element)
      && /^log\s*in$/i.test(String(element.textContent ?? '').trim())
    ));
  }).catch(() => true);
}

async function verifyAltcoinAccess(page) {
  await page.goto('https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await page.waitForTimeout(4_000);
  if (await loginVisible(page)) {
    return { authenticated: false, altcoinAccess: false, message: 'Phiên collector vẫn chưa đăng nhập CoinGlass.' };
  }
  const search = page.getByRole('combobox', { name: 'Search' });
  await search.waitFor({ state: 'visible', timeout: 20_000 });
  await search.click();
  await search.fill('ETH');
  const option = page.getByRole('option', { name: 'Binance ETH/USDT Perpetual', exact: true });
  await option.waitFor({ state: 'visible', timeout: 15_000 });
  const responsePromise = page.waitForResponse((response) => (
    response.url().includes('/api/index/v6/liqHeatMap')
    && response.url().includes('symbol=Binance_ETHUSDT')
    && response.url().includes('range=48h')
  ), { timeout: 45_000 });
  await option.click();
  const response = await responsePromise;
  const envelope = await response.json().catch(() => null);
  const lockedOverlay = await page.getByText('Log in to unlock full data', { exact: false }).count().catch(() => 0);
  const altcoinAccess = response.ok() && String(envelope?.code ?? '') === '0' && lockedOverlay === 0;
  return {
    authenticated: true,
    altcoinAccess,
    message: altcoinAccess
      ? 'Đăng nhập thành công; collector đã đọc được dữ liệu ETH Model 3.'
      : 'Đã đăng nhập nhưng tài khoản CoinGlass chưa mở được dữ liệu altcoin Model 3 (có thể cần gói quyền phù hợp).',
    responseCode: envelope?.code ?? null,
  };
}

const rootDir = process.cwd();
const dataDir = resolve(argument('--data-dir', join(rootDir, 'data', 'coinglass-web-top20')));
const timeoutMs = Math.max(120_000, Number(argument('--timeout-ms', '600000')) || 600_000);
const profileDir = join(dataDir, 'browser-profile');
const authFile = join(dataDir, 'auth.json');
const startedAt = new Date().toISOString();
const localLibraryPath = join(rootDir, '.playwright-libs', 'root', 'usr', 'lib', 'x86_64-linux-gnu');
const libraryPath = [
  existsSync(localLibraryPath) ? localLibraryPath : '',
  process.env.LD_LIBRARY_PATH ?? '',
].filter(Boolean).join(':');
const browserEnv = {
  ...process.env,
  ...(libraryPath ? { LD_LIBRARY_PATH: libraryPath } : {}),
  ...(!process.env.DISPLAY && existsSync('/mnt/wslg/.X11-unix') ? { DISPLAY: ':0' } : {}),
  ...(!process.env.XDG_RUNTIME_DIR && existsSync('/mnt/wslg/runtime-dir') ? { XDG_RUNTIME_DIR: '/mnt/wslg/runtime-dir' } : {}),
};

await mkdir(profileDir, { recursive: true });
await writeJsonAtomic(authFile, {
  version: COINGLASS_WEB_TOP20_VERSION,
  running: true,
  authenticated: false,
  altcoinAccess: false,
  startedAt,
  message: 'Cửa sổ đăng nhập collector đang mở. Hãy đăng nhập trực tiếp trên cửa sổ này.',
});

let context;
try {
  if (!browserEnv.DISPLAY && !browserEnv.WAYLAND_DISPLAY) {
    throw new Error('Không tìm thấy màn hình đồ họa để mở cửa sổ đăng nhập collector.');
  }
  context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1280,900'],
    env: browserEnv,
    locale: 'en-US',
    timezoneId: 'Asia/Bangkok',
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'accept-language': 'en-US,en;q=0.9' },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto('https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await page.waitForTimeout(3_000);
  if (await loginVisible(page)) {
    const loginControl = page.getByText('Login', { exact: true }).first();
    if (await loginControl.count()) await loginControl.click().catch(() => {});
  }

  const deadline = Date.now() + timeoutMs;
  let result = null;
  while (Date.now() < deadline) {
    const coinGlassPages = context.pages().filter((candidate) => candidate.url().includes('coinglass.com'));
    const activePage = coinGlassPages.at(-1) ?? page;
    if (!await loginVisible(activePage)) {
      try {
        result = await verifyAltcoinAccess(activePage);
        if (result.authenticated) break;
      } catch {
        // The page can be between redirects while the user completes login.
      }
    }
    await activePage.waitForTimeout(2_000).catch(() => {});
  }
  if (!result?.authenticated) throw new Error('Hết thời gian chờ đăng nhập CoinGlass cho collector.');
  const completedAt = new Date().toISOString();
  await writeJsonAtomic(authFile, {
    version: COINGLASS_WEB_TOP20_VERSION,
    running: false,
    startedAt,
    completedAt,
    checkedAt: completedAt,
    ...result,
  });
  await page.waitForTimeout(3_000).catch(() => {});
  process.stdout.write(JSON.stringify({ ok: true, ...result, completedAt }));
} catch (error) {
  const message = String(error?.message ?? error);
  await writeJsonAtomic(authFile, {
    version: COINGLASS_WEB_TOP20_VERSION,
    running: false,
    authenticated: false,
    altcoinAccess: false,
    startedAt,
    failedAt: new Date().toISOString(),
    message,
  }).catch(() => {});
  process.stdout.write(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
}
