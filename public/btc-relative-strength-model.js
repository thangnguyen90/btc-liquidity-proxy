import { deriveVeryStrongBtcContext } from './very-strong-entry-watch-model.js';

export const BTC_RELATIVE_STRENGTH_UI_VERSION =
  'BTC_RELATIVE_STRENGTH_WATCH_V5_CAUSAL_ALPHA_ONE_ZONE_20260929';
export const BTC_RELATIVE_NEAR_ENTRY_PCT = 1.2;
export const BTC_RELATIVE_MIN_TREND_SCORE = 14;
export const BTC_RELATIVE_LONG_MIN_ALPHA_15M_PCT = 0.25;
export const BTC_RELATIVE_LONG_MIN_ALPHA_1H_PCT = 0.5;
export const BTC_RELATIVE_SHORT_PULLBACK_MIN_COIN_DROP_PCT = 0.15;
export const BTC_RELATIVE_SHORT_PULLBACK_MIN_UNDERPERFORMANCE_PCT = 0.25;
export const BTC_RELATIVE_SHORT_PULLBACK_MIN_VOLUME_5M = 1;
export const BTC_RELATIVE_SHORT_PULLBACK_MIN_VOLUME_15M = 0.75;
export const BTC_RELATIVE_SHORT_PULLBACK_MAX_TAKER_BUY_PCT = 45;

const finite = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

export const BTC_RELATIVE_TABS = Object.freeze({
  STRONG_WHILE_BTC_DOWN: {
    side: 'LONG',
    title: 'Coin mạnh khi BTC giảm',
    shortTitle: 'MẠNH / BTC GIẢM',
    expectedBtc: ['DOWN_STRONG', 'DOWN_LEAN'],
  },
  WEAK_WHILE_BTC_UP: {
    side: 'SHORT',
    title: 'Coin yếu khi BTC tăng hoặc hồi trong downtrend',
    shortTitle: 'YẾU / BTC TĂNG-HỒI',
    expectedBtc: ['UP_STRONG', 'UP_LEAN'],
  },
});

function matchesHighTimeframe(record, side) {
  const frame1h = String(record?.currentFrames?.['1h'] ?? '');
  const frame4h = String(record?.currentFrames?.['4h'] ?? '');
  const trendScore = finite(record?.currentTrendScore, 0);
  return side === 'LONG'
    ? frame1h === 'UP' && frame4h === 'UP' && trendScore >= BTC_RELATIVE_MIN_TREND_SCORE
    : frame1h === 'DOWN' && frame4h === 'DOWN' && trendScore <= -BTC_RELATIVE_MIN_TREND_SCORE;
}

export function evaluateBtcRelativeContext(record = {}, side, btc = {}) {
  const normalizedSide = String(side ?? record?.side ?? '').toUpperCase();
  if (normalizedSide === 'LONG') {
    const coin15m = finite(record.recentMovePct15m);
    const coin1h = finite(record.recentMovePct1h);
    const btc15m = finite(btc.relativeReturn15mPct);
    const btc1h = finite(btc.relativeReturn1hPct);
    const coinClosedAt = finite(record.lastClosed5mAt);
    const btcClosedAt = finite(btc.relativeReturnClosedAt);
    const sameClosedCandle = coinClosedAt != null && btcClosedAt != null
      && Math.abs(coinClosedAt - btcClosedAt) <= 5_000;
    const alpha15mPct = coin15m != null && btc15m != null ? coin15m - btc15m : null;
    const alpha1hPct = coin1h != null && btc1h != null ? coin1h - btc1h : null;
    const downStrong = btc.key === 'DOWN_STRONG';
    const active = downStrong
      && sameClosedCandle
      && alpha15mPct >= BTC_RELATIVE_LONG_MIN_ALPHA_15M_PCT
      && alpha1hPct >= BTC_RELATIVE_LONG_MIN_ALPHA_1H_PCT;
    return {
      active,
      mode: active ? 'BTC_DOWN_COIN_STRONG_ALPHA' : 'WAIT_BTC_DOWN_STRONG_OR_ALPHA',
      relativeMovePct: null,
      alpha15mPct: alpha15mPct == null ? null : round(alpha15mPct, 3),
      alpha1hPct: alpha1hPct == null ? null : round(alpha1hPct, 3),
      reason: active
        ? `BTC DOWN_STRONG; coin hơn BTC ${round(alpha15mPct, 3)} điểm %/15m và ${round(alpha1hPct, 3)} điểm %/1h.`
        : !downStrong
          ? 'LONG chỉ quan sát; chờ BTC DOWN_STRONG, không dùng DOWN_LEAN làm gate.'
          : !sameClosedCandle
            ? 'Chờ dữ liệu coin/BTC cùng nến 5m đã đóng để đo sức mạnh tương đối.'
            : `Chưa đủ alpha: cần coin hơn BTC ≥${BTC_RELATIVE_LONG_MIN_ALPHA_15M_PCT} điểm %/15m và ≥${BTC_RELATIVE_LONG_MIN_ALPHA_1H_PCT} điểm %/1h.`,
    };
  }

  if (['UP_STRONG', 'UP_LEAN'].includes(btc.key)) return {
    active: true,
    mode: 'BTC_UP_COIN_WEAK',
    relativeMovePct: null,
    reason: 'BTC đang tăng/nghiêng tăng; coin vẫn giữ cấu trúc giảm.',
  };

  const btcPullback = btc?.pullback5m ?? {};
  const coinMovePct = finite(record.last5mMovePct);
  const btcMovePct = finite(btcPullback.movePct);
  const coinClosedAt = finite(record.lastClosed5mAt);
  const btcClosedAt = finite(btcPullback.closedAt);
  const sameClosedCandle = coinClosedAt != null && btcClosedAt != null
    && Math.abs(coinClosedAt - btcClosedAt) <= 5_000;
  const relativeMovePct = coinMovePct != null && btcMovePct != null
    ? btcMovePct - coinMovePct : null;
  const btcDowntrend = ['DOWN_STRONG', 'DOWN_LEAN'].includes(btc.key);
  const pullbackActive = btcDowntrend && btcPullback.active === true;
  const pressureActive = pullbackActive
    && sameClosedCandle
    && coinMovePct != null
    && coinMovePct <= -BTC_RELATIVE_SHORT_PULLBACK_MIN_COIN_DROP_PCT
    && relativeMovePct >= BTC_RELATIVE_SHORT_PULLBACK_MIN_UNDERPERFORMANCE_PCT
    && finite(record.currentVolumeRatio5m, 0) >= BTC_RELATIVE_SHORT_PULLBACK_MIN_VOLUME_5M
    && finite(record.currentVolumeRatio15m, 0) >= BTC_RELATIVE_SHORT_PULLBACK_MIN_VOLUME_15M
    && finite(record.lastTakerBuyPct, 100) <= BTC_RELATIVE_SHORT_PULLBACK_MAX_TAKER_BUY_PCT;

  return {
    active: pressureActive,
    mode: pressureActive ? 'BTC_DOWNTREND_PULLBACK_SHORT' : 'WAIT_BTC_UP_OR_PULLBACK',
    relativeMovePct: relativeMovePct == null ? null : round(relativeMovePct, 3),
    reason: pressureActive
      ? `BTC hồi ${round(btcMovePct, 3)}% nhưng coin giảm ${round(coinMovePct, 3)}%; yếu hơn BTC ${round(relativeMovePct, 3)} điểm %.`
      : pullbackActive
        ? 'BTC đang hồi trong downtrend nhưng cùng nến đóng 5m của coin chưa đủ lực bán tương đối: cần coin giảm ≥0,15%, yếu hơn BTC ≥0,25 điểm %, volume 5m ≥1,0x, 15m ≥0,75x và taker mua ≤45%.'
        : 'Chờ BTC tăng/nghiêng tăng hoặc xuất hiện nến hồi 5m đã đóng trong downtrend.',
  };
}

function relativeStatus(record, tab, btc) {
  const definition = BTC_RELATIVE_TABS[tab];
  const context = evaluateBtcRelativeContext(record, definition.side, btc);
  const contextActive = context.active;
  const rawDistancePct = finite(record.entryDistancePct);
  const directionalDistancePct = rawDistancePct == null
    ? null : definition.side === 'LONG' ? rawDistancePct : -rawDistancePct;
  const absoluteDistancePct = directionalDistancePct == null ? null : Math.abs(directionalDistancePct);
  const nearEntry = absoluteDistancePct != null && absoluteDistancePct <= BTC_RELATIVE_NEAR_ENTRY_PCT;
  const inZone = finite(record.livePrice) > 0
    && finite(record.entryZone?.low) > 0
    && finite(record.entryZone?.high) > 0
    && record.livePrice >= record.entryZone.low
    && record.livePrice <= record.entryZone.high;

  if (record.trendState === 'DATA_STALE') return {
    key: 'DATA_WARMUP', rank: 5, contextActive: false, nearEntry: false, inZone: false,
    label: 'ĐANG NẠP NẾN 1H / 4H',
    detail: 'Giữ trong danh sách nguồn nhưng chưa phân loại sức mạnh tương đối.',
  };

  if (!contextActive) return {
    key: 'WAIT_BTC_OPPOSITE', rank: 4, contextActive, nearEntry, inZone,
    contextMode: context.mode,
    relativeMovePct: context.relativeMovePct,
    alpha15mPct: context.alpha15mPct,
    alpha1hPct: context.alpha1hPct,
    label: definition.side === 'LONG' ? 'CHỜ BTC GIẢM' : 'CHỜ BTC TĂNG / HỒI 5M',
    detail: context.reason,
  };
  if (directionalDistancePct != null && directionalDistancePct > BTC_RELATIVE_NEAR_ENTRY_PCT) return {
    key: 'MOVE_EXTENDED', rank: 3, contextActive, nearEntry, inZone,
    contextMode: context.mode, relativeMovePct: context.relativeMovePct,
    alpha15mPct: context.alpha15mPct, alpha1hPct: context.alpha1hPct,
    label: 'SÓNG ĐÃ CHẠY · KHÔNG ĐUỔI',
    detail: `Đã đi thuận hướng ${round(directionalDistancePct)}% khỏi vùng động; chờ retest mới.`,
  };
  if (directionalDistancePct != null && directionalDistancePct < -BTC_RELATIVE_NEAR_ENTRY_PCT) return {
    key: 'WAIT_RECLAIM', rank: 2, contextActive, nearEntry, inZone,
    contextMode: context.mode, relativeMovePct: context.relativeMovePct,
    alpha15mPct: context.alpha15mPct, alpha1hPct: context.alpha1hPct,
    label: definition.side === 'LONG' ? 'DƯỚI VÙNG · CHỜ LẤY LẠI' : 'TRÊN VÙNG · CHỜ TỪ CHỐI',
    detail: 'Không lấy việc đi ngược vùng làm entry; chờ nến đóng quay lại đúng phía.',
  };
  if (!inZone || record.coinTrigger !== true) return {
    key: 'WAIT_5M_CONFIRM', rank: 1, contextActive, nearEntry, inZone,
    contextMode: context.mode, relativeMovePct: context.relativeMovePct,
    alpha15mPct: context.alpha15mPct, alpha1hPct: context.alpha1hPct,
    label: !inZone ? 'GẦN VÙNG · CHỜ VÀO ĐÚNG VÙNG' : 'ĐÚNG VÙNG · CHỜ 5M',
    detail: !inZone
      ? 'Không nâng READY chỉ vì còn cách tâm vùng ≤1,2%; MARK phải nằm trong biên entry thật.'
      : 'Đã vào đúng vùng nhưng nến 5m, taker và volume chưa cùng xác nhận.',
  };
  return {
    key: 'RELATIVE_ENTRY_READY', rank: 0, contextActive, nearEntry, inZone,
    contextMode: context.mode, relativeMovePct: context.relativeMovePct,
    alpha15mPct: context.alpha15mPct, alpha1hPct: context.alpha1hPct,
    label: 'ĐỦ ĐIỀU KIỆN QUAN SÁT',
    detail: context.mode === 'BTC_DOWNTREND_PULLBACK_SHORT'
      ? `${context.reason} Entry theo nến hồi BTC đã đóng, không SHORT đuổi; Binance chỉ xét khi route SHORT + khóa tổng đang ON.`
      : 'Coin giữ hướng ngược BTC, còn gần vùng động và nến 5m đã xác nhận. Binance chỉ xét khi route hướng + khóa tổng đang ON; entry chỉ có TP, không đặt SL gốc.',
  };
}

function relativeScore(record, status) {
  if (status.key === 'DATA_WARMUP') return null;
  const trend = Math.min(35, Math.abs(finite(record.currentTrendScore, 0)) * 1.35);
  const originVolume = Math.min(15, finite(record.originVolumeRatio, 0) * 3);
  const currentVolume = Math.min(15, finite(record.currentVolumeRatio15m, 0) * 10);
  const proximity = status.inZone ? 15 : status.nearEntry ? 4 : 0;
  const confirmation = record.coinTrigger === true ? 10 : 0;
  const relativeEvidence = record.side === 'LONG'
    ? Math.min(10, Math.max(0, finite(status.alpha15mPct, 0)) * 8
      + Math.max(0, finite(status.alpha1hPct, 0)) * 4)
    : Math.min(10, Math.max(0, finite(status.relativeMovePct, 0)) * 20);
  return round(Math.min(100,
    trend + originVolume + currentVolume + proximity + confirmation + relativeEvidence), 1);
}

export function buildBtcRelativeStrengthRows(snapshot = {}, btcHealth = {}, {
  now = Date.now(), tab = 'STRONG_WHILE_BTC_DOWN', status = 'ALL', sort = 'priority',
} = {}) {
  const selectedTab = Object.hasOwn(BTC_RELATIVE_TABS, tab) ? tab : 'STRONG_WHILE_BTC_DOWN';
  const definition = BTC_RELATIVE_TABS[selectedTab];
  const btc = deriveVeryStrongBtcContext(btcHealth, snapshot.marketRegime, now);
  const source = Array.isArray(snapshot?.veryStrongTrendPool?.records)
    ? snapshot.veryStrongTrendPool.records : [];
  const rows = source
    .filter((record) => record.side === definition.side
      && finite(record.poolExpiresAt, now + 1) > now
      && (record.trendState === 'DATA_STALE'
        || (record?.active === true && matchesHighTimeframe(record, definition.side))))
    .map((record) => {
      const relative = relativeStatus(record, selectedTab, btc);
      const rawDistancePct = finite(record.entryDistancePct);
      return {
        ...record,
        relative,
        binanceEligible: relative.key === 'RELATIVE_ENTRY_READY',
        relativeScore: relativeScore(record, relative),
        directionalDistancePct: rawDistancePct == null
          ? null : definition.side === 'LONG' ? rawDistancePct : -rawDistancePct,
        setupRemainingMs: Math.max(0, finite(record.poolExpiresAt, now) - now),
      };
    })
    .filter((row) => status === 'ALL'
      || (status === 'READY' && row.relative.key === 'RELATIVE_ENTRY_READY')
      || (status === 'NEAR' && ['WAIT_5M_CONFIRM', 'RELATIVE_ENTRY_READY'].includes(row.relative.key))
      || (status === 'WAIT_BTC' && row.relative.key === 'WAIT_BTC_OPPOSITE')
      || (status === 'EXTENDED' && row.relative.key === 'MOVE_EXTENDED'));
  const comparators = {
    priority: (left, right) => left.relative.rank - right.relative.rank
      || right.relativeScore - left.relativeScore,
    relativeScore: (left, right) => right.relativeScore - left.relativeScore,
    distance: (left, right) => Math.abs(finite(left.directionalDistancePct, Infinity))
      - Math.abs(finite(right.directionalDistancePct, Infinity)),
    newest: (left, right) => finite(right.confirmationAt, 0) - finite(left.confirmationAt, 0),
  };
  rows.sort(comparators[sort] ?? comparators.priority);
  return {
    version: BTC_RELATIVE_STRENGTH_UI_VERSION,
    observeOnly: false,
    binanceEligible: true,
    binanceExecutionMode: 'RELATIVE_ENTRY_READY_MARKET_2USDT_AUTO_CONTROLS',
    selectedTab,
    definition,
    btc,
    rows,
  };
}
