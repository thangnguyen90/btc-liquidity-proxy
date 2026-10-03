import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutoEntryControls, entryRoute } from '../src/autoEntryControls.js';
import {
  LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION,
  LOCAL_AI_PASS_MIDPOINT_ROUTES,
  LocalAiPassMidpointBinanceRunner,
  buildLocalAiPassMidpointMarketOrder,
  isLocalAiPassMidpointEvaluationEligible,
  localAiPassMidpointSetup,
  localAiPassMidpointTouched,
} from '../src/localAiPassMidpointBinance.js';

const dir = await mkdtemp(join(tmpdir(), 'local-ai-midpoint-'));
try {
  const controls = new AutoEntryControls(join(dir, 'controls.json'));
  controls.seed(LOCAL_AI_PASS_MIDPOINT_ROUTES);
  let controlsState = controls.read();
  assert.equal(controlsState.enabled, false);
  for (const route of LOCAL_AI_PASS_MIDPOINT_ROUTES) {
    const row = controlsState.routes[entryRoute(route).key];
    assert.equal(row.enabled, false, 'new AI route must default OFF');
    assert.equal(row.marginUsdt, 1);
    assert.equal(row.leverage, 5);
    assert.equal(row.takeProfitRoePct, 10);
  }

  controls.update({ action:'master', enabled:true });
  for (const route of LOCAL_AI_PASS_MIDPOINT_ROUTES) {
    controls.update({ action:'route', key:entryRoute(route).key, enabled:true });
  }
  controlsState = controls.read();
  const enabledAt = Date.parse(controlsState.routes[entryRoute(LOCAL_AI_PASS_MIDPOINT_ROUTES[1]).key].enabledAt);
  let now = enabledAt + 2_000;
  const evaluation = {
    evaluatedAt:now,
    inputGeneratedAt:now - 1_000,
    candidates:[{
      symbol:'ZONEUSDT', side:'SHORT', verdict:'PRIORITY', strength:82,
      horizon:'1h', path:'RETEST',
      qualification:{ passed:true, passedCount:6, totalCount:6, version:'QUAL_V2' },
      deterministic:{
        closedAt:now - 1_000,
        livePrice:0.347,
        livePriceSource:'MARK_SOCKET',
        entryZone:{ low:0.3464, high:0.3469196, mid:999 },
        invalidationPrice:0.36,
      },
    }],
  };
  const setup = localAiPassMidpointSetup(evaluation, evaluation.candidates[0], now);
  assert(setup);
  assert.equal(setup.version, LOCAL_AI_PASS_MIDPOINT_ENTRY_VERSION);
  assert(Math.abs(setup.entryZone.mid - 0.3466598) < 1e-12, 'midpoint is derived from low/high, not a stale provided mid');
  assert.equal(localAiPassMidpointTouched(0.3462, 0.3464, setup.entryZone), true);
  assert.equal(localAiPassMidpointTouched(0.3462, 0.34625, setup.entryZone), false);
  assert.equal(localAiPassMidpointTouched(null, 0.3465, setup.entryZone), true);

  const routeState = controlsState.routes[entryRoute(LOCAL_AI_PASS_MIDPOINT_ROUTES[1]).key];
  const order = buildLocalAiPassMidpointMarketOrder(setup, {
    now,
    enabledAt:routeState.enabledAt,
    startedAt:enabledAt - 1_000,
    markPrice:setup.entryZone.mid,
    routeState,
  });
  assert(order);
  assert.equal(order.side, 'SELL');
  assert.equal(order.marginUsdt, 1);
  assert.equal(order.notionalUsdt, 5);
  assert.equal(order.takeProfitRoePct, 10);
  assert.equal(order.stopLossPrice, 0.36);
  assert.equal(order.maxOpenPositions, 50);
  assert.equal(order.signalStageKey, 'AI_PRIORITY_ENGINE_ZONE_TOUCH');

  const noInvalidation = localAiPassMidpointSetup(evaluation, {
    ...evaluation.candidates[0],
    symbol:'ZEROUSDT',
    deterministic:{ ...evaluation.candidates[0].deterministic, invalidationPrice:0 },
  }, now);
  const fallbackOrder = buildLocalAiPassMidpointMarketOrder(noInvalidation, {
    now, enabledAt:routeState.enabledAt, startedAt:enabledAt - 1_000,
    markPrice:noInvalidation.entryZone.mid, routeState,
  });
  assert(fallbackOrder, 'PRIORITY card with invalidation=0 must use the safe fallback SL');
  assert(Math.abs(fallbackOrder.stopLossRoePct - 20) < 1e-9);
  assert(fallbackOrder.stopLossPrice > fallbackOrder.signalEntryPrice, 'SHORT fallback SL stays above entry');

  const submissions = [];
  const symbolSnapshots = [];
  const runner = new LocalAiPassMidpointBinanceRunner({
    file:join(dir, 'state.json'),
    controls,
    now:() => now,
    startedAt:enabledAt - 1_000,
    onSymbolsChanged:(symbols) => symbolSnapshots.push([...symbols]),
    getContext:async () => ({
      enabled:true, credentials:{}, positions:[], openOrders:[], markPrice:setup.entryZone.mid,
    }),
    submit:async (plan) => {
      submissions.push(plan);
      return { status:'submitted', orderResult:{ orderId:123 } };
    },
  });
  const sync = await runner.syncEvaluation(evaluation);
  assert.equal(sync.active, 1);
  assert.deepEqual(sync.symbols, ['ZONEUSDT']);
  assert.deepEqual(symbolSnapshots.at(-1), ['ZONEUSDT']);
  assert.equal((await runner.onMark({ symbol:'ZONEUSDT', markPrice:0.3462, at:now })).status, 'waiting-engine-zone');
  const touched = await runner.onMark({ symbol:'ZONEUSDT', markPrice:0.3465, at:now + 1 });
  assert.equal(touched.results[0].status, 'submitted');
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].marginUsdt, 1);
  assert.equal(runner.snapshot().setups[0].consumed, true);
  await runner.onMark({ symbol:'ZONEUSDT', markPrice:setup.entryZone.mid, at:now + 2 });
  assert.equal(submissions.length, 1, 'same AI setup can submit only once');

  const invalid = structuredClone(evaluation);
  invalid.evaluatedAt = now + 10;
  invalid.candidates[0].verdict = 'WATCH';
  assert.equal(localAiPassMidpointSetup(invalid, invalid.candidates[0], now + 10), null);

  const engineFallbackEvaluation = {
    ...evaluation,
    deterministicFallback:true,
    modelApplied:false,
    fallback:{ active:true, binanceEligible:false },
  };
  assert.equal(isLocalAiPassMidpointEvaluationEligible(engineFallbackEvaluation), false);
  const fallbackSync = await runner.syncEvaluation(engineFallbackEvaluation);
  assert.equal(fallbackSync.active, 0, 'deterministic fallback must clear/not arm Binance setups');
  assert.deepEqual(fallbackSync.symbols, []);
} finally {
  await rm(dir, { recursive:true, force:true });
}

console.log('local AI PRIORITY engine-zone Binance tests: OK');
