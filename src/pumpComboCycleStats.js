import {
  LIQUID_PAPER_DAY_TIME_ZONE,
  liquidPaperTradeDayKey,
} from './liquidPaperDateRange.js';

export const PUMP_COMBO_CYCLE_STATS_VERSION = 'PUMP_COMBO_CYCLE_STATS_V1_20260728';

const EPISODE_MS = 15 * 60 * 1000;
const RECENT_DAY_LIMIT = 5;

function numberOf(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compact(value, digits = 2) {
  return +numberOf(value, 0).toFixed(digits);
}

function entryMs(trade = {}) {
  const value = Date.parse(trade.openedAt ?? trade.entryReadyAt ?? trade.createdAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

function netPnlOf(trade = {}) {
  const saved = numberOf(trade.netPnl);
  if (saved != null) return saved;
  return numberOf(trade.pnl, 0);
}

function netRoeOf(trade = {}) {
  const saved = numberOf(trade.netRoe);
  if (saved != null) return saved;
  return numberOf(trade.roe, 0);
}

function cycleOf(trade = {}) {
  const health = trade.btcHealth ?? {};
  const pct24h = numberOf(health.pct24h ?? trade.btcPct24h);
  const rsi4h = numberOf(health.rsi4h ?? trade.btcRsi4h);
  const dayMove = pct24h == null ? 'DAY_NO_DATA'
    : pct24h >= 0.2 ? 'DAY_POS'
      : pct24h <= -0.2 ? 'DAY_NEG'
        : 'DAY_FLAT';
  const rsi = rsi4h == null ? 'RSI4_NO_DATA'
    : rsi4h < 50 ? 'RSI4_RESET'
      : rsi4h < 58 ? 'RSI4_BALANCED'
        : 'RSI4_HOT';
  return {
    key: `${dayMove} | ${rsi}`,
    label: `${dayMove} · ${rsi}`,
    dayMove,
    rsi4h: rsi,
    complete: !dayMove.endsWith('NO_DATA') && !rsi.endsWith('NO_DATA'),
  };
}

function metrics(records = []) {
  const episodes = new Map();
  for (const record of records) {
    const bucket = Math.floor(record.entryMs / EPISODE_MS) * EPISODE_MS;
    const key = `${record.day}:${bucket}`;
    const episode = episodes.get(key) ?? {
      day: record.day,
      closed: 0,
      wins: 0,
      losses: 0,
      pnl: 0,
      roeSum: 0,
    };
    episode.closed += 1;
    episode.pnl += record.pnl;
    episode.roeSum += record.roe;
    if (record.pnl > 0) episode.wins += 1;
    else if (record.pnl < 0) episode.losses += 1;
    episodes.set(key, episode);
  }

  const episodeRows = [...episodes.values()].map((row) => ({
    ...row,
    avgRoe: row.closed ? row.roeSum / row.closed : 0,
  }));
  const days = new Map();
  let roeSum = 0;
  let winRoe = 0;
  let lossRoe = 0;
  for (const episode of episodeRows) {
    roeSum += episode.avgRoe;
    if (episode.avgRoe > 0) winRoe += episode.avgRoe;
    else lossRoe += Math.abs(episode.avgRoe);
    const day = days.get(episode.day) ?? { day: episode.day, closed: 0, episodes: 0, roeSum: 0 };
    day.closed += episode.closed;
    day.episodes += 1;
    day.roeSum += episode.avgRoe;
    days.set(episode.day, day);
  }
  const dayRows = [...days.values()]
    .map((day) => ({ ...day, avgRoe: day.episodes ? day.roeSum / day.episodes : 0 }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const positiveDays = dayRows.filter((day) => day.avgRoe > 0).length;
  const maxDayClosed = dayRows.reduce((max, day) => Math.max(max, day.closed), 0);
  return {
    closed: records.length,
    wins: records.filter((record) => record.pnl > 0).length,
    losses: records.filter((record) => record.pnl < 0).length,
    pnl: records.reduce((sum, record) => sum + record.pnl, 0),
    episodes: episodeRows.length,
    days: dayRows.length,
    positiveDays,
    positiveDayRate: dayRows.length ? positiveDays / dayRows.length * 100 : 0,
    avgRoe: episodeRows.length ? roeSum / episodeRows.length : 0,
    profitFactor: lossRoe > 0 ? winRoe / lossRoe : winRoe > 0 ? 9.99 : 0,
    maxDayShare: records.length ? maxDayClosed / records.length * 100 : 0,
    dayRows,
  };
}

function compactMetrics(value) {
  return {
    closed: value.closed,
    wins: value.wins,
    losses: value.losses,
    pnl: compact(value.pnl, 4),
    episodes: value.episodes,
    days: value.days,
    positiveDays: value.positiveDays,
    positiveDayRate: compact(value.positiveDayRate, 1),
    avgRoe: compact(value.avgRoe, 2),
    profitFactor: compact(value.profitFactor, 2),
    maxDayShare: compact(value.maxDayShare, 1),
  };
}

function tierOf(history, recent) {
  const stable = history.closed >= 12
    && history.episodes >= 6
    && history.days >= 3
    && history.positiveDays >= 3
    && history.positiveDayRate >= 60
    && history.avgRoe >= 0.5
    && history.profitFactor >= 1.2
    && history.pnl > 0
    && recent.avgRoe > 0
    && recent.profitFactor >= 1
    && recent.positiveDayRate >= 50;
  if (stable) return 'STABLE_GOOD';
  const forming = history.closed >= 8
    && history.episodes >= 4
    && history.days >= 2
    && history.positiveDays >= 2
    && history.positiveDayRate >= 60
    && history.avgRoe > 0
    && history.profitFactor >= 1.1
    && history.pnl > 0
    && recent.avgRoe > 0;
  if (forming) return 'FORMING_GOOD';
  if (history.closed < 8 || history.days < 2) return 'NEW';
  if (history.avgRoe < 0 || history.profitFactor < 0.9 || recent.avgRoe < 0) return 'RISK';
  return 'WATCH';
}

export function buildPumpComboCycleStats(
  trades = [],
  {
    comboKeyOf = (trade) => trade.combo ?? trade.pumpCombo ?? null,
    stableLimit = 12,
    formingLimit = 8,
  } = {},
) {
  const groups = new Map();
  for (const trade of trades) {
    if (!/^pump-\d+(?:-|$)/i.test(String(trade.source ?? ''))) continue;
    const comboKey = String(comboKeyOf(trade) ?? '').trim();
    const cycle = cycleOf(trade);
    if (!comboKey || comboKey === '-' || comboKey.includes('NO_DATA') || !cycle.complete) continue;
    const key = `${comboKey} || CYCLE ${cycle.key}`;
    const group = groups.get(key) ?? {
      key,
      comboKey,
      cycle,
      total: 0,
      active: 0,
      pending: 0,
      activePnl: 0,
      records: [],
    };
    group.total += 1;
    const status = String(trade.status ?? '').toUpperCase();
    if (status === 'OPEN') {
      group.active += 1;
      group.activePnl += netPnlOf(trade);
    } else if (status !== 'CLOSED') {
      group.pending += 1;
    } else if (String(trade.outcome ?? '').toUpperCase() !== 'INVALID') {
      const timestamp = entryMs(trade);
      const day = liquidPaperTradeDayKey(trade);
      if (timestamp > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
        group.records.push({
          entryMs: timestamp,
          day,
          pnl: netPnlOf(trade),
          roe: Math.max(-30, Math.min(30, netRoeOf(trade))),
        });
      }
    }
    groups.set(key, group);
  }

  const rows = [...groups.values()].map((group) => {
    const history = metrics(group.records);
    const recentDaySet = new Set(history.dayRows.slice(-RECENT_DAY_LIMIT).map((day) => day.day));
    const recent = metrics(group.records.filter((record) => recentDaySet.has(record.day)));
    const tier = tierOf(history, recent);
    return {
      key: group.key,
      comboKey: group.comboKey,
      cycleKey: group.cycle.key,
      cycleLabel: group.cycle.label,
      tier,
      total: group.total,
      active: group.active,
      pending: group.pending,
      activePnl: compact(group.activePnl, 4),
      history: compactMetrics(history),
      recent: compactMetrics(recent),
      score: compact(history.positiveDayRate * 2
        + Math.min(3, history.profitFactor) * 20
        + Math.min(20, history.avgRoe) * 2
        + Math.min(8, history.days) * 5
        - Math.max(0, history.maxDayShare - 50)),
    };
  }).sort((a, b) => b.score - a.score || b.history.days - a.history.days || b.history.closed - a.history.closed);

  const counts = rows.reduce((result, row) => {
    result[row.tier] = (result[row.tier] ?? 0) + 1;
    return result;
  }, { STABLE_GOOD: 0, FORMING_GOOD: 0, WATCH: 0, RISK: 0, NEW: 0 });
  return {
    version: PUMP_COMBO_CYCLE_STATS_VERSION,
    sourceScope: 'PUMP_NATIVE_ONLY',
    timeZone: LIQUID_PAPER_DAY_TIME_ZONE,
    mode: 'OBSERVATION_ONLY',
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    affectsSl: false,
    affectsTp: false,
    criteria: {
      episodeMinutes: EPISODE_MS / 60_000,
      recentDays: RECENT_DAY_LIMIT,
      stable: { minClosed: 12, minEpisodes: 6, minDays: 3, minPositiveDays: 3, minPositiveDayRate: 60, minAvgRoe: 0.5, minProfitFactor: 1.2 },
      forming: { minClosed: 8, minEpisodes: 4, minDays: 2 },
    },
    counts,
    stableGood: rows.filter((row) => row.tier === 'STABLE_GOOD').slice(0, Math.max(1, Number(stableLimit) || 12)),
    formingGood: rows.filter((row) => row.tier === 'FORMING_GOOD').slice(0, Math.max(1, Number(formingLimit) || 8)),
  };
}
