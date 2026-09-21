import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { selectLiquidHeatmapFlowV2Candidates } from './liquidHeatmapFlowV2.js';
import {
  COINGLASS_WEB_DISCORD_VERSION,
  buildCoinglassWebAuthAlertPayload,
  buildCoinglassWebDiscordPayload,
  buildCoinglassWebZoneEvaluationPayload,
  coinglassWebDiscordDedupeKey,
  selectCoinglassZoneEvaluationRow,
} from './coinglassWebDiscord.js';
import {
  COINGLASS_WEB_BINANCE_VERSION,
  coinglassWebBinanceDedupeKey,
} from './coinglassWebBinance.js';
import {
  COINGLASS_ZONE_LIFECYCLE_DISCORD_VERSION,
  COINGLASS_ZONE_LIFECYCLE_VERSION,
  advanceCoinglassZoneLifecycle,
  buildCoinglassZoneLifecycleDiscordPayload,
} from './coinglassZoneLifecycle.js';
import {
  COINGLASS_STRONG_WAVE_REVERSAL_MARGIN_USDT,
  buildCoinglassStrongWaveReversalDiscordPayload,
  createCoinglassStrongWaveReversalWatch,
} from './coinglassStrongWaveReversal.js';
import {
  COINGLASS_HYBRID_LIQUIDITY_DISCORD_VERSION,
  COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION,
  buildCoinglassHybridLiquidityDiscordPayload,
  coinglassHybridLiquidityDedupeKey,
} from './coinglassHybridLiquidityHunter.js';

export const COINGLASS_WEB_TOP20_VERSION = 'COINGLASS_WEB_QUALIFIED_BINANCE_V14_QUALIFIED_12H24H_20260823';
export const COINGLASS_WEB_SECONDARY_STREAM_VERSION =
  'COINGLASS_WEB_SECONDARY_STREAM_V10_SHORT_BREAKDOWN_ONLY_20260905';
export const COINGLASS_WEB_QUALIFIED_TIMEFRAMES_VERSION = 'COINGLASS_WEB_QUALIFIED_TIMEFRAMES_V1_12H_24H_20260823';
export const COINGLASS_WEB_ZONE_PROPOSAL_VERSION = 'COINGLASS_WEB_ZONE_PROPOSAL_V2_20260817';
export const COIN_LEVEL_COINGLASS_ON_DEMAND_VERSION = 'COIN_LEVEL_COINGLASS_ON_DEMAND_V2_UNICODE_SYMBOL_20260902';
export const COINGLASS_WEB_TOP20_MODE = 'QUALIFIED_BINANCE_AUTO';
export const COINGLASS_WEB_TOP20_ISOLATION = Object.freeze({
  observationOnly: false,
  affectsLiquidFlowV2: false,
  affectsSignals: false,
  affectsPaper: false,
  affectsBinance: true,
  affectsEntry: true,
  affectsSize: true,
  affectsSlTp: true,
});
export const COINGLASS_WEB_SECONDARY_ISOLATION = Object.freeze({
  observationOnly: false,
  qualifiedObservationOnly: true,
  lifecycleOnly: true,
  affectsLiquidFlowV2: false,
  affectsSignals: false,
  affectsPaper: false,
  affectsDiscord: true,
  affectsBinance: true,
  affectsEntry: true,
  affectsSize: true,
  affectsSlTp: true,
});

export function shouldNotifyCoinglassZoneLifecycleEvent({ event = {}, secondary = false } = {}) {
  if (secondary !== true) return true;
  if (event.shouldEnter !== true) return false;
  const side = String(event.entryPlan?.side ?? '').toUpperCase();
  const signalLabel = String(event.entryPlan?.signalLabel ?? '');
  return side !== 'SHORT' || signalLabel === 'BREAKDOWN_ACCEPTED_SHORT_READY';
}

const execFileAsync = promisify(execFile);

async function writeJsonAtomic(path, payload) {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function safeCoinglassSymbol(value) {
  const symbol = String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/^[#$]+/u, '')
    .replace(/[-/_\s]/gu, '');
  return /^[\p{L}\p{N}]{1,40}USDT$/u.test(symbol) ? symbol : '';
}

function safeScheduledCoinglassSymbol(value) {
  const symbol = safeCoinglassSymbol(value);
  return /^[A-Z0-9]{2,24}USDT$/.test(symbol) ? symbol : '';
}

export function selectTopBinanceUsdtPerpetuals(exchangeInfo = {}, tickers = [], limit = 20) {
  const contracts = new Map(
    (Array.isArray(exchangeInfo?.symbols) ? exchangeInfo.symbols : [])
      .filter((row) => (
        row?.status === 'TRADING'
        && row?.contractType === 'PERPETUAL'
        && row?.quoteAsset === 'USDT'
        && safeScheduledCoinglassSymbol(row?.symbol)
      ))
      .map((row) => [safeScheduledCoinglassSymbol(row.symbol), row]),
  );

  return (Array.isArray(tickers) ? tickers : [])
    .map((ticker) => {
      const symbol = safeScheduledCoinglassSymbol(ticker?.symbol);
      const contract = contracts.get(symbol);
      if (!contract) return null;
      return {
        symbol,
        baseAsset: String(contract.baseAsset ?? symbol.replace(/USDT$/, '')),
        quoteAsset: 'USDT',
        quoteVolume24h: Math.max(0, finiteNumber(ticker.quoteVolume, 0)),
        lastPrice: finiteNumber(ticker.lastPrice),
        priceChangePercent24h: finiteNumber(ticker.priceChangePercent),
        tradeCount24h: Math.max(0, Math.trunc(finiteNumber(ticker.count, 0))),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.quoteVolume24h - left.quoteVolume24h)
    .slice(0, Math.max(1, Math.min(1_000, Math.trunc(finiteNumber(limit, 20)))))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function selectBinanceAppMoverCandidates(exchangeInfo = {}, tickers = [], {
  topPerSide = 20,
  maxSymbols = 40,
  minQuoteVolume = 2_000_000,
} = {}) {
  const allMarkets = selectTopBinanceUsdtPerpetuals(exchangeInfo, tickers, 1_000);
  const btc = allMarkets.find((row) => row.symbol === 'BTCUSDT') ?? null;
  const movers = selectLiquidHeatmapFlowV2Candidates(allMarkets.map((row) => ({
    ...row,
    markPrice: row.lastPrice,
    change24hPct: row.priceChangePercent24h,
    quoteVolume: row.quoteVolume24h,
  })), {
    topPerSide: Math.max(1, Math.trunc(finiteNumber(topPerSide, 20))),
    maxSymbols: Math.max(2, Math.trunc(finiteNumber(maxSymbols, 40))),
    minQuoteVolume: Math.max(0, finiteNumber(minQuoteVolume, 2_000_000)),
  });
  const up = movers.filter((row) => row.moverSide === 'UP');
  const down = movers.filter((row) => row.moverSide === 'DOWN');
  const interleaved = [];
  const sideLength = Math.max(up.length, down.length);
  for (let index = 0; index < sideLength; index += 1) {
    if (up[index]) interleaved.push(up[index]);
    if (down[index]) interleaved.push(down[index]);
  }
  return [
    ...(btc ? [{ ...btc, moverSide: 'REFERENCE', moverRank: 0 }] : []),
    ...interleaved,
  ].slice(0, Math.max(1, maxSymbols + (btc ? 1 : 0)))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function sliceCoinglassMoverStream(markets = [], rankOffset = 0, limit = 40) {
  const offset = Math.max(0, Math.min(960, Math.trunc(finiteNumber(rankOffset, 0))));
  const size = Math.max(1, Math.min(40, Math.trunc(finiteNumber(limit, 40))));
  return (Array.isArray(markets) ? markets : [])
    .slice(offset, offset + size)
    .map((row, index) => ({
      ...row,
      globalRank: Math.max(1, Math.trunc(finiteNumber(row?.globalRank ?? row?.rank, offset + index + 1))),
      streamRank: index + 1,
      rank: index + 1,
    }));
}

export function applyBinanceLiquidityFilter(markets = [], metricsBySymbol = {}, limit = 20, thresholds = {}) {
  const required = Math.max(1, Math.min(50, Math.trunc(finiteNumber(limit, 20))));
  const minimums = {
    quoteVolume24h: Math.max(0, finiteNumber(thresholds.quoteVolume24h, 50_000_000)),
    tradeCount24h: Math.max(0, finiteNumber(thresholds.tradeCount24h, 20_000)),
    openInterestNotional: Math.max(0, finiteNumber(thresholds.openInterestNotional, 5_000_000)),
    bookDepthUsd: Math.max(0, finiteNumber(thresholds.bookDepthUsd, 0)),
    maxSpreadBps: Math.max(0, finiteNumber(thresholds.maxSpreadBps, 15)),
  };
  const assessed = markets.map((market) => {
    const metric = metricsBySymbol?.[market.symbol] ?? {};
    const spreadBps = Math.max(0, finiteNumber(metric.spreadBps, Number.POSITIVE_INFINITY));
    const bidDepthUsd = Math.max(0, finiteNumber(metric.bidDepthUsd, 0));
    const askDepthUsd = Math.max(0, finiteNumber(metric.askDepthUsd, 0));
    const bookDepthUsd = Math.min(bidDepthUsd, askDepthUsd);
    const openInterestNotional = Math.max(0, finiteNumber(metric.openInterestNotional, 0));
    const checks = {
      quoteVolume: market.quoteVolume24h >= minimums.quoteVolume24h,
      trades: market.tradeCount24h >= minimums.tradeCount24h,
      openInterest: openInterestNotional >= minimums.openInterestNotional,
      bookDepth: bookDepthUsd >= minimums.bookDepthUsd,
      spread: spreadBps <= minimums.maxSpreadBps,
    };
    const isBtc = market.symbol === 'BTCUSDT';
    const eligible = isBtc || Object.values(checks).every(Boolean);
    const liquidityScore = (
      Math.log10(Math.max(1, market.quoteVolume24h)) * 18
      + Math.log10(Math.max(1, openInterestNotional)) * 22
      + Math.log10(Math.max(1, bookDepthUsd)) * 24
      + Math.log10(Math.max(1, market.tradeCount24h)) * 10
      + Math.max(0, minimums.maxSpreadBps - Math.min(minimums.maxSpreadBps, spreadBps)) * 2
    );
    return {
      ...market,
      binanceLiquidity: {
        eligible,
        forcedBtc: isBtc,
        spreadBps: Number.isFinite(spreadBps) ? spreadBps : null,
        bidDepthUsd,
        askDepthUsd,
        bookDepthUsd,
        openInterestNotional,
        score: Number(liquidityScore.toFixed(2)),
        checks,
        thresholds: minimums,
      },
    };
  });
  const eligiblePool = assessed.filter((market) => market.binanceLiquidity.eligible);
  const eligible = (thresholds.preserveOrder === true
    ? eligiblePool
    : eligiblePool.sort((left, right) => {
      if (left.symbol === 'BTCUSDT') return -1;
      if (right.symbol === 'BTCUSDT') return 1;
      return right.binanceLiquidity.score - left.binanceLiquidity.score;
    }))
    .slice(0, required)
    .map((market, index) => ({ ...market, rank: index + 1 }));
  const selectedSymbols = new Set(eligible.map((market) => market.symbol));
  return {
    assessed,
    rows: eligible,
    excluded: assessed
      .filter((market) => !selectedSymbols.has(market.symbol))
      .map((market) => ({
        symbol: market.symbol,
        quoteVolume24h: market.quoteVolume24h,
        binanceLiquidity: market.binanceLiquidity,
      })),
    thresholds: minimums,
  };
}

function localPeakIndexes(levels) {
  const indexes = [];
  for (let index = 0; index < levels.length; index += 1) {
    const current = levels[index]?.totalIntensity ?? 0;
    const before = levels[index - 1]?.totalIntensity ?? -1;
    const after = levels[index + 1]?.totalIntensity ?? -1;
    if (current >= before && current >= after && current > 0) indexes.push(index);
  }
  return indexes;
}

function liquidationBandRange(level, levels, { maxBins = 5, relativeFloor = 0.28 } = {}) {
  const peakIntensity = Math.max(0, finiteNumber(level?.totalIntensity, 0));
  const threshold = peakIntensity * Math.max(0.05, Math.min(0.9, relativeFloor));
  let lowIndex = level.index;
  let highIndex = level.index;
  const expand = (direction) => {
    let boundary = level.index;
    let bridgedWeakBin = false;
    for (let offset = 1; offset <= maxBins; offset += 1) {
      const index = level.index + direction * offset;
      const neighbor = levels[index];
      if (!neighbor) break;
      const intensity = Math.max(0, finiteNumber(neighbor.totalIntensity, 0));
      if (intensity >= threshold) {
        boundary = index;
        bridgedWeakBin = false;
        continue;
      }
      if (!bridgedWeakBin && intensity >= threshold * 0.35) {
        boundary = index;
        bridgedWeakBin = true;
        continue;
      }
      break;
    }
    return boundary;
  };
  lowIndex = expand(-1);
  highIndex = expand(1);
  const prices = levels
    .slice(Math.min(lowIndex, highIndex), Math.max(lowIndex, highIndex) + 1)
    .map((candidate) => finiteNumber(candidate?.price))
    .filter((price) => Number.isFinite(price));
  let bandLow = prices.length ? Math.min(...prices) : finiteNumber(level?.price);
  let bandHigh = prices.length ? Math.max(...prices) : finiteNumber(level?.price);
  if (bandLow === bandHigh) {
    const neighborSteps = [
      Math.abs(finiteNumber(levels[level.index - 1]?.price, bandLow) - bandLow),
      Math.abs(finiteNumber(levels[level.index + 1]?.price, bandHigh) - bandHigh),
    ].filter((step) => step > 0);
    const halfStep = (neighborSteps.length ? Math.min(...neighborSteps) : Math.abs(bandLow) * 0.001) / 2;
    bandLow -= halfStep;
    bandHigh += halfStep;
  }
  return { bandLow, bandHigh };
}

export function summarizeCoinglassHeatmap(data = {}, { maxZones = 12, minIndexGap = 3 } = {}) {
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  const y = Array.isArray(data?.y) ? data.y.map((value) => finiteNumber(value)) : [];
  const liquidationRows = Array.isArray(data?.liq) ? data.liq : [];
  const lastBar = prices.at(-1);
  const currentPrice = finiteNumber(Array.isArray(lastBar) ? lastBar[4] : null);
  let lastHeatmapX = -1;
  const levels = y.map((price, index) => ({
    index,
    price,
    totalIntensity: 0,
    maxIntensity: 0,
    firstX: null,
    lastX: null,
    xIndexes: new Set(),
  }));

  for (const row of liquidationRows) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const xIndex = Math.trunc(finiteNumber(row[0], -1));
    const yIndex = Math.trunc(finiteNumber(row[1], -1));
    const intensity = Math.max(0, finiteNumber(row[2], 0));
    const level = levels[yIndex];
    if (!level || xIndex < 0 || intensity <= 0) continue;
    lastHeatmapX = Math.max(lastHeatmapX, xIndex);
    level.totalIntensity += intensity;
    level.maxIntensity = Math.max(level.maxIntensity, intensity);
    level.firstX = level.firstX == null ? xIndex : Math.min(level.firstX, xIndex);
    level.lastX = level.lastX == null ? xIndex : Math.max(level.lastX, xIndex);
    level.xIndexes.add(xIndex);
  }

  const candidates = localPeakIndexes(levels)
    .map((index) => levels[index])
    .filter((level) => Number.isFinite(level.price))
    .sort((left, right) => right.totalIntensity - left.totalIntensity);
  const selectSeparated = (pool, count) => {
    const picked = [];
    for (const candidate of pool) {
      if (picked.some((row) => Math.abs(row.index - candidate.index) < minIndexGap)) continue;
      picked.push(candidate);
      if (picked.length >= count) break;
    }
    return picked;
  };
  const zoneLimit = Math.max(1, maxZones);
  const sideLimit = Math.max(1, Math.ceil(zoneLimit / 2));
  const above = currentPrice == null ? [] : candidates.filter((level) => level.price >= currentPrice);
  const below = currentPrice == null ? [] : candidates.filter((level) => level.price < currentPrice);
  const selected = currentPrice == null
    ? selectSeparated(candidates, zoneLimit)
    : [
      ...selectSeparated(above, sideLimit),
      ...selectSeparated(below, sideLimit),
    ].sort((left, right) => right.totalIntensity - left.totalIntensity).slice(0, zoneLimit);
  const toZone = (level, strongestIntensity) => ({
    price: level.price,
    side: currentPrice == null ? 'UNKNOWN' : level.price >= currentPrice ? 'ABOVE' : 'BELOW',
    distancePct: currentPrice > 0 ? ((level.price / currentPrice) - 1) * 100 : null,
    strength: strongestIntensity > 0 ? Math.round((level.totalIntensity / strongestIntensity) * 100) : 0,
    totalIntensity: Math.round(level.totalIntensity),
    maxIntensity: Math.round(level.maxIntensity),
    persistenceBars: level.xIndexes.size,
    firstX: level.firstX,
    lastX: level.lastX,
    ...liquidationBandRange(level, levels),
  });
  const strongestIntensity = Math.max(0, ...selected.map((level) => level.totalIntensity));
  const zones = selected.map((level) => toZone(level, strongestIntensity));
  // Keep a separate edge-only set for the lifecycle evaluator. Existing
  // qualified logic intentionally continues to use `zones` for compatibility.
  const edgeCandidates = candidates.filter((level) => (
    Number.isFinite(level.lastX) && lastHeatmapX >= 0 && lastHeatmapX - level.lastX <= 2
  ));
  const edgeAbove = currentPrice == null ? [] : edgeCandidates.filter((level) => level.price >= currentPrice);
  const edgeBelow = currentPrice == null ? [] : edgeCandidates.filter((level) => level.price < currentPrice);
  const edgeSelected = currentPrice == null
    ? selectSeparated(edgeCandidates, zoneLimit)
    : [
      ...selectSeparated(edgeAbove, sideLimit),
      ...selectSeparated(edgeBelow, sideLimit),
    ].sort((left, right) => right.totalIntensity - left.totalIntensity).slice(0, zoneLimit);
  const strongestEdgeIntensity = Math.max(0, ...edgeSelected.map((level) => level.totalIntensity));
  const edgeZones = edgeSelected.map((level) => toZone(level, strongestEdgeIntensity));

  return {
    instrument: {
      exchange: data?.instrument?.exName ?? null,
      instrumentId: data?.instrument?.instrumentId ?? null,
      baseAsset: data?.instrument?.baseAsset ?? null,
      quoteAsset: data?.instrument?.quoteAsset ?? null,
      contractType: data?.instrument?.contractType ?? null,
    },
    updateTime: finiteNumber(data?.updateTime),
    precision: finiteNumber(data?.precision),
    rangeLow: finiteNumber(data?.rangeLow),
    rangeHigh: finiteNumber(data?.rangeHigh),
    currentPrice,
    latestCandle: Array.isArray(lastBar) ? {
      openTime: finiteNumber(lastBar[0]),
      open: finiteNumber(lastBar[1]),
      high: finiteNumber(lastBar[2]),
      low: finiteNumber(lastBar[3]),
      close: finiteNumber(lastBar[4]),
      volumeUsd: finiteNumber(lastBar[5]),
    } : null,
    candleCount: prices.length,
    lastHeatmapX: lastHeatmapX >= 0 ? lastHeatmapX : null,
    priceLevelCount: y.length,
    liquidationCellCount: liquidationRows.length,
    totalLiquidationIntensity: Math.round(levels.reduce((total, level) => total + level.totalIntensity, 0)),
    zones,
    edgeZones,
  };
}

export function assessCoinglassLiquidity(heatmap = {}, market = {}, thresholds = {}) {
  const minimums = {
    liquidationCells: Math.max(1, finiteNumber(thresholds.liquidationCells, 100)),
    nearbyZones: Math.max(1, finiteNumber(thresholds.nearbyZones, 2)),
    persistenceBars: Math.max(1, finiteNumber(thresholds.persistenceBars, 3)),
    maxDistancePct: Math.max(1, finiteNumber(thresholds.maxDistancePct, 20)),
  };
  const zones = Array.isArray(heatmap?.zones) ? heatmap.zones : [];
  const nearbyZones = zones.filter((zone) => Math.abs(finiteNumber(zone.distancePct, 999)) <= minimums.maxDistancePct);
  const persistentZones = nearbyZones.filter((zone) => finiteNumber(zone.persistenceBars, 0) >= minimums.persistenceBars);
  const liquidationCells = Math.max(0, finiteNumber(heatmap?.liquidationCellCount, 0));
  const isBtc = market?.symbol === 'BTCUSDT';
  const checks = {
    liquidationCells: liquidationCells >= minimums.liquidationCells,
    nearbyZones: nearbyZones.length >= minimums.nearbyZones,
    persistence: persistentZones.length >= 1,
  };
  const score = (
    Math.min(40, Math.log10(Math.max(1, liquidationCells)) * 12)
    + Math.min(30, nearbyZones.length * 5)
    + Math.min(30, persistentZones.reduce((total, zone) => total + Math.min(10, finiteNumber(zone.persistenceBars, 0)), 0))
  );
  return {
    eligible: isBtc || Object.values(checks).every(Boolean),
    forcedBtc: isBtc,
    score: Number(score.toFixed(2)),
    liquidationCells,
    nearbyZoneCount: nearbyZones.length,
    persistentZoneCount: persistentZones.length,
    checks,
    thresholds: minimums,
  };
}

export function buildCoinglassObservedTradePlan({
  action,
  referencePrice,
  targetZone,
  riskZone,
  zones = [],
} = {}) {
  const side = action === 'WAIT_LONG_CONFIRMATION'
    ? 'LONG'
    : action === 'WAIT_SHORT_CONFIRMATION'
      ? 'SHORT'
      : null;
  const entryPrice = finiteNumber(referencePrice);
  const takeProfitPrice = finiteNumber(targetZone?.price);
  const stopLossPrice = finiteNumber(riskZone?.price);
  const correctDirection = side === 'LONG'
    ? takeProfitPrice > entryPrice && stopLossPrice < entryPrice
    : side === 'SHORT'
      ? takeProfitPrice < entryPrice && stopLossPrice > entryPrice
      : false;
  const rewardPct = correctDirection ? (Math.abs(takeProfitPrice - entryPrice) / entryPrice) * 100 : null;
  const riskPct = correctDirection ? (Math.abs(entryPrice - stopLossPrice) / entryPrice) * 100 : null;
  const rewardRiskRatio = rewardPct > 0 && riskPct > 0 ? rewardPct / riskPct : null;
  const extension = correctDirection
    ? zones
      .filter((zone) => {
        const price = finiteNumber(zone?.price);
        return side === 'LONG' ? price > takeProfitPrice : price < takeProfitPrice;
      })
      .sort((left, right) => (
        side === 'LONG'
          ? finiteNumber(left.price, Infinity) - finiteNumber(right.price, Infinity)
          : finiteNumber(right.price, -Infinity) - finiteNumber(left.price, -Infinity)
      ))[0] ?? null
    : null;
  const complete = Boolean(correctDirection && rewardRiskRatio >= 1);
  return {
    version: 'COINGLASS_OBSERVED_TRADE_PLAN_V1_20260817',
    mode: COINGLASS_WEB_TOP20_MODE,
    complete,
    side,
    entry: entryPrice > 0 ? {
      type: 'CONFIRMATION_REFERENCE',
      price: entryPrice,
      instruction: side === 'LONG'
        ? 'Chỉ kích hoạt sau reclaim/giữ hỗ trợ hoặc breakout-retest.'
        : side === 'SHORT'
          ? 'Chỉ kích hoạt sau sweep-reject hoặc breakdown-retest.'
          : 'Chưa có hướng giao dịch.',
    } : null,
    takeProfit: correctDirection ? {
      price: takeProfitPrice,
      distancePct: Number(rewardPct.toFixed(2)),
      source: 'PRIMARY_LIQUIDATION_TARGET',
    } : null,
    takeProfit2: extension ? {
      price: finiteNumber(extension.price),
      distancePct: Number((Math.abs(finiteNumber(extension.price) - entryPrice) / entryPrice * 100).toFixed(2)),
      source: 'NEXT_LIQUIDATION_ZONE',
    } : null,
    stopLoss: correctDirection ? {
      price: stopLossPrice,
      distancePct: Number(riskPct.toFixed(2)),
      source: 'OPPOSITE_LIQUIDATION_INVALIDATION',
    } : null,
    rewardPct: rewardPct == null ? null : Number(rewardPct.toFixed(2)),
    riskPct: riskPct == null ? null : Number(riskPct.toFixed(2)),
    rewardRiskRatio: rewardRiskRatio == null ? null : Number(rewardRiskRatio.toFixed(2)),
    minimumRewardRiskRatio: 1,
    reason: complete
      ? 'Đủ Entry tham chiếu, TP, SL đúng phía và R:R >= 1.'
      : 'Thiếu vùng TP/SL đúng phía hoặc R:R < 1; không gửi Discord.',
    affectedTrading: false,
  };
}

export function buildCoinglassZoneProposal(heatmap = {}, market = {}) {
  const referencePrice = finiteNumber(market?.lastPrice, finiteNumber(heatmap?.currentPrice));
  const rawZones = Array.isArray(heatmap?.zones) ? heatmap.zones : [];
  const zones = referencePrice > 0
    ? rawZones.map((zone) => ({
      ...zone,
      side: finiteNumber(zone.price, 0) >= referencePrice ? 'ABOVE' : 'BELOW',
      distancePct: ((finiteNumber(zone.price, 0) / referencePrice) - 1) * 100,
    })).filter((zone) => zone.price > 0 && Math.abs(zone.distancePct) <= 20)
    : [];
  const scored = zones.map((zone) => ({
    ...zone,
    attractionScore: (
      Math.max(0, finiteNumber(zone.strength, 0))
      * Math.exp(-Math.abs(zone.distancePct) / 8)
      * (1 + Math.min(50, finiteNumber(zone.persistenceBars, 0)) / 100)
    ),
  }));
  const side = (name) => scored
    .filter((zone) => zone.side === name)
    .sort((left, right) => right.attractionScore - left.attractionScore);
  const above = side('ABOVE');
  const below = side('BELOW');
  const aboveScore = above.slice(0, 3).reduce((total, zone) => total + zone.attractionScore, 0);
  const belowScore = below.slice(0, 3).reduce((total, zone) => total + zone.attractionScore, 0);
  const totalScore = aboveScore + belowScore;
  const dominancePct = totalScore > 0 ? ((aboveScore - belowScore) / totalScore) * 100 : 0;
  const common = {
    version: COINGLASS_WEB_ZONE_PROPOSAL_VERSION,
    mode: COINGLASS_WEB_TOP20_MODE,
    referencePrice,
    aboveScore: Number(aboveScore.toFixed(2)),
    belowScore: Number(belowScore.toFixed(2)),
    dominancePct: Number(dominancePct.toFixed(2)),
    affectedTrading: false,
  };
  if (!(referencePrice > 0) || !scored.length) {
    return {
      ...common,
      action: 'NO_DATA',
      label: 'CHƯA ĐỦ VÙNG THANH LÝ',
      targetZone: null,
      riskZone: null,
      tradePlan: buildCoinglassObservedTradePlan({ action: 'NO_DATA', referencePrice }),
      rationale: 'Chưa có dữ liệu structured đủ gần giá để đưa ra thiên hướng.',
      confirmation: 'Đăng nhập collector và cào lại dữ liệu Model 3.',
      invalidation: null,
    };
  }
  if (above[0] && aboveScore >= belowScore * 1.25 && above[0].distancePct <= 15) {
    const action = 'WAIT_LONG_CONFIRMATION';
    const targetZone = above[0];
    const riskZone = below[0] ?? null;
    return {
      ...common,
      action,
      label: 'ƯU TIÊN CANH LONG',
      targetZone,
      riskZone,
      tradePlan: buildCoinglassObservedTradePlan({ action, referencePrice, targetZone, riskZone, zones: scored }),
      rationale: `Lực hút thanh lý phía trên mạnh hơn ${Math.abs(dominancePct).toFixed(0)}% theo điểm cân bằng hai phía.`,
      confirmation: 'Chỉ xem xét LONG sau reclaim/giữ hỗ trợ hoặc breakout-retest; không đuổi market.',
      invalidation: below[0] ? `Mất cấu trúc hoặc đóng dưới vùng ${below[0].price}.` : 'Mất cấu trúc tăng gần nhất.',
    };
  }
  if (below[0] && belowScore >= aboveScore * 1.25 && Math.abs(below[0].distancePct) <= 15) {
    const action = 'WAIT_SHORT_CONFIRMATION';
    const targetZone = below[0];
    const riskZone = above[0] ?? null;
    return {
      ...common,
      action,
      label: 'ƯU TIÊN CANH SHORT',
      targetZone,
      riskZone,
      tradePlan: buildCoinglassObservedTradePlan({ action, referencePrice, targetZone, riskZone, zones: scored }),
      rationale: `Lực hút thanh lý phía dưới mạnh hơn ${Math.abs(dominancePct).toFixed(0)}% theo điểm cân bằng hai phía.`,
      confirmation: 'Chỉ xem xét SHORT sau sweep-reject hoặc breakdown-retest; không đuổi market.',
      invalidation: above[0] ? `Mất cấu trúc hoặc đóng trên vùng ${above[0].price}.` : 'Mất cấu trúc giảm gần nhất.',
    };
  }
  const strongest = scored.sort((left, right) => right.attractionScore - left.attractionScore)[0] ?? null;
  return {
    ...common,
    action: 'WAIT_BALANCED',
    label: 'CHỜ XÁC NHẬN — HAI PHÍA CÂN BẰNG',
    targetZone: strongest,
    riskZone: strongest?.side === 'ABOVE' ? below[0] ?? null : above[0] ?? null,
    tradePlan: buildCoinglassObservedTradePlan({ action: 'WAIT_BALANCED', referencePrice }),
    rationale: 'Hai phía chưa chênh đủ 25%, không có lợi thế định hướng rõ.',
    confirmation: 'Chờ giá sweep một vùng rồi reclaim/reject trước khi đánh giá lại.',
    invalidation: 'Không áp dụng vì đây chỉ là quan sát, chưa phải setup vào lệnh.',
  };
}

export function qualifyCoinglassOpportunity(row = {}) {
  const reasons = [];
  if (row.symbol === 'BTCUSDT' || row.moverSide === 'REFERENCE') reasons.push('BTC_REFERENCE_ONLY');
  if (row.status !== 'OK' || row.stale) reasons.push('STALE_OR_FETCH_FAILED');
  if (!row.binanceLiquidity?.eligible) reasons.push('BINANCE_LIQUIDITY_NOT_ELIGIBLE');
  if (!row.heatmapLiquidity?.eligible || Number(row.heatmap?.liquidationCellCount ?? 0) <= 0) {
    reasons.push('COINGLASS_CLUSTERS_NOT_ELIGIBLE');
  }
  if (!['WAIT_LONG_CONFIRMATION', 'WAIT_SHORT_CONFIRMATION'].includes(row.proposal?.action)) {
    reasons.push('NO_DIRECTIONAL_EDGE');
  }
  if (!row.proposal?.tradePlan?.complete) reasons.push('INCOMPLETE_TRADE_PLAN');
  return {
    qualified: reasons.length === 0,
    reasons,
    observeOnly: false,
    discordEligible: reasons.length === 0,
    binanceEligible: reasons.length === 0,
  };
}

export function mergeLastGoodHeatmapRows({ markets = [], freshRows = [], failures = [], previousRows = [] } = {}) {
  const freshBySymbol = new Map(freshRows.map((row) => [row.symbol, row]));
  const failureBySymbol = new Map(failures.map((row) => [row.symbol, row]));
  const previousBySymbol = new Map(previousRows.map((row) => [row.symbol, row]));
  return markets.flatMap((market) => {
    const fresh = freshBySymbol.get(market.symbol);
    if (fresh) return [fresh];
    const previous = previousBySymbol.get(market.symbol);
    if (!previous) return [{
      ...market,
      status: 'FETCH_FAILED',
      stale: false,
      lastError: failureBySymbol.get(market.symbol)?.error ?? 'Fresh capture unavailable',
      heatmap: null,
      proposal: null,
    }];
    return [{
      ...previous,
      ...market,
      status: 'STALE_LAST_GOOD',
      stale: true,
      lastError: failureBySymbol.get(market.symbol)?.error ?? 'Fresh capture unavailable',
    }];
  });
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export class CoinGlassWebTop20Manager {
  constructor({
    rootDir,
    dataDir = join(rootDir, 'data', 'coinglass-web-top20'),
    streamId = 'primary',
    onQualifiedRow = null,
    onZoneLifecycleSignal = null,
    onZoneLifecyclePaper = null,
    onZoneLifecycleReversalWatch = null,
    onHybridLiquidityScan = null,
    onHybridLiquiditySignal = null,
    onHybridLiquidityPaper = null,
    resolveBinanceSettings = null,
  } = {}) {
    if (!rootDir) throw new Error('rootDir is required');
    this.rootDir = rootDir;
    this.dataDir = dataDir;
    this.streamId = streamId === 'secondary' ? 'secondary' : 'primary';
    this.secondary = this.streamId === 'secondary';
    this.logPrefix = this.secondary ? 'CoinGlassWebSecondary' : 'CoinGlassWebTop20';
    this.snapshotFile = join(dataDir, 'snapshot.json');
    this.progressFile = join(dataDir, 'progress.json');
    this.authFile = join(dataDir, 'auth.json');
    this.notificationFile = join(dataDir, 'notifications.json');
    this.executionFile = join(dataDir, 'binance-executions.json');
    this.zoneLifecycleFile = join(dataDir, 'zone-lifecycle.json');
    this.hybridLiquidityFile = join(dataDir, 'hybrid-liquidity-hunter.json');
    this.onQualifiedRow = typeof onQualifiedRow === 'function' ? onQualifiedRow : null;
    this.onZoneLifecycleSignal = typeof onZoneLifecycleSignal === 'function'
      ? onZoneLifecycleSignal
      : null;
    this.onZoneLifecyclePaper = typeof onZoneLifecyclePaper === 'function'
      ? onZoneLifecyclePaper
      : null;
    this.onZoneLifecycleReversalWatch = typeof onZoneLifecycleReversalWatch === 'function'
      ? onZoneLifecycleReversalWatch
      : null;
    this.onHybridLiquidityScan = typeof onHybridLiquidityScan === 'function'
      ? onHybridLiquidityScan
      : null;
    this.onHybridLiquiditySignal = typeof onHybridLiquiditySignal === 'function'
      ? onHybridLiquiditySignal
      : null;
    this.onHybridLiquidityPaper = typeof onHybridLiquidityPaper === 'function'
      ? onHybridLiquidityPaper
      : null;
    this.resolveBinanceSettings = typeof resolveBinanceSettings === 'function'
      ? resolveBinanceSettings
      : null;
    this.running = false;
    this.startedAt = null;
    this.lastError = null;
    this.inflight = null;
    this.loginRunning = false;
    this.loginStartedAt = null;
    this.loginError = null;
    this.loginInflight = null;
    this.schedulerTimer = null;
    this.schedulerStartedAt = null;
    this.schedulerNextRunAt = null;
    this.schedulerLastTickAt = null;
    this.lastZoneEvaluationAt = null;
    this.lastZoneEvaluationSymbol = null;
    this.lastZoneLifecycleAt = null;
    this.lastZoneLifecycleEvent = null;
    this.lastHybridLiquidityAt = null;
    this.lastHybridLiquiditySignal = null;
    this.onDemandRunning = false;
    this.onDemandSymbol = null;
    this.onDemandJobs = new Map();
  }

  config() {
    const secondary = this.secondary;
    const configuredLimit = secondary
      ? finiteNumber(process.env.COINGLASS_WEB_SECONDARY_LIMIT, 40)
      : finiteNumber(
        process.env.COINGLASS_WEB_SCAN_LIMIT
        ?? process.env.COINGLASS_WEB_TOP20_LIMIT
        ?? 40,
        40,
      );
    const rankOffset = secondary
      ? Math.max(0, Math.min(960, Math.trunc(finiteNumber(process.env.COINGLASS_WEB_SECONDARY_RANK_OFFSET, 40))))
      : 0;
    const limit = Math.max(1, Math.min(40, Math.trunc(configuredLimit)));
    const secondaryLifecycleEnabled = secondary
      && process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_ENABLED === 'true';
    const secondaryLifecycleBinanceEnabled = secondaryLifecycleEnabled
      && process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_BINANCE_ENABLED === 'true';
    return {
      streamId: this.streamId,
      streamVersion: secondary ? COINGLASS_WEB_SECONDARY_STREAM_VERSION : COINGLASS_WEB_TOP20_VERSION,
      observationOnly: secondary ? !secondaryLifecycleEnabled : false,
      qualifiedObservationOnly: secondary,
      lifecycleOnly: secondary,
      enabled: secondary
        ? process.env.COINGLASS_WEB_SECONDARY_ENABLED !== 'false'
        : process.env.COINGLASS_WEB_TOP20_ENABLED !== 'false',
      limit,
      rankOffset,
      rankFrom: rankOffset + 1,
      rankTo: rankOffset + limit,
      range: '48h',
      browserMode: process.env.COINGLASS_WEB_BROWSER_MODE ?? 'headless',
      captureImages: process.env.COINGLASS_WEB_CAPTURE_IMAGES === 'true',
      disableGpu: process.env.COINGLASS_WEB_DISABLE_GPU !== 'false',
      viewportWidth: Math.max(480, Math.min(1280, finiteNumber(process.env.COINGLASS_WEB_VIEWPORT_WIDTH, 1280))),
      viewportHeight: Math.max(360, Math.min(900, finiteNumber(process.env.COINGLASS_WEB_VIEWPORT_HEIGHT, 900))),
      browserConcurrency: Math.max(1, Math.min(4, Math.trunc(finiteNumber(
        secondary ? process.env.COINGLASS_WEB_SECONDARY_BROWSER_CONCURRENCY : process.env.COINGLASS_WEB_BROWSER_CONCURRENCY,
        4,
      )))),
      niceLevel: secondary
        ? Math.max(0, Math.min(19, Math.trunc(finiteNumber(process.env.COINGLASS_WEB_SECONDARY_NICE_LEVEL, 10))))
        : 0,
      timeoutMs: Math.max(120_000, finiteNumber(
        secondary ? process.env.COINGLASS_WEB_SECONDARY_TIMEOUT_MS : process.env.COINGLASS_WEB_TOP20_TIMEOUT_MS,
        12 * 60_000,
      )),
      loginTimeoutMs: Math.max(120_000, finiteNumber(
        secondary ? process.env.COINGLASS_WEB_SECONDARY_LOGIN_TIMEOUT_MS : process.env.COINGLASS_WEB_LOGIN_TIMEOUT_MS,
        10 * 60_000,
      )),
      schedulerEnabled: secondary
        ? process.env.COINGLASS_WEB_SECONDARY_SCHEDULER_ENABLED !== 'false'
        : process.env.COINGLASS_WEB_SCHEDULER_ENABLED !== 'false',
      schedulerIntervalMs: Math.max(180_000, finiteNumber(
        secondary ? process.env.COINGLASS_WEB_SECONDARY_SCAN_INTERVAL_MS : process.env.COINGLASS_WEB_SCAN_INTERVAL_MS,
        secondary ? 360_000 : 180_000,
      )),
      schedulerInitialDelayMs: Math.max(5_000, finiteNumber(
        secondary ? process.env.COINGLASS_WEB_SECONDARY_INITIAL_DELAY_MS : null,
        secondary ? 270_000 : 180_000,
      )),
      scanBudgetMs: Math.max(60_000, Math.min(150_000, finiteNumber(
        secondary ? process.env.COINGLASS_WEB_SECONDARY_SCAN_BUDGET_MS : process.env.COINGLASS_WEB_SCAN_BUDGET_MS,
        150_000,
      ))),
      discordConfigured: !secondary && Boolean(this.discordWebhookUrl()),
      zoneEvaluationDiscordConfigured: !secondary && Boolean(this.zoneEvaluationWebhookUrl()),
      zoneLifecycleEnabled: secondary
        ? secondaryLifecycleEnabled
        : process.env.COINGLASS_ZONE_LIFECYCLE_ENABLED !== 'false',
      zoneLifecycleDiscordConfigured: secondary
        ? secondaryLifecycleEnabled && Boolean(this.zoneLifecycleWebhookUrl())
        : Boolean(this.zoneLifecycleWebhookUrl()),
      zoneLifecycleBinanceEnabled: secondary
        ? secondaryLifecycleBinanceEnabled
        : process.env.COINGLASS_ZONE_LIFECYCLE_BINANCE_ENABLED === 'true',
      zoneLifecycleMarginUsdt: Math.max(0.01, finiteNumber(
        secondary
          ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_MARGIN_USDT
          : process.env.COINGLASS_ZONE_LIFECYCLE_MARGIN_USDT,
        secondary ? 2.5 : 2,
      )),
      zoneLifecycleAcceptedBreakoutMarginUsdt: Math.max(0.01, finiteNumber(
        secondary
          ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_ACCEPTED_MARGIN_USDT
          : process.env.COINGLASS_ZONE_LIFECYCLE_ACCEPTED_MARGIN_USDT,
        10,
      )),
      zoneLifecycleUnconfirmedBounceLongMarginUsdt: Math.max(0.01, finiteNumber(
        secondary
          ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_UNCONFIRMED_BOUNCE_MARGIN_USDT
          : process.env.COINGLASS_ZONE_LIFECYCLE_UNCONFIRMED_BOUNCE_MARGIN_USDT,
        5,
      )),
      zoneLifecycleFixedTakeProfitRoePct: Math.max(0, finiteNumber(
        secondary
          ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_TAKE_PROFIT_ROE_PCT
          : process.env.COINGLASS_ZONE_LIFECYCLE_TAKE_PROFIT_ROE_PCT,
        secondary ? 6 : 0,
      )),
      zoneLifecycleSupportReclaimMarginUsdt: Math.max(0.01, finiteNumber(
        secondary
          ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_SUPPORT_RECLAIM_MARGIN_USDT
          : process.env.COINGLASS_ZONE_LIFECYCLE_SUPPORT_RECLAIM_MARGIN_USDT,
        secondary ? 2.5 : 3,
      )),
      zoneLifecycleStrongShortMarginUsdt: Math.max(0.01, finiteNumber(
        secondary
          ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_STRONG_SHORT_MARGIN_USDT
          : process.env.COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_MARGIN_USDT,
        secondary ? 2.5 : 2,
      )),
      zoneLifecycleLargeTargetThresholdPct: Math.max(0, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_LARGE_TARGET_THRESHOLD_PCT,
        5,
      )),
      zoneLifecycleLargeTargetMarginUsdt: Math.max(0.01, finiteNumber(
        secondary
          ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_LARGE_TARGET_MARGIN_USDT
          : process.env.COINGLASS_ZONE_LIFECYCLE_LARGE_TARGET_MARGIN_USDT,
        secondary ? 2.5 : 2,
      )),
      zoneLifecycleLongSingleTargetMaxPct: Math.max(0, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_LONG_SINGLE_TARGET_MAX_PCT,
        3,
      )),
      zoneLifecycleLongTp1DistancePct: Math.max(0.1, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_LONG_TP1_DISTANCE_PCT,
        2,
      )),
      zoneLifecycleLongTp1CloseRatio: Math.max(0.05, Math.min(0.95, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_LONG_TP1_CLOSE_RATIO,
        0.7,
      ))),
      zoneLifecycleLongTp2CapPct: Math.max(0.1, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_LONG_TP2_CAP_PCT,
        5,
      )),
      zoneLifecycleShortSingleTargetMaxPct: Math.max(0, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_SHORT_SINGLE_TARGET_MAX_PCT,
        3,
      )),
      zoneLifecycleShortTp1DistancePct: Math.max(0.1, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_SHORT_TP1_DISTANCE_PCT,
        2,
      )),
      zoneLifecycleShortTp1CloseRatio: Math.max(0.05, Math.min(0.95, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_SHORT_TP1_CLOSE_RATIO,
        0.7,
      ))),
      zoneLifecycleShortTp2CapPct: Math.max(0.1, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_SHORT_TP2_CAP_PCT,
        5,
      )),
      zoneLifecycleShortStrongWaveChange24hPct: Math.max(0, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_SHORT_STRONG_WAVE_CHANGE_24H_PCT,
        10,
      )),
      zoneLifecycleShortStrongTakeProfitRoePct: Math.max(0.1, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_SHORT_STRONG_TAKE_PROFIT_ROE_PCT,
        5,
      )),
      zoneLifecycleShortStrongTp1DistancePct: Math.max(0.1, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_SHORT_STRONG_TP1_DISTANCE_PCT,
        1,
      )),
      zoneLifecycleShortStrongTp1CloseRatio: Math.max(0.05, Math.min(0.95, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_SHORT_STRONG_TP1_CLOSE_RATIO,
        0.8,
      ))),
      zoneLifecycleShortStrongTp2CapPct: Math.max(0.1, finiteNumber(
        process.env.COINGLASS_ZONE_LIFECYCLE_SHORT_STRONG_TP2_CAP_PCT,
        3,
      )),
      zoneLifecycleLeverage: Math.max(1, Math.min(125, finiteNumber(
        secondary
          ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_LEVERAGE
          : process.env.COINGLASS_ZONE_LIFECYCLE_LEVERAGE,
        5,
      ))),
      zoneLifecycleMaxSlippagePct: Math.max(0.1, finiteNumber(process.env.COINGLASS_ZONE_LIFECYCLE_MAX_SLIPPAGE_PCT, 1.5)),
      zoneLifecycleMaxPositions: Math.max(0, finiteNumber(
        secondary
          ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_MAX_POSITIONS
          : process.env.COINGLASS_ZONE_LIFECYCLE_MAX_POSITIONS,
        30,
      )),
      zoneLifecycleReversalEnabled: secondary
        ? secondaryLifecycleBinanceEnabled
        : process.env.COINGLASS_ZONE_LIFECYCLE_REVERSAL_ENABLED !== 'false',
      zoneLifecycleReversalMarginUsdt: Math.max(0.01, finiteNumber(
        secondary
          ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_REVERSAL_MARGIN_USDT
          : process.env.COINGLASS_ZONE_LIFECYCLE_REVERSAL_MARGIN_USDT,
        COINGLASS_STRONG_WAVE_REVERSAL_MARGIN_USDT,
      )),
      hybridLiquidityEnabled: process.env.COINGLASS_HYBRID_LIQUIDITY_ENABLED === 'true',
      hybridLiquidityDiscordConfigured: Boolean(this.hybridLiquidityWebhookUrl()),
      hybridLiquidityMaxCandidates: Math.max(1, Math.min(12, Math.trunc(finiteNumber(
        process.env.COINGLASS_HYBRID_LIQUIDITY_MAX_CANDIDATES,
        8,
      )))),
      hybridLiquidityMaxZoneDistancePct: Math.max(3, Math.min(40, finiteNumber(
        process.env.COINGLASS_HYBRID_LIQUIDITY_MAX_ZONE_DISTANCE_PCT,
        25,
      ))),
      hybridLiquidityMinZonesPerSide: Math.max(1, Math.min(6, Math.trunc(finiteNumber(
        process.env.COINGLASS_HYBRID_LIQUIDITY_MIN_ZONES_PER_SIDE,
        2,
      )))),
      hybridLiquidityMaxSideScoreRatio: Math.max(1, Math.min(10, finiteNumber(
        process.env.COINGLASS_HYBRID_LIQUIDITY_MAX_SIDE_SCORE_RATIO,
        3,
      ))),
      hybridLiquidityDiscordCooldownMs: Math.max(180_000, finiteNumber(
        process.env.COINGLASS_HYBRID_LIQUIDITY_DISCORD_COOLDOWN_MS,
        4 * 60 * 60_000,
      )),
      discordSignalCooldownMs: Math.max(180_000, finiteNumber(process.env.COINGLASS_WEB_DISCORD_SIGNAL_COOLDOWN_MS, 30 * 60_000)),
      discordAuthCooldownMs: Math.max(180_000, finiteNumber(process.env.COINGLASS_WEB_DISCORD_AUTH_COOLDOWN_MS, 60 * 60_000)),
      binanceEnabled: !secondary && process.env.COINGLASS_WEB_BINANCE_ENABLED !== 'false',
      binanceMarginUsdt: Math.max(0.01, finiteNumber(process.env.COINGLASS_WEB_BINANCE_MARGIN_USDT, 2)),
      binanceLeverage: Math.max(1, Math.min(125, finiteNumber(process.env.COINGLASS_WEB_BINANCE_LEVERAGE, 5))),
      binanceStopLossRoePct: Math.max(1, finiteNumber(process.env.COINGLASS_WEB_BINANCE_STOP_LOSS_ROE_PCT, 20)),
      binanceDedupeMs: Math.max(180_000, finiteNumber(process.env.COINGLASS_WEB_BINANCE_DEDUPE_MS, 4 * 60 * 60_000)),
    };
  }

  discordWebhookUrl() {
    return String(
      process.env.COINGLASS_WEB_DISCORD_WEBHOOK_URL
      || process.env.LIQ_SCAN_WEBHOOK_URL
      || process.env.DISCORD_WEBHOOK_URL
      || '',
    ).trim();
  }

  zoneEvaluationWebhookUrl() {
    return String(process.env.COINGLASS_WEB_ZONE_EVALUATION_WEBHOOK_URL || '').trim();
  }

  zoneLifecycleWebhookUrl() {
    return String(
      (this.secondary
        ? process.env.COINGLASS_WEB_SECONDARY_ZONE_LIFECYCLE_DISCORD_WEBHOOK_URL
        : process.env.COINGLASS_ZONE_LIFECYCLE_DISCORD_WEBHOOK_URL)
        || '',
    ).trim();
  }

  hybridLiquidityWebhookUrl() {
    return String(process.env.COINGLASS_HYBRID_LIQUIDITY_DISCORD_WEBHOOK_URL || '').trim();
  }

  async binanceExecutionState() {
    return readJson(this.executionFile, {
      version: COINGLASS_WEB_BINANCE_VERSION,
      submitted: {},
      recent: [],
    });
  }

  async zoneLifecycleState() {
    return readJson(this.zoneLifecycleFile, {
      version: COINGLASS_ZONE_LIFECYCLE_VERSION,
      tracks: {},
      processedEvents: {},
      recent: [],
      strongWaveReversalWatches: {},
    });
  }

  async snapshot() {
    const [saved, progress, auth, notifications, executions, zoneLifecycle, hybridLiquidity] = await Promise.all([
      readJson(this.snapshotFile, null),
      this.running ? readJson(this.progressFile, null) : Promise.resolve(null),
      readJson(this.authFile, null),
      readJson(this.notificationFile, null),
      readJson(this.executionFile, null),
      readJson(this.zoneLifecycleFile, null),
      readJson(this.hybridLiquidityFile, null),
    ]);
    const savedRows = Array.isArray(saved?.rows) ? saved.rows : [];
    const moverUniverseCompatible = saved?.version === COINGLASS_WEB_TOP20_VERSION;
    const rows = savedRows
      .map((row) => {
        const heatmapLiquidity = row?.heatmapLiquidity ?? assessCoinglassLiquidity(row?.heatmap, row);
        return {
          ...row,
          heatmapLiquidity,
          proposal: row?.proposal?.version === COINGLASS_WEB_ZONE_PROPOSAL_VERSION
            ? row.proposal
            : buildCoinglassZoneProposal(row?.heatmap, row),
        };
      })
      .map((row) => ({ ...row, qualification: qualifyCoinglassOpportunity(row) }))
      .map((row) => ({ ...row, qualified: row.qualification.qualified }))
      .filter((row) => (
        row.symbol === 'BTCUSDT' || (
          moverUniverseCompatible
          && ['UP', 'DOWN'].includes(row.moverSide)
          && Number(row.moverRank) >= 1
        )
      ))
      .slice(0, this.config().limit)
      .map((row, index) => ({ ...row, rank: index + 1 }));
    return {
      version: COINGLASS_WEB_TOP20_VERSION,
      streamId: this.streamId,
      streamVersion: this.config().streamVersion,
      mode: COINGLASS_WEB_TOP20_MODE,
      isolation: this.secondary ? COINGLASS_WEB_SECONDARY_ISOLATION : COINGLASS_WEB_TOP20_ISOLATION,
      config: this.config(),
      running: this.running,
      startedAt: this.startedAt,
      error: this.lastError,
      loginRunning: this.loginRunning,
      loginStartedAt: this.loginStartedAt,
      loginError: this.loginError,
      auth,
      scheduler: {
        enabled: this.config().schedulerEnabled,
        intervalMs: this.config().schedulerIntervalMs,
        active: Boolean(this.schedulerTimer),
        startedAt: this.schedulerStartedAt,
        nextRunAt: this.schedulerNextRunAt,
        lastTickAt: this.schedulerLastTickAt,
      },
      notifications: {
        version: COINGLASS_WEB_DISCORD_VERSION,
        configured: this.config().discordConfigured,
        lastAuthAlertAt: notifications?.lastAuthAlertAt ?? null,
        lastSignalAt: notifications?.lastSignalAt ?? null,
        zoneEvaluationConfigured: this.config().zoneEvaluationDiscordConfigured,
        lastZoneEvaluationAt: this.lastZoneEvaluationAt,
        lastZoneEvaluationSymbol: this.lastZoneEvaluationSymbol,
        sentSignals: Object.keys(notifications?.signalSent ?? {}).length,
        zoneLifecycleVersion: COINGLASS_ZONE_LIFECYCLE_VERSION,
        zoneLifecycleDiscordVersion: COINGLASS_ZONE_LIFECYCLE_DISCORD_VERSION,
        zoneLifecycleEnabled: this.config().zoneLifecycleEnabled,
        zoneLifecycleDiscordConfigured: this.config().zoneLifecycleDiscordConfigured,
        zoneLifecycleBinanceEnabled: this.config().zoneLifecycleBinanceEnabled,
        lastZoneLifecycleAt: this.lastZoneLifecycleAt ?? zoneLifecycle?.updatedAt ?? null,
        lastZoneLifecycleEvent: this.lastZoneLifecycleEvent ?? zoneLifecycle?.recent?.[0] ?? null,
        zoneLifecycleTracks: Object.keys(zoneLifecycle?.tracks ?? {}).length,
        hybridLiquidityVersion: COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION,
        hybridLiquidityDiscordVersion: COINGLASS_HYBRID_LIQUIDITY_DISCORD_VERSION,
        hybridLiquidityEnabled: this.config().hybridLiquidityEnabled,
        hybridLiquidityDiscordConfigured: this.config().hybridLiquidityDiscordConfigured,
        lastHybridLiquidityAt: this.lastHybridLiquidityAt ?? hybridLiquidity?.updatedAt ?? null,
        lastHybridLiquiditySignal: this.lastHybridLiquiditySignal ?? hybridLiquidity?.recent?.[0] ?? null,
        hybridLiquiditySentSignals: Object.keys(hybridLiquidity?.signalSent ?? {}).length,
        recent: Array.isArray(notifications?.recent) ? notifications.recent.slice(0, 20) : [],
      },
      binanceExecutions: {
        version: COINGLASS_WEB_BINANCE_VERSION,
        enabled: this.config().binanceEnabled,
        submitted: Object.keys(executions?.submitted ?? {}).length,
        recent: Array.isArray(executions?.recent) ? executions.recent.slice(0, 20) : [],
      },
      progress,
      updatedAt: saved?.updatedAt ?? null,
      source: saved?.source ? { ...saved.source, viewLiquidityExcluded: Math.max(0, savedRows.length - rows.length) } : null,
      rows,
      failures: Array.isArray(saved?.failures) ? saved.failures : [],
      exclusions: saved?.exclusions ?? { binance: [], coinglass: [] },
    };
  }

  async startRefresh(reason = 'manual') {
    const config = this.config();
    if (!config.enabled) {
      return { accepted: false, reason: 'disabled', snapshot: await this.snapshot() };
    }
    if (this.running || this.onDemandRunning) {
      return { accepted: false, reason: 'already_running', snapshot: await this.snapshot() };
    }
    if (this.loginRunning) {
      return { accepted: false, reason: 'login_running', snapshot: await this.snapshot() };
    }
    if (reason === 'scheduled') {
      const auth = await readJson(this.authFile, null);
      if (!auth?.altcoinAccess) {
        this.notifyAuthRequired(auth?.message || 'Phiên collector chưa có quyền CoinGlass Model 3 altcoin.')
          .catch((error) => console.warn(`[${this.logPrefix}] auth alert failed: ${error.message}`));
        return { accepted: false, reason: 'auth_required', snapshot: await this.snapshot() };
      }
    }
    await mkdir(this.dataDir, { recursive: true });
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.lastError = null;
    this.inflight = this.runCollector({ ...config, reason })
      .then(() => this.handleCompletedRefresh()
        .catch((error) => console.warn(`[${this.logPrefix}] post-refresh notify failed: ${error.message}`)))
      .catch((error) => {
        this.lastError = String(error?.message ?? error);
        console.warn(`[${this.logPrefix}] refresh failed: ${this.lastError}`);
      })
      .finally(() => {
        this.running = false;
        this.inflight = null;
      });
    return { accepted: true, reason, snapshot: await this.snapshot() };
  }

  onDemandFile(symbol) {
    return join(this.dataDir, 'on-demand', `${symbol}.json`);
  }

  onDemandProgressFile(symbol) {
    return join(this.dataDir, 'on-demand', `${symbol}.progress.json`);
  }

  async onDemandStatus(symbol) {
    const normalized = safeCoinglassSymbol(symbol);
    if (!normalized) {
      return { symbol: normalized, status: 'INVALID', cached: false };
    }
    const [cached, progress] = await Promise.all([
      readJson(this.onDemandFile(normalized), null),
      readJson(this.onDemandProgressFile(normalized), null),
    ]);
    const runtime = this.onDemandJobs.get(normalized);
    const updatedAt = cached?.updatedAt ?? null;
    const ageMs = updatedAt ? Math.max(0, Date.now() - Date.parse(updatedAt)) : null;
    const complete = Boolean(
      cached?.row?.heatmap
      && cached?.row?.qualifiedTimeframes?.['12h']?.heatmap
      && cached?.row?.qualifiedTimeframes?.['24h']?.heatmap,
    );
    return {
      version: COIN_LEVEL_COINGLASS_ON_DEMAND_VERSION,
      symbol: normalized,
      status: runtime?.status ?? progress?.status ?? (complete ? 'COMPLETE' : 'IDLE'),
      queuedAt: runtime?.queuedAt ?? null,
      startedAt: runtime?.startedAt ?? progress?.startedAt ?? null,
      completedAt: runtime?.completedAt ?? progress?.completedAt ?? null,
      error: runtime?.error ?? progress?.error ?? null,
      cached: complete,
      updatedAt,
      ageMs,
      fresh: complete && Number.isFinite(ageMs) && ageMs <= 10 * 60_000,
    };
  }

  async startOnDemand(symbol) {
    const normalized = safeCoinglassSymbol(symbol);
    if (!normalized) {
      return { accepted: false, reason: 'invalid_symbol', status: await this.onDemandStatus(normalized) };
    }
    const status = await this.onDemandStatus(normalized);
    if (status.fresh) return { accepted: false, reason: 'fresh_cache', status };
    const existing = this.onDemandJobs.get(normalized);
    if (existing && ['QUEUED', 'RUNNING'].includes(existing.status)) {
      return { accepted: false, reason: 'already_queued', status: await this.onDemandStatus(normalized) };
    }

    const job = {
      symbol: normalized,
      status: 'QUEUED',
      queuedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null,
      promise: null,
    };
    this.onDemandJobs.set(normalized, job);
    job.promise = (async () => {
      while (this.running || this.loginRunning || this.onDemandRunning) {
        const blocking = this.inflight ?? this.loginInflight;
        if (blocking) await blocking.catch(() => {});
        else await new Promise((resolve) => setTimeout(resolve, 500));
      }
      this.onDemandRunning = true;
      this.onDemandSymbol = normalized;
      job.status = 'RUNNING';
      job.startedAt = new Date().toISOString();
      try {
        await this.runOnDemandCollector(normalized);
        job.status = 'COMPLETE';
        job.completedAt = new Date().toISOString();
      } catch (error) {
        job.status = 'FAILED';
        job.error = String(error?.message ?? error);
        job.completedAt = new Date().toISOString();
        console.warn(`[${this.logPrefix}] on-demand ${normalized} failed: ${job.error}`);
      } finally {
        this.onDemandRunning = false;
        this.onDemandSymbol = null;
      }
    })();
    job.promise.catch(() => {});
    return { accepted: true, reason: this.running ? 'queued_after_scan' : 'started', status: await this.onDemandStatus(normalized) };
  }

  startScheduler({ initialDelayMs } = {}) {
    const config = this.config();
    if (!config.schedulerEnabled || this.schedulerTimer) return false;
    const delayMs = Math.max(5_000, Number(initialDelayMs ?? config.schedulerInitialDelayMs));
    this.schedulerStartedAt = new Date().toISOString();
    this.schedulerNextRunAt = new Date(Date.now() + delayMs).toISOString();
    const tick = async () => {
      this.schedulerLastTickAt = new Date().toISOString();
      this.schedulerNextRunAt = new Date(Date.now() + config.schedulerIntervalMs).toISOString();
      const result = await this.startRefresh('scheduled').catch((error) => ({
        accepted: false,
        reason: String(error?.message ?? error),
      }));
      if (!result?.accepted && !['already_running', 'login_running', 'auth_required'].includes(result?.reason)) {
        console.warn(`[${this.logPrefix}] scheduled refresh skipped: ${result?.reason ?? 'unknown'}`);
      }
    };
    const timeout = setTimeout(() => {
      tick().catch(() => {});
      this.schedulerTimer = setInterval(() => tick().catch(() => {}), config.schedulerIntervalMs);
      this.schedulerTimer.unref?.();
    }, delayMs);
    timeout.unref?.();
    this.schedulerTimer = timeout;
    console.log(
      `[${this.logPrefix}] scheduler enabled interval=${config.schedulerIntervalMs}ms`
      + ` ranks=${config.rankFrom}-${config.rankTo} limit=${config.limit}`
      + ` mode=${config.lifecycleOnly ? 'LIFECYCLE_AUTO_1USDT' : config.observationOnly ? 'OBSERVE_ONLY' : 'QUALIFIED_AUTO'}`,
    );
    return true;
  }

  stopScheduler() {
    if (!this.schedulerTimer) return false;
    clearTimeout(this.schedulerTimer);
    clearInterval(this.schedulerTimer);
    this.schedulerTimer = null;
    this.schedulerNextRunAt = null;
    return true;
  }

  async runCollector({
    limit,
    rankOffset,
    range,
    reason,
    timeoutMs,
    browserConcurrency,
    scanBudgetMs,
    niceLevel,
  }) {
    const script = join(this.rootDir, 'scripts', 'crawl-coinglass-web-top20.mjs');
    const collectorArgs = [
      script,
      '--limit', String(limit),
      '--rank-offset', String(rankOffset),
      '--range', range,
      '--data-dir', this.dataDir,
      '--browser-concurrency', String(browserConcurrency),
      '--scan-budget-ms', String(scanBudgetMs),
      '--image-url-base', this.secondary
        ? '/api/coinglass-web-secondary/image'
        : '/api/coinglass-web-top20/image',
      '--reason', String(reason ?? 'manual'),
    ];
    const executable = this.secondary && niceLevel > 0 ? 'nice' : process.execPath;
    const executableArgs = this.secondary && niceLevel > 0
      ? ['-n', String(niceLevel), process.execPath, ...collectorArgs]
      : collectorArgs;
    const { stdout, stderr } = await execFileAsync(executable, executableArgs, {
      cwd: this.rootDir,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    });
    if (stderr?.trim()) console.warn(`[${this.logPrefix}] ${stderr.trim()}`);
    const result = JSON.parse(String(stdout).trim() || '{}');
    if (!result.ok) throw new Error(result.error || 'CoinGlass collector did not complete');
    return result;
  }

  async runOnDemandCollector(symbol) {
    const script = join(this.rootDir, 'scripts', 'crawl-coinglass-web-top20.mjs');
    const args = [
      script,
      '--on-demand-symbol', symbol,
      '--data-dir', this.dataDir,
      '--browser-concurrency', '1',
      '--scan-budget-ms', '120000',
      '--reason', 'coin-level-search',
    ];
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: this.rootDir,
      timeout: 150_000,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    });
    if (stderr?.trim()) console.warn(`[${this.logPrefix}] on-demand ${symbol}: ${stderr.trim()}`);
    const result = JSON.parse(String(stdout).trim() || '{}');
    if (!result.ok) throw new Error(result.error || `CoinGlass on-demand ${symbol} did not complete`);
    return result;
  }

  async postWebhook(webhookUrl, payload) {
    if (!webhookUrl) return { sent: false, reason: 'not_configured' };
    const send = () => fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let response = await send();
    if (response.status === 429) {
      const rateLimit = await response.json().catch(() => ({}));
      const retryMs = Math.max(500, Math.min(5_000, Number(rateLimit?.retry_after ?? 1) * 1_000));
      await new Promise((resolve) => setTimeout(resolve, retryMs));
      response = await send();
    }
    if (!response.ok) throw new Error(`Discord webhook HTTP ${response.status}`);
    return { sent: true };
  }


  async postDiscord(payload) {
    return this.postWebhook(this.discordWebhookUrl(), payload);
  }

  async postZoneEvaluationDiscord(payload) {
    return this.postWebhook(this.zoneEvaluationWebhookUrl(), payload);
  }

  async postZoneLifecycleDiscord(payload) {
    return this.postWebhook(this.zoneLifecycleWebhookUrl(), payload);
  }

  async postHybridLiquidityDiscord(payload) {
    return this.postWebhook(this.hybridLiquidityWebhookUrl(), payload);
  }

  async processHybridLiquidityRows(rows = []) {
    const config = this.config();
    if (!config.hybridLiquidityEnabled) {
      return { evaluated: 0, ready: 0, sent: 0, submitted: 0, reason: 'disabled' };
    }
    if (!this.onHybridLiquidityScan) {
      return { evaluated: 0, ready: 0, sent: 0, submitted: 0, reason: 'evaluator_not_configured' };
    }

    let signals;
    try {
      signals = await this.onHybridLiquidityScan(rows, config, this.streamId);
    } catch (error) {
      console.warn(`[${this.logPrefix}] hybrid liquidity scan failed: ${error.message}`);
      return { evaluated: 0, ready: 0, sent: 0, submitted: 0, reason: 'evaluation_error' };
    }
    const evaluated = Array.isArray(signals) ? signals : [];
    const ready = evaluated.filter((signal) => signal?.ready === true);
    const state = await readJson(this.hybridLiquidityFile, null) ?? {
      version: COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION,
      signalSent: {},
      recent: [],
    };
    const now = Date.now();
    let sent = 0;
    let submitted = 0;
    for (const signal of ready) {
      let outgoingSignal = signal;
      if (signal.executionEligible === true && this.onHybridLiquiditySignal) {
        const binanceExecution = await this.onHybridLiquiditySignal(signal).catch((error) => ({
          status: 'error',
          code: error.code ?? 'BINANCE_ERROR',
        }));
        outgoingSignal = { ...signal, binanceExecution };
        if (String(binanceExecution?.status).toLowerCase() === 'submitted') submitted += 1;
      } else if (signal.executionEligible !== true && this.onHybridLiquidityPaper) {
        await this.onHybridLiquidityPaper(signal, { status: 'ineligible' }).catch((error) => {
          console.warn(`[${this.logPrefix}] hybrid liquidity paper ${signal.symbol}: ${error.message}`);
        });
      }
      if (!config.hybridLiquidityDiscordConfigured) continue;
      const dedupeKey = coinglassHybridLiquidityDedupeKey(signal);
      if (!dedupeKey
        || now - finiteNumber(state.signalSent?.[dedupeKey], 0) < config.hybridLiquidityDiscordCooldownMs) {
        continue;
      }
      try {
        await this.postHybridLiquidityDiscord(buildCoinglassHybridLiquidityDiscordPayload(outgoingSignal));
        state.signalSent = { ...(state.signalSent ?? {}), [dedupeKey]: now };
        const audit = {
          version: COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION,
          streamId: this.streamId,
          symbol: signal.symbol,
          label: signal.label,
          bias: signal.bias,
          targetPrice: finiteNumber(signal?.target?.targetPrice),
          observeOnly: signal.observeOnly === true,
          binanceExecution: outgoingSignal.binanceExecution ?? null,
          sentAt: now,
        };
        state.recent = [audit, ...(Array.isArray(state.recent) ? state.recent : [])].slice(0, 100);
        this.lastHybridLiquidityAt = new Date(now).toISOString();
        this.lastHybridLiquiditySignal = audit;
        sent += 1;
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.warn(`[${this.logPrefix}] hybrid liquidity Discord ${signal.symbol}: ${error.message}`);
      }
    }
    const cutoff = now - 7 * 24 * 60 * 60_000;
    state.signalSent = Object.fromEntries(Object.entries(state.signalSent ?? {})
      .filter(([, sentAt]) => finiteNumber(sentAt, 0) >= cutoff));
    state.version = COINGLASS_HYBRID_LIQUIDITY_HUNTER_VERSION;
    state.updatedAt = new Date(now).toISOString();
    await mkdir(this.dataDir, { recursive: true });
    await writeJsonAtomic(this.hybridLiquidityFile, state);
    if (ready.length || sent) {
      console.log(
        `[${this.logPrefix}] hybrid liquidity evaluated=${evaluated.length}`
        + ` ready=${ready.length} binance=${submitted} discord=${sent}`,
      );
    }
    return { evaluated: evaluated.length, ready: ready.length, sent, submitted };
  }

  async processZoneLifecycleRows(rows = []) {
    const config = this.config();
    if (!config.zoneLifecycleEnabled) return { events: 0, sent: 0, submitted: 0, reason: 'disabled' };
    const previous = await readJson(this.zoneLifecycleFile, null) ?? {
      version: COINGLASS_ZONE_LIFECYCLE_VERSION,
      tracks: {},
      processedEvents: {},
      recent: [],
      strongWaveReversalWatches: {},
    };
    const evaluated = advanceCoinglassZoneLifecycle({
      rows,
      previous,
      now: Date.now(),
      config: {
        marginUsdt: config.zoneLifecycleMarginUsdt,
        acceptedBreakoutMarginUsdt: config.zoneLifecycleAcceptedBreakoutMarginUsdt,
        unconfirmedBounceLongMarginUsdt: config.zoneLifecycleUnconfirmedBounceLongMarginUsdt,
        fixedTakeProfitRoePct: config.zoneLifecycleFixedTakeProfitRoePct,
        supportReclaimMarginUsdt: config.zoneLifecycleSupportReclaimMarginUsdt,
        strongShortMarginUsdt: config.zoneLifecycleStrongShortMarginUsdt,
        largeTargetThresholdPct: config.zoneLifecycleLargeTargetThresholdPct,
        largeTargetMarginUsdt: config.zoneLifecycleLargeTargetMarginUsdt,
        longSingleTargetMaxPct: config.zoneLifecycleLongSingleTargetMaxPct,
        longTp1DistancePct: config.zoneLifecycleLongTp1DistancePct,
        longTp1CloseRatio: config.zoneLifecycleLongTp1CloseRatio,
        longTp2CapPct: config.zoneLifecycleLongTp2CapPct,
        shortSingleTargetMaxPct: config.zoneLifecycleShortSingleTargetMaxPct,
        shortTp1DistancePct: config.zoneLifecycleShortTp1DistancePct,
        shortTp1CloseRatio: config.zoneLifecycleShortTp1CloseRatio,
        shortTp2CapPct: config.zoneLifecycleShortTp2CapPct,
        shortStrongWaveChange24hPct: config.zoneLifecycleShortStrongWaveChange24hPct,
        shortStrongTakeProfitRoePct: config.zoneLifecycleShortStrongTakeProfitRoePct,
        shortStrongTp1DistancePct: config.zoneLifecycleShortStrongTp1DistancePct,
        shortStrongTp1CloseRatio: config.zoneLifecycleShortStrongTp1CloseRatio,
        shortStrongTp2CapPct: config.zoneLifecycleShortStrongTp2CapPct,
        leverage: config.zoneLifecycleLeverage,
      },
    });
    const state = evaluated.state;
    const processedEvents = { ...(previous.processedEvents ?? {}) };
    const strongWaveReversalWatches = { ...(previous.strongWaveReversalWatches ?? {}) };
    const priorReversalWatchIds = new Set(Object.keys(strongWaveReversalWatches));
    const recent = Array.isArray(previous.recent) ? [...previous.recent] : [];
    let sent = 0;
    let submitted = 0;
    const pageUrl = this.secondary
      ? process.env.COINGLASS_WEB_SECONDARY_PUBLIC_URL
        || `http://127.0.0.1:${process.env.PORT ?? 19082}/coinglass-web-secondary`
      : process.env.COINGLASS_WEB_PUBLIC_URL
        || `http://127.0.0.1:${process.env.PORT ?? 19082}/coinglass-web-top20`;

    for (const event of evaluated.events) {
      if (processedEvents[event.id]) continue;
      let execution = { decision: `OBSERVE_${event.state}` };
      if (event.shouldEnter) {
        if (!config.zoneLifecycleBinanceEnabled) {
          execution = { decision: 'BLOCKED_ZONE_LIFECYCLE_BINANCE_DISABLED' };
        } else if (!this.onZoneLifecycleSignal) {
          execution = { decision: 'BLOCKED_ZONE_LIFECYCLE_EXECUTOR_MISSING' };
        } else {
          try {
            execution = await this.onZoneLifecycleSignal(event, config);
          } catch (error) {
            execution = { decision: 'ZONE_LIFECYCLE_EXECUTION_ERROR', error: String(error?.message ?? error).slice(0, 500) };
          }
        }
      }
      if (execution?.decision === 'SUBMITTED') submitted += 1;
      if (event.shouldEnter === true
        && execution?.decision !== 'SUBMITTED'
        && this.onZoneLifecyclePaper) {
        await this.onZoneLifecyclePaper(event, execution).catch((error) => {
          console.warn(`[${this.logPrefix}] zone lifecycle paper ${event.symbol}: ${error.message}`);
        });
      }
      const reversalWatch = createCoinglassStrongWaveReversalWatch({ event, execution });
      if (reversalWatch) {
        strongWaveReversalWatches[reversalWatch.id] = {
          ...reversalWatch,
          streamId: this.streamId,
        };
      }
      let notified = false;
      let notifyError = null;
      const discordEligible = shouldNotifyCoinglassZoneLifecycleEvent({ event, secondary: this.secondary });
      let notificationDecision = config.zoneLifecycleDiscordConfigured
        ? discordEligible ? 'ELIGIBLE' : 'SUPPRESSED_SECONDARY_NON_ENTRY_TRANSITION'
        : 'WEBHOOK_NOT_CONFIGURED';
      if (config.zoneLifecycleDiscordConfigured && discordEligible) {
        try {
          await this.postZoneLifecycleDiscord(buildCoinglassZoneLifecycleDiscordPayload({
            event,
            execution,
            pageUrl,
          }));
          notified = true;
          notificationDecision = 'SENT';
          sent += 1;
        } catch (error) {
          notifyError = String(error?.message ?? error).slice(0, 300);
          notificationDecision = 'SEND_ERROR';
          console.warn(`[CoinGlassZoneLifecycle] Discord ${event.symbol}: ${notifyError}`);
        }
      }
      const audit = {
        id: event.id,
        symbol: event.symbol,
        zoneSide: event.zoneSide,
        state: event.state,
        previousState: event.previousState,
        side: event.entryPlan?.side ?? null,
        signalLabel: event.entryPlan?.signalLabel ?? null,
        marginRule: event.entryPlan?.marginRule ?? null,
        marginUsdt: event.entryPlan?.marginUsdt ?? null,
        shouldEnter: event.shouldEnter,
        executionDecision: execution?.decision ?? null,
        orderId: execution?.orderId ?? null,
        notified,
        notificationDecision,
        notifyError,
        processedAt: Date.now(),
      };
      processedEvents[event.id] = audit;
      recent.unshift(audit);
      this.lastZoneLifecycleAt = new Date().toISOString();
      this.lastZoneLifecycleEvent = audit;
    }

    if (config.zoneLifecycleReversalEnabled && this.onZoneLifecycleReversalWatch) {
      for (const [watchId, watch] of Object.entries(strongWaveReversalWatches)) {
        if (!priorReversalWatchIds.has(watchId)
          || !['ARMED_SHORT_EXIT', 'WAIT_RECLAIM'].includes(String(watch?.status))) continue;
        let result;
        try {
          result = await this.onZoneLifecycleReversalWatch(watch, config);
        } catch (error) {
          result = {
            decision: 'ZONE_LIFECYCLE_REVERSAL_ERROR',
            error: String(error?.message ?? error).slice(0, 500),
          };
        }
        const nextWatch = {
          ...watch,
          ...(result?.watchPatch ?? {}),
          lastDecision: result?.decision ?? null,
          lastError: result?.error ?? null,
          updatedAt: Date.now(),
        };
        if (result?.decision === 'SUBMITTED') {
          nextWatch.status = 'SUBMITTED';
          nextWatch.longOrderId = result.orderId ?? null;
          nextWatch.longSubmittedAt = Date.now();
          submitted += 1;
          let notified = false;
          let notifyError = null;
          if (config.zoneLifecycleDiscordConfigured && result?.reversalDecision) {
            try {
              await this.postZoneLifecycleDiscord(buildCoinglassStrongWaveReversalDiscordPayload({
                decision: result.reversalDecision,
                execution: result,
                pageUrl,
              }));
              notified = true;
              sent += 1;
            } catch (error) {
              notifyError = String(error?.message ?? error).slice(0, 300);
            }
          }
          const audit = {
            id: watchId,
            type: 'STRONG_WAVE_REVERSAL_LONG',
            symbol: watch.symbol,
            side: 'LONG',
            executionDecision: result.decision,
            orderId: result.orderId ?? null,
            notified,
            notifyError,
            processedAt: Date.now(),
          };
          recent.unshift(audit);
          this.lastZoneLifecycleAt = new Date().toISOString();
          this.lastZoneLifecycleEvent = audit;
        }
        strongWaveReversalWatches[watchId] = nextWatch;
      }
    }

    const cutoff = Date.now() - 7 * 24 * 60 * 60_000;
    state.processedEvents = Object.fromEntries(Object.entries(processedEvents)
      .filter(([, record]) => finiteNumber(record?.processedAt, 0) >= cutoff));
    state.strongWaveReversalWatches = Object.fromEntries(Object.entries(strongWaveReversalWatches)
      .filter(([, watch]) => finiteNumber(watch?.updatedAt, finiteNumber(watch?.createdAt, 0)) >= cutoff));
    state.recent = recent.slice(0, 100);
    await mkdir(this.dataDir, { recursive: true });
    await writeJsonAtomic(this.zoneLifecycleFile, state);
    if (evaluated.events.length) {
      console.log(
        `[CoinGlassZoneLifecycle] events=${evaluated.events.length} discord=${sent}`
        + ` binance=${submitted} version=${COINGLASS_ZONE_LIFECYCLE_VERSION}`,
      );
    }
    return { events: evaluated.events.length, sent, submitted };
  }

  async notificationState() {
    return await readJson(this.notificationFile, null) ?? {
      version: COINGLASS_WEB_DISCORD_VERSION,
      signalSent: {},
      recent: [],
      lastAuthAlertAt: null,
      lastSignalAt: null,
    };
  }

  async saveNotificationState(state) {
    await mkdir(this.dataDir, { recursive: true });
    const cutoff = Date.now() - 24 * 60 * 60_000;
    const signalSent = Object.fromEntries(Object.entries(state.signalSent ?? {})
      .filter(([, sentAt]) => Number(sentAt) >= cutoff));
    await writeJsonAtomic(this.notificationFile, {
      ...state,
      version: COINGLASS_WEB_DISCORD_VERSION,
      signalSent,
      recent: (Array.isArray(state.recent) ? state.recent : []).slice(0, 100),
      updatedAt: new Date().toISOString(),
    });
  }

  async notifyAuthRequired(message) {
    const config = this.config();
    const configured = this.secondary
      ? config.zoneLifecycleDiscordConfigured
      : config.discordConfigured;
    if (!configured) return { sent: false, reason: 'not_configured' };
    const state = await this.notificationState();
    const now = Date.now();
    if (now - Number(state.lastAuthAlertAt ?? 0) < config.discordAuthCooldownMs) {
      return { sent: false, reason: 'cooldown' };
    }
    const payload = buildCoinglassWebAuthAlertPayload({
      message,
      pageUrl: this.secondary
        ? process.env.COINGLASS_WEB_SECONDARY_PUBLIC_URL
          || `http://127.0.0.1:${process.env.PORT ?? 19082}/coinglass-web-secondary`
        : process.env.COINGLASS_WEB_PUBLIC_URL
          || `http://127.0.0.1:${process.env.PORT ?? 19082}/coinglass-web-top20`,
      generatedAt: now,
    });
    if (this.secondary) await this.postZoneLifecycleDiscord(payload);
    else await this.postDiscord(payload);
    state.lastAuthAlertAt = now;
    state.recent = [{ type: 'AUTH_REQUIRED', sentAt: now, message }, ...(state.recent ?? [])];
    await this.saveNotificationState(state);
    console.warn(`[${this.logPrefix}] Discord auth-required alert sent`);
    return { sent: true };
  }

  async notifyQualifiedRows(rows = []) {
    const config = this.config();
    if (!config.discordConfigured) return { sent: 0, reason: 'not_configured' };
    const state = await this.notificationState();
    const now = Date.now();
    let sent = 0;
    for (const row of rows.filter((item) => item.qualified)) {
      const dedupeKey = coinglassWebDiscordDedupeKey(row);
      if (!dedupeKey || now - Number(state.signalSent?.[dedupeKey] ?? 0) < config.discordSignalCooldownMs) continue;
      try {
        const rowBinanceSettings = this.resolveBinanceSettings
          ? await this.resolveBinanceSettings(row)
          : null;
        await this.postDiscord(buildCoinglassWebDiscordPayload(row, now, {
          binanceEnabled: rowBinanceSettings?.binanceEnabled ?? config.binanceEnabled,
          marginUsdt: rowBinanceSettings?.marginUsdt ?? config.binanceMarginUsdt,
          leverage: rowBinanceSettings?.leverage ?? config.binanceLeverage,
        }));
        state.signalSent = { ...(state.signalSent ?? {}), [dedupeKey]: now };
        state.lastSignalAt = now;
        state.recent = [{
          type: 'SIGNAL',
          symbol: row.symbol,
          action: row.proposal?.action,
          moverSide: row.moverSide,
          moverRank: row.moverRank,
          sentAt: now,
        }, ...(state.recent ?? [])];
        sent += 1;
        await new Promise((resolve) => setTimeout(resolve, 750));
      } catch (error) {
        console.warn(`[CoinGlassWebTop20] Discord ${row.symbol} failed: ${error.message}`);
      }
    }
    await this.saveNotificationState(state);
    if (sent) console.log(`[CoinGlassWebTop20] Discord sent ${sent} qualified mover(s)`);
    return { sent };
  }

  async notifyZoneEvaluationRows(rows = [], { statusMessage = '' } = {}) {
    const config = this.config();
    if (!config.zoneEvaluationDiscordConfigured) return { sent: false, reason: 'not_configured' };
    const selected = selectCoinglassZoneEvaluationRow(rows);
    const pageUrl = process.env.COINGLASS_WEB_PUBLIC_URL
      || `http://127.0.0.1:${process.env.PORT ?? 19082}/coinglass-web-top20`;
    await this.postZoneEvaluationDiscord(buildCoinglassWebZoneEvaluationPayload({
      row: selected?.row ?? null,
      generatedAt: Date.now(),
      statusMessage,
      pageUrl,
    }));
    this.lastZoneEvaluationAt = new Date().toISOString();
    this.lastZoneEvaluationSymbol = selected?.row?.symbol ?? null;
    console.log(`[CoinGlassWebTop20] Discord zone evaluation sent: ${this.lastZoneEvaluationSymbol ?? 'NO_DATA'}`);
    return { sent: true, symbol: this.lastZoneEvaluationSymbol };
  }

  async executeQualifiedRows(rows = []) {
    const config = this.config();
    if (!config.binanceEnabled || !this.onQualifiedRow) {
      return { submitted: 0, reason: config.binanceEnabled ? 'executor_not_configured' : 'disabled' };
    }
    const now = Date.now();
    const state = await readJson(this.executionFile, null) ?? {
      version: COINGLASS_WEB_BINANCE_VERSION,
      submitted: {},
      recent: [],
    };
    let submitted = 0;
    for (const row of rows.filter((item) => item?.qualified === true)) {
      const dedupeKey = coinglassWebBinanceDedupeKey(row);
      const symbol = String(row?.symbol ?? '').toUpperCase();
      const action = String(row?.proposal?.action ?? '');
      const legacySubmittedAt = Object.values(state.submitted ?? {}).reduce((latest, record) => {
        if (String(record?.symbol ?? '').toUpperCase() !== symbol || String(record?.action ?? '') !== action) {
          return latest;
        }
        return Math.max(latest, Number(record?.submittedAt ?? record?.executedAt ?? 0));
      }, 0);
      const previousAt = Math.max(
        Number(state.submitted?.[dedupeKey]?.submittedAt ?? 0),
        legacySubmittedAt,
      );
      if (dedupeKey && previousAt > 0 && now - previousAt < config.binanceDedupeMs) continue;
      let result;
      try {
        result = await this.onQualifiedRow(row);
      } catch (error) {
        result = { decision: 'BINANCE_EXECUTION_ERROR', error: String(error?.message ?? error).slice(0, 500) };
      }
      const executedAt = Date.now();
      const audit = {
        version: COINGLASS_WEB_BINANCE_VERSION,
        symbol: row.symbol,
        action: row.proposal?.action ?? null,
        decision: result?.decision ?? 'UNKNOWN',
        proposedEntry: Number(row.proposal?.tradePlan?.entry?.price) || null,
        proposalStopLoss: Number(row.proposal?.tradePlan?.stopLoss?.price) || null,
        currentPrice: Number(result?.currentPrice) || null,
        stopLoss: Number(result?.stopLoss) || null,
        stopLossRoePct: Number(result?.stopLossRoePct) || null,
        marginUsdt: Number(result?.marginUsdt) || null,
        leverage: Number(result?.leverage) || null,
        binanceEntryPrice: Number(result?.binanceEntryPrice) || null,
        filledAt: Number(result?.filledAt) || null,
        orderId: result?.orderId ?? null,
        reversedOrderId: result?.reversedOrderId ?? null,
        executedAt,
        error: result?.error ?? null,
      };
      if (result?.decision === 'SUBMITTED') {
        state.submitted = { ...(state.submitted ?? {}), [dedupeKey]: { ...audit, submittedAt: executedAt } };
        submitted += 1;
      }
      state.recent = [audit, ...(state.recent ?? [])].slice(0, 100);
    }
    await mkdir(this.dataDir, { recursive: true });
    await writeJsonAtomic(this.executionFile, {
      ...state,
      version: COINGLASS_WEB_BINANCE_VERSION,
      updatedAt: new Date().toISOString(),
    });
    if (submitted) console.log(`[CoinGlassWebTop20] Binance submitted ${submitted} qualified setup(s)`);
    return { submitted };
  }

  async handleCompletedRefresh() {
    const saved = await readJson(this.snapshotFile, null);
    if (saved?.source?.authRequired) {
      const message = 'CoinGlass từ chối dữ liệu altcoin trong lượt quét; cần đăng nhập hoặc kiểm tra quyền Model 3.';
      await Promise.allSettled([
        this.notifyAuthRequired(message),
        this.notifyZoneEvaluationRows([], { statusMessage: message }),
      ]);
      return;
    }
    const view = await this.snapshot();
    const zoneEvaluation = this.notifyZoneEvaluationRows(view.rows)
      .catch((error) => console.warn(`[CoinGlassWebTop20] zone evaluation failed: ${error.message}`));
    await this.notifyQualifiedRows(view.rows);
    await this.executeQualifiedRows(view.rows);
    await this.processZoneLifecycleRows(view.rows);
    await this.processHybridLiquidityRows(view.rows);
    await zoneEvaluation;
  }

  async startLogin() {
    const config = this.config();
    if (this.running) return { accepted: false, reason: 'refresh_running', snapshot: await this.snapshot() };
    if (this.loginRunning) return { accepted: false, reason: 'already_running', snapshot: await this.snapshot() };
    await mkdir(this.dataDir, { recursive: true });
    this.loginRunning = true;
    this.loginStartedAt = new Date().toISOString();
    this.loginError = null;
    this.loginInflight = this.runLogin(config.loginTimeoutMs)
      .catch((error) => {
        this.loginError = String(error?.message ?? error);
        console.warn(`[CoinGlassWebTop20] login failed: ${this.loginError}`);
      })
      .finally(() => {
        this.loginRunning = false;
        this.loginInflight = null;
      });
    return { accepted: true, reason: 'manual_login', snapshot: await this.snapshot() };
  }

  async runLogin(timeoutMs) {
    const script = join(this.rootDir, 'scripts', 'open-coinglass-web-login.mjs');
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      script,
      '--data-dir', this.dataDir,
      '--timeout-ms', String(timeoutMs),
    ], {
      cwd: this.rootDir,
      timeout: timeoutMs + 30_000,
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    });
    if (stderr?.trim()) console.warn(`[CoinGlassWebTop20] ${stderr.trim()}`);
    const result = JSON.parse(String(stdout).trim() || '{}');
    if (!result.ok) throw new Error(result.error || 'CoinGlass login did not complete');
    return result;
  }

  imageFile(symbol) {
    const safeSymbol = safeCoinglassSymbol(symbol);
    return safeSymbol ? join(this.dataDir, 'images', `${safeSymbol}.png`) : null;
  }
}
