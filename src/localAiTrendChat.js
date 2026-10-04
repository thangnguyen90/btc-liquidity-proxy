import { buildLocalAiTrendInput } from './localAiTrendEvaluator.js';

export const LOCAL_AI_TREND_CHAT_VERSION =
  'LOCAL_AI_TREND_CHAT_V17_FAST_ORDER_BOOK_NO_OLLAMA_20261004';
export const LOCAL_AI_CHAT_MODES = Object.freeze({
  DIRECT_ENGINE: 'DIRECT_ENGINE',
  DIRECT_ENGINE_BINANCE_ORDERBOOK: 'DIRECT_ENGINE_BINANCE_ORDERBOOK',
  OLLAMA_BINANCE_ORDERBOOK: 'OLLAMA_BINANCE_ORDERBOOK',
});

export function normalizeLocalAiChatMode(value) {
  return Object.values(LOCAL_AI_CHAT_MODES).includes(value)
    ? value : LOCAL_AI_CHAT_MODES.OLLAMA_BINANCE_ORDERBOOK;
}

export function localAiChatModeUsesOllama(value) {
  return normalizeLocalAiChatMode(value) === LOCAL_AI_CHAT_MODES.OLLAMA_BINANCE_ORDERBOOK;
}

export function localAiChatModeUsesOrderBook(value) {
  return normalizeLocalAiChatMode(value) !== LOCAL_AI_CHAT_MODES.DIRECT_ENGINE;
}

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finite = (value) => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SYMBOL_QUERY_STOP_WORDS = new Set([
  'AI', 'ALTCOIN', 'BINANCE', 'BOOK', 'BUY', 'COIN', 'ENTRY', 'LONG', 'MARKET',
  'MODEL', 'ORDER', 'PRICE', 'RESISTANCE', 'SELL', 'SHORT', 'SUPPORT', 'TREND', 'VOLUME',
]);

function explicitUsdtSymbols(question) {
  return [...new Set(String(question ?? '').toUpperCase().match(/[\p{L}\p{N}]+USDT/gu) ?? [])];
}

export function resolveLocalAiChatIntent(question, availableSymbols = []) {
  const text = String(question ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const mentionsBtc = /\b(btc(?:usdt)?|bitcoin)\b/u.test(text);
  const comparesCoins = /\balt(?:coin)?\b|danh sach|so sanh|\b(vs|versus)\b|manh hon|yeu hon/u.test(text)
    || /\bcoin\b/u.test(text.replace(/\bcoin\s+(?:btc(?:usdt)?|bitcoin)\b/gu, ''));
  const otherSymbols = extractRequestedMarketSymbols(question, availableSymbols);
  const explicitOthers = explicitUsdtSymbols(question).filter((symbol) => symbol !== 'BTCUSDT');
  return mentionsBtc && !comparesCoins && !otherSymbols.length && !explicitOthers.length
    ? 'BTC_TREND' : 'COIN_ANALYSIS';
}

function fallbackExplanation(reason) {
  const detail = {
    OLLAMA_TIMEOUT: 'Ollama không trả lời trong thời gian cho phép',
    OLLAMA_INVALID_JSON: 'Ollama trả kết quả không đúng định dạng',
    OLLAMA_OFF_TOPIC: 'Kết quả Ollama không đúng chủ đề BTC',
    OLLAMA_INCONSISTENT_BTC: 'Nhận định Ollama mâu thuẫn với xu hướng BTC trong snapshot',
    OLLAMA_UNAVAILABLE: 'Không lấy được kết quả từ Ollama',
  }[reason] ?? 'Chưa có đánh giá hợp lệ từ Ollama';
  return `${detail}. Phần dưới chỉ tổng hợp dữ liệu engine, không phải nhận định của model.`;
}

function btcTrendOptions(btc = {}) {
  if (!btc.ready || !finite(btc.updatedAt) || Date.now() - Number(btc.updatedAt) > 5 * 60_000) return ['UNCLEAR'];
  const first = String(btc.trend1h).toLowerCase();
  const second = String(btc.trend4h).toLowerCase();
  if (first !== second) return ['MIXED', 'UNCLEAR'];
  return [{ up:'UP', down:'DOWN', flat:'RANGE' }[first] ?? 'UNCLEAR'];
}

function buildBtcAnswer(context, { assessment = null, fallbackReason = null } = {}) {
  const btc = context.btc;
  const label = (value) => ({ up:'TĂNG', down:'GIẢM', flat:'ĐI NGANG' }[String(value).toLowerCase()] ?? 'THIẾU DỮ LIỆU');
  const updatedAt = finite(btc.updatedAt);
  const stale = !updatedAt || Date.now() - updatedAt > 5 * 60_000;
  const moves = [['15m', btc.return15mPct], ['1h', btc.return1hPct]]
    .filter(([, value]) => finite(value) != null)
    .map(([frame, value]) => `${frame}: ${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`).join(' · ');
  const direction = String(btc.trend1h).toLowerCase() === String(btc.trend4h).toLowerCase()
    ? `Hai khung cùng ${label(btc.trend1h).toLowerCase()}.`
    : 'Hai khung chưa đồng thuận; cần phân biệt nhịp ngắn hạn và xu hướng 4h.';
  return {
    version: LOCAL_AI_TREND_CHAT_VERSION, generatedAt: Date.now(), contextGeneratedAt: updatedAt,
    intent: 'BTC_TREND', observeOnly: true, binanceEligible: false, modelApplied: Boolean(assessment),
    fallbackReason, model: assessment ? null : 'BTC_CONTEXT_FALLBACK',
    answer: `${stale ? 'Snapshot BTC chưa xác minh được độ mới. ' : ''}BTC: 1h ${label(btc.trend1h)} · 4h ${label(btc.trend4h)}. ${direction}`
      + (finite(btc.price) > 0 ? ` Giá snapshot ${formatNumber(btc.price)} USDT.` : '')
      + (moves ? `\nBiến động: ${moves}.` : '')
      + (assessment ? `\nOllama diễn giải xu hướng hiện tại (${assessment.outlook}): ${clean(assessment.reason, 220)}\nKịch bản có điều kiện: ${clean(assessment.condition, 220)}` : ''),
    marketContext: `Nguồn BTC health${updatedAt ? ` · ${new Date(updatedAt).toISOString()}` : ' · thiếu thời điểm cập nhật'} · breadth ${context.breadth?.state ?? 'THIẾU DỮ LIỆU'}.`,
    coins: [], risks: stale ? ['Dữ liệu BTC cũ hoặc thiếu thời điểm; không kết luận xu hướng hiện tại.'] : [],
    limitations: fallbackReason ? fallbackExplanation(fallbackReason) : 'Nhận định có điều kiện từ snapshot BTC; không tạo giá mục tiêu ngoài dữ liệu.',
  };
}

export function extractRequestedMarketSymbols(question, availableSymbols = []) {
  const symbolByBase = new Map((availableSymbols ?? []).map((item) => {
    const symbol = String(item?.symbol ?? item ?? '').toUpperCase();
    return [symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol, symbol];
  }).filter(([base, symbol]) => base && symbol.endsWith('USDT') && symbol !== 'BTCUSDT'));
  const availableSet = new Set(symbolByBase.values());
  const tokens = String(question ?? '').match(/[\p{L}\p{N}]+/gu) ?? [];
  const found = [];
  for (const raw of tokens) {
    const token = raw.toUpperCase();
    if (!token.endsWith('USDT') && SYMBOL_QUERY_STOP_WORDS.has(token)) continue;
    const symbol = token.endsWith('USDT') ? token : symbolByBase.get(token);
    if (!symbol || symbol === 'BTCUSDT' || !availableSet.has(symbol) || found.includes(symbol)) continue;
    found.push(symbol);
    if (found.length >= 3) break;
  }
  return found;
}

function queryFeatureVector(question) {
  const value = String(question ?? '').toLowerCase();
  const has = (pattern) => pattern.test(value) ? 1 : 0;
  const longIntent = has(/\b(long|buy)\b|mạnh|tăng|hỗ trợ|support|hồi|bull/iu);
  const shortIntent = has(/\b(short|sell)\b|yếu|giảm|kháng cự|resistance|xả|bear/iu);
  return {
    longIntent,
    shortIntent,
    trend: has(/xu hướng|trend|mạnh|yếu|tăng|giảm/iu) || (!longIntent && !shortIntent ? 1 : .5),
    volume: has(/volume|khối lượng|dòng tiền|taker/iu),
    proximity: has(/entry|điểm vào|gần vùng|retest|chưa chạy|không đuổi/iu),
  };
}

function candidateFeatureScore(candidate, query) {
  const side = String(candidate.side ?? '').toUpperCase();
  const trendStrength = Math.min(1, Math.abs(finite(candidate.trendScore) ?? 0) / 30);
  const volume = Math.min(1, Math.log1p(Math.max(0, finite(candidate.volumeRatio15m ?? candidate.volumeRatio5m ?? candidate.originVolumeRatio) ?? 0)) / Math.log(6));
  const proximity = Math.max(0, 1 - Math.abs(finite(candidate.entryDistancePct) ?? 5) / 5);
  const sideFit = side === 'LONG' ? query.longIntent : query.shortIntent;
  const oppositePenalty = side === 'LONG' ? query.shortIntent : query.longIntent;
  return sideFit * 4 - oppositePenalty * 2 + query.trend * trendStrength * 2.2
    + query.volume * volume * 2 + query.proximity * proximity * 2.5
    + trendStrength + volume * .6 + proximity * .5;
}

function featureVectorRank(question, candidates) {
  const query = queryFeatureVector(question);
  return [...(candidates ?? [])]
    .map((candidate, index) => ({ candidate, index, score: candidateFeatureScore(candidate, query) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ candidate }) => candidate);
}

function candidateTrend(candidate = {}) {
  const frames = Object.values(candidate.frames ?? {}).map((value) => String(value).toUpperCase());
  const up = frames.filter((value) => value === 'UP').length;
  const down = frames.filter((value) => value === 'DOWN').length;
  if (up > down) return 'UP';
  if (down > up) return 'DOWN';
  const score = finite(candidate.trendScore);
  if (score != null && score >= 8) return 'UP';
  if (score != null && score <= -8) return 'DOWN';
  return frames.length ? 'MIXED' : 'UNCLEAR';
}

function candidateEntryText(candidate = {}) {
  const low = formatNumber(candidate.entryZone?.low);
  const high = formatNumber(candidate.entryZone?.high);
  const mid = formatNumber(candidate.entryZone?.mid);
  const zone = low && high ? `${low} – ${high}` : mid ?? 'chưa có vùng hợp lệ';
  const distance = finite(candidate.entryDistancePct);
  return `Vùng engine ${zone}${distance == null ? '' : ` · cách ${distance >= 0 ? '+' : ''}${distance.toFixed(2)}%`}`;
}

function buildFastAggregateAnswer(context, { fallbackReason = null } = {}) {
  const selected = (context.candidates ?? []).slice(0, 5);
  const coins = selected.map((candidate) => {
    const trend = candidateTrend(candidate);
    const strength = Math.abs(finite(candidate.trendScore) ?? 0);
    const volume = finite(candidate.volumeRatio15m ?? candidate.volumeRatio5m ?? candidate.originVolumeRatio);
    const frames = Object.entries(candidate.frames ?? {})
      .map(([interval, state]) => `${interval} ${state}`).join(' · ');
    return {
      symbol: candidate.symbol,
      side: ['LONG', 'SHORT'].includes(candidate.side) ? candidate.side : 'NEUTRAL',
      trend,
      clarity: Math.max(0, Math.min(100, Math.round(strength * 2.2))),
      entryContext: candidateEntryText(candidate),
      reason: `${frames || `trend score ${candidate.trendScore ?? '—'}`}`
        + `${volume == null ? '' : ` · volume ${volume.toFixed(2)}x`}`
        + ` · nguồn ${candidate.source ?? 'ENGINE'}`,
    };
  });
  const btc = context.btc ?? {};
  const answer = coins.length
    ? coins.map((coin, index) => `${index + 1}. ${coin.symbol} ${coin.side} · ${coin.trend} · ${coin.entryContext}`).join('\n')
    : 'Hiện engine chưa có candidate phù hợp với câu hỏi.';
  return {
    version: LOCAL_AI_TREND_CHAT_VERSION,
    generatedAt: Date.now(),
    contextGeneratedAt: context.generatedAt,
    observeOnly: true,
    binanceEligible: false,
    fastAggregate: true,
    fallbackReason,
    answer,
    marketContext: btc.ready
      ? `BTC 1h ${String(btc.trend1h).toUpperCase()} · 4h ${String(btc.trend4h).toUpperCase()} · xếp hạng theo dữ liệu causal hiện tại.`
      : 'BTC đang warm-up; danh sách chỉ là xếp hạng candidate hiện có.',
    coins,
    risks: ['Xếp hạng không phải xác suất thắng; cần chờ điều kiện entry của từng coin.'],
    limitations: fallbackReason
      ? fallbackExplanation(fallbackReason)
      : 'Trả lời nhanh từ feature-vector và engine định lượng; không gọi Ollama và không ra lệnh Binance.',
    model: fallbackReason ? 'QUANT_FEATURE_VECTOR_FALLBACK' : 'QUANT_FEATURE_VECTOR_ENGINE',
    usage: { promptEvalCount: 0, evalCount: 0, totalDurationMs: 0 },
  };
}

function compactZone(zone) {
  if (!zone || typeof zone !== 'object') return null;
  return {
    low: finite(zone.low), high: finite(zone.high), mid: finite(zone.mid),
    price: finite(zone.price), distancePct: finite(zone.distancePct),
    confidence: clean(zone.confidence, 16) || null,
    score: finite(zone.score), orderBookNotional: finite(zone.orderBookNotional),
    sources: (zone.sources ?? []).map((item) => clean(item, 48)).filter(Boolean).slice(0, 4),
  };
}

function compactOrderBookZone(zone) {
  if (!zone || typeof zone !== 'object') return null;
  return {
    layer: clean(zone.layer, 12) || null,
    side: clean(zone.side, 8) || null,
    low: finite(zone.low), high: finite(zone.high), mid: finite(zone.mid),
    distancePct: finite(zone.distancePct),
    distancePctLow: finite(zone.distancePctLow),
    distancePctHigh: finite(zone.distancePctHigh),
    orderBookNotional: finite(zone.orderBookNotional),
    levelCount: finite(zone.levelCount),
    source: clean(zone.source, 40) || null,
  };
}

function compactOrderBookProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const compactTotals = (value = {}) => ({
    bidNotional: finite(value.bidNotional),
    askNotional: finite(value.askNotional),
    bidLevelCount: finite(value.bidLevelCount),
    askLevelCount: finite(value.askLevelCount),
  });
  const compactCoverage = (value = {}) => ({
    levelCount: finite(value.levelCount),
    farthestDistancePct: finite(value.farthestDistancePct),
    reachesNearEdge: value.reachesNearEdge === true,
    reachesWideEdge: value.reachesWideEdge === true,
  });
  const compactLayer = (value = {}, maxZones) => ({
    minDistancePct: finite(value.minDistancePct),
    maxDistancePct: finite(value.maxDistancePct),
    bucketPct: finite(value.bucketPct),
    totals: compactTotals(value.totals),
    bidZones: (value.bidZones ?? []).map(compactOrderBookZone).filter(Boolean).slice(0, maxZones),
    askZones: (value.askZones ?? []).map(compactOrderBookZone).filter(Boolean).slice(0, maxZones),
  });
  return {
    version: clean(profile.version, 80) || null,
    source: clean(profile.source, 40) || 'BINANCE_FUTURES_DEPTH',
    requestedLimit: finite(profile.requestedLimit),
    totals: compactTotals(profile.totals),
    coverage: {
      bid: compactCoverage(profile.coverage?.bid),
      ask: compactCoverage(profile.coverage?.ask),
    },
    near: compactLayer(profile.near, 4),
    wide: compactLayer(profile.wide, 6),
    caveat: clean(profile.caveat, 220) || null,
  };
}

function compactSweepTarget(target) {
  if (!target || typeof target !== 'object') return null;
  return {
    side: clean(target.side, 16) || null,
    direction: clean(target.direction, 16) || null,
    price: finite(target.price), low: finite(target.low ?? target.bandLow),
    high: finite(target.high ?? target.bandHigh), mid: finite(target.mid),
    distancePct: finite(target.distancePct),
    distancePctLow: finite(target.distancePctLow),
    distancePctHigh: finite(target.distancePctHigh),
    strength: finite(target.strength), score: finite(target.score),
  };
}

function compactSweepLifecycle(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    state: clean(value.state, 40) || null,
    zone: compactSweepTarget(value.zone),
    sweepAt: finite(value.sweepAt),
    rejectAt: finite(value.rejectAt),
    confirmationAt: finite(value.confirmationAt),
  };
}

export function compactDirectCoinAnalysis(analysis = {}) {
  const recommendation = analysis.recommendation ?? {};
  const compactPlan = (plan = {}) => ({
    status: clean(plan.status, 24) || null,
    trigger: clean(plan.trigger, 240) || null,
    entryZone: compactZone(plan.entryZone),
    invalidation: finite(plan.invalidation),
    targets: (plan.targets ?? []).map(finite).filter((value) => value != null).slice(0, 3),
  });
  const hasSweepEvidence = (item) => item
    && (item.sweepAt != null || item.rejectAt != null || item.confirmationAt != null);
  const preferredLifecycle = (runtimeValue, snapshotValue) => {
    const runtime = compactSweepLifecycle(runtimeValue);
    const snapshot = compactSweepLifecycle(snapshotValue);
    return hasSweepEvidence(runtime) ? runtime
      : hasSweepEvidence(snapshot) ? snapshot : runtime ?? snapshot;
  };
  const sweepRejectShort = preferredLifecycle(
    analysis.liqScan?.sweepRejectShort,
    analysis.liqScan?.sweepRejectShortAtSnapshot,
  );
  const sweepRejectLong = preferredLifecycle(
    analysis.liqScan?.sweepRejectLong,
    analysis.liqScan?.sweepRejectLongAtSnapshot,
  );
  return {
    symbol: clean(analysis.symbol, 24).toUpperCase(),
    generatedAt: Date.parse(analysis.generatedAt) || null,
    stale: analysis.freshness?.stale === true,
    market: {
      markPrice: finite(analysis.market?.markPrice),
      change24hPct: finite(analysis.market?.change24hPct),
      range24hPct: finite(analysis.market?.range24hPct),
      quoteVolume24h: finite(analysis.market?.quoteVolume24h),
      fundingRatePct: finite(analysis.market?.fundingRatePct),
      openInterest: finite(analysis.market?.openInterest),
    },
    trend: {
      bias: clean(analysis.trend?.bias, 24),
      score: finite(analysis.trend?.score),
      frames: (analysis.trend?.frames ?? []).map((frame) => ({
        interval: clean(frame.interval, 8), state: clean(frame.state, 16), score: finite(frame.score),
        close: finite(frame.close), closeTime: finite(frame.closeTime), atrPct: finite(frame.atrPct),
      })).slice(0, 4),
    },
    recommendation: {
      bias: clean(recommendation.bias, 24),
      stance: clean(recommendation.stance, 48),
      headline: clean(recommendation.headline, 300),
      context: clean(recommendation.context, 32),
      lastClosed15m: finite(recommendation.confirmation?.lastClosed15m),
      longPlan: compactPlan(recommendation.longPlan),
      shortPlan: compactPlan(recommendation.shortPlan),
      warnings: (recommendation.warnings ?? []).map((item) => clean(item, 220)).filter(Boolean).slice(0, 4),
    },
    zones: {
      supports: (analysis.zones?.supports ?? []).slice(0, 2).map(compactZone),
      resistances: (analysis.zones?.resistances ?? []).slice(0, 2).map(compactZone),
    },
    orderBookProfile: compactOrderBookProfile(analysis.orderBookProfile),
    liqScan: analysis.liqScan ? {
      current: (analysis.liqScan.current ?? (analysis.liqScan.dominantSide ? analysis.liqScan : null)) ? {
        dominantSide: clean((analysis.liqScan.current ?? analysis.liqScan).dominantSide, 16),
        dominantPct: finite((analysis.liqScan.current ?? analysis.liqScan).dominantPct),
        imbalanceScore: finite((analysis.liqScan.current ?? analysis.liqScan).imbalanceScore),
        sweepTarget: compactSweepTarget((analysis.liqScan.current ?? analysis.liqScan).sweepTarget),
        mainKillZone: compactSweepTarget((analysis.liqScan.current ?? analysis.liqScan).killZoneCluster?.mainKillZone),
        farKillZone: compactSweepTarget((analysis.liqScan.current ?? analysis.liqScan).killZoneCluster?.farKillZone),
      } : null,
      sweepRejectShort,
      sweepRejectLong,
    } : null,
  };
}

function requestedSymbolKeys(question, candidates) {
  const upper = String(question ?? '').toUpperCase();
  return new Set((candidates ?? []).filter((candidate) => {
    const symbol = String(candidate.symbol ?? '').toUpperCase();
    if (symbol === 'BTCUSDT') return false;
    const base = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
    return upper.includes(symbol) || (base.length >= 2 && new RegExp(`(^|[^A-Z0-9])${escapeRegex(base)}([^A-Z0-9]|$)`).test(upper));
  }).map((candidate) => `${candidate.symbol}|${candidate.side}`));
}

export function buildLocalAiTrendChatContext({
  question,
  history = [],
  entrySnapshot = {},
  btcHealth = {},
  evaluation = null,
  directAnalyses = [],
  questionIntent = null,
  analysisMode = null,
} = {}) {
  const input = buildLocalAiTrendInput({ entrySnapshot, btcHealth, maxCandidates: 40 });
  const intent = questionIntent ?? resolveLocalAiChatIntent(question,
    [...input.candidates.map((item) => item.symbol), ...directAnalyses.map((item) => item.symbol)]);
  const mode = normalizeLocalAiChatMode(analysisMode);
  const requested = requestedSymbolKeys(question, input.candidates);
  const explicitSymbols = explicitUsdtSymbols(question);
  let candidates = requested.size
    ? input.candidates.filter((candidate) => requested.has(`${candidate.symbol}|${candidate.side}`))
    : featureVectorRank(question, input.candidates).slice(0, 12);
  if (!candidates.length) candidates = input.candidates.slice(0, 12);
  const directCoins = (Array.isArray(directAnalyses) ? directAnalyses : [])
    .map(compactDirectCoinAnalysis)
    .filter((item) => item.symbol);
  if (directCoins.length || intent === 'BTC_TREND') candidates = [];
  const safeHistory = (Array.isArray(history) ? history : []).slice(-6).map((message) => ({
    role: message?.role === 'assistant' ? 'assistant' : 'user',
    content: clean(message?.content, message?.role === 'assistant' ? 1_200 : 500),
  })).filter((message) => message.content);
  return {
    version: LOCAL_AI_TREND_CHAT_VERSION,
    generatedAt: input.generatedAt,
    observeOnly: true,
    intent,
    analysisMode: mode,
    question: clean(question, 500),
    history: intent === 'BTC_TREND' ? [] : safeHistory,
    btc: intent === 'BTC_TREND' ? {
      ...input.btc,
      ready: input.btc.ready && btcHealth.chatTrendReady !== false,
      price: finite(btcHealth.price), updatedAt: finite(btcHealth.updatedAt),
      return15mPct: finite(btcHealth.btcRelativeReturn15mPct),
      return1hPct: finite(btcHealth.btcRelativeReturn1hPct),
      rsi1h: finite(btcHealth.rsi1h), rsi4h: finite(btcHealth.rsi4h),
      pct6h: finite(btcHealth.pct6h), pct24h: finite(btcHealth.pct24h),
      fundingRate: finite(btcHealth.fundingRate),
    } : input.btc,
    breadth: input.breadth,
    latestEvaluation: evaluation && !directCoins.length && intent !== 'BTC_TREND' ? {
      evaluatedAt: finite(evaluation.evaluatedAt),
      marketRegime: clean(evaluation.marketRegime, 24),
      marketBias: clean(evaluation.marketBias, 24),
      marketScore: finite(evaluation.marketScore),
      summary: clean(evaluation.summary, 500),
      btcAssessment: clean(evaluation.btcAssessment, 400),
      warnings: (evaluation.warnings ?? []).map((item) => clean(item, 160)).filter(Boolean).slice(0, 4),
    } : null,
    retrieval: {
      mode: intent === 'BTC_TREND' ? 'BTC_HEALTH_ONLY' : directCoins.length ? 'EXACT_SYMBOL_COIN_LEVEL' : 'QUANT_FEATURE_VECTOR_TOP12',
      candidatePoolSize: input.candidates.length,
      selectedCount: directCoins.length || candidates.length,
    },
    directCoins,
    candidates,
    requestedSymbolsFound: [...new Set(candidates
      .filter((candidate) => requested.has(`${candidate.symbol}|${candidate.side}`))
      .map((candidate) => candidate.symbol)
      .concat(directCoins.map((coin) => coin.symbol)))],
    requestedSymbolsMissing: explicitSymbols.filter((symbol) => (
      !input.candidates.some((candidate) => candidate.symbol === symbol)
      && !directCoins.some((coin) => coin.symbol === symbol)
    )),
    rules: {
      closedDataOnly: true,
      noWinProbability: true,
      noInventedPrice: true,
      noBinanceAuthority: true,
      orderBookNearRangePct: '0–3%',
      orderBookWideRangePct: '3–20%',
      orderBookWideMustReportCoverage: true,
      candleTrendPrimaryOrderBookSecondary: true,
    },
  };
}

function chatSchema(context = {}) {
  if (context.intent === 'BTC_TREND') return {
    type: 'object', additionalProperties: false, required: ['outlook', 'reason', 'condition'],
    properties: {
      outlook: { type: 'string', enum: btcTrendOptions(context.btc) },
      reason: { type: 'string', maxLength: 220 },
      condition: { type: 'string', maxLength: 220 },
    },
  };
  const directSymbols = (context.directCoins ?? []).map((coin) => coin.symbol).filter(Boolean);
  if (directSymbols.length) {
    if (directSymbols.length === 1) {
      return {
        type: 'object',
        required: ['side', 'trend', 'clarity', 'reason'],
        properties: {
          side: { type: 'string', enum: ['LONG', 'SHORT', 'NEUTRAL'] },
          trend: { type: 'string', enum: ['UP', 'DOWN', 'MIXED', 'RANGE', 'UNCLEAR'] },
          clarity: { type: 'number', minimum: 0, maximum: 100 },
          reason: { type: 'string', maxLength: 100 },
        },
      };
    }
    return {
      type: 'object',
      required: ['assessments'],
      properties: {
        assessments: {
          type: 'array', minItems: 1, maxItems: directSymbols.length,
          items: {
            type: 'object',
            required: ['symbol', 'side', 'trend', 'clarity', 'reason'],
            properties: {
              symbol: { type: 'string', enum: directSymbols },
              side: { type: 'string', enum: ['LONG', 'SHORT', 'NEUTRAL'] },
              trend: { type: 'string', enum: ['UP', 'DOWN', 'MIXED', 'RANGE', 'UNCLEAR'] },
              clarity: { type: 'number', minimum: 0, maximum: 100 },
              reason: { type: 'string', maxLength: 120 },
            },
          },
        },
      },
    };
  }
  return {
    type: 'object',
    required: ['answer', 'marketContext', 'coins', 'risks', 'limitations'],
    properties: {
      answer: { type: 'string', maxLength: 1_200 },
      marketContext: { type: 'string', maxLength: 400 },
      coins: {
        type: 'array', maxItems: 5,
        items: {
          type: 'object',
          required: ['symbol', 'side', 'trend', 'clarity', 'entryContext', 'reason'],
          properties: {
            symbol: { type: 'string', maxLength: 24 },
            side: { type: 'string', enum: ['LONG', 'SHORT', 'NEUTRAL'] },
            trend: { type: 'string', enum: ['UP', 'DOWN', 'MIXED', 'RANGE', 'UNCLEAR'] },
            clarity: { type: 'number', minimum: 0, maximum: 100 },
            entryContext: { type: 'string', maxLength: 220 },
            reason: { type: 'string', maxLength: 260 },
          },
        },
      },
      risks: { type: 'array', items: { type: 'string', maxLength: 180 }, maxItems: 4 },
      limitations: { type: 'string', maxLength: 300 },
    },
  };
}

function normalizeChatResponse(raw = {}, context = {}) {
  const allowedSymbols = new Set([
    ...(context.candidates ?? []).map((candidate) => candidate.symbol),
    ...(context.directCoins ?? []).map((coin) => coin.symbol),
  ]);
  return {
    version: LOCAL_AI_TREND_CHAT_VERSION,
    generatedAt: Date.now(),
    contextGeneratedAt: context.generatedAt,
    observeOnly: true,
    binanceEligible: false,
    answer: clean(raw.answer, 1_200) || 'Chưa đủ dữ liệu để kết luận.',
    marketContext: clean(raw.marketContext, 400),
    coins: (Array.isArray(raw.coins) ? raw.coins : [])
      .filter((coin) => allowedSymbols.has(String(coin?.symbol ?? '').toUpperCase()))
      .slice(0, 5)
      .map((coin) => ({
        symbol: String(coin.symbol).toUpperCase(),
        side: ['LONG', 'SHORT', 'NEUTRAL'].includes(coin.side) ? coin.side : 'NEUTRAL',
        trend: ['UP', 'DOWN', 'MIXED', 'RANGE', 'UNCLEAR'].includes(coin.trend) ? coin.trend : 'UNCLEAR',
        clarity: Math.max(0, Math.min(100, finite(coin.clarity) ?? 0)),
        entryContext: clean(coin.entryContext, 220),
        reason: clean(coin.reason, 260),
      })),
    risks: (Array.isArray(raw.risks) ? raw.risks : []).map((item) => clean(item, 180)).filter(Boolean).slice(0, 4),
    limitations: clean(raw.limitations, 300) || 'Chỉ dùng snapshot hiện tại; không phải xác suất thắng hoặc tư vấn đặt lệnh.',
  };
}

function normalizeDirectChatResponse(raw = {}, context = {}) {
  const allowedSymbols = new Set((context.directCoins ?? []).map((coin) => coin.symbol));
  const assessments = context.directCoins.length === 1 && !Array.isArray(raw.assessments)
    ? [{ ...raw, symbol:context.directCoins[0].symbol }]
    : (Array.isArray(raw.assessments) ? raw.assessments : []);
  const coins = assessments
    .filter((coin) => allowedSymbols.has(String(coin?.symbol ?? '').toUpperCase()))
    .slice(0, context.directCoins.length)
    .map((coin) => ({
      symbol: String(coin.symbol).toUpperCase(),
      side: ['LONG', 'SHORT', 'NEUTRAL'].includes(coin.side) ? coin.side : 'NEUTRAL',
      trend: ['UP', 'DOWN', 'MIXED', 'RANGE', 'UNCLEAR'].includes(coin.trend) ? coin.trend : 'UNCLEAR',
      clarity: Math.max(0, Math.min(100, finite(coin.clarity) ?? 0)),
      entryContext: '',
      reason: clean(coin.reason, 120),
    }));
  return {
    version: LOCAL_AI_TREND_CHAT_VERSION,
    generatedAt: Date.now(),
    contextGeneratedAt: context.generatedAt,
    observeOnly: true,
    binanceEligible: false,
    answer: coins.length
      ? coins.map((coin) => `${coin.symbol}: ${coin.reason || `xu hướng ${coin.trend}`}`).join('\n')
      : 'Model chưa trả đánh giá hợp lệ cho coin được hỏi.',
    marketContext: '',
    coins,
    risks: [],
    limitations: 'Model chỉ đánh giá hướng/độ rõ; mọi giá và vùng do engine causal hiện tại cung cấp.',
  };
}

function formatNumber(value) {
  const parsed = finite(value);
  if (parsed == null) return null;
  if (Math.abs(parsed) >= 100) return parsed.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return Number(parsed.toPrecision(7)).toString();
}

function directTrendState(coin) {
  const bias = String(coin.trend?.bias ?? '').toUpperCase();
  if (bias.includes('BULL')) return 'UP';
  if (bias.includes('BEAR')) return 'DOWN';
  const states = (coin.trend?.frames ?? []).map((frame) => frame.state);
  const up = states.filter((state) => state === 'UP').length;
  const down = states.filter((state) => state === 'DOWN').length;
  if (up > down) return 'UP';
  if (down > up) return 'DOWN';
  return states.length ? 'MIXED' : 'UNCLEAR';
}

function directSide(coin) {
  const stance = String(coin.recommendation?.stance ?? '').toUpperCase();
  if (stance.includes('BEAR') || stance.includes('SHORT') || stance.includes('BREAKDOWN')) return 'SHORT';
  if (stance.includes('BULL') || stance.includes('LONG') || stance.includes('BREAKOUT')) return 'LONG';
  const bias = String(coin.recommendation?.bias ?? coin.trend?.bias ?? '').toUpperCase();
  if (bias.includes('BULL')) return 'LONG';
  if (bias.includes('BEAR')) return 'SHORT';
  return 'NEUTRAL';
}

function formatPlan(plan = {}) {
  const low = formatNumber(plan.entryZone?.low);
  const high = formatNumber(plan.entryZone?.high);
  const zone = low && high ? `${low} – ${high}` : 'chưa có vùng hợp lệ';
  return `${plan.status ?? 'WAIT'} · vùng ${zone}${plan.trigger ? ` · ${plan.trigger}` : ''}`;
}

function directZones(zones = []) {
  return (zones ?? []).map((zone) => ({
    low: finite(zone?.low),
    high: finite(zone?.high),
    mid: finite(zone?.mid),
    confidence: clean(zone?.confidence, 16) || null,
    distancePct: finite(zone?.distancePct),
    orderBookNotional: finite(zone?.orderBookNotional),
    sources: (zone?.sources ?? []).map((item) => clean(item, 48)).filter(Boolean).slice(0, 4),
  })).filter((zone) => zone.low != null || zone.high != null || zone.mid != null).slice(0, 2);
}

function directOrderBookZones(zones = [], limit = 6) {
  return (zones ?? []).map((zone) => ({
    layer: clean(zone?.layer, 12) || null,
    side: clean(zone?.side, 8) || null,
    low: finite(zone?.low), high: finite(zone?.high), mid: finite(zone?.mid),
    distancePct: finite(zone?.distancePct),
    distancePctLow: finite(zone?.distancePctLow),
    distancePctHigh: finite(zone?.distancePctHigh),
    orderBookNotional: finite(zone?.orderBookNotional),
    levelCount: finite(zone?.levelCount),
  })).filter((zone) => zone.mid != null && zone.orderBookNotional != null).slice(0, limit);
}

function directOrderBook(coin) {
  const profile = coin.orderBookProfile;
  if (!profile) {
    const bidZones = directZones(coin.zones?.supports).filter((zone) => (zone.orderBookNotional ?? 0) > 0);
    const askZones = directZones(coin.zones?.resistances).filter((zone) => (zone.orderBookNotional ?? 0) > 0);
    const sumNotional = (zones) => zones.reduce((sum, zone) => sum + (finite(zone.orderBookNotional) ?? 0), 0);
    return { source: 'BINANCE_FUTURES_DEPTH', legacy: true, bidZones, askZones,
      totals: { bidNotional: sumNotional(bidZones), askNotional: sumNotional(askZones) },
      near: { bidZones, askZones }, wide: { bidZones: [], askZones: [] }, coverage: null };
  }
  const near = {
    totals: profile.near?.totals,
    bidZones: directOrderBookZones(profile.near?.bidZones, 4),
    askZones: directOrderBookZones(profile.near?.askZones, 4),
  };
  const wide = {
    totals: profile.wide?.totals,
    bidZones: directOrderBookZones(profile.wide?.bidZones, 6),
    askZones: directOrderBookZones(profile.wide?.askZones, 6),
  };
  return {
    version: profile.version,
    source: profile.source || 'BINANCE_FUTURES_DEPTH',
    requestedLimit: profile.requestedLimit,
    totals: profile.totals,
    legacy: false,
    coverage: profile.coverage,
    near,
    wide,
    bidZones: near.bidZones,
    askZones: near.askZones,
    caveat: profile.caveat,
  };
}

function normalizedZoneBounds(zone) {
  const price = finite(zone?.price ?? zone?.mid);
  const low = finite(zone?.low) ?? price;
  const high = finite(zone?.high) ?? price;
  if (!(low > 0) || !(high > 0)) return null;
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

function zonesOverlap(first, second) {
  const a = normalizedZoneBounds(first);
  const b = normalizedZoneBounds(second);
  return Boolean(a && b && Math.max(a.low, b.low) <= Math.min(a.high, b.high));
}

function lifecycleLabel(direction, state) {
  const side = direction === 'UPPER' ? 'TRÊN' : 'DƯỚI';
  if (state === 'TOUCHING') return `ĐANG CHẠM VÙNG ${side}`;
  if (state === 'REJECTED_AFTER_SWEEP') return `VÙNG ${side} ĐÃ QUÉT + REJECT`;
  if (state === 'ACCEPTED_AFTER_SWEEP') return `VÙNG ${side} ĐÃ QUÉT · GIÁ ĐÃ GIỮ QUA`;
  if (state === 'SWEPT') return `VÙNG ${side} ĐÃ QUÉT`;
  return `VÙNG ${side} ĐANG HOẠT ĐỘNG`;
}

export function classifyLiquidityZoneLifecycle({
  direction,
  zone,
  markPrice,
  sweepRejectShort = null,
  sweepRejectLong = null,
} = {}) {
  const bounds = normalizedZoneBounds(zone);
  const mark = finite(markPrice);
  if (!direction || !bounds) {
    return { state: 'NO_ZONE', active: false, label: 'KHÔNG CÓ VÙNG HỢP LỆ', reason: 'Thiếu vùng LiqScan hợp lệ.' };
  }
  const trackedSweep = direction === 'UPPER' ? sweepRejectShort : sweepRejectLong;
  const hasTrackedSweep = zonesOverlap(zone, trackedSweep?.zone)
    && finite(trackedSweep?.sweepAt) != null;
  if (hasTrackedSweep) {
    const rejectedStates = direction === 'UPPER'
      ? ['REJECTED_WAIT_CONFIRMATION', 'WATCH_NO_CHASE', 'SHORT_SETUP_CONFIRMED', 'INVALIDATED']
      : ['REJECTED_WAIT_CONFIRMATION', 'WATCH_NO_CHASE', 'LONG_SETUP_CONFIRMED', 'INVALIDATED'];
    const rejected = finite(trackedSweep?.rejectAt) != null
      || finite(trackedSweep?.confirmationAt) != null
      || rejectedStates.includes(String(trackedSweep?.state ?? ''));
    const accepted = String(trackedSweep?.state ?? '') === 'CANCELLED_ACCEPTED';
    const state = rejected ? 'REJECTED_AFTER_SWEEP' : accepted ? 'ACCEPTED_AFTER_SWEEP' : 'SWEPT';
    return {
      state, active: false, label: lifecycleLabel(direction, state),
      reason: rejected
        ? `Vùng trùng với cảnh báo đã được giá quét và đóng trở lại ${direction === 'UPPER' ? 'dưới' : 'trên'} vùng; không còn là mục tiêu active.`
        : accepted
          ? 'Vùng đã bị quét và giá đã được chấp nhận phía bên kia; không còn là mục tiêu active.'
          : 'Vùng đã ghi nhận lần quét; chờ cụm thanh khoản mới thay vì tiếp tục dùng vùng cũ.',
      sweepAt: finite(trackedSweep?.sweepAt),
      rejectAt: finite(trackedSweep?.rejectAt),
      confirmationAt: finite(trackedSweep?.confirmationAt),
    };
  }
  if (mark == null) {
    return {
      state: 'ACTIVE_APPROACHING', active: true, label: lifecycleLabel(direction, 'ACTIVE_APPROACHING'),
      reason: 'Chưa có MARK hợp lệ để xác định giá đã chạm vùng hay chưa.',
    };
  }
  const touching = mark >= bounds.low && mark <= bounds.high;
  const passed = direction === 'UPPER' ? mark > bounds.high : mark < bounds.low;
  const state = passed ? 'SWEPT' : touching ? 'TOUCHING' : 'ACTIVE_APPROACHING';
  return {
    state, active: !passed, label: lifecycleLabel(direction, state),
    reason: passed
      ? `MARK đã đi hết qua biên ${direction === 'UPPER' ? 'trên' : 'dưới'} của vùng; vùng không còn là mục tiêu active.`
      : touching
        ? 'MARK đang nằm trong vùng; không mô tả vùng này là mục tiêu còn ở phía trước.'
        : 'Vùng vẫn nằm phía trước MARK và chưa có bằng chứng đã bị quét.',
  };
}

export function buildLiquidityScenario(coin) {
  const proxy = coin.liqScan?.current ?? null;
  const proxyDirection = proxy?.dominantSide === 'ABOVE' ? 'UPPER'
    : proxy?.dominantSide === 'BELOW' ? 'LOWER' : null;
  const rawMainKillZone = proxy?.mainKillZone ?? null;
  const rawFarKillZone = proxy?.farKillZone ?? null;
  const rawZone = rawMainKillZone ?? proxy?.sweepTarget ?? null;
  const zoneLifecycle = classifyLiquidityZoneLifecycle({
    direction: proxyDirection,
    zone: rawZone,
    markPrice: coin.market?.markPrice,
    sweepRejectShort: coin.liqScan?.sweepRejectShort,
    sweepRejectLong: coin.liqScan?.sweepRejectLong,
  });
  const farKillLifecycle = rawFarKillZone ? classifyLiquidityZoneLifecycle({
    direction: proxyDirection,
    zone: rawFarKillZone,
    markPrice: coin.market?.markPrice,
    sweepRejectShort: coin.liqScan?.sweepRejectShort,
    sweepRejectLong: coin.liqScan?.sweepRejectLong,
  }) : null;
  const likelyDirection = zoneLifecycle.active ? proxyDirection : null;
  const dominantPct = finite(proxy?.dominantPct);
  const confidence = likelyDirection
    ? dominantPct != null && dominantPct >= 70 ? 'HIGH' : 'MEDIUM'
    : 'LOW';
  const decoratedZone = rawZone ? {
    ...rawZone,
    lifecycleState: zoneLifecycle.state,
    lifecycleLabel: zoneLifecycle.label,
    active: zoneLifecycle.active,
  } : null;
  const mainKillZone = rawMainKillZone ? {
    ...rawMainKillZone,
    role: 'MAIN_KILL', direction: proxyDirection,
    lifecycleState: zoneLifecycle.state,
    lifecycleLabel: zoneLifecycle.label,
    active: zoneLifecycle.active,
  } : null;
  const farKillZone = rawFarKillZone ? {
    ...rawFarKillZone,
    role: 'FAR_KILL', direction: proxyDirection,
    lifecycleState: farKillLifecycle.state,
    lifecycleLabel: farKillLifecycle.label,
    active: farKillLifecycle.active,
  } : null;
  const upperZone = proxyDirection === 'UPPER' ? decoratedZone : null;
  const lowerZone = proxyDirection === 'LOWER' ? decoratedZone : null;
  const primaryTarget = likelyDirection === 'UPPER' ? upperZone
    : likelyDirection === 'LOWER' ? lowerZone : null;
  const trendDirection = directTrendState(coin);
  const counterTrend = (trendDirection === 'DOWN' && likelyDirection === 'UPPER')
    || (trendDirection === 'UP' && likelyDirection === 'LOWER');
  const aligned = (trendDirection === 'UP' && likelyDirection === 'UPPER')
    || (trendDirection === 'DOWN' && likelyDirection === 'LOWER');
  const combinedState = rawZone && !zoneLifecycle.active ? 'LIQUIDITY_ZONE_CONSUMED'
      : counterTrend ? 'COUNTER_TREND_LIQUIDITY_PULL'
      : aligned ? 'TREND_LIQUIDITY_ALIGNED' : 'UNCONFIRMED';
  const combinedHeadline = combinedState === 'LIQUIDITY_ZONE_CONSUMED'
      ? `${zoneLifecycle.label}. ${zoneLifecycle.reason}`
      : counterTrend
      ? `Xu hướng nến ${trendDirection}, lực hút thanh khoản nằm ngược hướng; có thể là nhịp quét/hồi, không phải đảo xu hướng đã xác nhận.`
      : aligned
        ? `Xu hướng nến ${trendDirection} và lực hút thanh khoản đang đồng hướng.`
        : `Xu hướng nến ${trendDirection}; thanh khoản chưa đủ đồng thuận để xác nhận đường đi.`;
  return {
    likelyDirection: likelyDirection ?? 'UNCLEAR', confidence,
    headline: combinedState === 'LIQUIDITY_ZONE_CONSUMED'
      ? `${zoneLifecycle.label}; không dùng vùng này làm mục tiêu quét tiếp theo.`
      : likelyDirection === 'UPPER' ? 'Lực hút thanh khoản Binance đang nghiêng lên vùng phía trên.'
        : likelyDirection === 'LOWER' ? 'Lực hút thanh khoản đang nghiêng xuống vùng phía dưới.'
          : 'Chưa đủ dữ liệu để chọn phía quét trước.',
    source: 'BINANCE_FUTURES_DEPTH_LIQSCAN',
    markPrice: finite(coin.market?.markPrice),
    proxyDirection, proxyDominantPct: dominantPct,
    coinglassUsed: false,
    coinglassDirection: null,
    coinglassDominancePct: null,
    upperZone, lowerZone, primaryTarget, zoneLifecycle,
    mainKillZone, farKillZone,
    trendDirection, combinedState, combinedHeadline,
    reasons: proxyDirection ? [
      `Binance Futures Depth/LiqScan dominant ${proxy.dominantSide}${dominantPct == null ? '' : ` ${dominantPct.toFixed(1)}%`}.`,
    ] : [],
  };
}

function buildDirectCoinAnswer(context, { fallbackReason = null, includeOrderBook = true } = {}) {
  const directCoins = context.directCoins ?? [];
  const coins = directCoins.map((coin) => {
    const side = directSide(coin);
    const trend = directTrendState(coin);
    const plan = side === 'SHORT' ? coin.recommendation.shortPlan : coin.recommendation.longPlan;
    const frames = (coin.trend.frames ?? []).map((frame) => `${frame.interval} ${frame.state}`).join(' · ');
    const clarity = Math.max(0, Math.min(100, Math.round(Math.abs(finite(coin.trend.score) ?? 0) * 2.2)));
    const orderBook = includeOrderBook ? directOrderBook(coin) : null;
    return {
      symbol: coin.symbol,
      side,
      trend,
      clarity,
      entryContext: formatPlan(plan),
      reason: `${coin.recommendation.headline || `Trend ${frames || 'chưa rõ'}`} · ${frames}`.slice(0, 260),
      supports: includeOrderBook ? directZones(coin.zones?.supports) : [],
      resistances: includeOrderBook ? directZones(coin.zones?.resistances) : [],
      orderBook,
      liquidityScenario: includeOrderBook ? buildLiquidityScenario(coin) : null,
    };
  });
  const summaries = directCoins.map((coin, index) => {
    const mark = formatNumber(coin.market?.markPrice);
    const change = finite(coin.market?.change24hPct);
    const frames = (coin.trend.frames ?? []).map((frame) => `${frame.interval} ${frame.state}`).join(', ');
    return `${coin.symbol}: ${coin.recommendation.headline || `xu hướng ${coins[index].trend}`}`
      + `${frames ? ` Khung đóng: ${frames}.` : ''}`
      + `${mark ? ` MARK ${mark}${change == null ? '' : `, 24h ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}.` : ''}`;
  });
  const risks = [...new Set(directCoins.flatMap((coin) => [
    ...(coin.recommendation.warnings ?? []),
    ...(includeOrderBook ? coin.liqScan?.direction?.reasons ?? [] : []),
  ]))].filter(Boolean).slice(0, 4);
  const btc = context.btc ?? {};
  return {
    version: LOCAL_AI_TREND_CHAT_VERSION,
    generatedAt: Date.now(),
    contextGeneratedAt: context.generatedAt,
    observeOnly: true,
    binanceEligible: false,
    analysisMode: context.analysisMode,
    directLookup: true,
    modelApplied: false,
    fallbackReason,
    answer: summaries.join('\n'),
    marketContext: btc.ready
      ? `BTC 1h ${String(btc.trend1h).toUpperCase()} · 4h ${String(btc.trend4h).toUpperCase()}; dùng làm bối cảnh, không chặn kết luận riêng của coin.`
      : 'BTC đang warm-up; kết luận coin vẫn lấy trực tiếp từ Coin Level.',
    coins,
    risks,
    limitations: !includeOrderBook
      ? 'Chế độ Coin Level nhanh: không gọi Ollama, không dùng order book/LiqScan và không ra lệnh Binance.'
      : context.analysisMode === LOCAL_AI_CHAT_MODES.DIRECT_ENGINE_BINANCE_ORDERBOOK
        ? 'Chế độ engine nhanh: dùng Coin Level và Binance Futures Depth/LiqScan để vẽ chart, không gọi Ollama và không ra lệnh Binance.'
      : fallbackReason
      ? 'Ollama không hoàn tất; trả lời dự phòng từ Coin Level và Binance Futures Depth/LiqScan. Không phải xác suất thắng và không ra lệnh Binance.'
      : 'Trả lời từ Coin Level causal hiện tại; không phải xác suất thắng và không ra lệnh Binance.',
    model: fallbackReason ? 'COIN_LEVEL_DIRECT_FALLBACK' : 'COIN_LEVEL_DIRECT_ENGINE',
    usage: { promptEvalCount: 0, evalCount: 0, totalDurationMs: 0 },
  };
}

function mergeDirectCoinDetails(modelAnswer, context) {
  const deterministic = buildDirectCoinAnswer(context);
  const modelCoins = new Map((modelAnswer.coins ?? []).map((coin) => [coin.symbol, coin]));
  const coins = deterministic.coins.map((base) => ({
    ...base,
    ...(modelCoins.get(base.symbol) ?? {}),
    entryContext: base.entryContext,
    supports: base.supports,
    resistances: base.resistances,
    orderBook: base.orderBook,
    liquidityScenario: base.liquidityScenario,
  }));
  return {
    ...modelAnswer,
    directLookup: true,
    modelApplied: true,
    coins,
    marketContext: modelAnswer.marketContext || deterministic.marketContext,
    risks: (modelAnswer.risks ?? []).length ? modelAnswer.risks : deterministic.risks,
  };
}

export class LocalAiTrendChat {
  constructor({ evaluator, timeoutMs = Number(process.env.LOCAL_AI_CHAT_TIMEOUT_MS ?? 60_000) } = {}) {
    if (!evaluator) throw new Error('LocalAiTrendChat requires evaluator');
    this.evaluator = evaluator;
    this.timeoutMs = Math.max(10_000, Math.min(Number(timeoutMs) || 60_000, evaluator.timeoutMs));
    this.inflight = false;
    this.inflightStartedAt = null;
  }

  snapshot() {
    const elapsedMs = this.inflight && this.inflightStartedAt
      ? Math.max(0, Date.now() - this.inflightStartedAt)
      : 0;
    return {
      version: LOCAL_AI_TREND_CHAT_VERSION,
      running: this.inflight,
      startedAt: this.inflightStartedAt,
      elapsedMs,
      timeoutMs: this.timeoutMs,
      observeOnly: true,
      binanceEligible: false,
    };
  }

  async ask(args = {}) {
    const question = clean(args.question, 500);
    const exactShortSymbol = question.length > 0 && question.length < 3
      && Array.isArray(args.directAnalyses) && args.directAnalyses.length > 0;
    if (question.length < 3 && !exactShortSymbol) {
      const error = new Error('Nhập câu hỏi hoặc đúng mã coin đang có trên Binance (mã ngắn 1–2 ký tự vẫn được hỗ trợ).');
      error.code = 'LOCAL_AI_CHAT_INVALID_QUESTION';
      throw error;
    }
    const context = buildLocalAiTrendChatContext({ ...args, question });
    if (!localAiChatModeUsesOllama(context.analysisMode)) {
      const startedAt = Date.now();
      const includeOrderBook = localAiChatModeUsesOrderBook(context.analysisMode);
      const directAnswer = context.directCoins.length
        ? buildDirectCoinAnswer(context, { includeOrderBook })
        : context.intent === 'BTC_TREND'
          ? buildBtcAnswer(context)
          : buildFastAggregateAnswer(context);
      return {
        ...directAnswer,
        analysisMode: context.analysisMode,
        model: context.directCoins.length
          ? includeOrderBook ? 'COIN_LEVEL_DIRECT_ORDER_BOOK_ENGINE_V1' : 'COIN_LEVEL_DIRECT_ENGINE_V2'
          : directAnswer.model,
        modelApplied: false,
        elapsedMs: Date.now() - startedAt,
        usage: { promptEvalCount: 0, evalCount: 0, totalDurationMs: Date.now() - startedAt },
      };
    }
    if (this.inflight) {
      const elapsedSeconds = this.inflightStartedAt
        ? Math.max(0, Math.round((Date.now() - this.inflightStartedAt) / 1_000))
        : 0;
      const maxSeconds = Math.round(this.timeoutMs / 1_000);
      const error = new Error(`AI đang xử lý câu hỏi tổng hợp trước (${elapsedSeconds}s/${maxSeconds}s tối đa). Vui lòng thử lại sau.`);
      error.code = 'LOCAL_AI_CHAT_BUSY';
      error.retryAfterMs = Math.max(1_000, this.timeoutMs - (elapsedSeconds * 1_000));
      throw error;
    }
    if (!context.btc.ready && !context.directCoins.length) {
      const error = new Error('BTC health đang warm-up; chờ đủ trend 1h/4h rồi hỏi lại.');
      error.code = 'LOCAL_AI_BTC_CONTEXT_NOT_READY';
      throw error;
    }
    this.inflight = true;
    this.inflightStartedAt = Date.now();
    try {
      const response = await this.evaluator.request('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.evaluator.model,
          stream: false,
          think: false,
          keep_alive: '10m',
          format: chatSchema(context),
          options: {
            temperature: 0.15,
            num_ctx: context.intent === 'BTC_TREND' || context.directCoins.length ? 2048 : 4096,
            num_predict: context.intent === 'BTC_TREND' ? 180 : context.directCoins.length
              ? context.directCoins.length === 1
                ? 64
                : Math.min(180, 90 + Math.max(0, context.directCoins.length - 2) * 45)
              : 400,
          },
          messages: [
            {
              role: 'system',
              content: context.intent === 'BTC_TREND'
                ? 'Chỉ phân tích BTC từ JSON hiện tại. Trả JSON tiếng Việt ngắn: outlook là xu hướng HIỆN TẠI của 1h/4h trong schema, reason giải thích từ dữ liệu BTC, condition là kịch bản tương lai có điều kiện. Không đổi xu hướng hiện tại thành dự báo. Không dùng điều kiện entry hoặc breadth của altcoin để đảo hướng BTC. Không liệt kê altcoin, không bịa mức giá hoặc dữ liệu thiếu. Mỗi câu dưới 30 từ.'
                : 'Bạn là chatbot phân tích xu hướng altcoin OBSERVE ONLY. Chỉ dùng context JSON, không bịa coin/giá, không khẳng định xác suất thắng và không ra lệnh Binance. Nếu có directCoins, dùng orderBookProfile NEAR 0–3% cho entry và WIDE 3–20% cho vùng hút xa; luôn đọc coverage, không suy diễn ngoài độ sâu Binance thực nhận. LiqScan là proxy riêng, không gọi là order book. Xu hướng nến đã đóng là lớp chính; order book Binance là lớp phụ có thể bị rút.',
            },
            {
              role: 'user',
              content: context.intent === 'BTC_TREND' ? JSON.stringify({ question, btc: context.btc }) : [
                'Trả lời tiếng Việt rõ, ngắn, nêu xu hướng, bằng chứng và rủi ro.',
                'Nếu có một directCoin thì JSON chỉ cần side/trend/clarity/reason; nếu có nhiều directCoins mới dùng assessments. Đánh giá từ nến 5m/15m/1h/4h, volume, vùng engine, orderBookProfile NEAR/WIDE và Binance LiqScan; mỗi lý do một câu thật ngắn. Không để WIDE hoặc LiqScan đảo xu hướng nến; chỉ mô tả lực hút/rủi ro.',
                'Nếu coin được hỏi không có trong directCoins hoặc candidates thì nói thiếu dữ liệu hiện tại.',
                'Giá/vùng entry chỉ được nhắc lại nếu có nguyên trong JSON; không tự tính TP/SL.',
                JSON.stringify(context),
              ].join('\n'),
            },
          ],
        }),
      }, this.timeoutMs);
      if (!response.ok) {
        const detail = await response.text();
        const error = new Error(`Ollama HTTP ${response.status}: ${detail.slice(0, 300)}`);
        error.code = 'LOCAL_AI_CHAT_OLLAMA_ERROR';
        throw error;
      }
      const payload = await response.json();
      let raw;
      try {
        raw = JSON.parse(payload.message?.content ?? payload.response ?? '{}');
      } catch {
        const error = new Error('Ollama không trả JSON chatbot hợp lệ.');
        error.code = 'LOCAL_AI_CHAT_INVALID_JSON';
        throw error;
      }
      if (context.intent === 'BTC_TREND') {
        const valid = ['UP', 'DOWN', 'MIXED', 'RANGE', 'UNCLEAR'].includes(raw?.outlook)
          && typeof raw.reason === 'string' && raw.reason.trim()
          && typeof raw.condition === 'string' && raw.condition.trim();
        const offTopic = explicitUsdtSymbols(JSON.stringify(raw)).some((symbol) => symbol !== 'BTCUSDT')
          || (Array.isArray(raw?.coins) && raw.coins.length > 0);
        if (!valid || offTopic) {
          const error = new Error('Kết quả BTC không hợp lệ hoặc chứa altcoin ngoài câu hỏi.');
          error.code = offTopic ? 'LOCAL_AI_CHAT_OFF_TOPIC' : 'LOCAL_AI_CHAT_INVALID_JSON';
          throw error;
        }
        if (!btcTrendOptions(context.btc).includes(raw.outlook)) {
          const error = new Error('Model đảo hướng BTC hiện tại trái dữ liệu 1h/4h.');
          error.code = 'LOCAL_AI_CHAT_INCONSISTENT_BTC';
          throw error;
        }
      }
      const normalized = {
        ...(context.intent === 'BTC_TREND' ? buildBtcAnswer(context, { assessment: raw }) : context.directCoins.length
          ? normalizeDirectChatResponse(raw, context)
          : normalizeChatResponse(raw, context)),
        analysisMode: context.analysisMode,
        model: payload.model ?? this.evaluator.model,
        modelApplied: true,
        elapsedMs: Date.now() - this.inflightStartedAt,
        usage: {
          promptEvalCount: finite(payload.prompt_eval_count),
          evalCount: finite(payload.eval_count),
          totalDurationMs: finite(payload.total_duration) == null
            ? null : Math.round(Number(payload.total_duration) / 1e6),
        },
      };
      return context.directCoins.length ? mergeDirectCoinDetails(normalized, context) : normalized;
    } catch (error) {
      const fallbackReason = ['AbortError', 'TimeoutError'].includes(error?.name)
          || /timed out|timeout|curl:\s*\(28\)/iu.test(String(error?.message ?? ''))
          ? 'OLLAMA_TIMEOUT'
          : error?.code === 'LOCAL_AI_CHAT_OFF_TOPIC' ? 'OLLAMA_OFF_TOPIC'
          : error?.code === 'LOCAL_AI_CHAT_INCONSISTENT_BTC' ? 'OLLAMA_INCONSISTENT_BTC'
          : error?.code === 'LOCAL_AI_CHAT_INVALID_JSON'
            ? 'OLLAMA_INVALID_JSON'
            : 'OLLAMA_UNAVAILABLE';
      console.warn(`[LocalAiTrendChat] ${fallbackReason}: ${String(error?.message ?? error).slice(0, 300)}`);
      const fallback = context.intent === 'BTC_TREND'
        ? buildBtcAnswer(context, { fallbackReason }) : context.directCoins.length
        ? buildDirectCoinAnswer(context, { fallbackReason })
        : buildFastAggregateAnswer(context, { fallbackReason });
      const elapsedMs = Date.now() - this.inflightStartedAt;
      return { ...fallback, analysisMode: context.analysisMode, modelApplied: false, elapsedMs,
        limitations: fallbackExplanation(fallbackReason),
        usage: { promptEvalCount: null, evalCount: null, totalDurationMs: elapsedMs } };
    } finally {
      this.inflight = false;
      this.inflightStartedAt = null;
    }
  }
}
