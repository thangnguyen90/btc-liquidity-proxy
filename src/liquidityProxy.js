const DEFAULT_LEVERAGES = [3, 5, 10, 20, 25, 50, 75, 100];

function intervalToMinutes(interval) {
  const map = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '6h': 360, '12h': 720, '1d': 1440 };
  return map[interval] ?? 15;
}

function computeEma(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function buildSweepTarget(zones) {
  const bias = zones.bias;
  if (Math.abs(bias) < 0.1) return null;
  if (bias > 0) {
    const zone = zones.above.strongest[0] ?? null;
    return zone ? { direction: 'above', price: zone.price, distancePct: zone.distancePct, score: zone.score } : null;
  }
  const zone = zones.below.strongest[0] ?? null;
  return zone ? { direction: 'below', price: zone.price, distancePct: zone.distancePct, score: zone.score } : null;
}

export function analyzeMarket({
  symbol,
  klines,
  klines1h = null,
  klines4h = null,
  depth,
  premiumIndex,
  openInterest,
  longShortRatio = null,
  rangePct = 0.04,
  liqRangePct = 5.0,
  binSizePct = 0.001,
  leverages = DEFAULT_LEVERAGES,
  interval = '15m',
}) {
  const currentPrice = Number(premiumIndex.markPrice);
  const priceDigits = priceDigitsFor(currentPrice);
  const fundingRate = Number(premiumIndex.lastFundingRate);
  const openInterestValue = Number(openInterest.openInterest);
  const lastClose = klines.at(-1).close;
  const candles24h = Math.round(24 * 60 / intervalToMinutes(interval));
  const base24h = klines[Math.max(0, klines.length - 1 - candles24h)];
  const base48h = klines[Math.max(0, klines.length - 1 - candles24h * 2)];
  const momentumPct = (lastClose - base24h.close) / base24h.close;
  const momentumPct48h = (lastClose - base48h.close) / base48h.close;
  const candles4h = Math.round(4 * 60 / intervalToMinutes(interval));
  const base4h = klines[Math.max(0, klines.length - 1 - candles4h)];
  const shortMomentumPct = (lastClose - base4h.close) / base4h.close;
  const atrPct = calculateAtrPct(klines);
  const takerBuyRatio = calculateTakerBuyRatio(klines);
  const book = summarizeOrderBook(depth, currentPrice, rangePct);
  const liquidationMap = buildLiquidationMap({
    klines,
    currentPrice,
    priceDigits,
    rangePct: liqRangePct,
    binSizePct,
    leverages,
  });
  const zones = summarizeZones(liquidationMap, currentPrice, priceDigits);
  const ratio = normalizeLongShortRatio(longShortRatio);
  const signal = scoreSignal({
    momentumPct,
    fundingRate,
    takerBuyRatio,
    bookImbalance: book.imbalance,
    liquidityBias: zones.bias,
    longShortRatio: ratio?.longShortRatio ?? null,
  });
  const tradeSetup = buildTradeSetup({
    currentPrice,
    atrPct,
    signal,
    zones,
    book,
    momentumPct,
    momentumPct48h,
    takerBuyRatio,
  });

  const quickScore = round(
    clamp(momentumPct * 100 / 12, -1, 1) * 0.45
    + clamp(shortMomentumPct * 100 / 1.2, -1, 1) * 0.40
    + clamp(-fundingRate * 100 / 0.05, -0.4, 0.4) * 0.15,
    4,
  );
  const quickDirection = quickScore >= 0.34 ? 'long' : quickScore <= -0.34 ? 'short' : 'wait';

  const ema99Current = computeEma(klines.map((k) => k.close), 99);
  const ema99_1h = klines1h ? computeEma(klines1h.map((k) => k.close), 99) : null;
  const ema99_4h = klines4h ? computeEma(klines4h.map((k) => k.close), 99) : null;
  const emaDistPct = (ema) => ema != null ? round((currentPrice - ema) / ema * 100, 3) : null;

  // Vol dump: volume cao liên tiếp + sập mạnh
  const vlClosed = klines.slice(0, -1);
  const vlBase = vlClosed.slice(-24, -4);
  const vlRecent = vlClosed.slice(-5);
  const vlLast = vlClosed[vlClosed.length - 1];
  const vlAvg = vlBase.length > 0 ? vlBase.reduce((s, k) => s + k.quoteVolume, 0) / vlBase.length : 0;
  const vlHighCount = vlAvg > 0 ? vlRecent.filter((k) => k.quoteVolume >= vlAvg * 1.8).length : 0;
  const vlDumpPct = vlLast?.open > 0 ? (vlLast.close - vlLast.open) / vlLast.open * 100 : 0;
  const vl4cBase = vlClosed.length >= 5 ? vlClosed[vlClosed.length - 5].close : (vlLast?.close ?? currentPrice);
  const vl4cPct = vl4cBase > 0 ? (vlLast.close - vl4cBase) / vl4cBase * 100 : 0;

  return {
    symbol,
    generatedAt: new Date().toISOString(),
    price: {
      mark: round(currentPrice, priceDigits),
      index: round(Number(premiumIndex.indexPrice), priceDigits),
    },
    market: {
      openInterest: round(openInterestValue, 3),
      fundingRate,
      fundingRatePct: round(fundingRate * 100, 4),
      momentumPct: round(momentumPct * 100, 3),
      momentumPct48h: round(momentumPct48h * 100, 3),
      trendAligned: (momentumPct > 0) === (momentumPct48h > 0),
      atrPct: round(atrPct * 100, 3),
      takerBuyRatio: round(takerBuyRatio, 4),
      longShortRatio: ratio,
    },
    orderBook: book,
    liquidationProxy: {
      rangePct,
      binSizePct,
      liquidityAbove: zones.above.total,
      liquidityBelow: zones.below.total,
      bias: zones.bias,
      nearestAbove: zones.above.nearest,
      nearestBelow: zones.below.nearest,
      strongestAbove: zones.above.strongest,
      strongestBelow: zones.below.strongest,
      sweepTarget: buildSweepTarget(zones),
      heatmapAbove: zones.heatmapAbove,
      heatmapBelow: zones.heatmapBelow,
    },
    signal,
    tradeSetup,
    quickScan: { score: quickScore, direction: quickDirection },
    volDump: {
      triggered: vlHighCount >= 3 && (vlDumpPct <= -1.5 || vl4cPct <= -2.5),
      highVolCount: vlHighCount,
      dumpCandlePct: round(vlDumpPct, 3),
      move4cPct: round(vl4cPct, 3),
      avgVol: round(vlAvg, 0),
      lastVol: round(vlLast?.quoteVolume ?? 0, 0),
    },
    ema99: {
      current: ema99Current != null ? { value: round(ema99Current, priceDigits), distPct: emaDistPct(ema99Current), label: interval } : null,
      h1: ema99_1h != null ? { value: round(ema99_1h, priceDigits), distPct: emaDistPct(ema99_1h), label: '1h' } : null,
      h4: ema99_4h != null ? { value: round(ema99_4h, priceDigits), distPct: emaDistPct(ema99_4h), label: '4h' } : null,
    },
  };
}

function buildTradeSetup({ currentPrice, atrPct, signal, zones, book, momentumPct, momentumPct48h, takerBuyRatio }) {
  const atrPrice = Math.max(currentPrice * atrPct, currentPrice * 0.001);
  const priceDigits = priceDigitsFor(currentPrice);
  const nearestAbove = zones.above.nearest[0] ?? null;
  const nearestBelow = zones.below.nearest[0] ?? null;
  const aboveTargets = uniquePrices(zones.above.strongest, currentPrice, 'above', priceDigits).slice(0, 3);
  const belowTargets = uniquePrices(zones.below.strongest, currentPrice, 'below', priceDigits).slice(0, 3);
  const trendAligned = (momentumPct > 0) === (momentumPct48h > 0);
  const longVotes = [
    signal.score > 0.18,
    momentumPct > 0.002,
    takerBuyRatio > 0.51,
    book.imbalance > 0.08,
    zones.bias > 0.05,
  ].filter(Boolean).length;
  const shortVotes = [
    signal.score < -0.18,
    momentumPct < -0.002,
    takerBuyRatio < 0.49,
    book.imbalance < -0.08,
    zones.bias < -0.05,
  ].filter(Boolean).length;

  if (!trendAligned && (longVotes >= 3 || shortVotes >= 3)) {
    return {
      direction: 'wait',
      confidence: 'low',
      entryType: 'trend_conflict',
      entry: null,
      triggerPrice: null,
      invalidation: null,
      stopLoss: null,
      targets: [],
      primaryTarget: null,
      expectedMovePct: 0,
      breakoutLevels: {
        longAbove: round(nearestAbove?.price ?? currentPrice + atrPrice, priceDigits),
        shortBelow: round(nearestBelow?.price ?? currentPrice - atrPrice, priceDigits),
      },
      reason: [
        `24h (${momentumPct > 0 ? '+' : ''}${round(momentumPct * 100, 2)}%) và 48h (${momentumPct48h > 0 ? '+' : ''}${round(momentumPct48h * 100, 2)}%) mâu thuẫn chiều.`,
        'Không trade khi hai khung thời gian không đồng thuận — rủi ro cao bị quét.',
        'Chờ cả 24h và 48h cùng dương (long) hoặc cùng âm (short).',
      ],
    };
  }

  if (longVotes >= 3 && longVotes > shortVotes) {
    const entryLow = Math.max(currentPrice - atrPrice * 0.45, nearestBelow?.price ?? currentPrice - atrPrice);
    const entryHigh = currentPrice + atrPrice * 0.15;
    const invalidation = (nearestBelow?.price ?? entryLow) - atrPrice * 0.65;
    const targets = aboveTargets.length ? aboveTargets : [currentPrice + atrPrice, currentPrice + atrPrice * 1.8];

    return {
      direction: 'long',
      confidence: confidenceFor(longVotes, Math.abs(signal.score)),
      entryType: 'pullback_or_breakout_confirmation',
      entry: formatPriceRange(entryLow, entryHigh, priceDigits),
      triggerPrice: round(nearestAbove?.price ?? currentPrice + atrPrice * 0.5, priceDigits),
      invalidation: round(invalidation, priceDigits),
      stopLoss: round(invalidation, priceDigits),
      targets,
      primaryTarget: targets[0] ?? null,
      expectedMovePct: round((((targets[0] ?? currentPrice) - currentPrice) / currentPrice) * 100, 3),
      reason: [
        'Score nghiêng về long.',
        'Momentum/taker flow/order book có đủ xác nhận cùng chiều.',
        'Target lấy từ các cụm liquidity phía trên.',
      ],
    };
  }

  if (shortVotes >= 3 && shortVotes > longVotes) {
    const entryLow = currentPrice - atrPrice * 0.15;
    const entryHigh = Math.min(currentPrice + atrPrice * 0.45, nearestAbove?.price ?? currentPrice + atrPrice);
    const invalidation = (nearestAbove?.price ?? entryHigh) + atrPrice * 0.65;
    const targets = belowTargets.length ? belowTargets : [currentPrice - atrPrice, currentPrice - atrPrice * 1.8];

    return {
      direction: 'short',
      confidence: confidenceFor(shortVotes, Math.abs(signal.score)),
      entryType: 'pullback_or_breakdown_confirmation',
      entry: formatPriceRange(entryLow, entryHigh, priceDigits),
      triggerPrice: round(nearestBelow?.price ?? currentPrice - atrPrice * 0.5, priceDigits),
      invalidation: round(invalidation, priceDigits),
      stopLoss: round(invalidation, priceDigits),
      targets,
      primaryTarget: targets[0] ?? null,
      expectedMovePct: round((((targets[0] ?? currentPrice) - currentPrice) / currentPrice) * 100, 3),
      reason: [
        'Score nghiêng về short.',
        'Momentum/taker flow/order book có đủ xác nhận cùng chiều.',
        'Target lấy từ các cụm liquidity phía dưới.',
      ],
    };
  }

  return {
    direction: 'wait',
    confidence: 'low',
    entryType: 'no_trade_until_breakout',
    entry: null,
    triggerPrice: null,
    invalidation: null,
    stopLoss: null,
    targets: [],
    primaryTarget: null,
    expectedMovePct: 0,
    breakoutLevels: {
      longAbove: round(nearestAbove?.price ?? currentPrice + atrPrice, priceDigits),
      shortBelow: round(nearestBelow?.price ?? currentPrice - atrPrice, priceDigits),
    },
    reason: [
      'Signal chưa đủ lệch để chọn long hoặc short.',
      'Nên chờ giá phá một trong hai vùng trigger và có xác nhận từ taker buy/order book.',
    ],
  };
}

export function computeHeatmapData({ klines, currentPrice, liqRangePct = 5.0, binSizePct = 0.001, leverages = DEFAULT_LEVERAGES }) {
  const priceDigits = priceDigitsFor(currentPrice);
  const liquidationMap = buildLiquidationMap({ klines, currentPrice, priceDigits, rangePct: liqRangePct, binSizePct, leverages });
  const zones = summarizeZones(liquidationMap, currentPrice, priceDigits);
  return {
    heatmapAbove: zones.heatmapAbove,
    heatmapBelow: zones.heatmapBelow,
    sweepTarget: buildSweepTarget(zones),
    bias: zones.bias,
    liquidityAbove: zones.above.total,
    liquidityBelow: zones.below.total,
  };
}

function buildLiquidationMap({ klines, currentPrice, priceDigits, rangePct, binSizePct, leverages }) {
  const minPrice = currentPrice * (1 - rangePct);
  const maxPrice = currentPrice * (1 + rangePct);
  const binSize = currentPrice * binSizePct;
  const binKeyDigits = Math.max(priceDigits + 2, 8);
  const bins = new Map();
  const recentKlines = klines.slice(-Math.min(klines.length, 500));

  recentKlines.forEach((kline, index) => {
    const ageWeight = Math.pow((index + 1) / recentKlines.length, 2);
    const volumeWeight = Math.max(kline.quoteVolume, 1);
    const buyPressure = safeDivide(kline.takerBuyQuoteVolume, kline.quoteVolume, 0.5);
    // High buy pressure → price rising → contrarian SHORTS accumulate above
    // High sell pressure → price falling → contrarian LONGS accumulate below
    const longWeight = volumeWeight * (1 - buyPressure) * ageWeight;
    const shortWeight = volumeWeight * buyPressure * ageWeight;

    leverages.forEach((leverage) => {
      const longLiquidationPrice = kline.close * (1 - 1 / leverage);
      const shortLiquidationPrice = kline.close * (1 + 1 / leverage);
      const leverageWeight = Math.sqrt(leverage);

      // Only model TRAPPED positions — those still underwater at current price:
      // Trapped longs: entered ABOVE current price → liq is below current → bearish magnet
      if (kline.close > currentPrice && currentPrice > longLiquidationPrice) {
        addBin(bins, longLiquidationPrice, longWeight * leverageWeight, 'below', {
          minPrice,
          maxPrice,
          binSize,
          binKeyDigits,
        });
      }
      // Trapped shorts: entered BELOW current price → liq is above current → bullish magnet
      if (kline.close < currentPrice && currentPrice < shortLiquidationPrice) {
        addBin(bins, shortLiquidationPrice, shortWeight * leverageWeight, 'above', {
          minPrice,
          maxPrice,
          binSize,
          binKeyDigits,
        });
      }
    });
  });

  return [...bins.values()].sort((a, b) => a.price - b.price);
}

function addBin(bins, price, score, side, { minPrice, maxPrice, binSize, binKeyDigits }) {
  if (price < minPrice || price > maxPrice) {
    return;
  }

  const bucket = Math.round(price / binSize) * binSize;
  const key = bucket.toFixed(binKeyDigits);
  const existing = bins.get(key) ?? {
    price: bucket,
    aboveScore: 0,
    belowScore: 0,
    totalScore: 0,
  };

  if (side === 'above') {
    existing.aboveScore += score;
  } else {
    existing.belowScore += score;
  }

  existing.totalScore += score;
  bins.set(key, existing);
}

function summarizeZones(liquidationMap, currentPrice, priceDigits) {
  const above = liquidationMap.filter((zone) => zone.price > currentPrice);
  const below = liquidationMap.filter((zone) => zone.price < currentPrice);
  const aboveTotal = sum(above.map((zone) => zone.totalScore));
  const belowTotal = sum(below.map((zone) => zone.totalScore));

  const aboveSorted = [...above].sort((a, b) => b.totalScore - a.totalScore);
  const belowSorted = [...below].sort((a, b) => b.totalScore - a.totalScore);
  const maxScore = Math.max(...aboveSorted.slice(0, 20).map((z) => z.totalScore), ...belowSorted.slice(0, 20).map((z) => z.totalScore), 1);

  function toHeatmapZone(zone) {
    return {
      price: round(zone.price, priceDigits),
      distancePct: round(((zone.price - currentPrice) / currentPrice) * 100, 3),
      score: round(zone.totalScore, 2),
      intensity: round(zone.totalScore / maxScore, 3),
    };
  }

  return {
    bias: round(safeDivide(aboveTotal - belowTotal, aboveTotal + belowTotal, 0), 4),
    above: {
      total: round(aboveTotal, 2),
      nearest: formatZones(above.slice(0, 5), currentPrice, priceDigits),
      strongest: formatZones(aboveSorted.slice(0, 5), currentPrice, priceDigits),
    },
    below: {
      total: round(belowTotal, 2),
      nearest: formatZones(below.slice(-5).reverse(), currentPrice, priceDigits),
      strongest: formatZones(belowSorted.slice(0, 5), currentPrice, priceDigits),
    },
    heatmapAbove: aboveSorted.slice(0, 20).map(toHeatmapZone).sort((a, b) => b.price - a.price),
    heatmapBelow: belowSorted.slice(0, 20).map(toHeatmapZone).sort((a, b) => b.price - a.price),
  };
}

function formatZones(zones, currentPrice, priceDigits) {
  return zones.map((zone) => ({
    price: round(zone.price, priceDigits),
    distancePct: round(((zone.price - currentPrice) / currentPrice) * 100, 3),
    score: round(zone.totalScore, 2),
  }));
}

function summarizeOrderBook(depth, currentPrice, rangePct) {
  const minBid = currentPrice * (1 - rangePct);
  const maxAsk = currentPrice * (1 + rangePct);
  const bids = depth.bids.filter(([price]) => price >= minBid && price <= currentPrice);
  const asks = depth.asks.filter(([price]) => price <= maxAsk && price >= currentPrice);
  const bidNotional = sum(bids.map(([price, quantity]) => price * quantity));
  const askNotional = sum(asks.map(([price, quantity]) => price * quantity));

  return {
    rangePct,
    bidNotional: round(bidNotional, 2),
    askNotional: round(askNotional, 2),
    imbalance: round(safeDivide(bidNotional - askNotional, bidNotional + askNotional, 0), 4),
    strongestBids: formatBookLevels(bids.sort((a, b) => b[0] * b[1] - a[0] * a[1]).slice(0, 5), currentPrice),
    strongestAsks: formatBookLevels(asks.sort((a, b) => b[0] * b[1] - a[0] * a[1]).slice(0, 5), currentPrice),
  };
}

function formatBookLevels(levels, currentPrice) {
  const priceDigits = priceDigitsFor(currentPrice);

  return levels.map(([price, quantity]) => ({
    price: round(price, priceDigits),
    distancePct: round(((price - currentPrice) / currentPrice) * 100, 3),
    quantity: round(quantity, 4),
    notional: round(price * quantity, 2),
  }));
}

function scoreSignal({ momentumPct, fundingRate, takerBuyRatio, bookImbalance, liquidityBias, longShortRatio }) {
  const components = {
    momentum: clamp(momentumPct / 0.02, -1, 1),
    funding: clamp(-fundingRate / 0.0005, -1, 1),
    takerFlow: clamp((takerBuyRatio - 0.5) / 0.12, -1, 1),
    orderBook: clamp(bookImbalance / 0.25, -1, 1),
    liquidityMagnet: clamp(liquidityBias, -1, 1),
    crowding: longShortRatio ? clamp((1 - longShortRatio) / 0.8, -1, 1) : 0,
  };
  const score = (
    components.momentum * 0.3
    + components.funding * 0.1
    + components.takerFlow * 0.2
    + components.orderBook * 0.15
    + components.liquidityMagnet * 0.2
    + components.crowding * 0.05
  );
  let label = 'neutral';

  if (liquidityBias > 0.35 && score > 0.15) {
    label = 'bullish_squeeze';
  } else if (liquidityBias < -0.35 && score < -0.15) {
    label = 'bearish_sweep';
  } else if (score > 0.25) {
    label = 'uptrend';
  } else if (score < -0.25) {
    label = 'downtrend';
  }

  return {
    label,
    score: round(score, 4),
    components: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [key, round(value, 4)]),
    ),
  };
}

function calculateAtrPct(klines, period = 14) {
  const selected = klines.slice(-period - 1);
  const trueRanges = selected.slice(1).map((kline, index) => {
    const previousClose = selected[index].close;

    return Math.max(
      kline.high - kline.low,
      Math.abs(kline.high - previousClose),
      Math.abs(kline.low - previousClose),
    );
  });

  return safeDivide(sum(trueRanges) / trueRanges.length, klines.at(-1).close, 0);
}

function calculateTakerBuyRatio(klines) {
  const selected = klines.slice(-48);
  const takerBuyQuoteVolume = sum(selected.map((kline) => kline.takerBuyQuoteVolume));
  const quoteVolume = sum(selected.map((kline) => kline.quoteVolume));

  return safeDivide(takerBuyQuoteVolume, quoteVolume, 0.5);
}

function normalizeLongShortRatio(rows) {
  const latest = Array.isArray(rows) ? rows.at(-1) : null;

  if (!latest) {
    return null;
  }

  return {
    longShortRatio: Number(latest.longShortRatio),
    longAccount: Number(latest.longAccount),
    shortAccount: Number(latest.shortAccount),
    timestamp: Number(latest.timestamp),
  };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function uniquePrices(zones, currentPrice, side, digits) {
  const seen = new Set();

  return zones
    .filter((zone) => (side === 'above' ? zone.price > currentPrice : zone.price < currentPrice))
    .map((zone) => round(zone.price, digits))
    .filter((price) => {
      if (seen.has(price)) {
        return false;
      }

      seen.add(price);

      return true;
    });
}

function formatPriceRange(low, high, digits) {
  return {
    low: round(Math.min(low, high), digits),
    high: round(Math.max(low, high), digits),
  };
}

function priceDigitsFor(value) {
  const abs = Math.abs(Number(value));

  if (!Number.isFinite(abs) || abs === 0) {
    return 4;
  }

  if (abs >= 1000) {
    return 2;
  }

  if (abs >= 100) {
    return 3;
  }

  if (abs >= 10) {
    return 4;
  }

  if (abs >= 1) {
    return 5;
  }

  if (abs >= 0.1) {
    return 6;
  }

  if (abs >= 0.01) {
    return 7;
  }

  return 8;
}

function confidenceFor(votes, scoreMagnitude) {
  if (votes >= 5 || scoreMagnitude >= 0.45) {
    return 'high';
  }

  if (votes >= 4 || scoreMagnitude >= 0.28) {
    return 'medium';
  }

  return 'low';
}

function safeDivide(numerator, denominator, fallback) {
  return denominator === 0 ? fallback : numerator / denominator;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 4) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
