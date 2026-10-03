export const AUTO_BINANCE_ENTRY_POLICY_VERSION = 'LOCAL_AI_PRIORITY_ZONE_1USDT_V51_20261003';
import { validImpulseSizing } from './postMoveImpulseSizing.js';
import {validEma99OrderSize,EMA99_ENTRY_CATALOG} from './ema99EntryCatalog.js';
import {
  LIMIT_PAPER_FILL_LABELS,
  LIMIT_PAPER_FILL_SOURCE,
  LIMIT_PAPER_FILL_STREAM,
  validOtherOrderSize,
  validOtherTakeProfitRoe,
} from './otherEntryCatalog.js';
import {
  LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION,
  LOCAL_AI_PASS_MIDPOINT_LEVERAGE,
  LOCAL_AI_PASS_MIDPOINT_MARGIN_USDT,
  LOCAL_AI_PASS_MIDPOINT_MAX_OPEN_POSITIONS,
  LOCAL_AI_PASS_MIDPOINT_MAX_STRUCTURAL_SL_ROE_PCT,
  LOCAL_AI_PASS_MIDPOINT_SIGNAL_LABEL,
  LOCAL_AI_PASS_MIDPOINT_SIGNAL_STAGE,
  LOCAL_AI_PASS_MIDPOINT_SOURCE,
  LOCAL_AI_PASS_MIDPOINT_STREAM,
  LOCAL_AI_PASS_MIDPOINT_TAKE_PROFIT_ROE_PCT,
} from './localAiPassMidpointContract.js';
import {
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_VERSION,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LEVERAGE,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LONG_LABEL,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MARGIN_USDT,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MAX_OPEN_POSITIONS,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SHORT_LABEL,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SL_ROE_PCT,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SOURCE,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_STAGE,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_STREAM,
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_TP_ROE_PCT,
} from './localAiLiquidityBreakoutOppositeDepthBinance.js';
const EMA99_WATCH_AUTH=Symbol('ema99-watch-optin');
export function authorizeEma99WatchOrder(payload={}){const p={...payload};Object.defineProperty(p,EMA99_WATCH_AUTH,{value:true});return p;}
export const LIQUID_FLOW_V2_BINANCE_LEVERAGE = 5;

const LIVE_CARD_AUTO_ORDER_AUTHORIZATION = Symbol('live-card-auto-order-authorization');
const LIQUID_FLOW_V2_AUTO_ORDER_AUTHORIZATION = Symbol('liquid-flow-v2-auto-order-authorization');
const COINGLASS_WEB_AUTO_ORDER_AUTHORIZATION = Symbol('coinglass-web-auto-order-authorization');
const PUMP_DUMP_ABSORPTION_AUTO_ORDER_AUTHORIZATION = Symbol('pump-dump-absorption-auto-order-authorization');
const POST_PUMP_KILL_SHORT_AUTO_ORDER_AUTHORIZATION = Symbol('post-pump-kill-short-auto-order-authorization');
const EMA99_NEAR_REJECT_AUTHORIZATION = Symbol('ema99-near-reject-authorization');
const EMA99_RECLAIM_LONG_AUTHORIZATION = Symbol('ema99-reclaim-long-authorization');
const EMA99_BOUNCE_LONG_AUTHORIZATION = Symbol('ema99-bounce-long-authorization');
const EXTREME_SHORT_SQUEEZE_AUTHORIZATION = Symbol('extreme-short-squeeze-authorization');
const HTF_DEEP_BASE_RETEST_AUTHORIZATION = Symbol('htf-deep-base-retest-authorization');
const COINGLASS_HYBRID_LIQUIDITY_AUTHORIZATION = Symbol('coinglass-hybrid-liquidity-authorization');
const COIN_HORIZON_SWEEP_AUTHORIZATION = Symbol('coin-horizon-sweep-authorization');
const BIG_CANDLE_PUMP_15M_AUTHORIZATION = Symbol('big-candle-pump-15m-authorization');
const LIQ_SCAN_HIGH_SCORE_AUTHORIZATION = Symbol('liq-scan-high-score-authorization');
const LIQ_SCAN_MAIN_KILL_SWEEP_AUTHORIZATION = Symbol('liq-scan-main-kill-sweep-authorization');
const COIN_LEVEL_ENTRY_WATCH_AUTHORIZATION = Symbol('coin-level-entry-watch-authorization');
const LIMIT_PAPER_FILL_AUTHORIZATION = Symbol('limit-paper-fill-authorization');
const POST_MOVE_IDEAL_SHORT_1H_AUTHORIZATION = Symbol('post-move-ideal-short-1h-authorization');
const POST_MOVE_IDEAL_LONG_1H_AUTHORIZATION = Symbol('post-move-ideal-long-1h-authorization');
const POST_MOVE_IDEAL_LONG_4H_AUTHORIZATION = Symbol('post-move-ideal-long-4h-authorization');
const POST_MOVE_IDEAL_SHORT_4H_AUTHORIZATION = Symbol('post-move-ideal-short-4h-authorization');
const POST_MOVE_PRIORITY_15M_AUTHORIZATION = Symbol('post-move-priority-15m-authorization');
const POST_MOVE_IMPULSE_5M_AUTHORIZATION = Symbol('post-move-impulse-5m-authorization');
const BTC_RELATIVE_STRENGTH_AUTHORIZATION = Symbol('btc-relative-strength-authorization');
const LOCAL_AI_PASS_MIDPOINT_AUTHORIZATION = Symbol('local-ai-pass-midpoint-authorization');
const LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_AUTHORIZATION =
  Symbol('local-ai-liquidity-breakout-opposite-depth-authorization');
const LIQ_SCAN_MAIN_KILL_FILTER_VERSION =
  'LIQSCAN_MAIN_KILL_SWEEP_SHORT_REJECTION_FILTER_V2_20260927';
export function authorizePostMoveImpulse5mOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, POST_MOVE_IMPULSE_5M_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizeBtcRelativeStrengthOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, BTC_RELATIVE_STRENGTH_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizeLocalAiPassMidpointOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, LOCAL_AI_PASS_MIDPOINT_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizeLocalAiLiquidityBreakoutOppositeDepthOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizePostMovePriority15mOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, POST_MOVE_PRIORITY_15M_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizePostMoveIdealLong4hOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, POST_MOVE_IDEAL_LONG_4H_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizePostMoveIdealShort4hOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, POST_MOVE_IDEAL_SHORT_4H_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizePostMoveIdealLong1hOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, POST_MOVE_IDEAL_LONG_1H_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizePostMoveIdealShort1hOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, POST_MOVE_IDEAL_SHORT_1H_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizeLimitPaperFillOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, LIMIT_PAPER_FILL_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizeCoinLevelEntryWatchOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, COIN_LEVEL_ENTRY_WATCH_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizeLiqScanMainKillSweepOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, LIQ_SCAN_MAIN_KILL_SWEEP_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizeLiqScanHighScoreOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, LIQ_SCAN_HIGH_SCORE_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizeBigCandlePump15mOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, BIG_CANDLE_PUMP_15M_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizeCoinHorizonSweepOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, COIN_HORIZON_SWEEP_AUTHORIZATION, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  return authorized;
}
export function authorizeCoinglassHybridLiquidityOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, COINGLASS_HYBRID_LIQUIDITY_AUTHORIZATION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return authorized;
}
export function authorizeHtfDeepBaseRetestOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, HTF_DEEP_BASE_RETEST_AUTHORIZATION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return authorized;
}
export function authorizeExtremeShortSqueezeOrder(payload={}) {
  const p={...payload};Object.defineProperty(p,EXTREME_SHORT_SQUEEZE_AUTHORIZATION,{value:true});return p;
}
export function authorizeEma99BounceLongOrder(payload={}) {
  const p={...payload};Object.defineProperty(p,EMA99_BOUNCE_LONG_AUTHORIZATION,{value:true});return p;
}
export function authorizeEma99ReclaimLongOrder(payload={}) {
  const p={...payload};Object.defineProperty(p,EMA99_RECLAIM_LONG_AUTHORIZATION,{value:true});return p;
}
export function authorizeEma99NearRejectOrder(payload={}) {
  const p={...payload};Object.defineProperty(p,EMA99_NEAR_REJECT_AUTHORIZATION,{value:true});return p;
}

export function liveCardOnlyAutoBinanceEnabled(env = process.env) {
  return env.LIVE_CARD_WHITELIST_ONLY_AUTO_BINANCE !== 'false';
}

export function authorizeLiveCardAutoOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, LIVE_CARD_AUTO_ORDER_AUTHORIZATION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return authorized;
}

export function authorizeLiquidFlowV2AutoOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, LIQUID_FLOW_V2_AUTO_ORDER_AUTHORIZATION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return authorized;
}

export function authorizeCoinglassWebAutoOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, COINGLASS_WEB_AUTO_ORDER_AUTHORIZATION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return authorized;
}

export function authorizePumpDumpAbsorptionAutoOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, PUMP_DUMP_ABSORPTION_AUTO_ORDER_AUTHORIZATION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return authorized;
}

export function authorizePostPumpKillShortAutoOrder(payload = {}) {
  const authorized = { ...payload };
  Object.defineProperty(authorized, POST_PUMP_KILL_SHORT_AUTO_ORDER_AUTHORIZATION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return authorized;
}

export function evaluateAutoBinanceEntryPolicy({
  payload = {},
  tokenIsAuthorized = false,
  orderEnabled = false,
  env = process.env,
} = {}) {
  const exclusive = liveCardOnlyAutoBinanceEnabled(env);
  const dryRun = payload?.dryRun !== false;

  if (!exclusive) {
    return { allowed: true, exclusive: false, reason: 'LEGACY_AUTO_MODE' };
  }
  if (dryRun || !orderEnabled) {
    return { allowed: true, exclusive: true, reason: 'NO_REAL_ORDER' };
  }
  if (tokenIsAuthorized) {
    return { allowed: true, exclusive: true, reason: 'MANUAL_ORDERS_SESSION' };
  }
  if (payload?.[LIVE_CARD_AUTO_ORDER_AUTHORIZATION] === true) {
    return { allowed: true, exclusive: true, reason: 'CHECKED_LIVE_CARD' };
  }
  if (payload?.[LIQUID_FLOW_V2_AUTO_ORDER_AUTHORIZATION] === true) {
    return { allowed: true, exclusive: true, reason: 'LIQUID_FLOW_V2_READY_FILL' };
  }
  if (payload?.[COINGLASS_WEB_AUTO_ORDER_AUTHORIZATION] === true) {
    return { allowed: true, exclusive: true, reason: 'COINGLASS_QUALIFIED_SETUP' };
  }
  if (payload?.[PUMP_DUMP_ABSORPTION_AUTO_ORDER_AUTHORIZATION] === true) {
    return { allowed: true, exclusive: true, reason: 'PUMP_DUMP_ABSORPTION_READY' };
  }
  if (payload?.[POST_PUMP_KILL_SHORT_AUTO_ORDER_AUTHORIZATION] === true) {
    return { allowed: true, exclusive: true, reason: 'POST_PUMP_KILL_SHORT_CONFIRMED' };
  }
  if (payload?.[LIMIT_PAPER_FILL_AUTHORIZATION] === true
    && payload.source === LIMIT_PAPER_FILL_SOURCE
    && payload.streamId === LIMIT_PAPER_FILL_STREAM
    && LIMIT_PAPER_FILL_LABELS.includes(payload.signalLabel)
    && payload.signalInterval === '15m'
    && payload.side === 'BUY'
    && payload.orderType === 'MARKET'
    && Number(payload.marginUsdt) === 1
    && Number(payload.leverage) === 5
    && Number(payload.notionalUsdt) === 5
    && Number(payload.takeProfitRoePct) === 10
    && Number(payload.stopLossRoePct) === 20
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)) {
    return { allowed: true, exclusive: true, reason: 'LIMIT_PAPER_SHALLOW_FILL_RISK_ON_MARKET' };
  }
  if (payload?.[POST_MOVE_IDEAL_SHORT_1H_AUTHORIZATION] === true
    && payload.source === 'post-move-ideal-entry'
    && payload.streamId === 'post-pump-volume-fade-1h'
    && payload.signalLabel === 'SHORT_IDEAL_ENTRY_TOUCH'
    && payload.signalInterval === '1h'
    && payload.side === 'SELL'
    && payload.orderType === 'MARKET'
    && ['SHORT_NEAR_TOP', 'SHORT_FIRST_STRONG_CANDLE'].includes(payload.signalStageKey)
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)
    && payload.stopLossRoePct === 30) {
    return { allowed: true, exclusive: true, reason: 'POST_MOVE_IDEAL_SHORT_1H_TOUCH_CONFIGURED_ENTRY' };
  }
  if (payload?.[POST_MOVE_IDEAL_LONG_1H_AUTHORIZATION] === true
    && payload.source === 'post-move-ideal-entry'
    && payload.streamId === 'post-dump-volume-recovery-1h'
    && payload.signalLabel === 'LONG_IDEAL_ENTRY_TOUCH'
    && payload.signalInterval === '1h'
    && payload.side === 'BUY'
    && payload.orderType === 'MARKET'
    && ['LONG_FRESH_REVERSAL', 'LONG_FIRST_STRONG_CANDLE'].includes(payload.signalStageKey)
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)
    && payload.stopLossRoePct === 20) {
    return { allowed: true, exclusive: true, reason: 'POST_MOVE_IDEAL_LONG_1H_TOUCH_CONFIGURED_ENTRY' };
  }
  if (payload?.[POST_MOVE_IDEAL_LONG_4H_AUTHORIZATION] === true
    && payload.source === 'post-move-ideal-entry'
    && payload.streamId === 'post-dump-volume-recovery-4h'
    && payload.signalLabel === 'LONG_IDEAL_ENTRY_TOUCH'
    && payload.signalInterval === '4h'
    && payload.side === 'BUY'
    && payload.orderType === 'MARKET'
    && ['LONG_FRESH_REVERSAL', 'LONG_FIRST_STRONG_CANDLE'].includes(payload.signalStageKey)
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)
    && payload.stopLossRoePct === 20) {
    return { allowed: true, exclusive: true, reason: 'POST_MOVE_IDEAL_LONG_4H_TOUCH_CONFIGURED_ENTRY' };
  }
  if (payload?.[POST_MOVE_IDEAL_SHORT_4H_AUTHORIZATION] === true
    && payload.source === 'post-move-ideal-entry'
    && payload.streamId === 'post-pump-volume-fade-4h'
    && payload.signalLabel === 'SHORT_IDEAL_ENTRY_TOUCH'
    && payload.signalInterval === '4h'
    && payload.side === 'SELL'
    && payload.orderType === 'MARKET'
    && ['SHORT_NEAR_TOP', 'SHORT_FIRST_STRONG_CANDLE'].includes(payload.signalStageKey)
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)
    && payload.stopLossRoePct === 30) {
    return { allowed: true, exclusive: true, reason: 'POST_MOVE_IDEAL_SHORT_4H_TOUCH_CONFIGURED_ENTRY' };
  }
  if (payload?.[POST_MOVE_PRIORITY_15M_AUTHORIZATION] === true
    && payload.source === 'post-move-ideal-entry'
    && payload.signalInterval === '15m'
    && payload.orderType === 'MARKET'
    && Number(payload.maxOpenPositions) === 15
    && (((payload.streamId === 'post-dump-volume-recovery-15m'
      && payload.signalLabel === 'LONG_PRIORITY_STAGE_15M'
      && ['LONG_FRESH_REVERSAL', 'LONG_FIRST_STRONG_CANDLE'].includes(payload.signalStageKey)
      && payload.side === 'BUY' && payload.stopLossRoePct === 20))
      || (payload.streamId === 'post-pump-volume-fade-15m'
        && payload.signalLabel === 'SHORT_PRIORITY_STAGE_15M'
        && ['SHORT_NEAR_TOP', 'SHORT_FIRST_STRONG_CANDLE'].includes(payload.signalStageKey)
        && payload.side === 'SELL' && payload.stopLossRoePct === 30))
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)) {
    return { allowed: true, exclusive: true, reason: 'POST_MOVE_PRIORITY_STAGE_15M_CONFIGURED_ENTRY_MAX15' };
  }
  if (payload?.[POST_MOVE_IMPULSE_5M_AUTHORIZATION] === true
    && payload.source === 'post-move-impulse'
    && payload.signalInterval === '5m'
    && payload.orderType === 'MARKET'
    && validImpulseSizing(payload)
    && Number(payload.leverage) === 5
    && Number(payload.notionalUsdt) === Number(payload.marginUsdt) * 5
    && Number(payload.takeProfitRoePct) === 10
    && Number(payload.maxOpenPositions) === 50
    && (((payload.streamId === 'post-dump-no-sell-5m'
      && payload.signalLabel === 'POST_DUMP_NO_SELL_BUY_IMPULSE_LONG'
      && payload.signalStageKey === 'BUY_IMPULSE'
      && payload.side === 'BUY' && Number(payload.stopLossRoePct) === 20))
      || (payload.streamId === 'post-pump-no-buy-5m'
        && payload.signalLabel === 'POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT'
        && payload.signalStageKey === 'NO_BUY_CONFIRMATION'
        && payload.side === 'SELL' && Number(payload.stopLossRoePct) === 30))
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)) {
    return { allowed: true, exclusive: true, reason: 'POST_MOVE_IMPULSE_TIME_OR_BTC_MARGIN5_ELSE1_MAX50' };
  }
  if (payload?.[BTC_RELATIVE_STRENGTH_AUTHORIZATION] === true
    && payload.source === 'btc-relative-strength-watch'
    && payload.streamId === 'opposite-btc-5m'
    && payload.signalLabel === 'RELATIVE_ENTRY_READY'
    && payload.signalStageKey === 'RELATIVE_ENTRY_READY'
    && payload.signalInterval === '5m'
    && payload.orderType === 'MARKET'
    && Number(payload.marginUsdt) === 2
    && Number(payload.leverage) === 5
    && Number(payload.notionalUsdt) === 10
    && Number(payload.takeProfitRoePct) === 10
    && Number(payload.maxOpenPositions) === 50
    && ['BUY', 'SELL'].includes(payload.side)
    && payload.stopLossRoePct == null
    && payload.stopLossPrice == null
    && payload.stopLossDistanceFraction == null
    && payload.protectionSignalStopLossPrice == null
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)) {
    return { allowed: true, exclusive: true, reason: 'BTC_RELATIVE_STRENGTH_READY_MARKET_2USDT_TP_ONLY_MAX50' };
  }
  if (payload?.[LOCAL_AI_PASS_MIDPOINT_AUTHORIZATION] === true
    && payload.source === LOCAL_AI_PASS_MIDPOINT_SOURCE
    && payload.streamId === LOCAL_AI_PASS_MIDPOINT_STREAM
    && payload.signalLabel === LOCAL_AI_PASS_MIDPOINT_SIGNAL_LABEL
    && payload.signalStageKey === LOCAL_AI_PASS_MIDPOINT_SIGNAL_STAGE
    && ['15m', '1h', '4h'].includes(payload.signalInterval)
    && ['BUY', 'SELL'].includes(payload.side)
    && payload.orderType === 'MARKET'
    && Number(payload.marginUsdt) === LOCAL_AI_PASS_MIDPOINT_MARGIN_USDT
    && Number(payload.leverage) === LOCAL_AI_PASS_MIDPOINT_LEVERAGE
    && Number(payload.notionalUsdt)
      === LOCAL_AI_PASS_MIDPOINT_MARGIN_USDT * LOCAL_AI_PASS_MIDPOINT_LEVERAGE
    && Number(payload.takeProfitRoePct) === LOCAL_AI_PASS_MIDPOINT_TAKE_PROFIT_ROE_PCT
    && Number(payload.maxOpenPositions) === LOCAL_AI_PASS_MIDPOINT_MAX_OPEN_POSITIONS
    && Number(payload.signalEntryPrice) > 0
    && Number(payload.takeProfitPrice) > 0
    && Number(payload.stopLossPrice) > 0
    && Number(payload.stopLossRoePct) > 0
    && Number(payload.stopLossRoePct) <= LOCAL_AI_PASS_MIDPOINT_MAX_STRUCTURAL_SL_ROE_PCT
    && (payload.side === 'BUY'
      ? Number(payload.stopLossPrice) < Number(payload.signalEntryPrice)
        && Number(payload.takeProfitPrice) > Number(payload.signalEntryPrice)
      : Number(payload.stopLossPrice) > Number(payload.signalEntryPrice)
        && Number(payload.takeProfitPrice) < Number(payload.signalEntryPrice))
    && payload.protectionOnFill === true
    && payload.fillAnchorEnabled === true
    && payload.fillAnchorVersion === LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)) {
    return { allowed: true, exclusive: true, reason: 'LOCAL_AI_PRIORITY_ENGINE_ZONE_MARKET_1USDT' };
  }
  if (payload?.[LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_AUTHORIZATION] === true
    && payload.source === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SOURCE
    && payload.streamId === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_STREAM
    && [LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LONG_LABEL,
      LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SHORT_LABEL].includes(payload.signalLabel)
    && payload.signalStageKey === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_STAGE
    && ['5m', '15m'].includes(payload.signalInterval)
    && ((payload.side === 'BUY'
      && payload.signalLabel === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LONG_LABEL)
      || (payload.side === 'SELL'
        && payload.signalLabel === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SHORT_LABEL))
    && payload.orderType === 'MARKET'
    && Number(payload.marginUsdt) === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MARGIN_USDT
    && Number(payload.leverage) === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LEVERAGE
    && Number(payload.notionalUsdt) === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MARGIN_USDT
      * LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_LEVERAGE
    && Number(payload.takeProfitRoePct) === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_TP_ROE_PCT
    && Number(payload.stopLossRoePct) === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_SL_ROE_PCT
    && Number(payload.maxOpenPositions) === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MAX_OPEN_POSITIONS
    && Number(payload.signalEntryPrice) > 0 && Number(payload.takeProfitPrice) > 0
    && Number(payload.stopLossPrice) > 0
    && (payload.side === 'BUY'
      ? Number(payload.stopLossPrice) < Number(payload.signalEntryPrice)
        && Number(payload.takeProfitPrice) > Number(payload.signalEntryPrice)
      : Number(payload.stopLossPrice) > Number(payload.signalEntryPrice)
        && Number(payload.takeProfitPrice) < Number(payload.signalEntryPrice))
    && payload.protectionOnFill === true && payload.fillAnchorEnabled === true
    && payload.fillAnchorVersion === LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_BINANCE_VERSION
    && validOtherOrderSize(payload) && validOtherTakeProfitRoe(payload.takeProfitRoePct)) {
    return { allowed: true, exclusive: true,
      reason: 'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_MARKET_4USDT_5X_TP10_LONG_SL20_SHORT_TP_ONLY' };
  }
  if(payload?.[EMA99_WATCH_AUTH]===true&&payload.orderType==='MARKET'&&validEma99OrderSize(payload)
    &&EMA99_ENTRY_CATALOG.some(r=>r.source==='ema99-observe-only'&&payload.source===r.source&&payload.streamId===r.streamId
      &&payload.signalLabel===r.signalLabel&&payload.side===(r.side==='SHORT'?'SELL':'BUY')))return {allowed:true,exclusive:true,reason:'EMA99_WATCH_EXPLICIT_OPTIN'};
  if(payload?.[EMA99_BOUNCE_LONG_AUTHORIZATION]===true&&payload.source==='ema99-bounce-long'
    &&payload.signalLabel==='BOUNCE_CONFIRMED_LONG_WATCH'&&payload.side==='BUY'&&payload.orderType==='MARKET'
    &&validEma99OrderSize(payload)) {
    return {allowed:true,exclusive:true,reason:'EMA99_BOUNCE_CONFIRMED_LONG_CONFIGURED_MARGIN_5X'};
  }
  if(payload?.[EMA99_RECLAIM_LONG_AUTHORIZATION]===true&&payload.source==='ema99-reclaim-long'
    &&payload.signalLabel==='RECLAIM_LONG_WATCH'&&payload.side==='BUY'&&payload.orderType==='MARKET'
    &&validEma99OrderSize(payload)) {
    return {allowed:true,exclusive:true,reason:'EMA99_RECLAIM_LONG_CONFIGURED_MARGIN_5X'};
  }
  if(payload?.[EMA99_NEAR_REJECT_AUTHORIZATION]===true&&payload.source==='ema99-near-reject-short'
    &&payload.signalLabel==='REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH'&&payload.side==='SELL'&&payload.orderType==='MARKET'
    &&validEma99OrderSize(payload)) {
    return {allowed:true,exclusive:true,reason:'EMA99_NEAR_REJECT_CONFIGURED_MARGIN_5X'};
  }
  if(payload?.[EXTREME_SHORT_SQUEEZE_AUTHORIZATION]===true&&payload.source==='extreme-short-squeeze'
    &&((payload.streamId==='extreme-short-squeeze'
      &&['EXTREME_PUMP_CLOSED','FOLLOW_REJECTION_LIVE','PEAK_ZONE_SHORT_WATCH'].includes(payload.signalLabel)
      &&payload.signalInterval==='5m')
    ||(payload.streamId==='extreme-short-squeeze-saga-15m'
      &&payload.signalLabel==='FOLLOW_REJECTION_CLOSED'&&payload.signalInterval==='15m'
      &&payload.symbol==='SAGAUSDT'))
    &&payload.side==='SELL'&&payload.orderType==='MARKET'
    &&validOtherOrderSize(payload)&&validOtherTakeProfitRoe(payload.takeProfitRoePct)) {
    return {allowed:true,exclusive:true,reason:`${payload.signalLabel}_${payload.signalInterval.toUpperCase()}_SHORT_CONFIGURED_ENTRY`};
  }
  if (payload?.[HTF_DEEP_BASE_RETEST_AUTHORIZATION] === true
    && payload.source === 'htf-deep-base-ready'
    && payload.streamId === 'htf-deep-base-15m'
    && ((payload.signalLabel === 'RETEST_LONG_READY' && payload.side === 'BUY')
      || (payload.signalLabel === 'RETEST_SHORT_READY' && payload.side === 'SELL'))
    && ['5m', '15m'].includes(payload.signalInterval)
    && payload.orderType === 'MARKET'
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)
    && payload.stopLossRoePct === 30) {
    return { allowed: true, exclusive: true, reason: 'HTF_DEEP_BASE_RETEST_READY_CONFIGURED_ENTRY' };
  }
  if (payload?.[COINGLASS_HYBRID_LIQUIDITY_AUTHORIZATION] === true
    && payload.source === 'coinglass-hybrid-liquidity'
    && ['primary', 'secondary'].includes(payload.streamId)
    && ((payload.signalLabel === 'HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY'
      && payload.side === 'BUY')
      || (payload.signalLabel === 'HYBRID_LOWER_FIRST_LONG_FLUSH_READY'
        && payload.side === 'SELL'))
    && payload.signalInterval === '5m'
    && payload.orderType === 'MARKET'
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)) {
    return { allowed: true, exclusive: true, reason: 'COINGLASS_HYBRID_DIRECTIONAL_CONFIGURED_ENTRY' };
  }
  if (payload?.[COIN_HORIZON_SWEEP_AUTHORIZATION] === true
    && payload.source === 'coin-horizon-sweep-transition'
    && payload.streamId === 'coin-horizon-4h8h12h'
    && ((payload.signalLabel === 'UPPER' && payload.side === 'BUY')
      || (payload.signalLabel === 'LOWER' && payload.side === 'SELL'))
    && payload.signalInterval === '4h/8h/12h'
    && payload.orderType === 'MARKET'
    && validOtherOrderSize(payload)
    && payload.stopLossRoePct === 25
    && Number(payload.takeProfitRoePct) >= 25
    && Number(payload.rewardRisk) >= 1) {
    return { allowed: true, exclusive: true, reason: 'COIN_HORIZON_TRANSITION_CONFIGURED_SIZE_DYNAMIC_TP_SL25' };
  }
  if (payload?.[BIG_CANDLE_PUMP_15M_AUTHORIZATION] === true
    && payload.source === 'big-candle-pump-15m'
    && payload.streamId === 'volume-dump-scanner'
    && payload.signalLabel === 'BIG_CANDLE_PUMP_LONG'
    && payload.signalInterval === '15m'
    && payload.side === 'BUY'
    && payload.orderType === 'MARKET'
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)
    && payload.stopLossRoePct === 20) {
    return { allowed: true, exclusive: true, reason: 'BIG_CANDLE_PUMP_15M_LONG_CONFIGURED_ENTRY' };
  }
  if (payload?.[LIQ_SCAN_HIGH_SCORE_AUTHORIZATION] === true
    && payload.source === 'liqscan-high-score'
    && payload.streamId === 'coin-level-analysis'
    && ((payload.signalLabel === 'LIQSCAN_HIGH_SCORE_ABOVE_LONG'
      && payload.side === 'BUY' && payload.stopLossRoePct === 20)
      || (payload.signalLabel === 'LIQSCAN_HIGH_SCORE_BELOW_SHORT'
        && payload.side === 'SELL' && payload.stopLossRoePct === 30))
    && payload.signalInterval === '15m'
    && payload.orderType === 'MARKET'
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)) {
    return { allowed: true, exclusive: true, reason: 'LIQSCAN_HIGH_SCORE_CONFIGURED_ENTRY' };
  }
  if (payload?.[LIQ_SCAN_MAIN_KILL_SWEEP_AUTHORIZATION] === true
    && payload.source === 'liqscan-main-kill-sweep'
    && payload.streamId === 'background-top400'
    && ((payload.signalLabel === 'LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT'
      && payload.side === 'SELL'
      && payload.zoneReturnConfirmed === true
      && Number.isFinite(Number(payload.sweepDepthPct))
      && Number(payload.sweepDepthPct) >= 0
      && Number(payload.sweepDepthPct) <= 0.1)
      || (payload.signalLabel === 'LIQSCAN_MAIN_KILL_LOWER_SWEEP_LONG'
        && payload.side === 'BUY'))
    && payload.entryFilterVersion === LIQ_SCAN_MAIN_KILL_FILTER_VERSION
    && payload.recentBidirectional3d === false
    && payload.signalInterval === '15m'
    && payload.orderType === 'MARKET'
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)
    && payload.stopLossRoePct === 30) {
    return { allowed: true, exclusive: true, reason: 'LIQSCAN_MAIN_KILL_FILTERED_REVERSAL_CONFIGURED_ENTRY' };
  }
  if (payload?.[COIN_LEVEL_ENTRY_WATCH_AUTHORIZATION] === true
    && payload.source === 'coin-level-entry-watch'
    && payload.streamId === 'closed-mtf-retest'
    && ((payload.signalLabel === 'RETEST_LONG_READY' && payload.side === 'BUY')
      || (payload.signalLabel === 'RETEST_SHORT_READY' && payload.side === 'SELL'))
    && payload.signalInterval === '5m'
    && payload.orderType === 'MARKET'
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)
    && payload.stopLossRoePct === 30) {
    return { allowed: true, exclusive: true, reason: 'COIN_LEVEL_CLOSED_MTF_RETEST_CONFIGURED_ENTRY' };
  }
  if (payload?.[COIN_LEVEL_ENTRY_WATCH_AUTHORIZATION] === true
    && payload.source === 'coin-level-entry-watch'
    && payload.streamId === 'closed-mtf-retest'
    && ((payload.signalLabel === 'RETEST_LONG_READY' && payload.side === 'BUY')
      || (payload.signalLabel === 'RETEST_SHORT_READY' && payload.side === 'SELL'))
    && payload.signalInterval === '5m'
    && payload.orderType === 'LIMIT'
    && String(payload.clientOrderId ?? '').startsWith('clel_')
    && Number(payload.marginUsdt) === 3
    && validOtherOrderSize(payload)
    && Number(payload.limitPrice) > 0
    && Number(payload.limitPrice) === Number(payload.signalEntryPrice)
    && Number(payload.entryExpiresAt) > Date.now()
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)
    && payload.stopLossRoePct === 30) {
    return { allowed: true, exclusive: true, reason: 'COIN_LEVEL_PRE_RETEST_LIMIT_3USDT_ENTRY' };
  }
  return {
    allowed: false,
    exclusive: true,
    reason: 'AUTO_BINANCE_BLOCKED_NOT_CHECKED_IN_ORDERS',
  };
}
