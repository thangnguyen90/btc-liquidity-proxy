import {isSecondUpperSweep} from '../public/heatmap-second-sweep-model.js';

export const SWEEP_PUMP_PHASE_VERSION='HEATMAP_SWEEP_PUMP_PHASE_DISCORD_V1_20261108';
export const SWEEP_PUMP_PHASE_RULE=Object.freeze({bars:288,stepMs:300000,pumpPct:10,pullbackPct:5,reboundPct:2,initialRisePct:1});
const S=SWEEP_PUMP_PHASE_RULE.stepMs,finite=Number.isFinite;
const rise=(p,base)=>(p/base-1)*100,drop=(p,peak)=>(1-p/peak)*100;
export const SWEEP_PUMP_PHASE_TITLES=Object.freeze({
 FIRST_PUSH:'BƠM ĐẦU TRONG CỬA SỔ 24H',
 REBOUND_BELOW_PEAK:'BƠM HỒI · CHƯA VƯỢT ĐỈNH CŨ',
 REBOUND_BREAKOUT:'BƠM HỒI · ĐÃ VƯỢT ĐỈNH CŨ',
 UNKNOWN:'CHƯA XÁC ĐỊNH NHỊP BƠM',
});

function series(rows,at,symbol){
 const end=Math.floor(at/S)*S,start=end-288*S,map=new Map();
 for(const r of rows??[]){
  if(!r||r.isClosed===false)continue;
  const b=Array.isArray(r)?{time:+r[0],end:+r[6],open:+r[1],high:+r[2],low:+r[3],close:+r[4]}
   :{time:+r.openTime,end:+r.closeTime,open:+r.open,high:+r.high,low:+r.low,close:+r.close};
  if(b.time<start||b.time>=end||!finite(b.time))continue;
  if(r.symbol&&r.symbol!==symbol)return {bars:null,count:0};
  if(!Object.values(b).every(finite)||b.time%S||b.end!==b.time+S-1||b.low<=0
   ||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))return {bars:null,count:0};
  map.set(b.time,b);
 }
 const bs=[...map.values()].sort((a,b)=>a.time-b.time);
 return {bars:bs.length===288&&bs.every((b,i)=>b.time===start+i*S)?bs:null,count:bs.length};
}

// Discord context only. No network, stateful tracker, order gate or entry callback.
export function evaluateSweepPumpPhase({event:e,coinRows=[],raw=null,now=Date.now()}={}){
 if(e?.direction!=='UPPER')return null;
 const out={version:SWEEP_PUMP_PHASE_VERSION,eventId:e.id,symbol:e.symbol,asOf:e.at,evaluatedAt:now,
  state:'UNKNOWN',observeOnly:true,affectsOrders:false,lookbackHours:24,features:null,sources:null,reason:''};
 if(!e.id||!finite(e.at)||!finite(e.markPrice)||e.markPrice<=0||now<e.at-1000||now-e.at>30000){out.reason='Sự kiện cũ hoặc MARK không hợp lệ; không phân loại lại lịch sử.';return out;}
 // Existing continuous MARK proof is stronger than a reconstructed 5m pattern.
 if(isSecondUpperSweep(e)){
  const s=e.secondSweep;
  return {...out,state:'REBOUND_BELOW_PEAK',features:{baselinePrice:s.baselinePrice,baselineAt:s.firstAt,previousPeak:s.previousPeak,peakAt:s.peakAt,trough:s.trough,troughAt:s.troughAt,pumpPct:s.pumpPct,pullbackPct:s.retracementPct,reboundPct:s.reboundPct,distanceBelowPeakPct:s.distanceBelowPeakPct},
   sources:{type:'CONTINUOUS_MARK_SECOND_SWEEP',firstEventId:s.firstEventId,firstAt:s.firstAt,maxGapMs:s.maxGapMs},reason:'Đã quan sát liên tục nhịp bơm, điều chỉnh rồi hồi; không đếm lại số thông báo.'};
 }
 const usable=raw?.symbol===e.symbol&&finite(raw.savedAt)&&raw.savedAt<=now;
 const mark=series(usable?raw.mark:[],e.at,e.symbol);
 const trade=mark.bars?null:series([...(usable?raw.price??[]:[]),...coinRows],e.at,e.symbol);
 const bars=mark.bars??trade?.bars;
 out.sources={type:mark.bars?'MARK_5M_CLOSE':'TRADE_5M_CLOSE',bars:bars?.length??Math.max(mark.count,trade?.count??0),closedAt:bars?.at(-1).end??null,rawSavedAt:usable?raw.savedAt:null,knownAt:now};
 if(!bars){out.reason=`Chưa đủ 288 nến5m đóng liên tục mới (có ${out.sources.bars}); không gọi cảnh báo đầu tiên là bơm đầu.`;return out;}
 const points=[...bars.map(b=>({at:b.end,price:b.close})),{at:e.at,price:e.markPrice}];
 let base=points[0],peak=points[0],cycle=null;
 for(const p of points.slice(1)){
  if(cycle&&p.at>cycle.peak.at&&p.price<cycle.trough.price)cycle.trough=p;
  if(p.price<base.price){base=p;peak=p;}
  else if(p.price>peak.price)peak=p;
  if(p.at>peak.at&&rise(peak.price,base.price)+1e-9>=10&&drop(p.price,peak.price)+1e-9>=5){
   if(!cycle||cycle.peak.at!==peak.at)cycle={base,peak,trough:p};
  }
 }
 const recentBase=bars.slice(-13).reduce((a,b)=>b.close<a.close?b:a),recentRisePct=rise(e.markPrice,recentBase.close);
 const rising=e.markPrice>=bars.at(-1).close||e.markPrice>bars.at(-4).close;
 if(cycle){
  const f={baselinePrice:cycle.base.price,baselineAt:cycle.base.at,previousPeak:cycle.peak.price,peakAt:cycle.peak.at,trough:cycle.trough.price,troughAt:cycle.trough.at,
   pumpPct:rise(cycle.peak.price,cycle.base.price),pullbackPct:drop(cycle.trough.price,cycle.peak.price),
   reboundPct:rise(e.markPrice,cycle.trough.price),distanceBelowPeakPct:drop(e.markPrice,cycle.peak.price),recentRisePct};
  out.features=f;
  if(f.reboundPct+1e-9>=2&&cycle.trough.at<e.at&&rising){out.state=e.markPrice>=f.previousPeak?'REBOUND_BREAKOUT':'REBOUND_BELOW_PEAK';out.reason='Có nhịp bơm ≥10%, điều chỉnh ≥5% rồi hồi ≥2% trước lúc quét.';}
  else out.reason='Đã có bơm và điều chỉnh, nhưng nhịp hiện tại chưa đạt điều kiện hồi ≥2% / giá đang nhích lên.';
 }else{
  out.features={recentRisePct,recentBasePrice:recentBase.close,recentBaseAt:recentBase.end,pumpPct:rise(e.markPrice,base.price),baselinePrice:base.price,baselineAt:base.at};
  if(recentRisePct+1e-9>=1&&rising){out.state='FIRST_PUSH';out.reason='Đang tăng ≥1% từ giá đóng thấp nhất một giờ gần đây; chưa thấy chu kỳ bơm ≥10% rồi điều chỉnh ≥5% trong đủ 24h quan sát.';}
  else out.reason='Đủ lịch sử nhưng nhịp tăng hiện tại chưa đủ rõ; không ép vào bơm đầu hoặc bơm hồi.';
 }
 return out;
}

export function validSweepPumpPhase(e,p){
 const meta=p?.version===SWEEP_PUMP_PHASE_VERSION&&e?.direction==='UPPER'&&p.symbol===e.symbol&&p.eventId===e.id&&p.asOf===e.at
  &&Object.hasOwn(SWEEP_PUMP_PHASE_TITLES,p.state)&&p.observeOnly===true&&p.affectsOrders===false
  &&finite(p.evaluatedAt)&&p.evaluatedAt>=e.at-1000&&p.evaluatedAt<=e.at+30000;
 if(!meta)return false;if(p.state==='UNKNOWN')return typeof p.reason==='string';
 const f=p.features,s=p.sources,near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<1e-7;
 const closed=s&&['MARK_5M_CLOSE','TRADE_5M_CLOSE'].includes(s.type)&&s.bars===288&&s.closedAt===Math.floor(e.at/S)*S-1;
 if(!f)return false;
 if(p.state==='FIRST_PUSH')return !!closed&&f.recentBasePrice>0&&finite(f.recentBaseAt)&&f.recentBaseAt<e.at
  &&near(f.recentRisePct,rise(e.markPrice,f.recentBasePrice))&&f.recentRisePct+1e-9>=1;
 const continuous=s?.type==='CONTINUOUS_MARK_SECOND_SWEEP'&&isSecondUpperSweep(e)&&s.firstEventId===e.secondSweep.firstEventId;
 return !!(closed||continuous)&&['baselinePrice','previousPeak','peakAt','trough','troughAt','pumpPct','pullbackPct','reboundPct','distanceBelowPeakPct'].every(k=>finite(f[k]))
  &&f.baselinePrice>0&&f.trough>0&&f.peakAt<f.troughAt&&f.troughAt<e.at
  &&near(f.pumpPct,rise(f.previousPeak,f.baselinePrice))&&f.pumpPct+1e-9>=10
  &&near(f.pullbackPct,drop(f.trough,f.previousPeak))&&f.pullbackPct+1e-9>=5
  &&near(f.reboundPct,rise(e.markPrice,f.trough))&&f.reboundPct+1e-9>=2
  &&near(f.distanceBelowPeakPct,drop(e.markPrice,f.previousPeak))
  &&(p.state==='REBOUND_BELOW_PEAK'?e.markPrice<f.previousPeak:e.markPrice>=f.previousPeak);
}
const number=n=>finite(n)?n.toFixed(2):'—',price=n=>finite(n)?Number(n.toPrecision(8)).toString():'—';
export function sweepPumpPhaseFields(e){
 const p=e.pumpPhase;if(!validSweepPumpPhase(e,p))return [];
 const f=p.features,lines=[`${p.state==='FIRST_PUSH'?'🟦':p.state.startsWith('REBOUND')?'🟣':'⚪'} ${SWEEP_PUMP_PHASE_TITLES[p.state]}`];
 if(p.state.startsWith('REBOUND'))lines.push(`Bơm ${number(f.pumpPct)}% → điều chỉnh ${number(f.pullbackPct)}% → hồi ${number(f.reboundPct)}%.`,
  `Đỉnh trước ${price(f.previousPeak)} · đáy điều chỉnh ${price(f.trough)} · ${f.distanceBelowPeakPct>=0?'dưới':'trên'} đỉnh ${number(Math.abs(f.distanceBelowPeakPct))}%.`);
 else if(p.state==='FIRST_PUSH')lines.push(`Tăng ${number(f.recentRisePct)}% từ nền một giờ gần đây. Bơm đầu chỉ trong cửa sổ 24h, không phải lần đầu của coin.`);
 lines.push(p.reason,'Dựa trên '+(p.sources?.type==='CONTINUOUS_MARK_SECOND_SWEEP'?'MARK quan sát liên tục':'giá đóng nến5m trước quét + MARK lúc quét')+'. Chỉ bổ sung bối cảnh Discord, chưa backtest riêng; không cấp lệnh LONG/SHORT.');
 return [{name:'NHỊP BƠM / QUÉT THANH KHOẢN',value:lines.join('\n')}];
}
