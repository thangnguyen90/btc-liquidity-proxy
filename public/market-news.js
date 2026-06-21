const API_URL = '/api/market-news';

let newsPayload = { items: [], updatedAt: null, sources: [] };
let filters = { q: '', impact: 'ALL', bias: 'ALL' };

const els = {
  list: document.getElementById('newsList'),
  stats: document.getElementById('newsStats'),
  status: document.getElementById('newsStatus'),
  search: document.getElementById('newsSearch'),
  impact: document.getElementById('impactFilter'),
  bias: document.getElementById('biasFilter'),
  refresh: document.getElementById('refreshBtn'),
};

function fmtTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('vi-VN', { hour12: false });
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function impactClass(impact) {
  return String(impact ?? '').toLowerCase();
}

function filteredItems() {
  const q = filters.q.trim().toLowerCase();
  return [...(newsPayload.items ?? [])]
    .filter((item) => filters.impact === 'ALL' || item.impact === filters.impact)
    .filter((item) => filters.bias === 'ALL' || item.bias === filters.bias)
    .filter((item) => {
      if (!q) return true;
      const blob = `${item.title} ${item.description} ${item.assets?.join(' ')} ${item.categories?.join(' ')}`.toLowerCase();
      return blob.includes(q);
    })
    .sort((a, b) => {
      if ((b.impactScore ?? 0) !== (a.impactScore ?? 0)) return (b.impactScore ?? 0) - (a.impactScore ?? 0);
      return Date.parse(b.publishedAt ?? 0) - Date.parse(a.publishedAt ?? 0);
    });
}

function renderStats(items) {
  const critical = items.filter((x) => x.impact === 'CRITICAL').length;
  const high = items.filter((x) => x.impact === 'HIGH').length;
  const bearish = items.filter((x) => x.bias === 'BEARISH').length;
  const bullish = items.filter((x) => x.bias === 'BULLISH').length;
  els.stats.innerHTML = [
    ['Critical', critical],
    ['High', high],
    ['Bearish', bearish],
    ['Bullish', bullish],
  ].map(([label, value]) => `
    <div class="news-stat">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join('');
}

function render() {
  const items = filteredItems();
  renderStats(newsPayload.items ?? []);

  const srcOk = (newsPayload.sources ?? []).filter((s) => s.ok).length;
  const srcTotal = (newsPayload.sources ?? []).length;
  els.status.textContent = `Updated ${fmtTime(newsPayload.updatedAt)} · ${items.length}/${newsPayload.items?.length ?? 0} tin · sources ${srcOk}/${srcTotal}${newsPayload.refreshing ? ' · refreshing...' : ''}${newsPayload.error ? ` · ${newsPayload.error}` : ''}`;

  if (!items.length) {
    els.list.innerHTML = '<section class="panel"><p class="muted-line">Chưa có tin phù hợp bộ lọc.</p></section>';
    return;
  }

  els.list.innerHTML = items.map((item) => {
    const tags = [
      `<span class="news-tag ${impactClass(item.impact)}">${esc(item.impact)} · ${item.impactScore}</span>`,
      `<span class="news-tag ${String(item.bias).toLowerCase()}">${esc(item.bias)}</span>`,
      item.marketScope ? `<span class="news-tag">${esc(item.marketScope)}</span>` : '',
      ...(item.assets ?? []).slice(0, 5).map((a) => `<span class="news-tag">${esc(a)}</span>`),
      ...(item.categories ?? []).slice(0, 4).map((c) => `<span class="news-tag">${esc(c)}</span>`),
      ...(item.biasReason ?? []).slice(0, 4).map((r) => `<span class="news-tag">${esc(r)}</span>`),
    ].join('');
    const reasons = (item.reasons ?? []).length ? ` · key: ${(item.reasons ?? []).join(', ')}` : '';
    return `
      <article class="news-card ${impactClass(item.impact)}">
        <div class="news-head">
          <a class="news-title" href="${esc(item.link)}" target="_blank" rel="noopener">${esc(item.title)}</a>
          <div class="news-score">${item.impactScore ?? '-'}</div>
        </div>
        <div class="news-meta">${esc(item.source)} · ${fmtTime(item.publishedAt)} · age ${item.ageHours ?? '?'}h${esc(reasons)}</div>
        <div class="news-desc">${esc(item.description ?? '').slice(0, 260)}</div>
        <div class="news-tags">${tags}</div>
      </article>
    `;
  }).join('');
}

async function loadNews() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  newsPayload = await res.json();
  render();
}

async function refreshNews() {
  els.refresh.disabled = true;
  els.refresh.textContent = 'Refreshing...';
  try {
    const res = await fetch('/api/market-news/refresh', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    newsPayload = await res.json();
    render();
  } catch (err) {
    els.status.textContent = `Refresh lỗi: ${err.message}`;
  } finally {
    els.refresh.disabled = false;
    els.refresh.textContent = 'Refresh batch';
  }
}

els.search.addEventListener('input', () => { filters.q = els.search.value; render(); });
els.impact.addEventListener('change', () => { filters.impact = els.impact.value; render(); });
els.bias.addEventListener('change', () => { filters.bias = els.bias.value; render(); });
els.refresh.addEventListener('click', refreshNews);

loadNews().catch((err) => {
  els.status.textContent = `Không tải được news: ${err.message}`;
});
setInterval(() => loadNews().catch(() => {}), 60_000);
