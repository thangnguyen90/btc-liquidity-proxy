const els = Object.fromEntries([
  'binanceStatsStatus', 'binanceStatsFilters', 'binanceStatsFromDay', 'binanceStatsToDay',
  'binanceStatsLabel', 'binanceStatsToday', 'binanceStatsAll', 'binanceStatsSummary',
  'binanceStatsGroups', 'binanceStatsRows', 'binanceStatsPrev', 'binanceStatsNext', 'binanceStatsPageInfo',
].map((id) => [id, document.getElementById(id)]));

let statsData = null;
let signalSettingsData = { signals: {}, globalOrderEnabled: false, dryRun: true };
let page = 1;
let statsLoading = false;
let statsRefreshQueued = false;
let realtimeController = null;
let realtimeReconnectTimer = null;
let realtimeConnected = false;
let realtimeRenderTimer = null;
let fullRefreshTimer = null;
const missingPositionKeys = new Set();
const PAGE_SIZE = 20;
const DISCONNECTED_REFRESH_MS = 30_000;

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

const realtimeDiagnosis = (pnl, known = true) => {
  if (!known || !Number.isFinite(Number(pnl))) return 'ĐANG MỞ · CHỜ PNL BINANCE';
  if (Number(pnl) > 0) return 'ĐANG LÃI · REALTIME';
  if (Number(pnl) < 0) return 'ĐANG LỖ · REALTIME';
  return 'HÒA VỐN · REALTIME';
};

function summarizeRows(rows = []) {
  const closedKnown = rows.filter((row) => row.status === 'CLOSED' && row.pnlKnown);
  const openKnown = rows.filter((row) => row.status === 'OPEN' && row.pnlKnown);
  const wins = closedKnown.filter((row) => Number(row.pnl) > 0).length;
  const losses = closedKnown.filter((row) => Number(row.pnl) < 0).length;
  const grossProfit = closedKnown.reduce((sum, row) => sum + Math.max(0, Number(row.pnl) || 0), 0);
  const grossLoss = closedKnown.reduce((sum, row) => sum + Math.max(0, -(Number(row.pnl) || 0)), 0);
  const realizedPnl = closedKnown.reduce((sum, row) => sum + (Number(row.pnl) || 0), 0);
  const unrealizedPnl = openKnown.reduce((sum, row) => sum + (Number(row.pnl) || 0), 0);
  const roeRows = rows.filter((row) => row.pnlKnown && Number.isFinite(Number(row.roe)));
  return {
    total: rows.length,
    open: rows.filter((row) => row.status === 'OPEN').length,
    closed: rows.filter((row) => row.status === 'CLOSED').length,
    pnlKnown: rows.filter((row) => row.pnlKnown).length,
    pnlMissing: rows.filter((row) => !row.pnlKnown).length,
    wins,
    losses,
    winRate: wins + losses ? wins / (wins + losses) * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
    realizedPnl,
    unrealizedPnl,
    netPnl: realizedPnl + unrealizedPnl,
    avgRoe: roeRows.length ? roeRows.reduce((sum, row) => sum + Number(row.roe), 0) / roeRows.length : null,
  };
}

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

async function ordersJsonApi(url, options = {}) {
  let token = localStorage.getItem('orders_token') ?? '';
  if (!token) token = await recoverToken();
  const request = () => jsonApi(url, {
    ...options,
    headers: { 'x-orders-token': token, ...(options.headers ?? {}) },
  });
  try {
    return await request();
  } catch (error) {
    if (error.status !== 401) throw error;
    localStorage.removeItem('orders_token');
    token = await recoverToken();
    return request();
  }
}

async function loadSignalSettings() {
  signalSettingsData = await ordersJsonApi('/api/liquid-flow-v2-binance-signal-settings');
  return signalSettingsData;
}

function signalControlHtml(labelKey) {
  const setting = signalSettingsData?.signals?.[labelKey];
  if (!setting?.supported) {
    return '<span class="flow-v2-route-unsupported">KHÔNG CÓ AUTO ROUTE</span>';
  }
  const margin = Number(setting.marginUsdt);
  const leverage = Number(setting.leverage) || 5;
  const effective = setting.enabled && signalSettingsData.globalOrderEnabled && !signalSettingsData.dryRun;
  const gateNote = setting.enabled && !effective
    ? signalSettingsData.dryRun ? ' · dry-run tổng' : ' · Orders tổng đang tắt'
    : '';
  return `<div class="flow-v2-signal-order-control" data-label-key="${escapeHtml(labelKey)}">
    <label class="flow-v2-row-switch">
      <input class="js-signal-binance-enabled" type="checkbox" ${setting.enabled ? 'checked' : ''}>
      <span>${setting.enabled ? 'BẬT' : 'TẮT'}</span>
    </label>
    <div class="flow-v2-row-margin">
      <input class="js-signal-binance-margin" type="number" min="0.01" max="10000" step="0.01" value="${escapeHtml(margin)}" aria-label="Margin USD ${escapeHtml(labelKey)}">
      <button class="js-signal-binance-save" type="button">LƯU</button>
    </div>
    <small class="js-signal-binance-status ${effective ? 'is-positive' : setting.enabled ? 'is-negative' : ''}">${setting.source === 'PERSISTED' ? 'đã lưu' : 'mặc định'} · $${escapeHtml(margin)} x${leverage}${gateNote}</small>
  </div>`;
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
    const diagnosis = row.status === 'OPEN'
      ? realtimeDiagnosis(row.pnl, row.pnlKnown)
      : (row.diagnosis ?? row.reason);
    const liveAge = row.liveUpdatedAt
      ? Math.max(0, Math.round((Date.now() - Number(row.liveUpdatedAt)) / 1000))
      : null;
    return `<tr>
      <td>${escapeHtml(dateTime(row.entryAt))}<small>${escapeHtml(row.mode ?? '-')}</small></td>
      <td><strong class="${row.side === 'LONG' ? 'is-positive' : 'is-negative'}">${escapeHtml(row.symbol)} · ${escapeHtml(row.side)}</strong></td>
      <td><strong>${escapeHtml(row.label)}</strong><small>${percent(row.confidence, 0)} confidence</small></td>
      <td>${price(row.signalEntry)} / <strong>${price(row.binanceEntry)}</strong></td>
      <td class="${Number.isFinite(slip) ? (slip <= 0 ? 'is-positive' : 'is-negative') : ''}">${Number.isFinite(slip) ? `${slip >= 0 ? '+' : ''}${slip.toFixed(3)}%` : '--'}</td>
      <td><strong class="${row.status === 'OPEN' && row.pnlKnown ? signedClass(pnl) : ''}">${escapeHtml(diagnosis)}</strong><small>${escapeHtml(row.paperOutcome || row.status)}${liveAge == null ? '' : ` · socket ${liveAge}s`}</small></td>
      <td class="${row.pnlKnown ? signedClass(pnl) : ''}"><strong>${money(pnl, row.pnlKnown)}</strong><small>ROE ${percent(row.roe)} · mark ${price(row.exitPrice)} · realized ${money(row.realizedPnl, row.pnlKnown)} · fee ${money(row.commission, row.pnlKnown)} · funding ${money(row.funding, row.pnlKnown)}</small></td>
      <td><strong>${escapeHtml(row.pnlSource)}</strong><small>Paper: ${escapeHtml(row.paperOutcome || '--')} · ${money(row.paperPnl, row.paperPnl != null)}</small></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8">Không có lệnh Binance V2/CoinGlass đã xác nhận fill trong bộ lọc.</td></tr>';
}

function renderSummary(s = {}) {
  els.binanceStatsSummary.innerHTML = [
    ['FILLED', s.total ?? 0, ''], ['OPEN / CLOSED', `${s.open ?? 0} / ${s.closed ?? 0}`, ''],
    ['W / L · WR', `${s.wins ?? 0}/${s.losses ?? 0} · ${percent(s.winRate)}`, ''], ['PF', pf(s.profitFactor, s.realizedPnl), ''],
    ['AVG ROE', percent(s.avgRoe), signedClass(s.avgRoe)], ['REALIZED', money(s.realizedPnl), signedClass(s.realizedPnl)],
    ['UNREALIZED', money(s.unrealizedPnl), signedClass(s.unrealizedPnl)], ['NET PNL', money(s.netPnl), signedClass(s.netPnl)],
  ].map(([label, value, cls]) => `<article><span>${escapeHtml(label)}</span><strong class="${cls}">${escapeHtml(String(value))}</strong></article>`).join('');
}

function renderStatus(note = '') {
  const s = statsData?.summary ?? {};
  const generated = statsData?.generatedAt ? dateTime(statsData.generatedAt) : '--';
  const socket = realtimeConnected ? 'SOCKET REALTIME' : 'ĐANG KẾT NỐI LẠI';
  els.binanceStatsStatus.innerHTML = `<span class="flow-v2-realtime-badge ${realtimeConnected ? 'is-live' : ''}">${socket}</span> ${Number(s.total ?? 0)} lệnh · PnL thật biết ${Number(s.pnlKnown ?? 0)}, thiếu ${Number(s.pnlMissing ?? 0)} · snapshot ${escapeHtml(generated)}${note ? ` · ${escapeHtml(note)}` : ''}${statsData?.reconciliationWarning ? ` · Binance tạm lỗi: ${escapeHtml(statsData.reconciliationWarning)}` : ''}`;
}

function render(data) {
  statsData = data;
  for (const row of data.rows ?? []) missingPositionKeys.delete(`${row.symbol}:${row.side}`);
  const s = data.summary ?? {};
  renderStatus();
  renderSummary(s);
  const selected = els.binanceStatsLabel.value;
  els.binanceStatsLabel.innerHTML = '<option value="">Tất cả tín hiệu</option>'
    + (data.availableLabels ?? []).map((row) => `<option value="${escapeHtml(row.key)}" ${row.key === selected ? 'selected' : ''}>${escapeHtml(row.label)}</option>`).join('');
  els.binanceStatsGroups.innerHTML = (data.groups ?? []).map((row) => `<tr>
    <td><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.key)}</small></td>
    <td>${signalControlHtml(row.key)}</td>
    <td>${Number(row.total ?? 0)} <small>${Number(row.open ?? 0)} mở / ${Number(row.pnlMissing ?? 0)} thiếu PnL</small></td>
    <td>${Number(row.wins ?? 0)} / ${Number(row.losses ?? 0)}</td><td>${percent(row.winRate)}</td><td>${pf(row.profitFactor, row.realizedPnl)}</td>
    <td class="${signedClass(row.avgRoe)}">${percent(row.avgRoe)}</td><td class="${signedClass(row.netPnl)}"><strong>${money(row.netPnl)}</strong></td>
  </tr>`).join('') || '<tr><td colspan="8">Không có nhóm tín hiệu trong bộ lọc.</td></tr>';
  renderRows();
}

async function load({ resetPage = true, quiet = false } = {}) {
  if (statsLoading) {
    statsRefreshQueued = true;
    return;
  }
  statsLoading = true;
  if (resetPage) page = 1;
  if (!quiet || !statsData) els.binanceStatsStatus.textContent = 'Đang đối soát Binance Position / Income…';
  try {
    const params = new URLSearchParams();
    if (els.binanceStatsFromDay.value) params.set('fromDay', els.binanceStatsFromDay.value);
    if (els.binanceStatsToDay.value) params.set('toDay', els.binanceStatsToDay.value);
    if (els.binanceStatsLabel.value) params.set('labelKey', els.binanceStatsLabel.value);
    render(await ordersJsonApi(`/api/liquid-flow-v2-binance-stats?${params}`));
  } catch (error) {
    if (statsData) {
      renderStatus(`Lỗi đồng bộ: ${error.message}`);
    } else {
      els.binanceStatsStatus.textContent = `Không tải được thống kê: ${error.message}`;
      els.binanceStatsGroups.innerHTML = `<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`;
      els.binanceStatsRows.innerHTML = `<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`;
    }
  } finally {
    statsLoading = false;
    if (statsRefreshQueued) {
      statsRefreshQueued = false;
      setTimeout(() => load({ resetPage: false, quiet: true }), 250);
    }
  }
}

function rangeIncludesToday() {
  const today = bangkokDay();
  const from = els.binanceStatsFromDay.value;
  const to = els.binanceStatsToDay.value;
  return (!from || from <= today) && (!to || to >= today);
}

function scheduleFullRefresh(delayMs = 700) {
  clearTimeout(fullRefreshTimer);
  fullRefreshTimer = setTimeout(() => {
    fullRefreshTimer = null;
    load({ resetPage: false, quiet: true });
  }, delayMs);
}

function applyPositionPnlTick(payload = {}) {
  if (!statsData || !rangeIncludesToday()) return;
  const symbol = String(payload.symbol ?? '').toUpperCase();
  const amount = Number(payload.positionAmt);
  if (!symbol || !Number.isFinite(amount) || amount === 0) return;
  const side = amount > 0 ? 'LONG' : 'SHORT';
  const pnl = Number(payload.unRealizedProfit);
  const roe = Number(payload.roe);
  const mark = Number(payload.markPrice);
  const rows = Array.isArray(statsData.rows) ? statsData.rows : [];
  const matches = rows.filter((row) => row.status === 'OPEN' && row.symbol === symbol && row.side === side);
  if (!matches.length) {
    const positionKey = `${symbol}:${side}`;
    if (!missingPositionKeys.has(positionKey)) {
      missingPositionKeys.add(positionKey);
      scheduleFullRefresh(500);
    }
    return;
  }
  const updatedAt = Number(payload.eventAt) || Date.now();
  for (const row of matches) {
    if (Number.isFinite(pnl)) {
      row.pnl = pnl;
      row.pnlKnown = true;
    }
    if (Number.isFinite(roe)) row.roe = roe;
    if (Number.isFinite(mark) && mark > 0) row.exitPrice = mark;
    row.pnlSource = 'BINANCE_POSITION_SOCKET';
    row.liveUpdatedAt = updatedAt;
  }
  clearTimeout(realtimeRenderTimer);
  realtimeRenderTimer = setTimeout(() => {
    statsData.summary = summarizeRows(rows);
    renderSummary(statsData.summary);
    renderRows();
    renderStatus(`tick ${dateTime(updatedAt)}`);
  }, 120);
}

function parseRealtimeEvent(block) {
  let eventName = 'message';
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (!data.length) return;
  let payload;
  try { payload = JSON.parse(data.join('\n')); } catch { return; }
  if (eventName === 'ready') {
    realtimeConnected = true;
    if (statsData) renderStatus();
  } else if (eventName === 'position') {
    applyPositionPnlTick(payload);
  } else if (eventName === 'snapshot') {
    for (const position of payload.positions ?? []) applyPositionPnlTick(position);
  } else if (eventName === 'position-closed' || eventName === 'live-card-lifecycle') {
    if (eventName === 'position-closed') {
      const symbol = String(payload.symbol ?? '').toUpperCase();
      missingPositionKeys.delete(`${symbol}:LONG`);
      missingPositionKeys.delete(`${symbol}:SHORT`);
    }
    scheduleFullRefresh(eventName === 'position-closed' ? 1_200 : 600);
  }
}

async function connectRealtimeStream() {
  if (realtimeController) return;
  const controller = new AbortController();
  realtimeController = controller;
  try {
    let token = localStorage.getItem('orders_token') ?? '';
    if (!token) token = await recoverToken();
    const response = await fetch('/api/positions/stream', {
      headers: { 'x-orders-token': token },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status === 401) {
      localStorage.removeItem('orders_token');
      throw new Error('REAUTH_REQUIRED');
    }
    if (!response.ok || !response.body) throw new Error(`Position stream HTTP ${response.status}`);
    realtimeConnected = true;
    if (statsData) renderStatus();
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
        parseRealtimeEvent(block);
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError') console.warn('[V2BinanceStats] realtime disconnected:', error.message);
  } finally {
    if (realtimeController === controller) realtimeController = null;
    realtimeConnected = false;
    if (statsData) renderStatus();
    clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = setTimeout(connectRealtimeStream, 3_000);
  }
}

els.binanceStatsGroups.addEventListener('click', async (event) => {
  const button = event.target.closest('.js-signal-binance-save');
  if (!button) return;
  const control = button.closest('.flow-v2-signal-order-control');
  const labelKey = control?.dataset?.labelKey ?? '';
  const enabledInput = control?.querySelector('.js-signal-binance-enabled');
  const marginInput = control?.querySelector('.js-signal-binance-margin');
  const status = control?.querySelector('.js-signal-binance-status');
  const marginUsdt = Number(marginInput?.value);
  if (!Number.isFinite(marginUsdt) || marginUsdt < 0.01 || marginUsdt > 10_000) {
    status.textContent = 'Margin phải trong khoảng 0.01..10000 USDT.';
    status.className = 'js-signal-binance-status is-negative';
    return;
  }
  button.disabled = true;
  status.textContent = 'Đang lưu…';
  status.className = 'js-signal-binance-status';
  try {
    const response = await ordersJsonApi('/api/liquid-flow-v2-binance-signal-settings', {
      method: 'POST',
      body: JSON.stringify({ labelKey, enabled: enabledInput.checked, marginUsdt }),
    });
    signalSettingsData.signals[labelKey] = response.setting;
    signalSettingsData.globalOrderEnabled = response.globalOrderEnabled;
    signalSettingsData.dryRun = response.dryRun;
    render(statsData);
  } catch (error) {
    status.textContent = `Không lưu được: ${error.message}`;
    status.className = 'js-signal-binance-status is-negative';
  } finally {
    button.disabled = false;
  }
});

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
loadSignalSettings().catch((error) => {
  signalSettingsData = { signals: {}, globalOrderEnabled: false, dryRun: true, error: error.message };
}).finally(() => {
  load();
  connectRealtimeStream();
});

setInterval(() => {
  if (!realtimeConnected && document.visibilityState === 'visible') {
    load({ resetPage: false, quiet: true });
  }
}, DISCONNECTED_REFRESH_MS);

window.addEventListener('beforeunload', () => {
  clearTimeout(realtimeReconnectTimer);
  clearTimeout(fullRefreshTimer);
  realtimeController?.abort();
});
