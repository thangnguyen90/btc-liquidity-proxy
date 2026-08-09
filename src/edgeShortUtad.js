export const EDGE_SHORT_UTAD_VERSION = 'edge-short-utad-observe-v1-20260809';
export const EDGE_SHORT_UTAD_WHITELIST_VERSION = 'edge-short-utad-whitelist-v1-20260809';
export const EDGE_SHORT_UTAD_CONFIRMED_POINT_GAP = 0;
export const EDGE_SHORT_UTAD_PRIME_POINT_GAP = 5;
export const EDGE_SHORT_UTAD_PRIME_MAX_RR = 0.7;

const ROWS = [
  {
    key: 'CONFIRMED',
    label: 'SHORT UTAD CONFIRMED',
    tone: 'GOOD',
  },
  {
    key: 'PRIME_TEST',
    label: 'SHORT UTAD PRIME TEST',
    tone: 'PRIME',
  },
];

const SNAPSHOT_FIELDS = [
  'edgeShortUtadEligible',
  'edgeShortUtadConfirmed',
  'edgeShortUtadPrimeTest',
  'edgeShortUtadKey',
  'edgeShortUtadLabel',
  'edgeShortUtadTone',
  'edgeShortUtadSetup',
  'edgeShortUtadAltCandleDirection',
  'edgeShortUtadBtcCandleDirection',
  'edgeShortUtadLongScore',
  'edgeShortUtadShortScore',
  'edgeShortUtadPointGap',
  'edgeShortUtadRewardRisk',
  'edgeShortUtadReason',
  'edgeShortUtadVersion',
  'edgeShortUtadObservationOnly',
  'edgeShortUtadAffectsEntry',
  'edgeShortUtadAffectsMargin',
  'edgeShortUtadAffectsSl',
  'edgeShortUtadAffectsTp',
  'edgeShortUtadAffectsBinance',
  'edgeShortUtadDerived',
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

function setupOf(trade = {}) {
  const comboSetup = String(trade.pumpCombo ?? '').split('|')[0];
  const labelSetup = String(trade.edgeShortLabelKey ?? '').split('|')[0];
  return normalize(
    trade.edgeShortBestSetup
      || trade.pumpSignalType
      || trade.signalType
      || comboSetup
      || labelSetup,
    'NO_SETUP',
  );
}

function candleDirectionOf(candle = {}) {
  return normalize(candle?.direction, 'NO_DATA');
}

function pointSnapshotOf(trade = {}) {
  const market = trade.marketDirectionAtSignal ?? {};
  const dynamics = market.scoreDynamics ?? {};
  const longScore = finiteNumber(market.scores?.long ?? dynamics.longScore);
  const shortScore = finiteNumber(market.scores?.short ?? dynamics.shortScore);
  return {
    longScore,
    shortScore,
    pointGap: longScore != null && shortScore != null
      ? longScore - shortScore
      : null,
  };
}

function rewardRiskOf(trade = {}) {
  const entry = finiteNumber(trade.entryPrice ?? trade.setupEntry);
  const tp = finiteNumber(trade.tp);
  const sl = finiteNumber(trade.sl);
  if (!(entry > 0) || !(tp > 0) || !(sl > 0)) return null;
  const risk = Math.abs(entry - sl);
  if (!(risk > 0)) return null;
  return Math.abs(tp - entry) / risk;
}

export function edgeShortUtadSnapshot(trade = {}, { derived = false } = {}) {
  const side = normalize(trade.side, 'NO_SIDE');
  const setup = setupOf(trade);
  const altCandleDirection = candleDirectionOf(trade.candlePatternAtEntry);
  const btcCandleDirection = candleDirectionOf(trade.btcCandlePatternAtEntry);
  const { longScore, shortScore, pointGap } = pointSnapshotOf(trade);
  const rewardRisk = rewardRiskOf(trade);
  const eligible = (
    side === 'SHORT'
    && setup === 'BC_UTAD'
    && altCandleDirection === 'BEARISH'
    && btcCandleDirection === 'BEARISH'
    && pointGap != null
  );
  const confirmed = (
    eligible
    && pointGap >= EDGE_SHORT_UTAD_CONFIRMED_POINT_GAP
  );
  const primeTest = (
    confirmed
    && pointGap >= EDGE_SHORT_UTAD_PRIME_POINT_GAP
    && rewardRisk != null
    && rewardRisk < EDGE_SHORT_UTAD_PRIME_MAX_RR
  );
  const key = primeTest ? 'PRIME_TEST' : confirmed ? 'CONFIRMED' : 'N_A';
  const meta = ROWS.find((row) => row.key === key) ?? {
    label: 'SHORT UTAD N/A',
    tone: 'NO_DATA',
  };
  const pointText = pointGap == null
    ? 'point gap NO DATA'
    : `LONG-SHORT gap ${pointGap >= 0 ? '+' : ''}${pointGap.toFixed(0)}`;
  const rrText = rewardRisk == null ? 'RR NO DATA' : `RR ${rewardRisk.toFixed(2)}`;
  return {
    edgeShortUtadEligible: eligible,
    edgeShortUtadConfirmed: confirmed,
    edgeShortUtadPrimeTest: primeTest,
    edgeShortUtadKey: key,
    edgeShortUtadLabel: meta.label,
    edgeShortUtadTone: meta.tone,
    edgeShortUtadSetup: setup,
    edgeShortUtadAltCandleDirection: altCandleDirection,
    edgeShortUtadBtcCandleDirection: btcCandleDirection,
    edgeShortUtadLongScore: longScore,
    edgeShortUtadShortScore: shortScore,
    edgeShortUtadPointGap: pointGap,
    edgeShortUtadRewardRisk: rewardRisk == null ? null : +rewardRisk.toFixed(4),
    edgeShortUtadReason:
      `${side} | ${setup} | ALT ${altCandleDirection} | BTC ${btcCandleDirection}`
      + ` | ${pointText} | ${rrText} -> ${meta.label}`
      + ' | OBSERVE ONLY | no gate/block | no size/entry/SL/TP/Binance change',
    edgeShortUtadVersion: EDGE_SHORT_UTAD_VERSION,
    edgeShortUtadObservationOnly: true,
    edgeShortUtadAffectsEntry: false,
    edgeShortUtadAffectsMargin: false,
    edgeShortUtadAffectsSl: false,
    edgeShortUtadAffectsTp: false,
    edgeShortUtadAffectsBinance: false,
    edgeShortUtadDerived: Boolean(derived),
  };
}

export function decorateEdgeShortUtadSnapshots(trades = []) {
  return trades.map((trade) => {
    const stored = (
      trade.edgeShortUtadVersion === EDGE_SHORT_UTAD_VERSION
      && typeof trade.edgeShortUtadConfirmed === 'boolean'
      && typeof trade.edgeShortUtadPrimeTest === 'boolean'
    );
    return stored
      ? trade
      : {
        ...trade,
        ...edgeShortUtadSnapshot(trade, { derived: true }),
      };
  });
}

export function edgeShortUtadSnapshotForEntry(trade = {}) {
  const snapshot = edgeShortUtadSnapshot(trade, { derived: false });
  return Object.fromEntries(SNAPSHOT_FIELDS.map((field) => [field, snapshot[field]]));
}

function bangkokEntryDay(trade = {}) {
  const at = Date.parse(trade.openedAt ?? trade.createdAt ?? '');
  return Number.isFinite(at)
    ? new Date(at + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10)
    : 'NO_DAY';
}

function emptyRow(meta) {
  return {
    ...meta,
    total: 0,
    active: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    closedPnl: 0,
    activePnl: 0,
    roeTotal: 0,
    grossWin: 0,
    grossLoss: 0,
    pnlByDay: new Map(),
  };
}

function addTrade(row, trade = {}) {
  const pnl = finiteNumber(trade.pnl) ?? 0;
  row.total += 1;
  if (trade.status === 'CLOSED') {
    row.closed += 1;
    row.closedPnl += pnl;
    row.roeTotal += finiteNumber(trade.roe) ?? 0;
    const day = bangkokEntryDay(trade);
    row.pnlByDay.set(day, (row.pnlByDay.get(day) ?? 0) + pnl);
    if (pnl > 0) {
      row.wins += 1;
      row.grossWin += pnl;
    } else if (pnl < 0) {
      row.losses += 1;
      row.grossLoss += Math.abs(pnl);
    } else {
      row.breakeven += 1;
    }
    return;
  }
  if (trade.status === 'PENDING' || trade.status === 'ENTRY_READY') {
    row.pending += 1;
  } else {
    row.active += 1;
  }
  row.activePnl += pnl;
}

export function edgeShortUtadStats(trades = []) {
  const rows = new Map(ROWS.map((meta) => [meta.key, emptyRow(meta)]));
  for (const trade of trades) {
    if (trade.edgeShortUtadConfirmed === true) {
      addTrade(rows.get('CONFIRMED'), trade);
    }
    if (trade.edgeShortUtadPrimeTest === true) {
      addTrade(rows.get('PRIME_TEST'), trade);
    }
  }
  return ROWS.map((meta) => {
    const row = rows.get(meta.key);
    const decisive = row.wins + row.losses;
    const profitFactor = row.grossLoss > 0
      ? row.grossWin / row.grossLoss
      : row.grossWin > 0
        ? 99
        : 0;
    const totalDays = row.pnlByDay.size;
    const positiveDays = [...row.pnlByDay.values()].filter((pnl) => pnl > 0).length;
    return {
      key: meta.key,
      label: meta.label,
      tone: meta.tone,
      total: row.total,
      active: row.active,
      pending: row.pending,
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
      positiveDays,
      totalDays,
      dayTimeZone: 'Asia/Bangkok',
      inclusive: meta.key === 'CONFIRMED',
    };
  });
}
