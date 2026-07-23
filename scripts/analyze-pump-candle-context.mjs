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

function entryMs(trade) {
  return Date.parse(trade.openedAt ?? trade.createdAt ?? '');
}

function pattern(value) {
  const name = typeof value === 'object' && value ? value.name : value;
  return String(name ?? 'NO_DATA').trim().toUpperCase() || 'NO_DATA';
}

function coinCandleOf(trade) {
  return pattern(trade.candlePatternAtEntry ?? trade.candlePattern5m ?? trade.candlePattern15m);
}

function btcCandleOf(trade) {
  return pattern(trade.btcCandlePatternAtEntry ?? trade.btcCandlePattern5m);
}

function candleBias(value) {
  const name = pattern(value);
  if (name.includes('BEARISH') || name === 'SHOOTING_STAR') return 'BEARISH';
  if (name.includes('BULLISH') || name === 'HAMMER') return 'BULLISH';
  if (['NO_DATA', 'UNKNOWN'].includes(name)) return 'NO_DATA';
  return 'NEUTRAL';
}

function typeOf(trade) {
  return String(trade.pumpSignalType ?? trade.type ?? 'PUMP_UNKNOWN').trim().toUpperCase().replace(/\s+/g, '_');
}

function timeframeOf(trade) {
  return String(trade.pumpSignalTimeframe ?? trade.pumpSignalFactors?.timeframe ?? trade.timeframe ?? '15m').toLowerCase();
}

function gradeOf(trade) {
  return String(trade.pumpSignalGrade ?? trade.grade ?? 'NO_DATA').trim().toUpperCase() || 'NO_DATA';
}

function scoreOf(trade) {
  return num(String(trade.source ?? '').match(/^pump-(\d+)/i)?.[1], NaN);
}

function scoreBucketOf(trade) {
  const score = scoreOf(trade);
  if (!Number.isFinite(score)) return 'SCORE_NO_DATA';
  if (score >= 90) return 'SCORE_90_PLUS';
  if (score >= 80) return 'SCORE_80_89';
  if (score >= 70) return 'SCORE_70_79';
  return 'SCORE_LT_70';
}

function btcPhaseOf(trade) {
  const health = trade.btcHealth ?? {};
  let direction = String(health.btcTrendDir ?? trade.btcTrendDir ?? '').toUpperCase();
  const score = Number(health.btcTrendScore ?? trade.btcTrendScore);
  const pct6h = Number(health.pct6h ?? trade.btcPct6h);
  if (!['UP', 'DOWN', 'FLAT'].includes(direction)) {
    direction = Number.isFinite(pct6h) ? (pct6h > 0.15 ? 'UP' : pct6h < -0.15 ? 'DOWN' : 'FLAT') : 'NO_DATA';
  }
  if (direction === 'NO_DATA') return 'BTC_NO_DATA';
  const strength = !Number.isFinite(score) ? 'NO_SCORE' : score < 45 ? 'WEAK' : score < 65 ? 'MID' : 'STRONG';
  return `BTC_${direction}_${strength}`;
}

function relationOf(trade) {
  const corr = Number(trade.btcCorr);
  if (!Number.isFinite(corr)) return 'NO_DATA';
  if (corr < 0.3) return 'DOC_LAP';
  if (corr < 0.5) return 'THEO_YEU';
  return 'THEO';
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

const bangkokDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
});

function dayOf(trade) {
  return bangkokDayFmt.format(new Date(entryMs(trade)));
}

function metricsOf(trade, feeRate) {
  const grossPnl = num(trade.pnl);
  const fee = estimatedFee(trade, feeRate);
  const netPnl = grossPnl - fee;
  const margin = Number(trade.marginUsdt);
  const grossRoe = num(trade.roe);
  const netRoe = Number.isFinite(margin) && margin > 0 ? netPnl / margin * 100 : grossRoe;
  return { grossPnl, fee, netPnl, grossRoe, netRoe };
}

function summarize(rows, feeRate) {
  const values = rows.map((trade) => ({ trade, ...metricsOf(trade, feeRate) }));
  const positive = values.filter((row) => row.netPnl > 0);
  const negative = values.filter((row) => row.netPnl < 0);
  const grossWin = positive.reduce((sum, row) => sum + row.netPnl, 0);
  const grossLoss = Math.abs(negative.reduce((sum, row) => sum + row.netPnl, 0));
  const byDay = new Map();
  for (const row of values) byDay.set(dayOf(row.trade), (byDay.get(dayOf(row.trade)) ?? 0) + row.netPnl);
  return {
    n: rows.length,
    wins: positive.length,
    losses: negative.length,
    wr: rows.length ? positive.length / rows.length * 100 : 0,
    avgGrossRoe: rows.length ? values.reduce((sum, row) => sum + row.grossRoe, 0) / rows.length : 0,
    avgNetRoe: rows.length ? values.reduce((sum, row) => sum + row.netRoe, 0) / rows.length : 0,
    netRoe15: rows.length
      ? values.reduce((sum, row) => sum + Math.max(-15, Math.min(15, row.netRoe)), 0) / rows.length
      : 0,
    grossPnl: values.reduce((sum, row) => sum + row.grossPnl, 0),
    fee: values.reduce((sum, row) => sum + row.fee, 0),
    netPnl: values.reduce((sum, row) => sum + row.netPnl, 0),
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    tp: rows.filter((trade) => String(trade.outcome ?? '').includes('TP')).length,
    sl: rows.filter((trade) => String(trade.outcome ?? '').includes('SL')).length,
    positiveDays: [...byDay.values()].filter((pnl) => pnl > 0).length,
    activeDays: byDay.size,
  };
}

function group(rows, keyFn, feeRate, min = 1) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ name, ...summarize(list, feeRate) }))
    .filter((row) => row.n >= min);
}

function compact(row) {
  return {
    group: row.name,
    n: row.n,
    WR: `${row.wr.toFixed(1)}%`,
    AvgGrossROE: `${row.avgGrossRoe >= 0 ? '+' : ''}${row.avgGrossRoe.toFixed(2)}%`,
    AvgNetROE: `${row.avgNetRoe >= 0 ? '+' : ''}${row.avgNetRoe.toFixed(2)}%`,
    NetROE15: `${row.netRoe15 >= 0 ? '+' : ''}${row.netRoe15.toFixed(2)}%`,
    Gross: `${row.grossPnl >= 0 ? '+' : ''}${row.grossPnl.toFixed(3)}`,
    Fee: `-${row.fee.toFixed(3)}`,
    Net: `${row.netPnl >= 0 ? '+' : ''}${row.netPnl.toFixed(3)}`,
    PF: row.pf.toFixed(2),
    'TP/SL': `${row.tp}/${row.sl}`,
    'days+': `${row.positiveDays}/${row.activeDays}`,
  };
}

const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
const allTrades = Array.isArray(raw) ? raw : raw.trades ?? [];
const nativeClosed = allTrades.filter((trade) => trade.status === 'CLOSED' && /^pump-\d+(?:-|$)/i.test(String(trade.source ?? '')));
const firstCoinCapture = Math.min(...nativeClosed
  .map((trade) => Date.parse(trade.candlePatternAtEntry?.capturedAt ?? ''))
  .filter(Number.isFinite));
const firstBtcCapture = Math.min(...nativeClosed
  .map((trade) => Date.parse((trade.btcCandlePatternAtEntry ?? trade.btcCandlePattern5m)?.capturedAt ?? ''))
  .filter(Number.isFinite));
const detectedLiveSince = Math.max(firstCoinCapture, firstBtcCapture);
const requestedSince = Date.parse(arg('--since', '') ?? '');
const liveSince = Number.isFinite(requestedSince) ? requestedSince : detectedLiveSince;
const feeRate = Math.max(0, num(arg('--fee-rate', process.env.BINANCE_FUTURES_TAKER_FEE_RATE ?? process.env.BINANCE_FEE_RATE ?? 0.0004), 0.0004));
const days = Math.max(1, num(arg('--days', 7), 7));
const gradeFilter = String(arg('--grade', '') ?? '').trim().toUpperCase();
const toDay = arg('--to', bangkokDayFmt.format(new Date()));
const toExclusive = Date.parse(`${toDay}T17:00:00.000Z`);
const fromMs = toExclusive - days * 24 * 3600_000;
const inDateRange = nativeClosed.filter((trade) => entryMs(trade) >= fromMs && entryMs(trade) < toExclusive);
const rows = inDateRange.filter((trade) => entryMs(trade) >= liveSince)
  .filter((trade) => !gradeFilter || gradeOf(trade) === gradeFilter);
const complete = rows.filter((trade) => !['NO_DATA', 'UNKNOWN'].includes(coinCandleOf(trade))
  && !['NO_DATA', 'UNKNOWN'].includes(btcCandleOf(trade)));

const baseCombo = (trade) => [
  typeOf(trade), trade.side ?? 'NO_SIDE', timeframeOf(trade), scoreBucketOf(trade), btcPhaseOf(trade), relationOf(trade),
].join(' | ');
const candlePair = (trade) => `${baseCombo(trade)} | ALT_${coinCandleOf(trade)} | BTC_${btcCandleOf(trade)}`;
const simplePair = (trade) => `${typeOf(trade)} | ${trade.side ?? 'NO_SIDE'} | ${timeframeOf(trade)} | ALT_${coinCandleOf(trade)} | BTC_${btcCandleOf(trade)}`;
const exactRows = group(complete, candlePair, feeRate);
const simpleRows = group(complete, simplePair, feeRate);
const comboRows = group(complete, baseCombo, feeRate);
const signalRows = group(complete, (trade) => `${typeOf(trade)} | ${trade.side ?? 'NO_SIDE'} | ${timeframeOf(trade)}`, feeRate);
const daySignalRows = group(complete, (trade) => `${dayOf(trade)} | ${typeOf(trade)} | ${trade.side ?? 'NO_SIDE'} | ${timeframeOf(trade)}`, feeRate);
const gradeRows = group(complete, (trade) => `${gradeOf(trade)} | ${typeOf(trade)} | ${trade.side ?? 'NO_SIDE'} | ${timeframeOf(trade)}`, feeRate);
const scoreRows = group(complete, (trade) => `${scoreBucketOf(trade)} | ${typeOf(trade)} | ${trade.side ?? 'NO_SIDE'} | ${timeframeOf(trade)}`, feeRate);
const currentEvalRows = group(complete, (trade) => (
  `${String(trade.pumpEvalVersion ?? 'LEGACY')} | ${String(trade.pumpEvalLabel ?? 'NO_LABEL')}`
), feeRate);
const signalBiasPairRows = group(complete, (trade) => (
  `${typeOf(trade)} | ${trade.side ?? 'NO_SIDE'} | ${timeframeOf(trade)}`
  + ` | ALT_${candleBias(coinCandleOf(trade))} | BTC_${candleBias(btcCandleOf(trade))}`
), feeRate);
const btcCandleRows = group(complete, (trade) => `BTC_${btcCandleOf(trade)}`, feeRate);
const altCandleRows = group(complete, (trade) => `ALT_${coinCandleOf(trade)}`, feeRate);
const rawCandlePairRows = group(complete, (trade) => `ALT_${coinCandleOf(trade)} | BTC_${btcCandleOf(trade)}`, feeRate);
const reliable = simpleRows.filter((row) => row.n >= 5);
const exploratory = simpleRows.filter((row) => row.n >= 3);
const qualitySort = (a, b) => b.netRoe15 - a.netRoe15 || b.netPnl - a.netPnl || b.n - a.n;

const output = {
  generatedAt: new Date().toISOString(),
  coverage: {
    requested: { days, toDay, from: new Date(fromMs).toISOString(), toExclusive: new Date(toExclusive).toISOString() },
    grade: gradeFilter || 'ALL',
    detectedLiveSince: Number.isFinite(liveSince) ? new Date(liveSince).toISOString() : null,
    nativeClosedInRange: inDateRange.length,
    liveCohort: rows.length,
    completePairs: complete.length,
    missingCoinCandle: rows.filter((trade) => ['NO_DATA', 'UNKNOWN'].includes(coinCandleOf(trade))).length,
    missingBtcCandle: rows.filter((trade) => ['NO_DATA', 'UNKNOWN'].includes(btcCandleOf(trade))).length,
    exactGroups: exactRows.length,
    simpleGroups: simpleRows.length,
    groupsN3: exploratory.length,
    groupsN5: reliable.length,
  },
  feeRate,
  total: compact({ name: 'TOTAL_COMPLETE_PAIR', ...summarize(complete, feeRate) }),
  bySignal: [...signalRows].sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byDaySignal: [...daySignalRows].sort((a, b) => a.name.localeCompare(b.name)).map(compact),
  byGradeSignal: [...gradeRows].sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byScoreSignal: [...scoreRows].sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  byCurrentEvalLabel: [...currentEvalRows].sort((a, b) => b.n - a.n || b.netPnl - a.netPnl).map(compact),
  bySignalCandleBiasPair: [...signalBiasPairRows]
    .filter((row) => row.n >= 3)
    .sort((a, b) => b.n - a.n || b.netPnl - a.netPnl)
    .map(compact),
  topN5: [...reliable].sort(qualitySort).slice(0, 20).map(compact),
  bottomN5: [...reliable].sort((a, b) => qualitySort(b, a)).slice(0, 20).map(compact),
  topN3: [...exploratory].sort(qualitySort).slice(0, 30).map(compact),
  bottomN3: [...exploratory].sort((a, b) => qualitySort(b, a)).slice(0, 30).map(compact),
};

const csvTarget = arg('--csv');
if (csvTarget) {
  const target = path.resolve(rootDir, csvTarget);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const header = ['level', 'group', 'n', 'wins', 'losses', 'wr', 'avgGrossRoe', 'avgNetRoe', 'netRoe15', 'grossPnl', 'fee', 'netPnl', 'pf', 'tp', 'sl', 'positiveDays', 'activeDays'];
  const lines = [header.join(',')];
  for (const [level, groups] of [
    ['SIGNAL', signalRows],
    ['BTC_CANDLE', btcCandleRows],
    ['ALT_CANDLE', altCandleRows],
    ['BTC_ALT_CANDLE_PAIR', rawCandlePairRows],
    ['COMBO_ONLY', comboRows],
    ['SETUP_CANDLE_PAIR', simpleRows],
    ['COMBO_CANDLE_PAIR', exactRows],
  ]) {
    for (const row of [...groups].sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push([
        level, row.name, row.n, row.wins, row.losses, row.wr, row.avgGrossRoe, row.avgNetRoe,
        row.netRoe15, row.grossPnl, row.fee, row.netPnl, row.pf, row.tp, row.sl,
        row.positiveDays, row.activeDays,
      ].map(quote).join(','));
    }
  }
  fs.writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
  output.csv = target;
}

const mdTarget = arg('--md');
if (mdTarget) {
  const target = path.resolve(rootDir, mdTarget);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const pct = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  const pnl = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
  const confidence = (row) => row.n >= 10 && row.activeDays >= 3
    ? 'ĐỦ MẪU'
    : row.n >= 5 ? 'TẠM THỜI' : row.n >= 3 ? 'THĂM DÒ' : 'MẪU MỎNG';
  const mdCell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const metricCells = (row) => [
    row.n, `${row.wins}/${row.losses}`, `${row.wr.toFixed(1)}%`, pct(row.avgGrossRoe), pct(row.avgNetRoe),
    pct(row.netRoe15), pnl(row.grossPnl), `-${row.fee.toFixed(3)}`, pnl(row.netPnl), row.pf.toFixed(2),
    `${row.tp}/${row.sl}`, `${row.positiveDays}/${row.activeDays}`, confidence(row),
  ];
  const table = (title, columns, groups, splitName) => {
    const header = [...columns, 'N', 'W/L', 'WR', 'Avg gross ROE', 'Avg net ROE', 'NetROE15', 'Gross PnL', 'Phí', 'Net PnL', 'PF', 'TP/SL', 'Ngày +/chạy', 'Độ tin cậy'];
    const lines = [`## ${title}`, '', `| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
    for (const row of groups) {
      const names = splitName(row.name);
      lines.push(`| ${[...names, ...metricCells(row)].map(mdCell).join(' | ')} |`);
    }
    lines.push('');
    return lines;
  };
  const nestedComboTables = (title, groups, comboParts) => {
    const buckets = new Map();
    for (const row of groups) {
      const parts = row.name.split(' | ');
      const combo = parts.slice(0, comboParts).join(' | ');
      if (!buckets.has(combo)) buckets.set(combo, []);
      buckets.get(combo).push({ row, alt: parts[comboParts]?.replace(/^ALT_/, ''), btc: parts[comboParts + 1]?.replace(/^BTC_/, '') });
    }
    const lines = [`## ${title}`, '', 'Combo là khóa gốc; trong từng combo, dữ liệu được tách theo nến altcoin trước rồi đến nến BTC.', ''];
    for (const [combo, items] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`### ${combo}`, '');
      const header = ['Nến altcoin', 'Nến BTC', 'N', 'W/L', 'WR', 'Avg gross ROE', 'Avg net ROE', 'NetROE15', 'Gross PnL', 'Phí', 'Net PnL', 'PF', 'TP/SL', 'Ngày +/chạy', 'Độ tin cậy'];
      lines.push(`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`);
      for (const item of items.sort((a, b) => a.alt.localeCompare(b.alt) || a.btc.localeCompare(b.btc))) {
        lines.push(`| ${[item.alt, item.btc, ...metricCells(item.row)].map(mdCell).join(' | ')} |`);
      }
      lines.push('');
    }
    return lines;
  };
  const byName = (a, b) => a.name.localeCompare(b.name);
  const bySignalThenQuality = (a, b) => a.name.split(' | ')[0].localeCompare(b.name.split(' | ')[0])
    || b.n - a.n || b.netRoe15 - a.netRoe15;
  const md = [
    '# Thống kê chi tiết Pump × nến BTC × nến altcoin',
    '',
    `Tạo lúc: ${output.generatedAt}. Múi giờ ngày giao dịch: Asia/Bangkok (UTC+7).`,
    '',
    `Cohort nến thật từ: ${output.coverage.detectedLiveSince}. Lọc grade: ${output.coverage.grade}. Có ${rows.length} lệnh đóng; ${complete.length} lệnh đủ hai nến; thiếu nến BTC ${output.coverage.missingBtcCandle}; thiếu nến altcoin ${output.coverage.missingCoinCandle}.`,
    '',
    `Tổng: N=${complete.length}, WR=${output.total.WR}, Avg net ROE=${output.total.AvgNetROE}, NetROE15=${output.total.NetROE15}, Gross=${output.total.Gross}, phí=${output.total.Fee}, Net=${output.total.Net}, PF=${output.total.PF}.`,
    '',
    'Ghi chú: `NetROE15` chặn ROE sau phí từng lệnh trong [-15%, +15%]. `MẪU MỎNG/THĂM DÒ/TẠM THỜI` không phải rule ENTER/BLOCK.',
    '',
    ...nestedComboTables('1. Combo đầy đủ → nến altcoin → nến BTC', exactRows, 6),
    ...nestedComboTables('2. Setup Pump → nến altcoin → nến BTC', simpleRows, 3),
    ...table('3. Theo loại tín hiệu Pump', ['Signal', 'Side', 'Khung'], [...signalRows].sort(byName), (name) => name.split(' | ')),
    ...table('4. Theo riêng nến altcoin', ['Nến altcoin'], [...altCandleRows].sort((a, b) => b.n - a.n || b.netRoe15 - a.netRoe15), (name) => [name.replace(/^ALT_/, '')]),
    ...table('5. Theo riêng nến BTC', ['Nến BTC'], [...btcCandleRows].sort((a, b) => b.n - a.n || b.netRoe15 - a.netRoe15), (name) => [name.replace(/^BTC_/, '')]),
    ...table('6. Tất cả cặp nến altcoin × BTC', ['Nến altcoin', 'Nến BTC'], [...rawCandlePairRows].sort((a, b) => b.n - a.n || b.netRoe15 - a.netRoe15), (name) => name.split(' | ').map((part) => part.replace(/^(BTC|ALT)_/, ''))),
  ];
  fs.writeFileSync(target, `${md.join('\n')}\n`, 'utf8');
  output.md = target;
}

console.log(JSON.stringify(output, null, 2));
