const state = { data: null };
const $ = (id) => document.getElementById(id);

function fmtPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(5);
  return n.toPrecision(5);
}

function fmtNum(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function fmtPct(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function cls(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return n > 0 ? 'limit-pos' : 'limit-neg';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function shortTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toISOString().slice(5, 16).replace('T', ' ');
}

function expireText(t) {
  if (t.status !== 'PENDING') return '-';
  const ms = Date.parse(t.expiresAt || '') - Date.now();
  if (!Number.isFinite(ms)) return '-';
  if (ms <= 0) return 'expired';
  const min = Math.ceil(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min}m`;
}

function filteredTrades() {
  const trades = state.data?.trades ?? [];
  const status = $('statusSelect').value;
  const side = $('sideSelect').value;
  const day = $('daySelect').value;
  return trades.filter((t) => {
    if (status === 'active' && !['PENDING', 'OPEN'].includes(t.status)) return false;
    if (!['active', 'all'].includes(status) && t.status !== status) return false;
    if (side !== 'all' && t.side !== side) return false;
    if (day !== 'all' && String(t.createdAt || '').slice(0, 10) !== day) return false;
    return true;
  });
}

function renderDays() {
  const select = $('daySelect');
  const current = select.value || 'all';
  const days = [...new Set((state.data?.trades ?? []).map((t) => String(t.createdAt || '').slice(0, 10)).filter(Boolean))].sort().reverse();
  select.innerHTML = ['<option value="all">All</option>'].concat(days.map((d) => `<option value="${d}">${d}</option>`)).join('');
  select.value = days.includes(current) ? current : 'all';
}

function renderStats() {
  const s = state.data?.summary ?? {};
  $('statNet').textContent = fmtNum(s.netPnl);
  $('statNet').className = cls(s.netPnl);
  $('statRealized').textContent = `realized ${fmtNum(s.realizedPnl)} · unreal ${fmtNum(s.unrealizedPnl)}`;
  $('statActive').textContent = `${(s.pending ?? 0) + (s.open ?? 0)}`;
  $('statPending').textContent = `${s.pending ?? 0} pending · ${s.open ?? 0} open`;
  $('statWr').textContent = `${Number(s.wr ?? 0).toFixed(1)}%`;
  $('statWl').textContent = `${s.wins ?? 0} win / ${s.losses ?? 0} loss`;
  $('statFilled').textContent = `${s.filled ?? 0}`;
  $('statExpired').textContent = `${s.expired ?? 0} expired · ${s.closed ?? 0} closed`;
}

function renderBtcTurnGateBanner() {
  let el = $('btcTurnGateBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'btcTurnGateBanner';
    const table = document.querySelector('table');
    table?.parentNode?.insertBefore(el, table);
  }
  const active = (state.data?.summary?.btcTurnGates ?? []).filter((g) => g?.blockMarket);
  if (!active.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = active.map((g) => {
    const cluster = g.cluster ?? {};
    return `
      <div style="margin:10px 0;padding:10px 12px;border:2px solid #ff4d6d;background:#3a0712;color:#ffb3c1;font-weight:900;font-size:18px;line-height:1.25">
        BTC TURN WARNING - CHẶN BR-like Limit ${escapeHtml(g.side)}: ${escapeHtml(g.label)}
        <div style="font-size:12px;color:#ffd6de;margin-top:4px;font-weight:700">
          open=${cluster.open ?? '-'} · pnl=${cluster.pnl ?? '-'} · losers=${cluster.losers ?? '-'} · fast=${cluster.fastLosers ?? '-'} · ${escapeHtml(g.reason ?? '')}
        </div>
      </div>
    `;
  }).join('');
}

function rowHtml(t) {
  const statusCls = String(t.status || '').toLowerCase();
  const note = String(t.note || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const canClose = t.status === 'OPEN';
  const canDelete = true;
  return `
    <tr>
      <td>${shortTime(t.createdAt)}</td>
      <td><strong>${t.symbol}</strong><br><span class="limit-muted">${t.interval ?? ''} ${t.brLikeScore ?? ''}</span></td>
      <td class="${t.side === 'LONG' ? 'limit-pos' : 'limit-neg'}">${t.side}</td>
      <td><span class="badge ${statusCls}">${t.status}${t.outcome ? ` · ${t.outcome}` : ''}</span></td>
      <td>${fmtPrice(t.entryPrice)}</td>
      <td>${fmtPrice(t.markPrice)}</td>
      <td>${fmtPrice(t.tp)}</td>
      <td>${fmtPrice(t.sl)}</td>
      <td class="${cls(t.pnl)}">${t.pnl == null ? '-' : fmtNum(t.pnl)}</td>
      <td class="${cls(t.roe)}">${t.roe == null ? '-' : fmtPct(t.roe)}</td>
      <td>${t.distancePct == null ? '-' : fmtPct(t.distancePct)}</td>
      <td>${expireText(t)}</td>
      <td>${note}</td>
      <td>
        ${canClose ? `<button class="action-btn" data-action="close" data-id="${t.id}" data-symbol="${t.symbol}">Close</button>` : ''}
        ${canDelete ? `<button class="action-btn danger" data-action="delete" data-id="${t.id}">Del</button>` : ''}
      </td>
    </tr>
  `;
}

function renderRows() {
  const rows = filteredTrades();
  $('rowsBody').innerHTML = rows.length
    ? rows.map(rowHtml).join('')
    : '<tr><td colspan="14" class="limit-muted">No BR-like limit paper trades yet</td></tr>';
}

function render() {
  renderDays();
  renderStats();
  renderBtcTurnGateBanner();
  renderRows();
}

async function load() {
  $('status').textContent = 'Loading...';
  const res = await fetch('/api/br-like-limit-paper-trades', { cache: 'no-store' });
  state.data = await res.json();
  $('status').textContent = `Rows ${state.data?.summary?.total ?? 0}`;
  render();
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

for (const id of ['statusSelect', 'sideSelect', 'daySelect']) $(id).addEventListener('change', renderRows);
$('reloadButton').addEventListener('click', load);
$('rowsBody').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  button.disabled = true;
  try {
    if (button.dataset.action === 'close') {
      await postJson('/api/br-like-limit-paper-trades/close', { id: button.dataset.id, symbol: button.dataset.symbol });
    } else {
      await postJson('/api/br-like-limit-paper-trades/delete', { id: button.dataset.id });
    }
    await load();
  } catch (err) {
    $('status').textContent = err.message;
    button.disabled = false;
  }
});

load().catch((err) => { $('status').textContent = err.message; });
setInterval(load, 10_000);
