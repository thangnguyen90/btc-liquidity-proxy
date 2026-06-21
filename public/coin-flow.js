const API_URL = '/api/coin-flow';

let payload = { rows: [], updatedAt: null, configured: false };
let filters = { q: '', bias: 'ALL', sort: 'score' };

const els = {
  search: document.getElementById('flowSearch'),
  bias: document.getElementById('biasFilter'),
  sort: document.getElementById('sortInput'),
  refresh: document.getElementById('refreshBtn'),
  stats: document.getElementById('flowStats'),
  status: document.getElementById('flowStatus'),
  body: document.getElementById('flowBody'),
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

function fmtPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(5);
}

function fmtUsd(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function biasClass(bias) {
  return `bias-${String(bias ?? 'neutral').toLowerCase()}`;
}

function rows() {
  const q = filters.q.trim().toUpperCase();
  const list = [...(payload.rows ?? [])]
    .filter((r) => filters.bias === 'ALL' || r.bias === filters.bias)
    .filter((r) => !q || String(r.symbol ?? '').includes(q) || String(r.symbolPair ?? '').includes(q));

  list.sort((a, b) => {
    if (filters.sort === 'ratio') return Math.abs(b.ratio ?? 0) - Math.abs(a.ratio ?? 0);
    if (filters.sort === 'net24h') return Math.abs(b.spot?.d1 ?? b.netflowUsd ?? 0) - Math.abs(a.spot?.d1 ?? a.netflowUsd ?? 0);
    if (filters.sort === 'volume') return (b.quoteVolume ?? 0) - (a.quoteVolume ?? 0);
    return (b.flowScore ?? 0) - (a.flowScore ?? 0);
  });
  return list;
}

function renderStats(all) {
  const bullish = all.filter((r) => r.bias === 'BULLISH').length;
  const bearish = all.filter((r) => r.bias === 'BEARISH').length;
  const strongOut = all.filter((r) => Number(r.spot?.d1 ?? r.netflowUsd) < 0 && Math.abs(Number(r.ratio ?? 0)) >= 0.03).length;
  const strongIn = all.filter((r) => Number(r.spot?.d1 ?? r.netflowUsd) > 0 && Math.abs(Number(r.ratio ?? 0)) >= 0.03).length;
  els.stats.innerHTML = [
    ['Bullish flow', bullish],
    ['Bearish flow', bearish],
    ['Strong outflow', strongOut],
    ['Strong inflow', strongIn],
  ].map(([label, value]) => `
    <div class="flow-stat">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join('');
}

function render() {
  const all = payload.rows ?? [];
  const list = rows();
  renderStats(all);

  if (!payload.configured) {
    els.config.style.display = '';
    els.config.innerHTML = `
      <strong>Chưa cấu hình CoinGlass API key.</strong>
      <p class="flow-note">Thêm <code>COINGLASS_API_KEY=...</code> hoặc <code>CG_API_KEY=...</code> vào .env rồi restart backend. Page này dùng CoinGlass spot netflow để xác định coin đang nạp lên sàn hay rút khỏi sàn.</p>
    `;
  } else {
    els.config.style.display = 'none';
  }

  els.status.textContent = `Updated ${fmtTime(payload.updatedAt)} · ${list.length}/${all.length} coins · ${payload.refreshing ? 'refreshing...' : 'ready'}${payload.error ? ` · ${payload.error}` : ''}`;

  if (!list.length) {
    els.body.innerHTML = `<tr><td colspan="11" class="table-empty">${payload.configured ? 'Không có coin phù hợp bộ lọc.' : 'Chưa có dữ liệu flow vì thiếu API key.'}</td></tr>`;
    return;
  }

  els.body.innerHTML = list.slice(0, 250).map((r) => {
    const net24 = Number(r.spot?.d1 ?? r.netflowUsd);
    const net4 = Number(r.spot?.h4);
    const net1 = Number(r.spot?.h1);
    const ratio = Number(r.ratio);
    const detailUrl = `/?symbol=${encodeURIComponent(r.symbolPair ?? `${r.symbol}USDT`)}`;
    return `
      <tr>
        <td><a href="${detailUrl}" target="_blank" rel="noopener"><strong>${esc(r.symbol)}</strong></a></td>
        <td class="${biasClass(r.bias)}">${esc(r.bias)}</td>
        <td><strong>${r.flowScore ?? '-'}</strong></td>
        <td>${fmtPrice(r.markPrice)}</td>
        <td class="${Number(r.change24h) >= 0 ? 'positive' : 'negative'}">${fmtPct(r.change24h)}</td>
        <td class="${net1 <= 0 ? 'positive' : 'negative'}">${fmtUsd(net1)}</td>
        <td class="${net4 <= 0 ? 'positive' : 'negative'}">${fmtUsd(net4)}</td>
        <td class="${net24 <= 0 ? 'positive' : 'negative'}">${fmtUsd(net24)}</td>
        <td class="${ratio <= 0 ? 'positive' : 'negative'}">${Number.isFinite(ratio) ? fmtPct(ratio * 100, 1) : '-'}</td>
        <td>${fmtUsd(r.quoteVolume)}</td>
        <td class="reason-cell">${esc((r.reasons ?? []).join(' · '))}</td>
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
    const res = await fetch('/api/coin-flow/refresh', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
    render();
  } catch (err) {
    els.status.textContent = `Refresh lỗi: ${err.message}`;
  } finally {
    els.refresh.disabled = false;
    els.refresh.textContent = 'Refresh flow';
  }
}

els.search.addEventListener('input', () => { filters.q = els.search.value; render(); });
els.bias.addEventListener('change', () => { filters.bias = els.bias.value; render(); });
els.sort.addEventListener('change', () => { filters.sort = els.sort.value; render(); });
els.refresh.addEventListener('click', refresh);

load().catch((err) => {
  els.status.textContent = `Không tải được coin flow: ${err.message}`;
});
setInterval(() => load().catch(() => {}), 60_000);
