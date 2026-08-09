export const LIQUID_EDGE_ACTIVE_POINT_VERSION = 'LIQUID_EDGE_ACTIVE_POINT_V1_20260730';

const GOOD_STATES = new Set([
  'SHORT_NEUTRAL',
  'SHORT_BUILDUP',
  'SHORT_IMPULSE',
]);

const WATCH_STATES = new Set([
  'BTC_CRASH_RECLAIM',
  'SHORT_PEAK',
  'SHORT_RELOAD',
]);

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resultFields({ eligible, tier, waveState, pointState, reason }) {
  const longScore = finiteOrNull(pointState?.pointLongScore);
  const shortScore = finiteOrNull(pointState?.pointShortScore);
  return {
    liquidEdgeActivePointEligible: eligible,
    liquidEdgeActivePointTier: tier,
    liquidEdgeActivePointCode: tier === 'UNRATED' ? 'EA_POINT_UNRATED' : `EA_POINT_${tier}`,
    liquidEdgeActivePointLabel: tier === 'UNRATED' ? null : `EA POINT ${tier.replaceAll('_', ' ')}`,
    liquidEdgeActivePointReason: reason,
    liquidEdgeActivePointWaveState: waveState,
    liquidEdgeActivePointLongScore: longScore,
    liquidEdgeActivePointShortScore: shortScore,
    liquidEdgeActivePointGap: longScore == null || shortScore == null ? null : shortScore - longScore,
    liquidEdgeActivePointShortSlope: finiteOrNull(pointState?.shortEdgeShortScoreSlope),
    liquidEdgeActivePointLongSlope: finiteOrNull(pointState?.shortEdgeLongScoreSlope),
    liquidEdgeActivePointDropFromPeak: finiteOrNull(pointState?.shortEdgeShortScoreDropFromPeak),
    liquidEdgeActivePointBtcRet15m: finiteOrNull(pointState?.shortEdgeBtcRet15m),
    liquidEdgeActivePointBasis: 'MARKET_DIRECTION_SIGNAL_LOG',
    liquidEdgeActivePointVersion: LIQUID_EDGE_ACTIVE_POINT_VERSION,
    liquidEdgeActivePointObservationOnly: true,
    liquidEdgeActivePointAffectsEntry: false,
    liquidEdgeActivePointAffectsMargin: false,
    liquidEdgeActivePointAffectsSl: false,
    liquidEdgeActivePointAffectsTp: false,
  };
}

/**
 * Independent observation label for SHORT · GOOD+ × EDGE ACTIVE.
 * It enriches the API response only and never changes or writes a paper trade.
 */
export function evaluateLiquidEdgeActivePointLabel(trade = {}, pointState = null) {
  const side = String(trade.side ?? '').toUpperCase();
  const stage3 = String(trade.liquidStage3Tier ?? '').toUpperCase();
  const stage4 = String(trade.liquidStage4Tier ?? '').toUpperCase();
  const eligible = side === 'SHORT' && stage3 === 'GOOD_PLUS' && stage4 === 'ACTIVE';
  const waveState = String(pointState?.shortEdgeWaveState ?? '').toUpperCase() || null;

  if (!eligible) {
    return resultFields({
      eligible: false,
      tier: 'UNRATED',
      waveState,
      pointState,
      reason: 'Chỉ chấm riêng SHORT · GOOD+ × EDGE ACTIVE; tín hiệu này nằm ngoài cohort.',
    });
  }

  if (GOOD_STATES.has(waveState)) {
    return resultFields({
      eligible: true,
      tier: 'GOOD',
      waveState,
      pointState,
      reason: `${waveState}: nhóm point đang có hiệu quả quan sát tốt hơn trong cohort; không phải điều kiện vào lệnh.`,
    });
  }

  if (waveState === 'SHORT_FADE') {
    return resultFields({
      eligible: true,
      tier: 'RISK',
      waveState,
      pointState,
      reason: 'SHORT_FADE: lực SHORT đã giảm từ đỉnh; cohort quan sát kém hơn, chỉ gắn nhãn rủi ro.',
    });
  }

  if (WATCH_STATES.has(waveState)) {
    return resultFields({
      eligible: true,
      tier: 'WATCH',
      waveState,
      pointState,
      reason: `${waveState}: trạng thái chuyển pha hoặc mẫu còn ít; tiếp tục thống kê độc lập.`,
    });
  }

  return resultFields({
    eligible: true,
    tier: 'NO_DATA',
    waveState,
    pointState,
    reason: 'Không có snapshot point hợp lệ trước entry để chấm cohort này.',
  });
}
