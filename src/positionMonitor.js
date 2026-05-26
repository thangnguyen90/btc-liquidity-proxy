// Real-time position monitor using Binance WebSocket streams.
//
// Two streams run concurrently:
//   1. User Data Stream (listenKey) → ACCOUNT_UPDATE: updates position cache
//      whenever Binance emits position changes (fills, funding)
//   2. Combined mark price stream (markPrice@1s) → ROE calculated real-time
//      from current mark price + cached entry/margin every second
//
// Fallback REST sync every 60s ensures positions opened after startup
// (and missed ACCOUNT_UPDATEs) are always tracked.
//
// onRoeUpdate(symbol, pos, markPrice, roe) is called on every mark price tick.

import WebSocket from 'ws';

const WS_BASE = 'wss://fstream.binancefuture.com';

export function startPositionMonitor({ client, onRoeUpdate, onOrderFill = null, onPositionClose = null, getCredentials = null }) {
  // symbol → { amt, entry, leverage, isolatedMargin, initialMargin }
  const posCache = new Map();
  const stats = {
    startedAt: Date.now(),
    lastRestSyncAt: null,
    lastRestSyncSymbols: [],
    lastMarkConnectedAt: null,
    lastMarkTickAt: null,
    lastRoeUpdateAt: null,
    lastRoeSymbol: null,
    lastUserDataConnectedAt: null,
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function calcMargin(pos) {
    if (pos.isolatedMargin > 0) return pos.isolatedMargin;
    if (pos.initialMargin > 0) return pos.initialMargin;
    const lev = pos.leverage > 0 ? pos.leverage : 1;
    return Math.abs(pos.amt) * pos.entry / lev;
  }

  function upsert(symbol, fields) {
    const prev = posCache.get(symbol) ?? {};
    posCache.set(symbol, { ...prev, ...fields });
    updateMarkPriceSubscriptions();
  }

  // ── REST position sync ─────────────────────────────────────────────────────
  async function syncPositions() {
    try {
      const { apiKey, apiSecret } = resolveCredentials();
      const positions = await client.getPositions({ apiKey, apiSecret });

      const activeSymbols = new Set();
      for (const p of positions) {
        if (Number(p.positionAmt) === 0) continue;
        const symbol = p.symbol;
        activeSymbols.add(symbol);
        const existing = posCache.get(symbol);
        // Always update structural fields; skip if already tracked with same entry
        if (!existing || Math.abs(Number(p.entryPrice) - existing.entry) / (existing.entry || 1) > 0.0001) {
          upsert(symbol, {
            amt: Number(p.positionAmt),
            entry: Number(p.entryPrice),
            leverage: Number(p.leverage) || 1,
            isolatedMargin: Number(p.isolatedMargin),
            initialMargin: Number(p.initialMargin),
            positionSide: p.positionSide ?? 'BOTH',
          });
        }
      }

      // Remove positions that are now closed
      for (const sym of posCache.keys()) {
        if (!activeSymbols.has(sym)) {
          posCache.delete(sym);
          updateMarkPriceSubscriptions();
        }
      }
      stats.lastRestSyncAt = Date.now();
      stats.lastRestSyncSymbols = [...activeSymbols].sort();
    } catch (err) {
      if (err.message?.includes('Missing Binance API')) return;
      console.warn('[PosMonitor] REST sync failed:', err.message);
    }
  }

  // ── User Data Stream ───────────────────────────────────────────────────────
  let listenKey = null;
  let keepAliveTimer = null;

  function resolveCredentials() {
    if (getCredentials) return getCredentials();
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) throw new Error('Missing Binance API credentials.');
    return { apiKey, apiSecret };
  }

  async function startUserDataStream() {
    let apiKey;
    try {
      ({ apiKey } = resolveCredentials());
    } catch (err) {
      if (!err.message?.includes('Missing Binance API')) console.error('[PosMonitor] credentials failed:', err.message);
      setTimeout(startUserDataStream, 60_000);
      return;
    }

    try {
      const res = await client.createListenKey({ apiKey });
      listenKey = res.listenKey;
    } catch (err) {
      console.error('[PosMonitor] createListenKey failed:', err.message);
      setTimeout(startUserDataStream, 30_000);
      return;
    }

    const ws = new WebSocket(`${WS_BASE}/ws/${listenKey}`);

    ws.addEventListener('message', ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      if (msg.e === 'ACCOUNT_UPDATE') {
        for (const p of msg.a?.P ?? []) {
          const amt = Number(p.pa);
          if (amt === 0) {
            if (posCache.has(p.s)) {
              // Position vừa đóng (SL/TP/manual) → trigger cleanup ngay
              posCache.delete(p.s);
              updateMarkPriceSubscriptions();
              if (onPositionClose) onPositionClose(p.s);
            }
          } else {
            upsert(p.s, {
              amt,
              entry: Number(p.ep),
              isolatedMargin: Number(p.iw ?? 0),
              positionSide: p.ps ?? 'BOTH',
            });
          }
        }
        return;
      }

      if (msg.e === 'ORDER_TRADE_UPDATE' && onOrderFill) {
        const o = msg.o;
        // Only care about fills that open/increase a position (not reduceOnly)
        if (o && o.x === 'TRADE' && !o.R && Number(o.l) > 0) {
          onOrderFill(o.s, { side: o.S, filledQty: Number(o.l), avgPrice: Number(o.ap || o.p), positionSide: o.ps ?? 'BOTH', fillTime: Number(o.T) });
        }
      }
    });

    ws.addEventListener('close', () => {
      console.warn('[PosMonitor] User data WS closed — reconnecting in 5s');
      clearInterval(keepAliveTimer);
      setTimeout(startUserDataStream, 5_000);
    });

    ws.addEventListener('error', (e) => {
      console.error('[PosMonitor] User data WS error:', e.message ?? e.type);
    });

    keepAliveTimer = setInterval(async () => {
      try { await client.keepAliveListenKey({ listenKey, apiKey }); }
      catch (err) { console.error('[PosMonitor] keepAlive failed:', err.message); }
    }, 30 * 60_000);

    console.log('[PosMonitor] User data stream connected.');
    stats.lastUserDataConnectedAt = Date.now();
  }

  // ── Mark price combined stream ─────────────────────────────────────────────
  let markWs = null;
  let subscribedSymbols = new Set();
  let wsReady = false;
  const pendingSubscribe = new Set();

  function updateMarkPriceSubscriptions() {
    const wanted = new Set([...posCache.keys()].map((s) => s.toLowerCase()));
    const toAdd = [...wanted].filter((s) => !subscribedSymbols.has(s));
    const toRemove = [...subscribedSymbols].filter((s) => !wanted.has(s));

    if (markWs && wsReady) {
      if (toAdd.length) {
        markWs.send(JSON.stringify({ method: 'SUBSCRIBE', params: toAdd.map((s) => `${s}@markPrice@1s`), id: Date.now() }));
        for (const s of toAdd) subscribedSymbols.add(s);
      }
      if (toRemove.length) {
        markWs.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: toRemove.map((s) => `${s}@markPrice@1s`), id: Date.now() }));
        for (const s of toRemove) subscribedSymbols.delete(s);
      }
    } else {
      for (const s of toAdd) pendingSubscribe.add(s);
    }
  }

  let _markStreamBackoffMs = 5_000;
  const _markStreamBackoffMax = 5 * 60_000;

  function startMarkPriceStream() {
    markWs = new WebSocket(`${WS_BASE}/stream`);
    wsReady = false;

    markWs.addEventListener('open', () => {
      _markStreamBackoffMs = 5_000; // reset backoff on successful connect
      wsReady = true;
      stats.lastMarkConnectedAt = Date.now();
      const all = new Set([...posCache.keys()].map((s) => s.toLowerCase()));
      for (const s of pendingSubscribe) all.add(s);
      pendingSubscribe.clear();
      if (all.size > 0) {
        markWs.send(JSON.stringify({ method: 'SUBSCRIBE', params: [...all].map((s) => `${s}@markPrice@1s`), id: 1 }));
        subscribedSymbols = all;
      }
      console.log(`[PosMonitor] Mark price stream connected. Tracking ${all.size} symbol(s).`);
    });

    markWs.addEventListener('message', ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      const stream = msg.stream ?? '';
      if (!stream.endsWith('@markPrice@1s')) return;

      const d = msg.data;
      if (!d?.s || !d?.p) return;

      const symbol = d.s;
      const markPrice = Number(d.p);
      stats.lastMarkTickAt = Date.now();
      const pos = posCache.get(symbol);
      if (!pos || !pos.entry || !pos.amt) return;

      // Calculate ROE from current mark price (not stale upnl)
      const upnl = (markPrice - pos.entry) * pos.amt;
      const margin = calcMargin(pos);
      if (margin <= 0) return;

      // Keep markPrice + upnl fresh in posCache so callers don't need extra REST calls
      pos.markPrice = markPrice;
      pos.unRealizedProfit = upnl;

      const roe = (upnl / margin) * 100;
      stats.lastRoeUpdateAt = Date.now();
      stats.lastRoeSymbol = symbol;
      onRoeUpdate(symbol, pos, markPrice, roe);
    });

    markWs.addEventListener('close', () => {
      wsReady = false;
      subscribedSymbols.clear();
      const delay = _markStreamBackoffMs;
      _markStreamBackoffMs = Math.min(_markStreamBackoffMs * 2, _markStreamBackoffMax);
      const delaySec = Math.round(delay / 1000);
      console.warn(`[PosMonitor] Mark price stream closed — reconnecting in ${delaySec}s`);
      setTimeout(startMarkPriceStream, delay);
    });

    markWs.addEventListener('error', (e) => {
      const msg = e.message ?? e.type ?? '';
      if (/418|429|403/.test(msg) || msg.includes('ECONNREFUSED')) {
        _markStreamBackoffMs = 3 * 60_000; // 3min wait on ban
        console.warn('[PosMonitor] ⛔ Ban/rate-limit on mark price stream — waiting 3min.');
      } else {
        console.error('[PosMonitor] Mark price stream error:', msg);
      }
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  syncPositions().then(() => {
    startMarkPriceStream();
    startUserDataStream();
    // Periodic REST sync: catch positions opened/closed outside ACCOUNT_UPDATE
    setInterval(syncPositions, 60_000);
  });

  return {
    posCache,
    // Call after placing an order to immediately track the position
    trackPosition(symbol, { amt, entry, leverage, isolatedMargin = 0, initialMargin = 0, positionSide = 'BOTH' }) {
      upsert(symbol, { amt, entry, leverage, isolatedMargin, initialMargin, positionSide });
    },
    // Returns position-like objects compatible with client.getPositions() shape
    getActivePositions() {
      return [...posCache.entries()].map(([symbol, pos]) => ({
        symbol,
        positionAmt: String(pos.amt),
        entryPrice: String(pos.entry),
        leverage: String(pos.leverage ?? 10),
        isolatedMargin: String(pos.isolatedMargin ?? 0),
        initialMargin: String(pos.initialMargin ?? 0),
        positionSide: pos.positionSide ?? 'BOTH',
        markPrice: String(pos.markPrice ?? 0),
        unRealizedProfit: String(pos.unRealizedProfit ?? 0),
      }));
    },
    getStatus() {
      return {
        ...stats,
        wsReady,
        cachedSymbols: [...posCache.keys()].sort(),
        subscribedSymbols: [...subscribedSymbols].map((s) => s.toUpperCase()).sort(),
        pendingSymbols: [...pendingSubscribe].map((s) => s.toUpperCase()).sort(),
      };
    },
  };
}
