import fs from 'node:fs';

const tradesPath = new URL('../data/pump-paper-trades.json', import.meta.url);
const cachePath = process.env.BR_CANDLE_CACHE ?? '/tmp/br_candle_klines_cache.json';
const startMs = Date.parse(process.env.BR_CANDLE_START ?? '2026-06-26T00:00:00Z');
const endMs = Date.now();

const store = JSON.parse(fs.readFileSync(tradesPath, 'utf8'));
const trades = Array.isArray(store.trades) ? store.trades : [];
const brTrades = trades.filter((trade) =>
  String(trade.source ?? '').includes('br_like')
  && Date.parse(trade.createdAt ?? 0) >= startMs
  && trade.status === 'CLOSED');

function timeframe(trade) {
  const match = String(trade.source ?? '').match(/^emasq-(\d+[mh])-/);
  return match ? match[1] : '5m';
}

function pairKey(trade) {
  return `${trade.symbol}|${timeframe(trade)}`;
}

let klineCache = {};
try {
  klineCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
} catch {
  klineCache = {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPair(pair) {
  if (Array.isArray(klineCache[pair])) return klineCache[pair];
  const [symbol, interval] = pair.split('|');
  const url = new URL('https://fapi.binance.com/fapi/v1/klines');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('startTime', String(startMs - 24 * 3600_000));
  url.searchParams.set('endTime', String(endMs));
  url.searchParams.set('limit', '1500');
  let res = await fetch(url);
  if (res.status === 429 || res.status === 418) {
    const body = await res.text().catch(() => '');
    console.warn(`rate limited ${pair}: ${body.slice(0, 160)}; waiting 30s`);
    await sleep(30_000);
    res = await fetch(url);
  }
  if (!res.ok) throw new Error(`${pair} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  klineCache[pair] = data.map((kline) => ({
    openTime: Number(kline[0]),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5]),
    closeTime: Number(kline[6]),
  }));
  if (Object.keys(klineCache).length % 20 === 0) {
    fs.writeFileSync(cachePath, JSON.stringify(klineCache));
  }
  await sleep(Number(process.env.BR_CANDLE_FETCH_DELAY_MS ?? 250));
  return klineCache[pair];
}

function findSignalCandle(klines, createdAt) {
  const ts = Date.parse(createdAt);
  let lo = 0;
  let hi = klines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Number(klines[mid].closeTime) <= ts) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (ans >= 0) return ans;
  return klines.findIndex((kline) =>
    Number(kline.openTime) <= ts && ts <= Number(kline.closeTime));
}

export function getBrCandleFeatures(klines, index) {
  const kline = klines[index];
  if (!kline) return null;
  const prev = klines[index - 1];
  const range = Math.max(1e-12, Number(kline.high) - Number(kline.low));
  const body = Math.abs(Number(kline.close) - Number(kline.open));
  const upper = Number(kline.high) - Math.max(Number(kline.open), Number(kline.close));
  const lower = Math.min(Number(kline.open), Number(kline.close)) - Number(kline.low);
  const closePos = (Number(kline.close) - Number(kline.low)) / range;
  const bodyShare = body / range;
  const upperShare = upper / range;
  const lowerShare = lower / range;
  const dir = Number(kline.close) >= Number(kline.open) ? 'GREEN' : 'RED';
  const volRatio = prev && Number(prev.volume) > 0 ? Number(kline.volume) / Number(prev.volume) : null;
  let kind = 'MIXED';
  if (bodyShare < 0.25) kind = 'DOJI';
  else if (upperShare >= 0.45 && upperShare > lowerShare * 1.5) kind = 'UPPER_WICK';
  else if (lowerShare >= 0.45 && lowerShare > upperShare * 1.5) kind = 'LOWER_WICK';
  else if (bodyShare >= 0.55 && closePos >= 0.75) kind = 'STRONG_GREEN_CLOSE';
  else if (bodyShare >= 0.55 && closePos <= 0.25) kind = 'STRONG_RED_CLOSE';
  else if (closePos >= 0.7) kind = 'CLOSE_HIGH';
  else if (closePos <= 0.3) kind = 'CLOSE_LOW';
  return { dir, kind, bodyShare, upperShare, lowerShare, closePos, volRatio };
}

export function getBrRealCandleFit(side, features) {
  if (!features) return 'NO_DATA';
  const s = String(side ?? '').toUpperCase();
  const goodLong = (features.closePos >= 0.65 && features.upperShare <= 0.35)
    || features.kind === 'LOWER_WICK';
  const badLong = features.closePos <= 0.45
    || features.upperShare >= 0.45
    || (features.dir === 'RED' && features.bodyShare >= 0.45);
  const goodShort = (features.closePos <= 0.35 && features.lowerShare <= 0.35)
    || features.kind === 'UPPER_WICK';
  const badShort = features.closePos >= 0.55
    || features.lowerShare >= 0.45
    || (features.dir === 'GREEN' && features.bodyShare >= 0.45);
  if (s === 'LONG') return goodLong ? 'REAL_OK_CANDLE' : badLong ? 'REAL_BAD_CANDLE' : 'REAL_MID_CANDLE';
  if (s === 'SHORT') return goodShort ? 'REAL_OK_CANDLE' : badShort ? 'REAL_BAD_CANDLE' : 'REAL_MID_CANDLE';
  return 'NO_DATA';
}

function stats(rows) {
  const n = rows.length;
  const pnl = rows.reduce((sum, row) => sum + Number(row.trade.pnl ?? 0), 0);
  const roe = rows.reduce((sum, row) => sum + Number(row.trade.roe ?? 0), 0);
  const wins = rows.filter((row) => Number(row.trade.pnl ?? 0) > 0).length;
  return {
    n,
    pnl: Number(pnl.toFixed(3)),
    wr: n ? Number((wins / n * 100).toFixed(1)) : 0,
    avgRoe: n ? Number((roe / n).toFixed(2)) : 0,
  };
}

async function main() {
  const pairs = [...new Set(brTrades.map(pairKey))].sort();
  console.log(`closed br since ${new Date(startMs).toISOString()}: ${brTrades.length}; pairs=${pairs.length}`);
  for (let i = 0; i < pairs.length; i++) {
    await fetchPair(pairs[i]);
    if ((i + 1) % 50 === 0) console.log(`fetched ${i + 1}/${pairs.length}`);
  }
  fs.writeFileSync(cachePath, JSON.stringify(klineCache));

  const rows = brTrades.map((trade) => {
    const klines = klineCache[pairKey(trade)] ?? [];
    const idx = findSignalCandle(klines, trade.createdAt);
    const features = idx >= 0 ? getBrCandleFeatures(klines, idx) : null;
    return { trade, features, label: getBrRealCandleFit(trade.side, features), tf: timeframe(trade) };
  });

  if (process.env.BR_CANDLE_APPLY === '1') {
    const backupPath = new URL(`../data/pump-paper-trades.json.bak-br-candle-fit-${new Date().toISOString().replaceAll(':', '-')}`, import.meta.url);
    let updated = 0;
    let noData = 0;
    for (const trade of trades) {
      if (!String(trade.source ?? '').includes('br_like') || Date.parse(trade.createdAt ?? 0) < startMs) continue;
      const klines = klineCache[pairKey(trade)] ?? [];
      const idx = findSignalCandle(klines, trade.createdAt);
      const features = idx >= 0 ? getBrCandleFeatures(klines, idx) : null;
      if (!features) {
        noData++;
        continue;
      }
      trade.brRealCandleFit = getBrRealCandleFit(trade.side, features);
      trade.brCandleKind = features.kind;
      trade.brCandleDir = features.dir;
      trade.brCandleClosePos = features.closePos;
      trade.brCandleBodyShare = features.bodyShare;
      trade.brCandleUpperShare = features.upperShare;
      trade.brCandleLowerShare = features.lowerShare;
      trade.brCandleVolRatio = features.volRatio;
      updated++;
    }
    fs.copyFileSync(tradesPath, backupPath);
    fs.writeFileSync(tradesPath, JSON.stringify(store));
    console.log(`applied candle fit labels: updated=${updated}; noData=${noData}; backup=${backupPath.pathname}`);
  }

  console.log('label stats');
  for (const label of [...new Set(rows.map((row) => row.label))].sort()) {
    console.log(label, stats(rows.filter((row) => row.label === label)));
  }
  console.log('by side label');
  for (const side of ['LONG', 'SHORT']) {
    for (const label of ['REAL_OK_CANDLE', 'REAL_MID_CANDLE', 'REAL_BAD_CANDLE', 'NO_DATA']) {
      console.log(side, label, stats(rows.filter((row) => row.trade.side === side && row.label === label)));
    }
  }
  console.log('kind side stats');
  const kinds = [...new Set(rows.map((row) => row.features?.kind ?? 'NO_DATA'))].sort();
  for (const side of ['LONG', 'SHORT']) {
    for (const kind of kinds) {
      console.log(side, kind, stats(rows.filter((row) => row.trade.side === side && (row.features?.kind ?? 'NO_DATA') === kind)));
    }
  }
  console.log('threshold sweep LONG closePos/upper');
  for (const cp of [0.55, 0.6, 0.65, 0.7, 0.75]) {
    for (const up of [0.3, 0.35, 0.4, 0.45]) {
      const bucket = rows.filter((row) => row.trade.side === 'LONG'
        && row.features && row.features.closePos >= cp && row.features.upperShare <= up);
      if (bucket.length >= 50) console.log(`LONG cp>=${cp} up<=${up}`, stats(bucket));
    }
  }
  console.log('threshold sweep SHORT closePos/lower');
  for (const cp of [0.45, 0.4, 0.35, 0.3, 0.25]) {
    for (const lo of [0.3, 0.35, 0.4, 0.45]) {
      const bucket = rows.filter((row) => row.trade.side === 'SHORT'
        && row.features && row.features.closePos <= cp && row.features.lowerShare <= lo);
      if (bucket.length >= 50) console.log(`SHORT cp<=${cp} low<=${lo}`, stats(bucket));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
