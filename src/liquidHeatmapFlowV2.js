import { buildFlagpoleShortKillSnapshot } from './liquidFlowV2FlagpoleShortKill.js';
import { buildFadingWaveLivePumpSnapshot } from './liquidFlowV2FadingWaveLivePump.js';

export const LIQUID_HEATMAP_FLOW_V2_VERSION = 'LIQUID_HEATMAP_FLOW_V2_FADING_WAVE_LIVE_RECOVERY_V24_20260819';
export const PUMP_FLUSH_RECLAIM_VERSION = 'PUMP_FLUSH_RECLAIM_5M_V1_20260816';

export const LIQUID_HEATMAP_FLOW_V2_LABELS = Object.freeze({
  UP_SQUEEZE_ACTIVE: Object.freeze({
    key: 'UP_SQUEEZE_ACTIVE',
    title: 'UP SQUEEZE ACTIVE',
    side: 'SHORT',
    phase: 'WAIT',
    description: 'Short squeeze dang chay; khong duoi SHORT khi chua co reject.',
  }),
  UP_SWEEP_SHORT_READY: Object.freeze({
    key: 'UP_SWEEP_SHORT_READY',
    title: 'UP SWEEP · SHORT READY',
    side: 'SHORT',
    phase: 'READY',
    description: 'Da quet cum tren va co xac nhan suy yeu sau squeeze.',
  }),
  UP_SWEEP_SHORT_WATCH: Object.freeze({
    key: 'UP_SWEEP_SHORT_WATCH',
    title: 'UP SWEEP · SHORT WATCH',
    side: 'SHORT',
    phase: 'WAIT',
    description: 'Da quet/reject cum tren nhung con cho nen 5m retest-fail, OI washout va short-liquidation ket thuc.',
  }),
  UP_BASE_SWEEP_LONG_READY: Object.freeze({
    key: 'UP_BASE_SWEEP_LONG_READY',
    title: 'UP BASE SWEEP · LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'Quet day base, giu reclaim va breakout tiep dien theo huong tang.',
  }),
  PRE_UP_BASE_LONG: Object.freeze({
    key: 'PRE_UP_BASE_LONG',
    title: 'PRE UP BASE · LONG',
    side: 'LONG',
    phase: 'READY',
    description: 'Rau nen 5m cham EMA99 roi reclaim; vao som truoc khi du BASE READY.',
  }),
  EXTENDED_EMA99_PANIC_RECLAIM_LONG: Object.freeze({
    key: 'EXTENDED_EMA99_PANIC_RECLAIM_LONG',
    title: 'EXTENDED EMA99 PANIC RECLAIM · LONG',
    side: 'LONG',
    phase: 'READY',
    description: 'Top tang hang 21-60 panic dump ve EMA99 5m roi hoi va reclaim co volume; PAPER EVAL ONLY.',
  }),
  PRIMARY_EMA99_PANIC_FLUSH_ACTIVE: Object.freeze({
    key: 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE',
    title: 'PRIMARY EMA99 PANIC FLUSH · ACTIVE',
    side: 'LONG',
    phase: 'WAIT',
    description: 'Top tang 1-20 dang bi ban thao ve EMA99 5m; chi ghi nhan, chua bat LONG khi dong tien ban con manh.',
  }),
  PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY: Object.freeze({
    key: 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY',
    title: 'PRIMARY EMA99 PANIC RECLAIM · LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'Top tang 1-20 da panic flush ve EMA99 5m, hoi khoi day va reclaim khi ap luc ban ha nhiet. Binance MARKET $2 x 5x.',
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: true,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  }),
  DOWN_SQUEEZE_ACTIVE: Object.freeze({
    key: 'DOWN_SQUEEZE_ACTIVE',
    title: 'DOWN SQUEEZE ACTIVE',
    side: 'LONG',
    phase: 'WAIT',
    description: 'Long liquidation dang chay; khong bat LONG khi chua reclaim.',
  }),
  DOWN_SWEEP_LONG_READY: Object.freeze({
    key: 'DOWN_SWEEP_LONG_READY',
    title: 'DOWN SWEEP · LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'Da quet cum duoi va co xac nhan hap thu/reclaim.',
  }),
  DOWN_SWEEP_LONG_WATCH: Object.freeze({
    key: 'DOWN_SWEEP_LONG_WATCH',
    title: 'DOWN SWEEP · LONG WATCH',
    side: 'LONG',
    phase: 'WAIT',
    description: 'Da quet/reclaim cum duoi nhung chi theo doi; cho pullback ngay tang dong reclaim EMA13/25 hoac exhaustion rieng.',
  }),
  KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY: Object.freeze({
    key: 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY',
    title: 'KILL LONG EXHAUSTION · LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'Cascade kill LONG da suy kiet: force SELL giam, OI on dinh, taker mua va nen 5m dong reclaim EMA nhanh. PAPER ONLY.',
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: false,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  }),
  DOWN_BASE_SWEEP_SHORT_READY: Object.freeze({
    key: 'DOWN_BASE_SWEEP_SHORT_READY',
    title: 'DOWN BASE SWEEP · SHORT READY',
    side: 'SHORT',
    phase: 'READY',
    description: 'Quet dinh base, giu reject va breakdown tiep dien theo huong giam.',
  }),
  PRE_DOWN_BASE_SHORT: Object.freeze({
    key: 'PRE_DOWN_BASE_SHORT',
    title: 'PRE DOWN BASE · SHORT',
    side: 'SHORT',
    phase: 'READY',
    description: 'Rau nen 5m cham EMA99 roi reject; vao som truoc khi du BASE READY.',
  }),
  HTF_BEAR_15M_EMA99_PUMP_REJECT: Object.freeze({
    key: 'HTF_BEAR_15M_EMA99_PUMP_REJECT',
    title: 'HTF BEAR · 5M/15M EMA99 PUMP REJECT',
    side: 'SHORT',
    phase: 'READY',
    description: '1h/4h giam; pump 5m hoac 15m quet EMA99 roi dong reject xuong. PAPER EVAL ONLY.',
  }),
  HTF_BULL_15M_EMA99_DUMP_RECLAIM: Object.freeze({
    key: 'HTF_BULL_15M_EMA99_DUMP_RECLAIM',
    title: 'HTF BULL · 5M/15M EMA99 DUMP RECLAIM',
    side: 'LONG',
    phase: 'READY',
    description: '1h/4h tang; dump 5m hoac 15m quet EMA99 roi dong reclaim len. PAPER EVAL ONLY.',
  }),
  PUMP_DISTRIBUTION_WATCH: Object.freeze({
    key: 'PUMP_DISTRIBUTION_WATCH',
    title: 'PUMP DISTRIBUTION · WATCH',
    side: 'SHORT',
    phase: 'WATCH',
    description: 'Pump manh da chuyen sang sideway/phan phoi; cho breakdown va retest that bai. OBSERVE ONLY.',
  }),
  PUMP_DISTRIBUTION_SHORT_READY: Object.freeze({
    key: 'PUMP_DISTRIBUTION_SHORT_READY',
    title: 'PUMP DISTRIBUTION · SHORT READY',
    side: 'SHORT',
    phase: 'READY',
    description: 'Vung phan phoi da breakdown va retest ho tro that bai. PAPER EVAL ONLY.',
  }),
  POST_PUMP_BASE_ABSORPTION_WATCH: Object.freeze({
    key: 'POST_PUMP_BASE_ABSORPTION_WATCH',
    title: 'POST PUMP BASE ABSORPTION · WATCH',
    side: 'LONG',
    phase: 'WATCH',
    description: 'Pump >=30% da sap 25-75% va co base 5m co hep/volume fade; cho breakout dong cua. OBSERVE ONLY.',
    observationOnly: true,
    affectsOrders: false,
    affectsBinance: false,
    affectsEntry: false,
    affectsSize: false,
    affectsSlTp: false,
  }),
  POST_PUMP_SHORT_SQUEEZE_LONG_READY: Object.freeze({
    key: 'POST_PUMP_SHORT_SQUEEZE_LONG_READY',
    title: 'POST PUMP SHORT SQUEEZE · LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'Base sau pump/sap da breakout bang nen 5m dong, volume va taker mua. Binance MARKET $2 x 5x.',
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: true,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  }),
  POST_PUMP_SHORT_SQUEEZE_PRIME: Object.freeze({
    key: 'POST_PUMP_SHORT_SQUEEZE_PRIME',
    title: 'POST PUMP SHORT SQUEEZE · PRIME',
    side: 'LONG',
    phase: 'READY',
    description: 'LONG READY kem sell-flow tich luy trong base <= -1%, phu hop gia thuyet hap thu short. PAPER $10 x 5x ONLY.',
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: false,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  }),
  POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY: Object.freeze({
    key: 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY',
    title: 'POST PUMP FLAGPOLE · SHORT KILL LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'Đã có pump trước + pullback, sau đó flagpole 5m breakout và nến kế tiếp rút râu/reclaim trong lúc force BUY kill SHORT bùng lên. PAPER $10 × 5x ONLY.',
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: false,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  }),
  FADING_WAVE_LIVE_PUMP_SHORT_READY: Object.freeze({
    key: 'FADING_WAVE_LIVE_PUMP_SHORT_READY',
    title: 'FADING WAVE · LIVE PUMP SHORT READY',
    side: 'SHORT',
    phase: 'READY',
    description: 'Coin sóng tàn đang downtrend dựng nến 5m live trên volume/taker rồi bắt đầu rút khỏi đỉnh. Binance MARKET $1 × 5x ngay trong nến.',
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: true,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  }),
  PUMP_FLUSH_RECLAIM_LONG_READY: Object.freeze({
    key: 'PUMP_FLUSH_RECLAIM_LONG_READY',
    title: 'PUMP FLUSH RECLAIM · LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'Nến 5m pump >=8% với volume/ATR lớn, xả 55-105% về chân nhưng giữ base, sau đó nến đóng reclaim EMA + taker mua. Binance MARKET $1.5 margin × 5x.',
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: true,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  }),
  EMA_FAN_LONG_READY: Object.freeze({
    key: 'EMA_FAN_LONG_READY',
    title: 'EMA FAN · LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'EMA fan bullish thuong: cham EMA13 +1% chi arm retest; doi nen 5m dong reclaim + higher-low + taker mua roi paper/Binance moi vao.',
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: true,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  }),
  EMA_FAN_LONG_IMPULSE_RUNNER: Object.freeze({
    key: 'EMA_FAN_LONG_IMPULSE_RUNNER',
    title: 'EMA FAN · LONG IMPULSE RUNNER',
    side: 'LONG',
    phase: 'READY',
    description: 'EMA fan bullish cuc manh: volume breakout >=5x, body >=1%, rank top 100; Binance MARKET $5 o 5x ngay khi READY.',
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: true,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  }),
  EMA_FAN_SHORT_READY: Object.freeze({
    key: 'EMA_FAN_SHORT_READY',
    title: 'EMA FAN · SHORT READY',
    side: 'SHORT',
    phase: 'READY',
    description: 'Top 150 thanh khoản, ngày giảm ít nhất 5%: EMA13/25/99 nén rồi bung fan bearish trên nến 5m đóng. PAPER ONLY $10 × 5x.',
    observationOnly: true,
    affectsOrders: false,
    affectsBinance: false,
    affectsEntry: false,
    affectsSize: false,
    affectsSlTp: false,
  }),
});

const STABLE_PAIR_PATTERN = /^(USDC|FDUSD|TUSD|USDP|BUSD|DAI|EUR|TRY|BRL|JPY|GBP)USDT$/;

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values = []) {
  const usable = values.map(Number).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function median(values = []) {
  const usable = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function pctChange(from, to) {
  const start = finite(from, 0);
  const end = finite(to, 0);
  return start > 0 && end > 0 ? (end - start) / start * 100 : null;
}

function movingAverage(values, period) {
  const usable = values.slice(-period).map(Number).filter(Number.isFinite);
  return usable.length ? mean(usable) : null;
}

function exponentialMovingAverage(values, period) {
  const usable = values.map(Number).filter(Number.isFinite);
  if (usable.length < period) return null;
  let value = mean(usable.slice(0, period));
  const multiplier = 2 / (period + 1);
  for (const price of usable.slice(period)) value = (price - value) * multiplier + value;
  return value;
}

function exponentialMovingAverageSeries(values = [], period = 1) {
  const source = values.map((value) => finite(value, null));
  const result = Array(source.length).fill(null);
  if (period < 1 || source.length < period || source.slice(0, period).some((value) => value == null)) return result;
  let current = mean(source.slice(0, period));
  result[period - 1] = current;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < source.length; index += 1) {
    if (source[index] == null) continue;
    current = (source[index] - current) * multiplier + current;
    result[index] = current;
  }
  return result;
}

function rsiSeries(values = [], period = 14) {
  const source = values.map((value) => finite(value, null));
  const result = Array(source.length).fill(null);
  for (let index = period; index < source.length; index += 1) {
    let gains = 0;
    let losses = 0;
    let ready = true;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      if (source[cursor] == null || source[cursor - 1] == null) {
        ready = false;
        break;
      }
      const delta = source[cursor] - source[cursor - 1];
      if (delta >= 0) gains += delta;
      else losses -= delta;
    }
    if (!ready) continue;
    result[index] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  }
  return result;
}

function closedBarsAt(klines = [], now = Date.now(), limit = 180) {
  return (Array.isArray(klines) ? klines : [])
    .filter((bar) => finite(bar?.close, 0) > 0 && (!bar.closeTime || finite(bar.closeTime, 0) <= now))
    .slice(-limit);
}

export function buildEmaFanLongSnapshot(klines = [], now = Date.now()) {
  const bars = closedBarsAt(klines, now, 220);
  if (bars.length < 120) return {
    ready: false,
    watchActive: false,
    candleCount: bars.length,
    missing: ['closed-5m-candles'],
  };

  const closes = bars.map((bar) => finite(bar.close, 0));
  const ema13 = exponentialMovingAverageSeries(closes, 13);
  const ema25 = exponentialMovingAverageSeries(closes, 25);
  const ema99 = exponentialMovingAverageSeries(closes, 99);
  const rsi14 = rsiSeries(closes, 14);
  const spreads = closes.map((_, index) => {
    const values = [ema13[index], ema25[index], ema99[index]];
    if (values.some((value) => value == null || value <= 0)) return null;
    return (Math.max(...values) - Math.min(...values)) / mean(values) * 100;
  });
  const lastIndex = bars.length - 1;
  let watchIndex = null;
  let watchMetrics = null;
  for (let index = Math.max(99, lastIndex - 4); index <= lastIndex; index += 1) {
    const priorSpreads = spreads.slice(index - 12, index).filter(Number.isFinite);
    const priorBars = bars.slice(index - 12, index);
    const priorVolumes = bars.slice(index - 20, index)
      .map((bar) => finite(bar.quoteVolume, finite(bar.volume, 0)))
      .filter((value) => value > 0);
    const bar = bars[index];
    const close = closes[index];
    const open = finite(bar.open, close);
    const emaBandHigh = Math.max(ema13[index], ema25[index], ema99[index]);
    const priorHigh = priorBars.length === 12
      ? Math.max(...priorBars.map((row) => finite(row.high, finite(row.close, 0))))
      : null;
    const volume = finite(bar.quoteVolume, finite(bar.volume, 0));
    const baselineVolume = mean(priorVolumes);
    const volumeX = baselineVolume > 0 ? volume / baselineVolume : null;
    const bodyPct = close > 0 ? (close - open) / close * 100 : null;
    const distanceFromEma13Pct = ema13[index] > 0 ? (close / ema13[index] - 1) * 100 : null;
    const compressedBars = priorSpreads.filter((value) => value <= 1.5).length;
    const priorMedianSpreadPct = median(priorSpreads);
    const matched = priorSpreads.length === 12
      && priorMedianSpreadPct <= 1
      && compressedBars >= 8
      && spreads[index] <= 0.8
      && close > emaBandHigh
      && priorHigh != null && close > priorHigh
      && bodyPct >= 0.4
      && volumeX != null && volumeX >= 2.5
      && ema13[index] > ema13[index - 3]
      && ema25[index] > ema25[index - 3]
      && rsi14[index] >= 50 && rsi14[index] <= 78
      && distanceFromEma13Pct <= 3;
    if (!matched) continue;
    watchIndex = index;
    watchMetrics = {
      priorMedianSpreadPct,
      compressedBars,
      spreadPct: spreads[index],
      bodyPct,
      volumeX,
      watchRsi14: rsi14[index],
      watchDistanceFromEma13Pct: distanceFromEma13Pct,
      breakoutLevel: priorHigh,
    };
    break;
  }

  const gap1325 = ema13[lastIndex] != null && ema25[lastIndex] != null
    ? (ema13[lastIndex] - ema25[lastIndex]) / ema25[lastIndex] * 100
    : null;
  const gap2599 = ema25[lastIndex] != null && ema99[lastIndex] != null
    ? (ema25[lastIndex] - ema99[lastIndex]) / ema99[lastIndex] * 100
    : null;
  const previousGap1325 = ema13[lastIndex - 1] != null && ema25[lastIndex - 1] != null
    ? (ema13[lastIndex - 1] - ema25[lastIndex - 1]) / ema25[lastIndex - 1] * 100
    : null;
  const previousGap2599 = ema25[lastIndex - 1] != null && ema99[lastIndex - 1] != null
    ? (ema25[lastIndex - 1] - ema99[lastIndex - 1]) / ema99[lastIndex - 1] * 100
    : null;
  const currentDistancePct = ema13[lastIndex] > 0 ? (closes[lastIndex] / ema13[lastIndex] - 1) * 100 : null;
  const readyAtIndex = (index) => {
    const currentGap1325 = ema13[index] != null && ema25[index] != null
      ? (ema13[index] - ema25[index]) / ema25[index] * 100
      : null;
    const previousGap1325 = ema13[index - 1] != null && ema25[index - 1] != null
      ? (ema13[index - 1] - ema25[index - 1]) / ema25[index - 1] * 100
      : null;
    const currentGap2599 = ema25[index] != null && ema99[index] != null
      ? (ema25[index] - ema99[index]) / ema99[index] * 100
      : null;
    const previousGap2599 = ema25[index - 1] != null && ema99[index - 1] != null
      ? (ema25[index - 1] - ema99[index - 1]) / ema99[index - 1] * 100
      : null;
    const distancePct = ema13[index] > 0 ? (closes[index] / ema13[index] - 1) * 100 : null;
    return ema13[index] > ema25[index]
      && ema25[index] > ema99[index]
      && currentGap1325 > Math.max(0, previousGap1325)
      && currentGap2599 > Math.max(0, previousGap2599)
      && rsi14[index] <= 85
      && distancePct <= 4;
  };
  let firstReadyIndex = null;
  if (watchIndex != null) {
    for (let index = watchIndex; index <= Math.min(lastIndex, watchIndex + 4); index += 1) {
      if (!readyAtIndex(index)) continue;
      firstReadyIndex = index;
      break;
    }
  }
  const ready = firstReadyIndex != null;

  return {
    ready,
    watchActive: watchIndex != null,
    candleCount: bars.length,
    watchAt: watchIndex != null ? finite(bars[watchIndex]?.closeTime, null) : null,
    readyAt: ready ? finite(bars[firstReadyIndex]?.closeTime, null) : null,
    candleClosedAt: finite(bars[lastIndex]?.closeTime, null),
    ema13: ema13[lastIndex],
    ema25: ema25[lastIndex],
    ema99: ema99[lastIndex],
    gap1325Pct: gap1325,
    gap2599Pct: gap2599,
    gap1325PrevPct: previousGap1325,
    gap2599PrevPct: previousGap2599,
    gap1325Widening: gap1325 != null && previousGap1325 != null
      ? gap1325 > Math.max(0, previousGap1325)
      : null,
    gap2599Widening: gap2599 != null && previousGap2599 != null
      ? gap2599 > Math.max(0, previousGap2599)
      : null,
    fanOrdered: ema13[lastIndex] > ema25[lastIndex] && ema25[lastIndex] > ema99[lastIndex],
    rsi14: rsi14[lastIndex],
    distanceFromEma13Pct: currentDistancePct,
    ...watchMetrics,
    missing: [],
  };
}

export function buildEmaFanShortSnapshot(klines = [], now = Date.now()) {
  const bars = closedBarsAt(klines, now, 220);
  if (bars.length < 120) return {
    ready: false,
    watchActive: false,
    candleCount: bars.length,
    missing: ['closed-5m-candles'],
  };

  const closes = bars.map((bar) => finite(bar.close, 0));
  const ema13 = exponentialMovingAverageSeries(closes, 13);
  const ema25 = exponentialMovingAverageSeries(closes, 25);
  const ema99 = exponentialMovingAverageSeries(closes, 99);
  const rsi14 = rsiSeries(closes, 14);
  const spreads = closes.map((_, index) => {
    const values = [ema13[index], ema25[index], ema99[index]];
    if (values.some((value) => value == null || value <= 0)) return null;
    return (Math.max(...values) - Math.min(...values)) / mean(values) * 100;
  });
  const lastIndex = bars.length - 1;
  let watchIndex = null;
  let watchMetrics = null;
  for (let index = Math.max(99, lastIndex - 4); index <= lastIndex; index += 1) {
    const priorSpreads = spreads.slice(index - 12, index).filter(Number.isFinite);
    const priorBars = bars.slice(index - 12, index);
    const priorVolumes = bars.slice(index - 20, index)
      .map((bar) => finite(bar.quoteVolume, finite(bar.volume, 0)))
      .filter((value) => value > 0);
    const bar = bars[index];
    const close = closes[index];
    const open = finite(bar.open, close);
    const emaBandLow = Math.min(ema13[index], ema25[index], ema99[index]);
    const priorLow = priorBars.length === 12
      ? Math.min(...priorBars.map((row) => finite(row.low, finite(row.close, Infinity))))
      : null;
    const volume = finite(bar.quoteVolume, finite(bar.volume, 0));
    const baselineVolume = mean(priorVolumes);
    const volumeX = baselineVolume > 0 ? volume / baselineVolume : null;
    const bodyPct = close > 0 ? (open - close) / close * 100 : null;
    const distanceFromEma13Pct = ema13[index] > 0 ? (ema13[index] / close - 1) * 100 : null;
    const compressedBars = priorSpreads.filter((value) => value <= 1.5).length;
    const priorMedianSpreadPct = median(priorSpreads);
    const matched = priorSpreads.length === 12
      && priorMedianSpreadPct <= 1
      && compressedBars >= 8
      && spreads[index] <= 0.8
      && close < emaBandLow
      && priorLow != null && close < priorLow
      && bodyPct >= 0.4
      && volumeX != null && volumeX >= 2.5
      && ema13[index] < ema13[index - 3]
      && ema25[index] < ema25[index - 3]
      && rsi14[index] >= 22 && rsi14[index] <= 50
      && distanceFromEma13Pct <= 2.5;
    if (!matched) continue;
    watchIndex = index;
    watchMetrics = {
      priorMedianSpreadPct,
      compressedBars,
      spreadPct: spreads[index],
      bodyPct,
      volumeX,
      watchRsi14: rsi14[index],
      watchDistanceFromEma13Pct: distanceFromEma13Pct,
      breakdownLevel: priorLow,
    };
    break;
  }

  const gap1325 = ema13[lastIndex] != null && ema25[lastIndex] != null
    ? (ema25[lastIndex] - ema13[lastIndex]) / ema25[lastIndex] * 100
    : null;
  const gap2599 = ema25[lastIndex] != null && ema99[lastIndex] != null
    ? (ema99[lastIndex] - ema25[lastIndex]) / ema99[lastIndex] * 100
    : null;
  const currentDistancePct = ema13[lastIndex] > 0 ? (ema13[lastIndex] / closes[lastIndex] - 1) * 100 : null;
  const readyAtIndex = (index) => {
    const currentGap1325 = ema13[index] != null && ema25[index] != null
      ? (ema25[index] - ema13[index]) / ema25[index] * 100
      : null;
    const previousGap1325 = ema13[index - 1] != null && ema25[index - 1] != null
      ? (ema25[index - 1] - ema13[index - 1]) / ema25[index - 1] * 100
      : null;
    const currentGap2599 = ema25[index] != null && ema99[index] != null
      ? (ema99[index] - ema25[index]) / ema99[index] * 100
      : null;
    const previousGap2599 = ema25[index - 1] != null && ema99[index - 1] != null
      ? (ema99[index - 1] - ema25[index - 1]) / ema99[index - 1] * 100
      : null;
    const distancePct = ema13[index] > 0 ? (ema13[index] / closes[index] - 1) * 100 : null;
    return ema13[index] < ema25[index]
      && ema25[index] < ema99[index]
      && currentGap1325 > Math.max(0, previousGap1325)
      && currentGap2599 > Math.max(0, previousGap2599)
      && rsi14[index] >= 15
      && distancePct <= 4;
  };
  let firstReadyIndex = null;
  if (watchIndex != null) {
    for (let index = watchIndex; index <= Math.min(lastIndex, watchIndex + 4); index += 1) {
      if (!readyAtIndex(index)) continue;
      firstReadyIndex = index;
      break;
    }
  }
  const ready = firstReadyIndex != null;

  return {
    ready,
    watchActive: watchIndex != null,
    candleCount: bars.length,
    watchAt: watchIndex != null ? finite(bars[watchIndex]?.closeTime, null) : null,
    readyAt: ready ? finite(bars[firstReadyIndex]?.closeTime, null) : null,
    candleClosedAt: finite(bars[lastIndex]?.closeTime, null),
    ema13: ema13[lastIndex],
    ema25: ema25[lastIndex],
    ema99: ema99[lastIndex],
    gap1325Pct: gap1325,
    gap2599Pct: gap2599,
    rsi14: rsi14[lastIndex],
    distanceFromEma13Pct: currentDistancePct,
    ...watchMetrics,
    missing: [],
  };
}

function buildHtfTrendSnapshot(klines = [], timeframe, now = Date.now()) {
  const bars = closedBarsAt(klines, now, 160);
  const closes = bars.map((bar) => finite(bar.close, 0));
  const ema13 = exponentialMovingAverage(closes, 13);
  const ema25 = exponentialMovingAverage(closes, 25);
  const ema99 = exponentialMovingAverage(closes, 99);
  const priorCloses = closes.slice(0, -3);
  const priorEma13 = exponentialMovingAverage(priorCloses, 13);
  const priorEma25 = exponentialMovingAverage(priorCloses, 25);
  const ema13SlopePct = priorEma13 != null && ema13 != null ? pctChange(priorEma13, ema13) : null;
  const ema25SlopePct = priorEma25 != null && ema25 != null ? pctChange(priorEma25, ema25) : null;
  const recent = bars.slice(-5);
  let lowerHighSteps = 0;
  let lowerLowSteps = 0;
  let higherHighSteps = 0;
  let higherLowSteps = 0;
  for (let index = 1; index < recent.length; index += 1) {
    if (finite(recent[index].high, 0) < finite(recent[index - 1].high, 0)) lowerHighSteps += 1;
    if (finite(recent[index].low, 0) < finite(recent[index - 1].low, 0)) lowerLowSteps += 1;
    if (finite(recent[index].high, 0) > finite(recent[index - 1].high, 0)) higherHighSteps += 1;
    if (finite(recent[index].low, 0) > finite(recent[index - 1].low, 0)) higherLowSteps += 1;
  }
  const close = finite(bars.at(-1)?.close, null);
  const ready = bars.length >= 105 && close != null && ema13 != null && ema25 != null && ema99 != null;
  const bearish = ready
    && close < ema13 && close < ema25
    && ema13SlopePct <= -0.02
    && (ema25SlopePct <= 0.05 || lowerLowSteps >= 2)
    && lowerHighSteps >= 2;
  const bullish = ready
    && close > ema13 && close > ema25
    && ema13SlopePct >= 0.02
    && (ema25SlopePct >= -0.05 || higherHighSteps >= 2)
    && higherLowSteps >= 2;
  return {
    timeframe,
    ready,
    candleCount: bars.length,
    candleClosedAt: finite(bars.at(-1)?.closeTime, null),
    close,
    ema13,
    ema25,
    ema99,
    ema13SlopePct,
    ema25SlopePct,
    lowerHighSteps,
    lowerLowSteps,
    higherHighSteps,
    higherLowSteps,
    bearish,
    bullish,
  };
}

function buildEma99RetestSnapshot(klines = [], now = Date.now(), timeframe = '15m') {
  const bars = closedBarsAt(klines, now, 160);
  const closes = bars.map((bar) => finite(bar.close, 0));
  const ema99 = exponentialMovingAverage(closes, 99);
  const last = bars.at(-1) ?? null;
  const touchBars = bars.slice(-2);
  const context = bars.slice(-10, -2);
  const volumeBase = bars.slice(-22, -2).map((bar) => finite(bar.quoteVolume, 0));
  const touchVolume = touchBars.length ? Math.max(...touchBars.map((bar) => finite(bar.quoteVolume, 0))) : 0;
  const volumeX = mean(volumeBase) > 0 ? touchVolume / mean(volumeBase) : null;
  const touchQuote = touchBars.reduce((sum, bar) => sum + finite(bar.quoteVolume, 0), 0);
  const touchTakerBuy = touchBars.reduce((sum, bar) => sum + finite(bar.takerBuyQuoteVolume, 0), 0);
  const takerDeltaPct = touchQuote > 0 ? (touchTakerBuy * 2 - touchQuote) / touchQuote * 100 : null;
  const touchHigh = touchBars.length ? Math.max(...touchBars.map((bar) => finite(bar.high, 0))) : null;
  const touchLow = touchBars.length ? Math.min(...touchBars.map((bar) => finite(bar.low, Infinity))) : null;
  const contextHigh = context.length ? Math.max(...context.map((bar) => finite(bar.high, 0))) : null;
  const contextLow = context.length ? Math.min(...context.map((bar) => finite(bar.low, Infinity))) : null;
  const close = finite(last?.close, null);
  const priorClose = finite(bars.at(-3)?.close, null);
  const shortTouchDistancePct = ema99 > 0 && touchHigh > 0 ? (touchHigh - ema99) / ema99 * 100 : null;
  const longTouchDistancePct = ema99 > 0 && touchLow > 0 ? (touchLow - ema99) / ema99 * 100 : null;
  const closeDistancePct = ema99 > 0 && close > 0 ? (close - ema99) / ema99 * 100 : null;
  const pumpPct = contextLow > 0 && touchHigh > 0 ? (touchHigh - contextLow) / contextLow * 100 : null;
  const dumpPct = contextHigh > 0 && touchLow > 0 ? (contextHigh - touchLow) / contextHigh * 100 : null;
  const pumpRange = touchHigh > 0 && contextLow > 0 ? touchHigh - contextLow : 0;
  const dumpRange = contextHigh > 0 && touchLow > 0 ? contextHigh - touchLow : 0;
  const givebackRatio = pumpRange > 0 && close != null ? (touchHigh - close) / pumpRange : null;
  const recoveryRatio = dumpRange > 0 && close != null ? (close - touchLow) / dumpRange : null;
  const touchShortCandle = [...touchBars].sort((a, b) => finite(b.high, 0) - finite(a.high, 0))[0] ?? null;
  const touchLongCandle = [...touchBars].sort((a, b) => finite(a.low, Infinity) - finite(b.low, Infinity))[0] ?? null;
  const shortRange = touchShortCandle ? candleRange(touchShortCandle) : 0;
  const longRange = touchLongCandle ? candleRange(touchLongCandle) : 0;
  const upperWick = touchShortCandle
    ? Math.max(0, finite(touchShortCandle.high, 0) - Math.max(finite(touchShortCandle.open, 0), finite(touchShortCandle.close, 0)))
    : 0;
  const lowerWick = touchLongCandle
    ? Math.max(0, Math.min(finite(touchLongCandle.open, 0), finite(touchLongCandle.close, 0)) - finite(touchLongCandle.low, 0))
    : 0;
  const ready = bars.length >= 105 && ema99 != null && last != null && context.length >= 6;
  // Small-cap 5m sweeps frequently pierce EMA99 before reclaiming. Keep the
  // established 15m band unchanged, while allowing a closed 5m wick to travel
  // farther through EMA99; the HTF direction, close, flow and volume guards
  // below still have to confirm the setup.
  const maxSweepThroughPct = timeframe === '5m' ? 15 : 1.5;
  const shortReady = ready
    && priorClose <= ema99 * 0.995
    && shortTouchDistancePct >= -0.6 && shortTouchDistancePct <= maxSweepThroughPct
    && closeDistancePct <= -0.2 && closeDistancePct >= -10
    && pumpPct >= 2 && givebackRatio >= 0.25
    && volumeX >= 1.3 && takerDeltaPct <= 10
    && (close < finite(last.open, close) || upperWick >= shortRange * 0.18);
  const longReady = ready
    && priorClose >= ema99 * 1.005
    && longTouchDistancePct >= -maxSweepThroughPct && longTouchDistancePct <= 0.6
    && closeDistancePct >= 0.2 && closeDistancePct <= 10
    && dumpPct >= 2 && recoveryRatio >= 0.25
    && volumeX >= 1.3 && takerDeltaPct >= -10
    && (close > finite(last.open, close) || lowerWick >= longRange * 0.18);
  return {
    timeframe,
    ready,
    candleCount: bars.length,
    candleClosedAt: finite(last?.closeTime, null),
    ema99,
    close,
    priorClose,
    shortTouchDistancePct,
    longTouchDistancePct,
    closeDistancePct,
    pumpPct,
    dumpPct,
    givebackRatio,
    recoveryRatio,
    volumeX,
    takerDeltaPct,
    shortReady,
    longReady,
  };
}

export function buildPumpDistributionSnapshot(klines = [], change24hPct = 0, now = Date.now(), {
  klines1h = [],
} = {}) {
  // 192 x 15m = 48h. The prior 32-bar window dropped real small-cap
  // distributions after only four hours and made WATCH disappear too quickly.
  const bars = closedBarsAt(klines, now, 220).slice(-192);
  const hourly = closedBarsAt(klines1h, now, 168).slice(-168);
  const empty = {
    ready: false,
    candleCount: bars.length,
    candleClosedAt: finite(bars.at(-1)?.closeTime, null),
    watchReady: false,
    shortReady: false,
    stage: 'NO_DATA',
  };
  if (bars.length < 14) return empty;

  let peakIndex = -1;
  let peakPrice = 0;
  const peakStart = Math.max(5, bars.length - 97);
  const peakEnd = bars.length - 5;
  for (let index = peakStart; index <= peakEnd; index += 1) {
    const high = finite(bars[index]?.high, 0);
    if (high > peakPrice) {
      peakIndex = index;
      peakPrice = high;
    }
  }
  if (peakIndex < 5 || peakPrice <= 0) return empty;

  const prePump = bars.slice(Math.max(0, peakIndex - 24), peakIndex + 1);
  const prePumpLow = Math.min(...prePump.map((bar) => finite(bar.low, Infinity)));
  const localPumpPct = prePumpLow > 0 ? (peakPrice - prePumpLow) / prePumpLow * 100 : null;

  // Use the closed 1h cycle to retain the original pump even after rolling 24h
  // change has cooled. This is the causal replacement for change24h >= 18.
  let cyclePeakIndex = -1;
  let cyclePeakPrice = 0;
  const cyclePeakStart = Math.max(12, hourly.length - 121);
  for (let index = cyclePeakStart; index <= hourly.length - 3; index += 1) {
    const high = finite(hourly[index]?.high, 0);
    if (high > cyclePeakPrice) {
      cyclePeakIndex = index;
      cyclePeakPrice = high;
    }
  }
  const cycleOriginBars = cyclePeakIndex >= 12
    ? hourly.slice(Math.max(0, cyclePeakIndex - 72), cyclePeakIndex + 1)
    : [];
  const cycleOriginPrice = cycleOriginBars.length
    ? Math.min(...cycleOriginBars.map((bar) => finite(bar.low, Infinity)))
    : null;
  const pump72hPct = cycleOriginPrice > 0 && cyclePeakPrice > 0
    ? (cyclePeakPrice - cycleOriginPrice) / cycleOriginPrice * 100
    : null;
  const pumpPct = Math.max(finite(localPumpPct, 0), finite(pump72hPct, 0));
  const effectivePeakPrice = Math.max(peakPrice, cyclePeakPrice);
  const latestClose = finite(bars.at(-1)?.close, null);
  const drawdownFromPeakPct = effectivePeakPrice > 0 && latestClose > 0
    ? (effectivePeakPrice - latestClose) / effectivePeakPrice * 100
    : null;
  const peakToOrigin = effectivePeakPrice > 0 && cycleOriginPrice > 0
    ? effectivePeakPrice - cycleOriginPrice
    : effectivePeakPrice - prePumpLow;
  const unwindProgressPct = peakToOrigin > 0 && latestClose > 0
    ? clamp((effectivePeakPrice - latestClose) / peakToOrigin * 100, 0, 150)
    : null;
  const unwindTier = unwindProgressPct == null
    ? 'NO_DATA'
    : unwindProgressPct < 30 ? 'EARLY_UNWIND'
      : unwindProgressPct < 65 ? 'MID_UNWIND'
        : 'LATE_UNWIND';
  const peakWindow = bars.slice(Math.max(0, peakIndex - 1), Math.min(bars.length, peakIndex + 2));
  const peakVolume = Math.max(...peakWindow.map((bar) => finite(bar.quoteVolume, 0)));
  const barsSincePeak = bars.length - 1 - peakIndex;
  const signal = bars.at(-1);
  if (!signal || barsSincePeak < 4) return {
    ...empty,
    peakAt: finite(bars[peakIndex]?.closeTime, null),
    peakPrice: effectivePeakPrice,
    pumpPct,
    localPumpPct,
    pump72hPct,
    cycleOriginPrice,
    drawdownFromPeakPct,
    unwindProgressPct,
    unwindTier,
    barsSincePeak,
  };

  function summarizeBase(base) {
    const support = Math.min(...base.map((bar) => finite(bar.low, Infinity)));
    const resistance = Math.max(...base.map((bar) => finite(bar.high, 0)));
    const baseRangePct = support > 0 ? (resistance - support) / support * 100 : null;
    let lowerHighSteps = 0;
    let upperWickCount = 0;
    for (let index = 0; index < base.length; index += 1) {
      if (index > 0 && finite(base[index]?.high, 0) < finite(base[index - 1]?.high, 0)) lowerHighSteps += 1;
      const range = candleRange(base[index]);
      const upperWick = Math.max(
        0,
        finite(base[index]?.high, 0) - Math.max(finite(base[index]?.open, 0), finite(base[index]?.close, 0)),
      );
      if (range > 0 && upperWick >= range * 0.25) upperWickCount += 1;
    }
    const baseVolume = mean(base.map((bar) => finite(bar.quoteVolume, 0)));
    const volumeFadeRatio = peakVolume > 0 ? baseVolume / peakVolume : null;
    const baseQuote = base.reduce((sum, bar) => sum + finite(bar.quoteVolume, 0), 0);
    const baseTakerBuy = base.reduce((sum, bar) => sum + finite(bar.takerBuyQuoteVolume, 0), 0);
    const baseTakerDeltaPct = baseQuote > 0 ? (baseTakerBuy * 2 - baseQuote) / baseQuote * 100 : null;
    return {
      support,
      resistance,
      baseRangePct,
      lowerHighSteps,
      upperWickCount,
      baseVolume,
      volumeFadeRatio,
      baseTakerDeltaPct,
    };
  }

  const watchBase = bars.slice(Math.max(peakIndex + 1, bars.length - 18));
  if (watchBase.length < 4) return { ...empty, pumpPct, localPumpPct, pump72hPct, barsSincePeak };
  let baseSummary = summarizeBase(watchBase);
  const adaptiveBaseRangeMaxPct = clamp(pumpPct * 0.35, 14, 28);
  const hasHourlyCycle = hourly.length >= 36 && pump72hPct != null;
  const strongPump = hasHourlyCycle
    ? pumpPct >= 30
    : pumpPct >= 10 && finite(change24hPct, 0) >= 18;
  const structureReady = strongPump
    && baseSummary.baseRangePct != null && baseSummary.baseRangePct <= adaptiveBaseRangeMaxPct
    && drawdownFromPeakPct != null && drawdownFromPeakPct >= 5 && drawdownFromPeakPct <= 70
    && baseSummary.lowerHighSteps >= 2 && baseSummary.upperWickCount >= 2
    && baseSummary.volumeFadeRatio != null && baseSummary.volumeFadeRatio <= 1.05
    && baseSummary.baseTakerDeltaPct != null && baseSummary.baseTakerDeltaPct <= 15
    && barsSincePeak >= 6 && barsSincePeak <= 96;

  // Search the last four closed candles for a breakdown and accept either a
  // failed retest or two closes holding below support. The old detector only
  // accepted exactly bars[-2] + bars[-1], so a valid setup vanished in 15m.
  let breakdownConfirmed = false;
  let retestFailed = false;
  let continuationConfirmed = false;
  let breakdownAt = null;
  let readyAt = null;
  let breakdownVolumeX = null;
  let breakdownTakerDeltaPct = null;
  for (let breakdownIndex = Math.max(peakIndex + 5, bars.length - 5); breakdownIndex < bars.length; breakdownIndex += 1) {
    const candidateBase = bars.slice(Math.max(peakIndex + 1, breakdownIndex - 18), breakdownIndex);
    if (candidateBase.length < 4) continue;
    const candidateSummary = summarizeBase(candidateBase);
    const breakdown = bars[breakdownIndex];
    const volumeX = candidateSummary.baseVolume > 0
      ? finite(breakdown.quoteVolume, 0) / candidateSummary.baseVolume
      : null;
    const quote = finite(breakdown.quoteVolume, 0);
    const takerBuy = finite(breakdown.takerBuyQuoteVolume, 0);
    const takerDelta = quote > 0 ? (takerBuy * 2 - quote) / quote * 100 : null;
    const candidateStructure = strongPump
      && candidateSummary.baseRangePct != null && candidateSummary.baseRangePct <= adaptiveBaseRangeMaxPct
      && drawdownFromPeakPct != null && drawdownFromPeakPct >= 5 && drawdownFromPeakPct <= 70
      && candidateSummary.lowerHighSteps >= 2 && candidateSummary.upperWickCount >= 2
      && candidateSummary.volumeFadeRatio != null && candidateSummary.volumeFadeRatio <= 1.05
      && candidateSummary.baseTakerDeltaPct != null && candidateSummary.baseTakerDeltaPct <= 15
      && barsSincePeak >= 6 && barsSincePeak <= 96;
    const broke = candidateStructure
      && finite(breakdown.close, 0) <= candidateSummary.support * 0.997
      && finite(breakdown.low, 0) < candidateSummary.support
      && volumeX != null && volumeX >= 1.1
      && takerDelta != null && takerDelta <= 0;
    if (!broke) continue;
    const after = bars.slice(breakdownIndex + 1, Math.min(bars.length, breakdownIndex + 5));
    const failedRetestBar = after.find((bar) => {
      const range = candleRange(bar);
      const upperWick = Math.max(
        0,
        finite(bar.high, 0) - Math.max(finite(bar.open, 0), finite(bar.close, 0)),
      );
      return finite(bar.high, 0) >= candidateSummary.support * 0.99
        && finite(bar.close, 0) <= candidateSummary.support * 1.001
        && (finite(bar.close, 0) < finite(bar.open, 0) || (range > 0 && upperWick >= range * 0.2));
    });
    const failed = Boolean(failedRetestBar);
    const below = [breakdown, ...after].filter((bar) => finite(bar.close, 0) <= candidateSummary.support * 0.997);
    const continuation = below.length >= 2
      && finite(below.at(-1)?.close, 0) <= candidateSummary.support * 0.995;
    breakdownConfirmed = true;
    retestFailed = failed;
    continuationConfirmed = continuation;
    breakdownAt = finite(breakdown.closeTime, null);
    readyAt = failed
      ? finite(failedRetestBar?.closeTime, null)
      : continuation ? finite(below.at(-1)?.closeTime, null) : null;
    breakdownVolumeX = volumeX;
    breakdownTakerDeltaPct = takerDelta;
    baseSummary = candidateSummary;
    break;
  }

  const shortReady = breakdownConfirmed
    && (retestFailed || continuationConfirmed)
    && unwindTier !== 'LATE_UNWIND';
  const watchReady = structureReady
    && !shortReady
    && finite(signal.close, 0) <= baseSummary.resistance * 1.01;
  const stage = shortReady
    ? 'SHORT_READY'
    : breakdownConfirmed ? 'BREAKDOWN_PENDING_RETEST'
      : unwindTier === 'LATE_UNWIND' && structureReady ? 'LATE_UNWIND_NO_CHASE'
        : watchReady ? 'DISTRIBUTION_WATCH'
          : 'NO_MATCH';

  return {
    ready: true,
    candleCount: bars.length,
    candleClosedAt: finite(signal.closeTime, null),
    peakAt: finite(bars[peakIndex]?.closeTime, null),
    peakPrice: effectivePeakPrice,
    barsSincePeak,
    pumpPct,
    localPumpPct,
    pump72hPct,
    cycleOriginPrice,
    adaptiveBaseRangeMaxPct,
    support: baseSummary.support,
    resistance: baseSummary.resistance,
    baseRangePct: baseSummary.baseRangePct,
    drawdownFromPeakPct,
    unwindProgressPct,
    unwindTier,
    lowerHighSteps: baseSummary.lowerHighSteps,
    upperWickCount: baseSummary.upperWickCount,
    volumeFadeRatio: baseSummary.volumeFadeRatio,
    baseTakerDeltaPct: baseSummary.baseTakerDeltaPct,
    breakdownVolumeX,
    breakdownTakerDeltaPct,
    breakdownAt,
    readyAt,
    breakdownConfirmed,
    retestFailed,
    continuationConfirmed,
    structureReady,
    watchReady,
    shortReady,
    stage,
  };
}

function klineQuoteVolume(bar = {}) {
  return finite(bar.quoteVolume, finite(bar.volume, 0));
}

function klineTakerBuyQuoteVolume(bar = {}) {
  return finite(bar.takerBuyQuoteVolume, finite(bar.takerBuyQuote, 0));
}

// Causal 5m detector derived from the 2026-08-15 seven-day/top-150-liquidity
// backtest. It deliberately separates the base WATCH state from the closed-
// candle breakout used by paper entry; OI remains telemetry and is not a gate.
export function buildPostPumpShortSqueezeSnapshot(klines = [], now = Date.now()) {
  const bars = closedBarsAt(klines, now, 340);
  const empty = {
    ready: false,
    candleCount: bars.length,
    candleClosedAt: finite(bars.at(-1)?.closeTime, null),
    watchReady: false,
    longReady: false,
    primeReady: false,
    stage: 'NO_DATA',
  };
  if (bars.length < 120) return empty;

  const closes = bars.map((bar) => finite(bar.close, 0));
  const ema25 = exponentialMovingAverageSeries(closes, 25);

  function evaluateAt(index) {
    const signal = bars[index];
    const base = bars.slice(index - 12, index);
    if (!signal || base.length < 12) return null;
    const baseHigh = Math.max(...base.map((bar) => finite(bar.high, 0)));
    const baseLow = Math.min(...base.map((bar) => finite(bar.low, Infinity)));
    const baseStart = finite(base[0]?.close, null);
    const baseEnd = finite(base.at(-1)?.close, null);
    const baseRangePct = baseLow > 0 ? pctChange(baseLow, baseHigh) : null;
    const baseReturnPct = baseStart > 0 ? pctChange(baseStart, baseEnd) : null;
    const firstHalfLow = Math.min(...base.slice(0, 6).map((bar) => finite(bar.low, Infinity)));
    const laterHalfLow = Math.min(...base.slice(6).map((bar) => finite(bar.low, Infinity)));
    const lowsHolding = firstHalfLow > 0 && laterHalfLow >= firstHalfLow * 0.985;

    const contextStart = Math.max(0, index - 300);
    const contextEnd = index - 13;
    if (contextEnd <= contextStart) return null;
    let peakIndex = contextStart;
    for (let cursor = contextStart + 1; cursor <= contextEnd; cursor += 1) {
      if (finite(bars[cursor]?.high, 0) > finite(bars[peakIndex]?.high, 0)) peakIndex = cursor;
    }
    const peakPrice = finite(bars[peakIndex]?.high, 0);
    const prePeakStart = Math.max(contextStart, peakIndex - 288);
    const prePeakLow = Math.min(...bars.slice(prePeakStart, peakIndex + 1)
      .map((bar) => finite(bar.low, Infinity)));
    const pumpPct = prePeakLow > 0 ? pctChange(prePeakLow, peakPrice) : null;
    const drawdownFromPeakPct = peakPrice > 0 && baseEnd > 0
      ? (peakPrice - baseEnd) / peakPrice * 100
      : null;
    const crashSegment = bars.slice(peakIndex, index - 11);
    const crashPeakVolume = Math.max(0, ...crashSegment.map(klineQuoteVolume));
    const baseMedianVolume = median(base.map(klineQuoteVolume));
    const volumeFadeRatio = crashPeakVolume > 0 && baseMedianVolume != null
      ? baseMedianVolume / crashPeakVolume
      : null;
    const baseQuote = base.reduce((sum, bar) => sum + klineQuoteVolume(bar), 0);
    const baseTakerBuy = base.reduce((sum, bar) => sum + klineTakerBuyQuoteVolume(bar), 0);
    const baseTakerDeltaPct = baseQuote > 0 ? (baseTakerBuy * 2 - baseQuote) / baseQuote * 100 : null;
    const barsSincePeak = index - peakIndex;
    const contextPass = pumpPct != null && pumpPct >= 30
      && drawdownFromPeakPct != null && drawdownFromPeakPct >= 25 && drawdownFromPeakPct <= 75
      && barsSincePeak >= 12
      && baseRangePct != null && baseRangePct <= 6
      && baseReturnPct != null && Math.abs(baseReturnPct) <= 3.5
      && lowsHolding
      && volumeFadeRatio != null && volumeFadeRatio <= 0.65;

    const volumeBaseline = median(bars.slice(index - 20, index).map(klineQuoteVolume));
    const signalQuote = klineQuoteVolume(signal);
    const breakoutVolumeX = volumeBaseline > 0 ? signalQuote / volumeBaseline : null;
    const signalTakerBuy = klineTakerBuyQuoteVolume(signal);
    const breakoutTakerDeltaPct = signalQuote > 0
      ? (signalTakerBuy * 2 - signalQuote) / signalQuote * 100
      : null;
    const signalOpen = finite(signal.open, 0);
    const signalClose = finite(signal.close, 0);
    const bullishBodyPct = signalOpen > 0 ? pctChange(signalOpen, signalClose) : null;
    const signalRange = finite(signal.high, 0) - finite(signal.low, 0);
    const closePosition = signalRange > 0
      ? (signalClose - finite(signal.low, 0)) / signalRange
      : 0;
    const longReady = contextPass
      && signalClose >= baseHigh * 1.002
      && ema25[index] != null && signalClose > ema25[index]
      && breakoutVolumeX != null && breakoutVolumeX >= 1.8
      && breakoutTakerDeltaPct != null && breakoutTakerDeltaPct >= 5
      && bullishBodyPct != null && bullishBodyPct > 0
      && closePosition >= 0.65;
    return {
      contextPass,
      watchReady: contextPass && !longReady,
      longReady,
      primeReady: longReady && baseTakerDeltaPct != null && baseTakerDeltaPct <= -1,
      signalAt: finite(signal.closeTime, null),
      peakAt: finite(bars[peakIndex]?.closeTime, null),
      peakPrice,
      prePeakLow,
      pumpPct,
      drawdownFromPeakPct,
      barsSincePeak,
      baseHigh,
      baseLow,
      baseRangePct,
      baseReturnPct,
      lowsHolding,
      crashPeakVolume,
      baseMedianVolume,
      volumeFadeRatio,
      baseTakerDeltaPct,
      ema25: ema25[index],
      breakoutVolumeX,
      breakoutTakerDeltaPct,
      bullishBodyPct,
      closePosition,
    };
  }

  const lastIndex = bars.length - 1;
  const recent = [];
  for (let index = Math.max(24, lastIndex - 2); index <= lastIndex; index += 1) {
    const snapshot = evaluateAt(index);
    if (snapshot) recent.push(snapshot);
  }
  const breakout = [...recent].reverse().find((row) => row.longReady);
  const current = recent.at(-1) ?? null;
  const selected = breakout ?? current;
  if (!selected) return empty;
  const longReady = breakout?.longReady === true;
  const primeReady = breakout?.primeReady === true;
  const watchReady = !longReady && current?.watchReady === true;
  return {
    ...empty,
    ...selected,
    ready: true,
    candleClosedAt: finite(bars.at(-1)?.closeTime, null),
    readyAt: longReady ? breakout.signalAt : null,
    watchReady,
    longReady,
    primeReady,
    stage: primeReady
      ? 'PRIME'
      : longReady ? 'LONG_READY'
        : watchReady ? 'BASE_ABSORPTION_WATCH' : 'NO_MATCH',
  };
}

function trueRangeAt(bars, index) {
  const bar = bars[index];
  if (!bar) return 0;
  const high = finite(bar.high, 0);
  const low = finite(bar.low, 0);
  const previousClose = finite(bars[index - 1]?.close, finite(bar.open, low));
  return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
}

function atrBefore(bars, index, period = 14) {
  const values = [];
  for (let cursor = Math.max(1, index - period); cursor < index; cursor += 1) {
    const value = trueRangeAt(bars, cursor);
    if (value > 0) values.push(value);
  }
  return values.length >= Math.min(8, period) ? mean(values) : null;
}

function takerDeltaOf(bar = {}) {
  const quote = klineQuoteVolume(bar);
  return quote > 0 ? (klineTakerBuyQuoteVolume(bar) * 2 - quote) / quote * 100 : null;
}

// Causal state machine for the MOVR-like pattern: a closed 5m pump candle,
// a same/next-candle flush back near the launch base, then a later closed 5m
// bullish reclaim. Only bars before the reclaim candle define the flush/base.
export function buildPumpFlushReclaimSnapshot(klines = [], now = Date.now()) {
  const bars = closedBarsAt(klines, now, 220);
  const empty = {
    version: PUMP_FLUSH_RECLAIM_VERSION,
    ready: false,
    candleCount: bars.length,
    candleClosedAt: finite(bars.at(-1)?.closeTime, null),
    watchReady: false,
    longReady: false,
    stage: 'NO_DATA',
  };
  if (bars.length < 40) return empty;

  const closes = bars.map((bar) => finite(bar.close, 0));
  const ema13 = exponentialMovingAverageSeries(closes, 13);
  const ema25 = exponentialMovingAverageSeries(closes, 25);
  const rsi14 = rsiSeries(closes, 14);
  const lastIndex = bars.length - 1;
  let selectedWatch = null;
  let selectedReady = null;

  for (let spikeIndex = Math.max(21, lastIndex - 8); spikeIndex < lastIndex; spikeIndex += 1) {
    const spike = bars[spikeIndex];
    const spikeOpen = finite(spike.open, 0);
    const spikeHigh = finite(spike.high, 0);
    const spikeLow = finite(spike.low, 0);
    const spikeClose = finite(spike.close, 0);
    const launchBase = Math.min(spikeOpen, spikeLow);
    const pumpRange = spikeHigh - launchBase;
    const pumpPct = launchBase > 0 ? pumpRange / launchBase * 100 : null;
    const atr = atrBefore(bars, spikeIndex, 14);
    const rangeAtr = atr > 0 ? (spikeHigh - spikeLow) / atr : null;
    const baselineVolume = median(bars.slice(spikeIndex - 20, spikeIndex).map(klineQuoteVolume));
    const spikeVolume = klineQuoteVolume(spike);
    const spikeVolumeX = baselineVolume > 0 ? spikeVolume / baselineVolume : null;
    const spikeRange = Math.max(spikeHigh - spikeLow, 1e-12);
    const upperWickShare = (spikeHigh - Math.max(spikeOpen, spikeClose)) / spikeRange;
    const spikeClosePosition = (spikeClose - spikeLow) / spikeRange;
    const sameCandleFlush = upperWickShare >= 0.35 && spikeClosePosition <= 0.65;
    if (!(pumpPct >= 8) || !(rangeAtr >= 2.5) || !(spikeVolumeX >= 3)) continue;

    const maxReclaimIndex = Math.min(lastIndex, spikeIndex + 6);
    for (let reclaimIndex = spikeIndex + 1; reclaimIndex <= maxReclaimIndex; reclaimIndex += 1) {
      const between = bars.slice(spikeIndex + 1, reclaimIndex);
      if (!sameCandleFlush && between.length === 0) continue;
      let flushIndex = spikeIndex;
      if (between.length) {
        for (let cursor = spikeIndex + 1; cursor < reclaimIndex; cursor += 1) {
          if (finite(bars[cursor]?.low, Infinity) < finite(bars[flushIndex]?.low, Infinity)
            || flushIndex === spikeIndex) flushIndex = cursor;
        }
      }
      const flushLow = finite(bars[flushIndex]?.low, launchBase);
      const retraceRatio = pumpRange > 0 ? (spikeHigh - flushLow) / pumpRange : null;
      const followingFlush = between.length > 0 && retraceRatio >= 0.55 && retraceRatio <= 1.05;
      if (!sameCandleFlush && !followingFlush) continue;

      const baseTolerance = Math.max(atr * 0.25, launchBase * 0.001);
      const holdBars = bars.slice(spikeIndex, reclaimIndex);
      const baseHeld = holdBars.every((bar) => finite(bar.close, 0) >= launchBase - baseTolerance)
        && flushLow >= launchBase - baseTolerance;
      const flushVolume = Math.max(spikeVolume, ...between.map(klineQuoteVolume));
      const flushVolumeX = baselineVolume > 0 ? flushVolume / baselineVolume : null;
      if (!baseHeld || !(flushVolumeX >= 1.5)) continue;

      const reclaim = bars[reclaimIndex];
      const reclaimOpen = finite(reclaim.open, 0);
      const reclaimHigh = finite(reclaim.high, 0);
      const reclaimLow = finite(reclaim.low, 0);
      const reclaimClose = finite(reclaim.close, 0);
      const reclaimRange = Math.max(reclaimHigh - reclaimLow, 1e-12);
      const reclaimClosePosition = (reclaimClose - reclaimLow) / reclaimRange;
      const reclaimVolume = klineQuoteVolume(reclaim);
      const reclaimVolumeX = baselineVolume > 0 ? reclaimVolume / baselineVolume : null;
      const reclaimTakerDeltaPct = takerDeltaOf(reclaim);
      const reclaimPct = flushLow > 0 ? (reclaimClose - flushLow) / flushLow * 100 : null;
      const reclaimLevel = Math.max(
        finite(ema13[reclaimIndex], 0),
        finite(ema25[reclaimIndex], 0),
        launchBase + pumpRange * 0.25,
      );
      const reclaimConfirmed = reclaimClose > reclaimOpen
        && reclaimClose >= reclaimLevel
        && reclaimLow >= flushLow * 0.998
        && reclaimPct >= 1.8
        && reclaimVolumeX >= 1.5
        && reclaimTakerDeltaPct >= 5
        && reclaimClosePosition >= 0.65
        && rsi14[reclaimIndex] >= 45 && rsi14[reclaimIndex] <= 78;
      const snapshot = {
        version: PUMP_FLUSH_RECLAIM_VERSION,
        ready: true,
        candleCount: bars.length,
        candleClosedAt: finite(bars.at(-1)?.closeTime, null),
        watchReady: !reclaimConfirmed,
        longReady: reclaimConfirmed,
        stage: reclaimConfirmed ? 'LONG_READY' : 'FLUSH_BASE_HOLD',
        patternType: sameCandleFlush ? 'SAME_CANDLE_WICK_FLUSH' : 'FOLLOW_THROUGH_FLUSH',
        spikeAt: finite(spike.closeTime, null),
        readyAt: reclaimConfirmed ? finite(reclaim.closeTime, null) : null,
        spikeIndex,
        flushIndex,
        reclaimIndex: reclaimConfirmed ? reclaimIndex : null,
        launchBase,
        spikeHigh,
        flushLow,
        pumpPct,
        rangeAtr,
        spikeVolumeX,
        flushVolumeX,
        retracePct: retraceRatio * 100,
        upperWickShare,
        spikeClosePosition,
        baseHeld,
        reclaimLevel,
        reclaimPct,
        reclaimVolumeX,
        reclaimTakerDeltaPct,
        reclaimClosePosition,
        reclaimRsi14: rsi14[reclaimIndex],
      };
      if (reclaimConfirmed) {
        if (!selectedReady || spikeIndex > selectedReady.spikeIndex) selectedReady = snapshot;
        break;
      } else if (!selectedWatch || spikeIndex > selectedWatch.spikeIndex) {
        selectedWatch = snapshot;
      }
    }
  }

  return selectedReady ?? selectedWatch ?? empty;
}

function candleRange(bar = {}) {
  return Math.max(0, finite(bar.high, 0) - finite(bar.low, 0));
}

function candleBody(bar = {}) {
  return Math.abs(finite(bar.close, 0) - finite(bar.open, 0));
}

function detectBaseSweepContinuation(bars = [], side = 'LONG') {
  const empty = {
    detected: false,
    holdConfirmed: false,
    breakoutConfirmed: false,
    ready: false,
    sweepAt: null,
    barsSinceSweep: null,
    level: null,
    sweepExtreme: null,
    breakoutLevel: null,
    breakoutPct: null,
    baseRangePct: null,
    breakoutVolumeX: null,
  };
  if (!Array.isArray(bars) || bars.length < 12) return empty;

  const signalIndex = bars.length - 1;
  const signal = bars[signalIndex];
  const signalClose = finite(signal?.close, 0);
  const signalOpen = finite(signal?.open, 0);
  if (signalClose <= 0 || signalOpen <= 0) return empty;
  const isLong = side === 'LONG';
  const directionConfirmed = isLong ? signalClose > signalOpen : signalClose < signalOpen;
  if (!directionConfirmed) return empty;

  for (let sweepIndex = signalIndex - 3; sweepIndex >= Math.max(6, signalIndex - 24); sweepIndex -= 1) {
    const prior = bars.slice(Math.max(0, sweepIndex - 6), sweepIndex);
    const hold = bars.slice(sweepIndex + 1, signalIndex);
    if (prior.length < 4 || hold.length < 2) continue;
    const sweep = bars[sweepIndex];
    const priorLow = Math.min(...prior.map((bar) => finite(bar.low, Infinity)));
    const priorHigh = Math.max(...prior.map((bar) => finite(bar.high, -Infinity)));
    if (!Number.isFinite(priorLow) || !Number.isFinite(priorHigh) || priorLow <= 0 || priorHigh <= 0) continue;

    const sweepOpen = finite(sweep.open, 0);
    const sweepClose = finite(sweep.close, 0);
    const sweepLow = finite(sweep.low, 0);
    const sweepHigh = finite(sweep.high, 0);
    const body = candleBody(sweep);
    const range = candleRange(sweep);
    const wick = isLong
      ? Math.max(0, Math.min(sweepOpen, sweepClose) - sweepLow)
      : Math.max(0, sweepHigh - Math.max(sweepOpen, sweepClose));
    const level = isLong ? priorLow : priorHigh;
    const swept = isLong ? sweepLow <= level * 0.998 : sweepHigh >= level * 1.002;
    const reclaimed = isLong ? sweepClose >= level * 1.0005 : sweepClose <= level * 0.9995;
    const wickConfirmed = wick >= Math.max(body * 0.45, range * 0.18);
    if (!swept || !reclaimed || !wickConfirmed) continue;

    const holdConfirmed = hold.every((bar) => (
      isLong ? finite(bar.close, 0) >= level * 0.997 : finite(bar.close, 0) <= level * 1.003
    ));
    if (!holdConfirmed) continue;
    const breakoutLevel = isLong
      ? Math.max(...hold.map((bar) => finite(bar.high, 0)))
      : Math.min(...hold.map((bar) => finite(bar.low, Infinity)));
    if (!Number.isFinite(breakoutLevel) || breakoutLevel <= 0) continue;
    const breakoutConfirmed = isLong
      ? signalClose >= breakoutLevel * 1.002
      : signalClose <= breakoutLevel * 0.998;
    if (!breakoutConfirmed) continue;

    const baseBars = [sweep, ...hold];
    const baseHigh = Math.max(...baseBars.map((bar) => finite(bar.high, 0)));
    const baseLow = Math.min(...baseBars.map((bar) => finite(bar.low, Infinity)));
    const baseMid = (baseHigh + baseLow) / 2;
    const baseRangePct = baseMid > 0 ? (baseHigh - baseLow) / baseMid * 100 : null;
    if (!Number.isFinite(baseRangePct) || baseRangePct > 14) continue;

    const breakoutPct = isLong
      ? (signalClose - breakoutLevel) / breakoutLevel * 100
      : (breakoutLevel - signalClose) / breakoutLevel * 100;
    const holdVolumeMean = mean(hold.map((bar) => finite(bar.quoteVolume, 0)));
    const breakoutVolumeX = holdVolumeMean > 0 ? finite(signal.quoteVolume, 0) / holdVolumeMean : null;
    return {
      detected: true,
      holdConfirmed: true,
      breakoutConfirmed: true,
      ready: true,
      sweepAt: finite(sweep.closeTime, null),
      barsSinceSweep: signalIndex - sweepIndex,
      level,
      sweepExtreme: isLong ? sweepLow : sweepHigh,
      breakoutLevel,
      breakoutPct,
      baseRangePct,
      breakoutVolumeX,
    };
  }
  return empty;
}

function uniqueBySymbol(groups, maxSymbols) {
  const seen = new Set();
  const rows = [];
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.symbol)) continue;
      seen.add(row.symbol);
      rows.push(row);
      if (rows.length >= maxSymbols) return rows;
    }
  }
  return rows;
}

export function selectLiquidHeatmapFlowV2Candidates(snapshot = [], {
  topPerSide = 14,
  maxSymbols = 32,
  minQuoteVolume = 2_000_000,
} = {}) {
  const universe = (Array.isArray(snapshot) ? snapshot : [])
    .filter((row) => row?.symbol && row.symbol !== 'BTCUSDT' && !STABLE_PAIR_PATTERN.test(row.symbol))
    .map((row) => ({
      ...row,
      symbol: String(row.symbol).toUpperCase(),
      markPrice: finite(row.markPrice, 0),
      change24hPct: finite(row.change24hPct, 0),
      quoteVolume: finite(row.quoteVolume, 0),
    }))
    .filter((row) => row.markPrice > 0 && row.quoteVolume >= minQuoteVolume);

  const gainers = [...universe]
    .filter((row) => row.change24hPct > 0)
    .sort((a, b) => b.change24hPct - a.change24hPct || b.quoteVolume - a.quoteVolume)
    .slice(0, topPerSide)
    .map((row, index) => ({ ...row, moverSide: 'UP', moverRank: index + 1 }));
  const losers = [...universe]
    .filter((row) => row.change24hPct < 0)
    .sort((a, b) => a.change24hPct - b.change24hPct || b.quoteVolume - a.quoteVolume)
    .slice(0, topPerSide)
    .map((row, index) => ({ ...row, moverSide: 'DOWN', moverRank: index + 1 }));
  const absoluteMovers = [...universe]
    .sort((a, b) => Math.abs(b.change24hPct) - Math.abs(a.change24hPct) || b.quoteVolume - a.quoteVolume)
    .slice(0, Math.max(4, Math.floor(topPerSide / 2)))
    .map((row) => ({ ...row, moverSide: row.change24hPct >= 0 ? 'UP' : 'DOWN', moverRank: null }));

  return uniqueBySymbol([gainers, losers, absoluteMovers], maxSymbols);
}

export function selectLiquidHeatmapFlowV2ExtendedCandidates(snapshot = [], {
  fromRank = 21,
  toRank = 100,
  maxSymbols = 80,
  minQuoteVolume = 2_000_000,
  minChange24hPct = 0,
} = {}) {
  const start = Math.max(0, Math.floor(finite(fromRank, 21)) - 1);
  const end = Math.max(start + 1, Math.floor(finite(toRank, 100)));
  return (Array.isArray(snapshot) ? snapshot : [])
    .filter((row) => row?.symbol && row.symbol !== 'BTCUSDT' && !STABLE_PAIR_PATTERN.test(row.symbol))
    .map((row) => ({
      ...row,
      symbol: String(row.symbol).toUpperCase(),
      markPrice: finite(row.markPrice, 0),
      change24hPct: finite(row.change24hPct, 0),
      quoteVolume: finite(row.quoteVolume, 0),
    }))
    .filter((row) => row.markPrice > 0 && row.quoteVolume >= minQuoteVolume && row.change24hPct > 0)
    .sort((a, b) => b.change24hPct - a.change24hPct || b.quoteVolume - a.quoteVolume)
    .map((row, index) => ({
      ...row,
      moverSide: 'UP',
      moverRank: index + 1,
      universeTier: index + 1 <= 60 ? 'EXTENDED_21_60' : 'EMA_FAN_LONG_EXTENDED_61_100',
    }))
    .slice(start, end)
    .filter((row) => row.change24hPct >= minChange24hPct)
    .slice(0, Math.max(0, Math.floor(finite(maxSymbols, 80))));
}

export function selectLiquidHeatmapFlowV2EmaFanShortCandidates(snapshot = [], {
  topLiquidity = 150,
  minQuoteVolume = 2_000_000,
  maxChange24hPct = -5,
} = {}) {
  return (Array.isArray(snapshot) ? snapshot : [])
    .filter((row) => row?.symbol && row.symbol !== 'BTCUSDT' && !STABLE_PAIR_PATTERN.test(row.symbol))
    .map((row) => ({
      ...row,
      symbol: String(row.symbol).toUpperCase(),
      markPrice: finite(row.markPrice, 0),
      change24hPct: finite(row.change24hPct, 0),
      quoteVolume: finite(row.quoteVolume, 0),
    }))
    .filter((row) => row.markPrice > 0 && row.quoteVolume >= minQuoteVolume)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, Math.max(1, Math.floor(finite(topLiquidity, 150))))
    .map((row, index) => ({
      ...row,
      moverSide: 'DOWN',
      liquidityRank: index + 1,
      emaFanShortUniverse: true,
      universeTier: 'EMA_FAN_SHORT_TOP_150',
    }))
    .filter((row) => row.change24hPct <= maxChange24hPct);
}

export function selectLiquidHeatmapFlowV2PostPumpCandidates(snapshot = [], {
  topLiquidity = 150,
  minQuoteVolume = 2_000_000,
} = {}) {
  return (Array.isArray(snapshot) ? snapshot : [])
    .filter((row) => row?.symbol && row.symbol !== 'BTCUSDT' && !STABLE_PAIR_PATTERN.test(row.symbol))
    .map((row) => ({
      ...row,
      symbol: String(row.symbol).toUpperCase(),
      markPrice: finite(row.markPrice, 0),
      change24hPct: finite(row.change24hPct, 0),
      quoteVolume: finite(row.quoteVolume, 0),
    }))
    .filter((row) => row.markPrice > 0 && row.quoteVolume >= minQuoteVolume)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, Math.max(1, Math.floor(finite(topLiquidity, 150))))
    .map((row, index) => ({
      ...row,
      moverSide: row.change24hPct >= 0 ? 'UP' : 'DOWN',
      liquidityRank: index + 1,
      postPumpUniverse: true,
      fadingWaveUniverse: true,
      universeTier: 'POST_PUMP_TOP_150_LIQUIDITY',
    }));
}

export function liquidHeatmapFlowV2ExtendedPrefilter(features = {}) {
  const rank = finite(features.moverRank, null);
  const touch = finite(features.ema99LongTouchDistancePct, null);
  const distance = finite(features.ema99DistancePct, null);
  const pullback = finite(features.pullbackFromRecentHighPct, null);
  const volumeX = finite(features.volumeX, 0);
  const extendedUniverse = (features.universeTier === 'EXTENDED_21_60'
      || features.universeTier === 'EMA_FAN_LONG_EXTENDED_61_100')
    && features.moverSide === 'UP'
    && rank != null && rank >= 21 && rank <= 100;
  const emaFanCandidate = extendedUniverse
    && finite(features.candleCount, 0) >= 120
    && features.emaFanLong5m?.watchActive === true;
  const panicCandidate = features.universeTier === 'EXTENDED_21_60'
    && extendedUniverse
    && rank <= 60
    && finite(features.candleCount, 0) >= 180
    && finite(features.quoteVolume, 0) >= 3_000_000
    && finite(features.change24hPct, 0) >= 3
    && pullback != null && pullback >= 2 && pullback <= 18
    && volumeX >= 0.8
    && ((touch != null && touch >= -2.5 && touch <= 2)
      || (distance != null && Math.abs(distance) <= 2.5));
  const postPumpCandidate = features.postPumpShortSqueeze5m?.watchReady === true
    || features.postPumpShortSqueeze5m?.longReady === true;
  const pumpFlushCandidate = features.pumpFlushReclaim5m?.watchReady === true
    || features.pumpFlushReclaim5m?.longReady === true;
  return emaFanCandidate || panicCandidate || postPumpCandidate || pumpFlushCandidate;
}

function strongestZone(heatmap, side) {
  const rows = side === 'above'
    ? (heatmap?.strongestAbove ?? heatmap?.heatmapAbove ?? [])
    : (heatmap?.strongestBelow ?? heatmap?.heatmapBelow ?? []);
  return rows
    .filter((row) => finite(row?.price, 0) > 0)
    .sort((a, b) => finite(b?.score, 0) - finite(a?.score, 0))[0] ?? null;
}

export function buildLiquidHeatmapFlowV2Features({
  market = {},
  klines = [],
  klines15m = [],
  klines1h = [],
  klines4h = [],
  heatmap = null,
  openInterest = null,
  liquidation = null,
  now = Date.now(),
} = {}) {
  const bars = (Array.isArray(klines) ? klines : [])
    .filter((bar) => finite(bar?.close, 0) > 0)
    .slice(-340);
  const closed = bars.filter((bar) => !bar.closeTime || finite(bar.closeTime, 0) <= now).slice(-340);
  const usable = closed.length >= 12 ? closed : bars.slice(-340);
  const live = bars.at(-1)?.closeTime && finite(bars.at(-1).closeTime, 0) > now ? bars.at(-1) : null;
  const last = usable.at(-1) ?? null;
  const previous = usable.at(-2) ?? null;
  const beforePrevious = usable.at(-3) ?? null;
  const markPrice = finite(market.markPrice, finite(last?.close, 0));
  const closes = usable.map((bar) => finite(bar.close, 0));
  const change15mPct = usable.length >= 4 ? pctChange(usable.at(-4)?.close, last?.close) : null;
  const change1hPct = usable.length >= 13 ? pctChange(usable.at(-13)?.close, last?.close) : null;
  const liveOrClosedRecent = live ? [...usable.slice(-2), live] : usable.slice(-3);
  const recent = liveOrClosedRecent;
  const volumeBase = usable.slice(-23, -3).map((bar) => finite(bar.quoteVolume, 0));
  const recentVolume = mean(recent.map((bar) => finite(bar.quoteVolume, 0)));
  const volumeX = mean(volumeBase) > 0 ? recentVolume / mean(volumeBase) : null;
  const recentQuote = recent.reduce((sum, bar) => sum + finite(bar.quoteVolume, 0), 0);
  const recentTakerBuy = recent.reduce((sum, bar) => sum + finite(bar.takerBuyQuoteVolume, 0), 0);
  const takerDeltaPct = recentQuote > 0 ? ((recentTakerBuy * 2 - recentQuote) / recentQuote) * 100 : null;
  const ema13 = movingAverage(closes, 13);
  const ema25 = movingAverage(closes, 25);
  const ema99 = exponentialMovingAverage(closes, 99);
  const previousEma99 = exponentialMovingAverage(closes.slice(0, -1), 99);
  const ema99SlopePct = previousEma99 != null && ema99 != null ? pctChange(previousEma99, ema99) : null;
  const ema99DistancePct = ema99 != null && ema99 > 0 && markPrice > 0
    ? (markPrice - ema99) / ema99 * 100
    : null;
  const approachCandle = live ?? last;
  const approachLow = finite(approachCandle?.low, null);
  const approachHigh = finite(approachCandle?.high, null);
  const ema99LongTouchDistancePct = ema99 != null && ema99 > 0 && approachLow != null
    ? (approachLow - ema99) / ema99 * 100
    : null;
  const ema99ShortTouchDistancePct = ema99 != null && ema99 > 0 && approachHigh != null
    ? (approachHigh - ema99) / ema99 * 100
    : null;
  const reboundFromApproachLowPct = approachLow > 0 && markPrice > 0
    ? (markPrice - approachLow) / approachLow * 100
    : null;
  const rejectFromApproachHighPct = approachHigh > 0 && markPrice > 0
    ? (approachHigh - markPrice) / approachHigh * 100
    : null;
  const recentStructure = usable.slice(-12);
  const recentHigh = recentStructure.length
    ? Math.max(...recentStructure.map((bar) => finite(bar.high, 0)))
    : null;
  const recentLow = recentStructure.length
    ? Math.min(...recentStructure.map((bar) => finite(bar.low, Infinity)))
    : null;
  const pullbackFromRecentHighPct = recentHigh > 0 && markPrice > 0
    ? (recentHigh - markPrice) / recentHigh * 100
    : null;
  const bounceFromRecentLowPct = recentLow > 0 && markPrice > 0
    ? (markPrice - recentLow) / recentLow * 100
    : null;
  const body = last ? Math.abs(finite(last.close, 0) - finite(last.open, 0)) : 0;
  const lastRange = last ? Math.max(0, finite(last.high, 0) - finite(last.low, 0)) : 0;
  const lastBodyPct = markPrice > 0 ? body / markPrice * 100 : null;
  const lastClosePosition = lastRange > 0
    ? (finite(last?.close, 0) - finite(last?.low, 0)) / lastRange
    : null;
  const lastBullish = Boolean(last && finite(last.close, 0) > finite(last.open, 0));
  const higherLowConfirmed = Boolean(last && previous
    && finite(last.low, 0) >= finite(previous.low, 0) * 0.998
    && finite(last.close, 0) > finite(previous.close, 0));
  const fastEmaReclaimed = Boolean(last && ema13 != null && ema25 != null
    && finite(last.close, 0) >= Math.max(ema13, ema25));
  const upperWick = last ? Math.max(0, finite(last.high, 0) - Math.max(finite(last.open, 0), finite(last.close, 0))) : 0;
  const lowerWick = last ? Math.max(0, Math.min(finite(last.open, 0), finite(last.close, 0)) - finite(last.low, 0)) : 0;
  const upperWickPct = markPrice > 0 ? upperWick / markPrice * 100 : null;
  const lowerWickPct = markPrice > 0 ? lowerWick / markPrice * 100 : null;
  const upperRejection = Boolean(last && previous
    && upperWick >= Math.max(body * 0.9, markPrice * 0.002)
    && finite(last.close, 0) < finite(previous.high, 0));
  const lowerReclaim = Boolean(last && previous
    && lowerWick >= Math.max(body * 0.9, markPrice * 0.002)
    && finite(last.close, 0) > finite(previous.low, 0));
  const upperZone = strongestZone(heatmap, 'above');
  const lowerZone = strongestZone(heatmap, 'below');
  const upperDistancePct = upperZone && markPrice > 0 ? (finite(upperZone.price, 0) - markPrice) / markPrice * 100 : null;
  const lowerDistancePct = lowerZone && markPrice > 0 ? (finite(lowerZone.price, 0) - markPrice) / markPrice * 100 : null;
  const upperZoneTouched = Boolean(upperZone && last
    && (finite(last.high, 0) >= finite(upperZone.price, 0) * 0.997 || Math.abs(upperDistancePct) <= 0.35));
  const lowerZoneTouched = Boolean(lowerZone && last
    && (finite(last.low, 0) <= finite(lowerZone.price, 0) * 1.003 || Math.abs(lowerDistancePct) <= 0.35));
  const previousBody = previous
    ? Math.abs(finite(previous.close, 0) - finite(previous.open, 0))
    : 0;
  const previousUpperWick = previous
    ? Math.max(0, finite(previous.high, 0) - Math.max(finite(previous.open, 0), finite(previous.close, 0)))
    : 0;
  const previousLowerWick = previous
    ? Math.max(0, Math.min(finite(previous.open, 0), finite(previous.close, 0)) - finite(previous.low, 0))
    : 0;
  const previousUpperRejection = Boolean(previous && beforePrevious
    && previousUpperWick >= Math.max(previousBody * 0.9, finite(previous.close, 0) * 0.002)
    && finite(previous.close, 0) < finite(beforePrevious.high, 0));
  const previousLowerReclaim = Boolean(previous && beforePrevious
    && previousLowerWick >= Math.max(previousBody * 0.9, finite(previous.close, 0) * 0.002)
    && finite(previous.close, 0) > finite(beforePrevious.low, 0));
  const previousUpperZoneTouched = Boolean(upperZone && previous
    && finite(previous.high, 0) >= finite(upperZone.price, 0) * 0.997);
  const previousLowerZoneTouched = Boolean(lowerZone && previous
    && finite(previous.low, 0) <= finite(lowerZone.price, 0) * 1.003);
  const lastQuoteVolume = finite(last?.quoteVolume, finite(last?.volume, 0));
  const lastTakerBuyQuoteVolume = finite(last?.takerBuyQuoteVolume, finite(last?.takerBuyQuote, 0));
  const lastClosedTakerDeltaPct = lastQuoteVolume > 0
    ? ((lastTakerBuyQuoteVolume * 2 - lastQuoteVolume) / lastQuoteVolume) * 100
    : null;
  const priorShortSweep = previousUpperZoneTouched && previousUpperRejection;
  const priorLongSweep = previousLowerZoneTouched && previousLowerReclaim;
  const sweepConfirmation5m = {
    shortWatch: (upperZoneTouched && upperRejection) || priorShortSweep,
    shortReady: Boolean(priorShortSweep && last
      && finite(last.close, 0) < finite(last.open, 0)
      && finite(last.high, 0) <= finite(previous.high, 0) * 1.002
      && finite(last.close, 0) < finite(previous.close, 0)
      && ema13 != null && finite(last.close, 0) <= ema13
      && lastClosedTakerDeltaPct != null && lastClosedTakerDeltaPct <= 0),
    longWatch: (lowerZoneTouched && lowerReclaim) || priorLongSweep,
    longReady: Boolean(priorLongSweep && last
      && finite(last.close, 0) > finite(last.open, 0)
      && finite(last.low, 0) >= finite(previous.low, 0) * 0.998
      && finite(last.close, 0) > finite(previous.close, 0)
      && ema13 != null && ema25 != null && finite(last.close, 0) >= Math.max(ema13, ema25)
      && lastClosedTakerDeltaPct != null && lastClosedTakerDeltaPct >= 2),
    sweepAt: finite(previous?.closeTime, null),
    confirmedAt: finite(last?.closeTime, null),
    lastClosedTakerDeltaPct,
    confirmationClose: finite(last?.close, null),
    ema13,
    ema25,
  };
  const baseSweepLong = detectBaseSweepContinuation(usable, 'LONG');
  const baseSweepShort = detectBaseSweepContinuation(usable, 'SHORT');
  const trendAboveEma = Boolean(last && ema13 != null && ema25 != null
    && finite(last.close, 0) > ema13 && ema13 >= ema25 * 0.995);
  const trendBelowEma = Boolean(last && ema13 != null && ema25 != null
    && finite(last.close, 0) < ema13 && ema13 <= ema25 * 1.005);
  const trend1h = buildHtfTrendSnapshot(klines1h, '1h', now);
  const trend4h = buildHtfTrendSnapshot(klines4h, '4h', now);
  const ema99Retest5m = buildEma99RetestSnapshot(klines, now, '5m');
  const ema99Retest15m = buildEma99RetestSnapshot(klines15m, now, '15m');
  const pumpDistribution15m = buildPumpDistributionSnapshot(
    klines15m,
    finite(market.change24hPct, 0),
    now,
    { klines1h },
  );
  const postPumpShortSqueeze5m = buildPostPumpShortSqueezeSnapshot(klines, now);
  const flagpoleShortKill5m = buildFlagpoleShortKillSnapshot(klines, now);
  const fadingWaveLivePump5m = buildFadingWaveLivePumpSnapshot(klines, now);
  const pumpFlushReclaim5m = buildPumpFlushReclaimSnapshot(klines, now);
  const emaFanLong5m = buildEmaFanLongSnapshot(klines, now);
  const emaFanShort5m = buildEmaFanShortSnapshot(klines, now);
  const htfBearCount = Number(trend1h.bearish) + Number(trend4h.bearish);
  const htfBullCount = Number(trend1h.bullish) + Number(trend4h.bullish);

  return {
    moverSide: String(market.moverSide ?? ''),
    moverRank: finite(market.moverRank, null),
    liquidityRank: finite(market.liquidityRank, null),
    emaFanShortUniverse: market.emaFanShortUniverse === true,
    postPumpUniverse: market.postPumpUniverse === true,
    fadingWaveUniverse: market.fadingWaveUniverse === true,
    universeTier: String(market.universeTier ?? 'PRIMARY_1_20'),
    markPrice,
    change24hPct: finite(market.change24hPct, 0),
    change15mPct,
    change1hPct,
    quoteVolume: finite(market.quoteVolume, 0),
    fundingRate: finite(market.fundingRate, null),
    candleCount: usable.length,
    candleClosedAt: finite(last?.closeTime, null),
    lastClosedCandle: last ? {
      open: finite(last.open, null),
      high: finite(last.high, null),
      low: finite(last.low, null),
      close: finite(last.close, null),
      closeTime: finite(last.closeTime, null),
      quoteVolume: finite(last.quoteVolume, finite(last.volume, null)),
      takerBuyQuoteVolume: finite(last.takerBuyQuoteVolume, finite(last.takerBuyQuote, null)),
      takerDeltaPct: finite(last.quoteVolume, finite(last.volume, 0)) > 0
        ? ((finite(last.takerBuyQuoteVolume, finite(last.takerBuyQuote, 0)) * 2
          - finite(last.quoteVolume, finite(last.volume, 0)))
          / finite(last.quoteVolume, finite(last.volume, 0))) * 100
        : null,
    } : null,
    ema13,
    ema25,
    ema99,
    ema99SlopePct,
    ema99DistancePct,
    ema99LongTouchDistancePct,
    ema99ShortTouchDistancePct,
    reboundFromApproachLowPct,
    rejectFromApproachHighPct,
    approachCandleSource: live ? 'LIVE_5M' : 'LAST_CLOSED_5M',
    live5mCandle: live ? {
      open: finite(live.open, null),
      high: finite(live.high, null),
      low: finite(live.low, null),
      close: finite(live.close, null),
      closeTime: finite(live.closeTime, null),
    } : null,
    pullbackFromRecentHighPct,
    bounceFromRecentLowPct,
    volumeX,
    takerDeltaPct,
    upperWickPct,
    lowerWickPct,
    lastBodyPct,
    lastClosePosition,
    lastBullish,
    higherLowConfirmed,
    fastEmaReclaimed,
    upperRejection,
    lowerReclaim,
    upperZone: upperZone ? { price: finite(upperZone.price), score: finite(upperZone.score, 0), distancePct: upperDistancePct } : null,
    lowerZone: lowerZone ? { price: finite(lowerZone.price), score: finite(lowerZone.score, 0), distancePct: lowerDistancePct } : null,
    upperZoneTouched,
    lowerZoneTouched,
    sweepConfirmation5m,
    baseSweepLong,
    baseSweepShort,
    trendAboveEma,
    trendBelowEma,
    trend1h,
    trend4h,
    htfBearCount,
    htfBullCount,
    htfBearTier: htfBearCount >= 2 ? 'A_BOTH' : htfBearCount === 1 ? 'B_ONE' : 'NONE',
    htfBullTier: htfBullCount >= 2 ? 'A_BOTH' : htfBullCount === 1 ? 'B_ONE' : 'NONE',
    ema99Retest5m,
    ema99Retest15m,
    pumpDistribution15m,
    postPumpShortSqueeze5m,
    flagpoleShortKill5m,
    fadingWaveLivePump5m,
    pumpFlushReclaim5m,
    emaFanLong5m,
    emaFanShort5m,
    heatmapBias: finite(heatmap?.bias, null),
    openInterest: finite(openInterest?.value, null),
    openInterestDeltaPct: finite(openInterest?.deltaPct, null),
    openInterestPriorDeltaPct: finite(openInterest?.priorDeltaPct, null),
    openInterestDelta5mPct: finite(openInterest?.delta5mPct, null),
    openInterestStabilizing: openInterest?.stabilizing === true,
    openInterestSamples: finite(openInterest?.samples, 0),
    shortLiquidationUsd: finite(liquidation?.shortLiquidationUsd, 0),
    longLiquidationUsd: finite(liquidation?.longLiquidationUsd, 0),
    shortLiquidationBurst: finite(liquidation?.shortBurstRatio, null),
    longLiquidationBurst: finite(liquidation?.longBurstRatio, null),
    prior5mShortLiquidationUsd: finite(liquidation?.prior5mShortLiquidationUsd, 0),
    prior5mLongLiquidationUsd: finite(liquidation?.prior5mLongLiquidationUsd, 0),
    older5mShortLiquidationUsd: finite(liquidation?.older5mShortLiquidationUsd, 0),
    older5mLongLiquidationUsd: finite(liquidation?.older5mLongLiquidationUsd, 0),
    shortLiquidationDecayRatio: finite(liquidation?.shortLiquidationDecayRatio, null),
    longLiquidationDecayRatio: finite(liquidation?.longLiquidationDecayRatio, null),
    shortLiquidationDecaying: liquidation?.shortLiquidationDecaying === true,
    longLiquidationDecaying: liquidation?.longLiquidationDecaying === true,
    shortLiquidationPeakUsd: finite(liquidation?.shortLiquidationPeakUsd, 0),
    longLiquidationPeakUsd: finite(liquidation?.longLiquidationPeakUsd, 0),
    liquidationEvents: finite(liquidation?.events, 0),
    liquidationSocketState: String(liquidation?.socketState ?? 'WARMING_UP'),
  };
}

function evidence(name, matched, value = null) {
  return { name, matched: Boolean(matched), value };
}

function evidenceScore(rows, weights) {
  return rows.reduce((sum, row) => sum + (row.matched ? (weights[row.name] ?? 1) : 0), 0);
}

export function classifyLiquidHeatmapFlowV2(features = {}) {
  const change24h = finite(features.change24hPct, 0);
  const change1h = finite(features.change1hPct, 0);
  const volumeX = finite(features.volumeX, 0);
  const takerDelta = finite(features.takerDeltaPct, 0);
  const oiDelta = finite(features.openInterestDeltaPct, null);
  const shortBurst = finite(features.shortLiquidationBurst, null);
  const longBurst = finite(features.longLiquidationBurst, null);
  const candleReady = finite(features.candleCount, 0) >= 12;
  const upMove = change24h >= 10 || change1h >= 3;
  const downMove = change24h <= -8 || change1h <= -3;
  const upImpulse = takerDelta >= 4 || volumeX >= 1.6 || (oiDelta != null && oiDelta >= 0.35);
  const downImpulse = takerDelta <= -4 || volumeX >= 1.6 || (oiDelta != null && oiDelta >= 0.35);
  const emaFan = features.emaFanLong5m ?? {};
  const emaFanRank = finite(features.moverRank, null);
  const emaFanRawReady = features.moverSide === 'UP'
    && emaFanRank != null && emaFanRank >= 1 && emaFanRank <= 100
    && change24h > 0
    && emaFan.ready === true;
  const emaFanImpulseReady = emaFanRawReady
    && finite(emaFan.volumeX, 0) >= 5
    && finite(emaFan.bodyPct, 0) >= 1
    && finite(emaFan.distanceFromEma13Pct, Infinity) <= 3;
  const emaFanRegularReady = emaFanRawReady
    && emaFanRank <= 50
    && !emaFanImpulseReady;
  const emaFanReady = emaFanImpulseReady || emaFanRegularReady;
  const emaFanDefinition = emaFanImpulseReady
    ? LIQUID_HEATMAP_FLOW_V2_LABELS.EMA_FAN_LONG_IMPULSE_RUNNER
    : LIQUID_HEATMAP_FLOW_V2_LABELS.EMA_FAN_LONG_READY;
  const emaFanRankCap = emaFanImpulseReady ? 100 : 50;
  const emaFanEvidence = [
    evidence('top-gainer-rank', emaFanRank != null && emaFanRank >= 1 && emaFanRank <= emaFanRankCap, emaFanRank),
    evidence('prior-ema-compression', finite(emaFan.priorMedianSpreadPct, Infinity) <= 1, emaFan.priorMedianSpreadPct),
    evidence('compression-density', finite(emaFan.compressedBars, 0) >= 8, emaFan.compressedBars),
    evidence('breakout-volume', finite(emaFan.volumeX, 0) >= 2.5, emaFan.volumeX),
    evidence('bullish-body', finite(emaFan.bodyPct, 0) >= 0.4, emaFan.bodyPct),
    evidence('ema-fan-order', finite(emaFan.ema13, 0) > finite(emaFan.ema25, Infinity)
      && finite(emaFan.ema25, 0) > finite(emaFan.ema99, Infinity), `${emaFan.ema13}/${emaFan.ema25}/${emaFan.ema99}`),
    evidence('ema-fan-widening', finite(emaFan.gap1325Pct, 0) > 0 && finite(emaFan.gap2599Pct, 0) > 0,
      `${emaFan.gap1325Pct}/${emaFan.gap2599Pct}`),
    evidence('rsi-guard', finite(emaFan.rsi14, Infinity) <= 85, emaFan.rsi14),
    evidence('entry-distance-cap', finite(emaFan.distanceFromEma13Pct, Infinity) <= 4, emaFan.distanceFromEma13Pct),
    ...(emaFanImpulseReady ? [
      evidence('impulse-volume', finite(emaFan.volumeX, 0) >= 5, emaFan.volumeX),
      evidence('impulse-body', finite(emaFan.bodyPct, 0) >= 1, emaFan.bodyPct),
      evidence('impulse-entry-distance', finite(emaFan.distanceFromEma13Pct, Infinity) <= 3, emaFan.distanceFromEma13Pct),
    ] : []),
  ];
  const emaFanClassification = emaFanReady ? {
    labelKey: emaFanDefinition.key,
    label: emaFanDefinition.title,
    side: emaFanDefinition.side,
    phase: emaFanDefinition.phase,
    confidence: clamp(Math.round(70 + Math.min(finite(emaFan.volumeX, 2.5), 8) * 2
      + Math.min(finite(emaFan.compressedBars, 8) - 8, 4) * 2), 0, 94),
    reason: emaFanImpulseReady
      ? 'EMA fan bullish IMPULSE: volume >=5x, body >=1%, top 100 va distance EMA13 <=3%; Binance MARKET $5 o 5x ngay khi READY.'
      : 'EMA fan bullish thuong: cham EMA13 +1% toi da 15m chi arm; doi nen 5m dong reclaim EMA13, higher-low, taker mua va fan khong co ca hai gap roi moi vao paper/Binance.',
    evidence: emaFanEvidence,
    signalCandleClosedAt: finite(emaFan.readyAt, finite(emaFan.candleClosedAt, null)),
    emaFanReadyAt: finite(emaFan.readyAt, null),
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: true,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  } : null;
  const emaFanShort = features.emaFanShort5m ?? {};
  const emaFanShortRank = finite(features.liquidityRank, null);
  const emaFanShortReady = features.emaFanShortUniverse === true
    && emaFanShortRank != null && emaFanShortRank >= 1 && emaFanShortRank <= 150
    && change24h <= -5
    && emaFanShort.ready === true;
  const emaFanShortEvidence = [
    evidence('top-liquidity-rank', emaFanShortRank != null && emaFanShortRank >= 1 && emaFanShortRank <= 150, emaFanShortRank),
    evidence('day-loss', change24h <= -5, change24h),
    evidence('prior-ema-compression', finite(emaFanShort.priorMedianSpreadPct, Infinity) <= 1, emaFanShort.priorMedianSpreadPct),
    evidence('compression-density', finite(emaFanShort.compressedBars, 0) >= 8, emaFanShort.compressedBars),
    evidence('breakdown-volume', finite(emaFanShort.volumeX, 0) >= 2.5, emaFanShort.volumeX),
    evidence('bearish-body', finite(emaFanShort.bodyPct, 0) >= 0.4, emaFanShort.bodyPct),
    evidence('ema-fan-order', finite(emaFanShort.ema13, Infinity) < finite(emaFanShort.ema25, 0)
      && finite(emaFanShort.ema25, Infinity) < finite(emaFanShort.ema99, 0), `${emaFanShort.ema13}/${emaFanShort.ema25}/${emaFanShort.ema99}`),
    evidence('ema-fan-widening', finite(emaFanShort.gap1325Pct, 0) > 0 && finite(emaFanShort.gap2599Pct, 0) > 0,
      `${emaFanShort.gap1325Pct}/${emaFanShort.gap2599Pct}`),
    evidence('rsi-guard', finite(emaFanShort.rsi14, -Infinity) >= 15, emaFanShort.rsi14),
    evidence('entry-distance-cap', finite(emaFanShort.distanceFromEma13Pct, Infinity) <= 4, emaFanShort.distanceFromEma13Pct),
  ];
  const emaFanShortClassification = emaFanShortReady ? {
    labelKey: LIQUID_HEATMAP_FLOW_V2_LABELS.EMA_FAN_SHORT_READY.key,
    label: LIQUID_HEATMAP_FLOW_V2_LABELS.EMA_FAN_SHORT_READY.title,
    side: LIQUID_HEATMAP_FLOW_V2_LABELS.EMA_FAN_SHORT_READY.side,
    phase: LIQUID_HEATMAP_FLOW_V2_LABELS.EMA_FAN_SHORT_READY.phase,
    confidence: clamp(Math.round(72 + Math.min(finite(emaFanShort.volumeX, 2.5), 8) * 2
      + Math.min(finite(emaFanShort.compressedBars, 8) - 8, 4) * 2), 0, 94),
    reason: 'Top 150 thanh khoản và ngày giảm ít nhất 5%: EMA13/25/99 nén chặt, breakdown bằng nến giảm + volume rồi xòe fan bearish. PAPER ONLY $10 × 5x.',
    evidence: emaFanShortEvidence,
    signalCandleClosedAt: finite(emaFanShort.readyAt, finite(emaFanShort.candleClosedAt, null)),
    emaFanReadyAt: finite(emaFanShort.readyAt, null),
    observationOnly: true,
    affectsOrders: false,
    affectsBinance: false,
    affectsEntry: false,
    affectsSize: false,
    affectsSlTp: false,
  } : null;

  const postPump = features.postPumpShortSqueeze5m ?? {};
  const postPumpUniverseReady = features.postPumpUniverse === true
    && finite(features.liquidityRank, null) != null
    && finite(features.liquidityRank, Infinity) <= 150;
  const postPumpLongReady = postPumpUniverseReady && postPump.longReady === true;
  const postPumpPrimeReady = postPumpLongReady && postPump.primeReady === true;
  const postPumpWatchReady = postPumpUniverseReady
    && postPump.watchReady === true
    && !postPumpLongReady;
  const postPumpEvidence = [
    evidence('top-liquidity-rank', postPumpUniverseReady, features.liquidityRank),
    evidence('post-pump-30', finite(postPump.pumpPct, 0) >= 30, postPump.pumpPct),
    evidence('post-pump-drawdown', finite(postPump.drawdownFromPeakPct, -Infinity) >= 25
      && finite(postPump.drawdownFromPeakPct, Infinity) <= 75, postPump.drawdownFromPeakPct),
    evidence('post-pump-base-range', finite(postPump.baseRangePct, Infinity) <= 6, postPump.baseRangePct),
    evidence('post-pump-base-flat', Math.abs(finite(postPump.baseReturnPct, Infinity)) <= 3.5, postPump.baseReturnPct),
    evidence('post-pump-lows-hold', postPump.lowsHolding === true, postPump.lowsHolding),
    evidence('volume-fade', finite(postPump.volumeFadeRatio, Infinity) <= 0.65, postPump.volumeFadeRatio),
    evidence('base-sell-absorption', finite(postPump.baseTakerDeltaPct, Infinity) <= -1, postPump.baseTakerDeltaPct),
    evidence('post-pump-breakout', postPump.longReady === true, postPump.baseHigh),
    evidence('breakout-volume', finite(postPump.breakoutVolumeX, 0) >= 1.8, postPump.breakoutVolumeX),
    evidence('breakout-taker', finite(postPump.breakoutTakerDeltaPct, -Infinity) >= 5, postPump.breakoutTakerDeltaPct),
    evidence('bullish-close', finite(postPump.bullishBodyPct, 0) > 0
      && finite(postPump.closePosition, 0) >= 0.65, `${postPump.bullishBodyPct}/${postPump.closePosition}`),
  ];
  const postPumpMatched = postPumpEvidence.filter((row) => row.matched).length;
  const postPumpDefinition = postPumpPrimeReady
    ? LIQUID_HEATMAP_FLOW_V2_LABELS.POST_PUMP_SHORT_SQUEEZE_PRIME
    : postPumpLongReady
      ? LIQUID_HEATMAP_FLOW_V2_LABELS.POST_PUMP_SHORT_SQUEEZE_LONG_READY
      : LIQUID_HEATMAP_FLOW_V2_LABELS.POST_PUMP_BASE_ABSORPTION_WATCH;
  const postPumpClassification = postPumpLongReady || postPumpWatchReady ? {
    labelKey: postPumpDefinition.key,
    label: postPumpDefinition.title,
    side: postPumpDefinition.side,
    phase: postPumpDefinition.phase,
    confidence: clamp(Math.round((postPumpLongReady ? 62 : 48)
      + postPumpMatched * 2
      + (postPumpPrimeReady ? 6 : 0)), 0, postPumpPrimeReady ? 96 : postPumpLongReady ? 92 : 86),
    reason: postPumpPrimeReady
      ? 'Pump >=30% da sap va tao base 5m; sell-flow trong base <= -1% duoc hap thu, sau do nen dong breakout bang volume + taker mua. PAPER ONLY, khong cap Binance.'
      : postPumpLongReady
        ? 'Pump >=30% da sap va tao base 5m co hep; nen dong breakout base bang volume + taker mua. Binance MARKET $2 margin x 5x.'
        : 'Pump >=30% da sap 25-75% va tao base 5m co hep/volume fade; chi WATCH, khong vao truoc breakout dong cua.',
    evidence: postPumpEvidence,
    signalCandleClosedAt: finite(postPump.readyAt, finite(postPump.candleClosedAt, null)),
    postPumpReadyAt: finite(postPump.readyAt, null),
    observationOnly: postPumpDefinition.observationOnly !== false,
    affectsOrders: postPumpDefinition.affectsOrders === true,
    affectsBinance: postPumpDefinition.affectsBinance === true,
    affectsEntry: postPumpDefinition.affectsEntry === true,
    affectsSize: postPumpDefinition.affectsSize === true,
    affectsSlTp: postPumpDefinition.affectsSlTp === true,
  } : null;

  const pumpFlush = features.pumpFlushReclaim5m ?? {};
  const pumpFlushUniverseReady = features.postPumpUniverse === true
    && finite(features.liquidityRank, null) != null
    && finite(features.liquidityRank, Infinity) <= 150;
  const pumpFlushLongReady = pumpFlushUniverseReady
    && change24h >= 0
    && pumpFlush.longReady === true;
  const pumpFlushEvidence = [
    evidence('top-liquidity-rank', pumpFlushUniverseReady, features.liquidityRank),
    evidence('day-not-negative', change24h >= 0, change24h),
    evidence('pump-5m', finite(pumpFlush.pumpPct, 0) >= 8, pumpFlush.pumpPct),
    evidence('range-atr', finite(pumpFlush.rangeAtr, 0) >= 2.5, pumpFlush.rangeAtr),
    evidence('spike-volume', finite(pumpFlush.spikeVolumeX, 0) >= 3, pumpFlush.spikeVolumeX),
    evidence('flush-near-base', finite(pumpFlush.retracePct, 0) >= 55
      && finite(pumpFlush.retracePct, Infinity) <= 105, pumpFlush.retracePct),
    evidence('base-held', pumpFlush.baseHeld === true, pumpFlush.flushLow),
    evidence('closed-reclaim', finite(pumpFlush.reclaimPct, 0) >= 1.8, pumpFlush.reclaimPct),
    evidence('reclaim-volume', finite(pumpFlush.reclaimVolumeX, 0) >= 1.5, pumpFlush.reclaimVolumeX),
    evidence('reclaim-taker-buy', finite(pumpFlush.reclaimTakerDeltaPct, -Infinity) >= 5,
      pumpFlush.reclaimTakerDeltaPct),
    evidence('reclaim-close-quality', finite(pumpFlush.reclaimClosePosition, 0) >= 0.65,
      pumpFlush.reclaimClosePosition),
    evidence('rsi-guard', finite(pumpFlush.reclaimRsi14, Infinity) >= 45
      && finite(pumpFlush.reclaimRsi14, Infinity) <= 78, pumpFlush.reclaimRsi14),
  ];
  const pumpFlushMatched = pumpFlushEvidence.filter((row) => row.matched).length;
  const pumpFlushClassification = pumpFlushLongReady ? {
    labelKey: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_FLUSH_RECLAIM_LONG_READY.key,
    label: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_FLUSH_RECLAIM_LONG_READY.title,
    side: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_FLUSH_RECLAIM_LONG_READY.side,
    phase: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_FLUSH_RECLAIM_LONG_READY.phase,
    confidence: clamp(Math.round(58 + pumpFlushMatched * 2.5
      + Math.min(finite(pumpFlush.spikeVolumeX, 3), 20) * 0.5), 0, 95),
    reason: 'Nến 5m pump mạnh đã xả về gần chân nhưng không đóng thủng base; nến 5m sau đó đóng reclaim EMA/vùng 25% biên pump bằng volume và taker mua. Binance MARKET $1.5 margin × 5x.',
    evidence: pumpFlushEvidence,
    signalCandleClosedAt: finite(pumpFlush.readyAt, finite(pumpFlush.candleClosedAt, null)),
    pumpFlushReadyAt: finite(pumpFlush.readyAt, null),
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: true,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  } : null;

  const flagpoleShortKill = features.flagpoleShortKill5m ?? {};
  const flagpoleUniverseReady = features.postPumpUniverse === true
    && finite(features.liquidityRank, null) != null
    && finite(features.liquidityRank, Infinity) <= 150;
  const minimumShortKillUsd = Math.max(10_000, finite(features.quoteVolume, 0) * 0.0001);
  const flagpoleShortKillReady = flagpoleUniverseReady
    && change24h >= 5
    && flagpoleShortKill.longReady === true
    && String(features.liquidationSocketState) === 'OPEN'
    && finite(features.shortLiquidationUsd, 0) >= minimumShortKillUsd
    && shortBurst != null && shortBurst >= 1.5;
  const flagpoleShortKillEvidence = [
    evidence('top-liquidity-rank', flagpoleUniverseReady, features.liquidityRank),
    evidence('day-already-up', change24h >= 5, change24h),
    evidence('prior-pump-leg', finite(flagpoleShortKill.priorPumpPct, 0) >= 8,
      flagpoleShortKill.priorPumpPct),
    evidence('post-pump-pullback', finite(flagpoleShortKill.pullbackPct, 0) >= 2.5
      && finite(flagpoleShortKill.barsAfterPriorPeak, 0) >= 4,
    `${flagpoleShortKill.pullbackPct}/${flagpoleShortKill.barsAfterPriorPeak}`),
    evidence('flagpole-breakout', finite(flagpoleShortKill.flagpoleBodyPct, 0) >= 1.5
      && finite(flagpoleShortKill.flagpoleRangeAtr, 0) >= 2.2,
    `${flagpoleShortKill.flagpoleBodyPct}/${flagpoleShortKill.flagpoleRangeAtr}`),
    evidence('flagpole-volume-taker', finite(flagpoleShortKill.flagpoleVolumeX, 0) >= 2.5
      && finite(flagpoleShortKill.flagpoleTakerDeltaPct, -Infinity) >= 8,
    `${flagpoleShortKill.flagpoleVolumeX}/${flagpoleShortKill.flagpoleTakerDeltaPct}`),
    evidence('wick-pullback-reclaim', finite(flagpoleShortKill.confirmationLowerWickShare, 0) >= 0.2
      && finite(flagpoleShortKill.confirmationClosePosition, 0) >= 0.6,
    `${flagpoleShortKill.confirmationLowerWickShare}/${flagpoleShortKill.confirmationClosePosition}`),
    evidence('force-buy-short-kill', finite(features.shortLiquidationUsd, 0) >= minimumShortKillUsd,
      `${features.shortLiquidationUsd}/${minimumShortKillUsd}`),
    evidence('short-liquidation-burst', shortBurst != null && shortBurst >= 1.5, shortBurst),
    evidence('force-socket-open', String(features.liquidationSocketState) === 'OPEN',
      features.liquidationSocketState),
    evidence('oi-not-expanding', oiDelta != null && oiDelta <= 0, oiDelta),
  ];
  const flagpoleMatched = flagpoleShortKillEvidence.filter((row) => row.matched).length;
  const flagpoleShortKillClassification = flagpoleShortKillReady ? {
    labelKey: LIQUID_HEATMAP_FLOW_V2_LABELS.POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY.key,
    label: LIQUID_HEATMAP_FLOW_V2_LABELS.POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY.title,
    side: LIQUID_HEATMAP_FLOW_V2_LABELS.POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY.side,
    phase: LIQUID_HEATMAP_FLOW_V2_LABELS.POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY.phase,
    confidence: clamp(Math.round(58 + flagpoleMatched * 3
      + Math.min(finite(shortBurst, 1.5), 5) * 2), 0, 96),
    reason: 'Đây không phải nhịp bơm đầu tiên: coin đã có pump + pullback, rồi flagpole 5m breakout và nến kế tiếp rút râu/reclaim trong lúc force BUY kill SHORT bùng lên. PAPER ONLY, không cấp Binance.',
    evidence: flagpoleShortKillEvidence,
    signalCandleClosedAt: finite(flagpoleShortKill.readyAt, finite(flagpoleShortKill.candleClosedAt, null)),
    flagpoleShortKillReadyAt: finite(flagpoleShortKill.readyAt, null),
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: false,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  } : null;

  const fadingWaveLivePump = features.fadingWaveLivePump5m ?? {};
  const fadingWaveUniverseReady = features.fadingWaveUniverse === true
    && finite(features.liquidityRank, null) != null
    && finite(features.liquidityRank, Infinity) <= 150
    && finite(features.quoteVolume, 0) >= 2_000_000;
  const fadingWaveLivePumpShortReady = fadingWaveUniverseReady
    && change24h <= 5
    && fadingWaveLivePump.shortReady === true;
  const fadingWaveLivePumpEvidence = [
    evidence('top-liquidity-rank', fadingWaveUniverseReady, features.liquidityRank),
    evidence('day-not-strong-positive', change24h <= 5, change24h),
    evidence('fading-wave-downtrend', finite(fadingWaveLivePump.ema99Slope12Pct, Infinity) <= -0.15
      && finite(fadingWaveLivePump.downReturn12Pct, Infinity) <= -1.5
      && finite(fadingWaveLivePump.belowEma99Bars, 0) >= 8,
    `${fadingWaveLivePump.ema99Slope12Pct}/${fadingWaveLivePump.downReturn12Pct}/${fadingWaveLivePump.belowEma99Bars}`),
    evidence('wave-peak-aged', finite(fadingWaveLivePump.barsSinceWavePeak, 0) >= 6,
      fadingWaveLivePump.barsSinceWavePeak),
    evidence('wave-drawdown', finite(fadingWaveLivePump.waveDrawdownPct, 0) >= 3,
      fadingWaveLivePump.waveDrawdownPct),
    evidence('live-pump-high', finite(fadingWaveLivePump.livePumpHighPct, 0) >= 4
      && finite(fadingWaveLivePump.liveMarkPumpPct, 0) >= 2,
    `${fadingWaveLivePump.livePumpHighPct}/${fadingWaveLivePump.liveMarkPumpPct}`),
    evidence('live-range-atr', finite(fadingWaveLivePump.liveRangeAtr, 0) >= 2.5,
      fadingWaveLivePump.liveRangeAtr),
    evidence('live-volume-taker', finite(fadingWaveLivePump.liveVolumeX, 0) >= 1.8
      && finite(fadingWaveLivePump.liveTakerDeltaPct, -Infinity) >= 8,
    `${fadingWaveLivePump.liveVolumeX}/${fadingWaveLivePump.liveTakerDeltaPct}`),
    evidence('live-giveback-wick', finite(fadingWaveLivePump.liveGivebackPct, 0) >= 0.6
      && finite(fadingWaveLivePump.liveGivebackPct, Infinity) <= 6
      && finite(fadingWaveLivePump.liveUpperWickShare, 0) >= 0.08,
    `${fadingWaveLivePump.liveGivebackPct}/${fadingWaveLivePump.liveUpperWickShare}`),
    evidence('live-ema99-sweep', finite(fadingWaveLivePump.liveHigh, 0)
      >= finite(fadingWaveLivePump.ema99, Infinity) * 1.005
      && finite(fadingWaveLivePump.liveClose, 0) >= finite(fadingWaveLivePump.ema99, Infinity),
    `${fadingWaveLivePump.liveHigh}/${fadingWaveLivePump.liveClose}/${fadingWaveLivePump.ema99}`),
  ];
  const fadingWaveMatched = fadingWaveLivePumpEvidence.filter((row) => row.matched).length;
  const fadingWaveLivePumpClassification = fadingWaveLivePumpShortReady ? {
    labelKey: LIQUID_HEATMAP_FLOW_V2_LABELS.FADING_WAVE_LIVE_PUMP_SHORT_READY.key,
    label: LIQUID_HEATMAP_FLOW_V2_LABELS.FADING_WAVE_LIVE_PUMP_SHORT_READY.title,
    side: LIQUID_HEATMAP_FLOW_V2_LABELS.FADING_WAVE_LIVE_PUMP_SHORT_READY.side,
    phase: LIQUID_HEATMAP_FLOW_V2_LABELS.FADING_WAVE_LIVE_PUMP_SHORT_READY.phase,
    confidence: clamp(Math.round(58 + fadingWaveMatched * 3.5
      + Math.min(finite(fadingWaveLivePump.liveVolumeX, 1.8), 10)), 0, 96),
    reason: 'Coin sóng tàn đang downtrend dựng một nến 5m live pump mạnh, quét lên EMA99 rồi bắt đầu rút khỏi đỉnh trong cùng nến. SHORT MARKET ngay; Binance $1 margin × 5x.',
    evidence: fadingWaveLivePumpEvidence,
    signalCandleClosedAt: finite(fadingWaveLivePump.liveCandleOpenAt, null),
    signalLiveCandleOpenAt: finite(fadingWaveLivePump.liveCandleOpenAt, null),
    signalObservedAt: finite(fadingWaveLivePump.detectedAt, null),
    observationOnly: false,
    affectsOrders: true,
    affectsBinance: true,
    affectsEntry: true,
    affectsSize: true,
    affectsSlTp: true,
  } : null;

  const baseLong = features.baseSweepLong ?? {};
  const baseShort = features.baseSweepShort ?? {};
  const sweepConfirmation = features.sweepConfirmation5m ?? {};
  const continuationLongVolumeX = Math.max(volumeX, finite(baseLong.breakoutVolumeX, 0));
  const continuationShortVolumeX = Math.max(volumeX, finite(baseShort.breakoutVolumeX, 0));
  const continuationLongEvidence = [
    evidence('base-sweep', baseLong.detected, baseLong.sweepExtreme),
    evidence('base-hold', baseLong.holdConfirmed, baseLong.barsSinceSweep),
    evidence('breakout', baseLong.breakoutConfirmed, baseLong.breakoutPct),
    evidence('volume', continuationLongVolumeX >= 1.6, continuationLongVolumeX),
    evidence('taker', takerDelta >= 2, takerDelta),
    evidence('oi', oiDelta != null && oiDelta <= -0.15, oiDelta),
    evidence('liquidation', longBurst != null && longBurst >= 1.15 && finite(features.longLiquidationUsd, 0) > 0, longBurst),
  ];
  const continuationShortEvidence = [
    evidence('base-sweep', baseShort.detected, baseShort.sweepExtreme),
    evidence('base-hold', baseShort.holdConfirmed, baseShort.barsSinceSweep),
    evidence('breakout', baseShort.breakoutConfirmed, baseShort.breakoutPct),
    evidence('volume', continuationShortVolumeX >= 1.6, continuationShortVolumeX),
    evidence('taker', takerDelta <= -2, takerDelta),
    evidence('oi', oiDelta != null && oiDelta <= -0.15, oiDelta),
    evidence('liquidation', shortBurst != null && shortBurst >= 1.15 && finite(features.shortLiquidationUsd, 0) > 0, shortBurst),
  ];

  const shortEvidence = [
    evidence('zone', sweepConfirmation.shortWatch === true || features.upperZoneTouched, features.upperZone?.distancePct),
    evidence('candle', sweepConfirmation.shortWatch === true || features.upperRejection, features.upperWickPct),
    evidence('closed-5m-confirmation', sweepConfirmation.shortReady === true, sweepConfirmation.confirmedAt),
    evidence('closed-taker', finite(sweepConfirmation.lastClosedTakerDeltaPct, Infinity) <= 0,
      sweepConfirmation.lastClosedTakerDeltaPct),
    evidence('oi', oiDelta != null && oiDelta <= -0.25, oiDelta),
    evidence('liquidation-ended', finite(features.shortLiquidationUsd, 0) <= 0, features.shortLiquidationUsd),
    evidence('force-socket-open', String(features.liquidationSocketState) === 'OPEN', features.liquidationSocketState),
  ];
  const longEvidence = [
    evidence('zone', sweepConfirmation.longWatch === true || features.lowerZoneTouched, features.lowerZone?.distancePct),
    evidence('candle', sweepConfirmation.longWatch === true || features.lowerReclaim, features.lowerWickPct),
    evidence('closed-5m-confirmation', sweepConfirmation.longReady === true, sweepConfirmation.confirmedAt),
    evidence('closed-taker', finite(sweepConfirmation.lastClosedTakerDeltaPct, -Infinity) >= 2,
      sweepConfirmation.lastClosedTakerDeltaPct),
    evidence('positive-day-pullback', change24h >= 0 && change24h <= 10 && change1h <= -3,
      `${change24h}/${change1h}`),
  ];
  const weights = {
    zone: 18,
    candle: 18,
    'closed-5m-confirmation': 28,
    'closed-taker': 14,
    oi: 12,
    'liquidation-ended': 10,
    'force-socket-open': 8,
    'positive-day-pullback': 22,
  };
  const shortScore = evidenceScore(shortEvidence, weights);
  const longScore = evidenceScore(longEvidence, weights);
  const shortReady = candleReady && upMove
    && sweepConfirmation.shortReady === true
    && finite(features.shortLiquidationUsd, 0) <= 0
    && String(features.liquidationSocketState) === 'OPEN'
    && oiDelta != null && oiDelta <= -0.25;
  const longReady = candleReady
    && change24h >= 0 && change24h <= 10 && change1h <= -3
    && sweepConfirmation.longReady === true;
  const shortSweepWatch = candleReady && upMove
    && (sweepConfirmation.shortWatch === true || (features.upperZoneTouched && features.upperRejection));
  const longSweepWatch = candleReady && downMove
    && (sweepConfirmation.longWatch === true || (features.lowerZoneTouched && features.lowerReclaim));
  const killLongPullback = finite(features.pullbackFromRecentHighPct, null);
  const killLongOi5m = finite(features.openInterestDelta5mPct, null);
  const killLongOiPrior = finite(features.openInterestPriorDeltaPct, null);
  const killLongDecayRatio = finite(features.longLiquidationDecayRatio, null);
  const killLongPriorForceSell = finite(features.prior5mLongLiquidationUsd, 0);
  const killLongPeakForceSell = finite(features.longLiquidationPeakUsd, 0);
  const killLongRebound = finite(features.reboundFromApproachLowPct, null);
  const killLongEvidence = [
    evidence('cascade-context', (killLongPullback != null && killLongPullback >= 4) || change1h <= -3,
      `${killLongPullback}/${change1h}`),
    evidence('cascade-volume', volumeX >= 1.5, volumeX),
    evidence('force-sell-peak', killLongPriorForceSell > 0 && killLongPeakForceSell > 0,
      `${killLongPriorForceSell}/${killLongPeakForceSell}`),
    evidence('force-sell-decay', features.longLiquidationDecaying === true
      && killLongDecayRatio != null && killLongDecayRatio <= 0.7, killLongDecayRatio),
    evidence('oi-washout-5m', killLongOi5m != null && killLongOi5m <= -0.5, killLongOi5m),
    evidence('oi-stabilizing', features.openInterestStabilizing === true,
      `${killLongOiPrior}/${oiDelta}`),
    evidence('taker-reversal', takerDelta >= 2, takerDelta),
    evidence('bullish-reclaim-close', features.lastBullish === true
      && finite(features.lastClosePosition, 0) >= 0.65
      && killLongRebound != null && killLongRebound >= 0.6,
    `${features.lastBodyPct}/${features.lastClosePosition}/${killLongRebound}`),
    evidence('fast-ema-reclaim', features.fastEmaReclaimed === true,
      `${features.lastClosedCandle?.close}/${features.ema13}/${features.ema25}`),
    evidence('higher-low-confirmed', features.higherLowConfirmed === true,
      `${features.lastClosedCandle?.low}/${features.markPrice}`),
  ];
  const killLongWeights = {
    'cascade-context': 10,
    'cascade-volume': 8,
    'force-sell-peak': 14,
    'force-sell-decay': 16,
    'oi-washout-5m': 12,
    'oi-stabilizing': 14,
    'taker-reversal': 10,
    'bullish-reclaim-close': 8,
    'fast-ema-reclaim': 5,
    'higher-low-confirmed': 3,
  };
  const killLongScore = evidenceScore(killLongEvidence, killLongWeights);
  const killLongExhaustionReady = candleReady && killLongEvidence.every((row) => row.matched);
  const continuationWeights = {
    'base-sweep': 24,
    'base-hold': 12,
    breakout: 22,
    volume: 16,
    taker: 16,
    oi: 5,
    liquidation: 5,
  };
  const continuationLongScore = evidenceScore(continuationLongEvidence, continuationWeights);
  const continuationShortScore = evidenceScore(continuationShortEvidence, continuationWeights);
  const continuationLongReady = candleReady
    && change24h >= 8 && change1h >= 0
    && baseLong.ready === true && features.trendAboveEma === true
    && continuationLongVolumeX >= 1.6 && takerDelta >= 2
    && features.upperRejection !== true;
  const continuationShortReady = candleReady
    && change24h <= -8 && change1h <= 0
    && baseShort.ready === true && features.trendBelowEma === true
    && continuationShortVolumeX >= 1.6 && takerDelta <= -2
    && features.lowerReclaim !== true;
  const ema99 = finite(features.ema99, null);
  const ema99Distance = finite(features.ema99DistancePct, null);
  const longTouchDistance = finite(features.ema99LongTouchDistancePct, null);
  const shortTouchDistance = finite(features.ema99ShortTouchDistancePct, null);
  const reboundFromLow = finite(features.reboundFromApproachLowPct, null);
  const rejectFromHigh = finite(features.rejectFromApproachHighPct, null);
  const ema99Slope = finite(features.ema99SlopePct, null);
  const pullback = finite(features.pullbackFromRecentHighPct, null);
  const bounce = finite(features.bounceFromRecentLowPct, null);
  const emaLongStack = ema99 != null
    && finite(features.ema13, 0) >= finite(features.ema25, 0) * 0.998
    && finite(features.ema25, 0) >= ema99 * 0.995;
  const emaShortStack = ema99 != null
    && finite(features.ema13, Infinity) <= finite(features.ema25, 0) * 1.002
    && finite(features.ema25, 0) <= ema99 * 1.005;
  const preLongEvidence = [
    evidence('ema99-wick-touch', longTouchDistance != null && longTouchDistance >= -0.5 && longTouchDistance <= 1.2, longTouchDistance),
    evidence('ema99-reclaim', ema99Distance != null && ema99Distance >= 0.1 && ema99Distance <= 0.5, ema99Distance),
    evidence('wick-rebound', reboundFromLow != null && reboundFromLow >= 0.6, reboundFromLow),
    evidence('ema-stack', emaLongStack, `${features.ema13}/${features.ema25}/${ema99}`),
    evidence('ema99-slope', ema99Slope != null && ema99Slope >= -0.08, ema99Slope),
    evidence('pullback', pullback != null && pullback >= 0.25 && pullback <= 12, pullback),
    evidence('volume', volumeX >= 0.8, volumeX),
    evidence('taker-guard', takerDelta >= -12, takerDelta),
  ];
  const preShortEvidence = [
    evidence('ema99-wick-touch', shortTouchDistance != null && shortTouchDistance <= 0.5 && shortTouchDistance >= -1.2, shortTouchDistance),
    evidence('ema99-reclaim', ema99Distance != null && ema99Distance <= -0.1 && ema99Distance >= -0.5, ema99Distance),
    evidence('wick-rebound', rejectFromHigh != null && rejectFromHigh >= 0.3, rejectFromHigh),
    evidence('ema-stack', emaShortStack, `${features.ema13}/${features.ema25}/${ema99}`),
    evidence('ema99-slope', ema99Slope != null && ema99Slope <= 0.08, ema99Slope),
    evidence('bounce', bounce != null && bounce >= 0.25 && bounce <= 12, bounce),
    evidence('volume', volumeX >= 0.8, volumeX),
    evidence('taker-guard', takerDelta <= 12, takerDelta),
  ];
  const preWeights = {
    'ema99-wick-touch': 18,
    'ema99-reclaim': 14,
    'wick-rebound': 10,
    'ema-stack': 22,
    'ema99-slope': 12,
    pullback: 12,
    bounce: 12,
    volume: 12,
    'taker-guard': 14,
  };
  const preLongScore = evidenceScore(preLongEvidence, preWeights);
  const preShortScore = evidenceScore(preShortEvidence, preWeights);
  const ema99Ready = finite(features.candleCount, 0) >= 180 && ema99 != null;
  const preLongReady = candleReady && ema99Ready
    && change24h >= 8 && change1h >= -3
    && preLongEvidence.every((row) => row.matched)
    && baseLong.ready !== true && features.upperRejection !== true;
  const preShortReady = candleReady && ema99Ready
    && change24h <= -8 && change1h <= 3
    && preShortEvidence.every((row) => row.matched)
    && baseShort.ready !== true && features.lowerReclaim !== true;
  const extendedRank = finite(features.moverRank, null);
  const extendedLongEvidence = [
    evidence('extended-rank', features.universeTier === 'EXTENDED_21_60'
      && features.moverSide === 'UP'
      && extendedRank != null && extendedRank >= 21 && extendedRank <= 60, extendedRank),
    evidence('day-move', change24h >= 3, change24h),
    evidence('panic-pullback', pullback != null && pullback >= 3 && pullback <= 15, pullback),
    evidence('ema99-wick-touch', longTouchDistance != null && longTouchDistance >= -2 && longTouchDistance <= 1.2, longTouchDistance),
    evidence('ema99-reclaim', ema99Distance != null && ema99Distance >= 0.1 && ema99Distance <= 2, ema99Distance),
    evidence('wick-rebound', reboundFromLow != null && reboundFromLow >= 0.3, reboundFromLow),
    evidence('ema-stack', emaLongStack, `${features.ema13}/${features.ema25}/${ema99}`),
    evidence('ema99-slope', ema99Slope != null && ema99Slope >= -0.08, ema99Slope),
    evidence('volume', volumeX >= 1.2, volumeX),
    evidence('taker-guard', takerDelta >= -25, takerDelta),
    evidence('htf-bull', finite(features.htfBullCount, 0) >= 1, features.htfBullTier),
  ];
  const extendedWeights = {
    'extended-rank': 12,
    'day-move': 8,
    'panic-pullback': 16,
    'ema99-wick-touch': 14,
    'ema99-reclaim': 16,
    'wick-rebound': 14,
    'ema-stack': 12,
    'ema99-slope': 8,
    volume: 12,
    'taker-guard': 10,
    'htf-bull': 14,
  };
  const extendedLongScore = evidenceScore(extendedLongEvidence, extendedWeights);
  const extendedLongReady = candleReady && ema99Ready
    && change1h >= -4
    && extendedLongEvidence.every((row) => row.matched)
    && baseLong.ready !== true && features.upperRejection !== true;
  const primaryRank = finite(features.moverRank, null);
  const primaryPanicUniverse = features.universeTier === 'PRIMARY_1_20'
    && features.moverSide === 'UP'
    && primaryRank != null && primaryRank >= 1 && primaryRank <= 20;
  const primaryEma99TouchObserved = (longTouchDistance != null && longTouchDistance >= -3 && longTouchDistance <= 1.5)
    || (ema99Distance != null && ema99Distance >= -3 && ema99Distance <= 1.5);
  const primaryPanicContext = primaryPanicUniverse
    && change24h >= 8
    && pullback != null && pullback >= 3 && pullback <= 20
    && primaryEma99TouchObserved
    && ema99Distance != null && ema99Distance >= -3 && ema99Distance <= 3
    && volumeX >= 1.2
    && finite(features.htfBullCount, 0) >= 1;
  const primarySellPressureActive = takerDelta <= -25;
  const primarySellPressureEased = takerDelta >= -25;
  const primaryPanicInitiated = primarySellPressureActive
    || (pullback != null && pullback >= 8 && volumeX >= 1.5);
  const primaryPanicEvidence = [
    evidence('primary-rank', primaryPanicUniverse, primaryRank),
    evidence('day-move', change24h >= 8, change24h),
    evidence('panic-pullback', pullback != null && pullback >= 3 && pullback <= 20, pullback),
    evidence('ema99-wick-touch', primaryEma99TouchObserved, `${longTouchDistance}/${ema99Distance}`),
    evidence('ema99-near', ema99Distance != null && ema99Distance >= -3 && ema99Distance <= 3, ema99Distance),
    evidence('volume-burst', volumeX >= 1.2, volumeX),
    evidence('htf-bull', finite(features.htfBullCount, 0) >= 1, features.htfBullTier),
    evidence('sell-flush', primarySellPressureActive, takerDelta),
    evidence('rebound', reboundFromLow != null && reboundFromLow >= 0.3, reboundFromLow),
    evidence('ema99-reclaim', ema99Distance != null && ema99Distance >= 0.1 && ema99Distance <= 3, ema99Distance),
    evidence('lower-reclaim', features.lowerReclaim === true, features.lowerWickPct),
    evidence('sell-pressure-eased', primarySellPressureEased, takerDelta),
  ];
  const primaryPanicWeights = {
    'primary-rank': 12,
    'day-move': 8,
    'panic-pullback': 14,
    'ema99-wick-touch': 16,
    'ema99-near': 10,
    'volume-burst': 12,
    'htf-bull': 12,
    'sell-flush': 14,
    rebound: 14,
    'ema99-reclaim': 16,
    'lower-reclaim': 12,
    'sell-pressure-eased': 14,
  };
  const primaryPanicScore = evidenceScore(primaryPanicEvidence, primaryPanicWeights);
  const primaryPanicActive = candleReady && ema99Ready && primaryPanicContext
    && primaryPanicInitiated;
  const primaryPanicLongReady = candleReady && ema99Ready && primaryPanicContext
    && reboundFromLow != null && reboundFromLow >= 0.3
    && ema99Distance >= 0.1
    && features.lowerReclaim === true
    && primarySellPressureEased
    && baseLong.ready !== true;
  const retest5m = features.ema99Retest5m ?? {};
  const retest15m = features.ema99Retest15m ?? {};
  const newestReadyRetest = (side) => [retest5m, retest15m]
    .filter((row) => row?.[`${side}Ready`] === true)
    .sort((a, b) => finite(b.candleClosedAt, 0) - finite(a.candleClosedAt, 0))[0] ?? null;
  const htfShortRetest = newestReadyRetest('short');
  const htfLongRetest = newestReadyRetest('long');
  const htfBearCount = finite(features.htfBearCount, 0);
  const htfBullCount = finite(features.htfBullCount, 0);
  const htfShortTouch = finite(htfShortRetest?.shortTouchDistancePct, null);
  const htfLongTouch = finite(htfLongRetest?.longTouchDistancePct, null);
  const htfPump = finite(htfShortRetest?.pumpPct, null);
  const htfDump = finite(htfLongRetest?.dumpPct, null);
  const htfShortTimeframe = String(htfShortRetest?.timeframe ?? '15m');
  const htfLongTimeframe = String(htfLongRetest?.timeframe ?? '15m');
  const htfShortSweepLimit = htfShortTimeframe === '5m' ? 15 : 1.5;
  const htfLongSweepLimit = htfLongTimeframe === '5m' ? 15 : 1.5;
  const htfShortEvidence = [
    evidence('htf-bear', htfBearCount >= 1, features.htfBearTier),
    evidence('ema99-mtf-touch', htfShortTouch != null && htfShortTouch >= -0.6 && htfShortTouch <= htfShortSweepLimit, `${htfShortTimeframe}:${htfShortTouch}`),
    evidence('pump-mtf', htfPump != null && htfPump >= 2, `${htfShortTimeframe}:${htfPump}`),
    evidence('reject-mtf', htfShortRetest?.shortReady === true, htfShortRetest?.givebackRatio),
    evidence('volume-mtf', finite(htfShortRetest?.volumeX, 0) >= 1.3, htfShortRetest?.volumeX),
    evidence('taker-mtf', finite(htfShortRetest?.takerDeltaPct, Infinity) <= 10, htfShortRetest?.takerDeltaPct),
  ];
  const htfLongEvidence = [
    evidence('htf-bull', htfBullCount >= 1, features.htfBullTier),
    evidence('ema99-mtf-touch', htfLongTouch != null && htfLongTouch >= -htfLongSweepLimit && htfLongTouch <= 0.6, `${htfLongTimeframe}:${htfLongTouch}`),
    evidence('dump-mtf', htfDump != null && htfDump >= 2, `${htfLongTimeframe}:${htfDump}`),
    evidence('reclaim-mtf', htfLongRetest?.longReady === true, htfLongRetest?.recoveryRatio),
    evidence('volume-mtf', finite(htfLongRetest?.volumeX, 0) >= 1.3, htfLongRetest?.volumeX),
    evidence('taker-mtf', finite(htfLongRetest?.takerDeltaPct, -Infinity) >= -10, htfLongRetest?.takerDeltaPct),
  ];
  const htfWeights = {
    'htf-bear': 24,
    'htf-bull': 24,
    'ema99-mtf-touch': 18,
    'pump-mtf': 14,
    'dump-mtf': 14,
    'reject-mtf': 20,
    'reclaim-mtf': 20,
    'volume-mtf': 12,
    'taker-mtf': 12,
  };
  const htfShortScore = evidenceScore(htfShortEvidence, htfWeights);
  const htfLongScore = evidenceScore(htfLongEvidence, htfWeights);
  const htfShortReady = htfBearCount >= 1 && htfShortRetest?.shortReady === true;
  const htfLongReady = htfBullCount >= 1 && htfLongRetest?.longReady === true;
  const distribution = features.pumpDistribution15m ?? {};
  const distributionEvidence = [
    evidence('strong-pump', finite(distribution.pumpPct, 0) >= (finite(distribution.pump72hPct, null) == null ? 10 : 30), distribution.pumpPct),
    evidence('sideway-range', finite(distribution.baseRangePct, Infinity) <= finite(distribution.adaptiveBaseRangeMaxPct, 14), distribution.baseRangePct),
    evidence('lower-highs', finite(distribution.lowerHighSteps, 0) >= 2, distribution.lowerHighSteps),
    evidence('upper-wicks', finite(distribution.upperWickCount, 0) >= 2, distribution.upperWickCount),
    evidence('volume-fade', finite(distribution.volumeFadeRatio, Infinity) <= 1.05, distribution.volumeFadeRatio),
    evidence('taker-fade', finite(distribution.baseTakerDeltaPct, Infinity) <= 15, distribution.baseTakerDeltaPct),
    evidence('breakdown', distribution.breakdownConfirmed === true, distribution.breakdownVolumeX),
    evidence('failed-retest', distribution.retestFailed === true || distribution.continuationConfirmed === true, distribution.support),
    evidence('sell-flow', finite(distribution.breakdownTakerDeltaPct, Infinity) <= 0, distribution.breakdownTakerDeltaPct),
  ];
  const distributionWeights = {
    'strong-pump': 20,
    'sideway-range': 18,
    'lower-highs': 14,
    'upper-wicks': 14,
    'volume-fade': 10,
    'taker-fade': 10,
    breakdown: 18,
    'failed-retest': 18,
    'sell-flow': 14,
  };
  const distributionScore = evidenceScore(distributionEvidence, distributionWeights);
  const distributionWatchReady = distribution.watchReady === true;
  const distributionShortReady = distribution.shortReady === true;
  const distributionClassification = distributionShortReady
    ? {
      labelKey: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_SHORT_READY.key,
      label: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_SHORT_READY.title,
      side: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_SHORT_READY.side,
      phase: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_SHORT_READY.phase,
      confidence: clamp(Math.round(55 + distributionScore * 0.25), 0, 94),
      reason: 'Sau pump manh, vung phan phoi da breakdown va xac nhan retest that bai/giu duoi ho tro. PAPER EVAL, khong cap Binance.',
      evidence: distributionEvidence,
      observationOnly: true,
      affectsOrders: false,
      affectsBinance: false,
      affectsEntry: false,
      affectsSize: false,
      affectsSlTp: false,
    }
    : distributionWatchReady ? {
      labelKey: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_WATCH.key,
      label: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_WATCH.title,
      side: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_WATCH.side,
      phase: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_WATCH.phase,
      confidence: clamp(Math.round(45 + distributionScore * 0.3), 0, 88),
      reason: `Pump manh dang ${String(distribution.unwindTier ?? 'UNWIND').replaceAll('_', ' ')}; dinh thap dan, rau tren va volume fade. Cho breakdown xac nhan.`,
      evidence: distributionEvidence,
      observationOnly: true,
      affectsOrders: false,
      affectsBinance: false,
      affectsEntry: false,
      affectsSize: false,
      affectsSlTp: false,
    }
      : null;

  let label = null;
  let confidence = 0;
  let evidenceRows = [];
  let reason = 'Chua du pha squeeze/sweep de gan nhan.';
  let ema99RetestTimeframe = null;
  let ema99RetestCandleClosedAt = null;
  if (fadingWaveLivePumpShortReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.FADING_WAVE_LIVE_PUMP_SHORT_READY;
    confidence = fadingWaveLivePumpClassification.confidence;
    evidenceRows = fadingWaveLivePumpEvidence;
    reason = fadingWaveLivePumpClassification.reason;
  } else if (killLongExhaustionReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY;
    confidence = clamp(Math.round(58 + killLongScore * 0.36), 0, 96);
    evidenceRows = killLongEvidence;
    reason = 'Cascade kill LONG da suy kiet: force SELL 5m giam, OI da washout roi on dinh, taker mua quay lai va nen 5m dong reclaim EMA13/25 voi higher-low. PAPER ONLY, khong cap Binance.';
  } else if (flagpoleShortKillReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY;
    confidence = flagpoleShortKillClassification.confidence;
    evidenceRows = flagpoleShortKillEvidence;
    reason = flagpoleShortKillClassification.reason;
  } else if (pumpFlushLongReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_FLUSH_RECLAIM_LONG_READY;
    confidence = pumpFlushClassification.confidence;
    evidenceRows = pumpFlushEvidence;
    reason = pumpFlushClassification.reason;
  } else if (continuationLongReady && (!continuationShortReady || continuationLongScore >= continuationShortScore)) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.UP_BASE_SWEEP_LONG_READY;
    confidence = clamp(Math.round(58 + continuationLongScore * 0.32 + Math.min(Math.max(change1h, 0), 20) * 0.35), 0, 96);
    evidenceRows = continuationLongEvidence;
    reason = 'Day base da bi quet va giu reclaim; nen dong breakout cung volume/taker xac nhan tiep dien LONG.';
  } else if (continuationShortReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.DOWN_BASE_SWEEP_SHORT_READY;
    confidence = clamp(Math.round(58 + continuationShortScore * 0.32 + Math.min(Math.max(Math.abs(change1h), 0), 20) * 0.35), 0, 96);
    evidenceRows = continuationShortEvidence;
    reason = 'Dinh base da bi quet va giu reject; nen dong breakdown cung volume/taker xac nhan tiep dien SHORT.';
  } else if (postPumpLongReady) {
    label = postPumpDefinition;
    confidence = postPumpClassification.confidence;
    evidenceRows = postPumpEvidence;
    reason = postPumpClassification.reason;
  } else if (shortReady && (!longReady || shortScore >= longScore)) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.UP_SWEEP_SHORT_READY;
    confidence = clamp(Math.round(58 + shortScore * 0.34), 0, 94);
    evidenceRows = shortEvidence;
    reason = 'Cum tren da bi quet/reject; nen 5m ke tiep dong retest-fail duoi EMA13, taker nen dong khong duong, OI washout va short-liquidation da ket thuc.';
  } else if (longReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.DOWN_SWEEP_LONG_READY;
    confidence = clamp(Math.round(58 + longScore * 0.34), 0, 94);
    evidenceRows = longEvidence;
    reason = 'Pullback 1h trong ngay con tang da quet cum duoi; nen 5m ke tiep tao higher-low, taker mua va dong reclaim EMA13/25.';
  } else if (primaryPanicLongReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY;
    confidence = clamp(Math.round(48 + primaryPanicScore * 0.27), 0, 94);
    evidenceRows = primaryPanicEvidence;
    reason = `Top tang hang ${primaryRank} da panic flush ${pullback.toFixed(2)}% ve EMA99 5m, hoi khoi day + reclaim va ap luc ban da ha nhiet. Binance MARKET $2 margin x 5x.`;
  } else if (htfShortReady && (!htfLongReady || htfShortScore >= htfLongScore)) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.HTF_BEAR_15M_EMA99_PUMP_REJECT;
    confidence = clamp(Math.round(55 + htfShortScore * 0.28 + (htfBearCount >= 2 ? 7 : 0)), 0, 94);
    evidenceRows = htfShortEvidence;
    ema99RetestTimeframe = htfShortTimeframe;
    ema99RetestCandleClosedAt = finite(htfShortRetest?.candleClosedAt, null);
    reason = `Xu huong 1h/4h dang giam; pump ${htfShortTimeframe} quet EMA99 da dong reject xuong. PAPER EVAL, khong cap Binance.`;
  } else if (htfLongReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.HTF_BULL_15M_EMA99_DUMP_RECLAIM;
    confidence = clamp(Math.round(55 + htfLongScore * 0.28 + (htfBullCount >= 2 ? 7 : 0)), 0, 94);
    evidenceRows = htfLongEvidence;
    ema99RetestTimeframe = htfLongTimeframe;
    ema99RetestCandleClosedAt = finite(htfLongRetest?.candleClosedAt, null);
    reason = `Xu huong 1h/4h dang tang; dump ${htfLongTimeframe} quet EMA99 da dong reclaim len. PAPER EVAL, khong cap Binance.`;
  } else if (shortSweepWatch) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.UP_SWEEP_SHORT_WATCH;
    confidence = clamp(Math.round(44 + shortScore * 0.28), 0, 88);
    evidenceRows = shortEvidence;
    reason = finite(features.shortLiquidationUsd, 0) > 0
      ? 'Da quet/reject cum tren nhung short-liquidation van dang xay ra; giu WATCH, khong SHORT khi squeeze chua ket thuc.'
      : 'Da quet/reject cum tren; cho nen 5m ke tiep retest-fail, dong duoi EMA13 va OI washout truoc khi READY.';
  } else if (longSweepWatch) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.DOWN_SWEEP_LONG_WATCH;
    confidence = clamp(Math.round(42 + longScore * 0.28), 0, 86);
    evidenceRows = longEvidence;
    reason = change24h < 0
      ? 'Da quet/reclaim cum duoi nhung ngay van giam; generic catch-bottom chi WATCH, cho nhan exhaustion/HTF rieng.'
      : 'Da quet/reclaim cum duoi; cho nen 5m ke tiep higher-low, taker mua va dong tren EMA13/25 truoc khi READY.';
  } else if (distributionShortReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_SHORT_READY;
    confidence = clamp(Math.round(55 + distributionScore * 0.25), 0, 94);
    evidenceRows = distributionEvidence;
    reason = 'Sau pump manh, vung sideway phan phoi da breakdown va retest ho tro that bai. PAPER EVAL, khong cap Binance.';
  } else if (primaryPanicActive) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PRIMARY_EMA99_PANIC_FLUSH_ACTIVE;
    confidence = clamp(Math.round(44 + primaryPanicScore * 0.25), 0, 91);
    evidenceRows = primaryPanicEvidence;
    reason = `Top tang hang ${primaryRank} dang panic flush ${pullback.toFixed(2)}% ve EMA99 5m (taker hien tai ${takerDelta.toFixed(2)}%); cho gia reclaim EMA99, chua bat LONG.`;
  } else if (distributionWatchReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_WATCH;
    confidence = clamp(Math.round(45 + distributionScore * 0.3), 0, 88);
    evidenceRows = distributionEvidence;
    reason = 'Pump manh da chuyen sang sideway voi dinh thap dan, rau tren va volume fade; chi theo doi cho breakdown + retest.';
  } else if (postPumpWatchReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.POST_PUMP_BASE_ABSORPTION_WATCH;
    confidence = postPumpClassification.confidence;
    evidenceRows = postPumpEvidence;
    reason = postPumpClassification.reason;
  } else if (extendedLongReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.EXTENDED_EMA99_PANIC_RECLAIM_LONG;
    confidence = clamp(Math.round(46 + extendedLongScore * 0.3 - Math.abs(ema99Distance) * 2), 0, 90);
    evidenceRows = extendedLongEvidence;
    reason = `Top tang hang ${extendedRank} vua panic pullback ${pullback.toFixed(2)}% ve EMA99 5m, da hoi + reclaim voi volume; PAPER EVAL, khong cap Binance.`;
  } else if (preLongReady && (!preShortReady || preLongScore >= preShortScore)) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PRE_UP_BASE_LONG;
    confidence = clamp(Math.round(48 + preLongScore * 0.34 - Math.abs(ema99Distance) * 3), 0, 88);
    evidenceRows = preLongEvidence;
    reason = 'Top tang dang pullback sat EMA99 5m voi cau truc EMA va flow con giu; tao paper LONG som, chua phai BASE READY.';
  } else if (preShortReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PRE_DOWN_BASE_SHORT;
    confidence = clamp(Math.round(48 + preShortScore * 0.34 - Math.abs(ema99Distance) * 3), 0, 88);
    evidenceRows = preShortEvidence;
    reason = 'Top giam dang hoi sat EMA99 5m voi cau truc EMA va flow con giu; tao paper SHORT som, chua phai BASE READY.';
  } else if (upMove && upImpulse) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.UP_SQUEEZE_ACTIVE;
    confidence = clamp(Math.round(45 + Math.min(Math.max(change24h, change1h * 3), 45) * 0.7 + Math.min(volumeX, 4) * 5), 0, 94);
    evidenceRows = shortEvidence;
    reason = 'Gia/volume dang mo rong len; cho sweep + reject truoc khi xet SHORT.';
  } else if (downMove && downImpulse) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.DOWN_SQUEEZE_ACTIVE;
    confidence = clamp(Math.round(45 + Math.min(Math.max(Math.abs(change24h), Math.abs(change1h) * 3), 45) * 0.7 + Math.min(volumeX, 4) * 5), 0, 94);
    evidenceRows = longEvidence;
    reason = 'Gia/volume dang mo rong xuong; cho sweep + reclaim truoc khi xet LONG.';
  }

  const missing = [];
  if (!candleReady) missing.push('closed-candles');
  if (features.trend1h?.ready !== true && features.trend4h?.ready !== true) missing.push('htf-1h-4h-candles');
  if (features.ema99Retest5m?.ready !== true && features.ema99Retest15m?.ready !== true) missing.push('5m-15m-ema99-candles');
  if (finite(features.openInterestSamples, 0) < 2 || finite(features.openInterestDeltaPct, null) == null) missing.push('oi-delta');
  if (String(features.liquidationSocketState) !== 'OPEN') missing.push('force-order-socket');
  else if (finite(features.liquidationEvents, 0) === 0) missing.push('liquidation-events');
  const continuationReady = label?.key === 'UP_BASE_SWEEP_LONG_READY'
    || label?.key === 'UP_SWEEP_SHORT_READY'
    || label?.key === 'DOWN_SWEEP_LONG_READY'
    || label?.key === 'DOWN_BASE_SWEEP_SHORT_READY'
    || label?.key === 'PRE_UP_BASE_LONG'
    || label?.key === 'PRE_DOWN_BASE_SHORT'
    || label?.key === 'HTF_BEAR_15M_EMA99_PUMP_REJECT'
    || label?.key === 'HTF_BULL_15M_EMA99_DUMP_RECLAIM'
    || label?.key === 'EXTENDED_EMA99_PANIC_RECLAIM_LONG'
    || label?.key === 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE'
    || label?.key === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY'
    || label?.key === 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY'
    || label?.key === 'PUMP_DISTRIBUTION_WATCH'
    || label?.key === 'PUMP_DISTRIBUTION_SHORT_READY'
    || label?.key === 'POST_PUMP_BASE_ABSORPTION_WATCH'
    || label?.key === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY'
    || label?.key === 'POST_PUMP_SHORT_SQUEEZE_PRIME'
    || label?.key === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY'
    || label?.key === 'FADING_WAVE_LIVE_PUMP_SHORT_READY'
    || label?.key === 'PUMP_FLUSH_RECLAIM_LONG_READY';
  const sweepWatch = label?.key === 'UP_SWEEP_SHORT_WATCH'
    || label?.key === 'DOWN_SWEEP_LONG_WATCH';
  const secondaryLabels = [
    distributionClassification,
    postPumpClassification,
    flagpoleShortKillClassification,
    pumpFlushClassification,
    emaFanClassification,
    emaFanShortClassification,
  ]
    .filter((classification) => classification && classification.labelKey !== label?.key);

  const selectedPostPumpReady = label?.key === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY';
  const selectedPostPumpPrime = label?.key === 'POST_PUMP_SHORT_SQUEEZE_PRIME';
  const selectedPrimaryPanicReady = label?.key === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY';
  const selectedKillLongExhaustion = label?.key === 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY';
  const selectedFlagpoleShortKill = label?.key === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY';
  const selectedFadingWaveLivePump = label?.key === 'FADING_WAVE_LIVE_PUMP_SHORT_READY';
  const selectedPumpFlush = label?.key === 'PUMP_FLUSH_RECLAIM_LONG_READY';
  const selectedSweepReady = label?.key === 'UP_SWEEP_SHORT_READY'
    || label?.key === 'DOWN_SWEEP_LONG_READY';
  const selectedPaperOnly = selectedPostPumpPrime || selectedKillLongExhaustion || selectedFlagpoleShortKill;
  const selectedBinanceReady = selectedPostPumpReady || selectedPrimaryPanicReady
    || selectedPumpFlush || selectedFadingWaveLivePump;
  const selectedExecutable = selectedPaperOnly || selectedBinanceReady;

  return {
    version: LIQUID_HEATMAP_FLOW_V2_VERSION,
    labelKey: label?.key ?? 'WAIT',
    label: label?.title ?? 'WAIT · NO CONFIRMATION',
    side: label?.side ?? null,
    phase: label?.phase ?? 'WAIT',
    confidence,
    reason,
    evidence: evidenceRows,
    signalCandleClosedAt: selectedFadingWaveLivePump
      ? finite(features.fadingWaveLivePump5m?.liveCandleOpenAt, null)
      : selectedFlagpoleShortKill
      ? finite(features.flagpoleShortKill5m?.readyAt, null)
      : selectedPumpFlush
      ? finite(features.pumpFlushReclaim5m?.readyAt, null)
      : selectedPostPumpReady || selectedPostPumpPrime
        ? finite(features.postPumpShortSqueeze5m?.readyAt, finite(features.candleClosedAt, null))
        : selectedPrimaryPanicReady || selectedKillLongExhaustion || selectedSweepReady
          ? finite(features.candleClosedAt, null)
          : null,
    ema99RetestTimeframe,
    ema99RetestCandleClosedAt,
    secondaryLabels,
    missing,
    warmingUp: !candleReady || (!continuationReady && !sweepWatch && !postPumpLongReady && !postPumpWatchReady
      && !emaFanReady && !emaFanShortReady
      && (missing.includes('oi-delta') || missing.includes('force-order-socket'))),
    observationOnly: !selectedExecutable,
    affectsOrders: selectedExecutable,
    affectsBinance: selectedBinanceReady,
    affectsEntry: selectedExecutable,
    affectsSize: selectedExecutable,
    affectsSlTp: selectedExecutable,
  };
}

export function liquidHeatmapFlowV2Stats(rows = [], paperTrades = []) {
  const list = Object.values(LIQUID_HEATMAP_FLOW_V2_LABELS).map((definition) => ({
    ...definition,
    whitelistKey: `heatmap-v2:${definition.key}`,
    active: 0,
    ready: definition.phase === 'READY',
    maxConfidence: 0,
    symbols: [],
    observationOnly: definition.observationOnly !== false,
    affectsOrders: definition.affectsOrders === true,
    affectsBinance: definition.affectsBinance === true,
    affectsEntry: definition.affectsEntry === true,
    affectsSize: definition.affectsSize === true,
    affectsSlTp: definition.affectsSlTp === true,
    paperClosed: 0,
    paperAvgRoe: null,
    whitelistEligible: false,
  }));
  const byKey = new Map(list.map((row) => [row.key, row]));
  for (const row of Array.isArray(rows) ? rows : []) {
    const classifications = [
      row?.classification,
      ...(Array.isArray(row?.classification?.secondaryLabels) ? row.classification.secondaryLabels : []),
    ];
    const seen = new Set();
    for (const classification of classifications) {
      const key = String(classification?.labelKey ?? '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const stat = byKey.get(key);
      if (!stat) continue;
      stat.active += 1;
      stat.maxConfidence = Math.max(stat.maxConfidence, finite(classification?.confidence, 0));
      if (stat.symbols.length < 6) stat.symbols.push(row.symbol);
    }
  }
  const paperByLabel = new Map();
  for (const trade of Array.isArray(paperTrades) ? paperTrades : []) {
    if (trade?.status !== 'CLOSED' || !byKey.has(trade?.labelKey)) continue;
    const bucket = paperByLabel.get(trade.labelKey) ?? { closed: 0, roeSum: 0 };
    bucket.closed += 1;
    bucket.roeSum += finite(trade.netRoe, 0);
    paperByLabel.set(trade.labelKey, bucket);
  }
  for (const stat of list) {
    const paper = paperByLabel.get(stat.key);
    if (!paper) continue;
    stat.paperClosed = paper.closed;
    stat.paperAvgRoe = +(paper.roeSum / paper.closed).toFixed(2);
    stat.whitelistEligible = stat.paperAvgRoe > 4;
  }
  return list;
}
