import {COIN_PUMP_FLUSH_LABELS,coinPumpFlushKey} from './coin-pump-long-flush-model.js';
import {installLiveCardWhitelistUi} from './live-card-whitelist-ui.js';
import './opposite-liquidity-toast.js?v=20261009-flush-v1';
const root=document.querySelector('#coin-pump-long-flush');
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=6)=>v==null?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:n});
const time=v=>v>0?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
const deliveries={QUIET_HOURS:'Giờ yên lặng · không gửi Push',SENT:'Push đã gửi',PARTIAL:'Push một phần · có thiết bị lỗi',FAILED:'Push lỗi',NO_SUBSCRIBERS:'Chưa có thiết bị đăng ký',
  DISABLED:'Push loại này đang tắt',STALE:'Quá cũ · không gửi',POSTING:'Đang gửi',UNKNOWN_AFTER_RESTART:'Chưa rõ kết quả sau restart',
  RECOVERY_CHANNEL:'Đã chuyển cảnh báo hồi sang card Sóng bơm → quét sâu rồi hồi; không gửi trùng'};
const whitelist=installLiveCardWhitelistUi({page:'coin-pump-long-flush',label:'Sóng bơm → quét LONG · quan sát',root:root??document});
const target=new URLSearchParams(location.search).get('flush');let busy=false,focused=false;
export function renderCoinPumpLongFlush(data={}){
  if(!root)return;const c=data.coverage??{},counts=data.counts??{};
  root.querySelector('[data-flush-status]').textContent=data.error??`Đủ nến 1m: ${c.ready??0}/${c.total??0} coin · sóng bơm trước nến mới nhất: ${c.pumping??0} · ${time(c.updatedAt)} (VN)`;
  const toggle=root.querySelector('[data-flush-enabled]');toggle.checked=data.enabled===true;toggle.disabled=Boolean(data.error);
  root.querySelector('[data-flush-counts]').textContent=`Mẫu cảnh báo lưu: xả đóng dưới hỗ trợ ${counts.DUMP_CLOSE??0} · quét sâu rồi lấy lại ${counts.FLUSH_RECLAIM??0}. Đây không phải số lệnh thắng/thua.`;
  root.querySelector('[data-flush-cohorts]').innerHTML=Object.entries(COIN_PUMP_FLUSH_LABELS).map(([pattern,label])=>
    `<article data-live-card-key="${coinPumpFlushKey(pattern)}" data-binance-card-avg-roe="" data-binance-card-avg-roe-eligible="false"><strong>${label}</strong><small>Chưa có lệnh CLOSED đối chiếu · không có AvgROE</small></article>`).join('');
  const rows=[...(data.history??[])];if(data.selected&&!rows.some(e=>e.id===data.selected.id))rows.unshift(data.selected);
  root.querySelector('[data-flush-history]').innerHTML=rows.slice(0,101).map(e=>`<article class="wick-event ${e.id===target?'wick-selected':''}" data-flush-id="${esc(e.id)}">
    <header><strong>⚠ ${esc(e.symbol)} · ${esc(COIN_PUMP_FLUSH_LABELS[e.pattern]??'Dữ liệu cũ')}</strong><time>${esc(time(e.confirmedAt))}</time></header>
    <p>${esc(e.reason)}</p><p>Sóng bơm +${num(e.waveGainPct,2)}% · volume sóng ${num(e.waveVolumeRatio,2)}× nền · volume cây xả ${num(e.killVolumeRatio,2)}× sóng · bán chủ động ${num(e.takerSellPct,1)}%</p>
    <p>Đỉnh/đáy cây xả ${num(e.high)} → ${num(e.low)} (${num(e.highToLowDropPct,2)}%) · đóng ${num(e.price)} · hỗ trợ trước xả ${num(e.support)}</p>
    <p class="wick-risk">${e.liquidation?.longCount>0?`Binance quan sát thanh lý LONG: ${num(e.liquidation.longUsd,0)} USDT / ${num(e.liquidation.longCount,0)} sự kiện mẫu; không phải tổng đầy đủ.`:'Nghi vấn quét LONG từ giá/volume; chưa có bằng chứng thanh lý LONG đầy đủ.'}</p>
    <small>${esc(deliveries[e.delivery?.status]??'Chưa gửi')} · nến 1m đã đóng · không tự đóng LONG hoặc vào SHORT</small>
    <a href="/local-ai-trend-evaluation?flush=${encodeURIComponent(e.id)}#coin-pump-long-flush">Mở cảnh báo cụ thể</a></article>`).join('')||'<p>Chưa có cây xả mới đạt điều kiện sau khi detector chạy.</p>';
  whitelist?.decorate?.();
  if(target&&!focused){const row=[...root.querySelectorAll('[data-flush-id]')].find(r=>r.dataset.flushId===target);
    if(row){root.querySelector('[data-flush-history-details]').open=true;row.scrollIntoView({block:'center'});focused=true;}}
}
async function refresh(){
  if(!root||busy||document.hidden)return;busy=true;
  try{const res=await fetch(`/api/coin-pump-long-flush${target?`?flush=${encodeURIComponent(target)}`:''}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!res.ok)throw new Error();renderCoinPumpLongFlush(await res.json());
  }catch{root.querySelector('[data-flush-status]').textContent='Chưa lấy được dữ liệu mới · không coi dữ liệu cũ là cảnh báo mới';}
  finally{busy=false;}
}
if(root){
  root.querySelector('[data-flush-enabled]').addEventListener('change',async event=>{
    const toggle=event.target;toggle.disabled=true;
    try{const res=await fetch('/api/coin-pump-long-flush',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({enabled:toggle.checked}),signal:AbortSignal.timeout(8000)});if(!res.ok)throw new Error();renderCoinPumpLongFlush(await res.json());
    }catch{toggle.checked=!toggle.checked;root.querySelector('[data-flush-status]').textContent='Không lưu được lựa chọn push · thử lại';}
    finally{toggle.disabled=false;}
  });
  void refresh();setInterval(refresh,10_000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
}
