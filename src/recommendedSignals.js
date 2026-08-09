import crypto from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RECOMMENDED_DAY_REGIME_VERSION,
  RECOMMENDED_DAY_SELECTION_VERSION,
  buildRecommendedDayRegimeSnapshot,
  classifyRecommendedDaySelection,
  decorateRecommendedDayRegimeSnapshots,
} from "./recommendedDayRegime.js";
import {
  RECOMMENDED_BACKTEST_CONFIDENCE_RULES,
  RECOMMENDED_BACKTEST_CONFIDENCE_VERSION,
  RECOMMENDED_BACKTEST_RELIABILITY_VERSION,
  buildRecommendedBacktestConfidenceSnapshot,
  decorateRecommendedBacktestConfidenceSnapshots,
} from "./recommendedBacktestConfidence.js";
import {
  RECOMMENDED_MARKET_POINT_FIT_VERSION,
  buildRecommendedMarketPointFitSnapshot,
  decorateRecommendedMarketPointFitSnapshots,
} from "./recommendedMarketPointFit.js";
import {
  RECOMMENDED_MARKET_DISPERSION_VERSION,
  buildRecommendedMarketDispersionSnapshot,
  decorateRecommendedMarketDispersionSnapshots,
} from "./recommendedMarketDispersion.js";
import {
  RECOMMENDED_SUPPORT_ENTRY_RULES,
  RECOMMENDED_SUPPORT_ENTRY_VERSION,
  decorateRecommendedSupportEntrySnapshots,
} from "./recommendedSupportEntry.js";
import { liveCardKeysFromRows } from "./liquidLiveCardWhitelist.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const recommendationFile = join(rootDir, "data", "recommended-signals.json");
const paperFile = join(rootDir, "data", "recommended-paper-trades.json");
const sourceFiles = {
  pump: [join(rootDir, "data", "pump-paper-trades.json")],
  ema: [
    join(rootDir, "data", "pump-paper-trades.json"),
    join(rootDir, "data", "paper-trades.json"),
  ],
  liquid: [join(rootDir, "data", "liquid-paper-trades.json")],
  edge: [join(rootDir, "data", "edge-paper-trades.json")],
};

const jsonCache = new Map();
let writeLock = Promise.resolve();
const syncAtByDay = new Map();
// Direct source-open events are the primary clone path. Full source-file sync
// is only a recovery fallback and must not re-read the 260MB+ pump store every
// time the page polls.
const SOURCE_SYNC_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.RECOMMENDED_SOURCE_SYNC_INTERVAL_MS ?? 5 * 60_000),
);
const RECOMMENDED_TEST_MARGIN_USDT = 1;
const RECOMMENDED_CLUSTER_WINDOW_MS = 15 * 60_000;
const RECOMMENDED_CLUSTER_FULL_SIZE_LIMIT = 3;
const RECOMMENDED_DEFAULT_SL_ROE = 16;
const RECOMMENDED_DEFAULT_TP_ROE = 15;
const RECOMMENDED_PAPER_MODE = "INDEPENDENT_SOCKET_V2";
const RECOMMENDED_DIRECT_EVENT_MODE = "SOURCE_OPEN_EVENT_V3";
const RECOMMENDED_TWO_LAYER_VERSION = "recommended-clone-shadow-v1";
const RECOMMENDED_MARKET_FIT_VERSION = "recommended-market-fit-shadow-v1";
const RECOMMENDED_MARKET_FIT_MIN_SAMPLE = 10;
const RECOMMENDED_MARKET_FIT_DECISION_SAMPLE = 30;
const RECOMMENDED_CLONE_GOOD_DRIFT_PCT = 0.08;
const RECOMMENDED_CLONE_RISK_DRIFT_PCT = 0.3;
const socketProcessAtBySymbol = new Map();

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recommendedMarketDirectionSnapshot(explicitSnapshot, sourceTrade = {}) {
  const snapshot = explicitSnapshot && typeof explicitSnapshot === "object"
    ? explicitSnapshot
    : sourceTrade?.marketDirectionAtSignal && typeof sourceTrade.marketDirectionAtSignal === "object"
      ? sourceTrade.marketDirectionAtSignal
      : null;
  if (!snapshot) return null;
  return {
    ...snapshot,
    scores: snapshot.scores && typeof snapshot.scores === "object" ? { ...snapshot.scores } : null,
    breadth: snapshot.breadth && typeof snapshot.breadth === "object" ? { ...snapshot.breadth } : null,
    btc: snapshot.btc && typeof snapshot.btc === "object" ? { ...snapshot.btc } : null,
    scoreDynamics: snapshot.scoreDynamics && typeof snapshot.scoreDynamics === "object"
      ? { ...snapshot.scoreDynamics, observationOnly: true, affectsOrders: false }
      : null,
    reasons: Array.isArray(snapshot.reasons) ? snapshot.reasons.map(String) : [],
    observationOnly: true,
    affectsOrders: false,
  };
}

function normalizePart(value) {
  return (
    String(value ?? "-")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[|]/g, "_")
      .toUpperCase()
      .slice(0, 96) || "-"
  );
}

const RECOMMENDED_PAPER_FILTER_KEYS = [
  "sourceLayer",
  "cloneLayer",
  "twoLayer",
  "marketFit",
  "daySelection",
  "backtestConfidence",
  "backtestReliability",
  "marketPointFit",
  "marketDispersion",
];

function recommendedPaperFilterValue(trade, key) {
  if (key === "sourceLayer") {
    return normalizePart(trade?.recommendedSourceLayer ?? "WATCH");
  }
  if (key === "cloneLayer") {
    return normalizePart(trade?.recommendedCloneLayer ?? "WATCH");
  }
  if (key === "twoLayer") {
    return normalizePart(trade?.recommendedTwoLayerTier ?? "WATCH");
  }
  if (key === "marketFit") {
    const label = normalizePart(trade?.recommendedMarketFitLabel ?? "");
    if (label && label !== "-") return label.replace(/^M4_/, "");
    const sampleStatus = normalizePart(
      trade?.recommendedMarketFitSampleStatus ?? "",
    );
    if (sampleStatus === "NO_DATA") return "NO_DATA";
    return normalizePart(trade?.recommendedMarketFitTier ?? "WATCH");
  }
  if (key === "daySelection") {
    return normalizePart(
      trade?.recommendedDaySelectionAtEntry?.key ?? "REC_DAY_NO_DATA",
    );
  }
  if (key === "backtestConfidence") {
    const value = normalizePart(
      trade?.recommendedBacktestConfidenceClass ?? "NO_DATA",
    );
    return ["PRIME", "GOOD", "WATCH", "RISK", "NO_DATA"].includes(value)
      ? value
      : "NO_DATA";
  }
  if (key === "backtestReliability") {
    const value = normalizePart(
      trade?.recommendedBacktestReliabilityClass ?? "LOW",
    );
    return ["HIGH", "MEDIUM", "LOW"].includes(value) ? value : "LOW";
  }
  if (key === "marketPointFit") {
    const value = normalizePart(
      trade?.recommendedMarketPointFitClass ?? "NO_DATA",
    );
    return [
      "STRONG",
      "SUPPORT",
      "TRANSITION",
      "EXHAUSTED",
      "HEADWIND",
      "NO_DATA",
    ].includes(value)
      ? value
      : "NO_DATA";
  }
  if (key === "marketDispersion") {
    const value = normalizePart(
      trade?.recommendedMarketDispersionSegment ??
        trade?.recommendedMarketDispersionClass ??
        "DISP_NO_DATA",
    );
    return [
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
    ].includes(value)
      ? value
      : "DISP_NO_DATA";
  }
  return "";
}

function recommendedPaperFilterLabel(trade, key, value) {
  if (key === "sourceLayer") return `SOURCE ${value.replaceAll("_", " ")}`;
  if (key === "cloneLayer") return `CLONE ${value.replaceAll("_", " ")}`;
  if (key === "twoLayer") return value.replaceAll("_", " ");
  if (key === "marketFit") return `M4 ${value.replaceAll("_", " ")}`;
  if (key === "daySelection") {
    return String(
      trade?.recommendedDaySelectionAtEntry?.label ??
        value.replaceAll("_", " "),
    );
  }
  if (key === "backtestConfidence") {
    return `BT ${value.replaceAll("_", " ")}`;
  }
  if (key === "backtestReliability") {
    return `CONF ${value.replaceAll("_", " ")}`;
  }
  if (key === "marketPointFit") {
    return `POINT ${value.replaceAll("_", " ")}`;
  }
  if (key === "marketDispersion") {
    return value.replace(/^DISP_/, "DISP ").replaceAll("_", " ");
  }
  return value.replaceAll("_", " ");
}

export function normalizeRecommendedPaperFilters(filters = {}) {
  return Object.fromEntries(
    RECOMMENDED_PAPER_FILTER_KEYS.map((key) => {
      const value = normalizePart(filters?.[key] ?? "");
      return [key, ["", "-", "ALL"].includes(value) ? "" : value];
    }),
  );
}

export function filterRecommendedPaperTrades(trades = [], filters = {}) {
  const normalized = normalizeRecommendedPaperFilters(filters);
  return (trades ?? []).filter((trade) =>
    RECOMMENDED_PAPER_FILTER_KEYS.every(
      (key) =>
        !normalized[key] ||
        recommendedPaperFilterValue(trade, key) === normalized[key],
    ),
  );
}

export function recommendedPaperFilterOptions(trades = []) {
  const tierRank = {
    PRIME: 0,
    HIGH: 0,
    GOOD: 1,
    MEDIUM: 1,
    WATCH: 2,
    LOW: 2,
    RISK: 3,
    STRONG: 0,
    SUPPORT: 1,
    TRANSITION: 2,
    EXHAUSTED: 3,
    HEADWIND: 4,
    ENTER: 0,
    HOLD_LONG_LEAD: 1,
    HOLD_BALANCED: 2,
    HOLD_SHORT_LEAD: 3,
    EXIT_PENDING: 4,
    OUTSIDE: 5,
    NO_DATA: 5,
    DISP_REENTER_FROM_TRANSITION: 0,
    DISP_REENTER_FROM_CHOP: 1,
    DISP_REENTER_OTHER: 2,
    DISP_HOLD_LONG_LEAD: 3,
    DISP_HOLD_BALANCED: 4,
    DISP_HOLD_SHORT_LEAD: 5,
    DISP_EXIT_TO_TRANSITION: 6,
    DISP_EXIT_TO_CHOP: 7,
    DISP_EXIT_OTHER: 8,
    DISP_OUTSIDE: 9,
    DISP_NO_DATA: 10,
  };
  return Object.fromEntries(
    RECOMMENDED_PAPER_FILTER_KEYS.map((key) => {
      const values = new Map();
      for (const trade of trades ?? []) {
        const value = recommendedPaperFilterValue(trade, key);
        if (!value || value === "-") continue;
        const current = values.get(value) ?? {
          value,
          label: recommendedPaperFilterLabel(trade, key, value),
          count: 0,
        };
        current.count += 1;
        values.set(value, current);
      }
      return [
        key,
        [...values.values()].sort(
          (left, right) =>
            (tierRank[left.value] ?? 9) - (tierRank[right.value] ?? 9) ||
            left.label.localeCompare(right.label, "vi", {
              numeric: true,
              sensitivity: "base",
            }),
        ),
      ];
    }),
  );
}

function gatePartOf(trade) {
  const raw =
    trade?.recommendationGate ??
    trade?.emaStageGateLabel ??
    trade?.capGateLabel ??
    trade?.edgeGateLabel ??
    trade?.liquidGateLabel ??
    trade?.gateLabel ??
    trade?.gateReason ??
    trade?.gate ??
    "-";
  const gate = normalizePart(raw);
  if (!gate || gate === "-" || gate === "GATE" || gate === "GATE_-" || gate === "UNKNOWN") {
    return "GATE_UNKNOWN";
  }
  if (gate.startsWith("GATE_") || gate.startsWith("OK_") || gate.startsWith("BLOCK_")) {
    return gate;
  }
  return `GATE_${gate}`;
}

function comboWithGate(combo, trade) {
  const base = String(combo ?? "").trim();
  const gate = gatePartOf(trade);
  if (!base || base === "-") return gate;
  const parts = base.split("|").map((part) => part.trim()).filter(Boolean);
  const normalizedParts = parts.map((part) => {
    const value = normalizePart(part);
    return value === "GATE" || value === "GATE_-" || value === "GATE_UNKNOWN" || value === "UNKNOWN"
      ? "GATE_UNKNOWN"
      : part;
  });
  const hasGate = normalizedParts.some((part) => {
    const value = normalizePart(part);
    return value === "GATE_UNKNOWN" || value.startsWith("GATE_") || value.startsWith("OK_") || value.startsWith("BLOCK_");
  });
  return hasGate ? normalizedParts.join(" | ") : `${base} | ${gate}`;
}

function marginFromPlanText(...values) {
  for (const value of values) {
    const match = String(value ?? "").match(/\$(\d+(?:\.\d+)?)/);
    if (!match) continue;
    const parsed = number(match[1]);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

function sourceOf(trade) {
  return String(trade?.source ?? "");
}

function isEmaTrade(trade) {
  const source = sourceOf(trade);
  return (
    source.startsWith("emasq-") ||
    source.includes("ema-squeeze") ||
    Boolean(trade?.emaStageGateLabel)
  );
}

function tradeDay(trade) {
  const raw =
    trade?.createdAt ??
    trade?.openedAt ??
    trade?.time ??
    trade?.closedAt ??
    trade?.updatedAt;
  if (typeof raw === "number" && Number.isFinite(raw))
    return new Date(raw).toISOString().slice(0, 10);
  const text = String(raw ?? "");
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().slice(0, 10)
    : "";
}

function stageOfEma(trade) {
  const source = sourceOf(trade);
  const note = String(trade?.note ?? "");
  if (source.includes("br_like_short") || note.includes("brLikeShort=Y"))
    return "BR-like Short";
  if (source.includes("br_like") || note.includes("brLike=Y")) return "BR-like";
  if (
    trade?.runnerCandidate ||
    source.includes("runner") ||
    note.includes("runner=Y")
  )
    return "Runner";
  if (source.includes("pre_breakout")) return "Pre Breakout";
  if (source.includes("pre_breakdown")) return "Pre Breakdown";
  if (source.includes("breakout")) return "Breakout";
  if (source.includes("breakdown")) return "Breakdown";
  if (source.includes("squeeze_short")) return "Squeeze Short";
  if (source.includes("squeeze")) return "Squeeze";
  return "EMA";
}

function timeframeOf(trade) {
  return (
    sourceOf(trade).match(
      /(?:emasq|pump|cap|edge|ppks|liq|shakeout|top)-(\d+[mh])-/,
    )?.[1] ??
    trade?.pumpSignalTimeframe ??
    trade?.timeframe ??
    trade?.tf ??
    "-"
  );
}

function scoreOf(trade) {
  const sourceScore = sourceOf(trade).match(/-(\d{2,5})(?:-|$)/)?.[1];
  const raw = number(
    trade?.score ?? trade?.signalScore ?? trade?.qualityScore ?? sourceScore,
  );
  if (raw == null) return null;
  if (raw > 1000) return Math.floor(raw / 100);
  if (raw > 100) return Math.floor(raw / 10);
  return raw;
}

function scoreBucket(trade) {
  const score = scoreOf(trade);
  if (score == null) return "SCORE_NO_DATA";
  if (score >= 90) return "SCORE_90_PLUS";
  if (score >= 80) return "SCORE_80_89";
  if (score >= 70) return "SCORE_70_79";
  if (score >= 60) return "SCORE_60_69";
  return "SCORE_LT_60";
}

function numericPart(value, fallback = null) {
  const direct = number(value);
  if (direct != null) return direct;
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return match ? number(match[0], fallback) : fallback;
}

function leverageOf(trade) {
  return Math.max(
    1,
    numericPart(
      trade?.leverage ??
        trade?.lev ??
        trade?.marginLeverage ??
        trade?.leverageX ??
        trade?.maxLeverage ??
        trade?.levKhaThi ??
        trade?.levKhathi,
      10,
    ),
  );
}

function entryOf(trade) {
  return number(
    trade?.entry ??
      trade?.entryPrice ??
      trade?.openPrice ??
      trade?.avgEntry ??
      trade?.plannedEntry,
  );
}

function slPriceForRoe(entry, side, leverage, roePct) {
  if (!entry || entry <= 0 || !side || !leverage || leverage <= 0) return null;
  const distance = Math.abs(roePct) / 100 / leverage;
  if (side === "LONG") return entry * (1 - distance);
  if (side === "SHORT") return entry * (1 + distance);
  return null;
}

function tpPriceForRoe(entry, side, leverage, roePct) {
  if (!entry || entry <= 0 || !side || !leverage || leverage <= 0) return null;
  const distance = Math.abs(roePct) / 100 / leverage;
  if (side === "LONG") return entry * (1 + distance);
  if (side === "SHORT") return entry * (1 - distance);
  return null;
}

function applyRecommendedDefaultSl(trade) {
  const side = normalizePart(trade?.side);
  const entry = entryOf(trade);
  const leverage = leverageOf(trade);
  const sl = slPriceForRoe(entry, side, leverage, RECOMMENDED_DEFAULT_SL_ROE);
  const sourceTp = number(trade?.tp ?? trade?.takeProfit ?? trade?.takeProfitPrice);
  const tp = sourceTp ?? tpPriceForRoe(entry, side, leverage, RECOMMENDED_DEFAULT_TP_ROE);
  if (sl == null) return trade;
  return {
    ...trade,
    sl,
    tp,
    stopLoss: sl,
    stopPrice: sl,
    takeProfit: tp,
    recommendedDefaultSlRoe: RECOMMENDED_DEFAULT_SL_ROE,
    recommendedDefaultTpRoe: sourceTp == null ? RECOMMENDED_DEFAULT_TP_ROE : null,
    recommendedSlSource: "RECOMMENDED_DEFAULT_16_ROE",
  };
}

function marginOf(trade) {
  return number(
    marginFromPlanText(
      trade?.recommendedTradePlanLabel,
      trade?.ruleSize,
      trade?.sizeHint,
    ) ??
      trade?.recommendedTargetMarginUsdt ??
      trade?.marginUsdt ??
      trade?.margin ??
      trade?.orderUsd ??
      trade?.orderSizeUsd,
  );
}

function liveMarkOf(trade) {
  return number(
    trade?.markPrice ??
      trade?.mark ??
      trade?.lastPrice ??
      trade?.currentPrice,
  );
}

function roeAtMark(trade, mark) {
  const side = normalizePart(trade?.side);
  const entry = entryOf(trade);
  const leverage = leverageOf(trade);
  if (!entry || entry <= 0 || !mark || mark <= 0 || !side) return null;
  const move = side === "SHORT" ? (entry - mark) / entry : (mark - entry) / entry;
  return move * leverage * 100;
}

function isRecommendedSl16Closed(trade) {
  const text = [
    trade?.status,
    trade?.outcome,
    trade?.closeReason,
    trade?.recommendedCloseReason,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return text.includes("RECOMMENDED_SL_16");
}

function preserveRecommendedSl16Close(existing, incoming) {
  if (!isRecommendedSl16Closed(existing)) return incoming;
  const preserved = {};
  for (const key of [
    "status",
    "outcome",
    "closeReason",
    "recommendedCloseReason",
    "recommendedLiveSlClosed",
    "closedAt",
    "exitPrice",
    "closePrice",
    "markPrice",
    "pnl",
    "netPnl",
    "realizedPnl",
    "unrealizedPnl",
    "roe",
    "roePct",
  ]) {
    if (existing?.[key] !== undefined) preserved[key] = existing[key];
  }
  return { ...incoming, ...preserved };
}

async function persistRecommendedPaperLiveStops(trades = []) {
  const updatesById = new Map(
    (trades ?? [])
      .filter((trade) => trade?.id && trade?.paperMode === RECOMMENDED_PAPER_MODE)
      .map((trade) => [trade.id, trade]),
  );
  if (!updatesById.size) return 0;
  let changed = 0;
  writeLock = writeLock.then(async () => {
    const store = await readJsonCached(paperFile, {
      version: 1,
      updatedAt: null,
      trades: [],
    });
    const nextTrades = (store.trades ?? []).map((trade) => {
      const incoming = updatesById.get(trade?.id);
      if (!incoming) return trade;
      const shouldClose = normalizePart(trade?.status) === "OPEN"
        && normalizePart(incoming?.status) !== "OPEN";
      const candleMissing = !trade?.candlePatternAtEntry
        && incoming?.candlePatternAtEntry
        && normalizePart(incoming.candlePatternAtEntry?.name) !== "NO_DATA";
      if (!shouldClose && !candleMissing) return trade;
      changed += 1;
      if (shouldClose) return { ...trade, ...incoming };
      return {
        ...trade,
        candlePatternAtEntry: incoming.candlePatternAtEntry,
        candlePatternTimeframe: incoming.candlePatternTimeframe ?? null,
      };
    });
    if (!changed) return;
    await writeJsonAtomic(paperFile, {
      ...store,
      updatedAt: new Date().toISOString(),
      trades: nextTrades,
    });
  });
  await writeLock;
  return changed;
}

export function applyRecommendedDefaultSlLiveClose(trade, nowIso = new Date().toISOString()) {
  const status = normalizePart(trade?.status);
  if (status !== "OPEN") return trade;
  const side = normalizePart(trade?.side);
  const entry = entryOf(trade);
  const leverage = leverageOf(trade);
  const sl = number(
    trade?.sl ??
      trade?.stopLoss ??
      trade?.stopPrice ??
      slPriceForRoe(entry, side, leverage, RECOMMENDED_DEFAULT_SL_ROE),
  );
  const mark = liveMarkOf(trade);
  const liveRoe = roeAtMark(trade, mark);
  if (!side || !sl || sl <= 0 || !mark || mark <= 0) return trade;
  const tp = number(
    trade?.tp ?? trade?.takeProfit ?? trade?.takeProfitPrice
      ?? tpPriceForRoe(entry, side, leverage, RECOMMENDED_DEFAULT_TP_ROE),
  );
  const slPriceHit = side === "SHORT" ? mark >= sl : mark <= sl;
  const slRoeHit = liveRoe != null && liveRoe <= -RECOMMENDED_DEFAULT_SL_ROE;
  const tpHit = tp && (side === "SHORT" ? mark <= tp : mark >= tp);
  if (!slPriceHit && !slRoeHit && !tpHit) return trade;
  const isTp = Boolean(tpHit && !slPriceHit && !slRoeHit);
  const exitPrice = isTp ? tp : sl;
  const margin = marginOf(trade);
  const closedRoe = isTp
    ? (roeAtMark(trade, exitPrice) ?? RECOMMENDED_DEFAULT_TP_ROE)
    : -RECOMMENDED_DEFAULT_SL_ROE;
  const closedPnl = margin != null ? (margin * closedRoe) / 100 : trade?.pnl;
  const outcome = isTp ? "TP" : "RECOMMENDED_SL_16";
  return {
    ...trade,
    status: "CLOSED",
    outcome,
    closeReason: outcome,
    recommendedCloseReason: outcome,
    recommendedLiveSlClosed: !isTp,
    recommendedSocketClosed: true,
    closedAt: trade?.closedAt ?? nowIso,
    exitPrice,
    closePrice: exitPrice,
    markPrice: exitPrice,
    pnl: closedPnl,
    netPnl: closedPnl,
    realizedPnl: closedPnl,
    unrealizedPnl: 0,
    roe: closedRoe,
    roePct: closedRoe,
  };
}

export async function processRecommendedPaperSocketPrice(
  symbol,
  markPrice,
  eventTime = Date.now(),
  { onTradeClosed = null } = {},
) {
  const normalizedSymbol = String(symbol ?? "").trim().toUpperCase();
  const mark = number(markPrice);
  if (!normalizedSymbol || !mark || mark <= 0) return 0;
  const now = Date.now();
  if (now - (socketProcessAtBySymbol.get(normalizedSymbol) ?? 0) < 200) return 0;
  socketProcessAtBySymbol.set(normalizedSymbol, now);
  let closed = 0;
  const closedTrades = [];
  writeLock = writeLock.then(async () => {
    const store = await readJsonCached(paperFile, { version: 2, trades: [] });
    const nextTrades = (store.trades ?? []).map((row) => {
      if (row?.paperMode !== RECOMMENDED_PAPER_MODE
          || normalizePart(row?.status) !== "OPEN"
          || String(row?.symbol ?? "").trim().toUpperCase() !== normalizedSymbol) return row;
      const evaluated = applyRecommendedDefaultSlLiveClose(
        { ...row, markPrice: mark },
        new Date(eventTime).toISOString(),
      );
      if (normalizePart(evaluated?.status) === "CLOSED") {
        closed += 1;
        closedTrades.push(evaluated);
      }
      return evaluated;
    });
    if (!closed) return;
    await writeJsonAtomic(paperFile, {
      ...store,
      version: 2,
      paperMode: RECOMMENDED_PAPER_MODE,
      updatedAt: new Date().toISOString(),
      trades: nextTrades,
    });
  });
  await writeLock;
  if (typeof onTradeClosed === "function" && closedTrades.length) {
    await Promise.allSettled(closedTrades.map((trade) => onTradeClosed(trade)));
  }
  return closed;
}

function btcPhase(trade) {
  const health = trade?.btcHealth ?? {};
  const directionRaw = health.btcTrendDir ?? trade?.btcTrendDir;
  const score = number(health.btcTrendScore ?? trade?.btcTrendScore);
  const pct6h = number(health.pct6h ?? trade?.btcPct6h);
  let direction = normalizePart(directionRaw);
  if (!direction || direction === "-") {
    if (pct6h != null)
      direction = pct6h > 0.15 ? "UP" : pct6h < -0.15 ? "DOWN" : "FLAT";
    else return "BTC_NO_DATA";
  }
  const strength =
    score == null
      ? "NO_SCORE"
      : score < 45
        ? "WEAK"
        : score < 65
          ? "MID"
          : "STRONG";
  return `BTC_${direction}_${strength}`;
}

function btcTrendSnapshot(trade) {
  const health = trade?.btcHealth ?? {};
  const direction = normalizePart(health.btcTrendDir ?? trade?.btcTrendDir);
  const score = number(health.btcTrendScore ?? trade?.btcTrendScore);
  const pct6h = number(health.pct6h ?? trade?.btcPct6h);
  const hasDirection = direction && direction !== "-";
  return {
    direction: hasDirection ? direction : "NO_DATA",
    score,
    pct6h,
    label: hasDirection ? `BTC ${direction} ${score ?? "-"}` : "BTC NO DATA",
  };
}

function relationOf(trade) {
  const correlation = number(trade?.btcCorr);
  if (correlation == null) return "REL_NO_DATA";
  if (correlation < 0.3) return "DOC_LAP";
  if (correlation < 0.5) return "THEO_YEU";
  return "THEO";
}

function signalType(page, trade) {
  if (page === "ema") return stageOfEma(trade);
  const first = String(trade?.pumpCombo ?? trade?.combo ?? "")
    .split("|")[0]
    ?.trim();
  if (first) return first;
  return normalizePart(trade?.pumpSignalType ?? trade?.type ?? page);
}

// Keep this key byte-for-byte compatible with scripts/daily-signal-report.js.
// Recommendations are trained/grouped with this EMA-specific schema, so using
// the generic fallback here makes every live EMA signal miss the whitelist.
function emaComboForRecommendation(trade) {
  const stage = stageOfEma(trade);
  const side = normalizePart(trade?.side);
  const timeframe = String(timeframeOf(trade) ?? "-");
  const correlation = number(trade?.btcCorr);
  const correlationBucket = correlation == null
    ? "BTC_CORR_NO_DATA"
    : correlation < 0.3
      ? "BTC_CORR_RAC"
      : correlation < 0.5
        ? "BTC_CORR_YEU"
        : "BTC_CORR_THEO";
  const phase = btcPhase(trade);
  const direction = phase.match(/^BTC_(UP|DOWN|FLAT)_/)?.[1] ?? "";
  const expectedDirection = side === "LONG" ? "UP" : side === "SHORT" ? "DOWN" : "";
  const relation = correlation != null && correlation < 0.3
    ? "DOC_LAP"
    : correlation != null && correlation < 0.5
      ? "THEO_YEU"
      : direction && expectedDirection
        ? (direction === expectedDirection ? "THUAN_BTC" : "NGUOC_BTC")
        : "REL_NO_DATA";
  const note = String(trade?.note ?? "");
  const gate = [
    trade?.emaStageGateLabel,
    trade?.breakoutMarketRegimeLabel,
    trade?.breakoutChaseLabel,
    trade?.breakoutBtcTurnClusterLabel,
    trade?.runnerPreWeakLabel,
    trade?.runnerSessionTestLabel,
    trade?.brMarketRegimeLabel,
  ].find(Boolean)
    ?? note.match(/(?:emaStageGate|breakoutMarketRegime|breakoutChase|runnerPreGate|marketRegime)=([^|]+)/i)?.[1]?.trim()
    ?? "-";
  return [
    stage,
    side,
    timeframe,
    correlationBucket,
    phase,
    relation,
    `GATE_${normalizePart(gate)}`,
  ].join(" | ");
}

function comboOf(page, trade) {
  // These raw combos are already the canonical keys used to generate the
  // daily report. Appending a synthetic GATE_UNKNOWN changes the key.
  if (trade?.combo) return String(trade.combo);
  if (trade?.pumpCombo) return String(trade.pumpCombo);
  if ((page === "pump" || page === "ema") && isEmaTrade(trade)) {
    return emaComboForRecommendation(trade);
  }
  return [
    signalType(page, trade),
    normalizePart(trade?.side),
    normalizePart(timeframeOf(trade)),
    btcPhase(trade),
    relationOf(trade),
    `SCORE_${scoreBucket(trade).replace(/^SCORE_/, "")}`,
  ].join(" | ");
}

async function readJsonCached(file, fallback) {
  try {
    const info = await stat(file);
    const cached = jsonCache.get(file);
    if (cached?.mtimeMs === info.mtimeMs && cached?.size === info.size)
      return cached.value;
    const value = JSON.parse(await readFile(file, "utf8"));
    jsonCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, value });
    return value;
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
  jsonCache.delete(file);
}

function tradeId(page, trade) {
  const raw =
    trade?.id ??
    trade?.tradeId ??
    trade?.paperTradeId ??
    `${sourceOf(trade)}|${tradeDay(trade)}|${trade?.symbol}|${trade?.side}|${trade?.entryPrice ?? trade?.entry}`;
  return crypto
    .createHash("sha1")
    .update(`${page}|${raw}`)
    .digest("hex")
    .slice(0, 20);
}

function recommendationKey(page, phase, combo) {
  return `${page}|${phase}|${combo}`;
}

function recommendationLabel(item) {
  return `${String(item?.page ?? "-").toUpperCase()} · ${item?.signalType ?? "-"} ${item?.side ?? "-"} · ${item?.timeframe ?? "-"}`;
}

function comboWindow(value) {
  const normalized = String(value ?? "1").toLowerCase();
  if (normalized === "all" || normalized === "30")
    return { value: "all", days: null, sampleDays: 30, label: "Tổng thể" };
  const days = [1, 3, 5, 7].includes(Number(normalized))
    ? Number(normalized)
    : 1;
  return {
    value: String(days),
    days,
    sampleDays: days,
    label: days === 1 ? "Trong ngày" : `${days} ngày`,
  };
}

function normalizedDateKey(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const parsed = Date.parse(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? text : "";
}

export function recommendedPaperDateRange(fromDay, toDay) {
  const from = normalizedDateKey(fromDay);
  const to = normalizedDateKey(toDay);
  if (!from && !to) return null;
  const left = from || to;
  const right = to || from;
  return left <= right
    ? { fromDay: left, toDay: right }
    : { fromDay: right, toDay: left };
}

export function tradeInRecommendedDateRange(trade, range) {
  const day = normalizedDateKey(trade?.activeDateUtc ?? tradeDay(trade));
  return Boolean(
    day && range && day >= range.fromDay && day <= range.toDay,
  );
}

function subtractUtcDays(day, amount) {
  const parsed = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return day;
  return new Date(parsed - amount * 86_400_000).toISOString().slice(0, 10);
}

function tradeInComboWindow(trade, selectedDay, window) {
  const day = trade?.activeDateUtc || tradeDay(trade);
  if (!day || !selectedDay || day > selectedDay) return false;
  if (window.days == null) return true;
  return day >= subtractUtcDays(selectedDay, window.days - 1);
}

function tradeTimeMs(trade) {
  const raw =
    trade?.createdAt ?? trade?.openedAt ?? trade?.time ?? trade?.updatedAt;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Date.parse(String(raw ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function phaseTestReason(page, trade, phase) {
  const side = normalizePart(trade?.side);
  if (
    page === "liquid" &&
    side === "LONG" &&
    ["BTC_DOWN_MID", "BTC_DOWN_STRONG"].includes(phase)
  ) {
    return "LIQUID LONG against a falling BTC phase";
  }
  if (
    page === "pump" &&
    side === "LONG" &&
    ["BTC_DOWN_WEAK", "BTC_DOWN_MID"].includes(phase)
  ) {
    return "PUMP LONG during a falling BTC phase";
  }
  if (page === "pump" && side === "SHORT" && phase === "BTC_DOWN_MID") {
    return "PUMP SHORT can enter late near a BTC bounce";
  }
  return "";
}

function samplePassesFullSize(recommendation) {
  const sample =
    recommendation?.effectiveBestSample ??
    recommendation?.decisionSample ??
    recommendation?.bestSample ??
    {};
  return (
    number(sample.closed, 0) >= 8 &&
    number(sample.wr, 0) >= 80 &&
    number(sample.avgRoe, -Infinity) >= 3 &&
    number(sample.pnl, 0) > 0
  );
}

function sampleWins(sample) {
  return number(sample?.win ?? sample?.wins, 0) ?? 0;
}

function sampleLosses(sample) {
  return number(sample?.loss ?? sample?.losses, 0) ?? 0;
}

function mergeSampleWithPaper(sample = {}, paper = null) {
  const baseClosed = number(sample?.closed, 0) ?? 0;
  const paperClosed = number(paper?.closed, 0) ?? 0;
  const closed = baseClosed + paperClosed;
  const win = sampleWins(sample) + (number(paper?.wins, 0) ?? 0);
  const loss = sampleLosses(sample) + (number(paper?.losses, 0) ?? 0);
  const decisive = win + loss;
  const avgRoe = closed
    ? (((number(sample?.avgRoe, 0) ?? 0) * baseClosed) +
        ((number(paper?.avgRoe, 0) ?? 0) * paperClosed)) /
      closed
    : null;
  return {
    ...sample,
    closed,
    win,
    loss,
    wr: decisive ? (win / decisive) * 100 : null,
    avgRoe,
    pnl: (number(sample?.pnl, 0) ?? 0) + (number(paper?.pnl, 0) ?? 0),
    paperAddedClosed: paperClosed,
    paperAddedPnl: number(paper?.pnl, 0) ?? 0,
  };
}

function strengthFromSample(sample, fallback = "NEUTRAL") {
  const closed = number(sample?.closed, 0) ?? 0;
  const wr = number(sample?.wr);
  const avgRoe = number(sample?.avgRoe);
  const pnl = number(sample?.pnl, 0) ?? 0;
  if (!closed) return fallback;
  if (closed >= 8 && wr != null && wr >= 80 && avgRoe != null && avgRoe >= 3 && pnl > 0)
    return "STRONG";
  if (closed >= 3 && pnl > 0 && avgRoe != null && avgRoe >= 0.5)
    return "GOOD";
  if (closed > 0 && (pnl < 0 || (avgRoe != null && avgRoe < -0.2)))
    return "BAD";
  return "NEUTRAL";
}

function applyPaperSamplesToRecommendations(
  recommendations = [],
  paperTrades = [],
  baselineDay = "",
) {
  const activeKeys = new Set(
    recommendations.map((item) =>
      recommendationKey(item.page, item.btcPhase, item.combo),
    ),
  );
  const paperRows = (paperTrades ?? []).filter((trade) => {
    if (trade?.paperMode !== RECOMMENDED_PAPER_MODE) return false;
    const activeDay = String(trade?.activeDateUtc ?? tradeDay(trade));
    return !baselineDay || (activeDay && activeDay > baselineDay);
  });
  const paperByKey = new Map(
    paperComboStats(paperRows, activeKeys).map((group) => [
      String(group.key ?? ""),
      group,
    ]),
  );
  return recommendations.map((item) => {
    const key = recommendationKey(item.page, item.btcPhase, item.combo);
    const paper = paperByKey.get(key);
    const effectiveSamples = (item.samples ?? []).map((sample) =>
      mergeSampleWithPaper(sample, paper),
    );
    const bestDays = Number(item?.bestSample?.days);
    const effectiveBestSample =
      effectiveSamples.find((sample) => Number(sample.days) === bestDays) ??
      mergeSampleWithPaper(item.bestSample ?? {}, paper);
    const effectiveStrength = strengthFromSample(
      effectiveBestSample,
      item.strength ?? "NEUTRAL",
    );
    return {
      ...item,
      samples: effectiveSamples,
      sourceBestSample: item.bestSample,
      bestSample: effectiveBestSample,
      effectiveBestSample,
      sourceStrength: item.strength,
      strength: effectiveStrength,
      effectiveStrength,
      paperSampleKey: key,
      paperSampleAdded: paper
        ? {
            total: paper.total,
            open: paper.open,
            pending: paper.pending,
            closed: paper.closed,
            wins: paper.wins,
            losses: paper.losses,
            breakeven: paper.breakeven,
            pnl: paper.pnl,
            avgRoe: paper.avgRoe,
            wr: paper.wr,
          }
        : null,
    };
  });
}

function scaleTradeForMargin(trade, targetMargin) {
  const normalizedTarget = number(targetMargin);
  const sourceMargin = number(
    trade?.marginUsdt ??
      trade?.margin ??
      trade?.orderUsd ??
      trade?.orderSizeUsd,
  );
  if (normalizedTarget == null || normalizedTarget <= 0) {
    return {
      ...trade,
      recommendedSourceMarginUsdt: sourceMargin,
      recommendedTargetMarginUsdt: sourceMargin,
    };
  }
  if (sourceMargin == null || sourceMargin <= 0) {
    return {
      ...trade,
      marginUsdt: normalizedTarget,
      recommendedSourceMarginUsdt: sourceMargin,
      recommendedTargetMarginUsdt: normalizedTarget,
    };
  }
  const ratio = normalizedTarget / sourceMargin;
  const scaled = { ...trade, marginUsdt: normalizedTarget };
  for (const key of [
    "quantity",
    "qty",
    "originalQuantity",
    "remainingQuantity",
    "closedQuantity",
    "pnl",
    "netPnl",
    "realizedPnl",
    "unrealizedPnl",
    "grossPnl",
    "fee",
    "fees",
    "entryFee",
    "exitFee",
    "estimatedFee",
    "estimatedFees",
  ]) {
    const value = number(trade?.[key]);
    if (value != null) scaled[key] = value * ratio;
  }
  return {
    ...scaled,
    recommendedSourceMarginUsdt: sourceMargin,
    recommendedTargetMarginUsdt: normalizedTarget,
    recommendedMarginScale: ratio,
  };
}

function recommendedTradePlan({
  page,
  trade,
  recommendation,
  clusterFullSizeCount,
}) {
  const phaseReason = phaseTestReason(page, trade, btcPhase(trade));
  if (phaseReason)
    return {
      marginUsdt: RECOMMENDED_TEST_MARGIN_USDT,
      label: "PHASE TEST $1",
      reason: phaseReason,
    };
  if (!samplePassesFullSize(recommendation)) {
    return {
      marginUsdt: RECOMMENDED_TEST_MARGIN_USDT,
      label: "SAMPLE TEST $1",
      reason:
        "Exact-phase sample is below 8 trades / 80% WR / 3% AvgROE / positive PnL",
    };
  }
  if (clusterFullSizeCount >= RECOMMENDED_CLUSTER_FULL_SIZE_LIMIT) {
    return {
      marginUsdt: RECOMMENDED_TEST_MARGIN_USDT,
      label: "CLUSTER TEST $1",
      reason:
        "More than 3 full-size trades for the same page + side + BTC phase within 15 minutes",
    };
  }
  const sourceMargin = number(
    trade?.marginUsdt ??
      trade?.margin ??
      trade?.orderUsd ??
      trade?.orderSizeUsd,
  );
  return {
    marginUsdt: sourceMargin,
    label: sourceMargin != null ? `FULL $${sourceMargin}` : "FULL SIZE",
    reason: "Exact-phase sample passes the full-size criteria",
  };
}

async function loadSourceRows(page) {
  const files = sourceFiles[page] ?? [];
  const rows = [];
  for (const file of files) {
    const store = await readJsonCached(file, { trades: [] });
    const trades = Array.isArray(store)
      ? store
      : Array.isArray(store?.trades)
        ? store.trades
        : [];
    for (const trade of trades) {
      if (page === "ema" && !isEmaTrade(trade)) continue;
      if (page === "pump" && isEmaTrade(trade)) continue;
      rows.push(trade);
    }
  }
  return rows;
}

export async function getRecommendedSignals(day = "") {
  const store = await readJsonCached(recommendationFile, {
    version: 1,
    criteria: {},
    days: {},
  });
  const availableDays = Object.keys(store?.days ?? {})
    .sort()
    .reverse();
  const selectedDay = store?.days?.[day] ? day : (availableDays[0] ?? "");
  const selected = store?.days?.[selectedDay] ?? {
    activeDateUtc: selectedDay,
    recommendations: [],
  };
  return {
    updatedAt: store?.updatedAt ?? null,
    criteria: store?.criteria ?? {},
    availableDays,
    selectedDay,
    ...selected,
  };
}

async function syncDay(day, recommendations, baselineDay = "") {
  if (!day) return;
  const now = Date.now();
  if (now - (syncAtByDay.get(day) ?? 0) < SOURCE_SYNC_INTERVAL_MS) return;
  syncAtByDay.set(day, now);
  const paperSnapshot = await readJsonCached(paperFile, {
    version: 1,
    updatedAt: null,
    trades: [],
  });
  const independentPaperTrades = (paperSnapshot.trades ?? []).filter(
    (trade) => trade?.paperMode === RECOMMENDED_PAPER_MODE,
  );
  const effectiveRecommendations = applyPaperSamplesToRecommendations(
    recommendations,
    independentPaperTrades,
    baselineDay,
  );
  const recommendationMap = new Map(
    effectiveRecommendations.map((item) => [
      recommendationKey(item.page, item.btcPhase, item.combo),
      item,
    ]),
  );
  const matches = new Map();
  const clusterTimes = new Map();
  const pages = new Set([
    ...effectiveRecommendations.map((item) => item.page),
    ...independentPaperTrades.map((trade) => trade?.sourcePage),
  ]);
  const existingPaperById = new Map(
    independentPaperTrades.map((trade) => [trade.id, trade]),
  );
  for (const page of [...pages].filter((item) => sourceFiles[item])) {
    const rows = (await loadSourceRows(page)).sort(
      (a, b) => tradeTimeMs(a) - tradeTimeMs(b),
    );
    if (!effectiveRecommendations.some((item) => item.page === page)) continue;
    for (const trade of rows) {
      if (tradeDay(trade) !== day) continue;
      const phase = btcPhase(trade);
      const recommendation = recommendationMap.get(
        recommendationKey(page, phase, comboOf(page, trade)),
      );
      if (!recommendation) continue;
      const openedAt = tradeTimeMs(trade);
      const clusterKey = `${page}|${normalizePart(trade?.side)}|${phase}`;
      const recent = (clusterTimes.get(clusterKey) ?? []).filter(
        (time) =>
          openedAt > 0 && openedAt - time < RECOMMENDED_CLUSTER_WINDOW_MS,
      );
      const plan = recommendedTradePlan({
        page,
        trade,
        recommendation,
        clusterFullSizeCount: recent.length,
      });
      const plannedTrade = applyRecommendedDefaultSl(
        scaleTradeForMargin(trade, plan.marginUsdt),
      );
      if (
        !String(plan.label).includes("TEST $1") &&
        number(plan.marginUsdt, 0) > RECOMMENDED_TEST_MARGIN_USDT &&
        openedAt > 0
      )
        recent.push(openedAt);
      clusterTimes.set(clusterKey, recent);
      const sourceTradeId = tradeId(page, trade);
      const cloneId = `recommended-${sourceTradeId}`;
      const current = matches.get(cloneId) ?? existingPaperById.get(cloneId);
      const recommendationIds = [
        ...new Set([...(current?.recommendationIds ?? []), recommendation.id]),
      ];
      if (current) {
        matches.set(cloneId, {
          ...current,
          recommendationIds,
          recommendationStrength: recommendation.strength,
          recommendationWindows: recommendation.matchedWindows,
          recommendationBestSample: recommendation.bestSample,
          syncedAt: new Date().toISOString(),
        });
        continue;
      }
      // New paper entries are event-driven from the exact source OPEN event.
      // The file scan remains migration/history reconciliation only; creating a
      // clone here reintroduces 30-90s latency and preferentially selects source
      // trades that stayed OPEN long enough to be observed.
      if (process.env.RECOMMENDED_LEGACY_SYNC_CREATE !== "true") continue;
      const sourceStatus = normalizePart(trade?.status);
      if (!["OPEN", "PENDING", "ENTRY_READY"].includes(sourceStatus)) continue;
      const cloneOpenedAt = new Date().toISOString();
      const entry = entryOf(plannedTrade);
      const margin = marginOf(plannedTrade);
      const leverage = leverageOf(plannedTrade);
      if (!entry || !margin) continue;
      matches.set(cloneId, {
        ...plannedTrade,
        id: cloneId,
        paperMode: RECOMMENDED_PAPER_MODE,
        status: "OPEN",
        outcome: null,
        closeReason: null,
        closedAt: null,
        exitPrice: null,
        closePrice: null,
        pnl: 0,
        netPnl: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        roe: 0,
        roePct: 0,
        entryPrice: entry,
        fillPrice: entry,
        quantity: margin * leverage / entry,
        originalQuantity: margin * leverage / entry,
        score: scoreOf(trade),
        scoreBucket: scoreBucket(trade),
        sourcePage: page,
        sourceTradeId,
        recommendationIds,
        recommendationStrength: recommendation.strength,
        recommendationWindows: recommendation.matchedWindows,
        recommendationCombo: recommendation.combo,
        recommendationBtcPhase: recommendation.btcPhase,
        recommendationBestSample: recommendation.bestSample,
        recommendedTradePlanLabel: plan.label,
        recommendedTradePlanReason: plan.reason,
        recommendedTradePlanVersion: "independent-socket-v2-sl16",
        activeDateUtc: day,
        sourceSignalStatus: sourceStatus,
        sourceSignalOutcome: trade?.outcome ?? null,
        sourceSignalAt: trade?.createdAt ?? trade?.openedAt ?? trade?.time ?? null,
        createdAt: cloneOpenedAt,
        openedAt: cloneOpenedAt,
        clonedAt: cloneOpenedAt,
        syncedAt: cloneOpenedAt,
      });
    }
  }
  const refreshed = new Map();
  for (const existing of independentPaperTrades) {
    refreshed.set(existing.id, {
      ...existing,
      syncedAt: new Date().toISOString(),
    });
  }
  writeLock = writeLock.then(async () => {
    const store = await readJsonCached(paperFile, {
      version: 1,
      updatedAt: null,
      trades: [],
    });
    const byId = new Map(
      (store.trades ?? [])
        .filter((trade) => trade?.paperMode === RECOMMENDED_PAPER_MODE)
        .map((trade) => [trade.id, trade]),
    );
    for (const [id, clone] of refreshed) {
      const existing = byId.get(id);
      byId.set(
        id,
        preserveRecommendedSl16Close(existing, { ...(existing ?? {}), ...clone }),
      );
    }
    for (const [id, clone] of matches) {
      const existing = byId.get(id);
      byId.set(
        id,
        preserveRecommendedSl16Close(existing, { ...(existing ?? {}), ...clone }),
      );
    }
    const trades = [...byId.values()]
      .sort(
        (a, b) =>
          Date.parse(b.createdAt ?? b.openedAt ?? b.time ?? 0) -
          Date.parse(a.createdAt ?? a.openedAt ?? a.time ?? 0),
      )
      .slice(0, 25000);
    await writeJsonAtomic(paperFile, {
      version: 2,
      paperMode: RECOMMENDED_PAPER_MODE,
      updatedAt: new Date().toISOString(),
      trades,
    });
  });
  await writeLock;
}

function breakoutAgeOf(trade) {
  const direct = trade?.breakoutAge == null ? null : number(trade.breakoutAge);
  if (direct != null) return direct;
  const match = String(trade?.note ?? "").match(/breakout-(\d+)bars/i);
  return match ? number(match[1]) : null;
}

function directEventTiming({ trade, marketEntry, now = Date.now() }) {
  const sourceEntry = entryOf(trade);
  const marketPrice = number(marketEntry?.price);
  const marketAt = number(marketEntry?.at);
  const receivedAt = number(marketEntry?.receivedAt);
  const sourceAt = Date.parse(String(trade?.openedAt ?? trade?.filledAt ?? trade?.createdAt ?? "")) || 0;
  // A source paper can carry an older signal timestamp even though this callback
  // is delivered immediately when the OPEN row is created. Use receipt latency
  // for freshness, while retaining sourceAt for audit/day attribution.
  const eventLatencyMs = receivedAt != null
    ? Math.max(0, now - receivedAt)
    : sourceAt > 0 ? Math.max(0, now - sourceAt) : null;
  const marketAgeMs = marketAt != null ? Math.max(0, now - marketAt) : null;
  const side = normalizePart(trade?.side);
  const rawDrift = sourceEntry && marketPrice
    ? ((marketPrice - sourceEntry) / sourceEntry) * 100
    : null;
  const adverseChasePct = rawDrift == null ? null : side === "SHORT" ? -rawDrift : rawDrift;
  return { sourceEntry, marketPrice, marketAt, receivedAt, sourceAt, eventLatencyMs, marketAgeMs, rawDrift, adverseChasePct };
}

function recommendedSourceLayer(strengthValue) {
  const strength = normalizePart(strengthValue);
  if (strength === "STRONG") {
    return {
      tier: "GOOD",
      reason: "Recommendation STRONG tại thời điểm clone.",
    };
  }
  if (["BAD", "NEUTRAL"].includes(strength)) {
    return {
      tier: "RISK",
      reason: `Recommendation ${strength}; chưa có edge nguồn đủ mạnh.`,
    };
  }
  return {
    tier: "WATCH",
    reason:
      strength === "GOOD"
        ? "Recommendation GOOD nhưng chưa đạt mức STRONG."
        : "Thiếu nhãn chất lượng nguồn tại thời điểm clone.",
  };
}

function recommendedCloneLayer({
  entryMode,
  eventLatencyMs,
  marketAgeMs,
  entryVsSourcePct,
  adverseChasePct,
  duplicateActiveCount = 0,
} = {}) {
  const mode = normalizePart(entryMode);
  const latency = number(eventLatencyMs);
  const marketAge = number(marketAgeMs);
  const drift = number(entryVsSourcePct);
  const adverseChase = number(adverseChasePct);
  const absoluteDrift = drift == null ? null : Math.abs(drift);
  const duplicateCount = Math.max(0, number(duplicateActiveCount, 0) ?? 0);
  const riskReasons = [];
  const watchReasons = [];

  if (mode !== RECOMMENDED_DIRECT_EVENT_MODE)
    riskReasons.push("không phải đường clone source-open trực tiếp");
  if (duplicateCount > 0)
    riskReasons.push(`${duplicateCount} lệnh cùng symbol/side còn mở trong cụm 15 phút`);
  if (latency == null) watchReasons.push("thiếu latency sự kiện");
  else if (latency > 10_000) riskReasons.push(`latency ${latency}ms > 10s`);
  if (marketAge == null) watchReasons.push("thiếu tuổi market tick");
  else if (marketAge > 5_000) riskReasons.push(`market tick ${marketAge}ms > 5s`);
  if (
    adverseChase != null &&
    adverseChase > RECOMMENDED_CLONE_GOOD_DRIFT_PCT
  ) {
    riskReasons.push(`chase bất lợi ${adverseChase.toFixed(3)}% > 0.08%`);
  }
  if (
    absoluteDrift != null &&
    absoluteDrift > RECOMMENDED_CLONE_RISK_DRIFT_PCT
  ) {
    riskReasons.push(`lệch giá nguồn ${absoluteDrift.toFixed(3)}% > 0.30%`);
  } else if (
    absoluteDrift != null &&
    absoluteDrift > RECOMMENDED_CLONE_GOOD_DRIFT_PCT
  ) {
    watchReasons.push(`lệch giá nguồn ${absoluteDrift.toFixed(3)}% > 0.08%`);
  }
  if (absoluteDrift == null) watchReasons.push("thiếu độ lệch giá nguồn");

  if (riskReasons.length) {
    return { tier: "RISK", reason: riskReasons.join("; ") };
  }
  if (watchReasons.length) {
    return { tier: "WATCH", reason: watchReasons.join("; ") };
  }
  return {
    tier: "GOOD",
    reason: `source-open trực tiếp; lệch giá ${absoluteDrift?.toFixed(3) ?? "-"}%`,
  };
}

function recommendedPaperLayerSnapshot({
  recommendationStrength,
  entryMode,
  eventLatencyMs,
  marketAgeMs,
  entryVsSourcePct,
  adverseChasePct,
  duplicateActiveCount = 0,
} = {}) {
  const source = recommendedSourceLayer(recommendationStrength);
  const clone = recommendedCloneLayer({
    entryMode,
    eventLatencyMs,
    marketAgeMs,
    entryVsSourcePct,
    adverseChasePct,
    duplicateActiveCount,
  });
  const combinedTier =
    source.tier === "RISK" || clone.tier === "RISK"
      ? "RISK"
      : source.tier === "GOOD" && clone.tier === "GOOD"
        ? "GOOD"
        : "WATCH";
  return {
    recommendedSourceLayer: source.tier,
    recommendedSourceLayerReason: source.reason,
    recommendedCloneLayer: clone.tier,
    recommendedCloneLayerReason: clone.reason,
    recommendedTwoLayerTier: combinedTier,
    recommendedTwoLayerReason: `SOURCE ${source.tier} × CLONE ${clone.tier}`,
    recommendedCloneDuplicateActiveCount: Math.max(
      0,
      number(duplicateActiveCount, 0) ?? 0,
    ),
    recommendedLayerVersion: RECOMMENDED_TWO_LAYER_VERSION,
    recommendedLayerObservationOnly: true,
  };
}

function recommendedBtcAlignment(trade = {}) {
  const sideValue = normalizePart(trade?.side ?? trade?.action);
  const side = sideValue.includes("SHORT")
    ? "SHORT"
    : sideValue.includes("LONG")
      ? "LONG"
      : sideValue;
  const phase = normalizePart(
    trade?.recommendationBtcPhase ??
      trade?.btcPhase ??
      trade?.btcPhaseLabel ??
      trade?.btcRegimeAtEntry,
  );
  const direction = phase.includes("DOWN")
    ? "DOWN"
    : phase.includes("UP")
      ? "UP"
      : null;
  if (!["LONG", "SHORT"].includes(side) || !direction) {
    return {
      key: "BTC_NO_DATA",
      label: "BTC NO DATA",
    };
  }
  const followsBtc =
    (side === "LONG" && direction === "UP") ||
    (side === "SHORT" && direction === "DOWN");
  return followsBtc
    ? { key: "THEO_BTC", label: "THEO BTC" }
    : { key: "NGUOC_BTC", label: "NGƯỢC BTC" };
}

function recommendedMarketFitGroup(trade = {}) {
  const twoLayerTier = ["GOOD", "WATCH", "RISK"].includes(
    normalizePart(trade?.recommendedTwoLayerTier),
  )
    ? normalizePart(trade?.recommendedTwoLayerTier)
    : "WATCH";
  const alignment = recommendedBtcAlignment(trade);
  return {
    key: `${twoLayerTier}_X_${alignment.key}`,
    label: `${twoLayerTier} × ${alignment.label}`,
    twoLayerTier,
    btcAlignment: alignment.key,
    btcAlignmentLabel: alignment.label,
  };
}

function emptyRecommendedMarketFitStats() {
  return {
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    closedPnl: 0,
    roeTotal: 0,
  };
}

function addRecommendedMarketFitClosedTrade(stats, trade) {
  const pnl = number(trade?.pnl ?? trade?.netPnl, 0) ?? 0;
  const roe = number(trade?.roe ?? trade?.roePct, 0) ?? 0;
  stats.closed += 1;
  stats.closedPnl += pnl;
  stats.roeTotal += roe;
  if (pnl > 0) stats.wins += 1;
  else if (pnl < 0) stats.losses += 1;
  else stats.breakeven += 1;
  return stats;
}

function recommendedMarketFitMetrics(stats = emptyRecommendedMarketFitStats()) {
  const decisive = stats.wins + stats.losses;
  return {
    closed: stats.closed,
    wins: stats.wins,
    losses: stats.losses,
    breakeven: stats.breakeven,
    closedPnl: stats.closedPnl,
    wr: decisive ? (stats.wins / decisive) * 100 : null,
    avgRoe: stats.closed ? stats.roeTotal / stats.closed : null,
  };
}

function recommendedMarketFitVerdict(stats, btcAlignment = "BTC_NO_DATA") {
  const metrics =
    Object.prototype.hasOwnProperty.call(stats ?? {}, "roeTotal")
      ? recommendedMarketFitMetrics(stats)
      : stats;
  if (btcAlignment === "BTC_NO_DATA" || metrics.closed < RECOMMENDED_MARKET_FIT_MIN_SAMPLE) {
    return {
      tier: "WATCH",
      label: "NO DATA",
      sampleStatus: "NO_DATA",
    };
  }
  if (metrics.closed < RECOMMENDED_MARKET_FIT_DECISION_SAMPLE) {
    return {
      tier: "WATCH",
      label: "WATCH",
      sampleStatus: "PROVISIONAL",
    };
  }
  if (
    metrics.closedPnl > 0 &&
    metrics.avgRoe > 0 &&
    metrics.wr >= 55
  ) {
    return { tier: "GOOD", label: "GOOD", sampleStatus: "READY" };
  }
  if (
    metrics.closedPnl < 0 &&
    metrics.avgRoe < 0 &&
    metrics.wr < 50
  ) {
    return { tier: "RISK", label: "RISK", sampleStatus: "READY" };
  }
  return { tier: "WATCH", label: "WATCH", sampleStatus: "READY" };
}

function recommendedMarketFitSnapshot(trade, stats = emptyRecommendedMarketFitStats()) {
  const group = recommendedMarketFitGroup(trade);
  const metrics = recommendedMarketFitMetrics(stats);
  const verdict = recommendedMarketFitVerdict(metrics, group.btcAlignment);
  const wrLabel = metrics.wr == null ? "-" : `${metrics.wr.toFixed(1)}%`;
  const pnlLabel = `${metrics.closedPnl >= 0 ? "+" : ""}${metrics.closedPnl.toFixed(3)}`;
  const roeLabel =
    metrics.avgRoe == null
      ? "-"
      : `${metrics.avgRoe >= 0 ? "+" : ""}${metrics.avgRoe.toFixed(1)}%`;
  return {
    recommendedMarketFitKey: group.key,
    recommendedMarketFitGroupLabel: group.label,
    recommendedMarketFitAlignment: group.btcAlignment,
    recommendedMarketFitAlignmentLabel: group.btcAlignmentLabel,
    recommendedMarketFitTier: verdict.tier,
    recommendedMarketFitLabel: `M4 ${verdict.label}`,
    recommendedMarketFitReason:
      `${group.label} · trước entry: ${metrics.closed} đóng · WR ${wrLabel}` +
      ` · PnL ${pnlLabel} · AvgROE ${roeLabel} · OBSERVE ONLY`,
    recommendedMarketFitSampleStatus: verdict.sampleStatus,
    recommendedMarketFitSamplesBeforeEntry: metrics.closed,
    recommendedMarketFitWrBeforeEntry: metrics.wr,
    recommendedMarketFitPnlBeforeEntry: metrics.closedPnl,
    recommendedMarketFitAvgRoeBeforeEntry: metrics.avgRoe,
    recommendedMarketFitVersion: RECOMMENDED_MARKET_FIT_VERSION,
    recommendedMarketFitObservationOnly: true,
  };
}

function recommendedMarketFitStatsBefore(trades, trade, beforeAt) {
  const targetGroup = recommendedMarketFitGroup(trade);
  const stats = emptyRecommendedMarketFitStats();
  for (const prior of trades) {
    const closedAt = Date.parse(prior?.closedAt ?? "") || 0;
    if (!closedAt || closedAt > beforeAt) continue;
    if (recommendedMarketFitGroup(prior).key !== targetGroup.key) continue;
    addRecommendedMarketFitClosedTrade(stats, prior);
  }
  return stats;
}

function decorateRecommendedMarketFitSnapshots(trades = []) {
  const entries = trades
    .map((trade, index) => ({
      trade,
      index,
      openedAt:
        Date.parse(trade?.clonedAt ?? trade?.openedAt ?? trade?.createdAt ?? "") ||
        0,
    }))
    .sort((left, right) => left.openedAt - right.openedAt);
  const closeEvents = trades
    .map((trade) => ({
      trade,
      closedAt: Date.parse(trade?.closedAt ?? "") || 0,
    }))
    .filter((event) => event.closedAt > 0)
    .sort((left, right) => left.closedAt - right.closedAt);
  const statsByGroup = new Map();
  const decorated = [...trades];
  let closeIndex = 0;

  for (const entry of entries) {
    while (
      closeIndex < closeEvents.length &&
      closeEvents[closeIndex].closedAt <= entry.openedAt
    ) {
      const closedTrade = closeEvents[closeIndex].trade;
      const group = recommendedMarketFitGroup(closedTrade);
      const stats =
        statsByGroup.get(group.key) ?? emptyRecommendedMarketFitStats();
      addRecommendedMarketFitClosedTrade(stats, closedTrade);
      statsByGroup.set(group.key, stats);
      closeIndex += 1;
    }
    const hasSnapshot =
      entry.trade?.recommendedMarketFitVersion &&
      entry.trade?.recommendedMarketFitKey &&
      entry.trade?.recommendedMarketFitTier &&
      entry.trade?.recommendedMarketFitLabel;
    if (hasSnapshot) continue;
    const group = recommendedMarketFitGroup(entry.trade);
    decorated[entry.index] = {
      ...entry.trade,
      ...recommendedMarketFitSnapshot(
        entry.trade,
        statsByGroup.get(group.key) ?? emptyRecommendedMarketFitStats(),
      ),
    };
  }
  return decorated;
}

function decorateRecommendedPaperLayers(trades = []) {
  const chronological = [...trades].sort(
    (left, right) =>
      Date.parse(left?.clonedAt ?? left?.openedAt ?? left?.createdAt ?? 0) -
      Date.parse(right?.clonedAt ?? right?.openedAt ?? right?.createdAt ?? 0),
  );
  const priorBySymbolSide = new Map();
  const decoratedById = new Map();

  for (const trade of chronological) {
    const openedAt =
      Date.parse(trade?.clonedAt ?? trade?.openedAt ?? trade?.createdAt ?? "") ||
      0;
    const key = `${normalizePart(trade?.symbol)}|${normalizePart(trade?.side)}`;
    const priorRows = priorBySymbolSide.get(key) ?? [];
    const duplicateActiveCount = openedAt
      ? priorRows.filter((prior) => {
          const priorOpenedAt =
            Date.parse(
              prior?.clonedAt ?? prior?.openedAt ?? prior?.createdAt ?? "",
            ) || 0;
          const priorClosedAt = Date.parse(prior?.closedAt ?? "") || 0;
          return (
            priorOpenedAt > 0 &&
            openedAt - priorOpenedAt <= RECOMMENDED_CLUSTER_WINDOW_MS &&
            (!priorClosedAt || priorClosedAt > openedAt)
          );
        }).length
      : 0;
    const hasSnapshot =
      trade?.recommendedLayerVersion &&
      trade?.recommendedSourceLayer &&
      trade?.recommendedCloneLayer &&
      trade?.recommendedTwoLayerTier;
    const decorated = hasSnapshot
      ? trade
      : {
          ...trade,
          ...recommendedPaperLayerSnapshot({
            recommendationStrength: trade?.recommendationStrength,
            entryMode: trade?.recommendedEntryMode,
            eventLatencyMs: trade?.sourceEventLatencyMs,
            marketAgeMs: trade?.marketEntrySourceAgeMs,
            entryVsSourcePct: trade?.entryVsSourcePct,
            adverseChasePct: trade?.adverseChasePct,
            duplicateActiveCount,
          }),
        };
    decoratedById.set(String(trade?.id ?? ""), decorated);
    priorRows.push(trade);
    priorBySymbolSide.set(key, priorRows);
  }

  const layerDecorated = trades.map(
    (trade) => decoratedById.get(String(trade?.id ?? "")) ?? trade,
  );
  return decorateRecommendedSupportEntrySnapshots(
    decorateRecommendedMarketDispersionSnapshots(
      decorateRecommendedMarketPointFitSnapshots(
        decorateRecommendedBacktestConfidenceSnapshots(
          decorateRecommendedDayRegimeSnapshots(
            decorateRecommendedMarketFitSnapshots(layerDecorated),
          ),
        ),
      ),
    ),
  );
}

export async function processRecommendedSourceOpenEvent({
  page,
  trade,
  marketEntry,
  marketDirectionAtSignal = null,
  learningFlagsByRecommendationId = null,
  catalogOverride = null,
  paperFileOverride = null,
  liveOrderEvaluator = null,
} = {}) {
  const sourcePage = String(page ?? "").trim().toLowerCase();
  const sourceStatus = normalizePart(trade?.status);
  if (!sourceFiles[sourcePage]) return { created: false, reason: "UNSUPPORTED_SOURCE_PAGE" };
  if (sourceStatus !== "OPEN") return { created: false, reason: "SOURCE_NOT_OPEN" };

  const now = Date.now();
  const timing = directEventTiming({ trade, marketEntry, now });
  const maxEventAgeMs = Math.max(1_000, number(process.env.RECOMMENDED_EVENT_MAX_AGE_MS, 10_000));
  const maxMarketAgeMs = Math.max(500, number(process.env.RECOMMENDED_EVENT_MARKET_MAX_AGE_MS, 5_000));
  const maxChasePct = Math.max(0, number(process.env.RECOMMENDED_EVENT_MAX_ADVERSE_CHASE_PCT, 0.15));
  const maxBreakoutAgeBars = Math.max(0, number(process.env.RECOMMENDED_EVENT_MAX_BREAKOUT_AGE_BARS, 2));
  const breakoutAge = breakoutAgeOf(trade);
  const stage = normalizePart(stageOfEma(trade));
  if (!timing.sourceEntry || !timing.marketPrice) return { created: false, reason: "MISSING_EVENT_MARKET_PRICE" };
  if (timing.eventLatencyMs == null || timing.eventLatencyMs > maxEventAgeMs) {
    return { created: false, reason: "SOURCE_EVENT_STALE", eventLatencyMs: timing.eventLatencyMs };
  }
  if (timing.marketAgeMs == null || timing.marketAgeMs > maxMarketAgeMs) {
    return { created: false, reason: "EVENT_MARKET_STALE", marketAgeMs: timing.marketAgeMs };
  }
  if (timing.adverseChasePct != null && timing.adverseChasePct > maxChasePct) {
    return { created: false, reason: "EVENT_MARKET_CHASE", adverseChasePct: timing.adverseChasePct };
  }
  if (/BREAKOUT|BREAKDOWN/.test(stage)
      && breakoutAge != null
      && breakoutAge > maxBreakoutAgeBars) {
    return { created: false, reason: "BREAKOUT_TOO_OLD", breakoutAge };
  }

  const catalog = catalogOverride ?? await getRecommendedSignals();
  const targetPaperFile = paperFileOverride ?? paperFile;
  const day = timing.sourceAt ? new Date(timing.sourceAt).toISOString().slice(0, 10) : tradeDay(trade);
  if (!day || day !== catalog.selectedDay) {
    return { created: false, reason: "SOURCE_DAY_NOT_ACTIVE", day, selectedDay: catalog.selectedDay };
  }

  let result = { created: false, reason: "NO_RECOMMENDATION" };
  writeLock = writeLock.then(async () => {
    const store = await readJsonCached(targetPaperFile, { version: 2, updatedAt: null, trades: [] });
    const independentPaperTrades = (store.trades ?? []).filter(
      (row) => row?.paperMode === RECOMMENDED_PAPER_MODE,
    );
    const effectiveRecommendations = applyPaperSamplesToRecommendations(
      catalog.recommendations ?? [],
      independentPaperTrades,
      catalog.basedOnDateUtc ?? "",
    );
    const phase = btcPhase(trade);
    const combo = comboOf(sourcePage, trade);
    const recommendation = effectiveRecommendations.find(
      (item) => recommendationKey(item.page, item.btcPhase, item.combo)
        === recommendationKey(sourcePage, phase, combo),
    );
    if (!recommendation) return;

    const sourceTradeId = tradeId(sourcePage, trade);
    const cloneId = `recommended-${sourceTradeId}`;
    if ((store.trades ?? []).some((row) => row.id === cloneId)) {
      result = { created: false, reason: "ALREADY_CLONED", id: cloneId };
      return;
    }

    const clusterCutoff = now - RECOMMENDED_CLUSTER_WINDOW_MS;
    const clusterFullSizeCount = independentPaperTrades.filter((row) =>
      row.sourcePage === sourcePage
      && normalizePart(row.side) === normalizePart(trade.side)
      && row.recommendationBtcPhase === phase
      && Date.parse(row.openedAt ?? "") >= clusterCutoff
      && !String(row.recommendedTradePlanLabel ?? "").includes("TEST $1")
      && number(row.marginUsdt, 0) > RECOMMENDED_TEST_MARGIN_USDT).length;
    const duplicateActiveCount = independentPaperTrades.filter((row) =>
      normalizePart(row.symbol) === normalizePart(trade.symbol)
      && normalizePart(row.side) === normalizePart(trade.side)
      && ["OPEN", "PENDING", "ENTRY_READY"].includes(normalizePart(row.status))
      && Date.parse(row.openedAt ?? row.createdAt ?? "") >= clusterCutoff).length;
    const plan = recommendedTradePlan({ sourcePage, page: sourcePage, trade, recommendation, clusterFullSizeCount });
    const marketTrade = {
      ...scaleTradeForMargin(trade, plan.marginUsdt),
      entry: timing.marketPrice,
      entryPrice: timing.marketPrice,
      fillPrice: timing.marketPrice,
    };
    const plannedTrade = applyRecommendedDefaultSl(marketTrade);
    const margin = marginOf(plannedTrade);
    const leverage = leverageOf(plannedTrade);
    if (!margin || !leverage) {
      result = { created: false, reason: "INVALID_TRADE_PLAN" };
      return;
    }
    const cloneOpenedAt = new Date(now).toISOString();
    const learningFlag = learningFlagsByRecommendationId?.[recommendation.id] ?? null;
    const baseClone = {
      ...plannedTrade,
      id: cloneId,
      paperMode: RECOMMENDED_PAPER_MODE,
      recommendedEntryMode: RECOMMENDED_DIRECT_EVENT_MODE,
      status: "OPEN",
      outcome: null,
      closeReason: null,
      closedAt: null,
      exitPrice: null,
      closePrice: null,
      pnl: 0,
      netPnl: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      roe: 0,
      roePct: 0,
      entry: timing.marketPrice,
      entryPrice: timing.marketPrice,
      fillPrice: timing.marketPrice,
      quantity: margin * leverage / timing.marketPrice,
      originalQuantity: margin * leverage / timing.marketPrice,
      score: scoreOf(trade),
      scoreBucket: scoreBucket(trade),
      sourcePage,
      sourceTradeId,
      sourceEntryPrice: timing.sourceEntry,
      sourceEventAt: timing.sourceAt ? new Date(timing.sourceAt).toISOString() : null,
      sourceEventLatencyMs: timing.eventLatencyMs,
      sourceSignalAt: trade?.createdAt ?? trade?.openedAt ?? trade?.time ?? null,
      sourceSignalStatus: sourceStatus,
      sourceSignalOutcome: trade?.outcome ?? null,
      sourceBreakoutAge: breakoutAge,
      marketDirectionAtSignal: recommendedMarketDirectionSnapshot(marketDirectionAtSignal, trade),
      recommendationIds: [recommendation.id],
      recommendationStrength: recommendation.strength,
      recommendationStrengthAtEntry: recommendation.strength,
      recommendationWindows: recommendation.matchedWindows,
      recommendationCombo: recommendation.combo,
      recommendationBtcPhase: recommendation.btcPhase,
      recommendationBestSample: recommendation.bestSample,
      recommendedTradePlanLabel: plan.label,
      recommendedTradePlanReason: plan.reason,
      recommendedTradePlanVersion: "source-open-event-v3-sl16",
      recommendedLearningFlag: learningFlag,
      marketEntrySource: String(marketEntry?.source ?? "source-open-event").slice(0, 40),
      marketEntryAt: timing.marketAt ? new Date(timing.marketAt).toISOString() : null,
      marketEntrySourceAgeMs: timing.marketAgeMs,
      entryVsSourcePct: +timing.rawDrift.toFixed(5),
      adverseChasePct: +timing.adverseChasePct.toFixed(5),
      ...recommendedPaperLayerSnapshot({
        recommendationStrength: recommendation.strength,
        entryMode: RECOMMENDED_DIRECT_EVENT_MODE,
        eventLatencyMs: timing.eventLatencyMs,
        marketAgeMs: timing.marketAgeMs,
        entryVsSourcePct: timing.rawDrift,
        adverseChasePct: timing.adverseChasePct,
        duplicateActiveCount,
      }),
      activeDateUtc: day,
      createdAt: cloneOpenedAt,
      openedAt: cloneOpenedAt,
      clonedAt: cloneOpenedAt,
      syncedAt: cloneOpenedAt,
    };
    const dayRegimeAtEntry = buildRecommendedDayRegimeSnapshot(
      baseClone,
      independentPaperTrades,
      now,
    );
    const baseCloneWithDay = {
      ...baseClone,
      recommendedDayRegimeAtEntry: dayRegimeAtEntry,
      recommendedDaySelectionAtEntry: classifyRecommendedDaySelection(
        baseClone,
        dayRegimeAtEntry,
      ),
    };
    const priorLayerTrades = decorateRecommendedPaperLayers(
      independentPaperTrades,
    );
    const cloneWithMarketFit = {
      ...baseCloneWithDay,
      ...recommendedMarketFitSnapshot(
        baseCloneWithDay,
        recommendedMarketFitStatsBefore(
          priorLayerTrades,
          baseCloneWithDay,
          now,
        ),
      ),
    };
    const cloneWithMarketPoint = {
      ...cloneWithMarketFit,
      ...buildRecommendedMarketPointFitSnapshot(cloneWithMarketFit),
    };
    const cloneWithMarketDispersion = {
      ...cloneWithMarketPoint,
      ...buildRecommendedMarketDispersionSnapshot(cloneWithMarketPoint),
    };
    const clone = {
      ...cloneWithMarketDispersion,
      ...buildRecommendedBacktestConfidenceSnapshot(
        cloneWithMarketDispersion,
        priorLayerTrades,
        now,
      ),
    };
    let persistedClone = clone;
    if (typeof liveOrderEvaluator === "function") {
      let liveDecision;
      try {
        liveDecision = await liveOrderEvaluator(clone, independentPaperTrades);
      } catch (error) {
        liveDecision = {
          decision: "ERROR",
          matchedKeys: error?.liveCardMatchedKeys ?? [],
          version: error?.liveCardWhitelistVersion ?? null,
          attemptedAt: new Date().toISOString(),
          error: String(error?.message ?? error).slice(0, 500),
        };
      }
      persistedClone = {
        ...clone,
        liveCardAutoEligible: true,
        liveCardDecision: liveDecision?.decision ?? null,
        liveCardMatchedKeys: Array.isArray(liveDecision?.matchedKeys)
          ? liveDecision.matchedKeys
          : [],
        liveCardWhitelistVersion: liveDecision?.version ?? null,
        liveCardAttemptedAt: liveDecision?.attemptedAt ?? null,
        liveCardPlacedAt: liveDecision?.placedAt ?? null,
        liveCardOrderId: liveDecision?.orderId ?? null,
        liveCardClientOrderId: liveDecision?.clientOrderId ?? null,
        liveCardLifecycleId: liveDecision?.lifecycleId ?? null,
        liveCardExecutionVersion: liveDecision?.executionVersion ?? null,
        liveCardSourceType: liveDecision?.sourceType ?? null,
        liveCardSignalSource: liveDecision?.signalSource ?? null,
        liveCardEntryOrderType: liveDecision?.entryOrderType ?? null,
        liveCardError: liveDecision?.error ?? null,
      };
    }
    await writeJsonAtomic(targetPaperFile, {
      ...store,
      version: 3,
      paperMode: RECOMMENDED_PAPER_MODE,
      updatedAt: cloneOpenedAt,
      trades: [persistedClone, ...(store.trades ?? [])],
    });
    result = { created: true, reason: "SOURCE_OPEN_EVENT", trade: persistedClone };
  });
  await writeLock;
  return result;
}

export function paperSummary(trades) {
  const closed = trades.filter(
    (trade) =>
      !["OPEN", "PENDING"].includes(String(trade.status ?? "").toUpperCase()),
  );
  const open = trades.length - closed.length;
  const closedPnl = closed.reduce(
    (sum, trade) => sum + (number(trade.pnl ?? trade.netPnl, 0) ?? 0),
    0,
  );
  const activePnl = trades.reduce((sum, trade) => {
    if (normalizePart(trade?.status) !== "OPEN") return sum;
    return sum + (number(trade?.pnl ?? trade?.netPnl, 0) ?? 0);
  }, 0);
  const pnl = closedPnl + activePnl;
  const wins = closed.filter((trade) => (number(trade.pnl, 0) ?? 0) > 0).length;
  const avgRoe = closed.length
    ? closed.reduce((sum, trade) => sum + (number(trade.roe, 0) ?? 0), 0) /
      closed.length
    : null;
  const scores = trades
    .map((trade) => number(trade?.score))
    .filter((score) => score != null);
  const avgScore = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : null;
  return {
    total: trades.length,
    open,
    closed: closed.length,
    wins,
    losses: closed.length - wins,
    wr: closed.length ? (wins / closed.length) * 100 : null,
    pnl,
    closedPnl,
    activePnl,
    avgRoe,
    avgScore,
  };
}

function isRecommendedPaperLiveStatus(trade) {
  return ["OPEN", "PENDING", "ENTRY_READY"].includes(
    normalizePart(trade?.status),
  );
}

export function recommendedLivePricingStats(trades = []) {
  const active = trades.filter(
    (trade) => normalizePart(trade?.status) === "OPEN",
  );
  let pricedActive = 0;
  let socketPricedActive = 0;
  let latestMarkAt = null;
  const sources = {};
  for (const trade of active) {
    const mark = liveMarkOf(trade);
    if (mark == null || mark <= 0) continue;
    pricedActive += 1;
    const source = String(trade?.markSource ?? "persisted");
    sources[source] = (sources[source] ?? 0) + 1;
    if (source.toLowerCase().includes("socket")) socketPricedActive += 1;
    const at = number(trade?.markUpdatedAt);
    if (at != null && (latestMarkAt == null || at > latestMarkAt)) {
      latestMarkAt = at;
    }
  }
  return {
    mode: "SOCKET_FIRST",
    active: active.length,
    pricedActive,
    socketPricedActive,
    missingActive: Math.max(0, active.length - pricedActive),
    latestMarkAt:
      latestMarkAt == null ? null : new Date(latestMarkAt).toISOString(),
    sources,
    pollMs: 5000,
    persistsTickPnl: false,
  };
}

export function paperLayerGroupStats(trades, groupOf) {
  const groups = new Map();
  for (const trade of trades) {
    const group = groupOf(trade);
    const key = String(group?.key ?? "NO_DATA");
    const current = groups.get(key) ?? {
      key,
      label: group?.label ?? key,
      tier: group?.tier ?? "WATCH",
      sourceTier: group?.sourceTier ?? null,
      cloneTier: group?.cloneTier ?? null,
      twoLayerTier: group?.twoLayerTier ?? null,
      btcAlignment: group?.btcAlignment ?? null,
      verdictLabel: group?.verdictLabel ?? null,
      total: 0,
      open: 0,
      pending: 0,
      closed: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      pnl: 0,
      activePnl: 0,
      closedPnl: 0,
      roeTotal: 0,
    };
    const status = normalizePart(trade?.status);
    const pnl = number(trade?.pnl ?? trade?.netPnl, 0) ?? 0;
    const roe = number(trade?.roe ?? trade?.roePct, 0) ?? 0;
    current.total += 1;
    if (["PENDING", "ENTRY_READY"].includes(status)) current.pending += 1;
    else if (status === "OPEN") {
      current.open += 1;
      current.activePnl += pnl;
      current.pnl += pnl;
    }
    else {
      current.closed += 1;
      current.closedPnl += pnl;
      current.pnl += pnl;
      current.roeTotal += roe;
      if (pnl > 0) current.wins += 1;
      else if (pnl < 0) current.losses += 1;
      else current.breakeven += 1;
    }
    groups.set(key, current);
  }
  const rank = { GOOD: 0, WATCH: 1, RISK: 2 };
  return [...groups.values()]
    .map(({ roeTotal, ...group }) => {
      const decisive = group.wins + group.losses;
      return {
        ...group,
        wr: decisive ? (group.wins / decisive) * 100 : null,
        avgRoe: group.closed ? roeTotal / group.closed : null,
      };
    })
    .sort(
      (left, right) =>
        (rank[left.tier] ?? 9) - (rank[right.tier] ?? 9) ||
        right.total - left.total,
    );
}

function paperTwoLayerStats(trades) {
  const source = paperLayerGroupStats(trades, (trade) => {
    const tier = normalizePart(trade?.recommendedSourceLayer);
    return { key: tier, label: `SOURCE ${tier}`, tier };
  });
  const clone = paperLayerGroupStats(trades, (trade) => {
    const tier = normalizePart(trade?.recommendedCloneLayer);
    return { key: tier, label: `CLONE ${tier}`, tier };
  });
  const matrix = paperLayerGroupStats(trades, (trade) => {
    const sourceTier = normalizePart(trade?.recommendedSourceLayer);
    const cloneTier = normalizePart(trade?.recommendedCloneLayer);
    const tier = normalizePart(trade?.recommendedTwoLayerTier);
    return {
      key: `${sourceTier}_X_${cloneTier}`,
      label: `${sourceTier} × ${cloneTier}`,
      sourceTier,
      cloneTier,
      tier,
    };
  });
  const rank = { GOOD: 0, WATCH: 1, RISK: 2 };
  const marketFit = paperLayerGroupStats(trades, (trade) => {
    const group = recommendedMarketFitGroup(trade);
    return {
      ...group,
      tier: "WATCH",
    };
  })
    .map((group) => {
      const verdict = recommendedMarketFitVerdict(
        group,
        group.btcAlignment,
      );
      return {
        ...group,
        tier: verdict.tier,
        verdictLabel:
          verdict.sampleStatus === "NO_DATA"
            ? "NO DATA"
            : verdict.sampleStatus === "PROVISIONAL"
              ? "WATCH 10–29"
              : verdict.label,
        sampleStatus: verdict.sampleStatus,
      };
    })
    .sort(
      (left, right) =>
        (rank[left.tier] ?? 9) - (rank[right.tier] ?? 9) ||
        right.total - left.total,
    );
  const marketFitLabels = paperLayerGroupStats(trades, (trade) => {
    const tier = ["GOOD", "WATCH", "RISK"].includes(
      normalizePart(trade?.recommendedMarketFitTier),
    )
      ? normalizePart(trade?.recommendedMarketFitTier)
      : "WATCH";
    const label =
      String(trade?.recommendedMarketFitLabel ?? "").trim() ||
      `M4 ${tier}`;
    return {
      key: normalizePart(label),
      label,
      tier,
      verdictLabel: label.replace(/^M4\s+/i, ""),
    };
  });
  return {
    version: RECOMMENDED_TWO_LAYER_VERSION,
    marketFitVersion: RECOMMENDED_MARKET_FIT_VERSION,
    observationOnly: true,
    source,
    clone,
    matrix,
    marketFit,
    marketFitLabels,
  };
}

function paperDayRegimeStats(trades) {
  const regime = paperLayerGroupStats(trades, (trade) => {
    const snapshot = trade?.recommendedDayRegimeAtEntry ?? {};
    const label = normalizePart(snapshot?.label ?? "DAY_NO_DATA");
    const presentation = {
      DAY_LONG: { tier: "GOOD", verdictLabel: "LONG" },
      DAY_SHORT: { tier: "RISK", verdictLabel: "SHORT" },
      DAY_MIXED: { tier: "WATCH", verdictLabel: "MIXED" },
      DAY_NO_DATA: { tier: "WATCH", verdictLabel: "NO DATA" },
    }[label] ?? { tier: "WATCH", verdictLabel: "NO DATA" };
    return {
      key: label,
      label: label.replaceAll("_", " "),
      ...presentation,
    };
  });
  const selection = paperLayerGroupStats(trades, (trade) => {
    const snapshot = trade?.recommendedDaySelectionAtEntry ??
      classifyRecommendedDaySelection(
        trade,
        trade?.recommendedDayRegimeAtEntry,
      );
    const tier = ["GOOD", "WATCH", "RISK"].includes(
      normalizePart(snapshot?.tier),
    )
      ? normalizePart(snapshot.tier)
      : "WATCH";
    return {
      key: normalizePart(snapshot?.key ?? "REC_DAY_NO_DATA"),
      label: String(snapshot?.label ?? "DAY NO DATA"),
      tier,
      verdictLabel: tier,
    };
  });
  const sideMatrix = paperLayerGroupStats(trades, (trade) => {
    const side = ["LONG", "SHORT"].includes(normalizePart(trade?.side))
      ? normalizePart(trade.side)
      : "NO_SIDE";
    const state = normalizePart(
      trade?.recommendedDayRegimeAtEntry?.direction ?? "NO_DATA",
    );
    let tier = "WATCH";
    if (side === "SHORT" && ["SHORT", "MIXED"].includes(state)) tier = "GOOD";
    else if (side === "LONG" && state === "MIXED") tier = "GOOD";
    else if (side === "LONG" && ["LONG", "SHORT"].includes(state)) tier = "RISK";
    return {
      key: `${side}_X_DAY_${state}`,
      label: `${side} × DAY ${state}`,
      tier,
      verdictLabel: tier,
    };
  });
  return {
    version: RECOMMENDED_DAY_REGIME_VERSION,
    selectionVersion: RECOMMENDED_DAY_SELECTION_VERSION,
    method: "7 BTC votes at entry · rolling 3 × 15m · threshold ±2.5",
    timezone: "Asia/Bangkok",
    observationOnly: true,
    affectsOrders: false,
    regime,
    selection,
    sideMatrix,
  };
}

export function paperBacktestConfidenceStats(trades) {
  const groups = paperLayerGroupStats(trades, (trade) => {
    const classification = ["PRIME", "GOOD", "WATCH", "RISK", "NO_DATA"].includes(
      normalizePart(trade?.recommendedBacktestConfidenceClass),
    )
      ? normalizePart(trade.recommendedBacktestConfidenceClass)
      : "NO_DATA";
    const tier = classification === "RISK"
      ? "RISK"
      : ["PRIME", "GOOD"].includes(classification)
        ? "GOOD"
        : "WATCH";
    return {
      key: `BT_${classification}`,
      label: `BT ${classification.replaceAll("_", " ")}`,
      tier,
      verdictLabel: classification,
    };
  });
  const rank = { PRIME: 0, GOOD: 1, WATCH: 2, RISK: 3, NO_DATA: 4 };
  groups.sort(
    (left, right) =>
      (rank[normalizePart(left.verdictLabel)] ?? 9) -
        (rank[normalizePart(right.verdictLabel)] ?? 9) ||
      right.total - left.total,
  );
  const reliabilityGroups = paperLayerGroupStats(trades, (trade) => {
    const classification = ["HIGH", "MEDIUM", "LOW"].includes(
      normalizePart(trade?.recommendedBacktestReliabilityClass),
    )
      ? normalizePart(trade.recommendedBacktestReliabilityClass)
      : "LOW";
    const tier = classification === "HIGH"
      ? "GOOD"
      : classification === "MEDIUM"
        ? "WATCH"
        : "RISK";
    return {
      key: `CONF_${classification}`,
      label: `CONF ${classification}`,
      tier,
      verdictLabel: classification,
    };
  });
  const reliabilityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  reliabilityGroups.sort(
    (left, right) =>
      (reliabilityRank[normalizePart(left.verdictLabel)] ?? 9) -
        (reliabilityRank[normalizePart(right.verdictLabel)] ?? 9) ||
      right.total - left.total,
  );
  return {
    version: RECOMMENDED_BACKTEST_CONFIDENCE_VERSION,
    reliabilityVersion: RECOMMENDED_BACKTEST_RELIABILITY_VERSION,
    method:
      "3 ngày trước: source × side × tier 2L × M4; xác nhận realtime bằng cohort/side đã đóng trước entry",
    rules: RECOMMENDED_BACKTEST_CONFIDENCE_RULES,
    observationOnly: true,
    affectsOrders: false,
    groups,
    reliabilityGroups,
  };
}

export function paperMarketPointFitStats(trades) {
  const classRank = {
    STRONG: 0,
    SUPPORT: 1,
    TRANSITION: 2,
    EXHAUSTED: 3,
    HEADWIND: 4,
    NO_DATA: 5,
  };
  const presentation = (trade) => {
    const classification = [
      "STRONG",
      "SUPPORT",
      "TRANSITION",
      "EXHAUSTED",
      "HEADWIND",
      "NO_DATA",
    ].includes(normalizePart(trade?.recommendedMarketPointFitClass))
      ? normalizePart(trade.recommendedMarketPointFitClass)
      : "NO_DATA";
    const tier = ["STRONG", "SUPPORT"].includes(classification)
      ? "GOOD"
      : ["EXHAUSTED", "HEADWIND"].includes(classification)
        ? "RISK"
        : "WATCH";
    return { classification, tier };
  };
  const groups = paperLayerGroupStats(trades, (trade) => {
    const { classification, tier } = presentation(trade);
    return {
      key: `POINT_${classification}`,
      label: `POINT ${classification.replaceAll("_", " ")}`,
      tier,
      verdictLabel: classification,
    };
  }).sort(
    (left, right) =>
      (classRank[normalizePart(left.verdictLabel)] ?? 9) -
        (classRank[normalizePart(right.verdictLabel)] ?? 9) ||
      right.total - left.total,
  );
  const sourceSideMatrix = paperLayerGroupStats(trades, (trade) => {
    const { classification, tier } = presentation(trade);
    const source = normalizePart(trade?.sourcePage ?? "UNKNOWN");
    const side = normalizePart(trade?.side ?? "NO_SIDE");
    return {
      key: `${source}_${side}_X_POINT_${classification}`,
      label:
        `${source} · ${side} × POINT ${classification.replaceAll("_", " ")}`,
      tier,
      verdictLabel: classification,
    };
  }).sort(
    (left, right) =>
      (classRank[normalizePart(left.verdictLabel)] ?? 9) -
        (classRank[normalizePart(right.verdictLabel)] ?? 9) ||
      right.total - left.total,
  );
  return {
    version: RECOMMENDED_MARKET_POINT_FIT_VERSION,
    method:
      "snapshot tại entry: score cùng hướng × chênh LONG/SHORT × slope × drop khỏi peak × wave state",
    observationOnly: true,
    affectsOrders: false,
    groups,
    sourceSideMatrix,
  };
}

function paperDispersionGroupStats(trades, groupOf) {
  const groups = paperLayerGroupStats(trades, groupOf);
  const extras = new Map();
  for (const trade of trades ?? []) {
    const group = groupOf(trade);
    const key = String(group?.key ?? "NO_DATA");
    const status = normalizePart(trade?.status);
    if (["OPEN", "PENDING", "ENTRY_READY"].includes(status)) continue;
    const pnl = number(trade?.pnl ?? trade?.netPnl, 0) ?? 0;
    const current = extras.get(key) ?? {
      grossWin: 0,
      grossLoss: 0,
      dayPnl: new Map(),
    };
    if (pnl > 0) current.grossWin += pnl;
    else if (pnl < 0) current.grossLoss += Math.abs(pnl);
    const day = normalizedDateKey(
      trade?.activeDateUtc ?? tradeDay(trade),
    );
    if (day) current.dayPnl.set(day, (current.dayPnl.get(day) ?? 0) + pnl);
    extras.set(key, current);
  }
  return groups.map((group) => {
    const extra = extras.get(group.key) ?? {
      grossWin: 0,
      grossLoss: 0,
      dayPnl: new Map(),
    };
    const orderedDayValues = [...extra.dayPnl.entries()]
      .sort(([left], [right]) => right.localeCompare(left));
    const dayValues = orderedDayValues.map(([, value]) => value);
    let negativeDayStreak = 0;
    let positiveDayStreak = 0;
    for (const value of dayValues) {
      if (value < 0 && positiveDayStreak === 0) negativeDayStreak += 1;
      else if (value > 0 && negativeDayStreak === 0) positiveDayStreak += 1;
      else break;
    }
    return {
      ...group,
      profitFactor:
        extra.grossLoss > 0
          ? extra.grossWin / extra.grossLoss
          : extra.grossWin > 0
            ? 9.99
            : 0,
      days: dayValues.length,
      positiveDays: dayValues.filter((value) => value > 0).length,
      negativeDays: dayValues.filter((value) => value < 0).length,
      negativeDayStreak,
      positiveDayStreak,
      latestDay: orderedDayValues[0]?.[0] ?? null,
      latestDayPnl: orderedDayValues[0]?.[1] ?? null,
    };
  });
}

export function paperMarketDispersionStats(trades) {
  const classRank = {
    DISP_REENTER_FROM_TRANSITION: 0,
    DISP_REENTER_FROM_CHOP: 1,
    DISP_REENTER_OTHER: 2,
    DISP_HOLD_LONG_LEAD: 3,
    DISP_HOLD_BALANCED: 4,
    DISP_HOLD_SHORT_LEAD: 5,
    DISP_EXIT_TO_TRANSITION: 6,
    DISP_EXIT_TO_CHOP: 7,
    DISP_EXIT_OTHER: 8,
    DISP_NO_DATA: 9,
  };
  const eligible = (trades ?? []).filter(
    (trade) =>
      normalizePart(trade?.recommendedMarketDispersionClass) !==
      "OUTSIDE",
  );
  const presentation = (trade) => {
    const segment = [
      "DISP_REENTER_FROM_TRANSITION",
      "DISP_REENTER_FROM_CHOP",
      "DISP_REENTER_OTHER",
      "DISP_HOLD_LONG_LEAD",
      "DISP_HOLD_BALANCED",
      "DISP_HOLD_SHORT_LEAD",
      "DISP_EXIT_TO_TRANSITION",
      "DISP_EXIT_TO_CHOP",
      "DISP_EXIT_OTHER",
      "DISP_NO_DATA",
    ].includes(normalizePart(trade?.recommendedMarketDispersionSegment))
      ? normalizePart(trade.recommendedMarketDispersionSegment)
      : "DISP_NO_DATA";
    const tier = ["GOOD", "WATCH", "RISK"].includes(
      normalizePart(trade?.recommendedMarketDispersionTier),
    )
      ? normalizePart(trade.recommendedMarketDispersionTier)
      : "WATCH";
    const label =
      String(trade?.recommendedMarketDispersionLabel ?? "").trim() ||
      segment.replaceAll("_", " ");
    return { segment, tier, label };
  };
  const groups = paperDispersionGroupStats(eligible, (trade) => {
    const { segment, label } = presentation(trade);
    return {
      key: segment,
      label,
      tier: "WATCH",
      verdictLabel: segment,
    };
  }).sort(
    (left, right) =>
      (classRank[normalizePart(left.verdictLabel)] ?? 9) -
        (classRank[normalizePart(right.verdictLabel)] ?? 9) ||
      right.total - left.total,
  );
  const sourceSideMatrix = paperDispersionGroupStats(
    eligible,
    (trade) => {
      const { segment, tier, label } = presentation(trade);
      const source = normalizePart(trade?.sourcePage ?? "UNKNOWN");
      const side = normalizePart(trade?.side ?? "NO_SIDE");
      return {
        key: `${source}_${side}_X_${segment}`,
        label: `${source} · ${side} × ${label}`,
        tier,
        verdictLabel:
          tier === "GOOD"
            ? "CANDIDATE"
            : tier === "RISK"
              ? "RISK"
              : segment,
      };
    },
  ).sort(
    (left, right) =>
      (classRank[
        normalizePart(left.key.split("_X_")[1])
      ] ?? 9) -
        (classRank[
          normalizePart(right.key.split("_X_")[1])
        ] ?? 9) ||
      right.total - left.total,
  );
  return {
    version: RECOMMENDED_MARKET_DISPERSION_VERSION,
    method:
      "snapshot tại entry: RE-ENTER theo TRANSITION/CHOP × HOLD BALANCED/LONG LEAD/SHORT LEAD × EXIT theo TRANSITION/CHOP × source × side",
    observationOnly: true,
    affectsOrders: false,
    groups,
    sourceSideMatrix,
  };
}

export function paperSupportEntryStats(trades) {
  const eligible = (trades ?? []).filter((trade) =>
    ["GOOD", "BAD"].includes(
      normalizePart(trade?.recommendedSupportEntryClass),
    ),
  );
  const presentation = (trade) => {
    const classification = normalizePart(
      trade?.recommendedSupportEntryClass ?? "NO_DATA",
    );
    const tier = classification === "GOOD" ? "GOOD" : "RISK";
    return {
      classification,
      tier,
      label:
        classification === "GOOD"
          ? "TÍN HIỆU ĐẸP · ENTRY SUPPORT"
          : "TÍN HIỆU XẤU · THEO DÕI CHUỖI",
    };
  };
  const measuredGroups = paperDispersionGroupStats(eligible, (trade) => {
    const { classification, tier, label } = presentation(trade);
    return {
      key: `SUPPORT_ENTRY_${classification}`,
      label,
      tier,
      verdictLabel: classification,
    };
  });
  const measuredByVerdict = new Map(
    measuredGroups.map((group) => [normalizePart(group.verdictLabel), group]),
  );
  const emptyGroup = (template) => ({
    key: template.key,
    label: template.label,
    tier: template.tier,
    sourceTier: null,
    cloneTier: null,
    twoLayerTier: null,
    btcAlignment: null,
    verdictLabel: template.verdictLabel ?? template.classification,
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    pnl: 0,
    activePnl: 0,
    closedPnl: 0,
    wr: null,
    avgRoe: null,
    profitFactor: 0,
    days: 0,
    positiveDays: 0,
    negativeDays: 0,
    negativeDayStreak: 0,
    positiveDayStreak: 0,
    latestDay: null,
    latestDayPnl: null,
  });
  const groups = [
    {
      classification: "GOOD",
      key: "SUPPORT_ENTRY_GOOD",
      label: "TÍN HIỆU ĐẸP · ENTRY SUPPORT",
      tier: "GOOD",
    },
    {
      classification: "BAD",
      key: "SUPPORT_ENTRY_BAD",
      label: "TÍN HIỆU XẤU · THEO DÕI CHUỖI",
      tier: "RISK",
    },
  ].map(
    (template) =>
      measuredByVerdict.get(template.classification) ?? emptyGroup(template),
  );
  const sourceQualityTemplates = [
    {
      key: "EDGE_CONFIRMED",
      label: "ENTRY SUPPORT · EDGE CONFIRMED",
      tier: "GOOD",
    },
    {
      key: "EDGE_WEAK",
      label: "ENTRY SUPPORT · EDGE WEAK",
      tier: "RISK",
    },
    {
      key: "LIQUID_CONFIRMED",
      label: "ENTRY SUPPORT · LIQUID CONFIRMED",
      tier: "GOOD",
    },
    {
      key: "LIQUID_WEAK",
      label: "ENTRY SUPPORT · LIQUID WEAK",
      tier: "RISK",
    },
  ];
  const measuredSourceQualityGroups = paperDispersionGroupStats(
    eligible.filter(
      (trade) =>
        normalizePart(trade?.recommendedSupportEntryClass) === "GOOD" &&
        Boolean(trade?.recommendedSupportEntrySourceQualityKey),
    ),
    (trade) => ({
      key: normalizePart(trade?.recommendedSupportEntrySourceQualityKey),
      label:
        trade?.recommendedSupportEntrySourceQualityLabel ??
        "ENTRY SUPPORT · SOURCE NO DATA",
      tier: normalizePart(
        trade?.recommendedSupportEntrySourceQualityTier ?? "WATCH",
      ),
      verdictLabel: normalizePart(
        trade?.recommendedSupportEntrySourceQualityKey ?? "NO_DATA",
      ),
    }),
  );
  const measuredSourceQualityByKey = new Map(
    measuredSourceQualityGroups.map((group) => [normalizePart(group.key), group]),
  );
  const sourceQualityGroups = sourceQualityTemplates.map(
    (template) =>
      measuredSourceQualityByKey.get(template.key) ??
      emptyGroup({ ...template, verdictLabel: template.key }),
  );
  const sourceGroups = (rows) =>
    paperDispersionGroupStats(rows, (trade) => {
      const { classification, tier } = presentation(trade);
      const source = normalizePart(trade?.sourcePage ?? "UNKNOWN");
      const side = normalizePart(trade?.side ?? "NO_SIDE");
      const code = normalizePart(
        trade?.recommendedSupportEntryCode ?? "NO_DATA",
      );
      const cohortLabel =
        String(trade?.recommendedSupportEntryCohortLabel ?? "").trim() ||
        `ENTRY NO DATA · ${source} ${side}`;
      return {
        key: `${classification}_${source}_${side}_${code}`,
        label: cohortLabel,
        tier,
        verdictLabel: classification,
      };
    }).sort(
      (left, right) =>
        (normalizePart(left.verdictLabel) === "GOOD" ? 0 : 1) -
          (normalizePart(right.verdictLabel) === "GOOD" ? 0 : 1) ||
        right.total - left.total,
    );
  const sourceSideMatrix = sourceGroups(eligible);
  const shortSourceGroups = sourceGroups(
    eligible.filter((trade) => normalizePart(trade?.side) === "SHORT"),
  );
  const longSourceGroups = sourceGroups(
    eligible.filter((trade) => normalizePart(trade?.side) === "LONG"),
  );
  const classified = new Set(eligible.map((trade) => String(trade?.id ?? "")));
  return {
    version: RECOMMENDED_SUPPORT_ENTRY_VERSION,
    method:
      `gap >= ${RECOMMENDED_SUPPORT_ENTRY_RULES.minScoreGap} · xác nhận ${RECOMMENDED_SUPPORT_ENTRY_RULES.confirmationSamples} snapshot · tối đa ${RECOMMENDED_SUPPORT_ENTRY_RULES.maxFlipAgeMinutes} phút sau khi đổi bên dẫn · source × side`,
    observationOnly: true,
    affectsEntry: false,
    affectsOrders: false,
    affectsMargin: false,
    affectsSize: false,
    affectsSl: false,
    affectsTp: false,
    classified: eligible.length,
    other: Math.max(0, (trades ?? []).length - classified.size),
    groups,
    sourceQualityGroups,
    sourceSideMatrix,
    shortSourceGroups,
    longSourceGroups,
  };
}

export function paperComboStats(trades, activeRecommendationKeys = new Set()) {
  const groups = new Map();
  for (const trade of trades) {
    const combo =
      String(trade?.recommendationCombo ?? "").trim() || "COMBO_UNKNOWN";
    const key = recommendationKey(
      trade?.sourcePage ?? "-",
      trade?.recommendationBtcPhase ?? "BTC_NO_DATA",
      combo,
    );
    const current = groups.get(key) ?? {
      key,
      combo,
      recommendationLabel: trade?.recommendationLabel ?? "-",
      sourcePage: trade?.sourcePage ?? "-",
      btcPhase: trade?.recommendationBtcPhase ?? "BTC_NO_DATA",
      total: 0,
      open: 0,
      pending: 0,
      closed: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      pnl: 0,
      activePnl: 0,
      closedPnl: 0,
      roeTotal: 0,
      fullSize: 0,
      testSize: 0,
    };
    const status = normalizePart(trade?.status);
    const pnl = number(trade?.pnl ?? trade?.netPnl, 0) ?? 0;
    const roe = number(trade?.roe ?? trade?.roePct, 0) ?? 0;
    const planLabel = String(
      trade?.recommendedTradePlanLabel ?? "",
    ).toUpperCase();
    const isPending = ["PENDING", "ENTRY_READY"].includes(status);
    const isOpen = status === "OPEN";
    current.total += 1;
    if (isPending) current.pending += 1;
    else if (isOpen) {
      current.open += 1;
      current.activePnl += pnl;
      current.pnl += pnl;
    }
    else {
      current.closed += 1;
      current.closedPnl += pnl;
      current.pnl += pnl;
      current.roeTotal += roe;
      if (pnl > 0) current.wins += 1;
      else if (pnl < 0) current.losses += 1;
      else current.breakeven += 1;
    }
    if (planLabel.includes("TEST $1")) current.testSize += 1;
    else current.fullSize += 1;
    groups.set(key, current);
  }

  const verdictRank = { GOOD: 0, NEUTRAL: 1, BAD: 2 };
  return [...groups.values()]
    .map((group) => {
      const decisive = group.wins + group.losses;
      const wr = decisive ? (group.wins / decisive) * 100 : null;
      const avgRoe = group.closed ? group.roeTotal / group.closed : null;
      const verdict =
        group.closed > 0 && group.closedPnl > 0 && avgRoe >= 0.5
          ? "GOOD"
          : group.closed > 0 && (group.closedPnl < 0 || avgRoe < -0.2)
            ? "BAD"
            : "NEUTRAL";
      const { roeTotal, ...result } = group;
      return {
        ...result,
        wr,
        avgRoe,
        verdict,
        isActiveRecommendation: activeRecommendationKeys.has(group.key),
      };
    })
    .sort(
      (left, right) =>
        verdictRank[left.verdict] - verdictRank[right.verdict] ||
        right.total - left.total ||
        (right.avgRoe ?? -Infinity) - (left.avgRoe ?? -Infinity),
    );
}

export function paperRuleSizeStats(trades) {
  const groups = new Map();
  for (const trade of trades) {
    const rawLabel = String(trade?.recommendedTradePlanLabel ?? "").trim();
    const label =
      rawLabel ||
      (Number.isFinite(Number(trade?.marginUsdt))
        ? `FULL $${Number(trade.marginUsdt).toFixed(0)}`
        : "OTHER");
    const key = normalizePart(label);
    const current = groups.get(key) ?? {
      key,
      label,
      total: 0,
      open: 0,
      pending: 0,
      closed: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      tp: 0,
      sl: 0,
      pnl: 0,
      activePnl: 0,
      closedPnl: 0,
      roeTotal: 0,
    };
    const status = normalizePart(trade?.status);
    const outcome = normalizePart(trade?.outcome);
    const closeReason = normalizePart(trade?.closeReason);
    const pnl = number(trade?.pnl ?? trade?.netPnl, 0) ?? 0;
    const roe = number(trade?.roe ?? trade?.roePct, 0) ?? 0;
    const isPending = ["PENDING", "ENTRY_READY"].includes(status);
    const isOpen = status === "OPEN";
    current.total += 1;
    if (isPending) current.pending += 1;
    else if (isOpen) {
      current.open += 1;
      current.activePnl += pnl;
      current.pnl += pnl;
    }
    else {
      current.closed += 1;
      current.closedPnl += pnl;
      current.pnl += pnl;
      current.roeTotal += roe;
      if (pnl > 0) current.wins += 1;
      else if (pnl < 0) current.losses += 1;
      else current.breakeven += 1;
      if ([status, outcome, closeReason].some((part) => part.includes("TP")))
        current.tp += 1;
      if ([status, outcome, closeReason].some((part) => part.includes("SL")))
        current.sl += 1;
    }
    groups.set(key, current);
  }

  const preferred = {
    FULL_10: 0,
    TEST_10: 1,
    FULL_5: 2,
    FULL_3: 3,
    FULL_2: 4,
    FULL_1: 5,
    TEST_1: 6,
    SAMPLE_TEST_1: 7,
    OTHER: 99,
  };
  return [...groups.values()]
    .map((group) => {
      const decisive = group.wins + group.losses;
      const wr = decisive ? (group.wins / decisive) * 100 : null;
      const avgRoe = group.closed ? group.roeTotal / group.closed : null;
      const verdict =
        group.closed >= 8 && group.closedPnl > 0 && avgRoe >= 0.5
          ? "GOOD"
          : group.closed >= 8 && (group.closedPnl < 0 || avgRoe < -0.2)
            ? "BAD"
            : "NEUTRAL";
      const { roeTotal, ...result } = group;
      return { ...result, wr, avgRoe, verdict };
    })
    .sort(
      (left, right) =>
        (preferred[left.key] ?? 50) - (preferred[right.key] ?? 50) ||
        right.total - left.total ||
        (right.avgRoe ?? -Infinity) - (left.avgRoe ?? -Infinity),
    );
}

export function recommendedLiveCardKeysOfTrade(trade = {}) {
  const row = decorateRecommendedPaperLayers([trade])[0] ?? trade;
  const keys = new Set();
  const add = (group, rows, keyOf = (item) => item?.key) => {
    for (const key of liveCardKeysFromRows('recommended', group, rows, keyOf)) keys.add(key);
  };
  add('combo', paperComboStats([row]), (item) => item?.combo);
  add('rule-size', paperRuleSizeStats([row]));
  const twoLayer = paperTwoLayerStats([row]);
  add('source-layer', twoLayer.source);
  add('clone-layer', twoLayer.clone);
  add('two-layer', twoLayer.matrix);
  add('market-fit-matrix', twoLayer.marketFit);
  add('market-fit-label', twoLayer.marketFitLabels);
  const day = paperDayRegimeStats([row]);
  add('day-regime', day.regime);
  add('day-selection', day.selection);
  add('day-side', day.sideMatrix);
  const backtest = paperBacktestConfidenceStats([row]);
  add('backtest-confidence', backtest.groups);
  add('backtest-reliability', backtest.reliabilityGroups);
  const point = paperMarketPointFitStats([row]);
  add('market-point-fit', point.groups);
  add('market-point-source-side', point.sourceSideMatrix);
  const dispersion = paperMarketDispersionStats([row]);
  add('market-dispersion', dispersion.groups);
  add('market-dispersion-source-side', dispersion.sourceSideMatrix);
  const support = paperSupportEntryStats([row]);
  add('support-entry', support.groups);
  add('support-source-quality', support.sourceQualityGroups);
  add('support-short-source', support.shortSourceGroups);
  add('support-long-source', support.longSourceGroups);
  return [...keys];
}

function classifyExit(trade) {
  const status = normalizePart(trade?.status);
  const outcome = normalizePart(trade?.outcome);
  const closeReason = String(trade?.closeReason ?? "");
  const note = String(trade?.note ?? "");
  if (status === "OPEN")
    return { exitType: "ACTIVE", exitTypeLabel: "ĐANG MỞ" };
  if (["PENDING", "ENTRY_READY"].includes(status))
    return { exitType: "PENDING", exitTypeLabel: "CHỜ KHỚP" };

  const combined = `${status} ${outcome} ${closeReason} ${note}`.toUpperCase();
  const pnl = number(trade?.pnl ?? trade?.netPnl);
  const entry = number(trade?.entryPrice ?? trade?.entry ?? trade?.fillPrice);
  const sl = number(trade?.sl ?? trade?.stopLoss ?? trade?.stopPrice);
  const side = normalizePart(trade?.side);
  const favorableSl =
    entry != null &&
    sl != null &&
    (side === "SHORT" ? sl <= entry : sl >= entry);
  const trailEvidence =
    trade?.slTrailLockRoe != null ||
    trade?.slMovedAt != null ||
    trade?.trailingActivated === true ||
    /TRAIL|BREAKEVEN|PROFIT[_ ]?LOCK|SL[_ ]?MOVE|FASTGIVEBACKSLTRAIL|PUMPPAPERSLTRAIL/.test(
      combined,
    );
  const isSl =
    outcome === "SL" ||
    /(?:^|_)SL(?:_|$)/.test(outcome) ||
    /(?:^|_)SL(?:_|$)/.test(status);
  if (isSl) {
    if (trailEvidence || favorableSl || (pnl != null && pnl > 0)) {
      return { exitType: "SL_MOVED", exitTypeLabel: "SL DỜI / TRAIL" };
    }
    return { exitType: "SL_REAL", exitTypeLabel: "SL GỐC" };
  }
  if (outcome === "TP" || status === "TP")
    return { exitType: "TP_REAL", exitTypeLabel: "TP THỰC" };
  if (/TP_ENTRY|BREAKEVEN/.test(combined))
    return { exitType: "ENTRY_LOCK", exitTypeLabel: "VỀ ENTRY" };
  if (/TIMEOUT|EXPIRED/.test(combined))
    return { exitType: "TIMEOUT", exitTypeLabel: "HẾT HẠN" };
  if (status === "CLOSED" || outcome !== "-")
    return { exitType: "RULE_CLOSE", exitTypeLabel: "ĐÓNG THEO RULE" };
  return { exitType: "UNKNOWN", exitTypeLabel: "-" };
}

function paperCandleSortName(value) {
  const raw = typeof value === "object" ? value?.name : value;
  const name = normalizePart(raw);
  return !name || name === "NO_DATA" || name === "UNKNOWN" || name === "-"
    ? null
    : name;
}

function recommendedBtcRegimeSortValue(trade) {
  const direct = normalizePart(
    trade?.recommendationBtcRegime ??
      trade?.btcRegimeAtEntry ??
      trade?.btcRegime ??
      trade?.btcRegimeShape ??
      trade?.btcRegimeLabel,
  );
  if (
    direct &&
    direct !== "-" &&
    direct !== "NO_DATA" &&
    direct !== "BTC_NO_DATA"
  )
    return direct;

  const comboText = normalizePart(
    [trade?.recommendationCombo, trade?.combo, trade?.recommendationGate]
      .filter(Boolean)
      .join(" | "),
  );
  const matched = [
    "SIDEWAY_UP",
    "SIDEWAY_DOWN",
    "WEAK_UP",
    "WEAK_DOWN",
    "STRONG_UP",
    "STRONG_DOWN",
    "CHOP",
    "FLAT",
  ].find((pattern) => comboText.includes(pattern));
  if (matched) return matched;

  const phase = normalizePart(
    trade?.recommendationBtcPhase ??
      trade?.btcPhase ??
      trade?.btcPhaseLabel,
  );
  if (phase === "BTC_UP_WEAK") return "WEAK_UP";
  if (phase === "BTC_DOWN_WEAK") return "WEAK_DOWN";
  if (phase === "BTC_UP_STRONG") return "STRONG_UP";
  if (phase === "BTC_DOWN_STRONG") return "STRONG_DOWN";
  return null;
}

function recommendedSideBtcSortValue(trade) {
  const sideRaw = normalizePart(trade?.side ?? trade?.action);
  const side = sideRaw.includes("SHORT")
    ? "SHORT"
    : sideRaw.includes("LONG")
      ? "LONG"
      : sideRaw;
  const storedTier = normalizePart(
    trade?.shakeoutSideCandleTier ?? trade?.sideCandleTier,
  );
  let tier = ["GOOD", "WATCH", "RISK"].includes(storedTier)
    ? storedTier
    : "WATCH";

  const direction = normalizePart(
    trade?.btcTrendDir ??
      trade?.btcHealth?.btcTrendDir ??
      trade?.btcTrend?.direction,
  );
  const phase = normalizePart(
    trade?.btcPhase ??
      trade?.btcPhaseLabel ??
      trade?.btcRegimeAtEntry ??
      trade?.btcRegime ??
      trade?.recommendationBtcPhase ??
      trade?.btcHealth?.regime,
  );
  const pct6h = number(
    trade?.btcPct6hAtEntry ?? trade?.btcHealth?.pct6h ?? trade?.btcPct6h,
  );
  const explicitRegime = normalizePart(trade?.regimeAtEntry);
  const regime = ["SW_UP", "SW_DOWN", "SW_FLAT"].includes(explicitRegime)
    ? explicitRegime
    : direction === "UP"
      ? "SW_UP"
      : direction === "DOWN"
        ? "SW_DOWN"
        : phase.includes("DOWN") || ["WEAK", "WEAK_DOWN"].includes(phase)
          ? "SW_DOWN"
          : phase.includes("UP") || ["STRONG", "WEAK_UP"].includes(phase)
            ? "SW_UP"
            : pct6h != null && pct6h > 0
              ? "SW_UP"
              : pct6h != null && pct6h < 0
                ? "SW_DOWN"
                : "SW_FLAT";

  if (!["GOOD", "WATCH", "RISK"].includes(storedTier)) {
    const btcPattern =
      trade?.btcCandlePatternAtEntry ?? trade?.btcCandlePattern5m;
    const btcDirection = normalizePart(
      typeof btcPattern === "object"
        ? btcPattern?.direction ?? btcPattern?.name
        : btcPattern,
    );
    const bullish = btcDirection.includes("BULLISH") || btcDirection === "HAMMER";
    const bearish =
      btcDirection.includes("BEARISH") || btcDirection === "SHOOTING_STAR";
    if (regime === "SW_DOWN" && side === "LONG" && bearish) tier = "RISK";
    else if (regime === "SW_DOWN" && side === "SHORT" && bearish) tier = "GOOD";
    else if (regime === "SW_UP" && side === "SHORT" && bullish) tier = "RISK";
    else if (regime === "SW_UP" && side === "LONG" && bullish) tier = "GOOD";
  }

  const rank = { GOOD: 1, WATCH: 2, RISK: 3 }[tier] ?? 2;
  return `${rank}|${tier}|${regime}|${side}`;
}

function sortPaperTrades(trades, sortBy, sortDir) {
  const key = String(sortBy ?? "time");
  const direction = String(sortDir ?? "desc").toLowerCase() === "asc" ? 1 : -1;
  const getters = {
    sourcePage: (trade) => trade?.sourcePage,
    recommendation: (trade) => number(trade?.recommendationRank),
    symbol: (trade) => trade?.symbol,
    side: (trade) => trade?.side,
    score: (trade) => number(trade?.score),
    tradePlan: (trade) =>
      number(trade?.recommendedTargetMarginUsdt ?? trade?.marginUsdt),
    sourceLayer: (trade) => trade?.recommendedSourceLayer,
    cloneLayer: (trade) => trade?.recommendedCloneLayer,
    twoLayer: (trade) => trade?.recommendedTwoLayerTier,
    marketFit: (trade) =>
      `${trade?.recommendedMarketFitTier ?? "WATCH"}|${trade?.recommendedMarketFitKey ?? ""}`,
    backtestConfidence: (trade) => {
      const classification = normalizePart(
        trade?.recommendedBacktestConfidenceClass ?? "NO_DATA",
      );
      const rank = { PRIME: 1, GOOD: 2, WATCH: 3, RISK: 4, NO_DATA: 5 };
      return `${rank[classification] ?? 9}|${classification}`;
    },
    marketPointFit: (trade) => {
      const classification = normalizePart(
        trade?.recommendedMarketPointFitClass ?? "NO_DATA",
      );
      const rank = {
        STRONG: 1,
        SUPPORT: 2,
        TRANSITION: 3,
        EXHAUSTED: 4,
        HEADWIND: 5,
        NO_DATA: 6,
      };
      return `${rank[classification] ?? 9}|${classification}`;
    },
    marketDispersion: (trade) => {
      const segment = normalizePart(
        trade?.recommendedMarketDispersionSegment ??
          trade?.recommendedMarketDispersionClass ??
          "DISP_NO_DATA",
      );
      const rank = {
        DISP_REENTER_FROM_TRANSITION: 1,
        DISP_REENTER_FROM_CHOP: 2,
        DISP_REENTER_OTHER: 3,
        DISP_HOLD_LONG_LEAD: 4,
        DISP_HOLD_BALANCED: 5,
        DISP_HOLD_SHORT_LEAD: 6,
        DISP_EXIT_TO_TRANSITION: 7,
        DISP_EXIT_TO_CHOP: 8,
        DISP_EXIT_OTHER: 9,
        DISP_OUTSIDE: 10,
        DISP_NO_DATA: 11,
      };
      return `${rank[segment] ?? 99}|${segment}`;
    },
    supportEntry: (trade) => {
      const classification = normalizePart(
        trade?.recommendedSupportEntryClass ?? "NO_DATA",
      );
      const rank = { GOOD: 1, BAD: 2, OTHER: 3, NO_DATA: 4 };
      return `${rank[classification] ?? 9}|${classification}|${trade?.recommendedSupportEntryCode ?? ""}`;
    },
    daySelection: (trade) =>
      `${trade?.recommendedDaySelectionAtEntry?.tier ?? "WATCH"}|${trade?.recommendedDaySelectionAtEntry?.key ?? "REC_DAY_NO_DATA"}`,
    candle: (trade) => paperCandleSortName(trade?.candlePatternAtEntry),
    btcCandle: (trade) =>
      paperCandleSortName(
        trade?.btcCandlePatternAtEntry ?? trade?.btcCandlePattern5m,
      ),
    sideBtc: (trade) => recommendedSideBtcSortValue(trade),
    entry: (trade) => number(trade?.entryPrice ?? trade?.entry),
    mark: (trade) =>
      number(trade?.markPrice ?? trade?.lastPrice ?? trade?.exitPrice),
    pnl: (trade) => number(trade?.pnl ?? trade?.netPnl),
    roe: (trade) => number(trade?.roe ?? trade?.roePct),
    status: (trade) => trade?.status,
    exitType: (trade) => trade?.exitTypeLabel,
    highJumpRisk: (trade) => (trade?.highJumpRisk ? 1 : 0),
    btcPhase: (trade) => trade?.recommendationBtcPhase,
    btcRegime: (trade) => recommendedBtcRegimeSortValue(trade),
    btcTrend: (trade) => number(trade?.btcTrendSnapshotScore, -1),
    combo: (trade) => trade?.recommendationCombo,
    time: (trade) =>
      Date.parse(trade?.createdAt ?? trade?.openedAt ?? trade?.time ?? 0),
  };
  const getter = getters[key] ?? getters.time;
  return [...trades].sort((left, right) => {
    const a = getter(left);
    const b = getter(right);
    const aMissing =
      a == null || a === "" || (typeof a === "number" && !Number.isFinite(a));
    const bMissing =
      b == null || b === "" || (typeof b === "number" && !Number.isFinite(b));
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (aMissing) return 0;
    if (typeof a === "number" && typeof b === "number")
      return (a - b) * direction;
    return (
      String(a).localeCompare(String(b), "vi", {
        numeric: true,
        sensitivity: "base",
      }) * direction
    );
  });
}

export async function getRecommendedPaper({
  day = "",
  fromDay = "",
  toDay = "",
  window = "1",
  sourceLayer = "",
  cloneLayer = "",
  twoLayer = "",
  marketFit = "",
  daySelection = "",
  backtestConfidence = "",
  backtestReliability = "",
  marketPointFit = "",
  marketDispersion = "",
  page = 1,
  pageSize = 300,
  sortBy = "time",
  sortDir = "desc",
  prepareTrades = null,
  enrichTrade = null,
} = {}) {
  const requestedRange = recommendedPaperDateRange(fromDay, toDay);
  const catalog = await getRecommendedSignals(day || requestedRange?.toDay || "");
  const latestCatalogDay = catalog.availableDays?.[0] ?? catalog.selectedDay;
  // Historical range searches are read-only. Scanning the large source stores
  // for an old recommendation day can block the page for a minute and cannot
  // create a legitimate live clone for that day anyway.
  if (catalog.selectedDay && catalog.selectedDay === latestCatalogDay) {
    await syncDay(
      catalog.selectedDay,
      catalog.recommendations ?? [],
      catalog.basedOnDateUtc ?? "",
    );
  }
  const selectedWindow = comboWindow(window);
  const store = await readJsonCached(paperFile, {
    version: 1,
    updatedAt: null,
    trades: [],
  });
  const validTrades = decorateRecommendedPaperLayers(
    (store.trades ?? []).filter(
      (trade) => trade?.paperMode === RECOMMENDED_PAPER_MODE,
    ),
  );
  const availablePaperDays = [
    ...new Set(
      validTrades
        .map((trade) => normalizedDateKey(trade?.activeDateUtc ?? tradeDay(trade)))
        .filter(Boolean),
    ),
  ].sort();
  const filtered = validTrades.filter(
    (trade) => requestedRange
      ? tradeInRecommendedDateRange(trade, requestedRange)
      : !catalog.selectedDay || trade.activeDateUtc === catalog.selectedDay,
  );
  const comboFiltered = requestedRange
    ? validTrades.filter((trade) =>
        tradeInRecommendedDateRange(trade, requestedRange),
      )
    : validTrades.filter((trade) =>
        tradeInComboWindow(trade, catalog.selectedDay, selectedWindow),
      );
  // The table and every backtest-classification card must see the same live
  // mark. Subscribe all still-live rows used by either view, while leaving
  // historical closed rows untouched and cheap to aggregate.
  const liveEligible = [...new Set([...filtered, ...comboFiltered])].filter(
    isRecommendedPaperLiveStatus,
  );
  if (typeof prepareTrades === "function") prepareTrades(liveEligible);
  const liveTradeBySource = new Map();
  if (typeof enrichTrade === "function") {
    for (const trade of liveEligible) {
      liveTradeBySource.set(trade, enrichTrade(trade));
    }
  }
  const liveRows = filtered.map(
    (trade) => liveTradeBySource.get(trade) ?? trade,
  );
  await persistRecommendedPaperLiveStops(liveRows);
  const recommendationById = new Map(
    (catalog.recommendations ?? []).map((item, index) => [
      item.id,
      {
        rank: index + 1,
        label: `#${index + 1} ${String(item.page ?? "").toUpperCase()} · ${item.signalType} ${item.side} · ${item.timeframe}`,
      },
    ]),
  );
  const enriched = liveRows.map((trade) => {
    const recommendations = (trade.recommendationIds ?? [])
      .map((id) => recommendationById.get(id))
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank);
    const trend = btcTrendSnapshot(trade);
    return {
      ...trade,
      recommendationRank: recommendations[0]?.rank ?? null,
      recommendationLabel:
        recommendations[0]?.label ??
        `${String(trade?.sourcePage ?? "-").toUpperCase()} · ${String(trade?.recommendationCombo ?? "COMBO").split("|").slice(0, 3).join(" · ")}`,
      recommendationLabels: recommendations.map((item) => item.label),
      btcTrendSnapshotDir: trend.direction,
      btcTrendSnapshotScore: trend.score,
      btcTrendSnapshotPct6h: trend.pct6h,
      btcTrendSnapshotLabel: trend.label,
      ...classifyExit(trade),
    };
  });
  // Closed history stays persisted/frozen. Only OPEN/PENDING rows are overlaid
  // with the in-memory socket mark so active PnL changes without JSON churn.
  const comboEnriched = comboFiltered.map((trade) => {
    const liveTrade = liveTradeBySource.get(trade) ?? trade;
    const item = (trade.recommendationIds ?? [])
      .map((id) => recommendationById.get(id))
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank)[0];
    return {
      ...liveTrade,
      recommendationLabel:
        item?.label ??
        `${String(trade?.sourcePage ?? "-").toUpperCase()} · ${String(trade?.recommendationCombo ?? "COMBO").split("|").slice(0, 3).join(" · ")}`,
    };
  });
  // The source sample already includes trades closed through basedOnDateUtc.
  // Keep only later paper clones so the UI can update it without double count.
  const postBaselineComboEnriched = comboEnriched.filter((trade) => {
    const tradeDay = String(trade?.activeDateUtc ?? "");
    const baselineDay = String(catalog?.basedOnDateUtc ?? "");
    return tradeDay && baselineDay && tradeDay > baselineDay;
  });
  const activeRecommendationKeys = new Set(
    (catalog.recommendations ?? [])
      .filter((item) =>
        (item.samples ?? []).some(
          (sample) => Number(sample.days) === selectedWindow.sampleDays,
        ),
      )
      .map((item) => recommendationKey(item.page, item.btcPhase, item.combo)),
  );
  const normalizedPaperFilters = normalizeRecommendedPaperFilters({
    sourceLayer,
    cloneLayer,
    twoLayer,
    marketFit,
    daySelection,
    backtestConfidence,
    backtestReliability,
    marketPointFit,
    marketDispersion,
  });
  const paperFilterOptions = recommendedPaperFilterOptions(enriched);
  const tableEnriched = filterRecommendedPaperTrades(
    enriched,
    normalizedPaperFilters,
  );
  const sorted = sortPaperTrades(tableEnriched, sortBy, sortDir);
  const safeSize = Math.max(20, Math.min(500, Number(pageSize) || 300));
  const pages = Math.max(1, Math.ceil(sorted.length / safeSize));
  const safePage = Math.max(1, Math.min(pages, Number(page) || 1));
  return {
    selectedDay: catalog.selectedDay,
    availableDays: catalog.availableDays,
    availablePaperDays,
    updatedAt: store.updatedAt,
    summary: paperSummary(tableEnriched),
    livePricing: recommendedLivePricingStats(tableEnriched),
    comboWindow: requestedRange
      ? {
          ...selectedWindow,
          value: "range",
          label:
            requestedRange.fromDay === requestedRange.toDay
              ? requestedRange.fromDay
              : `${requestedRange.fromDay} → ${requestedRange.toDay}`,
          fromDay: requestedRange.fromDay,
          toDay: requestedRange.toDay,
          totalTrades: comboEnriched.length,
        }
      : {
          ...selectedWindow,
          fromDay:
            selectedWindow.days == null
              ? null
              : subtractUtcDays(catalog.selectedDay, selectedWindow.days - 1),
          toDay: catalog.selectedDay,
          totalTrades: comboEnriched.length,
        },
    dateRange: {
      explicit: Boolean(requestedRange),
      fromDay: requestedRange?.fromDay ?? catalog.selectedDay,
      toDay: requestedRange?.toDay ?? catalog.selectedDay,
      totalTrades: filtered.length,
    },
    paperFilters: {
      applied: normalizedPaperFilters,
      options: paperFilterOptions,
      activeCount: Object.values(normalizedPaperFilters).filter(Boolean).length,
      totalBefore: enriched.length,
      totalAfter: tableEnriched.length,
      observationOnly: true,
      affectsOrders: false,
    },
    ruleSizeStats: paperRuleSizeStats(comboEnriched),
    comboStats: paperComboStats(comboEnriched, activeRecommendationKeys),
    twoLayerStats: paperTwoLayerStats(comboEnriched),
    dayRegimeStats: paperDayRegimeStats(comboEnriched),
    backtestConfidenceStats: paperBacktestConfidenceStats(comboEnriched),
    marketPointFitStats: paperMarketPointFitStats(comboEnriched),
    marketDispersionStats: paperMarketDispersionStats(comboEnriched),
    supportEntryStats: paperSupportEntryStats(comboEnriched),
    postBaselineComboStats: paperComboStats(
      postBaselineComboEnriched,
      activeRecommendationKeys,
    ),
    postBaseline: {
      afterDay: catalog.basedOnDateUtc ?? null,
      totalTrades: postBaselineComboEnriched.length,
    },
    sort: { by: String(sortBy || "time"), dir: String(sortDir || "desc") },
    pagination: {
      page: safePage,
      pageSize: safeSize,
      pages,
      total: sorted.length,
    },
    trades: sorted.slice((safePage - 1) * safeSize, safePage * safeSize),
  };
}

export async function getRecommendedPaperActiveSymbols() {
  const store = await readJsonCached(paperFile, {
    version: 1,
    updatedAt: null,
    trades: [],
  });
  return [
    ...new Set(
      (store.trades ?? [])
        .filter((trade) => trade?.paperMode === RECOMMENDED_PAPER_MODE)
        .filter((trade) =>
          ["OPEN", "PENDING", "ENTRY_READY"].includes(
            String(trade?.status ?? "").toUpperCase(),
          ),
        )
        .map((trade) =>
          String(trade?.symbol ?? "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  ];
}
