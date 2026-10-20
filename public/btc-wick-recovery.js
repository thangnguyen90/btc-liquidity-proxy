import { COIN_PUMP_WICK_LABELS as BTC_WICK_LABELS, coinPumpWickKey as btcWickKey } from './btc-wick-recovery-model.js?v=20261009-pump-v2';
import { installLiveCardWhitelistUi } from './live-card-whitelist-ui.js';
import './opposite-liquidity-toast.js?v=20261010-early-wick-v1';
const root=document.querySelector('#btc-wick-recovery');
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=6)=>v==null?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:n});
const time=v=>v>0?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
const statuses={WAIT_CONFIRM:'Sau cây xả · chờ lấy lại hỗ trợ',WAIT_DATA:'Chờ nến coin hợp lệ',CONFIRMED:'ĐÃ XÁC NHẬN HỒI',
  INVALIDATED:'Hủy · tạo đáy mới/rủi ro tăng',EXPIRED:'Hết 3 nến · chưa hồi',TOO_LATE:'Hồi quá xa · không đuổi',INTERRUPTED:'Gián đoạn · không phát lại'};
const delivery={QUIET_HOURS:'Giờ yên lặng · không gửi Push',SENT:'Đã gửi',PARTIAL:'Gửi một phần · có thiết bị lỗi',FAILED:'Gửi lỗi/chưa rõ kết quả',NO_SUBSCRIBERS:'Chưa có thiết bị đăng ký',NOT_CONFIGURED:'Chưa cấu hình',DISABLED:'Loại này đang tắt',STALE:'Quá cũ · không gửi',UNKNOWN_AFTER_RESTART:'Chưa rõ kết quả sau restart',POSTING:'Đang gửi',SAME_CONFIRMATION:'Cùng nến xác nhận · đã gộp'};
const whitelist=installLiveCardWhitelistUi({page:'coin-pump-wick-recovery',label:'Sóng bơm → quét sâu rồi hồi · quan sát',root:root??document});
const target=new URLSearchParams(location.search).get('wick');let busy=false,focused=false;
export function renderWickRecovery(data={}) {
  if(!root)return;
  const c=data.coverage??{},counts=data.counts??{};
  root.querySelector('[data-wick-status]').textContent=data.error??
    `CŨ · Theo dõi ${c.ready??0}/${c.total??0} coin đủ 31 nến 1m · sóng bơm trước nến mới nhất ${c.pumping??0} · không cần BTC giảm · Discord ${data.discordConfigured?'ON':'chưa cấu hình'} · ${time(c.updatedAt)} (VN)`;
  const toggle=root.querySelector('[data-wick-enabled]');toggle.checked=data.enabled===true;toggle.disabled=Boolean(data.error);
  root.querySelector('[data-wick-counts]').textContent=`Mẫu sóng bơm lưu (14 ngày, tối đa 10.000): xác nhận ${counts.CONFIRMED??0} · hủy ${counts.INVALIDATED??0} · hết hạn ${counts.EXPIRED??0} · lịch sử BTC cũ ${data.legacyCount??0}. Không phải win rate/PnL.`;
  root.querySelector('[data-wick-cohorts]').innerHTML=Object.entries(BTC_WICK_LABELS).map(([key,label])=>
    `<article data-live-card-key="${btcWickKey(key)}" data-binance-card-avg-roe="" data-binance-card-avg-roe-eligible="false"><strong>${label}</strong><small>Chưa có lệnh CLOSED đối chiếu · không có AvgROE</small></article>`).join('');
  const rows=[...(data.history??[])];if(data.selected && !rows.some(e=>e.id===data.selected.id))rows.unshift(data.selected);
  root.querySelector('[data-wick-history]').innerHTML=rows.slice(0,101).map(e=>`<article class="wick-event ${e.id===target?'wick-selected':''}" data-wick-id="${esc(e.id)}">
    <header><strong>${esc(e.symbol)} · ${esc(statuses[e.status]??'Dữ liệu cũ')}</strong><time>${esc(time(e.confirmedAt??e.sweepAt))}</time></header>
    <p>${esc(e.contextMode==='COIN_PUMP'?(BTC_WICK_LABELS[e.pattern]??'Sau cây xả sâu'):'LỊCH SỬ RULE CŨ · BTC giảm + altcoin hồi')} · ${esc(e.reason??'Chờ nến đóng lấy lại vùng')}</p>
    <p>Đáy quét <b>${num(e.sweepLow)}</b> · vùng lấy lại <b>${num(e.level)}</b> · xác nhận <b>${num(e.price)}</b></p>
    <small>${e.contextMode==='COIN_PUMP'?`Sóng bơm +${num(e.pump?.waveGainPct,2)}% · volume sóng ${num(e.pump?.waveVolumeRatio,2)}× nền · cây xả sâu ${num(e.highToLowDropPct,2)}% · volume xả ${num(e.pump?.killVolumeRatio,2)}× sóng · không cần BTC giảm`:
      `BTC cũ · 5m ${num(e.btc?.return5m,2)}% · không tính vào mẫu sóng bơm mới`} · mua chủ động ${num(e.takerBuy==null?null:e.takerBuy*100,1)}% · ${esc(delivery[e.delivery?.status]??'Chưa gửi push')} · Discord ${esc(delivery[e.discordDelivery?.status]??'Chưa gửi/legacy')}</small>
    ${e.contextMode==='COIN_PUMP'&&e.status==='CONFIRMED'?`<p>Hồi ${num(e.reboundPct,2)}% từ đáy râu · không có nghĩa nên LONG ngay. Có thể là nến đỏ rút râu; không yêu cầu BTC/ratio/OI.</p>`:''}
    ${e.status==='CONFIRMED'?`<p>Quan sát từ nến kế tiếp: ${esc(time(e.nextCandleAt))}; hủy nếu mất đáy ${num(e.sweepLow)}. Không phải lệnh đã khớp.</p>`:''}
    ${e.followUp?`<p class="wick-risk">${esc(e.followUp.reason)} · ${esc(time(e.followUp.at))}</p>`:''}
    <a href="/local-ai-trend-evaluation?wick=${encodeURIComponent(e.id)}#btc-wick-recovery">Mở tín hiệu cụ thể</a></article>`).join('')||'<p>Chưa có setup mới kể từ lúc detector chạy.</p>';
  whitelist?.decorate?.();
  if(target && !focused){const row=[...root.querySelectorAll('[data-wick-id]')].find(r=>r.dataset.wickId===target);if(row){root.querySelector('[data-wick-history-details]').open=true;row.scrollIntoView({block:'center'});focused=true;}}
}
async function refresh(){
  if(!root||busy||document.hidden)return;busy=true;
  try{const response=await fetch(`/api/btc-wick-recovery${target?`?wick=${encodeURIComponent(target)}`:''}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error();renderWickRecovery(await response.json());
  }catch{root.querySelector('[data-wick-status]').textContent='Không lấy được dữ liệu mới · không coi trạng thái cũ là tín hiệu mới';}
  finally{busy=false;}
}
if(root){
  root.querySelector('[data-wick-enabled]').addEventListener('change',async event=>{
    const toggle=event.target;toggle.disabled=true;
    try{const response=await fetch('/api/btc-wick-recovery',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:toggle.checked})});
      if(!response.ok)throw new Error();renderWickRecovery(await response.json());
    }catch{toggle.checked=!toggle.checked;root.querySelector('[data-wick-status]').textContent='Không lưu được bật/tắt push · thử lại';}
    finally{toggle.disabled=false;}
  });
  void refresh();setInterval(refresh,10_000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
}
