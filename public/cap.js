const SSE_URL = '/api/cap-stream';

let allSignals = [];
let scannedAt  = null;
let total      = 0;

const grid        = document.getElementById('capGrid');
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

// ── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_META = {
  sc_spring: {
    label: 'SC → Spring',
    phase: 'Wyckoff Phase A–B: Selling Climax confirmed by Spring / Automatic Rally',
    cls:   'long-type',
  },
  bc_utad: {
    label: 'BC → UTAD',
    phase: 'Wyckoff Phase A–B: Buying Climax confirmed by UTAD / Distribution',
    cls:   'short-type',
  },
};

// ── Factor chips ──────────────────────────────────────────────────────────────

function buildFactors(sig) {
  const f      = sig.factors || {};
  const isLong = sig.action === 'LONG';
  const chips  = [];

  const volOk = (f.volRatio ?? 0) >= 2.5;
  chips.push({ label: `Vol ${(f.volRatio ?? 0).toFixed(1)}×`, ok: volOk ? 'ok' : 'warn' });

  const rngOk = (f.rangeX ?? 0) >= 1.5;
  chips.push({ label: `Range ${(f.rangeX ?? 0).toFixed(1)}× ATR`, ok: rngOk ? 'ok' : '' });

  chips.push({ label: f.bbBack ? 'BB re-entry ✓' : 'BB re-entry ✗', ok: f.bbBack ? 'ok' : 'warn' });

  if (f.rsi6val != null) {
    const rsiOk = isLong ? f.rsi6val > 30 : f.rsi6val < 70;
    chips.push({ label: `RSI6 ${f.rsi6val}`, ok: rsiOk ? 'ok' : 'warn' });
  }

  if (isLong && f.emaBull != null) {
    chips.push({ label: f.emaBull ? 'EMA Bull ✓' : 'EMA Bull ✗', ok: f.emaBull ? 'ok' : '' });
  }
  if (!isLong && f.emaBear != null) {
    chips.push({ label: f.emaBear ? 'EMA Bear ✓' : 'EMA Bear ✗', ok: f.emaBear ? 'ok' : '' });
  }

  if (f.vNowX != null) {
    chips.push({ label: `Now ${f.vNowX.toFixed(1)}× vol`, ok: f.vNowX >= 1.5 ? 'ok' : '' });
  }

  return chips.map((c) => `<span class="cap-factor ${c.ok}">${c.label}</span>`).join('');
}

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCard(sig) {
  const isLong    = sig.action === 'LONG';
  const dirClass  = isLong ? 'long' : 'short';
  const dirIcon   = isLong ? '🟢' : '🔴';
  const dirLabel  = isLong ? 'LONG' : 'SHORT';
  const changeClass = (sig.change24h ?? 0) >= 0 ? 'positive' : 'negative';
  const gradeClass  = `grade-${(sig.grade || 'd').toLowerCase()}`;
  const meta        = TYPE_META[sig.type] ?? { label: sig.type, phase: '', cls: '' };
  const detailUrl   = `/?symbol=${sig.symbol}`;
  const slColor     = isLong ? 'negative' : 'positive';
  const tpColor     = isLong ? 'positive' : 'negative';
  const factors     = buildFactors(sig);

  return `
    <article class="cap-card ${dirClass}">
      <div class="cap-card-top">
        <div class="cap-symbol-wrap">
          <a class="cap-symbol" href="${detailUrl}" target="_blank">
            ${sig.symbol.replace(/USDT$/, '')}<span class="sym-usdt">USDT</span>
          </a>
          <span class="cap-change ${changeClass}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="cap-right">
          <span class="cap-action-badge ${dirClass}">${dirIcon} ${dirLabel}</span>
          <div class="cap-score-wrap">
            <span class="cap-score-num">${sig.score}</span>
            <span class="cap-grade ${gradeClass}">${sig.grade}</span>
          </div>
          <span class="cap-type-badge ${meta.cls}">${meta.label}</span>
        </div>
      </div>

      <div class="cap-phase">
        <span class="cap-phase-dot ${dirClass}"></span>
        <span>${meta.phase}</span>
      </div>

      <div class="cap-prices">
        <div class="cap-price-cell">
          <span>Entry</span>
          <strong>${fmtPrice(sig.entry)}</strong>
        </div>
        <div class="cap-price-cell">
          <span>SL</span>
          <strong class="${slColor}">${fmtPrice(sig.sl)}</strong>
        </div>
        <div class="cap-price-cell">
          <span>TP</span>
          <strong class="${tpColor}">${fmtPrice(sig.tp)}</strong>
        </div>
      </div>

      <div class="cap-factors">${factors}</div>
      <div class="cap-note">${sig.note || ''}</div>

      <div class="cap-footer">
        <span>${timeAgo(sig.scannedAt)}</span>
        <span>
          ${sig.blockShort ? '🔒 blocks short' : ''}
          ${sig.blockLong  ? '🔒 blocks long'  : ''}
        </span>
      </div>
    </article>
  `;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const search   = searchInput.value.trim().toUpperCase();
  const action   = actionFilter.value;
  const minScore = Number(scoreFilter.value);

  let rows = allSignals.slice();
  if (search)           rows = rows.filter((s) => s.symbol.includes(search));
  if (action !== 'all') rows = rows.filter((s) => s.action === action);
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
    grid.innerHTML = `
      <div class="cap-empty">
        <strong>${isEmpty ? 'Chưa có signal' : 'Không có kết quả'}</strong>
        ${isEmpty
          ? 'Chưa có capitulation/spring nào. Cache đang warm hoặc thị trường chưa có cú shock.'
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

  let staleEl = document.getElementById('staleWarn');
  if (isStale || (staleSec != null && staleSec > 90)) {
    if (!staleEl) {
      staleEl = document.createElement('div');
      staleEl.id = 'staleWarn';
      staleEl.style.cssText = 'background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);border-radius:6px;padding:8px 14px;font-size:12px;color:#fbbf24;margin-top:8px';
      scanMeta.insertAdjacentElement('afterend', staleEl);
    }
    staleEl.textContent = `⚠ Kline data stale — last tick ${staleSec}s ago. WebSocket đang reconnect.`;
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
    try { applyData(JSON.parse(e.data)); } catch {}
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
actionFilter.addEventListener('change', render);
scoreFilter.addEventListener('change', render);

// ── Boot ──────────────────────────────────────────────────────────────────────

connect();
