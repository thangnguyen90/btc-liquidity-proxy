export const LIQUID_MARKET_POINT_PHASE_VERSION =
  'LIQUID_MARKET_POINT_PHASE_V1_20260730';

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function upper(value) {
  return String(value ?? '').trim().toUpperCase();
}

function phaseLabel(tier) {
  return {
    CROSS_TO_LONG: 'POINT CROSS · SHORT → LONG',
    POST_CROSS_TO_LONG_30M: 'POINT POST CROSS → LONG · ≤30M',
    LONG_DOMINANT: 'POINT LONG DOMINANT',
    CROSS_TO_SHORT: 'POINT CROSS · LONG → SHORT',
    POST_CROSS_TO_SHORT_30M: 'POINT POST CROSS → SHORT · ≤30M',
    SHORT_DOMINANT: 'POINT SHORT DOMINANT',
    POINT_TIE: 'POINT TIE',
    OUTSIDE_DISPERSION: 'POINT · OUTSIDE DISPERSION',
    NO_DATA: 'POINT · NO DATA',
  }[tier] ?? null;
}

function phaseDirection(tier) {
  if (['CROSS_TO_LONG', 'POST_CROSS_TO_LONG_30M', 'LONG_DOMINANT'].includes(tier)) return 'LONG';
  if (['CROSS_TO_SHORT', 'POST_CROSS_TO_SHORT_30M', 'SHORT_DOMINANT'].includes(tier)) return 'SHORT';
  return 'NEUTRAL';
}

export function advanceLiquidMarketPointState(previousState = null, snapshot = {}) {
  const longScore = finiteOrNull(snapshot.longScore);
  const shortScore = finiteOrNull(snapshot.shortScore);
  const evaluatedAt = finiteOrNull(snapshot.evaluatedAt);
  const sampleKey = String(snapshot.sampleKey ?? '');
  if (longScore == null || shortScore == null || evaluatedAt == null) {
    return previousState;
  }
  if (sampleKey && sampleKey === String(previousState?.lastSampleKey ?? '')) {
    return previousState;
  }

  const pointDominance = longScore > shortScore
    ? 'LONG'
    : shortScore > longScore
      ? 'SHORT'
      : 'TIE';
  let previousDominance = upper(previousState?.previousDominance) || null;
  let dominantSamples = Math.max(0, Number(previousState?.pointDominantSamples ?? 0) || 0);
  let crossFrom = upper(previousState?.pointCrossFrom) || null;
  let crossTo = upper(previousState?.pointCrossTo) || null;
  let crossAt = finiteOrNull(previousState?.pointCrossAt);

  if (pointDominance !== 'TIE') {
    if (previousDominance && pointDominance !== previousDominance) {
      crossFrom = previousDominance;
      crossTo = pointDominance;
      crossAt = evaluatedAt;
      dominantSamples = 1;
    } else if (pointDominance === previousDominance) {
      dominantSamples += 1;
    } else {
      dominantSamples = 1;
    }
    previousDominance = pointDominance;
  }

  return {
    lastSampleKey: sampleKey || String(evaluatedAt),
    previousDominance,
    pointSampleKey: sampleKey || String(evaluatedAt),
    pointEvaluatedAt: evaluatedAt,
    pointLongScore: longScore,
    pointShortScore: shortScore,
    pointMarketLabel: upper(snapshot.marketLabel) || null,
    pointDominance,
    pointGap: Math.abs(longScore - shortScore),
    pointCrossFrom: crossFrom,
    pointCrossTo: crossTo,
    pointCrossAt: crossAt,
    pointCrossAgeMinutes: crossAt == null
      ? null
      : Math.max(0, (evaluatedAt - crossAt) / 60_000),
    pointDominantSamples: dominantSamples,
    pointCrossConfirmed: Boolean(
      crossAt != null
      && pointDominance === crossTo
      && dominantSamples >= 2
      && Math.abs(longScore - shortScore) >= 5
    ),
    pointCrossFresh: Boolean(crossAt != null && evaluatedAt - crossAt <= 60 * 60_000),
  };
}

function resultFields({
  eligible,
  tier,
  reason,
  pointState = {},
  basis = 'MARKET_DIRECTION_SIGNAL_LOG',
}) {
  const longScore = finiteOrNull(pointState.pointLongScore);
  const shortScore = finiteOrNull(pointState.pointShortScore);
  const crossAgeMinutes = finiteOrNull(pointState.pointCrossAgeMinutes);
  const direction = phaseDirection(tier);
  return {
    liquidMarketPointPhaseEligible: eligible,
    liquidMarketPointPhaseTier: tier,
    liquidMarketPointPhaseCode: `LIQ_POINT_PHASE_${tier}`,
    liquidMarketPointPhaseLabel: phaseLabel(tier),
    liquidMarketPointPhaseReason: reason,
    liquidMarketPointPhaseMarketLabel: upper(pointState.pointMarketLabel) || null,
    liquidMarketPointPhaseDirection: direction,
    liquidMarketPointPhaseTradeRelation: direction === 'NEUTRAL'
      ? 'NEUTRAL'
      : upper(pointState.tradeSide) === direction
        ? 'ALIGNED'
        : 'COUNTER',
    liquidMarketPointPhaseLongScore: longScore,
    liquidMarketPointPhaseShortScore: shortScore,
    liquidMarketPointPhaseGap: longScore == null || shortScore == null
      ? null
      : longScore - shortScore,
    liquidMarketPointPhaseDominance: upper(pointState.pointDominance) || null,
    liquidMarketPointPhaseCrossFrom: upper(pointState.pointCrossFrom) || null,
    liquidMarketPointPhaseCrossTo: upper(pointState.pointCrossTo) || null,
    liquidMarketPointPhaseCrossAt: finiteOrNull(pointState.pointCrossAt),
    liquidMarketPointPhaseCrossAgeMinutes: crossAgeMinutes,
    liquidMarketPointPhaseDominantSamples: Math.max(
      0,
      Number(pointState.pointDominantSamples ?? 0) || 0,
    ),
    liquidMarketPointPhaseBasis: basis,
    liquidMarketPointPhaseVersion: LIQUID_MARKET_POINT_PHASE_VERSION,
    liquidMarketPointPhaseObservationOnly: true,
    liquidMarketPointPhaseAffectsEntry: false,
    liquidMarketPointPhaseAffectsMargin: false,
    liquidMarketPointPhaseAffectsSl: false,
    liquidMarketPointPhaseAffectsTp: false,
  };
}

export function evaluateLiquidMarketPointPhase(trade = {}, pointState = null, {
  basis = 'MARKET_DIRECTION_SIGNAL_LOG',
} = {}) {
  const state = {
    ...(pointState ?? {}),
    tradeSide: trade.side,
  };
  const longScore = finiteOrNull(state.pointLongScore);
  const shortScore = finiteOrNull(state.pointShortScore);
  const dominance = upper(state.pointDominance);
  const marketLabel = upper(state.pointMarketLabel);

  if (longScore == null || shortScore == null || !dominance) {
    return resultFields({
      eligible: false,
      tier: 'NO_DATA',
      reason: 'Thiếu snapshot LONG/SHORT point causal trước entry.',
      pointState: state,
      basis,
    });
  }

  if (marketLabel !== 'MARKET_DISPERSION') {
    return resultFields({
      eligible: false,
      tier: 'OUTSIDE_DISPERSION',
      reason: `Snapshot tại entry là ${marketLabel || 'NO DATA'}, không thuộc MARKET DISPERSION.`,
      pointState: state,
      basis,
    });
  }

  if (dominance === 'TIE') {
    return resultFields({
      eligible: true,
      tier: 'POINT_TIE',
      reason: `LONG ${longScore.toFixed(0)} bằng SHORT ${shortScore.toFixed(0)} trong MARKET DISPERSION.`,
      pointState: state,
      basis,
    });
  }

  const crossFrom = upper(state.pointCrossFrom);
  const crossTo = upper(state.pointCrossTo);
  const crossAt = finiteOrNull(state.pointCrossAt);
  const evaluatedAt = finiteOrNull(state.pointEvaluatedAt);
  const crossAgeMinutes = finiteOrNull(state.pointCrossAgeMinutes);
  const exactCross = crossAt != null
    && evaluatedAt != null
    && Math.abs(crossAt - evaluatedAt) <= 1
    && crossTo === dominance
    && crossFrom
    && crossFrom !== crossTo;

  let tier;
  if (exactCross) {
    tier = dominance === 'LONG' ? 'CROSS_TO_LONG' : 'CROSS_TO_SHORT';
  } else if (
    crossTo === dominance
    && crossAgeMinutes != null
    && crossAgeMinutes >= 0
    && crossAgeMinutes <= 30
  ) {
    tier = dominance === 'LONG'
      ? 'POST_CROSS_TO_LONG_30M'
      : 'POST_CROSS_TO_SHORT_30M';
  } else {
    tier = dominance === 'LONG' ? 'LONG_DOMINANT' : 'SHORT_DOMINANT';
  }

  const ageText = crossAgeMinutes == null ? 'không có mốc cross gần' : `${crossAgeMinutes.toFixed(1)} phút sau cross`;
  return resultFields({
    eligible: true,
    tier,
    reason: `${phaseLabel(tier)}: LONG ${longScore.toFixed(0)} · SHORT ${shortScore.toFixed(0)} · ${ageText}.`,
    pointState: state,
    basis,
  });
}
