const API_URL = '/api/post-pump-kill-short-signals';
const SSE_URL = '/api/post-pump-kill-short-stream';

let allSignals = [];
let scannedAt = null;
let total = 0;

let ppksPaperTrades      = [];
let ppksPaperOpenSymbols = new Set();
let ppksPaperSummaryCache = null;
let ppksPaperAvailableDays = [];
let ppksPaperSelectedDay = '';
let ppksPaperComboStats = [];

const grid = document.getElementById('ppksGrid');
const watchCount = document.getElementById('watchCount');
const shortCount = document.getElementById('shortCount');
const longCount = document.getElementById('longCount');
const avgScore = document.getElementById('avgScore');
const totalScanned = document.getElementById('totalScanned');
const scanStatus = document.getElementById('scanStatus');
const scanMeta = document.getElementById('scanMeta');
const metaTotal = document.getElementById('metaTotal');
const metaSignals = document.getElementById('metaSignals');
const metaTime = document.getElementById('metaTime');
const visibleCount = document.getElementById('visibleCount');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const scoreFilter = document.getElementById('scoreFilter');
const stageFilter = document.getElementById('stageFilter');
const symbolTest = document.getElementById('symbolTest');
const ppksPaperDayFilter = document.getElementById('ppksPaperDayFilter');
const ppksPaperOverview = document.getElementById('ppksPaperOverview');
const ppksComboStatsEl = document.getElementById('ppksComboStats');

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '-';
  if (p >= 1000) return Number(p).toLocaleString('en', { maximumFractionDigits: 2 });
  if (p >= 1) return Number(p).toFixed(4);
  if (p >= 0.01) return Number(p).toFixed(5);
  return Number(p).toFixed(7);
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function buildChips(sig) {
  const f = sig.factors || {};
  const isLong = sig.type === 'post_dump_kill_long';
  const chips = isLong ? [
    { label: `Dump ${Number(f.dumpPct ?? 0).toFixed(1)}%`, cls: (f.dumpPct ?? 0) >= 15 ? 'ok' : '' },
    { label: `Bounce ${Number(f.postDumpBouncePct ?? 0).toFixed(1)}%`, cls: (f.postDumpBouncePct ?? 0) >= 4 ? 'ok' : '' },
    { label: `${f.baseBars ?? '?'} bars base`, cls: (f.baseBars ?? 0) >= 12 ? 'ok' : '' },
    { label: `Sweep ${Number(f.sweepMovePct ?? 0).toFixed(1)}%`, cls: (f.sweepMovePct ?? 0) >= 2.5 ? 'ok' : '' },
    { label: `${Number(f.sweepAtrMove ?? 0).toFixed(1)} ATR`, cls: (f.sweepAtrMove ?? 0) >= 1.8 ? 'ok' : '' },
    { label: `Vol ${Number(f.sweepVolRatio ?? 0).toFixed(1)}x`, cls: (f.sweepVolRatio ?? 0) >= 2 ? 'ok' : '' },
    { label: `Wick ${Math.round((f.lowerWickFrac ?? 0) * 100)}%`, cls: (f.lowerWickFrac ?? 0) >= 0.4 ? 'ok' : 'warn' },
    { label: `Close ${Math.round((f.closePos ?? 0) * 100)}%`, cls: (f.closePos ?? 0) >= 0.5 ? 'ok' : 'warn' },
  ] : [
    { label: `Pump ${Number(f.pumpPct ?? 0).toFixed(1)}%`, cls: (f.pumpPct ?? 0) >= 15 ? 'ok' : '' },
    { label: `Drop ${Number(f.postPumpDropPct ?? 0).toFixed(1)}%`, cls: (f.postPumpDropPct ?? 0) >= 5 ? 'ok' : '' },
    { label: `${f.distBars ?? '?'} bars dist`, cls: (f.distBars ?? 0) >= 12 ? 'ok' : '' },
    { label: `Spike ${Number(f.spikeMovePct ?? 0).toFixed(1)}%`, cls: (f.spikeMovePct ?? 0) >= 2.5 ? 'ok' : '' },
    { label: `${Number(f.spikeAtrMove ?? 0).toFixed(1)} ATR`, cls: (f.spikeAtrMove ?? 0) >= 1.8 ? 'ok' : '' },
    { label: `Vol ${Number(f.spikeVolRatio ?? 0).toFixed(1)}x`, cls: (f.spikeVolRatio ?? 0) >= 2 ? 'ok' : '' },
    { label: `Wick ${Math.round((f.upperWickFrac ?? 0) * 100)}%`, cls: (f.upperWickFrac ?? 0) >= 0.4 ? 'ok' : 'warn' },
    { label: `Close ${Math.round((f.closePos ?? 0) * 100)}%`, cls: (f.closePos ?? 1) <= 0.55 ? 'ok' : 'warn' },
  ];
  if (f.rsi6 != null) chips.push({ label: `RSI6 ${Number(f.rsi6).toFixed(0)}`, cls: isLong ? (f.rsi6 <= 28 ? 'ok' : 'warn') : (f.rsi6 >= 75 ? 'bad' : 'warn') });
  if (f.belowEma99) chips.push({ label: 'Below EMA99', cls: isLong ? 'warn' : 'bad' });
  if (f.emaBear) chips.push({ label: 'EMA bear', cls: isLong ? 'warn' : 'bad' });
  return chips.map((c) => `<span class="ppks-chip ${c.cls}">${escapeHtml(c.label)}</span>`).join('');
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
  const stage = sig.stage || 'watch_spike';
  const isShort = stage === 'confirmed_short';
  const isLong = stage === 'confirmed_long';
  const isLongType = sig.type === 'post_dump_kill_long';
  const gradeClass = `grade-${String(sig.grade || 'd').toLowerCase()}`;
  const f = sig.factors || {};
  const detailUrl = `/?symbol=${encodeURIComponent(sig.symbol)}`;
  const changeClass = (sig.change24h ?? 0) >= 0 ? 'positive' : 'negative';
  const desc = isLongType
    ? (isLong ? 'Sweep low da reclaim, uu tien LONG reversal' : 'Cay kill-long sweep vua xuat hien, cho reclaim')
    : (isShort ? 'Spike da reject, uu tien fade SHORT sau confirm' : 'Cay kill-short spike vua xuat hien, cho reject/retest');
  const patternLine = isLongType
    ? `Dump ${Number(f.dumpPct ?? 0).toFixed(1)}%, bounce ${Number(f.postDumpBouncePct ?? 0).toFixed(1)}%, sweep low ${fmtPrice(f.sweepLow)}`
    : `Pump ${Number(f.pumpPct ?? 0).toFixed(1)}%, drop ${Number(f.postPumpDropPct ?? 0).toFixed(1)}%, spike high ${fmtPrice(f.spikeHigh)}`;
  const badgeText = isShort ? 'SHORT' : isLong ? 'LONG' : 'WATCH';
  const badgeClass = isShort ? 'short' : isLongType ? 'long' : '';

  return `
    <article class="ppks-card ${escapeHtml(stage)}">
      <div class="ppks-top">
        <div>
          <a class="ppks-symbol" href="${detailUrl}" target="_blank" rel="noopener">
            ${escapeHtml(sig.symbol.replace(/USDT$/, ''))}<span>USDT</span>
          </a>
          <span class="ppks-change ${changeClass}" data-price="${escapeHtml(sig.symbol)}">${fmtPct(sig.change24h)} 24h - ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="ppks-right">
          <span class="ppks-badge ${badgeClass}">${badgeText}</span>
          <div class="ppks-score">
            <strong>${sig.score}</strong>
            <span class="ppks-grade ${gradeClass}">${escapeHtml(sig.grade || '-')}</span>
          </div>
        </div>
      </div>

      <div class="ppks-pattern">
        ${escapeHtml(desc)}<br>
        ${escapeHtml(patternLine)}
      </div>

      <div class="ppks-prices">
        <div class="ppks-cell">
          <span>${isShort ? 'Entry short' : isLong ? 'Entry long' : 'Watch price'}</span>
          <strong class="${isShort ? 'negative' : isLong ? 'positive' : ''}">${fmtPrice(sig.entry)} ${levBadge}</strong>
        </div>
        <div class="ppks-cell">
          <span>SL</span>
          <strong class="negative">${fmtPrice(sig.sl)}</strong>
        </div>
        <div class="ppks-cell">
          <span>TP</span>
          <strong class="positive">${fmtPrice(sig.tp)}</strong>
        </div>
      </div>

      <div class="ppks-chips">${buildChips(sig)}</div>
      <div class="ppks-note">${escapeHtml(sig.note)}</div>
      <div class="ppks-footer">
        <span>${timeAgo(sig.scannedAt)}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--muted)">${escapeHtml(sig.reason)}</span>
          <button class="ppks-paper-btn ${isLongType ? 'long' : 'short'}" onclick="enterPpksPaperTrade(this,'${escapeHtml(sig.symbol)}','${isLongType ? 'LONG' : 'SHORT'}',${sig.entry},${sig.score},${sig.sl ?? 'null'},${sig.tp ?? 'null'},'${encodeURIComponent(sig.note ?? '')}','${escapeHtml(sig.type ?? '')}','${escapeHtml(sig.grade ?? '')}')">+ Paper</button>
        </div>
      </div>
    </article>
  `;
}

function render() {
  const search = searchInput.value.trim().toUpperCase();
  const minScore = Number(scoreFilter.value);
  const stage = stageFilter.value;

  let rows = allSignals.slice();
  if (search) rows = rows.filter((s) => s.symbol.includes(search));
  if (minScore > 0) rows = rows.filter((s) => s.score >= minScore);
  if (stage !== 'all') rows = rows.filter((s) => s.stage === stage);

  const watch = allSignals.filter((s) => s.stage === 'watch_spike' || s.stage === 'watch_long_sweep').length;
  const confirmed = allSignals.filter((s) => s.stage === 'confirmed_short').length;
  const confirmedLong = allSignals.filter((s) => s.stage === 'confirmed_long').length;
  watchCount.textContent = watch;
  shortCount.textContent = confirmed;
  shortCount.className = confirmed ? 'negative' : '';
  longCount.textContent = confirmedLong;
  longCount.className = confirmedLong ? 'positive' : '';
  totalScanned.textContent = total || '-';
  visibleCount.textContent = rows.length;
  const scores = allSignals.map((s) => Number(s.score)).filter(Number.isFinite);
  avgScore.textContent = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(0) : '-';

  if (!rows.length) {
    grid.innerHTML = `
      <div class="ppks-empty">
        <strong>${allSignals.length ? 'Khong co ket qua filter' : 'Chua co signal'}</strong>
        ${allSignals.length ? 'Thu xoa search, ha min score, hoac chon All stage.' : 'Chua co mau kill-spike reversal trong top symbols.'}
      </div>`;
    return;
  }
  grid.innerHTML = rows.map(buildCard).join('');
}

function applyData(data) {
  allSignals = data.signals ?? [];
  scannedAt = data.scannedAt;
  total = data.total ?? 0;
  const processed = data.processed ?? 0;
  scanMeta.style.display = '';
  metaTotal.textContent = processed > 0 ? `${processed}/${total}` : total;
  metaSignals.textContent = allSignals.length;
  metaTime.textContent = scannedAt ? new Date(scannedAt).toLocaleTimeString('vi') : '-';
  scanStatus.textContent = allSignals.length
    ? `${allSignals.length} signals - ${new Date().toLocaleTimeString('vi')}`
    : `No signals - ${new Date().toLocaleTimeString('vi')}`;
  render();
}

function connect() {
  const es = new EventSource(SSE_URL);
  es.onopen = () => { scanStatus.textContent = 'Live'; };
  es.onmessage = (event) => {
    try { applyData(JSON.parse(event.data)); } catch {}
  };
  es.onerror = () => {
    scanStatus.textContent = 'Reconnecting...';
    es.close();
    setTimeout(connect, 3000);
  };
}

async function fetchAndApply(attempt = 0) {
  try {
    scanStatus.textContent = attempt ? `Warming cache... (${attempt})` : 'Dang tai...';
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    applyData(data);
    if ((data.processed ?? 0) === 0 && attempt < 12) {
      setTimeout(() => fetchAndApply(attempt + 1), Math.min(5000 + attempt * 3000, 20000));
    }
  } catch (err) {
    scanStatus.textContent = `API error ${err.message || ''}`.trim();
    console.warn('[PPKS] fetch failed:', err);
  }
}

async function testSymbol() {
  const raw = searchInput.value.trim().toUpperCase();
  if (!raw) return;
  const symbol = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  try {
    scanStatus.textContent = `Testing ${symbol}...`;
    const res = await fetch(`${API_URL}?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    applyData(data);
    if (data.noSignalReason) scanStatus.textContent = `${symbol}: ${data.noSignalReason}`;
  } catch (err) {
    scanStatus.textContent = `Test error ${err.message || ''}`.trim();
  }
}

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
symbolTest.addEventListener('click', testSymbol);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') testSymbol();
});

// ── Paper trades ──────────────────────────────────────────────────────────────

let ppksPaperSort = { key: 'status', dir: 'asc' };

document.addEventListener('click', (e) => {
  const th = e.target.closest('[data-ppks-sort]');
  if (!th || !th.classList.contains('ppks-paper-sort')) return;
  const key = th.dataset.ppksSort;
  if (ppksPaperSort.key === key) {
    ppksPaperSort.dir = ppksPaperSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    ppksPaperSort = { key, dir: key === 'status' ? 'asc' : 'desc' };
  }
  renderPpksPaperTable();
});

function ppksPaperSortValue(t, key) {
  if (key === 'symbol') return t.symbol ?? '';
  if (key === 'side')   return t.side ?? '';
  if (key === 'entry')  return Number(t.entryPrice);
  if (key === 'sl')     return t.sl == null ? null : Number(t.sl);
  if (key === 'tp')     return t.tp == null ? null : Number(t.tp);
  if (key === 'btcCorr') return t.btcCorr == null ? null : Number(t.btcCorr);
  if (key === 'btcTrend') return t.btcHealth?.btcTrendScore ?? t.btcTrendScore ?? null;
  if (key === 'mark')   return Number(t.markPrice ?? t.exitPrice);
  if (key === 'pnl')    return t.pnl == null ? null : Number(t.pnl);
  if (key === 'roe')    return t.roe == null ? null : Number(t.roe);
  if (key === 'combo')  return t.ppksCombo ?? t.pumpCombo ?? '';
  if (key === 'source') return t.source ?? '';
  if (key === 'time')   return Date.parse(t.createdAt ?? '') || 0;
  if (key === 'status') return ({ OPEN: 0, PENDING: 1, CLOSED: 2 })[t.status] ?? 9;
  return '';
}

function comparePpksValues(a, b, dir) {
  const aMiss = a == null || (typeof a === 'number' && isNaN(a));
  const bMiss = b == null || (typeof b === 'number' && isNaN(b));
  if (aMiss && bMiss) return 0;
  if (aMiss) return 1;
  if (bMiss) return -1;
  const r = typeof a === 'string' ? String(a).localeCompare(String(b), 'en') : a - b;
  return dir === 'asc' ? r : -r;
}

function sortPpksPaperTrades(trades) {
  const { key, dir } = ppksPaperSort;
  return trades.slice().sort((a, b) => {
    const r = comparePpksValues(ppksPaperSortValue(a, key), ppksPaperSortValue(b, key), dir);
    return r !== 0 ? r : comparePpksValues(ppksPaperSortValue(a, 'time'), ppksPaperSortValue(b, 'time'), 'desc');
  });
}

function updatePpksSortHeaders() {
  document.querySelectorAll('[data-ppks-sort]').forEach((th) => {
    const active = th.dataset.ppksSort === ppksPaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (ppksPaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

function fmtPpksPnl(pnl, roe) {
  if (pnl == null) return '-';
  const sign = pnl >= 0 ? '+' : '';
  const cls  = pnl >= 0 ? 'positive' : 'negative';
  return `<span class="${cls}">${sign}$${Math.abs(pnl).toFixed(3)} (${sign}${Number(roe ?? 0).toFixed(1)}%)</span>`;
}

function fmtPpksMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(3)}`;
}

function ppksTradeCombo(t) {
  return String(t.ppksCombo ?? t.pumpCombo ?? '-');
}

function renderPpksBtcCorrBadge(t) {
  const corr = Number(t?.btcCorr);
  if (!Number.isFinite(corr)) {
    return '<span title="Lệnh cũ chưa lưu btcCorr" style="font-size:10px;font-weight:900;color:var(--muted)">BTC NO DATA</span>';
  }
  const color = corr >= 0.5 ? '#34d399' : corr >= 0.3 ? '#fbbf24' : '#fb7185';
  const label = corr >= 0.5 ? '✓ THEO' : corr >= 0.3 ? '~ YẾU' : '✗ ĐỘC LẬP';
  return `<span title="corr coin vs BTC=${corr.toFixed(2)}" style="font-size:10px;font-weight:950;color:${color}">${label} ${corr.toFixed(2)}</span>`;
}

function renderPpksBtcTrendBadge(t) {
  const h = t?.btcHealth ?? {};
  const dir = String(h.btcTrendDir ?? t?.btcTrendDir ?? '').toLowerCase();
  const score = Number(h.btcTrendScore ?? t?.btcTrendScore);
  const pct6h = Number(h.pct6h);
  const side = String(t?.side ?? '').toUpperCase();
  if (!dir && !Number.isFinite(score)) {
    return '<span title="Lệnh cũ chưa lưu BTC snapshot" style="font-size:10px;font-weight:900;color:var(--muted)">BTC NO DATA</span>';
  }
  const expected = side === 'LONG' ? 'up' : side === 'SHORT' ? 'down' : '';
  const aligned = dir && expected ? dir === expected : null;
  const trendText = dir ? `BTC ${dir.toUpperCase()}${Number.isFinite(score) ? ` ${score}` : ''}` : 'BTC ?';
  const pctText = Number.isFinite(pct6h) ? `${pct6h >= 0 ? '+' : ''}${pct6h.toFixed(2)}%/6h` : '';
  const color = dir === 'up' ? (Number.isFinite(score) && score < 45 ? '#fbbf24' : '#34d399')
    : dir === 'down' ? (Number.isFinite(score) && score < 45 ? '#fbbf24' : '#fb7185')
      : '#9daaa5';
  const relColor = aligned == null ? 'var(--muted)' : aligned ? '#34d399' : '#fb7185';
  const relText = aligned == null ? '-' : aligned ? 'THUẬN BTC' : 'NGƯỢC BTC';
  return `<div title="${escapeHtml([trendText, pctText, relText].filter(Boolean).join(' | '))}" style="display:flex;flex-direction:column;gap:3px;align-items:flex-start">
    <span style="display:inline-flex;gap:4px;align-items:center;max-width:128px;padding:2px 6px;border-radius:4px;border:1px solid ${color};background:rgba(15,23,42,.22);color:${color};font-size:10px;font-weight:950;line-height:1.15">${escapeHtml(trendText)}${pctText ? `<small style="font-size:9px;font-weight:850;color:${color}">${escapeHtml(pctText)}</small>` : ''}</span>
    <span style="font-size:10px;font-weight:950;color:${relColor}">${relText}</span>
  </div>`;
}

function renderPpksOverview(summary) {
  if (!ppksPaperOverview || !summary) return;
  const byMargin = summary.byMargin ?? {};
  const wr = summary.closed > 0 ? Math.round(summary.wins / summary.closed * 100) : null;
  const cards = [{
    label: 'Tổng filter',
    title: `${summary.open ?? 0} open · ${summary.closed ?? 0} closed`,
    detail: `WR ${wr == null ? '-' : `${wr}%`} · AvgROE ${summary.avgRoe == null ? '-' : `${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`}`,
    netPnl: summary.netPnl,
  }, byMargin.test10, byMargin.test1, byMargin.other].filter(Boolean);
  ppksPaperOverview.innerHTML = cards.map((row) => {
    const pnl = Number(row.netPnl ?? row.pnl ?? 0);
    const cls = pnl > 0 ? 'good' : pnl < 0 ? 'bad' : '';
    const title = row.title ?? `${row.open ?? 0} open · ${row.closed ?? 0} closed`;
    const detail = row.detail ?? `WR ${row.wr == null ? '-' : `${row.wr}%`} · ${row.wins ?? 0}W/${row.losses ?? 0}L · AvgROE ${row.avgRoe == null ? '-' : `${row.avgRoe > 0 ? '+' : ''}${row.avgRoe}%`}`;
    return `<div class="ppks-overview-card ${cls}">
      <span>${escapeHtml(row.label ?? 'Group')}</span>
      <strong>${fmtPpksMoney(pnl)}</strong>
      <div>${escapeHtml(title)}</div>
      <div>${escapeHtml(detail)}</div>
    </div>`;
  }).join('');
}

function renderPpksComboStats(rows = ppksPaperComboStats) {
  if (!ppksComboStatsEl) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    ppksComboStatsEl.style.display = 'none';
    ppksComboStatsEl.innerHTML = '';
    return;
  }
  ppksComboStatsEl.style.display = '';
  ppksComboStatsEl.innerHTML = list.map((row, index) => {
    const key = String(row.key ?? '-');
    const parts = key.split('|').map((p) => p.trim()).filter(Boolean);
    const title = parts.slice(0, 3).join(' · ') || key;
    const tags = parts.slice(3).map((part) => {
      const upper = part.toUpperCase();
      const cls = upper.includes('BAD') || upper.includes('BLOCK') || upper.includes('RAC') ? 'bad'
        : upper.includes('GOOD') || upper.includes('OK') || upper.includes('THUAN') || upper.includes('THEO') ? 'hot'
          : '';
      return `<span class="ppks-combo-tag ${cls}" title="${escapeHtml(part)}">${escapeHtml(part)}</span>`;
    }).join('');
    const quality = String(row.quality ?? '').toLowerCase();
    const cardCls = quality.includes('good') ? 'good' : quality.includes('bad') ? 'bad' : 'neutral';
    const pnl = Number(row.pnl ?? 0);
    const pnlCls = pnl >= 0 ? 'pos' : 'neg';
    const wr = row.wr == null ? '-' : `${Number(row.wr).toFixed(1)}%`;
    const avgRoe = row.avgRoe == null ? '-' : `${Number(row.avgRoe) >= 0 ? '+' : ''}${Number(row.avgRoe).toFixed(1)}%`;
    const plan = row.tradePlan ?? {};
    const planLabel = String(plan.label ?? '').trim() || 'TEST $10';
    const planMargin = Number(plan.marginUsdt);
    const planCls = Number.isFinite(planMargin) && planMargin <= 1.01 ? 'bad' : 'hot';
    const planTitle = plan.reason ? ` title="${escapeHtml(plan.reason)}"` : '';
    return `<div class="ppks-combo-card ${cardCls}">
      <div class="ppks-combo-head">
        <div class="ppks-combo-title">#${index + 1} ${escapeHtml(title)}</div>
        <span class="ppks-combo-tag ${planCls}"${planTitle}>${escapeHtml(planLabel)}</span>
      </div>
      <div class="ppks-combo-tags">${tags}</div>
      <div class="ppks-combo-stats">
        <div>${row.wins ?? 0}W/${row.losses ?? 0}L · WR ${wr} · Closed ${row.closed ?? 0}/${row.total ?? 0}</div>
        <div class="ppks-combo-pnl ${pnlCls}">PnL ${fmtPpksMoney(pnl)} · AvgROE ${avgRoe}</div>
      </div>
    </div>`;
  }).join('');
}

function renderPpksPaperTable() {
  const tbody   = document.getElementById('ppksPaperBody');
  const countEl = document.getElementById('ppksPaperCount');
  if (!tbody) return;

  const trades  = ppksPaperTrades;
  const summary = ppksPaperSummaryCache;
  renderPpksOverview(summary);
  renderPpksComboStats();
  const open    = trades.filter((t) => t.status !== 'CLOSED');
  const closed  = trades.filter((t) => t.status === 'CLOSED');

  let countTxt = `${open.length} đang mở · ${closed.length} đã đóng`;
  if (summary?.day) countTxt = `${summary.day} · ${countTxt}`;
  if (summary && summary.closed > 0) {
    const wr = Math.round(summary.wins / summary.closed * 100);
    countTxt += ` · ✅TP ${summary.tpHits ?? 0} 🔴SL ${summary.slHits ?? 0} · WR ${wr}%`;
    if (summary.avgRoe != null) countTxt += ` · AvgROE ${summary.avgRoe > 0 ? '+' : ''}${summary.avgRoe}%`;
  }
  if (summary) {
    const net = Number(summary.netPnl ?? 0);
    const realized = Number(summary.realizedPnl ?? 0);
    const unrealized = Number(summary.unrealizedPnl ?? 0);
    countTxt += ` · PnL ${net >= 0 ? '+' : ''}${net.toFixed(3)}`
      + ` (real ${realized >= 0 ? '+' : ''}${realized.toFixed(3)}`
      + ` · live ${unrealized >= 0 ? '+' : ''}${unrealized.toFixed(3)})`;
  }
  if (countEl) countEl.textContent = countTxt;

  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="16" class="empty-cell">Chưa có paper trade nào từ post-pump kill-short signals.</td></tr>';
    updatePpksSortHeaders();
    return;
  }

  const sorted = sortPpksPaperTrades([...open, ...closed]);
  tbody.innerHTML = sorted.map((t) => {
    const isShort  = t.side === 'SHORT';
    const sideHtml = isShort
      ? `<span style="color:var(--blue);font-weight:700">SHORT</span>`
      : `<span style="color:var(--green);font-weight:700">LONG</span>`;
    const isClosed = t.status === 'CLOSED';
    const mark     = t.markPrice ?? t.exitPrice ?? '-';
    const actionBtns = isClosed
      ? `<button class="ppks-paper-close-btn" style="opacity:.6;font-size:10px" onclick="deletePpksPaperTrade('${t.id}')">Del</button>`
      : `<button class="ppks-paper-close-btn" onclick="closePpksPaperTrade('${t.id}')">Close</button>`;
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
      <td>${renderPpksBtcCorrBadge(t)}</td>
      <td>${renderPpksBtcTrendBadge(t)}</td>
      <td>${fmtPrice(mark)}</td>
      <td>${fmtPpksPnl(t.pnl, t.roe)}</td>
      <td>${t.roe != null ? (t.roe >= 0 ? '+' : '') + Number(t.roe).toFixed(1) + '%' : '-'}</td>
      <td style="font-size:11px">${outcomeHtml}</td>
      <td style="font-size:10px;color:var(--muted);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(ppksTradeCombo(t))}">${escapeHtml(ppksTradeCombo(t))}</td>
      <td style="font-size:10px;color:var(--muted)">${t.source ?? '-'}</td>
      <td style="font-size:11px;color:var(--muted)">${new Date(t.createdAt).toLocaleTimeString('vi')}</td>
      <td><span class="ppks-combo-tag ${Number(t.marginUsdt) <= 1.01 ? 'bad' : 'hot'}">TEST $${Number(t.marginUsdt ?? 0).toFixed(Number.isInteger(Number(t.marginUsdt ?? 0)) ? 0 : 2)}</span></td>
      <td>${actionBtns}</td>
    </tr>`;
  }).join('');
  updatePpksSortHeaders();
}

let _ppksPaperFetching = false;
async function loadPpksPaperTrades() {
  if (_ppksPaperFetching) return;
  _ppksPaperFetching = true;
  try {
    const params = new URLSearchParams();
    if (ppksPaperSelectedDay) params.set('day', ppksPaperSelectedDay);
    const res = await fetch(`/api/ppks-paper-trades${params.toString() ? `?${params}` : ''}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    ppksPaperTrades = data.trades ?? [];
    ppksPaperSummaryCache = data.summary;
    ppksPaperComboStats = data.comboStats ?? [];
    ppksPaperAvailableDays = data.availableDays ?? ppksPaperAvailableDays;
    renderPpksPaperDayFilter();
    ppksPaperOpenSymbols = new Set(
      ppksPaperTrades.filter((t) => ['PENDING', 'OPEN'].includes(t.status)).map((t) => t.symbol),
    );
    renderPpksPaperTable();
  } catch {} finally {
    _ppksPaperFetching = false;
  }
}

function renderPpksPaperDayFilter() {
  if (!ppksPaperDayFilter) return;
  const current = ppksPaperDayFilter.value;
  const nextValue = ppksPaperSelectedDay || current;
  ppksPaperDayFilter.innerHTML = [
    '<option value="">Tất cả</option>',
    ...ppksPaperAvailableDays.map((day) => `<option value="${escapeHtml(day)}">${escapeHtml(day)}</option>`),
  ].join('');
  ppksPaperDayFilter.value = ppksPaperAvailableDays.includes(nextValue) ? nextValue : '';
  ppksPaperSelectedDay = ppksPaperDayFilter.value;
}

let _ppksPaperPollTimer = null;
function schedulePpksPaperPoll() {
  clearTimeout(_ppksPaperPollTimer);
  const hasOpen = ppksPaperTrades.some((t) => t.status === 'OPEN');
  _ppksPaperPollTimer = setTimeout(async () => {
    await loadPpksPaperTrades();
    schedulePpksPaperPoll();
  }, hasOpen ? 3_000 : 15_000);
}

window.enterPpksPaperTrade = async function(btn, symbol, side, entryPrice, score, sl, tp, noteEncoded, signalType, grade) {
  btn.disabled = true;
  btn.textContent = '...';
  const note = noteEncoded ? decodeURIComponent(noteEncoded) : '';
  try {
    const res = await fetch('/api/ppks-paper-trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol,
        side,
        leverage: 10,
        entryPrice,
        tp: tp ?? null,
        sl: sl ?? null,
        source: `ppks-${score}`,
        ppksSignalType: signalType || 'PPKS',
        ppksSignalGrade: grade || null,
        ppksSignalTimeframe: '15m',
        note,
      }),
    });
    if (res.ok) {
      btn.textContent = '⏳';
      setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
      loadPpksPaperTrades();
    } else {
      btn.textContent = 'ERR';
      setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
    }
  } catch {
    btn.textContent = 'ERR';
    setTimeout(() => { btn.textContent = '+ Paper'; btn.disabled = false; }, 2000);
  }
};

ppksPaperDayFilter?.addEventListener('change', async () => {
  ppksPaperSelectedDay = ppksPaperDayFilter.value;
  await loadPpksPaperTrades();
  schedulePpksPaperPoll();
});

window.closePpksPaperTrade = async function(id) {
  try {
    const res = await fetch('/api/ppks-paper-trades/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { await loadPpksPaperTrades(); schedulePpksPaperPoll(); }
  } catch {}
};

window.deletePpksPaperTrade = async function(id) {
  if (!confirm('Xóa paper trade này?')) return;
  try {
    const res = await fetch('/api/ppks-paper-trades/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { await loadPpksPaperTrades(); schedulePpksPaperPoll(); }
  } catch {}
};

await fetchAndApply();
connect();
await loadPpksPaperTrades();
schedulePpksPaperPoll();
