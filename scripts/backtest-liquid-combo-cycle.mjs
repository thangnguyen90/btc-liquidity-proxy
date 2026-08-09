import { readFile } from 'node:fs/promises';
import { buildLiquidComboCycleStats } from '../src/liquidComboCycleStats.js';

const store = JSON.parse(
  await readFile(new URL('../data/liquid-paper-trades.json', import.meta.url), 'utf8'),
);
const stats = buildLiquidComboCycleStats(store.trades ?? [], {
  stableLimit: 50,
  formingLimit: 50,
});

const compact = (row) => ({
  tier: row.tier,
  combo: row.comboKey,
  cycle: row.cycleLabel,
  closed: row.history.closed,
  episodes: row.history.episodes,
  days: `${row.history.positiveDays}/${row.history.days}`,
  pnl: row.history.pnl,
  avgRoe: row.history.avgRoe,
  pf: row.history.profitFactor,
  recentDays: `${row.recent.positiveDays}/${row.recent.days}`,
  recentPf: row.recent.profitFactor,
  active: row.active,
  activePnl: row.activePnl,
});

console.log(JSON.stringify({
  version: stats.version,
  counts: stats.counts,
  stableGood: stats.stableGood.map(compact),
  formingGood: stats.formingGood.map(compact),
}, null, 2));
