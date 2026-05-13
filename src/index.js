#!/usr/bin/env node

import { BinanceClient, BinanceRateLimitError } from './binanceClient.js';
import { analyzeMarket } from './liquidityProxy.js';
import { fetchAnalysis, normalizeSymbol } from './marketAnalysis.js';

const options = parseArgs(process.argv.slice(2));
const symbol = normalizeSymbol(options.symbol ?? options._[0] ?? 'BTCUSDT');
const interval = options.interval ?? '15m';
const limit = Number(options.limit ?? 192);
const rangePct = Number(options['range-pct'] ?? 0.04);
const binSizePct = Number(options['bin-size-pct'] ?? 0.001);
const client = new BinanceClient();

try {
  if (options.watch) {
    await watchMarket({
      symbol,
      interval,
      limit,
      rangePct,
      binSizePct,
      refreshMs: Math.max(Number(options['refresh-ms'] ?? 15000), 5000),
      slowRefreshMs: Math.max(Number(options['slow-refresh-ms'] ?? 60000), 30000),
      depthLimit: Number(options['depth-limit'] ?? 100),
    });
  } else {
    const analysis = await fetchAnalysis({
      client,
      symbol,
      interval,
      limit,
      rangePct,
      binSizePct,
      depthLimit: Number(options['depth-limit'] ?? 1000),
    });

    printHumanSummary(analysis);
    console.log(JSON.stringify(analysis, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

async function watchMarket({ symbol, interval, limit, rangePct, binSizePct, refreshMs, slowRefreshMs, depthLimit }) {
  const cache = {
    premiumIndex: null,
    openInterest: null,
    klines: null,
    depth: null,
    longShortRatio: null,
  };
  const nextRefreshAt = {
    premiumIndex: 0,
    depth: 0,
    openInterest: 0,
    klines: 0,
    longShortRatio: 0,
  };

  console.error(`Watching ${symbol}. Fast refresh ${refreshMs}ms, slow refresh ${slowRefreshMs}ms. Press Ctrl+C to stop.`);

  while (true) {
    const startedAt = Date.now();

    try {
      await refreshCache({ cache, nextRefreshAt, symbol, interval, limit, refreshMs, slowRefreshMs, depthLimit });

      if (cache.premiumIndex && cache.openInterest && cache.klines && cache.depth) {
        const analysis = analyzeMarket({
          symbol,
          klines: cache.klines,
          depth: cache.depth,
          premiumIndex: cache.premiumIndex,
          openInterest: cache.openInterest,
          longShortRatio: cache.longShortRatio,
          rangePct,
          binSizePct,
        });

        clearScreen();
        printHumanSummary(analysis);
        printWatchDetails(analysis);
      }
    } catch (error) {
      if (error instanceof BinanceRateLimitError) {
        const waitMs = Math.max(error.retryAfterMs, 60000);

        console.error(`${new Date().toISOString()} Binance rate limit ${error.status}. Sleeping ${Math.ceil(waitMs / 1000)}s.`);
        await sleep(waitMs);
      } else {
        console.error(`${new Date().toISOString()} ${error instanceof Error ? error.message : error}`);
        await sleep(Math.max(refreshMs, 15000));
      }
    }

    await sleep(Math.max(refreshMs - (Date.now() - startedAt), 1000));
  }
}

async function refreshCache({ cache, nextRefreshAt, symbol, interval, limit, refreshMs, slowRefreshMs, depthLimit }) {
  const now = Date.now();
  const tasks = [];

  if (now >= nextRefreshAt.premiumIndex) {
    tasks.push(updateCache(cache, nextRefreshAt, 'premiumIndex', client.getPremiumIndex(symbol), refreshMs));
  }

  if (now >= nextRefreshAt.depth) {
    tasks.push(updateCache(cache, nextRefreshAt, 'depth', client.getDepth(symbol, depthLimit), refreshMs));
  }

  if (now >= nextRefreshAt.openInterest) {
    tasks.push(updateCache(cache, nextRefreshAt, 'openInterest', client.getOpenInterest(symbol), slowRefreshMs));
  }

  if (now >= nextRefreshAt.klines) {
    tasks.push(updateCache(cache, nextRefreshAt, 'klines', client.getKlines(symbol, interval, limit), slowRefreshMs));
  }

  if (now >= nextRefreshAt.longShortRatio) {
    tasks.push(updateCache(
      cache,
      nextRefreshAt,
      'longShortRatio',
      client.getGlobalLongShortRatio(symbol, interval, 1).catch(() => null),
      slowRefreshMs,
    ));
  }

  await Promise.all(tasks);
}

async function updateCache(cache, nextRefreshAt, key, promise, refreshMs) {
  cache[key] = await promise;
  nextRefreshAt[key] = Date.now() + refreshMs;
}

function parseArgs(args) {
  const parsed = {
    _: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      continue;
    }

    const [rawKey, rawValue] = arg.slice(2).split('=');
    const nextValue = args[index + 1];

    if (rawValue !== undefined) {
      parsed[rawKey] = rawValue;
    } else if (nextValue && !nextValue.startsWith('--')) {
      parsed[rawKey] = nextValue;
      index += 1;
    } else {
      parsed[rawKey] = true;
    }
  }

  return parsed;
}

function printHumanSummary(analysis) {
  const { price, market, liquidationProxy, orderBook, signal, tradeSetup } = analysis;
  const entry = tradeSetup.entry
    ? `${tradeSetup.entry.low} - ${tradeSetup.entry.high}`
    : 'WAIT';
  const targets = tradeSetup.targets.length ? tradeSetup.targets.join(', ') : '-';

  console.error([
    `${analysis.symbol} mark: ${price.mark}`,
    `signal: ${signal.label} (${signal.score})`,
    `setup: ${tradeSetup.direction.toUpperCase()} | entry: ${entry} | trigger: ${tradeSetup.triggerPrice ?? '-'} | stop: ${tradeSetup.stopLoss ?? '-'}`,
    `targets: ${targets}`,
    `momentum: ${market.momentumPct}% | funding: ${market.fundingRatePct}% | taker buy: ${market.takerBuyRatio}`,
    `liq above/below: ${liquidationProxy.liquidityAbove} / ${liquidationProxy.liquidityBelow} | bias: ${liquidationProxy.bias}`,
    `book bid/ask: ${orderBook.bidNotional} / ${orderBook.askNotional} | imbalance: ${orderBook.imbalance}`,
  ].join('\n'));
}

function printWatchDetails(analysis) {
  const above = analysis.liquidationProxy.strongestAbove.slice(0, 3)
    .map((zone) => `${zone.price} (${zone.distancePct}%)`)
    .join(', ');
  const below = analysis.liquidationProxy.strongestBelow.slice(0, 3)
    .map((zone) => `${zone.price} (${zone.distancePct}%)`)
    .join(', ');

  console.error(`strong above: ${above}`);
  console.error(`strong below: ${below}`);
  console.error(`updated: ${analysis.generatedAt}`);
}

function clearScreen() {
  if (process.stdout.isTTY) {
    process.stdout.write('\u001B[2J\u001B[0;0H');
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
