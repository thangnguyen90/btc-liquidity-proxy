export const LIQUID_LONG_POINT_PHASE_VERSION =
  'LIQUID_LONG_POINT_PHASE_V1_20260730';

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function upper(value) {
  return String(value ?? '').trim().toUpperCase();
}

function isLongMechanismTrade(trade = {}) {
  return upper(trade.side) === 'LONG' && [
    trade.liquidLongCapitulationMatched,
    trade.liquidLongControlledSellMatched,
    trade.liquidLongDecoupledReboundMatched,
    trade.liquidLongBtcAbsorptionMatched,
  ].some((matched) => matched === true);
}

function resultFields({ eligible, tier, reason, pointState = {} }) {
  const longScore = finiteOrNull(pointState.pointLongScore);
  const shortScore = finiteOrNull(pointState.pointShortScore);
  const gap = longScore == null || shortScore == null ? null : longScore - shortScore;
  const labels = {
    SHORT_PRESSURE: 'LM · SHORT PRESSURE',
    SHORT_FADE: 'LM · SHORT FADE',
    BALANCED: 'LM · BALANCED',
    LONG_TAKEOVER: 'LM · LONG TAKEOVER',
    SHORT_RELOAD: 'LM · SHORT RELOAD',
    TRANSITION: 'LM · TRANSITION',
    NO_DATA: 'LM · NO DATA',
  };
  return {
    liquidLongPointPhaseEligible: eligible,
    liquidLongPointPhaseTier: tier,
    liquidLongPointPhaseCode: tier === 'UNRATED' ? 'LM_POINT_UNRATED' : `LM_POINT_${tier}`,
    liquidLongPointPhaseLabel: labels[tier] ?? null,
    liquidLongPointPhaseReason: reason,
    liquidLongPointPhaseLongScore: longScore,
    liquidLongPointPhaseShortScore: shortScore,
    liquidLongPointPhaseGap: gap,
    liquidLongPointPhaseDominance: gap == null
      ? null
      : gap >= 10
        ? 'LONG'
        : gap <= -10
          ? 'SHORT'
          : 'BALANCED',
    liquidLongPointPhaseLongSlope: finiteOrNull(pointState.shortEdgeLongScoreSlope),
    liquidLongPointPhaseShortSlope: finiteOrNull(pointState.shortEdgeShortScoreSlope),
    liquidLongPointPhaseShortDropFromPeak: finiteOrNull(pointState.shortEdgeShortScoreDropFromPeak),
    liquidLongPointPhaseWaveState: upper(pointState.shortEdgeWaveState) || null,
    liquidLongPointPhaseDominantSamples: Math.max(0, Number(pointState.pointDominantSamples ?? 0) || 0),
    liquidLongPointPhaseCrossConfirmed: pointState.pointCrossConfirmed === true,
    liquidLongPointPhaseShortDecayActive: pointState.shortEdgeDecayActive === true,
    liquidLongPointPhaseBasis: 'MARKET_DIRECTION_SIGNAL_LOG',
    liquidLongPointPhaseVersion: LIQUID_LONG_POINT_PHASE_VERSION,
    liquidLongPointPhaseObservationOnly: true,
    liquidLongPointPhaseAffectsEntry: false,
    liquidLongPointPhaseAffectsMargin: false,
    liquidLongPointPhaseAffectsSl: false,
    liquidLongPointPhaseAffectsTp: false,
  };
}

export function evaluateLiquidLongPointPhase(trade = {}, pointState = null) {
  const eligible = isLongMechanismTrade(trade);
  if (!eligible) {
    return resultFields({
      eligible: false,
      tier: 'UNRATED',
      reason: 'Chỉ chấm cho lệnh LONG khớp ít nhất một Independent Mechanism.',
      pointState: pointState ?? {},
    });
  }

  const state = pointState ?? {};
  const longScore = finiteOrNull(state.pointLongScore);
  const shortScore = finiteOrNull(state.pointShortScore);
  if (longScore == null || shortScore == null) {
    return resultFields({
      eligible: true,
      tier: 'NO_DATA',
      reason: 'Thiếu LONG/SHORT Market Score causal trước entry.',
      pointState: state,
    });
  }

  const gap = longScore - shortScore;
  const longSlope = finiteOrNull(state.shortEdgeLongScoreSlope);
  const shortSlope = finiteOrNull(state.shortEdgeShortScoreSlope);
  const dropFromPeak = finiteOrNull(state.shortEdgeShortScoreDropFromPeak);
  const waveState = upper(state.shortEdgeWaveState);
  const dominantSamples = Math.max(0, Number(state.pointDominantSamples ?? 0) || 0);
  const longTakeoverConfirmed = gap >= 10 && (
    state.pointCrossConfirmed === true
    || dominantSamples >= 2
    || (longSlope != null && shortSlope != null && longSlope > 0 && shortSlope <= 0)
  );
  const shortReload = waveState === 'SHORT_RELOAD' || (
    shortSlope != null
    && longSlope != null
    && shortSlope > 0
    && longSlope < 0
    && dropFromPeak != null
    && dropFromPeak >= 5
  );
  const shortFade = ['SHORT_FADE', 'BTC_CRASH_RECLAIM'].includes(waveState)
    || state.shortEdgeDecayActive === true
    || (
      shortSlope != null
      && longSlope != null
      && shortSlope < 0
      && longSlope > 0
      && dropFromPeak != null
      && dropFromPeak >= 10
    );
  const shortPressure = shortScore >= 40
    && gap <= -10
    && (
      shortSlope == null
      || shortSlope >= 0
      || ['SHORT_BUILDUP', 'SHORT_IMPULSE', 'SHORT_PEAK'].includes(waveState)
    );
  const balanced = Math.abs(gap) < 10 && longScore < 40 && shortScore < 40;

  let tier = 'TRANSITION';
  let reason = `Điểm chưa tạo pha xác nhận: LONG ${longScore.toFixed(0)} · SHORT ${shortScore.toFixed(0)} · gap ${gap >= 0 ? '+' : ''}${gap.toFixed(0)}.`;
  if (shortReload) {
    tier = 'SHORT_RELOAD';
    reason = `SHORT đang nạp lại sau nhịp giảm: LONG ${longScore.toFixed(0)} · SHORT ${shortScore.toFixed(0)}.`;
  } else if (shortFade) {
    tier = 'SHORT_FADE';
    reason = `SHORT giảm từ đỉnh/đang decay trong khi LONG bắt đầu hồi: LONG ${longScore.toFixed(0)} · SHORT ${shortScore.toFixed(0)}.`;
  } else if (shortPressure) {
    tier = 'SHORT_PRESSURE';
    reason = `SHORT ≥40, dẫn LONG ít nhất 10 điểm và chưa suy yếu: LONG ${longScore.toFixed(0)} · SHORT ${shortScore.toFixed(0)}.`;
  } else if (longTakeoverConfirmed) {
    tier = 'LONG_TAKEOVER';
    reason = `LONG dẫn ít nhất 10 điểm và takeover đã được xác nhận: LONG ${longScore.toFixed(0)} · SHORT ${shortScore.toFixed(0)}.`;
  } else if (balanced) {
    tier = 'BALANCED';
    reason = `Hai điểm dưới 40 và lệch dưới 10: LONG ${longScore.toFixed(0)} · SHORT ${shortScore.toFixed(0)}.`;
  }

  return resultFields({ eligible: true, tier, reason, pointState: state });
}
