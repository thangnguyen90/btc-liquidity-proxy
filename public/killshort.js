const SSE_URL = '/api/killshort-stream';

let allSignals = [];
let scannedAt  = null;
let total      = 0;

const grid        = document.getElementById('ksGrid');
const longCount   = document.getElementById('longCount');
const avgScore    = document.getElementById('avgScore');
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

// ── Factor chips ──────────────────────────────────────────────────────────────

function buildFactors(sig) {
  const f     = sig.factors || {};
  const chips = [];

  const sweepVolOk = (f.sweepVolX ?? 0) >= 2.0;
  chips.push({ label: `Sweep ${(f.sweepVolX ?? 0).toFixed(1)}×`, ok: sweepVolOk ? 'ok' : '' });

  const revVolOk = (f.revVolX ?? 0) >= 2.5;
  chips.push({ label: `Rev ${(f.revVolX ?? 0).toFixed(1)}×`, ok: revVolOk ? 'ok' : '' });

  const wickOk = (f.wickFrac ?? 0) >= 0.6;
  chips.push({ label: `Wick ${((f.wickFrac ?? 0) * 100).toFixed(0)}%`, ok: wickOk ? 'ok' : '' });

  const cpOk = (f.closePos ?? 0) >= 0.7;
  chips.push({ label: `Close pos ${((f.closePos ?? 0) * 100).toFixed(0)}%`, ok: cpOk ? 'ok' : '' });

  if (f.rsiDelta != null) {
    const rsiOk = f.rsiDelta >= 15;
    chips.push({ label: `RSI +${f.rsiDelta}`, ok: rsiOk ? 'ok' : '' });
  }

  if (f.engulfs != null) {
    chips.push({ label: f.engulfs ? 'Engulf ✓' : 'No engulf', ok: f.engulfs ? 'ok' : 'warn' });
  }

  if (f.emaOk != null) {
    chips.push({ label: f.emaOk ? 'EMA ✓' : 'EMA ✗', ok: f.emaOk ? 'ok' : '' });
  }

  return chips.map((c) => `<span class="ks-factor ${c.ok}">${c.label}</span>`).join('');
}

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCard(sig) {
  const changeClass = (sig.change24h ?? 0) >= 0 ? 'positive' : 'negative';
  const gradeClass  = `grade-${(sig.grade || 'd').toLowerCase()}`;
  const detailUrl   = `/?symbol=${sig.symbol}`;
  const factors     = buildFactors(sig);
  const rsiLine     = sig.factors?.rsiAtSweep != null
    ? `Sweep RSI=${sig.factors.rsiAtSweep} → ${sig.factors.rsiAtSweep != null && sig.factors.rsiDelta != null ? (sig.factors.rsiAtSweep + sig.factors.rsiDelta).toFixed(0) : '-'}`
    : '';

  return `
    <article class="ks-card">
      <div class="ks-card-top">
        <div class="ks-symbol-wrap">
          <a class="ks-symbol" href="${detailUrl}" target="_blank">
            ${sig.symbol.replace(/USDT$/, '')}<span class="sym-usdt">USDT</span>
          </a>
          <span class="ks-change ${changeClass}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="ks-right">
          <span class="ks-action-badge">🟢 LONG</span>
          <div class="ks-score-wrap">
            <span class="ks-score-num">${sig.score}</span>
            <span class="ks-grade ${gradeClass}">${sig.grade}</span>
          </div>
          <span class="ks-type-badge">Kill Short</span>
        </div>
      </div>

      <div class="ks-pattern">
        <span class="ks-pattern-dot"></span>
        <span>Stop hunt: sweep lows → high-vol reversal engulf${rsiLine ? ` · ${rsiLine}` : ''}</span>
      </div>

      <div class="ks-prices">
        <div class="ks-price-cell">
          <span>Entry</span>
          <strong>${fmtPrice(sig.entry)}</strong>
        </div>
        <div class="ks-price-cell">
          <span>SL</span>
          <strong class="negative">${fmtPrice(sig.sl)}</strong>
        </div>
        <div class="ks-price-cell">
          <span>TP</span>
          <strong class="positive">${fmtPrice(sig.tp)}</strong>
        </div>
      </div>

      <div class="ks-factors">${factors}</div>
      <div class="ks-note">${sig.note || ''}</div>

      <div class="ks-footer">
        <span>${timeAgo(sig.scannedAt)}</span>
        <span>${sig.blockShort ? '🔒 blocks short' : ''}</span>
      </div>
    </article>
  `;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const search   = searchInput.value.trim().toUpperCase();
  const minScore = Number(scoreFilter.value);

  let rows = allSignals.slice();
  if (search)       rows = rows.filter((s) => s.symbol.includes(search));
  if (minScore > 0) rows = rows.filter((s) => s.score >= minScore);

  visibleCount.textContent = rows.length;
  longCount.textContent    = allSignals.length;
  longCount.className      = allSignals.length > 0 ? 'positive' : '';
  totalScanned.textContent = total || '-';

  const scores = allSignals.map((s) => s.score);
  avgScore.textContent = scores.length > 0
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(0)
    : '-';

  if (scannedAt) {
    lastScan.textContent = new Date(scannedAt).toLocaleTimeString('vi');
    metaTime.textContent = new Date(scannedAt).toLocaleTimeString('vi');
  }

  if (rows.length === 0) {
    const isEmpty = allSignals.length === 0;
    const isWarm  = total > 0;
    grid.innerHTML = `
      <div class="ks-empty">
        <strong>${isEmpty ? (isWarm ? 'Không có signal' : 'Đang warm cache...') : 'Không có kết quả'}</strong>
        ${isEmpty
          ? (isWarm
              ? 'Chưa có kill short pattern. Thị trường chưa có stop hunt rõ ràng.'
              : 'Kline cache đang được tải. Tự động cập nhật khi xong (~30-60s).')
          : 'Thử hạ min score.'
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

  let staleEl = document.getElementById('staleWarn');
  if (isStale || (staleSec != null && staleSec > 90)) {
    if (!staleEl) {
      staleEl = document.createElement('div');
      staleEl.id = 'staleWarn';
      staleEl.style.cssText = 'background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);border-radius:6px;padding:8px 14px;font-size:12px;color:#fbbf24;margin-top:8px';
      scanMeta.insertAdjacentElement('afterend', staleEl);
    }
    staleEl.textContent = `⚠ Kline data stale${staleSec != null ? ` — last tick ${staleSec}s ago` : ''}. WebSocket đang reconnect.`;
  } else if (staleEl) {
    staleEl.remove();
  }

  render();
}

// ── SSE connection ────────────────────────────────────────────────────────────

function connect() {
  const es = new EventSource(SSE_URL);

  es.onopen = () => {
    scanStatus.textContent  = '● Live';
    scanStatus.style.color  = 'var(--green)';
    nextRefresh.textContent = 'Cập nhật mỗi nến 15m';
  };

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if ((data.signals ?? []).length === 0 && allSignals.length > 0) return;
      applyData(data);
    } catch {}
  };

  es.onerror = () => {
    scanStatus.textContent  = 'Reconnecting...';
    scanStatus.style.color  = 'var(--amber)';
    nextRefresh.textContent = '';
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
scoreFilter.addEventListener('change', render);

// ── Boot ──────────────────────────────────────────────────────────────────────

async function fetchAndApply(attempt = 0) {
  try {
    scanStatus.textContent = attempt === 0 ? 'Đang tải...' : `Warming cache... (${attempt})`;
    const res = await fetch('/api/killshort-signals');
    if (res.ok) {
      const data = await res.json();
      applyData(data);
      if ((data.processed ?? 0) === 0 && attempt < 12) {
        const delay = Math.min(5000 + attempt * 3000, 20000);
        setTimeout(() => fetchAndApply(attempt + 1), delay);
      }
    }
  } catch {}
}

(async () => {
  await fetchAndApply();
  connect();
})();
