export const POST_MOVE_LIVE_PRICE_SOCKET_VERSION = 'POST_MOVE_LIVE_PRICE_SOCKET_V1_20260924';

const SOCKET_URLS = [
  'wss://fstream.binancefuture.com/ws',
  'wss://fstream.binance.com/ws',
];

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSymbol(value) {
  const symbol = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{2,40}USDT$/.test(symbol) ? symbol : '';
}

export function comparePostMoveLivePrice({ price, snapshotPrice, zoneLow, zoneHigh, midpoint } = {}) {
  const live = finite(price);
  const snapshot = finite(snapshotPrice);
  const low = finite(zoneLow);
  const high = finite(zoneHigh);
  const middle = finite(midpoint);
  return {
    price: live,
    deltaSnapshotPct: live > 0 && snapshot > 0 ? (live / snapshot - 1) * 100 : null,
    distanceToMidPct: live > 0 && middle > 0 ? (middle / live - 1) * 100 : null,
    inZone: live > 0 && low > 0 && high >= low && live >= low && live <= high,
  };
}

export function parsePostMoveMarkPricePayload(raw, wantedSymbols = new Set()) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return []; }
  }
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [parsed?.data ?? parsed];
  const wanted = wantedSymbols instanceof Set ? wantedSymbols : new Set(wantedSymbols ?? []);
  return rows.flatMap((row) => {
    const symbol = normalizeSymbol(row?.s ?? row?.symbol);
    const markPrice = finite(row?.p ?? row?.markPrice);
    if (!symbol || !(markPrice > 0) || (wanted.size && !wanted.has(symbol))) return [];
    return [{ symbol, markPrice, eventAt: finite(row?.E ?? row?.eventAt, Date.now()) }];
  });
}

export class PostMoveLivePriceSocket {
  constructor({ onTick = () => {}, onState = () => {}, WebSocketImpl = globalThis.WebSocket } = {}) {
    this.onTick = onTick;
    this.onState = onState;
    this.WebSocketImpl = WebSocketImpl;
    this.symbols = new Set();
    this.socket = null;
    this.retryTimer = null;
    this.retryMs = 1_000;
    this.urlIndex = 0;
    this.stopped = false;
    this.subscribedSymbols = new Set();
    this.requestId = 1;
  }

  setSymbols(values) {
    const nextSymbols = new Set((Array.isArray(values) ? values : [])
      .map(normalizeSymbol)
      .filter(Boolean));
    this.symbols = nextSymbols;
    if (!this.symbols.size) {
      this.disconnect('Không có coin active');
      this.onState({ state: 'idle', detail: 'Chưa có coin active để mở socket' });
      return;
    }
    this.stopped = false;
    if (this.socket?.readyState === this.WebSocketImpl?.OPEN) {
      this.syncSubscriptions();
    } else if (this.socket?.readyState !== this.WebSocketImpl?.CONNECTING) {
      this.connect();
    }
  }

  sendSubscription(method, symbols) {
    if (this.socket?.readyState !== this.WebSocketImpl?.OPEN) return;
    const list = [...symbols];
    for (let index = 0; index < list.length; index += 200) {
      this.socket.send(JSON.stringify({
        method,
        params: list.slice(index, index + 200).map((symbol) => `${symbol.toLowerCase()}@markPrice@1s`),
        id: this.requestId++,
      }));
    }
  }

  syncSubscriptions() {
    const added = [...this.symbols].filter((symbol) => !this.subscribedSymbols.has(symbol));
    const removed = [...this.subscribedSymbols].filter((symbol) => !this.symbols.has(symbol));
    if (removed.length) this.sendSubscription('UNSUBSCRIBE', removed);
    if (added.length) this.sendSubscription('SUBSCRIBE', added);
    this.subscribedSymbols = new Set(this.symbols);
  }

  connect() {
    if (this.stopped || !this.symbols.size || !this.WebSocketImpl) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.disconnect('reconnect', { keepStopped: true });
    this.onState({ state: 'connecting', detail: `${this.symbols.size} coin · MARK mỗi giây` });
    const socket = new this.WebSocketImpl(SOCKET_URLS[this.urlIndex % SOCKET_URLS.length]);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.retryMs = 1_000;
      this.subscribedSymbols.clear();
      this.syncSubscriptions();
      this.onState({ state: 'connected', detail: `${this.symbols.size} coin · MARK mỗi giây` });
    });
    socket.addEventListener('message', (message) => {
      if (this.socket !== socket) return;
      for (const tick of parsePostMoveMarkPricePayload(message.data, this.symbols)) this.onTick(tick);
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket || this.stopped || !this.symbols.size) return;
      this.socket = null;
      this.subscribedSymbols.clear();
      this.urlIndex += 1;
      this.onState({ state: 'fallback', detail: 'Mất socket · đang nối lại' });
      const delay = this.retryMs;
      this.retryMs = Math.min(15_000, this.retryMs * 2);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    });
    socket.addEventListener('error', () => socket.close());
  }

  disconnect(reason = 'stop', { keepStopped = false } = {}) {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (!keepStopped) this.stopped = true;
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      try { socket.close(1000, reason); } catch {}
    }
    this.subscribedSymbols.clear();
  }
}
