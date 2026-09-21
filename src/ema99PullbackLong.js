import {buildEma99Context,ema99ContextEmbed} from './ema99Context.js';
export const EMA99_PULLBACK_LONG_VERSION='EMA99_PULLBACK_LONG_OBSERVE_V1_20260907';
export const EMA99_LONG_DISCORD_STYLE_VERSION='EMA99_LONG_DISCORD_BLUE_GREEN_V1_20260907';
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
const pct=(a,b)=>(a/b-1)*100;
const n=v=>Number.isFinite(v)?Number(v.toFixed(8)).toString():'—';
const time=v=>new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});

// Independent detector; reclaim and confirmed-bounce stages have separately gated Binance runners.
export function detectEma99PullbackLong(rows,{symbol,interval,now=Date.now()}={}) {
  const duration=interval==='5m'?300000:interval==='15m'?900000:0;
  if(!duration||!Number.isFinite(now))return [];
  const bars=(rows??[]).map(k=>({openTime:Number(k.openTime??k[0]),open:Number(k.open??k[1]),high:Number(k.high??k[2]),
    low:Number(k.low??k[3]),close:Number(k.close??k[4]),volume:Number(k.volume??k[5]),closeTime:Number(k.closeTime??k[6])})).filter(b=>b.openTime<=now);
  if(bars.length<165||bars.some((b,i)=>!Object.values(b).every(Number.isFinite)||b.low<=0||b.volume<0
    ||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.closeTime-b.openTime!==duration-1
    ||(i&&b.openTime-bars[i-1].openTime!==duration)))return [];
  const ema=[];let value=avg(bars.slice(0,99).map(b=>b.close));
  for(let i=98;i<bars.length;i++){if(i>98)value+=.02*(bars[i].close-value);ema[i]=value;}
  const events=[];
  // Last two candles for watches; up to three later closed candles for confirmation.
  for(let index=Math.max(160,bars.length-5);index<bars.length;index++) {
    const candle=bars[index],pre=bars.slice(0,index),last=pre.at(-1),e=ema[index];
    if(last.closeTime>=now)continue;
    const slopes=ema.slice(index-13,index),slopePct=pct(slopes.at(-1),slopes[0]);
    const risingShare=slopes.slice(1).filter((v,i)=>v>slopes[i]).length/12;
    if(slopePct<.3||risingShare<.8)continue;
    let baseIndex=Math.max(0,index-96);
    for(let j=baseIndex+1;j<=index-12;j++)if(bars[j].low<bars[baseIndex].low)baseIndex=j;
    let crestIndex=index-1;
    for(let j=index-2;j>=Math.max(baseIndex+12,index-13);j--)if(bars[j].close>bars[crestIndex].close)crestIndex=j;
    if(crestIndex-11<=baseIndex||bars[crestIndex-1].close>bars[crestIndex].close)continue;
    const riseBars=bars.slice(baseIndex+1,crestIndex+1);
    const risePct=pct(bars[crestIndex].close,bars[baseIndex].low);
    const riseLegPct=pct(avg(riseBars.slice(-6).map(b=>b.close)),avg(riseBars.slice(0,6).map(b=>b.close)));
    const aboveCount=pre.slice(-8).filter((b,i)=>b.close>ema[index-8+i]).length;
    if(risePct<8||riseLegPct<.5||pct(last.close,bars[baseIndex].low)<5||aboveCount<6||candle.open<=ema[index-1])continue;
    const atr=avg(pre.slice(-14).map((b,i)=>{const p=pre[index-15+i];return Math.max(b.high-b.low,Math.abs(b.high-p.close),Math.abs(b.low-p.close));}));
    const volumeBase=avg(pre.slice(-20).map(b=>b.volume)),volumeRatio=volumeBase>0?candle.volume/volumeBase:0;
    const dip=candle.open-candle.low,lowVsEmaPct=pct(candle.low,e);
    const nearLimitPct=Math.max(.3,Math.min(1.5,.75*atr/e*100));
    if(!(atr>0)||volumeRatio<1.5||dip<Math.max(candle.open*.01,.8*atr)
      ||lowVsEmaPct>nearLimitPct||lowVsEmaPct< -Math.max(3,1.5*atr/e*100))continue;
    const nearMiss=lowVsEmaPct>.15,range=candle.high-candle.low;
    const lowerWickPct=range>0?(Math.min(candle.open,candle.close)-candle.low)/range*100:0;
    const closed=candle.closeTime<now,reclaimed=closed&&candle.close>e&&lowerWickPct>=25;
    const stage=nearMiss?(reclaimed?'NEAR_RECLAIM_LONG_WATCH':'NEAR_EMA_LONG_WATCH')
      :reclaimed?'RECLAIM_LONG_WATCH':closed&&candle.close<=e?'CLOSED_BELOW_EMA_LONG_WAIT':'TOUCH_EMA_LONG_WATCH';
    const invalidation=candle.low-.25*atr,target=Math.max(...pre.slice(-12).map(b=>b.high));
    const baseEvent={version:EMA99_PULLBACK_LONG_VERSION,symbol,interval,side:'LONG',observeOnly:true,
      generatedAt:new Date(now).toISOString(),candleAt:candle.openTime,candleCloseAt:candle.closeTime,
      price:candle.close,ema99:e,risePct,riseLegPct,emaSlopePct:slopePct,risingShare,
      pullbackBars:index-1-crestIndex,pullbackPct:pct(last.close,bars[crestIndex].close),
      riseStartAt:riseBars[0].openTime,riseEndAt:bars[crestIndex].closeTime,
      volumeRatio,dipAtr:dip/atr,lowerWickPct,nearMiss,nearLimitPct,gapToEmaPct:Math.max(0,lowVsEmaPct),
      invalidation:invalidation>0?invalidation:null,takeProfit:target>candle.close?target:null,referenceEntry:null,closed};
    const emit=(stage,extra={})=>events.push({...baseEvent,stage,...extra,dedupeKey:`EMA99_LONG|${symbol}|${interval}|${candle.openTime}|${stage}`});
    if(index>=bars.length-2&&now-candle.closeTime<=duration+90_000)emit(stage);
    if(!reclaimed||!(invalidation>0))continue;
    for(let j=index+1;j<=Math.min(index+3,bars.length-1);j++) {
      const follow=bars[j];if(follow.closeTime>=now)break;
      if(follow.low<invalidation||follow.close<=ema[j])break;
      const breakHigh=follow.close>follow.open&&follow.close>candle.high;
      const retest=follow.low<=ema[j]+.25*atr&&follow.low>=ema[j]-.25*atr
        &&follow.close>follow.open&&follow.close>candle.close;
      if(!breakHigh&&!retest)continue;
      if(j>=bars.length-2&&now-follow.closeTime<=duration+90_000)emit('BOUNCE_CONFIRMED_LONG_WATCH',{
        price:follow.close,ema99:ema[j],referenceEntry:follow.close,closed:true,
        confirmedAt:follow.closeTime,confirmation:breakHigh?'CLOSE_ABOVE_RECLAIM_HIGH':'EMA_RETEST_HELD',
        takeProfit:target>follow.close?target:null});
      break; // Never renew an old confirmation with a later candle.
    }
  }
  return events;
}

export function ema99PullbackLongEvent(event,now=Date.now()) {
  const at=Date.parse(event?.generatedAt);
  return event?.version===EMA99_PULLBACK_LONG_VERSION&&event.side==='LONG'&&event.observeOnly===true
    &&Number.isFinite(at)&&now>=at&&now-at<=90_000?event:null;
}
export function ema99PullbackLongPayload(e) {
  const confirmed=e.stage==='BOUNCE_CONFIRMED_LONG_WATCH';
  const execution=e.binanceExecution;
  const contextEmbed=ema99ContextEmbed(e.emaContext,{includeHigherTimeframes:e.interval==='5m'});
  const labels={NEAR_EMA_LONG_WATCH:'GẦN CHẠM EMA99 · LONG WATCH',NEAR_RECLAIM_LONG_WATCH:'BẬT TRƯỚC EMA99 · LONG WATCH',
    RECLAIM_LONG_WATCH:'RÚT RÂU / LẤY LẠI EMA99 · LONG WATCH',CLOSED_BELOW_EMA_LONG_WAIT:'ĐÓNG DƯỚI EMA99 · CHƯA LONG',
    TOUCH_EMA_LONG_WATCH:'CHẠM EMA99 · LONG WATCH',BOUNCE_CONFIRMED_LONG_WATCH:'XÁC NHẬN BẬT · LONG WATCH'};
  return {username:'EMA99 Pullback LONG',allowed_mentions:{parse:[]},embeds:[{
    title:`${confirmed?'🟢':'🔵'} LONG · ${e.symbol} · ${e.interval} · ${labels[e.stage]??e.stage}`,color:confirmed?0x10b981:0x3b82f6,
    description:`${execution?`**BINANCE RIÊNG · LONG MARKET · MARGIN ${execution.marginUsdt??5} USDT × 5x**\nXử lý: ${execution.status}${execution.orderId?` · orderId ${execution.orderId}`:''}. Lệnh mới: TP +15% ROE, SL −20% ROE từ giá khớp thực tế (5x: TP +3% giá, SL −4% giá). Trạng thái xử lý không mặc định là đã khớp.`:'**OBSERVE ONLY — KHÔNG TỰ ĐẶT LỆNH BINANCE**'}\nGiá tăng từ đáy, EMA99 dốc lên; điều chỉnh về EMA99.\n${e.closed?'Nến đã đóng.':'Nến đang chạy, chưa xác nhận bật.'}`,
    fields:[{name:'GIÁ / EMA99',value:`Giá ${n(e.price)} · EMA99 ${n(e.ema99)}\n${e.nearMiss?`Đáy còn trên EMA ${n(e.gapToEmaPct)}% · ngưỡng gần ${n(e.nearLimitPct)}%. Chưa chạm, không coi là reclaim trực tiếp EMA99.`:'Nến kiểm tra đã chạm/xuyên nhẹ vùng EMA99 (tolerance 0.15%).'}`},
      {name:'BỐI CẢNH TRƯỚC NHỊP GIẢM',value:`Tăng từ đáy ${n(e.risePct)}% · hai nhóm 6 nến đầu/cuối ${n(e.riseLegPct)}%\nEMA99 +${n(e.emaSlopePct)}% / 12 bước · ${Math.round(e.risingShare*100)}% bước tăng\nĐiều chỉnh ${n(e.pullbackPct)}% / ${e.pullbackBars} nến`},
      {name:'NẾN KIỂM TRA',value:`Volume ${n(e.volumeRatio)}× MA20 · giảm ${n(e.dipAtr)} ATR · râu dưới ${n(e.lowerWickPct)}%`},
      {name:'KỊCH BẢN LONG THAM KHẢO',value:`${confirmed?`${e.confirmation==='CLOSE_ABOVE_RECLAIM_HIGH'?'Nến sau đóng vượt đỉnh nến rút râu':'Nến sau retest EMA99 giữ được'} lúc ${time(e.confirmedAt)} (VN). Giá xác nhận ${n(e.referenceEntry)}.${execution?' Route MARKET riêng tính tuổi 90s từ nến xác nhận; vẫn kiểm tra giá/TP/SL/vị thế.':''}`:execution?'Route opt-in cho phép LONG MARKET theo nhóm sau nến đã đóng; WATCH không mặc định đã reclaim. Vẫn qua gate giá/tuổi/TP/SL/vị thế.':'Chờ rút râu, đóng trên EMA99 rồi nến sau phá đỉnh hoặc retest giữ được.'}\nKháng cự cấu trúc ${n(e.takeProfit)} · vô hiệu cấu trúc ${n(e.invalidation)}. Khi vào Binance, TP/SL cuối tính theo ROE từ giá full-fill, không dùng hai mốc cấu trúc làm giá bảo vệ cuối. ${execution?'Không phải xác suất thắng.':'Không mua chỉ vì gần EMA; đóng mất EMA hoặc thủng mốc vô hiệu thì bỏ kịch bản. Đây không phải xác suất thắng hay tín hiệu MARKET.'}`},
      {name:'THỜI ĐIỂM',value:`Nến kiểm tra mở ${time(e.candleAt)} (VN) · ${e.stage}`},
      {name:'MỞ NHANH',value:`[Binance](https://www.binance.com/en/futures/${encodeURIComponent(e.symbol)}) · [CoinGlass](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${encodeURIComponent(e.symbol.replace(/USDT$/,''))})`}],
    timestamp:e.generatedAt,footer:{text:`${EMA99_PULLBACK_LONG_VERSION} · ${EMA99_LONG_DISCORD_STYLE_VERSION}`}},...(contextEmbed?[contextEmbed]:[])]};
}
export async function scanEma99PullbackLong(symbols,cache,notify,now=Date.now()) {
  let processed=0,detected=0,sent=0;
  for(const symbol of symbols)for(const interval of ['5m','15m']) {
    const rows=cache.getIfCached(symbol,interval,240);if(!rows||rows.length<165)continue;
    processed++;
    for(const event of detectEma99PullbackLong(rows,{symbol,interval,now})) {
      const rowsByInterval=Object.fromEntries(['5m','15m'].map(i=>[i,i===interval?rows:cache.getIfCached(symbol,i,240)]));
      const emaContext=buildEma99Context(event,rowsByInterval,now);
      detected++;sent+=(await notify({...event,emaContext}))?.sent??0;
    }
  }
  return {processed,detected,sent};
}
