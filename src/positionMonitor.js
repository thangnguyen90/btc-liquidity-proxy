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

export const POSITION_MONITOR_MARK_STREAM_VERSION = 'POSITION_MONITOR_PER_SYMBOL_MARK_STREAM_V4_20260812';
export const POSITION_PROTECTION_TRIGGER_VERSION = 'POSITION_PROTECTION_SOCKET_FILL_V4_LISTEN_KEY_RECONNECT_20260816';
export const POSITION_USER_DATA_STREAM_VERSION = 'POSITION_USER_DATA_STREAM_V2_LISTEN_KEY_RECOVERY_20260816';
export const POSITION_MONITOR_MARK_STREAM_URL = 'wss://fstream.binance.com/market/stream';
export const POSITION_MONITOR_MARK_STREAM_STALE_MS = 15_000;

export function isBinanceListenKeyExpiredEvent(message = {}) {
  return String(message?.e ?? '').trim().toLowerCase() === 'listenkeyexpired';
}

export function isBinanceListenKeyInvalidError(error) {
  const message = String(error?.message ?? error ?? '');
  return /(?:listen\s*key|listenkey).*(?:does not exist|expired|invalid)|-1125/i.test(message);
}

export function isBinanceSocketFullEntryFill(order = {}) {
  const reduceOnly = order?.R === true || String(order?.R).toLowerCase() === 'true';
  return order?.x === 'TRADE'
    && String(order?.X ?? '').toUpperCase() === 'FILLED'
    && !reduceOnly
    && Number(order?.l) > 0;
}

export function isBinanceTradeLiteExecution(message = {}) {
  return message?.e === 'TRADE_LITE'
    && Boolean(String(message?.s ?? '').trim())
    && message?.i != null
    && Number(message?.l) > 0;
}

export function parsePositionMarkPriceMessage(message) {
  const payload = message?.data && typeof message.data === 'object' ? message.data : message;
  if (!payload || typeof payload !== 'object') return null;
  if (message?.stream && !String(message.stream).endsWith('@markPrice@1s')) return null;
  if (payload.e && payload.e !== 'markPriceUpdate') return null;
  const symbol = String(payload.s ?? '').trim().toUpperCase();
  const markPrice = Number(payload.p);
  if (!symbol || !Number.isFinite(markPrice) || markPrice <= 0) return null;
  return { symbol, markPrice };
}

export function buildPositionMarkPriceStreamUrl(symbols = []) {
  const streams = [...new Set(
    (Array.isArray(symbols) ? symbols : [])
      .map((symbol) => String(symbol ?? '').trim().toLowerCase())
      .filter(Boolean),
  )]
    .sort()
    .map((symbol) => `${symbol}@markPrice@1s`);
  return streams.length
    ? `${POSITION_MONITOR_MARK_STREAM_URL}?streams=${streams.join('/')}`
    : null;
}

export function resolvePositionRoeMargin(position = {}) {
  const initialMargin = Number(position.positionInitialMargin ?? position.initialMargin);
  if (Number.isFinite(initialMargin) && initialMargin > 0) return initialMargin;
  const isolatedMargin = Number(position.isolatedMargin);
  if (Number.isFinite(isolatedMargin) && isolatedMargin > 0) return isolatedMargin;
  const amount = Math.abs(Number(position.amt ?? position.positionAmt));
  const entry = Number(position.entry ?? position.entryPrice);
  const leverage = Number(position.leverage);
  return amount > 0 && entry > 0 && leverage > 0 ? amount * entry / leverage : 0;
}

const USER_WS_BASE = 'wss://fstream.binance.com/private/ws';
const MARKET_WS_BASE = POSITION_MONITOR_MARK_STREAM_URL;

export function startPositionMonitor({
  client,
  onRoeUpdate,
  onOrderFill = null,
  onPositionClose = null,
  onFullFillObserved = null,
  onUserDataReconnect = null,
  getCredentials = null,
}) {
  // symbol → { amt, entry, leverage, isolatedMargin, initialMargin }
  const posCache = new Map();
  const stats = {
    startedAt: Date.now(),
    lastRestSyncAt: null,
    lastRestSyncSymbols: [],
    lastMarkConnectedAt: null,
    lastMarkTickAt: null,
    lastMarkStaleAt: null,
    markReconnectCount: 0,
    lastRoeUpdateAt: null,
    lastRoeSymbol: null,
    lastUserDataConnectedAt: null,
    lastAccountUpdateAt: null,
    lastOrderTradeUpdateAt: null,
    lastTradeLiteAt: null,
    lastTradeLiteVerifiedAt: null,
    lastDetectedOpenAt: null,
    userDataReady: false,
    userDataConnectCount: 0,
    userDataReconnectCount: 0,
    userDataListenKeyExpiredCount: 0,
    userDataKeepAliveFailureCount: 0,
    lastUserDataReconnectAt: null,
    lastUserDataReconnectReason: null,
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function calcMargin(pos) {
    return resolvePositionRoeMargin(pos);
  }

  function upsert(symbol, fields) {
    const prev = posCache.get(symbol) ?? {};
    posCache.set(symbol, { ...prev, ...fields });
    updateMarkPriceSubscriptions();
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
        // REST sync only refreshes the position/ROE cache. It must never emulate
        // an entry fill or place protection; only Binance ORDER_TRADE_UPDATE may.
        if (!existing || Math.abs(Number(p.entryPrice) - existing.entry) / (existing.entry || 1) > 0.0001) {
          upsert(symbol, next);
        } else if (existing && Math.abs(next.amt) > Math.abs(existing.amt) + 1e-12) {
          upsert(symbol, next);
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
  let userWs = null;
  let userStreamGeneration = 0;
  let userReconnectTimer = null;
  let userStreamStarting = false;
  const userDataEventLogAt = new Map();
  const fullFillDeliveryRunning = new Map();
  const deliveredFullFills = new Map();
  const tradeLiteVerificationRunning = new Map();

  function fillKey(symbol, orderId) {
    return `${String(symbol ?? '').toUpperCase()}:${String(orderId ?? '')}`;
  }

  function pruneDeliveredFullFills() {
    const cutoff = Date.now() - 24 * 60 * 60_000;
    for (const [key, at] of deliveredFullFills) {
      if (at < cutoff) deliveredFullFills.delete(key);
    }
  }

  async function deliverSocketFullFill(symbol, fill) {
    if (!onOrderFill) return;
    const key = fillKey(symbol, fill.orderId ?? fill.clientOrderId);
    pruneDeliveredFullFills();
    if (deliveredFullFills.has(key)) return;
    if (fullFillDeliveryRunning.has(key)) return fullFillDeliveryRunning.get(key);

    const delivery = (async () => {
      await syncPositions();
      const current = posCache.get(symbol);
      const fillSide = String(fill.side ?? '').toUpperCase();
      const currentAmount = Number(current?.amt);
      const opensCurrentDirection = current
        && ((fillSide === 'BUY' && currentAmount > 0) || (fillSide === 'SELL' && currentAmount < 0));
      if (!opensCurrentDirection) {
        console.log(`[PosMonitor] SOCKET_FULL_FILL_IGNORED ${symbol} orderId=${fill.orderId ?? '-'}: no matching open position after fill`);
        return;
      }
      const deliveryResult = await onOrderFill(symbol, {
        ...fill,
        // A DCA fill changes the position's average entry. Protection for a
        // manual position must use this post-fill average, not the last fill.
        positionEntryPrice: Number(current.entry) || null,
        positionLeverage: Number(current.leverage) || null,
        positionAmount: currentAmount,
      });
      if (deliveryResult?.protectionComplete !== true) {
        throw new Error(`${symbol} full fill callback did not confirm protection completion`);
      }
      if (onFullFillObserved && fill.deferWatermark !== true) {
        await onFullFillObserved(symbol, {
          ...fill,
          positionEntryPrice: Number(current.entry) || null,
          positionLeverage: Number(current.leverage) || null,
          positionAmount: currentAmount,
        });
      }
      // In-memory dedupe is committed only after the durable watermark write.
      // If persistence fails, TRADE_LITE or a later startup must still retry.
      deliveredFullFills.set(key, Date.now());
    })().finally(() => fullFillDeliveryRunning.delete(key));
    fullFillDeliveryRunning.set(key, delivery);
    return delivery;
  }

  async function recoverMissedFullFills({
    since = 0,
    handledOrderIds = [],
    recoverySource = 'MISSED_FILL_RECOVERY',
  } = {}) {
    if (!onOrderFill) return { checkedSymbols: 0, candidates: 0, recovered: 0, failed: 0 };
    await syncPositions();
    const handled = new Set((Array.isArray(handledOrderIds) ? handledOrderIds : []).map(String));
    const minTime = Math.max(0, Number(since) || 0);
    const summary = {
      checkedSymbols: 0,
      candidates: 0,
      recovered: 0,
      failed: 0,
      maxObservedTradeAt: minTime,
    };
    const recoveredFills = [];
    const { apiKey, apiSecret } = resolveCredentials();

    for (const [symbol, current] of posCache) {
      summary.checkedSymbols += 1;
      try {
        const trades = await client.getUserTrades({ symbol, limit: 100, apiKey, apiSecret });
        const symbolTrades = Array.isArray(trades) ? trades : [];
        summary.maxObservedTradeAt = Math.max(
          summary.maxObservedTradeAt,
          ...symbolTrades.map((trade) => Number(trade?.time) || 0),
        );
        const orderIds = [...new Set(symbolTrades
          .filter((trade) => Number(trade?.time) > minTime)
          .map((trade) => String(trade?.orderId ?? ''))
          .filter((orderId) => orderId && !handled.has(orderId)))];
        const candidates = [];
        for (const orderId of orderIds) {
          const order = await client.getOrder({ symbol, orderId, apiKey, apiSecret });
          const status = String(order?.status ?? '').toUpperCase();
          const reduceOnly = order?.reduceOnly === true || String(order?.reduceOnly).toLowerCase() === 'true';
          const closePosition = order?.closePosition === true || String(order?.closePosition).toLowerCase() === 'true';
          const side = String(order?.side ?? '').toUpperCase();
          const amount = Number(current?.amt);
          const opensCurrentDirection = (side === 'BUY' && amount > 0) || (side === 'SELL' && amount < 0);
          if (status !== 'FILLED' || reduceOnly || closePosition || !opensCurrentDirection) continue;
          candidates.push(order);
        }
        if (candidates.length === 0) continue;
        // One protection pair always covers the whole current position. Replay
        // only the newest missed opening/DCA fill so the durable watermark
        // advances past every earlier fill in the same outage window.
        candidates.sort((left, right) => Number(right.updateTime ?? right.time) - Number(left.updateTime ?? left.time));
        summary.candidates += candidates.length;
        for (const order of candidates) {
          const avgPrice = Number(order?.avgPrice || 0) > 0 ? Number(order.avgPrice) : Number(order?.price);
          await deliverSocketFullFill(symbol, {
            side: order.side,
            filledQty: Number(order.executedQty),
            cumulativeFilledQty: Number(order.executedQty),
            originalQty: Number(order.origQty),
            avgPrice,
            positionSide: order.positionSide ?? current.positionSide ?? 'BOTH',
            fillTime: Number(order.updateTime ?? order.time ?? Date.now()),
            orderStatus: 'FILLED',
            orderId: order.orderId,
            clientOrderId: order.clientOrderId ?? null,
            orderType: order.type ?? order.origType ?? null,
            reduceOnly: false,
            source: recoverySource,
            // Recovery uses one account-wide watermark. Persist it only after
            // every active symbol has completed successfully (see below).
            deferWatermark: true,
          });
          handled.add(String(order.orderId));
          recoveredFills.push({
            orderId: order.orderId,
            clientOrderId: order.clientOrderId ?? null,
            fillTime: Number(order.updateTime ?? order.time ?? Date.now()),
          });
          summary.recovered += 1;
          break;
        }
      } catch (error) {
        summary.failed += 1;
        console.warn(`[PosMonitor] missed-fill recovery ${symbol}: ${error.message}`);
      }
    }
    // A single durable watermark is shared by all symbols. Advance it beyond
    // close/reduce-only trades only after every active symbol was scanned and
    // every opening candidate was protected successfully. Advancing it inside
    // the symbol loop could otherwise hide a missed fill on a later symbol.
    if (summary.failed === 0
      && summary.maxObservedTradeAt > minTime
      && onFullFillObserved) {
      // Preserve the exact handled ids too. Sorting is defensive because the
      // watermark timestamp is monotonic and shared across symbols.
      recoveredFills.sort((left, right) => Number(left.fillTime) - Number(right.fillTime));
      for (const fill of recoveredFills) await onFullFillObserved(null, fill);
      await onFullFillObserved(null, { fillTime: summary.maxObservedTradeAt });
    }
    return summary;
  }

  async function verifyTradeLiteFullFill(message) {
    if (!isBinanceTradeLiteExecution(message) || !onOrderFill) return;
    const symbol = String(message.s).toUpperCase();
    const key = fillKey(symbol, message.i);
    if (deliveredFullFills.has(key)) return;
    if (tradeLiteVerificationRunning.has(key)) return tradeLiteVerificationRunning.get(key);

    const verification = (async () => {
      const delays = [0, 150, 350, 750, 1_250];
      for (let attempt = 0; attempt < delays.length; attempt += 1) {
        if (delays[attempt] > 0) await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        try {
          const { apiKey, apiSecret } = resolveCredentials();
          const order = await client.getOrder({ symbol, orderId: message.i, apiKey, apiSecret });
          const status = String(order?.status ?? '').toUpperCase();
          if (status !== 'FILLED') continue;
          const reduceOnly = order?.reduceOnly === true || String(order?.reduceOnly).toLowerCase() === 'true';
          const closePosition = order?.closePosition === true || String(order?.closePosition).toLowerCase() === 'true';
          if (reduceOnly || closePosition || Number(order?.executedQty) <= 0) return;
          const avgPrice = Number(order?.avgPrice || 0) > 0
            ? Number(order.avgPrice)
            : Number(message.L || order?.price || message.p);
          stats.lastTradeLiteVerifiedAt = Date.now();
          console.log(`[PosMonitor] TRADE_LITE_VERIFIED ${symbol} side=${order.side ?? message.S} qty=${order.executedQty} avg=${avgPrice} orderId=${order.orderId ?? message.i} version=${POSITION_PROTECTION_TRIGGER_VERSION}`);
          await deliverSocketFullFill(symbol, {
            side: order.side ?? message.S,
            filledQty: Number(message.l),
            cumulativeFilledQty: Number(order.executedQty),
            originalQty: Number(order.origQty),
            avgPrice,
            positionSide: order.positionSide ?? message.ps ?? 'BOTH',
            fillTime: Number(message.T ?? message.E ?? order.updateTime ?? Date.now()),
            orderStatus: status,
            orderId: order.orderId ?? message.i,
            clientOrderId: order.clientOrderId ?? message.c ?? null,
            orderType: order.type ?? order.origType ?? null,
            reduceOnly,
            source: 'TRADE_LITE_VERIFIED',
          });
          return;
        } catch (err) {
          if (attempt === delays.length - 1) {
            console.warn(`[PosMonitor] TRADE_LITE_VERIFY_FAILED ${symbol} orderId=${message.i}: ${err.message}`);
          }
        }
      }
      console.log(`[PosMonitor] TRADE_LITE_NOT_FULL ${symbol} orderId=${message.i}; waiting for next socket trade event`);
    })().finally(() => tradeLiteVerificationRunning.delete(key));
    tradeLiteVerificationRunning.set(key, verification);
    return verification;
  }

  function resolveCredentials() {
    if (getCredentials) return getCredentials();
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) throw new Error('Missing Binance API credentials.');
    return { apiKey, apiSecret };
  }

  function clearUserDataKeepAlive() {
    if (!keepAliveTimer) return;
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }

  function scheduleUserDataReconnect(delayMs = 0, reason = 'socket-closed') {
    if (userReconnectTimer) return;
    // Invalidate callbacks from the stale socket before terminating it. Its
    // close event must not schedule another connection over the replacement.
    userStreamGeneration += 1;
    const staleSocket = userWs;
    userWs = null;
    listenKey = null;
    stats.userDataReady = false;
    stats.lastUserDataReconnectReason = reason;
    clearUserDataKeepAlive();
    if (staleSocket) staleSocket.terminate();
    const delay = Math.max(0, Number(delayMs) || 0);
    userReconnectTimer = setTimeout(() => {
      userReconnectTimer = null;
      startUserDataStream(reason).catch((error) => {
        console.error(`[PosMonitor] user-data reconnect failed reason=${reason}: ${error.message}`);
        scheduleUserDataReconnect(5_000, 'reconnect-failed');
      });
    }, delay);
    userReconnectTimer.unref?.();
    console.warn(
      `[PosMonitor] User data reconnect scheduled reason=${reason} delay=${delay}ms`
      + ` version=${POSITION_USER_DATA_STREAM_VERSION}`,
    );
  }

  async function startUserDataStream(reason = 'startup') {
    if (userStreamStarting || userWs) return;
    userStreamStarting = true;
    const generation = ++userStreamGeneration;
    let apiKey;
    try {
      ({ apiKey } = resolveCredentials());
    } catch (err) {
      if (!err.message?.includes('Missing Binance API')) console.error('[PosMonitor] credentials failed:', err.message);
      userStreamStarting = false;
      scheduleUserDataReconnect(60_000, 'credentials-unavailable');
      return;
    }

    try {
      const res = await client.createListenKey({ apiKey });
      if (generation !== userStreamGeneration) {
        userStreamStarting = false;
        return;
      }
      listenKey = res.listenKey;
    } catch (err) {
      console.error('[PosMonitor] createListenKey failed:', err.message);
      userStreamStarting = false;
      scheduleUserDataReconnect(30_000, 'create-listen-key-failed');
      return;
    }

    const ws = new WebSocket(`${USER_WS_BASE}/${listenKey}`);
    userWs = ws;
    userStreamStarting = false;

    ws.addEventListener('open', () => {
      if (generation !== userStreamGeneration) return;
      const reconnected = stats.userDataConnectCount > 0;
      stats.userDataReady = true;
      stats.userDataConnectCount += 1;
      if (reconnected) stats.userDataReconnectCount += 1;
      stats.lastUserDataConnectedAt = Date.now();
      stats.lastUserDataReconnectAt = reconnected ? Date.now() : null;
      stats.lastUserDataReconnectReason = reason;
      console.log(
        `[PosMonitor] User data stream connected reason=${reason} reconnect=${reconnected}`
        + ` version=${POSITION_USER_DATA_STREAM_VERSION}`,
      );
      if (onUserDataReconnect) {
        Promise.resolve(onUserDataReconnect({
          reason,
          reconnected,
          connectedAt: stats.lastUserDataConnectedAt,
          version: POSITION_USER_DATA_STREAM_VERSION,
        })).catch((error) => {
          console.warn(`[PosMonitor] reconnect recovery callback failed: ${error.message}`);
        });
      }
    });

    ws.addEventListener('message', async ({ data }) => {
      if (generation !== userStreamGeneration) return;
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg?.e) {
        const last = userDataEventLogAt.get(msg.e) ?? 0;
        if (Date.now() - last > 30_000) {
          userDataEventLogAt.set(msg.e, Date.now());
          console.log(`[PosMonitor] user-data event ${msg.e}`);
        }
      }

      if (isBinanceListenKeyExpiredEvent(msg)) {
        stats.userDataListenKeyExpiredCount += 1;
        scheduleUserDataReconnect(0, 'listen-key-expired');
        return;
      }

      if (msg.e === 'ALGO_UPDATE') {
        const detail = msg.o ?? msg.a ?? msg;
        console.log(`[PosMonitor] ALGO_UPDATE_DETAIL ${JSON.stringify(detail)}`);
        return;
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

      if (msg.e === 'TRADE_LITE') {
        stats.lastTradeLiteAt = Date.now();
        if (isBinanceTradeLiteExecution(msg)) {
          console.log(`[PosMonitor] TRADE_LITE ${msg.s} side=${msg.S} lastQty=${msg.l} orderId=${msg.i}; verifying exact order status`);
          verifyTradeLiteFullFill(msg).catch((err) => {
            console.warn(`[PosMonitor] TRADE_LITE_VERIFY_ERROR ${msg.s ?? '-'}: ${err.message}`);
          });
        }
        return;
      }

      if (msg.e === 'ORDER_TRADE_UPDATE' && onOrderFill) {
        stats.lastOrderTradeUpdateAt = Date.now();
        const o = msg.o;
        // Only care about fills that open/increase a position (not reduceOnly)
        const reduceOnly = o?.R === true || String(o?.R).toLowerCase() === 'true';
        if (isBinanceSocketFullEntryFill(o)) {
          const avgPrice = Number(o.ap || 0) > 0 ? Number(o.ap) : Number(o.L || o.p);
          stats.lastDetectedOpenAt = Date.now();
          console.log(`[PosMonitor] SOCKET_FULL_FILL ${o.s} side=${o.S} qty=${o.z} avg=${avgPrice} status=${o.X} version=${POSITION_PROTECTION_TRIGGER_VERSION}`);
          try {
            await deliverSocketFullFill(o.s, {
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
          } catch (error) {
            // Keep the user-data socket alive. TRADE_LITE verification and the
            // next reconnect recovery can retry because the fill is not marked
            // delivered until protection is verified on Binance.
            console.error(`[PosMonitor] SOCKET_FULL_FILL_PROTECTION_FAILED ${o.s} orderId=${o.i}: ${error.message}`);
          }
        } else if (o && o.x === 'TRADE' && !reduceOnly && Number(o.l) > 0) {
          console.log(`[PosMonitor] SOCKET_PARTIAL_FILL ${o.s} status=${o.X}; waiting for FILLED before SL/TP`);
        }
      }
    });

    ws.addEventListener('close', () => {
      if (generation !== userStreamGeneration) return;
      userWs = null;
      stats.userDataReady = false;
      scheduleUserDataReconnect(5_000, 'socket-closed');
    });

    ws.addEventListener('error', (e) => {
      if (generation !== userStreamGeneration) return;
      console.error('[PosMonitor] User data WS error:', e.message ?? e.type);
      scheduleUserDataReconnect(5_000, 'socket-error');
    });

    clearUserDataKeepAlive();
    keepAliveTimer = setInterval(async () => {
      if (generation !== userStreamGeneration || !listenKey) return;
      try {
        await client.keepAliveListenKey({ listenKey, apiKey });
      } catch (err) {
        stats.userDataKeepAliveFailureCount += 1;
        console.error('[PosMonitor] keepAlive failed:', err.message);
        if (isBinanceListenKeyInvalidError(err)) {
          scheduleUserDataReconnect(0, 'keepalive-listen-key-invalid');
        }
      }
    }, 30 * 60_000);
    keepAliveTimer.unref?.();
  }

  // ── Mark price combined stream ─────────────────────────────────────────────
  let markWs = null;
  let subscribedSymbols = new Set();
  let wsReady = false;
  let markSubscriptionStartedAt = null;
  let connectionLastMarkTickAt = null;
  let markStreamWatchdog = null;
  let markReconnectTimer = null;
  let markGeneration = 0;
  let markStreamStarted = false;

  function clearMarkStreamWatchdog() {
    if (!markStreamWatchdog) return;
    clearInterval(markStreamWatchdog);
    markStreamWatchdog = null;
  }

  function armMarkStreamWatchdog() {
    clearMarkStreamWatchdog();
    markStreamWatchdog = setInterval(() => {
      if (!wsReady || subscribedSymbols.size === 0) return;
      const freshnessAt = connectionLastMarkTickAt ?? markSubscriptionStartedAt;
      if (!freshnessAt || Date.now() - freshnessAt <= POSITION_MONITOR_MARK_STREAM_STALE_MS) return;

      stats.lastMarkStaleAt = Date.now();
      stats.markReconnectCount += 1;
      console.error(
        `[PosMonitor] Mark price stream stale: no usable tick for ${Math.round((Date.now() - freshnessAt) / 1000)}s `
        + `while tracking ${subscribedSymbols.size} symbol(s); forcing reconnect.`,
      );
      wsReady = false;
      clearMarkStreamWatchdog();
      markWs?.terminate();
    }, 5_000);
    markStreamWatchdog.unref?.();
  }

  function updateMarkPriceSubscriptions() {
    const wanted = new Set([...posCache.keys()].map((s) => s.toLowerCase()));
    const same = wanted.size === subscribedSymbols.size
      && [...wanted].every((symbol) => subscribedSymbols.has(symbol));
    if (same) return;
    subscribedSymbols = wanted;
    if (!markStreamStarted) return;
    if (!markWs) {
      scheduleMarkPriceReconnect(0, 'position-added-without-stream');
      return;
    }
    // Binance's dynamic SUBSCRIBE route was repeatedly closing while many
    // symbols were tracked. Rebuild one documented combined stream URL when
    // the active position set changes instead.
    scheduleMarkPriceReconnect(250, 'position-set-changed');
  }

  let _markStreamBackoffMs = 5_000;
  const _markStreamBackoffMax = 5 * 60_000;

  function scheduleMarkPriceReconnect(delayMs, reason) {
    if (markReconnectTimer) return;
    markReconnectTimer = setTimeout(() => {
      markReconnectTimer = null;
      if (markWs) {
        // Invalidate callbacks from the socket we are intentionally replacing;
        // its close event must not schedule another reconnect over the new one.
        markGeneration += 1;
        const staleSocket = markWs;
        markWs = null;
        staleSocket.terminate();
      }
      startMarkPriceStream();
    }, Math.max(0, delayMs));
    markReconnectTimer.unref?.();
    if (reason) console.warn(`[PosMonitor] Mark stream rebuild scheduled reason=${reason} delay=${delayMs}ms`);
  }

  function startMarkPriceStream() {
    markStreamStarted = true;
    const wanted = [...posCache.keys()].map((symbol) => symbol.toLowerCase());
    subscribedSymbols = new Set(wanted);
    const url = buildPositionMarkPriceStreamUrl(wanted);
    if (!url) {
      markWs = null;
      wsReady = false;
      clearMarkStreamWatchdog();
      return;
    }
    const generation = ++markGeneration;
    markWs = new WebSocket(url);
    wsReady = false;
    connectionLastMarkTickAt = null;
    markSubscriptionStartedAt = null;

    markWs.addEventListener('open', () => {
      _markStreamBackoffMs = 5_000; // reset backoff on successful connect
      wsReady = true;
      stats.lastMarkConnectedAt = Date.now();
      markSubscriptionStartedAt = Date.now();
      armMarkStreamWatchdog();
      console.log(`[PosMonitor] Mark price combined stream connected. Tracking ${subscribedSymbols.size} symbol(s).`);
    });

    markWs.addEventListener('message', ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      const update = parsePositionMarkPriceMessage(msg);
      if (!update) return;

      const { symbol, markPrice } = update;
      connectionLastMarkTickAt = Date.now();
      const isFirstMarkTick = stats.lastMarkTickAt == null;
      stats.lastMarkTickAt = Date.now();
      if (isFirstMarkTick) {
        console.log(`[PosMonitor] First mark-price tick ${symbol}=${markPrice} version=${POSITION_MONITOR_MARK_STREAM_VERSION}`);
      }
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
      if (generation !== markGeneration) return;
      wsReady = false;
      clearMarkStreamWatchdog();
      connectionLastMarkTickAt = null;
      markSubscriptionStartedAt = null;
      const delay = _markStreamBackoffMs;
      _markStreamBackoffMs = Math.min(_markStreamBackoffMs * 2, _markStreamBackoffMax);
      const delaySec = Math.round(delay / 1000);
      console.warn(`[PosMonitor] Mark price stream closed — reconnecting in ${delaySec}s`);
      markWs = null;
      scheduleMarkPriceReconnect(delay, 'socket-closed');
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
    startUserDataStream('startup').catch((error) => {
      console.error(`[PosMonitor] initial user-data stream failed: ${error.message}`);
      scheduleUserDataReconnect(5_000, 'startup-failed');
    });
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
    recoverMissedFullFills,
    getStatus() {
      return {
        ...stats,
        userDataStreamVersion: POSITION_USER_DATA_STREAM_VERSION,
        markStreamUrl: MARKET_WS_BASE,
        wsReady,
        cachedSymbols: [...posCache.keys()].sort(),
        subscribedSymbols: [...subscribedSymbols].map((s) => s.toUpperCase()).sort(),
        pendingSymbols: [],
      };
    },
  };
}
