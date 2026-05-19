import WebSocket from 'ws';

const WS_BASE = 'wss://fstream.binance.com/ws';
const WS_OPTS = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Origin': 'https://www.binance.com',
  },
};

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
      console.log('[MarkTick] Connected to Binance futures bookTicker stream.');
      if (subscribedSymbols.size > 0) sendSubscribe([...subscribedSymbols]);

      setTimeout(() => {
        if (!dataReceived && !closed) {
          console.warn('[MarkTick] ⚠️ No data after 30s — stream may be blocked. REST polling is the fallback.');
        }
      }, 30_000);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.e === 'bookTicker') {
          dataReceived = true;
          const markPrice = (Number(msg.b) + Number(msg.a)) / 2;
          onPrice({ symbol: msg.s, markPrice });
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on('close', () => {
      if (!closed) {
        console.log('[MarkTick] Disconnected. Reconnecting in 5s…');
        scheduleReconnect();
      }
    });

    ws.on('error', () => { /* close event handles reconnect */ });
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

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { if (!closed) connect(); }, 5_000);
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
