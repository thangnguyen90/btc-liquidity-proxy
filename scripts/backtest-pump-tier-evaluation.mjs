import { readFile } from 'node:fs/promises';
import {
  isNativePumpCanonicalTrade,
  pumpCanonicalKeysOfTrade,
} from '../src/pumpCanonicalTier.js';

const file = new URL('../data/pump-paper-trades.json', import.meta.url);
const store = JSON.parse(await readFile(file, 'utf8'));
const allTrades = Array.isArray(store.trades) ? store.trades : [];
const fromDay = process.argv.find((arg) => arg.startsWith('--from='))?.split('=')[1]
  ?? '2026-07-20';
const targetDay = process.argv.find((arg) => arg.startsWith('--day='))?.split('=')[1]
  ?? [...new Set(allTrades.map(dayOf))].filter(Boolean).sort().at(-1);
const feeRate = Number(
  process.env.BINANCE_FUTURES_TAKER_FEE_RATE
    ?? process.env.BINANCE_FEE_RATE
    ?? 0.0004,
);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dayOf(trade = {}) {
  return String(trade.createdAt ?? trade.openedAt ?? '').slice(0, 10);
}

function sourceFamily(trade = {}) {
  if (isNativePumpCanonicalTrade(trade)) return 'PUMP_NATIVE';
  if (String(trade.source ?? '').startsWith('emasq-')) return 'EMA';
  return 'OTHER';
}

function marginBucket(trade = {}) {
  const margin = finite(trade.marginUsdt ?? trade.marginUsd ?? trade.margin, NaN);
  if (!Number.isFinite(margin) || margin <= 0) return 'OTHER';
  if (margin >= 9.5) return '$10';
  if (margin >= 0.95) return '$1';
  return `$${margin.toFixed(2)}`;
}

function resultOf(trade = {}) {
  const grossPnl = finite(trade.pnl);
  const margin = finite(trade.marginUsdt ?? trade.marginUsd ?? trade.margin, NaN);
  const leverage = finite(trade.leverage, 10);
  const fee = finite(
    trade.estimatedFeeUsdt ?? trade.feeUsdt,
    Number.isFinite(margin) && margin > 0
      ? margin * leverage * 2 * feeRate
      : 0,
  );
  const netPnl = grossPnl - fee;
  const grossRoe = Number.isFinite(margin) && margin > 0
    ? grossPnl / margin * 100
    : finite(trade.roe);
  const netRoe = Number.isFinite(margin) && margin > 0
    ? netPnl / margin * 100
    : grossRoe;
  return {
    grossPnl,
    fee,
    netPnl,
    grossRoe,
    netRoe,
    cappedNetRoe: Math.max(-20, Math.min(20, netRoe)),
  };
}

function createBucket(key = '') {
  return {
    key,
    total: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    grossPnl: 0,
    fee: 0,
    netPnl: 0,
    grossRoeSum: 0,
    netRoeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    days: new Map(),
  };
}

function add(bucket, trade) {
  bucket.total += 1;
  if (trade.status !== 'CLOSED') return;
  const result = resultOf(trade);
  bucket.closed += 1;
  bucket.grossPnl += result.grossPnl;
  bucket.fee += result.fee;
  bucket.netPnl += result.netPnl;
  bucket.grossRoeSum += result.grossRoe;
  bucket.netRoeSum += result.netRoe;
  if (result.netRoe > 0) {
    bucket.wins += 1;
    bucket.grossWin += Math.min(20, result.netRoe);
  } else if (result.netRoe < 0) {
    bucket.losses += 1;
    bucket.grossLoss += Math.abs(Math.max(-20, result.netRoe));
  }
  const day = dayOf(trade);
  if (bucket.key !== day) {
    if (!bucket.days.has(day)) bucket.days.set(day, createBucket(day));
    add(bucket.days.get(day), { ...trade, createdAt: `${day}T00:00:00.000Z` });
  }
}

function finalize(bucket) {
  const dailyRows = [...bucket.days.values()].map((row) => ({
    day: row.key,
    closed: row.closed,
    netPnl: +row.netPnl.toFixed(4),
    avgNetRoe: row.closed ? +(row.netRoeSum / row.closed).toFixed(2) : null,
  }));
  if (
    dailyRows.length === 0
    && /^\d{4}-\d{2}-\d{2}$/.test(bucket.key)
    && bucket.closed > 0
  ) {
    dailyRows.push({
      day: bucket.key,
      closed: bucket.closed,
      netPnl: +bucket.netPnl.toFixed(4),
      avgNetRoe: +(bucket.netRoeSum / bucket.closed).toFixed(2),
    });
  }
  return {
    key: bucket.key,
    total: bucket.total,
    closed: bucket.closed,
    wins: bucket.wins,
    losses: bucket.losses,
    wr: bucket.closed ? +(bucket.wins / bucket.closed * 100).toFixed(1) : null,
    grossPnl: +bucket.grossPnl.toFixed(4),
    fee: +bucket.fee.toFixed(4),
    netPnl: +bucket.netPnl.toFixed(4),
    avgGrossRoe: bucket.closed ? +(bucket.grossRoeSum / bucket.closed).toFixed(2) : null,
    avgNetRoe: bucket.closed ? +(bucket.netRoeSum / bucket.closed).toFixed(2) : null,
    pf: bucket.grossLoss > 0 ? +(bucket.grossWin / bucket.grossLoss).toFixed(2) : null,
    days: dailyRows.length,
    positiveDays: dailyRows.filter((row) => row.netPnl > 0).length,
    negativeDays: dailyRows.filter((row) => row.netPnl < 0).length,
    equalDayAvgNetRoe: dailyRows.length
      ? +(dailyRows.reduce((sum, row) => sum + finite(row.avgNetRoe), 0) / dailyRows.length).toFixed(2)
      : null,
    daily: dailyRows,
  };
}

function group(rows, keyOf) {
  const buckets = new Map();
  for (const trade of rows) {
    const key = keyOf(trade);
    if (!buckets.has(key)) buckets.set(key, createBucket(key));
    add(buckets.get(key), trade);
  }
  return [...buckets.values()].map(finalize);
}

function compact(row) {
  return {
    key: row.key,
    closed: row.closed,
    wr: row.wr,
    grossPnl: row.grossPnl,
    fee: row.fee,
    netPnl: row.netPnl,
    avgNetRoe: row.avgNetRoe,
    pf: row.pf,
    days: row.days,
    positiveDays: row.positiveDays,
    equalDayAvgNetRoe: row.equalDayAvgNetRoe,
  };
}

const targetRows = allTrades.filter((trade) => dayOf(trade) === targetDay);
console.log(`\nSOURCE ATTRIBUTION ${targetDay}`);
for (const row of group(targetRows, sourceFamily).map(compact)) console.log(row);

console.log(`\nSOURCE × MARGIN ${targetDay}`);
for (const row of group(targetRows, (trade) => `${sourceFamily(trade)}|${marginBucket(trade)}`)
  .sort((a, b) => b.closed - a.closed)
  .map(compact)) console.log(row);

const nativeClosed = allTrades.filter((trade) => (
  isNativePumpCanonicalTrade(trade)
  && trade.status === 'CLOSED'
  && dayOf(trade) >= fromDay
));
const days = [...new Set(nativeClosed.map(dayOf))].sort();

console.log(`\nPUMP NATIVE DAILY ${fromDay}..${days.at(-1)}`);
for (const row of group(nativeClosed, dayOf).sort((a, b) => a.key.localeCompare(b.key)).map(compact)) {
  console.log(row);
}

console.log('\nPUMP NATIVE BY MARGIN');
for (const row of group(nativeClosed, marginBucket)
  .sort((a, b) => b.closed - a.closed)) {
  console.log({
    ...compact(row),
    daily: row.daily,
  });
}

console.log('\nPUMP NATIVE BY TYPE');
for (const row of group(nativeClosed, (trade) => pumpCanonicalKeysOfTrade(trade).parentKey)
  .filter((row) => row.closed >= 10)
  .sort((a, b) => b.netPnl - a.netPnl)) {
  console.log({
    ...compact(row),
    daily: row.daily,
  });
}

console.log('\nPUMP NATIVE BY TYPE × MARGIN');
for (const row of group(nativeClosed, (trade) => (
  `${pumpCanonicalKeysOfTrade(trade).parentKey}|${marginBucket(trade)}`
))
  .filter((row) => row.closed >= 10)
  .sort((a, b) => b.netPnl - a.netPnl)
  .map(compact)) console.log(row);

const exactRows = group(nativeClosed, (trade) => pumpCanonicalKeysOfTrade(trade).exactKey)
  .filter((row) => row.closed >= 20 && row.days >= 3);
console.log('\nPUMP EXACT CONTEXTS — DESCRIPTIVE ONLY');
for (const row of [
  ...exactRows.slice().sort((a, b) => b.avgNetRoe - a.avgNetRoe).slice(0, 6),
  ...exactRows.slice().sort((a, b) => a.avgNetRoe - b.avgNetRoe).slice(0, 6),
]) {
  console.log({
    ...compact(row),
    daily: row.daily,
  });
}

function metricsFor(rows, key = '') {
  const bucket = createBucket(key);
  for (const trade of rows) add(bucket, trade);
  return finalize(bucket);
}

function selectionKeys(trainRows, level, {
  minClosed,
  minDays,
  minAvgNetRoe,
  minPf,
  minPositiveDayRatio,
}) {
  return new Set(group(trainRows, (trade) => pumpCanonicalKeysOfTrade(trade)[`${level}Key`])
    .filter((row) => (
      row.closed >= minClosed
      && row.days >= minDays
      && row.avgNetRoe >= minAvgNetRoe
      && (row.pf ?? 0) >= minPf
      && row.positiveDays / row.days >= minPositiveDayRatio
    ))
    .map((row) => row.key));
}

const splitDay = process.argv.find((arg) => arg.startsWith('--split='))?.split('=')[1]
  ?? days.at(-3);
const trainRows = nativeClosed.filter((trade) => dayOf(trade) < splitDay);
const testRows = nativeClosed.filter((trade) => dayOf(trade) >= splitDay);
const configs = [
  { level: 'parent', minClosed: 25, minDays: 3 },
  { level: 'coarse', minClosed: 15, minDays: 3 },
  { level: 'exact', minClosed: 10, minDays: 3 },
].map((row) => ({
  ...row,
  minAvgNetRoe: 0.5,
  minPf: 1.1,
  minPositiveDayRatio: 0.6,
}));

console.log(`\nFIXED HOLDOUT train<${splitDay}, test>=${splitDay}`);
for (const config of configs) {
  const keys = selectionKeys(trainRows, config.level, config);
  const selected = testRows.filter((trade) => (
    keys.has(pumpCanonicalKeysOfTrade(trade)[`${config.level}Key`])
  ));
  console.log({
    level: config.level,
    selectedKeys: keys.size,
    train: compact(metricsFor(trainRows.filter((trade) => (
      keys.has(pumpCanonicalKeysOfTrade(trade)[`${config.level}Key`])
    )), 'TRAIN')),
    test: compact(metricsFor(selected, 'TEST')),
  });
}

console.log('\nFIXED HOLDOUT SENSITIVITY');
for (const cutoff of days.slice(3, -1)) {
  const cutoffTrain = nativeClosed.filter((trade) => dayOf(trade) < cutoff);
  const cutoffTest = nativeClosed.filter((trade) => dayOf(trade) >= cutoff);
  for (const config of configs) {
    const keys = selectionKeys(cutoffTrain, config.level, config);
    const selected = cutoffTest.filter((trade) => (
      keys.has(pumpCanonicalKeysOfTrade(trade)[`${config.level}Key`])
    ));
    console.log({
      cutoff,
      level: config.level,
      selectedKeys: keys.size,
      test: compact(metricsFor(selected, 'TEST')),
    });
  }
}

const rollingConfigs = [
  { level: 'parent', minClosed: 20, minDays: 2, minAvgNetRoe: 0, minPf: 1.0, minPositiveDayRatio: 0.5 },
  { level: 'coarse', minClosed: 12, minDays: 2, minAvgNetRoe: 0, minPf: 1.0, minPositiveDayRatio: 0.5 },
  { level: 'exact', minClosed: 8, minDays: 2, minAvgNetRoe: 0, minPf: 1.0, minPositiveDayRatio: 0.5 },
  { level: 'exact', minClosed: 12, minDays: 3, minAvgNetRoe: 0.5, minPf: 1.1, minPositiveDayRatio: 0.6 },
];

console.log('\nROLLING PRIOR-ONLY SELECTORS');
for (const config of rollingConfigs) {
  const selected = [];
  const daily = [];
  for (const day of days.slice(1)) {
    const history = nativeClosed.filter((trade) => dayOf(trade) < day);
    const current = nativeClosed.filter((trade) => dayOf(trade) === day);
    const keys = selectionKeys(history, config.level, config);
    const rows = current.filter((trade) => (
      keys.has(pumpCanonicalKeysOfTrade(trade)[`${config.level}Key`])
    ));
    selected.push(...rows);
    daily.push({
      day,
      keys: keys.size,
      ...compact(metricsFor(rows, day)),
    });
  }
  console.log({
    config,
    aggregate: compact(metricsFor(selected, 'ROLLING')),
    daily,
  });
}
