export const COIN_LEVEL_ENTRY_WATCH_TIER_SORT_UI_VERSION =
  'COIN_LEVEL_ENTRY_WATCH_TIER_SORT_UI_V1_20260921';

const TIER_RANK = Object.freeze({
  VERY_STRONG: 4,
  GOOD: 3,
  WATCH: 2,
  WEAK: 1,
});

const finite = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function entryWatchTierDisplayLabel(item = {}) {
  if (item.entryTier === 'VERY_STRONG') return 'RẤT MẠNH';
  if (item.entryTier === 'GOOD') return 'MẠNH';
  if (item.entryTier === 'WATCH') return 'THEO DÕI';
  if (item.entryTier === 'WEAK') return 'YẾU';
  return item.entryTierLabel ?? item.entryTier ?? '—';
}

export function sortCoinLevelEntryWatchForDisplay(candidates = []) {
  return [...(Array.isArray(candidates) ? candidates : [])].sort((left, right) => (
    finite(TIER_RANK[right?.entryTier]) - finite(TIER_RANK[left?.entryTier])
    || finite(right?.entryScore, -1) - finite(left?.entryScore, -1)
    || Number(Boolean(right?.retestAt)) - Number(Boolean(left?.retestAt))
    || finite(right?.confirmationAt) - finite(left?.confirmationAt)
    || String(left?.symbol ?? '').localeCompare(String(right?.symbol ?? ''))
  ));
}
