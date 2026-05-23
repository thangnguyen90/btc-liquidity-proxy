const SSE_URL = '/api/pump-stream';

const pumpAutoOrderChk     = document.getElementById('pumpAutoOrderChk');
const maxLimitOrdersInput  = document.getElementById('maxLimitOrdersInput');
const maxPositionsInput    = document.getElementById('maxPositionsInput');
const saveMaxOrdersBtn     = document.getElementById('saveMaxOrdersBtn');
const saveMaxOrdersStatus  = document.getElementById('saveMaxOrdersStatus');

(async () => {
  try {
    const res = await fetch('/api/pump-auto-order-enabled');
    if (res.ok) { const { enabled } = await res.json(); pumpAutoOrderChk.checked = !!enabled; }
  } catch {}
})();

(async () => {
  try {
    const res = await fetch('/api/pump-max-orders');
    if (res.ok) {
      const { maxLimitOrders, maxPositions } = await res.json();
      maxLimitOrdersInput.value = maxLimitOrders;
      maxPositionsInput.value   = maxPositions;
    }
  } catch {}
})();

saveMaxOrdersBtn.addEventListener('click', async () => {
  const maxLimitOrders = Number(maxLimitOrdersInput.value);
  const maxPositions   = Number(maxPositionsInput.value);
  if (!Number.isFinite(maxLimitOrders) || maxLimitOrders < 1) { maxLimitOrdersInput.focus(); return; }
  if (!Number.isFinite(maxPositions)   || maxPositions < 0)   { maxPositionsInput.focus();   return; }
  try {
    saveMaxOrdersBtn.disabled = true;
    const res = await fetch('/api/pump-max-orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ maxLimitOrders, maxPositions }),
    });
    if (res.ok) {
      saveMaxOrdersStatus.textContent = '✓ Đã lưu';
      setTimeout(() => { saveMaxOrdersStatus.textContent = ''; }, 2500);
    }
  } catch {
    saveMaxOrdersStatus.style.color = 'var(--red)';
    saveMaxOrdersStatus.textContent = 'Lỗi';
    setTimeout(() => { saveMaxOrdersStatus.textContent = ''; saveMaxOrdersStatus.style.color = 'var(--green)'; }, 2500);
  } finally {
    saveMaxOrdersBtn.disabled = false;
  }
});

pumpAutoOrderChk.addEventListener('change', async () => {
  try {
    await fetch('/api/pump-auto-order-enabled', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: pumpAutoOrderChk.checked }),
    });
  } catch { pumpAutoOrderChk.checked = !pumpAutoOrderChk.checked; }
});

let allSignals = [];
let scannedAt  = null;
let total      = 0;

const grid        = document.getElementById('pumpGrid');
const longCount   = document.getElementById('longCount');
const shortCount  = document.getElementById('shortCount');
const totalScanned= document.getElementById('totalScanned');
const lastScan    = document.getElementById('lastScan');
const nextRefresh = document.getElementById('nextRefresh');
const scanStatus  = document.getElementById('scanStatus');
const scanMeta    = document.getElementById('scanMeta');
const metaTotal   = document.getElementById('metaTotal');
const metaSignals = document.getElementById('metaSignals');
const metaTime    = document.getElementById('metaTime');
const visibleCount= document.getElementById('visibleCount');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const actionFilter= document.getElementById('actionFilter');
const typeFilter  = document.getElementById('typeFilter');
const scoreFilter = document.getElementById('scoreFilter');

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '-';
  if (p >= 10000) return p.toLocaleString('en', { maximumFractionDigits: 1 });
  if (p >= 1000)  return p.toLocaleString('en', { maximumFractionDigits: 2 });
  if (p >= 100)   return p.toFixed(3);
  if (p >= 1)     return p.toFixed(4);
  if (p >= 0.01)  return p.toFixed(5);
  return p.toFixed(6);
}

function fmtPct(v, digits = 2) {
  if (v == null || isNaN(v)) return '-';
  return (v >= 0 ? '+' : '') + Number(v).toFixed(digits) + '%';
}

function timeAgo(ts) {
  if (!ts) return '-';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// ── Signal type labels ────────────────────────────────────────────────────────

const TYPE_LABELS = {
  pump_breakout: 'Pump Breakout',
  early_pump:    'Early Pump',
  ema_pullback:  'EMA Pullback',
  dist_top:      'Distribution Top',
  vol_climax:    'Vol Climax',
  climax_top:    'Climax Top',
  fade_short:    'Fade Short',
  early_dump:    'Early Dump',
  dump:          'Sustained Dump',
  unknown:       'Unknown',
};

// ── Factor chip builder ───────────────────────────────────────────────────────

function buildFactors(sig) {
  const f = sig.factors || {};
  const chips = [];

  if (sig.action === 'LONG') {
    const ribbonOk = f.emaRibbon >= 0.8;
    chips.push({ label: ribbonOk ? 'EMA ✓' : 'EMA ✗', ok: ribbonOk ? 'ok' : 'warn' });
  } else {
    const bearOk = (f.emaBear ?? f.emaRibbon) >= 0.7;
    chips.push({ label: bearOk ? 'Bear EMA ✓' : 'Bear EMA ✗', ok: bearOk ? 'ok' : '' });
  }

  const rsiVal = f.rsi14val;
  if (rsiVal != null) {
    const rsiOk = sig.action === 'LONG' ? rsiVal >= 55 : rsiVal <= 50;
    chips.push({ label: `RSI ${rsiVal}`, ok: rsiOk ? 'ok' : 'warn' });
  }

  const vol = f.volRatio ?? f.volume;
  if (vol != null) {
    const volOk = vol >= 1.8;
    chips.push({ label: `Vol ${Number(vol).toFixed(1)}×`, ok: volOk ? 'ok' : '' });
  }

  if (f.squeeze != null) {
    const sqOk = f.squeeze >= 0.5;
    chips.push({ label: sqOk ? 'Squeeze ✓' : 'No Squeeze', ok: sqOk ? 'ok' : '' });
  }

  if (f.regime != null) {
    chips.push({ label: f.regime ? 'Regime ✓' : 'Regime ✗', ok: f.regime ? 'ok' : 'warn' });
  }

  if (f.trigger) {
    const t = f.trigger === 'WICK_REJECT_BB_UPPER' ? 'Wick Reject' : 'Breakout Fade';
    chips.push({ label: t, ok: 'ok' });
  }

  if (f.consec != null) {
    chips.push({ label: `${f.consec} nến đỏ`, ok: 'ok' });
  }
  if (f.movePct != null) {
    chips.push({ label: `−${Math.abs(f.movePct).toFixed(2)}%`, ok: f.movePct >= 1.5 ? 'ok' : '' });
  }

  if (f.qPenalty != null && f.qPenalty > 0.05) {
    chips.push({ label: `Penalty −${(f.qPenalty * 100).toFixed(0)}pt`, ok: 'warn' });
  }

  if (f.chasePct != null && f.chasePct > 0.1) {
    const pct = Math.round(f.chasePct * 100);
    chips.push({ label: `Chase ${pct}%`, ok: pct >= 40 ? 'warn' : '' });
  }

  if (sig.marketOk === false) {
    chips.push({ label: 'Too far EMA', ok: 'warn' });
  }

  return chips.map((c) => `<span class="pump-factor ${c.ok}">${c.label}</span>`).join('');
}

// ── Open orders tracking (để hiển thị "Đã có lệnh") ─────────────────────────

let openLimitSymbols = new Set(); // symbols đang có LIMIT pending hoặc position đang mở

async function loadOpenLimitOrders() {
  const token = localStorage.getItem('orders_token') ?? '';
  if (!token) return;
  try {
    const [ordersRes, posRes] = await Promise.all([
      fetch('/api/open-orders',  { headers: { 'x-orders-token': token } }),
      fetch('/api/positions',    { headers: { 'x-orders-token': token } }),
    ]);
    const next = new Set();
    if (ordersRes.ok) {
      const orders = await ordersRes.json();
      const arr = Array.isArray(orders) ? orders : (orders.orders ?? []);
      arr.filter((o) => String(o.type ?? '').toUpperCase() === 'LIMIT' && !o.reduceOnly)
         .forEach((o) => next.add(o.symbol));
    }
    if (posRes.ok) {
      const positions = await posRes.json();
      const arr = Array.isArray(positions) ? positions : (positions.positions ?? []);
      arr.filter((p) => Number(p.positionAmt ?? 0) !== 0)
         .forEach((p) => next.add(p.symbol));
    }
    openLimitSymbols = next;
    render();
  } catch {}
}

// ── Manual order placement ────────────────────────────────────────────────────

window.placePumpOrder = async function (btn, symbol, action, entry, sl, tp, score, type) {
  const row = btn.closest('.pump-order-row');
  const input = row?.querySelector('.pump-order-margin');
  const margin = Number(input?.value ?? 5);
  if (!margin || margin <= 0) { btn.textContent = 'Nhập margin!'; return; }

  const token = localStorage.getItem('orders_token') ?? '';
  if (!token) {
    btn.classList.add('error');
    btn.textContent = 'Chưa đăng nhập';
    setTimeout(() => { btn.classList.remove('error'); btn.textContent = `📥 ${margin}$ LIMIT`; }, 3000);
    return;
  }

  btn.disabled = true;
  btn.classList.add('loading');
  btn.textContent = 'Đang đặt...';

  try {
    const res = await fetch('/api/pump-manual-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-orders-token': token },
      body: JSON.stringify({ symbol, action, entry, sl, tp, score, margin, type }),
    });
    const data = await res.json();
    if (data.ok) {
      btn.classList.remove('loading');
      btn.classList.add('success');
      btn.textContent = data.marketFilled ? `⚡ MKT #${data.orderId}` : `✅ #${data.orderId}`;
      if (input) input.disabled = true;
      openLimitSymbols.add(symbol);
      // Thêm badge "Đã có lệnh" ngay bên cạnh nếu chưa có
      const row = btn.closest('.pump-order-row');
      if (row && !row.querySelector('.pump-order-exists')) {
        const badge = document.createElement('span');
        badge.className = 'pump-order-exists';
        badge.textContent = '✓ Đã có lệnh';
        row.appendChild(badge);
      }
    } else {
      throw new Error(data.error ?? 'Lỗi không xác định');
    }
  } catch (e) {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.classList.add('error');
    btn.textContent = e.message.length > 30 ? e.message.slice(0, 30) + '…' : e.message;
    setTimeout(() => {
      btn.classList.remove('error');
      btn.textContent = `📥 ${margin}$ LIMIT`;
    }, 4000);
  }
};

// ── Card builder ──────────────────────────────────────────────────────────────

function isAutoEligible(sig) {
  if (sig.score < 80) return false;
  if (sig.marketOk === false) return false;
  if ((sig.factors?.emaRibbon ?? 1) === 0) return false;
  if ((sig.factors?.chasePct ?? 0) > 0.30) return false;
  return true;
}

function entryBadge(sig) {
  const chase = sig.factors?.chasePct ?? 0;
  const score = sig.score;
  if (chase > 0.45 || score < 55)
    return { label: '🚫 Đã trễ — chờ pullback', cls: 'entry-badge bad' };
  if (chase > 0.30 || score < 70)
    return { label: '⚠ Cân nhắc — chase cao', cls: 'entry-badge warn' };
  return { label: '✅ Có thể vào', cls: 'entry-badge good' };
}

function buildCard(sig) {
  const isLong      = sig.action === 'LONG';
  const dirClass    = isLong ? 'long' : 'short';
  const dirIcon     = isLong ? '🟢' : '🔴';
  const dirLabel    = isLong ? 'LONG' : 'SHORT';
  const changeClass = (sig.change24h ?? 0) >= 0 ? 'positive' : 'negative';
  const gradeClass  = `grade-${(sig.grade || 'd').toLowerCase()}`;
  const typeLabel   = TYPE_LABELS[sig.type] ?? sig.type;
  const typeExtra   = (sig.type === 'dist_top' || sig.type === 'vol_climax') ? ' type-danger' : '';
  const detailUrl   = `/?symbol=${sig.symbol}`;
  const slColor     = isLong ? 'negative' : 'positive';
  const tpColor     = isLong ? 'positive' : 'negative';
  const factors     = buildFactors(sig);
  const marketWarn  = sig.marketOk === false
    ? `<span class="pump-market-warn">⚠ Too far from EMA — wait pullback</span>`
    : '';

  const autoDot = isAutoEligible(sig)
    ? `<span class="auto-dot ${dirClass}" title="Đủ điều kiện Auto LIMIT ≥85"></span>`
    : '';

  const badge = entryBadge(sig);
  const badgeHtml = badge ? `<div class="${badge.cls}">${badge.label}</div>` : '';

  return `
    <article class="pump-card ${dirClass}">
      ${autoDot}
      <div class="pump-card-top">
        <div class="pump-symbol-wrap">
          <a class="pump-symbol" href="${detailUrl}" target="_blank">
            ${sig.symbol.replace(/USDT$/, '')}<span class="sym-usdt">USDT</span>
          </a>
          <span class="pump-change ${changeClass}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="pump-right">
          <span class="pump-action-badge ${dirClass}">${dirIcon} ${dirLabel}</span>
          <div class="pump-score-wrap">
            <span class="pump-score-num">${sig.score}</span>
            <span class="pump-grade ${gradeClass}">${sig.grade}</span>
          </div>
          <span class="pump-type-badge${typeExtra}">${typeLabel}</span>
        </div>
      </div>

      <div class="pump-prices">
        <div class="pump-price-cell">
          <span>Entry</span>
          <strong>${fmtPrice(sig.entry)}</strong>
        </div>
        <div class="pump-price-cell">
          <span>SL</span>
          <strong class="${slColor}">${fmtPrice(sig.sl)}</strong>
        </div>
        <div class="pump-price-cell">
          <span>TP</span>
          <strong class="${tpColor}">${fmtPrice(sig.tp)}</strong>
        </div>
      </div>

      <div class="pump-factors">${factors}</div>
      ${marketWarn}
      ${badgeHtml}
      <div class="pump-note">${sig.note || ''}</div>
      <div class="pump-order-row">
        <input class="pump-order-margin" type="number" value="5" min="1" max="10000" step="1" title="Margin (USDT)">
        <span class="pump-order-label">$</span>
        <button class="pump-order-btn ${dirClass}" onclick="placePumpOrder(this,'${sig.symbol}','${sig.action}',${sig.entry},${sig.sl ?? 'null'},${sig.tp ?? 'null'},${sig.score},'${sig.type ?? ''}')">📥 LIMIT</button>
        ${openLimitSymbols.has(sig.symbol) ? '<span class="pump-order-exists">✓ Đã có lệnh</span>' : ''}
      </div>
      <div class="pump-footer">
        <span>${timeAgo(sig.scannedAt)}</span>
        <span>${sig.blockShort ? '🔒 blocks short' : ''}</span>
      </div>
    </article>
  `;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const search   = searchInput.value.trim().toUpperCase();
  const action   = actionFilter.value;
  const type     = typeFilter.value;
  const minScore = Number(scoreFilter.value);

  let rows = allSignals.slice();
  if (search)           rows = rows.filter((s) => s.symbol.includes(search));
  if (action !== 'all') rows = rows.filter((s) => s.action === action);
  if (type   !== 'all') rows = rows.filter((s) => s.type   === type);
  if (minScore > 0)     rows = rows.filter((s) => s.score  >= minScore);

  visibleCount.textContent = rows.length;

  const longs  = allSignals.filter((s) => s.action === 'LONG').length;
  const shorts = allSignals.filter((s) => s.action === 'SHORT').length;
  longCount.textContent    = longs;
  shortCount.textContent   = shorts;
  totalScanned.textContent = total || '-';
  longCount.className  = longs  > 0 ? 'positive' : '';
  shortCount.className = shorts > 0 ? 'negative' : '';

  if (scannedAt) {
    lastScan.textContent = new Date(scannedAt).toLocaleTimeString('vi');
    metaTime.textContent = new Date(scannedAt).toLocaleTimeString('vi');
  }

  if (rows.length === 0) {
    const isEmpty = allSignals.length === 0;
    const isWarm  = total > 0;
    grid.innerHTML = `
      <div class="pump-empty">
        <strong>${isEmpty ? (isWarm ? 'Không có signal' : 'Đang warm cache...') : 'Không có kết quả'}</strong>
        ${isEmpty
          ? (isWarm
              ? 'Không có coin nào vượt ngưỡng lúc này. Thị trường đang sideway.'
              : 'Kline cache đang được tải. Tự động cập nhật khi xong (~30-60s).')
          : 'Thử bỏ bộ lọc hoặc hạ min score.'
        }
      </div>`;
    return;
  }

  grid.innerHTML = rows.map(buildCard).join('');
}

// ── Apply new data from SSE push ──────────────────────────────────────────────

function applyData(data) {
  allSignals = data.signals ?? [];
  scannedAt  = data.scannedAt;
  total      = data.total ?? 0;
  const processed = data.processed ?? 0;
  const cs        = data.cacheStats  ?? {};
  const staleSec  = cs.staleSec ?? null;
  const isStale   = cs.isStale  ?? false;

  scanMeta.style.display  = '';
  metaTotal.textContent   = processed > 0 ? `${processed}/${total}` : total;
  metaSignals.textContent = allSignals.length;

  scanStatus.textContent = allSignals.length > 0
    ? `${allSignals.length} signals · ${new Date().toLocaleTimeString('vi')}`
    : `No signals · ${new Date().toLocaleTimeString('vi')}`;

  // Stale warning
  let staleEl = document.getElementById('staleWarn');
  if (isStale || (staleSec != null && staleSec > 90)) {
    if (!staleEl) {
      staleEl = document.createElement('div');
      staleEl.id = 'staleWarn';
      staleEl.style.cssText = 'background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);border-radius:6px;padding:8px 14px;font-size:12px;color:#fbbf24;margin-top:8px';
      scanMeta.insertAdjacentElement('afterend', staleEl);
    }
    const isBlocked = staleSec === null;
    staleEl.style.cssText = isBlocked
      ? 'background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);border-radius:6px;padding:8px 14px;font-size:12px;color:#f87171;margin-top:8px'
      : 'background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);border-radius:6px;padding:8px 14px;font-size:12px;color:#fbbf24;margin-top:8px';
    staleEl.textContent = isBlocked
      ? '🚫 Binance IP bị block — kline WebSocket không nhận được tick nào. Đổi IP hoặc chờ vài phút.'
      : `⚠ Kline data stale — last tick ${staleSec}s ago. WebSocket đang reconnect.`;
  } else if (staleEl) {
    staleEl.remove();
  }

  render();
}

// ── SSE connection ────────────────────────────────────────────────────────────

function connect() {
  const es = new EventSource(SSE_URL);

  es.onopen = () => {
    scanStatus.textContent = '● Live';
    scanStatus.style.color = 'var(--green)';
    nextRefresh.textContent = 'Cập nhật mỗi nến 15m';
  };

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      // Không ghi đè data tốt bằng data trống từ SSE
      if ((data.signals ?? []).length === 0 && allSignals.length > 0) return;
      applyData(data);
    } catch {}
  };

  es.onerror = () => {
    scanStatus.textContent = 'Reconnecting...';
    scanStatus.style.color = 'var(--amber)';
    nextRefresh.textContent = '';
    // EventSource reconnects automatically; no manual retry needed
  };
}

// ── Events ────────────────────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  searchClear.style.display = searchInput.value ? '' : 'none';
  render();
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  render();
});
actionFilter.addEventListener('change', render);
typeFilter.addEventListener('change', render);
scoreFilter.addEventListener('change', render);

// ── Boot ──────────────────────────────────────────────────────────────────────

// Load data qua REST; nếu cache chưa warm (processed=0) thì retry với backoff
async function fetchAndApply(attempt = 0) {
  try {
    scanStatus.textContent = attempt === 0 ? 'Đang tải...' : `Warming cache... (${attempt})`;
    const res = await fetch('/api/pump-signals');
    if (res.ok) {
      const data = await res.json();
      applyData(data);
      if ((data.processed ?? 0) === 0 && attempt < 12) {
        // Cache chưa warm — retry với backoff (5s, 8s, 12s, 18s, ...)
        const delay = Math.min(5000 + attempt * 3000, 20000);
        setTimeout(() => fetchAndApply(attempt + 1), delay);
      }
    }
  } catch {}
}

(async () => {
  await fetchAndApply();
  connect();
  await loadOpenLimitOrders();
  setInterval(loadOpenLimitOrders, 30_000);
})();
