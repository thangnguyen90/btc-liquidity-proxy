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
  if (!res.ok) throw new Error(data.error ?? 'Login failed.');
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
    return false;
  }
}

function showApp() {
  authOverlay.style.display = 'none';
  mainContent.style.display = '';
  loadSettings();
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
  setInterval(refresh, 15000);
  setInterval(() => loadPositions(), 3000);
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

function symLink(symbol) {
  return `<a href="/?symbol=${symbol}" target="_blank" class="sym-link">${symbol}</a>`;
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

function showAction(text) {
  actionResult.style.display = 'block';
  actionResult.textContent = text;
}

async function apiFetch(url, opts = {}) {
  const headers = { 'x-orders-token': getToken(), ...(opts.headers ?? {}) };
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json();
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    // Try silent re-auth with stored credentials before showing overlay
    const ok = await tryAutoReauth();
    if (ok) {
      // Retry the original request with new token
      const headers2 = { 'x-orders-token': getToken(), ...(opts.headers ?? {}) };
      const res2 = await fetch(url, { ...opts, headers: headers2 });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2.error ?? `HTTP ${res2.status}`);
      return data2;
    }
    showAuthOverlay();
    throw new Error('Session expired. Vui lòng đăng nhập lại.');
  }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

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

// ── Mark price WebSocket ──────────────────────────────────────
const posStatic = new Map(); // symbol → { amt, entry, margin, lev }
let markWs = null;
let markWsReconnectTimer = null;

// Avg-down state: symbol → entryPrice when triggered (cleared when position closes)
const avgDownTriggered = new Map();
let avgDownEnabled = false;
let avgDownTriggerRoe = -60;
let avgDownMarginUsdt = 2;

function startMarkPriceWs(symbols) {
  if (markWs) { markWs.close(); markWs = null; }
  if (markWsReconnectTimer) { clearTimeout(markWsReconnectTimer); markWsReconnectTimer = null; }
  if (!symbols.length) return;

  const streams = symbols.map((s) => `${s.toLowerCase()}@markPrice@1s`).join('/');
  markWs = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);

  markWs.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    const d = msg.data ?? msg;
    if (d.e !== 'markPriceUpdate') return;
    const mark = Number(d.p);
    const sym = d.s;
    const st = posStatic.get(sym);
    if (!st) return;

    const upnl = (mark - st.entry) * st.amt; // works for long (amt>0) and short (amt<0)
    const roe = st.margin > 0 ? (upnl / st.margin) * 100 : 0;

    // Avg-down: trigger when ROE ≤ threshold and not yet triggered for this entry price
    if (avgDownEnabled && roe <= avgDownTriggerRoe) {
      const prevEntry = avgDownTriggered.get(sym);
      const isSamePosition = prevEntry !== undefined && Math.abs(prevEntry - st.entry) / st.entry < 0.01;
      if (!isSamePosition) {
        avgDownTriggered.set(sym, st.entry);
        const side = st.amt > 0 ? 'BUY' : 'SELL';
        const notionalUsdt = avgDownMarginUsdt * st.lev;
        console.log(`[AvgDown] ${sym} ROE=${roe.toFixed(1)}% → avg down $${avgDownMarginUsdt} ${side}`);
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
      if (row.cells[0]?.textContent?.trim() !== sym) continue;
      // col 4: mark price
      row.cells[4].textContent = fmt(mark, 4);
      row.cells[4].dataset.v = mark;
      // col 8: unrealised pnl
      row.cells[8].className = pnlClass(upnl);
      row.cells[8].textContent = `${upnl >= 0 ? '+' : ''}${fmt(upnl, 4)}`;
      row.cells[8].dataset.v = upnl;
      // col 9: roe
      row.cells[9].className = pnlClass(roe);
      row.cells[9].textContent = `${roe >= 0 ? '+' : ''}${fmt(roe, 2)}%`;
      row.cells[9].dataset.v = roe;
      break;
    }
  };

  const note = document.getElementById('positionsNote');
  markWs.onopen = () => { if (note) note.innerHTML = `<span class="live-dot"></span>Live · ${symbols.length} symbol${symbols.length > 1 ? 's' : ''}`; };
  markWs.onerror = () => markWs?.close();
  markWs.onclose = () => {
    markWs = null;
    if (note) note.textContent = 'Reconnecting...';
    if (posStatic.size > 0) {
      markWsReconnectTimer = setTimeout(() => startMarkPriceWs([...posStatic.keys()]), 5000);
    }
  };
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
    const margin = Number(p.isolatedMargin) || Number(p.initialMargin) || null;
    const roe = entry > 0 ? ((upnl / (Math.abs(amt) * entry / lev)) * 100) : 0;
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
      const margin = Number(p.isolatedMargin) || Number(p.initialMargin) || (Math.abs(amt) * entry / lev);
      posStatic.set(p.symbol, { amt, entry, margin, lev });
    });

    if (!symbolsChanged) {
      // In-place update: only patch static cells; WebSocket keeps mark/pnl/roe live
      for (const p of rows) {
        const row = positionsBody.querySelector(`tr[data-sym="${p.symbol}"]`);
        if (!row) continue;
        const entry = Number(p.entryPrice);
        const liq = Number(p.liquidationPrice);
        const margin = Number(p.isolatedMargin) || Number(p.initialMargin) || null;
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
      const margin = Number(p.isolatedMargin) || Number(p.initialMargin) || (Math.abs(amt) * entry / lev);
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
    await Promise.all([loadDailyPnl(), loadBalance(), loadPositions(), loadOpenOrders(), loadTsl(), loadSlTp()]);
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
