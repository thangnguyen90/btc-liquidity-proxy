import { liquidScanTargetKind } from './liquidScanEvalRule.js';

export const LIQUID_LONG_REVERSAL_VERSION =
  'LIQUID_LONG_REVERSAL_V2_4_MECHANISMS_20260727';

function finiteNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedCandleName(value) {
  return String(value?.name ?? value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function isSellingCandle(name) {
  return name.startsWith('BEARISH') || name === 'SHOOTING_STAR';
}

function isBtcAbsorptionCandle(name) {
  return ['DOJI', 'HAMMER', 'BULLISH_PIN_BAR', 'BEARISH_PIN_BAR'].includes(name);
}

export function evaluateLiquidLongReversal(trade = {}) {
  const side = String(trade.side ?? '').trim().toUpperCase();
  const eligible = side === 'LONG';
  const altCandle = normalizedCandleName(trade.candlePatternAtEntry);
  const targetKind = liquidScanTargetKind(trade);
  const health = trade.btcHealth ?? {};
  const pct6h = finiteNumber(health.pct6h ?? trade.btcPct6h);
  const trendScore = finiteNumber(
    health.btcTrendScore ?? trade.btcTrendScore,
  );
  const emaTrend1h = String(health.emaTrend1h ?? '')
    .trim()
    .toUpperCase();
  const btcCorr = finiteNumber(trade.btcCorr);
  const btcCandle = normalizedCandleName(trade.btcCandlePatternAtEntry);

  const capitulationMatched = eligible
    && isSellingCandle(altCandle)
    && targetKind === 'EXHAUSTION';
  const controlledSellMatched = eligible
    && pct6h != null
    && pct6h >= -0.5
    && pct6h < -0.15
    && trendScore != null
    && trendScore >= 35
    && trendScore < 50;
  const decoupledReboundMatched = eligible
    && emaTrend1h === 'BELOW'
    && btcCorr != null
    && btcCorr < -0.3;
  const btcAbsorptionMatched = eligible
    && isBtcAbsorptionCandle(btcCandle)
    && pct6h != null
    && Math.abs(pct6h) <= 0.15;

  const missingFields = [];
  if (eligible && !altCandle) missingFields.push('altCandle');
  if (eligible && pct6h == null) missingFields.push('pct6h');
  if (eligible && trendScore == null) missingFields.push('trendScore');
  if (eligible && !emaTrend1h) missingFields.push('emaTrend1h');
  if (eligible && btcCorr == null) missingFields.push('btcCorr');
  if (eligible && !btcCandle) missingFields.push('btcCandle');

  const matchedCount = [
    capitulationMatched,
    controlledSellMatched,
    decoupledReboundMatched,
    btcAbsorptionMatched,
  ].filter(Boolean).length;
  let tier = 'UNRATED';
  if (eligible && matchedCount > 1 && capitulationMatched && controlledSellMatched && matchedCount === 2) tier = 'CORE_AND_TEST';
  else if (eligible && matchedCount > 1) tier = 'MULTI_EDGE';
  else if (eligible && capitulationMatched) tier = 'CORE';
  else if (eligible && controlledSellMatched) tier = 'TEST';
  else if (eligible && decoupledReboundMatched) tier = 'DECOUPLED';
  else if (eligible && btcAbsorptionMatched) tier = 'ABSORPTION';
  else if (eligible && missingFields.length === 6) tier = 'NO_DATA';
  else if (eligible) tier = 'NO_EDGE';

  const labels = [];
  if (capitulationMatched) labels.push('LONG CORE · CAPITULATION');
  if (controlledSellMatched) labels.push('LONG TEST · CONTROLLED SELL');
  if (decoupledReboundMatched) labels.push('LONG EDGE · DECOUPLED REBOUND');
  if (btcAbsorptionMatched) labels.push('LONG EDGE · BTC ABSORPTION');

  const reasons = [];
  if (capitulationMatched) {
    reasons.push(`ALT ${altCandle} + target EXHAUSTION`);
  }
  if (controlledSellMatched) {
    reasons.push(
      `BTC pct6h ${pct6h.toFixed(2)}% + trend score ${trendScore.toFixed(0)} thuộc controlled sell`,
    );
  }
  if (decoupledReboundMatched) {
    reasons.push(
      `BTC dưới EMA1h + coin/BTC corr ${btcCorr.toFixed(2)} < -0.30`,
    );
  }
  if (btcAbsorptionMatched) {
    reasons.push(
      `BTC ${btcCandle} + pct6h ${pct6h.toFixed(2)}% gần phẳng`,
    );
  }
  if (eligible && !reasons.length) {
    reasons.push(
      missingFields.length
        ? `Không khớp edge LONG; thiếu ${missingFields.join(', ')}`
        : 'Không khớp bốn cơ chế LONG độc lập',
    );
  }

  return {
    liquidLongReversalEligible: eligible,
    liquidLongReversalTier: tier,
    liquidLongReversalCode: `LONG_REVERSAL_${tier}`,
    liquidLongReversalLabels: labels,
    liquidLongReversalLabel: labels.join(' + ') || null,
    liquidLongReversalReason: reasons.join(' | ') || 'Chỉ đánh giá lệnh LONG.',
    liquidLongCapitulationMatched: capitulationMatched,
    liquidLongControlledSellMatched: controlledSellMatched,
    liquidLongDecoupledReboundMatched: decoupledReboundMatched,
    liquidLongBtcAbsorptionMatched: btcAbsorptionMatched,
    liquidLongReversalAltCandle: altCandle || null,
    liquidLongReversalTargetKind: targetKind,
    liquidLongReversalPct6h: pct6h,
    liquidLongReversalTrendScore: trendScore,
    liquidLongReversalEmaTrend1h: emaTrend1h || null,
    liquidLongReversalBtcCorr: btcCorr,
    liquidLongReversalBtcCandle: btcCandle || null,
    liquidLongReversalMissingFields: missingFields,
    liquidLongReversalBasis: 'ENTRY_SNAPSHOT',
    liquidLongReversalVersion: LIQUID_LONG_REVERSAL_VERSION,
    liquidLongReversalObservationOnly: true,
    liquidLongReversalAffectsEntry: false,
    liquidLongReversalAffectsMargin: false,
    liquidLongReversalAffectsSl: false,
    liquidLongReversalAffectsTp: false,
  };
}
