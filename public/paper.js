let topTraderTrends = {}; // symbol → { label, direction } | null

const autoProbeChk = document.getElementById('autoProbeChk');
const autoProbeMarginInput = document.getElementById('autoProbeMargin');

async function loadAutoProbeState() {
  try {
    const res = await fetch('/api/auto-probe-enabled');
    if (res.ok) {
      const { enabled, margin } = await res.json();
      autoProbeChk.checked = !!enabled;
      if (margin) autoProbeMarginInput.value = margin;
    }
  } catch { /* silent */ }
}

async function saveAutoProbeState() {
  const margin = autoProbeMarginInput.value ? Number(autoProbeMarginInput.value) : 1;
  try {
    await fetch('/api/auto-probe-enabled', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: autoProbeChk.checked, margin }),
    });
  } catch (err) {
    autoProbeChk.checked = !autoProbeChk.checked;
  }
}

autoProbeChk.addEventListener('change', saveAutoProbeState);
autoProbeMarginInput.addEventListener('change', saveAutoProbeState);

loadAutoProbeState();

async function loadTopTraderTrends(symbols) {
  if (!symbols.length) return;
  try {
    const res = await fetch(`/api/top-trader-trend?symbols=${symbols.join(',')}`);
    if (res.ok) Object.assign(topTraderTrends, await res.json());
  } catch { /* silent */ }
}

const els = {
  status: document.getElementById('status'),
  openCount: document.getElementById('openCount'),
  unrealizedPnl: document.getElementById('unrealizedPnl'),
  realizedPnl: document.getElementById('realizedPnl'),
  winRate: document.getElementById('winRate'),
  closedCount: document.getElementById('closedCount'),
  symbolInput: document.getElementById('symbolInput'),
  marginInput: document.getElementById('marginInput'),
  leverageInput: document.getElementById('leverageInput'),
  entryInput: document.getElementById('entryInput'),
  sourceInput: document.getElementById('sourceInput'),
  noteInput: document.getElementById('noteInput'),
  longBtn: document.getElementById('longBtn'),
  shortBtn: document.getElementById('shortBtn'),
  resultBox: document.getElementById('resultBox'),
  lastUpdated: document.getElementById('lastUpdated'),
  openBody: document.getElementById('openBody'),
  closedBody: document.getElementById('closedBody'),
};

const sortState = {
  open: { key: 'time', dir: 'desc' },
  closed: { key: 'closedAt', dir: 'desc' },
};

const sortGetters = {
  symbol: (t) => t.symbol,
  side: (t) => t.side,
  status: (t) => t.status,
  margin: (t) => Number(t.marginUsdt ?? 0),
  leverage: (t) => Number(t.leverage ?? 0),
  entry: (t) => Number(t.entryPrice ?? 0),
  mark: (t) => Number(t.markPrice ?? t.exitPrice ?? 0),
  exit: (t) => Number(t.exitPrice ?? 0),
  qty: (t) => Number(t.quantity ?? 0),
  pnl: (t) => Number(t.pnl ?? 0),
  roe: (t) => Number(t.roe ?? 0),
  time: (t) => Date.parse(t.openedAt ?? t.entryReadyAt ?? t.createdAt ?? 0) || 0,
  closedAt: (t) => Date.parse(t.closedAt ?? 0) || 0,
  note: (t) => t.note ?? '',
};

function fmt(value, d = 4) {
  if (value == null || isNaN(value)) return '-';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: d });
}

function fmtTime(value) {
  return value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '-';
}

function clsPnl(value) {
  const n = Number(value);
  return n > 0 ? 'pnl-positive' : n < 0 ? 'pnl-negative' : '';
}

function sortTrades(rows, table) {
  const state = sortState[table];
  const getter = sortGetters[state.key] ?? sortGetters.time;
  const dir = state.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });
}

function updateSortHeaders() {
  document.querySelectorAll('[data-sort-table][data-sort-key]').forEach((th) => {
    const state = sortState[th.dataset.sortTable];
    const active = state?.key === th.dataset.sortKey;
    th.classList.toggle('sort-active', active);
    th.dataset.sortDir = active ? state.dir : '';
  });
}

function showResult(text) {
  els.resultBox.style.display = 'block';
  els.resultBox.textContent = text;
}

function getOrdersToken() {
  return localStorage.getItem('orders_token') ?? null;
}

async function api(url, opts = {}) {
  const token = getOrdersToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-orders-token': token } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

async function openTrade(side) {
  const symbol = els.symbolInput.value.trim().toUpperCase();
  const marginUsdt = Number(els.marginInput.value);
  const leverage = Number(els.leverageInput.value);
  const entryPrice = els.entryInput.value ? Number(els.entryInput.value) : undefined;
  const source = els.sourceInput.value.trim() || 'manual';
  const note = els.noteInput.value.trim();
  if (!symbol || !marginUsdt || !leverage) {
    showResult('Nhập đủ symbol, margin và leverage.');
    return;
  }
  els.longBtn.disabled = true;
  els.shortBtn.disabled = true;
  try {
    const data = await api('/api/paper-trades', {
      method: 'POST',
      body: JSON.stringify({ symbol, side, marginUsdt, leverage, entryPrice, source, note }),
    });
    showResult(JSON.stringify(data.trade, null, 2));
    els.noteInput.value = '';
    await loadTrades();
  } catch (err) {
    showResult(`Error: ${err.message}`);
  } finally {
    els.longBtn.disabled = false;
    els.shortBtn.disabled = false;
  }
}

async function closeTrade(id) {
  if (!confirm('Close paper trade at current mark price?')) return;
  try {
    const data = await api('/api/paper-trades/close', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    showResult(JSON.stringify(data.trade, null, 2));
    await loadTrades();
  } catch (err) {
    showResult(`Error: ${err.message}`);
  }
}

async function placeBinanceMarket(id) {
  const marginInput = document.querySelector(`.open-margin-input[data-id="${id}"]`);
  const marginUsdt = (marginInput?.value ? Number(marginInput.value) : null) || 2;
  if (!confirm(`Place real Binance MARKET order — $${marginUsdt} margin?`)) return;
  try {
    const data = await api('/api/paper-trades/place-binance', {
      method: 'POST',
      body: JSON.stringify({ id, marginUsdt }),
    });
    showResult(JSON.stringify(data, null, 2));
    await loadTrades();
  } catch (err) {
    alert(`❌ ${err.message}`);
    showResult(`Error: ${err.message}`);
  }
}

async function deleteTrade(id) {
  if (!confirm('Delete this paper trade from JSON?')) return;
  try {
    await api('/api/paper-trades/delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    await loadTrades();
  } catch (err) {
    showResult(`Error: ${err.message}`);
  }
}

function renderSummary(summary) {
  els.openCount.textContent = `${summary.open ?? 0} / ${summary.entryReady ?? 0} / ${summary.pending ?? 0}`;
  els.unrealizedPnl.textContent = fmt(summary.unrealizedPnl, 4);
  els.unrealizedPnl.className = clsPnl(summary.unrealizedPnl);
  els.realizedPnl.textContent = fmt(summary.realizedPnl, 4);
  els.realizedPnl.className = clsPnl(summary.realizedPnl);
  els.winRate.textContent = `${fmt(summary.winRate, 1)}%`;
  els.closedCount.textContent = `${summary.closed ?? 0} closed`;
}

function renderTrendCell(symbol) {
  const trend = topTraderTrends[symbol];
  const label = trend ? escapeHtml(trend.label ?? '') : '—';
  const color = trend?.direction === 'long' ? 'var(--green)' : trend?.direction === 'short' ? 'var(--red)' : 'var(--muted)';
  return `<td style="font-size:11px;white-space:normal;max-width:300px">
    <span style="color:${color}">${label}</span>
    <button data-refresh-trend="${escapeHtml(symbol)}" style="margin-left:8px;background:var(--panel-2);border:1px solid var(--line);border-radius:5px;color:var(--text);font-size:13px;padding:4px 10px;cursor:pointer;min-width:36px;line-height:1">↺</button>
  </td>`;
}

function signalTypeFromTrade(t) {
  const note = String(t.note ?? '').trim();
  if (note.startsWith('EMA_PB')) return 'EMA_PB';
  if (note.startsWith('EARLY_DUMP')) return 'EARLY_DUMP';
  if (note.startsWith('EARLY_PUMP')) return 'EARLY_PUMP';
  if (note.startsWith('EARLY')) return 'EARLY';
  if (note.startsWith('DUMP')) return 'DUMP';
  if (note.startsWith('BC ')) return 'BC';
  if (note.startsWith('SC ')) return 'SC';
  if (note.startsWith('Flush ')) return 'FLUSH_REV';
  if (note.startsWith('sweepProb=')) return 'LIQ_SWEEP';
  if (note.startsWith('Spike ')) return 'SPIKE';
  return '';
}

function renderNoteCell(t) {
  const type = signalTypeFromTrade(t);
  const note = escapeHtml(t.note ?? '');
  const badge = type
    ? `<span class="signal-badge signal-${type.toLowerCase().replaceAll('_', '-')}">${escapeHtml(type)}</span>`
    : '';
  return `<td class="note-cell">${badge}<span>${note}</span></td>`;
}

function renderOpen(trades) {
  const open = sortTrades(trades.filter((t) => ['OPEN', 'ENTRY_READY', 'PENDING'].includes(t.status)), 'open');
  if (!open.length) {
    els.openBody.innerHTML = '<tr><td colspan="14" class="empty-cell">No open paper trades.</td></tr>';
    return;
  }
  // Giữ lại giá trị đang nhập trong margin inputs trước khi re-render
  const savedMargins = {};
  document.querySelectorAll('.open-margin-input').forEach((el) => {
    if (el.value) savedMargins[el.dataset.id] = el.value;
  });
  els.openBody.innerHTML = open.map((t) => `
    <tr>
      <td style="white-space:nowrap">
        ${t.status === 'OPEN' || t.status === 'ENTRY_READY' ? `<input type="number" class="open-margin-input" data-id="${t.id}" min="1" max="100" step="1" style="width:60px;height:28px;padding:0 4px;font-size:12px;background:var(--panel-2);border:1px solid var(--line);border-radius:4px;color:var(--text)" placeholder="2">` : ''}
        ${t.status === 'OPEN' ? `<button class="action-btn market-btn" data-open-binance="${t.id}">Open Binance</button>` : ''}
        ${t.status === 'ENTRY_READY' ? `<button class="action-btn market-btn" data-market="${t.id}">Market</button>` : ''}
        ${t.status === 'OPEN' ? `<button class="action-btn close-btn" data-close="${t.id}">Close</button>` : ''}
        <button class="action-btn cancel-btn" data-delete="${t.id}">Delete</button>
      </td>
      <td><a href="/?symbol=${encodeURIComponent(t.symbol)}" style="color:var(--text);text-decoration:none;font-weight:700">${t.symbol}</a></td>
      <td class="paper-side ${t.side === 'LONG' ? 'paper-long' : 'paper-short'}">${t.side}</td>
      <td>${t.status}</td>
      <td>${fmt(t.marginUsdt, 4)}</td>
      <td>${fmt(t.leverage, 0)}x</td>
      <td>${fmt(t.entryPrice)}</td>
      <td>${fmt(t.markPrice)}</td>
      <td>${fmt(t.quantity, 6)}</td>
      <td class="${clsPnl(t.pnl)}">${fmt(t.pnl, 4)}</td>
      <td class="${clsPnl(t.roe)}">${fmt(t.roe, 2)}%</td>
      <td>${fmtTime(t.openedAt ?? t.createdAt)}</td>
      ${renderTrendCell(t.symbol)}
      ${renderNoteCell(t)}
    </tr>
  `).join('');
  // Restore giá trị đã nhập
  document.querySelectorAll('.open-margin-input').forEach((el) => {
    if (savedMargins[el.dataset.id]) el.value = savedMargins[el.dataset.id];
  });
}

function renderClosed(trades) {
  const closed = sortTrades(trades.filter((t) => t.status === 'CLOSED'), 'closed');
  if (!closed.length) {
    els.closedBody.innerHTML = '<tr><td colspan="12" class="empty-cell">No closed paper trades.</td></tr>';
    return;
  }
  els.closedBody.innerHTML = closed.map((t) => `
    <tr>
      <td><a href="/?symbol=${encodeURIComponent(t.symbol)}" style="color:var(--text);text-decoration:none;font-weight:700">${t.symbol}</a></td>
      <td class="paper-side ${t.side === 'LONG' ? 'paper-long' : 'paper-short'}">${t.side}</td>
      <td>${fmt(t.marginUsdt, 4)}</td>
      <td>${fmt(t.leverage, 0)}x</td>
      <td>${fmt(t.entryPrice)}</td>
      <td>${fmt(t.exitPrice)}</td>
      <td class="${clsPnl(t.pnl)}">${fmt(t.pnl, 4)}</td>
      <td class="${clsPnl(t.roe)}">${fmt(t.roe, 2)}%</td>
      <td>${fmtTime(t.openedAt)}</td>
      <td>${fmtTime(t.closedAt)}</td>
      ${renderNoteCell(t)}
      <td><button class="action-btn cancel-btn" data-delete="${t.id}">Delete</button></td>
    </tr>
  `).join('');
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

let lastTrendFetch = 0;

async function loadTrades() {
  els.status.textContent = 'Loading...';
  try {
    const data = await api('/api/paper-trades');
    const trades = data.trades ?? [];

    // Refresh top trader trends mỗi 30s
    const now = Date.now();
    if (now - lastTrendFetch > 30_000) {
      lastTrendFetch = now;
      const openSymbols = [...new Set(
        trades.filter((t) => ['OPEN', 'ENTRY_READY', 'PENDING'].includes(t.status)).map((t) => t.symbol)
      )];
      loadTopTraderTrends(openSymbols).then(() => renderOpen(trades));
    }

    renderSummary(data.summary ?? {});
    renderOpen(trades);
    renderClosed(trades);
    updateSortHeaders();
    els.status.textContent = 'Ready';
    els.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString('vi-VN', { hour12: false })}`;
  } catch (err) {
    els.status.textContent = 'Error';
    showResult(`Error: ${err.message}`);
  }
}

els.longBtn.addEventListener('click', () => openTrade('LONG'));
els.shortBtn.addEventListener('click', () => openTrade('SHORT'));
document.addEventListener('click', (event) => {
  const sortKey = event.target?.dataset?.sortKey;
  const sortTable = event.target?.dataset?.sortTable;
  if (sortKey && sortTable && sortState[sortTable]) {
    const state = sortState[sortTable];
    if (state.key === sortKey) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else {
      state.key = sortKey;
      state.dir = ['symbol', 'side', 'status', 'note'].includes(sortKey) ? 'asc' : 'desc';
    }
    loadTrades();
    return;
  }
  const refreshTrend = event.target?.dataset?.refreshTrend;
  if (refreshTrend) {
    const btn = event.target;
    btn.textContent = '⏳';
    btn.disabled = true;
    loadTopTraderTrends([refreshTrend]).then(() => loadTrades());
    return;
  }
  const closeId = event.target?.dataset?.close;
  const marketId = event.target?.dataset?.market;
  const openBinanceId = event.target?.dataset?.openBinance;
  const deleteId = event.target?.dataset?.delete;
  if (marketId) placeBinanceMarket(marketId);
  if (openBinanceId) placeBinanceMarket(openBinanceId);
  if (closeId) closeTrade(closeId);
  if (deleteId) deleteTrade(deleteId);
});

loadTrades();
setInterval(loadTrades, 3000);
