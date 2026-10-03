const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '—').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const finite = value => value === null || value === undefined || value === ''
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const number = (value, digits = 2) => finite(value) == null ? '—' : finite(value).toLocaleString('en-US', {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
});
const price = value => finite(value) == null ? '—' : finite(value).toLocaleString('en-US', { maximumSignificantDigits: 9 });
const money = value => finite(value) == null ? '—' : `${finite(value) > 0 ? '+' : ''}${number(value, 4)} USDT`;
const pct = value => finite(value) == null ? '—' : `${finite(value) > 0 ? '+' : ''}${number(value, 2)}%`;
const time = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const statusLabels = { ACTIVE: 'ĐANG CÓ VỊ THẾ', CLOSED: 'ĐÃ ĐÓNG', OPEN_UNCONFIRMED: 'KHÔNG THẤY VỊ THẾ' };
let snapshot = null;
let page = 1;
let expanded = null;
let requestController = null;
let searchTimer = null;

function params() {
  const value = new URLSearchParams({
    search: $('#search').value.trim(),
    status: $('#statusFilter').value,
    direction: $('#direction').value,
    outcome: $('#outcome').value,
    signalType: $('#signalType').value,
    from: $('#from').value,
    to: $('#to').value,
    sort: $('#sort').value,
    page: String(page),
    pageSize: $('#pageSize').value,
  });
  for (const [key, item] of [...value.entries()]) if (!item) value.delete(key);
  return value;
}

function pnlHtml(row) {
  if (row.pnlUsdt == null) return '<span class="warning">Chưa xác định</span><small>Không suy đoán PnL</small>';
  const klass = row.pnlUsdt >= 0 ? 'positive' : 'negative';
  return `<span class="pnl ${klass}">${money(row.pnlUsdt)}</span><small>ROE ${pct(row.roePct)}<br>${row.pnlKind === 'REALIZED_NET' ? 'Net realized Binance' : 'Unrealized phân bổ'}</small>`;
}

function detailHtml(row) {
  const live = row.livePosition;
  return `<tr class="detail-row"><td colspan="8"><div class="detail-grid">
    <section class="reason"><h3>Lý do / combo lúc vào</h3><p>${escape(row.entryReason || 'Không có mô tả')}</p><p class="muted">${escape(row.signalCombo || 'Không lưu combo')}</p></section>
    <section><h3>Kế hoạch entry</h3><p>Signal entry: <b>${price(row.signalEntryPrice)}</b><br>TP: <b>${price(row.takeProfitPrice)}</b><br>SL: <b>${row.stopLossSuppressed ? 'SUPPRESSED' : price(row.stopLossPrice)}</b></p></section>
    <section><h3>Nguồn</h3><p>${escape(row.signalSource)}<br>${escape(row.executionPage)}<br>${escape(row.streamId)}</p><p class="muted">Metadata ${escape(row.metadataQuality)}</p></section>
    <section><h3>Vị thế Binance hiện tại</h3><p>${live ? `Entry tổng: <b>${price(live.entryPrice)}</b><br>MARK: <b>${price(live.markPrice)}</b><br>Liquidation: <b>${price(live.liquidationPrice)}</b><br>PnL tổng: <b>${money(live.unrealizedPnlUsdt)}</b>` : 'Không có snapshot vị thế active.'}</p>${live ? `<p class="muted">Fill nhận ${number(live.allocationPct,1)}% PnL theo notional · audited qty / position ${number(live.auditedQtyCoveragePct,1)}% · ${escape(live.pnlSource)}</p>` : ''}</section>
    <section><h3>Đóng lệnh</h3><p>Thời gian: <b>${time(row.closedAt)}</b><br>Giá thoát TB: <b>${price(row.exitAvgPrice)}</b><br>Lý do: <b>${escape(row.closeReason)}</b><br>Order: ${escape(row.closeOrderIds?.join(', ') || row.closeClientOrderId)}</p></section>
    <section><h3>Chi tiết PnL đã đóng</h3><p>Gross: <b>${money(row.grossRealizedPnlUsdt)}</b><br>Commission: <b>${money(row.commissionUsdt == null ? null : -Math.abs(row.commissionUsdt))}</b><br>Funding: <b>${money(row.fundingPnlUsdt)}</b><br>Net: <b>${money(row.netRealizedPnlUsdt)}</b></p></section>
    <section><h3>Khóa audit</h3><p>Lifecycle: ${escape(row.lifecycleId || row.closeGroupId)}<br>Matched: ${escape(row.matchedKeys?.join(' · '))}</p></section>
  </div></td></tr>`;
}

function rowHtml(row) {
  const key = `${row.orderId ?? ''}|${row.clientOrderId ?? ''}|${row.filledAt}`;
  const directionClass = row.direction === 'LONG' ? 'long' : 'short';
  const statusClass = row.displayStatus === 'ACTIVE' ? 'active' : row.displayStatus === 'CLOSED' ? 'closed' : 'unconfirmed';
  const mark = row.livePosition?.markPrice;
  const entry = row.avgFillPrice ?? row.signalEntryPrice;
  return `<tr><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(row.symbol)}">${escape(row.symbol)}</a><br><span class="pill ${directionClass}">${escape(row.direction)}</span><span class="pill ${statusClass}">${statusLabels[row.displayStatus] ?? escape(row.displayStatus)}</span>${row.isDca ? '<span class="pill warning">DCA</span>' : ''}<small>${escape(row.outcome || '')}</small></td>
    <td>${time(row.filledAt)}<small>${row.closedAt ? `Đóng ${time(row.closedAt)}` : 'Chưa có close audit'}</small></td>
    <td><b>${escape(row.signalType)}</b><small>${escape(row.signalLabel)}<br>${escape(row.signalSource)}</small></td>
    <td>Entry <b>${price(entry)}</b><small>${mark != null ? `MARK ${price(mark)}<br>Entry vị thế ${price(row.livePosition?.entryPrice)}` : `Exit ${price(row.exitAvgPrice)}`}</small></td>
    <td>${money(row.marginUsdt)}<small>${number(row.leverage,0)}x · notional ${money(row.filledNotionalUsdt)}<br>Qty ${number(row.filledQty,8)}</small></td>
    <td>${pnlHtml(row)}</td>
    <td>#${escape(row.orderId)}<small>${escape(row.clientOrderId)}<br>${escape(row.orderType)}</small></td>
    <td><button type="button" class="detail-button" data-key="${escape(key)}">Chi tiết</button><small><a href="https://www.binance.com/vi/futures/${encodeURIComponent(row.symbol)}" target="_blank" rel="noreferrer">Binance ↗</a></small></td></tr>${expanded === key ? detailHtml(row) : ''}`;
}

function render() {
  if (!snapshot) return;
  const summary = snapshot.summary;
  $('#status').textContent = `Cập nhật ${time(snapshot.generatedAt)} · ${snapshot.pagination.totalRows} fill phù hợp`;
  $('#coverage').textContent = `${snapshot.positionSnapshot.count} vị thế Binance active · nguồn ${snapshot.positionSnapshot.sources.join(', ') || 'không có'}${snapshot.positionsError ? ` · lỗi position: ${snapshot.positionsError}` : ''} · READ ONLY`;
  $('#totalRecords').textContent = number(summary.records, 0);
  $('#activeCount').textContent = number(summary.activeRecords, 0);
  $('#activeSymbols').textContent = `${summary.activeSymbols} vị thế coin/hướng`;
  $('#openPnl').textContent = money(summary.allocatedUnrealizedPnlUsdt);
  $('#openPnl').className = summary.allocatedUnrealizedPnlUsdt >= 0 ? 'positive' : 'negative';
  $('#closedCount').textContent = number(summary.closedLifecycles, 0);
  $('#closedRecords').textContent = `${summary.closedRecords} fill đã đóng`;
  $('#closedPnl').textContent = money(summary.realizedNetPnlUsdt);
  $('#closedPnl').className = summary.realizedNetPnlUsdt >= 0 ? 'positive' : 'negative';
  $('#winRate').textContent = summary.winRatePct == null ? '—' : `${number(summary.winRatePct,1)}%`;
  $('#winLoss').textContent = `${summary.wins} thắng · ${summary.losses} thua · ${summary.breakeven} hòa`;
  const selectedType = $('#signalType').value;
  $('#signalType').innerHTML = '<option value="">Tất cả loại tín hiệu</option>' + snapshot.facets.signalTypes.map(item => `<option value="${escape(item.value)}">${escape(item.value)} (${item.count})</option>`).join('');
  $('#signalType').value = selectedType;
  $('#rows').innerHTML = snapshot.rows.map(rowHtml).join('') || '<tr><td colspan="8" class="empty">Không có lệnh phù hợp bộ lọc</td></tr>';
  const pagination = snapshot.pagination;
  page = pagination.page;
  $('#pageInfo').textContent = `Trang ${pagination.page}/${pagination.totalPages} · ${pagination.totalRows} dòng`;
  $('#previous').disabled = pagination.page <= 1;
  $('#next').disabled = pagination.page >= pagination.totalPages;
}

async function load() {
  requestController?.abort();
  requestController = new AbortController();
  $('#refresh').disabled = true;
  document.body.classList.add('loading');
  try {
    const response = await fetch(`/api/binance-signal-orders?${params()}`, {
      cache: 'no-store', signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(20_000)]),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot = await response.json();
    render();
  } catch (error) {
    if (error.name !== 'AbortError') $('#status').textContent = `Không tải được: ${error.message}`;
  } finally {
    $('#refresh').disabled = false;
    document.body.classList.remove('loading');
  }
}

$('#refresh').addEventListener('click', load);
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer); page = 1; expanded = null; searchTimer = setTimeout(load, 300);
});
for (const id of ['statusFilter','direction','outcome','signalType','from','to','sort','pageSize']) {
  $(`#${id}`).addEventListener('change', () => { page = 1; expanded = null; load(); });
}
$('#previous').addEventListener('click', () => { page -= 1; expanded = null; load(); });
$('#next').addEventListener('click', () => { page += 1; expanded = null; load(); });
$('#rows').addEventListener('click', event => {
  const button = event.target.closest('[data-key]');
  if (!button) return;
  expanded = expanded === button.dataset.key ? null : button.dataset.key;
  render();
});
await load();
setInterval(() => { if (!document.hidden) load(); }, 30_000);
