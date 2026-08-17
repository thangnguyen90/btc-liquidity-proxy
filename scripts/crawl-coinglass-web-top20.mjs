#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  applyBinanceLiquidityFilter,
  assessCoinglassLiquidity,
  buildCoinglassZoneProposal,
  COINGLASS_WEB_TOP20_ISOLATION,
  COINGLASS_WEB_TOP20_MODE,
  COINGLASS_WEB_TOP20_VERSION,
  mergeLastGoodHeatmapRows,
  qualifyCoinglassOpportunity,
  selectBinanceAppMoverCandidates,
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

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function loadBinanceLiquidityMetrics(binanceBase, markets, bookTickers = []) {
  const books = new Map((Array.isArray(bookTickers) ? bookTickers : []).map((row) => [row?.symbol, row]));
  const rows = await mapWithConcurrency(markets, 3, async (market) => {
    try {
      const symbol = encodeURIComponent(market.symbol);
      const openInterest = await fetchJson(`${binanceBase}/fapi/v1/openInterest?symbol=${symbol}`);
      const book = books.get(market.symbol) ?? {};
      const bestBid = Number(book.bidPrice);
      const bestAsk = Number(book.askPrice);
      const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : Number(market.lastPrice);
      return [market.symbol, {
        spreadBps: mid > 0 ? ((bestAsk - bestBid) / mid) * 10_000 : null,
        bidDepthUsd: Math.max(0, bestBid) * Math.max(0, Number(book.bidQty) || 0),
        askDepthUsd: Math.max(0, bestAsk) * Math.max(0, Number(book.askQty) || 0),
        openInterestNotional: Math.max(0, Number(openInterest?.openInterest) || 0) * Math.max(0, Number(market.lastPrice) || 0),
      }];
    } catch (error) {
      return [market.symbol, { error: String(error?.message ?? error) }];
    }
  });
  return Object.fromEntries(rows);
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
    heatmapLiquidity: assessCoinglassLiquidity(summary, market),
    proposal: buildCoinglassZoneProposal(summary, market),
  };
}

const rootDir = process.cwd();
const limit = Math.max(1, Math.min(40, Number(argument('--limit', '40')) || 40));
const range = '48h';
const reason = argument('--reason', 'manual');
const dataDir = resolve(argument('--data-dir', join(rootDir, 'data', 'coinglass-web-top20')));
const imageDir = join(dataDir, 'images');
const snapshotFile = join(dataDir, 'snapshot.json');
const progressFile = join(dataDir, 'progress.json');
const profileDir = join(dataDir, 'browser-profile');
const startedAt = new Date().toISOString();
const binanceBase = String(process.env.BINANCE_FUTURES_BASE_URL ?? 'https://fapi.binance.com').replace(/\/$/, '');

await mkdir(imageDir, { recursive: true });

let context;
try {
  const [exchangeInfo, tickers, bookTickers] = await Promise.all([
    fetchJson(`${binanceBase}/fapi/v1/exchangeInfo`),
    fetchJson(`${binanceBase}/fapi/v1/ticker/24hr`),
    fetchJson(`${binanceBase}/fapi/v1/ticker/bookTicker`),
  ]);
  const topPerSide = Math.max(20, Math.ceil((limit - 1) / 2));
  const moverCandidates = selectBinanceAppMoverCandidates(exchangeInfo, tickers, {
    topPerSide,
    maxSymbols: Math.max(2, limit - 1),
    minQuoteVolume: 2_000_000,
  });
  if (!moverCandidates.length) throw new Error('Binance returned no eligible top gainer/loser contracts');
  const liquidityMetrics = await loadBinanceLiquidityMetrics(binanceBase, moverCandidates, bookTickers);
  const binanceSelection = applyBinanceLiquidityFilter(
    moverCandidates,
    liquidityMetrics,
    Math.min(moverCandidates.length, limit + 16),
    { preserveOrder: true },
  );
  const markets = binanceSelection.assessed.slice(0, limit);
  if (!markets.length) throw new Error('No Binance market passed the liquidity filter');

  const localLibraryPath = join(rootDir, '.playwright-libs', 'root', 'usr', 'lib', 'x86_64-linux-gnu');
  const libraryPath = [
    existsSync(localLibraryPath) ? localLibraryPath : '',
    process.env.LD_LIBRARY_PATH ?? '',
  ].filter(Boolean).join(':');
  const headed = process.env.COINGLASS_WEB_BROWSER_MODE !== 'headless'
    && Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  await mkdir(profileDir, { recursive: true });
  context = await chromium.launchPersistentContext(profileDir, {
    headless: !headed,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      ...(headed ? ['--window-position=-10000,-10000', '--window-size=1280,900'] : []),
    ],
    env: { ...process.env, ...(libraryPath ? { LD_LIBRARY_PATH: libraryPath } : {}) },
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
  const rows = [];
  const failures = [];
  let authRequired = false;
  const browserConcurrency = Math.max(1, Math.min(
    4,
    markets.length,
    Math.trunc(Number(process.env.COINGLASS_WEB_BROWSER_CONCURRENCY) || 4),
  ));
  const pages = [context.pages()[0] ?? await context.newPage()];
  while (pages.length < browserConcurrency) pages.push(await context.newPage());

  let nextMarketIndex = 0;
  let progressWrite = Promise.resolve();
  const activeSymbols = new Set();
  const updateProgress = () => {
    const payload = {
      version: COINGLASS_WEB_TOP20_VERSION,
      running: true,
      startedAt,
      total: markets.length,
      completed: rows.length + failures.length,
      currentSymbol: [...activeSymbols][0] ?? null,
      currentSymbols: [...activeSymbols],
      successful: rows.length,
      failed: failures.length,
      browserConcurrency,
    };
    progressWrite = progressWrite
      .catch(() => {})
      .then(() => writeJsonAtomic(progressFile, payload));
    return progressWrite;
  };

  async function crawlWorker(page) {
    let initial = true;
    while (!authRequired) {
      const index = nextMarketIndex;
      nextMarketIndex += 1;
      if (index >= markets.length) return;
      const market = markets[index];
      activeSymbols.add(market.symbol);
      await updateProgress();
      try {
        rows.push(await crawlSymbol(page, market, { imageDir, range, initial }));
      } catch (error) {
        const errorMessage = String(error?.message ?? error);
        failures.push({
          rank: market.rank,
          symbol: market.symbol,
          error: errorMessage,
          failedAt: new Date().toISOString(),
        });
        if (/login|log in|unlock full data|permission|response code 40000/i.test(errorMessage)) {
          authRequired = true;
        }
      } finally {
        initial = false;
        activeSymbols.delete(market.symbol);
        await updateProgress();
      }
      if (authRequired) return;
      const delayMs = index === 0 ? 3_000 : 750;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  }
  await Promise.all(pages.map((page) => crawlWorker(page)));
  await progressWrite;

  const previousSnapshot = await readJson(snapshotFile, null);
  const mergedRows = mergeLastGoodHeatmapRows({
    markets,
    freshRows: rows,
    failures,
    previousRows: Array.isArray(previousSnapshot?.rows) ? previousSnapshot.rows : [],
  });
  const assessedRows = mergedRows.map((row) => {
    const heatmapLiquidity = assessCoinglassLiquidity(row.heatmap, row);
    const proposal = buildCoinglassZoneProposal(row.heatmap, row);
    const enriched = {
      ...row,
      heatmapLiquidity,
      proposal,
    };
    const qualification = qualifyCoinglassOpportunity(enriched);
    return { ...enriched, qualification, qualified: qualification.qualified };
  });
  const publishedRows = assessedRows
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const rejectedHeatmaps = assessedRows
    .filter((row) => !row.heatmapLiquidity.eligible)
    .map((row) => ({
      symbol: row.symbol,
      reason: 'INSUFFICIENT_LIQUIDATION_CLUSTERS',
      heatmapLiquidity: row.heatmapLiquidity,
    }));
  const retainedStale = publishedRows.filter((row) => row.stale).length;
  const snapshot = {
    version: COINGLASS_WEB_TOP20_VERSION,
    mode: COINGLASS_WEB_TOP20_MODE,
    isolation: COINGLASS_WEB_TOP20_ISOLATION,
    updatedAt: new Date().toISOString(),
    reason,
    source: {
      ranking: 'BTC reference + Binance app-style top gainers/losers by 24h change; volume/trades/OI/top-book/spread are eligibility only; CoinGlass cluster quality is the final filter',
      contracts: `${binanceBase}/fapi/v1/exchangeInfo`,
      heatmap: 'https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3',
      exchange: 'Binance',
      range,
      browserConcurrency,
      requested: markets.length,
      moverCandidates: moverCandidates.length,
      binanceLiquidityAssessed: markets.length,
      binanceLiquidityEligible: markets.filter((row) => row.binanceLiquidity?.eligible).length,
      binanceLiquidityExcluded: binanceSelection.excluded.length,
      heatmapLiquidityExcluded: rejectedHeatmaps.length,
      qualified: publishedRows.filter((row) => row.qualified).length,
      authRequired,
      successful: rows.length,
      failed: failures.length,
      published: publishedRows.length,
      retainedStale,
    },
    rows: publishedRows,
    failures,
    exclusions: {
      binance: binanceSelection.excluded,
      coinglass: rejectedHeatmaps,
    },
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
    browserConcurrency,
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
  await context?.close().catch(() => {});
}
