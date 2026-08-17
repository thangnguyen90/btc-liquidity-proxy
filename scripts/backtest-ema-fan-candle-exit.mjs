import {
  buildEmaFanLongSnapshot,
  buildEmaFanShortSnapshot,
} from '../src/liquidHeatmapFlowV2.js';

const BASE = process.env.BINANCE_FUTURES_BASE_URL ?? 'https://fapi.binance.com';
const leverage = 5;
const feeRoe = 0.4;
const maxHoldBars = 144;
const requestDelayMs = Math.max(300, Number(process.env.EMA_FAN_BACKTEST_REQUEST_DELAY_MS ?? 350));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(path, attempt = 0) {
  const response = await fetch(`${BASE}${path}`);
  if (response.status === 429 && attempt < 5) {
    await sleep(1_000 * (attempt + 1));
    return getJson(path, attempt + 1);
  }
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

async function getKlinesRange(symbol, startTime, endTime = Date.now()) {
  const rows = [];
  let cursor = startTime;
  while (cursor <= endTime) {
    const page = await getJson(
      `/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}`
      + `&interval=5m&startTime=${Math.trunc(cursor)}&endTime=${Math.trunc(endTime)}&limit=1500`,
    );
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    const lastOpenTime = Number(page.at(-1)?.[0]);
    if (!Number.isFinite(lastOpenTime) || page.length < 1500) break;
    cursor = lastOpenTime + 5 * 60_000;
    await sleep(requestDelayMs);
  }
  return rows;
}

function emaSeries(values, period) {
  const out = Array(values.length).fill(null);
  if (values.length < period) return out;
  let value = values.slice(0, period).reduce((sum, row) => sum + row, 0) / period;
  out[period - 1] = value;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    value = (values[index] - value) * multiplier + value;
    out[index] = value;
  }
  return out;
}

function roe(side, entry, exit) {
  return ((side === 'LONG' ? exit - entry : entry - exit) / entry * 100) * leverage - feeRoe;
}

function summarize(trades) {
  const settled = trades.filter((row) => row.outcome !== 'OPEN');
  const wins = settled.filter((row) => row.netRoe > 0).length;
  const grossProfit = settled.filter((row) => row.netRoe > 0).reduce((sum, row) => sum + row.netRoe, 0);
  const grossLoss = Math.abs(settled.filter((row) => row.netRoe < 0).reduce((sum, row) => sum + row.netRoe, 0));
  return {
    total: trades.length,
    settled: settled.length,
    wins,
    losses: settled.length - wins,
    winRate: settled.length ? wins / settled.length * 100 : 0,
    avgRoe: settled.length ? settled.reduce((sum, row) => sum + row.netRoe, 0) / settled.length : 0,
    medianRoe: settled.length ? [...settled].sort((a, b) => a.netRoe - b.netRoe)[Math.floor(settled.length / 2)].netRoe : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? null : 0,
    avgMfeRoe: settled.length ? settled.reduce((sum, row) => sum + row.mfeRoe, 0) / settled.length : 0,
    avgGivebackRoe: settled.length ? settled.reduce((sum, row) => sum + Math.max(0, row.mfeRoe - row.netRoe), 0) / settled.length : 0,
    outcomes: Object.fromEntries([...new Set(trades.map((row) => row.outcome))].map((key) => [key, trades.filter((row) => row.outcome === key).length])),
  };
}

function summarizeEntries(trades) {
  const filled = trades.filter((row) => row.entry != null);
  const settled = filled.filter((row) => row.outcome !== 'OPEN');
  const base = summarize(filled);
  const thresholdCount = (threshold) => settled.filter((row) => row.maeRoe <= threshold).length;
  return {
    signals: trades.length,
    filled: filled.length,
    fillRate: trades.length ? filled.length / trades.length * 100 : 0,
    ...base,
    avgMaeRoe: settled.length
      ? settled.reduce((sum, row) => sum + row.maeRoe, 0) / settled.length
      : 0,
    avgFirst15mMaeRoe: settled.length
      ? settled.reduce((sum, row) => sum + row.first15mMaeRoe, 0) / settled.length
      : 0,
    hitMinus5Pct: settled.length ? thresholdCount(-5) / settled.length * 100 : 0,
    hitMinus10Pct: settled.length ? thresholdCount(-10) / settled.length * 100 : 0,
    hitMinus15Pct: settled.length ? thresholdCount(-15) / settled.length * 100 : 0,
  };
}

function resolveEntry(signal, bars, mode, ema13) {
  const { side, signalIndex } = signal;
  const firstIndex = signalIndex + 1;
  if (!bars[firstIndex]) return null;
  if (mode === 'MARKET_NEXT_OPEN') {
    return { entryIndex: firstIndex, entry: bars[firstIndex].open };
  }
  const signalClose = bars[signalIndex].close;
  const signalEma13 = ema13[signalIndex];
  if (!(signalClose > 0) || !(signalEma13 > 0)) return null;
  if (mode === 'LIMIT_HALF_EMA13_15M' || mode === 'LIMIT_EMA13_15M' || mode === 'LIMIT_EMA13_CAP1_15M') {
    const limit = mode === 'LIMIT_EMA13_15M'
      ? signalEma13
      : mode === 'LIMIT_EMA13_CAP1_15M'
        ? signalEma13 * (side === 'LONG' ? 1.01 : 0.99)
        : (signalClose + signalEma13) / 2;
    for (let index = firstIndex; index <= Math.min(firstIndex + 2, bars.length - 1); index += 1) {
      const bar = bars[index];
      const touched = side === 'LONG' ? bar.low <= limit : bar.high >= limit;
      if (!touched) continue;
      const entry = side === 'LONG' ? Math.min(bar.open, limit) : Math.max(bar.open, limit);
      return { entryIndex: index, entry };
    }
    return null;
  }
  if (mode === 'EMA13_RECLAIM_15M') {
    for (let index = firstIndex; index <= Math.min(firstIndex + 2, bars.length - 2); index += 1) {
      const bar = bars[index];
      const line = ema13[index];
      const confirmed = side === 'LONG'
        ? bar.low <= line && bar.close > line && bar.close > bar.open
        : bar.high >= line && bar.close < line && bar.close < bar.open;
      if (!confirmed) continue;
      return { entryIndex: index + 1, entry: bars[index + 1].open };
    }
    return null;
  }
  if (mode === 'MARKET_EMA13_CAP1_15M') {
    for (let index = firstIndex; index <= Math.min(firstIndex + 2, bars.length - 1); index += 1) {
      const reference = ema13[index - 1];
      const entry = bars[index].open;
      const distance = side === 'LONG'
        ? (entry / reference - 1) * 100
        : (reference / entry - 1) * 100;
      const stackHeld = side === 'LONG' ? entry > reference : entry < reference;
      if (stackHeld && distance <= 1) return { entryIndex: index, entry };
    }
    return null;
  }
  throw new Error(`Unknown entry mode ${mode}`);
}

function evaluateFixedEntry(signal, bars, mode) {
  const closes = bars.map((bar) => bar.close);
  const ema13 = emaSeries(closes, 13);
  const resolved = resolveEntry(signal, bars, mode, ema13);
  if (!resolved) return {
    ...signal,
    mode,
    outcome: 'NO_FILL',
    netRoe: 0,
    mfeRoe: 0,
    maeRoe: 0,
    first15mMaeRoe: 0,
  };
  const { side } = signal;
  const { entryIndex, entry } = resolved;
  const stop = side === 'LONG' ? entry * 0.95 : entry * 1.05;
  const target = side === 'LONG' ? entry * 1.02 : entry * 0.98;
  const lastIndex = Math.min(bars.length - 1, entryIndex + maxHoldBars - 1);
  let mfeRoe = -Infinity;
  let maeRoe = Infinity;
  let first15mMaeRoe = Infinity;
  for (let index = entryIndex; index <= lastIndex; index += 1) {
    const bar = bars[index];
    const favorable = side === 'LONG' ? bar.high : bar.low;
    const adverse = side === 'LONG' ? bar.low : bar.high;
    mfeRoe = Math.max(mfeRoe, roe(side, entry, favorable));
    maeRoe = Math.min(maeRoe, roe(side, entry, adverse));
    if (index < entryIndex + 3) first15mMaeRoe = Math.min(first15mMaeRoe, roe(side, entry, adverse));
    const stopHit = side === 'LONG' ? bar.low <= stop : bar.high >= stop;
    const targetHit = side === 'LONG' ? bar.high >= target : bar.low <= target;
    if (stopHit) return {
      ...signal, mode, entryIndex, entry, exit: stop, outcome: 'SL',
      netRoe: roe(side, entry, stop), mfeRoe, maeRoe, first15mMaeRoe,
    };
    if (targetHit) return {
      ...signal, mode, entryIndex, entry, exit: target, outcome: 'TP',
      netRoe: roe(side, entry, target), mfeRoe, maeRoe, first15mMaeRoe,
    };
  }
  if (entryIndex + maxHoldBars - 1 <= bars.length - 1) {
    const exit = bars[lastIndex].close;
    return {
      ...signal, mode, entryIndex, entry, exit, outcome: 'TIMEOUT',
      netRoe: roe(side, entry, exit), mfeRoe, maeRoe, first15mMaeRoe,
    };
  }
  return {
    ...signal, mode, entryIndex, entry, outcome: 'OPEN', netRoe: 0,
    mfeRoe: Math.max(0, mfeRoe), maeRoe: Math.min(0, maeRoe),
    first15mMaeRoe: Math.min(0, first15mMaeRoe),
  };
}

function evaluate(signal, bars, mode) {
  const { side, signalIndex } = signal;
  const entryIndex = signalIndex + 1;
  if (!bars[entryIndex]) return { ...signal, mode, outcome: 'OPEN', netRoe: 0, mfeRoe: 0 };
  const entry = bars[entryIndex].open;
  const closes = bars.map((bar) => bar.close);
  const ema13 = emaSeries(closes, 13);
  const ema25 = emaSeries(closes, 25);
  const stop = side === 'LONG' ? entry * 0.95 : entry * 1.05;
  const target = side === 'LONG' ? entry * 1.02 : entry * 0.98;
  let mfeRoe = -Infinity;
  let wrong13Count = 0;
  let profitLockArmed = false;
  const lastIndex = Math.min(bars.length - 1, entryIndex + maxHoldBars - 1);
  for (let index = entryIndex; index <= lastIndex; index += 1) {
    const bar = bars[index];
    const favorable = side === 'LONG' ? bar.high : bar.low;
    mfeRoe = Math.max(mfeRoe, roe(side, entry, favorable));
    const profitLockMode = mode.endsWith('_ARM10');
    const activeStop = profitLockArmed
      ? (side === 'LONG' ? entry * (1 + 0.01 / leverage) : entry * (1 - 0.01 / leverage))
      : stop;
    const stopHit = side === 'LONG' ? bar.low <= activeStop : bar.high >= activeStop;
    const targetHit = side === 'LONG' ? bar.high >= target : bar.low <= target;
    if (stopHit) return {
      ...signal,
      mode,
      entry,
      exit: activeStop,
      outcome: profitLockArmed ? 'LOCK_1' : 'SL',
      netRoe: roe(side, entry, activeStop),
      mfeRoe,
    };
    if (mode === 'FIXED_TP10' && targetHit) {
      return { ...signal, mode, entry, exit: target, outcome: 'TP', netRoe: roe(side, entry, target), mfeRoe };
    }
    const wrong13 = side === 'LONG' ? bar.close <= ema13[index] : bar.close >= ema13[index];
    const wrong25 = side === 'LONG' ? bar.close <= ema25[index] : bar.close >= ema25[index];
    const fanCross = side === 'LONG' ? ema13[index] <= ema25[index] : ema13[index] >= ema25[index];
    wrong13Count = wrong13 ? wrong13Count + 1 : 0;
    const exitSignal = ((mode === 'EMA13_CLOSE' || mode === 'EMA13_ARM10') && wrong13)
      || ((mode === 'EMA13_2_CLOSE' || mode === 'EMA13_2_ARM10') && wrong13Count >= 2)
      || ((mode === 'EMA25_CLOSE' || mode === 'EMA25_ARM10') && wrong25)
      || (mode === 'FAN_CROSS' && fanCross);
    if (exitSignal && (!profitLockMode || profitLockArmed)) {
      const exit = bars[index + 1]?.open ?? bar.close;
      return { ...signal, mode, entry, exit, outcome: mode, netRoe: roe(side, entry, exit), mfeRoe };
    }
    if (profitLockMode && !profitLockArmed && mfeRoe + feeRoe >= 10) profitLockArmed = true;
  }
  if (entryIndex + maxHoldBars - 1 <= bars.length - 1) {
    const exit = bars[lastIndex].close;
    return { ...signal, mode, entry, exit, outcome: 'TIMEOUT', netRoe: roe(side, entry, exit), mfeRoe };
  }
  return { ...signal, mode, entry, outcome: 'OPEN', netRoe: 0, mfeRoe: Math.max(0, mfeRoe) };
}

function detectSignals(symbol, side, bars, sessionStart) {
  const detector = side === 'LONG' ? buildEmaFanLongSnapshot : buildEmaFanShortSnapshot;
  const signals = [];
  let lastReadyAt = null;
  for (let index = 119; index < bars.length - 1; index += 1) {
    const now = bars[index].closeTime + 1;
    if (now < sessionStart) continue;
    const snapshot = detector(bars.slice(0, index + 1), now);
    if (!snapshot.ready || snapshot.readyAt == null || snapshot.readyAt === lastReadyAt) continue;
    lastReadyAt = snapshot.readyAt;
    signals.push({
      symbol,
      side,
      signalIndex: index,
      signalAt: snapshot.readyAt,
      volumeX: snapshot.volumeX ?? null,
      bodyPct: snapshot.bodyPct ?? null,
      compressedBars: snapshot.compressedBars ?? null,
      priorMedianSpreadPct: snapshot.priorMedianSpreadPct ?? null,
      watchRsi14: snapshot.watchRsi14 ?? null,
      watchDistanceFromEma13Pct: snapshot.watchDistanceFromEma13Pct ?? null,
      readyRsi14: snapshot.rsi14 ?? null,
      readyDistanceFromEma13Pct: snapshot.distanceFromEma13Pct ?? null,
    });
  }
  return signals;
}

async function main() {
  const now = Date.now();
  const bangkok = new Date(now + 7 * 60 * 60_000);
  const days = Math.max(1, Math.min(7, Number(process.env.EMA_FAN_BACKTEST_DAYS ?? 3)));
  const todayStart = Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate()) - 7 * 60 * 60_000;
  const sessionStart = todayStart - (days - 1) * 24 * 60 * 60_000;
  const fetchStart = sessionStart - 14 * 60 * 60_000;
  const tickers = await getJson('/fapi/v1/ticker/24hr');
  const universe = tickers
    .filter((row) => String(row.symbol).endsWith('USDT') && row.symbol !== 'BTCUSDT')
    .map((row) => ({ symbol: row.symbol, change: Number(row.priceChangePercent), volume: Number(row.quoteVolume) }))
    .filter((row) => row.volume >= 2_000_000);
  const universeLimit = Math.max(150, Math.min(300, Number(process.env.EMA_FAN_BACKTEST_UNIVERSE ?? 200)));
  const targets = [...universe].sort((a, b) => b.volume - a.volume).slice(0, universeLimit);
  const histories = new Map();
  const entries = targets.map((row) => row.symbol);
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const symbol = entries[cursor++];
      try {
        const raw = await getKlinesRange(symbol, fetchStart, now);
        histories.set(symbol, {
          bars: raw.map((row) => ({
            openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]),
            volume: Number(row[5]), closeTime: Number(row[6]), quoteVolume: Number(row[7]),
          })),
        });
      } catch (error) {
        console.warn(`${symbol}: ${error.message}`);
      }
      await sleep(requestDelayMs);
    }
  }
  const workerCount = Math.max(1, Math.min(2, Number(process.env.EMA_FAN_BACKTEST_WORKERS ?? 1)));
  await Promise.all(Array.from({ length: workerCount }, worker));
  const metricsByTime = new Map();
  for (const [symbol, history] of histories) {
    for (let index = 288; index < history.bars.length; index += 1) {
      const bars24h = history.bars.slice(index - 287, index + 1);
      const start = history.bars[index - 288]?.close;
      const close = history.bars[index]?.close;
      if (!(start > 0) || !(close > 0)) continue;
      const row = {
        symbol,
        change: (close / start - 1) * 100,
        volume: bars24h.reduce((sum, bar) => sum + bar.quoteVolume, 0),
      };
      const bucket = metricsByTime.get(history.bars[index].closeTime) ?? [];
      bucket.push(row);
      metricsByTime.set(history.bars[index].closeTime, bucket);
    }
  }
  const rawSignals = [];
  for (const [symbol, history] of histories) {
    rawSignals.push(...detectSignals(symbol, 'LONG', history.bars, sessionStart));
    rawSignals.push(...detectSignals(symbol, 'SHORT', history.bars, sessionStart));
  }
  const signalAudit = rawSignals.map((signal) => {
    const bars = histories.get(signal.symbol)?.bars ?? [];
    const closedAt = bars[signal.signalIndex]?.closeTime;
    const universeAtSignal = metricsByTime.get(closedAt) ?? [];
    const own = universeAtSignal.find((row) => row.symbol === signal.symbol) ?? null;
    const gainers = universeAtSignal.filter((row) => row.change > 0)
      .sort((a, b) => b.change - a.change || b.volume - a.volume);
    const liquid = universeAtSignal.filter((row) => row.volume >= 2_000_000)
      .sort((a, b) => b.volume - a.volume);
    return {
      ...signal,
      closedAt,
      change24hPct: own?.change ?? null,
      quoteVolume24h: own?.volume ?? null,
      gainerRank: own?.change > 0 ? gainers.findIndex((row) => row.symbol === signal.symbol) + 1 : null,
      liquidityRank: own ? liquid.findIndex((row) => row.symbol === signal.symbol) + 1 : null,
    };
  });
  const eligibleSignals = rawSignals.filter((signal) => {
    const bars = histories.get(signal.symbol)?.bars ?? [];
    const closedAt = bars[signal.signalIndex]?.closeTime;
    const universeAtSignal = metricsByTime.get(closedAt) ?? [];
    const own = universeAtSignal.find((row) => row.symbol === signal.symbol);
    if (!own || own.volume < 2_000_000) return false;
    if (signal.side === 'LONG') {
      const gainers = universeAtSignal.filter((row) => row.change > 0)
        .sort((a, b) => b.change - a.change || b.volume - a.volume);
      return own.change > 0 && gainers.findIndex((row) => row.symbol === signal.symbol) < 50;
    }
    const liquid = universeAtSignal.filter((row) => row.volume >= 2_000_000)
      .sort((a, b) => b.volume - a.volume);
    return own.change <= -5 && liquid.findIndex((row) => row.symbol === signal.symbol) < 150;
  }).sort((a, b) => a.signalAt - b.signalAt);
  const lastAccepted = new Map();
  const signals = eligibleSignals.filter((signal) => {
    const key = `${signal.symbol}|${signal.side}`;
    const previous = lastAccepted.get(key) ?? -Infinity;
    if (signal.signalAt - previous < 12 * 60 * 60_000) return false;
    lastAccepted.set(key, signal.signalAt);
    return true;
  });
  const modes = [
    'FIXED_TP10',
    'EMA13_CLOSE',
    'EMA13_2_CLOSE',
    'EMA25_CLOSE',
    'FAN_CROSS',
    'EMA13_ARM10',
    'EMA13_2_ARM10',
    'EMA25_ARM10',
  ];
  const entryModes = [
    'MARKET_NEXT_OPEN',
    'LIMIT_EMA13_CAP1_15M',
    'LIMIT_HALF_EMA13_15M',
    'LIMIT_EMA13_15M',
    'EMA13_RECLAIM_15M',
    'MARKET_EMA13_CAP1_15M',
  ];
  const rows = [];
  const entryRows = [];
  for (const signal of signals) {
    const bars = histories.get(signal.symbol).bars;
    for (const mode of modes) rows.push(evaluate(signal, bars, mode));
    for (const mode of entryModes) entryRows.push(evaluateFixedEntry(signal, bars, mode));
  }
  const result = {
    generatedAt: new Date().toISOString(),
    sessionStart: new Date(sessionStart).toISOString(),
    universe: { currentTopLiquidityRequested: targets.length, fetched: histories.size, days },
    rawSignals: rawSignals.length,
    signalAudit,
    signals: { total: signals.length, long: signals.filter((row) => row.side === 'LONG').length, short: signals.filter((row) => row.side === 'SHORT').length },
    summary: Object.fromEntries(modes.map((mode) => [mode, {
      ALL: summarize(rows.filter((row) => row.mode === mode)),
      LONG: summarize(rows.filter((row) => row.mode === mode && row.side === 'LONG')),
      SHORT: summarize(rows.filter((row) => row.mode === mode && row.side === 'SHORT')),
    }])),
    entrySummary: Object.fromEntries(entryModes.map((mode) => [mode, {
      ALL: summarizeEntries(entryRows.filter((row) => row.mode === mode)),
      LONG: summarizeEntries(entryRows.filter((row) => row.mode === mode && row.side === 'LONG')),
      SHORT: summarizeEntries(entryRows.filter((row) => row.mode === mode && row.side === 'SHORT')),
    }])),
    trades: rows,
    entryTrades: entryRows,
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
