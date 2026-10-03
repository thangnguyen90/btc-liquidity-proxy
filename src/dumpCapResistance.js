import { DUMP_RESISTANCE_VERSION, resistanceNetRR } from '../public/dump-resistance-model.js';

function levelsBefore(rows, end, dumpIndex, retestIndex, atr) {
  const levels = [{ type: 'CAP', level: rows[dumpIndex].open, formedAt: rows[dumpIndex].closeTime }];
  for (let i = retestIndex + 2; i <= end - 2; i++) {
    if ([i - 2, i - 1, i + 1, i + 2].every(j => rows[i].high > rows[j].high)) {
      levels.push({ type: 'SWING_HIGH', level: rows[i].high, formedAt: rows[i + 2].closeTime });
    }
  }
  for (let i = Math.max(retestIndex + 3, end - 24); i <= end; i++) {
    const base = rows.slice(i - 3, i);
    const high = Math.max(...base.map(row => row.high));
    const low = Math.min(...base.map(row => row.low));
    if (high - low <= 1.5 * atr && rows[i].close < low && rows[i].close < rows[i].open) {
      levels.push({ type: 'BASE_BREAK', level: low, formedAt: rows[i].closeTime });
    }
  }
  return levels.map(level => ({
    ...level,
    zoneLow: level.level - 0.15 * atr,
    zoneHigh: level.level + 0.15 * atr,
  }));
}

function nearestSupport(rows, end, dumpIndex, entry) {
  const levels = [rows[dumpIndex].low];
  // Every pivot uses two already-closed candles to its right before the entry candle.
  for (let i = Math.max(2, dumpIndex - 20); i <= end - 2; i++) {
    if ([i - 2, i - 1, i + 1, i + 2].every(j => rows[i].low < rows[j].low)) levels.push(rows[i].low);
  }
  return levels.filter(price => price < entry).sort((a, b) => b - a)[0] ?? null;
}

export function buildDumpResistance(rows, { dumpIndex, retestIndex, atr, duration }) {
  const last = rows.at(-1);
  const common = {
    version: DUMP_RESISTANCE_VERSION,
    watchOnly: true,
    binanceEligible: false,
    atr,
    expiresAt: last.closeTime + duration + 90000,
  };
  if (!(atr > 0) || rows.length < 3 || retestIndex >= rows.length - 1) {
    return { ...common, status: 'WAIT_CONFIRM' };
  }
  const plans = [];
  // Only the latest three closed confirmation candles can remain live.
  for (let ci = Math.max(retestIndex + 2, rows.length - 3); ci < rows.length; ci++) {
    const rejectionIndex = ci - 1;
    const rejection = rows[rejectionIndex];
    const confirm = rows[ci];
    const downVolumes = rows.slice(Math.max(retestIndex, rejectionIndex - 6), rejectionIndex)
      .filter(row => row.close < row.open)
      .map(row => row.volume);
    if (!downVolumes.length || rejection.volume > 0.8 * Math.max(...downVolumes)
      || !(confirm.volume > rejection.volume)
      || !(confirm.close < rejection.low && confirm.close < confirm.open)) continue;
    for (const level of levelsBefore(rows, rejectionIndex - 1, dumpIndex, retestIndex, atr)) {
      const upperWick = rejection.high - Math.max(rejection.open, rejection.close);
      if (level.formedAt >= rejection.openTime || rejection.high < level.zoneLow
        || rejection.low > level.zoneHigh || !(rejection.close < level.zoneLow)
        || upperWick < 0.25 * (rejection.high - rejection.low)) continue;
      const previouslyRejected = rows.slice(retestIndex, rejectionIndex)
        .some(row => row.closeTime >= level.formedAt && row.close < level.zoneLow);
      if (!previouslyRejected) continue;
      const stop = Math.max(level.zoneHigh, rejection.high) + 0.1 * atr;
      const entry = confirm.close;
      const target = nearestSupport(rows, ci - 1, dumpIndex, entry);
      const rr = resistanceNetRR(entry, stop, target);
      const rrFloor = target > 0 ? (target + 1.5 * stop) / (2.5 * 0.9988) : null;
      const entryLow = Math.max(entry - 0.35 * atr, level.zoneLow - atr, rrFloor ?? entry);
      const entryHigh = Math.min(rejection.low, level.zoneLow, entry + 0.25 * atr);
      const broken = rows.slice(ci).some(row => row.high >= stop);
      const status = broken ? 'BROKEN'
        : !(rr >= 1.5) ? 'NO_ROOM'
          : entry < entryLow || entryLow > entryHigh ? 'WAIT_RETEST'
            : 'WAIT_LIVE';
      plans.push({
        ...common,
        ...level,
        status,
        entry,
        entryLow,
        entryHigh,
        stop,
        target,
        rr,
        confirmedAt: confirm.closeTime,
        rejectionAt: rejection.closeTime,
        expiresAt: Math.min(common.expiresAt, confirm.closeTime + 3 * duration),
        pullbackVolumeRatio: rejection.volume / Math.max(...downVolumes),
        confirmationVolumeRatio: confirm.volume / rejection.volume,
      });
    }
  }
  if (plans.length) {
    const latestAt = Math.max(...plans.map(plan => plan.confirmedAt));
    return plans.filter(plan => plan.confirmedAt === latestAt)
      .sort((a, b) => (a.status === 'WAIT_LIVE' ? 0 : 1) - (b.status === 'WAIT_LIVE' ? 0 : 1)
        || a.zoneLow - b.zoneLow)[0];
  }
  const candidates = levelsBefore(rows, rows.length - 2, dumpIndex, retestIndex, atr);
  const held = candidates.filter(level => rows.slice(retestIndex, -1)
    .some(row => row.closeTime >= level.formedAt && row.close < level.zoneLow));
  const level = held.sort((a, b) => Math.abs(last.close - a.level) - Math.abs(last.close - b.level))[0];
  if (!level) return { ...common, status: 'NO_RESISTANCE' };
  const stop = level.zoneHigh + 0.1 * atr;
  return {
    ...common,
    ...level,
    stop,
    status: last.close >= stop ? 'BROKEN' : level.zoneLow - last.close > atr ? 'WAIT_RETEST' : 'WAIT_CONFIRM',
  };
}
