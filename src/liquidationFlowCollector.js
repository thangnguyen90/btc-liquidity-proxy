import WebSocket from 'ws';

const DEFAULT_URL = 'wss://fstream.binancefuture.com/ws/!forceOrder@arr';

function normalizeSymbol(value) {
  return String(value ?? '').trim().toUpperCase();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export class LiquidationFlowCollector {
  constructor({
    url = DEFAULT_URL,
    retentionMs = 30 * 60_000,
    reconnectMs = 5_000,
    now = () => Date.now(),
  } = {}) {
    this.url = url;
    this.retentionMs = retentionMs;
    this.reconnectMs = reconnectMs;
    this.now = now;
    this.events = new Map();
    this.oiHistory = new Map();
    this.socket = null;
    this.socketState = 'IDLE';
    this.connectedAt = null;
    this.lastEventAt = null;
    this.reconnectTimer = null;
    this.stopped = false;
  }

  start() {
    if (this.socket || this.stopped) return;
    this.socketState = 'CONNECTING';
    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.socketState = 'ERROR';
      this._scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.on('open', () => {
      this.socketState = 'OPEN';
      this.connectedAt = this.now();
    });
    socket.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        const payload = parsed?.data ?? parsed;
        const events = Array.isArray(payload) ? payload : [payload];
        for (const event of events) this.ingestForceOrder(event);
      } catch {}
    });
    socket.on('error', () => {
      this.socketState = 'ERROR';
    });
    socket.on('close', () => {
      this.socket = null;
      if (!this.stopped) {
        this.socketState = 'RECONNECTING';
        this._scheduleReconnect();
      }
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close?.();
    this.socket = null;
    this.socketState = 'STOPPED';
  }

  _scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start();
    }, this.reconnectMs);
    this.reconnectTimer.unref?.();
  }

  ingestForceOrder(event = {}) {
    const order = event.o ?? event.order ?? event;
    const symbol = normalizeSymbol(order.s ?? event.s);
    const side = String(order.S ?? order.side ?? '').toUpperCase();
    const price = finite(order.ap ?? order.p, 0);
    const quantity = finite(order.z ?? order.q, 0);
    const at = finite(order.T ?? event.E, this.now());
    if (!symbol || !['BUY', 'SELL'].includes(side) || price <= 0 || quantity <= 0) return false;
    const rows = this.events.get(symbol) ?? [];
    rows.push({ at, side, notionalUsd: price * quantity });
    this.events.set(symbol, rows);
    this.lastEventAt = Math.max(this.lastEventAt ?? 0, at);
    this._prune(symbol);
    return true;
  }

  recordOpenInterest(symbolValue, value, at = this.now()) {
    const symbol = normalizeSymbol(symbolValue);
    const normalizedValue = finite(value, 0);
    if (!symbol || normalizedValue <= 0) return null;
    const rows = this.oiHistory.get(symbol) ?? [];
    const last = rows.at(-1);
    if (!last || at - last.at >= 10_000) rows.push({ at, value: normalizedValue });
    else rows[rows.length - 1] = { at, value: normalizedValue };
    const cutoff = at - this.retentionMs;
    while (rows.length && rows[0].at < cutoff) rows.shift();
    this.oiHistory.set(symbol, rows);
    return this.openInterestSummary(symbol, at);
  }

  openInterestSummary(symbolValue, at = this.now()) {
    const symbol = normalizeSymbol(symbolValue);
    const rows = this.oiHistory.get(symbol) ?? [];
    const current = rows.at(-1) ?? null;
    const reversed = [...rows].reverse();
    const baseline = reversed.find((row) => row.at <= at - 55_000) ?? null;
    const priorBaseline = reversed.find((row) => row.at <= at - 115_000) ?? null;
    const fiveMinuteBaseline = reversed.find((row) => row.at <= at - 295_000) ?? null;
    const deltaPct = current && baseline && baseline.value > 0 && current !== baseline
      ? (current.value - baseline.value) / baseline.value * 100
      : null;
    const priorDeltaPct = baseline && priorBaseline && priorBaseline.value > 0 && baseline !== priorBaseline
      ? (baseline.value - priorBaseline.value) / priorBaseline.value * 100
      : null;
    const delta5mPct = current && fiveMinuteBaseline && fiveMinuteBaseline.value > 0 && current !== fiveMinuteBaseline
      ? (current.value - fiveMinuteBaseline.value) / fiveMinuteBaseline.value * 100
      : null;
    const stabilizing = deltaPct != null && (
      (priorDeltaPct != null && priorDeltaPct <= -0.15 && deltaPct >= priorDeltaPct + 0.1)
      || (delta5mPct != null && delta5mPct <= -0.5 && deltaPct >= -0.1)
    );
    return {
      value: current?.value ?? null,
      deltaPct,
      priorDeltaPct,
      delta5mPct,
      stabilizing,
      samples: rows.length,
      sampledAt: current?.at ?? null,
    };
  }

  summary(symbolValue, at = this.now()) {
    const symbol = normalizeSymbol(symbolValue);
    this._prune(symbol, at);
    const rows = this.events.get(symbol) ?? [];
    const recentCutoff = at - 5 * 60_000;
    const priorCutoff = at - 10 * 60_000;
    const olderCutoff = at - 15 * 60_000;
    let recentBuy = 0;
    let recentSell = 0;
    let priorBuy = 0;
    let priorSell = 0;
    let olderBuy = 0;
    let olderSell = 0;
    for (const row of rows) {
      if (row.at >= recentCutoff) {
        if (row.side === 'BUY') recentBuy += row.notionalUsd;
        else recentSell += row.notionalUsd;
      } else if (row.at >= priorCutoff) {
        if (row.side === 'BUY') priorBuy += row.notionalUsd;
        else priorSell += row.notionalUsd;
      } else if (row.at >= olderCutoff) {
        if (row.side === 'BUY') olderBuy += row.notionalUsd;
        else olderSell += row.notionalUsd;
      }
    }
    const priorBuyPer5m = (priorBuy + olderBuy) / 2;
    const priorSellPer5m = (priorSell + olderSell) / 2;
    return {
      // Binance force-order BUY closes a SHORT; SELL closes a LONG.
      shortLiquidationUsd: recentBuy,
      longLiquidationUsd: recentSell,
      shortBurstRatio: priorBuyPer5m > 0 ? recentBuy / priorBuyPer5m : (recentBuy > 0 ? 2 : null),
      longBurstRatio: priorSellPer5m > 0 ? recentSell / priorSellPer5m : (recentSell > 0 ? 2 : null),
      prior5mShortLiquidationUsd: priorBuy,
      prior5mLongLiquidationUsd: priorSell,
      older5mShortLiquidationUsd: olderBuy,
      older5mLongLiquidationUsd: olderSell,
      shortLiquidationDecayRatio: priorBuy > 0 ? recentBuy / priorBuy : null,
      longLiquidationDecayRatio: priorSell > 0 ? recentSell / priorSell : null,
      shortLiquidationDecaying: priorBuy > 0 && recentBuy <= priorBuy * 0.7,
      longLiquidationDecaying: priorSell > 0 && recentSell <= priorSell * 0.7,
      shortLiquidationPeakUsd: Math.max(recentBuy, priorBuy, olderBuy),
      longLiquidationPeakUsd: Math.max(recentSell, priorSell, olderSell),
      events: rows.filter((row) => row.at >= recentCutoff).length,
      socketState: this.socketState,
      connectedAt: this.connectedAt,
      lastEventAt: this.lastEventAt,
    };
  }

  health() {
    return {
      socketState: this.socketState,
      connectedAt: this.connectedAt,
      lastEventAt: this.lastEventAt,
      symbols: this.events.size,
    };
  }

  _prune(symbol, at = this.now()) {
    const rows = this.events.get(symbol);
    if (!rows?.length) return;
    const cutoff = at - this.retentionMs;
    while (rows.length && rows[0].at < cutoff) rows.shift();
    if (!rows.length) this.events.delete(symbol);
  }
}
