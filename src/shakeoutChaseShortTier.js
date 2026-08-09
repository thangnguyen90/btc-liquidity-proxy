export const SHAKEOUT_CHASE_SHORT_TIER_VERSION = 'SHAKEOUT_CHASE_SHORT_TIER_V1_20260726';

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function positiveMargin(value, fallback) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed > 0 ? parsed : fallback;
}

export function evaluateShakeoutChaseShortTier({
  variant,
  side,
  score,
  btcPhase,
  tierAMarginUsdt = 10,
  tierBMarginUsdt = 5,
} = {}) {
  const normalizedVariant = normalize(variant);
  const normalizedSide = normalize(side);
  const normalizedBtcPhase = normalize(btcPhase);
  const numericScore = finiteNumber(score);
  const applies = normalizedVariant === 'CHASE' && normalizedSide === 'SHORT';

  if (!applies) {
    return {
      version: SHAKEOUT_CHASE_SHORT_TIER_VERSION,
      applies: false,
      tier: 'NO_DATA',
      label: 'CHASE SHORT NO DATA',
      code: 'CHASE_SHORT_NOT_APPLICABLE',
      marginUsdt: null,
      reason: `variant=${normalizedVariant || 'NO_DATA'}; side=${normalizedSide || 'NO_DATA'}`,
    };
  }

  const scoreAtLeast65 = numericScore != null && numericScore >= 65;
  const downMidScore55To59 = normalizedBtcPhase === 'BTC_DOWN_MID'
    && numericScore != null
    && numericScore >= 55
    && numericScore <= 59;
  const tierA = scoreAtLeast65 || downMidScore55To59;
  const tier = tierA ? 'A' : 'B_TEST';
  const marginUsdt = tierA
    ? positiveMargin(tierAMarginUsdt, 10)
    : positiveMargin(tierBMarginUsdt, 5);
  const code = scoreAtLeast65
    ? 'CHASE_SHORT_A_SCORE_65_PLUS'
    : downMidScore55To59
      ? 'CHASE_SHORT_A_BTC_DOWN_MID_SCORE_55_59'
      : 'CHASE_SHORT_B_TEST_REMAINDER';
  const label = tierA ? 'CHASE SHORT A' : 'CHASE SHORT B/TEST';

  return {
    version: SHAKEOUT_CHASE_SHORT_TIER_VERSION,
    applies: true,
    tier,
    label,
    code,
    marginUsdt,
    reason: [
      `score=${numericScore ?? 'NO_DATA'}`,
      `btcPhase=${normalizedBtcPhase || 'NO_DATA'}`,
      `rule=${code}`,
      `margin=$${marginUsdt}`,
    ].join('; '),
  };
}
