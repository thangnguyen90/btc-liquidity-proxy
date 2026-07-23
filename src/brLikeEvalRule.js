const DEFAULT_SHORT_GOOD_HOURS = [3, 8, 14, 17, 21];

function normalizedPhase({ btcTrendDir, btcTrendScore }) {
  const direction = String(btcTrendDir ?? '').toLowerCase();
  const score = Number(btcTrendScore);
  if (!['up', 'down'].includes(direction) || !Number.isFinite(score)) return 'no_data';
  return `${direction}_${score < 45 ? 'weak' : score < 65 ? 'mid' : 'strong'}`;
}

function corrBucketOf(btcCorr) {
  const corr = Number(btcCorr);
  if (!Number.isFinite(corr)) return 'no_data';
  if (corr < 0.3) return 'rac';
  if (corr < 0.5) return 'yeu';
  return 'theo';
}

export function getBrLikeEvalRule({
  side,
  interval,
  btcTrendDir,
  btcTrendScore,
  btcCorr,
  hour,
  shortGoodHours = DEFAULT_SHORT_GOOD_HOURS,
} = {}) {
  const tradeSide = String(side ?? '').toUpperCase();
  const tf = String(interval ?? '').toLowerCase();
  const phase = normalizedPhase({ btcTrendDir, btcTrendScore });
  const corr = corrBucketOf(btcCorr);
  const currentHour = Number(hour);
  const key = `${tf}|${corr}|${phase}`;
  const hourSet = new Set(shortGoodHours.map(Number).filter(Number.isFinite));
  const goodShortHour = Number.isFinite(currentHour) && hourSet.has(currentHour);

  let tier = 'BLOCK';
  let label = 'BR_LIKE_EVAL_BLOCK';

  if (phase === 'no_data' || corr === 'no_data') {
    label = 'BR_LIKE_EVAL_NO_DATA_BLOCK';
  } else if (tradeSide === 'LONG') {
    const watchCombos = new Set([
      '5m|yeu|down_mid',
      '15m|rac|down_weak',
      '15m|theo|down_weak',
      '15m|rac|up_mid',
    ]);
    if (watchCombos.has(key)) {
      tier = 'B';
      label = 'BR_LIKE_LONG_WATCH_TEST';
    } else {
      label = 'BR_LIKE_LONG_DEFAULT_BLOCK';
    }
  } else if (tradeSide === 'SHORT') {
    const hardBadCombos = new Set([
      '5m|rac|up_mid',
      '5m|rac|down_mid',
      '5m|yeu|down_strong',
      '15m|theo|up_weak',
    ]);
    const short5mGoodCombos = new Set([
      '5m|theo|up_mid',
      '5m|yeu|up_mid',
    ]);
    const short15mGoodCombos = new Set([
      '15m|yeu|down_strong',
      '15m|rac|down_strong',
      '15m|rac|up_mid',
    ]);

    if (hardBadCombos.has(key)) {
      label = 'BR_LIKE_SHORT_HARD_BAD_BLOCK';
    } else if (tf === '5m') {
      if (short5mGoodCombos.has(key) && goodShortHour) {
        tier = 'B';
        label = 'BR_LIKE_SHORT_5M_COMBO_HOUR_TEST';
      } else {
        label = short5mGoodCombos.has(key)
          ? 'BR_LIKE_SHORT_5M_BAD_HOUR_BLOCK'
          : 'BR_LIKE_SHORT_5M_COMBO_BLOCK';
      }
    } else if (tf === '15m') {
      if (short15mGoodCombos.has(key) && goodShortHour) {
        tier = 'A';
        label = 'BR_LIKE_SHORT_15M_COMBO_HOUR_FULL';
      } else if (short15mGoodCombos.has(key) || goodShortHour) {
        tier = 'B';
        label = short15mGoodCombos.has(key)
          ? 'BR_LIKE_SHORT_15M_COMBO_TEST'
          : 'BR_LIKE_SHORT_15M_GOOD_HOUR_TEST';
      } else {
        label = 'BR_LIKE_SHORT_15M_UNCONFIRMED_BLOCK';
      }
    } else {
      label = 'BR_LIKE_SHORT_TIMEFRAME_BLOCK';
    }
  }

  return {
    allow: tier !== 'BLOCK',
    tier,
    label,
    key,
    hour: Number.isFinite(currentHour) ? currentHour : null,
    btcPhase: phase === 'no_data' ? 'BTC_NO_DATA' : `BTC_${phase.toUpperCase()}`,
    corrBucket: corr,
    goodShortHour,
    reason: `BR-like ${tradeSide || '-'} tf=${tf || '-'} btc=${phase} corr=${corr} hour=${Number.isFinite(currentHour) ? currentHour : '-'}; selected=${tier}`,
  };
}

export function getBrLikeEvalGate(input = {}, env = process.env) {
  if (env.EMA_SQUEEZE_PAPER_BR_LIKE_EVAL_GATE === 'false') return null;
  const shortGoodHours = String(env.EMA_SQUEEZE_PAPER_BR_LIKE_EVAL_SHORT_GOOD_HOURS ?? DEFAULT_SHORT_GOOD_HOURS.join(','))
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  const rule = getBrLikeEvalRule({ ...input, shortGoodHours });
  const full = Number(env.EMA_SQUEEZE_PAPER_BR_LIKE_EVAL_A_MARGIN_USDT ?? 10);
  const test = Number(env.EMA_SQUEEZE_PAPER_BR_LIKE_EVAL_B_MARGIN_USDT ?? 1);
  return {
    ...rule,
    marginUsdt: rule.tier === 'A'
      ? (Number.isFinite(full) && full > 0 ? full : 10)
      : rule.tier === 'B'
        ? (Number.isFinite(test) && test > 0 ? test : 1)
        : 0,
    testOnly: rule.tier === 'B',
    version: String(env.EMA_SQUEEZE_PAPER_BR_LIKE_EVAL_VERSION ?? 'BR_LIKE_EVAL_V2_2026_07_20'),
  };
}
