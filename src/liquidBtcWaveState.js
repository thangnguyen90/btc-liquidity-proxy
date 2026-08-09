import {
  LIQUID_SCAN_STAGE_3_VERSION,
  evaluateLiquidScanStage3,
} from './liquidScanEvalRule.js';
import { liquidScanCycleFamily } from './liquidScanCycleEdge.js';

export const LIQUID_BTC_WAVE_STATE_VERSION =
  'LIQUID_BTC_WAVE_STATE_V1_20260727';

const ELIGIBLE_STAGE_3_TIERS = new Set(['GOOD', 'GOOD_PLUS']);

function finiteNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedStage3Tier(trade = {}) {
  const evaluated = evaluateLiquidScanStage3(trade);
  const useStored = String(trade.liquidStage3Version ?? '')
    .startsWith(LIQUID_SCAN_STAGE_3_VERSION);
  return String(
    useStored ? trade.liquidStage3Tier : evaluated.tier,
  ).toUpperCase();
}

function momentumState(direction, pct6h) {
  if (!Number.isFinite(pct6h)) return 'NO_DATA';
  if (Math.abs(pct6h) < 0.15) return 'FLAT';
  if (direction === 'UP') return pct6h > 0 ? 'ALIGNED' : 'REVERSING';
  if (direction === 'DOWN') return pct6h < 0 ? 'ALIGNED' : 'REVERSING';
  return 'NO_DATA';
}

function flowState(direction, obvTrend) {
  if (!direction || !obvTrend) return 'NO_DATA';
  if (
    (direction === 'UP' && obvTrend === 'RISING')
    || (direction === 'DOWN' && obvTrend === 'FALLING')
  ) return 'CONFIRMED';
  if (['RISING', 'FALLING', 'FLAT'].includes(obvTrend)) return 'DIVERGENT';
  return 'NO_DATA';
}

function snapshotOf(trade = {}) {
  const health = trade.btcHealth ?? {};
  const candle = trade.btcCandlePatternAtEntry ?? {};
  const direction = String(
    health.btcTrendDir ?? trade.btcTrendDir ?? '',
  ).trim().toUpperCase();
  const trendScore = finiteNumber(
    health.btcTrendScore ?? trade.btcTrendScore,
  );
  const marketRegime = String(
    health.marketRegime ?? health.regime ?? '',
  ).trim().toUpperCase();
  const emaTrend1h = String(health.emaTrend1h ?? '')
    .trim().toUpperCase();
  const pct6h = finiteNumber(health.pct6h ?? trade.btcPct6h);
  const pct24h = finiteNumber(health.pct24h ?? trade.btcPct24h);
  const rsi1h = finiteNumber(health.rsi1h ?? trade.btcRsi1h);
  const obvTrend = String(health.obvTrend ?? '')
    .trim().toUpperCase();
  const btcCandleDirection = String(candle.direction ?? '')
    .trim().toUpperCase();
  const btcCandlePattern = String(candle.name ?? '')
    .trim().toUpperCase();
  return {
    direction,
    trendScore,
    marketRegime,
    emaTrend1h,
    pct6h,
    pct24h,
    rsi1h,
    obvTrend,
    btcCandleDirection,
    btcCandlePattern,
  };
}

function missingFields(snapshot) {
  return [
    !snapshot.direction ? 'direction' : '',
    snapshot.trendScore == null ? 'trendScore' : '',
    !snapshot.marketRegime ? 'marketRegime' : '',
    !snapshot.emaTrend1h ? 'emaTrend1h' : '',
    snapshot.pct6h == null ? 'pct6h' : '',
    snapshot.rsi1h == null ? 'rsi1h' : '',
    !snapshot.obvTrend ? 'obvTrend' : '',
  ].filter(Boolean);
}

function waveLabel(tier) {
  if (tier === 'CONTINUATION') return 'BTC WAVE · CONTINUATION';
  if (tier === 'EXHAUSTED') return 'BTC WAVE · EXHAUSTED';
  if (tier === 'TRANSITION') return 'BTC WAVE · TRANSITION';
  if (tier === 'NO_DATA') return 'BTC WAVE · NO DATA';
  return null;
}

export function evaluateLiquidBtcWaveState(trade = {}) {
  const stage3Tier = normalizedStage3Tier(trade);
  const eligible = ELIGIBLE_STAGE_3_TIERS.has(stage3Tier);
  const snapshot = snapshotOf(trade);
  const cycleFamily = liquidScanCycleFamily(trade);
  const missing = missingFields(snapshot);
  const momentum = momentumState(snapshot.direction, snapshot.pct6h);
  const flow = flowState(snapshot.direction, snapshot.obvTrend);
  const exhaustionSignals = [];

  let tier = 'UNRATED';
  let reason = 'Only Liquid Stage 3 GOOD/GOOD+ receives a BTC wave-state label.';

  if (eligible && missing.length) {
    tier = 'NO_DATA';
    reason = `Entry snapshot missing: ${missing.join(', ')}.`;
  } else if (eligible && cycleFamily === 'BTC_TRANSITION_CHOP') {
    tier = 'TRANSITION';
    reason = 'BTC direction, EMA1h and market regime are not jointly confirmed.';
  } else if (eligible) {
    if (snapshot.direction === 'DOWN') {
      if (snapshot.pct6h >= -0.2) exhaustionSignals.push('DOWN_MOMENTUM_STALLED');
      if (snapshot.rsi1h <= 33) exhaustionSignals.push('RSI1H_OVERSOLD');
      if (snapshot.trendScore < 45) exhaustionSignals.push('TREND_SCORE_WEAK');
      if (flow === 'DIVERGENT') exhaustionSignals.push('OBV_DIVERGENCE');
      const exhausted = (
        snapshot.pct6h >= -0.2
        && (
          snapshot.rsi1h <= 42
          || snapshot.trendScore < 50
          || flow === 'DIVERGENT'
        )
      ) || (snapshot.rsi1h <= 33 && snapshot.pct6h >= -0.5);
      tier = exhausted ? 'EXHAUSTED' : 'CONTINUATION';
    } else if (snapshot.direction === 'UP') {
      if (snapshot.pct6h <= 0.2) exhaustionSignals.push('UP_MOMENTUM_STALLED');
      if (snapshot.rsi1h >= 68) exhaustionSignals.push('RSI1H_OVERBOUGHT');
      if (snapshot.trendScore < 45) exhaustionSignals.push('TREND_SCORE_WEAK');
      if (flow === 'DIVERGENT') exhaustionSignals.push('OBV_DIVERGENCE');
      const exhausted = (
        flow === 'DIVERGENT'
        && (snapshot.pct6h <= 0.2 || snapshot.rsi1h >= 58)
      ) || snapshot.rsi1h >= 68;
      tier = exhausted ? 'EXHAUSTED' : 'CONTINUATION';
    } else {
      tier = 'TRANSITION';
    }
    reason = tier === 'EXHAUSTED'
      ? `Confirmed ${snapshot.direction} wave but entry snapshot shows ${exhaustionSignals.join(' + ') || 'late-wave divergence'}.`
      : `Confirmed ${snapshot.direction} wave with aligned structure; momentum ${momentum}, flow ${flow}.`;
  }

  return {
    liquidBtcWaveEligible: eligible,
    liquidBtcWaveTier: tier,
    liquidBtcWaveCode: tier === 'UNRATED' ? 'BTC_WAVE_UNRATED' : `BTC_WAVE_${tier}`,
    liquidBtcWaveLabel: waveLabel(tier),
    liquidBtcWaveReason: reason,
    liquidBtcWaveCycleFamily: cycleFamily,
    liquidBtcWaveDirection: snapshot.direction || null,
    liquidBtcWaveTrendScore: snapshot.trendScore,
    liquidBtcWaveMarketRegime: snapshot.marketRegime || null,
    liquidBtcWaveEmaTrend1h: snapshot.emaTrend1h || null,
    liquidBtcWavePct6h: snapshot.pct6h,
    liquidBtcWavePct24h: snapshot.pct24h,
    liquidBtcWaveRsi1h: snapshot.rsi1h,
    liquidBtcWaveObvTrend: snapshot.obvTrend || null,
    liquidBtcWaveMomentum: momentum,
    liquidBtcWaveFlow: flow,
    liquidBtcWaveBtcCandleDirection: snapshot.btcCandleDirection || null,
    liquidBtcWaveBtcCandlePattern: snapshot.btcCandlePattern || null,
    liquidBtcWaveExhaustionSignals: exhaustionSignals,
    liquidBtcWaveMissingFields: missing,
    liquidBtcWaveBasis: 'ENTRY_SNAPSHOT',
    liquidBtcWaveVersion: LIQUID_BTC_WAVE_STATE_VERSION,
    liquidBtcWaveObservationOnly: true,
    liquidBtcWaveAffectsEntry: false,
    liquidBtcWaveAffectsMargin: false,
    liquidBtcWaveAffectsSl: false,
    liquidBtcWaveAffectsTp: false,
  };
}
