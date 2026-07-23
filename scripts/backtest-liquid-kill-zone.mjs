import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.join(rootDir, 'data', 'liquid-paper-trades.json');

function arg(name, fallback) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function num(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
});
const hourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23',
});
const toDay = arg('--to', dayFmt.format(new Date()));
const days = Math.max(1, num(arg('--days', 7), 7));
const feeRate = Math.max(0, num(arg('--fee-rate', 0.0004), 0.0004));
const toExclusive = Date.parse(`${toDay}T17:00:00.000Z`);
const fromMs = toExclusive - days * 24 * 3600_000;

function entryMs(t) {
  return Date.parse(t.openedAt ?? t.createdAt ?? '');
}

function sideOf(t) {
  return String(t.side ?? '').toUpperCase();
}

function zoneRange(zone) {
  if (!zone || typeof zone !== 'object') return null;
  const low = num(zone.low ?? zone.price);
  const high = num(zone.high ?? zone.price);
  if (!(low > 0) || !(high > 0)) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function contains(zone, price) {
  const range = zoneRange(zone);
  return range && price > 0 && price >= range.low * 0.9995 && price <= range.high * 1.0005;
}

function clusterOf(t) {
  return t.entryPlan?.killZoneCluster ?? {};
}

function targetKindOf(t) {
  const cluster = clusterOf(t);
  const target = num(t.sweepTargetPrice ?? t.takeProfitPrice ?? t.entryPlan?.targetPrice);
  if (contains(cluster.mainKillZone, target)) return 'TARGET_MAIN_ZONE';
  if (contains(cluster.exhaustionZone, target)) return 'TARGET_EXHAUSTION';
  if (contains(cluster.farKillZone, target)) return 'TARGET_FAR_ZONE';
  const near = num(cluster.nearSweep?.price ?? cluster.nearSweep?.targetPrice);
  if (target > 0 && near > 0 && Math.abs(target / near - 1) <= 0.001) return 'TARGET_NEAR_SWEEP';
  return 'TARGET_LOCAL_SWEEP';
}

function geometryOf(t) {
  const cluster = clusterOf(t);
  const main = Boolean(zoneRange(cluster.mainKillZone));
  const far = Boolean(zoneRange(cluster.farKillZone));
  const exhaustion = Boolean(zoneRange(cluster.exhaustionZone));
  return [main ? 'MAIN' : null, exhaustion ? 'EXHAUST' : null, far ? 'FAR' : null].filter(Boolean).join('+') || 'ZONE_NO_RANGE';
}

function distanceBucketOf(t) {
  const distance = Math.abs(num(t.sweepDistancePct, 0));
  if (distance >= 10) return 'DIST_10_PLUS';
  if (distance >= 5) return 'DIST_5_10';
  if (distance >= 2) return 'DIST_2_5';
  if (distance >= 1) return 'DIST_1_2';
  return 'DIST_LT_1';
}

function oneSidedBucketOf(t) {
  const value = num(clusterOf(t).oneSidedPct);
  if (value == null) return 'ONE_SIDE_NO_DATA';
  if (value >= 90) return 'ONE_SIDE_90_PLUS';
  if (value >= 75) return 'ONE_SIDE_75_89';
  if (value >= 50) return 'ONE_SIDE_50_74';
  return 'ONE_SIDE_LT_50';
}

function zonePeakConcentration(t) {
  const cluster = clusterOf(t);
  const zones = [cluster.mainKillZone, cluster.exhaustionZone, cluster.farKillZone].filter(Boolean);
  let best = null;
  for (const zone of zones) {
    const total = num(zone.score);
    const top = Math.max(0, ...(zone.peaks ?? []).map((peak) => num(peak.score, 0)));
    if (total > 0 && top >= 0) best = Math.max(best ?? 0, top / total);
  }
  if (best == null) return 'PEAK_NO_DATA';
  if (best >= 0.5) return 'PEAK_50_PLUS';
  if (best >= 0.25) return 'PEAK_25_49';
  if (best >= 0.1) return 'PEAK_10_24';
  return 'PEAK_LT_10';
}

function heavyAlignmentOf(t) {
  const heavy = String(t.heavySide ?? '').toUpperCase();
  const expected = sideOf(t) === 'LONG' ? 'ABOVE' : 'BELOW';
  if (!heavy) return 'HEAVY_NO_DATA';
  return heavy === expected ? 'HEAVY_ALIGNED' : 'HEAVY_COUNTER';
}

function corrBucketOf(t) {
  const corr = num(t.btcCorr);
  if (corr == null) return 'CORR_NO_DATA';
  if (corr >= 0.5) return 'CORR_THEO';
  if (corr >= 0.3) return 'CORR_YEU';
  return 'CORR_RAC';
}

function btcPhaseOf(t) {
  const health = t.btcHealth ?? {};
  const dir = String(health.btcTrendDir ?? t.btcTrendDir ?? '').toUpperCase();
  const score = num(health.btcTrendScore ?? t.btcTrendScore);
  if (!dir) return 'BTC_NO_DATA';
  return `BTC_${dir}_${score == null ? 'NO_SCORE' : score < 45 ? 'WEAK' : score < 65 ? 'MID' : 'STRONG'}`;
}

function hourBucketOf(t) {
  const hour = Number(hourFmt.format(new Date(entryMs(t))));
  if (hour < 6) return 'ICT_00_05';
  if (hour < 12) return 'ICT_06_11';
  if (hour < 18) return 'ICT_12_17';
  return 'ICT_18_23';
}

function scoreBucketOf(t) {
  const score = num(t.signalPoint);
  if (score == null) return 'SCORE_NO_DATA';
  if (score >= 90) return 'SCORE_90_PLUS';
  if (score >= 80) return 'SCORE_80_89';
  if (score >= 70) return 'SCORE_70_79';
  if (score >= 60) return 'SCORE_60_69';
  return 'SCORE_LT_60';
}

function feasibilityBucketOf(t) {
  const score = num(t.feasibilityScore);
  if (score == null) return 'FEAS_NO_DATA';
  if (score >= 70) return 'FEAS_70_PLUS';
  if (score >= 50) return 'FEAS_50_69';
  if (score >= 30) return 'FEAS_30_49';
  return 'FEAS_LT_30';
}

function rrBucketOf(t) {
  const rr = num(t.rr);
  if (rr == null) return 'RR_NO_DATA';
  if (rr >= 1) return 'RR_1_PLUS';
  if (rr >= 0.5) return 'RR_0.5_1';
  if (rr >= 0.2) return 'RR_0.2_0.5';
  return 'RR_LT_0.2';
}

function candleOf(t, key) {
  const value = t[key];
  return String(value?.name ?? value ?? 'NO_DATA').trim().toUpperCase().replace(/\s+/g, '_');
}

function financialOf(t) {
  const entry = num(t.entryPrice);
  const exit = num(t.exitPrice);
  const qty = num(t.quantity);
  const margin = num(t.marginUsdt);
  const actualLeverage = num(t.leverage, 1);
  const feasibleLeverage = Math.max(1, Math.min(125, num(t.feasibleLeverage, actualLeverage)));
  const mult = sideOf(t) === 'LONG' ? 1 : -1;
  const gross = entry > 0 && exit > 0 && qty > 0
    ? (exit - entry) * qty * mult
    : num(t.grossPnl ?? t.pnl, 0);
  const fee = entry > 0 && exit > 0 && qty > 0
    ? (entry * qty + exit * qty) * feeRate
    : num(t.estimatedFeeUsdt ?? t.feeUsdt, 0);
  const net = gross - fee;
  const netRoe = margin > 0 ? net / margin * 100 : 0;
  const underlyingReturn = entry > 0 && exit > 0 ? ((exit - entry) / entry) * mult : 0;
  const feasibleGross = underlyingReturn * feasibleLeverage;
  const exitNotional = feasibleLeverage * (exit / entry);
  const feasibleFee = entry > 0 && exit > 0 ? (feasibleLeverage + exitNotional) * feeRate : 0;
  const feasibleNet = feasibleGross - feasibleFee;
  return { gross, fee, net, netRoe, feasibleLeverage, feasibleNet, feasibleRoe: feasibleNet * 100 };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
}

function summarize(rows, metric = 'actual') {
  const values = rows.map((row) => metric === 'feasible' ? row.fin.feasibleNet : row.fin.net);
  const roes = rows.map((row) => metric === 'feasible' ? row.fin.feasibleRoe : row.fin.netRoe);
  const positive = values.filter((value) => value > 0);
  const negative = values.filter((value) => value < 0);
  const grossWin = positive.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(negative.reduce((sum, value) => sum + value, 0));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const dayPnl = new Map();
  for (let i = 0; i < rows.length; i++) {
    equity += values[i];
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    const day = dayFmt.format(new Date(entryMs(rows[i].trade)));
    dayPnl.set(day, (dayPnl.get(day) ?? 0) + values[i]);
  }
  return {
    n: rows.length,
    wr: rows.length ? positive.length / rows.length * 100 : 0,
    pnl: values.reduce((sum, value) => sum + value, 0),
    avg: rows.length ? values.reduce((sum, value) => sum + value, 0) / rows.length : 0,
    avgRoe: rows.length ? roes.reduce((sum, value) => sum + value, 0) / rows.length : 0,
    medianRoe: percentile(roes, 0.5),
    p10Roe: percentile(roes, 0.1),
    p90Roe: percentile(roes, 0.9),
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    maxDrawdown,
    positiveDays: [...dayPnl.values()].filter((value) => value > 0).length,
    activeDays: dayPnl.size,
  };
}

function group(rows, keyFn, min = 1, metric = 'actual') {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row.trade);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, ...summarize(list, metric) }))
    .filter((row) => row.n >= min);
}

function compact(row) {
  return {
    group: row.name,
    N: row.n,
    WR: `${row.wr.toFixed(1)}%`,
    Net: `${row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(3)}`,
    AvgNet: `${row.avg >= 0 ? '+' : ''}${row.avg.toFixed(4)}`,
    AvgROE: `${row.avgRoe >= 0 ? '+' : ''}${row.avgRoe.toFixed(2)}%`,
    Median: `${row.medianRoe >= 0 ? '+' : ''}${row.medianRoe.toFixed(2)}%`,
    PF: row.pf.toFixed(2),
    MaxDD: row.maxDrawdown.toFixed(3),
    'days+': `${row.positiveDays}/${row.activeDays}`,
  };
}

function print(title, rows, limit = 30) {
  console.log(`\n${title}`);
  console.table(rows.slice(0, limit).map(compact));
}

const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
const all = Array.isArray(raw) ? raw : raw.trades ?? [];
const rows = all
  .filter((t) => t.status === 'CLOSED' && String(t.signalType ?? '').toUpperCase() === 'LIQUID_KILL_ZONE')
  .filter((t) => {
    const time = entryMs(t);
    return Number.isFinite(time) && time >= fromMs && time < toExclusive;
  })
  .sort((a, b) => entryMs(a) - entryMs(b))
  .map((trade) => ({ trade, fin: financialOf(trade) }));

console.log(`Kill Zone event backtest: ${new Date(fromMs).toISOString()} -> ${new Date(toExclusive).toISOString()}`);
console.log(`Selected ${rows.length} closed signals from ${all.length} stored rows; fee=${(feeRate * 100).toFixed(4)}% per side.`);
print('Overall actual paper sizing', [{ name: 'ALL_KILL_ZONE', ...summarize(rows) }]);
print('Counterfactual: $1 margin x feasible leverage, same exits', [{ name: 'ALL_FEASIBLE_LEV', ...summarize(rows, 'feasible') }]);

const dimensions = [
  ['Target kind', targetKindOf],
  ['Zone geometry', geometryOf],
  ['Sweep distance', distanceBucketOf],
  ['One-sided liquidation', oneSidedBucketOf],
  ['Peak concentration', zonePeakConcentration],
  ['Heavy-side alignment', heavyAlignmentOf],
  ['Side x sweep distance', (t) => `${sideOf(t)} | ${distanceBucketOf(t)}`],
  ['Side x target kind', (t) => `${sideOf(t)} | ${targetKindOf(t)}`],
  ['Side x BTC phase', (t) => `${sideOf(t)} | ${btcPhaseOf(t)}`],
  ['Side x correlation', (t) => `${sideOf(t)} | ${corrBucketOf(t)}`],
  ['Side x ICT session', (t) => `${sideOf(t)} | ${hourBucketOf(t)}`],
];

for (const [title, keyFn] of dimensions) {
  print(title, group(rows, keyFn, 5).sort((a, b) => b.avg - a.avg));
}

const shortCorrTheo = rows.filter(({ trade }) => sideOf(trade) === 'SHORT' && corrBucketOf(trade) === 'CORR_THEO');
print('SHORT + BTC correlation >= 0.5: actual sizing', [{ name: 'SHORT_CORR_THEO', ...summarize(shortCorrTheo) }]);
print('SHORT + BTC correlation >= 0.5: $1 x feasible leverage', [{ name: 'SHORT_CORR_THEO_FEASIBLE', ...summarize(shortCorrTheo, 'feasible') }]);
for (const [title, keyFn] of [
  ['Stage-2 by sweep distance', distanceBucketOf],
  ['Stage-2 by target kind', targetKindOf],
  ['Stage-2 by BTC phase', btcPhaseOf],
  ['Stage-2 by ICT session', hourBucketOf],
  ['Stage-2 by signal score', scoreBucketOf],
  ['Stage-2 by feasibility', feasibilityBucketOf],
  ['Stage-2 by RR', rrBucketOf],
  ['Stage-2 by one-sided liquidation', oneSidedBucketOf],
  ['Stage-2 by peak concentration', zonePeakConcentration],
  ['Stage-2 by symbol candle', (t) => candleOf(t, 'candlePatternAtEntry')],
  ['Stage-2 by BTC candle', (t) => candleOf(t, 'btcCandlePatternAtEntry')],
]) {
  print(title, group(shortCorrTheo, keyFn, 5).sort((a, b) => b.avg - a.avg));
}

const splitAt = Math.floor(rows.length * 0.7);
const train = rows.slice(0, splitAt);
const test = rows.slice(splitAt);
const candidateFns = [
  ['SIDE_DIST', (t) => `${sideOf(t)} | ${distanceBucketOf(t)}`],
  ['SIDE_TARGET', (t) => `${sideOf(t)} | ${targetKindOf(t)}`],
  ['SIDE_GEOMETRY', (t) => `${sideOf(t)} | ${geometryOf(t)}`],
  ['SIDE_CORR', (t) => `${sideOf(t)} | ${corrBucketOf(t)}`],
  ['SIDE_BTC', (t) => `${sideOf(t)} | ${btcPhaseOf(t)}`],
  ['SIDE_SESSION', (t) => `${sideOf(t)} | ${hourBucketOf(t)}`],
  ['SIDE_DIST_CORR', (t) => `${sideOf(t)} | ${distanceBucketOf(t)} | ${corrBucketOf(t)}`],
  ['SIDE_DIST_BTC', (t) => `${sideOf(t)} | ${distanceBucketOf(t)} | ${btcPhaseOf(t)}`],
];

const validation = [];
for (const [family, keyFn] of candidateFns) {
  const trainGroups = new Map(group(train, keyFn, 20).map((row) => [row.name, row]));
  const testGroups = new Map(group(test, keyFn, 10).map((row) => [row.name, row]));
  for (const [name, trainRow] of trainGroups) {
    const testRow = testGroups.get(name);
    if (!testRow) continue;
    validation.push({
      family,
      name,
      train: trainRow,
      test: testRow,
      stable: trainRow.avg > 0 && testRow.avg > 0 && trainRow.pf > 1 && testRow.pf > 1,
    });
  }
}

console.log(`\nChronological validation: train ${train.length} oldest / test ${test.length} newest.`);
console.log('\nStable positive groups (positive average and PF > 1 in both train/test)');
console.table(validation
  .filter((row) => row.stable)
  .sort((a, b) => b.test.avg - a.test.avg)
  .slice(0, 30)
  .map((row) => ({
    family: row.family,
    group: row.name,
    trainN: row.train.n,
    trainNet: row.train.pnl.toFixed(3),
    trainPF: row.train.pf.toFixed(2),
    testN: row.test.n,
    testNet: row.test.pnl.toFixed(3),
    testPF: row.test.pf.toFixed(2),
    testAvgROE: `${row.test.avgRoe.toFixed(2)}%`,
  })));

console.log('\nLargest train-positive groups that failed on newest 30%');
console.table(validation
  .filter((row) => row.train.avg > 0 && row.train.pf > 1 && !row.stable)
  .sort((a, b) => a.test.avg - b.test.avg)
  .slice(0, 20)
  .map((row) => ({
    family: row.family,
    group: row.name,
    trainN: row.train.n,
    trainNet: row.train.pnl.toFixed(3),
    testN: row.test.n,
    testNet: row.test.pnl.toFixed(3),
    testPF: row.test.pf.toFixed(2),
    testAvgROE: `${row.test.avgRoe.toFixed(2)}%`,
  })));
