import WebSocket from 'ws';

const WS_BASE = 'wss://fstream.binance.com/public/ws';
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export function createMarkPriceTicker({ onPrice }) {
  let ws = null;
  let symbols = new Set();
  let liveSymbols = new Set();
  let reconnectTimer = null;
  let reconcileTimer = null;
  let requestId = 1;
  let closed = false;
  let backoffMs = BACKOFF_BASE_MS;

  function sendControl(method, targetSymbols) {
    if (ws?.readyState !== WebSocket.OPEN || targetSymbols.length === 0) return;
    for (let i = 0; i < targetSymbols.length; i += 200) {
      ws.send(JSON.stringify({
        method,
        params: targetSymbols.slice(i, i + 200).map((symbol) => `${symbol.toLowerCase()}@bookTicker`),
        id: requestId++,
      }));
    }
  }

  function reconcile() {
    reconcileTimer = null;
    if (ws?.readyState !== WebSocket.OPEN) return;
    const add = [...symbols].filter((symbol) => !liveSymbols.has(symbol));
    const remove = [...liveSymbols].filter((symbol) => !symbols.has(symbol));
    sendControl('SUBSCRIBE', add);
    sendControl('UNSUBSCRIBE', remove);
    for (const symbol of add) liveSymbols.add(symbol);
    for (const symbol of remove) liveSymbols.delete(symbol);
  }

  function scheduleReconcile(delay = 100) {
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(reconcile, delay);
  }

  function connect() {
    if (closed) return;
    ws = new WebSocket(WS_BASE);
    ws.on('open', () => {
      backoffMs = BACKOFF_BASE_MS;
      liveSymbols = new Set();
      console.log('[MarkTick] Connected to Binance routed bookTicker stream.');
      scheduleReconcile(0);
    });
    ws.on('message', (raw) => {
      try {
        const row = JSON.parse(raw.toString());
        if (row?.e !== 'bookTicker') return;
        const symbol = String(row.s ?? '').toUpperCase();
        if (!symbols.has(symbol)) return;
        const bid = Number(row.b);
        const ask = Number(row.a);
        const markPrice = (bid + ask) / 2;
        if (!Number.isFinite(markPrice) || markPrice <= 0) return;
        onPrice({ symbol, markPrice, eventTime: Number(row.E ?? Date.now()) });
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
    scheduleReconcile();
  }

  function close() {
    closed = true;
    clearTimeout(reconnectTimer);
    clearTimeout(reconcileTimer);
    ws?.close();
  }

  connect();
  return { setSymbols, close };
}
