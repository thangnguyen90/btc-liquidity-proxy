const DEFAULT_LEVERAGES = [5, 10, 20, 25, 50, 75, 100];

export function analyzeMarket({
  symbol,
  klines,
  depth,
  premiumIndex,
  openInterest,
  longShortRatio = null,
  rangePct = 0.04,
  binSizePct = 0.001,
  leverages = DEFAULT_LEVERAGES,
}) {
  const currentPrice = Number(premiumIndex.markPrice);
  const priceDigits = priceDigitsFor(currentPrice);
  const fundingRate = Number(premiumIndex.lastFundingRate);
  const openInterestValue = Number(openInterest.openInterest);
  const firstClose = klines[0].close;
  const lastClose = klines.at(-1).close;
  const momentumPct = (lastClose - firstClose) / firstClose;
  const atrPct = calculateAtrPct(klines);
  const takerBuyRatio = calculateTakerBuyRatio(klines);
  const book = summarizeOrderBook(depth, currentPrice, rangePct);
  const liquidationMap = buildLiquidationMap({
    klines,
    currentPrice,
    priceDigits,
    rangePct,
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
    takerBuyRatio,
  });

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
    },
    signal,
    tradeSetup,
  };
}

function buildTradeSetup({ currentPrice, atrPct, signal, zones, book, momentumPct, takerBuyRatio }) {
  const atrPrice = Math.max(currentPrice * atrPct, currentPrice * 0.001);
  const priceDigits = priceDigitsFor(currentPrice);
  const nearestAbove = zones.above.nearest[0] ?? null;
  const nearestBelow = zones.below.nearest[0] ?? null;
  const aboveTargets = uniquePrices(zones.above.strongest, currentPrice, 'above', priceDigits).slice(0, 3);
  const belowTargets = uniquePrices(zones.below.strongest, currentPrice, 'below', priceDigits).slice(0, 3);
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

function buildLiquidationMap({ klines, currentPrice, priceDigits, rangePct, binSizePct, leverages }) {
  const minPrice = currentPrice * (1 - rangePct);
  const maxPrice = currentPrice * (1 + rangePct);
  const binSize = currentPrice * binSizePct;
  const binKeyDigits = Math.max(priceDigits + 2, 8);
  const bins = new Map();
  const recentKlines = klines.slice(-Math.min(klines.length, 240));

  recentKlines.forEach((kline, index) => {
    const ageWeight = (index + 1) / recentKlines.length;
    const volumeWeight = Math.max(kline.quoteVolume, 1);
    const buyPressure = safeDivide(kline.takerBuyQuoteVolume, kline.quoteVolume, 0.5);
    const longWeight = volumeWeight * (1 - buyPressure) * ageWeight;
    const shortWeight = volumeWeight * buyPressure * ageWeight;

    leverages.forEach((leverage) => {
      const longLiquidationPrice = kline.close * (1 - 1 / leverage);
      const shortLiquidationPrice = kline.close * (1 + 1 / leverage);
      const leverageWeight = Math.sqrt(leverage);

      addBin(bins, longLiquidationPrice, longWeight * leverageWeight, 'below', {
        minPrice,
        maxPrice,
        binSize,
        binKeyDigits,
      });
      addBin(bins, shortLiquidationPrice, shortWeight * leverageWeight, 'above', {
        minPrice,
        maxPrice,
        binSize,
        binKeyDigits,
      });
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

  return {
    bias: round(safeDivide(aboveTotal - belowTotal, aboveTotal + belowTotal, 0), 4),
    above: {
      total: round(aboveTotal, 2),
      nearest: formatZones(above.slice(0, 5), currentPrice, priceDigits),
      strongest: formatZones([...above].sort((a, b) => b.totalScore - a.totalScore).slice(0, 5), currentPrice, priceDigits),
    },
    below: {
      total: round(belowTotal, 2),
      nearest: formatZones(below.slice(-5).reverse(), currentPrice, priceDigits),
      strongest: formatZones([...below].sort((a, b) => b.totalScore - a.totalScore).slice(0, 5), currentPrice, priceDigits),
    },
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
