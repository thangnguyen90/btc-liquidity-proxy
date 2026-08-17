import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { selectLiquidHeatmapFlowV2Candidates } from './liquidHeatmapFlowV2.js';
import {
  COINGLASS_WEB_DISCORD_VERSION,
  buildCoinglassWebAuthAlertPayload,
  buildCoinglassWebDiscordPayload,
  coinglassWebDiscordDedupeKey,
} from './coinglassWebDiscord.js';

export const COINGLASS_WEB_TOP20_VERSION = 'COINGLASS_WEB_SCHEDULED_60_MOVERS_V8_20260817';
export const COINGLASS_WEB_ZONE_PROPOSAL_VERSION = 'COINGLASS_WEB_ZONE_PROPOSAL_V2_20260817';
export const COINGLASS_WEB_TOP20_MODE = 'OBSERVE_ONLY';
export const COINGLASS_WEB_TOP20_ISOLATION = Object.freeze({
  observationOnly: true,
  affectsLiquidFlowV2: false,
  affectsSignals: false,
  affectsPaper: false,
  affectsBinance: false,
  affectsEntry: false,
  affectsSize: false,
  affectsSlTp: false,
});

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
  const symbol = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{2,24}USDT$/.test(symbol) ? symbol : '';
}

export function selectTopBinanceUsdtPerpetuals(exchangeInfo = {}, tickers = [], limit = 20) {
  const contracts = new Map(
    (Array.isArray(exchangeInfo?.symbols) ? exchangeInfo.symbols : [])
      .filter((row) => (
        row?.status === 'TRADING'
        && row?.contractType === 'PERPETUAL'
        && row?.quoteAsset === 'USDT'
        && safeCoinglassSymbol(row?.symbol)
      ))
      .map((row) => [row.symbol, row]),
  );

  return (Array.isArray(tickers) ? tickers : [])
    .map((ticker) => {
      const symbol = safeCoinglassSymbol(ticker?.symbol);
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
  maxSymbols = 60,
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
    maxSymbols: Math.max(2, Math.trunc(finiteNumber(maxSymbols, 60))),
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

export function applyBinanceLiquidityFilter(markets = [], metricsBySymbol = {}, limit = 20, thresholds = {}) {
  const required = Math.max(1, Math.min(60, Math.trunc(finiteNumber(limit, 20))));
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

export function summarizeCoinglassHeatmap(data = {}, { maxZones = 12, minIndexGap = 3 } = {}) {
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  const y = Array.isArray(data?.y) ? data.y.map((value) => finiteNumber(value)) : [];
  const liquidationRows = Array.isArray(data?.liq) ? data.liq : [];
  const lastBar = prices.at(-1);
  const currentPrice = finiteNumber(Array.isArray(lastBar) ? lastBar[4] : null);
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
  const strongestIntensity = Math.max(0, ...selected.map((level) => level.totalIntensity));
  const zones = selected.map((level) => ({
    price: level.price,
    side: currentPrice == null ? 'UNKNOWN' : level.price >= currentPrice ? 'ABOVE' : 'BELOW',
    distancePct: currentPrice > 0 ? ((level.price / currentPrice) - 1) * 100 : null,
    strength: strongestIntensity > 0 ? Math.round((level.totalIntensity / strongestIntensity) * 100) : 0,
    totalIntensity: Math.round(level.totalIntensity),
    maxIntensity: Math.round(level.maxIntensity),
    persistenceBars: level.xIndexes.size,
    firstX: level.firstX,
    lastX: level.lastX,
  }));

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
    candleCount: prices.length,
    priceLevelCount: y.length,
    liquidationCellCount: liquidationRows.length,
    totalLiquidationIntensity: Math.round(levels.reduce((total, level) => total + level.totalIntensity, 0)),
    zones,
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
    observeOnly: true,
    discordEligible: reasons.length === 0,
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
  constructor({ rootDir, dataDir = join(rootDir, 'data', 'coinglass-web-top20') } = {}) {
    if (!rootDir) throw new Error('rootDir is required');
    this.rootDir = rootDir;
    this.dataDir = dataDir;
    this.snapshotFile = join(dataDir, 'snapshot.json');
    this.progressFile = join(dataDir, 'progress.json');
    this.authFile = join(dataDir, 'auth.json');
    this.notificationFile = join(dataDir, 'notifications.json');
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
  }

  config() {
    const configuredLimit = finiteNumber(
      process.env.COINGLASS_WEB_SCAN_LIMIT
      ?? process.env.COINGLASS_WEB_TOP20_LIMIT
      ?? 60,
      60,
    );
    return {
      enabled: process.env.COINGLASS_WEB_TOP20_ENABLED !== 'false',
      limit: Math.max(1, Math.min(60, configuredLimit)),
      range: '48h',
      browserMode: process.env.COINGLASS_WEB_BROWSER_MODE ?? 'headed',
      timeoutMs: Math.max(120_000, Number(process.env.COINGLASS_WEB_TOP20_TIMEOUT_MS ?? 12 * 60_000)),
      loginTimeoutMs: Math.max(120_000, Number(process.env.COINGLASS_WEB_LOGIN_TIMEOUT_MS ?? 10 * 60_000)),
      schedulerEnabled: process.env.COINGLASS_WEB_SCHEDULER_ENABLED !== 'false',
      schedulerIntervalMs: Math.max(180_000, finiteNumber(process.env.COINGLASS_WEB_SCAN_INTERVAL_MS, 180_000)),
      discordConfigured: Boolean(this.discordWebhookUrl()),
      discordSignalCooldownMs: Math.max(180_000, finiteNumber(process.env.COINGLASS_WEB_DISCORD_SIGNAL_COOLDOWN_MS, 30 * 60_000)),
      discordAuthCooldownMs: Math.max(180_000, finiteNumber(process.env.COINGLASS_WEB_DISCORD_AUTH_COOLDOWN_MS, 60 * 60_000)),
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

  async snapshot() {
    const [saved, progress, auth, notifications] = await Promise.all([
      readJson(this.snapshotFile, null),
      this.running ? readJson(this.progressFile, null) : Promise.resolve(null),
      readJson(this.authFile, null),
      readJson(this.notificationFile, null),
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
      .map((row) => ({ ...row, qualification: row?.qualification ?? qualifyCoinglassOpportunity(row) }))
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
      mode: COINGLASS_WEB_TOP20_MODE,
      isolation: COINGLASS_WEB_TOP20_ISOLATION,
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
        sentSignals: Object.keys(notifications?.signalSent ?? {}).length,
        recent: Array.isArray(notifications?.recent) ? notifications.recent.slice(0, 20) : [],
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
    if (this.running) {
      return { accepted: false, reason: 'already_running', snapshot: await this.snapshot() };
    }
    if (this.loginRunning) {
      return { accepted: false, reason: 'login_running', snapshot: await this.snapshot() };
    }
    if (reason === 'scheduled') {
      const auth = await readJson(this.authFile, null);
      if (!auth?.altcoinAccess) {
        this.notifyAuthRequired(auth?.message || 'Phiên collector chưa có quyền CoinGlass Model 3 altcoin.')
          .catch((error) => console.warn(`[CoinGlassWebTop20] auth alert failed: ${error.message}`));
        return { accepted: false, reason: 'auth_required', snapshot: await this.snapshot() };
      }
    }
    await mkdir(this.dataDir, { recursive: true });
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.lastError = null;
    this.inflight = this.runCollector({ ...config, reason })
      .then(() => this.handleCompletedRefresh()
        .catch((error) => console.warn(`[CoinGlassWebTop20] post-refresh notify failed: ${error.message}`)))
      .catch((error) => {
        this.lastError = String(error?.message ?? error);
        console.warn(`[CoinGlassWebTop20] refresh failed: ${this.lastError}`);
      })
      .finally(() => {
        this.running = false;
        this.inflight = null;
      });
    return { accepted: true, reason, snapshot: await this.snapshot() };
  }

  startScheduler({ initialDelayMs } = {}) {
    const config = this.config();
    if (!config.schedulerEnabled || this.schedulerTimer) return false;
    const delayMs = Math.max(5_000, Number(initialDelayMs ?? config.schedulerIntervalMs));
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
        console.warn(`[CoinGlassWebTop20] scheduled refresh skipped: ${result?.reason ?? 'unknown'}`);
      }
    };
    const timeout = setTimeout(() => {
      tick().catch(() => {});
      this.schedulerTimer = setInterval(() => tick().catch(() => {}), config.schedulerIntervalMs);
      this.schedulerTimer.unref?.();
    }, delayMs);
    timeout.unref?.();
    this.schedulerTimer = timeout;
    console.log(`[CoinGlassWebTop20] scheduler enabled interval=${config.schedulerIntervalMs}ms limit=${config.limit}`);
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

  async runCollector({ limit, range, reason, timeoutMs }) {
    const script = join(this.rootDir, 'scripts', 'crawl-coinglass-web-top20.mjs');
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      script,
      '--limit', String(limit),
      '--range', range,
      '--data-dir', this.dataDir,
      '--reason', String(reason ?? 'manual'),
    ], {
      cwd: this.rootDir,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    });
    if (stderr?.trim()) console.warn(`[CoinGlassWebTop20] ${stderr.trim()}`);
    const result = JSON.parse(String(stdout).trim() || '{}');
    if (!result.ok) throw new Error(result.error || 'CoinGlass collector did not complete');
    return result;
  }

  async postDiscord(payload) {
    const webhookUrl = this.discordWebhookUrl();
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
    if (!config.discordConfigured) return { sent: false, reason: 'not_configured' };
    const state = await this.notificationState();
    const now = Date.now();
    if (now - Number(state.lastAuthAlertAt ?? 0) < config.discordAuthCooldownMs) {
      return { sent: false, reason: 'cooldown' };
    }
    await this.postDiscord(buildCoinglassWebAuthAlertPayload({
      message,
      pageUrl: process.env.COINGLASS_WEB_PUBLIC_URL || `http://127.0.0.1:${process.env.PORT ?? 19082}/coinglass-web-top20`,
      generatedAt: now,
    }));
    state.lastAuthAlertAt = now;
    state.recent = [{ type: 'AUTH_REQUIRED', sentAt: now, message }, ...(state.recent ?? [])];
    await this.saveNotificationState(state);
    console.warn('[CoinGlassWebTop20] Discord auth-required alert sent');
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
        await this.postDiscord(buildCoinglassWebDiscordPayload(row, now));
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

  async handleCompletedRefresh() {
    const saved = await readJson(this.snapshotFile, null);
    if (saved?.source?.authRequired) {
      await this.notifyAuthRequired('CoinGlass từ chối dữ liệu altcoin trong lượt quét; cần đăng nhập hoặc kiểm tra quyền Model 3.');
      return;
    }
    const view = await this.snapshot();
    await this.notifyQualifiedRows(view.rows);
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
