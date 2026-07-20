import WebSocket from 'ws';

// Binance Futures routed endpoint. The regular /ws mark-price stream is not
// delivered consistently through every regional route, while the routed
// all-market stream is. Filter it locally to the active paper symbols.
const WS_BASE = 'wss://fstream.binance.com/market/ws/!markPrice@arr@1s';
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;
const STALE_RECONNECT_MS = 10_000;

export function createMarkPriceTicker({ onPrice }) {
  let ws = null;
  let symbols = new Set();
  let reconnectTimer = null;
  let watchdogTimer = null;
  let closed = false;
  let backoffMs = BACKOFF_BASE_MS;
  let lastMessageAt = 0;

  function startWatchdog() {
    clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      if (closed || ws?.readyState !== WebSocket.OPEN) return;
      if (lastMessageAt && Date.now() - lastMessageAt <= STALE_RECONNECT_MS) return;
      console.warn(`[MarkTick] stale stream >${STALE_RECONNECT_MS}ms, reconnecting.`);
      ws.terminate();
    }, 5_000);
    watchdogTimer.unref?.();
  }

  function connect() {
    if (closed) return;
    ws = new WebSocket(WS_BASE);
    ws.on('open', () => {
      backoffMs = BACKOFF_BASE_MS;
      lastMessageAt = Date.now();
      console.log('[MarkTick] Connected to Binance routed mark-price stream (1s).');
      startWatchdog();
    });
    ws.on('message', (raw) => {
      try {
        lastMessageAt = Date.now();
        const rows = JSON.parse(raw.toString());
        if (!Array.isArray(rows)) return;
        for (const row of rows) {
          if (row?.e !== 'markPriceUpdate') continue;
          const symbol = String(row.s ?? '').toUpperCase();
          if (!symbols.has(symbol)) continue;
          const markPrice = Number(row.p);
          if (!Number.isFinite(markPrice) || markPrice <= 0) continue;
          onPrice({ symbol, markPrice, eventTime: Number(row.E ?? lastMessageAt) });
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
