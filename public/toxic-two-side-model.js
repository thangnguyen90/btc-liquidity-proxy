export const TOXIC_TWO_SIDE_OBSERVATION_VERSION = 'TOXIC_TWO_SIDE_MARKET_V1_20261001';
export const TOXIC_TWO_SIDE_UI_VERSION = 'TOXIC_TWO_SIDE_MARKET_UI_V1_20261001';

export const TOXIC_TWO_SIDE_TIERS = Object.freeze({
  EXTREME: 'QUÉT HAI ĐẦU RẤT CAO',
  HIGH: 'RỦI RO CAO',
  WATCH: 'CẦN CẢNH GIÁC',
  NORMAL: 'CHƯA ĐÁNG CHÚ Ý',
});

export function toxicTwoSideTier(score) {
  const value = Number(score);
  if (value >= 75) return 'EXTREME';
  if (value >= 60) return 'HIGH';
  if (value >= 45) return 'WATCH';
  return 'NORMAL';
}

export function toxicTwoSideCardKey(tier) {
  const normalized = String(tier ?? '').toUpperCase();
  return Object.hasOwn(TOXIC_TWO_SIDE_TIERS, normalized)
    ? `toxic-two-side:${normalized}`
    : null;
}

export function toxicTwoSideTradeKey(trade = {}) {
  const observation = trade?.toxicTwoSideObservation;
  if (observation?.version !== TOXIC_TWO_SIDE_OBSERVATION_VERSION) return null;
  return toxicTwoSideCardKey(observation.tier);
}

export function filterToxicTwoSideRows(rows = [], {
  minimumScore = 45,
  minimumQuoteVolume = 1_000_000,
  tier = 'ALL',
  query = '',
} = {}) {
  const wantedTier = String(tier ?? 'ALL').toUpperCase();
  const needle = String(query ?? '').trim().toUpperCase();
  return (Array.isArray(rows) ? rows : []).filter((row) => (
    Number(row?.score ?? 0) >= Number(minimumScore ?? 0)
    && Number(row?.quoteVolume24h ?? 0) >= Number(minimumQuoteVolume ?? 0)
    && (wantedTier === 'ALL' || row?.tier === wantedTier)
    && (!needle || String(row?.symbol ?? '').toUpperCase().includes(needle))
  ));
}

const SORTERS = Object.freeze({
  'score-desc': (a, b) => Number(b.score ?? 0) - Number(a.score ?? 0),
  'range-desc': (a, b) => Number(b.range24hPct ?? -1) - Number(a.range24hPct ?? -1),
  'turnover-desc': (a, b) => Number(b.binanceTurnoverPct ?? -1) - Number(a.binanceTurnoverPct ?? -1),
  'volume-desc': (a, b) => Number(b.quoteVolume24h ?? 0) - Number(a.quoteVolume24h ?? 0),
  'change-asc': (a, b) => Number(a.change24hPct ?? 0) - Number(b.change24hPct ?? 0),
  'sweeps-desc': (a, b) => Number(b.sweeps?.total ?? 0) - Number(a.sweeps?.total ?? 0),
  'symbol-asc': (a, b) => String(a.symbol ?? '').localeCompare(String(b.symbol ?? '')),
});

export function sortToxicTwoSideRows(rows = [], sortKey = 'score-desc') {
  const sorter = SORTERS[sortKey] ?? SORTERS['score-desc'];
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (
    sorter(a, b)
    || Number(b.score ?? 0) - Number(a.score ?? 0)
    || String(a.symbol ?? '').localeCompare(String(b.symbol ?? ''))
  ));
}
