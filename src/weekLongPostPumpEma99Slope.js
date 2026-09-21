export const WEEK_LONG_POST_PUMP_EMA99_SLOPE_VERSION =
  'WEEK_LONG_POST_PUMP_EMA99_SLOPE_REJECT_V1_20260919';
export const WEEK_LONG_POST_PUMP_EMA99_SLOPE_LABEL =
  'WEEK_LONG_POST_PUMP_EMA99_SLOPE_REJECT_15M';

export const WEEK_LONG_POST_PUMP_EMA99_SLOPE_RULE = Object.freeze({
  minBars15m: 135,
  maxBars15m: 500,
  minBars1h: 168,
  maxBars1h: 240,
  max15mAgeMs: 25 * 60_000,
  max1hAgeMs: 75 * 60_000,
  maxSignalAgeMs: 120 * 60_000,
  weekBars1h: 168,
  prePeakBars1h: 48,
  minPeakAgeHours: 72,
  maxPeakAgeHours: 168,
  minPostPeakBars1h: 72,
  minPumpPct: 35,
  minPeakDrawdownPct: 20,
  recentDeclineBars1h: 72,
  minRecentDeclinePct: 8,
  minRecentDeclineR2: 0.60,
  minDecliningSegments1h: 2,
  minSegmentDropPct: 1,
  ema99SlopeBars15m: 40,
  minEma99DailyDropPct: 1.5,
  minEma99SlopeR2: 0.92,
  minEma99DecliningShare: 0.85,
  belowEma99Bars15m: 32,
  minBelowEma99Share: 0.80,
  triggerLookbackBars15m: 8,
  maxConfirmationBars15m: 3,
  volumeLookbackBars15m: 20,
  minSpikeOpenToHighPct: 4,
  minSpikeRangePct: 4,
  minSpikeVolumeRatio: 3,
  minSpikeHighVsEma99Pct: -1.5,
  maxSpikeHighVsEma99Pct: 4,
  minSpikeUpperWickShare: 0.25,
  minSpikeGivebackPct: 2,
  minPeakToConfirmDropPct: 5,
  maxConfirmVsSpikeOpenPct: 0.5,
  minConfirmVolumeRatio: 1.5,
});

const M15 = 15 * 60_000;
const HOUR = 60 * 60_000;
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pct = (value, digits = 2) => Number.isFinite(value)
  ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
  : '—';
const price = (value) => Number.isFinite(value)
  ? Number(value.toFixed(10)).toString()
  : '—';
const localTime = (value) => new Date(value).toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour12: false,
});

function valueOf(row, key, index) {
  return finite(Array.isArray(row) ? row[index] : row?.[key]);
}

function normalizeBar(row) {
  if (!row) return null;
  const bar = {
    openTime: valueOf(row, 'openTime', 0),
    open: valueOf(row, 'open', 1),
    high: valueOf(row, 'high', 2),
    low: valueOf(row, 'low', 3),
    close: valueOf(row, 'close', 4),
    volume: valueOf(row, 'volume', 5),
    closeTime: valueOf(row, 'closeTime', 6),
    quoteVolume: valueOf(row, 'quoteVolume', 7),
  };
  if (![bar.openTime, bar.open, bar.high, bar.low, bar.close, bar.closeTime]
    .every(Number.isFinite)
    || Math.min(bar.open, bar.high, bar.low, bar.close) <= 0
    || bar.high < Math.max(bar.open, bar.close)
    || bar.low > Math.min(bar.open, bar.close)) return null;
  if (!Number.isFinite(bar.quoteVolume) && Number.isFinite(bar.volume)) {
    bar.quoteVolume = bar.volume * bar.close;
  }
  return bar;
}

function closedBars(rows, now, limit) {
  const unique = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const bar = normalizeBar(row);
    if (bar && bar.closeTime <= now) unique.set(bar.openTime, bar);
  }
  return [...unique.values()]
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-limit);
}

function continuous(bars, intervalMs) {
  for (let index = 1; index < bars.length; index += 1) {
    if (Math.abs(bars[index].openTime - bars[index - 1].openTime - intervalMs) > 1_000) {
      return false;
    }
  }
  return true;
}

function emaSeries(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length < period) return output;
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = current;
  const alpha = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    current += alpha * (values[index] - current);
    output[index] = current;
  }
  return output;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function logRegression(values) {
  if (!Array.isArray(values) || values.length < 3 || values.some((value) => !(value > 0))) {
    return null;
  }
  const logs = values.map((value) => Math.log(value));
  const meanX = (logs.length - 1) / 2;
  const meanY = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  let cross = 0;
  let squareX = 0;
  let squareY = 0;
  for (let index = 0; index < logs.length; index += 1) {
    const x = index - meanX;
    const y = logs[index] - meanY;
    cross += x * y;
    squareX += x * x;
    squareY += y * y;
  }
  if (!(squareX > 0)) return null;
  const slope = cross / squareX;
  return {
    slope,
    r2: squareY > 0 ? (cross * cross) / (squareX * squareY) : 1,
    movePct: (Math.exp(slope * values.length) - 1) * 100,
  };
}

function decliningSegments(bars, minimumDropPct) {
  const medians = [];
  for (let segment = 0; segment < 3; segment += 1) {
    const from = Math.floor(segment * bars.length / 3);
    const to = Math.max(from + 1, Math.floor((segment + 1) * bars.length / 3));
    medians.push(median(bars.slice(from, to).map((bar) => bar.close)));
  }
  let declining = 0;
  for (let index = 1; index < medians.length; index += 1) {
    if (medians[index] <= medians[index - 1] * (1 - minimumDropPct / 100)) declining += 1;
  }
  return { medians, declining };
}

function detectOneHourWeekContext(klines1h, signalAt, confirmationClose, rule) {
  const bars = closedBars(klines1h, signalAt, rule.maxBars1h);
  if (bars.length < rule.minBars1h || !continuous(bars, HOUR)) return null;
  const current = bars.at(-1);
  if (signalAt - current.closeTime > rule.max1hAgeMs) return null;
  const week = bars.slice(-rule.weekBars1h);
  let peakIndex = 0;
  for (let index = 1; index < week.length; index += 1) {
    if (week[index].high > week[peakIndex].high) peakIndex = index;
  }
  const peak = week[peakIndex];
  const peakAgeHours = (signalAt - peak.closeTime) / HOUR;
  const prePeak = week.slice(Math.max(0, peakIndex - rule.prePeakBars1h), peakIndex);
  if (!prePeak.length
    || peakAgeHours < rule.minPeakAgeHours
    || peakAgeHours > rule.maxPeakAgeHours) return null;
  const base = prePeak.reduce((best, bar) => bar.low < best.low ? bar : best);
  const pumpPct = (peak.high / base.low - 1) * 100;
  const drawdownPct = (peak.high / confirmationClose - 1) * 100;
  const postPeak = week.slice(peakIndex + 1);
  const recent = week.slice(-rule.recentDeclineBars1h);
  const regression = logRegression(recent.map((bar) => bar.close));
  const segments = decliningSegments(recent, rule.minSegmentDropPct);
  if (pumpPct < rule.minPumpPct
    || drawdownPct < rule.minPeakDrawdownPct
    || postPeak.length < rule.minPostPeakBars1h
    || !regression
    || regression.movePct > -rule.minRecentDeclinePct
    || regression.r2 < rule.minRecentDeclineR2
    || segments.declining < rule.minDecliningSegments1h) return null;
  return {
    baseAt: base.closeTime,
    baseLow: base.low,
    peakAt: peak.closeTime,
    peakHigh: peak.high,
    peakAgeHours,
    pumpPct,
    drawdownPct,
    postPeakBars: postPeak.length,
    recentBars: recent.length,
    recentDeclinePct: regression.movePct,
    recentDeclineR2: regression.r2,
    segmentMedians: segments.medians,
    decliningSegments: segments.declining,
    currentClose: current.close,
  };
}

function detectFifteenMinuteSlopeAndReject(klines15m, now, rule) {
  const bars = closedBars(klines15m, now, rule.maxBars15m);
  if (bars.length < rule.minBars15m || !continuous(bars, M15)) return null;
  const latest = bars.at(-1);
  if (now - latest.closeTime > rule.max15mAgeMs) return null;
  const closes = bars.map((bar) => bar.close);
  const ema13 = emaSeries(closes, 13);
  const ema25 = emaSeries(closes, 25);
  const ema99 = emaSeries(closes, 99);
  const earliestSpike = Math.max(
    rule.volumeLookbackBars15m,
    bars.length - rule.triggerLookbackBars15m,
  );
  let best = null;
  for (let spikeIndex = earliestSpike; spikeIndex < bars.length - 1; spikeIndex += 1) {
    const spike = bars[spikeIndex];
    const spikeEma99 = finite(ema99[spikeIndex]);
    if (!(spikeEma99 > 0)) continue;
    const history = bars.slice(spikeIndex - rule.volumeLookbackBars15m, spikeIndex);
    const medianQuoteVolume = median(history.map((bar) => bar.quoteVolume));
    if (!(medianQuoteVolume > 0)) continue;
    const openToHighPct = (spike.high / spike.open - 1) * 100;
    const rangePct = (spike.high / spike.low - 1) * 100;
    const volumeRatio = spike.quoteVolume / medianQuoteVolume;
    const highVsEma99Pct = (spike.high / spikeEma99 - 1) * 100;
    const candleRange = spike.high - spike.low;
    const upperWickShare = candleRange > 0
      ? (spike.high - Math.max(spike.open, spike.close)) / candleRange
      : 0;
    const spikeGivebackPct = (spike.high / spike.close - 1) * 100;
    if (openToHighPct < rule.minSpikeOpenToHighPct
      || rangePct < rule.minSpikeRangePct
      || volumeRatio < rule.minSpikeVolumeRatio
      || highVsEma99Pct < rule.minSpikeHighVsEma99Pct
      || highVsEma99Pct > rule.maxSpikeHighVsEma99Pct
      || spike.close >= spikeEma99
      || (upperWickShare < rule.minSpikeUpperWickShare
        && spikeGivebackPct < rule.minSpikeGivebackPct)) continue;
    const lastConfirmation = Math.min(
      bars.length - 1,
      spikeIndex + rule.maxConfirmationBars15m,
    );
    for (let confirmationIndex = spikeIndex + 1;
      confirmationIndex <= lastConfirmation;
      confirmationIndex += 1) {
      const confirmation = bars[confirmationIndex];
      const ema13At = finite(ema13[confirmationIndex]);
      const ema25At = finite(ema25[confirmationIndex]);
      const ema99At = finite(ema99[confirmationIndex]);
      const confirmationHistory = bars.slice(
        confirmationIndex - rule.volumeLookbackBars15m,
        confirmationIndex,
      );
      const confirmationMedianVolume = median(
        confirmationHistory.map((bar) => bar.quoteVolume),
      );
      const confirmationVolumeRatio = confirmationMedianVolume > 0
        ? confirmation.quoteVolume / confirmationMedianVolume
        : null;
      const peakToConfirmDropPct = (spike.high / confirmation.close - 1) * 100;
      const confirmVsSpikeOpenPct = (confirmation.close / spike.open - 1) * 100;
      if (![ema13At, ema25At, ema99At, confirmationVolumeRatio].every(Number.isFinite)
        || confirmation.close >= confirmation.open
        || peakToConfirmDropPct < rule.minPeakToConfirmDropPct
        || confirmVsSpikeOpenPct > rule.maxConfirmVsSpikeOpenPct
        || confirmationVolumeRatio < rule.minConfirmVolumeRatio
        || !(confirmation.close < ema13At && ema13At < ema25At && ema25At < ema99At)) continue;

      const slopeStart = confirmationIndex - rule.ema99SlopeBars15m + 1;
      if (slopeStart < 98) continue;
      const slopeValues = ema99.slice(slopeStart, confirmationIndex + 1);
      if (slopeValues.some((value) => !Number.isFinite(value))) continue;
      const regression = logRegression(slopeValues);
      const decliningSteps = slopeValues.slice(1)
        .filter((value, index) => value < slopeValues[index]).length;
      const decliningShare = decliningSteps / Math.max(1, slopeValues.length - 1);
      const belowStart = confirmationIndex - rule.belowEma99Bars15m + 1;
      if (belowStart < 0 || !regression) continue;
      const belowCount = bars.slice(belowStart, confirmationIndex + 1)
        .filter((bar, offset) => bar.close < ema99[belowStart + offset]).length;
      const belowShare = belowCount / rule.belowEma99Bars15m;
      const dailySlopePct = (Math.exp(regression.slope * 96) - 1) * 100;
      if (dailySlopePct > -rule.minEma99DailyDropPct
        || regression.r2 < rule.minEma99SlopeR2
        || decliningShare < rule.minEma99DecliningShare
        || belowShare < rule.minBelowEma99Share) continue;
      const candidate = {
        signalAt: confirmation.closeTime,
        spikeAt: spike.openTime,
        spikeCloseAt: spike.closeTime,
        confirmationAt: confirmation.closeTime,
        spikeOpen: spike.open,
        spikeHigh: spike.high,
        spikeLow: spike.low,
        spikeClose: spike.close,
        confirmationOpen: confirmation.open,
        confirmationClose: confirmation.close,
        openToHighPct,
        rangePct,
        volumeRatio,
        highVsEma99Pct,
        upperWickShare,
        spikeGivebackPct,
        confirmationVolumeRatio,
        peakToConfirmDropPct,
        confirmVsSpikeOpenPct,
        ema13: ema13At,
        ema25: ema25At,
        ema99: ema99At,
        spikeEma99,
        ema99DailySlopePct: dailySlopePct,
        ema99SlopeR2: regression.r2,
        ema99DecliningShare: decliningShare,
        belowEma99Share: belowShare,
      };
      if (!best || candidate.signalAt > best.signalAt) best = candidate;
      break;
    }
  }
  if (!best || now - best.signalAt > rule.maxSignalAgeMs) return null;
  return best;
}

export function detectWeekLongPostPumpEma99Slope15mReject({
  klines15m = [],
  now = Date.now(),
  config = {},
} = {}) {
  const rule = { ...WEEK_LONG_POST_PUMP_EMA99_SLOPE_RULE, ...config };
  return detectFifteenMinuteSlopeAndReject(klines15m, now, rule);
}

export function detectWeekLongPostPumpEma99SlopeReject({
  symbol,
  klines15m = [],
  klines1h = [],
  now = Date.now(),
  config = {},
} = {}) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  if (!normalizedSymbol) return null;
  const rule = { ...WEEK_LONG_POST_PUMP_EMA99_SLOPE_RULE, ...config };
  const frame15m = detectFifteenMinuteSlopeAndReject(klines15m, now, rule);
  if (!frame15m) return null;
  const frame1h = detectOneHourWeekContext(
    klines1h,
    frame15m.signalAt,
    frame15m.confirmationClose,
    rule,
  );
  if (!frame1h) return null;
  const score = clamp(Math.round(
    65
    + Math.min(8, (frame1h.pumpPct - rule.minPumpPct) * 0.15)
    + Math.min(7, (frame1h.drawdownPct - rule.minPeakDrawdownPct) * 0.20)
    + Math.min(7, Math.max(0, frame15m.volumeRatio - rule.minSpikeVolumeRatio) * 0.6)
    + Math.min(7, Math.max(0, frame15m.peakToConfirmDropPct - rule.minPeakToConfirmDropPct) * 0.8)
    + Math.min(6, Math.max(0, frame15m.ema99SlopeR2 - rule.minEma99SlopeR2) * 75),
  ), 0, 100);
  return {
    version: WEEK_LONG_POST_PUMP_EMA99_SLOPE_VERSION,
    label: WEEK_LONG_POST_PUMP_EMA99_SLOPE_LABEL,
    stage: WEEK_LONG_POST_PUMP_EMA99_SLOPE_LABEL,
    symbol: normalizedSymbol,
    side: 'SHORT',
    interval: '15m+1h',
    observeOnly: true,
    binanceEligible: false,
    executionEnabled: false,
    score,
    signalAt: frame15m.signalAt,
    signalPrice: frame15m.confirmationClose,
    confirmationClose: frame15m.confirmationClose,
    frame15m,
    frame1h,
    invalidationPrice: Math.max(frame15m.spikeHigh, frame15m.spikeEma99),
    generatedAt: new Date(now).toISOString(),
    dedupeKey: `${normalizedSymbol}|${WEEK_LONG_POST_PUMP_EMA99_SLOPE_LABEL}|${frame15m.spikeAt}`,
  };
}

export function collectWeekLongPostPumpEma99SlopeEvent(event, now = Date.now()) {
  if (!event
    || event.version !== WEEK_LONG_POST_PUMP_EMA99_SLOPE_VERSION
    || event.label !== WEEK_LONG_POST_PUMP_EMA99_SLOPE_LABEL
    || event.side !== 'SHORT'
    || event.observeOnly !== true
    || event.binanceEligible !== false
    || !Number.isFinite(event.signalAt)
    || now - event.signalAt < -60_000
    || now - event.signalAt > WEEK_LONG_POST_PUMP_EMA99_SLOPE_RULE.maxSignalAgeMs) return null;
  return event;
}

export function buildWeekLongPostPumpEma99SlopePayload(event) {
  const symbol = encodeURIComponent(event.symbol);
  const coin = encodeURIComponent(event.symbol.replace(/USDT$/, ''));
  const fifteen = event.frame15m;
  const hourly = event.frame1h;
  const mark = finite(event.markPrice);
  const markDrift = mark > 0 ? (mark / event.confirmationClose - 1) * 100 : null;
  return {
    username: 'Week-long Pump Fade EMA99',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `🔻 ${event.symbol} · XẢ DÀI SAU BƠM · EMA99 15M DỐC XUỐNG · SPIKE BỊ BÁN`,
      color: 0x991b1b,
      description: [
        `**${event.label} · điểm ${event.score}/100 · SHORT WATCH**`,
        'Bơm lớn đã cách nhiều ngày, giá xả theo dốc; EMA99 15m gần thành đường thẳng dốc xuống. Cú hồi volume lớn chạm EMA99 nhưng nến đóng kế tiếp bán ngược.',
        '**OBSERVE ONLY — KHÔNG TỰ ĐẶT LỆNH BINANCE.**',
      ].join('\n'),
      fields: [
        {
          name: '💰 GIÁ LÚC PHÁT',
          value: `**\`${price(mark > 0 ? mark : event.signalPrice)} USDT\`**\nClose xác nhận 15m ${price(event.confirmationClose)}${Number.isFinite(markDrift) ? ` · mark lệch ${pct(markDrift)}` : ''}`,
        },
        {
          name: '🏔️ BƠM TUẦN TRƯỚC → XẢ KÉO DÀI',
          value: `Nền ${price(hourly.baseLow)} → đỉnh ${price(hourly.peakHigh)}: **${pct(hourly.pumpPct)}**\nĐỉnh cách **${hourly.peakAgeHours.toFixed(1)}h** · giá xác nhận thấp hơn đỉnh **${hourly.drawdownPct.toFixed(1)}%**\n72h gần nhất ${pct(hourly.recentDeclinePct)} · R² ${hourly.recentDeclineR2.toFixed(3)} · ${hourly.decliningSegments}/2 chặng median giảm\nĐỉnh 1h: ${localTime(hourly.peakAt)} (VN)`,
        },
        {
          name: '📉 EMA99 15M · DỐC VÀ THẲNG',
          value: `EMA99 ${price(fifteen.ema99)} · dốc quy đổi 24h **${pct(fifteen.ema99DailySlopePct)}**\nR² **${fifteen.ema99SlopeR2.toFixed(3)}** · ${(fifteen.ema99DecliningShare * 100).toFixed(0)}% bước EMA99 giảm · ${(fifteen.belowEma99Share * 100).toFixed(0)}% close dưới EMA99\nClose ${price(fifteen.confirmationClose)} < EMA13 ${price(fifteen.ema13)} < EMA25 ${price(fifteen.ema25)} < EMA99 ${price(fifteen.ema99)}`,
        },
        {
          name: '💥 SPIKE CHẠM EMA99 RỒI BỊ BÁN NGƯỢC',
          value: `Open → high **${pct(fifteen.openToHighPct)}** · biên nến ${fifteen.rangePct.toFixed(2)}% · volume **${fifteen.volumeRatio.toFixed(2)}×** median20\nHigh ${price(fifteen.spikeHigh)} · cách EMA99 ${pct(fifteen.highVsEma99Pct)} · râu trên ${(fifteen.upperWickShare * 100).toFixed(0)}%\nNến xác nhận volume ${fifteen.confirmationVolumeRatio.toFixed(2)}× · từ high xuống close **-${fifteen.peakToConfirmDropPct.toFixed(2)}%**\nSpike ${localTime(fifteen.spikeAt)} · xác nhận ${localTime(fifteen.confirmationAt)} (VN)`,
        },
        {
          name: '⚠️ CÁCH DÙNG',
          value: `Mốc vô hiệu tham khảo **${price(event.invalidationPrice)}** (trên spike/EMA99). Đây là cảnh báo tiếp diễn xu hướng giảm, không phải entry SHORT hay cam kết giá sẽ giảm; không đuổi theo nến đỏ.`,
        },
        {
          name: 'MỞ BIỂU ĐỒ',
          value: `[Binance](https://www.binance.com/en/futures/${symbol}) · [CoinGlass Model 3](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${coin})`,
        },
      ],
      timestamp: event.generatedAt,
      footer: { text: `${WEEK_LONG_POST_PUMP_EMA99_SLOPE_VERSION} · closed 1h context + closed 15m reject` },
    }],
  };
}

export async function scanWeekLongPostPumpEma99Slope(
  symbols,
  klineCache,
  notify,
  {
    now = Date.now(),
    maxAlerts = 10,
    maxOneHourWarmups = 6,
    ensureOneHour = null,
    signalPrices = null,
    config = {},
  } = {},
) {
  const events = [];
  let processed = 0;
  let candidates = 0;
  let oneHourReady = 0;
  let warmed = 0;
  for (const symbol of [...new Set(Array.isArray(symbols) ? symbols : [])]) {
    const klines15m = klineCache?.getIfCached?.(
      symbol,
      '15m',
      WEEK_LONG_POST_PUMP_EMA99_SLOPE_RULE.maxBars15m,
    );
    if (!Array.isArray(klines15m)) continue;
    processed += 1;
    const preliminary = detectWeekLongPostPumpEma99Slope15mReject({
      klines15m, now, config,
    });
    if (!preliminary) continue;
    candidates += 1;
    let klines1h = klineCache?.getIfCached?.(
      symbol,
      '1h',
      WEEK_LONG_POST_PUMP_EMA99_SLOPE_RULE.maxBars1h,
    );
    if ((!Array.isArray(klines1h)
      || klines1h.length < WEEK_LONG_POST_PUMP_EMA99_SLOPE_RULE.minBars1h)
      && typeof ensureOneHour === 'function' && warmed < maxOneHourWarmups) {
      await ensureOneHour(symbol);
      warmed += 1;
      klines1h = klineCache?.getIfCached?.(
        symbol,
        '1h',
        WEEK_LONG_POST_PUMP_EMA99_SLOPE_RULE.maxBars1h,
      );
    }
    if (!Array.isArray(klines1h)) continue;
    oneHourReady += 1;
    const event = detectWeekLongPostPumpEma99SlopeReject({
      symbol, klines15m, klines1h, now, config,
    });
    if (!event) continue;
    const normalizedSymbol = String(symbol).toUpperCase();
    const markPrice = finite(signalPrices instanceof Map
      ? signalPrices.get(normalizedSymbol)
      : signalPrices?.[normalizedSymbol]);
    events.push({
      ...event,
      markPrice: markPrice > 0 ? markPrice : null,
      signalPrice: markPrice > 0 ? markPrice : event.signalPrice,
      signalPriceSource: markPrice > 0 ? 'BINANCE_MARKET_SNAPSHOT' : 'CLOSED_15M',
    });
  }
  events.sort((left, right) => right.score - left.score || right.signalAt - left.signalAt);
  let sent = 0;
  let failed = 0;
  for (const event of events.slice(0, Math.max(1, maxAlerts))) {
    try {
      sent += Number((await notify(event))?.sent ?? 0);
    } catch {
      failed += 1;
    }
  }
  return {
    processed,
    candidates,
    oneHourReady,
    warmed,
    detected: events.length,
    sent,
    failed,
    top: events.slice(0, 10),
  };
}
