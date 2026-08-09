export const RECOMMENDED_MARKET_DISPERSION_VERSION =
  "recommended-market-dispersion-shadow-v2";

const CLASSES = new Set([
  "ENTER",
  "HOLD_LONG_LEAD",
  "HOLD_BALANCED",
  "HOLD_SHORT_LEAD",
  "EXIT_PENDING",
  "OUTSIDE",
  "NO_DATA",
]);

const SEGMENTS = new Set([
  "DISP_REENTER_FROM_TRANSITION",
  "DISP_REENTER_FROM_CHOP",
  "DISP_REENTER_OTHER",
  "DISP_HOLD_LONG_LEAD",
  "DISP_HOLD_BALANCED",
  "DISP_HOLD_SHORT_LEAD",
  "DISP_EXIT_TO_TRANSITION",
  "DISP_EXIT_TO_CHOP",
  "DISP_EXIT_OTHER",
  "DISP_OUTSIDE",
  "DISP_NO_DATA",
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
  return "NO_SIDE";
}

function sourceOf(trade = {}) {
  return normalize(trade?.sourcePage ?? trade?.source ?? "UNKNOWN");
}

function phaseOf(rawLabel, stableLabel) {
  if (!rawLabel || !stableLabel) return "NO_DATA";
  if (
    rawLabel === "MARKET_DISPERSION" &&
    stableLabel === "MARKET_DISPERSION"
  ) {
    return "HOLD";
  }
  if (
    rawLabel === "MARKET_DISPERSION" &&
    stableLabel !== "MARKET_DISPERSION"
  ) {
    return "ENTER";
  }
  if (
    rawLabel !== "MARKET_DISPERSION" &&
    stableLabel === "MARKET_DISPERSION"
  ) {
    return "EXIT_PENDING";
  }
  return "OUTSIDE";
}

function leadOf(longScore, shortScore) {
  if (longScore == null || shortScore == null) return "NO_DATA";
  const gap = longScore - shortScore;
  if (gap >= 10) return "LONG_LEAD";
  if (gap <= -10) return "SHORT_LEAD";
  return "BALANCED";
}

function classificationOf(phase, lead) {
  if (phase === "NO_DATA" || lead === "NO_DATA") return "NO_DATA";
  if (phase === "ENTER") return "ENTER";
  if (phase === "EXIT_PENDING") return "EXIT_PENDING";
  if (phase === "OUTSIDE") return "OUTSIDE";
  return `HOLD_${lead}`;
}

function segmentOf({ phase, lead, rawLabel, stableLabel }) {
  if (phase === "NO_DATA" || lead === "NO_DATA") return "DISP_NO_DATA";
  if (phase === "ENTER") {
    if (stableLabel === "MARKET_TRANSITION") {
      return "DISP_REENTER_FROM_TRANSITION";
    }
    if (stableLabel === "MARKET_CHOP") return "DISP_REENTER_FROM_CHOP";
    return "DISP_REENTER_OTHER";
  }
  if (phase === "EXIT_PENDING") {
    if (rawLabel === "MARKET_TRANSITION") {
      return "DISP_EXIT_TO_TRANSITION";
    }
    if (rawLabel === "MARKET_CHOP") return "DISP_EXIT_TO_CHOP";
    return "DISP_EXIT_OTHER";
  }
  if (phase === "HOLD") return `DISP_HOLD_${lead}`;
  return "DISP_OUTSIDE";
}

function tierOf({ source, side, classification }) {
  // Three-day observation cohort. These labels never affect orders.
  if (
    source === "LIQUID" &&
    side === "SHORT" &&
    classification === "HOLD_LONG_LEAD"
  ) {
    return "GOOD";
  }
  if (
    source === "LIQUID" &&
    side === "LONG" &&
    classification === "HOLD_BALANCED"
  ) {
    return "GOOD";
  }
  if (
    source === "LIQUID" &&
    side === "SHORT" &&
    classification === "HOLD_SHORT_LEAD"
  ) {
    return "RISK";
  }
  return "WATCH";
}

function labelOf(segment) {
  return {
    DISP_REENTER_FROM_TRANSITION: "DISP RE-ENTER · FROM TRANSITION",
    DISP_REENTER_FROM_CHOP: "DISP RE-ENTER · FROM CHOP",
    DISP_REENTER_OTHER: "DISP RE-ENTER · OTHER",
    DISP_HOLD_LONG_LEAD: "DISP HOLD · LONG LEAD",
    DISP_HOLD_BALANCED: "DISP HOLD · BALANCED",
    DISP_HOLD_SHORT_LEAD: "DISP HOLD · SHORT LEAD",
    DISP_EXIT_TO_TRANSITION: "DISP EXIT · TO TRANSITION",
    DISP_EXIT_TO_CHOP: "DISP EXIT · TO CHOP",
    DISP_EXIT_OTHER: "DISP EXIT · OTHER",
    DISP_OUTSIDE: "DISP OUTSIDE",
    DISP_NO_DATA: "DISP NO DATA",
  }[segment] ?? "DISP NO DATA";
}

function signed(value) {
  if (value == null) return "-";
  return `${value >= 0 ? "+" : ""}${Number(value).toFixed(0)}`;
}

export function buildRecommendedMarketDispersionSnapshot(trade = {}) {
  const snapshot =
    trade?.marketDirectionAtSignal &&
    typeof trade.marketDirectionAtSignal === "object"
      ? trade.marketDirectionAtSignal
      : null;
  const rawLabel = normalize(snapshot?.rawLabel);
  const stableLabel = normalize(snapshot?.label);
  const longScore = number(snapshot?.scores?.long);
  const shortScore = number(snapshot?.scores?.short);
  const phase = phaseOf(rawLabel, stableLabel);
  const lead = leadOf(longScore, shortScore);
  const scoreGap =
    longScore == null || shortScore == null ? null : longScore - shortScore;
  const classification = classificationOf(phase, lead);
  const segment = segmentOf({ phase, lead, rawLabel, stableLabel });
  const source = sourceOf(trade);
  const side = sideOf(trade);
  const tier = tierOf({ source, side, classification });
  const reason = snapshot
    ? `${source} ${side} · raw ${rawLabel || "NO_DATA"} → stable ${stableLabel || "NO_DATA"} · ` +
      `LONG ${longScore == null ? "-" : longScore.toFixed(0)} vs SHORT ${shortScore == null ? "-" : shortScore.toFixed(0)} ` +
      `(gap LONG-SHORT ${signed(scoreGap)}) · phase ${phase} · lead ${lead} · OBSERVE ONLY`
    : "Chưa có Market Direction snapshot tại entry · OBSERVE ONLY";

  return {
    recommendedMarketDispersionClass: CLASSES.has(classification)
      ? classification
      : "NO_DATA",
    recommendedMarketDispersionSegment: SEGMENTS.has(segment)
      ? segment
      : "DISP_NO_DATA",
    recommendedMarketDispersionTier: tier,
    recommendedMarketDispersionLabel: labelOf(segment),
    recommendedMarketDispersionReason: reason,
    recommendedMarketDispersionPhase: phase,
    recommendedMarketDispersionLead: lead,
    recommendedMarketDispersionLongScore: longScore,
    recommendedMarketDispersionShortScore: shortScore,
    recommendedMarketDispersionScoreGap: scoreGap,
    recommendedMarketDispersionSource: source,
    recommendedMarketDispersionSide: side,
    recommendedMarketDispersionCohortKey:
      `${source}|${side}|${segment}`,
    recommendedMarketDispersionVersion:
      RECOMMENDED_MARKET_DISPERSION_VERSION,
    recommendedMarketDispersionObservationOnly: true,
    recommendedMarketDispersionAffectsOrders: false,
  };
}

export function decorateRecommendedMarketDispersionSnapshots(trades = []) {
  return (trades ?? []).map((trade) => {
    const storedClass = normalize(
      trade?.recommendedMarketDispersionClass,
    );
    const storedSegment = normalize(
      trade?.recommendedMarketDispersionSegment,
    );
    if (
      CLASSES.has(storedClass) &&
      SEGMENTS.has(storedSegment) &&
      trade?.recommendedMarketDispersionVersion ===
        RECOMMENDED_MARKET_DISPERSION_VERSION
    ) {
      return trade;
    }
    return {
      ...trade,
      ...buildRecommendedMarketDispersionSnapshot(trade),
    };
  });
}
