// BTC Health Widget — nhúng vào bất kỳ trang nào bằng:
//   <div id="btcHealth"></div>
//   <script src="/btcHealth.js"></script>

(function () {
  const REFRESH_MS = 60_000;

  function colorFunding(v) {
    if (v > 0.08) return '#f87171';
    if (v > 0.04) return '#fbbf24';
    if (v < -0.02) return '#34d399';
    return '#94a3b8';
  }
  function colorRsi(v) {
    if (v >= 70) return '#f87171';
    if (v >= 60) return '#fbbf24';
    if (v <= 30) return '#34d399';
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
    el.innerHTML = `
<div class="btch-bar">
  <span class="btch-label">BTC Health</span>
  <span class="btch-chip" style="color:${colorBias(d.bias)};font-weight:700">${biasLabel(d.bias)}</span>
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
    <span class="btch-key">RSI 4h</span>
    <span style="color:${colorRsi(d.rsi4h)}">${d.rsi4h ?? '–'}</span>
  </span>
  <span class="btch-item">
    <span class="btch-key">1D</span>
    <span style="color:${colorRsi(d.rsi1d)}">${d.rsi1d ?? '–'}</span>
  </span>
  <span class="btch-sep">|</span>
  <span class="btch-item">
    <span class="btch-key">OBV 4h</span>
    <span style="color:${d.obvTrend === 'falling' ? '#f87171' : d.obvTrend === 'rising' ? '#34d399' : '#94a3b8'}">${obvIcon(d.obvTrend)}</span>
  </span>
  ${d.bearishDiv ? '<span class="btch-chip btch-div">RSI Div ⚠</span>' : ''}
  <span class="btch-age">${age != null ? age + 's ago' : ''}</span>
</div>`;
  }

  async function load() {
    try {
      const r = await fetch('/api/btc-health');
      const d = await r.json();
      render(d);
    } catch {
      render({ error: true });
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
