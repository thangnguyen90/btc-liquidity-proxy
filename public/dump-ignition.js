const SSE_URL = '/api/dump-ignition-stream';

let allSignals  = [];
let scannedAt   = null;
let total       = 0;

const grid          = document.getElementById('diGrid');
const ignitionCount = document.getElementById('ignitionCount');
const earlyCount    = document.getElementById('earlyCount');
const avgScore      = document.getElementById('avgScore');
const lastScan      = document.getElementById('lastScan');
const nextRefresh   = document.getElementById('nextRefresh');
const scanStatus    = document.getElementById('scanStatus');
const scanMeta      = document.getElementById('scanMeta');
const metaTotal     = document.getElementById('metaTotal');
const metaSignals   = document.getElementById('metaSignals');
const metaTime      = document.getElementById('metaTime');
const visibleCount  = document.getElementById('visibleCount');
const searchInput   = document.getElementById('searchInput');
const searchClear   = document.getElementById('searchClear');
const scoreFilter   = document.getElementById('scoreFilter');
const stageFilter   = document.getElementById('stageFilter');

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

// ── Note parser ───────────────────────────────────────────────────────────────
// note format examples:
//   EARLY:     "liveEMA=Y | bias=full | volX=1.95 | rangeATR=0.82 | ribbonPct=1.20%"
//   IGNITION:  "volX=2.31 | ema50Slope=-0.012%/bar"

function parseNote(note) {
  const out = {};
  if (!note) return out;
  // Split on | or newline
  note.split(/[|\n]/).forEach((part) => {
    const [k, v] = part.trim().split('=');
    if (!k || v == null) return;
    const key = k.trim();
    const val = v.trim();
    out[key] = val;
  });
  return out;
}

// ── Factor chips ──────────────────────────────────────────────────────────────

function buildFactors(sig) {
  const parsed  = parseNote(sig.note);
  const isIgn   = sig.type === 'dump_ignition';
  const chips   = [];

  // Vol spike
  const volX = parseFloat(parsed['volX'] ?? parsed['vol'] ?? 0);
  if (volX > 0) {
    const volOk = volX >= (isIgn ? 1.8 : 1.2);
    chips.push({ label: `Vol ${volX.toFixed(2)}×`, cls: volOk ? 'ok' : 'warn' });
  }

  // Range vs ATR
  const rangeATR = parseFloat(parsed['rangeATR'] ?? 0);
  if (rangeATR > 0) {
    const rOk = rangeATR >= (isIgn ? 1.0 : 0.7);
    chips.push({ label: `Range ${rangeATR.toFixed(2)} ATR`, cls: rOk ? 'ok' : '' });
  }

  // Ribbon pct (EARLY only)
  const ribbonPct = parsed['ribbonPct'];
  if (ribbonPct) {
    const ribbonNum = parseFloat(ribbonPct);
    const ribbonOk  = ribbonNum <= 1.5;
    chips.push({ label: `Ribbon ${ribbonPct}`, cls: ribbonOk ? 'ok' : 'warn' });
  }

  // Live EMA (EARLY only)
  const liveEMA = parsed['liveEMA'];
  if (liveEMA) {
    chips.push({ label: `LiveEMA ${liveEMA}`, cls: liveEMA === 'Y' ? 'ok' : '' });
  }

  // Bias (EARLY only)
  const bias = parsed['bias'];
  if (bias) {
    const biasCls = bias === 'full' ? 'ok' : bias === 'soft' ? 'warn' : '';
    chips.push({ label: `Bias ${bias}`, cls: biasCls });
  }

  // EMA50 slope (IGNITION only)
  const slope = parsed['ema50Slope'];
  if (slope) {
    const slopeNum = parseFloat(slope);
    const slopeOk  = slopeNum < -0.005;
    chips.push({ label: `EMA50 ${slope}`, cls: slopeOk ? 'ok' : 'warn' });
  }

  // Chase warning (if present in note)
  const chaseMatch = (sig.note || '').match(/chase[:\s]+(\d+\.?\d*)%/i);
  if (chaseMatch) {
    const chasePct = parseFloat(chaseMatch[1]);
    if (chasePct > 15) {
      chips.push({ label: `Chase ${chasePct.toFixed(0)}%`, cls: 'bad' });
    }
  }

  return chips.map((c) => `<span class="di-chip ${c.cls}">${c.label}</span>`).join('');
}

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCard(sig) {
  const isIgnition  = sig.type === 'dump_ignition';
  const stageClass  = isIgnition ? 'stage-ignition' : 'stage-early';
  const stageBadge  = isIgnition ? 'ignition' : 'early';
  const stageName   = isIgnition ? 'IGNITION' : 'EARLY';
  const changeClass = (sig.change24h ?? 0) >= 0 ? 'positive' : 'negative';
  const gradeClass  = `grade-${(sig.grade || 'd').toLowerCase()}`;
  const detailUrl   = `/?symbol=${sig.symbol}`;
  const factors     = buildFactors(sig);
  const dotCls      = isIgnition ? 'ignition' : 'early';

  // Pattern description from reason
  const patternDesc = sig.reason || (isIgnition
    ? 'BB lower break + vol spike + EMA stack bearish'
    : 'Squeeze + ribbon compression + pre-ignition setup');

  return `
    <article class="di-card ${stageClass}">
      <div class="di-card-top">
        <div class="di-symbol-wrap">
          <a class="di-symbol" href="${detailUrl}" target="_blank">
            ${sig.symbol.replace(/USDT$/, '')}<span class="sym-usdt">USDT</span>
          </a>
          <span class="di-change ${changeClass}" data-price="${sig.symbol}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="di-right">
          <span class="di-action-badge">🔴 SHORT</span>
          <div class="di-score-wrap">
            <span class="di-score-num">${sig.score}</span>
            <span class="di-grade ${gradeClass}">${sig.grade}</span>
          </div>
          <span class="di-stage-badge ${stageBadge}">${stageName}</span>
        </div>
      </div>

      <div class="di-pattern">
        <span class="di-pattern-dot ${dotCls}"></span>
        <span>${patternDesc}</span>
      </div>

      <div class="di-prices">
        <div class="di-price-cell">
          <span>Entry (Short)</span>
          <strong class="negative">${fmtPrice(sig.entry)}</strong>
        </div>
        <div class="di-price-cell">
          <span>SL</span>
          <strong class="negative">${fmtPrice(sig.sl)}</strong>
        </div>
        <div class="di-price-cell">
          <span>TP</span>
          <strong class="positive">${fmtPrice(sig.tp)}</strong>
        </div>
      </div>

      ${factors ? `<div class="di-factors">${factors}</div>` : ''}
      ${sig.note ? `<div class="di-note">${sig.note}</div>` : ''}

      <div class="di-footer">
        <span>${timeAgo(sig.scannedAt)}</span>
        <span></span>
      </div>
    </article>
  `;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const search    = searchInput.value.trim().toUpperCase();
  const minScore  = Number(scoreFilter.value);
  const stageVal  = stageFilter.value;

  let rows = allSignals.slice();
  if (search)    rows = rows.filter((s) => s.symbol.includes(search));
  if (minScore > 0) rows = rows.filter((s) => s.score >= minScore);
  if (stageVal)  rows = rows.filter((s) => s.type === stageVal);

  visibleCount.textContent = rows.length;

  const igns  = allSignals.filter((s) => s.type === 'dump_ignition');
  const earls = allSignals.filter((s) => s.type === 'dump_ignition_early');
  ignitionCount.textContent = igns.length;
  ignitionCount.className   = igns.length > 0 ? 'negative' : '';
  earlyCount.textContent    = earls.length;
  earlyCount.style.color    = earls.length > 0 ? 'var(--amber)' : '';

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
      <div class="di-empty">
        <strong>${isEmpty ? (isWarm ? 'Không có signal' : 'Đang warm cache...') : 'Không có kết quả'}</strong>
        ${isEmpty
          ? (isWarm
              ? 'Chưa có dump ignition pattern. Thị trường chưa có squeeze breakdown rõ ràng.'
              : 'Kline cache đang được tải. Tự động cập nhật khi xong (~30-60s).')
          : 'Thử hạ min score, đổi stage filter, hoặc xóa search.'
        }
      </div>`;
    return;
  }

  grid.innerHTML = rows.map(buildCard).join('');
}

// ── Apply new data from SSE ────────────────────────────────────────────────────

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
  if (staleSec != null && staleSec > 90) {
    if (!staleEl) {
      staleEl = document.createElement('div');
      staleEl.id = 'staleWarn';
      staleEl.style.cssText = 'background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);border-radius:6px;padding:8px 14px;font-size:12px;color:#fbbf24;margin-top:8px';
      scanMeta.insertAdjacentElement('afterend', staleEl);
    }
    const isHard = staleSec > 300;
    staleEl.style.cssText = isHard
      ? 'background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);border-radius:6px;padding:8px 14px;font-size:12px;color:#f87171;margin-top:8px'
      : 'background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);border-radius:6px;padding:8px 14px;font-size:12px;color:#fbbf24;margin-top:8px';
    staleEl.textContent = isHard
      ? `🚫 Binance IP bị block — last tick ${staleSec}s ago. Đổi IP hoặc chờ vài phút.`
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
    scanStatus.textContent  = '● Live';
    scanStatus.style.color  = 'var(--red)';
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
stageFilter.addEventListener('change', render);

// ── Live price socket ─────────────────────────────────────────────────────────

const PRICE_URLS = [
  'wss://fstream.binance.com/ws/!markPrice@arr@1s',
  'wss://fstream.binancefuture.com/ws/!markPrice@arr@1s',
];
let priceUrlIdx = 0;

function connectPriceSocket() {
  const ws = new WebSocket(PRICE_URLS[priceUrlIdx % PRICE_URLS.length]);

  ws.onmessage = (e) => {
    try {
      const rows = JSON.parse(e.data);
      if (!Array.isArray(rows)) return;
      rows.forEach((row) => {
        if (row.e !== 'markPriceUpdate') return;
        const p = Number(row.p);
        if (!isFinite(p)) return;
        document.querySelectorAll(`[data-price="${row.s}"]`).forEach((el) => {
          const text = el.textContent;
          const dot  = text.indexOf('·');
          if (dot !== -1) el.textContent = text.slice(0, dot + 2) + fmtPrice(p);
        });
      });
    } catch {}
  };

  ws.onclose = () => {
    priceUrlIdx++;
    setTimeout(connectPriceSocket, 3000);
  };
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function fetchAndApply(attempt = 0) {
  try {
    scanStatus.textContent = attempt === 0 ? 'Đang tải...' : `Warming cache... (${attempt})`;
    const res = await fetch('/api/dump-ignition-signals');
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
  connectPriceSocket();
})();
