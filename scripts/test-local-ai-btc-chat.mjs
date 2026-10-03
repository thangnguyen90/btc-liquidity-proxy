import assert from 'node:assert/strict';
import { LocalAiTrendChat, buildLocalAiTrendChatContext, resolveLocalAiChatIntent } from '../src/localAiTrendChat.js';

const now = Date.now();
const symbols = ['BTCUSDT', 'QNTUSDT', 'ETHUSDT'];
for (const question of ['xu hướng btc', 'BTCUSDT hôm nay?', 'Bitcoin có tăng không?', 'BTC có support ở đâu?', 'phân tích coin BTC']) {
  assert.equal(resolveLocalAiChatIntent(question, symbols), 'BTC_TREND', question);
}
for (const question of ['coin nào mạnh hơn BTC', 'coin yếu khi btc tăng', 'so sánh BTC với QNT', 'BTC và ETH', 'BTC QNTUSDT', 'gần vùng entry']) {
  assert.equal(resolveLocalAiChatIntent(question, symbols), 'COIN_ANALYSIS', question);
}
const args = {
  question: 'xu hướng btc',
  btcHealth: { btcTrendDir:'down', btcTrendDir4h:'up', price:83000, updatedAt:now },
  entrySnapshot: { generatedAt:now, candidates:[{ symbol:'AAAUSDT', side:'LONG', score:25, lastClosed5m:1 }] },
  history: [{ role:'assistant', content:'Mua AAAUSDT.' }],
  evaluation: { summary:'AAAUSDT rất mạnh' },
};
const context = buildLocalAiTrendChatContext(args);
assert.equal(context.retrieval.mode, 'BTC_HEALTH_ONLY');
assert.deepEqual(context.candidates, []);
assert.deepEqual(context.history, []);
assert.equal(context.latestEvaluation, null);
assert.equal(context.btc.return15mPct, null, 'missing return is not zero');
assert.equal(context.btc.rsi1h, null, 'missing RSI is not oversold RSI=0');

let mode = 'success';
let calls = 0;
const chat = new LocalAiTrendChat({ evaluator: {
  model:'test-model', timeoutMs:60_000,
  request: async (path, init) => {
    calls++;
    const body = JSON.parse(init.body);
    assert.equal(body.think, false);
    assert.equal(body.format.required.includes('outlook'), true);
    assert.equal(JSON.stringify(body).includes('AAAUSDT'), false, 'no unrelated candidate/history in BTC prompt');
    assert.equal(JSON.stringify(body.messages).includes('DUMP_WATCH'), false, 'altcoin breadth gates must not decide BTC trend');
    await new Promise((resolve) => setTimeout(resolve, 8));
    if (mode === 'timeout') throw Object.assign(new Error('Timed out'), { name:'TimeoutError' });
    const content = mode === 'invalid' ? '{"outlook":' : JSON.stringify(mode === 'off-topic'
      ? { outlook:'UP', reason:'AAAUSDT lên mạnh', condition:'mua', coins:[{symbol:'AAAUSDT'}] }
      : { outlook:'UNCLEAR', reason:'1h giảm trong khi 4h tăng.', condition:'Chờ hai khung đồng thuận.' });
    return { ok:true, json:async () => ({ model:'test-model', message:{content}, total_duration:8_000_000 }) };
  },
} });
for (mode of ['success', 'timeout', 'invalid', 'off-topic', 'success']) {
  const answer = await chat.ask(args);
  assert.equal(answer.intent, 'BTC_TREND');
  assert.match(answer.answer, /BTC: 1h GIẢM · 4h TĂNG/);
  assert.doesNotMatch(answer.answer, /AAAUSDT/);
  assert.deepEqual(answer.coins, []);
  assert.equal(answer.binanceEligible, false);
  assert.equal(answer.modelApplied, mode === 'success');
  assert.equal(chat.snapshot().running, false, 'next question must work after success and failure');
  assert.ok(answer.elapsedMs >= 1);
  if (mode !== 'success') {
    assert.equal(answer.model, 'BTC_CONTEXT_FALLBACK');
    assert.ok(answer.usage.totalDurationMs >= 1);
    assert.match(answer.limitations, /không phải nhận định của model/);
  }
}
assert.equal(calls, 5);
await assert.rejects(chat.ask({ ...args, btcHealth:{...args.btcHealth, chatTrendReady:false,
  btcTrendDir:'flat', btcTrendDir4h:'flat'} }),
  (error) => error.code === 'LOCAL_AI_BTC_CONTEXT_NOT_READY', 'empty candle cache must not mean sideways BTC');
assert.equal(calls, 5, 'do not ask the model to interpret unseeded trend defaults');
mode = 'timeout';
const stale = await chat.ask({ ...args, btcHealth:{...args.btcHealth, updatedAt:now - 600_000} });
assert.match(stale.answer, /chưa xác minh được độ mới/);
assert.ok(stale.risks.length);
mode = 'success';
const contradicts = await chat.ask({ ...args, btcHealth:{...args.btcHealth, btcTrendDir:'up', updatedAt:Date.now()},
  entrySnapshot:{...args.entrySnapshot, marketRegime:{state:'DUMP_WATCH', reasons:['Taker-buy chưa đạt 52%']}} });
assert.equal(contradicts.fallbackReason, 'OLLAMA_INCONSISTENT_BTC');
assert.match(contradicts.answer, /1h TĂNG · 4h TĂNG/);
console.log('BTC chat intent, grounding, provenance, fallback, sequential requests: OK');

if (process.argv.includes('--live')) {
  const base = process.env.CHAT_TEST_BASE_URL ?? 'http://127.0.0.1:19082';
  for (let attempt = 0; attempt < 9; attempt++) {
    const healthResponse = await fetch(`${base}/api/local-ai-trend-chat`, {signal:AbortSignal.timeout(10_000)});
    const health = await healthResponse.json();
    if (health.btcContextReady === true) break;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  for (const question of ['xu hướng btc', 'BTC hiện tại tăng hay giảm?']) {
    const start = Date.now();
    const response = await fetch(`${base}/api/local-ai-trend-chat`, {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({question}),
      signal:AbortSignal.timeout(90_000),
    });
    const data = await response.json();
    assert.equal(response.ok, true, data.error);
    assert.equal(data.answer.intent, 'BTC_TREND');
    assert.deepEqual(data.answer.coins, []);
    assert.match(data.answer.answer, /BTC:/);
    console.log(JSON.stringify({ question, elapsedMs:Date.now()-start, modelApplied:data.answer.modelApplied,
      fallbackReason:data.answer.fallbackReason, answer:data.answer.answer, model:data.answer.model }));
    assert.equal(data.answer.modelApplied, true, 'live test must confirm a real Ollama answer, not just fallback');
  }
}
