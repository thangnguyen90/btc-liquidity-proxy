const API = '/api/high-volume';
const DETAIL_BASE = '/'; // detail page uses ?s=SYMBOL

let data = {};
let lastUpdated = null;

const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const typeFilter = document.getElementById('typeFilter');
const sortInput = document.getElementById('sortInput');
const visibleCount = document.getElementById('visibleCount');
const scanStatus = document.getElementById('scanStatus');
const tbody = document.getElementById('volTableBody');

async function load() {
  try {
    const res = await fetch(API);
    data = await res.json();
    lastUpdated = Date.now();
    render();
    const count = Object.keys(data).length;
    scanStatus.textContent = count > 0 ? `${count} symbols · ${new Date().toLocaleTimeString('vi')}` : 'Chưa có dữ liệu';
  } catch (e) {
    scanStatus.textContent = 'Lỗi tải dữ liệu';
  }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

function fmtPct(v) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function fmtPrice(p) {
  if (p >= 1000) return p.toLocaleString('en', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
}

function getStatus(info) {
  if (info.isVolDump) return { label: '🔥 DUMP', cls: 'status-dump' };
  if (info.move4cPct >= 2.5) return { label: '📈 SURGE', cls: 'status-surge' };
  if (info.dumpCandlePct <= -1.5) return { label: '🕯️ DROP', cls: 'status-drop' };
  return { label: '⚡ HIGH', cls: 'status-high' };
}

function render() {
  const search = searchInput.value.trim().toUpperCase();
  const type = typeFilter.value;
  const sort = sortInput.value;

  let rows = Object.entries(data).map(([symbol, info]) => ({ symbol, ...info }));

  // Filter
  if (search) rows = rows.filter((r) => r.symbol.includes(search));
  if (type === 'dump') rows = rows.filter((r) => r.isVolDump);
  if (type === 'surge') rows = rows.filter((r) => !r.isVolDump && r.move4cPct >= 2.5);

  // Sort
  rows.sort((a, b) => {
    if (sort === 'maxRatio') return b.maxRatio - a.maxRatio;
    if (sort === 'highVolCount') return b.highVolCount - a.highVolCount;
    if (sort === 'dumpCandlePct') return a.dumpCandlePct - b.dumpCandlePct;
    if (sort === 'move4cPct') return a.move4cPct - b.move4cPct;
    return b.maxRatio - a.maxRatio;
  });

  visibleCount.textContent = rows.length;

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="table-empty">Không có coin nào phù hợp</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const status = getStatus(r);
    const c24 = r.change24h >= 0 ? 'positive' : 'negative';
    const candleColor = r.dumpCandlePct >= 0 ? 'positive' : 'negative';
    const move4Color = r.move4cPct >= 0 ? 'positive' : 'negative';
    const detailUrl = `/?s=${r.symbol}`;
    const ratioColor = r.maxRatio >= 3 ? 'style="color:var(--amber)"' : r.maxRatio >= 2 ? 'style="color:var(--green)"' : '';
    // Peak timing label
    const ago = r.peakCandlesAgo ?? 0;
    const peakLabel = ago === 0 ? 'now' : ago === 1 ? '15m' : `${ago * 15}m`;
    const peakCls = ago <= 1 ? 'positive' : ago <= 4 ? '' : 'muted-text';
    return `<tr>
      <td><a class="symbol-link" href="${detailUrl}">${r.symbol.replace('USDT', '')}<span class="sym-suffix">USDT</span></a></td>
      <td ${ratioColor}><strong>${r.maxRatio}x</strong> <small class="muted-text ${peakCls}">@${peakLabel}</small></td>
      <td>${r.highVolCount}/5 <small class="muted-text">hot</small></td>
      <td class="${candleColor}">${fmtPct(r.dumpCandlePct)}</td>
      <td class="${move4Color}">${fmtPct(r.move4cPct)}</td>
      <td>${fmtPrice(r.price)}</td>
      <td class="${c24}">${fmtPct(r.change24h)}</td>
      <td><span class="vol-status-badge ${status.cls}">${status.label}</span></td>
      <td class="muted-text">${timeAgo(r.scannedAt)}</td>
    </tr>`;
  }).join('');
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
typeFilter.addEventListener('change', render);
sortInput.addEventListener('change', render);

load();
setInterval(load, 65_000);
