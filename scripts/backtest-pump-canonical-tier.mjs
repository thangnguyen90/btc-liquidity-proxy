import { readFile } from 'node:fs/promises';
import {
  buildPumpCanonicalModel,
  evaluatePumpCanonicalTier,
  isNativePumpCanonicalTrade,
  pumpCanonicalKeysOfTrade,
  pumpCanonicalTierStats,
} from '../src/pumpCanonicalTier.js';
import { edgeShortSideBtcLayer } from '../src/edgeShortTier.js';

const file = new URL('../data/pump-paper-trades.json', import.meta.url);
const parsed = JSON.parse(await readFile(file, 'utf8'));
const trades = (parsed.trades ?? []).filter(isNativePumpCanonicalTrade);
const requestedFrom = process.argv.find((arg) => arg.startsWith('--from='))?.split('=')[1]
  ?? '2026-07-13';
const inspectTier = process.argv.find((arg) => arg.startsWith('--inspect-tier='))?.split('=')[1]
  ?.toUpperCase();
const lookbackDays = Number(
  process.argv.find((arg) => arg.startsWith('--lookback='))?.split('=')[1] ?? 5,
);
const historyFloorDay = process.argv.find((arg) => arg.startsWith('--history-floor='))?.split('=')[1]
  ?? '2026-07-20';
const days = [...new Set(trades.map((trade) => String(trade.createdAt ?? '').slice(0, 10)))]
  .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= requestedFrom)
  .sort();
const aggregateTrades = [];
const predictionPairs = [];

console.log('day        tier     n/c       WR    AvgROE      PF        PnL');
for (const day of days) {
  const model = buildPumpCanonicalModel(trades, day, { lookbackDays, historyFloorDay });
  const dayTrades = trades.filter((trade) => (
    String(trade.createdAt ?? '').slice(0, 10) === day
    && trade.status === 'CLOSED'
  ));
  const stats = pumpCanonicalTierStats(dayTrades, model, { candidate: true });
  for (const trade of dayTrades) {
    const rule = evaluatePumpCanonicalTier(trade, model);
    predictionPairs.push({
      expected: rule?.expectedNetRoe ?? 0,
      actual: Number(trade.roe ?? 0),
    });
  }
  for (const row of stats) {
    if (row.total === 0) continue;
    console.log([
      day.padEnd(10),
      row.tier.padEnd(7),
      `${row.total}/${row.closed}`.padStart(7),
      String(row.wr ?? '-').padStart(7),
      String(row.avgRoe ?? '-').padStart(10),
      String(row.profitFactor ?? '-').padStart(8),
      String(row.pnl ?? 0).padStart(10),
    ].join(' '));
  }
  if (inspectTier) {
    const inspected = dayTrades
      .map((trade) => ({ trade, rule: evaluatePumpCanonicalTier(trade, model) }))
      .filter(({ rule }) => rule?.candidateTier === inspectTier);
    const groups = new Map();
    for (const { trade, rule } of inspected) {
      const key = rule.parentKey;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          n: 0,
          roe: 0,
          expected: 0,
          conservative: 0,
          pf: 0,
          support: 0,
          windows: 0,
        });
      }
      const row = groups.get(key);
      row.n += 1;
      row.roe += Number(trade.roe ?? 0);
      row.expected += rule.expectedNetRoe;
      row.conservative += rule.conservativeEdge;
      row.pf += rule.profitFactor;
      row.support += rule.supportClosed;
      row.windows += rule.positiveWindows;
    }
    for (const row of [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 12)) {
      console.log('  inspect', {
        key: row.key,
        n: row.n,
        actualRoe: +(row.roe / row.n).toFixed(2),
        expected: +(row.expected / row.n).toFixed(2),
        conservative: +(row.conservative / row.n).toFixed(2),
        pf: +(row.pf / row.n).toFixed(2),
        support: +(row.support / row.n).toFixed(1),
        positiveWindows: +(row.windows / row.n).toFixed(1),
      });
    }
  }
  aggregateTrades.push(...dayTrades.map((trade) => ({ trade, model })));
}

const aggregateRows = new Map(['A', 'B', 'WATCH', 'BLOCK'].map((tier) => [tier, {
  tier,
  total: 0,
  closed: 0,
  wins: 0,
  losses: 0,
  pnl: 0,
  roeSum: 0,
  grossWin: 0,
  grossLoss: 0,
}]));
for (const { trade, model } of aggregateTrades) {
  const row = pumpCanonicalTierStats([trade], model, { candidate: true })
    .find((item) => item.total > 0);
  if (!row) continue;
  const aggregate = aggregateRows.get(row.tier);
  aggregate.total += row.total;
  aggregate.closed += row.closed;
  aggregate.wins += row.wins;
  aggregate.losses += row.losses;
  aggregate.pnl += row.pnl;
  aggregate.roeSum += Number(row.avgRoe ?? 0) * row.closed;
  aggregate.grossWin += row.grossWin;
  aggregate.grossLoss += row.grossLoss;
}

console.log('\nAGGREGATE');
for (const row of aggregateRows.values()) {
  if (row.total === 0) continue;
  console.log({
    tier: row.tier,
    total: row.total,
    closed: row.closed,
    wr: row.closed > 0 ? +(row.wins / row.closed * 100).toFixed(1) : null,
    avgRoe: row.closed > 0 ? +(row.roeSum / row.closed).toFixed(2) : null,
    profitFactor: row.grossLoss > 0 ? +(row.grossWin / row.grossLoss).toFixed(2) : null,
    pnl: +row.pnl.toFixed(4),
  });
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const expectedMean = mean(predictionPairs.map((row) => row.expected));
const actualMean = mean(predictionPairs.map((row) => row.actual));
const covariance = mean(predictionPairs.map(
  (row) => (row.expected - expectedMean) * (row.actual - actualMean),
));
const expectedVariance = mean(predictionPairs.map((row) => (row.expected - expectedMean) ** 2));
const actualVariance = mean(predictionPairs.map((row) => (row.actual - actualMean) ** 2));
const correlation = expectedVariance > 0 && actualVariance > 0
  ? covariance / Math.sqrt(expectedVariance * actualVariance)
  : 0;
const sortedPairs = predictionPairs.slice().sort((a, b) => a.expected - b.expected);
const quantiles = Array.from({ length: 5 }, (_, index) => {
  const start = Math.floor(sortedPairs.length * index / 5);
  const end = Math.floor(sortedPairs.length * (index + 1) / 5);
  const bucket = sortedPairs.slice(start, end);
  return {
    q: index + 1,
    n: bucket.length,
    expected: +mean(bucket.map((row) => row.expected)).toFixed(2),
    actual: +mean(bucket.map((row) => row.actual)).toFixed(2),
  };
});
console.log('\nPREDICTION', {
  from: requestedFrom,
  lookbackDays,
  historyFloorDay,
  n: predictionPairs.length,
  correlation: +correlation.toFixed(3),
  quantiles,
});

if (process.argv.includes('--cohorts')) {
  const cohortMaps = {
    parent: new Map(),
    coarse: new Map(),
    exact: new Map(),
  };
  const add = (map, key, trade) => {
    if (!map.has(key)) {
      map.set(key, {
        key,
        n: 0,
        roe: 0,
        winRoe: 0,
        lossRoe: 0,
        days: new Map(),
      });
    }
    const row = map.get(key);
    const roe = Math.max(-20, Math.min(20, Number(trade.roe ?? 0)));
    row.n += 1;
    row.roe += roe;
    if (roe > 0) row.winRoe += roe;
    else if (roe < 0) row.lossRoe += Math.abs(roe);
    const day = String(trade.createdAt ?? '').slice(0, 10);
    row.days.set(day, (row.days.get(day) ?? 0) + roe);
  };
  for (const trade of trades.filter((row) => (
    row.status === 'CLOSED'
    && String(row.createdAt ?? '').slice(0, 10) >= requestedFrom
  ))) {
    const keys = pumpCanonicalKeysOfTrade(trade);
    add(cohortMaps.parent, keys.parentKey, trade);
    add(cohortMaps.coarse, keys.coarseKey, trade);
    add(cohortMaps.exact, keys.exactKey, trade);
  }
  for (const [level, map] of Object.entries(cohortMaps)) {
    const finalized = [...map.values()].map((row) => {
      const dayValues = [...row.days.values()];
      return {
        level,
        key: row.key,
        n: row.n,
        days: dayValues.length,
        positiveDays: dayValues.filter((value) => value > 0).length,
        negativeDays: dayValues.filter((value) => value < 0).length,
        avgRoe: +(row.roe / row.n).toFixed(2),
        pf: row.lossRoe > 0 ? +(row.winRoe / row.lossRoe).toFixed(2) : 9.99,
      };
    });
    const positive = finalized
      .filter((row) => row.n >= 20 && row.days >= 3 && row.avgRoe > 0 && row.pf >= 1.05)
      .sort((a, b) => b.avgRoe - a.avgRoe)
      .slice(0, 20);
    const negative = finalized
      .filter((row) => row.n >= 20 && row.days >= 3 && row.avgRoe < -0.75 && row.pf < 0.85)
      .sort((a, b) => a.avgRoe - b.avgRoe)
      .slice(0, 20);
    console.log(`\nCOHORT ${level.toUpperCase()} POSITIVE`, positive);
    console.log(`COHORT ${level.toUpperCase()} NEGATIVE`, negative);
  }
}

if (process.argv.includes('--side-btc')) {
  const buckets = new Map(['GOOD', 'WATCH', 'RISK'].map((tier) => [tier, {
    tier,
    n: 0,
    wins: 0,
    roe: 0,
    winRoe: 0,
    lossRoe: 0,
    days: new Map(),
  }]));
  for (const trade of trades.filter((row) => (
    row.status === 'CLOSED'
    && String(row.createdAt ?? '').slice(0, 10) >= requestedFrom
  ))) {
    const tier = edgeShortSideBtcLayer(trade).tier;
    const bucket = buckets.get(tier);
    const roe = Math.max(-20, Math.min(20, Number(trade.roe ?? 0)));
    const day = String(trade.createdAt ?? '').slice(0, 10);
    bucket.n += 1;
    bucket.roe += roe;
    bucket.wins += roe > 0 ? 1 : 0;
    if (roe > 0) bucket.winRoe += roe;
    else if (roe < 0) bucket.lossRoe += Math.abs(roe);
    bucket.days.set(day, (bucket.days.get(day) ?? 0) + roe);
  }
  console.log('\nSIDE-BTC PHYSICAL RULE', [...buckets.values()].map((row) => ({
    tier: row.tier,
    n: row.n,
    wr: row.n > 0 ? +(row.wins / row.n * 100).toFixed(1) : null,
    avgRoe: row.n > 0 ? +(row.roe / row.n).toFixed(2) : null,
    pf: row.lossRoe > 0 ? +(row.winRoe / row.lossRoe).toFixed(2) : null,
    days: row.days.size,
    positiveDays: [...row.days.values()].filter((value) => value > 0).length,
  })));
}
