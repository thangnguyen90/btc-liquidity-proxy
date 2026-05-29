const SSE_URL = '/api/pump-ignition-stream';

let allSignals  = [];
let scannedAt   = null;
let total       = 0;

let piPaperTrades = [];
let piPaperOpenSymbols = new Set();

const grid          = document.getElementById('piGrid');
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

function fmtPnl(pnl, roe) {
  if (pnl == null || isNaN(pnl)) return '-';
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}${pnl.toFixed(3)} (${sign}${Number(roe ?? 0).toFixed(1)}%)`;
}

function timeAgo(ts) {
  if (!ts) return '-';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// ── Note parser ───────────────────────────────────────────────────────────────
function parseNote(note) {
  const out = {};
  if (!note) return out;
  note.split(/[|\n]/).forEach((part) => {
    const [k, v] = part.trim().split('=');
    if (!k || v == null) return;
    out[k.trim()] = v.trim();
  });
  return out;
}

// ── Factor chips ──────────────────────────────────────────────────────────────

function buildFactors(sig) {
  const parsed = parseNote(sig.note);
  const isIgn  = sig.type === 'pump_ignition';
  const chips  = [];

  // Vol spike
  const volX = parseFloat(parsed['volX'] ?? 0);
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
    const rNum = parseFloat(ribbonPct);
    chips.push({ label: `Ribbon ${ribbonPct}`, cls: rNum <= 1.5 ? 'ok' : 'warn' });
  }

  // Live EMA
  const liveEMA = parsed['liveEMA'];
  if (liveEMA) {
    chips.push({ label: `LiveEMA ${liveEMA}`, cls: liveEMA === 'Y' ? 'ok' : '' });
  }

  // Bias (EARLY only)
  const bias = parsed['bias'];
  if (bias) {
    chips.push({ label: `Bias ${bias}`, cls: bias === 'full' ? 'ok' : bias === 'soft' ? 'warn' : '' });
  }

  // EMA50 slope (IGNITION only)
  const slope = parsed['ema50Slope'];
  if (slope) {
    const slopeNum = parseFloat(slope);
    chips.push({ label: `EMA50 ${slope}`, cls: slopeNum > 0 ? 'ok' : 'warn' });
  }

  // RSI kill-trap
  const rsi14 = parsed['rsi14'];
  if (rsi14) {
    const rsiNum = parseFloat(rsi14);
    const isKillTrap = (sig.note || '').includes('killTrap');
    chips.push({ label: `RSI14 ${rsi14}${isKillTrap ? ' ⚠' : ''}`, cls: rsiNum >= 72 ? 'bad' : rsiNum >= 65 ? 'warn' : 'ok' });
  }

  // Chase
  const chaseMatch = (sig.note || '').match(/chase=(\d+\.?\d*)%/i);
  if (chaseMatch) {
    const chasePct = parseFloat(chaseMatch[1]);
    if (chasePct > 15) chips.push({ label: `Chase ${chasePct.toFixed(0)}%`, cls: 'bad' });
  }

  return chips.map((c) => `<span class="pi-chip ${c.cls}">${c.label}</span>`).join('');
}

// ── Kill-trap warning ─────────────────────────────────────────────────────────

function killTrapWarning(sig) {
  if (!(sig.note || '').includes('killTrap')) return '';
  return `<div class="pi-killtrap">⚠ Kill-short trap risk — RSI quá cao, pump có thể fake</div>`;
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
  const isIgnition  = sig.type === 'pump_ignition';
  const stageClass  = isIgnition ? 'stage-ignition' : 'stage-early';
  const stageBadge  = isIgnition ? 'ignition' : 'early';
  const stageName   = isIgnition ? 'IGNITION' : 'EARLY';
  const changeClass = (sig.change24h ?? 0) >= 0 ? 'positive' : 'negative';
  const gradeClass  = `grade-${(sig.grade || 'd').toLowerCase()}`;
  const detailUrl   = `/?symbol=${sig.symbol}`;
  const factors     = buildFactors(sig);
  const dotCls      = isIgnition ? 'ignition' : 'early';
  const trapWarn    = killTrapWarning(sig);

  const patternDesc = sig.reason || (isIgnition
    ? 'BB upper break + vol spike + EMA5>13>25 aligned'
    : 'Squeeze + ribbon compression + pre-breakout setup');

  return `
    <article class="pi-card ${stageClass}">
      <div class="pi-card-top">
        <div class="pi-symbol-wrap">
          <a class="pi-symbol" href="${detailUrl}" target="_blank">
            ${sig.symbol.replace(/USDT$/, '')}<span class="sym-usdt">USDT</span>
          </a>
          <span class="pi-change ${changeClass}" data-price="${sig.symbol}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="pi-right">
          <span class="pi-action-badge">🟢 LONG</span>
          <div class="pi-score-wrap">
            <span class="pi-score-num">${sig.score}</span>
            <span class="pi-grade ${gradeClass}">${sig.grade}</span>
          </div>
          <span class="pi-stage-badge ${stageBadge}">${stageName}</span>
        </div>
      </div>

      ${trapWarn}

      <div class="pi-pattern">
        <span class="pi-pattern-dot ${dotCls}"></span>
        <span>${patternDesc}</span>
      </div>

      <div class="pi-prices">
        <div class="pi-price-cell">
          <span>Entry (Long)</span>
          <strong class="positive">${fmtPrice(sig.entry)} ${levBadge}</strong>
        </div>
        <div class="pi-price-cell">
          <span>SL</span>
          <strong class="negative">${fmtPrice(sig.sl)}</strong>
        </div>
        <div class="pi-price-cell">
          <span>TP</span>
          <strong class="positive">${fmtPrice(sig.tp)}</strong>
        </div>
      </div>

      ${factors ? `<div class="pi-factors">${factors}</div>` : ''}
      ${sig.note ? `<div class="pi-note">${sig.note}</div>` : ''}

      <div class="pi-footer">
        <span>${timeAgo(sig.scannedAt)}</span>
        <button class="pi-paper-btn long" onclick="enterPiPaperTrade(this,'${sig.symbol}','LONG',${sig.entry},${sig.score},${sig.sl ?? 'null'},${sig.tp ?? 'null'},'${encodeURIComponent(sig.note ?? '')}')">+ Paper</button>
      </div>
    </article>
  `;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const search   = searchInput.value.trim().toUpperCase();
  const minScore = Number(scoreFilter.value);
  const stageVal = stageFilter.value;

  let rows = allSignals.slice();
  if (search)    rows = rows.filter((s) => s.symbol.includes(search));
  if (minScore > 0) rows = rows.filter((s) => s.score >= minScore);
  if (stageVal)  rows = rows.filter((s) => s.type === stageVal);

  visibleCount.textContent = rows.length;

  const igns  = allSignals.filter((s) => s.type === 'pump_ignition');
  const earls = allSignals.filter((s) => s.type === 'pump_ignition_early');
  ignitionCount.textContent = igns.length;
  ignitionCount.style.color = igns.length > 0 ? 'var(--green)' : '';
  earlyCount.textContent    = earls.length;
  earlyCount.style.color    = earls.length > 0 ? 'var(--blue)' : '';

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
      <div class="pi-empty">
        <strong>${isEmpty ? (isWarm ? 'Không có signal' : 'Đang warm cache...') : 'Không có kết quả'}</strong>
        ${isEmpty
          ? (isWarm
              ? 'Chưa có pump ignition pattern. Thị trường chưa có breakout sau squeeze.'
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

  // Chỉ cảnh báo khi WS đã từng hoạt động rồi mới mất tick (staleSec biết rõ > 90s)
  // staleSec === null = server vừa khởi động, chưa có tick đầu tiên — KHÔNG cảnh báo
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

function showFetchError(err) {
  const status = err?.status ? `${err.status} ${err.statusText || ''}`.trim() : '';
  const msg = err?.status === 429
    ? 'API error 429: Binance rate limit'
    : `API error${status ? ` ${status}` : ''}`;
  scanStatus.textContent = msg;
  console.warn('[PumpIgnition] fetch failed:', err);
}

async function fetchAndApply(attempt = 0) {
  try {
    scanStatus.textContent = attempt === 0 ? 'Đang tải...' : `Warming cache... (${attempt})`;
    const res = await fetch('/api/pump-ignition-signals');
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

// ── PI Paper Trades ───────────────────────────────────────────────────────────

let piPaperSort = { key: 'status', dir: 'asc' };

document.addEventListener('click', (e) => {
  const th = e.target.closest('[data-pi-sort]');
  if (!th || !th.classList.contains('pi-paper-sort')) return;
  const key = th.dataset.piSort;
  if (piPaperSort.key === key) {
    piPaperSort.dir = piPaperSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    piPaperSort = { key, dir: key === 'status' ? 'asc' : 'desc' };
  }
  renderPiPaperTable();
});

function piPaperSortValue(t, key) {
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

function comparePiValues(a, b, dir) {
  const aMiss = a == null || (typeof a === 'number' && isNaN(a));
  const bMiss = b == null || (typeof b === 'number' && isNaN(b));
  if (aMiss && bMiss) return 0;
  if (aMiss) return 1;
  if (bMiss) return -1;
  const r = typeof a === 'string' ? String(a).localeCompare(String(b), 'en') : a - b;
  return dir === 'asc' ? r : -r;
}

function sortPiPaperTrades(trades) {
  const { key, dir } = piPaperSort;
  return trades.slice().sort((a, b) => {
    const r = comparePiValues(piPaperSortValue(a, key), piPaperSortValue(b, key), dir);
    return r !== 0 ? r : comparePiValues(piPaperSortValue(a, 'time'), piPaperSortValue(b, 'time'), 'desc');
  });
}

function updatePiSortHeaders() {
  document.querySelectorAll('[data-pi-sort]').forEach((th) => {
    const active = th.dataset.piSort === piPaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (piPaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

function renderPiPaperTable() {
  const tbody = document.getElementById('piPaperBody');
  if (!tbody) return;

  const open   = piPaperTrades.filter((t) => t.status !== 'CLOSED');
  const closed = piPaperTrades.filter((t) => t.status === 'CLOSED');
  const tpHits = closed.filter((t) => t.outcome === 'TP').length;
  const slHits = closed.filter((t) => t.outcome === 'SL').length;
  const wins   = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const wr     = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(0) : '-';
  const avgRoe = closed.length > 0
    ? (closed.reduce((s, t) => s + (t.roe ?? 0), 0) / closed.length).toFixed(1)
    : '-';

  const summary = document.getElementById('piPaperSummary');
  if (summary) {
    summary.textContent = `${open.length} đang mở · ${closed.length} đã đóng · TP ${tpHits} · SL ${slHits} · WR ${wr}% · AvgROE ${avgRoe}%`;
  }

  if (piPaperTrades.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--muted);padding:16px">Chưa có paper trade nào</td></tr>';
    updatePiSortHeaders();
    return;
  }

  const sorted = sortPiPaperTrades([...open, ...closed]);
  tbody.innerHTML = sorted.map((t) => {
    const pnlVal = t.pnl ?? null;
    const roeVal = t.roe ?? null;
    const pnlColor = pnlVal == null ? '' : pnlVal >= 0 ? 'color:var(--green)' : 'color:var(--red)';
    const statusBadge = t.status === 'OPEN' ? '<span style="color:var(--green)">OPEN</span>'
      : t.status === 'PENDING' ? '<span style="color:var(--amber)">PENDING</span>'
      : `<span style="color:var(--muted)">${t.outcome ?? 'CLOSED'}</span>`;
    const canClose = t.status === 'OPEN' || t.status === 'PENDING';
    const actions = `
      ${canClose ? `<button class="pi-paper-close-btn" onclick="closePiPaperTrade('${t.id}')">Close</button>` : ''}
      <button class="pi-paper-close-btn del" onclick="deletePiPaperTrade('${t.id}')">Del</button>
    `;
    return `<tr>
      <td>${t.symbol.replace(/USDT$/, '')}</td>
      <td><span style="color:var(--green)">${t.side}</span></td>
      <td>${fmtPrice(t.entryPrice)}</td>
      <td>${fmtPrice(t.sl)}</td>
      <td>${fmtPrice(t.tp)}</td>
      <td>${fmtPrice(t.markPrice)}</td>
      <td style="${pnlColor}">${fmtPnl(pnlVal, roeVal)}</td>
      <td style="${pnlColor}">${roeVal != null ? fmtPct(roeVal) : '-'}</td>
      <td>${statusBadge}</td>
      <td style="color:var(--muted);font-size:11px">${t.source ?? '-'}</td>
      <td style="color:var(--muted);font-size:11px">${t.createdAt ? new Date(t.createdAt).toLocaleTimeString('vi') : '-'}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
  updatePiSortHeaders();
}

async function loadPiPaperTrades() {
  try {
    const res = await fetch('/api/pi-paper-trades');
    if (!res.ok) return;
    const data = await res.json();
    piPaperTrades = data.trades ?? [];
    piPaperOpenSymbols = new Set(piPaperTrades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol));
    renderPiPaperTable();
  } catch (e) {
    console.warn('[PiPaper] loadPiPaperTrades error:', e);
  }
}

window.enterPiPaperTrade = async function(btn, symbol, side, entryPrice, score, sl, tp, noteEncoded) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const res = await fetch('/api/pi-paper-trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        side,
        entryPrice,
        sl: sl ?? null,
        tp: tp ?? null,
        marginUsdt: 1,
        leverage: 10,
        source: `pi-${score}`,
        note: decodeURIComponent(noteEncoded),
        status: 'PENDING',
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    btn.textContent = '✓ OK';
    await loadPiPaperTrades();
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  } catch (e) {
    btn.textContent = '✗ Err';
    console.error('[PiPaper] enterPiPaperTrade error:', e);
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  }
};

window.closePiPaperTrade = async function(id) {
  try {
    await fetch('/api/pi-paper-trades/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadPiPaperTrades();
  } catch (e) {
    console.error('[PiPaper] closePiPaperTrade error:', e);
  }
};

window.deletePiPaperTrade = async function(id) {
  try {
    await fetch('/api/pi-paper-trades/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadPiPaperTrades();
  } catch (e) {
    console.error('[PiPaper] deletePiPaperTrade error:', e);
  }
};

// ── Boot ──────────────────────────────────────────────────────────────────────

(async () => {
  await fetchAndApply();
  connect();
  connectPriceSocket();
  loadPiPaperTrades();
  setInterval(loadPiPaperTrades, 30000);
})();
