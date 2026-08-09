import { installBinanceCardAvgRoeGuard } from './binance-card-visibility.js';
import { installLiveCardWhitelistUi, liveCardAttrs } from './live-card-whitelist-ui.js?v=20260802-live-whitelist-v5-two-step';

installBinanceCardAvgRoeGuard();

const $ = (id) => document.getElementById(id);
installLiveCardWhitelistUi({
  page: 'recommended',
  label: 'RECOMMENDED SIGNALS',
  mountBefore: $('rule-size-stats'),
});
const PAPER_PAGE_SIZE = 50;
const PAPER_FILTER_CONTROLS = [
  { key: "sourceLayer", id: "paper-filter-source-layer", all: "Tất cả SOURCE L1" },
  { key: "cloneLayer", id: "paper-filter-clone-layer", all: "Tất cả CLONE L2" },
  { key: "twoLayer", id: "paper-filter-two-layer", all: "Tất cả kết luận 2L" },
  { key: "marketFit", id: "paper-filter-market-fit", all: "Tất cả nhãn M4" },
  { key: "daySelection", id: "paper-filter-day-selection", all: "Tất cả nhãn Lớp 5" },
  { key: "backtestConfidence", id: "paper-filter-backtest-confidence", all: "Tất cả nhãn Lớp 6" },
  { key: "backtestReliability", id: "paper-filter-backtest-reliability", all: "Tất cả độ tin cậy" },
  { key: "marketPointFit", id: "paper-filter-market-point-fit", all: "Tất cả nhãn Lớp 7" },
  { key: "marketDispersion", id: "paper-filter-market-dispersion", all: "Tất cả nhãn Lớp 8" },
];
const state = {
  fromDay: "",
  toDay: "",
  rangeMode: "today",
  draftFromDay: "",
  draftToDay: "",
  draftRangeMode: "today",
  dateRangeDirty: false,
  rangeInitialized: false,
  availablePaperDays: [],
  window: "1",
  page: 1,
  pages: 1,
  sortBy: "time",
  sortDir: "desc",
  loading: false,
  reloadQueued: false,
  reloadQueuedForeground: false,
  reloadQueuedDateSearch: false,
  queryRevision: 0,
  learning: null,
  paperFilters: Object.fromEntries(
    PAPER_FILTER_CONTROLS.map(({ key }) => [key, ""]),
  ),
};
const fmt = (value, digits = 2) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";
const esc = (value) =>
  String(value ?? "-").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const field = (trade, ...names) =>
  names
    .map((name) => trade?.[name])
    .find((value) => value != null && value !== "");

const MARKET_DIRECTION_LABELS = {
  LONG_FAVORED: "LONG FAVORED",
  SHORT_FAVORED: "SHORT FAVORED",
  MARKET_CHOP: "MARKET CHOP",
  MARKET_DISPERSION: "MARKET DISPERSION",
  MARKET_TRANSITION: "MARKET TRANSITION",
  MARKET_SHOCK: "MARKET SHOCK",
  NO_DATA: "NO DATA",
};
const SHORT_WAVE_LABELS = {
  SHORT_BUILDUP: "SHORT BUILDUP",
  SHORT_IMPULSE: "SHORT IMPULSE",
  SHORT_PEAK: "SHORT PEAK",
  SHORT_FADE: "SHORT FADE",
  BTC_CRASH_RECLAIM: "BTC CRASH RECLAIM",
  SHORT_RELOAD: "SHORT RELOAD",
  SHORT_NEUTRAL: "SHORT NEUTRAL",
  SHORT_NO_DATA: "SHORT NO DATA",
};
const LONG_WAVE_LABELS = {
  LONG_BUILDUP: "LONG BUILDUP",
  LONG_IMPULSE: "LONG IMPULSE",
  LONG_PEAK: "LONG PEAK",
  LONG_FADE: "LONG FADE",
  BTC_RALLY_REJECT: "BTC RALLY REJECT",
  LONG_RELOAD: "LONG RELOAD",
  LONG_NEUTRAL: "LONG NEUTRAL",
  LONG_NO_DATA: "LONG NO DATA",
};
const SHORT_EDGE_CYCLE_LABELS = {
  SHORT_EDGE_INTACT: "EDGE CHƯA DECAY",
  SHORT_EDGE_DECAY: "EDGE DECAY ACTIVE",
  SHORT_EDGE_RECOVERY: "EDGE RECOVERY / RELOAD",
  SHORT_EDGE_NO_DATA: "EDGE NO DATA",
};
const SHORT_EDGE_TRANSITION_LABELS = {
  EDGE_INTACT_TO_DECAY: "EDGE INTACT → EDGE DECAY",
  EDGE_DECAY_TO_RECOVERY: "EDGE DECAY → RECOVERY",
};
const MARKET_DISPERSION_SEGMENT_LABELS = {
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
};
const marketHealthEls = {
  root: $("recommendedMarketHealth"),
  label: $("recommendedMarketHealthLabel"),
  confidence: $("recommendedMarketHealthConfidence"),
  description: $("recommendedMarketHealthDescription"),
  live: $("recommendedMarketHealthLive"),
  liveText: $("recommendedMarketHealthLiveText"),
  longScore: $("recommendedMarketLongScore"),
  shortScore: $("recommendedMarketShortScore"),
  longBar: $("recommendedMarketLongBar"),
  shortBar: $("recommendedMarketShortBar"),
  longWave: $("recommendedMarketLongWave"),
  shortWave: $("recommendedMarketShortWave"),
  longDetail: $("recommendedMarketLongDetail"),
  shortDetail: $("recommendedMarketShortDetail"),
  breadth1h: $("recommendedMarketBreadth1h"),
  breadth3h: $("recommendedMarketBreadth3h"),
  breadth6h: $("recommendedMarketBreadth6h"),
  btc15m: $("recommendedMarketBtc15m"),
  btc1h: $("recommendedMarketBtc1h"),
  btc6h: $("recommendedMarketBtc6h"),
  reasons: $("recommendedMarketHealthReasons"),
  sample: $("recommendedMarketHealthSample"),
  pending: $("recommendedMarketHealthPending"),
  dispersionCycle: $("recommendedMarketDispersionCycle"),
  dispersionLabel: $("recommendedMarketDispersionLabel"),
  dispersionGap: $("recommendedMarketDispersionGap"),
  dispersionRaw: $("recommendedMarketDispersionRaw"),
  dispersionStable: $("recommendedMarketDispersionStable"),
  dispersionLead: $("recommendedMarketDispersionLead"),
  dispersionPending: $("recommendedMarketDispersionPending"),
  dispersionDescription: $("recommendedMarketDispersionDescription"),
  edgeCycle: $("recommendedShortEdgeCycle"),
  edgeLabel: $("recommendedShortEdgeCycleLabel"),
  edgeAge: $("recommendedShortEdgeCycleAge"),
  edgeShortSlope: $("recommendedShortEdgeShortSlope"),
  edgeLongSlope: $("recommendedShortEdgeLongSlope"),
  edgeDrop: $("recommendedShortEdgeDrop"),
  edgeBtc15m: $("recommendedShortEdgeBtc15m"),
  edgeDeclineSamples: $("recommendedShortEdgeDeclineSamples"),
  edgeTransition: $("recommendedShortEdgeTransition"),
};
let marketHealthData = null;
let marketHealthResponseAt = 0;
let marketHealthLoading = false;

function marketHealthPct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}%`;
}

function marketHealthBreadthPair(up, down) {
  const upValue = Number(up);
  const downValue = Number(down);
  if (!Number.isFinite(upValue) || !Number.isFinite(downValue)) return "-- / --";
  return `${upValue.toFixed(0)}% / ${downValue.toFixed(0)}%`;
}

function marketHealthTime(value) {
  return value
    ? new Date(value).toLocaleString("vi-VN", { hour12: false })
    : "-";
}

function setMarketHealthDirectionalValue(element, value) {
  if (!element) return;
  const number = Number(value);
  element.textContent = marketHealthPct(value, 2);
  element.style.color = !Number.isFinite(number)
    ? ""
    : number > 0
      ? "var(--green)"
      : number < 0
        ? "var(--red)"
        : "var(--muted)";
}

function signedMarketScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number >= 0 ? "+" : ""}${number.toFixed(0)}`;
}

function marketEdgeAge(startedAt) {
  const timestamp = Number(startedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "--";
  const minutes = Math.max(0, (Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "0 phút trong trạng thái";
  if (minutes < 60) return `${Math.floor(minutes)} phút trong chu kỳ`;
  return `${Math.floor(minutes / 60)}h ${Math.floor(minutes % 60)}m trong chu kỳ`;
}

function recommendedMarketDispersionRealtime(data = {}) {
  const raw = String(data.rawLabel ?? "NO_DATA").toUpperCase();
  const stable = String(data.label ?? data.rawLabel ?? "NO_DATA").toUpperCase();
  const longScore = Number(data.scores?.long);
  const shortScore = Number(data.scores?.short);
  const hasScores = Number.isFinite(longScore) && Number.isFinite(shortScore);
  const gap = hasScores ? longScore - shortScore : null;
  const lead = !hasScores
    ? "NO DATA"
    : gap >= 10
      ? "LONG LEAD"
      : gap <= -10
        ? "SHORT LEAD"
        : "BALANCED";
  let segment = "DISP_OUTSIDE";
  if (!raw || !stable || raw === "NO_DATA" || stable === "NO_DATA" || !hasScores) {
    segment = "DISP_NO_DATA";
  } else if (raw === "MARKET_DISPERSION" && stable === "MARKET_DISPERSION") {
    segment = `DISP_HOLD_${lead.replaceAll(" ", "_")}`;
  } else if (raw === "MARKET_DISPERSION") {
    segment = stable === "MARKET_TRANSITION"
      ? "DISP_REENTER_FROM_TRANSITION"
      : stable === "MARKET_CHOP"
        ? "DISP_REENTER_FROM_CHOP"
        : "DISP_REENTER_OTHER";
  } else if (stable === "MARKET_DISPERSION") {
    segment = raw === "MARKET_TRANSITION"
      ? "DISP_EXIT_TO_TRANSITION"
      : raw === "MARKET_CHOP"
        ? "DISP_EXIT_TO_CHOP"
        : "DISP_EXIT_OTHER";
  }
  const description = segment.startsWith("DISP_REENTER")
    ? "Raw đã trở lại DISPERSION; nhãn ổn định đang chờ đủ hysteresis."
    : segment.startsWith("DISP_EXIT")
      ? "Raw đã rời DISPERSION; nhãn ổn định đang chờ xác nhận pha mới."
      : segment === "DISP_HOLD_LONG_LEAD"
        ? "DISPERSION đang giữ và điểm LONG dẫn SHORT ít nhất 10 điểm."
        : segment === "DISP_HOLD_SHORT_LEAD"
          ? "DISPERSION đang giữ và điểm SHORT dẫn LONG ít nhất 10 điểm."
          : segment === "DISP_HOLD_BALANCED"
            ? "DISPERSION đang giữ; chênh lệch LONG–SHORT chưa tới 10 điểm."
            : segment === "DISP_OUTSIDE"
              ? "Thị trường hiện không nằm trong cohort MARKET DISPERSION."
              : "Chưa đủ dữ liệu để xác định cohort MARKET DISPERSION.";
  return { raw, stable, gap, lead, segment, description };
}

function renderRecommendedMarketDispersionRealtime(data = {}) {
  if (!marketHealthEls.dispersionCycle) return;
  const current = recommendedMarketDispersionRealtime(data);
  marketHealthEls.dispersionCycle.dataset.dispersionSegment = current.segment;
  marketHealthEls.dispersionLabel.textContent =
    MARKET_DISPERSION_SEGMENT_LABELS[current.segment]
    ?? current.segment.replaceAll("_", " ");
  marketHealthEls.dispersionGap.textContent = current.gap == null
    ? "gap --"
    : `gap ${current.gap >= 0 ? "+" : ""}${current.gap.toFixed(0)}`;
  marketHealthEls.dispersionRaw.textContent =
    MARKET_DIRECTION_LABELS[current.raw] ?? current.raw.replaceAll("_", " ");
  marketHealthEls.dispersionStable.textContent =
    MARKET_DIRECTION_LABELS[current.stable] ?? current.stable.replaceAll("_", " ");
  marketHealthEls.dispersionLead.textContent = current.lead;
  marketHealthEls.dispersionPending.textContent = data.pendingLabel
    ? `${Number(data.pendingCount ?? 0)}/${Number(data.hysteresisSamples ?? 2)}`
    : "ĐÃ CHỐT";
  marketHealthEls.dispersionDescription.textContent = current.description;
}

function renderRecommendedShortEdgeCycle(cycle = null) {
  const phase = String(cycle?.phase ?? "SHORT_EDGE_NO_DATA").toUpperCase();
  marketHealthEls.edgeCycle.dataset.edgePhase = phase;
  marketHealthEls.edgeLabel.textContent =
    SHORT_EDGE_CYCLE_LABELS[phase] ?? phase.replaceAll("_", " ");
  marketHealthEls.edgeAge.textContent = marketEdgeAge(cycle?.phaseStartedAt);
  marketHealthEls.edgeShortSlope.textContent = signedMarketScore(cycle?.shortScoreSlope);
  marketHealthEls.edgeLongSlope.textContent = signedMarketScore(cycle?.longScoreSlope);
  const drop = Number(cycle?.shortScoreDropFromPeak);
  marketHealthEls.edgeDrop.textContent = Number.isFinite(drop)
    ? `${drop.toFixed(0)} điểm`
    : "--";
  marketHealthEls.edgeBtc15m.textContent = marketHealthPct(cycle?.btcRet15m, 2);
  const declineSamples = Number(cycle?.declineSamples);
  marketHealthEls.edgeDeclineSamples.textContent = Number.isFinite(declineSamples)
    ? `${declineSamples} mẫu`
    : "--";
  const transition = cycle?.lastTransition;
  const transitionLabel = SHORT_EDGE_TRANSITION_LABELS[transition?.type];
  marketHealthEls.edgeTransition.textContent = transitionLabel
    ? `Lần đổi gần nhất: ${transitionLabel} · ${marketHealthTime(transition.at)}`
    : cycle?.dataAvailable
      ? "Chưa ghi nhận lần đổi EDGE DECAY/RECOVERY kể từ khi service theo dõi."
      : "Chưa đủ score dynamics để xác định chu kỳ.";
}

function renderRecommendedMarketHealthClock() {
  if (!marketHealthEls.live || !marketHealthEls.liveText) return;
  const ageSeconds = marketHealthResponseAt > 0
    ? Math.max(0, Math.floor((Date.now() - marketHealthResponseAt) / 1000))
    : null;
  const stale = Boolean(marketHealthData?.socket?.isStale)
    || (ageSeconds != null && ageSeconds > 60);
  const liveState = ageSeconds == null ? "connecting" : stale ? "stale" : "live";
  marketHealthEls.live.classList.remove("is-connecting", "is-live", "is-stale");
  marketHealthEls.live.classList.add(`is-${liveState}`);
  marketHealthEls.liveText.textContent = liveState === "connecting"
    ? "Realtime đang kết nối..."
    : liveState === "stale"
      ? `Socket nến chậm · refresh ${ageSeconds}s`
      : `Socket nến ổn · refresh ${ageSeconds}s · rolling 1h/3h/6h`;
  renderRecommendedShortEdgeCycle(marketHealthData?.shortEdgeCycle);
}

function renderRecommendedMarketHealth(data) {
  if (!marketHealthEls.root || !data) return;
  marketHealthData = data;
  marketHealthResponseAt = Date.now();
  const label = String(data.label ?? data.rawLabel ?? "NO_DATA").toUpperCase();
  const scores = data.scores ?? {};
  const breadth = data.breadth;
  const btc = data.btc;
  const dynamics = data.scoreDynamics ?? null;
  const longScore = Math.max(0, Math.min(100, Number(scores.long ?? 0)));
  const shortScore = Math.max(0, Math.min(100, Number(scores.short ?? 0)));

  marketHealthEls.root.dataset.marketLabel = label;
  marketHealthEls.label.textContent =
    MARKET_DIRECTION_LABELS[label] ?? label.replaceAll("_", " ");
  marketHealthEls.confidence.textContent =
    `confidence ${Number(scores.confidence ?? 0).toFixed(0)}%`;
  marketHealthEls.description.textContent =
    data.description ?? "Đang đánh giá thị trường.";
  marketHealthEls.longScore.textContent = longScore.toFixed(0);
  marketHealthEls.shortScore.textContent = shortScore.toFixed(0);
  marketHealthEls.longBar.style.width = `${longScore}%`;
  marketHealthEls.shortBar.style.width = `${shortScore}%`;

  const longWaveState = String(dynamics?.longWaveState ?? "LONG_NO_DATA").toUpperCase();
  marketHealthEls.longWave.dataset.longWave = longWaveState;
  marketHealthEls.longWave.textContent =
    dynamics?.longWaveLabel
    ?? LONG_WAVE_LABELS[longWaveState]
    ?? longWaveState.replaceAll("_", " ");
  marketHealthEls.longWave.title =
    dynamics?.longWaveDescription ?? "Nhãn nhịp LONG chỉ dùng để quan sát.";

  const shortWaveState = String(dynamics?.shortWaveState ?? "SHORT_NO_DATA").toUpperCase();
  marketHealthEls.shortWave.dataset.shortWave = shortWaveState;
  marketHealthEls.shortWave.textContent =
    dynamics?.shortWaveLabel
    ?? SHORT_WAVE_LABELS[shortWaveState]
    ?? shortWaveState.replaceAll("_", " ");
  marketHealthEls.shortWave.title =
    dynamics?.shortWaveDescription ?? "Nhãn nhịp SHORT chỉ dùng để quan sát.";

  if (breadth) {
    marketHealthEls.longDetail.textContent = dynamics
      ? `prev ${dynamics.longScorePrev ?? "-"} · peak ${dynamics.longScorePeak ?? "-"} · slope ${Number(dynamics.longScoreSlope ?? 0) >= 0 ? "+" : ""}${dynamics.longScoreSlope ?? "-"} · drop ${dynamics.longScoreDropFromPeak ?? "-"}`
      : `EMA20 ${Number(breadth.aboveEma20Pct ?? 0).toFixed(0)}% · vol confirm ${Number(breadth.confirmedUpPct ?? 0).toFixed(0)}%`;
    marketHealthEls.shortDetail.textContent = dynamics
      ? `prev ${dynamics.shortScorePrev ?? "-"} · peak ${dynamics.shortScorePeak ?? "-"} · slope ${Number(dynamics.shortScoreSlope ?? 0) >= 0 ? "+" : ""}${dynamics.shortScoreSlope ?? "-"} · drop ${dynamics.shortScoreDropFromPeak ?? "-"}`
      : `Dưới EMA20 ${Number(breadth.belowEma20Pct ?? 0).toFixed(0)}% · vol confirm ${Number(breadth.confirmedDownPct ?? 0).toFixed(0)}%`;
    marketHealthEls.breadth1h.textContent =
      marketHealthBreadthPair(breadth.up1hPct, breadth.down1hPct);
    marketHealthEls.breadth3h.textContent =
      marketHealthBreadthPair(breadth.up3hPct, breadth.down3hPct);
    marketHealthEls.breadth6h.textContent =
      marketHealthBreadthPair(breadth.up6hPct, breadth.down6hPct);
  } else {
    marketHealthEls.longDetail.textContent = "Chưa đủ breadth";
    marketHealthEls.shortDetail.textContent = "Chưa đủ breadth";
    marketHealthEls.breadth1h.textContent = "-- / --";
    marketHealthEls.breadth3h.textContent = "-- / --";
    marketHealthEls.breadth6h.textContent = "-- / --";
  }
  setMarketHealthDirectionalValue(marketHealthEls.btc15m, btc?.ret15m);
  setMarketHealthDirectionalValue(marketHealthEls.btc1h, btc?.ret1h);
  setMarketHealthDirectionalValue(marketHealthEls.btc6h, btc?.ret6h);

  const reasons = Array.isArray(data.reasons) ? data.reasons : [];
  marketHealthEls.reasons.innerHTML = reasons.length
    ? reasons.map((reason) => `<span>${esc(reason)}</span>`).join("")
    : "<span>Chưa có lý do xác nhận.</span>";
  marketHealthEls.sample.textContent =
    `Sample ${Number(data.sampleSize ?? 0)}/${Number(data.universeSize ?? data.minSample ?? 0)} · ${marketHealthTime(data.evaluatedAt)}`;
  marketHealthEls.pending.textContent = data.pendingLabel
    ? `Đang xác nhận ${MARKET_DIRECTION_LABELS[data.pendingLabel] ?? data.pendingLabel} · ${Number(data.pendingCount ?? 0)}/${Number(data.hysteresisSamples ?? 2)} nến 5m`
    : `Nhãn giữ qua ${Number(data.hysteresisSamples ?? 2)} nến 5m`;
  renderRecommendedMarketDispersionRealtime(data);
  renderRecommendedMarketHealthClock();
}

async function loadRecommendedMarketHealth() {
  if (marketHealthLoading || document.hidden) return;
  marketHealthLoading = true;
  try {
    const response = await fetch("/api/liquid-market-direction-health", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderRecommendedMarketHealth(await response.json());
  } catch (error) {
    marketHealthEls.live.classList.remove("is-connecting", "is-live");
    marketHealthEls.live.classList.add("is-stale");
    marketHealthEls.liveText.textContent = `Realtime lỗi · ${error.message}`;
  } finally {
    marketHealthLoading = false;
  }
}

function startRecommendedMarketHealth() {
  loadRecommendedMarketHealth();
  window.setInterval(loadRecommendedMarketHealth, 20_000);
  window.setInterval(renderRecommendedMarketHealthClock, 1_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadRecommendedMarketHealth();
  });
}

function marketWaveBadges(trade) {
  const wave = trade?.marketDirectionAtSignal?.scoreDynamics;
  if (!wave) return '';
  const shortBadge = wave.shortWaveState
    ? `<span class="liquid-short-wave" data-short-wave="${esc(wave.shortWaveState)}" title="${esc(wave.shortWaveDescription ?? 'Snapshot nhịp SHORT tại entry')}">${esc(wave.shortWaveLabel ?? wave.shortWaveState)}</span>`
    : '';
  const longBadge = wave.longWaveState
    ? `<span class="liquid-long-wave" data-long-wave="${esc(wave.longWaveState)}" title="${esc(wave.longWaveDescription ?? 'Snapshot nhịp LONG tại entry')}">${esc(wave.longWaveLabel ?? wave.longWaveState)}</span>`
    : '';
  return `${shortBadge}${longBadge}`;
}

function normalizeBtcRegime(value) {
  const raw = String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!raw || raw === "NO_DATA" || raw === "BTC_NO_DATA") return "";
  return raw;
}

function btcRegimeLabel(trade) {
  const direct = normalizeBtcRegime(
    field(
      trade,
      "recommendationBtcRegime",
      "btcRegimeAtEntry",
      "btcRegime",
      "btcRegimeShape",
      "btcRegimeLabel",
    ),
  );
  if (direct) return direct;

  const comboText = normalizeBtcRegime(
    [trade?.recommendationCombo, trade?.combo, trade?.recommendationGate]
      .filter(Boolean)
      .join(" | "),
  );
  const comboPatterns = [
    "SIDEWAY_UP",
    "SIDEWAY_DOWN",
    "WEAK_UP",
    "WEAK_DOWN",
    "STRONG_UP",
    "STRONG_DOWN",
    "CHOP",
    "FLAT",
  ];
  const matched = comboPatterns.find((pattern) => comboText.includes(pattern));
  if (matched) return matched;

  const phase = normalizeBtcRegime(trade?.recommendationBtcPhase);
  if (phase === "BTC_UP_WEAK") return "WEAK_UP";
  if (phase === "BTC_DOWN_WEAK") return "WEAK_DOWN";
  if (phase === "BTC_UP_STRONG") return "STRONG_UP";
  if (phase === "BTC_DOWN_STRONG") return "STRONG_DOWN";
  return "";
}

function btcRegimeBadge(trade) {
  const label = btcRegimeLabel(trade);
  if (!label) return "-";
  return `<span class="trend-badge trend-${esc(label.toLowerCase())}">${esc(label)}</span>`;
}

function candlePatternCell(trade) {
  const raw = trade?.candlePatternAtEntry;
  const name = String(typeof raw === "object" ? raw?.name : raw ?? "NO_DATA")
    .trim()
    .toUpperCase();
  const labels = {
    BULLISH_ENGULFING: "Bullish Engulfing",
    BEARISH_ENGULFING: "Bearish Engulfing",
    DOJI: "Doji",
    HAMMER: "Hammer",
    SHOOTING_STAR: "Shooting Star",
    BULLISH_PIN_BAR: "Bullish Pin Bar",
    BEARISH_PIN_BAR: "Bearish Pin Bar",
    BULLISH_MARUBOZU: "Bullish Marubozu",
    BEARISH_MARUBOZU: "Bearish Marubozu",
    BULLISH_CANDLE: "Bullish Candle",
    BEARISH_CANDLE: "Bearish Candle",
    STRONG_RED_CLOSE: "Strong Red Close",
    STRONG_GREEN_CLOSE: "Strong Green Close",
    NO_DATA: "No data",
    UNKNOWN: "No data",
  };
  const label = labels[name] ?? name.replaceAll("_", " ");
  const timeframe = String(
    (typeof raw === "object" ? raw?.timeframe : "")
      || trade?.candlePatternTimeframe
      || "-",
  ).toUpperCase();
  return `<span class="candle-pattern">${esc(label)}<small>${esc(timeframe)} · tại lúc nhận tín hiệu</small></span>`;
}

function btcCandlePatternCell(trade) {
  return candlePatternCell({
    ...trade,
    candlePatternAtEntry: trade?.btcCandlePatternAtEntry ?? trade?.btcCandlePattern5m ?? null,
    candlePatternTimeframe: trade?.btcCandlePatternAtEntry?.timeframe
      ?? trade?.btcCandlePattern5m?.timeframe
      ?? "5m",
  });
}

function pythonFlag(flag, compact = false) {
  if (state.learning?.enabled === false) {
    return '<span class="py-flag py-no_data" title="Python model đã tắt để giảm tải máy">PY OFF</span>';
  }
  const value = flag ?? {
    label: "PY NO DATA",
    tier: "NO_DATA",
    confidence: 0,
    reason: "Lệnh nằm ngoài cửa sổ học hoặc chưa có đánh giá Python.",
  };
  const tier = String(value.tier ?? "NO_DATA").toLowerCase();
  const details = value.reason ?? "Chưa có đánh giá Python.";
  return `<span class="py-flag py-${esc(tier)}" title="${esc(details)}">${esc(value.label ?? "PY NO DATA")}${compact ? "" : `<small>${esc(value.samples ?? 0)} mẫu · ${esc(value.confidence ?? 0)}% tin cậy</small>`}</span>`;
}

function recommendedLayerBadge(tier, label, reason = "") {
  const normalized = String(tier ?? "WATCH").trim().toUpperCase();
  const safeTier = ["GOOD", "WATCH", "RISK"].includes(normalized)
    ? normalized
    : "WATCH";
  return `<span class="layer-badge layer-${safeTier.toLowerCase()}" title="${esc(reason)}">${esc(label ?? safeTier)}</span>`;
}

function pythonModelRank(flag) {
  const value = String(flag?.label ?? flag?.flag ?? flag?.tier ?? "").toUpperCase();
  if (value.includes("GOOD") || value.includes("VERIFIED")) return 4;
  if (value.includes("WATCH")) return 3;
  if (value.includes("RISK")) return 2;
  if (value.includes("NO OOS")) return 1;
  return 0;
}

function renderPythonSummary(learning) {
  const training = learning?.training;
  const target = $("python-summary");
  if (!target) return;
  if (learning?.enabled === false) {
    target.className = "python-summary";
    target.innerHTML = "<b>PY MODEL OFF</b><span>Đã tắt train và chấm Python để giảm tải máy.</span><small>Signal Picks và paper vẫn chạy bình thường.</small>";
    return;
  }
  if (!training) {
    target.className = "python-summary py-error";
    target.innerHTML = "PY MODEL · chưa tải được dữ liệu đánh giá";
    return;
  }
  const global = training.global ?? {};
  target.className = "python-summary";
  target.innerHTML = `<b>${esc(learning.model)}</b><span>${training.closedSamples ?? 0} lệnh đóng sau baseline · ${training.learnedGroups ?? 0} nhóm đủ mẫu · Global AdjWR ${fmt(global.adjustedWr, 1)}% · AvgROE ${global.avgRoe >= 0 ? "+" : ""}${fmt(global.avgRoe, 1)}%</span><small>Walk-forward nhân quả · chỉ đánh giá, không can thiệp whitelist / entry / size / SL / TP</small>`;
}

function effectiveStrength({ closed, wr, avgRoe, pnl, fallback = "NEUTRAL" }) {
  if (!closed) return fallback;
  if (closed >= 8 && wr != null && wr >= 80 && avgRoe != null && avgRoe >= 3 && pnl > 0)
    return "STRONG";
  if (closed >= 3 && pnl > 0 && avgRoe != null && avgRoe >= 0.5)
    return "GOOD";
  if (pnl < 0 || (avgRoe != null && avgRoe < -0.2)) return "BAD";
  return "NEUTRAL";
}

function setLoading(loading, error = null) {
  state.loading = loading;
  document.body.classList.toggle("is-loading", loading);
  $("app").setAttribute("aria-busy", String(loading));
  $("combo-window").disabled = loading;
  $("reload").disabled = loading;
  const status = $("load-status");
  status.className = `load-status ${loading ? "loading" : error ? "error" : "done"}`;
  $("load-status-text").textContent = loading
    ? "ĐANG TẢI DỮ LIỆU..."
    : error
      ? `TẢI LỖI · ${error.message}`
      : `ĐÃ CẬP NHẬT ${new Date().toLocaleTimeString("vi-VN")}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function normalizeRangeState() {
  if (!validDateKey(state.fromDay) && validDateKey(state.toDay)) {
    state.fromDay = state.toDay;
  }
  if (!validDateKey(state.toDay) && validDateKey(state.fromDay)) {
    state.toDay = state.fromDay;
  }
  if (state.fromDay > state.toDay) {
    [state.fromDay, state.toDay] = [state.toDay, state.fromDay];
  }
}

function initializeDateRange(catalog) {
  if (state.rangeInitialized) return;
  const params = new URLSearchParams(window.location.search);
  const requestedFrom = params.get("fromDay");
  const requestedTo = params.get("toDay");
  const today = utcToday();
  const fallback = today || catalog?.selectedDay || "";
  state.fromDay = validDateKey(requestedFrom) ? requestedFrom : fallback;
  state.toDay = validDateKey(requestedTo) ? requestedTo : state.fromDay;
  state.rangeMode = state.fromDay === today && state.toDay === today
    ? "today"
    : "custom";
  for (const { key } of PAPER_FILTER_CONTROLS) {
    state.paperFilters[key] = String(params.get(key) ?? "").trim().toUpperCase();
  }
  state.rangeInitialized = true;
  normalizeRangeState();
  state.draftFromDay = state.fromDay;
  state.draftToDay = state.toDay;
  state.draftRangeMode = state.rangeMode;
  state.dateRangeDirty = false;
}

function rangeLabel(short = false) {
  if (!state.fromDay || !state.toDay) return short ? "RANGE" : "Khoảng ngày";
  if (state.fromDay === state.toDay) return state.fromDay;
  return short
    ? `${state.fromDay.slice(5)}→${state.toDay.slice(5)}`
    : `${state.fromDay} → ${state.toDay}`;
}

function inferRangeMode(fromDay, toDay) {
  const today = utcToday();
  if (fromDay === today && toDay === today) return "today";
  const days = state.availablePaperDays;
  if (
    days.length &&
    fromDay === days[0] &&
    toDay === days[days.length - 1]
  ) return "all";
  return "custom";
}

function syncDateRangeDraftControls() {
  $("from-day").value = state.draftFromDay;
  $("to-day").value = state.draftToDay;
  $("today-range").classList.toggle("active", state.draftRangeMode === "today");
  $("all-range").classList.toggle("active", state.draftRangeMode === "all");
  $("today-range").setAttribute("aria-pressed", String(state.draftRangeMode === "today"));
  $("all-range").setAttribute("aria-pressed", String(state.draftRangeMode === "all"));
  $("date-range-status").textContent = state.dateRangeDirty
    ? "Chưa áp dụng · bấm Search"
    : state.rangeMode === "today"
      ? "Tự chuyển ngày mới · UTC"
      : state.rangeMode === "all"
        ? "Toàn bộ lịch sử"
        : "Khoảng ngày đã áp dụng";
}

function setDateSearchLoading(loading) {
  const button = $("date-search");
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  button.textContent = loading ? "Đang tải..." : "Search";
  for (const id of ["from-day", "to-day", "today-range", "all-range"]) {
    $(id).disabled = loading;
  }
  $("date-search-control").setAttribute("aria-busy", String(loading));
  if (loading) {
    $("date-range-status").textContent = state.fromDay === state.toDay
      ? `Đang tải ${state.fromDay}`
      : `Đang tải ${state.fromDay} → ${state.toDay}`;
  } else {
    syncDateRangeDraftControls();
  }
}

function renderDateRangeControls(paper = {}) {
  state.availablePaperDays = paper.availablePaperDays ?? state.availablePaperDays;
  if (paper.dateRange?.fromDay && paper.dateRange?.toDay) {
    state.fromDay = paper.dateRange.fromDay;
    state.toDay = paper.dateRange.toDay;
  }
  if (!state.dateRangeDirty) {
    state.draftFromDay = state.fromDay;
    state.draftToDay = state.toDay;
    state.draftRangeMode = state.rangeMode;
  }
  syncDateRangeDraftControls();
  const url = new URL(window.location.href);
  url.searchParams.set("fromDay", state.fromDay);
  url.searchParams.set("toDay", state.toDay);
  for (const { key } of PAPER_FILTER_CONTROLS) {
    const value = state.paperFilters[key];
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", url);
}

function renderRecommendations(
  data,
  paperComboStats = [],
  postBaselineComboStats = [],
  learning = null,
) {
  const recommendationWindowLabel = state.window === "all"
    ? "tổng thể (nguồn 30D)"
    : state.window === "1"
      ? "trong ngày"
      : `${state.window} ngày`;
  $("recommendation-heading").textContent = `Đề xuất ${recommendationWindowLabel}`;
  $("basis").textContent = data.basedOnDateUtc
    ? `Dùng dữ liệu đóng đến ${data.basedOnDateUtc} UTC`
    : "";
  $("updated").textContent = data.generatedAt
    ? `Generated ${new Date(data.generatedAt).toLocaleString()}`
    : "";
  const sampleDays = state.window === "all" ? 30 : Number(state.window);
  const rows = (data.recommendations ?? [])
    .map((row) => ({
      ...row,
      selectedSample: (row.samples ?? []).find(
        (sample) => Number(sample.days) === sampleDays,
      ),
    }))
    .filter((row) => row.selectedSample);
  const paperByCombo = new Map(
    paperComboStats.map((group) => [String(group.key ?? ""), group]),
  );
  const postBaselineByCombo = new Map(
    postBaselineComboStats.map((group) => [String(group.key ?? ""), group]),
  );
  const pythonById = new Map(
    (learning?.signalFlags ?? []).map((flag) => [String(flag.id ?? ""), flag]),
  );
  let effectiveCount = 0;
  const recommendationHtml = rows.length
    ? rows
        .map((row, index) => {
          const sample = row.selectedSample ?? {};
          const key = `${row.page}|${row.btcPhase}|${row.combo}`;
          const paper = paperByCombo.get(key);
          const fresh = postBaselineByCombo.get(key);
          const paperPnl = Number(paper?.pnl ?? 0);
          const sampleClosed = Number(sample.closed ?? 0);
          const freshClosed = Number(fresh?.closed ?? 0);
          const combinedClosed = sampleClosed + freshClosed;
          const combinedWins = Number(sample.win ?? 0) + Number(fresh?.wins ?? 0);
          const combinedLosses = Number(sample.loss ?? 0) + Number(fresh?.losses ?? 0);
          const combinedDecisive = combinedWins + combinedLosses;
          const combinedWr = combinedDecisive
            ? (combinedWins / combinedDecisive) * 100
            : null;
          const combinedPnl = Number(sample.pnl ?? 0) + Number(fresh?.pnl ?? 0);
          const combinedAvgRoe = combinedClosed
            ? ((Number(sample.avgRoe ?? 0) * sampleClosed) +
                (Number(fresh?.avgRoe ?? 0) * freshClosed)) /
              combinedClosed
            : null;
          const freshLabel = freshClosed
            ? `+${freshClosed} PAPER ĐÃ TÍNH`
            : "CHƯA CÓ PAPER";
          const displayStrength = effectiveStrength({
            closed: combinedClosed,
            wr: combinedWr,
            avgRoe: combinedAvgRoe,
            pnl: combinedPnl,
            fallback: row.strength ?? "NEUTRAL",
          });
          const pyFlag = pythonById.get(String(row.id ?? ""));
          if (!["STRONG", "GOOD"].includes(displayStrength)) return "";
          effectiveCount += 1;
          const strengthTitle =
            displayStrength === row.strength
              ? `Mẫu hiệu lực: ${displayStrength}`
              : `Mẫu gốc: ${row.strength} · Sau paper: ${displayStrength}`;
          return `<article class="pick ${displayStrength === "STRONG" ? "strong" : ""}">
      <div class="pick-head"><h3>#${effectiveCount} ${esc(row.page.toUpperCase())} · ${esc(row.signalType)} ${esc(row.side)} · ${esc(row.timeframe)}</h3><span class="badge" title="${esc(strengthTitle)}">${esc(displayStrength)}</span></div>
      <div class="tokens"><span class="token">${esc(row.btcPhase)}</span><span class="token">${esc(row.scoreBucket)}</span><span class="token">${esc(row.relation)}</span><span class="token">${esc(state.window === "all" ? "TỔNG THỂ 30D" : `${state.window}D`)}</span></div>
      <div class="python-card">${pythonFlag(pyFlag)}<span>${esc(pyFlag?.reason ?? "Chưa có mẫu paper độc lập phù hợp để model kết luận.")}</span></div>
      <div class="stats"><div class="stat"><small>MẪU HIỆU LỰC</small><b>${combinedClosed}</b></div><div class="stat"><small>WR</small><b>${combinedWr == null ? "-" : `${fmt(combinedWr)}%`}</b></div><div class="stat"><small>AVG ROE</small><b>${combinedAvgRoe == null ? "-" : `${fmt(combinedAvgRoe)}%`}</b></div><div class="stat"><small>PNL</small><b>${combinedPnl >= 0 ? "+" : ""}${fmt(combinedPnl, 3)}</b></div></div>
      <div class="sample-update ${freshClosed ? "" : "sample-update-empty"}">
        <span>CẬP NHẬT · ${freshLabel}</span>
        <b>${combinedClosed} mẫu · WR ${combinedWr == null ? "-" : `${fmt(combinedWr)}%`} · AvgROE ${combinedAvgRoe == null ? "-" : `${combinedAvgRoe >= 0 ? "+" : ""}${fmt(combinedAvgRoe)}%`} · PnL ${combinedPnl >= 0 ? "+" : ""}${fmt(combinedPnl, 3)}</b>
        <small>Mẫu gốc ${sample.closed ?? 0} · WR ${fmt(sample.wr)}% · AvgROE ${fmt(sample.avgRoe)}%. Chỉ cộng paper độc lập phát sinh sau ngày baseline; không cộng lại clone của dữ liệu huấn luyện.</small>
      </div>
      <div class="paper-live ${paper ? "" : "paper-empty"}">
        <span>PAPER ${esc(rangeLabel(true))}</span>
        <b>${paper ? `${paper.wins}/${paper.total} thắng/tổng` : "chưa có lệnh"}</b>
        ${paper ? `<small>${paper.open} mở · ${paper.pending} chờ · ${paper.closed} đóng · PnL ${paperPnl >= 0 ? "+" : ""}${fmt(paperPnl, 3)}</small>` : ""}
      </div>
    </article>`;
        })
        .join("")
    : "";
  window.effectiveRecommendationCount = effectiveCount;
  $("recommendations").innerHTML = recommendationHtml
    || '<div class="empty">Không còn combo STRONG/GOOD sau khi cộng kết quả paper độc lập.</div>';
}

function getPaginationItems(currentPage, totalPages) {
  if (totalPages <= 9)
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  const visible = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);
  if (currentPage <= 4) [2, 3, 4, 5].forEach((page) => visible.add(page));
  if (currentPage >= totalPages - 3) {
    [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].forEach(
      (page) => visible.add(page),
    );
  }
  const pages = [...visible]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  return pages.flatMap((page, index) => {
    const previous = pages[index - 1];
    return index > 0 && page - previous > 1 ? ["ellipsis", page] : [page];
  });
}

function renderPagination(totalRows) {
  const items = getPaginationItems(state.page, state.pages);
  $("pagination").innerHTML = `${items
    .map((item) =>
      item === "ellipsis"
        ? '<span class="page-ellipsis" aria-hidden="true">...</span>'
        : `<button type="button" class="page-button${item === state.page ? " active" : ""}" data-page="${item}"${item === state.page ? ' aria-current="page"' : ""}>${item}</button>`,
    )
    .join("")}<span class="page-meta">${totalRows} rows</span>`;
}

const STATS_AVG_ROE_GREEN_THRESHOLD = 3.5;
const STATS_AVG_ROE_RED_THRESHOLD = -1;

function statsCardToneByAvgRoe(avgRoe) {
  if (avgRoe == null || avgRoe === "") return "watch";
  const value = Number(avgRoe);
  if (!Number.isFinite(value)) return "watch";
  if (value > STATS_AVG_ROE_GREEN_THRESHOLD) return "good";
  if (value < STATS_AVG_ROE_RED_THRESHOLD) return "risk";
  return "watch";
}

function statsCardDisplayTier(avgRoe) {
  const tone = statsCardToneByAvgRoe(avgRoe);
  if (tone === "good") return "GOOD";
  if (tone === "risk") return "RISK";
  return "WATCH";
}

function renderComboStats(rows, windowInfo = {}) {
  const groups = rows ?? [];
  const windowLabel =
    windowInfo.value === "all"
      ? "Tổng thể lịch sử (whitelist nguồn 30D)"
      : windowInfo.label ?? "Trong ngày";
  $("combo-stats-meta").textContent =
    `${groups.length} nhóm · ${windowLabel} · ${windowInfo.totalTrades ?? 0} lệnh`;
  $("combo-stats").innerHTML = groups.length
    ? groups
        .map((group) => {
          const verdict = String(group.verdict ?? "NEUTRAL");
          const tone = statsCardToneByAvgRoe(group.avgRoe);
          const pnl = Number(group.pnl ?? 0);
          const closedPnl = Number(group.closedPnl ?? 0);
          const activePnl = Number(group.activePnl ?? 0);
          return `<article class="combo-stat-card ${esc(tone)}" ${liveCardAttrs('recommended', 'combo', group.combo, group.avgRoe)} title="${esc(group.combo)} · màu theo AvgROE: xanh > 3.5%, đỏ < -1%, còn lại WATCH">
            <div class="combo-stat-title">
              <b>${esc(group.recommendationLabel)}</b>
              <span class="combo-stat-badges">
                <span class="combo-win-badge" title="Trạng thái whitelist ở cửa sổ đang chọn">${group.isActiveRecommendation ? "ĐANG PASS" : "ĐÃ RỚT PASS"}</span>
                <span class="combo-win-badge" title="Số tín hiệu thắng trên tổng tín hiệu trong ngày">THẮNG ${group.wins}/${group.total}</span>
                <span class="combo-verdict">${esc(verdict)}</span>
              </span>
            </div>
            <div class="combo-stat-line">${esc(String(group.sourcePage ?? "-").toUpperCase())} · ${esc(group.btcPhase)}</div>
            <div class="combo-stat-line"><strong>${group.total}</strong> lệnh · ${group.open} mở · ${group.pending} chờ · ${group.closed} đóng</div>
            <div class="combo-stat-line">${group.wins}W / ${group.losses}L / ${group.breakeven}BE · WR <strong>${group.wr == null ? "-" : `${fmt(group.wr, 1)}%`}</strong></div>
            <div class="combo-stat-line combo-pnl">PnL đóng <strong>${closedPnl >= 0 ? "+" : ""}${fmt(closedPnl, 3)}</strong> · active <strong>${activePnl >= 0 ? "+" : ""}${fmt(activePnl, 3)}</strong> · tổng <strong>${pnl >= 0 ? "+" : ""}${fmt(pnl, 3)}</strong> · AvgROE <strong>${group.avgRoe == null ? "-" : `${group.avgRoe >= 0 ? "+" : ""}${fmt(group.avgRoe, 1)}%`}</strong></div>
            <div class="combo-stat-line">FULL ${group.fullSize} · TEST $1 ${group.testSize}</div>
          </article>`;
        })
        .join("")
    : '<div class="empty">Chưa có combo paper trong ngày đã chọn.</div>';
}

function renderRuleSizeStats(rows, windowInfo = {}) {
  const groups = rows ?? [];
  const meta = $("rule-size-stats-meta");
  const target = $("rule-size-stats");
  if (!meta || !target) return;
  const windowLabel =
    windowInfo.value === "all"
      ? "Tổng thể lịch sử (whitelist nguồn 30D)"
      : windowInfo.label ?? "Trong ngày";
  meta.textContent =
    `${groups.length} nhóm size · ${windowLabel} · ${windowInfo.totalTrades ?? 0} lệnh`;
  target.innerHTML = groups.length
    ? groups
        .map((group) => {
          const tone = statsCardToneByAvgRoe(group.avgRoe);
          const pnl = Number(group.pnl ?? 0);
          const closedPnl = Number(group.closedPnl ?? 0);
          const activePnl = Number(group.activePnl ?? 0);
          return `<article class="combo-stat-card ${esc(tone)}" ${liveCardAttrs('recommended', 'rule-size', group.key ?? group.label, group.avgRoe)} title="${esc(group.label)} · màu theo AvgROE: xanh > 3.5%, đỏ < -1%, còn lại WATCH">
            <div class="combo-stat-title">
              <b>${esc(group.label)}</b>
              <span class="combo-stat-badges">
                <span class="combo-win-badge">${esc(group.verdict ?? "NEUTRAL")}</span>
              </span>
            </div>
            <div class="combo-stat-line"><strong>${group.total}</strong> lệnh · ${group.open} mở · ${group.pending} chờ · ${group.closed} đóng</div>
            <div class="combo-stat-line">${group.wins}W / ${group.losses}L / ${group.breakeven}BE · WR <strong>${group.wr == null ? "-" : `${fmt(group.wr, 1)}%`}</strong></div>
            <div class="combo-stat-line">TP/SL <strong>${group.tp}/${group.sl}</strong></div>
            <div class="combo-stat-line combo-pnl">PnL đóng <strong>${closedPnl >= 0 ? "+" : ""}${fmt(closedPnl, 3)}</strong> · active <strong>${activePnl >= 0 ? "+" : ""}${fmt(activePnl, 3)}</strong> · tổng <strong>${pnl >= 0 ? "+" : ""}${fmt(pnl, 3)}</strong> · AvgROE <strong>${group.avgRoe == null ? "-" : `${group.avgRoe >= 0 ? "+" : ""}${fmt(group.avgRoe, 1)}%`}</strong></div>
          </article>`;
        })
        .join("")
    : '<div class="empty">Chưa có rule size nào trong filter hiện tại.</div>';
}

function renderLivePricingStatus(info = {}) {
  const target = $("recommended-socket-pnl-status");
  if (!target) return;
  const active = Number(info.active ?? 0);
  const socketPriced = Number(info.socketPricedActive ?? 0);
  const priced = Number(info.pricedActive ?? 0);
  const live = active === 0 || socketPriced === active;
  const partial = !live && priced > 0;
  target.className = `socket-pnl-status ${live ? "live" : partial ? "partial" : "missing"}`;
  const updated = info.latestMarkAt
    ? new Date(info.latestMarkAt).toLocaleTimeString("vi-VN", {
        hour12: false,
        timeZone: "Asia/Bangkok",
      })
    : "-";
  target.textContent = active
    ? `● PNL ACTIVE SOCKET ${socketPriced}/${active} · ${updated}`
    : "● PNL ACTIVE · KHÔNG CÓ LỆNH MỞ";
  target.title = `Socket-first; ${priced}/${active} lệnh active có giá. PnL tick chỉ tính trong RAM, không ghi liên tục vào JSON.`;
}

function renderLayerStatCards(targetId, groups = [], liveGroup = targetId) {
  const target = $(targetId);
  if (!target) return;
  target.innerHTML = groups.length
    ? groups
        .map((group) => {
          const tone = statsCardToneByAvgRoe(group.avgRoe);
          const displayTier = statsCardDisplayTier(group.avgRoe);
          const pnl = Number(group.pnl ?? 0);
          return `<article class="combo-stat-card ${esc(tone)}" ${liveCardAttrs('recommended', liveGroup, group.key ?? group.label, group.avgRoe)} title="Màu card theo AvgROE: xanh > 3.5%, đỏ < -1%, còn lại WATCH">
            <div class="combo-stat-title">
              <b>${esc(group.label ?? group.key)}</b>
              ${recommendedLayerBadge(displayTier, group.verdictLabel ?? group.tier)}
            </div>
            <div class="combo-stat-line">${group.total} lệnh · ${group.open} mở · ${group.pending} chờ · ${group.closed} đóng</div>
            <div class="combo-stat-line">${group.wins}W / ${group.losses}L / ${group.breakeven}BE · WR <strong>${group.wr == null ? "-" : `${fmt(group.wr, 1)}%`}</strong></div>
            <div class="combo-stat-line combo-pnl">PnL đóng <strong>${Number(group.closedPnl ?? 0) >= 0 ? "+" : ""}${fmt(group.closedPnl ?? 0, 3)}</strong> · active <strong>${Number(group.activePnl ?? 0) >= 0 ? "+" : ""}${fmt(group.activePnl ?? 0, 3)}</strong> · tổng <strong>${pnl >= 0 ? "+" : ""}${fmt(pnl, 3)}</strong> · AvgROE <strong>${group.avgRoe == null ? "-" : `${group.avgRoe >= 0 ? "+" : ""}${fmt(group.avgRoe, 1)}%`}</strong></div>
            ${group.profitFactor == null ? "" : `<div class="combo-stat-line">PF <strong>${fmt(group.profitFactor, 2)}</strong> · ngày dương <strong>${group.positiveDays ?? 0}/${group.days ?? 0}</strong> · ngày âm <strong>${group.negativeDays ?? 0}</strong>${Number(group.negativeDayStreak ?? 0) > 0 ? ` · chuỗi âm hiện tại <strong>${group.negativeDayStreak} ngày</strong>` : ""}</div>`}
          </article>`;
        })
        .join("")
    : '<div class="empty">Chưa có dữ liệu hai lớp trong filter hiện tại.</div>';
}

function renderTwoLayerStats(stats = {}, windowInfo = {}) {
  const meta = $("two-layer-stats-meta");
  const windowLabel =
    windowInfo.value === "all"
      ? "Tổng thể lịch sử"
      : windowInfo.label ?? "Trong ngày";
  if (meta) {
    meta.textContent = `${windowLabel} · ${windowInfo.totalTrades ?? 0} lệnh · ${stats.version ?? "shadow"} · ${stats.marketFitVersion ?? "M4 shadow"} · OBSERVE ONLY`;
  }
  renderLayerStatCards("source-layer-stats", stats.source ?? [], 'source-layer');
  renderLayerStatCards("clone-layer-stats", stats.clone ?? [], 'clone-layer');
  renderLayerStatCards("two-layer-matrix-stats", stats.matrix ?? [], 'two-layer');
  renderLayerStatCards("market-fit-matrix-stats", stats.marketFit ?? [], 'market-fit-matrix');
  renderLayerStatCards("market-fit-label-stats", stats.marketFitLabels ?? [], 'market-fit-label');
}

function renderDayRegimeStats(stats = {}, windowInfo = {}) {
  const meta = $("day-regime-stats-meta");
  const windowLabel =
    windowInfo.value === "all"
      ? "Tổng thể lịch sử"
      : windowInfo.label ?? "Trong ngày";
  if (meta) {
    meta.textContent =
      `${windowLabel} · ${windowInfo.totalTrades ?? 0} lệnh · ${stats.method ?? "7 phiếu BTC"} · OBSERVE ONLY`;
  }
  renderLayerStatCards("day-regime-state-stats", stats.regime ?? [], 'day-regime');
  renderLayerStatCards("day-regime-selection-stats", stats.selection ?? [], 'day-selection');
  renderLayerStatCards("day-regime-side-matrix-stats", stats.sideMatrix ?? [], 'day-side');
}

function renderBacktestConfidenceStats(stats = {}, windowInfo = {}) {
  const meta = $("backtest-confidence-stats-meta");
  const windowLabel =
    windowInfo.value === "all"
      ? "Tổng thể lịch sử"
      : windowInfo.label ?? "Trong ngày";
  if (meta) {
    meta.textContent =
      `${windowLabel} · ${windowInfo.totalTrades ?? 0} lệnh · ${stats.version ?? "BT shadow"} · ${stats.reliabilityVersion ?? "CONF shadow"} · OBSERVE ONLY`;
  }
  renderLayerStatCards(
    "backtest-confidence-stats",
    stats.groups ?? [],
    'backtest-confidence',
  );
  renderLayerStatCards(
    "backtest-reliability-stats",
    stats.reliabilityGroups ?? [],
    'backtest-reliability',
  );
}

function renderMarketPointFitStats(stats = {}, windowInfo = {}) {
  const meta = $("market-point-fit-stats-meta");
  const windowLabel =
    windowInfo.value === "all"
      ? "Tổng thể lịch sử"
      : windowInfo.label ?? "Trong ngày";
  if (meta) {
    meta.textContent =
      `${windowLabel} · ${windowInfo.totalTrades ?? 0} lệnh · ${stats.version ?? "POINT shadow"} · OBSERVE ONLY`;
  }
  renderLayerStatCards(
    "market-point-fit-stats",
    stats.groups ?? [],
    'market-point-fit',
  );
  renderLayerStatCards(
    "market-point-source-side-stats",
    stats.sourceSideMatrix ?? [],
    'market-point-source-side',
  );
}

function renderMarketDispersionStats(stats = {}, windowInfo = {}) {
  const meta = $("market-dispersion-stats-meta");
  const windowLabel =
    windowInfo.value === "all"
      ? "Tổng thể lịch sử"
      : windowInfo.label ?? "Trong ngày";
  if (meta) {
    meta.textContent =
      `${windowLabel} · ${windowInfo.totalTrades ?? 0} lệnh · ${stats.version ?? "DISP shadow"} · OBSERVE ONLY`;
  }
  renderLayerStatCards(
    "market-dispersion-phase-stats",
    stats.groups ?? [],
    'market-dispersion',
  );
  renderLayerStatCards(
    "market-dispersion-source-side-stats",
    stats.sourceSideMatrix ?? [],
    'market-dispersion-source-side',
  );
}

function renderSupportEntryStats(stats = {}, windowInfo = {}) {
  const meta = $("support-entry-stats-meta");
  const windowLabel =
    windowInfo.value === "all"
      ? "Tổng thể lịch sử"
      : windowInfo.label ?? "Trong ngày";
  if (meta) {
    meta.textContent =
      `${windowLabel} · ${stats.classified ?? 0}/${windowInfo.totalTrades ?? 0} lệnh đã phân nhóm · ${stats.version ?? "ENTRY SUPPORT shadow"} · OBSERVE ONLY`;
  }
  renderLayerStatCards(
    "support-entry-group-stats",
    stats.groups ?? [],
    'support-entry',
  );
  renderLayerStatCards(
    "support-entry-source-quality-stats",
    stats.sourceQualityGroups ?? [],
    'support-source-quality',
  );
  renderLayerStatCards(
    "support-entry-short-source-stats",
    stats.shortSourceGroups ?? [],
    'support-short-source',
  );
  renderLayerStatCards(
    "support-entry-long-source-stats",
    stats.longSourceGroups ?? [],
    'support-long-source',
  );
}

function renderPaperLabelFilters(info = {}) {
  const applied = info.applied ?? {};
  const optionsByKey = info.options ?? {};
  for (const config of PAPER_FILTER_CONTROLS) {
    const select = $(config.id);
    if (!select) continue;
    const selected = String(applied[config.key] ?? state.paperFilters[config.key] ?? "");
    state.paperFilters[config.key] = selected;
    const options = Array.isArray(optionsByKey[config.key])
      ? optionsByKey[config.key]
      : [];
    const selectedExists = !selected || options.some(
      (option) => String(option.value) === selected,
    );
    const nextOptionsHtml = [
      `<option value="">${esc(config.all)}</option>`,
      ...(!selectedExists
        ? [`<option value="${esc(selected)}">${esc(selected.replaceAll("_", " "))} · 0 lệnh</option>`]
        : []),
      ...options.map(
        (option) =>
          `<option value="${esc(option.value)}">${esc(option.label)} · ${Number(option.count ?? 0)} lệnh</option>`,
      ),
    ].join("");
    // A 5-second background refresh must not close a native select while the
    // user is choosing an option. Rebuild it only after focus leaves.
    if (document.activeElement !== select) {
      if (select.innerHTML !== nextOptionsHtml) select.innerHTML = nextOptionsHtml;
      select.value = selected;
    }
  }
  const activeCount = Number(info.activeCount ?? 0);
  const totalBefore = Number(info.totalBefore ?? 0);
  const totalAfter = Number(info.totalAfter ?? totalBefore);
  const meta = $("paper-label-filter-meta");
  if (meta) {
    meta.textContent = activeCount
      ? `${activeCount} điều kiện AND · còn ${totalAfter}/${totalBefore} lệnh`
      : `Tất cả ${totalBefore} lệnh trong khoảng ngày`;
  }
}

function renderPaper(data, learning = null) {
  const summary = data.summary ?? {};
  renderPaperLabelFilters(data.paperFilters);
  renderLivePricingStatus(data.livePricing);
  $("summary").innerHTML = [
    ["COMBO ĐỀ XUẤT", window.effectiveRecommendationCount ?? 0],
    ["PAPER CLONE", summary.total ?? 0],
    ["AVG SCORE", summary.avgScore == null ? "-" : fmt(summary.avgScore, 1)],
    ["CLOSED WR", summary.wr == null ? "-" : `${fmt(summary.wr)}%`],
    ["PNL ĐÓNG", `${Number(summary.closedPnl ?? 0) >= 0 ? "+" : ""}${fmt(summary.closedPnl)}`],
    ["PNL ACTIVE", `${Number(summary.activePnl ?? 0) >= 0 ? "+" : ""}${fmt(summary.activePnl)}`],
    ["NET PNL", `${Number(summary.pnl ?? 0) >= 0 ? "+" : ""}${fmt(summary.pnl)}`],
  ]
    .map(
      ([label, value]) =>
        `<div class="metric"><small>${label}</small><strong>${value}</strong></div>`,
    )
    .join("");
  state.page = data.pagination?.page ?? 1;
  state.pages = data.pagination?.pages ?? 1;
  renderPagination(data.pagination?.total ?? 0);
  renderRuleSizeStats(data.ruleSizeStats, data.comboWindow);
  renderComboStats(data.comboStats, data.comboWindow);
  renderTwoLayerStats(data.twoLayerStats, data.comboWindow);
  renderDayRegimeStats(data.dayRegimeStats, data.comboWindow);
  renderBacktestConfidenceStats(
    data.backtestConfidenceStats,
    data.comboWindow,
  );
  renderMarketPointFitStats(
    data.marketPointFitStats,
    data.comboWindow,
  );
  renderMarketDispersionStats(
    data.marketDispersionStats,
    data.comboWindow,
  );
  renderSupportEntryStats(
    data.supportEntryStats,
    data.comboWindow,
  );
  document.querySelectorAll(".sort-btn").forEach((button) => {
    const active = button.dataset.sort === state.sortBy;
    button.classList.toggle("active", active);
    const label = button.textContent.replace(/\s[▲▼]$/, "");
    button.textContent = `${label}${active ? (state.sortDir === "asc" ? " ▲" : " ▼") : ""}`;
  });
  const pythonByTradeId = learning?.tradeFlags ?? {};
  const trades = [...(data.trades ?? [])];
  if (state.sortBy === "pythonModel") {
    const factor = state.sortDir === "asc" ? 1 : -1;
    trades.sort((left, right) => {
      const rankLeft = pythonModelRank(pythonByTradeId[String(left.id ?? "")]);
      const rankRight = pythonModelRank(pythonByTradeId[String(right.id ?? "")]);
      const rankDiff = (rankLeft - rankRight) * factor;
      if (rankDiff) return rankDiff;
      return Date.parse(right.createdAt ?? right.openedAt ?? 0) - Date.parse(left.createdAt ?? left.openedAt ?? 0);
    });
  }
  $("trades").innerHTML = trades.length
    ? trades
        .map((trade) => {
          const side = String(trade.side ?? "").toUpperCase();
          const pnl = Number(field(trade, "pnl", "netPnl"));
          const time = field(trade, "createdAt", "openedAt", "time");
          const exitTitle =
            [trade.outcome, trade.closeReason].filter(Boolean).join(" · ") ||
            trade.exitTypeLabel;
          const riskKnown =
            trade.highJumpRiskEvaluated ||
            Object.prototype.hasOwnProperty.call(trade, "highJumpRisk");
          const jumpRisk = trade.highJumpRisk
            ? `<span class="risk-badge" title="${esc(trade.highJumpRiskReason ?? "Biên độ nến lớn, có nguy cơ giật giá mạnh.")}">HIGH JUMP RISK</span>`
            : riskKnown
              ? '<span class="risk-badge risk-ok">JUMP OK</span>'
              : '<span class="risk-badge risk-unknown">NO DATA</span>';
          const trendDir = String(
            trade.btcTrendSnapshotDir ?? "NO_DATA",
          ).toLowerCase();
          const trendPct = Number.isFinite(Number(trade.btcTrendSnapshotPct6h))
            ? `${Number(trade.btcTrendSnapshotPct6h) >= 0 ? "+" : ""}${fmt(trade.btcTrendSnapshotPct6h, 2)}%/6h`
            : "6h -";
          const btcTrend = `<span class="trend-badge trend-${esc(trendDir)}">${esc(trade.btcTrendSnapshotLabel ?? "BTC NO DATA")}</span><small class="trend-detail">${esc(trendPct)}</small>${marketWaveBadges(trade)}`;
          const recommendationTitle = (
            trade.recommendationLabels ?? [trade.recommendationLabel]
          ).join(" · ");
          const planLabel =
            trade.recommendedTradePlanLabel ??
            (Number.isFinite(Number(trade.marginUsdt))
              ? `FULL $${fmt(trade.marginUsdt, 0)}`
              : "FULL SIZE");
          const tradePlan = `<span class="risk-badge ${String(planLabel).includes("TEST $1") ? "" : "risk-ok"}" title="${esc(trade.recommendedTradePlanReason ?? "")}">${esc(planLabel)}</span>`;
          const sourceLayer = recommendedLayerBadge(
            trade.recommendedSourceLayer,
            `SOURCE ${trade.recommendedSourceLayer ?? "WATCH"}`,
            trade.recommendedSourceLayerReason,
          );
          const cloneLayer = recommendedLayerBadge(
            trade.recommendedCloneLayer,
            `CLONE ${trade.recommendedCloneLayer ?? "WATCH"}`,
            trade.recommendedCloneLayerReason,
          );
          const twoLayer = recommendedLayerBadge(
            trade.recommendedTwoLayerTier,
            trade.recommendedTwoLayerTier ?? "WATCH",
            trade.recommendedTwoLayerReason,
          );
          const marketFit = recommendedLayerBadge(
            trade.recommendedMarketFitTier,
            trade.recommendedMarketFitLabel ?? "M4 NO DATA",
            trade.recommendedMarketFitReason,
          );
          const dayRegime = trade.recommendedDayRegimeAtEntry ?? {};
          const daySelectionSnapshot = trade.recommendedDaySelectionAtEntry ?? {};
          const daySelection = `${recommendedLayerBadge(
            daySelectionSnapshot.tier,
            daySelectionSnapshot.label ?? "DAY NO DATA",
            daySelectionSnapshot.reason,
          )}<small class="trend-detail">${esc(dayRegime.label ?? "DAY_NO_DATA")} · ${dayRegime.smoothedScore == null ? "score -" : `score ${Number(dayRegime.smoothedScore) >= 0 ? "+" : ""}${fmt(dayRegime.smoothedScore, 2)}`} · ${esc(dayRegime.sampleCount ?? 0)}/3 nhịp</small>`;
          const backtestConfidence = recommendedLayerBadge(
            trade.recommendedBacktestConfidenceTier,
            trade.recommendedBacktestConfidenceLabel ?? "BT NO DATA",
            trade.recommendedBacktestConfidenceReason,
          );
          const backtestReliability = recommendedLayerBadge(
            trade.recommendedBacktestReliabilityTier,
            trade.recommendedBacktestReliabilityLabel ?? "CONF LOW",
            trade.recommendedBacktestReliabilityReason,
          );
          const backtestAssessment = `${backtestConfidence}<small class="trend-detail">${backtestReliability}</small>`;
          const marketPointFit = `${recommendedLayerBadge(
            trade.recommendedMarketPointFitTier,
            trade.recommendedMarketPointFitLabel ?? "POINT NO DATA",
            trade.recommendedMarketPointFitReason,
          )}<small class="trend-detail">${trade.recommendedMarketPointDirectionScore == null
            ? "score -"
            : `${side} ${fmt(trade.recommendedMarketPointDirectionScore, 0)} · edge ${trade.recommendedMarketPointScoreEdge == null ? "-" : `${Number(trade.recommendedMarketPointScoreEdge) >= 0 ? "+" : ""}${fmt(trade.recommendedMarketPointScoreEdge, 0)}`} · slope ${trade.recommendedMarketPointSlope == null ? "-" : `${Number(trade.recommendedMarketPointSlope) >= 0 ? "+" : ""}${fmt(trade.recommendedMarketPointSlope, 0)}`}`}</small>`;
          const marketDispersion = `${recommendedLayerBadge(
            trade.recommendedMarketDispersionTier,
            trade.recommendedMarketDispersionLabel ?? "DISP NO DATA",
            trade.recommendedMarketDispersionReason,
          )}<small class="trend-detail">${trade.recommendedMarketDispersionLongScore == null
            ? "LONG/SHORT -"
            : `L ${fmt(trade.recommendedMarketDispersionLongScore, 0)} · S ${fmt(trade.recommendedMarketDispersionShortScore, 0)} · gap ${Number(trade.recommendedMarketDispersionScoreGap) >= 0 ? "+" : ""}${fmt(trade.recommendedMarketDispersionScoreGap, 0)}`}</small>`;
          const supportEntry = `${recommendedLayerBadge(
            trade.recommendedSupportEntryTier,
            trade.recommendedSupportEntryLabel ?? "ENTRY · NO DATA",
            trade.recommendedSupportEntryReason,
          )}<small class="trend-detail">${recommendedLayerBadge(
            trade.recommendedSupportEntryCohortTier,
            trade.recommendedSupportEntryCohortLabel ?? "ENTRY NO DATA · UNKNOWN NO SIDE",
            trade.recommendedSupportEntryReason,
          )}${trade.recommendedSupportEntrySourceQualityKey
            ? recommendedLayerBadge(
                trade.recommendedSupportEntrySourceQualityTier,
                trade.recommendedSupportEntrySourceQualityLabel,
                trade.recommendedSupportEntrySourceQualityReason,
              )
            : ""}</small><small class="trend-detail">${trade.recommendedSupportEntrySupport == null
            ? "support -"
            : `${esc(trade.recommendedSupportEntryRelation ?? "NEUTRAL")} · support ${esc(trade.recommendedSupportEntrySupport)} · flip ${trade.recommendedSupportEntryFlipAgeMinutes == null ? "-" : `${fmt(trade.recommendedSupportEntryFlipAgeMinutes, 0)}m`}`}</small>`;
          return `<tr><td class="recommend">${esc(trade.sourcePage)}</td><td><span class="signal-label" title="${esc(recommendationTitle)}">${esc(trade.recommendationLabel)}</span></td><td><b>${esc(trade.symbol)}</b></td><td class="${side === "LONG" ? "long" : "short"}">${esc(side)}</td><td class="score-cell"><b>${esc(trade.score)}</b><small>${esc(trade.scoreBucket)}</small></td><td>${tradePlan}</td><td>${sourceLayer}</td><td>${cloneLayer}</td><td>${twoLayer}</td><td>${marketFit}</td><td>${daySelection}</td><td>${backtestAssessment}</td><td>${marketPointFit}</td><td>${marketDispersion}</td><td>${supportEntry}</td><td>${candlePatternCell(trade)}</td><td>${btcCandlePatternCell(trade)}</td><td>${pythonFlag(pythonByTradeId[String(trade.id ?? "")], true)}</td><td>${esc(field(trade, "entryPrice", "entry"))}</td><td>${esc(field(trade, "markPrice", "lastPrice", "exitPrice"))}</td><td class="${pnl >= 0 ? "positive" : "negative"}">${fmt(pnl, 3)}</td><td>${fmt(field(trade, "roe", "roePct"))}%</td><td>${esc(trade.status)}</td><td><span class="exit exit-${esc(trade.exitType)}" title="${esc(exitTitle)}">${esc(trade.exitTypeLabel)}</span></td><td>${jumpRisk}</td><td>${esc(trade.recommendationBtcPhase)}</td><td>${btcRegimeBadge(trade)}</td><td>${btcTrend}</td><td title="${esc(trade.recommendationCombo)}">${esc(String(trade.recommendationCombo ?? "-").slice(0, 48))}</td><td>${time ? esc(new Date(time).toISOString().slice(0, 16).replace("T", " ")) : "-"}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="31" class="empty">Chưa có trade nguồn nào khớp whitelist trong khoảng ngày đã chọn.</td></tr>';
}

async function load({ background = false, dateSearch = false } = {}) {
  if (dateSearch) setDateSearchLoading(true);
  if (state.loading) {
    state.reloadQueued = true;
    state.reloadQueuedForeground ||= !background;
    state.reloadQueuedDateSearch ||= dateSearch;
    return;
  }
  let loadError = null;
  state.loading = true;
  if (!background) setLoading(true);
  const requestRevision = state.queryRevision;
  try {
    if (state.rangeMode === "today") {
      const today = utcToday();
      if (state.toDay && state.toDay !== today) {
        state.fromDay = today;
        state.toDay = today;
        if (!state.dateRangeDirty) {
          state.draftFromDay = today;
          state.draftToDay = today;
          state.draftRangeMode = "today";
        }
        state.page = 1;
      }
    }
    const requestedCatalogDay = state.toDay || utcToday();
    const query = requestedCatalogDay
      ? `?day=${encodeURIComponent(requestedCatalogDay)}`
      : "";
    const catalog = await fetchJson(`/api/recommended-signals${query}`);
    window.catalog = catalog;
    if (catalog.error) throw new Error(catalog.error);
    initializeDateRange(catalog);
    const paperQuery = new URLSearchParams({
      day: catalog.selectedDay ?? requestedCatalogDay,
      fromDay: state.fromDay,
      toDay: state.toDay,
      window: state.window,
      page: String(state.page),
      pageSize: String(PAPER_PAGE_SIZE),
      sortBy: state.sortBy,
      sortDir: state.sortDir,
    });
    for (const { key } of PAPER_FILTER_CONTROLS) {
      const value = state.paperFilters[key];
      if (value) paperQuery.set(key, value);
    }
    const [paper, learning] = await Promise.all([
      fetchJson(`/api/recommended-paper-trades?${paperQuery}`),
      fetchJson(`/api/recommended-signal-learning?day=${encodeURIComponent(catalog.selectedDay ?? "")}`),
    ]);
    if (paper.error) throw new Error(paper.error);
    if (learning.error) throw new Error(learning.error);
    if (requestRevision !== state.queryRevision) {
      state.reloadQueued = true;
      return;
    }
    renderDateRangeControls(paper);
    state.learning = learning;
    renderPythonSummary(learning);
    renderRecommendations(
      catalog,
      paper.comboStats ?? [],
      paper.postBaselineComboStats ?? [],
      learning,
    );
    renderPaper(paper, learning);
  } catch (error) {
    loadError = error;
    if (!background) {
      $("recommendations").innerHTML =
        `<div class="empty error">${esc(error.message)}</div>`;
    }
  } finally {
    state.loading = false;
    if (!background) setLoading(false, loadError);
    const reloadQueued = state.reloadQueued;
    const reloadForeground = state.reloadQueuedForeground;
    const reloadDateSearch = state.reloadQueuedDateSearch;
    state.reloadQueued = false;
    state.reloadQueuedForeground = false;
    state.reloadQueuedDateSearch = false;
    if (reloadQueued) {
      load({
        background: !reloadForeground,
        dateSearch: reloadDateSearch || dateSearch,
      });
    } else if (dateSearch) {
      setDateSearchLoading(false);
    }
  }
}

function stageDateRangeInputs(changedField) {
  let fromDay = $("from-day").value;
  let toDay = $("to-day").value;
  if (fromDay && toDay && fromDay > toDay) {
    if (changedField === "from") toDay = fromDay;
    else fromDay = toDay;
  }
  state.draftFromDay = fromDay;
  state.draftToDay = toDay;
  state.draftRangeMode = inferRangeMode(fromDay, toDay);
  state.dateRangeDirty =
    fromDay !== state.fromDay ||
    toDay !== state.toDay ||
    state.draftRangeMode !== state.rangeMode;
  syncDateRangeDraftControls();
}

function applyDateRangeSearch() {
  if (!validDateKey(state.draftFromDay) || !validDateKey(state.draftToDay)) return;
  state.fromDay = state.draftFromDay;
  state.toDay = state.draftToDay;
  normalizeRangeState();
  state.rangeMode = state.draftRangeMode;
  state.dateRangeDirty = false;
  state.page = 1;
  state.queryRevision += 1;
  syncDateRangeDraftControls();
  load({ dateSearch: true });
}
$("from-day").addEventListener("change", () => stageDateRangeInputs("from"));
$("to-day").addEventListener("change", () => stageDateRangeInputs("to"));
$("date-search").addEventListener("click", applyDateRangeSearch);
$("today-range").addEventListener("click", () => {
  const today = utcToday();
  state.fromDay = today;
  state.toDay = today;
  state.rangeMode = "today";
  state.draftFromDay = today;
  state.draftToDay = today;
  state.draftRangeMode = "today";
  state.dateRangeDirty = false;
  state.page = 1;
  state.queryRevision += 1;
  syncDateRangeDraftControls();
  load({ dateSearch: true });
});
$("all-range").addEventListener("click", () => {
  const days = state.availablePaperDays;
  if (!days.length) return;
  state.draftFromDay = days[0];
  state.draftToDay = days[days.length - 1];
  state.draftRangeMode = "all";
  state.dateRangeDirty =
    state.fromDay !== state.draftFromDay ||
    state.toDay !== state.draftToDay ||
    state.rangeMode !== "all";
  syncDateRangeDraftControls();
});
$("combo-window").addEventListener("change", () => {
  state.window = $("combo-window").value;
  state.page = 1;
  state.queryRevision += 1;
  load();
});
document.querySelectorAll("[data-paper-filter]").forEach((control) => {
  control.addEventListener("change", () => {
    const key = control.dataset.paperFilter;
    if (!key || !Object.prototype.hasOwnProperty.call(state.paperFilters, key)) return;
    state.paperFilters[key] = String(control.value ?? "").trim().toUpperCase();
    state.page = 1;
    state.queryRevision += 1;
    load();
  });
});
$("paper-label-filter-reset").addEventListener("click", () => {
  for (const { key } of PAPER_FILTER_CONTROLS) state.paperFilters[key] = "";
  state.page = 1;
  state.queryRevision += 1;
  load();
});
$("reload").addEventListener("click", () => load());
$("pagination").addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button) return;
  const page = Number(button.dataset.page);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > state.pages ||
    page === state.page
  )
    return;
  state.page = page;
  state.queryRevision += 1;
  load();
});
document.querySelector("thead").addEventListener("click", (event) => {
  const button = event.target.closest(".sort-btn");
  if (!button) return;
  const key = button.dataset.sort;
  if (state.sortBy === key)
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  else {
    state.sortBy = key;
    state.sortDir = [
      "sourcePage",
      "recommendation",
      "symbol",
      "side",
      "status",
      "exitType",
      "tradePlan",
      "sourceLayer",
      "cloneLayer",
      "twoLayer",
      "marketFit",
      "daySelection",
      "backtestConfidence",
      "marketPointFit",
      "marketDispersion",
      "candle",
      "btcCandle",
      "sideBtc",
      "btcPhase",
      "btcRegime",
      "btcTrend",
      "combo",
    ].includes(key)
      ? "asc"
      : "desc";
  }
  state.page = 1;
  state.queryRevision += 1;
  load();
});
startRecommendedMarketHealth();
load();
setInterval(() => {
  if (!state.loading && !document.hidden) load({ background: true });
}, 5000);
