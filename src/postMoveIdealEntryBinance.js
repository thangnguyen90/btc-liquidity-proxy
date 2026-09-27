import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolveOtherEntrySettings } from './otherEntryCatalog.js';

export const POST_MOVE_IDEAL_SHORT_1H_BINANCE_VERSION =
  'POST_MOVE_IDEAL_SHORT_1H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925';
export const POST_MOVE_IDEAL_SHORT_1H_ROUTE = Object.freeze({
  source: 'post-move-ideal-entry',
  streamId: 'post-pump-volume-fade-1h',
  signalLabel: 'SHORT_IDEAL_ENTRY_TOUCH',
  side: 'SHORT',
});
export const POST_MOVE_IDEAL_SHORT_1H_STOP_LOSS_ROE_PCT = 30;
export const POST_MOVE_IDEAL_LONG_1H_BINANCE_VERSION =
  'POST_MOVE_IDEAL_LONG_1H_PRIORITY_TOUCH_MARKET_5USDT_V2_20260925';
export const POST_MOVE_IDEAL_LONG_1H_ROUTE = Object.freeze({
  source: 'post-move-ideal-entry',
  streamId: 'post-dump-volume-recovery-1h',
  signalLabel: 'LONG_IDEAL_ENTRY_TOUCH',
  side: 'LONG',
});
export const POST_MOVE_IDEAL_LONG_1H_STOP_LOSS_ROE_PCT = 20;
export const POST_MOVE_IDEAL_LONG_4H_BINANCE_VERSION =
  'POST_MOVE_IDEAL_LONG_4H_PRIORITY_TOUCH_MARKET_10USDT_V2_20260925';
export const POST_MOVE_IDEAL_LONG_4H_ROUTE = Object.freeze({
  source: 'post-move-ideal-entry',
  streamId: 'post-dump-volume-recovery-4h',
  signalLabel: 'LONG_IDEAL_ENTRY_TOUCH',
  side: 'LONG',
});
export const POST_MOVE_IDEAL_LONG_4H_STOP_LOSS_ROE_PCT = 20;
export const POST_MOVE_IDEAL_SHORT_4H_BINANCE_VERSION =
  'POST_MOVE_IDEAL_SHORT_4H_PRIORITY_TOUCH_MARKET_10USDT_V1_20260925';
export const POST_MOVE_IDEAL_SHORT_4H_ROUTE = Object.freeze({
  source: 'post-move-ideal-entry',
  streamId: 'post-pump-volume-fade-4h',
  signalLabel: 'SHORT_IDEAL_ENTRY_TOUCH',
  side: 'SHORT',
});
export const POST_MOVE_IDEAL_SHORT_4H_STOP_LOSS_ROE_PCT = 30;
export const POST_MOVE_PRIORITY_15M_BINANCE_VERSION =
  'POST_MOVE_PRIORITY_STAGE_15M_MARKET_2USDT_MAX15_V1_20260925';
export const POST_MOVE_PRIORITY_LONG_15M_ROUTE = Object.freeze({
  source: 'post-move-ideal-entry',
  streamId: 'post-dump-volume-recovery-15m',
  signalLabel: 'LONG_PRIORITY_STAGE_15M',
  side: 'LONG',
});
export const POST_MOVE_PRIORITY_SHORT_15M_ROUTE = Object.freeze({
  source: 'post-move-ideal-entry',
  streamId: 'post-pump-volume-fade-15m',
  signalLabel: 'SHORT_PRIORITY_STAGE_15M',
  side: 'SHORT',
});
export const POST_MOVE_PRIORITY_LONG_STAGE_KEYS = Object.freeze([
  'LONG_FRESH_REVERSAL',
  'LONG_FIRST_STRONG_CANDLE',
]);
export const POST_MOVE_PRIORITY_SHORT_STAGE_KEYS = Object.freeze([
  'SHORT_NEAR_TOP',
  'SHORT_FIRST_STRONG_CANDLE',
]);
// Giữ export cũ để các consumer/test JSON trước đây không phải migrate đồng loạt.
export const POST_MOVE_PRIORITY_LONG_15M_STAGE_KEYS = POST_MOVE_PRIORITY_LONG_STAGE_KEYS;
export const POST_MOVE_PRIORITY_SHORT_15M_STAGE_KEYS = POST_MOVE_PRIORITY_SHORT_STAGE_KEYS;
export const POST_MOVE_PRIORITY_15M_MAX_OPEN_POSITIONS = 15;
export const POST_MOVE_PRIORITY_15M_MAX_SIGNAL_AGE_MS = 60_000;
export const POST_MOVE_PRIORITY_15M_MAX_MARK_DRIFT = 0.005;
export const POST_MOVE_IDEAL_SHORT_1H_MAX_TOUCH_AGE_MS = 60_000;
export const POST_MOVE_IDEAL_SHORT_1H_MAX_MARK_DRIFT = 0.005;

const RETAIN_MS = 7 * 24 * 60 * 60_000;

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function epoch(value) {
  const numeric = finite(value);
  if (numeric != null) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inside(price, low, high) {
  return price >= low && price <= high;
}

function touches(previousPrice, price, low, high) {
  if (!(finite(previousPrice) > 0)) return inside(price, low, high);
  return Math.min(previousPrice, price) <= high && Math.max(previousPrice, price) >= low;
}

function collectPostMoveIdealShortCandidates(snapshot = {}, interval, version) {
  const frame = (Array.isArray(snapshot?.timeframes) ? snapshot.timeframes : [])
    .find((row) => String(row?.interval ?? '') === interval);
  const candidates = [];
  for (const item of Array.isArray(frame?.items) ? frame.items : []) {
    const symbol = String(item?.symbol ?? '').trim().toUpperCase();
    const anchorAt = finite(item?.pumpAt);
    const price = finite(item?.currentPrice);
    const zoneLow = finite(item?.idealEntry?.zoneLow);
    const zoneHigh = finite(item?.idealEntry?.zoneHigh);
    const stageKey = String(item?.moveStage?.key ?? '');
    if (!symbol || !(anchorAt > 0) || !(price > 0) || !(zoneLow > 0) || !(zoneHigh >= zoneLow)) continue;
    if (!POST_MOVE_PRIORITY_SHORT_STAGE_KEYS.includes(stageKey)) continue;
    if (item?.status === 'WEAKENED' || item?.idealEntry?.state === 'AVOID_WEAKENED') continue;
    candidates.push({
      id: `SHORT|${interval}|${symbol}|${anchorAt}`,
      version,
      symbol,
      side: 'SHORT',
      interval,
      anchorAt,
      price,
      zoneLow,
      zoneHigh,
      midpoint: finite(item?.idealEntry?.midpoint),
      score: finite(item?.score),
      status: String(item?.status ?? ''),
      moveStage: {
        key: stageKey,
        label: String(item?.moveStage?.label ?? stageKey),
        entryHint: String(item?.moveStage?.entryHint ?? ''),
      },
      confirmationPrice: finite(item?.confirmationPrice),
      invalidationPrice: finite(item?.invalidationPrice),
    });
  }
  return candidates;
}

export function collectPostMoveIdealShort1hCandidates(snapshot = {}) {
  return collectPostMoveIdealShortCandidates(
    snapshot, '1h', POST_MOVE_IDEAL_SHORT_1H_BINANCE_VERSION,
  );
}

export function collectPostMoveIdealShort4hCandidates(snapshot = {}) {
  return collectPostMoveIdealShortCandidates(
    snapshot, '4h', POST_MOVE_IDEAL_SHORT_4H_BINANCE_VERSION,
  );
}

function collectPostMoveIdealLongCandidates(snapshot = {}, interval, version) {
  const frame = (Array.isArray(snapshot?.timeframes) ? snapshot.timeframes : [])
    .find((row) => String(row?.interval ?? '') === interval);
  const candidates = [];
  for (const item of Array.isArray(frame?.items) ? frame.items : []) {
    const symbol = String(item?.symbol ?? '').trim().toUpperCase();
    const anchorAt = finite(item?.dumpAt);
    const price = finite(item?.currentPrice);
    const zoneLow = finite(item?.idealEntry?.zoneLow);
    const zoneHigh = finite(item?.idealEntry?.zoneHigh);
    const stageKey = String(item?.moveStage?.key ?? '');
    if (!symbol || !(anchorAt > 0) || !(price > 0) || !(zoneLow > 0) || !(zoneHigh >= zoneLow)) continue;
    if (!POST_MOVE_PRIORITY_LONG_STAGE_KEYS.includes(stageKey)) continue;
    if (item?.status === 'WEAKENED' || item?.idealEntry?.state === 'AVOID_WEAKENED') continue;
    candidates.push({
      id: `LONG|${interval}|${symbol}|${anchorAt}`,
      version,
      symbol,
      side: 'LONG',
      interval,
      anchorAt,
      price,
      zoneLow,
      zoneHigh,
      midpoint: finite(item?.idealEntry?.midpoint),
      score: finite(item?.score),
      status: String(item?.status ?? ''),
      moveStage: {
        key: stageKey,
        label: String(item?.moveStage?.label ?? stageKey),
        entryHint: String(item?.moveStage?.entryHint ?? ''),
      },
      confirmationPrice: finite(item?.confirmationPrice),
      invalidationPrice: finite(item?.invalidationPrice),
    });
  }
  return candidates;
}

export function collectPostMoveIdealLong1hCandidates(snapshot = {}) {
  return collectPostMoveIdealLongCandidates(
    snapshot, '1h', POST_MOVE_IDEAL_LONG_1H_BINANCE_VERSION,
  );
}

export function collectPostMoveIdealLong4hCandidates(snapshot = {}) {
  return collectPostMoveIdealLongCandidates(
    snapshot, '4h', POST_MOVE_IDEAL_LONG_4H_BINANCE_VERSION,
  );
}

function collectPostMovePriority15mCandidates(snapshot = {}, side) {
  const frame = (Array.isArray(snapshot?.timeframes) ? snapshot.timeframes : [])
    .find((row) => String(row?.interval ?? '') === '15m');
  const isLong = side === 'LONG';
  const allowedStages = isLong
    ? POST_MOVE_PRIORITY_LONG_15M_STAGE_KEYS
    : POST_MOVE_PRIORITY_SHORT_15M_STAGE_KEYS;
  const candidates = [];
  for (const item of Array.isArray(frame?.items) ? frame.items : []) {
    const symbol = String(item?.symbol ?? '').trim().toUpperCase();
    const anchorAt = finite(isLong ? item?.dumpAt : item?.pumpAt);
    const price = finite(item?.currentPrice);
    const stageKey = String(item?.moveStage?.key ?? '');
    const stageFresh = stageKey === 'LONG_FRESH_REVERSAL'
      ? finite(item?.dumpAgeBars, 999) <= 2
      : stageKey === 'LONG_FIRST_STRONG_CANDLE'
        ? finite(item?.lift?.ageBars) === 0
        : stageKey === 'SHORT_NEAR_TOP'
          ? finite(item?.pumpAgeBars, 999) <= 2
          : stageKey === 'SHORT_FIRST_STRONG_CANDLE'
            ? finite(item?.sell?.ageBars) === 0
            : false;
    if (!symbol || !(anchorAt > 0) || !(price > 0)
      || !allowedStages.includes(stageKey) || !stageFresh
      || item?.status === 'WEAKENED' || item?.idealEntry?.state === 'AVOID_WEAKENED') continue;
    candidates.push({
      id: `${side}|15m|${symbol}|${anchorAt}`,
      version: POST_MOVE_PRIORITY_15M_BINANCE_VERSION,
      symbol,
      side,
      interval: '15m',
      anchorAt,
      price,
      score: finite(item?.score),
      status: String(item?.status ?? ''),
      moveStage: {
        key: stageKey,
        label: String(item?.moveStage?.label ?? stageKey),
        entryHint: String(item?.moveStage?.entryHint ?? ''),
      },
      confirmationPrice: finite(item?.confirmationPrice),
      invalidationPrice: finite(item?.invalidationPrice),
    });
  }
  return candidates;
}

export function collectPostMovePriorityLong15mCandidates(snapshot = {}) {
  return collectPostMovePriority15mCandidates(snapshot, 'LONG');
}

export function collectPostMovePriorityShort15mCandidates(snapshot = {}) {
  return collectPostMovePriority15mCandidates(snapshot, 'SHORT');
}

function buildPostMovePriority15mOrder(event = {}, {
  now = Date.now(), enabledAt, markPrice, routeState,
} = {}, side) {
  const isLong = side === 'LONG';
  const route = isLong ? POST_MOVE_PRIORITY_LONG_15M_ROUTE : POST_MOVE_PRIORITY_SHORT_15M_ROUTE;
  const allowedStages = isLong
    ? POST_MOVE_PRIORITY_LONG_15M_STAGE_KEYS
    : POST_MOVE_PRIORITY_SHORT_15M_STAGE_KEYS;
  const settings = resolveOtherEntrySettings(route, routeState);
  const signalAt = epoch(event.signalAt);
  const enabledAtMs = epoch(enabledAt);
  const mark = finite(markPrice);
  const eventPrice = finite(event.price);
  const stageKey = String(event?.moveStage?.key ?? '');
  if (!settings || event.side !== side || event.interval !== '15m'
    || !allowedStages.includes(stageKey)
    || !String(event.symbol ?? '').endsWith('USDT')
    || ![signalAt, enabledAtMs, mark, eventPrice].every(Number.isFinite)
    || signalAt < enabledAtMs || signalAt > now
    || now - signalAt > POST_MOVE_PRIORITY_15M_MAX_SIGNAL_AGE_MS
    || mark <= 0 || eventPrice <= 0
    || Math.abs(mark / eventPrice - 1) > POST_MOVE_PRIORITY_15M_MAX_MARK_DRIFT) return null;

  const { marginUsdt, leverage, takeProfitRoePct } = settings;
  const stopLossRoePct = isLong
    ? POST_MOVE_IDEAL_LONG_1H_STOP_LOSS_ROE_PCT
    : POST_MOVE_IDEAL_SHORT_1H_STOP_LOSS_ROE_PCT;
  const direction = isLong ? 1 : -1;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (stopLossRoePct / 100) / leverage;
  const takeProfitPrice = mark * (1 + (direction * takeProfitDistanceFraction));
  const stopLossPrice = mark * (1 - (direction * stopLossDistanceFraction));
  const clientPrefix = isLong ? 'pmpl15' : 'pmps15';
  return {
    ...route,
    signalType: route.signalLabel,
    signalInterval: '15m',
    executionPage: isLong ? 'post-dump-volume-recovery' : 'post-pump-volume-fade',
    side: isLong ? 'BUY' : 'SELL',
    symbol: event.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: mark,
    entryExpiresAt: signalAt + POST_MOVE_PRIORITY_15M_MAX_SIGNAL_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: POST_MOVE_PRIORITY_15M_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: false,
    dryRun: false,
    maxOpenPositions: POST_MOVE_PRIORITY_15M_MAX_OPEN_POSITIONS,
    clientOrderId: `${clientPrefix}_${createHash('sha256').update(event.id).digest('hex').slice(0, 22)}`,
    signalStageKey: stageKey,
    signalCombo: `15m|${route.signalLabel}|${stageKey}`,
    signalReason: [
      POST_MOVE_PRIORITY_15M_BINANCE_VERSION,
      `signalAt=${new Date(signalAt).toISOString()}`,
      `stage=${stageKey}`,
      `score=${event.score ?? '-'}`,
      `status=${event.status || '-'}`,
      `mark=${mark}`,
      `maxOpen=${POST_MOVE_PRIORITY_15M_MAX_OPEN_POSITIONS}`,
    ].join(' | '),
  };
}

export function buildPostMovePriorityLong15mOrder(event = {}, options = {}) {
  return buildPostMovePriority15mOrder(event, options, 'LONG');
}

export function buildPostMovePriorityShort15mOrder(event = {}, options = {}) {
  return buildPostMovePriority15mOrder(event, options, 'SHORT');
}

export function buildPostMoveIdealShort1hOrder(event = {}, {
  now = Date.now(), enabledAt, markPrice, routeState,
} = {}) {
  const settings = resolveOtherEntrySettings(POST_MOVE_IDEAL_SHORT_1H_ROUTE, routeState);
  const touchAt = epoch(event.touchAt);
  const enabledAtMs = epoch(enabledAt);
  const mark = finite(markPrice);
  const zoneLow = finite(event.zoneLow);
  const zoneHigh = finite(event.zoneHigh);
  const eventPrice = finite(event.price);
  const stageKey = String(event?.moveStage?.key ?? '');
  if (!settings || event.side !== 'SHORT' || event.interval !== '1h'
    || !POST_MOVE_PRIORITY_SHORT_STAGE_KEYS.includes(stageKey)
    || !String(event.symbol ?? '').endsWith('USDT')
    || ![touchAt, enabledAtMs, mark, zoneLow, zoneHigh, eventPrice].every(Number.isFinite)
    || touchAt < enabledAtMs || touchAt > now || now - touchAt > POST_MOVE_IDEAL_SHORT_1H_MAX_TOUCH_AGE_MS
    || zoneLow <= 0 || zoneHigh < zoneLow || !inside(eventPrice, zoneLow, zoneHigh)
    || !inside(mark, zoneLow, zoneHigh)
    || Math.abs(mark / eventPrice - 1) > POST_MOVE_IDEAL_SHORT_1H_MAX_MARK_DRIFT) return null;

  const { marginUsdt, leverage, takeProfitRoePct } = settings;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (POST_MOVE_IDEAL_SHORT_1H_STOP_LOSS_ROE_PCT / 100) / leverage;
  const takeProfitPrice = mark * (1 - takeProfitDistanceFraction);
  const stopLossPrice = mark * (1 + stopLossDistanceFraction);
  return {
    ...POST_MOVE_IDEAL_SHORT_1H_ROUTE,
    signalType: POST_MOVE_IDEAL_SHORT_1H_ROUTE.signalLabel,
    signalInterval: '1h',
    executionPage: 'post-pump-volume-fade',
    side: 'SELL',
    symbol: event.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: mark,
    entryExpiresAt: touchAt + POST_MOVE_IDEAL_SHORT_1H_MAX_TOUCH_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct: POST_MOVE_IDEAL_SHORT_1H_STOP_LOSS_ROE_PCT,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: POST_MOVE_IDEAL_SHORT_1H_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: false,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `pmis_${createHash('sha256').update(event.id).digest('hex').slice(0, 24)}`,
    signalStageKey: stageKey,
    signalCombo: `1h|SHORT_IDEAL_ENTRY_TOUCH|${stageKey}`,
    signalReason: [
      POST_MOVE_IDEAL_SHORT_1H_BINANCE_VERSION,
      `touchAt=${new Date(touchAt).toISOString()}`,
      `stage=${stageKey}`,
      `zone=${zoneLow}-${zoneHigh}`,
      `score=${event.score ?? '-'}`,
      `status=${event.status || '-'}`,
      `mark=${mark}`,
    ].join(' | '),
  };
}

export function buildPostMoveIdealShort4hOrder(event = {}, {
  now = Date.now(), enabledAt, markPrice, routeState,
} = {}) {
  const settings = resolveOtherEntrySettings(POST_MOVE_IDEAL_SHORT_4H_ROUTE, routeState);
  const touchAt = epoch(event.touchAt);
  const enabledAtMs = epoch(enabledAt);
  const mark = finite(markPrice);
  const zoneLow = finite(event.zoneLow);
  const zoneHigh = finite(event.zoneHigh);
  const eventPrice = finite(event.price);
  const stageKey = String(event?.moveStage?.key ?? '');
  if (!settings || event.side !== 'SHORT' || event.interval !== '4h'
    || !POST_MOVE_PRIORITY_SHORT_STAGE_KEYS.includes(stageKey)
    || !String(event.symbol ?? '').endsWith('USDT')
    || ![touchAt, enabledAtMs, mark, zoneLow, zoneHigh, eventPrice].every(Number.isFinite)
    || touchAt < enabledAtMs || touchAt > now || now - touchAt > POST_MOVE_IDEAL_SHORT_1H_MAX_TOUCH_AGE_MS
    || zoneLow <= 0 || zoneHigh < zoneLow || !inside(eventPrice, zoneLow, zoneHigh)
    || !inside(mark, zoneLow, zoneHigh)
    || Math.abs(mark / eventPrice - 1) > POST_MOVE_IDEAL_SHORT_1H_MAX_MARK_DRIFT) return null;

  const { marginUsdt, leverage, takeProfitRoePct } = settings;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (POST_MOVE_IDEAL_SHORT_4H_STOP_LOSS_ROE_PCT / 100) / leverage;
  const takeProfitPrice = mark * (1 - takeProfitDistanceFraction);
  const stopLossPrice = mark * (1 + stopLossDistanceFraction);
  return {
    ...POST_MOVE_IDEAL_SHORT_4H_ROUTE,
    signalType: POST_MOVE_IDEAL_SHORT_4H_ROUTE.signalLabel,
    signalInterval: '4h',
    executionPage: 'post-pump-volume-fade',
    side: 'SELL',
    symbol: event.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: mark,
    entryExpiresAt: touchAt + POST_MOVE_IDEAL_SHORT_1H_MAX_TOUCH_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct: POST_MOVE_IDEAL_SHORT_4H_STOP_LOSS_ROE_PCT,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: POST_MOVE_IDEAL_SHORT_4H_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: false,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `pmis4_${createHash('sha256').update(event.id).digest('hex').slice(0, 23)}`,
    signalStageKey: stageKey,
    signalCombo: `4h|SHORT_IDEAL_ENTRY_TOUCH|${stageKey}`,
    signalReason: [
      POST_MOVE_IDEAL_SHORT_4H_BINANCE_VERSION,
      `touchAt=${new Date(touchAt).toISOString()}`,
      `stage=${stageKey}`,
      `zone=${zoneLow}-${zoneHigh}`,
      `score=${event.score ?? '-'}`,
      `status=${event.status || '-'}`,
      `mark=${mark}`,
    ].join(' | '),
  };
}

export function buildPostMoveIdealLong1hOrder(event = {}, {
  now = Date.now(), enabledAt, markPrice, routeState,
} = {}) {
  const settings = resolveOtherEntrySettings(POST_MOVE_IDEAL_LONG_1H_ROUTE, routeState);
  const touchAt = epoch(event.touchAt);
  const enabledAtMs = epoch(enabledAt);
  const mark = finite(markPrice);
  const zoneLow = finite(event.zoneLow);
  const zoneHigh = finite(event.zoneHigh);
  const eventPrice = finite(event.price);
  const stageKey = String(event?.moveStage?.key ?? '');
  if (!settings || event.side !== 'LONG' || event.interval !== '1h'
    || !POST_MOVE_PRIORITY_LONG_STAGE_KEYS.includes(stageKey)
    || !String(event.symbol ?? '').endsWith('USDT')
    || ![touchAt, enabledAtMs, mark, zoneLow, zoneHigh, eventPrice].every(Number.isFinite)
    || touchAt < enabledAtMs || touchAt > now || now - touchAt > POST_MOVE_IDEAL_SHORT_1H_MAX_TOUCH_AGE_MS
    || zoneLow <= 0 || zoneHigh < zoneLow || !inside(eventPrice, zoneLow, zoneHigh)
    || !inside(mark, zoneLow, zoneHigh)
    || Math.abs(mark / eventPrice - 1) > POST_MOVE_IDEAL_SHORT_1H_MAX_MARK_DRIFT) return null;

  const { marginUsdt, leverage, takeProfitRoePct } = settings;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (POST_MOVE_IDEAL_LONG_1H_STOP_LOSS_ROE_PCT / 100) / leverage;
  const takeProfitPrice = mark * (1 + takeProfitDistanceFraction);
  const stopLossPrice = mark * (1 - stopLossDistanceFraction);
  return {
    ...POST_MOVE_IDEAL_LONG_1H_ROUTE,
    signalType: POST_MOVE_IDEAL_LONG_1H_ROUTE.signalLabel,
    signalInterval: '1h',
    executionPage: 'post-dump-volume-recovery',
    side: 'BUY',
    symbol: event.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: mark,
    entryExpiresAt: touchAt + POST_MOVE_IDEAL_SHORT_1H_MAX_TOUCH_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct: POST_MOVE_IDEAL_LONG_1H_STOP_LOSS_ROE_PCT,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: POST_MOVE_IDEAL_LONG_1H_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: false,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `pmil_${createHash('sha256').update(event.id).digest('hex').slice(0, 24)}`,
    signalStageKey: stageKey,
    signalCombo: `1h|LONG_IDEAL_ENTRY_TOUCH|${stageKey}`,
    signalReason: [
      POST_MOVE_IDEAL_LONG_1H_BINANCE_VERSION,
      `touchAt=${new Date(touchAt).toISOString()}`,
      `stage=${stageKey}`,
      `zone=${zoneLow}-${zoneHigh}`,
      `score=${event.score ?? '-'}`,
      `status=${event.status || '-'}`,
      `mark=${mark}`,
    ].join(' | '),
  };
}

export function buildPostMoveIdealLong4hOrder(event = {}, {
  now = Date.now(), enabledAt, markPrice, routeState,
} = {}) {
  const settings = resolveOtherEntrySettings(POST_MOVE_IDEAL_LONG_4H_ROUTE, routeState);
  const touchAt = epoch(event.touchAt);
  const enabledAtMs = epoch(enabledAt);
  const mark = finite(markPrice);
  const zoneLow = finite(event.zoneLow);
  const zoneHigh = finite(event.zoneHigh);
  const eventPrice = finite(event.price);
  const stageKey = String(event?.moveStage?.key ?? '');
  if (!settings || event.side !== 'LONG' || event.interval !== '4h'
    || !POST_MOVE_PRIORITY_LONG_STAGE_KEYS.includes(stageKey)
    || !String(event.symbol ?? '').endsWith('USDT')
    || ![touchAt, enabledAtMs, mark, zoneLow, zoneHigh, eventPrice].every(Number.isFinite)
    || touchAt < enabledAtMs || touchAt > now || now - touchAt > POST_MOVE_IDEAL_SHORT_1H_MAX_TOUCH_AGE_MS
    || zoneLow <= 0 || zoneHigh < zoneLow || !inside(eventPrice, zoneLow, zoneHigh)
    || !inside(mark, zoneLow, zoneHigh)
    || Math.abs(mark / eventPrice - 1) > POST_MOVE_IDEAL_SHORT_1H_MAX_MARK_DRIFT) return null;

  const { marginUsdt, leverage, takeProfitRoePct } = settings;
  const takeProfitDistanceFraction = (takeProfitRoePct / 100) / leverage;
  const stopLossDistanceFraction = (POST_MOVE_IDEAL_LONG_4H_STOP_LOSS_ROE_PCT / 100) / leverage;
  const takeProfitPrice = mark * (1 + takeProfitDistanceFraction);
  const stopLossPrice = mark * (1 - stopLossDistanceFraction);
  return {
    ...POST_MOVE_IDEAL_LONG_4H_ROUTE,
    signalType: POST_MOVE_IDEAL_LONG_4H_ROUTE.signalLabel,
    signalInterval: '4h',
    executionPage: 'post-dump-volume-recovery',
    side: 'BUY',
    symbol: event.symbol,
    orderType: 'MARKET',
    marginUsdt,
    notionalUsdt: marginUsdt * leverage,
    leverage,
    signalEntryPrice: mark,
    entryExpiresAt: touchAt + POST_MOVE_IDEAL_SHORT_1H_MAX_TOUCH_AGE_MS,
    takeProfitPrice,
    stopLossPrice,
    takeProfitRoePct,
    stopLossRoePct: POST_MOVE_IDEAL_LONG_4H_STOP_LOSS_ROE_PCT,
    protectionOnFill: true,
    preserveSignalProtection: true,
    fillAnchorEnabled: true,
    fillAnchorVersion: POST_MOVE_IDEAL_LONG_4H_BINANCE_VERSION,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
    protectionSignalEntryPrice: mark,
    protectionSignalTakeProfitPrice: takeProfitPrice,
    protectionSignalStopLossPrice: stopLossPrice,
    allowMinNotionalCeil: false,
    dryRun: false,
    maxOpenPositions: 30,
    clientOrderId: `pmil4_${createHash('sha256').update(event.id).digest('hex').slice(0, 23)}`,
    signalStageKey: stageKey,
    signalCombo: `4h|LONG_IDEAL_ENTRY_TOUCH|${stageKey}`,
    signalReason: [
      POST_MOVE_IDEAL_LONG_4H_BINANCE_VERSION,
      `touchAt=${new Date(touchAt).toISOString()}`,
      `stage=${stageKey}`,
      `zone=${zoneLow}-${zoneHigh}`,
      `score=${event.score ?? '-'}`,
      `status=${event.status || '-'}`,
      `mark=${mark}`,
    ].join(' | '),
  };
}

function freshState(now, version = POST_MOVE_IDEAL_SHORT_1H_BINANCE_VERSION) {
  return { version, initializedAt: now, updatedAt: now, setups: {}, attempts: {} };
}

const SHORT_STRATEGY = Object.freeze({
  version: POST_MOVE_IDEAL_SHORT_1H_BINANCE_VERSION,
  route: POST_MOVE_IDEAL_SHORT_1H_ROUTE,
  side: 'SHORT',
  collect: collectPostMoveIdealShort1hCandidates,
  build: buildPostMoveIdealShort1hOrder,
  attemptPrefix: 'pmis',
  logPrefix: 'PostMoveIdealShort1h',
});

const SHORT_4H_STRATEGY = Object.freeze({
  version: POST_MOVE_IDEAL_SHORT_4H_BINANCE_VERSION,
  route: POST_MOVE_IDEAL_SHORT_4H_ROUTE,
  side: 'SHORT',
  collect: collectPostMoveIdealShort4hCandidates,
  build: buildPostMoveIdealShort4hOrder,
  attemptPrefix: 'pmis4',
  logPrefix: 'PostMoveIdealShort4h',
});

const LONG_STRATEGY = Object.freeze({
  version: POST_MOVE_IDEAL_LONG_1H_BINANCE_VERSION,
  route: POST_MOVE_IDEAL_LONG_1H_ROUTE,
  side: 'LONG',
  collect: collectPostMoveIdealLong1hCandidates,
  build: buildPostMoveIdealLong1hOrder,
  attemptPrefix: 'pmil',
  logPrefix: 'PostMoveIdealLong1h',
});

const LONG_4H_STRATEGY = Object.freeze({
  version: POST_MOVE_IDEAL_LONG_4H_BINANCE_VERSION,
  route: POST_MOVE_IDEAL_LONG_4H_ROUTE,
  side: 'LONG',
  collect: collectPostMoveIdealLong4hCandidates,
  build: buildPostMoveIdealLong4hOrder,
  attemptPrefix: 'pmil4',
  logPrefix: 'PostMoveIdealLong4h',
});

const PRIORITY_LONG_15M_STRATEGY = Object.freeze({
  version: POST_MOVE_PRIORITY_15M_BINANCE_VERSION,
  route: POST_MOVE_PRIORITY_LONG_15M_ROUTE,
  side: 'LONG',
  collect: collectPostMovePriorityLong15mCandidates,
  build: buildPostMovePriorityLong15mOrder,
  attemptPrefix: 'pmpl15',
  logPrefix: 'PostMovePriorityLong15m',
});

const PRIORITY_SHORT_15M_STRATEGY = Object.freeze({
  version: POST_MOVE_PRIORITY_15M_BINANCE_VERSION,
  route: POST_MOVE_PRIORITY_SHORT_15M_ROUTE,
  side: 'SHORT',
  collect: collectPostMovePriorityShort15mCandidates,
  build: buildPostMovePriorityShort15mOrder,
  attemptPrefix: 'pmps15',
  logPrefix: 'PostMovePriorityShort15m',
});

export class PostMoveIdealShort1hBinanceRunner {
  constructor({ file, controls, getContext, submit, now = () => Date.now(), maxPerScan = 5,
    strategy = SHORT_STRATEGY } = {}) {
    Object.assign(this, { file, controls, getContext, submit, now, strategy });
    this.maxPerScan = Math.max(1, finite(maxPerScan, 5));
    this.state = null;
    this.baselineEnabledAt = null;
    this.queue = Promise.resolve();
  }

  routeState() {
    const registered = this.controls.register(this.strategy.route);
    const controls = this.controls.read();
    return { registered, controls, route: controls.routes?.[registered.key] };
  }

  enabled() {
    const { controls, route } = this.routeState();
    return controls.enabled === true && route?.enabled === true;
  }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.state = {
        ...freshState(now, this.strategy.version),
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
        version: this.strategy.version,
        setups: parsed?.setups && typeof parsed.setups === 'object' ? parsed.setups : {},
        attempts: parsed?.attempts && typeof parsed.attempts === 'object' ? parsed.attempts : {},
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[${this.strategy.logPrefix}] state load failed: ${error.message}`);
      this.state = freshState(now, this.strategy.version);
    }
    return this.state;
  }

  async save() {
    if (!this.file || !this.state) return;
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(tmp, this.file);
  }

  processSnapshot(snapshot) {
    this.queue = this.queue.catch(() => {}).then(() => this.#process(snapshot));
    return this.queue;
  }

  async #process(snapshot) {
    const routeSnapshot = this.routeState();
    if (!routeSnapshot.controls.enabled || routeSnapshot.route?.enabled !== true) {
      this.baselineEnabledAt = null;
      return { status: 'off', candidates: 0, submitted: 0, results: [] };
    }
    const enabledAt = String(routeSnapshot.route.enabledAt ?? '');
    const state = await this.load();
    const now = this.now();
    const candidates = this.strategy.collect(snapshot);
    const activeIds = new Set(candidates.map((row) => row.id));
    for (const [id, setup] of Object.entries(state.setups)) {
      if (now - finite(setup?.lastSeenAt, 0) > RETAIN_MS) delete state.setups[id];
      else if (!activeIds.has(id)) setup.active = false;
    }
    for (const [id, attempt] of Object.entries(state.attempts)) {
      if (now - finite(attempt?.at, 0) > RETAIN_MS) delete state.attempts[id];
    }

    if (this.baselineEnabledAt !== enabledAt) {
      for (const candidate of candidates) {
        const isInside = inside(candidate.price, candidate.zoneLow, candidate.zoneHigh);
        state.setups[candidate.id] = {
          ...state.setups[candidate.id], ...candidate, active: true,
          inside: isInside, armed: !isInside, lastPrice: candidate.price, lastSeenAt: now,
        };
      }
      state.updatedAt = now;
      this.baselineEnabledAt = enabledAt;
      await this.save();
      return { status: 'baseline', candidates: candidates.length, submitted: 0, results: [] };
    }

    const due = [];
    for (const candidate of candidates) {
      const previous = state.setups[candidate.id];
      const isInside = inside(candidate.price, candidate.zoneLow, candidate.zoneHigh);
      const eventId = `${this.strategy.attemptPrefix}_${createHash('sha256').update(candidate.id).digest('hex').slice(0, 24)}`;
      // A candidate first discovered while cache coverage is still warming may
      // already sit inside its historical zone. Baseline it instead of replaying
      // an old touch; only an observed outside -> zone crossing is executable.
      const touched = !state.attempts[eventId]
        && previous?.armed === true
        && touches(previous.lastPrice, candidate.price, candidate.zoneLow, candidate.zoneHigh);
      const record = {
        ...(previous ?? {}), ...candidate, active: true, inside: isInside,
        armed: isInside ? previous?.armed === true : true,
        lastPrice: candidate.price, lastSeenAt: now,
      };
      state.setups[candidate.id] = record;
      if (touched) due.push({ ...record, touchAt: now });
    }
    state.updatedAt = now;
    await this.save();

    const results = [];
    for (const event of due.slice(0, this.maxPerScan)) {
      results.push(await this.#handleTouch(event));
    }
    return {
      status: 'scanned',
      candidates: candidates.length,
      touched: due.length,
      submitted: results.filter((row) => row.status === 'submitted').length,
      results,
    };
  }

  async #handleTouch(event) {
    const routeSnapshot = this.routeState();
    const context = await this.getContext(event.symbol);
    const attemptId = `${this.strategy.attemptPrefix}_${createHash('sha256').update(event.id).digest('hex').slice(0, 24)}`;
    const attempt = {
      eventId: event.id, symbol: event.symbol, side: this.strategy.side, interval: event.interval,
      stageKey: event.moveStage?.key ?? null,
      touchAt: event.touchAt, at: this.now(), status: 'CHECKING',
    };
    this.state.attempts[attemptId] = attempt;
    await this.save();
    try {
      if (!context?.enabled) return await this.#finishAttempt(attemptId, 'RUNTIME_OFF');
      if ((context.positions ?? []).some((position) => (
        position.symbol === event.symbol && Math.abs(Number(position.positionAmt)) > 0
      ))) return await this.#finishAttempt(attemptId, 'EXISTING_POSITION');
      if ((context.openOrders ?? []).some((order) => (
        order.symbol === event.symbol
        && order.reduceOnly !== true && order.reduceOnly !== 'true'
        && order.closePosition !== true && order.closePosition !== 'true'
      ))) return await this.#finishAttempt(attemptId, 'EXISTING_ORDER');

      const latest = this.routeState();
      if (!latest.controls.enabled || latest.route?.enabled !== true
        || String(latest.route.enabledAt ?? '') !== String(routeSnapshot.route?.enabledAt ?? '')) {
        return await this.#finishAttempt(attemptId, 'CONTROL_CHANGED');
      }
      const plan = this.strategy.build(event, {
        now: this.now(), enabledAt: latest.route.enabledAt,
        markPrice: context.markPrice, routeState: latest.route,
      });
      if (!plan) return await this.#finishAttempt(attemptId, 'PRICE_OR_AGE_BLOCKED');
      this.controls.assertEntry(plan);
      attempt.status = 'SUBMITTING';
      attempt.clientOrderId = plan.clientOrderId;
      await this.save();
      const result = await this.submit(plan, context);
      attempt.status = String(result?.status ?? 'UNKNOWN').toUpperCase();
      attempt.orderId = result?.orderResult?.orderId ?? null;
      attempt.marginUsdt = plan.marginUsdt;
      attempt.leverage = plan.leverage;
      attempt.updatedAt = this.now();
      await this.save();
      return { status: result?.status ?? 'unknown', symbol: event.symbol, orderId: attempt.orderId };
    } catch (error) {
      attempt.status = 'ERROR_OR_UNKNOWN';
      attempt.errorCode = error?.code ?? null;
      attempt.error = String(error?.message ?? error).slice(0, 300);
      attempt.updatedAt = this.now();
      await this.save();
      return { status: 'error', symbol: event.symbol, error: attempt.error, errorCode: attempt.errorCode };
    }
  }

  async #finishAttempt(id, status) {
    const attempt = this.state.attempts[id];
    attempt.status = status;
    attempt.updatedAt = this.now();
    await this.save();
    return { status: status.toLowerCase().replaceAll('_', '-'), symbol: attempt.symbol };
  }
}

export class PostMoveIdealLong1hBinanceRunner extends PostMoveIdealShort1hBinanceRunner {
  constructor(options = {}) {
    super({ ...options, strategy: LONG_STRATEGY });
  }
}

export class PostMoveIdealLong4hBinanceRunner extends PostMoveIdealShort1hBinanceRunner {
  constructor(options = {}) {
    super({ ...options, strategy: LONG_4H_STRATEGY });
  }
}

export class PostMoveIdealShort4hBinanceRunner extends PostMoveIdealShort1hBinanceRunner {
  constructor(options = {}) {
    super({ ...options, strategy: SHORT_4H_STRATEGY });
  }
}

class PostMovePriority15mBinanceRunner {
  constructor({ file, controls, getContext, submit, now = () => Date.now(), maxPerScan = 5,
    strategy } = {}) {
    Object.assign(this, { file, controls, getContext, submit, now, strategy });
    this.maxPerScan = Math.max(1, finite(maxPerScan, 5));
    this.state = null;
    this.baselineEnabledAt = null;
    this.queue = Promise.resolve();
  }

  routeState() {
    const registered = this.controls.register(this.strategy.route);
    const controls = this.controls.read();
    return { registered, controls, route: controls.routes?.[registered.key] };
  }

  enabled() {
    const { controls, route } = this.routeState();
    return controls.enabled === true && route?.enabled === true;
  }

  async load() {
    if (this.state) return this.state;
    const now = this.now();
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.state = {
        ...freshState(now, this.strategy.version),
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
        version: this.strategy.version,
        setups: parsed?.setups && typeof parsed.setups === 'object' ? parsed.setups : {},
        attempts: parsed?.attempts && typeof parsed.attempts === 'object' ? parsed.attempts : {},
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[${this.strategy.logPrefix}] state load failed: ${error.message}`);
      this.state = freshState(now, this.strategy.version);
    }
    return this.state;
  }

  async save() {
    if (!this.file || !this.state) return;
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    await rename(tmp, this.file);
  }

  processSnapshot(snapshot) {
    this.queue = this.queue.catch(() => {}).then(() => this.#process(snapshot));
    return this.queue;
  }

  async #process(snapshot) {
    const routeSnapshot = this.routeState();
    if (!routeSnapshot.controls.enabled || routeSnapshot.route?.enabled !== true) {
      this.baselineEnabledAt = null;
      return { status: 'off', candidates: 0, submitted: 0, results: [] };
    }
    const enabledAt = String(routeSnapshot.route.enabledAt ?? '');
    const state = await this.load();
    const now = this.now();
    const candidates = this.strategy.collect(snapshot);
    const activeIds = new Set(candidates.map((row) => row.id));
    for (const [id, setup] of Object.entries(state.setups)) {
      if (now - finite(setup?.lastSeenAt, 0) > RETAIN_MS) delete state.setups[id];
      else if (!activeIds.has(id)) {
        setup.active = false;
        setup.pending = false;
      }
    }
    for (const [id, attempt] of Object.entries(state.attempts)) {
      if (now - finite(attempt?.at, 0) > RETAIN_MS) delete state.attempts[id];
    }

    if (this.baselineEnabledAt !== enabledAt) {
      for (const candidate of candidates) {
        state.setups[candidate.id] = {
          ...state.setups[candidate.id], ...candidate, active: true, pending: false, lastSeenAt: now,
        };
      }
      state.updatedAt = now;
      this.baselineEnabledAt = enabledAt;
      await this.save();
      return { status: 'baseline', candidates: candidates.length, submitted: 0, results: [] };
    }

    const due = [];
    for (const candidate of candidates) {
      const previous = state.setups[candidate.id];
      const attemptId = `${this.strategy.attemptPrefix}_${createHash('sha256').update(candidate.id).digest('hex').slice(0, 22)}`;
      const becameEligible = !previous || previous.active !== true
        || String(previous?.moveStage?.key ?? '') !== String(candidate?.moveStage?.key ?? '');
      const pending = !state.attempts[attemptId]
        && (previous?.pending === true || becameEligible);
      const record = {
        ...(previous ?? {}), ...candidate, active: true, pending, lastSeenAt: now,
      };
      state.setups[candidate.id] = record;
      if (pending) due.push({ ...record, signalAt: now });
    }
    state.updatedAt = now;
    await this.save();

    const results = [];
    for (const event of due.slice(0, this.maxPerScan)) {
      results.push(await this.#handleSignal(event));
    }
    return {
      status: 'scanned', candidates: candidates.length, eligible: due.length,
      queued: Math.max(0, due.length - this.maxPerScan),
      submitted: results.filter((row) => row.status === 'submitted').length,
      results,
    };
  }

  async #handleSignal(event) {
    const routeSnapshot = this.routeState();
    const attemptId = `${this.strategy.attemptPrefix}_${createHash('sha256').update(event.id).digest('hex').slice(0, 22)}`;
    const attempt = {
      eventId: event.id, symbol: event.symbol, side: this.strategy.side, interval: event.interval,
      stageKey: event.moveStage?.key ?? null, signalAt: event.signalAt, at: this.now(), status: 'CHECKING',
    };
    this.state.attempts[attemptId] = attempt;
    if (this.state.setups[event.id]) this.state.setups[event.id].pending = false;
    await this.save();
    try {
      const context = await this.getContext(event.symbol);
      if (!context?.enabled) return await this.#finishAttempt(attemptId, 'RUNTIME_OFF');
      const openPositions = (context.positions ?? []).filter((position) => (
        Math.abs(Number(position.positionAmt)) > 0
      ));
      if (openPositions.length >= POST_MOVE_PRIORITY_15M_MAX_OPEN_POSITIONS) {
        return await this.#finishAttempt(attemptId, 'MAX_OPEN_POSITIONS');
      }
      if (openPositions.some((position) => position.symbol === event.symbol)) {
        return await this.#finishAttempt(attemptId, 'EXISTING_POSITION');
      }
      if ((context.openOrders ?? []).some((order) => (
        order.symbol === event.symbol
        && order.reduceOnly !== true && order.reduceOnly !== 'true'
        && order.closePosition !== true && order.closePosition !== 'true'
      ))) return await this.#finishAttempt(attemptId, 'EXISTING_ORDER');

      const latest = this.routeState();
      if (!latest.controls.enabled || latest.route?.enabled !== true
        || String(latest.route.enabledAt ?? '') !== String(routeSnapshot.route?.enabledAt ?? '')) {
        return await this.#finishAttempt(attemptId, 'CONTROL_CHANGED');
      }
      const plan = this.strategy.build(event, {
        now: this.now(), enabledAt: latest.route.enabledAt,
        markPrice: context.markPrice, routeState: latest.route,
      });
      if (!plan) return await this.#finishAttempt(attemptId, 'PRICE_OR_AGE_BLOCKED');
      this.controls.assertEntry(plan);
      attempt.status = 'SUBMITTING';
      attempt.clientOrderId = plan.clientOrderId;
      await this.save();
      const result = await this.submit(plan, context);
      attempt.status = String(result?.status ?? 'UNKNOWN').toUpperCase();
      attempt.orderId = result?.orderResult?.orderId ?? null;
      attempt.marginUsdt = plan.marginUsdt;
      attempt.leverage = plan.leverage;
      attempt.updatedAt = this.now();
      await this.save();
      return { status: result?.status ?? 'unknown', symbol: event.symbol, orderId: attempt.orderId };
    } catch (error) {
      attempt.status = 'ERROR_OR_UNKNOWN';
      attempt.errorCode = error?.code ?? null;
      attempt.error = String(error?.message ?? error).slice(0, 300);
      attempt.updatedAt = this.now();
      await this.save();
      return { status: 'error', symbol: event.symbol, error: attempt.error, errorCode: attempt.errorCode };
    }
  }

  async #finishAttempt(id, status) {
    const attempt = this.state.attempts[id];
    attempt.status = status;
    attempt.updatedAt = this.now();
    await this.save();
    return { status: status.toLowerCase().replaceAll('_', '-'), symbol: attempt.symbol };
  }
}

export class PostMovePriorityLong15mBinanceRunner extends PostMovePriority15mBinanceRunner {
  constructor(options = {}) {
    super({ ...options, strategy: PRIORITY_LONG_15M_STRATEGY });
  }
}

export class PostMovePriorityShort15mBinanceRunner extends PostMovePriority15mBinanceRunner {
  constructor(options = {}) {
    super({ ...options, strategy: PRIORITY_SHORT_15M_STRATEGY });
  }
}
