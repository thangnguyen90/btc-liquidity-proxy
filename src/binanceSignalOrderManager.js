export const BINANCE_SIGNAL_ORDER_MANAGER_VERSION =
  'BINANCE_SIGNAL_ORDER_MANAGER_V1_AUDIT_LIFECYCLE_LIVE_PNL_20261003';

const finite = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const text = (value, max = 4_000) => String(value ?? '').trim().slice(0, max);

const normalizedText = value => text(value).normalize('NFKC').toLocaleUpperCase('vi');

const timestamp = value => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
};

const directionOfPosition = (position = {}) => {
  const positionSide = text(position.positionSide, 20).toUpperCase();
  if (positionSide === 'LONG' || positionSide === 'SHORT') return positionSide;
  const amount = finite(position.positionAmt, 0);
  return amount < 0 ? 'SHORT' : amount > 0 ? 'LONG' : null;
};

function normalizePosition(position = {}) {
  const symbol = text(position.symbol, 60).toUpperCase();
  const direction = directionOfPosition(position);
  const amount = Math.abs(finite(position.positionAmt, 0));
  if (!symbol || !direction || !(amount > 0)) return null;
  return {
    symbol,
    direction,
    amount,
    entryPrice: finite(position.entryPrice),
    markPrice: finite(position.markPrice),
    liquidationPrice: finite(position.liquidationPrice),
    leverage: finite(position.leverage),
    initialMargin: finite(
      position.positionInitialMargin ?? position.initialMargin ?? position.isolatedMargin,
    ),
    unrealizedPnlUsdt: finite(position.unRealizedProfit ?? position.unrealizedProfit),
    pnlSource: text(position.pnlSource, 120) || null,
  };
}

function auditRecords(auditState = {}) {
  const fills = auditState?.fills ?? {};
  const values = Array.isArray(fills) ? fills : Object.values(fills);
  return values.map(fill => fill?.record ?? fill).filter(record => record?.symbol && record?.filledAt);
}

function vnDateBoundary(value, endOfDay = false) {
  const raw = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return Date.parse(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+07:00`);
}

function signalTypeCounts(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const value = row.signalType || row.signalLabel || 'BINANCE_UNATTRIBUTED';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, 250);
}

function summarize(rows = []) {
  const closed = rows.filter(row => row.displayStatus === 'CLOSED');
  const active = rows.filter(row => row.displayStatus === 'ACTIVE');
  const unconfirmed = rows.filter(row => row.displayStatus === 'OPEN_UNCONFIRMED');
  const lifecycles = new Map();
  for (const row of closed) {
    const key = row.closeGroupId || `FILL:${row.orderId ?? row.clientOrderId ?? row.filledAt}`;
    const lifecycle = lifecycles.get(key) ?? { pnlUsdt: 0 };
    lifecycle.pnlUsdt += finite(row.pnlUsdt, 0);
    lifecycles.set(key, lifecycle);
  }
  const closedLifecycleRows = [...lifecycles.values()];
  const wins = closedLifecycleRows.filter(row => row.pnlUsdt > 0).length;
  const losses = closedLifecycleRows.filter(row => row.pnlUsdt < 0).length;
  return {
    records: rows.length,
    activeRecords: active.length,
    activeSymbols: new Set(active.map(row => `${row.symbol}|${row.direction}`)).size,
    closedRecords: closed.length,
    closedLifecycles: closedLifecycleRows.length,
    unconfirmedRecords: unconfirmed.length,
    dcaRecords: rows.filter(row => row.isDca).length,
    unattributedRecords: rows.filter(row => row.metadataQuality === 'UNATTRIBUTED'
      || row.signalType === 'BINANCE_UNATTRIBUTED').length,
    realizedNetPnlUsdt: closed.reduce((sum, row) => sum + finite(row.pnlUsdt, 0), 0),
    allocatedUnrealizedPnlUsdt: active.reduce((sum, row) => sum + finite(row.pnlUsdt, 0), 0),
    wins,
    losses,
    breakeven: closedLifecycleRows.length - wins - losses,
    winRatePct: wins + losses > 0 ? wins / (wins + losses) * 100 : null,
  };
}

export function buildBinanceSignalOrderManagerSnapshot({
  auditState = {},
  positions = [],
  query = {},
  now = Date.now(),
  positionsError = null,
} = {}) {
  const normalizedPositions = (Array.isArray(positions) ? positions : [])
    .map(normalizePosition)
    .filter(Boolean);
  const positionsByKey = new Map(normalizedPositions.map(position => [
    `${position.symbol}|${position.direction}`,
    position,
  ]));
  const records = auditRecords(auditState);
  const openWeightByKey = new Map();
  const openQtyByKey = new Map();
  for (const record of records) {
    if (record.positionStatus === 'CLOSED') continue;
    const key = `${text(record.symbol, 60).toUpperCase()}|${text(record.direction, 20).toUpperCase()}`;
    const weight = Math.max(0, finite(record.filledNotionalUsdt, 0))
      || Math.max(0, finite(record.marginUsdt, 0)) || 1;
    openWeightByKey.set(key, (openWeightByKey.get(key) ?? 0) + weight);
    openQtyByKey.set(key, (openQtyByKey.get(key) ?? 0) + Math.max(0, finite(record.filledQty, 0)));
  }

  const allRows = records.map((record) => {
    const symbol = text(record.symbol, 60).toUpperCase();
    const direction = text(record.direction, 20).toUpperCase();
    const key = `${symbol}|${direction}`;
    const isClosed = record.positionStatus === 'CLOSED';
    const position = isClosed ? null : positionsByKey.get(key) ?? null;
    const weight = Math.max(0, finite(record.filledNotionalUsdt, 0))
      || Math.max(0, finite(record.marginUsdt, 0)) || 1;
    const allocation = position ? weight / Math.max(weight, openWeightByKey.get(key) ?? weight) : null;
    const allocatedPnl = position && position.unrealizedPnlUsdt != null
      ? position.unrealizedPnlUsdt * allocation : null;
    const margin = finite(record.marginUsdt) ?? (position?.initialMargin != null
      ? position.initialMargin * allocation : null);
    const displayStatus = isClosed ? 'CLOSED' : position ? 'ACTIVE' : 'OPEN_UNCONFIRMED';
    const pnlUsdt = isClosed ? finite(record.netRealizedPnlUsdt) : allocatedPnl;
    const roePct = isClosed ? finite(record.realizedRoePct)
      : margin > 0 && allocatedPnl != null ? allocatedPnl / margin * 100 : null;
    const auditedQty = openQtyByKey.get(key) ?? 0;
    const row = {
      auditVersion: record.auditVersion ?? null,
      orderId: record.orderId ?? null,
      clientOrderId: record.clientOrderId ?? null,
      symbol,
      direction,
      orderSide: record.orderSide ?? null,
      positionSide: record.positionSide ?? null,
      orderType: record.orderType ?? null,
      orderStatus: record.orderStatus ?? null,
      filledAt: record.filledAt,
      closedAt: record.closedAt ?? null,
      displayStatus,
      positionStatus: record.positionStatus ?? 'OPEN',
      signalSource: record.signalSource ?? 'BINANCE_UNATTRIBUTED',
      signalType: record.signalType ?? 'BINANCE_UNATTRIBUTED',
      signalLabel: record.signalLabel ?? record.signalType ?? 'BINANCE_UNATTRIBUTED',
      entryReason: record.entryReason ?? null,
      executionPage: record.executionPage ?? null,
      streamId: record.streamId ?? null,
      lifecycleId: record.lifecycleId ?? null,
      matchedKeys: Array.isArray(record.matchedKeys) ? record.matchedKeys : [],
      signalCombo: record.signalCombo ?? null,
      signalEntryPrice: finite(record.signalEntryPrice),
      takeProfitPrice: finite(record.takeProfitPrice),
      stopLossPrice: finite(record.stopLossPrice),
      stopLossSuppressed: record.stopLossSuppressed === true,
      marginUsdt: margin,
      leverage: finite(record.leverage) ?? position?.leverage ?? null,
      filledQty: finite(record.filledQty),
      avgFillPrice: finite(record.avgFillPrice),
      filledNotionalUsdt: finite(record.filledNotionalUsdt),
      isDca: record.isDca === true,
      metadataQuality: record.metadataQuality ?? null,
      closeGroupId: record.closeGroupId ?? null,
      closeOrderIds: Array.isArray(record.closeOrderIds) ? record.closeOrderIds : [],
      closeClientOrderId: record.closeClientOrderId ?? null,
      closeOrderType: record.closeOrderType ?? null,
      closeReason: record.closeReason ?? null,
      exitAvgPrice: finite(record.exitAvgPrice),
      grossRealizedPnlUsdt: finite(record.grossRealizedPnlUsdt),
      commissionUsdt: finite(record.commissionUsdt),
      fundingPnlUsdt: finite(record.fundingPnlUsdt),
      netRealizedPnlUsdt: finite(record.netRealizedPnlUsdt),
      outcome: record.outcome ?? null,
      closeEventSource: record.closeEventSource ?? null,
      pnlUsdt,
      roePct,
      pnlKind: isClosed ? 'REALIZED_NET' : position ? 'UNREALIZED_ALLOCATED' : 'UNAVAILABLE',
      livePosition: position ? {
        entryPrice: position.entryPrice,
        markPrice: position.markPrice,
        liquidationPrice: position.liquidationPrice,
        amount: position.amount,
        unrealizedPnlUsdt: position.unrealizedPnlUsdt,
        initialMargin: position.initialMargin,
        pnlSource: position.pnlSource,
        allocationPct: allocation * 100,
        auditedQtyCoveragePct: position.amount > 0 ? auditedQty / position.amount * 100 : null,
      } : null,
    };
    row.searchText = normalizedText([
      row.symbol, row.direction, row.displayStatus, row.signalSource, row.signalType,
      row.signalLabel, row.entryReason, row.signalCombo, row.executionPage, row.streamId,
      row.lifecycleId, row.orderId, row.clientOrderId, row.closeReason, row.closeOrderIds.join(' '),
    ].join(' '));
    return row;
  });

  const search = normalizedText(query.search);
  const status = text(query.status, 30).toUpperCase();
  const direction = text(query.direction, 20).toUpperCase();
  const outcome = text(query.outcome, 30).toUpperCase();
  const signalType = text(query.signalType, 300);
  const from = vnDateBoundary(query.from);
  const to = vnDateBoundary(query.to, true);
  let filtered = allRows.filter(row => {
    const filledAt = timestamp(row.filledAt);
    if (search && !row.searchText.includes(search)) return false;
    if (status && status !== row.displayStatus) return false;
    if (direction && direction !== row.direction) return false;
    if (outcome && outcome !== text(row.outcome, 30).toUpperCase()) return false;
    if (signalType && signalType !== row.signalType) return false;
    if (from != null && (filledAt == null || filledAt < from)) return false;
    if (to != null && (filledAt == null || filledAt > to)) return false;
    return true;
  });

  const sort = text(query.sort, 30) || 'newest';
  const metric = row => sort === 'pnl_high' ? finite(row.pnlUsdt, -Infinity)
    : sort === 'pnl_low' ? -finite(row.pnlUsdt, Infinity)
      : sort === 'roe_high' ? finite(row.roePct, -Infinity)
        : timestamp(row.filledAt) ?? 0;
  filtered = filtered.sort((left, right) => metric(right) - metric(left)
    || (timestamp(right.filledAt) ?? 0) - (timestamp(left.filledAt) ?? 0));
  const pageSize = Math.max(10, Math.min(100, Math.trunc(finite(query.pageSize, 50))));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.max(1, Math.min(totalPages, Math.trunc(finite(query.page, 1))));
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize).map(({ searchText: _searchText, ...row }) => row);

  return {
    version: BINANCE_SIGNAL_ORDER_MANAGER_VERSION,
    generatedAt: new Date(now).toISOString(),
    observeOnly: true,
    binanceMutation: false,
    positionsError: positionsError ? text(positionsError, 500) : null,
    positionSnapshot: {
      count: normalizedPositions.length,
      sources: [...new Set(normalizedPositions.map(position => position.pnlSource).filter(Boolean))],
    },
    filters: { search: query.search ?? '', status, direction, outcome, signalType, from: query.from ?? '', to: query.to ?? '', sort },
    facets: { signalTypes: signalTypeCounts(allRows) },
    summary: summarize(filtered),
    pagination: { page, pageSize, totalRows: filtered.length, totalPages },
    rows,
    notes: {
      closedPnl: 'Net PnL Binance đã lưu: gross - commission + funding.',
      openPnl: 'Unrealized PnL của vị thế Binance được phân bổ theo filled notional giữa các fill audit đang mở; không phải PnL độc lập chính xác của từng fill.',
      unconfirmed: 'Audit còn OPEN nhưng snapshot Binance không còn vị thế cùng symbol/hướng; không suy đoán PnL.',
    },
  };
}
