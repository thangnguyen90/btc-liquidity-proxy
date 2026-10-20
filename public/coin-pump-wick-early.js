import {COIN_PUMP_WICK_EARLY_LABEL,coinPumpWickEarlyKey} from './coin-pump-wick-early-model.js';
import {installLiveCardWhitelistUi} from './live-card-whitelist-ui.js';
import {binanceCardAvgRoeAttrs} from './binance-card-visibility.js';
import './opposite-liquidity-toast.js?v=20261010-early-wick-v1';
const root=document.querySelector('#coin-pump-wick-early');
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=6)=>v==null?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:n});
const time=v=>v>0?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}):'—';
const delivery={QUIET_HOURS:'Giờ yên lặng · không gửi Push',SENT:'Đã gửi',PARTIAL:'Gửi một phần',FAILED:'Lỗi/chưa rõ kết quả',DISABLED:'Đang tắt',STALE:'Cũ · không gửi',NOT_CONFIGURED:'Chưa cấu hình',
  NO_SUBSCRIBERS:'Chưa có thiết bị',UNKNOWN_AFTER_RESTART:'Không rõ sau restart · không gửi lại',POSTING:'Đang gửi'};
const whitelist=installLiveCardWhitelistUi({page:'coin-pump-wick-early',label:COIN_PUMP_WICK_EARLY_LABEL,root:root??document});
const target=new URLSearchParams(location.search).get('earlyWick');let busy=false,focused=false;
export function renderEarlyWick(data={}) {
  if(!root)return;
  const c=data.coverage??{};
  root.querySelector('[data-early-status]').textContent=data.error??`Đủ tối thiểu 51 nến 1m: ${c.ready??0}/${c.total??0} coin · sóng bơm 30–60m ${c.pumping??0} · Discord ${data.discordConfigured?'ON':'chưa cấu hình'} · ${time(c.updatedAt)} (VN)`;
  const toggle=root.querySelector('[data-early-enabled]');toggle.checked=data.enabled===true;toggle.disabled=Boolean(data.error);
  root.querySelector('[data-early-counts]').textContent=`Rút râu sớm: ${data.counts?.WICK_DETECTED??0} mẫu (14 ngày, tối đa 10.000). Không gộp với đã hồi xác nhận, không phải số lệnh thắng.`;
  const stats=data.closedStats??{},b=data.binance;
  root.querySelector('[data-early-binance]').textContent=b?`Binance EARLY+ratio: master ${b.masterEnabled?'ON':'OFF'} · route LONG ${b.routeEnabled?'ON':'OFF'} · execution ${b.executionEnabled?'ON':'OFF'} · margin 3 USDT ×5 · TP+10/SL−30 ROE${b.error?' · lỗi '+b.error:''}`:'Chưa có trạng thái executor EARLY+ratio từ runtime; chưa kết luận nhánh đã triển khai/bật.';
  root.querySelector('[data-early-cohorts]').innerHTML=`<article data-live-card-key="${coinPumpWickEarlyKey('EARLY_WICK')}" ${binanceCardAvgRoeAttrs(stats.closed>0?stats.avgRoe:null)}><strong>${COIN_PUMP_WICK_EARLY_LABEL}</strong><small>${stats.closed>0?`CLOSED ${num(stats.closed,0)} · AvgROE ${num(stats.avgRoe,2)}% · fill Binance gốc EARLY+ratio`:'Chưa có lệnh CLOSED đối chiếu · chưa có AvgROE'}. WHITELIST không bật route LONG3.</small></article>`;
  const rows=[...(data.history??[])];if(data.selected&&!rows.some(e=>e.id===data.selected.id))rows.unshift(data.selected);
  root.querySelector('[data-early-history]').innerHTML=rows.slice(0,101).map(e=>`<article class="wick-event ${e.id===target?'wick-selected':''}" data-early-id="${esc(e.id)}">
    <header><strong>🟠 ${esc(e.symbol)} · RÚT RÂU SỚM · CHƯA XÁC NHẬN HỒI</strong><time>${esc(time(e.detectedAt))}</time></header>
    <p>Sóng ${num(e.pump?.lookbackMinutes,0)} phút lên đỉnh +${num(e.pump?.waveGainPct,2)}% · volume ${num(e.pump?.waveVolumeRatio,2)}× nền · đã điều chỉnh ${num(e.pump?.drawdownPct,2)}% trước xả.</p>
    <p>Đỉnh cây xả <b>${num(e.sweepHigh)}</b> → đáy <b>${num(e.sweepLow)}</b> → đóng <b>${num(e.price)}</b>; xả ${num(e.highToLowDropPct,2)}%, râu dưới ${num(e.wickPct,1)}%, hồi từ đáy ${num(e.reboundPct,2)}%.</p>
    <p>Hỗ trợ trước xả ${num(e.level)} · <b>${e.reclaimed?'ĐÃ LẤY LẠI':'CHƯA LẤY LẠI'}</b>. Không yêu cầu reclaim/60% vị trí đóng/nến xanh hay xác nhận ở nến sau. Giá vẫn có thể tiếp tục giảm; rút râu đơn lẻ không cấp quyền LONG.</p>
    <p>${(()=>{const a=b?.attempts?.find(a=>a.id===e.id);return a?`Binance LONG3: ${esc(a.status)}${a.orderId?' · Order '+esc(a.orderId):''} · ratio ${a.ratioProof?.pass?'PASS':'chưa pass'} · đổi ${num(a.ratioProof?.changePct,2)}% / ${num(a.ratioProof?.transitionMinutes,0)}m`:'Binance: chưa có attempt exact-ID trong nhật ký gần nhất; không phát lại mẫu cũ.';})()}</p>
    <small>Push: ${esc(delivery[e.delivery?.status]??'Chưa gửi')} · Discord: ${esc(delivery[e.discordDelivery?.status]??'Chưa gửi')}</small>
    <a href="/local-ai-trend-evaluation?earlyWick=${encodeURIComponent(e.id)}#coin-pump-wick-early">Mở tín hiệu cụ thể</a>
  </article>`).join('')||'<p>Chưa có nến rút râu sớm mới đạt điều kiện sau khi detector chạy. Không phát lại mẫu ERA cũ.</p>';
  whitelist?.decorate?.();
  if(target&&!focused){const row=[...root.querySelectorAll('[data-early-id]')].find(r=>r.dataset.earlyId===target);if(row){root.querySelector('[data-early-details]').open=true;row.scrollIntoView({block:'center'});focused=true;}}
}
async function refresh(){
  if(!root||busy||document.hidden)return;busy=true;
  try{const response=await fetch(`/api/coin-pump-wick-early${target?`?earlyWick=${encodeURIComponent(target)}`:''}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error();renderEarlyWick(await response.json());
  }catch{root.querySelector('[data-early-status]').textContent='Không lấy được dữ liệu mới · không coi trạng thái cũ là tín hiệu mới';}
  finally{busy=false;}
}
if(root){
  root.querySelector('[data-early-enabled]').addEventListener('change',async e=>{
    const toggle=e.target;toggle.disabled=true;
    try{const response=await fetch('/api/coin-pump-wick-early',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:toggle.checked})});
      if(!response.ok)throw Error();renderEarlyWick(await response.json());
    }catch{toggle.checked=!toggle.checked;root.querySelector('[data-early-status]').textContent='Không lưu được lựa chọn gửi · thử lại';}
    finally{toggle.disabled=false;}
  });
  void refresh();setInterval(refresh,10000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
}
