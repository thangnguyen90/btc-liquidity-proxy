import {readFile} from 'node:fs/promises';
import {detectPostPumpEma99Retest} from '../src/postPumpEma99Retest.js';
const symbol=process.argv[2]??'哈基米USDT',now=Date.now(),tf=900000;
async function get(interval,limit,extra={}){const url=new URL('https://fapi.binance.com/fapi/v1/klines');for(const [k,v]of Object.entries({symbol,interval,limit,...extra}))url.searchParams.set(k,v);const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`Binance ${r.status}`);return (await r.json()).filter(b=>b[6]<now);}
const bars=await get('15m',1000),state=JSON.parse(await readFile('data/post-pump-ema99-discord.json','utf8'));
const sent=Object.entries(state.symbols).filter(([key])=>key.startsWith(`${symbol}|15m|`)&&key.endsWith('|REJECTED_SHORT_WATCH')).sort((a,b)=>b[1].sentAt-a[1].sentAt)[0];
const signals=[];
for(let i=164;i<bars.length;i++){const e=detectPostPumpEma99Retest(bars.slice(Math.max(0,i-239),i+1),{symbol,interval:'15m',now:bars[i][6]+1}).find(e=>e.candleAt===bars[i][0]&&e.stage==='REJECTED_SHORT_WATCH');if(e)signals.push({i,e});}
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const horizons=[15,30,60,120,240];
const aggregate=horizons.map(min=>{const n=min/15,samples=signals.filter(s=>bars[s.i+n]).map(s=>(+bars[s.i+n][4]/+bars[s.i+1][1]-1)*100);return {minutes:min,n:samples.length,longMeanPricePct:mean(samples),shortMeanPricePct:mean(samples.map(v=>-v)),longWinsAfterAssumedFee:samples.filter(v=>v>.1).length,shortWinsAfterAssumedFee:samples.filter(v=>v<-.1).length};});
let focus=null;
if(sent){const at=Number(sent[0].split('|')[2]),i=bars.findIndex(b=>b[0]===at),e=signals.find(s=>s.i===i)?.e;
 const minute=await get('1m',1000,{startTime:Math.ceil(sent[1].sentAt/60000)*60000});const entry=+minute[0]?.[1];
 focus={sentAt:new Date(sent[1].sentAt).toISOString(),signalOpen:new Date(at).toISOString(),signalClose:new Date(at+tf-1).toISOString(),reproduced:Boolean(e),signal:e??null,
 entryAssumption:'First full 1m open AFTER Discord sent (not actual fill)',entryAt:minute[0]?new Date(minute[0][0]).toISOString():null,entry,
 outcomes:horizons.map(min=>{const sample=minute.slice(0,min);if(sample.length<min)return {minutes:min,complete:false};const ret=(+sample.at(-1)[4]/entry-1)*100;return {minutes:min,complete:true,longPricePct:ret,shortPricePct:-ret,longNetRoe5x:(ret-.1)*5,shortNetRoe5x:(-ret-.1)*5,upExcursionPct:(Math.max(...sample.map(b=>+b[2]))/entry-1)*100,downExcursionPct:(1-Math.min(...sample.map(b=>+b[3]))/entry)*100};}),
 latestClosed:minute.length?{time:new Date(minute.at(-1)[6]).toISOString(),price:+minute.at(-1)[4],longPricePct:(+minute.at(-1)[4]/entry-1)*100}:null,
 shortOriginalProtection:e?{tp:e.takeProfit,sl:e.invalidation,firstHit:minute.map(b=>({time:new Date(b[0]).toISOString(),tp:+b[3]<=e.takeProfit,sl:+b[2]>=e.invalidation})).find(b=>b.tp||b.sl)??null}:null};}
console.log(JSON.stringify({symbol,asOf:new Date(now).toISOString(),window:{from:new Date(bars[164][0]).toISOString(),to:new Date(bars.at(-1)[6]).toISOString()},method:'Closed candles only, rolling up to240 (minimum165; EMA seed may differ from live cache); all detections, not cooldown-filtered. Aggregate entry next15m open; fixed horizon exit; roundtrip fee assumption0.10% notional; no funding/slippage. Not actual trade PnL.',signals:signals.map(s=>({time:new Date(s.e.candleCloseAt).toISOString(),entry:s.e.referenceEntry})),aggregate,focus},null,2));
