import { IMPULSE_ENTRY_METHODS, impulseEntryCardKey } from './impulse-entry-model.js';
import { installLiveCardWhitelistUi } from './live-card-whitelist-ui.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const price = v => Number(v) > 0 ? Number(v).toLocaleString('en-US', { maximumSignificantDigits: 8 }) : '—';
const time = v => v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const STATUS = {
  WAITING: 'ĐANG THEO DÕI', READY: 'ĐÃ CÓ NẾN XÁC NHẬN', SENT: 'ĐÃ GỬI DISCORD',
  EXPIRED: 'HẾT HẠN', INVALIDATED: 'MẤT MỐC VÔ HIỆU',
  DELIVERY_UNKNOWN: 'CHƯA XÁC ĐỊNH KẾT QUẢ GỬI', DELIVERY_FAILED: 'GỬI DISCORD LỖI', SENDING: 'ĐANG GỬI',
};
const REASON = {
  WAIT_RETEST_OR_BASE: 'Chờ retest bật lại hoặc phá nền ngắn', DATA_GAP: 'Thiếu nến liên tục',
  INSUFFICIENT_TARGET_ROOM: 'Khoảng tới cản chưa đủ R:R', TIMEOUT_60M: 'Hết 60 phút theo dõi',
  PASS_EXPIRED: 'Điểm vào đã quá 90 giây', PASS_BEFORE_RESTART: 'Điểm vào trước khi bot khởi động lại',
  IMPULSE_INVALIDATED: 'Giá phá mốc vô hiệu của impulse', WAIT_LIVE: 'Chờ giá socket mới',
  STOP_BROKEN: 'Giá live phá mốc vô hiệu điểm vào', TRIGGER_LOST: 'Giá live mất mốc tiếp diễn',
  PRICE_TOO_FAR: 'Giá đã chạy xa điểm vào', LIVE_RR_TOO_LOW: 'R:R tại giá live chưa đạt 1,5',
  PASS: 'Đạt kiểm tra điểm vào', DISCORD_SENT: 'Lịch sử tại thời điểm gửi, không phải điểm vào live',
  DISCORD_RATE_LIMIT: 'Discord yêu cầu chờ', DISCORD_NETWORK_UNKNOWN: 'Mất phản hồi Discord',
};
let previous = '';
export function installImpulseEntryPanel() {
  const root = document.getElementById('impulse-entry-groups');
  root.innerHTML = ['LONG', 'SHORT'].flatMap(side => Object.entries(IMPULSE_ENTRY_METHODS).map(([method, name]) =>
    `<article data-live-card-key="${impulseEntryCardKey(side, method)}" data-binance-card-avg-roe=""><b class="${side.toLowerCase()}">${side} · ${name}</b><small>Chưa có thống kê lệnh đóng · WHITELIST tắt</small></article>`,
  )).join('');
  installLiveCardWhitelistUi({ page: 'btc-session', label: 'Điểm vào sau impulse', root });
}
export function renderImpulseEntryPanel(data, now = Date.now()) {
  const fresh = data?.evaluatedAt > 0 && now - data.evaluatedAt < 120_000;
  const counts = data?.counts ?? {};
  document.getElementById('impulse-entry-status').textContent = `${fresh ? 'Đang theo dõi' : 'Chờ dữ liệu mới'} · Discord ${data?.configured ? 'ON' : 'OFF'} · ${counts.WAITING ?? 0} chờ · ${counts.READY ?? 0} có xác nhận · ${counts.SENT ?? 0} đã gửi (tối đa 7 ngày) · cập nhật ${time(data?.evaluatedAt)}`;
  const html = (data?.records ?? []).map(r => {
    const passFresh = fresh && r.status === 'READY' && r.reason === 'PASS'
      && now - r.plan?.passedAt <= 90_000 && r.liveAt > 0 && now - r.liveAt <= 15_000;
    return `<tr class="${passFresh ? r.side === 'LONG' ? 'context-long-ready' : 'context-short-ready' : ''}"><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(r.symbol)}">${esc(r.symbol)}</a><small class="${r.side === 'LONG' ? 'long' : 'short'}">${esc(r.side)}</small></td><td>${esc(STATUS[r.status] ?? r.status)}<small>${esc(REASON[r.reason] ?? r.reason)}</small></td><td>${esc(IMPULSE_ENTRY_METHODS[r.plan?.method] ?? 'Chờ hình thành')}</td><td>${price(r.plan?.entry)}<small>Live lúc đánh giá ${price(r.livePrice)}</small></td><td>${price(r.plan?.stop)} / ${price(r.plan?.target)}<small>Tham khảo · không phải SL/TP Binance</small></td><td>${r.plan?.rr ? Number(r.plan.rr).toFixed(2) : '—'}<small>${esc(r.btc?.direction ?? '—')} · ${esc(r.btc?.alignment ?? '—')}</small></td><td>${time(r.impulseAt)}<small>Đạt: ${time(r.plan?.passedAt)}</small></td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">Đang chờ impulse vàng/cam mới. Mỗi tín hiệu được theo dõi tối đa 60 phút.</td></tr>';
  if (html !== previous) { document.getElementById('impulse-entry-rows').innerHTML = html; previous = html; }
}
