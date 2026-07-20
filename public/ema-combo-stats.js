const pageFilter = document.getElementById('pageFilter');
const typeFilter = document.getElementById('typeFilter');
const dayFilter = document.getElementById('dayFilter');
const tfFilter = document.getElementById('tfFilter');
const comboFilter = document.getElementById('comboFilter');
const sortFilter = document.getElementById('sortFilter');
const reloadBtn = document.getElementById('reloadBtn');
const comboStatus = document.getElementById('comboStatus');
const comboGrid = document.getElementById('comboGrid');
const statCombos = document.getElementById('statCombos');
const statWr = document.getElementById('statWr');
const statPnl = document.getElementById('statPnl');
const statRoe = document.getElementById('statRoe');

let availableDays = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtMoney(v) {
  if (v == null || Number.isNaN(Number(v))) return '-';
  const n = Number(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

function fmtPct(v, digits = 1) {
  if (v == null || Number.isNaN(Number(v))) return '-';
  const n = Number(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function toneOf(row) {
  const q = String(row.quality ?? '').toUpperCase();
  if (q === 'STRONG_SAMPLE') return { cls: 'strong', label: 'STRONG SAMPLE' };
  if (q === 'GOOD') return { cls: 'good', label: 'GOOD' };
  if (q === 'BAD') return { cls: 'bad', label: 'BAD' };
  return { cls: 'neutral', label: 'NEUTRAL' };
}

function chipClass(text) {
  const s = String(text ?? '').toUpperCase();
  if (/GOOD|OK|PASS|THUAN|STRONG|MID|UP_STRONG|DOWN_STRONG/.test(s)) return 'good';
  if (/WEAK|YEU|TEST|CAUTION|LATE|NO_DATA|UNKNOWN|NEUTRAL/.test(s)) return 'warn';
  if (/BAD|BLOCK|RAC|NGUOC|LOSS|FAIL/.test(s)) return 'bad';
  return '';
}

function comboParts(value) {
  return String(value ?? '')
    .split('|')
    .map((part) => {
      const raw = String(part ?? '').trim();
      const normalized = raw.replace(/\s+/g, '_').toUpperCase();
      if (!raw || raw === '-' || normalized === 'GATE' || normalized === 'GATE_-' || normalized === 'UNKNOWN') {
        return 'GATE_UNKNOWN';
      }
      return raw;
    })
    .filter(Boolean);
}

function renderCard(row, index) {
  const parts = comboParts(row.key);
  const stage = parts[0] ?? '-';
  const side = parts[1] ?? '-';
  const tf = parts[2] ?? '-';
  const rest = parts.slice(3);
  const tone = toneOf(row);
  const sideCls = side === 'LONG' ? 'long' : side === 'SHORT' ? 'short' : '';
  const pnlCls = Number(row.pnl ?? 0) >= 0 ? 'pos' : 'neg';
  const roeCls = Number(row.avgRoe ?? 0) >= 0.2 ? 'pos' : 'neg';
  const qScore = Number(row.qualityScore ?? 0);
  const plan = row.tradePlan ?? {};
  const planLabel = String(plan.label ?? '').trim() || 'TEST $10';
  const planMargin = Number(plan.marginUsdt);
  const planCls = Number.isFinite(planMargin) && planMargin <= 1.01 ? 'bad' : 'good';
  const planReason = plan.reason ? ` title="${escapeHtml(plan.reason)}"` : '';
  return `
    <article class="combo-card ${tone.cls} ${sideCls}">
      <div class="combo-top">
        <div>
          <div class="combo-title">#${index + 1} ${escapeHtml(stage)} ${escapeHtml(side)} · ${escapeHtml(tf)}</div>
          <div class="muted" style="margin-top:3px;font-size:11px">qualityScore ${Number.isFinite(qScore) ? qScore.toFixed(1) : '-'}</div>
        </div>
        <div class="combo-actions">
          <span class="combo-chip ${planCls}"${planReason}>${escapeHtml(planLabel)}</span>
          <span class="combo-chip ${tone.cls === 'bad' ? 'bad' : tone.cls === 'neutral' ? 'warn' : 'good'}">${tone.label}</span>
        </div>
      </div>
      <div class="combo-badges">
        ${rest.map((p) => `<span class="combo-chip ${chipClass(p)}">${escapeHtml(p.replaceAll('_', ' '))}</span>`).join('')}
      </div>
      <div class="combo-metrics">
        <div class="combo-metric"><span>Closed</span><strong>${Number(row.closed ?? 0)}/${Number(row.total ?? 0)}</strong></div>
        <div class="combo-metric"><span>WR</span><strong>${row.wr == null ? '-' : Number(row.wr).toFixed(1) + '%'}</strong></div>
        <div class="combo-metric"><span>PnL</span><strong class="${pnlCls}">${fmtMoney(row.pnl)}</strong></div>
        <div class="combo-metric"><span>Avg ROE</span><strong class="${roeCls}">${fmtPct(row.avgRoe)}</strong></div>
      </div>
      <div class="muted" style="margin-top:8px;font-size:11px">
        ${Number(row.wins ?? 0)} win / ${Number(row.losses ?? 0)} loss · GOOD cần AvgROE >= +0.5%, STRONG cần nhiều mẫu + PnL tốt.
      </div>
    </article>
  `;
}

function updateDays(days) {
  const current = dayFilter.value;
  availableDays = Array.isArray(days) ? days : [];
  dayFilter.innerHTML = '<option value="all">Tất cả</option>'
    + availableDays.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  if (availableDays.includes(current)) dayFilter.value = current;
}

async function loadCombos() {
  comboStatus.textContent = 'Loading...';
  const params = new URLSearchParams({
    page: pageFilter.value,
    type: typeFilter.value,
    day: dayFilter.value,
    tf: tfFilter.value,
    combo: comboFilter.value,
    sort: sortFilter.value,
  });
  const res = await fetch(`/api/ema-combo-stats?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  updateDays(data.availableDays);
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const summary = data.summary ?? {};
  statCombos.textContent = String(rows.length);
  statWr.textContent = summary.wr == null ? '-' : `${Number(summary.wr).toFixed(1)}%`;
  statPnl.textContent = fmtMoney(summary.pnl);
  statPnl.className = Number(summary.pnl ?? 0) >= 0 ? 'pos' : 'neg';
  statRoe.textContent = fmtPct(summary.avgRoe, 2);
  statRoe.className = Number(summary.avgRoe ?? 0) >= 0.2 ? 'pos' : 'neg';
  comboGrid.innerHTML = rows.length
    ? rows.map(renderCard).join('')
    : '<div class="combo-card neutral"><strong>Không có combo theo filter này</strong></div>';
  comboStatus.textContent = `Updated ${new Date(data.updatedAt ?? Date.now()).toLocaleTimeString('vi')}`;
}

async function safeLoad() {
  try {
    await loadCombos();
  } catch (err) {
    comboStatus.textContent = `Error: ${err.message}`;
    comboGrid.innerHTML = `<div class="combo-card bad"><strong>Lỗi tải combo</strong><div class="muted">${escapeHtml(err.message)}</div></div>`;
  }
}

[pageFilter, typeFilter, dayFilter, tfFilter, comboFilter, sortFilter].forEach((el) => {
  el.addEventListener('change', safeLoad);
});
reloadBtn.addEventListener('click', safeLoad);
safeLoad();
