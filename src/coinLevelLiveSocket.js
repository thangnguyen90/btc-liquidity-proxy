import WebSocket, { WebSocketServer } from 'ws';

export const COIN_LEVEL_LIVE_SOCKET_VERSION =
  'COIN_LEVEL_ANALYSIS_MARK_SOCKET_V1_20260919';

const DEFAULT_PATH = '/ws/coin-level-analysis';

function writeUpgradeError(socket, status = 400, message = 'Bad Request') {
  if (socket.destroyed) return;
  socket.write(
    `HTTP/1.1 ${status} ${message}\r\n`
    + 'Connection: close\r\n'
    + 'Content-Type: text/plain; charset=utf-8\r\n'
    + `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`
    + message,
  );
  socket.destroy();
}

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 256 * 1024) return false;
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function attachCoinLevelLiveSocket({
  server,
  ticker,
  normalizeSymbol,
  path = DEFAULT_PATH,
  heartbeatMs = 15_000,
  now = () => Date.now(),
} = {}) {
  if (!server?.on || !ticker?.register || !ticker?.setSymbols || !ticker?.unregister) {
    throw new TypeError('Coin-level live socket requires an HTTP server and shared mark ticker.');
  }
  if (typeof normalizeSymbol !== 'function') {
    throw new TypeError('Coin-level live socket requires normalizeSymbol.');
  }

  const wss = new WebSocketServer({ noServer: true });
  let sequence = 0;

  const upgrade = (request, socket, head) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    } catch {
      return;
    }
    if (requestUrl.pathname !== path) return;
    const symbol = normalizeSymbol(requestUrl.searchParams.get('symbol') ?? '');
    if (!symbol) {
      writeUpgradeError(socket, 400, 'Invalid symbol');
      return;
    }
    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit('connection', client, request, { symbol });
    });
  };

  server.on('upgrade', upgrade);
  wss.on('connection', (socket, _request, { symbol }) => {
    const clientId = `coin-level-live:${process.pid}:${++sequence}`;
    let closed = false;
    let lastSentEventAt = 0;
    let heartbeat = null;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      ticker.unregister(clientId);
    };

    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('close', cleanup);
    socket.on('error', cleanup);

    ticker.register(clientId, ({ symbol: tickSymbol, markPrice, eventTime }) => {
      if (tickSymbol !== symbol) return;
      const eventAt = Number(eventTime) || now();
      if (eventAt < lastSentEventAt) return;
      lastSentEventAt = eventAt;
      sendJson(socket, {
        type: 'mark',
        version: COIN_LEVEL_LIVE_SOCKET_VERSION,
        symbol,
        markPrice: Number(markPrice),
        eventAt,
        receivedAt: now(),
        source: 'BINANCE_FUTURES_MARK_PRICE_SOCKET',
      });
    });
    ticker.setSymbols(clientId, [symbol]);

    sendJson(socket, {
      type: 'ready',
      version: COIN_LEVEL_LIVE_SOCKET_VERSION,
      symbol,
      connectedAt: now(),
      source: 'BINANCE_FUTURES_MARK_PRICE_SOCKET',
    });
    const current = ticker.getPriceInfo?.(symbol);
    if (Number(current?.markPrice) > 0) {
      sendJson(socket, {
        type: 'mark',
        version: COIN_LEVEL_LIVE_SOCKET_VERSION,
        symbol,
        markPrice: Number(current.markPrice),
        eventAt: Number(current.at) || now(),
        receivedAt: now(),
        source: 'BINANCE_FUTURES_MARK_PRICE_SOCKET_CACHE',
      });
    }

    heartbeat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        cleanup();
        return;
      }
      if (socket.isAlive === false) {
        socket.terminate();
        cleanup();
        return;
      }
      socket.isAlive = false;
      socket.ping();
      sendJson(socket, {
        type: 'heartbeat',
        version: COIN_LEVEL_LIVE_SOCKET_VERSION,
        symbol,
        at: now(),
      });
    }, Math.max(5_000, Number(heartbeatMs) || 15_000));
    heartbeat.unref?.();
  });

  return {
    version: COIN_LEVEL_LIVE_SOCKET_VERSION,
    path,
    get clientCount() { return wss.clients.size; },
    close() {
      server.off?.('upgrade', upgrade);
      for (const client of wss.clients) client.close(1001, 'server shutdown');
      wss.close();
    },
  };
}
