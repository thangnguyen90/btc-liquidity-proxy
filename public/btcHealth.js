// BTC Health Widget — nhúng vào bất kỳ trang nào bằng:
//   <div id="btcHealth"></div>
//   <script src="/btcHealth.js"></script>

(function () {
  const REFRESH_MS = 30_000; // 30s — khớp với server cache TTL, tránh burst requests

  // ── Live BTC price via mark price WebSocket ────────────────────────────────
  const BTC_WS_URLS = [
    'wss://fstream.binance.com/ws/btcusdt@markPrice@1s',
    'wss://fstream.binancefuture.com/ws/btcusdt@markPrice@1s',
  ];
  let _btcWsIdx = 0;
  let _lastBtcPrice = 0;
  let _btcWsStarted = false;

  function fmtBtcPrice(p) {
    if (!p || !isFinite(p)) return '–';
    return '$' + Number(p).toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function startBtcPriceWs() {
    if (_btcWsStarted) return;
    _btcWsStarted = true;
    connectBtcPriceWs();
  }

  function connectBtcPriceWs() {
    const ws = new WebSocket(BTC_WS_URLS[_btcWsIdx % BTC_WS_URLS.length]);
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.e !== 'markPriceUpdate') return;
        const p = Number(d.p);
        if (!isFinite(p) || p <= 0) return;
        const el = document.getElementById('btch-btc-price');
        if (!el) return;
        const dir = p > _lastBtcPrice ? 'up' : p < _lastBtcPrice ? 'dn' : '';
        _lastBtcPrice = p;
        el.textContent = fmtBtcPrice(p);
        if (dir === 'up') el.style.color = '#34d399';
        else if (dir === 'dn') el.style.color = '#f87171';
      } catch {}
    };
    ws.onclose = () => {
      _btcWsIdx++;
      setTimeout(connectBtcPriceWs, 3000);
    };
  }

  function colorFunding(v) {
    if (v > 0.08) return '#f87171';
    if (v > 0.04) return '#fbbf24';
    if (v < -0.02) return '#34d399';
    return '#94a3b8';
  }
  function colorRsi(v) {
    if (v >= 70) return '#f87171';
    if (v >= 60) return '#fbbf24';
    if (v <= 30) return '#f87171'; // oversold = dump đang diễn ra
    if (v <= 40) return '#fbbf24';
    return '#94a3b8';
  }
  function colorLong(v) {
    if (v >= 65) return '#f87171';
    if (v >= 60) return '#fbbf24';
    if (v <= 40) return '#34d399';
    return '#94a3b8';
  }
  function colorBias(b) {
    return b === 'bearish' ? '#f87171' : b === 'caution' ? '#fbbf24' : '#34d399';
  }
  function biasLabel(b) {
    return b === 'bearish' ? '⚠ Bearish' : b === 'caution' ? '⚡ Caution' : '✓ Neutral';
  }
  function bullBiasLabel(b) {
    return b === 'bullish' ? '🚀 Bullish' : b === 'caution' ? '⚡ Caution' : null;
  }
  function colorBullBias(b) {
    return b === 'bullish' ? '#34d399' : '#fbbf24';
  }
  function obvIcon(t) {
    return t === 'rising' ? '↑' : t === 'falling' ? '↓' : '→';
  }

  function render(d) {
    const el = document.getElementById('btcHealth');
    if (!el) return;
    if (d.error) {
      el.innerHTML = `<div class="btch-bar btch-err">BTC Health unavailable</div>`;
      return;
    }
    const age = d.updatedAt ? Math.floor((Date.now() - d.updatedAt) / 1000) : null;
    const isDangerLow  = (d.rsi1h != null && d.rsi1h < 25) || (d.rsi4h != null && d.rsi4h < 32); // short đáy nguy hiểm
    const isDangerHigh = (d.rsi1h != null && d.rsi1h > 80) || (d.rsi4h != null && d.rsi4h > 72); // long đỉnh nguy hiểm
    // Auto order status — mirrors server-side handlePumpAutoOrder checks
    const autoLongBlocked  = isDangerLow || isDangerHigh || d.bias === 'bearish' || d.bias === 'caution';
    const autoShortBlocked = isDangerLow || isDangerHigh || d.bullBias === 'bullish'; // caution không hard-block SHORT
    let autoChip;
    if (isDangerLow || isDangerHigh) {
      const reason = isDangerLow ? 'RSI oversold cực đoan' : 'RSI overbought cực đoan';
      autoChip = `<span class="btch-chip" style="background:rgba(251,113,133,.2);color:#f87171;border:1px solid rgba(251,113,133,.4);border-radius:4px;padding:2px 8px;font-weight:800">🚫 Auto OFF — ${reason}</span>`;
    } else if (autoLongBlocked && autoShortBlocked) {
      autoChip = `<span class="btch-chip" style="background:rgba(251,113,133,.12);color:#f87171;border:1px solid rgba(251,113,133,.3);border-radius:4px;padding:2px 8px;font-weight:700">⛔ Chặn LONG + SHORT tự động</span>`;
    } else if (autoLongBlocked) {
      autoChip = `<span class="btch-chip" style="background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.3);border-radius:4px;padding:2px 8px;font-weight:700">⛔ Chặn LONG tự động</span>`;
    } else if (autoShortBlocked) {
      autoChip = `<span class="btch-chip" style="background:rgba(251,191,36,.12);color:#fbbf24;border:1px solid rgba(251,191,36,.3);border-radius:4px;padding:2px 8px;font-weight:700">⛔ Chặn SHORT tự động</span>`;
    } else {
      autoChip = `<span class="btch-chip" style="color:#34d399;font-weight:600">✅ Auto ON</span>`;
    }
    const initPrice = d.price && isFinite(d.price) ? fmtBtcPrice(d.price) : '…';
    el.innerHTML = `
<div class="btch-bar">
  <span class="btch-label">BTC</span>
  <span id="btch-btc-price" style="font-weight:700;color:#94a3b8;font-size:13px;letter-spacing:.01em">${initPrice}</span>
  <span class="btch-sep">|</span>
  <span class="btch-chip" style="color:${colorBias(d.bias)};font-weight:700">${biasLabel(d.bias)}</span>
  ${d.bullBias && d.bullBias !== 'neutral' ? `<span class="btch-chip" style="color:${colorBullBias(d.bullBias)};font-weight:700">${bullBiasLabel(d.bullBias)}</span>` : ''}
  ${autoChip}
  <span class="btch-sep">|</span>
  <span class="btch-item">
    <span class="btch-key">Funding</span>
    <span style="color:${colorFunding(d.fundingRate)}">${d.fundingRate != null ? (d.fundingRate > 0 ? '+' : '') + d.fundingRate + '%' : '–'}</span>
  </span>
  <span class="btch-sep">|</span>
  <span class="btch-item">
    <span class="btch-key">L/S</span>
    <span style="color:${colorLong(d.longPct)}">${d.longPct != null ? d.longPct + '% long' : '–'}</span>
  </span>
  <span class="btch-sep">|</span>
  <span class="btch-item">
    <span class="btch-key">RSI 1h</span>
    <span style="color:${colorRsi(d.rsi1h)}">${d.rsi1h ?? '–'}</span>
  </span>
  <span class="btch-item">
    <span class="btch-key">4h</span>
    <span style="color:${colorRsi(d.rsi4h)}">${d.rsi4h ?? '–'}</span>
  </span>
  <span class="btch-item">
    <span class="btch-key">1D</span>
    <span style="color:${colorRsi(d.rsi1d)}">${d.rsi1d ?? '–'}</span>
  </span>
  <span class="btch-sep">|</span>
  <span class="btch-item">
    <span class="btch-key">EMA20 1h</span>
    <span style="color:${d.emaTrend1h === 'below' ? '#f87171' : d.emaTrend1h === 'above' ? '#34d399' : '#94a3b8'}">
      ${d.emaTrend1h === 'below' ? '↓ Below' : d.emaTrend1h === 'above' ? '↑ Above' : '–'}
    </span>
  </span>
  ${d.pct6h != null ? `<span class="btch-item"><span class="btch-key">6h</span><span style="color:${d.pct6h < -1.5 ? '#f87171' : d.pct6h > 1.5 ? '#34d399' : '#94a3b8'}">${d.pct6h > 0 ? '+' : ''}${d.pct6h}%</span></span>` : ''}
  <span class="btch-sep">|</span>
  <span class="btch-item">
    <span class="btch-key">OBV 4h</span>
    <span style="color:${d.obvTrend === 'falling' ? '#f87171' : d.obvTrend === 'rising' ? '#34d399' : '#94a3b8'}">${obvIcon(d.obvTrend)}</span>
  </span>
  ${d.btcCandle1hPct != null ? `<span class="btch-item"><span class="btch-key">1h▸</span><span style="color:${d.btcCandle1hPct < -0.5 ? '#f87171' : d.btcCandle1hPct > 0.5 ? '#34d399' : '#94a3b8'}">${d.btcCandle1hPct > 0 ? '+' : ''}${d.btcCandle1hPct}%</span></span>` : ''}
  ${d.btcSpikeAlert ? '<span class="btch-chip" style="background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700;color:#fbbf24">⚡ Spike — EMA_PB blocked</span>' : ''}
  ${d.btcCandle1hPct != null && d.btcCandle1hPct < -0.5 ? '<span class="btch-chip" style="background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.3);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700;color:#f87171">📉 Correction — EMA_PB blocked</span>' : ''}
  ${d.bearishDiv ? '<span class="btch-chip btch-div">RSI Div ⚠</span>' : ''}
  <span class="btch-age">${age != null ? age + 's ago' : ''}</span>
</div>`;
  }

  let _loading = false;
  async function load() {
    if (_loading) return; // skip if previous request still in-flight
    _loading = true;
    try {
      const r = await fetch('/api/btc-health');
      const d = await r.json();
      render(d);
    } catch {
      render({ error: true });
    } finally {
      _loading = false;
    }
  }

  function injectStyles() {
    if (document.getElementById('btch-style')) return;
    const s = document.createElement('style');
    s.id = 'btch-style';
    s.textContent = `
.btch-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 12px;
  margin-bottom: 12px;
}
.btch-label { font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .05em; font-size: 11px; }
.btch-sep { color: #1e293b; }
.btch-item { display: flex; align-items: center; gap: 4px; }
.btch-key { color: #64748b; }
.btch-chip { font-size: 12px; }
.btch-div { background: #451a03; color: #fbbf24; border-radius: 4px; padding: 1px 6px; }
.btch-age { margin-left: auto; color: #334155; font-size: 11px; }
.btch-err { color: #64748b; font-style: italic; }
`;
    document.head.appendChild(s);
  }

  function init() {
    injectStyles();
    load();
    setInterval(load, REFRESH_MS);
    startBtcPriceWs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
