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

const bangkokDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
});
const bangkokHourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23',
});
const toDay = arg('--to', bangkokDayFmt.format(new Date()));
const days = Math.max(1, Number(arg('--days', 7)) || 7);
const toExclusive = Date.parse(`${toDay}T17:00:00.000Z`);
const fromMs = toExclusive - days * 24 * 3600_000;

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function entryMs(trade) {
  return Date.parse(trade.openedAt ?? trade.createdAt ?? '');
}

function dayOf(trade) {
  return bangkokDayFmt.format(new Date(entryMs(trade)));
}

function hourOf(trade) {
  return `${bangkokHourFmt.format(new Date(entryMs(trade)))}h`;
}

function sideOf(trade) {
  return String(trade.side ?? 'NO_SIDE').toUpperCase();
}

function typeOf(trade) {
  return String(trade.signalType ?? 'NO_TYPE').toUpperCase();
}

function timeframeOf(trade) {
  return String(trade.signalTimeframe ?? trade.entryPlan?.timeframe ?? 'NO_DATA').toLowerCase();
}

function scoreBucketOf(trade) {
  const score = Number(trade.signalPoint);
  if (!Number.isFinite(score)) return 'SCORE_NO_DATA';
  if (score >= 90) return 'SCORE_90_PLUS';
  if (score >= 88) return 'SCORE_88_89';
  if (score >= 85) return 'SCORE_85_87';
  if (score >= 80) return 'SCORE_80_84';
  return 'SCORE_LT_80';
}

function feasibilityBucketOf(trade) {
  const score = Number(trade.feasibilityScore);
  if (!Number.isFinite(score)) return 'FEAS_NO_DATA';
  if (score >= 70) return 'FEAS_70_PLUS';
  if (score >= 50) return 'FEAS_50_69';
  if (score >= 30) return 'FEAS_30_49';
  return 'FEAS_LT_30';
}

function leverageBucketOf(trade) {
  const leverage = Number(trade.feasibleLeverage);
  if (!Number.isFinite(leverage)) return 'LEV_NO_DATA';
  if (leverage >= 10) return 'LEV_10_PLUS';
  if (leverage >= 5) return 'LEV_5_9';
  return 'LEV_LT_5';
}

function rrBucketOf(trade) {
  const rr = Number(trade.rr);
  if (!Number.isFinite(rr)) return 'RR_NO_DATA';
  if (rr >= 1) return 'RR_1_PLUS';
  if (rr >= 0.5) return 'RR_0.5_1';
  if (rr >= 0.2) return 'RR_0.2_0.5';
  return 'RR_LT_0.2';
}

function rewardBucketOf(trade) {
  const reward = Math.abs(Number(trade.rewardPct));
  if (!Number.isFinite(reward)) return 'REWARD_NO_DATA';
  if (reward >= 5) return 'REWARD_5_PLUS';
  if (reward >= 2) return 'REWARD_2_5';
  return 'REWARD_LT_2';
}

function riskBucketOf(trade) {
  const risk = Math.abs(Number(trade.riskPct));
  if (!Number.isFinite(risk)) return 'RISK_NO_DATA';
  if (risk >= 20) return 'RISK_20_PLUS';
  if (risk >= 10) return 'RISK_10_20';
  if (risk >= 5) return 'RISK_5_10';
  return 'RISK_LT_5';
}

function sweepBucketOf(trade) {
  const distance = Math.abs(Number(trade.sweepDistancePct));
  if (!Number.isFinite(distance)) return 'SWEEP_NO_DATA';
  if (distance >= 5) return 'SWEEP_5_PLUS';
  if (distance >= 2) return 'SWEEP_2_5';
  if (distance >= 1) return 'SWEEP_1_2';
  return 'SWEEP_LT_1';
}

function oneSidedBucketOf(trade) {
  const pct = Number(trade.entryPlan?.killZoneCluster?.oneSidedPct);
  if (!Number.isFinite(pct)) return 'ONE_SIDE_NO_DATA';
  if (pct >= 90) return 'ONE_SIDE_90_PLUS';
  if (pct >= 75) return 'ONE_SIDE_75_89';
  return 'ONE_SIDE_LT_75';
}

function heavyAlignmentOf(trade) {
  const heavy = String(trade.heavySide ?? '').toUpperCase();
  if (!heavy) return 'HEAVY_NO_DATA';
  const expected = sideOf(trade) === 'LONG' ? 'ABOVE' : 'BELOW';
  return heavy === expected ? 'HEAVY_ALIGNED' : 'HEAVY_COUNTER';
}

function btcPhaseOf(trade) {
  const health = trade.btcHealth ?? {};
  let direction = String(health.btcTrendDir ?? trade.btcTrendDir ?? '').toUpperCase();
  const score = Number(health.btcTrendScore ?? trade.btcTrendScore);
  const pct6h = Number(health.pct6h ?? trade.btcPct6h);
  if (!['UP', 'DOWN', 'FLAT'].includes(direction)) {
    direction = Number.isFinite(pct6h) ? (pct6h > 0.15 ? 'UP' : pct6h < -0.15 ? 'DOWN' : 'FLAT') : 'NO_DATA';
  }
  if (direction === 'NO_DATA') return 'BTC_NO_DATA';
  const strength = !Number.isFinite(score) ? 'NO_SCORE' : score < 45 ? 'WEAK' : score < 65 ? 'MID' : 'STRONG';
  return `BTC_${direction}_${strength}`;
}

function relationOf(trade) {
  const corr = Number(trade.btcCorr);
  if (!Number.isFinite(corr)) return 'NO_DATA';
  if (corr < 0.3) return 'DOC_LAP';
  if (corr < 0.5) return 'THEO_YEU';
  return 'THEO';
}

function candleOf(trade) {
  return String(trade.candlePatternAtEntry?.name ?? 'NO_DATA').toUpperCase();
}

function summarize(rows) {
  const roes = rows.map((trade) => num(trade.roe));
  const sorted = [...roes].sort((a, b) => a - b);
  const positive = roes.filter((value) => value > 0);
  const negative = roes.filter((value) => value < 0);
  const grossWin = positive.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(negative.reduce((sum, value) => sum + value, 0));
  const daysMap = new Map();
  for (const trade of rows) daysMap.set(dayOf(trade), (daysMap.get(dayOf(trade)) ?? 0) + num(trade.roe));
  return {
    n: rows.length,
    wr: rows.length ? positive.length / rows.length * 100 : 0,
    avgRoe: rows.length ? roes.reduce((sum, value) => sum + value, 0) / rows.length : 0,
    cappedAvgRoe: rows.length ? roes.reduce((sum, value) => sum + Math.max(-20, Math.min(20, value)), 0) / rows.length : 0,
    medianRoe: sorted.length
      ? sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : 0,
    pnl: rows.reduce((sum, trade) => sum + num(trade.pnl), 0),
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    worstRoe: roes.length ? Math.min(...roes) : 0,
    bestRoe: roes.length ? Math.max(...roes) : 0,
    tp: rows.filter((trade) => String(trade.outcome ?? '').includes('TP')).length,
    sl: rows.filter((trade) => String(trade.outcome ?? '').includes('SL')).length,
    timeout: rows.filter((trade) => String(trade.outcome ?? '').includes('TIMEOUT')).length,
    positiveDays: [...daysMap.values()].filter((value) => value > 0).length,
    activeDays: daysMap.size,
  };
}

function group(rows, keyFn, min = 1) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  return [...buckets.entries()]
    .map(([name, list]) => ({ name, ...summarize(list) }))
    .filter((row) => row.n >= min);
}

function compact(row) {
  return {
    group: row.name,
    n: row.n,
    WR: `${row.wr.toFixed(1)}%`,
    AvgROE: `${row.avgRoe >= 0 ? '+' : ''}${row.avgRoe.toFixed(2)}%`,
    ROE20: `${row.cappedAvgRoe >= 0 ? '+' : ''}${row.cappedAvgRoe.toFixed(2)}%`,
    Median: `${row.medianRoe >= 0 ? '+' : ''}${row.medianRoe.toFixed(2)}%`,
    PF: row.pf.toFixed(2),
    PnL: `${row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(3)}`,
    'TP/SL/TO': `${row.tp}/${row.sl}/${row.timeout}`,
    'days+': `${row.positiveDays}/${row.activeDays}`,
    tail: `${row.worstRoe.toFixed(1)}%`,
  };
}

function print(title, rows, limit = 40) {
  console.log(`\n${title}`);
  console.table(rows.slice(0, limit).map(compact));
}

const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
const all = Array.isArray(raw) ? raw : raw.trades ?? [];
const rows = all
  .filter((trade) => trade.status === 'CLOSED')
  .filter((trade) => {
    const time = entryMs(trade);
    return Number.isFinite(time) && time >= fromMs && time < toExclusive;
  });

console.log(`Liquid analysis: ${new Date(fromMs).toISOString()} -> ${new Date(toExclusive).toISOString()} (Bangkok ${days} days ending ${toDay})`);
console.log(`Store coverage: ${all.length} rows; selected ${rows.length} closed rows`);
console.table([compact({ name: 'LIQUID', ...summarize(rows) })]);
print('By Bangkok day', group(rows, dayOf).sort((a, b) => a.name.localeCompare(b.name)));
print('By side', group(rows, sideOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By signal generation', group(rows, typeOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('Side x signal generation', group(rows, (trade) => `${sideOf(trade)} | ${typeOf(trade)}`, 3).sort((a, b) => b.avgRoe - a.avgRoe));
print('By score bucket', group(rows, scoreBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('Side x score bucket (min 5)', group(rows, (trade) => `${sideOf(trade)} | ${scoreBucketOf(trade)}`, 5).sort((a, b) => b.avgRoe - a.avgRoe));
print('By feasibility', group(rows, feasibilityBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By feasible leverage', group(rows, leverageBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By RR bucket', group(rows, rrBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By planned reward', group(rows, rewardBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By planned risk', group(rows, riskBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By sweep distance', group(rows, sweepBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By one-sided liquidation', group(rows, oneSidedBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By heavy-side alignment', group(rows, heavyAlignmentOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By BTC phase', group(rows, btcPhaseOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By correlation', group(rows, relationOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By candle pattern (min 5)', group(rows, candleOf, 5).sort((a, b) => b.avgRoe - a.avgRoe));
print('By close outcome', group(rows, (trade) => trade.outcome ?? 'NO_OUTCOME').sort((a, b) => b.avgRoe - a.avgRoe));
print('Best Bangkok hours (min 5)', group(rows, hourOf, 5).sort((a, b) => b.avgRoe - a.avgRoe));
print('Worst Bangkok hours (min 5)', group(rows, hourOf, 5).sort((a, b) => a.avgRoe - b.avgRoe));
print('Side x BTC phase (min 5)', group(rows, (trade) => `${sideOf(trade)} | ${btcPhaseOf(trade)}`, 5).sort((a, b) => b.avgRoe - a.avgRoe));
print('Side x correlation (min 5)', group(rows, (trade) => `${sideOf(trade)} | ${relationOf(trade)}`, 5).sort((a, b) => b.avgRoe - a.avgRoe));
print('Side x Bangkok hour (min 5)', group(rows, (trade) => `${sideOf(trade)} | ${hourOf(trade)}`, 5).sort((a, b) => b.avgRoe - a.avgRoe));

const context = (trade) => `${sideOf(trade)} | ${typeOf(trade)} | ${scoreBucketOf(trade)} | ${btcPhaseOf(trade)} | ${relationOf(trade)}`;
print('Best context combos (min 5)', group(rows, context, 5).sort((a, b) => b.avgRoe - a.avgRoe), 30);
print('Worst context combos (min 5)', group(rows, context, 5).sort((a, b) => a.avgRoe - b.avgRoe), 30);

console.log('\nWorst realized Liquid trades');
console.table([...rows].sort((a, b) => num(a.roe) - num(b.roe)).slice(0, 25).map((trade) => ({
  time: new Date(entryMs(trade)).toISOString(),
  symbol: trade.symbol,
  side: sideOf(trade),
  type: typeOf(trade),
  score: num(trade.signalPoint, NaN),
  hour: hourOf(trade),
  btc: btcPhaseOf(trade),
  corr: relationOf(trade),
  rr: num(trade.rr, NaN).toFixed(2),
  candle: candleOf(trade),
  roe: `${num(trade.roe).toFixed(1)}%`,
  pnl: num(trade.pnl).toFixed(3),
  outcome: trade.outcome,
})));
