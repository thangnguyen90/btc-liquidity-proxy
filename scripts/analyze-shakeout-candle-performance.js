import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.join(rootDir, 'data', 'shakeout-paper-trades.json');

function arg(name, fallback = null) {
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

function candleOf(trade) {
  return String(trade.candlePatternAtEntry?.name ?? '').trim().toUpperCase();
}

function patternName(value) {
  const name = typeof value === 'object' && value ? value.name : value;
  return String(name ?? 'NO_DATA').trim().toUpperCase() || 'NO_DATA';
}

function coinCandle5mOf(trade) {
  return patternName(trade.candlePattern5m);
}

function coinCandle15mOf(trade) {
  return patternName(trade.candlePattern15m ?? trade.candlePatternAtEntry);
}

function btcCandle5mOf(trade) {
  return patternName(trade.btcCandlePattern5m);
}

const bullish = new Set(['BULLISH_CANDLE', 'BULLISH_ENGULFING', 'BULLISH_MARUBOZU', 'BULLISH_PIN_BAR', 'HAMMER', 'MORNING_STAR']);
const bearish = new Set(['BEARISH_CANDLE', 'BEARISH_ENGULFING', 'BEARISH_MARUBOZU', 'BEARISH_PIN_BAR', 'SHOOTING_STAR', 'EVENING_STAR']);

function candleBiasOf(trade) {
  const candle = candleOf(trade);
  if (bullish.has(candle)) return 'BULLISH';
  if (bearish.has(candle)) return 'BEARISH';
  return 'NEUTRAL';
}

function alignmentOf(trade) {
  const bias = candleBiasOf(trade);
  const side = String(trade.side).toUpperCase();
  if (bias === 'NEUTRAL') return 'NEUTRAL';
  return (side === 'LONG' && bias === 'BULLISH') || (side === 'SHORT' && bias === 'BEARISH')
    ? 'ALIGNED'
    : 'OPPOSITE';
}

function comboParts(trade) {
  return String(trade.shakeoutCombo ?? '').split('|').map((value) => value.trim()).filter(Boolean);
}

function setupOf(trade) {
  return String(comboParts(trade)[0] ?? trade.subtype ?? trade.signalType ?? 'NO_SETUP').toUpperCase();
}

function scoreBucketOf(trade) {
  const score = num(trade.score, NaN);
  if (!Number.isFinite(score)) return 'SCORE_NO_DATA';
  if (score >= 80) return 'SCORE_80_PLUS';
  if (score >= 70) return 'SCORE_70_79';
  if (score >= 60) return 'SCORE_60_69';
  return 'SCORE_LT_60';
}

function btcPhaseOf(trade) {
  const direct = String(trade.btcPhase ?? '').trim().toUpperCase();
  if (direct) return direct;
  const part = comboParts(trade).find((value) => /^BTC_(UP|DOWN|FLAT)_/i.test(value));
  return String(part ?? 'BTC_NO_DATA').toUpperCase();
}

function relationOf(trade) {
  const part = comboParts(trade).find((value) => /^(DOC_LAP|THEO_YEU|THEO)$/i.test(value));
  if (part) return part.toUpperCase();
  const corr = Number(trade.btcCorr);
  if (!Number.isFinite(corr)) return 'NO_DATA';
  if (corr < 0.3) return 'DOC_LAP';
  if (corr < 0.5) return 'THEO_YEU';
  return 'THEO';
}

function summarize(rows) {
  const roes = rows.map((trade) => num(trade.roe));
  const sorted = [...roes].sort((a, b) => a - b);
  const grossWin = roes.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(roes.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  const byDay = new Map();
  for (const trade of rows) byDay.set(dayOf(trade), (byDay.get(dayOf(trade)) ?? 0) + num(trade.roe));
  return {
    n: rows.length,
    wins: roes.filter((value) => value > 0).length,
    wr: rows.length ? roes.filter((value) => value > 0).length / rows.length * 100 : 0,
    avgRoe: rows.length ? roes.reduce((sum, value) => sum + value, 0) / rows.length : 0,
    roe15: rows.length ? roes.reduce((sum, value) => sum + Math.max(-15, Math.min(15, value)), 0) / rows.length : 0,
    median: sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0,
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    pnl: rows.reduce((sum, trade) => sum + num(trade.pnl), 0),
    avgPnl: rows.length ? rows.reduce((sum, trade) => sum + num(trade.pnl), 0) / rows.length : 0,
    sl: rows.filter((trade) => String(trade.outcome ?? '').toUpperCase().includes('SL')).length,
    tp: rows.filter((trade) => String(trade.outcome ?? '').toUpperCase().includes('TP')).length,
    positiveDays: [...byDay.values()].filter((value) => value > 0).length,
    activeDays: byDay.size,
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
    ROE15: `${row.roe15 >= 0 ? '+' : ''}${row.roe15.toFixed(2)}%`,
    Median: `${row.median >= 0 ? '+' : ''}${row.median.toFixed(2)}%`,
    PF: row.pf.toFixed(2),
    PnL: `${row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(3)}`,
    AvgPnL: `${row.avgPnl >= 0 ? '+' : ''}${row.avgPnl.toFixed(3)}`,
    'TP/SL': `${row.tp}/${row.sl}`,
    'days+': `${row.positiveDays}/${row.activeDays}`,
  };
}

function print(title, rows, limit = 40) {
  console.log(`\n${title}`);
  console.table(rows.slice(0, limit).map(compact));
}

const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
const allTrades = Array.isArray(raw) ? raw : raw.trades ?? [];
const firstBackfillAt = allTrades
  .map((trade) => Date.parse(trade?.candlePatternAtEntry?.capturedAt ?? ''))
  .filter(Number.isFinite)
  .sort((a, b) => a - b)[0];
const requestedSince = Date.parse(arg('--since', '') ?? '');
const liveSinceMs = Number.isFinite(requestedSince) ? requestedSince : firstBackfillAt;
const includeBackfill = process.argv.includes('--include-backfill');
const includeChase = process.argv.includes('--include-chase');

let rows = allTrades
  .filter((trade) => trade.status === 'CLOSED')
  .filter((trade) => candleOf(trade) && !['NO_DATA', 'UNKNOWN'].includes(candleOf(trade)))
  .filter((trade) => includeChase || String(trade.variant ?? '').toUpperCase() !== 'CHASE')
  // Existing paper rows were enriched in bulk when this feature started. They are
  // useful for exploration, but are not observations captured by the live pipeline.
  .filter((trade) => includeBackfill || !Number.isFinite(liveSinceMs) || entryMs(trade) >= liveSinceMs);

const toDay = arg('--to');
const days = num(arg('--days'), NaN);
const minSample = Math.max(1, Math.trunc(num(arg('--min-sample', 1), 1)));
if (toDay && Number.isFinite(days) && days > 0) {
  const toExclusive = Date.parse(`${toDay}T17:00:00.000Z`);
  const fromMs = toExclusive - days * 24 * 3600_000;
  rows = rows.filter((trade) => entryMs(trade) >= fromMs && entryMs(trade) < toExclusive);
}

// A signal can spawn MARKET/PENDING/CHASE experiments. Keep those variants separate,
// but suppress accidental duplicate writes of the same signal + execution variant.
const unique = new Map();
for (const trade of rows) {
  const key = `${trade.signalId ?? trade.id}|${trade.variant ?? 'NO_VARIANT'}`;
  const prior = unique.get(key);
  if (!prior || entryMs(trade) > entryMs(prior)) unique.set(key, trade);
}
rows = [...unique.values()];

const times = rows.map(entryMs).filter(Number.isFinite);
console.log(`Shakeout + new candle analysis: ${rows.length} unique closed signal variants`);
if (!includeBackfill && Number.isFinite(liveSinceMs)) {
  console.log(`Live-only cohort since: ${new Date(liveSinceMs).toISOString()} (use --include-backfill only for exploratory history)`);
}
console.log(`CHASE variants: ${includeChase ? 'included (--include-chase)' : 'excluded by default'}`);
if (times.length) console.log(`Coverage: ${new Date(Math.min(...times)).toISOString()} -> ${new Date(Math.max(...times)).toISOString()}`);
console.table([compact({ name: 'ALL', ...summarize(rows) })]);

const desc = (items) => items.sort((a, b) => b.avgRoe - a.avgRoe);
const btcSignalDetail = group(rows, (trade) => (
  `${setupOf(trade)} | ${trade.side} | BTC5_${btcCandle5mOf(trade)} | SIGNAL5_${coinCandle5mOf(trade)}`
), 1).sort((a, b) => a.name.localeCompare(b.name));
print('By execution variant', desc(group(rows, (trade) => trade.variant ?? 'NO_VARIANT')));
print('By side', desc(group(rows, (trade) => trade.side ?? 'NO_SIDE')));
print('By candle alignment', desc(group(rows, alignmentOf)));
print('By candle pattern (min 5)', desc(group(rows, candleOf, 5)));
print('By setup', desc(group(rows, setupOf)));
print('By score bucket', desc(group(rows, scoreBucketOf)));
print('By BTC phase', desc(group(rows, btcPhaseOf)));
print('By BTC relation', desc(group(rows, relationOf)));
print('By Bangkok day', group(rows, dayOf).sort((a, b) => a.name.localeCompare(b.name)));
print('By Bangkok hour (min 5)', desc(group(rows, hourOf, 5)));
print('Setup x candle alignment (min 5)', desc(group(rows, (trade) => `${setupOf(trade)} | ${alignmentOf(trade)}`, 5)));
print('Side x candle pattern (min 5)', desc(group(rows, (trade) => `${trade.side} | ${candleOf(trade)}`, 5)));
print(`Setup x candle pattern (min ${minSample})`, group(rows, (trade) => `${setupOf(trade)} | ${candleOf(trade)}`, minSample).sort((a, b) => a.name.localeCompare(b.name)), 100);
print(`Setup x candle x BTC phase (min ${minSample})`, group(rows, (trade) => `${setupOf(trade)} | ${candleOf(trade)} | ${btcPhaseOf(trade)}`, minSample).sort((a, b) => a.name.localeCompare(b.name)), 200);
print(`Setup x side x signal candle 5m x BTC candle 5m (min ${minSample})`, group(rows, (trade) => (
  `${setupOf(trade)} | ${trade.side} | SIGNAL5_${coinCandle5mOf(trade)} | BTC5_${btcCandle5mOf(trade)}`
), minSample).sort((a, b) => a.name.localeCompare(b.name)), 300);
print(`Setup x side x BTC 5m (min ${minSample})`, group(rows, (trade) => (
  `${setupOf(trade)} | ${trade.side} | BTC5_${btcCandle5mOf(trade)}`
), minSample).sort((a, b) => a.name.localeCompare(b.name)), 300);
// This is the direct drill-down of the parent table above. Deliberately keep
// min=1 so every signal candle inside each BTC-candle combo remains visible.
print('BTC 5m combo -> every signal 5m candle (all samples)', btcSignalDetail, 1000);
print(`Setup x side x BTC 5m x BTC phase (min ${minSample})`, group(rows, (trade) => (
  `${setupOf(trade)} | ${trade.side} | BTC5_${btcCandle5mOf(trade)} | ${btcPhaseOf(trade)}`
), minSample).sort((a, b) => a.name.localeCompare(b.name)), 300);
print(`Detailed BTC 5m combo x signal candles (min ${minSample})`, group(rows, (trade) => (
  `${setupOf(trade)} | ${trade.side} | BTC5_${btcCandle5mOf(trade)}`
  + ` | SIGNAL5_${coinCandle5mOf(trade)} | SIGNAL15_${coinCandle15mOf(trade)}`
), minSample).sort((a, b) => a.name.localeCompare(b.name)), 500);
print(`Setup x side x signal candle 15m x BTC candle 5m (min ${minSample})`, group(rows, (trade) => (
  `${setupOf(trade)} | ${trade.side} | SIGNAL15_${coinCandle15mOf(trade)} | BTC5_${btcCandle5mOf(trade)}`
), minSample).sort((a, b) => a.name.localeCompare(b.name)), 300);
print(`Full candle context (min ${minSample})`, group(rows, (trade) => (
  `${setupOf(trade)} | ${trade.side} | SIGNAL5_${coinCandle5mOf(trade)} | SIGNAL15_${coinCandle15mOf(trade)}`
  + ` | BTC5_${btcCandle5mOf(trade)} | ${btcPhaseOf(trade)} | ${relationOf(trade)} | ${trade.variant ?? 'NO_VARIANT'}`
), minSample).sort((a, b) => a.name.localeCompare(b.name)), 500);

console.log('\nNotes: ROE15 caps every result to [-15%, +15%] for robust comparison; PnL is not used to rank because paper sizes differ.');
console.log('Each signalId + variant is counted once; MARKET/PENDING/CHASE remain separate execution experiments.');

const csvTarget = arg('--csv');
if (csvTarget) {
  const target = path.resolve(rootDir, csvTarget);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const header = ['setup', 'side', 'btcCandle5m', 'signalCandle5m', 'n', 'wins', 'losses', 'wr', 'avgRoe', 'roe15', 'medianRoe', 'pf', 'pnl', 'avgPnl', 'tp', 'sl', 'positiveDays', 'activeDays'];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = [header.join(',')];
  for (const row of btcSignalDetail) {
    const [setup, side, btc, signal] = row.name.split(' | ');
    lines.push([
      setup, side, btc.replace(/^BTC5_/, ''), signal.replace(/^SIGNAL5_/, ''),
      row.n, row.wins, row.n - row.wins, row.wr, row.avgRoe, row.roe15,
      row.median, row.pf, row.pnl, row.avgPnl, row.tp, row.sl,
      row.positiveDays, row.activeDays,
    ].map(quote).join(','));
  }
  fs.writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Detailed CSV: ${target}`);
}
