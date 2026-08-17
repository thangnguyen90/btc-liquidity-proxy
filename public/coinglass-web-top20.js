const elements = {
  status: document.querySelector('#statusText'),
  updated: document.querySelector('#updatedText'),
  auth: document.querySelector('#authText'),
  login: document.querySelector('#loginButton'),
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
    notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(parsed);
}

function percent(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed >= 0 ? '+' : ''}${number(parsed)}%` : '—';
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

function valueBlock(label, value, tone = '') {
  const block = document.createElement('div');
  block.className = `proposal-value ${tone}`.trim();
  const name = document.createElement('span');
  name.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value;
  block.append(name, content);
  return block;
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
    empty.textContent = 'Không có cụm đủ gần giá';
    group.append(empty);
    return group;
  }
  const header = document.createElement('div');
  header.className = 'zone zone-header';
  for (const text of ['Giá', 'Cách giá', 'Lực', 'Bền']) {
    const cell = document.createElement('span');
    cell.textContent = text;
    header.append(cell);
  }
  group.append(header);
  for (const zone of zones.slice(0, 5)) {
    const row = document.createElement('div');
    row.className = 'zone';
    const price = document.createElement('b');
    price.textContent = number(zone.price, 8);
    const distance = document.createElement('span');
    distance.textContent = percent(zone.distancePct);
    const strength = document.createElement('span');
    strength.textContent = `${number(zone.strength, 0)}/100`;
    const persistence = document.createElement('span');
    persistence.textContent = `${number(zone.persistenceBars, 0)} nến`;
    row.append(price, distance, strength, persistence);
    group.append(row);
  }
  return group;
}

function card(row) {
  const item = document.createElement('article');
  const proposal = row.proposal || { action: 'NO_DATA', label: 'CHƯA ĐỦ VÙNG THANH LÝ' };
  const actionTone = proposal.action === 'WAIT_LONG_CONFIRMATION'
    ? 'long'
    : proposal.action === 'WAIT_SHORT_CONFIRMATION'
      ? 'short'
      : proposal.action === 'WAIT_BALANCED'
        ? 'balanced'
        : 'no-data';
  item.className = `card ${actionTone}`;

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
  const values = [
    `Vol ${compactUsd(row.quoteVolume24h)}`,
    `OI ${compactUsd(row.binanceLiquidity?.openInterestNotional)}`,
    `Top book ${compactUsd(row.binanceLiquidity?.bookDepthUsd)}`,
    `Spread ${number(row.binanceLiquidity?.spreadBps)} bps`,
  ];
  for (const text of values) {
    const span = document.createElement('span');
    span.textContent = text;
    stats.append(span);
  }
  const change = document.createElement('span');
  change.className = Number(row.priceChangePercent24h) >= 0 ? 'positive' : 'negative';
  change.textContent = percent(row.priceChangePercent24h);
  stats.append(change);
  copy.append(title, stats);
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = `${row.status || 'OK'} · ${number(row.heatmap?.liquidationCellCount, 0)} CELLS`;
  head.append(copy, badge);

  const proposalPanel = document.createElement('section');
  proposalPanel.className = 'proposal';
  const proposalTop = document.createElement('div');
  proposalTop.className = 'proposal-top';
  const label = document.createElement('strong');
  label.className = 'proposal-label';
  label.textContent = proposal.label;
  const mode = document.createElement('span');
  mode.textContent = 'OBSERVE ONLY';
  proposalTop.append(label, mode);
  const proposalValues = document.createElement('div');
  proposalValues.className = 'proposal-values';
  proposalValues.append(
    valueBlock('Giá tham chiếu', number(proposal.referencePrice ?? row.lastPrice, 8)),
    valueBlock('Vùng hút mục tiêu', proposal.targetZone ? `${number(proposal.targetZone.price, 8)} (${percent(proposal.targetZone.distancePct)})` : '—', 'target'),
    valueBlock('Vùng rủi ro đối diện', proposal.riskZone ? `${number(proposal.riskZone.price, 8)} (${percent(proposal.riskZone.distancePct)})` : '—', 'risk'),
    valueBlock('Lệch trên / dưới', `${number(proposal.aboveScore)} / ${number(proposal.belowScore)}`),
  );
  const rationale = document.createElement('p');
  rationale.className = 'rationale';
  rationale.textContent = proposal.rationale || 'Chưa có dữ liệu structured; ảnh crop không được dùng để kết luận.';
  const confirmation = document.createElement('p');
  confirmation.className = 'confirmation';
  confirmation.textContent = proposal.confirmation || 'Đăng nhập phiên collector rồi cào lại.';
  proposalPanel.append(proposalTop, proposalValues, rationale, confirmation);

  const zones = Array.isArray(row.heatmap?.zones) ? row.heatmap.zones : [];
  const zonePanel = document.createElement('div');
  zonePanel.className = 'zones';
  zonePanel.append(
    zoneGroup('Cụm thanh lý phía trên', zones.filter((zone) => zone.side === 'ABOVE')),
    zoneGroup('Cụm thanh lý phía dưới', zones.filter((zone) => zone.side === 'BELOW')),
  );
  item.append(head, proposalPanel, zonePanel);
  return item;
}

function render(data) {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const failures = Array.isArray(data.failures) ? data.failures : [];
  const progress = data.progress || {};
  const auth = data.auth || {};
  const structured = rows.filter((row) => Number(row.heatmap?.liquidationCellCount) > 0).length;
  const longCount = rows.filter((row) => row.proposal?.action === 'WAIT_LONG_CONFIRMATION').length;
  const shortCount = rows.filter((row) => row.proposal?.action === 'WAIT_SHORT_CONFIRMATION').length;
  const waitCount = rows.length - longCount - shortCount;
  const excludedCount = Number(data.source?.binanceLiquidityExcluded || 0) + Number(data.source?.heatmapLiquidityExcluded || 0);

  elements.refresh.disabled = Boolean(data.running || data.loginRunning) || data.config?.enabled === false;
  elements.login.disabled = Boolean(data.running || data.loginRunning);
  elements.login.textContent = data.loginRunning ? 'Đang chờ đăng nhập…' : 'Đăng nhập cho collector';
  elements.status.textContent = data.loginRunning
    ? 'Cửa sổ CoinGlass riêng đã mở — hãy hoàn tất đăng nhập trên cửa sổ đó.'
    : data.running
      ? `Đang đọc ${progress.currentSymbol || 'CoinGlass Model 3'}…`
      : data.error
        ? `Lần đọc gần nhất lỗi: ${data.error}`
        : rows.length
          ? `${structured}/${rows.length} coin có dữ liệu vùng thanh lý · đã loại ${excludedCount} coin thiếu thanh khoản`
          : 'Chưa có dữ liệu vùng thanh lý hợp lệ.';
  elements.updated.textContent = data.updatedAt
    ? `Snapshot ${time(data.updatedAt)} · CoinGlass ${data.source?.range || '48h'} · BTC + thị trường đạt chuẩn liquidity`
    : `Version ${data.version || '—'}`;
  elements.auth.className = auth.altcoinAccess ? 'auth-text ok' : 'auth-text warn';
  elements.auth.textContent = auth.altcoinAccess
    ? `Collector đã đăng nhập và có quyền altcoin · kiểm tra ${time(auth.checkedAt)}`
    : auth.message || 'Chrome cá nhân và collector là hai profile khác nhau; hãy đăng nhập một lần cho collector.';

  elements.progressPanel.hidden = !data.running;
  if (data.running) {
    const total = Number(progress.total) || 20;
    const completed = Number(progress.completed) || 0;
    elements.progressSymbol.textContent = progress.currentSymbol ? `Đang xử lý ${progress.currentSymbol}` : 'Đang khởi tạo trình duyệt…';
    elements.progressCount.textContent = `${completed} / ${total}`;
    elements.progressBar.style.width = `${Math.min(100, (completed / total) * 100)}%`;
  }

  elements.summary.replaceChildren(
    metric('Có vùng structured', `${structured}`),
    metric('Ưu tiên canh long', `${longCount}`),
    metric('Ưu tiên canh short', `${shortCount}`),
    metric('Chờ / chưa đủ data', `${waitCount}`),
  );

  elements.failures.hidden = failures.length === 0;
  elements.failures.replaceChildren();
  if (failures.length) {
    const heading = document.createElement('strong');
    heading.textContent = `${failures.length} coin chưa đọc được structured data:`;
    elements.failures.append(heading);
    for (const failure of failures.slice(0, 12)) {
      const line = document.createElement('p');
      line.textContent = `${failure.symbol}: ${failure.error}`;
      elements.failures.append(line);
    }
  }

  elements.grid.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = data.running
      ? 'Các vùng giá sẽ xuất hiện sau khi lượt đọc hoàn tất.'
      : 'Bấm “Đăng nhập cho collector”, hoàn tất login, rồi bấm “Đọc lại coin thanh khoản”.';
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
    timer = setTimeout(load, data.running || data.loginRunning ? 3000 : 30000);
  } catch (error) {
    elements.status.textContent = `Không đọc được snapshot: ${error.message}`;
    timer = setTimeout(load, 10000);
  }
}

async function post(path, pendingMessage) {
  elements.status.textContent = pendingMessage;
  const response = await fetch(path, { method: 'POST' });
  const data = await response.json();
  if (!response.ok || (!data.accepted && !['already_running', 'login_running', 'refresh_running'].includes(data.reason))) {
    throw new Error(data.error || data.reason || `HTTP ${response.status}`);
  }
  await load();
}

elements.refresh.addEventListener('click', async () => {
  elements.refresh.disabled = true;
  try {
    await post('/api/coinglass-web-top20/refresh', 'Đang khởi động bộ đọc vùng thanh lý…');
  } catch (error) {
    elements.status.textContent = `Không thể chạy collector: ${error.message}`;
    elements.refresh.disabled = false;
  }
});

elements.login.addEventListener('click', async () => {
  elements.login.disabled = true;
  try {
    await post('/api/coinglass-web-top20/login', 'Đang mở cửa sổ đăng nhập riêng của collector…');
  } catch (error) {
    elements.status.textContent = `Không thể mở đăng nhập: ${error.message}`;
    elements.login.disabled = false;
  }
});

load();
