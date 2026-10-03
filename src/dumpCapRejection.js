import {
  DUMP_CAP_FRAMES,
  DUMP_CAP_STAGES,
  DUMP_CAP_VERSION,
  dumpCapCardKey,
} from '../public/dump-cap-rejection-model.js';
import { aggregatePumpRows, closedPumpRows } from './pumpBaseRecovery.js';
import { buildDumpResistance } from './dumpCapResistance.js';

export const DUMP_CAP_RULE = Object.freeze({
  baseline: 20,
  lookback: 128,
  maxAfter: 96,
  minRangeAtr: 2.5,
  minFallAtr: 1.8,
  minVolume: 2,
  capToleranceAtr: 0.15,
  minRejectionAtr: 0.5,
});

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};

export function analyzeDumpCap(symbol, raw, interval, now = Date.now()) {
  const duration = DUMP_CAP_FRAMES[interval];
  let rows = closedPumpRows(raw, interval, now).slice(-DUMP_CAP_RULE.lookback);
  if (rows.length < 24) return { reason: 'INSUFFICIENT_DATA', cases: [] };
  let lastGap = -1;
  for (let i = 1; i < rows.length; i++) if (rows[i].openTime - rows[i - 1].openTime !== duration) lastGap = i;
  if (lastGap > 0) rows = rows.slice(lastGap);
  if (rows.length < 24) return { reason: 'DATA_GAP', cases: [] };
  const last = rows.at(-1);
  if (now - last.closeTime > duration + 90000) return { reason: 'STALE_DATA', cases: [] };
  const cases = [];
  for (let i = Math.max(20, rows.length - DUMP_CAP_RULE.maxAfter - 1); i < rows.length - 1; i++) {
    const dump = rows[i];
    const prior = rows.slice(i - 20, i);
    const after = rows.slice(i + 1);
    const span = rows.slice(i - 20);
    if (span.some((row, index) => index && row.openTime - span[index - 1].openTime !== duration)) continue;
    const atr = prior.slice(1).reduce((sum, row, index) => sum + Math.max(
      row.high - row.low,
      Math.abs(row.high - prior[index].close),
      Math.abs(row.low - prior[index].close),
    ), 0) / 19;
    const baseVolume = median(prior.map(row => row.volume));
    if (!(atr > 0 && baseVolume > 0) || dump.close > dump.open
      || (dump.high - dump.low) / atr < DUMP_CAP_RULE.minRangeAtr
      || (dump.open - dump.low) / atr < DUMP_CAP_RULE.minFallAtr
      || dump.volume / baseVolume < DUMP_CAP_RULE.minVolume) continue;
    const retestOffset = after.findIndex(row => row.high >= dump.open - DUMP_CAP_RULE.capToleranceAtr * atr);
    if (retestOffset < 0) continue;
    const retestIndex = i + 1 + retestOffset;
    const retest = after[retestOffset];
    const following = after.slice(retestOffset + 1);
    const peakRows = after.slice(retestOffset);
    const peak = peakRows.reduce((best, row) => row.high > best.high ? row : best, retest);
    const latest3 = rows.slice(-3);
    const volumeIncreasing = latest3.every((row, index) => !index || row.volume > latest3[index - 1].volume);
    const pricesDecreasing = latest3.every((row, index) => !index || row.close < latest3[index - 1].close);
    const threeAfterRetest = latest3[0].openTime > retest.openTime;
    const rejectionAtr = (peak.high - last.close) / atr;
    const belowCap = last.close < dump.open;
    const rejecting = following.length > 0 && rejectionAtr >= DUMP_CAP_RULE.minRejectionAtr
      && last.close < rows.at(-2).close;
    const volumeRatio = last.volume / baseVolume;
    const confirmed = rejecting && belowCap && threeAfterRetest && volumeIncreasing
      && pricesDecreasing && volumeRatio >= 1.2;
    const brokeCap = following.length > 0 && last.close > retest.high + DUMP_CAP_RULE.capToleranceAtr * atr;
    const strengthening = following.length > 1 && last.close > rows.at(-2).close
      && rows.at(-2).close > rows.at(-3).close;
    const stage = brokeCap || strengthening ? 'INVALIDATED'
      : confirmed ? 'VOLUME_REJECTION'
        : rejecting ? 'REJECTING' : 'AT_CAP';
    cases.push({
      id: `${symbol}:${interval}:${dump.openTime}`,
      symbol,
      interval,
      stage,
      version: DUMP_CAP_VERSION,
      dumpAt: dump.closeTime,
      retestAt: retest.closeTime,
      updatedAt: last.closeTime,
      ageBars: after.length,
      dumpOpen: dump.open,
      dumpHigh: dump.high,
      dumpLow: dump.low,
      dumpRangeAtr: (dump.high - dump.low) / atr,
      dumpFallPct: (1 - dump.low / dump.open) * 100,
      dumpVolumeRatio: dump.volume / baseVolume,
      retestHigh: retest.high,
      peakHigh: peak.high,
      sweptAbove: peak.high > dump.open + DUMP_CAP_RULE.capToleranceAtr * atr,
      close: last.close,
      rejectionPct: (1 - last.close / peak.high) * 100,
      retracePct: (peak.high - dump.low) / (dump.open - dump.low) * 100,
      volumeRatio,
      volumeSequence: latest3.map(row => row.volume),
      volumeIncreasing,
      pricesDecreasing,
      atr,
      reason: brokeCap ? 'Đóng vượt đỉnh nến hồi +0,15 ATR'
        : strengthening ? 'Hai nến đóng tăng liên tiếp'
          : confirmed ? '3 nến giảm đóng thấp dần và tăng volume; rơi lại dưới đỉnh nến xả'
            : !following.length ? 'Chờ nến từ chối sau lần hồi về đỉnh'
              : !belowCap ? 'Chưa rơi lại dưới đỉnh nến xả'
                : !threeAfterRetest ? 'Chưa có 3 nến sau hồi đỉnh'
                  : !volumeIncreasing ? 'Volume chưa tăng đều 3 nến'
                    : !pricesDecreasing ? 'Giá đóng chưa giảm đều 3 nến'
                      : volumeRatio < 1.2 ? 'Volume cuối chưa đạt 1,2× nền trước xả'
                        : 'Chưa bị từ chối đủ 0,5 ATR',
      resistance: buildDumpResistance(rows, { dumpIndex: i, retestIndex, atr, duration }),
      watchOnly: true,
      binanceEligible: false,
    });
  }
  return { reason: cases.length ? null : 'NO_PATTERN', cases };
}

export class DumpCapScanner {
  constructor({ getSymbols, getRows, now = Date.now }) {
    Object.assign(this, { getSymbols, getRows, now });
    this.cache = new Map();
    this.pending = new Map();
  }

  rows(symbol, interval, now) {
    const direct = this.getRows(symbol, interval, 500) ?? [];
    const smaller = { '15m': '5m', '1h': '15m', '4h': '1h', '1d': '4h' }[interval];
    const derived = smaller
      ? aggregatePumpRows(this.getRows(symbol, smaller, 500), smaller, interval, now)
      : [];
    return closedPumpRows([...derived, ...direct], interval, now);
  }

  async snapshot(interval) {
    if (!Object.hasOwn(DUMP_CAP_FRAMES, interval)) throw new Error('Unsupported timeframe');
    const saved = this.cache.get(interval);
    if (saved && this.now() - saved.generatedAt < 30000) return saved;
    if (this.pending.has(interval)) return this.pending.get(interval);
    const task = this.scan(interval).finally(() => this.pending.delete(interval));
    this.pending.set(interval, task);
    return task;
  }

  async scan(interval) {
    const generatedAt = this.now();
    const symbols = [...new Set(this.getSymbols())];
    const excluded = { INSUFFICIENT_DATA: 0, DATA_GAP: 0, STALE_DATA: 0, NO_PATTERN: 0 };
    const records = [];
    let covered = 0;
    for (let i = 0; i < symbols.length; i++) {
      const result = analyzeDumpCap(symbols[i], this.rows(symbols[i], interval, generatedAt), interval, generatedAt);
      if (result.reason) excluded[result.reason] += 1;
      if (!['INSUFFICIENT_DATA', 'DATA_GAP', 'STALE_DATA'].includes(result.reason)) covered += 1;
      records.push(...result.cases);
      if (i % 8 === 7) await new Promise(resolve => setImmediate(resolve));
    }
    records.sort((a, b) => b.updatedAt - a.updatedAt || b.dumpAt - a.dumpAt || a.symbol.localeCompare(b.symbol));
    const counts = Object.fromEntries(Object.keys(DUMP_CAP_STAGES)
      .map(stage => [stage, records.filter(record => record.stage === stage).length]));
    const snapshot = {
      version: DUMP_CAP_VERSION,
      generatedAt,
      interval,
      totalSymbols: symbols.length,
      covered,
      excluded,
      totalCases: records.length,
      uniqueCoins: new Set(records.map(record => record.symbol)).size,
      counts,
      records,
      groups: Object.keys(DUMP_CAP_STAGES).map(stage => ({
        stage,
        key: dumpCapCardKey(interval, stage),
        closedCount: 0,
        avgRoe: null,
      })),
      watchOnly: true,
      binanceEligible: false,
    };
    this.cache.set(interval, snapshot);
    return snapshot;
  }
}
