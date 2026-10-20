export const PUMP_TURN_VERSION='PUMP_TURN_ZONE_WATCH_V1_20261018';
export const STEP=300000;
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const pct=(a,b)=>(a/b-1)*100;
const valid=b=>b&&[b.t,b.end,b.o,b.c,b.h,b.l,b.q,b.v,b.buy].every(Number.isFinite)
  &&b.t%STEP===0&&b.end===b.t+STEP-1&&Math.min(b.o,b.c,b.h,b.l)>0
  &&b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c)&&b.h>=b.l&&b.q>=0&&b.v>=0&&b.buy>=0&&b.buy<=b.q*1.000001;
export function closedPumpRows(raw,now){
  const rows=(Array.isArray(raw)?raw:[]).map(r=>({t:Number(r.openTime),end:Number(r.closeTime),o:Number(r.open),h:Number(r.high),l:Number(r.low),c:Number(r.close),q:Number(r.quoteVolume),v:Number(r.volume),buy:Number(r.takerBuyQuoteVolume),isClosed:r.isClosed}))
    .filter(r=>r.end<now&&r.isClosed!==false).sort((a,b)=>a.t-b.t).slice(-74);
  const info={bars:rows.length,lastClosedAt:rows.at(-1)?.end??null};
  if(rows.length<73)return {...info,status:'INSUFFICIENT',reason:'FEWER_THAN_73_CLOSED',rows:[]};
  if(rows.some(b=>!valid(b)))return {...info,status:'INVALID_OR_GAP',reason:'INVALID_CANDLE',rows:[]};
  if(rows.some((b,i)=>i&&b.t!==rows[i-1].t+STEP))return {...info,status:'INVALID_OR_GAP',reason:'NON_CONTIGUOUS_CLOSED',rows:[]};
  if(now-rows.at(-1).end>STEP+75000)return {...info,status:'STALE',reason:'OLD_LAST_CLOSED',rows:[]};
  return {...info,status:'READY',rows};
}
export function plannedPumpZones(symbol,prior){
  if(prior.length<72)return [];
  const pre=prior.slice(-72),last=pre.at(-1),baseline=mean(pre.slice(-20).map(b=>b.q));
  const breakout=Math.max(...pre.slice(-12).map(b=>b.h))*1.001,breakdown=Math.min(...pre.slice(-3).map(b=>b.l))*.999;
  const hi=Math.max(...pre.map(b=>b.h)),pi=pre.findIndex(b=>b.h===hi),base=pi>0?Math.min(...pre.slice(0,pi).map(b=>b.c)):null;
  const tail=pre.slice(-3),q=tail.reduce((s,b)=>s+b.q,0),buy=q?tail.reduce((s,b)=>s+b.buy,0)/q*100:null;
  const pump=base?pct(hi,base):0,gain=pct(last.c,pre.at(-13).c),vol=baseline>0?mean(tail.map(b=>b.q))/baseline:0;
  const common={version:PUMP_TURN_VERSION,symbol,interval:'5m',asOf:last.end,expiresAt:last.end+STEP+1,
    baseline,base,peak:hi,peakAt:pre[pi]?.t,pump6h:pump,gain60:gain,preVolumeX:vol,preBuyPct:buy,returnBase:pre.at(-12).c,
    chart:pre.slice(-48),observeOnly:true};
  return [{...common,id:`pump-turn:${symbol}:LONG:${last.end}`,side:'LONG',zoneLow:breakout,zoneHigh:breakout*1.005,
    contextEligible:gain>=4&&vol>=1.2&&buy>=50,contextChecks:[
      {label:'Giá đã tăng ≥4% / 60 phút',pass:gain>=4,value:gain,unit:'%'},
      {label:'Volume TB 3 nến ≥1,2× nền20',pass:vol>=1.2,value:vol,unit:'×'},
      {label:'Taker mua 3 nến ≥50%',pass:buy!=null&&buy>=50,value:buy,unit:'%'}]},
  {...common,id:`pump-turn:${symbol}:SHORT:${last.end}`,side:'SHORT',zoneLow:breakdown*.995,zoneHigh:breakdown,
    contextEligible:pump>=15,contextChecks:[{label:'Sóng tăng ≥15% / 6h, nền trước đỉnh',pass:pump>=15,value:pump,unit:'%'}]}];
}
export function confirmationChecks(plan,candle){
  const volume=plan.baseline>0?candle.q/plan.baseline:0,buy=candle.q?candle.buy/candle.q*100:null;
  const gain=pct(candle.c,plan.returnBase),drop=(1-candle.c/plan.peak)*100,pos=candle.h>candle.l?(candle.c-candle.l)/(candle.h-candle.l):0;
  const common=[{label:'Volume nến ≥100.000 USDT',pass:candle.q>=100000,value:candle.q,unit:' USDT'}];
  const checks=plan.side==='LONG'?[...common,
    {label:'Tăng ≥8% / 60 phút',pass:gain>=8,value:gain,unit:'%'},
    {label:'Đóng vượt đỉnh12 nến +0,1%',pass:candle.c>plan.zoneLow,value:plan.zoneLow,unit:' giá'},
    {label:'Volume ≥2× nền20',pass:volume>=2,value:volume,unit:'×'},
    {label:'Taker mua ≥55%',pass:buy!=null&&buy>=55,value:buy,unit:'%'},
    {label:'Đóng ở 30% trên biên nến',pass:pos>=.7,value:pos*100,unit:'%'}]:[...common,
    {label:'Sóng tăng ≥15% / 6h',pass:plan.pump6h>=15,value:plan.pump6h,unit:'%'},
    {label:'Trả từ đỉnh 3–20%',pass:drop>=3&&drop<=20,value:drop,unit:'%'},
    {label:'Nến đỏ',pass:candle.c<candle.o,value:null,unit:''},
    {label:'Đóng thủng đáy3 nến −0,1%',pass:candle.c<plan.zoneHigh,value:plan.zoneHigh,unit:' giá'},
    {label:'Volume ≥1,5× nền20',pass:volume>=1.5,value:volume,unit:'×'},
    {label:'Taker bán ≥55%',pass:buy!=null&&buy<=45,value:buy==null?null:100-buy,unit:'%'}];
  return {checks,passed:checks.every(x=>x.pass)};
}
export function livePumpZone(plan,point,now,nearPct=.75){
  const fresh=point&&Number.isFinite(point.at)&&point.at<=now+1000&&now-point.at<=30000&&Number.isFinite(point.price)&&point.price>0;
  const price=fresh?point.price:null;
  const distancePct=price==null?null:price<plan.zoneLow?(plan.zoneLow-price)/price*100:price>plan.zoneHigh?(price-plan.zoneHigh)/price*100:0;
  const chased=price!=null&&(plan.side==='LONG'?price>plan.zoneHigh:price<plan.zoneLow);
  const drop=price!=null?(1-price/plan.peak)*100:null;
  const invalid=plan.side==='SHORT'&&drop!=null&&(drop<0||drop>20);
  const state=now>=plan.expiresAt?'EXPIRED':!fresh?'WAIT_PRICE':invalid?'INVALIDATED':chased?'CHASE':distancePct===0?'IN_ZONE':distancePct<=nearPct?'NEAR':'FAR';
  return {...plan,livePrice:price,liveAt:fresh?point.at:null,distancePct,state,alertEligible:plan.contextEligible&&['NEAR','IN_ZONE'].includes(state)};
}
