const API_URL = '/api/token-unlocks';

let payload = { rows: [], updatedAt: null, configured: false, stats: {} };
let filters = { q: '', window: 'ALL', sort: 'date' };

const els = {
  search: document.getElementById('unlockSearch'),
  window: document.getElementById('windowFilter'),
  sort: document.getElementById('sortInput'),
  refresh: document.getElementById('refreshBtn'),
  stats: document.getElementById('unlockStats'),
  status: document.getElementById('unlockStatus'),
  body: document.getElementById('unlockBody'),
  config: document.getElementById('configBox'),
};

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('vi-VN', { hour12: false });
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('vi-VN');
}

function daysTo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

function fmtCompact(v, suffix = '') {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B${suffix}`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M${suffix}`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K${suffix}`;
  return `${n.toFixed(abs >= 100 ? 0 : 2)}${suffix}`;
}

function fmtUsd(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `$${fmtCompact(n)}`;
}

function fmtPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(n >= 10 ? 1 : 2)}%`;
}

function riskFor(row) {
  const days = daysTo(row.unlockDate);
  const value = Number(row.unlockValueUsd) || 0;
  const supply = Number(row.percentSupply) || 0;
  const mcap = Number(row.percentMarketCap) || 0;
  let score = 0;
  if (days != null && days <= 7) score += 2;
  if (value >= 50_000_000) score += 2;
  else if (value >= 10_000_000) score += 1;
  if (supply >= 3 || mcap >= 3) score += 2;
  else if (supply >= 1 || mcap >= 1) score += 1;
  if (score >= 4) return { label: 'HIGH', cls: 'unlock-risk-high' };
  if (score >= 2) return { label: 'MID', cls: 'unlock-risk-mid' };
  return { label: 'LOW', cls: 'unlock-risk-low' };
}

function rows() {
  const q = filters.q.trim().toUpperCase();
  const maxDays = filters.window === 'ALL' ? Infinity : Number(filters.window);
  const list = [...(payload.rows ?? [])]
    .filter((r) => !q || String(r.symbol ?? '').includes(q) || String(r.name ?? '').toUpperCase().includes(q))
    .filter((r) => {
      const d = daysTo(r.unlockDate);
      return d == null ? false : d >= -1 && d <= maxDays;
    });

  list.sort((a, b) => {
    if (filters.sort === 'value') return (Number(b.unlockValueUsd) || 0) - (Number(a.unlockValueUsd) || 0);
    if (filters.sort === 'amount') return (Number(b.unlockAmount) || 0) - (Number(a.unlockAmount) || 0);
    if (filters.sort === 'percentSupply') return (Number(b.percentSupply) || 0) - (Number(a.percentSupply) || 0);
    if (filters.sort === 'percentMarketCap') return (Number(b.percentMarketCap) || 0) - (Number(a.percentMarketCap) || 0);
    return Date.parse(a.unlockDate) - Date.parse(b.unlockDate);
  });
  return list;
}

function renderStats() {
  const stats = payload.stats ?? {};
  els.stats.innerHTML = [
    ['Next 7d', stats.next7d ?? 0],
    ['Next 30d', stats.next30d ?? 0],
    ['Large 30d', stats.largeUnlocks30d ?? 0],
    ['Value 30d', fmtUsd(stats.totalValue30d)],
  ].map(([label, value]) => `
    <div class="unlock-stat">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join('');
}

function render() {
  const all = payload.rows ?? [];
  const list = rows();
  renderStats();

  if (!payload.configured) {
    els.config.style.display = '';
    els.config.innerHTML = `
      <strong>Chua cau hinh Token Unlocks API.</strong>
      <p class="unlock-note">Them <code>TOKEN_UNLOCKS_API_URL=...</code> va neu can <code>TOKEN_UNLOCKS_API_KEY=...</code> vao .env roi restart backend. Tam thoi co the nhap tay vao <code>data/token-unlocks.json</code> voi cac field: symbol, unlockDate, unlockAmount, unlockValueUsd, percentSupply, percentMarketCap.</p>
    `;
  } else {
    els.config.style.display = 'none';
  }

  els.status.textContent = `Updated ${fmtTime(payload.updatedAt)} · ${list.length}/${all.length} unlocks · ${payload.refreshing ? 'refreshing...' : 'ready'}${payload.error ? ` · ${payload.error}` : ''}`;

  if (!list.length) {
    els.body.innerHTML = `<tr><td colspan="10" class="table-empty">${payload.configured ? 'Khong co unlock phu hop bo loc.' : 'Chua co du lieu unlock.'}</td></tr>`;
    return;
  }

  els.body.innerHTML = list.slice(0, 300).map((r) => {
    const risk = riskFor(r);
    const days = daysTo(r.unlockDate);
    const detailUrl = `/?symbol=${encodeURIComponent(`${r.symbol}USDT`)}`;
    return `
      <tr>
        <td><a href="${detailUrl}" target="_blank" rel="noopener"><strong>${esc(r.symbol)}</strong></a><br><small>${esc(r.name)}</small></td>
        <td>${fmtDate(r.unlockDate)}</td>
        <td class="${days <= 7 ? 'negative' : 'neutral'}">${days == null ? '-' : `${days}d`}</td>
        <td>${fmtCompact(r.unlockAmount)}</td>
        <td>${fmtUsd(r.unlockValueUsd)}</td>
        <td>${fmtPct(r.percentSupply)}</td>
        <td>${fmtPct(r.percentMarketCap)}</td>
        <td class="${risk.cls}">${risk.label}</td>
        <td>${esc(r.allocation || '-')}</td>
        <td>${esc(r.unlockType || '-')}</td>
      </tr>
    `;
  }).join('');
}

async function load() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  payload = await res.json();
  render();
}

async function refresh() {
  els.refresh.disabled = true;
  els.refresh.textContent = 'Refreshing...';
  try {
    const res = await fetch('/api/token-unlocks/refresh', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
    render();
  } catch (err) {
    els.status.textContent = `Refresh loi: ${err.message}`;
  } finally {
    els.refresh.disabled = false;
    els.refresh.textContent = 'Refresh unlocks';
  }
}

els.search.addEventListener('input', () => { filters.q = els.search.value; render(); });
els.window.addEventListener('change', () => { filters.window = els.window.value; render(); });
els.sort.addEventListener('change', () => { filters.sort = els.sort.value; render(); });
els.refresh.addEventListener('click', refresh);

load().catch((err) => {
  els.status.textContent = `Khong tai duoc token unlocks: ${err.message}`;
});
setInterval(() => load().catch(() => {}), 60_000);
