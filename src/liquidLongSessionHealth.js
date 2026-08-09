export const LIQUID_LONG_SESSION_HEALTH_VERSION =
  'LIQUID_LONG_SESSION_HEALTH_V1_20260728';

const MIN_CLOSED_SAMPLE = 20;

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function entryTimeMs(trade = {}) {
  const parsed = Date.parse(
    trade.openedAt ?? trade.entryReadyAt ?? trade.createdAt ?? '',
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function closedTimeMs(trade = {}) {
  const parsed = Date.parse(trade.closedAt ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

function sessionDay(trade = {}) {
  const raw = String(
    trade.openedAt ?? trade.entryReadyAt ?? trade.createdAt ?? '',
  );
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

function emptyHistory() {
  return {
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    grossWin: 0,
    grossLoss: 0,
    roeSum: 0,
    winRate: null,
    profitFactor: 0,
    avgRoe: null,
  };
}

function finishHistory(raw = emptyHistory()) {
  return {
    ...raw,
    winRate: raw.closed > 0 ? (raw.wins / raw.closed) * 100 : null,
    profitFactor: raw.grossLoss > 0
      ? raw.grossWin / raw.grossLoss
      : raw.grossWin > 0
        ? 9.99
        : 0,
    avgRoe: raw.closed > 0 ? raw.roeSum / raw.closed : null,
  };
}

function buildClosedDayIndex(trades = []) {
  const grouped = new Map();
  for (const trade of trades) {
    if (String(trade.side ?? '').toUpperCase() !== 'LONG') continue;
    if (String(trade.status ?? '').toUpperCase() !== 'CLOSED') continue;
    const day = sessionDay(trade);
    const closeMs = closedTimeMs(trade);
    if (!day || closeMs == null) continue;
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push({ trade, closeMs });
  }

  const indexes = new Map();
  for (const [day, rows] of grouped) {
    rows.sort((a, b) => a.closeMs - b.closeMs);
    const prefixes = [emptyHistory()];
    for (const { trade } of rows) {
      const previous = prefixes.at(-1);
      const pnl = finiteNumber(trade.netPnl ?? trade.pnl);
      const roe = finiteNumber(trade.netRoe ?? trade.roe);
      prefixes.push({
        closed: previous.closed + 1,
        wins: previous.wins + (pnl > 0 ? 1 : 0),
        losses: previous.losses + (pnl < 0 ? 1 : 0),
        realizedPnl: previous.realizedPnl + pnl,
        grossWin: previous.grossWin + (pnl > 0 ? pnl : 0),
        grossLoss: previous.grossLoss + (pnl < 0 ? Math.abs(pnl) : 0),
        roeSum: previous.roeSum + roe,
        winRate: null,
        profitFactor: 0,
        avgRoe: null,
      });
    }
    indexes.set(day, {
      closeTimes: rows.map((row) => row.closeMs),
      prefixes,
    });
  }
  return indexes;
}

function historyBefore(indexes, day, beforeMs) {
  const index = indexes.get(day);
  if (!index || beforeMs == null) return emptyHistory();
  let low = 0;
  let high = index.closeTimes.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (index.closeTimes[mid] < beforeMs) low = mid + 1;
    else high = mid;
  }
  return finishHistory(index.prefixes[low] ?? emptyHistory());
}

function labelOf(tier) {
  return tier === 'UNRATED' ? null : `LONG SESSION · ${tier.replaceAll('_', ' ')}`;
}

function assessmentFor(trade, indexes) {
  const eligible = String(trade.side ?? '').toUpperCase() === 'LONG';
  const day = sessionDay(trade);
  const beforeMs = entryTimeMs(trade);
  const history = eligible && day && beforeMs != null
    ? historyBefore(indexes, day, beforeMs)
    : emptyHistory();

  let tier = 'UNRATED';
  let reason = 'Chỉ đánh giá sức khỏe phiên cho lệnh LONG.';
  if (eligible && (!day || beforeMs == null)) {
    tier = 'NO_DATA';
    reason = 'Thiếu thời điểm entry để dựng lịch sử causal cùng ngày.';
  } else if (eligible && history.closed < MIN_CLOSED_SAMPLE) {
    tier = 'WARMUP';
    reason = `Mới có ${history.closed}/${MIN_CLOSED_SAMPLE} lệnh LONG đóng trước entry trong ngày.`;
  } else if (
    eligible
    && (history.profitFactor <= 0.8 || history.avgRoe <= -2)
  ) {
    tier = 'BREAKDOWN';
    reason = `LONG cùng ngày đã suy yếu trước entry: PF ${history.profitFactor.toFixed(2)}, AvgROE ${history.avgRoe.toFixed(1)}%.`;
  } else if (
    eligible
    && history.profitFactor >= 1.1
    && history.avgRoe > 0
  ) {
    tier = 'HEALTHY';
    reason = `LONG cùng ngày đang xác nhận: PF ${history.profitFactor.toFixed(2)}, AvgROE ${history.avgRoe.toFixed(1)}%.`;
  } else if (eligible) {
    tier = 'WATCH';
    reason = `LONG cùng ngày chưa rõ edge: PF ${history.profitFactor.toFixed(2)}, AvgROE ${history.avgRoe.toFixed(1)}%.`;
  }

  return {
    liquidLongSessionEligible: eligible,
    liquidLongSessionTier: tier,
    liquidLongSessionCode: `LONG_SESSION_${tier}`,
    liquidLongSessionLabel: labelOf(tier),
    liquidLongSessionReason: reason,
    liquidLongSessionDay: day,
    liquidLongSessionHistory: history,
    liquidLongSessionMinSample: MIN_CLOSED_SAMPLE,
    liquidLongSessionBasis: 'CAUSAL_SAME_DAY_CLOSED_BEFORE_ENTRY',
    liquidLongSessionVersion: LIQUID_LONG_SESSION_HEALTH_VERSION,
    liquidLongSessionObservationOnly: true,
    liquidLongSessionAffectsEntry: false,
    liquidLongSessionAffectsMargin: false,
    liquidLongSessionAffectsSl: false,
    liquidLongSessionAffectsTp: false,
  };
}

export function evaluateLiquidLongSessionHealthSnapshot(trade = {}, history = []) {
  return assessmentFor(trade, buildClosedDayIndex(history));
}

export function deriveLiquidLongSessionHealthSnapshots(trades = []) {
  const indexes = buildClosedDayIndex(trades);
  const result = new Map();
  for (const trade of trades) {
    result.set(String(trade.id), assessmentFor(trade, indexes));
  }
  return result;
}
