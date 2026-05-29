import WebSocket from 'ws';

const WS_BASE = 'wss://fstream.binancefuture.com/ws';
const WS_OPTS = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Origin': 'https://www.binance.com',
  },
};

// Exponential backoff config
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS  = 5 * 60_000; // max 5 min
const BACKOFF_MULT    = 2;
const BAN_WAIT_MS     = 3 * 60_000; // 3 min wait on 418/429/403

/**
 * Binance futures real-time price ticker via bookTicker WebSocket.
 * Uses mid price (bid+ask)/2 as mark price proxy — accurate to <$0.10 for BTC.
 * Returns { setSymbols(symbols), close() }
 */
export function createMarkPriceTicker({ onPrice }) {
  let ws = null;
  let subscribedSymbols = new Set();
  let reconnectTimer = null;
  let closed = false;
  let dataReceived = false;
  let backoffMs = BACKOFF_BASE_MS;

  function connect() {
    if (closed) return;
    try {
      ws = new WebSocket(WS_BASE, WS_OPTS);
    } catch (e) {
      console.error('[MarkTick] WS create failed:', e.message);
      scheduleReconnect();
      return;
    }

    ws.on('open', () => {
      backoffMs = BACKOFF_BASE_MS; // reset on successful open
      console.log('[MarkTick] Connected to Binance futures bookTicker stream.');
      if (subscribedSymbols.size > 0) sendSubscribe([...subscribedSymbols]);

      setTimeout(() => {
        if (!dataReceived && !closed) {
          console.warn('[MarkTick] ⚠️ No data after 30s — stream may be blocked. Check IP / connection.');
        }
      }, 30_000);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.e === 'bookTicker') {
          dataReceived = true;
          backoffMs = BACKOFF_BASE_MS; // reset backoff on data
          const markPrice = (Number(msg.b) + Number(msg.a)) / 2;
          onPrice({ symbol: msg.s, markPrice });
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on('error', (err) => {
      const msg = err?.message ?? '';
      const isBan = /Unexpected server response: (418|429|403)/.test(msg)
                 || msg.includes('ECONNREFUSED')
                 || msg.includes('ECONNRESET');
      if (isBan) {
        backoffMs = BAN_WAIT_MS;
        console.warn(`[MarkTick] ⛔ Ban/rate-limit detected. Waiting ${BAN_WAIT_MS / 60000}min before retry.`);
      }
    });

    ws.on('close', () => {
      if (!closed) {
        const delay = backoffMs;
        backoffMs = Math.min(backoffMs * BACKOFF_MULT, BACKOFF_MAX_MS);
        if (delay > BACKOFF_BASE_MS) {
          console.log(`[MarkTick] Disconnected. Reconnecting in ${Math.round(delay / 1000)}s (backoff)…`);
        } else {
          console.log('[MarkTick] Disconnected. Reconnecting in 5s…');
        }
        scheduleReconnect(delay);
      }
    });
  }

  function sendSubscribe(symbols) {
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      method: 'SUBSCRIBE',
      params: symbols.map((s) => `${s.toLowerCase()}@bookTicker`),
      id: Date.now(),
    }));
  }

  function sendUnsubscribe(symbols) {
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      method: 'UNSUBSCRIBE',
      params: symbols.map((s) => `${s.toLowerCase()}@bookTicker`),
      id: Date.now(),
    }));
  }

  function scheduleReconnect(delay = BACKOFF_BASE_MS) {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { if (!closed) connect(); }, delay);
  }

  function setSymbols(symbols) {
    const next = new Set(symbols);
    const toAdd = symbols.filter((s) => !subscribedSymbols.has(s));
    const toRemove = [...subscribedSymbols].filter((s) => !next.has(s));
    if (toAdd.length > 0) sendSubscribe(toAdd);
    if (toRemove.length > 0) sendUnsubscribe(toRemove);
    subscribedSymbols = next;
  }

  function close() {
    closed = true;
    clearTimeout(reconnectTimer);
    ws?.close();
  }

  connect();
  return { setSymbols, close };
}
