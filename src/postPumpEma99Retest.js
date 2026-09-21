import {ema99ContextEmbed} from './ema99Context.js';

export const POST_PUMP_EMA99_RETEST_VERSION='POST_PUMP_EMA99_RETEST_V4_FIRST_VS_REBOUND_20260910';
export const EMA99_FIRST_PUMP_NEAR_REJECT_STAGE='FIRST_PUMP_NEAR_REJECT_SHORT_WATCH';
export const EMA99_REBOUND_PUMP_NEAR_REJECT_STAGE='REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH';
const pct=(a,b)=>(a/b-1)*100;
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
const num=n=>Number.isFinite(n)?Number(n.toFixed(8)).toString():'—';
function normalize(k) {
  return {openTime:Number(k.openTime??k[0]),open:Number(k.open??k[1]),high:Number(k.high??k[2]),low:Number(k.low??k[3]),close:Number(k.close??k[4]),volume:Number(k.volume??k[5]),closeTime:Number(k.closeTime??k[6])};
}

export function detectPostPumpEma99Retest(rows,{symbol,interval,now=Date.now()}={}) {
  const duration=interval==='5m'?300000:interval==='15m'?900000:0;
  if (!duration) return [];
  const bars=(rows??[]).map(normalize).filter(k=>k.openTime<=now);
  if(bars.length<165||bars.some((b,i)=>![b.open,b.high,b.low,b.close,b.volume,b.openTime,b.closeTime].every(Number.isFinite)
    ||b.low<=0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.volume<0
    ||b.closeTime-b.openTime!==duration-1||(i&&b.openTime-bars[i-1].openTime!==duration))) return [];
  const ema=[];let value=avg(bars.slice(0,99).map(b=>b.close));
  for(let i=98;i<bars.length;i++){if(i>98)value+=0.02*(bars[i].close-value);ema[i]=value;}
  const events=[];
  for(const index of [bars.length-2,bars.length-1]) {
    const candle=bars[index],pre=bars.slice(0,index),last=pre.at(-1);
    const closed=candle.closeTime<now;
    if(now-candle.closeTime>duration+90_000||pre.length<160||last.closeTime>=now)continue;
    const e=ema[index],priorE=ema[index-1];
    const slopes=ema.slice(index-13,index);
    const decline=slopes.slice(1).filter((v,i)=>v<slopes[i]).length/12;
    const slopePct=pct(slopes.at(-1),slopes[0]);
    if(decline<0.8||slopePct> -0.3)continue;
    const end=index-8,start=Math.max(48,index-96);
    let peakIndex=start;
    for(let j=start+1;j<=end;j++)if(bars[j].high>bars[peakIndex].high)peakIndex=j;
    const peak=bars[peakIndex].high,base=Math.min(...bars.slice(peakIndex-48,peakIndex).map(b=>b.low));
    let pumpPct=pct(peak,base),dropPct=(1-last.close/peak)*100;
    const priorPumpDump=pumpPct>=8&&dropPct>=5;
    // Select the latest lowest close from closed history only, not a future pivot.
    // Keep the decline window before the rebound; allow at most 12 recovery bars.
    let troughIndex=index-1;
    for(let j=index-2;j>=Math.max(peakIndex+12,index-13);j--) {
      if(bars[j].close<bars[troughIndex].close)troughIndex=j;
    }
    const recent=pre.slice(-12);
    const recentFadePct=pct(avg(recent.slice(-6).map(b=>b.close)),avg(recent.slice(0,6).map(b=>b.close)));
    // Measure the post-peak leg, including any base, rather than only its last 12 bars.
    const fadeBars=bars.slice(peakIndex+1,troughIndex+1);
    const fadePct=pct(avg(fadeBars.slice(-6).map(b=>b.close)),avg(fadeBars.slice(0,6).map(b=>b.close)));
    const reboundBars=index-1-troughIndex,reboundPct=pct(last.close,bars[troughIndex].close);
    const atr=avg(pre.slice(-14).map((b,i)=>{const prev=pre[index-15+i];return Math.max(b.high-b.low,Math.abs(b.high-prev.close),Math.abs(b.low-prev.close));}));
    if(!(atr>0))continue;
    let pumpLegType='REBOUND_PUMP_AFTER_DUMP',baseRangePct=null,baseDriftPct=null,prePumpGapPct=null;
    if(priorPumpDump) {
      // If the search boundary is already rising, the actual trough is too old.
      if(troughIndex-11<=peakIndex||bars[troughIndex-1].close<bars[troughIndex].close||fadePct> -0.5)continue;
    } else {
      // First expansion out of a compact base: no completed >=8% pump then >=5%
      // dump in the causal 96-bar search window. The current candle is excluded.
      const baseBars=pre.slice(-24),baseHigh=Math.max(...baseBars.map(b=>b.high)),baseLow=Math.min(...baseBars.map(b=>b.low));
      baseRangePct=pct(baseHigh,baseLow);
      baseDriftPct=Math.abs(pct(avg(baseBars.slice(-6).map(b=>b.close)),avg(baseBars.slice(0,6).map(b=>b.close))));
      prePumpGapPct=Math.max(0,pct(e,Math.max(...pre.slice(-12).map(b=>b.high))));
      const firstPumpPct=pct(candle.high,baseLow);
      if(baseRangePct>6||baseDriftPct>2||prePumpGapPct<0.2||firstPumpPct<3||candle.close<=candle.open)continue;
      pumpLegType='FIRST_PUMP_FROM_BASE';pumpPct=firstPumpPct;dropPct=null;
    }
    const belowCount=pre.slice(-8).filter((b,i)=>b.close<ema[index-8+i]).length;
    if(belowCount<6||candle.open>=priorE)continue;
    const volumeBase=avg(pre.slice(-20).map(b=>b.volume)),volRatio=volumeBase>0?candle.volume/volumeBase:0;
    const spike=candle.high-candle.open,overshoot=pct(candle.high,e),range=candle.high-candle.low;
    // Adapt near-miss distance to recent candle volatility, bounded to avoid distant bounces.
    const nearLimitPct=Math.max(0.3,Math.min(1.5,0.75*atr/e*100));
    if(spike<Math.max(candle.open*0.01,atr*0.8)||volRatio<1.5||overshoot< -nearLimitPct||overshoot>Math.max(3,atr/e*150))continue;
    const nearMiss=overshoot< -0.15;
    const wick=range>0?(candle.high-Math.max(candle.open,candle.close))/range:0;
    const rejected=closed&&candle.close<e&&wick>=0.25;
    const stage=nearMiss?(rejected?(pumpLegType==='FIRST_PUMP_FROM_BASE'
      ?EMA99_FIRST_PUMP_NEAR_REJECT_STAGE:EMA99_REBOUND_PUMP_NEAR_REJECT_STAGE):'NEAR_EMA_WATCH')
      :rejected?'REJECTED_SHORT_WATCH':closed&&candle.close>=e?'CLOSED_ABOVE_EMA_WATCH':'TOUCH_WATCH';
    const target=Math.min(...pre.slice(-12).map(b=>b.low));
    events.push({version:POST_PUMP_EMA99_RETEST_VERSION,symbol,interval,side:'SHORT',stage,observeOnly:true,closed,
      generatedAt:new Date(now).toISOString(),candleAt:candle.openTime,candleCloseAt:candle.closeTime,
      dedupeKey:`${symbol}|${interval}|${candle.openTime}|${stage}`,
      price:candle.close,ema99:e,pumpLegType,pumpPct,dropPct,fadePct:priorPumpDump?fadePct:null,
      recentFadePct,reboundBars:priorPumpDump?reboundBars:0,reboundPct:priorPumpDump?reboundPct:0,
      baseRangePct,baseDriftPct,prePumpGapPct,historyWindowBars:96,
      fadeStartAt:priorPumpDump?fadeBars[0].openTime:null,fadeEndAt:priorPumpDump?bars[troughIndex].closeTime:null,
      emaSlopePct:slopePct,decliningShare:decline,
      volumeRatio:volRatio,spikeAtr:spike/atr,overshootPct:overshoot,upperWickPct:wick*100,
      nearMiss,nearLimitPct,gapToEmaPct:Math.max(0,-overshoot),gapToEmaAtr:Math.max(0,(e-candle.high)/atr),
      referenceEntry:rejected?candle.close:null,invalidation:candle.high+atr*0.25,
      takeProfit:rejected&&target<candle.close?target:null,
      executionTakeProfit:target<candle.close?target:null,
      reason:pumpLegType==='FIRST_PUMP_FROM_BASE'
        ?'Nhịp bơm đầu tiên từ nền giá dưới EMA99; chưa thấy chu kỳ bơm–xả trước đó trong 96 nến.'
        :nearMiss?'Đã pump, giảm dần dưới EMA99 dốc xuống; nến bơm hồi tới gần nhưng chưa chạm EMA99.'
        :'Đã pump, giảm dần dưới EMA99 dốc xuống; nến bật mạnh trở lại chạm/vượt EMA99.',
    });
  }
  return events;
}

export function postPumpEma99Event(event,now=Date.now()) {
  if(event?.version!==POST_PUMP_EMA99_RETEST_VERSION||now-Date.parse(event.generatedAt)>90_000||now<Date.parse(event.generatedAt))return null;
  return event;
}
export function postPumpEma99Payload(e) {
  const contextEmbed=ema99ContextEmbed(e.emaContext,{includeHigherTimeframes:e.interval==='5m'});
  const rebound=ema99ShortReboundPreview(e);
  const firstPump=e.stage===EMA99_FIRST_PUMP_NEAR_REJECT_STAGE;
  const reboundPump=e.stage===EMA99_REBOUND_PUMP_NEAR_REJECT_STAGE||e.stage==='NEAR_REJECT_SHORT_WATCH';
  const firstPumpContext=e.pumpLegType==='FIRST_PUMP_FROM_BASE';
  const nearMiss=e.stage==='NEAR_EMA_WATCH'||firstPump||reboundPump;
  const rejected=e.stage==='REJECTED_SHORT_WATCH'||firstPump||reboundPump;
  const legLabel=firstPump?'BƠM LẦN ĐẦU':reboundPump?'BƠM HỒI':'';
  const label=nearMiss?(rejected?`${legLabel?`${legLabel} · `:''}BẬT HỤT EMA99 + RÂU REJECT · SHORT WATCH`:'GẦN CHẠM EMA99 · THEO DÕI')
    :rejected?'ĐÃ REJECT · SHORT WATCH':e.stage==='CLOSED_ABOVE_EMA_WATCH'?'ĐÓNG TRÊN EMA99 · CHỜ PHÂN ĐỊNH':'CHẠM EMA99 · THEO DÕI';
  return {username:'Post Pump EMA99 Retest',allowed_mentions:{parse:[]},embeds:[{
    title:`${nearMiss?'🟠':rejected?'🔴':'🟡'} ${e.symbol} · ${e.interval} · ${label}`,color:firstPump?0xeab308:reboundPump?0xf97316:nearMiss?0xf59e0b:rejected?0xef4444:0xfbbf24,
    description:`${e.reason}\n${e.binanceExecution?`**BINANCE RIÊNG · SHORT MARKET · MARGIN ${e.binanceExecution.marginUsdt??5} USDT × 5x**\nTrạng thái: ${e.binanceExecution.status}${e.binanceExecution.orderId?` · Order ${e.binanceExecution.orderId}`:''}. Lệnh mới: TP +15% ROE, SL −30% ROE từ giá khớp thực tế (5x: TP −3% giá, SL +6% giá); không bảo đảm đã khớp nếu chưa có order.`:'**OBSERVE ONLY — KHÔNG TỰ ĐẶT LỆNH BINANCE**'}\n${e.closed?'Nến đã đóng.':'Nến đang chạy; chưa xác nhận reject.'}`,
    fields:[{name:'GIÁ / EMA99',value:`Giá ${num(e.price)} · EMA99 ${num(e.ema99)}\nĐỉnh nến so EMA ${num(e.overshootPct)}%${nearMiss?`\nCòn hụt ${num(e.gapToEmaPct)}% (${num(e.gapToEmaAtr)} ATR) · ngưỡng gần ${num(e.nearLimitPct)}%`:''}`},
      {name:'BỐI CẢNH',value:firstPumpContext
        ?`**BƠM LẦN ĐẦU TỪ NỀN** · chưa thấy pump–dump ≥8%/5% trong ${e.historyWindowBars??96} nến\nBiên nền 24 nến ${num(e.baseRangePct)}% · trôi nền ${num(e.baseDriftPct)}% · cách EMA trước bơm ${num(e.prePumpGapPct)}%\nNhịp bơm hiện tại ${num(e.pumpPct)}% · EMA99 giảm ${num(e.emaSlopePct)}% / 12 nến`
        :`**BƠM HỒI SAU PUMP–DUMP**\nPump trước ${num(e.pumpPct)}% → giảm ${num(e.dropPct)}%\nEMA99 giảm ${num(e.emaSlopePct)}% / 12 nến, ${Math.round(e.decliningShare*100)}% bước giảm\nĐoạn giảm trước nhịp hồi: ${num(e.fadePct)}% (hai nhóm 6 nến)\nNhịp hồi trước nến bật: ${num(e.reboundPct)}% / ${e.reboundBars??0} nến · 6vs6 hiện tại ${num(e.recentFadePct)}%`},
      {name:'NẾN BẬT',value:`Volume ${num(e.volumeRatio)}× trung bình20 nến · bật ${num(e.spikeAtr)} ATR\nRâu trên ${num(e.upperWickPct)}%`},
      {name:'KỊCH BẢN SHORT THAM KHẢO',value:`${rejected?`Giá lúc reject ${num(e.referenceEntry)} · đáy cấu trúc ${num(e.takeProfit)} · vô hiệu cấu trúc ${num(e.invalidation)}`:'Chưa có entry xác nhận.'}\n${nearMiss?'Đỉnh chưa chạm EMA99; không coi đây là reject trực tiếp tại EMA. ':''}${e.binanceExecution?'Route opt-in được phép SHORT MARKET theo nhóm sau nến đóng nếu các gate đạt; WATCH không mặc định đã reject. Khi vào Binance, TP/SL cuối tính theo ROE từ giá full-fill.':'Chờ phá đáy nến reject hoặc retest EMA99 thất bại.'} Bỏ SHORT nếu giá giữ trên EMA99. Không đuổi nếu đã sát hỗ trợ.`},
      {name:'THỜI ĐIỂM',value:`Nến mở ${new Date(e.candleAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false})} (VN) · ${e.interval}`},
      {name:'MỞ NHANH',value:`[Binance](https://www.binance.com/en/futures/${encodeURIComponent(e.symbol)}) · [CoinGlass](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${encodeURIComponent(e.symbol.replace(/USDT$/,''))})`}],
    timestamp:e.generatedAt,footer:{text:POST_PUMP_EMA99_RETEST_VERSION},
  },...(rebound?[{
    title:'🟠 GIÁ SHORT CHỜ HỒI · ƯỚC LƯỢNG',color:0xf59e0b,
    description:`## ${num(rebound.lower)} – ${num(rebound.upper)}\n**🎯 Mốc dự kiến: ${num(rebound.reference)}**\nVùng EMA99 ±0,5% tại snapshot tín hiệu, chưa phải entry đã xác nhận.`,
    fields:[{name:'ĐIỀU KIỆN',value:'Chỉ xét khi giá hồi vào vùng và xuất hiện reject mới. Không hồi thì bỏ qua; không dùng snapshot cũ làm giá hiện tại.'},
      {name:'VÔ HIỆU KỊCH BẢN',value:`${num(rebound.invalidation)} · Đây là mốc vô hiệu từ nến, KHÔNG phải SL Binance. SHORT EMA99 mới dùng SL −30% ROE từ giá khớp thực tế.`},
      {name:'CHỈ THAM KHẢO',value:'Không đặt LIMIT, không đổi hoặc tắt route MARKET đang bật. Giá/TP/SL cần đánh giá lại khi có nến mới.'}],
    timestamp:e.generatedAt,footer:{text:rebound.version}
  }]:[]),...(contextEmbed?[contextEmbed]:[])]};
}

export async function scanPostPumpEma99Retest(symbols,cache,notify,now=Date.now()) {
  let processed=0,detected=0,sent=0;
  for(const symbol of symbols)for(const interval of ['5m','15m']) {
    const rows=cache.getIfCached(symbol,interval,240);
    if(!rows||rows.length<165)continue;
    processed++;
    for(const event of detectPostPumpEma99Retest(rows,{symbol,interval,now})) {
      detected++;
      const result=await notify(event);sent+=result?.sent??0;
    }
  }
  return {processed,detected,sent};
}
import {ema99ShortReboundPreview} from './ema99ShortReboundPreview.js';
