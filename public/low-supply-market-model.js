export const LOW_SUPPLY_MARKET_UI_VERSION = 'LOW_SUPPLY_MARKET_UI_V2_COLUMN_SORT_20260928';

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function filterLowSupplyRows(rows, {
  minimumMarketCapUsd = 4_000_000_000,
  maximumCirculatingSupply = 15_000_000,
  query = '',
} = {}) {
  const needle = String(query ?? '').trim().toUpperCase();
  const minimumCap = Math.max(0, finite(minimumMarketCapUsd, 0));
  const maximumSupply = Math.max(0, finite(maximumCirculatingSupply, Number.MAX_VALUE));
  return (Array.isArray(rows) ? rows : []).filter((row) => (
    finite(row?.marketCapUsd, -1) >= minimumCap
    && finite(row?.circulatingSupply, Number.MAX_VALUE) < maximumSupply
    && (!needle || `${row?.symbol ?? ''} ${row?.name ?? ''}`.toUpperCase().includes(needle))
  ));
}

export function sortLowSupplyRows(rows, sortKey = 'circulating-asc') {
  const output = [...(Array.isArray(rows) ? rows : [])];
  const match = String(sortKey).match(/^(symbol|severity|market-cap|circulating|total-supply|max-supply|float-pct|volume|turnover|change|updated)-(asc|desc)$/);
  const [, column = 'circulating', direction = 'asc'] = match ?? [];
  const multiplier = direction === 'desc' ? -1 : 1;
  const numericColumns = {
    'market-cap': 'marketCapUsd',
    circulating: 'circulatingSupply',
    'total-supply': 'totalSupply',
    'max-supply': 'maxSupply',
    'float-pct': 'circulatingPctOfMax',
    volume: 'volume24hUsd',
    turnover: 'turnoverPct',
    change: 'change24hPct',
  };
  const severityOrder = { critical: 0, warning: 1, watch: 2, normal: 3, unknown: 4 };
  const compareNullable = (leftValue, rightValue, compare) => {
    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    return compare(leftValue, rightValue) * multiplier;
  };
  const comparator = (left, right) => {
    if (numericColumns[column]) {
      return compareNullable(
        finite(left?.[numericColumns[column]], null),
        finite(right?.[numericColumns[column]], null),
        (a, b) => a - b,
      );
    }
    if (column === 'updated') {
      const timestamp = (value) => {
        const parsed = Date.parse(value ?? '');
        return Number.isFinite(parsed) ? parsed : null;
      };
      return compareNullable(timestamp(left?.sourceUpdatedAt), timestamp(right?.sourceUpdatedAt), (a, b) => a - b);
    }
    if (column === 'severity') {
      return compareNullable(
        severityOrder[left?.classification?.severity] ?? severityOrder.unknown,
        severityOrder[right?.classification?.severity] ?? severityOrder.unknown,
        (a, b) => a - b,
      );
    }
    return String(left?.symbol ?? '').localeCompare(String(right?.symbol ?? ''), 'en') * multiplier;
  };
  return output.sort((left, right) => comparator(left, right)
    || finite(right.marketCapUsd, -1) - finite(left.marketCapUsd, -1)
    || String(left.symbol).localeCompare(String(right.symbol)));
}

export function describeLowSupplySort(sortKey = 'circulating-asc') {
  const match = String(sortKey).match(/^(symbol|severity|market-cap|circulating|total-supply|max-supply|float-pct|volume|turnover|change|updated)-(asc|desc)$/);
  const [, column = 'circulating', direction = 'asc'] = match ?? [];
  const labels = {
    symbol: 'coin',
    severity: 'phân loại',
    'market-cap': 'market cap',
    circulating: 'cung lưu hành',
    'total-supply': 'tổng cung',
    'max-supply': 'max supply',
    'float-pct': 'lưu hành / max',
    volume: 'volume 24h',
    turnover: 'volume / cap',
    change: 'biến động 24h',
    updated: 'nguồn cập nhật',
  };
  return `${labels[column] ?? labels.circulating} ${direction === 'desc' ? 'giảm dần' : 'tăng dần'}`;
}
