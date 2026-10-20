export const HEATMAP_PRICE_PUSH_UI_VERSION = 'HEATMAP_PRICE_PUSH_UI_V1_20261018';
const ENDPOINT = '/api/manual-price-push-alerts';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price = value => value != null && Number.isFinite(Number(value))
  ? Number(value).toLocaleString('en-US', {maximumSignificantDigits:12}) : '—';
const time = value => value ? new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'}) + ' VN' : '—';

export function mountHeatmapPriceAlerts() {
  const $ = id => document.getElementById(id), host = $('price-alerts');
  let selection = null, lastSymbol = null, snapshot = null, busy = false, reading = false, revision = 0, controller = null;
  const selectedId = new URLSearchParams(location.search).get('alert');
  function syncButtons() {
    for (const button of host.querySelectorAll('[data-price-alert-action]')) button.disabled = busy;
    $('priceAlertAdd').disabled = busy || !selection;
    $('priceAlertTarget').disabled = busy || !selection;
    $('priceAlertRefresh').disabled = busy || reading;
  }
  function delivery(alert) {
    if (alert.status === 'ACTIVE') return 'Đang chờ MARK chạm/cắt mốc · chưa gửi';
    const p = alert.pushResult;
    if (p?.skipped === 'QUIET_HOURS') return 'Giờ yên lặng · không gửi và không phát bù';
    if (p?.sent > 0) return `Đã gửi ${p.sent} thiết bị${p.failed ? ` · lỗi ${p.failed}` : ''}`;
    if (p?.failed || p?.error) return 'Gửi Push lỗi · không tự gửi lại';
    if (p?.attempted === 0) return 'Không có thiết bị nhận Push';
    return 'Chưa có kết quả gửi xác nhận';
  }
  function render() {
    const all = snapshot?.alerts ?? [], filter = $('priceAlertScope').value;
    const alerts = filter === 'all' ? all : all.filter(a => a.symbol === selection?.symbol);
    $('priceAlertCount').textContent = snapshot
      ? `${alerts.filter(a => a.status === 'ACTIVE').length} đang chờ · ${alerts.filter(a => a.status === 'TRIGGERED').length} đã chạm · toàn hệ thống ${snapshot.activeCount}/${snapshot.maxActive ?? 50} đang chờ`
      : 'Chưa tải danh sách cảnh báo';
    $('priceAlertRows').innerHTML = alerts.map(a => {
      const active = a.status === 'ACTIVE', direction = a.direction === 'UP' ? '↑ Cắt lên' : a.direction === 'DOWN' ? '↓ Cắt xuống' : a.direction === 'AT_TARGET' ? 'Đang ở mốc' : 'Chờ tick để xác định hướng';
      return `<article class="price-alert-row${a.id === selectedId ? ' is-selected' : ''}" data-alert-id="${esc(a.id)}"><div class="price-alert-row-heading"><strong>${esc(a.symbol)} · mốc ${esc(price(a.targetPrice))}</strong><span class="price-alert-state" data-active="${active}">${active ? 'ĐANG CHỜ' : 'ĐÃ CHẠM'}</span></div><div class="price-alert-values"><div>MARK hiện tại <b>${esc(price(a.currentPrice))}</b><small>${a.currentPriceAt ? esc(time(a.currentPriceAt)) : 'Chưa có tick mới; giá lưu/tham chiếu nếu có'}</small></div><div>Hướng theo dõi <b>${direction}</b><small>MARK tham chiếu ${esc(price(a.referencePrice))}</small></div><div>${esc(delivery(a))}<small>${active ? 'Tạo ' + esc(time(a.createdAt)) : 'Chạm ' + esc(time(a.triggeredAt)) + ' · MARK ' + esc(price(a.triggerPrice))}</small></div></div><div class="price-alert-actions">${active ? '' : `<button type="button" data-price-alert-action="rearm" data-id="${esc(a.id)}">Bật lại</button>`}<button class="secondary" type="button" data-price-alert-action="remove" data-id="${esc(a.id)}">Xóa</button></div></article>`;
    }).join('') || `<p class="price-alert-empty">${!snapshot ? 'Chưa có dữ liệu đồng bộ.' : !selection && filter !== 'all' ? 'Tìm coin để xem cảnh báo của coin đó, hoặc chọn Tất cả coin.' : 'Chưa có cảnh báo trong danh sách đang xem.'}</p>`;
    syncButtons();
  }
  async function load() {
    if (busy || reading) return;
    reading = true; const token = ++revision; controller = new AbortController(); syncButtons();
    try {
      const r = await fetch(ENDPOINT, {cache:'no-store', signal:AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])});
      const data = await r.json();
      if (!r.ok || !Array.isArray(data.alerts)) throw Error(data.error ?? `HTTP ${r.status}`);
      if (token !== revision) return;
      snapshot = data; render(); $('priceAlertLoadState').textContent = `Đồng bộ ${time(data.generatedAt)} · tự cập nhật danh sách mỗi 30 giây`;
    } catch (error) {
      if (token === revision) $('priceAlertLoadState').textContent = `Chưa đồng bộ được: ${error.message}. Danh sách cũ (nếu có) chưa được cập nhật.`;
    } finally { if (token === revision) { reading = false; syncButtons(); } }
  }
  async function update(method, payload) {
    if (busy) return false;
    busy = true; ++revision; controller?.abort(); reading = false; syncButtons();
    $('priceAlertStatus').textContent = 'Đang lưu cảnh báo…';
    try {
      const r = await fetch(ENDPOINT, {method, headers:{'content-type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(12000)});
      const data = await r.json();
      if (!r.ok) throw Error(data.error ?? `HTTP ${r.status}`);
      if (!Array.isArray(data.snapshot?.alerts)) throw Error('Phản hồi chưa xác nhận được kết quả');
      snapshot = data.snapshot; render();
      $('priceAlertLoadState').textContent = `Đồng bộ ${time(snapshot.generatedAt)}`;
      $('priceAlertStatus').textContent = method === 'DELETE' ? 'Đã xóa cảnh báo.' : payload.action === 'rearm' ? 'Đã bật lại cảnh báo theo MARK hiện tại.' : `Đã lưu ${payload.symbol} tại ${price(payload.targetPrice)}. Server theo dõi ngay cả khi đóng trang.`;
      return true;
    } catch (error) {
      $('priceAlertStatus').textContent = `Chưa xác nhận cập nhật: ${error.message}. Bấm Làm mới danh sách trước khi thử lại; không tự gửi lại yêu cầu.`;
      return false;
    } finally { busy = false; syncButtons(); }
  }
  $('priceAlertForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!selection || busy) return;
    const q = {...selection}, targetPrice = Number($('priceAlertTarget').value);
    if (!(targetPrice > 0) || !Number.isFinite(targetPrice)) { $('priceAlertStatus').textContent = 'Giá cảnh báo phải là số lớn hơn 0.'; return; }
    if (await update('POST', {...q, targetPrice, sourcePage:'HEATMAP_LAB'})) {
      if (selection?.symbol === q.symbol && Number($('priceAlertTarget').value) === targetPrice) $('priceAlertTarget').value = '';
    }
  });
  $('priceAlertRows').addEventListener('click', event => {
    const b = event.target.closest('[data-price-alert-action]');
    if (!b || busy) return;
    if (b.dataset.priceAlertAction === 'remove') void update('DELETE', {id:b.dataset.id});
    if (b.dataset.priceAlertAction === 'rearm') void update('POST', {action:'rearm', id:b.dataset.id});
  });
  document.addEventListener('click', event => {
    const b = event.target.closest('[data-heatmap-alert-price]');
    if (!b || busy || !selection || b.dataset.symbol !== selection.symbol) return;
    const value = Number(b.dataset.heatmapAlertPrice);
    if (!(value > 0) || !Number.isFinite(value)) return;
    $('priceAlertTarget').value = String(value);
    $('priceAlertStatus').textContent = `Đã chọn mốc ${price(value)}; bấm Thêm cảnh báo để lưu. Đây không phải lệnh vào Binance.`;
    host.scrollIntoView({behavior:'smooth', block:'start'}); $('priceAlertTarget').focus({preventScroll:true});
  });
  $('priceAlertScope').addEventListener('change', render);
  $('priceAlertRefresh').addEventListener('click', () => void load());
  setInterval(() => { if (!document.hidden) void load(); }, 30000);
  render(); void load();
  return { setSelection(q) {
    selection = q ? {symbol:q.symbol, range:q.range} : null;
    $('priceAlertSymbol').value = selection?.symbol ?? '';
    if (q && q.symbol !== lastSymbol) { $('priceAlertTarget').value = ''; lastSymbol = q.symbol; $('priceAlertStatus').textContent = 'Nhập giá hoặc chọn mốc trong kịch bản, rồi bấm Thêm cảnh báo.'; }
    render();
  }};
}
