import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateLiquidLongReversal } from '../src/liquidLongReversalLabel.js';
import { liquidScanTargetKind } from '../src/liquidScanEvalRule.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const from = args.get('--from') || '2026-07-29';
const to = args.get('--to') || '2026-08-11';
const storeMode = args.get('--store') || 'liquid';

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value, fallback = 'NO_DATA') {
  const text = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return text || fallback;
}

function openedMs(trade) {
  return Date.parse(trade.openedAt ?? trade.createdAt ?? '');
}

const bangkokDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
});

function dayOf(trade) {
  return bangkokDay.format(new Date(openedMs(trade)));
}

function pnlOf(trade) {
  return finite(trade.netPnl ?? trade.pnl, 0);
}

function roeOf(trade) {
  return finite(trade.netRoe ?? trade.roe, 0);
}

function wilsonLower(wins, total, z = 1.96) {
  if (!total) return 0;
  const p = wins / total;
  const denominator = 1 + ((z * z) / total);
  const centre = p + ((z * z) / (2 * total));
  const spread = z * Math.sqrt((p * (1 - p) + ((z * z) / (4 * total))) / total);
  return ((centre - spread) / denominator) * 100;
}

function summarize(rows) {
  const pnls = rows.map(pnlOf);
  const roes = rows.map(roeOf);
  const wins = pnls.filter((value) => value > 0).length;
  const losses = pnls.filter((value) => value < 0).length;
  const grossWin = pnls.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(pnls.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  const sortedRoe = [...roes].sort((a, b) => a - b);
  const byDay = new Map();
  for (const trade of rows) byDay.set(dayOf(trade), (byDay.get(dayOf(trade)) ?? 0) + pnlOf(trade));
  const early = rows.slice(0, Math.ceil(rows.length / 2));
  const late = rows.slice(Math.ceil(rows.length / 2));
  const halfStats = (half) => {
    const halfPnl = half.map(pnlOf);
    const halfWins = halfPnl.filter((value) => value > 0).length;
    return {
      n: half.length,
      wr: half.length ? (halfWins / half.length) * 100 : 0,
      pnl: halfPnl.reduce((sum, value) => sum + value, 0),
      avgRoe: half.length ? half.map(roeOf).reduce((sum, value) => sum + value, 0) / half.length : 0,
    };
  };
  return {
    n: rows.length,
    wins,
    losses,
    wr: rows.length ? (wins / rows.length) * 100 : 0,
    wilson: wilsonLower(wins, rows.length),
    pnl: pnls.reduce((sum, value) => sum + value, 0),
    avgRoe: rows.length ? roes.reduce((sum, value) => sum + value, 0) / rows.length : 0,
    medianRoe: sortedRoe.length ? sortedRoe[Math.floor(sortedRoe.length / 2)] : 0,
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    positiveDays: [...byDay.values()].filter((value) => value > 0).length,
    days: byDay.size,
    worstRoe: sortedRoe[0] ?? 0,
    bestRoe: sortedRoe.at(-1) ?? 0,
    early: halfStats(early),
    late: halfStats(late),
  };
}

function compact(name, stats) {
  return {
    cohort: name,
    N: stats.n,
    WR: `${stats.wr.toFixed(1)}%`,
    'WR95-L': `${stats.wilson.toFixed(1)}%`,
    AvgROE: `${stats.avgRoe >= 0 ? '+' : ''}${stats.avgRoe.toFixed(1)}%`,
    Median: `${stats.medianRoe >= 0 ? '+' : ''}${stats.medianRoe.toFixed(1)}%`,
    PF: stats.pf.toFixed(2),
    PnL: `${stats.pnl >= 0 ? '+' : ''}${stats.pnl.toFixed(4)}`,
    'days+': `${stats.positiveDays}/${stats.days}`,
    tail: `${stats.worstRoe.toFixed(1)}..${stats.bestRoe.toFixed(1)}`,
  };
}

function candleDirection(candle) {
  const explicit = normalize(candle?.direction, '');
  if (explicit) return explicit;
  const name = normalize(candle?.name, '');
  if (/^(BULLISH|HAMMER)/.test(name)) return 'BULLISH';
  if (/^(BEARISH|SHOOTING_STAR)/.test(name)) return 'BEARISH';
  return 'NO_DATA';
}

function marketScores(trade) {
  const market = trade.marketDirectionAtSignal ?? {};
  const dynamics = market.scoreDynamics ?? {};
  const longScore = finite(market.scores?.long ?? dynamics.longScore);
  const shortScore = finite(market.scores?.short ?? dynamics.shortScore);
  return {
    longScore,
    shortScore,
    gap: longScore != null && shortScore != null ? shortScore - longScore : null,
  };
}

function rrOf(trade) {
  const direct = finite(trade.rr);
  if (direct != null) return direct;
  const entry = finite(trade.entryPrice ?? trade.setupEntry);
  const tp = finite(trade.takeProfitPrice ?? trade.tp);
  const sl = finite(trade.stopLossPrice ?? trade.sl);
  const risk = entry != null && sl != null ? Math.abs(entry - sl) : 0;
  return entry != null && tp != null && risk > 0 ? Math.abs(tp - entry) / risk : null;
}

function springContext(trade) {
  const alt = candleDirection(trade.candlePatternAtEntry);
  const btc = candleDirection(trade.btcCandlePatternAtEntry);
  const { gap } = marketScores(trade);
  return alt === 'BULLISH' && btc === 'BULLISH' && gap != null && gap >= 15;
}

function springProxy(trade) {
  const target = liquidScanTargetKind(trade);
  const typeText = normalize([
    trade.signalType,
    trade.huntType,
    trade.huntSignal?.type,
    trade.pumpSignalType,
  ].filter(Boolean).join('|'), '');
  return target === 'EXHAUSTION' || /(SPRING|RECLAIM|CAPITULATION|LIQ_FLUSH|SWEEP)/.test(typeText);
}

function episodesOf(rows, gapMinutes = 15) {
  const sorted = [...rows].sort((a, b) => openedMs(a) - openedMs(b));
  const episodes = [];
  for (const trade of sorted) {
    const last = episodes.at(-1);
    if (!last || openedMs(trade) - last.end > gapMinutes * 60_000) {
      episodes.push({ start: openedMs(trade), end: openedMs(trade), trades: [trade] });
    } else {
      last.end = Math.max(last.end, openedMs(trade));
      last.trades.push(trade);
    }
  }
  return episodes.map((episode) => ({
    ...episode.trades[0],
    netPnl: episode.trades.reduce((sum, trade) => sum + pnlOf(trade), 0),
    netRoe: episode.trades.reduce((sum, trade) => sum + roeOf(trade), 0) / episode.trades.length,
  }));
}

const storeFile = storeMode === 'recommended'
  ? 'recommended-paper-trades.json'
  : 'liquid-paper-trades.json';
const store = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', storeFile), 'utf8'));
const fromMs = Date.parse(`${from}T00:00:00+07:00`);
const toExclusiveMs = Date.parse(`${to}T00:00:00+07:00`) + 24 * 60 * 60_000;
const closedLong = (Array.isArray(store) ? store : store.trades ?? [])
  .filter((trade) => (
    String(trade.status).toUpperCase() === 'CLOSED'
    && String(trade.side).toUpperCase() === 'LONG'
    && (storeMode !== 'recommended' || String(trade.source ?? '').startsWith('liquid-scan-auto'))
    && openedMs(trade) >= fromMs
    && openedMs(trade) < toExclusiveMs
  ))
  .sort((a, b) => openedMs(a) - openedMs(b))
  .map((trade) => ({ ...trade, ...evaluateLiquidLongReversal(trade) }));

const context = closedLong.filter(springContext);
const proxy = context.filter(springProxy);
const prime = proxy.filter((trade) => {
  const rr = rrOf(trade);
  return rr != null && rr < 0.7;
});
const reversal = closedLong.filter((trade) => !['NO_EDGE', 'NO_DATA', 'UNRATED'].includes(trade.liquidLongReversalTier));
const contextAndReversal = context.filter((trade) => !['NO_EDGE', 'NO_DATA', 'UNRATED'].includes(trade.liquidLongReversalTier));

const cohorts = [
  ['ALL LIQUID LONG', closedLong],
  ['EXISTING LONG REVERSAL', reversal],
  ['SPRING CONTEXT (no setup)', context],
  ['SPRING PROXY', proxy],
  ['SPRING PROXY PRIME RR<0.7', prime],
  ['CONTEXT + EXISTING REVERSAL', contextAndReversal],
];

console.log(`Liquid LONG Spring transfer backtest: ${from} -> ${to} Asia/Bangkok`);
console.log(`Store: ${storeFile}${storeMode === 'recommended' ? ' (only source=liquid-scan-auto*)' : ''}`);
console.log('All classifiers use entry snapshots only; CLOSED outcome is used only after classification.');
console.table(cohorts.map(([name, rows]) => compact(name, summarize(rows))));
console.log('\n15-minute episode robustness');
console.table(cohorts.map(([name, rows]) => compact(name, summarize(episodesOf(rows)))));
console.log('\nEarly/late stability');
console.table(cohorts.flatMap(([name, rows]) => {
  const stats = summarize(rows);
  return [
    {
      cohort: `${name} early`, N: stats.early.n, WR: `${stats.early.wr.toFixed(1)}%`,
      AvgROE: `${stats.early.avgRoe >= 0 ? '+' : ''}${stats.early.avgRoe.toFixed(1)}%`,
      PnL: `${stats.early.pnl >= 0 ? '+' : ''}${stats.early.pnl.toFixed(4)}`,
    },
    {
      cohort: `${name} late`, N: stats.late.n, WR: `${stats.late.wr.toFixed(1)}%`,
      AvgROE: `${stats.late.avgRoe >= 0 ? '+' : ''}${stats.late.avgRoe.toFixed(1)}%`,
      PnL: `${stats.late.pnl >= 0 ? '+' : ''}${stats.late.pnl.toFixed(4)}`,
    },
  ];
}));

const setupCounts = new Map();
for (const trade of context) {
  const key = [
    normalize(trade.signalType),
    liquidScanTargetKind(trade),
    normalize(trade.liquidLongReversalTier),
  ].join(' | ');
  setupCounts.set(key, (setupCounts.get(key) ?? 0) + 1);
}
console.log('\nSpring-context composition');
console.table([...setupCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([key, count]) => ({ key, count })));
