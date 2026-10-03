import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { classifyCoinSupply, coinSupplyBaseSymbol } from './coinSupplyProfile.js';

export const COIN_SUPPLY_MARKET_VERSION = 'COIN_SUPPLY_MARKET_V2_ID_DIRECTORY_20260928';
export const COIN_SUPPLY_MARKET_DEFAULT_FILTER = Object.freeze({
  minimumMarketCapUsd: 4_000_000_000,
  maximumCirculatingSupply: 15_000_000,
});

const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets';
const COINGECKO_COIN_LIST_URL = 'https://api.coingecko.com/api/v3/coins/list';
const DEFAULT_TTL_MS = 6 * 60 * 60_000;
const DEFAULT_RETRY_TTL_MS = 15 * 60_000;

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeProviderRow(item, fetchedAt) {
  const marketCapUsd = finite(item?.market_cap);
  const volume24hUsd = finite(item?.total_volume);
  const circulatingSupply = finite(item?.circulating_supply);
  const totalSupply = finite(item?.total_supply);
  const maxSupply = finite(item?.max_supply);
  return {
    providerId: String(item?.id ?? ''),
    providerSymbol: String(item?.symbol ?? '').toUpperCase(),
    name: String(item?.name ?? item?.symbol ?? ''),
    marketCapRank: finite(item?.market_cap_rank),
    priceUsd: round(finite(item?.current_price), 10),
    change24hPct: round(finite(item?.price_change_percentage_24h), 2),
    marketCapUsd: round(marketCapUsd, 2),
    volume24hUsd: round(volume24hUsd, 2),
    circulatingSupply: round(circulatingSupply, 4),
    totalSupply: round(totalSupply, 4),
    maxSupply: round(maxSupply, 4),
    circulatingPctOfMax: circulatingSupply > 0 && maxSupply > 0
      ? round((circulatingSupply / maxSupply) * 100, 2)
      : null,
    turnoverPct: marketCapUsd > 0 && volume24hUsd >= 0
      ? round((volume24hUsd / marketCapUsd) * 100, 2)
      : null,
    sourceUpdatedAt: item?.last_updated ?? null,
    fetchedAt,
  };
}

function selectLargestMarketCapPerSymbol(payload, fetchedAt) {
  const selected = new Map();
  for (const item of Array.isArray(payload) ? payload : []) {
    const symbol = String(item?.symbol ?? '').toUpperCase();
    if (!symbol) continue;
    const current = selected.get(symbol);
    if (!current || finite(item?.market_cap, -1) > finite(current?.market_cap, -1)) {
      selected.set(symbol, item);
    }
  }
  return [...selected.values()].map((item) => normalizeProviderRow(item, fetchedAt));
}

export function buildCoinSupplyMarketSnapshot({ symbols = [], providerRows = [], state = {} } = {}) {
  const normalizedSymbols = (Array.isArray(symbols) ? symbols : [])
    .map((item) => ({
      symbol: String(item?.symbol ?? '').toUpperCase(),
      baseSymbol: coinSupplyBaseSymbol(item?.baseAsset ?? item?.symbol),
    }))
    .filter((item) => item.symbol && item.baseSymbol);
  const providerMap = new Map((Array.isArray(providerRows) ? providerRows : [])
    .map((row) => [String(row?.providerSymbol ?? '').toUpperCase(), row]));
  const rows = normalizedSymbols.flatMap(({ symbol, baseSymbol }) => {
    const provider = providerMap.get(baseSymbol);
    if (!provider || !(provider.circulatingSupply > 0) || !(provider.marketCapUsd > 0)) return [];
    return [{
      symbol,
      baseSymbol,
      ...provider,
      classification: classifyCoinSupply(provider),
    }];
  }).sort((left, right) => left.circulatingSupply - right.circulatingSupply
    || right.marketCapUsd - left.marketCapUsd
    || left.symbol.localeCompare(right.symbol));
  const defaultMatches = rows.filter((row) => (
    row.marketCapUsd >= COIN_SUPPLY_MARKET_DEFAULT_FILTER.minimumMarketCapUsd
    && row.circulatingSupply < COIN_SUPPLY_MARKET_DEFAULT_FILTER.maximumCirculatingSupply
  ));
  return {
    version: COIN_SUPPLY_MARKET_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'CoinGecko',
    sourceFetchedAt: state.fetchedAt ?? null,
    refreshStatus: state.refreshStatus ?? 'UNKNOWN',
    batchErrors: Array.isArray(state.batchErrors) ? state.batchErrors : [],
    universe: {
      binanceUsdtPerpetualCount: normalizedSymbols.length,
      providerCoverageCount: rows.length,
      providerMissingCount: Math.max(0, normalizedSymbols.length - rows.length),
      coveragePct: normalizedSymbols.length
        ? round((rows.length / normalizedSymbols.length) * 100, 2)
        : 0,
    },
    defaultFilter: { ...COIN_SUPPLY_MARKET_DEFAULT_FILTER },
    defaultMatchCount: defaultMatches.length,
    defaultMatchSymbols: defaultMatches.map((row) => row.symbol),
    rows,
    observeOnly: true,
    execution: {
      binanceEnabled: false,
      affectsEntry: false,
      affectsSize: false,
      affectsStopLoss: false,
      affectsTakeProfit: false,
    },
  };
}

export class CoinSupplyMarketService {
  constructor({
    file = null,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    ttlMs = DEFAULT_TTL_MS,
    retryTtlMs = DEFAULT_RETRY_TTL_MS,
    batchSize = 200,
    concurrency = 1,
    timeoutMs = 8_000,
  } = {}) {
    this.file = file;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.ttlMs = ttlMs;
    this.retryTtlMs = retryTtlMs;
    this.batchSize = Math.min(220, Math.max(1, batchSize));
    this.concurrency = Math.max(1, concurrency);
    this.timeoutMs = timeoutMs;
    this.loaded = false;
    this.state = null;
    this.inflight = null;
  }

  async getSnapshot(symbols) {
    await this.#load();
    const expiresAt = Number(this.state?.expiresAt ?? 0);
    if (!this.state || expiresAt <= this.now()) {
      if (!this.inflight) {
        this.inflight = this.#refresh(symbols).finally(() => { this.inflight = null; });
      }
      await this.inflight;
    }
    return buildCoinSupplyMarketSnapshot({
      symbols,
      providerRows: this.state?.rows ?? [],
      state: this.state ?? {},
    });
  }

  async #load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file) return;
    try {
      const payload = JSON.parse(await readFile(this.file, 'utf8'));
      if (payload?.version === COIN_SUPPLY_MARKET_VERSION && Array.isArray(payload.rows)) {
        this.state = payload;
      }
    } catch {
      // First run or an invalid cache must not block the page.
    }
  }

  async #fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': 'btc-liquidity-proxy/0.1' },
      });
      if (!response?.ok) throw new Error(`HTTP_${response?.status ?? 'UNKNOWN'}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async #fetchTopMarketPage() {
    const url = new URL(COINGECKO_MARKETS_URL);
    url.searchParams.set('vs_currency', 'usd');
    url.searchParams.set('order', 'market_cap_desc');
    url.searchParams.set('per_page', '250');
    url.searchParams.set('page', '1');
    url.searchParams.set('precision', 'full');
    return this.#fetchJson(url);
  }

  async #fetchCoinList() {
    const url = new URL(COINGECKO_COIN_LIST_URL);
    url.searchParams.set('include_platform', 'false');
    return this.#fetchJson(url);
  }

  async #fetchIdBatch(ids) {
    const url = new URL(COINGECKO_MARKETS_URL);
    url.searchParams.set('vs_currency', 'usd');
    url.searchParams.set('ids', ids.join(','));
    url.searchParams.set('per_page', '250');
    url.searchParams.set('page', '1');
    url.searchParams.set('precision', 'full');
    return this.#fetchJson(url);
  }

  async #refresh(symbols) {
    const baseSymbols = [...new Set((Array.isArray(symbols) ? symbols : [])
      .map((item) => coinSupplyBaseSymbol(item?.baseAsset ?? item?.symbol))
      .filter(Boolean))];
    const previous = new Map((this.state?.rows ?? [])
      .map((row) => [String(row?.providerSymbol ?? '').toUpperCase(), row]));
    const rows = new Map(previous);
    const batchErrors = [];
    const fetchedAt = new Date(this.now()).toISOString();
    try {
      const topMarket = await this.#fetchTopMarketPage();
      for (const row of selectLargestMarketCapPerSymbol(topMarket, fetchedAt)) {
        rows.set(row.providerSymbol, row);
      }
    } catch (error) {
      batchErrors.push({ batch: 'TOP_250', symbols: 250, reason: String(error?.message ?? error) });
    }

    let coinList = [];
    try {
      coinList = await this.#fetchCoinList();
    } catch (error) {
      batchErrors.push({ batch: 'COIN_LIST', symbols: baseSymbols.length, reason: String(error?.message ?? error) });
    }
    const wanted = new Set(baseSymbols);
    const candidates = new Map();
    for (const item of Array.isArray(coinList) ? coinList : []) {
      const symbol = String(item?.symbol ?? '').toUpperCase();
      const id = String(item?.id ?? '');
      if (!wanted.has(symbol) || !id) continue;
      const list = candidates.get(symbol) ?? [];
      list.push({ id, name: String(item?.name ?? '') });
      candidates.set(symbol, list);
    }
    const providerIds = [];
    for (const symbol of baseSymbols) {
      const matches = candidates.get(symbol) ?? [];
      matches.sort((left, right) => {
        const score = (item) => (item.id.toUpperCase() === symbol ? 0
          : item.name.toUpperCase() === symbol ? 1
            : item.id.toUpperCase().startsWith(`${symbol}-`) ? 2 : 3);
        return score(left) - score(right) || left.id.localeCompare(right.id);
      });
      providerIds.push(...matches.slice(0, 2).map((item) => item.id));
    }
    const batches = chunks([...new Set(providerIds)], this.batchSize);
    let cursor = 0;
    const worker = async () => {
      while (cursor < batches.length) {
        const index = cursor;
        cursor += 1;
        const batch = batches[index];
        try {
          const payload = await this.#fetchIdBatch(batch);
          for (const row of selectLargestMarketCapPerSymbol(payload, fetchedAt)) {
            rows.set(row.providerSymbol, row);
          }
        } catch (error) {
          batchErrors.push({
            batch: `IDS_${index + 1}`,
            symbols: batch.length,
            reason: String(error?.name === 'AbortError' ? 'TIMEOUT' : error?.message ?? error),
          });
        }
        if (cursor < batches.length) await delay(250);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, batches.length || 1) }, worker));
    this.state = {
      version: COIN_SUPPLY_MARKET_VERSION,
      fetchedAt,
      expiresAt: this.now() + (batchErrors.length ? this.retryTtlMs : this.ttlMs),
      refreshStatus: batchErrors.length ? 'PARTIAL' : 'COMPLETE',
      batchErrors,
      requestedBaseSymbols: baseSymbols.length,
      rows: [...rows.values()],
    };
    await this.#save();
  }

  async #save() {
    if (!this.file || !this.state) return;
    const temporary = `${this.file}.tmp-${process.pid}-${this.now()}`;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
      await rename(temporary, this.file);
    } catch (error) {
      console.warn(`[CoinSupplyMarket] cache write failed: ${error.message}`);
    }
  }
}
