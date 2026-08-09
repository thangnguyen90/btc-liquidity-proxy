export const EDGE_SHORT_TIER_VERSION = 'edge-short-two-layer-tier-observe-v1';

const TIER_ORDER = ['A', 'B', 'BLOCK'];

function finiteNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function normalize(value, fallback = '') {
  const text = String(value ?? '').trim().toUpperCase();
  return text || fallback;
}

function comboParts(trade = {}) {
  return String(trade.pumpCombo ?? trade.edgeCombo ?? '')
    .split('|')
    .map((part) => normalize(part))
    .filter(Boolean);
}

function sideOf(trade = {}) {
  const side = normalize(trade.side ?? trade.action);
  if (side.includes('SHORT')) return 'SHORT';
  if (side.includes('LONG')) return 'LONG';
  return side || 'SIDE_NO_DATA';
}

function btcDirectionOf(trade = {}) {
  const direct = normalize(
    trade.btcTrendDir
      ?? trade.btcHealth?.btcTrendDir
      ?? trade.btcTrend?.direction,
  );
  if (direct.includes('DOWN')) return 'DOWN';
  if (direct.includes('UP')) return 'UP';
  const phase = comboParts(trade).find((part) => /^BTC_(UP|DOWN)_/.test(part))
    ?? normalize(
      trade.btcPhase
        ?? trade.btcRegimeAtEntry
        ?? trade.btcRegime
        ?? trade.btcHealth?.regime,
    );
  if (phase.includes('DOWN')) return 'DOWN';
  if (phase.includes('UP')) return 'UP';
  return 'NO_DATA';
}

function candleNameOf(value) {
  if (value && typeof value === 'object') {
    return normalize(value.name ?? value.pattern ?? value.label, 'NO_DATA');
  }
  return normalize(value, 'NO_DATA');
}

function candleBiasOf(value) {
  const name = candleNameOf(value);
  if (name.includes('BEARISH') || name === 'SHOOTING_STAR') return 'BEARISH';
  if (name.includes('BULLISH') || name === 'HAMMER') return 'BULLISH';
  return 'NEUTRAL';
}

export function edgeShortCoreLayer(trade = {}) {
  const sourceTier = normalize(trade.edgeShortLabelTier, 'NO_DATA');
  const tier = ['PRIME', 'GOOD'].includes(sourceTier)
    ? 'GOOD'
    : sourceTier === 'RISK'
      ? 'RISK'
      : 'WATCH';
  return {
    tier,
    label: `CORE ${tier}`,
    sourceTier,
    sourceLabel: String(trade.edgeShortLabel ?? 'SE NO DATA'),
    reason: `${trade.edgeShortLabel ?? 'SE NO DATA'} -> CORE ${tier}`,
  };
}

export function edgeShortSideBtcLayer(trade = {}) {
  const side = sideOf(trade);
  const btcDirection = btcDirectionOf(trade);
  const btcCandle = trade.btcCandlePatternAtEntry
    ?? trade.btcCandleAtEntry
    ?? trade.btcCandlePattern5m
    ?? null;
  const btcCandleName = candleNameOf(btcCandle);
  const btcCandleBias = candleBiasOf(btcCandle);
  let tier = 'WATCH';
  let code = 'SIDE_BTC_NOT_CONFIRMED';

  const aligned = (
    (side === 'LONG' && btcDirection === 'UP' && btcCandleBias === 'BULLISH')
    || (side === 'SHORT' && btcDirection === 'DOWN' && btcCandleBias === 'BEARISH')
  );
  const opposed = (
    (side === 'LONG' && btcDirection === 'DOWN' && btcCandleBias === 'BEARISH')
    || (side === 'SHORT' && btcDirection === 'UP' && btcCandleBias === 'BULLISH')
  );
  if (aligned) {
    tier = 'GOOD';
    code = 'SIDE_BTC_ALIGNED_CONFIRMED';
  } else if (opposed) {
    tier = 'RISK';
    code = 'SIDE_BTC_OPPOSED_CONFIRMED';
  } else if (btcDirection === 'NO_DATA' || btcCandleName === 'NO_DATA') {
    code = 'SIDE_BTC_NO_DATA';
  }

  return {
    tier,
    label: `SIDE-BTC ${tier}`,
    code,
    side,
    btcDirection,
    btcCandleName,
    btcCandleBias,
    reason:
      `${side} + BTC_${btcDirection} + BTC candle ${btcCandleName}/${btcCandleBias}`
      + ` -> SIDE-BTC ${tier}`,
  };
}

export function edgeShortTierSnapshot(trade = {}, { derived = false } = {}) {
  const core = edgeShortCoreLayer(trade);
  const sideBtc = edgeShortSideBtcLayer(trade);
  const tier = core.tier === 'GOOD' && sideBtc.tier === 'GOOD'
    ? 'A'
    : core.tier === 'WATCH' && sideBtc.tier === 'GOOD'
      ? 'B'
      : 'BLOCK';
  const label = tier === 'A'
    ? 'SE TIER A'
    : tier === 'B'
      ? 'SE TIER B · TEST'
      : 'SE TIER BLOCK · LABEL';
  return {
    edgeShortCoreTier: core.tier,
    edgeShortCoreLabel: core.label,
    edgeShortCoreReason: core.reason,
    edgeShortSideBtcTier: sideBtc.tier,
    edgeShortSideBtcLabel: sideBtc.label,
    edgeShortSideBtcCode: sideBtc.code,
    edgeShortSideBtcReason: sideBtc.reason,
    edgeShortSideBtcDirection: sideBtc.btcDirection,
    edgeShortSideBtcCandle: sideBtc.btcCandleName,
    edgeShortSideBtcCandleBias: sideBtc.btcCandleBias,
    edgeShortTier: tier,
    edgeShortTierLabel: label,
    edgeShortTierReason:
      `${core.label} x ${sideBtc.label} -> ${label}`
      + ' · OBSERVE ONLY · không gate/chặn lệnh · không đổi size/entry/SL/TP',
    edgeShortTierVersion: EDGE_SHORT_TIER_VERSION,
    edgeShortTierObservationOnly: true,
    edgeShortTierAffectsEntry: false,
    edgeShortTierAffectsMargin: false,
    edgeShortTierAffectsSl: false,
    edgeShortTierAffectsTp: false,
    edgeShortTierDerived: Boolean(derived),
  };
}

export function decorateEdgeShortTierSnapshots(trades = []) {
  return trades.map((trade) => {
    const hasStoredSnapshot = trade?.edgeShortTierVersion === EDGE_SHORT_TIER_VERSION
      && TIER_ORDER.includes(trade?.edgeShortTier)
      && ['GOOD', 'WATCH', 'RISK'].includes(trade?.edgeShortCoreTier)
      && ['GOOD', 'WATCH', 'RISK'].includes(trade?.edgeShortSideBtcTier);
    return hasStoredSnapshot
      ? trade
      : { ...trade, ...edgeShortTierSnapshot(trade, { derived: true }) };
  });
}

export function edgeShortTierStats(trades = []) {
  const rows = new Map(TIER_ORDER.map((tier) => [tier, {
    tier,
    label: tier === 'A'
      ? 'SE TIER A'
      : tier === 'B'
        ? 'SE TIER B · TEST'
        : 'SE TIER BLOCK · LABEL',
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
  }]));

  for (const trade of trades) {
    const tier = TIER_ORDER.includes(trade?.edgeShortTier)
      ? trade.edgeShortTier
      : 'BLOCK';
    const row = rows.get(tier);
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
    } else {
      row.active += 1;
      row.activePnl += pnl;
    }
  }

  return TIER_ORDER.map((tier) => {
    const row = rows.get(tier);
    const decisive = row.wins + row.losses;
    const profitFactor = row.grossLoss > 0
      ? row.grossWin / row.grossLoss
      : row.grossWin > 0
        ? 9.99
        : 0;
    return {
      label: row.label,
      tier,
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
    };
  });
}
