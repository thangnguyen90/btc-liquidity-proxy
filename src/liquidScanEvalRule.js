export const LIQUID_SCAN_EVAL_RULE_VERSION = 'LIQUID_SHADOW_V2_20260722';
export const LIQUID_SCAN_STAGE_2_VERSION = 'LIQUID_STAGE_2_V1_20260722';
export const LIQUID_SCAN_STAGE_3_VERSION = 'LIQUID_COMBO_STAGE_3_V1_20260723';

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function zoneRange(zone) {
  if (!zone || typeof zone !== 'object') return null;
  const low = finiteNumber(zone.low ?? zone.price);
  const high = finiteNumber(zone.high ?? zone.price);
  if (!(low > 0) || !(high > 0)) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function zoneContains(zone, price) {
  const range = zoneRange(zone);
  return Boolean(range && price > 0 && price >= range.low * 0.9995 && price <= range.high * 1.0005);
}

export function liquidScanTargetKind(trade = {}) {
  const cluster = trade.entryPlan?.killZoneCluster ?? trade.killZoneCluster ?? {};
  const target = finiteNumber(trade.sweepTargetPrice ?? trade.entryPlan?.sweepTargetPrice ?? trade.takeProfitPrice ?? trade.entryPlan?.targetPrice);
  if (zoneContains(cluster.mainKillZone, target)) return 'MAIN_ZONE';
  if (zoneContains(cluster.exhaustionZone, target)) return 'EXHAUSTION';
  if (zoneContains(cluster.farKillZone, target)) return 'FAR_ZONE';
  const near = finiteNumber(cluster.nearSweep?.price ?? cluster.nearSweep?.targetPrice);
  if (target > 0 && near > 0 && Math.abs(target / near - 1) <= 0.001) return 'NEAR_SWEEP';
  return 'LOCAL_SWEEP';
}

/**
 * Analysis-only second stage for Liquid Scan. It deliberately does not return
 * a margin or entry decision, so displaying this label cannot change sizing.
 */
export function evaluateLiquidScanStage2(trade = {}) {
  const side = String(trade.side ?? '').toUpperCase();
  const corr = finiteNumber(trade.btcCorr);
  const distance = Math.abs(finiteNumber(trade.sweepDistancePct ?? trade.entryPlan?.targetDistancePct, Infinity));
  const targetKind = liquidScanTargetKind(trade);
  const inBaseCohort = side === 'SHORT' && corr != null && corr >= 0.5;

  if (!inBaseCohort) {
    return {
      tier: 'WATCH',
      code: 'WATCH',
      label: 'WATCH',
      targetKind,
      reason: side !== 'SHORT'
        ? 'Ngoài cohort SHORT + BTC corr >= 0.50 đang được kiểm chứng'
        : corr == null
          ? 'Chưa có BTC correlation tại entry'
          : `BTC correlation ${corr.toFixed(2)} < 0.50`,
      version: LIQUID_SCAN_STAGE_2_VERSION,
    };
  }

  if (distance >= 2) {
    return {
      tier: 'RISK',
      code: 'RISK',
      label: 'RISK · DIST >= 2%',
      targetKind,
      reason: `SHORT corr ${corr.toFixed(2)} nhưng sweep ${distance.toFixed(2)}% >= 2%`,
      version: LIQUID_SCAN_STAGE_2_VERSION,
    };
  }

  if (targetKind === 'MAIN_ZONE') {
    return {
      tier: 'WATCH',
      code: 'WATCH',
      label: 'WATCH · MAIN ZONE',
      targetKind,
      reason: `SHORT corr ${corr.toFixed(2)} nhưng target thuộc main zone; mẫu backtest chưa có net dương`,
      version: LIQUID_SCAN_STAGE_2_VERSION,
    };
  }

  if (targetKind === 'LOCAL_SWEEP' && distance < 2) {
    return {
      tier: 'A_PLUS',
      code: 'A+',
      label: `A+ · LOCAL ${distance < 1 ? '<1%' : '1-2%'}`,
      targetKind,
      reason: `SHORT corr ${corr.toFixed(2)} + local sweep ${distance.toFixed(2)}% < 2%`,
      version: LIQUID_SCAN_STAGE_2_VERSION,
    };
  }

  return {
    tier: 'A',
    code: 'A',
    label: `A · ${targetKind.replaceAll('_', ' ')}`,
    targetKind,
    reason: `SHORT corr ${corr.toFixed(2)} + sweep ${distance.toFixed(2)}% < 2%; giữ mức A vì target không phải local sweep`,
    version: LIQUID_SCAN_STAGE_2_VERSION,
  };
}

export function liquidScanBtcPhase(trade = {}) {
  const saved = String(trade.btcPhase ?? trade.btcTrendPhase ?? '').trim().toUpperCase();
  if (saved) return saved;
  const health = trade.btcHealth ?? {};
  const dir = String(health.btcTrendDir ?? trade.btcTrendDir ?? '').trim().toUpperCase();
  const score = finiteNumber(health.btcTrendScore ?? trade.btcTrendScore);
  if (!dir) return 'BTC_NO_DATA';
  const strength = score == null ? 'NO_SCORE' : score < 45 ? 'WEAK' : score < 65 ? 'MID' : 'STRONG';
  return `BTC_${dir}_${strength}`;
}

function liquidScanDistanceBucket(distance) {
  if (!Number.isFinite(distance)) return 'DIST_NO_DATA';
  if (distance >= 10) return 'DIST_10_PLUS';
  if (distance >= 5) return 'DIST_5_10';
  if (distance >= 2) return 'DIST_2_5';
  if (distance >= 1) return 'DIST_1_2';
  return 'DIST_LT_1';
}

function liquidScanCorrBucket(corr) {
  if (!Number.isFinite(corr)) return 'CORR_NO_DATA';
  if (corr >= 0.5) return 'CORR_THEO';
  if (corr >= 0.3) return 'CORR_YEU';
  return 'CORR_RAC';
}

function liquidScanOneSidedBucket(value) {
  if (!Number.isFinite(value)) return 'ONE_SIDE_NO_DATA';
  if (value >= 90) return 'ONE_SIDE_90_PLUS';
  if (value >= 75) return 'ONE_SIDE_75_89';
  if (value >= 50) return 'ONE_SIDE_50_74';
  return 'ONE_SIDE_LT_50';
}

function liquidScanFeasibilityBucket(value) {
  if (!Number.isFinite(value)) return 'FEAS_NO_DATA';
  if (value >= 70) return 'FEAS_70_PLUS';
  if (value >= 50) return 'FEAS_50_69';
  if (value >= 30) return 'FEAS_30_49';
  return 'FEAS_LT_30';
}

function liquidScanRrBucket(value) {
  if (!Number.isFinite(value)) return 'RR_NO_DATA';
  if (value >= 1) return 'RR_1_PLUS';
  if (value >= 0.5) return 'RR_0.5_1';
  if (value >= 0.2) return 'RR_0.2_0.5';
  return 'RR_LT_0.2';
}

function liquidScanCandleName(value) {
  return String(value?.name ?? value ?? 'NO_DATA')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

/**
 * Observation-only combo label layered after Liquid Stage 2.
 *
 * The thresholds are deliberately fixed from the 2026-07-23 chronological
 * backtest. No PnL or outcome from the current trade is read here, and the
 * result must never be used to mutate entry, margin, leverage, SL or TP.
 */
export function evaluateLiquidScanStage3(trade = {}) {
  const side = String(trade.side ?? '').toUpperCase();
  const corr = finiteNumber(trade.btcCorr);
  const distance = Math.abs(finiteNumber(
    trade.sweepDistancePct ?? trade.entryPlan?.targetDistancePct,
    Infinity,
  ));
  const cluster = trade.entryPlan?.killZoneCluster ?? trade.killZoneCluster ?? {};
  const oneSidedPct = finiteNumber(cluster.oneSidedPct);
  const feasibilityScore = finiteNumber(trade.feasibilityScore ?? trade.entryPlan?.feasibilityScore);
  const rr = finiteNumber(trade.rr ?? trade.entryPlan?.rr);
  const targetKind = liquidScanTargetKind(trade);
  const btcPhase = liquidScanBtcPhase(trade);
  const symbolCandle = liquidScanCandleName(trade.candlePatternAtEntry);
  const btcCandle = liquidScanCandleName(trade.btcCandlePatternAtEntry);
  const stage2 = evaluateLiquidScanStage2(trade);
  const stage2Good = ['A', 'A_PLUS'].includes(stage2.tier);
  const distanceBucket = liquidScanDistanceBucket(distance);
  const corrBucket = liquidScanCorrBucket(corr);
  const oneSidedBucket = liquidScanOneSidedBucket(oneSidedPct);
  const feasibilityBucket = liquidScanFeasibilityBucket(feasibilityScore);
  const rrBucket = liquidScanRrBucket(rr);
  const comboKey = [
    side || 'SIDE_NO_DATA',
    targetKind,
    distanceBucket,
    corrBucket,
    btcPhase,
    oneSidedBucket,
    feasibilityBucket,
    rrBucket,
    `ALT_${symbolCandle}`,
    `BTC_${btcCandle}`,
  ].join(' | ');

  const finish = (tier, code, label, reason) => ({
    tier,
    code,
    label,
    reason,
    version: LIQUID_SCAN_STAGE_3_VERSION,
    comboKey,
    targetKind,
    distanceBucket,
    corrBucket,
    btcPhase,
    oneSidedBucket,
    feasibilityBucket,
    rrBucket,
    symbolCandle,
    btcCandle,
    observationOnly: true,
  });

  // These cohorts failed in the newest chronological sample. Candle is only a
  // demotion modifier inside the already-qualified Stage-2 cohort.
  if (distance >= 2 && distance < 5) {
    return finish(
      'RISK',
      'RISK',
      'RISK · DIST 2-5%',
      `${side || 'NO SIDE'} sweep ${distance.toFixed(2)}% thuộc nhóm thất bại ở mẫu mới; chỉ quan sát`,
    );
  }
  if (targetKind === 'FAR_ZONE') {
    return finish(
      'RISK',
      'RISK',
      'RISK · FAR TARGET',
      'Target FAR_ZONE có tail loss lớn trong mẫu 7 ngày; không dùng WR để nâng hạng',
    );
  }
  if (stage2Good && symbolCandle === 'BEARISH_MARUBOZU') {
    return finish(
      'RISK',
      'RISK',
      'RISK · ALT BEAR MARU',
      'Stage 2 đạt nhưng nến coin BEARISH_MARUBOZU là modifier âm trong cohort kiểm chứng',
    );
  }
  if (stage2.tier === 'RISK') {
    return finish('RISK', 'RISK', 'RISK · STAGE 2', stage2.reason);
  }

  if (stage2Good) {
    const oneSidedStrong = oneSidedPct != null && oneSidedPct >= 50 && oneSidedPct < 90;
    const feasibilityStrong = feasibilityScore != null && feasibilityScore < 50;
    const rrStrong = rr != null && rr < 0.5;
    const hasStructuralWarning = (oneSidedPct != null && oneSidedPct >= 90)
      || (feasibilityScore != null && feasibilityScore >= 50)
      || (rr != null && rr >= 0.5);

    if (distance >= 1 && distance < 2 && oneSidedStrong && feasibilityStrong && rrStrong) {
      return finish(
        'GOOD_PLUS',
        'GOOD+',
        'GOOD+ · COMBO 1-2%',
        `SHORT corr theo + dist ${distance.toFixed(2)}% + one-sided ${oneSidedPct.toFixed(1)}% + feasibility ${feasibilityScore.toFixed(0)} + RR ${rr.toFixed(2)}`,
      );
    }
    if (hasStructuralWarning) {
      const warnings = [
        oneSidedPct != null && oneSidedPct >= 90 ? `one-sided ${oneSidedPct.toFixed(1)}% >= 90%` : '',
        feasibilityScore != null && feasibilityScore >= 50 ? `feasibility ${feasibilityScore.toFixed(0)} >= 50` : '',
        rr != null && rr >= 0.5 ? `RR ${rr.toFixed(2)} >= 0.5` : '',
      ].filter(Boolean);
      return finish(
        'WATCH',
        'WATCH',
        'WATCH · STRUCTURE',
        `Stage 2 đạt nhưng ${warnings.join(', ')} chưa ổn định ở mẫu mới`,
      );
    }
    if ((distance >= 1 && distance < 2) || btcPhase === 'BTC_DOWN_WEAK') {
      return finish(
        'GOOD',
        'GOOD',
        distance >= 1 ? 'GOOD · SHORT THEO 1-2%' : 'GOOD · SHORT DOWN WEAK',
        distance >= 1
          ? `SHORT + BTC corr theo + dist ${distance.toFixed(2)}% ổn định ở cả mẫu cũ và mẫu mới`
          : 'SHORT + BTC_DOWN_WEAK ổn định ở cả mẫu cũ và mẫu mới',
      );
    }
    if (oneSidedStrong && feasibilityStrong && rrStrong) {
      return finish(
        'GOOD',
        'GOOD',
        'GOOD · STRUCTURE',
        `Stage 2 đạt + one-sided ${oneSidedPct.toFixed(1)}% + feasibility ${feasibilityScore.toFixed(0)} + RR ${rr.toFixed(2)}`,
      );
    }
    return finish(
      'WATCH',
      'WATCH',
      'WATCH · STAGE 2 PASS',
      'Stage 2 đạt nhưng combo cấu trúc chưa đủ điều kiện GOOD của mẫu chronological',
    );
  }

  if (side === 'LONG' && btcPhase === 'BTC_DOWN_MID' && distance < 1) {
    return finish(
      'WATCH',
      'WATCH',
      'WATCH · LONG DOWN MID',
      'LONG + BTC_DOWN_MID + dist <1% có PF dương nhưng hiệu quả mẫu mới đã suy giảm; chưa nâng GOOD',
    );
  }

  return finish(
    'WATCH',
    'WATCH',
    'WATCH · OUTSIDE COHORT',
    'Combo chưa có hiệu quả ổn định đồng thời trên mẫu cũ và mẫu mới',
  );
}

export function evaluateLiquidScanShadow(trade = {}) {
  const side = String(trade.side ?? '').toUpperCase();
  const point = finiteNumber(trade.signalPoint ?? trade.sweepProb);
  const sweepDistance = Math.abs(finiteNumber(trade.sweepDistancePct ?? trade.entryPlan?.targetDistancePct, Infinity));
  const corr = finiteNumber(trade.btcCorr);
  const phase = liquidScanBtcPhase(trade);
  const riskReasons = [];

  if (side === 'SHORT' && corr != null && corr >= 0.5) {
    const nearZone = sweepDistance < 1;
    return {
      tier: 'GOOD',
      cohort: nearZone ? 'SHORT_CORR_THEO_DIST_LT_1' : 'SHORT_CORR_THEO',
      label: nearZone ? 'GOOD+ · TEST $5' : 'GOOD · TEST $5',
      reason: nearZone
        ? `SHORT + BTC correlation ${corr.toFixed(2)} + sweep ${sweepDistance.toFixed(2)}% < 1%`
        : `SHORT + BTC correlation ${corr.toFixed(2)} >= 0.50`,
      version: LIQUID_SCAN_EVAL_RULE_VERSION,
      btcPhase: phase,
      testMarginUsdt: 5,
    };
  }

  if (corr == null) riskReasons.push('BTC correlation chưa có dữ liệu');
  else if (corr < 0.5) riskReasons.push(`BTC correlation ${corr.toFixed(2)} < 0.50`);
  if (phase === 'BTC_UP_STRONG') riskReasons.push('BTC_UP_STRONG có net PnL xấu trong mẫu 7 ngày');
  if (side === 'LONG' && point != null && point >= 80 && point < 90) riskReasons.push(`LONG score ${point.toFixed(0)} thuộc vùng 80-89 xấu`);
  if (side === 'SHORT' && point != null && point >= 60 && point < 70) riskReasons.push(`SHORT score ${point.toFixed(0)} thuộc vùng 60-69 xấu`);

  let tier = 'WATCH';
  let reasons = ['chưa thuộc nhóm đủ mẫu để nâng GOOD hoặc hạ RISK'];
  if (riskReasons.length) {
    tier = 'RISK';
    reasons = riskReasons;
  } else if (side === 'SHORT' && corr >= 0.5) {
    tier = 'GOOD';
    reasons = [
      point != null && point >= 88 && point < 90
        ? `SHORT score ${point.toFixed(0)} và BTC correlation theo`
        : phase === 'BTC_DOWN_WEAK'
          ? 'SHORT + BTC_DOWN_WEAK + BTC correlation theo'
          : 'SHORT + BTC correlation theo là nhóm dương trong mẫu 7 ngày',
    ];
  } else if (side === 'LONG' && point != null && point >= 70 && point < 80) {
    reasons = [`LONG score ${point.toFixed(0)} chỉ giữ WATCH trong shadow`];
  } else if (side === 'LONG' && phase === 'BTC_DOWN_WEAK') {
    reasons = ['LONG + BTC_DOWN_WEAK chỉ giữ WATCH trong shadow'];
  }

  return {
    tier,
    label: `${tier} · SHADOW $1`,
    reason: reasons.join('; '),
    version: LIQUID_SCAN_EVAL_RULE_VERSION,
    btcPhase: phase,
    testMarginUsdt: 1,
  };
}

export function liquidScanTrailLockRoe(peakRoe) {
  const peak = finiteNumber(peakRoe);
  if (peak == null || peak < 10) return null;
  if (peak < 15) return 1;
  const trigger = 15 + Math.floor((peak - 15) / 5) * 5;
  return trigger - 10;
}

export function capLiquidScanShadowMargin(marginUsdt, capUsdt = 1) {
  const requested = finiteNumber(marginUsdt);
  const cap = Math.max(0.01, finiteNumber(capUsdt, 1));
  return requested != null && requested > 0 ? Math.min(requested, cap) : cap;
}

export function liquidPaperFinancialMetrics(trade = {}, currentPrice = null, feeRate = 0.0004) {
  const status = String(trade.status ?? '').toUpperCase();
  if (!['OPEN', 'CLOSED'].includes(status)) {
    return { grossPnl: null, feeRate, estimatedFeeUsdt: null, feeUsdt: null, netPnl: null, netRoe: null };
  }
  const entry = finiteNumber(trade.entryPrice);
  const exit = finiteNumber(status === 'CLOSED' ? trade.exitPrice : currentPrice ?? trade.markPrice);
  const qty = finiteNumber(trade.quantity);
  const margin = finiteNumber(trade.marginUsdt);
  if (!(entry > 0) || !(exit > 0) || !(qty > 0)) {
    return { grossPnl: null, feeRate, estimatedFeeUsdt: null, feeUsdt: null, netPnl: null, netRoe: null };
  }
  const sideMult = String(trade.side ?? '').toUpperCase() === 'LONG' ? 1 : -1;
  const grossPnl = (exit - entry) * qty * sideMult;
  const safeFeeRate = Math.max(0, finiteNumber(feeRate, 0.0004));
  const estimatedFeeUsdt = (Math.abs(entry * qty) + Math.abs(exit * qty)) * safeFeeRate;
  const netPnl = grossPnl - estimatedFeeUsdt;
  const netRoe = margin > 0 ? (netPnl / margin) * 100 : null;
  return { grossPnl, feeRate: safeFeeRate, estimatedFeeUsdt, feeUsdt: estimatedFeeUsdt, netPnl, netRoe };
}
