import {UPPER_MOMENTUM_VERSION,upperMomentumChecks,upperMomentumState} from '../public/heatmap-upper-momentum-model.js';
const STEP=300000,finite=Number.isFinite,pct=(a,b)=>(a/b-1)*100;
export function upperMomentumBars(rows,at,count=21){
 const rs=(rows??[]).filter(r=>Array.isArray(r)&&Number(r[6])<at).map(r=>({time:Number(r[0]),end:Number(r[6]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),quote:Number(r[7])})).sort((a,b)=>a.time-b.time).slice(-count);
 return rs.length===count&&rs.at(-1).end===Math.floor(at/STEP)*STEP-1&&rs.every((r,i)=>Object.values(r).every(finite)&&r.time%STEP===0&&r.end===r.time+STEP-1&&r.low>0&&r.low<=Math.min(r.open,r.close)&&r.high>=Math.max(r.open,r.close)&&r.quote>=0&&(!i||r.time-rs[i-1].time===STEP))?rs:null;
}
function series(rows,at,key,symbol){
 const r=(rows??[]).filter(x=>Number(x.timestamp)+STEP<=at).sort((a,b)=>a.timestamp-b.timestamp).slice(-13);
 if(r.length!==13||Number(r.at(-1).timestamp)!==Math.floor((at-STEP)/STEP)*STEP||r.some((x,i)=>!finite(Number(x[key]))||Number(x[key])<=0||Number(x.timestamp)%STEP!==0||x.symbol&&x.symbol!==symbol||i&&x.timestamp-r[i-1].timestamp!==STEP))return null;
 if(key==='longShortRatio'&&r.some(x=>!(Number(x.longAccount)>0)||!(Number(x.shortAccount)>0)||Math.abs(Number(x.longAccount)+Number(x.shortAccount)-1)>.002||Math.abs(x.longAccount/x.shortAccount/x.longShortRatio-1)>.01))return null;
 return {at:Number(r.at(-1).timestamp),level:Number(r.at(-1)[key]),change1h:pct(Number(r.at(-1)[key]),Number(r[0][key]))};
}
// Synchronous cache-only snapshot: never fetch, await, or delay an order for this annotation.
export function readSweepMomentumSnapshot({event:e,coinRows=[],coinReadAt=null,raw=null,ratio=null,btcRows=[],now=Date.now()}={}){
 const cacheFresh=raw?.symbol===e.symbol&&finite(raw.savedAt)&&raw.savedAt<=now&&now-raw.savedAt<=120000;
 const socket=coinReadAt===now?upperMomentumBars(coinRows,e.at):null;
 const bars=socket??(cacheFresh?upperMomentumBars(raw.price,e.at):null),last=bars?.at(-1),mean=bars?bars.slice(0,-1).reduce((s,r)=>s+r.quote,0)/20:0;
 const oi=cacheFresh?series(raw.oi,e.at,'sumOpenInterest',e.symbol):null;
 const ratioFresh=ratio?.symbol===e.symbol&&ratio.source==='BINANCE_TOP_TRADER_ACCOUNT_RATIO'&&ratio.period==='5m'&&finite(ratio.fetchedAt)&&ratio.fetchedAt<=now&&now-ratio.fetchedAt<=60000;
 const rr=ratioFresh?series(ratio.rows,e.at,'longShortRatio',e.symbol):null,btc=upperMomentumBars(btcRows,e.at,13);
 const features={return15m:bars?pct(last.close,bars.at(-4).close):null,return1h:bars?pct(last.close,bars.at(-13).close):null,
  volumeRatio:mean>0?last.quote/mean:null,closePositionPct:last&&last.high>last.low?(last.close-last.low)/(last.high-last.low)*100:null,
  ratioLevel:rr?.level??null,ratioChange1h:rr?.change1h??null,oiChange1h:oi?.change1h??null,btcReturn15m:btc?pct(btc.at(-1).close,btc.at(-4).close):null,btcReturn1h:btc?pct(btc.at(-1).close,btc[0].close):null};
 return {eventId:e.id,symbol:e.symbol,asOf:e.at,evaluatedAt:now,features,observeOnly:true,affectsOrders:false,
  missing:[...(!bars?['COIN_21_CLOSED_5M_MISSING_OR_STALE']:[]),...(bars&&mean<=0?['VOLUME_BASE_ZERO']:[]),...(last&&last.high===last.low?['CANDLE_RANGE_ZERO']:[])],
  contextMissing:[...(!rr?['TOP_ACCOUNT_RATIO_UNAVAILABLE']:[]),...(!oi?['OI_UNAVAILABLE']:[]),...(!btc?['BTC_UNAVAILABLE']:[])],
  sources:{coinBars:bars?.length??0,coinClosedAt:last?.end??null,coinReadAt:now,coinSource:socket?'KLINE_CACHE':bars?'HEATMAP_RAW_CACHE':null,rawSavedAt:raw?.savedAt??null,
   ratioSource:'BINANCE_TOP_TRADER_ACCOUNT_RATIO',ratioAt:rr?.at??null,ratioFetchedAt:ratio?.fetchedAt??null,oiAt:oi?.at??null,ratioOiLagMs:STEP}};
}
export function evaluateUpperMomentum(input={}){
 const e=input.event;if(e?.kind!=='ALL_TRACKED_UPPER_SWEPT'||e.direction!=='UPPER')return null;
 const q=readSweepMomentumSnapshot(input);return {...q,version:UPPER_MOMENTUM_VERSION,state:upperMomentumState(q.features),checks:upperMomentumChecks(q.features)};
}
