import {normalizeHeatmap,HEATMAP_LAB_VERSION} from '../public/coinglass-heatmap-model.js';
import {heatmapPoolProfile} from './heatmapEntryScenarios.js';
export const BINANCE_HEATMAP_MODEL_VERSION='BINANCE_LOCAL_HEATMAP_V2_WITH_PROFILES_20261018';
export const LEVERAGE_ASSUMPTIONS=Object.freeze([{leverage:5,weight:.05},{leverage:10,weight:.15},{leverage:20,weight:.25},{leverage:25,weight:.25},{leverage:50,weight:.20},{leverage:100,weight:.10}]);
const MAINTENANCE=.005;
export function heatmapRangePlan(range,now=Date.now()){
  const config={'12h':[12,5],'24h':[24,5],'3d':[72,15],'7d':[168,30],'30d':[720,120]}[range];
  if(!config)throw Error('INVALID_QUERY');const [hours,minutes]=config,step=minutes*60000,end=Math.floor(now/step)*step;
  const warmupHours=minutes===5?12:24;
  return {interval:minutes===120?'2h':minutes+'m',period:minutes===120?'2h':minutes+'m',step,start:end-hours*3600000,end,from:end-(hours+warmupHours)*3600000};
}
export function normalizeBinanceHeatmapCandles(raw,{from,end,step}){
  if(!Array.isArray(raw))throw Error('INVALID_BINANCE_CANDLES');
  const rows=raw.map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),end:Number(r[6]),volume:Number(r[5]),quoteVolume:Number(r[7]),
    takerBuyQuoteVolume:r[10]!=null&&Number.isFinite(Number(r[10]))&&Number(r[10])>=0&&Number(r[10])<=Number(r[7])?Number(r[10]):null}))
    .filter(r=>r.time>=from&&r.end<end);
  if(rows.length<3)throw Error('INSUFFICIENT_CANDLES');
  if(rows.some((r,i)=>![r.time,r.end,r.open,r.high,r.low,r.close,r.volume,r.quoteVolume].every(Number.isFinite)
    ||Math.min(r.open,r.high,r.low,r.close)<=0||r.high<Math.max(r.open,r.close)||r.low>Math.min(r.open,r.close)
    ||r.volume<0||r.quoteVolume<0||r.time%step!==0||r.end!==r.time+step-1||(i&&r.time-rows[i-1].time!==step)))throw Error('INVALID_OR_GAPPED_CANDLES');
  return rows;
}
// Approximate isolated liquidation levels only. Actual margin/entry/leverage distribution is unknown.
export function assumedLiquidationPrice(entry,leverage,side){return entry*(side==='LONG'?1-1/leverage+MAINTENANCE:1+1/leverage-MAINTENANCE);}
export function simulateHeatmapPools({candles,markRows=[],oiRows=[],model,step,onFrame=()=>{}}){
  const marks=new Map(markRows.map(r=>[r.time,r]));
  const oi=(Array.isArray(oiRows)?oiRows:[]).map(r=>({at:Number(r.timestamp),value:Number(r.sumOpenInterest)}))
    .filter(r=>Number.isFinite(r.at)&&r.at>0&&Number.isFinite(r.value)&&r.value>0).sort((a,b)=>a.at-b.at);
  let pools=[],cursor=-1,previousOi=null,lastOiAt=null,markUsed=0,oiPairs=0,oiFresh=0,seedCount=0;
  const halfLife=(model===1?12:24)*3600000;
  for(let i=0;i<candles.length;i++){
    const c=candles[i],mark=marks.get(c.time),sweep=mark??c;if(mark)markUsed++;
    const elapsed=i?c.time-candles[i-1].time:step,decay=Math.exp(-Math.log(2)*elapsed/halfLife);
    pools=pools.filter(p=>p.side==='LONG'?sweep.low>p.price:sweep.high<p.price);
    for(const p of pools)p.weight*=decay;
    let seed=model===1?c.quoteVolume:0;
    while(cursor+1<oi.length&&oi[cursor+1].at<=c.end)cursor++;
    const sample=oi[cursor];
    if(sample&&c.end-sample.at<=step){
      oiFresh++;
      if(sample.at!==lastOiAt){
        if(previousOi&&sample.at-previousOi.at<=2*step){
          oiPairs++;const delta=sample.value-previousOi.value;
          if(model===3){
            if(delta>0)seed=delta*c.close;
            else if(delta<0){const shrink=sample.value/previousOi.value;for(const p of pools)p.weight*=shrink;}
          }
        }
        previousOi=sample;lastOiAt=sample.at;
      }
    }
    // Seed at CLOSE, after sweep processing: cannot liquidate a new cohort earlier in its birth candle.
    if(seed>0)for(const {leverage,weight} of LEVERAGE_ASSUMPTIONS)for(const side of ['LONG','SHORT']){
      pools.push({price:assumedLiquidationPrice(c.close,leverage,side),weight:seed*.5*weight,side,bornAt:c.end,leverage});seedCount++;
    }
    pools=pools.filter(p=>p.weight>1e-8);
    onFrame({index:i,candle:c,pools,oiFresh:sample&&c.end-sample.at<=step,mark:!!mark});
  }
  return {markUsed,markBars:candles.length,oiFresh,oiPairs,seedCount,halfLifeHours:halfLife/3600000};
}
// Same pool simulation/profiles as the chart, without its large rendering matrix.
export function buildBinanceHeatmapProfiles({query,plan,candles,markRows=[],oiRows=[],model}){
  const visible=candles.filter(c=>c.time>=plan.start),profiles=[];
  if(visible.length<3||visible.at(-1).end!==plan.end-1)throw Error('INSUFFICIENT_OR_STALE_CANDLES');
  let oiVisible=0;
  const metrics=simulateHeatmapPools({candles,markRows,oiRows,model,step:plan.step,onFrame:frame=>{
    if(frame.candle.time<plan.start)return;if(frame.oiFresh)oiVisible++;
    if(frame.candle.time>=visible[Math.max(0,visible.length-4)].time)profiles.push(heatmapPoolProfile(frame));
  }});
  if(model===3&&(oiVisible<Math.ceil(visible.length*.5)||metrics.oiPairs<3))throw Error('INSUFFICIENT_OI');
  return {source:'BINANCE_LOCAL',symbol:query.symbol,range:query.range,step:plan.step,end:plan.end,profiles,
    candles:visible.slice(-1).map(c=>({time:c.time,close:c.close})),calculationVersion:BINANCE_HEATMAP_MODEL_VERSION};
}
export function buildBinanceLocalHeatmap({query,plan,candles,markRows=[],oiRows=[],model,now=Date.now()}){
  const visible=candles.filter(c=>c.time>=plan.start);
  if(visible.length<3||visible.at(-1).end!==plan.end-1)throw Error('INSUFFICIENT_OR_STALE_CANDLES');
  const lo=Math.min(...candles.map(c=>c.low))*.78,hi=Math.max(...candles.map(c=>c.high))*1.22,bins=192;
  const minLog=Math.log(lo),span=Math.log(hi)-minLog,levels=Array.from({length:bins},(_,i)=>Math.exp(minLog+span*i/(bins-1)));
  const index=new Map(visible.map((c,i)=>[c.time,i])),cells=[],profiles=[];
  let oiVisible=0,markVisible=0;
  const metrics=simulateHeatmapPools({candles,markRows,oiRows,model,step:plan.step,onFrame:frame=>{
    const x=index.get(frame.candle.time);if(x==null)return;
    if(x>=visible.length-4)profiles.push(heatmapPoolProfile(frame));
    if(frame.oiFresh)oiVisible++;if(frame.mark)markVisible++;
    const column=new Float64Array(bins);
    for(const p of frame.pools){const y=Math.round((Math.log(p.price)-minLog)/span*(bins-1));if(y<0||y>=bins)continue;
      for(const [offset,k] of [[-1,.2],[0,.6],[1,.2]])if(y+offset>=0&&y+offset<bins)column[y+offset]+=p.weight*k;
    }
    for(let y=0;y<bins;y++)if(column[y]>1e-8)cells.push([x,y,column[y]]);
  }});
  if(model===3&&(oiVisible<Math.ceil(visible.length*.5)||metrics.oiPairs<3))throw Error('INSUFFICIENT_OI');
  const maximum=cells.reduce((m,c)=>Math.max(m,c[2]),0);
  if(maximum>0)for(const c of cells)c[2]=Math.round(c[2]/maximum*1000000)/10000;
  const data=normalizeHeatmap({model,symbol:query.symbol,range:query.range,data:{y_axis:levels,price_candlesticks:visible.map(c=>[c.time,c.open,c.high,c.low,c.close]),liquidation_leverage_data:cells}},
    {...query,model,source:'BINANCE_LOCAL',now});
  return {...data,profiles,version:HEATMAP_LAB_VERSION,calculationVersion:BINANCE_HEATMAP_MODEL_VERSION,estimated:true,intensityUnit:'RELATIVE_INDEX_0_100',
    algorithm:model===1?'VOLUME_LEVERAGE_POOLS':'OI_CHANGE_LEVERAGE_POOLS',
    inputs:{exchange:'BINANCE_USDT_M',interval:plan.interval,closedOnly:true,warmupBars:candles.length-visible.length,oiCoveragePct:oiVisible/visible.length*100,markCoveragePct:markVisible/visible.length*100},
    assumptions:{leverages:LEVERAGE_ASSUMPTIONS,maintenanceMarginPct:.5,longShortSplitPct:50,halfLifeHours:metrics.halfLifeHours,clearing:'MARK_OHLC_WHEN_AVAILABLE_ELSE_TRADED_OHLC',seedAt:'CANDLE_CLOSE',noProprietaryCoinglassModel:true},
    notes:[model===1?'Trọng số từ volume giao dịch; không phải vị thế mở thực.':'Chỉ thêm trọng số khi lượng OI tăng; OI giảm làm co các cụm đang tồn tại. Không biết giá entry của OI có trước cửa sổ.',
      markVisible===visible.length?'Xóa cụm mô phỏng khi MARK chạm mức dự kiến.':'Thiếu một phần MARK, dùng râu giá giao dịch ở các nến đó.',
      'Cường độ 0–100 được chuẩn hóa riêng từng model, không so số tiền giữa hai chart.']};
}
