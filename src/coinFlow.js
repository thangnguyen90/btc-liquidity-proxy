import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const COINGLASS_BASE = 'https://open-api-v4.coinglass.com/api';

function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pick(row, names) {
  for (const name of names) {
    if (row && Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return null;
}

function flattenRows(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.data)) return input.data;
  if (Array.isArray(input.list)) return input.list;
  if (Array.isArray(input.rows)) return input.rows;
  if (input.data && typeof input.data === 'object') {
    if (Array.isArray(input.data.list)) return input.data.list;
    if (Array.isArray(input.data.rows)) return input.data.rows;
    if (Array.isArray(input.data.data)) return input.data.data;
  }
  return [];
}

function normalizeSymbol(raw) {
  return String(raw ?? '')
    .replace(/USDT$/i, '')
    .replace(/USD$/i, '')
    .toUpperCase()
    .trim();
}

function normalizeFlowRow(row, market = 'spot') {
  const symbol = normalizeSymbol(pick(row, ['symbol', 'coin', 'currency', 'baseAsset', 'base_asset']));
  if (!symbol) return null;

  const netflow = num(pick(row, ['netflow', 'netFlow', 'net_flow', 'netInflow', 'net_inflow', 'netInflowUsd', 'net_inflow_usd', 'flow']));
  const inflow = num(pick(row, ['inflow', 'inFlow', 'in_flow', 'inflowUsd', 'inflow_usd']));
  const outflow = num(pick(row, ['outflow', 'outFlow', 'out_flow', 'outflowUsd', 'outflow_usd']));
  const netflowUsd = num(pick(row, ['netflow_usd', 'netFlowUsd', 'netflowUsd', 'netInflowUsd', 'net_inflow_usd']));
  const volumeUsd = num(pick(row, ['volumeUsd', 'volume_usd', 'volUsd', 'vol_usd', 'turnover', 'quoteVolume']));
  const marketCap = num(pick(row, ['marketCap', 'market_cap', 'mcap']));

  const tf = pick(row, ['timeType', 'time_type', 'interval', 'period', 'time']) ?? '';
  const values = {
    netflow,
    inflow,
    outflow,
    netflowUsd: netflowUsd ?? netflow,
    volumeUsd,
    marketCap,
  };

  return {
    symbol,
    market,
    interval: String(tf || '').toLowerCase(),
    raw: row,
    ...values,
  };
}

function collectIntervals(row) {
  const out = {};
  const scan = (obj, prefix = '') => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      const k = `${prefix}${key}`.toLowerCase();
      if (value && typeof value === 'object' && !Array.isArray(value)) scan(value, `${k}_`);
      const n = num(value);
      if (n == null) continue;
      if (/(1h|hour|h1)/.test(k) && /net|flow/.test(k)) out.h1 = n;
      if (/(4h|h4)/.test(k) && /net|flow/.test(k)) out.h4 = n;
      if (/(24h|1d|day|d1)/.test(k) && /net|flow/.test(k)) out.d1 = n;
      if (/(7d|week|d7)/.test(k) && /net|flow/.test(k)) out.d7 = n;
    }
  };
  scan(row);
  return out;
}

function mergeBySymbol(rows) {
  const map = new Map();
  for (const row of rows) {
    const norm = normalizeFlowRow(row);
    if (!norm) continue;
    const cur = map.get(norm.symbol) ?? {
      symbol: norm.symbol,
      spot: {},
      rawRows: [],
    };
    cur.rawRows.push(row);
    const intervals = collectIntervals(row);
    if (norm.interval.includes('1h')) cur.spot.h1 = norm.netflowUsd;
    if (norm.interval.includes('4h')) cur.spot.h4 = norm.netflowUsd;
    if (norm.interval.includes('24') || norm.interval.includes('1d') || norm.interval.includes('day')) cur.spot.d1 = norm.netflowUsd;
    if (norm.interval.includes('7')) cur.spot.d7 = norm.netflowUsd;
    Object.assign(cur.spot, Object.fromEntries(Object.entries(intervals).filter(([, v]) => v != null)));
    cur.inflow = norm.inflow ?? cur.inflow ?? null;
    cur.outflow = norm.outflow ?? cur.outflow ?? null;
    cur.netflowUsd = norm.netflowUsd ?? cur.netflowUsd ?? null;
    cur.volumeUsd = norm.volumeUsd ?? cur.volumeUsd ?? null;
    cur.marketCap = norm.marketCap ?? cur.marketCap ?? null;
    map.set(norm.symbol, cur);
  }
  return [...map.values()];
}

function scoreCoinFlow(row, snapshot = null) {
  const spot24h = num(row.spot?.d1 ?? row.netflowUsd);
  const spot4h = num(row.spot?.h4);
  const spot1h = num(row.spot?.h1);
  const quoteVolume = num(snapshot?.quoteVolume ?? row.volumeUsd);
  const change24h = num(snapshot?.change24hPct ?? snapshot?.priceChangePercent);
  const ratio = quoteVolume && spot24h != null ? spot24h / quoteVolume : null;

  let score = 50;
  const reasons = [];

  const applyFlow = (value, label, weight) => {
    if (value == null) return;
    if (value < 0) {
      score += weight;
      reasons.push(`${label} net outflow`);
    } else if (value > 0) {
      score -= weight;
      reasons.push(`${label} net inflow`);
    }
  };

  applyFlow(spot24h, '24h', 18);
  applyFlow(spot4h, '4h', 11);
  applyFlow(spot1h, '1h', 7);

  if (ratio != null) {
    const abs = Math.abs(ratio);
    if (abs >= 0.08) {
      score += ratio < 0 ? 14 : -14;
      reasons.push(`${ratio < 0 ? 'outflow' : 'inflow'} ${Math.round(abs * 100)}% of volume`);
    } else if (abs >= 0.03) {
      score += ratio < 0 ? 7 : -7;
      reasons.push(`${ratio < 0 ? 'outflow' : 'inflow'} ${Math.round(abs * 100)}% of volume`);
    }
  }

  if (change24h != null) {
    if (spot24h != null && spot24h < 0 && change24h >= 0) {
      score += 6;
      reasons.push('price holding while coins leave exchanges');
    } else if (spot24h != null && spot24h > 0 && change24h <= 0) {
      score -= 6;
      reasons.push('price weak while coins enter exchanges');
    } else if (spot24h != null && spot24h > 0 && change24h > 3) {
      reasons.push('possible sell supply into rally');
    } else if (spot24h != null && spot24h < 0 && change24h < -3) {
      reasons.push('outflow during selloff, watch absorption');
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const bias = score >= 65 ? 'BULLISH'
    : score <= 35 ? 'BEARISH'
      : 'NEUTRAL';

  return {
    flowScore: score,
    bias,
    ratio,
    quoteVolume,
    change24h,
    reasons,
  };
}

export function coinFlowConfig(env = process.env) {
  return {
    apiKey: env.COINGLASS_API_KEY || env.CG_API_KEY || '',
    baseUrl: env.COINGLASS_BASE_URL || COINGLASS_BASE,
    perPage: Math.max(20, Math.min(500, Number(env.COIN_FLOW_PER_PAGE ?? 150))),
    refreshMs: Math.max(5 * 60_000, Number(env.COIN_FLOW_REFRESH_MS ?? 60 * 60_000)),
    timeoutMs: Math.max(2000, Number(env.COIN_FLOW_FETCH_TIMEOUT_MS ?? 12_000)),
  };
}

async function coinglassGet(path, params, cfg) {
  const url = new URL(`${cfg.baseUrl}${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'CG-API-KEY': cfg.apiKey, 'accept': 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`CoinGlass HTTP ${res.status}: ${text.slice(0, 180)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCoinFlow(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return { rows: [], updatedAt: null, sources: [], error: null, configured: false };
  }
}

export async function saveCoinFlow(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

export async function fetchCoinFlowBoard({ cfg = coinFlowConfig(), snapshotMap = new Map() } = {}) {
  if (!cfg.apiKey) {
    return {
      rows: [],
      updatedAt: new Date().toISOString(),
      configured: false,
      error: 'Missing COINGLASS_API_KEY or CG_API_KEY.',
      sources: [],
    };
  }

  const sources = [];
  const rows = [];
  const spot = await coinglassGet('/spot/netflow-list', { page: 1, per_page: cfg.perPage }, cfg);
  const spotRows = flattenRows(spot);
  sources.push({ source: 'CoinGlass spot/netflow-list', ok: true, count: spotRows.length });
  rows.push(...spotRows);

  const merged = mergeBySymbol(rows).map((row) => {
    const snap = snapshotMap.get(`${row.symbol}USDT`) ?? snapshotMap.get(row.symbol);
    const flow = scoreCoinFlow(row, snap);
    return {
      ...row,
      ...flow,
      markPrice: num(snap?.markPrice),
      symbolPair: `${row.symbol}USDT`,
      rawRows: undefined,
    };
  }).sort((a, b) => {
    if (Math.abs((b.flowScore ?? 50) - (a.flowScore ?? 50)) >= 5) return (b.flowScore ?? 0) - (a.flowScore ?? 0);
    return Math.abs(b.ratio ?? 0) - Math.abs(a.ratio ?? 0);
  });

  return {
    rows: merged,
    updatedAt: new Date().toISOString(),
    configured: true,
    error: null,
    sources,
  };
}
