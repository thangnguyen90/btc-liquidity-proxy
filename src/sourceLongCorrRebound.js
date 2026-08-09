export const SOURCE_LONG_CORR_REBOUND_VERSION =
  'SOURCE_LONG_CORR_REBOUND_V1_20260802';

export const SOURCE_LONG_CORR_REBOUND_PROFILES = Object.freeze({
  EMA_SQUEEZE: 'EMA_SQUEEZE_LONG_CORR_REBOUND',
  EDGE_SC_SPRING: 'EDGE_SC_SPRING_LONG_CORR_REBOUND',
});

const PROFILE_META = Object.freeze({
  [SOURCE_LONG_CORR_REBOUND_PROFILES.EMA_SQUEEZE]: {
    sourcePage: 'pump',
    sourceFamily: 'EMA',
    setup: 'SQUEEZE',
    label: 'EMA SQUEEZE CORR REBOUND',
  },
  [SOURCE_LONG_CORR_REBOUND_PROFILES.EDGE_SC_SPRING]: {
    sourcePage: 'edge',
    sourceFamily: 'SHORT_EDGE',
    setup: 'SC_SPRING',
    label: 'SE SC SPRING CORR REBOUND',
  },
});

function finite(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value, fallback = '') {
  const text = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return text || fallback;
}

function sourceProfileOf(trade = {}, sourcePage = '') {
  const page = String(sourcePage ?? '').trim().toLowerCase();
  const side = normalize(trade.side ?? trade.action);
  if (side !== 'LONG') return null;

  const source = String(trade.source ?? '').toLowerCase();
  if (
    page === 'pump'
    && source.startsWith('emasq-')
    && source.includes('squeeze')
    && !source.includes('squeeze_short')
  ) {
    return SOURCE_LONG_CORR_REBOUND_PROFILES.EMA_SQUEEZE;
  }

  const setup = normalize(
    trade.pumpSignalType
      ?? trade.signalType
      ?? trade.type,
  );
  if (page === 'edge' && setup === 'SC_SPRING') {
    return SOURCE_LONG_CORR_REBOUND_PROFILES.EDGE_SC_SPRING;
  }
  return null;
}

function contextOf(trade = {}) {
  const health = trade.btcHealth ?? {};
  const corr = finite(trade.btcCorr);
  const direction = normalize(health.btcTrendDir ?? trade.btcTrendDir);
  const trendScore = finite(health.btcTrendScore ?? trade.btcTrendScore);
  const pct24h = finite(health.pct24h ?? trade.btcPct24h);
  const rsi4h = finite(health.rsi4h ?? trade.btcRsi4h);
  const complete = corr != null
    && ['UP', 'DOWN'].includes(direction)
    && trendScore != null
    && pct24h != null
    && rsi4h != null;
  const matched = complete
    && corr >= 0.5
    && direction === 'DOWN'
    && trendScore < 45
    && pct24h > -0.2
    && pct24h < 0.2
    && rsi4h < 50;
  return { corr, direction, trendScore, pct24h, rsi4h, complete, matched };
}

export function evaluateSourceLongCorrRebound(
  trade = {},
  { sourcePage = '' } = {},
) {
  const profile = sourceProfileOf(trade, sourcePage);
  if (!profile) return null;
  const meta = PROFILE_META[profile];
  const context = contextOf(trade);
  let reason =
    `${meta.sourceFamily} ${meta.setup} LONG; waiting for the exact counter-BTC rebound context.`;
  if (!context.complete) {
    reason = 'Missing corr, BTC direction/score, pct24h or RSI4h in the entry snapshot.';
  } else if (context.matched) {
    reason =
      `${meta.sourceFamily} ${meta.setup} LONG + corr>=0.5 + BTC DOWN score<45`
      + ' + DAY_FLAT (-0.2%..+0.2%) + RSI4h<50; provisional 14-day validation, OBSERVE ONLY.';
  }

  return {
    sourceLongCorrReboundProfileEligible: true,
    sourceLongCorrReboundMatched: context.matched,
    sourceLongCorrReboundTier: context.matched ? 'PROVISIONAL' : 'UNRATED',
    sourceLongCorrReboundCode: profile,
    sourceLongCorrReboundLabel: context.matched ? meta.label : null,
    sourceLongCorrReboundSourcePage: meta.sourcePage,
    sourceLongCorrReboundSourceFamily: meta.sourceFamily,
    sourceLongCorrReboundSetup: meta.setup,
    sourceLongCorrReboundReason: reason,
    sourceLongCorrReboundCorr: context.corr,
    sourceLongCorrReboundBtcDirection: context.direction || null,
    sourceLongCorrReboundBtcTrendScore: context.trendScore,
    sourceLongCorrReboundBtcPct24h: context.pct24h,
    sourceLongCorrReboundBtcRsi4h: context.rsi4h,
    sourceLongCorrReboundSnapshotComplete: context.complete,
    sourceLongCorrReboundBasis: 'ENTRY_SNAPSHOT',
    sourceLongCorrReboundVersion: SOURCE_LONG_CORR_REBOUND_VERSION,
    sourceLongCorrReboundObservationOnly: true,
    sourceLongCorrReboundAffectsEntry: false,
    sourceLongCorrReboundAffectsMargin: false,
    sourceLongCorrReboundAffectsSl: false,
    sourceLongCorrReboundAffectsTp: false,
    sourceLongCorrReboundAffectsBinance: false,
    sourceLongCorrReboundDerived: false,
  };
}

export function sourceLongCorrReboundSnapshotForEntry(
  trade = {},
  options = {},
) {
  return evaluateSourceLongCorrRebound(trade, options) ?? {};
}

export function decorateSourceLongCorrReboundTrade(
  trade = {},
  options = {},
) {
  if (
    String(trade.sourceLongCorrReboundVersion ?? '')
      .startsWith(SOURCE_LONG_CORR_REBOUND_VERSION)
  ) return trade;
  const evaluated = evaluateSourceLongCorrRebound(trade, options);
  if (!evaluated) return trade;
  return {
    ...trade,
    ...evaluated,
    sourceLongCorrReboundBasis: 'DERIVED_ENTRY_SNAPSHOT',
    sourceLongCorrReboundVersion: `${SOURCE_LONG_CORR_REBOUND_VERSION}:DERIVED`,
    sourceLongCorrReboundDerived: true,
  };
}

export function decorateSourceLongCorrReboundTrades(trades = [], options = {}) {
  return (Array.isArray(trades) ? trades : [])
    .map((trade) => decorateSourceLongCorrReboundTrade(trade, options));
}

function estimatedFee(trade = {}) {
  const saved = finite(trade.estimatedFeeUsdt ?? trade.feeUsdt);
  if (saved != null && saved >= 0) return saved;
  const margin = finite(trade.marginUsdt ?? trade.marginUsd ?? trade.margin) ?? 0;
  const leverage = finite(trade.leverage) ?? 10;
  return margin > 0 && leverage > 0
    ? margin * leverage * 2 * 0.0004
    : 0;
}

function netResult(trade = {}) {
  const status = normalize(trade.status);
  const savedNet = status === 'CLOSED' ? finite(trade.netPnl) : null;
  const gross = finite(trade.grossPnl ?? trade.pnl) ?? 0;
  const netPnl = savedNet ?? (gross - estimatedFee(trade));
  const margin = finite(trade.marginUsdt ?? trade.marginUsd ?? trade.margin);
  const netRoe = margin != null && margin > 0
    ? netPnl / margin * 100
    : finite(trade.netRoe ?? trade.roe) ?? 0;
  return { netPnl, netRoe };
}

function bangkokDay(trade = {}) {
  const at = Date.parse(trade.openedAt ?? trade.createdAt ?? '');
  if (!Number.isFinite(at)) return null;
  return new Date(at + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function profileStats(trades, profile) {
  const meta = PROFILE_META[profile];
  const matched = trades.filter((trade) => (
    trade.sourceLongCorrReboundMatched === true
    && trade.sourceLongCorrReboundCode === profile
  ));
  let closed = 0;
  let active = 0;
  let pending = 0;
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let closedPnl = 0;
  let activePnl = 0;
  let closedRoe = 0;
  let grossWin = 0;
  let grossLoss = 0;
  const pnlByDay = new Map();

  for (const trade of matched) {
    const status = normalize(trade.status);
    if (status === 'CLOSED') {
      const result = netResult(trade);
      closed += 1;
      closedPnl += result.netPnl;
      closedRoe += result.netRoe;
      if (result.netPnl > 0) {
        wins += 1;
        grossWin += result.netPnl;
      } else if (result.netPnl < 0) {
        losses += 1;
        grossLoss += Math.abs(result.netPnl);
      } else {
        breakeven += 1;
      }
      const day = bangkokDay(trade);
      if (day) pnlByDay.set(day, (pnlByDay.get(day) ?? 0) + result.netPnl);
    } else if (status === 'OPEN' || status === 'ACTIVE') {
      active += 1;
      activePnl += netResult(trade).netPnl;
    } else {
      pending += 1;
    }
  }

  const decisive = wins + losses;
  const avgRoe = closed > 0 ? closedRoe / closed : null;
  const profitFactor = grossLoss > 0
    ? grossWin / grossLoss
    : grossWin > 0 ? 9.99 : 0;
  const positiveDays = [...pnlByDay.values()].filter((value) => value > 0).length;
  const tone = avgRoe == null
    ? 'NO_DATA'
    : avgRoe > 3.5
      ? 'GOOD'
      : avgRoe < -1 ? 'RISK' : 'WATCH';
  return {
    key: profile,
    label: meta.label,
    sourceFamily: meta.sourceFamily,
    setup: meta.setup,
    tier: 'PROVISIONAL',
    tone,
    total: matched.length,
    closed,
    active,
    pending,
    wins,
    losses,
    breakeven,
    wr: decisive > 0 ? +(wins / decisive * 100).toFixed(1) : null,
    closedPnl: +closedPnl.toFixed(4),
    activePnl: +activePnl.toFixed(4),
    totalPnl: +(closedPnl + activePnl).toFixed(4),
    avgRoe: avgRoe == null ? null : +avgRoe.toFixed(2),
    profitFactor: +profitFactor.toFixed(2),
    positiveDays,
    totalDays: pnlByDay.size,
    version: SOURCE_LONG_CORR_REBOUND_VERSION,
    observationOnly: true,
  };
}

export function buildSourceLongCorrReboundStats(
  trades = [],
  { sourcePage = '' } = {},
) {
  const page = String(sourcePage ?? '').trim().toLowerCase();
  const decorated = decorateSourceLongCorrReboundTrades(trades, { sourcePage: page });
  const profiles = Object.keys(PROFILE_META)
    .filter((profile) => PROFILE_META[profile].sourcePage === page);
  return profiles.map((profile) => profileStats(decorated, profile));
}
