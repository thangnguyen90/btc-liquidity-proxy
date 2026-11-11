// Research-only public GETs. No server, notifier, account or order client imports.
import fs from 'node:fs/promises';
import {detectResearch} from './research-early-pump-model.mjs';
export const DIR='data/research/early-pump-liquidity-20261102';
const S=300000,H=3600000,D=24*H;
await fs.mkdir(DIR+'/raw',{recursive:true});
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const save=async(f,x)=>{await fs.writeFile(f+'.tmp',JSON.stringify(x));await fs.rename(f+'.tmp',f);};
let next=0,calls=0,done=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(path,q={}){
 await sleep(Math.max(0,next-Date.now()));next=Date.now()+(path.startsWith('/futures/')?700:700);
 const r=await fetch('https://fapi.binance.com'+path+'?'+new URLSearchParams(q),{signal:AbortSignal.timeout(25000)});calls++;
 if([418,429].includes(r.status))throw Error('STOP_RATE_'+r.status);
 if(!r.ok)throw Error('HTTP_'+r.status);
 const w=Number(r.headers.get('x-mbx-used-weight-1m')??0);if(w>1400)next=Math.max(next,Date.now()+61000-Date.now()%60000);
 return r.json();
}
let manifest;try{manifest=await read(DIR+'/manifest.json');}catch(e){if(e.code!=='ENOENT')throw e;
 const time=await get('/fapi/v1/time'),info=await get('/fapi/v1/exchangeInfo');const end=Math.floor(time.serverTime/S)*S,start=end-7*D;
 manifest={version:'EARLY_PUMP_LIQUIDITY_RESEARCH_V1_20261102',frozenAt:Date.now(),start,end,split:start+4*D,purgeHours:6,universe:info.symbols.filter(x=>x.contractType==='PERPETUAL'&&x.quoteAsset==='USDT'&&x.status==='TRADING').map(x=>({symbol:x.symbol,onboardDate:x.onboardDate})),scope:'Current active USDT perpetual universe; survivorship limitation; 7 days, 4-day train / 3-day test with 6h purge and complete forward horizon',definition:'Exact V1 early-pump detector, closed5m, volume>=500k and>=3x median20, green close above prior12high; cooldown1h.',exits:'LONG 3x; TP10% gross ROE/SL20% gross ROE/4h cap, plus structural+model target experiment. Fee+slippage .14% notional; funding history included. Stress .30%.',liquidity:'Reconstruct same local Model1/3 at decision with 5m latency, 36h inputs; 10m lag sensitivity. Estimated liquidation pools, no historic L2/orderbook or actual liquidation feed.',selection:'Predeclared filter family and entry alternatives in study module. Train only selects candidate; test untouched until selection. No automatic production changes.'};await save(DIR+'/manifest.json',manifest);
}
const errors=[];let candidates=0,symbolCandidates=0;
async function pageSeries(symbol,type,from,to){
 const filename=DIR+'/raw/'+encodeURIComponent(symbol)+'-'+type+'.json';
 try{return await read(filename);}catch(e){if(e.code!=='ENOENT')throw e;}
 const specs={price:['/fapi/v1/klines','interval','5m',1500,S],mark:['/fapi/v1/markPriceKlines','interval','5m',1500,S],oi:['/futures/data/openInterestHist','period','5m',500,S],position:['/futures/data/topLongShortPositionRatio','period','15m',500,900000],funding:['/fapi/v1/fundingRate',null,null,1000,1]};
 const [path,key,value,limit,step]=specs[type],out=[];
 for(let cursor=from;cursor<to;){
  // Statistics endpoints may return the LAST limit points in a wide interval.
  // Bound each request's interval to at most limit periods, then advance that window.
  const windowEnd=path.startsWith('/futures/')?Math.min(to,cursor+limit*step):to;
  const q={symbol,startTime:cursor,endTime:windowEnd-1,limit};if(key)q[key]=value;
  const rows=await get(path,q);if(!Array.isArray(rows))throw Error('INVALID_RESPONSE_'+type);
  if(!rows.length){if(path.startsWith('/futures/')){cursor=windowEnd;continue;}break;}out.push(...rows);
  const last=Number(type==='price'||type==='mark'?rows.at(-1)[0]:type==='funding'?rows.at(-1).fundingTime:rows.at(-1).timestamp);
  if(!(last>=cursor))throw Error('NON_ADVANCING_PAGE');cursor=path.startsWith('/futures/')?windowEnd:last+step;
  if(rows.length<limit&&!path.startsWith('/futures/'))break;
 }
 await save(filename,out);return out;
}
const phase=process.argv[2]??'price';
for(const item of manifest.universe){
 const symbol=item.symbol;
 try{
  const price=await pageSeries(symbol,'price',Math.max(manifest.start-37*H,Math.floor(item.onboardDate/S)*S),manifest.end);
  const events=detectResearch(price,manifest.start,manifest.end);
  candidates+=events.length;if(events.length)symbolCandidates++;
  await save(DIR+'/raw/'+encodeURIComponent(symbol)+'-events.json',events);
  if(phase==='context'&&events.length){
   const from=Math.max(events[0].at-37*H,Math.floor(item.onboardDate/S)*S),to=Math.min(manifest.end,events.at(-1).at+5*H);
   for(const type of ['mark','oi','position','funding'])try{await pageSeries(symbol,type,from,to);}catch(e){if(e.message.startsWith('STOP_RATE'))throw e;errors.push({symbol,type,error:e.message});}
  }
 }catch(e){if(e.message.startsWith('STOP_RATE'))throw e;errors.push({symbol,type:'price',error:e.message});}
 done++;if(done%10===0||done===manifest.universe.length){const p={phase,done,total:manifest.universe.length,calls,candidates,symbolCandidates,errors,at:Date.now()};await save(DIR+'/progress-'+phase+'.json',p);console.log(JSON.stringify({...p,errors:errors.length}));}
}
console.log(JSON.stringify({complete:true,phase,calls,candidates,symbolCandidates,errors}));
