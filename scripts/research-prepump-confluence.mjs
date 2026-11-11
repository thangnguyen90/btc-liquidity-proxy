// Public, read-only historical replay of saved alerts. Never imports a runner/notifier/account client.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {heatmapRangePlan,normalizeBinanceHeatmapCandles,buildBinanceHeatmapProfiles} from '../src/binanceHeatmapModel.js';
import {evaluatePrePumpConfluence,PRE_PUMP_CONFLUENCE_VERSION} from '../src/parabolicPrePumpConfluence.js';
import {normalizeTopRatioRows} from '../public/heatmap-top-ratio-model.js';
export const VERSION='PRE_PUMP_SAVED_ALERT_REPLAY_V1_20261025';
const MIN=60000,H=3600000;
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});
const pct=(a,b)=>(a/b-1)*100;
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const fmt=n=>Number.isFinite(n)?n.toFixed(2):'—';
const read=async p=>{try{return JSON.parse(await fs.readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const save=(p,v)=>fs.writeFile(p,JSON.stringify(v));

export function forwardOutcomes(raw,{event,cutoff,assessment}){
  // Start only after the Discord SENT timestamp. Never include the already-observed minute wick.
  const deliveredAt=Math.max(event.observedAt,event.delivery?.at??event.observedAt);
  const start=(Math.floor(deliveredAt/MIN)+1)*MIN;
  const bars=raw.map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),end:Number(r[6])}))
    .filter(r=>r.time>=start&&r.end<cutoff&&r.time<start+6*H);
  const valid=bars.every((r,i)=>[r.time,r.open,r.high,r.low,r.close,r.end].every(Number.isFinite)
    &&Math.min(r.open,r.high,r.low,r.close)>0&&r.high>=Math.max(r.open,r.close)&&r.low<=Math.min(r.open,r.close)
    &&r.end===r.time+MIN-1&&r.time===start+i*MIN);
  if(!valid)return {status:'GAP_OR_INVALID',start,horizons:{}};
  const horizons={};
  for(const hours of [1,3,6]){
    const part=bars.filter(r=>r.time<start+hours*H),complete=part.length===hours*60;
    const entry=bars[0]?.open;
    horizons[hours]={complete,bars:part.length,entry:entry??null,
      returnPct:complete?pct(part.at(-1).close,entry):null,
      netReturnPct:complete?pct(part.at(-1).close,entry)-.14:null,
      mfePct:part.length?pct(Math.max(...part.map(r=>r.high)),entry):null,
      maePct:part.length?pct(Math.min(...part.map(r=>r.low)),entry):null,
      end:part.at(-1)?.end??null};
  }
  const target=assessment?.heatmap?.target?.low,stop=assessment?.heatmap?.invalidationPrice;
  let targetOutcome='NO_LEVELS';
  if(target>0&&stop>0&&bars.length){
    if(bars[0].open>=target||bars[0].open<=stop)targetOutcome='ENTRY_OUTSIDE_LEVELS';
    else {targetOutcome=bars.length===360?'NEITHER_6H':'CENSORED';
      for(const b of bars){const tp=b.high>=target,sl=b.low<=stop;
        if(tp||sl){targetOutcome=tp&&sl?'AMBIGUOUS_SAME_MINUTE':tp?'TARGET_FIRST':'INVALIDATION_FIRST';break;}}
    }
  }
  return {status:bars.length?'OK':'NO_FUTURE',start,deliveredAt,entry:bars[0]?.open??null,
    entryVsAlertPct:bars.length?pct(bars[0].open,event.price):null,horizons,targetOutcome};
}

export function summarize(results){
  const groups={ALL:results,PASS:results.filter(r=>r.assessment?.status==='PASS'),
    FAIL:results.filter(r=>r.assessment?.status==='FAIL'),UNAVAILABLE:results.filter(r=>!['PASS','FAIL'].includes(r.assessment?.status)),
    MODEL_ONLY:results.filter(r=>r.assessment?.heatmap?.pass===true),RATIO_ONLY:results.filter(r=>r.assessment?.topAccountRatio?.pass===true)};
  return Object.fromEntries(Object.entries(groups).map(([key,rows])=>[key,{count:rows.length,coins:new Set(rows.map(r=>r.event.symbol)).size,
    horizons:Object.fromEntries([1,3,6].map(h=>{const eligible=rows.map(r=>r.forward?.horizons?.[h]).filter(x=>x?.complete);
      return [h,{complete:eligible.length,positiveNet:eligible.filter(x=>x.netReturnPct>0).length,
        avgNetPct:mean(eligible.map(x=>x.netReturnPct)),avgMfePct:mean(eligible.map(x=>x.mfePct)),avgMaePct:mean(eligible.map(x=>x.maePct)),
        reached3Pct:eligible.filter(x=>x.mfePct>=3).length,reached5Pct:eligible.filter(x=>x.mfePct>=5).length}];})),
    targets:rows.reduce((out,r)=>{const k=r.forward?.targetOutcome??'NO_DATA';out[k]=(out[k]??0)+1;return out;},{})}]));
}

async function main(){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const dir=path.join(root,'data/research/prepump-confluence-20261025');await fs.mkdir(path.join(dir,'raw'),{recursive:true});
  let last=0,weight=0,requests=0;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function get(endpoint,params){
    const filename=path.join(dir,'raw',encodeURIComponent(endpoint+'?'+new URLSearchParams(params))+'.json');
    const cached=await read(filename);if(cached)return cached;
    await sleep(Math.max(0,650-(Date.now()-last)));
    if(weight>=900){console.log(JSON.stringify({stage:'weight-pause',weight}));await sleep(Math.min(60000,61000-Date.now()%60000));weight=0;}
    last=Date.now();const url=new URL(endpoint,'https://fapi.binance.com');url.search=new URLSearchParams(params);
    const res=await fetch(url,{signal:AbortSignal.timeout(20000)});requests++;
    weight=Number(res.headers.get('x-mbx-used-weight-1m')??weight);
    if([418,429].includes(res.status))throw Error('RATE_LIMIT_'+res.status);
    if(!res.ok)throw Error('HTTP_'+res.status);
    const value=await res.json();await save(filename,value);return value;
  }
  let meta=await read(path.join(dir,'meta.json'));
  if(!meta){
    const state=await read(path.join(root,'data/parabolic-pump-risk-watch.json'));
    const time=await get('/fapi/v1/time',{});
    const events=state.history.filter(e=>e.stage==='PRE_PUMP_WATCH'&&e.delivery?.status==='SENT');
    meta={version:VERSION,gateVersion:PRE_PUMP_CONFLUENCE_VERSION,cutoff:Math.floor(time.serverTime/MIN)*MIN,
      createdAt:Date.now(),events,scope:'Saved sent PRE alerts; not a full market scan. Historical reconstructed availability, not saved entry proof.'};
    await save(path.join(dir,'meta.json'),meta);
  }
  if(meta.version!==VERSION)throw Error('META_VERSION_MISMATCH');
  const results=[];
  console.log(JSON.stringify({stage:'start',events:meta.events.length,coins:new Set(meta.events.map(e=>e.symbol)).size,cutoff:vn(meta.cutoff)}));
  for(const [i,event] of meta.events.entries()){
    const file=path.join(dir,`event-${i}.json`),cached=await read(file);
    if(cached&&!cached.errors?.length){results.push(cached);continue;}
    const errors=[],symbol=event.symbol,replayNow=event.observedAt,plan=heatmapRangePlan('24h',replayNow);
    const params={symbol,interval:'5m',startTime:String(plan.from),endTime:String(plan.end-1),limit:'499'};
    const safe=async(label,fn)=>{try{return await fn();}catch(e){if(e.message.startsWith('RATE_LIMIT'))throw e;errors.push({stage:label,error:e.message});return null;}};
    const price=await safe('price',()=>get('/fapi/v1/klines',params));
    const mark=await safe('mark',()=>get('/fapi/v1/markPriceKlines',params));
    const oi=await safe('oi',()=>get('/futures/data/openInterestHist',{symbol,period:'5m',startTime:String(plan.from),endTime:String(plan.end-1),limit:'500'}));
    const ratioRaw=await safe('ratio',()=>get('/futures/data/topLongShortAccountRatio',{symbol,period:'5m',startTime:String(Math.floor(event.at/300000)*300000-19*300000),endTime:String(event.at),limit:'30'}));
    let candles=[],bundle=null,ratio=null;
    await safe('build',async()=>{
      if(!price||!mark||!oi)throw Error('MISSING_MODEL_INPUT');
      candles=normalizeBinanceHeatmapCandles(price,plan);const markRows=normalizeBinanceHeatmapCandles(mark,plan);
      const models=[1,3].map(model=>({model,status:'OK',data:buildBinanceHeatmapProfiles({query:{symbol,range:'24h'},plan,candles,markRows,oiRows:oi,model})}));
      bundle={models};
    });
    await safe('normalize-ratio',async()=>{
      if(!ratioRaw)throw Error('MISSING_RATIO');
      ratio={source:'BINANCE_TOP_TRADER_ACCOUNT_RATIO',symbol,period:'5m',status:'OK',fetchedAt:replayNow,
        rows:normalizeTopRatioRows(ratioRaw,{symbol,step:300000,now:event.at,from:event.at-21*300000})};
    });
    const replayRows=candles.map(c=>({...c,openTime:c.time,closeTime:c.end,isClosed:true}));
    const assessment=evaluatePrePumpConfluence({event,bundle,ratio,rows:replayRows,now:replayNow});
    const start=(Math.floor(Math.max(event.observedAt,event.delivery?.at??event.observedAt)/MIN)+1)*MIN,end=Math.min(start+6*H,meta.cutoff);
    const future=end>start?await safe('future',()=>get('/fapi/v1/klines',{symbol,interval:'1m',startTime:String(start),endTime:String(end-1),limit:'499'})):[];
    const forward=future?forwardOutcomes(future,{event,cutoff:meta.cutoff,assessment}):{status:'UNAVAILABLE',horizons:{}};
    const result={event,assessment,forward,errors,modelWindow:{from:plan.from,end:plan.end,priceBars:candles.length},
      reconstructed:true,actualFetchedAt:Date.now(),publicationLatencyKnown:false};
    results.push(result);await save(file,result);
    console.log(JSON.stringify({stage:'event',i:i+1,total:meta.events.length,symbol,status:assessment.status,
      heatmap:assessment.heatmap?.reason,ratio:assessment.topAccountRatio?.reason,errors:errors.length,requests,weight}));
  }
  const summary=summarize(results),reasonCounts={heatmap:{},ratio:{}};
  for(const r of results)for(const [key,obj] of [['heatmap',r.assessment.heatmap],['ratio',r.assessment.topAccountRatio]]){
    const reason=obj?.reason??'UNKNOWN';reasonCounts[key][reason]=(reasonCounts[key][reason]??0)+1;}
  const output={version:VERSION,meta,summary,reasonCounts,results,requests};await save(path.join(dir,'results.json'),output);
  const lines=[`# Backtest bộ lọc Nghi tích lũy — Model1/3 + top trader ACCOUNT ratio`, '',
    `Version ${VERSION}; gate ${PRE_PUMP_CONFLUENCE_VERSION}. Cutoff ${vn(meta.cutoff)} VN.`, '',
    `Phạm vi ${results.length} thông báo PRE đã SENT trên ${summary.ALL.coins} coin, từ ${vn(Math.min(...meta.events.map(e=>e.observedAt)))} đến ${vn(Math.max(...meta.events.map(e=>e.observedAt)))} VN. Đây là replay bộ lọc trên ứng viên cũ, không quét toàn thị trường.`, '',
    '| Nhóm | Mẫu | Đủ 1h | Net TB 1h % | Đủ 3h | Net TB 3h % | Đủ 6h | Net TB 6h % |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...Object.entries(summary).map(([k,g])=>`| ${k} | ${g.count} | ${g.horizons[1].complete} | ${fmt(g.horizons[1].avgNetPct)} | ${g.horizons[3].complete} | ${fmt(g.horizons[3].avgNetPct)} | ${g.horizons[6].complete} | ${fmt(g.horizons[6].avgNetPct)} |`), '',
    summary.PASS.count===0?'**Không có mẫu PASS trong cohort này: không thể tính tỷ lệ thắng/lợi thế của V2. Việc loại tất cả tin không chứng minh bộ lọc tốt hơn; cần xem cả sóng tăng bị bỏ lỡ.**':'PASS có mẫu nhưng cohort nhỏ và chọn từ alert V1; chưa xác lập lợi thế ngoài mẫu.', '',
    '### Mẫu bị loại có giá từng tăng cao trong6h (không phải lợi nhuận khớp lệnh)', '',
    '| Coin | Giờ tin VN | MFE6h % | MAE6h % | Net giữ6h % |', '|---|---|---:|---:|---:|',
    ...results.filter(r=>r.assessment.status==='FAIL'&&r.forward.horizons?.[6]?.complete)
      .sort((a,b)=>b.forward.horizons[6].mfePct-a.forward.horizons[6].mfePct).slice(0,5)
      .map(r=>`| ${r.event.symbol} | ${vn(r.event.observedAt)} | ${fmt(r.forward.horizons[6].mfePct)} | ${fmt(r.forward.horizons[6].maePct)} | ${fmt(r.forward.horizons[6].netReturnPct)} |`), '',
    '## Cách dựng và giới hạn', '',
    '- Dùng nguyên event snapshot giá/HIGH/LOW/volume LIVE đã lưu; không thay bằng nến cuối cùng sau khi đóng. Chỉ kiểm lại các điều kiện bổ sung V2, giả định nền V1 đã pass như lúc phát.',
    '- Dựng Model1/3 cùng simulator backend, cửa sổ24h +12h warm-up, chỉ nến đóng có sẵn theo event.observedAt; gate chỉ chọn3profile trước nến ứng viên. Nến MARK, OI và top trader ACCOUNT ratio5m dùng dữ liệu lịch sử public Binance.',
    '- Đây là tái dựng theo timestamp, không phải proof realtime đã lưu. Không biết độ trễ công bố OI/ratio, cache, request hoặc sửa dữ liệu lịch sử; fetchedAt giả lập bằng thời điểm replay để kiểm điều kiện logic, actualFetchedAt lưu riêng. Kết quả có thể lạc quan hơn tính sẵn có realtime.',
    '- Entry giả định = OPEN nến1m kế tiếp sau khi Discord SENT. Chỉ dùng nến phút hoàn chỉnh sau mốc này để tránh lấy râu trước tín hiệu. Báo return cuối1h/3h/6h trừ0,14% chi phí giả định; chưa tính funding/slippage/fill/leverage/size, không phải PnL Binance.',
    '- Mỗi horizon dùng riêng mẫu đã đủ thời gian. MFE/MAE là biến động cực trị; chạm+3%/+5% không đồng nghĩa thắng. Target/invalidation chỉ là mốc Model1/3 tham chiếu; cùng phút chạm cảhai = AMBIGUOUS; không suy thứ tự.',
    '- Không tối ưu lại ngưỡng theo kết quả. PASS/FAIL/UNAVAILABLE tách riêng; thiếu dữ liệu không gộp thành FAIL. Các mẫu cùng nhịp thị trường không độc lập; cohort chỉ gồm tin đã SENT, chịu cooldown6h và giới hạn gửi của V1.',
    '- OBSERVE ONLY: không đổi runtime, Binance/entry/size/SL/TP, không Discord/Push/replay thông báo. JSON nghiên cứu độc lập trong data/research/prepump-confluence-20261025; không migrate state bot.', '',
    'MODEL_ONLY/RATIO_ONLY chỉ là phân rã từng bộ lọc, không thay rule production và không cộng số mẫu các nhóm với nhau.', '',
    '## Lý do', '', '```json',JSON.stringify(reasonCounts,null,2),'```', '',
    '## Từng tín hiệu', '', '| Coin | Giờ VN | V2 | Model1/3 | Ratio | Net 1h % | Net 6h % |', '|---|---|---|---|---|---:|---:|',
    ...results.map(r=>`| ${r.event.symbol} | ${vn(r.event.observedAt)} | ${r.assessment.status} | ${r.assessment.heatmap?.reason??'—'} | ${r.assessment.topAccountRatio?.reason??'—'} | ${fmt(r.forward.horizons?.[1]?.netReturnPct)} | ${fmt(r.forward.horizons?.[6]?.netReturnPct)} |`), '',
    '## Thống kê đầy đủ', '', '```json',JSON.stringify(summary,null,2),'```',''];
  await fs.mkdir(path.join(root,'reports'),{recursive:true});await fs.writeFile(path.join(root,'reports/prepump-confluence-backtest-20261025.md'),lines.join('\n'));
  console.log(JSON.stringify({stage:'complete',summary,reasonCounts,requests}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
