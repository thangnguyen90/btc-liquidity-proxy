import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.join(rootDir, 'data', 'shakeout-paper-trades.json');

function arg(name, fallback = null) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setupOf(trade) {
  return String(trade.shakeoutCombo ?? trade.subtype ?? trade.signalType ?? 'NO_SETUP')
    .split('|')[0].trim().toUpperCase();
}

function patternName(value) {
  const name = typeof value === 'object' && value ? value.name : value;
  return String(name ?? 'NO_DATA').trim().toUpperCase() || 'NO_DATA';
}

function altCandleOf(trade) {
  return patternName(trade.candlePattern5m ?? trade.candlePatternAtEntry);
}

function btcCandleOf(trade) {
  return patternName(trade.btcCandlePattern5m ?? trade.btcCandlePatternAtEntry);
}

function comboRootOf(trade) {
  const saved = String(trade.shakeoutCombo ?? '').trim();
  return saved || `${setupOf(trade)} | ${String(trade.side ?? 'NO_SIDE').toUpperCase()}`;
}

function entryMs(trade) {
  return Date.parse(trade.openedAt ?? trade.createdAt ?? '');
}

function closeMs(trade) {
  return Date.parse(trade.closedAt ?? '');
}

function utcCloseDay(trade) {
  return Number.isFinite(closeMs(trade)) ? new Date(closeMs(trade)).toISOString().slice(0, 10) : 'NO_DATE';
}

function storedBtcRegimeOf(trade) {
  return String(trade.btcRegimeAtEntry ?? trade.btcRegime ?? trade.btcHealth?.regime ?? 'NO_DATA').toUpperCase();
}

function sidewayDirectionOf(trade) {
  const regime = storedBtcRegimeOf(trade);
  if (regime.includes('UP')) return 'SW_UP';
  if (regime.includes('DOWN') || regime === 'WEAK') return 'SW_DOWN';
  const direction = String(trade.btcTrendDir ?? trade.btcHealth?.btcTrendDir ?? '').toUpperCase();
  if (direction === 'UP') return 'SW_UP';
  if (direction === 'DOWN') return 'SW_DOWN';
  return regime === 'FLAT' ? 'SW_FLAT' : 'SW_NO_DATA';
}

function estimatedFee(trade, feeRate) {
  const entry = Number(trade.entryPrice);
  const exit = Number(trade.exitPrice ?? trade.markPrice);
  const savedQty = Math.abs(Number(trade.originalQuantity ?? trade.quantity));
  const margin = Number(trade.marginUsdt);
  const leverage = Number(trade.leverage);
  const inferredQty = Number.isFinite(margin) && margin > 0 && Number.isFinite(leverage) && leverage > 0
    && Number.isFinite(entry) && entry > 0 ? margin * leverage / entry : NaN;
  const quantity = Number.isFinite(savedQty) && savedQty > 0 ? savedQty : inferredQty;
  if (![entry, exit, quantity].every(Number.isFinite) || entry <= 0 || exit <= 0 || quantity <= 0) return 0;
  return (entry * quantity + exit * quantity) * feeRate;
}

function summarize(rows, feeRate) {
  const values = rows.map((trade) => {
    const pnl = num(trade.pnl);
    const fee = estimatedFee(trade, feeRate);
    return { trade, pnl, fee, net: pnl - fee, roe: num(trade.roe), margin: num(trade.marginUsdt) };
  });
  const wins = values.filter((row) => row.pnl > 0);
  const losses = values.filter((row) => row.pnl < 0);
  const flats = values.filter((row) => row.pnl === 0);
  const winPnl = wins.reduce((sum, row) => sum + row.pnl, 0);
  const lossPnl = losses.reduce((sum, row) => sum + row.pnl, 0);
  const grossPnl = winPnl + lossPnl;
  const fee = values.reduce((sum, row) => sum + row.fee, 0);
  return {
    n: rows.length,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    wr: wins.length + losses.length ? wins.length / (wins.length + losses.length) * 100 : 0,
    winPnl,
    lossPnl,
    grossPnl,
    fee,
    netPnl: grossPnl - fee,
    avgWin: wins.length ? winPnl / wins.length : 0,
    avgLoss: losses.length ? lossPnl / losses.length : 0,
    payoff: wins.length && losses.length ? (winPnl / wins.length) / Math.abs(lossPnl / losses.length) : 0,
    pf: lossPnl < 0 ? winPnl / Math.abs(lossPnl) : winPnl > 0 ? 99 : 0,
    avgWinRoe: wins.length ? wins.reduce((sum, row) => sum + row.roe, 0) / wins.length : 0,
    avgLossRoe: losses.length ? losses.reduce((sum, row) => sum + row.roe, 0) / losses.length : 0,
    avgWinMargin: wins.length ? wins.reduce((sum, row) => sum + row.margin, 0) / wins.length : 0,
    avgLossMargin: losses.length ? losses.reduce((sum, row) => sum + row.margin, 0) / losses.length : 0,
    tp: rows.filter((trade) => String(trade.outcome ?? '').toUpperCase().includes('TP')).length,
    sl: rows.filter((trade) => String(trade.outcome ?? '').toUpperCase().includes('SL')).length,
  };
}

function byGroup(rows, keyFn, feeRate) {
  const groups = new Map();
  for (const trade of rows) {
    const key = keyFn(trade);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trade);
  }
  return [...groups.entries()].map(([group, list]) => ({ group, ...summarize(list, feeRate) }));
}

function compact(row) {
  return {
    group: row.group,
    N: row.n,
    'W/L/F': `${row.wins}/${row.losses}/${row.flats}`,
    WR: `${row.wr.toFixed(1)}%`,
    'Win PnL': row.winPnl.toFixed(3),
    'Loss PnL': row.lossPnl.toFixed(3),
    'Gross PnL': row.grossPnl.toFixed(3),
    Fee: `-${row.fee.toFixed(3)}`,
    'Net PnL': row.netPnl.toFixed(3),
    'Avg W/L': `${row.avgWin.toFixed(3)}/${row.avgLoss.toFixed(3)}`,
    Payoff: row.payoff.toFixed(2),
    PF: row.pf.toFixed(2),
    'TP/SL': `${row.tp}/${row.sl}`,
  };
}

const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
const allTrades = (Array.isArray(raw) ? raw : raw.trades ?? []).filter((trade) => trade.status === 'CLOSED');
const includeChase = process.argv.includes('--include-chase');
const unique = new Map();
for (const trade of allTrades.filter((row) => includeChase || String(row.variant ?? '').toUpperCase() !== 'CHASE')) {
  const key = `${trade.signalId ?? trade.id}|${trade.variant ?? 'NO_VARIANT'}`;
  const prior = unique.get(key);
  if (!prior || entryMs(trade) > entryMs(prior)) unique.set(key, trade);
}

const utcDay = String(arg('--date', new Date().toISOString().slice(0, 10)));
const days = Math.max(1, Math.trunc(num(arg('--days', 1), 1)));
const endDayMs = Date.parse(`${utcDay}T00:00:00.000Z`);
const fromMs = endDayMs - (days - 1) * 24 * 3600_000;
const toMs = endDayMs + 24 * 3600_000;
const feeRate = Math.max(0, num(arg('--fee-rate', process.env.BINANCE_FUTURES_TAKER_FEE_RATE ?? 0.0004), 0.0004));
const rows = [...unique.values()];
const openedToday = rows.filter((trade) => entryMs(trade) >= fromMs && entryMs(trade) < toMs);
const closedToday = rows.filter((trade) => closeMs(trade) >= fromMs && closeMs(trade) < toMs);
const utcEntryHour = (trade) => `${String(new Date(entryMs(trade)).getUTCHours()).padStart(2, '0')}:00`;
const utcCloseHour = (trade) => `${String(new Date(closeMs(trade)).getUTCHours()).padStart(2, '0')}:00`;

const detail = (trade) => ({
  symbol: trade.symbol,
  side: trade.side,
  setup: setupOf(trade),
  variant: trade.variant ?? 'NO_VARIANT',
  margin: num(trade.marginUsdt).toFixed(2),
  leverage: num(trade.leverage),
  pnl: num(trade.pnl).toFixed(3),
  roe: `${num(trade.roe).toFixed(2)}%`,
  outcome: trade.outcome,
  entryUtc: Number.isFinite(entryMs(trade)) ? new Date(entryMs(trade)).toISOString() : null,
  closeUtc: Number.isFinite(closeMs(trade)) ? new Date(closeMs(trade)).toISOString() : null,
});

const output = {
  utcDay,
  days,
  fromUtc: new Date(fromMs).toISOString(),
  toExclusiveUtc: new Date(toMs).toISOString(),
  feeRate,
  chase: includeChase ? 'INCLUDED' : 'EXCLUDED',
  byEntryDay: {
    total: compact({ group: 'OPENED_TODAY_UTC', ...summarize(openedToday, feeRate) }),
    byHour: byGroup(openedToday, utcEntryHour, feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    bySetup: byGroup(openedToday, setupOf, feeRate).sort((a, b) => b.grossPnl - a.grossPnl).map(compact),
    biggestWins: [...openedToday].sort((a, b) => num(b.pnl) - num(a.pnl)).slice(0, 10).map(detail),
    biggestLosses: [...openedToday].sort((a, b) => num(a.pnl) - num(b.pnl)).slice(0, 10).map(detail),
  },
  byCloseDay: {
    total: compact({ group: 'CLOSED_TODAY_UTC', ...summarize(closedToday, feeRate) }),
    byHour: byGroup(closedToday, utcCloseHour, feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    bySetup: byGroup(closedToday, setupOf, feeRate).sort((a, b) => b.grossPnl - a.grossPnl).map(compact),
    byCandlePair: byGroup(closedToday, (trade) => (
      `ALT_${altCandleOf(trade)} | BTC_${btcCandleOf(trade)}`
    ), feeRate).sort((a, b) => b.n - a.n || b.grossPnl - a.grossPnl).map(compact),
    bySideAltCandle: byGroup(closedToday, (trade) => (
      `${String(trade.side ?? 'NO_SIDE').toUpperCase()} | ALT_${altCandleOf(trade)}`
    ), feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    bySideBtcCandle: byGroup(closedToday, (trade) => (
      `${String(trade.side ?? 'NO_SIDE').toUpperCase()} | BTC_${btcCandleOf(trade)}`
    ), feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    bySideCandlePair: byGroup(closedToday, (trade) => (
      `${String(trade.side ?? 'NO_SIDE').toUpperCase()}`
      + ` | ALT_${altCandleOf(trade)} | BTC_${btcCandleOf(trade)}`
    ), feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    byUtcDay: byGroup(closedToday, utcCloseDay, feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    byDaySide: byGroup(closedToday, (trade) => (
      `${utcCloseDay(trade)} | ${String(trade.side ?? 'NO_SIDE').toUpperCase()}`
    ), feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    byDayStoredRegimeSide: byGroup(closedToday, (trade) => (
      `${utcCloseDay(trade)} | ${sidewayDirectionOf(trade)} | RAW_${storedBtcRegimeOf(trade)}`
      + ` | ${String(trade.side ?? 'NO_SIDE').toUpperCase()}`
    ), feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    byDaySideAltCandle: byGroup(closedToday, (trade) => (
      `${utcCloseDay(trade)} | ${String(trade.side ?? 'NO_SIDE').toUpperCase()} | ALT_${altCandleOf(trade)}`
    ), feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    byDaySideBtcCandle: byGroup(closedToday, (trade) => (
      `${utcCloseDay(trade)} | ${String(trade.side ?? 'NO_SIDE').toUpperCase()} | BTC_${btcCandleOf(trade)}`
    ), feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    bySetupCandlePair: byGroup(closedToday, (trade) => (
      `${setupOf(trade)} | ${String(trade.side ?? 'NO_SIDE').toUpperCase()}`
      + ` | ALT_${altCandleOf(trade)} | BTC_${btcCandleOf(trade)}`
    ), feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
    byComboCandlePair: byGroup(closedToday, (trade) => (
      `${comboRootOf(trade)} | ALT_${altCandleOf(trade)} | BTC_${btcCandleOf(trade)}`
    ), feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
  },
};

const finalOutput = process.argv.includes('--sides-only') ? {
  utcDay: output.utcDay,
  days: output.days,
  fromUtc: output.fromUtc,
  toExclusiveUtc: output.toExclusiveUtc,
  chase: output.chase,
  total: output.byCloseDay.total,
  bySideAltCandle: output.byCloseDay.bySideAltCandle,
  bySideBtcCandle: output.byCloseDay.bySideBtcCandle,
  bySideCandlePair: output.byCloseDay.bySideCandlePair,
} : process.argv.includes('--regime-only') ? {
  utcDay: output.utcDay,
  days: output.days,
  fromUtc: output.fromUtc,
  toExclusiveUtc: output.toExclusiveUtc,
  chase: output.chase,
  total: output.byCloseDay.total,
  byUtcDay: output.byCloseDay.byUtcDay,
  byDaySide: output.byCloseDay.byDaySide,
  byDayStoredRegimeSide: output.byCloseDay.byDayStoredRegimeSide,
  byDaySideAltCandle: output.byCloseDay.byDaySideAltCandle,
  byDaySideBtcCandle: output.byCloseDay.byDaySideBtcCandle,
} : process.argv.includes('--candles-only') ? {
  utcDay: output.utcDay,
  days: output.days,
  fromUtc: output.fromUtc,
  toExclusiveUtc: output.toExclusiveUtc,
  chase: output.chase,
  total: output.byCloseDay.total,
  byCandlePair: output.byCloseDay.byCandlePair,
  bySideAltCandle: output.byCloseDay.bySideAltCandle,
  bySideBtcCandle: output.byCloseDay.bySideBtcCandle,
  bySideCandlePair: output.byCloseDay.bySideCandlePair,
  bySetupCandlePair: output.byCloseDay.bySetupCandlePair,
  byComboCandlePair: output.byCloseDay.byComboCandlePair,
} : output;

console.log(JSON.stringify(finalOutput, null, 2));
