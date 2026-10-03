import {
  LOW_SUPPLY_MARKET_UI_VERSION,
  describeLowSupplySort,
  filterLowSupplyRows,
  sortLowSupplyRows,
} from './low-supply-market-model.js';

const $ = (selector) => document.querySelector(selector);
let snapshot = null;
let loading = false;
let activeSortKey = 'circulating-asc';

function compact(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(number)}${suffix}`;
}

function pct(value, signed = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${signed && number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;',
  })[character]);
}

function controls() {
  return {
    minimumMarketCapUsd: Math.max(0, Number($('#minimum-cap').value) || 0) * 1_000_000_000,
    maximumCirculatingSupply: Math.max(0, Number($('#maximum-supply').value) || 0) * 1_000_000,
    query: $('#coin-query').value,
    sortKey: activeSortKey,
  };
}

function sortParts(sortKey) {
  const match = String(sortKey).match(/^(.*)-(asc|desc)$/);
  return match ? { column: match[1], direction: match[2] } : { column: 'circulating', direction: 'asc' };
}

function syncSortControl() {
  const select = $('#sort-key');
  select.querySelector('option[data-generated="true"]')?.remove();
  if (![...select.options].some((option) => option.value === activeSortKey)) {
    const option = new Option(`Đang xếp: ${describeLowSupplySort(activeSortKey)}`, activeSortKey, true, true);
    option.dataset.generated = 'true';
    select.append(option);
  }
  select.value = activeSortKey;
}

function renderSortHeaders() {
  const current = sortParts(activeSortKey);
  for (const header of document.querySelectorAll('th[data-sort-column]')) {
    const active = header.dataset.sortColumn === current.column;
    header.setAttribute('aria-sort', active ? (current.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    const indicator = header.querySelector('.sort-indicator');
    if (indicator) indicator.textContent = active ? (current.direction === 'asc' ? '↑' : '↓') : '↕';
    header.querySelector('button')?.classList.toggle('active', active);
  }
}

function render() {
  if (!snapshot) return;
  const values = controls();
  const rows = sortLowSupplyRows(filterLowSupplyRows(snapshot.rows, values), values.sortKey);
  $('#match-count').textContent = rows.length.toLocaleString('vi-VN');
  $('#match-rule').textContent = `Cap ≥${($('#minimum-cap').value || 0)}B · cung <${($('#maximum-supply').value || 0)}M`;
  $('#universe-count').textContent = Number(snapshot.universe?.binanceUsdtPerpetualCount ?? 0).toLocaleString('vi-VN');
  $('#coverage-count').textContent = Number(snapshot.universe?.providerCoverageCount ?? 0).toLocaleString('vi-VN');
  $('#coverage-pct').textContent = `${pct(snapshot.universe?.coveragePct)} độ phủ`;
  $('#missing-count').textContent = Number(snapshot.universe?.providerMissingCount ?? 0).toLocaleString('vi-VN');
  $('#table-title').textContent = `Danh sách theo ${describeLowSupplySort(values.sortKey)}`;
  syncSortControl();
  renderSortHeaders();
  const sourceState = $('#source-state');
  sourceState.className = `source-state ${String(snapshot.refreshStatus ?? '').toLowerCase()}`;
  sourceState.textContent = snapshot.refreshStatus === 'COMPLETE'
    ? 'NGUỒN ĐỦ BATCH'
    : snapshot.refreshStatus === 'PARTIAL' ? `THIẾU ${snapshot.batchErrors?.length ?? 0} BATCH` : 'CHỜ DỮ LIỆU';
  $('#rows').innerHTML = rows.length ? rows.map((row, index) => {
    const severity = ['critical','warning','watch','normal'].includes(row.classification?.severity)
      ? row.classification.severity : 'unknown';
    const sourceAt = row.sourceUpdatedAt ? new Date(row.sourceUpdatedAt).toLocaleString('vi-VN') : '—';
    const changeClass = Number(row.change24hPct) >= 0 ? 'positive' : 'negative';
    return `<tr class="${severity}">
      <td>${index + 1}</td>
      <td><a class="coin-link" href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">${escapeHtml(row.symbol)}</a><span class="coin-name">${escapeHtml(row.name)}</span></td>
      <td><span class="badge">${escapeHtml(row.classification?.label ?? '—')}</span></td>
      <td>${compact(row.marketCapUsd, ' USD')}</td>
      <td><strong>${compact(row.circulatingSupply, ' token')}</strong></td>
      <td>${compact(row.totalSupply, ' token')}</td>
      <td>${compact(row.maxSupply, ' token')}</td>
      <td>${pct(row.circulatingPctOfMax)}</td>
      <td>${compact(row.volume24hUsd, ' USD')}</td>
      <td>${pct(row.turnoverPct)}</td>
      <td class="${changeClass}">${pct(row.change24hPct, true)}</td>
      <td>${sourceAt}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="12">Không có coin nào đạt bộ lọc hiện tại trong phần dữ liệu đã phủ.</td></tr>';
  const fetched = snapshot.sourceFetchedAt ? new Date(snapshot.sourceFetchedAt).toLocaleString('vi-VN') : '—';
  $('#status').textContent = `${rows.length} coin đạt bộ lọc · phủ ${snapshot.universe?.providerCoverageCount ?? 0}/${snapshot.universe?.binanceUsdtPerpetualCount ?? 0} hợp đồng · nguồn ${fetched} · ${LOW_SUPPLY_MARKET_UI_VERSION}`;
  $('#status').className = snapshot.refreshStatus === 'PARTIAL' ? 'status panel error' : 'status panel';
}

async function load() {
  if (loading) return;
  loading = true;
  $('#refresh').disabled = true;
  $('#status').textContent = 'Đang đọc Binance universe và dữ liệu cung; lần đầu có thể mất vài giây…';
  $('#status').className = 'status panel';
  try {
    const response = await fetch(`/api/low-supply-market?t=${Date.now()}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    snapshot = data;
    render();
  } catch (error) {
    $('#status').textContent = `Không tải được thống kê cung: ${error.message}`;
    $('#status').className = 'status panel error';
  } finally {
    loading = false;
    $('#refresh').disabled = false;
  }
}

for (const selector of ['#minimum-cap','#maximum-supply','#coin-query']) {
  $(selector).addEventListener(selector === '#coin-query' ? 'input' : 'change', render);
}
$('#sort-key').addEventListener('change', (event) => {
  activeSortKey = event.currentTarget.value;
  render();
});
for (const button of document.querySelectorAll('th[data-sort-column] button')) {
  button.addEventListener('click', () => {
    const column = button.closest('th').dataset.sortColumn;
    const current = sortParts(activeSortKey);
    const defaultDirection = button.dataset.defaultDirection === 'desc' ? 'desc' : 'asc';
    const direction = current.column === column
      ? (current.direction === 'asc' ? 'desc' : 'asc')
      : defaultDirection;
    activeSortKey = `${column}-${direction}`;
    render();
  });
}
$('#refresh').addEventListener('click', load);
load();
setInterval(load, 10 * 60_000);
