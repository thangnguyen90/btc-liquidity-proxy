export const LIQUID_LONG_MARKET_STATE_VERSION =
  'LIQUID_LONG_MARKET_STATE_V1_20260727';

const UP_REGIMES = new Set(['UP', 'WEAK_UP', 'SIDEWAY_UP']);
const DOWN_REGIMES = new Set(['DOWN', 'WEAK_DOWN', 'SIDEWAY_DOWN']);

function finiteNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalized(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

function bullishReclaimCandle(candle = {}) {
  const direction = normalized(candle.direction);
  const name = normalized(candle.name);
  return direction === 'BULLISH'
    || name.startsWith('BULLISH')
    || ['HAMMER', 'BULLISH_PIN_BAR'].includes(name);
}

function labelOf(tier) {
  return tier === 'UNRATED' ? null : `LONG ${tier.replaceAll('_', ' ')}`;
}

export function evaluateLiquidLongMarketState(trade = {}) {
  const side = normalized(trade.side);
  const eligible = side === 'LONG';
  const health = trade.btcHealth ?? {};
  const candle = trade.btcCandlePatternAtEntry ?? {};
  const direction = normalized(health.btcTrendDir ?? trade.btcTrendDir);
  const emaTrend1h = normalized(health.emaTrend1h);
  const marketRegime = normalized(health.marketRegime ?? health.regime);
  const pct6h = finiteNumber(health.pct6h ?? trade.btcPct6h);
  const pct24h = finiteNumber(health.pct24h ?? trade.btcPct24h);
  const rsi1h = finiteNumber(health.rsi1h ?? trade.btcRsi1h);
  const obvTrend = normalized(health.obvTrend);
  const trendScore = finiteNumber(
    health.btcTrendScore ?? trade.btcTrendScore,
  );
  const btcCandleName = normalized(candle.name);
  const btcCandleDirection = normalized(candle.direction);
  const reclaimCandle = bullishReclaimCandle(candle);

  const missingFields = [
    !direction ? 'direction' : '',
    !emaTrend1h ? 'emaTrend1h' : '',
    !marketRegime ? 'marketRegime' : '',
    pct6h == null ? 'pct6h' : '',
    rsi1h == null ? 'rsi1h' : '',
    !obvTrend ? 'obvTrend' : '',
  ].filter(Boolean);

  const upRegime = UP_REGIMES.has(marketRegime)
    || (marketRegime === 'STRONG' && direction === 'UP');
  const downRegime = DOWN_REGIMES.has(marketRegime)
    || (marketRegime === 'STRONG' && direction === 'DOWN');
  const upStructure = direction === 'UP'
    && emaTrend1h === 'ABOVE'
    && upRegime;
  const downStructure = direction === 'DOWN'
    && emaTrend1h === 'BELOW'
    && downRegime;
  const reclaim = (
    direction === 'DOWN'
    || emaTrend1h === 'BELOW'
    || downRegime
  )
    && pct6h != null
    && pct6h > 0
    && obvTrend === 'RISING'
    && reclaimCandle;
  const late = upStructure && (
    rsi1h >= 68
    || pct6h <= 0.15
    || obvTrend !== 'RISING'
  );
  const tailwind = upStructure
    && pct6h > 0.15
    && rsi1h < 68
    && obvTrend === 'RISING';
  const headwind = downStructure
    && pct6h < -0.15
    && !reclaim;

  let tier = 'UNRATED';
  let reason = 'Chỉ đánh giá trạng thái thị trường cho lệnh LONG.';
  if (eligible && missingFields.length) {
    tier = 'NO_DATA';
    reason = `Thiếu snapshot: ${missingFields.join(', ')}.`;
  } else if (eligible && reclaim) {
    tier = 'RECLAIM';
    reason = 'Cấu trúc BTC còn dấu vết nhịp giảm nhưng pct6h, OBV và nến BTC đã xác nhận hồi phục.';
  } else if (eligible && late) {
    tier = 'LATE';
    reason = 'BTC vẫn giữ cấu trúc tăng nhưng RSI, pct6h hoặc OBV cho thấy nhịp tăng đã chậm/muộn.';
  } else if (eligible && tailwind) {
    tier = 'TAILWIND';
    reason = 'BTC tăng với EMA1h, regime, pct6h và OBV đồng thuận cho LONG.';
  } else if (eligible && headwind) {
    tier = 'HEADWIND';
    reason = 'BTC giảm với EMA1h, regime và pct6h đồng thuận; bất lợi cho LONG.';
  } else if (eligible) {
    tier = 'TRANSITION';
    reason = 'Các chiều BTC chưa đồng thuận hoặc đang chuyển pha; chưa đủ xác nhận LONG.';
  }

  return {
    liquidLongMarketEligible: eligible,
    liquidLongMarketTier: tier,
    liquidLongMarketCode: `LONG_MARKET_${tier}`,
    liquidLongMarketLabel: labelOf(tier),
    liquidLongMarketReason: reason,
    liquidLongMarketDirection: direction || null,
    liquidLongMarketTrendScore: trendScore,
    liquidLongMarketEmaTrend1h: emaTrend1h || null,
    liquidLongMarketRegime: marketRegime || null,
    liquidLongMarketPct6h: pct6h,
    liquidLongMarketPct24h: pct24h,
    liquidLongMarketRsi1h: rsi1h,
    liquidLongMarketObvTrend: obvTrend || null,
    liquidLongMarketBtcCandleName: btcCandleName || null,
    liquidLongMarketBtcCandleDirection: btcCandleDirection || null,
    liquidLongMarketReclaimCandle: reclaimCandle,
    liquidLongMarketMissingFields: missingFields,
    liquidLongMarketBasis: 'ENTRY_SNAPSHOT',
    liquidLongMarketVersion: LIQUID_LONG_MARKET_STATE_VERSION,
    liquidLongMarketObservationOnly: true,
    liquidLongMarketAffectsEntry: false,
    liquidLongMarketAffectsMargin: false,
    liquidLongMarketAffectsSl: false,
    liquidLongMarketAffectsTp: false,
  };
}
