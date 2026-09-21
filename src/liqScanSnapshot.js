export const LIQ_SCAN_SNAPSHOT_VERSION =
  'LIQ_SCAN_SNAPSHOT_V1_COIN_LEVEL_HIGHLIGHT_20260905';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 4) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;
}

function compactKillZone(zone = null) {
  if (!zone) return null;
  return {
    low: round(zone.low, 10),
    high: round(zone.high, 10),
    mid: round(zone.mid, 10),
    distancePctLow: round(zone.distancePctLow, 3),
    distancePctHigh: round(zone.distancePctHigh, 3),
    score: round(zone.score, 2),
  };
}

export function buildLiqScanSnapshot({
  symbol,
  markPrice,
  heatmap,
  evaluatedAt = Date.now(),
  biasThreshold = 0.4,
} = {}) {
  const liquidityAbove = Math.max(0, finite(heatmap?.liquidityAbove));
  const liquidityBelow = Math.max(0, finite(heatmap?.liquidityBelow));
  const totalLiquidity = liquidityAbove + liquidityBelow;
  const bias = Math.max(-1, Math.min(1, finite(heatmap?.bias)));
  const dominantSide = bias >= 0 ? 'ABOVE' : 'BELOW';
  const dominantLiquidity = dominantSide === 'ABOVE' ? liquidityAbove : liquidityBelow;
  const dominantPct = totalLiquidity > 0 ? dominantLiquidity / totalLiquidity : 0.5;
  const isImbalanced = totalLiquidity > 0 && Math.abs(bias) >= Math.max(0, finite(biasThreshold, 0.4));
  const isOneSided = totalLiquidity > 0 && (
    liquidityAbove < totalLiquidity * 0.12
    || liquidityBelow < totalLiquidity * 0.12
  );
  const sweepProbabilityPct = totalLiquidity > 0
    ? Math.min(99, Math.max(0, Math.round(
      (Math.abs(bias) * 0.6 + Math.max(0, dominantPct - 0.5) * 2 * 0.4) * 100,
    )))
    : 0;
  const sweepTarget = heatmap?.sweepTarget ? {
    side: String(heatmap.sweepTarget.direction ?? dominantSide).toUpperCase(),
    price: round(heatmap.sweepTarget.price, 10),
    distancePct: round(heatmap.sweepTarget.distancePct, 3),
    score: round(heatmap.sweepTarget.score, 2),
  } : null;

  return {
    version: LIQ_SCAN_SNAPSHOT_VERSION,
    source: 'BINANCE_15M_LIQUIDITY_PROXY',
    symbol: String(symbol ?? '').trim().toUpperCase(),
    timeframe: '15m',
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    isAlert: isImbalanced || isOneSided,
    alertReason: isImbalanced && isOneSided
      ? 'IMBALANCED_AND_ONE_SIDED'
      : isImbalanced ? 'IMBALANCED' : isOneSided ? 'ONE_SIDED' : 'BELOW_ALERT_THRESHOLD',
    biasThreshold: round(biasThreshold, 3),
    markPrice: round(markPrice, 10),
    liquidityAbove: round(liquidityAbove, 2),
    liquidityBelow: round(liquidityBelow, 2),
    totalLiquidity: round(totalLiquidity, 2),
    bias: round(bias, 4),
    dominantSide,
    dominantPct: round(dominantPct * 100, 2),
    sweepProbabilityPct,
    imbalanceScore: sweepProbabilityPct,
    sweepLabel: sweepProbabilityPct >= 70 ? 'CAO' : sweepProbabilityPct >= 45 ? 'TRUNG_BINH' : 'THAP',
    sweepTarget,
    killZoneCluster: heatmap?.killZoneCluster ? {
      side: heatmap.killZoneCluster.side ?? null,
      isOneSided: Boolean(heatmap.killZoneCluster.isOneSided),
      mainKillZone: compactKillZone(heatmap.killZoneCluster.mainKillZone),
      farKillZone: compactKillZone(heatmap.killZoneCluster.farKillZone),
    } : null,
    observeOnly: true,
    execution: {
      binanceEnabled: false,
      affectsEntry: false,
      affectsSize: false,
      affectsStopLoss: false,
      affectsTakeProfit: false,
    },
  };
}

// Page-only assessment. Never feeds an order executor or a scanner gate.
export function assessSweepDirection(analysis, current, now = Date.now()) {
  const fresh = (date, maxAge) => {
    const age = now - Date.parse(date);
    return Number.isFinite(age) && age >= 0 && age <= maxAge;
  };
  const mark = Number(analysis?.market?.markPrice);
  const frames = analysis?.coinglass?.available ? analysis.coinglass.frames ?? [] : [];
  const frame = ['24h', '12h', '48h'].map((range) => frames.find((item) => item.range === range
    && fresh(item.scrapedAt, 20 * 60_000))).find(Boolean);
  const candidates = (side) => (frame?.[side === 'ABOVE' ? 'above' : 'below'] ?? [])
    .filter((zone) => ['FRESH', 'APPROACHING', 'UNTRACKED'].includes(zone.lifecycle)
      && zone.effectiveAttractionScore > 0 && Number(zone.bandHigh) >= Number(zone.bandLow)
      && (side === 'ABOVE' ? Number(zone.bandLow) > mark : Number(zone.bandHigh) < mark))
    .map((zone) => ({ ...zone, distanceToEdgePct: round(Math.abs((side === 'ABOVE' ? zone.bandLow : zone.bandHigh) / mark - 1) * 100, 3) }))
    .sort((a, b) => a.distanceToEdgePct - b.distanceToEdgePct);
  const above = candidates('ABOVE')[0] ?? null;
  const below = candidates('BELOW')[0] ?? null;
  const currentFresh = current && !current.stale && fresh(current.evaluatedAt, 90_000) && mark > 0;
  const proxySide = currentFresh && current.totalLiquidity > 0 && Math.abs(current.bias) > 0.0001 ? current.dominantSide : null;
  const cgBias = analysis?.coinglass?.timeframeTrial?.weighted?.liquidityBias ?? analysis?.coinglass?.combined?.liquidityBias;
  const cgSide = frame ? cgBias === 'UPPER_FIRST' ? 'ABOVE' : cgBias === 'LOWER_FIRST' ? 'BELOW' : null : null;
  const conflict = Boolean(proxySide && cgSide && proxySide !== cgSide);
  const preferredSide = !conflict && currentFresh && current.isAlert && proxySide === cgSide ? cgSide : null;
  const target = preferredSide === 'ABOVE' ? above : preferredSide === 'BELOW' ? below : null;
  const confirmation = analysis?.recommendation?.confirmation ?? {};
  const confirmed15m = preferredSide === 'ABOVE' ? confirmation.breakout === 'CONFIRMED_15M'
    : preferredSide === 'BELOW' ? confirmation.breakdown === 'CONFIRMED_15M' : false;
  const trendAligned = preferredSide === 'ABOVE' ? analysis?.trend?.bias === 'BULLISH'
    : preferredSide === 'BELOW' ? analysis?.trend?.bias === 'BEARISH' : false;
  const eligible = Boolean(target && confirmed15m && trendAligned && !analysis?.freshness?.stale);
  const state = conflict ? 'CONFLICT' : !currentFresh || !frame ? 'MISSING_DATA' : eligible ? 'DIRECTIONAL_WATCH' : 'WAIT_CONFIRMATION';
  const reasons = [];
  if (!currentFresh) reasons.push('Dữ liệu Binance hiện tại thiếu hoặc quá 90 giây.');
  if (!frame) reasons.push('Chưa có khung CoinGlass mới trong 20 phút.');
  else if (frame.range !== '24h') reasons.push(`Thiếu 24h mới; vùng tham khảo tạm lấy từ ${frame.range}.`);
  if (conflict) reasons.push('Binance và CoinGlass ngược hướng; chưa chọn phía quét trước.');
  if (currentFresh && !current.isAlert) reasons.push('Độ lệch Binance chưa đạt ngưỡng cảnh báo.');
  if (!cgSide && frame) reasons.push('CoinGlass chưa nghiêng rõ một phía.');
  if (!confirmed15m) reasons.push('Chưa có xác nhận 15m đồng hướng.');
  if (preferredSide && !trendAligned) reasons.push('Xu hướng đa khung chưa đồng thuận.');
  if (preferredSide && !target) reasons.push('Không có vùng chưa quét hợp lệ ở phía ưu tiên.');
  reasons.push('Chưa xác nhận tự động retest 5m, taker flow và diễn biến OI trong đánh giá này.');
  return {
    version: 'LIQ_SCAN_DIRECTION_CONTEXT_V1_20260906', observeOnly: true,
    state, agreement: eligible ? 'PARTIAL' : 'LOW', direction: eligible ? preferredSide : null,
    headline: conflict ? 'HAI NGUỒN MÂU THUẪN — CHƯA XÁC ĐỊNH PHÍA QUÉT TRƯỚC'
      : eligible ? `ƯU TIÊN THEO DÕI QUÉT ${preferredSide === 'ABOVE' ? 'TRÊN ↑' : 'DƯỚI ↓'} · CÒN CHỜ RETEST / DÒNG TIỀN`
        : 'CHƯA ĐỦ XÁC NHẬN PHÍA QUÉT TRƯỚC',
    proxySide, coinglassSide: cgSide, sourceRange: frame?.range ?? null,
    above, below, target: eligible ? target : null, reasons,
    longPlan: analysis?.recommendation?.longPlan ?? null,
    shortPlan: analysis?.recommendation?.shortPlan ?? null,
  };
}
