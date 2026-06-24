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

let pumpPaperTradesCache  = [];
let pumpPaperSummaryCache = null;
let pumpPaperSort = { key: 'status', dir: 'asc' };
let pumpPaperPage = 1;
let pumpPaperLimit = 300;
let pumpPaperPagination = null;

document.addEventListener('click', (e) => {
  const th = e.target.closest('[data-paper-sort]');
  if (!th || !th.classList.contains('pump-paper-sort')) return;
  const key = th.dataset.paperSort;
  if (pumpPaperSort.key === key) {
    pumpPaperSort.dir = pumpPaperSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    pumpPaperSort = { key, dir: key === 'status' ? 'asc' : 'desc' };
  }
  renderPumpPaperTrades(pumpPaperTradesCache, pumpPaperSummaryCache);
});

function fmtPnlPump(pnl, roe) {
  if (pnl == null) return '<span style="color:var(--muted)">–</span>';
  const sign = pnl >= 0 ? '+' : '';
  const cls  = pnl >= 0 ? 'positive' : 'negative';
  return `<span class="${cls}">${sign}$${Math.abs(pnl).toFixed(3)} (${sign}${Number(roe ?? 0).toFixed(1)}%)</span>`;
}

function pumpPaperSortValue(t, key) {
  if (key === 'symbol') return t.symbol ?? '';
  if (key === 'side') return t.side ?? '';
  if (key === 'entry') return Number(t.entryPrice);
  if (key === 'sl') return t.sl == null ? null : Number(t.sl);
  if (key === 'tp') return t.tp == null ? null : Number(t.tp);
  if (key === 'mark') return Number(t.markPrice ?? t.exitPrice);
  if (key === 'pnl') return t.pnl == null ? null : Number(t.pnl);
  if (key === 'roe') return t.roe == null ? null : Number(t.roe);
  if (key === 'source') return t.source ?? '';
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
  let countTxt = `${open.length} đang mở · ${closed.length} đã đóng`;
  if (pumpPaperPagination) {
    countTxt += ` · page ${pumpPaperPagination.page}/${pumpPaperPagination.totalPages} (${all.length}/${pumpPaperPagination.total})`;
  }
  if (summary && summary.closed > 0) {
    const wr = summary.closed > 0 ? Math.round(summary.wins / summary.closed * 100) : 0;
    countTxt += ` · ✅TP ${summary.tpHits ?? 0} 🔴SL ${summary.slHits ?? 0} · WR ${wr}%`;
    if (summary.avgRoe != null) countTxt += ` · AvgROE ${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`;
  }
  pumpPaperCount.textContent = countTxt;
  renderPumpPaperPager();

  if (!all.length) {
    pumpPaperBody.innerHTML = '<tr><td colspan="14" class="empty-cell">Chưa có paper trade nào từ pump signals.</td></tr>';
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
      <td data-cell-mark="${t.id}">${fmtPrice(mark)}</td>
      <td data-cell-pnl="${t.id}">${fmtPnlPump(t.pnl, t.roe)}</td>
      <td data-cell-roe="${t.id}">${t.roe != null ? (t.roe >= 0 ? '+' : '') + Number(t.roe).toFixed(1) + '%' : '-'}</td>
      <td style="font-size:11px">${outcomeHtml}</td>
      <td style="font-size:11px;color:var(--text);font-weight:700">${scoreNum || '-'}</td>
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
  let countTxt = `${open} đang mở · ${closed} đã đóng`;
  if (pumpPaperPagination) {
    countTxt += ` · page ${pumpPaperPagination.page}/${pumpPaperPagination.totalPages} (${trades.length}/${pumpPaperPagination.total})`;
  }
  if (summary && summary.closed > 0) {
    const wr = summary.closed > 0 ? Math.round(summary.wins / summary.closed * 100) : 0;
    countTxt += ` · ✅TP ${summary.tpHits ?? 0} 🔴SL ${summary.slHits ?? 0} · WR ${wr}%`;
    if (summary.avgRoe != null) countTxt += ` · AvgROE ${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`;
  }
  pumpPaperCount.textContent = countTxt;
  renderPumpPaperPager();
}

let _pumpPaperFetching = false;
async function loadPumpPaperTrades(page = pumpPaperPage, forceRender = false) {
  if (_pumpPaperFetching) return;
  _pumpPaperFetching = true;
  try {
    const nextPage = Math.max(1, Number(page) || 1);
    const res = await fetch(`/api/pump-paper-trades?page=${nextPage}&limit=${pumpPaperLimit}`);
    if (!res.ok) return;
    const data = await res.json();
    pumpPaperPage = data.pagination?.page ?? nextPage;
    pumpPaperPagination = data.pagination ?? null;
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
    const res = await fetch('/api/pump-paper-trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol, side, marginUsdt: 1, leverage: 10, entryPrice: entry, tp: tp ?? null, sl: sl ?? null, source: `pump-${score}` }),
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

(async () => {
  await fetchAndApply();
  connect();
  await loadOpenLimitOrders();
  setInterval(loadOpenLimitOrders, 30_000);
  await loadPumpPaperTrades();
  schedulePumpPaperPoll();
})();
