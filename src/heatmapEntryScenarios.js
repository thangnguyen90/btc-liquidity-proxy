export const HEATMAP_SCENARIO_VERSION='HEATMAP_CONFLUENCE_SCENARIOS_V1_20261018';
export const PROFILE_RATIO=1.0025;
const sum=a=>a.reduce((s,v)=>s+v,0),mean=a=>a.length?sum(a)/a.length:0;
export function heatmapPoolProfile(frame){
  const bins=new Map();
  for(const p of frame.pools){const k=Math.round(Math.log(p.price)/Math.log(PROFILE_RATIO));bins.set(k,(bins.get(k)??0)+p.weight);}
  return {at:frame.candle.end,oiFresh:!!frame.oiFresh,mark:frame.mark,bins:[...bins.entries()].sort((a,b)=>a[0]-b[0])};
}
function normalized(profile){const max=Math.max(0,...profile.bins.map(r=>r[1]));return new Map(profile.bins.map(([k,w])=>[k,max>0?w/max:0]));}
export function heatmapConsensusZones(m1,m3,at,step,price){
  const prior1=m1.profiles.filter(p=>p.at<=at).slice(-3),prior3=m3.profiles.filter(p=>p.at<=at).slice(-3);
  if(prior1.length!==3||prior3.length!==3)return {status:'MISSING_PROFILES',zones:[]};
  if(prior1.some((p,i)=>p.at!==at-(2-i)*step||prior3[i].at!==p.at))return {status:'MISALIGNED_PROFILES',zones:[]};
  if(prior3.some(p=>!p.oiFresh))return {status:'STALE_OI',zones:[]};
  const maps=[...prior1,...prior3].map(normalized),keys=[...maps[0].keys()].filter(k=>maps.every(m=>(m.get(k)??0)>=.35));
  const groups=[];
  for(const k of keys.sort((a,b)=>a-b)){const g=groups.at(-1);if(g&&k===g.at(-1)+1&&g.length<6)g.push(k);else groups.push([k]);}
  const zones=groups.map(g=>({low:PROFILE_RATIO**(g[0]-.5),high:PROFILE_RATIO**(g.at(-1)+.5),
    overlapStrength:mean(g.map(k=>Math.min(...maps.map(m=>m.get(k)??0))))*100,establishedAt:at-2*step,
    asOf:at,persistenceBars:3})).filter(z=>z.high<price*.999||z.low>price*1.001);
  return {status:'OK',zones};
}
const check=(label,pass,value=null)=>({label,pass:!!pass,value});
function empty(reason,extra={}){return {version:HEATMAP_SCENARIO_VERSION,observeOnly:true,affectsOrders:false,status:'UNAVAILABLE',reason,plans:[],zones:[],...extra};}
export function deriveHeatmapEntryScenarios({models=[],candles=[],step,now=Date.now(),symbol,range}={}){
  const a=models.find(m=>m.model===1&&m.status==='OK')?.data,b=models.find(m=>m.model===3&&m.status==='OK')?.data;
  if(!a||!b||a.source!=='BINANCE_LOCAL'||b.source!=='BINANCE_LOCAL')return empty('Cần đủ hai model tự tính từ Binance; chưa lập kịch bản.',{symbol,range});
  if(!Array.isArray(a.profiles)||!Array.isArray(b.profiles)||candles.length<74)return empty('Thiếu lịch sử để xác định vùng trước nến xét.',{symbol,range});
  const c=candles.at(-1),prior=candles.slice(0,-1),previous=prior.at(-1);
  if(a.symbol!==symbol||b.symbol!==symbol||a.range!==range||b.range!==range||a.step!==step||b.step!==step||a.end!==c.end+1||b.end!==c.end+1)return empty('Hai model không trùng coin, khung hoặc mốc nến; chưa lập kịch bản.',{symbol,range});
  if(!Number.isFinite(step)||step<=0||c.end>=now||now-c.end>step+120000)return empty('Nến đang xét chưa đóng hoặc đã cũ. Hãy tải lại dữ liệu.',{symbol,range});
  const merged=heatmapConsensusZones(a,b,previous.end,step,previous.close);
  if(merged.status!=='OK')return empty(merged.status==='STALE_OI'?'OI thiếu hoặc cũ ở các nến mới nhất; chưa lập kịch bản.':'Hai model chưa có ba nến đồng bộ để xác định vùng.',{symbol,range});
  const zones=merged.zones,upper=zones.filter(z=>z.low>previous.close).sort((x,y)=>x.low-y.low),lower=zones.filter(z=>z.high<previous.close).sort((x,y)=>y.high-x.high);
  const baseline=mean(prior.slice(-20).map(r=>r.quoteVolume)),volX=baseline>0?c.quoteVolume/baseline:null;
  const buy=Number.isFinite(c.takerBuyQuoteVolume)&&c.quoteVolume>0?c.takerBuyQuoteVolume/c.quoteVolume*100:null;
  const tr=prior.slice(-20).map((r,i,rs)=>Math.max(r.high-r.low,Math.abs(r.high-(rs[i-1]?.close??r.open)),Math.abs(r.low-(rs[i-1]?.close??r.open))));
  const atr=mean(tr),buffer=atr*.2,preBreak=prior.slice(0,-1),resistance=Math.max(...preBreak.slice(-12).map(r=>r.high)),support=Math.min(...preBreak.slice(-3).map(r=>r.low));
  const wave=prior.slice(-72),peak=Math.max(...wave.map(r=>r.high)),pi=wave.findIndex(r=>r.high===peak),base=pi>0?Math.min(...wave.slice(0,pi).map(r=>r.close)):null;
  const pumpPct=base?(peak/base-1)*100:0,dropPct=(1-c.close/peak)*100,span=c.high-c.low;
  const lowerWick=span>0?(Math.min(c.open,c.close)-c.low)/span:0,upperWick=span>0?(c.high-Math.max(c.open,c.close))/span:0;
  const volumeCheck=()=>check('Volume nến ≥1,3× nền20',volX!=null&&volX>=1.3,volX);
  function plan({id,title,side,zone,trigger,stop,checks}){
    const long=side==='LONG',priceChecks=checks.every(x=>x.pass),referenceEntry=zone?(priceChecks?c.close:trigger):null;
    const targetZone=referenceEntry>0?(long?upper:lower).find(z=>long?z.low>referenceEntry*1.001:z.high<referenceEntry*.999):null;
    const target=targetZone?(long?targetZone.low:targetZone.high):null;
    const cost=referenceEntry>0?referenceEntry*.0014:null,risk=referenceEntry>0?(long?referenceEntry-stop:stop-referenceEntry):null,reward=target==null?null:long?target-referenceEntry:referenceEntry-target;
    const rr=risk>0&&reward>cost?(reward-cost)/(risk+cost):null;
    const all=[check('Có cụm hai model đồng thuận tại vùng xét',!!zone),check('Volume nến ≥100.000 USDT',c.quoteVolume>=100000),...checks,
      check('Mức vô hiệu đúng phía của giá tham chiếu',risk>0),check('Có cụm mục tiêu phía đối diện',target!=null),check('R:R sau chi phí giả định ≥1,5',rr!=null&&rr>=1.5,rr)];
    const met=all.every(x=>x.pass);
    return {id,title,side,observeOnly:true,state:met?'CONDITIONS_MET':!zone?'WAIT_ZONE':'WAIT',zone:zone??null,triggerPrice:trigger,
      referenceEntry,invalidationPrice:zone?stop:null,targetPrice:target,targetZone:targetZone??null,rewardRisk:rr,riskPct:risk>0?risk/referenceEntry*100:null,
      checks:all,missing:all.filter(x=>!x.pass).map(x=>x.label),triggeredAt:met?c.end:null};
  }
  const tolerance=Math.max(previous.close*.002,atr*.5);
  const longZone=zones.find(z=>resistance>=z.low-tolerance&&resistance<=z.high+tolerance);
  const shortZone=zones.find(z=>support>=z.low-tolerance&&support<=z.high+tolerance);
  const longContinuation=plan({id:'CONTINUATION_LONG',title:'LONG tiếp diễn · vượt vùng rồi giữ',side:'LONG',zone:longZone,
    trigger:resistance*1.001,stop:Math.min(previous.low,c.low,resistance)-buffer,checks:[
      check('Nến trước đã đóng vượt đỉnh12 nến',previous.close>resistance*1.001),
      check('Nến xét retest vùng và đóng giữ phía trên',c.low<=resistance*1.003&&c.close>resistance*1.001&&c.close>c.open),
      volumeCheck(),check('Taker mua ≥55%',buy!=null&&buy>=55,buy)]});
  const shortContinuation=plan({id:'PUMP_FADE_SHORT',title:'SHORT sau bơm · mất vùng, hồi thất bại',side:'SHORT',zone:shortZone,
    trigger:support*.999,stop:Math.max(previous.high,c.high,support)+buffer,checks:[
      check('Sóng tăng có nền trước đỉnh ≥15% trong72 nến',pumpPct>=15,pumpPct),check('Trả từ đỉnh 3–20%',dropPct>=3&&dropPct<=20,dropPct),
      check('Nến trước đóng thủng đáy3 nến',previous.close<support*.999),
      check('Nến xét hồi chạm vùng rồi đóng đỏ phía dưới',c.high>=support*.997&&c.close<support*.999&&c.close<c.open),
      volumeCheck(),check('Taker bán ≥55%',buy!=null&&buy<=45,buy==null?null:100-buy)]});
  const supportZone=lower[0],resistanceZone=upper[0];
  const reclaim=plan({id:'SWEEP_RECLAIM_LONG',title:'LONG quét đáy · đóng lấy lại vùng',side:'LONG',zone:supportZone,
    trigger:supportZone?supportZone.high*1.001:null,stop:(supportZone?Math.min(supportZone.low,c.low):c.low)-buffer,checks:[
      check('Quét qua mép dưới cụm đã có',supportZone&&c.low<=supportZone.low),
      check('Nến xanh đóng lại trên cụm',supportZone&&c.close>supportZone.high&&c.close>c.open),check('Râu dưới ≥35% biên nến',lowerWick>=.35,lowerWick*100),
      volumeCheck(),check('Taker mua ≥55%',buy!=null&&buy>=55,buy)]});
  const reject=plan({id:'SWEEP_REJECT_SHORT',title:'SHORT quét đỉnh · đóng trả xuống',side:'SHORT',zone:resistanceZone,
    trigger:resistanceZone?resistanceZone.low*.999:null,stop:(resistanceZone?Math.max(resistanceZone.high,c.high):c.high)+buffer,checks:[
      check('Quét qua mép trên cụm đã có',resistanceZone&&c.high>=resistanceZone.high),
      check('Nến đỏ đóng lại dưới cụm',resistanceZone&&c.close<resistanceZone.low&&c.close<c.open),check('Râu trên ≥35% biên nến',upperWick>=.35,upperWick*100),
      volumeCheck(),check('Taker bán ≥55%',buy!=null&&buy<=45,buy==null?null:100-buy)]});
  const plans=[longContinuation,shortContinuation,reclaim,reject],met=plans.filter(p=>p.state==='CONDITIONS_MET'),sides=new Set(met.map(p=>p.side));
  return {version:HEATMAP_SCENARIO_VERSION,status:'OK',observeOnly:true,affectsOrders:false,symbol,range,
    interval:a.inputs.interval,asOf:c.end,zonesAsOf:previous.end,referencePrice:c.close,volumeRatio:volX,takerBuyPct:buy,atr,
    preference:sides.size===1?[...sides][0]:sides.size>1?'CONFLICT':'WAIT',
    plans,zones:[...upper.slice(0,3),...lower.slice(0,3)].map(z=>({...z,side:z.low>previous.close?'ABOVE':'BELOW'})),
    notes:['Hai model dùng chung giả định đòn bẩy, không phải hai bằng chứng độc lập.','Ngưỡng ghép chưa backtest riêng; đủ điều kiện quan sát không phải xác suất thắng.'],
    policy:{minPersistenceBars:3,minIntensityEachModelPct:35,minRewardRisk:1.5,roundtripCostPct:.14,zoneBinPct:.25}};
}
