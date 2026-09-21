export const EXTREME_SHORT_SQUEEZE_VERSION = 'EXTREME_SQUEEZE_FIRST_PUMP_FLUSH_LONG_V5_20260918';
export const EXTREME_SHORT_SQUEEZE_RULE = Object.freeze({
  minPumpPct: 8, minSpikeAtr: 4, minVolumeRatio: 3, minQuoteVolume: 100000,
  breakoutPct: 1, rejectionRetracePct: 50, rejectionWickPct: 40, lowerSweepPct: 3,
  peakMinRetracePct: 15, peakMaxRetracePct: 25, peakMaxDistancePct: 2,
  peakMinUpperWickPct: 20, peakStableMs: 15000,
  firstPumpMinPct: 5, firstPumpMinAtr: 8, firstPumpMinQuoteVolume: 100000,
  firstPumpMinVolumeRatio: 10, firstPumpBaseMaxRangePct: 3.5,
  firstPumpMinClosePositionPct: 35, firstPumpFlushMinRetracePct: 40,
  firstPumpFlushMaxRetracePct: 80, firstPumpFlushMinClosePositionPct: 65,
  firstPumpFlushMinLowerWickPct: 20, firstPumpFlushMinVolumeRatio: 3,
  firstPumpFlushMinTakerBuyRatio: 0.50, firstPumpOpenHoldTolerancePct: 0.2,
});
const peakHighTracker=new Map();
const durationOf = interval => ({ '5m': 300000, '15m': 900000 })[interval];
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const median = values => {
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};
const pct = (a, b) => (a / b - 1) * 100;
const num = v => Number.isFinite(v) ? Number(v.toFixed(8)).toString() : '—';
const vn = v => new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

function normalize(rows, duration, now) {
  const bars = (rows ?? []).map(r => ({
    openTime: Number(r.openTime ?? r[0]), closeTime: Number(r.closeTime ?? r[6]),
    open: Number(r.open ?? r[1]), high: Number(r.high ?? r[2]), low: Number(r.low ?? r[3]),
    close: Number(r.close ?? r[4]), volume: Number(r.volume ?? r[5]),
    quoteVolume: Number(r.quoteVolume ?? r.quoteAssetVolume ?? r[7]),
    takerBuyQuoteVolume: Number(r.takerBuyQuoteVolume ?? r[10]),
  })).filter(b => b.openTime <= now);
  if (bars.some((b, i) => ![b.openTime,b.closeTime,b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)
    || b.low <= 0 || b.volume < 0 || b.high < Math.max(b.open,b.close) || b.low > Math.min(b.open,b.close)
    || b.closeTime - b.openTime !== duration - 1 || (i > 0 && b.openTime - bars[i-1].openTime !== duration))) return [];
  return bars;
}

function ema(values,period) {
  if(values.length<period)return null;
  let result=mean(values.slice(0,period));const alpha=2/(period+1);
  for(const value of values.slice(period))result=value*alpha+result*(1-alpha);
  return result;
}

function candleMetrics(bar) {
  const range=bar.high-bar.low;
  if(!(range>0))return {closePositionPct:50,lowerWickPct:0};
  return {
    closePositionPct:(bar.close-bar.low)/range*100,
    lowerWickPct:(Math.min(bar.open,bar.close)-bar.low)/range*100,
  };
}

function firstPumpFlushReclaimLong(bars,symbol,now) {
  const rule=EXTREME_SHORT_SQUEEZE_RULE;
  const closed=bars.filter(bar=>bar.closeTime<now);
  if(closed.length<22)return null;
  const flushIndex=closed.length-1,flush=closed[flushIndex];
  if(now-flush.closeTime>90_000)return null;
  const candidates=[];
  for(const gap of [1,2]) {
    const impulseIndex=flushIndex-gap,impulse=closed[impulseIndex];
    if(!impulse)continue;
    const pre=closed.slice(impulseIndex-20,impulseIndex);
    if(pre.length<20)continue;
    const priorHigh=Math.max(...pre.map(bar=>bar.high));
    const priorLow=Math.min(...pre.map(bar=>bar.low));
    const baseRangePct=pct(priorHigh,priorLow);
    const quoteBaseline=median(pre.map(bar=>bar.quoteVolume));
    const volumeRatio=quoteBaseline>0?impulse.quoteVolume/quoteBaseline:null;
    const trueRanges=pre.slice(-14).map((bar,index,rows)=>{
      const absoluteIndex=impulseIndex-14+index;
      const previousClose=closed[absoluteIndex-1]?.close??bar.open;
      return Math.max(bar.high-bar.low,Math.abs(bar.high-previousClose),Math.abs(bar.low-previousClose));
    });
    const atr=mean(trueRanges);
    const pumpPct=pct(impulse.high,impulse.open);
    const spikeAtr=atr>0?(impulse.high-impulse.open)/atr:null;
    const impulseShape=candleMetrics(impulse);
    if(!(quoteBaseline>0)||!(atr>0)||baseRangePct>rule.firstPumpBaseMaxRangePct
      ||pumpPct<rule.firstPumpMinPct||spikeAtr<rule.firstPumpMinAtr
      ||volumeRatio<rule.firstPumpMinVolumeRatio
      ||impulse.quoteVolume<rule.firstPumpMinQuoteVolume
      ||pct(impulse.high,priorHigh)<rule.breakoutPct
      ||impulse.close<=priorHigh
      ||impulseShape.closePositionPct<rule.firstPumpMinClosePositionPct)continue;
    const peakHigh=Math.max(...closed.slice(impulseIndex,flushIndex).map(bar=>bar.high));
    const impulseRange=peakHigh-impulse.open;
    if(!(impulseRange>0))continue;
    const retracePct=(peakHigh-flush.low)/impulseRange*100;
    const flushShape=candleMetrics(flush);
    const flushVolumeRatio=flush.quoteVolume/quoteBaseline;
    const lowVsImpulseOpenPct=pct(flush.low,impulse.open);
    const takerBuyRatio=flush.quoteVolume>0&&Number.isFinite(flush.takerBuyQuoteVolume)
      ?flush.takerBuyQuoteVolume/flush.quoteVolume:null;
    const closes=closed.slice(0,flushIndex+1).map(bar=>bar.close);
    const ema13=ema(closes,13),ema25=ema(closes,25);
    const midpoint=(impulse.open+peakHigh)/2;
    const reclaimLevel=Math.max(midpoint,ema13??-Infinity,ema25??-Infinity);
    const absorptionConfirmed=takerBuyRatio==null
      ||takerBuyRatio>=rule.firstPumpFlushMinTakerBuyRatio
      ||flushShape.closePositionPct>=75;
    if(retracePct<rule.firstPumpFlushMinRetracePct
      ||retracePct>rule.firstPumpFlushMaxRetracePct
      ||lowVsImpulseOpenPct < -rule.firstPumpOpenHoldTolerancePct
      ||flushShape.closePositionPct<rule.firstPumpFlushMinClosePositionPct
      ||(flushShape.lowerWickPct<rule.firstPumpFlushMinLowerWickPct
        &&flushShape.closePositionPct<75)
      ||flushVolumeRatio<rule.firstPumpFlushMinVolumeRatio
      ||flush.close<reclaimLevel||!absorptionConfirmed)continue;
    const recoveredLeg=Math.max(0,flush.close-flush.low);
    const entryZoneHigh=flush.close;
    const entryZoneLow=Math.max(reclaimLevel,flush.close-recoveredLeg*.25);
    const measuredTarget=peakHigh+impulseRange;
    const score=Math.round(Math.min(100,
      35+Math.min(15,(pumpPct-rule.firstPumpMinPct)*3)
      +Math.min(15,(spikeAtr-rule.firstPumpMinAtr)*.7)
      +Math.min(15,(retracePct-rule.firstPumpFlushMinRetracePct)*.5)
      +Math.min(10,Math.max(0,flushShape.closePositionPct-65)*.5)
      +Math.min(10,Math.log10(Math.max(1,volumeRatio))*4)));
    candidates.push({
      version:EXTREME_SHORT_SQUEEZE_VERSION,observeOnly:true,binanceEligible:false,
      executionEnabled:false,symbol,interval:'5m',side:'LONG',
      kind:'FIRST_PUMP_FLUSH_RECLAIM_LONG',stage:'FIRST_PUMP_FLUSH_RECLAIM_LONG_CLOSED',closed:true,
      score,generatedAt:new Date(now).toISOString(),observedAt:now,liveUpdatedAt:null,
      candleAt:impulse.openTime,candleCloseAt:impulse.closeTime,
      evaluatedCandleAt:flush.openTime,evaluatedCloseAt:flush.closeTime,
      price:flush.close,signalPrice:flush.close,signalAt:flush.closeTime,
      impulseOpen:impulse.open,impulseHigh:peakHigh,impulseClose:impulse.close,
      pumpPct,spikeAtr,atr,volumeRatio,quoteVolume:impulse.quoteVolume,
      priorHigh,priorLow,baseRangePct,impulseClosePositionPct:impulseShape.closePositionPct,
      flushOpen:flush.open,flushHigh:flush.high,flushLow:flush.low,flushClose:flush.close,
      retracePct,flushVolumeRatio,flushClosePositionPct:flushShape.closePositionPct,
      flushLowerWickPct:flushShape.lowerWickPct,lowVsImpulseOpenPct,takerBuyRatio,
      ema13,ema25,reclaimLevel,entryZoneLow,entryZoneHigh,
      entryZoneMidpoint:(entryZoneLow+entryZoneHigh)/2,
      saferConfirmationPrice:peakHigh,measuredTarget,invalidationPrice:flush.low,
      followBars:gap,dedupeKey:`FIRST_PUMP_FLUSH_LONG|${symbol}|5m|${impulse.openTime}|${flush.openTime}`,
    });
  }
  return candidates.sort((left,right)=>right.score-left.score)[0]??null;
}

// Observe-only: measures an exceptional upward spike, not proven liquidations.
// For historical replay callers must remove final OHLC of candles unfinished at now.
export function detectExtremeShortSqueeze(rows, {symbol, interval, now=Date.now(), liveUpdatedAt=null,peakStableMs=0}={}) {
  const duration=durationOf(interval), rule=EXTREME_SHORT_SQUEEZE_RULE;
  if (!duration || !Number.isFinite(now) || !symbol) return [];
  const bars=normalize(rows,duration,now), events=[];
  if (bars.length<22) return events;
  const fresh=b=>b.closeTime<now ? now-b.closeTime<=90000
    : Number.isFinite(liveUpdatedAt) && liveUpdatedAt>=b.openTime && liveUpdatedAt<=now && now-liveUpdatedAt<=30000;
  // Up to three subsequent candles can report a rejection / two-sided sweep.
  for (let i=Math.max(21,bars.length-5);i<bars.length;i++) {
    const spike=bars[i], pre=bars.slice(i-20,i), prior=bars[i-1];
    if (prior.closeTime>=now) continue;
    const atr=mean(bars.slice(i-14,i).map((b,j)=>Math.max(b.high-b.low,
      Math.abs(b.high-bars[i-15+j].close),Math.abs(b.low-bars[i-15+j].close))));
    const avgVolume=mean(pre.map(b=>b.volume)), priorHigh=Math.max(...pre.map(b=>b.high)), priorLow=Math.min(...pre.map(b=>b.low));
    const pumpPct=pct(spike.high,spike.open), fromPriorPct=pct(spike.high,prior.close);
    const spikeAtr=(spike.high-spike.open)/atr, volumeRatio=spike.volume/avgVolume;
    // If cache lacks quoteVolume, use the conservative lower bound volume*low.
    const quoteEstimated=!(Number.isFinite(spike.quoteVolume)&&spike.quoteVolume>=0);
    const quoteVolume=quoteEstimated?spike.volume*spike.low:spike.quoteVolume;
    if (!(atr>0) || !(avgVolume>0) || pumpPct<rule.minPumpPct || fromPriorPct<rule.minPumpPct
      || spikeAtr<rule.minSpikeAtr || volumeRatio<rule.minVolumeRatio || quoteVolume<rule.minQuoteVolume
      || pct(spike.high,priorHigh)<rule.breakoutPct) continue;
    const range=spike.high-spike.low, wickPct=(spike.high-Math.max(spike.open,spike.close))/range*100;
    const retrace=price=>(spike.high-price)/(spike.high-spike.open)*100;
    const twoSide=low=>low<priorLow && pct(low,spike.open)<=-rule.lowerSweepPct;
    const emit=(kind,bar,followBars=0)=>{
      if (!fresh(bar)) return;
      const closed=bar.closeTime<now, stage=`${kind}_${closed?'CLOSED':'LIVE'}`;
      const binanceEligible=interval==='5m'&&(
        (kind==='EXTREME_PUMP'&&closed)||(kind==='FOLLOW_REJECTION'&&!closed)
        ||(kind==='PEAK_ZONE_SHORT_WATCH'&&!closed)
      );
      events.push({version:EXTREME_SHORT_SQUEEZE_VERSION,observeOnly:!binanceEligible,binanceEligible,symbol,interval,
        side:'UPWARD_SPIKE',stage,kind,closed,followBars,
        generatedAt:new Date(now).toISOString(),observedAt:now,liveUpdatedAt:closed?null:liveUpdatedAt,
        candleAt:spike.openTime,candleCloseAt:spike.closeTime,evaluatedCandleAt:bar.openTime,evaluatedCloseAt:bar.closeTime,
        spikeOpen:spike.open,spikeHigh:spike.high,spikeLow:spike.low,spikeClose:spike.close,
        price:bar.close,observedLow:Math.min(spike.low,...bars.slice(i+1,i+followBars+1).map(b=>b.low)),
        pumpPct,fromPriorPct,spikeAtr,atr,volumeRatio,quoteVolume,quoteEstimated,upperWickPct:wickPct,
        retracePct:retrace(bar.close),priorHigh,priorLow,priorRangePct:pct(priorHigh,priorLow),
        distanceFromHighPct:(spike.high-bar.close)/spike.high*100,peakStableMs,
        dedupeKey:`EXTREME_SPIKE|${symbol}|${interval}|${spike.openTime}|${stage}`});
    };
    if (twoSide(spike.low)) emit('TWO_SIDE_SWEEP',spike);
    else if (wickPct>=rule.rejectionWickPct && retrace(spike.close)>=rule.rejectionRetracePct) emit('UPPER_REJECTION',spike);
    else emit('EXTREME_PUMP',spike);
    const peakRetrace=retrace(spike.close),distanceFromHigh=(spike.high-spike.close)/spike.high*100;
    if(spike.closeTime>=now&&peakStableMs>=rule.peakStableMs&&peakRetrace>=rule.peakMinRetracePct
      &&peakRetrace<=rule.peakMaxRetracePct&&distanceFromHigh<=rule.peakMaxDistancePct
      &&wickPct>=rule.peakMinUpperWickPct)emit('PEAK_ZONE_SHORT_WATCH',spike);
    if (spike.closeTime>=now) continue;
    let low=spike.low;
    const emittedKinds=new Set();
    for (let j=i+1;j<=Math.min(i+3,bars.length-1);j++) {
      const follow=bars[j]; low=Math.min(low,follow.low);
      // A new higher high is a continuation; do not call it rejection of this peak.
      if (follow.high>spike.high) break;
      const kind=twoSide(low)?'FOLLOW_TWO_SIDE_SWEEP':retrace(follow.close)>=rule.rejectionRetracePct?'FOLLOW_REJECTION':null;
      if (!kind || emittedKinds.has(kind)) continue;
      emit(kind,follow,j-i);
      // Once first closed confirmation is old, never renew it on later candles.
      if (follow.closeTime<now) emittedKinds.add(kind);
    }
  }
  if(interval==='5m') {
    const continuation=firstPumpFlushReclaimLong(bars,symbol,now);
    if(continuation)events.push(continuation);
  }
  return events;
}

export function extremeShortSqueezeEvent(event,now=Date.now()) {
  const firstPumpLong=event?.kind==='FIRST_PUMP_FLUSH_RECLAIM_LONG';
  const validSide=firstPumpLong?event?.side==='LONG':event?.side==='UPWARD_SPIKE';
  const executable=event?.interval==='5m'&&event?.binanceEligible===true&&event?.observeOnly===false&&(
    (event?.kind==='EXTREME_PUMP'&&event?.closed===true)
    ||(event?.kind==='FOLLOW_REJECTION'&&event?.closed===false)
    ||(event?.kind==='PEAK_ZONE_SHORT_WATCH'&&event?.closed===false)
  );
  const validMode=event?.observeOnly===true||executable;
  if (event?.version!==EXTREME_SHORT_SQUEEZE_VERSION || !validMode || !validSide
    || !durationOf(event.interval) || !STYLES[event.kind] || event.stage!==`${event.kind}_${event.closed?'CLOSED':'LIVE'}`
    || !Number.isFinite(event.observedAt) || now<event.observedAt || now-event.observedAt>90000) return null;
  if (event.closed) return Number.isFinite(event.evaluatedCloseAt) && event.evaluatedCloseAt<now && now-event.evaluatedCloseAt<=90000?event:null;
  return event.evaluatedCandleAt<=now && event.evaluatedCloseAt>=now && Number.isFinite(event.liveUpdatedAt)
    && event.liveUpdatedAt<=now && now-event.liveUpdatedAt<=30000?event:null;
}

const STYLES={
  EXTREME_PUMP:{color:0xf59e0b,title:'NẾN BƠM SIÊU CAO · NGUY CƠ KILL SHORT',note:'Giá bơm mạnh vượt đỉnh gần. Chưa có xác nhận đảo chiều.'},
  UPPER_REJECTION:{color:0xef4444,title:'NẾN BƠM SIÊU CAO · RÚT RÂU TRÊN',note:'Nến spike đã trả lại ít nhất 50% nhịp tăng và có râu trên lớn.'},
  TWO_SIDE_SWEEP:{color:0xa855f7,title:'NẾN SIÊU CAO · QUÉT BIÊN HAI ĐẦU',note:'Cùng nến vượt đỉnh cũ và xuyên đáy cũ. OHLC không cho biết thứ tự quét hai đầu.'},
  FOLLOW_REJECTION:{color:0xef4444,title:'SAU NẾN SIÊU CAO · GIÁ TRẢ LẠI NHỊP BƠM',note:'Trong 1–3 nến sau spike, giá đã trả lại ít nhất 50% nhịp bơm.'},
  FOLLOW_TWO_SIDE_SWEEP:{color:0xa855f7,title:'SAU NẾN SIÊU CAO · QUÉT THÊM BIÊN DƯỚI',note:'Trong tối đa 3 nến sau spike, xuất hiện biên dưới xuyên đáy trước nhịp bơm.'},
  PEAK_ZONE_SHORT_WATCH:{color:0xff7a00,title:'VÙNG GẦN ĐỈNH · SHORT SỚM CÓ XÁC NHẬN',note:'Nến bơm đang chạy đã lùi 15–25% nhịp open→high, còn cách high tối đa 2% và rolling high không tăng ít nhất 15 giây.'},
  FIRST_PUMP_FLUSH_RECLAIM_LONG:{color:0x06b6d4,title:'BƠM LẦN ĐẦU → XẢ HẤP THỤ · LONG WATCH',note:'Cú bơm đầu tiên thoát nền, nhịp xả nhanh giữ đáy cấu trúc và đóng reclaim. Chờ vùng pullback; không mua đuổi.'},
};
export function extremeShortSqueezePayload(e) {
  const s=STYLES[e.kind];
  if(e.kind==='FIRST_PUMP_FLUSH_RECLAIM_LONG') {
    return {username:'Extreme Squeeze · First Pump Long',allowed_mentions:{parse:[]},embeds:[{
      title:`🩵 ${e.symbol} · 5m · ${s.title}`,color:s.color,
      description:`**NẾN HẤP THỤ ĐÃ ĐÓNG · ĐIỂM ${e.score}/100**\n${s.note}\n**OBSERVE ONLY — KHÔNG TỰ ĐẶT LỆNH BINANCE.**`,
      fields:[
        {name:'🎯 VÙNG LONG SỚM DỰ KIẾN',value:`**${num(e.entryZoneLow)}–${num(e.entryZoneHigh)} USDT** · mốc giữa **${num(e.entryZoneMidpoint)}**\nGiá xác nhận hấp thụ **${num(e.price)}** · xác nhận an toàn hơn khi 5m đóng trên **${num(e.saferConfirmationPrice)}**`},
        {name:'🚀 CÚ BƠM ĐẦU TIÊN',value:`Open ${num(e.impulseOpen)} → high **${num(e.impulseHigh)}**: **+${e.pumpPct.toFixed(2)}%**\nĐộ lớn **${e.spikeAtr.toFixed(2)}× ATR14** · volume **${e.volumeRatio.toFixed(2)}× median20** · ${Math.round(e.quoteVolume).toLocaleString('en-US')} USDT\nNền trước đó ${e.baseRangePct.toFixed(2)}% · đóng nến ở ${e.impulseClosePositionPct.toFixed(1)}% biên`},
        {name:'🩵 NHỊP XẢ / HẤP THỤ',value:`Low **${num(e.flushLow)}** · close **${num(e.flushClose)}** · trả lại **${e.retracePct.toFixed(1)}%** nhịp bơm\nLow so với open đầu nhịp **${e.lowVsImpulseOpenPct>=0?'+':''}${e.lowVsImpulseOpenPct.toFixed(2)}%** · close ở ${e.flushClosePositionPct.toFixed(1)}% biên · râu dưới ${e.flushLowerWickPct.toFixed(1)}%\nVolume ${e.flushVolumeRatio.toFixed(2)}× median20${Number.isFinite(e.takerBuyRatio)?` · taker-buy ${(e.takerBuyRatio*100).toFixed(1)}%`:''}`},
        {name:'📐 MỐC CẤU TRÚC',value:`Reclaim ${num(e.reclaimLevel)} · EMA13 ${num(e.ema13)} · EMA25 ${num(e.ema25)}\nMeasured target tham khảo **${num(e.measuredTarget)}** · vô hiệu cấu trúc nếu 5m đóng thủng pivot **${num(e.invalidationPrice)}**`},
        {name:'⏰ THỜI ĐIỂM (VIỆT NAM)',value:`Cú bơm mở ${vn(e.candleAt)}\nNến hấp thụ đóng ${vn(e.evaluatedCloseAt)}\n${e.stage}`},
        {name:'MỞ BIỂU ĐỒ',value:`[Binance](https://www.binance.com/en/futures/${encodeURIComponent(e.symbol)})`},
      ],timestamp:e.generatedAt,footer:{text:`${EXTREME_SHORT_SQUEEZE_VERSION} · closed 5m only`},
    }]};
  }
  const execution=e.binanceExecution;
  const margin=e.kind==='PEAK_ZONE_SHORT_WATCH'?2:1;
  const executionText=e.binanceEligible===true
    ? `SHORT thử nghiệm Binance: **$${margin} margin × 5x** khi route đang ON, tín hiệu còn mới và mark còn sát giá đánh giá.${execution?` Kết quả: **${String(execution.status??'unknown').toUpperCase()}**${execution.code?` · ${execution.code}`:''}.`:''}`
    : 'Cảnh báo quan sát; không tự đặt lệnh Binance.';
  return {username:'Extreme Short Squeeze',allowed_mentions:{parse:[]},embeds:[{
    title:`⚡ ${e.symbol} · ${e.interval} · ${s.title}`,color:s.color,
    description:`**${e.closed?'NẾN ĐÃ ĐÓNG':'NẾN ĐANG CHẠY — CÓ THỂ THAY ĐỔI'}**\n${s.note}\n${executionText} “Kill short” là mô tả hình thái giá, chưa xác minh thanh lý thực tế.`,
    fields:[
      {name:'ĐỘ LỚN NẾN BƠM',value:`Open → high **+${e.pumpPct.toFixed(2)}%** · so với close trước **+${e.fromPriorPct.toFixed(2)}%**\nNhịp tăng **${e.spikeAtr.toFixed(2)}× ATR14** trước nến · volume **${e.volumeRatio.toFixed(2)}× MA20** trước nến\nKhối lượng ${e.quoteEstimated?'ước tính tối thiểu ':''}**${Math.round(e.quoteVolume).toLocaleString('en-US')} USDT**`},
      {name:'GIÁ / RÂU NẾN',value:`Giá mở ${num(e.spikeOpen)} · đỉnh **${num(e.spikeHigh)}** · đáy spike ${num(e.spikeLow)}\nGiá tại đánh giá **${num(e.price)}** · thấp nhất đã thấy ${num(e.observedLow)}\nRâu trên nến spike ${e.upperWickPct.toFixed(1)}% · trả lại nhịp tăng ${e.retracePct.toFixed(1)}%${e.kind==='PEAK_ZONE_SHORT_WATCH'?` · cách high ${e.distanceFromHighPct.toFixed(2)}% · high đứng ${Math.floor(e.peakStableMs/1000)}s`:''}`},
      {name:'BỐI CẢNH 20 NẾN TRƯỚC',value:`Đỉnh ${num(e.priorHigh)} · đáy ${num(e.priorLow)} · biên độ ${e.priorRangePct.toFixed(2)}%\nĐo biến động theo nến; không dùng % tăng giảm 24h để xác nhận.`},
      {name:'THỜI ĐIỂM (VIỆT NAM)',value:`Nến bơm mở ${vn(e.candleAt)}\nĐánh giá ${vn(e.observedAt)}${e.followBars?` · nến thứ ${e.followBars} sau spike`:''}\n${e.stage}`},
      {name:'MỞ BIỂU ĐỒ',value:`[Binance](https://www.binance.com/en/futures/${encodeURIComponent(e.symbol)})`},
    ],timestamp:e.generatedAt,footer:{text:EXTREME_SHORT_SQUEEZE_VERSION},
  }]};
}

export async function scanExtremeShortSqueeze(symbols,cache,notify,now=Date.now()) {
  let processed=0,detected=0,sent=0,failed=0;
  for (const symbol of [...new Set(symbols)]) for (const interval of ['5m','15m']) {
    const rows=cache.getIfCached(symbol,interval,64);
    if (!rows || rows.length<22) continue;
    const liveUpdatedAt=cache.liveCoverage?.([symbol],interval,now)?.newestTickAt??null;
    const last=rows.at(-1),trackerKey=`${symbol}|${interval}|${Number(last?.openTime??last?.[0])}`;
    let peakStableMs=0;
    if(Number(last?.closeTime??last?.[6])>=now&&Number.isFinite(Number(last?.high??last?.[2]))) {
      const high=Number(last.high??last[2]),previous=peakHighTracker.get(trackerKey);
      const tracked=!previous||high>previous.high?{high,highSince:now,lastSeen:now}:{...previous,lastSeen:now};
      peakHighTracker.set(trackerKey,tracked);peakStableMs=now-tracked.highSince;
    }
    if(peakHighTracker.size>2000)for(const [key,value] of peakHighTracker)if(now-value.lastSeen>30*60_000)peakHighTracker.delete(key);
    processed++;
    for (const event of detectExtremeShortSqueeze(rows,{symbol,interval,now,liveUpdatedAt,peakStableMs})) {
      detected++;
      try { sent+=(await notify(event))?.sent??0; } catch {failed++;}
    }
  }
  return {processed,detected,sent,failed};
}
