import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = [
  { file: 'data/post-dump-no-sell-discord.json', stage: 'BUY_IMPULSE', side: 'LONG', color: 'VÀNG' },
  { file: 'data/post-pump-no-buy-discord.json', stage: 'SELL_IMPULSE', side: 'SHORT', color: 'CAM' },
];
const REPORT = path.join(ROOT, 'reports/post-move-impulse-candle-backtest-20260927.md');
const BINANCE = 'https://fapi.binance.com/fapi/v1/klines';
const COST_PCT = 0.12;
const HORIZONS = [
  { key: '15m', bars: 3 },
  { key: '30m', bars: 6 },
  { key: '1h', bars: 12 },
  { key: '3h', bars: 36 },
];

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

async function loadSignals() {
  const signals = [];
  for (const source of SOURCES) {
    const parsed = JSON.parse(await fs.readFile(path.join(ROOT, source.file), 'utf8'));
    for (const event of parsed.events ?? []) {
      if (event.stage !== source.stage || event.side !== source.side) continue;
      signals.push({ ...event, color: source.color });
    }
  }
  const deduped = new Map();
  for (const signal of signals) {
    const key = `${signal.symbol}|${signal.side}|${signal.impulseAt}`;
    deduped.set(key, signal);
  }
  return [...deduped.values()].sort((a, b) => a.impulseAt - b.impulseAt);
}

async function fetchKlines(symbol, startTime, endTime, retries = 4) {
  const query = new URLSearchParams({
    symbol,
    interval: '5m',
    startTime: String(startTime),
    endTime: String(endTime),
    limit: '500',
  });
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const response = await fetch(`${BINANCE}?${query}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    if (response.ok) {
      return JSON.parse(text).map((row) => ({
        openTime: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        quoteVolume: Number(row[7]),
        closeTime: Number(row[6]),
      }));
    }
    if (![418, 429, 500, 502, 503].includes(response.status) || attempt === retries - 1) {
      throw new Error(`${symbol} HTTP ${response.status}: ${text.slice(0, 120)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  return [];
}

function directionalMove(signal, price, entry) {
  const sign = signal.side === 'LONG' ? 1 : -1;
  return ((price / entry) - 1) * 100 * sign;
}

function firstTouch(signal, rows, entry, target = 1) {
  for (const row of rows) {
    const favorable = signal.side === 'LONG'
      ? directionalMove(signal, row.high, entry)
      : directionalMove(signal, row.low, entry);
    const adverse = signal.side === 'LONG'
      ? directionalMove(signal, row.low, entry)
      : directionalMove(signal, row.high, entry);
    if (favorable >= target && adverse <= -target) return 'LOSS';
    if (adverse <= -target) return 'LOSS';
    if (favorable >= target) return 'WIN';
  }
  return 'NONE';
}

function evaluate(signal, rows) {
  const entryIndex = rows.findIndex((row) => row.openTime > signal.impulseAt);
  if (entryIndex < 0) return null;
  const after = rows.slice(entryIndex);
  if (!after.length) return null;
  const entry = after[0].open;
  const horizons = {};
  for (const horizon of HORIZONS) {
    if (after.length < horizon.bars) continue;
    const window = after.slice(0, horizon.bars);
    const closeMove = directionalMove(signal, window.at(-1).close, entry);
    const favorable = window.map((row) => signal.side === 'LONG'
      ? directionalMove(signal, row.high, entry)
      : directionalMove(signal, row.low, entry));
    const adverse = window.map((row) => signal.side === 'LONG'
      ? directionalMove(signal, row.low, entry)
      : directionalMove(signal, row.high, entry));
    horizons[horizon.key] = {
      gross: closeMove,
      net: closeMove - COST_PCT,
      mfe: Math.max(...favorable),
      mae: Math.min(...adverse),
      touch1: firstTouch(signal, window, entry, 1),
    };
  }
  return { entry, entryAt: after[0].openTime, horizons };
}

function summarize(rows, key) {
  const mature = rows.filter((row) => row.outcome.horizons[key]);
  if (!mature.length) return { n: 0 };
  const outcomes = mature.map((row) => row.outcome.horizons[key]);
  const wins = outcomes.filter((row) => row.net > 0).length;
  const touches = outcomes.filter((row) => row.touch1 !== 'NONE');
  return {
    n: mature.length,
    wr: wins / mature.length * 100,
    avg: mean(outcomes.map((row) => row.net)),
    med: median(outcomes.map((row) => row.net)),
    mfe: mean(outcomes.map((row) => row.mfe)),
    mae: mean(outcomes.map((row) => row.mae)),
    touchN: touches.length,
    touchWr: touches.length ? touches.filter((row) => row.touch1 === 'WIN').length / touches.length * 100 : null,
  };
}

function groups(rows, keyOf) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return [...grouped.entries()].map(([key, values]) => ({
    key,
    total: values.length,
    m15: summarize(values, '15m'),
    h1: summarize(values, '1h'),
    h3: summarize(values, '3h'),
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function table(rows) {
  const header = '| Nhóm impulse | Tổng | N 15m | WR/Net 15m | N 1h | WR/Net 1h | N 3h | WR/Net 3h | MFE/MAE 3h | Chạm ±1% (WR) |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|';
  return [header, ...rows.map((row) => `| ${row.key} | ${row.total} | ${row.m15.n} | ${pct(row.m15.wr, 1)} / ${pct(row.m15.avg)} | ${row.h1.n} | ${pct(row.h1.wr, 1)} / ${pct(row.h1.avg)} | ${row.h3.n} | ${pct(row.h3.wr, 1)} / ${pct(row.h3.avg)} | ${pct(row.h3.mfe)} / ${pct(row.h3.mae)} | ${row.h3.touchN ?? 0} (${pct(row.h3.touchWr, 1)}) |`)].join('\n');
}

function scoreBucket(row) {
  const score = finite(row.signal.score, 0);
  return score >= 70 ? '>=70' : score >= 60 ? '60–69.9' : '<60';
}

function volumeBucket(row) {
  const ratio = finite(row.signal.impulseVolumeRatio, 0);
  return ratio >= 5 ? '>=5x' : ratio >= 2.5 ? '2.5–4.99x' : '1.8–2.49x';
}

function moveBucket(row) {
  const move = Math.abs(finite(row.signal.impulseRisePct ?? row.signal.impulseDropPct, 0));
  return move >= 2 ? '>=2%' : move >= 1.2 ? '1.2–1.99%' : '<1.2%';
}

function rangeBucket(row) {
  const range = finite(row.signal.impulseRangeAtr, 0);
  return range >= 3 ? '>=3 ATR' : range >= 2 ? '2–2.99 ATR' : '1.5–1.99 ATR';
}

function clusterSummary(rows, key) {
  const mature = rows.filter((row) => row.outcome.horizons[key]);
  const clusters = new Map();
  for (const row of mature) {
    const clusterKey = String(row.signal.impulseAt);
    if (!clusters.has(clusterKey)) clusters.set(clusterKey, []);
    clusters.get(clusterKey).push(row.outcome.horizons[key].net);
  }
  const values = [...clusters.values()].map(mean);
  return {
    clusters: values.length,
    wr: values.length ? values.filter((value) => value > 0).length / values.length * 100 : null,
    avg: mean(values),
    med: median(values),
  };
}

async function main() {
  const signals = await loadSignals();
  if (!signals.length) throw new Error('Không có BUY_IMPULSE/SELL_IMPULSE trong event stores.');
  const minAt = Math.min(...signals.map((row) => row.impulseAt));
  const maxAt = Math.max(...signals.map((row) => row.impulseAt));
  const endAt = Math.min(Date.now(), maxAt + 3 * 3600_000 + 10 * 60_000);
  const symbols = [...new Set(signals.map((row) => row.symbol))];
  const klines = new Map();
  const errors = [];
  let cursor = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor++];
      try {
        klines.set(symbol, await fetchKlines(symbol, minAt - 10 * 60_000, endAt));
      } catch (error) {
        errors.push(`${symbol}: ${error.message}`);
      }
    }
  });
  await Promise.all(workers);

  const evaluated = [];
  for (const signal of signals) {
    const outcome = evaluate(signal, klines.get(signal.symbol) ?? []);
    if (outcome) evaluated.push({ signal, outcome });
  }

  const bySide = groups(evaluated, (row) => `${row.signal.color} · ${row.signal.side}`);
  const byScore = groups(evaluated, (row) => `${row.signal.side} · điểm ${scoreBucket(row)}`);
  const byVolume = groups(evaluated, (row) => `${row.signal.side} · volume ${volumeBucket(row)}`);
  const byMove = groups(evaluated, (row) => `${row.signal.side} · thân ${moveBucket(row)}`);
  const byRange = groups(evaluated, (row) => `${row.signal.side} · range ${rangeBucket(row)}`);
  const cluster1h = clusterSummary(evaluated, '1h');
  const cluster3h = clusterSummary(evaluated, '3h');
  const report = [
    '# Backtest cây impulse vàng/cam — 2026-09-27',
    '',
    `- Chỉ lấy **vàng BUY_IMPULSE** và **cam SELL_IMPULSE**; loại confirmation và late/no-chase.`,
    `- Khoảng event store: **${vn(minAt)} → ${vn(maxAt)}**.`,
    `- ${signals.length} impulse duy nhất (${signals.filter((row) => row.side === 'LONG').length} LONG, ${signals.filter((row) => row.side === 'SHORT').length} SHORT); đánh giá được ${evaluated.length}; lỗi dữ liệu ${errors.length}.`,
    `- Entry causal: open nến 5m kế tiếp sau khi cây impulse đóng. Net return trừ ${COST_PCT}% phí + trượt giá giả định.`,
    '- Mẫu mới chưa đủ horizon không được đưa vào N của horizon đó.',
    '',
    '## Tổng thể theo màu/hướng',
    '',
    table(bySide),
    '',
    '## Theo điểm hiện tại',
    '',
    table(byScore),
    '',
    '## Theo volume ratio của chính cây impulse',
    '',
    table(byVolume),
    '',
    '## Theo % thân của chính cây impulse',
    '',
    table(byMove),
    '',
    '## Theo range/ATR của chính cây impulse',
    '',
    table(byRange),
    '',
    '## Giảm thiên lệch do nhiều coin cùng một nhịp thị trường',
    '',
    `- Cụm 1h: ${cluster1h.clusters} cụm nến, WR ${pct(cluster1h.wr, 1)}, net TB/cụm ${pct(cluster1h.avg)}, median ${pct(cluster1h.med)}.`,
    `- Cụm 3h: ${cluster3h.clusters} cụm nến, WR ${pct(cluster3h.wr, 1)}, net TB/cụm ${pct(cluster3h.avg)}, median ${pct(cluster3h.med)}.`,
    '',
    '## Giới hạn',
    '',
    '- Detector/event store mới chỉ có dữ liệu trong ngày; đây là tổng thể event đang lưu, chưa phải nhiều chế độ thị trường.',
    '- Event store không lưu quote-volume USDT tuyệt đối của cây impulse, nên chỉ phân tích volume ratio; muốn đánh giá thanh khoản tuyệt đối cần bổ sung snapshot hoặc replay lịch sử toàn market.',
    '- Các coin cùng timestamp tương quan mạnh; vì vậy có thêm thống kê theo cụm thời gian.',
    errors.length ? `- Lỗi: ${errors.slice(0, 20).join('; ')}` : '- Không có lỗi tải kline.',
    '',
  ].join('\n');
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(REPORT, report, 'utf8');
  console.log(JSON.stringify({
    report: REPORT,
    range: { minAt, maxAt },
    signals: signals.length,
    evaluated: evaluated.length,
    errors: errors.length,
    bySide,
    byScore,
    byVolume,
    byMove,
    byRange,
    cluster1h,
    cluster3h,
  }, null, 2));
}

await main();
