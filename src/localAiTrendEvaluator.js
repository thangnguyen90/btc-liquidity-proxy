import { spawn } from 'node:child_process';

export const LOCAL_AI_TREND_EVALUATOR_VERSION =
  'LOCAL_AI_TREND_EVALUATOR_V3_TOP10_OVERALL_20261001';
export const LOCAL_AI_OBSERVE_QUALIFICATION_VERSION =
  'LOCAL_AI_OBSERVE_QUALIFICATION_V1_SIX_CHECKS_20260930';
export const LOCAL_AI_OLLAMA_WATCHDOG_VERSION =
  'LOCAL_AI_OLLAMA_WATCHDOG_V1_WINDOWS_SERVE_RECOVERY_20260930';
export const LOCAL_AI_DETERMINISTIC_FALLBACK_VERSION =
  'LOCAL_AI_DETERMINISTIC_FALLBACK_V2_TOP10_NO_BINANCE_20261001';
export const LOCAL_AI_TREND_INFERENCE_PROFILE_VERSION =
  'LOCAL_AI_TREND_INFERENCE_PROFILE_V3_INDEXED_RATINGS_20261001';

const VERDICTS = new Set(['PRIORITY', 'WATCH', 'WAIT', 'AVOID']);
const HORIZONS = new Set(['15m', '1h', '4h']);
const PATHS = new Set(['CONTINUATION', 'RETEST', 'RANGE', 'REVERSAL', 'UNCLEAR']);
const MARKET_REGIMES = new Set(['SW_UP', 'SW_DOWN', 'UP_STRONG', 'DOWN_STRONG', 'RANGE', 'UNCLEAR']);
const MARKET_BIASES = new Set(['LONG_BIAS', 'SHORT_BIAS', 'NEUTRAL']);

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max, fallback = min) => {
  const parsed = finite(value);
  return parsed == null ? fallback : Math.max(min, Math.min(max, parsed));
};
const cleanText = (value, max = 280) => String(value ?? '').trim().slice(0, max);
const cleanList = (value, maxItems = 4, maxLength = 180) => (
  Array.isArray(value)
    ? value.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : []
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function shouldFallbackToWindowsOllama(error) {
  const name = String(error?.name ?? '').toUpperCase();
  const code = String(error?.code ?? error?.cause?.code ?? '').toUpperCase();
  // A timed-out inference reached Ollama successfully. Retrying the same large
  // request through curl only doubles the wait and keeps the chatbot lock held.
  if (['ABORTERROR', 'TIMEOUTERROR'].includes(name)) return false;
  if (['ABORT_ERR', 'UND_ERR_ABORTED', 'ETIMEDOUT'].includes(code)) return false;
  return true;
}

function startDetachedOllama(executable) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref?.();
      resolve();
    });
  });
}

function candidateKey(candidate = {}) {
  return `${String(candidate.symbol ?? '').toUpperCase()}|${String(candidate.side ?? '').toUpperCase()}`;
}

function compactTargetPlan(plan = {}) {
  return {
    model: cleanText(plan.model, 80) || null,
    probabilityCalibrated: plan.probabilityCalibrated === true,
    targets: (Array.isArray(plan.targets) ? plan.targets : []).slice(0, 3).map((target) => ({
      label: cleanText(target.label, 12),
      price: finite(target.price),
      movePct: finite(target.movePct),
      structural: target.structural === true,
    })),
  };
}

function compactCandidate(candidate = {}, source = 'UNKNOWN') {
  const side = String(candidate.side ?? '').toUpperCase();
  const symbol = String(candidate.symbol ?? '').toUpperCase();
  if (!symbol.endsWith('USDT') || symbol === 'BTCUSDT' || !['LONG', 'SHORT'].includes(side)) return null;
  const zone = candidate.entryZone ?? {};
  return {
    symbol,
    side,
    source,
    closedAt: finite(candidate.lastClosed5mAt ?? candidate.retestAt ?? candidate.confirmationAt),
    trendScore: finite(candidate.currentTrendScore ?? candidate.score),
    entryScore: finite(candidate.entryScore ?? candidate.earlyScore),
    entryTier: cleanText(candidate.entryTier ?? candidate.entryTierLabel, 32) || null,
    frames: candidate.currentFrames && typeof candidate.currentFrames === 'object'
      ? {
          m5: cleanText(candidate.currentFrames['5m'], 12),
          m15: cleanText(candidate.currentFrames['15m'], 12),
          h1: cleanText(candidate.currentFrames['1h'], 12),
          h4: cleanText(candidate.currentFrames['4h'], 12),
        }
      : null,
    livePrice: finite(candidate.livePrice ?? candidate.lastClosed5m ?? candidate.entryPrice),
    livePriceSource: cleanText(candidate.livePriceSource, 32) || 'CLOSED_CANDLE',
    entryZone: {
      low: finite(zone.low ?? candidate.entryZoneLow),
      high: finite(zone.high ?? candidate.entryZoneHigh),
      mid: finite(zone.mid ?? candidate.entryPrice ?? candidate.referenceLevel),
    },
    entryDistancePct: finite(candidate.entryDistancePct ?? candidate.entryScoreMetrics?.retestDistancePct),
    invalidationPrice: finite(candidate.invalidationPrice),
    originVolumeRatio: finite(candidate.originVolumeRatio ?? candidate.entryScoreMetrics?.breakoutVolumeRatio),
    volumeRatio5m: finite(candidate.currentVolumeRatio5m ?? candidate.volumeRatio),
    volumeRatio15m: finite(candidate.currentVolumeRatio15m),
    takerBuyPct5m: finite(candidate.lastTakerBuyPct ?? candidate.takerBuyPct),
    move5mPct: finite(candidate.last5mMovePct),
    move15mPct: finite(candidate.recentMovePct15m),
    move1hPct: finite(candidate.recentMovePct1h),
    targetPlan: compactTargetPlan(candidate.targetPlan),
  };
}

function deterministicRank(candidate) {
  const sourceBonus = candidate.source === 'CLOSED_RETEST' ? 300
    : candidate.source === 'VERY_STRONG_POOL' ? 180 : 80;
  const trend = Math.abs(finite(candidate.trendScore) ?? 0) * 3;
  const entry = (finite(candidate.entryScore) ?? 0) * 1.5;
  const volume = Math.min(12, finite(candidate.volumeRatio15m ?? candidate.volumeRatio5m
    ?? candidate.originVolumeRatio) ?? 0) * 8;
  const distance = Math.max(0, 30 - Math.abs(finite(candidate.entryDistancePct) ?? 5) * 8);
  return sourceBonus + trend + entry + volume + distance;
}

export function buildLocalAiTrendInput({ entrySnapshot = {}, btcHealth = {}, maxCandidates = 10 } = {}) {
  const raw = [
    ...(entrySnapshot.candidates ?? []).map((item) => compactCandidate(item, 'CLOSED_RETEST')),
    ...(entrySnapshot.veryStrongTrendPool?.records ?? [])
      .filter((item) => item?.active !== false && item?.trendState !== 'DATA_STALE')
      .map((item) => compactCandidate(item, 'VERY_STRONG_POOL')),
    ...(entrySnapshot.earlyLongWatches ?? []).map((item) => compactCandidate({ ...item, side: 'LONG' }, 'EARLY_WATCH')),
    ...(entrySnapshot.earlyShortWatches ?? []).map((item) => compactCandidate({ ...item, side: 'SHORT' }, 'EARLY_WATCH')),
  ].filter(Boolean);
  const deduped = new Map();
  for (const candidate of raw) {
    const key = candidateKey(candidate);
    const existing = deduped.get(key);
    if (!existing || deterministicRank(candidate) > deterministicRank(existing)) deduped.set(key, candidate);
  }
  const ranked = [...deduped.values()]
    .sort((left, right) => deterministicRank(right) - deterministicRank(left));
  const limit = Math.max(1, Math.min(40, Number(maxCandidates) || 10));
  // The screen is an overall ranking, not a LONG/SHORT comparison. Do not
  // reserve half of the slots for either direction: the strongest ten causal
  // engine rows win, even when all ten point the same way.
  const candidates = ranked.slice(0, limit);
  const regime = entrySnapshot.marketRegime ?? {};
  return {
    version: LOCAL_AI_TREND_EVALUATOR_VERSION,
    generatedAt: finite(entrySnapshot.generatedAt) ?? Date.now(),
    observeOnly: true,
    instructions: {
      useClosedDataOnly: true,
      rankingIsNotWinProbability: true,
      doNotInventEntryOrTargets: true,
      doNotPlaceOrders: true,
    },
    btc: {
      ready: btcHealth.seeding !== true
        && ['up', 'down', 'flat'].includes(String(btcHealth.btcTrendDir ?? '').toLowerCase())
        && ['up', 'down', 'flat'].includes(String(btcHealth.btcTrendDir4h ?? '').toLowerCase()),
      price: finite(btcHealth.price),
      trend1h: cleanText(btcHealth.btcTrendDir, 16) || null,
      trendScore1h: finite(btcHealth.btcTrendScore),
      trend4h: cleanText(btcHealth.btcTrendDir4h, 16) || null,
      trendScore4h: finite(btcHealth.btcTrendScore4h),
      emaTrend1h: cleanText(btcHealth.emaTrend1h, 16) || null,
      return15mPct: finite(btcHealth.btcRelativeReturn15mPct),
      return1hPct: finite(btcHealth.btcRelativeReturn1hPct),
      pct6h: finite(btcHealth.pct6h),
      pct24h: finite(btcHealth.pct24h),
      rsi1h: finite(btcHealth.rsi1h),
      rsi4h: finite(btcHealth.rsi4h),
      fundingRate: finite(btcHealth.fundingRate),
      updatedAt: finite(btcHealth.updatedAt),
    },
    breadth: {
      state: cleanText(regime.state, 32) || 'WAIT_DATA',
      shockLabel: cleanText(regime.shockLabel, 32) || null,
      context15m: cleanText(regime.metrics?.context15m, 16) || null,
      context30m: cleanText(regime.metrics?.context30m, 16) || null,
      upCount: finite(regime.metrics?.upCount),
      downCount: finite(regime.metrics?.downCount),
      takerBuyRatio: finite(regime.metrics?.takerBuyRatio),
      reasons: cleanList(regime.reasons, 4, 160),
    },
    candidates,
  };
}

export function buildLocalAiTrendSchema(input = {}) {
  const candidates = (input.candidates ?? []).slice(0, 10);
  const candidateCount = candidates.length;
  const commonRequired = ['marketRegime', 'marketBias', 'marketScore', 'ratings'];
  const properties = {
    marketRegime: { type: 'string', enum: [...MARKET_REGIMES] },
    marketBias: { type: 'string', enum: [...MARKET_BIASES] },
    marketScore: { type: 'number', minimum: 0, maximum: 100 },
    ratings: {
      type: 'array',
      minItems: candidateCount,
      maxItems: candidateCount,
      items: {
        type: 'object',
        required: ['v', 's', 'p'],
        properties: {
          v: { type: 'string', enum: [...VERDICTS] },
          s: { type: 'number', minimum: 0, maximum: 100 },
          p: { type: 'string', enum: [...PATHS] },
        },
      },
    },
  };
  return { type: 'object', required: commonRequired, properties };
}

function compactPromptInput(input = {}) {
  return {
    version: input.version,
    btc: input.btc,
    breadth: input.breadth,
    candidates: (input.candidates ?? []).slice(0, 10).map((candidate, index) => ({
      i: index,
      symbol: candidate.symbol,
      side: candidate.side,
      source: candidate.source,
      trendScore: candidate.trendScore,
      entryScore: candidate.entryScore,
      entryTier: candidate.entryTier,
      frames: candidate.frames,
      entryDistancePct: candidate.entryDistancePct,
      originVolumeRatio: candidate.originVolumeRatio,
      volumeRatio5m: candidate.volumeRatio5m,
      volumeRatio15m: candidate.volumeRatio15m,
      takerBuyPct5m: candidate.takerBuyPct5m,
      move5mPct: candidate.move5mPct,
      move15mPct: candidate.move15mPct,
      move1hPct: candidate.move1hPct,
    })),
  };
}

function promptFor(input) {
  const candidateCount = Math.min(10, input.candidates?.length ?? 0);
  return [
    'Bạn là lớp đánh giá xu hướng OBSERVE ONLY cho thị trường Binance Futures.',
    'Chỉ dùng JSON dữ liệu được cung cấp. Không suy diễn dữ liệu ngoài, không dùng tương lai, PnL hay outcome.',
    'Điểm strength chỉ là xếp hạng độ rõ của bối cảnh, KHÔNG phải xác suất thắng.',
    'Không tạo giá entry/TP/SL. Server sẽ ghép vùng và bằng chứng engine sau khi model trả lời.',
    `Mảng ratings phải có đúng ${candidateCount} phần tử và giữ NGUYÊN thứ tự index i của candidates.`,
    'Mỗi rating chỉ có v=verdict, s=strength, p=path. Không lặp symbol/side, không giải thích bằng text.',
    'Đây là TOP tổng thể, không chia quota và không bắt buộc cân bằng LONG/SHORT.',
    'Phân biệt SW_UP, SW_DOWN, UP_STRONG, DOWN_STRONG, RANGE và UNCLEAR bằng BTC + breadth.',
    'Trả đúng JSON Schema compact.',
    JSON.stringify(compactPromptInput(input)),
  ].join('\n');
}

function inferredHorizon(candidate = {}) {
  if (candidate.source === 'CLOSED_RETEST') return '15m';
  const expected = candidate.side === 'SHORT' ? 'DOWN' : 'UP';
  return String(candidate.frames?.h4 ?? '').toUpperCase() === expected ? '4h' : '1h';
}

function compactRatingEvidence(candidate = {}, raw = {}, input = {}) {
  const entry = finite(candidate.entryScore);
  const trend = finite(candidate.trendScore);
  const volume = finite(candidate.volumeRatio15m ?? candidate.volumeRatio5m ?? candidate.originVolumeRatio);
  const reasonBits = [candidate.source || 'ENGINE'];
  if (entry != null) reasonBits.push(`entry ${Number(entry.toFixed(1))}`);
  if (trend != null) reasonBits.push(`trend ${Number(trend.toFixed(1))}`);
  if (volume != null) reasonBits.push(`volume ${Number(volume.toFixed(2))}x`);
  const side = String(candidate.side ?? '').toUpperCase();
  const bias = MARKET_BIASES.has(raw.marketBias) ? raw.marketBias : 'NEUTRAL';
  const breadth = String(input.breadth?.state ?? 'UNKNOWN').toUpperCase();
  const conflicts = side === 'LONG'
    ? bias === 'SHORT_BIAS' || breadth === 'RISK_OFF'
    : bias === 'LONG_BIAS';
  return {
    reasons: [reasonBits.join(' · ')],
    risks: conflicts ? [`Bối cảnh ${bias}/${breadth} xung đột hướng`] : [],
  };
}

export function buildLocalAiObserveQualification({ item = {}, deterministic = {}, raw = {}, input = {} } = {}) {
  const side = String(deterministic.side ?? item.side ?? '').toUpperCase();
  const livePrice = finite(deterministic.livePrice);
  const zoneLow = finite(deterministic.entryZone?.low);
  const zoneHigh = finite(deterministic.entryZone?.high);
  const invalidationPrice = finite(deterministic.invalidationPrice);
  const marketBias = MARKET_BIASES.has(raw.marketBias) ? raw.marketBias : 'NEUTRAL';
  const marketRegime = MARKET_REGIMES.has(raw.marketRegime) ? raw.marketRegime : 'UNCLEAR';
  const breadthState = String(input.breadth?.state ?? '').toUpperCase();
  const shockLabel = String(input.breadth?.shockLabel ?? '').toUpperCase();
  const verdictPassed = item.verdict === 'PRIORITY';
  const strengthPassed = (finite(item.strength) ?? 0) >= 65;
  const pathPassed = ['RETEST', 'CONTINUATION'].includes(item.path);
  const inEntryZone = livePrice != null && zoneLow != null && zoneHigh != null
    && livePrice >= Math.min(zoneLow, zoneHigh) && livePrice <= Math.max(zoneLow, zoneHigh);
  const strongContextConflict = side === 'LONG'
    ? marketBias === 'SHORT_BIAS'
      || marketRegime === 'DOWN_STRONG'
      || breadthState === 'RISK_OFF'
      || ['DUMP_WATCH', 'DANGER'].includes(shockLabel)
    : marketBias === 'LONG_BIAS'
      || marketRegime === 'UP_STRONG'
      || ['PUMP_WATCH', 'PUMP_DANGER'].includes(shockLabel);
  const structureValid = livePrice != null && invalidationPrice != null
    && (side === 'LONG' ? livePrice > invalidationPrice : livePrice < invalidationPrice);
  const criteria = [
    { key: 'priority', label: 'AI trả PRIORITY', passed: verdictPassed },
    { key: 'strength', label: 'Độ rõ ≥65/100', passed: strengthPassed },
    { key: 'path', label: 'Đường đi RETEST/CONTINUATION', passed: pathPassed },
    { key: 'entry_zone', label: 'Giá live trong vùng engine', passed: inEntryZone },
    { key: 'context', label: 'Không xung đột mạnh BTC/breadth', passed: !strongContextConflict },
    { key: 'structure', label: 'Chưa chạm mốc vô hiệu', passed: structureValid },
  ];
  const passedCount = criteria.filter((criterion) => criterion.passed).length;
  const passed = passedCount === criteria.length;
  return {
    version: LOCAL_AI_OBSERVE_QUALIFICATION_VERSION,
    observeOnly: true,
    binanceEligible: false,
    passed,
    passedCount,
    totalCount: criteria.length,
    criteria,
    missing: criteria.filter((criterion) => !criterion.passed).map((criterion) => criterion.label),
  };
}

export function normalizeLocalAiTrendEvaluation(raw = {}, input = {}, meta = {}) {
  const byKey = new Map((input.candidates ?? []).map((candidate) => [candidateKey(candidate), candidate]));
  const seen = new Set();
  const candidates = [];
  const indexedRatings = (Array.isArray(raw.ratings) ? raw.ratings : []).map((rating, index) => {
    const deterministic = input.candidates?.[index];
    if (!deterministic) return null;
    const evidence = compactRatingEvidence(deterministic, raw, input);
    return {
      symbol: deterministic.symbol,
      side: deterministic.side,
      verdict: rating?.v,
      strength: rating?.s,
      horizon: inferredHorizon(deterministic),
      path: rating?.p,
      ...evidence,
    };
  }).filter(Boolean);
  const modelCandidates = [
    raw.longCandidate,
    raw.shortCandidate,
    ...(Array.isArray(raw.candidates) ? raw.candidates : []),
    ...indexedRatings,
  ].filter(Boolean);
  for (const item of modelCandidates) {
    const key = candidateKey(item);
    const deterministic = byKey.get(key);
    if (!deterministic || seen.has(key)) continue;
    seen.add(key);
    const qualification = buildLocalAiObserveQualification({ item, deterministic, raw, input });
    candidates.push({
      symbol: deterministic.symbol,
      side: deterministic.side,
      verdict: VERDICTS.has(item.verdict) ? item.verdict : 'WAIT',
      strength: Number(clamp(item.strength, 0, 100, 0).toFixed(1)),
      horizon: HORIZONS.has(item.horizon) ? item.horizon : '1h',
      path: PATHS.has(item.path) ? item.path : 'UNCLEAR',
      reasons: cleanList(item.reasons, 2, 120),
      risks: cleanList(item.risks, 2, 120),
      deterministic,
      qualification,
    });
  }
  candidates.sort((left, right) => right.strength - left.strength);
  return {
    version: LOCAL_AI_TREND_EVALUATOR_VERSION,
    model: cleanText(meta.model, 80),
    evaluatedAt: Date.now(),
    inputGeneratedAt: finite(input.generatedAt),
    observeOnly: true,
    binanceEligible: false,
    priorityZoneExecutionEligible: candidates.some((candidate) => candidate.verdict === 'PRIORITY'),
    rankingIsNotProbability: true,
    marketRegime: MARKET_REGIMES.has(raw.marketRegime) ? raw.marketRegime : 'UNCLEAR',
    marketBias: MARKET_BIASES.has(raw.marketBias) ? raw.marketBias : 'NEUTRAL',
    marketScore: Number(clamp(raw.marketScore, 0, 100, 0).toFixed(1)),
    summary: cleanText(raw.summary, 600)
      || `AI compact: ${MARKET_REGIMES.has(raw.marketRegime) ? raw.marketRegime : 'UNCLEAR'} · ${MARKET_BIASES.has(raw.marketBias) ? raw.marketBias : 'NEUTRAL'}.`,
    btcAssessment: cleanText(raw.btcAssessment, 500)
      || `BTC 1h ${String(input.btc?.trend1h ?? '—').toUpperCase()} · 4h ${String(input.btc?.trend4h ?? '—').toUpperCase()} · breadth ${String(input.breadth?.state ?? '—').toUpperCase()}.`,
    warnings: cleanList(raw.warnings, 3, 120),
    btc: input.btc,
    breadth: input.breadth,
    candidates,
    usage: meta.usage ?? null,
  };
}

function deterministicMarketContext(input = {}) {
  const trend1h = String(input.btc?.trend1h ?? '').toLowerCase();
  const trend4h = String(input.btc?.trend4h ?? '').toLowerCase();
  const return15mPct = finite(input.btc?.return15mPct) ?? 0;
  const return1hPct = finite(input.btc?.return1hPct) ?? 0;
  const breadthState = String(input.breadth?.state ?? '').toUpperCase();
  const shockLabel = String(input.breadth?.shockLabel ?? '').toUpperCase();
  const bothUp = trend1h === 'up' && trend4h === 'up';
  const bothDown = trend1h === 'down' && trend4h === 'down';
  let marketRegime = 'RANGE';
  if (bothUp) marketRegime = return15mPct >= 0.25 || return1hPct >= 0.55 ? 'UP_STRONG' : 'SW_UP';
  else if (bothDown) marketRegime = return15mPct <= -0.25 || return1hPct <= -0.55 ? 'DOWN_STRONG' : 'SW_DOWN';
  else if (return1hPct >= 0.2 || (trend1h === 'up' && return15mPct >= 0)) marketRegime = 'SW_UP';
  else if (return1hPct <= -0.2 || (trend1h === 'down' && return15mPct <= 0)) marketRegime = 'SW_DOWN';

  let marketBias = ['UP_STRONG', 'SW_UP'].includes(marketRegime) ? 'LONG_BIAS'
    : ['DOWN_STRONG', 'SW_DOWN'].includes(marketRegime) ? 'SHORT_BIAS' : 'NEUTRAL';
  if (breadthState === 'RISK_OFF' || ['DUMP_WATCH', 'DANGER'].includes(shockLabel)) marketBias = 'SHORT_BIAS';
  else if (['RECOVERY', 'RECOVERY_TEST'].includes(breadthState)
    && !['DOWN_STRONG'].includes(marketRegime)) marketBias = 'LONG_BIAS';

  const trendAgreement = bothUp || bothDown ? 20 : trend1h && trend4h ? 8 : 0;
  const momentumClarity = Math.min(25, Math.abs(return15mPct) * 35 + Math.abs(return1hPct) * 18);
  const breadthClarity = breadthState && breadthState !== 'WAIT_DATA' ? 12 : 0;
  const marketScore = Number(clamp(35 + trendAgreement + momentumClarity + breadthClarity, 0, 100, 35).toFixed(1));
  return { marketRegime, marketBias, marketScore, trend1h, trend4h, return15mPct, return1hPct, breadthState, shockLabel };
}

function deterministicFallbackCandidate(candidate = {}, market = {}) {
  const side = String(candidate.side ?? '').toUpperCase();
  const entryScore = clamp(candidate.entryScore, 0, 100, 50);
  const trendScore = Math.min(40, Math.abs(finite(candidate.trendScore) ?? 0));
  const volumeRatio = Math.min(5, finite(candidate.volumeRatio15m ?? candidate.volumeRatio5m
    ?? candidate.originVolumeRatio) ?? 0);
  const entryDistancePct = Math.abs(finite(candidate.entryDistancePct) ?? 5);
  const sourceBonus = candidate.source === 'CLOSED_RETEST' ? 8
    : candidate.source === 'VERY_STRONG_POOL' ? 4 : 0;
  const distanceBonus = Math.max(0, 10 - entryDistancePct * 4);
  const strength = Number(clamp(
    entryScore * 0.55 + trendScore * 0.55 + volumeRatio * 3 + distanceBonus + sourceBonus,
    0,
    100,
    0,
  ).toFixed(1));
  const expectedFrame = side === 'LONG' ? 'UP' : 'DOWN';
  const alignedFrames = Object.values(candidate.frames ?? {})
    .filter((frame) => String(frame ?? '').toUpperCase() === expectedFrame).length;
  const path = candidate.source === 'CLOSED_RETEST' || entryDistancePct <= 1.2
    ? 'RETEST' : alignedFrames >= 3 ? 'CONTINUATION' : 'UNCLEAR';
  const strongContextConflict = side === 'LONG'
    ? market.marketBias === 'SHORT_BIAS' || market.marketRegime === 'DOWN_STRONG'
      || market.breadthState === 'RISK_OFF' || ['DUMP_WATCH', 'DANGER'].includes(market.shockLabel)
    : market.marketBias === 'LONG_BIAS' || market.marketRegime === 'UP_STRONG'
      || ['PUMP_WATCH', 'PUMP_DANGER'].includes(market.shockLabel);
  const structuralSource = candidate.source === 'CLOSED_RETEST' || entryScore >= 72;
  const verdict = strength >= 65 && structuralSource && path !== 'UNCLEAR' && !strongContextConflict
    ? 'PRIORITY' : strength >= 52 ? 'WATCH' : 'WAIT';
  const horizon = candidate.source === 'CLOSED_RETEST' ? '15m'
    : String(candidate.frames?.h4 ?? '').toUpperCase() === expectedFrame ? '4h' : '1h';
  const scoreReason = `Engine ${candidate.source}: entry ${Number(entryScore.toFixed(1))}, trend ${Number(trendScore.toFixed(1))}`;
  const volumeReason = volumeRatio > 0 ? `Volume causal ${Number(volumeRatio.toFixed(2))}x` : 'Volume chưa đủ dữ liệu';
  const risks = ['Ollama lỗi; kết quả dùng engine định lượng, không phải nhận định model'];
  if (strongContextConflict) risks.push(`Xung đột bối cảnh ${market.marketRegime}/${market.breadthState || 'UNKNOWN'}`);
  return {
    symbol: candidate.symbol,
    side,
    verdict,
    strength,
    horizon,
    path,
    reasons: [scoreReason, volumeReason],
    risks: risks.slice(0, 2),
  };
}

export function buildLocalAiDeterministicFallbackEvaluation(input = {}, {
  reasonCode = 'OLLAMA_UNAVAILABLE',
  reason = 'Ollama không sẵn sàng.',
} = {}) {
  const market = deterministicMarketContext(input);
  const ranked = (input.candidates ?? []).map((candidate) => ({
    candidate,
    item: deterministicFallbackCandidate(candidate, market),
  })).sort((left, right) => right.item.strength - left.item.strength).slice(0, 10);
  const raw = {
    marketRegime: market.marketRegime,
    marketBias: market.marketBias,
    marketScore: market.marketScore,
    summary: `Ollama chưa chạy được; dùng xếp hạng causal từ ${input.candidates?.length ?? 0} candidate engine hiện tại.`,
    btcAssessment: `BTC 1h ${String(input.btc?.trend1h ?? '—').toUpperCase()} · 4h ${String(input.btc?.trend4h ?? '—').toUpperCase()} · ${market.marketRegime}.`,
    warnings: [
      'DETERMINISTIC FALLBACK: không phải kết quả sinh bởi Ollama.',
      'Fallback chỉ gửi Discord quan sát và không cấp quyền Binance.',
    ],
    candidates: ranked.map((row) => row.item),
  };
  const normalized = normalizeLocalAiTrendEvaluation(raw, input, {
    model: LOCAL_AI_DETERMINISTIC_FALLBACK_VERSION,
    usage: { source: 'DETERMINISTIC_CAUSAL_ENGINE', totalDurationMs: 0 },
  });
  return {
    ...normalized,
    modelApplied: false,
    deterministicFallback: true,
    priorityZoneExecutionEligible: false,
    fallback: {
      active: true,
      version: LOCAL_AI_DETERMINISTIC_FALLBACK_VERSION,
      reasonCode: cleanText(reasonCode, 80) || 'OLLAMA_UNAVAILABLE',
      reason: cleanText(reason, 280) || 'Ollama không sẵn sàng.',
      binanceEligible: false,
    },
  };
}

export class LocalAiTrendEvaluator {
  constructor({
    fetchImpl = globalThis.fetch,
    baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    model = process.env.OLLAMA_TREND_MODEL ?? 'qwen3:8b',
    cacheMs = Number(process.env.LOCAL_AI_TREND_CACHE_MS ?? 5 * 60_000),
    timeoutMs = Number(process.env.LOCAL_AI_TREND_TIMEOUT_MS ?? 180_000),
    numCtx = Number(process.env.LOCAL_AI_TREND_NUM_CTX ?? 4_096),
    numPredict = Number(process.env.LOCAL_AI_TREND_NUM_PREDICT ?? 384),
    numBatch = Number(process.env.LOCAL_AI_TREND_NUM_BATCH ?? 128),
    ollamaExecutable = process.env.LOCAL_AI_WINDOWS_OLLAMA_EXE
      ?? '/mnt/c/Users/admin/AppData/Local/Programs/Ollama/ollama.exe',
    serviceStarter = null,
    serviceStartCooldownMs = Number(process.env.LOCAL_AI_OLLAMA_RESTART_COOLDOWN_MS ?? 60_000),
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.model = model;
    this.cacheMs = Math.max(30_000, cacheMs);
    this.timeoutMs = Math.max(10_000, timeoutMs);
    this.numCtx = Math.max(2_048, Math.min(8_192, Math.trunc(Number(numCtx) || 4_096)));
    this.numPredict = Math.max(192, Math.min(900, Math.trunc(Number(numPredict) || 384)));
    this.numBatch = Math.max(32, Math.min(512, Math.trunc(Number(numBatch) || 128)));
    this.cache = null;
    this.inflight = null;
    this.transport = 'auto';
    this.windowsCurl = process.env.LOCAL_AI_WINDOWS_CURL
      ?? '/mnt/c/Windows/System32/curl.exe';
    this.ollamaExecutable = ollamaExecutable;
    this.serviceStarter = serviceStarter ?? (() => startDetachedOllama(this.ollamaExecutable));
    this.serviceStartCooldownMs = Math.max(0, serviceStartCooldownMs);
    this.lastServiceStartAttemptAt = 0;
    this.serviceStartPromise = null;
    this.lastInferenceFailure = null;
  }

  async request(path, init = {}, timeoutMs = this.timeoutMs) {
    if (this.transport !== 'windows-curl') {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          ...init,
          signal: AbortSignal.timeout(timeoutMs),
        });
        this.transport = 'local-http';
        return response;
      } catch (error) {
        if (process.platform !== 'linux'
          || process.env.LOCAL_AI_WINDOWS_OLLAMA_BRIDGE === 'false'
          || !shouldFallbackToWindowsOllama(error)) throw error;
        this.transport = 'windows-curl';
      }
    }
    return await new Promise((resolve, reject) => {
      const method = String(init.method ?? 'GET').toUpperCase();
      const marker = '\n__OLLAMA_HTTP_STATUS__';
      const args = [
        '-sS', '--max-time', String(Math.max(1, Math.ceil(timeoutMs / 1000))),
        '-X', method, '-w', `${marker}%{http_code}`,
      ];
      if (init.body != null) args.push('-H', 'content-type: application/json', '--data-binary', '@-');
      args.push(`http://127.0.0.1:11434${path}`);
      const child = spawn(this.windowsCurl, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => {
        const markerAt = stdout.lastIndexOf(marker);
        const content = markerAt >= 0 ? stdout.slice(0, markerAt) : stdout;
        const status = markerAt >= 0 ? Number(stdout.slice(markerAt + marker.length)) : 0;
        if (code !== 0 && status === 0) {
          reject(new Error(stderr.trim() || `Windows Ollama bridge exit ${code}`));
          return;
        }
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: async () => JSON.parse(content || '{}'),
          text: async () => content,
        });
      });
      child.stdin.end(init.body ?? '');
    });
  }

  snapshot() {
    return {
      version: LOCAL_AI_TREND_EVALUATOR_VERSION,
      model: this.model,
      baseUrl: this.baseUrl.replace(/:\/\/[^/]+/, '://local-ollama'),
      transport: this.transport,
      observeOnly: true,
      binanceEligible: false,
      running: Boolean(this.inflight),
      watchdogVersion: LOCAL_AI_OLLAMA_WATCHDOG_VERSION,
      lastServiceStartAttemptAt: this.lastServiceStartAttemptAt || null,
      evaluation: this.cache?.evaluation ?? null,
      cacheExpiresAt: this.cache?.expiresAt ?? null,
      lastInferenceFailure: this.lastInferenceFailure,
      inferenceProfile: {
        version: LOCAL_AI_TREND_INFERENCE_PROFILE_VERSION,
        numCtx: this.numCtx,
        numPredict: this.numPredict,
        numBatch: this.numBatch,
        timeoutMs: this.timeoutMs,
      },
    };
  }

  async health() {
    try {
      const response = await this.request('/api/tags', {}, 3_000);
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const data = await response.json();
      const models = (data.models ?? []).map((item) => item.name ?? item.model).filter(Boolean);
      return { online: true, modelReady: models.some((name) => String(name).startsWith(this.model)), models };
    } catch (error) {
      return { online: false, modelReady: false, models: [], error: error.message };
    }
  }

  async ensureAvailable({ startupWaitMs = 12_000, pollMs = 1_000 } = {}) {
    const current = await this.health();
    if (current.online && current.modelReady) return { ...current, restarted: false };
    if (this.serviceStartPromise) return this.serviceStartPromise;
    const now = Date.now();
    if (now - this.lastServiceStartAttemptAt < this.serviceStartCooldownMs) {
      return { ...current, restarted: false, restartCooldown: true };
    }
    this.lastServiceStartAttemptAt = now;
    this.serviceStartPromise = (async () => {
      try {
        await this.serviceStarter();
      } catch (error) {
        return { ...current, restarted: false, restartError: error.message };
      }
      const deadline = Date.now() + Math.max(1_000, startupWaitMs);
      let latest = current;
      while (Date.now() < deadline) {
        await delay(Math.max(100, pollMs));
        latest = await this.health();
        if (latest.online && latest.modelReady) {
          return { ...latest, restarted: true, watchdogVersion: LOCAL_AI_OLLAMA_WATCHDOG_VERSION };
        }
      }
      return { ...latest, restarted: false, restartError: latest.error ?? 'OLLAMA_START_TIMEOUT' };
    })();
    try {
      return await this.serviceStartPromise;
    } finally {
      this.serviceStartPromise = null;
    }
  }

  async evaluate({ entrySnapshot, btcHealth, force = false } = {}) {
    if (!force && this.cache?.evaluation && Date.now() < this.cache.expiresAt) {
      return { ...this.cache.evaluation, cached: true };
    }
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const input = buildLocalAiTrendInput({ entrySnapshot, btcHealth });
      if (!input.btc.ready) {
        const error = new Error('BTC health đang warm-up; chờ đủ trend 1h/4h rồi đánh giá lại.');
        error.code = 'LOCAL_AI_BTC_CONTEXT_NOT_READY';
        throw error;
      }
      if (!input.candidates.length) {
        const error = new Error('Chưa có candidate causal để AI đánh giá.');
        error.code = 'LOCAL_AI_NO_CANDIDATES';
        throw error;
      }
      const response = await this.request('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          think: false,
          keep_alive: '10m',
          format: buildLocalAiTrendSchema(input),
          options: {
            temperature: 0.1,
            num_ctx: this.numCtx,
            num_predict: this.numPredict,
            num_batch: this.numBatch,
          },
          messages: [
            { role: 'system', content: 'Phân tích định lượng thận trọng. Không đặt lệnh, không bịa giá.' },
            { role: 'user', content: promptFor(input) },
          ],
        }),
      }, this.timeoutMs);
      if (!response.ok) {
        const detail = await response.text();
        const error = new Error(`Ollama HTTP ${response.status}: ${detail.slice(0, 300)}`);
        error.code = 'LOCAL_AI_OLLAMA_ERROR';
        throw error;
      }
      const payload = await response.json();
      let raw;
      try {
        raw = JSON.parse(payload.message?.content ?? payload.response ?? '{}');
      } catch {
        const error = new Error('Ollama không trả JSON hợp lệ.');
        error.code = 'LOCAL_AI_INVALID_JSON';
        throw error;
      }
      const evaluation = normalizeLocalAiTrendEvaluation(raw, input, {
        model: payload.model ?? this.model,
        usage: {
          inferenceProfile: LOCAL_AI_TREND_INFERENCE_PROFILE_VERSION,
          numCtx: this.numCtx,
          numPredict: this.numPredict,
          numBatch: this.numBatch,
          promptEvalCount: finite(payload.prompt_eval_count),
          evalCount: finite(payload.eval_count),
          totalDurationMs: finite(payload.total_duration) == null ? null : Math.round(Number(payload.total_duration) / 1e6),
        },
      });
      this.lastInferenceFailure = null;
      this.cache = { evaluation, expiresAt: Date.now() + this.cacheMs };
      return { ...evaluation, cached: false };
    })();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  async evaluateResilient({ entrySnapshot, btcHealth, force = false, ollamaHealth = null } = {}) {
    const input = buildLocalAiTrendInput({ entrySnapshot, btcHealth });
    if (!input.btc.ready) {
      const error = new Error('BTC health đang warm-up; chờ đủ trend 1h/4h rồi đánh giá lại.');
      error.code = 'LOCAL_AI_BTC_CONTEXT_NOT_READY';
      throw error;
    }
    if (!input.candidates.length) {
      const error = new Error('Chưa có candidate causal để AI đánh giá.');
      error.code = 'LOCAL_AI_NO_CANDIDATES';
      throw error;
    }
    const skipModel = ollamaHealth && (!ollamaHealth.online || !ollamaHealth.modelReady);
    if (!skipModel) {
      try {
        return await this.evaluate({ entrySnapshot, btcHealth, force });
      } catch (error) {
        if (['LOCAL_AI_BTC_CONTEXT_NOT_READY', 'LOCAL_AI_NO_CANDIDATES'].includes(error.code)) throw error;
        this.lastInferenceFailure = {
          at: Date.now(), code: cleanText(error.code, 80) || 'OLLAMA_INFERENCE_FAILED',
          message: cleanText(error.message, 400),
        };
      }
    } else {
      this.lastInferenceFailure = {
        at: Date.now(), code: 'LOCAL_AI_MODEL_NOT_READY',
        message: cleanText(ollamaHealth.error, 400) || `Ollama/model ${this.model} chưa sẵn sàng.`,
      };
    }
    const fallback = buildLocalAiDeterministicFallbackEvaluation(input, {
      reasonCode: this.lastInferenceFailure.code,
      reason: this.lastInferenceFailure.message,
    });
    this.cache = { evaluation: fallback, expiresAt: Date.now() + this.cacheMs };
    return { ...fallback, cached: false };
  }
}
