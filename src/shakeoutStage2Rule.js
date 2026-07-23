export const SHAKEOUT_STAGE_2_VERSION = 'SHAKEOUT_STAGE_2_V2_TWO_LAYER';

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function setupOf({ setup, shakeoutCombo, signalType, subtype } = {}) {
  const direct = normalize(setup ?? subtype ?? signalType);
  if (direct) return direct;
  return normalize(String(shakeoutCombo ?? '').split('|')[0]) || 'NO_SETUP';
}

function fillQualityOf(variant, fillDelayMinutes, fillAt) {
  const normalizedVariant = normalize(variant);
  if (normalizedVariant === 'PENDING') {
    if (!fillAt) return 'PENDING_WAIT';
    if (fillDelayMinutes == null) return 'PENDING_NO_DELAY';
    if (fillDelayMinutes <= 15) return 'PENDING_FAST';
    if (fillDelayMinutes <= 45) return 'PENDING_NORMAL';
    return 'PENDING_LATE';
  }
  if (normalizedVariant === 'CHASE') return 'CHASE';
  if (normalizedVariant === 'MARKET') return 'MARKET';
  return normalizedVariant || 'NO_VARIANT';
}

export function shakeoutCandleBias(value) {
  const name = normalize(value && typeof value === 'object'
    ? (value.name ?? value.pattern ?? value.label ?? value.direction)
    : value);
  if (name.includes('BEARISH') || name === 'SHOOTING_STAR') return 'BEARISH';
  if (name.includes('BULLISH') || name === 'HAMMER') return 'BULLISH';
  return name === 'DOJI' ? 'NEUTRAL' : 'NO_DATA';
}

export function capShakeoutPendingShadowMargin({
  variant,
  marginUsdt,
  capUsdt = 1,
} = {}) {
  const margin = finiteNumber(marginUsdt);
  const cap = finiteNumber(capUsdt);
  if (margin == null || margin <= 0 || cap == null || cap <= 0) return margin;
  return normalize(variant) === 'PENDING' ? Math.min(margin, cap) : margin;
}

export function shakeoutRollingDriftStats(trades = [], candidate = {}, {
  windowSize = 15,
  minWindowSize = 8,
} = {}) {
  const variant = normalize(candidate.variant);
  const side = normalize(candidate.side);
  const beforeMs = Date.parse(candidate.openedAt ?? candidate.createdAt ?? '') || Date.now();
  const rows = (Array.isArray(trades) ? trades : [])
    .filter((trade) => {
      if (trade?.status !== 'CLOSED' || trade?.outcome === 'INVALID') return false;
      if (variant && normalize(trade.variant) !== variant) return false;
      if (side && normalize(trade.side) !== side) return false;
      const closedMs = Date.parse(trade.closedAt ?? trade.openedAt ?? trade.createdAt ?? '');
      return Number.isFinite(closedMs) && closedMs < beforeMs;
    })
    .sort((a, b) => Date.parse(b.closedAt ?? b.createdAt ?? 0) - Date.parse(a.closedAt ?? a.createdAt ?? 0))
    .slice(0, Math.max(2, Math.floor(windowSize)) * 2);

  const summarize = (sample) => {
    const pnls = sample.map((trade) => finiteNumber(trade.netPnl ?? trade.pnl) ?? 0);
    const roes = sample.map((trade) => finiteNumber(trade.netRoe ?? trade.roe) ?? 0);
    const grossProfit = pnls.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(pnls.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
    return {
      count: sample.length,
      pnl: Number(pnls.reduce((sum, value) => sum + value, 0).toFixed(4)),
      avgRoe: sample.length
        ? Number((roes.reduce((sum, value) => sum + value, 0) / sample.length).toFixed(2))
        : null,
      profitFactor: grossLoss > 0
        ? Number((grossProfit / grossLoss).toFixed(2))
        : (grossProfit > 0 ? 99 : null),
    };
  };

  const size = Math.max(2, Math.floor(windowSize));
  const recent = summarize(rows.slice(0, size));
  const previous = summarize(rows.slice(size, size * 2));
  const bad = (stats) => stats.count >= Math.max(2, Math.floor(minWindowSize))
    && ((stats.profitFactor != null && stats.profitFactor < 0.7)
      || (stats.avgRoe != null && stats.avgRoe < -2));

  return {
    variant: variant || 'NO_VARIANT',
    side: side || 'NO_SIDE',
    recent,
    previous,
    active: bad(recent) && bad(previous),
  };
}

export function evaluateShakeoutStage2({
  layer1Tier,
  setup,
  shakeoutCombo,
  signalType,
  subtype,
  variant,
  side,
  signalAt,
  fillAt,
  signalBtcMarketRegime,
  entryBtcMarketRegime,
  signalBtcCandle,
  entryBtcCandle,
  duplicateActiveCount = 0,
  duplicateActiveMarginUsdt = 0,
  rollingDrift = null,
  auditFlags = null,
} = {}) {
  const environmentTier = normalize(layer1Tier);
  const normalizedSetup = setupOf({ setup, shakeoutCombo, signalType, subtype });
  const normalizedVariant = normalize(variant);
  const normalizedSide = normalize(side);
  const signalRegime = normalize(signalBtcMarketRegime);
  const entryRegime = normalize(entryBtcMarketRegime);
  const signalBias = shakeoutCandleBias(signalBtcCandle);
  const entryBias = shakeoutCandleBias(entryBtcCandle);
  const signalMs = Date.parse(signalAt ?? '');
  const fillMs = Date.parse(fillAt ?? '');
  const fillDelayMinutes = Number.isFinite(signalMs) && Number.isFinite(fillMs)
    ? Math.max(0, (fillMs - signalMs) / 60_000)
    : null;
  const calculatedFlags = [];

  if (Number(duplicateActiveCount) > 0) calculatedFlags.push('DUPLICATE_ACTIVE');

  const candleConflict = (normalizedSide === 'LONG' && entryBias === 'BEARISH')
    || (normalizedSide === 'SHORT' && entryBias === 'BULLISH');
  if (candleConflict) calculatedFlags.push('BTC_CANDLE_CONFLICT');

  const regimeChanged = Boolean(signalRegime && entryRegime
    && signalRegime !== 'NO_DATA' && entryRegime !== 'NO_DATA'
    && signalRegime !== entryRegime);
  const candleChanged = Boolean(signalBias !== 'NO_DATA' && entryBias !== 'NO_DATA'
    && signalBias !== entryBias);
  if (normalizedVariant === 'PENDING'
      && fillDelayMinutes != null
      && fillDelayMinutes >= 15
      && (regimeChanged || candleChanged)) {
    calculatedFlags.push('STALE_FILL');
  }

  if (rollingDrift?.active) calculatedFlags.push('DRIFT_RISK');
  const flags = Array.isArray(auditFlags)
    ? [...new Set(auditFlags.map(normalize).filter(Boolean))]
    : calculatedFlags;
  const fillQuality = fillQualityOf(
    normalizedVariant,
    fillDelayMinutes,
    Number.isFinite(fillMs) ? fillAt : null,
  );

  // Layer 1 owns the environment decision. Layer 2 may only modify that result
  // from setup + execution variant + fill quality. Audit flags never vote.
  let tier = 'WATCH';
  let modifier = 'HOLD';
  let code = 'S2_ENV_WATCH_HOLD';

  if (environmentTier === 'RISK') {
    tier = 'RISK';
    modifier = 'KEEP_RISK';
    code = 'S2_ENV_RISK';
  } else if (environmentTier === 'GOOD') {
    if (['FALSE_RECLAIM', 'CLEAN_REJECT'].includes(normalizedSetup)) {
      tier = 'RISK';
      modifier = 'DOWNGRADE';
      code = 'S2_GOOD_BAD_SETUP';
    } else if (normalizedSetup === 'WEAK_REJECT'
        && normalizedVariant === 'PENDING'
        && ['PENDING_FAST', 'PENDING_NORMAL'].includes(fillQuality)) {
      tier = 'WATCH_PLUS';
      modifier = 'UPGRADE';
      code = 'S2_GOOD_WEAK_REJECT_PENDING';
    } else if (normalizedVariant === 'PENDING'
        && ['PENDING_FAST', 'PENDING_NORMAL'].includes(fillQuality)) {
      tier = 'WATCH_PLUS';
      modifier = 'UPGRADE';
      code = 'S2_GOOD_PENDING_FILL';
    } else {
      tier = 'WATCH';
      modifier = 'HOLD';
      code = fillQuality === 'PENDING_LATE'
        ? 'S2_GOOD_PENDING_LATE_HOLD'
        : 'S2_GOOD_NEUTRAL_EXECUTION';
    }
  } else if (environmentTier === 'WATCH') {
    if ((normalizedVariant === 'PENDING' && fillQuality !== 'PENDING_WAIT')
        || normalizedSetup === 'WEAK_RECLAIM') {
      tier = 'RISK';
      modifier = 'DOWNGRADE';
      code = normalizedVariant === 'PENDING' && fillQuality !== 'PENDING_WAIT'
        ? 'S2_WATCH_PENDING'
        : 'S2_WATCH_WEAK_RECLAIM';
    }
  } else {
    code = 'S2_NO_LAYER1_DATA';
  }

  const label = tier === 'WATCH_PLUS'
    ? 'WATCH+'
    : tier;
  const reasons = [
    `L1=${environmentTier || 'NO_DATA'}`,
    `setup=${normalizedSetup}`,
    `variant=${normalizedVariant || 'NO_VARIANT'}`,
    `fill=${fillQuality}`,
    `modifier=${modifier}`,
  ];
  if (flags.includes('DUPLICATE_ACTIVE')) {
    reasons.push(`audit duplicate=${Number(duplicateActiveCount)} ($${Number(duplicateActiveMarginUsdt || 0).toFixed(2)})`);
  }
  if (flags.includes('BTC_CANDLE_CONFLICT')) {
    reasons.push(`audit candle conflict=${normalizedSide}/${entryBias}`);
  }
  if (flags.includes('STALE_FILL')) {
    reasons.push(`audit stale=${fillDelayMinutes.toFixed(0)}m BTC ${signalRegime || '-'}→${entryRegime || '-'}`);
  }
  if (flags.includes('DRIFT_RISK')) {
    reasons.push(`audit drift PF=${rollingDrift?.recent?.profitFactor ?? '-'} / ${rollingDrift?.previous?.profitFactor ?? '-'}`);
  }

  return {
    version: SHAKEOUT_STAGE_2_VERSION,
    tier,
    label,
    code,
    modifier,
    layer1Tier: environmentTier || 'NO_DATA',
    setup: normalizedSetup,
    variant: normalizedVariant || 'NO_VARIANT',
    fillQuality,
    flags,
    reason: reasons.join('; '),
    evaluatedAt: new Date(Number.isFinite(fillMs) ? fillMs : Date.now()).toISOString(),
    fillDelayMinutes: fillDelayMinutes == null ? null : Number(fillDelayMinutes.toFixed(2)),
    signalBtcMarketRegime: signalRegime || null,
    entryBtcMarketRegime: entryRegime || null,
    signalBtcCandleBias: signalBias,
    entryBtcCandleBias: entryBias,
    regimeChanged,
    candleChanged,
    duplicateActiveCount: Number(duplicateActiveCount) || 0,
    duplicateActiveMarginUsdt: Number(duplicateActiveMarginUsdt) || 0,
    rollingDrift: rollingDrift ?? null,
    auditOnlyFlags: true,
    analysisOnly: true,
  };
}
