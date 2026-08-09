import {
  LIQUID_PAPER_DAY_TIME_ZONE,
  isLiquidPaperIsoDay,
  liquidPaperDayKey,
  liquidPaperTradeDayKey,
} from './liquidPaperDateRange.js';

export const LIQUID_COMBO_CYCLE_STATS_VERSION = 'LIQUID_COMBO_CYCLE_STATS_V4_20260808';

const EPISODE_MS = 15 * 60 * 1000;
const RECENT_DAY_LIMIT = 5;

const STABLE_MIN_CLOSED = 12;
const STABLE_MIN_EPISODES = 6;
const STABLE_MIN_DAYS = 3;
const FORMING_MIN_CLOSED = 8;
const FORMING_MIN_EPISODES = 4;
const FORMING_MIN_DAYS = 2;

function finiteNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function bounded(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePart(value, fallback = '-') {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9+._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function signalType(trade = {}) {
  const raw = String(trade.signalType ?? '').toUpperCase();
  if (raw.includes('KILL_ZONE')) return 'LIQUID_KILL_ZONE';
  if (raw.includes('SCAN')) return 'LIQUID_SCAN';
  const noteType = String(trade.note ?? '').match(/type=([^|]+)/i)?.[1]?.trim();
  return normalizePart(noteType, 'LIQUID_SCAN');
}

function timeframe(trade = {}) {
  return String(
    trade.signalTimeframe
      ?? trade.huntSignal?.interval
      ?? trade.entryPlan?.interval
      ?? '',
  ) || String(trade.note ?? '').match(/(?:tf|interval)=([^|]+)/i)?.[1]?.trim()
    || '15m';
}

function gateLabel(trade = {}) {
  if (trade.liquidGateLabel) return String(trade.liquidGateLabel);
  const note = String(trade.note ?? '');
  const side = String(trade.side ?? '').toUpperCase();
  const heavy = String(trade.heavySide ?? '').toLowerCase();
  const signal = signalType(trade);
  const health = trade.btcHealth ?? {};
  const direction = String(
    health.btcTrendDir
      ?? trade.btcTrendDir
      ?? '',
  ).toLowerCase();
  const corr = finiteNumber(trade.btcCorr);
  const liquidityAligned = (side === 'LONG' && heavy === 'above')
    || (side === 'SHORT' && heavy === 'below');
  const expected = side === 'LONG' ? 'up' : side === 'SHORT' ? 'down' : '';
  const btcAligned = direction && expected ? direction === expected : null;
  if (note.match(/killZone=/i) || signal === 'LIQUID_KILL_ZONE') {
    if (liquidityAligned && btcAligned === true) return `GATE_OK_LIQUID_${side}_BTC_ALIGNED`;
    if (liquidityAligned && btcAligned === false) return `GATE_TEST_LIQUID_${side}_BTC_COUNTER`;
    if (liquidityAligned) return `GATE_OK_LIQUID_${side}_LIQUIDITY_ALIGNED`;
    return `GATE_TEST_LIQUID_${side}_LIQUIDITY_COUNTER`;
  }
  if (corr != null && corr < 0.3) return `GATE_TEST_LIQUID_${side}_BTC_INDEPENDENT`;
  if (btcAligned === true) return `GATE_OK_LIQUID_${side}_BTC_ALIGNED`;
  if (btcAligned === false) return `GATE_TEST_LIQUID_${side}_BTC_COUNTER`;
  return 'GATE_LIQUID_UNKNOWN';
}

export function liquidComboKey(trade = {}) {
  if (trade.liquidCombo) return String(trade.liquidCombo);
  const stage = signalType(trade);
  const side = String(trade.side ?? '-').toUpperCase();
  const tf = timeframe(trade);
  const corr = finiteNumber(trade.btcCorr);
  const corrBucket = corr == null
    ? 'BTC_CORR_NO_DATA'
    : corr < 0.3
      ? 'BTC_CORR_RAC'
      : corr < 0.5
        ? 'BTC_CORR_YEU'
        : 'BTC_CORR_THEO';
  const health = trade.btcHealth ?? {};
  const direction = String(
    health.btcTrendDir
      ?? trade.btcTrendDir
      ?? '',
  ).toUpperCase();
  const score = finiteNumber(
    health.btcTrendScore
      ?? trade.btcTrendScore,
  );
  const trendBucket = direction
    ? `BTC_${direction}_${score == null ? 'NO_SCORE' : score < 45 ? 'WEAK' : score < 65 ? 'MID' : 'STRONG'}`
    : 'BTC_NO_DATA';
  const expected = side === 'LONG' ? 'UP' : side === 'SHORT' ? 'DOWN' : '';
  const relation = corr != null && corr < 0.3
    ? 'DOC_LAP'
    : corr != null && corr < 0.5
      ? 'THEO_YEU'
      : direction && expected
        ? direction === expected ? 'THUAN_BTC' : 'NGUOC_BTC'
        : 'REL_NO_DATA';
  return [
    stage,
    side,
    tf,
    corrBucket,
    trendBucket,
    relation,
    normalizePart(gateLabel(trade)),
  ].join(' | ');
}

function dayMoveBucket(value) {
  if (value == null) return 'DAY_NO_DATA';
  if (value >= 0.2) return 'DAY_POS';
  if (value <= -0.2) return 'DAY_NEG';
  return 'DAY_FLAT';
}

function rsi4hBucket(value) {
  if (value == null) return 'RSI4_NO_DATA';
  if (value < 50) return 'RSI4_RESET';
  if (value < 58) return 'RSI4_BALANCED';
  return 'RSI4_HOT';
}

function pulseBucket(value) {
  if (value == null) return 'PULSE_NO_DATA';
  if (value >= 0.2) return 'PULSE_UP';
  if (value <= -0.2) return 'PULSE_DOWN';
  return 'PULSE_FLAT';
}

export function liquidComboCycleContext(trade = {}) {
  const health = trade.btcHealth ?? {};
  const pct24h = finiteNumber(health.pct24h ?? trade.btcPct24h);
  const pct6h = finiteNumber(health.pct6h ?? trade.btcPct6h);
  const rsi4h = finiteNumber(health.rsi4h ?? trade.btcRsi4h);
  const dayMove = dayMoveBucket(pct24h);
  const rsi = rsi4hBucket(rsi4h);
  const pulse = pulseBucket(pct6h);
  return {
    key: `${dayMove} | ${rsi}`,
    label: `${dayMove} · ${rsi}`,
    dayMove,
    rsi4h: rsi,
    pulse,
    pct24h,
    pct6h,
    rsi4hValue: rsi4h,
    complete: !dayMove.endsWith('NO_DATA') && !rsi.endsWith('NO_DATA'),
  };
}

function entryMs(trade = {}) {
  const value = Date.parse(
    trade.openedAt
      ?? trade.entryReadyAt
      ?? trade.createdAt
      ?? '',
  );
  return Number.isFinite(value) ? value : 0;
}

function closeMs(trade = {}) {
  const value = Date.parse(trade.closedAt ?? trade.updatedAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

function entryDay(trade = {}) {
  return liquidPaperTradeDayKey(trade);
}

function netPnlOf(trade = {}) {
  const saved = finiteNumber(trade.netPnl);
  if (saved != null) return saved;
  const gross = finiteNumber(trade.grossPnl ?? trade.pnl);
  const fee = finiteNumber(trade.feeUsdt ?? trade.estimatedFeeUsdt, 0);
  if (gross != null) return gross - fee;
  return 0;
}

function netRoeOf(trade = {}) {
  const saved = finiteNumber(trade.netRoe);
  if (saved != null) return saved;
  const margin = finiteNumber(trade.marginUsdt);
  const netPnl = netPnlOf(trade);
  if (margin > 0) return (netPnl / margin) * 100;
  return finiteNumber(trade.roe, 0);
}

function compactNumber(value, digits = 3) {
  return +finiteNumber(value, 0).toFixed(digits);
}

function episodeMetrics(records = []) {
  const episodes = new Map();
  for (const record of records) {
    const bucket = Math.floor(record.entryMs / EPISODE_MS) * EPISODE_MS;
    const key = `${record.day}:${bucket}`;
    if (!episodes.has(key)) {
      episodes.set(key, {
        key,
        day: record.day,
        closed: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
        roeSum: 0,
      });
    }
    const episode = episodes.get(key);
    episode.closed += 1;
    episode.pnl += record.netPnl;
    episode.roeSum += record.netRoe;
    if (record.netPnl > 0) episode.wins += 1;
    else if (record.netPnl < 0) episode.losses += 1;
  }

  const episodeRows = [...episodes.values()]
    .map((episode) => ({
      ...episode,
      avgRoe: episode.closed > 0 ? episode.roeSum / episode.closed : 0,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const days = new Map();
  let grossWinRoe = 0;
  let grossLossRoe = 0;
  let episodeRoeSum = 0;
  for (const episode of episodeRows) {
    episodeRoeSum += episode.avgRoe;
    if (episode.avgRoe > 0) grossWinRoe += episode.avgRoe;
    else if (episode.avgRoe < 0) grossLossRoe += Math.abs(episode.avgRoe);
    if (!days.has(episode.day)) {
      days.set(episode.day, {
        day: episode.day,
        episodes: 0,
        closed: 0,
        pnl: 0,
        roeSum: 0,
      });
    }
    const daily = days.get(episode.day);
    daily.episodes += 1;
    daily.closed += episode.closed;
    daily.pnl += episode.pnl;
    daily.roeSum += episode.avgRoe;
  }
  const dayRows = [...days.values()]
    .map((day) => ({
      ...day,
      avgRoe: day.episodes > 0 ? day.roeSum / day.episodes : 0,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const positiveDays = dayRows.filter((day) => day.avgRoe > 0).length;
  const negativeDays = dayRows.filter((day) => day.avgRoe < 0).length;
  const maxDayClosed = dayRows.reduce((max, day) => Math.max(max, day.closed), 0);
  const closed = records.length;
  return {
    closed,
    wins: records.filter((record) => record.netPnl > 0).length,
    losses: records.filter((record) => record.netPnl < 0).length,
    pnl: records.reduce((sum, record) => sum + record.netPnl, 0),
    episodes: episodeRows.length,
    days: dayRows.length,
    positiveDays,
    negativeDays,
    positiveDayRate: dayRows.length > 0 ? (positiveDays / dayRows.length) * 100 : 0,
    avgRoe: episodeRows.length > 0 ? episodeRoeSum / episodeRows.length : 0,
    profitFactor: grossLossRoe > 0
      ? grossWinRoe / grossLossRoe
      : grossWinRoe > 0
        ? 9.99
        : 0,
    maxDayShare: closed > 0 ? (maxDayClosed / closed) * 100 : 0,
    dayRows,
  };
}

function compactMetrics(metrics = {}) {
  return {
    closed: Number(metrics.closed ?? 0),
    wins: Number(metrics.wins ?? 0),
    losses: Number(metrics.losses ?? 0),
    pnl: compactNumber(metrics.pnl, 4),
    episodes: Number(metrics.episodes ?? 0),
    days: Number(metrics.days ?? 0),
    positiveDays: Number(metrics.positiveDays ?? 0),
    negativeDays: Number(metrics.negativeDays ?? 0),
    positiveDayRate: compactNumber(metrics.positiveDayRate, 1),
    avgRoe: compactNumber(metrics.avgRoe, 2),
    profitFactor: compactNumber(metrics.profitFactor, 2),
    maxDayShare: compactNumber(metrics.maxDayShare, 1),
  };
}

export function buildLiquidComboCycleTodayStats(
  trades = [],
  {
    day = liquidPaperDayKey(new Date()),
    limit = 12,
    allowedKeys = null,
  } = {},
) {
  const targetDay = isLiquidPaperIsoDay(day) ? String(day) : liquidPaperDayKey(new Date());
  const allowedKeyList = allowedKeys == null
    ? null
    : [...allowedKeys].map((key) => String(key));
  const allowedKeySet = allowedKeyList == null ? null : new Set(allowedKeyList);
  const allowedKeyRank = new Map((allowedKeyList ?? []).map((key, index) => [key, index]));
  const groups = new Map();
  for (const trade of trades) {
    if (!String(trade.source ?? '').startsWith('liquid-scan')) continue;
    if (liquidPaperTradeDayKey(trade) !== targetDay) continue;
    const comboKey = liquidComboKey(trade);
    const cycle = liquidComboCycleContext(trade);
    if (
      !comboKey
      || comboKey.includes('NO_DATA')
      || !cycle.complete
    ) continue;
    const key = `${comboKey} || CYCLE ${cycle.key}`;
    if (allowedKeySet && !allowedKeySet.has(key)) continue;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        comboKey,
        cycle,
        total: 0,
        active: 0,
        pending: 0,
        activePnl: 0,
        records: [],
      });
    }
    const group = groups.get(key);
    const status = String(trade.status ?? '').toUpperCase();
    group.total += 1;
    if (status === 'OPEN') {
      group.active += 1;
      group.activePnl += netPnlOf(trade);
      continue;
    }
    if (status !== 'CLOSED') {
      group.pending += 1;
      continue;
    }
    if (String(trade.outcome ?? '').toUpperCase() === 'INVALID') continue;
    const tradeEntryMs = entryMs(trade);
    if (!(tradeEntryMs > 0)) continue;
    group.records.push({
      entryMs: tradeEntryMs,
      day: targetDay,
      netPnl: netPnlOf(trade),
      netRoe: bounded(netRoeOf(trade), -30, 30),
    });
  }

  const rows = [...groups.values()].map((group) => {
    const metrics = episodeMetrics(group.records);
    const winRate = metrics.closed > 0 ? (metrics.wins / metrics.closed) * 100 : 0;
    return {
      key: group.key,
      comboKey: group.comboKey,
      cycleKey: group.cycle.key,
      cycleLabel: group.cycle.label,
      dayMove: group.cycle.dayMove,
      rsi4h: group.cycle.rsi4h,
      tier: 'TODAY_STABLE',
      total: group.total,
      active: group.active,
      pending: group.pending,
      activePnl: compactNumber(group.activePnl, 4),
      winRate: compactNumber(winRate, 1),
      today: compactMetrics(metrics),
      score: compactNumber(
        metrics.avgRoe * 3
        + Math.min(metrics.profitFactor, 5) * 5
        + winRate / 10
        + Math.min(metrics.episodes, 8),
        2,
      ),
    };
  }).sort((a, b) => (allowedKeyRank.get(a.key) ?? Number.MAX_SAFE_INTEGER)
    - (allowedKeyRank.get(b.key) ?? Number.MAX_SAFE_INTEGER)
    || b.score - a.score
    || b.today.pnl - a.today.pnl
    || b.today.closed - a.today.closed);

  const stableToday = rows.slice(0, Math.max(1, Number(limit) || 12));
  return {
    day: targetDay,
    timeZone: LIQUID_PAPER_DAY_TIME_ZONE,
    mode: 'OBSERVATION_ONLY',
    observationOnly: true,
    affectsEntry: false,
    criteria: {
      requiredHistoryTier: 'STABLE_GOOD',
      requiresPositiveToday: false,
      requiresMinimumTodaySample: false,
    },
    stableGroupCount: allowedKeySet?.size ?? null,
    groupCount: rows.length,
    stableToday,
  };
}

function classify(all, recent) {
  const stableEvidence = all.closed >= STABLE_MIN_CLOSED
    && all.episodes >= STABLE_MIN_EPISODES
    && all.days >= STABLE_MIN_DAYS;
  const stableGood = stableEvidence
    && all.positiveDays >= 3
    && all.positiveDayRate >= 60
    && all.avgRoe >= 0.5
    && all.profitFactor >= 1.2
    && all.pnl > 0
    && recent.avgRoe > 0
    && recent.profitFactor >= 1
    && recent.positiveDayRate >= 50;
  if (stableGood) return 'STABLE_GOOD';

  const formingEvidence = all.closed >= FORMING_MIN_CLOSED
    && all.episodes >= FORMING_MIN_EPISODES
    && all.days >= FORMING_MIN_DAYS;
  const formingGood = formingEvidence
    && all.positiveDays >= 2
    && all.positiveDayRate >= 60
    && all.avgRoe > 0
    && all.profitFactor >= 1.1
    && all.pnl > 0
    && recent.avgRoe > 0;
  if (formingGood) return 'FORMING_GOOD';
  if (!formingEvidence) return 'NEW';
  if (
    all.avgRoe < 0
    || all.profitFactor < 0.9
    || recent.avgRoe < 0
    || recent.profitFactor < 0.9
  ) return 'RISK';
  return 'WATCH';
}

function score(row = {}) {
  const all = row.history ?? {};
  const recent = row.recent ?? {};
  return (
    Number(all.positiveDayRate ?? 0) * 2
    + Math.min(3, Number(all.profitFactor ?? 0)) * 20
    + Math.min(20, Number(all.avgRoe ?? 0)) * 2
    + Math.min(8, Number(all.days ?? 0)) * 5
    + Math.min(8, Number(recent.positiveDayRate ?? 0) / 10)
    - Math.max(0, Number(all.maxDayShare ?? 0) - 50)
  );
}

function publicRow(group) {
  const all = episodeMetrics(group.records);
  const recentDays = new Set(
    all.dayRows
      .slice(-RECENT_DAY_LIMIT)
      .map((day) => day.day),
  );
  const recent = episodeMetrics(
    group.records.filter((record) => recentDays.has(record.day)),
  );
  const tier = classify(all, recent);
  const row = {
    key: group.key,
    comboKey: group.comboKey,
    cycleKey: group.cycle.key,
    cycleLabel: group.cycle.label,
    dayMove: group.cycle.dayMove,
    rsi4h: group.cycle.rsi4h,
    pulseCounts: group.pulseCounts,
    tier,
    total: group.total,
    active: group.active,
    pending: group.pending,
    activePnl: compactNumber(group.activePnl, 4),
    history: compactMetrics(all),
    recent: compactMetrics(recent),
  };
  return {
    ...row,
    score: compactNumber(score(row), 2),
  };
}

export function liquidComboCycleEntrySnapshot(trade = {}, priorTrades = []) {
  const comboKey = liquidComboKey(trade);
  const cycle = liquidComboCycleContext(trade);
  const key = comboKey && cycle.complete
    ? `${comboKey} || CYCLE ${cycle.key}`
    : null;
  const targetEntryMs = entryMs(trade);
  if (!key || key.includes('NO_DATA') || !(targetEntryMs > 0)) {
    return {
      key,
      comboKey,
      cycleKey: cycle.key,
      tier: 'NO_DATA',
      history: compactMetrics({}),
      recent: compactMetrics({}),
      version: LIQUID_COMBO_CYCLE_STATS_VERSION,
      basis: 'CLOSED_BEFORE_ENTRY',
    };
  }

  const records = [];
  for (const candidate of priorTrades) {
    if (!String(candidate.source ?? '').startsWith('liquid-scan')) continue;
    if (String(candidate.status ?? '').toUpperCase() !== 'CLOSED') continue;
    if (String(candidate.outcome ?? '').toUpperCase() === 'INVALID') continue;
    const candidateCloseMs = closeMs(candidate);
    if (!(candidateCloseMs > 0) || candidateCloseMs >= targetEntryMs) continue;
    const candidateComboKey = liquidComboKey(candidate);
    const candidateCycle = liquidComboCycleContext(candidate);
    if (!candidateCycle.complete) continue;
    if (`${candidateComboKey} || CYCLE ${candidateCycle.key}` !== key) continue;
    const candidateEntryMs = entryMs(candidate);
    const day = entryDay(candidate);
    if (!(candidateEntryMs > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    records.push({
      entryMs: candidateEntryMs,
      day,
      netPnl: netPnlOf(candidate),
      netRoe: bounded(netRoeOf(candidate), -30, 30),
    });
  }
  const all = episodeMetrics(records);
  const recentDays = new Set(all.dayRows.slice(-RECENT_DAY_LIMIT).map((day) => day.day));
  const recent = episodeMetrics(records.filter((record) => recentDays.has(record.day)));
  return {
    key,
    comboKey,
    cycleKey: cycle.key,
    tier: classify(all, recent),
    history: compactMetrics(all),
    recent: compactMetrics(recent),
    version: LIQUID_COMBO_CYCLE_STATS_VERSION,
    basis: 'CLOSED_BEFORE_ENTRY',
  };
}

export function buildLiquidComboCycleStats(
  trades = [],
  {
    stableLimit = 12,
    formingLimit = 8,
  } = {},
) {
  const groups = new Map();
  for (const trade of trades) {
    if (!String(trade.source ?? '').startsWith('liquid-scan')) continue;
    const comboKey = liquidComboKey(trade);
    const cycle = liquidComboCycleContext(trade);
    if (
      !comboKey
      || comboKey.includes('NO_DATA')
      || !cycle.complete
    ) continue;
    const key = `${comboKey} || CYCLE ${cycle.key}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        comboKey,
        cycle,
        total: 0,
        active: 0,
        pending: 0,
        activePnl: 0,
        pulseCounts: {},
        records: [],
      });
    }
    const group = groups.get(key);
    const status = String(trade.status ?? '').toUpperCase();
    group.total += 1;
    group.pulseCounts[cycle.pulse] = (group.pulseCounts[cycle.pulse] ?? 0) + 1;
    if (status === 'OPEN') {
      group.active += 1;
      group.activePnl += netPnlOf(trade);
      continue;
    }
    if (status !== 'CLOSED') {
      group.pending += 1;
      continue;
    }
    if (String(trade.outcome ?? '').toUpperCase() === 'INVALID') continue;
    const tradeEntryMs = entryMs(trade);
    const day = entryDay(trade);
    if (!(tradeEntryMs > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    group.records.push({
      entryMs: tradeEntryMs,
      day,
      netPnl: netPnlOf(trade),
      netRoe: bounded(netRoeOf(trade), -30, 30),
    });
  }

  const rows = [...groups.values()]
    .map(publicRow)
    .sort((a, b) => b.score - a.score
      || b.history.days - a.history.days
      || b.history.closed - a.history.closed);
  const stableGood = rows
    .filter((row) => row.tier === 'STABLE_GOOD')
    .slice(0, Math.max(1, Number(stableLimit) || 12));
  const formingGood = rows
    .filter((row) => row.tier === 'FORMING_GOOD')
    .slice(0, Math.max(1, Number(formingLimit) || 8));
  const counts = rows.reduce((result, row) => {
    result[row.tier] = (result[row.tier] ?? 0) + 1;
    return result;
  }, {
    STABLE_GOOD: 0,
    FORMING_GOOD: 0,
    WATCH: 0,
    RISK: 0,
    NEW: 0,
  });
  const today = buildLiquidComboCycleTodayStats(trades, {
    allowedKeys: stableGood.map((row) => row.key),
  });
  return {
    version: LIQUID_COMBO_CYCLE_STATS_VERSION,
    mode: 'OBSERVATION_ONLY',
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    affectsSl: false,
    affectsTp: false,
    criteria: {
      episodeMinutes: EPISODE_MS / 60_000,
      recentDays: RECENT_DAY_LIMIT,
      stable: {
        minClosed: STABLE_MIN_CLOSED,
        minEpisodes: STABLE_MIN_EPISODES,
        minDays: STABLE_MIN_DAYS,
        minPositiveDays: 3,
        minPositiveDayRate: 60,
        minAvgRoe: 0.5,
        minProfitFactor: 1.2,
      },
      forming: {
        minClosed: FORMING_MIN_CLOSED,
        minEpisodes: FORMING_MIN_EPISODES,
        minDays: FORMING_MIN_DAYS,
      },
    },
    counts,
    stableGood,
    formingGood,
    today,
  };
}
