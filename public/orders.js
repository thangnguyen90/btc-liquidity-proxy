import {
  LIVE_CARD_HISTORY_STREAM_VERSION,
  calculateLiveCardOpenPnl,
  isLiveCardExecutionOpen,
} from './live-card-history-live.js';

// ── Auth ────────────────────────────────────────────────────
const TOKEN_KEY = 'orders_token';
const CREDS_KEY = 'orders_creds'; // { apiKey, apiSecret } persisted in localStorage
const TSL_EXCLUDED_KEY = 'tsl_excluded'; // Set<symbol> — persisted locally

// TSL exclude state (localStorage + server)
const tslExcluded = new Set(JSON.parse(localStorage.getItem(TSL_EXCLUDED_KEY) ?? '[]'));
function saveTslExcluded() {
  localStorage.setItem(TSL_EXCLUDED_KEY, JSON.stringify([...tslExcluded]));
}
async function setTslExclude(symbol, excluded) {
  try {
    await apiFetch('/api/tsl-exclude', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol, excluded }),
    });
  } catch { /* non-critical */ }
}

const authOverlay = document.getElementById('authOverlay');
const authApiKeyInput = document.getElementById('authApiKeyInput');
const authApiSecretInput = document.getElementById('authApiSecretInput');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');
const mainContent = document.getElementById('mainContent');

function getToken() { return localStorage.getItem(TOKEN_KEY) ?? ''; }

async function doAuth(apiKey, apiSecret) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey, apiSecret }),
  });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error ?? 'Login failed.');
    error.code = data.code ?? null;
    throw error;
  }
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(CREDS_KEY, JSON.stringify({ apiKey, apiSecret }));
  return data.token;
}

async function tryLogin() {
  authError.textContent = '';
  const apiKey = authApiKeyInput.value.trim();
  const apiSecret = authApiSecretInput.value.trim();
  if (!apiKey || !apiSecret) {
    authError.textContent = 'Nhập API Key và API Secret.';
    return;
  }
  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = '...';
  try {
    await doAuth(apiKey, apiSecret);
    showApp();
  } catch (err) {
    authError.textContent = err.message;
    authApiKeyInput.focus();
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = 'Unlock';
  }
}

// Auto re-login using stored credentials (called on 401 or page load)
async function tryAutoReauth() {
  const raw = localStorage.getItem(CREDS_KEY);
  if (!raw) return false;
  try {
    const { apiKey, apiSecret } = JSON.parse(raw);
    await doAuth(apiKey, apiSecret);
    return true;
  } catch {
    // Credential đã lưu nhưng Binance không còn chấp nhận: bỏ cả token và
    // secret cũ để polling nền không tự đăng nhập lại vô hạn.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CREDS_KEY);
    return false;
  }
}

function showApp() {
  authOverlay.style.display = 'none';
  mainContent.style.display = '';
  loadSettings();
  loadLiveCardWhitelist();
  // Sync TSL exclude list từ server về (đồng bộ sau server restart)
  apiFetch('/api/tsl-exclude').then((d) => {
    const serverExcluded = new Set(d.excluded ?? []);
    // Merge: push localStorage lên server, pull server về localStorage
    for (const sym of tslExcluded) {
      if (!serverExcluded.has(sym)) setTslExclude(sym, true);
    }
    for (const sym of serverExcluded) tslExcluded.add(sym);
    saveTslExcluded();
  }).catch(() => {});
  refresh();
  setInterval(refresh, 30000);
  // Daily PnL — weight=30, server TTL 5min → load riêng 4s sau page load, rồi mỗi 5 phút
  setTimeout(() => {
    loadDailyPnl();
    setInterval(loadDailyPnl, 5 * 60_000);
  }, 4000);
  fetch('/api/account-uid', { headers: { 'x-orders-token': getToken() } })
    .then((r) => r.json())
    .then((d) => {
      if (d.uid) {
        const btn = document.getElementById('logoutBtn');
        btn.textContent = `UID ${d.uid} · Logout`;
      }
    })
    .catch(() => {});
}

function showAuthOverlay() {
  authOverlay.style.display = '';
  mainContent.style.display = 'none';
  const raw = localStorage.getItem(CREDS_KEY);
  if (raw) {
    try {
      const { apiKey } = JSON.parse(raw);
      authApiKeyInput.value = apiKey; // pre-fill so user only needs to re-enter secret if changed
    } catch { /* ignore */ }
  }
  authApiKeyInput.focus();
}

authSubmitBtn.addEventListener('click', tryLogin);
authApiSecretInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
authApiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authApiSecretInput.focus(); });

document.getElementById('logoutBtn').addEventListener('click', async () => {
  const token = getToken();
  if (token) {
    await fetch('/api/logout', { method: 'POST', headers: { 'x-orders-token': token } }).catch(() => {});
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CREDS_KEY);
  showAuthOverlay();
});

// On page load: try existing token → if 401, try auto re-auth with stored creds
(async () => {
  const token = getToken();
  if (token) {
    const r = await fetch('/api/balance', { headers: { 'x-orders-token': token } }).catch(() => null);
    if (r && r.status !== 401) { showApp(); return; }
  }
  // Token missing or expired — try stored credentials
  const ok = await tryAutoReauth();
  if (ok) { showApp(); } else { showAuthOverlay(); }
})();

// ── Table sort ───────────────────────────────────────────────
const _sortState = new Map(); // tbodyId → { colIdx, asc }

function initSort(theadEl, tbodyEl) {
  [...theadEl.querySelectorAll('th')].forEach((th, i) => {
    if (!th.hasAttribute('data-sort')) return;
    th.insertAdjacentHTML('beforeend', '<span class="sort-icon"></span>');
    th.addEventListener('click', () => {
      const prev = _sortState.get(tbodyEl.id) ?? { colIdx: -1, asc: true };
      _sortState.set(tbodyEl.id, { colIdx: i, asc: prev.colIdx === i ? !prev.asc : true });
      applySort(theadEl, tbodyEl);
    });
  });
}

function applySort(theadEl, tbodyEl) {
  const state = _sortState.get(tbodyEl.id);
  if (!state || state.colIdx < 0) return;
  const ths = [...theadEl.querySelectorAll('th')];
  ths.forEach((th, i) => {
    const icon = th.querySelector('.sort-icon');
    if (icon) icon.textContent = i === state.colIdx ? (state.asc ? '▲' : '▼') : '';
  });

  // Group rows: each group = [primaryRow, ...followerRows (e.g. dca-row)]
  // Follower rows (class "dca-row") are kept attached to the preceding primary row.
  const allRows = [...tbodyEl.querySelectorAll('tr')];
  if (!allRows[0] || allRows[0].cells.length < 2) return;

  const groups = [];
  for (const row of allRows) {
    if (row.classList.contains('dca-row')) {
      // Attach to previous group so it stays paired with its position row
      if (groups.length) groups[groups.length - 1].push(row);
    } else {
      groups.push([row]);
    }
  }

  groups.sort((ga, gb) => {
    const a = ga[0], b = gb[0];
    const av = a.cells[state.colIdx]?.dataset.v ?? a.cells[state.colIdx]?.textContent?.trim() ?? '';
    const bv = b.cells[state.colIdx]?.dataset.v ?? b.cells[state.colIdx]?.textContent?.trim() ?? '';
    const an = parseFloat(av), bn = parseFloat(bv);
    if (!isNaN(an) && !isNaN(bn)) return state.asc ? an - bn : bn - an;
    return state.asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  for (const group of groups) {
    for (const row of group) tbodyEl.appendChild(row);
  }
}

// ── Helpers ─────────────────────────────────────────────────
function fmt(v, d = 4) {
  if (v == null || isNaN(v)) return '-';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: d });
}

function fmtDate(ts) {
  return new Date(Number(ts)).toLocaleString('vi-VN', { hour12: false });
}

function positionInitialMarginOf(position, amount, entry, leverage) {
  const reported = Number(position.positionInitialMargin ?? position.initialMargin);
  if (reported > 0) return reported;
  const calculated = Math.abs(Number(amount) || 0)
    * (Number(entry) || 0) / Math.max(1, Number(leverage) || 1);
  return calculated > 0 ? calculated : null;
}

function symLink(symbol) {
  return `<a href="/?symbol=${symbol}" target="_blank" class="sym-link">${symbol}</a>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function orderSource(o) {
  const id = String(o.clientOrderId ?? o.origClientOrderId ?? '');
  if (id.startsWith('lp_manual_')) return '<span class="src-badge src-manual">Manual</span>';
  if (id.startsWith('lp_auto_'))   return '<span class="src-badge src-auto">Auto</span>';
  if (id.startsWith('lp_ptp_') || id.startsWith('tp_scan_') || id.startsWith('tp_retry_')) return '<span class="src-badge src-tp">TP</span>';
  if (id.startsWith('lp_psl_') || id.startsWith('sl_retry_')) return '<span class="src-badge src-sl">SL</span>';
  return '<span class="src-badge">—</span>';
}

function pnlClass(v) {
  const n = Number(v);
  return n > 0 ? 'pnl-positive' : n < 0 ? 'pnl-negative' : '';
}

const status = document.getElementById('status');
const lastRefresh = document.getElementById('lastRefresh');
const settingsSaved = document.getElementById('settingsSaved');
const settingOrderEnabled = document.getElementById('settingOrderEnabled');
const settingAutoTradeEnabled = document.getElementById('settingAutoTradeEnabled');
const settingDryRun = document.getElementById('settingDryRun');
const settingBtcReversalGuard = document.getElementById('settingBtcReversalGuard');
const settingBtcReversalRoe = document.getElementById('settingBtcReversalRoe');
const tslStatus = document.getElementById('tslStatus');
const tslBody = document.getElementById('tslBody');
const slTpBody = document.getElementById('slTpBody');
const balanceRow = document.getElementById('balanceRow');
const dailyPnlRow = document.getElementById('dailyPnlRow');
const dailyPnlNote = document.getElementById('dailyPnlNote');
const positionsBody = document.getElementById('positionsBody');
const openOrdersBody = document.getElementById('openOrdersBody');
const tradesBody = document.getElementById('tradesBody');
const tradeSymbolInput = document.getElementById('tradeSymbolInput');
const loadTradesBtn = document.getElementById('loadTradesBtn');
const actionResult = document.getElementById('actionResult');
const liveCardWhitelistStatus = document.getElementById('liveCardWhitelistStatus');
const liveCardWhitelistBody = document.getElementById('liveCardWhitelistBody');
const refreshLiveCardWhitelistBtn = document.getElementById('refreshLiveCardWhitelistBtn');
const liveCardLifecycleOverview = document.getElementById('liveCardLifecycleOverview');
const liveCardLifecycleStatus = document.getElementById('liveCardLifecycleStatus');
const liveCardLifecycleBody = document.getElementById('liveCardLifecycleBody');
const liveCardPaperComparisonStatus = document.getElementById('liveCardPaperComparisonStatus');
const liveCardPaperComparisonCards = document.getElementById('liveCardPaperComparisonCards');
const liveCardHistoryStatus = document.getElementById('liveCardHistoryStatus');
const liveCardHistoryBody = document.getElementById('liveCardHistoryBody');
let liveCardRealKeys = new Set();
let liveCardCandidateKeys = new Set();

function showAction(text) {
  actionResult.style.display = 'block';
  actionResult.textContent = text;
}

async function apiFetch(url, opts = {}) {
  const parseResponse = async (response) => {
    const raw = await response.text();
    if (!raw) return { data: {}, parseError: null };
    try {
      return { data: JSON.parse(raw), parseError: null };
    } catch {
      return {
        data: {},
        parseError: `Server trả về ${response.headers.get('content-type') ?? 'nội dung không phải JSON'} (HTTP ${response.status}).`,
      };
    }
  };
  const headers = { 'x-orders-token': getToken(), ...(opts.headers ?? {}) };
  const res = await fetch(url, { ...opts, headers });
  const parsed = await parseResponse(res);
  const data = parsed.data;
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    // Try silent re-auth with stored credentials before showing overlay
    const ok = await tryAutoReauth();
    if (ok) {
      // Retry the original request with new token
      const headers2 = { 'x-orders-token': getToken(), ...(opts.headers ?? {}) };
      const res2 = await fetch(url, { ...opts, headers: headers2 });
      const parsed2 = await parseResponse(res2);
      if (parsed2.parseError) throw new Error(parsed2.parseError);
      const data2 = parsed2.data;
      if (!res2.ok) throw new Error(data2.error ?? `HTTP ${res2.status}`);
      return data2;
    }
    showAuthOverlay();
    throw new Error('Session expired. Vui lòng đăng nhập lại.');
  }
  if (parsed.parseError) throw new Error(parsed.parseError);
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function liveCardKeyParts(key) {
  const parts = String(key ?? '').split(':');
  const page = parts.shift() || 'liquid';
  const group = parts.shift() || '-';
  const encodedValue = parts.join(':');
  let value = encodedValue || '-';
  try { value = decodeURIComponent(encodedValue || '-'); } catch { /* keep raw key */ }
  const sourceLabels = {
    liquid: 'LIQUID SCAN',
    ema: 'EMA',
    edge: 'SHORT EDGE',
    recommended: 'RECOMMENDED',
  };
  return { page, source: sourceLabels[page] ?? page.toUpperCase(), group, value };
}

function liveCardBangkokTime(value) {
  const ms = Date.parse(value ?? '');
  if (!Number.isFinite(ms)) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

function liveCardPnlText(value, known = true) {
  if (!known || !Number.isFinite(Number(value))) return '-';
  const pnl = Number(value);
  return `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(4)}`;
}

function liveCardPfText(value, grossProfit = 0) {
  if (value == null) return Number(grossProfit) > 0 ? '∞' : '-';
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '-';
}

function liveCardPercentText(value) {
  return value == null || !Number.isFinite(Number(value)) ? '-' : `${Number(value).toFixed(1)}%`;
}

function syncLiveCardRealToggleInputs() {
  document.querySelectorAll('[data-live-card-real-toggle]').forEach((input) => {
    input.checked = liveCardRealKeys.has(String(input.dataset.key ?? ''));
  });
}

function liveCardDirectionStatsHtml(row, side, mode) {
  if (!row || Number(row.filled ?? row.paperCohort ?? 0) <= 0) return '';
  if (mode === 'paper') {
    return `<section class="live-card-direction-stat">
      <h5>${escapeHtml(side)} PAPER</h5>
      <p>Mapped/Cohort: <strong>${Number(row.paperMapped ?? 0)} / ${Number(row.paperCohort ?? 0)}</strong></p>
      <p>Closed/Open: <strong>${Number(row.paperClosed ?? 0)} / ${Number(row.paperOpen ?? 0)}</strong></p>
      <p>W/L · WR: <strong>${Number(row.paperWins ?? 0)}/${Number(row.paperLosses ?? 0)} · ${liveCardPercentText(row.paperWinRate)}</strong></p>
      <p>PnL: <strong class="${Number(row.paperPnl ?? 0) >= 0 ? 'positive' : 'negative'}">${liveCardPnlText(row.paperPnl, Number(row.paperClosed ?? 0) > 0)}</strong></p>
    </section>`;
  }
  return `<section class="live-card-direction-stat">
    <h5>${escapeHtml(side)} BINANCE</h5>
    <p>Filled/Closed: <strong>${Number(row.filled ?? 0)} / ${Number(row.closed ?? 0)}</strong></p>
    <p>W/L · WR: <strong>${Number(row.wins ?? 0)}/${Number(row.losses ?? 0)} · ${liveCardPercentText(row.winRate)}</strong></p>
    <p>PF · AvgROE: <strong>${liveCardPfText(row.profitFactor, row.grossProfit)} · ${liveCardPercentText(row.avgClosedRoe)}</strong></p>
    <p>NET: <strong class="${Number(row.closedPnlNet ?? 0) >= 0 ? 'positive' : 'negative'}">${liveCardPnlText(row.closedPnlNet, Number(row.closedPnlKnown ?? 0) > 0)}</strong></p>
  </section>`;
}

function renderLiveCardPaperComparison(rows = [], overview = {}) {
  if (!liveCardPaperComparisonCards) return;
  if (liveCardPaperComparisonStatus) {
    liveCardPaperComparisonStatus.textContent = `${rows.length} nhãn · unique mapped ${Number(overview.paperMapped ?? 0)}/${Number(overview.filled ?? 0)} · missing ${Number(overview.paperMissing ?? 0)}`;
  }
  if (!rows.length) {
    liveCardPaperComparisonCards.innerHTML = '<p class="live-card-note">Chưa có nhãn để so sánh.</p>';
    return;
  }
  liveCardPaperComparisonCards.innerHTML = rows.map((row) => {
    const parts = liveCardKeyParts(row.key);
    const realWr = liveCardPercentText(row.winRate);
    const paperWr = liveCardPercentText(row.paperWinRate);
    const realRoe = liveCardPercentText(row.avgClosedRoe);
    const paperRoe = liveCardPercentText(row.paperAvgRoe);
    const wrDelta = row.winRate == null || row.paperWinRate == null ? null : Number(row.winRate) - Number(row.paperWinRate);
    const roeDelta = row.avgClosedRoe == null || row.paperAvgRoe == null ? null : Number(row.avgClosedRoe) - Number(row.paperAvgRoe);
    const directionRows = ['SHORT', 'LONG']
      .map((side) => [side, row.sideStats?.[side] ?? null])
      .filter(([, stats]) => stats && Number(stats.filled ?? 0) > 0);
    const realDirectionHtml = directionRows
      .map(([side, stats]) => liveCardDirectionStatsHtml(stats, side, 'binance'))
      .join('');
    const paperDirectionHtml = directionRows
      .map(([side, stats]) => liveCardDirectionStatsHtml(stats, side, 'paper'))
      .join('');
    const canToggle = liveCardCandidateKeys.has(row.key);
    const toggle = canToggle ? `<label class="live-real-toggle" title="Quyền lệnh thật cho đúng nhãn này">
      <input type="checkbox" data-live-card-real-toggle data-key="${escapeHtml(row.key)}" ${liveCardRealKeys.has(row.key) ? 'checked' : ''}>
      <span>LỆNH THẬT</span></label>` : '<span class="refresh-note">HISTORICAL</span>';
    return `<article class="live-card-compare-card">
      <div class="live-card-compare-head">
        <div class="live-card-compare-title"><span class="live-card-source">${escapeHtml(parts.source)}</span><strong>${escapeHtml(`${parts.group} · ${parts.value}`)}</strong><code>${escapeHtml(row.key)}</code></div>
        ${toggle}
      </div>
      <div class="live-card-compare-cols">
        <div class="live-card-compare-side">
          <h4>BINANCE THẬT · NET</h4>
          <p>Filled/Closed: <strong>${Number(row.filled ?? 0)} / ${Number(row.closed ?? 0)}</strong></p>
          <p>W/L · WR: <strong>${Number(row.wins ?? 0)}/${Number(row.losses ?? 0)} · ${realWr}</strong></p>
          <p>PF · AvgROE: <strong>${liveCardPfText(row.profitFactor, row.grossProfit)} · ${realRoe}</strong></p>
          <p>NET: <strong class="${Number(row.closedPnlNet ?? 0) >= 0 ? 'positive' : 'negative'}">${liveCardPnlText(row.closedPnlNet, Number(row.closedPnlKnown ?? 0) > 0)}</strong></p>
          ${realDirectionHtml ? `<div class="live-card-direction-grid">${realDirectionHtml}</div>` : ''}
        </div>
        <div class="live-card-compare-side">
          <h4>PAPER GỐC · SAME COHORT</h4>
          <p>Mapped/Cohort: <strong>${Number(row.paperMapped ?? 0)} / ${Number(row.paperCohort ?? 0)}</strong>${Number(row.paperMissing ?? 0) ? ` · thiếu ${Number(row.paperMissing)}` : ''}</p>
          <p>Closed/Open: <strong>${Number(row.paperClosed ?? 0)} / ${Number(row.paperOpen ?? 0)}</strong></p>
          <p>W/L · WR: <strong>${Number(row.paperWins ?? 0)}/${Number(row.paperLosses ?? 0)} · ${paperWr}</strong></p>
          <p>PF · AvgROE: <strong>${liveCardPfText(row.paperProfitFactor, row.paperGrossProfit)} · ${paperRoe}</strong></p>
          <p>PnL paper: <strong class="${Number(row.paperPnl ?? 0) >= 0 ? 'positive' : 'negative'}">${liveCardPnlText(row.paperPnl, Number(row.paperClosed ?? 0) > 0)}</strong></p>
          ${paperDirectionHtml ? `<div class="live-card-direction-grid">${paperDirectionHtml}</div>` : ''}
        </div>
      </div>
      <div class="live-card-compare-delta">Δ Binance − Paper: WR <strong>${wrDelta == null ? '-' : `${wrDelta >= 0 ? '+' : ''}${wrDelta.toFixed(1)} điểm`}</strong> · AvgROE <strong>${roeDelta == null ? '-' : `${roeDelta >= 0 ? '+' : ''}${roeDelta.toFixed(1)} điểm`}</strong></div>
    </article>`;
  }).join('');
}

function renderLiveCardOverview(overview = {}) {
  if (!liveCardLifecycleOverview) return;
  const pnl = Number(overview.closedPnlNet ?? 0);
  const wr = overview.winRate == null ? null : Number(overview.winRate);
  const pf = overview.profitFactor == null
    ? (Number(overview.grossProfit ?? 0) > 0 ? '∞' : '-')
    : Number(overview.profitFactor).toFixed(2);
  const items = [
    ['BOT FILLED', Number(overview.filled ?? 0), ''],
    ['ACTIVE / CLOSED', `${Number(overview.active ?? 0)} / ${Number(overview.closed ?? 0)}`, ''],
    ['W / L', `${Number(overview.wins ?? 0)} / ${Number(overview.losses ?? 0)}`, ''],
    ['WR', Number.isFinite(wr) ? `${wr.toFixed(1)}%` : '-', ''],
    ['PF', pf, ''],
    ['NET BINANCE', liveCardPnlText(pnl), pnl >= 0 ? 'positive' : 'negative'],
    ['PNL KNOWN / MISSING', `${Number(overview.closedPnlKnown ?? 0)} / ${Number(overview.closedPnlMissing ?? 0)}`, ''],
  ];
  liveCardLifecycleOverview.innerHTML = items.map(([label, value, cls]) => `<div class="live-card-overview-item">
    <span>${escapeHtml(label)}</span><strong class="${cls}">${escapeHtml(String(value))}</strong>
  </div>`).join('');
}

function renderLiveCardHistory(data) {
  if (!liveCardHistoryBody) return;
  const rows = (Array.isArray(data?.executions) ? data.executions : [])
    .filter((row) => row?.entryFilledAt)
    .sort((a, b) => Date.parse(b.entryFilledAt) - Date.parse(a.entryFilledAt));
  const totalFilled = Number(data?.overview?.filled ?? rows.length);
  const active = rows.filter(isLiveCardExecutionOpen).length;
  const closed = rows.filter((row) => String(row?.status ?? '').toUpperCase() === 'POSITION_CLOSED').length;
  if (liveCardHistoryStatus) {
    liveCardHistoryStatus.dataset.version = LIVE_CARD_HISTORY_STREAM_VERSION;
    liveCardHistoryStatus.innerHTML = `<span class="live-dot"></span>Socket · ${totalFilled} đã fill · mở ${active} · đóng ${closed}`;
  }
  if (!rows.length) {
    liveCardHistoryBody.innerHTML = '<tr><td colspan="12" class="empty-cell">Chưa có lệnh Binance do bot fill.</td></tr>';
    return;
  }
  liveCardHistoryBody.innerHTML = rows.map((row) => {
    const keys = Array.isArray(row.matchedKeys) ? row.matchedKeys : [];
    const labels = keys.length
      ? keys.map((key) => {
        const parts = liveCardKeyParts(key);
        return `<code title="${escapeHtml(key)}">${escapeHtml(`${parts.group}: ${parts.value}`)}</code>`;
      }).join('')
      : '<span class="muted">unmatched</span>';
    const pnlKnown = row.closedPnlKnown === true && Number.isFinite(Number(row.closedPnlNet));
    const pnl = Number(row.closedPnlNet ?? 0);
    const pnlClass = pnlKnown ? (pnl >= 0 ? 'positive' : 'negative') : '';
    const side = String(row.side ?? '-').toUpperCase();
    const open = isLiveCardExecutionOpen(row);
    const fillPrice = Number(row.fillPrice ?? 0);
    const filledQty = Math.abs(Number(row.filledQty ?? row.submittedQty ?? 0));
    const marginUsdt = Number(row.marginUsdt ?? 0);
    const leverage = Number(row.leverage ?? 1);
    const pnlTitle = pnlKnown
      ? `Realized ${fmt(row.closedPnlRealized, 6)} · fee ${fmt(row.closedPnlCommission, 6)} · funding ${fmt(row.closedPnlFunding, 6)}`
      : 'Chưa có Binance income đối soát';
    const paper = row.paperOriginal ?? {};
    const paperText = paper.mappingStatus === 'MAPPED'
      ? `${escapeHtml(paper.status ?? '-')}${paper.outcome ? ` · ${escapeHtml(paper.outcome)}` : ''}<br><span class="${Number(paper.pnl ?? 0) >= 0 ? 'positive' : 'negative'}">${escapeHtml(liveCardPnlText(paper.pnl, paper.pnl != null))}</span> · ROE ${escapeHtml(liveCardPercentText(paper.roe))}`
      : `<span class="muted">${escapeHtml(paper.mappingStatus ?? 'NOT_FOUND')}</span>`;
    const livePnlHtml = open
      ? '<strong class="muted">Chờ socket…</strong><small>uPnL / ROE</small>'
      : `<strong>${escapeHtml(liveCardPnlText(pnl, pnlKnown))}</strong><small>NET đã đối soát</small>`;
    return `<tr data-live-card-history-row data-lifecycle-id="${escapeHtml(row.lifecycleId ?? '')}" data-symbol="${escapeHtml(row.symbol ?? '')}" data-side="${escapeHtml(side)}" data-open="${open ? '1' : '0'}" data-fill-price="${fillPrice}" data-filled-qty="${filledQty}" data-margin-usdt="${marginUsdt}" data-leverage="${leverage}">
      <td>${escapeHtml(liveCardBangkokTime(row.entryFilledAt))}</td>
      <td><span class="live-card-source">${escapeHtml(row.sourceType ?? '-')}</span></td>
      <td><strong>${escapeHtml(row.symbol ?? '-')}</strong></td>
      <td class="${side === 'LONG' ? 'positive' : side === 'SHORT' ? 'negative' : ''}"><strong>${escapeHtml(side)}</strong></td>
      <td class="live-card-label-list">${labels}</td>
      <td><strong>${escapeHtml(row.status ?? '-')}</strong></td>
      <td><strong>${fmt(row.fillPrice, 8)}</strong>${open ? '<small class="live-card-history-mark">Mark: chờ socket…</small>' : ''}</td>
      <td>$${fmt(row.marginUsdt, 2)} / ${fmt(row.leverage, 0)}x</td>
      <td>${fmt(row.takeProfitPrice, 8)} / ${fmt(row.stopLossPrice, 8)}</td>
      <td class="live-card-history-pnl ${pnlClass}" title="${escapeHtml(open ? 'uPnL ước tính từ fill lifecycle × mark socket; chưa trừ phí/funding' : pnlTitle)}">${livePnlHtml}</td>
      <td>${paperText}</td>
      <td><code>${escapeHtml(String(row.entryOrderId ?? '-'))}</code></td>
    </tr>`;
  }).join('');
  for (const tick of liveCardLatestPositionTicks.values()) applyLiveCardHistoryTick(tick);
}

function renderLiveCardWhitelist(data) {
  const whitelistKeys = Array.isArray(data.whitelistKeys) ? data.whitelistKeys : [];
  const realKeys = new Set(Array.isArray(data.realEnabledKeys) ? data.realEnabledKeys : []);
  liveCardCandidateKeys = new Set(whitelistKeys);
  liveCardRealKeys = realKeys;
  const liveMaster = data.orderEnabled && !data.dryRun;
  const exclusive = data.liveCardWhitelistOnly === true ? ' · AUTO chỉ card checked' : '';
  liveCardWhitelistStatus.textContent = `${whitelistKeys.length} ứng viên · ${realKeys.size} lệnh thật · ${liveMaster ? 'master sẵn sàng' : 'master đang khóa'}${exclusive}`;
  if (!whitelistKeys.length) {
    liveCardWhitelistBody.innerHTML = '<tr><td colspan="4" class="empty-cell">Chưa có card nào trong whitelist ứng viên.</td></tr>';
    syncLiveCardRealToggleInputs();
    return;
  }
  const rows = whitelistKeys
    .map((key) => ({ key, ...liveCardKeyParts(key) }))
    .sort((a, b) => a.source.localeCompare(b.source) || a.group.localeCompare(b.group) || a.value.localeCompare(b.value));
  liveCardWhitelistBody.innerHTML = rows.map((row) => {
    const checked = realKeys.has(row.key);
    return `<tr>
      <td><span class="live-card-source">${escapeHtml(row.source)}</span></td>
      <td><strong>${escapeHtml(row.group)}</strong></td>
      <td><strong>${escapeHtml(row.value)}</strong><code class="live-card-key">${escapeHtml(row.key)}</code></td>
      <td><label class="live-real-toggle" title="Đây là quyền lệnh thật, khác với whitelist ứng viên">
        <input type="checkbox" data-live-card-real-toggle data-key="${escapeHtml(row.key)}" ${checked ? 'checked' : ''}>
        <span>LỆNH THẬT</span>
      </label></td>
    </tr>`;
  }).join('');
  syncLiveCardRealToggleInputs();
}

function renderLiveCardLifecycle(data) {
  if (!liveCardLifecycleBody) return;
  const rows = Array.isArray(data?.stats) ? data.stats : [];
  const total = Number(data?.total ?? data?.executions?.length ?? 0);
  const syncError = String(data?.closedPnlSync?.error ?? '');
  liveCardLifecycleStatus.textContent = `${total} lifecycle · ${rows.length} key whitelist${syncError ? ` · PnL chờ đối soát: ${syncError}` : ''}`;
  renderLiveCardOverview(data?.overview ?? {});
  renderLiveCardPaperComparison(rows, data?.overview ?? {});
  renderLiveCardHistory(data);
  if (!rows.length) {
    liveCardLifecycleBody.innerHTML = '<tr><td colspan="14" class="empty-cell">Chưa có lệnh Binance từ card whitelist.</td></tr>';
    return;
  }
  liveCardLifecycleBody.innerHTML = rows.map((row) => {
    const parts = liveCardKeyParts(row.key);
    const pnl = Number(row.closedPnlNet ?? 0);
    const known = Number(row.closedPnlKnown ?? 0);
    const missing = Number(row.closedPnlMissing ?? 0);
    const pnlText = known > 0
      ? `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(4)}${missing ? ` · thiếu ${missing}` : ''}`
      : (Number(row.closed ?? 0) > 0 ? `-- · thiếu ${missing || Number(row.closed ?? 0)}` : '$0.0000');
    const pnlClass = known > 0 ? (pnl >= 0 ? 'positive' : 'negative') : '';
    const pnlTitle = known > 0
      ? `Realized ${Number(row.closedPnlRealized ?? 0).toFixed(6)} · commission ${Number(row.closedPnlCommission ?? 0).toFixed(6)} · funding ${Number(row.closedPnlFunding ?? 0).toFixed(6)}`
      : 'Chưa đối soát được Binance income cho lifecycle đã đóng.';
    const wr = row.winRate == null ? null : Number(row.winRate);
    const pf = row.profitFactor == null
      ? (Number(row.grossProfit ?? 0) > 0 ? '∞' : '-')
      : Number(row.profitFactor).toFixed(2);
    return `<tr>
    <td><span class="live-card-source">${escapeHtml(parts.source)}</span></td>
    <td><strong>${escapeHtml(parts.group)}</strong></td>
    <td><strong>${escapeHtml(parts.value)}</strong><code class="live-card-key">${escapeHtml(row.key)}</code></td>
    <td><strong>${Number(row.total ?? 0)}</strong></td>
    <td>${Number(row.submitted ?? 0)}</td>
    <td>${Number(row.filled ?? 0)}</td>
    <td>${Number(row.closed ?? 0)}</td>
    <td>${Number(row.wins ?? 0)}W/${Number(row.losses ?? 0)}L</td>
    <td>${Number.isFinite(wr) ? `${wr.toFixed(1)}%` : '-'}</td>
    <td>${escapeHtml(pf)}</td>
    <td class="${pnlClass}" title="${escapeHtml(pnlTitle)}"><strong>${escapeHtml(pnlText)}</strong></td>
    <td>${Number(row.protected ?? 0)}</td>
    <td>${Number(row.botClosed ?? 0)}</td>
    <td class="${Number(row.failed ?? 0) ? 'negative' : ''}">${Number(row.failed ?? 0)}</td>
  </tr>`;
  }).join('');
}

async function loadLiveCardLifecycle() {
  if (!liveCardLifecycleBody) return;
  try {
    renderLiveCardLifecycle(await apiFetch('/api/live-card-binance-lifecycle?limit=500'));
  } catch (error) {
    liveCardLifecycleStatus.textContent = 'Lỗi';
    liveCardLifecycleBody.innerHTML = `<tr><td colspan="14" class="empty-cell">${escapeHtml(error.message)}</td></tr>`;
    if (liveCardPaperComparisonCards) liveCardPaperComparisonCards.innerHTML = `<p class="live-card-note">${escapeHtml(error.message)}</p>`;
    if (liveCardHistoryBody) liveCardHistoryBody.innerHTML = `<tr><td colspan="12" class="empty-cell">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadLiveCardWhitelist() {
  if (!liveCardWhitelistBody) return;
  liveCardWhitelistStatus.textContent = 'Loading...';
  try {
    renderLiveCardWhitelist(await apiFetch('/api/live-card-real-enabled'));
    await loadLiveCardLifecycle();
  } catch (error) {
    liveCardWhitelistStatus.textContent = 'Lỗi';
    liveCardWhitelistBody.innerHTML = `<tr><td colspan="4" class="empty-cell">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function updateLiveCardRealToggle(input) {
  const key = String(input.dataset.key ?? '');
  const enabled = input.checked;
  if (!key) return;
  if (enabled) {
    const confirmed = confirm(`Bật LỆNH THẬT cho card này?\n\n${key}\n\nTín hiệu auto MỚI khớp card có thể đi tiếp tới Binance MARKET nếu Order Enabled đang bật, Dry Run đang tắt và mọi khóa an toàn khác đều đạt. Không hồi tố lệnh cũ.`);
    if (!confirmed) {
      input.checked = false;
      return;
    }
  }
  input.disabled = true;
  try {
    const data = await apiFetch('/api/live-card-real-enabled', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, enabled }),
    });
    renderLiveCardWhitelist(data);
    syncLiveCardRealToggleInputs();
  } catch (error) {
    input.checked = !enabled;
    alert(`Không lưu được quyền lệnh thật: ${error.message}`);
  } finally {
    input.disabled = false;
  }
}

liveCardWhitelistBody?.addEventListener('change', (event) => {
  const input = event.target.closest?.('[data-live-card-real-toggle]');
  if (input) updateLiveCardRealToggle(input);
});
liveCardPaperComparisonCards?.addEventListener('change', (event) => {
  const input = event.target.closest?.('[data-live-card-real-toggle]');
  if (input) updateLiveCardRealToggle(input);
});
refreshLiveCardWhitelistBtn?.addEventListener('click', loadLiveCardWhitelist);

// ── Sections ────────────────────────────────────────────────
async function loadDailyPnl() {
  try {
    const d = await apiFetch('/api/daily-pnl');
    const sign = (v) => (v >= 0 ? '+' : '') + fmt(v, 4);
    const cls = (v) => pnlClass(v);
    dailyPnlRow.innerHTML = `
      <div class="daily-stat">
        <span>Net P&L</span>
        <strong class="${cls(d.net)}">${sign(d.net)}</strong>
      </div>
      <div class="daily-stat">
        <span>Realized</span>
        <strong class="${cls(d.realized)}">${sign(d.realized)}</strong>
      </div>
      <div class="daily-stat">
        <span>Commission</span>
        <strong class="${cls(d.commission)}">${sign(d.commission)}</strong>
      </div>
      <div class="daily-stat">
        <span>Funding</span>
        <strong class="${cls(d.funding)}">${sign(d.funding)}</strong>
      </div>`;
    dailyPnlNote.textContent = `Since ${new Date(d.since).toLocaleString('vi-VN', { hour12: false })} UTC`;
  } catch (err) {
    dailyPnlRow.innerHTML = `<p class="explain" style="color:var(--red)">${err.message}</p>`;
  }
}

async function loadBalance() {
  try {
    const rows = await apiFetch('/api/balance');
    if (!rows.length) {
      balanceRow.innerHTML = '<p class="explain">No balance data.</p>';
      return;
    }
    balanceRow.innerHTML = rows.map((b) => {
      const pnl = Number(b.crossUnPnl ?? 0);
      return `
        <div class="balance-item">
          <span>${b.asset}</span>
          <strong>${fmt(b.balance, 4)}</strong>
          <small>Available: ${fmt(b.availableBalance, 4)}</small>
          <small class="${pnlClass(pnl)}">UPnL: ${pnl >= 0 ? '+' : ''}${fmt(pnl, 4)}</small>
        </div>`;
    }).join('');
  } catch (err) {
    balanceRow.innerHTML = `<p class="explain" style="color:var(--red)">${err.message}</p>`;
  }
}

// ── Binance position PnL stream ───────────────────────────────
// Server-side PositionMonitor merges Binance user-data (size/entry changes)
// with markPrice@1s. Browser receives the exact full-precision values via an
// authenticated event stream; REST remains the structural/fallback snapshot.
const posStatic = new Map(); // symbol → { amt, entry, margin, lev }
let markWs = null; // AbortController for the authenticated position stream
let markWsReconnectTimer = null;
let markWsWantedSymbols = new Set();
let positionSnapshotRefreshTimer = null;
let liveCardLifecycleRefreshTimer = null;
const liveCardLatestPositionTicks = new Map();

// Avg-down state: symbol → entryPrice when triggered (cleared when position closes)
const avgDownTriggered = new Map();
let avgDownEnabled = false;
let avgDownTriggerRoe = -60;
let avgDownMarginUsdt = 2;

function schedulePositionSnapshotRefresh() {
  if (positionSnapshotRefreshTimer) return;
  positionSnapshotRefreshTimer = setTimeout(() => {
    positionSnapshotRefreshTimer = null;
    loadPositions(true).catch(() => {});
  }, 250);
}

function scheduleLiveCardLifecycleRefresh(delayMs = 650) {
  if (liveCardLifecycleRefreshTimer) clearTimeout(liveCardLifecycleRefreshTimer);
  liveCardLifecycleRefreshTimer = setTimeout(() => {
    liveCardLifecycleRefreshTimer = null;
    loadLiveCardLifecycle().catch(() => {});
  }, Math.max(100, Number(delayMs) || 650));
}

function applyLiveCardHistoryTick(payload) {
  const symbol = String(payload?.symbol ?? '').toUpperCase();
  const markPrice = Number(payload?.markPrice);
  if (!symbol || !(markPrice > 0) || !liveCardHistoryBody) return;
  for (const row of liveCardHistoryBody.querySelectorAll('tr[data-live-card-history-row][data-open="1"]')) {
    if (String(row.dataset.symbol ?? '').toUpperCase() !== symbol) continue;
    const side = String(row.dataset.side ?? '').toUpperCase();
    const positionAmt = Number(payload.positionAmt);
    if ((side === 'LONG' && positionAmt < 0) || (side === 'SHORT' && positionAmt > 0)) continue;
    const live = calculateLiveCardOpenPnl({
      side,
      entryPrice: row.dataset.fillPrice,
      markPrice,
      quantity: row.dataset.filledQty,
      marginUsdt: row.dataset.marginUsdt,
      leverage: row.dataset.leverage,
    });
    if (!live) continue;
    const mark = row.querySelector('.live-card-history-mark');
    if (mark) mark.textContent = `Mark: ${fmt(markPrice, 8)}`;
    const pnlCell = row.querySelector('.live-card-history-pnl');
    if (!pnlCell) continue;
    pnlCell.classList.remove('positive', 'negative', 'pnl-positive', 'pnl-negative');
    pnlCell.classList.add(live.pnl >= 0 ? 'positive' : 'negative');
    pnlCell.innerHTML = `<strong>${escapeHtml(liveCardPnlText(live.pnl, true))}</strong><small>ROE ${escapeHtml(liveCardPercentText(live.roe))} · socket</small>`;
    pnlCell.dataset.v = String(live.pnl);
  }
}

function applyPositionPnlTick(d) {
  const sym = String(d?.symbol ?? '').toUpperCase();
  if (sym) {
    liveCardLatestPositionTicks.set(sym, d);
    applyLiveCardHistoryTick(d);
  }
  if (!sym || !markWsWantedSymbols.has(sym)) return;
  const st = posStatic.get(sym);
  if (!st) {
    schedulePositionSnapshotRefresh();
    return;
  }
  const mark = Number(d.markPrice);
  const upnl = Number(d.unRealizedProfit);
  const roe = Number(d.roe);
  const marketReady = d.marketReady !== false && Number.isFinite(mark) && mark > 0;
  const managementRoe = Number.isFinite(Number(d.managementRoe))
    ? Number(d.managementRoe)
    : roe;
  const amt = Number(d.positionAmt);
  const entry = Number(d.entryPrice);
  const lev = Number(d.leverage) || st.lev || 1;
  const margin = Number(d.positionInitialMargin);
  if (Number.isFinite(amt) && amt !== 0) st.amt = amt;
  if (Number.isFinite(entry) && entry > 0) st.entry = entry;
  if (Number.isFinite(margin) && margin > 0) st.margin = margin;
  st.lev = lev;

    // Avg-down: trigger when ROE ≤ threshold and not yet triggered for this entry price
    if (avgDownEnabled && managementRoe <= avgDownTriggerRoe) {
      const prevEntry = avgDownTriggered.get(sym);
      const isSamePosition = prevEntry !== undefined && Math.abs(prevEntry - st.entry) / st.entry < 0.01;
      if (!isSamePosition) {
        avgDownTriggered.set(sym, st.entry);
        const side = st.amt > 0 ? 'BUY' : 'SELL';
        const notionalUsdt = avgDownMarginUsdt * st.lev;
        console.log(`[AvgDown] ${sym} ROE=${managementRoe.toFixed(1)}% → avg down $${avgDownMarginUsdt} ${side}`);
        apiFetch('/api/order', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ symbol: sym, side, notionalUsdt, leverage: st.lev, dryRun: false }),
        }).then((r) => {
          console.log(`[AvgDown] ✅ ${sym}`, r);
        }).catch((err) => {
          console.error(`[AvgDown] ❌ ${sym}:`, err.message);
          avgDownTriggered.delete(sym); // allow retry on next tick
        });
      }
    }

  const rows = positionsBody.querySelectorAll('tr');
  for (const row of rows) {
    if (row.dataset.sym !== sym) continue;
    if (Number.isFinite(entry) && entry > 0) {
      row.cells[3].textContent = fmt(entry);
      row.cells[3].dataset.v = entry;
    }
    if (marketReady) {
      // col 4: mark price
      row.cells[4].textContent = fmt(mark, 4);
      row.cells[4].dataset.v = mark;
    }
    if (Number.isFinite(margin) && margin > 0) {
      row.cells[7].textContent = fmt(margin, 4);
      row.cells[7].dataset.v = margin;
    }
    if (marketReady && Number.isFinite(upnl)) {
      // col 8: unrealised pnl
      row.cells[8].className = pnlClass(upnl);
      row.cells[8].textContent = `${upnl >= 0 ? '+' : ''}${fmt(upnl, 4)}`;
      row.cells[8].dataset.v = upnl;
    }
    if (marketReady && Number.isFinite(roe)) {
      // col 9: roe
      row.cells[9].className = pnlClass(roe);
      row.cells[9].textContent = `${roe >= 0 ? '+' : ''}${fmt(roe, 2)}%`;
      row.cells[9].dataset.v = roe;
    }
    const closeButton = row.querySelector('.close-btn');
    if (closeButton && Number.isFinite(amt) && amt !== 0) closeButton.dataset.amt = String(amt);
    break;
  }
}

function parsePositionPnlEvent(block) {
  let event = 'message';
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (!data.length) return;
  let payload;
  try { payload = JSON.parse(data.join('\n')); } catch { return; }
  if (event === 'position') {
    applyPositionPnlTick(payload);
  } else if (event === 'snapshot') {
    for (const position of payload.positions ?? []) applyPositionPnlTick(position);
  } else if (event === 'position-closed') {
    const symbol = String(payload.symbol ?? '').toUpperCase();
    markWsWantedSymbols.delete(symbol);
    posStatic.delete(symbol);
    liveCardLatestPositionTicks.delete(symbol);
    schedulePositionSnapshotRefresh();
    scheduleLiveCardLifecycleRefresh(1000);
  } else if (event === 'live-card-lifecycle') {
    scheduleLiveCardLifecycleRefresh(500);
  }
}

async function connectPositionPnlStream() {
  if (markWs) return;
  const note = document.getElementById('positionsNote');
  const controller = new AbortController();
  markWs = controller;
  try {
    const response = await fetch('/api/positions/stream', {
      headers: { 'x-orders-token': getToken() },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status === 401 && await tryAutoReauth()) {
      throw new Error('REAUTH_RECONNECT');
    }
    if (!response.ok || !response.body) throw new Error(`Position stream HTTP ${response.status}`);
    if (note) note.innerHTML = `<span class="live-dot"></span>Binance socket · ${markWsWantedSymbols.size} symbol${markWsWantedSymbols.size > 1 ? 's' : ''}`;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const block = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0]?.length ?? 2;
        buffer = buffer.slice(boundary + separator);
        parsePositionPnlEvent(block);
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError' && error.message !== 'REAUTH_RECONNECT') {
      console.warn('[PositionPnL] stream disconnected:', error.message);
    }
  } finally {
    if (markWs === controller) markWs = null;
    if (note) note.textContent = 'Binance socket reconnecting...';
    markWsReconnectTimer = setTimeout(() => {
      markWsReconnectTimer = null;
      connectPositionPnlStream();
    }, 3000);
  }
}

function startMarkPriceWs(symbols) {
  markWsWantedSymbols = new Set(symbols.map((symbol) => String(symbol).toUpperCase()));
  if (markWsReconnectTimer) {
    clearTimeout(markWsReconnectTimer);
    markWsReconnectTimer = null;
  }
  connectPositionPnlStream();
}

function _buildPositionRows(rows) {
  positionsBody.innerHTML = rows.map((p) => {
    const amt = Number(p.positionAmt);
    const isLong = amt > 0;
    const side = isLong ? '<span class="positive">LONG</span>' : '<span class="negative">SHORT</span>';
    const upnl = Number(p.unRealizedProfit);
    const entry = Number(p.entryPrice);
    const mark = Number(p.markPrice);
    const liq = Number(p.liquidationPrice);
    const lev = Number(p.leverage);
    const margin = positionInitialMarginOf(p, amt, entry, lev);
    const roe = margin > 0 ? upnl / margin * 100 : 0;
    const sym = p.symbol;
    return `
      <tr data-sym="${sym}">
        <td><strong>${symLink(sym)}</strong></td>
        <td data-v="${isLong ? 1 : 0}">${side}</td>
        <td data-v="${Math.abs(amt)}">${fmt(Math.abs(amt), 6)}</td>
        <td data-v="${entry}">${fmt(entry)}</td>
        <td data-v="${mark}">${fmt(mark)}</td>
        <td data-v="${liq}">${fmt(liq)}</td>
        <td data-v="${lev}">${lev}x</td>
        <td data-v="${margin ?? 0}">${margin != null ? fmt(margin, 4) : '-'}</td>
        <td data-v="${upnl}" class="${pnlClass(upnl)}">${upnl >= 0 ? '+' : ''}${fmt(upnl, 4)}</td>
        <td data-v="${roe}" class="${pnlClass(roe)}">${roe >= 0 ? '+' : ''}${fmt(roe, 2)}%</td>
        <td style="display:flex;gap:6px;align-items:center">
          <button class="action-btn close-btn" data-symbol="${sym}" data-amt="${p.positionAmt}">Close</button>
          <button class="dca-toggle-btn" data-sym="${sym}">DCA</button>
        </td>
        <td style="text-align:center">
          <input type="checkbox" class="tsl-exclude-cb" data-sym="${sym}" title="Skip trailing stop & auto management"
            ${tslExcluded.has(sym) ? 'checked' : ''}
            style="width:16px;height:16px;cursor:pointer;accent-color:var(--red)">
        </td>
      </tr>
      <tr class="dca-row" id="dca-row-${sym}" style="display:none">
        <td colspan="12">
          <div class="dca-form">
            <div class="dca-field">
              <span>Margin $</span>
              <input type="number" class="dca-margin-input" min="1" step="0.5" value="5">
            </div>
            <div class="dca-field">
              <span>Leverage</span>
              <input type="number" class="dca-lev-input" min="1" max="125" step="1" value="${lev}">
            </div>
            <div class="dca-field">
              <span>Type</span>
              <select class="dca-type-select">
                <option value="MARKET">Market</option>
                <option value="LIMIT">Limit</option>
              </select>
            </div>
            <div class="dca-field">
              <span>Limit Price</span>
              <input type="number" class="dca-price-input" min="0" step="any" placeholder="Market nếu để trống" disabled>
            </div>
            <button class="dca-long-btn" data-sym="${sym}" data-side="BUY">▲ LONG</button>
            <button class="dca-short-btn" data-sym="${sym}" data-side="SELL">▼ SHORT</button>
            <span class="dca-result"></span>
          </div>
        </td>
      </tr>`;
  }).join('');

  // ── Close buttons ──
  positionsBody.querySelectorAll('.close-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sym = btn.dataset.symbol;
      const amt = btn.dataset.amt;
      if (!confirm(`Close position ${sym} (${amt})?`)) return;
      btn.disabled = true;
      try {
        const result = await apiFetch('/api/close-position', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ symbol: sym, positionAmt: amt }),
        });
        showAction(JSON.stringify(result, null, 2));
        await loadPositions(true);
      } catch (err) {
        showAction(`Error: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  // ── DCA toggle ──
  positionsBody.querySelectorAll('.dca-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sym = btn.dataset.sym;
      const dcaRow = document.getElementById(`dca-row-${sym}`);
      if (!dcaRow) return;
      const isOpen = dcaRow.style.display !== 'none';
      dcaRow.style.display = isOpen ? 'none' : '';
      btn.classList.toggle('active', !isOpen);
      if (!isOpen) {
        dcaRow.querySelector('.dca-margin-input')?.focus();
      }
    });
  });

  // ── DCA type change: enable/disable limit price ──
  positionsBody.querySelectorAll('.dca-type-select').forEach((sel) => {
    const row = sel.closest('.dca-form');
    sel.addEventListener('change', () => {
      const priceInput = row.querySelector('.dca-price-input');
      priceInput.disabled = sel.value !== 'LIMIT';
      if (priceInput.disabled) priceInput.value = '';
    });
  });

  // ── DCA submit ──
  positionsBody.querySelectorAll('.dca-long-btn, .dca-short-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sym = btn.dataset.sym;
      const side = btn.dataset.side;
      const form = btn.closest('.dca-form');
      const margin = Number(form.querySelector('.dca-margin-input').value);
      const lev = Number(form.querySelector('.dca-lev-input').value);
      const orderType = form.querySelector('.dca-type-select').value;
      const limitPrice = form.querySelector('.dca-price-input').value;
      const resultEl = form.querySelector('.dca-result');

      if (!margin || margin <= 0) {
        resultEl.textContent = 'Nhập margin hợp lệ.';
        resultEl.className = 'dca-result err';
        return;
      }
      if (orderType === 'LIMIT' && !limitPrice) {
        resultEl.textContent = 'Nhập limit price.';
        resultEl.className = 'dca-result err';
        return;
      }

      const label = side === 'BUY' ? 'LONG' : 'SHORT';
      if (!confirm(`DCA ${label} ${sym} · $${margin} × ${lev}x?`)) return;

      form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      resultEl.textContent = 'Sending...';
      resultEl.className = 'dca-result';

      try {
        const payload = {
          symbol: sym,
          side,
          notionalUsdt: margin * lev,
          leverage: lev,
          orderType,
          dryRun: false,
        };
        if (orderType === 'LIMIT' && limitPrice) payload.limitPrice = Number(limitPrice);

        const result = await apiFetch('/api/order', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const ok = result.status === 'submitted' || result.orderId;
        resultEl.textContent = ok ? `✓ ${result.status ?? 'OK'} · #${result.orderId ?? ''}` : JSON.stringify(result);
        resultEl.className = `dca-result ${ok ? 'ok' : 'err'}`;
        if (ok) await loadPositions(true);
      } catch (err) {
        resultEl.textContent = `✗ ${err.message}`;
        resultEl.className = 'dca-result err';
      } finally {
        form.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      }
    });
  });

  // ── TSL exclude checkboxes ──
  positionsBody.querySelectorAll('.tsl-exclude-cb').forEach((cb) => {
    cb.addEventListener('change', () => {
      const sym = cb.dataset.sym;
      if (cb.checked) {
        tslExcluded.add(sym);
      } else {
        tslExcluded.delete(sym);
      }
      saveTslExcluded();
      setTslExclude(sym, cb.checked);
    });
  });

  applySort(document.getElementById('positionsHead'), positionsBody);
}

async function loadPositions(forceRebuild = false) {
  try {
    const rows = await apiFetch('/api/positions');

    const newSymbols = new Set(rows.map((p) => p.symbol));
    const oldSymbols = new Set(posStatic.keys());
    for (const sym of avgDownTriggered.keys()) {
      if (!newSymbols.has(sym)) avgDownTriggered.delete(sym);
    }
    const symbolsChanged = forceRebuild || newSymbols.size !== oldSymbols.size || [...newSymbols].some((s) => !oldSymbols.has(s));

    if (!rows.length) {
      positionsBody.innerHTML = '<tr><td colspan="12" class="empty-cell">No open positions.</td></tr>';
      posStatic.clear();
      startMarkPriceWs([]);
      updateTpSlSymbolSelect([]);
      return;
    }

    posStatic.clear();
    rows.forEach((p) => {
      const amt = Number(p.positionAmt);
      const entry = Number(p.entryPrice);
      const lev = Number(p.leverage) || 1;
      const margin = positionInitialMarginOf(p, amt, entry, lev);
      posStatic.set(p.symbol, { amt, entry, margin, lev });
    });

    if (!symbolsChanged) {
      // In-place update: only patch static cells; WebSocket keeps mark/pnl/roe live
      for (const p of rows) {
        const row = positionsBody.querySelector(`tr[data-sym="${p.symbol}"]`);
        if (!row) continue;
        const entry = Number(p.entryPrice);
        const liq = Number(p.liquidationPrice);
        const margin = positionInitialMarginOf(p, Number(p.positionAmt), entry, Number(p.leverage) || 1);
        row.cells[3].textContent = fmt(entry);
        row.cells[3].dataset.v = entry;
        row.cells[5].textContent = fmt(liq);
        row.cells[5].dataset.v = liq;
        row.cells[7].textContent = margin != null ? fmt(margin, 4) : '-';
        row.cells[7].dataset.v = margin ?? 0;
      }
    } else {
      _buildPositionRows(rows);
      startMarkPriceWs([...newSymbols]);
    }

    updateTpSlSymbolSelect(rows.map((p) => {
      const amt = Number(p.positionAmt), entry = Number(p.entryPrice), lev = Number(p.leverage) || 1;
      const upnl = Number(p.unRealizedProfit);
      const margin = positionInitialMarginOf(p, amt, entry, lev);
      return { ...p, roe: margin > 0 ? (upnl / margin) * 100 : 0 };
    }));
  } catch (err) {
    positionsBody.innerHTML = `<tr><td colspan="12" class="empty-cell" style="color:var(--red)">${err.message}</td></tr>`;
  }
}

async function loadOpenOrders() {
  try {
    const rows = await apiFetch('/api/open-orders');
    if (!rows.length) {
      openOrdersBody.innerHTML = '<tr><td colspan="10" class="empty-cell">No open orders.</td></tr>';
      return;
    }
    openOrdersBody.innerHTML = rows.map((o) => {
      const sideClass = o.side === 'BUY' ? 'positive' : 'negative';
      return `
        <tr>
          <td><strong>${symLink(o.symbol)}</strong></td>
          <td>${o.type}</td>
          <td data-v="${o.side === 'BUY' ? 1 : 0}"><span class="${sideClass}">${o.side}</span></td>
          <td>${orderSource(o)}</td>
          <td data-v="${o.price}">${fmt(o.price)}</td>
          <td data-v="${o.origQty}">${fmt(o.origQty, 6)}</td>
          <td data-v="${o.executedQty}">${fmt(o.executedQty, 6)}</td>
          <td>${o.reduceOnly ? 'Yes' : 'No'}</td>
          <td data-v="${o.time}">${fmtDate(o.time)}</td>
          <td><button class="action-btn cancel-btn" data-symbol="${o.symbol}" data-orderid="${o.orderId}">Cancel</button></td>
        </tr>`;
    }).join('');

    openOrdersBody.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sym = btn.dataset.symbol;
        const oid = btn.dataset.orderid;
        if (!confirm(`Cancel order ${oid} for ${sym}?`)) return;
        btn.disabled = true;
        try {
          const result = await apiFetch('/api/cancel-order', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ symbol: sym, orderId: oid }),
          });
          showAction(JSON.stringify(result, null, 2));
          await loadOpenOrders();
        } catch (err) {
          showAction(`Error: ${err.message}`);
          btn.disabled = false;
        }
      });
    });
    applySort(document.getElementById('openOrdersHead'), openOrdersBody);
  } catch (err) {
    openOrdersBody.innerHTML = `<tr><td colspan="9" class="empty-cell" style="color:var(--red)">${err.message}</td></tr>`;
  }
}

async function loadTrades() {
  const sym = tradeSymbolInput.value.trim().toUpperCase() || 'BTCUSDT';
  loadTradesBtn.disabled = true;
  try {
    const rows = await apiFetch(`/api/trades?symbol=${encodeURIComponent(sym)}&limit=50`);
    if (!rows.length) {
      tradesBody.innerHTML = '<tr><td colspan="8" class="empty-cell">No trades found.</td></tr>';
      return;
    }
    tradesBody.innerHTML = [...rows].reverse().map((t) => {
      const sideClass = t.buyer ? 'positive' : 'negative';
      const pnl = Number(t.realizedPnl ?? 0);
      return `
        <tr>
          <td data-v="${t.time}">${fmtDate(t.time)}</td>
          <td>${symLink(t.symbol)}</td>
          <td data-v="${t.buyer ? 1 : 0}"><span class="${sideClass}">${t.buyer ? 'BUY' : 'SELL'}</span></td>
          <td data-v="${t.price}">${fmt(t.price)}</td>
          <td data-v="${t.qty}">${fmt(t.qty, 6)}</td>
          <td data-v="${pnl}" class="${pnlClass(pnl)}">${pnl >= 0 ? '+' : ''}${fmt(pnl, 4)}</td>
          <td>${fmt(t.commission, 6)} ${t.commissionAsset}</td>
          <td>${t.maker ? 'Maker' : 'Taker'}</td>
        </tr>`;
    }).join('');
    applySort(document.getElementById('tradesHead'), tradesBody);
  } catch (err) {
    tradesBody.innerHTML = `<tr><td colspan="8" class="empty-cell" style="color:var(--red)">${err.message}</td></tr>`;
  } finally {
    loadTradesBtn.disabled = false;
  }
}

async function loadTsl() {
  try {
    const data = await apiFetch('/api/trailing-stop/status');
    tslStatus.textContent = data.enabled
      ? `Enabled · trigger ROE ≥ ${data.triggerRoe}% → lock ${data.lockMarginPct}% margin`
      : 'Disabled (set TRAILING_STOP_ENABLED=true)';

    const entries = Object.entries(data.protected ?? {});
    if (!entries.length) {
      tslBody.textContent = data.enabled ? 'No positions protected yet.' : '';
      return;
    }
    tslBody.innerHTML = `<table class="positions-table" style="margin-top:0"><thead><tr>
      <th>Symbol</th><th>Stop Price</th><th>ROE at trigger</th><th>Set at</th>
    </tr></thead><tbody>` + entries.map(([sym, info]) => `
      <tr>
        <td><strong>${sym}</strong></td>
        <td class="positive">${fmt(info.stopPrice)}</td>
        <td class="positive">+${fmt(info.roe, 2)}%</td>
        <td>${new Date(info.at).toLocaleTimeString('vi-VN', { hour12: false })}</td>
      </tr>`).join('') + '</tbody></table>';
  } catch (err) {
    tslBody.textContent = err.message;
  }
}

async function loadSlTp() {
  try {
    const [regular, algo] = await Promise.all([
      apiFetch('/api/open-orders'),
      apiFetch('/api/open-algo-orders'),
    ]);

    const isSlType = (t) => { const u = String(t || '').toUpperCase(); return u.includes('STOP') && !u.includes('PROFIT'); };
    const isTpType = (t) => { const u = String(t || '').toUpperCase(); return u.includes('PROFIT') || u.includes('TAKE'); };

    const bySymbol = new Map();
    const upsert = (sym) => { if (!bySymbol.has(sym)) bySymbol.set(sym, { sl: [], tp: [] }); return bySymbol.get(sym); };

    for (const o of regular) {
      if (!isSlType(o.type) && !isTpType(o.type)) continue;
      const entry = upsert(o.symbol);
      const price = fmt(Number(o.stopPrice) || Number(o.price));
      if (isSlType(o.type)) entry.sl.push(price);
      else entry.tp.push(price);
    }
    for (const o of algo) {
      const entry = upsert(o.symbol);
      const price = fmt(Number(o.triggerPrice) || Number(o.stopPrice) || Number(o.price));
      if (!price || price === '-') continue;
      if (isTpType(o.type)) entry.tp.push(price);
      else entry.sl.push(price);
    }

    const rows = [...bySymbol.entries()].filter(([, v]) => v.sl.length || v.tp.length);

    const hint = `Regular: ${regular.length} · Algo: ${algo.length}`;
    if (!rows.length) {
      slTpBody.innerHTML = `<p class="explain" style="color:var(--muted)">Không có SL/TP nào đang active. <small>(${hint})</small></p>`;
      return;
    }

    slTpBody.innerHTML = `<p style="font-size:11px;color:var(--muted);margin-bottom:8px">${hint}</p>
      <table class="positions-table" style="margin-top:0"><thead><tr>
        <th>Symbol</th><th>Stop Loss</th><th>Take Profit</th>
      </tr></thead><tbody>` + rows.map(([sym, v]) => `
      <tr>
        <td><strong>${sym}</strong></td>
        <td class="${v.sl.length ? 'pnl-negative' : ''}">${v.sl.length ? v.sl.join(', ') : '<span style="color:var(--muted)">—</span>'}</td>
        <td class="${v.tp.length ? 'pnl-positive' : ''}">${v.tp.length ? v.tp.join(', ') : '<span style="color:var(--muted)">—</span>'}</td>
      </tr>`).join('') + '</tbody></table>';
  } catch (err) {
    slTpBody.textContent = err.message;
  }
}

async function refresh() {
  status.textContent = 'Refreshing...';
  try {
    // loadDailyPnl bị tách riêng (weight=30, TTL 5min) — không gọi cùng lúc với positions/openOrders
    await Promise.all([loadBalance(), loadPositions(), loadOpenOrders(), loadTsl(), loadSlTp()]);
    lastRefresh.textContent = `Last: ${new Date().toLocaleTimeString('vi-VN', { hour12: false })}`;
    status.textContent = 'Live';
  } catch {
    status.textContent = 'Error';
  }
}

// ── Settings ─────────────────────────────────────────────────
const settingAvgDown = document.getElementById('settingAvgDown');
const settingAvgDownRoe = document.getElementById('settingAvgDownRoe');
const settingAvgDownMargin = document.getElementById('settingAvgDownMargin');

function applyAvgDownSettings() {
  avgDownEnabled = settingAvgDown.checked;
  avgDownTriggerRoe = Number(settingAvgDownRoe.value) || -60;
  avgDownMarginUsdt = Math.max(1, Number(settingAvgDownMargin.value) || 2);
}

async function loadSettings() {
  try {
    const data = await apiFetch('/api/settings');
    settingOrderEnabled.checked = !!data.orderEnabled;
    settingAutoTradeEnabled.checked = !!data.autoTradeEnabled;
    settingDryRun.checked = !!data.dryRun;
    settingBtcReversalGuard.checked = !!data.btcReversalGuard;
    if (data.btcReversalGuardRoe != null) settingBtcReversalRoe.value = data.btcReversalGuardRoe;
    // Avg down is client-side only — restore from localStorage
    const saved = JSON.parse(localStorage.getItem('avgDownSettings') ?? '{}');
    if (saved.enabled != null) settingAvgDown.checked = saved.enabled;
    if (saved.roe != null) settingAvgDownRoe.value = saved.roe;
    if (saved.margin != null) settingAvgDownMargin.value = saved.margin;
    applyAvgDownSettings();
  } catch { /* ignore */ }
}

async function saveSetting(key, value) {
  try {
    await apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    settingsSaved.textContent = 'Saved ✓';
    if (key === 'orderEnabled' || key === 'dryRun') loadLiveCardWhitelist();
    setTimeout(() => { settingsSaved.textContent = ''; }, 2000);
  } catch (err) {
    settingsSaved.textContent = err.message;
  }
}

settingOrderEnabled.addEventListener('change', () => saveSetting('orderEnabled', settingOrderEnabled.checked));
settingAutoTradeEnabled.addEventListener('change', () => saveSetting('autoTradeEnabled', settingAutoTradeEnabled.checked));
settingDryRun.addEventListener('change', () => saveSetting('dryRun', settingDryRun.checked));
settingBtcReversalGuard.addEventListener('change', () => saveSetting('btcReversalGuard', settingBtcReversalGuard.checked));
settingBtcReversalRoe.addEventListener('change', () => saveSetting('btcReversalGuardRoe', Number(settingBtcReversalRoe.value)));

function saveAvgDownSettings() {
  localStorage.setItem('avgDownSettings', JSON.stringify({
    enabled: settingAvgDown.checked,
    roe: Number(settingAvgDownRoe.value),
    margin: Number(settingAvgDownMargin.value),
  }));
  applyAvgDownSettings();
}
settingAvgDown.addEventListener('change', saveAvgDownSettings);
settingAvgDownRoe.addEventListener('change', saveAvgDownSettings);
settingAvgDownMargin.addEventListener('change', saveAvgDownSettings);

loadTradesBtn.addEventListener('click', loadTrades);

// ── Place Order form ─────────────────────────────────────────
const orderSymbolInput = document.getElementById('orderSymbolInput');
const orderTypeInput = document.getElementById('orderTypeInput');
const orderMarginInput = document.getElementById('orderMarginInput');
const orderLevInput = document.getElementById('orderLevInput');
const orderLimitPriceInput = document.getElementById('orderLimitPriceInput');
const orderTpInput = document.getElementById('orderTpInput');
const orderSlInput = document.getElementById('orderSlInput');
const orderDryRunInput = document.getElementById('orderDryRunInput');
const orderMaxPositionsInput = document.getElementById('orderMaxPositionsInput');

// Restore saved max positions
const savedMaxPos = localStorage.getItem('maxOpenPositions');
if (savedMaxPos !== null) orderMaxPositionsInput.value = savedMaxPos;
orderMaxPositionsInput.addEventListener('change', () => {
  localStorage.setItem('maxOpenPositions', orderMaxPositionsInput.value);
});
const orderLongBtn = document.getElementById('orderLongBtn');
const orderShortBtn = document.getElementById('orderShortBtn');
const orderFormResult = document.getElementById('orderFormResult');

orderTypeInput.addEventListener('change', () => {
  orderLimitPriceInput.disabled = orderTypeInput.value !== 'LIMIT';
  if (orderLimitPriceInput.disabled) orderLimitPriceInput.value = '';
});

async function submitOrder(side) {
  const symbol = orderSymbolInput.value.trim().toUpperCase();
  const margin = Number(orderMarginInput.value);
  const leverage = Number(orderLevInput.value);

  if (!symbol || margin <= 0 || leverage < 1) {
    orderFormResult.style.display = 'block';
    orderFormResult.textContent = 'Vui lòng điền đủ Symbol, Margin, Leverage.';
    return;
  }

  orderLongBtn.disabled = true;
  orderShortBtn.disabled = true;
  orderFormResult.style.display = 'block';
  orderFormResult.textContent = 'Sending...';

  try {
    const payload = {
      symbol,
      side,
      notionalUsdt: margin * leverage,
      leverage,
      orderType: orderTypeInput.value,
      dryRun: orderDryRunInput.checked,
      maxOpenPositions: Number(orderMaxPositionsInput.value) || 0,
    };
    if (orderTypeInput.value === 'LIMIT' && orderLimitPriceInput.value) {
      payload.limitPrice = Number(orderLimitPriceInput.value);
    }
    if (orderTpInput.value) payload.takeProfitPrice = Number(orderTpInput.value);
    if (orderSlInput.value) payload.stopLossPrice = Number(orderSlInput.value);

    const result = await apiFetch('/api/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    orderFormResult.textContent = JSON.stringify(result, null, 2);
    if (result.status === 'submitted') await refresh();
  } catch (err) {
    orderFormResult.textContent = `Error: ${err.message}`;
  } finally {
    orderLongBtn.disabled = false;
    orderShortBtn.disabled = false;
  }
}

orderLongBtn.addEventListener('click', () => submitOrder('BUY'));
orderShortBtn.addEventListener('click', () => submitOrder('SELL'));

// ── Set TP / SL ──────────────────────────────────────────────
const tpslSymbolSelect = document.getElementById('tpslSymbolSelect');
const tpslTpRoe = document.getElementById('tpslTpRoe');
const tpslSlRoe = document.getElementById('tpslSlRoe');
const tpslTpPrice = document.getElementById('tpslTpPrice');
const tpslSlPrice = document.getElementById('tpslSlPrice');
const setTpSlBtn = document.getElementById('setTpSlBtn');
const tpslResult = document.getElementById('tpslResult');

// positions map: symbol → { entry, leverage, isLong }
const openPositionsMap = new Map();

function roeToPrice(roe, entry, leverage, isLong) {
  if (!entry || !leverage) return null;
  return isLong
    ? entry * (1 + roe / 100 / leverage)
    : entry * (1 - roe / 100 / leverage);
}

function updateTpSlPriceHints() {
  const sym = tpslSymbolSelect.value;
  const pos = openPositionsMap.get(sym);
  if (!pos) { tpslTpPrice.textContent = '—'; tpslSlPrice.textContent = '—'; return; }
  const { entry, leverage, isLong } = pos;
  const tpRoe = tpslTpRoe.value !== '' ? Number(tpslTpRoe.value) : null;
  const slRoe = tpslSlRoe.value !== '' ? Number(tpslSlRoe.value) : null;
  tpslTpPrice.textContent = tpRoe != null ? `@ ${roeToPrice(tpRoe, entry, leverage, isLong)?.toFixed(6).replace(/\.?0+$/, '') ?? '—'}` : '—';
  tpslSlPrice.textContent = slRoe != null ? `@ ${roeToPrice(slRoe, entry, leverage, isLong)?.toFixed(6).replace(/\.?0+$/, '') ?? '—'}` : '—';
}

function updateTpSlSymbolSelect(positions) {
  const current = tpslSymbolSelect.value;
  tpslSymbolSelect.innerHTML = '<option value="">— chọn vị thế —</option>';
  openPositionsMap.clear();
  positions.forEach((p) => {
    const amt = Number(p.positionAmt);
    if (!amt) return;
    const isLong = amt > 0;
    const entry = Number(p.entryPrice);
    const leverage = Number(p.leverage) || 10;
    openPositionsMap.set(p.symbol, { entry, leverage, isLong });
    const roe = Number(p.roe ?? 0);
    const opt = document.createElement('option');
    opt.value = p.symbol;
    opt.textContent = `${p.symbol} ${isLong ? '▲' : '▼'} ROE ${roe >= 0 ? '+' : ''}${roe.toFixed(1)}%`;
    tpslSymbolSelect.appendChild(opt);
  });
  if (current && openPositionsMap.has(current)) tpslSymbolSelect.value = current;
  updateTpSlPriceHints();
}

tpslSymbolSelect.addEventListener('change', updateTpSlPriceHints);
tpslTpRoe.addEventListener('input', updateTpSlPriceHints);
tpslSlRoe.addEventListener('input', updateTpSlPriceHints);

setTpSlBtn.addEventListener('click', async () => {
  const symbol = tpslSymbolSelect.value;
  if (!symbol) { tpslResult.style.display = 'block'; tpslResult.textContent = 'Chọn vị thế.'; return; }
  const pos = openPositionsMap.get(symbol);
  if (!pos) { tpslResult.style.display = 'block'; tpslResult.textContent = 'Không tìm thấy vị thế.'; return; }

  const tpRoe = tpslTpRoe.value !== '' ? Number(tpslTpRoe.value) : null;
  const slRoe = tpslSlRoe.value !== '' ? Number(tpslSlRoe.value) : null;
  if (tpRoe == null && slRoe == null) { tpslResult.style.display = 'block'; tpslResult.textContent = 'Nhập ít nhất TP% hoặc SL%.'; return; }

  const tpPrice = tpRoe != null ? roeToPrice(tpRoe, pos.entry, pos.leverage, pos.isLong) : null;
  const slPrice = slRoe != null ? roeToPrice(slRoe, pos.entry, pos.leverage, pos.isLong) : null;

  const parts = [];
  if (tpPrice) parts.push(`TP ${tpRoe}% @ ${tpPrice.toFixed(4)}`);
  if (slPrice) parts.push(`SL ${slRoe}% @ ${slPrice.toFixed(4)}`);
  if (!confirm(`Set ${parts.join(', ')} cho ${symbol}?\nTP/SL cũ cùng loại sẽ bị huỷ.`)) return;

  setTpSlBtn.disabled = true;
  tpslResult.style.display = 'none';
  try {
    const result = await apiFetch('/api/set-tp-sl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol, tpPrice, slPrice }),
    });
    tpslResult.style.display = 'block';
    tpslResult.textContent = JSON.stringify(result, null, 2);
    await refresh();
  } catch (err) {
    tpslResult.style.display = 'block';
    tpslResult.textContent = `Error: ${err.message}`;
  } finally {
    setTpSlBtn.disabled = false;
  }
});

// Init sort on all tables
initSort(document.getElementById('positionsHead'), positionsBody);
initSort(document.getElementById('openOrdersHead'), openOrdersBody);
initSort(document.getElementById('tradesHead'), tradesBody);
