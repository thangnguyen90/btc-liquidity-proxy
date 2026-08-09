import { getPumpEvalRule } from './pumpEvalRule.js';

export const PUMP_EVAL_TIER_STATS_VERSION = 'PUMP_EVAL_TIER_STATS_V1_20260726';
export const PUMP_EVAL_RULE_FALLBACK_VERSION = 'PUMP_EVAL_V1_2026_07_20';

const TIER_ORDER = ['A', 'B', 'BLOCK'];

function normalizeTier(value, fallback = '') {
  const tier = String(value ?? '').trim().toUpperCase();
  return TIER_ORDER.includes(tier) ? tier : fallback;
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scoreFromSource(source) {
  const score = Number(String(source ?? '').match(/^pump-(\d+)/i)?.[1]);
  return Number.isFinite(score) ? score : null;
}

function bangkokHourOf(trade = {}) {
  const stored = finiteNumber(trade.pumpEvalHour);
  if (stored != null) return stored;
  const at = Date.parse(trade.createdAt ?? trade.openedAt ?? '');
  return Number.isFinite(at)
    ? new Date(at + (7 * 60 * 60 * 1000)).getUTCHours()
    : null;
}

export function isNativePumpEvalTrade(trade = {}) {
  return /^pump-\d+(?:-|$)/i.test(String(trade.source ?? ''));
}

export function pumpEvalTierSnapshot(trade = {}) {
  if (!isNativePumpEvalTrade(trade)) return {};

  const savedTier = normalizeTier(trade.pumpEvalTier);
  if (savedTier && trade.pumpEvalVersion) {
    return {
      pumpEvalTier: savedTier,
      pumpEvalLabel: trade.pumpEvalLabel ?? `PUMP_EVAL_${savedTier}`,
      pumpEvalReason: trade.pumpEvalReason ?? 'Pump Eval snapshot lưu tại entry.',
      pumpEvalVersion: trade.pumpEvalVersion,
      pumpEvalHour: finiteNumber(trade.pumpEvalHour),
      pumpEvalCorrBucket: trade.pumpEvalCorrBucket ?? null,
      pumpEvalBtcPhase: trade.pumpEvalBtcPhase ?? null,
      pumpEvalContextKey: trade.pumpEvalContextKey ?? null,
      pumpEvalDerived: false,
      pumpEvalStatsVersion: PUMP_EVAL_TIER_STATS_VERSION,
    };
  }

  const factors = trade.pumpSignalFactors ?? trade.factors ?? {};
  const health = trade.btcHealth ?? {};
  const rule = getPumpEvalRule({
    side: trade.side ?? trade.action,
    type: trade.pumpSignalType ?? trade.type ?? trade.signalType,
    interval: trade.pumpSignalTimeframe
      ?? trade.interval
      ?? factors.timeframe
      ?? '15m',
    score: trade.pumpScore ?? trade.score ?? scoreFromSource(trade.source),
    volRatio: factors.volRatio ?? factors.volume ?? factors.volNowX,
    chasePct: factors.chasePct,
    marketOk: trade.pumpSignalMarketOk ?? trade.marketOk,
    btcTrendDir: health.btcTrendDir ?? trade.btcTrendDir,
    btcTrendScore: health.btcTrendScore ?? trade.btcTrendScore,
    btcPct6h: health.pct6h ?? trade.btcPct6h,
    btcCorr: trade.btcCorr,
    hour: bangkokHourOf(trade),
  });
  return {
    pumpEvalTier: rule.tier,
    pumpEvalLabel: rule.label,
    pumpEvalReason: `${rule.reason} · suy ra từ snapshot lịch sử để thống kê`,
    pumpEvalVersion: PUMP_EVAL_RULE_FALLBACK_VERSION,
    pumpEvalHour: rule.hour,
    pumpEvalCorrBucket: rule.corrBucket,
    pumpEvalBtcPhase: rule.btcPhase,
    pumpEvalContextKey: rule.contextKey,
    pumpEvalDerived: true,
    pumpEvalStatsVersion: PUMP_EVAL_TIER_STATS_VERSION,
  };
}

export function decoratePumpEvalTier(trade = {}) {
  if (!isNativePumpEvalTrade(trade)) return trade;
  return { ...trade, ...pumpEvalTierSnapshot(trade) };
}

export function pumpEvalTierStats(trades = []) {
  const buckets = new Map(TIER_ORDER.map((tier) => [tier, {
    tier,
    label: tier === 'A'
      ? 'PUMP TIER A'
      : tier === 'B'
        ? 'PUMP TIER B · TEST'
        : 'PUMP TIER BLOCK',
    total: 0,
    active: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeTotal: 0,
    grossWin: 0,
    grossLoss: 0,
    snapshot: 0,
    backfill: 0,
  }]));

  for (const raw of trades) {
    if (!isNativePumpEvalTrade(raw)) continue;
    const trade = decoratePumpEvalTier(raw);
    const tier = normalizeTier(trade.pumpEvalTier, 'BLOCK');
    const row = buckets.get(tier);
    const pnl = finiteNumber(trade.pnl) ?? 0;
    row.total += 1;
    if (trade.pumpEvalDerived) row.backfill += 1;
    else row.snapshot += 1;

    if (trade.status === 'CLOSED') {
      row.closed += 1;
      row.realizedPnl += pnl;
      row.roeTotal += finiteNumber(trade.roe) ?? 0;
      if (pnl > 0) {
        row.wins += 1;
        row.grossWin += pnl;
      } else if (pnl < 0) {
        row.losses += 1;
        row.grossLoss += Math.abs(pnl);
      } else {
        row.breakeven += 1;
      }
    } else {
      row.active += 1;
      row.unrealizedPnl += pnl;
      if (trade.status === 'PENDING') row.pending += 1;
      else row.open += 1;
    }
  }

  return TIER_ORDER.map((tier) => {
    const row = buckets.get(tier);
    const decisive = row.wins + row.losses;
    const profitFactor = row.grossLoss > 0
      ? row.grossWin / row.grossLoss
      : row.grossWin > 0
        ? 9.99
        : 0;
    return {
      ...row,
      wr: decisive > 0 ? +((row.wins / decisive) * 100).toFixed(1) : null,
      avgRoe: row.closed > 0 ? +(row.roeTotal / row.closed).toFixed(1) : null,
      profitFactor: +profitFactor.toFixed(2),
      realizedPnl: +row.realizedPnl.toFixed(4),
      unrealizedPnl: +row.unrealizedPnl.toFixed(4),
      pnl: +(row.realizedPnl + row.unrealizedPnl).toFixed(4),
    };
  });
}

export function mergePumpEvalTierStats(...groups) {
  const numericKeys = [
    'total',
    'active',
    'open',
    'pending',
    'closed',
    'wins',
    'losses',
    'breakeven',
    'realizedPnl',
    'unrealizedPnl',
    'roeTotal',
    'grossWin',
    'grossLoss',
    'snapshot',
    'backfill',
  ];
  return TIER_ORDER.map((tier) => {
    const sourceRows = groups
      .flat()
      .filter((row) => normalizeTier(row?.tier) === tier);
    const row = Object.fromEntries(numericKeys.map((key) => [
      key,
      sourceRows.reduce((sum, source) => sum + (finiteNumber(source?.[key]) ?? 0), 0),
    ]));
    const decisive = row.wins + row.losses;
    const profitFactor = row.grossLoss > 0
      ? row.grossWin / row.grossLoss
      : row.grossWin > 0
        ? 9.99
        : 0;
    return {
      tier,
      label: tier === 'A'
        ? 'PUMP TIER A'
        : tier === 'B'
          ? 'PUMP TIER B · TEST'
          : 'PUMP TIER BLOCK',
      ...row,
      wr: decisive > 0 ? +((row.wins / decisive) * 100).toFixed(1) : null,
      avgRoe: row.closed > 0 ? +(row.roeTotal / row.closed).toFixed(1) : null,
      profitFactor: +profitFactor.toFixed(2),
      realizedPnl: +row.realizedPnl.toFixed(4),
      unrealizedPnl: +row.unrealizedPnl.toFixed(4),
      pnl: +(row.realizedPnl + row.unrealizedPnl).toFixed(4),
    };
  });
}
