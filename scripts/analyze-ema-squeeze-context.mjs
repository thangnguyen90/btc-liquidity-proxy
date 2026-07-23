import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storePath = path.join(rootDir, 'data', 'pump-paper-trades.json');

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

function patternName(value) {
  const name = typeof value === 'object' && value ? value.name : value;
  return String(name ?? 'NO_DATA').trim().toUpperCase() || 'NO_DATA';
}

function altCandleOf(trade) {
  return patternName(trade.candlePatternAtEntry ?? trade.candlePattern5m ?? trade.candlePattern15m);
}

function btcCandleOf(trade) {
  return patternName(trade.btcCandlePatternAtEntry ?? trade.btcCandlePattern5m);
}

function candleBiasOf(value) {
  const candle = patternName(value);
  if (candle.includes('BEARISH') || candle === 'SHOOTING_STAR') return 'BEARISH';
  if (candle.includes('BULLISH') || candle === 'HAMMER') return 'BULLISH';
  return 'NEUTRAL';
}

function entryMs(trade) {
  return Date.parse(trade.openedAt ?? trade.createdAt ?? '');
}

function closeMs(trade) {
  return Date.parse(trade.closedAt ?? '');
}

function isEmaPaper(trade) {
  return /^emasq-/i.test(String(trade.source ?? ''));
}

function timeframeOf(trade) {
  const source = String(trade.source ?? '');
  return String(source.match(/^emasq-(\d+[mh])-/i)?.[1]
    ?? trade.candlePatternTimeframe
    ?? trade.timeframe
    ?? 'NO_TF').toLowerCase();
}

function stageOf(trade) {
  const text = String(trade.source ?? trade.signalType ?? '').toUpperCase();
  if (text.includes('RUNNER')) return trade.side === 'SHORT' ? 'RUNNER_SHORT' : 'RUNNER_LONG';
  if (text.includes('PRE_BREAKDOWN')) return 'PRE_BREAKDOWN';
  if (text.includes('PRE_BREAKOUT')) return 'PRE_BREAKOUT';
  if (text.includes('SQUEEZE_SHORT')) return 'SQUEEZE_SHORT';
  if (text.includes('BR_LIKE_SHORT')) return 'BR_LIKE_SHORT';
  if (text.includes('BR_LIKE')) return 'BR_LIKE_LONG';
  if (text.includes('BREAKDOWN')) return 'BREAKDOWN';
  if (text.includes('BREAKOUT')) return 'BREAKOUT';
  if (text.includes('SQUEEZE')) return 'SQUEEZE_LONG';
  return 'EMA_OTHER';
}

function scoreOf(trade) {
  const values = String(trade.source ?? '').match(/-(\d+)(?:-mkt)?$/i);
  return num(values?.[1], NaN);
}

function scoreBucketOf(trade) {
  const score = scoreOf(trade);
  if (!Number.isFinite(score)) return 'SCORE_NO_DATA';
  if (score >= 90) return 'SCORE_90_PLUS';
  if (score >= 80) return 'SCORE_80_89';
  if (score >= 70) return 'SCORE_70_79';
  if (score >= 60) return 'SCORE_60_69';
  return 'SCORE_LT_60';
}

function storedBtcRegimeOf(trade) {
  return String(trade.btcRegimeAtEntry ?? trade.btcRegime ?? trade.btcHealth?.regime ?? 'NO_DATA').toUpperCase();
}

function btcDirectionOf(trade) {
  const direct = String(trade.btcTrendDir ?? trade.btcHealth?.btcTrendDir ?? '').toUpperCase();
  if (direct === 'UP' || direct === 'DOWN') return direct;
  const pct6h = Number(trade.btcPct6hAtEntry ?? trade.btcHealth?.pct6h);
  if (Number.isFinite(pct6h)) return pct6h > 0.15 ? 'UP' : pct6h < -0.15 ? 'DOWN' : 'FLAT';
  return 'NO_DATA';
}

function sidewayDirectionOf(trade) {
  const regime = storedBtcRegimeOf(trade);
  if (regime.includes('UP')) return 'SW_UP';
  if (regime.includes('DOWN')) return 'SW_DOWN';
  const direction = btcDirectionOf(trade);
  if (direction === 'UP') return 'SW_UP';
  if (direction === 'DOWN' || regime === 'WEAK') return 'SW_DOWN';
  return direction === 'FLAT' || regime === 'FLAT' ? 'SW_FLAT' : 'SW_NO_DATA';
}

function sideBtcLabelOf(trade) {
  const regime = sidewayDirectionOf(trade);
  const side = String(trade.side ?? 'NO_SIDE').toUpperCase();
  const candle = btcCandleOf(trade);
  const bearish = candle.includes('BEARISH') || candle === 'SHOOTING_STAR';
  const bullish = candle.includes('BULLISH') || candle === 'HAMMER';
  if (regime === 'SW_DOWN' && side === 'LONG' && bearish) return 'RISK';
  if (regime === 'SW_DOWN' && side === 'SHORT' && bearish) return 'GOOD';
  if (regime === 'SW_UP' && side === 'SHORT' && bullish) return 'RISK';
  if (regime === 'SW_UP' && side === 'LONG' && bullish) return 'GOOD';
  return 'WATCH';
}

function btcPhaseOf(trade) {
  const direction = btcDirectionOf(trade);
  const score = Number(trade.btcTrendScore ?? trade.btcHealth?.btcTrendScore);
  const strength = !Number.isFinite(score) ? 'NO_SCORE' : score < 45 ? 'WEAK' : score < 65 ? 'MID' : 'STRONG';
  return `BTC_${direction}_${strength}`;
}

function marginBucketOf(trade) {
  const margin = Number(trade.marginUsdt);
  if (!Number.isFinite(margin)) return 'SIZE_NO_DATA';
  if (margin > 0 && margin <= 1.01) return 'TEST_$1';
  if (margin >= 9.5 && margin <= 10.5) return 'FULL_$10';
  return `SIZE_$${margin}`;
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
    return { trade, pnl, fee, net: pnl - fee, roe: num(trade.roe) };
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
    avgRoe: values.length ? values.reduce((sum, row) => sum + row.roe, 0) / values.length : 0,
    avgWin: wins.length ? winPnl / wins.length : 0,
    avgLoss: losses.length ? lossPnl / losses.length : 0,
    payoff: wins.length && losses.length ? (winPnl / wins.length) / Math.abs(lossPnl / losses.length) : 0,
    pf: lossPnl < 0 ? winPnl / Math.abs(lossPnl) : winPnl > 0 ? 99 : 0,
    tp: rows.filter((trade) => String(trade.outcome ?? '').toUpperCase().includes('TP')).length,
    sl: rows.filter((trade) => String(trade.outcome ?? '').toUpperCase().includes('SL')).length,
  };
}

function byGroup(rows, keyFn, feeRate, min = 1) {
  const groups = new Map();
  for (const trade of rows) {
    const key = keyFn(trade);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trade);
  }
  return [...groups.entries()]
    .map(([group, list]) => ({ group, ...summarize(list, feeRate) }))
    .filter((row) => row.n >= min);
}

function compact(row) {
  return {
    group: row.group,
    N: row.n,
    'W/L/F': `${row.wins}/${row.losses}/${row.flats}`,
    WR: `${row.wr.toFixed(1)}%`,
    AvgROE: `${row.avgRoe >= 0 ? '+' : ''}${row.avgRoe.toFixed(2)}%`,
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
const allTrades = (Array.isArray(raw) ? raw : raw.trades ?? [])
  .filter((trade) => trade.status === 'CLOSED' && isEmaPaper(trade));
const unique = new Map();
for (const trade of allTrades) {
  const key = `${trade.signalId ?? trade.id}|${trade.variant ?? 'NO_VARIANT'}`;
  const prior = unique.get(key);
  if (!prior || entryMs(trade) > entryMs(prior)) unique.set(key, trade);
}

const toDay = String(arg('--to', new Date().toISOString().slice(0, 10)));
const days = Math.max(1, Math.trunc(num(arg('--days', 2), 2)));
const endDayMs = Date.parse(`${toDay}T00:00:00.000Z`);
const requestedFrom = arg('--from', '');
const parsedFrom = requestedFrom ? Date.parse(requestedFrom) : NaN;
const fromMs = Number.isFinite(parsedFrom) ? parsedFrom : endDayMs - (days - 1) * 24 * 3600_000;
const toMs = endDayMs + 24 * 3600_000;
const feeRate = Math.max(0, num(arg('--fee-rate', process.env.BINANCE_FUTURES_TAKER_FEE_RATE ?? 0.0004), 0.0004));
const minGroup = Math.max(1, Math.trunc(num(arg('--min-group', 1), 1)));
const requestedStages = String(arg('--stage', '')).split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const rows = [...unique.values()].filter((trade) => {
  const time = entryMs(trade);
  return Number.isFinite(time) && time >= fromMs && time < toMs;
}).filter((trade) => !requestedStages.length || requestedStages.includes(stageOf(trade)));

const utcDay = (trade) => new Date(entryMs(trade)).toISOString().slice(0, 10);
const utcHour = (trade) => `${String(new Date(entryMs(trade)).getUTCHours()).padStart(2, '0')}:00`;
const bangkokHour = (trade) => `${String((new Date(entryMs(trade)).getUTCHours() + 7) % 24).padStart(2, '0')}:00 VN`;
const side = (trade) => String(trade.side ?? 'NO_SIDE').toUpperCase();

const output = {
  toDay,
  days,
  fromUtc: new Date(fromMs).toISOString(),
  toExclusiveUtc: new Date(toMs).toISOString(),
  feeRate,
  scope: 'CLOSED native EMA paper only; source=emasq-*; dedup=signalId+variant; Decision/Recommended clones excluded',
  total: compact({ group: 'EMA_SQUEEZE_PAGE', ...summarize(rows, feeRate) }),
  byUtcDay: byGroup(rows, utcDay, feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
  byStage: byGroup(rows, stageOf, feeRate).sort((a, b) => b.n - a.n).map(compact),
  bySide: byGroup(rows, side, feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
  byStageSide: byGroup(rows, (trade) => `${stageOf(trade)} | ${side(trade)}`, feeRate)
    .sort((a, b) => b.n - a.n).map(compact),
  byTimeframe: byGroup(rows, timeframeOf, feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
  byStageTimeframe: byGroup(rows, (trade) => `${stageOf(trade)} | ${timeframeOf(trade)}`, feeRate)
    .sort((a, b) => b.n - a.n).map(compact),
  byMargin: byGroup(rows, marginBucketOf, feeRate).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
  byBangkokHour: byGroup(rows, bangkokHour, feeRate, minGroup).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
  byUtcHour: byGroup(rows, utcHour, feeRate, minGroup).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
  byDayRegimeSide: byGroup(rows, (trade) => (
    `${utcDay(trade)} | ${sidewayDirectionOf(trade)} | ${btcPhaseOf(trade)} | ${side(trade)}`
  ), feeRate, minGroup).sort((a, b) => a.group.localeCompare(b.group)).map(compact),
  byStageRegimeSide: byGroup(rows, (trade) => (
    `${stageOf(trade)} | ${sidewayDirectionOf(trade)} | ${btcPhaseOf(trade)} | ${side(trade)}`
  ), feeRate, minGroup).sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byStageSideBtcLabel: byGroup(rows, (trade) => (
    `${stageOf(trade)} | ${side(trade)} | ${sideBtcLabelOf(trade)}`
  ), feeRate, minGroup).sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byStageSideBtcLabelTimeframe: byGroup(rows, (trade) => (
    `${stageOf(trade)} | ${side(trade)} | ${sideBtcLabelOf(trade)} | ${timeframeOf(trade)}`
  ), feeRate, minGroup).sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byStageSideBtcLabelHour: byGroup(rows, (trade) => (
    `${stageOf(trade)} | ${side(trade)} | ${sideBtcLabelOf(trade)} | ${bangkokHour(trade)}`
  ), feeRate, minGroup).sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byStageSideBtcLabelCandle: byGroup(rows, (trade) => (
    `${stageOf(trade)} | ${side(trade)} | ${sideBtcLabelOf(trade)} | BTC_${btcCandleOf(trade)}`
  ), feeRate, minGroup).sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  bySideAltCandle: byGroup(rows, (trade) => `${side(trade)} | ALT_${altCandleOf(trade)}`, feeRate, minGroup)
    .sort((a, b) => b.n - a.n).map(compact),
  bySideBtcCandle: byGroup(rows, (trade) => `${side(trade)} | BTC_${btcCandleOf(trade)}`, feeRate, minGroup)
    .sort((a, b) => b.n - a.n).map(compact),
  byStageSideCandlePair: byGroup(rows, (trade) => (
    `${stageOf(trade)} | ${side(trade)} | ALT_${altCandleOf(trade)} | BTC_${btcCandleOf(trade)}`
  ), feeRate, minGroup).sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byStageTimeframeCandleBiasPair: byGroup(rows, (trade) => (
    `${stageOf(trade)} | ${timeframeOf(trade)} | ${side(trade)}`
    + ` | ALT_${candleBiasOf(altCandleOf(trade))} | BTC_${candleBiasOf(btcCandleOf(trade))}`
  ), feeRate, minGroup).sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byStageTimeframeRegimeCandleBiasPair: byGroup(rows, (trade) => (
    `${stageOf(trade)} | ${timeframeOf(trade)} | ${side(trade)} | ${sidewayDirectionOf(trade)}`
    + ` | ALT_${candleBiasOf(altCandleOf(trade))} | BTC_${candleBiasOf(btcCandleOf(trade))}`
  ), feeRate, minGroup).sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byStageTimeframeExactCandlePair: byGroup(rows, (trade) => (
    `${stageOf(trade)} | ${timeframeOf(trade)} | ${side(trade)}`
    + ` | ALT_${altCandleOf(trade)} | BTC_${btcCandleOf(trade)}`
  ), feeRate, minGroup).sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byStageRegimeCandlePair: byGroup(rows, (trade) => (
    `${stageOf(trade)} | ${side(trade)} | ${sidewayDirectionOf(trade)} | ${btcPhaseOf(trade)}`
    + ` | ALT_${altCandleOf(trade)} | BTC_${btcCandleOf(trade)}`
  ), feeRate, minGroup).sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byScore: byGroup(rows, (trade) => `${stageOf(trade)} | ${scoreBucketOf(trade)}`, feeRate, minGroup)
    .sort((a, b) => b.n - a.n).map(compact),
};

const finalOutput = process.argv.includes('--focus') ? {
  toDay: output.toDay,
  days: output.days,
  fromUtc: output.fromUtc,
  toExclusiveUtc: output.toExclusiveUtc,
  feeRate: output.feeRate,
  scope: output.scope,
  requestedStages,
  total: output.total,
  byUtcDay: output.byUtcDay,
  byStage: output.byStage,
  bySide: output.bySide,
  byTimeframe: output.byTimeframe,
  byStageTimeframe: output.byStageTimeframe,
  byMargin: output.byMargin,
  byBangkokHour: output.byBangkokHour,
  byDayRegimeSide: output.byDayRegimeSide,
  byStageRegimeSide: output.byStageRegimeSide,
  byStageSideBtcLabel: output.byStageSideBtcLabel,
  byStageSideBtcLabelTimeframe: output.byStageSideBtcLabelTimeframe,
  byStageSideBtcLabelHour: output.byStageSideBtcLabelHour,
  byStageSideBtcLabelCandle: output.byStageSideBtcLabelCandle,
  bySideAltCandle: output.bySideAltCandle,
  bySideBtcCandle: output.bySideBtcCandle,
  byStageSideCandlePair: output.byStageSideCandlePair,
  byScore: output.byScore,
} : output;

const labelsOnlyOutput = {
  toDay: output.toDay,
  days: output.days,
  fromUtc: output.fromUtc,
  toExclusiveUtc: output.toExclusiveUtc,
  feeRate: output.feeRate,
  scope: output.scope,
  requestedStages,
  total: output.total,
  byUtcDay: output.byUtcDay,
  byStage: output.byStage,
  byStageSideBtcLabel: output.byStageSideBtcLabel,
  byStageSideBtcLabelTimeframe: output.byStageSideBtcLabelTimeframe,
  byStageSideBtcLabelHour: output.byStageSideBtcLabelHour,
  byStageSideBtcLabelCandle: output.byStageSideBtcLabelCandle,
};

const labelsSummaryOutput = {
  toDay: output.toDay,
  days: output.days,
  fromUtc: output.fromUtc,
  toExclusiveUtc: output.toExclusiveUtc,
  feeRate: output.feeRate,
  scope: output.scope,
  requestedStages,
  total: output.total,
  byUtcDay: output.byUtcDay,
  byStage: output.byStage,
  byStageSideBtcLabel: output.byStageSideBtcLabel,
  byStageSideBtcLabelTimeframe: output.byStageSideBtcLabelTimeframe,
};

const preLabelProposalOutput = {
  toDay: output.toDay,
  days: output.days,
  fromUtc: output.fromUtc,
  toExclusiveUtc: output.toExclusiveUtc,
  feeRate: output.feeRate,
  scope: output.scope,
  requestedStages,
  total: output.total,
  byUtcDay: output.byUtcDay,
  byStage: output.byStage,
  byTimeframe: output.byTimeframe,
  byStageTimeframe: output.byStageTimeframe,
  byStageTimeframeCandleBiasPair: output.byStageTimeframeCandleBiasPair,
  byStageTimeframeRegimeCandleBiasPair: output.byStageTimeframeRegimeCandleBiasPair,
  byStageTimeframeExactCandlePair: output.byStageTimeframeExactCandlePair,
};

const selectedOutput = process.argv.includes('--pre-label-proposal')
  ? preLabelProposalOutput
  : process.argv.includes('--labels-summary')
  ? labelsSummaryOutput
  : process.argv.includes('--labels-only') ? labelsOnlyOutput : finalOutput;
console.log(JSON.stringify(selectedOutput, null, 2));
