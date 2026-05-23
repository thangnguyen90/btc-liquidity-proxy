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
  liq_flush: {
    label: 'Liq Flush',
    phase: 'Liquidation cascade flush + quick recovery — stop hunt, buyers absorb',
    cls:   'liq-long-type',
  },
  liq_top: {
    label: 'Liq Top',
    phase: 'Liquidation spike + volume rejection — long squeeze, sellers take over',
    cls:   'liq-short-type',
  },
  failed_bounce: {
    label: 'Failed Bounce',
    phase: 'Bounce sau flush bị reject trong downtrend — short theo trend tiếp tục',
    cls:   'failed-bounce-type',
  },
  failed_top: {
    label: 'Failed Top',
    phase: 'Dip sau spike bị absorb trong uptrend — long theo trend tiếp tục',
    cls:   'failed-top-type',
  },
};

// ── Factor chips ──────────────────────────────────────────────────────────────

function buildFactors(sig) {
  const f      = sig.factors || {};
  const isLong = sig.action === 'LONG';
  const chips  = [];
  const isLiq  = sig.type === 'liq_flush' || sig.type === 'liq_top' || sig.type === 'failed_bounce' || sig.type === 'failed_top';

  if (isLiq) {
    // Liq Flush / Liq Top / Failed Bounce factors
    const isFailedBounce = sig.type === 'failed_bounce';
    const isFailedTop    = sig.type === 'failed_top';
    const spikeLabel     = isLong ? 'Spike' : 'Flush';
    if (f.flushVolX != null) {
      chips.push({ label: `${spikeLabel} Vol ${f.flushVolX.toFixed(1)}×`, ok: f.flushVolX >= 2 ? 'ok' : '' });
    }
    if (f.dropPct != null) {
      chips.push({ label: `${isLong ? 'Spike' : 'Drop'} ${f.dropPct.toFixed(1)}%`, ok: f.dropPct >= 1.5 ? 'ok' : '' });
    }
    if (f.revVolX != null) {
      chips.push({ label: `${isFailedBounce || isFailedTop ? 'Reversal' : 'Bounce'} Vol ${f.revVolX.toFixed(1)}×`, ok: f.revVolX >= 1.5 ? 'ok' : 'warn' });
    }
    if (f.recovery != null) {
      chips.push({ label: `${isFailedBounce ? 'Bounce' : isFailedTop ? 'Dip' : 'Recovery'} ${f.recovery}%`, ok: f.recovery >= 50 ? 'ok' : 'warn' });
    }
    if (f.rsiDelta != null) {
      const sign = isLong ? `+${Math.abs(f.rsiDelta)}` : `−${Math.abs(f.rsiDelta)}`;
      chips.push({ label: `RSI ${sign}`, ok: Math.abs(f.rsiDelta) >= 8 ? 'ok' : '' });
    }
    if ((isFailedBounce || isFailedTop) && f.ema99GapPct != null) {
      const sign   = isFailedTop ? '+' : '-';
      const pct    = Math.abs(f.ema99GapPct);
      chips.push({ label: `${sign}${pct}% vs EMA99`, ok: pct >= 8 ? 'ok' : 'warn' });
    } else if (f.emaOk != null) {
      chips.push({ label: f.emaOk ? 'EMA ✓' : 'EMA ✗', ok: f.emaOk ? 'ok' : '' });
    }
  } else {
    // SC → Spring / BC → UTAD factors
    const volOk = (f.volRatio ?? 0) >= 2.0;
    chips.push({ label: `Vol ${(f.volRatio ?? 0).toFixed(1)}×`, ok: volOk ? 'ok' : 'warn' });

    const rngOk = (f.rangeX ?? 0) >= 1.2;
    chips.push({ label: `Range ${(f.rangeX ?? 0).toFixed(1)}× ATR`, ok: rngOk ? 'ok' : '' });

    chips.push({ label: f.bbBack ? 'BB re-entry ✓' : 'No BB re-entry', ok: f.bbBack ? 'ok' : '' });

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
  }

  return chips.map((c) => `<span class="cap-factor ${c.ok}">${c.label}</span>`).join('');
}

// ── Binance order placement ───────────────────────────────────────────────────

let capOpenLimitSymbols = new Set();

async function loadCapOpenLimitOrders() {
  const token = localStorage.getItem('orders_token') ?? '';
  if (!token) return;
  try {
    const [ordersRes, posRes] = await Promise.all([
      fetch('/api/open-orders', { headers: { 'x-orders-token': token } }),
      fetch('/api/positions',   { headers: { 'x-orders-token': token } }),
    ]);
    const next = new Set();
    if (ordersRes.ok) {
      const arr = await ordersRes.json();
      (Array.isArray(arr) ? arr : (arr.orders ?? []))
        .filter((o) => String(o.type ?? '').toUpperCase() === 'LIMIT' && !o.reduceOnly)
        .forEach((o) => next.add(o.symbol));
    }
    if (posRes.ok) {
      const arr = await posRes.json();
      (Array.isArray(arr) ? arr : (arr.positions ?? []))
        .filter((p) => Number(p.positionAmt ?? 0) !== 0)
        .forEach((p) => next.add(p.symbol));
    }
    capOpenLimitSymbols = next;
    render();
  } catch {}
}

window.placeCapOrder = async function(btn, symbol, action, entry, sl, tp, score, type) {
  const row = btn.closest('.cap-order-row');
  const input = row?.querySelector('.cap-order-margin') ?? btn.closest('td')?.querySelector('.cap-order-margin');
  const margin = Number(input?.value ?? 5);
  if (!margin || margin <= 0) { btn.textContent = 'Nhập margin!'; return; }

  const token = localStorage.getItem('orders_token') ?? '';
  if (!token) {
    btn.classList.add('error');
    btn.textContent = 'Chưa đăng nhập';
    setTimeout(() => { btn.classList.remove('error'); btn.textContent = '📥 LIMIT'; }, 3000);
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
      capOpenLimitSymbols.add(symbol);
      if (row && !row.querySelector('.cap-order-exists')) {
        const badge = document.createElement('span');
        badge.className = 'cap-order-exists';
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
    setTimeout(() => { btn.classList.remove('error'); btn.textContent = '📥 LIMIT'; }, 4000);
  }
};

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
          <span class="cap-change ${changeClass}" data-price="${sig.symbol}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
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
        <button class="cap-paper-btn ${dirClass}" onclick="enterCapPaperTrade(this,'${sig.symbol}','${sig.action}',${sig.entry},${sig.score},${sig.sl ?? 'null'},${sig.tp ?? 'null'},'${encodeURIComponent(sig.note ?? '')}')">+ Paper</button>
      </div>

      <div class="cap-order-row">
        <input class="cap-order-margin" type="number" value="5" min="1" max="10000" step="1" title="Margin (USDT)">
        <span class="cap-order-label" style="font-size:11px;color:var(--muted);flex-shrink:0">USDT</span>
        <button class="cap-order-btn ${dirClass}" onclick="placeCapOrder(this,'${sig.symbol}','${sig.action}',${sig.entry},${sig.sl ?? 'null'},${sig.tp ?? 'null'},${sig.score},'${sig.type ?? ''}')">📥 LIMIT</button>
        ${capOpenLimitSymbols.has(sig.symbol) ? '<span class="cap-order-exists">✓ Đã có lệnh</span>' : ''}
      </div>
    </article>
  `;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const search   = searchInput.value.trim().toUpperCase();
  const action   = actionFilter.value;
  const type     = typeFilter?.value ?? 'all';
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
      <div class="cap-empty">
        <strong>${isEmpty ? (isWarm ? 'Không có signal' : 'Đang warm cache...') : 'Không có kết quả'}</strong>
        ${isEmpty
          ? (isWarm
              ? 'Chưa có capitulation/spring nào. Thị trường chưa có cú shock.'
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
actionFilter.addEventListener('change', render);
typeFilter?.addEventListener('change', render);
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

// ── Paper trades ─────────────────────────────────────────────────────────────

const capPaperBody  = document.getElementById('capPaperBody');
const capPaperCount = document.getElementById('capPaperCount');
let capPaperTradesCache = [];
let capPaperSummaryCache = null;
let capPaperSort = { key: 'status', dir: 'asc' };

function fmtPnl(pnl, roe) {
  if (pnl == null) return '-';
  const sign = pnl >= 0 ? '+' : '';
  const cls  = pnl >= 0 ? 'positive' : 'negative';
  return `<span class="${cls}">${sign}$${Math.abs(pnl).toFixed(3)} (${sign}${Number(roe ?? 0).toFixed(1)}%)</span>`;
}

function capPaperSortValue(t, key) {
  if (key === 'symbol') return t.symbol ?? '';
  if (key === 'side') return t.side ?? '';
  if (key === 'entry') return Number(t.entryPrice);
  if (key === 'sl') return t.sl == null ? null : Number(t.sl);
  if (key === 'tp') return t.tp == null ? null : Number(t.tp);
  if (key === 'mark') return Number(t.markPrice ?? t.exitPrice);
  if (key === 'pnl') return t.pnl == null ? null : Number(t.pnl);
  if (key === 'roe') return t.roe == null ? null : Number(t.roe);
  if (key === 'type') return capSignalType(t.note ?? '');
  if (key === 'source') return t.source ?? '';
  if (key === 'time') return Date.parse(t.createdAt ?? '') || 0;
  if (key === 'status') {
    const order = { OPEN: 0, PENDING: 1, ENTRY_READY: 2, CLOSED: 3 };
    return order[t.status] ?? 9;
  }
  return '';
}

function compareCapPaperValues(a, b, dir) {
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

function sortCapPaperTrades(trades) {
  const { key, dir } = capPaperSort;
  return trades.slice().sort((a, b) => {
    const result = compareCapPaperValues(capPaperSortValue(a, key), capPaperSortValue(b, key), dir);
    if (result !== 0) return result;
    return compareCapPaperValues(capPaperSortValue(a, 'time'), capPaperSortValue(b, 'time'), 'desc');
  });
}

function updateCapPaperSortHeaders() {
  document.querySelectorAll('[data-paper-sort]').forEach((th) => {
    const active = th.dataset.paperSort === capPaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (capPaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

// Extract signal type từ note field: "BC vol=..." → "BC", "Spike vol=..." → "Spike"
function capSignalType(note) {
  if (!note) return '';
  const m = note.match(/^([A-Za-z_]+)/);
  return m ? m[1] : '';
}

const CAP_TYPE_COLOR = {
  BC:    'var(--green)',
  SC:    'var(--red)',
  Spike: '#a78bfa',
  EMA:   '#60a5fa',
};
function capTypeHtml(note) {
  const type = capSignalType(note);
  if (!type) return '<span style="color:var(--muted)">–</span>';
  const color = CAP_TYPE_COLOR[type] ?? 'var(--muted)';
  return `<span style="color:${color};font-weight:700;font-size:11px">${type}</span>`;
}

function renderCapPaperTrades(trades, summary) {
  capPaperTradesCache = trades;
  capPaperSummaryCache = summary;
  const open   = trades.filter((t) => t.status === 'OPEN' || t.status === 'PENDING' || t.status === 'ENTRY_READY');
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const all    = sortCapPaperTrades([...open, ...closed]);
  let countTxt = `${open.length} đang mở · ${closed.length} đã đóng`;
  if (summary && summary.closed > 0) {
    const wr = summary.closed > 0 ? Math.round(summary.wins / summary.closed * 100) : 0;
    countTxt += ` · ✅TP ${summary.tpHits ?? 0} 🔴SL ${summary.slHits ?? 0} · WR ${wr}%`;
    if (summary.avgRoe != null) countTxt += ` · AvgROE ${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`;
  }
  capPaperCount.textContent = countTxt;

  if (!all.length) {
    capPaperBody.innerHTML = '<tr><td colspan="12" class="empty-cell">Chưa có paper trade nào từ cap signals.</td></tr>';
    return;
  }

  capPaperBody.innerHTML = all.map((t) => {
    const isLong   = t.side === 'LONG';
    const sideHtml = isLong
      ? `<span style="color:var(--green);font-weight:700">LONG</span>`
      : `<span style="color:var(--red);font-weight:700">SHORT</span>`;
    const isClosed = t.status === 'CLOSED';
    const mark     = t.markPrice ?? t.exitPrice ?? '-';
    const actionBtns = isClosed
      ? `<button class="cap-paper-close-btn" style="opacity:.6;font-size:10px" onclick="deleteCapPaperTrade('${t.id}')">Del</button>`
      : `<button class="cap-paper-close-btn" onclick="closeCapPaperTrade('${t.id}')">Close</button>`;
    const rowStyle = isClosed ? 'opacity:.5' : '';
    const slColor = isLong ? 'var(--red)' : 'var(--green)';
    const tpColor = isLong ? 'var(--green)' : 'var(--red)';
    const outcomeHtml = isClosed
      ? t.outcome === 'TP' ? '<span style="color:var(--green);font-weight:700">✅ TP</span>'
        : t.outcome === 'SL' ? '<span style="color:var(--red);font-weight:700">🔴 SL</span>'
        : '<span style="color:var(--muted)">Manual</span>'
      : t.status === 'PENDING' ? '<span style="color:var(--amber);font-weight:700">⏳ PENDING</span>'
      : '<span style="color:var(--green)">OPEN</span>';
    const dirClass = isLong ? 'long' : 'short';
    const scoreNum = Number((t.source ?? '').replace(/\D/g, '')) || 0;
    const hasOrder = capOpenLimitSymbols.has(t.symbol);
    const orderCell = isClosed
      ? '<td></td>'
      : `<td>
          <div style="display:flex;align-items:center;gap:4px">
            <input class="cap-order-margin" type="number" value="5" min="1" max="10000" step="1"
              style="width:46px;padding:3px 5px;border-radius:4px;border:1px solid var(--line);background:var(--panel-2);color:var(--text);font-size:12px;font-weight:700;text-align:right"
              title="Margin (USDT)">
            <button class="cap-order-btn ${dirClass}"
              onclick="placeCapOrder(this,'${t.symbol}','${t.side}',${t.entryPrice},${t.sl ?? 'null'},${t.tp ?? 'null'},${scoreNum},'')"
              style="padding:3px 8px;font-size:10px;white-space:nowrap"
              ${hasOrder ? 'disabled' : ''}>
              ${hasOrder ? '✓ Đã có' : '📥 LIMIT'}
            </button>
          </div>
        </td>`;
    return `<tr style="${rowStyle}">
      <td><a href="/?symbol=${t.symbol}" target="_blank" style="color:var(--text);text-decoration:none;font-weight:700">${t.symbol.replace(/USDT$/, '')}<span style="color:var(--muted);font-size:11px;font-weight:400">USDT</span></a></td>
      <td>${sideHtml}</td>
      <td>${capTypeHtml(t.note)}</td>
      <td>${fmtPrice(t.entryPrice)}</td>
      <td style="font-size:11px;color:${slColor}">${t.sl != null ? fmtPrice(t.sl) : '<span style="color:var(--muted)">–</span>'}</td>
      <td style="font-size:11px;color:${tpColor}">${t.tp != null ? fmtPrice(t.tp) : '<span style="color:var(--muted)">–</span>'}</td>
      <td>${fmtPrice(mark)}</td>
      <td>${fmtPnl(t.pnl, t.roe)}</td>
      <td>${t.roe != null ? (t.roe >= 0 ? '+' : '') + Number(t.roe).toFixed(1) + '%' : '-'}</td>
      <td style="font-size:11px">${outcomeHtml}</td>
      <td style="font-size:10px;color:var(--muted)">${t.source ?? '-'}</td>
      <td style="font-size:11px;color:var(--muted)">${new Date(t.createdAt).toLocaleTimeString('vi')}</td>
      <td>${actionBtns}</td>
      ${orderCell}
    </tr>`;
  }).join('');
  updateCapPaperSortHeaders();
}

async function loadCapPaperTrades() {
  try {
    const res = await fetch('/api/cap-paper-trades');
    if (!res.ok) return;
    const data = await res.json();
    renderCapPaperTrades(data.trades ?? [], data.summary);
  } catch {}
}

window.enterCapPaperTrade = async function(btn, symbol, side, entry, score, sl, tp, noteEncoded) {
  btn.disabled = true;
  btn.textContent = '...';
  const note = noteEncoded ? decodeURIComponent(noteEncoded) : '';
  try {
    const res = await fetch('/api/cap-paper-trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol, side, marginUsdt: 1, leverage: 10, entryPrice: entry, tp: tp ?? null, sl: sl ?? null, source: `cap-${score}`, note }),
    });
    if (res.ok) {
      btn.textContent = '⏳';
      setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
      loadCapPaperTrades();
    } else {
      btn.textContent = 'ERR';
      setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
    }
  } catch {
    btn.textContent = 'ERR';
    setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
  }
};

window.closeCapPaperTrade = async function(id) {
  try {
    const res = await fetch('/api/cap-paper-trades/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) loadCapPaperTrades();
  } catch {}
};

window.deleteCapPaperTrade = async function(id) {
  if (!confirm('Xóa paper trade này?')) return;
  try {
    const res = await fetch('/api/cap-paper-trades/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) loadCapPaperTrades();
  } catch {}
};

// ── Boot ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('[data-paper-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.paperSort;
    if (!key) return;
    capPaperSort = {
      key,
      dir: capPaperSort.key === key && capPaperSort.dir === 'asc' ? 'desc' : 'asc',
    };
    renderCapPaperTrades(capPaperTradesCache, capPaperSummaryCache);
  });
});

async function fetchAndApply(attempt = 0) {
  try {
    scanStatus.textContent = attempt === 0 ? 'Đang tải...' : `Warming cache... (${attempt})`;
    const res = await fetch('/api/cap-signals');
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
  loadCapPaperTrades();
  setInterval(loadCapPaperTrades, 30_000);
  loadCapOpenLimitOrders();
  setInterval(loadCapOpenLimitOrders, 30_000);
})();
