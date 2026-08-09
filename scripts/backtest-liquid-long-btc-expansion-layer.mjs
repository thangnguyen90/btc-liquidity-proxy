import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateLiquidScanStage3 } from '../src/liquidScanEvalRule.js';
import { evaluateLiquidMarketPointPhase } from '../src/liquidMarketPointPhase.js';
import { buildLiquidMarketPointCrossoverSnapshots } from '../src/liquidWaveContinuationRelation.js';
import { evaluateLiquidLongBtcExpansion } from '../src/liquidLongBtcExpansion.js';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));

const from = args.get('--from') || '2026-07-26';
const to = args.get('--to') || '2026-08-08';
const baseUrl = args.get('--base-url') || 'http://127.0.0.1:19082';
const source = args.get('--source') || 'file';
const endpoint = `${baseUrl}/api/liquid-paper-trades?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function entryMs(trade) {
  return Date.parse(trade.openedAt ?? trade.createdAt ?? '');
}

const bangkokDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
});
const bangkokHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23',
});

function dayOf(trade) {
  return bangkokDay.format(new Date(entryMs(trade)));
}

function hourOf(trade) {
  return Number(bangkokHour.format(new Date(entryMs(trade))));
}

function pnlOf(trade) {
  return number(trade.netPnl ?? trade.pnl);
}

function roeOf(trade) {
  return number(trade.netRoe ?? trade.roe);
}

function wilsonLower(wins, total, z = 1.96) {
  if (!total) return 0;
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return (centre - spread) / denominator * 100;
}

function summarize(rows) {
  const values = rows.map(roeOf);
  const pnls = rows.map(pnlOf);
  const wins = pnls.filter((value) => value > 0).length;
  const losses = pnls.filter((value) => value < 0).length;
  const grossWin = pnls.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(pnls.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  const sorted = [...values].sort((a, b) => a - b);
  const capped = values.map((value) => Math.max(-30, Math.min(30, value)));
  const byDay = new Map();
  for (const row of rows) byDay.set(dayOf(row), (byDay.get(dayOf(row)) ?? 0) + pnlOf(row));
  const withoutBest = [...rows].sort((a, b) => roeOf(b) - roeOf(a)).slice(1);
  const withoutBestPnls = withoutBest.map(pnlOf);
  const withoutBestGrossWin = withoutBestPnls.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const withoutBestGrossLoss = Math.abs(withoutBestPnls.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  return {
    n: rows.length,
    wins,
    losses,
    wr: rows.length ? wins / rows.length * 100 : 0,
    wilson: wilsonLower(wins, rows.length),
    pnl: pnls.reduce((sum, value) => sum + value, 0),
    avgRoe: rows.length ? values.reduce((sum, value) => sum + value, 0) / rows.length : 0,
    cappedAvg: rows.length ? capped.reduce((sum, value) => sum + value, 0) / rows.length : 0,
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    pfNoBest: withoutBestGrossLoss > 0 ? withoutBestGrossWin / withoutBestGrossLoss : withoutBestGrossWin > 0 ? 99 : 0,
    positiveDays: [...byDay.values()].filter((value) => value > 0).length,
    days: byDay.size,
    bestRoe: sorted.at(-1) ?? 0,
    worstRoe: sorted[0] ?? 0,
  };
}

function compact(name, stats) {
  return {
    layer: name,
    N: stats.n,
    WR: `${stats.wr.toFixed(1)}%`,
    'WR95-L': `${stats.wilson.toFixed(1)}%`,
    AvgROE: `${stats.avgRoe >= 0 ? '+' : ''}${stats.avgRoe.toFixed(1)}%`,
    Cap30: `${stats.cappedAvg >= 0 ? '+' : ''}${stats.cappedAvg.toFixed(1)}%`,
    Median: `${stats.median >= 0 ? '+' : ''}${stats.median.toFixed(1)}%`,
    PF: stats.pf.toFixed(2),
    'PF-best': stats.pfNoBest.toFixed(2),
    'days+': `${stats.positiveDays}/${stats.days}`,
    tail: `${stats.worstRoe.toFixed(1)}..${stats.bestRoe.toFixed(1)}`,
  };
}

function bucket(value, cuts, labels) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'NO_DATA';
  for (let index = 0; index < cuts.length; index += 1) {
    if (n < cuts[index]) return labels[index];
  }
  return labels.at(-1);
}

function categorical(value) {
  const text = String(value ?? '').trim().toUpperCase();
  return text || 'NO_DATA';
}

const featureFns = new Map([
  ['TARGET', (t) => categorical(t.liquidLongBtcExpansionTargetKind ?? t.liquidStage2TargetKind)],
  ['BTC_CANDLE', (t) => categorical(t.liquidLongBtcExpansionBtcCandlePattern ?? t.btcCandlePatternAtEntry?.name)],
  ['POINT_TIER', (t) => categorical(t.liquidLongBtcExpansionMarketPointTier ?? t.liquidMarketPointPhaseTier)],
  ['POINT_REL', (t) => categorical(t.liquidLongBtcExpansionMarketPointRelation ?? t.liquidMarketPointPhaseTradeRelation)],
  ['STAGE4', (t) => categorical(t.liquidStage4Tier)],
  ['EDGE_POINT', (t) => categorical(t.liquidEdgeActivePointTier)],
  ['BTC_WAVE', (t) => categorical(t.liquidBtcWaveTier)],
  ['WAVE_REL', (t) => categorical(t.liquidWaveContinuationRelation)],
  ['LONG_MARKET', (t) => categorical(t.liquidLongMarketTier)],
  ['LONG_SESSION', (t) => categorical(t.liquidLongSessionTier)],
  ['LONG_REVERSAL', (t) => categorical(t.liquidLongReversalTier)],
  ['LONG_POINT', (t) => categorical(t.liquidLongPointPhaseTier)],
  ['RUNNER30', (t) => t.liquidRunner30Matched === true ? 'MATCHED' : 'NO'],
  ['RUNNER_EDGE', (t) => categorical(t.liquidRunnerDirectionTier)],
  ['HEAVY', (t) => categorical(t.heavySide)],
  ['ALT_REGIME', (t) => categorical(t.liquidEvalAltRegime)],
  ['COIN_CANDLE', (t) => categorical(t.candlePatternAtEntry?.name)],
  ['HUNT', (t) => categorical(t.huntType ?? t.huntSignal?.type)],
  ['COMBO', (t) => categorical(t.liquidCombo)],
  ['HOUR', (t) => `H${String(hourOf(t)).padStart(2, '0')}`],
  ['SESSION6H', (t) => {
    const hour = hourOf(t);
    return `H${String(Math.floor(hour / 6) * 6).padStart(2, '0')}-${String(Math.floor(hour / 6) * 6 + 5).padStart(2, '0')}`;
  }],
  ['SIGNAL_POINT', (t) => bucket(t.signalPoint, [70, 80, 90], ['LT70', '70-79', '80-89', '90+'])],
  ['FEAS', (t) => bucket(t.feasibilityScore, [30, 50, 70], ['LT30', '30-49', '50-69', '70+'])],
  ['SWEEP', (t) => bucket(Math.abs(number(t.sweepDistancePct, NaN)), [1, 2, 5], ['LT1', '1-2', '2-5', '5+'])],
  ['RR', (t) => bucket(t.rr, [0.2, 0.5, 1], ['LT0.2', '0.2-0.5', '0.5-1', '1+'])],
  ['BTC_CORR', (t) => bucket(t.btcCorr, [0.3, 0.5, 0.7], ['LT0.3', '0.3-0.5', '0.5-0.7', '0.7+'])],
  ['ONE_SIDED', (t) => bucket(t.entryPlan?.killZoneCluster?.oneSidedPct, [50, 75, 90], ['LT50', '50-74', '75-89', '90+'])],
]);

function groups(rows, featureName, minN = 6) {
  const fn = featureFns.get(featureName);
  const map = new Map();
  for (const row of rows) {
    const value = fn(row);
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length >= minN)
    .map(([value, list]) => ({ name: `${featureName}=${value}`, rows: list, stats: summarize(list) }));
}

function episodesOf(rows, gapMinutes = 15) {
  const sorted = [...rows].sort((a, b) => entryMs(a) - entryMs(b));
  const episodes = [];
  for (const trade of sorted) {
    const last = episodes.at(-1);
    if (!last || entryMs(trade) - last.end > gapMinutes * 60_000) {
      episodes.push({ start: entryMs(trade), end: entryMs(trade), trades: [trade] });
    } else {
      last.end = Math.max(last.end, entryMs(trade));
      last.trades.push(trade);
    }
  }
  return episodes.map((episode) => ({
    ...episode.trades[0],
    netPnl: episode.trades.reduce((sum, trade) => sum + pnlOf(trade), 0),
    netRoe: episode.trades.reduce((sum, trade) => sum + roeOf(trade), 0) / episode.trades.length,
    episodeSize: episode.trades.length,
  }));
}

let allTrades;
if (source === 'api') {
  console.error(`Fetching ${endpoint}`);
  const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  allTrades = Array.isArray(payload.trades) ? payload.trades : [];
} else {
  console.error('Reading local Liquid store and causal Market Point snapshots');
  const store = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'liquid-paper-trades.json'), 'utf8'));
  const records = fs.readFileSync(
    path.join(rootDir, 'data', 'liquid-market-direction-signal-log.ndjson'),
    'utf8',
  ).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const pointByTradeId = buildLiquidMarketPointCrossoverSnapshots(records);
  const fromMs = Date.parse(`${from}T00:00:00+07:00`);
  const toExclusiveMs = Date.parse(`${to}T00:00:00+07:00`) + 24 * 60 * 60_000;
  allTrades = (Array.isArray(store) ? store : store.trades ?? [])
    .filter((trade) => entryMs(trade) >= fromMs && entryMs(trade) < toExclusiveMs)
    .map((trade) => {
      const stage3 = evaluateLiquidScanStage3(trade);
      const point = evaluateLiquidMarketPointPhase(trade, pointByTradeId.get(String(trade.id)));
      const snapshot = {
        ...trade,
        ...point,
        liquidStage3Tier: stage3.tier,
        liquidStage3Code: stage3.code,
        liquidStage2TargetKind: stage3.targetKind,
      };
      return { ...snapshot, ...evaluateLiquidLongBtcExpansion(snapshot) };
    });
}
const closed = allTrades.filter((trade) => String(trade.status).toUpperCase() === 'CLOSED');
const cohort = closed.filter((trade) => trade.liquidLongBtcExpansionMatched === true);

console.log(`\nLiquid LONG BTC Expansion layer search: ${from} -> ${to} Asia/Bangkok`);
console.log(`API trades ${allTrades.length}; closed ${closed.length}; expansion closed ${cohort.length}`);
console.table([
  compact('BASE · per trade', summarize(cohort)),
  compact('BASE · 15m episodes', summarize(episodesOf(cohort))),
]);

const namedLayers = [
  ['BTC candle confirmed', (t) => t.liquidLongBtcExpansionBtcCandleConfirmed === true],
  ['Point aligned', (t) => t.liquidLongBtcExpansionPointAligned === true],
  ['Far runner', (t) => t.liquidLongBtcExpansionFarRunner === true],
  ['One-sided >= 90%', (t) => number(t.entryPlan?.killZoneCluster?.oneSidedPct, -1) >= 90],
  ['Signal point <70', (t) => number(t.signalPoint, -1) >= 0 && number(t.signalPoint, -1) < 70],
  ['Signal point 70-79', (t) => number(t.signalPoint, -1) >= 70 && number(t.signalPoint, -1) < 80],
  ['Signal point 80-89', (t) => number(t.signalPoint, -1) >= 80 && number(t.signalPoint, -1) < 90],
  ['Signal point 90+', (t) => number(t.signalPoint, -1) >= 90],
  ['Signal point 70-89', (t) => number(t.signalPoint, -1) >= 70 && number(t.signalPoint, -1) < 90],
  ['Point aligned + coin DOJI', (t) => (
    t.liquidLongBtcExpansionPointAligned === true
    && categorical(t.candlePatternAtEntry?.name) === 'DOJI'
  )],
  ['Point aligned + signal 70-79', (t) => (
    t.liquidLongBtcExpansionPointAligned === true
    && number(t.signalPoint, -1) >= 70
    && number(t.signalPoint, -1) < 80
  )],
  ['Point aligned + signal 70-89', (t) => (
    t.liquidLongBtcExpansionPointAligned === true
    && number(t.signalPoint, -1) >= 70
    && number(t.signalPoint, -1) < 90
  )],
  ['One-sided >=90% + signal 70-89', (t) => (
    number(t.entryPlan?.killZoneCluster?.oneSidedPct, -1) >= 90
    && number(t.signalPoint, -1) >= 70
    && number(t.signalPoint, -1) < 90
  )],
  ['One-sided >=90% + ICT 12-17', (t) => (
    number(t.entryPlan?.killZoneCluster?.oneSidedPct, -1) >= 90
    && hourOf(t) >= 12
    && hourOf(t) < 18
  )],
];

console.log('\nNamed layer comparison · trades');
console.table(namedLayers.map(([name, matches]) => compact(name, summarize(cohort.filter(matches)))));
console.log('\nNamed layer comparison · 15m episodes');
console.table(namedLayers.map(([name, matches]) => compact(name, summarize(episodesOf(cohort.filter(matches))))));

console.log('\nNamed layer early/late split');
console.table(namedLayers.flatMap(([name, matches]) => {
  const rows = cohort.filter(matches).sort((a, b) => entryMs(a) - entryMs(b));
  const midpoint = Math.ceil(rows.length / 2);
  return [
    compact(`${name} · early`, summarize(rows.slice(0, midpoint))),
    compact(`${name} · late`, summarize(rows.slice(midpoint))),
  ];
}));

const singles = [...featureFns.keys()]
  .flatMap((name) => groups(cohort, name))
  .filter((row) => row.stats.n >= 10)
  .sort((a, b) => b.stats.wilson - a.stats.wilson || b.stats.pfNoBest - a.stats.pfNoBest);
console.log('\nStrongest single pre-entry layers (N >= 10; ranked by 95% Wilson lower bound)');
console.table(singles.slice(0, 35).map((row) => compact(row.name, row.stats)));

const pairCandidates = singles
  .filter((row) => row.stats.n >= 14)
  .slice(0, 30);
const pairs = [];
for (let left = 0; left < pairCandidates.length; left += 1) {
  for (let right = left + 1; right < pairCandidates.length; right += 1) {
    const first = pairCandidates[left];
    const second = pairCandidates[right];
    if (first.name.split('=')[0] === second.name.split('=')[0]) continue;
    const ids = new Set(second.rows.map((trade) => String(trade.id)));
    const rows = first.rows.filter((trade) => ids.has(String(trade.id)));
    if (rows.length < 10 || rows.length >= cohort.length) continue;
    pairs.push({ name: `${first.name} + ${second.name}`, rows, stats: summarize(rows) });
  }
}
pairs.sort((a, b) => b.stats.wilson - a.stats.wilson || b.stats.pfNoBest - a.stats.pfNoBest);
console.log('\nStrongest two-layer intersections (N >= 10)');
console.table(pairs.slice(0, 35).map((row) => compact(row.name, row.stats)));

console.log('\nTop pair episode checks (15m de-duplication)');
console.table(pairs.slice(0, 15).map((row) => compact(row.name, summarize(episodesOf(row.rows)))));

console.log('\nCohort field coverage');
console.table([...featureFns.keys()].map((name) => {
  const values = new Set(cohort.map((trade) => featureFns.get(name)(trade)));
  return { feature: name, distinct: values.size, values: [...values].slice(0, 12).join(', ') };
}));
