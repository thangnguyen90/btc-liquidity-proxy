const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const periodSelect = document.getElementById('periodSelect');
const dirFilter = document.getElementById('dirFilter');
const refreshBtn = document.getElementById('refreshBtn');
const scanStatus = document.getElementById('scanStatus');
const scanningBanner = document.getElementById('scanningBanner');
const lsBody = document.getElementById('lsBody');

let allRows = [];
let pollTimer = null;
let isScanning = false;

function fmt(n, d = 2) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function render() {
  const q = searchInput.value.trim().toUpperCase();
  const dir = dirFilter.value;

  const rows = allRows.filter((r) => {
    if (q && !r.symbol.includes(q)) return false;
    if (dir !== 'all' && r.direction !== dir) return false;
    return true;
  });

  if (!rows.length) {
    lsBody.innerHTML = '<tr><td colspan="7" class="empty-row">Không có tín hiệu nào</td></tr>';
    return;
  }

  lsBody.innerHTML = rows.map((r) => {
    const isLong = r.direction === 'long';
    const dirClass = isLong ? 'positive' : 'negative';
    const dirLabel = isLong ? '🔺 LONG' : '🔻 SHORT';
    const extremeLabel = isLong ? `Đáy ${r.extreme}%` : `Đỉnh ${r.extreme}%`;
    const strengthColor = r.strength >= 0.8 ? 'var(--amber)' : 'var(--text)';

    // bars display: e.g. "2 bars (30m)" for 15m period
    const period = periodSelect.value;
    const mins = period === '5m' ? 5 : 15;
    const barsLabel = `${r.barsAgo} bars (${r.barsAgo * mins}m)`;

    const sym = r.symbol.replace('USDT', '');
    return `<tr class="signal-row" data-sym="${r.symbol}">
      <td><strong>${sym}</strong><span class="muted">USDT</span></td>
      <td><span class="dir-badge ${dirClass}">${dirLabel}</span></td>
      <td>${r.current}%</td>
      <td class="${isLong ? 'negative' : 'positive'}">${extremeLabel}</td>
      <td class="muted">${barsLabel}</td>
      <td style="color:${strengthColor};font-weight:600">+${r.strength}pp <span class="muted" style="font-weight:400">/ ${r.range}pp</span></td>
      <td>${fmt(r.markPrice, 4)}</td>
    </tr>`;
  }).join('');

  lsBody.querySelectorAll('tr[data-sym]').forEach((tr) => {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      window.location.href = `/?s=${tr.dataset.sym}`;
    });
  });
}

async function load(forceRescan = false) {
  const period = periodSelect.value;
  const url = `/api/ls-ratio-scan?period=${period}${forceRescan ? '&rescan=1' : ''}`;

  try {
    const res = await fetch(url);
    const json = await res.json();

    isScanning = json.scanning;
    scanningBanner.style.display = isScanning ? 'block' : 'none';

    if (json.updatedAt) {
      const ago = Math.round((Date.now() - json.updatedAt) / 1000);
      scanStatus.textContent = `${json.data.length} signals · ${ago}s ago`;
    } else {
      scanStatus.textContent = isScanning ? 'Scanning…' : 'No data';
    }

    if (json.data.length) {
      allRows = json.data;
      render();
    }

    // Poll every 3s while scanning, otherwise every 90s
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => load(), isScanning ? 3000 : 90_000);
  } catch (e) {
    scanStatus.textContent = 'Error';
    pollTimer = setTimeout(() => load(), 10_000);
  }
}

searchInput.addEventListener('input', () => {
  searchClear.style.display = searchInput.value ? 'block' : 'none';
  render();
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  render();
});
periodSelect.addEventListener('change', () => { allRows = []; load(); });
dirFilter.addEventListener('change', render);
refreshBtn.addEventListener('click', () => { allRows = []; load(true); });

load();
