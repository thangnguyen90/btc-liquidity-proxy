const API_URL = '/api/post-pump-kill-short-signals';
const SSE_URL = '/api/post-pump-kill-short-stream';

let allSignals = [];
let scannedAt = null;
let total = 0;

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

function buildCard(sig) {
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
          <strong class="${isShort ? 'negative' : isLong ? 'positive' : ''}">${fmtPrice(sig.entry)}</strong>
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
        <span>${escapeHtml(sig.reason)}</span>
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

await fetchAndApply();
connect();
