export const PUMP_SUPPORT_VERSION = 'PUMP_BASE_SUPPORT_V1_20260927';
export const SUPPORT_LABELS = Object.freeze({ READY: 'HỖ TRỢ LONG · CÒN ĐIỂM VÀO', WAIT_RETEST: 'CHỜ RETEST · KHÔNG ĐUỔI', WAIT_CONFIRM: 'CHỜ NẾN GIỮ HỖ TRỢ', BROKEN: 'HỖ TRỢ HỎNG', NO_ROOM: 'KHÔNG ĐỦ DƯ ĐỊA', WAIT_LIVE: 'CHỜ GIÁ LIVE', STALE: 'DỮ LIỆU CŨ', NO_SUPPORT: 'CHƯA CÓ VÙNG HỖ TRỢ' });
export const SUPPORT_TYPES = Object.freeze({ FOOT: 'Chân nến bơm', SWING_LOW: 'Đáy hồi đã xác nhận', BASE_BREAK: 'Đỉnh nền đã phá' });
export function pumpSupportKey(interval, status) {
  return ['5m','15m','1h','4h','1d'].includes(interval) && Object.hasOwn(SUPPORT_LABELS,status) ? `pump-support:${interval}:${status}` : null;
}
export function pumpSupportTradeKey(trade = {}) {
  const s = trade.pumpSupportObservation;
  return trade.side === 'LONG' && s?.version === PUMP_SUPPORT_VERSION ? pumpSupportKey(s.interval,s.status) : null;
}
export function supportNetRR(entry, stop, target) {
  if (![entry,stop,target].every(Number.isFinite) || !(entry > stop && stop > 0 && target > entry)) return null;
  const cost = entry * 0.0012;
  return (target-entry-cost)/(entry-stop+cost);
}
// Identical browser/test logic. Snapshot confirmation alone must never paint a live-ready row.
export function livePumpSupport(plan, tick, { now = Date.now(), snapshotAt, invalidated = false } = {}) {
  if (!plan || plan.version !== PUMP_SUPPORT_VERSION) return { status:'NO_SUPPORT' };
  if (!(snapshotAt > 0) || !Number.isFinite(plan.expiresAt) || now < snapshotAt || now-snapshotAt > 90000 || now > plan.expiresAt) return { status:'STALE' };
  if (invalidated || plan.status === 'BROKEN') return { status:'BROKEN' };
  const fresh = tick && Number.isFinite(tick.markPrice) && tick.markPrice > 0 && tick.eventAt <= now+2000 && now-tick.eventAt <= 15000;
  if (fresh && plan.stop > 0 && tick.markPrice <= plan.stop) return { status:'BROKEN' };
  if (!plan.confirmedAt) return { status:plan.status };
  if (![plan.entry,plan.entryLow,plan.entryHigh,plan.stop,plan.zoneHigh,plan.atr].every(Number.isFinite)
    || plan.confirmedAt > now || !(plan.atr > 0)) return { status:'WAIT_CONFIRM' };
  if (!fresh) return { status:'WAIT_LIVE' };
  const mark=tick.markPrice, rr=supportNetRR(mark,plan.stop,plan.target);
  const distancePct=(mark/plan.zoneHigh-1)*100;
  if (!(plan.rr >= 1.5)) return { status:'NO_ROOM', rr, distancePct };
  if (mark < plan.entryLow || mark > plan.entryHigh || mark-plan.zoneHigh > plan.atr) return { status:'WAIT_RETEST', rr, distancePct };
  if (!(rr >= 1.5)) return { status:'NO_ROOM', rr, distancePct };
  return { status:'READY', rr, distancePct, entry:plan.entry, live:mark };
}
