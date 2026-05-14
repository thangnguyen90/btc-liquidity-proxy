// Real-time position monitor using Binance WebSocket streams.
//
// Two streams run concurrently:
//   1. User Data Stream (listenKey) → ACCOUNT_UPDATE: updates position cache
//      (entry price, size, leverage, margin) whenever Binance emits P&L changes
//   2. Combined mark price stream (markPrice@1s) → recalculates ROE per tick
//      for each symbol in the position cache
//
// On each mark price tick, if ROE crosses the configured threshold,
// `onRoeThreshold(symbol, posState, markPrice)` is called.

const WS_BASE = 'wss://fstream.binance.com';

export function startPositionMonitor({ client, onRoeUpdate }) {
  // symbol → { amt, entry, leverage, upnl, isolatedMargin, initialMargin }
  const posCache = new Map();

  // ── User Data Stream ───────────────────────────────────────────────────────
  let userDataWs = null;
  let listenKey = null;
  let keepAliveTimer = null;

  async function startUserDataStream() {
    let apiKey;
    try {
      // Try env vars first, then session credentials via the exported helper
      apiKey = process.env.BINANCE_API_KEY;
      if (!apiKey) throw new Error('no key');
    } catch {
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

    userDataWs = new WebSocket(`${WS_BASE}/ws/${listenKey}`);

    userDataWs.addEventListener('message', ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg.e !== 'ACCOUNT_UPDATE') return;

      for (const p of msg.a?.P ?? []) {
        const amt = Number(p.pa);
        if (amt === 0) {
          posCache.delete(p.s);
          updateMarkPriceSubscriptions();
          return;
        }
        const prev = posCache.get(p.s) ?? {};
        posCache.set(p.s, {
          ...prev,
          amt,
          entry: Number(p.ep),
          upnl: Number(p.up),
          isolatedMargin: Number(p.iw ?? 0),
        });
        updateMarkPriceSubscriptions();
      }
    });

    userDataWs.addEventListener('close', () => {
      console.warn('[PosMonitor] User data stream closed — reconnecting in 5s');
      clearInterval(keepAliveTimer);
      setTimeout(startUserDataStream, 5_000);
    });

    userDataWs.addEventListener('error', (e) => {
      console.error('[PosMonitor] User data stream error:', e.message ?? e.type);
    });

    // Keep listen key alive every 30 min
    keepAliveTimer = setInterval(async () => {
      try { await client.keepAliveListenKey({ listenKey, apiKey }); }
      catch (err) { console.error('[PosMonitor] keepAlive failed:', err.message); }
    }, 30 * 60_000);

    console.log('[PosMonitor] User data stream connected.');
  }

  // ── Seed position cache from REST on startup ────────────────────────────────
  async function seedPositions() {
    try {
      const apiKey = process.env.BINANCE_API_KEY;
      const apiSecret = process.env.BINANCE_API_SECRET;
      if (!apiKey || !apiSecret) return;
      const positions = await client.getPositions({ apiKey, apiSecret });
      for (const p of positions) {
        if (Number(p.positionAmt) === 0) continue;
        posCache.set(p.symbol, {
          amt: Number(p.positionAmt),
          entry: Number(p.entryPrice),
          leverage: Number(p.leverage) || 1,
          upnl: Number(p.unRealizedProfit),
          isolatedMargin: Number(p.isolatedMargin),
          initialMargin: Number(p.initialMargin),
        });
      }
      console.log(`[PosMonitor] Seeded ${posCache.size} position(s) from REST.`);
    } catch (err) {
      console.warn('[PosMonitor] Seed failed:', err.message);
    }
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

  function startMarkPriceStream() {
    markWs = new WebSocket(`${WS_BASE}/stream`);
    wsReady = false;

    markWs.addEventListener('open', () => {
      wsReady = true;
      const all = new Set([...posCache.keys()].map((s) => s.toLowerCase()));
      for (const s of pendingSubscribe) all.add(s);
      pendingSubscribe.clear();
      if (all.size > 0) {
        markWs.send(JSON.stringify({ method: 'SUBSCRIBE', params: [...all].map((s) => `${s}@markPrice@1s`), id: 1 }));
        subscribedSymbols = all;
      }
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
      const pos = posCache.get(symbol);
      if (!pos) return;

      const margin = pos.isolatedMargin > 0 ? pos.isolatedMargin
        : pos.initialMargin > 0 ? pos.initialMargin
          : pos.leverage > 0 ? Math.abs(pos.amt) * pos.entry / pos.leverage : 0;
      if (margin <= 0) return;

      const roe = (pos.upnl / margin) * 100;
      onRoeUpdate(symbol, pos, markPrice, roe);
    });

    markWs.addEventListener('close', () => {
      wsReady = false;
      subscribedSymbols.clear();
      console.warn('[PosMonitor] Mark price stream closed — reconnecting in 5s');
      setTimeout(startMarkPriceStream, 5_000);
    });

    markWs.addEventListener('error', (e) => {
      console.error('[PosMonitor] Mark price stream error:', e.message ?? e.type);
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  seedPositions().then(() => {
    startMarkPriceStream();
    startUserDataStream();
  });

  return {
    posCache,
    refreshPosition(symbol, data) {
      const prev = posCache.get(symbol) ?? {};
      posCache.set(symbol, { ...prev, ...data });
      updateMarkPriceSubscriptions();
    },
  };
}
