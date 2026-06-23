const grid = document.getElementById('signalGrid');
const paperBody = document.getElementById('paperBody');
const searchInput = document.getElementById('searchInput');
const stageFilter = document.getElementById('stageFilter');
const scoreFilter = document.getElementById('scoreFilter');
let signals = [];

function price(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (number >= 1000) return number.toLocaleString('en', { maximumFractionDigits: 2 });
  if (number >= 1) return number.toFixed(4);
  if (number >= 0.01) return number.toFixed(5);
  return number.toFixed(7);
}

function signed(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${number >= 0 ? '+' : ''}${number.toFixed(2)}${suffix}`;
}

function time(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('vi-VN', { hour12: false });
}

function renderSignals() {
  const query = searchInput.value.trim().toUpperCase();
  const stage = stageFilter.value;
  const minScore = Number(scoreFilter.value);
  const rows = signals.filter((signal) =>
    (!query || signal.symbol.includes(query))
    && (stage === 'all' || signal.stage === stage)
    && Number(signal.score) >= minScore);
  if (!rows.length) {
    grid.innerHTML = '<div class="empty">Chua co TOP REVERSAL phu hop bo loc.</div>';
    return;
  }
  grid.innerHTML = rows.map((signal) => {
    const f = signal.factors ?? {};
    return `
      <article class="tr-card ${signal.confirmed ? 'confirmed' : ''}">
        <div class="tr-top">
          <div>
            <a class="tr-symbol" href="/?symbol=${encodeURIComponent(signal.symbol)}" target="_blank">${signal.symbol.replace(/USDT$/, '')}<small>USDT</small></a>
            <span class="tr-change">${signed(signal.change24h, '%')} 24h · ${price(signal.markPrice)}</span>
          </div>
          <div class="tr-right">
            <span class="tr-badge">${signal.stage === 'TOP_CONFIRMED' ? 'TOP REVERSAL CONFIRMED' : 'TOP WATCH'}</span>
            <div class="tr-score">${signal.score} <small>${signal.grade}</small></div>
          </div>
        </div>
        <div class="tr-reason">${signal.reason}</div>
        <div class="tr-plan">SHORT MARKET $5 · DCA +$10 khi ROE &lt;= -25% · trailing SL từ +15% ROE</div>
        <div class="tr-prices">
          <div class="tr-price"><span>Entry</span><strong>${price(signal.entry)}</strong></div>
          <div class="tr-price"><span>SL</span><strong style="color:#67e8f9">TRAIL +15%</strong></div>
          <div class="tr-price"><span>TP</span><strong style="color:#34d399">${price(signal.tp)}</strong></div>
          <div class="tr-price"><span>Runner TP</span><strong style="color:#34d399">${price(signal.runnerTp)}</strong></div>
        </div>
        <div class="tr-chips">
          <span class="tr-chip">Rise ${signed(f.risePct, '%')}</span>
          <span class="tr-chip">Drop ${signed(-Number(f.dropFromPeakPct || 0), '%')}</span>
          <span class="tr-chip">Peak ${f.peakAge15m} bars</span>
          <span class="tr-chip">Vol 5m ${Number(f.vol5mX || 0).toFixed(1)}x</span>
          <span class="tr-chip">Vol 15m ${Number(f.vol15mX || 0).toFixed(1)}x</span>
          <span class="tr-chip">Red ${f.redBars5m}/5</span>
          <span class="tr-chip">RSI ${f.rsi5m ?? '-'}/${f.rsi15m ?? '-'}</span>
          <span class="tr-chip">EMA break ${signed(f.emaBreakPct, '%')}</span>
        </div>
        <div class="muted" style="font-size:11px">${signal.note}</div>
      </article>`;
  }).join('');
}

function applySignalData(data) {
  signals = Array.isArray(data?.signals) ? data.signals : [];
  document.getElementById('confirmedCount').textContent = signals.filter((s) => s.stage === 'TOP_CONFIRMED').length;
  document.getElementById('watchCount').textContent = signals.filter((s) => s.stage === 'TOP_WATCH').length;
  document.getElementById('scannedCount').textContent = data?.processed ?? '-';
  document.getElementById('updatedAt').textContent = data?.scannedAt
    ? new Date(data.scannedAt).toLocaleTimeString('vi-VN', { hour12: false })
    : '-';
  document.getElementById('cachedCount').textContent = data?.processed ?? 0;
  document.getElementById('totalCount').textContent = data?.total ?? 0;
  document.getElementById('foundCount').textContent = signals.length;
  document.getElementById('scanStatus').textContent = data?.stale ? 'Cache cu' : 'Live 5m + 15m';
  renderSignals();
}

function renderPaper(data) {
  const rows = Array.isArray(data?.trades) ? data.trades : [];
  const summary = data?.summary ?? {};
  document.getElementById('paperSummary').textContent =
    `${summary.open ?? 0} open · ${summary.trailActive ?? 0} trailing · ${summary.closed ?? 0} closed · WR ${summary.winRate ?? 0}% · PnL ${signed(summary.pnl)}`;
  paperBody.innerHTML = rows.length ? rows.map((trade) => {
    const pnlClass = Number(trade.pnl) >= 0 ? 'tr-positive' : 'tr-negative';
    const dca = trade.dcaTaken
      ? `<span class="tr-dca">DCA +$${Number(trade.dcaMarginUsdt || 10).toFixed(0)} @ ${price(trade.dcaPrice)}<br>AVG ${price(trade.entryPrice)}</span>`
      : '<span class="tr-market">MARKET $5<br>DCA waiting</span>';
    const action = trade.status === 'CLOSED'
      ? `<button class="tr-btn del" data-delete="${trade.id}">Del</button>`
      : `<button class="tr-btn" data-close="${trade.id}">Close</button>`;
    return `<tr>
      <td>${dca}</td>
      <td><a href="/?symbol=${encodeURIComponent(trade.symbol)}" target="_blank" style="color:var(--text);font-weight:900">${trade.symbol}</a></td>
      <td>${price(trade.entryPrice)}</td><td>${price(trade.tp)}</td>
      <td>${trade.sl ? `${price(trade.sl)}<br><small>lock ${signed(trade.slTrailLockRoe, '%')} · peak ${signed(trade.peakRoe, '%')}</small>` : `<span class="muted">waiting +15%<br>peak ${signed(trade.peakRoe, '%')}</span>`}</td>
      <td>${price(trade.markPrice)}</td>
      <td>$${Number(trade.marginUsdt || 0).toFixed(0)} · ${trade.leverage}x</td>
      <td class="${pnlClass}">${signed(trade.pnl)}</td><td class="${pnlClass}">${signed(trade.roe, '%')}</td>
      <td>${trade.status}${trade.outcome ? ` · ${trade.outcome}` : ''}</td><td>${trade.score}</td>
      <td>${time(trade.createdAt)}</td><td>${action}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="13">Chua co paper trade Top Reversal.</td></tr>';
}

async function post(url, id) {
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
}

paperBody.addEventListener('click', async (event) => {
  const close = event.target.closest('[data-close]');
  const del = event.target.closest('[data-delete]');
  if (close) await post('/api/top-reversal-paper-trades/close', close.dataset.close);
  if (del) await post('/api/top-reversal-paper-trades/delete', del.dataset.delete);
});

for (const element of [searchInput, stageFilter, scoreFilter]) {
  element.addEventListener(element.tagName === 'INPUT' ? 'input' : 'change', renderSignals);
}

fetch('/api/top-reversal-signals').then((res) => res.json()).then(applySignalData).catch(() => {});
fetch('/api/top-reversal-paper-trades').then((res) => res.json()).then(renderPaper).catch(() => {});
const signalStream = new EventSource('/api/top-reversal-stream');
signalStream.onmessage = (event) => applySignalData(JSON.parse(event.data));
const paperStream = new EventSource('/api/top-reversal-paper-trades-stream');
paperStream.onmessage = (event) => renderPaper(JSON.parse(event.data));
