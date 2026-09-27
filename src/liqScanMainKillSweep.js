export const LIQ_SCAN_MAIN_KILL_SWEEP_VERSION =
  'LIQSCAN_MAIN_KILL_SWEEP_DISCORD_V3_SHORT_REJECTION_FILTER_20260927';
export const LIQ_SCAN_REFERENCE_SWEEP_VERSION =
  'LIQSCAN_REFERENCE_SWEEP_DISCORD_V1_LARGE_VOLUME_20260918';
export const LIQ_SCAN_SWEEP_WEBHOOK_ROUTING_VERSION =
  'LIQSCAN_SWEEP_VOLUME_WEBHOOK_ROUTING_V1_20260918';
export const LIQ_SCAN_SWEEP_DISCORD_FILTER_VERSION = 'LIQSCAN_SWEEP_SIDE_PROXY_GT100M_V1_20260920';
export const LIQ_SCAN_SWEEP_DISCORD_MIN_SIDE_PROXY = 100_000_000;

export const LIQ_SCAN_MAIN_KILL_SWEEP_MIN_SCORE = 65;
export const LIQ_SCAN_LARGE_VOLUME_THRESHOLD_USDT = 2_000_000;
export const LIQ_SCAN_MAIN_KILL_SHORT_MAX_SWEEP_DEPTH_PCT = 0.1;

const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const rounded = (value, digits = 10) => {
  const number = finite(value);
  return number == null ? null : Number(number.toFixed(digits));
};

const formatPrice = (value) => {
  const number = finite(value);
  if (!(number > 0)) return '—';
  return number >= 1000
    ? number.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : Number(number.toPrecision(8)).toString();
};

const formatLiquidity = (value) => {
  const number = finite(value, 0);
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B proxy`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M proxy`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K proxy`;
  return `${Math.round(number)} proxy`;
};

export function classifyMainKillSweepVolume(zoneLiquidity, sideLiquidity = 0) {
  const amount = Math.max(0, finite(zoneLiquidity, 0));
  const sideTotal = Math.max(0, finite(sideLiquidity, 0));
  const sharePct = sideTotal > 0 ? Math.min(100, amount / sideTotal * 100) : 0;
  const tiers = amount >= 50_000_000
    ? { key: 'EXTREME', label: 'SIÊU LỚN', rank: 5, emphasis: '🚨🚨🚨' }
    : amount >= 10_000_000
      ? { key: 'VERY_LARGE', label: 'RẤT LỚN', rank: 4, emphasis: '🔥🔥' }
      : amount >= 2_000_000
        ? { key: 'LARGE', label: 'LỚN', rank: 3, emphasis: '🔥' }
        : amount >= 500_000
          ? { key: 'VISIBLE', label: 'RÕ', rank: 2, emphasis: '⚡' }
          : { key: 'NORMAL', label: 'THƯỜNG', rank: 1, emphasis: '•' };
  const filled = Math.min(10, tiers.rank * 2);
  return {
    ...tiers,
    amount,
    sideTotal,
    sharePct: Number(sharePct.toFixed(1)),
    bar: `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`,
  };
}

const localTime = (value) => new Date(value).toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour12: false,
});

function candidateFromAnalysis(analysis) {
  const symbol = String(analysis?.symbol ?? '').trim().toUpperCase();
  const score = finite(analysis?.liqScan?.imbalanceScore);
  const mark = finite(analysis?.market?.markPrice ?? analysis?.liqScan?.markPrice);
  const cluster = analysis?.liqScan?.killZoneCluster;
  const rawSide = String(cluster?.side ?? '').toUpperCase();
  const side = rawSide === 'UP' || rawSide === 'ABOVE'
    ? 'UPPER'
    : rawSide === 'DOWN' || rawSide === 'BELOW' ? 'LOWER' : null;
  const low = finite(cluster?.mainKillZone?.low);
  const high = finite(cluster?.mainKillZone?.high);
  const zoneLiquidity = finite(cluster?.mainKillZone?.score, 0);
  const candle = analysis?.backgroundCandle ?? {};
  const candleHigh = finite(candle.high, mark);
  const candleLow = finite(candle.low, mark);
  const candleClose = finite(candle.close, mark);
  const candleCloseTime = finite(candle.closeTime);
  const observedAt = Date.parse(analysis?.generatedAt ?? '') || Date.now();
  if (!symbol || score == null || !(mark > 0) || !side || !(low > 0) || !(high >= low)
    || !(candleHigh > 0) || !(candleLow > 0) || !(candleClose > 0)) return null;
  return {
    symbol,
    side,
    score,
    mark,
    low,
    high,
    zoneLiquidity,
    candleHigh,
    candleLow,
    candleClose,
    candleCloseTime,
    candleOpenTime: finite(candle.openTime),
    observedAt,
    liquidityAbove: finite(analysis?.liqScan?.liquidityAbove, 0),
    liquidityBelow: finite(analysis?.liqScan?.liquidityBelow, 0),
  };
}

function referenceCandidateFromAnalysis(analysis) {
  const symbol = String(analysis?.symbol ?? '').trim().toUpperCase();
  const target = analysis?.liqScan?.sweepTarget;
  const rawSide = String(target?.side ?? '').toUpperCase();
  const side = rawSide === 'UP' || rawSide === 'ABOVE'
    ? 'UPPER'
    : rawSide === 'DOWN' || rawSide === 'BELOW' ? 'LOWER' : null;
  const mark = finite(analysis?.market?.markPrice ?? analysis?.liqScan?.markPrice);
  const price = finite(target?.price);
  const zoneLiquidity = finite(target?.score, 0);
  const score = finite(analysis?.liqScan?.imbalanceScore, 0);
  const candle = analysis?.backgroundCandle ?? {};
  const candleHigh = finite(candle.high, mark);
  const candleLow = finite(candle.low, mark);
  const observedAt = Date.parse(analysis?.generatedAt ?? '') || Date.now();
  if (!symbol || !side || !(mark > 0) || !(price > 0) || !(zoneLiquidity > 0)
    || !(candleHigh > 0) || !(candleLow > 0)) return null;
  return {
    symbol, side, score, mark, low: price, high: price, zoneLiquidity,
    candleHigh, candleLow, candleOpenTime: finite(candle.openTime), observedAt,
    liquidityAbove: finite(analysis?.liqScan?.liquidityAbove, 0),
    liquidityBelow: finite(analysis?.liqScan?.liquidityBelow, 0),
  };
}

function fingerprint(candidate) {
  return [candidate.symbol, candidate.side, rounded(candidate.low), rounded(candidate.high)].join('|');
}

function canArm(candidate, minScore) {
  if (candidate.score < minScore) return false;
  if (candidate.side === 'UPPER') {
    return candidate.mark < candidate.low && candidate.candleHigh < candidate.high;
  }
  return candidate.mark > candidate.high && candidate.candleLow > candidate.low;
}

function swept(state, candidate) {
  if (state.side === 'UPPER') {
    const newestHigh = Math.max(candidate.candleHigh, candidate.mark);
    return state.observedExtreme < state.high && newestHigh >= state.high;
  }
  const newestLow = Math.min(candidate.candleLow, candidate.mark);
  return state.observedExtreme > state.low && newestLow <= state.low;
}

function buildEvent(state, candidate, now) {
  const crossingExtreme = state.side === 'UPPER'
    ? Math.max(candidate.candleHigh, candidate.mark)
    : Math.min(candidate.candleLow, candidate.mark);
  const sideLiquidity = state.side === 'UPPER'
    ? state.liquidityAbove
    : state.liquidityBelow;
  const volumeTier = classifyMainKillSweepVolume(state.zoneLiquidity, sideLiquidity);
  const sweepDepthPct = state.side === 'UPPER'
    ? Math.max(0, (crossingExtreme / state.high - 1) * 100)
    : Math.max(0, (state.low / crossingExtreme - 1) * 100);
  const returnedBeyondZone = state.side === 'UPPER'
    ? candidate.mark < state.low
    : candidate.mark > state.high;
  const closedCandle = Number.isFinite(candidate.candleCloseTime)
    && candidate.candleCloseTime < now;
  const closedBeyondZone = closedCandle && (state.side === 'UPPER'
    ? candidate.candleClose < state.low
    : candidate.candleClose > state.high);
  const rejectionConfirmed = returnedBeyondZone || closedBeyondZone;
  const shortFilterPassed = state.side !== 'UPPER' || (
    rejectionConfirmed
    && sweepDepthPct <= LIQ_SCAN_MAIN_KILL_SHORT_MAX_SWEEP_DEPTH_PCT
  );
  return {
    version: LIQ_SCAN_MAIN_KILL_SWEEP_VERSION,
    symbol: state.symbol,
    side: state.side,
    dedupeKey: fingerprint(state),
    observeOnly: volumeTier.key !== 'EXTREME',
    detectedAt: new Date(now).toISOString(),
    armedAt: new Date(state.armedAt).toISOString(),
    scoreAtArm: state.scoreAtArm,
    scoreNow: candidate.score,
    markAtArm: state.markAtArm,
    markNow: candidate.mark,
    crossingExtreme,
    sweepDepthPct: Number(sweepDepthPct.toFixed(4)),
    rejection: {
      confirmed: rejectionConfirmed,
      returnedBeyondZone,
      closedBeyondZone,
      confirmationPrice: candidate.mark,
      confirmationType: closedBeyondZone
        ? 'CLOSED_15M_BEYOND_ZONE'
        : returnedBeyondZone ? 'LIVE_MARK_BEYOND_ZONE' : 'NOT_CONFIRMED',
    },
    zone: { low: state.low, high: state.high, liquidity: state.zoneLiquidity },
    sideLiquidity,
    zoneSharePct: volumeTier.sharePct,
    volumeTier,
    liquidityAbove: state.liquidityAbove,
    liquidityBelow: state.liquidityBelow,
    // Current LiqScan totals at the crossing, separate from the frozen zone/arm data.
    liquidityAtSweep: {
      above: candidate.liquidityAbove,
      below: candidate.liquidityBelow,
      evaluatedAt: new Date(now).toISOString(),
      unit: 'WEIGHTED_QUOTE_VOLUME_PROXY',
    },
    execution: {
      binanceEligible: volumeTier.key === 'EXTREME' && shortFilterPassed,
      extremeOnly: true,
      minimumZoneLiquidityUsdt: 50_000_000,
      shortMaxSweepDepthPct: LIQ_SCAN_MAIN_KILL_SHORT_MAX_SWEEP_DEPTH_PCT,
      shortRejectionRequired: true,
      affectsEntry: volumeTier.key === 'EXTREME' && shortFilterPassed,
      affectsSize: volumeTier.key === 'EXTREME' && shortFilterPassed,
      affectsStopLoss: volumeTier.key === 'EXTREME' && shortFilterPassed,
      affectsTakeProfit: volumeTier.key === 'EXTREME' && shortFilterPassed,
    },
  };
}

export function collectLiqScanMainKillSweepEvent(value) {
  return [LIQ_SCAN_MAIN_KILL_SWEEP_VERSION, LIQ_SCAN_REFERENCE_SWEEP_VERSION]
    .includes(value?.version) ? value : null;
}

export function sweptSideLiquidityProxy(event) {
  if (!['UPPER', 'LOWER'].includes(event?.side)) return null;
  const upper = event.side === 'UPPER';
  // Old JSON has arm-time side totals only; use those without changing stored data.
  const raw = event.liquidityAtSweep
    ? event.liquidityAtSweep[upper ? 'above' : 'below']
    : event[upper ? 'liquidityAbove' : 'liquidityBelow'];
  if (raw == null || raw === '') return null;
  return finite(raw);
}

export function collectLiqScanSweepDiscordEvent(value) {
  const event = collectLiqScanMainKillSweepEvent(value);
  const liquidity = sweptSideLiquidityProxy(event);
  return event && liquidity != null && liquidity > LIQ_SCAN_SWEEP_DISCORD_MIN_SIDE_PROXY ? event : null;
}

export async function deliverLiqScanSweepDiscord(event, notifier, tracker) {
  const outcome = collectLiqScanSweepDiscordEvent(event)
    ? await notifier.notify(event)
    : { sent: 0, reason: 'side_proxy_not_over_100m', filtered: true };
  // Filtering is not delivery; consume the pending sweep so it is not replayed later.
  if (outcome.filtered || outcome.sent > 0 || outcome.reason === 'deduped') tracker.acknowledge(event);
  return outcome;
}

export function isLargeVolumeLiqScanSweepEvent(event) {
  return finite(event?.zone?.liquidity, 0) >= LIQ_SCAN_LARGE_VOLUME_THRESHOLD_USDT
    && finite(event?.volumeTier?.rank, 0) >= 3;
}

export class LiqScanMainKillSweepTracker {
  constructor({
    now = () => Date.now(),
    minScore = LIQ_SCAN_MAIN_KILL_SWEEP_MIN_SCORE,
    maxArmAgeMs = 30 * 60_000,
    cooldownMs = 15 * 60_000,
  } = {}) {
    this.now = now;
    this.minScore = minScore;
    this.maxArmAgeMs = maxArmAgeMs;
    this.cooldownMs = cooldownMs;
    this.states = new Map();
  }

  observe(analysis) {
    const candidate = candidateFromAnalysis(analysis);
    if (!candidate) return null;
    const now = this.now();
    let state = this.states.get(candidate.symbol);
    if (state?.mode === 'PENDING') return state.event;
    if (state?.mode === 'COOLDOWN') {
      if (now < state.until) return null;
      this.states.delete(candidate.symbol);
      state = null;
    }
    if (state?.mode === 'ARMED' && now - state.armedAt > this.maxArmAgeMs) {
      this.states.delete(candidate.symbol);
      state = null;
    }

    if (state?.mode === 'ARMED') {
      if (swept(state, candidate)) {
        const event = buildEvent(state, candidate, now);
        this.states.set(candidate.symbol, { mode: 'PENDING', event });
        return event;
      }
      state.observedExtreme = state.side === 'UPPER'
        ? Math.max(state.observedExtreme, candidate.candleHigh, candidate.mark)
        : Math.min(state.observedExtreme, candidate.candleLow, candidate.mark);
      state.lastObservedAt = now;
      return null;
    }

    // The first observation only arms a zone. Its current candle extremum becomes
    // the causal baseline, so a wick that happened before startup is never replayed.
    if (!canArm(candidate, this.minScore)) return null;
    this.states.set(candidate.symbol, {
      mode: 'ARMED',
      symbol: candidate.symbol,
      side: candidate.side,
      low: candidate.low,
      high: candidate.high,
      zoneLiquidity: candidate.zoneLiquidity,
      scoreAtArm: candidate.score,
      markAtArm: candidate.mark,
      liquidityAbove: candidate.liquidityAbove,
      liquidityBelow: candidate.liquidityBelow,
      observedExtreme: candidate.side === 'UPPER'
        ? Math.max(candidate.candleHigh, candidate.mark)
        : Math.min(candidate.candleLow, candidate.mark),
      armedAt: now,
      lastObservedAt: now,
    });
    return null;
  }

  acknowledge(event) {
    if (!event?.symbol) return;
    const state = this.states.get(event.symbol);
    if (state?.mode !== 'PENDING' || state.event?.dedupeKey !== event.dedupeKey) return;
    this.states.set(event.symbol, {
      mode: 'COOLDOWN',
      until: this.now() + this.cooldownMs,
      dedupeKey: event.dedupeKey,
    });
  }
}

export class LiqScanReferenceSweepTracker extends LiqScanMainKillSweepTracker {
  constructor(options = {}) {
    super({ ...options, minScore: -Infinity });
  }

  observe(analysis) {
    const candidate = referenceCandidateFromAnalysis(analysis);
    if (!candidate || candidate.zoneLiquidity < LIQ_SCAN_LARGE_VOLUME_THRESHOLD_USDT) return null;
    const proxyAnalysis = {
      symbol: candidate.symbol,
      generatedAt: new Date(candidate.observedAt).toISOString(),
      market: { markPrice: candidate.mark },
      backgroundCandle: {
        openTime: candidate.candleOpenTime,
        high: candidate.candleHigh,
        low: candidate.candleLow,
      },
      liqScan: {
        imbalanceScore: candidate.score,
        liquidityAbove: candidate.liquidityAbove,
        liquidityBelow: candidate.liquidityBelow,
        killZoneCluster: {
          side: candidate.side === 'UPPER' ? 'UP' : 'DOWN',
          mainKillZone: {
            low: candidate.low,
            high: candidate.high,
            score: candidate.zoneLiquidity,
          },
        },
      },
    };
    const event = super.observe(proxyAnalysis);
    if (!event) return null;
    return {
      ...event,
      version: LIQ_SCAN_REFERENCE_SWEEP_VERSION,
      zoneType: 'REFERENCE_PROXY',
      observeOnly: true,
      dedupeKey: `${event.symbol}|REFERENCE_PROXY|${event.side}|${rounded(event.zone.low)}`,
      execution: {
        binanceEligible: false,
        affectsEntry: false,
        affectsSize: false,
        affectsStopLoss: false,
        affectsTakeProfit: false,
      },
    };
  }

  acknowledge(event) {
    if (event?.zoneType !== 'REFERENCE_PROXY' || !event?.symbol) return;
    const state = this.states.get(event.symbol);
    if (state?.mode !== 'PENDING') return;
    this.states.set(event.symbol, {
      mode: 'COOLDOWN',
      until: this.now() + this.cooldownMs,
      dedupeKey: event.dedupeKey,
    });
  }
}

export function buildLiqScanMainKillSweepPayload(event) {
  const upper = event.side === 'UPPER';
  const referenceProxy = event.zoneType === 'REFERENCE_PROXY';
  const symbol = encodeURIComponent(event.symbol);
  const base = encodeURIComponent(event.symbol.replace(/USDT$/, ''));
  const zoneText = `${formatPrice(event.zone.low)}–${formatPrice(event.zone.high)}`;
  const volumeTier = event.volumeTier
    ?? classifyMainKillSweepVolume(event.zone?.liquidity, event.sideLiquidity);
  const colorByRank = upper
    ? [0x6d28d9, 0x7c3aed, 0xa855f7, 0xd946ef, 0xff2d95]
    : [0x1e3a8a, 0x2563eb, 0x06b6d4, 0x22d3ee, 0x67e8f9];
  const color = colorByRank[Math.max(0, Math.min(4, volumeTier.rank - 1))];
  const tradeSide = upper ? 'SHORT' : 'LONG';
  const executionStatus = String(event.binanceExecution?.status ?? '').toUpperCase();
  const submitted = ['SUBMITTED', 'NEW', 'FILLED', 'PARTIALLY_FILLED'].includes(executionStatus);
  const executionLine = referenceProxy
    ? '**OBSERVE ONLY — quét vùng proxy tham khảo không tự đặt lệnh Binance.**'
    : volumeTier.key !== 'EXTREME'
    ? '**OBSERVE ONLY — tier chưa đạt đỏ SIÊU LỚN 50M, không tự đặt lệnh Binance.**'
    : executionStatus === 'OBSERVE-ONLY-ZONE-NOT-REJECTED'
      ? '**OBSERVE ONLY · SHORT chưa xác nhận rút xuống dưới đáy vùng quét, không gửi Binance.**'
      : executionStatus === 'OBSERVE-ONLY-DEEP-SWEEP'
        ? `**OBSERVE ONLY · độ xuyên vùng ${Number(event.sweepDepthPct).toFixed(3)}% vượt trần ${LIQ_SCAN_MAIN_KILL_SHORT_MAX_SWEEP_DEPTH_PCT.toFixed(2)}%, không SHORT đuổi.**`
        : executionStatus === 'OBSERVE-ONLY-BIDIRECTIONAL-3D'
          ? '**OBSERVE ONLY · coin đã phát cả LONG và SHORT trong 3 ngày gần nhất, không gửi Binance.**'
          : submitted
      ? `**BINANCE THẬT · ${executionStatus} · ${tradeSide} MARKET ${event.binanceExecution?.marginUsdt ?? 1} USDT margin ×${event.binanceExecution?.leverage ?? 5} · TP +${event.binanceExecution?.takeProfitRoePct ?? 10}% · SL −${event.binanceExecution?.stopLossRoePct ?? 30}% ROE.**`
      : executionStatus === 'OFF'
        ? `**BINANCE OFF · ${tradeSide} MARKET chưa gửi vì route/master đang tắt.**`
        : executionStatus === 'EXISTING-POSITION' || executionStatus === 'EXISTING-ORDER'
          ? `**BINANCE BỎ QUA · ${executionStatus === 'EXISTING-POSITION' ? 'đã có vị thế' : 'đã có entry order'} cùng symbol, không DCA.**`
          : executionStatus === 'DEDUPED'
            ? '**BINANCE BỎ QUA · tín hiệu đã xử lý hoặc symbol còn cooldown, không gửi lặp.**'
            : executionStatus === 'PRICE-OR-AGE-BLOCKED' || executionStatus === 'INELIGIBLE'
              ? '**BINANCE BỎ QUA · tín hiệu đã cũ hoặc mark đã lệch quá 0,5% so với lúc quét.**'
              : executionStatus === 'RUNTIME-OFF' || executionStatus === 'CONTROL-CHANGED'
                ? '**BINANCE OFF · runtime/công tắc thay đổi trước lúc gửi lệnh.**'
                : executionStatus === 'ERROR_OR_UNKNOWN' || executionStatus === 'STATE-ERROR'
                  ? `**BINANCE ERROR · ${event.binanceExecution?.errorCode ?? 'UNKNOWN'} · không tự gửi lại khi trạng thái chưa chắc chắn.**`
                  : `**BINANCE CHỜ ĐÁNH GIÁ · tier đỏ có quyền ${tradeSide} MARKET khi route đang ON và tín hiệu còn mới.**`;
  return {
    username: 'LiqScan Main Kill Sweep',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${volumeTier.emphasis} ${volumeTier.label} · ${upper ? '🟣 ↑' : '🔵 ↓'} ${event.symbol} · QUÉT XONG ${referenceProxy ? 'VÙNG PROXY THAM KHẢO' : 'MAIN KILL'} ${upper ? 'TRÊN' : 'DƯỚI'}`,
      color,
      description: [
        `**${volumeTier.bar} · ${formatLiquidity(volumeTier.amount)} · ${volumeTier.label}**`,
        `**${upper ? 'QUÉT THANH KHOẢN SHORT' : 'QUÉT THANH KHOẢN LONG'} · ĐÃ XUYÊN HẾT ${referenceProxy ? 'MỨC THAM KHẢO' : 'VÙNG'}**`,
        executionLine,
        'Quét xong vùng không đồng nghĩa giá chắc chắn đảo chiều.',
      ].join('\n'),
      fields: [
        {
          name: `${volumeTier.emphasis} LỰC ${referenceProxy ? 'VÙNG PROXY' : 'MAIN KILL'} · ${volumeTier.label}`,
          value: `Ước tính proxy vùng **${formatLiquidity(volumeTier.amount)}** · chiếm **${volumeTier.sharePct}%** thanh khoản cùng phía.\nTổng phía ${upper ? 'trên' : 'dưới'} **${formatLiquidity(volumeTier.sideTotal)}** · ${volumeTier.bar}`,
        },
        {
          name: `🎯 ${referenceProxy ? 'VÙNG PROXY THAM KHẢO' : 'MAIN KILL'} ĐÃ QUÉT`,
          value: `Vùng **${zoneText}**\n${upper ? 'Đỉnh mới' : 'Đáy mới'} **${formatPrice(event.crossingExtreme)}** · mark **${formatPrice(event.markNow)}**`,
        },
        ...(referenceProxy ? [] : [{
          name: upper ? '🛡️ BỘ LỌC SHORT SAU QUÉT' : '↔️ BỘ LỌC HAI CHIỀU 3 NGÀY',
          value: upper
            ? `Độ xuyên **${Number.isFinite(Number(event.sweepDepthPct)) ? Number(event.sweepDepthPct).toFixed(3) : 'N/A'}%** / tối đa **${LIQ_SCAN_MAIN_KILL_SHORT_MAX_SWEEP_DEPTH_PCT.toFixed(2)}%**\nRút xuống dưới đáy vùng: **${event.rejection?.confirmed === true ? 'ĐÃ XÁC NHẬN' : 'CHƯA XÁC NHẬN'}** · ${event.rejection?.confirmationType ?? 'N/A'}\nHai chiều trong 3 ngày: **${event.binanceExecution?.recentBidirectional3d === true ? 'CÓ · OBSERVE ONLY' : 'KHÔNG'}**`
            : `Hai chiều trong 3 ngày: **${event.binanceExecution?.recentBidirectional3d === true ? 'CÓ · OBSERVE ONLY' : 'KHÔNG'}**\nLONG dưới vẫn giữ logic quét vùng hiện hữu; chỉ thêm khóa hai chiều.`,
        }]),
        {
          name: '🧭 XÁC NHẬN NHÂN QUẢ',
          value: `Bắt đầu theo dõi ${localTime(event.armedAt)} khi mark **${formatPrice(event.markAtArm)}** còn ở ngoài vùng.\nXác nhận quét ${localTime(event.detectedAt)} từ dữ liệu 15m đang chạy; không replay râu nến cũ.`,
        },
        {
          name: '🌐 LIQSCAN',
          value: `Điểm lúc gác vùng **${event.scoreAtArm}/100** · hiện tại **${event.scoreNow}/100**\nThanh khoản ${event.liquidityAtSweep ? 'lúc quét' : 'lúc gác vùng'} trên **${formatLiquidity(event.liquidityAtSweep?.above ?? event.liquidityAbove)}** · dưới **${formatLiquidity(event.liquidityAtSweep?.below ?? event.liquidityBelow)}**\nLọc Discord: phía ${upper ? 'trên' : 'dưới'} >100M proxy. Proxy từ quote-volume có trọng số, không phải số coin hay USD thanh lý thực tế.`,
        },
        {
          name: '🔗 MỞ BIỂU ĐỒ',
          value: `[Binance](https://www.binance.com/en/futures/${symbol}) · [CoinGlass Model 3](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${base})`,
        },
      ],
      timestamp: event.detectedAt,
      footer: { text: `${event.version} · ${LIQ_SCAN_SWEEP_WEBHOOK_ROUTING_VERSION} · ${LIQ_SCAN_SWEEP_DISCORD_FILTER_VERSION}` },
    }],
  };
}
