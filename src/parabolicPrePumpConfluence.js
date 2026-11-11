import { heatmapConsensusZones } from './heatmapEntryScenarios.js';
import { explainRisingVolumeRatio } from './risingVolumeRatioDiagnostics.js';

export const PRE_PUMP_CONFLUENCE_VERSION = 'PRE_PUMP_MODEL13_TOP_ACCOUNT_V1_20261025';
export const PRE_PUMP_CONFLUENCE_RULE = Object.freeze({
  range: '24h', step: 300000, persistenceBars: 3, intensityPct: 35,
  maxSupportDistancePct: 2, maxTargetDistancePct: 5, minTargetDistancePct: 1,
  minRewardRisk: 1.5, costPct: .14, atrBuffer: .2,
  ratioPeriod: '5m', ratioFlatMinutes: 30, ratioFlatPct: 5, ratioDropPct: 10, ratioTransitionMinutes: 30,
});
const unavailable = reason => ({ status: 'UNAVAILABLE', pass: null, reason });
const pct = (a,b) => (a/b-1)*100;

function assessHeatmap(e,bundle,rows,now) {
  const rule=PRE_PUMP_CONFLUENCE_RULE,step=rule.step;
  const a=bundle?.models?.find(m=>m.model===1&&m.status==='OK')?.data;
  const b=bundle?.models?.find(m=>m.model===3&&m.status==='OK')?.data;
  if(!a||!b)return unavailable('MODEL13_MISSING');
  const asOf=e.candleAt-1;
  for(const m of [a,b]) {
    if(m.source!=='BINANCE_LOCAL'||m.symbol!==e.symbol||m.range!=='24h'||m.step!==step
      ||!Number.isFinite(m.end)||m.end<e.candleAt||m.end>Math.floor(now/step)*step
      ||!Array.isArray(m.profiles))return unavailable('MODEL13_MISMATCH_OR_STALE');
    const profiles=m.profiles.filter(p=>p.at<=asOf).slice(-3);
    if(profiles.length!==3||profiles.some((p,i)=>p.at!==asOf-(2-i)*step||p.mark!==true||p.oiFresh!==true
      ||!Array.isArray(p.bins)||p.bins.some(r=>!Array.isArray(r)||!Number.isInteger(r[0])||!Number.isFinite(r[1])||r[1]<0)))
      return unavailable('MODEL13_PROFILES_MARK_OI_MISSING');
  }
  if(a.end!==b.end)return unavailable('MODEL13_MISMATCH_OR_STALE');
  const prior=(rows??[]).filter(r=>r.closeTime<=asOf&&r.isClosed!==false).slice(-21);
  if(prior.length<21||prior.at(-1).closeTime!==asOf||prior.some((r,i)=>
    ![r.open,r.high,r.low,r.close].every(v=>Number.isFinite(v)&&v>0)
    ||r.high<Math.max(r.open,r.close)||r.low>Math.min(r.open,r.close)
    ||r.closeTime!==r.openTime+step-1||(i&&r.openTime!==prior[i-1].openTime+step)))return unavailable('MODEL13_PRICE_HISTORY_MISSING');
  const reference=prior.at(-1).close;
  // Use ONLY profiles before the candidate candle, never its own volume/OI-created pools.
  const merged=heatmapConsensusZones(a,b,asOf,step,reference);
  if(merged.status!=='OK')return unavailable(merged.status);
  const support=merged.zones.filter(z=>z.high<Math.min(reference,e.price)*.999).sort((x,y)=>y.high-x.high)[0]??null;
  const target=merged.zones.filter(z=>z.low>Math.max(reference,e.price)*1.001).sort((x,y)=>x.low-y.low)[0]??null;
  const trs=prior.slice(1).map((r,i)=>Math.max(r.high-r.low,Math.abs(r.high-prior[i].close),Math.abs(r.low-prior[i].close)));
  const atr=trs.reduce((s,v)=>s+v,0)/trs.length;
  const stop=support?support.low-atr*rule.atrBuffer:null;
  const risk=stop>0?e.price-stop:null,reward=target?target.low-e.price:null,cost=e.price*rule.costPct/100;
  const rewardRisk=risk>0&&reward>cost?(reward-cost)/(risk+cost):null;
  const supportDistancePct=support?pct(e.price,support.high):null,targetDistancePct=target?pct(target.low,e.price):null;
  const checks=[
    {key:'LOWER_CLUSTER',pass:!!support},
    {key:'NEAR_LOWER_CLUSTER',pass:supportDistancePct!=null&&supportDistancePct<=rule.maxSupportDistancePct},
    {key:'LOWER_CLUSTER_HELD',pass:!!support&&e.low>=support.low&&e.price>support.high},
    {key:'UPPER_TARGET_1_TO_5_PCT',pass:targetDistancePct!=null&&targetDistancePct>=rule.minTargetDistancePct&&targetDistancePct<=rule.maxTargetDistancePct},
    {key:'TARGET_NOT_ALREADY_SWEPT',pass:!!target&&e.high<target.low},
    {key:'NET_RR_1_5',pass:rewardRisk!=null&&rewardRisk>=rule.minRewardRisk},
  ];
  const pass=checks.every(c=>c.pass);
  return {status:pass?'PASS':'FAIL',pass,reason:pass?'PASS':checks.filter(c=>!c.pass).map(c=>c.key).join(', '),
    symbol:e.symbol,asOf,modelsEnd:a.end,referencePrice:e.price,support,target,
    supportDistancePct,targetDistancePct,invalidationPrice:stop,rewardRisk,atr,checks,
    note:'Cụm mô phỏng, không phải hỗ trợ/kháng cự hay thanh lý đã xác nhận.'};
}

function assessRatio(e,ratio,now) {
  if(!ratio||ratio.source!=='BINANCE_TOP_TRADER_ACCOUNT_RATIO'||ratio.symbol!==e.symbol||ratio.period!=='5m'
    ||ratio.status!=='OK'||!Number.isFinite(ratio.fetchedAt)||ratio.fetchedAt>now||now-ratio.fetchedAt>60000
    ||!Array.isArray(ratio.rows))return unavailable('TOP_ACCOUNT_RATIO_MISSING_OR_STALE');
  const rows=ratio.rows.filter(r=>r.timestamp<=e.at).slice(-20);
  if(rows.some(r=>![r.longAccount,r.shortAccount,r.longShortRatio,r.timestamp].every(Number.isFinite)
    ||r.longAccount<0||r.shortAccount<=0||r.longAccount>1||r.shortAccount>1
    ||Math.abs(r.longAccount+r.shortAccount-1)>.001
    ||Math.abs(r.longAccount/r.shortAccount-r.longShortRatio)>Math.max(.002,r.longShortRatio*.005)))return unavailable('TOP_ACCOUNT_RATIO_INVALID');
  const detail=explainRisingVolumeRatio(rows,{side:'LONG',asOf:e.at,source:'PRE_PUMP_ALERT',fetchedAt:ratio.fetchedAt});
  const last=rows.at(-1);
  return {...detail,status:detail.state,rows,
    longAccountPct:last?last.longAccount*100:null,shortAccountPct:last?last.shortAccount*100:null};
}

export function evaluatePrePumpConfluence({event,bundle,rows,ratio,now=Date.now()}={}) {
  if(!event||event.stage!=='PRE_PUMP_WATCH'||![event.at,event.candleAt,event.price,event.high,event.low].every(Number.isFinite)
    ||event.at>now||event.price<=0)return {version:PRE_PUMP_CONFLUENCE_VERSION,...unavailable('INVALID_PRE_PUMP_EVENT')};
  const heatmap=assessHeatmap(event,bundle,rows,now),topAccountRatio=assessRatio(event,ratio,now);
  const pass=heatmap.pass===true&&topAccountRatio.pass===true;
  const status=pass?'PASS':[heatmap,topAccountRatio].some(p=>p.status==='UNAVAILABLE')?'UNAVAILABLE':'FAIL';
  return {version:PRE_PUMP_CONFLUENCE_VERSION,status,pass,symbol:event.symbol,eventId:event.id,
    evaluatedAt:now,asOf:event.at,observeOnly:true,affectsOrders:false,heatmap,topAccountRatio,
    reason:pass?'PASS':`Model1/3: ${heatmap.reason}; ratio: ${topAccountRatio.reason}`};
}
