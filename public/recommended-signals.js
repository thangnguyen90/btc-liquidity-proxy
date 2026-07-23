const $ = (id) => document.getElementById(id);
const PAPER_PAGE_SIZE = 50;
const state = {
  day: "",
  window: "1",
  page: 1,
  pages: 1,
  sortBy: "time",
  sortDir: "desc",
  loading: false,
  learning: null,
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
  $("day").disabled = loading;
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

function renderDays(days, selected) {
  const select = $("day");
  select.innerHTML = days
    .map(
      (day) =>
        `<option value="${esc(day)}" ${day === selected ? "selected" : ""}>${esc(day)}</option>`,
    )
    .join("");
  state.day = selected;
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
        <span>PAPER ${state.window === "all" ? "TỔNG" : state.window === "1" ? "NGÀY" : `${state.window}D`}</span>
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
          const verdict = String(group.verdict ?? "NEUTRAL").toLowerCase();
          const pnl = Number(group.pnl ?? 0);
          return `<article class="combo-stat-card ${esc(verdict)}" title="${esc(group.combo)}">
            <div class="combo-stat-title">
              <b>${esc(group.recommendationLabel)}</b>
              <span class="combo-stat-badges">
                <span class="combo-win-badge" title="Trạng thái whitelist ở cửa sổ đang chọn">${group.isActiveRecommendation ? "ĐANG PASS" : "ĐÃ RỚT PASS"}</span>
                <span class="combo-win-badge" title="Số tín hiệu thắng trên tổng tín hiệu trong ngày">THẮNG ${group.wins}/${group.total}</span>
                <span class="combo-verdict">${esc(group.verdict)}</span>
              </span>
            </div>
            <div class="combo-stat-line">${esc(String(group.sourcePage ?? "-").toUpperCase())} · ${esc(group.btcPhase)}</div>
            <div class="combo-stat-line"><strong>${group.total}</strong> lệnh · ${group.open} mở · ${group.pending} chờ · ${group.closed} đóng</div>
            <div class="combo-stat-line">${group.wins}W / ${group.losses}L / ${group.breakeven}BE · WR <strong>${group.wr == null ? "-" : `${fmt(group.wr, 1)}%`}</strong></div>
            <div class="combo-stat-line combo-pnl">PnL <strong>${pnl >= 0 ? "+" : ""}${fmt(pnl, 3)}</strong> · AvgROE <strong>${group.avgRoe == null ? "-" : `${group.avgRoe >= 0 ? "+" : ""}${fmt(group.avgRoe, 1)}%`}</strong></div>
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
          const verdict = String(group.verdict ?? "NEUTRAL").toLowerCase();
          const pnl = Number(group.pnl ?? 0);
          return `<article class="combo-stat-card ${esc(verdict)}" title="${esc(group.label)}">
            <div class="combo-stat-title">
              <b>${esc(group.label)}</b>
              <span class="combo-stat-badges">
                <span class="combo-win-badge">${esc(group.verdict ?? "NEUTRAL")}</span>
              </span>
            </div>
            <div class="combo-stat-line"><strong>${group.total}</strong> lệnh · ${group.open} mở · ${group.pending} chờ · ${group.closed} đóng</div>
            <div class="combo-stat-line">${group.wins}W / ${group.losses}L / ${group.breakeven}BE · WR <strong>${group.wr == null ? "-" : `${fmt(group.wr, 1)}%`}</strong></div>
            <div class="combo-stat-line">TP/SL <strong>${group.tp}/${group.sl}</strong></div>
            <div class="combo-stat-line combo-pnl">PnL <strong>${pnl >= 0 ? "+" : ""}${fmt(pnl, 3)}</strong> · AvgROE <strong>${group.avgRoe == null ? "-" : `${group.avgRoe >= 0 ? "+" : ""}${fmt(group.avgRoe, 1)}%`}</strong></div>
          </article>`;
        })
        .join("")
    : '<div class="empty">Chưa có rule size nào trong filter hiện tại.</div>';
}

function renderPaper(data, learning = null) {
  const summary = data.summary ?? {};
  $("summary").innerHTML = [
    ["COMBO ĐỀ XUẤT", window.effectiveRecommendationCount ?? 0],
    ["PAPER CLONE", summary.total ?? 0],
    ["AVG SCORE", summary.avgScore == null ? "-" : fmt(summary.avgScore, 1)],
    ["CLOSED WR", summary.wr == null ? "-" : `${fmt(summary.wr)}%`],
    [
      "NET PNL",
      `${Number(summary.pnl ?? 0) >= 0 ? "+" : ""}${fmt(summary.pnl)}`,
    ],
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
          const btcTrend = `<span class="trend-badge trend-${esc(trendDir)}">${esc(trade.btcTrendSnapshotLabel ?? "BTC NO DATA")}</span><small class="trend-detail">${esc(trendPct)}</small>`;
          const recommendationTitle = (
            trade.recommendationLabels ?? [trade.recommendationLabel]
          ).join(" · ");
          const planLabel =
            trade.recommendedTradePlanLabel ??
            (Number.isFinite(Number(trade.marginUsdt))
              ? `FULL $${fmt(trade.marginUsdt, 0)}`
              : "FULL SIZE");
          const tradePlan = `<span class="risk-badge ${String(planLabel).includes("TEST $1") ? "" : "risk-ok"}" title="${esc(trade.recommendedTradePlanReason ?? "")}">${esc(planLabel)}</span>`;
          return `<tr><td class="recommend">${esc(trade.sourcePage)}</td><td><span class="signal-label" title="${esc(recommendationTitle)}">${esc(trade.recommendationLabel)}</span></td><td><b>${esc(trade.symbol)}</b></td><td class="${side === "LONG" ? "long" : "short"}">${esc(side)}</td><td class="score-cell"><b>${esc(trade.score)}</b><small>${esc(trade.scoreBucket)}</small></td><td>${tradePlan}</td><td>${candlePatternCell(trade)}</td><td>${btcCandlePatternCell(trade)}</td><td>${pythonFlag(pythonByTradeId[String(trade.id ?? "")], true)}</td><td>${esc(field(trade, "entryPrice", "entry"))}</td><td>${esc(field(trade, "markPrice", "lastPrice", "exitPrice"))}</td><td class="${pnl >= 0 ? "positive" : "negative"}">${fmt(pnl, 3)}</td><td>${fmt(field(trade, "roe", "roePct"))}%</td><td>${esc(trade.status)}</td><td><span class="exit exit-${esc(trade.exitType)}" title="${esc(exitTitle)}">${esc(trade.exitTypeLabel)}</span></td><td>${jumpRisk}</td><td>${esc(trade.recommendationBtcPhase)}</td><td>${btcRegimeBadge(trade)}</td><td>${btcTrend}</td><td title="${esc(trade.recommendationCombo)}">${esc(String(trade.recommendationCombo ?? "-").slice(0, 48))}</td><td>${time ? esc(new Date(time).toISOString().slice(0, 16).replace("T", " ")) : "-"}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="20" class="empty">Chưa có trade nguồn nào khớp whitelist trong ngày.</td></tr>';
}

async function load() {
  if (state.loading) return;
  let loadError = null;
  setLoading(true);
  try {
    const query = state.day ? `?day=${encodeURIComponent(state.day)}` : "";
    const catalog = await fetchJson(`/api/recommended-signals${query}`);
    window.catalog = catalog;
    if (catalog.error) throw new Error(catalog.error);
    renderDays(catalog.availableDays ?? [], catalog.selectedDay ?? "");
    const [paper, learning] = await Promise.all([
      fetchJson(`/api/recommended-paper-trades?day=${encodeURIComponent(catalog.selectedDay ?? "")}&window=${encodeURIComponent(state.window)}&page=${state.page}&pageSize=${PAPER_PAGE_SIZE}&sortBy=${encodeURIComponent(state.sortBy)}&sortDir=${encodeURIComponent(state.sortDir)}`),
      fetchJson(`/api/recommended-signal-learning?day=${encodeURIComponent(catalog.selectedDay ?? "")}`),
    ]);
    if (paper.error) throw new Error(paper.error);
    if (learning.error) throw new Error(learning.error);
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
    $("recommendations").innerHTML =
      `<div class="empty error">${esc(error.message)}</div>`;
  } finally {
    setLoading(false, loadError);
  }
}

$("day").addEventListener("change", () => {
  state.day = $("day").value;
  state.page = 1;
  load();
});
$("combo-window").addEventListener("change", () => {
  state.window = $("combo-window").value;
  state.page = 1;
  load();
});
$("reload").addEventListener("click", load);
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
      "btcPhase",
      "btcTrend",
      "combo",
    ].includes(key)
      ? "asc"
      : "desc";
  }
  state.page = 1;
  load();
});
load();
setInterval(() => {
  if (!state.loading) load();
}, 5000);
