import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COIN_LEVEL_MARKET_REGIME_GUARD_VERSION,
  CoinLevelMarketRegimeGuard,
} from '../src/coinLevelMarketRegimeGuard.js';

let clock = Date.UTC(2026, 8, 22, 1, 0, 0);
const guard = new CoinLevelMarketRegimeGuard({ now: () => clock });
const metrics = ({
  at = clock, context15m = 'UP', context30m = 'UP', up = 180, down = 80,
  taker = 0.55, socketFresh = true, processed = 300, coverage = 90,
} = {}) => ({
  evaluatedAt: at,
  socketFresh,
  processed,
  coveragePct: coverage,
  upCount: up,
  downCount: down,
  strongUpCount: 50,
  strongDownCount: 10,
  takerBuyRatio: taker,
  context: {
    '15m': { direction: context15m },
    '30m': { direction: context30m },
  },
});

let state = guard.observe(metrics());
assert.equal(state.version, COIN_LEVEL_MARKET_REGIME_GUARD_VERSION);
assert.equal(state.state, 'RECOVERY_TEST', 'startup must not immediately open LONG');
assert.equal(state.allowLongEntry, false);
assert.equal(state.allowShortEntry, true);

clock += 15 * 60_000;
state = guard.observe(metrics());
assert.equal(state.state, 'RECOVERY_TEST', '15m good is not enough while 30m DUMP quiet window is unknown');

clock += 15 * 60_000;
state = guard.observe(metrics());
assert.equal(state.state, 'RISK_ON');
assert.equal(state.allowLongEntry, true);

clock += 15_000;
state = guard.observe(metrics(), { direction: 'DUMP', severity: 'WATCH' });
assert.equal(state.state, 'RISK_OFF');
assert.equal(state.allowLongEntry, false);
assert.equal(state.shockLabel, 'DUMP_WATCH');

clock += 15_000;
state = guard.observe(metrics({ context15m: 'DOWN', context30m: 'DOWN', taker: 0.46 }));
assert.equal(state.state, 'RISK_OFF');
assert.ok(state.reasons.some((reason) => reason.includes('15m và 30m cùng DOWN')));
assert.ok(state.reasons.some((reason) => reason.includes('< 48%')));

clock += 60_000;
state = guard.observe(metrics());
assert.equal(state.state, 'RECOVERY_TEST');

clock += 30 * 60_000;
state = guard.observe(metrics());
assert.equal(state.state, 'RISK_ON', 'LONG reopens only after stable recovery and 30m without DUMP');

clock += 61_000;
state = guard.snapshot();
assert.equal(state.state, 'WAIT_DATA');
assert.equal(state.allowLongEntry, false, 'stale breadth must fail closed for LONG');

const [server, html, client] = await Promise.all([
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.js', import.meta.url), 'utf8'),
]);
assert.match(server, /coinLevelMarketRegimeGuard\.observe/);
assert.match(server, /getMarketRegime: \(\) => coinLevelMarketRegimeGuard\.snapshot/);
assert.match(html, /id="market-regime-panel"/);
assert.match(client, /renderCoinLevelMarketRegime/);
assert.match(client, /RISK-OFF · CHẶN LONG COIN LEVEL MỚI/);

console.log('Coin Level market regime guard: RISK-OFF/RECOVERY/RISK-ON, stale fail-closed and UI wiring: OK');
