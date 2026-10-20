export const POST_MOVE_IMPULSE_LEGACY_SIZING_VERSION = 'IMPULSE_TIME_OR_BTC_MARGIN5_ELSE1_V1_20261001';
export const POST_MOVE_IMPULSE_PREVIOUS_SIZING_VERSION = 'IMPULSE_TIME_OR_BTC_LONG2_SHORT5_ELSE1_V2_20261013';
export const POST_MOVE_IMPULSE_SIZING_VERSION = 'IMPULSE_LONG2_ELSE1_SHORT_FIXED1_V3_20261020';
export const IMPULSE_BTC_MAX_AGE_MS = 120_000;
export const IMPULSE_GOOD_HOURS_VN = Object.freeze({
  LONG: Object.freeze([[3, 6], [12, 15]]),
  SHORT: Object.freeze([[0, 9], [18, 21]]),
});

function finite(value) {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
}

export function impulseSizing({ side, now = Date.now(), market = null } = {}) {
  const direction = side === 'BUY' ? 'LONG' : side === 'SELL' ? 'SHORT' : side;
  const hourVn = new Date(now + 7 * 60 * 60_000).getUTCHours();
  const windows = IMPULSE_GOOD_HOURS_VN[direction] ?? [];
  const goodHour = windows.some(([start, end]) => hourVn >= start && hourVn < end);
  const evaluatedAt = finite(market?.evaluatedAt);
  const age = evaluatedAt == null ? null : now - evaluatedAt;
  const trend = String(market?.btc?.trend ?? 'UNKNOWN').toUpperCase();
  const btcFresh = age != null && age >= 0 && age <= IMPULSE_BTC_MAX_AGE_MS;
  const btcAligned = btcFresh && ((direction === 'LONG' && trend === 'UP') || (direction === 'SHORT' && trend === 'DOWN'));
  const marginUsdt = direction === 'LONG' && (goodHour || btcAligned) ? 2 : 1;
  return {
    version: POST_MOVE_IMPULSE_SIZING_VERSION, evaluatedAt: now, direction, hourVn,
    goodHour, goodHoursVn: windows.map(([a, b]) => `${String(a).padStart(2, '0')}–${String(b).padStart(2, '0')}h`).join(', '),
    btcFresh, btcAligned, btcAgeMs: age, marginUsdt,
    reason: direction === 'SHORT' ? 'FIXED_SHORT_1_USDT' : goodHour && btcAligned ? 'GOOD_HOUR_AND_BTC_ALIGNED' : goodHour ? 'GOOD_HOUR' : btcAligned ? 'BTC_ALIGNED' : 'BASE_SIZE',
    btcContext: { evaluatedAt, btc: { trend, ret15m: finite(market?.btc?.ret15m), ret1h: finite(market?.btc?.ret1h) } },
  };
}

export function validImpulseSizing(payload) {
  const decision = payload?.impulseSizing;
  if (decision?.version !== POST_MOVE_IMPULSE_SIZING_VERSION || !Number.isFinite(decision.evaluatedAt)) return false;
  const expected = impulseSizing({ side: payload.side, now: decision.evaluatedAt, market: decision.btcContext });
  return ['direction', 'hourVn', 'goodHour', 'btcFresh', 'btcAligned', 'marginUsdt', 'reason']
    .every(key => decision[key] === expected[key]) && Number(payload.marginUsdt) === expected.marginUsdt;
}

export function impulseSizingDiscordField(watch) {
  const d = watch?.impulseSizing;
  // Legacy decisions may be displayed as history, never validated for new orders.
  if (!d || ![POST_MOVE_IMPULSE_SIZING_VERSION, POST_MOVE_IMPULSE_PREVIOUS_SIZING_VERSION, POST_MOVE_IMPULSE_LEGACY_SIZING_VERSION].includes(d.version)) return {
    name: 'SIZE TỰ ĐỘNG · CHƯA CÓ QUYẾT ĐỊNH',
    value: watch?.side === 'SHORT' ? '1 USDT cố định cho SHORT mới, không tăng size theo giờ hoặc BTC; còn chờ bước xét lệnh.'
      : '2 USDT nếu giờ tốt HOẶC BTC cùng hướng; còn lại 1 USDT. Size được tính tại bước xét lệnh mới.',
  };
  const btc = d.btcContext?.btc;
  const pct = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v}%`;
  const fixedShort = d.version === POST_MOVE_IMPULSE_SIZING_VERSION && d.direction === 'SHORT';
  const why = fixedShort ? 'SHORT cố định 1 USDT, không tăng size theo giờ hoặc BTC' : d.goodHour && d.btcAligned ? 'Giờ tốt và BTC cùng hướng'
    : d.goodHour ? 'Đang trong giờ tốt (điều kiện HOẶC)'
      : d.btcAligned ? 'Ngoài giờ tốt nhưng BTC cùng hướng'
        : 'Ngoài giờ tốt và BTC không cùng hướng hoặc thiếu/cũ';
  const status = watch.impulseExecutionStatus;
  return {
    name: `SIZE ${d.marginUsdt} USDT · ${why.toUpperCase()}`,
    value: `**${d.marginUsdt} USDT ký quỹ** · giờ xét ${new Date(d.evaluatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })}`
      + `\nGiờ tốt ${d.direction}: **${d.goodHoursVn} VN** · ${d.goodHour ? 'ĐẠT' : 'ngoài giờ'}`
      + `\nBTC **${btc?.trend ?? 'UNKNOWN'}** · ${!d.btcFresh ? 'thiếu/cũ, không dùng tăng size' : d.btcAligned ? 'cùng hướng' : 'không cùng hướng'}`
      + ` · 15m ${pct(btc?.ret15m)} / 1h ${pct(btc?.ret1h)}`
      + `\n${why}. ${status ? `Trạng thái xét: **${status}** (không xác nhận khớp).` : 'Dự kiến, còn kiểm tra khóa route và điều kiện entry.'}`
      + '\nNếu size nhỏ không đạt min-notional/step Binance: bỏ qua, không tự nâng size.',
  };
}
