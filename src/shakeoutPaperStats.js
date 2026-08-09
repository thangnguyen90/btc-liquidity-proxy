import { evaluateShakeoutChaseShortTier } from './shakeoutChaseShortTier.js';

export const SHAKEOUT_MARKET_INDEPENDENT_OBSERVATION_VERSION =
  'SHAKEOUT_MARKET_INDEPENDENT_OBS_V2_20260727';
export const SHAKEOUT_MARKET_INDEPENDENT_DATA_START = '2026-07-14';
export const SHAKEOUT_SHORT_WAVE_VERSION =
  'SHAKEOUT_SHORT_WAVE_OBS_V1_20260727';
export const SHAKEOUT_SHORT_WAVE_DATA_START = '2026-06-21';
export const SHAKEOUT_SHORT_WAVE_WINDOW_MINUTES = 120;

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function paperDay(trade = {}) {
  return String(trade.createdAt ?? trade.openedAt ?? trade.closedAt ?? '').slice(0, 10);
}

function scoreBucket(trade = {}) {
  const score = number(trade.score, 0);
  if (score >= 90) return '90+';
  if (score >= 85) return '85-89';
  if (score >= 80) return '80-84';
  if (score >= 75) return '75-79';
  if (score >= 70) return '70-74';
  if (score >= 65) return '65-69';
  if (score >= 60) return '60-64';
  if (score >= 55) return '55-59';
  return '<55';
}

function signalType(trade = {}) {
  return text(
    trade.signalType ?? trade.shakeoutClassLabel ?? trade.shakeoutClass,
    'UNKNOWN',
  );
}

function tradePnl(trade = {}) {
  return number(trade.netPnl ?? trade.pnl, 0);
}

function tradeRoe(trade = {}) {
  return number(trade.netRoe ?? trade.roe, 0);
}

function isValidClosed(trade = {}) {
  return trade.status === 'CLOSED' && trade.outcome !== 'INVALID';
}

function marketIndependentRelation(trade = {}) {
  const stored = text(
    trade.btcRelationLabel
      ?? trade.shakeoutObservationSnapshot?.btcRelation,
  ).toUpperCase();
  if (stored) {
    return {
      independent: stored.includes('DOC_LAP')
        || stored.includes('INDEPENDENT')
        || stored.includes('CORR_RAC'),
      source: 'ENTRY_RELATION_LABEL',
      value: stored,
    };
  }
  const bucket = text(trade.shakeoutObservationBuckets?.btcCorr).toUpperCase();
  if (bucket) {
    return {
      independent: bucket.includes('CORR_RAC') || bucket.includes('INDEPENDENT'),
      source: 'ENTRY_OBSERVATION_BUCKET',
      value: bucket,
    };
  }
  const corr = Number(trade.btcCorr ?? trade.btcRelation?.corr);
  return {
    independent: Number.isFinite(corr) && Math.abs(corr) < 0.3,
    source: Number.isFinite(corr) ? 'ENTRY_BTC_CORR' : 'NO_DATA',
    value: Number.isFinite(corr) ? +corr.toFixed(3) : null,
  };
}

function marketIndependentSetup(trade = {}) {
  return text(
    trade.shakeoutClass
      ?? trade.shakeoutObservationSnapshot?.setup
      ?? trade.signalType,
    'SETUP_NO_DATA',
  ).toUpperCase();
}

function isMarketIndependentShortProbe(trade = {}) {
  return marketIndependentSetup(trade) === 'WEAK_REJECT'
    && Boolean(trade.highJumpRisk);
}

function marketIndependentTierMeta(tier) {
  if (tier === 'LONG_EDGE') {
    return { side: 'LONG', label: 'OBS LONG EDGE' };
  }
  if (tier === 'SHORT_PROBE') {
    return { side: 'SHORT', label: 'OBS SHORT PROBE' };
  }
  return { side: 'SHORT', label: 'OBS SHORT NO EDGE' };
}

export function evaluateShakeoutMarketIndependentObservation(trade = {}) {
  const side = text(trade.side).toUpperCase();
  const variant = text(trade.variant).toUpperCase();
  const relation = marketIndependentRelation(trade);
  const entryDay = marketIndependentDay(trade);
  const inEvaluationWindow = !entryDay
    || entryDay >= SHAKEOUT_MARKET_INDEPENDENT_DATA_START;
  const applies = variant === 'MARKET'
    && ['LONG', 'SHORT'].includes(side)
    && relation.independent
    && inEvaluationWindow;
  const shortProbe = applies
    && side === 'SHORT'
    && isMarketIndependentShortProbe(trade);
  const tier = !applies
    ? null
    : side === 'LONG'
      ? 'LONG_EDGE'
      : shortProbe
        ? 'SHORT_PROBE'
        : 'SHORT_NO_EDGE';
  const label = tier ? marketIndependentTierMeta(tier).label : null;
  const score = Number(trade.score ?? trade.shakeoutObservationSnapshot?.score);
  const btcPhase = text(
    trade.btcPhase ?? trade.shakeoutObservationSnapshot?.btcPhase,
    'BTC_NO_DATA',
  ).toUpperCase();
  const shortProbePreferred = shortProbe
    && Number.isFinite(score)
    && score < 65
    && btcPhase.includes('UP')
    && !btcPhase.includes('DOWN');
  return {
    shakeoutMarketIndependentVersion: SHAKEOUT_MARKET_INDEPENDENT_OBSERVATION_VERSION,
    shakeoutMarketIndependentOnly: true,
    shakeoutMarketIndependentDataStart: SHAKEOUT_MARKET_INDEPENDENT_DATA_START,
    shakeoutMarketIndependentApplies: applies,
    shakeoutMarketIndependentTier: tier,
    shakeoutMarketIndependentLabel: label,
    shakeoutMarketIndependentShortProbePreferred: shortProbePreferred,
    shakeoutMarketIndependentRelationSource: relation.source,
    shakeoutMarketIndependentRelation: relation.value,
    shakeoutMarketIndependentReason: shortProbe
      ? `SHORT + MARKET + BTC independent + WEAK_REJECT + HIGH_JUMP at entry${shortProbePreferred ? '; preferred score<65 + BTC_UP' : ''}; observe/statistics only`
      : applies
        ? `${side} + MARKET + BTC independent at entry; observe/statistics only`
      : !inEvaluationWindow
        ? `Before evaluation window ${SHAKEOUT_MARKET_INDEPENDENT_DATA_START}`
        : null,
  };
}

export function enrichShakeoutMarketIndependentObservation(trade = {}) {
  return {
    ...trade,
    ...evaluateShakeoutMarketIndependentObservation(trade),
  };
}

function marketIndependentDay(trade = {}) {
  return String(trade.openedAt ?? trade.createdAt ?? trade.closedAt ?? '').slice(0, 10);
}

function summarizeMarketIndependentGroup(trades, tier) {
  const meta = marketIndependentTierMeta(tier);
  const selected = trades
    .map(enrichShakeoutMarketIndependentObservation)
    .filter((trade) => (
      trade.shakeoutMarketIndependentApplies
      && trade.shakeoutMarketIndependentTier === tier
    ));
  const closed = selected.filter(isValidClosed);
  const open = selected.filter((trade) => trade.status === 'OPEN');
  const pending = selected.filter((trade) => trade.status === 'PENDING');
  const wins = closed.filter((trade) => tradePnl(trade) > 0).length;
  const episodeMap = new Map();
  const dailyMap = new Map();

  for (const trade of selected) {
    const day = marketIndependentDay(trade);
    if (!day) continue;
    const daily = dailyMap.get(day) ?? {
      day,
      total: 0,
      open: 0,
      pending: 0,
      closed: 0,
      wins: 0,
      losses: 0,
      closedPnl: 0,
      activePnl: 0,
      episodeRoe: 0,
    };
    daily.total += 1;
    if (trade.status === 'OPEN') {
      daily.open += 1;
      daily.activePnl += tradePnl(trade);
    }
    if (trade.status === 'PENDING') daily.pending += 1;
    if (isValidClosed(trade)) {
      const pnl = tradePnl(trade);
      daily.closed += 1;
      daily.closedPnl += pnl;
      if (pnl > 0) daily.wins += 1;
      else daily.losses += 1;
      const openedAt = Date.parse(trade.openedAt ?? trade.createdAt ?? '');
      const bucket = Number.isFinite(openedAt)
        ? Math.floor(openedAt / (15 * 60 * 1000))
        : text(trade.id, `${day}:${daily.closed}`);
      const episodeKey = `${day}|${bucket}`;
      const episode = episodeMap.get(episodeKey) ?? {
        day,
        roeSum: 0,
        count: 0,
      };
      episode.roeSum += Math.max(-20, Math.min(30, tradeRoe(trade)));
      episode.count += 1;
      episodeMap.set(episodeKey, episode);
    }
    dailyMap.set(day, daily);
  }

  const episodes = [...episodeMap.values()].map((episode) => ({
    ...episode,
    roe: episode.count ? episode.roeSum / episode.count : 0,
  }));
  for (const episode of episodes) {
    const daily = dailyMap.get(episode.day);
    if (daily) daily.episodeRoe += episode.roe;
  }
  const grossWin = episodes.reduce((sum, episode) => sum + Math.max(0, episode.roe), 0);
  const grossLoss = episodes.reduce((sum, episode) => sum + Math.max(0, -episode.roe), 0);
  const daily = [...dailyMap.values()]
    .map((row) => ({
      ...row,
      closedPnl: +row.closedPnl.toFixed(4),
      activePnl: +row.activePnl.toFixed(4),
      totalPnl: +(row.closedPnl + row.activePnl).toFixed(4),
      episodeRoe: +row.episodeRoe.toFixed(2),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const closedPnl = closed.reduce((sum, trade) => sum + tradePnl(trade), 0);
  const activePnl = open.reduce((sum, trade) => sum + tradePnl(trade), 0);
  const positiveDays = daily.filter((row) => row.closed > 0 && row.episodeRoe > 0).length;
  const totalDays = daily.filter((row) => row.closed > 0).length;
  return {
    side: meta.side,
    tier,
    label: meta.label,
    total: selected.length,
    open: open.length,
    pending: pending.length,
    closed: closed.length,
    wins,
    losses: closed.length - wins,
    winRate: closed.length ? +(wins / closed.length * 100).toFixed(1) : null,
    closedPnl: +closedPnl.toFixed(4),
    activePnl: +activePnl.toFixed(4),
    totalPnl: +(closedPnl + activePnl).toFixed(4),
    avgEpisodeRoe: episodes.length
      ? +(episodes.reduce((sum, episode) => sum + episode.roe, 0) / episodes.length).toFixed(2)
      : null,
    profitFactor: grossLoss > 0
      ? +Math.min(9.99, grossWin / grossLoss).toFixed(2)
      : grossWin > 0 ? 9.99 : 0,
    positiveDays,
    totalDays,
    daily,
  };
}

function buildMarketIndependentStats(trades) {
  return {
    version: SHAKEOUT_MARKET_INDEPENDENT_OBSERVATION_VERSION,
    mode: 'OBSERVE_ONLY',
    canAffectTrading: false,
    dataStart: SHAKEOUT_MARKET_INDEPENDENT_DATA_START,
    episodeMinutes: 15,
    groups: [
      summarizeMarketIndependentGroup(trades, 'LONG_EDGE'),
      summarizeMarketIndependentGroup(trades, 'SHORT_PROBE'),
      summarizeMarketIndependentGroup(trades, 'SHORT_NO_EDGE'),
    ],
  };
}

function shortWaveSignalTime(trade = {}) {
  const raw = trade.signalAt ?? trade.createdAt ?? trade.openedAt;
  const timestamp = Date.parse(raw ?? '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function shortWaveSignalDay(trade = {}) {
  return String(
    trade.signalAt ?? trade.createdAt ?? trade.openedAt ?? trade.closedAt ?? '',
  ).slice(0, 10);
}

function shortWaveFamily(trade = {}) {
  return text(
    trade.signalId ?? trade.parentSignalId ?? trade.id,
    `NO_FAMILY_${shortWaveSignalTime(trade) ?? 'NO_TIME'}`,
  );
}

function shortWaveExecutionKey(trade = {}) {
  return [
    shortWaveFamily(trade),
    text(trade.variant, 'NO_VARIANT').toUpperCase(),
  ].join('|');
}

function isShortWaveCandidate(trade = {}) {
  const score = Number(trade.score ?? trade.shakeoutObservationSnapshot?.score);
  const setup = text(
    trade.shakeoutClass
      ?? trade.shakeoutObservationSnapshot?.setup
      ?? trade.signalType,
  ).toUpperCase();
  const day = shortWaveSignalDay(trade);
  return text(trade.side).toUpperCase() === 'SHORT'
    && setup === 'WEAK_REJECT'
    && Number.isFinite(score)
    && score >= 60
    && score <= 79
    && Boolean(day)
    && day >= SHAKEOUT_SHORT_WAVE_DATA_START
    && shortWaveSignalTime(trade) != null;
}

function classifyShortWaveTrades(trades = []) {
  const deduped = new Map();
  for (const trade of trades) {
    // This chart is a backtest of completed paper executions. Status/outcome,
    // PnL and ROE are never used to decide WAVE versus ISOLATED.
    if (!isShortWaveCandidate(trade) || !isValidClosed(trade)) continue;
    const key = shortWaveExecutionKey(trade);
    const current = deduped.get(key);
    if (!current || shortWaveSignalTime(trade) < shortWaveSignalTime(current)) {
      deduped.set(key, trade);
    }
  }
  const ordered = [...deduped.values()].sort((a, b) => (
    shortWaveSignalTime(a) - shortWaveSignalTime(b)
    || text(a.id).localeCompare(text(b.id))
  ));
  const windowMs = SHAKEOUT_SHORT_WAVE_WINDOW_MINUTES * 60 * 1000;
  const recent = [];
  return ordered.map((trade) => {
    const timestamp = shortWaveSignalTime(trade);
    const family = shortWaveFamily(trade);
    while (recent.length && recent[0].timestamp < timestamp - windowMs) recent.shift();
    const wave = recent.some((prior) => (
      prior.timestamp < timestamp && prior.family !== family
    ));
    recent.push({ timestamp, family });
    return { trade, tier: wave ? 'WAVE' : 'ISOLATED' };
  });
}

function summarizeShortWaveGroup(classified, tier) {
  const selected = classified
    .filter((row) => row.tier === tier)
    .map((row) => row.trade);
  const closed = selected.filter(isValidClosed);
  const open = selected.filter((trade) => trade.status === 'OPEN');
  const pending = selected.filter((trade) => trade.status === 'PENDING');
  const wins = closed.filter((trade) => tradePnl(trade) > 0).length;
  const episodeMap = new Map();
  const dailyMap = new Map();

  for (const trade of selected) {
    const day = shortWaveSignalDay(trade);
    if (!day) continue;
    const daily = dailyMap.get(day) ?? {
      day,
      total: 0,
      open: 0,
      pending: 0,
      closed: 0,
      wins: 0,
      losses: 0,
      closedPnl: 0,
      activePnl: 0,
      episodeRoe: 0,
    };
    daily.total += 1;
    if (trade.status === 'OPEN') {
      daily.open += 1;
      daily.activePnl += tradePnl(trade);
    }
    if (trade.status === 'PENDING') daily.pending += 1;
    if (isValidClosed(trade)) {
      const pnl = tradePnl(trade);
      daily.closed += 1;
      daily.closedPnl += pnl;
      if (pnl > 0) daily.wins += 1;
      else daily.losses += 1;
      const timestamp = shortWaveSignalTime(trade);
      const bucket = timestamp == null
        ? text(trade.id, `${day}:${daily.closed}`)
        : Math.floor(timestamp / (15 * 60 * 1000));
      const episodeKey = `${day}|${bucket}`;
      const episode = episodeMap.get(episodeKey) ?? { day, roeSum: 0, count: 0 };
      episode.roeSum += Math.max(-20, Math.min(30, tradeRoe(trade)));
      episode.count += 1;
      episodeMap.set(episodeKey, episode);
    }
    dailyMap.set(day, daily);
  }

  const episodes = [...episodeMap.values()].map((episode) => ({
    ...episode,
    roe: episode.count ? episode.roeSum / episode.count : 0,
  }));
  for (const episode of episodes) {
    const daily = dailyMap.get(episode.day);
    if (daily) daily.episodeRoe += episode.roe;
  }
  const grossWin = episodes.reduce((sum, episode) => sum + Math.max(0, episode.roe), 0);
  const grossLoss = episodes.reduce((sum, episode) => sum + Math.max(0, -episode.roe), 0);
  const daily = [...dailyMap.values()]
    .map((row) => ({
      ...row,
      closedPnl: +row.closedPnl.toFixed(4),
      activePnl: +row.activePnl.toFixed(4),
      totalPnl: +(row.closedPnl + row.activePnl).toFixed(4),
      episodeRoe: +row.episodeRoe.toFixed(2),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const closedPnl = closed.reduce((sum, trade) => sum + tradePnl(trade), 0);
  const activePnl = open.reduce((sum, trade) => sum + tradePnl(trade), 0);
  const totalDays = daily.filter((row) => row.closed > 0).length;
  return {
    side: 'SHORT',
    tier,
    label: tier === 'WAVE' ? 'OBS SHORT WAVE' : 'OBS SHORT ISOLATED',
    total: selected.length,
    open: open.length,
    pending: pending.length,
    closed: closed.length,
    wins,
    losses: closed.length - wins,
    winRate: closed.length ? +(wins / closed.length * 100).toFixed(1) : null,
    closedPnl: +closedPnl.toFixed(4),
    activePnl: +activePnl.toFixed(4),
    totalPnl: +(closedPnl + activePnl).toFixed(4),
    avgEpisodeRoe: episodes.length
      ? +(episodes.reduce((sum, episode) => sum + episode.roe, 0) / episodes.length).toFixed(2)
      : null,
    profitFactor: grossLoss > 0
      ? +Math.min(9.99, grossWin / grossLoss).toFixed(2)
      : grossWin > 0 ? 9.99 : 0,
    positiveDays: daily.filter((row) => row.closed > 0 && row.closedPnl > 0).length,
    totalDays,
    daily,
  };
}

function buildShortWaveStats(trades) {
  const classified = classifyShortWaveTrades(trades);
  return {
    version: SHAKEOUT_SHORT_WAVE_VERSION,
    mode: 'OBSERVE_ONLY',
    canAffectTrading: false,
    dataStart: SHAKEOUT_SHORT_WAVE_DATA_START,
    windowMinutes: SHAKEOUT_SHORT_WAVE_WINDOW_MINUTES,
    rule: 'SHORT + WEAK_REJECT + score 60-79; prior distinct signal family within 120 minutes',
    sample: 'VALID_CLOSED_PAPER_ONLY',
    groups: [
      summarizeShortWaveGroup(classified, 'WAVE'),
      summarizeShortWaveGroup(classified, 'ISOLATED'),
    ],
  };
}

function buildClosedGroupStats(trades, keyOf) {
  const groups = new Map();
  for (const trade of trades) {
    const key = text(keyOf(trade), 'UNKNOWN');
    const row = groups.get(key) ?? {
      key,
      total: 0,
      open: 0,
      pending: 0,
      closed: 0,
      wins: 0,
      losses: 0,
      tpHits: 0,
      slHits: 0,
      pnl: 0,
      roeSum: 0,
    };
    row.total += 1;
    if (trade.status === 'OPEN') row.open += 1;
    if (trade.status === 'PENDING') row.pending += 1;
    if (isValidClosed(trade)) {
      const pnl = tradePnl(trade);
      row.closed += 1;
      row.pnl += pnl;
      row.roeSum += tradeRoe(trade);
      if (pnl > 0) row.wins += 1;
      else if (pnl < 0) row.losses += 1;
      if (['TP', 'RUNNER_TP'].includes(trade.outcome)) row.tpHits += 1;
      if (trade.outcome === 'SL') row.slHits += 1;
    }
    groups.set(key, row);
  }
  return [...groups.values()]
    .map((row) => ({
      ...row,
      pnl: +row.pnl.toFixed(4),
      avgRoe: row.closed ? +(row.roeSum / row.closed).toFixed(1) : null,
      winRate: row.wins + row.losses
        ? +((row.wins / (row.wins + row.losses)) * 100).toFixed(1)
        : 0,
    }))
    .sort((a, b) => (
      b.closed - a.closed
      || number(b.avgRoe, -999) - number(a.avgRoe, -999)
      || b.pnl - a.pnl
    ));
}

function isChaseTrade(trade = {}) {
  const quality = text(trade.shakeoutQuality).toUpperCase();
  const variant = text(trade.variant).toUpperCase();
  const tag = text(trade.tag).toUpperCase();
  const note = text(trade.note);
  return quality === 'CHASE'
    || variant === 'CHASE'
    || tag.includes('CHASE')
    || /CHASE_CANDLE_TEST/i.test(note)
    || /pending missed but candle turned/i.test(note);
}

function chaseShortTierOf(trade = {}) {
  const storedTier = text(trade.shakeoutChaseShortTier).toUpperCase();
  const evaluated = evaluateShakeoutChaseShortTier({
    variant: trade.variant,
    side: trade.side,
    score: trade.score,
    btcPhase: trade.btcPhase,
    tierAMarginUsdt: trade.shakeoutChaseShortTier === 'A'
      ? trade.shakeoutChaseShortMarginUsdt
      : 10,
    tierBMarginUsdt: trade.shakeoutChaseShortTier === 'B_TEST'
      ? trade.shakeoutChaseShortMarginUsdt
      : 5,
  });
  if (!evaluated.applies) return null;
  const tier = ['A', 'B_TEST'].includes(storedTier) ? storedTier : evaluated.tier;
  const marginUsdt = tier === 'A' ? 10 : 5;
  return {
    ...evaluated,
    tier,
    marginUsdt,
    label: tier === 'A' ? 'CHASE SHORT A' : 'CHASE SHORT B/TEST',
  };
}

function comboKey(trade = {}) {
  const stored = text(trade.shakeoutCombo ?? trade.combo);
  if (stored && stored !== '-') return stored;
  const score = Number(trade.score);
  const scorePart = Number.isFinite(score) ? `SCORE_${scoreBucket(trade)}` : 'SCORE_NO_DATA';
  return [
    signalType(trade).toUpperCase(),
    text(trade.side, '-').toUpperCase(),
    text(trade.signalTimeframe ?? trade.timeframe ?? trade.interval, '-'),
    text(
      trade.shakeoutBtcGateLabel
        ?? trade.btcGateLabel
        ?? trade.btcPhaseLabel
        ?? trade.btcPhase,
      'BTC_NO_DATA',
    ).toUpperCase(),
    text(trade.shakeoutRealGateLabel ?? trade.realGate, 'REAL_NO_DATA').toUpperCase(),
    text(trade.shakeoutQuality, 'QUALITY_UNKNOWN').toUpperCase(),
    scorePart,
  ].join(' | ');
}

function buildChaseStats(trades) {
  const selected = trades.filter(isChaseTrade);
  if (!selected.length) return {
    total: null,
    sides: [],
    shortTiers: [],
    groups: [],
  };
  const chaseShort = selected.filter((trade) => text(trade.side).toUpperCase() === 'SHORT');
  return {
    total: buildClosedGroupStats(selected, () => 'ALL CHASE')[0] ?? null,
    sides: buildClosedGroupStats(
      selected,
      (trade) => `CHASE ${text(trade.side, '-').toUpperCase()}`,
    ),
    shortTiers: buildClosedGroupStats(
      chaseShort,
      (trade) => {
        const tier = chaseShortTierOf(trade);
        return tier
          ? `${tier.label} · TARGET $${tier.marginUsdt}`
          : 'CHASE SHORT NO DATA';
      },
    ),
    groups: buildClosedGroupStats(selected, (trade) => [
      signalType(trade).toUpperCase(),
      text(trade.side, '-').toUpperCase(),
      text(trade.signalTimeframe ?? trade.timeframe ?? trade.interval, '-'),
      `SCORE_${scoreBucket(trade)}`,
      text(
        trade.shakeoutBtcGateLabel
          ?? trade.btcGateLabel
          ?? trade.btcPhaseLabel
          ?? trade.btcPhase,
        'BTC_NO_DATA',
      ).toUpperCase(),
    ].join(' | ')).slice(0, 20),
  };
}

function buildComboStats(trades) {
  const rank = { STRONG: 0, GOOD: 1, NEUTRAL: 2, BAD: 3 };
  return buildClosedGroupStats(trades, comboKey)
    .filter((row) => row.closed > 0 || row.open > 0 || row.pending > 0)
    .map((row) => {
      let verdict = 'NEUTRAL';
      if (row.closed >= 8 && row.winRate >= 80 && number(row.avgRoe) >= 3) verdict = 'STRONG';
      else if (row.closed >= 5 && row.pnl > 0 && number(row.avgRoe) >= 1) verdict = 'GOOD';
      else if (row.closed >= 5 && (row.pnl < 0 || number(row.avgRoe) < 0)) verdict = 'BAD';
      return { ...row, combo: row.key, verdict };
    })
    .sort((a, b) => (
      (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9)
      || Number(b.closed >= 8) - Number(a.closed >= 8)
      || number(b.avgRoe, -999) - number(a.avgRoe, -999)
      || b.pnl - a.pnl
      || b.closed - a.closed
    ))
    .slice(0, 40);
}

function buildSignalScoreStats(trades, selectedDay) {
  const latestDays = [...new Set(trades.map(paperDay).filter(Boolean))]
    .sort()
    .slice(-5);
  const scoped = selectedDay === 'all'
    ? trades.filter((trade) => latestDays.includes(paperDay(trade)))
    : trades;
  const bucketOrder = ['<55', '55-59', '60-64', '65-69', '70-74', '75-79', '80-84', '85-89', '90+'];
  const rows = buildClosedGroupStats(
    scoped,
    (trade) => [signalType(trade), text(trade.side, '-'), scoreBucket(trade)].join('|'),
  ).map((row) => {
    const [rowSignalType, side, rowScoreBucket] = row.key.split('|');
    return {
      ...row,
      signalType: rowSignalType,
      side,
      scoreBucket: rowScoreBucket,
    };
  }).sort((a, b) => (
    a.signalType.localeCompare(b.signalType)
    || a.side.localeCompare(b.side)
    || bucketOrder.indexOf(a.scoreBucket) - bucketOrder.indexOf(b.scoreBucket)
  ));
  return { latestDays, rows };
}

function stage2Gate(trade = {}) {
  const tier = text(trade.shakeoutStage2Tier).toUpperCase();
  const twoLayer = Boolean(trade.shakeoutStage2Layer1Tier)
    && ['WATCH_PLUS', 'WATCH', 'RISK'].includes(tier);
  return {
    twoLayer,
    tier: twoLayer ? tier : 'WATCH',
    layer1Tier: text(trade.shakeoutStage2Layer1Tier, 'NO_DATA'),
    setup: text(
      trade.shakeoutStage2Setup ?? trade.shakeoutClass ?? trade.subtype,
      'NO_SETUP',
    ),
    variant: text(trade.shakeoutStage2Variant ?? trade.variant, 'NO_VARIANT'),
    fillQuality: text(trade.shakeoutStage2FillQuality, 'NO_FILL_DATA'),
    flags: Array.isArray(trade.shakeoutStage2Flags) ? trade.shakeoutStage2Flags : [],
  };
}

function summarizeStage2(trades) {
  const closed = trades.filter(isValidClosed);
  const wins = closed.filter((trade) => tradePnl(trade) > 0).length;
  const pnlRows = trades.filter((trade) => trade.status === 'OPEN' || isValidClosed(trade));
  const pnl = pnlRows.reduce((sum, trade) => sum + tradePnl(trade), 0);
  const avgRoe = closed.length
    ? closed.reduce((sum, trade) => sum + tradeRoe(trade), 0) / closed.length
    : null;
  return {
    total: trades.length,
    captured: trades.filter((trade) => Boolean(trade.shakeoutStage2AuditCaptured)).length,
    open: trades.filter((trade) => trade.status === 'OPEN').length,
    pending: trades.filter((trade) => trade.status === 'PENDING').length,
    closed: closed.length,
    wins,
    losses: closed.length - wins,
    winRate: closed.length ? +(wins / closed.length * 100).toFixed(1) : null,
    pnl: +pnl.toFixed(4),
    avgRoe: avgRoe == null ? null : +avgRoe.toFixed(1),
  };
}

function buildStage2Stats(trades) {
  const twoLayerTrades = trades.filter((trade) => stage2Gate(trade).twoLayer);
  const tiers = ['WATCH_PLUS', 'WATCH', 'RISK'].map((tier) => ({
    tier,
    ...summarizeStage2(
      twoLayerTrades.filter((trade) => stage2Gate(trade).tier === tier),
    ),
  }));
  const detailMap = new Map();
  for (const trade of twoLayerTrades) {
    const gate = stage2Gate(trade);
    const key = [
      gate.layer1Tier,
      gate.setup,
      gate.variant,
      gate.fillQuality,
      gate.tier,
    ].join('|');
    const group = detailMap.get(key) ?? { ...gate, trades: [] };
    group.trades.push(trade);
    detailMap.set(key, group);
  }
  const details = [...detailMap.values()]
    .map((group) => {
      const { trades: groupTrades, ...identity } = group;
      return { ...identity, ...summarizeStage2(groupTrades) };
    })
    .sort((a, b) => (
      b.total - a.total
      || a.layer1Tier.localeCompare(b.layer1Tier)
      || a.setup.localeCompare(b.setup)
      || a.variant.localeCompare(b.variant)
      || a.fillQuality.localeCompare(b.fillQuality)
    ));
  const auditSpecs = [
    {
      flag: 'AUDIT_CLEAN',
      select: (trade) => (
        trade.shakeoutStage2AuditCaptured && stage2Gate(trade).flags.length === 0
      ),
    },
    {
      flag: 'AUDIT_NOT_CAPTURED',
      select: (trade) => !trade.shakeoutStage2AuditCaptured,
    },
    ...['DUPLICATE_ACTIVE', 'BTC_CANDLE_CONFLICT', 'STALE_FILL', 'DRIFT_RISK']
      .map((flag) => ({
        flag,
        select: (trade) => stage2Gate(trade).flags.includes(flag),
      })),
  ];
  const audits = auditSpecs.map(({ flag, select }) => ({
    flag,
    ...summarizeStage2(twoLayerTrades.filter(select)),
  }));
  return {
    scopeTotal: trades.length,
    twoLayerTotal: twoLayerTrades.length,
    tiers,
    details,
    audits,
  };
}

export function buildShakeoutPaperAggregateStats(trades = [], { day = 'all' } = {}) {
  const rows = Array.isArray(trades) ? trades : [];
  return {
    scope: {
      total: rows.length,
      paginated: false,
      day: text(day, 'all'),
    },
    chase: buildChaseStats(rows),
    combos: buildComboStats(rows),
    signalScore: buildSignalScoreStats(rows, text(day, 'all')),
    stage2: buildStage2Stats(rows),
    marketIndependent: buildMarketIndependentStats(rows),
    shortWave: buildShortWaveStats(rows),
  };
}
