export const COIN_LEVEL_OBSERVE_SORT_UI_VERSION = 'COIN_LEVEL_OBSERVE_SORT_UI_V1_20260923';

const numeric = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const observedTime = (value) => {
  const number = numeric(value);
  return number ?? (Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);
};

export function observeSortValue(item = {}, side = 'LONG', key = '', patternLabel = () => '') {
  switch (key) {
    case 'coin': return String(item.symbol ?? '').toUpperCase();
    case 'setup': return item.setupMode === 'BREAKDOWN_PRESSURE' ? 'BREAKDOWN' : 'XẢ SAU BƠM';
    case 'pattern': return String(patternLabel(item) ?? '');
    case 'price': return numeric(item.livePrice) > 0 ? numeric(item.livePrice) : numeric(item.priceAtWatch);
    case 'distance': {
      const gap = numeric(side === 'LONG' ? item.breakoutGapPct
        : item.setupMode === 'BREAKDOWN_PRESSURE' ? item.breakdownGapPct : item.pullbackPct);
      return gap == null ? null : Math.abs(gap);
    }
    case 'volume': return numeric(item.volumeRatio);
    case 'volumeUsdt': return numeric(item.quoteVolumeUsdt);
    case 'taker': return numeric(side === 'LONG' ? item.takerBuyPct : item.takerSellPct);
    case 'score': return numeric(item.earlyScore);
    case 'range': return numeric(item.rangeAtr);
    case 'trigger': return numeric(side === 'LONG' ? item.breakoutLevel
      : item.setupMode === 'BREAKDOWN_PRESSURE' ? item.breakdownLevel : item.pumpPct);
    case 'zone': return numeric(item.entryZone?.low);
    case 'invalidation': return numeric(item.invalidationPrice);
    case 'time': return observedTime(item.observedAt);
    default: return null;
  }
}

export function sortCoinLevelObserveWatches(watches = [], side = 'LONG', sort = {}, patternLabel = () => '') {
  const list = Array.isArray(watches) ? [...watches] : [];
  if (!sort.key || !['asc', 'desc'].includes(sort.direction)) return list;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return list.map((item, index) => ({ item, index })).sort((left, right) => {
    const a = observeSortValue(left.item, side, sort.key, patternLabel);
    const b = observeSortValue(right.item, side, sort.key, patternLabel);
    if (a == null) return b == null ? left.index - right.index : 1;
    if (b == null) return -1;
    const comparison = typeof a === 'string'
      ? a.localeCompare(String(b), 'vi', { numeric: true })
      : a - b;
    return factor * comparison || left.index - right.index;
  }).map(({ item }) => item);
}

export function nextObserveSort(current = {}, key = '') {
  const textKey = ['coin', 'setup', 'pattern'].includes(key);
  return {
    key,
    direction: current.key === key && current.direction === 'asc'
      ? 'desc'
      : current.key === key && current.direction === 'desc'
        ? 'asc'
        : textKey || key === 'distance' ? 'asc' : 'desc',
  };
}
