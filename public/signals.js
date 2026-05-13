const STREAM_URLS = [
  'wss://fstream.binance.com/stream?streams=!markPrice@arr@1s/!ticker@arr',
  'wss://fstream.binancefuture.com/stream?streams=!markPrice@arr@1s/!ticker@arr',
  'wss://fstream.binance.com/ws/!markPrice@arr@1s',
  'wss://fstream.binancefuture.com/ws/!markPrice@arr@1s',
];
const RENDER_INTERVAL_MS = 1500;
const RECONNECT_BASE_MS = 1500;
const STALE_SOCKET_MS = 6500;
const SNAPSHOT_REFRESH_MS = 15000;

const elements = {
  socketStatus: document.querySelector('#socketStatus'),
  searchInput: document.querySelector('#searchInput'),
  signalFilter: document.querySelector('#signalFilter'),
  sortInput: document.querySelector('#sortInput'),
  visibleCount: document.querySelector('#visibleCount'),
  longCount: document.querySelector('#longCount'),
  shortCount: document.querySelector('#shortCount'),
  waitCount: document.querySelector('#waitCount'),
  lastUpdate: document.querySelector('#lastUpdate'),
  signalsBody: document.querySelector('#signalsBody'),
};

const allowedSymbols = new Set();
const marketState = new Map();
let socket = null;
let reconnectAttempt = 0;
let lastRenderAt = 0;
let reconnectTimer = null;
let staleTimer = null;
let socketUrlIndex = 0;
let lastSocketMessageAt = 0;
let snapshotTimer = null;

elements.searchInput.addEventListener('input', render);
elements.signalFilter.addEventListener('change', render);
elements.sortInput.addEventListener('change', render);

await loadSymbols();
connectSocket();
snapshotTimer = setInterval(loadMarketSnapshot, SNAPSHOT_REFRESH_MS);
setTimeout(() => {
  if (!hasRenderableData()) {
    loadMarketSnapshot();
  }
}, 3500);

function connectSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const socketUrl = STREAM_URLS[socketUrlIndex % STREAM_URLS.length];

  socket = new WebSocket(socketUrl);
  elements.socketStatus.textContent = `Connecting socket ${socketUrlIndex % STREAM_URLS.length + 1}/${STREAM_URLS.length}...`;

  socket.addEventListener('open', () => {
    reconnectAttempt = 0;
    lastSocketMessageAt = Date.now();
    elements.socketStatus.textContent = 'Socket connected';
    armStaleTimer();
  });

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    const stream = payload.stream ?? inferRawStream(payload);
    const rows = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

    lastSocketMessageAt = Date.now();

    if (stream.includes('markPrice')) {
      applyMarkPriceRows(rows);
    } else if (stream.includes('ticker')) {
      applyTickerRows(rows);
    }

    elements.lastUpdate.textContent = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    scheduleRender();
  });

  socket.addEventListener('close', () => {
    reconnectSocket('Socket closed', true);
  });

  socket.addEventListener('error', () => {
    reconnectSocket('Socket error', true);
  });
}

async function loadSymbols() {
  const response = await fetch('/api/symbols');
  const symbols = await response.json();

  symbols.forEach((item) => {
    allowedSymbols.add(item.symbol);
    marketState.set(item.symbol, {
      symbol: item.symbol,
      baseAsset: item.baseAsset,
      markPrice: null,
      indexPrice: null,
      fundingRate: null,
      change24hPct: null,
      quoteVolume: 0,
      firstSeenPrice: null,
      firstSeenAt: null,
      liveMomentumPct: 0,
      lastUpdate: 0,
    });
  });
}

async function loadMarketSnapshot() {
  try {
    const response = await fetch('/api/market-snapshot');
    const rows = await response.json();

    if (!response.ok) {
      throw new Error(rows.error ?? 'Snapshot failed');
    }

    rows.forEach((row) => {
      if (!allowedSymbols.has(row.symbol)) {
        return;
      }

      const state = getState(row.symbol);

      state.markPrice = row.markPrice;
      state.indexPrice = row.indexPrice;
      state.fundingRate = row.fundingRate;
      state.change24hPct = row.change24hPct;
      state.quoteVolume = row.quoteVolume;
      updateLiveMomentum(state, row.markPrice);
      state.lastUpdate = Date.now();
    });

    if (!lastSocketMessageAt || Date.now() - lastSocketMessageAt > STALE_SOCKET_MS) {
      elements.socketStatus.textContent = 'Using light REST snapshot while socket is stale';
    }

    render();
  } catch (error) {
    elements.socketStatus.textContent = `Snapshot failed: ${error instanceof Error ? error.message : error}`;
  }
}

function applyMarkPriceRows(rows) {
  rows.forEach((row) => {
    const symbol = row.s;

    if (!allowedSymbols.has(symbol)) {
      return;
    }

    const state = getState(symbol);
    const markPrice = Number(row.p);

    state.markPrice = markPrice;
    state.indexPrice = Number(row.i);
    state.fundingRate = Number(row.r);
    updateLiveMomentum(state, markPrice);
    state.lastUpdate = Date.now();
  });
}

function applyTickerRows(rows) {
  rows.forEach((row) => {
    const symbol = row.s;

    if (!allowedSymbols.has(symbol)) {
      return;
    }

    const state = getState(symbol);
    const lastPrice = Number(row.c);

    state.lastPrice = lastPrice;
    state.change24hPct = Number(row.P);
    state.quoteVolume = Number(row.q);

    if (!state.markPrice) {
      state.markPrice = lastPrice;
      updateLiveMomentum(state, lastPrice);
    }

    state.lastUpdate = Date.now();
  });
}

function inferRawStream(payload) {
  if (Array.isArray(payload) && payload[0]?.e === 'markPriceUpdate') {
    return 'markPrice';
  }

  if (Array.isArray(payload) && payload[0]?.e === '24hrTicker') {
    return 'ticker';
  }

  return '';
}

function updateLiveMomentum(state, price) {
  const now = Date.now();

  if (!state.firstSeenPrice || now - state.firstSeenAt > 5 * 60 * 1000) {
    state.firstSeenPrice = price;
    state.firstSeenAt = now;
  }

  state.liveMomentumPct = ((price - state.firstSeenPrice) / state.firstSeenPrice) * 100;
}

function getState(symbol) {
  const current = marketState.get(symbol);

  if (current) {
    return current;
  }

  const created = { symbol };
  marketState.set(symbol, created);

  return created;
}

function scheduleRender() {
  const now = Date.now();

  if (now - lastRenderAt < RENDER_INTERVAL_MS) {
    return;
  }

  lastRenderAt = now;
  render();
}

function hasRenderableData() {
  return [...marketState.values()].some((row) => row.markPrice && row.change24hPct !== null);
}

function render() {
  const search = elements.searchInput.value.trim().toUpperCase();
  const signalFilter = elements.signalFilter.value;
  const rows = [...marketState.values()]
    .filter((row) => row.markPrice && row.change24hPct !== null)
    .map((row) => ({
      ...row,
      setup: buildSocketSetup(row),
    }))
    .filter((row) => !search || row.symbol.includes(search) || row.baseAsset?.includes(search))
    .filter((row) => signalFilter === 'all' || row.setup.direction === signalFilter);

  sortRows(rows);
  renderSummary(rows);

  const visibleRows = rows.slice(0, 160);

  elements.visibleCount.textContent = String(visibleRows.length);
  elements.signalsBody.innerHTML = visibleRows.length
    ? visibleRows.map(renderRow).join('')
    : '<tr><td colspan="12" class="empty-cell">No symbols match current filter.</td></tr>';
}

function buildSocketSetup(row) {
  const price = row.markPrice;
  const change24h = row.change24hPct ?? 0;
  const liveMomentum = row.liveMomentumPct ?? 0;
  const fundingPct = (row.fundingRate ?? 0) * 100;
  const volatility = clamp(Math.abs(change24h) / 100 * 0.08, 0.0025, 0.018);
  const trendScore = (
    clamp(change24h / 12, -1, 1) * 0.45
    + clamp(liveMomentum / 1.2, -1, 1) * 0.4
    + clamp(-fundingPct / 0.05, -0.4, 0.4) * 0.15
  );
  const confidence = confidenceFor(trendScore, row.quoteVolume);
  let direction = 'wait';

  if (trendScore >= 0.34) {
    direction = 'long';
  } else if (trendScore <= -0.34) {
    direction = 'short';
  }

  if (direction === 'long') {
    return {
      direction,
      confidence,
      score: trendScore,
      entry: {
        low: price * (1 - volatility * 0.55),
        high: price * (1 + volatility * 0.15),
      },
      trigger: price * (1 + volatility * 0.35),
      stop: price * (1 - volatility * 1.25),
      targets: [
        price * (1 + volatility * 1.2),
        price * (1 + volatility * 2.1),
        price * (1 + volatility * 3),
      ],
      reason: '24h trend và live momentum nghiêng lên.',
    };
  }

  if (direction === 'short') {
    return {
      direction,
      confidence,
      score: trendScore,
      entry: {
        low: price * (1 - volatility * 0.15),
        high: price * (1 + volatility * 0.55),
      },
      trigger: price * (1 - volatility * 0.35),
      stop: price * (1 + volatility * 1.25),
      targets: [
        price * (1 - volatility * 1.2),
        price * (1 - volatility * 2.1),
        price * (1 - volatility * 3),
      ],
      reason: '24h trend và live momentum nghiêng xuống.',
    };
  }

  return {
    direction,
    confidence,
    score: trendScore,
    entry: null,
    trigger: null,
    stop: null,
    targets: [],
    reason: 'Chưa đủ lệch, nên chờ thêm xác nhận.',
  };
}

function renderSummary(rows) {
  const counts = rows.reduce((result, row) => {
    result[row.setup.direction] += 1;

    return result;
  }, { long: 0, short: 0, wait: 0 });

  elements.longCount.textContent = String(counts.long);
  elements.shortCount.textContent = String(counts.short);
  elements.waitCount.textContent = String(counts.wait);
}

function sortRows(rows) {
  const sort = elements.sortInput.value;

  rows.sort((a, b) => {
    if (sort === 'symbol') {
      return a.symbol.localeCompare(b.symbol);
    }

    if (sort === 'change') {
      return Math.abs(b.change24hPct) - Math.abs(a.change24hPct);
    }

    if (sort === 'volume') {
      return b.quoteVolume - a.quoteVolume;
    }

    return Math.abs(b.setup.score) - Math.abs(a.setup.score);
  });
}

function renderRow(row) {
  const digits = priceDigitsFor(row.markPrice);
  const setup = row.setup;
  const directionClass = setup.direction === 'long'
    ? 'positive'
    : setup.direction === 'short'
      ? 'negative'
      : 'neutral';
  const href = `/?symbol=${encodeURIComponent(row.symbol)}`;

  return `
    <tr>
      <td><a class="symbol-link" href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.symbol)}</a></td>
      <td><span class="signal-pill ${directionClass}">${setup.direction.toUpperCase()}</span><small>${formatNumber(setup.score, 3)}</small></td>
      <td><span class="confidence-pill confidence-${setup.confidence}">${setup.confidence.toUpperCase()}</span></td>
      <td>${formatPrice(row.markPrice, digits)}</td>
      <td class="${classFor(row.change24hPct)}">${signed(row.change24hPct)}%</td>
      <td class="${classFor(row.liveMomentumPct)}">${signed(row.liveMomentumPct)}%</td>
      <td class="${classFor(-Math.abs(row.fundingRate ?? 0) + 0.0002)}">${formatNumber((row.fundingRate ?? 0) * 100, 4)}%</td>
      <td>${setup.entry ? `${formatPrice(setup.entry.low, digits)} - ${formatPrice(setup.entry.high, digits)}` : '-'}</td>
      <td>${setup.trigger ? formatPrice(setup.trigger, digits) : '-'}</td>
      <td>${setup.stop ? formatPrice(setup.stop, digits) : '-'}</td>
      <td>${setup.targets.length ? setup.targets.map((target) => formatPrice(target, digits)).join(' / ') : '-'}</td>
      <td>${escapeHtml(setup.reason)}</td>
    </tr>
  `;
}

function confidenceFor(score, quoteVolume) {
  const strength = Math.abs(score);
  const volumeBoost = quoteVolume >= 50_000_000 ? 0.08 : quoteVolume >= 10_000_000 ? 0.04 : 0;
  const adjusted = strength + volumeBoost;

  if (adjusted >= 0.72) {
    return 'high';
  }

  if (adjusted >= 0.46) {
    return 'medium';
  }

  return 'low';
}

function reconnectSocket(message, rotateEndpoint = false) {
  if (reconnectTimer) {
    return;
  }

  if (staleTimer) {
    clearTimeout(staleTimer);
    staleTimer = null;
  }

  if (socket && socket.readyState <= WebSocket.OPEN) {
    socket.close();
  }

  if (rotateEndpoint) {
    socketUrlIndex += 1;
  }

  reconnectAttempt += 1;
  const waitMs = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, 30000);

  elements.socketStatus.textContent = `${message}. Reconnect in ${Math.ceil(waitMs / 1000)}s`;
  reconnectTimer = setTimeout(connectSocket, waitMs);
}

function armStaleTimer() {
  if (staleTimer) {
    clearTimeout(staleTimer);
  }

  staleTimer = setTimeout(() => {
    if (!lastSocketMessageAt || Date.now() - lastSocketMessageAt >= STALE_SOCKET_MS) {
      reconnectSocket('Socket connected but no data', true);
      loadMarketSnapshot();
      return;
    }

    armStaleTimer();
  }, STALE_SOCKET_MS);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function signed(value) {
  const prefix = value > 0 ? '+' : '';

  return `${prefix}${formatNumber(value, 2)}`;
}

function formatPrice(value, digits = null) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '-';
  }

  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: digits ?? priceDigitsFor(value),
  });
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
