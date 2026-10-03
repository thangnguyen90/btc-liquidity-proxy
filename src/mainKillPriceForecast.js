export const MAIN_KILL_PRICE_FORECAST_VERSION = 'MAIN_KILL_PRICE_FORECAST_V1_CONDITIONAL_20261002';

const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const timestamp = value => typeof value === 'number' ? value : Date.parse(value);
const bounds = zone => {
  const low = numeric(zone?.low ?? zone?.price ?? zone?.mid);
  const high = numeric(zone?.high ?? zone?.price ?? zone?.mid);
  return low > 0 && high > 0 ? { low: Math.min(low, high), high: Math.max(low, high) } : null;
};

// Conditional price scenarios from the existing snapshot; no model call or execution route.
export function buildMainKillPriceForecast({ analysis = {}, gap = {}, evaluation = {}, now = Date.now() } = {}) {
  const sourceAt = timestamp(analysis.generatedAt);
  const ageMs = Number.isFinite(sourceAt) ? now - sourceAt : null;
  const result = {
    version: MAIN_KILL_PRICE_FORECAST_VERSION,
    source: 'COIN_LEVEL_CLOSED_CANDLES_AND_BINANCE_DEPTH',
    observeOnly: true, binanceEligible: false,
    generatedAt: now, sourceAt: Number.isFinite(sourceAt) ? sourceAt : null,
    horizon: '15m–1h', direction: null, target: null, nextTarget: null,
    invalidation: null, condition: null, reasons: [],
    btcContext: null,
  };
  const evalAge = now - timestamp(evaluation.evaluatedAt);
  if (Number.isFinite(evalAge) && evalAge >= 0 && evalAge <= 20 * 60_000) {
    result.btcContext = { regime: evaluation.marketRegime ?? null, bias: evaluation.marketBias ?? null, at: evaluation.evaluatedAt };
  }
  if (analysis.freshness?.stale === true || ageMs == null || ageMs < -60_000 || ageMs > 5 * 60_000) {
    result.reasons.push('Cần snapshot mới để dự báo giá.');
    return result;
  }
  const frames = analysis.trend?.frames ?? [];
  const frame = interval => frames.find(item => item.interval === interval);
  const freshFrame = (item, duration) => {
    const closeAt = numeric(item?.closeTime);
    return closeAt != null && closeAt < now && now - closeAt <= duration + 60_000;
  };
  const m5 = frame('5m');
  const m15 = frame('15m');
  const h1 = frame('1h');
  if (!freshFrame(m5, 5 * 60_000) || !freshFrame(m15, 15 * 60_000)) {
    result.reasons.push('Thiếu nến 5m/15m đã đóng còn mới.');
    return result;
  }
  const mark = numeric(analysis.market?.markPrice);
  if (!(mark > 0)) return result;
  if (!['UP', 'DOWN'].includes(m15.state) || m5.state !== m15.state) {
    result.reasons.push(`5m ${m5.state ?? '—'} · 15m ${m15.state ?? '—'} chưa đồng thuận.`);
    result.condition = 'Chờ 5m và 15m đóng cùng hướng rồi đánh giá lại vùng giá.';
    return result;
  }
  result.direction = m15.state;
  const up = result.direction === 'UP';
  const direction = up ? 'UPPER' : 'LOWER';
  result.reasons.push(`Nến đóng 5m/15m cùng ${up ? 'tăng' : 'giảm'}.`);
  if (freshFrame(h1, 60 * 60_000)) result.reasons.push(`Khung 1h ${h1.state ?? 'MIXED'}${['UP', 'DOWN'].includes(h1.state) && h1.state !== result.direction ? ': nhịp ngắn hạn ngược khung lớn' : ''}.`);
  const inDirection = zone => up ? zone.low > mark : zone.high < mark;
  const distance = zone => up ? zone.low - mark : mark - zone.high;
  const levels = (analysis.zones?.[up ? 'resistances' : 'supports'] ?? [])
    .map(bounds).filter(zone => zone && inDirection(zone)).map(zone => ({ ...zone, source: up ? 'RESISTANCE' : 'SUPPORT' }));
  const key = up ? 'askZones' : 'bidZones';
  for (const layer of ['near', 'wide']) {
    for (const zone of analysis.orderBookProfile?.[layer]?.[key] ?? []) {
      const range = bounds(zone);
      if (range && inDirection(range) && numeric(zone.orderBookNotional) > 0) levels.push({ ...range, source: 'BINANCE_DEPTH' });
    }
  }
  const main = bounds(gap.mainKillZone);
  const mainEligible = main && gap.lifecycle?.active === true && gap.direction === direction && inDirection(main);
  if (mainEligible) levels.push({ ...main, source: 'MAIN_KILL' });
  levels.sort((a, b) => distance(a) - distance(b));
  const target = levels[0];
  if (target) {
    result.target = { ...target, distancePct: Number((distance(target) / mark * 100).toFixed(3)) };
    // MAIN is a later scenario only if its near edge is beyond the first obstacle.
    if (mainEligible && (up ? main.low > target.high : main.high < target.low)) {
      result.nextTarget = { ...main, source: 'MAIN_KILL' };
    }
    result.condition = target.source === 'MAIN_KILL'
      ? '5m/15m tiếp tục cùng hướng và giữ cấu trúc hiện tại; theo dõi phản ứng tại MAIN.'
      : `Theo dõi phản ứng tại vùng đầu; chỉ xét đi tiếp sau nến 15m đóng ${up ? 'trên' : 'dưới'} toàn vùng và retest 5m giữ được.`;
  } else {
    result.reasons.push('Chưa có vùng giá phía trước hợp lệ trong snapshot.');
  }
  const opposing = (analysis.zones?.[up ? 'supports' : 'resistances'] ?? []).map(bounds)
    .filter(zone => zone && (up ? zone.high < mark : zone.low > mark))
    .sort((a, b) => up ? b.high - a.high : a.low - b.low)[0];
  if (opposing) result.invalidation = { price: up ? opposing.low : opposing.high, closeInterval: '15m', crossing: up ? 'BELOW' : 'ABOVE' };
  if (gap.direction && gap.direction !== direction && gap.lifecycle?.active) result.reasons.push('MAIN ngược hướng nến: chỉ là lực hút đối nghịch.');
  if (mainEligible && !gap.depth?.coverageEnough) result.reasons.push('Depth chưa phủ tới MAIN; chưa xác nhận đường đi.');
  if (mainEligible && gap.depth?.intermediateSharePct > 25) result.reasons.push('Có depth trung gian; ưu tiên kiểm tra vùng cản đầu.');
  const btcBias = result.btcContext?.bias;
  if (btcBias === (up ? 'SHORT_BIAS' : 'LONG_BIAS')) result.reasons.push('BTC đang nghiêng ngược hướng nhịp dự kiến.');
  if (!result.btcContext) result.reasons.push('Bối cảnh BTC từ AI chưa có hoặc quá 20 phút.');
  return result;
}
