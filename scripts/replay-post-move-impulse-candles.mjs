import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluatePostDumpNoSellWatch,
  POST_DUMP_NO_SELL_STAGE,
} from '../src/postDumpNoSellWatch.js';
import {
  evaluatePostPumpNoBuyWatch,
  POST_PUMP_NO_BUY_STAGE,
} from '../src/postPumpNoBuyWatch.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://fapi.binance.com';
const DAYS = Math.max(1, Number(process.env.IMPULSE_REPLAY_DAYS ?? 3));
const TOP = Math.max(20, Number(process.env.IMPULSE_REPLAY_TOP ?? 200));
const CONCURRENCY = Math.max(1, Number(process.env.IMPULSE_REPLAY_CONCURRENCY ?? 2));
const COST_PCT = 0.12;
const BAR_MS = 5 * 60_000;
const endAt = Math.floor(Date.now() / BAR_MS) * BAR_MS - 1;
const evalStartAt = endAt - DAYS * 24 * 60 * 60_000;
const fetchStartAt = evalStartAt - 2 * 24 * 60 * 60_000;
const reportFile = path.join(ROOT, `reports/post-move-impulse-replay-${DAYS}d-top${TOP}-20260927.md`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const fmt = (value, digits = 2) => value == null ? '—' : Number(value).toFixed(digits);
const pct = (value, digits = 2) => value == null ? '—' : `${fmt(value, digits)}%`;
const vn = (value) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok', hour12: false });

async function getJson(url, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });
    const text = await response.text();
    if (response.ok) return JSON.parse(text);
    if (![418, 429, 500, 502, 503].includes(response.status) || attempt === retries - 1) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
    }
    await sleep(1500 * (attempt + 1));
  }
  return [];
}

async function universe() {
  const [exchange, tickers] = await Promise.all([
    getJson(`${BASE}/fapi/v1/exchangeInfo`),
    getJson(`${BASE}/fapi/v1/ticker/24hr`),
  ]);
  const eligible = new Set((exchange.symbols ?? [])
    .filter((row) => row.status === 'TRADING' && row.quoteAsset === 'USDT' && row.contractType === 'PERPETUAL')
    .map((row) => row.symbol));
  return tickers
    .filter((row) => eligible.has(row.symbol))
    .sort((a, b) => finite(b.quoteVolume, 0) - finite(a.quoteVolume, 0))
    .slice(0, TOP)
    .map((row) => ({ symbol: row.symbol, quoteVolume24h: finite(row.quoteVolume, 0) }));
}

function kline(row) {
  return {
    openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]),
    close: Number(row[4]), volume: Number(row[5]), closeTime: Number(row[6]),
    quoteVolume: Number(row[7]), takerBuyQuoteVolume: Number(row[10]),
  };
}

async function fetchPaged(symbol, interval, startTime, endTime) {
  const output = [];
  let cursor = startTime;
  const step = interval === '5m' ? 5 * 60_000 : 15 * 60_000;
  while (cursor <= endTime) {
    const query = new URLSearchParams({
      symbol, interval, startTime: String(cursor), endTime: String(endTime), limit: '1000',
    });
    const rows = await getJson(`${BASE}/fapi/v1/klines?${query}`);
    if (!Array.isArray(rows) || !rows.length) break;
    output.push(...rows.map(kline));
    const next = Number(rows.at(-1)[6]) + 1;
    if (!(next > cursor)) break;
    cursor = next;
    if (rows.length < 1000) break;
    await sleep(350);
  }
  return output.filter((row) => row.closeTime <= endTime && row.closeTime >= startTime - step);
}

function directional(side, price, entry) {
  return ((price / entry) - 1) * 100 * (side === 'LONG' ? 1 : -1);
}

function outcome(side, rows5m, impulseIndex) {
  if (impulseIndex + 36 >= rows5m.length) return null;
  const entry = rows5m[impulseIndex + 1].open;
  const result = {};
  for (const [key, bars] of [['15m', 3], ['1h', 12], ['3h', 36]]) {
    const window = rows5m.slice(impulseIndex + 1, impulseIndex + 1 + bars);
    const gross = directional(side, window.at(-1).close, entry);
    const favorable = window.map((row) => side === 'LONG'
      ? directional(side, row.high, entry) : directional(side, row.low, entry));
    const adverse = window.map((row) => side === 'LONG'
      ? directional(side, row.low, entry) : directional(side, row.high, entry));
    result[key] = {
      net: gross - COST_PCT,
      mfe: Math.max(...favorable),
      mae: Math.min(...adverse),
    };
  }
  return result;
}

function scanSymbol(info, rows5m, rows15m) {
  const signals = [];
  let pointer15m = 0;
  const firstIndex = rows5m.findIndex((row) => row.closeTime >= evalStartAt);
  for (let index = Math.max(40, firstIndex); index < rows5m.length - 36; index += 1) {
    const candle = rows5m[index];
    while (pointer15m < rows15m.length && rows15m[pointer15m].closeTime < candle.closeTime) pointer15m += 1;
    const context5m = rows5m.slice(Math.max(0, index - 120), index + 1);
    const context15m = rows15m.slice(Math.max(0, pointer15m - 110), pointer15m);
    const pairs = [
      { side: 'LONG', stage: POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE,
        result: evaluatePostDumpNoSellWatch({ symbol: info.symbol, rows5m: context5m, rows15m: context15m }) },
      { side: 'SHORT', stage: POST_PUMP_NO_BUY_STAGE.SELL_IMPULSE,
        result: evaluatePostPumpNoBuyWatch({ symbol: info.symbol, rows5m: context5m, rows15m: context15m }) },
    ];
    for (const pair of pairs) {
      const watch = pair.result.watch;
      if (!watch || watch.stage !== pair.stage || watch.impulseAt !== candle.closeTime) continue;
      const measured = outcome(pair.side, rows5m, index);
      if (!measured) continue;
      signals.push({
        ...watch,
        side: pair.side,
        quoteVolume24h: info.quoteVolume24h,
        impulseQuoteVolume: candle.quoteVolume,
        outcome: measured,
      });
    }
  }
  return signals;
}

function summarize(rows, horizon = '3h') {
  if (!rows.length) return { n: 0 };
  const values = rows.map((row) => row.outcome[horizon]);
  return {
    n: rows.length,
    wr: values.filter((row) => row.net > 0).length / rows.length * 100,
    avg: mean(values.map((row) => row.net)),
    med: median(values.map((row) => row.net)),
    mfe: mean(values.map((row) => row.mfe)),
    mae: mean(values.map((row) => row.mae)),
  };
}

function grouped(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, values]) => ({
    key,
    m15: summarize(values, '15m'),
    h1: summarize(values, '1h'),
    h3: summarize(values, '3h'),
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function table(groups) {
  const header = '| Nhóm cây impulse | N | WR/Net 15m | WR/Net 1h | WR/Net 3h | MFE/MAE 3h |\n|---|---:|---:|---:|---:|---:|';
  return [header, ...groups.map((row) => `| ${row.key} | ${row.h3.n} | ${pct(row.m15.wr, 1)} / ${pct(row.m15.avg)} | ${pct(row.h1.wr, 1)} / ${pct(row.h1.avg)} | ${pct(row.h3.wr, 1)} / ${pct(row.h3.avg)} | ${pct(row.h3.mfe)} / ${pct(row.h3.mae)} |`)].join('\n');
}

function qvBucket(row) {
  const value = finite(row.impulseQuoteVolume, 0);
  if (value >= 1_000_000) return '>=1M USDT';
  if (value >= 250_000) return '250k–999k';
  if (value >= 100_000) return '100k–249k';
  return '<100k';
}

function ratioBucket(row) {
  const value = finite(row.impulseVolumeRatio, 0);
  return value >= 5 ? '>=5x' : value >= 2.5 ? '2.5–4.99x' : '1.8–2.49x';
}

function moveBucket(row) {
  const value = Math.abs(finite(row.impulseRisePct ?? row.impulseDropPct, 0));
  return value >= 2 ? '>=2%' : value >= 1.2 ? '1.2–1.99%' : '<1.2%';
}

function rangeBucket(row) {
  const value = finite(row.impulseRangeAtr, 0);
  return value >= 3 ? '>=3 ATR' : value >= 2 ? '2–2.99 ATR' : '1.5–1.99 ATR';
}

async function main() {
  const symbols = await universe();
  const all = [];
  const errors = [];
  let cursor = 0;
  let completed = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < symbols.length) {
      const info = symbols[cursor++];
      try {
        const [rows5m, rows15m] = await Promise.all([
          fetchPaged(info.symbol, '5m', fetchStartAt, endAt),
          fetchPaged(info.symbol, '15m', fetchStartAt, endAt),
        ]);
        all.push(...scanSymbol(info, rows5m, rows15m));
      } catch (error) {
        errors.push(`${info.symbol}: ${error.message}`);
      }
      completed += 1;
      if (completed % 20 === 0) console.error(`replay ${completed}/${symbols.length} symbols; signals=${all.length}; errors=${errors.length}`);
      await sleep(350);
    }
  });
  await Promise.all(workers);

  const bySide = grouped(all, (row) => row.side);
  const byAbsoluteVolume = grouped(all, (row) => `${row.side} · ${qvBucket(row)}`);
  const byRatio = grouped(all, (row) => `${row.side} · ${ratioBucket(row)}`);
  const byMove = grouped(all, (row) => `${row.side} · ${moveBucket(row)}`);
  const byRange = grouped(all, (row) => `${row.side} · ${rangeBucket(row)}`);
  const report = [
    `# Replay cây impulse vàng/cam — ${DAYS} ngày, top ${TOP}`, '',
    `- Replay đúng detector hiện tại trên ${symbols.length} USDT perpetual có volume 24h cao nhất.`,
    `- Khoảng đánh giá: **${vn(evalStartAt)} → ${vn(endAt)}**; thêm 2 ngày warm-up để dựng pump/dump base.`,
    `- Chỉ lấy cây đầu tiên có stage **BUY_IMPULSE** hoặc **SELL_IMPULSE**; entry open nến 5m kế tiếp; giữ cố định theo horizon; trừ ${COST_PCT}% chi phí.`,
    `- Tổng ${all.length} impulse (${all.filter((row) => row.side === 'LONG').length} LONG, ${all.filter((row) => row.side === 'SHORT').length} SHORT); lỗi ${errors.length} symbol.`,
    '', '## Tổng thể', '', table(bySide),
    '', '## Volume USDT tuyệt đối của cây impulse', '', table(byAbsoluteVolume),
    '', '## Volume ratio của cây impulse', '', table(byRatio),
    '', '## Biên độ thân cây impulse', '', table(byMove),
    '', '## Range/ATR cây impulse', '', table(byRange),
    '', '## Giới hạn', '',
    '- Universe chọn theo thanh khoản hiện tại nên có survivorship bias; coin đã delist không xuất hiện.',
    '- Nhiều coin phát cùng timestamp có tương quan; N không phải số thử độc lập hoàn toàn.',
    '- Đây là raw directional edge sau impulse, chưa mô phỏng TP/SL động, max-position, BTC gate hay trượt giá theo độ sâu sổ lệnh.',
    errors.length ? `- Lỗi: ${errors.slice(0, 30).join('; ')}` : '- Không có lỗi tải dữ liệu.',
    '',
  ].join('\n');
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, report, 'utf8');
  console.log(JSON.stringify({ report: reportFile, symbols: symbols.length, signals: all.length, errors: errors.length,
    bySide, byAbsoluteVolume, byRatio, byMove, byRange }, null, 2));
}

await main();
