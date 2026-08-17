export const LIQUID_FLOW_V2_BINANCE_STATS_VERSION = 'LIQUID_FLOW_V2_BINANCE_STATS_V1_20260814';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
});

const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function iso(value) {
  const number = Number(value);
  const date = new Date(Number.isFinite(number) && number > 0 ? number : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function liquidFlowV2BinanceDateKey(value) {
  const date = new Date(Number(value) || value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function normalizeLiquidFlowV2BinanceRange(fromDay, toDay) {
  let from = DATE_PATTERN.test(String(fromDay ?? '')) ? String(fromDay) : null;
  let to = DATE_PATTERN.test(String(toDay ?? '')) ? String(toDay) : null;
  if (!from && !to) return { fromDay: null, toDay: null };
  if (!from) from = to;
  if (!to) to = from;
  if (from > to) [from, to] = [to, from];
  return { fromDay: from, toDay: to };
}

export function liquidFlowV2RealTrades(trades = [], { fromDay = '', toDay = '', labelKey = '' } = {}) {
  const range = normalizeLiquidFlowV2BinanceRange(fromDay, toDay);
  const wantedLabel = String(labelKey ?? '').trim().toUpperCase();
  return (Array.isArray(trades) ? trades : []).filter((trade) => {
    const state = String(trade?.binanceEntryState ?? '').toUpperCase();
    const orderStatus = String(trade?.binanceOrderStatus ?? '').toUpperCase();
    const filledAt = finite(trade?.binanceEntryFilledAt);
    const filled = filledAt != null && (state === 'FILLED' || orderStatus === 'FILLED');
    if (!filled) return false;
    if (wantedLabel && String(trade?.labelKey ?? '').toUpperCase() !== wantedLabel) return false;
    if (!range.fromDay || !range.toDay) return true;
    const day = liquidFlowV2BinanceDateKey(filledAt);
    return day != null && day >= range.fromDay && day <= range.toDay;
  });
}

export function liquidFlowV2SyntheticExecutions(trades = []) {
  return (Array.isArray(trades) ? trades : []).map((trade) => {
    const closedAt = finite(trade?.exitAt ?? trade?.closedAt);
    return {
      lifecycleId: `liquid-flow-v2:${trade.id}`,
      paperTradeId: String(trade.id ?? ''),
      symbol: String(trade.symbol ?? '').toUpperCase(),
      side: String(trade.side ?? '').toUpperCase(),
      status: String(trade.status ?? '').toUpperCase() === 'CLOSED' && closedAt != null
        ? 'POSITION_CLOSED'
        : 'ENTRY_FILLED',
      entrySubmittedAt: iso(trade.binanceEntryRequestedAt ?? trade.binanceEntryFilledAt),
      entryFilledAt: iso(trade.binanceEntryFilledAt),
      positionClosedAt: closedAt == null ? null : iso(closedAt),
      marginUsdt: finite(trade.binanceMarginUsdt),
      leverage: finite(trade.binanceLeverage),
    };
  });
}

function closeReason(trade = {}) {
  const outcome = String(trade.outcome ?? '').toUpperCase();
  if (outcome === 'TP') return 'TAKE_PROFIT';
  if (outcome === 'SL') return 'STOP_LOSS';
  if (outcome.includes('TIME')) return 'TIME_EXIT';
  if (outcome.includes('ENTRY')) return 'ENTRY_CANCELLED';
  return outcome || (String(trade.status ?? '').toUpperCase() === 'CLOSED' ? 'OTHER_CLOSE' : 'OPEN');
}

function adverseSlippagePct(trade = {}) {
  const signal = finite(trade.entryPrice);
  const fill = finite(trade.binanceEntryPrice);
  if (!(signal > 0) || !(fill > 0)) return null;
  const raw = (fill - signal) / signal * 100;
  return String(trade.side ?? '').toUpperCase() === 'SHORT' ? -raw : raw;
}

function matchingPosition(trade, positions = []) {
  return (Array.isArray(positions) ? positions : []).find((position) => {
    if (String(position?.symbol ?? '').toUpperCase() !== String(trade?.symbol ?? '').toUpperCase()) return false;
    const amount = finite(position?.positionAmt);
    if (amount == null || amount === 0) return false;
    return (amount > 0 ? 'LONG' : 'SHORT') === String(trade?.side ?? '').toUpperCase();
  }) ?? null;
}

function summarize(rows = []) {
  const closedKnown = rows.filter((row) => row.status === 'CLOSED' && row.pnlKnown);
  const wins = closedKnown.filter((row) => row.pnl > 0).length;
  const losses = closedKnown.filter((row) => row.pnl < 0).length;
  const grossProfit = closedKnown.reduce((sum, row) => sum + Math.max(0, row.pnl), 0);
  const grossLoss = closedKnown.reduce((sum, row) => sum + Math.max(0, -row.pnl), 0);
  const realizedPnl = closedKnown.reduce((sum, row) => sum + row.pnl, 0);
  const openKnown = rows.filter((row) => row.status === 'OPEN' && row.pnlKnown);
  const unrealizedPnl = openKnown.reduce((sum, row) => sum + row.pnl, 0);
  const roeRows = rows.filter((row) => row.pnlKnown && finite(row.roe) != null);
  return {
    total: rows.length,
    open: rows.filter((row) => row.status === 'OPEN').length,
    closed: rows.filter((row) => row.status === 'CLOSED').length,
    pnlKnown: rows.filter((row) => row.pnlKnown).length,
    pnlMissing: rows.filter((row) => !row.pnlKnown).length,
    wins,
    losses,
    winRate: wins + losses > 0 ? wins / (wins + losses) * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
    realizedPnl,
    unrealizedPnl,
    netPnl: realizedPnl + unrealizedPnl,
    avgRoe: roeRows.length ? roeRows.reduce((sum, row) => sum + row.roe, 0) / roeRows.length : null,
  };
}

export function buildLiquidFlowV2BinanceStats({
  trades = [], reconciled = [], positions = [], fromDay = '', toDay = '', labelKey = '',
} = {}) {
  const filtered = liquidFlowV2RealTrades(trades, { fromDay, toDay, labelKey });
  const pnlById = new Map((Array.isArray(reconciled) ? reconciled : []).map((row) => [row.lifecycleId, row]));
  const rows = filtered.map((trade) => {
    const closed = String(trade.status ?? '').toUpperCase() === 'CLOSED' && finite(trade.exitAt ?? trade.closedAt) != null;
    const actual = pnlById.get(`liquid-flow-v2:${trade.id}`) ?? null;
    const position = closed ? null : matchingPosition(trade, positions);
    const margin = finite(trade.binanceMarginUsdt) ?? 0;
    const closedKnown = closed && finite(actual?.net) != null && Number(actual?.realizedIncomeCount ?? 0) > 0;
    const openPnl = finite(position?.unRealizedProfit);
    const pnl = closedKnown ? finite(actual.net) : openPnl;
    const roe = pnl != null && margin > 0 ? pnl / margin * 100 : null;
    const slippage = adverseSlippagePct(trade);
    const reason = closed ? closeReason(trade) : 'OPEN';
    const diagnosis = !closed
      ? 'OPEN_POSITION'
      : !closedKnown
        ? 'PNL_MISSING'
        : Number(actual.net) <= 0 && Number(actual.realized) > 0
          ? 'FEE_OR_FUNDING_TURNED_LOSS'
          : Number(slippage) >= 0.5
            ? `${reason}_WITH_ADVERSE_ENTRY`
            : reason;
    return {
      tradeId: String(trade.id ?? ''),
      symbol: String(trade.symbol ?? '').toUpperCase(),
      side: String(trade.side ?? '').toUpperCase(),
      labelKey: String(trade.labelKey ?? 'UNKNOWN'),
      label: String(trade.label ?? trade.labelKey ?? 'UNKNOWN'),
      confidence: finite(trade.confidence),
      status: closed ? 'CLOSED' : 'OPEN',
      reason,
      diagnosis,
      entryAt: finite(trade.binanceEntryFilledAt),
      closedAt: closed ? finite(trade.exitAt ?? trade.closedAt) : null,
      signalEntry: finite(trade.entryPrice),
      binanceEntry: finite(trade.binanceEntryPrice),
      exitPrice: closed ? finite(trade.exitPrice) : finite(position?.markPrice),
      adverseSlippagePct: slippage,
      marginUsdt: margin,
      leverage: finite(trade.binanceLeverage),
      orderId: trade.binanceOrderId ?? null,
      mode: String(trade.binanceEntryMode ?? (String(trade.binanceClientOrderId ?? '').startsWith('lfv2ui_') ? 'MANUAL' : 'AUTO')),
      pnlKnown: closed ? closedKnown : openPnl != null,
      pnl: pnl ?? 0,
      roe,
      pnlSource: closedKnown ? 'BINANCE_INCOME' : openPnl != null ? 'BINANCE_POSITION' : 'MISSING',
      realizedPnl: closedKnown ? finite(actual.realized) ?? 0 : 0,
      commission: closedKnown ? finite(actual.commission) ?? 0 : 0,
      funding: closedKnown ? finite(actual.funding) ?? 0 : 0,
      paperOutcome: String(trade.outcome ?? ''),
      paperPnl: finite(trade.netPnl ?? trade.pnl),
      paperRoe: finite(trade.netRoe ?? trade.roe),
    };
  }).sort((a, b) => b.entryAt - a.entryAt);
  const groups = [...new Set(rows.map((row) => row.labelKey))].map((key) => {
    const groupRows = rows.filter((row) => row.labelKey === key);
    return { key, label: groupRows[0]?.label ?? key, ...summarize(groupRows) };
  }).sort((a, b) => b.total - a.total || b.netPnl - a.netPnl);
  const availableLabels = [...new Map(liquidFlowV2RealTrades(trades).map((trade) => [
    String(trade.labelKey ?? 'UNKNOWN'), String(trade.label ?? trade.labelKey ?? 'UNKNOWN'),
  ])).entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  return {
    version: LIQUID_FLOW_V2_BINANCE_STATS_VERSION,
    timeZone: 'Asia/Bangkok',
    range: normalizeLiquidFlowV2BinanceRange(fromDay, toDay),
    selectedLabelKey: String(labelKey ?? ''),
    summary: summarize(rows),
    groups,
    rows,
    availableLabels,
    availableDays: [...new Set(liquidFlowV2RealTrades(trades)
      .map((trade) => liquidFlowV2BinanceDateKey(trade.binanceEntryFilledAt)).filter(Boolean))].sort(),
    pnlPolicy: 'CLOSED=BINANCE_INCOME_IN_EXACT_SYMBOL/LIFECYCLE_WINDOW; OPEN=BINANCE_POSITION_SOCKET_OR_REST; PAPER_ONLY_NEVER_COUNTS_AS_REAL_PNL',
  };
}
