#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  COINGLASS_WEB_TOP20_ISOLATION,
  COINGLASS_WEB_TOP20_MODE,
  COINGLASS_WEB_TOP20_VERSION,
  mergeLastGoodHeatmapRows,
  selectTopBinanceUsdtPerpetuals,
  summarizeCoinglassHeatmap,
} from '../src/coinglassWebTop20.js';

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? fallback) : fallback;
}

async function writeJsonAtomic(path, payload) {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function fetchJson(url, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'btc-liquidity-proxy/coinglass-observer' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function extractReactHeatmap(page, expectedInstrumentId) {
  const readState = (instrumentId) => {
    const seen = new Set();
    for (const element of document.querySelectorAll('body *')) {
      const fiberKey = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
      let fiber = fiberKey ? element[fiberKey] : null;
      while (fiber && !seen.has(fiber)) {
        seen.add(fiber);
        const state = fiber.stateNode?.state;
        if (state?.data?.liq
          && Array.isArray(state.data.liq)
          && (!instrumentId || state.data.instrument?.instrumentId === instrumentId)) return state.data;
        fiber = fiber.return;
      }
    }
    return null;
  };
  await page.waitForFunction(readState, expectedInstrumentId, { timeout: 30_000, polling: 500 });
  return page.evaluate(readState, expectedInstrumentId);
}

async function crawlSymbol(page, market, { imageDir, range, initial = false }) {
  const expectedSymbol = `Binance_${market.symbol}`;
  const coin = market.baseAsset;
  const waitForHeatmapResponse = () => page.waitForResponse((response) => {
    const url = response.url();
    return url.includes('/api/index/v6/liqHeatMap')
      && url.includes(`symbol=${expectedSymbol}`)
      && url.includes(`range=${range}`);
  }, { timeout: 45_000 });
  let response;
  if (initial && coin === 'BTC') {
    const defaultHeatmapResponse = waitForHeatmapResponse();
    await page.goto(
      'https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3',
      { waitUntil: 'domcontentloaded', timeout: 45_000 },
    );
    response = await defaultHeatmapResponse;
  } else {
    if (initial) {
      await page.goto(
        'https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3',
        { waitUntil: 'domcontentloaded', timeout: 45_000 },
      );
    }
    await page.keyboard.press('Escape').catch(() => {});
    const search = page.getByRole('combobox', { name: 'Search' });
    await search.waitFor({ state: 'visible', timeout: 30_000 });
    await search.click();
    await search.fill(coin);
    const option = page.getByRole('option', {
      name: `Binance ${coin}/USDT Perpetual`,
      exact: true,
    });
    await option.waitFor({ state: 'visible', timeout: 15_000 });
    const requestedHeatmapResponse = waitForHeatmapResponse();
    await option.click();
    response = await requestedHeatmapResponse;
  }
  if (!response.ok()) throw new Error(`CoinGlass heatmap HTTP ${response.status()}`);
  const envelope = await response.json().catch(() => null);
  if (String(envelope?.code ?? '') !== '0') {
    throw new Error(`CoinGlass heatmap response code ${envelope?.code ?? 'unknown'}: ${envelope?.msg ?? envelope?.message ?? 'unknown error'}`);
  }
  const canvas = page.locator('canvas:visible').first();
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  const heatmap = await extractReactHeatmap(page, market.symbol);
  const summary = summarizeCoinglassHeatmap(heatmap);
  if (summary.instrument.instrumentId !== market.symbol) {
    throw new Error(`CoinGlass returned ${summary.instrument.instrumentId || 'unknown'} instead of ${market.symbol}`);
  }
  const imageFile = join(imageDir, `${market.symbol}.png`);
  await canvas.screenshot({ path: imageFile });
  return {
    ...market,
    status: 'OK',
    range,
    scrapedAt: new Date().toISOString(),
    imageUrl: `/api/coinglass-web-top20/image?symbol=${encodeURIComponent(market.symbol)}`,
    heatmap: summary,
  };
}

const rootDir = process.cwd();
const limit = Math.max(1, Math.min(20, Number(argument('--limit', '20')) || 20));
const range = '48h';
const reason = argument('--reason', 'manual');
const dataDir = resolve(argument('--data-dir', join(rootDir, 'data', 'coinglass-web-top20')));
const imageDir = join(dataDir, 'images');
const snapshotFile = join(dataDir, 'snapshot.json');
const progressFile = join(dataDir, 'progress.json');
const startedAt = new Date().toISOString();
const binanceBase = String(process.env.BINANCE_FUTURES_BASE_URL ?? 'https://fapi.binance.com').replace(/\/$/, '');

await mkdir(imageDir, { recursive: true });

let browser;
try {
  const [exchangeInfo, tickers] = await Promise.all([
    fetchJson(`${binanceBase}/fapi/v1/exchangeInfo`),
    fetchJson(`${binanceBase}/fapi/v1/ticker/24hr`),
  ]);
  const markets = selectTopBinanceUsdtPerpetuals(exchangeInfo, tickers, limit);
  if (!markets.length) throw new Error('Binance returned no eligible USDT perpetual contracts');

  const localLibraryPath = join(rootDir, '.playwright-libs', 'root', 'usr', 'lib', 'x86_64-linux-gnu');
  const libraryPath = [
    existsSync(localLibraryPath) ? localLibraryPath : '',
    process.env.LD_LIBRARY_PATH ?? '',
  ].filter(Boolean).join(':');
  const headed = process.env.COINGLASS_WEB_BROWSER_MODE !== 'headless'
    && Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  browser = await chromium.launch({
    headless: !headed,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      ...(headed ? ['--window-position=-10000,-10000', '--window-size=1280,900'] : []),
    ],
    env: { ...process.env, ...(libraryPath ? { LD_LIBRARY_PATH: libraryPath } : {}) },
  });
  const context = await browser.newContext({
    locale: 'en-US',
    timezoneId: 'Asia/Bangkok',
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  const rows = [];
  const failures = [];
  for (const [index, market] of markets.entries()) {
    await writeJsonAtomic(progressFile, {
      version: COINGLASS_WEB_TOP20_VERSION,
      running: true,
      startedAt,
      total: markets.length,
      completed: rows.length + failures.length,
      currentSymbol: market.symbol,
      successful: rows.length,
      failed: failures.length,
    });
    try {
      rows.push(await crawlSymbol(page, market, { imageDir, range, initial: index === 0 }));
    } catch (error) {
      failures.push({
        rank: market.rank,
        symbol: market.symbol,
        error: String(error?.message ?? error),
        failedAt: new Date().toISOString(),
      });
    }
    const delayMs = index === 0 ? 20_000 : 5_000;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }

  const previousSnapshot = await readJson(snapshotFile, null);
  const publishedRows = mergeLastGoodHeatmapRows({
    markets,
    freshRows: rows,
    failures,
    previousRows: Array.isArray(previousSnapshot?.rows) ? previousSnapshot.rows : [],
  });
  const retainedStale = publishedRows.filter((row) => row.stale).length;
  const snapshot = {
    version: COINGLASS_WEB_TOP20_VERSION,
    mode: COINGLASS_WEB_TOP20_MODE,
    isolation: COINGLASS_WEB_TOP20_ISOLATION,
    updatedAt: new Date().toISOString(),
    reason,
    source: {
      ranking: `${binanceBase}/fapi/v1/ticker/24hr quoteVolume`,
      contracts: `${binanceBase}/fapi/v1/exchangeInfo`,
      heatmap: 'https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3',
      exchange: 'Binance',
      range,
      requested: markets.length,
      successful: rows.length,
      failed: failures.length,
      published: publishedRows.length,
      retainedStale,
    },
    rows: publishedRows,
    failures,
  };
  await writeJsonAtomic(snapshotFile, snapshot);
  await writeJsonAtomic(progressFile, {
    version: COINGLASS_WEB_TOP20_VERSION,
    running: false,
    startedAt,
    completedAt: snapshot.updatedAt,
    total: markets.length,
    completed: markets.length,
    successful: rows.length,
    failed: failures.length,
  });
  process.stdout.write(JSON.stringify({ ok: true, updatedAt: snapshot.updatedAt, rows: rows.length, failures: failures.length }));
} catch (error) {
  const message = String(error?.message ?? error);
  await writeJsonAtomic(progressFile, {
    version: COINGLASS_WEB_TOP20_VERSION,
    running: false,
    startedAt,
    failedAt: new Date().toISOString(),
    error: message,
  }).catch(() => {});
  process.stdout.write(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
