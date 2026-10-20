import {SHORT_SETUP_PATTERNS,shortSetupStateLabel,rankShortSetups} from './short-setup-model.js';
import './opposite-liquidity-toast.js?v=20261011-short-setup-v1';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(x,n=7)=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('vi-VN',{maximumFractionDigits:n});
const time=x=>x?new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
const target=new URLSearchParams(location.search).get('signal');
const delivery={QUIET_HOURS:'Giờ yên lặng · không gửi Push',SENT:'Push đã gửi',PARTIAL:'Push gửi một phần',FAILED:'Push lỗi/chưa rõ kết quả',NO_SUBSCRIBERS:'Chưa có thiết bị đăng ký',
  NOT_SELECTED:'Không thuộc mức push đã chọn',DISABLED:'Push đang tắt',PRE_START:'Có trước khi backend chạy',STALE:'Tin đã cũ',
  POSTING:'Đang gửi',UNKNOWN_AFTER_RESTART:'Chưa rõ kết quả sau restart'};
const discordDelivery={SENT:'Đã gửi',PARTIAL:'Gửi một phần',FAILED:'Lỗi/chưa rõ kết quả',NOT_CONFIGURED:'Chưa cấu hình',
  NOT_SELECTED:'Không thuộc mức tin đã chọn',DISABLED:'Đang tắt',PRE_START:'Có trước khi backend chạy',STALE:'Tin đã cũ',
  POSTING:'Đang gửi',UNKNOWN_AFTER_RESTART:'Chưa rõ kết quả sau restart'};
let data={},page=1,busy=false,settingsBusy=false,focused=false,failed=false;
const entryStatus={EXISTING_POSITION:'Đã có vị thế · không DCA',EXISTING_ORDER:'Đã có lệnh chờ',MAX_STRUCTURE_15:'Đủ max riêng 15',
  PROTECTION_DISABLED:'Coin đã tắt bảo vệ',CONTROL_CHANGED:'Control đã đổi',RUNTIME_OFF:'Runtime OFF',
  PRICE_RR_OR_AGE_BLOCKED:'Giá, R:R hoặc tuổi tín hiệu không còn đạt',BLOCKED_PRE_SUBMIT:'Bị chặn trước khi gửi',
  ERROR_OR_UNKNOWN:'Chưa rõ kết quả · không tự gửi lại',SUBMITTED:'Đã gửi MARKET',FILLED:'Đã khớp',NEW:'Binance đã nhận',
  SHARED_ENTRY_RESERVED:'Coin có tín hiệu khác đang vào',UNRESOLVED_PREVIOUS_ORDER:'Lệnh trước chưa rõ kết quả'};
function renderEntry() {
  const b=data.binance;
  if(!b){$('binance-status').textContent='Backend chưa cung cấp trạng thái MARKET; không suy ra đang bật.';return;}
  $('binance-status').textContent=`Master ${b.masterEnabled?'ON':'OFF'} · ${(b.routes??[]).map(r=>`${r.side} ${r.enabled?'ON':'OFF'}`).join(' · ')} · max riêng 15${b.openSlots!=null?` · slot kiểm tra gần nhất ${b.openSlots}/15`:''}${b.error?' · '+b.error:''}`;
  $('binance-attempts').innerHTML=(b.attempts??[]).map(a=>`<p><a href="/short-setup-watch?signal=${encodeURIComponent(a.id)}">${esc(a.symbol)} · ${esc(a.side)}</a> · ${esc(time(a.at))}<br>${esc(entryStatus[a.status]??a.status)}${a.orderId?` · order ${esc(a.orderId)}`:''}${a.reason?` · ${esc(a.reason)}`:''}</p>`).join('')||'<p class="muted">Chưa xử lý setup mới kể từ khi bật nhánh MARKET.</p>';
}

function chart(e) {
  const rows=e.chart??[];if(rows.length<2)return '';
  const levels=[e.zone?.low,e.zone?.high,e.invalidationPrice,e.targetPrice,e.triggerPrice].filter(x=>Number.isFinite(x)&&x>0);
  const low=Math.min(...rows.map(r=>r.low),...levels),high=Math.max(...rows.map(r=>r.high),...levels),padding=(high-low)*.08||high*.001;
  const y=p=>224-(p-low+padding)/(high-low+padding*2)*205;
  const x=i=>16+i*550/(rows.length-1);
  const lines=[[e.zone?.low,'#ffca56','Vùng'],[e.triggerPrice,'#e4f4f0','Kích hoạt'],[e.invalidationPrice,'#ff7791','Vô hiệu'],[e.targetPrice,'#33ddae',e.side==='LONG'?'Kháng cự':'Hỗ trợ']]
    .filter(([v])=>v>0).map(([v,color,label])=>`<line class="level" x1="10" x2="570" y1="${y(v)}" y2="${y(v)}" stroke="${color}"/><text x="575" y="${y(v)+4}">${esc(label)} ${num(v)}</text>`).join('');
  const candles=rows.map((r,i)=>{const color=r.close>=r.open?'#33ddae':'#ff7791';return `<line x1="${x(i)}" x2="${x(i)}" y1="${y(r.high)}" y2="${y(r.low)}" stroke="${color}"/><rect x="${x(i)-2.4}" width="4.8" y="${Math.min(y(r.open),y(r.close))}" height="${Math.max(1,Math.abs(y(r.open)-y(r.close)))}" fill="${color}"/>`;}).join('');
  return `<svg class="chart" viewBox="0 0 750 245" role="img" aria-label="Nến giá và các mức tham khảo">${lines}${candles}<text x="10" y="242">${esc(time(rows[0].closeTime))}</text><text x="340" y="242">${esc(time(rows.at(-1).closeTime))}</text></svg>`;
}
function card(e) {
  const long=e.side==='LONG',side=long?'LONG':'SHORT';
  const old=['CHASE','INVALIDATED','EXPIRED','DATA_GAP'].includes(e.state),ready=e.state==='READY',watch=e.state==='WATCH';
  return `<article class="setup ${ready?'ready':''} ${long?'long':'short'} ${old?'old':''} ${e.id===target?'selected':''}" data-signal-id="${esc(e.id)}">
    <div class="card-head"><div><a class="symbol" href="https://www.binance.com/en/futures/${encodeURIComponent(e.symbol)}" target="_blank" rel="noopener">${esc(e.symbol)} ↗</a>
      <div><span class="badge direction">${side}</span><span class="badge">${esc(SHORT_SETUP_PATTERNS[e.pattern]??'Mẫu cũ')}</span><span class="badge state">${esc(shortSetupStateLabel(e))}</span></div></div>
      <div class="score">${watch?'Chờ mẫu':`${num(e.score,0)}/100`}<small>Điểm bằng chứng</small></div></div>
    <p class="reason">${esc(e.reason)}</p>
    ${ready&&!e.priorityEligible?'<p class="warning">Đã có nến kích hoạt nhưng R:R chưa đạt 1,5 hoặc thiếu mục tiêu; chưa thuộc nhóm ưu tiên/push kích hoạt.</p>':''}
    <div class="metrics"><div><span>Giá nến đóng</span><strong>${num(e.price)}</strong></div>
      <div><span>${e.state==='WAIT_RETEST'?'Vùng chờ retest':'Kích hoạt tham khảo'}</span><strong>${num(e.triggerPrice)}</strong></div>
      <div><span>Mức vô hiệu</span><strong>${num(e.invalidationPrice)}</strong></div>
      <div><span>${long?'Kháng cự':'Hỗ trợ'} gần nhất · R:R</span><strong>${num(e.targetPrice)} · ${num(e.rewardRisk,2)}</strong></div></div>
    <p class="muted">Vùng ${num(e.zone?.low)} – ${num(e.zone?.high)} · ${num(e.zone?.touches,0)} swing · nến ${esc(time(e.updatedAt))}${e.deadline?` · hết hạn ${esc(time(e.deadline))}`:''}</p>
    <details data-detail-id="${esc(e.id)}"><summary>Căn cứ, biểu đồ và lịch sử</summary>
      <p>Sóng trước mẫu ${e.context?.dumped?'giảm −'+num(e.context.dumpDropPct,2):'tăng +'+num(e.context?.pumpGainPct,2)}% · VOL sóng ${num(e.context?.waveVolumeRatio,2)}× nền · ${long?'mua':'bán'} nến hiện tại ${num(long?e.takerBuyPct:e.takerSellPct,1)}% · VOL ${num(e.volumeRatio,2)}× nền20.</p>
      <p>EMA9 ${num(e.context?.ema9)} · EMA21 ${num(e.context?.ema21)} · RSI14 trước mẫu ${num(e.context?.rsi14,1)} · ATR20 ${num(e.context?.atr)}.</p>
      <div class="factors">${(e.factors??[]).map(f=>`<span class="${f.points>0?'pass':''}">${f.points>0?'✓':'○'} ${esc(f.label)} · +${num(f.points,0)}</span>`).join('')}</div>
      ${chart(e)}<div class="chart-legend"><span>Vàng: vùng</span><span>Đỏ: vô hiệu</span><span>Xanh: mục tiêu</span></div>
      <div class="timeline">${(e.timeline??[]).map(t=>`<p>${esc(time(t.at))} · ${esc(shortSetupStateLabel(e,t.state))} · ${esc(delivery[t.delivery?.status]??'Chưa gửi')} · Discord: ${esc(discordDelivery[t.discordDelivery?.status]??'Mẫu cũ · chưa ghi nhận gửi')}<br>${esc(t.reason)}</p>`).join('')}</div>
    </details><div class="links"><a href="/short-setup-watch?signal=${encodeURIComponent(e.id)}">Mở setup cụ thể</a></div></article>`;
}
export function renderShortSetupWatch(next) {
  data=next;failed=false;
  renderEntry();
  const c=data.coverage??{};$('coverage').textContent=`${c.ready??0}/${c.total??0} coin đủ nến · ${c.pumping??0} coin có sóng giá/volume · ${time(c.updatedAt)}`;
  if(!settingsBusy){$('push-enabled').checked=data.pushEnabled===true;$('push-early').checked=data.pushEarly===true;$('discord-enabled').checked=data.discordEnabled===true;}
  $('discord-status').textContent=data.discordConfigured?'Discord đã cấu hình trên backend · gửi setup mới theo mức tin đã chọn.':'Discord chưa được cấu hình trên backend.';
  for(const id of ['push-enabled','push-early','discord-enabled'])$(id).disabled=settingsBusy||Boolean(data.error);
  renderList();
}
function renderList() {
  const open=new Set([...document.querySelectorAll('details[data-detail-id][open]')].map(n=>n.dataset.detailId));
  const search=$('search').value.trim().toUpperCase(),view=$('view').value,pattern=$('pattern').value,state=$('state').value,side=$('side').value;
  let rows=view==='live'?rankShortSetups(data.live??[]):[...(data.history??[])];
  rows=rows.filter(e=>(!search||e.symbol.includes(search))&&(side==='ALL'||(e.side??'SHORT')===side)&&(pattern==='ALL'||e.pattern===pattern)
    &&(state==='ALL'||(state==='WAIT'?['WAIT_BREAK','WAIT_RETEST'].includes(e.state):e.state===state)));
  if(target&&data.selected&&!rows.some(e=>e.id===target))rows.unshift(data.selected);
  page=Math.max(1,Math.min(page,Math.ceil(rows.length/20)||1));
  $('status').textContent=failed?'Không lấy được dữ liệu mới; danh sách cũ đã ngừng cập nhật.':data.error??`${rows.length} kết quả · cập nhật mỗi 10 giây · mẫu mới đủ căn cứ được xếp trước.`;
  $('signals').innerHTML=rows.slice((page-1)*20,page*20).map(card).join('')||'<p class="muted">Chưa có coin đạt mẫu đang chọn. Xem phần căn cứ hoặc đổi bộ lọc; thiếu nến sẽ được ghi trong số coin đủ dữ liệu.</p>';
  for(const node of document.querySelectorAll('details[data-detail-id]'))node.open=open.has(node.dataset.detailId)||node.dataset.detailId===target;
  $('previous').disabled=page<=1;$('next').disabled=page*20>=rows.length;$('page-label').textContent=`${page} / ${Math.ceil(rows.length/20)||1}`;
  if(target&&!focused){const node=[...document.querySelectorAll('[data-signal-id]')].find(n=>n.dataset.signalId===target);if(node){node.scrollIntoView({block:'center'});focused=true;}}
}
async function refresh() {
  if(busy||document.hidden)return;busy=true;
  try {const r=await fetch(`/api/short-setup-watch${target?`?signal=${encodeURIComponent(target)}`:''}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error();renderShortSetupWatch(await r.json());}
  catch{failed=true;$('status').textContent='Không lấy được dữ liệu mới; danh sách cũ đã ngừng cập nhật.';
    $('binance-status').textContent='Chưa lấy được trạng thái mới; không suy ra MARKET đang bật.';}
  finally{busy=false;}
}
async function settings() {
  if(settingsBusy)return;settingsBusy=true;for(const id of ['push-enabled','push-early','discord-enabled'])$(id).disabled=true;
  try {const r=await fetch('/api/short-setup-watch',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({pushEnabled:$('push-enabled').checked,pushEarly:$('push-early').checked,discordEnabled:$('discord-enabled').checked}),signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw new Error();data={...await r.json(),binance:data.binance};$('settings-status').textContent='Đã lưu lựa chọn thông báo.';}
  catch{$('settings-status').textContent='Không lưu được lựa chọn; tải lại để kiểm tra trạng thái.';}
  finally{settingsBusy=false;renderShortSetupWatch(data);}
}
$('filters').addEventListener('submit',e=>{e.preventDefault();page=1;void refresh();});
for(const id of ['search','view','pattern','state','side'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;renderList();});
for(const id of ['push-enabled','push-early','discord-enabled'])$(id).addEventListener('change',()=>void settings());
$('previous').addEventListener('click',()=>{page--;renderList();});$('next').addEventListener('click',()=>{page++;renderList();});
void refresh();setInterval(()=>void refresh(),10000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
