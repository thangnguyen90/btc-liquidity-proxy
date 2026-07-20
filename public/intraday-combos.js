const $ = (id) => document.getElementById(id);
let payload = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function fmt(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("vi-VN", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
}
function trendLabel(btc) {
  const dir = btc.direction === "UP" ? "TĂNG" : btc.direction === "DOWN" ? "GIẢM" : "ĐI NGANG";
  const strength = btc.strength === "STRONG" ? "MẠNH" : btc.strength === "MID" ? "VỪA" : "YẾU";
  return `${dir} · ${strength}`;
}

function render(data) {
  payload = data;
  const btc = data.btc ?? {};
  $("generatedAt").textContent = `Cập nhật ${new Date(data.generatedAt).toLocaleString("vi-VN")}`;
  $("btcPhase").textContent = trendLabel(btc);
  $("btcDetail").textContent = `BTC ${btc.price ? `$${fmt(btc.price, 0)}` : "—"} · 6h ${btc.pct6h == null ? "—" : `${btc.pct6h >= 0 ? "+" : ""}${fmt(btc.pct6h)}%`} · RSI 1h ${fmt(btc.rsi1h)}`;
  $("trendScore").textContent = fmt(btc.trendScore, 0);
  const summary = data.summary ?? {};
  $("summary").innerHTML = [["NGUỒN LOG", summary.sources], ["TÍN HIỆU", summary.trades], ["ĐÃ ĐÓNG", summary.closed], ["COMBO PASS", summary.qualified]].map(([label, value]) => `<article class="stat"><small>${label}</small><strong>${Number(value ?? 0).toLocaleString("vi-VN")}</strong></article>`).join("");
  renderPicks();
  $("coverage").innerHTML = `<table><thead><tr><th>NGUỒN</th><th>FILE</th><th>TỔNG LOG</th><th>TRONG WINDOW</th><th>ĐÃ ĐÓNG</th></tr></thead><tbody>${(data.coverage ?? []).map((row) => `<tr><td>${esc(row.source.toUpperCase())}</td><td>${esc(row.file)}</td><td>${Number(row.rows).toLocaleString("vi-VN")}</td><td>${Number(row.inWindow).toLocaleString("vi-VN")}</td><td>${Number(row.closed).toLocaleString("vi-VN")}</td></tr>`).join("")}</tbody></table>`;
  $("warnings").innerHTML = (data.warnings ?? []).map((warning) => `<p>${esc(warning)}</p>`).join("");
}

function renderPicks() {
  if (!payload) return;
  const filter = $("grade").value;
  const rows = (payload.recommendations ?? []).filter((row) => filter === "ALL" || (filter === "A" ? row.grade === "A" : ["A", "B"].includes(row.grade)));
  $("resultMeta").textContent = `${rows.length} combo · ${payload.lookbackDays} ngày · min ${payload.minClosed} lệnh đóng`;
  $("picks").innerHTML = rows.length ? rows.map((row) => {
    const sideClass = String(row.side).toLowerCase();
    const pnl = Number(row.pnl ?? 0);
    return `<article class="pick grade-${esc(row.grade)}">
      <div class="pick-top"><div><div class="rank">#${row.rank}</div><div class="source">${esc(row.source)} · ${esc(row.signalType)}</div></div><div class="grade ${esc(row.grade)}">${esc(row.grade)}</div></div>
      <h3>${esc(row.combo)}</h3>
      <div class="tags"><span class="tag ${sideClass}">${esc(row.side)}</span><span class="tag">${esc(row.timeframe)}</span><span class="tag">${esc(row.marginBucket)}</span><span class="tag">SCORE ${esc(row.scoreBucket)}</span><span class="tag">SIZE ${esc(row.suggestedSize)}</span></div>
      <div class="score-row"><div class="score">${fmt(row.predictionScore)}<small>/100</small></div><div><div class="action">${esc(row.action)}</div><div class="bar"><i style="width:${Math.max(0, Math.min(100, row.predictionScore))}%"></i></div></div></div>
      <div class="metrics"><div><small>CLOSED</small><b>${row.closed}</b></div><div><small>ADJ. WR</small><b>${fmt(row.adjustedWr)}%</b></div><div><small>AVG ROE</small><b>${row.avgRoe >= 0 ? "+" : ""}${fmt(row.avgRoe)}%</b></div><div><small>PNL</small><b>${pnl >= 0 ? "+" : ""}${fmt(pnl, 3)}</b></div></div>
      ${(row.reasons ?? []).slice(0, 4).map((reason) => `<p class="reason">${esc(reason)}</p>`).join("")}
      ${(row.risks ?? []).length ? `<p class="risk">${esc(row.risks.join(" · "))}</p>` : ""}
    </article>`;
  }).join("") : `<div class="empty">Không có combo đạt bộ lọc này. Hãy tăng cửa sổ dữ liệu hoặc giảm mẫu tối thiểu.</div>`;
}

async function load() {
  $("refresh").disabled = true;
  $("error").hidden = true;
  try {
    const query = new URLSearchParams({ days: $("days").value, minClosed: $("minClosed").value, limit: "30" });
    const response = await fetch(`/api/intraday-combos?${query}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
    render(data);
  } catch (error) {
    $("error").textContent = `Không thể chạy bộ phân tích Python: ${error.message}`;
    $("error").hidden = false;
    $("picks").innerHTML = '<div class="empty">Chưa có kết quả phân tích.</div>';
  } finally {
    $("refresh").disabled = false;
  }
}

$("refresh").addEventListener("click", load);
$("grade").addEventListener("change", renderPicks);
$("coverageToggle").addEventListener("click", () => { const target = $("coverage"); target.hidden = !target.hidden; $("coverageToggle").textContent = target.hidden ? "Mở chi tiết" : "Thu gọn"; });
load();
