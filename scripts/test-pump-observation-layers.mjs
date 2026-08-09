import assert from 'node:assert/strict';
import {
  PUMP_OBSERVATION_VERSION,
  buildPumpObservationEntryModel,
  buildPumpObservationSnapshotMap,
  buildPumpObservationStats,
  decoratePumpObservationTrades,
  pumpObservationSnapshotForEntry,
  pumpObservationStaticSnapshot,
} from '../src/pumpObservationLayers.js';

const btcDown = {
  btcTrendDir: 'down',
  btcTrendScore: 65,
  emaTrend1h: 'below',
  marketRegime: 'DOWN',
  regime: 'WEAK_DOWN',
  pct6h: -1.2,
  rsi1h: 45,
  obvTrend: 'falling',
};

function nativeTrade(index, overrides = {}) {
  const day = 20 + Math.floor(index / 6);
  const createdAt = `2026-07-${String(day).padStart(2, '0')}T01:${String(index % 60).padStart(2, '0')}:00.000Z`;
  return {
    id: `native-${index}`,
    source: 'pump-90-dump',
    pumpSignalType: 'DUMP',
    pumpSignalTimeframe: '15m',
    side: 'SHORT',
    status: 'CLOSED',
    marginUsdt: 10,
    leverage: 10,
    pnl: 0.8,
    roe: 8,
    createdAt,
    openedAt: createdAt,
    closedAt: `2026-07-${String(day).padStart(2, '0')}T03:${String(index % 60).padStart(2, '0')}:00.000Z`,
    btcCorr: 0.65,
    btcHealth: btcDown,
    pumpCanonicalCandidateTier: 'A',
    ...overrides,
  };
}

const history = Array.from({ length: 36 }, (_, index) => nativeTrade(index));
const current = nativeTrade(99, {
  id: 'current-native',
  status: 'OPEN',
  pnl: 0.4,
  roe: 4,
  createdAt: '2026-08-01T01:00:00.000Z',
  openedAt: '2026-08-01T01:00:00.000Z',
  closedAt: null,
});

const staticSnapshot = pumpObservationStaticSnapshot(current);
assert.equal(staticSnapshot.pumpObsVersion, PUMP_OBSERVATION_VERSION);
assert.equal(staticSnapshot.pumpObsSourceFamily, 'PUMP_NATIVE');
assert.equal(staticSnapshot.pumpObsSourceTier, 'A');
assert.equal(staticSnapshot.pumpObsWaveKey, 'SHORT_ALIGNED_ACTIVE');
assert.equal(staticSnapshot.pumpObsObservationOnly, true);
assert.equal(staticSnapshot.pumpObsAffectsEntry, false);
assert.equal(staticSnapshot.pumpObsAffectsMargin, false);
assert.equal(staticSnapshot.pumpObsAffectsSl, false);
assert.equal(staticSnapshot.pumpObsAffectsTp, false);

const emaStatic = pumpObservationStaticSnapshot({
  ...current,
  id: 'current-ema',
  source: 'emasq-15m-pre_breakdown-90-mkt',
  emaComboLayersSnapshot: { layer3: { tier: 'GOOD_PLUS' } },
});
assert.equal(emaStatic.pumpObsSourceFamily, 'EMA');
assert.equal(emaStatic.pumpObsSourceTier, 'A');
assert.equal(emaStatic.pumpObsSetup, 'PRE_BREAKDOWN');

const model = buildPumpObservationEntryModel(history, Date.parse(current.openedAt));
const entrySnapshot = pumpObservationSnapshotForEntry(current, model);
assert.equal(entrySnapshot.pumpObsL1Tier, 'PRIME');
assert.equal(entrySnapshot.pumpObsBestEligible, true);
assert.equal(entrySnapshot.pumpObsBestSelected, true);
assert.equal(entrySnapshot.pumpObsBestLabel, 'PUMP BEST');
assert.equal(entrySnapshot.pumpObsL1FrozenDay, '2026-08-01');
assert.match(entrySnapshot.pumpObsBestReason, /OBSERVE ONLY/);

const snapshotMap = buildPumpObservationSnapshotMap([...history, current]);
const decorated = decoratePumpObservationTrades([current], snapshotMap)[0];
assert.equal(decorated.pumpObsL1Tier, 'PRIME');
assert.equal(decorated.pumpObsBestSelected, true);
const storedOnly = decoratePumpObservationTrades([
  { ...current, ...entrySnapshot, id: 'stored-after-cache' },
], new Map())[0];
assert.equal(storedOnly.pumpObsL1Tier, 'PRIME');
assert.equal(storedOnly.pumpObsBestSelected, true);

const stats = buildPumpObservationStats([decorated]);
assert.equal(stats.observationOnly, true);
assert.equal(stats.affectsEntry, false);
assert.equal(stats.layers.l1[0].sourceFamily, 'PUMP_NATIVE');
assert.equal(stats.layers.l2[0].label, 'PUMP_NATIVE · TIER A');
assert.equal(stats.layers.l2b[0].key, 'PUMP_NATIVE|SHORT_ALIGNED_ACTIVE');
assert.equal(stats.layers.l2c[0].key, 'PUMP_NATIVE|A|SHORT_ALIGNED_ACTIVE');
assert.equal(stats.layers.l3[0].label, 'PUMP_NATIVE · PUMP BEST');

console.log('Pump observation layers: source split, tier, BTC wave, A/B matrix and prior-day BEST passed.');
