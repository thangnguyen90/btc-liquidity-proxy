export const POST_MOVE_DUAL_DIRECTION_UI_VERSION = 'POST_MOVE_DUAL_DIRECTION_UI_V1_20260924';

function activeKeys(snapshot) {
  const keys = new Set();
  for (const frame of snapshot?.timeframes ?? []) {
    for (const item of frame?.items ?? []) {
      if (!item?.symbol || item.status === 'WEAKENED') continue;
      keys.add(`${frame.interval}|${item.symbol}`);
    }
  }
  return keys;
}

export function buildDualDirectionKeys(primarySnapshot, oppositeSnapshot) {
  const primary = activeKeys(primarySnapshot);
  const opposite = activeKeys(oppositeSnapshot);
  return new Set([...primary].filter((key) => opposite.has(key)));
}

export function dualDirectionKey(item) {
  return `${item?.interval ?? ''}|${item?.symbol ?? ''}`;
}

export function isDualDirection(item, keys) {
  return keys instanceof Set && keys.has(dualDirectionKey(item));
}
