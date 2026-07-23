export const SHAKEOUT_SIDE_CANDLE_RULE_VERSION = 'SHAKEOUT_SIDE_BTC_CANDLE_V1';

function normalize(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function candleName(value) {
  return normalize(value && typeof value === 'object'
    ? (value.name ?? value.pattern ?? value.label ?? value.direction)
    : value) || 'NO_DATA';
}

function candleBias(value) {
  const name = candleName(value);
  if (name.includes('BEARISH') || name === 'SHOOTING_STAR') return 'BEARISH';
  if (name.includes('BULLISH') || name === 'HAMMER') return 'BULLISH';
  return 'NEUTRAL';
}

function regimeOf(health = {}) {
  const direction = normalize(health.btcTrendDir ?? health.direction);
  if (direction === 'UP') return 'SW_UP';
  if (direction === 'DOWN') return 'SW_DOWN';

  const stored = normalize(health.regime ?? health.btcRegimeAtEntry);
  if (['STRONG', 'WEAK_UP', 'SW_UP'].includes(stored)) return 'SW_UP';
  if (['WEAK', 'WEAK_DOWN', 'SW_DOWN'].includes(stored)) return 'SW_DOWN';

  const pct6h = Number(health.pct6h ?? health.btcPct6hAtEntry);
  if (Number.isFinite(pct6h) && pct6h > 0) return 'SW_UP';
  if (Number.isFinite(pct6h) && pct6h < 0) return 'SW_DOWN';
  return 'SW_FLAT';
}

/**
 * Independent paper sizing label. It does not replace the existing Shakeout
 * combo/quality gates: only the two explicitly conflicting cohorts are capped
 * to TEST $1; GOOD and WATCH keep their existing size.
 */
export function evaluateShakeoutSideCandle({ side, btcHealth = {}, btcCandle = null } = {}) {
  const normalizedSide = normalize(side);
  const regime = regimeOf(btcHealth);
  const pattern = candleName(btcCandle);
  const bias = candleBias(btcCandle);

  let tier = 'WATCH';
  let label = `${regime}_${normalizedSide}_${bias}_WATCH`;
  let marginCapUsdt = null;
  let reason = `${regime} + ${normalizedSide || 'NO_SIDE'} + BTC ${pattern}: giữ rule combo hiện tại`;

  if (regime === 'SW_DOWN' && normalizedSide === 'LONG' && bias === 'BEARISH') {
    tier = 'RISK';
    label = 'SW_DOWN_LONG_BTC_BEARISH_RISK';
    marginCapUsdt = 1;
    reason = `LONG ngược SW_DOWN và nến BTC ${pattern} xác nhận giảm: chỉ TEST $1`;
  } else if (regime === 'SW_DOWN' && normalizedSide === 'SHORT' && bias === 'BEARISH') {
    tier = 'GOOD';
    label = 'SW_DOWN_SHORT_BTC_BEARISH_GOOD';
    reason = `SHORT thuận SW_DOWN và nến BTC ${pattern} xác nhận giảm: giữ size rule hiện tại`;
  } else if (regime === 'SW_UP' && normalizedSide === 'SHORT' && bias === 'BULLISH') {
    tier = 'RISK';
    label = 'SW_UP_SHORT_BTC_BULLISH_RISK';
    marginCapUsdt = 1;
    reason = `SHORT ngược SW_UP và nến BTC ${pattern} xác nhận tăng: chỉ TEST $1`;
  } else if (regime === 'SW_UP' && normalizedSide === 'LONG' && bias === 'BULLISH') {
    tier = 'GOOD';
    label = 'SW_UP_LONG_BTC_BULLISH_GOOD';
    reason = `LONG thuận SW_UP và nến BTC ${pattern} xác nhận tăng: giữ size rule hiện tại`;
  }

  return {
    version: SHAKEOUT_SIDE_CANDLE_RULE_VERSION,
    tier,
    label,
    reason,
    regime,
    side: normalizedSide,
    btcCandle: pattern,
    btcCandleBias: bias,
    marginCapUsdt,
  };
}
