import WebSocket from 'ws';

const WS_BASE = 'wss://fstream.binance.com/market/ws/!ticker@arr';
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

// Dedicated Shakeout last-price feed. Binance aggregates raw trades and sends
// the current contract/last price once per second, preventing event-loop lag.
export function createAggTradeTicker({ onPrice, logLabel = 'LastPriceTick' }) {
  let ws = null;
  let symbols = new Set();
  let reconnectTimer = null;
  let backoffMs = BACKOFF_BASE_MS;
  let closed = false;

  function connect() {
    if (closed) return;
    ws = new WebSocket(WS_BASE);
    ws.on('open', () => {
      backoffMs = BACKOFF_BASE_MS;
      console.log(`[${logLabel}] Connected to dedicated Binance last-price stream.`);
    });
    ws.on('message', (raw) => {
      try {
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
    ws?.close();
  }

  connect();
  return { setSymbols, close };
}
