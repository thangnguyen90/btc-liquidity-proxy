import assert from 'node:assert/strict';
import {
  LIQUID_COMBO_BTC_BREADTH_VERSION,
  deriveLiquidComboBtcBreadthSnapshots,
  evaluateLiquidComboBtcBreadthLabel,
} from '../src/liquidComboBtcBreadthLabel.js';
import { liquidComboCycleEntrySnapshot } from '../src/liquidComboCycleStats.js';
import { liquidLiveCardKeysOfTrade } from '../src/liquidLiveCardWhitelist.js';

const btcHealth = {
  btcTrendDir: 'down',
  btcTrendScore: 55,
  pct24h: 0.4,
  pct6h: -0.3,
  rsi4h: 55,
};
const priorTrades = Array.from({ length: 12 }, (_, index) => {
  const day = 1 + Math.floor(index / 4);
  const hour = (index % 4) * 2;
  const openedAt = `2026-08-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const closedAt = `2026-08-${String(day).padStart(2, '0')}T${String(hour + 1).padStart(2, '0')}:00:00.000Z`;
  return {
    id: `prior-${index}`,
    source: 'liquid-scan-auto-80',
    status: 'CLOSED',
    outcome: 'TP',
    symbol: `COIN${index}USDT`,
    side: 'SHORT',
    liquidCombo: 'TEST COMBO SHORT',
    btcHealth,
    openedAt,
    closedAt,
    netPnl: 1,
    netRoe: 5,
  };
});

const shortEntryAt = '2026-08-04T12:00:00.000Z';
const shortMarket = {
  sampleKey: String(Date.parse(shortEntryAt) - 60_000),
  evaluatedAt: Date.parse(shortEntryAt) - 30_000,
  label: 'MARKET_DISPERSION',
  scores: { long: 25, short: 35, confidence: 80 },
  btc: { ret1h: -0.25, ret6h: -0.4 },
  breadth: {
    up1hPct: 25,
    down1hPct: 45,
    up3hPct: 30,
    down3hPct: 40,
    up6hPct: 35,
    down6hPct: 30,
  },
};
const shortBase = {
  id: 'short-entry',
  source: 'liquid-scan-auto-80',
  status: 'OPEN',
  symbol: 'SHORTUSDT',
  side: 'SHORT',
  liquidCombo: 'TEST COMBO SHORT',
  btcHealth,
  openedAt: shortEntryAt,
  candlePatternAtEntry: { name: 'DOJI' },
  sweepDistancePct: 0.75,
  marketDirectionAtSignal: shortMarket,
};
const shortHistory = liquidComboCycleEntrySnapshot(shortBase, priorTrades);
assert.equal(shortHistory.tier, 'STABLE_GOOD');
assert.equal(shortHistory.history.closed, 12);

const shortMatched = evaluateLiquidComboBtcBreadthLabel(shortBase, shortHistory);
assert.equal(shortMatched.liquidComboBtcBreadthMatched, true);
assert.equal(shortMatched.liquidComboBtcBreadthSide, 'SHORT');
assert.equal(shortMatched.liquidComboBtcBreadthTier, 'PRIME_TEST');
assert.equal(shortMatched.liquidComboBtcBreadthBreadthLeadCount, 2);
assert.equal(shortMatched.liquidComboBtcBreadthBtc1hAligned, true);
assert.equal(shortMatched.liquidComboBtcBreadthObservationOnly, true);
assert.equal(shortMatched.liquidComboBtcBreadthAffectsEntry, false);
assert.equal(shortMatched.liquidComboBtcBreadthAffectsMargin, false);
assert.equal(shortMatched.liquidComboBtcBreadthAffectsSl, false);
assert.equal(shortMatched.liquidComboBtcBreadthAffectsTp, false);
assert.equal(shortMatched.liquidComboBtcBreadthAffectsBinance, false);
assert.equal(shortMatched.liquidComboBtcBreadthVersion, LIQUID_COMBO_BTC_BREADTH_VERSION);
assert(
  liquidLiveCardKeysOfTrade({ ...shortBase, ...shortMatched })
    .includes('combo-btc-breadth:SHORT:PRIME_TEST'),
);

const longHealth = { ...btcHealth, btcTrendDir: 'up', pct6h: 0.3 };
const longPrior = priorTrades.map((trade) => ({
  ...trade,
  id: `long-${trade.id}`,
  side: 'LONG',
  liquidCombo: 'TEST COMBO LONG',
  btcHealth: longHealth,
}));
const longBase = {
  ...shortBase,
  id: 'long-entry',
  symbol: 'LONGUSDT',
  side: 'LONG',
  liquidCombo: 'TEST COMBO LONG',
  btcHealth: longHealth,
  marketDirectionAtSignal: {
    ...shortMarket,
    scores: { long: 35, short: 25, confidence: 80 },
    btc: { ret1h: 0.2, ret6h: 0.4 },
    breadth: {
      up1hPct: 45,
      down1hPct: 25,
      up3hPct: 40,
      down3hPct: 30,
      up6hPct: 30,
      down6hPct: 35,
    },
  },
};
const longMatched = evaluateLiquidComboBtcBreadthLabel(
  longBase,
  liquidComboCycleEntrySnapshot(longBase, longPrior),
);
assert.equal(longMatched.liquidComboBtcBreadthMatched, true);
assert.equal(longMatched.liquidComboBtcBreadthSide, 'LONG');
assert.equal(longMatched.liquidComboBtcBreadthTier, 'WATCH_LOW_SAMPLE');
assert(
  liquidLiveCardKeysOfTrade({ ...longBase, ...longMatched })
    .includes('combo-btc-breadth:LONG:WATCH_LOW_SAMPLE'),
);

const breadthCounter = evaluateLiquidComboBtcBreadthLabel({
  ...shortBase,
  marketDirectionAtSignal: {
    ...shortMarket,
    breadth: {
      up1hPct: 50,
      down1hPct: 20,
      up3hPct: 45,
      down3hPct: 25,
      up6hPct: 40,
      down6hPct: 30,
    },
  },
}, shortHistory);
assert.equal(breadthCounter.liquidComboBtcBreadthMatched, false);
assert.equal(breadthCounter.liquidComboBtcBreadthBreadthLeadCount, 0);

const lookAhead = evaluateLiquidComboBtcBreadthLabel({
  ...shortBase,
  marketDirectionAtSignal: {
    ...shortMarket,
    sampleKey: String(Date.parse(shortEntryAt) + 1),
  },
}, shortHistory);
assert.equal(lookAhead.liquidComboBtcBreadthMatched, false);
assert.equal(lookAhead.liquidComboBtcBreadthMarketSampleCausal, false);
assert.ok(lookAhead.liquidComboBtcBreadthMissingFields.includes('causalMarketSample'));

const derived = deriveLiquidComboBtcBreadthSnapshots(
  [...priorTrades, { ...shortBase, marketDirectionAtSignal: undefined }],
  new Map([['short-entry', shortMarket]]),
).get('short-entry');
assert.equal(derived.liquidComboBtcBreadthMatched, true);
assert.equal(derived.liquidComboBtcBreadthMarketSnapshotSource, 'SIGNAL_LOG_BACKFILL');
assert.match(derived.liquidComboBtcBreadthBasis, /^DERIVED_/);

const legacy = evaluateLiquidComboBtcBreadthLabel({ side: 'SHORT' });
assert.equal(legacy.liquidComboBtcBreadthMatched, false);
assert.equal(legacy.liquidComboBtcBreadthTier, 'UNRATED');

console.log('Liquid combo BTC/breadth side-specific observe-only label tests passed.');
