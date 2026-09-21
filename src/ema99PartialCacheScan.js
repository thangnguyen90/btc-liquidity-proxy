export const EMA99_PARTIAL_CACHE_SCAN_VERSION =
  'EMA99_PARTIAL_CACHE_SCAN_V1_READY_PAIRS_20260910';

export const EMA99_PARTIAL_CACHE_MIN_BARS = 165;

export function ema99PartialCacheCoverage(
  cache,
  symbolsInput,
  { minBars = EMA99_PARTIAL_CACHE_MIN_BARS } = {},
) {
  const symbols = [...new Set((Array.isArray(symbolsInput) ? symbolsInput : [])
    .map((symbol) => String(symbol ?? '').trim().toUpperCase())
    .filter(Boolean))];
  const requiredBars = Math.max(1, Number(minBars) || EMA99_PARTIAL_CACHE_MIN_BARS);
  const ready5m = symbols.length ? cache.countReady(symbols, '5m', requiredBars) : 0;
  const ready15m = symbols.length ? cache.countReady(symbols, '15m', requiredBars) : 0;
  const readyPairs = ready5m + ready15m;

  return {
    version: EMA99_PARTIAL_CACHE_SCAN_VERSION,
    mode: 'PARTIAL_CACHE_READY_PAIRS',
    totalSymbols: symbols.length,
    minBars: requiredBars,
    ready5m,
    ready15m,
    readyPairs,
    ready: readyPairs > 0,
  };
}
