import {HEATMAP_LAB_VERSION,heatmapQuery,normalizeHeatmap,demoHeatmap} from './coinglass-heatmap-model.js?v=20261018-v3';
import {HeatmapCanvas} from './coinglass-heatmap-canvas.js?v=20261018-v3';
import {mountHeatmapPriceAlerts} from './heatmap-price-alerts.js?v=20261018-v1';
import {mountHeatmapSweepWatch} from './heatmap-sweep-watch.js?v=20261020-v3-dual-entry';
const $=id=>document.getElementById(id),datasets=new Map(),panels=new Map();
const priceAlerts=mountHeatmapPriceAlerts();
const sweepWatch=mountHeatmapSweepWatch();
const names={DEMO:'DEMO · DỮ LIỆU MINH HỌA',IMPORT:'JSON · NGƯỜI DÙNG KHAI BÁO',BINANCE_LOCAL:'BINANCE · TỰ TÍNH ƯỚC LƯỢNG'};
const errors={INVALID_QUERY:'Coin/range không hợp lệ. Dùng symbol Binance USDT.',FULL_MATRIX_REQUIRED:'File chỉ có zones/thiếu ma trận: cần y_axis, price_candlesticks và liquidation_leverage_data.',MODEL_MISMATCH:'Model trong file không khớp ô đang nhập.',SYMBOL_MISMATCH:'Coin trong file không khớp coin đã chọn.',RANGE_MISMATCH:'Khoảng thời gian trong file không khớp lựa chọn.',DATA_SIZE_LIMIT:'Ma trận quá lớn hoặc thiếu trục giá/nến.',INVALID_PRICE_AXIS:'Trục giá không hợp lệ.',INVALID_CANDLES:'Nến OHLC/timestamp không hợp lệ.',UNORDERED_CANDLES:'Nến cần theo thứ tự thời gian, không trùng.',INVALID_CELLS:'Ô heatmap có tọa độ/cường độ không hợp lệ.',DUPLICATE_CELL:'Có ô trùng tọa độ trong ma trận.',PROVIDER_RESPONSE_ERROR:'File chứa mã lỗi từ provider, không phải dữ liệu chart.'};
let view=null,full=null,busy=false,epoch=0,controller=null,raf=0;
for(const model of [1,3]){const root=document.querySelector(`[data-model="${model}"]`);panels.set(model,{root,badge:root.querySelector('.source-badge'),meta:root.querySelector('.chart-meta'),chart:new HeatmapCanvas(root.querySelector('canvas'),{tooltip:root.querySelector('.chart-tooltip'),onView:setView})});}
function query(model=1){let symbol=$('symbol').value.trim().toUpperCase();if(!symbol.endsWith('USDT'))symbol+='USDT';return heatmapQuery({symbol,range:$('range').value,model});}
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const scenarioPrice=n=>Number.isFinite(n)?Number(n.toPrecision(8)).toString():'—';
function renderScenarios(s,reason='Chưa có phân tích. Tìm coin để xem kịch bản.'){
 $('consensus-zones').textContent='';$('scenario-plans').textContent='';$('scenario-preference').textContent='ĐANG CHỜ';delete $('scenario-preference').dataset.side;
 if(s?.status!=='OK'){$('scenario-context').textContent=s?.reason??reason;return;}
 const states={LONG:'ƯU TIÊN QUAN SÁT LONG',SHORT:'ƯU TIÊN QUAN SÁT SHORT',CONFLICT:'HAI HƯỚNG XUNG ĐỘT',WAIT:'CHƯA CÓ HƯỚNG ĐỦ ĐIỀU KIỆN'};
 $('scenario-preference').textContent=states[s.preference]??states.WAIT;if(['LONG','SHORT'].includes(s.preference))$('scenario-preference').dataset.side=s.preference;
 $('scenario-context').textContent=`${s.symbol} · khung ${s.interval} · giá đóng tham chiếu ${scenarioPrice(s.referencePrice)} · nến xét ${new Date(s.asOf).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} VN. Vùng đã xác định trước nến này, lúc ${new Date(s.zonesAsOf).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}.`;
 $('consensus-zones').innerHTML='<div class="scenario-zones">'+['ABOVE','BELOW'].map(side=>{const zones=(s.zones??[]).filter(z=>z.side===side);return '<div><b>'+ (side==='ABOVE'?'Cụm đồng thuận phía trên':'Cụm đồng thuận phía dưới')+'</b><br>'+ (zones.length?zones.map(z=>esc(scenarioPrice(z.low)+' – '+scenarioPrice(z.high))).join('<br>'):'Chưa có cụm đủ điều kiện')+'</div>';}).join('')+'</div>';
 $('scenario-plans').innerHTML=(s.plans??[]).map(p=>`<article class="entry-plan" data-side="${esc(p.side)}" data-state="${esc(p.state)}"><h3>${esc(p.title)}</h3><span class="plan-state">${p.state==='CONDITIONS_MET'?'ĐỦ ĐIỀU KIỆN QUAN SÁT':p.state==='WAIT_ZONE'?'CHỜ VÙNG ĐỒNG THUẬN':'ĐANG CHỜ · XEM ĐIỀU KIỆN THIẾU'}</span><div class="entry-levels">${[
  ['Mốc kích hoạt',p.triggerPrice],['Giá tham chiếu',p.referenceEntry],['Mức vô hiệu',p.invalidationPrice],['Mục tiêu gần nhất',p.targetPrice],['R:R sau chi phí',p.rewardRisk],['Rủi ro tới vô hiệu (%)',p.riskPct]
 ].map(([label,n])=>`<div><small>${label}</small><b>${label.startsWith('R:')||label.startsWith('Rủi')?(Number.isFinite(n)?n.toFixed(2):'—'):scenarioPrice(n)}</b>${!label.startsWith('R:')&&!label.startsWith('Rủi')&&Number.isFinite(n)&&n>0?`<button class="choose-alert-price" type="button" data-heatmap-alert-price="${n}" data-symbol="${esc(s.symbol)}" title="Điền mốc vào form cảnh báo; chưa lưu hoặc gửi Push">Chọn mốc Push</button>`:''}</div>`).join('')}</div><ul class="entry-reasons">${(p.checks??[]).map(c=>`<li class="${c.pass?'passed':'pending'}">${c.pass?'✓':'—'} ${esc(c.label)}</li>`).join('')}</ul></article>`).join('');
}
function setBusy(value){busy=value;$('load').disabled=value;}
function setSource(message,mode=''){$('sourceState').textContent=message;document.querySelector('.source-note').dataset.mode=mode;}
function domain(data){const pad=(data.maxPrice-data.minPrice)*.015||data.maxPrice*.01;return {time:[data.start,data.end],price:[data.minPrice-pad,data.maxPrice+pad]};}
function updateDomain(){
 const values=[...datasets.values()];if(!values.length){full=null;view=null;return;}
 full={time:[Math.min(...values.map(x=>x.start)),Math.max(...values.map(x=>x.end))],price:[Math.min(...values.map(x=>domain(x).price[0])),Math.max(...values.map(x=>domain(x).price[1]))]};view=[...full.time];
}
function setView(next){
 if(!full)return;const min=Math.min(...[...datasets.values()].map(d=>d.step))*8,max=full.time[1]-full.time[0],span=Math.max(Math.min(min,max),Math.min(max,next[1]-next[0]));
 const start=Math.max(full.time[0],Math.min(full.time[1]-span,next[0]));view=[start,start+span];scheduleDraw();
}
function scheduleDraw(){cancelAnimationFrame(raf);raf=requestAnimationFrame(draw);}
function draw(){
 const values=[...datasets.values()],sources=new Set(values.map(d=>d.source));
 for(const [model,panel] of panels){const data=datasets.get(model)??null;const d=data?($('sync').checked?full:domain(data)):null;
  panel.chart.set(data,d,data?view:null,{floor:Number($('floor').value)/100,log:$('scale').value==='log'});
 }
 if(values.length===2){const [a,b]=values,overlap=Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));$('comparison').textContent=sources.size>1?'HAI NGUỒN KHÁC NHAU: kiểm tra nguồn từng chart trước khi đối chiếu.':sources.has('DEMO')?'DEMO: hai khung dùng cùng dữ liệu minh họa renderer, không phải kết quả tự tính từ thị trường.':overlap<Math.min(a.end-a.start,b.end-b.start)*.8?'Khoảng dữ liệu hai model không trùng đủ: hãy kiểm tra thời gian trước khi so sánh.':sources.has('BINANCE_LOCAL')?'Cùng nến Binance: Model1 tích lũy trọng số volume; Model3 tích lũy OI tăng và co cụm khi OI giảm. Cường độ 0–100 chuẩn hóa riêng từng model, không so số USD.':'JSON do người dùng khai báo nguồn và model; chưa xác minh thuật toán.';}
 else $('comparison').textContent='Chưa đủ hai model có dữ liệu. Không dùng một model thay cho model còn thiếu.';
}
function clear({message='Chưa dựng heatmap từ Binance'}={}){
 priceAlerts.setSelection(null);
 sweepWatch.setSelection(null);
 epoch++;controller?.abort();controller=null;datasets.clear();setBusy(false);updateDomain();setSource(message);
 renderScenarios(null,message);
 for(const [model,p] of panels){p.badge.textContent='CHƯA CÓ DỮ LIỆU';delete p.badge.dataset.source;p.meta.textContent=`Chưa có ma trận Model ${model}.`;p.chart.tooltip.hidden=true;}
 scheduleDraw();
}
function apply(model,data){
 datasets.set(model,data);const p=panels.get(model);p.badge.textContent=names[data.source]??'NGUỒN CHƯA RÕ';p.badge.dataset.source=data.source;
 const date=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
 p.meta.textContent=`${data.symbol} · ${data.range}${data.inputs?.interval?' · nến'+data.inputs.interval:''} · ${data.candles.length.toLocaleString()} nến / ${data.cells.length.toLocaleString()} ô · ${date(data.start)} → ${date(data.end-data.step)} VN${data.source==='BINANCE_LOCAL'?` · MARK ${data.inputs.markCoveragePct.toFixed(0)}%${model===3?' · OI '+data.inputs.oiCoveragePct.toFixed(0)+'%':''} · chỉ số 0–100`:''}${data.cells.length?'':' · Không có cụm theo mô hình trong dữ liệu này, chỉ vẽ nến'}`;
 p.meta.title=(data.notes??[]).join('\n');
 updateDomain();scheduleDraw();
}
function links(){try{const q=query();for(const a of document.querySelectorAll('[data-binance]'))a.href='https://www.binance.com/en/futures/'+encodeURIComponent(q.symbol);}catch{}}
$('load').addEventListener('click',async()=>{
 let q;try{q=query();}catch{clear({message:errors.INVALID_QUERY});return;}
 $('symbol').value=q.symbol;const searchUrl=new URL(location.href);searchUrl.searchParams.set('symbol',q.symbol);searchUrl.searchParams.set('range',q.range);searchUrl.searchParams.delete('demo');history.replaceState(null,'',searchUrl);
 clear({message:'Đang tải nến Binance, MARK và OI để tự dựng hai model…'});priceAlerts.setSelection(q);sweepWatch.setSelection(q);links();setBusy(true);const token=epoch;controller=new AbortController();
 try{
  const response=await fetch('/api/coinglass-heatmap-lab?'+new URLSearchParams({symbol:q.symbol,range:q.range}),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(28000)])});
  if(!response.ok)throw Error();const result=await response.json();if(token!==epoch)return;
  if(result.version!==HEATMAP_LAB_VERSION||!Array.isArray(result.models))throw Error();
  let loaded=0;for(const item of result.models){const p=panels.get(item.model);if(!p)continue;
   if(item.status==='OK'&&item.data?.source==='BINANCE_LOCAL'&&item.data.estimated===true&&item.data.model===item.model&&item.data.symbol===q.symbol&&item.data.range===q.range){apply(item.model,item.data);loaded++;}
   else {p.badge.textContent='CHƯA ĐỦ DỮ LIỆU';p.meta.textContent=item.message??'Model này chưa dựng được.';}
  }
  setSource(loaded?`Đã tự dựng ${loaded}/2 model từ Binance · CÁC VÙNG LÀ ƯỚC LƯỢNG.`:'Chưa dựng được hai model từ Binance. Kiểm tra thông báo từng khung hoặc thử tải lại.');
  renderScenarios(result.scenarios?.symbol===q.symbol&&result.scenarios?.range===q.range?result.scenarios:null,'Chưa đủ hai model hoặc backend chưa cung cấp kịch bản cho dữ liệu này.');
 }catch(error){if(token===epoch){setSource('Không tải được dữ liệu Binance. Chưa dựng chart; thử lại sau.');renderScenarios(null,'Không tải được dữ liệu; chưa lập kịch bản.');}}finally{if(token===epoch)setBusy(false);}
});
$('demo').addEventListener('click',()=>{let q;try{q=query();}catch{setSource(errors.INVALID_QUERY);return;}clear();links();const now=Date.now();for(const model of [1,3])apply(model,demoHeatmap({...q,model},now));setSource('DEMO MINH HỌA · KHÔNG PHẢI DỮ LIỆU THỊ TRƯỜNG','DEMO');renderScenarios(null,'DEMO chỉ minh họa chart; không lập kịch bản vào lệnh từ dữ liệu dựng.');});
$('clear').addEventListener('click',()=>clear());
for(const input of document.querySelectorAll('[data-import]'))input.addEventListener('change',async()=>{
 const file=input.files?.[0],model=Number(input.dataset.import);if(!file)return;
 const token=++epoch;controller?.abort();setBusy(false);
 renderScenarios(null,'JSON nhập chỉ để đối chiếu chart; chưa xác minh nguồn để lập kịch bản.');
 try{if(file.size>32000000)throw Error('DATA_SIZE_LIMIT');const q=query(model),payload=JSON.parse(await file.text());if(token!==epoch)return;const data=normalizeHeatmap(payload,{...q,source:'IMPORT'});apply(model,data);links();setSource('JSON nhập trên thiết bị · nguồn và nhãn model do người dùng khai báo; chưa xác minh.');}
 catch(error){if(token===epoch){datasets.delete(model);const p=panels.get(model);p.badge.textContent='JSON BỊ TỪ CHỐI';delete p.badge.dataset.source;p.meta.textContent=errors[error.message]??'File JSON không hợp lệ.';updateDomain();scheduleDraw();setSource('Không vẽ payload lỗi hoặc ma trận nhầm model.');}}finally{input.value='';}
});
function selectionChanged(){clear({message:'Đã đổi coin/range. Hãy chọn lại nguồn dữ liệu.'});links();}
$('symbol').addEventListener('input',selectionChanged);
$('range').addEventListener('change',selectionChanged);
$('symbol').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('load').click();}});
$('floor').addEventListener('input',()=>{$('floorText').textContent=$('floor').value+'%';scheduleDraw();});for(const id of ['scale','sync'])$(id).addEventListener('change',scheduleDraw);
for(const [id,factor] of [['zoomIn',.7],['zoomOut',1.4]])$(id).addEventListener('click',()=>{if(view){const mid=(view[0]+view[1])/2,span=(view[1]-view[0])*factor;setView([mid-span/2,mid+span/2]);}});
$('reset').addEventListener('click',()=>{if(full){view=[...full.time];scheduleDraw();}});
async function init(){
 const params=new URLSearchParams(location.search);if(params.has('symbol'))$('symbol').value=params.get('symbol');if(params.has('range')&&[...$('range').options].some(x=>x.value===params.get('range')))$('range').value=params.get('range');links();scheduleDraw();
 try{const r=await fetch('/api/coinglass-heatmap-lab/status',{cache:'no-store',signal:AbortSignal.timeout(8000)}),s=await r.json();$('apiState').textContent=s.source==='BINANCE_LOCAL'?'Nguồn: Binance công khai → tự tính trên máy chủ. Không sử dụng API Coinglass.':'Backend chưa nạp bản tự tính từ Binance.';}catch{$('apiState').textContent='Chưa kiểm tra được backend. Có thể thử tải lại; JSON/DEMO vẫn hoạt động trên thiết bị.';}
 if(params.get('demo')==='1')$('demo').click();else $('load').click();
}
void init();
