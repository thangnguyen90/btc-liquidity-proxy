const SSE_URL = '/api/pump-stream';

const pumpAutoOrderChk      = document.getElementById('pumpAutoOrderChk');
const maxLimitOrdersInput   = document.getElementById('maxLimitOrdersInput');
const maxPositionsInput     = document.getElementById('maxPositionsInput');
const saveMaxOrdersBtn      = document.getElementById('saveMaxOrdersBtn');
const saveMaxOrdersStatus   = document.getElementById('saveMaxOrdersStatus');
const pumpPaperTimeoutInput = document.getElementById('pumpPaperTimeoutInput');
const savePaperTimeoutBtn   = document.getElementById('savePaperTimeoutBtn');
const savePaperTimeoutStatus= document.getElementById('savePaperTimeoutStatus');

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

(async () => {
  try {
    const res = await fetch('/api/pump-paper-timeout');
    if (res.ok) { const { timeoutH } = await res.json(); pumpPaperTimeoutInput.value = timeoutH; }
  } catch {}
})();

savePaperTimeoutBtn.addEventListener('click', async () => {
  const h = Number(pumpPaperTimeoutInput.value);
  if (!Number.isFinite(h) || h < 0.5) { pumpPaperTimeoutInput.focus(); return; }
  try {
    savePaperTimeoutBtn.disabled = true;
    const res = await fetch('/api/pump-paper-timeout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timeoutH: h }),
    });
    if (res.ok) {
      savePaperTimeoutStatus.textContent = '✓ Đã lưu';
      setTimeout(() => { savePaperTimeoutStatus.textContent = ''; }, 2500);
    }
  } catch {
    savePaperTimeoutStatus.style.color = 'var(--red)';
    savePaperTimeoutStatus.textContent = 'Lỗi';
    setTimeout(() => { savePaperTimeoutStatus.textContent = ''; savePaperTimeoutStatus.style.color = 'var(--green)'; }, 2500);
  } finally {
    savePaperTimeoutBtn.disabled = false;
  }
});

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
  ma60_volume_cluster: 'MA60 Vol Cluster',
  ma60_volume_cluster_5m: 'MA60 5m Cluster',
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

  if (sig.type === 'ma60_volume_cluster' || sig.type === 'ma60_volume_cluster_5m') {
    chips.push({ label: `${f.timeframe ?? '15m'} MA60 ${fmtPrice(f.ma60)}`, ok: 'orange' });
    if (f.clusterGainPct != null) chips.push({ label: `Cluster +${Number(f.clusterGainPct).toFixed(1)}%`, ok: 'orange' });
    if (f.breakoutPct != null) chips.push({ label: `Break +${Number(f.breakoutPct).toFixed(1)}%`, ok: 'ok' });
    if (f.volNowX != null) chips.push({ label: `Vol ${Number(f.volNowX).toFixed(1)}×`, ok: 'orange' });
    if (f.volRamp != null) chips.push({ label: `Ramp ${Number(f.volRamp).toFixed(2)}`, ok: Number(f.volRamp) >= 1.15 ? 'ok' : 'orange' });
    if (f.greenCandles != null && f.clusterBars != null) chips.push({ label: `${f.greenCandles}/${f.clusterBars} green`, ok: 'ok' });
    if (f.rsi14val != null) chips.push({ label: `RSI ${f.rsi14val}`, ok: f.rsi14val >= 55 && f.rsi14val <= 75 ? 'ok' : 'warn' });
    if (f.ema99 != null && f.ema99DistPct != null) {
      const d = Number(f.ema99DistPct);
      const sign = d >= 0 ? '+' : '';
      chips.push({ label: `EMA99 ${fmtPrice(f.ema99)} (${sign}${d.toFixed(1)}%)`, ok: Math.abs(d) <= 3 ? 'ok' : d > 0 ? 'orange' : 'warn' });
    }
    return chips.map((c) => `<span class="pump-factor ${c.ok}">${c.label}</span>`).join('');
  }

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
  const input = row?.querySelector('.pump-order-margin') ?? btn.closest('td')?.querySelector('input[type="number"]');
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
  if (sig.type === 'ma60_volume_cluster' || sig.type === 'ma60_volume_cluster_5m') return false;
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

function calcAutoLeverage(entry, sl, defaultLev = 10) {
  const e = Number(entry);
  const s = Number(sl);
  if (!e || !s || !Number.isFinite(e) || !Number.isFinite(s)) return defaultLev;
  return Math.abs(e - s) / e * 10 * 100 > 20 ? 5 : 10;
}

function buildCard(sig) {
  const autoLev = calcAutoLeverage(sig.entry, sig.sl);
  const levBadge = autoLev === 5
    ? '<span class="lev-badge warn" title="SL rộng — 5x">5×⚠</span>'
    : '<span class="lev-badge ok"   title="SL gần — 10x">10×</span>';
  const isLong      = sig.action === 'LONG';
  const isMa60      = sig.type === 'ma60_volume_cluster' || sig.type === 'ma60_volume_cluster_5m';
  const isPumpShortSweet = !isLong && Number(sig.score) >= 40 && Number(sig.score) <= 79;
  const dirClass    = isLong ? 'long' : 'short';
  const cardClass   = isMa60 ? `${dirClass} ma60-cluster` : (isPumpShortSweet ? `${dirClass} pump-short-sweet` : dirClass);
  const dirIcon     = isLong ? '🟢' : '🔴';
  const dirLabel    = isMa60 ? (sig.type === 'ma60_volume_cluster_5m' ? 'MA60 5M LONG' : 'MA60 LONG') : (isPumpShortSweet ? 'PUMP_SHORT EDGE' : (isLong ? 'LONG' : 'SHORT'));
  const changeClass = (sig.change24h ?? 0) >= 0 ? 'positive' : 'negative';
  const gradeClass  = `grade-${(sig.grade || 'd').toLowerCase()}`;
  const typeLabel   = TYPE_LABELS[sig.type] ?? sig.type;
  const typeExtra   = isMa60 ? ' type-ma60' : (isPumpShortSweet ? ' type-pump-short-sweet' : ((sig.type === 'dist_top' || sig.type === 'vol_climax') ? ' type-danger' : ''));
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
    <article class="pump-card ${cardClass}">
      ${autoDot}
      <div class="pump-card-top">
        <div class="pump-symbol-wrap">
          <a class="pump-symbol" href="${detailUrl}" target="_blank">
            ${sig.symbol.replace(/USDT$/, '')}<span class="sym-usdt">USDT</span>
          </a>
          <span class="pump-change ${changeClass}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="pump-right">
          <span class="pump-action-badge ${dirClass}${isMa60 ? ' ma60-cluster' : ''}${isPumpShortSweet ? ' pump-short-sweet' : ''}">${dirIcon} ${dirLabel}</span>
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
          <strong>${fmtPrice(sig.entry)} ${levBadge}</strong>
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
        <button style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:4px;border:1px solid var(--line);background:var(--panel-2);color:var(--muted);cursor:pointer;margin-left:4px" onclick="enterPumpPaperTrade(this,'${sig.symbol}','${sig.action}',${sig.entry},${sig.score},${sig.sl ?? 'null'},${sig.tp ?? 'null'})">+ Paper</button>
      </div>
      <div class="pump-footer">
        <span>${isMa60 && sig.scannedAt
          ? `🕐 ${new Date(sig.scannedAt).toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${timeAgo(sig.scannedAt)}`
          : timeAgo(sig.scannedAt)}</span>
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

// ── Pump paper trades ─────────────────────────────────────────────────────────

const pumpPaperBody  = document.getElementById('pumpPaperBody');
const pumpPaperCount = document.getElementById('pumpPaperCount');
const pumpPaperDateFromInput = document.getElementById('pumpPaperDateFrom');
const pumpPaperDateToInput = document.getElementById('pumpPaperDateTo');
const pumpPaperTodayButton = document.getElementById('pumpPaperTodayButton');
const pumpPaperAllDatesButton = document.getElementById('pumpPaperAllDatesButton');
const pumpPaperDateSearchButton = document.getElementById('pumpPaperDateSearchButton');
const pumpPaperDateStatus = document.getElementById('pumpPaperDateStatus');
const pumpComboStatsEl = document.getElementById('pumpComboStats');
const pumpPaperOverview = document.getElementById('pumpPaperOverview');
const pumpSourceStatsEl = document.getElementById('pumpSourceStats');
const pumpObservationL1El = document.getElementById('pumpObservationL1');
const pumpObservationL2El = document.getElementById('pumpObservationL2');
const pumpObservationL2bEl = document.getElementById('pumpObservationL2b');
const pumpObservationL2cEl = document.getElementById('pumpObservationL2c');
const pumpObservationL3El = document.getElementById('pumpObservationL3');
const pumpSourceLongCorrReboundStatsEl = document.getElementById('pumpSourceLongCorrReboundStats');
const pumpSupportEntryGroupsEl = document.getElementById('pumpSupportEntryGroups');
const pumpSupportEntryShortEl = document.getElementById('pumpSupportEntryShort');
const pumpSupportEntryLongEl = document.getElementById('pumpSupportEntryLong');
const pumpComboCycleStableEl = document.getElementById('pumpComboCycleStable');
const pumpComboCycleFormingEl = document.getElementById('pumpComboCycleForming');
const pumpComboCycleFormingRowsEl = document.getElementById('pumpComboCycleFormingRows');
const emaLayerAnalysisSectionEl = document.getElementById('emaLayerAnalysisSection');
const emaLayerAnalysisMetaEl = document.getElementById('emaLayerAnalysisMeta');
const emaLayerModelNoteEl = document.getElementById('emaLayerModelNote');
const emaLayer1StatsEl = document.getElementById('emaLayer1Stats');
const emaLayer2StatsEl = document.getElementById('emaLayer2Stats');
const emaLayer3StatsEl = document.getElementById('emaLayer3Stats');
const emaLayerCandidateRowsEl = document.getElementById('emaLayerCandidateRows');
const pumpCanonicalStatsEl = document.getElementById('pumpCanonicalStats');
const pumpEvalStatsEl = document.getElementById('pumpEvalStats');
const pumpStage2FilterEl = document.getElementById('pumpStage2Filter');
const pumpStage2StatsEl = document.getElementById('pumpStage2Stats');
const pumpLiftFilterEl = document.getElementById('pumpLiftFilter');
const pumpLiftStatsEl = document.getElementById('pumpLiftStats');
const pumpSelectorFilterEl = document.getElementById('pumpSelectorFilter');
const pumpSelectorStatsEl = document.getElementById('pumpSelectorStats');

let pumpPaperTradesCache  = [];
let pumpPaperSummaryCache = null;
let pumpPaperSort = { key: 'status', dir: 'asc' };
let pumpPaperPage = 1;
let pumpPaperLimit = 300;
let pumpPaperPagination = null;
let pumpPaperDateFrom = '';
let pumpPaperDateTo = '';
let pumpPaperDateMode = 'today';
let pumpPaperDraftDateFrom = '';
let pumpPaperDraftDateTo = '';
let pumpPaperDraftDateMode = 'today';
let pumpPaperDateDirty = false;
let pumpPaperKnownToday = '';
let pumpPaperDateRolloverTimer = null;
let pumpPaperComboStats = [];
let pumpSourceStats = [];
let pumpObservationStats = null;
let pumpSourceLongCorrReboundStats = [];
let pumpSupportEntryStats = null;
let pumpComboCycleStats = null;
let emaLayerAnalysis = null;
let pumpCanonicalStats = [];
let pumpCanonicalModel = null;
let pumpEvalStats = [];
let pumpStage2Filter = 'all';
let pumpStage2Stats = [];
let pumpLiftFilter = 'all';
let pumpLiftStats = [];
let pumpLiftModel = null;
let pumpSelectorFilter = 'all';
let pumpSelectorStats = [];
let pumpSelectorModel = null;

function normalizePumpComboPart(value, fallback = '-') {
  const text = String(value ?? fallback).trim();
  return (text || fallback)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || fallback;
}

function pumpSignalComboOf(sig = {}) {
  const side = normalizePumpComboPart(sig.action ?? sig.side, 'SIDE');
  const type = normalizePumpComboPart(sig.type ?? sig.pumpSignalType ?? sig.source, 'TYPE');
  const grade = normalizePumpComboPart(sig.grade ?? sig.pumpSignalGrade, 'GRADE');
  const score = Number(sig.score ?? sig.pumpScore);
  const scoreBucket = Number.isFinite(score)
    ? score >= 90 ? 'SCORE_90_PLUS'
      : score >= 80 ? 'SCORE_80_89'
        : score >= 70 ? 'SCORE_70_79'
          : score >= 60 ? 'SCORE_60_69'
            : 'SCORE_LT_60'
    : 'SCORE_NO_DATA';
  const f = sig.factors ?? sig.pumpSignalFactors ?? {};
  const vol = Number(f.volRatio ?? f.volume ?? f.volNowX);
  const volBucket = Number.isFinite(vol)
    ? vol >= 5 ? 'VOL_5X_PLUS'
      : vol >= 2 ? 'VOL_2_5X'
        : 'VOL_LOW'
    : 'VOL_NO_DATA';
  const chase = Number(f.chasePct);
  const chaseBucket = Number.isFinite(chase)
    ? chase >= 0.45 ? 'CHASE_HIGH'
      : chase >= 0.30 ? 'CHASE_MID'
        : 'CHASE_OK'
    : 'CHASE_NO_DATA';
  const market = sig.marketOk === false || sig.pumpSignalMarketOk === false
    ? 'MARKET_FAR'
    : sig.marketOk === true || sig.pumpSignalMarketOk === true
      ? 'MARKET_OK'
      : 'MARKET_UNKNOWN';
  return [type, side, grade, scoreBucket, volBucket, chaseBucket, market].join(' | ');
}

function pumpTradeCombo(t) {
  if (t.pumpCombo) return String(t.pumpCombo);
  if (t.pumpSignalType || String(t.source ?? '').startsWith('pump-')) {
    const score = Number(String(t.source ?? '').match(/pump-(\d+)/)?.[1]);
    return pumpSignalComboOf({
      side: t.side,
      type: t.pumpSignalType ?? t.source,
      grade: t.pumpSignalGrade,
      score,
      marketOk: t.pumpSignalMarketOk,
      factors: t.pumpSignalFactors,
    });
  }
  return '-';
}

const PUMP_PAPER_DAY_TIME_ZONE = 'Asia/Bangkok';
const pumpPaperDayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PUMP_PAPER_DAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function pumpPaperDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(
    pumpPaperDayFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function pumpPaperDateLabel() {
  if (pumpPaperDateMode === 'all') return '';
  if (pumpPaperDateFrom && pumpPaperDateTo) {
    return pumpPaperDateFrom === pumpPaperDateTo
      ? pumpPaperDateFrom
      : `${pumpPaperDateFrom} → ${pumpPaperDateTo}`;
  }
  if (pumpPaperDateFrom) return `từ ${pumpPaperDateFrom}`;
  if (pumpPaperDateTo) return `đến ${pumpPaperDateTo}`;
  return '';
}

function syncPumpPaperDateControls() {
  if (pumpPaperDateFromInput) pumpPaperDateFromInput.value = pumpPaperDraftDateFrom;
  if (pumpPaperDateToInput) pumpPaperDateToInput.value = pumpPaperDraftDateTo;
  pumpPaperTodayButton?.classList.toggle('is-active', pumpPaperDraftDateMode === 'today');
  pumpPaperAllDatesButton?.classList.toggle('is-active', pumpPaperDraftDateMode === 'all');
  pumpPaperTodayButton?.setAttribute('aria-pressed', String(pumpPaperDraftDateMode === 'today'));
  pumpPaperAllDatesButton?.setAttribute('aria-pressed', String(pumpPaperDraftDateMode === 'all'));
  if (pumpPaperDateStatus) {
    pumpPaperDateStatus.textContent = pumpPaperDateDirty
      ? `Chưa áp dụng · bấm Search · ${PUMP_PAPER_DAY_TIME_ZONE}`
      : pumpPaperDateMode === 'today'
        ? `Tự chuyển ngày mới · ${PUMP_PAPER_DAY_TIME_ZONE}`
        : pumpPaperDateMode === 'all'
          ? 'Toàn bộ lịch sử'
          : `Khoảng ngày cố định · ${PUMP_PAPER_DAY_TIME_ZONE}`;
  }
}

function setPumpPaperDateSearchLoading(loading) {
  if (pumpPaperDateSearchButton) {
    pumpPaperDateSearchButton.disabled = loading;
    pumpPaperDateSearchButton.classList.toggle('is-loading', loading);
    pumpPaperDateSearchButton.textContent = loading ? 'Đang tải...' : 'Search';
  }
  for (const control of [
    pumpPaperDateFromInput,
    pumpPaperDateToInput,
    pumpPaperTodayButton,
    pumpPaperAllDatesButton,
  ]) {
    if (control) control.disabled = loading;
  }
  if (loading && pumpPaperDateStatus) {
    pumpPaperDateStatus.textContent = `Đang tải ${pumpPaperDateLabel() || 'toàn bộ lịch sử'} · ${PUMP_PAPER_DAY_TIME_ZONE}`;
  } else if (!loading) {
    syncPumpPaperDateControls();
  }
}

function setPumpPaperToday({ reload = true, showLoading = false } = {}) {
  const today = pumpPaperDayKey();
  pumpPaperKnownToday = today;
  pumpPaperDateFrom = today;
  pumpPaperDateTo = today;
  pumpPaperDateMode = 'today';
  pumpPaperDraftDateFrom = today;
  pumpPaperDraftDateTo = today;
  pumpPaperDraftDateMode = 'today';
  pumpPaperDateDirty = false;
  syncPumpPaperDateControls();
  if (reload) loadPumpPaperTrades(1, true, showLoading);
}

function stagePumpPaperAllDates() {
  pumpPaperDraftDateFrom = '';
  pumpPaperDraftDateTo = '';
  pumpPaperDraftDateMode = 'all';
  pumpPaperDateDirty = pumpPaperDateMode !== 'all';
  syncPumpPaperDateControls();
}

function stagePumpPaperDateInputs(changedField) {
  let from = pumpPaperDateFromInput?.value || '';
  let to = pumpPaperDateToInput?.value || '';
  if (from && to && from > to) {
    if (changedField === 'from') to = from;
    else from = to;
  }
  pumpPaperDraftDateFrom = from;
  pumpPaperDraftDateTo = to;
  const today = pumpPaperDayKey();
  pumpPaperDraftDateMode = from === today && to === today
    ? 'today'
    : (!from && !to ? 'all' : 'custom');
  pumpPaperDateDirty =
    from !== pumpPaperDateFrom ||
    to !== pumpPaperDateTo ||
    pumpPaperDraftDateMode !== pumpPaperDateMode;
  syncPumpPaperDateControls();
}

function applyPumpPaperDateSearch() {
  pumpPaperDateFrom = pumpPaperDraftDateFrom;
  pumpPaperDateTo = pumpPaperDraftDateTo;
  pumpPaperDateMode = pumpPaperDraftDateMode;
  pumpPaperDateDirty = false;
  syncPumpPaperDateControls();
  loadPumpPaperTrades(1, true, true);
}

function checkPumpPaperDateRollover() {
  const today = pumpPaperDayKey();
  if (!today || today === pumpPaperKnownToday) return;
  pumpPaperKnownToday = today;
  if (pumpPaperDateMode !== 'today') return;
  pumpPaperDateFrom = today;
  pumpPaperDateTo = today;
  if (!pumpPaperDateDirty) {
    pumpPaperDraftDateFrom = today;
    pumpPaperDraftDateTo = today;
    pumpPaperDraftDateMode = 'today';
  }
  syncPumpPaperDateControls();
  loadPumpPaperTrades(1, true);
}

function initializePumpPaperDateRange() {
  setPumpPaperToday({ reload: false });
  if (!pumpPaperDateRolloverTimer) {
    pumpPaperDateRolloverTimer = window.setInterval(checkPumpPaperDateRollover, 30_000);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkPumpPaperDateRollover();
  });
  window.addEventListener('focus', checkPumpPaperDateRollover);
}

pumpPaperDateFromInput?.addEventListener('change', () => stagePumpPaperDateInputs('from'));
pumpPaperDateToInput?.addEventListener('change', () => stagePumpPaperDateInputs('to'));
pumpPaperTodayButton?.addEventListener('click', () => setPumpPaperToday({ showLoading: true }));
pumpPaperAllDatesButton?.addEventListener('click', stagePumpPaperAllDates);
pumpPaperDateSearchButton?.addEventListener('click', applyPumpPaperDateSearch);

pumpStage2FilterEl?.addEventListener('change', () => {
  pumpStage2Filter = pumpStage2FilterEl.value || 'all';
  loadPumpPaperTrades(1, true);
});

pumpLiftFilterEl?.addEventListener('change', () => {
  pumpLiftFilter = pumpLiftFilterEl.value || 'all';
  loadPumpPaperTrades(1, true);
});

pumpSelectorFilterEl?.addEventListener('change', () => {
  pumpSelectorFilter = pumpSelectorFilterEl.value || 'all';
  loadPumpPaperTrades(1, true);
});

function renderPumpEvalStats(rows = pumpEvalStats) {
  if (!pumpEvalStatsEl) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    pumpEvalStatsEl.innerHTML = '';
    pumpEvalStatsEl.style.display = 'none';
    return;
  }
  pumpEvalStatsEl.style.display = '';
  pumpEvalStatsEl.innerHTML = list.map((row) => {
    const tier = String(row.tier ?? 'BLOCK').toUpperCase();
    const cls = tier === 'A' ? 'good' : tier === 'BLOCK' ? 'bad' : 'neutral';
    const pnl = Number(row.pnl ?? 0);
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const avgRoe = row.avgRoe == null
      ? '-'
      : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    return `<div class="pump-paper-metric ${cls}">
      <span class="pump-paper-metric-label">Pump Eval · ${escapePumpHtml(row.label ?? tier)}</span>
      <strong class="${pnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(pnl)}</strong>
      <small>${row.total ?? 0} total · ${row.open ?? 0} open · ${row.pending ?? 0} pending · ${row.closed ?? 0} closed<br>
      WR ${wr} · ${row.wins ?? 0}W/${row.losses ?? 0}L · AvgROE ${avgRoe} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}<br>
      đóng ${fmtPumpMoney(row.realizedPnl)} · active ${fmtPumpMoney(row.unrealizedPnl)} · snapshot ${row.snapshot ?? 0} · backfill ${row.backfill ?? 0}</small>
    </div>`;
  }).join('');
}

function renderPumpCanonicalStats(rows = pumpCanonicalStats) {
  if (!pumpCanonicalStatsEl) return;
  const list = (Array.isArray(rows) ? rows : []).filter((row) => Number(row.total ?? 0) > 0);
  if (!list.length) {
    pumpCanonicalStatsEl.innerHTML = '';
    pumpCanonicalStatsEl.style.display = 'none';
    return;
  }
  pumpCanonicalStatsEl.style.display = '';
  pumpCanonicalStatsEl.innerHTML = list.map((row) => {
    const pnl = Number(row.pnl ?? 0);
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const avgRoe = row.avgRoe == null
      ? '-'
      : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    return `<div class="pump-paper-metric neutral">
      <span class="pump-paper-metric-label">PUMP V2 · COLLECT</span>
      <strong class="${pnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(pnl)}</strong>
      <small>${row.total ?? 0} total · ${row.active ?? 0} active · ${row.closed ?? 0} closed<br>
      WR ${wr} · ${row.wins ?? 0}W/${row.losses ?? 0}L · AvgROE ${avgRoe} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}<br>
      đóng ${fmtPumpMoney(row.realizedPnl)} · active ${fmtPumpMoney(row.unrealizedPnl)}<br>
      Walk-forward chưa đạt · observe only · cùng luồng paper gốc</small>
    </div>`;
  }).join('');
}

function renderPumpSourceStats(rows = pumpSourceStats) {
  if (!pumpSourceStatsEl) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    pumpSourceStatsEl.innerHTML = '';
    pumpSourceStatsEl.style.display = 'none';
    return;
  }
  pumpSourceStatsEl.style.display = '';
  pumpSourceStatsEl.innerHTML = list.map((row) => {
    const family = String(row.sourceFamily ?? row.key ?? '').toUpperCase();
    const panelClass = family === 'PUMP_NATIVE' ? 'pump-native' : 'ema';
    const netPnl = Number(row.netPnl ?? 0);
    const grossPnl = Number(row.grossPnl ?? 0);
    const fee = Number(row.estimatedFeeUsdt ?? 0);
    const avgNetRoe = row.avgNetRoe == null
      ? '-'
      : `${Number(row.avgNetRoe) >= 0 ? '+' : ''}${Number(row.avgNetRoe).toFixed(2)}%`;
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const margins = (Array.isArray(row.byMargin) ? row.byMargin : [])
      .filter((item) => Number(item.total ?? 0) > 0)
      .map((item) => {
        const itemNet = Number(item.netPnl ?? 0);
        const itemRoe = item.avgNetRoe == null
          ? '-'
          : `${Number(item.avgNetRoe) >= 0 ? '+' : ''}${Number(item.avgNetRoe).toFixed(2)}%`;
        return `<div class="pump-source-subcard">
          <strong>${escapePumpHtml(item.label ?? item.key)}</strong>
          <small>${item.closed ?? 0} closed · ${item.active ?? 0} active<br>
          Net <span class="${itemNet >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(itemNet)}</span>
          · Fee -$${Number(item.estimatedFeeUsdt ?? 0).toFixed(3)}<br>
          AvgNetROE ${itemRoe} · PF ${Number(item.profitFactor ?? 0).toFixed(2)}</small>
        </div>`;
      }).join('');
    const types = (Array.isArray(row.byType) ? row.byType : [])
      .filter((item) => Number(item.total ?? 0) > 0)
      .slice(0, 12)
      .map((item) => {
        const itemNet = Number(item.netPnl ?? 0);
        const itemRoe = item.avgNetRoe == null
          ? '-'
          : `${Number(item.avgNetRoe) >= 0 ? '+' : ''}${Number(item.avgNetRoe).toFixed(1)}%`;
        return `<div class="pump-source-type-row">
          <span title="${escapePumpHtml(item.label ?? item.key)}">${escapePumpHtml(item.label ?? item.key)}</span>
          <span>${item.closed ?? 0}C/${item.active ?? 0}A</span>
          <span class="${itemNet >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(itemNet)}</span>
          <span>${itemRoe} · PF ${Number(item.profitFactor ?? 0).toFixed(2)}</span>
        </div>`;
      }).join('');
    return `<section class="pump-source-panel ${panelClass}">
      <div class="pump-source-head">
        <div class="pump-source-title">
          ${escapePumpHtml(row.label ?? family)}
          <small>${row.total ?? 0} total · ${row.closed ?? 0} closed · ${row.active ?? 0} active</small>
        </div>
        <div class="pump-source-net ${netPnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(netPnl)}</div>
      </div>
      <div class="pump-source-line">
        Gross ${fmtPumpMoney(grossPnl)} · Fee -$${fee.toFixed(3)} · Net ${fmtPumpMoney(netPnl)}<br>
        Closed net ${fmtPumpMoney(row.netRealizedPnl)} · Active net ${fmtPumpMoney(row.netUnrealizedPnl)}<br>
        Net WR ${wr} · ${row.wins ?? 0}W/${row.losses ?? 0}L · AvgNetROE ${avgNetRoe} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}
      </div>
      <div class="pump-source-breakdown">${margins}</div>
      <details class="pump-source-types">
        <summary>Chi tiết theo ${family === 'PUMP_NATIVE' ? 'loại Pump' : 'stage EMA'}</summary>
        ${types || '<div class="pump-source-line">Chưa có dữ liệu.</div>'}
      </details>
    </section>`;
  }).join('');
}

function pumpObservationClass(tone) {
  const value = String(tone ?? 'WATCH').toUpperCase();
  if (value === 'GOOD') return 'good';
  if (value === 'RISK') return 'bad';
  return 'neutral';
}

function renderPumpObservationLayerCards(element, rows = []) {
  if (!element) return;
  const list = (Array.isArray(rows) ? rows : []).filter((row) => Number(row.total ?? 0) > 0);
  element.innerHTML = list.length
    ? list.map((row) => {
        const pnl = Number(row.totalPnl ?? 0);
        const toneClass = pumpObservationClass(row.tone);
        const toneLabel = toneClass === 'good' ? 'GOOD' : toneClass === 'bad' ? 'RISK' : 'WATCH';
        const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
        const avgRoe = row.avgRoe == null
          ? '-'
          : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(2)}%`;
        const avgRoeTone = Number(row.avgRoe ?? 0) >= 0 ? 'positive' : 'negative';
        const closedPnl = Number(row.closedPnl ?? 0);
        const activePnl = Number(row.activePnl ?? 0);
        return `<div class="pump-paper-metric pump-observation-card ${toneClass}">
          <div class="pump-observation-head">
            <span class="pump-observation-title">${escapePumpHtml(row.label ?? row.key)}</span>
            <span class="pump-observation-tag ${toneClass}">${toneLabel}</span>
          </div>
          <div class="pump-observation-pnl ${pnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(pnl)}</div>
          <div class="pump-observation-stats">
            ${row.total ?? 0} total · ${row.closed ?? 0} closed · ${row.active ?? 0} active<br>
            ${row.wins ?? 0}W/${row.losses ?? 0}L · WR ${wr} · AvgNetROE <span class="pump-observation-value ${avgRoeTone}">${avgRoe}</span> · PF ${Number(row.profitFactor ?? 0).toFixed(2)}<br>
            đóng <span class="pump-observation-value ${closedPnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(closedPnl)}</span>
            · active <span class="pump-observation-value ${activePnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(activePnl)}</span>
            · ngày dương ${row.positiveDays ?? 0}/${row.totalDays ?? 0}
          </div>
        </div>`;
      }).join('')
    : '<div class="pump-source-line">Chưa có dữ liệu cho lớp này trong khoảng ngày đã chọn.</div>';
}

function renderPumpObservationStats(stats = pumpObservationStats) {
  const layers = stats?.layers ?? {};
  renderPumpObservationLayerCards(pumpObservationL1El, layers.l1);
  renderPumpObservationLayerCards(pumpObservationL2El, layers.l2);
  renderPumpObservationLayerCards(pumpObservationL2bEl, layers.l2b);
  renderPumpObservationLayerCards(pumpObservationL2cEl, layers.l2c);
  renderPumpObservationLayerCards(pumpObservationL3El, layers.l3);
}

function renderPumpSourceLongCorrReboundStats(rows = pumpSourceLongCorrReboundStats) {
  renderPumpObservationLayerCards(pumpSourceLongCorrReboundStatsEl, rows);
}

function pumpObservationBadgeClass(tone) {
  const value = String(tone ?? 'WATCH').toUpperCase();
  if (value === 'GOOD') return 'good';
  if (value === 'RISK') return 'risk';
  return 'watch';
}

function renderPumpObservationBadges(t = {}) {
  if (!t.pumpObsVersion) return '<span style="color:var(--muted)">-</span>';
  const tierTone = t.pumpObsSourceTier === 'A'
    ? 'GOOD'
    : t.pumpObsSourceTier === 'BLOCK' ? 'RISK' : 'WATCH';
  const labels = [
    [t.pumpObsL1Label ?? 'PUMP L1 · NO DATA', t.pumpObsL1Tone, t.pumpObsL1Reason],
    [t.pumpObsTierLabel ?? 'PUMP TIER · NO DATA', tierTone, t.pumpObsWaveReason],
    [t.pumpObsWaveLabel ?? 'BTC WAVE · NO DATA', t.pumpObsWaveTone, t.pumpObsWaveReason],
  ];
  if (['A', 'B'].includes(String(t.pumpObsSourceTier ?? '').toUpperCase())) {
    labels.push([
      `2C ${t.pumpObsSourceTier} × ${t.pumpObsWaveLabel ?? 'NO DATA'}`,
      t.pumpObsWaveTone,
      t.pumpObsWaveReason,
    ]);
    labels.push([t.pumpObsBestLabel, t.pumpObsBestTone, t.pumpObsBestReason]);
  }
  return `<div class="ema-layer-badge-stack">${labels.filter(([label]) => label).map(([label, tone, reason]) => (
    `<span class="ema-layer-badge ${pumpObservationBadgeClass(tone)}" title="${escapePumpHtml(reason ?? '')}">${escapePumpHtml(label)}</span>`
  )).join('')}</div>`;
}

function renderPumpSourceLongCorrReboundBadge(t = {}) {
  if (t.sourceLongCorrReboundMatched !== true) return '';
  const title = t.sourceLongCorrReboundReason
    ?? 'EMA SQUEEZE LONG CORR REBOUND · provisional · OBSERVE ONLY';
  return `<div class="ema-layer-badge-stack" style="margin-top:3px">`
    + `<span class="ema-layer-badge watch" title="${escapePumpHtml(title)}">${escapePumpHtml(t.sourceLongCorrReboundLabel ?? 'EMA SQUEEZE CORR REBOUND')}</span>`
    + '</div>';
}

function emaLayerClass(tier) {
  return String(tier ?? 'WATCH').toLowerCase().replaceAll('_', '-');
}

function renderEmaLayerCards(target, rows = []) {
  if (!target) return;
  const list = (Array.isArray(rows) ? rows : [])
    .filter((row) => Number(row.total ?? 0) > 0);
  target.innerHTML = list.length
    ? list.map((row) => {
        const net = Number(row.netPnl ?? 0);
        const avg = row.avgNetRoe == null
          ? '-'
          : `${Number(row.avgNetRoe) >= 0 ? '+' : ''}${Number(row.avgNetRoe).toFixed(2)}%`;
        const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
        return `<div class="ema-layer-card ${emaLayerClass(row.tier)}">
          <strong>${escapePumpHtml(String(row.tier ?? 'WATCH').replace('_PLUS', '+'))}</strong>
          <small>${row.total ?? 0} total · ${row.closed ?? 0} closed · ${row.active ?? 0} active<br>
          Net <span class="${net >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(net)}</span>
          · đóng ${fmtPumpMoney(row.netRealizedPnl)} · active ${fmtPumpMoney(row.netUnrealizedPnl)}<br>
          WR ${wr} · AvgNetROE ${avg} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}</small>
        </div>`;
      }).join('')
    : '<div class="pump-source-line">Chưa có dữ liệu EMA cho lớp này.</div>';
}

function renderEmaLayerAnalysis(analysis = emaLayerAnalysis) {
  if (!emaLayerAnalysisSectionEl) return;
  if (!analysis?.layers) {
    emaLayerAnalysisSectionEl.style.display = 'none';
    return;
  }
  emaLayerAnalysisSectionEl.style.display = '';
  const historyDays = Array.isArray(analysis.historyDays) ? analysis.historyDays : [];
  const minimumDays = Number(analysis.minimumConfirmedDays ?? 3);
  const ready = analysis.modelReady === true;
  if (emaLayerAnalysisMetaEl) {
    emaLayerAnalysisMetaEl.textContent = [
      'SETUP EMA → MARKET FIT → COMBO',
      `prior-only ${historyDays.length}/${minimumDays} ngày`,
      analysis.version ?? 'EMA 3L',
      'OBSERVE ONLY',
    ].join(' · ');
  }
  if (emaLayerModelNoteEl) {
    const cohortNote = ` Các thẻ bên dưới là kết quả cohort ${escapePumpHtml(analysis.cutoffDay ?? pumpPaperDateTo ?? pumpPaperDateFrom ?? '-')}, được nhóm theo nhãn prior-only.`;
    emaLayerModelNoteEl.innerHTML = ready
      ? `<strong>Model đủ số ngày tối thiểu.</strong> Chỉ nhãn GOOD+ mới được xem là tổ hợp đã xác nhận; vẫn chưa chặn entry hoặc đổi size/SL/TP. Lookback: ${escapePumpHtml(historyDays.join(', ') || '-')}.${cohortNote}`
      : `<strong>Chưa đủ để chọn chính thức.</strong> Hiện có ${historyDays.length}/${minimumDays} ngày schema EMA đầy đủ; GOOD chỉ là PROVISIONAL, GOOD+ sẽ chỉ xuất hiện sau khi đủ mẫu. Lookback: ${escapePumpHtml(historyDays.join(', ') || '-')}.${cohortNote}`;
  }
  renderEmaLayerCards(emaLayer1StatsEl, analysis.layers.setup);
  renderEmaLayerCards(emaLayer2StatsEl, analysis.layers.market);
  renderEmaLayerCards(emaLayer3StatsEl, analysis.layers.combo);

  if (emaLayerCandidateRowsEl) {
    const candidates = Array.isArray(analysis.candidates) ? analysis.candidates : [];
    emaLayerCandidateRowsEl.innerHTML = candidates.length
      ? candidates.map((row) => {
          const history = row.history ?? {};
          const current = row.current ?? {};
          const currentNet = Number(current.netPnl ?? 0);
          const badge = row.selectionReady
            ? 'GOOD+ · READY'
            : 'GOOD · PROVISIONAL';
          return `<div class="ema-layer-candidate-row" title="${escapePumpHtml(row.reason ?? '')}">
            <span class="ema-layer-badge ${emaLayerClass(row.tier)}">${escapePumpHtml(badge)}</span>
            <span class="combo-name">${escapePumpHtml(row.label ?? row.key)}</span>
            <span>${history.closed ?? 0}H/${history.days ?? 0}D · Avg ${Number(history.avgNetRoe ?? 0).toFixed(2)}% · PF ${Number(history.profitFactor ?? 0).toFixed(2)}</span>
            <span>${current.closed ?? 0}C/${current.active ?? 0}A</span>
            <span class="${currentNet >= 0 ? 'positive' : 'negative'}">nay ${fmtPumpMoney(currentNet)}</span>
          </div>`;
        }).join('')
      : '<div class="pump-source-line">Chưa có tổ hợp GOOD+/GOOD prior-only trong ngày đang xem.</div>';
  }
}

function renderEmaLayerBadges(t = {}) {
  if (!String(t.source ?? '').startsWith('emasq-')) {
    return '<span style="color:var(--muted)">-</span>';
  }
  const layers = [
    ['L1 SETUP', t.emaLayer1Tier, t.emaLayer1Reason],
    ['L2 MARKET', t.emaLayer2Tier, t.emaLayer2Reason],
    [
      t.emaLayer3SelectionReady ? 'L3 SELECT' : t.emaLayer3Provisional ? 'L3 PROV' : 'L3 COMBO',
      t.emaLayer3Tier,
      t.emaLayer3Reason,
    ],
  ];
  return `<div class="ema-layer-badge-stack">${layers.map(([label, tier, reason]) => (
    `<span class="ema-layer-badge ${emaLayerClass(tier)}" title="${escapePumpHtml(reason ?? '')}">${escapePumpHtml(label)} · ${escapePumpHtml(String(tier ?? 'WATCH').replace('_PLUS', '+'))}</span>`
  )).join('')}</div>`;
}

function renderPumpCanonicalBadge(t) {
  const nativePump = /^pump-\d+(?:-|$)/i.test(String(t?.source ?? ''));
  if (!nativePump) return '<span style="color:var(--muted)">-</span>';
  const candidate = String(t.pumpCanonicalCandidateTier ?? 'WATCH').toUpperCase();
  const reason = [
    t.pumpCanonicalReason ?? 'Walk-forward chưa đạt.',
    `Candidate diagnostic: ${candidate}`,
    t.pumpCanonicalCandidateReason,
    `Expected net ROE ${Number(t.pumpCanonicalExpectedNetRoe ?? 0).toFixed(2)}%`,
    `N exact ${t.pumpCanonicalExactClosed ?? 0} · support ${t.pumpCanonicalSupportClosed ?? 0}`,
    t.pumpCanonicalExactKey,
    t.pumpCanonicalVersion ?? pumpCanonicalModel?.version,
    'Observe-only: không chọn/chặn và không đổi size, SL hoặc TP.',
  ].filter(Boolean).join(' | ');
  return `<span class="pump-eval-badge collect" title="${escapePumpHtml(reason)}">
    PUMP V2 · COLLECT
    <small>${t.pumpCanonicalDerived ? 'BACKFILL' : 'SNAPSHOT'} · CAND ${escapePumpHtml(candidate)}</small>
  </span>`;
}

function renderPumpEvalBadge(t) {
  const tier = String(t?.pumpEvalTier ?? '').toUpperCase();
  if (!tier) return '<span style="color:var(--muted)">-</span>';
  const cls = tier === 'A' ? 'tier-a' : tier === 'B' ? 'tier-b' : 'block';
  const label = tier === 'A'
    ? 'PUMP TIER A'
    : tier === 'B'
      ? 'PUMP TIER B · TEST'
      : 'PUMP TIER BLOCK';
  const reason = [
    t.pumpEvalLabel,
    t.pumpEvalReason,
    t.pumpEvalContextKey,
    t.pumpEvalVersion,
    t.pumpEvalDerived
      ? 'Suy ra từ snapshot lịch sử để thống kê; không sửa log cũ.'
      : 'Snapshot runtime lưu tại entry.',
  ].filter(Boolean).join(' | ');
  return `<span class="pump-eval-badge ${cls}" title="${escapePumpHtml(reason)}">
    ${escapePumpHtml(label)}
    <small>${t.pumpEvalDerived ? 'BACKFILL' : 'SNAPSHOT'}</small>
  </span>`;
}

function renderPumpStage2Stats(rows = pumpStage2Stats) {
  if (!pumpStage2StatsEl) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    pumpStage2StatsEl.innerHTML = '';
    pumpStage2StatsEl.style.display = 'none';
    return;
  }
  pumpStage2StatsEl.style.display = '';
  pumpStage2StatsEl.innerHTML = list.map((row) => {
    const tier = String(row.tier ?? 'WATCH');
    const cls = tier === 'WATCH_PLUS' ? 'good' : tier === 'RISK' ? 'bad' : 'neutral';
    const pnl = Number(row.pnl ?? 0);
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const avgRoe = row.avgRoe == null
      ? '-'
      : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    return `<div class="pump-paper-metric ${cls}">
      <span class="pump-paper-metric-label">Stage 2 · ${escapePumpHtml(row.label ?? tier)}</span>
      <strong class="${pnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(pnl)}</strong>
      <small>${row.total ?? 0} total · ${row.open ?? 0} open · ${row.pending ?? 0} pending · ${row.closed ?? 0} closed<br>
      WR ${wr} · ${row.wins ?? 0}W/${row.losses ?? 0}L · AvgROE ${avgRoe}</small>
    </div>`;
  }).join('');
}

function renderPumpStage2Badge(t) {
  const tier = String(t?.pumpStage2Tier ?? '').toUpperCase();
  if (!tier) return '<span style="color:var(--muted)">-</span>';
  const cls = tier === 'WATCH_PLUS' ? 'watch-plus' : tier === 'RISK' ? 'risk' : 'watch';
  const label = String(t.pumpStage2Label ?? tier.replace('_PLUS', '+'));
  const code = String(t.pumpStage2Code ?? '');
  const reason = [
    t.pumpStage2Reason,
    t.pumpStage2ContextKey,
    t.pumpStage2Version,
    t.pumpStage2Derived ? 'Suy ra từ snapshot lịch sử; không sửa log cũ.' : 'Snapshot lưu tại entry.',
    'Observe-only: không đổi entry, size, SL hoặc TP.',
  ].filter(Boolean).join(' | ');
  return `<span class="pump-stage2-badge ${cls}" title="${escapePumpHtml(reason)}">
    ${escapePumpHtml(label)}
    ${code ? `<small>${escapePumpHtml(code.replace(/^PUMP_S2_/, ''))}</small>` : ''}
  </span>`;
}

function renderPumpLiftStats(rows = pumpLiftStats) {
  if (!pumpLiftStatsEl) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    pumpLiftStatsEl.innerHTML = '';
    pumpLiftStatsEl.style.display = 'none';
    return;
  }
  pumpLiftStatsEl.style.display = '';
  const history = Array.isArray(pumpLiftModel?.historyDays)
    ? pumpLiftModel.historyDays.join(', ')
    : '-';
  pumpLiftStatsEl.innerHTML = list.map((row) => {
    const tier = String(row.tier ?? 'NEUTRAL').toUpperCase();
    const cls = tier === 'BOOST' ? 'good' : tier === 'DEGRADE' ? 'bad' : 'neutral';
    const pnl = Number(row.pnl ?? 0);
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const avgRoe = row.avgRoe == null
      ? '-'
      : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    return `<div class="pump-paper-metric ${cls}" title="Lookback: ${escapePumpHtml(history)}">
      <span class="pump-paper-metric-label">Lift L2 · ${escapePumpHtml(tier)}</span>
      <strong class="${pnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(pnl)}</strong>
      <small>${row.total ?? 0} total · ${row.open ?? 0} open · ${row.pending ?? 0} pending · ${row.closed ?? 0} closed<br>
      WR ${wr} · ${row.wins ?? 0}W/${row.losses ?? 0}L · AvgROE ${avgRoe}<br>
      OOS ${row.oos ?? 0} · Bootstrap ${row.bootstrap ?? 0}</small>
    </div>`;
  }).join('');
}

function renderPumpLiftBadge(t) {
  const tier = String(t?.pumpLiftTier ?? '').toUpperCase();
  if (!tier) return '<span style="color:var(--muted)">-</span>';
  const cls = tier === 'BOOST' ? 'boost' : tier === 'DEGRADE' ? 'degrade' : 'neutral';
  const basis = String(t.pumpLiftBasis ?? 'BOOTSTRAP').toUpperCase();
  const label = String(t.pumpLiftLabel ?? `${tier} · ${basis}`);
  const reason = [
    t.pumpLiftReason,
    `ΔROE ${Number(t.pumpLiftDeltaRoe ?? 0) >= 0 ? '+' : ''}${Number(t.pumpLiftDeltaRoe ?? 0).toFixed(2)}%`,
    `PF ${Number(t.pumpLiftProfitFactor ?? 0).toFixed(2)}`,
    `${t.pumpLiftClosed ?? 0} lệnh/${t.pumpLiftDays ?? 0} ngày`,
    t.pumpLiftCohortKey,
    t.pumpLiftVersion,
    t.pumpLiftDerived ? 'Nhãn suy ra để quan sát.' : 'Snapshot lưu tại entry.',
    'Observe-only: không đổi entry, size, SL hoặc TP.',
  ].filter(Boolean).join(' | ');
  return `<span class="pump-lift-badge ${cls}" title="${escapePumpHtml(reason)}">
    ${escapePumpHtml(label)}
    <small>Δ ${Number(t.pumpLiftDeltaRoe ?? 0) >= 0 ? '+' : ''}${Number(t.pumpLiftDeltaRoe ?? 0).toFixed(2)}%</small>
  </span>`;
}

function renderPumpSelectorStats(rows = pumpSelectorStats) {
  if (!pumpSelectorStatsEl) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    pumpSelectorStatsEl.innerHTML = '';
    pumpSelectorStatsEl.style.display = 'none';
    return;
  }
  pumpSelectorStatsEl.style.display = '';
  const history = Array.isArray(pumpSelectorModel?.historyDays)
    ? pumpSelectorModel.historyDays.join(', ')
    : '-';
  pumpSelectorStatsEl.innerHTML = list.map((row) => {
    const tier = String(row.tier ?? 'WATCH').toUpperCase();
    const cls = tier === 'CORE' || tier === 'PROBE'
      ? 'good'
      : tier === 'AVOID'
        ? 'bad'
        : 'neutral';
    const pnl = Number(row.pnl ?? 0);
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const avgRoe = row.avgRoe == null
      ? '-'
      : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    const avgPnl = row.avgPnl == null ? '-' : fmtPumpMoney(row.avgPnl);
    return `<div class="pump-paper-metric ${cls}" title="Prior-only: ${escapePumpHtml(history)}">
      <span class="pump-paper-metric-label">Selector · ${escapePumpHtml(tier)}</span>
      <strong class="${pnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(pnl)}</strong>
      <small>${row.total ?? 0} total · ${row.open ?? 0} open · ${row.pending ?? 0} pending · ${row.closed ?? 0} closed<br>
      Net WR ${wr} · ${row.wins ?? 0}W/${row.losses ?? 0}L · Avg net ROE ${avgRoe}<br>
      Net/trade ${avgPnl} · Gross ${fmtPumpMoney(row.grossPnl)} · Fee -$${Number(row.estimatedFeeUsdt ?? 0).toFixed(3)}<br>
      Snapshot ${row.snapshot ?? 0} · Backfill ${row.backfill ?? 0}</small>
    </div>`;
  }).join('');
}

function renderPumpSelectorBadge(t) {
  const tier = String(t?.pumpSelectorTier ?? '').toUpperCase();
  if (!tier) return '<span style="color:var(--muted)">-</span>';
  const cls = ['core', 'probe', 'watch', 'avoid'].includes(tier.toLowerCase())
    ? tier.toLowerCase()
    : 'watch';
  const label = String(t.pumpSelectorLabel ?? tier);
  const edge = Number(t.pumpSelectorExpectedNetRoe ?? 0);
  const lcb = Number(t.pumpSelectorConservativeEdge ?? 0);
  const reason = [
    t.pumpSelectorReason,
    `Expected net ROE ${edge >= 0 ? '+' : ''}${edge.toFixed(2)}%`,
    `Conservative edge ${lcb >= 0 ? '+' : ''}${lcb.toFixed(2)}%`,
    `PF ${Number(t.pumpSelectorProfitFactor ?? 0).toFixed(2)}`,
    `SL rate ${(Number(t.pumpSelectorSlRate ?? 0) * 100).toFixed(1)}%`,
    `${t.pumpSelectorExactClosed ?? 0} exact / ${t.pumpSelectorExactDays ?? 0} ngày / ${t.pumpSelectorSupportClosed ?? 0} support`,
    `${t.pumpSelectorPositiveWindows ?? 0} cửa sổ dương / ${t.pumpSelectorNegativeWindows ?? 0} âm`,
    t.pumpSelectorRecentConflict ? 'Cửa sổ 1d đang xung đột 7d.' : null,
    t.pumpSelectorSourceFamily,
    t.pumpSelectorExactKey,
    t.pumpSelectorVersion,
    t.pumpSelectorDerived ? 'Backfill để quan sát.' : 'Snapshot lưu tại entry.',
    'Observe-only: không đổi entry, size, SL hoặc TP.',
  ].filter(Boolean).join(' | ');
  return `<span class="pump-selector-badge ${cls}" title="${escapePumpHtml(reason)}">
    ${escapePumpHtml(label)}
    <small>Edge ${edge >= 0 ? '+' : ''}${edge.toFixed(2)}% · N ${t.pumpSelectorExactClosed ?? 0}</small>
  </span>`;
}

function renderPumpComboStats(rows = pumpPaperComboStats) {
  if (!pumpComboStatsEl) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    pumpComboStatsEl.style.display = 'none';
    pumpComboStatsEl.innerHTML = '';
    return;
  }
  pumpComboStatsEl.style.display = '';
  pumpComboStatsEl.innerHTML = list.map((row, index) => {
    const key = String(row.key ?? '-');
    const parts = key.split('|').map((p) => p.trim()).filter(Boolean);
    const title = parts.slice(0, 3).join(' · ') || key;
    const tags = parts.slice(3).map((part) => {
      const upper = part.toUpperCase();
      const cls = upper.includes('BAD') || upper.includes('BLOCK') || upper.includes('RAC') ? 'bad'
        : upper.includes('GOOD') || upper.includes('OK') || upper.includes('THUAN') || upper.includes('THEO') ? 'hot'
          : '';
      return `<span class="pump-combo-tag ${cls}" title="${escapePumpHtml(part)}">${escapePumpHtml(part)}</span>`;
    }).join('');
    const quality = String(row.quality ?? '').toLowerCase();
    const cardCls = quality.includes('good') ? 'good' : quality.includes('bad') ? 'bad' : 'neutral';
    const pnl = Number(row.pnl ?? 0);
    const pnlCls = pnl >= 0 ? 'pos' : 'neg';
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const avgRoe = row.avgRoe == null ? '-' : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    const plan = row.tradePlan ?? {};
    const planLabel = String(plan.label ?? '').trim() || 'TEST $1';
    const planMargin = Number(plan.marginUsdt);
    const planCls = Number.isFinite(planMargin) && planMargin <= 1.01 ? 'bad' : 'hot';
    const planTitle = plan.reason ? ` title="${escapePumpHtml(plan.reason)}"` : '';
    return `<div class="pump-combo-card ${cardCls}">
      <div class="pump-combo-head">
        <div class="pump-combo-title">#${index + 1} ${escapePumpHtml(title)}</div>
        <span class="pump-combo-tag ${planCls}"${planTitle}>${escapePumpHtml(planLabel)}</span>
      </div>
      <div class="pump-combo-tags">${tags}</div>
      <div class="pump-combo-stats">
        <div>${row.wins ?? 0}W/${row.losses ?? 0}L · WR ${wr} · Closed ${row.closed ?? 0}/${row.total ?? 0}</div>
        <div class="pump-combo-pnl ${pnlCls}">PnL ${fmtPumpMoney(pnl)} · AvgROE ${avgRoe}</div>
      </div>
    </div>`;
  }).join('');
}

function renderPumpComboCycleRows(target, rows = []) {
  if (!target) return;
  target.innerHTML = rows.map((row, index) => {
    const comboParts = String(row.comboKey ?? '-').split('|').map((part) => part.trim()).filter(Boolean);
    const title = comboParts.slice(0, 3).join(' · ') || row.comboKey || '-';
    const tags = [
      ...comboParts.slice(3),
      row.cycleKey,
    ].filter(Boolean).map((part) => `<span class="pump-combo-tag hot" title="${escapePumpHtml(part)}">${escapePumpHtml(part)}</span>`).join('');
    const history = row.history ?? {};
    const recent = row.recent ?? {};
    const pnl = Number(history.pnl ?? 0);
    const avgRoe = Number(history.avgRoe ?? 0);
    const activePnl = Number(row.activePnl ?? 0);
    return `<div class="pump-combo-card good">
      <div class="pump-combo-head">
        <div class="pump-combo-title">#${index + 1} ${escapePumpHtml(title)}</div>
        <span class="pump-combo-tag hot">${row.tier === 'STABLE_GOOD' ? 'ỔN ĐỊNH' : 'ĐANG XÁC NHẬN'}</span>
      </div>
      <div class="pump-combo-tags">${tags}</div>
      <div class="pump-combo-stats">
        <div>${history.wins ?? 0}W/${history.losses ?? 0}L · Closed ${history.closed ?? 0}/${row.total ?? 0} · ${history.episodes ?? 0} episode</div>
        <div>Ngày dương ${history.positiveDays ?? 0}/${history.days ?? 0} (${Number(history.positiveDayRate ?? 0).toFixed(0)}%) · PF ${Number(history.profitFactor ?? 0).toFixed(2)}</div>
        <div class="pump-combo-pnl ${pnl >= 0 ? 'pos' : 'neg'}">PnL đóng ${fmtPumpMoney(pnl)} · AvgROE ${avgRoe >= 0 ? '+' : ''}${avgRoe.toFixed(1)}%</div>
        <div>Gần đây ${recent.positiveDays ?? 0}/${recent.days ?? 0} ngày dương · PF ${Number(recent.profitFactor ?? 0).toFixed(2)}</div>
        <div class="pump-combo-pnl ${activePnl >= 0 ? 'pos' : 'neg'}">Active ${row.active ?? 0} · PnL active ${fmtPumpMoney(activePnl)} · Pending ${row.pending ?? 0}</div>
      </div>
    </div>`;
  }).join('');
}

function renderPumpComboCycleStats(stats = pumpComboCycleStats) {
  if (!pumpComboCycleStableEl) return;
  const stable = Array.isArray(stats?.stableGood) ? stats.stableGood : [];
  const forming = Array.isArray(stats?.formingGood) ? stats.formingGood : [];
  renderPumpComboCycleRows(pumpComboCycleStableEl, stable);
  if (!stable.length) {
    pumpComboCycleStableEl.innerHTML = '<div style="color:var(--muted);font-size:11px">Chưa có combo Pump native đạt đủ chuẩn ổn định qua ngày.</div>';
  }
  if (pumpComboCycleFormingEl && pumpComboCycleFormingRowsEl) {
    pumpComboCycleFormingEl.style.display = forming.length ? '' : 'none';
    const summary = pumpComboCycleFormingEl.querySelector('summary');
    if (summary) summary.textContent = `Đang xác nhận thêm ngày: ${forming.length} combo tốt`;
    renderPumpComboCycleRows(pumpComboCycleFormingRowsEl, forming);
  }
}

document.addEventListener('click', (e) => {
  const th = e.target.closest('[data-paper-sort]');
  if (!th || !th.classList.contains('pump-paper-sort')) return;
  const key = th.dataset.paperSort;
  if (pumpPaperSort.key === key) {
    pumpPaperSort.dir = pumpPaperSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    pumpPaperSort = {
      key,
      dir: [
        'status',
        'symbol',
        'side',
        'candle',
        'btcCandle',
        'combo',
        'source',
      ].includes(key)
        ? 'asc'
        : 'desc',
    };
  }
  renderPumpPaperTrades(pumpPaperTradesCache, pumpPaperSummaryCache);
});

function fmtPnlPump(pnl, roe) {
  if (pnl == null) return '<span style="color:var(--muted)">–</span>';
  const sign = pnl >= 0 ? '+' : '';
  const cls  = pnl >= 0 ? 'positive' : 'negative';
  return `<span class="${cls}">${sign}$${Math.abs(pnl).toFixed(3)} (${sign}${Number(roe ?? 0).toFixed(1)}%)</span>`;
}

function escapePumpHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPumpBtcCorrBadge(t) {
  const corr = Number(t?.btcCorr);
  if (!Number.isFinite(corr)) {
    return '<span title="Lệnh cũ chưa lưu btcCorr hoặc thiếu kline BTC/coin" style="font-size:10px;font-weight:900;color:var(--muted)">BTC NO DATA</span>';
  }
  const color = corr >= 0.5 ? '#34d399' : corr >= 0.3 ? '#fbbf24' : '#fb7185';
  const label = corr >= 0.5 ? '✓ THEO' : corr >= 0.3 ? '~ YẾU' : '✗ ĐỘC LẬP';
  return `<span title="corr coin vs BTC=${corr.toFixed(2)}; >=0.5 theo BTC, <0.3 độc lập/rác" style="font-size:10px;font-weight:950;color:${color}">${label} ${corr.toFixed(2)}</span>`;
}

function renderPumpBtcTrendBadge(t) {
  const h = t?.btcHealth ?? {};
  const dir = String(h.btcTrendDir ?? t?.btcTrendDir ?? '').toLowerCase();
  const score = Number(h.btcTrendScore ?? t?.btcTrendScore);
  const regime = String(h.regime ?? '').toUpperCase();
  const pct6h = Number(h.pct6h);
  const ema1h = String(h.emaTrend1h ?? '').toLowerCase();
  const side = String(t?.side ?? '').toUpperCase();
  const corr = Number(t?.btcCorr);
  if (!dir && !regime && !Number.isFinite(score)) {
    return '<span title="Lệnh cũ chưa lưu BTC snapshot" style="font-size:10px;font-weight:900;color:var(--muted)">BTC NO DATA</span>';
  }
  const expected = side === 'LONG' ? 'up' : side === 'SHORT' ? 'down' : '';
  const aligned = dir && expected ? dir === expected : null;
  const trendText = dir ? `BTC ${dir.toUpperCase()}${Number.isFinite(score) ? ` ${score}` : ''}` : (regime || 'BTC ?');
  const pctText = Number.isFinite(pct6h) ? `${pct6h >= 0 ? '+' : ''}${pct6h.toFixed(2)}%/6h` : '';
  const title = [
    `btcTrend=${dir || '-'}`,
    Number.isFinite(score) ? `score=${score}` : '',
    regime ? `regime=${regime}` : '',
    Number.isFinite(pct6h) ? `pct6h=${pct6h.toFixed(2)}%` : '',
    ema1h ? `ema1h=${ema1h}` : '',
    `side=${side || '-'}`,
    Number.isFinite(corr) ? `corr=${corr.toFixed(2)}` : '',
    aligned == null ? '' : `relation=${aligned ? 'THUAN_BTC' : 'NGUOC_BTC'}`,
  ].filter(Boolean).join(' | ');
  let color = '#9daaa5';
  let bg = 'rgba(157,170,165,.12)';
  if (dir === 'up') {
    color = Number.isFinite(score) && score < 45 ? '#fbbf24' : '#34d399';
    bg = Number.isFinite(score) && score < 45 ? 'rgba(251,191,36,.18)' : 'rgba(52,211,153,.16)';
  } else if (dir === 'down') {
    color = Number.isFinite(score) && score < 45 ? '#fbbf24' : '#fb7185';
    bg = Number.isFinite(score) && score < 45 ? 'rgba(251,191,36,.18)' : 'rgba(251,113,133,.16)';
  }
  const relColor = aligned == null ? 'var(--muted)' : aligned ? '#34d399' : '#fb7185';
  const relText = aligned == null ? '-' : aligned ? 'THUẬN BTC' : 'NGƯỢC BTC';
  const wave = t?.marketDirectionAtSignal?.scoreDynamics;
  const waveHtml = wave?.shortWaveState
    ? `<span class="liquid-short-wave" data-short-wave="${escapePumpHtml(wave.shortWaveState)}" title="${escapePumpHtml(wave.shortWaveDescription ?? 'Snapshot nhịp SHORT tại entry')}">${escapePumpHtml(wave.shortWaveLabel ?? wave.shortWaveState)}</span>`
    : '';
  const longWaveHtml = wave?.longWaveState
    ? `<span class="liquid-long-wave" data-long-wave="${escapePumpHtml(wave.longWaveState)}" title="${escapePumpHtml(wave.longWaveDescription ?? 'Snapshot nhịp LONG tại entry')}">${escapePumpHtml(wave.longWaveLabel ?? wave.longWaveState)}</span>`
    : '';
  return `<div title="${escapePumpHtml(title)}" style="display:flex;flex-direction:column;gap:3px;align-items:flex-start">
    <span style="display:inline-flex;gap:4px;align-items:center;max-width:128px;padding:2px 6px;border-radius:4px;border:1px solid ${color};background:${bg};color:${color};font-size:10px;font-weight:950;line-height:1.15">${escapePumpHtml(trendText)}${pctText ? `<small style="font-size:9px;font-weight:850;color:${color}">${escapePumpHtml(pctText)}</small>` : ''}</span>
    <span style="font-size:10px;font-weight:950;color:${relColor}">${relText}</span>
    ${waveHtml}
    ${longWaveHtml}
  </div>`;
}

function fmtPumpMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(3)}`;
}

function renderPumpSupportEntryCards(element, rows = [], emptyLabel = 'Chưa có cohort đủ điều kiện') {
  if (!element) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    element.innerHTML = `<div class="pump-paper-metric neutral">
      <span class="pump-paper-metric-label">${escapePumpHtml(emptyLabel)}</span>
      <strong>0 lệnh</strong>
      <small>Chỉ thống kê · OBSERVE ONLY</small>
    </div>`;
    return;
  }
  element.innerHTML = list.map((row) => {
    const tier = String(row.tier ?? 'WATCH').toUpperCase();
    const cls = tier === 'GOOD' ? 'good' : tier === 'RISK' ? 'bad' : 'neutral';
    const totalPnl = Number(row.pnl ?? 0);
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const avgRoe = row.avgRoe == null
      ? '-'
      : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    const streak = Number(row.negativeDayStreak ?? 0) > 0
      ? ` · chuỗi âm ${Number(row.negativeDayStreak)} ngày`
      : '';
    return `<div class="pump-paper-metric ${cls}">
      <span class="pump-paper-metric-label">${escapePumpHtml(row.label ?? 'ENTRY SUPPORT')}</span>
      <strong class="${totalPnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(totalPnl)}</strong>
      <small>${row.total ?? 0} lệnh · ${row.open ?? 0} mở · ${row.closed ?? 0} đóng<br>
      ${row.wins ?? 0}W/${row.losses ?? 0}L · WR ${wr} · AvgROE ${avgRoe}<br>
      PnL đóng ${fmtPumpMoney(row.closedPnl)} · active ${fmtPumpMoney(row.activePnl)} · PF ${Number(row.profitFactor ?? 0).toFixed(2)}<br>
      ngày dương ${row.positiveDays ?? 0}/${row.days ?? 0} · ngày âm ${row.negativeDays ?? 0}${streak}</small>
    </div>`;
  }).join('');
}

function renderPumpSupportEntryStats(stats = pumpSupportEntryStats) {
  renderPumpSupportEntryCards(
    pumpSupportEntryGroupsEl,
    stats?.groups,
    'Chưa có tín hiệu đẹp/xấu trong khoảng ngày',
  );
  renderPumpSupportEntryCards(
    pumpSupportEntryShortEl,
    stats?.shortSourceGroups,
    'Chưa có SHORT đủ điều kiện sau flip',
  );
  renderPumpSupportEntryCards(
    pumpSupportEntryLongEl,
    stats?.longSourceGroups,
    'Chưa có LONG đủ điều kiện sau flip',
  );
}

function appendPumpSummaryPnl(countTxt, summary) {
  if (!summary) return countTxt;
  const net = Number(summary.netPnl);
  const realized = Number(summary.realizedPnl);
  const unreal = Number(summary.unrealizedPnl);
  if (!Number.isFinite(net)) return countTxt;
  return `${countTxt} · PnL ${fmtPumpMoney(net)} (realized ${fmtPumpMoney(realized)} · live ${fmtPumpMoney(unreal)})`;
}

function renderPumpPaperOverview(summary) {
  if (!pumpPaperOverview) return;
  if (!summary) {
    pumpPaperOverview.innerHTML = '';
    return;
  }
  const byMargin = summary.byMargin ?? {};
  const wr = summary.closed > 0 ? Math.round(summary.wins / summary.closed * 100) : null;
  const totalCard = {
    label: 'Tổng filter',
    title: `${summary.open ?? 0} open · ${summary.closed ?? 0} closed`,
    detail: `WR ${wr == null ? '-' : `${wr}%`} · AvgROE ${summary.avgRoe == null ? '-' : `${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`}`,
    pnl: Number(summary.netPnl),
  };
  const cards = [
    totalCard,
    byMargin.test10,
    byMargin.test1,
    byMargin.other,
  ].filter(Boolean);
  pumpPaperOverview.innerHTML = cards.map((row) => {
    const pnl = Number(row.pnl ?? row.netPnl ?? totalCard.pnl);
    const cls = pnl > 0 ? 'good' : pnl < 0 ? 'bad' : 'neutral';
    const label = row.label ?? 'Group';
    const title = row.title ?? `${row.open ?? 0} open · ${row.closed ?? 0} closed`;
    const detail = row.detail
      ?? `WR ${row.wr == null ? '-' : `${row.wr}%`} · ${row.wins ?? 0}W/${row.losses ?? 0}L · AvgROE ${row.avgRoe == null ? '-' : `${row.avgRoe > 0 ? '+' : ''}${row.avgRoe}%`}`;
    const sub = row.realizedPnl == null
      ? detail
      : `${detail}<br>real ${fmtPumpMoney(row.realizedPnl)} · live ${fmtPumpMoney(row.unrealizedPnl)}`;
    return `<div class="pump-paper-metric ${cls}">
      <span class="pump-paper-metric-label">${escapePumpHtml(label)}</span>
      <strong class="${pnl >= 0 ? 'positive' : 'negative'}">${fmtPumpMoney(pnl)}</strong>
      <small>${escapePumpHtml(title)}<br>${sub}</small>
    </div>`;
  }).join('');
}

function pumpPaperCandleSortName(value) {
  const raw = typeof value === 'object' ? value?.name : value;
  const normalized = String(raw ?? '').trim().toUpperCase();
  return ['NO_DATA', 'UNKNOWN', '-'].includes(normalized) ? '' : normalized;
}

function pumpPaperSortValue(t, key) {
  if (key === 'symbol') return t.symbol ?? '';
  if (key === 'side') return t.side ?? '';
  if (key === 'candle') {
    const timeframe = String(
      t.candlePatternTimeframe ?? t.timeframe ?? t.interval ?? t.tf ?? '',
    ).toUpperCase();
    return pumpPaperCandleSortName(
      t.candlePatternAtEntry
        ?? (timeframe === '5M' ? t.candlePattern5m : t.candlePattern15m)
        ?? t.candlePattern5m
        ?? t.brCandleKind,
    );
  }
  if (key === 'btcCandle') {
    return pumpPaperCandleSortName(
      t.btcCandlePatternAtEntry
        ?? t.btcCandleAtEntry
        ?? t.btcCandlePattern5m,
    );
  }
  if (key === 'candleFlag') {
    const evaluation = window.PaperCandleColumns?.evaluate?.(t);
    const label = String(
      evaluation?.label ?? evaluation?.tier ?? '',
    ).toUpperCase();
    const rank = label.includes('GOOD')
      ? 5
      : label.includes('WATCH+')
        ? 4
        : label.includes('WATCH')
          ? 3
          : label.includes('RISK')
            ? 1
            : 0;
    return rank * 100 + (
      { GOOD: 5, WATCH: 3, RISK: 1 }[
        String(evaluation?.tier ?? '').toUpperCase()
      ] ?? 0
    );
  }
  if (key === 'entry') return Number(t.entryPrice);
  if (key === 'sl') return t.sl == null ? null : Number(t.sl);
  if (key === 'tp') return t.tp == null ? null : Number(t.tp);
  if (key === 'btcCorr') return t.btcCorr == null ? null : Number(t.btcCorr);
  if (key === 'btcTrend') return Number(t.btcHealth?.btcTrendScore ?? t.btcTrendScore);
  if (key === 'mark') return Number(t.markPrice ?? t.exitPrice);
  if (key === 'pnl') return t.pnl == null ? null : Number(t.pnl);
  if (key === 'roe') return t.roe == null ? null : Number(t.roe);
  if (key === 'source') return t.source ?? '';
  if (key === 'combo') return pumpTradeCombo(t);
  if (key === 'canonical') {
    return { A: 4, B: 3, WATCH: 2, BLOCK: 1 }[
      String(t.pumpCanonicalCandidateTier ?? 'WATCH').toUpperCase()
    ] ?? 0;
  }
  if (key === 'pumpObs') {
    const best = t.pumpObsBestSelected === true ? 100 : 0;
    const tier = { A: 40, B: 30, WATCH: 20, BLOCK: 10 }[
      String(t.pumpObsSourceTier ?? 'WATCH').toUpperCase()
    ] ?? 0;
    const l1 = { PRIME: 5, GOOD: 4, WATCH: 3, RISK: 2, NO_DATA: 1 }[
      String(t.pumpObsL1Tier ?? 'NO_DATA').toUpperCase()
    ] ?? 0;
    return best + tier + l1;
  }
  if (key === 'evalTier') {
    return { A: 3, B: 2, BLOCK: 1 }[String(t.pumpEvalTier ?? '').toUpperCase()] ?? 0;
  }
  if (key === 'stage2') {
    return { WATCH_PLUS: 3, WATCH: 2, RISK: 1 }[String(t.pumpStage2Tier ?? '').toUpperCase()] ?? 0;
  }
  if (key === 'lift') {
    return { BOOST: 3, NEUTRAL: 2, DEGRADE: 1 }[String(t.pumpLiftTier ?? '').toUpperCase()] ?? 0;
  }
  if (key === 'selector') {
    return { CORE: 4, PROBE: 3, WATCH: 2, AVOID: 1 }[
      String(t.pumpSelectorTier ?? '').toUpperCase()
    ] ?? 0;
  }
  if (key === 'score') return Number((t.source ?? '').replace(/\D/g, '')) || 0;
  if (key === 'time') return Date.parse(t.createdAt ?? '') || 0;
  if (key === 'status') {
    const order = { OPEN: 0, PENDING: 1, ENTRY_READY: 2, CLOSED: 3 };
    return order[t.status] ?? 9;
  }
  return '';
}

function comparePumpPaperValues(a, b, dir) {
  const aMissing = a == null || Number.isNaN(a);
  const bMissing = b == null || Number.isNaN(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const result = typeof a === 'string' || typeof b === 'string'
    ? String(a).localeCompare(String(b), 'en')
    : a - b;
  return dir === 'asc' ? result : -result;
}

function sortPumpPaperTrades(trades) {
  const { key, dir } = pumpPaperSort;
  return trades.slice().sort((a, b) => {
    const result = comparePumpPaperValues(pumpPaperSortValue(a, key), pumpPaperSortValue(b, key), dir);
    if (result !== 0) return result;
    return comparePumpPaperValues(pumpPaperSortValue(a, 'time'), pumpPaperSortValue(b, 'time'), 'desc');
  });
}

function updatePumpPaperSortHeaders() {
  document.querySelectorAll('[data-paper-sort]').forEach((th) => {
    const active = th.dataset.paperSort === pumpPaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (pumpPaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

function ensurePumpPaperPager() {
  let pager = document.getElementById('pumpPaperPager');
  if (pager) return pager;
  if (!pumpPaperCount?.parentElement) return null;
  pager = document.createElement('div');
  pager.id = 'pumpPaperPager';
  pager.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0;color:var(--muted);font-size:12px';
  pumpPaperCount.insertAdjacentElement('afterend', pager);
  return pager;
}

function renderPumpPaperPager() {
  const pager = ensurePumpPaperPager();
  if (!pager || !pumpPaperPagination) return;
  const p = pumpPaperPagination;
  pager.innerHTML = `
    <button class="pump-paper-close-btn" data-pump-page="prev" ${p.hasPrev ? '' : 'disabled'}>Prev</button>
    <span>Page <strong style="color:var(--text)">${p.page}</strong>/<strong style="color:var(--text)">${p.totalPages}</strong> · ${p.total} rows</span>
    <button class="pump-paper-close-btn" data-pump-page="next" ${p.hasNext ? '' : 'disabled'}>Next</button>
    <select id="pumpPaperLimitSelect" style="background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px 8px">
      ${[100, 300, 500, 1000].map((n) => `<option value="${n}" ${n === pumpPaperLimit ? 'selected' : ''}>${n}/page</option>`).join('')}
    </select>
  `;
  pager.querySelector('[data-pump-page="prev"]')?.addEventListener('click', () => loadPumpPaperTrades(Math.max(1, pumpPaperPage - 1), true));
  pager.querySelector('[data-pump-page="next"]')?.addEventListener('click', () => loadPumpPaperTrades(pumpPaperPage + 1, true));
  pager.querySelector('#pumpPaperLimitSelect')?.addEventListener('change', (event) => {
    pumpPaperLimit = Number(event.target.value) || 300;
    loadPumpPaperTrades(1, true);
  });
}

function renderPumpPaperTrades(trades, summary) {
  pumpPaperTradesCache = trades;
  pumpPaperSummaryCache = summary;
  const open   = trades.filter((t) => t.status === 'OPEN' || t.status === 'PENDING' || t.status === 'ENTRY_READY');
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const all    = sortPumpPaperTrades([...open, ...closed]);
  const totalOpen = summary?.open ?? open.length;
  const totalClosed = summary?.closed ?? closed.length;
  const dateLabel = pumpPaperDateLabel();
  const datePrefix = dateLabel ? `${dateLabel} · ` : '';
  let countTxt = `${datePrefix}${totalOpen} đang mở · ${totalClosed} đã đóng`;
  if (pumpPaperPagination) {
    countTxt += ` · page ${pumpPaperPagination.page}/${pumpPaperPagination.totalPages} (${all.length}/${pumpPaperPagination.total})`;
  }
  if (summary && summary.closed > 0) {
    const wr = summary.closed > 0 ? Math.round(summary.wins / summary.closed * 100) : 0;
    countTxt += ` · ✅TP ${summary.tpHits ?? 0} 🔴SL ${summary.slHits ?? 0} · WR ${wr}%`;
    if (summary.avgRoe != null) countTxt += ` · AvgROE ${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`;
  }
  countTxt = appendPumpSummaryPnl(countTxt, summary);
  pumpPaperCount.textContent = countTxt;
  renderPumpPaperOverview(summary);
  renderPumpSourceStats(pumpSourceStats);
  renderPumpObservationStats(pumpObservationStats);
  renderPumpSourceLongCorrReboundStats(pumpSourceLongCorrReboundStats);
  renderPumpSupportEntryStats(pumpSupportEntryStats);
  renderPumpComboCycleStats(pumpComboCycleStats);
  renderEmaLayerAnalysis(emaLayerAnalysis);
  renderPumpCanonicalStats(pumpCanonicalStats);
  renderPumpEvalStats(pumpEvalStats);
  renderPumpStage2Stats(pumpStage2Stats);
  renderPumpLiftStats(pumpLiftStats);
  renderPumpSelectorStats(pumpSelectorStats);
  renderPumpComboStats(pumpPaperComboStats);
  renderPumpPaperPager();

  if (!all.length) {
    pumpPaperBody.innerHTML = '<tr><td colspan="20" class="empty-cell">Chưa có paper trade nào từ pump signals.</td></tr>';
    return;
  }

  pumpPaperBody.innerHTML = all.map((t) => {
    const isLong   = t.side === 'LONG';
    const sideHtml = isLong
      ? `<span style="color:var(--green);font-weight:700">LONG</span>`
      : `<span style="color:var(--red);font-weight:700">SHORT</span>`;
    const isClosed = t.status === 'CLOSED';
    const mark     = t.markPrice ?? t.exitPrice ?? '-';
    const actionBtns = isClosed
      ? `<button class="pump-paper-close-btn" style="opacity:.6;font-size:10px" onclick="deletePumpPaperTrade('${t.id}')">Del</button>`
      : `<button class="pump-paper-close-btn" onclick="closePumpPaperTrade('${t.id}')">Close</button>`;
    const rowStyle = isClosed ? 'opacity:.5' : '';
    const combo = pumpTradeCombo(t);
    const comboShort = combo.length > 42 ? `${combo.slice(0, 42)}...` : combo;
    const slColor = isLong ? 'var(--red)' : 'var(--green)';
    const tpColor = isLong ? 'var(--green)' : 'var(--red)';
    const outcomeHtml = isClosed
      ? t.outcome === 'TP'      ? '<span style="color:var(--green);font-weight:700">✅ TP</span>'
        : t.outcome === 'SL'    ? '<span style="color:var(--red);font-weight:700">🔴 SL</span>'
        : t.outcome === 'TIMEOUT' ? '<span style="color:var(--amber);font-weight:700">⏱ Timeout</span>'
        : '<span style="color:var(--muted)">Manual</span>'
      : t.status === 'PENDING' ? '<span style="color:var(--amber);font-weight:700">⏳ PENDING</span>'
      : '<span style="color:var(--green)">OPEN</span>';
    const dirClass = isLong ? 'long' : 'short';
    const scoreNum = Number((t.source ?? '').replace(/\D/g, '')) || 0;
    const hasOrder = openLimitSymbols.has(t.symbol);
    const orderCell = isClosed
      ? '<td></td>'
      : `<td>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" value="5" min="1" max="10000" step="1"
              style="width:46px;padding:3px 5px;border-radius:4px;border:1px solid var(--line);background:var(--panel-2);color:var(--text);font-size:12px;font-weight:700;text-align:right"
              title="Margin (USDT)">
            <button class="cap-order-btn ${dirClass}"
              onclick="placePumpOrder(this,'${t.symbol}','${t.side}',${t.entryPrice},${t.sl ?? 'null'},${t.tp ?? 'null'},${scoreNum},'')"
              style="padding:3px 8px;font-size:10px;white-space:nowrap"
              ${hasOrder ? 'disabled' : ''}>
              ${hasOrder ? '✓ Đã có' : '📥 LIMIT'}
            </button>
          </div>
        </td>`;
    return `<tr data-id="${t.id}" style="${rowStyle}">
      <td><a href="/?symbol=${t.symbol}" target="_blank" style="color:var(--text);text-decoration:none;font-weight:700">${t.symbol.replace(/USDT$/, '')}<span style="color:var(--muted);font-size:11px;font-weight:400">USDT</span></a></td>
      <td>${sideHtml}</td>
      <td>${fmtPrice(t.entryPrice)}</td>
      <td style="font-size:11px;color:${slColor}">${t.sl != null ? fmtPrice(t.sl) : '<span style="color:var(--muted)">–</span>'}</td>
      <td style="font-size:11px;color:${tpColor}">${t.tp != null ? fmtPrice(t.tp) : '<span style="color:var(--muted)">–</span>'}</td>
      <td>${renderPumpBtcCorrBadge(t)}</td>
      <td>${renderPumpBtcTrendBadge(t)}</td>
      <td data-cell-mark="${t.id}">${fmtPrice(mark)}</td>
      <td data-cell-pnl="${t.id}">${fmtPnlPump(t.pnl, t.roe)}</td>
      <td data-cell-roe="${t.id}">${t.roe != null ? (t.roe >= 0 ? '+' : '') + Number(t.roe).toFixed(1) + '%' : '-'}</td>
      <td style="font-size:11px">${outcomeHtml}</td>
      <td style="font-size:11px;color:var(--text);font-weight:700">${scoreNum || '-'}</td>
      <td style="font-size:10px;color:var(--cyan);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${combo.replace(/"/g, '&quot;')}">${comboShort}</td>
      <td>${renderEmaLayerBadges(t)}</td>
      <td>${renderPumpCanonicalBadge(t)}</td>
      <td>${renderPumpObservationBadges(t)}${renderPumpSourceLongCorrReboundBadge(t)}</td>
      <td style="font-size:10px;color:var(--muted)">${t.source ?? '-'}</td>
      <td style="font-size:11px;color:var(--muted)">${new Date(t.createdAt).toLocaleTimeString('vi')}</td>
      <td>${actionBtns}</td>
      ${orderCell}
    </tr>`;
  }).join('');
  updatePumpPaperSortHeaders();
}

// In-place PNL/MARK update — không re-render cả bảng để tránh flicker
function refreshPumpPaperPnl(trades) {
  let needFullRender = false;
  const currentIds = new Set([...pumpPaperBody.querySelectorAll('tr[data-id]')].map((r) => r.dataset.id));
  const newIds = new Set(trades.map((t) => t.id));
  // Nếu số row thay đổi hoặc có id mới → full render
  if (currentIds.size !== newIds.size) { needFullRender = true; }
  else { for (const id of newIds) { if (!currentIds.has(id)) { needFullRender = true; break; } } }
  if (needFullRender) {
    renderPumpPaperTrades(trades, pumpPaperSummaryCache);
    return;
  }
  // In-place: chỉ cập nhật MARK, PNL, ROE
  for (const t of trades) {
    if (t.status === 'CLOSED') continue; // closed không thay đổi PNL
    const markEl = pumpPaperBody.querySelector(`[data-cell-mark="${t.id}"]`);
    const pnlEl  = pumpPaperBody.querySelector(`[data-cell-pnl="${t.id}"]`);
    const roeEl  = pumpPaperBody.querySelector(`[data-cell-roe="${t.id}"]`);
    const mark   = t.markPrice ?? t.exitPrice ?? '-';
    if (markEl) markEl.textContent = fmtPrice(mark);
    if (pnlEl)  pnlEl.innerHTML    = fmtPnlPump(t.pnl, t.roe);
    if (roeEl)  roeEl.textContent  = t.roe != null ? (t.roe >= 0 ? '+' : '') + Number(t.roe).toFixed(1) + '%' : '-';
  }
  // Cập nhật summary header
  const open   = trades.filter((t) => t.status !== 'CLOSED').length;
  const closed = trades.filter((t) => t.status === 'CLOSED').length;
  const summary = pumpPaperSummaryCache;
  const totalOpen = summary?.open ?? open;
  const totalClosed = summary?.closed ?? closed;
  const dateLabel = pumpPaperDateLabel();
  const datePrefix = dateLabel ? `${dateLabel} · ` : '';
  let countTxt = `${datePrefix}${totalOpen} đang mở · ${totalClosed} đã đóng`;
  if (pumpPaperPagination) {
    countTxt += ` · page ${pumpPaperPagination.page}/${pumpPaperPagination.totalPages} (${trades.length}/${pumpPaperPagination.total})`;
  }
  if (summary && summary.closed > 0) {
    const wr = summary.closed > 0 ? Math.round(summary.wins / summary.closed * 100) : 0;
    countTxt += ` · ✅TP ${summary.tpHits ?? 0} 🔴SL ${summary.slHits ?? 0} · WR ${wr}%`;
    if (summary.avgRoe != null) countTxt += ` · AvgROE ${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`;
  }
  countTxt = appendPumpSummaryPnl(countTxt, summary);
  pumpPaperCount.textContent = countTxt;
  renderPumpPaperOverview(summary);
  renderPumpSourceStats(pumpSourceStats);
  renderPumpObservationStats(pumpObservationStats);
  renderPumpSourceLongCorrReboundStats(pumpSourceLongCorrReboundStats);
  renderPumpSupportEntryStats(pumpSupportEntryStats);
  renderPumpComboCycleStats(pumpComboCycleStats);
  renderEmaLayerAnalysis(emaLayerAnalysis);
  renderPumpCanonicalStats(pumpCanonicalStats);
  renderPumpEvalStats(pumpEvalStats);
  renderPumpStage2Stats(pumpStage2Stats);
  renderPumpLiftStats(pumpLiftStats);
  renderPumpSelectorStats(pumpSelectorStats);
  renderPumpComboStats(pumpPaperComboStats);
  renderPumpPaperPager();
}

let _pumpPaperFetching = false;
let _pumpPaperPendingReload = null;
async function loadPumpPaperTrades(page = pumpPaperPage, forceRender = false, showDateLoading = false) {
  if (showDateLoading) setPumpPaperDateSearchLoading(true);
  if (_pumpPaperFetching) {
    if (forceRender || showDateLoading) {
      const pendingDateLoading = Boolean(_pumpPaperPendingReload?.dateLoading) || showDateLoading;
      _pumpPaperPendingReload = {
        page,
        forceRender,
        stage2: pumpStage2Filter,
        lift: pumpLiftFilter,
        selector: pumpSelectorFilter,
        dateLoading: pendingDateLoading,
      };
    }
    return;
  }
  _pumpPaperFetching = true;
  const requestedStage2Filter = pumpStage2Filter;
  const requestedLiftFilter = pumpLiftFilter;
  const requestedSelectorFilter = pumpSelectorFilter;
  try {
    const nextPage = Math.max(1, Number(page) || 1);
    const query = new URLSearchParams({
      page: String(nextPage),
      limit: String(pumpPaperLimit),
      stage2: pumpStage2Filter || 'all',
      lift: pumpLiftFilter || 'all',
      selector: pumpSelectorFilter || 'all',
    });
    if (pumpPaperDateFrom) query.set('from', pumpPaperDateFrom);
    if (pumpPaperDateTo) query.set('to', pumpPaperDateTo);
    const res = await fetch(`/api/pump-paper-trades?${query}`);
    if (!res.ok) return;
    const data = await res.json();
    pumpPaperPage = data.pagination?.page ?? nextPage;
    pumpPaperPagination = data.pagination ?? null;
    pumpPaperComboStats = data.comboStats ?? [];
    pumpSourceStats = data.sourceStats ?? [];
    pumpObservationStats = data.pumpObservationStats ?? null;
    pumpSourceLongCorrReboundStats = data.sourceLongCorrReboundStats ?? [];
    pumpSupportEntryStats = data.supportEntryStats ?? null;
    pumpComboCycleStats = data.comboCycleStats ?? null;
    emaLayerAnalysis = data.emaLayerAnalysis ?? null;
    pumpCanonicalStats = data.canonicalStats ?? [];
    pumpCanonicalModel = data.canonicalModel ?? null;
    pumpEvalStats = data.pumpEvalStats ?? [];
    pumpStage2Stats = data.stage2Stats ?? [];
    pumpLiftStats = data.liftStats ?? [];
    pumpLiftModel = data.liftModel ?? null;
    pumpSelectorStats = data.selectorStats ?? [];
    pumpSelectorModel = data.selectorModel ?? null;
    if (pumpStage2Filter === requestedStage2Filter) {
      pumpStage2Filter = data.filter?.stage2 ?? pumpStage2Filter;
    }
    if (pumpLiftFilter === requestedLiftFilter) {
      pumpLiftFilter = data.filter?.lift ?? pumpLiftFilter;
    }
    if (pumpSelectorFilter === requestedSelectorFilter) {
      pumpSelectorFilter = data.filter?.selector ?? pumpSelectorFilter;
    }
    if (pumpStage2FilterEl) pumpStage2FilterEl.value = pumpStage2Filter;
    if (pumpLiftFilterEl) pumpLiftFilterEl.value = pumpLiftFilter;
    if (pumpSelectorFilterEl) pumpSelectorFilterEl.value = pumpSelectorFilter;
    const trades = data.trades ?? [];
    pumpPaperSummaryCache = data.summary;
    // Nếu bảng đã có rows → in-place update, ngược lại full render
    if (pumpPaperTradesCache.length > 0 && !forceRender) {
      pumpPaperTradesCache = trades;
      refreshPumpPaperPnl(trades);
    } else {
      renderPumpPaperTrades(trades, data.summary);
    }
  } catch {} finally {
    _pumpPaperFetching = false;
    const pending = _pumpPaperPendingReload;
    _pumpPaperPendingReload = null;
    if (pending) {
      pumpStage2Filter = pending.stage2;
      pumpLiftFilter = pending.lift;
      pumpSelectorFilter = pending.selector;
      queueMicrotask(() => loadPumpPaperTrades(
        pending.page,
        pending.forceRender,
        pending.dateLoading || showDateLoading,
      ));
    } else if (showDateLoading) {
      setPumpPaperDateSearchLoading(false);
    }
  }
}

// Smart polling: 3s khi có OPEN trades, 15s khi không có
let _pumpPaperPollTimer = null;
function schedulePumpPaperPoll() {
  clearTimeout(_pumpPaperPollTimer);
  const hasOpen = pumpPaperTradesCache.some((t) => t.status === 'OPEN');
  _pumpPaperPollTimer = setTimeout(async () => {
    await loadPumpPaperTrades();
    schedulePumpPaperPoll();
  }, hasOpen ? 3_000 : 15_000);
}

window.enterPumpPaperTrade = async function(btn, symbol, side, entry, score, sl, tp) {
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const sig = allSignals.find((row) => row.symbol === symbol && row.action === side)
      ?? { symbol, action: side, score };
    const res = await fetch('/api/pump-paper-trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol,
        side,
        marginUsdt: 1,
        leverage: 10,
        entryPrice: entry,
        tp: tp ?? null,
        sl: sl ?? null,
        source: `pump-${score}`,
        pumpSignalType: sig.type ?? null,
        pumpSignalGrade: sig.grade ?? null,
        pumpSignalMarketOk: sig.marketOk ?? null,
        pumpSignalFactors: sig.factors ?? null,
        pumpSignalTimeframe: sig.factors?.timeframe ?? sig.interval ?? null,
        pumpCombo: pumpSignalComboOf(sig),
      }),
    });
    if (res.ok) {
      btn.textContent = '⏳';
      setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
      loadPumpPaperTrades();
    } else {
      btn.textContent = 'ERR';
      setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
    }
  } catch {
    btn.textContent = 'ERR';
    setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
  }
};

window.closePumpPaperTrade = async function(id) {
  try {
    await fetch('/api/pump-paper-trades/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadPumpPaperTrades();
    schedulePumpPaperPoll();
  } catch {}
};

window.deletePumpPaperTrade = async function(id) {
  try {
    await fetch('/api/pump-paper-trades/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadPumpPaperTrades();
    schedulePumpPaperPoll();
  } catch {}
};

initializePumpPaperDateRange();

(async () => {
  connect();
  const paperLoad = loadPumpPaperTrades();
  const signalLoad = fetchAndApply();
  const orderLoad = loadOpenLimitOrders();
  setInterval(loadOpenLimitOrders, 30_000);
  await paperLoad;
  schedulePumpPaperPoll();
  await Promise.allSettled([signalLoad, orderLoad]);
})();
