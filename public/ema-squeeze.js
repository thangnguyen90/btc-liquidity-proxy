const SSE_URL = '/api/ema-squeeze-stream';
const API_URL = '/api/ema-squeeze-signals';

let allSignals = [];
let scannedAt  = null;
let total      = 0;
let activeStage = 'all';  // 'all' | 'BREAKOUT' | 'BREAKDOWN' | 'SQUEEZE' | 'SQUEEZE_SHORT'
let esPaperTrades = [];
let esPaperSort = { key: 'status', dir: 'asc' };

const grid          = document.getElementById('esGrid');
const breakoutCount = document.getElementById('breakoutCount');
const squeezeCount  = document.getElementById('squeezeCount');
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
const spreadFilter  = document.getElementById('spreadFilter');
const sortSelect    = document.getElementById('sortSelect');

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

function fmtPnl(pnl, roe) {
  if (pnl == null || isNaN(pnl)) return '-';
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}${Number(pnl).toFixed(3)} (${sign}${Number(roe ?? 0).toFixed(1)}%)`;
}

function timeAgo(ts) {
  if (!ts) return '-';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCard(sig) {
  const isShort       = sig.action === 'SHORT' || sig.stage === 'BREAKDOWN' || sig.stage === 'SQUEEZE_SHORT';
  const isBreakout    = sig.stage === 'BREAKOUT' || sig.stage === 'BREAKDOWN';
  const stageClass    = sig.stage === 'BREAKOUT'
    ? 'stage-breakout'
    : sig.stage === 'BREAKDOWN'
      ? 'stage-breakdown'
      : sig.stage === 'SQUEEZE_SHORT'
        ? 'stage-squeeze-short'
        : 'stage-squeeze';
  const stageBadgeCls = sig.stage.toLowerCase().replace('_', '-');
  const stageName     = sig.stage === 'BREAKOUT'
    ? '🟢 BREAKOUT'
    : sig.stage === 'BREAKDOWN'
      ? '🔴 BREAKDOWN'
      : sig.stage === 'SQUEEZE_SHORT'
        ? '🟥 SQUEEZE SHORT'
        : '🔶 SQUEEZE';
  const intervalName  = sig.interval ?? '15m';
  const changeColor   = (sig.change24h ?? 0) >= 0 ? 'var(--green)' : 'var(--red)';

  // Compression progress bar
  const squeezeRatio = sig.lbTotal > 0 ? Math.min(1, (sig.squeezeBars ?? 0) / sig.lbTotal) : 0;
  const tightRatio   = sig.squeezeBars > 0 ? Math.min(1, (sig.tightBars ?? 0) / sig.squeezeBars) : 0;
  const barClass     = tightRatio > 0.5 ? 'tight' : 'moderate';
  const spreadPctStr = sig.spreadPct != null ? (sig.spreadPct * 100).toFixed(1) : '?';
  const tightLabel   = sig.spreadPct < 0.03 ? '🔴 Rất chặt' : sig.spreadPct < 0.06 ? '🟡 Chặt vừa' : '⚪ Nhẹ';

  // Chips
  const chips = [];
  chips.push(`<span class="es-chip ok">${intervalName}</span>`);
  const rsi = sig.rsi;
  if (rsi != null) {
    const rsiCls = rsi > 75 ? 'warn' : rsi >= 50 ? 'ok' : 'warn';
    chips.push(`<span class="es-chip ${rsiCls}">RSI ${rsi}</span>`);
  }
  if (isBreakout && sig.volRatio != null) {
    const v = sig.breakoutVolRatio ?? sig.volRatio;
    const vCls = v >= 3 ? 'ok' : v >= 2 ? 'warn' : 'bad';
    chips.push(`<span class="es-chip ${vCls}">Break Vol ${Number(v).toFixed(1)}×</span>`);
  }
  if (sig.baseRangePct != null) {
    const b = Number(sig.baseRangePct) * 100;
    chips.push(`<span class="es-chip ${b <= 6 ? 'ok' : 'warn'}">Base ${b.toFixed(1)}%</span>`);
  }
  if (isBreakout && sig.pumpMovePct != null) {
    chips.push(`<span class="es-chip ok">${isShort ? 'Dump' : 'Pump'} ${Number(sig.pumpMovePct).toFixed(1)}%</span>`);
  }
  if (isBreakout && sig.breakoutAge != null) {
    const ageCls = sig.breakoutAge <= 1 ? 'ok' : sig.breakoutAge <= 3 ? 'warn' : 'bad';
    chips.push(`<span class="es-chip ${ageCls}">${isShort ? 'Down' : 'Break'} ${sig.breakoutAge === 0 ? 'nến này' : sig.breakoutAge + ' nến trước'}</span>`);
  }
  chips.push(`<span class="es-chip">Nén ${sig.squeezeBars ?? '?'}/${sig.lbTotal ?? '?'} nến</span>`);
  chips.push(`<span class="es-chip">Chặt ${sig.tightBars ?? '?'} nến</span>`);

  // EMA values
  const emaChip = [sig.ema13, sig.ema25, sig.ema99].every((v) => v != null)
    ? `<span class="es-chip" title="EMA13 / EMA25 / EMA99">${fmtPrice(sig.ema13)} · ${fmtPrice(sig.ema25)} · ${fmtPrice(sig.ema99)}</span>`
    : '';
  if (emaChip) chips.push(emaChip);
  const paperPayload = encodeURIComponent(JSON.stringify({
    symbol: sig.symbol,
    side: isShort ? 'SHORT' : 'LONG',
    status: isBreakout ? 'OPEN' : 'PENDING',
    marginUsdt: 1,
    leverage: 10,
    entryPrice: sig.entry,
    tp: sig.tp ?? null,
    sl: sig.sl ?? null,
    source: `emasq-${intervalName}-${String(sig.stage ?? '').toLowerCase()}-${sig.score}`,
    note: sig.note ?? sig.reason ?? '',
  }));

  return `
    <article class="es-card ${stageClass}">
      <div class="es-card-top">
        <div class="es-symbol-wrap">
          <a class="es-symbol" href="/?symbol=${sig.symbol}" target="_blank">
            ${sig.symbol.replace(/USDT$/, '')}<span class="sym-usdt">USDT</span>
          </a>
          <span class="es-change" style="color:${changeColor}">${fmtPct(sig.change24h)} 24h · ${fmtPrice(sig.markPrice)}</span>
        </div>
        <div class="es-right">
          <span class="es-stage-badge ${stageBadgeCls}">${stageName} · ${intervalName}</span>
          <div class="es-score-wrap">
            <span class="es-score-num">${sig.score}</span>
            <span class="es-grade grade-${sig.grade.toLowerCase()}">${sig.grade}</span>
          </div>
        </div>
      </div>

      <div class="es-compress-bar">
        <div class="es-compress-label">
          <span>EMA Compression · Spread ${spreadPctStr}% · ${tightLabel}</span>
          <span>${Math.round(squeezeRatio * 100)}%</span>
        </div>
        <div class="es-bar-track">
          <div class="es-bar-fill ${barClass}" style="width:${Math.round(squeezeRatio * 100)}%"></div>
        </div>
      </div>

      <div class="es-prices">
        <div class="es-price-cell">
          <span>${isBreakout ? 'Entry (now)' : (isShort ? 'Entry (break down)' : 'Entry (break)')}</span>
          <strong>${fmtPrice(sig.entry)}</strong>
        </div>
        <div class="es-price-cell">
          <span>SL</span>
          <strong style="color:${isShort ? 'var(--green)' : 'var(--red)'}">${fmtPrice(sig.sl)}</strong>
        </div>
        <div class="es-price-cell">
          <span>TP</span>
          <strong style="color:${isShort ? 'var(--red)' : 'var(--green)'}">${fmtPrice(sig.tp)}</strong>
        </div>
      </div>

      <div class="es-chips">${chips.join('')}</div>

      ${sig.reason ? `<div class="es-note">${sig.reason}</div>` : ''}
      ${sig.note    ? `<div class="es-note" style="opacity:.7">${sig.note}</div>` : ''}

      <div class="es-footer">
        <span>${timeAgo(sig.scannedAt)}</span>
        <button class="es-paper-btn ${isShort ? 'short' : 'long'}" onclick="createEmaSqueezePaper(this,'${paperPayload}')">+ Paper</button>
      </div>
    </article>
  `;
}

window.createEmaSqueezePaper = async function(btn, encodedPayload) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const payload = JSON.parse(decodeURIComponent(encodedPayload));
    const res = await fetch('/api/pump-paper-trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    btn.textContent = res.ok ? 'Added' : 'ERR';
    if (res.ok) await loadEsPaperTrades();
  } catch {
    btn.textContent = 'ERR';
  } finally {
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1800);
  }
};

// ── EMA Squeeze Paper Trades ─────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const th = e.target.closest('[data-es-sort]');
  if (!th || !th.classList.contains('es-paper-sort')) return;
  const key = th.dataset.esSort;
  if (esPaperSort.key === key) {
    esPaperSort.dir = esPaperSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    esPaperSort = { key, dir: key === 'status' ? 'asc' : 'desc' };
  }
  renderEsPaperTable();
});

function esPaperSortValue(t, key) {
  if (key === 'symbol') return t.symbol ?? '';
  if (key === 'side') return t.side ?? '';
  if (key === 'entry') return Number(t.entryPrice);
  if (key === 'sl') return t.sl == null ? null : Number(t.sl);
  if (key === 'tp') return t.tp == null ? null : Number(t.tp);
  if (key === 'mark') return Number(t.markPrice ?? t.exitPrice);
  if (key === 'pnl') return t.pnl == null ? null : Number(t.pnl);
  if (key === 'roe') return t.roe == null ? null : Number(t.roe);
  if (key === 'source') return t.source ?? '';
  if (key === 'time') return Date.parse(t.createdAt ?? '') || 0;
  if (key === 'status') {
    const order = { OPEN: 0, PENDING: 1, CLOSED: 2 };
    return order[t.status] ?? 9;
  }
  return '';
}

function compareEsValues(a, b, dir) {
  const aMiss = a == null || (typeof a === 'number' && isNaN(a));
  const bMiss = b == null || (typeof b === 'number' && isNaN(b));
  if (aMiss && bMiss) return 0;
  if (aMiss) return 1;
  if (bMiss) return -1;
  const r = typeof a === 'string' ? String(a).localeCompare(String(b), 'en') : a - b;
  return dir === 'asc' ? r : -r;
}

function sortEsPaperTrades(trades) {
  const { key, dir } = esPaperSort;
  return trades.slice().sort((a, b) => {
    const r = compareEsValues(esPaperSortValue(a, key), esPaperSortValue(b, key), dir);
    return r !== 0 ? r : compareEsValues(esPaperSortValue(a, 'time'), esPaperSortValue(b, 'time'), 'desc');
  });
}

function updateEsSortHeaders() {
  document.querySelectorAll('[data-es-sort]').forEach((th) => {
    const active = th.dataset.esSort === esPaperSort.key;
    th.classList.toggle('active', active);
    const mark = th.querySelector('.sort-mark');
    if (mark) mark.textContent = active ? (esPaperSort.dir === 'asc' ? '^' : 'v') : '';
  });
}

function getEsStage(t) {
  const source = String(t.source ?? '');
  if (source.includes('breakout')) return 'Breakout';
  if (source.includes('breakdown')) return 'Breakdown';
  if (source.includes('squeeze_short')) return 'Squeeze Short';
  if (source.includes('squeeze')) return 'Squeeze';
  return 'Other';
}

function getEsTimeframe(t) {
  const match = String(t.source ?? '').match(/^emasq-(\d+m)-/);
  return match ? match[1] : 'Mixed';
}

function calcEsStats(trades) {
  const list = trades ?? [];
  const closed = list.filter((t) => t.status === 'CLOSED');
  const wins = closed.filter((t) => Number(t.pnl ?? 0) > 0).length;
  const losses = closed.filter((t) => Number(t.pnl ?? 0) < 0).length;
  const breakeven = closed.length - wins - losses;
  const pnl = closed.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0);
  const avgPnl = closed.length ? pnl / closed.length : null;
  const avgRoe = closed.length
    ? closed.reduce((sum, t) => sum + Number(t.roe ?? 0), 0) / closed.length
    : null;

  return {
    total: list.length,
    open: list.filter((t) => t.status === 'OPEN').length,
    pending: list.filter((t) => t.status === 'PENDING').length,
    closed: closed.length,
    wins,
    losses,
    breakeven,
    winRate: closed.length ? (wins / closed.length) * 100 : null,
    pnl,
    avgPnl,
    avgRoe,
  };
}

function formatEsMoney(v) {
  if (v == null || isNaN(v)) return '-';
  const sign = Number(v) >= 0 ? '+' : '';
  return `${sign}${Number(v).toFixed(3)}`;
}

function formatEsBucket(name, stats) {
  const wr = stats.closed ? `${stats.winRate.toFixed(0)}%` : '-';
  return `
    <strong>${name}</strong>
    ${stats.wins}W/${stats.losses}L · WR ${wr}<br>
    Closed ${stats.closed}/${stats.total} · PnL ${formatEsMoney(stats.pnl)}
  `;
}

function groupEsTrades(trades, keyFn) {
  const map = new Map();
  for (const trade of trades) {
    const key = keyFn(trade);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(trade);
  }
  return Array.from(map.entries());
}

function updateEsPaperStats() {
  const stats = calcEsStats(esPaperTrades);
  const wr = stats.closed ? `${stats.winRate.toFixed(0)}%` : '-';
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('esStatWr', wr);
  setText('esStatWinLoss', `${stats.wins} win / ${stats.losses} loss${stats.breakeven ? ` / ${stats.breakeven} BE` : ''}`);
  setText('esStatPnl', formatEsMoney(stats.pnl));
  setText('esStatAvgPnl', `Avg/trade ${stats.avgPnl == null ? '-' : formatEsMoney(stats.avgPnl)}`);
  setText('esStatAvgRoe', stats.avgRoe == null ? '-' : `${stats.avgRoe >= 0 ? '+' : ''}${stats.avgRoe.toFixed(1)}%`);
  setText('esStatOpen', `${stats.open} open · ${stats.pending} pending · ${stats.closed} closed`);

  const buckets = [
    ...groupEsTrades(esPaperTrades, (t) => t.side ?? 'Other').map(([name, list]) => ({ name, stats: calcEsStats(list) })),
    ...groupEsTrades(esPaperTrades, getEsStage).map(([name, list]) => ({ name, stats: calcEsStats(list) })),
    ...groupEsTrades(esPaperTrades, getEsTimeframe).map(([name, list]) => ({ name, stats: calcEsStats(list) })),
  ].filter((b) => b.stats.closed > 0);

  const ranked = buckets.slice().sort((a, b) => b.stats.winRate - a.stats.winRate || b.stats.pnl - a.stats.pnl);
  const worst = ranked[ranked.length - 1];
  setText('esStatBest', ranked[0] ? `${ranked[0].name} ${ranked[0].stats.winRate.toFixed(0)}%` : '-');
  setText('esStatWorst', worst ? `Worst ${worst.name} ${worst.stats.winRate.toFixed(0)}%` : '-');

  const breakdown = document.getElementById('esPaperBreakdown');
  if (breakdown) {
    const sideRows = groupEsTrades(esPaperTrades, (t) => t.side ?? 'Other')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    const stageRows = groupEsTrades(esPaperTrades, getEsStage)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    const tfRows = groupEsTrades(esPaperTrades, getEsTimeframe)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => `<div class="es-paper-mini">${formatEsBucket(name, calcEsStats(list))}</div>`);
    breakdown.innerHTML = [...sideRows, ...stageRows, ...tfRows].join('');
  }
}

function renderEsPaperTable() {
  const tbody = document.getElementById('esPaperBody');
  if (!tbody) return;

  const open = esPaperTrades.filter((t) => t.status !== 'CLOSED');
  const closed = esPaperTrades.filter((t) => t.status === 'CLOSED');
  const tpHits = closed.filter((t) => t.outcome === 'TP').length;
  const slHits = closed.filter((t) => t.outcome === 'SL').length;
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const wr = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(0) : '-';
  const avgRoe = closed.length > 0
    ? (closed.reduce((s, t) => s + (t.roe ?? 0), 0) / closed.length).toFixed(1)
    : '-';

  const summary = document.getElementById('esPaperSummary');
  if (summary) {
    summary.textContent = `${open.length} open/pending | ${closed.length} closed | TP ${tpHits} | SL ${slHits} | WR ${wr}% | AvgROE ${avgRoe}%`;
  }
  updateEsPaperStats();

  if (esPaperTrades.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--muted);padding:16px">No EMA Squeeze paper trades yet</td></tr>';
    updateEsSortHeaders();
    return;
  }

  const sorted = sortEsPaperTrades([...open, ...closed]);
  tbody.innerHTML = sorted.map((t) => {
    const pnlVal = t.pnl ?? null;
    const roeVal = t.roe ?? null;
    const isShort = t.side === 'SHORT';
    const sideColor = isShort ? 'var(--red)' : 'var(--green)';
    const pnlColor = pnlVal == null ? '' : pnlVal >= 0 ? 'color:var(--green)' : 'color:var(--red)';
    const statusBadge = t.status === 'OPEN' ? '<span style="color:var(--green)">OPEN</span>'
      : t.status === 'PENDING' ? '<span style="color:var(--amber)">PENDING</span>'
      : `<span style="color:var(--muted)">${t.outcome ?? 'CLOSED'}</span>`;
    const canClose = t.status === 'OPEN' || t.status === 'PENDING';
    const actions = `
      ${canClose ? `<button class="es-paper-close-btn" onclick="closeEsPaperTrade('${t.id}')">Close</button>` : ''}
      <button class="es-paper-close-btn del" onclick="deleteEsPaperTrade('${t.id}')">Del</button>
    `;
    const symbol = String(t.symbol ?? '');
    return `<tr>
      <td><a class="es-symbol" href="/?symbol=${symbol}" target="_blank" rel="noopener">${symbol.replace(/USDT$/, '')}</a></td>
      <td><span style="color:${sideColor}">${t.side}</span></td>
      <td>${fmtPrice(t.entryPrice)}</td>
      <td>${fmtPrice(t.sl)}</td>
      <td>${fmtPrice(t.tp)}</td>
      <td>${fmtPrice(t.markPrice)}</td>
      <td style="${pnlColor}">${fmtPnl(pnlVal, roeVal)}</td>
      <td style="${pnlColor}">${roeVal != null ? fmtPct(roeVal) : '-'}</td>
      <td>${statusBadge}</td>
      <td style="color:var(--muted);font-size:11px">${t.source ?? '-'}</td>
      <td style="color:var(--muted);font-size:11px">${t.createdAt ? new Date(t.createdAt).toLocaleTimeString('vi') : '-'}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
  updateEsSortHeaders();
}

async function loadEsPaperTrades() {
  try {
    const res = await fetch('/api/pump-paper-trades', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    esPaperTrades = (data.trades ?? []).filter((t) => String(t.source ?? '').startsWith('emasq-'));
    renderEsPaperTable();
  } catch (e) {
    console.warn('[EmaSqueezePaper] load error:', e);
  }
}

window.closeEsPaperTrade = async function(id) {
  try {
    await fetch('/api/pump-paper-trades/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadEsPaperTrades();
  } catch (e) {
    console.error('[EmaSqueezePaper] close error:', e);
  }
};

window.deleteEsPaperTrade = async function(id) {
  try {
    await fetch('/api/pump-paper-trades/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadEsPaperTrades();
  } catch (e) {
    console.error('[EmaSqueezePaper] delete error:', e);
  }
};

// ── Render ────────────────────────────────────────────────────────────────────

function getFiltered() {
  const q         = searchInput.value.trim().toUpperCase();
  const minScore  = Number(scoreFilter.value ?? 0);
  const spread    = spreadFilter.value;
  const sort      = sortSelect.value;

  let list = allSignals.filter((s) => {
    if (activeStage !== 'all' && s.stage !== activeStage) return false;
    if (q && !s.symbol.includes(q)) return false;
    if (s.score < minScore) return false;
    if (spread === 'tight'    && (s.spreadPct ?? 1) >= 0.03) return false;
    if (spread === 'moderate' && (s.spreadPct ?? 1) >= 0.06) return false;
    return true;
  });

  if (sort === 'score') {
    list.sort((a, b) => b.score - a.score);
  } else if (sort === 'squeeze') {
    list.sort((a, b) => (b.squeezeBars ?? 0) - (a.squeezeBars ?? 0));
  } else if (sort === 'spread') {
    list.sort((a, b) => (a.spreadPct ?? 1) - (b.spreadPct ?? 1));
  }
  // default: BREAKOUT first, then SQUEEZE, within each sort by score (already sorted from server)

  return list;
}

function render() {
  const list = getFiltered();
  visibleCount.textContent = list.length;

  if (list.length === 0) {
    const stageMsg = activeStage === 'BREAKOUT'
      ? 'Không có coin nào vừa breakout'
      : activeStage === 'BREAKDOWN'
        ? 'Không có coin nào vừa breakdown'
      : activeStage === 'SQUEEZE'
        ? 'Không có coin nào đang nén EMA'
        : activeStage === 'SQUEEZE_SHORT'
          ? 'Không có coin nào đang nén để short'
        : 'Không có signal nào';
    grid.innerHTML = `<div class="es-empty"><strong>${stageMsg}</strong>Thử giảm filter hoặc đợi nến tiếp theo</div>`;
    return;
  }

  grid.innerHTML = list.map(buildCard).join('');
}

function applyData(data) {
  allSignals = data.signals ?? [];
  scannedAt  = data.scannedAt;
  total      = data.total ?? 0;

  const processed  = data.processed ?? 0;
  const cs         = data.cacheStats ?? {};
  const breakouts  = allSignals.filter((s) => s.stage === 'BREAKOUT');
  const breakdowns = allSignals.filter((s) => s.stage === 'BREAKDOWN');
  const squeezes   = allSignals.filter((s) => s.stage === 'SQUEEZE');
  const squeezeShorts = allSignals.filter((s) => s.stage === 'SQUEEZE_SHORT');
  const scores     = allSignals.map((s) => s.score);
  const avg        = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  breakoutCount.textContent = `${breakouts.length}/${breakdowns.length}`;
  squeezeCount.textContent  = `${squeezes.length}/${squeezeShorts.length}`;
  avgScore.textContent      = avg || '-';
  lastScan.textContent      = scannedAt ? new Date(scannedAt).toLocaleTimeString('vi') : '-';

  metaTotal.textContent     = processed > 0 ? `${processed}/${total}` : total;
  metaSignals.textContent   = allSignals.length;
  metaTime.textContent      = scannedAt ? new Date(scannedAt).toLocaleTimeString('vi') : '-';
  scanMeta.style.display    = 'flex';

  scanStatus.textContent = allSignals.length > 0
    ? `🟢 ${breakouts.length} Breakout · 🔴 ${breakdowns.length} Breakdown · 🔶 ${squeezes.length} Squeeze · 🟥 ${squeezeShorts.length} Short`
    : `● Quét xong · Không có signal`;
  scanStatus.style.color = allSignals.length > 0 ? 'var(--green)' : 'var(--muted)';

  render();
}

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.es-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.es-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeStage = btn.dataset.stage;
    render();
  });
});

// ── Controls ──────────────────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  searchClear.style.display = searchInput.value ? 'block' : 'none';
  render();
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  render();
});
scoreFilter.addEventListener('change',  render);
spreadFilter.addEventListener('change', render);
sortSelect.addEventListener('change',   render);

// ── SSE connection ────────────────────────────────────────────────────────────

function connect() {
  const es = new EventSource(SSE_URL);

  es.onopen = () => {
    scanStatus.textContent = '● Live';
    scanStatus.style.color = 'var(--green)';
    nextRefresh.textContent = 'Cập nhật mỗi nến 5m/15m/1h';
  };

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      // Không xoá signals hiện tại nếu scan mới trả về rỗng nhưng đã có data
      if ((data.signals ?? []).length === 0 && allSignals.length > 0) return;
      applyData(data);
    } catch {}
  };

  es.onerror = () => {
    scanStatus.textContent = 'Reconnecting...';
    scanStatus.style.color = 'var(--amber)';
    nextRefresh.textContent = '';
    es.close();
    setTimeout(connect, 4000);
  };
}

connect();

async function fetchAndApply() {
  try {
    scanStatus.textContent = 'Đang tải...';
    scanStatus.style.color = 'var(--muted)';
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    applyData(data);
  } catch {
    scanStatus.textContent = 'Lỗi tải data';
    scanStatus.style.color = 'var(--red)';
  }
}

fetchAndApply();
setInterval(fetchAndApply, 60_000);
loadEsPaperTrades();
setInterval(loadEsPaperTrades, 30_000);
