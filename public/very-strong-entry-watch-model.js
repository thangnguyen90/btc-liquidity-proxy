export const VERY_STRONG_ENTRY_WATCH_UI_VERSION =
  'VERY_STRONG_ENTRY_WATCH_UI_V2_TREND_POOL_BTC_WAVE_20260928';

export const VERY_STRONG_SETUP_MAX_AGE_MS = 45 * 60_000;
export const VERY_STRONG_EXECUTION_FRESH_MS = 90_000;
export const VERY_STRONG_BTC_HEALTH_MAX_AGE_MS = 120_000;

const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function deriveVeryStrongBtcContext(health = {}, marketRegime = {}, now = Date.now()) {
  const updatedAt = finite(health.updatedAt, 0);
  const ageMs = updatedAt > 0 ? now - updatedAt : Infinity;
  const fresh = ageMs >= -5_000 && ageMs <= VERY_STRONG_BTC_HEALTH_MAX_AGE_MS;
  const shock = health?.macroShock?.active === true || health?.btcSpikeAlert === true;
  const direction1h = String(health.btcTrendDir ?? '').toUpperCase();
  const direction4h = String(health.btcTrendDir4h ?? '').toUpperCase();
  const emaTrend1h = String(health.emaTrend1h ?? '').toUpperCase();
  const pullbackClosedAt = finite(health?.btcPullback5m?.closedAt, 0);
  const pullbackAgeMs = pullbackClosedAt > 0 ? now - pullbackClosedAt : Infinity;
  const pullback5m = {
    ...(health?.btcPullback5m && typeof health.btcPullback5m === 'object'
      ? health.btcPullback5m : {}),
    closedAt: pullbackClosedAt,
    ageMs: pullbackAgeMs,
    active: health?.btcPullback5m?.active === true
      && pullbackAgeMs >= -5_000
      && pullbackAgeMs <= VERY_STRONG_BTC_HEALTH_MAX_AGE_MS,
  };
  let key = 'MIXED';
  if (!fresh) key = 'STALE';
  else if (shock) key = 'SHOCK';
  else if (direction1h === 'DOWN' && direction4h === 'DOWN' && emaTrend1h === 'BELOW') key = 'DOWN_STRONG';
  else if (direction1h === 'UP' && direction4h === 'UP' && emaTrend1h === 'ABOVE') key = 'UP_STRONG';
  else if (direction1h === 'DOWN' || direction4h === 'DOWN') key = 'DOWN_LEAN';
  else if (direction1h === 'UP' || direction4h === 'UP') key = 'UP_LEAN';
  const labels = {
    DOWN_STRONG: 'BTC DOWN 1h + 4h',
    UP_STRONG: 'BTC UP 1h + 4h',
    DOWN_LEAN: 'BTC nghiêng giảm',
    UP_LEAN: 'BTC nghiêng tăng',
    SHOCK: 'BTC đang shock',
    STALE: 'Dữ liệu BTC cũ',
    MIXED: 'BTC chưa đồng thuận',
  };
  return {
    key,
    label: labels[key],
    price: finite(health.price),
    updatedAt,
    ageMs,
    direction1h,
    direction4h,
    emaTrend1h,
    pct6h: finite(health.pct6h),
    pct24h: finite(health.pct24h),
    relativeReturnClosedAt: finite(health.btcRelativeReturnClosedAt),
    relativeReturn15mPct: finite(health.btcRelativeReturn15mPct),
    relativeReturn1hPct: finite(health.btcRelativeReturn1hPct),
    pullback5m,
    allowLongEntry: marketRegime?.dataReady === true && marketRegime?.allowLongEntry === true,
    allowShortEntry: marketRegime?.dataReady === true && marketRegime?.allowShortEntry === true,
    marketState: String(marketRegime?.state ?? 'WAIT_DATA'),
    marketReason: Array.isArray(marketRegime?.reasons) ? marketRegime.reasons.join(' ') : '',
  };
}

function candidateStatus(candidate, btc, now) {
  const side = candidate.side;
  const confirmationAt = finite(candidate.confirmationAt, 0);
  const retestAt = finite(candidate.retestAt, 0);
  const confirmationAgeMs = now - confirmationAt;
  const retestAgeMs = retestAt > 0 ? now - retestAt : null;
  const btcAligned = side === 'SHORT'
    ? btc.key === 'DOWN_STRONG' && btc.allowShortEntry
    : btc.key === 'UP_STRONG' && btc.allowLongEntry;
  const executionWindow = retestAt > 0
    ? retestAgeMs >= 0 && retestAgeMs <= VERY_STRONG_EXECUTION_FRESH_MS
      ? 'MARKET_RETEST_WINDOW' : 'RETEST_EXPIRED'
    : confirmationAgeMs >= 0 && confirmationAgeMs <= VERY_STRONG_EXECUTION_FRESH_MS
      ? 'LIMIT_SUBMIT_WINDOW' : 'WAIT_NEW_RETEST';
  if (executionWindow === 'RETEST_EXPIRED') {
    return {
      key: 'RETEST_EXPIRED', rank: 4, btcAligned, executionWindow,
      label: 'SETUP CÒN · RETEST ĐÃ CŨ',
      detail: 'Không coi là cửa sổ MARKET mới; chờ setup/retest mới.',
    };
  }
  if (btcAligned && executionWindow === 'MARKET_RETEST_WINDOW') {
    return {
      key: 'CONTEXT_RETEST', rank: 0, btcAligned, executionWindow,
      label: 'BTC KHỚP · RETEST MỚI', detail: 'Bối cảnh đẹp nhất của trang; vẫn không tự đặt Binance.',
    };
  }
  if (btcAligned && executionWindow === 'LIMIT_SUBMIT_WINDOW') {
    return {
      key: 'CONTEXT_LIMIT', rank: 1, btcAligned, executionWindow,
      label: 'BTC KHỚP · LIMIT MỚI', detail: 'Tín hiệu rất mới; route/khóa Binance vẫn quyết định độc lập.',
    };
  }
  if (btcAligned) {
    return {
      key: 'CONTEXT_WAIT_RETEST', rank: 2, btcAligned, executionWindow,
      label: 'BTC KHỚP · CHỜ RETEST MỚI', detail: 'Không đuổi giá; chờ nến retest mới đóng.',
    };
  }
  return {
    key: 'WAIT_BTC', rank: 3, btcAligned, executionWindow,
    label: side === 'SHORT' ? 'CHỜ BTC DOWN 1h + 4h' : 'CHỜ BTC UP 1h + 4h',
    detail: side === 'SHORT'
      ? 'SHORT rất mạnh nhưng BTC chưa giảm đồng thuận.'
      : 'LONG rất mạnh không dùng bối cảnh BTC DOWN; chờ BTC tăng đồng thuận.',
  };
}

function trendPoolStatus(record, btc) {
  const side = record.side;
  const livePrice = finite(record.livePrice);
  const low = finite(record.entryZone?.low);
  const high = finite(record.entryZone?.high);
  const inZone = livePrice > 0 && low > 0 && high > 0 && livePrice >= low && livePrice <= high;
  const btcFavorable = side === 'LONG'
    ? ['UP_STRONG', 'UP_LEAN'].includes(btc.key) && btc.allowLongEntry
    : ['DOWN_STRONG', 'DOWN_LEAN'].includes(btc.key) && btc.allowShortEntry;
  const btcOpposite = side === 'LONG'
    ? ['DOWN_STRONG', 'DOWN_LEAN'].includes(btc.key)
    : ['UP_STRONG', 'UP_LEAN'].includes(btc.key);
  if (record.trendState === 'DATA_STALE') return {
    key: 'DATA_WARMUP', rank: 7, btcAligned: false, inZone, executionWindow: 'OBSERVE_ONLY',
    label: 'ĐANG NẠP NẾN 1H / 4H', detail: record.trendReason || 'Chưa dùng làm điểm vào.',
  };
  if (record.active !== true) return {
    key: 'TREND_LOST', rank: 6, btcAligned: false, inZone, executionWindow: 'OBSERVE_ONLY',
    label: 'ĐÃ MẤT XU HƯỚNG', detail: record.trendReason || 'Không còn đủ cấu trúc và volume.',
  };
  if (btcOpposite) return {
    key: 'WAIT_BTC_TURN', rank: 4, btcAligned: false, inZone, executionWindow: 'OBSERVE_ONLY',
    label: side === 'LONG' ? 'BTC ĐANG GIẢM · CHỜ QUAY LÊN' : 'BTC ĐANG TĂNG · CHỜ QUAY XUỐNG',
    detail: 'Giữ coin trong pool, không dùng vùng giá hiện tại làm entry mới.',
  };
  if (!btcFavorable) return {
    key: 'WAIT_BTC', rank: 3, btcAligned: false, inZone, executionWindow: 'OBSERVE_ONLY',
    label: side === 'LONG' ? 'CHỜ SÓNG BTC THUẬN LONG' : 'CHỜ SÓNG BTC THUẬN SHORT',
    detail: 'Coin còn xu hướng nhưng BTC/Market Regime chưa cho phép hướng này.',
  };
  if (!inZone) return {
    key: 'WAIT_DYNAMIC_RETEST', rank: 2, btcAligned: true, inZone, executionWindow: 'OBSERVE_ONLY',
    label: 'BTC ĐÃ THUẬN · CHỜ GIÁ VỀ HỖ TRỢ',
    detail: `Vùng động theo ${record.entryZone?.basis ?? 'EMA/cấu trúc'}; không đuổi giá.`,
  };
  if (record.coinTrigger !== true) return {
    key: 'WAIT_COIN_CONFIRM', rank: 1, btcAligned: true, inZone, executionWindow: 'OBSERVE_ONLY',
    label: 'ĐÚNG VÙNG · CHỜ NẾN 5M XÁC NHẬN',
    detail: 'Chờ nến 5m cùng hướng, taker và volume quay lại.',
  };
  return {
    key: 'READY_BTC_WAVE', rank: 0, btcAligned: true, inZone, executionWindow: 'OBSERVE_ONLY',
    label: 'ĐIỂM VÀO THEO SÓNG BTC',
    detail: 'BTC thuận hướng, giá ở vùng hỗ trợ/kháng cự động và nến 5m đã xác nhận. OBSERVE ONLY.',
  };
}

function buildTrendPoolRows(snapshot, btc, { now, side, status, sort }) {
  const source = snapshot?.veryStrongTrendPool?.records;
  if (!Array.isArray(source)) return null;
  const rows = source
    .filter((record) => (record.active === true || record.trendState === 'DATA_STALE')
      && ['LONG', 'SHORT'].includes(record.side))
    .map((record) => ({
      ...record,
      id: `${record.symbol}:${record.side}:${record.confirmationAt}`,
      entryPrice: finite(record.entryZone?.mid),
      lastClosed5m: finite(record.livePrice),
      distancePct: Math.abs(finite(record.entryDistancePct, 0)),
      setupExpiresAt: finite(record.poolExpiresAt, now),
      setupRemainingMs: Math.max(0, finite(record.poolExpiresAt, now) - now),
      context: trendPoolStatus(record, btc),
      trendPool: true,
    }))
    .filter((row) => row.setupRemainingMs > 0
      && (side === 'ALL' || row.side === side)
      && (status === 'ALL'
        || (status === 'CONTEXT' && row.context.btcAligned)
        || (status === 'READY' && row.context.key === 'READY_BTC_WAVE')
        || (status === 'WAIT_BTC' && ['WAIT_BTC', 'WAIT_BTC_TURN'].includes(row.context.key))));
  const comparators = {
    priority: (left, right) => left.context.rank - right.context.rank
      || finite(right.score, -1) - finite(left.score, -1),
    score: (left, right) => Math.abs(finite(right.score, 0)) - Math.abs(finite(left.score, 0))
      || finite(right.originVolumeRatio, 0) - finite(left.originVolumeRatio, 0),
    newest: (left, right) => finite(right.confirmationAt, 0) - finite(left.confirmationAt, 0),
    distance: (left, right) => finite(left.distancePct, Infinity) - finite(right.distancePct, Infinity),
  };
  rows.sort(comparators[sort] ?? comparators.priority);
  return rows;
}

export function buildVeryStrongEntryRows(snapshot = {}, btcHealth = {}, {
  now = Date.now(), side = 'ALL', status = 'ALL', sort = 'priority',
} = {}) {
  const btc = deriveVeryStrongBtcContext(btcHealth, snapshot.marketRegime, now);
  const trendPoolRows = buildTrendPoolRows(snapshot, btc, { now, side, status, sort });
  if (trendPoolRows) return { btc, rows: trendPoolRows, source: 'TREND_POOL' };
  const source = Array.isArray(snapshot.veryStrongCandidates)
    ? snapshot.veryStrongCandidates : snapshot.candidates;
  const deduped = new Map();
  for (const candidate of Array.isArray(source) ? source : []) {
    const confirmationAt = finite(candidate?.confirmationAt, 0);
    if (candidate?.entryTier !== 'VERY_STRONG'
      || !['LONG', 'SHORT'].includes(candidate?.side)
      || !(confirmationAt > 0)
      || confirmationAt > now
      || now - confirmationAt > VERY_STRONG_SETUP_MAX_AGE_MS) continue;
    const id = `${candidate.symbol}:${candidate.side}:${confirmationAt}`;
    const entryPrice = finite(candidate.entryPrice);
    const lastClosed5m = finite(candidate.lastClosed5m);
    const distancePct = entryPrice > 0 && lastClosed5m > 0
      ? Math.abs(lastClosed5m / entryPrice - 1) * 100 : null;
    deduped.set(id, {
      ...candidate,
      id,
      setupExpiresAt: confirmationAt + VERY_STRONG_SETUP_MAX_AGE_MS,
      setupRemainingMs: Math.max(0, confirmationAt + VERY_STRONG_SETUP_MAX_AGE_MS - now),
      distancePct,
      context: candidateStatus(candidate, btc, now),
    });
  }
  const rows = [...deduped.values()].filter((row) => (
    (side === 'ALL' || row.side === side)
    && (status === 'ALL'
      || (status === 'CONTEXT' && row.context.btcAligned && row.context.key !== 'RETEST_EXPIRED')
      || (status === 'WAIT_BTC' && row.context.key === 'WAIT_BTC')
      || (status === 'RETEST_EXPIRED' && row.context.key === 'RETEST_EXPIRED'))
  ));
  const comparators = {
    priority: (left, right) => left.context.rank - right.context.rank
      || finite(right.entryScore, -1) - finite(left.entryScore, -1),
    score: (left, right) => finite(right.entryScore, -1) - finite(left.entryScore, -1),
    newest: (left, right) => finite(right.confirmationAt, 0) - finite(left.confirmationAt, 0),
    distance: (left, right) => finite(left.distancePct, Infinity) - finite(right.distancePct, Infinity),
  };
  rows.sort((comparators[sort] ?? comparators.priority));
  return { btc, rows, source: 'ENTRY_SNAPSHOT_FALLBACK' };
}
