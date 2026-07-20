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

function assertDate(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Invalid --date "${day}". Use YYYY-MM-DD UTC.`);
  }
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

function sourceOf(trade) {
  return String(trade.source ?? '');
}

function isEmaTrade(trade) {
  const source = sourceOf(trade);
  return source.startsWith('emasq-') || source.includes('ema-squeeze') || Boolean(trade.emaStageGateLabel);
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function normalizeType(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .trim();
}

function matchesPageAndType(page, type, trade) {
  if (page === 'ema' && !isEmaTrade(trade)) return false;
  if (!type || type === 'all') return true;
  if (page !== 'ema') return true;
  return normalizeType(stageOfEma(trade)) === normalizeType(type);
}

function tfOf(trade) {
  const source = String(trade.source ?? '');
  return source.match(/(?:emasq|pump|cap|edge|ppks)-(\d+[mh])-/)?.[1]
    ?? trade.pumpSignalTimeframe
    ?? trade.timeframe
    ?? trade.tf
    ?? '-';
}

function normalizePart(value) {
  return String(value ?? '-')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[|]/g, '_')
    .toUpperCase()
    .slice(0, 80) || '-';
}

function gatePartOf(trade) {
  const gate = normalizePart(
    trade.recommendationGate
    ?? trade.emaStageGateLabel
    ?? trade.capGateLabel
    ?? trade.edgeGateLabel
    ?? trade.liquidGateLabel
    ?? trade.gateLabel
    ?? trade.gateReason
    ?? trade.gate
    ?? '-',
  );
  if (!gate || gate === '-' || gate === 'GATE' || gate === 'GATE_-' || gate === 'UNKNOWN') return 'GATE_UNKNOWN';
  if (gate.startsWith('GATE_') || gate.startsWith('OK_') || gate.startsWith('BLOCK_')) return gate;
  return `GATE_${gate}`;
}

function comboWithGate(combo, trade) {
  const base = String(combo ?? '').trim();
  const gate = gatePartOf(trade);
  if (!base || base === '-') return gate;
  const parts = base.split('|').map((part) => part.trim()).filter(Boolean);
  const normalizedParts = parts.map((part) => {
    const value = normalizePart(part);
    return value === 'GATE' || value === 'GATE_-' || value === 'GATE_UNKNOWN' || value === 'UNKNOWN'
      ? 'GATE_UNKNOWN'
      : part;
  });
  const hasGate = normalizedParts.some((part) => {
    const value = normalizePart(part);
    return value === 'GATE_UNKNOWN' || value.startsWith('GATE_') || value.startsWith('OK_') || value.startsWith('BLOCK_');
  });
  return hasGate ? normalizedParts.join(' | ') : `${base} | ${gate}`;
}

function fallbackCombo(page, trade) {
  if (trade.pumpCombo) return comboWithGate(trade.pumpCombo, trade);
  if (trade.combo) return comboWithGate(trade.combo, trade);
  const side = normalizePart(trade.side);
  const tf = normalizePart(tfOf(trade));
  const btcCorr = Number(trade.btcCorr);
  const corr = Number.isFinite(btcCorr)
    ? btcCorr < 0.3 ? 'BTC_CORR_RAC' : btcCorr < 0.5 ? 'BTC_CORR_YEU' : 'BTC_CORR_THEO'
    : 'BTC_CORR_NO_DATA';
  const health = trade.btcHealth ?? {};
  const dir = normalizePart(health.btcTrendDir ?? trade.btcTrendDir ?? 'BTC_NO_DATA');
  const score = num(health.btcTrendScore ?? trade.btcTrendScore);
  const trend = dir === 'BTC_NO_DATA'
    ? 'BTC_NO_DATA'
    : `BTC_${dir}_${score == null ? 'NO_SCORE' : score < 45 ? 'WEAK' : score < 65 ? 'MID' : 'STRONG'}`;
  const rel = Number.isFinite(btcCorr)
    ? btcCorr < 0.3 ? 'DOC_LAP' : btcCorr < 0.5 ? 'THEO_YEU' : 'THEO'
    : 'REL_NO_DATA';
  const type = page === 'ema'
    ? stageOfEma(trade)
    : normalizePart(trade.pumpSignalType ?? trade.type ?? page);
  return [type, side, tf, corr, trend, rel, gatePartOf(trade)].join(' | ');
}

function marginBucket(trade) {
  const margin = num(trade.marginUsdt ?? trade.marginUsd ?? trade.margin ?? trade.orderUsdt);
  if (margin != null && margin >= 9.5 && margin <= 10.5) return 'TEST $10';
  if (margin != null && margin > 0 && margin <= 1.01) return 'TEST $1';
  return 'Other';
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

function emptyStats(name = '') {
  return { name, total: 0, open: 0, closed: 0, win: 0, loss: 0, tp: 0, sl: 0, real: 0, live: 0, roeSum: 0 };
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

function parsePages() {
  const raw = String(arg('--page', 'pump')).toLowerCase();
  if (raw === 'all') return Object.keys(PAGE_FILES).map((page) => ({ page, type: null }));
  return raw.split(',').map((item) => {
    const page = item.trim();
    if (EMA_PAGE_ALIASES.has(page)) return { page: 'ema', type: EMA_PAGE_ALIASES.get(page) };
    return { page, type: null };
  }).filter((item) => item.page);
}

function main() {
  const day = arg('--date', arg('--day', todayUtc()));
  assertDate(day);
  const pages = parsePages();
  const explicitType = normalizeType(arg('--type', arg('--signal', '')));
  const limit = Number(arg('--limit', 30));
  const showAll = flag('--all');

  const pageSummaries = [];
  for (const pageSpec of pages) {
    const page = pageSpec.page;
    const type = explicitType || pageSpec.type;
    const files = PAGE_FILES[page];
    if (!files) {
      const emaAliases = [...EMA_PAGE_ALIASES.keys()].join(', ');
      throw new Error(`Unknown --page "${page}". Use: ${Object.keys(PAGE_FILES).join(', ')}, ${emaAliases}, all`);
    }
    const rows = files.flatMap(readRows)
      .filter((trade) => dayOfTrade(trade) === day)
      .filter((trade) => matchesPageAndType(page, type, trade));
    const total = emptyStats(page);
    const buckets = new Map();
    const combos = new Map();

    for (const trade of rows) {
      addStats(total, trade);
      const bucketName = marginBucket(trade);
      if (!buckets.has(bucketName)) buckets.set(bucketName, emptyStats(bucketName));
      addStats(buckets.get(bucketName), trade);

      const combo = fallbackCombo(page, trade);
      if (!combo || combo === '-' || combo.toUpperCase().includes('NO_DATA')) continue;
      const key = `${combo} || ${bucketName}`;
      if (!combos.has(key)) combos.set(key, { ...emptyStats(combo), combo, bucket: bucketName });
      addStats(combos.get(key), trade);
    }

    const doneTotal = finish(total);
    const title = type ? `${page.toUpperCase()} / ${type}` : page.toUpperCase();
    pageSummaries.push({ page: title, ...doneTotal });
    console.log(`\n=== ${title} ${day} ===`);
    console.log(`rows=${rows.length} open/pending=${doneTotal.open} closed=${doneTotal.closed} TP=${doneTotal.tp} SL=${doneTotal.sl} WR=${fmtPct(doneTotal.wr)} AvgROE=${fmtPct(doneTotal.avgRoe)} PnL=${fmtMoney(doneTotal.pnl)} real=${fmtMoney(doneTotal.real)} live=${fmtMoney(doneTotal.live)}`);

    printTable('Margin buckets', [...buckets.values()].map(finish).sort((a, b) => b.pnl - a.pnl), [
      ['bucket', (r) => r.name],
      ['total', (r) => r.total],
      ['open', (r) => r.open],
      ['closed', (r) => r.closed],
      ['W/L', (r) => `${r.win}/${r.loss}`],
      ['TP/SL', (r) => `${r.tp}/${r.sl}`],
      ['WR', (r) => fmtPct(r.wr)],
      ['AvgROE', (r) => fmtPct(r.avgRoe)],
      ['PnL', (r) => fmtMoney(r.pnl)],
    ]);

    const comboRows = [...combos.values()].map(finish)
      .filter((row) => showAll || row.closed > 0)
      .sort((a, b) => a.pnl - b.pnl || b.closed - a.closed)
      .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 30);
    printTable(`Worst combos by bucket (limit ${limit})`, comboRows, [
      ['bucket', (r) => r.bucket],
      ['combo', (r) => r.combo],
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

  if (pages.length > 1) {
    printTable('Page totals', pageSummaries.sort((a, b) => a.pnl - b.pnl), [
      ['page', (r) => r.page],
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
}

try {
  main();
} catch (err) {
  console.error(`[combo-stats] ${err.message}`);
  process.exitCode = 1;
}
