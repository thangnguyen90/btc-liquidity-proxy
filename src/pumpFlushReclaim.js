import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const PUMP_FLUSH_RECLAIM_VERSION =
  'PUMP_FLUSH_RECLAIM_BIDIRECTIONAL_DISCORD_V3_DEEP_BASE_GATES_20260916';

export const PUMP_FLUSH_RECLAIM_RULE = Object.freeze({
  minBars15m: 32,
  minBars5m: 40,
  structureLookback15m: 16,
  impulseBarsMin: 2,
  impulseBarsMax: 4,
  impulseMinPct: 8,
  directionalBarsMin: 2,
  impulseVolumeRatio: 1.5,
  reversalLookaheadBars: 6,
  retraceMinPct: 65,
  retraceMaxPct: 95,
  reversalVolumeRatio: 1.5,
  reversalWickMinPct: 25,
  reversalCloseRecoveryMinPct: 55,
  reversalStrongCloseRecoveryPct: 70,
  confirmationVolumeRatio: 1.2,
  confirmationMoveMinPct: 2,
  longTakerBuyRatioMin: 0.52,
  shortTakerBuyRatioMax: 0.48,
  maxDistanceFromReclaimPct: 2,
  contextLookback15m: 96,
  maxPreImpulseExtensionPct: 60,
  minDistanceFromImpulseExtremePct: 2,
  maxRecoveryTowardExtremePct: 80,
  maxSignalAgeMs: 10 * 60_000,
  max15mAgeMs: 25 * 60_000,
});

const FIVE_MINUTES = 5 * 60_000;
const FIFTEEN_MINUTES = 15 * 60_000;
const HOUR_MS = 60 * 60_000;
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const number = (value) => Number.isFinite(value)
  ? Number(value.toFixed(10)).toString()
  : '—';
const pct = (value, digits = 2) => Number.isFinite(value)
  ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
  : '—';
const compact = (value) => Number.isFinite(value)
  ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
  : '—';
const vn = (value) => new Date(value).toLocaleString('vi-VN', {
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
    takerBuyQuoteVolume: valueOf(row, 'takerBuyQuoteVolume', 10),
  };
  if (![bar.openTime, bar.open, bar.high, bar.low, bar.close, bar.closeTime]
    .every(Number.isFinite)
    || bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0
    || bar.high < Math.max(bar.open, bar.close)
    || bar.low > Math.min(bar.open, bar.close)) return null;
  if (!Number.isFinite(bar.quoteVolume) && Number.isFinite(bar.volume)) {
    bar.quoteVolume = bar.volume * bar.close;
  }
  return bar;
}

function normalizeClosed(rows, now, limit) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeBar)
    .filter((bar) => bar && bar.closeTime < now)
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-limit);
}

function median(values) {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function ema(values, period) {
  if (values.length < period) return null;
  const alpha = 2 / (period + 1);
  let result = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) result = value * alpha + result * (1 - alpha);
  return result;
}

function barsContinuous(bars, intervalMs) {
  for (let index = 1; index < bars.length; index += 1) {
    if (Math.abs(bars[index].openTime - bars[index - 1].openTime - intervalMs) > 1_000) {
      return false;
    }
  }
  return true;
}

function volumeRatio(bar, baseline) {
  return baseline > 0 && Number(bar?.quoteVolume) > 0 ? bar.quoteVolume / baseline : null;
}

function candleShape(bar) {
  const range = bar.high - bar.low;
  if (!(range > 0)) return { lowerWickPct: 0, upperWickPct: 0, closePositionPct: 50 };
  return {
    lowerWickPct: (Math.min(bar.open, bar.close) - bar.low) / range * 100,
    upperWickPct: (bar.high - Math.max(bar.open, bar.close)) / range * 100,
    closePositionPct: (bar.close - bar.low) / range * 100,
  };
}

function takerBuyRatio(bars) {
  const valid = bars.filter((bar) => Number(bar.quoteVolume) > 0
    && Number.isFinite(bar.takerBuyQuoteVolume));
  if (!valid.length) return null;
  const quote = valid.reduce((sum, bar) => sum + bar.quoteVolume, 0);
  return quote > 0
    ? valid.reduce((sum, bar) => sum + bar.takerBuyQuoteVolume, 0) / quote
    : null;
}

function confirmationMetrics(bars5m, pivotBar, side, rule) {
  const searchStart = bars5m.findIndex((bar) => bar.openTime >= pivotBar.openTime);
  if (searchStart < 0) return null;
  const searchRows = bars5m.slice(searchStart);
  const relativePivotIndex = side === 'LONG'
    ? searchRows.reduce((best, bar, index) => (bar.low < searchRows[best].low ? index : best), 0)
    : searchRows.reduce((best, bar, index) => (bar.high > searchRows[best].high ? index : best), 0);
  const pivotIndex = searchStart + relativePivotIndex;
  const afterPivot = bars5m.slice(pivotIndex + 1);
  if (afterPivot.length < 2) return null;
  const current = bars5m.at(-1);
  const closes = bars5m.map((bar) => bar.close);
  const ema13 = ema(closes, 13);
  const ema25 = ema(closes, 25);
  if (!(ema13 > 0) || !(ema25 > 0)) return null;
  const pivot = bars5m[pivotIndex];
  const baseline = median(bars5m.slice(Math.max(0, pivotIndex - 20), pivotIndex)
    .map((bar) => bar.quoteVolume));
  if (!(baseline > 0)) return null;
  const directional = afterPivot.filter((bar) => side === 'LONG'
    ? bar.close > bar.open
    : bar.close < bar.open);
  const confirmVolumeRatio = Math.max(0, ...directional.map((bar) => volumeRatio(bar, baseline) ?? 0));
  const midpoint = (pivotBar.high + pivotBar.low) / 2;
  const reclaimLevel = side === 'LONG'
    ? Math.max(ema13, ema25, midpoint)
    : Math.min(ema13, ema25, midpoint);
  const distanceFromReclaimPct = side === 'LONG'
    ? (current.close / reclaimLevel - 1) * 100
    : (reclaimLevel / current.close - 1) * 100;
  const moveFromPivotPct = side === 'LONG'
    ? (current.close / pivot.low - 1) * 100
    : (1 - current.close / pivot.high) * 100;
  const structureHeld = side === 'LONG'
    ? Math.min(...afterPivot.map((bar) => bar.low)) >= pivot.low * 0.998
    : Math.max(...afterPivot.map((bar) => bar.high)) <= pivot.high * 1.002;
  const emaReclaimed = side === 'LONG'
    ? current.close > ema13 && current.close > ema25 && current.close > midpoint
    : current.close < ema13 && current.close < ema25 && current.close < midpoint;
  const takerRatio = takerBuyRatio(directional.slice(-4));
  const takerConfirmed = takerRatio == null || (side === 'LONG'
    ? takerRatio >= rule.longTakerBuyRatioMin
    : takerRatio <= rule.shortTakerBuyRatioMax);
  if (!structureHeld || !emaReclaimed
    || confirmVolumeRatio < rule.confirmationVolumeRatio
    || moveFromPivotPct < rule.confirmationMoveMinPct
    || distanceFromReclaimPct < 0
    || distanceFromReclaimPct > rule.maxDistanceFromReclaimPct
    || !takerConfirmed) return null;
  return {
    current,
    pivot,
    ema13,
    ema25,
    reclaimLevel,
    distanceFromReclaimPct,
    moveFromPivotPct,
    confirmVolumeRatio,
    takerBuyRatio: takerRatio,
    confirmationBars: afterPivot.length,
  };
}

function candidateForSide(bars15m, bars5m, side, now, rule) {
  const candidates = [];
  const searchStart = Math.max(20, bars15m.length - rule.structureLookback15m);
  for (let extremeIndex = searchStart; extremeIndex < bars15m.length - 1; extremeIndex += 1) {
    for (let length = rule.impulseBarsMin; length <= rule.impulseBarsMax; length += 1) {
      const startIndex = extremeIndex - length + 1;
      if (startIndex < 20) continue;
      const impulse = bars15m.slice(startIndex, extremeIndex + 1);
      if (!barsContinuous(impulse, FIFTEEN_MINUTES)) continue;
      const extreme = bars15m[extremeIndex];
      const directionalBars = impulse.filter((bar) => side === 'LONG'
        ? bar.close > bar.open
        : bar.close < bar.open).length;
      if (directionalBars < rule.directionalBarsMin) continue;
      const priorVolume = median(bars15m.slice(startIndex - 20, startIndex)
        .map((bar) => bar.quoteVolume));
      if (!(priorVolume > 0)) continue;
      const impulseVolumeRatio = Math.max(...impulse
        .map((bar) => volumeRatio(bar, priorVolume) ?? 0));
      const impulseStart = impulse[0].open;
      const contextRows = bars15m.slice(
        Math.max(0, startIndex - rule.contextLookback15m),
        startIndex,
      );
      if (!contextRows.length) continue;
      const contextExtreme = side === 'LONG'
        ? Math.min(...contextRows.map((bar) => bar.low))
        : Math.max(...contextRows.map((bar) => bar.high));
      const preImpulseExtensionPct = side === 'LONG'
        ? (impulseStart / contextExtreme - 1) * 100
        : (1 - impulseStart / contextExtreme) * 100;
      if (!Number.isFinite(preImpulseExtensionPct)
        || preImpulseExtensionPct > rule.maxPreImpulseExtensionPct) continue;
      const impulseExtreme = side === 'LONG'
        ? Math.max(...impulse.map((bar) => bar.high))
        : Math.min(...impulse.map((bar) => bar.low));
      if ((side === 'LONG' && extreme.high !== impulseExtreme)
        || (side === 'SHORT' && extreme.low !== impulseExtreme)) continue;
      const impulsePct = side === 'LONG'
        ? (impulseExtreme / impulseStart - 1) * 100
        : (1 - impulseExtreme / impulseStart) * 100;
      if (impulsePct < rule.impulseMinPct || impulseVolumeRatio < rule.impulseVolumeRatio) continue;
      const post = bars15m.slice(extremeIndex + 1,
        Math.min(bars15m.length, extremeIndex + 1 + rule.reversalLookaheadBars));
      if (!post.length || !barsContinuous([extreme, ...post], FIFTEEN_MINUTES)) continue;
      const reversal = side === 'LONG'
        ? post.reduce((best, bar) => (bar.low < best.low ? bar : best))
        : post.reduce((best, bar) => (bar.high > best.high ? bar : best));
      const impulseRange = Math.abs(impulseExtreme - impulseStart);
      if (!(impulseRange > 0)) continue;
      const retracePct = side === 'LONG'
        ? (impulseExtreme - reversal.low) / impulseRange * 100
        : (reversal.high - impulseExtreme) / impulseRange * 100;
      const reversalVolumeRatio = volumeRatio(reversal, priorVolume);
      const shape = candleShape(reversal);
      const recoveryPct = side === 'LONG' ? shape.closePositionPct : 100 - shape.closePositionPct;
      const wickPct = side === 'LONG' ? shape.lowerWickPct : shape.upperWickPct;
      if (retracePct < rule.retraceMinPct || retracePct > rule.retraceMaxPct
        || reversalVolumeRatio < rule.reversalVolumeRatio
        || recoveryPct < rule.reversalCloseRecoveryMinPct
        || (wickPct < rule.reversalWickMinPct
          && recoveryPct < rule.reversalStrongCloseRecoveryPct)) continue;
      const confirmationRows = bars5m.filter((bar) => bar.openTime >= reversal.openTime);
      if (confirmationRows.length < 3 || !barsContinuous(confirmationRows, FIVE_MINUTES)) continue;
      const confirmation = confirmationMetrics(bars5m, reversal, side, rule);
      if (!confirmation || now - confirmation.current.closeTime > rule.maxSignalAgeMs) continue;
      if ((side === 'LONG' && confirmation.current.close > impulseExtreme * 1.04)
        || (side === 'SHORT' && confirmation.current.close < impulseExtreme * 0.96)) continue;
      const distanceFromImpulseExtremePct = side === 'LONG'
        ? (1 - confirmation.current.close / impulseExtreme) * 100
        : (confirmation.current.close / impulseExtreme - 1) * 100;
      const reversalExtreme = side === 'LONG' ? reversal.low : reversal.high;
      const postReversalRange = Math.abs(impulseExtreme - reversalExtreme);
      const recoveryTowardExtremePct = postReversalRange > 0
        ? (side === 'LONG'
          ? (confirmation.current.close - reversalExtreme) / postReversalRange * 100
          : (reversalExtreme - confirmation.current.close) / postReversalRange * 100)
        : 100;
      if (distanceFromImpulseExtremePct < rule.minDistanceFromImpulseExtremePct
        || recoveryTowardExtremePct > rule.maxRecoveryTowardExtremePct) continue;
      const score = Math.round(clamp(
        20 * clamp(impulsePct / 14)
        + 15 * clamp(impulseVolumeRatio / 3)
        + 20 * clamp(reversalVolumeRatio / 3)
        + 15 * clamp(wickPct / 50)
        + 15 * clamp(confirmation.moveFromPivotPct / 8)
        + 15 * clamp(confirmation.confirmVolumeRatio / 2),
        0,
        100,
      ));
      candidates.push({
        side,
        score,
        impulse,
        impulseStart,
        impulseExtreme,
        impulsePct,
        impulseVolumeRatio,
        preImpulseExtensionPct,
        contextExtreme,
        directionalBars,
        reversal,
        retracePct,
        reversalVolumeRatio,
        wickPct,
        recoveryPct,
        distanceFromImpulseExtremePct,
        recoveryTowardExtremePct,
        confirmation,
      });
    }
  }
  return candidates.sort((left, right) => (
    right.confirmation.current.closeTime - left.confirmation.current.closeTime
    || right.reversal.openTime - left.reversal.openTime
    || right.score - left.score
  ))[0] ?? null;
}

export function detectPumpFlushReclaim({
  symbol,
  klines15m = [],
  klines5m = [],
  now = Date.now(),
  config = {},
} = {}) {
  const rule = { ...PUMP_FLUSH_RECLAIM_RULE, ...config };
  const bars15m = normalizeClosed(klines15m, now, 120);
  const bars5m = normalizeClosed(klines5m, now, 180);
  if (!symbol || bars15m.length < rule.minBars15m || bars5m.length < rule.minBars5m
    || now - bars15m.at(-1).closeTime > rule.max15mAgeMs
    || now - bars5m.at(-1).closeTime > rule.maxSignalAgeMs) return [];
  const events = [];
  for (const side of ['LONG', 'SHORT']) {
    const candidate = candidateForSide(bars15m, bars5m, side, now, rule);
    if (!candidate) continue;
    const long = side === 'LONG';
    const label = long
      ? 'PUMP_FLUSH_RECLAIM_15M_LONG_READY'
      : 'DUMP_SQUEEZE_REJECT_15M_SHORT_READY';
    const current = candidate.confirmation.current;
    events.push({
      version: PUMP_FLUSH_RECLAIM_VERSION,
      symbol: String(symbol).trim().toUpperCase(),
      label,
      stage: label,
      side,
      action: side,
      interval: '15m+5m',
      observeOnly: true,
      binanceEligible: false,
      executionEnabled: false,
      score: candidate.score,
      signalPrice: current.close,
      price: current.close,
      signalAt: current.closeTime,
      observedAt: now,
      generatedAt: new Date(now).toISOString(),
      impulseStartAt: candidate.impulse[0].openTime,
      impulseExtremeOpenAt: candidate.impulse.at(-1).openTime,
      impulseEndAt: candidate.impulse.at(-1).closeTime,
      impulseBars: candidate.impulse.length,
      directionalBars: candidate.directionalBars,
      impulseStartPrice: candidate.impulseStart,
      impulseExtremePrice: candidate.impulseExtreme,
      impulsePct: candidate.impulsePct,
      impulseVolumeRatio: candidate.impulseVolumeRatio,
      preImpulseExtensionPct: candidate.preImpulseExtensionPct,
      contextExtremePrice: candidate.contextExtreme,
      reversalAt: candidate.reversal.openTime,
      reversalEndAt: candidate.reversal.closeTime,
      reversalLow: candidate.reversal.low,
      reversalHigh: candidate.reversal.high,
      reversalClose: candidate.reversal.close,
      retracePct: candidate.retracePct,
      reversalVolumeRatio: candidate.reversalVolumeRatio,
      wickPct: candidate.wickPct,
      recoveryPct: candidate.recoveryPct,
      distanceFromImpulseExtremePct: candidate.distanceFromImpulseExtremePct,
      recoveryTowardExtremePct: candidate.recoveryTowardExtremePct,
      pivotPrice: long ? candidate.confirmation.pivot.low : candidate.confirmation.pivot.high,
      reclaimLevel: candidate.confirmation.reclaimLevel,
      ema13: candidate.confirmation.ema13,
      ema25: candidate.confirmation.ema25,
      distanceFromReclaimPct: candidate.confirmation.distanceFromReclaimPct,
      moveFromPivotPct: candidate.confirmation.moveFromPivotPct,
      confirmationVolumeRatio: candidate.confirmation.confirmVolumeRatio,
      takerBuyRatio: candidate.confirmation.takerBuyRatio,
      confirmationBars: candidate.confirmation.confirmationBars,
      dedupeKey: `${String(symbol).trim().toUpperCase()}|${label}`,
    });
  }
  return events.sort((left, right) => right.score - left.score);
}

export function pumpFlushReclaimPayload(event) {
  const long = event.side === 'LONG';
  const symbol = encodeURIComponent(event.symbol);
  const coin = encodeURIComponent(event.symbol.replace(/USDT$/, ''));
  return {
    username: 'Pump Flush Reclaim',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${long ? '🟢' : '🔴'} ${event.symbol} · ${long ? 'PUMP → XẢ SÂU → RECLAIM LONG' : 'DUMP → BẬT MẠNH → REJECT SHORT'}`,
      color: long ? 0x10b981 : 0xef4444,
      description: [
        `**${event.label} · điểm cấu trúc ${event.score}/100**`,
        long
          ? 'Cụm bơm đã xả sâu về vùng nền của nhịp, nến hấp thụ đóng đủ khỏe và 5m lấy lại EMA13/EMA25.'
          : 'Cụm sập đã bật sâu về vùng phân phối, nến từ chối đóng đủ yếu và 5m mất lại EMA13/EMA25.',
        '**OBSERVE ONLY — KHÔNG TỰ ĐẶT LỆNH BINANCE.**',
      ].join('\n'),
      fields: [
        {
          name: long ? '🟩 GIÁ LÚC PHÁT LONG' : '🟥 GIÁ LÚC PHÁT SHORT',
          value: `**\`${number(event.signalPrice)} USDT\`** · giá xác nhận nến đã đóng ${number(event.price)} · cách mốc reclaim/reject ${pct(event.distanceFromReclaimPct)}`,
        },
        {
          name: long ? '🚀 CỤM BƠM 15M' : '🧨 CỤM SẬP 15M',
          value: `${event.impulseBars} nến · ${event.directionalBars} nến đúng hướng · biên ${pct(long ? event.impulsePct : -event.impulsePct)}\nTừ ${number(event.impulseStartPrice)} tới ${number(event.impulseExtremePrice)} · volume cực đại **${event.impulseVolumeRatio.toFixed(2)}×** median\nMức mở nhịp cách ${long ? 'đáy' : 'đỉnh'} nền ${number(event.contextExtremePrice)}: **${pct(long ? event.preImpulseExtensionPct : -event.preImpulseExtensionPct)}**`,
        },
        {
          name: long ? '🧲 XẢ SÂU / HẤP THỤ' : '🧱 BẬT SÂU / PHÂN PHỐI',
          value: `Retrace **${event.retracePct.toFixed(1)}%** · volume nến đảo **${event.reversalVolumeRatio.toFixed(2)}×**\nRâu ${long ? 'dưới' : 'trên'} **${event.wickPct.toFixed(1)}%** · close thoát cực trị **${event.recoveryPct.toFixed(1)}%**\nVùng nến đảo ${number(event.reversalLow)}–${number(event.reversalHigh)}`,
        },
        {
          name: '✅ XÁC NHẬN 5M',
          value: `EMA13 ${number(event.ema13)} · EMA25 ${number(event.ema25)} · mốc ${number(event.reclaimLevel)}\nGiá đi khỏi pivot **${event.moveFromPivotPct.toFixed(2)}%** · volume xác nhận **${event.confirmationVolumeRatio.toFixed(2)}×**${Number.isFinite(event.takerBuyRatio) ? ` · taker-buy ${(event.takerBuyRatio * 100).toFixed(1)}%` : ''}\nCòn cách ${long ? 'đỉnh bơm' : 'đáy sập'} **${event.distanceFromImpulseExtremePct.toFixed(2)}%** · đã hồi lại **${event.recoveryTowardExtremePct.toFixed(1)}%** biên xả/bật`,
        },
        {
          name: long ? '🕒 KHUNG GIỜ BƠM ĐỈNH / GIẢM' : '🕒 KHUNG GIỜ SẬP ĐÁY / BẬT HỒI',
          value: long
            ? [
              `Bơm: **${vn(event.impulseStartAt)} → ${vn(event.impulseEndAt)}**`,
              `Nến chứa đỉnh ${number(event.impulseExtremePrice)}: ${vn(event.impulseExtremeOpenAt)} → ${vn(event.impulseEndAt)}`,
              `Xả/giảm tới ${number(event.reversalLow)}: **${vn(event.impulseEndAt)} → ${vn(event.reversalEndAt)}**`,
              `5m xác nhận hồi: ${vn(event.signalAt)}`,
            ].join('\n')
            : [
              `Sập: **${vn(event.impulseStartAt)} → ${vn(event.impulseEndAt)}**`,
              `Nến chứa đáy ${number(event.impulseExtremePrice)}: ${vn(event.impulseExtremeOpenAt)} → ${vn(event.impulseEndAt)}`,
              `Bật hồi tới ${number(event.reversalHigh)}: **${vn(event.impulseEndAt)} → ${vn(event.reversalEndAt)}**`,
              `5m xác nhận reject: ${vn(event.signalAt)}`,
            ].join('\n'),
        },
        {
          name: 'MỞ BIỂU ĐỒ',
          value: `[Binance](https://www.binance.com/en/futures/${symbol}) · [CoinGlass Model 3](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${coin})`,
        },
      ],
      timestamp: event.generatedAt,
      footer: { text: `${PUMP_FLUSH_RECLAIM_VERSION} · closed 15m structure + closed 5m confirmation` },
    }],
  };
}

export class PumpFlushReclaimDiscordNotifier {
  constructor({
    stateFile,
    webhookUrl = () => '',
    now = () => Date.now(),
    fetchImpl = fetch,
    cooldownMs = 6 * HOUR_MS,
  } = {}) {
    Object.assign(this, { stateFile, webhookUrl, now, fetchImpl, cooldownMs });
    this.queue = Promise.resolve();
    this.memory = null;
    this.retryAfter = 0;
  }

  notify(event) {
    const job = this.queue.catch(() => {}).then(() => this.process(event));
    this.queue = job;
    return job;
  }

  async process(event) {
    const now = this.now();
    if (!event || event.version !== PUMP_FLUSH_RECLAIM_VERSION
      || event.observeOnly !== true || event.binanceEligible !== false
      || !['LONG', 'SHORT'].includes(event.side)
      || !['PUMP_FLUSH_RECLAIM_15M_LONG_READY', 'DUMP_SQUEEZE_REJECT_15M_SHORT_READY']
        .includes(event.label)
      || !Number.isFinite(event.signalAt)
      || now - event.signalAt > PUMP_FLUSH_RECLAIM_RULE.maxSignalAgeMs) {
      return { sent: 0, reason: 'invalid_or_stale' };
    }
    const url = String(typeof this.webhookUrl === 'function'
      ? this.webhookUrl()
      : this.webhookUrl).trim();
    if (!/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(url)) {
      return { sent: 0, reason: 'not_configured' };
    }
    if (now < this.retryAfter) return { sent: 0, reason: 'backoff' };
    if (!this.memory) {
      try {
        this.memory = JSON.parse(await readFile(this.stateFile, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        this.memory = { alerts: {} };
      }
    }
    this.memory.alerts ??= {};
    const key = event.dedupeKey ?? `${event.symbol}|${event.label}`;
    const priorAt = Number(this.memory.alerts[key] ?? 0);
    if (priorAt > 0 && now - priorAt < this.cooldownMs) return { sent: 0, reason: 'deduped' };
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pumpFlushReclaimPayload(event)),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.retryAfter = now + 60_000;
      throw new Error('Pump/flush/reclaim Discord network failure; retry delayed');
    }
    if (!response.ok) {
      const rate = response.status === 429 ? await response.json().catch(() => ({})) : {};
      this.retryAfter = now + Math.max(60_000,
        Math.min(HOUR_MS, finite(rate.retry_after, 0) * 1_000));
      throw new Error(`Pump/flush/reclaim Discord HTTP ${response.status}`);
    }
    this.memory.alerts[key] = now;
    this.memory.version = PUMP_FLUSH_RECLAIM_VERSION;
    this.memory.updatedAt = new Date(now).toISOString();
    this.memory.alerts = Object.fromEntries(Object.entries(this.memory.alerts)
      .filter(([, sentAt]) => now - Number(sentAt) < 7 * 24 * HOUR_MS));
    await mkdir(dirname(this.stateFile), { recursive: true });
    const temporary = `${this.stateFile}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.memory, null, 2)}\n`, 'utf8');
    await rename(temporary, this.stateFile);
    return { sent: 1, reason: 'sent', symbol: event.symbol, side: event.side, label: event.label };
  }
}

export async function scanPumpFlushReclaim(symbols, klineCache, notify, {
  now = Date.now(),
  maxAlerts = 10,
  config = {},
  signalPrices = null,
} = {}) {
  const events = [];
  let processed = 0;
  for (const symbol of [...new Set(Array.isArray(symbols) ? symbols : [])]) {
    const klines15m = klineCache?.getIfCached?.(symbol, '15m', 120);
    const klines5m = klineCache?.getIfCached?.(symbol, '5m', 180);
    if (!Array.isArray(klines15m) || !Array.isArray(klines5m)) continue;
    processed += 1;
    const detected = detectPumpFlushReclaim({ symbol, klines15m, klines5m, now, config });
    for (const event of detected) {
      const key = String(symbol).toUpperCase();
      const snapshotPrice = finite(signalPrices instanceof Map
        ? signalPrices.get(key)
        : signalPrices?.[key]);
      events.push({
        ...event,
        signalPrice: snapshotPrice > 0 ? snapshotPrice : event.signalPrice,
        signalPriceSource: snapshotPrice > 0 ? 'BINANCE_MARKET_SNAPSHOT' : 'CLOSED_5M',
      });
    }
  }
  events.sort((left, right) => right.score - left.score
    || right.signalAt - left.signalAt);
  let sent = 0;
  let failed = 0;
  for (const event of events.slice(0, Math.max(1, maxAlerts))) {
    try {
      sent += Number((await notify(event))?.sent ?? 0);
    } catch {
      failed += 1;
    }
  }
  return { processed, detected: events.length, sent, failed, top: events.slice(0, 10) };
}
