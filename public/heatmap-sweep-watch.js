export const HEATMAP_SWEEP_UI_VERSION='HEATMAP_SWEEP_UI_DUAL_ENTRY_V3_20261020';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=n=>Number.isFinite(n)?Number(n.toPrecision(9)).toString():'—';
const t=n=>n?new Date(n).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' VN':'—';
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
  $('sweepCoverage').textContent=cv?`${snapshot.marketEnabled?'TOÀN BỘ BINANCE FUTURES USDT':'THEO DÕI RIÊNG'} · đã xử lý ${cv.checked??cv.loaded}/${cv.total} coin · ${cv.loaded} coin đủ hai model · ${cv.armed} coin có cụm đang theo dõi · ${cv.waiting} coin chờ vùng/dữ liệu. Nạp theo lượt, tối đa ${snapshot.policy?.maxBundleLoadsPerMinute??2} coin/phút; tạm nhường khi API nghẽn. Đóng trang vẫn chạy.`:'';
  $('sweepToggle').disabled=busy||!selection||!!snapshot?.error||!snapshot||snapshot.marketEnabled;
  $('sweepToggle').textContent=w?.enabled?'Tắt theo dõi coin này':'Bật theo dõi coin này';
  $('sweepState').textContent=snapshot?.error??(!snapshot?'Chưa đồng bộ cấu hình.':`${snapshot.discordConfigured?'Discord riêng đã cấu hình':'CHƯA CẤU HÌNH DISCORD'} · ${snapshot.marketEnabled?'TOÀN THỊ TRƯỜNG ON · ':''}${w?.enabled?'coin '+w.symbol+' · '+w.status:snapshot.marketEnabled?'chưa chọn coin trên chart':'OFF'} · ${snapshot.watches?.filter(x=>x.enabled).length??0} coin${snapshot.marketEnabled?' · không giới hạn 10 coin':' / tối đa '+snapshot.maxWatches}`);
  $('sweepReason').textContent=w?.reason??(snapshot?.marketEnabled?'Đang nạp từng coin; chỉ theo dõi cụm đủ dữ liệu và chưa bị giá quét trước lúc chốt.':'Bật riêng coin cần theo dõi; tìm coin không tự bật Discord và không gửi lại lần quét trước.');
  if(w&&!busy&&!distanceDirty)$('sweepDistance').value=String(w.maxDistancePct);
  $('sweepDistance').disabled=busy||!selection||snapshot?.marketEnabled;
  $('sweepProgress').innerHTML=cohorts.map(c=>`<h3>PHÍA ${c.direction==='LOWER'?'DƯỚI → LONG':'TRÊN → SHORT'}</h3><p>Chốt ${esc(t(c.armedAt))} · profile trước giá ${esc(t(c.asOf))} · MARK tham chiếu ${f(c.referencePrice)} · hết hạn ${esc(t(c.expiresAt))} · ${esc(c.state)}</p><p><b>${c.zones.filter(z=>z.cleared).length}/${c.zones.length} cụm đã quét hết</b> · chỉ các cụm đã chốt trong ${c.direction==='LOWER'?'−':'+'}${f(c.maxDistancePct)}%, không phải toàn sàn</p><ul>${c.zones.map(z=>`<li>${z.cleared?'✓ QUÉT HẾT':z.touched?'◐ ĐÃ CHẠM':'— CHƯA CHẠM'} · ${f(z.low)} – ${f(z.high)}</li>`).join('')}</ul>`).join('');
  const b=snapshot?.binance;
  if($('sweepBinance'))$('sweepBinance').textContent=b?`BINANCE: master ${b.masterEnabled?'ON':'OFF'} · ${b.routes.map(r=>r.side+' '+(r.enabled?'ON':'OFF')).join(' · ')} · SHORT 3 / LONG 1 USDT margin ×5 · TP +10% / SL −30% ROE · quota riêng chung hai hướng ${b.openSlots??'chưa kiểm tra'}/20${b.error?' · LỖI '+b.error:''}. Chỉ lệnh mới sau lúc bật; không replay/DCA/nâng size.`:'Chưa đồng bộ runner Binance; không suy ra đã vào lệnh.';
  const history=(snapshot?.history??[]).filter(e=>snapshot.marketEnabled||e.symbol===selection?.symbol);
  $('sweepHistory').innerHTML=history.map(e=>{const lower=e.direction==='LOWER',all=e.kind.startsWith('ALL_TRACKED_'),a=b?.attempts?.find(a=>a.id===e.id)??e.binance;return `<article class="sweep-event${e.id===selectedId?' is-selected':''}" data-sweep-id="${esc(e.id)}"><strong>${esc(e.symbol)} · ${all?'QUÉT HẾT CÁC CỤM ĐÃ CHỐT · PHÍA '+(lower?'DƯỚI → LONG':'TRÊN → SHORT'):'QUÉT HẾT CỤM PHÍA '+(lower?'DƯỚI':'TRÊN')}</strong><p>MARK ${f(e.markPrice)} · ${e.clearedCount}/${e.totalCount} cụm · phạm vi ${lower?'−':'+'}${f(e.maxDistancePct)}% · ${esc(t(e.at))}</p><small>Discord ${esc(e.delivery?.status??'chưa xác nhận')} · Binance ${esc(a?.status??(all?'không có kết quả / mẫu cũ không replay':'OBSERVE ONLY'))}${a?.orderId?' · orderId '+esc(a.orderId):''}${a?.reason?' · '+esc(a.reason):''}</small></article>`;}).join('')||'<p>Chưa ghi nhận lần quét mới sau khi bật. Không phát lại lịch sử chart.</p>';
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
 $('sweepRefresh').addEventListener('click',()=>void load());
 $('sweepDistance').addEventListener('input',()=>{distanceDirty=true;});
 setInterval(()=>{if(!document.hidden)void load();},15000);render();void load();
 return {setSelection(q){if(selection?.symbol!==q?.symbol){distanceDirty=false;$('sweepDistance').value='5';}selection=q?{symbol:q.symbol,range:q.range}:null;render();}};
}
