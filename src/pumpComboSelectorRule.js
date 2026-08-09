export const PUMP_COMBO_SELECTOR_VERSION = 'PUMP_COMBO_SELECTOR_OBSERVE_V2_20260723';

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const bounded = (value, min, max) => Math.max(min, Math.min(max, value));

function weightedMean(windows = []) {
  const configured = [
    { name: '1d', weight: 0.5 },
    { name: '3d', weight: 0.3 },
    { name: '7d', weight: 0.2 },
  ];
  const available = configured
    .map((item) => ({
      ...item,
      row: windows.find((window) => window?.name === item.name),
    }))
    .filter((item) => Number(item.row?.supportClosed ?? 0) > 0);
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return available.reduce(
    (sum, item) => sum + finite(item.row?.posteriorMeanRoe) * item.weight,
    0,
  ) / totalWeight;
}

/**
 * Observation-only selector for Pump Paper (native Pump + EMA clones).
 *
 * The rule ranks absolute, fee-adjusted historical edge. It deliberately does
 * not compare a child cohort with its parent (the old Lift L2 behaviour).
 * Candle quality is only a small modifier; it can never create CORE by itself.
 */
export function evaluatePumpComboSelectorEvidence({
  windows = [],
  exactClosed = 0,
  candleTier = 'WATCH',
  snapshot = false,
} = {}) {
  const seven = windows.find((window) => window?.name === '7d') ?? {};
  const one = windows.find((window) => window?.name === '1d') ?? {};
  const n = Math.max(0, Math.round(finite(exactClosed)));
  const exactDays = Math.max(0, Math.round(finite(seven.exactDays)));
  const exactPositiveDays = Math.max(0, Math.round(finite(seven.exactPositiveDays)));
  const exactNegativeDays = Math.max(0, Math.round(finite(seven.exactNegativeDays)));
  const profitFactor = finite(seven.profitFactor);
  const slRate = bounded(finite(seven.slRate), 0, 1);
  const standardError = bounded(finite(seven.standardError, 4), 0.25, 6);
  const normalizedCandleTier = String(candleTier ?? 'WATCH').trim().toUpperCase();
  const candleAdjustment = normalizedCandleTier.includes('GOOD')
    || normalizedCandleTier.includes('WATCH_PLUS')
    || normalizedCandleTier.includes('WATCH+')
    ? 0.15
    : normalizedCandleTier.includes('RISK')
      ? -0.15
      : 0;

  const positiveWindows = windows.filter(
    (window) => Number(window?.exactClosed ?? 0) >= 3
      && finite(window?.posteriorMeanRoe) > 0.15,
  ).length;
  const negativeWindows = windows.filter(
    (window) => Number(window?.exactClosed ?? 0) >= 3
      && finite(window?.posteriorMeanRoe) < -0.15,
  ).length;
  const recentConflict = Number(one.exactClosed ?? 0) >= 3
    && finite(one.posteriorMeanRoe) < -0.15
    && finite(seven.posteriorMeanRoe) > 0.15;
  const tailPenalty = Math.max(0, slRate - 0.35) * 4;
  const driftPenalty = recentConflict ? 0.5 : 0;
  const expectedNetRoe = weightedMean(windows)
    + candleAdjustment
    - tailPenalty
    - driftPenalty;
  const conservativeEdge = expectedNetRoe - 0.75 * standardError;

  let tier = 'WATCH';
  let code = 'PUMP_SELECTOR_MIXED';
  let reason = 'Edge lịch sử còn lẫn lộn hoặc độ tin cậy chưa đủ.';

  if (
    n >= 12
    && exactDays >= 3
    && exactPositiveDays >= 2
    && positiveWindows >= 2
    && conservativeEdge > 0
    && profitFactor >= 1.1
    && slRate < 0.5
    && !recentConflict
  ) {
    tier = 'CORE';
    code = 'PUMP_SELECTOR_CORE';
    reason = 'Edge net dương, ổn định ít nhất 2 cửa sổ và biên bảo thủ vẫn dương.';
  } else if (
    expectedNetRoe > 0.25
    && profitFactor >= 0.95
    && (n >= 5 || positiveWindows >= 1)
  ) {
    tier = 'PROBE';
    code = 'PUMP_SELECTOR_PROBE';
    reason = n < 12
      ? 'Combo có edge dương nhưng mẫu chính còn nhỏ; chỉ gắn nhãn thăm dò.'
      : 'Combo có edge dương nhưng chưa đủ ổn định để lên CORE.';
  } else if (
    n >= 8
    && exactDays >= 3
    && exactNegativeDays >= 2
    && expectedNetRoe < -0.25
    && profitFactor < 0.9
    && (negativeWindows >= 2 || slRate >= 0.5)
  ) {
    tier = 'AVOID';
    code = 'PUMP_SELECTOR_AVOID';
    reason = 'Edge net âm và được xác nhận bởi nhiều cửa sổ hoặc tỷ lệ SL cao.';
  } else if (n >= 8 && exactDays < 3) {
    code = 'PUMP_SELECTOR_COLLECT_DAYS';
    reason = `Có ${n} mẫu nhưng mới trải trên ${exactDays} ngày độc lập; chưa đủ để kết luận CORE/AVOID.`;
  }

  const basis = snapshot ? 'SNAPSHOT' : 'BACKFILL';
  return {
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    affectsSl: false,
    affectsTp: false,
    tier,
    label: `${tier} · ${basis}`,
    code,
    basis,
    reason,
    version: PUMP_COMBO_SELECTOR_VERSION,
    exactClosed: n,
    exactDays,
    exactPositiveDays,
    exactNegativeDays,
    supportClosed: Math.max(0, Math.round(finite(seven.supportClosed))),
    expectedNetRoe: +expectedNetRoe.toFixed(3),
    conservativeEdge: +conservativeEdge.toFixed(3),
    profitFactor: +profitFactor.toFixed(3),
    slRate: +slRate.toFixed(4),
    standardError: +standardError.toFixed(3),
    positiveWindows,
    negativeWindows,
    recentConflict,
    candleTier: normalizedCandleTier || 'WATCH',
    candleAdjustment,
  };
}
