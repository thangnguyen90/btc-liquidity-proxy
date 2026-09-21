import { assessSweepDirection } from './liqScanSnapshot.js';
export const LIQ_SCAN_TIER_VERSION='LIQ_SCAN_TWO_TIER_OBSERVE_V1_20260906';

export function classifyLiqScanTier(analysis,now=Date.now()) {
  const current=analysis?.liqScan?.current??analysis?.liqScan;
  const score=Number(current?.imbalanceScore??current?.sweepProbabilityPct);
  const age=now-Date.parse(current?.evaluatedAt);
  if (!Number.isFinite(score)||score<40||score>100||current?.stale||analysis?.freshness?.stale
    || !Number.isFinite(age)||age<0||age>90_000||!['ABOVE','BELOW'].includes(current?.dominantSide)
    || !(analysis?.market?.markPrice>0)) return null;
  const direction=assessSweepDirection(analysis,current,now);
  const long=current.dominantSide==='ABOVE', side=long?'LONG':'SHORT';
  const plan=long?analysis?.recommendation?.longPlan:analysis?.recommendation?.shortPlan;
  const price=analysis.market.markPrice;
  const closed=interval=>(analysis?.liqScanCandleContext?.[interval]??[])
    .filter(b=>b.closeTime<now&&b.openTime<b.closeTime&&[b.open,b.high,b.low,b.close].every(n=>Number.isFinite(n)&&n>0))
    .sort((a,b)=>a.openTime-b.openTime).at(-1);
  const b5=closed('5m'),b15=closed('15m');
  const atr=analysis?.trend?.frames?.find(f=>f.interval==='5m')?.atr14;
  const level=long?plan?.entryZone?.high:plan?.entryZone?.low;
  const chronological=b5&&b15&&b5.openTime>b15.closeTime&&now-b5.closeTime<=6*60_000&&now-b15.closeTime<=16*60_000;
  const confirmed=chronological && (long?b15.close>level:b15.close<level);
  const retest=atr>0&&chronological&&(long
    ? b5.low>=level-atr*0.25&&b5.low<=level+atr*0.25&&b5.close>level&&b5.close>b5.open
    : b5.high>=level-atr*0.25&&b5.high<=level+atr*0.25&&b5.close<level&&b5.close<b5.open);
  const buy=b5?.quoteVolume>0&&b5.takerBuyQuoteVolume>0&&b5.takerBuyQuoteVolume<=b5.quoteVolume?b5.takerBuyQuoteVolume/b5.quoteVolume*100:null;
  const flow=buy==null?null:long?buy:100-buy;
  const targetCandidates=[...(plan?.targets??[]),long?direction.above?.bandLow:direction.below?.bandHigh]
    .filter(n=>Number.isFinite(n)&&n>0&&(long?n>price:n<price)).sort((a,b)=>Math.abs(a-price)-Math.abs(b-price));
  const target=targetCandidates[0]??null, invalidation=plan?.invalidation;
  const risk=long?price-invalidation:invalidation-price;
  const rr=target&&risk>0?Math.abs(target-price)/risk:null;
  const checks=[
    {label:'Điểm ≥70/100 (ngưỡng thử)',pass:score>=70},
    {label:'CoinGlass mới, vùng mục tiêu và nến/trend đồng hướng',pass:direction.direction===current.dominantSide&&Boolean(direction.target)},
    {label:'Nến 15m đóng vượt vùng, sau đó có nến 5m mới',pass:Boolean(confirmed)},
    {label:'Retest 5m giữ vùng đúng hướng',pass:Boolean(retest)},
    {label:'Taker theo hướng ≥55%',pass:flow!=null&&flow>=55},
    {label:'Giá chưa đuổi quá 0,5 ATR và còn đúng phía vùng',pass:Boolean(b5&&atr>0&&Math.abs(price-b5.close)<=atr*0.5&&(long?price>level:price<level))},
    {label:'TP gần / mức vô hiệu đúng phía, R:R ≥1,2',pass:Number.isFinite(rr)&&rr>=1.2},
  ];
  const tier=checks.every(c=>c.pass)?'MARKET_READY':'WATCH';
  return {version:LIQ_SCAN_TIER_VERSION,symbol:analysis.symbol,side,tier,score,
    dedupeKey:`${analysis.symbol}|${tier}`,observeOnly:true,executionEnabled:false,
    generatedAt:current.evaluatedAt,price,target,invalidation:Number.isFinite(invalidation)?invalidation:null,rewardRisk:rr,
    current,direction,checks,flowPct:flow};
}

const n=v=>Number.isFinite(v)?Number(v.toFixed(8)).toString():'—';
export function buildLiqScanTierPayload(e) {
  const ready=e.tier==='MARKET_READY';
  return {username:'LiqScan · Hai mức đánh giá',allowed_mentions:{parse:[]},embeds:[{
    title:`${ready?(e.side==='LONG'?'🟢':'🔴'):'🟡'} LIQSCAN · ${e.symbol} · ${ready?'MARKET READY':'CHÚ Ý / THEO DÕI'} · ${e.side}`,
    color:ready?(e.side==='LONG'?0x10b981:0xef4444):0xfbbf24,
    description:`**${e.score}/100 · ĐIỂM LỆCH, KHÔNG PHẢI XÁC SUẤT**\n${ready?'Đủ bộ điều kiện thử nghiệm cho kịch bản market.':'Đạt ngưỡng theo dõi; chưa đủ bộ điều kiện market.'}\n**OBSERVE ONLY — KHÔNG TỰ ĐẶT LỆNH BINANCE**`,
    fields:[
      {name:'GIÁ / THANH KHOẢN ƯỚC TÍNH',value:`Giá ${n(e.price)}\nTrên ${n(e.current.liquidityAbove)} · Dưới ${n(e.current.liquidityBelow)}`},
      {name:'ĐỐI CHIẾU',value:e.direction.headline.slice(0,1024)},
      {name:'MỨC THAM KHẢO',value:`${ready?'Entry tham khảo':'Giá đang theo dõi'} ${n(e.price)} · TP gần ${n(e.target)} · Vô hiệu ${n(e.invalidation)} · R:R ${n(e.rewardRisk)}`},
      {name:'ĐIỀU KIỆN',value:e.checks.map(c=>`${c.pass?'✓':'✗'} ${c.label}`).join('\n')},
      {name:'THỜI ĐIỂM / GHI CHÚ',value:`${new Date(e.generatedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false})} (VN)\nNgưỡng 40/70 chưa được backtest hiệu quả giao dịch. OI chưa làm điều kiện trong bộ này.`},
      {name:'MỞ NHANH',value:`[Binance](https://www.binance.com/en/futures/${encodeURIComponent(e.symbol)}) · [CoinGlass](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${encodeURIComponent(e.symbol.replace(/USDT$/,''))})`},
    ],timestamp:e.generatedAt,footer:{text:LIQ_SCAN_TIER_VERSION},
  }]};
}
