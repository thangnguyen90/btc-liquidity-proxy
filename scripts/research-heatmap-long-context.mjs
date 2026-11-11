// Research only: local audit reads + public historical GET. No account, order, notifier or runtime imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const VERSION='HEATMAP_LONG_PRE_ENTRY_CONTEXT_RESEARCH_V1_20261026';
const STEP=300000,H=3600000;
const finite=x=>typeof x==='number'&&Number.isFinite(x),mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const median=xs=>{if(!xs.length)return null;const a=xs.toSorted((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
const pct=(a,b)=>a>0&&b>0?(a/b-1)*100:null;
export const FEATURE_POLICY={barStepMs:STEP,ratioOiAvailabilityLagMs:STEP,coinWarmupBars:240,ratioOiWarmupBars:25,
 btc15mDownPct:-.15,btc1hDownPct:-.3,btc1hUpPct:.3,relative1hWeakPct:-.5,volSpikeX:2,emaDeepBelowPct:-2};
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});
const day=t=>new Date(t+7*H).toISOString().slice(0,10);
const fmt=n=>finite(n)?n.toFixed(3):'—';
async function read(p){try{return JSON.parse(await fs.readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const save=(p,v)=>fs.writeFile(p,JSON.stringify(v));
function ema(xs,n){if(xs.length<n)return null;let v=mean(xs.slice(0,n));for(const x of xs.slice(n))v=x*2/(n+1)+v*(1-2/(n+1));return v;}
function rsi(xs,n=14){if(xs.length<n+1)return null;let up=0,down=0;for(let i=1;i<=n;i++){up+=Math.max(0,xs[i]-xs[i-1])/n;down+=Math.max(0,xs[i-1]-xs[i])/n;}
 for(let i=n+1;i<xs.length;i++){up=(up*(n-1)+Math.max(0,xs[i]-xs[i-1]))/n;down=(down*(n-1)+Math.max(0,xs[i-1]-xs[i]))/n;}return down===0?(up===0?50:100):100-100/(1+up/down);}
export function barsBefore(raw,at){
 const rows=(raw??[]).filter(r=>Array.isArray(r)&&Number(r[6])<at).map(r=>({time:Number(r[0]),end:Number(r[6]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5]),quote:Number(r[7]),buy:Number(r[10])})).sort((a,b)=>a.time-b.time);
 const unique=[...new Map(rows.map(r=>[r.time,r])).values()].slice(-FEATURE_POLICY.coinWarmupBars);
 if(unique.length<60||unique.at(-1).time!==Math.floor(at/STEP)*STEP-STEP||unique.some((r,i)=>![r.time,r.end,r.open,r.high,r.low,r.close,r.volume,r.quote,r.buy].every(finite)
  ||Math.min(r.open,r.high,r.low,r.close)<=0||r.volume<0||r.quote<0||r.buy<0||r.buy>r.quote||r.high<Math.max(r.open,r.close)||r.low>Math.min(r.open,r.close)
  ||r.time%STEP!==0||r.end!==r.time+STEP-1||i&&r.time-unique[i-1].time!==STEP))return null;
 return unique;
}
export function samplesBefore(raw,at,valueKey){
 const rs=(raw??[]).map(r=>({timestamp:Number(r.timestamp),value:Number(r[valueKey]),long:Number(r.longAccount),short:Number(r.shortAccount)}))
  .filter(r=>r.timestamp+FEATURE_POLICY.ratioOiAvailabilityLagMs<=at).sort((a,b)=>a.timestamp-b.timestamp);
 const a=[...new Map(rs.map(r=>[r.timestamp,r])).values()].slice(-25),expected=Math.floor((at-STEP)/STEP)*STEP;
 if(a.length<13||a.at(-1).timestamp!==expected||a.some((r,i)=>!finite(r.value)||r.value<=0||!finite(r.timestamp)||r.timestamp%STEP!==0||i&&r.timestamp-a[i-1].timestamp!==STEP))return null;
 if(valueKey==='longShortRatio'&&a.some(r=>!finite(r.long)||!finite(r.short)||r.long<=0||r.short<=0||Math.abs(r.long+r.short-1)>.002||Math.abs(r.long/r.short/r.value-1)>.01))return null;
 return a;
}
function priceFeatures(bars){if(!bars)return null;const c=bars.map(r=>r.close),last=bars.at(-1),prior=bars.slice(-21,-1),e20=ema(c,20),e50=ema(c,50),range=last.high-last.low;
 return {lastClosedAt:last.end,return15m:pct(last.close,c.at(-4)),return1h:pct(last.close,c.at(-13)),return3h:pct(last.close,c.at(-37)),
  ema20Distance:pct(last.close,e20),ema50Distance:pct(last.close,e50),ema20Slope15m:pct(e20,ema(c.slice(0,-3),20)),rsi14:rsi(c),
  volumeX:mean(prior.map(r=>r.volume))>0?last.volume/mean(prior.map(r=>r.volume)):null,
  takerBuy15m:bars.slice(-3).reduce((s,r)=>s+r.quote,0)>0?bars.slice(-3).reduce((s,r)=>s+r.buy,0)/bars.slice(-3).reduce((s,r)=>s+r.quote,0)*100:null,
  lastClosedWickPct:range>0?(Math.min(last.open,last.close)-last.low)/range*100:0};
}
export function featuresFor({record,coin,btc,ratio,oi}){
 const e=record.heatmapSweepAtEntry,at=e.at,a=barsBefore(coin,at),b=barsBefore(btc,at),r=samplesBefore(ratio,at,'longShortRatio'),o=samplesBefore(oi,at,'sumOpenInterest');
 const cp=priceFeatures(a),bp=priceFeatures(b),last=r?.at(-1),ol=o?.at(-1),zs=e.zones??[],low=zs.length?Math.min(...zs.map(z=>z.low)):null;
 let betaDown=null,betaUp=null,betaDownN=0,betaUpN=0;
 if(a&&b){const bm=new Map(b.map(r=>[r.time,r])),pairs=[];for(let i=1;i<a.length;i++){const x=bm.get(a[i].time),prev=bm.get(a[i-1].time);if(x&&prev){const bx=pct(x.close,prev.close),cy=pct(a[i].close,a[i-1].close);if(Math.abs(bx)>=.05)pairs.push({x:bx,y:cy});}}
  for(const side of ['down','up']){const part=pairs.filter(r=>side==='down'?r.x<0:r.x>0),n=part.length,beta=n>=8?part.reduce((s,r)=>s+r.x*r.y,0)/part.reduce((s,r)=>s+r.x*r.x,0):null;if(side==='down'){betaDown=beta;betaDownN=n;}else{betaUp=beta;betaUpN=n;}}}
 return {asOf:at,coin:cp,btc:bp,ratio:r?{latestAt:last.timestamp,assumedAvailableAt:last.timestamp+STEP,value:last.value,longPct:last.long*100,
  change15m:pct(last.value,r.at(-4).value),change30m:pct(last.value,r.at(-7).value),change1h:pct(last.value,r.at(-13).value)}:null,
  oi:o?{latestAt:ol.timestamp,assumedAvailableAt:ol.timestamp+STEP,change15m:pct(ol.value,o.at(-4).value),change1h:pct(ol.value,o.at(-13).value)}:null,
  relative1h:cp&&bp?cp.return1h-bp.return1h:null,betaDown,betaUp,betaDownN,betaUpN,
  zoneCount:zs.length,zoneMeanStrength:zs.length?mean(zs.map(z=>z.overlapStrength).filter(finite)):null,
  armDropPct:(1-e.markPrice/e.referencePrice)*100,overshootPct:low>0?(1-e.markPrice/low)*100:null,cohortAgeMinutes:(e.at-e.armedAt)/60000,
  actualFillVsSignalPct:pct(record.avgFillPrice,e.markPrice),featureCoverage:{coin:!!cp,btc:!!bp,ratio:!!r,oi:!!o}};
}
export function selectCohort(audit,ledger){
 const all=Object.values(audit.fills??{}).map(f=>f.record??f),attempts=Object.values(ledger.attempts??{}),seen=new Set();
 const tagged=all.filter(r=>r.signalSource==='heatmap-full-sweep'&&r.direction==='LONG'),included=[],excluded=[];
 for(const r of tagged){const key=r.symbol+':'+(r.clientOrderId||r.orderId);let reason=null;
  if(seen.has(key))reason='DUPLICATE_OPENING_ORDER';else seen.add(key);
  if(!reason&&r.isDca===true)reason='DCA';
  if(!reason&&(r.heatmapSweepAtEntry?.kind!=='ALL_TRACKED_LOWER_SWEPT'||r.heatmapSweepAtEntry.direction!=='LOWER'||r.heatmapSweepAtEntry.symbol!==r.symbol))reason='NO_LOWER_SWEEP_PROOF';
  if(!reason&&!attempts.some(a=>a.symbol===r.symbol&&String(a.orderId)===String(r.orderId)&&a.side==='LONG'&&a.id===r.heatmapSweepSignalId))reason='NO_EXACT_LEDGER_MATCH';
  if(reason){excluded.push({symbol:r.symbol,orderId:r.orderId,reason,net:r.netRealizedPnlUsdt});continue;}
  const group=all.filter(x=>r.closeGroupId&&x.closeGroupId===r.closeGroupId),mixed=group.some(x=>x.signalSource!=='heatmap-full-sweep'||x.direction!=='LONG'||x.isDca===true);
  included.push({...r,mixedClose:mixed,closeGroupMembers:group.map(x=>({symbol:x.symbol,orderId:x.orderId,source:x.signalSource,isDca:x.isDca}))});
 }
 return {included:included.sort((a,b)=>Date.parse(a.filledAt)-Date.parse(b.filledAt)),excluded};
}
export function stats(rs){const c=rs.filter(r=>r.record.positionStatus==='CLOSED'&&finite(r.record.netRealizedPnlUsdt)),wins=c.filter(r=>r.record.netRealizedPnlUsdt>0),loss=c.filter(r=>r.record.netRealizedPnlUsdt<0),roes=c.map(r=>r.record.realizedRoePct).filter(finite),sum=a=>a.reduce((s,r)=>s+r.record.netRealizedPnlUsdt,0),positive=sum(wins),negative=sum(loss),n=c.length,p=n?wins.length/n:0,z=1.96,center=n?(p+z*z/(2*n))/(1+z*z/n):null,half=n?z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n):null;
 return {entries:rs.length,closed:n,open:rs.filter(r=>r.record.positionStatus!=='CLOSED').length,wins:wins.length,losses:loss.length,winRate:n?p*100:null,net:sum(c),avgRoe:mean(roes),medianRoe:median(roes),profitFactor:negative<0?positive/-negative:null,
  stopLosses:c.filter(r=>r.record.closeReason==='STOP_LOSS_FILLED').length,coins:new Set(c.map(r=>r.record.symbol)).size,days:new Set(c.map(r=>day(Date.parse(r.record.filledAt)))).size,winRateWilson95:n?[(center-half)*100,(center+half)*100]:null};
}
const value=(r,key)=>key.split('.').reduce((o,k)=>o?.[k],r.features);
// Prespecified bins, not thresholds fitted to winning trades.
export const FACTORS=[
 {key:'btc.return15m',title:'BTC 15m đã đóng',cuts:[-.15,.15],labels:['Giảm <-0,15%','Đi ngang −0,15..+0,15%','Tăng ≥0,15%']},
 {key:'btc.return1h',title:'BTC 1h đã đóng',cuts:[-.3,.3],labels:['Giảm <-0,3%','Đi ngang −0,3..+0,3%','Tăng ≥0,3%']},
 {key:'relative1h',title:'Coin trừ BTC 1h (điểm %)',cuts:[-.5,.5],labels:['Yếu hơn BTC >0,5đ%','Gần BTC ±0,5đ%','Mạnh hơn BTC ≥0,5đ%']},
 {key:'ratio.value',title:'Top trader ACCOUNT ratio',cuts:[1,2],labels:['<1','1..<2','≥2']},
 {key:'ratio.change30m',title:'Ratio thay đổi 30m',cuts:[-3,3],labels:['Giảm <-3%','Đi ngang ±3%','Tăng ≥3%']},
 {key:'ratio.change1h',title:'Ratio thay đổi 1h',cuts:[-5,5],labels:['Giảm <-5%','Đi ngang ±5%','Tăng ≥5%']},
 {key:'oi.change1h',title:'OI lượng hợp đồng thay đổi 1h',cuts:[-2,2],labels:['Giảm <-2%','Gần ngang ±2%','Tăng ≥2%']},
 {key:'coin.ema20Distance',title:'Coin cách EMA20 nến5m',cuts:[-2,0],labels:['Dưới EMA >2%','Dưới EMA ≤2%','Trên EMA']},
 {key:'coin.rsi14',title:'RSI14 nến5m',cuts:[30,45,60],labels:['<30','30..<45','45..<60','≥60']},
 {key:'coin.volumeX',title:'Volume nến5m cuối/nền20',cuts:[1,2],labels:['<1×','1..<2×','≥2×']},
 {key:'coin.takerBuy15m',title:'Taker mua 15m',cuts:[45,55],labels:['<45%','45..<55%','≥55%']},
 {key:'armDropPct',title:'MARK giảm từ lúc arm đến quét',cuts:[1,3],labels:['<1%','1..<3%','≥3%']},
 {key:'zoneCount',title:'Số cụm quét',cuts:[2,3],labels:['1 cụm','2 cụm','≥3 cụm']},
 {key:'zoneMeanStrength',title:'Cường độ cụm trung bình',cuts:[50,70],labels:['35..<50','50..<70','≥70']},
 {key:'overshootPct',title:'MARK xuyên mép dưới cụm xa nhất',cuts:[.1,.5],labels:['<0,1%','0,1..<0,5%','≥0,5%']},
 {key:'actualFillVsSignalPct',title:'Giá khớp so MARK tín hiệu (sau quyết định)',cuts:[-.1,.1],labels:['Thấp hơn >0,1%','Trong ±0,1%','Cao hơn ≥0,1%']},
];
function bins(rs,f){return [...f.labels.map((label,i)=>({label,...stats(rs.filter(r=>{const v=value(r,f.key);return finite(v)&&(i===0||v>=f.cuts[i-1])&&(i===f.cuts.length||v<f.cuts[i]);}))})),{label:'THIẾU',...stats(rs.filter(r=>!finite(value(r,f.key))))}];}
const CANDIDATES=[
 {id:'BTC_NOT_DOWN',title:'BTC15m≥−0,15% và1h≥−0,3%',keys:['btc.return15m','btc.return1h'],pass:r=>value(r,'btc.return15m')>=-.15&&value(r,'btc.return1h')>=-.3},
 {id:'NOT_WEAK_VS_BTC',title:'Coin−BTC1h≥−0,5đ%',keys:['relative1h'],pass:r=>value(r,'relative1h')>=-.5},
 {id:'RATIO_NOT_SURGING',title:'Ratio30m<+3%',keys:['ratio.change30m'],pass:r=>value(r,'ratio.change30m')<3},
 {id:'RATIO_FALLING',title:'Ratio30m<−3%',keys:['ratio.change30m'],pass:r=>value(r,'ratio.change30m')< -3},
 {id:'NOT_DEEP_UNDER_EMA',title:'Giá nến đóng cáchEMA20≥−2%',keys:['coin.ema20Distance'],pass:r=>value(r,'coin.ema20Distance')>=-2},
 {id:'BUY_NOT_DOMINATED',title:'Taker mua15m≥45%',keys:['coin.takerBuy15m'],pass:r=>value(r,'coin.takerBuy15m')>=45},
 {id:'BTC_AND_RELATIVE',title:'BTC khônggiảm + coin khôngyếuhơnBTC',keys:['btc.return15m','btc.return1h','relative1h'],pass:r=>value(r,'btc.return15m')>=-.15&&value(r,'btc.return1h')>=-.3&&value(r,'relative1h')>=-.5},
];
export function summarize(rs){
 const closed=rs.filter(r=>r.record.positionStatus==='CLOSED'&&finite(r.record.netRealizedPnlUsdt)),clean=closed.filter(r=>!r.record.mixedClose),cut=Math.floor(clean.length*.7),splitAt=clean[cut]?.features.asOf??Infinity;
 const candidates=CANDIDATES.map(rule=>{const known=clean.filter(r=>rule.keys.every(k=>finite(value(r,k)))),pass=known.filter(rule.pass),fail=known.filter(r=>!rule.pass(r));return {id:rule.id,title:rule.title,pass:stats(pass),fail:stats(fail),missing:stats(clean.filter(r=>!known.includes(r))),
  early:{pass:stats(pass.filter(r=>r.features.asOf<splitAt)),fail:stats(fail.filter(r=>r.features.asOf<splitAt))},late:{pass:stats(pass.filter(r=>r.features.asOf>=splitAt)),fail:stats(fail.filter(r=>r.features.asOf>=splitAt))}};});
 return {all:stats(rs),closed:stats(closed),clean:stats(clean),mixed:stats(closed.filter(r=>r.record.mixedClose)),splitAt,
  coverage:Object.fromEntries(['coin','btc','ratio','oi'].map(k=>[k,{available:clean.filter(r=>r.features.featureCoverage[k]).length,total:clean.length}])),
  medians:Object.fromEntries(FACTORS.map(f=>[f.key,{win:median(clean.filter(r=>r.record.netRealizedPnlUsdt>0).map(r=>value(r,f.key)).filter(finite)),loss:median(clean.filter(r=>r.record.netRealizedPnlUsdt<0).map(r=>value(r,f.key)).filter(finite)),
   stopLoss:median(clean.filter(r=>r.record.closeReason==='STOP_LOSS_FILLED').map(r=>value(r,f.key)).filter(finite)),smallLoss:median(clean.filter(r=>r.record.netRealizedPnlUsdt<0&&r.record.netRealizedPnlUsdt>-.05).map(r=>value(r,f.key)).filter(finite))}])),
  factors:FACTORS.map(f=>({key:f.key,title:f.title,groups:bins(clean,f)})),candidates};
}
async function main(){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'data/research/heatmap-long-context-20261026');await fs.mkdir(path.join(dir,'raw'),{recursive:true});
 let meta=await read(path.join(dir,'meta.json'));
 if(!meta){const audit=await read(path.join(root,'data/binance-filled-signal-audit/state.json')),ledger=await read(path.join(root,'data/heatmap-sweep-binance.json'));meta={version:VERSION,createdAt:Date.now(),policy:FEATURE_POLICY,...selectCohort(audit,ledger)};await save(path.join(dir,'meta.json'),meta);}
 if(meta.version!==VERSION)throw Error('VERSION_MISMATCH');
 let lastRequest=0,weight=0,requests=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function get(endpoint,params){const p=path.join(dir,'raw',encodeURIComponent(endpoint+'?'+new URLSearchParams(params))+'.json'),cache=await read(p);if(cache)return cache;
  await sleep(Math.max(0,650-(Date.now()-lastRequest)));if(weight>=850){console.log(JSON.stringify({stage:'weight_pause',weight}));await sleep(Math.min(60000,61000-Date.now()%60000));weight=0;}
  lastRequest=Date.now();const u=new URL(endpoint,'https://fapi.binance.com');u.search=new URLSearchParams(params);const res=await fetch(u,{signal:AbortSignal.timeout(20000)});requests++;weight=Number(res.headers.get('x-mbx-used-weight-1m')??weight);
  if([418,429].includes(res.status))throw Error('RATE_LIMIT_'+res.status);
  if(!res.ok)throw Error('HTTP_'+res.status);const body=await res.json();if(!Array.isArray(body))throw Error('NON_ARRAY_RESPONSE');await save(p,body);return body;
 }
 async function range(endpoint,symbol,from,to,candles=false){const rows=[];for(let start=from;start<=to;start+=499*STEP){const end=Math.min(to,start+499*STEP-1),part=await get(endpoint,{symbol,...candles?{interval:'5m'}:{period:'5m'},startTime:String(start),endTime:String(end),limit:'499'});rows.push(...part);}return rows;}
 const times=meta.included.map(r=>r.heatmapSweepAtEntry.at),min=Math.floor(Math.min(...times)/STEP)*STEP,max=Math.floor(Math.max(...times)/STEP)*STEP;
 console.log(JSON.stringify({stage:'start',entries:meta.included.length,excluded:meta.excluded.length,coins:new Set(meta.included.map(r=>r.symbol)).size,cutoff:vn(meta.createdAt)}));
 const btc=await range('/fapi/v1/klines','BTCUSDT',min-240*STEP,max-1,true),results=[];
 const symbols=[...new Set(meta.included.map(r=>r.symbol))].sort();
 for(const [i,symbol] of symbols.entries()){
  const file=path.join(dir,symbol+'.json'),cached=await read(file);if(cached&&!cached.errors?.length){results.push(...cached.results);continue;}
  const group=meta.included.filter(r=>r.symbol===symbol),lo=Math.floor(Math.min(...group.map(r=>r.heatmapSweepAtEntry.at))/STEP)*STEP,hi=Math.floor(Math.max(...group.map(r=>r.heatmapSweepAtEntry.at))/STEP)*STEP,errors=[];
  const safe=async(k,fn)=>{try{return await fn();}catch(e){if(e.message.startsWith('RATE_LIMIT'))throw e;errors.push({source:k,error:e.message});return [];}};
  const coin=await safe('coin',()=>range('/fapi/v1/klines',symbol,lo-240*STEP,hi-1,true));
  const ratio=await safe('ratio',()=>range('/futures/data/topLongShortAccountRatio',symbol,lo-25*STEP,hi-1));
  const oi=await safe('oi',()=>range('/futures/data/openInterestHist',symbol,lo-25*STEP,hi-1));
  const part=group.map(record=>({record,features:featuresFor({record,coin,btc,ratio,oi}),actualFetchedAt:Date.now(),reconstructed:true,publicationLatencyKnown:false,errors}));
  results.push(...part);await save(file,{version:VERSION,results:part,errors});
  console.log(JSON.stringify({stage:'coin',i:i+1,total:symbols.length,symbol,entries:part.length,errors,requests,weight}));
 }
 results.sort((a,b)=>a.features.asOf-b.features.asOf);
 const summary=summarize(results),out={version:VERSION,meta,summary,results,requests,generatedAt:Date.now()};await save(path.join(dir,'results.json'),out);
 const table=groups=>['| Nhóm | Đóng | Thắng/thua | Win% | Net USDT | AvgROE% | SL | Coin/ngày |','|---|---:|---:|---:|---:|---:|---:|---:|',...groups.map(g=>`| ${g.label} | ${g.closed} | ${g.wins}/${g.losses} | ${fmt(g.winRate)} | ${fmt(g.net)} | ${fmt(g.avgRoe)} | ${g.stopLosses} | ${g.coins}/${g.days} |`)];
 const lines=['# LONG quét hết cụm dưới — thắng/thua theo bối cảnh trước entry','',`Version ${VERSION}. Khóa cohort ${vn(meta.createdAt)} VN. Dữ liệu giá/ratio/OI lịch sử Binance, tái dựng sau sự kiện.`, '',
  '## Phạm vi và cách đọc','',
  '- Chỉ fills LONG nguồn heatmap, không DCA, snapshot ALL_TRACKED_LOWER_SWEPT đúng coin và opening order khớp ledger. Dedupe symbol+clientOrderId/orderId. OPEN không vào mẫu thắng/thua; PnL là net thực tế đã ghi trong audit, không mô phỏng TP/SL.',
  '- Nhóm chính loại các closeGroup có nguồn khác hoặc DCA; vẫn có thể còn sai phân bổ vị thế/partial close trong audit. Không coi số liệu là đối soát độc lập với Binance.',
  '- Thời điểm feature = event.at (trước quyết định/fill). Chỉ nến5m đã đóng trước event; dùng tối đa240nến để EMA20/50 và RSI Wilder14. Volume/taker/râu là nến đã đóng cuối cùng, KHÔNG phải nến quét đang mở. BTC15m/1h là return từ các close5m đồng bộ, không suy cùng xu hướng chỉ từ một số dương/âm.',
  '- Ratio là top trader ACCOUNT, không position/global và không đo tiền Long/Short. Ratio/OI timestamp+5phút≤event; lùi một nhịp để thận trọng về công bố. Không biết latency/cache/revision thực tế; không phải proof đã có sẵn realtime. Dùng OI lượng hợp đồng, không notional bị ảnh hưởng giá.',
  '- Vùng Model1/3 lấy đúng snapshot đã freeze trước sự kiện, không vẽ lại bằng giá sauentry. Overshoot = MARK thấp hơn mép dưới cụm xa nhất; actualFillVsSignal là biến sau quyết định, tách khỏi rule pre-entry.',
  '- Các bins/candidate được ấn định trong code trước khi tải bối cảnh; không tìm ngưỡng tối ưu. So sánh hồi cứu trên những lệnh bot ĐÃ vào, không phải quét toàn thị trường hay backtest các cơ hội bị bỏ. Nhiều lệnh cùngcoin/cùngBTCmove không độc lập; sample3–4ngày ít, không chứng minh nguyên nhân hoặc lợi thế bền vững.',
  '- Split70/30 theo thời gian chỉ là kiểm tra độ ổn định hồi cứu; không phải out-of-sample thực sự vì đã xem kết quả audit trước khi thiết kế nghiên cứu. Mọi nhóm nhỏ (<10lệnh hoặc <5coin) cần đọc thận trọng; không chọn nhóm chỉ vì net cao.',
  '- Không thay runtime, labels/card/whitelist/gate/size/entry/SL/TP; không restart/order/Discord/Push. JSON nghiên cứu riêng, không migrate/relabel ledger hoặc cấp quyền giao dịch.', '',
  ...table([{label:'Có proof + ledger',...summary.all},{label:'Closed không trộn nguồn (nhóm chính)',...summary.clean},{label:'Closed trộn nguồn',...summary.mixed}]),'',
  '## Dữ liệu đủ trong nhóm chính','', '```json',JSON.stringify(summary.coverage,null,2),'```','',
  '## Trung vị yếu tố — thắng so với thua','', '| Yếu tố | Thắng | Thua | Riêng SL | Âm nhỏ <0,05 USDT |','|---|---:|---:|---:|---:|',...FACTORS.map(f=>`| ${f.title} | ${fmt(summary.medians[f.key].win)} | ${fmt(summary.medians[f.key].loss)} | ${fmt(summary.medians[f.key].stopLoss)} | ${fmt(summary.medians[f.key].smallLoss)} |`),'',
  ...summary.factors.flatMap(f=>['## '+f.title,'',...table(f.groups),'']),
  '## Kiểm tra bộ lọc giả thuyết, không áp dụng','',`Mốc chia theo thời gian: ${vn(summary.splitAt)} VN. PnL thực của lệnh đã quan sát; loại lệnh sẽ thay lịch sử vị thế/cooldown, nên tổng nhóm PASS không phải backtest portfolio triển khai.`, '',
  ...summary.candidates.flatMap(c=>['### '+c.id+' — '+c.title,'',...table([{label:'PASS',...c.pass},{label:'FAIL',...c.fail},{label:'THIẾU',...c.missing},{label:'70%đầu PASS',...c.early.pass},{label:'70%đầu FAIL',...c.early.fail},{label:'30%cuối PASS',...c.late.pass},{label:'30%cuối FAIL',...c.late.fail}]),'']),
  '## Mẫu thua SL','', '| Coin | Entry VN | Net | BTC15m/1h% | Ratio/Δ30m% | RSI | EMA20dist% | Vol× |','|---|---|---:|---:|---:|---:|---:|---:|',
  ...results.filter(r=>r.record.closeReason==='STOP_LOSS_FILLED').map(r=>`| ${r.record.symbol} | ${vn(Date.parse(r.record.filledAt))} | ${fmt(r.record.netRealizedPnlUsdt)} | ${fmt(r.features.btc?.return15m)}/${fmt(r.features.btc?.return1h)} | ${fmt(r.features.ratio?.value)}/${fmt(r.features.ratio?.change30m)} | ${fmt(r.features.coin?.rsi14)} | ${fmt(r.features.coin?.ema20Distance)} | ${fmt(r.features.coin?.volumeX)} |`),'',
  '## Từng entry','', '| Coin | Entry VN | Status | Mixed | Net | BTC15m/1h% | Ratio/Δ30m% | OI1h% | RSI5m | EMA20dist% |','|---|---|---|---|---:|---:|---:|---:|---:|---:|',
  ...results.map(r=>`| ${r.record.symbol} | ${vn(Date.parse(r.record.filledAt))} | ${r.record.positionStatus} | ${r.record.mixedClose} | ${fmt(r.record.netRealizedPnlUsdt)} | ${fmt(r.features.btc?.return15m)}/${fmt(r.features.btc?.return1h)} | ${fmt(r.features.ratio?.value)}/${fmt(r.features.ratio?.change30m)} | ${fmt(r.features.oi?.change1h)} | ${fmt(r.features.coin?.rsi14)} | ${fmt(r.features.coin?.ema20Distance)} |`),'',
  '## Nguồn','', '- [Binance Market Data: top trader account ratio, OI và klines](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data).',
  '- Audit local `data/binance-filled-signal-audit/state.json` và ledger `data/heatmap-sweep-binance.json`; cohort/results/raw cache cố định tại `data/research/heatmap-long-context-20261026/`.', ''];
 await fs.mkdir(path.join(root,'reports'),{recursive:true});await fs.writeFile(path.join(root,'reports/heatmap-long-context-20261026.md'),lines.join('\n'));
 console.log(JSON.stringify({stage:'complete',requests,summary}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
