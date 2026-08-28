#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  applyBinanceLiquidityFilter,
  assessCoinglassLiquidity,
  buildCoinglassZoneProposal,
  COINGLASS_WEB_QUALIFIED_TIMEFRAMES_VERSION,
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

async function withinDeadline(promise, remainingMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('SCAN_BUDGET_EXHAUSTED')), Math.max(1, remainingMs));
      }),
    ]);
  } finally {
    clearTimeout(timer);
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

function summarizedHeatmapSignature(summary = {}) {
  return [
    summary.updateTime,
    summary.candleCount,
    summary.priceLevelCount,
    summary.liquidationCellCount,
    summary.rangeLow,
    summary.rangeHigh,
  ].join('|');
}

async function extractReactHeatmap(page, expectedInstrumentId, previousSignature = '') {
  const readState = ({ instrumentId, rejectedSignature }) => {
    const signature = (data) => [
      data?.updateTime,
      data?.prices?.length,
      data?.y?.length,
      data?.liq?.length,
      data?.rangeLow,
      data?.rangeHigh,
    ].join('|');
    const accepted = (data) => (
      data?.liq
      && Array.isArray(data.liq)
      && (!instrumentId || data.instrument?.instrumentId === instrumentId)
      && (!rejectedSignature || signature(data) !== rejectedSignature)
    );
    const readFiber = (fiber) => {
      const seen = new Set();
      const queue = [fiber, fiber?.alternate].filter(Boolean);
      while (queue.length) {
        const current = queue.shift();
        if (!current || seen.has(current)) continue;
        seen.add(current);
        const state = current.stateNode?.state;
        if (accepted(state?.data)) return state.data;
        if (current.return) queue.push(current.return);
        if (current.alternate) queue.push(current.alternate);
      }
      return null;
    };
    const cached = window.__coinglassHeatmapFiberLocator;
    if (cached?.element?.isConnected && cached.fiberKey) {
      const cachedState = readFiber(cached.element[cached.fiberKey]);
      if (cachedState) return cachedState;
    }
    const seen = new Set();
    for (const element of document.querySelectorAll('body *')) {
      const fiberKey = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
      let fiber = fiberKey ? element[fiberKey] : null;
      while (fiber && !seen.has(fiber)) {
        seen.add(fiber);
        const state = fiber.stateNode?.state;
        if (accepted(state?.data)) {
          window.__coinglassHeatmapFiberLocator = { element, fiberKey };
          return state.data;
        }
        fiber = fiber.return;
      }
    }
    return null;
  };
  const query = { instrumentId: expectedInstrumentId, rejectedSignature: previousSignature };
  await page.waitForFunction(readState, query, { timeout: 12_000, polling: 250 });
  return page.evaluate(readState, query);
}

function heatmapRangeLabel(range) {
  if (range === '12h') return '12 hour';
  if (range === '24h') return '24 hour';
  if (range === '48h') return '48 hour';
  throw new Error(`Unsupported CoinGlass heatmap range: ${range}`);
}

async function setHeatmapRange(page, range, expectedInstrumentId = '') {
  const label = heatmapRangeLabel(range);
  const button = page.getByRole('combobox').filter({ hasText: /hour/i }).first();
  await button.waitFor({ state: 'visible', timeout: 30_000 });
  const current = String(await button.textContent() ?? '').trim();
  if (current === label) return null;
  const expectedSymbol = expectedInstrumentId ? `symbol=Binance_${expectedInstrumentId}` : '';
  const pending = page.waitForResponse((response) => {
    const url = response.url();
    return url.includes('/api/index/v6/liqHeatMap')
      && url.includes(`range=${range}`)
      && (!expectedSymbol || url.includes(expectedSymbol));
  }, { timeout: 30_000 });
  pending.catch(() => {});
  await button.click();
  await page.getByRole('option', { name: label, exact: true }).click();
  const response = await pending;
  if (!response.ok()) throw new Error(`CoinGlass ${range} heatmap HTTP ${response.status()}`);
  const envelope = await response.json().catch(() => null);
  if (String(envelope?.code ?? '') !== '0') {
    throw new Error(`CoinGlass ${range} response code ${envelope?.code ?? 'unknown'}: ${envelope?.msg ?? envelope?.message ?? 'unknown error'}`);
  }
  return response;
}

async function captureQualifiedTimeframe(page, market, range, previousSummary) {
  await setHeatmapRange(page, range, market.symbol);
  const heatmap = await extractReactHeatmap(
    page,
    market.symbol,
    summarizedHeatmapSignature(previousSummary),
  );
  const summary = summarizeCoinglassHeatmap(heatmap);
  if (summary.instrument.instrumentId !== market.symbol) {
    throw new Error(`CoinGlass ${range} returned ${summary.instrument.instrumentId || 'unknown'} instead of ${market.symbol}`);
  }
  return {
    version: COINGLASS_WEB_QUALIFIED_TIMEFRAMES_VERSION,
    range,
    scrapedAt: new Date().toISOString(),
    heatmap: summary,
  };
}

async function crawlSymbol(page, market, {
  imageDir, range, initial = false, captureImages = false,
}) {
  const expectedSymbol = `Binance_${market.symbol}`;
  const coin = market.baseAsset;
  const waitForHeatmapResponse = () => {
    const pending = page.waitForResponse((response) => {
      const url = response.url();
      return url.includes('/api/index/v6/liqHeatMap')
        && url.includes(`symbol=${expectedSymbol}`)
        && url.includes(`range=${range}`);
    }, { timeout: 45_000 });
    // The option click can itself wait while this listener times out. Mark the
    // response promise handled immediately so Node does not terminate the whole
    // collector before crawlWorker records the symbol-level failure.
    pending.catch(() => {});
    return pending;
  };
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
  const heatmap = await extractReactHeatmap(page, market.symbol);
  const summary = summarizeCoinglassHeatmap(heatmap);
  if (summary.instrument.instrumentId !== market.symbol) {
    throw new Error(`CoinGlass returned ${summary.instrument.instrumentId || 'unknown'} instead of ${market.symbol}`);
  }
  let imageUrl = null;
  if (captureImages) {
    const canvas = page.locator('canvas:visible').first();
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    const imageFile = join(imageDir, `${market.symbol}.png`);
    await canvas.screenshot({ path: imageFile });
    imageUrl = `/api/coinglass-web-top20/image?symbol=${encodeURIComponent(market.symbol)}`;
  }
  // The proposal and qualification use the structured React state above, not
  // canvas pixels. Keeping four large WebGL heatmaps visible makes Chromium's
  // SwiftShader consume ~10 CPU cores under WSL, so stop compositing the chart
  // as soon as its causal data has been extracted.
  await page.evaluate(() => {
    for (const canvas of document.querySelectorAll('canvas')) {
      canvas.style.visibility = 'hidden';
    }
  }).catch(() => {});
  return {
    ...market,
    status: 'OK',
    range,
    scrapedAt: new Date().toISOString(),
    ...(imageUrl ? { imageUrl } : {}),
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
const scanBudgetMs = Math.max(60_000, Math.min(
  150_000,
  Number(process.env.COINGLASS_WEB_SCAN_BUDGET_MS) || 150_000,
));
const scanDeadlineAt = Date.parse(startedAt) + scanBudgetMs;
const binanceBase = String(process.env.BINANCE_FUTURES_BASE_URL ?? 'https://fapi.binance.com').replace(/\/$/, '');
const captureImages = process.env.COINGLASS_WEB_CAPTURE_IMAGES === 'true';
const viewportWidth = Math.max(480, Math.min(1280, Number(process.env.COINGLASS_WEB_VIEWPORT_WIDTH) || 1280));
const viewportHeight = Math.max(360, Math.min(900, Number(process.env.COINGLASS_WEB_VIEWPORT_HEIGHT) || 900));
const disableGpu = process.env.COINGLASS_WEB_DISABLE_GPU !== 'false';

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
  const headed = process.env.COINGLASS_WEB_BROWSER_MODE === 'headed'
    && Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  await mkdir(profileDir, { recursive: true });
  context = await chromium.launchPersistentContext(profileDir, {
    headless: !headed,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disk-cache-size=52428800',
      '--media-cache-size=10485760',
      ...(disableGpu ? ['--disable-gpu', '--disable-software-rasterizer'] : []),
      ...(headed ? ['--window-position=-10000,-10000', '--window-size=1280,900'] : []),
    ],
    env: { ...process.env, ...(libraryPath ? { LD_LIBRARY_PATH: libraryPath } : {}) },
    locale: 'en-US',
    timezoneId: 'Asia/Bangkok',
    viewport: { width: viewportWidth, height: viewportHeight },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  await context.route('**/*', async (route) => {
    const resourceType = route.request().resourceType();
    if (['image', 'media', 'font'].includes(resourceType)) await route.abort();
    else await route.continue();
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
  await Promise.all(pages.map((page) => page.emulateMedia({ reducedMotion: 'reduce' })));

  let nextMarketIndex = 0;
  let progressWrite = Promise.resolve();
  const activeSymbols = new Set();
  const attemptedSymbols = new Set();
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
      scanBudgetMs,
      scanDeadlineAt: new Date(scanDeadlineAt).toISOString(),
    };
    progressWrite = progressWrite
      .catch(() => {})
      .then(() => writeJsonAtomic(progressFile, payload));
    return progressWrite;
  };

  async function crawlWorker(page) {
    let initial = true;
    while (!authRequired) {
      if (Date.now() >= scanDeadlineAt) return;
      const index = nextMarketIndex;
      nextMarketIndex += 1;
      if (index >= markets.length) return;
      const market = markets[index];
      attemptedSymbols.add(market.symbol);
      activeSymbols.add(market.symbol);
      await updateProgress();
      try {
        rows.push(await withinDeadline(
          crawlSymbol(page, market, {
            imageDir, range, initial, captureImages,
          }),
          scanDeadlineAt - Date.now(),
        ));
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
  const unattemptedMarkets = markets.filter((market) => !attemptedSymbols.has(market.symbol));
  for (const market of unattemptedMarkets) {
    failures.push({
      rank: market.rank,
      symbol: market.symbol,
      error: 'SCAN_BUDGET_EXHAUSTED',
      failedAt: new Date().toISOString(),
    });
  }

  const previousSnapshot = await readJson(snapshotFile, null);
  const mergedRows = mergeLastGoodHeatmapRows({
    markets,
    freshRows: rows,
    failures,
    previousRows: Array.isArray(previousSnapshot?.rows) ? previousSnapshot.rows : [],
  });
  let assessedRows = mergedRows.map((row) => {
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
  const qualifiedFreshRows = assessedRows.filter((row) => (
    row.qualified === true && row.status === 'OK' && row.stale !== true
  ));
  const qualifiedTimeframesBySymbol = new Map();
  const qualifiedTimeframeFailures = [];
  let nextQualifiedIndex = 0;
  async function qualifiedTimeframeWorker(page) {
    while (nextQualifiedIndex < qualifiedFreshRows.length && Date.now() < scanDeadlineAt - 10_000) {
      const index = nextQualifiedIndex;
      nextQualifiedIndex += 1;
      const row = qualifiedFreshRows[index];
      try {
        const frames = await withinDeadline((async () => {
          // Primary crawl is always 48h. Re-open the exact qualified symbol at
          // 48h, then switch only this symbol to 12h and 24h. These extra
          // frames are Discord context and never reclassify the row.
          await setHeatmapRange(page, '48h');
          const base = await crawlSymbol(page, row, {
            imageDir,
            range: '48h',
            initial: false,
            captureImages: false,
          });
          const twelveHour = await captureQualifiedTimeframe(page, row, '12h', base.heatmap);
          const twentyFourHour = await captureQualifiedTimeframe(page, row, '24h', twelveHour.heatmap);
          return {
            version: COINGLASS_WEB_QUALIFIED_TIMEFRAMES_VERSION,
            '12h': twelveHour,
            '24h': twentyFourHour,
          };
        })(), scanDeadlineAt - Date.now());
        qualifiedTimeframesBySymbol.set(row.symbol, frames);
      } catch (error) {
        qualifiedTimeframeFailures.push({
          symbol: row.symbol,
          error: String(error?.message ?? error),
          failedAt: new Date().toISOString(),
        });
      }
    }
  }
  if (qualifiedFreshRows.length && Date.now() < scanDeadlineAt - 10_000) {
    await Promise.all(pages.map((page) => qualifiedTimeframeWorker(page)));
  }
  assessedRows = assessedRows.map((row) => {
    const qualifiedTimeframes = qualifiedTimeframesBySymbol.get(row.symbol);
    const timeframeFailure = qualifiedTimeframeFailures.find((failure) => failure.symbol === row.symbol);
    return {
      ...row,
      ...(qualifiedTimeframes ? { qualifiedTimeframes } : {}),
      ...(timeframeFailure ? { qualifiedTimeframeError: timeframeFailure.error } : {}),
    };
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
      browserMode: headed ? 'headed' : 'headless',
      captureImages,
      disableGpu,
      viewport: { width: viewportWidth, height: viewportHeight },
      scanBudgetMs,
      deadlineExceeded: Date.now() >= scanDeadlineAt,
      unattempted: unattemptedMarkets.length,
      requested: markets.length,
      moverCandidates: moverCandidates.length,
      binanceLiquidityAssessed: markets.length,
      binanceLiquidityEligible: markets.filter((row) => row.binanceLiquidity?.eligible).length,
      binanceLiquidityExcluded: binanceSelection.excluded.length,
      heatmapLiquidityExcluded: rejectedHeatmaps.length,
      qualified: publishedRows.filter((row) => row.qualified).length,
      qualifiedTimeframesRequested: qualifiedFreshRows.length,
      qualifiedTimeframesComplete: qualifiedTimeframesBySymbol.size,
      qualifiedTimeframesFailed: qualifiedTimeframeFailures.length,
      authRequired,
      successful: rows.length,
      failed: failures.length,
      published: publishedRows.length,
      retainedStale,
    },
    rows: publishedRows,
    failures,
    qualifiedTimeframeFailures,
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
    scanBudgetMs,
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
