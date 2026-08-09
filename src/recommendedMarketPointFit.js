export const RECOMMENDED_MARKET_POINT_FIT_VERSION =
  "recommended-market-point-fit-shadow-v1";

const CLASSES = new Set([
  "STRONG",
  "SUPPORT",
  "TRANSITION",
  "EXHAUSTED",
  "HEADWIND",
  "NO_DATA",
]);

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function sideOf(trade = {}) {
  const side = normalize(trade?.side ?? trade?.action);
  if (side.includes("LONG")) return "LONG";
  if (side.includes("SHORT")) return "SHORT";
  return "";
}

function snapshotOf(trade = {}) {
  return trade?.marketDirectionAtSignal &&
    typeof trade.marketDirectionAtSignal === "object"
    ? trade.marketDirectionAtSignal
    : null;
}

function pointInputs(trade = {}) {
  const side = sideOf(trade);
  const snapshot = snapshotOf(trade);
  const scores = snapshot?.scores;
  const dynamics = snapshot?.scoreDynamics;
  const longScore = number(scores?.long);
  const shortScore = number(scores?.short);
  if (
    !side ||
    !scores ||
    longScore == null ||
    shortScore == null
  ) {
    return {
      dataAvailable: false,
      side,
      snapshot,
      dynamics,
    };
  }

  const directionScore = side === "LONG" ? longScore : shortScore;
  const oppositeScore = side === "LONG" ? shortScore : longScore;
  const directionScorePrev = number(
    side === "LONG"
      ? dynamics?.longScorePrev
      : dynamics?.shortScorePrev,
  );
  const oppositeScorePrev = number(
    side === "LONG"
      ? dynamics?.shortScorePrev
      : dynamics?.longScorePrev,
  );
  const slope = number(
    side === "LONG"
      ? dynamics?.longScoreSlope
      : dynamics?.shortScoreSlope,
    directionScorePrev == null ? null : directionScore - directionScorePrev,
  );
  const oppositeSlope = number(
    side === "LONG"
      ? dynamics?.shortScoreSlope
      : dynamics?.longScoreSlope,
    oppositeScorePrev == null ? null : oppositeScore - oppositeScorePrev,
  );
  const dropFromPeak = number(
    side === "LONG"
      ? dynamics?.longScoreDropFromPeak
      : dynamics?.shortScoreDropFromPeak,
    0,
  );
  const waveState = normalize(
    side === "LONG"
      ? dynamics?.longWaveState
      : dynamics?.shortWaveState,
  );
  const scoreEdge = directionScore - oppositeScore;
  const previousScoreEdge =
    directionScorePrev != null && oppositeScorePrev != null
      ? directionScorePrev - oppositeScorePrev
      : null;

  return {
    dataAvailable: true,
    side,
    snapshot,
    dynamics,
    directionScore,
    oppositeScore,
    directionScorePrev,
    oppositeScorePrev,
    scoreEdge,
    previousScoreEdge,
    slope,
    oppositeSlope,
    dropFromPeak,
    waveState,
  };
}

function isExhausted(inputs) {
  const exhaustionWaves = inputs.side === "LONG"
    ? new Set(["LONG_FADE", "BTC_RALLY_REJECT"])
    : new Set(["SHORT_FADE", "BTC_CRASH_RECLAIM"]);
  return (
    exhaustionWaves.has(inputs.waveState) ||
    (
      inputs.directionScore >= 50 &&
      (
        inputs.dropFromPeak >= 10 ||
        (inputs.slope != null && inputs.slope < 0)
      )
    )
  );
}

function isTransition(inputs) {
  const crossed =
    inputs.previousScoreEdge != null &&
    (
      (inputs.previousScoreEdge <= 0 && inputs.scoreEdge > 0) ||
      (inputs.previousScoreEdge >= 0 && inputs.scoreEdge < 0)
    );
  return crossed || Math.abs(inputs.scoreEdge) < 10;
}

function classificationOf(inputs) {
  if (!inputs.dataAvailable) return "NO_DATA";
  if (isExhausted(inputs)) return "EXHAUSTED";
  if (
    inputs.directionScore >= 60 &&
    inputs.scoreEdge >= 20 &&
    (inputs.slope == null || inputs.slope >= 0) &&
    inputs.dropFromPeak < 10
  ) {
    return "STRONG";
  }
  if (
    inputs.scoreEdge >= 10 &&
    (inputs.slope == null || inputs.slope >= 0)
  ) {
    return "SUPPORT";
  }
  if (isTransition(inputs)) return "TRANSITION";
  if (inputs.scoreEdge <= -10) return "HEADWIND";
  return "TRANSITION";
}

function presentation(classification) {
  return {
    STRONG: {
      tier: "GOOD",
      label: "POINT STRONG",
      description:
        "Điểm cùng hướng >= 60, dẫn ít nhất 20 điểm, slope chưa giảm và chưa rời peak.",
    },
    SUPPORT: {
      tier: "GOOD",
      label: "POINT SUPPORT",
      description:
        "Điểm cùng hướng đang dẫn ít nhất 10 điểm và chưa suy giảm.",
    },
    TRANSITION: {
      tier: "WATCH",
      label: "POINT TRANSITION",
      description:
        "LONG/SHORT đang cân bằng hoặc vừa đổi bên dẫn điểm; cần thống kê riêng theo nguồn.",
    },
    EXHAUSTED: {
      tier: "RISK",
      label: "POINT EXHAUSTED",
      description:
        "Điểm cùng hướng đã cao nhưng đang giảm, rời peak hoặc xuất hiện wave suy yếu/reclaim.",
    },
    HEADWIND: {
      tier: "RISK",
      label: "POINT HEADWIND",
      description:
        "Điểm đối hướng đang dẫn ít nhất 10 điểm tại entry.",
    },
    NO_DATA: {
      tier: "WATCH",
      label: "POINT NO DATA",
      description: "Tín hiệu chưa có snapshot Market Direction tại entry.",
    },
  }[classification];
}

function signed(value) {
  if (value == null) return "-";
  return `${value >= 0 ? "+" : ""}${Number(value).toFixed(0)}`;
}

export function buildRecommendedMarketPointFitSnapshot(trade = {}) {
  const inputs = pointInputs(trade);
  const classification = classificationOf(inputs);
  const view = presentation(classification);
  const reason = inputs.dataAvailable
    ? `${inputs.side} score ${inputs.directionScore.toFixed(0)} vs ${inputs.oppositeScore.toFixed(0)} ` +
      `(edge ${signed(inputs.scoreEdge)}); slope ${signed(inputs.slope)}; ` +
      `drop ${Number(inputs.dropFromPeak ?? 0).toFixed(0)}; ` +
      `wave ${inputs.waveState || "NO_DATA"} · ${view.description} · OBSERVE ONLY`
    : `${view.description} · OBSERVE ONLY`;

  return {
    recommendedMarketPointFitClass: classification,
    recommendedMarketPointFitTier: view.tier,
    recommendedMarketPointFitLabel: view.label,
    recommendedMarketPointFitReason: reason,
    recommendedMarketPointFitSide: inputs.side || null,
    recommendedMarketPointDirectionScore:
      inputs.directionScore ?? null,
    recommendedMarketPointOppositeScore:
      inputs.oppositeScore ?? null,
    recommendedMarketPointScoreEdge: inputs.scoreEdge ?? null,
    recommendedMarketPointPreviousScoreEdge:
      inputs.previousScoreEdge ?? null,
    recommendedMarketPointSlope: inputs.slope ?? null,
    recommendedMarketPointOppositeSlope: inputs.oppositeSlope ?? null,
    recommendedMarketPointDropFromPeak:
      inputs.dropFromPeak ?? null,
    recommendedMarketPointWaveState:
      inputs.waveState || "NO_DATA",
    recommendedMarketPointFitVersion:
      RECOMMENDED_MARKET_POINT_FIT_VERSION,
    recommendedMarketPointFitObservationOnly: true,
    recommendedMarketPointFitAffectsOrders: false,
  };
}

export function decorateRecommendedMarketPointFitSnapshots(trades = []) {
  return (trades ?? []).map((trade) => {
    const storedClass = normalize(
      trade?.recommendedMarketPointFitClass,
    );
    if (
      CLASSES.has(storedClass) &&
      trade?.recommendedMarketPointFitVersion
    ) {
      return trade;
    }
    return {
      ...trade,
      ...buildRecommendedMarketPointFitSnapshot(trade),
    };
  });
}

