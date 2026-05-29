const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

const BTC_ETFS = [
  { symbol: 'IBIT', name: 'BlackRock IBIT', weight: 1.00 },
  { symbol: 'FBTC', name: 'Fidelity FBTC', weight: 0.78 },
  { symbol: 'GBTC', name: 'Grayscale GBTC', weight: 0.70 },
  { symbol: 'ARKB', name: 'ARK 21Shares ARKB', weight: 0.48 },
  { symbol: 'BITB', name: 'Bitwise BITB', weight: 0.45 },
  { symbol: 'HODL', name: 'VanEck HODL', weight: 0.24 },
  { symbol: 'BRRR', name: 'Valkyrie BRRR', weight: 0.18 },
  { symbol: 'EZBC', name: 'Franklin EZBC', weight: 0.18 },
  { symbol: 'BTCW', name: 'WisdomTree BTCW', weight: 0.14 },
];

const ETH_ETFS = [
  { symbol: 'ETHA', name: 'BlackRock ETHA', weight: 1.00 },
  { symbol: 'FETH', name: 'Fidelity FETH', weight: 0.76 },
  { symbol: 'ETHE', name: 'Grayscale ETHE', weight: 0.68 },
  { symbol: 'ETHW', name: 'Bitwise ETHW', weight: 0.42 },
  { symbol: 'ETHV', name: 'VanEck ETHV', weight: 0.24 },
  { symbol: 'CETH', name: '21Shares CETH', weight: 0.18 },
  { symbol: 'EZET', name: 'Franklin EZET', weight: 0.16 },
  { symbol: 'QETH', name: 'Invesco QETH', weight: 0.14 },
];

const GROUPS = [
  { asset: 'BTC', spotSymbol: 'BTC-USD', binanceSymbol: 'BTCUSDT', etfs: BTC_ETFS },
  { asset: 'ETH', spotSymbol: 'ETH-USD', binanceSymbol: 'ETHUSDT', etfs: ETH_ETFS },
];

let etfProxyCache = { data: null, expiresAt: 0 };
let etfProxyInflight = null;

function nyDate(tsSec) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(tsSec * 1000));
}

function median(values) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function fetchYahooChart(symbol) {
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=5d&interval=5m&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      'accept': 'application/json',
      'user-agent': 'btc-liquidity-proxy/0.1.0',
    },
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol} ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error(`Yahoo ${symbol} empty`);

  const quote = result.indicators?.quote?.[0] ?? {};
  return result.timestamp.map((ts, i) => ({
    ts,
    open: Number(quote.open?.[i]),
    high: Number(quote.high?.[i]),
    low: Number(quote.low?.[i]),
    close: Number(quote.close?.[i]),
    volume: Number(quote.volume?.[i]),
  })).filter((bar) =>
    Number.isFinite(bar.close) &&
    Number.isFinite(bar.volume) &&
    bar.volume >= 0
  );
}

function summarizeSpot(bars) {
  if (!bars.length) return null;
  const latestDate = nyDate(bars[bars.length - 1].ts);
  const today = bars.filter((bar) => nyDate(bar.ts) === latestDate);
  const scope = today.length ? today : bars;
  const first = scope.find((bar) => Number.isFinite(bar.open)) ?? scope[0];
  const last = scope[scope.length - 1];
  return {
    price: last.close,
    pctChange: first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0,
    updatedAt: last.ts * 1000,
  };
}

function summarizeEtf(symbolInfo, bars) {
  if (!bars.length) return null;
  const latestDate = nyDate(bars[bars.length - 1].ts);
  const today = bars.filter((bar) => nyDate(bar.ts) === latestDate);
  if (!today.length) return null;

  const byDate = new Map();
  for (const bar of bars) {
    const d = nyDate(bar.ts);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(bar);
  }

  const prevDayDollarVolumes = [...byDate.entries()]
    .filter(([date]) => date !== latestDate)
    .map(([, dayBars]) => dayBars.reduce((sum, bar) => sum + bar.close * bar.volume, 0))
    .filter((v) => v > 0);

  const first = today.find((bar) => Number.isFinite(bar.open)) ?? today[0];
  const last = today[today.length - 1];
  const dollarVolume = today.reduce((sum, bar) => sum + bar.close * bar.volume, 0);
  const buyDollarFlow = today.reduce((sum, bar) => {
    const open = Number.isFinite(bar.open) ? bar.open : bar.close;
    return bar.close >= open ? sum + bar.close * bar.volume : sum;
  }, 0);
  const sellDollarFlow = today.reduce((sum, bar) => {
    const open = Number.isFinite(bar.open) ? bar.open : bar.close;
    return bar.close < open ? sum + bar.close * bar.volume : sum;
  }, 0);
  const netDollarFlow = buyDollarFlow - sellDollarFlow;
  const avgDollarVolume = median(prevDayDollarVolumes);
  const relVolume = avgDollarVolume > 0 ? dollarVolume / avgDollarVolume : null;
  const pctChange = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  const pressure = pctChange * clamp(relVolume ?? 1, 0.25, 3) * symbolInfo.weight;

  return {
    symbol: symbolInfo.symbol,
    name: symbolInfo.name,
    price: last.close,
    pctChange,
    dollarVolume,
    buyDollarFlow,
    sellDollarFlow,
    netDollarFlow,
    avgDollarVolume,
    relVolume,
    pressure,
    bars: today.length,
    updatedAt: last.ts * 1000,
  };
}

function classifyGroup(score, breadth, volumeX) {
  if (score >= 65 && breadth >= 0.45) return 'ETF_BUY_PRESSURE';
  if (score <= -65 && breadth <= -0.45) return 'ETF_SELL_PRESSURE';
  if (Math.abs(score) >= 45 && Math.abs(breadth) < 0.25) return 'ETF_MIXED_FLOW';
  if (volumeX >= 1.4 && Math.abs(score) < 28) return 'ETF_FAKE_VOLUME';
  return 'ETF_NEUTRAL';
}

async function summarizeGroup(group) {
  const rows = await Promise.allSettled([
    fetchYahooChart(group.spotSymbol).then(summarizeSpot),
    ...group.etfs.map(async (info) => {
      const bars = await fetchYahooChart(info.symbol);
      return summarizeEtf(info, bars);
    }),
  ]);

  const spotResult = rows[0];
  const spot = spotResult.status === 'fulfilled' ? spotResult.value : null;

  const etfs = rows.slice(1)
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value)
    .sort((a, b) => Math.abs(b.pressure) - Math.abs(a.pressure));

  const errors = rows
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason?.message ?? String(r.reason));

  const totalWeight = etfs.reduce((sum, etf) => {
    const info = group.etfs.find((x) => x.symbol === etf.symbol);
    return sum + (info?.weight ?? 1);
  }, 0) || 1;

  const pressureRaw = etfs.reduce((sum, etf) => sum + etf.pressure, 0) / totalWeight;
  const score = Math.round(clamp(pressureRaw * 24, -100, 100));
  const breadth = etfs.length
    ? etfs.reduce((sum, etf) => sum + (etf.pctChange > 0 ? 1 : etf.pctChange < 0 ? -1 : 0), 0) / etfs.length
    : 0;
  const dollarVolume = etfs.reduce((sum, etf) => sum + etf.dollarVolume, 0);
  const buyDollarFlow = etfs.reduce((sum, etf) => sum + etf.buyDollarFlow, 0);
  const sellDollarFlow = etfs.reduce((sum, etf) => sum + etf.sellDollarFlow, 0);
  const netDollarFlow = buyDollarFlow - sellDollarFlow;
  const avgDollarVolume = etfs.reduce((sum, etf) => sum + (etf.avgDollarVolume || 0), 0);
  const volumeX = avgDollarVolume > 0 ? dollarVolume / avgDollarVolume : 0;

  return {
    asset: group.asset,
    binanceSymbol: group.binanceSymbol,
    mark: spot?.price ?? null,
    spotPctChange: spot?.pctChange ?? null,
    spotUpdatedAt: spot?.updatedAt ?? null,
    type: classifyGroup(score, breadth, volumeX),
    score,
    breadth,
    volumeX,
    dollarVolume,
    buyDollarFlow,
    sellDollarFlow,
    netDollarFlow,
    netFlowPct: dollarVolume > 0 ? (netDollarFlow / dollarVolume) * 100 : 0,
    avgDollarVolume,
    etfs,
    errors,
    note: 'Intraday ETF proxy only; official ETF net flow is usually confirmed after US market close.',
  };
}

export async function getEtfProxy({ client, ttlMs = 60_000 } = {}) {
  const now = Date.now();
  if (etfProxyCache.data && now < etfProxyCache.expiresAt) return etfProxyCache.data;
  if (etfProxyInflight) return etfProxyInflight;

  etfProxyInflight = Promise.all(GROUPS.map((group) => summarizeGroup(group)))
    .then((assets) => {
      const data = {
        assets,
        scannedAt: Date.now(),
        source: 'Yahoo Finance intraday ETF chart + Yahoo BTC-USD/ETH-USD spot proxy',
      };
      etfProxyCache = { data, expiresAt: Date.now() + ttlMs };
      etfProxyInflight = null;
      return data;
    })
    .catch((err) => {
      etfProxyInflight = null;
      throw err;
    });

  return etfProxyInflight;
}
