export const BTC_SESSION_WATCH_HISTORY_VERSION = 'BTC_SESSION_DAILY_WATCHLIST_V3_20260926';
export const BTC_SESSION_WATCH_HISTORY_KEY = 'btc_session_watch_history_v3';
export const BTC_SESSION_WATCH_HISTORY_MAX = 100;

const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const validSide = (value) => ['LONG', 'SHORT'].includes(String(value ?? '').toUpperCase());
const validSymbol = (value) => {
  const symbol = String(value ?? '').trim().toUpperCase();
  return symbol.length >= 6 && symbol.length <= 50 && symbol.endsWith('USDT') && !/\s/.test(symbol) ? symbol : '';
};

export function btcSessionVnDay(now = Date.now()) {
  return new Date(Number(now) + 7 * 3600000).toISOString().slice(0, 10);
}

function copyCandidate(candidate) {
  const symbol = validSymbol(candidate?.symbol);
  const side = String(candidate?.side ?? '').toUpperCase();
  if (!symbol || !validSide(side)) return null;
  const targets = Array.isArray(candidate?.targetPlan?.targets)
    ? candidate.targetPlan.targets.slice(0, 6).map((target) => ({
      price: finite(target?.price),
      structural: target?.structural === true,
    })).filter((target) => target.price > 0)
    : [];
  return {
    symbol,
    side,
    entryPrice: finite(candidate?.entryPrice),
    entryZone: {
      low: finite(candidate?.entryZone?.low),
      high: finite(candidate?.entryZone?.high),
    },
    referenceLevel: finite(candidate?.referenceLevel),
    confirmationAt: finite(candidate?.confirmationAt),
    retestAt: finite(candidate?.retestAt),
    lastClosed5m: finite(candidate?.lastClosed5m),
    lastClosed5mAt: finite(candidate?.lastClosed5mAt),
    entryScore: finite(candidate?.entryScore),
    targetPlan: { targets },
  };
}

function emptyHistory(day) {
  return { version: BTC_SESSION_WATCH_HISTORY_VERSION, day, rows: [] };
}

export function normalizeBtcSessionWatchHistory(history, now = Date.now()) {
  const day = btcSessionVnDay(now);
  if (history?.version !== BTC_SESSION_WATCH_HISTORY_VERSION || history?.day !== day || !Array.isArray(history?.rows)) {
    return emptyHistory(day);
  }
  const rows = [];
  const seen = new Set();
  for (const raw of history.rows) {
    const candidate = copyCandidate(raw?.candidate ?? raw);
    if (!candidate) continue;
    const key = `${candidate.symbol}|${candidate.side}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      key,
      firstSeenAt: finite(raw?.firstSeenAt, now),
      lastSeenAt: finite(raw?.lastSeenAt, now),
      candidate,
    });
  }
  return { version: BTC_SESSION_WATCH_HISTORY_VERSION, day, rows };
}

export function updateBtcSessionWatchHistory(history, candidates, now = Date.now(), maxRows = BTC_SESSION_WATCH_HISTORY_MAX) {
  const normalized = normalizeBtcSessionWatchHistory(history, now);
  const byKey = new Map(normalized.rows.map((row) => [row.key, row]));
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const candidate = copyCandidate(raw);
    if (!candidate) continue;
    const key = `${candidate.symbol}|${candidate.side}`;
    const previous = byKey.get(key);
    byKey.set(key, {
      key,
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
      candidate,
    });
  }
  const limit = Math.max(1, Math.min(500, Math.trunc(finite(maxRows, BTC_SESSION_WATCH_HISTORY_MAX))));
  const rows = [...byKey.values()]
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt || (b.candidate.entryScore ?? 0) - (a.candidate.entryScore ?? 0) || a.key.localeCompare(b.key))
    .slice(0, limit);
  return { ...normalized, rows };
}

export function mergeBtcSessionWatchCandidates(candidates, history, now = Date.now()) {
  const normalized = normalizeBtcSessionWatchHistory(history, now);
  const historyByKey = new Map(normalized.rows.map((row) => [row.key, row]));
  const current = [];
  const currentKeys = new Set();
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const candidate = copyCandidate(raw);
    if (!candidate) continue;
    const key = `${candidate.symbol}|${candidate.side}`;
    currentKeys.add(key);
    const saved = historyByKey.get(key);
    current.push({
      ...raw,
      symbol: candidate.symbol,
      side: candidate.side,
      retainedOnly: false,
      watchFirstSeenAt: saved?.firstSeenAt ?? now,
      watchLastSeenAt: saved?.lastSeenAt ?? now,
    });
  }
  const retained = normalized.rows
    .filter((row) => !currentKeys.has(row.key))
    .map((row) => ({
      ...row.candidate,
      retainedOnly: true,
      watchFirstSeenAt: row.firstSeenAt,
      watchLastSeenAt: row.lastSeenAt,
    }));
  return [...current, ...retained];
}
