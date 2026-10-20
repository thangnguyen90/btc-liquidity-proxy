export const HEATMAP_LAB_VERSION='BINANCE_LOCAL_HEATMAP_LAB_V3_SCENARIOS_20261018';
export const HEATMAP_RANGES=Object.freeze(['12h','24h','3d','7d','30d']);
export const MAX_HEATMAP_CELLS=1000000;
const number=x=>x==null||x===''||!Number.isFinite(Number(x))?NaN:Number(x);
export function heatmapQuery({symbol='ZEREBROUSDT',range='24h',model=1}={}){
 symbol=String(symbol).trim().toUpperCase();model=Number(model);
 if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol)||![1,3].includes(model)||!HEATMAP_RANGES.includes(range))throw Error('INVALID_QUERY');
 return {symbol,range,model};
}
export function normalizeHeatmap(payload,{symbol,range,model,source='IMPORT',now=Date.now()}={}){
 const query=heatmapQuery({symbol,range,model});
 if(payload?.code!=null&&String(payload.code)!=='0')throw Error('PROVIDER_RESPONSE_ERROR');
 if(payload?.model!=null&&Number(payload.model)!==query.model)throw Error('MODEL_MISMATCH');
 if(payload?.symbol&&String(payload.symbol).toUpperCase()!==query.symbol)throw Error('SYMBOL_MISMATCH');
 if(payload?.range&&payload.range!==query.range)throw Error('RANGE_MISMATCH');
 const data=payload?.data??payload;
 if(data?.instrument?.instrumentId&&String(data.instrument.instrumentId).toUpperCase()!==query.symbol)throw Error('SYMBOL_MISMATCH');
 const rawY=data?.y_axis??data?.y,rawC=data?.price_candlesticks??data?.prices,rawL=data?.liquidation_leverage_data??data?.liq;
 if(!Array.isArray(rawY)||!Array.isArray(rawC)||!Array.isArray(rawL))throw Error('FULL_MATRIX_REQUIRED');
 if(rawY.length<2||rawY.length>10000||rawC.length<2||rawC.length>20000||rawL.length>MAX_HEATMAP_CELLS)throw Error('DATA_SIZE_LIMIT');
 const levels=rawY.map(number);if(levels.some(x=>!(x>0))||new Set(levels).size!==levels.length)throw Error('INVALID_PRICE_AXIS');
 const sorted=levels.map((price,index)=>({price,index})).sort((a,b)=>a.price-b.price),remap=new Map(sorted.map((x,i)=>[x.index,i]));
 const candles=rawC.map((r,i)=>{
  if(!Array.isArray(r)||r.length<5)throw Error('INVALID_CANDLES');
  const timestamp=number(r[0]),time=timestamp<1e12?timestamp*1000:timestamp,[open,high,low,close]=r.slice(1,5).map(number);
  if(!(time>0)||time>now+300000||![open,high,low,close].every(x=>x>0)||high<Math.max(open,close,low)||low>Math.min(open,close))throw Error('INVALID_CANDLES');
  return {time,open,high,low,close};
 });
 if(candles.some((r,i)=>i&&r.time<=candles[i-1].time))throw Error('UNORDERED_CANDLES');
 const seen=new Set(),cells=rawL.map(r=>{
  if(!Array.isArray(r)||r.length<3)throw Error('INVALID_CELLS');
  const x=number(r[0]),y=number(r[1]),value=number(r[2]);
  if(!Number.isInteger(x)||x<0||x>=candles.length||!Number.isInteger(y)||y<0||y>=levels.length||!Number.isFinite(value)||value<0)throw Error('INVALID_CELLS');
  const key=x+':'+y;if(seen.has(key))throw Error('DUPLICATE_CELL');seen.add(key);
  return [x,remap.get(y),value];
 });
 const diffs=candles.slice(1).map((r,i)=>r.time-candles[i].time).sort((a,b)=>a-b),step=diffs[Math.floor(diffs.length/2)];
 return {version:HEATMAP_LAB_VERSION,...query,source,loadedAt:now,y:sorted.map(x=>x.price),candles,cells,
  start: candles[0].time,end:candles.at(-1).time+step,step,maxIntensity:cells.reduce((m,r)=>Math.max(m,r[2]),0),
  minPrice:Math.min(sorted[0].price,...candles.map(c=>c.low)),maxPrice:Math.max(sorted.at(-1).price,...candles.map(c=>c.high))};
}
export function demoHeatmap(query={},now=Date.now()){
 const q=heatmapQuery(query),n=288,span={'12h':12,'24h':24,'3d':72,'7d':168,'30d':720}[q.range]*3600000,step=span/n,end=Math.floor(now/step)*step;
 const levels=Array.from({length:128},(_,i)=>.024+i*.00031),candles=[];
 let previous=.027;
 for(let i=0;i<n;i++){
  const close=(i<140?.027+i*.000065:i<224?.0361+(i-140)*.00019:i<242?.05206-(i-224)*.00066:.04018+(i-242)*.000027)+Math.sin(i*.81)*.00028;
  candles.push([(end-span+i*step)/1000,previous,Math.max(previous,close)+.00016,Math.min(previous,close)-.00016,close]);previous=close;
 }
 const cells=[];
 for(let x=0;x<n;x++)for(let y=0;y<levels.length;y++){
  const price=levels[y],bands=[{p:.0301,start:0,v:1.8},{p:.0338,start:48,v:2.6},{p:.0373,start:125,v:6.5},{p:.0478,start:218,v:4},{p:.0504,start:200,v:9},{p:.052,start:220,v:7}];
  let value=0;for(const b of bands)if(x>=b.start){const d=Math.abs(price-b.p);if(d<.0011)value+=b.v*Math.exp(-d/.00025)*(1+.12*Math.sin(x*.13+y));}
  if(price<candles[x][4]&&price>candles[x][4]-.009)value+=.08*(1+Math.sin(x*.2+y*.7));
  if(value>.035)cells.push([x,y,Math.round(value*100000)]);
 }
 return normalizeHeatmap({model:q.model,symbol:q.symbol,range:q.range,data:{y_axis:levels,price_candlesticks:candles,liquidation_leverage_data:cells}},{...q,source:'DEMO',now});
}
export function heatmapColor(value,max,log=true){
 const t=Math.max(0,Math.min(1,max>0?(log?Math.log1p(99*value/max)/Math.log(100):value/max):0));
 const stops=[[48,0,61],[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]],p=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(p)),f=p-i;
 return `rgb(${stops[i].map((x,k)=>Math.round(x+(stops[i+1][k]-x)*f)).join(',')})`;
}
