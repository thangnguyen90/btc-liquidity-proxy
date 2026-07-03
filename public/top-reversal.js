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
    const isLong = signal.action === 'LONG' || signal.stage === 'FAIL_RECLAIM_LONG';
    const isNear = signal.stage === 'TOP_NEAR_MISS' || signal.nearMiss || signal.watchOnly;
    const isEarly = signal.stage === 'TOP_EARLY_CONFIRMED' || signal.earlyConfirmed;
    const qualityTier = String(signal.qualityTier ?? f.qualityTier ?? (signal.qualityBreakdown || f.qualityBreakdown ? 'QUALITY' : 'SCOUT_ONLY')).toUpperCase();
    const quality = qualityTier === 'QUALITY';
    const volume = qualityTier === 'VOLUME_DISTRIBUTION';
    const strongCase = Boolean(signal.strongCase ?? f.strongCase);
    const strongCaseType = String(signal.strongCaseType ?? f.strongCaseType ?? '');
    const strongCaseScore = Number(signal.strongCaseScore ?? f.strongCaseScore ?? 0);
    const canDca = !strongCase && (quality || volume);
    // Tín hiệu TỐT: short scout no-DCA (không near/long watch). XẤU: DCA/quality/strongCase.
    const goodSignal = !isLong && !isNear
      && !(strongCase || quality || volume || Boolean(signal.qualityDcaEligible ?? f.qualityDcaEligible) || Boolean(signal.qualityBreakdown ?? f.qualityBreakdown));
    const goodSignalStrong = goodSignal
      && (String(signal.stage ?? '') === 'TOP_CONFIRMED' || Number(signal.score ?? 0) >= 60);
    const strongLabel = strongCase
      ? `${strongCaseType === 'EARLY_PEAK_SIMILAR' ? 'EARLY PEAK SIMILAR' : 'STRONG PEAK SIMILAR'} ${strongCaseScore || ''}`.trim()
      : '';
    const qualityLabel = strongCase
      ? strongLabel
      : quality
      ? `QUALITY DCA $10 ${signal.hardBreakdownCount ?? f.hardBreakdownCount ?? 0}/3`
      : volume ? 'VOLUME DISTRIBUTION DCA $5'
      : isEarly ? 'EARLY CONFIRMED - SCOUT PAPER 1 USDT'
      : isNear ? 'NEAR MISS · WATCH ONLY'
      : isLong ? 'FAIL RECLAIM LONG' : 'SCOUT ONLY';
    const qualityReasons = Array.isArray(signal.qualityReasons)
      ? signal.qualityReasons.join(', ')
      : Array.isArray(f.qualityReasons) ? f.qualityReasons.join(', ') : '';
    const btcRel = signal.btcRelation;
    const btcAligned = btcRel?.relation === 'aligned';
    const btcChip = btcRel
      ? `<span class="tr-chip ${btcAligned ? 'quality' : 'scout'}">BTC ${btcAligned ? 'aligned' : 'mixed'} - corr ${btcRel.corr ?? '-'} - BTC ${signed(btcRel.btcMovePct, '%')}</span>`
      : '';
    return `
      <article class="tr-card ${signal.confirmed ? 'confirmed' : ''} ${strongCase ? 'strong-case' : ''} ${quality ? 'quality' : ''} ${volume ? 'volume' : ''} ${isEarly ? 'early' : ''} ${isNear && !isEarly ? 'near' : ''} ${isLong ? 'long' : ''}" style="${goodSignal ? 'box-shadow:inset 4px 0 0 #34d399;background:rgba(52,211,153,.06)' : ''}">
        <div class="tr-top">
          <div>
            <a class="tr-symbol" href="/?symbol=${encodeURIComponent(signal.symbol)}" target="_blank">${signal.symbol.replace(/USDT$/, '')}<small>USDT</small></a>
            <span class="tr-change">${signed(signal.change24h, '%')} 24h · ${price(signal.markPrice)}</span>
          </div>
          <div class="tr-right">
            <span class="tr-badge">${strongCase ? 'STRONG CASE' : isLong ? 'FAIL RECLAIM LONG' : isEarly ? 'EARLY CONFIRMED' : isNear ? 'NEAR MISS · WATCH ONLY' : signal.stage === 'TOP_CONFIRMED' ? 'TOP REVERSAL CONFIRMED' : 'TOP WATCH'}</span>
            ${goodSignal ? (goodSignalStrong
              ? '<span class="tr-chip quality" style="background:rgba(52,211,153,.2);color:#34d399;font-weight:800" title="TOP_CONFIRMED hoặc score>=60 — WR 82% / +686%">★★ TỐT MẠNH · $10</span>'
              : '<span class="tr-chip quality" style="background:rgba(134,239,172,.15);color:#86efac;font-weight:700" title="EARLY + score<60 — WR 67% / avgLoss -24%">★ TỐT YẾU · $5</span>') : ''}
            <div class="tr-score">${signal.score} <small>${signal.grade}</small></div>
          </div>
        </div>
        <div class="tr-reason">${signal.reason}</div>
        <div class="tr-plan">${isLong ? 'LONG WATCH: short fail + reclaim EMA13/25 + green volume' : strongCase ? 'STRONG CASE - paper $10 vao thang - DCA=NO - trailing tu +15% ROE' : isEarly ? 'EARLY CONFIRMED - drop 5-8% + EMA break + red bars + BTC not bullish - scout paper 1 USDT - DCA=NO' : isNear ? 'WATCH ONLY · chua vao paper · cho them xac nhan drop/EMA/volume' : `SHORT SCOUT $1 · ${canDca ? `DCA +$${volume ? 5 : 10} duoc phep khi ROE <= -25%` : 'DCA BI KHOA vi chua du quality'} · trailing SL tu +15% ROE`}</div>
        <div class="tr-prices">
          <div class="tr-price"><span>Entry</span><strong>${price(signal.entry)}</strong></div>
          <div class="tr-price"><span>SL</span><strong style="color:#67e8f9">${isLong ? price(signal.sl) : 'TRAIL +15%'}</strong></div>
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
          ${btcChip}
          <span class="tr-chip ${strongCase ? 'strong-case' : quality ? 'quality' : volume ? 'volume' : isEarly ? 'early' : 'scout'}">${qualityLabel}${qualityReasons ? ` · ${qualityReasons}` : ''}</span>
        </div>
        <div class="muted" style="font-size:11px">${signal.note}</div>
      </article>`;
  }).join('');
}

function applySignalData(data) {
  const passed = Array.isArray(data?.signals) ? data.signals : [];
  const nearMisses = Array.isArray(data?.nearMisses) ? data.nearMisses : [];
  signals = [...passed, ...nearMisses];
  document.getElementById('confirmedCount').textContent = signals.filter((s) => s.stage === 'TOP_CONFIRMED').length;
  document.getElementById('earlyCount').textContent = signals.filter((s) => s.stage === 'TOP_EARLY_CONFIRMED').length;
  document.getElementById('watchCount').textContent = signals.filter((s) => s.stage === 'TOP_WATCH').length;
  document.getElementById('nearCount').textContent = nearMisses.length;
  document.getElementById('scannedCount').textContent = data?.processed ?? '-';
  document.getElementById('updatedAt').textContent = data?.scannedAt
    ? new Date(data.scannedAt).toLocaleTimeString('vi-VN', { hour12: false })
    : '-';
  document.getElementById('cachedCount').textContent = data?.processed ?? 0;
  document.getElementById('totalCount').textContent = data?.total ?? 0;
  document.getElementById('foundCount').textContent = `${passed.length} + ${nearMisses.length} near`;
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
    const qualityTier = String(trade.qualityTier ?? (trade.qualityBreakdown ? 'QUALITY' : 'SCOUT_ONLY')).toUpperCase();
    const quality = qualityTier === 'QUALITY';
    const volume = qualityTier === 'VOLUME_DISTRIBUTION';
    const early = qualityTier === 'EARLY_CONFIRMED' || String(trade.stage ?? '').toUpperCase() === 'TOP_EARLY_CONFIRMED';
    const strongCase = Boolean(trade.strongCase);
    // Tín hiệu TỐT (backtest): no-DCA scout. XẤU: DCA/quality/strongCase (net âm).
    const good = trade.signalGood != null
      ? Boolean(trade.signalGood)
      : !(strongCase || quality || volume || Boolean(trade.qualityDcaEligible) || Boolean(trade.qualityBreakdown));
    // Phân tầng trong nhóm tốt: mạnh (TOP_CONFIRMED / score>=60) vs yếu (EARLY + score<60).
    const goodStrong = good && (trade.signalGoodStrong != null
      ? Boolean(trade.signalGoodStrong)
      : (String(trade.stage ?? '').toUpperCase() === 'TOP_CONFIRMED' || Number(trade.score ?? 0) >= 60));
    const btcShift = qualityTier === 'BTC_SHIFT' || String(trade.source ?? '').includes('btc-shift') || trade.btcShiftDcaTaken;
    const canDca = !strongCase && (quality || volume);
    const signalType = strongCase
      ? String(trade.strongCaseType ?? 'STRONG_PEAK_SIMILAR')
      : btcShift
      ? 'BTC SHIFT'
      : quality
      ? 'QUALITY DCA'
      : volume ? 'VOLUME DCA'
      : early ? 'EARLY SCOUT'
      : 'SCOUT ONLY';
    const pendingLimit = trade.status === 'PENDING' || String(trade.orderType ?? '').includes('LIMIT');
    const earlyBadges = early
      ? `<br><small class="${pendingLimit ? 'tr-positive' : 'tr-negative'}">${pendingLimit ? 'PENDING LIMIT TEST' : 'FAIL FAST'}</small><br><small class="tr-negative">NO DCA</small><br><small class="tr-negative">EARLY NO BREAKDOWN</small>`
      : '';
    const modeLabel = pendingLimit ? 'LIMIT' : early || strongCase || btcShift ? 'SCOUT' : 'TEST';
    const dca = trade.dcaTaken
      ? `<span class="tr-dca">DCA +$${Number(trade.dcaMarginUsdt || 10).toFixed(0)} @ ${price(trade.dcaPrice)}<br>AVG ${price(trade.entryPrice)}<br><small>${signalType}</small></span>`
      : trade.btcShiftDcaTaken
      ? `<span class="tr-dca">BTC SHIFT +$10<br>AVG ${price(trade.entryPrice)}<br><small>chart theo BTC</small></span>`
      : `<span class="tr-market">${modeLabel} $${Number(trade.marginUsdt || 1).toFixed(0)}<br>${canDca ? `DCA allowed $${volume ? 5 : 10}` : 'DCA blocked'}<br><small>${signalType}</small>${earlyBadges}</span>`;
    const action = trade.status === 'CLOSED' || trade.status === 'EXPIRED'
      ? `<button class="tr-btn del" data-delete="${trade.id}">Del</button>`
      : `<button class="tr-btn" data-close="${trade.id}">Close</button>`;
    const goodBadge = !good
      ? '<br><small class="muted" title="Loại tín hiệu net âm (DCA/quality/strongCase)">loại xấu · $1</small>'
      : goodStrong
      ? '<br><small class="tr-positive" style="font-weight:800" title="TOP_CONFIRMED hoặc score>=60 — WR 82% / net +686%">★★ TỐT MẠNH · $10 · SL-45%</small>'
      : '<br><small style="color:#86efac;font-weight:700" title="EARLY + score<60 — WR 67% / avgLoss -24%, low-conviction">★ TỐT YẾU · $5 · SL-45%</small>';
    return `<tr style="${good ? `background:rgba(52,211,153,${goodStrong ? '.12' : '.05'});box-shadow:inset 3px 0 0 ${goodStrong ? '#34d399' : '#86efac'}` : ''}">
      <td>${dca}</td>
      <td><a href="/?symbol=${encodeURIComponent(trade.symbol)}" target="_blank" style="color:${good ? (goodStrong ? '#34d399' : '#86efac') : 'var(--text)'};font-weight:900">${trade.symbol}</a>${goodBadge}</td>
      <td>${price(trade.entryPrice)}</td><td>${price(trade.tp)}</td>
      <td>${trade.sl ? `${price(trade.sl)}<br><small>lock ${signed(trade.slTrailLockRoe, '%')} · peak ${signed(trade.peakRoe, '%')}</small>` : `<span class="muted">waiting +15%<br>peak ${signed(trade.peakRoe, '%')}</span>`}</td>
      <td>${price(trade.markPrice)}</td>
      <td>$${Number(trade.marginUsdt || 0).toFixed(0)} · ${trade.leverage}x</td>
      <td class="${pnlClass}">${signed(trade.pnl)}</td><td class="${pnlClass}">${signed(trade.roe, '%')}</td>
      <td>${trade.status}${trade.outcome ? ` · ${trade.outcome}` : ''}<br><small class="${btcShift || canDca ? 'tr-positive' : 'tr-negative'}">${btcShift ? 'BTC SHIFT' : quality ? 'QUALITY DCA' : volume ? 'VOLUME DCA' : 'SCOUT ONLY'}</small></td><td>${trade.score}</td>
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
