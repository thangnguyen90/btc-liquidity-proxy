export const AUTO_BINANCE_ENTRY_POLICY_VERSION = 'LIVE_CARD_LIQ_FLOW_COIN_LEVEL_LIMIT_V30_20260920';
import {validEma99OrderSize,EMA99_ENTRY_CATALOG} from './ema99EntryCatalog.js';
import {validOtherOrderSize,validOtherTakeProfitRoe} from './otherEntryCatalog.js';
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
    &&payload.streamId==='extreme-short-squeeze'&&['EXTREME_PUMP_CLOSED','FOLLOW_REJECTION_LIVE','PEAK_ZONE_SHORT_WATCH'].includes(payload.signalLabel)
    &&payload.signalInterval==='5m'&&payload.side==='SELL'&&payload.orderType==='MARKET'
    &&validOtherOrderSize(payload)&&validOtherTakeProfitRoe(payload.takeProfitRoePct)) {
    return {allowed:true,exclusive:true,reason:`${payload.signalLabel}_5M_SHORT_CONFIGURED_ENTRY`};
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
      && payload.side === 'SELL')
      || (payload.signalLabel === 'LIQSCAN_MAIN_KILL_LOWER_SWEEP_LONG'
        && payload.side === 'BUY'))
    && payload.signalInterval === '15m'
    && payload.orderType === 'MARKET'
    && validOtherOrderSize(payload)
    && validOtherTakeProfitRoe(payload.takeProfitRoePct)
    && payload.stopLossRoePct === 30) {
    return { allowed: true, exclusive: true, reason: 'LIQSCAN_MAIN_KILL_EXTREME_REVERSAL_CONFIGURED_ENTRY' };
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
