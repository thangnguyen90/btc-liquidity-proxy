const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price = v => Number(v).toLocaleString('en-US',{maximumSignificantDigits:10});
const time = v => v ? new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}) : '—';
const role = w => `${zoneAppearance(w).name} · hướng gốc ${w.direction === 'UPPER' ? 'trên' : w.direction === 'LOWER' ? 'dưới' : 'chưa rõ'}`;
const labels = { TOUCHING:'ĐANG CHẠM VÙNG', PRICE_PASSED:'GIÁ ĐÃ VƯỢT VÙNG', CLOSED_BEYOND:'5M ĐÓNG VƯỢT VÙNG', REJECTED_AFTER_SWEEP:'ĐÃ QUÉT · 5M ĐÓNG TRỞ LẠI' };
let data = null, loading = false, mutating = false, page = 1;
const PAGE_SIZE = 50;
function zonePosition(w) {
  const mark=Number(w.markPrice), low=Number(w.zone?.low), high=Number(w.zone?.high);
  if (!(mark>0 && low>0 && high>=low)) return {side:'UNKNOWN',distance:null,label:'CHƯA CÓ GIÁ HỢP LỆ'};
  if(mark<low)return {side:'ABOVE',distance:(low-mark)/mark*100,label:'VÙNG NẰM TRÊN GIÁ'};
  if(mark>high)return {side:'BELOW',distance:(mark-high)/mark*100,label:'VÙNG NẰM DƯỚI GIÁ'};
  return {side:'INSIDE',distance:0,label:'GIÁ ĐANG TRONG VÙNG'};
}
function sortZoneWatches(watches, side='all', order='nearest') {
  return watches.map(w=>({w,position:zonePosition(w),old:zoneScenario(w).key==='OLD'}))
    .filter(row=>side==='all'||row.position.side===side)
    .sort((a,b)=>{
      // Archived lifecycle rows follow every current row, before pagination.
      if(a.old!==b.old)return a.old?1:-1;
      if(a.position.distance==null && b.position.distance!=null)return 1;
      if(b.position.distance==null && a.position.distance!=null)return -1;
      const difference=(a.position.distance??0)-(b.position.distance??0);
      return (order==='farthest'?-difference:difference)||a.w.symbol.localeCompare(b.w.symbol)||String(a.w.id).localeCompare(String(b.w.id));
    }).map(row=>row.w);
}
function zoneDistanceLabel(w) {
  const p=zonePosition(w);
  return `${p.label} · ${p.distance==null?'—':p.distance>0&&p.distance<0.01?'<0.01%':p.distance.toFixed(2)+'%'}`;
}
// Presentation only: direction to a fixed zone is not a sweep probability.
function zoneScenario(w) {
  const p=zonePosition(w);
  if(!w.enabled)return {key:'OLD',tone:'muted',title:'ĐÃ DỪNG THEO DÕI',note:'Không theo dõi sự kiện mới cho vùng này.'};
  if(w.consumedAtCapture)return {key:'OLD',tone:'muted',title:'VÙNG CŨ · KHÔNG ACTIVE',note:'Không dùng làm mục tiêu quét mới. Chưa có xác nhận quét từ nến theo dõi; cần lấy vùng mới.'};
  if(w.seen?.PRICE_PASSED || w.seen?.CLOSED_BEYOND || w.seen?.REJECTED_AFTER_SWEEP)
    return {key:'OLD',tone:'muted',title:'ĐÃ VƯỢT · KHÔNG PHẢI MỤC TIÊU MỚI',note:p.side==='INSIDE'?'Giá đang quay lại trong vùng đã vượt. Không đồng nghĩa sắp quét lần đầu.':'Lịch sử đã ghi nhận vượt vùng; vị trí hiện tại không làm vùng trở lại chưa quét.'};
  if(!w.socketFresh || p.side==='UNKNOWN')return {key:'UNKNOWN',tone:'muted',title:'CHƯA ĐỦ GIÁ MỚI',note:'Chờ socket cập nhật trước khi xác định hướng tới vùng.'};
  if(p.side==='INSIDE')return {key:'INSIDE',tone:'inside',title:'↔ ĐANG TRONG VÙNG',note:'Đã chạm vùng, chờ giá thoát lên trên hoặc xuống dưới. Chưa kết luận hướng tiếp theo.'};
  return p.side==='ABOVE'
    ? {key:'UP',tone:'up',title:'↑ VÙNG PHÍA TRÊN · THEO DÕI QUÉT LÊN',note:'Nếu giá tăng: chạm mép dưới → đi qua mép trên. Không phải tín hiệu LONG.'}
    : {key:'DOWN',tone:'down',title:'↓ VÙNG PHÍA DƯỚI · THEO DÕI QUÉT XUỐNG',note:'Nếu giá giảm: chạm mép trên → đi qua mép dưới. Không phải tín hiệu SHORT.'};
}
function scenarioMarkup(w) {
  const s=zoneScenario(w), p=zonePosition(w);
  const path=s.key==='UP'?`Chạm ${price(w.zone.low)} → qua ${price(w.zone.high)}`
    :s.key==='DOWN'?`Chạm ${price(w.zone.high)} → qua ${price(w.zone.low)}`
    :s.key==='INSIDE'?`Thoát lên > ${price(w.zone.high)} / xuống < ${price(w.zone.low)}`:'';
  return `<div class="scenario ${s.tone}"><strong>${esc(s.title)}</strong>${path?`<b class="scenario-path">${esc(path)}</b>`:''}<small>${esc(s.note)}</small>${w.historyIncomplete?'<small class="evidence-warning">⚠ Thiếu lịch sử nến: chưa xác nhận vùng chưa từng bị quét.</small>':''}${p.distance!=null?`<small>Khoảng cách tới vùng: ${zoneDistanceLabel(w).split(' · ')[1]} · không phải xác suất</small>`:''}</div>`;
}
function deliveryLabel(e) {
  if (!e.pushEnabled) return 'Push tắt tại lúc phát';
  if (!e.delivery) return 'Chờ gửi';
  if (e.delivery.skipped === 'PUSH_DISABLED') return 'Push đã tắt';
  if (e.delivery.skipped === 'HISTORICAL_EVENT') return 'Lịch sử · không Push trễ';
  if (e.delivery.sent > 0) return `Đã gửi ${e.delivery.sent} thiết bị`;
  if (e.delivery.error || e.delivery.failed) return 'Lỗi gửi Push';
  return 'Chưa có thiết bị nhận';
}
function diagram(w) {
  const appearance=zoneAppearance(w);
  const min = Math.min(w.markPrice,w.zone.low)*.98, max=Math.max(w.markPrice,w.zone.high)*1.02;
  const position = v => 100*(v-min)/(max-min);
  return `<div class="zone-visual ${appearance.className}"><div class="range" aria-label="MARK ${price(w.markPrice)}; ${appearance.name} ${price(w.zone.low)} đến ${price(w.zone.high)}"><span class="zone-band" style="left:${position(w.zone.low)}%;width:${Math.max(1,position(w.zone.high)-position(w.zone.low))}%"></span><span class="mark" style="left:${position(w.markPrice)}%"></span></div><div class="zone-price-label"><span>${appearance.label}</span><b>${price(w.zone.low)} – ${price(w.zone.high)}</b></div><small>${appearance.note}</small></div>`;
}
function zoneAppearance(w) {
  if(w.role==='MAIN_KILL')return {name:'MAIN KILL',className:'zone-main',label:'MAIN KILL · VÙNG VÀNG',note:'Vùng MAIN tại thời điểm lưu.'};
  if(w.role==='FAR_KILL')return {name:'FAR KILL',className:'zone-far',label:'FAR KILL · VÙNG TÍM',note:'Vùng xa riêng biệt, không thay thế MAIN KILL.'};
  return {name:'CHƯA RÕ LOẠI VÙNG',className:'zone-unknown',label:'VÙNG CHƯA XÁC ĐỊNH LOẠI',note:'Bản ghi thiếu loại vùng; không tự gán MAIN hoặc FAR.'};
}
function render() {
  if (!data) return;
  const trading=data.mainDistanceTrading;
  if(trading){
    $('mainDistanceStatus').textContent=`Auto Controls ${trading.masterEnabled?'ON':'OFF'} · ${trading.routes.map(r=>`${r.side} ${r.enabled?'ON':'OFF'}`).join(' · ')} · tối đa ${trading.maxOpenPositions??10} vị thế riêng · TP giá vùng / SL −30% ROE`;
    $('mainDistanceWhitelist').innerHTML=trading.routes.filter(r=>r.whitelistEligible===true&&Number(r.avgRoe)>4).map(r=>`<label class="check"><input type="checkbox" data-main-whitelist="${esc(r.key)}" ${r.enabled?'checked':''}>WHITELIST ${esc(r.side)} · closed AvgROE ${Number(r.avgRoe).toFixed(2)}% (${r.closedCount} vị thế)</label>`).join('');
    $('mainDistanceAttempts').innerHTML=trading.attempts.map(a=>`<p><b>${esc(a.symbol)} ${esc(a.side)} · ${esc(a.status)}</b><small>${time(a.at)} · TP ${price(a.takeProfitPrice)} · ${esc(a.error??'')}${a.orderId?` · Order ${esc(a.orderId)}`:''}</small></p>`).join('')||'Chưa có vùng đủ điều kiện được thử đặt lệnh.';
  }
  const needle=$('search').value.trim().toUpperCase(), filter=$('filter').value;
  const matched=sortZoneWatches(data.watches.filter(w=>w.symbol.includes(needle) && ($('zoneRole').value==='all'||w.role===$('zoneRole').value) && ($('scenarioFilter').value==='all'||zoneScenario(w).key===$('scenarioFilter').value) && (filter==='all' || filter==='active' && w.enabled
    || filter==='stopped' && !w.enabled || filter==='passed' && (w.seen?.PRICE_PASSED||w.consumedAtCapture))),$('zoneSide').value,$('sortOrder').value);
  const pages=Math.max(1,Math.ceil(matched.length/PAGE_SIZE)); page=Math.min(page,pages);
  const watches=matched.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  $('pageInfo').textContent=`Trang ${page}/${pages} · ${matched.length} vùng phù hợp`;
  $('prevPage').disabled=page<=1; $('nextPage').disabled=page>=pages;
  const active=data.watches.filter(w=>w.enabled);
  $('status').textContent=`Cập nhật ${time(data.generatedAt)} · ${new Set(active.map(w=>w.symbol)).size} coin · ${active.length} vùng đang theo dõi`;
  const job=data.importJob, running=job?.status==='RUNNING';
  $('importAll').disabled=mutating||running; $('stopImport').disabled=mutating||!running;
  if(job){
    const counts={};for(const item of job.items)counts[item.status]=(counts[item.status]??0)+1;
    $('importProgress').textContent=`${running?'Đang thêm toàn bộ':job.status==='STOPPED'?'Đã dừng đợt thêm':'Đã xử lý toàn bộ'}: ${job.items.length-(counts.PENDING??0)}/${job.items.length} coin · mới ${counts.ADDED??0} · có sẵn ${counts.EXISTING??0} · chưa thêm được ${(counts.ERROR??0)+(counts.NO_ZONE??0)} · chờ ${counts.PENDING??0}.`;
    const issues=job.items.filter(item=>['ERROR','NO_ZONE'].includes(item.status)&&item.symbol.includes(needle));
    $('importIssues').innerHTML=issues.map(item=>`<p><b>${esc(item.symbol)}</b> · ${esc(item.reason)}</p>`).join('')||'Chưa ghi nhận coin thiếu vùng hoặc lỗi tải.';
  }
  const expanded=new Set([...$('watchRows').querySelectorAll('details[open]')].map(el=>el.dataset.history));
  $('watchRows').innerHTML=watches.map(w=>`<tr class="${w.enabled?'':'disabled'}"><td><a href="/local-ai-trend-evaluation?symbol=${encodeURIComponent(w.symbol)}">${esc(w.symbol)}</a><small>${role(w)}</small>
    <details data-history="${esc(w.id)}" ${expanded.has(w.id)?'open':''}><summary>Lịch sử / dữ liệu</summary><small>Trạng thái lịch sử: ${esc(w.stateLabel)}<br>${esc(w.stateDescription??'')}${w.sweepAt?`<br>Vượt lần đầu ${time(w.sweepAt)}`:''}<br>Cố định ${time(w.capturedAt)}<br>Snapshot AI ${time(w.sourceAt)}<br>5m đã xử lý ${time(w.lastClosedAt)}</small></details></td>
    <td class="scenario-cell">${scenarioMarkup(w)}</td>
    <td><b>${price(w.markPrice)}</b><small class="zone-distance">${zoneDistanceLabel(w)}</small>${diagram(w)}<small>${w.socketFresh?'Socket đang cập nhật':'Chưa có socket mới · giá có thể cũ'}<br>${time(w.priceAt)}</small></td>
    <td><div class="actions"><label class="check"><input type="checkbox" data-push="${esc(w.id)}" ${w.pushEnabled?'checked':''} ${w.enabled?'':'disabled'}>Push</label>${w.enabled?`<button data-stop="${esc(w.id)}">Dừng vùng</button>`:'ĐÃ DỪNG'}</div></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Chưa có vùng phù hợp bộ lọc.</td></tr>';
  $('eventRows').innerHTML=data.events.filter(e=>e.symbol.includes(needle)).map(e=>`<tr><td>${time(e.at)}${e.candleAt?`<small>Nến đóng ${time(e.candleAt)}</small>`:''}</td><td><b>${esc(e.symbol)}</b><small>${role(e)}</small></td><td>${labels[e.state]??esc(e.state)}</td><td><b>${price(e.price)}</b><small>${price(e.zone.low)} – ${price(e.zone.high)}</small></td><td>${deliveryLabel(e)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Chưa có thay đổi vùng.</td></tr>';
}
async function load() {
  if(loading)return;loading=true;
  try { const response=await fetch('/api/liquidity-zone-manager',{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error(`HTTP ${response.status}`);data=await response.json();render();
  } catch(e){$('status').textContent=`Chưa tải được: ${e.message}`;}finally{loading=false;}
}
async function update(body) {
  if(mutating)return;mutating=true; $('add').disabled=$('importAi').disabled=$('importAll').disabled=true;
  $('actionStatus').textContent=body.action==='import-ai'?'Đang lấy vùng top 10 từ dữ liệu AI…':'Đang cập nhật…';
  try{const response=await fetch('/api/liquidity-zone-manager',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180_000)});
    const result=await response.json();if(!response.ok)throw Error(result.error??`HTTP ${response.status}`);
    data=result;render();$('actionStatus').textContent=result.results ? result.results.map(r=>`${r.symbol}: ${r.added?'đã thêm vùng':r.error}`).join('\n') || 'AI hiện chưa có candidates.' : 'Đã lưu.';
  }catch(e){$('actionStatus').textContent=`Chưa cập nhật được: ${e.message}`;await load();}
  finally{mutating=false;$('add').disabled=$('importAi').disabled=false;render();}
}
$('addForm').addEventListener('submit',e=>{e.preventDefault();void update({action:'add',symbol:$('coin').value,pushEnabled:$('newPush').checked});});
$('importAi').addEventListener('click',()=>void update({action:'import-ai',pushEnabled:$('newPush').checked}));
$('importAll').addEventListener('click',()=>void update({action:'import-all',pushEnabled:$('newPush').checked}));
$('stopImport').addEventListener('click',()=>void update({action:'stop-import'}));
$('prevPage').addEventListener('click',()=>{page=Math.max(1,page-1);render();});
$('nextPage').addEventListener('click',()=>{page+=1;render();});
for(const id of ['zoneSide','sortOrder','scenarioFilter','zoneRole'])$(id).addEventListener('change',()=>{page=1;render();});
$('search').addEventListener('input',()=>{page=1;render();});$('filter').addEventListener('change',()=>{page=1;render();});$('refresh').addEventListener('click',()=>void load());
$('watchRows').addEventListener('change',e=>{if(e.target.dataset.push)void update({action:'update',id:e.target.dataset.push,pushEnabled:e.target.checked});});
$('watchRows').addEventListener('click',e=>{const button=e.target.closest('[data-stop]');if(button)void update({action:'update',id:button.dataset.stop,enabled:false});});
$('search').value=new URLSearchParams(location.search).get('symbol')??'';
$('mainDistanceWhitelist').addEventListener('change',async e=>{
  const key=e.target.dataset.mainWhitelist;if(!key)return;
  e.target.disabled=true;
  try{
    const response=await fetch('/api/auto-entry-controls',{method:'POST',headers:{'content-type':'application/json','x-orders-token':localStorage.getItem('orders_token')??''},body:JSON.stringify({action:'route',key,enabled:e.target.checked})});
    if(!response.ok)throw Error('Chưa lưu được. Đăng nhập tại Orders để đổi WHITELIST.');
  }catch(error){$('actionStatus').textContent=error.message;}finally{await load();}
});
void load();setInterval(()=>void load(),3000);
