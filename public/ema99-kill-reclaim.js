const SSE_URL = '/api/ema99-kill-reclaim-stream';
const API_URL = '/api/ema99-kill-reclaim-signals';

let allSignals = [];
let total = 0;
let processed = 0;
let scannedAt = null;

const grid = document.getElementById('ekrGrid');
const longCount = document.getElementById('longCount');
const shortCount = document.getElementById('shortCount');
const totalScanned = document.getElementById('totalScanned');
const lastScan = document.getElementById('lastScan');
const scanStatus = document.getElementById('scanStatus');
const cachedCount = document.getElementById('cachedCount');
const totalCount = document.getElementById('totalCount');
const foundCount = document.getElementById('foundCount');
const searchInput = document.getElementById('searchInput');
const sideFilter = document.getElementById('sideFilter');
const scoreFilter = document.getElementById('scoreFilter');
const sortSelect = document.getElementById('sortSelect');

function fmtPrice(p) {
  const v = Number(p);
  if (!Number.isFinite(v)) return '-';
  if (v >= 1000) return v.toLocaleString('en', { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(6);
}

function fmtPct(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function timeAgo(ts) {
  if (!ts) return '-';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

function chip(label, cls = '') {
  return `<span class="ekr-chip ${cls}">${label}</span>`;
}

function buildFactors(sig) {
  const f = sig.factors || {};
  const chips = [];
  chips.push(chip(`${sig.interval || '5m'}`, 'ok'));
  chips.push(chip(`${sig.action === 'SHORT' ? 'Dump' : 'Pump'} ${Number(f.contextMovePct ?? 0).toFixed(1)}%`, 'ok'));
  chips.push(chip(`Kill ${f.killAgeBars ?? '?'} nến trước`, Number(f.killAgeBars ?? 99) <= 3 ? 'ok' : 'warn'));
  chips.push(chip(`EMA99 dist ${Number(f.ema99DistPct ?? 0).toFixed(2)}%`, Number(f.ema99DistPct ?? 99) <= 1 ? 'ok' : 'warn'));
  chips.push(chip(`Wick ${Number(f.wickRejectPct ?? 0).toFixed(0)}%`, Number(f.wickRejectPct ?? 0) >= 40 ? 'ok' : ''));
  chips.push(chip(`Reclaim ${Number(f.reclaimPct ?? 0).toFixed(1)}%`, Number(f.reclaimPct ?? 0) >= 1.2 ? 'ok' : ''));
  chips.push(chip(`Vol ${Number(f.volRatio ?? 0).toFixed(1)}x`, Number(f.volRatio ?? 0) >= 2 ? 'ok' : 'warn'));
  if (f.rsi14 != null) chips.push(chip(`RSI ${Number(f.rsi14).toFixed(0)}`));
  chips.push(chip(`EMA99 ${fmtPrice(sig.ema99)}`));
  return chips.join('');
}

function buildCard(sig) {
  const isShort = sig.action === 'SHORT';
  const cls = isShort ? 'short' : 'long';
  const sideText = isShort ? 'SHORT · EMA99 Reject' : 'LONG · EMA99 Reclaim';
  const detailUrl = `/?symbol=${encodeURIComponent(sig.symbol)}`;
  const changeColor = Number(sig.change24h ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';
  const reason = sig.reason || (isShort
    ? 'Dump mạnh, wick lên EMA99 rồi reject xuống tiếp'
    : 'Pump mạnh, rũ về EMA99 rồi reclaim bật tiếp');
  return `
    <article class="ekr-card ${cls}">
      <div class="ekr-top">
        <div>
          <a class="ekr-symbol" href="${detailUrl}" target="_blank">${sig.symbol.replace(/USDT$/, '')}<span>USDT</span></a>
          <span class="ekr-change" style="color:${changeColor}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="ekr-right">
          <span class="ekr-badge ${cls}">${sideText}</span>
          <div class="ekr-score"><strong>${sig.score ?? '-'}</strong><span class="ekr-grade">${sig.grade ?? '-'}</span></div>
        </div>
      </div>

      <div class="ekr-pattern">${reason}</div>

      <div class="ekr-prices">
        <div class="ekr-price"><span>Entry</span><strong>${fmtPrice(sig.entry)}</strong></div>
        <div class="ekr-price"><span>SL</span><strong style="color:var(--red)">${fmtPrice(sig.sl)}</strong></div>
        <div class="ekr-price"><span>TP</span><strong style="color:var(--green)">${fmtPrice(sig.tp)}</strong></div>
      </div>

      <div class="ekr-factors">${buildFactors(sig)}</div>
      <div style="color:var(--muted);font-size:12px;line-height:1.45">${sig.note || ''}</div>

      <div class="ekr-footer">
        <span>${timeAgo(sig.scannedAt)} ago</span>
        <span>${isShort ? 'Kill long at EMA99' : 'Kill weak long at EMA99'}</span>
      </div>
    </article>
  `;
}

function render() {
  const q = searchInput.value.trim().toUpperCase();
  const side = sideFilter.value;
  const minScore = Number(scoreFilter.value || 0);
  let rows = allSignals.slice();
  if (q) rows = rows.filter((s) => s.symbol.includes(q));
  if (side !== 'all') rows = rows.filter((s) => s.action === side);
  if (minScore > 0) rows = rows.filter((s) => Number(s.score ?? 0) >= minScore);

  const sort = sortSelect.value;
  rows.sort((a, b) => {
    if (sort === 'fresh') return Number(a.factors?.killAgeBars ?? 99) - Number(b.factors?.killAgeBars ?? 99);
    if (sort === 'volume') return Number(b.factors?.volRatio ?? 0) - Number(a.factors?.volRatio ?? 0);
    if (sort === 'change') return Math.abs(Number(b.change24h ?? 0)) - Math.abs(Number(a.change24h ?? 0));
    return Number(b.score ?? 0) - Number(a.score ?? 0);
  });

  longCount.textContent = allSignals.filter((s) => s.action === 'LONG').length;
  shortCount.textContent = allSignals.filter((s) => s.action === 'SHORT').length;
  totalScanned.textContent = processed || '-';
  lastScan.textContent = scannedAt ? timeAgo(scannedAt) : '-';
  cachedCount.textContent = processed || 0;
  totalCount.textContent = total || 0;
  foundCount.textContent = allSignals.length;

  if (!rows.length) {
    grid.innerHTML = '<div class="empty">Chua co signal EMA99 kill/reclaim phu hop. Doi cache 5m du nen hoac ha score filter.</div>';
    return;
  }
  grid.innerHTML = rows.map(buildCard).join('');
}

function applyPayload(data) {
  allSignals = Array.isArray(data?.signals) ? data.signals : [];
  total = Number(data?.total ?? 0);
  processed = Number(data?.processed ?? 0);
  scannedAt = Number(data?.scannedAt ?? Date.now());
  scanStatus.textContent = data?.stale ? `Dung cache cu: ${data.staleReason || 'REST congested'}` : 'Live scan tu kline cache';
  render();
}

async function fetchOnce() {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    const data = await res.json();
    applyPayload(data);
  } catch (err) {
    scanStatus.textContent = `Fetch loi: ${err.message}`;
  }
}

function connectSse() {
  const es = new EventSource(SSE_URL);
  es.onopen = () => { scanStatus.textContent = 'SSE connected'; };
  es.onmessage = (ev) => {
    try { applyPayload(JSON.parse(ev.data)); }
    catch (err) { scanStatus.textContent = `Parse loi: ${err.message}`; }
  };
  es.onerror = () => {
    scanStatus.textContent = 'SSE reconnecting...';
  };
}

[searchInput, sideFilter, scoreFilter, sortSelect].forEach((el) => el.addEventListener('input', render));
connectSse();
fetchOnce();
setInterval(() => {
  lastScan.textContent = scannedAt ? timeAgo(scannedAt) : '-';
}, 1000);
setInterval(fetchOnce, 90_000);
