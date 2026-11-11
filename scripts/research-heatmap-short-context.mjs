// Read-only study: local audit + public historical GET. No runner/notifier/account imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {featuresFor as longFeatures,stats} from './research-heatmap-long-context.mjs';
export const VERSION='HEATMAP_SHORT_PRE_ENTRY_CONTEXT_RESEARCH_V1_20261026';
export const CURRENT_ENTRY_VERSION='HEATMAP_FULL_SWEEP_NO_DRIFT_SHORT5_LONG2_5X_TP10_SL30_CAP20_V4_20261023';
const STEP=300000,H=3600000,finite=Number.isFinite,pct=(a,b)=>a>0&&b>0?(a/b-1)*100:null;
const mean=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null,median=xs=>{if(!xs.length)return null;const a=xs.toSorted((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false}),fmt=x=>finite(x)?x.toFixed(3):'—';
async function read(p){try{return JSON.parse(await fs.readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const save=(p,v)=>fs.writeFile(p,JSON.stringify(v));
export function selectShortCohort(audit,ledger){
 const all=Object.values(audit.fills??{}).map(x=>x.record??x),attempts=Object.values(ledger.attempts??{}),seen=new Set(),included=[],excluded=[];
 for(const r of all.filter(r=>r.signalSource==='heatmap-full-sweep'&&r.direction==='SHORT')){
  const key=r.symbol+':'+(r.clientOrderId||r.orderId);let reason=null;
  if(seen.has(key))reason='DUPLICATE_ORDER';else seen.add(key);
  if(!reason&&r.isDca)reason='DCA';
  if(!reason&&(r.heatmapSweepAtEntry?.kind!=='ALL_TRACKED_UPPER_SWEPT'||r.heatmapSweepAtEntry.direction!=='UPPER'||r.heatmapSweepAtEntry.symbol!==r.symbol))reason='NO_UPPER_SWEEP_PROOF';
  if(!reason&&!attempts.some(a=>a.symbol===r.symbol&&a.side==='SHORT'&&String(a.orderId)===String(r.orderId)&&a.id===r.heatmapSweepSignalId))reason='NO_EXACT_LEDGER';
  if(reason){excluded.push({symbol:r.symbol,orderId:r.orderId,reason,margin:r.marginUsdt,net:r.netRealizedPnlUsdt});continue;}
  const members=all.filter(x=>r.closeGroupId&&x.closeGroupId===r.closeGroupId),mixedClose=members.some(x=>x.signalSource!=='heatmap-full-sweep'||x.direction!=='SHORT'||x.isDca===true);
  included.push({...r,mixedClose,closeGroupMembers:members.map(x=>({symbol:x.symbol,orderId:x.orderId,source:x.signalSource,isDca:x.isDca}))});
 }
 return {included:included.sort((a,b)=>Date.parse(a.filledAt)-Date.parse(b.filledAt)),excluded};
}
export function shortFeatures(input){
 const f=longFeatures(input),e=input.record.heatmapSweepAtEntry,z=e.zones??[],high=z.length?Math.max(...z.map(z=>z.high)):null;
 const raw=(input.coin??[]).filter(r=>Number(r[6])<e.at).toSorted((a,b)=>Number(a[0])-Number(b[0])).at(-1),span=raw?Number(raw[2])-Number(raw[3]):null;
 return {...f,overshootPct:high>0?(e.markPrice/high-1)*100:null,armRisePct:pct(e.markPrice,e.referencePrice),armDropPct:undefined,
  lastClosedUpperWickPct:raw&&span>0?(Number(raw[2])-Math.max(Number(raw[1]),Number(raw[4])))/span*100:null};
}
export const SHORT_FACTORS=[
 {key:'btc.return15m',title:'BTC15m đóng',cuts:[-.15,.15],labels:['Giảm <-0,15%','Ngang ±0,15%','Tăng ≥0,15%']},
 {key:'btc.return1h',title:'BTC1h đóng',cuts:[-.3,.3],labels:['Giảm <-0,3%','Ngang ±0,3%','Tăng ≥0,3%']},
 {key:'relative1h',title:'Coin−BTC1h (điểm %)',cuts:[-.5,.5],labels:['Yếu hơn >0,5đ%','Gần ±0,5đ%','Mạnh hơn ≥0,5đ%']},
 {key:'ratio.value',title:'Top trader ACCOUNT ratio',cuts:[1,2],labels:['<1','1..<2','≥2']},
 {key:'ratio.change30m',title:'Ratio Δ30m',cuts:[-3,3],labels:['Giảm <-3%','Ngang ±3%','Tăng ≥3%']},
 {key:'ratio.change1h',title:'Ratio Δ1h',cuts:[-5,5],labels:['Giảm <-5%','Ngang ±5%','Tăng ≥5%']},
 {key:'oi.change1h',title:'OI quantity Δ1h',cuts:[-2,2],labels:['Giảm <-2%','Ngang ±2%','Tăng ≥2%']},
 {key:'coin.ema20Distance',title:'Coin cách EMA20/5m',cuts:[0,2],labels:['Dưới EMA','Trên EMA <2%','Trên EMA ≥2%']},
 {key:'coin.rsi14',title:'RSI14/5m',cuts:[40,55,70],labels:['<40','40..<55','55..<70','≥70']},
 {key:'coin.volumeX',title:'Volume5m/nền20',cuts:[1,2],labels:['<1×','1..<2×','≥2×']},
 {key:'coin.takerBuy15m',title:'Taker mua15m',cuts:[45,55],labels:['<45%','45..<55%','≥55%']},
 {key:'armRisePct',title:'MARK tăng từ arm đến quét',cuts:[1,3],labels:['<1%','1..<3%','≥3%']},
 {key:'zoneCount',title:'Số cụm quét',cuts:[2,3],labels:['1 cụm','2 cụm','≥3 cụm']},
 {key:'zoneMeanStrength',title:'Cường độ cụm trung bình',cuts:[50,70],labels:['35..<50','50..<70','≥70']},
 {key:'overshootPct',title:'MARK vượt mép trên cụm xa nhất',cuts:[.1,.5],labels:['<0,1%','0,1..<0,5%','≥0,5%']},
 {key:'lastClosedUpperWickPct',title:'Râu trên nến5m đóng trước quét',cuts:[20,40],labels:['<20%','20..<40%','≥40%']},
 {key:'actualFillVsSignalPct',title:'Fill so MARK tín hiệu (sau quyết định)',cuts:[-.1,.1],labels:['Thấp hơn >0,1%','Trong ±0,1%','Cao hơn ≥0,1%']},
];
const val=(r,k)=>k.split('.').reduce((o,k)=>o?.[k],r.features);
export const SHORT_CANDIDATES=[
 {id:'BTC_NOT_UP',title:'BTC15m≤+0,15% và1h≤+0,3%',keys:['btc.return15m','btc.return1h'],pass:r=>val(r,'btc.return15m')<=.15&&val(r,'btc.return1h')<=.3},
 {id:'NOT_STRONG_VS_BTC',title:'Coin−BTC1h≤+0,5đ%',keys:['relative1h'],pass:r=>val(r,'relative1h')<=.5},
 {id:'RATIO_NOT_FALLING',title:'Ratio30m≥−3%',keys:['ratio.change30m'],pass:r=>val(r,'ratio.change30m')>=-3},
 {id:'RATIO_RISING',title:'Ratio30m≥+3%',keys:['ratio.change30m'],pass:r=>val(r,'ratio.change30m')>=3},
 {id:'NOT_FAR_ABOVE_EMA',title:'Giá5m cáchEMA20≤+2%',keys:['coin.ema20Distance'],pass:r=>val(r,'coin.ema20Distance')<=2},
 {id:'BUY_NOT_DOMINANT',title:'Taker mua15m≤55%',keys:['coin.takerBuy15m'],pass:r=>val(r,'coin.takerBuy15m')<=55},
 {id:'RSI_NOT_EXTREME',title:'RSI14/5m<70',keys:['coin.rsi14'],pass:r=>val(r,'coin.rsi14')<70},
 {id:'SHALLOW_SWEEP',title:'MARK vượt mép cụm<0,1%',keys:['overshootPct'],pass:r=>val(r,'overshootPct')<.1},
 {id:'BTC_AND_RELATIVE',title:'BTC không tăng + coin không mạnh hơn',keys:['btc.return15m','btc.return1h','relative1h'],pass:r=>val(r,'btc.return15m')<=.15&&val(r,'btc.return1h')<=.3&&val(r,'relative1h')<=.5},
];
export function shortSummary(rows,records){
 const closed=rs=>rs.filter(r=>r.record.positionStatus==='CLOSED'&&Number.isFinite(r.record.netRealizedPnlUsdt));
 const primary=closed(rows).filter(r=>!r.record.mixedClose&&r.record.marginUsdt===5&&r.record.heatmapSweepEntryVersion===CURRENT_ENTRY_VERSION&&!r.record.heatmapSweepAtEntry.secondSweep);
 const splitAt=primary[Math.floor(primary.length*.7)]?.features.asOf??Infinity;
 const groups=SHORT_FACTORS.map(f=>({key:f.key,title:f.title,groups:[...f.labels.map((label,i)=>({label,...stats(primary.filter(r=>{const v=val(r,f.key);return finite(v)&&(i===0||v>=f.cuts[i-1])&&(i===f.cuts.length||v<f.cuts[i]);}))})),{label:'THIẾU',...stats(primary.filter(r=>!finite(val(r,f.key))))}]}));
 const summarizeRows=rs=>stats(rs.map(record=>({record}))),allClosed=records.filter(r=>r.positionStatus==='CLOSED'&&Number.isFinite(r.netRealizedPnlUsdt));
 return {all:summarizeRows(records),allClean:summarizeRows(records.filter(r=>!r.mixedClose)),mixed:summarizeRows(allClosed.filter(r=>r.mixedClose)),primary:stats(primary),
  legacy3:summarizeRows(records.filter(r=>!r.mixedClose&&r.marginUsdt===3)),all5:summarizeRows(records.filter(r=>!r.mixedClose&&r.marginUsdt===5)),second:summarizeRows(records.filter(r=>r.heatmapSweepAtEntry.secondSweep)),
  splitAt,coverage:Object.fromEntries(['coin','btc','ratio','oi'].map(k=>[k,{available:primary.filter(r=>r.features.featureCoverage[k]).length,total:primary.length}])),
  medians:Object.fromEntries(SHORT_FACTORS.map(f=>[f.key,Object.fromEntries([['WIN',r=>r.record.netRealizedPnlUsdt>0],['LOSS',r=>r.record.netRealizedPnlUsdt<0],['SL',r=>r.record.closeReason==='STOP_LOSS_FILLED']].map(([name,filter])=>[name,median(primary.filter(filter).map(r=>val(r,f.key)).filter(finite))]))])),factors:groups,
  candidates:SHORT_CANDIDATES.map(c=>{const known=primary.filter(r=>c.keys.every(k=>finite(val(r,k)))),pass=known.filter(c.pass),fail=known.filter(r=>!c.pass(r));return {id:c.id,title:c.title,pass:stats(pass),fail:stats(fail),missing:stats(primary.filter(r=>!known.includes(r))),
   early:{pass:stats(pass.filter(r=>r.features.asOf<splitAt)),fail:stats(fail.filter(r=>r.features.asOf<splitAt))},late:{pass:stats(pass.filter(r=>r.features.asOf>=splitAt)),fail:stats(fail.filter(r=>r.features.asOf>=splitAt))}};})};
}
async function main(){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'data/research/heatmap-short-context-20261026');await fs.mkdir(path.join(dir,'raw'),{recursive:true});await fs.mkdir(path.join(dir,'inputs'),{recursive:true});
 let meta=await read(path.join(dir,'meta.json'));
 if(!meta){const audit=await read(path.join(root,'data/binance-filled-signal-audit/state.json')),ledger=await read(path.join(root,'data/heatmap-sweep-binance.json'));meta={version:VERSION,createdAt:Date.now(),primaryVersion:CURRENT_ENTRY_VERSION,...selectShortCohort(audit,ledger)};await save(path.join(dir,'meta.json'),meta);}
 if(meta.version!==VERSION)throw Error('VERSION_MISMATCH');
 const input=meta.included.filter(r=>r.marginUsdt===5&&r.heatmapSweepEntryVersion===CURRENT_ENTRY_VERSION&&!r.heatmapSweepAtEntry.secondSweep);
 if(!input.length)throw Error('NO_CURRENT5_CONTEXT_COHORT');
 const index=new Map();let reusedPoints=0,requests=0,last=0,weight=0;
 const keyOf=(endpoint,symbol)=>endpoint+':'+symbol,timeOf=(endpoint,r)=>Number(endpoint==='/fapi/v1/klines'?r[0]:r.timestamp);
 async function addCache(cacheDir){let files;try{files=await fs.readdir(cacheDir);}catch(e){if(e.code==='ENOENT')return;throw e;}for(const name of files.filter(x=>x.endsWith('.json'))){const u=new URL(decodeURIComponent(name.slice(0,-5)),'https://fapi.binance.com'),key=keyOf(u.pathname,u.searchParams.get('symbol')),rs=await read(path.join(cacheDir,name));if(!Array.isArray(rs))continue;const map=index.get(key)??new Map();for(const r of rs)map.set(timeOf(u.pathname,r),r);index.set(key,map);}}
 await addCache(path.join(root,'data/research/heatmap-long-context-20261026/raw'));await addCache(path.join(dir,'raw'));
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function get(endpoint,params){await sleep(Math.max(0,650-(Date.now()-last)));if(weight>=850){console.log(JSON.stringify({stage:'weight_pause',weight}));await sleep(Math.min(60000,61000-Date.now()%60000));weight=0;}
  last=Date.now();const u=new URL(endpoint,'https://fapi.binance.com');u.search=new URLSearchParams(params);const res=await fetch(u,{signal:AbortSignal.timeout(20000)});requests++;weight=Number(res.headers.get('x-mbx-used-weight-1m')??weight);
  if([418,429].includes(res.status))throw Error('RATE_LIMIT_'+res.status);if(!res.ok)throw Error('HTTP_'+res.status);const data=await res.json();if(!Array.isArray(data))throw Error('NON_ARRAY_RESPONSE');await save(path.join(dir,'raw',encodeURIComponent(endpoint+'?'+new URLSearchParams(params))+'.json'),data);return data;
 }
 async function range(endpoint,symbol,from,to){const key=keyOf(endpoint,symbol),map=index.get(key)??new Map();index.set(key,map);
  for(let start=from;start<=to;){if(map.has(start)){reusedPoints++;start+=STEP;continue;}let end=start;while(end+STEP<=to&&end-start<498*STEP&&!map.has(end+STEP))end+=STEP;
   const data=await get(endpoint,{symbol,...endpoint==='/fapi/v1/klines'?{interval:'5m'}:{period:'5m'},startTime:String(start),endTime:String(end+STEP-1),limit:'499'});
   for(const r of data)map.set(timeOf(endpoint,r),r);start=end+STEP;
  }return [...map.entries()].filter(([t])=>t>=from&&t<=to).sort(([a],[b])=>a-b).map(([,r])=>r);
 }
 const from=Math.floor(Math.min(...input.map(r=>r.heatmapSweepAtEntry.at))/STEP)*STEP,to=Math.floor(Math.max(...input.map(r=>r.heatmapSweepAtEntry.at))/STEP)*STEP-STEP;
 console.log(JSON.stringify({stage:'start',owned:meta.included.length,contextEntries:input.length,coins:new Set(input.map(r=>r.symbol)).size,cutoff:vn(meta.createdAt)}));
 const btc=await range('/fapi/v1/klines','BTCUSDT',from-240*STEP,to),symbols=[...new Set(input.map(r=>r.symbol))].sort(),results=[];await save(path.join(dir,'inputs','BTCUSDT-market.json'),{symbol:'BTCUSDT',price:btc,source:'BINANCE_PUBLIC_HISTORY_REUSED_CACHE'});
 for(const [i,symbol] of symbols.entries()){
  const records=input.filter(r=>r.symbol===symbol),lo=Math.floor(Math.min(...records.map(r=>r.heatmapSweepAtEntry.at))/STEP)*STEP,hi=Math.floor(Math.max(...records.map(r=>r.heatmapSweepAtEntry.at))/STEP)*STEP-STEP,errors=[];
  const safe=async(source,fn)=>{try{return await fn();}catch(e){if(e.message.startsWith('RATE_LIMIT'))throw e;errors.push({source,error:e.message});return [];}};
  const coin=await safe('coin',()=>range('/fapi/v1/klines',symbol,lo-240*STEP,hi)),ratio=await safe('ratio',()=>range('/futures/data/topLongShortAccountRatio',symbol,lo-25*STEP,hi)),oi=await safe('oi',()=>range('/futures/data/openInterestHist',symbol,lo-25*STEP,hi));
  await save(path.join(dir,'inputs',symbol+'.json'),{symbol,coin,ratio,oi,source:'BINANCE_PUBLIC_HISTORY_REUSED_CACHE',processedAt:Date.now(),historicalFetchTimeKnown:false});
  const part=records.map(record=>({record,features:shortFeatures({record,coin,btc,ratio,oi}),errors,reconstructed:true,processedAt:Date.now(),historicalFetchTimeKnown:false,publicationLatencyKnown:false}));results.push(...part);await save(path.join(dir,symbol+'.json'),{version:VERSION,results:part,errors});
  console.log(JSON.stringify({stage:'coin',i:i+1,total:symbols.length,symbol,entries:records.length,requests,reusedPoints,errors}));
 }
 results.sort((a,b)=>a.features.asOf-b.features.asOf);const summary=shortSummary(results,meta.included),output={version:VERSION,meta,summary,results,requests,reusedPoints,generatedAt:Date.now()};await save(path.join(dir,'results.json'),output);
 const table=rows=>['| Nhóm | Đóng | Thắng/thua | Win% | Net USDT | AvgROE% | SL | Coin/ngày |','|---|---:|---:|---:|---:|---:|---:|---:|',...rows.map(g=>`| ${g.label} | ${g.closed} | ${g.wins}/${g.losses} | ${fmt(g.winRate)} | ${fmt(g.net)} | ${fmt(g.avgRoe)} | ${g.stopLosses} | ${g.coins}/${g.days} |`)];
 const primary=results.filter(r=>!r.record.mixedClose&&r.record.positionStatus==='CLOSED'&&Number.isFinite(r.record.netRealizedPnlUsdt));
 const lines=['# SHORT quét hết cụm trên — đối chiếu thắng/thua theo bối cảnh','',`Version ${VERSION}. Khóa audit ${vn(meta.createdAt)} VN. Feature dataAsOf=event.at; dữ liệu public lịch sử Binance được tái dựng sau sự kiện.`, '',
  '## Mẫu và giới hạn','',
  '- Chỉ source heatmap-full-sweep SHORT khôngDCA, snapshot upper/full đúngcoin và exactopeningorder/side/eventID khớpledger. Dedupe symbol+openingID. OPEN không tính thắng/thua. Nhóm chính: margin5 và versionV4 bỏdrift, khôngmixedclose/DCAgroup; margin3 cũ và V3 tách khỏi so sánh feature. Second-sweep proof tách riêng; không suy nhãn lần2 ngược từ chart cũ.',
  '- PnL là net realized audit, ROE trung bình mỗi entry; không mô phỏng TP/SL. Sai phân bổ/partialclose/manualclose có thể còn trong audit. So yếu tố dùng ROE theo cùng size5/versionV4; không lấy net3/5 cộng để chứng minh cải thiện.',
  '- BTC/coin dùng closed5m end<event.at, tối đa240bars EMA20/50/RSI14Wilder. Ratio top trader ACCOUNT và OI quantity dùng timestamp+5m≤event,13điểm liên tiếp tối thiểu. Lùi một nhịp để thận trọng latency; không biết publication/cache/revisions, không chứng minh data thật đã có realtime.',
  '- SHORT overshoot=(MARK/maxhigh cụm−1)×100, armRise=(MARK/reference−1)×100; không dùng công thức LONG hoặc vùng tương lai. Volume/taker/râu là nếnđóng5m cuối, không phải cây quét đang mở. Actualfill−signal là biến sau quyết định, không cấp quyền preentry.',
  '- Bins và candidate fixed trước tải context, không tìm ngưỡng tối ưu. Nhiều coin cùngBTCmove không độc lập, mẫu vài ngày nhỏ; group<10lệnh hoặc<5coin cần thậntrọng. Split70/30theothời gian chỉ thử ổn định hồi cứu, khôngOOS vì đã xem audit. Net của PASS không phải portfolio backtest (loạientry thay positions/cooldown). Không coi tươngquan lànhânquả hay xácsuấtbềnvững.',
  '- Nghiên cứu read-only: không thay runtime/Discord/Push/Binance/entry/size/SL/TP/whitelist, không restart/relabel/replay. Reuse rawcache LONG + GETpublic cònthiếu, throttle650ms/weightpause850, dừng418/429. No signed IO.', '',
  ...table([{label:'Tất cả owned SHORT3/5',...summary.all},{label:'Khôngmixed3/5',...summary.allClean},{label:'Mixedclose',...summary.mixed},{label:'Legacy3 khôngmixed',...summary.legacy3},{label:'Tất cả5 khôngmixed (gồmV3)',...summary.all5},{label:'V4SHORT5 chính',...summary.primary},{label:'Có proof second-sweep',...summary.second}]), '',
  '## Coverage nhóm V4SHORT5 chính','', '```json',JSON.stringify(summary.coverage,null,2),'```','',
  '## Trung vị thắng/thua/SL','', '| Yếu tố | WIN | LOSS | SL |','|---|---:|---:|---:|',...SHORT_FACTORS.map(f=>`| ${f.title} | ${fmt(summary.medians[f.key].WIN)} | ${fmt(summary.medians[f.key].LOSS)} | ${fmt(summary.medians[f.key].SL)} |`),'',
  ...summary.factors.flatMap(f=>['## '+f.title,'',...table(f.groups),'']),
  '## Candidate chỉ nghiên cứu','',`Mốc split ${vn(summary.splitAt)} VN. Không áp dụng rule SHORT hoặc đảo ngược rule LONG tự động.`, '',
  ...summary.candidates.flatMap(c=>['### '+c.id+' — '+c.title,'',...table([{label:'PASS',...c.pass},{label:'FAIL',...c.fail},{label:'THIẾU',...c.missing},{label:'70%đầuPASS',...c.early.pass},{label:'70%đầuFAIL',...c.early.fail},{label:'30%cuốiPASS',...c.late.pass},{label:'30%cuốiFAIL',...c.late.fail}]),'']),
  '## Từng entry V4SHORT5','', '| Coin | Entry VN | Status | Mixed | Net | BTC1h% | Ratio/Δ1h% | OI1h% | RSI5m | Xuyên% |','|---|---|---|---|---:|---:|---:|---:|---:|---:|',
  ...results.map(r=>`| ${r.record.symbol} | ${vn(Date.parse(r.record.filledAt))} | ${r.record.positionStatus} | ${r.record.mixedClose} | ${fmt(r.record.netRealizedPnlUsdt)} | ${fmt(r.features.btc?.return1h)} | ${fmt(r.features.ratio?.value)}/${fmt(r.features.ratio?.change1h)} | ${fmt(r.features.oi?.change1h)} | ${fmt(r.features.coin?.rsi14)} | ${fmt(r.features.overshootPct)} |`),'',
  '## Lệnh SL trong nhóm chính','',...primary.filter(r=>r.record.closeReason==='STOP_LOSS_FILLED').map(r=>`- ${r.record.symbol} · ${vn(Date.parse(r.record.filledAt))} · net${fmt(r.record.netRealizedPnlUsdt)}USDT/ROE${fmt(r.record.realizedRoePct)}% · BTC1h${fmt(r.features.btc?.return1h)}% · ratio1h${fmt(r.features.ratio?.change1h)}% · RSI${fmt(r.features.coin?.rsi14)} · xuyên${fmt(r.features.overshootPct)}%.`),'',
  '## Nguồn','', '- [Binance public Market Data — klines/top trader ACCOUNT ratio/OI](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data).',
  '- Local audit/ledger: data/binance-filled-signal-audit/state.json và data/heatmap-sweep-binance.json. Khóa cohort/meta/raw/results riêng: data/research/heatmap-short-context-20261026/.', ''];
 await fs.mkdir(path.join(root,'reports'),{recursive:true});await fs.writeFile(path.join(root,'reports/heatmap-short-context-20261026.md'),lines.join('\n'));
 console.log(JSON.stringify({stage:'complete',requests,reusedPoints,all:summary.all,primary:summary.primary,coverage:summary.coverage}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
