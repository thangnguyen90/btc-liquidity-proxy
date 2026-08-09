export const EDGE_SHORT_LABEL_VERSION = 'edge-short-daily-stable-v2';
export const EDGE_SHORT_LABEL_MIN_SAMPLE = 10;
export const EDGE_SHORT_LABEL_DECISION_SAMPLE = 30;
export const EDGE_SHORT_PRIME_ENTER_AVG_ROE = 2.5;
export const EDGE_SHORT_PRIME_KEEP_AVG_ROE = 1.5;
export const EDGE_SHORT_GOOD_ENTER_AVG_ROE = 0.75;
export const EDGE_SHORT_GOOD_KEEP_AVG_ROE = 0.25;
export const EDGE_SHORT_RISK_ENTER_AVG_ROE = -0.75;

const LABEL_ORDER = ['SE PRIME', 'SE GOOD', 'SE WATCH', 'SE RISK', 'SE NO DATA'];
const RELATIONS = new Set(['DOC_LAP', 'THEO_YEU', 'THUAN_BTC', 'NGUOC_BTC']);

function finiteNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
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

function normalizePart(value, fallback = 'NO_DATA') {
  const text = String(value ?? '').trim().toUpperCase();
  const normalized = text
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function comboParts(trade = {}) {
  return String(trade.pumpCombo ?? trade.edgeCombo ?? '')
    .split('|')
    .map((part) => normalizePart(part, ''))
    .filter(Boolean);
}

function edgeShortSetup(trade = {}, parts = comboParts(trade)) {
  const sourceFallback = String(trade.source ?? 'EDGE')
    .replace(/-\d+(?:\.\d+)?$/i, '');
  return normalizePart(
    trade.pumpSignalType
      ?? trade.signalType
      ?? trade.type
      ?? parts[0]
      ?? sourceFallback,
    'EDGE',
  );
}

function edgeShortSide(trade = {}, parts = comboParts(trade)) {
  const value = normalizePart(trade.side ?? trade.action ?? parts[1], 'SIDE');
  if (value.includes('SHORT')) return 'SHORT';
  if (value.includes('LONG')) return 'LONG';
  return value;
}

function edgeShortTimeframe(trade = {}, parts = comboParts(trade)) {
  return normalizePart(
    trade.pumpSignalTimeframe
      ?? trade.signalTimeframe
      ?? trade.factors?.timeframe
      ?? trade.interval
      ?? parts[2],
    'NO_TF',
  );
}

function edgeShortRelation(trade = {}, parts = comboParts(trade), side = edgeShortSide(trade, parts)) {
  const saved = parts.find((part) => RELATIONS.has(part));
  if (saved) return saved;

  const corr = finiteNumber(trade.btcCorr ?? trade.btcRelation?.corr);
  if (corr == null) return 'REL_NO_DATA';
  if (corr < 0.3) return 'DOC_LAP';
  if (corr < 0.5) return 'THEO_YEU';

  const directionRaw = normalizePart(
    trade.btcHealth?.btcTrendDir
      ?? trade.btcTrendDir
      ?? trade.btcHealth?.regime
      ?? trade.btcRegime,
    '',
  );
  const direction = directionRaw.includes('DOWN')
    ? 'DOWN'
    : directionRaw.includes('UP')
      ? 'UP'
      : null;
  const expected = side === 'SHORT' ? 'DOWN' : side === 'LONG' ? 'UP' : null;
  if (!direction || !expected) return 'REL_NO_DATA';
  return direction === expected ? 'THUAN_BTC' : 'NGUOC_BTC';
}

export function edgeShortLabelGroup(trade = {}) {
  const parts = comboParts(trade);
  const setup = edgeShortSetup(trade, parts);
  const side = edgeShortSide(trade, parts);
  const timeframe = edgeShortTimeframe(trade, parts);
  const relation = edgeShortRelation(trade, parts, side);
  return {
    key: [setup, side, timeframe, relation].join(' | '),
    label: [setup, side, timeframe, relation].join(' · '),
    setup,
    side,
    timeframe,
    relation,
  };
}

export function emptyEdgeShortLabelStats() {
  return {
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    closedPnl: 0,
    roeTotal: 0,
  };
}

export function addEdgeShortClosedTrade(stats, trade) {
  const pnl = finiteNumber(trade?.pnl) ?? 0;
  const roe = finiteNumber(trade?.roe) ?? 0;
  stats.closed += 1;
  stats.closedPnl += pnl;
  stats.roeTotal += roe;
  if (pnl > 0) stats.wins += 1;
  else if (pnl < 0) stats.losses += 1;
  else stats.breakeven += 1;
  return stats;
}

export function edgeShortLabelMetrics(stats = emptyEdgeShortLabelStats()) {
  const decisive = Number(stats.wins ?? 0) + Number(stats.losses ?? 0);
  const closed = Number(stats.closed ?? 0);
  return {
    closed,
    wins: Number(stats.wins ?? 0),
    losses: Number(stats.losses ?? 0),
    breakeven: Number(stats.breakeven ?? 0),
    closedPnl: Number(stats.closedPnl ?? 0),
    wr: decisive > 0 ? (Number(stats.wins ?? 0) / decisive) * 100 : null,
    avgRoe: closed > 0 ? Number(stats.roeTotal ?? 0) / closed : null,
  };
}

export function edgeShortLabelVerdict(stats, relation = 'REL_NO_DATA', previousTier = null) {
  const metrics = Object.prototype.hasOwnProperty.call(stats ?? {}, 'roeTotal')
    ? edgeShortLabelMetrics(stats)
    : stats;
  const priorTier = normalizePart(previousTier, '');
  if (relation === 'REL_NO_DATA' || metrics.closed < EDGE_SHORT_LABEL_MIN_SAMPLE) {
    return { tier: 'NO_DATA', label: 'SE NO DATA', sampleStatus: 'NO_DATA' };
  }
  if (metrics.closed < EDGE_SHORT_LABEL_DECISION_SAMPLE) {
    return { tier: 'WATCH', label: 'SE WATCH', sampleStatus: 'PROVISIONAL' };
  }
  const positivePnl = metrics.closedPnl > 0;
  const negativePnl = metrics.closedPnl < 0;
  const enterPrime = positivePnl
    && metrics.avgRoe >= EDGE_SHORT_PRIME_ENTER_AVG_ROE
    && metrics.wr >= 70;
  const keepPrime = priorTier === 'PRIME'
    && positivePnl
    && metrics.avgRoe >= EDGE_SHORT_PRIME_KEEP_AVG_ROE
    && metrics.wr >= 65;
  if (enterPrime || keepPrime) {
    return { tier: 'PRIME', label: 'SE PRIME', sampleStatus: 'READY' };
  }
  const enterGood = positivePnl && metrics.avgRoe >= EDGE_SHORT_GOOD_ENTER_AVG_ROE;
  const keepGood = priorTier === 'GOOD'
    && positivePnl
    && metrics.avgRoe >= EDGE_SHORT_GOOD_KEEP_AVG_ROE;
  if (enterGood || keepGood) {
    return { tier: 'GOOD', label: 'SE GOOD', sampleStatus: 'READY' };
  }
  const enterRisk = negativePnl && metrics.avgRoe <= EDGE_SHORT_RISK_ENTER_AVG_ROE;
  const keepRisk = priorTier === 'RISK' && negativePnl && metrics.avgRoe < 0;
  if (enterRisk || keepRisk) {
    return { tier: 'RISK', label: 'SE RISK', sampleStatus: 'READY' };
  }
  return { tier: 'WATCH', label: 'SE WATCH', sampleStatus: 'READY' };
}

export function edgeShortLabelSnapshot(
  trade,
  stats = emptyEdgeShortLabelStats(),
  { previousTier = null, frozenDayStartAt = null } = {},
) {
  const group = edgeShortLabelGroup(trade);
  const metrics = edgeShortLabelMetrics(stats);
  const verdict = edgeShortLabelVerdict(metrics, group.relation, previousTier);
  const entryAt = Date.parse(trade?.openedAt ?? trade?.createdAt ?? '') || Date.now();
  const dayStartAt = Number(frozenDayStartAt) || utcDayStart(entryAt);
  const frozenDay = utcDayKey(dayStartAt);
  const wr = metrics.wr == null ? '-' : `${metrics.wr.toFixed(1)}%`;
  const pnl = `${metrics.closedPnl >= 0 ? '+' : ''}${metrics.closedPnl.toFixed(3)}`;
  const avgRoe = metrics.avgRoe == null
    ? '-'
    : `${metrics.avgRoe >= 0 ? '+' : ''}${metrics.avgRoe.toFixed(1)}%`;
  return {
    edgeShortLabelKey: group.key,
    edgeShortLabelGroup: group.label,
    edgeShortLabelTier: verdict.tier,
    edgeShortLabel: verdict.label,
    edgeShortLabelReason:
      `${group.label} · frozen ${frozenDay} UTC from ${metrics.closed} prior-day closed · WR ${wr}`
      + ` · PnL ${pnl} · AvgROE ${avgRoe}`
      + ` · previous ${normalizePart(previousTier, 'NONE')} · HYSTERESIS · OBSERVE ONLY`,
    edgeShortLabelSampleStatus: verdict.sampleStatus,
    edgeShortLabelSamplesBeforeEntry: metrics.closed,
    edgeShortLabelWrBeforeEntry: metrics.wr,
    edgeShortLabelPnlBeforeEntry: metrics.closedPnl,
    edgeShortLabelAvgRoeBeforeEntry: metrics.avgRoe,
    edgeShortLabelFrozenDay: frozenDay,
    edgeShortLabelDayStartAt: dayStartAt,
    edgeShortLabelPreviousTier: normalizePart(previousTier, 'NONE'),
    edgeShortLabelVersion: EDGE_SHORT_LABEL_VERSION,
    edgeShortLabelObservationOnly: true,
  };
}

export function edgeShortLabelStatsBefore(trades, trade, beforeAt) {
  const cutoff = Number(beforeAt) || Date.parse(trade?.openedAt ?? trade?.createdAt ?? '') || Date.now();
  const target = edgeShortLabelGroup(trade);
  const stats = emptyEdgeShortLabelStats();
  for (const prior of trades ?? []) {
    const closedAt = Date.parse(prior?.closedAt ?? '') || 0;
    if (!closedAt || closedAt > cutoff) continue;
    if (edgeShortLabelGroup(prior).key !== target.key) continue;
    addEdgeShortClosedTrade(stats, prior);
  }
  return stats;
}

export function decorateEdgeShortLabelSnapshots(trades = []) {
  const entries = trades
    .map((trade, index) => ({
      trade,
      index,
      openedAt: Date.parse(trade?.openedAt ?? trade?.createdAt ?? '') || 0,
      dayStartAt: utcDayStart(
        Date.parse(trade?.openedAt ?? trade?.createdAt ?? '') || 0,
      ),
    }))
    .sort((left, right) => (
      left.dayStartAt - right.dayStartAt
      || left.openedAt - right.openedAt
    ));
  const closeEvents = trades
    .map((trade) => ({
      trade,
      closedAt: Date.parse(trade?.closedAt ?? '') || 0,
    }))
    .filter((event) => event.closedAt > 0)
    .sort((left, right) => left.closedAt - right.closedAt);
  const statsByGroup = new Map();
  const previousTierByGroup = new Map();
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
        const group = edgeShortLabelGroup(closedTrade);
        const stats = statsByGroup.get(group.key) ?? emptyEdgeShortLabelStats();
        addEdgeShortClosedTrade(stats, closedTrade);
        statsByGroup.set(group.key, stats);
        closeIndex += 1;
      }
    }
    const group = edgeShortLabelGroup(entry.trade);
    if (!snapshotsForDay.has(group.key)) {
      const snapshot = edgeShortLabelSnapshot(
        entry.trade,
        statsByGroup.get(group.key) ?? emptyEdgeShortLabelStats(),
        {
          previousTier: previousTierByGroup.get(group.key) ?? null,
          frozenDayStartAt: activeDayStartAt,
        },
      );
      snapshotsForDay.set(group.key, snapshot);
      previousTierByGroup.set(group.key, snapshot.edgeShortLabelTier);
    }
    const dailySnapshot = snapshotsForDay.get(group.key);
    const hasSnapshot = entry.trade?.edgeShortLabelVersion
      === EDGE_SHORT_LABEL_VERSION
      && entry.trade?.edgeShortLabelKey
      && entry.trade?.edgeShortLabelTier
      && entry.trade?.edgeShortLabel
      && entry.trade?.edgeShortLabelFrozenDay === dailySnapshot.edgeShortLabelFrozenDay;
    if (hasSnapshot) continue;
    decorated[entry.index] = {
      ...entry.trade,
      ...dailySnapshot,
    };
  }
  return decorated;
}

const EDGE_SHORT_SNAPSHOT_FIELDS = [
  'edgeShortLabelKey',
  'edgeShortLabelGroup',
  'edgeShortLabelTier',
  'edgeShortLabel',
  'edgeShortLabelReason',
  'edgeShortLabelSampleStatus',
  'edgeShortLabelSamplesBeforeEntry',
  'edgeShortLabelWrBeforeEntry',
  'edgeShortLabelPnlBeforeEntry',
  'edgeShortLabelAvgRoeBeforeEntry',
  'edgeShortLabelFrozenDay',
  'edgeShortLabelDayStartAt',
  'edgeShortLabelPreviousTier',
  'edgeShortLabelVersion',
  'edgeShortLabelObservationOnly',
];

export function edgeShortLabelSnapshotForEntry(trades, trade, entryAt = Date.now()) {
  const openedAt = new Date(Number(entryAt) || Date.now()).toISOString();
  const candidate = {
    ...trade,
    createdAt: trade?.createdAt ?? openedAt,
    openedAt: trade?.openedAt ?? openedAt,
  };
  const decorated = decorateEdgeShortLabelSnapshots([...(trades ?? []), candidate]);
  const result = decorated[decorated.length - 1] ?? candidate;
  return Object.fromEntries(
    EDGE_SHORT_SNAPSHOT_FIELDS.map((field) => [field, result[field]]),
  );
}

export function edgeShortLabelGroupStats(trades = []) {
  const groups = new Map(LABEL_ORDER.map((label) => [label, {
    label,
    tier: label.replace(/^SE\s+/, '').replace(/\s+/g, '_'),
    total: 0,
    active: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    closedPnl: 0,
    activePnl: 0,
    roeTotal: 0,
  }]));

  for (const trade of trades) {
    const label = LABEL_ORDER.includes(trade?.edgeShortLabel)
      ? trade.edgeShortLabel
      : 'SE NO DATA';
    const row = groups.get(label);
    row.total += 1;
    const pnl = finiteNumber(trade?.pnl) ?? 0;
    if (trade?.status === 'CLOSED') {
      row.closed += 1;
      row.closedPnl += pnl;
      row.roeTotal += finiteNumber(trade?.roe) ?? 0;
      if (pnl > 0) row.wins += 1;
      else if (pnl < 0) row.losses += 1;
      else row.breakeven += 1;
    } else {
      row.active += 1;
      row.activePnl += pnl;
    }
  }

  return [...groups.values()].map((row) => {
    const decisive = row.wins + row.losses;
    return {
      label: row.label,
      tier: row.tier,
      total: row.total,
      active: row.active,
      closed: row.closed,
      wins: row.wins,
      losses: row.losses,
      breakeven: row.breakeven,
      wr: decisive > 0 ? +((row.wins / decisive) * 100).toFixed(1) : null,
      avgRoe: row.closed > 0 ? +(row.roeTotal / row.closed).toFixed(1) : null,
      closedPnl: +row.closedPnl.toFixed(4),
      activePnl: +row.activePnl.toFixed(4),
      totalPnl: +(row.closedPnl + row.activePnl).toFixed(4),
    };
  });
}
