import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputFile = path.join(rootDir, 'data', 'edge-paper-trades.json');
const fromDay = process.argv[2] || '2026-07-26';
const toDay = process.argv[3] || '2026-08-01';
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const startAt = Date.parse(`${fromDay}T00:00:00+07:00`);
const endAt = Date.parse(`${toDay}T00:00:00+07:00`) + DAY_MS;

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function upper(value) {
  return String(value ?? '').trim().toUpperCase();
}

function entryMs(trade = {}) {
  const parsed = Date.parse(trade.openedAt ?? trade.createdAt ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function bangkokDay(trade = {}) {
  const value = entryMs(trade);
  return value > 0
    ? new Date(value + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)
    : 'NO_DAY';
}

function pnlOf(trade = {}) {
  return finite(trade.netPnl ?? trade.pnl) ?? 0;
}

function roeOf(trade = {}) {
  return finite(trade.netRoe ?? trade.roe) ?? 0;
}

function directionStructure(trade = {}) {
  const health = trade.btcHealth ?? {};
  const direction = upper(health.btcTrendDir ?? trade.btcTrendDir);
  const emaTrend = upper(health.emaTrend1h);
  const marketRegime = upper(health.marketRegime);
  const legacyRegime = upper(health.regime);
  const regime = marketRegime || legacyRegime;
  const directionalRegime = direction === 'DOWN'
    ? ['DOWN', 'WEAK_DOWN', 'SIDEWAY_DOWN'].includes(regime)
      || (!marketRegime && legacyRegime.includes('DOWN'))
    : direction === 'UP'
      ? ['UP', 'WEAK_UP', 'SIDEWAY_UP'].includes(regime)
        || (!marketRegime && legacyRegime.includes('UP'))
      : false;
  const emaAligned = (direction === 'DOWN' && emaTrend === 'BELOW')
    || (direction === 'UP' && emaTrend === 'ABOVE');
  return {
    direction,
    emaTrend,
    marketRegime,
    legacyRegime,
    regime,
    confirmed: Boolean(directionalRegime && emaAligned),
  };
}

function flowState(direction, obvTrend) {
  if (
    (direction === 'UP' && obvTrend === 'RISING')
    || (direction === 'DOWN' && obvTrend === 'FALLING')
  ) return 'CONFIRMED';
  if (['RISING', 'FALLING', 'FLAT'].includes(obvTrend)) return 'DIVERGENT';
  return 'NO_DATA';
}

function btcWaveState(trade = {}) {
  const health = trade.btcHealth ?? {};
  const structure = directionStructure(trade);
  const trendScore = finite(health.btcTrendScore ?? trade.btcTrendScore);
  const pct6h = finite(health.pct6h ?? trade.btcPct6h);
  const rsi1h = finite(health.rsi1h ?? trade.btcRsi1h);
  const obvTrend = upper(health.obvTrend);
  const missing = [
    !['UP', 'DOWN'].includes(structure.direction) ? 'direction' : '',
    trendScore == null ? 'trendScore' : '',
    !structure.emaTrend ? 'emaTrend1h' : '',
    !structure.regime ? 'regime' : '',
    pct6h == null ? 'pct6h' : '',
    rsi1h == null ? 'rsi1h' : '',
    !obvTrend ? 'obvTrend' : '',
  ].filter(Boolean);
  if (missing.length) {
    return { state: 'NO_DATA', ...structure, trendScore, pct6h, rsi1h, obvTrend, missing };
  }
  if (!structure.confirmed) {
    return { state: 'TRANSITION', ...structure, trendScore, pct6h, rsi1h, obvTrend, missing };
  }
  const flow = flowState(structure.direction, obvTrend);
  let exhausted = false;
  if (structure.direction === 'DOWN') {
    exhausted = (
      pct6h >= -0.2
      && (rsi1h <= 42 || trendScore < 50 || flow === 'DIVERGENT')
    ) || (rsi1h <= 33 && pct6h >= -0.5);
  } else {
    exhausted = (
      flow === 'DIVERGENT'
      && (pct6h <= 0.2 || rsi1h >= 58)
    ) || rsi1h >= 68;
  }
  return {
    state: exhausted ? 'EXHAUSTED' : 'CONTINUATION',
    ...structure,
    trendScore,
    pct6h,
    rsi1h,
    obvTrend,
    flow,
    missing,
  };
}

function wave2bLabel(trade = {}) {
  const side = upper(trade.side);
  const wave = btcWaveState(trade);
  if (wave.state === 'NO_DATA') return { label: 'WAVE NO DATA', wave };
  if (wave.state === 'TRANSITION') return { label: 'WAVE TRANSITION', wave };
  const aligned = (side === 'SHORT' && wave.direction === 'DOWN')
    || (side === 'LONG' && wave.direction === 'UP');
  if (aligned && wave.state === 'CONTINUATION') {
    return { label: 'WAVE DRIVE ALIGNED', wave };
  }
  if (aligned && wave.state === 'EXHAUSTED') {
    return { label: 'WAVE ALIGNED EXHAUSTED', wave };
  }
  if (!aligned && wave.state === 'CONTINUATION') {
    return { label: 'WAVE COUNTER ACTIVE', wave };
  }
  return { label: 'WAVE COUNTER EXHAUSTED', wave };
}

function emptyStats(label) {
  return {
    label,
    total: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    pnl: 0,
    roe: 0,
    grossWin: 0,
    grossLoss: 0,
    days: new Map(),
  };
}

function addStats(row, trade) {
  const pnl = pnlOf(trade);
  row.total += 1;
  row.pnl += pnl;
  row.roe += roeOf(trade);
  if (pnl > 0) {
    row.wins += 1;
    row.grossWin += pnl;
  } else if (pnl < 0) {
    row.losses += 1;
    row.grossLoss += Math.abs(pnl);
  } else {
    row.breakeven += 1;
  }
  const day = bangkokDay(trade);
  row.days.set(day, (row.days.get(day) ?? 0) + pnl);
}

function finalize(row) {
  const decisive = row.wins + row.losses;
  const dayRows = [...row.days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, pnl]) => ({ day, pnl: +pnl.toFixed(3) }));
  const positiveDays = dayRows.filter((item) => item.pnl > 0).length;
  const negativeDays = dayRows.filter((item) => item.pnl < 0).length;
  return {
    label: row.label,
    closed: row.total,
    wins: row.wins,
    losses: row.losses,
    breakeven: row.breakeven,
    wr: decisive ? +((row.wins / decisive) * 100).toFixed(1) : null,
    pnl: +row.pnl.toFixed(3),
    avgRoe: row.total ? +(row.roe / row.total).toFixed(2) : null,
    pf: row.grossLoss > 0
      ? +(row.grossWin / row.grossLoss).toFixed(2)
      : row.grossWin > 0
        ? 9.99
        : 0,
    positiveDays,
    negativeDays,
    dayRows,
  };
}

function groupStats(trades, keyOf) {
  const rows = new Map();
  for (const trade of trades) {
    const key = keyOf(trade);
    if (!rows.has(key)) rows.set(key, emptyStats(key));
    addStats(rows.get(key), trade);
  }
  return [...rows.values()]
    .map(finalize)
    .sort((a, b) => b.closed - a.closed || b.pnl - a.pnl);
}

const payload = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const allTrades = Array.isArray(payload) ? payload : payload.trades ?? [];
const rangeTrades = allTrades.filter((trade) => {
  const at = entryMs(trade);
  return at >= startAt && at < endAt;
});
const closedTrades = rangeTrades.filter((trade) => (
  upper(trade.status) === 'CLOSED'
  && upper(trade.outcome) !== 'INVALID'
  && finite(trade.netPnl ?? trade.pnl) != null
));

const coverageFields = {
  btcCore: (trade) => {
    const wave = btcWaveState(trade);
    return wave.state !== 'NO_DATA';
  },
  marketDirection: (trade) => Boolean(trade.marketDirectionAtSignal),
  longShortWave: (trade) => Boolean(trade.marketDirectionAtSignal?.scoreDynamics?.longWaveState)
    && Boolean(trade.marketDirectionAtSignal?.scoreDynamics?.shortWaveState),
  storedTier: (trade) => ['A', 'B', 'BLOCK'].includes(upper(trade.edgeShortTier)),
};

const coverage = Object.fromEntries(Object.entries(coverageFields).map(([key, predicate]) => {
  const count = closedTrades.filter(predicate).length;
  return [key, {
    count,
    pct: closedTrades.length ? +((count / closedTrades.length) * 100).toFixed(1) : 0,
  }];
}));

const baseline = finalize(closedTrades.reduce((row, trade) => {
  addStats(row, trade);
  return row;
}, emptyStats('ALL CLOSED')));
const tierAbTrades = closedTrades.filter((trade) => (
  ['A', 'B'].includes(upper(trade.edgeShortTier))
));

const result = {
  scope: {
    timezone: 'Asia/Bangkok',
    fromDay,
    toDay,
    totalInRange: rangeTrades.length,
    closed: closedTrades.length,
    active: rangeTrades.length - closedTrades.length,
  },
  coverage,
  baseline,
  bySide: groupStats(closedTrades, (trade) => upper(trade.side) || 'NO SIDE'),
  byWave2b: groupStats(closedTrades, (trade) => wave2bLabel(trade).label),
  bySideWave2b: groupStats(closedTrades, (trade) => `${upper(trade.side)} | ${wave2bLabel(trade).label}`),
  byTier: groupStats(closedTrades, (trade) => `TIER ${upper(trade.edgeShortTier) || 'NO DATA'}`),
  byTierWave2b: groupStats(closedTrades, (trade) => (
    `TIER ${upper(trade.edgeShortTier) || 'NO DATA'} | ${wave2bLabel(trade).label}`
  )),
  byTierSideWave2b: groupStats(closedTrades, (trade) => (
    `TIER ${upper(trade.edgeShortTier) || 'NO DATA'} | ${upper(trade.side) || 'NO SIDE'} | ${wave2bLabel(trade).label}`
  )),
  tierAbScope: {
    closed: tierAbTrades.length,
    pctOfClosed: closedTrades.length
      ? +((tierAbTrades.length / closedTrades.length) * 100).toFixed(1)
      : 0,
  },
  byTierAb: groupStats(tierAbTrades, (trade) => `TIER ${upper(trade.edgeShortTier)}`),
  byTierAbSide: groupStats(tierAbTrades, (trade) => (
    `TIER ${upper(trade.edgeShortTier)} | ${upper(trade.side) || 'NO SIDE'}`
  )),
  byCombinedAb: groupStats(tierAbTrades, () => 'TIER A+B'),
  byCombinedAbSide: groupStats(tierAbTrades, (trade) => (
    `TIER A+B | ${upper(trade.side) || 'NO SIDE'}`
  )),
  byTierAbSideWave2b: groupStats(tierAbTrades, (trade) => (
    `TIER ${upper(trade.edgeShortTier)} | ${upper(trade.side) || 'NO SIDE'} | ${wave2bLabel(trade).label}`
  )),
  byCombinedAbSideWave2b: groupStats(tierAbTrades, (trade) => (
    `TIER A+B | ${upper(trade.side) || 'NO SIDE'} | ${wave2bLabel(trade).label}`
  )),
};

console.log(JSON.stringify(result, null, 2));
