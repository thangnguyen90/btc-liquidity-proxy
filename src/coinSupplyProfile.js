export const COIN_SUPPLY_PROFILE_VERSION = 'COIN_SUPPLY_PROFILE_V1_20260928';

const DEFAULT_TTL_MS = 6 * 60 * 60_000;
const DEFAULT_TIMEOUT_MS = 3_500;
const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets';

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

export function coinSupplyBaseSymbol(symbol) {
  const base = String(symbol ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/(?:USDT|USDC|BUSD)$/u, '');
  return /^(?:1000000|1000|1M)[A-Z0-9]+$/u.test(base)
    ? base.replace(/^(?:1000000|1000|1M)/u, '')
    : base;
}

export function classifyCoinSupply({ circulatingSupply, marketCapUsd } = {}) {
  const circulating = finite(circulatingSupply);
  const marketCap = finite(marketCapUsd);
  if (!(circulating > 0)) {
    return {
      key: 'UNKNOWN',
      severity: 'unknown',
      label: 'CHƯA CÓ DỮ LIỆU CUNG',
      highlighted: false,
    };
  }
  if (circulating <= 20_000_000) {
    return {
      key: marketCap >= 500_000_000 ? 'LARGE_CAP_VERY_LOW_UNIT_SUPPLY' : 'VERY_LOW_UNIT_SUPPLY',
      severity: 'critical',
      label: marketCap >= 500_000_000
        ? 'CAP LỚN · CUNG ĐƠN VỊ RẤT THẤP'
        : 'CUNG ĐƠN VỊ RẤT THẤP',
      highlighted: true,
    };
  }
  if (circulating <= 100_000_000) {
    return {
      key: 'LOW_UNIT_SUPPLY',
      severity: 'warning',
      label: 'CUNG ĐƠN VỊ THẤP',
      highlighted: true,
    };
  }
  if (circulating <= 500_000_000) {
    return {
      key: 'MEDIUM_UNIT_SUPPLY',
      severity: 'watch',
      label: 'CUNG ĐƠN VỊ TRUNG BÌNH',
      highlighted: false,
    };
  }
  return {
    key: 'BROAD_UNIT_SUPPLY',
    severity: 'normal',
    label: 'CUNG ĐƠN VỊ RỘNG',
    highlighted: false,
  };
}

export function buildCoinSupplySnapshot({ profile, markPrice, binanceQuoteVolume24h } = {}) {
  if (!profile?.available) {
    return {
      version: COIN_SUPPLY_PROFILE_VERSION,
      available: false,
      reason: profile?.reason ?? 'SUPPLY_PROVIDER_UNAVAILABLE',
      source: 'CoinGecko',
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
  const circulatingSupply = finite(profile.circulatingSupply);
  const totalSupply = finite(profile.totalSupply);
  const maxSupply = finite(profile.maxSupply);
  const providerMarketCapUsd = finite(profile.marketCapUsd);
  const providerVolume24hUsd = finite(profile.volume24hUsd);
  const liveMark = finite(markPrice);
  const estimatedMarketCapUsd = circulatingSupply > 0 && liveMark > 0
    ? circulatingSupply * liveMark
    : providerMarketCapUsd;
  const marketCapUsd = estimatedMarketCapUsd > 0 ? estimatedMarketCapUsd : providerMarketCapUsd;
  const classification = classifyCoinSupply({ circulatingSupply, marketCapUsd });
  const circulatingPctOfMax = circulatingSupply > 0 && maxSupply > 0
    ? (circulatingSupply / maxSupply) * 100
    : null;
  const providerTurnoverPct = providerMarketCapUsd > 0 && providerVolume24hUsd >= 0
    ? (providerVolume24hUsd / providerMarketCapUsd) * 100
    : null;
  const binanceTurnoverPct = marketCapUsd > 0 && finite(binanceQuoteVolume24h) >= 0
    ? (finite(binanceQuoteVolume24h) / marketCapUsd) * 100
    : null;
  return {
    version: COIN_SUPPLY_PROFILE_VERSION,
    available: true,
    source: 'CoinGecko',
    providerId: profile.providerId,
    providerSymbol: profile.providerSymbol,
    name: profile.name,
    sourceUpdatedAt: profile.sourceUpdatedAt,
    fetchedAt: profile.fetchedAt,
    ambiguousMatches: profile.ambiguousMatches,
    circulatingSupply: round(circulatingSupply, 4),
    totalSupply: round(totalSupply, 4),
    maxSupply: round(maxSupply, 4),
    marketCapUsd: round(marketCapUsd, 2),
    providerMarketCapUsd: round(providerMarketCapUsd, 2),
    providerVolume24hUsd: round(providerVolume24hUsd, 2),
    circulatingPctOfMax: round(circulatingPctOfMax, 2),
    providerTurnoverPct: round(providerTurnoverPct, 2),
    binanceTurnoverPct: round(binanceTurnoverPct, 2),
    marketCapMethod: circulatingSupply > 0 && liveMark > 0
      ? 'BINANCE_MARK_X_CIRCULATING_SUPPLY'
      : 'PROVIDER_MARKET_CAP',
    classification,
    caveat: 'Cung token thấp không tự chứng minh order book mỏng; phải đối chiếu volume và độ sâu Binance.',
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

export class CoinSupplyProfileService {
  constructor({
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    ttlMs = DEFAULT_TTL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.ttlMs = ttlMs;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
    this.inflight = new Map();
  }

  async get(symbol) {
    const baseSymbol = coinSupplyBaseSymbol(symbol);
    if (!baseSymbol) throw new Error('SUPPLY_SYMBOL_INVALID');
    const cached = this.cache.get(baseSymbol);
    if (cached?.expiresAt > this.now()) return cached.profile;
    if (this.inflight.has(baseSymbol)) return this.inflight.get(baseSymbol);
    const work = this.#fetch(baseSymbol)
      .catch((error) => ({
        available: false,
        reason: String(error?.name === 'AbortError' ? 'SUPPLY_PROVIDER_TIMEOUT' : error?.message ?? error),
        fetchedAt: new Date(this.now()).toISOString(),
      }))
      .then((profile) => {
        this.cache.set(baseSymbol, {
          profile,
          expiresAt: this.now() + (profile.available ? this.ttlMs : Math.min(this.ttlMs, 15 * 60_000)),
        });
        return profile;
      })
      .finally(() => this.inflight.delete(baseSymbol));
    this.inflight.set(baseSymbol, work);
    return work;
  }

  async #fetch(baseSymbol) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = new URL(COINGECKO_MARKETS_URL);
      url.searchParams.set('vs_currency', 'usd');
      url.searchParams.set('symbols', baseSymbol.toLowerCase());
      url.searchParams.set('include_tokens', 'all');
      url.searchParams.set('precision', 'full');
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': 'btc-liquidity-proxy/0.1' },
      });
      if (!response?.ok) throw new Error(`SUPPLY_PROVIDER_HTTP_${response?.status ?? 'UNKNOWN'}`);
      const payload = await response.json();
      const exact = (Array.isArray(payload) ? payload : [])
        .filter((item) => String(item?.symbol ?? '').toUpperCase() === baseSymbol)
        .sort((left, right) => finite(right?.market_cap, -1) - finite(left?.market_cap, -1));
      const selected = exact[0];
      if (!selected) throw new Error('SUPPLY_PROVIDER_SYMBOL_NOT_FOUND');
      return {
        available: true,
        providerId: String(selected.id ?? ''),
        providerSymbol: String(selected.symbol ?? '').toUpperCase(),
        name: String(selected.name ?? baseSymbol),
        marketCapUsd: finite(selected.market_cap),
        volume24hUsd: finite(selected.total_volume),
        circulatingSupply: finite(selected.circulating_supply),
        totalSupply: finite(selected.total_supply),
        maxSupply: finite(selected.max_supply),
        sourceUpdatedAt: selected.last_updated ?? null,
        fetchedAt: new Date(this.now()).toISOString(),
        ambiguousMatches: Math.max(0, exact.length - 1),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
