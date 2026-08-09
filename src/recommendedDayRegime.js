const DAY_REGIME_TIME_ZONE = "Asia/Bangkok";
const DAY_REGIME_BUCKET_MS = 15 * 60_000;
const DAY_REGIME_WINDOW_BUCKETS = 3;
const DAY_REGIME_DIRECTION_THRESHOLD = 2.5;
const DAY_REGIME_MIN_AVAILABLE_VOTES = 4;
const DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: DAY_REGIME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const RECOMMENDED_DAY_REGIME_VERSION =
  "RECOMMENDED_DAY_REGIME_V1_20260729";
export const RECOMMENDED_DAY_SELECTION_VERSION =
  "RECOMMENDED_DAY_SELECTION_V1_20260729";

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalized(value) {
  return String(value ?? "").trim().toUpperCase();
}

function timestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function entryTimeMs(trade = {}) {
  return timestampMs(
    trade?.clonedAt ?? trade?.openedAt ?? trade?.createdAt ?? "",
  );
}

function snapshotTimeMs(trade = {}) {
  const parsed = timestampMs(
    trade?.btcHealth?.at ??
      trade?.marketDirectionAtSignal?.evaluatedAt ??
      trade?.clonedAt ??
      trade?.openedAt ??
      trade?.createdAt ??
      "",
  );
  return parsed || entryTimeMs(trade);
}

function localDayKey(timestampMs) {
  if (!timestampMs) return null;
  const parts = DAY_KEY_FORMATTER.formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return values.year && values.month && values.day
    ? `${values.year}-${values.month}-${values.day}`
    : null;
}

function directionalVote(value, longValues, shortValues) {
  const item = normalized(value);
  if (longValues.includes(item)) return 1;
  if (shortValues.includes(item)) return -1;
  return null;
}

function numericDirection(value) {
  const parsed = finiteNumber(value);
  if (parsed == null || parsed === 0) return null;
  return parsed > 0 ? 1 : -1;
}

export function recommendedDayRegimeVoteSnapshot(trade = {}) {
  const health = trade?.btcHealth && typeof trade.btcHealth === "object"
    ? trade.btcHealth
    : {};
  const votes = {
    btcTrend: directionalVote(
      health?.btcTrendDir ?? trade?.btcTrendDir,
      ["UP", "LONG", "BULLISH"],
      ["DOWN", "SHORT", "BEARISH"],
    ),
    ema1h: directionalVote(
      health?.emaTrend1h,
      ["ABOVE", "UP", "BULLISH"],
      ["BELOW", "DOWN", "BEARISH"],
    ),
    pct6h: numericDirection(health?.pct6h ?? trade?.btcPct6h),
    obv: directionalVote(
      health?.obvTrend,
      ["RISING", "UP", "BULLISH"],
      ["FALLING", "DOWN", "BEARISH"],
    ),
    btcTrend4h: directionalVote(
      health?.btcTrendDir4h,
      ["UP", "LONG", "BULLISH"],
      ["DOWN", "SHORT", "BEARISH"],
    ),
    pct24h: numericDirection(health?.pct24h),
    marketRegime: directionalVote(
      String(health?.marketRegime ?? "").includes("UP")
        ? "UP"
        : String(health?.marketRegime ?? "").includes("DOWN")
          ? "DOWN"
          : null,
      ["UP"],
      ["DOWN"],
    ),
  };
  const available = Object.values(votes).filter(
    (vote) => vote === 1 || vote === -1,
  );
  const rawScore = available.reduce((sum, vote) => sum + vote, 0);
  return {
    rawScore,
    availableVotes: available.length,
    longVotes: available.filter((vote) => vote > 0).length,
    shortVotes: available.filter((vote) => vote < 0).length,
    components: votes,
    snapshotAt: snapshotTimeMs(trade) || null,
  };
}

function priorBucketSamples(trade, priorTrades = []) {
  const currentAt = snapshotTimeMs(trade);
  const currentDay = localDayKey(currentAt);
  const buckets = new Map();
  for (const prior of priorTrades) {
    const priorAt = snapshotTimeMs(prior);
    if (!priorAt || !currentAt || priorAt > currentAt) continue;
    if (localDayKey(priorAt) !== currentDay) continue;
    const existing = prior?.recommendedDayRegimeAtEntry;
    const vote = existing?.input && typeof existing.input === "object"
      ? {
          rawScore: finiteNumber(existing.input.rawScore),
          availableVotes: finiteNumber(existing.input.availableVotes),
        }
      : recommendedDayRegimeVoteSnapshot(prior);
    if (
      vote.rawScore == null ||
      (vote.availableVotes ?? 0) < DAY_REGIME_MIN_AVAILABLE_VOTES
    ) continue;
    buckets.set(
      Math.floor(priorAt / DAY_REGIME_BUCKET_MS) * DAY_REGIME_BUCKET_MS,
      vote.rawScore,
    );
  }
  return buckets;
}

export function buildRecommendedDayRegimeSnapshot(
  trade = {},
  priorTrades = [],
  evaluatedAt = Date.now(),
) {
  const buckets = priorBucketSamples(trade, priorTrades);
  return buildRecommendedDayRegimeSnapshotFromBuckets(
    trade,
    buckets,
    evaluatedAt,
  );
}

function buildRecommendedDayRegimeSnapshotFromBuckets(
  trade,
  buckets,
  evaluatedAt,
) {
  const input = recommendedDayRegimeVoteSnapshot(trade);
  const currentAt = input.snapshotAt || entryTimeMs(trade) || evaluatedAt;
  const dayKey = localDayKey(currentAt);
  if (input.availableVotes >= DAY_REGIME_MIN_AVAILABLE_VOTES) {
    buckets.set(
      Math.floor(currentAt / DAY_REGIME_BUCKET_MS) * DAY_REGIME_BUCKET_MS,
      input.rawScore,
    );
  }
  const samples = [...buckets.entries()]
    .filter(([bucketAt]) => bucketAt <= currentAt)
    .sort((left, right) => left[0] - right[0])
    .slice(-DAY_REGIME_WINDOW_BUCKETS);
  const scores = samples.map(([, score]) => score);
  const smoothedScore = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : null;
  const requiredPersistence = Math.min(2, scores.length);
  const persistentLong =
    requiredPersistence > 0 &&
    scores.filter((score) => score > 0).length >= requiredPersistence;
  const persistentShort =
    requiredPersistence > 0 &&
    scores.filter((score) => score < 0).length >= requiredPersistence;
  let label = "DAY_NO_DATA";
  let direction = "NO_DATA";
  if (
    input.availableVotes >= DAY_REGIME_MIN_AVAILABLE_VOTES &&
    smoothedScore != null
  ) {
    if (
      smoothedScore >= DAY_REGIME_DIRECTION_THRESHOLD &&
      persistentLong
    ) {
      label = "DAY_LONG";
      direction = "LONG";
    } else if (
      smoothedScore <= -DAY_REGIME_DIRECTION_THRESHOLD &&
      persistentShort
    ) {
      label = "DAY_SHORT";
      direction = "SHORT";
    } else {
      label = "DAY_MIXED";
      direction = "MIXED";
    }
  }
  const confidenceBase = input.availableVotes
    ? Math.abs(smoothedScore ?? 0) / input.availableVotes
    : 0;
  const confidence = Math.max(
    0,
    Math.min(100, Math.round(confidenceBase * 100)),
  );
  const reasons = label === "DAY_NO_DATA"
    ? [`Chỉ có ${input.availableVotes}/7 phiếu BTC tại entry; cần ít nhất 4.`]
    : [
        `${input.longVotes} phiếu LONG / ${input.shortVotes} phiếu SHORT tại entry.`,
        `Điểm thô ${input.rawScore >= 0 ? "+" : ""}${input.rawScore}; làm mượt ${scores.length} nhịp = ${smoothedScore >= 0 ? "+" : ""}${smoothedScore.toFixed(2)}.`,
      ];
  return {
    version: RECOMMENDED_DAY_REGIME_VERSION,
    label,
    direction,
    confidence,
    evaluatedAt,
    snapshotAt: currentAt,
    localDay: dayKey,
    timezone: DAY_REGIME_TIME_ZONE,
    bucketMinutes: DAY_REGIME_BUCKET_MS / 60_000,
    windowBuckets: DAY_REGIME_WINDOW_BUCKETS,
    threshold: DAY_REGIME_DIRECTION_THRESHOLD,
    sampleCount: scores.length,
    provisional: scores.length < 2,
    smoothedScore,
    sampleScores: scores,
    sampleBuckets: samples.map(([bucketAt]) => bucketAt),
    input,
    reasons,
    observationOnly: true,
    affectsOrders: false,
  };
}

export function classifyRecommendedDaySelection(trade = {}, dayRegime = null) {
  const regime = dayRegime ?? trade?.recommendedDayRegimeAtEntry ?? null;
  const state = normalized(regime?.direction);
  const side = normalized(trade?.side);
  const strength = normalized(
    trade?.recommendationStrengthAtEntry ?? trade?.recommendationStrength,
  );
  let key = "REC_DAY_WATCH";
  let label = "DAY WATCH";
  let tier = "WATCH";
  let reason = `Recommendation ${strength || "NO DATA"}; chưa thuộc nhóm STRONG đã backtest.`;

  if (!regime || state === "NO_DATA" || state === "") {
    key = "REC_DAY_NO_DATA";
    label = "DAY NO DATA";
    reason = "Thiếu tối thiểu 4/7 phiếu BTC tại entry.";
  } else if (strength === "STRONG" && side === "SHORT") {
    if (state === "LONG") {
      key = "STRONG_SHORT_DAY_LONG_REVERSAL";
      label = "SHORT REVERSAL · DAY LONG";
      tier = "WATCH";
      reason = "STRONG SHORT ngược DAY LONG; nhóm đảo chiều vẫn dương trong backtest, chỉ quan sát riêng.";
    } else if (state === "SHORT") {
      key = "STRONG_SHORT_DAY_SHORT_CORE";
      label = "SHORT CORE · DAY SHORT";
      tier = "GOOD";
      reason = "STRONG SHORT thuận DAY SHORT; nhóm core theo xu hướng ngày.";
    } else {
      key = "STRONG_SHORT_DAY_MIXED_CORE";
      label = "SHORT CORE · DAY MIXED";
      tier = "GOOD";
      reason = "STRONG SHORT trong DAY MIXED; nhóm có PF tốt trong backtest sơ bộ.";
    }
  } else if (strength === "STRONG" && side === "LONG") {
    if (state === "MIXED") {
      key = "STRONG_LONG_DAY_MIXED_EDGE";
      label = "LONG MIXED EDGE";
      tier = "GOOD";
      reason = "STRONG LONG trong DAY MIXED/transition; nhóm LONG duy nhất giữ edge trong backtest sơ bộ.";
    } else {
      key = "STRONG_LONG_DIRECTIONAL_RISK";
      label = "LONG DIRECTIONAL RISK";
      tier = "RISK";
      reason = `STRONG LONG trong ${regime.label}; nhóm LONG directional âm trong backtest sơ bộ.`;
    }
  }

  return {
    version: RECOMMENDED_DAY_SELECTION_VERSION,
    key,
    label,
    tier,
    side: side || "NO_DATA",
    strength: strength || "NO_DATA",
    dayRegime: regime?.label ?? "DAY_NO_DATA",
    dayDirection: state || "NO_DATA",
    reason: `${reason} OBSERVE ONLY · không gate/chặn/đổi size.`,
    observationOnly: true,
    affectsOrders: false,
  };
}

export function decorateRecommendedDayRegimeSnapshots(trades = []) {
  const chronological = [...trades].sort(
    (left, right) => entryTimeMs(left) - entryTimeMs(right),
  );
  const bucketsByDay = new Map();
  const decoratedById = new Map();
  for (const trade of chronological) {
    const currentAt = snapshotTimeMs(trade) || entryTimeMs(trade);
    const dayKey = localDayKey(currentAt) ?? "NO_DAY";
    const buckets = bucketsByDay.get(dayKey) ?? new Map();
    let dayRegime = trade?.recommendedDayRegimeAtEntry?.version
      ? trade.recommendedDayRegimeAtEntry
      : buildRecommendedDayRegimeSnapshotFromBuckets(
          trade,
          buckets,
          entryTimeMs(trade),
        );
    if (trade?.recommendedDayRegimeAtEntry?.version) {
      const input = dayRegime?.input ?? recommendedDayRegimeVoteSnapshot(trade);
      if (
        currentAt &&
        finiteNumber(input?.rawScore) != null &&
        (finiteNumber(input?.availableVotes) ?? 0) >=
          DAY_REGIME_MIN_AVAILABLE_VOTES
      ) {
        buckets.set(
          Math.floor(currentAt / DAY_REGIME_BUCKET_MS) * DAY_REGIME_BUCKET_MS,
          finiteNumber(input.rawScore),
        );
      }
    }
    bucketsByDay.set(dayKey, buckets);
    const daySelection = trade?.recommendedDaySelectionAtEntry?.version
      ? trade.recommendedDaySelectionAtEntry
      : classifyRecommendedDaySelection(trade, dayRegime);
    const decorated = {
      ...trade,
      recommendedDayRegimeAtEntry: dayRegime,
      recommendedDaySelectionAtEntry: daySelection,
    };
    decoratedById.set(String(trade?.id ?? ""), decorated);
  }
  return trades.map(
    (trade) => decoratedById.get(String(trade?.id ?? "")) ?? trade,
  );
}
