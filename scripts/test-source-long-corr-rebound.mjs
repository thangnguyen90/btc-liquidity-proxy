import assert from 'node:assert/strict';
import {
  SOURCE_LONG_CORR_REBOUND_PROFILES,
  SOURCE_LONG_CORR_REBOUND_VERSION,
  buildSourceLongCorrReboundStats,
  decorateSourceLongCorrReboundTrade,
  evaluateSourceLongCorrRebound,
  sourceLongCorrReboundSnapshotForEntry,
} from '../src/sourceLongCorrRebound.js';

function context(overrides = {}) {
  return {
    side: 'LONG',
    status: 'CLOSED',
    marginUsdt: 1,
    leverage: 10,
    pnl: 0.05,
    openedAt: '2026-08-02T03:00:00.000Z',
    btcCorr: 0.64,
    btcHealth: {
      btcTrendDir: 'down',
      btcTrendScore: 33,
      pct24h: 0.13,
      rsi4h: 46.8,
    },
    ...overrides,
  };
}

const ema = context({ source: 'emasq-5m-squeeze-79-mkt' });
const emaResult = evaluateSourceLongCorrRebound(ema, { sourcePage: 'pump' });
assert.equal(emaResult.sourceLongCorrReboundMatched, true);
assert.equal(
  emaResult.sourceLongCorrReboundCode,
  SOURCE_LONG_CORR_REBOUND_PROFILES.EMA_SQUEEZE,
);
assert.equal(emaResult.sourceLongCorrReboundTier, 'PROVISIONAL');
assert.equal(emaResult.sourceLongCorrReboundAffectsEntry, false);
assert.equal(emaResult.sourceLongCorrReboundAffectsMargin, false);
assert.equal(emaResult.sourceLongCorrReboundAffectsSl, false);
assert.equal(emaResult.sourceLongCorrReboundAffectsTp, false);
assert.equal(emaResult.sourceLongCorrReboundAffectsBinance, false);

const outcomeMutation = evaluateSourceLongCorrRebound(
  { ...ema, pnl: -99, roe: -999, outcome: 'SL' },
  { sourcePage: 'pump' },
);
assert.equal(outcomeMutation.sourceLongCorrReboundMatched, true);
assert.equal(outcomeMutation.sourceLongCorrReboundCode, emaResult.sourceLongCorrReboundCode);

assert.equal(
  evaluateSourceLongCorrRebound(
    context({ source: 'emasq-15m-pre_breakout-80-mkt' }),
    { sourcePage: 'pump' },
  ),
  null,
);
assert.equal(
  evaluateSourceLongCorrRebound(
    context({ source: 'emasq-5m-squeeze-79-mkt', btcCorr: 0.49 }),
    { sourcePage: 'pump' },
  ).sourceLongCorrReboundMatched,
  false,
);

const edge = context({ source: 'cap-66', pumpSignalType: 'sc_spring' });
const edgeResult = evaluateSourceLongCorrRebound(edge, { sourcePage: 'edge' });
assert.equal(edgeResult.sourceLongCorrReboundMatched, true);
assert.equal(
  edgeResult.sourceLongCorrReboundCode,
  SOURCE_LONG_CORR_REBOUND_PROFILES.EDGE_SC_SPRING,
);
assert.equal(
  evaluateSourceLongCorrRebound(
    context({ source: 'killshort-70', pumpSignalType: 'kill_short' }),
    { sourcePage: 'edge' },
  ),
  null,
);

const stored = {
  ...ema,
  ...sourceLongCorrReboundSnapshotForEntry(ema, { sourcePage: 'pump' }),
};
assert.equal(stored.sourceLongCorrReboundVersion, SOURCE_LONG_CORR_REBOUND_VERSION);
assert.equal(stored.sourceLongCorrReboundDerived, false);
assert.deepEqual(
  decorateSourceLongCorrReboundTrade(stored, { sourcePage: 'pump' }),
  stored,
);

const legacy = decorateSourceLongCorrReboundTrade(ema, { sourcePage: 'pump' });
assert.equal(legacy.sourceLongCorrReboundMatched, true);
assert.equal(legacy.sourceLongCorrReboundBasis, 'DERIVED_ENTRY_SNAPSHOT');
assert.equal(legacy.sourceLongCorrReboundDerived, true);
assert.match(legacy.sourceLongCorrReboundVersion, /:DERIVED$/);

const stats = buildSourceLongCorrReboundStats([
  { ...ema, id: 'win', pnl: 0.05 },
  { ...ema, id: 'loss', pnl: -0.02 },
  { ...ema, id: 'open', status: 'OPEN', pnl: 0.03 },
  context({ source: 'emasq-15m-pre_breakout-80-mkt', pnl: 10 }),
], { sourcePage: 'pump' });
assert.equal(stats.length, 1);
assert.equal(stats[0].closed, 2);
assert.equal(stats[0].active, 1);
assert.equal(stats[0].wins, 1);
assert.equal(stats[0].losses, 1);
assert.equal(stats[0].observationOnly, true);

console.log('source long corr rebound tests passed');
