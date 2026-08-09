import WebSocket from 'ws';

const WS_BASE = 'wss://fstream.binance.com/market/ws/!ticker@arr';
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;
const RAW_MESSAGE_STALE_RECONNECT_MS = 30_000;
const ACCEPTED_TICK_STALE_RECONNECT_MS = 15_000;
const MAX_EVENT_LAG_MS = 10_000;

export function shouldAcceptLastPriceTick({
  receivedAt,
  eventTime,
  lastEventTime = 0,
  maxEventLagMs = MAX_EVENT_LAG_MS,
}) {
  const received = Number(receivedAt);
  const event = Number(eventTime);
  const previous = Number(lastEventTime) || 0;
  const maxLag = Math.max(0, Number(maxEventLagMs) || 0);
  if (!Number.isFinite(received) || !Number.isFinite(event)) return false;
  if (event < previous) return false;
  return received - event <= maxLag;
}

// Shared paper last-price feed. A raw WS message is not enough to prove that
// tracked prices are advancing; watchdog health follows accepted price rows.
export function createAggTradeTicker({ onPrice, logLabel = 'LastPriceTick' }) {
  let ws = null;
  let symbols = new Set();
  let reconnectTimer = null;
  let watchdogTimer = null;
  let backoffMs = BACKOFF_BASE_MS;
  let closed = false;
  let lastMessageAt = 0;
  let lastAcceptedAt = 0;
  let pendingRaw = null;
  let priceProcessingScheduled = false;
  const lastEventTimeBySymbol = new Map();

  function processLatestPriceMessage(raw) {
    try {
      const rows = JSON.parse(raw.toString());
      if (!Array.isArray(rows)) return;
      const receivedAt = Date.now();
      let acceptedRows = 0;
      for (const row of rows) {
        const symbol = String(row?.s ?? '').toUpperCase();
        if (!symbols.has(symbol)) continue;
        const markPrice = Number(row?.c);
        if (!Number.isFinite(markPrice) || markPrice <= 0) continue;
        const eventTime = Number(row?.E ?? receivedAt);
        if (!shouldAcceptLastPriceTick({
          receivedAt,
          eventTime,
          lastEventTime: lastEventTimeBySymbol.get(symbol),
        })) continue;
        lastEventTimeBySymbol.set(symbol, eventTime);
        acceptedRows += 1;
        onPrice({ symbol, markPrice, eventTime });
      }
      if (acceptedRows > 0) lastAcceptedAt = receivedAt;
    } catch {}
  }

  function scheduleLatestPriceMessage(raw) {
    // Keep only the newest queued all-market frame. Processing every stale
    // intermediate frame makes a busy event loop fall further behind forever.
    pendingRaw = raw;
    if (priceProcessingScheduled) return;
    priceProcessingScheduled = true;
    setImmediate(() => {
      priceProcessingScheduled = false;
      const latestRaw = pendingRaw;
      pendingRaw = null;
      if (latestRaw) processLatestPriceMessage(latestRaw);
    });
  }

  function scheduleWatchdog() {
    clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      if (closed || ws?.readyState !== WebSocket.OPEN) return;
      if (symbols.size === 0) return;
      const now = Date.now();
      const rawAgeMs = lastMessageAt ? now - lastMessageAt : Infinity;
      const acceptedAgeMs = lastAcceptedAt ? now - lastAcceptedAt : Infinity;
      if (
        rawAgeMs <= RAW_MESSAGE_STALE_RECONNECT_MS
        && acceptedAgeMs <= ACCEPTED_TICK_STALE_RECONNECT_MS
      ) return;
      console.warn(
        `[${logLabel}] stale accepted price; raw=${Math.round(rawAgeMs)}ms`
        + ` accepted=${Math.round(acceptedAgeMs)}ms, reconnecting.`,
      );
      ws.terminate();
    }, 10_000);
  }

  function connect() {
    if (closed) return;
    ws = new WebSocket(WS_BASE);
    ws.on('open', () => {
      backoffMs = BACKOFF_BASE_MS;
      lastMessageAt = Date.now();
      lastAcceptedAt = Date.now();
      console.log(`[${logLabel}] Connected to dedicated Binance last-price stream.`);
      scheduleWatchdog();
    });
    ws.on('message', (raw) => {
      lastMessageAt = Date.now();
      scheduleLatestPriceMessage(raw);
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      if (closed) return;
      clearInterval(watchdogTimer);
      pendingRaw = null;
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delay);
    });
  }

  function setSymbols(nextSymbols) {
    symbols = new Set(nextSymbols.map((symbol) => String(symbol).toUpperCase()));
    for (const symbol of lastEventTimeBySymbol.keys()) {
      if (!symbols.has(symbol)) lastEventTimeBySymbol.delete(symbol);
    }
    if (symbols.size > 0 && lastAcceptedAt === 0) lastAcceptedAt = Date.now();
  }

  function close() {
    closed = true;
    clearTimeout(reconnectTimer);
    clearInterval(watchdogTimer);
    ws?.close();
  }

  connect();
  return { setSymbols, close };
}
