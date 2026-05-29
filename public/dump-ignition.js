const SSE_URL = '/api/dump-ignition-stream';

let allSignals  = [];
let scannedAt   = null;
let total       = 0;

let diPaperTrades = [];
let diPaperOpenSymbols = new Set();
let diPaperSummaryCache = null;

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
  const isRisk  = sig.type === 'post_pump_dump_risk';
  const isBounce = sig.type === 'post_dump_bounce_risk';
  const chips   = [];

  if (isBounce) {
    const dump = parseFloat(parsed.dump ?? 0);
    const greenVolShare = parseFloat(parsed.greenVolShare ?? 0);
    const volRecent = parseFloat(parsed.volRecent ?? 0);
    const rsiRecover = parseFloat(parsed.rsiRecover ?? 0);
    const resistanceBreak = parseFloat(parsed.resistanceBreak ?? 0);
    if (dump > 0) chips.push({ label: `Dump ${dump.toFixed(1)}%`, cls: dump >= 45 ? 'ok' : 'warn' });
    if (greenVolShare > 0) chips.push({ label: `Green vol ${greenVolShare.toFixed(0)}%`, cls: greenVolShare >= 58 ? 'ok' : 'warn' });
    if (volRecent > 0) chips.push({ label: `Vol ${volRecent.toFixed(2)}×`, cls: volRecent >= 1.35 ? 'ok' : 'warn' });
    if (rsiRecover > 0) chips.push({ label: `RSI recover ${rsiRecover.toFixed(0)}`, cls: rsiRecover >= 18 ? 'ok' : 'warn' });
    if (resistanceBreak > 0) chips.push({ label: `Resistance +${resistanceBreak.toFixed(2)}%`, cls: 'ok' });
    return chips.map((c) => `<span class="di-chip ${c.cls}">${c.label}</span>`).join('');
  }

  if (isRisk) {
    const runup = parseFloat(parsed.runup ?? 0);
    const redVolShare = parseFloat(parsed.redVolShare ?? 0);
    const volRecent = parseFloat(parsed.volRecent ?? 0);
    const rsiFade = parseFloat(parsed.rsiFade ?? 0);
    const supportBreak = parseFloat(parsed.supportBreak ?? 0);
    if (runup > 0) chips.push({ label: `Runup ${runup.toFixed(1)}%`, cls: runup >= 60 ? 'bad' : 'warn' });
    if (redVolShare > 0) chips.push({ label: `Red vol ${redVolShare.toFixed(0)}%`, cls: redVolShare >= 58 ? 'bad' : 'warn' });
    if (volRecent > 0) chips.push({ label: `Vol ${volRecent.toFixed(2)}×`, cls: volRecent >= 1.4 ? 'ok' : 'warn' });
    if (rsiFade > 0) chips.push({ label: `RSI fade ${rsiFade.toFixed(0)}`, cls: rsiFade >= 18 ? 'bad' : 'warn' });
    if (supportBreak > 0) chips.push({ label: `Support -${supportBreak.toFixed(2)}%`, cls: 'bad' });
    return chips.map((c) => `<span class="di-chip ${c.cls}">${c.label}</span>`).join('');
  }

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
  const isIgnition  = sig.type === 'dump_ignition';
  const isRisk      = sig.type === 'post_pump_dump_risk';
  const isBounce    = sig.type === 'post_dump_bounce_risk';
  const stageClass  = isBounce ? 'stage-bounce' : isRisk ? 'stage-risk' : isIgnition ? 'stage-ignition' : 'stage-early';
  const stageBadge  = isBounce ? 'bounce' : isRisk ? 'risk' : isIgnition ? 'ignition' : 'early';
  const stageName   = isIgnition ? 'IGNITION' : isBounce ? 'BOUNCE' : isRisk ? 'RISK' : 'EARLY';
  const changeClass = (sig.change24h ?? 0) >= 0 ? 'positive' : 'negative';
  const gradeClass  = `grade-${(sig.grade || 'd').toLowerCase()}`;
  const detailUrl   = `/?symbol=${sig.symbol}`;
  const factors     = buildFactors(sig);
  const dotCls      = isBounce ? 'bounce' : isRisk ? 'risk' : isIgnition ? 'ignition' : 'early';

  // Pattern description from reason
  const patternDesc = sig.reason || (isIgnition
    ? 'BB lower break + vol spike + EMA stack bearish'
    : isBounce
      ? 'Post-dump bounce risk'
    : isRisk
      ? 'Post-pump distribution risk'
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
          <span class="di-action-badge ${sig.action === 'LONG' ? 'long' : ''}">${sig.action === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}</span>
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
          <strong class="negative">${fmtPrice(sig.entry)} ${levBadge}</strong>
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
          <button class="di-paper-btn ${sig.action === 'LONG' ? 'long' : 'short'}" onclick="enterDiPaperTrade(this,'${sig.symbol}','${sig.action === 'LONG' ? 'LONG' : 'SHORT'}',${sig.entry},${sig.score},${sig.sl ?? 'null'},${sig.tp ?? 'null'},'${encodeURIComponent(sig.note ?? '')}')">+ Paper</button>
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
  const earls = allSignals.filter((s) => s.type === 'dump_ignition_early' || s.type === 'post_pump_dump_risk' || s.type === 'post_dump_bounce_risk');
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

// ── Paper trades ──────────────────────────────────────────────────────────────

let diPaperSort = { key: 'status', dir: 'asc' };

document.addEventListener('click', (e) => {
  const th = e.target.closest('[data-di-sort]');
  if (!th || !th.classList.contains('di-paper-sort')) return;
  const key = th.dataset.diSort;
  if (diPaperSort.key === key) {
    diPaperSort.dir = diPaperSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    diPaperSort = { key, dir: key === 'status' ? 'asc' : 'desc' };
  }
  renderDiPaperTable();
});

function diPaperSortValue(t, key) {
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

function compareDiValues(a, b, dir) {
  const aMiss = a == null || (typeof a === 'number' && isNaN(a));
  const bMiss = b == null || (typeof b === 'number' && isNaN(b));
  if (aMiss && bMiss) return 0;
  if (aMiss) return 1;
  if (bMiss) return -1;
  const r = typeof a === 'string' ? String(a).localeCompare(String(b), 'en') : a - b;
  return dir === 'asc' ? r : -r;
}

function sortDiPaperTrades(trades) {
  const { key, dir } = diPaperSort;
  return trades.slice().sort((a, b) => {
    const r = compareDiValues(diPaperSortValue(a, key), diPaperSortValue(b, key), dir);
    return r !== 0 ? r : compareDiValues(diPaperSortValue(a, 'time'), diPaperSortValue(b, 'time'), 'desc');
  });
}

function updateDiSortHeaders() {
  document.querySelectorAll('[data-di-sort]').forEach((th) => {
    const active = th.dataset.diSort === diPaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (diPaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

function fmtPnl(pnl, roe) {
  if (pnl == null) return '-';
  const sign = pnl >= 0 ? '+' : '';
  const cls  = pnl >= 0 ? 'positive' : 'negative';
  return `<span class="${cls}">${sign}$${Math.abs(pnl).toFixed(3)} (${sign}${Number(roe ?? 0).toFixed(1)}%)</span>`;
}

function renderDiPaperTable() {
  const tbody = document.getElementById('diPaperBody');
  const countEl = document.getElementById('diPaperCount');
  if (!tbody) return;

  const trades = diPaperTrades;
  const summary = diPaperSummaryCache;
  const open   = trades.filter((t) => t.status !== 'CLOSED');
  const closed = trades.filter((t) => t.status === 'CLOSED');

  let countTxt = `${open.length} đang mở · ${closed.length} đã đóng`;
  if (summary && summary.closed > 0) {
    const wr = Math.round(summary.wins / summary.closed * 100);
    countTxt += ` · ✅TP ${summary.tpHits ?? 0} 🔴SL ${summary.slHits ?? 0} · WR ${wr}%`;
    if (summary.avgRoe != null) countTxt += ` · AvgROE ${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`;
  }
  if (countEl) countEl.textContent = countTxt;

  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-cell">Chưa có paper trade nào từ dump ignition signals.</td></tr>';
    updateDiSortHeaders();
    return;
  }

  const sorted = sortDiPaperTrades([...open, ...closed]);
  tbody.innerHTML = sorted.map((t) => {
    const isShort  = t.side === 'SHORT';
    const sideHtml = isShort
      ? `<span style="color:var(--red);font-weight:700">SHORT</span>`
      : `<span style="color:var(--green);font-weight:700">LONG</span>`;
    const isClosed = t.status === 'CLOSED';
    const mark     = t.markPrice ?? t.exitPrice ?? '-';
    const actionBtns = isClosed
      ? `<button class="di-paper-close-btn" style="opacity:.6;font-size:10px" onclick="deleteDiPaperTrade('${t.id}')">Del</button>`
      : `<button class="di-paper-close-btn" onclick="closeDiPaperTrade('${t.id}')">Close</button>`;
    const rowStyle = isClosed ? 'opacity:.5' : '';
    const slColor = isShort ? 'var(--green)' : 'var(--red)';
    const tpColor = isShort ? 'var(--red)' : 'var(--green)';
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
      <td data-di-mark="${t.id}">${fmtPrice(mark)}</td>
      <td data-di-pnl="${t.id}">${fmtPnl(t.pnl, t.roe)}</td>
      <td data-di-roe="${t.id}">${t.roe != null ? (t.roe >= 0 ? '+' : '') + Number(t.roe).toFixed(1) + '%' : '-'}</td>
      <td style="font-size:11px">${outcomeHtml}</td>
      <td style="font-size:10px;color:var(--muted)">${t.source ?? '-'}</td>
      <td style="font-size:11px;color:var(--muted)">${new Date(t.createdAt).toLocaleTimeString('vi')}</td>
      <td>${actionBtns}</td>
    </tr>`;
  }).join('');
  updateDiSortHeaders();
}

let _diPaperFetching = false;
async function loadDiPaperTrades() {
  if (_diPaperFetching) return;
  _diPaperFetching = true;
  try {
    const res = await fetch('/api/di-paper-trades');
    if (!res.ok) return;
    const data = await res.json();
    diPaperTrades = data.trades ?? [];
    diPaperSummaryCache = data.summary;
    diPaperOpenSymbols = new Set(
      diPaperTrades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol),
    );
    renderDiPaperTable();
  } catch {} finally {
    _diPaperFetching = false;
  }
}

let _diPaperPollTimer = null;
function scheduleDiPaperPoll() {
  clearTimeout(_diPaperPollTimer);
  const hasOpen = diPaperTrades.some((t) => t.status === 'OPEN');
  _diPaperPollTimer = setTimeout(async () => {
    await loadDiPaperTrades();
    scheduleDiPaperPoll();
  }, hasOpen ? 3_000 : 15_000);
}

window.enterDiPaperTrade = async function(btn, symbol, side, entryPrice, score, sl, tp, noteEncoded) {
  btn.disabled = true;
  btn.textContent = '...';
  const note = noteEncoded ? decodeURIComponent(noteEncoded) : '';
  try {
    const res = await fetch('/api/di-paper-trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol, side, marginUsdt: 1, leverage: 10, entryPrice, tp: tp ?? null, sl: sl ?? null, source: `di-${score}`, note }),
    });
    if (res.ok) {
      btn.textContent = '⏳';
      setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
      loadDiPaperTrades();
    } else {
      btn.textContent = 'ERR';
      setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
    }
  } catch {
    btn.textContent = 'ERR';
    setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
  }
};

window.closeDiPaperTrade = async function(id) {
  try {
    const res = await fetch('/api/di-paper-trades/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { await loadDiPaperTrades(); scheduleDiPaperPoll(); }
  } catch {}
};

window.deleteDiPaperTrade = async function(id) {
  if (!confirm('Xóa paper trade này?')) return;
  try {
    const res = await fetch('/api/di-paper-trades/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { await loadDiPaperTrades(); scheduleDiPaperPoll(); }
  } catch {}
};

// ── Boot ──────────────────────────────────────────────────────────────────────

function showFetchError(err) {
  const status = err?.status ? `${err.status} ${err.statusText || ''}`.trim() : '';
  const msg = err?.status === 429
    ? 'API error 429: Binance rate limit'
    : `API error${status ? ` ${status}` : ''}`;
  scanStatus.textContent = msg;
  console.warn('[DumpIgnition] fetch failed:', err);
}

async function fetchAndApply(attempt = 0) {
  try {
    scanStatus.textContent = attempt === 0 ? 'Đang tải...' : `Warming cache... (${attempt})`;
    const res = await fetch('/api/dump-ignition-signals');
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
  await loadDiPaperTrades();
  scheduleDiPaperPoll();
})();
