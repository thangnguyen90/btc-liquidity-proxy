import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { btcImpulseRegime } from '../public/btc-session-model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LONG_FILE = path.join(ROOT, 'data/post-dump-no-sell-discord.json');
const SHORT_FILE = path.join(ROOT, 'data/post-pump-no-buy-discord.json');
const FILL_AUDIT_FILE = path.join(ROOT, 'data/binance-filled-signal-audit/binance-filled-signals.csv');
const REPORT_FILE = path.join(ROOT, 'reports/post-move-impulse-btc-regime-backtest-20260927.md');
const BINANCE = 'https://fapi.binance.com/fapi/v1/klines';
const ROUND_TRIP_COST_PCT = 0.12;
const HORIZON_BARS = 36;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const mean = (rows) => rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
const median = (rows) => {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const pct = (value, digits = 2) => value == null ? '—' : `${Number(value).toFixed(digits)}%`;
const number = (value, digits = 2) => value == null ? '—' : Number(value).toFixed(digits);
const vnTime = (value) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok', hour12: false });

async function readEvents() {
  const [longRaw, shortRaw] = await Promise.all([
    fs.readFile(LONG_FILE, 'utf8').then(JSON.parse),
    fs.readFile(SHORT_FILE, 'utf8').then(JSON.parse),
  ]);
  const selected = [
    ...(longRaw.events ?? []).filter((row) => ['BUY_IMPULSE', 'NO_SELL_CONFIRMATION'].includes(row.stage)),
    ...(shortRaw.events ?? []).filter((row) => ['SELL_IMPULSE', 'NO_BUY_CONFIRMATION'].includes(row.stage)),
  ];
  const deduped = new Map();
  for (const row of selected) {
    const key = row.id || `${row.symbol}|${row.side}|${row.stage}|${row.observedAt}`;
    deduped.set(key, row);
  }
  return [...deduped.values()].sort((a, b) => a.observedAt - b.observedAt);
}

async function fetchKlines(symbol, interval, startTime, endTime, limit = 500, retries = 4) {
  const query = new URLSearchParams({ symbol, interval, startTime: String(startTime), endTime: String(endTime), limit: String(limit) });
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const response = await fetch(`${BINANCE}?${query}`, { headers: { accept: 'application/json' } });
    const text = await response.text();
    if (response.ok) {
      return JSON.parse(text).map((row) => ({
        openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]),
        close: Number(row[4]), volume: Number(row[5]), closeTime: Number(row[6]),
      }));
    }
    if (![418, 429, 500, 502, 503].includes(response.status) || attempt === retries - 1) {
      throw new Error(`${symbol} ${interval} HTTP ${response.status}: ${text.slice(0, 180)}`);
    }
    await sleep(1200 * (attempt + 1));
  }
  return [];
}

function rsiWilder(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    loss = (loss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

function emaLast(closes, period, back = 0) {
  if (!closes.length || closes.length <= back) return null;
  const alpha = 2 / (period + 1);
  let ema = closes[0];
  const values = [ema];
  for (let i = 1; i < closes.length; i += 1) {
    ema = alpha * closes[i] + (1 - alpha) * ema;
    values.push(ema);
  }
  return values[values.length - 1 - back] ?? null;
}

function trendOf(rows, interval) {
  const closes = rows.map((row) => row.close);
  if (closes.length < 28) return { direction: 'flat', score: 0 };
  const ema8 = emaLast(closes, 8);
  const ema21 = emaLast(closes, 21);
  const ema21Prev = emaLast(closes, 21, 6);
  const close = closes.at(-1);
  const direction = ema8 > ema21 ? 'up' : ema8 < ema21 ? 'down' : 'flat';
  const aligned = (direction === 'up' && close > ema8) || (direction === 'down' && close < ema8);
  const alignPoints = aligned ? 40 : direction !== 'flat' ? 16 : 0;
  const slopePct = ema21Prev > 0 ? Math.abs(ema21 - ema21Prev) / ema21Prev * 100 : 0;
  const slopeDivisor = interval === '4h' ? 4 : 2;
  const slopePoints = Math.max(0, Math.min(1, slopePct / slopeDivisor)) * 30;
  const recent = closes.slice(interval === '4h' ? -7 : -13);
  let directionCount = 0;
  for (let i = 1; i < recent.length; i += 1) {
    if (direction === 'up' && recent[i] > recent[i - 1]) directionCount += 1;
    else if (direction === 'down' && recent[i] < recent[i - 1]) directionCount += 1;
  }
  const consistency = directionCount / Math.max(1, recent.length - 1) * 30;
  return { direction, score: Math.round(alignPoints + slopePoints + consistency) };
}

function historicalHealth(btc1h, btc4h, at) {
  const rows1h = btc1h.filter((row) => row.closeTime <= at).slice(-200);
  const rows4h = btc4h.filter((row) => row.closeTime <= at).slice(-100);
  const closes1h = rows1h.map((row) => row.close);
  const closes4h = rows4h.map((row) => row.close);
  const trend1h = trendOf(rows1h, '1h');
  const trend4h = trendOf(rows4h, '4h');
  const rsi1h = rsiWilder(closes1h);
  const rsi4h = rsiWilder(closes4h);
  const sma20 = closes1h.length >= 20 ? mean(closes1h.slice(-20)) : null;
  const emaTrend1h = sma20 == null ? null : closes1h.at(-1) < sma20 ? 'below' : 'above';
  const pct6h = closes1h.length >= 7 ? (closes1h.at(-1) / closes1h.at(-7) - 1) * 100 : null;
  let obv = 0;
  const obvValues = [];
  for (let i = 1; i < rows4h.length; i += 1) {
    obv += rows4h[i].close > rows4h[i - 1].close ? rows4h[i].volume
      : rows4h[i].close < rows4h[i - 1].close ? -rows4h[i].volume : 0;
    obvValues.push(obv);
  }
  const recentObv = obvValues.slice(-20);
  const obvTrend = recentObv.length < 2 ? 'flat'
    : recentObv.at(-1) > recentObv[0] * 1.02 ? 'rising'
      : recentObv.at(-1) < recentObv[0] * 0.98 ? 'falling' : 'flat';
  let spike = false;
  if (rows1h.length >= 25) {
    const baseline = rows1h.slice(-25, -5).map((row) => row.volume);
    const averageVolume = mean(baseline);
    spike = rows1h.slice(-3).some((row) => averageVolume > 0
      && row.volume > averageVolume * 2.5
      && Math.abs(row.close / row.open - 1) * 100 > 1);
  }
  let bearPoints = 0;
  if (obvTrend === 'falling') bearPoints += 1;
  if (rsi4h != null && rsi4h < 30) bearPoints += 1;
  if (rsi1h != null && rsi1h < 40) bearPoints += 1;
  if (emaTrend1h === 'below') bearPoints += 1;
  let bullPoints = 0;
  if (rsi1h != null && rsi1h > 60) bullPoints += 1;
  if (emaTrend1h === 'above') bullPoints += 1;
  if (pct6h != null && pct6h > 1.5) bullPoints += 1;
  if (obvTrend === 'rising' && pct6h != null && pct6h > 0.5) bullPoints += 1;
  if (rsi4h != null && rsi4h > 55 && rsi4h < 70) bullPoints += 1;
  const score1h = spike || (rsi1h != null && (rsi1h > 78 || rsi1h < 22))
    ? Math.min(trend1h.score, 50) : trend1h.score;
  const score4h = rsi4h != null && (rsi4h > 78 || rsi4h < 22)
    ? Math.min(trend4h.score, 50) : trend4h.score;
  return {
    updatedAt: at,
    btcTrendDir: trend1h.direction,
    btcTrendScore: score1h,
    btcTrendDir4h: trend4h.direction,
    btcTrendScore4h: score4h,
    emaTrend1h,
    bullPoints,
    bearPoints,
    btcSpike: spike,
    btcSpikeAlert: spike,
    macroShock: { active: false },
    pct6h,
    rsi1h,
    rsi4h,
    obvTrend,
  };
}

function outcomeOf(signal, rows) {
  const entryIndex = rows.findIndex((row) => row.openTime > signal.observedAt);
  if (entryIndex < 0 || rows.length < entryIndex + 3) return null;
  const window = rows.slice(entryIndex, entryIndex + HORIZON_BARS);
  if (window.length < 12) return null;
  const entry = window[0].open;
  if (!(entry > 0)) return null;
  const sign = signal.side === 'LONG' ? 1 : -1;
  const closeReturn = (barIndex) => {
    const row = window[Math.min(barIndex, window.length - 1)];
    return (row.close / entry - 1) * 100 * sign;
  };
  const favorable = window.map((row) => signal.side === 'LONG' ? (row.high / entry - 1) * 100 : (1 - row.low / entry) * 100);
  const adverse = window.map((row) => signal.side === 'LONG' ? (row.low / entry - 1) * 100 : (1 - row.high / entry) * 100);
  const tpPct = 2;
  const slPct = signal.side === 'LONG' ? 4 : 6;
  let protection = 'TIMEOUT';
  let protectionAt = null;
  for (const row of window) {
    const tpHit = signal.side === 'LONG' ? row.high >= entry * (1 + tpPct / 100) : row.low <= entry * (1 - tpPct / 100);
    const slHit = signal.side === 'LONG' ? row.low <= entry * (1 - slPct / 100) : row.high >= entry * (1 + slPct / 100);
    if (tpHit || slHit) {
      protection = slHit ? 'SL' : 'TP'; // pessimistic when both touch in the same 5m candle
      protectionAt = row.closeTime;
      break;
    }
  }
  const ret15m = closeReturn(2);
  const ret1h = closeReturn(11);
  const ret3h = closeReturn(35);
  return {
    entry, entryAt: window[0].openTime, ret15m, ret1h, ret3h,
    net1h: ret1h - ROUND_TRIP_COST_PCT,
    net3h: ret3h - ROUND_TRIP_COST_PCT,
    roe1h: (ret1h - ROUND_TRIP_COST_PCT) * 5,
    roe3h: (ret3h - ROUND_TRIP_COST_PCT) * 5,
    mfe3h: Math.max(...favorable),
    mae3h: Math.min(...adverse),
    protection, protectionAt,
  };
}

function summarize(rows) {
  if (!rows.length) return null;
  const wins1h = rows.filter((row) => row.outcome.net1h > 0).length;
  const wins3h = rows.filter((row) => row.outcome.net3h > 0).length;
  return {
    n: rows.length,
    avg1h: mean(rows.map((row) => row.outcome.net1h)),
    med1h: median(rows.map((row) => row.outcome.net1h)),
    win1h: wins1h / rows.length * 100,
    avg3h: mean(rows.map((row) => row.outcome.net3h)),
    med3h: median(rows.map((row) => row.outcome.net3h)),
    win3h: wins3h / rows.length * 100,
    avgRoe3h: mean(rows.map((row) => row.outcome.roe3h)),
    mfe3h: mean(rows.map((row) => row.outcome.mfe3h)),
    mae3h: mean(rows.map((row) => row.outcome.mae3h)),
    tp: rows.filter((row) => row.outcome.protection === 'TP').length,
    sl: rows.filter((row) => row.outcome.protection === 'SL').length,
    timeout: rows.filter((row) => row.outcome.protection === 'TIMEOUT').length,
  };
}

function grouping(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, values]) => ({ key, ...summarize(values) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function clusterGrouping(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, new Map());
    const clusters = groups.get(key);
    const clusterKey = String(row.signal.observedAt);
    if (!clusters.has(clusterKey)) clusters.set(clusterKey, []);
    clusters.get(clusterKey).push(row.outcome.net3h);
  }
  return [...groups.entries()].map(([key, clusters]) => {
    const values = [...clusters.values()].map(mean);
    return {
      key,
      clusters: values.length,
      avg3h: mean(values),
      med3h: median(values),
      win3h: values.filter((value) => value > 0).length / values.length * 100,
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

function clusterTable(groups) {
  const header = '| Nhóm | Số cụm 5m | Cụm thắng | Net 3h TB / cụm | Median 3h / cụm |\n|---|---:|---:|---:|---:|';
  return [header, ...groups.map((row) => `| ${row.key} | ${row.clusters} | ${pct(row.win3h, 1)} | ${pct(row.avg3h)} | ${pct(row.med3h)} |`)].join('\n');
}

function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { record.push(field); field = ''; }
    else if (char === '\n') { record.push(field.replace(/\r$/, '')); records.push(record); record = []; field = ''; }
    else field += char;
  }
  if (field || record.length) { record.push(field.replace(/\r$/, '')); records.push(record); }
  const [headers, ...rows] = records;
  return rows.filter((row) => row.length === headers.length).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

async function actualFillRows(btc1h, btc4h) {
  const labels = new Set(['POST_DUMP_NO_SELL_BUY_IMPULSE_LONG', 'POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT']);
  const raw = await fs.readFile(FILL_AUDIT_FILE, 'utf8');
  return parseCsv(raw).filter((row) => labels.has(row.signal_label)
    && row.position_status === 'CLOSED'
    && String(row.is_dca).toLowerCase() !== 'true')
    .map((row) => {
      const entryAt = Date.parse(row.filled_at);
      const regime = btcImpulseRegime(historicalHealth(btc1h, btc4h, entryAt), entryAt);
      return {
        ...row,
        entryAt,
        regime,
        pnl: finite(row.net_realized_pnl_usdt),
        roe: finite(row.realized_roe_pct),
      };
    }).filter((row) => row.pnl != null && row.roe != null);
}

function actualGrouping(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, values]) => ({
    key,
    n: values.length,
    win: values.filter((row) => row.pnl > 0).length / values.length * 100,
    netPnl: values.reduce((sum, row) => sum + row.pnl, 0),
    avgPnl: mean(values.map((row) => row.pnl)),
    avgRoe: mean(values.map((row) => row.roe)),
    medRoe: median(values.map((row) => row.roe)),
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function actualTable(groups) {
  const header = '| Nhóm lệnh thật | N đóng | WR | Net PnL | PnL TB | AvgROE | Median ROE |\n|---|---:|---:|---:|---:|---:|---:|';
  return [header, ...groups.map((row) => `| ${row.key} | ${row.n} | ${pct(row.win, 1)} | ${number(row.netPnl, 4)} USDT | ${number(row.avgPnl, 4)} USDT | ${pct(row.avgRoe)} | ${pct(row.medRoe)} |`)].join('\n');
}

function table(groups) {
  const header = '| Nhóm | N | WR 1h | Net 1h TB | WR 3h | Net 3h TB | ROE 3h TB (5x) | MFE / MAE 3h | TP / SL / timeout |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|';
  const rows = groups.map((row) => `| ${row.key} | ${row.n} | ${pct(row.win1h, 1)} | ${pct(row.avg1h)} | ${pct(row.win3h, 1)} | ${pct(row.avg3h)} | ${pct(row.avgRoe3h)} | ${pct(row.mfe3h)} / ${pct(row.mae3h)} | ${row.tp} / ${row.sl} / ${row.timeout} |`);
  return [header, ...rows].join('\n');
}

async function main() {
  const signals = await readEvents();
  if (!signals.length) throw new Error('Không có signal phù hợp trong hai event stores.');
  const minAt = Math.min(...signals.map((row) => row.observedAt));
  const maxAt = Math.max(...signals.map((row) => row.observedAt));
  const btcStart = minAt - 40 * 24 * 3600_000;
  const [btc1h, btc4h] = await Promise.all([
    fetchKlines('BTCUSDT', '1h', btcStart, maxAt + 3600_000, 1000),
    fetchKlines('BTCUSDT', '4h', btcStart, maxAt + 4 * 3600_000, 500),
  ]);
  const symbols = [...new Set(signals.map((row) => row.symbol))];
  const klinesBySymbol = new Map();
  const errors = [];
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < symbols.length) {
      const index = cursor;
      cursor += 1;
      const symbol = symbols[index];
      try {
        const rows = await fetchKlines(symbol, '5m', minAt - 10 * 60000, maxAt + 3 * 3600_000 + 10 * 60000, 500);
        klinesBySymbol.set(symbol, rows);
      } catch (error) {
        errors.push(`${symbol}: ${error.message}`);
      }
    }
  });
  await Promise.all(workers);
  const evaluated = [];
  for (const signal of signals) {
    const outcome = outcomeOf(signal, klinesBySymbol.get(signal.symbol) ?? []);
    if (!outcome) continue;
    const health = historicalHealth(btc1h, btc4h, signal.observedAt);
    const regime = btcImpulseRegime(health, signal.observedAt);
    const relation = regime.regime === 'SW_UP' && signal.side === 'LONG'
      || regime.regime === 'SW_DOWN' && signal.side === 'SHORT'
      ? 'THUẬN_BTC'
      : regime.regime === 'SW_UP' && signal.side === 'SHORT'
        || regime.regime === 'SW_DOWN' && signal.side === 'LONG'
        ? 'NGƯỢC_BTC'
        : regime.regime;
    evaluated.push({ signal, health, regime, relation, outcome });
  }
  const byRegimeSideStage = grouping(evaluated, (row) => `${row.regime.regime} · ${row.signal.side} · ${row.signal.stage}`);
  const byRelationSide = grouping(evaluated, (row) => `${row.relation} · ${row.signal.side}`);
  const byStage = grouping(evaluated, (row) => `${row.signal.side} · ${row.signal.stage}`);
  const byCluster = clusterGrouping(evaluated, (row) => `${row.regime.regime} · ${row.signal.side} · ${row.signal.stage}`);
  const actualFills = await actualFillRows(btc1h, btc4h);
  const actualByRegimeSide = actualGrouping(actualFills, (row) => `${row.regime.regime} · ${row.direction}`);
  const missing = signals.length - evaluated.length;
  const note = [
    '# Backtest thử `_IMPULSE` theo BTC regime — 2026-09-27',
    '',
    `- Nguồn signal: event stores đang chạy, từ **${vnTime(minAt)}** đến **${vnTime(maxAt)}** (giờ VN).`,
    `- Signal chọn: LONG \`BUY_IMPULSE\`/\`NO_SELL_CONFIRMATION\`; SHORT \`SELL_IMPULSE\`/\`NO_BUY_CONFIRMATION\`.`,
    `- Mẫu: ${signals.length} signal, đánh giá được ${evaluated.length}, thiếu kline/outcome ${missing}, lỗi symbol ${errors.length}.`,
    `- Entry causal: OPEN nến 5m kế tiếp sau khi signal đóng. Kết quả trừ **${ROUND_TRIP_COST_PCT}%** giá cho phí + trượt giá giả định; ROE quy đổi 5x.`,
    '- Regime dùng BTC 1h/4h **đã đóng trước signal**, cùng công thức EMA8/21 + trend score; bull/bear points dựng lại từ RSI/EMA/pct6h/OBV. Không có lịch sử funding, L/S ratio và macro-shock cooldown nên đây là replay gần đúng, không phải bản sao hoàn toàn của `/api/btc-health` live.',
    '- TP/SL mô phỏng trong 3h: TP +2% giá (= +10% ROE ở 5x); SL LONG -4%, SHORT -6%. Nếu cùng nến chạm cả TP và SL, tính SL trước để tránh thiên lệch đẹp.',
    '',
    '## Theo BTC regime + hướng + stage',
    '',
    table(byRegimeSideStage),
    '',
    '## Thuận/ngược BTC',
    '',
    table(byRelationSide),
    '',
    '## Baseline theo stage',
    '',
    table(byStage),
    '',
    '## Kiểm tra theo cụm thời gian',
    '',
    'Mỗi timestamp nến 5m chỉ tính một cụm bằng lợi nhuận trung bình của các coin phát cùng lúc, giảm bớt việc coi hàng chục coin đồng pha là các mẫu độc lập.',
    '',
    clusterTable(byCluster),
    '',
    '## Đối chiếu lệnh Binance thật đã đóng',
    '',
    `Có ${actualFills.length} lệnh thật đã đóng của hai exact route; regime được dựng lại tại thời điểm fill. Kết quả chịu ảnh hưởng của submit filter, TP/SL và quản lý vị thế thực tế nên không so trực tiếp với mô phỏng giữ 3h.`,
    '',
    actualTable(actualByRegimeSide),
    '',
    '## Giới hạn kết luận',
    '',
    '- Event stores chỉ giữ 500 dòng/phía và hiện phủ chưa tới một ngày; nhiều nhóm regime có thể không xuất hiện hoặc N rất nhỏ.',
    '- Các signal cùng thời điểm/coin có tương quan cao; N không phải số lần thử độc lập hoàn toàn.',
    '- Chỉ dùng kết quả để quyết định có nên forward-test gate mềm. Không dùng để tự tăng vốn hoặc hard-block hướng ngược BTC.',
    errors.length ? `- Lỗi dữ liệu: ${errors.slice(0, 20).join('; ')}` : '- Không có lỗi tải kline theo symbol.',
    '',
  ].join('\n');
  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });
  await fs.writeFile(REPORT_FILE, note, 'utf8');
  console.log(JSON.stringify({
    report: REPORT_FILE,
    signalCount: signals.length,
    evaluatedCount: evaluated.length,
    missing,
    errors: errors.length,
    range: { minAt, maxAt },
    byRegimeSideStage,
    byRelationSide,
    byStage,
    byCluster,
    actualByRegimeSide,
  }, null, 2));
}

await main();
