export const LIQ_SCAN_SWEEP_REJECT_SHORT_VERSION = 'LIQ_SCAN_SWEEP_REJECT_SHORT_OBSERVE_V1_20260906';

export function assessLiqScanSweepRejectShort(analysis, alert, now = Date.now()) {
  const out = {
    version: LIQ_SCAN_SWEEP_REJECT_SHORT_VERSION, observeOnly: true, side: 'SHORT',
    state: 'WAIT_ALERT', ready: false, message: 'Chờ cảnh báo LiqScan phía trên để cố định vùng quét.',
    alertAt: alert?.evaluatedAt ?? null, zone: null, sweepAt: null, rejectAt: null, confirmationAt: null,
    entry: null, takeProfit: null, invalidation: null, rewardRisk: null, checks: [],
    notes: ['Đánh giá thử, chưa backtest rule vào lệnh; không tự phát lệnh Binance.', 'Chỉ xét nến đóng hoàn toàn sau lúc báo; cú quét trong nến chứa alert có thể chưa được xác nhận.'],
  };
  const at = Date.parse(alert?.evaluatedAt), zone = alert?.killZoneCluster?.mainKillZone;
  if (alert?.symbol !== analysis?.symbol || alert?.dominantSide !== 'ABOVE' || !alert?.isAlert
    || !Number.isFinite(at) || !(zone?.low > alert.markPrice) || !(zone.high >= zone.low)) return out;
  out.zone = { low: zone.low, high: zone.high };
  if (now-at<0 || now-at>6*60*60_000) return { ...out, state: 'EXPIRED', message: 'Cảnh báo gốc đã hết cửa sổ theo dõi 6 giờ.' };
  const valid = b => b && b.openTime>=at && b.closeTime<now
    && [b.open,b.high,b.low,b.close].every(v=>Number.isFinite(v)&&v>0)
    && b.high>=Math.max(b.open,b.close) && b.low<=Math.min(b.open,b.close);
  const bars = (analysis?.liqScanCandleContext?.['5m']??[]).filter(valid).sort((a,b)=>a.openTime-b.openTime);
  const bars15 = (analysis?.liqScanCandleContext?.['15m']??[]).filter(valid).sort((a,b)=>a.openTime-b.openTime);
  const mark = analysis?.market?.markPrice, atr = analysis?.trend?.frames?.find(f=>f.interval==='5m')?.atr14;
  const age = now-Date.parse(analysis?.generatedAt);
  const fresh = !analysis?.freshness?.stale && age>=0 && age<=90_000 && bars.length && now-bars.at(-1).closeTime<=6*60_000
    && bars15.length && now-bars15.at(-1).closeTime<=16*60_000;
  if (!fresh || !(mark>0) || !(atr>0)) return { ...out, state: 'MISSING_DATA', message: 'Chờ đủ nến 5m/15m đã đóng và dữ liệu mới để kiểm tra.' };
  if (bars.some((b,i)=>i>0&&b.openTime-bars[i-1].openTime!==300_000)
    || bars15.some((b,i)=>i>0&&b.openTime-bars15[i-1].openTime!==900_000)) return { ...out, state: 'MISSING_DATA', message: 'Nến có khoảng trống; chưa xác nhận thứ tự quét và reject.' };
  const sweepIndex = bars.findIndex(b=>b.high>=zone.low&&b.low<=zone.high);
  if (sweepIndex<0) return { ...out, state: 'WAIT_SWEEP', message: 'Chờ giá quét vùng trên đã lưu; chưa SHORT khi giá đang kéo.' };
  out.sweepAt = bars[sweepIndex].closeTime;
  const after = bars.slice(sweepIndex);
  const accepted = bars15.find(b=>b.closeTime>=out.sweepAt&&b.close>zone.high
    && bars.some(r=>r.openTime>b.closeTime&&r.low>=zone.high&&r.low<=zone.high+atr*0.25&&r.close>zone.high));
  if (accepted) return { ...out, state: 'CANCELLED_ACCEPTED', message: 'Nến 15m giữ trên vùng và retest 5m thành công: hủy kịch bản SHORT của cảnh báo này.' };
  const ri = after.findIndex(b=>b.close<zone.low&&b.close<b.open);
  if (ri<0) return { ...out, state: 'SWEPT_WAIT_REJECT', message: 'Đã quét vùng trên; chờ nến 5m đóng đỏ trở lại dưới mép vùng.' };
  const reject = after[ri];
  out.rejectAt = reject.closeTime;
  const confirm = after.slice(ri+1).find(b=>b.close<zone.low&&b.close<b.open&&(b.close<reject.low||b.high>=zone.low));
  if (!confirm) return { ...out, state: 'REJECTED_WAIT_CONFIRMATION', message: 'Đã reject; chờ nến tiếp theo phá đáy reject hoặc retest mép vùng thất bại.' };
  out.confirmationAt = confirm.closeTime;
  const peak = Math.max(zone.high,...bars.filter(b=>b.closeTime>=out.sweepAt&&b.closeTime<=confirm.closeTime).map(b=>b.high));
  out.invalidation = peak+atr*0.25;
  if (bars.some(b=>b.openTime>confirm.closeTime&&b.high>=out.invalidation)||mark>=out.invalidation)
    return { ...out, state: 'INVALIDATED', message: 'Giá đã vượt mức vô hiệu trên đỉnh quét; kịch bản SHORT này không còn hiệu lực.' };
  out.entry = mark;
  out.takeProfit = [alert.markPrice,...(analysis?.zones?.supports??[]).map(z=>z.high)]
    .filter(v=>Number.isFinite(v)&&v>0&&v<mark).sort((a,b)=>b-a)[0]??null;
  out.rewardRisk = out.takeProfit ? (mark-out.takeProfit)/(out.invalidation-mark) : null;
  const sellPct = confirm.quoteVolume>0&&confirm.takerBuyQuoteVolume>0 ? (1-confirm.takerBuyQuoteVolume/confirm.quoteVolume)*100 : null;
  out.takerSellPct = sellPct;
  out.checks = [
    { label: 'Xác nhận còn mới (≤15 phút)', pass: now-confirm.closeTime<=15*60_000 },
    { label: 'Giá còn dưới vùng reject', pass: mark<zone.low },
    { label: 'Không đuổi quá 0,5 ATR từ nến xác nhận', pass: Math.abs(mark-confirm.close)<=atr*0.5 },
    { label: 'Nến 15m mới nhất đóng dưới mép vùng', pass: bars15.at(-1).close<zone.low },
    { label: 'Taker bán ≥55% ở nến xác nhận', pass: sellPct!=null&&sellPct>=55&&sellPct<=100 },
    { label: 'TP gần có R:R ≥1,2', pass: out.rewardRisk!=null&&out.rewardRisk>=1.2 },
  ];
  out.ready = out.checks.every(c=>c.pass);
  out.state = out.ready ? 'SHORT_SETUP_CONFIRMED' : 'WATCH_NO_CHASE';
  out.message = out.ready ? 'Đủ điều kiện quan sát SHORT sau quét và reject; các mức dưới đây là tham khảo.'
    : 'Đã có quét/reject nhưng chưa đủ điều kiện vào; xem các mục còn thiếu bên dưới.';
  return out;
}
