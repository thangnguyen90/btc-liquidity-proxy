import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_STORE_FILES = [
  'data/pump-paper-trades.json',
  'data/shakeout-paper-trades.json',
  'data/top-reversal-paper-trades.json',
  'data/cap-paper-trades.json',
  'data/edge-paper-trades.json',
  'data/liquid-paper-trades.json',
  'data/ppks-paper-trades.json',
  'data/di-paper-trades.json',
  'data/pi-paper-trades.json',
  'data/sr-paper-trades.json',
].map((p) => path.join(ROOT, p));

function loadDotEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] != null) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
  }
}

function getArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function utcDateString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function defaultReportDate() {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return utcDateString(todayUtc - 24 * 60 * 60 * 1000);
}

function parseDateRange(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid --date "${dateStr}". Use YYYY-MM-DD UTC.`);
  }
  const start = Date.parse(`${dateStr}T00:00:00.000Z`);
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function readJsonSafe(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`[daily-pnl] skip ${path.relative(ROOT, file)}: ${err.message}`);
    return null;
  }
}

function rowsFromStore(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.trades)) return raw.trades;
  if (Array.isArray(raw?.rows)) return raw.rows;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function tradeClosedAt(t) {
  const ts = Date.parse(t.closedAt ?? t.exitAt ?? t.updatedAt ?? 0);
  return Number.isFinite(ts) ? ts : null;
}

function classifyStore(file) {
  const base = path.basename(file).replace(/-paper-trades\.json$/, '');
  return base || path.basename(file);
}

function classifySignal(t, storeName) {
  const src = String(t.source ?? '');
  if (src.includes('br_like_short')) return 'EMA BR-like Short';
  if (src.includes('br_like')) return 'EMA BR-like';
  if (src.startsWith('emasq-')) return 'EMA Squeeze';
  if (storeName === 'shakeout') return 'Shakeout Reclaim';
  if (storeName === 'top-reversal') return 'Top Reversal';
  if (storeName === 'cap') return 'Capitulation';
  if (storeName === 'edge') return 'Edge';
  if (storeName === 'liquid') return 'Liquidity';
  if (storeName === 'ppks') return 'PPKS';
  return storeName;
}

function estimateFeeUsdt(t, feeRate) {
  const explicit = num(t.feeUsdt ?? t.fee ?? t.commission ?? t.commissionUsdt);
  if (explicit != null) return Math.abs(explicit);

  const qty = num(t.quantity ?? t.qty ?? t.size);
  const entry = num(t.entryPrice ?? t.entry ?? t.fillPrice);
  const exit = num(t.exitPrice ?? t.closePrice ?? t.markPrice);
  if (qty != null && entry != null && exit != null) {
    return (Math.abs(qty * entry) + Math.abs(qty * exit)) * feeRate;
  }

  const margin = num(t.marginUsdt ?? t.margin ?? t.notionalMargin);
  const leverage = num(t.leverage, 1);
  if (margin != null && leverage != null) {
    return Math.abs(margin * leverage) * 2 * feeRate;
  }
  return 0;
}

function summarize(rows, feeRate) {
  const grossPnl = rows.reduce((s, r) => s + r.grossPnl, 0);
  const fee = rows.reduce((s, r) => s + r.feeUsdt, 0);
  const netPnl = grossPnl - fee;
  const winsGross = rows.filter((r) => r.grossPnl > 0).length;
  const winsNet = rows.filter((r) => r.netPnl > 0).length;
  const lossesGross = rows.filter((r) => r.grossPnl < 0).length;
  const lossesNet = rows.filter((r) => r.netPnl < 0).length;
  const avgRoe = rows.length
    ? rows.reduce((s, r) => s + (r.roe ?? 0), 0) / rows.length
    : 0;
  return {
    trades: rows.length,
    winsGross,
    lossesGross,
    winRateGross: rows.length ? winsGross / rows.length * 100 : 0,
    winsNet,
    lossesNet,
    winRateNet: rows.length ? winsNet / rows.length * 100 : 0,
    grossPnl,
    fee,
    netPnl,
    avgRoe,
    feeRate,
  };
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, ...summarize(list, 0) }))
    .sort((a, b) => b.netPnl - a.netPnl);
}

function fmt(n, digits = 3) {
  const v = Number(n) || 0;
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
}

function pct(n) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function writeCsv(file, rows) {
  const cols = [
    'closedAt', 'store', 'signalType', 'symbol', 'side', 'status', 'outcome',
    'source', 'marginUsdt', 'leverage', 'entryPrice', 'exitPrice', 'quantity',
    'grossPnl', 'feeUsdt', 'netPnl', 'roe',
  ];
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(cols.map((c) => csvCell(r[c])).join(','));
  }
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function main() {
  loadDotEnv();
  const date = getArg('--date', defaultReportDate());
  const { start, end } = parseDateRange(date);
  const feeRate = num(
    getArg('--fee-rate', process.env.BINANCE_FUTURES_TAKER_FEE_RATE ?? process.env.BINANCE_FEE_RATE ?? '0.0004'),
    0.0004,
  );
  const outDir = path.resolve(ROOT, getArg('--out', 'reports/daily-pnl'));
  const only = getArg('--only', 'all').toLowerCase();
  const filesArg = getArg('--files', null);
  const files = filesArg
    ? filesArg.split(',').map((p) => path.resolve(ROOT, p.trim())).filter(Boolean)
    : DEFAULT_STORE_FILES;

  const rows = [];
  for (const file of files) {
    const raw = readJsonSafe(file);
    if (!raw) continue;
    const store = classifyStore(file);
    for (const t of rowsFromStore(raw)) {
      if (String(t.status ?? '').toUpperCase() !== 'CLOSED') continue;
      const closedTs = tradeClosedAt(t);
      if (closedTs == null || closedTs < start || closedTs >= end) continue;
      const signalType = classifySignal(t, store);
      if (only !== 'all' && !signalType.toLowerCase().includes(only) && store.toLowerCase() !== only) continue;
      const grossPnl = num(t.pnl, 0);
      const feeUsdt = estimateFeeUsdt(t, feeRate);
      rows.push({
        closedAt: new Date(closedTs).toISOString(),
        store,
        signalType,
        symbol: t.symbol ?? '',
        side: t.side ?? '',
        status: t.status ?? '',
        outcome: t.outcome ?? '',
        source: t.source ?? '',
        marginUsdt: num(t.marginUsdt ?? t.margin, ''),
        leverage: num(t.leverage, ''),
        entryPrice: num(t.entryPrice ?? t.entry ?? t.fillPrice, ''),
        exitPrice: num(t.exitPrice ?? t.closePrice, ''),
        quantity: num(t.quantity ?? t.qty, ''),
        grossPnl,
        feeUsdt,
        netPnl: grossPnl - feeUsdt,
        roe: num(t.roe, 0),
      });
    }
  }

  rows.sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt));
  const summary = summarize(rows, feeRate);
  const bySignal = groupBy(rows, (r) => r.signalType);
  const bySide = groupBy(rows, (r) => r.side || '-');
  const byOutcome = groupBy(rows, (r) => r.outcome || '-');

  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `${date}-pnl`);
  writeCsv(`${base}.csv`, rows);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ date, utcStart: new Date(start).toISOString(), utcEnd: new Date(end).toISOString(), summary, bySignal, bySide, byOutcome, trades: rows }, null, 2));

  const text = [
    `Daily PnL UTC ${date}`,
    `Fee rate per side: ${(feeRate * 100).toFixed(4)}%`,
    `Trades: ${summary.trades}`,
    `Gross PnL: ${fmt(summary.grossPnl)}`,
    `Estimated Binance fee: ${summary.fee.toFixed(3)}`,
    `Net PnL after fee: ${fmt(summary.netPnl)}`,
    `WR gross/net: ${pct(summary.winRateGross)} / ${pct(summary.winRateNet)}`,
    `Avg ROE gross: ${fmt(summary.avgRoe, 2)}%`,
    '',
    'By signal:',
    ...bySignal.map((r) => `- ${r.name}: ${r.trades} trades | net ${fmt(r.netPnl)} | gross ${fmt(r.grossPnl)} | fee ${r.fee.toFixed(3)} | WR net ${pct(r.winRateNet)}`),
    '',
    'By side:',
    ...bySide.map((r) => `- ${r.name}: ${r.trades} trades | net ${fmt(r.netPnl)} | gross ${fmt(r.grossPnl)} | fee ${r.fee.toFixed(3)} | WR net ${pct(r.winRateNet)}`),
    '',
    'By outcome:',
    ...byOutcome.map((r) => `- ${r.name}: ${r.trades} trades | net ${fmt(r.netPnl)} | gross ${fmt(r.grossPnl)} | fee ${r.fee.toFixed(3)}`),
    '',
    `CSV: ${path.relative(ROOT, `${base}.csv`)}`,
    `JSON: ${path.relative(ROOT, `${base}.json`)}`,
  ].join('\n');
  fs.writeFileSync(`${base}.txt`, `${text}\n`);
  console.log(text);

  if (hasArg('--fail-if-negative') && summary.netPnl < 0) process.exitCode = 2;
}

main();
