const els = Object.fromEntries([
  'binanceStatsStatus', 'binanceStatsFilters', 'binanceStatsFromDay', 'binanceStatsToDay',
  'binanceStatsLabel', 'binanceStatsToday', 'binanceStatsAll', 'binanceStatsSummary',
  'binanceStatsGroups', 'binanceStatsRows', 'binanceStatsPrev', 'binanceStatsNext', 'binanceStatsPageInfo',
].map((id) => [id, document.getElementById(id)]));

let statsData = null;
let page = 1;
const PAGE_SIZE = 20;

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const signedClass = (value) => Number(value) > 0 ? 'is-positive' : Number(value) < 0 ? 'is-negative' : '';
const price = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(6);
};
const dateTime = (value) => {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString('vi-VN') : '--';
};
const money = (value, known = true) => {
  const n = Number(value);
  return known && Number.isFinite(n) ? `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(4)}` : '--';
};
const percent = (value, digits = 1) => value == null || value === '' || !Number.isFinite(Number(value))
  ? '--' : `${Number(value).toFixed(digits)}%`;
const pf = (value, gross = 0) => value == null
  ? (Number(gross) > 0 ? '∞' : '--')
  : (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '--');
const bangkokDay = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

async function jsonApi(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function recoverToken() {
  const raw = localStorage.getItem('orders_creds');
  if (raw) {
    try {
      const credentials = JSON.parse(raw);
      if (credentials?.apiKey && credentials?.apiSecret) {
        const data = await jsonApi('/api/auth', { method: 'POST', body: JSON.stringify(credentials) });
        localStorage.setItem('orders_token', data.token);
        return data.token;
      }
    } catch { /* try local env */ }
  }
  const data = await jsonApi('/api/auth/env', { method: 'POST' });
  localStorage.setItem('orders_token', data.token);
  return data.token;
}

function renderRows() {
  const rows = Array.isArray(statsData?.rows) ? statsData.rows : [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  page = Math.min(Math.max(1, page), pages);
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  els.binanceStatsPageInfo.textContent = `Trang ${page} / ${pages} · ${rows.length} lệnh`;
  els.binanceStatsPrev.disabled = page <= 1;
  els.binanceStatsNext.disabled = page >= pages;
  els.binanceStatsRows.innerHTML = shown.map((row) => {
    const pnl = Number(row.pnl ?? 0);
    const slip = row.adverseSlippagePct == null ? null : Number(row.adverseSlippagePct);
    return `<tr>
      <td>${escapeHtml(dateTime(row.entryAt))}<small>${escapeHtml(row.mode ?? '-')}</small></td>
      <td><strong class="${row.side === 'LONG' ? 'is-positive' : 'is-negative'}">${escapeHtml(row.symbol)} · ${escapeHtml(row.side)}</strong></td>
      <td><strong>${escapeHtml(row.label)}</strong><small>${percent(row.confidence, 0)} confidence</small></td>
      <td>${price(row.signalEntry)} / <strong>${price(row.binanceEntry)}</strong></td>
      <td class="${Number.isFinite(slip) ? (slip <= 0 ? 'is-positive' : 'is-negative') : ''}">${Number.isFinite(slip) ? `${slip >= 0 ? '+' : ''}${slip.toFixed(3)}%` : '--'}</td>
      <td><strong>${escapeHtml(row.diagnosis ?? row.reason)}</strong><small>${escapeHtml(row.paperOutcome || row.status)}</small></td>
      <td class="${row.pnlKnown ? signedClass(pnl) : ''}"><strong>${money(pnl, row.pnlKnown)}</strong><small>ROE ${percent(row.roe)} · realized ${money(row.realizedPnl, row.pnlKnown)} · fee ${money(row.commission, row.pnlKnown)} · funding ${money(row.funding, row.pnlKnown)}</small></td>
      <td><strong>${escapeHtml(row.pnlSource)}</strong><small>Paper: ${escapeHtml(row.paperOutcome || '--')} · ${money(row.paperPnl, row.paperPnl != null)}</small></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8">Không có lệnh Binance V2 trong bộ lọc.</td></tr>';
}

function render(data) {
  statsData = data;
  const s = data.summary ?? {};
  els.binanceStatsStatus.textContent = `${Number(s.total ?? 0)} lệnh · PnL thật biết ${Number(s.pnlKnown ?? 0)}, thiếu ${Number(s.pnlMissing ?? 0)} · Asia/Bangkok${data.reconciliationWarning ? ` · Binance tạm lỗi: ${data.reconciliationWarning}` : ''}`;
  els.binanceStatsSummary.innerHTML = [
    ['FILLED', s.total ?? 0, ''], ['OPEN / CLOSED', `${s.open ?? 0} / ${s.closed ?? 0}`, ''],
    ['W / L · WR', `${s.wins ?? 0}/${s.losses ?? 0} · ${percent(s.winRate)}`, ''], ['PF', pf(s.profitFactor, s.realizedPnl), ''],
    ['AVG ROE', percent(s.avgRoe), signedClass(s.avgRoe)], ['REALIZED', money(s.realizedPnl), signedClass(s.realizedPnl)],
    ['UNREALIZED', money(s.unrealizedPnl), signedClass(s.unrealizedPnl)], ['NET PNL', money(s.netPnl), signedClass(s.netPnl)],
  ].map(([label, value, cls]) => `<article><span>${escapeHtml(label)}</span><strong class="${cls}">${escapeHtml(String(value))}</strong></article>`).join('');
  const selected = els.binanceStatsLabel.value;
  els.binanceStatsLabel.innerHTML = '<option value="">Tất cả tín hiệu</option>'
    + (data.availableLabels ?? []).map((row) => `<option value="${escapeHtml(row.key)}" ${row.key === selected ? 'selected' : ''}>${escapeHtml(row.label)}</option>`).join('');
  els.binanceStatsGroups.innerHTML = (data.groups ?? []).map((row) => `<tr>
    <td><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.key)}</small></td>
    <td>${Number(row.total ?? 0)} <small>${Number(row.open ?? 0)} mở / ${Number(row.pnlMissing ?? 0)} thiếu PnL</small></td>
    <td>${Number(row.wins ?? 0)} / ${Number(row.losses ?? 0)}</td><td>${percent(row.winRate)}</td><td>${pf(row.profitFactor, row.realizedPnl)}</td>
    <td class="${signedClass(row.avgRoe)}">${percent(row.avgRoe)}</td><td class="${signedClass(row.netPnl)}"><strong>${money(row.netPnl)}</strong></td>
  </tr>`).join('') || '<tr><td colspan="7">Không có nhóm tín hiệu trong bộ lọc.</td></tr>';
  renderRows();
}

async function load() {
  page = 1;
  els.binanceStatsStatus.textContent = 'Đang đối soát Binance Income…';
  try {
    let token = localStorage.getItem('orders_token') ?? '';
    if (!token) token = await recoverToken();
    const params = new URLSearchParams();
    if (els.binanceStatsFromDay.value) params.set('fromDay', els.binanceStatsFromDay.value);
    if (els.binanceStatsToDay.value) params.set('toDay', els.binanceStatsToDay.value);
    if (els.binanceStatsLabel.value) params.set('labelKey', els.binanceStatsLabel.value);
    const request = () => jsonApi(`/api/liquid-flow-v2-binance-stats?${params}`, { headers: { 'x-orders-token': token } });
    try { render(await request()); } catch (error) {
      if (error.status !== 401) throw error;
      localStorage.removeItem('orders_token');
      token = await recoverToken();
      render(await request());
    }
  } catch (error) {
    els.binanceStatsStatus.textContent = `Không tải được thống kê: ${error.message}`;
    els.binanceStatsGroups.innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
    els.binanceStatsRows.innerHTML = `<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`;
  }
}

els.binanceStatsFilters.addEventListener('submit', (event) => { event.preventDefault(); load(); });
els.binanceStatsToday.addEventListener('click', () => {
  const today = bangkokDay(); els.binanceStatsFromDay.value = today; els.binanceStatsToDay.value = today; load();
});
els.binanceStatsAll.addEventListener('click', () => {
  els.binanceStatsFromDay.value = ''; els.binanceStatsToDay.value = ''; load();
});
els.binanceStatsPrev.addEventListener('click', () => { page = Math.max(1, page - 1); renderRows(); });
els.binanceStatsNext.addEventListener('click', () => { page += 1; renderRows(); });

const today = bangkokDay();
els.binanceStatsFromDay.value = today;
els.binanceStatsToDay.value = today;
load();
