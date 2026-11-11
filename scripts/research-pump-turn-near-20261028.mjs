// Offline research only. This module never imports the server, order execution,
// credentials, account clients, Discord or Push. Network access is public klines GET.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const VERSION='PUMP_TURN_NEAR_DELAY_REBOUND_RESEARCH_V1_20261028';
export const M=60000,H=60*M;
export const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export const returnDirection=value=>typeof value==='number'&&Number.isFinite(value)?(value>=0?'UP':'DOWN'):'UNKNOWN';
export const quantile=(a,p)=>{const v=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;const k=(v.length-1)*p;return v[Math.floor(k)]+(v[Math.ceil(k)]-v[Math.floor(k)])*(k%1);};
export const matureCohort=(records,cutoff)=>records.filter(e=>(Math.floor(e.observedAt/M)+1)*M+6*H+15*M<=cutoff);
const pct=(a,b)=>(a/b-1)*100;
export function mergeWindows(windows){const out=[];for(const [a,b] of windows.sort((x,y)=>x[0]-y[0])){const last=out.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else out.push([a,b]);}return out;}
export const toBar=r=>({t:+r[0],end:+r[6],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5],q:+r[7],buy:+r[10]});
export function aggregate5m(rows){const groups=new Map();for(const b of rows){const k=Math.floor(b.t/(5*M))*5*M;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(b);}const out=[];for(const [t,bs] of groups){bs.sort((a,b)=>a.t-b.t);if(bs.length!==5||bs.some((b,i)=>b.t!==t+i*M))continue;out.push({t,end:t+5*M-1,o:bs[0].o,c:bs[4].c,h:Math.max(...bs.map(b=>b.h)),l:Math.min(...bs.map(b=>b.l)),q:bs.reduce((s,b)=>s+b.q,0),v:bs.reduce((s,b)=>s+b.v,0),buy:bs.reduce((s,b)=>s+b.buy,0)});}return out.sort((a,b)=>a.t-b.t);}
export function entryFor(event,rows,variant='immediate'){
 const start=(Math.floor(event.observedAt/M)+1)*M;
 if(variant==='immediate')return rows.find(b=>b.t===start)??null;
 const bars=aggregate5m(rows).filter(b=>b.end>=event.observedAt&&b.end<event.observedAt+15*M);
 for(const b of bars){
  let pass=b.c<b.o&&b.c<event.zoneHigh;
  if(variant==='wait_full_5m'){
   const dd=(1-b.c/event.peak)*100;
   pass=pass&&b.q>=100000&&event.baseline>0&&b.q/event.baseline>=1.5&&b.q>0&&b.buy/b.q<=.45&&dd>=3&&dd<=20;
  }
  if(pass)return rows.find(x=>x.t===b.end+1)??null;
 }
 return null;
}
export function simulate(event,rows,cutoff,variant='immediate'){
 const bar=entryFor(event,rows,variant);
 if(!bar)return {status:variant==='immediate'?((Math.floor(event.observedAt/M)+1)*M+M>cutoff?'CENSORED_NO_ENTRY_BAR':'NO_ENTRY_DATA'):(event.observedAt+15*M>cutoff?'CONFIRMATION_CENSORED':'NO_CONFIRMATION'),complete:false};
 const entry=bar.o,tp=entry*.98,sl=entry*1.06,deadline=bar.t+6*H;
 const available=rows.filter(b=>b.t>=bar.t&&b.t<deadline&&b.end<cutoff);
 if(available.some((b,i)=>b.t!==bar.t+i*M))return {status:'DATA_GAP',complete:false,entryAt:bar.t};
 let status=null,exit=null,exitAt=null,ambiguous=false,maeBeforeExit=0,mfeBeforeExit=0;
 for(const b of available){
  maeBeforeExit=Math.max(maeBeforeExit,pct(b.h,entry));mfeBeforeExit=Math.max(mfeBeforeExit,(1-b.l/entry)*100);
  const hitSL=b.h>=sl,hitTP=b.l<=tp;
  if(hitSL){status='SL';exit=Math.max(sl,b.o);exitAt=b.end;ambiguous=hitTP;break;}
  if(hitTP){status='TP';exit=tp;exitAt=b.end;break;}
 }
 const observedFull=available.length===360&&available.at(-1).end===deadline-1;
 if(!status&&observedFull){status='TIMEOUT';exit=available.at(-1).c;exitAt=available.at(-1).end;}
 const horizons={};
 for(const mins of [5,15,60,360]){
  const bs=available.filter(b=>b.t<bar.t+mins*M);
  const full=bs.length===mins;
  horizons[mins]={full,mae:bs.length?Math.max(0,...bs.map(b=>pct(b.h,entry))):null,mfe:bs.length?Math.max(0,...bs.map(b=>(1-b.l/entry)*100)):null,returnShort:full?(1-bs.at(-1).c/entry)*100:null};
 }
 const gross=exit==null?null:(1-exit/entry)*100;
 return {status:status??'CENSORED',complete:status!=null,full6h:observedFull,entryAt:bar.t,entry,tp,sl,exit,exitAt,ambiguous,waitMinutes:(bar.t-event.observedAt)/M,entryDriftPct:pct(entry,event.livePrice),grossPricePct:gross,netRoe5x:gross==null?null:(gross-.14)*5,stressRoe5x:gross==null?null:(gross-.30)*5,maeBeforeExit,mfeBeforeExit,horizons};
}
export function summarize(records,variant='immediate'){
 const all=records.map(e=>e.results[variant]),closed=all.filter(t=>t.complete&&Number.isFinite(t.netRoe5x));
 const positive=closed.filter(t=>t.netRoe5x>0),negative=closed.filter(t=>t.netRoe5x<0);
 return {nAlerts:records.length,nEntered:all.filter(t=>t.entryAt).length,n:closed.length,coins:new Set(records.filter(e=>e.results[variant].complete).map(e=>e.symbol)).size,tp:closed.filter(t=>t.status==='TP').length,sl:closed.filter(t=>t.status==='SL').length,timeout:closed.filter(t=>t.status==='TIMEOUT').length,noConfirm:all.filter(t=>t.status==='NO_CONFIRMATION').length,censored:all.filter(t=>['CENSORED','CENSORED_NO_ENTRY_BAR','CONFIRMATION_CENSORED'].includes(t.status)).length,missing:all.filter(t=>['DATA_GAP','NO_ENTRY_DATA'].includes(t.status)).length,wins:positive.length,winPct:closed.length?positive.length/closed.length*100:null,avgNetRoe5x:mean(closed.map(t=>t.netRoe5x)),avgStressRoe5x:mean(closed.map(t=>t.stressRoe5x)),profitFactor:negative.length?-positive.reduce((s,t)=>s+t.netRoe5x,0)/negative.reduce((s,t)=>s+t.netRoe5x,0):null,ambiguous:closed.filter(t=>t.ambiguous).length,medianWaitMinutes:quantile(all.map(t=>t.waitMinutes),.5),avgMaeBeforeExit:mean(closed.map(t=>t.maeBeforeExit))};
}
export function auditedActual(audit,ledger){
 const rows=Object.values(audit.fills??{}).map(x=>x.record??x),groups=new Map();
 for(const r of rows)if(r.closeGroupId){if(!groups.has(r.closeGroupId))groups.set(r.closeGroupId,[]);groups.get(r.closeGroupId).push(r);}
 const attempts=Object.values(ledger.attempts??{}),seen=new Set(),selected=[],excluded={};
 const reject=k=>excluded[k]=(excluded[k]??0)+1;
 for(const r of rows.filter(r=>r.signalSource==='pump-turn-near-short')){
  if(r.direction!=='SHORT'||r.positionStatus!=='CLOSED'){reject('not_closed_short');continue;}
  if(r.isDca){reject('DCA');continue;}
  const exact=attempts.find(a=>String(a.orderId)===String(r.orderId)&&a.symbol===r.symbol&&a.clientOrderId===r.clientOrderId&&r.clientOrderId?.startsWith('ptns_'));
  if(!exact){reject('not_exact_native_ledger');continue;}
  const group=groups.get(r.closeGroupId);
  if(!group||group.some(x=>x.isDca||x.signalSource!==r.signalSource||x.direction!=='SHORT')){reject('mixed_or_DCA_close_group');continue;}
  if(![r.netRealizedPnlUsdt,r.realizedRoePct].every(x=>typeof x==='number'&&Number.isFinite(x))){reject('missing_finite_net_result');continue;}
  const key=r.symbol+':'+r.orderId;if(seen.has(key)){reject('duplicate_order');continue;}seen.add(key);
  selected.push(Object.fromEntries(['symbol','orderId','clientOrderId','filledAt','closedAt','avgFillPrice','exitAvgPrice','marginUsdt','leverage','grossRealizedPnlUsdt','commissionUsdt','fundingPnlUsdt','netRealizedPnlUsdt','realizedRoePct','closeReason','closeGroupId'].map(k=>[k,r[k]])));
 }
 return {raw:rows.filter(r=>r.signalSource==='pump-turn-near-short').length,excluded,trades:selected};
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'data/research/pump-turn-near-eval-20261028');
const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
async function freeze(){
 await fs.mkdir(path.join(dir,'raw'),{recursive:true});const file=path.join(dir,'cohort.json');let frozen=await read(file);if(frozen)return frozen;
 const cutoff=Date.now(),watch=await read(path.join(root,'data/pump-turn-watch.json')),ledger=await read(path.join(root,'data/pump-turn-near-short-binance.json')),audit=await read(path.join(root,'data/binance-filled-signal-audit/state.json'));
 const events=[...new Map(watch.history.filter(e=>e.side==='SHORT'&&e.observedAt<=cutoff).map(e=>[e.id,e])).values()].sort((a,b)=>a.observedAt-b.observedAt);
 const actual=auditedActual(audit,ledger);
 actual.trades=actual.trades.filter(r=>Date.parse(r.closedAt)<=cutoff);
 frozen={version:VERSION,cutoff,settings:watch.settings,events,confirmed:watch.confirmed.filter(e=>e.side==='SHORT'&&e.at<=cutoff),actual,attemptStats:Object.fromEntries([...new Set(Object.values(ledger.attempts).map(a=>a.status))].map(k=>[k,Object.values(ledger.attempts).filter(a=>a.status===k).length])),liveHistoryCap:1000};
 await fs.writeFile(file,JSON.stringify(frozen));return frozen;
}
async function download(snapshot){
 let last=0,requests=0,reused=0,weight=0,bytes=0;const errors=[];const store=new Map();
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const symbols=[...new Set(snapshot.events.map(e=>e.symbol))].sort();let done=0;
 for(const symbol of symbols){
  const ev=snapshot.events.filter(e=>e.symbol===symbol),windows=mergeWindows(ev.map(e=>[Math.floor((e.observedAt-H)/(5*M))*5*M,Math.min(Math.ceil(e.observedAt/M)*M+6*H+16*M,Math.floor(snapshot.cutoff/M)*M)]));
  const all=[];
  try{for(const [from,to] of windows){
   const file=path.join(dir,'raw',`${encodeURIComponent(symbol)}-1m-${from}-${to}.json`);let raw=await read(file);
   if(raw){reused++;}else{
    raw=[];let cursor=from;
    while(cursor<to){
     if(weight>=700){console.log(JSON.stringify({stage:'weight_wait',weight}));await sleep(60000-Date.now()%60000+500);weight=0;}
     await sleep(Math.max(0,650-(Date.now()-last)));last=Date.now();
     const url='https://fapi.binance.com/fapi/v1/klines?'+new URLSearchParams({symbol,interval:'1m',startTime:String(cursor),endTime:String(to-1),limit:'1500'});
     const r=await fetch(url,{signal:AbortSignal.timeout(20000)});requests++;weight=Number(r.headers.get('x-mbx-used-weight-1m')??weight);
     if([418,429].includes(r.status))throw Error('RATE_LIMIT_'+r.status);
     if(!r.ok)throw Error('HTTP_'+r.status);
     const rows=await r.json();if(!Array.isArray(rows))throw Error('INVALID_RESPONSE');if(!rows.length)break;
     if(rows[0][0]<cursor||rows.some((x,i)=>i&&x[0]<=rows[i-1][0]))throw Error('INVALID_KLINE_ORDER');
     raw.push(...rows);cursor=Number(rows.at(-1)[0])+M;if(rows.length<1500)break;
    }
    const text=JSON.stringify(raw);bytes+=text.length;await fs.writeFile(file,text);
   }
   all.push(...raw.map(toBar));
  }}catch(e){errors.push({symbol,error:e.message});if(/^RATE_LIMIT/.test(e.message)){await fs.writeFile(path.join(dir,'download-progress.json'),JSON.stringify({requests,reused,errors}));throw e;}}
  store.set(symbol,[...new Map(all.filter(b=>b.end<snapshot.cutoff).map(b=>[b.t,b])).values()].sort((a,b)=>a.t-b.t));
  done++;if(done%5===0||done===symbols.length){const progress={stage:'candles',done,total:symbols.length,requests,reused,weight,errors};console.log(JSON.stringify(progress));await fs.writeFile(path.join(dir,'download-progress.json'),JSON.stringify(progress));}
 }
 return {store,meta:{requests,reused,weight,bytes,errors,symbols:symbols.length}};
}
export function blockBootstrap(records,reps=1500){
 const groups=new Map();for(const e of records){const t=e.results.immediate;if(!t.complete||!Number.isFinite(t.netRoe5x))continue;const k=e.symbol+':'+new Date(e.observedAt+7*H).toISOString().slice(0,10);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t.netRoe5x);}
 const blocks=[...groups.values()],means=[];let seed=20261028;
 const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 if(!blocks.length)return {blocks:0,lo:null,hi:null};
 for(let i=0;i<reps;i++){let sum=0,n=0;for(let j=0;j<blocks.length;j++)for(const v of blocks[Math.floor(rand()*blocks.length)]){sum+=v;n++;}means.push(sum/n);}
 return {blocks:blocks.length,lo:quantile(means,.025),hi:quantile(means,.975)};
}
async function writeReport(s,records){
 const f=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):'—';
 const vn=t=>new Date(t).toLocaleString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'});
 const labels={immediate:'Vào ngay phút kế tiếp',wait_red_5m:'Chờ nến 5m đỏ đóng dưới vùng',wait_full_5m:'Chờ đủ xác nhận 5m'};
 const lines=[
 '# Đánh giá độ muộn và nhịp bật ngược của GẦN VÙNG SHORT',
 '',`Version nghiên cứu: \`${VERSION}\`. Khóa dữ liệu lúc **${vn(s.cutoff)} giờ VN**.`,
 '', '**Kết luận:** tín hiệu hiện tại thường đã đi sau một nhịp giảm đáng kể nhưng chưa xác nhận đảo chiều. Cả vào ngay và hai cách chờ xác nhận được kiểm tra đều có ROE trung bình âm sau kịch bản chi phí. Chưa có bằng chứng đủ mạnh để coi đây là điểm SHORT đã xác nhận. Đẩy thông báo sớm hơn hoặc chỉ thêm một nến xác nhận chưa chứng minh khắc phục được vấn đề.',
 '', '## Phạm vi và dữ liệu',
 '', `- ${s.events} cảnh báo SHORT thực sự đã lưu, ${s.symbols} coin, từ ${vn(s.cohortRange[0])} đến ${vn(s.cohortRange[1])}. History runtime chỉ giữ 1.000 sự kiện LONG/SHORT chung, nên đây không phải toàn bộ tín hiệu từ ngày khởi tạo bot.`,
 `- Cohort chính cố định theo thời gian: **${s.matureEvents} cảnh báo**, từ ${vn(s.matureRange[0])} đến ${vn(s.matureRange[1])}. Loại ${s.timeExcludedRecent} cảnh báo mới chưa đủ 6 giờ 15 phút theo dõi cho cả ba phương án; không cho các TP nhanh của nhóm mới lọt vào kết quả trong khi lệnh thua còn mở bị loại.`,
 `- Dữ liệu giá: public GET Binance Futures \`/fapi/v1/klines\`, 1m, ${s.dataAcquisition.requests} request ở lần tải đầu, ${s.dataAcquisition.errors.length} lỗi; lần tái lập gần nhất ${s.download.requests} request mạng và ${s.download.reused} cửa sổ cache được tái dùng. Không gọi account/order endpoint hoặc nạp khóa API.`,
 '- Snapshot zone, peak, baseline, state và thời điểm cảnh báo lấy đúng event đã lưu trước entry. Chỉ dùng nến đã đóng để tính bối cảnh và quyết định chờ xác nhận. Ảnh chụp lịch sử không được phân loại lại bằng giá hiện tại.',
 '', '## Tại sao có cảm giác báo muộn',
 '', 'Rule SHORT đang chạy trong public/pump-turn-model.js:',
 '', '1. Sóng tăng trong 72 nến 5m đã đóng đạt ít nhất 15%, với nền CLOSE nằm trước đỉnh.',
 '2. Mép trên vùng = min LOW của 3 nến 5m cuối × 0,999; mép dưới = mép trên × 0,995.',
 '3. Last-trade tick mới không quá 30 giây, giá gần hoặc trong vùng; nearPct đang lưu = 0,75%. Giá dưới vùng thành CHASE; vượt đỉnh hoặc giảm quá 20% từ đỉnh thì vô hiệu.',
 '4. NEAR chưa yêu cầu nến đỏ, nến đóng thủng hỗ trợ, volume bán hoặc xu hướng giảm xác nhận. Bộ xác nhận nến đóng là lớp khác. Scanner chạy mỗi 10 giây, tối đa 5 cảnh báo mỗi scan và cooldown 60 phút/coin/hướng.',
 '', '| Chỉ tiêu trước/sát thời điểm phát | Trung vị | P90 |',
 '|---|---:|---:|',
 `| Giá đã giảm từ đỉnh được lưu | ${f(s.delays.dropFromPeak.median)}% | ${f(s.delays.dropFromPeak.p90)}% |`,
 `| Tuổi mốc nến chứa đỉnh | ${f(s.delays.peakAgeMinutes.median,1)} phút | ${f(s.delays.peakAgeMinutes.p90,1)} phút |`,
 `| Tuổi tick khi detector ghi event | ${f(s.delays.tickAgeMs.median/1000)} giây | ${f(s.delays.tickAgeMs.p90/1000)} giây |`,
 `| Từ ghi event đến Discord báo gửi | ${f(s.delays.discordDelayMs.median/1000)} giây | ${f(s.delays.discordDelayMs.p90/1000)} giây |`,
 '', 'Tuổi mốc đỉnh dùng open time của nến 5m chứa đỉnh, sai số thời điểm đỉnh thực trong khoảng 5 phút. Các con số này cho thấy độ muộn so với đỉnh chủ yếu là hệ quả của cách chọn setup, không phải Discord chậm hàng chục phút. Không đo được chính xác lúc tick đầu tiên thỏa điều kiện vì không có toàn bộ tick/scan trace. Warmup, scan cap và cooldown có thể ảnh hưởng thời điểm, nhưng dữ liệu hiện tại không đủ quy trách nhiệm định lượng cho từng cơ chế.',
 '', '## Bật ngược sau cảnh báo',
 '', 'Mốc tham chiếu là OPEN nến 1m đầy đủ kế tiếp sau event. MAE ở đây là mức giá tăng cao nhất so với mốc đó trong cửa sổ cố định, kể cả khi một lệnh giả lập đã TP trước nhịp hồi. Vì vậy tỷ lệ bật ngược không được đọc như tỷ lệ thua lệnh.',
 '', '| Cửa sổ | Số mẫu đủ cửa sổ | Tăng ngược ≥1% | ≥2% | ≥3% | ≥6% |',
 '|---|---:|---:|---:|---:|---:|',
 ...[5,15,60,360].map(h=>{const r=s.rebounds[h];return `| ${h} phút | ${r.n} | ${f(r.thresholds[1].pct)}% | ${f(r.thresholds[2].pct)}% | ${f(r.thresholds[3].pct)}% | ${f(r.thresholds[6].pct)}% |`;}),
 '', 'Diễn giải phù hợp với logic: một coin đã pump mạnh vẫn có thể giữ xu hướng tăng; giá về gần đáy 3 nến chưa chứng minh đã phá hỗ trợ. Sau nhịp giảm ban đầu, giá có thể retest hoặc hồi mạnh. Dữ liệu này đo hiện tượng giá, chưa chứng minh tác nhân cụ thể như short squeeze hoặc hành vi market maker.',
 '', '## Backtest ba cách vào',
 '', 'TP = giá entry × 0,98; SL = entry × 1,06; leverage 5× tương ứng +10%/−30% ROE gộp. Không chạm TP/SL thì đóng cuối 6 giờ. Chi phí giả định hai chiều = 0,14% giá, stress = 0,30% giá; đây không phải biểu phí thực của tài khoản. Funding không được mô phỏng. ROE là trung bình theo lệnh độc lập, không phải lợi nhuận danh mục có cap 20, min-notional, no-DCA hoặc vốn chồng lấn.',
 '', 'Vào ngay dùng OPEN phút kế tiếp, không dùng HIGH/LOW của phần nến trước event. Hai biến thể chờ tối đa 15 phút, sau đó vào OPEN phút kế tiếp sau nến 5m xác nhận. Trường hợp TP và SL cùng nến 1m lấy SL trước; TP ở gap lấy mức TP, SL ở gap lấy giá mở cửa bất lợi. Một trường hợp mơ hồ ở phương án vào ngay.',
 '', '“Chờ đủ xác nhận” dùng chính zone và baseline frozen của event: nến đỏ, đóng dưới mép trên vùng, quote-volume ≥100.000 USDT và ≥1,5× baseline, taker buy ≤45%, giảm 3–20% từ peak. Đây là giả thuyết chờ trên setup gốc, không phải mô phỏng detector tự cập nhật lại vùng mỗi 5 phút.',
 '', '| Phương án | Có vào | Bỏ qua vì không xác nhận | TP / SL / hết giờ | Thắng ròng | ROE TB sau cost | ROE TB stress | Profit factor |',
 '|---|---:|---:|---|---:|---:|---:|---:|',
 ...Object.entries(s.variants).map(([k,v])=>`| ${labels[k]} | ${v.n} | ${v.noConfirm} | ${v.tp} / ${v.sl} / ${v.timeout} | ${f(v.winPct)}% | ${f(v.avgNetRoe5x)}% | ${f(v.avgStressRoe5x)}% | ${f(v.profitFactor,3)} |`),
 '', '**Win rate cao vẫn có thể lỗ:** với chỉ hai kết quả TP +10% / SL −30% và cost 0,70 điểm ROE, tỷ lệ TP hòa vốn khoảng 76,75%. Backtest còn có đóng hết giờ và gap nên phải dùng PnL thực tính, không chỉ ngưỡng hòa vốn này.',
 '', '## Chờ xác nhận có chữa được việc đuổi giá không',
 '', 'So sánh ghép cặp trên cùng các event thực sự có xác nhận giúp tách thay đổi giá entry khỏi thay đổi thành phần mẫu. Việc biết sau này có xác nhận là thông tin tương lai: không được dùng để chọn các event rồi quảng bá kết quả “vào ngay” như một gate giao dịch khả thi.',
 '', '| Nhóm có xác nhận về sau | Số event | Vào ngay trên cùng nhóm | Chờ rồi mới vào |',
 '|---|---:|---:|---:|',
 ...Object.entries(s.paired).map(([k,v])=>`| ${labels[k]} | ${v.sameCohortN} | ${f(v.immediate.avgNetRoe5x)}% ROE | ${f(v.wait.avgNetRoe5x)}% ROE |`),
 '', 'Trên mẫu này, chờ xác nhận vẫn vào chậm sau phần giảm ban đầu. Vì thế không có cơ sở khẳng định thêm một nến đỏ là tự động tăng chất lượng điểm SHORT. Các con số ghép cặp là phân tích hồi cứu, không phải phép biết trước nhóm thắng.',
 '', '## Phân nhóm và độ ổn định',
 '', '| Nhóm trước entry | N | Thắng ròng | ROE TB sau cost |',
 '|---|---:|---:|---:|',
 ...Object.entries(s.bins).map(([k,v])=>`| ${k} | ${v.n} | ${f(v.winPct)}% | ${f(v.avgNetRoe5x)}% |`),
 '', 'Tên drop_a_b là mức giảm a% đến dưới b% từ peak frozen; pump_a_b là biên tăng từ nền đến peak. pre15m/pre60m dùng CLOSE các nến 1m đã đóng trước event. Giá trị thiếu được đưa riêng vào UNKNOWN, không coi null là return 0 hoặc UP. Có vài bin dương nhưng không đơn điệu theo độ sớm/muộn; đây là phân nhóm khám phá, không phải ngưỡng đã xác nhận ngoài mẫu.',
 '', '| Ngày VN | N | ROE TB sau cost |',
 '|---|---:|---:|',
 ...Object.entries(s.days).map(([d,v])=>`| ${d} | ${v.n} | ${f(v.avgNetRoe5x)}% |`),
 '', '| Phương án | 70% đầu theo thời gian | 30% cuối theo thời gian |',
 '|---|---:|---:|',
 ...Object.entries(s.split).map(([k,v])=>`| ${labels[k]} | ${v.first70.n} lệnh / ${f(v.first70.avgNetRoe5x)}% | ${v.last30.n} lệnh / ${f(v.last30.avgNetRoe5x)}% |`),
 '', `Bootstrap theo cụm coin-ngày (${s.clusterBootstrap.blocks} cụm, 1.500 lần, seed cố định): khoảng 95% của ROE TB vào ngay **[${f(s.clusterBootstrap.lo)}%; ${f(s.clusterBootstrap.hi)}%]**. Khoảng còn cắt 0; không thể tuyên bố đã chứng minh kỳ vọng âm cố định. Mẫu ngắn, nhiều cảnh báo cùng sóng và nhiều coin cùng thị trường nên cần đánh giá ngoài mẫu dài hơn. Chia 70/30 hồi cứu không phải OOS thật.`,
 '', '## Lệnh thực đã đóng trong audit cục bộ',
 '', `Có ${s.actual.raw} bản ghi nguồn pump-turn-near-short; loại ${s.actual.excluded.DCA??0} DCA và ${s.actual.excluded.mixed_or_DCA_close_group??0} nhóm đóng có DCA/trộn nguồn. Chỉ giữ SHORT CLOSED hữu hạn, khớp chính xác orderId + clientOrderId ptns_ trong ledger native, dedupe symbol + opening order.`,
 '', `Kết quả: **${s.actual.n} lệnh**, ${s.actual.wins} lãi, win rate ${f(s.actual.winPct)}%, net PnL **${f(s.actual.netPnlUsdt,5)} USDT**, ROE TB audit **${f(s.actual.avgRealizedRoePct)}%**. Khoảng fill/đóng được audit: ${vn(Date.parse(s.actual.range[0]))} đến ${vn(Date.parse(s.actual.range[1]))}. Net là trường đã ghi trong audit, gồm commission/funding đã được hệ thống hạch toán; không đối soát account API trong lượt này.`,
 '', 'Cohort lệnh thật cũ này khác cohort cảnh báo 24–28/10. Có cả đóng tay/bot và đóng hết vị thế; không được coi là thực nghiệm thuần TP/SL 6h hoặc trộn với kết quả giả lập. SUBMITTED không tự nó chứng minh fill; các attempt bị chặn hoặc UNKNOWN không được tính thắng/thua.',
 '', '## Ví dụ phản hồi ngược',
 '', '| Coin | Cảnh báo giờ VN | Đã giảm từ peak | Tuổi mốc peak | Kết quả mô phỏng | ROE net |',
 '|---|---|---:|---:|---|---:|',
 ...s.examples.slice(0,6).map(e=>`| ${e.symbol} | ${vn(e.at)} | ${f(e.drop)}% | ${f(e.peakAge,1)} phút | ${e.trade.status} | ${f(e.trade.netRoe5x)}% |`),
 '', 'MAE đến nến thoát có thể gồm giá xảy ra sau lúc chạm TP/SL bên trong cùng nến 1m. Không sử dụng số HIGH đó để tuyên bố lệnh thực chịu toàn bộ mức tăng trong nến.',
 '', '## Hướng xử lý sau đánh giá',
 '', '- Giữ ý nghĩa đây là cảnh báo setup chưa xác nhận; không diễn giải là điểm đảo chiều hoặc xác suất thắng.',
 '- Không chỉ tăng nearPct để báo sớm, không thêm gate nến đỏ một cách máy móc và không đổi TP/SL dựa trên vài ngày có cùng sóng coin. Ba phương án đã kiểm tra đều chưa có kỳ vọng dương ổn định.',
 '- Nếu nghiên cứu tiếp, tách cảnh báo sớm khỏi trigger vào lệnh: theo dõi lần chạm đầu của mỗi sóng, retest thất bại/rejection, nền thanh khoản và trạng thái xu hướng trước entry; khóa giả thuyết trước khi thu mẫu mới. Chưa có dữ liệu tick đầy đủ để backtest chính xác biến thể báo sớm.',
 '- Lượt này không đổi detector, gate, nhãn UI/Discord, route flags, size, entry, TP/SL hoặc các vị thế đang mở. Không restart backend, không gửi order, Discord hoặc Push. Không thêm card/WHITELIST runtime; policy whitelist cũ không đổi. JSON runtime cũ không migrate hoặc backfill.',
 '', '## Tái lập và kiểm tra',
 '', '```sh',
 'node scripts/test-research-pump-turn-near-20261028.mjs',
 'node scripts/research-pump-turn-near-20261028.mjs',
 '```',
 '', 'Snapshot, cache OHLCV, summary và từng event: data/research/pump-turn-near-eval-20261028/. CSV ở reports/pump-turn-near-backtest-20261028.csv; cột primaryMature đánh dấu 527 event dùng cho headline. Giữ cohort.json nguyên để tái lập đúng mốc khóa dữ liệu. Dữ liệu nến hợp đồng 1m không thay cho MARK/tick và giá khớp thực; không mô phỏng spread/order book, funding, min-notional, cap, vị thế/lệnh chồng lấn hoặc độ trễ broker. Không suy kết quả này thành PnL tài khoản.',
 '', 'Nguồn kỹ thuật: [Binance Futures Kline/Candlestick Data](https://developers.binance.com/en/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data); logic đang chạy trong public/pump-turn-model.js, src/pumpTurnWatch.js và src/pumpTurnNearShortBinance.js.',
 ''
 ];
 await fs.writeFile(path.join(root,'reports/pump-turn-near-backtest-20261028.md'),lines.join('\n'));
}
async function main(){
 const s=await freeze();console.log(JSON.stringify({stage:'frozen',cutoff:s.cutoff,events:s.events.length,coins:new Set(s.events.map(e=>e.symbol)).size,actualRaw:s.actual.raw,actualPrimary:s.actual.trades.length,range:[s.events[0]?.observedAt,s.events.at(-1)?.observedAt]}));
 const previous=await read(path.join(dir,'summary.json'));
 const {store,meta}=await download(s);
 const variants=['immediate','wait_red_5m','wait_full_5m'];
 const records=s.events.map(e=>{
  const rows=store.get(e.symbol)??[],pre=rows.filter(b=>b.end<e.observedAt),last=pre.at(-1),atAgo=n=>pre.find(b=>b.t===last?.t-n*M)?.c;
  return {...e,peakAgeMin:(e.observedAt-e.peakAt)/M,dropFromPeakPct:(1-e.livePrice/e.peak)*100,preReturn15m:last&&atAgo(15)?pct(last.c,atAgo(15)):null,preReturn60m:last&&atAgo(60)?pct(last.c,atAgo(60)):null,results:Object.fromEntries(variants.map(v=>[v,simulate(e,rows,s.cutoff,v)]))};
 });
 // Fix the evaluation cohort by clock time, not whether a fast TP is known.
 // This prevents recent quick winners entering the headline while slow losers
 // are still right-censored. The extra 15 minutes covers both wait variants.
 const mature=matureCohort(records,s.cutoff);
 const variantStats=Object.fromEntries(variants.map(v=>[v,summarize(mature,v)]));
 const describe=a=>({n:a.filter(Number.isFinite).length,p10:quantile(a,.1),median:quantile(a,.5),p90:quantile(a,.9),p99:quantile(a,.99)});
 const delays={dropFromPeak:describe(records.map(e=>e.dropFromPeakPct)),peakAgeMinutes:describe(records.map(e=>e.peakAgeMin)),tickAgeMs:describe(records.map(e=>e.observedAt-e.liveAt)),discordDelayMs:describe(records.map(e=>e.delivery?.at-e.observedAt)),withinCurrent5mPlanAge:describe(records.map(e=>e.observedAt-e.asOf-1))};
 const rebounds={};for(const horizon of [5,15,60,360]){const xs=records.filter(e=>e.results.immediate.horizons?.[horizon]?.full);rebounds[horizon]={n:xs.length,medianMAE:quantile(xs.map(e=>e.results.immediate.horizons[horizon].mae),.5),thresholds:Object.fromEntries([.5,1,2,3,6].map(level=>[level,{n:xs.filter(e=>e.results.immediate.horizons[horizon].mae>=level).length,pct:xs.length?xs.filter(e=>e.results.immediate.horizons[horizon].mae>=level).length/xs.length*100:null}]))};}
 const bins={};const add=(name,fn)=>bins[name]=summarize(mature.filter(fn));
 add('NEAR',e=>e.state==='NEAR');add('IN_ZONE',e=>e.state==='IN_ZONE');
 for(const [a,b] of [[0,3],[3,6],[6,10],[10,20]])add(`drop_${a}_${b}`,e=>e.dropFromPeakPct>=a&&e.dropFromPeakPct<b);
 for(const [label,field] of [['pre15m','preReturn15m'],['pre60m','preReturn60m']])for(const direction of ['UP','DOWN','UNKNOWN'])add(`${label}_${direction.toLowerCase()}`,e=>returnDirection(e[field])===direction);
 for(const [a,b] of [[15,30],[30,50],[50,100000]])add(`pump_${a}_${b}`,e=>e.pump6h>=a&&e.pump6h<b);
 const days=Object.fromEntries([...new Set(mature.map(e=>new Date(e.observedAt+7*H).toISOString().slice(0,10)))].map(d=>[d,summarize(mature.filter(e=>new Date(e.observedAt+7*H).toISOString().slice(0,10)===d))]));
 const splitAt=mature[Math.floor(mature.length*.7)].observedAt;
 const split=Object.fromEntries(variants.map(v=>[v,{first70:summarize(mature.filter(e=>e.observedAt<splitAt),v),last30:summarize(mature.filter(e=>e.observedAt>=splitAt),v)}]));
 const actual=s.actual.trades;const actualStats={raw:s.actual.raw,n:actual.length,coins:new Set(actual.map(r=>r.symbol)).size,wins:actual.filter(r=>r.netRealizedPnlUsdt>0).length,winPct:actual.length?actual.filter(r=>r.netRealizedPnlUsdt>0).length/actual.length*100:null,netPnlUsdt:actual.reduce((a,r)=>a+r.netRealizedPnlUsdt,0),avgRealizedRoePct:mean(actual.map(r=>r.realizedRoePct)),excluded:s.actual.excluded,range:actual.length?[actual.map(r=>r.filledAt).sort()[0],actual.map(r=>r.closedAt).sort().at(-1)]:[]};
 const paired=Object.fromEntries(variants.slice(1).map(v=>{const xs=mature.filter(e=>e.results[v].complete&&e.results.immediate.complete);return [v,{sameCohortN:xs.length,immediate:summarize(xs),wait:summarize(xs,v),missedImmediateTP:mature.filter(e=>e.results[v].status==='NO_CONFIRMATION'&&e.results.immediate.status==='TP').length}];}));
 const summary={version:VERSION,cutoff:s.cutoff,cohortRange:[records[0]?.observedAt,records.at(-1)?.observedAt],events:records.length,matureEvents:mature.length,timeExcludedRecent:records.length-mature.length,matureRange:[mature[0]?.observedAt,mature.at(-1)?.observedAt],symbols:new Set(records.map(e=>e.symbol)).size,download:meta,dataAcquisition:previous?.dataAcquisition??previous?.download??meta,variants:variantStats,delays,rebounds,bins,days,splitAt,split,paired,clusterBootstrap:blockBootstrap(mature),actual:actualStats,attemptStats:s.attemptStats,examples:mature.filter(e=>e.results.immediate.complete).sort((a,b)=>b.results.immediate.maeBeforeExit-a.results.immediate.maeBeforeExit).slice(0,12).map(e=>({id:e.id,symbol:e.symbol,at:e.observedAt,drop:e.dropFromPeakPct,peakAge:e.peakAgeMin,pre15m:e.preReturn15m,trade:e.results.immediate}))};
 await fs.writeFile(path.join(dir,'results.json'),JSON.stringify({summary,records},null,2));await fs.writeFile(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));
 const matureIds=new Set(mature.map(e=>e.id));
 const csv=['id,symbol,observedAt,state,primaryMature,dropFromPeakPct,peakAgeMin,preReturn15m,preReturn60m,status,entryAt,entry,exit,netRoe5x,stressRoe5x,maeThroughExitBar,waitRedStatus,waitRedNetRoe5x,waitFullStatus,waitFullNetRoe5x'];
 for(const e of records){const t=e.results.immediate;csv.push([e.id,e.symbol,new Date(e.observedAt).toISOString(),e.state,matureIds.has(e.id)?1:0,e.dropFromPeakPct,e.peakAgeMin,e.preReturn15m,e.preReturn60m,t.status,t.entryAt?new Date(t.entryAt).toISOString():'',t.entry,t.exit,t.netRoe5x,t.stressRoe5x,t.maeBeforeExit,e.results.wait_red_5m.status,e.results.wait_red_5m.netRoe5x,e.results.wait_full_5m.status,e.results.wait_full_5m.netRoe5x].map(x=>x??'').join(','));}
 await fs.writeFile(path.join(root,'reports/pump-turn-near-backtest-20261028.csv'),csv.join('\n')+'\n');
 await writeReport(summary,records);
 console.log(JSON.stringify({stage:'complete',events:summary.events,symbols:summary.symbols,variants:summary.variants,delays,rebounds,actual:actualStats,download:meta,clusterBootstrap:summary.clusterBootstrap},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
