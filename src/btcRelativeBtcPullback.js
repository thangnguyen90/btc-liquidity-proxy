export const BTC_RELATIVE_BTC_PULLBACK_VERSION =
  'BTC_RELATIVE_BTC_PULLBACK_5M_CLOSED_V1_20260928';

export const BTC_RELATIVE_BTC_PULLBACK_MIN_MOVE_PCT = 0.08;
export const BTC_RELATIVE_BTC_PULLBACK_MAX_MOVE_PCT = 0.75;
export const BTC_RELATIVE_BTC_PULLBACK_MIN_PRIOR_DROP_PCT = 0.12;
export const BTC_RELATIVE_BTC_PULLBACK_MAX_AGE_MS = 120_000;

const finite = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const candleValue = (row, name, index) => finite(row?.[name] ?? row?.[index]);

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

/**
 * Chỉ đọc nến BTC 5m đã đóng. `active` là một cửa sổ ngắn sau nhịp hồi đầu tiên
 * trong chuỗi giảm; việc BTC có thật sự ở downtrend được kiểm tra riêng trong model.
 */
export function analyzeBtcDowntrendPullback5m(rows = [], now = Date.now()) {
  const closed = (Array.isArray(rows) ? rows : [])
    .filter((row) => finite(row?.closeTime ?? row?.[6], Infinity) <= now)
    .slice(-40);
  if (closed.length < 24) return {
    version: BTC_RELATIVE_BTC_PULLBACK_VERSION,
    active: false,
    reason: 'Thiếu nến BTC 5m đã đóng.',
  };

  const last = closed.at(-1);
  const previous = closed.slice(-4, -1);
  const open = candleValue(last, 'open', 1);
  const high = candleValue(last, 'high', 2);
  const low = candleValue(last, 'low', 3);
  const close = candleValue(last, 'close', 4);
  const quoteVolume = candleValue(last, 'quoteVolume', 7);
  const takerBuyQuote = candleValue(last, 'takerBuyQuoteVolume', 10);
  const closedAt = finite(last?.closeTime ?? last?.[6], 0);
  const priorOpen = candleValue(previous.at(0), 'open', 1);
  const priorClose = candleValue(previous.at(-1), 'close', 4);
  const movePct = open > 0 ? (close / open - 1) * 100 : null;
  const priorMovePct = priorOpen > 0 ? (priorClose / priorOpen - 1) * 100 : null;
  const range = high > low ? high - low : null;
  const bodyShare = range > 0 ? Math.abs(close - open) / range : null;
  const baselineVolumes = closed.slice(-24, -4)
    .map((row) => candleValue(row, 'quoteVolume', 7));
  const baselineVolume = median(baselineVolumes);
  const volumeRatio = baselineVolume > 0 ? quoteVolume / baselineVolume : null;
  const takerBuyPct = quoteVolume > 0 && takerBuyQuote != null
    ? takerBuyQuote / quoteVolume * 100 : null;
  const ageMs = closedAt > 0 ? now - closedAt : Infinity;
  const fresh = ageMs >= -5_000 && ageMs <= BTC_RELATIVE_BTC_PULLBACK_MAX_AGE_MS;
  const active = fresh
    && movePct >= BTC_RELATIVE_BTC_PULLBACK_MIN_MOVE_PCT
    && movePct <= BTC_RELATIVE_BTC_PULLBACK_MAX_MOVE_PCT
    && priorMovePct <= -BTC_RELATIVE_BTC_PULLBACK_MIN_PRIOR_DROP_PCT
    && finite(bodyShare, 0) >= 0.25
    && finite(takerBuyPct, 0) >= 50;

  return {
    version: BTC_RELATIVE_BTC_PULLBACK_VERSION,
    active,
    fresh,
    closedAt,
    ageMs,
    movePct: round(movePct),
    priorMovePct: round(priorMovePct),
    volumeRatio: round(volumeRatio, 2),
    takerBuyPct: round(takerBuyPct, 1),
    bodyShare: round(bodyShare, 3),
    reason: active
      ? `BTC 5m hồi ${round(movePct)}% sau nhịp ${round(priorMovePct)}%.`
      : 'BTC chưa có nến hồi 5m đã đóng, còn mới và đủ thân nến sau nhịp giảm.',
  };
}
