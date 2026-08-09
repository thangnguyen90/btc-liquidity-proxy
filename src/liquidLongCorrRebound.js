import {
  LIQUID_SCAN_STAGE_3_VERSION,
  evaluateLiquidScanStage3,
} from './liquidScanEvalRule.js';
import {
  liquidComboCycleContext,
  liquidComboKey,
} from './liquidComboCycleStats.js';

export const LIQUID_LONG_CORR_REBOUND_VERSION =
  'LIQUID_LONG_CORR_REBOUND_V2_20260802';

export const LIQUID_LONG_CORR_REBOUND_TEST_MARGIN_USDT = 10;

export const LIQUID_LONG_CORR_REBOUND_COMBO_KEY =
  'LIQUID_KILL_ZONE | LONG | 15m | BTC_CORR_THEO | BTC_DOWN_WEAK | NGUOC_BTC | GATE_TEST_LIQUID_LONG_BTC_COUNTER';

export const LIQUID_LONG_CORR_REBOUND_CYCLE_KEY =
  'DAY_FLAT | RSI4_RESET';

function normalized(value) {
  return String(value ?? '').trim().toUpperCase();
}

function currentStage3Tier(trade = {}) {
  const evaluated = evaluateLiquidScanStage3(trade);
  const storedIsCurrent = String(trade.liquidStage3Version ?? '')
    .startsWith(LIQUID_SCAN_STAGE_3_VERSION);
  return normalized(storedIsCurrent ? trade.liquidStage3Tier : evaluated.tier);
}

/**
 * Paper-test label for the chronological 2026-07-27..2026-08-02 LONG
 * correlated counter-BTC rebound cohort. Only entry snapshot fields are read.
 * Existing Stage 3 RISK trades are deliberately never promoted. The caller
 * must opt in to the $10 paper size; classification alone never changes size.
 */
export function evaluateLiquidLongCorrRebound(trade = {}, {
  applyPaperTest = false,
  paperTestMarginUsdt = LIQUID_LONG_CORR_REBOUND_TEST_MARGIN_USDT,
} = {}) {
  const comboKey = liquidComboKey(trade);
  const cycle = liquidComboCycleContext(trade);
  const stage3Tier = currentStage3Tier(trade);
  const comboMatched = comboKey === LIQUID_LONG_CORR_REBOUND_COMBO_KEY;
  const cycleMatched = cycle.complete
    && cycle.key === LIQUID_LONG_CORR_REBOUND_CYCLE_KEY;
  const matched = comboMatched && cycleMatched && stage3Tier === 'WATCH';
  const normalizedTestMargin = Number.isFinite(Number(paperTestMarginUsdt))
    && Number(paperTestMarginUsdt) > 0
    ? Number(paperTestMarginUsdt)
    : LIQUID_LONG_CORR_REBOUND_TEST_MARGIN_USDT;
  const paperSizeApplied = matched && applyPaperTest === true;

  let reason = 'Outside the LONG correlated counter-BTC rebound cohort.';
  if (comboMatched && !cycle.complete) {
    reason = 'Missing BTC pct24h or RSI4h in the entry snapshot.';
  } else if (comboMatched && !cycleMatched) {
    reason = `Cycle ${cycle.key} is not DAY_FLAT + RSI4_RESET.`;
  } else if (comboMatched && cycleMatched && stage3Tier !== 'WATCH') {
    reason = `Stage 3 ${stage3Tier || 'NO_DATA'} is preserved; this label only subdivides WATCH and never overrides RISK.`;
  } else if (matched) {
    reason = `LONG kill-zone + BTC corr theo + BTC_DOWN_WEAK counter-BTC + DAY_FLAT + RSI4_RESET; paper-test target $${normalizedTestMargin}.`;
  }

  return {
    liquidLongCorrReboundEligible: comboMatched && cycleMatched,
    liquidLongCorrReboundMatched: matched,
    liquidLongCorrReboundTier: matched ? 'GOOD' : 'UNRATED',
    liquidLongCorrReboundCode: matched
      ? 'LONG_CORR_REBOUND'
      : 'LONG_CORR_REBOUND_UNRATED',
    liquidLongCorrReboundLabel: matched ? 'LONG CORR REBOUND' : null,
    liquidLongCorrReboundReason: reason,
    liquidLongCorrReboundComboKey: comboKey,
    liquidLongCorrReboundCycleKey: cycle.key,
    liquidLongCorrReboundStage3Tier: stage3Tier || null,
    liquidLongCorrReboundBasis: 'ENTRY_SNAPSHOT',
    liquidLongCorrReboundVersion: LIQUID_LONG_CORR_REBOUND_VERSION,
    liquidLongCorrReboundObservationOnly: !paperSizeApplied,
    liquidLongCorrReboundPaperTestOnly: paperSizeApplied,
    liquidLongCorrReboundPaperTestEligible: matched,
    liquidLongCorrReboundPaperTestMarginUsdt: matched ? normalizedTestMargin : null,
    liquidLongCorrReboundPaperSizeApplied: paperSizeApplied,
    liquidLongCorrReboundAffectsEntry: false,
    liquidLongCorrReboundAffectsMargin: false,
    liquidLongCorrReboundAffectsPaperMargin: paperSizeApplied,
    liquidLongCorrReboundAffectsSl: false,
    liquidLongCorrReboundAffectsTp: false,
    liquidLongCorrReboundAffectsBinance: false,
  };
}

export function liquidLongCorrReboundPaperSizing(trade = {}, {
  marginUsdt = trade.marginUsdt,
  leverage = trade.leverage,
  entryPrice = trade.entryPrice,
} = {}) {
  const currentMargin = Number(marginUsdt);
  const currentQuantity = Number(trade.quantity);
  if (trade.liquidLongCorrReboundPaperSizeApplied !== true) {
    return {
      applied: false,
      marginUsdt: currentMargin,
      quantity: currentQuantity,
      appliedMarginUsdt: null,
    };
  }
  const targetMargin = Number(trade.liquidLongCorrReboundPaperTestMarginUsdt);
  const lev = Number(leverage);
  const entry = Number(entryPrice);
  const validTarget = Number.isFinite(targetMargin) && targetMargin > 0
    ? targetMargin
    : LIQUID_LONG_CORR_REBOUND_TEST_MARGIN_USDT;
  return {
    applied: true,
    marginUsdt: validTarget,
    quantity: Number.isFinite(lev) && lev > 0 && Number.isFinite(entry) && entry > 0
      ? (validTarget * lev) / entry
      : currentQuantity,
    appliedMarginUsdt: validTarget,
  };
}
