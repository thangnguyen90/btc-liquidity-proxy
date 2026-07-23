import { readFile } from 'node:fs/promises';

const trades = JSON.parse(await readFile(new URL('../data/intraday-decision-paper-trades.json', import.meta.url), 'utf8'));
const now = Date.now();
const stopLossRoe = 15;
const trailStartRoe = 15;
const trailStartLockRoe = 5;
const trailStepRoe = 5;

function roeAt(trade, price) {
  const entry = Number(trade.entryPrice);
  const leverage = Math.max(1, Number(trade.leverage) || 10);
  const move = trade.side === 'SHORT' ? (entry - price) / entry : (price - entry) / entry;
  return move * leverage * 100;
}

function lockForPeak(peak) {
  if (peak < trailStartRoe) return null;
  return trailStartLockRoe + Math.floor((peak - trailStartRoe) / trailStepRoe) * trailStepRoe;
}

async function fetchKlines(symbol, startTime, endTime) {
  const url = new URL('https://fapi.binance.com/fapi/v1/klines');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', '1m');
  url.searchParams.set('startTime', String(startTime));
  url.searchParams.set('endTime', String(endTime));
  url.searchParams.set('limit', '1000');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (response.ok) return response.json();
    if (attempt === 2) throw new Error(`${symbol}: HTTP ${response.status} ${await response.text()}`);
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return [];
}

function simulate(trade, klines, favorableFirst) {
  let peak = Number(trade.peakRoe) || 0;
  let lock = null;
  let lastRoe = 0;
  for (const candle of klines) {
    const high = Number(candle[2]);
    const low = Number(candle[3]);
    const close = Number(candle[4]);
    const favorableRoe = trade.side === 'SHORT' ? roeAt(trade, low) : roeAt(trade, high);
    const adverseRoe = trade.side === 'SHORT' ? roeAt(trade, high) : roeAt(trade, low);
    const checkStop = () => {
      const activeStop = lock == null ? -stopLossRoe : lock;
      return adverseRoe <= activeStop ? activeStop : null;
    };
    let hit;
    if (favorableFirst) {
      peak = Math.max(peak, favorableRoe);
      lock = lockForPeak(peak);
      hit = checkStop();
    } else {
      hit = checkStop();
      if (hit == null) {
        peak = Math.max(peak, favorableRoe);
        lock = lockForPeak(peak);
      }
    }
    if (hit != null) return { status: 'CLOSED', outcome: lock == null ? 'SL' : 'TRAILING_SL', roe: hit, peak, lock };
    lastRoe = roeAt(trade, close);
  }
  const holdEnd = Date.parse(trade.openedAt) + 8 * 60 * 60_000;
  if (now >= holdEnd && klines.length) return { status: 'CLOSED', outcome: 'TIMEOUT', roe: lastRoe, peak, lock };
  return { status: 'OPEN', outcome: 'OPEN', roe: lastRoe, peak, lock };
}

const affected = trades.filter((trade) => trade.status === 'CLOSED'
  && trade.outcome === 'TRAILING_SL'
  && Number(trade.lockedStopRoe) === 0
  && Number(trade.peakRoe) >= 7
  && Number(trade.peakRoe) < 15);

const results = [];
for (const [index, trade] of affected.entries()) {
  const start = Date.parse(trade.closedAt) + 1;
  const holdEnd = Date.parse(trade.openedAt) + 8 * 60 * 60_000;
  const end = Math.min(now, holdEnd);
  const klines = end > start ? await fetchKlines(trade.symbol, start, end) : [];
  results.push({
    symbol: trade.symbol,
    side: trade.side,
    signalType: trade.signalType,
    marginUsdt: Number(trade.marginUsdt) || 10,
    peakAtBreakEven: Number(trade.peakRoe) || 0,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    conservative: simulate(trade, klines, false),
    favorableFirst: simulate(trade, klines, true),
    candles: klines.length,
  });
  if ((index + 1) % 10 === 0) process.stderr.write(`Fetched ${index + 1}/${affected.length}\n`);
}

function summarize(mode) {
  const rows = results.map((row) => ({ ...row, result: row[mode] }));
  const closed = rows.filter((row) => row.result.status === 'CLOSED');
  const open = rows.filter((row) => row.result.status === 'OPEN');
  const totalRoe = rows.reduce((sum, row) => sum + row.result.roe, 0);
  const totalPnl = rows.reduce((sum, row) => sum + row.marginUsdt * row.result.roe / 100, 0);
  return {
    mode,
    n: rows.length,
    closed: closed.length,
    open: open.length,
    wins: rows.filter((row) => row.result.roe > 0).length,
    losses: rows.filter((row) => row.result.roe < 0).length,
    avgRoe: rows.length ? totalRoe / rows.length : 0,
    pnl: totalPnl,
    outcomes: Object.fromEntries([...new Set(rows.map((row) => row.result.outcome))]
      .map((outcome) => [outcome, rows.filter((row) => row.result.outcome === outcome).length])),
  };
}

function breakdown(mode, keyFn) {
  const groups = new Map();
  for (const row of results) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([group, rows]) => {
    const pnl = rows.reduce((sum, row) => sum + row.marginUsdt * row[mode].roe / 100, 0);
    const avgRoe = rows.reduce((sum, row) => sum + row[mode].roe, 0) / rows.length;
    return {
      group,
      n: rows.length,
      wins: rows.filter((row) => row[mode].roe > 0).length,
      losses: rows.filter((row) => row[mode].roe < 0).length,
      avgRoe,
      pnl,
    };
  }).sort((a, b) => b.pnl - a.pnl);
}

const output = {
  generatedAt: new Date().toISOString(),
  assumptions: {
    source: 'Binance USD-M Futures 1m klines after the actual break-even close',
    currentBreakEvenResult: { n: affected.length, roe: 0, pnl: 0 },
    removedRule: '+7% ROE -> lock 0%',
    retainedRules: ['hard SL -15% ROE', '+15% -> lock +5%', '+20% -> lock +10%', '8h max hold'],
    omitted: ['future BTC trend-reversal exits after the actual close', 'fees and funding'],
    candleOrdering: {
      conservative: 'test the existing stop before raising the trail inside each 1m candle',
      favorableFirst: 'raise the trail from the favorable extreme before testing the adverse extreme',
    },
  },
  summaries: [summarize('conservative'), summarize('favorableFirst')],
  conservativeBreakdown: {
    bySignalType: breakdown('conservative', (row) => row.signalType),
    byPeakBand: breakdown('conservative', (row) => row.peakAtBreakEven < 10 ? '7-<10' : '10-<15'),
  },
  rows: results,
};

if (process.argv.includes('--compact')) {
  console.log(JSON.stringify({
    generatedAt: output.generatedAt,
    assumptions: output.assumptions,
    summaries: output.summaries,
    conservativeBreakdown: output.conservativeBreakdown,
  }, null, 2));
} else if (process.argv.includes('--summary')) {
  const sorted = [...results].sort((a, b) => b.conservative.roe - a.conservative.roe);
  console.log(JSON.stringify({
    generatedAt: output.generatedAt,
    assumptions: output.assumptions,
    summaries: output.summaries,
    conservativeBreakdown: output.conservativeBreakdown,
    top: sorted.slice(0, 10),
    bottom: sorted.slice(-10).reverse(),
  }, null, 2));
} else {
  console.log(JSON.stringify(output, null, 2));
}
