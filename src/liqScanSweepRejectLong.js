export const LIQ_SCAN_SWEEP_REJECT_LONG_VERSION = 'LIQ_SCAN_SWEEP_REJECT_LONG_OBSERVE_V1_20261001';

export function assessLiqScanSweepRejectLong(analysis, alert, now = Date.now()) {
  const out = {
    version: LIQ_SCAN_SWEEP_REJECT_LONG_VERSION, observeOnly: true, side: 'LONG',
    state: 'WAIT_ALERT', ready: false, message: 'Chờ cảnh báo LiqScan phía dưới để cố định vùng quét.',
    alertAt: alert?.evaluatedAt ?? null, zone: null, sweepAt: null, rejectAt: null, confirmationAt: null,
    entry: null, takeProfit: null, invalidation: null, rewardRisk: null, checks: [],
    notes: ['Đánh giá quan sát, không tự phát lệnh Binance.', 'Chỉ xét nến đóng hoàn toàn sau lúc báo.'],
  };
  const at = Date.parse(alert?.evaluatedAt);
  const zone = alert?.killZoneCluster?.mainKillZone;
  if (alert?.symbol !== analysis?.symbol || alert?.dominantSide !== 'BELOW' || !alert?.isAlert
    || !Number.isFinite(at) || !(zone?.high < alert.markPrice) || !(zone.high >= zone.low)) return out;
  out.zone = { low: zone.low, high: zone.high };
  if (now - at < 0 || now - at > 6 * 60 * 60_000) {
    return { ...out, state: 'EXPIRED', message: 'Cảnh báo gốc đã hết cửa sổ theo dõi 6 giờ.' };
  }
  const valid = bar => bar && bar.openTime >= at && bar.closeTime < now
    && [bar.open, bar.high, bar.low, bar.close].every(value => Number.isFinite(value) && value > 0)
    && bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close);
  const bars = (analysis?.liqScanCandleContext?.['5m'] ?? []).filter(valid).sort((a, b) => a.openTime - b.openTime);
  const bars15 = (analysis?.liqScanCandleContext?.['15m'] ?? []).filter(valid).sort((a, b) => a.openTime - b.openTime);
  const mark = analysis?.market?.markPrice;
  const atr = analysis?.trend?.frames?.find(frame => frame.interval === '5m')?.atr14;
  const age = now - Date.parse(analysis?.generatedAt);
  const fresh = !analysis?.freshness?.stale && age >= 0 && age <= 90_000 && bars.length
    && now - bars.at(-1).closeTime <= 6 * 60_000 && bars15.length
    && now - bars15.at(-1).closeTime <= 16 * 60_000;
  if (!fresh || !(mark > 0) || !(atr > 0)) {
    return { ...out, state: 'MISSING_DATA', message: 'Chờ đủ nến 5m/15m đã đóng và dữ liệu mới để kiểm tra.' };
  }
  if (bars.some((bar, index) => index > 0 && bar.openTime - bars[index - 1].openTime !== 300_000)
    || bars15.some((bar, index) => index > 0 && bar.openTime - bars15[index - 1].openTime !== 900_000)) {
    return { ...out, state: 'MISSING_DATA', message: 'Nến có khoảng trống; chưa xác nhận thứ tự quét và reject.' };
  }
  const sweepIndex = bars.findIndex(bar => bar.low <= zone.high && bar.high >= zone.low);
  if (sweepIndex < 0) return { ...out, state: 'WAIT_SWEEP', message: 'Chờ giá quét vùng dưới đã lưu.' };
  out.sweepAt = bars[sweepIndex].closeTime;
  const after = bars.slice(sweepIndex);
  const accepted = bars15.find(bar => bar.closeTime >= out.sweepAt && bar.close < zone.low
    && bars.some(retest => retest.openTime > bar.closeTime && retest.high <= zone.low
      && retest.high >= zone.low - atr * 0.25 && retest.close < zone.low));
  if (accepted) {
    return { ...out, state: 'CANCELLED_ACCEPTED', message: 'Nến 15m giữ dưới vùng và retest 5m thất bại: hủy kịch bản LONG.' };
  }
  const rejectIndex = after.findIndex(bar => bar.close > zone.high && bar.close > bar.open);
  if (rejectIndex < 0) {
    return { ...out, state: 'SWEPT_WAIT_REJECT', message: 'Đã quét vùng dưới; chờ nến 5m đóng xanh trở lại trên mép vùng.' };
  }
  const reject = after[rejectIndex];
  out.rejectAt = reject.closeTime;
  const confirm = after.slice(rejectIndex + 1)
    .find(bar => bar.close > zone.high && bar.close > bar.open && (bar.close > reject.high || bar.low <= zone.high));
  if (!confirm) {
    return { ...out, state: 'REJECTED_WAIT_CONFIRMATION', message: 'Đã reject; chờ nến tiếp theo phá đỉnh reject hoặc retest mép vùng giữ được.' };
  }
  out.confirmationAt = confirm.closeTime;
  const trough = Math.min(zone.low, ...bars
    .filter(bar => bar.closeTime >= out.sweepAt && bar.closeTime <= confirm.closeTime)
    .map(bar => bar.low));
  out.invalidation = trough - atr * 0.25;
  if (bars.some(bar => bar.openTime > confirm.closeTime && bar.low <= out.invalidation) || mark <= out.invalidation) {
    return { ...out, state: 'INVALIDATED', message: 'Giá đã xuống dưới mức vô hiệu sau đáy quét; kịch bản LONG không còn hiệu lực.' };
  }
  out.entry = mark;
  out.takeProfit = [alert.markPrice, ...(analysis?.zones?.resistances ?? []).map(zoneItem => zoneItem.low)]
    .filter(value => Number.isFinite(value) && value > mark).sort((a, b) => a - b)[0] ?? null;
  out.rewardRisk = out.takeProfit ? (out.takeProfit - mark) / (mark - out.invalidation) : null;
  const buyPct = confirm.quoteVolume > 0 && confirm.takerBuyQuoteVolume >= 0
    ? confirm.takerBuyQuoteVolume / confirm.quoteVolume * 100 : null;
  out.takerBuyPct = buyPct;
  out.checks = [
    { label: 'Xác nhận còn mới (≤15 phút)', pass: now - confirm.closeTime <= 15 * 60_000 },
    { label: 'Giá còn trên vùng reject', pass: mark > zone.high },
    { label: 'Không đuổi quá 0,5 ATR từ nến xác nhận', pass: Math.abs(mark - confirm.close) <= atr * 0.5 },
    { label: 'Nến 15m mới nhất đóng trên mép vùng', pass: bars15.at(-1).close > zone.high },
    { label: 'Taker mua ≥55% ở nến xác nhận', pass: buyPct != null && buyPct >= 55 && buyPct <= 100 },
    { label: 'TP gần có R:R ≥1,2', pass: out.rewardRisk != null && out.rewardRisk >= 1.2 },
  ];
  out.ready = out.checks.every(check => check.pass);
  out.state = out.ready ? 'LONG_SETUP_CONFIRMED' : 'WATCH_NO_CHASE';
  out.message = out.ready
    ? 'Đủ điều kiện quan sát LONG sau quét và reject.'
    : 'Đã có quét/reject nhưng chưa đủ điều kiện vào; xem các mục còn thiếu.';
  return out;
}
