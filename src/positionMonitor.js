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

const USER_WS_BASE = 'wss://fstream.binance.com/private/ws';
const MARKET_WS_BASE = 'wss://fstream.binance.com/ws';

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
    lastAccountUpdateAt: null,
    lastOrderTradeUpdateAt: null,
    lastDetectedOpenAt: null,
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

  function shouldNotifyOpen(prev, next) {
    if (!onOrderFill || !next?.amt || !next?.entry) return false;
    if (!prev || !prev.amt || !prev.entry) return true;
    const sameSide = Math.sign(prev.amt) === Math.sign(next.amt);
    const sizeIncreased = sameSide && Math.abs(next.amt) > Math.abs(prev.amt) + 1e-12;
    const entryChanged = Math.abs(next.entry - prev.entry) / Math.max(Math.abs(prev.entry), 1e-9) > 0.0001;
    return sizeIncreased || entryChanged;
  }

  function notifyOpen(symbol, prev, next, source, eventTime = Date.now()) {
    if (!shouldNotifyOpen(prev, next)) return;
    stats.lastDetectedOpenAt = Date.now();
    console.log(`[PosMonitor] detected ${source} open/increase ${symbol} amt=${next.amt} entry=${next.entry}`);
    onOrderFill(symbol, {
      side: next.amt > 0 ? 'BUY' : 'SELL',
      filledQty: Math.abs((next.amt ?? 0) - (prev?.amt ?? 0)) || Math.abs(next.amt),
      avgPrice: next.entry,
      positionSide: next.positionSide ?? 'BOTH',
      fillTime: eventTime,
      source,
    });
  }

  // ── REST position sync ─────────────────────────────────────────────────────
  let restSyncRunning = false;
  async function syncPositions() {
    if (restSyncRunning) return;
    restSyncRunning = true;
    try {
      const { apiKey, apiSecret } = resolveCredentials();
      const positions = await client.getPositions({ apiKey, apiSecret });

      const activeSymbols = new Set();
      for (const p of positions) {
        if (Number(p.positionAmt) === 0) continue;
        const symbol = p.symbol;
        activeSymbols.add(symbol);
        const existing = posCache.get(symbol);
        const next = {
          amt: Number(p.positionAmt),
          entry: Number(p.entryPrice),
          leverage: Number(p.leverage) || 1,
          isolatedMargin: Number(p.isolatedMargin),
          initialMargin: Number(p.positionInitialMargin ?? p.initialMargin),
          liquidationPrice: Number(p.liquidationPrice),
          breakEvenPrice: Number(p.breakEvenPrice),
          marginType: p.marginType ?? null,
          updateTime: Number(p.updateTime) || null,
          positionSide: p.positionSide ?? 'BOTH',
        };
        // Always update structural fields; skip if already tracked with same entry
        if (!existing || Math.abs(Number(p.entryPrice) - existing.entry) / (existing.entry || 1) > 0.0001) {
          upsert(symbol, next);
          notifyOpen(symbol, existing, next, 'REST_SYNC');
        } else if (existing && Math.abs(next.amt) > Math.abs(existing.amt) + 1e-12) {
          upsert(symbol, next);
          notifyOpen(symbol, existing, next, 'REST_SYNC');
        } else {
          upsert(symbol, next);
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
    } finally {
      restSyncRunning = false;
    }
  }

  // ── User Data Stream ───────────────────────────────────────────────────────
  let listenKey = null;
  let keepAliveTimer = null;
  const userDataEventLogAt = new Map();

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

    const ws = new WebSocket(`${USER_WS_BASE}/${listenKey}`);

    ws.addEventListener('message', async ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg?.e) {
        const last = userDataEventLogAt.get(msg.e) ?? 0;
        if (Date.now() - last > 30_000) {
          userDataEventLogAt.set(msg.e, Date.now());
          console.log(`[PosMonitor] user-data event ${msg.e}`);
        }
      }

      if (msg.e === 'ACCOUNT_UPDATE') {
        stats.lastAccountUpdateAt = Date.now();
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
            const prev = posCache.get(p.s);
            const next = {
              amt,
              entry: Number(p.ep),
              leverage: Number(prev?.leverage ?? 1),
              isolatedMargin: Number(p.iw ?? 0),
              positionSide: p.ps ?? 'BOTH',
            };
            upsert(p.s, next);
          }
        }
        return;
      }

      if (msg.e === 'ORDER_TRADE_UPDATE' && onOrderFill) {
        stats.lastOrderTradeUpdateAt = Date.now();
        const o = msg.o;
        // Only care about fills that open/increase a position (not reduceOnly)
        const reduceOnly = o?.R === true || String(o?.R).toLowerCase() === 'true';
        if (o && o.x === 'TRADE' && !reduceOnly && Number(o.l) > 0) {
          const avgPrice = Number(o.ap || 0) > 0 ? Number(o.ap) : Number(o.L || o.p);
          console.log(`[PosMonitor] SOCKET_FILL ${o.s} side=${o.S} qty=${o.l} avg=${avgPrice} status=${o.X} exec=${o.x}`);
          await syncPositions();
          await onOrderFill(o.s, {
            side: o.S,
            filledQty: Number(o.l),
            cumulativeFilledQty: Number(o.z),
            originalQty: Number(o.q),
            avgPrice,
            positionSide: o.ps ?? 'BOTH',
            fillTime: Number(o.T),
            orderStatus: o.X,
            orderId: o.i,
            clientOrderId: o.c ?? null,
            orderType: o.o ?? null,
            reduceOnly,
            source: 'ORDER_TRADE_UPDATE',
          });
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
    markWs = new WebSocket(MARKET_WS_BASE);
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
        ...(() => {
          const leverage = Number(pos.leverage) || 1;
          const calculatedInitialMargin = Math.abs(Number(pos.amt) || 0)
            * (Number(pos.entry) || 0) / leverage;
          const positionInitialMargin = Number(pos.initialMargin) > 0
            ? Number(pos.initialMargin)
            : calculatedInitialMargin;
          return {
            positionInitialMargin: String(positionInitialMargin || 0),
            initialMargin: String(positionInitialMargin || 0),
          };
        })(),
        symbol,
        positionAmt: String(pos.amt),
        entryPrice: String(pos.entry),
        leverage: String(pos.leverage ?? 10),
        isolatedMargin: String(pos.isolatedMargin ?? 0),
        liquidationPrice: String(pos.liquidationPrice ?? 0),
        breakEvenPrice: String(pos.breakEvenPrice ?? 0),
        marginType: pos.marginType ?? null,
        updateTime: pos.updateTime ?? null,
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
