import { liquidPaperTradeDayKey } from './liquidPaperDateRange.js';

export const SHORT_WAVE_STATS_VERSION = 'MARKET_SCORE_WAVE_STATS_V2_20260729';

const STATE_ORDER = [
  'SHORT_BUILDUP',
  'SHORT_IMPULSE',
  'SHORT_PEAK',
  'SHORT_FADE',
  'BTC_CRASH_RECLAIM',
  'SHORT_RELOAD',
  'SHORT_NEUTRAL',
  'SHORT_NO_DATA',
  'LONG_BUILDUP',
  'LONG_IMPULSE',
  'LONG_PEAK',
  'LONG_FADE',
  'BTC_RALLY_REJECT',
  'LONG_RELOAD',
  'LONG_NEUTRAL',
  'LONG_NO_DATA',
];

function numberOf(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compact(value, digits = 3) {
  return +numberOf(value).toFixed(digits);
}

function sourceFamily(trade = {}) {
  if (trade.shortWaveSourceFamily) return String(trade.shortWaveSourceFamily).toUpperCase();
  const source = String(trade.source ?? '').toLowerCase();
  if (source.startsWith('liquid-scan')) return 'LIQUID';
  if (source.startsWith('emasq-')) return 'EMA';
  if (/^pump-\d+(?:-|$)/i.test(source)) return 'PUMP';
  return 'OTHER';
}

function metricsBucket(waveFamily, state, side, wave = {}) {
  const prefix = waveFamily === 'LONG_SCORE' ? 'long' : 'short';
  return {
    key: `${waveFamily}|${state}|${side}`,
    waveFamily,
    state,
    label: String(wave[`${prefix}WaveLabel`] ?? state).replaceAll('_', ' '),
    description: String(wave[`${prefix}WaveDescription`] ?? ''),
    tone: String(wave[`${prefix}WaveTone`] ?? 'neutral'),
    side,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    closedPnl: 0,
    activePnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
    days: new Map(),
    sources: {},
  };
}

export function buildShortWaveStats(trades = []) {
  const groups = new Map();
  let snapshotCount = 0;
  let noSnapshotCount = 0;
  let observationCount = 0;
  for (const trade of trades) {
    const wave = trade?.marketDirectionAtSignal?.scoreDynamics;
    const side = String(trade?.side ?? '').toUpperCase();
    const observations = [
      { waveFamily: 'SHORT_SCORE', state: String(wave?.shortWaveState ?? '').toUpperCase() },
      { waveFamily: 'LONG_SCORE', state: String(wave?.longWaveState ?? '').toUpperCase() },
    ].filter((item) => item.state);
    if (!observations.length || !['LONG', 'SHORT'].includes(side)) {
      noSnapshotCount += 1;
      continue;
    }
    snapshotCount += 1;
    for (const observation of observations) {
      observationCount += 1;
      const key = `${observation.waveFamily}|${observation.state}|${side}`;
      const group = groups.get(key) ?? metricsBucket(
        observation.waveFamily,
        observation.state,
        side,
        wave,
      );
      const status = String(trade?.status ?? '').toUpperCase();
      const pnl = numberOf(trade?.netPnl ?? trade?.pnl);
      const roe = numberOf(trade?.netRoe ?? trade?.roe ?? trade?.roePct);
      const source = sourceFamily(trade);
      group.total += 1;
      group.sources[source] = (group.sources[source] ?? 0) + 1;
      if (status === 'OPEN') {
        group.open += 1;
        group.activePnl += pnl;
      } else if (status !== 'CLOSED') {
        group.pending += 1;
      } else {
        group.closed += 1;
        group.closedPnl += pnl;
        group.roeSum += roe;
        if (pnl > 0) {
          group.wins += 1;
          group.grossWin += pnl;
        } else if (pnl < 0) {
          group.losses += 1;
          group.grossLoss += Math.abs(pnl);
        } else group.breakeven += 1;
        const day = liquidPaperTradeDayKey(trade);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) group.days.set(day, (group.days.get(day) ?? 0) + pnl);
      }
      groups.set(key, group);
    }
  }

  const rows = [...groups.values()].map(({ roeSum, grossWin, grossLoss, days, ...group }) => {
    const decisive = group.wins + group.losses;
    const dayRows = [...days.entries()];
    const positiveDays = dayRows.filter(([, pnl]) => pnl > 0).length;
    return {
      ...group,
      closedPnl: compact(group.closedPnl, 4),
      activePnl: compact(group.activePnl, 4),
      wr: decisive ? compact(group.wins / decisive * 100, 1) : null,
      avgRoe: group.closed ? compact(roeSum / group.closed, 2) : null,
      profitFactor: grossLoss > 0 ? compact(grossWin / grossLoss, 2) : grossWin > 0 ? 9.99 : null,
      days: dayRows.length,
      positiveDays,
      positiveDayRate: dayRows.length ? compact(positiveDays / dayRows.length * 100, 1) : null,
    };
  }).sort((left, right) => {
    const familyDiff = (left.waveFamily === 'SHORT_SCORE' ? 0 : 1)
      - (right.waveFamily === 'SHORT_SCORE' ? 0 : 1);
    if (familyDiff) return familyDiff;
    const stateDiff = STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state);
    if (stateDiff) return stateDiff;
    return (left.side === 'SHORT' ? 0 : 1) - (right.side === 'SHORT' ? 0 : 1);
  });

  return {
    version: SHORT_WAVE_STATS_VERSION,
    mode: 'OBSERVATION_ONLY',
    observationOnly: true,
    affectsOrders: false,
    sourceScope: ['PUMP', 'EMA', 'SHORT_EDGE', 'LIQUID'],
    excludesRecommendedClones: true,
    totalTrades: trades.length,
    snapshotCount,
    observationCount,
    noSnapshotCount,
    coveragePct: trades.length ? compact(snapshotCount / trades.length * 100, 2) : 0,
    rows,
  };
}
