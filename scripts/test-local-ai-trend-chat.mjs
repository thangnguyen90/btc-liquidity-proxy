import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import {
  LOCAL_AI_TREND_CHAT_VERSION,
  LOCAL_AI_CHAT_MODES,
  LocalAiTrendChat,
  buildLocalAiTrendChatContext,
  buildLiquidityScenario,
  classifyLiquidityZoneLifecycle,
  compactDirectCoinAnalysis,
  extractRequestedMarketSymbols,
  normalizeLocalAiChatMode,
} from '../src/localAiTrendChat.js';

const now = Date.now();
const entrySnapshot = {
  generatedAt: now,
  marketRegime: { state: 'RECOVERY_TEST', metrics: { context15m: 'UP', upCount: 20, downCount: 8 } },
  candidates: [{
    symbol: 'TRXUSDT', side: 'SHORT', score: -24, entryScore: 79,
    lastClosed5mAt: now - 60_000, lastClosed5m: 0.336,
    currentFrames: { '5m':'DOWN', '15m':'DOWN', '1h':'MIXED', '4h':'UP' },
    entryZone: { low: 0.337, high: 0.339, mid: 0.338 },
    currentVolumeRatio15m: 2.4, lastTakerBuyPct: 39,
  }, {
    symbol: 'AAAUSDT', side: 'LONG', score: 28, entryScore: 82,
    lastClosed5mAt: now - 60_000, lastClosed5m: 1.02,
    entryZone: { low: 1, high: 1.03, mid: 1.015 }, currentVolumeRatio15m: 3.1,
  }],
};
const btcHealth = {
  price: 84_000, btcTrendDir: 'up', btcTrendScore: 51,
  btcTrendDir4h: 'flat', btcTrendScore4h: 1, updatedAt: now,
};

assert.deepEqual(
  extractRequestedMarketSymbols('Xu hướng QNT hiện tại thế nào?', [{ symbol:'QNTUSDT' }, { symbol:'TRXUSDT' }]),
  ['QNTUSDT'],
  'a named coin must be resolved outside the candidate shortlist',
);
assert.deepEqual(
  extractRequestedMarketSymbols('Coin nào mạnh hơn BTC?', [{ symbol:'BTCUSDT' }, { symbol:'QNTUSDT' }]),
  [],
  'BTC market context must not be mistaken for a requested altcoin',
);
assert.deepEqual(
  extractRequestedMarketSymbols('Phân tích ZAMAUSDT cùng order book Binance', [{ symbol:'ZAMAUSDT' }, { symbol:'ORDERUSDT' }]),
  ['ZAMAUSDT'],
  'the order-book keyword must not be mistaken for ORDERUSDT unless USDT is explicit',
);
assert.deepEqual(
  extractRequestedMarketSymbols('Phân tích 龙虾', [{ symbol:'龙虾USDT' }, { symbol:'QNTUSDT' }]),
  ['龙虾USDT'],
  'Unicode coin names must remain searchable for the single-coin chart',
);
assert.deepEqual(
  extractRequestedMarketSymbols('ct', [{ symbol:'CTUSDT' }, { symbol:'QNTUSDT' }]),
  ['CTUSDT'],
  'two-character Binance symbols must remain searchable',
);

const trxContext = buildLocalAiTrendChatContext({
  question: 'Xu hướng TRXUSDT hiện tại?', entrySnapshot, btcHealth,
});
assert.equal(trxContext.version, LOCAL_AI_TREND_CHAT_VERSION);
assert.deepEqual(trxContext.requestedSymbolsFound, ['TRXUSDT']);
assert.equal(trxContext.candidates.length, 1);
assert.equal(trxContext.candidates[0].symbol, 'TRXUSDT');
assert.equal(JSON.stringify(trxContext).toLowerCase().includes('pnl'), false);

const missingContext = buildLocalAiTrendChatContext({
  question: 'Xu hướng MISSINGUSDT?', entrySnapshot, btcHealth,
});
assert.deepEqual(missingContext.requestedSymbolsMissing, ['MISSINGUSDT']);

const directAnalysis = {
  symbol:'QNTUSDT', generatedAt:new Date(now).toISOString(), freshness:{ stale:false },
  market:{ markPrice:296.39, change24hPct:41.43, quoteVolume24h:1_500_000_000 },
  trend:{ bias:'BULLISH', score:29.75, frames:[
    { interval:'5m', state:'UP', close:296.8, closeTime:now - 300_000 },
    { interval:'15m', state:'UP', close:282.84, closeTime:now - 900_000 },
    { interval:'1h', state:'UP', close:282.84, closeTime:now - 3_600_000 },
    { interval:'4h', state:'UP', close:266.64, closeTime:now - 14_400_000 },
  ] },
  recommendation:{ bias:'BULLISH', stance:'BEARISH_BREAKDOWN_15M_CONFIRMED', headline:'15m đã đóng dưới hỗ trợ — chờ retest.',
    shortPlan:{ status:'LOW_PRIORITY', trigger:'Chờ retest 5m.', entryZone:{ low:291.2, high:301.4 }, invalidation:303.5, targets:[286] },
    longPlan:{ status:'CONDITIONAL', trigger:'Chờ đóng lại trên vùng.', entryZone:{ low:291.2, high:301.4 }, invalidation:289.1, targets:[374.5] },
    warnings:['Biến động rất cao.'],
    coinglassConfluence:{ liquidityBias:'UPPER_FIRST', agreement:'ALIGNED', dominancePct:70,
      nearestAbove:{ side:'ABOVE', bandLow:304, bandHigh:306, price:305, distancePct:2.9 },
      nearestBelow:{ side:'BELOW', bandLow:285, bandHigh:287, price:286, distancePct:-3.5 } },
  },
  zones:{ supports:[{ low:291.2, high:292.9, confidence:'MEDIUM', orderBookNotional:250000, sources:['ORDERBOOK BID'] }], resistances:[{ low:304.7, high:309.1, confidence:'HIGH', orderBookNotional:420000, sources:['ORDERBOOK ASK'] }] },
  liqScan:{
    current:{ dominantSide:'ABOVE', dominantPct:72, imbalanceScore:44, sweepTarget:{ side:'ABOVE', price:305 }, killZoneCluster:{
      mainKillZone:{ low:304, high:306, mid:305, distancePctLow:2.57, distancePctHigh:3.24, score:12_000_000 },
      farKillZone:{ low:319, high:322, mid:320.5, distancePctLow:7.63, distancePctHigh:8.64, score:55_000_000 },
    } },
    directionAssessment:{ state:'ALIGNED', agreement:'HIGH', headline:'Hai nguồn cùng nghiêng lên.', reasons:['Vùng trên gần hơn.'], above:{ side:'ABOVE', bandLow:304, bandHigh:306, price:305 }, below:{ side:'BELOW', bandLow:285, bandHigh:287, price:286 }, target:{ side:'ABOVE', bandLow:304, bandHigh:306, price:305 } },
  },
};
directAnalysis.orderBookProfile = {
  version:'BINANCE_ORDER_BOOK_RANGE_PROFILE_V2_SIDE_TOTALS_20261002',
  source:'BINANCE_FUTURES_DEPTH', requestedLimit:1000,
  totals:{bidNotional:930000,askNotional:1130000,bidLevelCount:51,askLevelCount:42},
  coverage:{
    bid:{levelCount:500,farthestDistancePct:8.4,reachesNearEdge:true,reachesWideEdge:false},
    ask:{levelCount:500,farthestDistancePct:9.1,reachesNearEdge:true,reachesWideEdge:false},
  },
  near:{minDistancePct:0,maxDistancePct:3,bucketPct:.25,totals:{bidNotional:250000,askNotional:420000,bidLevelCount:18,askLevelCount:14},
    bidZones:[{layer:'NEAR',side:'BID',low:291.2,high:292.9,mid:292,distancePct:-1.48,orderBookNotional:250000,levelCount:18,source:'BINANCE_FUTURES_DEPTH'}],
    askZones:[{layer:'NEAR',side:'ASK',low:304.7,high:305.3,mid:305,distancePct:2.9,orderBookNotional:420000,levelCount:14,source:'BINANCE_FUTURES_DEPTH'}]},
  wide:{minDistancePct:3,maxDistancePct:20,bucketPct:1,totals:{bidNotional:680000,askNotional:710000,bidLevelCount:33,askLevelCount:28},
    bidZones:[{layer:'WIDE',side:'BID',low:273,high:276,mid:274.5,distancePct:-7.38,orderBookNotional:680000,levelCount:33,source:'BINANCE_FUTURES_DEPTH'}],
    askZones:[{layer:'WIDE',side:'ASK',low:319,high:322,mid:320.4,distancePct:8.1,orderBookNotional:710000,levelCount:28,source:'BINANCE_FUTURES_DEPTH'}]},
  caveat:'Depth thực tế chưa phủ hết 20%.',
};
assert.equal(compactDirectCoinAnalysis(directAnalysis).symbol, 'QNTUSDT');
assert.equal(compactDirectCoinAnalysis(directAnalysis).liqScan.current.mainKillZone.score, 12_000_000);
assert.equal(compactDirectCoinAnalysis(directAnalysis).liqScan.current.farKillZone.score, 55_000_000);
assert.equal(normalizeLocalAiChatMode('unknown'), LOCAL_AI_CHAT_MODES.OLLAMA_BINANCE_ORDERBOOK,
  'old clients without a valid mode keep the current Ollama/order-book behavior');
assert.equal(JSON.stringify(compactDirectCoinAnalysis(directAnalysis)).toLowerCase().includes('coinglass'), false,
  'CoinGlass must not be sent to the chatbot model');
let directModelCalls = 0;
let directRequestBody;
const directModelCoins = [
  { symbol:'QNTUSDT', side:'SHORT', trend:'UP', clarity:72, entryContext:'Vùng engine 291.2–301.4', reason:'Khung lớn tăng nhưng breakdown 15m; Binance ask dày phía trên.' },
  { symbol:'ZAMAUSDT', side:'SHORT', trend:'DOWN', clarity:74, entryContext:'Chờ retest vùng engine.', reason:'Nến giảm đồng thuận và Binance LiqScan nghiêng dưới.' },
  { symbol:'TRXUSDT', side:'SHORT', trend:'DOWN', clarity:68, entryContext:'Vùng engine 0.337–0.339', reason:'5m và 15m cùng giảm.' },
];
const directChat = new LocalAiTrendChat({ evaluator:{
  model:'qwen3:8b', timeoutMs:30_000,
  snapshot:() => ({ transport:'windows-curl', running:false }),
  request:async (path, options) => {
    assert.equal(path, '/api/chat');
    directRequestBody = JSON.parse(options.body);
    const coin = directModelCoins[directModelCalls++] ?? directModelCoins.at(-1);
    const directSchema = directRequestBody.format.required?.includes('assessments');
    const singleDirectSchema = directRequestBody.format.required?.includes('side')
      && directRequestBody.format.required?.includes('trend');
    const content = singleDirectSchema
      ? { side:coin.side, trend:coin.trend, clarity:coin.clarity, reason:coin.reason }
      : directSchema
      ? { assessments:[{
          symbol:coin.symbol, side:coin.side, trend:coin.trend, clarity:coin.clarity, reason:coin.reason,
        }] }
      : {
          answer:`Model đánh giá ${coin.symbol}.`, marketContext:'BTC dùng làm bối cảnh.', coins:[coin],
          risks:['Order book Binance có thể bị rút.'], limitations:'OBSERVE ONLY.',
        };
    return {
      ok:true,
      json:async () => ({
        model:'qwen3:8b', prompt_eval_count:123, eval_count:45, total_duration:2_000_000,
        message:{ content:JSON.stringify(content) },
      }),
    };
  },
} });
const directAnswer = await directChat.ask({
  question:'Xu hướng QNT hiện tại?', entrySnapshot, btcHealth, directAnalyses:[directAnalysis],
});
const directContextSent = JSON.parse(directRequestBody.messages.at(-1).content.split('\n').at(-1));
assert.equal(directAnswer.directLookup, true);
assert.equal(directAnswer.modelApplied, true);
assert.equal(directAnswer.analysisMode, 'OLLAMA_BINANCE_ORDERBOOK');
assert.equal(directAnswer.model, 'qwen3:8b');
assert.equal(directAnswer.usage.promptEvalCount, 123);
assert.equal(directModelCalls, 1, 'direct symbol lookup must call Ollama even through windows-curl');
assert.equal(JSON.stringify(directRequestBody).toLowerCase().includes('coinglass'), false);
assert.equal(directContextSent.directCoins.length, 1);
assert.equal(directContextSent.candidates.length, 0, 'exact-symbol prompt must not include unrelated top-12 candidates');
assert.equal(directContextSent.latestEvaluation, null, 'exact-symbol prompt does not need the aggregate model output');
assert.equal(directAnswer.coins[0].symbol, 'QNTUSDT');
assert.equal(directAnswer.coins[0].trend, 'UP');
assert.equal(directAnswer.coins[0].side, 'SHORT', 'current breakdown stance is preserved despite larger trend being UP');
assert.match(directAnswer.coins[0].entryContext, /291\.2/);
assert.equal(directAnswer.coins[0].supports[0].confidence, 'MEDIUM');
assert.equal(directAnswer.coins[0].resistances[0].confidence, 'HIGH');
assert.equal(directAnswer.coins[0].orderBook.bidZones[0].orderBookNotional, 250000);
assert.equal(directAnswer.coins[0].orderBook.askZones[0].orderBookNotional, 420000);
assert.equal(directAnswer.coins[0].orderBook.source, 'BINANCE_FUTURES_DEPTH');
assert.equal(directAnswer.coins[0].orderBook.requestedLimit, 1000);
assert.equal(directAnswer.coins[0].orderBook.totals.bidNotional, 930000);
assert.equal(directAnswer.coins[0].orderBook.totals.askNotional, 1130000);
assert.equal(directAnswer.coins[0].orderBook.near.totals.bidNotional, 250000);
assert.equal(directAnswer.coins[0].orderBook.wide.totals.askNotional, 710000);
assert.equal(directAnswer.coins[0].orderBook.near.bidZones[0].layer, 'NEAR');
assert.equal(directAnswer.coins[0].orderBook.wide.askZones[0].layer, 'WIDE');
assert.equal(directAnswer.coins[0].orderBook.wide.askZones[0].orderBookNotional, 710000);
assert.equal(directAnswer.coins[0].orderBook.coverage.ask.reachesWideEdge, false);
assert.equal(directAnswer.coins[0].liquidityScenario.likelyDirection, 'UPPER');
assert.equal(directAnswer.coins[0].liquidityScenario.confidence, 'HIGH');
assert.equal(directAnswer.coins[0].liquidityScenario.combinedState, 'TREND_LIQUIDITY_ALIGNED');
assert.equal(directAnswer.coins[0].liquidityScenario.source, 'BINANCE_FUTURES_DEPTH_LIQSCAN');
assert.equal(directAnswer.coins[0].liquidityScenario.coinglassUsed, false);
assert.equal(directAnswer.coins[0].liquidityScenario.zoneLifecycle.state, 'ACTIVE_APPROACHING');
assert.equal(directAnswer.coins[0].liquidityScenario.primaryTarget.low, 304);
assert.equal(directAnswer.coins[0].liquidityScenario.markPrice, 296.39);
assert.equal(directAnswer.coins[0].liquidityScenario.mainKillZone.role, 'MAIN_KILL');
assert.equal(directAnswer.coins[0].liquidityScenario.mainKillZone.score, 12_000_000);
assert.equal(directAnswer.coins[0].liquidityScenario.farKillZone.role, 'FAR_KILL');
assert.equal(directAnswer.coins[0].liquidityScenario.farKillZone.low, 319);

const touchingUpper = classifyLiquidityZoneLifecycle({
  direction:'UPPER', zone:{ low:304, high:306 }, markPrice:305,
});
assert.equal(touchingUpper.state, 'TOUCHING');
assert.equal(touchingUpper.active, true);
assert.match(touchingUpper.label, /ĐANG CHẠM VÙNG TRÊN/);

const passedUpperAnalysis = structuredClone(directAnalysis);
passedUpperAnalysis.market.markPrice = 307;
const passedUpperScenario = buildLiquidityScenario(compactDirectCoinAnalysis(passedUpperAnalysis));
assert.equal(passedUpperScenario.zoneLifecycle.state, 'SWEPT');
assert.equal(passedUpperScenario.zoneLifecycle.active, false);
assert.equal(passedUpperScenario.likelyDirection, 'UNCLEAR');
assert.equal(passedUpperScenario.primaryTarget, null);
assert.equal(passedUpperScenario.combinedState, 'LIQUIDITY_ZONE_CONSUMED');

const rejectedUpperAnalysis = structuredClone(directAnalysis);
rejectedUpperAnalysis.market.markPrice = 299;
rejectedUpperAnalysis.liqScan.sweepRejectShort = {
  state:'WATCH_NO_CHASE', zone:{ low:304, high:306 }, sweepAt:now - 600_000,
  rejectAt:now - 300_000, confirmationAt:now - 60_000,
};
const rejectedUpperScenario = buildLiquidityScenario(compactDirectCoinAnalysis(rejectedUpperAnalysis));
assert.equal(rejectedUpperScenario.zoneLifecycle.state, 'REJECTED_AFTER_SWEEP');
assert.equal(rejectedUpperScenario.upperZone.active, false);
assert.match(rejectedUpperScenario.upperZone.lifecycleLabel, /ĐÃ QUÉT \+ REJECT/);

const rejectedLowerAnalysis = structuredClone(directAnalysis);
rejectedLowerAnalysis.market.markPrice = 290;
rejectedLowerAnalysis.liqScan.current.dominantSide = 'BELOW';
rejectedLowerAnalysis.liqScan.current.dominantPct = 71;
rejectedLowerAnalysis.liqScan.current.killZoneCluster.mainKillZone = { low:285, high:287, mid:286 };
rejectedLowerAnalysis.liqScan.sweepRejectLong = {
  state:'WATCH_NO_CHASE', zone:{ low:285, high:287 }, sweepAt:now - 600_000,
  rejectAt:now - 300_000, confirmationAt:now - 60_000,
};
const rejectedLowerScenario = buildLiquidityScenario(compactDirectCoinAnalysis(rejectedLowerAnalysis));
assert.equal(rejectedLowerScenario.zoneLifecycle.state, 'REJECTED_AFTER_SWEEP');
assert.equal(rejectedLowerScenario.lowerZone.active, false);
assert.match(rejectedLowerScenario.zoneLifecycle.reason, /trở lại trên vùng/);
assert.equal(rejectedLowerScenario.combinedState, 'LIQUIDITY_ZONE_CONSUMED');

const staleRuntimeLifecycleAnalysis = structuredClone(rejectedUpperAnalysis);
staleRuntimeLifecycleAnalysis.liqScan.sweepRejectShort = {
  state:'MISSING_DATA', zone:{ low:304, high:306 }, sweepAt:null, rejectAt:null, confirmationAt:null,
};
staleRuntimeLifecycleAnalysis.liqScan.sweepRejectShortAtSnapshot = {
  state:'WATCH_NO_CHASE', zone:{ low:304, high:306 }, sweepAt:now - 600_000,
  rejectAt:now - 300_000, confirmationAt:now - 60_000,
};
const staleRuntimeScenario = buildLiquidityScenario(compactDirectCoinAnalysis(staleRuntimeLifecycleAnalysis));
assert.equal(staleRuntimeScenario.zoneLifecycle.state, 'REJECTED_AFTER_SWEEP',
  'stale requests must keep causal sweep evidence reconstructed at snapshot time');

const rebuiltUpperAnalysis = structuredClone(rejectedUpperAnalysis);
rebuiltUpperAnalysis.liqScan.current.killZoneCluster.mainKillZone = { low:309, high:311, mid:310 };
const rebuiltUpperScenario = buildLiquidityScenario(compactDirectCoinAnalysis(rebuiltUpperAnalysis));
assert.equal(rebuiltUpperScenario.zoneLifecycle.state, 'ACTIVE_APPROACHING',
  'a non-overlapping regenerated zone must remain active');
assert.equal(rebuiltUpperScenario.likelyDirection, 'UPPER');

const fastDirectChat = new LocalAiTrendChat({ evaluator:{
  model:'qwen3:8b', timeoutMs:30_000,
  request:async () => { throw new Error('DIRECT_ENGINE must not call Ollama'); },
} });
const fastDirectAnswer = await fastDirectChat.ask({
  question:'Xu hướng QNT hiện tại?', analysisMode:'DIRECT_ENGINE',
  entrySnapshot, btcHealth, directAnalyses:[directAnalysis],
});
assert.equal(fastDirectAnswer.analysisMode, 'DIRECT_ENGINE');
assert.equal(fastDirectAnswer.model, 'COIN_LEVEL_DIRECT_ENGINE_V2');
assert.equal(fastDirectAnswer.modelApplied, false);
assert.equal(fastDirectAnswer.fallbackReason, null);
assert.deepEqual(fastDirectAnswer.coins[0].supports, []);
assert.deepEqual(fastDirectAnswer.coins[0].resistances, []);
assert.equal(fastDirectAnswer.coins[0].orderBook, null);
assert.equal(fastDirectAnswer.coins[0].liquidityScenario, null);
assert.match(fastDirectAnswer.limitations, /không gọi Ollama, không dùng order book/);
const shortSymbolAnalysis = structuredClone(directAnalysis);
shortSymbolAnalysis.symbol = 'CTUSDT';
const shortSymbolAnswer = await fastDirectChat.ask({
  question:'ct', analysisMode:'DIRECT_ENGINE', entrySnapshot, btcHealth,
  directAnalyses:[shortSymbolAnalysis],
});
assert.equal(shortSymbolAnswer.coins[0].symbol, 'CTUSDT', 'valid two-character symbol query must not be silently ignored');

const conflictAnalysis = structuredClone(directAnalysis);
conflictAnalysis.symbol = 'ZAMAUSDT';
conflictAnalysis.trend = { bias:'BEARISH', score:-27, frames:['5m','15m','1h','4h'].map((interval) => ({ interval, state:'DOWN', close:1, closeTime:now })) };
conflictAnalysis.recommendation.bias = 'BEARISH';
conflictAnalysis.recommendation.stance = 'WAIT_SUPPORT_CONFIRMATION';
conflictAnalysis.recommendation.coinglassConfluence.liquidityBias = 'UPPER_FIRST';
conflictAnalysis.recommendation.coinglassConfluence.dominancePct = 100;
conflictAnalysis.liqScan.current.dominantSide = 'BELOW';
conflictAnalysis.liqScan.current.dominantPct = 97.4;
conflictAnalysis.liqScan.current.killZoneCluster.mainKillZone = { low:285, high:287, mid:286 };
conflictAnalysis.liqScan.directionAssessment = {
  state:'CONFLICT', agreement:'LOW', target:null,
  headline:'HAI NGUỒN MÂU THUẪN — CHƯA XÁC ĐỊNH PHÍA QUÉT TRƯỚC',
  reasons:['Binance và CoinGlass ngược hướng.'],
  above:{ side:'ABOVE', bandLow:1.04, bandHigh:1.06 },
  below:{ side:'BELOW', bandLow:.94, bandHigh:.96 },
};
const conflictAnswer = await directChat.ask({
  question:'Xu hướng ZAMA?', entrySnapshot, btcHealth, directAnalyses:[conflictAnalysis],
});
assert.equal(conflictAnswer.modelApplied, true);
assert.equal(directModelCalls, 2);
assert.equal(conflictAnswer.coins[0].trend, 'DOWN');
assert.equal(conflictAnswer.coins[0].liquidityScenario.likelyDirection, 'LOWER');
assert.equal(conflictAnswer.coins[0].liquidityScenario.combinedState, 'TREND_LIQUIDITY_ALIGNED');
assert.match(conflictAnswer.coins[0].liquidityScenario.combinedHeadline, /Xu hướng nến DOWN/);
assert.equal(conflictAnswer.coins[0].liquidityScenario.coinglassDirection, null);

const fastAggregate = await directChat.ask({
  question:'Coin nào đang yếu hơn BTC, phù hợp để theo dõi SHORT?', entrySnapshot, btcHealth,
});
assert.equal(fastAggregate.model, 'qwen3:8b');
assert.equal(fastAggregate.coins[0].side, 'SHORT');
assert.equal(fastAggregate.usage.totalDurationMs, 2);
assert.equal(directModelCalls, 3, 'aggregate question must also use Ollama before fallback');

let bridgeCalls = 0;
const bridgeChat = new LocalAiTrendChat({ evaluator:{
  model:'qwen3:8b', timeoutMs:60_000,
  snapshot:() => ({ transport:'windows-curl', running:false }),
  request:async () => {
    bridgeCalls += 1;
    return { ok:true, json:async () => ({ model:'qwen3:8b', message:{ content:JSON.stringify({
      answer:'Thị trường đang phân hóa.', marketContext:'BTC đi ngang.', coins:[], risks:[], limitations:'OBSERVE ONLY.',
    }) } }) };
  },
} });
const bridgeAnswer = await bridgeChat.ask({
  question:'Đánh giá tổng thể thị trường hiện tại?', entrySnapshot, btcHealth,
});
assert.equal(bridgeCalls, 1, 'windows curl is a valid Ollama transport and must not force fallback');
assert.equal(bridgeAnswer.model, 'qwen3:8b');

let requestBody;
const evaluator = {
  model: 'qwen3:8b',
  timeoutMs: 30_000,
  request: async (path, options) => {
    assert.equal(path, '/api/chat');
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        model: 'qwen3:8b', total_duration: 2_000_000,
        message: { content: JSON.stringify({
          answer: 'TRX đang nghiêng giảm ngắn hạn nhưng 4h vẫn tăng.',
          marketContext: 'BTC 1h tăng, 4h đi ngang.',
          coins: [{ symbol:'TRXUSDT', side:'SHORT', trend:'DOWN', clarity:68, entryContext:'Vùng engine 0.337–0.339', reason:'5m và 15m cùng giảm' },
            { symbol:'FAKEUSDT', side:'LONG', trend:'UP', clarity:99, entryContext:'Bịa', reason:'Bịa' }],
          risks: ['Khung 4h ngược hướng'], limitations: 'Snapshot hiện tại.',
        }) },
      }),
    };
  },
};
const chat = new LocalAiTrendChat({ evaluator });
const answer = await chat.ask({ question:'Xu hướng TRXUSDT hiện tại?', entrySnapshot, btcHealth });
assert.equal(requestBody.think, false);
assert.equal(requestBody.stream, false);
assert.equal(answer.observeOnly, true);
assert.equal(answer.binanceEligible, false);
assert.equal(answer.coins.length, 1, 'server must remove invented model symbols');
assert.equal(answer.coins[0].symbol, 'TRXUSDT');
assert.equal(chat.snapshot().running, false);
await assert.rejects(chat.ask({ question:'x', entrySnapshot, btcHealth }), (error) => error.code === 'LOCAL_AI_CHAT_INVALID_QUESTION');

let releaseSlowChat;
const slowEvaluator = {
  model:'qwen3:8b', timeoutMs:180_000,
  request:async () => new Promise((resolve) => { releaseSlowChat = () => resolve({
    ok:true,
    json:async () => ({ message:{ content:JSON.stringify({
      answer:'Đang tổng hợp.', marketContext:'BTC.', coins:[], risks:[], limitations:'Observe only.',
    }) } }),
  }); }),
};
const slowChat = new LocalAiTrendChat({ evaluator:slowEvaluator, timeoutMs:60_000 });
const pendingChat = slowChat.ask({ question:'Đánh giá tổng thể thị trường?', entrySnapshot, btcHealth });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(slowChat.snapshot().running, true);
assert.equal(slowChat.snapshot().timeoutMs, 60_000);
await assert.rejects(
  slowChat.ask({ question:'Phân tích bối cảnh hiện tại?', entrySnapshot, btcHealth }),
  (error) => error.code === 'LOCAL_AI_CHAT_BUSY' && /60s tối đa/.test(error.message),
);
await assert.rejects(
  slowChat.ask({ question:'Xu hướng QNT?', entrySnapshot, btcHealth, directAnalyses:[directAnalysis] }),
  (error) => error.code === 'LOCAL_AI_CHAT_BUSY',
  'direct coin lookup also uses Ollama and must respect the bounded chat lock',
);
releaseSlowChat();
await pendingChat;
assert.equal(slowChat.snapshot().running, false);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /\/api\/local-ai-trend-chat/);
assert.match(serverSource, /new LocalAiTrendChat/);
assert.match(serverSource, /getDepth\(symbol, 1000/);
const pageSource = await readFile(new URL('../public/local-ai-trend-evaluation.html', import.meta.url), 'utf8');
assert.match(pageSource, /Hỏi AI về xu hướng altcoin/);
assert.match(pageSource, /id="chat-form"/);
assert.match(pageSource, /onclick="window\.askLocalTrendChat\?\./);
assert.match(pageSource, /onsubmit="event\.preventDefault\(\); window\.askLocalTrendChat\?\./);
assert.match(pageSource, /id="chat-mode"/);
assert.match(pageSource, /value="DIRECT_ENGINE" selected/);
assert.match(pageSource, /value="OLLAMA_BINANCE_ORDERBOOK"/);
assert.match(pageSource, /<script type="module" src="\/local-ai-trend-evaluation\.js\?v=20261004-v41-touch-toggle-tooltip"><\/script>/);
assert.match(pageSource, /local-ai-trend-chat\.css\?v=20261004-v13-touch-toggle-tooltip/);
assert.match(pageSource, /local-ai-trend-evaluation\.js\?v=20261004-v41-touch-toggle-tooltip/);
const pageJsSource = await readFile(new URL('../public/local-ai-trend-evaluation.js', import.meta.url), 'utf8');
assert.match(pageJsSource, /chat-level support/);
assert.match(pageJsSource, /chat-level resistance/);
assert.match(pageJsSource, /ORDER BOOK BINANCE/);
assert.match(pageJsSource, /ORDER BOOK BINANCE FUTURES/);
assert.match(pageJsSource, /NEAR 0–3%/);
assert.match(pageJsSource, /WIDE 3–20%/);
assert.match(pageJsSource, /TỔNG BÊN DƯỚI · BID/);
assert.match(pageJsSource, /TỔNG BÊN TRÊN · ASK/);
assert.match(pageJsSource, /LOCAL_AI_ORDER_BOOK_SIDE_TOTALS_UI_V1_20261002/);
assert.match(pageJsSource, /WIDE chỉ hiển thị phần Binance thực sự trả về/);
assert.match(pageJsSource, /Binance LiqScan:/);
assert.match(pageJsSource, /function renderOrderBookChart/);
assert.match(pageJsSource, /MAIN KILL/);
assert.match(pageJsSource, /FAR KILL/);
assert.match(pageJsSource, /singleCoin \? renderOrderBookChart\(coin\)/);
assert.match(pageJsSource, /LOCAL_AI_SINGLE_COIN_ORDERBOOK_KILL_ZONE_CHART_V6_TOUCH_TOGGLE_TOOLTIP_20261004/);
const hoverDetails = runInNewContext(`(${pageJsSource.slice(pageJsSource.indexOf('function orderBookHoverDetails('), pageJsSource.indexOf('function updateOrderBookHover(')).trim()})`);
const hoverContext = { direction:'UPPER', dominantPct:69.1, main:{ role:'MAIN KILL', low:100, high:110, score:12_500_000, active:true }, far:{ role:'FAR KILL', low:130, high:140, score:55_000_000, active:false } };
assert.match(hoverDetails(hoverContext, 105).zone, /MAIN KILL.*ĐANG HOẠT ĐỘNG/);
assert.match(hoverDetails(hoverContext, 105).liquidationUsd, /12\.50M USD/);
assert.match(hoverDetails(hoverContext, 105).liquidity, /TRÊN: 69\.1%/);
assert.match(hoverDetails(hoverContext, 115).zone, /Ngoài vùng/);
assert.match(hoverDetails(hoverContext, 105, true).zone, /FAR KILL.*ĐÃ TIÊU THỤ/);
assert.match(hoverDetails(hoverContext, 105, true).liquidationUsd, /đã quét.*55M USD/);
assert.doesNotMatch(hoverDetails(hoverContext, 135).liquidity, /69\.1/);
assert.match(hoverDetails({ direction:'UPPER', dominantPct:60, main:{ role:'MAIN KILL', low:100, high:110, score:0, active:true } }, 105).liquidationUsd, /≈ 0 USD/);
assert.match(hoverDetails({ direction:'UPPER', dominantPct:60, main:{ role:'MAIN KILL', low:100, high:110, active:true } }, 105).liquidationUsd, /chưa có giá trị USD/);
assert.match(hoverDetails({ direction:'LOWER', dominantPct:null }, 105).liquidity, /Chưa có/);
assert.match(hoverDetails({ direction:'LOWER', dominantPct:0 }, 105).liquidity, /DƯỚI: 0\.0%/);
assert.match(hoverDetails({ direction:'UPPER', dominantPct:120 }, 105).liquidity, /Chưa có/);
assert.match(pageJsSource, /FAR KILL.*ngoài khung giá gần/);
assert.doesNotMatch(pageJsSource, /orderbook-depth-label/);
assert.match(pageJsSource, /function updateOrderBookHover/);
assert.match(pageJsSource, /function closeOrderBookTooltip/);
assert.match(pageJsSource, /function isTouchOrderBookInteraction/);
assert.match(pageJsSource, /chart\.dataset\.tooltipPinned === 'true'/);
assert.match(pageJsSource, /document\.addEventListener\('click'/);
assert.match(pageJsSource, /if \(wasPinned\) return/);
assert.match(pageJsSource, /chạm lần nữa để đóng/);
assert.match(pageJsSource, /data-price-min=/);
assert.match(pageJsSource, /orderbook-hover-tooltip/);
assert.match(pageJsSource, /text\.textContent = `GIÁ \$\{price\(hoveredPrice\)\}`/);
assert.match(pageJsSource, /LIQUIDITY_ZONE_CONSUMED/);
assert.match(pageJsSource, /lifecycleLabel/);
assert.doesNotMatch(pageJsSource, /CoinGlass:/);
assert.match(pageJsSource, /THANH KHOẢN XUNG ĐỘT/);
assert.doesNotMatch(pageJsSource, /chat-send'\)\.addEventListener\('pointerdown'/);
assert.doesNotMatch(pageJsSource, /button\.addEventListener\('pointerdown'/);
assert.match(pageJsSource, /chat-send'\)\.addEventListener\('mousedown'/);
assert.match(pageJsSource, /button\.addEventListener\('mousedown'/);
assert.match(pageJsSource, /chat-input'\)\.addEventListener\('input'/);
assert.doesNotMatch(pageJsSource, /text\.length < 3/, 'short Binance symbols must reach the API');
assert.match(pageJsSource, /if \(!text\)/, 'empty input must show a visible validation message');
assert.doesNotMatch(pageJsSource, /setTimeout\(\(\) => askChat\(text\)/, 'never submit a partially typed question');
assert.match(pageJsSource, /signal:controller.signal/);
assert.match(pageJsSource, /!chatRunning && !chatHasResult/);
assert.match(pageJsSource, /window\.askLocalTrendChat = askChat/);
assert.match(pageJsSource, /body:JSON\.stringify\(\{ question:text, history:requestHistory, analysisMode \}\)/);
assert.match(pageJsSource, /COIN LEVEL · KHÔNG ORDER BOOK/);
assert.match(pageJsSource, /Đánh giá AI nền đang chạy · chatbot vẫn gọi model/);
const chatCssSource = await readFile(new URL('../public/local-ai-trend-chat.css', import.meta.url), 'utf8');
assert.match(chatCssSource, /\.orderbook-chart-panel/);
assert.match(chatCssSource, /\.kill-zone-note\.main/);
assert.match(chatCssSource, /\.kill-zone-note\.far/);
assert.match(chatCssSource, /\.orderbook-chart\.hovering \.orderbook-hover-layer/);
assert.match(chatCssSource, /\.orderbook-chart\[data-tooltip-pinned="true"\] \.orderbook-hover-layer/);
assert.match(chatCssSource, /touch-action: manipulation/);
assert.match(chatCssSource, /\.hover-liquidation-usd/);
assert.match(chatCssSource, /cursor: crosshair/);

console.log('local AI trend chatbot tests: OK');
