import {COIN_PUMP_WICK_EARLY_VERSION, COIN_PUMP_WICK_EARLY_LABEL} from '../public/coin-pump-wick-early-model.js';
import {COIN_PUMP_WICK_LABELS} from '../public/btc-wick-recovery-model.js';
export const COIN_PUMP_WICK_DISCORD_VERSION = 'COIN_PUMP_WICK_DISCORD_V1_EARLY_AND_CONFIRMED_20261010';
const fmt = (n, d = 6) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', {maximumFractionDigits:d}) : '—';
export function buildCoinPumpWickDiscordPayload(e, baseUrl = 'https://liquidity.nhathadev.trade') {
  const early = e.version === COIN_PUMP_WICK_EARLY_VERSION;
  const detectedAt = early ? e.detectedAt : e.confirmedAt;
  const query = early ? `earlyWick=${encodeURIComponent(e.id)}#coin-pump-wick-early` : `wick=${encodeURIComponent(e.id)}#btc-wick-recovery`;
  return {username:'AI Local · Sóng bơm & rút râu', allowed_mentions:{parse:[]}, embeds:[{
    title:`${early ? '🟠 ' + COIN_PUMP_WICK_EARLY_LABEL : '🟢 CŨ · ĐÃ HỒI XÁC NHẬN'} · ${e.symbol}`,
    color:early ? 0xffad33 : 0x20d6a1,
    description:early ? 'NẾN 1M ĐÃ ĐÓNG · CẢNH BÁO RÚT RÂU SỚM. Phát ngay khi cây xả sâu rút râu; KHÔNG chờ lấy lại hỗ trợ, KHÔNG xác nhận xu hướng hồi. Có nhánh Binance riêng cần pass ratio và route ON; cảnh báo này không xác nhận đã khớp lệnh.'
      : `NẾN 1M ĐÃ ĐÓNG · OBSERVE ONLY. ${COIN_PUMP_WICK_LABELS[e.pattern] ?? 'Đã lấy lại hỗ trợ'}; đã đạt điều kiện hồi của rule cũ.`,
    fields:[
      {name:'SÓNG BƠM TRƯỚC CÂY XẢ', value:early
        ? `${e.pump.lookbackMinutes} phút · lên đỉnh +${fmt(e.pump.waveGainPct,2)}% · volume ${fmt(e.pump.waveVolumeRatio,2)}× nền. Đỉnh ${fmt(e.pump.peak)}; đã điều chỉnh ${fmt(e.pump.drawdownPct,2)}% trước xả.`
        : `10 phút · +${fmt(e.pump.waveGainPct,2)}% · volume ${fmt(e.pump.waveVolumeRatio,2)}× nền.`},
      {name:'CÂY XẢ / RÚT RÂU', value:`Đỉnh ${fmt(e.sweepHigh)} → đáy ${fmt(e.sweepLow)} → đóng ${fmt(e.price)}\nHigh→low ${fmt(e.highToLowDropPct,2)}% · râu dưới ${fmt(e.wickPct,2)}% · hồi từ đáy ${fmt(e.reboundPct,2)}%`},
      {name:'HỖ TRỢ / PHÂN LOẠI', value:`Hỗ trợ trước xả ${fmt(e.level)} · ${e.price >= e.level ? 'đã đóng lấy lại' : 'chưa lấy lại'}\n${early ? 'RÚT RÂU SỚM ≠ ĐÃ HỒI XÁC NHẬN. Giá vẫn có thể tiếp tục giảm.' : 'Đã hồi xác nhận theo rule cũ; không đảm bảo tiếp tục tăng.'}`},
      {name:'BINANCE', value:early?'Nhánh thử nghiệm LONG 3 USDT margin ×5: ratio tài khoản top trader 5m đi ngang 30m (biên ≤5%), rồi giảm ≥10% so median nền trong ≤30m. TP +10% / SL −30% ROE neo giá khớp. Cần route/execution ON và đủ guard; không pass chỉ cảnh báo. Không SHORT, không sửa lệnh cũ. Xem nhật ký web để biết đã vào hay chưa.':'Không tự vào LONG/SHORT, không đóng lệnh, không đổi size/SL/TP.'},
      {name:'MỞ TÍN HIỆU', value:`[AI Local · tín hiệu cụ thể](${baseUrl.replace(/\/$/,'')}/local-ai-trend-evaluation?${query})`}
    ], timestamp:new Date(detectedAt).toISOString(), footer:{text:early ? COIN_PUMP_WICK_EARLY_VERSION : COIN_PUMP_WICK_DISCORD_VERSION}
  }]};
}
export function createCoinPumpWickDiscordSender({webhookUrl, baseUrl, fetchImpl = fetch} = {}) {
  if (!webhookUrl) return null;
  const url = new URL(webhookUrl.trim());
  if (url.protocol !== 'https:' || !['discord.com','discordapp.com'].includes(url.hostname)
    || !/^\/api\/webhooks\/\d+\/[^/]+$/.test(url.pathname)) throw new Error('Invalid coin pump wick Discord configuration');
  return async e => {
    try {
      const response = await fetchImpl(url.href, {method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify(buildCoinPumpWickDiscordPayload(e,baseUrl)), signal:AbortSignal.timeout(8000)});
      return {attempted:1, sent:response.ok ? 1 : 0, failed:response.ok ? 0 : 1, httpStatus:response.status};
    } catch {return {attempted:1, sent:0, failed:1, error:'DISCORD_FAILED_OR_UNKNOWN'};}
  };
}

// Both channel intents must already be saved. Failure of one channel never disables the other.
export async function deliverWickChannels(e, {pushSender, discordSender, now, payload}) {
  await Promise.all([['delivery',pushSender,payload], ['discordDelivery',discordSender,e]].map(async ([key,sender,body]) => {
    if (e[key]?.status !== 'POSTING' || !sender) return;
    if (now() - (e.detectedAt ?? e.confirmedAt) > 75_000) {e[key] = {status:'STALE'}; return;}
    try {
      const d = await sender(body);
      e[key] = {...d, status:d.skipped==='QUIET_HOURS'?'QUIET_HOURS':d.sent > 0 ? (d.failed > 0 ? 'PARTIAL' : 'SENT')
        : d.error || d.attempted > 0 ? 'FAILED' : 'NO_SUBSCRIBERS'};
    } catch {e[key] = {status:'FAILED', error:'DELIVERY_FAILED_OR_UNKNOWN'};}
  }));
}
