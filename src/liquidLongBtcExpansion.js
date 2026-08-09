export const LIQUID_LONG_BTC_EXPANSION_VERSION =
  'LIQUID_LONG_BTC_EXPANSION_V2_20260808';

function normalized(value) {
  return String(value ?? '').trim().toUpperCase();
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function snapshotOf(trade = {}) {
  const targetKind = normalized(
    trade.liquidStage2TargetKind
      ?? trade.entryPlan?.targetKind
      ?? trade.liquidRunner30TargetKind,
  );
  return {
    side: normalized(trade.side),
    btcPhase: normalized(trade.liquidEvalBtcPhase),
    stage3Tier: normalized(trade.liquidStage3Tier),
    targetKind,
    btcCandlePattern: normalized(
      trade.btcCandlePatternAtEntry?.name
        ?? trade.liquidBtcWaveBtcCandlePattern,
    ),
    marketPointTier: normalized(trade.liquidMarketPointPhaseTier),
    marketPointRelation: normalized(trade.liquidMarketPointPhaseTradeRelation),
    signalPoint: finiteOrNull(trade.signalPoint ?? trade.entryPlan?.signalPoint),
    oneSidedPct: finiteOrNull(trade.entryPlan?.killZoneCluster?.oneSidedPct),
  };
}

/**
 * Observe-only LONG expansion cohort discovered in the 2026-07-26..2026-08-08
 * Liquid paper review. Every input is captured before entry. Classification is
 * additive metadata only and never changes entry, size, SL, TP or Binance.
 */
export function evaluateLiquidLongBtcExpansion(trade = {}) {
  const snapshot = snapshotOf(trade);
  const missingFields = [
    !snapshot.side ? 'side' : '',
    !snapshot.btcPhase ? 'liquidEvalBtcPhase' : '',
    !snapshot.stage3Tier ? 'liquidStage3Tier' : '',
    !snapshot.targetKind ? 'liquidStage2TargetKind' : '',
  ].filter(Boolean);
  const matched = missingFields.length === 0
    && snapshot.side === 'LONG'
    && snapshot.btcPhase === 'BTC_UP_STRONG'
    && snapshot.stage3Tier === 'RISK'
    && snapshot.targetKind !== 'MAIN_ZONE';
  const btcCandleConfirmed = matched
    && snapshot.btcCandlePattern === 'BULLISH_MARUBOZU';
  const pointAligned = matched
    && snapshot.marketPointTier === 'LONG_DOMINANT'
    && snapshot.marketPointRelation === 'ALIGNED';
  const farRunner = matched && snapshot.targetKind === 'FAR_ZONE';
  const selected = matched
    && snapshot.signalPoint != null
    && snapshot.signalPoint >= 70
    && snapshot.signalPoint < 90;
  const primeTest = selected && snapshot.signalPoint < 80;
  const oneSidedConfirmed = matched
    && snapshot.oneSidedPct != null
    && snapshot.oneSidedPct >= 90;
  const confirmations = [
    btcCandleConfirmed ? 'BTC_CANDLE_CONFIRMED' : '',
    pointAligned ? 'POINT_ALIGNED' : '',
    farRunner ? 'FAR_RUNNER' : '',
    oneSidedConfirmed ? 'ONE_SIDED_90_CONFIRMED' : '',
  ].filter(Boolean);

  let reason = 'Outside LONG + BTC_UP_STRONG + Stage 3 RISK + non-MAIN_ZONE cohort.';
  if (missingFields.length) {
    reason = `Entry snapshot missing: ${missingFields.join(', ')}.`;
  } else if (matched) {
    reason = [
      'LONG + BTC_UP_STRONG + Stage 3 RISK + target outside MAIN_ZONE',
      primeTest
        ? `EXPANSION PRIME TEST at signalPoint ${snapshot.signalPoint.toFixed(1)}`
        : selected
          ? `EXPANSION SELECTED at signalPoint ${snapshot.signalPoint.toFixed(1)}`
          : snapshot.signalPoint == null
            ? 'no signalPoint snapshot for nested layer'
            : `outside selected signalPoint band at ${snapshot.signalPoint.toFixed(1)}`,
      confirmations.length ? `confirmations ${confirmations.join(' + ')}` : 'no optional confirmation badge',
      'OBSERVE ONLY',
    ].join('; ');
  }

  return {
    liquidLongBtcExpansionEligible: snapshot.side === 'LONG' && missingFields.length === 0,
    liquidLongBtcExpansionMatched: matched,
    liquidLongBtcExpansionTier: matched ? 'CANDIDATE' : 'UNRATED',
    liquidLongBtcExpansionCode: matched
      ? 'LONG_BTC_EXPANSION_CANDIDATE'
      : 'LONG_BTC_EXPANSION_UNRATED',
    liquidLongBtcExpansionLabel: matched
      ? 'LIQ LONG · BTC EXPANSION CANDIDATE'
      : null,
    liquidLongBtcExpansionReason: reason,
    liquidLongBtcExpansionBtcPhase: snapshot.btcPhase || null,
    liquidLongBtcExpansionStage3Tier: snapshot.stage3Tier || null,
    liquidLongBtcExpansionTargetKind: snapshot.targetKind || null,
    liquidLongBtcExpansionBtcCandlePattern: snapshot.btcCandlePattern || null,
    liquidLongBtcExpansionMarketPointTier: snapshot.marketPointTier || null,
    liquidLongBtcExpansionMarketPointRelation: snapshot.marketPointRelation || null,
    liquidLongBtcExpansionSignalPoint: snapshot.signalPoint,
    liquidLongBtcExpansionOneSidedPct: snapshot.oneSidedPct,
    liquidLongBtcExpansionBtcCandleConfirmed: btcCandleConfirmed,
    liquidLongBtcExpansionPointAligned: pointAligned,
    liquidLongBtcExpansionFarRunner: farRunner,
    liquidLongBtcExpansionOneSidedConfirmed: oneSidedConfirmed,
    liquidLongBtcExpansionSelected: selected,
    liquidLongBtcExpansionSelectedCode: selected
      ? 'LONG_BTC_EXPANSION_SELECTED'
      : 'LONG_BTC_EXPANSION_SELECTED_UNRATED',
    liquidLongBtcExpansionSelectedLabel: selected
      ? 'LIQ LONG · EXPANSION SELECTED'
      : null,
    liquidLongBtcExpansionPrimeTest: primeTest,
    liquidLongBtcExpansionPrimeTestCode: primeTest
      ? 'LONG_BTC_EXPANSION_PRIME_TEST'
      : 'LONG_BTC_EXPANSION_PRIME_TEST_UNRATED',
    liquidLongBtcExpansionPrimeTestLabel: primeTest
      ? 'LIQ LONG · EXPANSION PRIME TEST'
      : null,
    liquidLongBtcExpansionLayerTier: primeTest
      ? 'PRIME_TEST'
      : selected
        ? 'SELECTED'
        : matched
          ? 'CANDIDATE'
          : 'UNRATED',
    liquidLongBtcExpansionConfirmations: confirmations,
    liquidLongBtcExpansionMissingFields: missingFields,
    liquidLongBtcExpansionBasis: 'ENTRY_SNAPSHOT',
    liquidLongBtcExpansionVersion: LIQUID_LONG_BTC_EXPANSION_VERSION,
    liquidLongBtcExpansionObservationOnly: true,
    liquidLongBtcExpansionAffectsEntry: false,
    liquidLongBtcExpansionAffectsMargin: false,
    liquidLongBtcExpansionAffectsSl: false,
    liquidLongBtcExpansionAffectsTp: false,
    liquidLongBtcExpansionAffectsBinance: false,
  };
}
