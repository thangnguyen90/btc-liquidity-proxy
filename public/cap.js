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
        ${sig.score >= 80
          ? `<button class="cap-paper-btn ${dirClass}" onclick="enterCapPaperTrade(this,'${sig.symbol}','${sig.action}',${sig.entry},${sig.score})">+ Paper</button>`
          : ''}
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

function fmtPnl(pnl, roe) {
  if (pnl == null) return '-';
  const sign = pnl >= 0 ? '+' : '';
  const cls  = pnl >= 0 ? 'positive' : 'negative';
  return `<span class="${cls}">${sign}$${Math.abs(pnl).toFixed(3)} (${sign}${Number(roe ?? 0).toFixed(1)}%)</span>`;
}

function renderCapPaperTrades(trades) {
  const open   = trades.filter((t) => t.status === 'OPEN' || t.status === 'PENDING' || t.status === 'ENTRY_READY');
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const all    = [...open, ...closed];
  capPaperCount.textContent = `${open.length} đang mở · ${closed.length} đã đóng`;

  if (!all.length) {
    capPaperBody.innerHTML = '<tr><td colspan="10" class="empty-cell">Chưa có paper trade nào từ cap signals.</td></tr>';
    return;
  }

  capPaperBody.innerHTML = all.map((t) => {
    const isLong   = t.side === 'LONG';
    const sideHtml = isLong
      ? `<span style="color:var(--green);font-weight:700">LONG</span>`
      : `<span style="color:var(--red);font-weight:700">SHORT</span>`;
    const isClosed = t.status === 'CLOSED';
    const mark     = t.markPrice ?? t.exitPrice ?? '-';
    const closeBtn = isClosed ? '' : `<button class="cap-paper-close-btn" onclick="closeCapPaperTrade('${t.id}')">Close</button>`;
    const rowStyle = isClosed ? 'opacity:.55' : '';
    return `<tr style="${rowStyle}">
      <td><strong>${t.symbol.replace(/USDT$/, '')}</strong><span style="color:var(--muted);font-size:11px">USDT</span></td>
      <td>${sideHtml}</td>
      <td>${fmtPrice(t.entryPrice)}</td>
      <td>${fmtPrice(mark)}</td>
      <td>${fmtPnl(t.pnl, t.roe)}</td>
      <td>${t.roe != null ? (t.roe >= 0 ? '+' : '') + Number(t.roe).toFixed(1) + '%' : '-'}</td>
      <td style="font-size:11px;color:var(--muted)">${t.status}</td>
      <td style="font-size:10px;color:var(--muted)">${t.source ?? '-'}</td>
      <td style="font-size:11px;color:var(--muted)">${new Date(t.createdAt).toLocaleTimeString('vi')}</td>
      <td>${closeBtn}</td>
    </tr>`;
  }).join('');
}

async function loadCapPaperTrades() {
  try {
    const res = await fetch('/api/paper-trades');
    if (!res.ok) return;
    const data = await res.json();
    const trades = (data.trades ?? []).filter((t) => String(t.source ?? '').startsWith('cap-'));
    renderCapPaperTrades(trades);
  } catch {}
}

window.enterCapPaperTrade = async function(btn, symbol, side, entry, score) {
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const res = await fetch('/api/paper-trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol, side, marginUsdt: 1, leverage: 10, entryPrice: entry, source: `cap-${score}` }),
    });
    if (res.ok) {
      btn.textContent = 'OK';
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
    const res = await fetch('/api/paper-trades/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) loadCapPaperTrades();
  } catch {}
};

// ── Boot ──────────────────────────────────────────────────────────────────────

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
})();
