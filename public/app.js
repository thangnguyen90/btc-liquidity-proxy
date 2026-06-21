// ── Global error handler — hiển thị lỗi JS trong status bar thay vì trang trắng ──
window.addEventListener('error', (e) => {
  const el = document.getElementById('status');
  if (el) el.textContent = `JS Error: ${e.message} (${e.filename?.split('/').pop() ?? '?'}:${e.lineno})`;
  console.error('[app] uncaught error:', e.message, e);
});
window.addEventListener('unhandledrejection', (e) => {
  const el = document.getElementById('status');
  if (el) el.textContent = `JS Error: ${e.reason?.message ?? String(e.reason)}`;
  console.error('[app] unhandled rejection:', e.reason);
});

const elements = {
  symbolInput: document.querySelector('#symbolInput'),
  symbolClear: document.querySelector('#symbolClear'),
  symbolsList: document.querySelector('#symbolsList'),
  intervalInput: document.querySelector('#intervalInput'),
  rangeInput: document.querySelector('#rangeInput'),
  binSizeInput: document.querySelector('#binSizeInput'),
  refreshButton: document.querySelector('#refreshButton'),
  autoRefreshInput: document.querySelector('#autoRefreshInput'),
  quickOrderTypeInput: document.querySelector('#quickOrderTypeInput'),
  quickMarginInput: document.querySelector('#quickMarginInput'),
  quickLeverageInput: document.querySelector('#quickLeverageInput'),
  quickLimitPriceInput: document.querySelector('#quickLimitPriceInput'),
  quickDryRunInput: document.querySelector('#quickDryRunInput'),
  quickLongButton: document.querySelector('#quickLongButton'),
  quickShortButton: document.querySelector('#quickShortButton'),
  quickOrderResult: document.querySelector('#quickOrderResult'),
  status: document.querySelector('#status'),
  signalValue: document.querySelector('#signalValue'),
  signalScore: document.querySelector('#signalScore'),
  setupDirection: document.querySelector('#setupDirection'),
  setupConfidence: document.querySelector('#setupConfidence'),
  setupEntry: document.querySelector('#setupEntry'),
  setupTrigger: document.querySelector('#setupTrigger'),
  setupStop: document.querySelector('#setupStop'),
  setupTargets: document.querySelector('#setupTargets'),
  setupExplain: document.querySelector('#setupExplain'),
  orderNotionalInput: document.querySelector('#orderNotionalInput'),
  orderLeverageInput: document.querySelector('#orderLeverageInput'),
  orderDryRunInput: document.querySelector('#orderDryRunInput'),
  placeOrderButton: document.querySelector('#placeOrderButton'),
  orderResult: document.querySelector('#orderResult'),
  markPrice: document.querySelector('#markPrice'),
  indexPrice: document.querySelector('#indexPrice'),
  momentum: document.querySelector('#momentum'),
  atr: document.querySelector('#atr'),
  funding: document.querySelector('#funding'),
  openInterest: document.querySelector('#openInterest'),
  updatedAt: document.querySelector('#updatedAt'),
  takerBuy: document.querySelector('#takerBuy'),
  longShort: document.querySelector('#longShort'),
  liquidityBias: document.querySelector('#liquidityBias'),
  bookImbalance: document.querySelector('#bookImbalance'),
  marketExplain: document.querySelector('#marketExplain'),
  liquidTotalsBox: document.querySelector('#liquidTotalsBox'),
  liquidTotalsBias: document.querySelector('#liquidTotalsBias'),
  liquidAboveTotal: document.querySelector('#liquidAboveTotal'),
  liquidAboveShare: document.querySelector('#liquidAboveShare'),
  liquidBelowTotal: document.querySelector('#liquidBelowTotal'),
  liquidBelowShare: document.querySelector('#liquidBelowShare'),
  liquidTotalsRatio: document.querySelector('#liquidTotalsRatio'),
  liquidTotalsHint: document.querySelector('#liquidTotalsHint'),
  liquidMaxAbovePrice: document.querySelector('#liquidMaxAbovePrice'),
  liquidMaxAboveMeta: document.querySelector('#liquidMaxAboveMeta'),
  liquidMaxBelowPrice: document.querySelector('#liquidMaxBelowPrice'),
  liquidMaxBelowMeta: document.querySelector('#liquidMaxBelowMeta'),
  tokenUnlockBox: document.querySelector('#tokenUnlockBox'),
  tokenUnlockRisk: document.querySelector('#tokenUnlockRisk'),
  tokenUnlockDate: document.querySelector('#tokenUnlockDate'),
  tokenUnlockDays: document.querySelector('#tokenUnlockDays'),
  tokenUnlockAmount: document.querySelector('#tokenUnlockAmount'),
  tokenUnlockAllocation: document.querySelector('#tokenUnlockAllocation'),
  tokenUnlockValue: document.querySelector('#tokenUnlockValue'),
  tokenUnlockPercent: document.querySelector('#tokenUnlockPercent'),
  tokenUnlock30dValue: document.querySelector('#tokenUnlock30dValue'),
  tokenUnlock30dMeta: document.querySelector('#tokenUnlock30dMeta'),
  killZoneBox: document.querySelector('#killZoneBox'),
  mainKillZoneItem: document.querySelector('#mainKillZoneItem'),
  mainKillZoneRange: document.querySelector('#mainKillZoneRange'),
  mainKillZoneMeta: document.querySelector('#mainKillZoneMeta'),
  exhaustionZoneItem: document.querySelector('#exhaustionZoneItem'),
  exhaustionZoneRange: document.querySelector('#exhaustionZoneRange'),
  exhaustionZoneMeta: document.querySelector('#exhaustionZoneMeta'),
  farKillZoneItem: document.querySelector('#farKillZoneItem'),
  farKillZoneRange: document.querySelector('#farKillZoneRange'),
  farKillZoneMeta: document.querySelector('#farKillZoneMeta'),
  farKillZonePeaks: document.querySelector('#farKillZonePeaks'),
  killLogicBox: document.querySelector('#killLogicBox'),
  killLogicLabel: document.querySelector('#killLogicLabel'),
  killLogicTitle: document.querySelector('#killLogicTitle'),
  killLogicBody: document.querySelector('#killLogicBody'),
  bidNotional: document.querySelector('#bidNotional'),
  askNotional: document.querySelector('#askNotional'),
  bidBar: document.querySelector('#bidBar'),
  askBar: document.querySelector('#askBar'),
  bookExplain: document.querySelector('#bookExplain'),
  liqHeatmap: document.querySelector('#liqHeatmap'),
  liqHeatmapMeta: document.querySelector('#liqHeatmapMeta'),
  emaRow: document.querySelector('#emaRow'),
  emaCurrentLabel: document.querySelector('#emaCurrentLabel'),
  emaCurrentValue: document.querySelector('#emaCurrentValue'),
  emaCurrentDist: document.querySelector('#emaCurrentDist'),
  ema1hValue: document.querySelector('#ema1hValue'),
  ema1hDist: document.querySelector('#ema1hDist'),
  ema4hValue: document.querySelector('#ema4hValue'),
  ema4hDist: document.querySelector('#ema4hDist'),
  lsRatioChart: document.querySelector('#lsRatioChart'),
  lsRatioMeta: document.querySelector('#lsRatioMeta'),
  lsRatioExplain: document.querySelector('#lsRatioExplain'),
  tradeContext: document.querySelector('#tradeContext'),
  coinglassLink: document.querySelector('#coinglassLink'),
  binanceLink: document.querySelector('#binanceLink'),
  quickScanBadge: document.querySelector('#quickScanBadge'),
  volDumpBadge: document.querySelector('#volDumpBadge'),
};

let autoRefreshTimer = null;
let latestAnalysis = null;
let _analysisLoading = false;
let priceWsSymbol = null;
let priceWs = null;
const initialSymbol = new URLSearchParams(window.location.search).get('symbol')
  || localStorage.getItem('lastSymbol');

if (initialSymbol) {
  elements.symbolInput.value = normalizeSymbol(initialSymbol);
  elements.symbolClear.style.display = '';
}

elements.refreshButton.addEventListener('click', () => {
  loadAnalysis();
});

elements.symbolInput.addEventListener('input', () => {
  elements.symbolClear.style.display = elements.symbolInput.value ? '' : 'none';
});

elements.symbolInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    loadAnalysis();
  }
});

elements.symbolClear.addEventListener('click', () => {
  elements.symbolInput.value = '';
  elements.symbolClear.style.display = 'none';
  elements.symbolInput.focus();
});

elements.autoRefreshInput.addEventListener('change', () => {
  if (elements.autoRefreshInput.checked) {
    autoRefreshTimer = setInterval(loadAnalysis, 15000);
  } else if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
});

elements.placeOrderButton.addEventListener('click', () => {
  placeSetupOrder();
});

elements.quickOrderTypeInput.addEventListener('change', () => {
  elements.quickLimitPriceInput.disabled = elements.quickOrderTypeInput.value !== 'LIMIT';
});

elements.quickLongButton.addEventListener('click', () => {
  placeQuickOrder('BUY');
});

elements.quickShortButton.addEventListener('click', () => {
  placeQuickOrder('SELL');
});

await loadSymbols();
await loadAnalysis();

async function loadSymbols() {
  try {
    const response = await fetch('/api/symbols');
    const symbols = await response.json();

    elements.symbolsList.innerHTML = symbols
      .map((item) => `<option value="${escapeHtml(item.symbol)}">${escapeHtml(item.baseAsset)}</option>`)
      .join('');
  } catch (error) {
    elements.status.textContent = `Symbol list failed: ${messageFor(error)}`;
  }
}

async function loadAnalysis() {
  if (_analysisLoading) return; // bỏ qua nếu request trước chưa xong
  _analysisLoading = true;
  const symbol = normalizeSymbol(elements.symbolInput.value);
  const coin = symbol.replace(/USDT$/, '');
  elements.coinglassLink.href = `https://www.coinglass.com/pro/futures/LiquidationHeatMapNew?coin=${coin}`;
  elements.binanceLink.href = `https://www.binance.com/vi/futures/${symbol}`;
  const params = new URLSearchParams({
    symbol,
    interval: elements.intervalInput.value,
    rangePct: elements.rangeInput.value,
    binSizePct: elements.binSizeInput.value,
  });

  setLoading(true);
  document.getElementById('rg-reset-hint')?.remove();

  try {
    const ctrl = new AbortController();
    const clientTimeout = setTimeout(() => ctrl.abort(new Error('Client timeout 25s')), 25_000);
    let response;
    try {
      response = await fetch(`/api/analyze?${params.toString()}`, { signal: ctrl.signal });
    } finally {
      clearTimeout(clientTimeout);
    }
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? 'Analyze failed');
    }

    elements.symbolInput.value = payload.symbol;
    localStorage.setItem('lastSymbol', payload.symbol);
    render(payload);
    elements.status.textContent = 'Updated';
    connectPriceSocket(payload.symbol);
    loadLsRatioChart(payload.symbol);
  } catch (error) {
    const msg = error?.name === 'AbortError' ? 'Timeout — server không phản hồi, thử lại sau' : messageFor(error);
    elements.status.textContent = msg;
    if (msg.includes('blocked') || msg.includes('skip REST') || msg.includes('rate-limit')) {
      showRateGateResetHint();
    }
  } finally {
    _analysisLoading = false;
    setLoading(false);
  }
}

function showRateGateResetHint() {
  if (document.getElementById('rg-reset-hint')) return;
  const div = document.createElement('div');
  div.id = 'rg-reset-hint';
  div.style.cssText = 'margin:6px 0;padding:5px 10px;background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);border-radius:6px;font-size:12px;color:var(--text-secondary,#ccc);';
  div.innerHTML = '⚠ Server đang block IP cũ. Nếu đã đổi IP: <button id="rg-reset-btn" style="margin-left:6px;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Reset Gate</button>';
  elements.status.insertAdjacentElement('afterend', div);
  document.getElementById('rg-reset-btn').addEventListener('click', async () => {
    document.getElementById('rg-reset-btn').textContent = 'Đang reset...';
    try {
      await fetch('/api/rate-gate/reset', { method: 'POST' });
      div.remove();
      loadAnalysis();
    } catch {
      document.getElementById('rg-reset-btn').textContent = 'Lỗi, thử lại';
    }
  });
}

function render(data) {
  latestAnalysis = data;
  const coin = data.symbol.replace(/USDT$/, '');
  const signalClass = data.signal.label === 'kill_short_zone' ? 'neutral' : classFor(data.signal.score);
  const priceDigits = priceDigitsFor(data.price.mark);

  elements.signalValue.textContent = labelForSignal(data.signal.label);
  elements.signalValue.className = signalClass;
  elements.signalScore.textContent = `Score ${formatNumber(data.signal.score, 4)}`;
  const qd = data.quickScan.direction;
  const qdClass = qd === 'long' ? 'positive' : qd === 'short' ? 'negative' : 'neutral';
  elements.quickScanBadge.innerHTML = `Scan: <span class="${qdClass}">${qd.toUpperCase()}</span> ${formatNumber(data.quickScan.score, 3)}`;
  const vd = data.volDump;
  if (vd?.triggered) {
    elements.volDumpBadge.style.display = '';
    elements.volDumpBadge.title = `${vd.highVolCount}/5 nến vol cao | nến cuối ${vd.dumpCandlePct.toFixed(2)}% | 4 nến ${vd.move4cPct.toFixed(2)}%`;
  } else {
    elements.volDumpBadge.style.display = 'none';
  }
  elements.markPrice.textContent = formatPrice(data.price.mark, priceDigits);
  elements.indexPrice.textContent = `Index ${formatPrice(data.price.index, priceDigits)}`;
  elements.momentum.textContent = `${formatNumber(data.market.momentumPct, 3)}%`;
  elements.momentum.className = classFor(data.market.momentumPct);
  const alignIcon = data.market.trendAligned ? '↑↑' : '↕';
  const alignClass = data.market.trendAligned ? 'positive' : 'negative';
  elements.atr.innerHTML = `ATR ${formatNumber(data.market.atrPct, 3)}% &nbsp;<span class="${alignClass}" title="48h momentum">${alignIcon} 48h: ${formatNumber(data.market.momentumPct48h, 2)}%</span>`;
  elements.funding.textContent = `${formatNumber(data.market.fundingRatePct, 4)}%`;
  elements.openInterest.textContent = `OI ${formatCompact(data.market.openInterest)}`;
  elements.updatedAt.textContent = formatDate(data.generatedAt);
  elements.takerBuy.textContent = `${formatNumber(data.market.takerBuyRatio * 100, 2)}%`;
  elements.longShort.textContent = data.market.longShortRatio
    ? `${formatNumber(data.market.longShortRatio.longShortRatio, 3)} (${formatNumber(data.market.longShortRatio.longAccount * 100, 1)}% long)`
    : '-';
  elements.liquidityBias.textContent = formatNumber(data.liquidationProxy.bias, 4);
  elements.liquidityBias.className = classFor(data.liquidationProxy.bias);
  renderLiquidTotalsBox(data.liquidationProxy, priceDigits);
  renderTokenUnlockBox(data.tokenUnlock);
  elements.bookImbalance.textContent = formatNumber(data.orderBook.imbalance, 4);
  elements.bookImbalance.className = classFor(data.orderBook.imbalance);

  const st = data.liquidationProxy.sweepTarget;
  const sweepBox = document.getElementById('sweepTargetBox');
  const sweepLabel = document.getElementById('sweepTargetLabel');
  const sweepPrice = document.getElementById('sweepTargetPrice');
  const sweepDist = document.getElementById('sweepTargetDist');
  if (st) {
    const isAbove = st.direction === 'above';
    const kz = data.liquidationProxy.killZoneCluster?.mainKillZone;
    const fk = data.liquidationProxy.killZoneCluster?.farKillZone;
    sweepLabel.textContent = isAbove ? '🚀 Kéo lên quét short tại' : '💥 Kéo xuống quét long tại';
    sweepPrice.textContent = formatPrice(st.price, priceDigits);
    sweepPrice.className = isAbove ? 'positive' : 'negative';
    sweepDist.textContent = kz
      ? `${st.distancePct > 0 ? '+' : ''}${formatNumber(st.distancePct, 2)}% away · kill zone ${formatPrice(kz.low, priceDigits)} - ${formatPrice(kz.high, priceDigits)}`
      : fk
        ? `${st.distancePct > 0 ? '+' : ''}${formatNumber(st.distancePct, 2)}% away · far kill ${formatPrice(fk.low, priceDigits)} - ${formatPrice(fk.high, priceDigits)}`
      : `${st.distancePct > 0 ? '+' : ''}${formatNumber(st.distancePct, 2)}% away`;
    sweepBox.style.display = 'block';
  } else {
    sweepBox.style.display = 'none';
  }
  renderKillZoneBox(data.liquidationProxy.killZoneCluster, priceDigits);
  renderKillLogicBox(data, priceDigits);
  const ema = data.ema99;
  if (ema && (ema.current || ema.h1 || ema.h4)) {
    elements.emaRow.style.display = '';
    if (ema.current) {
      elements.emaCurrentLabel.textContent = `EMA99 ${ema.current.label}`;
      elements.emaCurrentValue.textContent = formatPrice(ema.current.value, priceDigits);
      elements.emaCurrentDist.textContent = `${ema.current.distPct > 0 ? '+' : ''}${formatNumber(ema.current.distPct, 2)}%`;
      elements.emaCurrentDist.className = classFor(ema.current.distPct);
    }
    if (ema.h1) {
      elements.ema1hValue.textContent = formatPrice(ema.h1.value, priceDigits);
      elements.ema1hDist.textContent = `${ema.h1.distPct > 0 ? '+' : ''}${formatNumber(ema.h1.distPct, 2)}%`;
      elements.ema1hDist.className = classFor(ema.h1.distPct);
    }
    if (ema.h4) {
      elements.ema4hValue.textContent = formatPrice(ema.h4.value, priceDigits);
      elements.ema4hDist.textContent = `${ema.h4.distPct > 0 ? '+' : ''}${formatNumber(ema.h4.distPct, 2)}%`;
      elements.ema4hDist.className = classFor(ema.h4.distPct);
    }
  } else {
    elements.emaRow.style.display = 'none';
  }

  elements.bidNotional.textContent = formatCurrency(data.orderBook.bidNotional);
  elements.askNotional.textContent = formatCurrency(data.orderBook.askNotional);

  renderTradeSetup(data.tradeSetup, coin, priceDigits);
  renderBookBars(data.orderBook);
  renderHeatmap(data.liquidationProxy, data.price.mark, priceDigits);

  elements.marketExplain.textContent = marketExplanation(data, coin, priceDigits);
  elements.bookExplain.textContent = bookExplanation(data.orderBook);
  elements.tradeContext.innerHTML = tradeContext(data, coin, priceDigits).map((line) => `<p>${line}</p>`).join('');
}

function renderTradeSetup(setup, coin, priceDigits) {
  elements.setupDirection.textContent = setup.direction.toUpperCase();
  elements.setupDirection.className = setup.direction === 'long'
    ? 'positive'
    : setup.direction === 'short'
      ? 'negative'
      : 'neutral';
  elements.setupConfidence.textContent = `Confidence ${setup.confidence}`;
  elements.setupEntry.textContent = setup.entry
    ? `${formatPrice(setup.entry.low, priceDigits)} - ${formatPrice(setup.entry.high, priceDigits)}`
    : 'WAIT';
  elements.setupTrigger.textContent = setup.triggerPrice
    ? formatPrice(setup.triggerPrice, priceDigits)
    : setup.breakoutLevels
      ? `Long > ${formatPrice(setup.breakoutLevels.longAbove, priceDigits)} / Short < ${formatPrice(setup.breakoutLevels.shortBelow, priceDigits)}`
      : '-';
  elements.setupStop.textContent = setup.stopLoss ? formatPrice(setup.stopLoss, priceDigits) : '-';
  elements.setupTargets.innerHTML = setup.targets.length
    ? setup.targets.slice(0, 3).map((target, index) => `
      <div class="target">
        <span>Target ${index + 1}</span>
        <strong>${formatPrice(target, priceDigits)}</strong>
      </div>
    `).join('')
    : `
      <div class="target">
        <span>Long trigger</span>
        <strong>${formatPrice(setup.breakoutLevels?.longAbove, priceDigits)}</strong>
      </div>
      <div class="target">
        <span>Short trigger</span>
        <strong>${formatPrice(setup.breakoutLevels?.shortBelow, priceDigits)}</strong>
      </div>
      <div class="target">
        <span>Mode</span>
        <strong>WAIT</strong>
      </div>
    `;
  elements.placeOrderButton.disabled = setup.direction === 'wait';
  elements.placeOrderButton.textContent = setup.direction === 'short'
    ? 'Place SHORT Order'
    : setup.direction === 'long'
      ? 'Place LONG Order'
      : 'Place Setup Order';

  if (setup.direction === 'wait') {
    elements.setupExplain.textContent = `${coin}: chưa nên chọn long/short ngay. Chờ phá lên trên ${formatPrice(setup.breakoutLevels?.longAbove, priceDigits)} để xét long, hoặc thủng ${formatPrice(setup.breakoutLevels?.shortBelow, priceDigits)} để xét short. ${setup.reason.join(' ')}`;
    return;
  }

  const moveText = setup.expectedMovePct > 0 ? `+${formatNumber(setup.expectedMovePct, 2)}%` : `${formatNumber(setup.expectedMovePct, 2)}%`;
  const sideText = setup.direction === 'long' ? 'LONG' : 'SHORT';

  elements.setupExplain.textContent = `${coin}: setup nghiêng ${sideText}. Entry tham khảo ${formatPrice(setup.entry.low, priceDigits)} - ${formatPrice(setup.entry.high, priceDigits)}, trigger xác nhận ${formatPrice(setup.triggerPrice, priceDigits)}, target chính ${formatPrice(setup.primaryTarget, priceDigits)} (${moveText}), invalidation/stop quanh ${formatPrice(setup.stopLoss, priceDigits)}. ${setup.reason.join(' ')}`;
}

async function placeSetupOrder() {
  if (!latestAnalysis || latestAnalysis.tradeSetup.direction === 'wait') {
    return;
  }

  const setup = latestAnalysis.tradeSetup;
  const side = setup.direction === 'long' ? 'BUY' : 'SELL';
  const notionalUsdt = Number(elements.orderNotionalInput.value);
  const leverage = Number(elements.orderLeverageInput.value);
  const dryRun = elements.orderDryRunInput.checked;

  if (!dryRun) {
    const confirmed = window.confirm(`Send LIVE ${side} MARKET order for ${latestAnalysis.symbol}? This can execute on Binance.`);

    if (!confirmed) {
      return;
    }
  }

  elements.placeOrderButton.disabled = true;
  elements.orderResult.textContent = 'Submitting order request...';

  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-orders-token': localStorage.getItem('orders_token') ?? '',
      },
      body: JSON.stringify({
        symbol: latestAnalysis.symbol,
        side,
        orderType: 'MARKET',
        notionalUsdt,
        leverage,
        dryRun,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? 'Order failed');
    }

    elements.orderResult.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    elements.orderResult.textContent = messageFor(error);
  } finally {
    elements.placeOrderButton.disabled = latestAnalysis.tradeSetup.direction === 'wait';
  }
}

async function placeQuickOrder(side) {
  const symbol = normalizeSymbol(elements.symbolInput.value);
  const orderType = elements.quickOrderTypeInput.value;
  const marginUsdt = Number(elements.quickMarginInput.value);
  const leverage = Number(elements.quickLeverageInput.value);
  const dryRun = elements.quickDryRunInput.checked;
  const notionalUsdt = marginUsdt * leverage;
  const limitPrice = elements.quickLimitPriceInput.value;

  if (orderType === 'LIMIT' && !limitPrice) {
    elements.quickOrderResult.textContent = 'Limit price is required for limit orders.';
    return;
  }

  if (!dryRun) {
    const confirmed = window.confirm(`Send LIVE ${side} ${orderType} order for ${symbol}? Margin ${marginUsdt} USDT, leverage ${leverage}x, notional ${notionalUsdt} USDT.`);

    if (!confirmed) {
      return;
    }
  }

  elements.quickLongButton.disabled = true;
  elements.quickShortButton.disabled = true;
  elements.quickOrderResult.textContent = 'Submitting quick order...';

  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-orders-token': localStorage.getItem('orders_token') ?? '',
      },
      body: JSON.stringify({
        symbol,
        side,
        orderType,
        notionalUsdt,
        leverage,
        limitPrice: orderType === 'LIMIT' ? Number(limitPrice) : null,
        dryRun,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? 'Quick order failed');
    }

    elements.quickOrderResult.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    elements.quickOrderResult.textContent = messageFor(error);
  } finally {
    elements.quickLongButton.disabled = false;
    elements.quickShortButton.disabled = false;
  }
}

let lsRatioPeriod = '5m';
let lsRatioSymbol = null;

document.querySelectorAll('.ls-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ls-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    lsRatioPeriod = btn.dataset.period;
    if (lsRatioSymbol) loadLsRatioChart(lsRatioSymbol);
  });
});

async function loadLsRatioChart(symbol) {
  lsRatioSymbol = symbol;
  try {
    const res = await fetch(`/api/ls-ratio?symbol=${symbol}&period=${lsRatioPeriod}&limit=50`);
    if (!res.ok) throw new Error('fetch failed');
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      elements.lsRatioExplain.style.display = '';
      elements.lsRatioChart.style.display = 'none';
      return;
    }
    elements.lsRatioExplain.style.display = 'none';
    elements.lsRatioChart.style.display = '';
    elements.lsRatioMeta.textContent = `${rows.length} candles · L/S ${Number(rows[rows.length - 1].longShortRatio).toFixed(3)}`;
    renderLsRatioChart(rows);
  } catch {
    elements.lsRatioExplain.style.display = '';
    elements.lsRatioChart.style.display = 'none';
  }
}

function renderLsRatioChart(rows) {
  const canvas = elements.lsRatioChart;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  const H = 260;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const PAD = { top: 8, right: 48, bottom: 24, left: 4 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const n = rows.length;
  const barW = Math.max(1, Math.floor(chartW / n) - 1);

  const green = '#36d399';
  const red = '#fb7185';
  const lineColor = '#f4f4f4';
  const mutedColor = '#9daaa5';

  ctx.clearRect(0, 0, W, H);

  // stacked bars: long% (bottom green) + short% (top red)
  rows.forEach((row, i) => {
    const x = PAD.left + i * (chartW / n);
    const longPct = Number(row.longAccount);   // 0–1
    const shortPct = 1 - longPct;

    const longH = longPct * chartH;
    const shortH = shortPct * chartH;

    ctx.fillStyle = green + 'bb';
    ctx.fillRect(x, PAD.top + shortH, barW, longH);

    ctx.fillStyle = red + 'bb';
    ctx.fillRect(x, PAD.top, barW, shortH);
  });

  // ratio line (longShortRatio), scale to fit min-max
  const ratioVals = rows.map((r) => Number(r.longShortRatio));
  const rMin = Math.min(...ratioVals);
  const rMax = Math.max(...ratioVals);
  const rRange = rMax - rMin || 0.01;

  ctx.beginPath();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  rows.forEach((row, i) => {
    const x = PAD.left + i * (chartW / n) + barW / 2;
    const ratio = Number(row.longShortRatio);
    const y = PAD.top + chartH - ((ratio - rMin) / rRange) * chartH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // y-axis labels: 0%, 50%, 100% for bars
  ctx.fillStyle = mutedColor;
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  ['100%', '50%', '0%'].forEach((label, i) => {
    const y = PAD.top + i * (chartH / 2) + (i === 2 ? 0 : 3);
    ctx.fillText(label, W - PAD.right + 2, y + 10);
  });

  // ratio axis labels right side
  ctx.textAlign = 'left';
  ctx.fillText(rMax.toFixed(2), W - PAD.right + 4, PAD.top + 10);
  ctx.fillText(rMin.toFixed(2), W - PAD.right + 4, PAD.top + chartH);

  // time labels: first and last
  ctx.textAlign = 'left';
  ctx.fillText(formatTime(rows[0].timestamp), PAD.left, H - 4);
  ctx.textAlign = 'right';
  ctx.fillText(formatTime(rows[rows.length - 1].timestamp), W - PAD.right, H - 4);
}

function formatTime(ts) {
  const d = new Date(Number(ts));
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function renderLiquidTotalsBox(liq, priceDigits) {
  if (!elements.liquidTotalsBox) return;
  const above = Number(liq?.liquidityAbove ?? 0);
  const below = Number(liq?.liquidityBelow ?? 0);
  const total = above + below;
  if (!Number.isFinite(total) || total <= 0) {
    elements.liquidTotalsBox.style.display = 'none';
    return;
  }

  const aboveShare = above / total * 100;
  const belowShare = below / total * 100;
  const ratio = below > 0 ? above / below : Infinity;
  const bias = Number(liq?.bias ?? ((above - below) / total));
  const absBias = Math.abs(bias);
  const dominant = above > below ? 'above' : below > above ? 'below' : 'balanced';
  const label = dominant === 'above'
    ? 'Thanh lý phía trên dày hơn'
    : dominant === 'below'
      ? 'Thanh lý phía dưới dày hơn'
      : 'Thanh lý cân bằng';
  const hint = dominant === 'above'
    ? 'dễ bị hút lên quét short'
    : dominant === 'below'
      ? 'dễ bị kéo xuống quét long'
      : 'chưa lệch rõ';

  elements.liquidTotalsBox.style.display = '';
  elements.liquidTotalsBox.className = `liquid-totals-box ${dominant}`;
  elements.liquidTotalsBias.textContent = `${label} · bias ${bias >= 0 ? '+' : ''}${formatNumber(bias, 3)}`;
  elements.liquidAboveTotal.textContent = formatCompact(above);
  elements.liquidAboveShare.textContent = `${formatNumber(aboveShare, 1)}% tổng heatmap`;
  elements.liquidBelowTotal.textContent = formatCompact(below);
  elements.liquidBelowShare.textContent = `${formatNumber(belowShare, 1)}% tổng heatmap`;
  elements.liquidTotalsRatio.textContent = Number.isFinite(ratio) ? `${formatNumber(ratio, 2)}x` : '∞';
  elements.liquidTotalsHint.textContent = absBias >= 0.25 ? hint : `lệch nhẹ, ${hint}`;

  const maxAbove = Array.isArray(liq?.strongestAbove) ? liq.strongestAbove[0] : null;
  const maxBelow = Array.isArray(liq?.strongestBelow) ? liq.strongestBelow[0] : null;
  if (maxAbove) {
    elements.liquidMaxAbovePrice.textContent = formatPrice(maxAbove.price, priceDigits);
    elements.liquidMaxAboveMeta.textContent = `${signedPct(maxAbove.distancePct)} · score ${formatCompact(maxAbove.score)}`;
  } else {
    elements.liquidMaxAbovePrice.textContent = '-';
    elements.liquidMaxAboveMeta.textContent = 'không có vùng rõ';
  }
  if (maxBelow) {
    elements.liquidMaxBelowPrice.textContent = formatPrice(maxBelow.price, priceDigits);
    elements.liquidMaxBelowMeta.textContent = `${signedPct(maxBelow.distancePct)} · score ${formatCompact(maxBelow.score)}`;
  } else {
    elements.liquidMaxBelowPrice.textContent = '-';
    elements.liquidMaxBelowMeta.textContent = 'không có vùng rõ';
  }
}

function renderTokenUnlockBox(unlock) {
  if (!elements.tokenUnlockBox) return;
  const next = unlock?.next;
  if (!next?.unlockDate) {
    elements.tokenUnlockBox.style.display = 'none';
    return;
  }

  const days = Math.ceil((Date.parse(next.unlockDate) - Date.now()) / 86_400_000);
  const valueUsd = Number(next.unlockValueUsd);
  const pctSupply = Number(next.percentSupply);
  const pctMcap = Number(next.percentMarketCap);
  let risk = 'LOW';
  if ((Number.isFinite(valueUsd) && valueUsd >= 50_000_000) || (Number.isFinite(pctSupply) && pctSupply >= 3) || (Number.isFinite(pctMcap) && pctMcap >= 3) || days <= 7) {
    risk = 'HIGH';
  } else if ((Number.isFinite(valueUsd) && valueUsd >= 10_000_000) || (Number.isFinite(pctSupply) && pctSupply >= 1) || (Number.isFinite(pctMcap) && pctMcap >= 1) || days <= 30) {
    risk = 'MID';
  }

  elements.tokenUnlockBox.style.display = '';
  elements.tokenUnlockBox.className = `token-unlock-box ${risk.toLowerCase()}`;
  elements.tokenUnlockRisk.textContent = `${risk} supply risk`;
  elements.tokenUnlockDate.textContent = formatDate(next.unlockDate);
  elements.tokenUnlockDays.textContent = Number.isFinite(days) ? `${days}d to unlock` : '-';
  elements.tokenUnlockAmount.textContent = formatCompact(next.unlockAmount);
  elements.tokenUnlockAllocation.textContent = next.allocation || next.unlockType || '-';
  elements.tokenUnlockValue.textContent = Number.isFinite(valueUsd) ? formatCurrency(valueUsd) : '-';
  elements.tokenUnlockPercent.textContent = [
    Number.isFinite(pctSupply) ? `${formatNumber(pctSupply, 2)}% supply` : null,
    Number.isFinite(pctMcap) ? `${formatNumber(pctMcap, 2)}% mcap` : null,
  ].filter(Boolean).join(' | ') || '-';
  elements.tokenUnlock30dValue.textContent = unlock.next30d?.totalValueUsd ? formatCurrency(unlock.next30d.totalValueUsd) : '-';
  elements.tokenUnlock30dMeta.textContent = `${unlock.next30d?.count ?? 0} event(s) next 30d`;
}

function renderBookBars(orderBook) {
  const total = orderBook.bidNotional + orderBook.askNotional;
  const bidPct = total > 0 ? Math.max((orderBook.bidNotional / total) * 100, 5) : 50;
  const askPct = total > 0 ? Math.max((orderBook.askNotional / total) * 100, 5) : 50;

  elements.bidBar.style.width = `${bidPct}%`;
  elements.askBar.style.width = `${askPct}%`;
}

function renderZones({ coin, side, zones, total, codeElement, listElement, totalElement, explainElement, priceDigits }) {
  const label = side === 'above' ? 'strong above' : 'strong below';
  const firstThree = zones.slice(0, 3);

  codeElement.textContent = `${label}:\n${firstThree.map((zone) => `${formatPrice(zone.price, priceDigits)} (${signedPct(zone.distancePct)})`).join(', ')}`;
  listElement.innerHTML = firstThree
    .map((zone) => `<li><strong>${formatPrice(zone.price, priceDigits)}</strong>: cách khoảng <span class="pill">${signedPct(zone.distancePct)}</span>, score ${formatCompact(zone.score)}</li>`)
    .join('');
  totalElement.textContent = formatCompact(total);

  if (side === 'above') {
    const targets = firstThree.map((zone) => formatPrice(zone.price, priceDigits));
    explainElement.textContent = `Nếu ${coin} phá lên và giữ trên vùng gần ${targets[0] ?? '-'}, vùng tiếp theo dễ bị hút là ${targets.slice(1).join(' - ') || targets[0] || '-'}.`;
  } else {
    const prices = firstThree.map((zone) => zone.price).sort((a, b) => a - b);
    explainElement.textContent = `Nếu ${coin} mất hỗ trợ và rơi xuống, vùng hút thanh khoản phía dưới nằm quanh ${formatPrice(prices[0], priceDigits)} - ${formatPrice(prices.at(-1), priceDigits)}.`;
  }
}

function zoneRangeText(zone, priceDigits) {
  if (!zone) return '-';
  return `${formatPrice(zone.low, priceDigits)} - ${formatPrice(zone.high, priceDigits)}`;
}

function zoneMetaText(zone) {
  if (!zone) return '-';
  const low = Number(zone.distancePctLow ?? 0);
  const high = Number(zone.distancePctHigh ?? 0);
  const score = zone.score != null ? ` · score ${formatCompact(zone.score)}` : '';
  return `${low >= 0 ? '+' : ''}${formatNumber(low, 1)}% → ${high >= 0 ? '+' : ''}${formatNumber(high, 1)}%${score}`;
}

function renderKillZoneBox(cluster, priceDigits) {
  const main = cluster?.mainKillZone ?? null;
  const exhaustion = cluster?.exhaustionZone ?? null;
  const far = cluster?.farKillZone ?? null;
  const hasAny = main || exhaustion || far;
  elements.killZoneBox.style.display = hasAny ? '' : 'none';

  elements.mainKillZoneItem.style.display = main ? '' : 'none';
  if (main) {
    elements.mainKillZoneRange.textContent = zoneRangeText(main, priceDigits);
    elements.mainKillZoneMeta.textContent = zoneMetaText(main);
  }

  elements.exhaustionZoneItem.style.display = exhaustion ? '' : 'none';
  if (exhaustion) {
    elements.exhaustionZoneRange.textContent = zoneRangeText(exhaustion, priceDigits);
    elements.exhaustionZoneMeta.textContent = zoneMetaText(exhaustion);
  }

  elements.farKillZoneItem.style.display = far ? '' : 'none';
  if (far) {
    elements.farKillZoneRange.textContent = zoneRangeText(far, priceDigits);
    elements.farKillZoneMeta.textContent = zoneMetaText(far);
    elements.farKillZonePeaks.innerHTML = (far.peaks ?? []).slice(0, 5)
      .map((peak) => `<b>${formatPrice(peak.price, priceDigits)}</b>`)
      .join('');
  }
}

function zoneShortText(zone, priceDigits) {
  return zone ? `${formatPrice(zone.low, priceDigits)} - ${formatPrice(zone.high, priceDigits)}` : '-';
}

function renderKillLogicBox(data, priceDigits) {
  const cluster = data.liquidationProxy.killZoneCluster;
  if (!cluster) {
    elements.killLogicBox.style.display = 'none';
    return;
  }

  const isAbove = cluster.direction === 'above';
  const near = cluster.nearSweep;
  const main = cluster.mainKillZone;
  const exhaustion = cluster.exhaustionZone;
  const far = cluster.farKillZone;
  const hasZone = near || main || exhaustion || far;
  if (!hasZone) {
    elements.killLogicBox.style.display = 'none';
    return;
  }

  const nearText = zoneShortText(near, priceDigits);
  const mainText = zoneShortText(main, priceDigits);
  const exhaustionText = zoneShortText(exhaustion, priceDigits);
  const farText = zoneShortText(far, priceDigits);
  const peakText = (far?.peaks ?? []).slice(0, 4).map((peak) => formatPrice(peak.price, priceDigits)).join(' / ');
  const mark = data.price.mark;
  const failLevel = isAbove
    ? (near?.low ?? data.liquidationProxy.nearestBelow?.[0]?.price ?? null)
    : (near?.high ?? data.liquidationProxy.nearestAbove?.[0]?.price ?? null);
  const avoidChaseLevel = isAbove
    ? (exhaustion?.high ?? main?.high ?? far?.high ?? null)
    : (exhaustion?.low ?? main?.low ?? far?.low ?? null);

  elements.killLogicBox.style.display = '';
  elements.killLogicBox.className = `kill-logic-box ${isAbove ? 'above' : 'below'}`;
  elements.killLogicLabel.textContent = isAbove ? 'Kill Short Logic' : 'Kill Long Logic';
  elements.killLogicTitle.textContent = isAbove
    ? 'Đang ưu tiên hướng hút lên quét short'
    : 'Đang ưu tiên hướng kéo xuống quét long';

  const lines = isAbove
    ? [
      `Near sweep: ${nearText}. Target gần có thể chỉ là lần quét đầu, không nên short sớm nếu giá còn giữ trên vùng này.`,
      main ? `Vùng short/reject đáng chú ý hơn: ${mainText}${exhaustion ? `, exhaustion ${exhaustionText}` : ''}.` : null,
      far ? `Nếu momentum expansion tiếp tục, far kill zone nằm ở ${farText}${peakText ? `; peaks ${peakText}` : ''}.` : null,
      failLevel ? `Squeeze yếu đi nếu mất ${formatPrice(failLevel, priceDigits)}; lúc đó mới bắt đầu coi lại kịch bản kill long phía dưới.` : null,
      avoidChaseLevel ? `Không long đuổi sau ${formatPrice(avoidChaseLevel, priceDigits)} nếu taker buy/volume không tiếp sức.` : null,
    ]
    : [
      `Near sweep: ${nearText}. Target gần có thể chỉ là lần quét đầu, không nên long sớm nếu giá còn nằm dưới vùng này.`,
      main ? `Vùng long/reject đáng chú ý hơn: ${mainText}${exhaustion ? `, exhaustion ${exhaustionText}` : ''}.` : null,
      far ? `Nếu momentum dump tiếp tục, far kill zone nằm ở ${farText}${peakText ? `; peaks ${peakText}` : ''}.` : null,
      failLevel ? `Dump squeeze yếu đi nếu vượt lại ${formatPrice(failLevel, priceDigits)}; lúc đó mới coi lại kịch bản kill short phía trên.` : null,
      avoidChaseLevel ? `Không short đuổi dưới ${formatPrice(avoidChaseLevel, priceDigits)} nếu sell flow không còn tiếp sức.` : null,
    ];

  const contextLine = `Mark hiện tại ${formatPrice(mark, priceDigits)} · bias ${data.liquidationProxy.bias >= 0 ? '+' : ''}${formatNumber(data.liquidationProxy.bias, 3)} · signal ${escapeHtml(data.signal.label)}.`;
  elements.killLogicBody.innerHTML = [contextLine, ...lines.filter(Boolean)]
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

function marketExplanation(data, coin, priceDigits) {
  const parts = [];

  if (Math.abs(data.liquidationProxy.bias) < 0.05) {
    parts.push(`Liquidity hai phía của ${coin} đang khá cân bằng, chưa có nam châm thanh khoản rõ.`);
  } else if (data.liquidationProxy.bias > 0) {
    parts.push(`Liquidity phía trên dày hơn, ${coin} có thể bị hút lên để quét short nếu momentum xác nhận.`);
  } else {
    parts.push(`Liquidity phía dưới dày hơn, ${coin} có rủi ro bị kéo xuống sweep long nếu mất vùng hỗ trợ gần.`);
  }

  const kz = data.liquidationProxy.killZoneCluster?.mainKillZone;
  if (kz && data.liquidationProxy.killZoneCluster?.isOneSided) {
    parts.push(`Main kill zone nằm quanh ${formatPrice(kz.low, priceDigits)} - ${formatPrice(kz.high, priceDigits)}, target gần có thể chỉ là lần quét đầu.`);
  }
  const fk = data.liquidationProxy.killZoneCluster?.farKillZone;
  if (fk) {
    parts.push(`Far kill zone nằm quanh ${formatPrice(fk.low, priceDigits)} - ${formatPrice(fk.high, priceDigits)} nếu momentum expansion tiếp tục.`);
  }

  if (data.market.takerBuyRatio > 0.53) {
    parts.push('Lệnh mua chủ động đang nhỉnh rõ.');
  } else if (data.market.takerBuyRatio < 0.47) {
    parts.push('Lệnh bán chủ động đang nhỉnh rõ.');
  } else {
    parts.push('Taker buy/sell gần cân bằng.');
  }

  return parts.join(' ');
}

function bookExplanation(orderBook) {
  if (Math.abs(orderBook.imbalance) < 0.1) {
    return 'Order book gần giá đang khá cân, chưa có bên nào áp đảo rõ.';
  }

  if (orderBook.imbalance > 0) {
    return 'Bid gần giá dày hơn ask, bên mua đang có đệm thanh khoản tốt hơn trong vùng đo.';
  }

  return 'Ask gần giá dày hơn bid, phía bán đang tạo áp lực lớn hơn trong vùng đo.';
}

function tradeContext(data, coin, priceDigits) {
  const above = data.liquidationProxy.strongestAbove.slice(0, 3);
  const below = data.liquidationProxy.strongestBelow.slice(0, 3);
  const aboveText = above.map((zone) => formatPrice(zone.price, priceDigits)).join(' -> ');
  const belowText = below.map((zone) => formatPrice(zone.price, priceDigits)).join(' -> ');
  const lines = [
    `<strong>Hiện tại:</strong> ${labelForSignal(data.signal.label)} với score ${formatNumber(data.signal.score, 4)}. Dùng như bối cảnh, không phải tín hiệu vào lệnh độc lập.`,
    `<strong>Kịch bản phá lên:</strong> nếu ${coin} vượt vùng gần ${formatPrice(above[0]?.price, priceDigits)} và taker buy tăng, chú ý các target liquidity ${aboveText}.`,
    `<strong>Kịch bản rơi xuống:</strong> nếu ${coin} mất vùng giá hiện tại và book imbalance chuyển âm mạnh, chú ý các vùng ${belowText}.`,
  ];

  const kz = data.liquidationProxy.killZoneCluster?.mainKillZone;
  if (kz) {
    lines.push(`<strong>Main kill zone:</strong> ${formatPrice(kz.low, priceDigits)} - ${formatPrice(kz.high, priceDigits)}. Khi liquidity một chiều, vùng này quan trọng hơn target quét gần nhất.`);
  }
  const fk = data.liquidationProxy.killZoneCluster?.farKillZone;
  if (fk) {
    lines.push(`<strong>Far kill zone:</strong> ${formatPrice(fk.low, priceDigits)} - ${formatPrice(fk.high, priceDigits)}. Đây là vùng cho cú momentum expansion xa kiểu spike LAB.`);
  }

  if (data.market.longShortRatio?.longShortRatio > 1.8) {
    lines.push('<strong>Cảnh báo crowding:</strong> long account đang đông, nếu giá yếu có thể dễ xuất hiện long squeeze.');
  }

  return lines;
}

function setLoading(isLoading) {
  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.textContent = isLoading ? 'Loading...' : 'Analyze';

  if (isLoading) {
    elements.status.textContent = 'Fetching Binance data...';
  }
}

function normalizeSymbol(input) {
  const symbol = String(input).trim().toUpperCase().replace(/[-/_\s]/g, '');

  if (!symbol) {
    return 'BTCUSDT';
  }

  return symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
}

function labelForSignal(signal) {
  const labels = {
    bullish_squeeze: 'Bullish Squeeze',
    kill_short_zone: 'Kill Short Zone ↑',
    bearish_sweep: 'Bearish Sweep',
    uptrend: 'Uptrend',
    downtrend: 'Downtrend',
    neutral: 'Neutral',
  };

  return labels[signal] ?? signal;
}

function classFor(value) {
  if (value > 0.05) {
    return 'positive';
  }

  if (value < -0.05) {
    return 'negative';
  }

  return 'neutral';
}

function signedPct(value) {
  const prefix = value > 0 ? '+' : '';

  return `${prefix}${formatNumber(value, 2)}%`;
}

function formatPrice(value, digits = null) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '-';
  }

  const maximumFractionDigits = digits ?? priceDigitsFor(value);

  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits,
  });
}

function priceDigitsFor(value) {
  const abs = Math.abs(Number(value));

  if (!Number.isFinite(abs) || abs === 0) {
    return 4;
  }

  if (abs >= 1000) {
    return 2;
  }

  if (abs >= 100) {
    return 3;
  }

  if (abs >= 10) {
    return 4;
  }

  if (abs >= 1) {
    return 5;
  }

  if (abs >= 0.1) {
    return 6;
  }

  if (abs >= 0.01) {
    return 7;
  }

  return 8;
}

function formatNumber(value, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '-';
  }

  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCurrency(value) {
  return `$${formatCompact(value)}`;
}

function formatCompact(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '-';
  }

  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value) {
  return new Date(value).toLocaleString('vi-VN', {
    hour12: false,
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}

function connectPriceSocket(symbol) {
  // Cleanup previous WebSocket
  if (priceWs) {
    priceWs.onclose = null; // prevent auto-reconnect for old symbol
    priceWs.close();
    priceWs = null;
  }

  priceWsSymbol = symbol;
  const dot = document.querySelector('#priceSocketDot');
  if (dot) dot.style.display = 'inline-block';

  function connect() {
    if (priceWsSymbol !== symbol) return; // symbol changed, abort
    const ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@markPrice@1s`);
    priceWs = ws;

    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.e !== 'markPriceUpdate') return;
        const mark = Number(d.p);
        const idx = Number(d.i);
        if (!mark) return;
        const digits = priceDigitsFor(mark);
        elements.markPrice.textContent = formatPrice(mark, digits);
        elements.indexPrice.textContent = `Index ${formatPrice(idx, digits)}`;
        if (dot) {
          dot.classList.add('blink');
          setTimeout(() => dot.classList.remove('blink'), 300);
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      priceWs = null;
      if (priceWsSymbol === symbol) setTimeout(connect, 3000); // auto-reconnect same symbol
    };
  }

  connect();
}

// ── Liquidation Heatmap ────────────────────────────────────────────────────────
function zoneColor(intensity, side) {
  if (side === 'above') {
    const h = Math.round(120 - intensity * 80);   // green(120) → yellow-green(40)
    const s = Math.round(40 + intensity * 60);
    const l = Math.round(22 + intensity * 33);
    return `hsl(${h},${s}%,${l}%)`;
  }
  const h = Math.round(intensity * 28);            // red(0) → orange(28)
  const s = Math.round(40 + intensity * 60);
  const l = Math.round(22 + intensity * 33);
  return `hsl(${h},${s}%,${l}%)`;
}

function renderHeatmap(liq, currentPrice, priceDigits) {
  const el = elements.liqHeatmap;
  const metaEl = elements.liqHeatmapMeta;
  if (!el) return;

  const zonesAbove = liq.heatmapAbove ?? [];
  const zonesBelow = liq.heatmapBelow ?? [];
  const allScores = [...zonesAbove, ...zonesBelow].map((z) => z.score);
  const maxScore = allScores.length ? Math.max(...allScores) : 1;

  const aboveCount = formatCompact(liq.liquidityAbove);
  const belowCount = formatCompact(liq.liquidityBelow);
  if (metaEl) metaEl.textContent = `↑${aboveCount}  ↓${belowCount}`;

  function row(zone, side) {
    const intensity = zone.score / maxScore;
    const color = zoneColor(intensity, side);
    const barW = Math.max(4, Math.round(intensity * 100));
    const sign = zone.distancePct >= 0 ? '+' : '';
    return `<div class="liq-row liq-${side}">
      <span class="liq-p">${formatPrice(zone.price, priceDigits)}</span>
      <div class="liq-bar-wrap"><div class="liq-bar" style="width:${barW}%;background:${color}"></div></div>
      <span class="liq-d">${sign}${formatNumber(zone.distancePct, 2)}%</span>
    </div>`;
  }

  const aboveHtml = zonesAbove.length
    ? zonesAbove.map((z) => row(z, 'above')).join('')
    : '<p class="liq-empty">Không có vùng trapped short</p>';

  const belowHtml = zonesBelow.length
    ? zonesBelow.map((z) => row(z, 'below')).join('')
    : '<p class="liq-empty">Không có vùng trapped long</p>';

  el.innerHTML = `
    ${aboveHtml}
    <div class="liq-current-price">
      <span>▶ ${formatPrice(currentPrice, priceDigits)}</span>
    </div>
    ${belowHtml}
  `;
}

// ── AI Analysis ────────────────────────────────────────────────────────────────
const aiAnalyzeBtn = document.getElementById('aiAnalyzeBtn');
const aiResult = document.getElementById('aiResult');

aiAnalyzeBtn.addEventListener('click', async () => {
  const symbol = normalizeSymbol(elements.symbolInput.value);
  aiAnalyzeBtn.disabled = true;
  aiAnalyzeBtn.textContent = 'Đang phân tích...';
  aiResult.innerHTML = '<p class="ai-loading">⏳ GPT đang phân tích dữ liệu...</p>';
  try {
    const res = await fetch('/api/ai-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'AI analysis failed');
    renderAiResult(data);
  } catch (e) {
    aiResult.innerHTML = `<p style="color:var(--red);padding:8px 0">${e.message}</p>`;
  } finally {
    aiAnalyzeBtn.disabled = false;
    aiAnalyzeBtn.textContent = 'Phân tích AI';
  }
});

function renderAiResult(d) {
  const rec = String(d.recommendation ?? 'WAIT').toUpperCase();
  const dirColor = rec === 'LONG' ? 'var(--green)' : rec === 'SHORT' ? 'var(--red)' : 'var(--muted)';
  const riskClass = String(d.riskLevel ?? 'MEDIUM').toLowerCase();
  const digits = (v) => {
    const abs = Math.abs(Number(v));
    if (!isFinite(abs) || abs === 0) return 4;
    if (abs >= 1000) return 2;
    if (abs >= 100) return 3;
    if (abs >= 10) return 4;
    if (abs >= 1) return 5;
    return 6;
  };
  const fmt = (v) => v == null ? '-' : Number(v).toLocaleString('en-US', { maximumFractionDigits: digits(v) });
  const entry = d.entry ?? {};
  const reasoning = Array.isArray(d.reasoning) ? d.reasoning : [];
  aiResult.innerHTML = `
    <div class="ai-rec">
      <span class="ai-dir" style="color:${dirColor}">${rec}</span>
      <span class="ai-conf">Confidence ${d.confidence ?? '-'}%</span>
      <span class="ai-risk ${riskClass}">${String(d.riskLevel ?? 'MEDIUM').toUpperCase()} RISK</span>
    </div>
    <div class="ai-prices">
      <div><span>Entry</span><strong>${fmt(entry.low)} – ${fmt(entry.high)}</strong></div>
      <div><span>Stop Loss</span><strong style="color:var(--red)">${fmt(d.stopLoss)}</strong></div>
      <div><span>Target</span><strong style="color:var(--green)">${fmt(d.target)}</strong></div>
    </div>
    <p class="ai-summary">${d.summary ?? ''}</p>
    <ul class="ai-reasons">${reasoning.map((r) => `<li>${r}</li>`).join('')}</ul>
  `;
}
