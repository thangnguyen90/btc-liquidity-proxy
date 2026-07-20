import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function loadDotEnv() {
  const file = path.resolve(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadDotEnv();

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

const DISCORD_REPORT_WINDOWS = [1, 3, 5, 7, 30];
const RECOMMENDATION_PAGES = new Set(['ema', 'pump', 'liquid', 'edge']);
const RECOMMENDATION_FILE = path.resolve(ROOT, 'data/recommended-signals.json');

function arg(name, fallback = null) {
  const eq = process.argv.find((item) => item.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function previousUtcDay() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function assertDate(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Invalid date "${day}". Use YYYY-MM-DD UTC.`);
  }
}

function addUtcDays(day, amount) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isDayInRange(day, from, to) {
  return day >= from && day <= to;
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

function dayOfTrade(trade) {
  const raw = trade.createdAt ?? trade.openedAt ?? trade.time ?? trade.closedAt ?? trade.updatedAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw).toISOString().slice(0, 10);
  const text = String(raw ?? '');
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
}

function normalizePart(value) {
  return String(value ?? '-')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[|]/g, '_')
    .toUpperCase()
    .slice(0, 96) || '-';
}

function isEmaTrade(trade) {
  const source = sourceOf(trade);
  return source.startsWith('emasq-') || source.includes('ema-squeeze') || Boolean(trade.emaStageGateLabel);
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

function tfOf(trade) {
  const source = sourceOf(trade);
  return source.match(/(?:emasq|pump|cap|edge|ppks|liq|shakeout|top)-(\d+[mh])-/)?.[1]
    ?? trade.pumpSignalTimeframe
    ?? trade.timeframe
    ?? trade.tf
    ?? '-';
}

function scoreOf(trade) {
  const fromSource = sourceOf(trade).match(/-(\d{2,5})(?:-|$)/)?.[1];
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
  if (sourceOf(trade).startsWith('ppks')) return 'Post Pump Kill Short';
  return normalizePart(trade.pumpSignalType ?? trade.type ?? page);
}

function marginBucket(trade) {
  const margin = num(trade.marginUsdt ?? trade.marginUsd ?? trade.margin ?? trade.orderUsdt);
  if (margin != null && margin >= 9.5 && margin <= 10.5) return 'TEST_$10';
  if (margin != null && margin > 0 && margin <= 1.01) return 'TEST_$1';
  if (margin != null && margin > 0) return `TEST_$${String(margin).replace(/\./g, '_')}`;
  return 'OTHER';
}

function emaComboForReport(trade) {
  const stage = stageOfEma(trade);
  const side = normalizePart(trade.side);
  const tf = String(tfOf(trade) ?? '-');
  const corr = num(trade.btcCorr);
  const corrBucket = corr == null
    ? 'BTC_CORR_NO_DATA'
    : corr < 0.3 ? 'BTC_CORR_RAC' : corr < 0.5 ? 'BTC_CORR_YEU' : 'BTC_CORR_THEO';
  const phase = btcPhase(trade);
  const dir = phase.match(/^BTC_(UP|DOWN|FLAT)_/)?.[1] ?? '';
  const expected = side === 'LONG' ? 'UP' : side === 'SHORT' ? 'DOWN' : '';
  const relation = corr != null && corr < 0.3
    ? 'DOC_LAP'
    : corr != null && corr < 0.5
      ? 'THEO_YEU'
      : dir && expected
        ? (dir === expected ? 'THUAN_BTC' : 'NGUOC_BTC')
        : 'REL_NO_DATA';
  const note = String(trade.note ?? '');
  const gate = [
    trade.emaStageGateLabel,
    trade.breakoutMarketRegimeLabel,
    trade.breakoutChaseLabel,
    trade.breakoutBtcTurnClusterLabel,
    trade.runnerPreWeakLabel,
    trade.runnerSessionTestLabel,
    trade.brMarketRegimeLabel,
  ].find(Boolean)
    ?? note.match(/(?:emaStageGate|breakoutMarketRegime|breakoutChase|runnerPreGate|marketRegime)=([^|]+)/i)?.[1]?.trim()
    ?? '-';
  return [stage, side, tf, corrBucket, phase, relation, `GATE_${normalizePart(gate)}`].join(' | ');
}

function fallbackCombo(page, trade) {
  if (trade.combo) return String(trade.combo);
  if (trade.pumpCombo) return String(trade.pumpCombo);
  // Pump Combo Stats also contains EMA-derived trades. Keep this key identical
  // to the dashboard so recommendations can match the visible combo cards.
  if ((page === 'pump' || page === 'ema') && isEmaTrade(trade)) {
    return emaComboForReport(trade);
  }
  return [
    signalType(page, trade),
    normalizePart(trade.side),
    normalizePart(tfOf(trade)),
    btcPhase(trade),
    relationOf(trade),
    `SCORE_${scoreBucket(trade).replace(/^SCORE_/, '')}`,
  ].join(' | ');
}

function emptyStats(extra = {}) {
  return {
    total: 0,
    open: 0,
    closed: 0,
    win: 0,
    loss: 0,
    tp: 0,
    sl: 0,
    be: 0,
    real: 0,
    live: 0,
    roeSum: 0,
    ...extra,
  };
}

function addStats(group, trade) {
  const status = String(trade.status ?? '').toUpperCase();
  const outcome = String(trade.outcome ?? status).toUpperCase();
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
  else group.be += 1;
  if (outcome.includes('TP')) group.tp += 1;
  if (outcome.includes('SL')) group.sl += 1;
}

function finish(row) {
  const pnl = row.real + row.live;
  const decisive = row.win + row.loss;
  const wr = decisive ? row.win / decisive * 100 : null;
  const avgRoe = row.closed ? row.roeSum / row.closed : null;
  return {
    ...row,
    pnl,
    wr,
    avgRoe,
    verdict: verdictOf(row.closed, pnl, avgRoe),
    sizeHint: sizeHintOf(row.closed, pnl, avgRoe),
  };
}

function verdictOf(closed, pnl, avgRoe) {
  if (!closed) return 'NO_SAMPLE';
  if (closed >= 10 && pnl > 0 && avgRoe >= 1) return 'STRONG';
  if (closed >= 5 && pnl > 0 && avgRoe >= 0.5) return 'GOOD';
  if (pnl < 0 || avgRoe < -0.2) return 'BAD';
  return 'NEUTRAL';
}

function sizeHintOf(closed, pnl, avgRoe) {
  const verdict = verdictOf(closed, pnl, avgRoe);
  if (verdict === 'STRONG' || verdict === 'GOOD') return 'TEST_$10';
  if (verdict === 'BAD') return 'TEST_$1';
  return 'TEST_SMALL';
}

function csvEscape(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function round(value, digits = 4) {
  return value == null || !Number.isFinite(Number(value)) ? '' : Number(value).toFixed(digits);
}

function writeCsv(file, rows, columns) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    columns.map(([name]) => csvEscape(name)).join(','),
    ...rows.map((row, idx) => columns.map(([, getter]) => csvEscape(getter(row, idx))).join(',')),
  ];
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

function writeJsonAtomic(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function recommendationId(page, phase, combo) {
  return cryptoHash(`${page}|${phase}|${combo}`);
}

function cryptoHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function persistRecommendations(date, outRoot, windowReports) {
  const activeDate = addUtcDays(date, 1);
  const merged = new Map();
  for (const report of windowReports) {
    for (const row of report.rows) {
      if (!RECOMMENDATION_PAGES.has(row.page)) continue;
      const key = `${row.page}|${row.phase}|${row.combo}`;
      const current = merged.get(key) ?? {
        id: recommendationId(row.page, row.phase, row.combo),
        page: row.page,
        btcPhase: row.phase,
        combo: row.combo,
        signalType: row.type,
        side: row.side,
        timeframe: row.timeframe,
        scoreBucket: row.scoreBucket,
        relation: row.relation,
        matchedWindows: [],
        samples: [],
      };
      current.matchedWindows.push(report.days);
      current.samples.push({
        days: report.days,
        fromDateUtc: report.from,
        closed: row.closed,
        win: row.win,
        loss: row.loss,
        wr: row.wr,
        avgRoe: row.avgRoe,
        pnl: row.pnl,
        marginBucket: row.margin,
      });
      merged.set(key, current);
    }
  }
  const recommendations = [...merged.values()]
    .map((row) => {
      const matchedWindows = [...new Set(row.matchedWindows)].sort((a, b) => a - b);
      const decisionSample = [...row.samples].sort((a, b) => b.days - a.days)[0];
      const peakSample = [...row.samples].sort((a, b) => b.avgRoe - a.avgRoe || b.wr - a.wr || b.closed - a.closed)[0];
      const robustStrong = matchedWindows.length >= 2
        && Number(decisionSample?.closed ?? 0) >= 12
        && Number(decisionSample?.wr ?? 0) >= 80
        && Number(decisionSample?.avgRoe ?? -Infinity) >= 3
        && Number(decisionSample?.pnl ?? 0) > 0;
      return {
        ...row,
        matchedWindows,
        strength: robustStrong ? 'STRONG' : 'GOOD',
        bestSample: decisionSample,
        decisionSample,
        peakSample,
      };
    })
    .sort((a, b) => Number(b.strength === 'STRONG') - Number(a.strength === 'STRONG')
      || b.bestSample.avgRoe - a.bestSample.avgRoe
      || b.bestSample.closed - a.bestSample.closed);
  let store = { version: 1, updatedAt: null, criteria: {}, days: {} };
  try {
    if (fs.existsSync(RECOMMENDATION_FILE)) store = JSON.parse(fs.readFileSync(RECOMMENDATION_FILE, 'utf8'));
  } catch {}
  store.version = 1;
  store.updatedAt = new Date().toISOString();
  store.criteria = {
    minClosed: envNumber('DAILY_BEST_COMBO_MIN_CLOSED', 8),
    minWr: envNumber('DAILY_BEST_COMBO_MIN_WR', 80),
    minAvgRoe: envNumber('DAILY_BEST_COMBO_MIN_AVG_ROE', 3),
    windows: DISCORD_REPORT_WINDOWS,
  };
  store.days = store.days && typeof store.days === 'object' ? store.days : {};
  store.days[activeDate] = {
    activeDateUtc: activeDate,
    basedOnDateUtc: date,
    generatedAt: store.updatedAt,
    recommendations,
  };
  const keepDays = Object.keys(store.days).sort().slice(-120);
  store.days = Object.fromEntries(keepDays.map((day) => [day, store.days[day]]));
  writeJsonAtomic(RECOMMENDATION_FILE, store);
  writeJsonAtomic(path.join(outRoot, 'recommended-signals.json'), store.days[activeDate]);
  return { activeDate, count: recommendations.length };
}

function bestComboScore(row) {
  const avgRoe = num(row.avgRoe, -999);
  const pnl = num(row.pnl, -999);
  const closedBonus = Math.min(row.closed ?? 0, 50) / 10;
  const wrBonus = row.wr == null ? 0 : row.wr / 100;
  if ((row.closed ?? 0) < 5) return -9999 + avgRoe + pnl / 100;
  return avgRoe * 10 + pnl + closedBonus + wrBonus;
}

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function envNumber(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function fmtDiscordMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.000';
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(3)}`;
}

function fmtDiscordPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(1)}%`;
}

function shortCombo(text, limit = 150) {
  const clean = String(text ?? '-').replace(/\s*\|\s*/g, ' | ');
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 3)}...`;
}

function selectBestCombos(rows, { limit = null } = {}) {
  const minClosed = envNumber('DAILY_BEST_COMBO_MIN_CLOSED', 8);
  const minWr = envNumber('DAILY_BEST_COMBO_MIN_WR', 80);
  const minAvgRoe = envNumber('DAILY_BEST_COMBO_MIN_AVG_ROE', 3);
  const selected = rows
    .filter((row) => row.closed >= minClosed)
    .filter((row) => Number(row.wr) >= minWr)
    .filter((row) => Number(row.avgRoe) >= minAvgRoe)
    .sort((a, b) => Number(b.avgRoe) - Number(a.avgRoe)
      || Number(b.wr) - Number(a.wr)
      || (b.win ?? 0) - (a.win ?? 0)
      || Number(b.pnl) - Number(a.pnl)
      || (b.closed ?? 0) - (a.closed ?? 0));
  return limit == null ? selected : selected.slice(0, Math.max(1, limit));
}

function selectDiscordBestCombos(rows) {
  const limit = Math.max(1, Math.floor(envNumber('DAILY_BEST_COMBO_LIMIT', 15)));
  return selectBestCombos(rows, { limit });
}

function selectRecommendationCombos(rows) {
  const selected = selectBestCombos(rows);
  const bestByCombo = new Map();
  for (const row of selected) {
    const key = `${row.page}|${row.phase}|${row.combo}`;
    const current = bestByCombo.get(key);
    if (!current
        || Number(row.avgRoe) > Number(current.avgRoe)
        || (Number(row.avgRoe) === Number(current.avgRoe) && Number(row.wr) > Number(current.wr))
        || (Number(row.avgRoe) === Number(current.avgRoe)
          && Number(row.wr) === Number(current.wr)
          && Number(row.closed) > Number(current.closed))) {
      bestByCombo.set(key, row);
    }
  }
  return [...bestByCombo.values()];
}

async function postDiscordMessage(webhookUrl, message) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(typeof message === 'string' ? { content: message } : message),
    });
    if (res.ok) return;
    const body = await res.text();
    if (res.status !== 429 || attempt === 3) {
      throw new Error(`Discord webhook failed: ${res.status} ${body}`);
    }
    let retryMs = 1500;
    try {
      const parsed = JSON.parse(body);
      retryMs = Math.max(250, Number(parsed.retry_after) * 1000 || retryMs);
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
}

function discordWindowColor(days, hasRows) {
  if (!hasRows) return 0xe74c3c;
  switch (days) {
    case 1: return 0x2ecc71;
    case 3: return 0x3498db;
    case 5: return 0xf1c40f;
    case 7: return 0xe67e22;
    case 30: return 0x9b59b6;
    default: return 0x95a5a6;
  }
}

async function postDiscordBestCombos(date, outRoot, windowReports) {
  const webhookUrl = process.env.DAILY_BEST_COMBO_WEBHOOK_URL || '';
  if (!webhookUrl || boolEnv('DAILY_BEST_COMBO_DISCORD_DISABLED', false) || hasArg('--dry-run')) return false;
  const minClosed = envNumber('DAILY_BEST_COMBO_MIN_CLOSED', 8);
  const minWr = envNumber('DAILY_BEST_COMBO_MIN_WR', 80);
  const minAvgRoe = envNumber('DAILY_BEST_COMBO_MIN_AVG_ROE', 3);
  for (const report of windowReports) {
    const title = `BEST SIGNALS ${report.label} (${report.from} -> ${date} UTC)`;
    const fields = report.rows.length
      ? report.rows.map((row, idx) => ({
        name: `${idx + 1}. ${row.page.toUpperCase()} | ${row.phase} | ${row.margin}`.slice(0, 256),
        value: [
          `**${shortCombo(row.combo)}**`,
          `Closed **${row.closed}** | W/L **${row.win}/${row.loss}** | WR **${fmtDiscordPct(row.wr)}**`,
          `AvgROE **${fmtDiscordPct(row.avgRoe)}** | PnL **${fmtDiscordMoney(row.pnl)}**`,
        ].join('\n').slice(0, 1024),
        inline: false,
      }))
      : [{
        name: 'NO MATCH',
        value: `No combo matched for ${report.label}.`,
        inline: false,
      }];
    await postDiscordMessage(webhookUrl, {
      embeds: [{
        title,
        description: [
          '**Pages:** EMA | PUMP | LIQUID | EDGE',
          `**Rule:** WR >= ${minWr}% | closed >= ${minClosed} | AvgROE >= ${minAvgRoe}%`,
        ].join('\n'),
        color: discordWindowColor(report.days, report.rows.length > 0),
        fields,
        footer: { text: `CSV: ${outRoot}`.slice(0, 2048) },
        timestamp: new Date().toISOString(),
      }],
    });
  }
  return true;
}

function verdictRank(verdict) {
  switch (String(verdict ?? '').toUpperCase()) {
    case 'STRONG': return 0;
    case 'GOOD': return 1;
    case 'NEUTRAL': return 2;
    case 'NO_SAMPLE': return 3;
    case 'BAD': return 4;
    default: return 5;
  }
}

function sortGoodSignalsFirst(a, b) {
  return verdictRank(a.verdict) - verdictRank(b.verdict)
    || (b.win ?? 0) - (a.win ?? 0)
    || num(b.avgRoe, -999) - num(a.avgRoe, -999)
    || num(b.pnl, -999) - num(a.pnl, -999)
    || (b.closed ?? 0) - (a.closed ?? 0)
    || String(a.page).localeCompare(String(b.page))
    || String(a.phase).localeCompare(String(b.phase))
    || String(a.type).localeCompare(String(b.type));
}

function addToMap(map, key, extra, trade) {
  if (!map.has(key)) map.set(key, emptyStats(extra));
  addStats(map.get(key), trade);
}

function pageList() {
  const raw = String(arg('--page', 'all')).toLowerCase();
  if (raw === 'all') return Object.keys(PAGE_FILES);
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function buildComboRows(pageData, pages, from, to, { byMargin = false } = {}) {
  const comboRows = [];
  for (const page of pages) {
    const combos = new Map();
    const rows = (pageData.get(page) ?? []).filter((trade) => isDayInRange(dayOfTrade(trade), from, to));
    for (const trade of rows) {
      const phase = btcPhase(trade);
      const type = normalizePart(signalType(page, trade));
      const side = normalizePart(trade.side);
      const tf = normalizePart(tfOf(trade));
      const score = scoreBucket(trade);
      const margin = marginBucket(trade);
      const relation = relationOf(trade);
      const combo = fallbackCombo(page, trade);
      if (combo.toUpperCase().includes('NO_DATA')) continue;
      const statsMargin = byMargin ? margin : 'ALL_SIZES';
      addToMap(combos, `${phase}|${combo}|${statsMargin}`, {
        page,
        phase,
        combo,
        margin: statsMargin,
        type,
        side,
        timeframe: tf,
        scoreBucket: score,
        relation,
      }, trade);
    }
    comboRows.push(...[...combos.values()].map(finish));
  }
  return comboRows;
}

async function main() {
  const date = arg('--date', previousUtcDay());
  assertDate(date);
  const outArg = arg('--out', null);
  const outBase = process.env.DAILY_SIGNAL_REPORT_ROOT;
  const outRoot = outArg
    ? path.resolve(ROOT, outArg)
    : outBase
      ? path.resolve(outBase, date)
      : path.resolve(ROOT, `reports/daily-signal/${date}`);
  const pages = pageList();
  const pageData = new Map();
  for (const page of pages) {
    const files = PAGE_FILES[page];
    if (!files) throw new Error(`Unknown --page "${page}". Use ${Object.keys(PAGE_FILES).join(', ')} or all.`);
    pageData.set(page, files.flatMap(readRows).filter((trade) => {
      if (page === 'ema') return isEmaTrade(trade);
      if (page === 'pump') return !isEmaTrade(trade);
      return true;
    }));
  }
  const pageRows = [];
  const phaseRows = [];
  const signalRows = [];
  const comboRows = [];

  for (const page of pages) {
    const rows = (pageData.get(page) ?? []).filter((trade) => dayOfTrade(trade) === date);
    const pageStats = emptyStats({ page });
    const phases = new Map();
    const signals = new Map();
    const combos = new Map();

    for (const trade of rows) {
      const phase = btcPhase(trade);
      const type = normalizePart(signalType(page, trade));
      const side = normalizePart(trade.side);
      const tf = normalizePart(tfOf(trade));
      const score = scoreBucket(trade);
      const margin = marginBucket(trade);
      const relation = relationOf(trade);
      const combo = fallbackCombo(page, trade);

      addStats(pageStats, trade);
      addToMap(phases, phase, { page, phase }, trade);
      addToMap(signals, `${phase}|${type}|${side}|${score}`, { page, phase, type, side, scoreBucket: score }, trade);
      if (!combo.toUpperCase().includes('NO_DATA')) {
        addToMap(combos, `${phase}|${combo}`, {
          page,
          phase,
          combo,
          margin: 'ALL_SIZES',
          type,
          side,
          timeframe: tf,
          scoreBucket: score,
          relation,
        }, trade);
      }
    }

    pageRows.push(finish(pageStats));
    phaseRows.push(...[...phases.values()].map(finish));
    signalRows.push(...[...signals.values()].map(finish));
    comboRows.push(...[...combos.values()].map(finish));
  }

  const baseCols = [
    ['total', (r) => r.total],
    ['open', (r) => r.open],
    ['closed', (r) => r.closed],
    ['win', (r) => r.win],
    ['loss', (r) => r.loss],
    ['be', (r) => r.be],
    ['tp', (r) => r.tp],
    ['sl', (r) => r.sl],
    ['wr_pct', (r) => round(r.wr, 2)],
    ['avg_roe_pct', (r) => round(r.avgRoe, 2)],
    ['pnl', (r) => round(r.pnl, 4)],
    ['realized', (r) => round(r.real, 4)],
    ['live', (r) => round(r.live, 4)],
    ['verdict', (r) => r.verdict],
    ['size_hint', (r) => r.sizeHint],
  ];

  writeCsv(path.join(outRoot, 'page-summary.csv'), pageRows.sort((a, b) => a.pnl - b.pnl), [
    ['date_utc', () => date],
    ['page', (r) => r.page],
    ...baseCols,
  ]);
  writeCsv(path.join(outRoot, 'btc-phase-summary.csv'), phaseRows.sort((a, b) => a.page.localeCompare(b.page) || a.phase.localeCompare(b.phase)), [
    ['date_utc', () => date],
    ['page', (r) => r.page],
    ['btc_phase', (r) => r.phase],
    ...baseCols,
  ]);
  writeCsv(path.join(outRoot, 'signal-by-btc-phase.csv'), signalRows.sort(sortGoodSignalsFirst), [
    ['date_utc', () => date],
    ['page', (r) => r.page],
    ['btc_phase', (r) => r.phase],
    ['signal_type', (r) => r.type],
    ['side', (r) => r.side],
    ['score_bucket', (r) => r.scoreBucket],
    ...baseCols,
  ]);
  writeCsv(path.join(outRoot, 'combo-by-btc-phase.csv'), comboRows.sort((a, b) => a.page.localeCompare(b.page) || a.phase.localeCompare(b.phase) || a.avgRoe - b.avgRoe), [
    ['date_utc', () => date],
    ['page', (r) => r.page],
    ['btc_phase', (r) => r.phase],
    ['combo', (r) => r.combo],
    ['margin_bucket', (r) => r.margin],
    ['signal_type', (r) => r.type],
    ['side', (r) => r.side],
    ['timeframe', (r) => r.timeframe],
    ['score_bucket', (r) => r.scoreBucket],
    ['btc_relation', (r) => r.relation],
    ...baseCols,
  ]);

  const bestComboRows = comboRows
    .filter((row) => row.closed >= 5)
    .sort((a, b) => bestComboScore(b) - bestComboScore(a) || b.closed - a.closed || b.pnl - a.pnl)
    .slice(0, 200);

  writeCsv(path.join(outRoot, 'best-combos-by-day.csv'), bestComboRows, [
    ['date_utc', () => date],
    ['rank', (_r, idx) => idx + 1],
    ['page', (r) => r.page],
    ['btc_phase', (r) => r.phase],
    ['combo', (r) => r.combo],
    ['margin_bucket', (r) => r.margin],
    ['signal_type', (r) => r.type],
    ['side', (r) => r.side],
    ['timeframe', (r) => r.timeframe],
    ['score_bucket', (r) => r.scoreBucket],
    ['btc_relation', (r) => r.relation],
    ['best_score', (r) => round(bestComboScore(r), 4)],
    ...baseCols,
  ]);

  const recommendationWindowReports = DISCORD_REPORT_WINDOWS.map((days) => {
    const from = addUtcDays(date, -(days - 1));
    // Combo cards display the configured TEST $ bucket. Evaluate each margin
    // independently so historical size changes do not dilute a strong combo.
    const rows = selectRecommendationCombos(buildComboRows(pageData, pages, from, date, { byMargin: false }));
    return { days, label: days === 1 ? '1 DAY' : `${days} DAYS`, from, rows };
  });
  const windowReports = recommendationWindowReports.map((report) => ({
    ...report,
    rows: selectDiscordBestCombos(report.rows),
  }));
  const discordBestComboRows = windowReports.flatMap((report) => report.rows.map((row) => ({
    ...row,
    windowDays: report.days,
    fromDate: report.from,
  })));
  writeCsv(path.join(outRoot, 'discord-best-combos.csv'), discordBestComboRows, [
    ['date_utc', () => date],
    ['window_days', (r) => r.windowDays],
    ['from_date_utc', (r) => r.fromDate],
    ['rank', (_r, idx) => idx + 1],
    ['page', (r) => r.page],
    ['btc_phase', (r) => r.phase],
    ['combo', (r) => r.combo],
    ['margin_bucket', (r) => r.margin],
    ['closed', (r) => r.closed],
    ['win', (r) => r.win],
    ['loss', (r) => r.loss],
    ['wr_pct', (r) => round(r.wr, 2)],
    ['avg_roe_pct', (r) => round(r.avgRoe, 2)],
    ['pnl', (r) => round(r.pnl, 4)],
  ]);
  const recommendationResult = persistRecommendations(date, outRoot, recommendationWindowReports);
  const postedDiscord = await postDiscordBestCombos(date, outRoot, windowReports);

  const summary = [
    `Daily signal report ${date}`,
    `Output: ${outRoot}`,
    `Pages: ${pages.join(', ')}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    'CSV files:',
    '- page-summary.csv',
    '- btc-phase-summary.csv',
    '- signal-by-btc-phase.csv',
    '- combo-by-btc-phase.csv',
    '- best-combos-by-day.csv',
    '- discord-best-combos.csv',
    '- recommended-signals.json',
    '',
    `Discord best combo windows: ${DISCORD_REPORT_WINDOWS.join(', ')} days`,
    `Discord best combo: ${postedDiscord ? 'sent' : 'skipped'}`,
    `Recommendations active ${recommendationResult.activeDate}: ${recommendationResult.count}`,
  ].join('\n');
  fs.writeFileSync(path.join(outRoot, 'README.txt'), `${summary}\n`, 'utf8');
  console.log(summary);
}

try {
  await main();
} catch (err) {
  console.error(`[daily-signal-report] ${err.message}`);
  process.exitCode = 1;
}
