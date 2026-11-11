import {PUMP_TURN_VERSION,STEP,plannedPumpZones,livePumpZone} from './pump-turn-model.js';
export const EARLY_SHORT_VERSION='PUMP_TURN_EARLY_SHORT_FORMING_V1_20261111';
export const EARLY_LONG_VERSION='PUMP_TURN_EARLY_LONG_FORMING_V1_20261111';
export const EARLY_SHORT_POLICY=Object.freeze({minElapsedMs:60000,minQuote:50000,minVolumeRate:2,minSellPct:58,
 minBodyPct:.35,minBodyAtr:.4,maxBodyAtr:1.5,maxDecline60Pct:4,nearPct:.5,maxBelowSupportAtr:.5,
 freshMs:10000,sustainMs:10000,sendMaxAgeMs:20000,maxPerCycle:2});
const {minSellPct,maxDecline60Pct,maxBelowSupportAtr,...sharedPolicy}=EARLY_SHORT_POLICY;
export const EARLY_LONG_POLICY=Object.freeze({...sharedPolicy,minBuyPct:minSellPct,maxRise60Pct:maxDecline60Pct,maxAboveResistanceAtr:maxBelowSupportAtr});
const finite=Number.isFinite;
const mean=xs=>xs.reduce((s,v)=>s+v,0)/xs.length;
const fields=['version','symbol','side','state','asOf','expiresAt','observedAt','liveAt','livePrice','zoneLow','zoneHigh','gain60',
 'preBuyPct','preVolumeX','earlyElapsedMs','earlyQuote','earlyBodyPct','earlyBodyAtr','earlySupport','earlyAtr',
 'earlyFormingAt','earlyFirstAt','earlySustainMs','earlySamples'];
const fieldsFor=side=>side==='LONG'?fields.map(k=>k==='earlySupport'?'earlyResistance':k):fields;
const inputs=e=>Object.fromEntries(fieldsFor(e.side).map(k=>[k,e[k]??null]));
const inDirection=(side,buyPct,gain60)=>side==='LONG'
 ?buyPct>=EARLY_LONG_POLICY.minBuyPct&&buyPct<=100&&gain60>0&&gain60<EARLY_LONG_POLICY.maxRise60Pct
 :buyPct>=0&&buyPct<=100-EARLY_SHORT_POLICY.minSellPct&&gain60<0&&gain60>-EARLY_SHORT_POLICY.maxDecline60Pct;
function label(i){
 const p=EARLY_SHORT_POLICY;
 if(i.version!==PUMP_TURN_VERSION||!['LONG','SHORT'].includes(i.side)||!['NEAR','IN_ZONE'].includes(i.state)
  ||fieldsFor(i.side).filter(k=>!['version','symbol','side','state'].includes(k)).some(k=>!finite(i[k])))return 'UNKNOWN';
 if(i.asOf%STEP!==STEP-1||i.earlyFormingAt!==i.asOf+1||i.expiresAt!==i.asOf+STEP+1
  ||i.observedAt>=i.expiresAt||i.observedAt-i.earlyFormingAt!==i.earlyElapsedMs
  ||i.earlyElapsedMs<p.minElapsedMs||i.earlyElapsedMs>=STEP||i.liveAt>i.observedAt+1000||i.observedAt-i.liveAt>p.freshMs
  ||i.earlyFirstAt>i.observedAt||i.earlySustainMs!==i.observedAt-i.earlyFirstAt||i.earlySustainMs<p.sustainMs||i.earlySamples<2)return 'UNKNOWN';
 if(i.livePrice<=0||i.zoneLow<=0||i.zoneHigh<=i.zoneLow||i.earlyAtr<=0
  ||!inDirection(i.side,i.preBuyPct,i.gain60)||i.preVolumeX<p.minVolumeRate||i.earlyQuote<p.minQuote
  ||i.earlyBodyPct<p.minBodyPct||i.earlyBodyAtr<p.minBodyAtr||i.earlyBodyAtr>p.maxBodyAtr)return 'UNKNOWN';
 const long=i.side==='LONG',level=long?i.earlyResistance:i.earlySupport,edge=long?i.zoneLow:i.zoneHigh;
 const extension=long?i.zoneHigh-level:level-i.zoneLow;
 if(edge!==level||Math.abs(extension-p.maxBelowSupportAtr*i.earlyAtr)>i.livePrice*1e-10)return 'UNKNOWN';
 const price=i.livePrice,passedBand=long?price>i.zoneHigh:price<i.zoneLow;
 const insideBand=price>=i.zoneLow&&price<=i.zoneHigh;
 const isNear=!passedBand&&!insideBand&&Math.abs(price-edge)/price*100<=p.nearPct+1e-9;
 if(i.state==='IN_ZONE'? !insideBand:!isNear)return 'UNKNOWN';
 return long?'EARLY_BUY':'EARLY_SELL';
}
export function buildEarlyFlowZone(symbol,closed,raw,point,now,side){
 const direction=side??(point?.price>Number(raw?.open)?'LONG':'SHORT');
 const long=direction==='LONG',sign=long?1:-1;
 const p=EARLY_SHORT_POLICY;
 if(closed.length<72||!raw||raw.isClosed!==false||!point||![point.price,point.at,now].every(finite)
  ||point.price<=0||point.at>now+1000||now-point.at>p.freshMs)return null;
 const f={t:+raw.openTime,end:+raw.closeTime,o:+raw.open,h:+raw.high,l:+raw.low,c:+raw.close,q:+raw.quoteVolume,buy:+raw.takerBuyQuoteVolume};
 if(Object.values(f).some(v=>!finite(v))||f.t!==Math.floor(now/STEP)*STEP||f.end!==f.t+STEP-1
  ||closed.at(-1).end!==f.t-1||f.q<=0||f.buy<0||f.buy>f.q||Math.min(f.o,f.h,f.l,f.c)<=0
  ||f.h<Math.max(f.o,f.c)||f.l>Math.min(f.o,f.c)||Math.abs(f.c-point.price)>point.price*1e-8)return null;
 const elapsed=now-f.t;if(elapsed<p.minElapsedMs||elapsed>=STEP)return null;
 const bodyPct=sign*(point.price/f.o-1)*100;
 const buyPct=f.buy/f.q*100,gain60=(point.price/closed.at(-13).c-1)*100;
 if(bodyPct<p.minBodyPct||f.q<p.minQuote||!inDirection(direction,buyPct,gain60)
  ||sign*(point.price-closed.at(-1).c)<=0)return null;
 const pre=closed.slice(-72),base=plannedPumpZones(symbol,pre).find(z=>z.side===direction);
 if(!base)return null;
 const atr=mean(pre.slice(-14).map((b,j)=>{const prev=pre[pre.length-14+j-1];return Math.max(b.h-b.l,Math.abs(b.h-prev.c),Math.abs(b.l-prev.c));}));
 const baseline=mean(pre.slice(-20).map(b=>b.q));
 if(!(atr>0&&baseline>0))return null;
 const recent=pre.slice(-3);
 const level=long?Math.max(...recent.map(b=>b.h))*1.001:Math.min(...recent.map(b=>b.l))*.999;
 const bodyAtr=sign*(point.price-f.o)/atr,rate=f.q/(baseline*elapsed/STEP);
 if(bodyAtr<p.minBodyAtr||bodyAtr>p.maxBodyAtr||rate<p.minVolumeRate)return null;
 const flowFlags=long?{longFlowEarlyOnly:true,earlyResistance:level}
  :{shortFlowOnly:true,shortFlowEarlyOnly:true,earlySupport:level};
 const row=livePumpZone({...base,...flowFlags,id:'pump-turn-early-'+direction.toLowerCase()+':'+symbol+':'+f.t,
  zoneHigh:long?level+EARLY_LONG_POLICY.maxAboveResistanceAtr*atr:level,
  zoneLow:long?level:level-p.maxBelowSupportAtr*atr,contextEligible:true,
  gain60,preBuyPct:buyPct,preVolumeX:rate,earlyElapsedMs:elapsed,earlyQuote:f.q,earlyBodyPct:bodyPct,earlyBodyAtr:bodyAtr,
  earlyAtr:atr,earlyFormingAt:f.t,observeOnly:true,affectsOrders:false,
  contextChecks:[
    {label:'Nến5m đang chạy ≥60 giây',pass:true,value:elapsed/1000,unit:' giây'},
    {label:'Tốc độ volume ≥2× nền20',pass:true,value:rate,unit:'×'},
    {label:long?'Taker mua ≥58%':'Taker bán ≥58%',pass:true,value:long?buyPct:100-buyPct,unit:'%'},
    {label:long?'Thân tăng 0,4–1,5 ATR':'Thân giảm 0,4–1,5 ATR',pass:true,value:bodyAtr,unit:' ATR'},
  ]},
  point,now,p.nearPct);
 return row.alertEligible?row:null;
}
export const buildEarlyShortZone=(symbol,closed,raw,point,now)=>buildEarlyFlowZone(symbol,closed,raw,point,now,'SHORT');
export const isEarlyFlow=e=>e?.shortFlowEarlyOnly===true||e?.longFlowEarlyOnly===true;
export function captureEarlyFlowContext(e){
 const snapshot=inputs(e);
 const version=e.side==='LONG'?EARLY_LONG_VERSION:EARLY_SHORT_VERSION;
 return {version,eventId:e.id,symbol:e.symbol,inputs:snapshot,label:label(snapshot),observeOnly:true,affectsOrders:false};
}
export const captureEarlyShortContext=captureEarlyFlowContext;
export function earlyFlowContextView(e){
 const long=e?.side==='LONG',q=long?e?.earlyLongContext:e?.earlyShortContext;
 const version=long?EARLY_LONG_VERSION:EARLY_SHORT_VERSION;
 const matchesSide=long?e.longFlowEarlyOnly===true&&e.shortFlowEarlyOnly!==true
  :e?.shortFlowOnly===true&&e.shortFlowEarlyOnly===true&&e.longFlowEarlyOnly!==true;
 const valid=matchesSide&&q?.version===version&&q.eventId===e.id&&q.symbol===e.symbol
  &&q.observeOnly===true&&q.affectsOrders===false&&q.inputs
  &&fieldsFor(e.side).every(k=>k==='state'&&['EXPIRED','WAIT_PRICE'].includes(e.state)?true:(e[k]??null)===q.inputs[k])
  &&q.label===label(q.inputs);
 const i=valid?q.inputs:null,result=valid?q.label:'UNKNOWN';
 const pressure=long?'MUA':'BÁN';
 const level=long?'kháng cự':'hỗ trợ';
 return {valid:!!valid,label:result,title:result==='UNKNOWN'?'THIẾU DỮ LIỆU':'ÁP LỰC '+pressure+' ĐANG HÌNH THÀNH',
  gain60:i?.gain60??null,buyPct:i?.preBuyPct??null,volumeX:i?.preVolumeX??null,
  elapsedMs:i?.earlyElapsedMs??null,quote:i?.earlyQuote??null,bodyPct:i?.earlyBodyPct??null,bodyAtr:i?.earlyBodyAtr??null,
  note:'Nến 5 phút đang chạy. Volume quy đổi theo thời gian đã trôi. Chờ giá phá '+level+' và kiểm tra lại vùng.'};
}
export const earlyShortContextView=earlyFlowContextView;
