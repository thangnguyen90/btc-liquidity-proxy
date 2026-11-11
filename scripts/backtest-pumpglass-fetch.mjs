// Public GET research only. Uses frozen Binance price universe from prior study.
import fs from 'node:fs/promises';
const dir='data/research/pumpglass-positioning-20261102',source='data/research/early-pump-liquidity-20261102';
await fs.mkdir(dir+'/raw',{recursive:true});const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),save=async(p,x)=>{await fs.writeFile(p+'.tmp',JSON.stringify(x));await fs.rename(p+'.tmp',p);};
let next=0,calls=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){await sleep(Math.max(0,next-Date.now()));next=Date.now()+550;const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});calls++;if([418,429,403].includes(r.status))throw Error('STOP_HTTP_'+r.status);if(!r.ok)throw Error('HTTP_'+r.status);return r.json();}
let manifest;try{manifest=await read(dir+'/manifest.json');}catch(e){if(e.code!=='ENOENT')throw e;const old=await read(source+'/manifest.json'),board=await get('https://pumpglass.com/smart-money/api/board');await save(dir+'/board.json',board);const listed=new Set(board.rows.map(r=>r.s));manifest={version:'PUMPGLASS_POSITIONING_RESEARCH_V1_20261102',frozenAt:Date.now(),start:old.start,end:old.end,split:old.split,universe:old.universe.filter(x=>listed.has(x.symbol)),excluded:old.universe.filter(x=>!listed.has(x.symbol)),source,scope:'PumpGlass history14d intersect previously frozen current Binance activeUSDT universe. History w/c only; no historical entry/PnL/count/smart series.',availability:'Unknown bucket aggregation/publication semantics. Primary use t+bucket+5m. Sensitivity t+2*bucket+5m. Never use bucket-start values immediately.',method:'Fixed predeclared whale dominance/gap/change families, LONG and SHORT,8h capped TP10/SL20 grossROE at3x; fees/slippage .14%notional stress.30%, actual funding where available. Train/test chronological6h purge replaced24h here. Historical selection/bucket revisions unknown; no fresh unseen holdout.'};await save(dir+'/manifest.json',manifest);}
const errors=[];let done=0;
for(const {symbol}of manifest.universe){
 try{const f=dir+'/raw/'+encodeURIComponent(symbol)+'-history.json';try{await read(f);}catch(e){if(e.code!=='ENOENT')throw e;const h=await get('https://pumpglass.com/smart-money/api/history?'+new URLSearchParams({symbol,range:'14d'}));if(!Array.isArray(h.bars)||!Number.isFinite(h.bucket))throw Error('HISTORY_SCHEMA');await save(f,h);}
 const fund=dir+'/raw/'+encodeURIComponent(symbol)+'-funding.json';try{await read(fund);}catch(e){if(e.code!=='ENOENT')throw e;let existing;try{existing=await read(source+'/raw/'+encodeURIComponent(symbol)+'-funding.json');}catch{}
 if(existing?.length&&+existing[0].fundingTime<=manifest.start+28800000&&+existing.at(-1).fundingTime>=manifest.end-28800000)await save(fund,existing);
 else await save(fund,await get('https://fapi.binance.com/fapi/v1/fundingRate?'+new URLSearchParams({symbol,startTime:manifest.start,endTime:manifest.end-1,limit:1000})));}
 }catch(e){if(e.message.startsWith('STOP_'))throw e;errors.push({symbol,error:e.message});}
 done++;if(done%20===0||done===manifest.universe.length){const p={done,total:manifest.universe.length,calls,errors,at:Date.now()};await save(dir+'/progress.json',p);console.log(JSON.stringify({...p,errors:errors.length}));}
}
console.log(JSON.stringify({complete:true,done,calls,errors}));
