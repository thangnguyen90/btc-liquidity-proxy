import { createHash } from 'node:crypto';

export const COIN_LEVEL_OBSERVE_MANUAL_ORDER_VERSION =
  'COIN_LEVEL_OBSERVE_MANUAL_MARKET_V2_USER_LEVERAGE_20260923';
export const COIN_LEVEL_OBSERVE_MANUAL_MIN_MARGIN_USDT = 0.01;
export const COIN_LEVEL_OBSERVE_MANUAL_MAX_MARGIN_USDT = 100;
export const COIN_LEVEL_OBSERVE_MANUAL_DEFAULT_LEVERAGE = 5;
export const COIN_LEVEL_OBSERVE_MANUAL_MIN_LEVERAGE = 1;
export const COIN_LEVEL_OBSERVE_MANUAL_MAX_LEVERAGE = 125;
export const COIN_LEVEL_OBSERVE_MANUAL_MAX_SNAPSHOT_AGE_MS = 60_000;

function fail(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeSymbol = (value) => String(value ?? '').trim().toUpperCase();

export function buildCoinLevelObserveManualOrder({
  body = {}, snapshot = {}, now = Date.now(),
} = {}) {
  const symbol = normalizeSymbol(body.symbol);
  const direction = String(body.side ?? '').trim().toUpperCase();
  const observedAt = finite(body.observedAt);
  const marginUsdt = finite(body.marginUsdt);
  const hasRequestedLeverage = body.leverage != null && String(body.leverage).trim() !== '';
  const requestedLeverage = finite(body.leverage);
  if (!/^[A-Z0-9]{2,40}USDT$/.test(symbol)) {
    fail('Mã coin không hợp lệ.', 'INVALID_SYMBOL');
  }
  if (!['LONG', 'SHORT'].includes(direction)) {
    fail('Hướng lệnh phải là LONG hoặc SHORT.', 'INVALID_SIDE');
  }
  if (!(observedAt > 0)) {
    fail('Thiếu thời điểm tín hiệu quan sát.', 'INVALID_OBSERVED_AT');
  }
  if (!(marginUsdt >= COIN_LEVEL_OBSERVE_MANUAL_MIN_MARGIN_USDT)
    || marginUsdt > COIN_LEVEL_OBSERVE_MANUAL_MAX_MARGIN_USDT) {
    fail(
      `Margin phải từ ${COIN_LEVEL_OBSERVE_MANUAL_MIN_MARGIN_USDT}–${COIN_LEVEL_OBSERVE_MANUAL_MAX_MARGIN_USDT} USDT.`,
      'INVALID_MARGIN',
    );
  }
  if (hasRequestedLeverage && (!Number.isInteger(requestedLeverage)
    || requestedLeverage < COIN_LEVEL_OBSERVE_MANUAL_MIN_LEVERAGE
    || requestedLeverage > COIN_LEVEL_OBSERVE_MANUAL_MAX_LEVERAGE)) {
    fail(
      `Đòn bẩy phải là số nguyên từ ${COIN_LEVEL_OBSERVE_MANUAL_MIN_LEVERAGE}–${COIN_LEVEL_OBSERVE_MANUAL_MAX_LEVERAGE}x.`,
      'INVALID_LEVERAGE',
    );
  }
  const generatedAt = finite(snapshot.generatedAt);
  if (!(generatedAt > 0) || generatedAt > now
    || now - generatedAt > COIN_LEVEL_OBSERVE_MANUAL_MAX_SNAPSHOT_AGE_MS) {
    fail('Lượt quét Coin Level đã cũ; chờ dữ liệu mới rồi thử lại.', 'STALE_SNAPSHOT', 409);
  }
  if (snapshot.binanceExecution?.masterEnabled !== true) {
    fail('Khóa tổng Binance đang OFF.', 'MASTER_BINANCE_OFF', 409);
  }
  if (direction === 'LONG' && snapshot.marketRegime?.allowLongEntry !== true) {
    fail(
      `Market Regime ${snapshot.marketRegime?.state ?? 'WAIT_DATA'} đang chặn LONG mới.`,
      'MARKET_REGIME_BLOCKED',
      409,
    );
  }
  const current = direction === 'LONG' ? snapshot.earlyLongWatches : snapshot.earlyShortWatches;
  const watch = (Array.isArray(current) ? current : []).find((item) => (
    normalizeSymbol(item?.symbol) === symbol
    && String(item?.side ?? '').toUpperCase() === direction
    && finite(item?.observedAt) === observedAt
    && item?.watchOnly === true
    && item?.binanceEligible === false
  ));
  if (!watch) {
    fail('Tín hiệu không còn trong danh sách đang đạt; không gửi lệnh.', 'WATCH_NOT_ACTIVE', 409);
  }
  const history = direction === 'LONG' ? snapshot.earlyLongHistory : snapshot.earlyShortHistory;
  const live = (Array.isArray(history) ? history : []).find((item) => (
    normalizeSymbol(item?.symbol) === symbol
    && finite(item?.observedAt) === observedAt
  ));
  if (live?.liveNow === false || live?.liveInvalidated === true || live?.liveState === 'INVALIDATED') {
    fail('Giá live đã làm tín hiệu mất hiệu lực; không gửi lệnh.', 'WATCH_LIVE_INVALIDATED', 409);
  }

  const rawLeverage = finite(snapshot.binanceExecution?.routes?.[direction]?.leverage);
  const fallbackLeverage = Math.max(
    COIN_LEVEL_OBSERVE_MANUAL_MIN_LEVERAGE,
    Math.min(
      COIN_LEVEL_OBSERVE_MANUAL_MAX_LEVERAGE,
      rawLeverage > 0 ? Math.trunc(rawLeverage) : COIN_LEVEL_OBSERVE_MANUAL_DEFAULT_LEVERAGE,
    ),
  );
  const leverage = hasRequestedLeverage ? requestedLeverage : fallbackLeverage;
  const referencePrice = finite(live?.livePrice, finite(watch.priceAtWatch));
  const invalidationPrice = finite(watch.invalidationPrice);
  const longStopLossPrice = direction === 'LONG'
    && invalidationPrice > 0 && referencePrice > invalidationPrice
    ? invalidationPrice
    : null;
  const key = `${symbol}|${direction}|${observedAt}`;
  const signalLabel = 'ORDERS_MANUAL';
  return {
    watch,
    live: live ?? null,
    marginUsdt,
    leverage,
    plan: {
      version: COIN_LEVEL_OBSERVE_MANUAL_ORDER_VERSION,
      source: 'orders-manual',
      streamId: 'coin-level-observe-row',
      signalLabel,
      signalType: signalLabel,
      signalInterval: '5m',
      executionPage: 'coin-level-analysis',
      symbol,
      side: direction === 'LONG' ? 'BUY' : 'SELL',
      orderType: 'MARKET',
      marginUsdt,
      notionalUsdt: marginUsdt * leverage,
      leverage,
      stopLossPrice: longStopLossPrice,
      protectionOnFill: true,
      preserveSignalProtection: true,
      protectionSignalEntryPrice: referencePrice,
      protectionSignalStopLossPrice: longStopLossPrice,
      allowMinNotionalCeil: true,
      dryRun: false,
      clientOrderId: `clom_${createHash('sha256').update(key).digest('hex').slice(0, 25)}`,
      signalCombo: `${watch.setupMode ?? watch.reason ?? 'EARLY'}|MANUAL_CLICK`,
      signalReason: [
        COIN_LEVEL_OBSERVE_MANUAL_ORDER_VERSION,
        'Người dùng bấm lệnh MARKET trên dòng SHORT/LONG sớm đang active.',
        `watchReason=${watch.reason ?? '-'}`,
        `observedAt=${new Date(observedAt).toISOString()}`,
        `earlyScore=${finite(watch.earlyScore, '-')}`,
        `margin=${marginUsdt}`,
        `leverage=${leverage}`,
      ].join(' | '),
      protectionMeta: {
        signalLabel,
        signalType: signalLabel,
        signalReason: `Manual Coin Level observe row ${direction}; ${watch.reason ?? 'EARLY_WATCH'}`,
        signalCombo: `${watch.setupMode ?? watch.reason ?? 'EARLY'}|MANUAL_CLICK`,
        streamId: 'coin-level-observe-row',
        executionPage: 'coin-level-analysis',
      },
    },
  };
}
