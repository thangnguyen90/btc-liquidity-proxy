export const EDGE_SHORT_BEST_VERSION = 'edge-short-best-candidate-daily-v1';
export const EDGE_SHORT_BEST_MIN_CLOSED = 10;
export const EDGE_SHORT_BEST_MIN_PROFIT_FACTOR = 1.2;
export const EDGE_SHORT_BEST_MIN_AVG_ROE = 1;
export const EDGE_SHORT_BEST_MIN_POSITIVE_DAY_RATE = 0.5;

const BEST_SNAPSHOT_FIELDS = [
  'edgeShortBestSelected',
  'edgeShortBestLabel',
  'edgeShortBestGroupKey',
  'edgeShortBestSetup',
  'edgeShortBestSamplesBeforeDay',
  'edgeShortBestWrBeforeDay',
  'edgeShortBestPnlBeforeDay',
  'edgeShortBestAvgRoeBeforeDay',
  'edgeShortBestProfitFactorBeforeDay',
  'edgeShortBestPositiveDaysBeforeDay',
  'edgeShortBestTotalDaysBeforeDay',
  'edgeShortBestPositiveDayRateBeforeDay',
  'edgeShortBestFrozenDay',
  'edgeShortBestDayStartAt',
  'edgeShortBestReason',
  'edgeShortBestVersion',
  'edgeShortBestObservationOnly',
  'edgeShortBestAffectsEntry',
  'edgeShortBestAffectsMargin',
  'edgeShortBestAffectsSl',
  'edgeShortBestAffectsTp',
  'edgeShortBestDerived',
];

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value, fallback = 'NO_DATA') {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function utcDayStart(value) {
  const at = Number(value);
  if (!Number.isFinite(at) || at <= 0) return 0;
  const date = new Date(at);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function utcDayKey(value) {
  const start = utcDayStart(value);
  return start > 0 ? new Date(start).toISOString().slice(0, 10) : 'NO_DAY';
}

function entryAt(trade = {}) {
  return Date.parse(trade.openedAt ?? trade.createdAt ?? '') || 0;
}

function setupOf(trade = {}) {
  const labelKeySetup = String(trade.edgeShortLabelKey ?? '').split('|')[0];
  const sourceFallback = String(trade.source ?? 'EDGE')
    .replace(/-\d+(?:\.\d+)?(?:-|$).*/i, '');
  return normalize(
    trade.pumpSignalType
      ?? trade.signalType
      ?? trade.type
      ?? labelKeySetup
      ?? sourceFallback,
    'EDGE',
  );
}

function groupOf(trade = {}) {
  const tier = normalize(trade.edgeShortTier, 'BLOCK');
  const setup = setupOf(trade);
  return {
    tier,
    setup,
    key: `${tier} | ${setup}`,
  };
}

function emptyStats() {
  return {
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    pnl: 0,
    roeTotal: 0,
    grossWin: 0,
    grossLoss: 0,
    pnlByDay: new Map(),
  };
}

function addClosedTrade(stats, trade) {
  const pnl = finiteNumber(trade.pnl) ?? 0;
  const roe = finiteNumber(trade.roe) ?? 0;
  const day = utcDayKey(entryAt(trade));
  stats.closed += 1;
  stats.pnl += pnl;
  stats.roeTotal += roe;
  stats.pnlByDay.set(day, (stats.pnlByDay.get(day) ?? 0) + pnl);
  if (pnl > 0) {
    stats.wins += 1;
    stats.grossWin += pnl;
  } else if (pnl < 0) {
    stats.losses += 1;
    stats.grossLoss += Math.abs(pnl);
  } else {
    stats.breakeven += 1;
  }
  return stats;
}

function metricsOf(stats = emptyStats()) {
  const decisive = stats.wins + stats.losses;
  const totalDays = stats.pnlByDay.size;
  const positiveDays = [...stats.pnlByDay.values()].filter((pnl) => pnl > 0).length;
  const profitFactor = stats.grossLoss > 0
    ? stats.grossWin / stats.grossLoss
    : stats.grossWin > 0
      ? 99
      : 0;
  return {
    closed: stats.closed,
    wins: stats.wins,
    losses: stats.losses,
    breakeven: stats.breakeven,
    wr: decisive > 0 ? (stats.wins / decisive) * 100 : null,
    pnl: stats.pnl,
    avgRoe: stats.closed > 0 ? stats.roeTotal / stats.closed : null,
    profitFactor,
    positiveDays,
    totalDays,
    positiveDayRate: totalDays > 0 ? positiveDays / totalDays : 0,
  };
}

function qualifies(group, metrics) {
  return ['A', 'B'].includes(group.tier)
    && metrics.closed >= EDGE_SHORT_BEST_MIN_CLOSED
    && metrics.pnl > 0
    && Number(metrics.avgRoe ?? 0) >= EDGE_SHORT_BEST_MIN_AVG_ROE
    && metrics.profitFactor >= EDGE_SHORT_BEST_MIN_PROFIT_FACTOR
    && metrics.positiveDayRate >= EDGE_SHORT_BEST_MIN_POSITIVE_DAY_RATE;
}

function bestSnapshot(trade, stats, dayStartAt, { derived = false } = {}) {
  const group = groupOf(trade);
  const metrics = metricsOf(stats);
  const selected = qualifies(group, metrics);
  const frozenDay = utcDayKey(dayStartAt);
  const wr = metrics.wr == null ? '-' : `${metrics.wr.toFixed(1)}%`;
  const avgRoe = metrics.avgRoe == null
    ? '-'
    : `${metrics.avgRoe >= 0 ? '+' : ''}${metrics.avgRoe.toFixed(1)}%`;
  const pnl = `${metrics.pnl >= 0 ? '+' : ''}${metrics.pnl.toFixed(3)}`;
  return {
    edgeShortBestSelected: selected,
    edgeShortBestLabel: selected ? 'SE BEST' : 'SE BEST WATCH',
    edgeShortBestGroupKey: group.key,
    edgeShortBestSetup: group.setup,
    edgeShortBestSamplesBeforeDay: metrics.closed,
    edgeShortBestWrBeforeDay: metrics.wr,
    edgeShortBestPnlBeforeDay: metrics.pnl,
    edgeShortBestAvgRoeBeforeDay: metrics.avgRoe,
    edgeShortBestProfitFactorBeforeDay: metrics.profitFactor,
    edgeShortBestPositiveDaysBeforeDay: metrics.positiveDays,
    edgeShortBestTotalDaysBeforeDay: metrics.totalDays,
    edgeShortBestPositiveDayRateBeforeDay: metrics.positiveDayRate,
    edgeShortBestFrozenDay: frozenDay,
    edgeShortBestDayStartAt: dayStartAt,
    edgeShortBestReason:
      `${group.key} · frozen ${frozenDay} UTC from prior-day closed only`
      + ` · n=${metrics.closed} · WR ${wr} · PnL ${pnl}`
      + ` · AvgROE ${avgRoe} · PF ${metrics.profitFactor.toFixed(2)}`
      + ` · positive days ${metrics.positiveDays}/${metrics.totalDays}`
      + ` · ${selected ? 'SELECTED' : 'NOT SELECTED'}`
      + ' · OBSERVE ONLY · không gate/chặn lệnh · không đổi size/entry/SL/TP',
    edgeShortBestVersion: EDGE_SHORT_BEST_VERSION,
    edgeShortBestObservationOnly: true,
    edgeShortBestAffectsEntry: false,
    edgeShortBestAffectsMargin: false,
    edgeShortBestAffectsSl: false,
    edgeShortBestAffectsTp: false,
    edgeShortBestDerived: Boolean(derived),
  };
}

export function decorateEdgeShortBestSnapshots(trades = []) {
  const entries = trades
    .map((trade, index) => ({
      trade,
      index,
      entryAt: entryAt(trade),
      dayStartAt: utcDayStart(entryAt(trade)),
    }))
    .sort((left, right) => (
      left.dayStartAt - right.dayStartAt
      || left.entryAt - right.entryAt
    ));
  const closeEvents = trades
    .map((trade) => ({
      trade,
      closedAt: Date.parse(trade.closedAt ?? '') || 0,
    }))
    .filter((event) => event.closedAt > 0)
    .sort((left, right) => left.closedAt - right.closedAt);
  const statsByGroup = new Map();
  const decorated = [...trades];
  let closeIndex = 0;
  let activeDayStartAt = null;
  let snapshotsForDay = new Map();

  for (const entry of entries) {
    if (entry.dayStartAt !== activeDayStartAt) {
      activeDayStartAt = entry.dayStartAt;
      snapshotsForDay = new Map();
      while (
        closeIndex < closeEvents.length
        && closeEvents[closeIndex].closedAt <= activeDayStartAt
      ) {
        const closedTrade = closeEvents[closeIndex].trade;
        const group = groupOf(closedTrade);
        const stats = statsByGroup.get(group.key) ?? emptyStats();
        addClosedTrade(stats, closedTrade);
        statsByGroup.set(group.key, stats);
        closeIndex += 1;
      }
    }
    const group = groupOf(entry.trade);
    if (!snapshotsForDay.has(group.key)) {
      snapshotsForDay.set(
        group.key,
        bestSnapshot(
          entry.trade,
          statsByGroup.get(group.key) ?? emptyStats(),
          activeDayStartAt,
          { derived: true },
        ),
      );
    }
    const dailySnapshot = snapshotsForDay.get(group.key);
    const hasStoredSnapshot = entry.trade.edgeShortBestVersion === EDGE_SHORT_BEST_VERSION
      && typeof entry.trade.edgeShortBestSelected === 'boolean'
      && entry.trade.edgeShortBestFrozenDay === dailySnapshot.edgeShortBestFrozenDay;
    if (hasStoredSnapshot) continue;
    decorated[entry.index] = {
      ...entry.trade,
      ...dailySnapshot,
    };
  }
  return decorated;
}

export function edgeShortBestSnapshotForEntry(trades, trade, at = Date.now()) {
  const openedAt = new Date(Number(at) || Date.now()).toISOString();
  const candidate = {
    ...trade,
    createdAt: trade.createdAt ?? openedAt,
    openedAt: trade.openedAt ?? openedAt,
  };
  const decorated = decorateEdgeShortBestSnapshots([...(trades ?? []), candidate]);
  const result = decorated[decorated.length - 1] ?? candidate;
  return Object.fromEntries(
    BEST_SNAPSHOT_FIELDS.map((field) => [
      field,
      field === 'edgeShortBestDerived' ? false : result[field],
    ]),
  );
}

export function edgeShortBestStats(trades = []) {
  const specs = [
    {
      key: 'BEST',
      label: 'SE BEST',
      match: (trade) => (
        ['A', 'B'].includes(normalize(trade.edgeShortTier, 'BLOCK'))
        && trade.edgeShortBestSelected === true
      ),
    },
    {
      key: 'A_B_REMAINING',
      label: 'A/B REMAINING',
      match: (trade) => (
        ['A', 'B'].includes(normalize(trade.edgeShortTier, 'BLOCK'))
        && trade.edgeShortBestSelected !== true
      ),
    },
  ];
  return specs.map(({ key, label, match }) => {
    const rows = trades.filter(match);
    const closed = rows.filter((trade) => trade.status === 'CLOSED');
    const active = rows.filter((trade) => trade.status !== 'CLOSED');
    const stats = emptyStats();
    for (const trade of closed) addClosedTrade(stats, trade);
    const metrics = metricsOf(stats);
    const activePnl = active.reduce(
      (sum, trade) => sum + (finiteNumber(trade.pnl) ?? 0),
      0,
    );
    return {
      key,
      label,
      total: rows.length,
      active: active.length,
      closed: metrics.closed,
      wins: metrics.wins,
      losses: metrics.losses,
      breakeven: metrics.breakeven,
      wr: metrics.wr == null ? null : +metrics.wr.toFixed(1),
      avgRoe: metrics.avgRoe == null ? null : +metrics.avgRoe.toFixed(1),
      profitFactor: +metrics.profitFactor.toFixed(2),
      closedPnl: +metrics.pnl.toFixed(4),
      activePnl: +activePnl.toFixed(4),
      totalPnl: +(metrics.pnl + activePnl).toFixed(4),
      positiveDays: metrics.positiveDays,
      totalDays: metrics.totalDays,
    };
  });
}
