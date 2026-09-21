export const EMA99_CONTEXT_VERSION = 'EMA99_MTF_CONTEXT_OBSERVE_V2_1H_4H_20260912';
const durations = { '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000 };
const minimumClosedBars = { '5m': 165, '15m': 165, '1h': 105, '4h': 105 };
const higherTimeframes = ['1h', '4h'];
const higherTimeframeMaxAgeMs = { '1h': 65 * 60_000, '4h': 245 * 60_000 };
const nearPct = 0.1; // Display-only proximity; never an entry threshold.
const pct = (a, b) => (a / b - 1) * 100;
const time = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const price = value => Number(value.toFixed(8)).toString();

function emaSeries(bars, period) {
  const result = [];
  let value = bars.slice(0, period).reduce((sum, b) => sum + b.close, 0) / period;
  for (let i = period - 1; i < bars.length; i++) {
    if (i >= period) value += 2 / (period + 1) * (bars[i].close - value);
    result[i] = value;
  }
  return result;
}

export function emaFrameContext(rows, interval, asOf) {
  const duration = durations[interval];
  const minimumBars = minimumClosedBars[interval];
  const unavailable = reason => ({ interval, available: false, reason });
  if (!duration || !minimumBars || !Number.isFinite(asOf)) return unavailable('Mốc thời gian không hợp lệ');
  // Final OHLC of an unfinished candle must never leak into an earlier signal.
  const bars = (rows ?? []).map(r => ({
    openTime: Number(r.openTime ?? r[0]), closeTime: Number(r.closeTime ?? r[6]),
    close: Number(r.close ?? r[4]),
  })).filter(b => b.closeTime <= asOf);
  if (bars.length < minimumBars) return unavailable(`Thiếu ${minimumBars} nến đã đóng`);
  if (bars.some((b, i) => !Object.values(b).every(Number.isFinite) || b.close <= 0
    || b.closeTime - b.openTime !== duration - 1
    || (i > 0 && b.openTime - bars[i - 1].openTime !== duration))) return unavailable('Chuỗi nến không hợp lệ hoặc bị khuyết');
  if (asOf - bars.at(-1).closeTime >= duration) return unavailable('Cache nến chưa cập nhật tới mốc tín hiệu');
  const series = [13, 25, 99].map(period => emaSeries(bars, period));
  const [e13, e25, e99] = series.map(s => s.at(-1));
  const [p13, p25, p99] = series.map(s => s.at(-2));
  const older99 = series[2].at(-4);
  const spread = (e13 - e25) / e99 * 100;
  const cross = e13 < e25 && p13 >= p25 ? 'DOWN'
    : e13 > e25 && p13 <= p25 ? 'UP' : 'NONE';
  const belowRun = (() => {
    let count = 0;
    for (let i = bars.length - 1; i >= 98; i--) {
      if (!(series[0][i] < series[2][i] && series[1][i] < series[2][i])) break;
      count++;
    }
    return count;
  })();
  const order = [[13, e13], [25, e25], [99, e99]].sort((a, b) => a[1] - b[1]).map(([n]) => `EMA${n}`).join(' < ');
  const closeVs99Pct = pct(bars.at(-1).close, e99);
  const slope99Pct = pct(e99, p99);
  const slope99LookbackPct = pct(e99, older99);
  const bias = closeVs99Pct > 0 && slope99LookbackPct > 0 ? 'BULLISH'
    : closeVs99Pct < 0 && slope99LookbackPct < 0 ? 'BEARISH' : 'MIXED';
  return {
    interval, available: true, closeTime: bars.at(-1).closeTime, barsUsed: bars.length,
    close: bars.at(-1).close, ema13: e13, ema25: e25, ema99: e99, order, cross,
    ema13Vs99Pct: pct(e13, e99), ema25Vs99Pct: pct(e25, e99), spread13To25Pct: spread,
    near25To99: Math.abs(pct(e25, e99)) <= nearPct,
    fastBelow99Bars: belowRun,
    slope13Pct: pct(e13, p13), slope25Pct: pct(e25, p25), slope99Pct,
    slope99LookbackPct, closeVs99Pct, bias,
  };
}

function higherTimeframeAssessment(frames, side) {
  const available = higherTimeframes.map(interval => frames[interval]).filter(frame => frame?.available);
  const bullish = available.filter(frame => frame.bias === 'BULLISH').length;
  const bearish = available.filter(frame => frame.bias === 'BEARISH').length;
  let direction = 'UNAVAILABLE';
  if (available.length) {
    if (bullish === available.length) direction = 'BULLISH';
    else if (bearish === available.length) direction = 'BEARISH';
    else if (bullish && bearish) direction = 'CONFLICT';
    else if (bullish) direction = 'PARTIAL_BULLISH';
    else if (bearish) direction = 'PARTIAL_BEARISH';
    else direction = 'MIXED';
  }
  const signalDirection = side === 'LONG' ? 'BULLISH' : side === 'SHORT' ? 'BEARISH' : null;
  const alignment = direction === signalDirection ? 'ALIGNED'
    : signalDirection && ((direction === 'BULLISH' && signalDirection === 'BEARISH')
      || (direction === 'BEARISH' && signalDirection === 'BULLISH')) ? 'AGAINST'
      : direction === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'MIXED';
  return { direction, alignment, available: available.length, bullish, bearish };
}

export function buildEma99Context(event, rowsByInterval, now = Date.now()) {
  const eventAt = Number(event.confirmedAt ?? event.candleCloseAt);
  const asOf = Math.min(eventAt, now - 1);
  const frames = Object.fromEntries(Object.keys(durations).map(interval => [interval,
    emaFrameContext(rowsByInterval[interval], interval, asOf)]));
  const five = frames['5m'], fifteen = frames['15m'];
  let kind = 'MIXED';
  if (!five.available || !fifteen.available) kind = 'UNAVAILABLE';
  else if (fifteen.cross === 'DOWN' || five.cross === 'DOWN' || five.near25To99
    || five.fastBelow99Bars === 1) kind = 'TRANSITION';
  else if (five.ema13 < five.ema25 && five.fastBelow99Bars >= 2
    && fifteen.ema99 < fifteen.ema13 && fifteen.ema99 < fifteen.ema25) kind = 'PULLBACK_ESTABLISHED';
  const side = event.side === 'SHORT' ? 'SHORT' : 'LONG';
  return { version: EMA99_CONTEXT_VERSION, observeOnly: true, asOf, signalInterval: event.interval,
    side, usesPreviousClosedBar: event.closed !== true, kind, near25To99ThresholdPct: nearPct, frames,
    higherTimeframe: higherTimeframeAssessment(frames, side) };
}

// Fetches only the two higher-timeframe snapshots for a 5m alert that is actually about to be sent.
// This avoids a periodic 400-symbol REST warmup while still making the Discord snapshot self-contained.
export async function enrichFiveMinuteEma99Context(event, cache, now = Date.now()) {
  if (String(event?.interval).toLowerCase() !== '5m' || !event?.symbol || !cache) return event;
  for (const interval of higherTimeframes) {
    const missing = typeof cache.needsRefresh === 'function'
      ? cache.needsRefresh([event.symbol], interval, minimumClosedBars[interval] + 1, higherTimeframeMaxAgeMs[interval], now)
      : ((cache.getIfCached?.(event.symbol, interval, 120)?.length ?? 0) < minimumClosedBars[interval]
        ? [event.symbol] : []);
    if (!missing.length || typeof cache.seed !== 'function') continue;
    await cache.seed(missing, interval, 120, {
      batchSize: 1, batchDelayMs: 0, maxAgeMs: higherTimeframeMaxAgeMs[interval], subscribe: true,
    });
  }
  const rowsByInterval = Object.fromEntries(Object.keys(durations).map(interval => [
    interval, cache.getIfCached?.(event.symbol, interval, 240) ?? [],
  ]));
  return { ...event, emaContext: buildEma99Context(event, rowsByInterval, now) };
}

const styles = {
  PULLBACK_ESTABLISHED: { color: 0x06b6d4, name: 'ĐIỀU CHỈNH 5m ĐÃ HÌNH THÀNH',
    note: '5m: EMA13 < EMA25 < EMA99, cả hai EMA nhanh nằm dưới EMA99 ít nhất 2 nến; 15m vẫn có EMA13/25 trên EMA99. Chưa xác nhận điều chỉnh đã kết thúc.' },
  TRANSITION: { color: 0xa855f7, name: 'CẤU TRÚC ĐANG CHUYỂN TIẾP',
    note: 'Có EMA13 vừa cắt xuống EMA25, EMA25 5m sát EMA99 (≤0,10%), hoặc hai EMA nhanh mới cùng xuống dưới EMA99. Cần theo dõi nhịp giảm có tiếp diễn.' },
  MIXED: { color: 0x3b82f6, name: 'CẤU TRÚC KHÁC / CHƯA ĐỒNG NHẤT', note: 'Đọc thứ tự và giao cắt của từng khung bên dưới.' },
  UNAVAILABLE: { color: 0x64748b, name: 'CHƯA ĐỦ DỮ LIỆU ĐA KHUNG', note: 'Chưa phân loại bối cảnh EMA13/25/99.' },
};

const htfDirectionLabels = {
  BULLISH: '1h + 4h ĐỒNG THUẬN TĂNG', BEARISH: '1h + 4h ĐỒNG THUẬN GIẢM',
  PARTIAL_BULLISH: 'HTF NGHIÊNG TĂNG MỘT PHẦN', PARTIAL_BEARISH: 'HTF NGHIÊNG GIẢM MỘT PHẦN',
  CONFLICT: '1h / 4h XUNG ĐỘT', MIXED: '1h / 4h CHƯA RÕ', UNAVAILABLE: 'HTF CHƯA ĐỦ DỮ LIỆU',
};

export function ema99ContextEmbed(context, { includeHigherTimeframes = false } = {}) {
  if (context?.version !== EMA99_CONTEXT_VERSION) return null;
  const style = styles[context.kind] ?? styles.UNAVAILABLE;
  const shownIntervals = includeHigherTimeframes ? Object.keys(durations) : ['5m', '15m'];
  const htf = context.higherTimeframe;
  const htfText = includeHigherTimeframes
    ? `\n**HTF: ${htfDirectionLabels[htf?.direction] ?? htfDirectionLabels.UNAVAILABLE}** · so với tín hiệu ${context.side}: ${htf?.alignment === 'ALIGNED' ? 'đồng hướng' : htf?.alignment === 'AGAINST' ? 'ngược hướng' : 'chưa đồng thuận'}.`
    : '';
  return {
    title: `${context.side} · EMA13 / EMA25 / EMA99 · ${style.name}`, color: style.color,
    description: `${style.note}${htfText}\nMốc phân tích ${time(context.asOf)} (VN) · tín hiệu ${context.signalInterval}. ${context.usesPreviousClosedBar ? 'Tín hiệu đang chạy: dùng EMA của nến đã đóng trước đó.' : 'Chỉ dùng nến đã đóng tại mốc tín hiệu.'}`,
    fields: shownIntervals.map(interval => {
      const f = context.frames[interval];
      if (!f?.available) return { name: interval, value: f?.reason ?? 'Thiếu dữ liệu' };
      const cross = f.cross === 'DOWN' ? 'EMA13 VỪA CẮT XUỐNG EMA25 ở nến này'
        : f.cross === 'UP' ? 'EMA13 VỪA CẮT LÊN EMA25 ở nến này'
        : f.ema13 < f.ema25 ? 'EMA13 đã dưới EMA25 từ nến trước' : f.ema13 > f.ema25 ? 'EMA13 đã trên EMA25 từ nến trước' : 'EMA13 = EMA25';
      return { name: `${interval} · ${f.order}`, value:
        `EMA13 **${price(f.ema13)}** · EMA25 **${price(f.ema25)}** · EMA99 **${price(f.ema99)}**\n`
        + `${cross}.\nĐộ lệch với EMA99: EMA13 ${f.ema13Vs99Pct.toFixed(2)}% · EMA25 ${f.ema25Vs99Pct.toFixed(2)}%.`
        + `\nCả EMA13/25 dưới EMA99: ${f.fastBelow99Bars} nến liên tiếp${f.near25To99 ? ' · EMA25 sát EMA99' : ''}.`
        + `\nGiá đóng ${price(f.close)} (${f.closeVs99Pct >= 0 ? '+' : ''}${f.closeVs99Pct.toFixed(2)}% so EMA99)`
        + ` · EMA99 ${f.slope99LookbackPct >= 0 ? '+' : ''}${f.slope99LookbackPct.toFixed(2)}% / 3 nến.`
        + `\nĐánh giá khung: ${f.bias === 'BULLISH' ? 'TĂNG' : f.bias === 'BEARISH' ? 'GIẢM' : 'TRỘN / CHƯA RÕ'} · nến đóng ${time(f.closeTime)} (VN).` };
    }),
    footer: { text: '1h/4h chỉ là bối cảnh quan sát, không đổi gate/entry/size/TP/SL. EMA có thể lệch nhẹ theo số nến khởi tạo.' },
  };
}
