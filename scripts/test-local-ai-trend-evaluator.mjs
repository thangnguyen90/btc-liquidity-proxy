import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LOCAL_AI_TREND_EVALUATOR_VERSION,
  LOCAL_AI_DETERMINISTIC_FALLBACK_VERSION,
  LOCAL_AI_OLLAMA_WATCHDOG_VERSION,
  LOCAL_AI_OBSERVE_QUALIFICATION_VERSION,
  LOCAL_AI_TREND_INFERENCE_PROFILE_VERSION,
  LocalAiTrendEvaluator,
  buildLocalAiDeterministicFallbackEvaluation,
  buildLocalAiTrendInput,
  buildLocalAiTrendSchema,
  normalizeLocalAiTrendEvaluation,
  shouldFallbackToWindowsOllama,
} from '../src/localAiTrendEvaluator.js';

const now = Date.now();
assert.equal(shouldFallbackToWindowsOllama({ name:'TimeoutError' }), false);
assert.equal(shouldFallbackToWindowsOllama({ name:'AbortError' }), false);
assert.equal(shouldFallbackToWindowsOllama({ cause:{ code:'ECONNREFUSED' } }), true);
const entrySnapshot = {
  generatedAt: now,
  marketRegime: {
    state: 'RECOVERY_TEST', shockLabel: 'PUMP_WATCH', reasons: ['breadth chưa đồng thuận'],
    metrics: { context15m: 'UP', context30m: 'MIXED', upCount: 200, downCount: 40, takerBuyRatio: .51 },
  },
  candidates: [{
    symbol: 'TESTUSDT', side: 'LONG', score: 25, entryScore: 78,
    lastClosed5mAt: now - 1_000, lastClosed5m: 1.01,
    entryZone: { low: 1, high: 1.02 }, invalidationPrice: .95,
    targetPlan: { targets: [{ label: 'T1', price: 1.05, movePct: 4 }] },
  }],
  veryStrongTrendPool: { records: [{
    symbol: 'TESTUSDT', side: 'LONG', currentTrendScore: 20, entryScore: 60,
    livePrice: 1.03, entryZone: { low: 1, high: 1.02, mid: 1.01 }, active: true,
  }, {
    symbol: 'SHORTUSDT', side: 'SHORT', currentTrendScore: -27, entryScore: 72,
    livePrice: 2, entryZone: { low: 1.98, high: 2.02, mid: 2 }, active: true,
  }] },
  earlyLongWatches: [{ symbol: 'EARLYUSDT', earlyScore: 70, priceAtWatch: 3 }],
};
const btcHealth = {
  price: 84_000, btcTrendDir: 'up', btcTrendScore: 55,
  btcTrendDir4h: 'down', btcTrendScore4h: 25,
  btcRelativeReturn15mPct: .2, btcRelativeReturn1hPct: -.1, updatedAt: now,
};

const input = buildLocalAiTrendInput({ entrySnapshot, btcHealth });
assert.equal(input.version, LOCAL_AI_TREND_EVALUATOR_VERSION);
assert.equal(input.observeOnly, true);
assert.equal(input.btc.ready, true);
assert.equal(input.candidates.filter((item) => item.symbol === 'TESTUSDT').length, 1, 'same symbol/side is deduped');
assert.equal(input.candidates.some((item) => item.symbol === 'EARLYUSDT' && item.side === 'LONG'), true);
assert.equal(JSON.stringify(input).toLowerCase().includes('pnl'), false, 'input must not include PnL/outcome');

const imbalancedSnapshot = {
  ...entrySnapshot,
  candidates: [
    ...Array.from({ length: 12 }, (_, index) => ({
      symbol: `LONG${index}USDT`, side: 'LONG', score: 40 - index, entryScore: 90 - index,
      entryZone: { low: 1, high: 1.01 },
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      symbol: `SHORT${index}USDT`, side: 'SHORT', score: -(30 - index), entryScore: 70 - index,
      entryZone: { low: 2, high: 2.01 },
    })),
  ],
  veryStrongTrendPool: { records: [] },
  earlyLongWatches: [],
  earlyShortWatches: [],
};
const overallInput = buildLocalAiTrendInput({ entrySnapshot: imbalancedSnapshot, btcHealth, maxCandidates: 10 });
assert.equal(overallInput.candidates.length, 10);
assert.equal(overallInput.candidates.filter((item) => item.side === 'LONG').length, 10,
  'top 10 overall must not reserve slots for SHORT');
assert.equal(overallInput.candidates.filter((item) => item.side === 'SHORT').length, 0);
const overallSchema = buildLocalAiTrendSchema(overallInput);
assert.equal(overallSchema.required.includes('ratings'), true);
assert.equal(overallSchema.required.includes('candidates'), false);
assert.equal(overallSchema.required.includes('longCandidate'), false);
assert.equal(overallSchema.required.includes('shortCandidate'), false);
assert.equal(overallSchema.properties.ratings.minItems, 10);
assert.equal(overallSchema.properties.ratings.maxItems, 10);
assert.deepEqual(overallSchema.properties.ratings.items.required, ['v', 's', 'p']);
assert.deepEqual(overallSchema.properties.ratings.items.properties.v.enum, ['PRIORITY', 'WATCH', 'WAIT', 'AVOID']);
assert.equal(overallSchema.properties.summary, undefined);
const compactNormalized = normalizeLocalAiTrendEvaluation({
  marketRegime:'SW_UP', marketBias:'LONG_BIAS', marketScore:61,
  ratings: overallInput.candidates.map((_candidate, index) => ({
    v:index === 0 ? 'PRIORITY' : 'WATCH', s:90 - index, p:'RETEST',
  })),
}, overallInput, { model:'qwen3:8b' });
assert.equal(compactNormalized.candidates.length, 10);
assert.equal(compactNormalized.candidates[0].symbol, overallInput.candidates[0].symbol);
assert.equal(compactNormalized.candidates[0].verdict, 'PRIORITY');
assert.match(compactNormalized.summary, /AI compact/);
const overallNormalized = normalizeLocalAiTrendEvaluation({
  marketRegime:'SW_UP', marketBias:'LONG_BIAS', marketScore:61,
  summary:'Top tổng thể.', btcAssessment:'BTC nghiêng tăng.', warnings:[],
  candidates: overallInput.candidates.map((candidate, index) => ({
    symbol:candidate.symbol, side:candidate.side, verdict:'WATCH', strength:90 - index,
    horizon:'1h', path:'RETEST', reasons:['xếp hạng tổng thể'], risks:[],
  })),
}, overallInput, { model:'qwen3:8b' });
assert.equal(overallNormalized.candidates.length, 10);
assert.equal(overallNormalized.candidates.every((candidate) => candidate.side === 'LONG'), true);
assert.deepEqual(overallNormalized.candidates.map((candidate) => candidate.strength),
  [90, 89, 88, 87, 86, 85, 84, 83, 82, 81]);
const withoutBtcCandidate = buildLocalAiTrendInput({
  entrySnapshot:{ ...entrySnapshot, candidates:[...entrySnapshot.candidates, {
    symbol:'BTCUSDT', side:'SHORT', score:-99, entryScore:99, entryZone:{ low:83_000, high:84_000 },
  }] },
  btcHealth,
});
assert.equal(withoutBtcCandidate.candidates.some((item) => item.symbol === 'BTCUSDT'), false, 'BTC is context, not an altcoin candidate');

const normalized = normalizeLocalAiTrendEvaluation({
  marketRegime: 'SW_UP', marketBias: 'LONG_BIAS', marketScore: 68,
  summary: 'BTC đi ngang tăng.', btcAssessment: 'Chưa phải UP_STRONG.', warnings: ['Không đuổi giá'],
  candidates: [
    { symbol: 'TESTUSDT', side: 'LONG', verdict: 'PRIORITY', strength: 77, horizon: '1h', path: 'RETEST', reasons: ['giữ cấu trúc'], risks: [] },
    { symbol: 'FAKEUSDT', side: 'LONG', verdict: 'PRIORITY', strength: 99, horizon: '1h', path: 'CONTINUATION', reasons: [], risks: [] },
  ],
}, input, { model: 'qwen3:8b' });
assert.equal(normalized.candidates.length, 1, 'model cannot invent a symbol');
assert.deepEqual(normalized.candidates[0].deterministic.entryZone, input.candidates.find((item) => item.symbol === 'TESTUSDT').entryZone, 'price zone comes from deterministic engine');
assert.equal(normalized.binanceEligible, false);
assert.equal(normalized.candidates[0].qualification.version, LOCAL_AI_OBSERVE_QUALIFICATION_VERSION);
assert.equal(normalized.candidates[0].qualification.passed, true);
assert.equal(normalized.candidates[0].qualification.passedCount, 6);
assert.equal(normalized.candidates[0].qualification.observeOnly, true);
assert.equal(normalized.candidates[0].qualification.binanceEligible, false);
assert.equal(normalized.priorityZoneExecutionEligible, true);
const legacyNormalized = normalizeLocalAiTrendEvaluation({
  marketRegime:'SW_UP', marketBias:'LONG_BIAS', marketScore:50,
  summary:'Legacy.', btcAssessment:'Legacy.', warnings:[],
  longCandidate:{ symbol:'TESTUSDT', side:'LONG', verdict:'WATCH', strength:55,
    horizon:'1h', path:'RETEST', reasons:[], risks:[] },
}, input, { model:'legacy' });
assert.equal(legacyNormalized.candidates.length, 1,
  'legacy longCandidate/shortCandidate JSON remains readable');

const deterministicFallback = buildLocalAiDeterministicFallbackEvaluation(input, {
  reasonCode:'OLLAMA_BUFFER_ALLOCATION_FAILED', reason:'paging file too small',
});
assert.equal(deterministicFallback.model, LOCAL_AI_DETERMINISTIC_FALLBACK_VERSION);
assert.equal(deterministicFallback.modelApplied, false);
assert.equal(deterministicFallback.deterministicFallback, true);
assert.equal(deterministicFallback.fallback.active, true);
assert.equal(deterministicFallback.fallback.binanceEligible, false);
assert.equal(deterministicFallback.priorityZoneExecutionEligible, false);
assert.ok(deterministicFallback.candidates.length >= 1);
assert.ok(deterministicFallback.candidates.every((candidate) => (
  input.candidates.some((source) => source.symbol === candidate.symbol && source.side === candidate.side)
)), 'fallback cannot invent a candidate');
assert.equal(deterministicFallback.candidates.length, input.candidates.length,
  'fallback ranks the whole top pool instead of one candidate per side');
assert.deepEqual(
  deterministicFallback.candidates.map((candidate) => candidate.strength),
  [...deterministicFallback.candidates].map((candidate) => candidate.strength).sort((a, b) => b - a),
  'fallback output is sorted by strength descending',
);
const overallFallback = buildLocalAiDeterministicFallbackEvaluation(overallInput);
assert.equal(overallFallback.candidates.length, 10);
assert.equal(overallFallback.candidates.every((candidate) => candidate.side === 'LONG'), true);

let calls = 0;
const evaluator = new LocalAiTrendEvaluator({
  fetchImpl: async (_url, options) => {
    calls += 1;
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'qwen3:8b');
    assert.equal(body.think, false);
    assert.equal(body.format.required.includes('ratings'), true);
    assert.equal(body.format.required.includes('candidates'), false);
    assert.equal(body.format.required.includes('longCandidate'), false);
    assert.equal(body.format.required.includes('shortCandidate'), false);
    assert.equal(body.format.properties.ratings.minItems, input.candidates.length);
    assert.equal(body.options.num_ctx, 4096);
    assert.equal(body.options.num_predict, 384);
    assert.equal(body.options.num_batch, 128);
    return {
      ok: true,
      json: async () => ({
        model: 'qwen3:8b', total_duration: 1_000_000,
        message: { content: JSON.stringify({
          marketRegime: 'RANGE', marketBias: 'NEUTRAL', marketScore: 50,
          ratings: input.candidates.map(() => ({ v:'WATCH', s:55, p:'RETEST' })),
        }) },
      }),
    };
  },
});
const first = await evaluator.evaluate({ entrySnapshot, btcHealth });
const second = await evaluator.evaluate({ entrySnapshot, btcHealth });
assert.equal(first.cached, false);
assert.equal(second.cached, true);
assert.equal(calls, 1, 'cached evaluation must not call Ollama again');
assert.equal(first.usage.inferenceProfile, LOCAL_AI_TREND_INFERENCE_PROFILE_VERSION);
assert.deepEqual(evaluator.snapshot().inferenceProfile, {
  version: LOCAL_AI_TREND_INFERENCE_PROFILE_VERSION,
  numCtx: 4096,
  numPredict: 384,
  numBatch: 128,
  timeoutMs: 180000,
});

const brokenEvaluator = new LocalAiTrendEvaluator({
  fetchImpl: async () => ({
    ok:false, status:500,
    text:async () => 'failed to allocate CPU_REPACK buffer',
  }),
});
const recoveredByEngine = await brokenEvaluator.evaluateResilient({ entrySnapshot, btcHealth, force:true });
assert.equal(recoveredByEngine.deterministicFallback, true);
assert.equal(recoveredByEngine.priorityZoneExecutionEligible, false);
assert.equal(brokenEvaluator.snapshot().lastInferenceFailure.code, 'LOCAL_AI_OLLAMA_ERROR');

const offlineFallbackEvaluator = new LocalAiTrendEvaluator({
  fetchImpl: async () => { throw new Error('model must be skipped when health is offline'); },
});
const offlineFallback = await offlineFallbackEvaluator.evaluateResilient({
  entrySnapshot, btcHealth, force:true,
  ollamaHealth:{ online:false, modelReady:false, error:'offline' },
});
assert.equal(offlineFallback.deterministicFallback, true);
assert.equal(offlineFallback.fallback.reasonCode, 'LOCAL_AI_MODEL_NOT_READY');

let recoveryOnline = false;
let recoveryStarts = 0;
const recoveryEvaluator = new LocalAiTrendEvaluator({
  fetchImpl: async () => {
    if (!recoveryOnline) return { ok: false, status: 503 };
    return {
      ok: true,
      json: async () => ({ models: [{ name: 'qwen3:8b' }] }),
    };
  },
  serviceStarter: async () => { recoveryStarts += 1; recoveryOnline = true; },
  serviceStartCooldownMs: 0,
});
const recovered = await recoveryEvaluator.ensureAvailable({ startupWaitMs: 1_000, pollMs: 100 });
assert.equal(recovered.online, true);
assert.equal(recovered.modelReady, true);
assert.equal(recovered.restarted, true);
assert.equal(recovered.watchdogVersion, LOCAL_AI_OLLAMA_WATCHDOG_VERSION);
assert.equal(recoveryStarts, 1);

const warmingEvaluator = new LocalAiTrendEvaluator({
  fetchImpl: async () => { throw new Error('Ollama must not be called while BTC is warming'); },
});
await assert.rejects(
  warmingEvaluator.evaluate({ entrySnapshot, btcHealth: { seeding: true } }),
  (error) => error.code === 'LOCAL_AI_BTC_CONTEXT_NOT_READY',
);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /\/api\/local-ai-trend-evaluation/);
assert.match(serverSource, /\/local-ai-trend-evaluation\.html/);
assert.match(serverSource, /injectLocalAiNavigation/);
const pageSource = await readFile(new URL('../public/local-ai-trend-evaluation.html', import.meta.url), 'utf8');
assert.match(pageSource, /id="btc-ai-top"/);
assert.match(pageSource, /id="btc-ai-assessment"/);
assert.match(pageSource, /local-ai-trend-evaluation\.css\?v=20261001-v8-hourly-btc-guidance/);
assert.match(pageSource, /type="module" src="\/local-ai-trend-evaluation\.js\?v=20261002-v37-hover-liquidity/);
const pageJs = await readFile(new URL('../public/local-ai-trend-evaluation.js', import.meta.url), 'utf8');
assert.match(pageJs, /function renderBtcAi/);
assert.match(pageJs, /LOCAL_AI_BTC_TOP_CARD_V1_20260930/);
assert.match(pageJs, /evaluation\?\.btcAssessment/);
assert.match(pageJs, /persisted\.btcForecast/);
assert.match(pageJs, /renderBtcAi\(data\)/);
assert.match(pageJs, /LOCAL_AI_HOURLY_BTC_GUIDANCE_V1_20261001/);
assert.match(pageJs, /function renderHourlyBtcGuidance/);
assert.match(pageJs, /allowedVerdicts = new Set\(\['PRIORITY', 'WATCH'\]\)/);
assert.match(pageJs, /ENGINE FALLBACK/);
assert.match(pageJs, /KHÔNG BINANCE/);
assert.match(pageJs, /lần suy luận gần nhất bị lỗi/);
console.log('local AI trend evaluator tests: OK');
