import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.join(rootDir, 'data', 'edge-paper-trades.json');

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

function sourceFamilyOf(trade) {
  const source = String(trade.source ?? '').toLowerCase();
  if (source.startsWith('pump-short-')) return 'PUMP_SHORT';
  if (source.startsWith('cap-')) return 'CAP';
  if (source.startsWith('ppks-')) return 'PPKS';
  if (source.startsWith('spikerev-')) return 'SPIKE_REVERSAL';
  return source.toUpperCase() || 'NO_SOURCE';
}

function typeOf(trade) {
  return String(trade.pumpSignalType ?? trade.type ?? sourceFamilyOf(trade))
    .trim().toUpperCase().replace(/\s+/g, '_');
}

function timeframeOf(trade) {
  return String(trade.pumpSignalTimeframe ?? trade.pumpSignalFactors?.timeframe ?? trade.timeframe ?? '15m').toLowerCase();
}

function scoreOf(trade) {
  const sourceScore = String(trade.source ?? '').match(/-(\d+)(?:-|$)/)?.[1];
  return num(trade.score ?? sourceScore, NaN);
}

function scoreBucketOf(trade) {
  const score = scoreOf(trade);
  if (!Number.isFinite(score)) return 'SCORE_NO_DATA';
  if (score >= 90) return 'SCORE_90_PLUS';
  if (score >= 80) return 'SCORE_80_89';
  if (score >= 70) return 'SCORE_70_79';
  return 'SCORE_LT_70';
}

function volumeBucketOf(trade) {
  const volume = Number(trade.pumpSignalFactors?.volRatio ?? trade.pumpSignalFactors?.vNowX);
  if (!Number.isFinite(volume)) return 'VOL_NO_DATA';
  if (volume >= 5) return 'VOL_5X_PLUS';
  if (volume >= 2) return 'VOL_2_5X';
  return 'VOL_LT_2X';
}

function moveBucketOf(trade) {
  const move = Number(trade.pumpSignalFactors?.movePct);
  if (!Number.isFinite(move)) return 'MOVE_NO_DATA';
  if (move >= 10) return 'MOVE_10_PLUS';
  if (move >= 5) return 'MOVE_5_10';
  if (move >= 2) return 'MOVE_2_5';
  return 'MOVE_LT_2';
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

function gateOf(trade) {
  if (trade.capGateLabel) return String(trade.capGateLabel).toUpperCase();
  const parts = String(trade.pumpCombo ?? '').split('|').map((value) => value.trim()).filter(Boolean);
  return String(parts.find((value) => /^(GATE_|OK_|BLOCK_)/i.test(value)) ?? 'GATE_NO_DATA').toUpperCase();
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
    wins: positive.length,
    losses: negative.length,
    wr: rows.length ? positive.length / rows.length * 100 : 0,
    avgRoe: rows.length ? roes.reduce((sum, value) => sum + value, 0) / rows.length : 0,
    cappedAvgRoe: rows.length ? roes.reduce((sum, value) => sum + Math.max(-30, Math.min(30, value)), 0) / rows.length : 0,
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
    ROE30: `${row.cappedAvgRoe >= 0 ? '+' : ''}${row.cappedAvgRoe.toFixed(2)}%`,
    Median: `${row.medianRoe >= 0 ? '+' : ''}${row.medianRoe.toFixed(2)}%`,
    PF: row.pf.toFixed(2),
    PnL: `${row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(3)}`,
    'TP/SL/TO': `${row.tp}/${row.sl}/${row.timeout}`,
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
  .filter((trade) => trade.status === 'CLOSED' && String(trade.side).toUpperCase() === 'SHORT')
  .filter((trade) => {
    const time = entryMs(trade);
    return Number.isFinite(time) && time >= fromMs && time < toExclusive;
  });

console.log(`Edge SHORT analysis: ${new Date(fromMs).toISOString()} -> ${new Date(toExclusive).toISOString()} (Bangkok ${days} days ending ${toDay})`);
console.table([compact({ name: 'EDGE_SHORT', ...summarize(rows) })]);
print('By Bangkok day', group(rows, dayOf).sort((a, b) => a.name.localeCompare(b.name)));
print('By source family', group(rows, sourceFamilyOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By signal type', group(rows, typeOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By score bucket', group(rows, scoreBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By volume bucket', group(rows, volumeBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By move bucket', group(rows, moveBucketOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By BTC phase', group(rows, btcPhaseOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By correlation', group(rows, relationOf).sort((a, b) => b.avgRoe - a.avgRoe));
print('By candle pattern (min 3)', group(rows, candleOf, 3).sort((a, b) => b.avgRoe - a.avgRoe));
print('By close outcome', group(rows, (trade) => trade.outcome ?? 'NO_OUTCOME').sort((a, b) => b.avgRoe - a.avgRoe));
print('Best Bangkok hours (min 3)', group(rows, hourOf, 3).sort((a, b) => b.avgRoe - a.avgRoe));
print('Worst Bangkok hours (min 3)', group(rows, hourOf, 3).sort((a, b) => a.avgRoe - b.avgRoe));
print('Gate groups (min 3)', group(rows, gateOf, 3).sort((a, b) => b.avgRoe - a.avgRoe), 40);
print('Signal type x BTC phase (min 3)', group(rows, (trade) => `${typeOf(trade)} | ${btcPhaseOf(trade)}`, 3).sort((a, b) => b.avgRoe - a.avgRoe), 40);
print('Signal type x correlation (min 3)', group(rows, (trade) => `${typeOf(trade)} | ${relationOf(trade)}`, 3).sort((a, b) => b.avgRoe - a.avgRoe), 40);
print('Signal type x score (min 3)', group(rows, (trade) => `${typeOf(trade)} | ${scoreBucketOf(trade)}`, 3).sort((a, b) => b.avgRoe - a.avgRoe), 40);
print('Signal type x Bangkok hour (min 3)', group(rows, (trade) => `${typeOf(trade)} | ${hourOf(trade)}`, 3).sort((a, b) => b.avgRoe - a.avgRoe), 40);

const context = (trade) => `${typeOf(trade)} | ${scoreBucketOf(trade)} | ${btcPhaseOf(trade)} | ${relationOf(trade)}`;
print('Best context combos (min 3)', group(rows, context, 3).sort((a, b) => b.avgRoe - a.avgRoe), 30);
print('Worst context combos (min 3)', group(rows, context, 3).sort((a, b) => a.avgRoe - b.avgRoe), 30);

console.log('\nWorst realized Edge SHORT trades');
console.table([...rows].sort((a, b) => num(a.roe) - num(b.roe)).slice(0, 20).map((trade) => ({
  time: new Date(entryMs(trade)).toISOString(),
  symbol: trade.symbol,
  source: sourceFamilyOf(trade),
  type: typeOf(trade),
  score: scoreOf(trade),
  hour: hourOf(trade),
  btc: btcPhaseOf(trade),
  corr: relationOf(trade),
  candle: candleOf(trade),
  roe: `${num(trade.roe).toFixed(1)}%`,
  pnl: num(trade.pnl).toFixed(3),
  outcome: trade.outcome,
})));
