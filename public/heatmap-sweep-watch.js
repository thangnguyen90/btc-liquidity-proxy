import {SECOND_SWEEP_KEY,SECOND_SWEEP_LABEL,SECOND_SWEEP_TITLE,isSecondUpperSweep} from './heatmap-second-sweep-model.js';
import {LONG_QUALITY_LABELS,LONG_QUALITY_TITLES,longQualityKey,validLongQuality} from './heatmap-long-quality-model.js';
import {UPPER_MOMENTUM_TITLES,upperMomentumKey,validUpperMomentum} from './heatmap-upper-momentum-model.js';
import {LOWER_MOMENTUM_TITLES,lowerMomentumKey,validLowerMomentum} from './heatmap-lower-momentum-model.js';
export const HEATMAP_SWEEP_UI_VERSION='HEATMAP_SWEEP_UI_BOTH_MOMENTUM_BLOCK_V12_20261026';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=n=>Number.isFinite(n)?Number(n.toPrecision(9)).toString():'—';
const t=n=>n?new Date(n).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' VN':'—';
function lowerMomentumHtml(e){
 if(e.kind!=='ALL_TRACKED_LOWER_SWEPT')return '';
 const q=validLowerMomentum(e)?e.lowerMomentum:null;
 if(!q)return '<p class="lower-momentum">Đà xả: mẫu cũ/chưa có snapshot trước entry; không đánh giá lại bằng giá hiện tại.</p>';
 return `<div class="long-quality lower-momentum" data-state="${q.state}" style="border-left:4px solid ${q.state==='CONTINUATION'?'#ff627e':'#91a6bc'};padding:10px"><b>${LOWER_MOMENTUM_TITLES[q.state]}</b><br>${q.checks.map(c=>`${c.pass===true?'✓':c.pass===false?'✗':'?'} ${esc(c.label)}: ${f(c.value)}`).join('<br>')}<br>Ratio ACCOUNT ${f(q.features.ratioLevel)} · Δ1h ${f(q.features.ratioChange1h)}% · OI lượng Δ1h ${f(q.features.oiChange1h)}%<br>BTC15m ${f(q.features.btcReturn15m)}% / 1h ${f(q.features.btcReturn1h)}% (tham khảo; — là thiếu cache).<br>CÒN ĐÀ XẢ: chặn LONG mới cả nhóm tốt5/xấu1. Chưa đủ dấu hiệu xả KHÔNG phải xác nhận hồi; ngưỡng thử nghiệm chưa backtest. Không sửa vị thế cũ/SL/TP.</div>`;
}
function qualityHtml(e){
 if(e.kind==='ALL_TRACKED_UPPER_SWEPT'){
  const q=validUpperMomentum(e)?e.upperMomentum:null;
  if(!q)return '<p class="upper-momentum">Đà bơm: mẫu cũ/chưa có snapshot trước entry; không đánh giá lại bằng giá hiện tại.</p>';
  return `<div class="long-quality upper-momentum" data-state="${q.state}" style="border-left:4px solid ${q.state==='CONTINUATION'?'#ffb553':'#91a6bc'};padding:10px"><b>${UPPER_MOMENTUM_TITLES[q.state]}</b> · snapshot trước entry<br>${q.checks.map(c=>`${c.pass===true?'✓':c.pass===false?'✗':'?'} ${esc(c.label)}: ${f(c.value)}`).join('<br>')}<br>Ratio ACCOUNT ${f(q.features.ratioLevel)} · Δ1h ${f(q.features.ratioChange1h)}% · OI lượng Δ1h ${f(q.features.oiChange1h)}%<br>BTC15m ${f(q.features.btcReturn15m)}% / 1h ${f(q.features.btcReturn1h)}% · ratio/OI/BTC chỉ tham khảo, — là thiếu cache.<br>Ngưỡng thử nghiệm, chưa backtest xác nhận. Chưa đủ dấu hiệu bơm KHÔNG phải xác nhận đảo chiều. Chính sách mới chặn SHORT nhóm CÒN ĐÀ BƠM; kết quả của lần này xem Binance bên dưới. Không sửa vị thế cũ/SL/TP.</div>`;
 }
 if(e.kind!=='ALL_TRACKED_LOWER_SWEPT')return '';
 const q=validLongQuality(e)?e.longQuality:null;
 if(!q)return lowerMomentumHtml(e)+'<p class="long-quality" data-grade="UNKNOWN">⚪ LONG · CHƯA ĐÁNH GIÁ · thiếu snapshot trước entry.</p>';
 return lowerMomentumHtml(e)+`<div class="long-quality" data-grade="${q.grade}"><b>${LONG_QUALITY_TITLES[q.grade]}</b> · ${q.proposedMarginUsdt?'size theo phân loại '+q.proposedMarginUsdt+' USDT margin':'chưa gán size'}<br>${q.checks.map(c=>`${c.pass===true?'✓':c.pass===false?'✗':'?'} ${esc(c.label)}: ${f(c.value)}`).join('<br>')}<br>Ratio ${f(q.features.ratioLevel)} · BTC15m ${f(q.features.btcReturn15m)}% / 1h ${f(q.features.btcReturn1h)}% (tham khảo).<br>${esc(q.missing.join(' · '))}</div>`;
}
export function mountHeatmapSweepWatch(){
 const $=id=>document.getElementById(id),selectedId=new URLSearchParams(location.search).get('sweep');
 let selection=null,snapshot=null,busy=false,reading=false,revision=0,distanceDirty=false;
 function render(){
  const w=snapshot?.watches?.find(w=>w.symbol===selection?.symbol),cohorts=[w?.cohort,w?.lowerCohort].filter(Boolean);
  $('sweepCoin').textContent=selection?.symbol??'Tìm coin trước';
  $('sweepMarketToggle').disabled=busy||!!snapshot?.error||!snapshot;
  $('sweepMarketToggle').textContent=snapshot?.marketEnabled?'Tắt quét toàn thị trường':'Bật quét toàn thị trường';
  $('sweepMarketDistance').disabled=busy;
  if(document.activeElement!==$('sweepMarketDistance'))$('sweepMarketDistance').value=String(snapshot?.marketDistancePct??5);
  const cv=snapshot?.coverage;
  $('sweepCoverage').textContent=cv?`${snapshot.marketEnabled?'TOÀN BỘ BINANCE FUTURES USDT':'THEO DÕI RIÊNG'} · đã xử lý ${cv.checked??cv.loaded}/${cv.total} coin · ${cv.loaded} coin đủ hai model · ${cv.armed} coin có cụm đang theo dõi · ${cv.waiting} coin chờ vùng/dữ liệu · ${cv.unloaded??cv.total-(cv.checked??cv.loaded)} coin chưa nạp · ${cv.expired??0} coin hết hạn chờ chốt lại. Cache tươi phục hồi ${cv.cacheRestored??0} coin; đang nạp ${cv.inFlight??0}/${snapshot.policy?.maxInFlight??1}. REST tối đa ${snapshot.policy?.maxBundleLoadsPerMinute??2} coin/phút, cache tối đa8coin/giây; nhường khi API nghẽn. Chưa nạp/chưa có cụm không đồng nghĩa toàn thị trường không có tín hiệu. Đóng trang vẫn chạy.`:'';
  if(cv)$('sweepCoverage').style.color=(cv.unloaded??cv.total-(cv.checked??cv.loaded))>0||cv.expired>0?'#ffb553':'';
  $('sweepToggle').disabled=busy||!selection||!!snapshot?.error||!snapshot||snapshot.marketEnabled;
  $('sweepToggle').textContent=w?.enabled?'Tắt theo dõi coin này':'Bật theo dõi coin này';
  $('sweepState').textContent=snapshot?.error??(!snapshot?'Chưa đồng bộ cấu hình.':`${snapshot.discordConfigured?'Discord riêng đã cấu hình':'CHƯA CẤU HÌNH DISCORD'} · ${snapshot.marketEnabled?'TOÀN THỊ TRƯỜNG ON · ':''}${w?.enabled?'coin '+w.symbol+' · '+w.status:snapshot.marketEnabled?'chưa chọn coin trên chart':'OFF'} · ${snapshot.watches?.filter(x=>x.enabled).length??0} coin${snapshot.marketEnabled?' · không giới hạn 10 coin':' / tối đa '+snapshot.maxWatches}`);
  $('sweepReason').textContent=w?.reason??(snapshot?.marketEnabled?'Đang nạp từng coin; chỉ theo dõi cụm đủ dữ liệu và chưa bị giá quét trước lúc chốt.':'Bật riêng coin cần theo dõi; tìm coin không tự bật Discord và không gửi lại lần quét trước.');
  if(w&&!busy&&!distanceDirty)$('sweepDistance').value=String(w.maxDistancePct);
  $('sweepDistance').disabled=busy||!selection||snapshot?.marketEnabled;
  $('sweepProgress').innerHTML=cohorts.map(c=>`<h3>PHÍA ${c.direction==='LOWER'?'DƯỚI → LONG':'TRÊN → SHORT'}</h3><p>Chốt ${esc(t(c.armedAt))} · profile trước giá ${esc(t(c.asOf))} · MARK tham chiếu ${f(c.referencePrice)} · hết hạn ${esc(t(c.expiresAt))} · ${esc(c.state)}</p><p><b>${c.zones.filter(z=>z.cleared).length}/${c.zones.length} cụm đã quét hết</b> · chỉ các cụm đã chốt trong ${c.direction==='LOWER'?'−':'+'}${f(c.maxDistancePct)}%, không phải toàn sàn</p><ul>${c.zones.map(z=>`<li>${z.cleared?'✓ QUÉT HẾT':z.touched?'◐ ĐÃ CHẠM':'— CHƯA CHẠM'} · ${f(z.low)} – ${f(z.high)}</li>`).join('')}</ul>`).join('');
  const b=snapshot?.binance;
  if($('lowerMomentumEntryPolicy'))$('lowerMomentumEntryPolicy').textContent=b?.blockLowerContinuation===true?'ĐANG CHẶN LONG TỰ ĐỘNG: CÒN ĐÀ XẢ, kể cả nhóm tốt5/xấu1. Discord vẫn báo. WHITELIST không bỏ qua chặn; không sửa vị thế cũ/SL/TP.':'Chưa xác nhận backend đã bật chặn LONG nhóm CÒN ĐÀ XẢ.';
  if($('lowerMomentumStats')&&!busy)$('lowerMomentumStats').innerHTML=(snapshot?.lowerMomentumStats??[]).map(g=>`<div class="long-quality"><b>${esc(LOWER_MOMENTUM_TITLES[g.state]??g.state)}</b><p>LONG đã đóng: ${g.closed??'—'} · AvgROE ${f(g.avgRoePct)}% · WHITELIST ${g.enabled?'ON':'OFF'}. Không tính blocked chưa có fill.</p>${g.eligible===true?`<label><input type="checkbox" data-lower-momentum-key="${esc(g.key)}" ${g.enabled?'checked':''}> WHITELIST</label>`:'<small>Checkbox chỉ hiện khi closed AvgROE &gt;4%; mặc định OFF.</small>'}<p>WHITELIST không bỏ qua chặn CÒN ĐÀ XẢ hoặc tạo route Binance mới.</p></div>`).join('')||'<p>Chưa đồng bộ thống kê đà xả.</p>';
  if($('upperMomentumEntryPolicy'))$('upperMomentumEntryPolicy').textContent=b?.blockUpperContinuation===true?'ĐANG CHẶN SHORT TỰ ĐỘNG: CÒN ĐÀ BƠM, kể cả quét lần2. Discord vẫn gửi. Nhóm khác giữ nguyên; WHITELIST không bỏ qua chặn. Không đổi vị thế cũ/SL/TP.':'Chưa xác nhận backend đã bật chặn nhóm CÒN ĐÀ BƠM.';
  if($('upperMomentumStats')&&!busy)$('upperMomentumStats').innerHTML=(snapshot?.upperMomentumStats??[]).map(g=>`<div class="long-quality"><b>${esc(UPPER_MOMENTUM_TITLES[g.state]??g.state)}</b><p>Thống kê lệnh SHORT đã đóng: ${g.closed??'—'} · AvgROE ${f(g.avgRoePct)}% · WHITELIST ${g.enabled?'ON':'OFF'}. Đây là kết quả SHORT đối với nhãn quan sát, không phải hiệu quả LONG theo đà bơm.</p>${g.eligible===true?`<label><input type="checkbox" data-upper-momentum-key="${esc(g.key)}" ${g.enabled?'checked':''}> WHITELIST</label>`:'<small>Checkbox chỉ hiện khi closed AvgROE &gt;4%; mặc định OFF.</small>'}<p>OBSERVE ONLY: checkbox không tạo route Binance hoặc bật/chặn lệnh heatmap.</p></div>`).join('')||'<p>Chưa đồng bộ đánh giá đà bơm từ backend; không suy ra không có rủi ro.</p>';
  const gate=snapshot?.secondSweepGate,box=$('secondSweepWhitelist'),gateText=$('secondSweepStats');
  if(box){box.parentElement.hidden=gate?.eligible!==true;if(!busy)box.checked=gate?.enabled===true;box.disabled=busy;}
  if(gateText)gateText.textContent=gate?.error?'Không đọc được audit quét lần 2; chặn nhánh 10 USDT, không suy ra AvgROE.':gate?`Quét lần 2: ${gate.closed} lệnh đã đóng có proof lúc entry · AvgROE ${gate.avgRoePct==null?'chưa có':f(gate.avgRoePct)+'%'} · WHITELIST ${gate.enabled?'ON':'OFF'}. Checkbox chỉ hiện khi closed AvgROE >4%. Nhánh 10 USDT phải bật riêng ở Quản lý Binance; OFF giữ nhánh SHORT 5 USDT cũ.`:'Chưa có dữ liệu thống kê quét lần 2; không suy ra đủ điều kiện.';
  if($('longQualityGates')&&!busy)$('longQualityGates').innerHTML=(snapshot?.longQualityGates??[]).map(g=>`<div class="long-quality" data-grade="${g.label===LONG_QUALITY_LABELS.GOOD?'GOOD':'BAD'}"><b>LONG nhóm ${g.label===LONG_QUALITY_LABELS.GOOD?'tốt · 5':'xấu · 1'} USDT</b><p>${g.error?'Audit chưa có dữ liệu; chưa đủ điều kiện':`${g.closed} lệnh đã đóng có proof trước entry · AvgROE ${g.avgRoePct==null?'chưa có':f(g.avgRoePct)+'%'} · WHITELIST ${g.enabled?'ON':'OFF'}`}</p>${g.eligible===true?`<label class="second-sweep-whitelist"><input type="checkbox" data-long-quality-key="${esc(g.key)}" ${g.enabled?'checked':''}> WHITELIST · LONG ${g.label===LONG_QUALITY_LABELS.GOOD?'tốt':'xấu'}</label>`:'<small>Checkbox chỉ hiện khi closed AvgROE &gt;4%; dữ liệu nghiên cứu lịch sử không cấp quyền.</small>'}</div>`).join('')||'<p>Chưa đồng bộ thống kê LONG tốt/xấu.</p>';
  const driftNote=b?.priceDriftGuardEnabled===false&&b.maxPriceDrift===null?'Không chặn lệch giá so với tín hiệu':Number.isFinite(b?.maxPriceDrift)?`Giới hạn lệch giá ${f(b.maxPriceDrift*100)}%`:'Chưa đồng bộ policy lệch giá';
  if($('sweepBinance'))$('sweepBinance').textContent=b?`BINANCE: master ${b.masterEnabled?'ON':'OFF'} · ${b.routes.map(r=>(r.signalLabel===LONG_QUALITY_LABELS.GOOD?'LONG tốt5':r.signalLabel===LONG_QUALITY_LABELS.BAD?'LONG xấu1':r.signalLabel===SECOND_SWEEP_LABEL?'SHORT lần 2 (10 USDT)':r.side)+' '+(r.enabled?'ON':'OFF')).join(' · ')} · ${b.longQualityMode?'LONG đang dùng chế độ phân loại; cần đúng nhánh/WHITELIST, thiếu dữ liệu không fallback2':'thông thường SHORT '+f(b.shortMarginUsdt)+' / LONG '+f(b.longMarginUsdt)+' USDT margin'} ×5 · TP +10% / SL −30% ROE · ${driftNote} · quota riêng chung hai hướng ${b.openSlots??'chưa kiểm tra'}/20${b.error?' · LỖI '+b.error:''}. Chỉ tín hiệu mới sau bật, tuổi ≤30 giây; không replay/DCA/nâng size.`:'Chưa đồng bộ runner Binance; không suy ra đã vào lệnh.';
  const history=(snapshot?.history??[]).filter(e=>snapshot.marketEnabled||e.symbol===selection?.symbol);
  $('sweepHistory').innerHTML=history.map(e=>{const lower=e.direction==='LOWER',all=e.kind.startsWith('ALL_TRACKED_'),second=isSecondUpperSweep(e),s=e.secondSweep,a=b?.attempts?.find(a=>a.id===e.id)??e.binance;return `<article class="sweep-event${e.id===selectedId?' is-selected':''}" data-sweep-id="${esc(e.id)}"><strong>${esc(e.symbol)} · ${second?SECOND_SWEEP_TITLE:all?'QUÉT HẾT CÁC CỤM ĐÃ CHỐT · PHÍA '+(lower?'DƯỚI → LONG':'TRÊN → SHORT'):'QUÉT HẾT CỤM PHÍA '+(lower?'DƯỚI':'TRÊN')}</strong>${qualityHtml(e)}${second?`<p>Lần đầu ${esc(t(s.firstAt))} · đỉnh MARK trước ${f(s.previousPeak)} · đã điều chỉnh ${f(s.retracementPct)}% · giá hiện cách đỉnh ${f(s.distanceBelowPeakPct)}% phía dưới.</p>`:''}<p>MARK ${f(e.markPrice)} · ${e.clearedCount}/${e.totalCount} cụm · phạm vi ${lower?'−':'+'}${f(e.maxDistancePct)}% · ${esc(t(e.at))}</p><small>Discord ${esc(e.delivery?.status??'chưa xác nhận')} · Binance ${esc(a?.status??(all?'không có kết quả / mẫu cũ không replay':'OBSERVE ONLY'))}${a?.orderId?' · orderId '+esc(a.orderId):''}${a?.reason?' · '+esc(a.reason):''}</small></article>`;}).join('')||'<p>Chưa ghi nhận lần quét mới sau khi bật. Không phát lại lịch sử chart.</p>';
 }
 async function load(){
  if(busy||reading)return;reading=true;const token=++revision;
  try{const r=await fetch('/api/heatmap-sweep-watch'+(selectedId?'?sweep='+encodeURIComponent(selectedId):''),{cache:'no-store',signal:AbortSignal.timeout(8000)}),data=await r.json();
   if(!r.ok||!Array.isArray(data.watches))throw Error(data.error??'Backend chưa nạp chức năng quét cụm');
   if(token!==revision)return;snapshot=data;render();
  }catch(e){if(token===revision)$('sweepState').textContent='Chưa đồng bộ: '+e.message;}
  finally{if(token===revision)reading=false;}
 }
 $('sweepToggle').addEventListener('click',async()=>{
  if(busy||!selection||!snapshot)return;const w=snapshot.watches.find(w=>w.symbol===selection.symbol),q={...selection};
  const maxDistancePct=Number($('sweepDistance').value);if(!Number.isFinite(maxDistancePct)||maxDistancePct<.5||maxDistancePct>10){$('sweepAction').textContent='Phạm vi từ0,5 đến10%.';return;}
  busy=true;++revision;reading=false;render();$('sweepAction').textContent='Đang lưu…';
  try{const r=await fetch('/api/heatmap-sweep-watch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({symbol:q.symbol,viewRange:q.range,enabled:!w?.enabled,maxDistancePct}),signal:AbortSignal.timeout(12000)}),data=await r.json();
   if(!r.ok||!Array.isArray(data.watches))throw Error(data.error??'Không xác nhận được kết quả');snapshot=data;distanceDirty=false;$('sweepAction').textContent=w?.enabled?'Đã tắt theo dõi.':'Đã bật; chờ MARK mới và vùng chưa bị quét. Không gửi lại lịch sử cũ.';
  }catch(e){$('sweepAction').textContent='Chưa xác nhận: '+e.message+'. Làm mới trước khi thử lại; không tự gửi lại yêu cầu.';}
  finally{busy=false;render();}
 });
 $('sweepMarketToggle').addEventListener('click',async()=>{
  if(busy||!snapshot)return;const enabled=!snapshot.marketEnabled,maxDistancePct=Number($('sweepMarketDistance').value);
  if(!Number.isFinite(maxDistancePct)||maxDistancePct<.5||maxDistancePct>10){$('sweepAction').textContent='Phạm vi từ0,5 đến10%.';return;}
  busy=true;++revision;reading=false;render();
  try{const r=await fetch('/api/heatmap-sweep-watch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'market',enabled,maxDistancePct}),signal:AbortSignal.timeout(12000)}),d=await r.json();
   if(!r.ok||!Array.isArray(d.watches))throw Error(d.error??'Không xác nhận được kết quả');snapshot=d;$('sweepAction').textContent=enabled?'Đã bật toàn thị trường; chỉ gửi lần quét mới sau khi chốt vùng.':'Đã tắt toàn thị trường.';
  }catch(e){$('sweepAction').textContent='Chưa xác nhận: '+e.message+'; làm mới trước khi thử lại.';}finally{busy=false;render();}
 });
 $('secondSweepWhitelist')?.addEventListener('change',async event=>{
  if(busy)return;busy=true;const enabled=event.target.checked;render();
  try{const r=await fetch('/api/live-card-whitelist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:SECOND_SWEEP_KEY,enabled}),signal:AbortSignal.timeout(8000)}),data=await r.json();if(!r.ok)throw Error(data.error??'Không lưu được WHITELIST');$('sweepAction').textContent='Đã lưu WHITELIST. Không tự bật route Binance hoặc gửi lệnh.';}
  catch(error){$('sweepAction').textContent='Chưa xác nhận: '+error.message;}
  finally{busy=false;void load();}
 });
 $('sweepRefresh').addEventListener('click',()=>void load());
 $('lowerMomentumStats')?.addEventListener('change',async event=>{
  const key=event.target?.dataset?.lowerMomentumKey;if(busy||!Object.keys(LOWER_MOMENTUM_TITLES).some(state=>lowerMomentumKey(state)===key))return;
  busy=true;event.target.disabled=true;
  try{const r=await fetch('/api/live-card-whitelist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key,enabled:event.target.checked}),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Không lưu được WHITELIST');$('sweepAction').textContent='Đã lưu WHITELIST đà xả. Không bỏ qua chặn hoặc tạo route mới.';}
  catch(error){$('sweepAction').textContent='Chưa xác nhận: '+error.message;}finally{busy=false;void load();}
 });
 $('upperMomentumStats')?.addEventListener('change',async event=>{
  const key=event.target?.dataset?.upperMomentumKey;if(busy||!Object.keys(UPPER_MOMENTUM_TITLES).some(state=>upperMomentumKey(state)===key))return;
  busy=true;event.target.disabled=true;
  try{const r=await fetch('/api/live-card-whitelist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key,enabled:event.target.checked}),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Không lưu được WHITELIST');$('sweepAction').textContent='Đã lưu WHITELIST đà bơm. Chỉ nhãn quan sát; không tạo route hay thay đổi lệnh.';}
  catch(error){$('sweepAction').textContent='Chưa xác nhận: '+error.message;}finally{busy=false;void load();}
 });
 $('longQualityGates')?.addEventListener('change',async event=>{
  const key=event.target?.dataset?.longQualityKey;if(busy||![LONG_QUALITY_LABELS.GOOD,LONG_QUALITY_LABELS.BAD].some(label=>longQualityKey(label)===key))return;
  busy=true;const enabled=event.target.checked;event.target.disabled=true;
  try{const r=await fetch('/api/live-card-whitelist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key,enabled}),signal:AbortSignal.timeout(8000)}),data=await r.json();if(!r.ok)throw Error(data.error??'Không lưu được WHITELIST');$('sweepAction').textContent='Đã lưu WHITELIST LONG. Chưa tự bật route5/1 hoặc gửi lệnh.';}
  catch(error){$('sweepAction').textContent='Chưa xác nhận: '+error.message;}finally{busy=false;void load();}
 });
 $('sweepDistance').addEventListener('input',()=>{distanceDirty=true;});
 setInterval(()=>{if(!document.hidden)void load();},15000);render();void load();
 return {setSelection(q){if(selection?.symbol!==q?.symbol){distanceDirty=false;$('sweepDistance').value='5';}selection=q?{symbol:q.symbol,range:q.range}:null;render();}};
}
