const VERSION = 'EMA_PRE_CANDLE_OBSERVE_V2_20260722';

function normalize(value) {
  return String(value ?? '').trim().toUpperCase();
}

function patternName(value) {
  return normalize(value?.name ?? value) || 'NO_DATA';
}

function candleBias(value) {
  const name = patternName(value);
  const direction = normalize(value?.direction);
  if (name.includes('BEARISH') || name === 'SHOOTING_STAR' || direction.includes('BEAR')) return 'BEARISH';
  if (name.includes('BULLISH') || name === 'HAMMER' || direction.includes('BULL')) return 'BULLISH';
  if (['NO_DATA', 'UNKNOWN'].includes(name)) return 'NO_DATA';
  return 'NEUTRAL';
}

export function evaluateEmaPreStageCandle({
  stage,
  side,
  interval,
  symbolCandle,
  btcCandle,
} = {}) {
  const normalizedStage = normalize(stage).replace(/[^A-Z]/g, '');
  const normalizedSide = normalize(side);
  const timeframe = String(interval ?? '').trim().toLowerCase();
  const isPreBreakout = normalizedStage === 'PREBREAKOUT' && normalizedSide === 'LONG';
  const isPreBreakdown = normalizedStage === 'PREBREAKDOWN' && normalizedSide === 'SHORT';
  if (!isPreBreakout && !isPreBreakdown) return null;

  const symbolPattern = patternName(symbolCandle);
  const btcPattern = patternName(btcCandle);
  const symbolBias = candleBias(symbolCandle);
  const btcBias = candleBias(btcCandle);
  const hasCandlePair = symbolBias !== 'NO_DATA' && btcBias !== 'NO_DATA';

  let tier = 'WATCH';
  let label = 'WATCH';
  let reasonCode = 'INSUFFICIENT_CONTEXT';

  if (!hasCandlePair) {
    label = 'WATCH';
    reasonCode = 'CANDLE_NO_DATA';
  } else if (isPreBreakout && timeframe === '5m') {
    tier = 'GOOD';
    label = 'GOOD';
    reasonCode = 'PB_5M_POSITIVE_BASE';

    if (symbolBias === 'BULLISH' && btcBias === 'BULLISH') {
      tier = 'RISK';
      label = 'RISK';
      reasonCode = 'PB_5M_DOUBLE_BULLISH_CHASE';
    } else if (symbolBias === 'BULLISH' && btcBias === 'BEARISH') {
      tier = 'WATCH';
      label = btcPattern === 'SHOOTING_STAR' ? 'GOOD-TEST' : 'WATCH';
      reasonCode = btcPattern === 'SHOOTING_STAR'
        ? 'PB_5M_BTC_SHOOTING_STAR_SMALL_SAMPLE'
        : 'PB_5M_BULLISH_ALT_BEARISH_BTC_UNSTABLE';
    } else if (symbolBias === 'BEARISH' && btcBias === 'BULLISH') {
      tier = 'WATCH';
      label = 'GOOD-TEST';
      reasonCode = 'PB_5M_ALT_PULLBACK_BTC_SUPPORT_SMALL_SAMPLE';
    }
  } else if (isPreBreakout && timeframe === '15m') {
    tier = 'RISK';
    label = 'RISK';
    reasonCode = 'PB_15M_NEGATIVE_PAYOFF_BASE';

    if (symbolBias === 'BEARISH' && btcBias === 'NEUTRAL') {
      tier = 'WATCH';
      label = 'WATCH+';
      reasonCode = 'PB_15M_ALT_PULLBACK_BTC_NEUTRAL';
    } else if (symbolBias === 'BEARISH' && btcBias === 'BEARISH') {
      tier = 'WATCH';
      label = 'WATCH';
      reasonCode = 'PB_15M_DOUBLE_BEARISH_WATCH';
    } else if (symbolBias === 'BEARISH' && btcBias === 'BULLISH') {
      reasonCode = 'PB_15M_ALT_BEARISH_BTC_BULLISH_NEGATIVE';
    } else if (symbolBias === 'BULLISH') {
      reasonCode = 'PB_15M_BULLISH_ALT_NEGATIVE_PAYOFF';
    }
  } else if (isPreBreakdown && timeframe === '15m') {
    tier = 'WATCH';
    label = 'WATCH';
    reasonCode = 'PBD_15M_INCONCLUSIVE_BASE';

    if (symbolBias === 'BEARISH' && btcBias === 'BULLISH') {
      tier = 'RISK';
      label = 'RISK';
      reasonCode = 'PBD_15M_BEARISH_ALT_BULLISH_BTC_NEGATIVE';
    }
  } else if (isPreBreakdown && timeframe === '5m') {
    tier = 'RISK';
    label = 'RISK';
    reasonCode = 'PBD_5M_NEGATIVE_BASE';
  } else {
    tier = 'WATCH';
    label = 'WATCH';
    reasonCode = 'UNSUPPORTED_TIMEFRAME';
  }

  return {
    allow: true,
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    tier,
    label,
    testOnly: false,
    marginUsdt: null,
    stage: isPreBreakout ? 'PRE_BREAKOUT' : 'PRE_BREAKDOWN',
    interval: timeframe || 'NO_DATA',
    symbolPattern,
    symbolBias,
    btcPattern,
    btcBias,
    reasonCode,
    version: VERSION,
    reason: `${reasonCode}; ${isPreBreakout ? 'PRE_BREAKOUT LONG' : 'PRE_BREAKDOWN SHORT'} ${timeframe || '-'}; ALT=${symbolPattern}/${symbolBias}; BTC=${btcPattern}/${btcBias}; label=${label}; OBSERVE_ONLY=Y`,
  };
}

export const EMA_PRE_STAGE_CANDLE_RULE_VERSION = VERSION;
