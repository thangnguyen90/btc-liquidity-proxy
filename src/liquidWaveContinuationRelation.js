export const LIQUID_WAVE_CONTINUATION_RELATION_VERSION =
  'LIQUID_WAVE_CONTINUATION_RELATION_V3_20260730';

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function marketSnapshotOf(record = {}) {
  const market = record.marketDirection && typeof record.marketDirection === 'object'
    ? record.marketDirection
    : {};
  const sampleKey = String(
    market.sampleKey
    ?? market.scoreDynamics?.sampleKey
    ?? '',
  );
  const evaluatedAt = finiteNumber(
    market.evaluatedAt
    ?? market.scoreDynamics?.evaluatedAt
    ?? Date.parse(record.loggedAt ?? ''),
  );
  const dynamics = market.scoreDynamics && typeof market.scoreDynamics === 'object'
    ? market.scoreDynamics
    : {};
  const longScore = finiteNumber(market.scores?.long ?? dynamics.longScore);
  const shortScore = finiteNumber(market.scores?.short ?? dynamics.shortScore);
  if (!sampleKey || evaluatedAt == null || longScore == null || shortScore == null) return null;
  const shortScoreSlope = finiteNumber(dynamics.shortScoreSlope);
  const longScoreSlope = finiteNumber(dynamics.longScoreSlope);
  const shortScoreDropFromPeak = finiteNumber(dynamics.shortScoreDropFromPeak);
  const shortWaveState = String(dynamics.shortWaveState ?? '').toUpperCase();
  const btcRet15m = finiteNumber(dynamics.btcRet15m ?? market.btc?.ret15m);
  const marketLabel = String(market.label ?? market.rawLabel ?? '').trim().toUpperCase();
  return {
    sampleKey,
    evaluatedAt,
    longScore,
    shortScore,
    shortScoreSlope,
    longScoreSlope,
    shortScoreDropFromPeak,
    shortWaveState,
    btcRet15m,
    marketLabel: marketLabel || null,
    edgeDataAvailable: Boolean(
      shortWaveState
      && shortScoreSlope != null
      && longScoreSlope != null
      && shortScoreDropFromPeak != null
      && btcRet15m != null
    ),
  };
}

function dominantSide(longScore, shortScore) {
  if (longScore > shortScore) return 'LONG';
  if (shortScore > longScore) return 'SHORT';
  return 'TIE';
}

export function advanceLiquidShortEdgeCycle(previousState = null, sample = {}) {
  const sampleKey = String(sample.sampleKey ?? '');
  const evaluatedAt = finiteNumber(sample.evaluatedAt) ?? Date.now();
  const longScore = finiteNumber(sample.longScore);
  const shortScore = finiteNumber(sample.shortScore);
  const shortScoreSlope = finiteNumber(sample.shortScoreSlope);
  const longScoreSlope = finiteNumber(sample.longScoreSlope);
  const shortScoreDropFromPeak = finiteNumber(sample.shortScoreDropFromPeak);
  const shortWaveState = String(sample.shortWaveState ?? '').toUpperCase();
  const btcRet15m = finiteNumber(sample.btcRet15m);
  const dataAvailable = sample.edgeDataAvailable === true || Boolean(
    longScore != null
    && shortScore != null
    && shortScoreSlope != null
    && longScoreSlope != null
    && shortScoreDropFromPeak != null
    && shortWaveState
    && btcRet15m != null
  );
  const prior = previousState && typeof previousState === 'object' ? previousState : {};
  if (
    sampleKey
    && String(prior.lastSampleKey ?? '') === sampleKey
    && !(prior.dataAvailable === false && dataAvailable)
  ) {
    return { ...prior, duplicateSample: true };
  }
  const declineSamples = shortScoreSlope != null && shortScoreSlope < 0
    ? Number(prior.declineSamples ?? 0) + 1
    : 0;
  let decayStart = prior.decayActive === true && prior.decayStart
    ? { ...prior.decayStart }
    : null;
  let intactStartAt = decayStart ? null : (finiteNumber(prior.intactStartAt) ?? null);
  let lastTransition = prior.lastTransition && typeof prior.lastTransition === 'object'
    ? { ...prior.lastTransition }
    : null;

  const recovery = Boolean(
    decayStart
    && (
      shortWaveState === 'SHORT_RELOAD'
      || (shortWaveState === 'SHORT_IMPULSE' && Number(shortScoreSlope) > 0)
      || (shortScore > longScore && Number(shortScoreSlope) >= 3)
    )
  );
  if (recovery) {
    decayStart = null;
    intactStartAt = evaluatedAt;
    lastTransition = {
      type: 'EDGE_DECAY_TO_RECOVERY',
      at: evaluatedAt,
    };
  }

  const decayTrigger = Boolean(
    dataAvailable
    && !decayStart
    && (
      Number(shortScoreDropFromPeak) >= 10
      || declineSamples >= 2
    )
    && Number(longScoreSlope) > 0
    && (
      Number(btcRet15m) > 0
      || shortWaveState === 'BTC_CRASH_RECLAIM'
    )
  );
  if (decayTrigger) {
    decayStart = {
      at: evaluatedAt,
      longScore,
      shortScore,
      shortScoreSlope,
      longScoreSlope,
      shortScoreDropFromPeak,
      shortWaveState,
      btcRet15m,
    };
    intactStartAt = null;
    lastTransition = {
      type: 'EDGE_INTACT_TO_DECAY',
      at: evaluatedAt,
    };
  } else if (!decayStart && intactStartAt == null && dataAvailable) {
    intactStartAt = evaluatedAt;
  }

  const decayActive = Boolean(decayStart);
  const phase = decayActive
    ? 'SHORT_EDGE_DECAY'
    : recovery
      ? 'SHORT_EDGE_RECOVERY'
      : dataAvailable
        ? 'SHORT_EDGE_INTACT'
        : 'SHORT_EDGE_NO_DATA';
  const phaseStartedAt = decayActive
    ? decayStart.at
    : finiteNumber(lastTransition?.at) ?? intactStartAt;
  return {
    phase,
    lastSampleKey: sampleKey || null,
    duplicateSample: false,
    phaseStartedAt,
    phaseAgeMinutes: phaseStartedAt == null
      ? null
      : Math.max(0, (evaluatedAt - phaseStartedAt) / 60_000),
    evaluatedAt,
    dataAvailable,
    declineSamples,
    decayActive,
    decayStart,
    intactStartAt,
    lastTransition,
    recoveryTriggered: recovery,
    decayTriggered: decayTrigger,
    longScore,
    shortScore,
    shortScoreSlope,
    longScoreSlope,
    shortScoreDropFromPeak,
    shortWaveState: shortWaveState || null,
    btcRet15m,
    observationOnly: true,
    affectsOrders: false,
  };
}

export function buildLiquidMarketPointCrossoverSnapshots(records = []) {
  const samplesByKey = new Map();
  for (const record of records) {
    const snapshot = marketSnapshotOf(record);
    if (!snapshot) continue;
    const previous = samplesByKey.get(snapshot.sampleKey);
    if (!previous || snapshot.evaluatedAt >= previous.evaluatedAt) {
      samplesByKey.set(snapshot.sampleKey, snapshot);
    }
  }

  const orderedSamples = [...samplesByKey.values()]
    .sort((a, b) => a.evaluatedAt - b.evaluatedAt);
  const stateBySampleKey = new Map();
  let previousDominant = null;
  let dominantSamples = 0;
  let lastCross = null;
  let shortSupportStartAt = null;
  let shortSupportSamples = 0;
  let shortBadStart = null;
  let shortBadSamples = 0;
  let shortEdgeCycleState = null;

  for (const sample of orderedSamples) {
    shortEdgeCycleState = advanceLiquidShortEdgeCycle(shortEdgeCycleState, sample);
    const shortDeclineSamples = shortEdgeCycleState.declineSamples;
    const shortEdgeDecay = shortEdgeCycleState.decayStart;
    const shortEdgeIntactStartAt = shortEdgeCycleState.intactStartAt;

    const pointDominance = dominantSide(sample.longScore, sample.shortScore);
    if (pointDominance !== 'TIE') {
      if (previousDominant && pointDominance !== previousDominant) {
        lastCross = {
          from: previousDominant,
          to: pointDominance,
          at: sample.evaluatedAt,
        };
        dominantSamples = 1;
      } else if (pointDominance === previousDominant) {
        dominantSamples += 1;
      } else {
        dominantSamples = 1;
      }

      if (pointDominance === 'SHORT') {
        if (previousDominant !== 'SHORT' || shortSupportStartAt == null) {
          shortSupportStartAt = sample.evaluatedAt;
          shortSupportSamples = 1;
        } else {
          shortSupportSamples += 1;
        }
        shortBadStart = null;
        shortBadSamples = 0;
      } else if (pointDominance === 'LONG') {
        if (previousDominant === 'SHORT') {
          shortBadStart = {
            at: sample.evaluatedAt,
            longScore: sample.longScore,
            shortScore: sample.shortScore,
          };
          shortBadSamples = 1;
        } else if (shortBadStart) {
          shortBadSamples += 1;
        }
        shortSupportStartAt = null;
        shortSupportSamples = 0;
      }
      previousDominant = pointDominance;
    }

    const pointGap = Math.abs(sample.longScore - sample.shortScore);
    const crossAgeMinutes = lastCross
      ? Math.max(0, (sample.evaluatedAt - lastCross.at) / 60_000)
      : null;
    const shortBadAgeMinutes = shortBadStart
      ? Math.max(0, (sample.evaluatedAt - shortBadStart.at) / 60_000)
      : null;
    const shortSupportAgeMinutes = shortSupportStartAt != null
      ? Math.max(0, (sample.evaluatedAt - shortSupportStartAt) / 60_000)
      : null;
    const shortEdgeDecayAgeMinutes = shortEdgeDecay
      ? Math.max(0, (sample.evaluatedAt - shortEdgeDecay.at) / 60_000)
      : null;
    const shortEdgeIntactAgeMinutes = shortEdgeIntactStartAt != null
      ? Math.max(0, (sample.evaluatedAt - shortEdgeIntactStartAt) / 60_000)
      : null;
    stateBySampleKey.set(sample.sampleKey, {
      pointSampleKey: sample.sampleKey,
      pointEvaluatedAt: sample.evaluatedAt,
      pointLongScore: sample.longScore,
      pointShortScore: sample.shortScore,
      pointMarketLabel: sample.marketLabel,
      pointDominance,
      pointGap,
      pointCrossFrom: lastCross?.from ?? null,
      pointCrossTo: lastCross?.to ?? null,
      pointCrossAt: lastCross?.at ?? null,
      pointCrossAgeMinutes: crossAgeMinutes,
      pointDominantSamples: dominantSamples,
      pointCrossConfirmed: Boolean(
        lastCross
        && pointDominance === lastCross.to
        && dominantSamples >= 2
        && pointGap >= 5,
      ),
      pointCrossFresh: Boolean(lastCross && crossAgeMinutes <= 60),
      shortContinuationSupported: pointDominance === 'SHORT',
      shortContinuationSupportStartAt: shortSupportStartAt,
      shortContinuationSupportAgeMinutes: shortSupportAgeMinutes,
      shortContinuationSupportSamples: shortSupportSamples,
      shortContinuationBadStartAt: shortBadStart?.at ?? null,
      shortContinuationBadStartLongScore: shortBadStart?.longScore ?? null,
      shortContinuationBadStartShortScore: shortBadStart?.shortScore ?? null,
      shortContinuationBadAgeMinutes: shortBadAgeMinutes,
      shortContinuationBadSamples: shortBadSamples,
      shortContinuationBadConfirmed: Boolean(
        pointDominance === 'LONG'
        && shortBadStart
        && shortBadSamples >= 2
        && sample.longScore - sample.shortScore >= 5,
      ),
      shortEdgeDataAvailable: sample.edgeDataAvailable,
      shortEdgePhase: shortEdgeCycleState.phase,
      shortEdgePhaseStartedAt: shortEdgeCycleState.phaseStartedAt,
      shortEdgePhaseAgeMinutes: shortEdgeCycleState.phaseAgeMinutes,
      shortEdgeLastTransitionType: shortEdgeCycleState.lastTransition?.type ?? null,
      shortEdgeLastTransitionAt: shortEdgeCycleState.lastTransition?.at ?? null,
      shortEdgeWaveState: sample.shortWaveState || null,
      shortEdgeShortScoreSlope: sample.shortScoreSlope,
      shortEdgeLongScoreSlope: sample.longScoreSlope,
      shortEdgeShortScoreDropFromPeak: sample.shortScoreDropFromPeak,
      shortEdgeBtcRet15m: sample.btcRet15m,
      shortEdgeDeclineSamples: shortDeclineSamples,
      shortEdgeDecayActive: Boolean(shortEdgeDecay),
      shortEdgeDecayStartAt: shortEdgeDecay?.at ?? null,
      shortEdgeDecayAgeMinutes,
      shortEdgeDecayStartLongScore: shortEdgeDecay?.longScore ?? null,
      shortEdgeDecayStartShortScore: shortEdgeDecay?.shortScore ?? null,
      shortEdgeDecayStartShortSlope: shortEdgeDecay?.shortScoreSlope ?? null,
      shortEdgeDecayStartLongSlope: shortEdgeDecay?.longScoreSlope ?? null,
      shortEdgeDecayStartDropFromPeak: shortEdgeDecay?.shortScoreDropFromPeak ?? null,
      shortEdgeDecayStartWaveState: shortEdgeDecay?.shortWaveState ?? null,
      shortEdgeDecayStartBtcRet15m: shortEdgeDecay?.btcRet15m ?? null,
      shortEdgeIntactStartAt,
      shortEdgeIntactAgeMinutes,
    });
  }

  const result = new Map();
  for (const record of records) {
    const tradeId = record?.tradeId == null ? '' : String(record.tradeId);
    const snapshot = marketSnapshotOf(record);
    const pointState = snapshot ? stateBySampleKey.get(snapshot.sampleKey) : null;
    if (tradeId && pointState) result.set(tradeId, { ...pointState });
  }
  return result;
}

export function evaluateLiquidWaveContinuationRelation(trade = {}, pointState = null) {
  const waveTier = String(trade.liquidBtcWaveTier ?? '').toUpperCase();
  const side = String(trade.side ?? '').toUpperCase();
  const pointDominance = String(pointState?.pointDominance ?? '').toUpperCase();
  const eligible = waveTier === 'CONTINUATION'
    && side === 'SHORT'
    && pointState?.shortEdgeDataAvailable === true;
  const tier = !eligible
    ? 'UNRATED'
    : pointState?.shortEdgeDecayActive === true
      ? 'SHORT_CONTINUATION_AFTER_EDGE_DECAY'
      : 'SHORT_CONTINUATION_EDGE_INTACT';
  const label = tier === 'SHORT_CONTINUATION_EDGE_INTACT'
    ? 'SHORT CONTINUATION · EDGE CHƯA DECAY'
    : tier === 'SHORT_CONTINUATION_AFTER_EDGE_DECAY'
      ? 'SHORT CONTINUATION · SAU EDGE DECAY'
      : null;
  const reason = !eligible
    ? 'Requires a SHORT signal with Stage 4B CONTINUATION and complete causal score-dynamics data.'
    : tier === 'SHORT_CONTINUATION_EDGE_INTACT'
      ? 'No confirmed causal SHORT edge-decay event exists before entry.'
      : 'Entry occurs after SHORT fell from its peak while LONG score rose and BTC began to reclaim.';

  return {
    liquidWaveContinuationEligible: eligible,
    liquidWaveContinuationTier: tier,
    liquidWaveContinuationLabel: label,
    liquidWaveContinuationReason: reason,
    liquidWaveContinuationPointDominance: pointDominance || null,
    liquidWaveContinuationLongScore: pointState?.pointLongScore ?? null,
    liquidWaveContinuationShortScore: pointState?.pointShortScore ?? null,
    liquidWaveContinuationPointGap: pointState?.pointGap ?? null,
    liquidWaveContinuationCrossFrom: pointState?.pointCrossFrom ?? null,
    liquidWaveContinuationCrossTo: pointState?.pointCrossTo ?? null,
    liquidWaveContinuationCrossAt: pointState?.pointCrossAt ?? null,
    liquidWaveContinuationCrossAgeMinutes: pointState?.pointCrossAgeMinutes ?? null,
    liquidWaveContinuationDominantSamples: pointState?.pointDominantSamples ?? 0,
    liquidWaveContinuationCrossConfirmed: pointState?.pointCrossConfirmed === true,
    liquidWaveContinuationCrossFresh: pointState?.pointCrossFresh === true,
    liquidWaveContinuationSupportStartAt: pointState?.shortContinuationSupportStartAt ?? null,
    liquidWaveContinuationSupportAgeMinutes: pointState?.shortContinuationSupportAgeMinutes ?? null,
    liquidWaveContinuationSupportSamples: pointState?.shortContinuationSupportSamples ?? 0,
    liquidWaveContinuationBadStartAt: pointState?.shortContinuationBadStartAt ?? null,
    liquidWaveContinuationBadStartLongScore: pointState?.shortContinuationBadStartLongScore ?? null,
    liquidWaveContinuationBadStartShortScore: pointState?.shortContinuationBadStartShortScore ?? null,
    liquidWaveContinuationBadAgeMinutes: pointState?.shortContinuationBadAgeMinutes ?? null,
    liquidWaveContinuationBadSamples: pointState?.shortContinuationBadSamples ?? 0,
    liquidWaveContinuationBadConfirmed: pointState?.shortContinuationBadConfirmed === true,
    liquidWaveContinuationEdgeWaveState: pointState?.shortEdgeWaveState ?? null,
    liquidWaveContinuationEdgeShortSlope: pointState?.shortEdgeShortScoreSlope ?? null,
    liquidWaveContinuationEdgeLongSlope: pointState?.shortEdgeLongScoreSlope ?? null,
    liquidWaveContinuationEdgeDropFromPeak: pointState?.shortEdgeShortScoreDropFromPeak ?? null,
    liquidWaveContinuationEdgeBtcRet15m: pointState?.shortEdgeBtcRet15m ?? null,
    liquidWaveContinuationEdgeDeclineSamples: pointState?.shortEdgeDeclineSamples ?? 0,
    liquidWaveContinuationEdgeDecayStartAt: pointState?.shortEdgeDecayStartAt ?? null,
    liquidWaveContinuationEdgeDecayAgeMinutes: pointState?.shortEdgeDecayAgeMinutes ?? null,
    liquidWaveContinuationEdgeDecayStartLongScore: pointState?.shortEdgeDecayStartLongScore ?? null,
    liquidWaveContinuationEdgeDecayStartShortScore: pointState?.shortEdgeDecayStartShortScore ?? null,
    liquidWaveContinuationEdgeDecayStartShortSlope: pointState?.shortEdgeDecayStartShortSlope ?? null,
    liquidWaveContinuationEdgeDecayStartLongSlope: pointState?.shortEdgeDecayStartLongSlope ?? null,
    liquidWaveContinuationEdgeDecayStartDropFromPeak: pointState?.shortEdgeDecayStartDropFromPeak ?? null,
    liquidWaveContinuationEdgeDecayStartWaveState: pointState?.shortEdgeDecayStartWaveState ?? null,
    liquidWaveContinuationEdgeDecayStartBtcRet15m: pointState?.shortEdgeDecayStartBtcRet15m ?? null,
    liquidWaveContinuationEdgeIntactStartAt: pointState?.shortEdgeIntactStartAt ?? null,
    liquidWaveContinuationEdgeIntactAgeMinutes: pointState?.shortEdgeIntactAgeMinutes ?? null,
    liquidWaveContinuationBasis: 'MARKET_DIRECTION_SIGNAL_LOG',
    liquidWaveContinuationVersion: LIQUID_WAVE_CONTINUATION_RELATION_VERSION,
    liquidWaveContinuationObservationOnly: true,
    liquidWaveContinuationAffectsEntry: false,
    liquidWaveContinuationAffectsMargin: false,
    liquidWaveContinuationAffectsSl: false,
    liquidWaveContinuationAffectsTp: false,
  };
}
