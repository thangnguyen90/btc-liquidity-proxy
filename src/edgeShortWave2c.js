import { edgeShortWave2bSnapshot } from './edgeShortWave2b.js';

export const EDGE_SHORT_WAVE_2C_VERSION = 'edge-short-wave-2c-ab-observe-v1';

const COHORT_ORDER = [
  'SHORT_TRANSITION',
  'SHORT_COUNTER_ACTIVE',
  'SHORT_COUNTER_EXHAUSTED',
  'SHORT_ALIGNED_ACTIVE',
  'SHORT_ALIGNED_EXHAUSTED',
  'LONG_TRANSITION',
  'LONG_COUNTER_ACTIVE',
  'LONG_COUNTER_EXHAUSTED',
  'LONG_ALIGNED_ACTIVE',
  'LONG_ALIGNED_EXHAUSTED',
  'WAVE_NO_DATA',
];

const COHORT_LABELS = {
  SHORT_TRANSITION: 'SHORT · BTC TRANSITION',
  SHORT_COUNTER_ACTIVE: 'SHORT · BTC DRIVE COUNTER',
  SHORT_COUNTER_EXHAUSTED: 'SHORT · BTC EXHAUSTED COUNTER',
  SHORT_ALIGNED_ACTIVE: 'SHORT · BTC DRIVE ALIGNED',
  SHORT_ALIGNED_EXHAUSTED: 'SHORT · BTC EXHAUSTED ALIGNED',
  LONG_TRANSITION: 'LONG · BTC TRANSITION',
  LONG_COUNTER_ACTIVE: 'LONG · BTC DRIVE COUNTER',
  LONG_COUNTER_EXHAUSTED: 'LONG · BTC EXHAUSTED COUNTER',
  LONG_ALIGNED_ACTIVE: 'LONG · BTC DRIVE ALIGNED',
  LONG_ALIGNED_EXHAUSTED: 'LONG · BTC EXHAUSTED ALIGNED',
  WAVE_NO_DATA: 'BTC WAVE · NO DATA',
};

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value) {
  return String(value ?? '').trim().toUpperCase();
}

function tierOf(trade = {}) {
  const tier = normalize(trade.edgeShortTier);
  return ['A', 'B'].includes(tier) ? tier : 'N_A';
}

function wave2bOf(trade = {}) {
  const storedKey = normalize(trade.edgeShortWave2bKey);
  if (COHORT_ORDER.includes(storedKey)) {
    return {
      key: storedKey,
      label: trade.edgeShortWave2bLabel ?? COHORT_LABELS[storedKey],
      reason: trade.edgeShortWave2bReason ?? null,
    };
  }
  const derived = edgeShortWave2bSnapshot(trade, { derived: true });
  return {
    key: COHORT_ORDER.includes(derived.edgeShortWave2bKey)
      ? derived.edgeShortWave2bKey
      : 'WAVE_NO_DATA',
    label: derived.edgeShortWave2bLabel,
    reason: derived.edgeShortWave2bReason,
  };
}

function toneOf(tier, cohort) {
  if (cohort === 'WAVE_NO_DATA') return 'NO_DATA';
  if (cohort === 'SHORT_TRANSITION') return 'GOOD';
  if (cohort === 'SHORT_ALIGNED_ACTIVE') return tier === 'A' ? 'GOOD' : 'WATCH';
  if (cohort === 'SHORT_ALIGNED_EXHAUSTED') return tier === 'A' ? 'GOOD' : 'WATCH';
  if (cohort === 'SHORT_COUNTER_ACTIVE' || cohort === 'SHORT_COUNTER_EXHAUSTED') return 'WATCH';
  if (cohort === 'LONG_TRANSITION') return 'WATCH';
  if (cohort === 'LONG_COUNTER_EXHAUSTED') return 'WATCH';
  return 'RISK';
}

export function edgeShortWave2cSnapshot(trade = {}, { derived = false } = {}) {
  const tier = tierOf(trade);
  const wave = wave2bOf(trade);
  const eligible = ['A', 'B'].includes(tier);
  const key = eligible ? `${tier}_${wave.key}` : 'N_A';
  const cohortLabel = COHORT_LABELS[wave.key] ?? COHORT_LABELS.WAVE_NO_DATA;
  const label = eligible ? `2C ${tier} · ${cohortLabel}` : '2C TIER A/B · N/A';
  const tone = eligible ? toneOf(tier, wave.key) : 'NO_DATA';
  return {
    edgeShortWave2cEligible: eligible,
    edgeShortWave2cKey: key,
    edgeShortWave2cCohortKey: wave.key,
    edgeShortWave2cLabel: label,
    edgeShortWave2cTone: tone,
    edgeShortWave2cTier: tier,
    edgeShortWave2cWave2bKey: wave.key,
    edgeShortWave2cReason: eligible
      ? `TIER ${tier} × ${cohortLabel} -> ${label}`
        + ' | snapshot before entry | OBSERVE ONLY | no gate/block | no size/entry/SL/TP change'
      : 'Ngoài Tier A/B -> L2C N/A | OBSERVE ONLY',
    edgeShortWave2cVersion: EDGE_SHORT_WAVE_2C_VERSION,
    edgeShortWave2cObservationOnly: true,
    edgeShortWave2cAffectsEntry: false,
    edgeShortWave2cAffectsMargin: false,
    edgeShortWave2cAffectsSl: false,
    edgeShortWave2cAffectsTp: false,
    edgeShortWave2cDerived: Boolean(derived),
  };
}

export function decorateEdgeShortWave2cSnapshots(trades = []) {
  return trades.map((trade) => {
    const tier = tierOf(trade);
    const validKey = trade?.edgeShortWave2cKey === 'N_A'
      || new RegExp(`^${tier}_(?:${COHORT_ORDER.join('|')})$`).test(
        String(trade?.edgeShortWave2cKey ?? ''),
      );
    const hasStoredSnapshot = trade?.edgeShortWave2cVersion === EDGE_SHORT_WAVE_2C_VERSION
      && validKey;
    return hasStoredSnapshot
      ? trade
      : { ...trade, ...edgeShortWave2cSnapshot(trade, { derived: true }) };
  });
}

function bangkokDayOf(trade = {}) {
  const parsed = Date.parse(trade.openedAt ?? trade.createdAt ?? '');
  if (!Number.isFinite(parsed)) return 'NO_DAY';
  return new Date(parsed + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function emptyStats({ key, label, tone, tier = 'A+B', cohortKey }) {
  return {
    key,
    label,
    tone,
    tier,
    cohortKey,
    total: 0,
    active: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    closedPnl: 0,
    activePnl: 0,
    roeTotal: 0,
    grossWin: 0,
    grossLoss: 0,
    days: new Map(),
  };
}

function addTrade(row, trade) {
  const pnl = finiteNumber(trade?.pnl) ?? 0;
  row.total += 1;
  if (trade?.status === 'CLOSED') {
    row.closed += 1;
    row.closedPnl += pnl;
    row.roeTotal += finiteNumber(trade?.roe) ?? 0;
    if (pnl > 0) {
      row.wins += 1;
      row.grossWin += pnl;
    } else if (pnl < 0) {
      row.losses += 1;
      row.grossLoss += Math.abs(pnl);
    } else {
      row.breakeven += 1;
    }
    const day = bangkokDayOf(trade);
    row.days.set(day, (row.days.get(day) ?? 0) + pnl);
  } else {
    row.active += 1;
    row.activePnl += pnl;
  }
}

function finalize(row) {
  const decisive = row.wins + row.losses;
  const profitFactor = row.grossLoss > 0
    ? row.grossWin / row.grossLoss
    : row.grossWin > 0
      ? 9.99
      : 0;
  const dayValues = [...row.days.values()];
  return {
    key: row.key,
    label: row.label,
    tone: row.tone,
    tier: row.tier,
    cohortKey: row.cohortKey,
    total: row.total,
    active: row.active,
    closed: row.closed,
    wins: row.wins,
    losses: row.losses,
    breakeven: row.breakeven,
    wr: decisive > 0 ? +((row.wins / decisive) * 100).toFixed(1) : null,
    avgRoe: row.closed > 0 ? +(row.roeTotal / row.closed).toFixed(1) : null,
    profitFactor: +profitFactor.toFixed(2),
    closedPnl: +row.closedPnl.toFixed(4),
    activePnl: +row.activePnl.toFixed(4),
    totalPnl: +(row.closedPnl + row.activePnl).toFixed(4),
    positiveDays: dayValues.filter((value) => value > 0).length,
    negativeDays: dayValues.filter((value) => value < 0).length,
    totalDays: dayValues.length,
  };
}

function aggregateTone(cohort) {
  if (cohort === 'WAVE_NO_DATA') return 'NO_DATA';
  if (['SHORT_TRANSITION', 'SHORT_ALIGNED_ACTIVE'].includes(cohort)) return 'GOOD';
  if (['SHORT_ALIGNED_EXHAUSTED', 'SHORT_COUNTER_ACTIVE', 'SHORT_COUNTER_EXHAUSTED',
    'LONG_TRANSITION', 'LONG_COUNTER_EXHAUSTED'].includes(cohort)) return 'WATCH';
  return 'RISK';
}

export function edgeShortWave2cStats(trades = []) {
  const aggregateRows = new Map(COHORT_ORDER.map((cohortKey) => [cohortKey, emptyStats({
    key: cohortKey,
    label: `2C A+B · ${COHORT_LABELS[cohortKey]}`,
    tone: aggregateTone(cohortKey),
    cohortKey,
  })]));
  const tierRows = new Map();

  for (const trade of trades) {
    if (trade?.edgeShortWave2cEligible !== true) continue;
    const tier = ['A', 'B'].includes(trade?.edgeShortWave2cTier)
      ? trade.edgeShortWave2cTier
      : tierOf(trade);
    const cohortKey = COHORT_ORDER.includes(trade?.edgeShortWave2cCohortKey)
      ? trade.edgeShortWave2cCohortKey
      : 'WAVE_NO_DATA';
    addTrade(aggregateRows.get(cohortKey), trade);
    const key = `${tier}_${cohortKey}`;
    if (!tierRows.has(key)) {
      tierRows.set(key, emptyStats({
        key,
        label: `2C ${tier} · ${COHORT_LABELS[cohortKey]}`,
        tone: toneOf(tier, cohortKey),
        tier,
        cohortKey,
      }));
    }
    addTrade(tierRows.get(key), trade);
  }

  return {
    aggregate: COHORT_ORDER
      .filter((cohortKey) => aggregateRows.get(cohortKey).total > 0)
      .map((cohortKey) => finalize(aggregateRows.get(cohortKey))),
    byTier: [...tierRows.values()]
      .map(finalize)
      .sort((a, b) => a.tier.localeCompare(b.tier)
        || COHORT_ORDER.indexOf(a.cohortKey) - COHORT_ORDER.indexOf(b.cohortKey)),
  };
}
