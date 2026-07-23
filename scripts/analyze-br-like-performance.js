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
// 17:00 UTC của ngày được chọn là 00:00 ngày kế tiếp tại Bangkok.
const toExclusive = Date.parse(`${toDay}T17:00:00.000Z`);
const fromMs = toExclusive - days * 24 * 3600_000;

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stageOf(trade) {
  const source = String(trade.source ?? '').toLowerCase();
  const note = String(trade.note ?? '').toLowerCase();
  if (source.includes('br_like_short') || note.includes('brlikeshort=y')) return 'BR-like Short';
  if (source.includes('br_like') || note.includes('brlike=y')) return 'BR-like';
  return null;
}

function entryMs(trade) {
  return Date.parse(trade.openedAt ?? trade.createdAt ?? '');
}

function timeframeOf(trade) {
  return String(trade.source ?? '').match(/^emasq-(\d+[mh])-/i)?.[1]?.toLowerCase()
    ?? String(trade.pumpSignalTimeframe ?? trade.timeframe ?? '-').toLowerCase();
}

function btcPhaseOf(trade) {
  const health = trade.btcHealth ?? {};
  let direction = String(health.btcTrendDir ?? trade.btcTrendDir ?? '').toUpperCase();
  const trendScore = Number(health.btcTrendScore ?? trade.btcTrendScore);
  const pct6h = Number(health.pct6h ?? trade.btcPct6h);
  if (!['UP', 'DOWN', 'FLAT'].includes(direction)) {
    direction = Number.isFinite(pct6h) ? (pct6h > 0.15 ? 'UP' : pct6h < -0.15 ? 'DOWN' : 'FLAT') : 'NO_DATA';
  }
  if (direction === 'NO_DATA') return 'BTC_NO_DATA';
  const strength = !Number.isFinite(trendScore) ? 'NO_SCORE' : trendScore < 45 ? 'WEAK' : trendScore < 65 ? 'MID' : 'STRONG';
  return `BTC_${direction}_${strength}`;
}

function relationOf(trade) {
  const corr = Number(trade.btcCorr);
  if (!Number.isFinite(corr)) return 'NO_DATA';
  if (corr < 0.3) return 'DOC_LAP';
  if (corr < 0.5) return 'THEO_YEU';
  return 'THEO';
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

function candleOf(trade) {
  return String(trade.brRealCandleFit
    ?? trade.pythonCandleRisk
    ?? trade.candlePatternAtEntry?.name
    ?? trade.candlePatternName
    ?? 'NO_DATA').toUpperCase();
}

function summarize(rows) {
  const roes = rows.map((trade) => num(trade.roe));
  const positive = roes.filter((roe) => roe > 0);
  const negative = roes.filter((roe) => roe < 0);
  const grossWin = positive.reduce((sum, roe) => sum + roe, 0);
  const grossLoss = Math.abs(negative.reduce((sum, roe) => sum + roe, 0));
  const pnl = rows.reduce((sum, trade) => sum + num(trade.pnl), 0);
  const dayStats = new Map();
  for (const trade of rows) dayStats.set(dayOf(trade), (dayStats.get(dayOf(trade)) ?? 0) + num(trade.roe));
  return {
    n: rows.length,
    wins: positive.length,
    losses: negative.length,
    wr: rows.length ? positive.length / rows.length * 100 : 0,
    avgRoe: rows.length ? roes.reduce((sum, roe) => sum + roe, 0) / rows.length : 0,
    pnl,
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    avgWin: positive.length ? grossWin / positive.length : 0,
    avgLoss: negative.length ? -grossLoss / negative.length : 0,
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
const trades = (Array.isArray(raw) ? raw : raw.trades ?? [])
  .filter((trade) => trade.status === 'CLOSED')
  .filter((trade) => stageOf(trade))
  .filter((trade) => {
    const time = entryMs(trade);
    return Number.isFinite(time) && time >= fromMs && time < toExclusive;
  });

console.log(`BR-like analysis: ${new Date(fromMs).toISOString()} -> ${new Date(toExclusive).toISOString()} (Bangkok ${days} days ending ${toDay})`);

for (const stage of ['BR-like', 'BR-like Short']) {
  const rows = trades.filter((trade) => stageOf(trade) === stage);
  console.log(`\n========== ${stage.toUpperCase()} ==========`);
  console.table([compact({ name: 'TOTAL', ...summarize(rows) })]);
  print('By Bangkok day', group(rows, dayOf).sort((a, b) => a.name.localeCompare(b.name)));
  print('By BTC phase', group(rows, btcPhaseOf, 8).sort((a, b) => b.avgRoe - a.avgRoe));
  print('By timeframe', group(rows, timeframeOf).sort((a, b) => b.avgRoe - a.avgRoe));
  print('Best Bangkok hours (min 8)', group(rows, hourOf, 8).sort((a, b) => b.avgRoe - a.avgRoe), 12);
  print('Worst Bangkok hours (min 8)', group(rows, hourOf, 8).sort((a, b) => a.avgRoe - b.avgRoe), 12);
  const combo = (trade) => `${timeframeOf(trade)} | ${btcPhaseOf(trade)} | ${relationOf(trade)}`;
  print('Best combos (min 8)', group(rows, combo, 8).sort((a, b) => b.avgRoe - a.avgRoe), 15);
  print('Worst combos (min 8)', group(rows, combo, 8).sort((a, b) => a.avgRoe - b.avgRoe), 15);
  const timedCombo = (trade) => `${hourOf(trade)} | ${combo(trade)}`;
  print('Best hour + combo intersections (min 5)', group(rows, timedCombo, 5).sort((a, b) => b.avgRoe - a.avgRoe), 15);
  print('Worst hour + combo intersections (min 5)', group(rows, timedCombo, 5).sort((a, b) => a.avgRoe - b.avgRoe), 15);
  print('Candle labels (min 8)', group(rows, candleOf, 8).sort((a, b) => b.avgRoe - a.avgRoe), 20);
}
