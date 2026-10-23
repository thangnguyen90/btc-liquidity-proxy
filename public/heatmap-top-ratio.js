import {HEATMAP_TOP_RATIO_VERSION,topRatioQuery,normalizeTopRatioRows} from './heatmap-top-ratio-model.js?v=20261022-v2';
export {HEATMAP_TOP_RATIO_VERSION};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(n,d=4)=>Number(n).toLocaleString('en-US',{maximumFractionDigits:d});
const date=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});
const tickTime=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export function buildTopRatioChart(rows,step){
 if(!rows.length)return null;
 const width=Math.max(500,rows.length*5),top=24,bottom=266,height=300,first=rows[0].timestamp,last=rows.at(-1).timestamp,span=Math.max(step,last-first);
 const min=Math.min(...rows.map(r=>r.longShortRatio)),max=Math.max(...rows.map(r=>r.longShortRatio)),pad=Math.max((max-min)*.12,max*.01,.001),low=Math.max(0,min-pad),high=max+pad;
 const x=t=>rows.length===1?width/2:8+(t-first)/span*(width-16),y=v=>bottom-(v-low)/(high-low)*(bottom-top),bar=Math.max(1,Math.min(16,step/span*(width-16)*.7));
 const grid=[0,25,50,75,100].map(p=>`<line x1="0" x2="${width}" y1="${bottom-p/100*(bottom-top)}" y2="${bottom-p/100*(bottom-top)}" stroke="#dce3ec" stroke-dasharray="3 4"/>`).join('');
 const bars=rows.map(r=>`<g class="top-ratio-bar"><rect x="${x(r.timestamp)-bar/2}" y="${top}" width="${bar}" height="${r.shortAccount*(bottom-top)}" fill="#f24b64"/><rect x="${x(r.timestamp)-bar/2}" y="${bottom-r.longAccount*(bottom-top)}" width="${bar}" height="${r.longAccount*(bottom-top)}" fill="#27c99b"/></g>`).join('');
 const segments=[];for(const r of rows){if(!segments.length||r.timestamp-segments.at(-1).at(-1).timestamp!==step)segments.push([]);segments.at(-1).push(r);}
 const lines=segments.map(rs=>`<polyline class="top-ratio-line" points="${rs.map(r=>`${x(r.timestamp)},${y(r.longShortRatio)}`).join(' ')}" fill="none" stroke="#111827" stroke-width="2.2" vector-effect="non-scaling-stroke"/>${rs.length===1?`<circle cx="${x(rs[0].timestamp)}" cy="${y(rs[0].longShortRatio)}" r="2.5" fill="#111827"/>`:''}`).join('');
 const times=Array.from({length:5},(_,i)=>{const t=first+(last-first)*i/4;return `<text x="${x(t)}" y="290" text-anchor="${i===0?'start':i===4?'end':'middle'}">${esc(tickTime(t))}</text>`;}).join('');
 const left=`<svg class="top-ratio-axis left" viewBox="0 0 46 ${height}" preserveAspectRatio="none" aria-hidden="true"><text x="42" y="14" text-anchor="end">%</text>${[0,25,50,75,100].map(p=>`<text x="42" y="${bottom-p/100*(bottom-top)+4}" text-anchor="end">${p}%</text>`).join('')}</svg>`;
 const right=`<svg class="top-ratio-axis right" viewBox="0 0 70 ${height}" preserveAspectRatio="none" aria-hidden="true"><text x="7" y="14">L/S</text>${[0,25,50,75,100].map(p=>`<text x="7" y="${bottom-p/100*(bottom-top)+4}">${number(low+p/100*(high-low))}</text>`).join('')}</svg>`;
 const html=`${left}<div class="top-ratio-scroll"><svg class="top-ratio-svg" style="--ratio-width:${width}px" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" tabindex="0" role="img" aria-label="Tỷ lệ tài khoản top trader: cột Long xanh, Short đỏ, đường ratio đen. Mũi tên trái/phải xem điểm; Enter ghim, Escape tắt.">${grid}${bars}${lines}${times}<g class="top-ratio-crosshair" hidden><line y1="${top}" y2="${bottom}" stroke="#64748b" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><circle r="4" fill="#111827" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/></g></svg></div>${right}`;
 return {html,width,first,last,step,low,high,top,bottom,x,y};
}
export function mountHeatmapTopRatio(){
 const $=id=>document.getElementById(id),root=$('heatmap-top-ratio');
 if(!root)return {setSelection(){}};
 let selection=null,sequence=0,controller=null,timer=null,snapshot=null,chart=null,pinned=false,index=-1,drag=null,suspended=false;
 function hide(){pinned=false;$('topRatioReadout').hidden=true;root.querySelector('.top-ratio-crosshair')?.setAttribute('hidden','');}
 function state(kind,text){root.dataset.state=kind;$('topRatioState').textContent=text;}
 function clear(){snapshot=null;chart=null;index=-1;hide();$('topRatioPlot').textContent='';$('topRatioLatest').textContent='';$('topRatioMeta').textContent='';}
 function show(i,pin=false){
  if(!snapshot?.rows.length||!chart)return;
  index=Math.max(0,Math.min(snapshot.rows.length-1,i));const row=snapshot.rows[index];if(pin)pinned=true;
  const out=$('topRatioReadout');out.textContent=`${date(row.timestamp)} VN · LONG ${number(row.longAccount*100,2)}% · SHORT ${number(row.shortAccount*100,2)}% · Long/Short ratio ${number(row.longShortRatio)}x`;
  out.hidden=false;const cross=root.querySelector('.top-ratio-crosshair');cross.removeAttribute('hidden');const line=cross.querySelector('line'),dot=cross.querySelector('circle'),xx=chart.x(row.timestamp);
  line.setAttribute('x1',xx);line.setAttribute('x2',xx);dot.setAttribute('cx',xx);dot.setAttribute('cy',chart.y(row.longShortRatio));
 }
 function indexAt(event){
  const svg=root.querySelector('.top-ratio-svg');if(!svg||!chart)return -1;const rect=svg.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*chart.width;
  let best=0,dist=Infinity;for(let i=0;i<snapshot.rows.length;i++){const d=Math.abs(chart.x(snapshot.rows[i].timestamp)-px);if(d<dist){dist=d;best=i;}}return best;
 }
 root.addEventListener('pointermove',event=>{if(event.target.closest?.('.top-ratio-svg')&&event.pointerType!=='touch'&&!drag&&!pinned)show(indexAt(event));});
 root.addEventListener('pointerout',event=>{if(!pinned&&event.target.closest?.('.top-ratio-svg')&&!event.relatedTarget?.closest?.('.top-ratio-svg'))hide();});
 root.addEventListener('pointerdown',event=>{if(event.isPrimary!==false&&event.target.closest?.('.top-ratio-svg'))drag={id:event.pointerId,x:event.clientX,y:event.clientY};});
 root.addEventListener('pointerup',event=>{if(!drag||event.pointerId!==drag.id)return;const start=drag;drag=null;if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)return;if(pinned)hide();else show(indexAt(event),true);});
 root.addEventListener('pointercancel',()=>{drag=null;});
 root.addEventListener('keydown',event=>{if(!event.target.closest?.('.top-ratio-svg')||!snapshot?.rows.length)return;
  if(event.key==='Escape'){event.preventDefault();hide();}
  else if(['Enter',' '].includes(event.key)){event.preventDefault();if(pinned)hide();else show(index<0?snapshot.rows.length-1:index,true);}
  else if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();show((index<0?snapshot.rows.length-1:index)+(event.key==='ArrowRight'?1:-1),pinned);}
 });
 function schedule(delay=60000){clearTimeout(timer);if(selection&&!suspended)timer=setTimeout(()=>{if(document.hidden)schedule();else void load();},Math.max(60000,delay));}
 function render(data){
  const previous=snapshot,oldScroll=root.querySelector('.top-ratio-scroll'),wasAtEnd=!oldScroll||oldScroll.scrollWidth-oldScroll.clientWidth-oldScroll.scrollLeft<8,scrollLeft=oldScroll?.scrollLeft??0,pinnedAt=pinned?previous?.rows[index]?.timestamp:null;
  hide();snapshot=data;const rows=data.rows,latest=rows.at(-1);chart=buildTopRatioChart(rows,data.step);$('topRatioPlot').innerHTML=chart?.html??'';
  const scroll=root.querySelector('.top-ratio-scroll');if(scroll)scroll.scrollLeft=wasAtEnd?scroll.scrollWidth-scroll.clientWidth:scrollLeft;
  $('topRatioLatest').textContent=latest?`LONG ${number(latest.longAccount*100,2)}% · SHORT ${number(latest.shortAccount*100,2)}% · Ratio ${number(latest.longShortRatio)}x`:'';
  $('topRatioMeta').textContent=`${data.symbol} · theo tài khoản · ${data.period} · ${rows.length} điểm${latest?' · '+date(rows[0].timestamp)+' → '+date(latest.timestamp)+' VN':''} · tải ${date(data.fetchedAt)} VN${data.truncated?' · tối đa500 điểm mới nhất: không đủ toàn bộ khoảng '+data.range:''}${data.gaps?' · '+data.gaps+' khoảng gián đoạn, đường đen không nối qua khoảng thiếu':''}.`;
  const stale=latest&&Date.now()-latest.timestamp>data.step*2;
  state(!latest?'empty':stale?'stale':'ready',!latest?'Binance chưa có mẫu ratio trong khoảng này.':stale?'Dữ liệu ratio cũ · xem thời điểm mẫu mới nhất.':'Dữ liệu Binance · tự cập nhật mỗi 60 giây khi mở trang.');
  if(pinnedAt){const found=rows.findIndex(r=>r.timestamp===pinnedAt);if(found>=0)show(found,true);}
 }
 async function load(){
  if(!selection||suspended)return;
  const q=topRatioQuery({...selection,period:$('topRatioPeriod').value}),token=++sequence;controller?.abort();controller=new AbortController();const signal=controller.signal;$('topRatioRefresh').disabled=true;
  if(!snapshot)state('loading','Đang tải ratio top trader của '+q.symbol+'…');
  let retryMs=60000;
  try{
   const response=await fetch('/api/coinglass-heatmap-lab/ratio?'+new URLSearchParams({symbol:q.symbol,range:q.range,period:q.period}),{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
   if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();if(token!==sequence||signal.aborted)return;
   if(data.version!==HEATMAP_TOP_RATIO_VERSION||data.source!=='BINANCE_TOP_TRADER_ACCOUNT_RATIO'||data.symbol!==q.symbol||data.range!==q.range||data.period!==q.resolvedPeriod||data.step!==q.step)throw Error('INVALID_RATIO_DATA');
   if(data.status==='UNAVAILABLE'){retryMs=Math.max(60000,Math.min(3600000,Number(data.retryAfterMs)||60000));throw Error(data.reason??'RATIO_UNAVAILABLE');}
   if(!['OK','STALE','EMPTY'].includes(data.status)||!Number.isFinite(data.fetchedAt)||data.fetchedAt>Date.now()+2000||!Number.isFinite(data.from))throw Error('INVALID_RATIO_DATA');
   data.rows=normalizeTopRatioRows(data.rows.map(r=>({...r,symbol:q.symbol})),{symbol:q.symbol,step:q.step,now:Date.now(),from:data.from});render(data);
  }catch(error){if(token!==sequence||signal.aborted)return;
   const reason=error.message==='INVALID_RATIO_DATA'?'Dữ liệu ratio không hợp lệ; không dựng giá trị thay thế.':error.message==='RATIO_RATE_LIMIT'?'Binance giới hạn tải ratio; đang chờ lượt cập nhật sau.':error.message==='RATIO_BUSY'?'Đang chờ lượt tải ratio; hai heatmap vẫn hoạt động riêng.':'Chưa tải được ratio Binance; không suy ra LONG/SHORT hoặc PASS/FAIL.';
   state('error',reason+(snapshot?' Đang hiển thị bản đã tải trước đó, xem giờ mẫu bên dưới.':''));
  }finally{if(token===sequence){$('topRatioRefresh').disabled=!selection;schedule(retryMs);}}
 }
 function stop(){sequence++;controller?.abort();controller=null;clearTimeout(timer);timer=null;drag=null;}
 $('topRatioPeriod').addEventListener('change',()=>{stop();clear();if(selection)void load();});
 $('topRatioRefresh').addEventListener('click',()=>void load());
 window.addEventListener('pagehide',()=>{suspended=true;stop();});
 window.addEventListener('pageshow',event=>{if(event.persisted){suspended=false;if(selection)void load();}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&selection&&!suspended&&(!snapshot||Date.now()-snapshot.fetchedAt>=60000))void load();});
 return {setSelection(value){stop();clear();selection=value?{symbol:value.symbol,range:value.range}:null;$('topRatioCoin').textContent=selection?.symbol??'Chưa chọn coin';$('topRatioRefresh').disabled=!selection;$('topRatioPeriod').disabled=!selection;
  if(selection)void load();else state('idle','Tìm coin Binance phía trên để xem ratio. DEMO/JSON không có ratio thị trường.');}};
}
