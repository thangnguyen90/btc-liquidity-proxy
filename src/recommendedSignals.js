import crypto from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
const socketProcessAtBySymbol = new Map();

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
) {
  const normalizedSymbol = String(symbol ?? "").trim().toUpperCase();
  const mark = number(markPrice);
  if (!normalizedSymbol || !mark || mark <= 0) return 0;
  const now = Date.now();
  if (now - (socketProcessAtBySymbol.get(normalizedSymbol) ?? 0) < 200) return 0;
  socketProcessAtBySymbol.set(normalizedSymbol, now);
  let closed = 0;
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
      if (normalizePart(evaluated?.status) === "CLOSED") closed += 1;
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

export async function processRecommendedSourceOpenEvent({
  page,
  trade,
  marketEntry,
  learningFlagsByRecommendationId = null,
  catalogOverride = null,
  paperFileOverride = null,
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
    const clone = {
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
      recommendationIds: [recommendation.id],
      recommendationStrength: recommendation.strength,
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
      activeDateUtc: day,
      createdAt: cloneOpenedAt,
      openedAt: cloneOpenedAt,
      clonedAt: cloneOpenedAt,
      syncedAt: cloneOpenedAt,
    };
    await writeJsonAtomic(targetPaperFile, {
      ...store,
      version: 3,
      paperMode: RECOMMENDED_PAPER_MODE,
      updatedAt: cloneOpenedAt,
      trades: [clone, ...(store.trades ?? [])],
    });
    result = { created: true, reason: "SOURCE_OPEN_EVENT", trade: clone };
  });
  await writeLock;
  return result;
}

function paperSummary(trades) {
  const closed = trades.filter(
    (trade) =>
      !["OPEN", "PENDING"].includes(String(trade.status ?? "").toUpperCase()),
  );
  const open = trades.length - closed.length;
  const pnl = trades.reduce(
    (sum, trade) => sum + (number(trade.pnl, 0) ?? 0),
    0,
  );
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
    avgRoe,
    avgScore,
  };
}

function paperComboStats(trades, activeRecommendationKeys = new Set()) {
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
    current.pnl += pnl;
    if (isPending) current.pending += 1;
    else if (isOpen) current.open += 1;
    else {
      current.closed += 1;
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
        group.closed > 0 && group.pnl > 0 && avgRoe >= 0.5
          ? "GOOD"
          : group.closed > 0 && (group.pnl < 0 || avgRoe < -0.2)
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

function paperRuleSizeStats(trades) {
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
    current.pnl += pnl;
    if (isPending) current.pending += 1;
    else if (isOpen) current.open += 1;
    else {
      current.closed += 1;
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
        group.closed >= 8 && group.pnl > 0 && avgRoe >= 0.5
          ? "GOOD"
          : group.closed >= 8 && (group.pnl < 0 || avgRoe < -0.2)
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
    entry: (trade) => number(trade?.entryPrice ?? trade?.entry),
    mark: (trade) =>
      number(trade?.markPrice ?? trade?.lastPrice ?? trade?.exitPrice),
    pnl: (trade) => number(trade?.pnl ?? trade?.netPnl),
    roe: (trade) => number(trade?.roe ?? trade?.roePct),
    status: (trade) => trade?.status,
    exitType: (trade) => trade?.exitTypeLabel,
    highJumpRisk: (trade) => (trade?.highJumpRisk ? 1 : 0),
    btcPhase: (trade) => trade?.recommendationBtcPhase,
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
  window = "1",
  page = 1,
  pageSize = 300,
  sortBy = "time",
  sortDir = "desc",
  prepareTrades = null,
  enrichTrade = null,
} = {}) {
  const catalog = await getRecommendedSignals(day);
  await syncDay(
    catalog.selectedDay,
    catalog.recommendations ?? [],
    catalog.basedOnDateUtc ?? "",
  );
  const selectedWindow = comboWindow(window);
  const store = await readJsonCached(paperFile, {
    version: 1,
    updatedAt: null,
    trades: [],
  });
  const validTrades = (store.trades ?? []).filter(
    (trade) => trade?.paperMode === RECOMMENDED_PAPER_MODE,
  );
  const filtered = validTrades.filter(
    (trade) =>
      !catalog.selectedDay || trade.activeDateUtc === catalog.selectedDay,
  );
  const comboFiltered = validTrades.filter((trade) =>
    tradeInComboWindow(trade, catalog.selectedDay, selectedWindow),
  );
  if (typeof prepareTrades === "function") prepareTrades(filtered);
  const liveRows =
    typeof enrichTrade === "function"
      ? filtered.map((trade) => enrichTrade(trade))
      : filtered;
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
  // Combo windows use the persisted source outcome. Re-running live enrichment
  // across several days is expensive and can make historical totals drift.
  const comboEnriched = comboFiltered.map((trade) => {
    const item = (trade.recommendationIds ?? [])
      .map((id) => recommendationById.get(id))
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank)[0];
    return {
      ...trade,
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
  const sorted = sortPaperTrades(enriched, sortBy, sortDir);
  const safeSize = Math.max(20, Math.min(500, Number(pageSize) || 300));
  const pages = Math.max(1, Math.ceil(sorted.length / safeSize));
  const safePage = Math.max(1, Math.min(pages, Number(page) || 1));
  return {
    selectedDay: catalog.selectedDay,
    availableDays: catalog.availableDays,
    updatedAt: store.updatedAt,
    summary: paperSummary(enriched),
    comboWindow: {
      ...selectedWindow,
      fromDay:
        selectedWindow.days == null
          ? null
          : subtractUtcDays(catalog.selectedDay, selectedWindow.days - 1),
      toDay: catalog.selectedDay,
      totalTrades: comboEnriched.length,
    },
    ruleSizeStats: paperRuleSizeStats(comboEnriched),
    comboStats: paperComboStats(comboEnriched, activeRecommendationKeys),
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
