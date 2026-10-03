export const POST_MOVE_IMPULSE_SIZING_VERSION = 'IMPULSE_TIME_OR_BTC_MARGIN5_ELSE1_V1_20261001';
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
  const marginUsdt = goodHour || btcAligned ? 5 : 1;
  return {
    version: POST_MOVE_IMPULSE_SIZING_VERSION, evaluatedAt: now, direction, hourVn,
    goodHour, goodHoursVn: windows.map(([a, b]) => `${String(a).padStart(2, '0')}–${String(b).padStart(2, '0')}h`).join(', '),
    btcFresh, btcAligned, btcAgeMs: age, marginUsdt,
    reason: goodHour && btcAligned ? 'GOOD_HOUR_AND_BTC_ALIGNED' : goodHour ? 'GOOD_HOUR' : btcAligned ? 'BTC_ALIGNED' : 'BASE_SIZE',
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
  if (!d || d.version !== POST_MOVE_IMPULSE_SIZING_VERSION) return {
    name: 'SIZE TỰ ĐỘNG · CHƯA CÓ QUYẾT ĐỊNH',
    value: '5 USDT nếu giờ tốt HOẶC BTC cùng hướng; còn lại 1 USDT. Size được tính tại bước xét lệnh mới.',
  };
  const btc = d.btcContext?.btc;
  const pct = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${v}%`;
  const why = d.goodHour && d.btcAligned ? 'Giờ tốt và BTC cùng hướng'
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
      + '\nNếu size nhỏ không đạt min-notional/step Binance: bỏ qua, không tự nâng lên 5 USDT.',
  };
}
