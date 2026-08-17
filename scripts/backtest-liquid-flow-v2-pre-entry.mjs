import { readFile } from 'node:fs/promises';

const STORE_PATH = new URL('../data/liquid-flow-v2-paper.json', import.meta.url);
const LABELS = ['PRE_UP_BASE_LONG', 'PRE_DOWN_BASE_SHORT'];
const WAIT_MS = 30 * 60_000;
const HOLD_MS = 4 * 60 * 60_000;
const LEVERAGE = 5;
const FEE_ROE = 0.4;
const TP_PRICE_PCT = 2;
const SL_PRICE_PCT = 4;

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function localTime(timestamp) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function ema99FromTrade(trade) {
  const stack = trade?.snapshot?.evidence?.find((row) => row?.name === 'ema-stack')?.value;
  if (typeof stack !== 'string') return null;
  const values = stack.split('/').map(Number);
  return finite(values[2], null);
}

function directionalRoe(side, entry, exit) {
  const rawPct = side === 'SHORT'
    ? ((entry - exit) / entry) * 100
    : ((exit - entry) / entry) * 100;
  return rawPct * LEVERAGE - FEE_ROE;
}

async function fetchKlines(trade) {
  const startTime = Math.ceil(trade.entryAt / 60_000) * 60_000;
  const endTime = trade.entryAt + WAIT_MS + HOLD_MS + 2 * 60_000;
  const query = new URLSearchParams({
    symbol: trade.symbol,
    interval: '1m',
    startTime: String(startTime),
    endTime: String(endTime),
    limit: '1000',
  });
  const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?${query}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(`${trade.symbol}: ${response.status} ${JSON.stringify(payload).slice(0, 180)}`);
  }
  return payload.map((row) => ({
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    closeTime: Number(row[6]),
  }));
}

async function mapConcurrent(values, concurrency, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      try {
        output[index] = await worker(values[index], index);
      } catch (error) {
        output[index] = { error: error?.message ?? String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return output;
}

function targetForStrategy(trade, strategy) {
  const entry = finite(trade.entryPrice, 0);
  const ema99 = ema99FromTrade(trade);
  if (entry <= 0) return null;
  if (strategy.kind === 'offset') {
    return trade.side === 'LONG'
      ? entry * (1 - strategy.value / 100)
      : entry * (1 + strategy.value / 100);
  }
  if (strategy.kind === 'ema99') return ema99;
  if (strategy.kind === 'half-ema99' && ema99 > 0) return (entry + ema99) / 2;
  return null;
}

function simulatePosition(trade, candles, entry, fillCandle, metadata = {}) {
  const tp = trade.side === 'LONG'
    ? entry * (1 + TP_PRICE_PCT / 100)
    : entry * (1 - TP_PRICE_PCT / 100);
  const sl = trade.side === 'LONG'
    ? entry * (1 - SL_PRICE_PCT / 100)
    : entry * (1 + SL_PRICE_PCT / 100);
  const exitDeadline = fillCandle.openTime + HOLD_MS;
  const path = candles.filter((bar) => bar.openTime >= fillCandle.openTime && bar.openTime <= exitDeadline);
  let outcome = 'TIMEOUT';
  let exit = path.at(-1)?.close ?? entry;
  let exitAt = path.at(-1)?.closeTime ?? fillCandle.closeTime;
  let mfeRoe = -Infinity;
  let maeRoe = Infinity;

  for (const bar of path) {
    const favorablePrice = trade.side === 'LONG' ? bar.high : bar.low;
    const adversePrice = trade.side === 'LONG' ? bar.low : bar.high;
    mfeRoe = Math.max(mfeRoe, directionalRoe(trade.side, entry, favorablePrice));
    maeRoe = Math.min(maeRoe, directionalRoe(trade.side, entry, adversePrice));
    const hitTp = trade.side === 'LONG' ? bar.high >= tp : bar.low <= tp;
    const hitSl = trade.side === 'LONG' ? bar.low <= sl : bar.high >= sl;
    if (hitSl || hitTp) {
      outcome = hitSl ? 'SL' : 'TP';
      exit = hitSl ? sl : tp;
      exitAt = bar.closeTime;
      break;
    }
  }

  return {
    eligible: true,
    filled: true,
    entry,
    outcome,
    exit,
    exitAt,
    netRoe: directionalRoe(trade.side, entry, exit),
    mfeRoe: Number.isFinite(mfeRoe) ? mfeRoe : null,
    maeRoe: Number.isFinite(maeRoe) ? maeRoe : null,
    ...metadata,
  };
}

function simulateLimit(trade, candles, strategy) {
  const target = targetForStrategy(trade, strategy);
  if (!(target > 0)) return { eligible: false, filled: false };
  const favorable = trade.side === 'LONG' ? target < trade.entryPrice : target > trade.entryPrice;
  if (!favorable) return { eligible: false, filled: false };

  const fillDeadline = trade.entryAt + WAIT_MS;
  const fillCandle = candles.find((bar) => bar.openTime <= fillDeadline && (
    trade.side === 'LONG' ? bar.low <= target : bar.high >= target
  ));
  if (!fillCandle) return { eligible: true, filled: false };
  return simulatePosition(trade, candles, target, fillCandle, {
    improvementPct: Math.abs((target - trade.entryPrice) / trade.entryPrice * 100),
    fillDelayMin: (fillCandle.openTime - trade.entryAt) / 60_000,
  });
}

function simulateImmediate(trade, candles) {
  const first = candles[0];
  if (!first) return { eligible: false, filled: false };
  return simulatePosition(trade, candles, trade.entryPrice, first, {
    improvementPct: 0,
    fillDelayMin: 0,
  });
}

function summarizeDirectionPath(rows) {
  const horizons = [30, 60, 120, 240];
  const output = {};
  for (const minutes of horizons) {
    const values = rows.map(({ trade, candles }) => {
      const deadline = trade.entryAt + minutes * 60_000;
      const path = candles.filter((bar) => bar.openTime <= deadline);
      const last = path.at(-1);
      if (!last) return null;
      let mfe = -Infinity;
      let mae = Infinity;
      for (const bar of path) {
        const favorable = trade.side === 'LONG' ? bar.high : bar.low;
        const adverse = trade.side === 'LONG' ? bar.low : bar.high;
        mfe = Math.max(mfe, directionalRoe(trade.side, trade.entryPrice, favorable));
        mae = Math.min(mae, directionalRoe(trade.side, trade.entryPrice, adverse));
      }
      return {
        closeRoe: directionalRoe(trade.side, trade.entryPrice, last.close),
        mfe,
        mae,
      };
    }).filter(Boolean);
    output[`${minutes}m`] = {
      samples: values.length,
      directionPositivePct: values.length
        ? values.filter((row) => row.closeRoe > 0).length / values.length * 100
        : 0,
      avgCloseNetRoe: values.length
        ? values.reduce((sum, row) => sum + row.closeRoe, 0) / values.length
        : 0,
      avgMfeRoe: values.length ? values.reduce((sum, row) => sum + row.mfe, 0) / values.length : 0,
      avgMaeRoe: values.length ? values.reduce((sum, row) => sum + row.mae, 0) / values.length : 0,
      reachedGrossPlus10Pct: values.length
        ? values.filter((row) => row.mfe >= 9.6).length / values.length * 100
        : 0,
    };
  }
  return Object.fromEntries(Object.entries(output).map(([key, value]) => [key, compact(value)]));
}

function summarizeBaseline(trades) {
  const wins = trades.filter((trade) => finite(trade.netRoe, 0) > 0);
  const profits = trades.filter((trade) => finite(trade.netRoe, 0) > 0).reduce((sum, trade) => sum + trade.netRoe, 0);
  const losses = Math.abs(trades.filter((trade) => finite(trade.netRoe, 0) < 0).reduce((sum, trade) => sum + trade.netRoe, 0));
  return {
    signals: trades.length,
    filled: trades.length,
    fillRatePct: 100,
    wins: wins.length,
    wrPct: trades.length ? wins.length / trades.length * 100 : 0,
    avgNetRoe: trades.length ? trades.reduce((sum, trade) => sum + finite(trade.netRoe, 0), 0) / trades.length : 0,
    totalNetRoe: trades.reduce((sum, trade) => sum + finite(trade.netRoe, 0), 0),
    profitFactor: losses > 0 ? profits / losses : null,
    tp: trades.filter((trade) => trade.outcome === 'TP').length,
    sl: trades.filter((trade) => trade.outcome === 'SL').length,
    timeout: trades.filter((trade) => trade.outcome === 'TIMEOUT').length,
  };
}

function summarizeAlternative(rows) {
  const eligible = rows.filter((row) => row?.eligible);
  const filled = eligible.filter((row) => row.filled);
  const wins = filled.filter((row) => row.netRoe > 0);
  const profits = filled.filter((row) => row.netRoe > 0).reduce((sum, row) => sum + row.netRoe, 0);
  const losses = Math.abs(filled.filter((row) => row.netRoe < 0).reduce((sum, row) => sum + row.netRoe, 0));
  return {
    signals: eligible.length,
    filled: filled.length,
    fillRatePct: eligible.length ? filled.length / eligible.length * 100 : 0,
    wins: wins.length,
    wrPct: filled.length ? wins.length / filled.length * 100 : 0,
    avgNetRoe: filled.length ? filled.reduce((sum, row) => sum + row.netRoe, 0) / filled.length : 0,
    totalNetRoe: filled.reduce((sum, row) => sum + row.netRoe, 0),
    profitFactor: losses > 0 ? profits / losses : null,
    tp: filled.filter((row) => row.outcome === 'TP').length,
    sl: filled.filter((row) => row.outcome === 'SL').length,
    timeout: filled.filter((row) => row.outcome === 'TIMEOUT').length,
    avgDelayMin: filled.length ? filled.reduce((sum, row) => sum + row.fillDelayMin, 0) / filled.length : null,
    avgImprovementPct: filled.length ? filled.reduce((sum, row) => sum + row.improvementPct, 0) / filled.length : null,
    avgMfeRoe: filled.length ? filled.reduce((sum, row) => sum + finite(row.mfeRoe, 0), 0) / filled.length : null,
    avgMaeRoe: filled.length ? filled.reduce((sum, row) => sum + finite(row.maeRoe, 0), 0) / filled.length : null,
  };
}

function compact(summary) {
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => [
    key,
    typeof value === 'number' ? round(value) : value,
  ]));
}

const store = JSON.parse(await readFile(STORE_PATH, 'utf8'));
const trades = (store.trades ?? []).filter((trade) => (
  LABELS.includes(trade.labelKey)
  && trade.status === 'CLOSED'
  && finite(trade.entryPrice, 0) > 0
  && finite(trade.entryAt, 0) > 0
));

const candleResults = await mapConcurrent(trades, 6, fetchKlines);
const usable = trades.map((trade, index) => ({ trade, candles: candleResults[index] }))
  .filter((row) => Array.isArray(row.candles) && row.candles.length > 0);
const errors = trades.map((trade, index) => ({ trade, result: candleResults[index] }))
  .filter((row) => row.result?.error)
  .map((row) => `${row.trade.symbol}@${localTime(row.trade.entryAt)} ${row.result.error}`);

const strategies = [
  { name: 'LIMIT_BETTER_0.25_PCT', kind: 'offset', value: 0.25 },
  { name: 'LIMIT_BETTER_0.50_PCT', kind: 'offset', value: 0.5 },
  { name: 'LIMIT_BETTER_0.75_PCT', kind: 'offset', value: 0.75 },
  { name: 'LIMIT_BETTER_1.00_PCT', kind: 'offset', value: 1 },
  { name: 'LIMIT_HALF_TO_EMA99', kind: 'half-ema99' },
  { name: 'LIMIT_EMA99', kind: 'ema99' },
];

const report = {
  generatedAt: new Date().toISOString(),
  assumptions: {
    source: 'data/liquid-flow-v2-paper.json + Binance Futures 1m klines',
    limitWaitMinutes: WAIT_MS / 60_000,
    maxHoldHoursAfterFill: HOLD_MS / 3_600_000,
    leverage: LEVERAGE,
    takeProfitGrossRoePct: TP_PRICE_PCT * LEVERAGE,
    stopLossGrossRoePct: -SL_PRICE_PCT * LEVERAGE,
    estimatedRoundTripFeeRoePct: FEE_ROE,
    sameMinuteTpAndSl: 'SL_FIRST_CONSERVATIVE',
    firstUsableCandle: 'NEXT_FULL_1M_AFTER_SIGNAL',
  },
  dateRangeBangkok: trades.length ? [
    localTime(Math.min(...trades.map((trade) => trade.entryAt))),
    localTime(Math.max(...trades.map((trade) => trade.entryAt))),
  ] : [],
  totalClosedSignals: trades.length,
  candleBacktestSignals: usable.length,
  errors,
  labels: {},
};

for (const label of LABELS) {
  const cohort = trades.filter((trade) => trade.labelKey === label);
  const backtestCohort = usable.filter((row) => row.trade.labelKey === label);
  report.labels[label] = {
    baselinePaper: compact(summarizeBaseline(cohort)),
    immediateMark1m: compact(summarizeAlternative(backtestCohort.map(({ trade, candles }) => (
      simulateImmediate(trade, candles)
    )))),
    directionPath: summarizeDirectionPath(backtestCohort),
    alternatives: Object.fromEntries(strategies.map((strategy) => [
      strategy.name,
      compact(summarizeAlternative(backtestCohort.map(({ trade, candles }) => (
        simulateLimit(trade, candles, strategy)
      )))),
    ])),
  };
}

report.combined = {
  baselinePaper: compact(summarizeBaseline(trades)),
  immediateMark1m: compact(summarizeAlternative(usable.map(({ trade, candles }) => (
    simulateImmediate(trade, candles)
  )))),
  directionPath: summarizeDirectionPath(usable),
  alternatives: Object.fromEntries(strategies.map((strategy) => [
    strategy.name,
    compact(summarizeAlternative(usable.map(({ trade, candles }) => (
      simulateLimit(trade, candles, strategy)
    )))),
  ])),
};

console.log(JSON.stringify(report, null, 2));
