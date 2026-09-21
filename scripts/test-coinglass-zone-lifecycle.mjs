import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoinGlassWebTop20Manager } from '../src/coinglassWebTop20.js';
import {
  COINGLASS_ZONE_LIFECYCLE_VERSION,
  advanceCoinglassZoneLifecycle,
  buildCoinglassZoneLifecycleDiscordPayload,
  coinglassActiveEdgeZones,
} from '../src/coinglassZoneLifecycle.js';
import {
  COINGLASS_ZONE_LIFECYCLE_BINANCE_VERSION,
  COINGLASS_ZONE_LIFECYCLE_HYPER_VOLATILE_CHANGE_24H_PCT,
  COINGLASS_ZONE_LIFECYCLE_LONG_BLOCKED_HOURS,
  COINGLASS_ZONE_LIFECYCLE_PARTIAL_TP_VERSION,
  COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BREAK_EVEN_TRIGGER_ROE,
  COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BREAK_EVEN_VERSION,
  COINGLASS_ZONE_LIFECYCLE_VIETNAM_TIME_ZONE,
  buildCoinglassZoneLifecycleBreakEvenStopParams,
  buildCoinglassZoneLifecyclePartialTpParams,
  evaluateCoinglassZoneLifecycleStrongShortBreakEven,
  evaluateCoinglassZoneLifecycleBinanceEntry,
  parseCoinglassZoneLifecycleBreakEvenExcludedSymbols,
  splitCoinglassZoneLifecyclePartialTpQuantity,
} from '../src/coinglassZoneLifecycleBinance.js';
import {
  COINGLASS_STRONG_WAVE_REVERSAL_MARGIN_USDT,
  COINGLASS_STRONG_WAVE_REVERSAL_VERSION,
  buildCoinglassStrongWaveReversalDiscordPayload,
  createCoinglassStrongWaveReversalWatch,
  evaluateCoinglassStrongWaveReversal,
} from '../src/coinglassStrongWaveReversal.js';
import {
  COINGLASS_ZONE_LIFECYCLE_TP_ONLY_VERSION,
  resolveNonLiquidFlowV2TakeProfit,
  shouldSuppressCoinglassZoneLifecycleStopLoss,
} from '../src/shortTakeProfitPolicy.js';

function zone({ price, low, high, strength, side, lastX = 10, persistenceBars = 8 }) {
  return {
    price,
    bandLow: low,
    bandHigh: high,
    strength,
    side,
    lastX,
    persistenceBars,
  };
}

function row({ price, open = price, high = price, low = price, close = price, zones, change24hPct = 0 }) {
  return {
    symbol: 'TESTUSDT',
    status: 'OK',
    stale: false,
    lastPrice: price,
    change24hPct,
    priceChangePercent24h: change24hPct,
    heatmap: {
      currentPrice: price,
      lastHeatmapX: 10,
      latestCandle: { open, high, low, close, openTime: 123 },
      edgeZones: zones,
    },
  };
}

const upper = zone({ price: 105, low: 104, high: 106, strength: 100, side: 'ABOVE' });
const upperNext = zone({ price: 113, low: 112, high: 114, strength: 70, side: 'ABOVE' });
const lower = zone({ price: 95, low: 94, high: 96, strength: 85, side: 'BELOW' });
const historical = zone({ price: 90, low: 89, high: 91, strength: 100, side: 'BELOW', lastX: 4 });
const vietnamBlockedTime = Date.parse('2026-09-03T22:30:00.000Z'); // 05:30 UTC+7
const vietnamAllowedTime = Date.parse('2026-09-03T23:00:00.000Z'); // 06:00 UTC+7

assert.equal(COINGLASS_ZONE_LIFECYCLE_VERSION,
  'COINGLASS_ZONE_LIFECYCLE_V16_LONG_00_06_VN_TIME_GATE_20260903');
assert.equal(COINGLASS_ZONE_LIFECYCLE_BINANCE_VERSION,
  'COINGLASS_ZONE_LIFECYCLE_BINANCE_V17_SECONDARY_SHORT_BREAKDOWN_ONLY_20260905');
assert.equal(COINGLASS_ZONE_LIFECYCLE_VIETNAM_TIME_ZONE, 'Asia/Ho_Chi_Minh');
assert.deepEqual(COINGLASS_ZONE_LIFECYCLE_LONG_BLOCKED_HOURS, [0, 1, 2, 3, 4, 5]);

const active = coinglassActiveEdgeZones(row({ price: 100, zones: [upper, lower, historical] }));
assert.deepEqual(active.map((item) => item.midpoint).sort((a, b) => a - b), [95, 105]);
assert.equal(active.some((item) => item.midpoint === 90), false, 'historical zone must not reach lifecycle');

const first = advanceCoinglassZoneLifecycle({
  rows: [row({ price: 100, zones: [upper, upperNext, lower] })],
  now: 1_000,
});
assert.equal(first.state.version, COINGLASS_ZONE_LIFECYCLE_VERSION);
assert.equal(first.state.tracks['TESTUSDT:ABOVE'].state, 'FRESH');
assert.equal(first.events.length, 0);

const supportReclaim = advanceCoinglassZoneLifecycle({
  previous: first.state,
  rows: [row({
    price: 98,
    open: 96,
    high: 98.5,
    low: 94,
    close: 98,
    zones: [upper, lower],
  })],
  now: 1_500,
});
const supportReclaimEvent = supportReclaim.events.find((event) => (
  event.zoneSide === 'BELOW' && event.state === 'REJECTED'
));
assert.ok(supportReclaimEvent);
assert.equal(supportReclaimEvent.shouldEnter, true);
assert.equal(supportReclaimEvent.entryPlan.side, 'LONG');
assert.equal(supportReclaimEvent.entryPlan.signalLabel, 'SUPPORT_RECLAIM_LONG_READY');
assert.equal(supportReclaimEvent.entryPlan.marginRule, 'SUPPORT_RECLAIM_LONG_READY_MARGIN');
assert.equal(supportReclaimEvent.entryPlan.marginUsdt, 3);
assert.equal(supportReclaimEvent.entryPlan.supportReclaim.bullishClose, true);
assert.ok(supportReclaimEvent.entryPlan.supportReclaim.lowerWickRangeRatio >= 0.2);
assert.ok(supportReclaimEvent.entryPlan.supportReclaim.closeLocationRatio >= 0.65);
const supportReclaimEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: supportReclaimEvent,
  currentPrice: 98.1,
  positions: [],
  openOrders: [],
  now: vietnamBlockedTime,
});
assert.equal(supportReclaimEntry.decision, 'ENTER_MARKET');
assert.equal(supportReclaimEntry.marginUsdt, 3);
assert.equal(supportReclaimEntry.marginRule, 'SUPPORT_RECLAIM_LONG_READY_MARGIN');
assert.equal(supportReclaimEntry.signalLabel, 'SUPPORT_RECLAIM_LONG_READY');
const supportPayload = buildCoinglassZoneLifecycleDiscordPayload({
  event: supportReclaimEvent,
  execution: { ...supportReclaimEntry, decision: 'SUBMITTED', orderId: 321 },
});
assert.match(supportPayload.embeds[0].title, /SUPPORT_RECLAIM_LONG_READY/);
assert.match(supportPayload.embeds[0].description, /\$3 x5/);
assert.match(supportPayload.embeds[0].fields.find((field) => field.name.includes('PHÂN LOẠI LONG')).value,
  /SWEPT → REJECTED/);
assert.match(supportPayload.embeds[0].fields.find((field) => field.name.includes('PHÂN LOẠI LONG')).value,
  /hồi quang phản chiếu/);

const weakBounce = advanceCoinglassZoneLifecycle({
  previous: first.state,
  rows: [row({
    price: 98,
    open: 98.2,
    high: 98.4,
    low: 95.5,
    close: 98,
    zones: [upper, lower],
  })],
  now: 1_600,
}).events.find((event) => event.zoneSide === 'BELOW' && event.state === 'REJECTED');
assert.ok(weakBounce);
assert.equal(weakBounce.entryPlan.signalLabel, 'UNCONFIRMED_BOUNCE_LONG');
assert.equal(weakBounce.entryPlan.unconfirmedBounceLong, true);
assert.equal(weakBounce.entryPlan.marginUsdt, 5);
assert.equal(weakBounce.entryPlan.marginRule, 'UNCONFIRMED_BOUNCE_LONG_MARGIN');
const weakBounceEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: weakBounce,
  currentPrice: 98.1,
  positions: [],
  openOrders: [],
  now: vietnamAllowedTime,
});
assert.equal(weakBounceEntry.decision, 'ENTER_MARKET');
assert.equal(weakBounceEntry.marginUsdt, 5);
assert.equal(weakBounceEntry.marginRule, 'UNCONFIRMED_BOUNCE_LONG_MARGIN');
assert.equal(weakBounceEntry.longRuleTextMatched, true);
assert.equal(evaluateCoinglassZoneLifecycleBinanceEntry({
  event: {
    ...weakBounce,
    entryPlan: { ...weakBounce.entryPlan, signalLabel: 'UNCONFIRMED_BOUNCE_LONG_TYPO' },
  },
  currentPrice: 98.1,
  positions: [],
  openOrders: [],
}).decision, 'BLOCKED_SIGNAL_RULE_TEXT_MISMATCH');
const weakBounceTimeBlocked = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: weakBounce,
  currentPrice: 98.1,
  positions: [],
  openOrders: [],
  now: vietnamBlockedTime,
});
assert.equal(weakBounceTimeBlocked.decision, 'BLOCKED_LONG_RULE_TIME_WINDOW_00_06_VN');
assert.equal(weakBounceTimeBlocked.entryVietnamHour, 5);
const weakBounceTimePayload = buildCoinglassZoneLifecycleDiscordPayload({
  event: weakBounce,
  execution: weakBounceTimeBlocked,
});
assert.match(weakBounceTimePayload.embeds[0].fields.find((field) => field.name.includes('BINANCE')).value,
  /00:00–05:59 giờ Việt Nam/);
const weakBouncePayload = buildCoinglassZoneLifecycleDiscordPayload({
  event: weakBounce,
  execution: { ...weakBounceEntry, decision: 'SUBMITTED', orderId: 654 },
});
assert.match(weakBouncePayload.embeds[0].title, /UNCONFIRMED_BOUNCE_LONG/);
assert.match(weakBouncePayload.embeds[0].description, /\$5 x5/);

const approaching = advanceCoinglassZoneLifecycle({
  previous: first.state,
  rows: [row({ price: 102, open: 101, high: 103, low: 100, close: 102, zones: [upper, upperNext, lower] })],
  now: 2_000,
});
assert.equal(approaching.state.tracks['TESTUSDT:ABOVE'].state, 'APPROACHING');
assert.equal(approaching.events.some((event) => event.state === 'APPROACHING'), true);
assert.equal(approaching.events.find((event) => event.state === 'APPROACHING').shouldEnter, false);

const rejected = advanceCoinglassZoneLifecycle({
  previous: approaching.state,
  rows: [row({ price: 103, open: 102, high: 105, low: 101, close: 103, zones: [upper, upperNext, lower] })],
  now: 3_000,
});
const rejectedEvent = rejected.events.find((event) => event.zoneSide === 'ABOVE' && event.state === 'REJECTED');
assert.ok(rejectedEvent);
assert.equal(rejectedEvent.shouldEnter, true);
assert.equal(rejectedEvent.entryPlan.side, 'SHORT');
assert.equal(rejectedEvent.entryPlan.takeProfitPrice, 97.85);
assert.equal(rejectedEvent.entryPlan.zoneTakeProfitPrice, 96);
assert.equal(rejectedEvent.entryPlan.stopLossPrice, null);
assert.equal(rejectedEvent.entryPlan.stopLossPolicy, 'COINGLASS_ZONE_LIFECYCLE_TP_ONLY_NO_SL');
assert.equal(rejectedEvent.entryPlan.marginUsdt, 2);
assert.equal(rejectedEvent.entryPlan.marginRule, 'BASE_MARGIN');
assert.equal(rejectedEvent.entryPlan.takeProfitMode, 'SHORT_PARTIAL_70_30');
assert.equal(rejectedEvent.entryPlan.takeProfitLegs.length, 2);
assert.equal(rejectedEvent.entryPlan.takeProfitLegs[0].price, 100.94);
assert.equal(rejectedEvent.entryPlan.takeProfitLegs[0].closeRatio, 0.7);
assert.equal(rejectedEvent.entryPlan.takeProfitLegs[0].distanceFraction, -0.02);
assert.equal(rejectedEvent.entryPlan.takeProfitLegs[1].price, 97.85);
assert.equal(rejectedEvent.entryPlan.takeProfitLegs[1].closeRatio, 0.3);
assert.equal(rejectedEvent.entryPlan.takeProfitLegs[1].distanceFraction, -0.05);
assert.equal(rejectedEvent.entryPlan.shortWaveClass, 'NORMAL');

const shortEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: rejectedEvent,
  currentPrice: 102.8,
  positions: [],
  openOrders: [],
});
assert.equal(shortEntry.version, COINGLASS_ZONE_LIFECYCLE_BINANCE_VERSION);
assert.equal(shortEntry.decision, 'ENTER_MARKET');
assert.equal(shortEntry.marginUsdt, 2);
assert.equal(shortEntry.marginRule, 'BASE_MARGIN');
assert.equal(shortEntry.stopLoss, null);
assert.equal(shortEntry.takeProfitMode, 'SHORT_PARTIAL_70_30');
assert.equal(shortEntry.takeProfitLegs.length, 2);
assert.equal(evaluateCoinglassZoneLifecycleBinanceEntry({
  event: rejectedEvent,
  currentPrice: 104.2,
  positions: [],
}).decision, 'BLOCKED_STATE_NO_LONGER_VALID');
assert.equal(evaluateCoinglassZoneLifecycleBinanceEntry({
  event: rejectedEvent,
  currentPrice: 102.8,
  positions: [{ symbol: 'TESTUSDT', positionAmt: '1' }],
}).decision, 'BLOCKED_EXISTING_POSITION');

const strongWaveRejected = advanceCoinglassZoneLifecycle({
  previous: approaching.state,
  rows: [row({
    price: 103,
    open: 102,
    high: 105,
    low: 101,
    close: 103,
    zones: [upper, upperNext, lower],
    change24hPct: 15,
  })],
  now: 3_100,
}).events.find((event) => event.zoneSide === 'ABOVE' && event.state === 'REJECTED');
assert.ok(strongWaveRejected);
assert.equal(strongWaveRejected.entryPlan.takeProfitMode, 'SHORT_SCALP_FULL_5ROE_STRONG_WAVE');
assert.equal(strongWaveRejected.entryPlan.takeProfitPrice, 101.97);
assert.equal(strongWaveRejected.entryPlan.takeProfitLegs.length, 1);
assert.equal(strongWaveRejected.entryPlan.takeProfitLegs[0].price, 101.97);
assert.equal(strongWaveRejected.entryPlan.takeProfitLegs[0].closeRatio, 1);
assert.equal(strongWaveRejected.entryPlan.takeProfitLegs[0].distanceFraction, -0.01);
assert.equal(strongWaveRejected.entryPlan.takeProfitRoePct, 5);
assert.equal(strongWaveRejected.entryPlan.shortWaveClass, 'STRONG_UP_WAVE');
assert.equal(strongWaveRejected.entryPlan.change24hPct, 15);
assert.equal(strongWaveRejected.entryPlan.marginUsdt, 2);
assert.equal(strongWaveRejected.entryPlan.marginRule, 'STRONG_UP_WAVE_SHORT_MARGIN');
const strongShortEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: strongWaveRejected,
  currentPrice: 102.8,
  positions: [],
  openOrders: [],
  marginUsdt: 5,
});
assert.equal(strongShortEntry.decision, 'ENTER_MARKET');
assert.equal(strongShortEntry.marginUsdt, 2);
assert.equal(strongShortEntry.marginRule, 'STRONG_UP_WAVE_SHORT_MARGIN');

const accepted = advanceCoinglassZoneLifecycle({
  previous: approaching.state,
  rows: [row({ price: 107, open: 103, high: 108, low: 102, close: 107, zones: [upper, upperNext, lower] })],
  now: 4_000,
});
const acceptedEvent = accepted.events.find((event) => event.zoneSide === 'ABOVE' && event.state === 'ACCEPTED');
assert.ok(acceptedEvent, 'crossed ABOVE zone must remain on original track and become ACCEPTED');
assert.equal(acceptedEvent.shouldEnter, true);
assert.equal(acceptedEvent.entryPlan.side, 'LONG');
assert.equal(acceptedEvent.entryPlan.takeProfitPrice, 112);
assert.equal(acceptedEvent.entryPlan.zoneTakeProfitPrice, 112);
assert.equal(acceptedEvent.entryPlan.zoneTargetDistancePct, 4.673);
assert.equal(acceptedEvent.entryPlan.takeProfitMode, 'LONG_PARTIAL_70_30');
assert.equal(acceptedEvent.entryPlan.takeProfitLegs.length, 2);
assert.equal(acceptedEvent.entryPlan.takeProfitLegs[0].key, 'TP1');
assert.equal(acceptedEvent.entryPlan.takeProfitLegs[0].price, 109.14);
assert.equal(acceptedEvent.entryPlan.takeProfitLegs[0].closeRatio, 0.7);
assert.equal(acceptedEvent.entryPlan.takeProfitLegs[1].key, 'TP2');
assert.equal(acceptedEvent.entryPlan.takeProfitLegs[1].price, 112);
assert.equal(acceptedEvent.entryPlan.takeProfitLegs[1].closeRatio, 0.3);
assert.equal(acceptedEvent.entryPlan.marginUsdt, 10);
assert.equal(acceptedEvent.entryPlan.marginRule, 'ACCEPTED_BREAKOUT_MARGIN');
assert.equal(acceptedEvent.entryPlan.signalLabel, 'BREAKOUT_ACCEPTED_LONG_READY');
assert.equal(acceptedEvent.entryPlan.stopLossPrice, null);
assert.equal(acceptedEvent.entryPlan.stopLossRoePct, null);
assert.equal(acceptedEvent.entryPlan.stopLossPolicy, 'COINGLASS_ZONE_LIFECYCLE_TP_ONLY_NO_SL');
const acceptedEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: acceptedEvent,
  currentPrice: 107.2,
  positions: [],
  openOrders: [],
  now: vietnamAllowedTime,
});
assert.equal(acceptedEntry.decision, 'ENTER_MARKET');
assert.equal(acceptedEntry.stopLoss, null);
assert.equal(acceptedEntry.stopLossRoePct, null);
assert.equal(acceptedEntry.marginUsdt, 10);
assert.equal(acceptedEntry.marginRule, 'ACCEPTED_BREAKOUT_MARGIN');
assert.equal(acceptedEntry.longRuleTextMatched, true);
assert.equal(evaluateCoinglassZoneLifecycleBinanceEntry({
  event: {
    ...acceptedEvent,
    entryPlan: { ...acceptedEvent.entryPlan, signalLabel: 'BREAKOUT_ACCEPTED_LONG' },
  },
  currentPrice: 107.2,
  positions: [],
  openOrders: [],
}).decision, 'BLOCKED_SIGNAL_RULE_TEXT_MISMATCH');
assert.equal(evaluateCoinglassZoneLifecycleBinanceEntry({
  event: acceptedEvent,
  currentPrice: 107.2,
  positions: [],
  openOrders: [],
  now: vietnamBlockedTime,
}).decision, 'BLOCKED_LONG_RULE_TIME_WINDOW_00_06_VN');
assert.equal(acceptedEntry.takeProfitMode, 'LONG_PARTIAL_70_30');
assert.equal(acceptedEntry.takeProfitLegs.length, 2);

const upperNear = zone({ price: 111, low: 110, high: 112, strength: 70, side: 'ABOVE' });
const acceptedNear = advanceCoinglassZoneLifecycle({
  previous: approaching.state,
  rows: [row({ price: 107, open: 103, high: 108, low: 102, close: 107, zones: [upper, upperNear, lower] })],
  now: 4_100,
}).events.find((event) => event.zoneSide === 'ABOVE' && event.state === 'ACCEPTED');
assert.ok(acceptedNear);
assert.equal(acceptedNear.entryPlan.zoneTargetDistancePct, 2.804);
assert.equal(acceptedNear.entryPlan.takeProfitMode, 'SINGLE_FULL');
assert.equal(acceptedNear.entryPlan.takeProfitLegs.length, 1);
assert.equal(acceptedNear.entryPlan.takeProfitLegs[0].closeRatio, 1);

assert.equal(evaluateCoinglassZoneLifecycleBinanceEntry({
  event: {
    ...acceptedEvent,
    timeframeAgreement: ['12h'],
    entryPlan: { ...acceptedEvent.entryPlan, zoneTargetDistancePct: 5 },
  },
  currentPrice: 107.2,
  positions: [],
  openOrders: [],
  now: vietnamAllowedTime,
}).marginUsdt, 10, 'ACCEPTED breakout uses the fixed $10 margin');
assert.equal(evaluateCoinglassZoneLifecycleBinanceEntry({
  event: {
    ...acceptedEvent,
    timeframeAgreement: [],
    entryPlan: { ...acceptedEvent.entryPlan, zoneTargetDistancePct: 5.001 },
  },
  currentPrice: 107.2,
  positions: [],
  openOrders: [],
  now: vietnamAllowedTime,
}).marginUsdt, 10, 'ACCEPTED breakout stays $10 without 12h/24h agreement');
const highQualityLargeLong = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: {
    ...acceptedEvent,
    timeframeAgreement: ['12h'],
    entryPlan: { ...acceptedEvent.entryPlan, zoneTargetDistancePct: 5.001 },
  },
  currentPrice: 107.2,
  positions: [],
  openOrders: [],
  now: vietnamAllowedTime,
});
assert.equal(highQualityLargeLong.marginUsdt, 10, 'qualified ABOVE→ACCEPTED LONG >5% with HTF agreement uses $10');
assert.equal(highQualityLargeLong.marginRule, 'ACCEPTED_BREAKOUT_MARGIN');

const secondaryProfile = {
  leverage: 5,
  marginUsdt: 2.5,
  acceptedBreakoutMarginUsdt: 10,
  unconfirmedBounceLongMarginUsdt: 5,
  fixedTakeProfitRoePct: 6,
  supportReclaimMarginUsdt: 2.5,
  strongShortMarginUsdt: 2.5,
  largeTargetMarginUsdt: 2.5,
};
const secondaryWeakBounce = advanceCoinglassZoneLifecycle({
  previous: first.state,
  rows: [row({
    price: 98,
    open: 98.2,
    high: 98.4,
    low: 95.5,
    close: 98,
    zones: [upper, lower],
  })],
  now: 4_150,
  config: secondaryProfile,
}).events.find((event) => event.zoneSide === 'BELOW' && event.state === 'REJECTED');
assert.ok(secondaryWeakBounce);
assert.equal(secondaryWeakBounce.entryPlan.signalLabel, 'UNCONFIRMED_BOUNCE_LONG');
assert.equal(secondaryWeakBounce.entryPlan.marginUsdt, 5);
assert.equal(secondaryWeakBounce.entryPlan.marginRule, 'UNCONFIRMED_BOUNCE_LONG_MARGIN');
assert.equal(secondaryWeakBounce.entryPlan.takeProfitMode, 'FIXED_FULL_6ROE');
assert.equal(secondaryWeakBounce.entryPlan.takeProfitRoePct, 6);
assert.equal(secondaryWeakBounce.entryPlan.takeProfitPrice, 99.176);
const secondaryWeakBounceEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: secondaryWeakBounce,
  currentPrice: 98.1,
  positions: [],
  openOrders: [],
  marginUsdt: 2.5,
  unconfirmedBounceLongMarginUsdt: 5,
  now: vietnamAllowedTime,
});
assert.equal(secondaryWeakBounceEntry.decision, 'ENTER_MARKET');
assert.equal(secondaryWeakBounceEntry.marginUsdt, 5);
assert.equal(secondaryWeakBounceEntry.marginRule, 'UNCONFIRMED_BOUNCE_LONG_MARGIN');
const secondaryAcceptedLong = advanceCoinglassZoneLifecycle({
  previous: approaching.state,
  rows: [row({ price: 107, open: 103, high: 108, low: 102, close: 107, zones: [upper, upperNext, lower] })],
  now: 4_200,
  config: secondaryProfile,
}).events.find((event) => event.zoneSide === 'ABOVE' && event.state === 'ACCEPTED');
assert.ok(secondaryAcceptedLong);
assert.equal(secondaryAcceptedLong.entryPlan.side, 'LONG');
assert.equal(secondaryAcceptedLong.entryPlan.signalLabel, 'BREAKOUT_ACCEPTED_LONG_READY');
assert.equal(secondaryAcceptedLong.entryPlan.acceptedBreakout, true);
assert.equal(secondaryAcceptedLong.entryPlan.marginUsdt, 10);
assert.equal(secondaryAcceptedLong.entryPlan.marginRule, 'ACCEPTED_BREAKOUT_MARGIN');
assert.equal(secondaryAcceptedLong.entryPlan.takeProfitMode, 'FIXED_FULL_6ROE');
assert.equal(secondaryAcceptedLong.entryPlan.takeProfitRoePct, 6);
assert.equal(secondaryAcceptedLong.entryPlan.takeProfitPrice, 108.284);
assert.equal(secondaryAcceptedLong.entryPlan.takeProfitLegs.length, 1);
assert.equal(secondaryAcceptedLong.entryPlan.takeProfitLegs[0].closeRatio, 1);
const secondaryAcceptedLongEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: secondaryAcceptedLong,
  currentPrice: 107.1,
  positions: [],
  openOrders: [],
  marginUsdt: 2.5,
  acceptedBreakoutMarginUsdt: 10,
  now: vietnamAllowedTime,
});
assert.equal(secondaryAcceptedLongEntry.decision, 'ENTER_MARKET');
assert.equal(secondaryAcceptedLongEntry.marginUsdt, 10);
assert.equal(secondaryAcceptedLongEntry.marginRule, 'ACCEPTED_BREAKOUT_MARGIN');

const secondaryRejectedShort = advanceCoinglassZoneLifecycle({
  previous: approaching.state,
  rows: [row({ price: 103, open: 102, high: 105, low: 101, close: 103, zones: [upper, upperNext, lower] })],
  now: 4_300,
  config: secondaryProfile,
}).events.find((event) => event.zoneSide === 'ABOVE' && event.state === 'REJECTED');
assert.ok(secondaryRejectedShort);
assert.equal(secondaryRejectedShort.entryPlan.side, 'SHORT');
assert.equal(secondaryRejectedShort.entryPlan.marginUsdt, 2.5);
assert.equal(secondaryRejectedShort.entryPlan.marginRule, 'BASE_MARGIN');
assert.equal(secondaryRejectedShort.entryPlan.takeProfitMode, 'FIXED_FULL_6ROE');
assert.equal(secondaryRejectedShort.entryPlan.takeProfitRoePct, 6);
assert.equal(secondaryRejectedShort.entryPlan.takeProfitPrice, 101.764);
const secondaryRejectedShortEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: secondaryRejectedShort,
  streamId: 'secondary',
  currentPrice: 102.9,
  positions: [],
  openOrders: [],
  marginUsdt: 2.5,
  acceptedBreakoutMarginUsdt: 10,
});
assert.equal(secondaryRejectedShortEntry.decision,
  'BLOCKED_SECONDARY_SHORT_REQUIRES_BREAKDOWN_ACCEPTED_SHORT_READY');
assert.equal(secondaryRejectedShortEntry.allowed, false);
assert.equal(secondaryRejectedShortEntry.secondaryShortRuleTextRequired, true);
assert.equal(secondaryRejectedShortEntry.secondaryShortRuleTextMatched, false);
assert.equal(secondaryRejectedShortEntry.marginUsdt, 2.5);
const primaryRejectedShortEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: secondaryRejectedShort,
  streamId: 'primary',
  currentPrice: 102.9,
  positions: [],
  openOrders: [],
  marginUsdt: 2,
});
assert.equal(primaryRejectedShortEntry.decision, 'ENTER_MARKET',
  'primary REJECTED SHORT policy must remain unchanged');

const lowerNext = zone({ price: 89, low: 88, high: 90, strength: 70, side: 'BELOW' });
const secondaryBelowBase = advanceCoinglassZoneLifecycle({
  rows: [row({ price: 100, zones: [upper, lower, lowerNext] })],
  now: 4_400,
  config: secondaryProfile,
});
const secondaryBelowApproaching = advanceCoinglassZoneLifecycle({
  previous: secondaryBelowBase.state,
  rows: [row({ price: 98, open: 98, high: 99, low: 97, close: 98, zones: [upper, lower, lowerNext] })],
  now: 4_500,
  config: secondaryProfile,
});
assert.equal(secondaryBelowApproaching.state.tracks['TESTUSDT:BELOW'].state, 'APPROACHING');
const secondaryAcceptedShort = advanceCoinglassZoneLifecycle({
  previous: secondaryBelowApproaching.state,
  rows: [row({ price: 93, open: 97, high: 98, low: 92, close: 93, zones: [upper, lower, lowerNext] })],
  now: 4_600,
  config: secondaryProfile,
}).events.find((event) => event.zoneSide === 'BELOW' && event.state === 'ACCEPTED');
assert.ok(secondaryAcceptedShort);
assert.equal(secondaryAcceptedShort.shouldEnter, true);
assert.equal(secondaryAcceptedShort.entryPlan.side, 'SHORT');
assert.equal(secondaryAcceptedShort.entryPlan.signalLabel, 'BREAKDOWN_ACCEPTED_SHORT_READY');
assert.equal(secondaryAcceptedShort.entryPlan.acceptedBreakout, true);
assert.equal(secondaryAcceptedShort.entryPlan.marginUsdt, 10);
assert.equal(secondaryAcceptedShort.entryPlan.marginRule, 'ACCEPTED_BREAKOUT_MARGIN');
assert.equal(secondaryAcceptedShort.entryPlan.takeProfitMode, 'FIXED_FULL_6ROE');
assert.equal(secondaryAcceptedShort.entryPlan.takeProfitRoePct, 6);
assert.equal(secondaryAcceptedShort.entryPlan.takeProfitPrice, 91.884);
const secondaryAcceptedShortEntry = evaluateCoinglassZoneLifecycleBinanceEntry({
  event: secondaryAcceptedShort,
  streamId: 'secondary',
  currentPrice: 92.9,
  positions: [],
  openOrders: [],
  marginUsdt: 2.5,
  acceptedBreakoutMarginUsdt: 10,
  now: vietnamBlockedTime,
});
assert.equal(secondaryAcceptedShortEntry.decision, 'ENTER_MARKET');
assert.equal(secondaryAcceptedShortEntry.marginUsdt, 10);
assert.equal(secondaryAcceptedShortEntry.marginRule, 'ACCEPTED_BREAKOUT_MARGIN');
assert.equal(secondaryAcceptedShortEntry.longRuleTextMatched, true,
  'explicit symmetric ACCEPTED SHORT remains structurally authorized');
assert.equal(secondaryAcceptedShortEntry.shortRuleTextMatched, true);
assert.equal(secondaryAcceptedShortEntry.secondaryShortRuleTextRequired, true);
assert.equal(secondaryAcceptedShortEntry.secondaryShortRuleTextMatched, true);
assert.equal(evaluateCoinglassZoneLifecycleBinanceEntry({
  event: {
    ...secondaryAcceptedShort,
    entryPlan: { ...secondaryAcceptedShort.entryPlan, signalLabel: null },
  },
  streamId: 'secondary',
  currentPrice: 92.9,
  positions: [],
  openOrders: [],
  marginUsdt: 2.5,
  acceptedBreakoutMarginUsdt: 10,
}).decision, 'BLOCKED_SECONDARY_SHORT_REQUIRES_BREAKDOWN_ACCEPTED_SHORT_READY');
const secondaryPayload = buildCoinglassZoneLifecycleDiscordPayload({ event: secondaryAcceptedShort });
assert.match(secondaryPayload.embeds[0].description, /\$10 x5/);
assert.match(secondaryPayload.embeds[0].title, /BREAKDOWN_ACCEPTED_SHORT_READY/);
assert.match(secondaryPayload.embeds[0].fields.find((field) => field.name.includes('PHÂN LOẠI SHORT')).value,
  /BREAKDOWN_ACCEPTED_SHORT_READY/);
assert.match(secondaryPayload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value,
  /\+6% ROE, đóng 100%/);

const payload = buildCoinglassZoneLifecycleDiscordPayload({
  event: rejectedEvent,
  execution: { decision: 'SUBMITTED', orderId: 123 },
  pageUrl: 'http://localhost/coinglass-web-top20',
});
assert.equal(payload.embeds[0].color, 0xef4444);
assert.match(payload.embeds[0].title, /SHORT.*REJECTED/);
assert.match(payload.embeds[0].description, /\$2 x5/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /KHÔNG ĐẶT/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /TP1.*đóng 70%/s);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /TP2.*đóng 30%/s);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('BINANCE')).value, /SUBMITTED/);

const strongShortPayload = buildCoinglassZoneLifecycleDiscordPayload({ event: strongWaveRejected });
assert.match(strongShortPayload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /\+5% ROE, đóng 100%/);
assert.match(strongShortPayload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /LONG WATCH/);
assert.match(strongShortPayload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /quét EMA13\/25/);

const reversalWatch = createCoinglassStrongWaveReversalWatch({
  event: strongWaveRejected,
  execution: { decision: 'SUBMITTED', orderId: 999, binanceEntryPrice: 103, filledAt: 1_000 },
  now: 1_000,
});
assert.ok(reversalWatch);
assert.equal(reversalWatch.status, 'ARMED_SHORT_EXIT');
assert.equal(reversalWatch.rejectedZone.bandLow, 104);
const start5m = 200_000_000;
const trend5m = Array.from({ length: 139 }, (_, index) => {
  const close = 100 + index * 0.06;
  return {
    openTime: start5m + index * 300_000,
    closeTime: start5m + (index + 1) * 300_000 - 1,
    open: close - 0.03,
    high: close + 0.08,
    low: close - 0.08,
    close,
    quoteVolume: 1000,
    takerBuyQuoteVolume: 540,
  };
});
trend5m.push({
  openTime: start5m + 139 * 300_000,
  closeTime: start5m + 140 * 300_000 - 1,
  open: 108.2,
  high: 109.2,
  low: 107.5,
  close: 109,
  quoteVolume: 1000,
  takerBuyQuoteVolume: 580,
});
const trend15m = Array.from({ length: 140 }, (_, index) => {
  const close = 100 + index * 0.1;
  return {
    openTime: start5m - 140 * 900_000 + index * 900_000,
    closeTime: start5m - 140 * 900_000 + (index + 1) * 900_000 - 1,
    open: close - 0.05,
    high: close + 0.1,
    low: close - 0.1,
    close,
    quoteVolume: 1000,
    takerBuyQuoteVolume: 540,
  };
});
const readyReversal = evaluateCoinglassStrongWaveReversal({
  watch: {
    ...reversalWatch,
    status: 'WAIT_RECLAIM',
    shortClosedAt: start5m + 138 * 300_000,
    expiresAt: start5m + 200 * 300_000,
    rejectedZone: { bandLow: 112, bandHigh: 113 },
  },
  klines5m: trend5m,
  klines15m: trend15m,
  currentPrice: 109,
  now: start5m + 141 * 300_000,
});
assert.equal(readyReversal.version, COINGLASS_STRONG_WAVE_REVERSAL_VERSION);
assert.equal(readyReversal.decision, 'ENTER_LONG_MARKET');
assert.equal(readyReversal.marginUsdt, COINGLASS_STRONG_WAVE_REVERSAL_MARGIN_USDT);
assert.equal(readyReversal.stopLossPrice, null);
assert.equal(readyReversal.takeProfitPrice, 112);
const reversalPayload = buildCoinglassStrongWaveReversalDiscordPayload({
  decision: readyReversal,
  execution: { decision: 'SUBMITTED', orderId: 1000 },
});
assert.match(reversalPayload.embeds[0].title, /ZONE REVERSAL LONG/);
assert.match(reversalPayload.embeds[0].description, /\$1 x5/);

const longPayload = buildCoinglassZoneLifecycleDiscordPayload({ event: acceptedEvent });
assert.match(longPayload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /Zone Lifecycle chạy TP-only/);
assert.match(longPayload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /TP1.*đóng 70%/s);
assert.match(longPayload.embeds[0].fields.find((field) => field.name.includes('ENTRY')).value, /TP2.*đóng 30%/s);
assert.equal(shouldSuppressCoinglassZoneLifecycleStopLoss({
  source: 'coinglass-zone-lifecycle',
}), true, COINGLASS_ZONE_LIFECYCLE_TP_ONLY_VERSION);
assert.equal(shouldSuppressCoinglassZoneLifecycleStopLoss({
  source: 'coinglass-web-qualified',
}), false, 'other CoinGlass routes must keep their own SL policy');

const preservedTarget = resolveNonLiquidFlowV2TakeProfit({
  side: 'SHORT',
  source: 'coinglass-zone-lifecycle',
  entryPrice: 100,
  leverage: 5,
  requestedTakeProfitPrice: 96,
});
assert.equal(preservedTarget.applied, false);
assert.equal(preservedTarget.takeProfitPrice, 96);

const splitQuantity = splitCoinglassZoneLifecyclePartialTpQuantity({
  totalQuantity: 0.01,
  stepSize: 0.001,
  legs: acceptedEvent.entryPlan.takeProfitLegs,
});
assert.deepEqual(splitQuantity.map((leg) => leg.quantity), [0.007, 0.003]);
assert.deepEqual(splitCoinglassZoneLifecyclePartialTpQuantity({
  totalQuantity: 0.001,
  stepSize: 0.001,
  legs: acceptedEvent.entryPlan.takeProfitLegs,
}), [], 'quantity too small to split must fall back to full TP1');
const oneWayParams = buildCoinglassZoneLifecyclePartialTpParams({
  symbol: 'testusdt',
  closeSide: 'SELL',
  triggerPrice: 102,
  quantity: 0.007,
  clientAlgoId: 'zlc_tp1_test',
});
assert.equal(oneWayParams.type, 'TAKE_PROFIT_MARKET');
assert.equal(oneWayParams.reduceOnly, 'true');
assert.equal(oneWayParams.quantity, '0.007');
assert.equal('closePosition' in oneWayParams, false);
const hedgeParams = buildCoinglassZoneLifecyclePartialTpParams({
  symbol: 'TESTUSDT',
  closeSide: 'SELL',
  positionSide: 'LONG',
  triggerPrice: 105,
  quantity: 0.003,
  clientAlgoId: 'zlc_tp2_test',
});
assert.equal(hedgeParams.positionSide, 'LONG');
assert.equal('reduceOnly' in hedgeParams, false, COINGLASS_ZONE_LIFECYCLE_PARTIAL_TP_VERSION);
const shortParams = buildCoinglassZoneLifecyclePartialTpParams({
  symbol: 'TESTUSDT',
  closeSide: 'BUY',
  triggerPrice: 99,
  quantity: 0.008,
  clientAlgoId: 'zlc_short_tp1_test',
});
assert.equal(shortParams.side, 'BUY');
assert.equal(shortParams.reduceOnly, 'true');
assert.equal(COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BREAK_EVEN_TRIGGER_ROE, 5);
assert.equal(COINGLASS_ZONE_LIFECYCLE_HYPER_VOLATILE_CHANGE_24H_PCT, 25);
const beBase = {
  symbol: 'TESTUSDT',
  source: 'coinglass-zone-lifecycle',
  side: 'SHORT',
  lifecycleVersion: 'COINGLASS_ZONE_LIFECYCLE_V7_SHORT_ADAPTIVE_PARTIAL_TP_20260830',
  takeProfitMode: 'SHORT_PARTIAL_80_20_STRONG_WAVE',
  shortWaveClass: 'STRONG_UP_WAVE',
  change24hPct: 15,
  currentRoe: 5,
  entryPrice: 100,
  markPrice: 99,
  tp1Filled: true,
  excludedSymbols: parseCoinglassZoneLifecycleBreakEvenExcludedSymbols('ZKPUSDT,4USDT'),
};
const beEligible = evaluateCoinglassZoneLifecycleStrongShortBreakEven(beBase);
assert.equal(beEligible.version, COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BREAK_EVEN_VERSION);
assert.equal(beEligible.eligible, true);
assert.equal(beEligible.stopPrice, 100);
assert.equal(evaluateCoinglassZoneLifecycleStrongShortBreakEven({
  ...beBase,
  lifecycleVersion: COINGLASS_ZONE_LIFECYCLE_VERSION,
}).reason, 'NOT_FUTURE_V7_ENTRY');
assert.equal(evaluateCoinglassZoneLifecycleStrongShortBreakEven({
  ...beBase,
  symbol: 'ZKPUSDT',
}).reason, 'EXPLICIT_HYPER_VOLATILE_EXCLUSION');
assert.equal(evaluateCoinglassZoneLifecycleStrongShortBreakEven({
  ...beBase,
  change24hPct: 25,
}).reason, 'HYPER_VOLATILE_CHANGE_24H');
assert.equal(evaluateCoinglassZoneLifecycleStrongShortBreakEven({
  ...beBase,
  tp1Filled: false,
}).reason, 'TP1_NOT_FILLED');
assert.equal(evaluateCoinglassZoneLifecycleStrongShortBreakEven({
  ...beBase,
  currentRoe: 4.99,
}).reason, 'ROE_BELOW_TRIGGER');
assert.equal(evaluateCoinglassZoneLifecycleStrongShortBreakEven({
  ...beBase,
  markPrice: 100.1,
}).reason, 'INVALID_OR_REVERSED_PRICE');
const breakEvenParams = buildCoinglassZoneLifecycleBreakEvenStopParams({
  symbol: 'testusdt',
  triggerPrice: 100,
  quantity: 0.002,
  clientAlgoId: 'zlc_be_test',
});
assert.equal(breakEvenParams.symbol, 'TESTUSDT');
assert.equal(breakEvenParams.side, 'BUY');
assert.equal(breakEvenParams.type, 'STOP_MARKET');
assert.equal(breakEvenParams.reduceOnly, 'true');
assert.equal('closePosition' in breakEvenParams, false);
const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /!\['BUY', 'SELL'\]\.includes\(entrySide\)/);
assert.match(serverSource, /const closeSide = isLong \? 'SELL' : 'BUY'/);
assert.match(serverSource, /No active \$\{isLong \? 'LONG' : 'SHORT'\} position for partial TP/);
assert.match(serverSource, /coinglassZoneLifecycleVersion: event\.version/);
assert.match(serverSource, /handleCoinglassStrongShortBreakEven/);
assert.match(serverSource, /TP1 filled, ROE=/);
assert.match(serverSource, /giữ runner, không MARKET-close/);
assert.equal(
  [...serverSource.matchAll(/onZoneLifecycleReversalWatch: executeCoinGlassStrongWaveReversalWatch/g)].length,
  2,
  'primary 1-40 and secondary 41-80 must share the same reversal executor',
);

const managerDir = await mkdtemp(join(tmpdir(), 'coinglass-zone-lifecycle-'));
let executionCalls = 0;
let reversalCalls = 0;
const manager = new CoinGlassWebTop20Manager({
  rootDir: new URL('..', import.meta.url).pathname,
  dataDir: managerDir,
  onZoneLifecycleSignal: async () => {
    executionCalls += 1;
    return { decision: 'SUBMITTED', orderId: 456 };
  },
  onZoneLifecycleReversalWatch: async (watch) => {
    reversalCalls += 1;
    if (watch.status === 'ARMED_SHORT_EXIT') {
      return {
        decision: 'ARMED_LONG_RECLAIM_AFTER_SHORT_CLOSED',
        watchPatch: { status: 'WAIT_RECLAIM', shortClosedAt: Date.now() },
      };
    }
    return {
      decision: 'SUBMITTED',
      orderId: 789,
      reversalDecision: {
        symbol: watch.symbol,
        currentPrice: 100,
        takeProfitPrice: 102,
        targetDistancePct: 2,
        marginUsdt: 1,
        leverage: 5,
        evidence: {},
      },
    };
  },
});
const originalWebhook = process.env.COINGLASS_ZONE_LIFECYCLE_DISCORD_WEBHOOK_URL;
const originalBinance = process.env.COINGLASS_ZONE_LIFECYCLE_BINANCE_ENABLED;
process.env.COINGLASS_ZONE_LIFECYCLE_DISCORD_WEBHOOK_URL = 'https://unit.test/zone-lifecycle';
process.env.COINGLASS_ZONE_LIFECYCLE_BINANCE_ENABLED = 'true';
const sent = [];
manager.postZoneLifecycleDiscord = async (message) => {
  sent.push(message);
  return { sent: true };
};
assert.equal((await manager.processZoneLifecycleRows([
  row({ price: 100, zones: [upper, upperNext, lower] }),
])).events, 0);
assert.equal((await manager.processZoneLifecycleRows([
  row({ price: 102, open: 101, high: 103, low: 100, close: 102, zones: [upper, upperNext, lower] }),
])).sent, 1);
const terminalResult = await manager.processZoneLifecycleRows([
  row({ price: 103, open: 102, high: 105, low: 101, close: 103, zones: [upper, upperNext, lower], change24hPct: 15 }),
]);
assert.equal(terminalResult.submitted, 1);
assert.equal(executionCalls, 1);
assert.equal(sent.length, 2);
assert.equal((await manager.processZoneLifecycleRows([
  row({ price: 103, open: 102, high: 105, low: 101, close: 103, zones: [upper, upperNext, lower], change24hPct: 15 }),
])).submitted, 0);
assert.equal((await manager.processZoneLifecycleRows([
  row({ price: 103, open: 102, high: 105, low: 101, close: 103, zones: [upper, upperNext, lower], change24hPct: 15 }),
])).submitted, 1);
assert.equal(reversalCalls, 2);
assert.equal(sent.length, 3);
assert.equal(manager.config().zoneLifecycleMarginUsdt, 2);
assert.equal(manager.config().zoneLifecycleAcceptedBreakoutMarginUsdt, 10);
assert.equal(manager.config().zoneLifecycleUnconfirmedBounceLongMarginUsdt, 5);
assert.equal(manager.config().zoneLifecycleFixedTakeProfitRoePct, 0);
assert.equal(manager.config().zoneLifecycleStrongShortMarginUsdt, 2);
assert.equal(manager.config().zoneLifecycleLargeTargetThresholdPct, 5);
assert.equal(manager.config().zoneLifecycleLargeTargetMarginUsdt, 2);
assert.equal(manager.config().zoneLifecycleLongSingleTargetMaxPct, 3);
assert.equal(manager.config().zoneLifecycleLongTp1DistancePct, 2);
assert.equal(manager.config().zoneLifecycleLongTp1CloseRatio, 0.7);
assert.equal(manager.config().zoneLifecycleLongTp2CapPct, 5);
assert.equal(manager.config().zoneLifecycleShortSingleTargetMaxPct, 3);
assert.equal(manager.config().zoneLifecycleShortTp1DistancePct, 2);
assert.equal(manager.config().zoneLifecycleShortTp1CloseRatio, 0.7);
assert.equal(manager.config().zoneLifecycleShortTp2CapPct, 5);
assert.equal(manager.config().zoneLifecycleShortStrongWaveChange24hPct, 10);
assert.equal(manager.config().zoneLifecycleShortStrongTakeProfitRoePct, 5);
assert.equal(manager.config().zoneLifecycleShortStrongTp1DistancePct, 1);
assert.equal(manager.config().zoneLifecycleShortStrongTp1CloseRatio, 0.8);
assert.equal(manager.config().zoneLifecycleShortStrongTp2CapPct, 3);
assert.equal(manager.config().zoneLifecycleReversalMarginUsdt, 1);
const secondaryManager = new CoinGlassWebTop20Manager({
  rootDir: new URL('..', import.meta.url).pathname,
  dataDir: join(managerDir, 'secondary'),
  streamId: 'secondary',
});
assert.equal(secondaryManager.config().zoneLifecycleMarginUsdt, 2.5);
assert.equal(secondaryManager.config().zoneLifecycleAcceptedBreakoutMarginUsdt, 10);
assert.equal(secondaryManager.config().zoneLifecycleUnconfirmedBounceLongMarginUsdt, 5);
assert.equal(secondaryManager.config().zoneLifecycleFixedTakeProfitRoePct, 6);
assert.equal(secondaryManager.config().zoneLifecycleSupportReclaimMarginUsdt, 2.5);
assert.equal(secondaryManager.config().zoneLifecycleStrongShortMarginUsdt, 2.5);
assert.equal(secondaryManager.config().zoneLifecycleLargeTargetMarginUsdt, 2.5);
if (originalWebhook == null) delete process.env.COINGLASS_ZONE_LIFECYCLE_DISCORD_WEBHOOK_URL;
else process.env.COINGLASS_ZONE_LIFECYCLE_DISCORD_WEBHOOK_URL = originalWebhook;
if (originalBinance == null) delete process.env.COINGLASS_ZONE_LIFECYCLE_BINANCE_ENABLED;
else process.env.COINGLASS_ZONE_LIFECYCLE_BINANCE_ENABLED = originalBinance;
await rm(managerDir, { recursive: true, force: true });

console.log('CoinGlass zone lifecycle tests passed.');
