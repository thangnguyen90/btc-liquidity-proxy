import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PAGE_FILES = {
  pump: ['data/pump-paper-trades.json'],
  ema: ['data/pump-paper-trades.json', 'data/paper-trades.json'],
  cap: ['data/cap-paper-trades.json'],
  edge: ['data/edge-paper-trades.json'],
  liquid: ['data/liquid-paper-trades.json'],
  ppks: ['data/ppks-paper-trades.json'],
  shakeout: ['data/shakeout-paper-trades.json'],
  top: ['data/top-reversal-paper-trades.json'],
};

const EMA_PAGE_ALIASES = new Map([
  ['ema-squeeze', null],
  ['emasq', null],
  ['runner', 'runner'],
  ['squeeze', 'squeeze'],
  ['squeeze-short', 'squeeze-short'],
  ['squeeze-long', 'squeeze'],
  ['br-like', 'br-like'],
  ['brlike', 'br-like'],
  ['br-like-short', 'br-like-short'],
  ['brlike-short', 'br-like-short'],
  ['breakout', 'breakout'],
  ['breakdown', 'breakdown'],
  ['pre-breakout', 'pre-breakout'],
  ['pre-breakdown', 'pre-breakdown'],
]);

function arg(name, fallback = null) {
  const eq = process.argv.find((item) => item.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : fallback;
}

function flag(name) {
  return process.argv.includes(name);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(day, delta) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function assertDate(day, label = 'date') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Invalid --${label} "${day}". Use YYYY-MM-DD UTC.`);
  }
}

function dateRange() {
  const date = arg('--date', null);
  if (date) {
    assertDate(date, 'date');
    return { from: date, to: date };
  }
  const to = arg('--to', todayUtc());
  const days = Math.max(1, Number(arg('--days', 1)));
  const from = arg('--from', addDays(to, -(days - 1)));
  assertDate(from, 'from');
  assertDate(to, 'to');
  return { from, to };
}

function readRows(file) {
  const full = path.resolve(ROOT, file);
  if (!fs.existsSync(full)) return [];
  const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.trades)) return raw.trades;
  if (Array.isArray(raw.rows)) return raw.rows;
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sourceOf(trade) {
  return String(trade.source ?? '');
}

function isEmaTrade(trade) {
  const source = sourceOf(trade);
  return source.startsWith('emasq-') || source.includes('ema-squeeze') || Boolean(trade.emaStageGateLabel);
}

function dayOfTrade(trade) {
  const raw = trade.createdAt ?? trade.openedAt ?? trade.time ?? trade.closedAt ?? trade.updatedAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw).toISOString().slice(0, 10);
  const text = String(raw ?? '');
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
}

function inDayRange(trade, from, to) {
  const day = dayOfTrade(trade);
  return day >= from && day <= to;
}

function normalizeType(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .trim();
}

function stageOfEma(trade) {
  const source = sourceOf(trade);
  const note = String(trade.note ?? '');
  if (source.includes('br_like_short') || note.includes('brLikeShort=Y')) return 'BR-like Short';
  if (source.includes('br_like') || note.includes('brLike=Y')) return 'BR-like';
  if (trade.runnerCandidate || source.includes('runner') || note.includes('runner=Y')) return 'Runner';
  if (source.includes('pre_breakout')) return 'Pre Breakout';
  if (source.includes('pre_breakdown')) return 'Pre Breakdown';
  if (source.includes('breakout')) return 'Breakout';
  if (source.includes('breakdown')) return 'Breakdown';
  if (source.includes('squeeze_short')) return 'Squeeze Short';
  if (source.includes('squeeze')) return 'Squeeze';
  return 'EMA';
}

function matchesPageAndType(page, type, trade) {
  if (page === 'ema' && !isEmaTrade(trade)) return false;
  if (!type || type === 'all') return true;
  if (page !== 'ema') return true;
  return normalizeType(stageOfEma(trade)) === normalizeType(type);
}

function parsePages() {
  const raw = String(arg('--page', 'pump')).toLowerCase();
  if (raw === 'all') return Object.keys(PAGE_FILES).map((page) => ({ page, type: null }));
  return raw.split(',').map((item) => {
    const page = item.trim();
    if (EMA_PAGE_ALIASES.has(page)) return { page: 'ema', type: EMA_PAGE_ALIASES.get(page) };
    return { page, type: null };
  }).filter((item) => item.page);
}

function normalizePart(value) {
  return String(value ?? '-')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[|]/g, '_')
    .toUpperCase()
    .slice(0, 80) || '-';
}

function tfOf(trade) {
  const source = sourceOf(trade);
  return source.match(/(?:emasq|pump|cap|edge|ppks|liq)-(\d+[mh])-/)?.[1]
    ?? trade.pumpSignalTimeframe
    ?? trade.timeframe
    ?? trade.tf
    ?? '-';
}

function scoreOf(trade) {
  const fromSource = sourceOf(trade).match(/-(\d{2,3})(?:-|$)/)?.[1];
  const raw = num(trade.score ?? trade.signalScore ?? trade.qualityScore ?? fromSource);
  if (raw == null) return null;
  if (raw > 1000) return Math.floor(raw / 100);
  if (raw > 100) return Math.floor(raw / 10);
  return raw;
}

function scoreBucket(trade) {
  const score = scoreOf(trade);
  if (score == null) return 'SCORE_NO_DATA';
  if (score >= 90) return 'SCORE_90_PLUS';
  if (score >= 80) return 'SCORE_80_89';
  if (score >= 70) return 'SCORE_70_79';
  if (score >= 60) return 'SCORE_60_69';
  return 'SCORE_LT_60';
}

function btcPhase(trade) {
  const health = trade.btcHealth ?? {};
  const dirRaw = health.btcTrendDir ?? trade.btcTrendDir;
  const score = num(health.btcTrendScore ?? trade.btcTrendScore);
  const pct6h = num(health.pct6h ?? trade.btcPct6h);
  let dir = normalizePart(dirRaw);
  if (!dir || dir === '-') {
    if (pct6h != null) dir = pct6h > 0.15 ? 'UP' : pct6h < -0.15 ? 'DOWN' : 'FLAT';
    else return 'BTC_NO_DATA';
  }
  const strength = score == null
    ? 'NO_SCORE'
    : score < 45 ? 'WEAK' : score < 65 ? 'MID' : 'STRONG';
  return `BTC_${dir}_${strength}`;
}

function relationOf(trade) {
  const corr = num(trade.btcCorr);
  if (corr == null) return 'REL_NO_DATA';
  if (corr < 0.3) return 'DOC_LAP';
  if (corr < 0.5) return 'THEO_YEU';
  return 'THEO';
}

function signalType(page, trade) {
  if (page === 'ema') return stageOfEma(trade);
  const combo = String(trade.pumpCombo ?? trade.combo ?? '');
  const first = combo.split('|')[0]?.trim();
  if (first) return first;
  const source = sourceOf(trade);
  if (source.startsWith('ppks')) return 'Post Pump Kill Short';
  if (source.startsWith('cap')) return normalizePart(trade.type ?? 'Cap');
  if (source.startsWith('edge') || source.startsWith('killshort')) return 'Edge Short';
  if (source.startsWith('shakeout')) return normalizePart(trade.signalType ?? trade.type ?? 'Shakeout');
  return normalizePart(trade.pumpSignalType ?? trade.type ?? page);
}

function marginBucket(trade) {
  const margin = num(trade.marginUsdt ?? trade.marginUsd ?? trade.margin ?? trade.orderUsdt);
  if (margin != null && margin >= 9.5 && margin <= 10.5) return 'TEST_$10';
  if (margin != null && margin > 0 && margin <= 1.01) return 'TEST_$1';
  return 'OTHER';
}

function groupKey(page, trade, mode) {
  const parts = {
    phase: btcPhase(trade),
    type: normalizePart(signalType(page, trade)),
    side: normalizePart(trade.side),
    tf: normalizePart(tfOf(trade)),
    score: scoreBucket(trade),
    rel: relationOf(trade),
    margin: marginBucket(trade),
  };
  if (mode === 'phase') return [parts.phase].join(' | ');
  if (mode === 'signal') return [parts.phase, parts.type, parts.side, parts.score].join(' | ');
  if (mode === 'full') return [parts.phase, parts.type, parts.side, parts.tf, parts.score, parts.rel, parts.margin].join(' | ');
  return [parts.phase, parts.type, parts.side, parts.score].join(' | ');
}

function emptyStats(name = '') {
  return { name, total: 0, open: 0, closed: 0, win: 0, loss: 0, tp: 0, sl: 0, real: 0, live: 0, roeSum: 0 };
}

function addStats(group, trade) {
  const status = String(trade.status ?? '').toUpperCase();
  const pnl = num(trade.pnl, 0);
  const roe = num(trade.roe, 0);
  group.total += 1;
  if (status === 'OPEN' || status === 'PENDING') {
    group.open += 1;
    group.live += pnl ?? 0;
    return;
  }
  group.closed += 1;
  group.real += pnl ?? 0;
  group.roeSum += roe ?? 0;
  if ((pnl ?? 0) > 0) group.win += 1;
  else if ((pnl ?? 0) < 0) group.loss += 1;
  const outcome = String(trade.outcome ?? status);
  if (outcome.includes('TP')) group.tp += 1;
  if (outcome.includes('SL')) group.sl += 1;
}

function finish(group) {
  return {
    ...group,
    pnl: group.real + group.live,
    wr: group.closed ? group.win / group.closed * 100 : null,
    avgRoe: group.closed ? group.roeSum / group.closed : null,
  };
}

function fmtMoney(value) {
  const n = num(value, 0);
  return `${n >= 0 ? '+' : ''}${n.toFixed(3)}`;
}

function fmtPct(value) {
  return value == null ? '-' : `${Number(value).toFixed(1)}%`;
}

function printTable(title, rows, cols) {
  console.log(`\n${title}`);
  if (!rows.length) {
    console.log('(no rows)');
    return;
  }
  console.table(rows.map((row) => {
    const out = {};
    for (const [key, getter] of cols) out[key] = getter(row);
    return out;
  }));
}

function printGroups(title, rows) {
  printTable(title, rows, [
    ['group', (r) => r.name],
    ['total', (r) => r.total],
    ['open', (r) => r.open],
    ['closed', (r) => r.closed],
    ['W/L', (r) => `${r.win}/${r.loss}`],
    ['TP/SL', (r) => `${r.tp}/${r.sl}`],
    ['WR', (r) => fmtPct(r.wr)],
    ['AvgROE', (r) => fmtPct(r.avgRoe)],
    ['PnL', (r) => fmtMoney(r.pnl)],
  ]);
}

function main() {
  const { from, to } = dateRange();
  const pages = parsePages();
  const explicitType = normalizeType(arg('--type', arg('--signal', '')));
  const minClosed = Number(arg('--min-closed', 5));
  const limit = Number(arg('--limit', 20));
  const mode = normalizeType(arg('--group', 'signal'));
  const includeNoData = flag('--include-no-data');

  for (const pageSpec of pages) {
    const page = pageSpec.page;
    const type = explicitType || pageSpec.type;
    const files = PAGE_FILES[page];
    if (!files) {
      const emaAliases = [...EMA_PAGE_ALIASES.keys()].join(', ');
      throw new Error(`Unknown --page "${page}". Use: ${Object.keys(PAGE_FILES).join(', ')}, ${emaAliases}, all`);
    }

    const rows = files.flatMap(readRows)
      .filter((trade) => inDayRange(trade, from, to))
      .filter((trade) => matchesPageAndType(page, type, trade));

    const total = emptyStats('TOTAL');
    const phaseGroups = new Map();
    const groups = new Map();

    for (const trade of rows) {
      addStats(total, trade);
      const phase = btcPhase(trade);
      if (includeNoData || !phase.includes('NO_DATA')) {
        if (!phaseGroups.has(phase)) phaseGroups.set(phase, emptyStats(phase));
        addStats(phaseGroups.get(phase), trade);
      }

      const key = groupKey(page, trade, mode);
      if (!includeNoData && key.includes('NO_DATA')) continue;
      if (!groups.has(key)) groups.set(key, emptyStats(key));
      addStats(groups.get(key), trade);
    }

    const doneTotal = finish(total);
    const title = type ? `${page.toUpperCase()} / ${type}` : page.toUpperCase();
    console.log(`\n=== SIGNAL EVAL ${title} ${from}${from === to ? '' : `..${to}`} ===`);
    console.log(`rows=${rows.length} open/pending=${doneTotal.open} closed=${doneTotal.closed} TP=${doneTotal.tp} SL=${doneTotal.sl} WR=${fmtPct(doneTotal.wr)} AvgROE=${fmtPct(doneTotal.avgRoe)} PnL=${fmtMoney(doneTotal.pnl)} real=${fmtMoney(doneTotal.real)} live=${fmtMoney(doneTotal.live)}`);

    const phases = [...phaseGroups.values()].map(finish).sort((a, b) => b.closed - a.closed || b.pnl - a.pnl);
    printGroups('BTC phase summary', phases);

    const doneGroups = [...groups.values()].map(finish).filter((row) => row.closed >= minClosed);
    const best = [...doneGroups].sort((a, b) => b.avgRoe - a.avgRoe || b.pnl - a.pnl || b.closed - a.closed).slice(0, limit);
    const worst = [...doneGroups].sort((a, b) => a.avgRoe - b.avgRoe || a.pnl - b.pnl || b.closed - a.closed).slice(0, limit);
    const most = [...doneGroups].sort((a, b) => b.closed - a.closed || b.avgRoe - a.avgRoe).slice(0, limit);

    printGroups(`Best groups by AvgROE (min closed ${minClosed}, limit ${limit})`, best);
    printGroups(`Worst groups by AvgROE (min closed ${minClosed}, limit ${limit})`, worst);
    printGroups(`Largest samples (min closed ${minClosed}, limit ${limit})`, most);
  }
}

try {
  main();
} catch (err) {
  console.error(`[signal-eval] ${err.message}`);
  process.exitCode = 1;
}
