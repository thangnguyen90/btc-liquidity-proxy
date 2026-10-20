// Offline public-data research. Never imports order, server, account or notification code.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const VERSION='PUMP_TURN_ENTRY_5M_RESEARCH_V1_20261018';
const M=60000,H=60*M,STEP=5*M;
const sum=a=>a.reduce((s,x)=>s+x,0),mean=a=>a.length?sum(a)/a.length:null;
const pct=(a,b)=>(a/b-1)*100;
export const bar=r=>({t:+r[0],end:+r[6],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5],q:+r[7],buy:+r[10]});
export function detect(rows,start,end){
  const events=[],last={LONG:-Infinity,SHORT:-Infinity};
  for(let i=73;i<rows.length;i++){
    const r=rows[i];if(r.end<start||r.end>=end)continue;
    const pre=rows.slice(i-72,i),context=[...pre,r];
    if(context.some((x,j)=>j&&x.t!==context[j-1].t+STEP))continue;
    const baseline=mean(pre.slice(-20).map(x=>x.q)),volX=baseline>0?r.q/baseline:0,buyPct=r.q>0?r.buy/r.q*100:0;
    const gain60=pct(r.c,rows[i-12].c),breakout=Math.max(...pre.slice(-12).map(x=>x.h));
    const low3=Math.min(...pre.slice(-3).map(x=>x.l));
    const rangePos=r.h>r.l?(r.c-r.l)/(r.h-r.l):0;
    let hi=-Infinity,peakIndex=-1;
    for(let j=0;j<pre.length;j++)if(pre[j].h>hi){hi=pre[j].h;peakIndex=j;}
    const baseRows=pre.slice(0,peakIndex),base=baseRows.length?Math.min(...baseRows.map(x=>x.c)):null;
    const pump6h=base?pct(hi,base):0,drop=(1-r.c/hi)*100;
    const volume=sum(context.map(x=>x.v));
    const vwap=volume?sum(context.map(x=>(x.h+x.l+x.c)/3*x.v))/volume:null;
    const common={index:i,at:r.end,price:r.c,gain60,volX,buyPct,rangePos,breakout,low3,pump6h,dropFromPeak:drop,peak:hi,peakAt:pre[peakIndex]?.t,base,vwap,quoteVolume:r.q};
    if(r.q>=100000&&gain60>=8&&r.c>breakout*1.001&&volX>=2&&buyPct>=55&&rangePos>=.7&&r.end-last.LONG>=6*H){
      events.push({...common,side:'LONG',rule:'LONG_BREAKOUT'});last.LONG=r.end;
    }
    if(r.q>=100000&&pump6h>=15&&drop>=3&&drop<=20&&r.c<low3*.999&&r.c<r.o&&volX>=1.5&&buyPct<=45&&r.end-last.SHORT>=6*H){
      events.push({...common,side:'SHORT',rule:'SHORT_STRUCTURE_BREAK',belowVwap:r.c<vwap});last.SHORT=r.end;
    }
  }
  return events;
}
export function simulate(rows,event,end,step=STEP){
  const entryBar=rows[event.index+1],deadline=event.at+6*H;
  if(!entryBar||entryBar.t!==event.at+1)return {status:'NO_ENTRY_DATA',complete:false};
  const count=6*H/step;
  const future=rows.slice(event.index+1,event.index+count+1).filter(b=>b.end<end);
  const complete=future.length===count&&future.at(-1).end===deadline;
  if(future.some((b,j)=>j&&b.t!==future[j-1].t+step))return {status:'DATA_GAP',complete:false};
  const entry=entryBar.o,long=event.side==='LONG',tp=entry*(long?1.02:.98),sl=entry*(long?.94:1.06);
  let status=null,exit=null,exitAt=null,ambiguous=false;
  for(const b of future){
    const hitSL=long?b.l<=sl:b.h>=sl,hitTP=long?b.h>=tp:b.l<=tp;
    if(hitSL){status='SL';exit=long?Math.min(sl,b.o):Math.max(sl,b.o);exitAt=b.end;ambiguous=hitTP;break;}
    if(hitTP){status='TP';exit=tp;exitAt=b.end;break;}
  }
  if(!status&&complete){status='TIMEOUT';exit=future.at(-1).c;exitAt=future.at(-1).end;}
  const gross=exit==null?null:(long?exit-entry:entry-exit)/entry*100;
  const hi=future.length?Math.max(...future.map(b=>b.h)):entry,lo=future.length?Math.min(...future.map(b=>b.l)):entry;
  return {entryAt:entryBar.t,entry,tp,sl,status:status??'CENSORED',complete,exit,exitAt,ambiguous,
    grossPricePct:gross,netRoe5x:gross==null?null:(gross-.14)*5,stressRoe5x:gross==null?null:(gross-.3)*5,
    mfe6hPct:long?pct(hi,entry):(entry-lo)/entry*100,mae6hPct:long?pct(lo,entry):(entry-hi)/entry*100};
}
export function stats(es){
  const xs=es.filter(e=>e.trade.complete&&['TP','SL','TIMEOUT'].includes(e.trade.status));
  return {n:xs.length,coins:new Set(xs.map(e=>e.symbol)).size,tp:xs.filter(e=>e.trade.status==='TP').length,sl:xs.filter(e=>e.trade.status==='SL').length,timeout:xs.filter(e=>e.trade.status==='TIMEOUT').length,
    wins:xs.filter(e=>e.trade.netRoe5x>0).length,winPct:xs.length?xs.filter(e=>e.trade.netRoe5x>0).length/xs.length*100:null,
    avgNetRoe5x:mean(xs.map(e=>e.trade.netRoe5x)),avgStressRoe5x:mean(xs.map(e=>e.trade.stressRoe5x)),
    avgMfe6h:mean(xs.map(e=>e.trade.mfe6hPct)),avgMae6h:mean(xs.map(e=>e.trade.mae6hPct)),ambiguous:xs.filter(e=>e.trade.ambiguous).length};
}
function merge(ws){const out=[];for(const w of ws.sort((a,b)=>a[0]-b[0])){const p=out.at(-1);if(p&&w[0]<=p[1])p[1]=Math.max(p[1],w[1]);else out.push([...w]);}return out;}
async function main(){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=path.join(root,'data/research/two-sided-month-20261018');
  const dir=path.join(root,'data/research/pump-turn-entry-week-20261018');await fs.mkdir(path.join(dir,'raw'),{recursive:true});
  const read=async f=>{try{return JSON.parse(await fs.readFile(f,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  const save=(f,x)=>fs.writeFile(f,JSON.stringify(x));
  const meta=await read(path.join(source,'meta.json')),end=meta.end,start=end-7*24*H,split=start+4*24*H;
  let weight=0,requests=0,last=0;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function get(params){
    for(let attempt=0;attempt<3;attempt++){
      await sleep(Math.max(0,500-(Date.now()-last)));
      if(weight>1000){console.log(JSON.stringify({stage:'rate-pause',weight}));await sleep(61000-Date.now()%60000);weight=0;}
      last=Date.now();let r;
      try{r=await fetch('https://fapi.binance.com/fapi/v1/klines?'+new URLSearchParams(params),{signal:AbortSignal.timeout(15000)});}catch(e){if(attempt===2)throw e;await sleep(2000);continue;}
      requests++;weight=+(r.headers.get('x-mbx-used-weight-1m')??weight);
      if([418,429].includes(r.status))throw Error('RATE_LIMIT_'+r.status);
      if(!r.ok){if(r.status>=500&&attempt<2){await sleep(2000);continue;}throw Error('HTTP_'+r.status);}
      return r.json();
    }
  }
  async function candles(symbol,from,to,interval='5m'){
    const f=path.join(dir,'raw',`${encodeURIComponent(symbol)}-${interval==='5m'?'':'1m-'}${from}-${to}.json`);const cached=await read(f);if(cached)return cached.map(bar);
    const raw=[];let cursor=from;
    while(cursor<to){const a=await get({symbol,interval,startTime:String(cursor),endTime:String(to-1),limit:'1000'});if(!Array.isArray(a))throw Error('INVALID');if(!a.length)break;raw.push(...a);cursor=+a.at(-1)[0]+(interval==='1m'?M:STEP);if(a.length<1000)break;}
    await save(f,raw);return raw.map(bar).filter(b=>b.t>=from&&b.end<to);
  }
  const events=[],errors=[],coverage=[],screen=[];let done=0;
  for(const s of meta.symbols){
    const hourly=(await read(path.join(source,'raw',`${encodeURIComponent(s.symbol)}-1h-${meta.start-72*H}-${meta.end}.json`))).map(bar);
    const ws=[];
    for(let i=6;i<hourly.length;i++){
      const r=hourly[i];if(r.t<start-6*H)continue;
      // Superset only: any LONG +8%/60m or prior SHORT pump+15%/6h must be inside an hour with high/6h low>=1.08.
      const lo=Math.min(...hourly.slice(i-6,i+1).map(x=>x.l));
      if(r.h/lo>=1.08)ws.push([Math.max(start-7*H,r.t-7*H),Math.min(end,r.t+14*H)]);
    }
    const windows=merge(ws);screen.push({symbol:s.symbol,windows});
    try{
      const batches=[];for(const [from,to] of windows)batches.push(await candles(s.symbol,from,to));
      const rows=[...new Map(batches.flat().map(b=>[b.t,b])).values()].sort((a,b)=>a.t-b.t);
      const detected=detect(rows,start,end);
      const missingOutcome=detected.filter(e=>e.at+6*H<end&&(!rows[e.index+72]||rows[e.index+72].end!==e.at+6*H));
      for(const e of missingOutcome)batches.push(await candles(s.symbol,e.at+1,Math.min(end,e.at+1+6*H)));
      const full=[...new Map(batches.flat().map(b=>[b.t,b])).values()].sort((a,b)=>a.t-b.t);
      for(const e of detected){const enriched={...e,index:full.findIndex(b=>b.end===e.at)};events.push({...e,symbol:s.symbol,trade:simulate(full,enriched,end)});}
      coverage.push({symbol:s.symbol,bars:rows.length,windows:windows.length,signals:detected.length});
    }catch(e){if(e.message.startsWith('RATE_LIMIT'))throw e;errors.push({symbol:s.symbol,error:e.message});}
    done++;if(done%20===0){await save(path.join(dir,'progress.json'),{version:VERSION,start,end,done,events,errors,coverage});console.log(JSON.stringify({stage:'scan',done,total:meta.symbols.length,events:events.length,requests,weight,errors:errors.length}));}
  }
  for(const e of events.filter(e=>e.trade.ambiguous)){
    e.trade5mBeforeRefinement={...e.trade};
    try{
      const minute=await candles(e.symbol,e.at+1-M,Math.min(end,e.at+1+6*H),'1m');
      const refined=simulate(minute,{...e,index:minute.findIndex(b=>b.end===e.at)},end,M);
      if(!['NO_ENTRY_DATA','DATA_GAP'].includes(refined.status)&&refined.entry===e.trade.entry)e.trade={...refined,refined1m:true};
      else e.refinementError='MINUTE_DATA_INCOMPLETE';
    }catch(err){if(err.message.startsWith('RATE_LIMIT'))throw err;e.refinementError=err.message;}
  }
  events.sort((a,b)=>a.at-b.at||a.symbol.localeCompare(b.symbol));
  const bySide=Object.fromEntries(['LONG','SHORT'].map(side=>{const xs=events.filter(e=>e.side===side);return [side,{all:stats(xs),early:stats(xs.filter(e=>e.at<split-6*H)),late:stats(xs.filter(e=>e.at>=split)),pending:xs.filter(e=>!e.trade.complete).length}];}));
  const q=events.filter(e=>e.symbol==='QUSDT'),result={version:VERSION,start,end,split,settings:{timeframe:'5m',tpPricePct:2,slPricePct:6,leverage:5,costRoundtripPct:.14,stressCostPct:.30,horizonHours:6,cooldownHoursPerSide:6},universe:meta.symbols.length,coverage,errors,screen,events,bySide};
  await save(path.join(dir,'results.json'),result);
  const t=x=>new Date(x).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false}),f=x=>Number.isFinite(x)?x.toFixed(2):'—';
  let report=`# Backtest điểm khởi bơm / chuyển xả — 7 ngày\n\n${VERSION}\n\n${t(start)} → ${t(end)} VN. ${coverage.length}/${meta.symbols.length} hợp đồng hiện đang giao dịch, ${errors.length} lỗi. Thử nghiệm rule mới, ngưỡng cố định trước chạy, không tối ưu trên kết quả.\n\n## Điều kiện có trước entry\n\n- LONG: nến5m đóng tăng≥8% so với60phút trước, đóng vượt HIGH12nến trước×1,001; quotevolume≥100.000USDT và≥2×trung bình20nến trước; taker mua≥55%; close ở30% trên của biên nến.\n- SHORT: trong72nến5m trước có đỉnh tăng≥15% từ CLOSE thấp nhất nằm TRƯỚC đỉnh; hiện giá trả3–20% từ đỉnh, nếnđỏ đóng dưới LOW3nến trước×0,999; quotevolume≥100.000 và≥1,5×trung bình20nến trước; taker mua≤45%. VWAP chỉ ghi để đối chiếu, không gate.\n- Không dùng đỉnh/đáy tương lai hoặc danh sách125coin hậu nghiệm để chọn mẫu. Quét525coin; 1h chỉ làm superset giảm tải, tải5m quanh mọi giờ có HIGH/LOW6h≥1,08, thêm7h lịch sử và14h phía sau. Các cửa sổ này bao phủ điều kiện8%/1h hoặc15%/6h; chỉ detect trên nếnđóng và đủ72nến liên tục.\n- Mỗi coin/mỗi hướng cách tín hiệu≥6h, độc lập hai hướng; không mô phỏng vốn/cap/vị thếhedge. Thiếu dữ liệu loại, không tính là thua. Universe có survivorship bias; bỏcoin đãdelist.\n\n## Giả lập và giới hạn\n\nEntry OPEN nến5m kế tiếp; TPgiá2%, SLgiá6%, leverage5x = grossROE+10%/−30%; timeout6h. SL/TP cùng nến lấySL trước, gapquaSL lấygiáOPEN xấu hơn; TP không cộng lợi thế gap. Phí0,05%+slippage0,02% mỗi chiều (net trừ0,70điểmROE); stress0,30%giá roundtrip. Chưa funding/depth/độtrễ/lot/quota. Đây là điểm vào giả lập, không lệnh thật hoặc bảođảm khớpgiá. CộtMFE/MAE đo cả6h, kể cả sau khi lệnh đãthoát.\n\nChỉ thống kê cửa sổđủ6h kể cả mẫu cuốiđãTP sớm, tránh lệchcohort. Chia4ngày đầu/3ngày sau; bỏ6h quanh ranhgiới khỏiđầu, không chỉnhngưỡng. Đây không phải holdoutmù vì thịtrường tuầnđãđược xem ở quéttháng. OI/funding/ratio/DOM/thanh lý không có đủ dữ liệu lưu nhận-trước-entry nên không gate. Không gọi phá nền là chứng minh cá mập chuẩn bị bơm.\n\n## Kết quả\n\n| Hướng | N / coin | TP / SL / timeout | Dương sau phí | Avg netROE5x | Stress | 4ngày đầu N / Avg | 3ngày cuối N / Avg | Chưađủ6h |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
  for(const [side,s] of Object.entries(bySide))report+=`| ${side} | ${s.all.n}/${s.all.coins} | ${s.all.tp}/${s.all.sl}/${s.all.timeout} | ${f(s.all.winPct)}% | ${f(s.all.avgNetRoe5x)}% | ${f(s.all.avgStressRoe5x)}% | ${s.early.n}/${f(s.early.avgNetRoe5x)}% | ${s.late.n}/${f(s.late.avgNetRoe5x)}% | ${s.pending} |\n`;
  const refinements=events.filter(e=>e.trade5mBeforeRefinement);
  report+=`\nĐối chiếu1m ${refinements.length} lệnh chạmSL/TP cùngnến5m: ${refinements.map(e=>`${e.symbol} ${t(e.trade.entryAt)} ${e.trade5mBeforeRefinement.status}→${e.trade.status}${e.trade.ambiguous?' (vẫn mơ hồ1m, lấySL trước)':''}`).join('; ')}. Không đổi rule tín hiệu.\n\n**Kết luận:** LONG chưa có kỳ vọng dương sau phí; SHORT dương rất mỏng toàn tuần, âm ở3ngày cuối và âm khi tăngcost lên0,30%giá. Chưa có rule đủ bằng chứng để kích hoạt thật. Với TP+10%/SL−30%grossROE và cost0,70điểm, tỷ lệTP hòa vốn khoảng76,75% nếu chỉ cóTP/SL. LONG phải tăng8%/1h mới phát nên là breakout/tiếp diễn, chưa chứng minh phát hiện trước bơm.\n\nQ: không cóSHORT mới gầnđỉnh0,152888 ngày18/10. Nến09:20–09:25VN takerbuy49,22%; nến09:55–10:00VN buy45,48%, chưađạt buy≤45%. Vềsau drawdown>20% cũng bịloại. Đây là ca bỏlỡ quantrọng; không dùngSHORT03:05thắng nhỏ để tuyênbố bắtđỉnh09:19.\n`;
  report+='\n## Điểm vào toàn bộ tín hiệu\n\n| Coin | Hướng | Entry VN | Entry | TP | SL | Kết quả | NetROE5x | MFE6h giá | MAE6h giá | Volume× | Taker mua |\n|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|\n';
  for(const e of events){const z=e.trade;report+=`| ${e.symbol} | ${e.side} | ${z.entryAt?t(z.entryAt):'—'} | ${z.entry??'—'} | ${z.tp??'—'} | ${z.sl??'—'} | ${z.status}${z.complete?'':' (chưa đủ6h)'} | ${f(z.netRoe5x)}% | ${f(z.mfe6hPct)}% | ${f(z.mae6hPct)}% | ${f(e.volX)} | ${f(e.buyPct)}% |\n`;}
  report+=`\n## Tái lập\n\nnode scripts/research-pump-turn-entry-week.mjs; raw/progress/result tại data/research/pump-turn-entry-week-20261018. Nguồn [Binance Klines](https://developers.binance.com/en/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data). Không sửa Binance/entry/size/SL/TP/runtime, không Push/Discord/restart. JSONtrade cũ không đọc/sửa; không card/WHITELIST mới. Lỗi: ${JSON.stringify(errors)}.\n`;
  await fs.writeFile(path.join(root,'reports/pump-turn-entry-week-20261018.md'),report);
  console.log(JSON.stringify({stage:'complete',start,end,coverage:coverage.length,errors,bySide,q},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
