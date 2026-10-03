export const DUMP_RESISTANCE_VERSION = 'DUMP_CAP_RESISTANCE_V1_20260927';
export const RESISTANCE_LABELS = Object.freeze({
  READY: 'KHÁNG CỰ SHORT · CÒN ĐIỂM VÀO',
  WAIT_RETEST: 'CHỜ RETEST · KHÔNG ĐUỔI',
  WAIT_CONFIRM: 'CHỜ NẾN GIỮ KHÁNG CỰ',
  BROKEN: 'KHÁNG CỰ HỎNG',
  NO_ROOM: 'KHÔNG ĐỦ DƯ ĐỊA',
  WAIT_LIVE: 'CHỜ GIÁ LIVE',
  STALE: 'DỮ LIỆU CŨ',
  NO_RESISTANCE: 'CHƯA CÓ VÙNG KHÁNG CỰ',
});
export const RESISTANCE_TYPES = Object.freeze({
  CAP: 'Đỉnh nến xả',
  SWING_HIGH: 'Đỉnh hồi đã xác nhận',
  BASE_BREAK: 'Đáy nền đã phá',
});

export function dumpResistanceKey(interval, status) {
  return ['5m', '15m', '1h', '4h', '1d'].includes(interval) && Object.hasOwn(RESISTANCE_LABELS, status)
    ? `dump-resistance:${interval}:${status}` : null;
}

export function dumpResistanceTradeKey(trade = {}) {
  const observation = trade.dumpResistanceObservation;
  return trade.side === 'SHORT' && observation?.version === DUMP_RESISTANCE_VERSION
    ? dumpResistanceKey(observation.interval, observation.status)
    : null;
}

export function resistanceNetRR(entry, stop, target) {
  if (![entry, stop, target].every(Number.isFinite) || !(stop > entry && entry > target && target > 0)) return null;
  const cost = entry * 0.0012;
  return (entry - target - cost) / (stop - entry + cost);
}

// Shared by browser, notifier and tests. A closed-candle confirmation never implies a live pass by itself.
export function liveDumpResistance(plan, tick, { now = Date.now(), snapshotAt, invalidated = false } = {}) {
  if (!plan || plan.version !== DUMP_RESISTANCE_VERSION) return { status: 'NO_RESISTANCE' };
  if (!(snapshotAt > 0) || !Number.isFinite(plan.expiresAt) || now < snapshotAt
    || now - snapshotAt > 90000 || now > plan.expiresAt) return { status: 'STALE' };
  if (invalidated || plan.status === 'BROKEN') return { status: 'BROKEN' };
  const fresh = tick && Number.isFinite(tick.markPrice) && tick.markPrice > 0
    && tick.eventAt <= now + 2000 && now - tick.eventAt <= 15000;
  if (fresh && plan.stop > 0 && tick.markPrice >= plan.stop) return { status: 'BROKEN' };
  if (!plan.confirmedAt) return { status: plan.status };
  if (![plan.entry, plan.entryLow, plan.entryHigh, plan.stop, plan.zoneLow, plan.atr].every(Number.isFinite)
    || plan.confirmedAt > now || !(plan.atr > 0)) return { status: 'WAIT_CONFIRM' };
  if (!fresh) return { status: 'WAIT_LIVE' };
  const mark = tick.markPrice;
  const rr = resistanceNetRR(mark, plan.stop, plan.target);
  const distancePct = (plan.zoneLow / mark - 1) * 100;
  if (!(plan.rr >= 1.5)) return { status: 'NO_ROOM', rr, distancePct };
  if (mark < plan.entryLow || mark > plan.entryHigh || plan.zoneLow - mark > plan.atr) {
    return { status: 'WAIT_RETEST', rr, distancePct };
  }
  if (!(rr >= 1.5)) return { status: 'NO_ROOM', rr, distancePct };
  return { status: 'READY', rr, distancePct, entry: plan.entry, live: mark };
}
