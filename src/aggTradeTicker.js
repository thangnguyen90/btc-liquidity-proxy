import WebSocket from 'ws';

const WS_BASE = 'wss://fstream.binance.com/market/ws/!ticker@arr';
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;
const STALE_RECONNECT_MS = 30_000;

// Dedicated Shakeout last-price feed. Binance aggregates raw trades and sends
// the current contract/last price once per second, preventing event-loop lag.
export function createAggTradeTicker({ onPrice, logLabel = 'LastPriceTick' }) {
  let ws = null;
  let symbols = new Set();
  let reconnectTimer = null;
  let watchdogTimer = null;
  let backoffMs = BACKOFF_BASE_MS;
  let closed = false;
  let lastMessageAt = 0;

  function scheduleWatchdog() {
    clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      if (closed || ws?.readyState !== WebSocket.OPEN) return;
      if (lastMessageAt && Date.now() - lastMessageAt <= STALE_RECONNECT_MS) return;
      console.warn(`[${logLabel}] stale stream >${STALE_RECONNECT_MS}ms, reconnecting.`);
      ws.terminate();
    }, 10_000);
  }

  function connect() {
    if (closed) return;
    ws = new WebSocket(WS_BASE);
    ws.on('open', () => {
      backoffMs = BACKOFF_BASE_MS;
      lastMessageAt = Date.now();
      console.log(`[${logLabel}] Connected to dedicated Binance last-price stream.`);
      scheduleWatchdog();
    });
    ws.on('message', (raw) => {
      try {
        lastMessageAt = Date.now();
        const rows = JSON.parse(raw.toString());
        if (!Array.isArray(rows)) return;
        const receivedAt = Date.now();
        for (const row of rows) {
          const symbol = String(row?.s ?? '').toUpperCase();
          if (!symbols.has(symbol)) continue;
          const markPrice = Number(row?.c);
          if (!Number.isFinite(markPrice) || markPrice <= 0) continue;
          const eventTime = Number(row?.E ?? receivedAt);
          if (receivedAt - eventTime > 2_000) continue;
          onPrice({ symbol, markPrice, eventTime });
        }
      } catch {}
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      if (closed) return;
      clearInterval(watchdogTimer);
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delay);
    });
  }

  function setSymbols(nextSymbols) {
    symbols = new Set(nextSymbols.map((symbol) => String(symbol).toUpperCase()));
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
