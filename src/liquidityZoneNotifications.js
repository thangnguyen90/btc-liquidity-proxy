import {historicalDirectionText} from './liquidityZoneObservation.js';
export const ZONE_NOTIFICATION_VERSION='LIQUIDITY_ZONE_NOTIFICATIONS_V2_FROZEN_DIRECTION_20261005';
export const ZONE_NOTIFICATION_TYPE='BINANCE_LIQUIDITY_ZONE_LIFECYCLE';
export const CONTRACT_RISK_NOTIFICATION_TYPE='BINANCE_FUTURES_CONTRACT_RISK';
const RETAIN_MS=7*86_400_000;
const text=(v,max=240)=>String(v??'').slice(0,max);
const number=(v,fallback=0)=>v!=null&&Number.isFinite(Number(v))?Number(v):fallback;
export function notificationDirectionNote(note,notifiedAt){
  const observedAt=number(note?.observedAt);
  // Socket notes can be sampled at eventTime+1ms to include the just-closed bar.
  if(!observedAt||observedAt>notifiedAt+1)return null;
  const movement=m=>{
    const closeAt=number(m?.closeAt),changePct=number(m?.changePct,null);
    const direction=['UP','DOWN','FLAT'].includes(m?.direction)&&closeAt>0&&closeAt<observedAt&&changePct!=null?m.direction:'UNKNOWN';
    return {direction,closeAt:direction==='UNKNOWN'?null:closeAt,changePct:direction==='UNKNOWN'?null:changePct};
  };
  return {version:text(note.version,100),observedAt,
    target:['UP','DOWN','INSIDE'].includes(note.target)?note.target:'UNKNOWN',
    coin:{'5m':movement(note.coin?.['5m']),'15m':movement(note.coin?.['15m'])},
    btc:{'5m':movement(note.btc?.['5m']),'15m':movement(note.btc?.['15m'])}};
}
export function zoneNotificationUrl({symbol,watchId,eventId,attemptKey,riskId}={}){
  const q=new URLSearchParams();
  if(symbol)q.set('symbol',text(symbol,40));
  if(watchId)q.set('watch',text(watchId,100));
  if(attemptKey)q.set('attempt',text(attemptKey,100));
  if(eventId)q.set('notification',text(eventId));
  if(riskId)q.set('contractRisk',text(riskId,100));
  return `/liquidity-zone-manager?${q}`;
}
export function zoneNotificationRecord(payload,{now=Date.now(),delivery=null,legacy=false}={}){
  const eventId=text(payload.eventId);
  const risk=payload.signalType===CONTRACT_RISK_NOTIFICATION_TYPE;
  if((payload.signalType!==ZONE_NOTIFICATION_TYPE&&!risk)||!eventId)return null;
  const attemptKey=risk?'':text(payload.attemptKey??(/^main-distance:([^:]+):/.exec(eventId)?.[1]??''),100);
  const watchId=risk?'':text(payload.watchId??(/^zone:([^:]+):/.exec(eventId)?.[1]??''),100);
  const notifiedAt=number(payload.notifiedAt,now);
  const row={eventId,signalType:payload.signalType,kind:risk?'RISK':attemptKey?'ENTRY':'ZONE',
    ...(risk?{riskId:text(payload.riskId,100)}:{}),
    symbol:text(payload.symbol,40),watchId,attemptKey,title:text(payload.title,200),body:text(payload.body,800),
    notifiedAt,legacy,directionNote:risk?null:notificationDirectionNote(payload.directionNote,notifiedAt),
    delivery:delivery?{attempted:number(delivery.attempted),sent:number(delivery.sent),failed:number(delivery.failed),
      removed:number(delivery.removed),skipped:text(delivery.skipped,80)||null,error:text(delivery.error,180)||null}:null};
  row.url=zoneNotificationUrl(row);return row;
}
export function zoneNotificationDelivery(row){
  if(row.delivery?.sent>0)return row.delivery.failed>0?'partial':'sent';
  if(row.delivery?.error||row.delivery?.failed>0)return 'failed';
  if(row.delivery?.skipped)return 'skipped';
  if(row.delivery)return 'no-device';
  return 'unknown';
}
export function buildZoneNotificationHistory({stored=[],events=[],attempts=[],riskAlerts=[],now=Date.now()}={}){
  const map=new Map();
  for(const row of stored){
    const safe=zoneNotificationRecord(row,{now,delivery:row.delivery,legacy:row.legacy===true});
    if(safe)map.set(safe.eventId,safe);
  }
  for(const alert of riskAlerts){
    const row=zoneNotificationRecord(alert,{now,delivery:alert.delivery});
    if(row&&!map.has(row.eventId))map.set(row.eventId,row);
  }
  for(const e of events){
    if((!e.pushEnabled&&!e.delivery)||!(number(e.at)>0))continue;
    const row=zoneNotificationRecord({signalType:ZONE_NOTIFICATION_TYPE,eventId:e.eventId,symbol:e.symbol,
      watchId:e.watchId,notifiedAt:e.at,directionNote:e.directionNote,title:`${e.symbol} · ${e.state}`,
      body:`${e.role} ${e.zone?.low} – ${e.zone?.high} · giá ${e.price}${number(e.candleAt)>0?` · nến 5m ${new Date(Number(e.candleAt)).toISOString()}`:''} · ${historicalDirectionText(e.directionNote)}`},
      {now,delivery:e.delivery,legacy:true});
    if(row&&!map.has(row.eventId))map.set(row.eventId,row);
  }
  for(const a of attempts){
    if(!a.key||!(number(a.at)>0)||(!a.push&&a.status==='SUBMITTING'))continue;
    const eventId=a.push?.eventId??`main-distance:${a.key}:legacy`;
    const row=zoneNotificationRecord({signalType:ZONE_NOTIFICATION_TYPE,eventId,symbol:a.symbol,watchId:a.watchId,
      attemptKey:a.key,notifiedAt:a.at,directionNote:a.directionNote,title:`MAIN KILL ≥2.5% · ${a.side} ${a.symbol}`,
      body:`${a.status} · 2 USDT ×5x · TP ${a.takeProfitPrice} · SL −30% ROE${a.error?` · ${a.error}`:''} · ${historicalDirectionText(a.directionNote)}`},
      {now,delivery:a.push,legacy:true});
    if(row&&!map.has(row.eventId))map.set(row.eventId,row);
  }
  const attemptNotes=new Map(attempts.map(a=>[a.key,a]));
  const eventNotes=new Map(events.map(e=>[e.eventId,e]));
  for(const row of map.values()){
    if(row.kind==='RISK'||row.directionNote)continue;
    const saved=row.attemptKey?attemptNotes.get(row.attemptKey):eventNotes.get(row.eventId);
    // Enrich old Push history from the exact frozen event, never today's market or another watch.
    if(saved?.symbol===row.symbol)row.directionNote=notificationDirectionNote(saved.directionNote,row.notifiedAt);
  }
  return [...map.values()].filter(r=>r.notifiedAt>0&&now-r.notifiedAt<=RETAIN_MS)
    .sort((a,b)=>b.notifiedAt-a.notifiedAt||a.eventId.localeCompare(b.eventId)).slice(0,1000);
}
export function zoneNotificationPage(rows,params=new URLSearchParams()){
  const needle=text(params.get('search'),80).trim().toUpperCase(),kind=params.get('kind'),delivery=params.get('delivery');
  const matches=rows.filter(r=>(!needle||`${r.symbol} ${r.title} ${r.body}`.toUpperCase().includes(needle))
    && (!kind||kind==='all'||r.kind===kind)&&(!delivery||delivery==='all'||zoneNotificationDelivery(r)===delivery));
  const size=Math.min(100,Math.max(1,Math.trunc(number(params.get('size'),30)))),pages=Math.max(1,Math.ceil(matches.length/size));
  const page=Math.min(pages,Math.max(1,Math.trunc(number(params.get('page'),1))));
  return {version:ZONE_NOTIFICATION_VERSION,generatedAt:Date.now(),retentionDays:7,total:matches.length,page,pages,
    items:matches.slice((page-1)*size,page*size)};
}
