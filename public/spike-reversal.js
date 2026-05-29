const SSE_URL = '/api/spike-reversal-stream';

let allSignals = [];
let scannedAt  = null;
let total      = 0;

let srPaperTrades      = [];
let srPaperOpenSymbols = new Set();
let srPaperSummaryCache = null;

const grid        = document.getElementById('srGrid');
const shortCount  = document.getElementById('shortCount');
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

  // Spike body/move
  const bodyPct = Math.max(f.spikeBodyPct ?? 0, f.spikeMovePct ?? 0);
  const bodyOk  = bodyPct >= 5.0;
  chips.push({ label: `Spike body ${bodyPct.toFixed(1)}%`, cls: bodyOk ? 'ok' : '' });

  // Spike volume
  const volOk = (f.spikeVolRatio ?? 0) >= 3.0;
  chips.push({ label: `Spike vol ${(f.spikeVolRatio ?? 0).toFixed(1)}×`, cls: volOk ? 'ok' : '' });

  // Overextension vs EMA13
  const extOk = (f.overextPct ?? 0) >= 8.0;
  chips.push({ label: `Overext ${(f.overextPct ?? 0).toFixed(1)}%`, cls: extOk ? 'ok' : '' });

  // RSI overbought
  if (f.rsi14 != null) {
    const rsiOk = f.rsi14 >= 70;
    const rsiWarn = f.rsi14 >= 65;
    chips.push({ label: `RSI14 ${f.rsi14.toFixed(0)}`, cls: rsiOk ? 'ok' : rsiWarn ? 'warn' : '' });
  }

  // Reversal body
  const revOk = (f.revBodyPct ?? 0) >= 1.5;
  chips.push({ label: `Rev body ${(f.revBodyPct ?? 0).toFixed(1)}%`, cls: revOk ? 'ok' : '' });

  // Reversal vol
  const revVolOk = (f.revVolRatio ?? 0) >= 2.0;
  chips.push({ label: `Rev vol ${(f.revVolRatio ?? 0).toFixed(1)}×`, cls: revVolOk ? 'ok' : '' });

  // Rejection fraction
  const rejOk = (f.rejectFrac ?? 0) >= 0.5;
  chips.push({ label: `Reject ${((f.rejectFrac ?? 0) * 100).toFixed(0)}%`, cls: rejOk ? 'ok' : '' });

  // Bars since spike
  if (f.barsSinceSpike != null) {
    const freshOk = f.barsSinceSpike <= 2;
    chips.push({ label: `${f.barsSinceSpike}bar후spike`, cls: freshOk ? 'ok' : 'warn' });
  }

  // Chase
  if ((f.chasePct ?? 0) > 0.15) {
    chips.push({ label: `Chase ${((f.chasePct ?? 0) * 100).toFixed(0)}%`, cls: 'bad' });
  }

  return chips.map((c) => `<span class="sr-factor ${c.cls}">${c.label}</span>`).join('');
}

// ── Card builder ──────────────────────────────────────────────────────────────

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
  const changeClass = (sig.change24h ?? 0) >= 0 ? 'positive' : 'negative';
  const gradeClass  = `grade-${(sig.grade || 'd').toLowerCase()}`;
  const detailUrl   = `/?symbol=${sig.symbol}`;
  const factors     = buildFactors(sig);
  const f           = sig.factors || {};
  const chasePct    = f.chasePct ?? 0;

  // Pattern description
  const spikeDesc = f.spikeBodyPct != null
    ? `Spike +${Math.max(f.spikeBodyPct ?? 0, f.spikeMovePct ?? 0).toFixed(1)}% vol ${(f.spikeVolRatio ?? 0).toFixed(1)}× → reversal ${f.barsSinceSpike ?? '?'}bar`
    : sig.reason;

  return `
    <article class="sr-card">
      <div class="sr-card-top">
        <div class="sr-symbol-wrap">
          <a class="sr-symbol" href="${detailUrl}" target="_blank">
            ${sig.symbol.replace(/USDT$/, '')}<span class="sym-usdt">USDT</span>
          </a>
          <span class="sr-change ${changeClass}" data-price="${sig.symbol}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="sr-right">
          <span class="sr-action-badge">🔴 SHORT</span>
          <div class="sr-score-wrap">
            <span class="sr-score-num">${sig.score}</span>
            <span class="sr-grade ${gradeClass}">${sig.grade}</span>
          </div>
          <span class="sr-type-badge">Spike Rev</span>
        </div>
      </div>

      <div class="sr-pattern">
        <span class="sr-pattern-dot"></span>
        <span>${spikeDesc}</span>
      </div>

      <div class="sr-prices">
        <div class="sr-price-cell">
          <span>Entry (Short)</span>
          <strong class="negative">${fmtPrice(sig.entry)} ${levBadge}</strong>
        </div>
        <div class="sr-price-cell">
          <span>SL</span>
          <strong class="negative">${fmtPrice(sig.sl)}</strong>
        </div>
        <div class="sr-price-cell">
          <span>TP</span>
          <strong class="positive">${fmtPrice(sig.tp)}</strong>
        </div>
      </div>

      <div class="sr-factors">${factors}</div>
      <div class="sr-note">${sig.note || ''}</div>

      <div class="sr-footer">
        <span>${timeAgo(sig.scannedAt)}</span>
        <div style="display:flex;align-items:center;gap:8px">
          ${chasePct > 0.25
            ? `<span class="sr-chase-warn">⚠ Chase ${(chasePct * 100).toFixed(0)}% — đã trễ</span>`
            : chasePct > 0.10
              ? `<span class="sr-chase-warn" style="color:var(--amber)">Chase ${(chasePct * 100).toFixed(0)}%</span>`
              : '<span></span>'
          }
          <button class="sr-paper-btn short" onclick="enterSrPaperTrade(this,'${sig.symbol}','SHORT',${sig.entry},${sig.score},${sig.sl ?? 'null'},${sig.tp ?? 'null'},'${encodeURIComponent(sig.note ?? '')}')">+ Paper</button>
        </div>
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

  visibleCount.textContent  = rows.length;
  shortCount.textContent    = allSignals.length;
  shortCount.className      = allSignals.length > 0 ? 'negative' : '';
  totalScanned.textContent  = total || '-';

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
      <div class="sr-empty">
        <strong>${isEmpty ? (isWarm ? 'Không có signal' : 'Đang warm cache...') : 'Không có kết quả'}</strong>
        ${isEmpty
          ? (isWarm
              ? 'Chưa có spike reversal pattern. Thị trường chưa có kill short spike rõ ràng.'
              : 'Kline cache đang được tải. Tự động cập nhật khi xong (~30-60s).')
          : 'Thử hạ min score hoặc xóa filter.'
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

// ── SR Paper trades ──────────────────────────────────────────────────────────

let srPaperSort = { key: 'status', dir: 'asc' };

document.addEventListener('click', (e) => {
  const th = e.target.closest('[data-sr-sort]');
  if (!th || !th.classList.contains('sr-paper-sort')) return;
  const key = th.dataset.srSort;
  if (srPaperSort.key === key) {
    srPaperSort.dir = srPaperSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    srPaperSort = { key, dir: key === 'status' ? 'asc' : 'desc' };
  }
  renderSrPaperTable();
});

function srPaperSortValue(t, key) {
  if (key === 'symbol') return t.symbol ?? '';
  if (key === 'side')   return t.side ?? '';
  if (key === 'entry')  return Number(t.entryPrice);
  if (key === 'sl')     return t.sl == null ? null : Number(t.sl);
  if (key === 'tp')     return t.tp == null ? null : Number(t.tp);
  if (key === 'mark')   return Number(t.markPrice ?? t.exitPrice);
  if (key === 'pnl')    return t.pnl == null ? null : Number(t.pnl);
  if (key === 'roe')    return t.roe == null ? null : Number(t.roe);
  if (key === 'source') return t.source ?? '';
  if (key === 'time')   return Date.parse(t.createdAt ?? '') || 0;
  if (key === 'status') {
    const order = { OPEN: 0, PENDING: 1, CLOSED: 2 };
    return order[t.status] ?? 9;
  }
  return '';
}

function compareSrValues(a, b, dir) {
  const aMiss = a == null || (typeof a === 'number' && isNaN(a));
  const bMiss = b == null || (typeof b === 'number' && isNaN(b));
  if (aMiss && bMiss) return 0;
  if (aMiss) return 1;
  if (bMiss) return -1;
  const r = typeof a === 'string' ? String(a).localeCompare(String(b), 'en') : a - b;
  return dir === 'asc' ? r : -r;
}

function sortSrPaperTrades(trades) {
  const { key, dir } = srPaperSort;
  return trades.slice().sort((a, b) => {
    const r = compareSrValues(srPaperSortValue(a, key), srPaperSortValue(b, key), dir);
    return r !== 0 ? r : compareSrValues(srPaperSortValue(a, 'time'), srPaperSortValue(b, 'time'), 'desc');
  });
}

function updateSrSortHeaders() {
  document.querySelectorAll('[data-sr-sort]').forEach((th) => {
    const active = th.dataset.srSort === srPaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (srPaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

function fmtSrPnl(pnl, roe) {
  if (pnl == null) return '-';
  const sign = pnl >= 0 ? '+' : '';
  const cls  = pnl >= 0 ? 'positive' : 'negative';
  return `<span class="${cls}">${sign}$${Math.abs(pnl).toFixed(3)} (${sign}${Number(roe ?? 0).toFixed(1)}%)</span>`;
}

function renderSrPaperTable() {
  const tbody   = document.getElementById('srPaperBody');
  const countEl = document.getElementById('srPaperCount');
  if (!tbody) return;

  const trades  = srPaperTrades;
  const summary = srPaperSummaryCache;
  const open    = trades.filter((t) => t.status !== 'CLOSED');
  const closed  = trades.filter((t) => t.status === 'CLOSED');

  let countTxt = `${open.length} đang mở · ${closed.length} đã đóng`;
  if (summary && summary.closed > 0) {
    const wr = Math.round(summary.wins / summary.closed * 100);
    countTxt += ` · ✅TP ${summary.tpHits ?? 0} 🔴SL ${summary.slHits ?? 0} · WR ${wr}%`;
    if (summary.avgRoe != null) countTxt += ` · AvgROE ${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`;
  }
  if (countEl) countEl.textContent = countTxt;

  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-cell">Chưa có paper trade nào từ spike reversal signals.</td></tr>';
    updateSrSortHeaders();
    return;
  }

  const sorted = sortSrPaperTrades([...open, ...closed]);
  tbody.innerHTML = sorted.map((t) => {
    const isShort  = t.side === 'SHORT';
    const sideHtml = isShort
      ? `<span style="color:var(--red);font-weight:700">SHORT</span>`
      : `<span style="color:var(--green);font-weight:700">LONG</span>`;
    const isClosed = t.status === 'CLOSED';
    const mark     = t.markPrice ?? t.exitPrice ?? '-';
    const actionBtns = isClosed
      ? `<button class="sr-paper-close-btn" style="opacity:.6;font-size:10px" onclick="deleteSrPaperTrade('${t.id}')">Del</button>`
      : `<button class="sr-paper-close-btn" onclick="closeSrPaperTrade('${t.id}')">Close</button>`;
    const rowStyle = isClosed ? 'opacity:.5' : '';
    const slColor  = isShort ? 'var(--green)' : 'var(--red)';
    const tpColor  = isShort ? 'var(--red)'   : 'var(--green)';
    const outcomeHtml = isClosed
      ? t.outcome === 'TP' ? '<span style="color:var(--green);font-weight:700">✅ TP</span>'
        : t.outcome === 'SL' ? '<span style="color:var(--red);font-weight:700">🔴 SL</span>'
        : '<span style="color:var(--muted)">Manual</span>'
      : t.status === 'PENDING' ? '<span style="color:var(--amber);font-weight:700">⏳ PENDING</span>'
      : '<span style="color:var(--green)">OPEN</span>';
    return `<tr data-id="${t.id}" style="${rowStyle}">
      <td><a href="/?symbol=${t.symbol}" target="_blank" style="color:var(--text);text-decoration:none;font-weight:700">${t.symbol.replace(/USDT$/, '')}<span style="color:var(--muted);font-size:11px;font-weight:400">USDT</span></a></td>
      <td>${sideHtml}</td>
      <td>${fmtPrice(t.entryPrice)}</td>
      <td style="font-size:11px;color:${slColor}">${t.sl != null ? fmtPrice(t.sl) : '<span style="color:var(--muted)">–</span>'}</td>
      <td style="font-size:11px;color:${tpColor}">${t.tp != null ? fmtPrice(t.tp) : '<span style="color:var(--muted)">–</span>'}</td>
      <td data-sr-mark="${t.id}">${fmtPrice(mark)}</td>
      <td data-sr-pnl="${t.id}">${fmtSrPnl(t.pnl, t.roe)}</td>
      <td data-sr-roe="${t.id}">${t.roe != null ? (t.roe >= 0 ? '+' : '') + Number(t.roe).toFixed(1) + '%' : '-'}</td>
      <td style="font-size:11px">${outcomeHtml}</td>
      <td style="font-size:10px;color:var(--muted)">${t.source ?? '-'}</td>
      <td style="font-size:11px;color:var(--muted)">${new Date(t.createdAt).toLocaleTimeString('vi')}</td>
      <td>${actionBtns}</td>
    </tr>`;
  }).join('');
  updateSrSortHeaders();
}

let _srPaperFetching = false;
async function loadSrPaperTrades() {
  if (_srPaperFetching) return;
  _srPaperFetching = true;
  try {
    const res = await fetch('/api/sr-paper-trades');
    if (!res.ok) return;
    const data = await res.json();
    srPaperTrades = data.trades ?? [];
    srPaperSummaryCache = data.summary;
    srPaperOpenSymbols = new Set(
      srPaperTrades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol),
    );
    renderSrPaperTable();
  } catch {} finally {
    _srPaperFetching = false;
  }
}

let _srPaperPollTimer = null;
function scheduleSrPaperPoll() {
  clearTimeout(_srPaperPollTimer);
  const hasOpen = srPaperTrades.some((t) => t.status === 'OPEN');
  _srPaperPollTimer = setTimeout(async () => {
    await loadSrPaperTrades();
    scheduleSrPaperPoll();
  }, hasOpen ? 3_000 : 15_000);
}

window.enterSrPaperTrade = async function(btn, symbol, side, entryPrice, score, sl, tp, noteEncoded) {
  btn.disabled = true;
  btn.textContent = '...';
  const note = noteEncoded ? decodeURIComponent(noteEncoded) : '';
  try {
    const res = await fetch('/api/sr-paper-trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol, side, marginUsdt: 1, leverage: 10, entryPrice, tp: tp ?? null, sl: sl ?? null, source: `sr-${score}`, note }),
    });
    if (res.ok) {
      btn.textContent = '⏳';
      setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
      loadSrPaperTrades();
    } else {
      btn.textContent = 'ERR';
      setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
    }
  } catch {
    btn.textContent = 'ERR';
    setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
  }
};

window.closeSrPaperTrade = async function(id) {
  try {
    const res = await fetch('/api/sr-paper-trades/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { await loadSrPaperTrades(); scheduleSrPaperPoll(); }
  } catch {}
};

window.deleteSrPaperTrade = async function(id) {
  if (!confirm('Xóa paper trade này?')) return;
  try {
    const res = await fetch('/api/sr-paper-trades/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { await loadSrPaperTrades(); scheduleSrPaperPoll(); }
  } catch {}
};

// ── Boot ──────────────────────────────────────────────────────────────────────

function showFetchError(err) {
  const status = err?.status ? `${err.status} ${err.statusText || ''}`.trim() : '';
  const msg = err?.status === 429
    ? 'API error 429: Binance rate limit'
    : `API error${status ? ` ${status}` : ''}`;
  scanStatus.textContent = msg;
  console.warn('[SpikeReversal] fetch failed:', err);
}

async function fetchAndApply(attempt = 0) {
  try {
    scanStatus.textContent = attempt === 0 ? 'Đang tải...' : `Warming cache... (${attempt})`;
    const res = await fetch('/api/spike-reversal-signals');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      showFetchError({ status: res.status, statusText: res.statusText, body });
      return;
    }
    const data = await res.json();
    applyData(data);
    if ((data.processed ?? 0) === 0 && attempt < 12) {
      const delay = Math.min(5000 + attempt * 3000, 20000);
      setTimeout(() => fetchAndApply(attempt + 1), delay);
    }
  } catch (err) {
    showFetchError(err);
  }
}

(async () => {
  await fetchAndApply();
  connect();
  connectPriceSocket();
  await loadSrPaperTrades();
  scheduleSrPaperPoll();
})();
