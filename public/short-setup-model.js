export const SHORT_SETUP_VERSION = 'STRUCTURE_SETUP_WATCH_V2_LONG_SHORT_DISCORD_20261011';
export const SHORT_SETUP_LEGACY_VERSION = 'SHORT_SETUP_WATCH_V1_PRICE_STRUCTURE_20261011';
export const SHORT_SETUP_PUSH_TYPE = 'BINANCE_SHORT_SETUP_WATCH';
export const SHORT_SETUP_PATTERNS = Object.freeze({
  FAILED_HIGH: 'Vượt đỉnh thất bại',
  BREAK_RETEST: 'Mất hỗ trợ · hồi thất bại',
  RESISTANCE_WATCH: 'Đang gần kháng cự',
  FAILED_LOW: 'Quét đáy · lấy lại hỗ trợ',
  BREAK_HOLD: 'Vượt kháng cự · retest giữ vùng',
  SUPPORT_WATCH: 'Đang gần hỗ trợ',
});
export function shortSetupStateLabel(e, state=e.state) {
  if(e.side!=='LONG')return SHORT_SETUP_STATES[state]??state;
  return ({WATCH:'Theo dõi hỗ trợ',WAIT_BREAK:'Chờ vượt đỉnh nến lấy lại hỗ trợ',
    WAIT_RETEST:'Chờ retest giữ kháng cự đã vượt',READY:'Đã kích hoạt LONG tham khảo',
    INVALIDATED:'Mất căn cứ LONG'})[state]??SHORT_SETUP_STATES[state]??state;
}
export const SHORT_SETUP_STATES = Object.freeze({
  WATCH: 'Theo dõi kháng cự', WAIT_BREAK: 'Chờ phá đáy nến từ chối',
  WAIT_RETEST: 'Chờ hồi kiểm tra hỗ trợ đã mất', READY: 'Đã kích hoạt SHORT tham khảo',
  CHASE: 'Giá đã đi xa · không ưu tiên đuổi', INVALIDATED: 'Mất căn cứ SHORT',
  EXPIRED: 'Hết thời gian theo dõi', DATA_GAP: 'Gián đoạn dữ liệu',
});
const priority = {READY: 4, WAIT_BREAK: 3, WAIT_RETEST: 2, WATCH: 1};
export function rankShortSetups(rows = []) {
  const order = e => e.state==='READY'&&e.priorityEligible ? 5 : priority[e.state] ?? 0;
  return [...rows].sort((a,b) => order(b) - order(a)
    || (b.score ?? 0) - (a.score ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    || String(a.symbol).localeCompare(String(b.symbol)));
}
