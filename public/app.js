const elements = {
  symbolInput: document.querySelector('#symbolInput'),
  symbolsList: document.querySelector('#symbolsList'),
  intervalInput: document.querySelector('#intervalInput'),
  rangeInput: document.querySelector('#rangeInput'),
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
  tradeContext: document.querySelector('#tradeContext'),
  coinglassLink: document.querySelector('#coinglassLink'),
  binanceLink: document.querySelector('#binanceLink'),
  quickScanBadge: document.querySelector('#quickScanBadge'),
};

let autoRefreshTimer = null;
let latestAnalysis = null;
let priceWsSymbol = null;
let priceWsReconnectTimer = null;
const initialSymbol = new URLSearchParams(window.location.search).get('symbol');

if (initialSymbol) {
  elements.symbolInput.value = normalizeSymbol(initialSymbol);
}

elements.refreshButton.addEventListener('click', () => {
  loadAnalysis();
});

elements.symbolInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    loadAnalysis();
  }
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
  const symbol = normalizeSymbol(elements.symbolInput.value);
  const coin = symbol.replace(/USDT$/, '');
  elements.coinglassLink.href = `https://www.coinglass.com/pro/futures/LiquidationHeatMapNew?coin=${coin}`;
  elements.binanceLink.href = `https://www.binance.com/vi/futures/${symbol}`;
  const params = new URLSearchParams({
    symbol,
    interval: elements.intervalInput.value,
    rangePct: elements.rangeInput.value,
    depthLimit: '500',
  });

  setLoading(true);

  try {
    const response = await fetch(`/api/analyze?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? 'Analyze failed');
    }

    elements.symbolInput.value = payload.symbol;
    render(payload);
    elements.status.textContent = 'Updated';
    connectPriceSocket(payload.symbol);
  } catch (error) {
    elements.status.textContent = messageFor(error);
  } finally {
    setLoading(false);
  }
}

function render(data) {
  latestAnalysis = data;
  const coin = data.symbol.replace(/USDT$/, '');
  const signalClass = classFor(data.signal.score);
  const priceDigits = priceDigitsFor(data.price.mark);

  elements.signalValue.textContent = labelForSignal(data.signal.label);
  elements.signalValue.className = signalClass;
  elements.signalScore.textContent = `Score ${formatNumber(data.signal.score, 4)}`;
  const qd = data.quickScan.direction;
  const qdClass = qd === 'long' ? 'positive' : qd === 'short' ? 'negative' : 'neutral';
  elements.quickScanBadge.innerHTML = `Scan: <span class="${qdClass}">${qd.toUpperCase()}</span> ${formatNumber(data.quickScan.score, 3)}`;
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
  elements.bookImbalance.textContent = formatNumber(data.orderBook.imbalance, 4);
  elements.bookImbalance.className = classFor(data.orderBook.imbalance);

  const st = data.liquidationProxy.sweepTarget;
  const sweepBox = document.getElementById('sweepTargetBox');
  const sweepLabel = document.getElementById('sweepTargetLabel');
  const sweepPrice = document.getElementById('sweepTargetPrice');
  const sweepDist = document.getElementById('sweepTargetDist');
  if (st) {
    const isAbove = st.direction === 'above';
    sweepLabel.textContent = isAbove ? '🚀 Kéo lên quét short tại' : '💥 Kéo xuống quét long tại';
    sweepPrice.textContent = formatPrice(st.price, priceDigits);
    sweepPrice.className = isAbove ? 'positive' : 'negative';
    sweepDist.textContent = `${st.distancePct > 0 ? '+' : ''}${formatNumber(st.distancePct, 2)}% away`;
    sweepBox.style.display = 'block';
  } else {
    sweepBox.style.display = 'none';
  }
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

  elements.marketExplain.textContent = marketExplanation(data, coin);
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

function marketExplanation(data, coin) {
  const parts = [];

  if (Math.abs(data.liquidationProxy.bias) < 0.05) {
    parts.push(`Liquidity hai phía của ${coin} đang khá cân bằng, chưa có nam châm thanh khoản rõ.`);
  } else if (data.liquidationProxy.bias > 0) {
    parts.push(`Liquidity phía trên dày hơn, ${coin} có thể bị hút lên để quét short nếu momentum xác nhận.`);
  } else {
    parts.push(`Liquidity phía dưới dày hơn, ${coin} có rủi ro bị kéo xuống sweep long nếu mất vùng hỗ trợ gần.`);
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
  if (priceWsReconnectTimer) {
    clearInterval(priceWsReconnectTimer);
    priceWsReconnectTimer = null;
  }

  priceWsSymbol = symbol;
  const dot = document.querySelector('#priceSocketDot');

  if (dot) {
    dot.style.display = 'inline-block';
  }

  priceWsReconnectTimer = setInterval(async () => {
    if (priceWsSymbol !== symbol) {
      return;
    }

    try {
      const res = await fetch(`/api/price?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      const mark = Number(data.mark);
      const idx = Number(data.index);

      if (!mark) {
        return;
      }

      const digits = priceDigitsFor(mark);
      elements.markPrice.textContent = formatPrice(mark, digits);
      elements.indexPrice.textContent = `Index ${formatPrice(idx, digits)}`;

      if (dot) {
        dot.classList.add('blink');
        setTimeout(() => dot.classList.remove('blink'), 300);
      }
    } catch {
      // ignore fetch errors, will retry next tick
    }
  }, 1000);
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
