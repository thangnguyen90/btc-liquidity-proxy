import { evaluateEmaPreStageCandle } from './emaPreStageCandleRule.js';

export const EMA_STAGE_CANDLE_RULE_VERSION = 'EMA_STAGE_CANDLE_OBSERVE_V1_20260723';

function normalize(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function patternName(value) {
  return normalize(value && typeof value === 'object'
    ? (value.name ?? value.pattern ?? value.label ?? value.direction)
    : value) || 'NO_DATA';
}

function candleBias(value) {
  const name = patternName(value);
  const direction = normalize(value?.direction);
  if (name.includes('BEARISH') || name === 'SHOOTING_STAR' || direction.includes('BEAR')) return 'BEARISH';
  if (name.includes('BULLISH') || name === 'HAMMER' || direction.includes('BULL')) return 'BULLISH';
  if (['NO_DATA', 'UNKNOWN'].includes(name)) return 'NO_DATA';
  return 'NEUTRAL';
}

function tierCode(label, fallback = 'WATCH') {
  const value = normalize(label);
  if (value.startsWith('GOOD_TEST')) return 'GOOD_TEST';
  if (value.startsWith('WATCH_PLUS')) return 'WATCH_PLUS';
  if (value.startsWith('GOOD')) return 'GOOD';
  if (value.startsWith('RISK')) return 'RISK';
  return fallback;
}

export function emaStageCandleStageOf({
  stage,
  source,
  note,
  runnerCandidate,
} = {}) {
  const explicit = normalize(stage);
  if ([
    'PRE_BREAKOUT', 'PRE_BREAKDOWN', 'BREAKOUT', 'BREAKDOWN',
    'SQUEEZE_LONG', 'SQUEEZE_SHORT', 'RUNNER', 'BR_LIKE_LONG', 'BR_LIKE_SHORT',
  ].includes(explicit)) return explicit;
  if (explicit === 'SQUEEZE') return 'SQUEEZE_LONG';
  if (explicit === 'BR_LIKE') return 'BR_LIKE_LONG';

  const text = `${normalize(source)} ${normalize(note)}`;
  if (runnerCandidate || text.includes('RUNNER')) return 'RUNNER';
  if (text.includes('PRE_BREAKDOWN')) return 'PRE_BREAKDOWN';
  if (text.includes('PRE_BREAKOUT')) return 'PRE_BREAKOUT';
  if (text.includes('BR_LIKE_SHORT')) return 'BR_LIKE_SHORT';
  if (text.includes('BR_LIKE')) return 'BR_LIKE_LONG';
  if (text.includes('SQUEEZE_SHORT')) return 'SQUEEZE_SHORT';
  if (text.includes('BREAKDOWN')) return 'BREAKDOWN';
  if (text.includes('BREAKOUT')) return 'BREAKOUT';
  if (text.includes('SQUEEZE')) return 'SQUEEZE_LONG';
  return 'EMA_OTHER';
}

function btcRegimeOf({ btcHealth, btcPhase, btcRegimeAtEntry } = {}) {
  const direction = normalize(btcHealth?.btcTrendDir);
  if (direction === 'UP') return 'SW_UP';
  if (direction === 'DOWN') return 'SW_DOWN';
  const stored = normalize(
    btcPhase ?? btcRegimeAtEntry ?? btcHealth?.regime ?? btcHealth?.marketRegime,
  );
  if (stored.includes('UP') || stored === 'STRONG') return 'SW_UP';
  if (stored.includes('DOWN') || stored === 'WEAK') return 'SW_DOWN';
  const pct6h = Number(btcHealth?.pct6h);
  if (Number.isFinite(pct6h) && pct6h > 0) return 'SW_UP';
  if (Number.isFinite(pct6h) && pct6h < 0) return 'SW_DOWN';
  return 'SW_FLAT';
}

function result({
  tier = 'WATCH',
  label = tier,
  code,
  stage,
  side,
  timeframe,
  altPattern,
  altBias,
  btcPattern,
  btcBias,
  btcRegime,
  btcCorr,
}) {
  const contextKey = [
    stage,
    side,
    timeframe,
    `ALT_${altPattern}`,
    `BTC_${btcPattern}`,
  ].join('|');
  return {
    version: EMA_STAGE_CANDLE_RULE_VERSION,
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    affectsSl: false,
    affectsTp: false,
    tier,
    label,
    code,
    stage,
    side,
    timeframe,
    altPattern,
    altBias,
    btcPattern,
    btcBias,
    btcRegime,
    btcCorr: Number.isFinite(Number(btcCorr)) ? Number(btcCorr) : null,
    contextKey,
    reason: `${code}; ${stage} ${side} ${timeframe}; ALT=${altPattern}/${altBias}; BTC=${btcPattern}/${btcBias}; regime=${btcRegime}; OBSERVE_ONLY=Y`,
  };
}

export function evaluateEmaStageCandle({
  stage,
  source,
  note,
  runnerCandidate,
  side,
  timeframe,
  interval,
  symbolCandle,
  btcCandle,
  btcHealth,
  btcPhase,
  btcRegimeAtEntry,
  btcCorr,
} = {}) {
  const resolvedStage = emaStageCandleStageOf({ stage, source, note, runnerCandidate });
  const resolvedSide = normalize(side)
    || (['BREAKOUT', 'PRE_BREAKOUT', 'SQUEEZE_LONG', 'BR_LIKE_LONG'].includes(resolvedStage)
      ? 'LONG'
      : ['BREAKDOWN', 'PRE_BREAKDOWN', 'SQUEEZE_SHORT', 'BR_LIKE_SHORT'].includes(resolvedStage)
        ? 'SHORT'
        : 'NO_SIDE');
  const resolvedTimeframe = String(timeframe ?? interval ?? '').trim().toLowerCase() || 'no_tf';
  const altPattern = patternName(symbolCandle);
  const btcPattern = patternName(btcCandle);
  const altBias = candleBias(symbolCandle);
  const btcBias = candleBias(btcCandle);
  const btcRegime = btcRegimeOf({ btcHealth, btcPhase, btcRegimeAtEntry });
  const base = {
    stage: resolvedStage,
    side: resolvedSide,
    timeframe: resolvedTimeframe,
    altPattern,
    altBias,
    btcPattern,
    btcBias,
    btcRegime,
    btcCorr,
  };

  if (altBias === 'NO_DATA' || btcBias === 'NO_DATA') {
    return result({
      ...base,
      tier: 'WATCH',
      label: 'WATCH · NO DATA',
      code: 'EMA_STAGE_CANDLE_PAIR_MISSING',
    });
  }

  if (['PRE_BREAKOUT', 'PRE_BREAKDOWN'].includes(resolvedStage)) {
    const pre = evaluateEmaPreStageCandle({
      stage: resolvedStage,
      side: resolvedSide,
      interval: resolvedTimeframe,
      symbolCandle,
      btcCandle,
    });
    if (pre) {
      return result({
        ...base,
        tier: tierCode(pre.label, pre.tier),
        label: pre.label,
        code: `PRE_ROUTER_${pre.reasonCode}`,
      });
    }
  }

  if (resolvedStage === 'BREAKOUT') {
    if (resolvedTimeframe === '5m') {
      if (altBias === 'BULLISH' && btcBias === 'BEARISH') {
        return result({ ...base, tier: 'RISK', label: 'RISK', code: 'BREAKOUT_5M_ALT_BULLISH_BTC_BEARISH' });
      }
      if (altBias === 'BEARISH') {
        return result({ ...base, tier: 'WATCH_PLUS', label: 'WATCH+', code: 'BREAKOUT_5M_ALT_PULLBACK' });
      }
      return result({ ...base, tier: 'GOOD', label: 'GOOD', code: 'BREAKOUT_5M_CONFIRMATION_BASE' });
    }
    if (altBias === 'BEARISH' && btcBias === 'BULLISH') {
      return result({ ...base, tier: 'WATCH_PLUS', label: 'WATCH+', code: 'BREAKOUT_15M_PULLBACK_BTC_SUPPORT' });
    }
    if (altBias === 'BULLISH' && btcBias === 'BEARISH') {
      return result({ ...base, tier: 'RISK', label: 'RISK', code: 'BREAKOUT_15M_ALT_BULLISH_BTC_BEARISH' });
    }
    return result({ ...base, tier: 'WATCH', label: 'WATCH', code: 'BREAKOUT_15M_OBSERVE_BASE' });
  }

  if (resolvedStage === 'BREAKDOWN') {
    if (resolvedTimeframe === '5m') {
      if (btcRegime !== 'SW_UP' && altBias === 'BULLISH' && btcBias !== 'BEARISH') {
        return result({ ...base, tier: 'GOOD_TEST', label: 'GOOD-TEST', code: 'BREAKDOWN_5M_COUNTER_CANDLE_TEST' });
      }
      return result({
        ...base,
        tier: 'RISK',
        label: 'RISK',
        code: btcRegime === 'SW_UP' ? 'BREAKDOWN_5M_AGAINST_SW_UP' : 'BREAKDOWN_5M_RISK_BASE',
      });
    }
    if (btcRegime !== 'SW_UP' && altBias === 'BEARISH' && btcBias === 'BEARISH') {
      return result({ ...base, tier: 'GOOD_TEST', label: 'GOOD-TEST', code: 'BREAKDOWN_15M_DOUBLE_BEARISH_TEST' });
    }
    return result({
      ...base,
      tier: btcRegime === 'SW_UP' ? 'RISK' : 'WATCH',
      label: btcRegime === 'SW_UP' ? 'RISK' : 'WATCH',
      code: btcRegime === 'SW_UP' ? 'BREAKDOWN_15M_AGAINST_SW_UP' : 'BREAKDOWN_15M_OBSERVE_BASE',
    });
  }

  if (resolvedStage === 'SQUEEZE_LONG') {
    if (altBias === 'NEUTRAL' && ['NEUTRAL', 'BULLISH'].includes(btcBias)) {
      return result({ ...base, tier: 'WATCH_PLUS', label: 'WATCH+', code: 'SQUEEZE_LONG_COMPRESSION_READY' });
    }
    if ((altBias === 'BULLISH' && btcBias === 'BEARISH')
        || (altBias === 'BEARISH' && btcBias === 'BEARISH')) {
      return result({ ...base, tier: 'RISK', label: 'RISK', code: 'SQUEEZE_LONG_BEARISH_CONTEXT' });
    }
    return result({ ...base, tier: 'WATCH', label: 'WATCH', code: 'SQUEEZE_LONG_OBSERVE_BASE' });
  }

  if (resolvedStage === 'SQUEEZE_SHORT') {
    if (altBias === 'NEUTRAL' && ['NEUTRAL', 'BEARISH'].includes(btcBias)) {
      return result({ ...base, tier: 'WATCH_PLUS', label: 'WATCH+', code: 'SQUEEZE_SHORT_COMPRESSION_READY' });
    }
    if ((altBias === 'BEARISH' && btcBias === 'BULLISH')
        || (altBias === 'BULLISH' && btcBias === 'BULLISH')) {
      return result({ ...base, tier: 'RISK', label: 'RISK', code: 'SQUEEZE_SHORT_BULLISH_CONTEXT' });
    }
    return result({ ...base, tier: 'WATCH', label: 'WATCH', code: 'SQUEEZE_SHORT_OBSERVE_BASE' });
  }

  if (resolvedStage === 'RUNNER') {
    const sideBias = resolvedSide === 'SHORT' ? 'BEARISH' : 'BULLISH';
    const oppositeBias = resolvedSide === 'SHORT' ? 'BULLISH' : 'BEARISH';
    const independent = Number.isFinite(Number(btcCorr)) && Number(btcCorr) < 0.3;
    if (altBias === oppositeBias || (!independent && btcBias === oppositeBias)) {
      return result({ ...base, tier: 'RISK', label: 'RISK', code: 'RUNNER_CANDLE_CONTINUATION_CONFLICT' });
    }
    if (altBias === sideBias && (btcBias === sideBias || independent)) {
      return result({ ...base, tier: 'WATCH_PLUS', label: 'WATCH+', code: 'RUNNER_CANDLE_CONTINUATION_SUPPORT' });
    }
    return result({ ...base, tier: 'WATCH', label: 'WATCH', code: 'RUNNER_CANDLE_MIXED' });
  }

  if (resolvedStage === 'BR_LIKE_LONG') {
    if (altBias === 'BEARISH' && btcBias === 'BEARISH') {
      return result({ ...base, tier: 'RISK', label: 'RISK', code: 'BR_LIKE_LONG_DOUBLE_BEARISH' });
    }
    if (altBias === 'BULLISH' && btcBias !== 'BEARISH') {
      return result({ ...base, tier: 'WATCH_PLUS', label: 'WATCH+', code: 'BR_LIKE_LONG_CANDLE_SUPPORT' });
    }
    return result({ ...base, tier: 'WATCH', label: 'WATCH', code: 'BR_LIKE_LONG_OBSERVE_BASE' });
  }

  if (resolvedStage === 'BR_LIKE_SHORT') {
    if (altBias === 'BULLISH' && btcBias === 'BULLISH') {
      return result({ ...base, tier: 'RISK', label: 'RISK', code: 'BR_LIKE_SHORT_DOUBLE_BULLISH' });
    }
    if (altBias === 'BEARISH' && btcBias !== 'BULLISH') {
      return result({ ...base, tier: 'WATCH_PLUS', label: 'WATCH+', code: 'BR_LIKE_SHORT_CANDLE_SUPPORT' });
    }
    return result({ ...base, tier: 'WATCH', label: 'WATCH', code: 'BR_LIKE_SHORT_OBSERVE_BASE' });
  }

  return result({ ...base, tier: 'WATCH', label: 'WATCH', code: 'EMA_STAGE_CANDLE_UNSUPPORTED_STAGE' });
}
