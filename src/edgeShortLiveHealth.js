export const EDGE_SHORT_LIVE_VERSION = 'edge-short-live-health-v1';
export const EDGE_SHORT_LIVE_WINDOW = 12;
export const EDGE_SHORT_LIVE_MIN_CLOSED = 8;

const LIVE_TIERS = ['HOT', 'OK', 'WATCH', 'COOL', 'NEW'];
const LIVE_SNAPSHOT_FIELDS = [
  'edgeShortLiveEligible',
  'edgeShortLiveTier',
  'edgeShortLiveLabel',
  'edgeShortLiveGroupKey',
  'edgeShortLiveScope',
  'edgeShortLiveSetup',
  'edgeShortLiveSide',
  'edgeShortLiveBtcPhase',
  'edgeShortLiveSamplesBeforeEntry',
  'edgeShortLiveWrBeforeEntry',
  'edgeShortLivePnlBeforeEntry',
  'edgeShortLiveAvgRoeBeforeEntry',
  'edgeShortLiveProfitFactorBeforeEntry',
  'edgeShortLiveSnapshotAt',
  'edgeShortLiveLatestClosedAt',
  'edgeShortLiveOldestClosedAt',
  'edgeShortLiveReason',
  'edgeShortLiveVersion',
  'edgeShortLiveObservationOnly',
  'edgeShortLiveAffectsEntry',
  'edgeShortLiveAffectsMargin',
  'edgeShortLiveAffectsSl',
  'edgeShortLiveAffectsTp',
  'edgeShortLiveDerived',
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

function entryAt(trade = {}) {
  return Date.parse(trade.openedAt ?? trade.createdAt ?? '') || 0;
}

function closedAt(trade = {}) {
  return Date.parse(trade.closedAt ?? '') || 0;
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

function sideOf(trade = {}) {
  return normalize(trade.side, 'NO_SIDE');
}

function btcPhaseOf(trade = {}) {
  const health = trade.btcHealth ?? {};
  const direction = normalize(
    health.btcTrendDir ?? trade.btcTrendDir,
    'NO_DIR',
  );
  const score = finiteNumber(health.btcTrendScore ?? trade.btcTrendScore);
  const strength = score == null
    ? 'NO_SCORE'
    : score < 45
      ? 'WEAK'
      : score < 65
        ? 'MID'
        : 'STRONG';
  return `${direction}_${strength}`;
}

function baseGroupKey(trade = {}) {
  return `${setupOf(trade)} | ${sideOf(trade)}`;
}

function phaseGroupKey(trade = {}) {
  return `${baseGroupKey(trade)} | ${btcPhaseOf(trade)}`;
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
  };
}

function addClosedTrade(stats, trade) {
  const pnl = finiteNumber(trade.pnl) ?? 0;
  const roe = finiteNumber(trade.roe) ?? 0;
  stats.closed += 1;
  stats.pnl += pnl;
  stats.roeTotal += roe;
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

function metricsOf(rows = []) {
  const stats = emptyStats();
  for (const trade of rows) addClosedTrade(stats, trade);
  const decisive = stats.wins + stats.losses;
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
  };
}

function liveTier(metrics) {
  if (metrics.closed < EDGE_SHORT_LIVE_MIN_CLOSED) return 'NEW';
  if (
    Number(metrics.avgRoe ?? 0) >= 4
    && metrics.profitFactor >= 1.5
  ) {
    return 'HOT';
  }
  if (
    Number(metrics.avgRoe ?? 0) >= 1
    && metrics.profitFactor >= 1.2
  ) {
    return 'OK';
  }
  if (
    Number(metrics.avgRoe ?? 0) < 0
    || metrics.profitFactor < 0.9
  ) {
    return 'COOL';
  }
  return 'WATCH';
}

function snapshotFromRows(
  trade,
  rows,
  at,
  {
    scope,
    groupKey,
    derived = false,
  },
) {
  const eligible = trade.edgeShortBestSelected === true;
  const metrics = metricsOf(rows);
  const tier = eligible ? liveTier(metrics) : 'N_A';
  const newest = rows[0] ?? null;
  const oldest = rows[rows.length - 1] ?? null;
  const wr = metrics.wr == null ? '-' : `${metrics.wr.toFixed(1)}%`;
  const avgRoe = metrics.avgRoe == null
    ? '-'
    : `${metrics.avgRoe >= 0 ? '+' : ''}${metrics.avgRoe.toFixed(1)}%`;
  const pnl = `${metrics.pnl >= 0 ? '+' : ''}${metrics.pnl.toFixed(3)}`;
  const reason = eligible
    ? `${groupKey} · ${scope} · latest ${EDGE_SHORT_LIVE_WINDOW} closed strictly before entry`
      + ` · n=${metrics.closed} · WR ${wr} · PnL ${pnl}`
      + ` · AvgROE ${avgRoe} · PF ${metrics.profitFactor.toFixed(2)}`
      + ` · SE LIVE ${tier}`
      + ' · OBSERVE ONLY · không gate/chặn lệnh · không đổi size/entry/SL/TP'
    : 'Ngoài SE BEST · Lớp 4 không đánh giá'
      + ' · OBSERVE ONLY · không gate/chặn lệnh · không đổi size/entry/SL/TP';
  return {
    edgeShortLiveEligible: eligible,
    edgeShortLiveTier: tier,
    edgeShortLiveLabel: eligible ? `SE LIVE ${tier}` : 'SE LIVE N/A',
    edgeShortLiveGroupKey: groupKey,
    edgeShortLiveScope: scope,
    edgeShortLiveSetup: setupOf(trade),
    edgeShortLiveSide: sideOf(trade),
    edgeShortLiveBtcPhase: btcPhaseOf(trade),
    edgeShortLiveSamplesBeforeEntry: metrics.closed,
    edgeShortLiveWrBeforeEntry: metrics.wr,
    edgeShortLivePnlBeforeEntry: metrics.pnl,
    edgeShortLiveAvgRoeBeforeEntry: metrics.avgRoe,
    edgeShortLiveProfitFactorBeforeEntry: metrics.profitFactor,
    edgeShortLiveSnapshotAt: at > 0 ? new Date(at).toISOString() : null,
    edgeShortLiveLatestClosedAt: newest?.closedAt ?? null,
    edgeShortLiveOldestClosedAt: oldest?.closedAt ?? null,
    edgeShortLiveReason: reason,
    edgeShortLiveVersion: EDGE_SHORT_LIVE_VERSION,
    edgeShortLiveObservationOnly: true,
    edgeShortLiveAffectsEntry: false,
    edgeShortLiveAffectsMargin: false,
    edgeShortLiveAffectsSl: false,
    edgeShortLiveAffectsTp: false,
    edgeShortLiveDerived: Boolean(derived),
  };
}

function addHistoryTrade(history, trade) {
  if (
    trade.status !== 'CLOSED'
    || !['A', 'B'].includes(normalize(trade.edgeShortTier, 'BLOCK'))
  ) {
    return;
  }
  const baseKey = baseGroupKey(trade);
  const phaseKey = phaseGroupKey(trade);
  const baseRows = history.base.get(baseKey) ?? [];
  const phaseRows = history.phase.get(phaseKey) ?? [];
  baseRows.push(trade);
  phaseRows.push(trade);
  history.base.set(baseKey, baseRows);
  history.phase.set(phaseKey, phaseRows);
}

function rowsForSnapshot(history, trade) {
  const phaseKey = phaseGroupKey(trade);
  const baseKey = baseGroupKey(trade);
  const phaseRows = history.phase.get(phaseKey) ?? [];
  const baseRows = history.base.get(baseKey) ?? [];
  if (phaseRows.length >= EDGE_SHORT_LIVE_MIN_CLOSED) {
    return {
      rows: phaseRows.slice(-EDGE_SHORT_LIVE_WINDOW).reverse(),
      scope: 'SETUP_SIDE_BTC_PHASE',
      groupKey: phaseKey,
    };
  }
  return {
    rows: baseRows.slice(-EDGE_SHORT_LIVE_WINDOW).reverse(),
    scope: 'SETUP_SIDE',
    groupKey: baseKey,
  };
}

export function decorateEdgeShortLiveSnapshots(trades = []) {
  const entries = trades
    .map((trade, index) => ({
      trade,
      index,
      entryAt: entryAt(trade),
    }))
    .sort((left, right) => left.entryAt - right.entryAt);
  const closeEvents = trades
    .map((trade) => ({ trade, closedAt: closedAt(trade) }))
    .filter((event) => event.closedAt > 0)
    .sort((left, right) => left.closedAt - right.closedAt);
  const history = { base: new Map(), phase: new Map() };
  const decorated = [...trades];
  let closeIndex = 0;

  for (const entry of entries) {
    while (
      closeIndex < closeEvents.length
      && closeEvents[closeIndex].closedAt < entry.entryAt
    ) {
      addHistoryTrade(history, closeEvents[closeIndex].trade);
      closeIndex += 1;
    }
    const selection = rowsForSnapshot(history, entry.trade);
    const derivedSnapshot = snapshotFromRows(
      entry.trade,
      selection.rows,
      entry.entryAt,
      {
        scope: selection.scope,
        groupKey: selection.groupKey,
        derived: true,
      },
    );
    const hasStoredSnapshot = entry.trade.edgeShortLiveVersion === EDGE_SHORT_LIVE_VERSION
      && (
        LIVE_TIERS.includes(entry.trade.edgeShortLiveTier)
        || entry.trade.edgeShortLiveTier === 'N_A'
      )
      && entry.trade.edgeShortLiveSnapshotAt;
    if (hasStoredSnapshot) continue;
    decorated[entry.index] = {
      ...entry.trade,
      ...derivedSnapshot,
    };
  }
  return decorated;
}

export function edgeShortLiveSnapshotForEntry(trades, trade, at = Date.now()) {
  const snapshotAt = Number(at) || Date.now();
  const openedAt = new Date(snapshotAt).toISOString();
  const candidate = {
    ...trade,
    createdAt: trade.createdAt ?? openedAt,
    openedAt: trade.openedAt ?? openedAt,
  };
  const decorated = decorateEdgeShortLiveSnapshots([...(trades ?? []), candidate]);
  const result = decorated[decorated.length - 1] ?? candidate;
  return Object.fromEntries(
    LIVE_SNAPSHOT_FIELDS.map((field) => [
      field,
      field === 'edgeShortLiveDerived' ? false : result[field],
    ]),
  );
}

export function edgeShortLiveStats(trades = []) {
  return LIVE_TIERS.map((tier) => {
    const rows = trades.filter((trade) => (
      trade.edgeShortLiveEligible === true
      && trade.edgeShortLiveTier === tier
    ));
    const closed = rows.filter((trade) => trade.status === 'CLOSED');
    const active = rows.filter((trade) => trade.status !== 'CLOSED');
    const metrics = metricsOf(closed);
    const activePnl = active.reduce(
      (sum, trade) => sum + (finiteNumber(trade.pnl) ?? 0),
      0,
    );
    return {
      key: tier,
      tier,
      label: `SE LIVE ${tier}`,
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
    };
  });
}
