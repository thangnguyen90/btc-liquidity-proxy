export const BTC_SESSION_VERSION = 'BTC_SESSION_OBSERVE_V1_20260926';
export const BTC_SESSION_CONTEXT_RULE_VERSION = 'BTC_SESSION_CONTEXT_V2_IGNORE_LONG_MARKET_REGIME_20260926';
export const SESSION_NAMES = { NIGHT: '20h–02h · ưu tiên quan sát', MORNING: '06h–08h · theo dõi', OTHER: 'Giờ còn lại' };
const num = (v) => v == null || v === '' ? NaN : Number(v);
export function sessionAt(now = Date.now()) {
  const d = new Date(now + 7 * 3600000), h = d.getUTCHours();
  return { key: h >= 20 || h < 2 ? 'NIGHT' : h >= 6 && h < 8 ? 'MORNING' : 'OTHER', weekend: [0, 6].includes(d.getUTCDay()) };
}
export function sessionCardKey(side, window) {
  return ['LONG', 'SHORT'].includes(side) && Object.hasOwn(SESSION_NAMES, window) ? `btc-session:${side}:${window}` : null;
}
export function sessionWhitelistEligible(stats) {
  return stats?.version === BTC_SESSION_VERSION && num(stats.closed) > 0 && num(stats.avgRoe) > 4;
}
export function sessionTradeKey(trade) {
  const s = trade?.btcSessionObservation;
  return s?.version === BTC_SESSION_VERSION && s.side === trade.side ? sessionCardKey(s.side, s.window) : null;
}
export function fresh(at, now, maxAge) {
  return Number.isFinite(num(at)) && num(at) <= now + 5000 && now - num(at) <= maxAge;
}
export function btcContext(health, now = Date.now()) {
  if (!fresh(health?.updatedAt, now, 120000)) return { direction: 'UNKNOWN', label: 'BTC thiếu/cũ dữ liệu' };
  const direction = String(health.btcTrendDir ?? '').toUpperCase();
  return ['UP', 'DOWN'].includes(direction) ? { direction, label: direction === 'UP' ? 'BTC thiên tăng' : 'BTC thiên giảm' } : { direction: 'NEUTRAL', label: 'BTC chưa rõ hướng' };
}
export function buildSessionRows(payload, health, ticks = new Map(), now = Date.now(), window = 'AUTO') {
  const current = sessionAt(now), selected = window === 'AUTO' ? current.key : window;
  const btc = btcContext(health, now);
  const sides = new Map();
  for (const c of payload?.candidates ?? []) {
    if (c.retainedOnly) continue;
    if (!sides.has(c.symbol)) sides.set(c.symbol, new Set());
    sides.get(c.symbol).add(c.side);
  }
  return (payload?.candidates ?? []).filter(c => ['LONG', 'SHORT'].includes(c.side) && typeof c.symbol === 'string').map(c => {
    const tick = ticks.get(c.symbol), live = fresh(tick?.eventAt, now, 10000) && num(tick?.markPrice) > 0;
    const price = live ? num(tick.markPrice) : num(c.lastClosed5m);
    const low = num(c.entryZone?.low), high = num(c.entryZone?.high), middle = num(c.entryPrice), level = num(c.referenceLevel);
    const validZone = low > 0 && high >= low && middle >= low && middle <= high && level > 0;
    const stale = !fresh(payload?.generatedAt, now, 90000) || !fresh(c.lastClosed5mAt, now, 12 * 60000);
    const aligned = (c.side === 'LONG' && btc.direction === 'UP') || (c.side === 'SHORT' && btc.direction === 'DOWN');
    const broken = validZone && price > 0 && (c.side === 'LONG' ? price < level : price > level);
    const inZone = validZone && price >= low && price <= high;
    const dual = sides.get(c.symbol)?.size > 1;
    const retested = fresh(c.retestAt, now, 6 * 3600000) && num(c.retestAt) >= num(c.confirmationAt);
    let status, rank = 0;
    if (c.retainedOnly) status = `ĐÃ LƯU ${c.side} · CHỜ NGUỒN TRỞ LẠI`;
    else if (stale || !validZone) status = 'DỮ LIỆU CŨ / THIẾU';
    else if (broken) status = 'GIÁ ĐÃ PHÁ MỐC';
    else if (dual) status = 'HAI CHIỀU · CHỜ';
    else if (!live) status = 'CHỜ GIÁ LIVE';
    else if (btc.direction === 'UNKNOWN' || btc.direction === 'NEUTRAL') status = 'CHỜ BTC RÕ HƯỚNG';
    else if (!aligned) status = 'NGƯỢC HƯỚNG BTC';
    else if (selected !== current.key) status = 'NGOÀI KHUNG ĐÃ CHỌN';
    else if (!retested) { status = 'CHỜ RETEST 5m ĐÓNG'; rank = 1; }
    else if (!inZone) { status = 'CHỜ GIÁ VỀ VÙNG · KHÔNG ĐUỔI'; rank = 2; }
    else { status = 'TRONG VÙNG · CÙNG BTC'; rank = 3; }
    const contextClass = c.retainedOnly ? 'watch-retained' : rank === 3 ? (c.side === 'LONG' ? 'context-long-ready' : 'context-short-ready') : '';
    return { ...c, price, live, low, high, middle, validZone, level, stale, aligned, broken, dual, inZone, rank, status, contextClass,
      distance: validZone && price > 0 ? (middle / price - 1) * 100 : null,
      window: selected, whitelistKey: sessionCardKey(c.side, selected),
      observeOnly: true, binanceEligible: false, executionEligible: false };
  }).sort((a, b) => b.rank - a.rank || num(b.entryScore) - num(a.entryScore) || a.symbol.localeCompare(b.symbol));
}
