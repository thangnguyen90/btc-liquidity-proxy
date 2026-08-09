import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FROM_DAY = process.argv[2] ?? '2026-07-27';
const TO_DAY = process.argv[3] ?? '2026-08-02';
const DAYS = enumerateDays(FROM_DAY, TO_DAY);

function finite(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bangkokDay(value) {
  const at = Date.parse(value ?? '');
  if (!Number.isFinite(at)) return null;
  return new Date(at + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function enumerateDays(fromDay, toDay) {
  const days = [];
  let cursor = Date.parse(`${fromDay}T00:00:00.000Z`);
  const end = Date.parse(`${toDay}T00:00:00.000Z`);
  while (cursor <= end) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return days;
}

function sourceFamily(trade, fileFamily) {
  if (fileFamily === 'SHORT_EDGE') return fileFamily;
  return String(trade.source ?? '').startsWith('emasq-') ? 'EMA' : 'PUMP_NATIVE';
}

function snapshot(trade = {}) {
  const health = trade.btcHealth ?? {};
  return {
    corr: finite(trade.btcCorr),
    direction: String(health.btcTrendDir ?? trade.btcTrendDir ?? '').toUpperCase(),
    score: finite(health.btcTrendScore ?? trade.btcTrendScore),
    pct24h: finite(health.pct24h ?? trade.btcPct24h),
    rsi4h: finite(health.rsi4h ?? trade.btcRsi4h),
  };
}

function hasCompleteSnapshot(value) {
  return value.corr != null
    && ['UP', 'DOWN'].includes(value.direction)
    && value.score != null
    && value.pct24h != null
    && value.rsi4h != null;
}

function matchesLongCorrRebound(trade = {}) {
  if (String(trade.side ?? '').toUpperCase() !== 'LONG') return false;
  const value = snapshot(trade);
  return hasCompleteSnapshot(value)
    && value.corr >= 0.5
    && value.direction === 'DOWN'
    && value.score < 45
    && value.pct24h > -0.2
    && value.pct24h < 0.2
    && value.rsi4h < 50;
}

function estimatedFee(trade = {}) {
  const saved = finite(trade.estimatedFeeUsdt ?? trade.feeUsdt);
  if (saved != null && saved >= 0) return saved;
  const margin = finite(trade.marginUsdt ?? trade.marginUsd ?? trade.margin) ?? 0;
  const leverage = finite(trade.leverage) ?? 10;
  return margin > 0 && leverage > 0 ? margin * leverage * 2 * 0.0004 : 0;
}

function resultOf(trade = {}) {
  const savedNet = finite(trade.netPnl);
  const gross = finite(trade.grossPnl ?? trade.pnl) ?? 0;
  const netPnl = savedNet ?? (gross - estimatedFee(trade));
  const margin = finite(trade.marginUsdt ?? trade.marginUsd ?? trade.margin);
  const netRoe = margin != null && margin > 0
    ? netPnl / margin * 100
    : finite(trade.netRoe ?? trade.roe) ?? 0;
  return { netPnl, netRoe };
}

function setupOf(trade, family) {
  if (family === 'EMA') {
    const source = String(trade.source ?? '').toLowerCase();
    for (const name of [
      'pre_breakout', 'pre_breakdown', 'squeeze_short', 'squeeze',
      'breakdown', 'breakout', 'runner', 'br_like_short', 'br_like',
    ]) {
      if (source.includes(name)) return name.toUpperCase();
    }
    return source || 'EMA_OTHER';
  }
  return String(
    trade.pumpSignalType
      ?? trade.signalType
      ?? trade.type
      ?? trade.source
      ?? 'OTHER',
  ).toUpperCase();
}

function emptyMetrics() {
  return {
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    pnl: 0,
    roe: 0,
    grossWin: 0,
    grossLoss: 0,
    signalIds: new Set(),
  };
}

function addTrade(metrics, trade) {
  metrics.total += 1;
  metrics.signalIds.add(String(trade.signalId ?? trade.id ?? `${trade.symbol}|${trade.openedAt}`));
  const status = String(trade.status ?? '').toUpperCase();
  if (status === 'OPEN' || status === 'ACTIVE') metrics.open += 1;
  if (status === 'PENDING') metrics.pending += 1;
  if (status !== 'CLOSED') return;
  const { netPnl, netRoe } = resultOf(trade);
  metrics.closed += 1;
  metrics.pnl += netPnl;
  metrics.roe += netRoe;
  if (netPnl > 0) {
    metrics.wins += 1;
    metrics.grossWin += netPnl;
  } else if (netPnl < 0) {
    metrics.losses += 1;
    metrics.grossLoss += Math.abs(netPnl);
  } else {
    metrics.breakeven += 1;
  }
}

function compact(metrics) {
  const decisive = metrics.wins + metrics.losses;
  return {
    total: metrics.total,
    uniqueSignals: metrics.signalIds.size,
    open: metrics.open,
    pending: metrics.pending,
    closed: metrics.closed,
    wins: metrics.wins,
    losses: metrics.losses,
    breakeven: metrics.breakeven,
    wr: decisive ? +(metrics.wins / decisive * 100).toFixed(1) : null,
    pnl: +metrics.pnl.toFixed(4),
    avgRoe: metrics.closed ? +(metrics.roe / metrics.closed).toFixed(2) : null,
    profitFactor: metrics.grossLoss > 0
      ? +(metrics.grossWin / metrics.grossLoss).toFixed(2)
      : metrics.grossWin > 0 ? 9.99 : 0,
  };
}

function sourceAccumulator() {
  return {
    baseline: emptyMetrics(),
    complete: emptyMetrics(),
    matched: emptyMetrics(),
    days: new Map(DAYS.map((day) => [day, emptyMetrics()])),
    setup: new Map(),
    variants: new Map(),
    matches: [],
  };
}

const accumulators = new Map([
  ['PUMP_NATIVE', sourceAccumulator()],
  ['EMA', sourceAccumulator()],
  ['SHORT_EDGE', sourceAccumulator()],
]);

function processTrade(trade, fileFamily) {
  const family = sourceFamily(trade, fileFamily);
  const acc = accumulators.get(family);
  if (!acc) return;
  const day = bangkokDay(trade.openedAt ?? trade.createdAt);
  if (!day || day < FROM_DAY || day > TO_DAY) return;
  if (String(trade.side ?? '').toUpperCase() !== 'LONG') return;

  addTrade(acc.baseline, trade);
  if (hasCompleteSnapshot(snapshot(trade))) addTrade(acc.complete, trade);
  if (!matchesLongCorrRebound(trade)) return;

  addTrade(acc.matched, trade);
  const result = String(trade.status ?? '').toUpperCase() === 'CLOSED'
    ? resultOf(trade)
    : { netPnl: null, netRoe: null };
  const value = snapshot(trade);
  acc.matches.push({
    day,
    symbol: trade.symbol ?? null,
    setup: setupOf(trade, family),
    status: String(trade.status ?? '').toUpperCase(),
    netPnl: result.netPnl == null ? null : +result.netPnl.toFixed(4),
    netRoe: result.netRoe == null ? null : +result.netRoe.toFixed(2),
    corr: value.corr,
    btcTrendScore: value.score,
    btcPct24h: value.pct24h,
    btcRsi4h: value.rsi4h,
  });
  addTrade(acc.days.get(day), trade);
  const setup = setupOf(trade, family);
  if (!acc.setup.has(setup)) acc.setup.set(setup, emptyMetrics());
  addTrade(acc.setup.get(setup), trade);
  const variant = String(trade.variant ?? 'NO_VARIANT').toUpperCase();
  if (!acc.variants.has(variant)) acc.variants.set(variant, emptyMetrics());
  addTrade(acc.variants.get(variant), trade);
}

async function streamTrades(file, fileFamily) {
  const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: 1024 * 1024 });
  let found = false;
  let prefix = '';
  let inObject = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let parts = [];

  const scan = (text) => {
    let segmentStart = inObject ? 0 : -1;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (!inObject) {
        if (char === ']') return false;
        if (char !== '{') continue;
        inObject = true;
        depth = 1;
        inString = false;
        escaped = false;
        parts = [];
        segmentStart = index;
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          parts.push(text.slice(segmentStart, index + 1));
          processTrade(JSON.parse(parts.join('')), fileFamily);
          inObject = false;
          parts = [];
          segmentStart = -1;
        }
      }
    }
    if (inObject && segmentStart >= 0) parts.push(text.slice(segmentStart));
    return true;
  };

  for await (const chunk of stream) {
    let text = chunk;
    if (!found) {
      prefix += text;
      const marker = prefix.indexOf('"trades":[');
      if (marker < 0) {
        prefix = prefix.slice(-64);
        continue;
      }
      found = true;
      text = prefix.slice(marker + '"trades":['.length);
      prefix = '';
    }
    if (!scan(text)) break;
  }
}

await streamTrades(path.join(ROOT, 'data/pump-paper-trades.json'), 'PUMP_FILE');
await streamTrades(path.join(ROOT, 'data/edge-paper-trades.json'), 'SHORT_EDGE');

const output = {
  range: { fromDay: FROM_DAY, toDay: TO_DAY, timezone: 'Asia/Bangkok' },
  condition: {
    side: 'LONG',
    btcCorr: '>= 0.5',
    btcDirection: 'DOWN',
    btcTrendScore: '< 45',
    btcPct24h: '-0.2 < pct24h < 0.2',
    btcRsi4h: '< 50',
    basis: 'ENTRY_SNAPSHOT',
  },
  sources: {},
};

for (const [family, acc] of accumulators) {
  const baseline = compact(acc.baseline);
  const complete = compact(acc.complete);
  const matched = compact(acc.matched);
  output.sources[family] = {
    baseline,
    completeSnapshot: complete,
    matched,
    matchedVsBaseline: {
      closedCoveragePct: baseline.closed
        ? +(matched.closed / baseline.closed * 100).toFixed(2)
        : 0,
      wrLiftPoints: baseline.wr != null && matched.wr != null
        ? +(matched.wr - baseline.wr).toFixed(1)
        : null,
      avgRoeLiftPoints: baseline.avgRoe != null && matched.avgRoe != null
        ? +(matched.avgRoe - baseline.avgRoe).toFixed(2)
        : null,
    },
    days: Object.fromEntries(DAYS.map((day) => [day, compact(acc.days.get(day))])),
    setups: Object.fromEntries(
      [...acc.setup.entries()]
        .sort((a, b) => b[1].closed - a[1].closed)
        .map(([key, value]) => [key, compact(value)]),
    ),
    variants: Object.fromEntries(
      [...acc.variants.entries()]
        .sort((a, b) => b[1].closed - a[1].closed)
        .map(([key, value]) => [key, compact(value)]),
    ),
    matches: acc.matches,
  };
}

console.log(JSON.stringify(output, null, 2));
