const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const lastScanEl = document.getElementById('lastScan');
const sourceTextEl = document.getElementById('sourceText');
const btcScoreEl = document.getElementById('btcScore');
const btcTypeEl = document.getElementById('btcType');
const ethScoreEl = document.getElementById('ethScore');
const ethTypeEl = document.getElementById('ethType');

function fmtUsd(value, digits = 0) {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(digits)}`;
}

function fmtPct(value, digits = 2) {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function fmtPrice(value) {
  if (!Number.isFinite(value)) return '-';
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (value >= 1) return value.toFixed(3);
  return value.toFixed(6);
}

function timeAgo(ts) {
  if (!ts) return '-';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

function cardClass(asset) {
  if (asset.type === 'ETF_BUY_PRESSURE') return 'buy';
  if (asset.type === 'ETF_SELL_PRESSURE') return 'sell';
  if (asset.type === 'ETF_MIXED_FLOW' || asset.type === 'ETF_FAKE_VOLUME') return 'mixed';
  return '';
}

function renderEtfRow(etf) {
  const pctCls = etf.pctChange >= 0 ? 'positive' : 'negative';
  const pressureCls = etf.pressure >= 0 ? 'positive' : 'negative';
  const netCls = etf.netDollarFlow >= 0 ? 'positive' : 'negative';
  return `
    <tr>
      <td>
        <strong>${etf.symbol}</strong>
        <div style="color:var(--muted);font-size:11px">${etf.name}</div>
      </td>
      <td class="${pctCls}">${fmtPct(etf.pctChange)}</td>
      <td>${fmtUsd(etf.dollarVolume)}</td>
      <td>${Number.isFinite(etf.relVolume) ? etf.relVolume.toFixed(2) + 'x' : '-'}</td>
      <td class="${netCls}">${fmtUsd(etf.netDollarFlow)}</td>
      <td class="${pressureCls}">${etf.pressure >= 0 ? '+' : ''}${etf.pressure.toFixed(2)}</td>
    </tr>
  `;
}

function renderCard(asset) {
  const scoreCls = asset.score >= 25 ? 'positive' : asset.score <= -25 ? 'negative' : '';
  const netCls = asset.netDollarFlow >= 0 ? 'positive' : 'negative';
  const breadthText = `${Math.round((asset.breadth ?? 0) * 100)}%`;
  const errors = asset.errors?.length
    ? `<div class="status" style="text-align:left;color:var(--amber)">Missing: ${asset.errors.slice(0, 3).join(' | ')}</div>`
    : '';

  return `
    <article class="etf-card ${cardClass(asset)}">
      <div class="etf-head">
        <div class="etf-asset">
          <strong>${asset.asset}</strong>
          <span class="status" style="text-align:left">${asset.binanceSymbol} spot ${fmtPrice(asset.mark)} (${fmtPct(asset.spotPctChange)})</span>
        </div>
        <span class="etf-badge">${asset.type}</span>
      </div>

      <div class="etf-metrics">
        <div class="etf-metric">
          <span>Pressure Score</span>
          <strong class="${scoreCls}">${asset.score >= 0 ? '+' : ''}${asset.score}</strong>
        </div>
        <div class="etf-metric">
          <span>Total Volume</span>
          <strong>${fmtUsd(asset.dollarVolume)}</strong>
        </div>
        <div class="etf-metric">
          <span>Rel Vol / Breadth</span>
          <strong>${asset.volumeX?.toFixed?.(2) ?? '-'}x / ${breadthText}</strong>
        </div>
        <div class="etf-metric">
          <span>Proxy Inflow</span>
          <strong class="positive">${fmtUsd(asset.buyDollarFlow)}</strong>
        </div>
        <div class="etf-metric">
          <span>Proxy Outflow</span>
          <strong class="negative">${fmtUsd(asset.sellDollarFlow)}</strong>
        </div>
        <div class="etf-metric">
          <span>Proxy Net Flow</span>
          <strong class="${netCls}">${fmtUsd(asset.netDollarFlow)} (${fmtPct(asset.netFlowPct)})</strong>
        </div>
      </div>

      <table class="etf-table">
        <thead>
          <tr>
            <th>ETF</th>
            <th>%</th>
            <th>$Vol</th>
            <th>Rel</th>
            <th>Net</th>
            <th>Pressure</th>
          </tr>
        </thead>
        <tbody>${(asset.etfs ?? []).slice(0, 8).map(renderEtfRow).join('')}</tbody>
      </table>
      ${errors}
      <div class="status" style="text-align:left">${asset.note}</div>
    </article>
  `;
}

function updateSummary(data) {
  const btc = data.assets?.find((x) => x.asset === 'BTC');
  const eth = data.assets?.find((x) => x.asset === 'ETH');
  if (btc) {
    btcScoreEl.textContent = `${btc.score >= 0 ? '+' : ''}${btc.score}`;
    btcScoreEl.className = btc.score >= 25 ? 'positive' : btc.score <= -25 ? 'negative' : '';
    btcTypeEl.textContent = btc.type;
  }
  if (eth) {
    ethScoreEl.textContent = `${eth.score >= 0 ? '+' : ''}${eth.score}`;
    ethScoreEl.className = eth.score >= 25 ? 'positive' : eth.score <= -25 ? 'negative' : '';
    ethTypeEl.textContent = eth.type;
  }
  lastScanEl.textContent = timeAgo(data.scannedAt);
  sourceTextEl.textContent = data.source || '-';
}

async function loadEtfProxy() {
  try {
    statusEl.textContent = 'Loading...';
    const res = await fetch('/api/etf-proxy');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    updateSummary(data);
    grid.innerHTML = (data.assets ?? []).map(renderCard).join('');
    statusEl.textContent = `Updated ${timeAgo(data.scannedAt)}`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    grid.innerHTML = `<article class="etf-card"><strong>ETF proxy load failed</strong><p class="status" style="text-align:left">${err.message}</p></article>`;
  }
}

loadEtfProxy();
setInterval(loadEtfProxy, 60_000);
