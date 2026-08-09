import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liquidComboCycleContext, liquidComboKey } from '../src/liquidComboCycleStats.js';
import { deriveLiquidComboBtcBreadthSnapshots } from '../src/liquidComboBtcBreadthLabel.js';
import { evaluateLiquidScanStage3 } from '../src/liquidScanEvalRule.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marketDirectionByTradeId = new Map();
const marketDirectionLogPath = path.join(rootDir, 'data', 'liquid-market-direction-signal-log.ndjson');
if (fs.existsSync(marketDirectionLogPath)) {
  for (const line of fs.readFileSync(marketDirectionLogPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record?.tradeId && record?.marketDirection) {
        marketDirectionByTradeId.set(String(record.tradeId), record.marketDirection);
      }
    } catch {
      // Ignore a possibly incomplete final append in the live NDJSON log.
    }
  }
}
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const splitDay = args.get('--split') || '2026-07-26';
const splitMs = Date.parse(`${splitDay}T00:00:00+07:00`);
const EPISODE_MS = 15 * 60_000;

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function entryMs(trade) {
  return Date.parse(trade.openedAt ?? trade.entryReadyAt ?? trade.createdAt ?? '');
}

function closeMs(trade) {
  return Date.parse(trade.closedAt ?? trade.updatedAt ?? '');
}

function pnlOf(trade) {
  if (Number.isFinite(Number(trade.netPnl))) return Number(trade.netPnl);
  const gross = finite(trade.grossPnl ?? trade.pnl);
  return gross - finite(trade.feeUsdt ?? trade.estimatedFeeUsdt);
}

function roeOf(trade) {
  if (Number.isFinite(Number(trade.netRoe))) return Number(trade.netRoe);
  const margin = finite(trade.marginUsdt);
  return margin > 0 ? pnlOf(trade) / margin * 100 : finite(trade.roe);
}

function dayOfMs(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

function keyOf(trade) {
  const combo = liquidComboKey(trade);
  const cycle = liquidComboCycleContext(trade);
  if (!combo || combo.includes('NO_DATA') || !cycle.complete) return null;
  return `${combo} || CYCLE ${cycle.key}`;
}

function wilsonLower(wins, total, z = 1.96) {
  if (!total) return 0;
  const p = wins / total;
  const denominator = 1 + z * z / total;
  const centre = p + z * z / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);
  return (centre - spread) / denominator * 100;
}

function episodeRows(records) {
  const episodes = new Map();
  for (const record of records) {
    const bucket = Math.floor(record.entryMs / EPISODE_MS) * EPISODE_MS;
    const key = `${record.day}:${bucket}`;
    const episode = episodes.get(key) ?? { key, day: record.day, count: 0, roeSum: 0, pnl: 0 };
    episode.count += 1;
    episode.roeSum += record.roe;
    episode.pnl += record.pnl;
    episodes.set(key, episode);
  }
  return [...episodes.values()].map((episode) => ({
    ...episode,
    roe: episode.count ? episode.roeSum / episode.count : 0,
  }));
}

function metrics(records) {
  const episodes = episodeRows(records);
  const wins = records.filter((record) => record.pnl > 0).length;
  const losses = records.filter((record) => record.pnl < 0).length;
  const grossWin = records.filter((record) => record.roe > 0).reduce((sum, record) => sum + record.roe, 0);
  const grossLoss = Math.abs(records.filter((record) => record.roe < 0).reduce((sum, record) => sum + record.roe, 0));
  const episodeGrossWin = episodes.filter((row) => row.roe > 0).reduce((sum, row) => sum + row.roe, 0);
  const episodeGrossLoss = Math.abs(episodes.filter((row) => row.roe < 0).reduce((sum, row) => sum + row.roe, 0));
  const days = new Map();
  for (const episode of episodes) {
    const row = days.get(episode.day) ?? { roe: 0, count: 0, trades: 0 };
    row.roe += episode.roe;
    row.count += 1;
    row.trades += episode.count;
    days.set(episode.day, row);
  }
  const dayRows = [...days.entries()].map(([day, row]) => ({
    day,
    roe: row.count ? row.roe / row.count : 0,
    trades: row.trades,
  })).sort((a, b) => a.day.localeCompare(b.day));
  const positiveDays = dayRows.filter((row) => row.roe > 0).length;
  return {
    closed: records.length,
    wins,
    losses,
    wr: records.length ? wins / records.length * 100 : 0,
    wilson: wilsonLower(wins, records.length),
    pnl: records.reduce((sum, record) => sum + record.pnl, 0),
    avgRoe: records.length ? records.reduce((sum, record) => sum + record.roe, 0) / records.length : 0,
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    episodes: episodes.length,
    episodeWins: episodes.filter((row) => row.roe > 0).length,
    episodeWr: episodes.length ? episodes.filter((row) => row.roe > 0).length / episodes.length * 100 : 0,
    episodePf: episodeGrossLoss > 0 ? episodeGrossWin / episodeGrossLoss : episodeGrossWin > 0 ? 99 : 0,
    days: dayRows.length,
    positiveDays,
    positiveDayRate: dayRows.length ? positiveDays / dayRows.length * 100 : 0,
    maxDayShare: records.length
      ? Math.max(0, ...dayRows.map((row) => row.trades)) / records.length * 100
      : 0,
    dayRows,
  };
}

function priorMetrics(records) {
  const all = metrics(records);
  const recentDays = new Set(all.dayRows.slice(-5).map((row) => row.day));
  const recent = metrics(records.filter((record) => recentDays.has(record.day)));
  const episodeKeys = [...new Set(records.map((record) => (
    `${record.day}:${Math.floor(record.entryMs / EPISODE_MS) * EPISODE_MS}`
  )))];
  const lastEpisodeMetrics = {};
  for (const count of [3, 5, 10]) {
    const keys = new Set(episodeKeys.slice(-count));
    lastEpisodeMetrics[count] = metrics(records.filter((record) => keys.has(
      `${record.day}:${Math.floor(record.entryMs / EPISODE_MS) * EPISODE_MS}`,
    )));
  }
  return { all, recent, lastEpisodeMetrics };
}

function compact(name, result) {
  return {
    rule: name,
    N: result.closed,
    WR: `${result.wr.toFixed(1)}%`,
    'WR95-L': `${result.wilson.toFixed(1)}%`,
    PF: result.pf.toFixed(2),
    AvgROE: `${result.avgRoe >= 0 ? '+' : ''}${result.avgRoe.toFixed(2)}%`,
    Episodes: result.episodes,
    EpWR: `${result.episodeWr.toFixed(1)}%`,
    EpPF: result.episodePf.toFixed(2),
    'days+': `${result.positiveDays}/${result.days}`,
    MaxDay: `${result.maxDayShare.toFixed(0)}%`,
  };
}

const store = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'liquid-paper-trades.json'), 'utf8'));
const storeTrades = Array.isArray(store) ? store : store.trades ?? [];
const trades = storeTrades
  .filter((trade) => String(trade.source ?? '').startsWith('liquid-scan'))
  .filter((trade) => String(trade.status ?? '').toUpperCase() === 'CLOSED')
  .filter((trade) => String(trade.outcome ?? '').toUpperCase() !== 'INVALID')
  .map((trade) => ({
    trade,
    market: trade.marketDirectionAtSignal
      ?? marketDirectionByTradeId.get(String(trade.id ?? ''))
      ?? null,
    stage3: evaluateLiquidScanStage3(trade),
    key: keyOf(trade),
    entryMs: entryMs(trade),
    closeMs: closeMs(trade),
    day: dayOfMs(entryMs(trade)),
    pnl: pnlOf(trade),
    roe: Math.max(-30, Math.min(30, roeOf(trade))),
  }))
  .filter((record) => record.key && record.entryMs > 0 && record.closeMs > record.entryMs)
  .sort((a, b) => a.entryMs - b.entryMs);

const closes = [...trades].sort((a, b) => a.closeMs - b.closeMs);
const histories = new Map();
const cache = new Map();
const observations = [];
let closeIndex = 0;
for (const record of trades) {
  while (closeIndex < closes.length && closes[closeIndex].closeMs < record.entryMs) {
    const closed = closes[closeIndex];
    const history = histories.get(closed.key) ?? [];
    history.push(closed);
    histories.set(closed.key, history);
    cache.delete(closed.key);
    closeIndex += 1;
  }
  const history = histories.get(record.key) ?? [];
  let prior = cache.get(record.key);
  if (!prior) {
    prior = priorMetrics(history);
    cache.set(record.key, prior);
  }
  observations.push({ ...record, prior });
}

const configs = [];
for (const minClosed of [12, 20, 30, 50]) {
  for (const minEpisodes of [6, 10, 15]) {
    for (const minDays of [3, 4, 5]) {
      for (const minTradeWr of [0, 55, 60, 65, 70]) {
        for (const minEpisodePf of [1.2, 1.5, 2, 2.5, 3]) {
          for (const minPositiveDayRate of [60, 70, 80]) {
            configs.push({
              minClosed,
              minEpisodes,
              minDays,
              minTradeWr,
              minEpisodePf,
              minPositiveDayRate,
              minAvgRoe: 0.5,
              minRecentEpisodePf: 1,
              minRecentPositiveDayRate: 50,
            });
          }
        }
      }
    }
  }
}

function matches(observation, config) {
  const all = observation.prior.all;
  const recent = observation.prior.recent;
  return all.closed >= config.minClosed
    && all.episodes >= config.minEpisodes
    && all.days >= config.minDays
    && all.wr >= config.minTradeWr
    && all.episodePf >= config.minEpisodePf
    && all.positiveDayRate >= config.minPositiveDayRate
    && all.avgRoe >= config.minAvgRoe
    && recent.episodePf >= config.minRecentEpisodePf
    && recent.positiveDayRate >= config.minRecentPositiveDayRate;
}

function recordsOf(rows) {
  return rows.map((row) => ({
    entryMs: row.entryMs,
    day: row.day,
    pnl: row.pnl,
    roe: row.roe,
  }));
}

const train = observations.filter((row) => row.entryMs < splitMs);
const holdout = observations.filter((row) => row.entryMs >= splitMs);
const evaluated = configs.map((config) => {
  const trainRows = train.filter((row) => matches(row, config));
  const holdoutRows = holdout.filter((row) => matches(row, config));
  const trainStats = metrics(recordsOf(trainRows));
  const holdoutStats = metrics(recordsOf(holdoutRows));
  const name = `C${config.minClosed}/E${config.minEpisodes}/D${config.minDays}/WR${config.minTradeWr}/PF${config.minEpisodePf}/DAY${config.minPositiveDayRate}`;
  return { config, name, trainStats, holdoutStats };
}).filter((row) => row.trainStats.closed >= 100 && row.holdoutStats.closed >= 25)
  .sort((a, b) => b.trainStats.wilson - a.trainStats.wilson
    || b.trainStats.episodePf - a.trainStats.episodePf
    || b.trainStats.closed - a.trainStats.closed);

const stableConfig = {
  minClosed: 12,
  minEpisodes: 6,
  minDays: 3,
  minTradeWr: 0,
  minEpisodePf: 1.2,
  minPositiveDayRate: 60,
  minAvgRoe: 0.5,
  minRecentEpisodePf: 1,
  minRecentPositiveDayRate: 50,
};
const stableTrain = train.filter((row) => matches(row, stableConfig));
const stableHoldout = holdout.filter((row) => matches(row, stableConfig));

console.log(`Liquid combo causal walk-forward; split ${splitDay} Asia/Bangkok`);
console.log(`Coverage ${dayOfMs(trades[0]?.entryMs)} -> ${dayOfMs(trades.at(-1)?.entryMs)}; closed ${trades.length}; combo-cycle keys ${new Set(trades.map((row) => row.key)).size}`);
console.log('\nBaselines');
console.table([
  compact('ALL · train', metrics(recordsOf(train))),
  compact('ALL · holdout', metrics(recordsOf(holdout))),
  compact('CURRENT STABLE · train', metrics(recordsOf(stableTrain))),
  compact('CURRENT STABLE · holdout', metrics(recordsOf(stableHoldout))),
]);

console.log('\nTop configs selected on TRAIN only · paired holdout result');
console.table(evaluated.slice(0, 30).flatMap((row) => [
  compact(`${row.name} · TRAIN`, row.trainStats),
  compact(`${row.name} · HOLDOUT`, row.holdoutStats),
]));

const robust = evaluated
  .filter((row) => row.holdoutStats.wr >= 60)
  .filter((row) => row.holdoutStats.episodePf >= 1.2)
  .filter((row) => row.holdoutStats.positiveDayRate >= 60)
  .sort((a, b) => b.holdoutStats.wilson - a.holdoutStats.wilson
    || b.holdoutStats.episodePf - a.holdoutStats.episodePf);
console.log('\nRobust survivors (holdout filters only after train ranking audit)');
console.table(robust.slice(0, 30).flatMap((row) => [
  compact(`${row.name} · TRAIN`, row.trainStats),
  compact(`${row.name} · HOLDOUT`, row.holdoutStats),
]));

const knownBeforeSplit = trades.filter((row) => row.closeMs < splitMs);
const trainGroups = new Map();
for (const row of knownBeforeSplit) {
  const list = trainGroups.get(row.key) ?? [];
  list.push(row);
  trainGroups.set(row.key, list);
}
const frozenRank = [...trainGroups.entries()].map(([key, rows]) => ({
  key,
  rows,
  stats: metrics(recordsOf(rows)),
})).filter((row) => row.stats.closed >= 20)
  .filter((row) => row.stats.episodes >= 6)
  .filter((row) => row.stats.days >= 3)
  .filter((row) => row.stats.positiveDayRate >= 60)
  .filter((row) => row.stats.episodePf >= 1.2)
  .sort((a, b) => b.stats.wilson - a.stats.wilson
    || b.stats.episodePf - a.stats.episodePf
    || b.stats.closed - a.stats.closed);

console.log('\nExact combo-cycle keys frozen at split (training outcomes closed before split)');
console.table(frozenRank.slice(0, 20).map((row, index) => ({
  rank: index + 1,
  key: row.key,
  ...compact('TRAIN', row.stats),
})));

console.log('\nFrozen top-N key portfolios · holdout is untouched by selection');
const frozenPortfolios = [];
for (const topN of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
  const keys = new Set(frozenRank.slice(0, topN).map((row) => row.key));
  if (!keys.size) continue;
  const trainRows = knownBeforeSplit.filter((row) => keys.has(row.key));
  const holdoutRows = holdout.filter((row) => keys.has(row.key));
  frozenPortfolios.push(
    compact(`FROZEN TOP ${topN} · TRAIN`, metrics(recordsOf(trainRows))),
    compact(`FROZEN TOP ${topN} · HOLDOUT`, metrics(recordsOf(holdoutRows))),
  );
}
console.table(frozenPortfolios);

const momentumConfigs = [];
for (const minClosed of [12, 20, 30]) {
  for (const minEpisodes of [6, 10]) {
    for (const minDays of [3, 4]) {
      for (const minEpisodePf of [1.2, 1.5, 2]) {
        for (const minPositiveDayRate of [60, 70]) {
          for (const lastEpisodes of [3, 5, 10]) {
            for (const minLastEpisodeWr of [50, 60, 70]) {
              for (const minLastEpisodePf of [1, 1.5, 2]) {
                momentumConfigs.push({
                  minClosed,
                  minEpisodes,
                  minDays,
                  minEpisodePf,
                  minPositiveDayRate,
                  lastEpisodes,
                  minLastEpisodeWr,
                  minLastEpisodePf,
                });
              }
            }
          }
        }
      }
    }
  }
}

function matchesMomentum(observation, config) {
  const all = observation.prior.all;
  const last = observation.prior.lastEpisodeMetrics[config.lastEpisodes];
  return all.closed >= config.minClosed
    && all.episodes >= config.minEpisodes
    && all.days >= config.minDays
    && all.episodePf >= config.minEpisodePf
    && all.positiveDayRate >= config.minPositiveDayRate
    && all.avgRoe >= 0.5
    && last.episodes >= config.lastEpisodes
    && last.episodeWr >= config.minLastEpisodeWr
    && last.episodePf >= config.minLastEpisodePf;
}

const momentumEvaluated = momentumConfigs.map((config) => {
  const trainRows = train.filter((row) => matchesMomentum(row, config));
  const holdoutRows = holdout.filter((row) => matchesMomentum(row, config));
  const trainStats = metrics(recordsOf(trainRows));
  const holdoutStats = metrics(recordsOf(holdoutRows));
  const name = [
    `C${config.minClosed}`,
    `E${config.minEpisodes}`,
    `D${config.minDays}`,
    `PF${config.minEpisodePf}`,
    `DAY${config.minPositiveDayRate}`,
    `L${config.lastEpisodes}`,
    `LWR${config.minLastEpisodeWr}`,
    `LPF${config.minLastEpisodePf}`,
  ].join('/');
  return { config, name, trainStats, holdoutStats };
}).filter((row) => row.trainStats.closed >= 80 && row.holdoutStats.closed >= 20)
  .sort((a, b) => b.trainStats.wilson - a.trainStats.wilson
    || b.trainStats.episodePf - a.trainStats.episodePf
    || b.trainStats.closed - a.trainStats.closed);

console.log('\nFast-freshness configs selected on TRAIN only · paired holdout');
console.table(momentumEvaluated.slice(0, 30).flatMap((row) => [
  compact(`${row.name} · TRAIN`, row.trainStats),
  compact(`${row.name} · HOLDOUT`, row.holdoutStats),
]));

const momentumRobust = momentumEvaluated
  .filter((row) => row.holdoutStats.wr >= 65)
  .filter((row) => row.holdoutStats.pf >= 1.1)
  .filter((row) => row.holdoutStats.episodePf >= 1.1)
  .filter((row) => row.holdoutStats.positiveDayRate >= 60)
  .sort((a, b) => b.holdoutStats.wilson - a.holdoutStats.wilson
    || b.holdoutStats.episodePf - a.holdoutStats.episodePf);
console.log('\nFast-freshness robust survivors');
console.table(momentumRobust.slice(0, 30).flatMap((row) => [
  compact(`${row.name} · TRAIN`, row.trainStats),
  compact(`${row.name} · HOLDOUT`, row.holdoutStats),
]));

function upper(value, fallback = 'NO_DATA') {
  const text = String(value ?? '').trim().toUpperCase();
  return text || fallback;
}

function numericBucket(value, cuts, labels) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'NO_DATA';
  for (let index = 0; index < cuts.length; index += 1) {
    if (parsed < cuts[index]) return labels[index];
  }
  return labels.at(-1);
}

const entryFeatures = new Map([
  ['SIDE', (row) => upper(row.trade.side)],
  ['TARGET', (row) => upper(row.stage3.targetKind)],
  ['STAGE3', (row) => upper(row.stage3.tier)],
  ['SIGNAL', (row) => numericBucket(row.trade.signalPoint, [70, 80, 90], ['LT70', '70-79', '80-89', '90+'])],
  ['ONE_SIDED', (row) => numericBucket(row.trade.entryPlan?.killZoneCluster?.oneSidedPct, [50, 75, 90], ['LT50', '50-74', '75-89', '90+'])],
  ['SWEEP', (row) => numericBucket(Math.abs(finite(row.trade.sweepDistancePct, NaN)), [1, 2, 5], ['LT1', '1-2', '2-5', '5+'])],
  ['FEAS', (row) => numericBucket(row.trade.feasibilityScore, [30, 50, 70], ['LT30', '30-49', '50-69', '70+'])],
  ['COIN_CANDLE', (row) => upper(row.trade.candlePatternAtEntry?.name)],
  ['BTC_CANDLE', (row) => upper(row.trade.btcCandlePatternAtEntry?.name)],
  ['HOUR6', (row) => {
    const hour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23',
    }).format(new Date(row.entryMs)));
    const start = Math.floor(hour / 6) * 6;
    return `${String(start).padStart(2, '0')}-${String(start + 5).padStart(2, '0')}`;
  }],
  ['CORR', (row) => numericBucket(row.trade.btcCorr, [0.3, 0.5, 0.7], ['LT0.3', '0.3-0.5', '0.5-0.7', '0.7+'])],
]);

const stableTrainRows = train.filter((row) => matches(row, stableConfig));
const stableHoldoutRows = holdout.filter((row) => matches(row, stableConfig));
const entryLayers = [];
for (const [feature, valueOf] of entryFeatures) {
  const values = new Set(stableTrainRows.map(valueOf));
  for (const value of values) {
    const trainRows = stableTrainRows.filter((row) => valueOf(row) === value);
    const holdoutRows = stableHoldoutRows.filter((row) => valueOf(row) === value);
    if (trainRows.length < 40 || holdoutRows.length < 15) continue;
    entryLayers.push({
      name: `${feature}=${value}`,
      trainRows,
      holdoutRows,
      trainStats: metrics(recordsOf(trainRows)),
      holdoutStats: metrics(recordsOf(holdoutRows)),
    });
  }
}
entryLayers.sort((a, b) => b.trainStats.wilson - a.trainStats.wilson
  || b.trainStats.episodePf - a.trainStats.episodePf);
console.log('\nCausal combo-stable + single entry layer · selected on TRAIN');
console.table(entryLayers.slice(0, 30).flatMap((row) => [
  compact(`${row.name} · TRAIN`, row.trainStats),
  compact(`${row.name} · HOLDOUT`, row.holdoutStats),
]));

const entryPairs = [];
for (let left = 0; left < Math.min(25, entryLayers.length); left += 1) {
  for (let right = left + 1; right < Math.min(25, entryLayers.length); right += 1) {
    const first = entryLayers[left];
    const second = entryLayers[right];
    if (first.name.split('=')[0] === second.name.split('=')[0]) continue;
    const trainIds = new Set(second.trainRows.map((row) => String(row.trade.id)));
    const holdoutIds = new Set(second.holdoutRows.map((row) => String(row.trade.id)));
    const trainRows = first.trainRows.filter((row) => trainIds.has(String(row.trade.id)));
    const holdoutRows = first.holdoutRows.filter((row) => holdoutIds.has(String(row.trade.id)));
    if (trainRows.length < 30 || holdoutRows.length < 12) continue;
    entryPairs.push({
      name: `${first.name} + ${second.name}`,
      trainRows,
      holdoutRows,
      trainStats: metrics(recordsOf(trainRows)),
      holdoutStats: metrics(recordsOf(holdoutRows)),
    });
  }
}
entryPairs.sort((a, b) => b.trainStats.wilson - a.trainStats.wilson
  || b.trainStats.episodePf - a.trainStats.episodePf);
console.log('\nCausal combo-stable + two entry layers · selected on TRAIN');
console.table(entryPairs.slice(0, 30).flatMap((row) => [
  compact(`${row.name} · TRAIN`, row.trainStats),
  compact(`${row.name} · HOLDOUT`, row.holdoutStats),
]));

const entryRobust = [...entryLayers, ...entryPairs]
  .filter((row) => row.trainStats.pf >= 1)
  .filter((row) => row.trainStats.episodePf >= 1)
  .filter((row) => row.holdoutStats.wr >= 65)
  .filter((row) => row.holdoutStats.pf >= 1.1)
  .filter((row) => row.holdoutStats.episodePf >= 1.1)
  .filter((row) => row.holdoutStats.positiveDayRate >= 60)
  .sort((a, b) => b.holdoutStats.wilson - a.holdoutStats.wilson
    || b.holdoutStats.episodePf - a.holdoutStats.episodePf);
console.log('\nCombo + entry-layer robust survivors');
console.table(entryRobust.slice(0, 30).flatMap((row) => [
  compact(`${row.name} · TRAIN`, row.trainStats),
  compact(`${row.name} · HOLDOUT`, row.holdoutStats),
]));

const dojiNearSweep = observations.filter((row) => (
  matches(row, stableConfig)
  && upper(row.trade.candlePatternAtEntry?.name) === 'DOJI'
  && Math.abs(finite(row.trade.sweepDistancePct, Number.POSITIVE_INFINITY)) < 1
));
const latestDay = dayOfMs(trades.at(-1)?.entryMs);
const latest14StartDay = dayOfMs(Date.parse(`${latestDay}T00:00:00+07:00`) - 13 * 24 * 60 * 60_000);
const dojiNearSweepStats = metrics(recordsOf(dojiNearSweep));
console.log('\nNamed candidate: LIQ COMBO · DOJI NEAR-SWEEP PRIME TEST');
console.table([
  compact('ALL CAUSAL', dojiNearSweepStats),
  compact(`LAST 14D ${latest14StartDay}..${latestDay}`, metrics(recordsOf(
    dojiNearSweep.filter((row) => row.day >= latest14StartDay && row.day <= latestDay),
  ))),
  compact('TRAIN', metrics(recordsOf(dojiNearSweep.filter((row) => row.entryMs < splitMs)))),
  compact('HOLDOUT', metrics(recordsOf(dojiNearSweep.filter((row) => row.entryMs >= splitMs)))),
  compact(`LATEST ${latestDay}`, metrics(recordsOf(dojiNearSweep.filter((row) => row.day === latestDay)))),
]);
console.table(dojiNearSweepStats.dayRows.map((row) => ({
  day: row.day,
  trades: row.trades,
  avgEpisodeRoe: +row.roe.toFixed(2),
  positive: row.roe > 0,
})));
console.table(dojiNearSweep.filter((row) => row.day === latestDay).map((row) => ({
  openedAt: row.trade.openedAt ?? row.trade.entryReadyAt ?? row.trade.createdAt,
  closedAt: row.trade.closedAt ?? row.trade.updatedAt,
  symbol: row.trade.symbol,
  side: row.trade.side,
  outcome: row.trade.outcome,
  roe: +row.roe.toFixed(2),
  priorLast3Wr: +row.prior.lastEpisodeMetrics[3].episodeWr.toFixed(1),
  priorLast3Pf: +row.prior.lastEpisodeMetrics[3].episodePf.toFixed(2),
})));

const dojiFreshnessVariants = [
  ['LAST3 WR>=66 PF>=1', (row) => (
    row.prior.lastEpisodeMetrics[3].episodeWr >= 66
    && row.prior.lastEpisodeMetrics[3].episodePf >= 1
  )],
  ['LAST3 WR>=66 PF>=1.5', (row) => (
    row.prior.lastEpisodeMetrics[3].episodeWr >= 66
    && row.prior.lastEpisodeMetrics[3].episodePf >= 1.5
  )],
  ['LAST5 WR>=60 PF>=1.2', (row) => (
    row.prior.lastEpisodeMetrics[5].episodeWr >= 60
    && row.prior.lastEpisodeMetrics[5].episodePf >= 1.2
  )],
  ['LAST5 WR>=60 PF>=1.5', (row) => (
    row.prior.lastEpisodeMetrics[5].episodeWr >= 60
    && row.prior.lastEpisodeMetrics[5].episodePf >= 1.5
  )],
  ['RECENT5D PF>=1.2 DAY>=60', (row) => (
    row.prior.recent.episodePf >= 1.2
    && row.prior.recent.positiveDayRate >= 60
  )],
  ['PREVIOUS KNOWN DAY POSITIVE', (row) => row.prior.all.dayRows.at(-1)?.roe > 0],
];
console.log('\nNamed candidate + causal freshness audit');
console.table(dojiFreshnessVariants.flatMap(([name, predicate]) => {
  const rows = dojiNearSweep.filter(predicate);
  return [
    compact(`${name} · TRAIN`, metrics(recordsOf(rows.filter((row) => row.entryMs < splitMs)))),
    compact(`${name} · HOLDOUT`, metrics(recordsOf(rows.filter((row) => row.entryMs >= splitMs)))),
    compact(`${name} · LATEST`, metrics(recordsOf(rows.filter((row) => row.day === latestDay)))),
  ];
}));

console.log('\nNamed candidate by side');
console.table(['LONG', 'SHORT'].flatMap((side) => {
  const rows = dojiNearSweep.filter((row) => upper(row.trade.side) === side);
  return [
    compact(`${side} · ALL`, metrics(recordsOf(rows))),
    compact(`${side} · TRAIN`, metrics(recordsOf(rows.filter((row) => row.entryMs < splitMs)))),
    compact(`${side} · HOLDOUT`, metrics(recordsOf(rows.filter((row) => row.entryMs >= splitMs)))),
    compact(`${side} · LATEST`, metrics(recordsOf(rows.filter((row) => row.day === latestDay)))),
  ];
}));

function marketFacts(row) {
  const market = row.market && typeof row.market === 'object' ? row.market : null;
  if (!market?.scores || !market?.breadth || !market?.btc) return null;
  const marketSampleMs = finite(market.sampleKey, NaN);
  if (!Number.isFinite(marketSampleMs) || marketSampleMs > row.entryMs) return null;
  const side = upper(row.trade.side);
  const sign = side === 'LONG' ? 1 : side === 'SHORT' ? -1 : 0;
  if (!sign) return null;
  const longScore = finite(market.scores.long, NaN);
  const shortScore = finite(market.scores.short, NaN);
  const btcTrend = upper(market.btc.trend);
  const expectedTrend = side === 'LONG' ? 'UP' : 'DOWN';
  const oppositeTrend = side === 'LONG' ? 'DOWN' : 'UP';
  const sideBreadth = side === 'LONG'
    ? [market.breadth.up1hPct, market.breadth.up3hPct, market.breadth.up6hPct]
    : [market.breadth.down1hPct, market.breadth.down3hPct, market.breadth.down6hPct];
  const oppositeBreadth = side === 'LONG'
    ? [market.breadth.down1hPct, market.breadth.down3hPct, market.breadth.down6hPct]
    : [market.breadth.up1hPct, market.breadth.up3hPct, market.breadth.up6hPct];
  const breadthLeads = sideBreadth.reduce((count, value, index) => (
    count + (finite(value, -Infinity) > finite(oppositeBreadth[index], Infinity) ? 1 : 0)
  ), 0);
  const label = upper(market.label ?? market.rawLabel);
  const oppositeLabel = side === 'LONG' ? 'SHORT_FAVORED' : 'LONG_FAVORED';
  return {
    label,
    marketSampleMs,
    confidence: finite(market.scores.confidence),
    scoreEdge: sign * (longScore - shortScore),
    btcTrend,
    trendAligned: btcTrend === expectedTrend,
    trendOpposite: btcTrend === oppositeTrend,
    btc15mAligned: sign * finite(market.btc.ret15m, NaN),
    btc1hAligned: sign * finite(market.btc.ret1h, NaN),
    btc6hAligned: sign * finite(market.btc.ret6h, NaN),
    breadthLeads,
    oppositeLabel: label === oppositeLabel,
  };
}

const marketConfigs = [];
for (const trendMode of ['ANY', 'NOT_OPPOSITE', 'ALIGNED']) {
  for (const minBtc1h of [-99, -0.1, 0, 0.1, 0.25]) {
    for (const minBtc6h of [-99, 0, 0.2]) {
      for (const minScoreEdge of [-99, -5, 0, 5, 10]) {
        for (const minBreadthLeads of [0, 2, 3]) {
          for (const rejectOppositeLabel of [false, true]) {
            marketConfigs.push({
              trendMode,
              minBtc1h,
              minBtc6h,
              minScoreEdge,
              minBreadthLeads,
              rejectOppositeLabel,
            });
          }
        }
      }
    }
  }
}

function matchesMarketConfig(row, config) {
  const facts = marketFacts(row);
  if (!facts) return false;
  if (config.trendMode === 'ALIGNED' && !facts.trendAligned) return false;
  if (config.trendMode === 'NOT_OPPOSITE' && facts.trendOpposite) return false;
  return facts.btc1hAligned >= config.minBtc1h
    && facts.btc6hAligned >= config.minBtc6h
    && facts.scoreEdge >= config.minScoreEdge
    && facts.breadthLeads >= config.minBreadthLeads
    && (!config.rejectOppositeLabel || !facts.oppositeLabel);
}

const dojiMarketTrain = dojiNearSweep.filter((row) => row.entryMs < splitMs && marketFacts(row));
const dojiMarketHoldout = dojiNearSweep.filter((row) => row.entryMs >= splitMs && marketFacts(row));
const marketEvaluated = marketConfigs.map((config) => {
  const trainRows = dojiMarketTrain.filter((row) => matchesMarketConfig(row, config));
  const holdoutRows = dojiMarketHoldout.filter((row) => matchesMarketConfig(row, config));
  const name = [
    `TREND=${config.trendMode}`,
    `BTC1H>=${config.minBtc1h}`,
    `BTC6H>=${config.minBtc6h}`,
    `EDGE>=${config.minScoreEdge}`,
    `BREADTH>=${config.minBreadthLeads}`,
    config.rejectOppositeLabel ? 'NO_OPP_LABEL' : 'ANY_LABEL',
  ].join('/');
  return {
    config,
    name,
    trainRows,
    holdoutRows,
    trainStats: metrics(recordsOf(trainRows)),
    holdoutStats: metrics(recordsOf(holdoutRows)),
  };
}).filter((row) => row.trainStats.closed >= 12 && row.holdoutStats.closed >= 10)
  .sort((a, b) => b.trainStats.wilson - a.trainStats.wilson
    || b.trainStats.episodePf - a.trainStats.episodePf
    || b.trainStats.closed - a.trainStats.closed);

console.log(`\nMarket Direction snapshot coverage · candidate train ${dojiMarketTrain.length}/${dojiNearSweep.filter((row) => row.entryMs < splitMs).length} · holdout ${dojiMarketHoldout.length}/${dojiNearSweep.filter((row) => row.entryMs >= splitMs).length}`);
console.log('\nCandidate + Market Direction configs selected on TRAIN');
console.table(marketEvaluated.slice(0, 30).flatMap((row) => [
  compact(`${row.name} · TRAIN`, row.trainStats),
  compact(`${row.name} · HOLDOUT`, row.holdoutStats),
]));

const marketRobust = marketEvaluated
  .filter((row) => row.trainStats.pf >= 1.2 && row.trainStats.positiveDayRate >= 60)
  .filter((row) => row.holdoutStats.wr >= 75)
  .filter((row) => row.holdoutStats.pf >= 1.2)
  .filter((row) => row.holdoutStats.episodePf >= 1.2)
  .filter((row) => row.holdoutStats.positiveDayRate >= 60)
  .sort((a, b) => b.holdoutStats.wilson - a.holdoutStats.wilson
    || b.holdoutStats.episodePf - a.holdoutStats.episodePf);
console.log('\nCandidate + Market Direction robust survivors');
console.table(marketRobust.slice(0, 30).flatMap((row) => [
  compact(`${row.name} · TRAIN`, row.trainStats),
  compact(`${row.name} · HOLDOUT`, row.holdoutStats),
  compact(`${row.name} · LATEST`, metrics(recordsOf(
    row.holdoutRows.filter((item) => item.day === latestDay),
  ))),
]));

const btcBreadthVariants = [
  ['BTC1H SAME-SIDE', (facts) => facts.btc1hAligned >= 0],
  ['BREADTH LEADS 2/3', (facts) => facts.breadthLeads >= 2],
  ['BTC1H SAME-SIDE + BREADTH 2/3', (facts) => (
    facts.btc1hAligned >= 0 && facts.breadthLeads >= 2
  )],
  ['BTC1H + BREADTH 2/3 + TREND NOT OPPOSITE', (facts) => (
    facts.btc1hAligned >= 0 && facts.breadthLeads >= 2 && !facts.trendOpposite
  )],
  ['BTC1H + BTC6H SAME-SIDE + BREADTH 2/3', (facts) => (
    facts.btc1hAligned >= 0 && facts.btc6hAligned >= 0 && facts.breadthLeads >= 2
  )],
];
console.log('\nNamed BTC × breadth regime variants');
console.table(btcBreadthVariants.flatMap(([name, predicate]) => {
  const rows = dojiNearSweep.filter((row) => {
    const facts = marketFacts(row);
    return facts && predicate(facts);
  });
  return [
    compact(`${name} · ALL`, metrics(recordsOf(rows))),
    compact(`${name} · TRAIN`, metrics(recordsOf(rows.filter((row) => row.entryMs < splitMs)))),
    compact(`${name} · HOLDOUT`, metrics(recordsOf(rows.filter((row) => row.entryMs >= splitMs)))),
    compact(`${name} · LATEST`, metrics(recordsOf(rows.filter((row) => row.day === latestDay)))),
  ];
}));

const runtimeDerived = deriveLiquidComboBtcBreadthSnapshots(storeTrades, marketDirectionByTradeId);
const runtimeMatchedIds = new Set([...runtimeDerived.entries()]
  .filter(([, snapshot]) => snapshot.liquidComboBtcBreadthMatched === true)
  .map(([id]) => id));
const runtimeMatched = observations.filter((row) => runtimeMatchedIds.has(String(row.trade.id)));
console.log('\nRuntime evaluator parity');
console.table([
  compact('RUNTIME ALL', metrics(recordsOf(runtimeMatched))),
  ...['LONG', 'SHORT'].flatMap((side) => {
    const rows = runtimeMatched.filter((row) => upper(row.trade.side) === side);
    return [
      compact(`RUNTIME ${side} · ALL`, metrics(recordsOf(rows))),
      compact(`RUNTIME ${side} · TRAIN`, metrics(recordsOf(rows.filter((row) => row.entryMs < splitMs)))),
      compact(`RUNTIME ${side} · HOLDOUT`, metrics(recordsOf(rows.filter((row) => row.entryMs >= splitMs)))),
      compact(`RUNTIME ${side} · LATEST`, metrics(recordsOf(rows.filter((row) => row.day === latestDay)))),
    ];
  }),
]);

const btcBreadthAligned = dojiNearSweep.filter((row) => {
  const facts = marketFacts(row);
  return facts && facts.btc1hAligned >= 0 && facts.breadthLeads >= 2;
});
const btcBreadthAlignedStats = metrics(recordsOf(btcBreadthAligned));
console.log('\nNamed candidate: LIQ COMBO · BTC-BREADTH ALIGNED PRIME TEST');
console.table([
  compact('ALL CAUSAL', btcBreadthAlignedStats),
  compact(`LAST 14D ${latest14StartDay}..${latestDay}`, metrics(recordsOf(
    btcBreadthAligned.filter((row) => row.day >= latest14StartDay && row.day <= latestDay),
  ))),
  compact('TRAIN', metrics(recordsOf(btcBreadthAligned.filter((row) => row.entryMs < splitMs)))),
  compact('HOLDOUT', metrics(recordsOf(btcBreadthAligned.filter((row) => row.entryMs >= splitMs)))),
  compact(`LATEST ${latestDay}`, metrics(recordsOf(btcBreadthAligned.filter((row) => row.day === latestDay)))),
]);
console.table(btcBreadthAlignedStats.dayRows.map((row) => ({
  day: row.day,
  trades: row.trades,
  avgEpisodeRoe: +row.roe.toFixed(2),
  positive: row.roe > 0,
})));
console.log('\nBTC-breadth aligned fixed-rule split audit');
console.table(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05']
  .flatMap((auditSplitDay) => {
    const auditSplitMs = Date.parse(`${auditSplitDay}T00:00:00+07:00`);
    return [
      compact(`${auditSplitDay} · BEFORE`, metrics(recordsOf(
        btcBreadthAligned.filter((row) => row.entryMs < auditSplitMs),
      ))),
      compact(`${auditSplitDay} · AFTER`, metrics(recordsOf(
        btcBreadthAligned.filter((row) => row.entryMs >= auditSplitMs),
      ))),
    ];
  }));
console.log('\nBTC-breadth aligned by side');
console.table(['LONG', 'SHORT'].flatMap((side) => {
  const rows = btcBreadthAligned.filter((row) => upper(row.trade.side) === side);
  return [
    compact(`${side} · ALL`, metrics(recordsOf(rows))),
    compact(`${side} · HOLDOUT`, metrics(recordsOf(rows.filter((row) => row.entryMs >= splitMs)))),
  ];
}));

const causalStableAll = observations.filter((row) => matches(row, stableConfig));
console.log('\nAll causal-stable combos × BTC/breadth regime');
console.table(btcBreadthVariants.flatMap(([name, predicate]) => {
  const rows = causalStableAll.filter((row) => {
    const facts = marketFacts(row);
    return facts && predicate(facts);
  });
  return [
    compact(`${name} · ALL`, metrics(recordsOf(rows))),
    compact(`${name} · TRAIN`, metrics(recordsOf(rows.filter((row) => row.entryMs < splitMs)))),
    compact(`${name} · HOLDOUT`, metrics(recordsOf(rows.filter((row) => row.entryMs >= splitMs)))),
    compact(`${name} · LATEST`, metrics(recordsOf(rows.filter((row) => row.day === latestDay)))),
  ];
}));
