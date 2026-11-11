import {heatmapConsensusZones} from './heatmapEntryScenarios.js';
import {createHash} from 'node:crypto';
export const RANGE_SWEEP_VERSION='RANGE_LIQUIDITY_SWEEP_OBSERVE_V1_20261029';
export const RANGE_SWEEP_DATA_VERSION='RANGE_SWEEP_FLOW_PREPARE_NO_MISSING_DATA_SPAM_V4_20261030';
export const RANGE_SWEEP_RULE=Object.freeze({baseBars:24,atrBars:14,maxWidthAtr:6,maxEfficiency:.30,maxNetAtr:1,ttlMs:900000,maxGapMs:10000,breakBufferAtr:.25,earlyVolumeX:2,reactionVolumeX:1.5,buyPct:55,sellBuyPct:45,maxChaseAtr:1});
const S=300000,M=60000,finite=Number.isFinite;
export function sweepBars(raw,step,now,count){
 const rs=(raw??[]).filter(r=>Array.isArray(r)||r.isClosed!==false).map(r=>Array.isArray(r)?{t:+r[0],end:+r[6],o:+r[1],h:+r[2],l:+r[3],c:+r[4],q:+r[7],buy:r[10]==null?null:+r[10]}:{t:+r.openTime,end:+r.closeTime,o:+r.open,h:+r.high,l:+r.low,c:+r.close,q:+r.quoteVolume,buy:r.takerBuyQuoteVolume==null?null:+r.takerBuyQuoteVolume}).filter(r=>r.end<now).sort((a,b)=>a.t-b.t).slice(-count);
 if(rs.length!==count||rs.some((b,i)=>![b.t,b.end,b.o,b.h,b.l,b.c,b.q].every(finite)||b.t%step!==0||b.end!==b.t+step-1||Math.min(b.o,b.h,b.l,b.c)<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||b.q<0||i&&b.t!==rs[i-1].t+step))return null;
 return rs;
}
export function armRangeSweep(bundle,point,now,raw=null,diagnostic=null){
 const fail=reason=>{if(diagnostic)diagnostic.reason=reason;return null;};
 const a=bundle?.models?.find(m=>m.model===1&&m.status==='OK')?.data,b=bundle?.models?.find(m=>m.model===3&&m.status==='OK')?.data;
 if(!a||!b||a.source!=='BINANCE_LOCAL'||b.source!=='BINANCE_LOCAL'||a.symbol!==b.symbol||!/^[\p{L}\p{N}]{1,32}USDT$/u.test(a.symbol)||a.range!=='24h'||b.range!=='24h'||a.step!==S||b.step!==S||a.end!==b.end)return fail('MODELS_MISSING_OR_MISMATCH');
 if(!point||!finite(point.price)||point.price<=0||!finite(point.at)||point.at>now+1000||now-point.at>10000)return fail('MARK_STALE_OR_MISSING');
 // The shared market bundle deliberately contains only its final close.
 // Read 25 closed OHLCV bars from the same cached raw window, never fetch here.
 let candles=a.candles?.slice(-25),baseSource='FULL_BUNDLE';
 if(candles?.length!==25){
  if(!raw||raw.symbol!==a.symbol||raw.end!==a.end||raw.step!==S||!finite(raw.savedAt)||raw.savedAt>now||raw.savedAt<raw.end||now-raw.savedAt>S+120000)return fail('RAW_BASE_MISSING_STALE_OR_MISMATCH');
  const rows=sweepBars(raw.price,S,now,25);if(!rows)return fail('RAW_BASE_INVALID_OR_GAP');
  candles=rows.map(r=>({time:r.t,open:r.o,high:r.h,low:r.l,close:r.c}));baseSource='SHARED_RAW_PRICE';
 }
 if(b.candles?.at(-1)?.time!==candles.at(-1).time||a.candles?.at(-1)?.time!==candles.at(-1).time||a.candles?.at(-1)?.close!==candles.at(-1).close||b.candles?.at(-1)?.close!==candles.at(-1).close)return fail('BASE_MODEL_TIME_MISMATCH');
 if(candles.some((c,i)=>![c.time,c.open,c.high,c.low,c.close].every(finite)||c.time%S!==0||Math.min(c.open,c.high,c.low,c.close)<=0||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||i&&c.time-candles[i-1].time!==S))return fail('BASE_INVALID_OR_GAP');
 const asOf=candles.at(-1).time+S-1;if(a.end!==asOf+1||asOf>=now||now-asOf>S+120000)return fail('BASE_UNCLOSED_OR_STALE');
 const base=candles.slice(1),tr=base.map((c,i)=>Math.max(c.high-c.low,Math.abs(c.high-candles[i].close),Math.abs(c.low-candles[i].close))),atr=tr.slice(-14).reduce((s,x)=>s+x,0)/14;
 const low=Math.min(...base.map(c=>c.low)),high=Math.max(...base.map(c=>c.high)),travel=base.slice(1).reduce((s,c,i)=>s+Math.abs(c.close-base[i].close),0),net=Math.abs(base.at(-1).close-base[0].close),efficiency=travel>0?net/travel:0;
 if(diagnostic)diagnostic.metrics={baseSource,baseBars:candles.length,widthAtr:(high-low)/atr,efficiency,netAtr:net/atr};
 if(!(atr>0))return fail('ATR_ZERO');
 if(high-low>6*atr)return fail('BASE_TOO_WIDE');
 if(efficiency>.30)return fail('BASE_TREND_EFFICIENT');
 if(net>atr)return fail('BASE_NET_MOVE_TOO_LARGE');
 if(point.price<low||point.price>high)return fail('MARK_ALREADY_OUTSIDE_BASE');
 if([a,b].some(m=>m.profiles?.slice(-3).length!==3||m.profiles.slice(-3).some(p=>!p.mark||!p.oiFresh)))return fail('PROFILES_MARK_OI_MISSING');
 const zones=heatmapConsensusZones(a,b,asOf,S,point.price);if(zones.status!=='OK')return fail('ZONES_'+zones.status);
 const upper=zones.zones.filter(z=>z.low>high&&z.low/point.price-1<=.05).sort((x,y)=>x.low-y.low)[0],lower=zones.zones.filter(z=>z.high<low&&1-z.high/point.price<=.05).sort((x,y)=>y.high-x.high)[0];if(!upper&&!lower)return fail('NO_ZONE_OUTSIDE_BASE_WITHIN_5PCT');
 const id='range-sweep:'+a.symbol+':'+createHash('sha256').update(JSON.stringify([asOf,low,high,upper,lower])).digest('hex').slice(0,20);
 if(diagnostic)diagnostic.reason='ARMED';
 return {version:RANGE_SWEEP_VERSION,dataVersion:RANGE_SWEEP_DATA_VERSION,baseSource,id,symbol:a.symbol,armedAt:now,asOf,expiresAt:now+900000,low,high,atr,efficiency,widthAtr:(high-low)/atr,upper:upper??null,lower:lower??null,base:structuredClone(base),referencePrice:point.price,lastTickAt:point.at,lastPrice:point.price,observeOnly:true,affectsOrders:false};
}
export function inspectRangeSweepFlow(raw,now){
 const closed=(raw??[]).filter(r=>(Array.isArray(r)||r.isClosed!==false)&&Number(Array.isArray(r)?r[6]:r.closeTime)<now);
 const common={bars:closed.length,lastClosedAt:closed.length?Number(Array.isArray(closed.at(-1))?closed.at(-1)[6]:closed.at(-1).closeTime):null};
 const missing=reason=>({...common,status:'UNAVAILABLE',reason,flow:null});
 if(closed.length<21)return missing('FEWER_THAN_21_CLOSED_1M');
 const rows=sweepBars(raw,M,now,21);if(!rows)return missing('CLOSED_1M_GAP_OR_INVALID');
 if(now-rows.at(-1).end>75000)return missing('CLOSED_1M_STALE');
 const last=rows.at(-1),mean=rows.slice(0,-1).reduce((s,b)=>s+b.q,0)/20;
 if(!finite(last.buy)||last.buy<0||last.buy>last.q*1.000001)return missing('TAKER_BUY_MISSING_OR_INVALID');
 if(!(last.q>0))return missing('LAST_MINUTE_ZERO_VOLUME');
 if(!(mean>0))return missing('BASELINE_ZERO_VOLUME');
 return {...common,status:'READY',reason:'READY',flow:{...last,volumeX:last.q/mean,buyPct:last.buy/last.q*100}};
}
export function rangeSweepFlow(raw,now){return inspectRangeSweepFlow(raw,now).flow;}
export function advanceRangeSweep(c,point,raw,now){
 if(c.done||!finite(now)||!finite(point.at)||now>=c.expiresAt||point.at>now+1000||now-point.at>10000||point.at<=c.lastTickAt||!finite(point.price)||point.price<=0)return [];
 if(point.at-c.lastTickAt>10000){c.done=true;c.invalidReason='MARK_GAP';return [];}
 c.lastTickAt=point.at;c.lastPrice=point.price;const flowRead=inspectRangeSweepFlow(raw,now),f=flowRead.flow,events=[];
 const emit=(kind,side,reason)=>{const key=kind+':'+side;if(c.emitted?.includes(key))return;c.emitted??=[];c.emitted.push(key);
  const {flow:_flow,...flowDiagnostic}=flowRead;
  events.push({version:RANGE_SWEEP_VERSION,dataVersion:RANGE_SWEEP_DATA_VERSION,id:c.id+':'+key,cohortId:c.id,symbol:c.symbol,at:point.at,observedAt:now,expiresAt:c.expiresAt,kind,side,direction:c.direction??null,reason,price:point.price,zone:c.target??null,base:{source:c.baseSource,candles:structuredClone(c.base),asOf:c.asOf,armedAt:c.armedAt,low:c.low,high:c.high,atr:c.atr,efficiency:c.efficiency,widthAtr:c.widthAtr},flow:f?structuredClone(f):null,flowDiagnostic,touchedAt:c.touchedAt??null,observeOnly:true,affectsOrders:false});};
 if(!c.direction){
  if(c.upper&&point.price>=c.high+.25*c.atr){c.direction='UPPER';c.target=structuredClone(c.upper);}
  else if(c.lower&&point.price<=c.low-.25*c.atr){c.direction='LOWER';c.target=structuredClone(c.lower);}
  else return [];
  c.breakAt=point.at;emit('BREAKOUT','UNKNOWN','Giá bắt đầu phá nền; chờ nến1m đóng và dòng mua/bán.');
 }
 const up=c.direction==='UPPER',z=c.target;
 if(!c.touchedAt&&(up?point.price>=z.low:point.price<=z.high)){c.touchedAt=point.at;emit('ZONE_TOUCH','UNKNOWN','Đã chạm cụm ước lượng có trước nhịp giá; chưa đủ kết luận đảo chiều.');}
 if(!f)return events;
 if(!c.touchedAt&&f.end>=c.breakAt&&f.c>=c.low&&f.c<=c.high){emit('BASE_REENTRY','UNKNOWN','Nến1m đóng trở lại nền sau phá biên; hủy hướng theo dõi của nhịp này.');c.done=true;return events;}
 if(!c.touchedAt){
  const agrees=up?f.c>c.high&&f.c>f.o&&f.buyPct>=55&&point.price>c.high: f.c<c.low&&f.c<f.o&&f.buyPct<=45&&point.price<c.low;
  const move=up?point.price-c.high:c.low-point.price,remaining=up?z.low-point.price:point.price-z.high;
  if(f.end>=c.breakAt&&agrees&&f.volumeX>=2&&move<=c.atr&&remaining>=.25*c.atr)emit('DIRECTION_CONFIRMED',up?'LONG':'SHORT','Nến1m đóng phá nền, volume≥2× và taker cùng hướng; còn khoảng cách đến cụm.');
 }else if(f.end>=c.touchedAt){
  const reject=up?f.c<z.low&&f.c<f.o&&f.buyPct<=45&&point.price<z.low&&z.low-point.price<=c.atr:f.c>z.high&&f.c>f.o&&f.buyPct>=55&&point.price>z.high&&point.price-z.high<=c.atr;
  const continues=up?f.c>z.high&&f.c>f.o&&f.buyPct>=55&&point.price>z.high&&point.price-z.high<=c.atr:f.c<z.low&&f.c<f.o&&f.buyPct<=45&&point.price<z.low&&z.low-point.price<=c.atr;
  if(reject&&f.volumeX>=1.5){emit('REJECTION',up?'SHORT':'LONG','Sau chạm cụm: nến1m đóng từ chối vùng, volume≥1,5× và taker xác nhận ngược nhịp quét.');c.done=true;}
  else if(continues&&f.volumeX>=2){emit('CONTINUATION',up?'LONG':'SHORT','Sau chạm cụm: nến1m đóng vượt vùng, volume≥2× và taker tiếp diễn cùng hướng.');c.done=true;}
 }
 return events;
}
