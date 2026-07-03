import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const tradesPath = path.join(root, 'data', 'pump-paper-trades.json');
const rawTrades = JSON.parse(fs.readFileSync(tradesPath, 'utf8'));
const trades = Array.isArray(rawTrades)
  ? rawTrades
  : Array.isArray(rawTrades.trades)
    ? rawTrades.trades
    : Array.isArray(rawTrades.items)
      ? rawTrades.items
      : Array.isArray(rawTrades.orders)
        ? rawTrades.orders
        : Object.values(rawTrades).flat().filter((v) => v && typeof v === 'object');

const startArg = process.argv[2] || '2026-06-26T00:00:00.000Z';
const endArg = process.argv[3] || new Date().toISOString();
const startMs = Date.parse(startArg);
const endMs = Date.parse(endArg);
const windowMs = 2 * 60 * 60 * 1000;

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function ts(v) {
  const x = Date.parse(v || '');
  return Number.isFinite(x) ? x : NaN;
}

function isBrLikeShort(t) {
  const src = String(t.source || '').toLowerCase();
  const note = String(t.note || '').toLowerCase();
  return t.side === 'SHORT' && (src.includes('br_like_short') || note.includes('br-like short'));
}

function entryTime(t) {
  return ts(t.openedAt) || ts(t.createdAt);
}

function closeTime(t) {
  return ts(t.closedAt);
}

function pnl(t) {
  if (Number.isFinite(Number(t.pnl))) return Number(t.pnl);
  return 0;
}

function isWin(t) {
  return pnl(t) > 0;
}

function isSl(t) {
  return String(t.outcome || t.status || '').toUpperCase() === 'SL';
}

function isCut(t) {
  return String(t.outcome || t.status || '').toUpperCase() === 'BREADTH_REVERSAL_LOSS_CUT';
}

function isTp(t) {
  return String(t.outcome || t.status || '').toUpperCase() === 'TP';
}

function emptyBucket() {
  return { count: 0, pnl: 0, wins: 0, losses: 0, sl: 0, cut: 0, tp: 0 };
}

function add(bucket, t) {
  bucket.count += 1;
  bucket.pnl += pnl(t);
  if (isWin(t)) bucket.wins += 1;
  else bucket.losses += 1;
  if (isSl(t)) bucket.sl += 1;
  if (isCut(t)) bucket.cut += 1;
  if (isTp(t)) bucket.tp += 1;
}

function wr(bucket) {
  return bucket.count ? (bucket.wins / bucket.count) * 100 : 0;
}

function fmt(bucket) {
  return `${bucket.count} trades | PnL ${bucket.pnl.toFixed(3)} | WR ${wr(bucket).toFixed(1)}% | SL ${bucket.sl} | CUT ${bucket.cut} | TP ${bucket.tp}`;
}

const closedShorts = trades
  .filter(isBrLikeShort)
  .filter((t) => Number.isFinite(closeTime(t)))
  .sort((a, b) => closeTime(a) - closeTime(b));

const candidates = closedShorts
  .filter((t) => {
    const t0 = entryTime(t);
    return Number.isFinite(t0) && t0 >= startMs && t0 <= endMs;
  })
  .sort((a, b) => entryTime(a) - entryTime(b));

function rollingBefore(openMs) {
  const bucket = emptyBucket();
  for (const t of closedShorts) {
    const c = closeTime(t);
    if (c >= openMs) break;
    if (c >= openMs - windowMs) add(bucket, t);
  }
  return bucket;
}

function strictBad(perf) {
  return perf.count >= 20 && (perf.pnl <= -10 || perf.cut >= 8 || wr(perf) < 45);
}

function recovery60(openMs) {
  const bucket = emptyBucket();
  for (const t of closedShorts) {
    const c = closeTime(t);
    if (c >= openMs) break;
    if (c >= openMs - 60 * 60 * 1000) add(bucket, t);
  }
  return {
    ...bucket,
    active: bucket.count >= 8 && (bucket.pnl > 0 || wr(bucket) >= 70),
  };
}

const base = emptyBucket();
const blocked = emptyBucket();
const kept = emptyBucket();
const byDay = new Map();
const byHour = new Map();
const examples = [];

for (const t of candidates) {
  add(base, t);
  const openMs = entryTime(t);
  const perf = rollingBefore(openMs);
  const recovery = recovery60(openMs);
  const blockedByRule = strictBad(perf) && !recovery.active;
  const day = new Date(openMs).toISOString().slice(0, 10);
  const hour = new Date(openMs).toISOString().slice(0, 13) + ':00';
  if (!byDay.has(day)) byDay.set(day, { base: emptyBucket(), blocked: emptyBucket(), kept: emptyBucket() });
  if (!byHour.has(hour)) byHour.set(hour, emptyBucket());
  add(byDay.get(day).base, t);

  if (blockedByRule) {
    add(blocked, t);
    add(byDay.get(day).blocked, t);
    add(byHour.get(hour), t);
    if (examples.length < 12) {
      examples.push({
        time: new Date(openMs).toISOString(),
        symbol: t.symbol,
        pnl: pnl(t),
        outcome: t.outcome || t.status,
        perfCount: perf.count,
        perfPnl: Number(perf.pnl.toFixed(3)),
        perfWr: Number(wr(perf).toFixed(1)),
        perfCut: perf.cut,
      });
    }
  } else {
    add(kept, t);
    add(byDay.get(day).kept, t);
  }
}

console.log(`Range: ${new Date(startMs).toISOString()} -> ${new Date(endMs).toISOString()}`);
console.log(`Baseline: ${fmt(base)}`);
console.log(`SHORT_ENV_BAD_STRICT blocked: ${fmt(blocked)} | delta if no Binance market ${(-blocked.pnl).toFixed(3)}`);
console.log(`Still market: ${fmt(kept)}`);
console.log('');
console.log('By UTC day');
for (const [day, b] of [...byDay.entries()].sort()) {
  console.log(`${day} | base ${fmt(b.base)} | blocked ${fmt(b.blocked)} | kept ${fmt(b.kept)} | delta ${(-b.blocked.pnl).toFixed(3)}`);
}
console.log('');
console.log('Blocked by UTC hour');
for (const [hour, b] of [...byHour.entries()].sort()) {
  if (b.count) console.log(`${hour} | ${fmt(b)}`);
}
console.log('');
console.log('First blocked examples');
for (const e of examples) {
  console.log(`${e.time} ${e.symbol} pnl=${e.pnl.toFixed(3)} outcome=${e.outcome} rolling=${e.perfCount} pnl=${e.perfPnl} wr=${e.perfWr}% cut=${e.perfCut}`);
}
