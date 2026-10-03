import assert from 'node:assert/strict';
import { impulseSizing } from '../src/postMoveImpulseSizing.js';
import { readFile } from 'node:fs/promises';
import {
  AUTO_BINANCE_ENTRY_POLICY_VERSION,
  LIQUID_FLOW_V2_BINANCE_LEVERAGE,
  authorizeCoinglassWebAutoOrder,
  authorizeLiquidFlowV2AutoOrder,
  authorizeLiveCardAutoOrder,
  authorizePostPumpKillShortAutoOrder,
  authorizePumpDumpAbsorptionAutoOrder,
  authorizeExtremeShortSqueezeOrder,
  authorizeCoinHorizonSweepOrder,
  authorizeLiqScanHighScoreOrder,
  authorizeLiqScanMainKillSweepOrder,
  authorizeCoinLevelEntryWatchOrder,
  authorizeLimitPaperFillOrder,
  authorizePostMoveIdealLong1hOrder,
  authorizePostMoveIdealLong4hOrder,
  authorizePostMoveIdealShort1hOrder,
  authorizePostMoveIdealShort4hOrder,
  authorizePostMovePriority15mOrder,
  authorizePostMoveImpulse5mOrder,
  authorizeBtcRelativeStrengthOrder,
  authorizeLocalAiPassMidpointOrder,
  evaluateAutoBinanceEntryPolicy,
  liveCardOnlyAutoBinanceEnabled,
} from '../src/autoBinancePolicy.js';
import { ceilQuantityAtMinimumNotional } from '../src/orderQuantityPolicy.js';

const exclusiveEnv = {};
assert.equal(AUTO_BINANCE_ENTRY_POLICY_VERSION, 'LOCAL_AI_PRIORITY_ZONE_1USDT_V51_20261003');
assert.equal(LIQUID_FLOW_V2_BINANCE_LEVERAGE, 5);
assert.equal(liveCardOnlyAutoBinanceEnabled(exclusiveEnv), true);
assert.equal(liveCardOnlyAutoBinanceEnabled({ LIVE_CARD_WHITELIST_ONLY_AUTO_BINANCE: 'false' }), false);
assert.equal(ceilQuantityAtMinimumNotional({
  steppedQuantity: 49.9,
  stepSize: 0.1,
  markPrice: 0.1,
  requestedNotional: 5,
  minimumNotional: 5,
  enabled: true,
}), 50);
assert.equal(ceilQuantityAtMinimumNotional({
  steppedQuantity: 4,
  stepSize: 1,
  markPrice: 1.02,
  requestedNotional: 5,
  minimumNotional: 5,
  enabled: true,
}), null, 'Must reject a lot-size ceil that exceeds the 1% notional cap.');

const realLegacyPayload = { symbol: 'BTCUSDT', dryRun: false, source: 'auto-trader' };
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: realLegacyPayload,
  orderEnabled: true,
  env: exclusiveEnv,
}).allowed, false);

const postMoveShort1hBase = {
  symbol: 'TESTUSDT', dryRun: false,
  source: 'post-move-ideal-entry', streamId: 'post-pump-volume-fade-1h',
  signalLabel: 'SHORT_IDEAL_ENTRY_TOUCH', signalInterval: '1h',
  signalStageKey: 'SHORT_NEAR_TOP',
  side: 'SELL', orderType: 'MARKET', marginUsdt: 10, leverage: 5,
  notionalUsdt: 50, takeProfitRoePct: 6, stopLossRoePct: 30,
};
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: postMoveShort1hBase, orderEnabled: true, env: exclusiveEnv,
}).allowed, false, 'visible post-move fields alone cannot authorize an order');
const postMoveShort1h = authorizePostMoveIdealShort1hOrder(postMoveShort1hBase);
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: postMoveShort1h, orderEnabled: true, env: exclusiveEnv,
}).reason, 'POST_MOVE_IDEAL_SHORT_1H_TOUCH_CONFIGURED_ENTRY');
for (const patch of [{ signalInterval: '15m' }, { side: 'BUY' }, { stopLossRoePct: 20 },
  { notionalUsdt: 10 }, { signalStageKey: 'SHORT_FADING' }]) {
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload: authorizePostMoveIdealShort1hOrder({ ...postMoveShort1hBase, ...patch }),
    orderEnabled: true, env: exclusiveEnv,
  }).allowed, false);
}
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...postMoveShort1h }, orderEnabled: true, env: exclusiveEnv,
}).allowed, false, 'post-move authorization must not survive a payload copy');

const postMoveLong1hBase = {
  symbol: 'TESTUSDT', dryRun: false,
  source: 'post-move-ideal-entry', streamId: 'post-dump-volume-recovery-1h',
  signalLabel: 'LONG_IDEAL_ENTRY_TOUCH', signalInterval: '1h',
  signalStageKey: 'LONG_FRESH_REVERSAL',
  side: 'BUY', orderType: 'MARKET', marginUsdt: 5, leverage: 5,
  notionalUsdt: 25, takeProfitRoePct: 10, stopLossRoePct: 20,
};
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: postMoveLong1hBase, orderEnabled: true, env: exclusiveEnv,
}).allowed, false, 'visible post-move LONG fields alone cannot authorize an order');
const postMoveLong1h = authorizePostMoveIdealLong1hOrder(postMoveLong1hBase);
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: postMoveLong1h, orderEnabled: true, env: exclusiveEnv,
}).reason, 'POST_MOVE_IDEAL_LONG_1H_TOUCH_CONFIGURED_ENTRY');
for (const patch of [{ signalInterval: '15m' }, { side: 'SELL' },
  { stopLossRoePct: 30 }, { notionalUsdt: 10 }, { signalStageKey: 'LONG_RECOVERING' }]) {
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload: authorizePostMoveIdealLong1hOrder({ ...postMoveLong1hBase, ...patch }),
    orderEnabled: true, env: exclusiveEnv,
  }).allowed, false);
}
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...postMoveLong1h }, orderEnabled: true, env: exclusiveEnv,
}).allowed, false, 'post-move LONG authorization must not survive a payload copy');

const postMoveLong4hBase = {
  symbol: 'NEARUSDT', dryRun: false,
  source: 'post-move-ideal-entry', streamId: 'post-dump-volume-recovery-4h',
  signalLabel: 'LONG_IDEAL_ENTRY_TOUCH', signalInterval: '4h',
  signalStageKey: 'LONG_FIRST_STRONG_CANDLE',
  side: 'BUY', orderType: 'MARKET', marginUsdt: 10, leverage: 5,
  notionalUsdt: 50, takeProfitRoePct: 10, stopLossRoePct: 20,
};
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: postMoveLong4hBase, orderEnabled: true, env: exclusiveEnv,
}).allowed, false, 'visible post-move LONG 4h fields alone cannot authorize an order');
const postMoveLong4h = authorizePostMoveIdealLong4hOrder(postMoveLong4hBase);
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: postMoveLong4h, orderEnabled: true, env: exclusiveEnv,
}).reason, 'POST_MOVE_IDEAL_LONG_4H_TOUCH_CONFIGURED_ENTRY');
for (const patch of [{ signalInterval: '1h' }, { side: 'SELL' },
  { stopLossRoePct: 30 }, { notionalUsdt: 25 }, { signalStageKey: 'LONG_EXTENDED' }]) {
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload: authorizePostMoveIdealLong4hOrder({ ...postMoveLong4hBase, ...patch }),
    orderEnabled: true, env: exclusiveEnv,
  }).allowed, false);
}
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...postMoveLong4h }, orderEnabled: true, env: exclusiveEnv,
}).allowed, false, 'post-move LONG 4h authorization must not survive a payload copy');

const postMoveShort4hBase = {
  symbol: 'SHORT4HUSDT', dryRun: false,
  source: 'post-move-ideal-entry', streamId: 'post-pump-volume-fade-4h',
  signalLabel: 'SHORT_IDEAL_ENTRY_TOUCH', signalInterval: '4h',
  signalStageKey: 'SHORT_FIRST_STRONG_CANDLE',
  side: 'SELL', orderType: 'MARKET', marginUsdt: 10, leverage: 5,
  notionalUsdt: 50, takeProfitRoePct: 6, stopLossRoePct: 30,
};
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: postMoveShort4hBase, orderEnabled: true, env: exclusiveEnv,
}).allowed, false, 'visible post-move SHORT 4h fields alone cannot authorize an order');
const postMoveShort4h = authorizePostMoveIdealShort4hOrder(postMoveShort4hBase);
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: postMoveShort4h, orderEnabled: true, env: exclusiveEnv,
}).reason, 'POST_MOVE_IDEAL_SHORT_4H_TOUCH_CONFIGURED_ENTRY');
for (const patch of [{ signalInterval: '1h' }, { side: 'BUY' },
  { stopLossRoePct: 20 }, { signalStageKey: 'SHORT_EXTENDED' }]) {
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload: authorizePostMoveIdealShort4hOrder({ ...postMoveShort4hBase, ...patch }),
    orderEnabled: true, env: exclusiveEnv,
  }).allowed, false);
}
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...postMoveShort4h }, orderEnabled: true, env: exclusiveEnv,
}).allowed, false, 'post-move SHORT 4h authorization must not survive a payload copy');

for (const priority of [
  {
    source: 'post-move-ideal-entry', streamId: 'post-dump-volume-recovery-15m',
    signalLabel: 'LONG_PRIORITY_STAGE_15M', signalStageKey: 'LONG_FRESH_REVERSAL',
    signalInterval: '15m', side: 'BUY', orderType: 'MARKET', marginUsdt: 2,
    leverage: 5, notionalUsdt: 10, takeProfitRoePct: 10, stopLossRoePct: 20,
    maxOpenPositions: 15, dryRun: false,
  },
  {
    source: 'post-move-ideal-entry', streamId: 'post-pump-volume-fade-15m',
    signalLabel: 'SHORT_PRIORITY_STAGE_15M', signalStageKey: 'SHORT_NEAR_TOP',
    signalInterval: '15m', side: 'SELL', orderType: 'MARKET', marginUsdt: 2,
    leverage: 5, notionalUsdt: 10, takeProfitRoePct: 6, stopLossRoePct: 30,
    maxOpenPositions: 15, dryRun: false,
  },
]) {
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload: priority, orderEnabled: true, env: exclusiveEnv,
  }).allowed, false, 'visible priority-stage fields alone cannot authorize an order');
  const authorized = authorizePostMovePriority15mOrder(priority);
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload: authorized, orderEnabled: true, env: exclusiveEnv,
  }).reason, 'POST_MOVE_PRIORITY_STAGE_15M_CONFIGURED_ENTRY_MAX15');
  for (const invalid of [
    { signalInterval: '1h' }, { maxOpenPositions: 30 }, { signalStageKey: 'LONG_EXTENDED' },
  ]) {
    assert.equal(evaluateAutoBinanceEntryPolicy({
      payload: authorizePostMovePriority15mOrder({ ...priority, ...invalid }),
      orderEnabled: true, env: exclusiveEnv,
    }).allowed, false);
  }
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload: { ...authorized }, orderEnabled: true, env: exclusiveEnv,
  }).allowed, false, 'priority-stage authorization must not survive a payload copy');
}

for (const impulse of [
  {
    source: 'post-move-impulse', streamId: 'post-dump-no-sell-5m',
    signalLabel: 'POST_DUMP_NO_SELL_BUY_IMPULSE_LONG', signalInterval: '5m',
    signalStageKey: 'BUY_IMPULSE', side: 'BUY', stopLossRoePct: 20,
  },
  {
    source: 'post-move-impulse', streamId: 'post-pump-no-buy-5m',
    signalLabel: 'POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT', signalInterval: '5m',
    signalStageKey: 'NO_BUY_CONFIRMATION', side: 'SELL', stopLossRoePct: 30,
  },
]) {
  const base = {
    symbol: 'TESTUSDT', dryRun: false, orderType: 'MARKET',
    marginUsdt: 5, leverage: 5, notionalUsdt: 25,
    takeProfitRoePct: 10, maxOpenPositions: 50,
    impulseSizing: impulseSizing({side:impulse.side,now:Date.parse('2026-10-01T20:00:00Z')}),
    ...impulse,
  };
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload: base, orderEnabled: true, env: exclusiveEnv,
  }).allowed, false, 'visible impulse fields alone cannot authorize an order');
  const authorized = authorizePostMoveImpulse5mOrder(base);
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload: authorized, orderEnabled: true, env: exclusiveEnv,
  }).reason, 'POST_MOVE_IMPULSE_TIME_OR_BTC_MARGIN5_ELSE1_MAX50');
  for (const invalid of [
    { signalInterval: '15m' }, { marginUsdt: 8, notionalUsdt: 40 }, { leverage: 10 },
    { takeProfitRoePct: 11 }, { maxOpenPositions: 30 },
    { signalStageKey: impulse.side === 'BUY' ? 'NO_SELL_CONFIRMATION' : 'SELL_IMPULSE' },
  ]) {
    assert.equal(evaluateAutoBinanceEntryPolicy({
      payload: authorizePostMoveImpulse5mOrder({ ...base, ...invalid }),
      orderEnabled: true, env: exclusiveEnv,
    }).allowed, false);
  }
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload: { ...authorized }, orderEnabled: true, env: exclusiveEnv,
  }).allowed, false, 'impulse authorization must not survive a payload copy');
}

for (const side of ['BUY', 'SELL']) {
  const relative = {
    symbol:'TESTUSDT', dryRun:false,
    source:'btc-relative-strength-watch', streamId:'opposite-btc-5m',
    signalLabel:'RELATIVE_ENTRY_READY', signalStageKey:'RELATIVE_ENTRY_READY',
    signalInterval:'5m', side, orderType:'MARKET', marginUsdt:2, leverage:5,
    notionalUsdt:10, takeProfitRoePct:10,
    stopLossRoePct:null, stopLossPrice:null, stopLossDistanceFraction:null,
    protectionSignalStopLossPrice:null,
    maxOpenPositions:50,
  };
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload:relative, orderEnabled:true, env:exclusiveEnv,
  }).allowed, false, 'visible BTC-relative fields alone cannot authorize an order');
  const authorized = authorizeBtcRelativeStrengthOrder(relative);
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload:authorized, orderEnabled:true, env:exclusiveEnv,
  }).reason, 'BTC_RELATIVE_STRENGTH_READY_MARKET_2USDT_TP_ONLY_MAX50');
  for (const invalid of [
    { marginUsdt:3, notionalUsdt:15 }, { leverage:10, notionalUsdt:20 },
    { signalStageKey:'WAIT_5M_CONFIRM' }, { maxOpenPositions:30 },
    { stopLossRoePct:side === 'BUY' ? 20 : 30 },
    { stopLossPrice:side === 'BUY' ? 0.9 : 1.1 },
    { stopLossDistanceFraction:0.04 },
    { protectionSignalStopLossPrice:side === 'BUY' ? 0.9 : 1.1 },
  ]) {
    assert.equal(evaluateAutoBinanceEntryPolicy({
      payload:authorizeBtcRelativeStrengthOrder({ ...relative, ...invalid }),
      orderEnabled:true, env:exclusiveEnv,
    }).allowed, false);
  }
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload:{ ...authorized }, orderEnabled:true, env:exclusiveEnv,
  }).allowed, false, 'BTC-relative authorization must not survive payload copy');
}

for (const side of ['BUY', 'SELL']) {
  const entry = 0.3466598;
  const localAi = {
    symbol:'TESTUSDT', dryRun:false,
    source:'local-ai-trend-evaluation', streamId:'priority-engine-zone',
    signalLabel:'LOCAL_AI_PRIORITY_ENGINE_ZONE_TOUCH', signalStageKey:'AI_PRIORITY_ENGINE_ZONE_TOUCH',
    signalInterval:'1h', side, orderType:'MARKET', marginUsdt:1, leverage:5,
    notionalUsdt:5, takeProfitRoePct:10, maxOpenPositions:50,
    signalEntryPrice:entry,
    takeProfitPrice:side === 'BUY' ? entry * 1.02 : entry * 0.98,
    stopLossPrice:side === 'BUY' ? 0.33 : 0.36,
    stopLossRoePct:20,
    protectionOnFill:true,
    fillAnchorEnabled:true,
    fillAnchorVersion:'LOCAL_AI_PRIORITY_ENGINE_ZONE_ENTRY_V2_MARKET_1USDT_20261003',
  };
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload:localAi, orderEnabled:true, env:exclusiveEnv,
  }).allowed, false, 'visible AI midpoint fields alone cannot authorize an order');
  const authorized = authorizeLocalAiPassMidpointOrder(localAi);
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload:authorized, orderEnabled:true, env:exclusiveEnv,
  }).reason, 'LOCAL_AI_PRIORITY_ENGINE_ZONE_MARKET_1USDT');
  for (const invalid of [
    { marginUsdt:3, notionalUsdt:15 }, { signalStageKey:'AI_PASS' },
    { signalInterval:'5m' }, { maxOpenPositions:30 },
    { stopLossPrice:side === 'BUY' ? 0.36 : 0.33 },
    { fillAnchorVersion:'FORGED' },
  ]) {
    assert.equal(evaluateAutoBinanceEntryPolicy({
      payload:authorizeLocalAiPassMidpointOrder({ ...localAi, ...invalid }),
      orderEnabled:true, env:exclusiveEnv,
    }).allowed, false);
  }
  assert.equal(evaluateAutoBinanceEntryPolicy({
    payload:{ ...authorized }, orderEnabled:true, env:exclusiveEnv,
  }).allowed, false, 'AI midpoint authorization must not survive payload copy');
}

const limitPaperFillPayload = authorizeLimitPaperFillOrder({
  symbol: 'TESTUSDT', dryRun: false,
  source: 'limit-paper-fill', streamId: 'ema99-retest-shallow',
  signalLabel: 'NEAR_EMA_LONG_WATCH', signalInterval: '15m',
  side: 'BUY', orderType: 'MARKET', marginUsdt: 1, leverage: 5,
  notionalUsdt: 5, takeProfitRoePct: 10, stopLossRoePct: 20,
});
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: limitPaperFillPayload, orderEnabled: true, env: exclusiveEnv,
}).reason, 'LIMIT_PAPER_SHALLOW_FILL_RISK_ON_MARKET');
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...limitPaperFillPayload }, orderEnabled: true, env: exclusiveEnv,
}).allowed, false, 'copying the visible payload must lose the private authorization symbol');
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: authorizeLimitPaperFillOrder({ ...limitPaperFillPayload, stopLossRoePct: 30 }),
  orderEnabled: true, env: exclusiveEnv,
}).allowed, false, 'selected fill orders require exact SL -20% ROE');

assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...realLegacyPayload, liveCardAuthorization: true },
  orderEnabled: true,
  env: exclusiveEnv,
}).allowed, false, 'A forgeable string property must not authorize an automatic order.');
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...realLegacyPayload, source: 'live-card-whitelist-edge' },
  orderEnabled: true,
  env: exclusiveEnv,
}).allowed, false, 'A forged live-card source string must not authorize an automatic order.');

const checkedCardPayload = authorizeLiveCardAutoOrder({
  symbol: 'BTCUSDT',
  dryRun: false,
  source: 'live-card-whitelist-liquid',
});
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: checkedCardPayload,
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'CHECKED_LIVE_CARD');

const liquidFlowBasePayload = authorizeLiquidFlowV2AutoOrder({
  symbol: 'BASEUSDT',
  side: 'BUY',
  dryRun: false,
});
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: liquidFlowBasePayload,
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'LIQUID_FLOW_V2_READY_FILL');

const coinglassPayload = authorizeCoinglassWebAutoOrder({
  symbol: 'GOODUSDT',
  side: 'SELL',
  dryRun: false,
});
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: coinglassPayload,
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'COINGLASS_QUALIFIED_SETUP');

const pumpDumpAbsorptionPayload = authorizePumpDumpAbsorptionAutoOrder({
  symbol: 'QUSDT',
  side: 'BUY',
  dryRun: false,
});
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: pumpDumpAbsorptionPayload,
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'PUMP_DUMP_ABSORPTION_READY');
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...pumpDumpAbsorptionPayload },
  orderEnabled: true,
  env: exclusiveEnv,
}).allowed, false, 'The non-enumerable pump-dump authorization must not survive a forged payload copy.');

const postPumpKillShortPayload = authorizePostPumpKillShortAutoOrder({
  symbol: 'SKRUSDT',
  side: 'SELL',
  dryRun: false,
});
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: postPumpKillShortPayload,
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'POST_PUMP_KILL_SHORT_CONFIRMED');
assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...postPumpKillShortPayload },
  orderEnabled: true,
  env: exclusiveEnv,
}).allowed, false, 'The non-enumerable PPKS authorization must not survive a forged payload copy.');

const extremeShortPayload=authorizeExtremeShortSqueezeOrder({
  source:'extreme-short-squeeze',streamId:'extreme-short-squeeze',signalLabel:'EXTREME_PUMP_CLOSED',
  signalInterval:'5m',side:'SELL',orderType:'MARKET',marginUsdt:1,notionalUsdt:5,leverage:5,takeProfitRoePct:15,dryRun:false,
});
assert.equal(evaluateAutoBinanceEntryPolicy({payload:extremeShortPayload,orderEnabled:true,env:exclusiveEnv}).reason,
  'EXTREME_PUMP_CLOSED_5M_SHORT_CONFIGURED_ENTRY');
const liveFollowShortPayload=authorizeExtremeShortSqueezeOrder({...extremeShortPayload,signalLabel:'FOLLOW_REJECTION_LIVE'});
assert.equal(evaluateAutoBinanceEntryPolicy({payload:liveFollowShortPayload,orderEnabled:true,env:exclusiveEnv}).reason,
  'FOLLOW_REJECTION_LIVE_5M_SHORT_CONFIGURED_ENTRY');
assert.equal(evaluateAutoBinanceEntryPolicy({payload:{...extremeShortPayload},orderEnabled:true,env:exclusiveEnv}).allowed,false,
  'Extreme SHORT authorization must not survive a forged payload copy.');
assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeExtremeShortSqueezeOrder({...extremeShortPayload,signalInterval:'15m'}),orderEnabled:true,env:exclusiveEnv}).allowed,false,
  '15m extreme pump remains observe-only.');
const sagaClosedFollowPayload=authorizeExtremeShortSqueezeOrder({...extremeShortPayload,
  symbol:'SAGAUSDT',streamId:'extreme-short-squeeze-saga-15m',signalLabel:'FOLLOW_REJECTION_CLOSED',
  signalInterval:'15m',marginUsdt:6,notionalUsdt:30});
assert.equal(evaluateAutoBinanceEntryPolicy({payload:sagaClosedFollowPayload,orderEnabled:true,env:exclusiveEnv}).reason,
  'FOLLOW_REJECTION_CLOSED_15M_SHORT_CONFIGURED_ENTRY');
assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeExtremeShortSqueezeOrder({...sagaClosedFollowPayload,
  symbol:'NOTSAGAUSDT'}),orderEnabled:true,env:exclusiveEnv}).allowed,false,
  'The closed 15m follow route is scoped to SAGAUSDT only.');
const peakShortPayload=authorizeExtremeShortSqueezeOrder({...extremeShortPayload,
  signalLabel:'PEAK_ZONE_SHORT_WATCH',marginUsdt:2,notionalUsdt:10});
assert.equal(evaluateAutoBinanceEntryPolicy({payload:peakShortPayload,orderEnabled:true,env:exclusiveEnv}).reason,
  'PEAK_ZONE_SHORT_WATCH_5M_SHORT_CONFIGURED_ENTRY');
for(const patch of [{notionalUsdt:5},{signalLabel:'PEAK_ZONE_SHORT_WATCH_LIVE'},{takeProfitRoePct:101}])
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeExtremeShortSqueezeOrder({...extremeShortPayload,
    signalLabel:'PEAK_ZONE_SHORT_WATCH',marginUsdt:2,notionalUsdt:10,...patch}),orderEnabled:true,env:exclusiveEnv}).allowed,false);
for(const patch of [{marginUsdt:1,notionalUsdt:5},{leverage:10,notionalUsdt:20}])
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeExtremeShortSqueezeOrder({...peakShortPayload,...patch}),
    orderEnabled:true,env:exclusiveEnv}).allowed,true,'policy accepts a self-consistent value authorized by the private executor; controls enforce the saved value');

const horizonLongBase={source:'coin-horizon-sweep-transition',streamId:'coin-horizon-4h8h12h',
  signalLabel:'UPPER',signalInterval:'4h/8h/12h',side:'BUY',orderType:'MARKET',
  marginUsdt:5,leverage:5,notionalUsdt:25,stopLossRoePct:25,takeProfitRoePct:30,rewardRisk:1.2,dryRun:false};
assert.equal(evaluateAutoBinanceEntryPolicy({payload:horizonLongBase,orderEnabled:true,env:exclusiveEnv}).allowed,false,
  'Coin Horizon source strings without the private authorization token must fail closed.');
const horizonLong=authorizeCoinHorizonSweepOrder(horizonLongBase);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:horizonLong,orderEnabled:true,env:exclusiveEnv}).reason,
  'COIN_HORIZON_TRANSITION_CONFIGURED_SIZE_DYNAMIC_TP_SL25');
const horizonShort=authorizeCoinHorizonSweepOrder({...horizonLongBase,signalLabel:'LOWER',side:'SELL'});
assert.equal(evaluateAutoBinanceEntryPolicy({payload:horizonShort,orderEnabled:true,env:exclusiveEnv}).allowed,true);
for(const change of [{side:'SELL'},{marginUsdt:10,notionalUsdt:25},{takeProfitRoePct:20,rewardRisk:0.8}])
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeCoinHorizonSweepOrder({...horizonLongBase,...change}),orderEnabled:true,env:exclusiveEnv}).allowed,false);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeCoinHorizonSweepOrder({...horizonLongBase,
  marginUsdt:10,notionalUsdt:50}),orderEnabled:true,env:exclusiveEnv}).allowed,true,
'editable Coin Horizon margin is accepted when notional remains self-consistent');
assert.equal(evaluateAutoBinanceEntryPolicy({payload:{...horizonLong},orderEnabled:true,env:exclusiveEnv}).allowed,false,
  'Coin Horizon authorization must not survive a payload copy.');

const liqScanLongBase={source:'liqscan-high-score',streamId:'coin-level-analysis',
  signalLabel:'LIQSCAN_HIGH_SCORE_ABOVE_LONG',signalInterval:'15m',side:'BUY',orderType:'MARKET',
  marginUsdt:5,leverage:5,notionalUsdt:25,takeProfitRoePct:15,stopLossRoePct:20,dryRun:false};
assert.equal(evaluateAutoBinanceEntryPolicy({payload:liqScanLongBase,orderEnabled:true,env:exclusiveEnv}).allowed,false,
  'LiqScan source strings without the private authorization token must fail closed.');
const liqScanLong=authorizeLiqScanHighScoreOrder(liqScanLongBase);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:liqScanLong,orderEnabled:true,env:exclusiveEnv}).reason,
  'LIQSCAN_HIGH_SCORE_CONFIGURED_ENTRY');
const liqScanShort=authorizeLiqScanHighScoreOrder({...liqScanLongBase,
  signalLabel:'LIQSCAN_HIGH_SCORE_BELOW_SHORT',side:'SELL',stopLossRoePct:30});
assert.equal(evaluateAutoBinanceEntryPolicy({payload:liqScanShort,orderEnabled:true,env:exclusiveEnv}).allowed,true);
for(const change of [{side:'SELL'},{signalInterval:'5m'},{stopLossRoePct:30}])
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeLiqScanHighScoreOrder({...liqScanLongBase,...change}),orderEnabled:true,env:exclusiveEnv}).allowed,false);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:{...liqScanLong},orderEnabled:true,env:exclusiveEnv}).allowed,false,
  'LiqScan authorization must not survive a payload copy.');

const mainKillShortBase={source:'liqscan-main-kill-sweep',streamId:'background-top400',
  signalLabel:'LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT',signalInterval:'15m',side:'SELL',orderType:'MARKET',
  marginUsdt:1,leverage:5,notionalUsdt:5,takeProfitRoePct:10,stopLossRoePct:30,dryRun:false,
  entryFilterVersion:'LIQSCAN_MAIN_KILL_SWEEP_SHORT_REJECTION_FILTER_V2_20260927',
  zoneReturnConfirmed:true,sweepDepthPct:0.08,recentBidirectional3d:false};
assert.equal(evaluateAutoBinanceEntryPolicy({payload:mainKillShortBase,orderEnabled:true,env:exclusiveEnv}).allowed,false,
  'MAIN KILL source strings without the private authorization token must fail closed.');
const mainKillShort=authorizeLiqScanMainKillSweepOrder(mainKillShortBase);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:mainKillShort,orderEnabled:true,env:exclusiveEnv}).reason,
  'LIQSCAN_MAIN_KILL_FILTERED_REVERSAL_CONFIGURED_ENTRY');
const mainKillLong=authorizeLiqScanMainKillSweepOrder({...mainKillShortBase,
  signalLabel:'LIQSCAN_MAIN_KILL_LOWER_SWEEP_LONG',side:'BUY'});
assert.equal(evaluateAutoBinanceEntryPolicy({payload:mainKillLong,orderEnabled:true,env:exclusiveEnv}).allowed,true);
for(const change of [{side:'BUY'},{signalInterval:'5m'},{stopLossRoePct:25},{notionalUsdt:6},
  {zoneReturnConfirmed:false},{sweepDepthPct:0.1001},{recentBidirectional3d:true},
  {entryFilterVersion:'OLD'}])
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeLiqScanMainKillSweepOrder({...mainKillShortBase,...change}),
    orderEnabled:true,env:exclusiveEnv}).allowed,false);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:{...mainKillShort},orderEnabled:true,env:exclusiveEnv}).allowed,false,
  'MAIN KILL authorization must not survive a payload copy.');

const coinLevelRetestBase={source:'coin-level-entry-watch',streamId:'closed-mtf-retest',
  signalLabel:'RETEST_LONG_READY',signalInterval:'5m',side:'BUY',orderType:'MARKET',
  marginUsdt:1,leverage:5,notionalUsdt:5,takeProfitRoePct:10,stopLossRoePct:30,dryRun:false};
assert.equal(evaluateAutoBinanceEntryPolicy({payload:coinLevelRetestBase,orderEnabled:true,env:exclusiveEnv}).allowed,false,
  'Coin Level source strings without the private authorization token must fail closed.');
const coinLevelLong=authorizeCoinLevelEntryWatchOrder(coinLevelRetestBase);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:coinLevelLong,orderEnabled:true,env:exclusiveEnv}).reason,
  'COIN_LEVEL_CLOSED_MTF_RETEST_CONFIGURED_ENTRY');
const coinLevelShort=authorizeCoinLevelEntryWatchOrder({...coinLevelRetestBase,
  signalLabel:'RETEST_SHORT_READY',side:'SELL'});
assert.equal(evaluateAutoBinanceEntryPolicy({payload:coinLevelShort,orderEnabled:true,env:exclusiveEnv}).allowed,true);
for(const change of [{side:'SELL'},{signalInterval:'15m'},{stopLossRoePct:20},{notionalUsdt:6}])
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeCoinLevelEntryWatchOrder({...coinLevelRetestBase,...change}),
    orderEnabled:true,env:exclusiveEnv}).allowed,false);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:{...coinLevelLong},orderEnabled:true,env:exclusiveEnv}).allowed,false,
  'Coin Level authorization must not survive a payload copy.');
const coinLevelLimitBase={...coinLevelRetestBase,orderType:'LIMIT',clientOrderId:'clel_test',
  limitPrice:1.099,signalEntryPrice:1.099,entryExpiresAt:Date.now()+60_000,
  marginUsdt:3,notionalUsdt:15};
assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeCoinLevelEntryWatchOrder(coinLevelLimitBase),
  orderEnabled:true,env:exclusiveEnv}).reason,'COIN_LEVEL_PRE_RETEST_LIMIT_3USDT_ENTRY');
for(const change of [{marginUsdt:1,notionalUsdt:5},{clientOrderId:'clew_wrong'},
  {limitPrice:1.1},{entryExpiresAt:Date.now()-1},{orderType:'LIMIT_IOC'}])
  assert.equal(evaluateAutoBinanceEntryPolicy({payload:authorizeCoinLevelEntryWatchOrder({...coinLevelLimitBase,...change}),
    orderEnabled:true,env:exclusiveEnv}).allowed,false);
assert.equal(evaluateAutoBinanceEntryPolicy({payload:{...authorizeCoinLevelEntryWatchOrder(coinLevelLimitBase)},
  orderEnabled:true,env:exclusiveEnv}).allowed,false);

assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: realLegacyPayload,
  tokenIsAuthorized: true,
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'MANUAL_ORDERS_SESSION');

assert.equal(evaluateAutoBinanceEntryPolicy({
  payload: { ...realLegacyPayload, dryRun: true },
  orderEnabled: true,
  env: exclusiveEnv,
}).reason, 'NO_REAL_ORDER');

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
for (const functionName of [
  'handlePostPumpDumpRiskRealOrder',
  'handlePostDumpBounceRiskRealOrder',
  'handleEmaSqueezeRealLongOrders',
  'autoPlaceBinanceOnEntryReady',
  'handleShakeoutReclaimRealOrders',
  'runAutoTradeScan',
  'runAvgDownScan',
  'handlePumpAutoOrder',
  'handleLiqAutoOrder',
  'handleAvgDown',
]) {
  const marker = `async function ${functionName}`;
  const start = serverSource.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} must exist.`);
  assert.match(
    serverSource.slice(start, start + 400),
    /if \(liveCardOnlyAutoBinanceEnabled\(\)\) return;/,
    `${functionName} must be hard-blocked by the exclusive auto-entry policy.`,
  );
}
assert.match(serverSource, /evaluateAutoBinanceEntryPolicy\(\{/);
assert.match(serverSource, /placeOrder\(authorizeLiveCardAutoOrder\(\{/);
assert.match(serverSource, /placeOrder\(authorizeLiquidFlowV2AutoOrder\(\{/);
assert.match(serverSource, /placeOrder\(authorizeCoinglassWebAutoOrder\(\{/);
assert.match(serverSource, /authorizePumpDumpAbsorptionAutoOrder\(protectedOrderPayload\)/);
assert.match(serverSource, /authorizeExtremeShortSqueezeOrder\(plan\)/);
assert.match(serverSource, /authorizeLiqScanHighScoreOrder\(plan\)/);
assert.match(serverSource, /authorizeLiqScanMainKillSweepOrder\(plan\)/);
assert.match(serverSource, /authorizeCoinLevelEntryWatchOrder\(plan\)/);
assert.match(serverSource, /authorizeLimitPaperFillOrder\(plan\)/);
const ppksHandlerStart = serverSource.indexOf('async function handlePostPumpKillShortRealOrder');
const ppksHandlerEnd = serverSource.indexOf('let _pumpIgnitionDebounce', ppksHandlerStart);
const ppksHandlerSource = serverSource.slice(ppksHandlerStart, ppksHandlerEnd);
assert.match(serverSource, /PPKS_BINANCE_CONFIRMED_SHORT_V2_1USDT_20260902/);
assert.doesNotMatch(ppksHandlerSource, /if \(liveCardOnlyAutoBinanceEnabled\(\)\) return;/);
assert.match(ppksHandlerSource, /sig\?\.type !== 'post_pump_kill_short'/);
assert.match(ppksHandlerSource, /sig\.stage !== 'confirmed_short' \|\| sig\.action !== 'SHORT'/);
assert.match(ppksHandlerSource, /POST_PUMP_KILL_SHORT_AUTO_MIN_SCORE \?\? 60/);
assert.match(ppksHandlerSource, /POST_PUMP_KILL_SHORT_AUTO_MARGIN_USDT \?\? 1/);
assert.match(ppksHandlerSource, /authorizePostPumpKillShortAutoOrder\(\{/);
assert.match(ppksHandlerSource, /source: 'post-pump-kill-short'/);
assert.match(ppksHandlerSource, /allowMinNotionalCeil: true/);
const ema99HandlerStart = serverSource.indexOf('async function handleEma99KillReclaimRealLongOrders');
const ema99HandlerEnd = serverSource.indexOf("klineCache.on('candleClose'", ema99HandlerStart);
const ema99HandlerSource = serverSource.slice(ema99HandlerStart, ema99HandlerEnd);
assert.match(ema99HandlerSource, /PUMP_DUMP_ABSORPTION_REAL_ORDER_ENABLED/);
assert.match(ema99HandlerSource, /return !liveCardOnly && genericRealEnabled/);
assert.doesNotMatch(ema99HandlerSource, /if \(liveCardOnlyAutoBinanceEnabled\(\)\) return;/);
assert.match(serverSource, /'PRE_UP_BASE_LONG'/);
assert.match(serverSource, /'PRE_DOWN_BASE_SHORT'/);
assert.match(serverSource, /LIQ_FLOW_V2_PRE_BINANCE_MARGIN_USDT \?\? 5/);
assert.doesNotMatch(serverSource, /LIQ_FLOW_V2_PRE_BINANCE_LEVERAGE/);
assert.match(serverSource, /LIQ_FLOW_V2_BASE_LONG_BINANCE_MARGIN_USDT \?\? 2/);
assert.match(serverSource, /allowMinNotionalCeil: profile\.cohort === 'PRE_EMA99'/);
assert.match(serverSource, /ceilQuantityAtMinimumNotional\(\{/);
assert.match(serverSource, /klineCache\.on\('candleTick', \(event\) => \{/);
assert.match(serverSource, /event\?\.interval === '5m'/);
assert.match(serverSource, /klineCache\.on\('candleClose', scheduleLiquidHeatmapFlowV2FastScan\)/);
assert.match(serverSource, /klineCache\.subscribe\(symbols, '15m'\)/);
assert.match(serverSource, /klineCache\.subscribe\(symbols, '1h'\)/);
assert.match(serverSource, /klineCache\.subscribe\(symbols, '4h'\)/);
assert.match(serverSource, /evaluatePendingEntryConfirmations\(rows, generatedAt\)/);
assert.match(serverSource, /evaluatePendingEntryConfirmations\(\[row\], generatedAt\)/);
assert.match(serverSource, /liquidFlowV2Paper\.pendingConfirmationSymbols\(\)/);
const v2RealLabelsSource = serverSource.slice(
  serverSource.indexOf('const LIQUID_FLOW_V2_AUTO_REAL_LABELS'),
  serverSource.indexOf('async function notifyLiquidFlowV2Binance'),
);
assert.match(v2RealLabelsSource, /HTF_BEAR_15M_EMA99_PUMP_REJECT/);
assert.match(v2RealLabelsSource, /HTF_BULL_15M_EMA99_DUMP_RECLAIM/);
assert.match(v2RealLabelsSource, /EMA_FAN_LONG_READY/);
assert.match(v2RealLabelsSource, /EMA_FAN_LONG_IMPULSE_RUNNER/);
assert.match(v2RealLabelsSource, /PUMP_FLUSH_RECLAIM_LONG_READY/);
assert.match(v2RealLabelsSource, /PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY/);
assert.match(v2RealLabelsSource, /POST_PUMP_SHORT_SQUEEZE_LONG_READY/);
assert.doesNotMatch(v2RealLabelsSource, /POST_PUMP_SHORT_SQUEEZE_PRIME/);
assert.doesNotMatch(v2RealLabelsSource, /EMA_FAN_SHORT_READY/);
assert.ok(serverSource.includes('LIQ_FLOW_V2_HTF_BINANCE_MARGIN_USDT ?? 5'));
assert.ok(serverSource.includes('LIQ_FLOW_V2_PUMP_FLUSH_BINANCE_MARGIN_USDT ?? 1.5'));
assert.ok(serverSource.includes('LIQ_FLOW_V2_PRIMARY_PANIC_BINANCE_MARGIN_USDT ?? 2'));
assert.ok(serverSource.includes('LIQ_FLOW_V2_POST_PUMP_READY_BINANCE_MARGIN_USDT ?? 2'));
assert.match(serverSource, /profile\?\.cohort === 'PUMP_FLUSH_RECLAIM'/);
assert.match(serverSource, /profile\?\.cohort === 'PRIMARY_EMA99_PANIC_RECLAIM'/);
assert.match(serverSource, /profile\?\.cohort === 'POST_PUMP_SQUEEZE_READY'/);
assert.ok(serverSource.includes('LIQ_FLOW_V2_EMA_FAN_BINANCE_MARGIN_USDT ?? 1'));
assert.ok(serverSource.includes('LIQ_FLOW_V2_EMA_FAN_IMPULSE_BINANCE_MARGIN_USDT ?? 5'));
assert.ok(serverSource.includes('LIQ_FLOW_V2_EMA_FAN_REGULAR_LIMIT_BUFFER_PCT ?? 1'));
assert.match(serverSource, /LIQ_FLOW_V2_EMA_FAN_REGULAR_ENTRY_TIMEOUT_MS \?\? 15 \* 60_000/);
assert.doesNotMatch(serverSource, /LIQ_FLOW_V2_HTF_BINANCE_LEVERAGE/);
assert.match(serverSource, /preBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE/);
assert.match(serverSource, /htfBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE/);
assert.match(serverSource, /emaFanBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE/);
assert.doesNotMatch(v2RealLabelsSource, /PUMP_DISTRIBUTION_WATCH/);
assert.doesNotMatch(v2RealLabelsSource, /PUMP_DISTRIBUTION_SHORT_READY/);
const v2RefreshTimerSource = serverSource.slice(
  serverSource.indexOf('const liquidFlowV2RefreshTimer'),
  serverSource.indexOf('async function refreshLiquidMarketDirectionHealth'),
);
assert.doesNotMatch(v2RefreshTimerSource, /if \(!liquidFlowV2SseClients\.size\) return;/);
assert.match(v2RefreshTimerSource, /refreshLiquidHeatmapFlowV2Symbol/);
assert.match(serverSource, /protectionSource==='coin-horizon-sweep-transition'/,
  'placeOrder must recheck Coin Horizon price, age, TP/SL and reward:risk with its fresh mark.');

console.log('auto Binance exclusive policy tests passed');
