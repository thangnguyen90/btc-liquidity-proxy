import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.join(rootDir, 'data', 'pump-paper-trades.json');

function arg(name, fallback) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const toDay = arg('--to', new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date()));
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

function isNativePump(trade) {
  return /^pump-\d+(?:-|$)/i.test(String(trade.source ?? ''));
}

function typeOf(trade) {
  return String(trade.pumpSignalType ?? trade.type ?? 'PUMP_UNKNOWN').trim().toUpperCase().replace(/\s+/g, '_');
}

function timeframeOf(trade) {
  return String(trade.pumpSignalTimeframe ?? trade.pumpSignalFactors?.timeframe ?? trade.timeframe ?? '15m').toLowerCase();
}

function scoreOf(trade) {
  return num(String(trade.source ?? '').match(/^pump-(\d+)/i)?.[1], NaN);
}

function scoreBucketOf(trade) {
  const score = scoreOf(trade);
  if (!Number.isFinite(score)) return 'SCORE_NO_DATA';
  if (score >= 90) return 'SCORE_90_PLUS';
  if (score >= 80) return 'SCORE_80_89';
  if (score >= 75) return 'SCORE_75_79';
  return 'SCORE_LT_75';
}

function volumeBucketOf(trade) {
  const volume = Number(trade.pumpSignalFactors?.volRatio ?? trade.pumpSignalFactors?.volume ?? trade.pumpSignalFactors?.volNowX);
  if (!Number.isFinite(volume)) return 'VOL_NO_DATA';
  if (volume >= 5) return 'VOL_5X_PLUS';
  if (volume >= 2) return 'VOL_2_5X';
  return 'VOL_LOW';
}

function chaseBucketOf(trade) {
  const chase = Number(trade.pumpSignalFactors?.chasePct);
  if (!Number.isFinite(chase)) return 'CHASE_NO_DATA';
  if (chase >= 0.3) return 'CHASE_MID_PLUS';
  return 'CHASE_OK';
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

function marginBucketOf(trade) {
  const margin = Number(trade.marginUsdt);
  if (!Number.isFinite(margin)) return 'SIZE_NO_DATA';
  if (margin >= 9.5 && margin <= 10.5) return '$10';
  if (margin > 0 && margin <= 1.01) return '$1';
  return `$${margin}`;
}

const bangkokDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
});
const bangkokHourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23',
});

function dayOf(trade) {
  return bangkokDayFmt.format(new Date(entryMs(trade)));
}

function hourOf(trade) {
  return `${bangkokHourFmt.format(new Date(entryMs(trade)))}h`;
}

function summarize(rows) {
  const roes = rows.map((trade) => num(trade.roe));
  const sortedRoes = [...roes].sort((a, b) => a - b);
  const positive = roes.filter((roe) => roe > 0);
  const negative = roes.filter((roe) => roe < 0);
  const grossWin = positive.reduce((sum, roe) => sum + roe, 0);
  const grossLoss = Math.abs(negative.reduce((sum, roe) => sum + roe, 0));
  const dayStats = new Map();
  for (const trade of rows) dayStats.set(dayOf(trade), (dayStats.get(dayOf(trade)) ?? 0) + num(trade.roe));
  return {
    n: rows.length,
    wins: positive.length,
    losses: negative.length,
    wr: rows.length ? positive.length / rows.length * 100 : 0,
    avgRoe: rows.length ? roes.reduce((sum, roe) => sum + roe, 0) / rows.length : 0,
    cappedAvgRoe: rows.length
      ? roes.reduce((sum, roe) => sum + Math.max(-30, Math.min(30, roe)), 0) / rows.length
      : 0,
    medianRoe: sortedRoes.length
      ? sortedRoes.length % 2
        ? sortedRoes[(sortedRoes.length - 1) / 2]
        : (sortedRoes[sortedRoes.length / 2 - 1] + sortedRoes[sortedRoes.length / 2]) / 2
      : 0,
    pnl: rows.reduce((sum, trade) => sum + num(trade.pnl), 0),
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    worstRoe: roes.length ? Math.min(...roes) : 0,
    tp: rows.filter((trade) => String(trade.outcome ?? '').includes('TP')).length,
    sl: rows.filter((trade) => String(trade.outcome ?? '').includes('SL')).length,
    positiveDays: [...dayStats.values()].filter((roe) => roe > 0).length,
    activeDays: dayStats.size,
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
    ROE30: `${row.cappedAvgRoe >= 0 ? '+' : ''}${row.cappedAvgRoe.toFixed(2)}%`,
    Median: `${row.medianRoe >= 0 ? '+' : ''}${row.medianRoe.toFixed(2)}%`,
    PF: row.pf.toFixed(2),
    PnL: `${row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(3)}`,
    'TP/SL': `${row.tp}/${row.sl}`,
    'days+': `${row.positiveDays}/${row.activeDays}`,
    tail: `${row.worstRoe.toFixed(1)}%`,
  };
}

function print(title, rows, limit = 30) {
  console.log(`\n${title}`);
  console.table(rows.slice(0, limit).map(compact));
}

const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
const rows = (Array.isArray(raw) ? raw : raw.trades ?? [])
  .filter((trade) => trade.status === 'CLOSED' && isNativePump(trade))
  .filter((trade) => {
    const time = entryMs(trade);
    return Number.isFinite(time) && time >= fromMs && time < toExclusive;
  });

console.log(`Native Pump analysis: ${new Date(fromMs).toISOString()} -> ${new Date(toExclusive).toISOString()} (Bangkok ${days} days ending ${toDay})`);
console.table([compact({ name: 'TOTAL', ...summarize(rows) })]);
print('By Bangkok day', group(rows, dayOf).sort((a, b) => a.name.localeCompare(b.name)));
print('By side', group(rows, (trade) => trade.side ?? 'NO_SIDE').sort((a, b) => b.avgRoe - a.avgRoe));
print('By signal type', group(rows, typeOf, 5).sort((a, b) => b.avgRoe - a.avgRoe));
print('By timeframe', group(rows, timeframeOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By score bucket', group(rows, scoreBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By volume bucket', group(rows, volumeBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By size', group(rows, marginBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By close outcome', group(rows, (trade) => trade.outcome ?? 'NO_OUTCOME').sort((a, b) => b.avgRoe - a.avgRoe));
print('By BTC phase', group(rows, btcPhaseOf, 8).sort((a, b) => b.avgRoe - a.avgRoe));

console.log('\nWorst realized Pump trades');
console.table([...rows]
  .sort((a, b) => num(a.roe) - num(b.roe))
  .slice(0, 20)
  .map((trade) => ({
    time: new Date(entryMs(trade)).toISOString(),
    symbol: trade.symbol,
    side: trade.side,
    type: typeOf(trade),
    score: scoreOf(trade),
    tf: timeframeOf(trade),
    roe: `${num(trade.roe).toFixed(1)}%`,
    pnl: num(trade.pnl).toFixed(3),
    outcome: trade.outcome,
    margin: trade.marginUsdt,
    leverage: trade.leverage,
    entry: trade.entryPrice,
    exit: trade.exitPrice,
    sl: trade.sl,
  })));

for (const side of ['LONG', 'SHORT']) {
  const sideRows = rows.filter((trade) => trade.side === side);
  console.log(`\n========== PUMP ${side} ==========`);
  console.table([compact({ name: side, ...summarize(sideRows) })]);
  print('Best Bangkok hours (min 8)', group(sideRows, hourOf, 8).sort((a, b) => b.avgRoe - a.avgRoe), 12);
  print('Worst Bangkok hours (min 8)', group(sideRows, hourOf, 8).sort((a, b) => a.avgRoe - b.avgRoe), 12);
  const combo = (trade) => `${typeOf(trade)} | ${timeframeOf(trade)} | ${scoreBucketOf(trade)} | ${btcPhaseOf(trade)} | ${relationOf(trade)}`;
  print('Best context combos (min 8)', group(sideRows, combo, 8).sort((a, b) => b.avgRoe - a.avgRoe), 15);
  print('Worst context combos (min 8)', group(sideRows, combo, 8).sort((a, b) => a.avgRoe - b.avgRoe), 15);
  const signalCombo = (trade) => `${typeOf(trade)} | ${timeframeOf(trade)} | ${scoreBucketOf(trade)} | ${volumeBucketOf(trade)} | ${chaseBucketOf(trade)}`;
  print('Signal-quality combos (min 8)', group(sideRows, signalCombo, 8).sort((a, b) => b.avgRoe - a.avgRoe), 20);
}
