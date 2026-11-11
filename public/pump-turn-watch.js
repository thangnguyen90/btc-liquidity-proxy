import {pumpTurnContextView,pumpTurnContextKey,PUMP_TURN_CONTEXT_TITLES} from './pump-turn-context-model.js';
import {longContextView} from './pump-turn-long-context-model.js';
import {earlyFlowContextView,isEarlyFlow} from './pump-turn-early-short-model.js';
import {shortFlowContextView} from './pump-turn-short-flow-model.js';
const $=id=>document.getElementById(id),esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const num=n=>Number.isFinite(n)?new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(n):'—';
const price=n=>Number.isFinite(n)?Number(n.toPrecision(8)).toString():'—';
const time=n=>Number.isFinite(n)?new Date(n).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false}):'—';
const labels={NEAR:'GẦN VÙNG · CHỜ NẾN',IN_ZONE:'TRONG VÙNG · CHỜ NẾN',FAR:'CÒN XA VÙNG',CHASE:'ĐÃ ĐI QUA VÙNG',WAIT_PRICE:'THIẾU GIÁ MỚI',EXPIRED:'HẾT HIỆU LỰC',INVALIDATED:'VÙNG VÔ HIỆU'};
let data=null,page=0,editing=false,busy=false;const signalId=new URLSearchParams(location.search).get('signal');
async function request(method='GET',body){const r=await fetch('/api/pump-turn-watch'+(method==='GET'&&signalId?'?signal='+encodeURIComponent(signalId):''),{method,cache:'no-store',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
function chart(e){const a=e.chart;if(!a?.length)return '';const lo=Math.min(e.zoneLow,...a.map(b=>b.l)),hi=Math.max(e.zoneHigh,...a.map(b=>b.h));if(hi<=lo)return '';
  const x=i=>35+i*880/(a.length-1),y=n=>210-(n-lo)/(hi-lo)*180;
  return `<details><summary>Biểu đồ nến5m và vùng dự tính</summary><svg viewBox="0 0 950 250" role="img" aria-label="Nến5m ${esc(e.symbol)}"><rect x="35" width="880" y="${y(e.zoneHigh)}" height="${Math.max(2,y(e.zoneLow)-y(e.zoneHigh))}" fill="#f9c652" opacity=".35"/>${a.map((b,i)=>`<g><title>${esc(time(b.t))} · O ${b.o} H ${b.h} L ${b.l} C ${b.c}</title><line x1="${x(i)}" x2="${x(i)}" y1="${y(b.h)}" y2="${y(b.l)}" stroke="${b.c>=b.o?'#30d8a8':'#ff738c'}"/><line x1="${x(i)}" x2="${x(i)}" y1="${y(b.o)}" y2="${y(b.c)}" stroke-width="7" stroke="${b.c>=b.o?'#30d8a8':'#ff738c'}"/></g>`).join('')}<text x="35" y="20" fill="#d3e9df">${esc(price(hi))}</text><text x="35" y="240" fill="#b6cfc2">${esc(time(a[0].t))}</text><text x="700" y="240" fill="#b6cfc2">${esc(time(a.at(-1).t))}</text></svg><small>Vùng vàng cố định từ nến đóng ${esc(time(e.asOf))}; hết hiệu lực ${esc(time(e.expiresAt))}. Rê chuột lên nến để xem giá.</small></details>`;}
function checks(xs){return (xs??[]).map(x=>`<span class="check ${x.pass?'pass':'fail'}">${x.pass?'✓':'—'} ${esc(x.label)}${x.value==null?'':' · '+esc(x.unit===' giá'?price(x.value):num(x.value))+esc(x.unit)}</span>`).join('');}
function contextPanel(e){
 if(e.confirmation||e.referencePrice)return '';
 if(isEarlyFlow(e)){
  const c=earlyFlowContextView(e),long=e.side==='LONG';
  return `<div class="short-context context-${c.label.toLowerCase()}"><b>${esc(c.title)}</b><p>Nến 5 phút đang chạy · ${long?'tăng':'giảm'} ${num(c.bodyPct)}% · ${long?'mua':'bán'} chủ động ${num(c.buyPct==null?null:long?c.buyPct:100-c.buyPct)}% · volume theo thời gian ${num(c.volumeX)}×</p><small>${esc(c.note)}</small></div>`;
 }
 if(e.side==='LONG'){const c=longContextView(e);return '<div class="short-context context-'+c.label.toLowerCase()+'"><b>Bối cảnh LONG: '+esc(c.title)+'</b><p>Biến động 1h '+num(c.gain60)+'% · mua chủ động 15m '+num(c.buyPct)+'% · vol3/nền20 '+num(c.volumeX)+'× · cách mốc LONG '+num(c.distancePct)+'%</p><small>'+esc(c.note)+'</small></div>';}
 const c=e.shortFlowOnly?shortFlowContextView(e):pumpTurnContextView(e);
 return `<div class="short-context context-${c.label.toLowerCase()}"><b>Bối cảnh SHORT: ${esc(c.title)}</b><p>${e.shortFlowOnly?'Giảm trong 1h '+num(-c.gain60)+'%':'Giảm từ đỉnh '+num(c.dropPct)+'%'} · biến động 1h ${num(c.gain60)}% · mua chủ động 15m ${num(c.buyPct)}% · vol3/nền20 ${num(c.volumeX)}×${c.label==='DEEP_DROP'?' · dòng mua/bán: '+esc(PUMP_TURN_CONTEXT_TITLES[c.flow]):''}</p><small>${esc(c.note)}</small></div>`;
}
function card(e,selected=false){const historical=!!e.delivery,expired=e.expiresAt&&Date.now()>=e.expiresAt,state=expired?'EXPIRED':e.state;
  const pending=!e.confirmation&&!e.referencePrice&&!isEarlyFlow(e)?(e.side==='LONG'
    ?`Còn chờ nến5m đóng trên ${price(e.zoneLow)}, tăng60m ≥8%, volume ≥${num(Math.max(100000,(e.baseline??0)*2))} USDT, taker mua ≥55% và đóng ở30% trên biên nến.`
    :e.shortFlowOnly?`Còn chờ nến5m đóng dưới đáy12 nến ${price(e.zoneHigh)} và kiểm tra phản ứng sau phá.`:`Còn chờ nến5m đỏ đóng dưới ${price(e.zoneHigh)}, trả3–20% từ đỉnh, volume ≥${num(Math.max(100000,(e.baseline??0)*1.5))} USDT và taker bán ≥55%.`):'';
  return `<article class="signal ${e.side==='SHORT'?'short':''} ${selected?'selected':''}" data-id="${esc(e.id)}"><div class="top"><div><span class="title">${esc(e.symbol)}</span><span class="badge">${esc(e.side)+(isEarlyFlow(e)?' SỚM':'')}</span><span class="badge">${e.closedConfirmed||(!e.delivery&&e.referencePrice)?'ĐẠT NẾN ĐÓNG':esc(labels[state]??'MẪU LƯU')}</span></div><a target="_blank" rel="noopener" href="https://www.binance.com/en/futures/${encodeURIComponent(e.symbol)}">Binance ↗</a></div>
  <div class="values"><div><small>Vùng dự tính</small><b>${price(e.zoneLow)} – ${price(e.zoneHigh)}</b></div><div><small>${historical?'Giá lúc cảnh báo':'Giá socket hiện tại'}</small><b>${price(e.livePrice??e.referencePrice)}</b></div><div><small>Khoảng cách tới vùng</small><b>${num(e.distancePct)}%</b></div><div><small>${historical?'Discord':'Mốc nến đã đóng (VN)'}</small><b>${historical?esc({SENT:'Đã gửi',FAILED:'Gửi lỗi',UNKNOWN:'Chưa rõ kết quả',PENDING:'Đang gửi / chưa rõ'}[e.delivery.status]??e.delivery.status):esc(time(e.asOf??e.at))}</b></div></div>
  <p class="warning">${e.confirmation?'Nến đã đạt bộ điều kiện; giá hiện tại có thể đã rời vùng.':historical?'Mốc và số liệu được lưu tại lúc cảnh báo.':isEarlyFlow(e)?'Vùng theo dõi trong nến 5 phút hiện tại.':'Vùng cho nến5m tiếp theo; còn chờ điều kiện nến kích hoạt.'}</p>
  ${contextPanel(e)}<div class="checks">${checks(e.confirmation?.checks??e.checks??e.contextChecks)}</div>${pending?'<p class="muted">'+esc(pending)+'</p>':''}<small>${historical?'Cảnh báo '+time(e.observedAt)+' · ':''}Giá cập nhật ${time(e.liveAt)} · vùng hết hiệu lực ${time(e.expiresAt)}</small>${chart(e)}</article>`;
}
function render(){if(!data)return;const c=data.coverage??{};$('coverage').textContent=`${c.ready??0}/${c.total??0} coin đủ nến · thiếu ${c.insufficient??0} · cũ ${c.stale??0} · lỗi/gap ${c.gap??0} · ${time(c.updatedAt)}`;
  $('context-stats').innerHTML=(data.contextStats??[]).map(g=>`<article class="short-context context-${Object.hasOwn(PUMP_TURN_CONTEXT_TITLES,g.label)?g.label.toLowerCase():'unknown'}"><b>${esc(PUMP_TURN_CONTEXT_TITLES[g.label]??'THIẾU DỮ LIỆU')}</b><p>SHORT đã đóng: ${g.closed??'—'} · AvgROE ${num(g.avgRoePct)}% · WHITELIST ${g.enabled?'ON':'OFF'}</p>${g.eligible===true&&Number.isFinite(g.avgRoePct)&&g.avgRoePct>4?`<label><input type="checkbox" data-context-key="${esc(g.key)}" ${g.enabled?'checked':''}> WHITELIST</label>`:'<small>Checkbox chỉ hiện khi closed AvgROE &gt;4%; mặc định OFF.</small>'}${g.error?'<p>Chưa đọc được audit lệnh.</p>':''}</article>`).join('')||'<p>Chưa đồng bộ thống kê bối cảnh.</p>';
  const b=data.binance;
  $('binance-status').textContent=!b?'Backend chưa cung cấp trạng thái MARKET.':b.error??`Master ${b.masterEnabled?'ON':'OFF'} · rule SHORT ${b.routeEnabled?'ON':'OFF'} · max riêng ${b.maxOpenPositions} vị thế · quota lần kiểm tra ${b.openSlots??'—'}/${b.maxOpenPositions}${b.slotsCheckedAt?' lúc '+time(b.slotsCheckedAt):''} · bật từ ${time(typeof b.enabledAt==='number'?b.enabledAt:Date.parse(b.enabledAt))}`;
  $('binance-attempts').innerHTML=(b?.attempts??[]).slice(0,20).map(a=>`<p>${esc(a.symbol)} · SHORT · ${esc(a.effectiveStatus??a.status)} · ${esc(time(a.at))}${a.reason?' · '+esc(a.reason):''}</p>`).join('')||'<small>Chưa có lần xử lý lệnh mới; đây không phải thống kê thắng/thua.</small>';
  const long=data.binanceLong;
  $('binance-long-status').textContent=!long?'Chưa có trạng thái MARKET LONG.':long.error??`Master ${long.masterEnabled?'ON':'OFF'} · MARKET LONG ${long.routeEnabled?'ON':'OFF'} · quota ${long.openSlots??'—'}/${long.maxOpenPositions}`;
  $('binance-long-attempts').innerHTML=(long?.attempts??[]).slice(0,20).map(a=>`<p>${esc(a.symbol)} · LONG · ${esc(a.effectiveStatus??a.status)} · ${esc(time(a.at))}${a.reason?' · '+esc(a.reason):''}</p>`).join('')||'<small>Chưa có lần xử lý MARKET LONG.</small>';
  $('delivery').textContent=data.discordConfigured?'Discord đã cấu hình · kênh máy chủ':'Chưa cấu hình Discord trên máy chủ';
  if(!editing){$('discordEnabled').checked=data.settings.discordEnabled;$('nearPct').value=data.settings.nearPct;}
  ['discordEnabled','nearPct','save'].forEach(k=>$(k).disabled=!!data.error);
  const scanStale=!Number.isFinite(c.updatedAt)||Date.now()-c.updatedAt>30000;
  if(data.error)$('status').textContent=data.error;
  else if(scanStale)$('status').textContent='Bộ quét chưa cập nhật quá 30 giây; chưa thể kết luận không có tín hiệu.';
  else if(c.total&&c.ready<c.total)$('status').textContent=`Độ phủ dữ liệu chưa đầy đủ: ${c.ready??0}/${c.total} coin hợp lệ. Đang bù nến5m; không thể kết luận toàn thị trường không có tín hiệu.`;
  else $('status').textContent=data.warmupError??'';
  const w=data.warmup;
  $('warmup-status').textContent=!w?'Backend chưa cung cấp trạng thái bù nến5m.':`Bù nến5m độc lập warm-up EMA · ${w.busy?'đang nạp':'đang theo dõi'} · đã thử ${w.attempted??0}, khôi phục ${w.refreshed??0}, chưa thành công ${w.failed??0}${w.deferredReason==='REST_BLOCKED_OR_CONGESTED'?' · tạm nhường tải Binance':w.deferredReason==='WAIT_UNIVERSE'?' · đang chờ danh sách coin':''}${w.error?' · '+w.error:''}. Đây là trạng thái dữ liệu, không phải số lệnh.`;
  const view=$('view').value,search=$('search').value.trim().toUpperCase(),side=$('side').value;
  let rows=view==='history'?data.history:view==='confirmed'?data.confirmed:data.rows;
  rows=(rows??[]).filter(e=>(side==='ALL'||e.side===side)&&e.symbol.toUpperCase().includes(search)&&(view!=='near'||['NEAR','IN_ZONE'].includes(e.state)));
  const n=rows.length;page=Math.min(page,Math.max(0,Math.ceil(n/20)-1));$('rows').innerHTML=n?rows.slice(page*20,page*20+20).map(e=>card(e)).join(''):`<div class="empty">${scanStale||c.ready<c.total?'Chưa có mẫu trong phần dữ liệu hợp lệ hiện tại; độ phủ chưa đầy đủ, không đồng nghĩa thị trường không có tín hiệu.':'Không có mẫu trong bộ lọc hiện tại. Xem “Tất cả vùng dự tính” hoặc chờ nến mới.'}</div>`;
  $('page-label').textContent=n?`${page*20+1}–${Math.min(n,(page+1)*20)} / ${n}`:'0 mẫu';$('previous').disabled=page===0;$('next').disabled=(page+1)*20>=n;
  $('selected').innerHTML=data.selected?'<h3>Tín hiệu mở từ thông báo</h3>'+card(data.selected,true):signalId?'<p class="warning">Không tìm thấy mẫu lưu; vùng có thể đã hết thời gian lưu14ngày.</p>':'';
}
async function refresh(){if(busy)return;busy=true;try{data=await request();render();}catch(e){$('status').textContent=`Không tải được dữ liệu (${e.message}). ${data?'Đang giữ ảnh chụp cũ; kiểm tra thời gian cập nhật.':'Thử Làm mới.'}`;}finally{busy=false;}}
$('settings').addEventListener('input',()=>editing=true);
$('settings').addEventListener('submit',async e=>{e.preventDefault();$('save').disabled=true;try{data=await request('POST',{discordEnabled:$('discordEnabled').checked,nearPct:Number($('nearPct').value)});editing=false;render();$('settings-status').textContent='Đã lưu lựa chọn trên máy chủ.';}catch(err){$('settings-status').textContent='Không lưu được: '+err.message;}finally{$('save').disabled=false;}});
$('filters').addEventListener('submit',e=>{e.preventDefault();page=0;void refresh();});['side','view','search'].forEach(k=>$(k).addEventListener(k==='search'?'input':'change',()=>{page=0;render();}));
$('previous').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
$('context-stats').addEventListener('change',async e=>{
 const input=e.target,key=input?.dataset?.contextKey;
 if(!key||busy||!Object.keys(PUMP_TURN_CONTEXT_TITLES).some(label=>pumpTurnContextKey(label)===key))return;
 busy=true;input.disabled=true;const enabled=input.checked;
 try{const r=await fetch('/api/live-card-whitelist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key,enabled}),signal:AbortSignal.timeout(10000)});const result=await r.json();if(!r.ok)throw Error(result.error??'Không lưu được WHITELIST');$('context-status').textContent='Đã lưu WHITELIST bối cảnh; không thay quyền MARKET của rule SHORT.';}
 catch(error){input.checked=!enabled;$('context-status').textContent=error.message;}
 finally{input.disabled=false;busy=false;}await refresh();
});
void refresh();setInterval(()=>{if(!document.hidden)void refresh();},15000);
