const elements = {
  status: document.querySelector('#statusText'),
  updated: document.querySelector('#updatedText'),
  refresh: document.querySelector('#refreshButton'),
  progressPanel: document.querySelector('#progressPanel'),
  progressSymbol: document.querySelector('#progressSymbol'),
  progressCount: document.querySelector('#progressCount'),
  progressBar: document.querySelector('#progressBar'),
  summary: document.querySelector('#summary'),
  failures: document.querySelector('#failures'),
  grid: document.querySelector('#grid'),
};

let timer = null;

function number(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return parsed.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function compactUsd(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(parsed);
}

function time(value) {
  if (!value) return '—';
  const date = new Date(Number(value) || value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

function metric(label, value) {
  const item = document.createElement('div');
  item.className = 'metric';
  const name = document.createElement('span');
  name.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value;
  item.append(name, content);
  return item;
}

function zoneGroup(title, zones) {
  const group = document.createElement('div');
  group.className = 'zone-group';
  const heading = document.createElement('h3');
  heading.textContent = title;
  group.append(heading);
  if (!zones.length) {
    const empty = document.createElement('span');
    empty.className = 'muted';
    empty.textContent = 'Chưa có cụm rõ';
    group.append(empty);
    return group;
  }
  for (const zone of zones.slice(0, 4)) {
    const row = document.createElement('div');
    row.className = 'zone';
    const price = document.createElement('b');
    price.textContent = number(zone.price, 8);
    const distance = document.createElement('span');
    distance.textContent = `${Number(zone.distancePct) >= 0 ? '+' : ''}${number(zone.distancePct)}%`;
    const strength = document.createElement('span');
    strength.textContent = `S${number(zone.strength, 0)}`;
    row.append(price, distance, strength);
    group.append(row);
  }
  return group;
}

function card(row) {
  const item = document.createElement('article');
  item.className = 'card';
  const head = document.createElement('div');
  head.className = 'card-head';
  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'symbol';
  const rank = document.createElement('span');
  rank.className = 'rank';
  rank.textContent = `#${row.rank}`;
  title.append(rank, document.createTextNode(` ${row.symbol}`));
  const stats = document.createElement('div');
  stats.className = 'market-stats';
  const volume = document.createElement('span');
  volume.textContent = `Vol 24h ${compactUsd(row.quoteVolume24h)}`;
  const price = document.createElement('span');
  price.textContent = `Giá ${number(row.lastPrice, 8)}`;
  const change = document.createElement('span');
  change.className = Number(row.priceChangePercent24h) >= 0 ? 'positive' : 'negative';
  change.textContent = `${Number(row.priceChangePercent24h) >= 0 ? '+' : ''}${number(row.priceChangePercent24h)}%`;
  stats.append(volume, price, change);
  copy.append(title, stats);
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = `${row.status || 'OK'} · ${row.range} · ${number(row.heatmap?.liquidationCellCount, 0)} CELLS`;
  head.append(copy, badge);

  const lockedNotice = document.createElement('div');
  lockedNotice.className = 'locked-note';
  lockedNotice.textContent = 'CoinGlass yêu cầu đăng nhập để mở dữ liệu altcoin; ảnh giữ lại trạng thái khóa để audit.';

  const image = document.createElement('img');
  image.className = 'heatmap';
  image.src = `${row.imageUrl}&t=${encodeURIComponent(row.scrapedAt || '')}`;
  image.alt = `CoinGlass Model 3 heatmap ${row.symbol}`;
  image.loading = 'lazy';

  const zones = Array.isArray(row.heatmap?.zones) ? row.heatmap.zones : [];
  const zonePanel = document.createElement('div');
  zonePanel.className = 'zones';
  zonePanel.append(
    zoneGroup('Thanh khoản phía trên', zones.filter((zone) => zone.side === 'ABOVE')),
    zoneGroup('Thanh khoản phía dưới', zones.filter((zone) => zone.side === 'BELOW')),
  );
  item.append(head);
  if (row.accessLocked) item.append(lockedNotice);
  item.append(image, zonePanel);
  return item;
}

function render(data) {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const failures = Array.isArray(data.failures) ? data.failures : [];
  const lockedCount = rows.filter((row) => row.accessLocked || row.status === 'LOGIN_REQUIRED').length;
  const availableCount = rows.length - lockedCount;
  const progress = data.progress || {};
  elements.refresh.disabled = Boolean(data.running) || data.config?.enabled === false;
  elements.status.textContent = data.running
    ? `Đang cào ${progress.currentSymbol || 'CoinGlass Model 3'}…`
    : data.error
      ? `Lần cào gần nhất lỗi: ${data.error}`
      : rows.length
        ? `${availableCount} heatmap mở được · ${lockedCount} coin CoinGlass yêu cầu đăng nhập${data.source?.retainedStale ? ` · ${data.source.retainedStale} ảnh last-good` : ''}`
        : 'Chưa có snapshot — bấm “Cào lại top 20” để chạy thử.';
  elements.updated.textContent = data.updatedAt
    ? `Snapshot ${time(data.updatedAt)} · CoinGlass ${data.source?.range || '48h'} · xếp hạng theo Binance quote volume 24h`
    : `Version ${data.version || '—'}`;

  elements.progressPanel.hidden = !data.running;
  if (data.running) {
    const total = Number(progress.total) || 20;
    const completed = Number(progress.completed) || 0;
    elements.progressSymbol.textContent = progress.currentSymbol
      ? `Đang xử lý ${progress.currentSymbol}`
      : 'Đang khởi tạo trình duyệt…';
    elements.progressCount.textContent = `${completed} / ${total}`;
    elements.progressBar.style.width = `${Math.min(100, (completed / total) * 100)}%`;
  }

  elements.summary.replaceChildren(
    metric('Heatmap mở được', `${availableCount}`),
    metric('CoinGlass khóa login', `${lockedCount}`),
    metric('Lỗi kỹ thuật', `${failures.length}`),
    metric('Chế độ', data.mode || 'OBSERVE_ONLY'),
  );

  elements.failures.hidden = failures.length === 0;
  elements.failures.replaceChildren();
  if (failures.length) {
    const heading = document.createElement('strong');
    heading.textContent = `${failures.length} coin chưa lấy được:`;
    elements.failures.append(heading);
    for (const failure of failures) {
      const line = document.createElement('p');
      line.textContent = `${failure.symbol}: ${failure.error}`;
      elements.failures.append(line);
    }
  }

  elements.grid.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = data.running ? 'Heatmap đầu tiên sẽ xuất hiện sau khi lượt cào hoàn tất.' : 'Chưa có dữ liệu.';
    elements.grid.append(empty);
  } else {
    elements.grid.append(...rows.map(card));
  }
}

async function load() {
  clearTimeout(timer);
  try {
    const response = await fetch('/api/coinglass-web-top20', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    render(data);
    timer = setTimeout(load, data.running ? 3000 : 30000);
  } catch (error) {
    elements.status.textContent = `Không đọc được snapshot: ${error.message}`;
    timer = setTimeout(load, 10000);
  }
}

elements.refresh.addEventListener('click', async () => {
  elements.refresh.disabled = true;
  elements.status.textContent = 'Đang khởi động collector riêng…';
  try {
    const response = await fetch('/api/coinglass-web-top20/refresh', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || (!data.accepted && data.reason !== 'already_running')) {
      throw new Error(data.error || data.reason || `HTTP ${response.status}`);
    }
    await load();
  } catch (error) {
    elements.status.textContent = `Không thể chạy collector: ${error.message}`;
    elements.refresh.disabled = false;
  }
});

load();
