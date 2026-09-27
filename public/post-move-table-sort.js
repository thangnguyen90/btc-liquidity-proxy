export const POST_MOVE_TABLE_SORT_VERSION = 'POST_MOVE_TABLE_SORT_V1_20260924';

export function nextPostMoveSort(current, key, defaultDirection = 'desc') {
  if (current?.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: defaultDirection === 'asc' ? 'asc' : 'desc' };
}

export function sortPostMoveRows(rows, sort, getValue) {
  const source = Array.isArray(rows) ? rows : [];
  if (!sort?.key || typeof getValue !== 'function') return [...source];
  const direction = sort.direction === 'asc' ? 1 : -1;
  return source
    .map((row, index) => ({ row, index, value: getValue(row, sort.key) }))
    .sort((a, b) => {
      const aMissing = a.value == null || (typeof a.value === 'number' && !Number.isFinite(a.value));
      const bMissing = b.value == null || (typeof b.value === 'number' && !Number.isFinite(b.value));
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (aMissing && bMissing) return a.index - b.index;
      const compared = typeof a.value === 'string' || typeof b.value === 'string'
        ? String(a.value).localeCompare(String(b.value), 'vi', { numeric: true, sensitivity: 'base' })
        : Number(a.value) - Number(b.value);
      return compared === 0 ? a.index - b.index : compared * direction;
    })
    .map(({ row }) => row);
}
