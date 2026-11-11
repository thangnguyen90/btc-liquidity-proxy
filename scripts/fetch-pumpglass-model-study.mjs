// Offline public research. No runtime, notifier or execution imports.
import fs from 'node:fs/promises';
const dir='data/research/pumpglass-model13-20261102',base='data/research/pumpglass-positioning-20261102';await fs.mkdir(dir+'/raw',{recursive:true});
const read=async f=>JSON.parse(await fs.readFile(f,'utf8')),save=async(f,x)=>fs.writeFile(f,JSON.stringify(x));
const r=await read(base+'/results.json'),selected=r.records.filter(x=>x.side==='LONG'&&['DIVERGENCE70_40','GAP30_60'].includes(x.filter)),symbols=[...new Set(selected.map(x=>x.symbol))];
const manifest={version:'PUMPGLASS_MODEL13_RESEARCH_V1_20261102',start:r.manifest.start,end:r.manifest.end,split:r.manifest.split,source:base,priceSource:r.manifest.source,symbols,sourceRecords:selected,createdAt:Date.now(),method:'Same frozen records and outcomes as PumpGlass study. No new signals after seeing model. Both enabled LONG groups, original8h TP10/SL20 at3x, fees/funding unchanged. Model5m and10m lag, reconstruct36h with same backend simulator. All variations exploratory on already-seen7d.'};await save(dir+'/manifest.json',manifest);
let calls=0,next=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){await sleep(Math.max(0,next-Date.now()));next=Date.now()+650;const res=await fetch(url,{signal:AbortSignal.timeout(20000)});calls++;if([418,429,403].includes(res.status))throw Error('STOP_HTTP_'+res.status);if(!res.ok)throw Error('HTTP_'+res.status);const w=+res.headers.get('x-mbx-used-weight-1m');if(w>1400)next=Math.max(next,Date.now()+61000-Date.now()%60000);return res.json();}
const access=[];
for(const symbol of ['AINUSDT','BTCUSDT']){
 const file=dir+'/raw/'+symbol+'-chart-access.json';let h;try{h=await read(file);}catch{h=await get('https://pumpglass.com/smart-money/api/chart?'+new URLSearchParams({symbol,since:Math.floor(manifest.start/1000),until:Math.floor(manifest.end/1000)}));await save(file,h);}
 access.push({symbol,locked:h.locked,keys:Object.keys(h),whaleRows:h.whales?.length??0,rowsWithLongAvg:h.whales?.filter(w=>typeof w[5]==='number'&&w[5]>0).length??0,rowsWithShortAvg:h.whales?.filter(w=>typeof w[6]==='number'&&w[6]>0).length??0,pnlSeriesAvailable:Object.keys(h).some(k=>/pnl|profit/i.test(k))});
}
await save(dir+'/source-access-audit.json',{checkedAt:Date.now(),access,note:'Free chart endpoint hides avg-entry columns when locked=true. No bypass or alternate auth. Missing historical avg entry/PnL cannot be reconstructed from current token snapshot.'});
let done=0;const errors=[];
for(const symbol of symbols){for(const type of ['mark','oi']){
 const file=dir+'/raw/'+encodeURIComponent(symbol)+'-'+type+'.json';try{await read(file);continue;}catch(e){if(e.code!=='ENOENT')throw e;}
 try{const step=300000,limit=type==='oi'?500:1500,out=[];const from=manifest.start-37*3600000;
 for(let t=from;t<manifest.end;){const end=Math.min(manifest.end,t+limit*step),q={symbol,startTime:t,endTime:end-1,limit};q[type==='oi'?'period':'interval']='5m';const page=await get('https://fapi.binance.com'+(type==='oi'?'/futures/data/openInterestHist':'/fapi/v1/markPriceKlines')+'?'+new URLSearchParams(q));if(!Array.isArray(page))throw Error('INVALID_RESPONSE');out.push(...page);t=end;}
 await save(file,[...new Map(out.map(x=>[type==='oi'?+x.timestamp:+x[0],x])).values()].sort((a,b)=>(type==='oi'?a.timestamp-b.timestamp:a[0]-b[0])));
 }catch(e){if(e.message.startsWith('STOP_'))throw e;errors.push({symbol,type,error:e.message});}
 }done++;const p={done,total:symbols.length,calls,errors,at:Date.now()};await save(dir+'/fetch-progress.json',p);console.log(JSON.stringify({...p,errors:errors.length}));}
console.log(JSON.stringify({complete:true,access,errors,calls}));
