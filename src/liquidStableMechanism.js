import {
  liquidComboCycleContext,
  liquidComboKey,
} from './liquidComboCycleStats.js';

export const LIQUID_STABLE_MECHANISM_VERSION =
  'LIQUID_STABLE_MECHANISM_V1_20260802';

const RULES = [
  {
    code: 'LONG_SOFT_CORR_REBOUND',
    label: 'LONG SOFT-CORR REBOUND',
    tier: 'GOOD',
    side: 'LONG',
    corr: ['BTC_CORR_YEU'],
    trend: ['BTC_DOWN_WEAK'],
    relation: ['THEO_YEU'],
    gate: ['GATE_TEST_LIQUID_LONG_BTC_COUNTER'],
    cycles: ['DAY_FLAT | RSI4_RESET'],
    reason: 'LONG corr yếu, BTC giảm yếu, ngày phẳng và RSI4 reset.',
  },
  {
    code: 'LONG_DECOUPLED_RESET',
    label: 'LONG DECOUPLED RESET',
    tier: 'GOOD',
    side: 'LONG',
    corr: ['BTC_CORR_RAC'],
    trend: ['BTC_UP_WEAK'],
    relation: ['DOC_LAP'],
    gate: ['GATE_OK_LIQUID_LONG_BTC_ALIGNED'],
    cycles: ['DAY_FLAT | RSI4_RESET', 'DAY_NEG | RSI4_RESET'],
    reason: 'LONG gần độc lập BTC, BTC tăng yếu và RSI4 reset; nhận DAY_FLAT hoặc DAY_NEG.',
  },
  {
    code: 'SHORT_CORR_FADE_CORE',
    label: 'SHORT CORR FADE CORE',
    tier: 'GOOD',
    side: 'SHORT',
    corr: ['BTC_CORR_THEO'],
    trend: ['BTC_UP_WEAK'],
    relation: ['NGUOC_BTC'],
    gate: ['GATE_TEST_LIQUID_SHORT_BTC_COUNTER'],
    cycles: ['DAY_FLAT | RSI4_RESET'],
    reason: 'SHORT tương quan cao khi BTC tăng yếu, ngày phẳng và RSI4 reset.',
  },
  {
    code: 'SHORT_FAILED_BOUNCE',
    label: 'SHORT FAILED BOUNCE',
    tier: 'GOOD',
    side: 'SHORT',
    corr: ['BTC_CORR_THEO', 'BTC_CORR_YEU'],
    trend: ['BTC_DOWN_WEAK'],
    relation: ['THUAN_BTC', 'THEO_YEU'],
    gate: ['GATE_OK_LIQUID_SHORT_BTC_ALIGNED'],
    cycles: ['DAY_POS | RSI4_RESET'],
    reason: 'SHORT vẫn thuận BTC_DOWN_WEAK trong ngày hồi dương nhưng RSI4 còn ở pha reset.',
  },
  {
    code: 'SHORT_BEAR_DRIVE',
    label: 'SHORT BEAR DRIVE',
    tier: 'TEST',
    side: 'SHORT',
    corr: ['BTC_CORR_THEO'],
    trend: ['BTC_DOWN_WEAK', 'BTC_DOWN_MID'],
    relation: ['THUAN_BTC'],
    gate: ['GATE_OK_LIQUID_SHORT_BTC_ALIGNED'],
    cycles: ['DAY_NEG | RSI4_BALANCED'],
    reason: 'SHORT tương quan cao, thuận nhịp BTC giảm và ngày âm; TEST vì lịch sử còn tập trung ít ngày.',
  },
  {
    code: 'SHORT_DECOUPLED_HOT_FADE',
    label: 'SHORT DECOUPLED HOT FADE',
    tier: 'WATCH',
    side: 'SHORT',
    corr: ['BTC_CORR_RAC'],
    trend: ['BTC_UP_MID'],
    relation: ['DOC_LAP'],
    gate: ['GATE_TEST_LIQUID_SHORT_BTC_COUNTER'],
    cycles: ['DAY_POS | RSI4_HOT'],
    reason: 'SHORT gần độc lập BTC trong ngày dương, BTC_UP_MID và RSI4 nóng; giữ WATCH.',
  },
];

function comboParts(trade = {}) {
  const parts = liquidComboKey(trade)
    .split('|')
    .map((part) => String(part ?? '').trim().toUpperCase());
  return {
    key: parts.join(' | '),
    signal: parts[0] ?? '-',
    side: parts[1] ?? '-',
    timeframe: parts[2] ?? '-',
    corr: parts[3] ?? '-',
    trend: parts[4] ?? '-',
    relation: parts[5] ?? '-',
    gate: parts[6] ?? '-',
  };
}

function matchesRule(rule, combo, cycle) {
  return combo.signal === 'LIQUID_KILL_ZONE'
    && combo.timeframe.toLowerCase() === '15m'
    && combo.side === rule.side
    && rule.corr.includes(combo.corr)
    && rule.trend.includes(combo.trend)
    && rule.relation.includes(combo.relation)
    && rule.gate.includes(combo.gate)
    && cycle.complete
    && rule.cycles.includes(cycle.key);
}

/**
 * Observe-only decomposition of historically stable Liquid combo-cycle groups.
 * Only fields captured before entry are read. The result is additive metadata;
 * it never gates an order or changes paper/Binance sizing, entry, SL or TP.
 */
export function evaluateLiquidStableMechanism(trade = {}) {
  const combo = comboParts(trade);
  const cycle = liquidComboCycleContext(trade);
  const rule = RULES.find((candidate) => matchesRule(candidate, combo, cycle));
  const cycleVariant = rule?.code === 'LONG_DECOUPLED_RESET'
    ? (cycle.dayMove === 'DAY_FLAT' ? 'CORE' : 'TEST')
    : rule?.code === 'SHORT_BEAR_DRIVE'
      ? 'PROVISIONAL'
      : null;

  return {
    liquidStableMechanismMatched: Boolean(rule),
    liquidStableMechanismTier: rule?.tier ?? 'UNRATED',
    liquidStableMechanismCode: rule?.code ?? 'STABLE_MECHANISM_UNRATED',
    liquidStableMechanismLabel: rule?.label ?? null,
    liquidStableMechanismVariant: cycleVariant,
    liquidStableMechanismReason: rule
      ? `${rule.reason} OBSERVE ONLY.`
      : 'Ngoài 6 cơ chế Liquid combo-cycle đang theo dõi.',
    liquidStableMechanismSide: rule?.side ?? null,
    liquidStableMechanismComboKey: combo.key,
    liquidStableMechanismCycleKey: cycle.key,
    liquidStableMechanismBasis: 'ENTRY_SNAPSHOT',
    liquidStableMechanismVersion: LIQUID_STABLE_MECHANISM_VERSION,
    liquidStableMechanismObservationOnly: true,
    liquidStableMechanismAffectsEntry: false,
    liquidStableMechanismAffectsMargin: false,
    liquidStableMechanismAffectsSl: false,
    liquidStableMechanismAffectsTp: false,
    liquidStableMechanismAffectsBinance: false,
  };
}

export function liquidStableMechanismRules() {
  return RULES.map((rule) => ({
    ...rule,
    corr: [...rule.corr],
    trend: [...rule.trend],
    relation: [...rule.relation],
    gate: [...rule.gate],
    cycles: [...rule.cycles],
  }));
}
