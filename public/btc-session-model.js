export const BTC_SESSION_VERSION = 'BTC_SESSION_OBSERVE_V1_20260926';
export const BTC_SESSION_CONTEXT_RULE_VERSION = 'BTC_SESSION_CONTEXT_V2_IGNORE_LONG_MARKET_REGIME_20260926';
export const BTC_IMPULSE_REGIME_VERSION = 'BTC_IMPULSE_REGIME_OBSERVE_V1_20260927';
export const BTC_IMPULSE_REGIMES = Object.freeze(['SW_UP', 'SW_DOWN', 'NEUTRAL', 'SHOCK', 'STALE']);
export const SESSION_NAMES = { NIGHT: '20h–02h · ưu tiên quan sát', MORNING: '06h–08h · theo dõi', OTHER: 'Giờ còn lại' };
const num = (v) => v == null || v === '' ? NaN : Number(v);
export function sessionAt(now = Date.now()) {
  const d = new Date(now + 7 * 3600000), h = d.getUTCHours();
  return { key: h >= 20 || h < 2 ? 'NIGHT' : h >= 6 && h < 8 ? 'MORNING' : 'OTHER', weekend: [0, 6].includes(d.getUTCDay()) };
}
export function sessionCardKey(side, window) {
  return ['LONG', 'SHORT'].includes(side) && Object.hasOwn(SESSION_NAMES, window) ? `btc-session:${side}:${window}` : null;
}
export function impulseRegimeCardKey(regime) {
  const normalized = String(regime ?? '').trim().toUpperCase();
  return BTC_IMPULSE_REGIMES.includes(normalized) ? `btc-session:IMPULSE:${normalized}` : null;
}
export function sessionWhitelistEligible(stats) {
  return stats?.version === BTC_SESSION_VERSION && num(stats.closed) > 0 && num(stats.avgRoe) > 4;
}
export function sessionTradeKey(trade) {
  const s = trade?.btcSessionObservation;
  return s?.version === BTC_SESSION_VERSION && s.side === trade.side ? sessionCardKey(s.side, s.window) : null;
}
export function impulseRegimeTradeKey(trade) {
  const snapshot = trade?.btcImpulseRegimeObservation;
  return snapshot?.version === BTC_IMPULSE_REGIME_VERSION
    ? impulseRegimeCardKey(snapshot.regime)
    : null;
}
export function fresh(at, now, maxAge) {
  return Number.isFinite(num(at)) && num(at) <= now + 5000 && now - num(at) <= maxAge;
}
export function btcContext(health, now = Date.now()) {
  if (!fresh(health?.updatedAt, now, 120000)) return { direction: 'UNKNOWN', label: 'BTC thiếu/cũ dữ liệu' };
  const direction = String(health.btcTrendDir ?? '').toUpperCase();
  return ['UP', 'DOWN'].includes(direction) ? { direction, label: direction === 'UP' ? 'BTC thiên tăng' : 'BTC thiên giảm' } : { direction: 'NEUTRAL', label: 'BTC chưa rõ hướng' };
}
export function btcImpulseRegime(health, now = Date.now()) {
  const base = {
    version: BTC_IMPULSE_REGIME_VERSION,
    observeOnly: true,
    affectsBinance: false,
    direction1h: String(health?.btcTrendDir ?? '').toUpperCase(),
    direction4h: String(health?.btcTrendDir4h ?? '').toUpperCase(),
    score1h: Number.isFinite(num(health?.btcTrendScore)) ? num(health.btcTrendScore) : null,
    score4h: Number.isFinite(num(health?.btcTrendScore4h)) ? num(health.btcTrendScore4h) : null,
    ema1h: String(health?.emaTrend1h ?? '').toLowerCase(),
    bullPoints: Number.isFinite(num(health?.bullPoints)) ? num(health.bullPoints) : null,
    bearPoints: Number.isFinite(num(health?.bearPoints)) ? num(health.bearPoints) : null,
    updatedAt: num(health?.updatedAt),
  };
  const result = (regime, label, tone, long, short, reason) => ({
    ...base, regime, label, tone, long, short, reason,
    whitelistKey: impulseRegimeCardKey(regime),
  });
  if (!fresh(health?.updatedAt, now, 120000)) {
    return result(
      'STALE', 'BTC DATA STALE', 'neutral',
      { tier: 'WAIT', title: 'LONG · CHỜ DỮ LIỆU', detail: 'Không suy hướng khi BTC health thiếu hoặc cũ.' },
      { tier: 'WAIT', title: 'SHORT · CHỜ DỮ LIỆU', detail: 'Không suy hướng khi BTC health thiếu hoặc cũ.' },
      'Dữ liệu BTC quá 120 giây hoặc chưa có.',
    );
  }
  if (health?.macroShock?.active === true || health?.btcSpike === true || health?.btcSpikeAlert === true) {
    return result(
      'SHOCK', 'BTC SHOCK · TẠM QUAN SÁT', 'shock',
      { tier: 'WAIT', title: 'LONG · KHÔNG ƯU TIÊN MARKET', detail: 'Chờ shock ổn định rồi đánh giá lại.' },
      { tier: 'WAIT', title: 'SHORT · KHÔNG ƯU TIÊN MARKET', detail: 'Chờ shock ổn định rồi đánh giá lại.' },
      health?.macroShock?.reason || 'BTC spike/shock đang hoạt động.',
    );
  }
  const dir1 = base.direction1h;
  const dir4 = base.direction4h;
  const score1 = base.score1h ?? 0;
  const score4 = base.score4h ?? 0;
  const bull = base.bullPoints ?? 0;
  const bear = base.bearPoints ?? 0;
  const fourHourSupportsUp = dir4 !== 'DOWN' || score4 < 55;
  const fourHourSupportsDown = dir4 !== 'UP' || score4 < 55;
  const up = dir1 === 'UP' && score1 >= 55 && base.ema1h === 'above'
    && fourHourSupportsUp && bull >= 2 && bear <= 1;
  const down = dir1 === 'DOWN' && score1 >= 55 && base.ema1h === 'below'
    && fourHourSupportsDown && bear >= 2 && bull <= 1;
  if (up) {
    return result(
      'SW_UP', 'BTC SW_UP · ƯU TIÊN LONG', 'long',
      { tier: 'PREFER', title: 'LONG _IMPULSE · THUẬN BTC', detail: 'BUY_IMPULSE phù hợp để ưu tiên đánh giá MARKET sớm.' },
      { tier: 'CONFIRM', title: 'SHORT _IMPULSE · NGƯỢC BTC', detail: 'Chỉ ưu tiên sau NO_BUY_CONFIRMATION; không SHORT từ cảnh báo sớm.' },
      `1h UP ${score1}/100, EMA1h trên; 4h ${dir4 || '—'} ${score4}/100; bull/bear ${bull}/${bear}.`,
    );
  }
  if (down) {
    return result(
      'SW_DOWN', 'BTC SW_DOWN · ƯU TIÊN SHORT', 'short',
      { tier: 'CONFIRM', title: 'LONG _IMPULSE · NGƯỢC BTC', detail: 'Nên chờ NO_SELL_CONFIRMATION; không ưu tiên LONG từ cảnh báo sớm.' },
      { tier: 'PREFER', title: 'SHORT _IMPULSE · THUẬN BTC', detail: 'NO_BUY_CONFIRMATION phù hợp để ưu tiên đánh giá MARKET.' },
      `1h DOWN ${score1}/100, EMA1h dưới; 4h ${dir4 || '—'} ${score4}/100; bull/bear ${bull}/${bear}.`,
    );
  }
  return result(
    'NEUTRAL', 'BTC NEUTRAL · CHỜ XÁC NHẬN HAI CHIỀU', 'neutral',
    { tier: 'CONFIRM', title: 'LONG _IMPULSE · CHỜ XÁC NHẬN', detail: 'Không ưu tiên BUY_IMPULSE sớm khi BTC chưa đồng thuận.' },
    { tier: 'CONFIRM', title: 'SHORT _IMPULSE · CHỜ XÁC NHẬN', detail: 'Không ưu tiên SELL_IMPULSE sớm khi BTC chưa đồng thuận.' },
    `1h ${dir1 || '—'} ${score1}/100, EMA1h ${base.ema1h || '—'}; 4h ${dir4 || '—'} ${score4}/100; bull/bear ${bull}/${bear}.`,
  );
}
export function buildSessionRows(payload, health, ticks = new Map(), now = Date.now(), window = 'AUTO') {
  const current = sessionAt(now), selected = window === 'AUTO' ? current.key : window;
  const btc = btcContext(health, now);
  const sides = new Map();
  for (const c of payload?.candidates ?? []) {
    if (c.retainedOnly) continue;
    if (!sides.has(c.symbol)) sides.set(c.symbol, new Set());
    sides.get(c.symbol).add(c.side);
  }
  return (payload?.candidates ?? []).filter(c => ['LONG', 'SHORT'].includes(c.side) && typeof c.symbol === 'string').map(c => {
    const tick = ticks.get(c.symbol), live = fresh(tick?.eventAt, now, 10000) && num(tick?.markPrice) > 0;
    const price = live ? num(tick.markPrice) : num(c.lastClosed5m);
    const low = num(c.entryZone?.low), high = num(c.entryZone?.high), middle = num(c.entryPrice), level = num(c.referenceLevel);
    const validZone = low > 0 && high >= low && middle >= low && middle <= high && level > 0;
    const stale = !fresh(payload?.generatedAt, now, 90000) || !fresh(c.lastClosed5mAt, now, 12 * 60000);
    const aligned = (c.side === 'LONG' && btc.direction === 'UP') || (c.side === 'SHORT' && btc.direction === 'DOWN');
    const broken = validZone && price > 0 && (c.side === 'LONG' ? price < level : price > level);
    const inZone = validZone && price >= low && price <= high;
    const dual = sides.get(c.symbol)?.size > 1;
    const retested = fresh(c.retestAt, now, 6 * 3600000) && num(c.retestAt) >= num(c.confirmationAt);
    let status, rank = 0;
    if (c.retainedOnly) status = `ĐÃ LƯU ${c.side} · CHỜ NGUỒN TRỞ LẠI`;
    else if (stale || !validZone) status = 'DỮ LIỆU CŨ / THIẾU';
    else if (broken) status = 'GIÁ ĐÃ PHÁ MỐC';
    else if (dual) status = 'HAI CHIỀU · CHỜ';
    else if (!live) status = 'CHỜ GIÁ LIVE';
    else if (btc.direction === 'UNKNOWN' || btc.direction === 'NEUTRAL') status = 'CHỜ BTC RÕ HƯỚNG';
    else if (!aligned) status = 'NGƯỢC HƯỚNG BTC';
    else if (selected !== current.key) status = 'NGOÀI KHUNG ĐÃ CHỌN';
    else if (!retested) { status = 'CHỜ RETEST 5m ĐÓNG'; rank = 1; }
    else if (!inZone) { status = 'CHỜ GIÁ VỀ VÙNG · KHÔNG ĐUỔI'; rank = 2; }
    else { status = 'TRONG VÙNG · CÙNG BTC'; rank = 3; }
    const contextClass = c.retainedOnly ? 'watch-retained' : rank === 3 ? (c.side === 'LONG' ? 'context-long-ready' : 'context-short-ready') : '';
    return { ...c, price, live, low, high, middle, validZone, level, stale, aligned, broken, dual, inZone, rank, status, contextClass,
      distance: validZone && price > 0 ? (middle / price - 1) * 100 : null,
      window: selected, whitelistKey: sessionCardKey(c.side, selected),
      observeOnly: true, binanceEligible: false, executionEligible: false };
  }).sort((a, b) => b.rank - a.rank || num(b.entryScore) - num(a.entryScore) || a.symbol.localeCompare(b.symbol));
}
