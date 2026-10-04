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
const price = value => finite(value) == null ? '—' : finite(value).toLocaleString('en-US', { maximumSignificantDigits: 10 });
const compactUsd = value => finite(value) == null ? '—' : `${new Intl.NumberFormat('en-US', {
  notation: 'compact', maximumFractionDigits: 2,
}).format(finite(value))} USDT`;
const time = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const duration = milliseconds => {
  const value = finite(milliseconds);
  if (value == null) return '—';
  const minutes = Math.max(0, Math.round(value / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} phút`;
};
const statusClass = value => /SUBMITTED|FILLED|NEW/.test(String(value).toUpperCase())
  ? 'good' : /ERROR|BLOCK|OFF|EXISTING|DEDUPE|CHANGED/.test(String(value).toUpperCase()) ? 'bad' : 'wait';

let snapshot = null;
let requestController = null;
let searchTimer = null;

function filterText(...values) {
  const needle = $('#search').value.trim().toLocaleUpperCase('vi');
  return !needle || values.filter(Boolean).join(' ').toLocaleUpperCase('vi').includes(needle);
}

function matchesSide(value) {
  return !$('#side').value || String(value).toUpperCase() === $('#side').value;
}

function trackHtml(track) {
  const isLong = track.side === 'LONG';
  const pending = track.pendingIntervals ?? [];
  const completed = track.completedIntervals ?? {};
  return `<tr><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(track.symbol)}">${escape(track.symbol)}</a><br><span class="pill ${isLong ? 'long' : 'short'}">${escape(track.side)}</span><small>${track.direction === 'ABOVE' ? 'Vượt trên → LONG' : 'Vượt dưới → SHORT'}</small></td>
    <td><b>${price(track.zone?.low)} – ${price(track.zone?.high)}</b><small>Giữa ${price(track.zone?.mid)}</small></td>
    <td>${price(track.markPriceAtAlert)}<small>${track.direction === 'ABOVE' ? 'vùng nằm phía trên MARK' : 'vùng nằm phía dưới MARK'}</small></td>
    <td><span class="progress ${pending.includes('5m') ? 'wait' : 'done'}">5m ${pending.includes('5m') ? 'đang chờ' : `✓ ${time(completed['5m'])}`}</span><span class="progress ${pending.includes('15m') ? 'wait' : 'done'}">15m ${pending.includes('15m') ? 'đang chờ' : `✓ ${time(completed['15m'])}`}</span></td>
    <td>Dominant <b>${number(track.dominantPct, 1)}%</b><small>score ${number(track.imbalanceScore, 1)}</small></td>
    <td>Arm ${time(track.alertAt)}<small>Cập nhật ${time(track.lastSeenAt)}<br>Còn ${duration(finite(track.expiresAt) - Date.now())}</small></td>
    <td><a href="https://www.binance.com/vi/futures/${encodeURIComponent(track.symbol)}" target="_blank" rel="noreferrer">Binance ↗</a></td></tr>`;
}

function recentHtml(event) {
  const execution = event.binanceExecution ?? {};
  const isLong = event.side === 'LONG';
  return `<tr><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(event.symbol)}">${escape(event.symbol)}</a><br><span class="pill ${isLong ? 'long' : 'short'}">${escape(event.side)}</span><small>${escape(event.direction)}</small></td>
    <td><b>${escape(event.interval)}</b><small>Breach ${time(event.breachAt)}<br>Latest ${time(event.latestClosedAt)}</small></td>
    <td>${price(event.zone?.low)} – ${price(event.zone?.high)}<small>Close breach ${price(event.breachClose)}<br>Latest ${price(event.latestClose)} · MARK ${price(event.markPrice)}</small></td>
    <td><b>${number(event.depth?.oppositeRatio, 3)}x</b><small>${escape(event.depth?.oppositeSide)} ${compactUsd(event.depth?.oppositeNotional)}<br>cùng phía ${compactUsd(event.depth?.sameSideNotional)}</small></td>
    <td><span class="pill ${statusClass(execution.status)}">${escape(String(execution.status ?? 'NO_CALLBACK').toUpperCase())}</span><small>${execution.orderId ? `Order #${escape(execution.orderId)}` : escape(execution.error || 'Không có order ID')}</small></td>
    <td>${time(event.sentAt)}<small>${escape(event.eventId)}</small></td>
    <td><a href="https://www.binance.com/vi/futures/${encodeURIComponent(event.symbol)}" target="_blank" rel="noreferrer">Binance ↗</a></td></tr>`;
}

function attemptHtml(attempt) {
  const isLong = attempt.side === 'LONG';
  return `<tr><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(attempt.symbol)}">${escape(attempt.symbol)}</a><br><span class="pill ${isLong ? 'long' : 'short'}">${escape(attempt.side)}</span></td>
    <td><span class="pill ${statusClass(attempt.status)}">${escape(attempt.status)}</span></td>
    <td>${escape(attempt.interval)}<small>${time(attempt.at)}<br>${escape(attempt.eventId)}</small></td>
    <td>${attempt.marginUsdt == null ? '—' : `${number(attempt.marginUsdt, 2)} USDT`}<small>${attempt.leverage == null ? '—' : `${number(attempt.leverage, 0)}x`}</small></td>
    <td>TP ${price(attempt.takeProfitPrice)}<small>SL ${attempt.stopLossSuppressed ? 'SUPPRESSED' : price(attempt.stopLossPrice)}${attempt.protectionSuppressedBySymbol ? '<br>FULL BYPASS theo coin' : ''}</small></td>
    <td>${attempt.orderId ? `#${escape(attempt.orderId)}` : '—'}<small>${escape(attempt.clientOrderId)}${attempt.error ? `<br><span class="bad-text">${escape(attempt.error)}</span>` : ''}${attempt.errorCode ? `<br>${escape(attempt.errorCode)}` : ''}</small></td></tr>`;
}

function priceAlertHtml(alert) {
  const active = alert.status === 'ACTIVE';
  const direction = alert.direction === 'UP' ? 'CẮT LÊN'
    : alert.direction === 'DOWN' ? 'CẮT XUỐNG'
      : alert.direction === 'AT_TARGET' ? 'ĐANG Ở MỐC' : 'ĐỢI GIÁ SOCKET';
  const push = alert.pushResult ?? {};
  const pushText = active ? 'CHƯA PHÁT'
    : push.sent > 0 ? `ĐÃ GỬI ${push.sent} THIẾT BỊ`
      : push.attempted === 0 ? 'KHÔNG CÓ THIẾT BỊ NHẬN'
        : push.failed ? `LỖI ${push.failed}` : 'ĐÃ XỬ LÝ';
  return `<tr><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(alert.symbol)}">${escape(alert.symbol)}</a><small>Tạo ${time(alert.createdAt)}</small></td>
    <td><b>${price(alert.targetPrice)}</b><small>Tham chiếu ${price(alert.referencePrice)}</small></td>
    <td><b>${price(alert.currentPrice)}</b><small>${alert.currentPriceAt ? `Socket ${time(alert.currentPriceAt)}` : 'Đang chờ tick Binance'}</small></td>
    <td><span class="pill ${alert.direction === 'DOWN' ? 'bad' : alert.direction === 'UP' ? 'good' : 'wait'}">${direction}</span></td>
    <td><span class="pill ${active ? 'wait' : push.sent > 0 ? 'good' : 'bad'}">${active ? 'ĐANG CHỜ' : 'ĐÃ CHẠM'}</span><small>${pushText}${alert.triggerPrice ? `<br>MARK kích hoạt ${price(alert.triggerPrice)}` : ''}</small></td>
    <td>${active ? `Arm ${time(alert.armedAt)}` : `Chạm ${time(alert.triggeredAt)}`}<small>${alert.triggerDirection ? `Hướng ${escape(alert.triggerDirection)}` : 'One-shot'}</small></td>
    <td><div class="row-actions">${active ? '' : `<button type="button" data-price-alert-action="rearm" data-alert-id="${escape(alert.id)}">Bật lại</button>`}<button class="danger-button" type="button" data-price-alert-action="remove" data-alert-id="${escape(alert.id)}">Xóa</button></div></td></tr>`;
}

function renderPriceAlerts() {
  const manager = snapshot?.priceAlerts ?? {};
  const alerts = manager.alerts ?? [];
  $('#priceAlertCount').textContent = `${manager.activeCount ?? 0} đang chờ · ${manager.triggeredCount ?? 0} đã chạm`;
  $('#priceAlertRows').innerHTML = alerts.map(priceAlertHtml).join('')
    || '<tr><td colspan="7" class="empty">Chưa có cảnh báo giá</td></tr>';
}

function renderRoutes(execution) {
  $('#masterState').innerHTML = `<span class="pill ${execution.masterEnabled ? 'good' : 'bad'}">MASTER ${execution.masterEnabled ? 'ON' : 'OFF'}</span>${execution.failClosed ? '<span class="pill bad">FAIL CLOSED</span>' : ''}`;
  $('#routes').innerHTML = (execution.routes ?? []).map(route => `<article class="route-card ${route.enabled ? 'route-on' : 'route-off'}"><div><span class="pill ${route.side === 'LONG' ? 'long' : 'short'}">${escape(route.side)}</span><strong>${route.enabled ? 'ĐANG CHO PHÉP VÀO' : 'ĐANG TẮT'}</strong></div><p>${escape(route.signalLabel)}</p><small>${number(route.marginUsdt, 0)} USDT × ${number(route.leverage, 0)} · TP ${number(route.takeProfitRoePct, 0)}% ROE<br>Bật lúc ${time(route.enabledAt)}</small></article>`).join('');
}

function render() {
  if (!snapshot) return;
  const scanner = snapshot.scanner ?? {};
  const execution = snapshot.execution ?? {};
  const last = scanner.lastScan;
  $('#status').textContent = `Scanner ${scanner.enabled ? 'ON' : 'OFF'} · Discord ${scanner.configured ? 'READY' : 'CHƯA CẤU HÌNH'} · cập nhật ${time(snapshot.generatedAt)}`;
  $('#scanDetail').textContent = last
    ? `Vòng gần nhất: phát hiện ${last.detected ?? 0}, phân tích ${last.analyzedSymbols ?? 0} coin, đạt ${last.qualified ?? 0}, chọn ${last.selected ?? 0}, hoãn ${last.deferredQualified ?? 0}, gửi ${last.sent ?? 0} · batch ${scanner.analysisBatchSize}, tối đa gửi ${scanner.maxDeliveriesPerScan}/vòng · ${time(last.completedAt)}`
    : `Chưa có telemetry vòng quét kể từ lần service khởi động này · batch ${scanner.analysisBatchSize}, tối đa gửi ${scanner.maxDeliveriesPerScan}/vòng`;
  $('#tracked').textContent = number(scanner.tracked, 0);
  $('#trackedSymbols').textContent = `${number(scanner.trackedSymbols, 0)} coin · trên ${number(scanner.aboveTracks, 0)} / dưới ${number(scanner.belowTracks, 0)}`;
  $('#pending5m').textContent = number(scanner.pending5m, 0);
  $('#pending15m').textContent = number(scanner.pending15m, 0);
  $('#recentCount').textContent = number(scanner.recent?.length, 0);
  $('#submitted').textContent = number(execution.submittedAttempts, 0);
  $('#errors').textContent = number(execution.errorAttempts, 0);
  $('#errors').className = execution.errorAttempts > 0 ? 'negative' : 'positive';
  renderRoutes(execution);
  renderPriceAlerts();

  const side = $('#side').value;
  const interval = $('#interval').value;
  const requiredPending = $('#trackState').value;
  const tracks = (scanner.tracks ?? []).filter(track => matchesSide(track.side)
    && (!interval || track.pendingIntervals?.includes(interval) || track.completedIntervals?.[interval])
    && (!requiredPending || track.pendingIntervals?.includes(requiredPending))
    && filterText(track.symbol, track.side, track.direction, track.key));
  $('#trackCount').textContent = `${tracks.length}/${scanner.tracks?.length ?? 0} track phù hợp`;
  $('#trackRows').innerHTML = tracks.map(trackHtml).join('') || '<tr><td colspan="7" class="empty">Không có vùng đang chờ phù hợp bộ lọc</td></tr>';

  const recent = (scanner.recent ?? []).filter(event => matchesSide(event.side)
    && (!interval || event.interval === interval)
    && filterText(event.symbol, event.side, event.interval, event.eventId, event.binanceExecution?.status, event.binanceExecution?.error, event.binanceExecution?.orderId));
  $('#recentLabel').textContent = `${recent.length}/${scanner.recent?.length ?? 0} tín hiệu phù hợp`;
  $('#recentRows').innerHTML = recent.map(recentHtml).join('') || '<tr><td colspan="7" class="empty">Chưa có tín hiệu đã phát phù hợp</td></tr>';

  const attempts = (execution.attempts ?? []).filter(attempt => matchesSide(attempt.side)
    && (!interval || attempt.interval === interval)
    && filterText(attempt.symbol, attempt.side, attempt.interval, attempt.eventId, attempt.status, attempt.error, attempt.errorCode, attempt.orderId, attempt.clientOrderId));
  $('#attemptLabel').textContent = `${attempts.length}/${execution.attempts?.length ?? 0} attempt phù hợp`;
  $('#attemptRows').innerHTML = attempts.map(attemptHtml).join('') || '<tr><td colspan="6" class="empty">Chưa có attempt Binance phù hợp</td></tr>';
}

async function updatePriceAlert(method, payload) {
  const button = $('#priceAlertAdd');
  button.disabled = true;
  $('#priceAlertStatus').textContent = 'Đang cập nhật cảnh báo giá…';
  try {
    const response = await fetch('/api/manual-price-push-alerts', {
      method,
      headers: { 'content-type':'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    snapshot.priceAlerts = data.snapshot;
    renderPriceAlerts();
    $('#priceAlertStatus').textContent = method === 'DELETE' ? 'Đã xóa cảnh báo.'
      : payload.action === 'rearm' ? 'Đã bật lại cảnh báo theo MARK hiện tại.'
        : 'Đã lưu. Binance socket đang theo dõi mốc giá này.';
    return true;
  } catch (error) {
    $('#priceAlertStatus').textContent = `Không cập nhật được: ${error.message}`;
    return false;
  } finally {
    button.disabled = false;
  }
}

async function load() {
  requestController?.abort();
  requestController = new AbortController();
  $('#refresh').disabled = true;
  document.body.classList.add('loading');
  try {
    const response = await fetch('/api/opposite-liquidity-manager', {
      cache: 'no-store',
      signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(20_000)]),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot = await response.json();
    render();
  } catch (error) {
    if (error.name !== 'AbortError') $('#status').textContent = `Không tải được màn hình quản lý: ${error.message}`;
  } finally {
    $('#refresh').disabled = false;
    document.body.classList.remove('loading');
  }
}

$('#refresh').addEventListener('click', load);
$('#priceAlertForm').addEventListener('submit', async event => {
  event.preventDefault();
  const symbol = $('#priceAlertSymbol').value.trim();
  const targetPrice = $('#priceAlertTarget').value;
  if (await updatePriceAlert('POST', { symbol, targetPrice })) $('#priceAlertTarget').value = '';
});
$('#priceAlertRows').addEventListener('click', event => {
  const button = event.target.closest('[data-price-alert-action]');
  if (!button) return;
  const action = button.dataset.priceAlertAction;
  const id = button.dataset.alertId;
  if (action === 'rearm') void updatePriceAlert('POST', { action, id });
  if (action === 'remove') void updatePriceAlert('DELETE', { id });
});
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 180);
});
for (const id of ['side', 'interval', 'trackState']) $(`#${id}`).addEventListener('change', render);
await load();
setInterval(() => { if (!document.hidden) load(); }, 30_000);
