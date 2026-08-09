import { readFile } from 'node:fs/promises';
import {
  EMA_COMBO_LAYER_HISTORY_START,
  buildEmaComboLayerModel,
  emaComboClosedMetrics,
  evaluateEmaComboLayers,
} from '../src/emaComboLayers.js';

const file = process.argv[2] ?? new URL('../data/pump-paper-trades.json', import.meta.url);
const store = JSON.parse(await readFile(file, 'utf8'));
const trades = (Array.isArray(store) ? store : store.trades ?? [])
  .filter((trade) => (
    String(trade.source ?? '').startsWith('emasq-')
    && String(trade.status ?? '').toUpperCase() === 'CLOSED'
  ));
const dayOf = (trade) => String(trade.createdAt ?? trade.openedAt ?? '').slice(0, 10);
const days = [...new Set(trades.map(dayOf))]
  .filter((day) => day >= EMA_COMBO_LAYER_HISTORY_START)
  .sort();

function empty() {
  return { trades: 0, netPnl: 0, netRoeSum: 0, wins: 0, losses: 0 };
}

function add(bucket, trade) {
  const metrics = emaComboClosedMetrics(trade);
  bucket.trades += 1;
  bucket.netPnl += metrics.netPnl;
  bucket.netRoeSum += metrics.cappedNetRoe;
  if (metrics.netPnl > 0) bucket.wins += 1;
  else if (metrics.netPnl < 0) bucket.losses += 1;
}

const daily = [];
for (const cutoffDay of days) {
  const model = buildEmaComboLayerModel(trades, cutoffDay);
  const buckets = {
    GOOD_PLUS: empty(),
    GOOD: empty(),
    WATCH: empty(),
    RISK: empty(),
  };
  for (const trade of trades.filter((row) => dayOf(row) === cutoffDay)) {
    const evaluation = evaluateEmaComboLayers(trade, model);
    add(buckets[evaluation.layer3.tier] ?? buckets.WATCH, trade);
  }
  const row = { day: cutoffDay, historyDays: model.historyDays.length };
  for (const [tier, bucket] of Object.entries(buckets)) {
    row[`${tier}_N`] = bucket.trades;
    row[`${tier}_NET`] = +bucket.netPnl.toFixed(3);
    row[`${tier}_AVG`] = bucket.trades
      ? +(bucket.netRoeSum / bucket.trades).toFixed(2)
      : 0;
  }
  daily.push(row);
}

console.table(daily);

const cutoffDay = days.at(-1);
if (cutoffDay) {
  const model = buildEmaComboLayerModel(trades, cutoffDay);
  const candidates = new Map();
  for (const trade of trades.filter((row) => dayOf(row) === cutoffDay)) {
    const evaluation = evaluateEmaComboLayers(trade, model);
    if (!['GOOD_PLUS', 'GOOD'].includes(evaluation.layer3.tier)) continue;
    const key = evaluation.layer3.key;
    if (!candidates.has(key)) {
      candidates.set(key, {
        combo: evaluation.layer3.label,
        tier: evaluation.layer3.tier,
        history: evaluation.layer3.evidence,
        current: empty(),
      });
    }
    add(candidates.get(key).current, trade);
  }
  console.log(`\nCandidates for ${cutoffDay}; history: ${model.historyDays.join(', ') || '-'}`);
  console.table([...candidates.values()].map((row) => ({
    tier: row.tier,
    combo: row.combo,
    historyN: row.history.closed,
    historyDays: row.history.days,
    historyAvgNetRoe: row.history.avgNetRoe,
    historyPF: row.history.profitFactor,
    currentN: row.current.trades,
    currentNet: +row.current.netPnl.toFixed(3),
    currentAvgNetRoe: row.current.trades
      ? +(row.current.netRoeSum / row.current.trades).toFixed(2)
      : 0,
  })));
}
