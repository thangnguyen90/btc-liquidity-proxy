import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[$,%\s,]/g, ''));
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
  if (Array.isArray(input.rows)) return input.rows;
  if (Array.isArray(input.items)) return input.items;
  if (Array.isArray(input.events)) return input.events;
  if (Array.isArray(input.unlocks)) return input.unlocks;
  if (Array.isArray(input.data)) return input.data;
  if (input.data && typeof input.data === 'object') {
    if (Array.isArray(input.data.rows)) return input.data.rows;
    if (Array.isArray(input.data.items)) return input.data.items;
    if (Array.isArray(input.data.events)) return input.data.events;
    if (Array.isArray(input.data.unlocks)) return input.data.unlocks;
    if (Array.isArray(input.data.data)) return input.data.data;
  }
  return [];
}

function coinKey(raw) {
  return String(raw ?? '')
    .replace(/USDT$/i, '')
    .replace(/USD$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .trim();
}

function parseDate(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeUnlockRow(row) {
  const symbol = coinKey(pick(row, ['symbol', 'coin', 'token', 'ticker', 'baseAsset', 'asset', 'slug']));
  const unlockDate = parseDate(pick(row, [
    'unlockDate', 'unlock_date', 'date', 'time', 'timestamp', 'eventTime', 'event_time',
    'nextUnlockDate', 'next_unlock_date',
  ]));
  if (!symbol || !unlockDate) return null;

  const unlockAmount = num(pick(row, [
    'unlockAmount', 'unlock_amount', 'amount', 'tokens', 'tokenAmount', 'token_amount',
    'quantity', 'qty', 'unlock_tokens',
  ]));
  const unlockValueUsd = num(pick(row, [
    'unlockValueUsd', 'unlock_value_usd', 'valueUsd', 'value_usd', 'usdValue',
    'usd_value', 'value', 'unlockValue', 'unlock_value',
  ]));
  const percentSupply = num(pick(row, [
    'percentSupply', 'percent_supply', 'supplyPct', 'supply_pct', 'circulatingPercent',
    'circulating_percent', 'percentOfSupply', 'percent_of_supply', 'unlockPercent',
    'unlock_percent',
  ]));
  const percentMarketCap = num(pick(row, [
    'percentMarketCap', 'percent_market_cap', 'marketCapPct', 'market_cap_pct',
    'mcapPct', 'mcap_pct',
  ]));

  return {
    symbol,
    name: String(pick(row, ['name', 'projectName', 'project_name', 'tokenName', 'token_name']) ?? symbol),
    unlockDate,
    unlockAmount,
    unlockValueUsd,
    percentSupply,
    percentMarketCap,
    allocation: String(pick(row, ['allocation', 'category', 'round', 'investor', 'typeName', 'type_name']) ?? ''),
    unlockType: String(pick(row, ['unlockType', 'unlock_type', 'type', 'eventType', 'event_type']) ?? ''),
    sourceUrl: String(pick(row, ['sourceUrl', 'source_url', 'url', 'link']) ?? ''),
    raw: row,
  };
}

export function tokenUnlocksConfig(env = process.env) {
  return {
    apiUrl: env.TOKEN_UNLOCKS_API_URL || env.TOKEN_UNLOCK_API_URL || '',
    apiKey: env.TOKEN_UNLOCKS_API_KEY || env.TOKEN_UNLOCK_API_KEY || env.CRYPTORANK_API_KEY || '',
    refreshMs: Math.max(60 * 60_000, Number(env.TOKEN_UNLOCKS_REFRESH_MS ?? 24 * 60 * 60_000)),
    timeoutMs: Math.max(2000, Number(env.TOKEN_UNLOCKS_FETCH_TIMEOUT_MS ?? 15_000)),
    horizonDays: Math.max(1, Math.min(730, Number(env.TOKEN_UNLOCKS_HORIZON_DAYS ?? 180))),
  };
}

export async function loadTokenUnlocks(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    const rows = flattenRows(parsed).map(normalizeUnlockRow).filter(Boolean);
    return {
      ...parsed,
      rows,
      updatedAt: parsed.updatedAt ?? parsed.createdAt ?? null,
      configured: Boolean(parsed.configured),
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      error: parsed.error ?? null,
    };
  } catch {
    return { rows: [], updatedAt: null, configured: false, sources: [], error: null };
  }
}

export async function saveTokenUnlocks(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function fetchConfiguredUnlocks(cfg) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const headers = { accept: 'application/json' };
    if (cfg.apiKey) {
      headers.authorization = `Bearer ${cfg.apiKey}`;
      headers['x-api-key'] = cfg.apiKey;
    }
    const res = await fetch(cfg.apiUrl, { headers, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`Token unlock API HTTP ${res.status}: ${text.slice(0, 180)}`);
    const json = JSON.parse(text);
    return flattenRows(json).map(normalizeUnlockRow).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

export function enrichTokenUnlocks(rows, cfg = tokenUnlocksConfig()) {
  const now = Date.now();
  const maxTime = now + cfg.horizonDays * 24 * 60 * 60_000;
  const upcoming = [...(rows ?? [])]
    .filter((row) => {
      const t = Date.parse(row.unlockDate);
      return Number.isFinite(t) && t >= now - 24 * 60 * 60_000 && t <= maxTime;
    })
    .sort((a, b) => Date.parse(a.unlockDate) - Date.parse(b.unlockDate));

  const totalValue30d = upcoming
    .filter((row) => Date.parse(row.unlockDate) <= now + 30 * 24 * 60 * 60_000)
    .reduce((sum, row) => sum + (Number(row.unlockValueUsd) || 0), 0);

  return {
    rows: upcoming,
    stats: {
      total: upcoming.length,
      next7d: upcoming.filter((row) => Date.parse(row.unlockDate) <= now + 7 * 24 * 60 * 60_000).length,
      next30d: upcoming.filter((row) => Date.parse(row.unlockDate) <= now + 30 * 24 * 60 * 60_000).length,
      totalValue30d,
      largeUnlocks30d: upcoming.filter((row) => {
        const t = Date.parse(row.unlockDate);
        return t <= now + 30 * 24 * 60 * 60_000
          && ((Number(row.unlockValueUsd) || 0) >= 10_000_000 || (Number(row.percentSupply) || 0) >= 1);
      }).length,
    },
  };
}

export async function fetchTokenUnlocksBoard({ cfg = tokenUnlocksConfig(), filePayload = null } = {}) {
  if (!cfg.apiUrl) {
    const enriched = enrichTokenUnlocks(filePayload?.rows ?? [], cfg);
    return {
      ...filePayload,
      ...enriched,
      updatedAt: filePayload?.updatedAt ?? new Date().toISOString(),
      configured: false,
      error: filePayload?.rows?.length ? null : 'Missing TOKEN_UNLOCKS_API_URL. You can also populate data/token-unlocks.json manually.',
      sources: filePayload?.sources ?? [],
    };
  }

  const rows = await fetchConfiguredUnlocks(cfg);
  const enriched = enrichTokenUnlocks(rows, cfg);
  return {
    ...enriched,
    updatedAt: new Date().toISOString(),
    configured: true,
    error: null,
    sources: [{ source: cfg.apiUrl, ok: true, count: rows.length }],
  };
}

export function getUnlockSummaryForSymbol(payload, symbol) {
  const key = coinKey(symbol);
  const rows = (payload?.rows ?? [])
    .filter((row) => row.symbol === key)
    .sort((a, b) => Date.parse(a.unlockDate) - Date.parse(b.unlockDate));
  if (!rows.length) return null;

  const now = Date.now();
  const next30 = rows.filter((row) => Date.parse(row.unlockDate) <= now + 30 * 24 * 60 * 60_000);
  const totalValueUsd30d = next30.reduce((sum, row) => sum + (Number(row.unlockValueUsd) || 0), 0);
  const totalAmount30d = next30.reduce((sum, row) => sum + (Number(row.unlockAmount) || 0), 0);
  const maxPercentSupply30d = Math.max(0, ...next30.map((row) => Number(row.percentSupply) || 0));
  const maxPercentMarketCap30d = Math.max(0, ...next30.map((row) => Number(row.percentMarketCap) || 0));

  return {
    symbol: key,
    next: rows[0],
    next30d: {
      count: next30.length,
      totalAmount: totalAmount30d || null,
      totalValueUsd: totalValueUsd30d || null,
      maxPercentSupply: maxPercentSupply30d || null,
      maxPercentMarketCap: maxPercentMarketCap30d || null,
    },
    sourceUpdatedAt: payload?.updatedAt ?? null,
    configured: Boolean(payload?.configured),
  };
}
