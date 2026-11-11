import {validSweepPumpPhase} from './heatmapSweepPumpPhase.js';

export const FIRST_PUSH_LONG_REVIEW_VERSION='HEATMAP_FIRST_PUSH_LONG_REVIEW_V1_20261109';
export const LOWER_SHORT_REVIEW_VERSION='HEATMAP_LOWER_SHORT_REVIEW_V1_20261109';
export const FIRST_PUSH_REVIEW_STEP=300000;
export const FIRST_PUSH_REVIEW_GRACE=5*60000;
export const FIRST_PUSH_RECOVERY_GRACE=30*60000;
const S=FIRST_PUSH_REVIEW_STEP, H=3600000;
const BUFFER_PCT=.14, HEADROOM_PCT=5/3;
const display=Object.freeze({
 PENDING:['⚪',0x91a6bc,'CHỜ NẾN 5M'],
 MISSING:['⚪',0x91a6bc,'THIẾU DỮ LIỆU XÁC NHẬN'],
 WEAK:['🔴',0xff627e,'MẤT MÉP · LONG YẾU'],
 WAIT:['🟠',0xffb553,'LONG · CHỜ THÊM'],
 PROMISING:['🟢',0x29d5a0,'GIỮ MÉP · CÒN DƯ ĐỊA LÊN'],
});
const lowerDisplay=Object.freeze({
 PENDING:display.PENDING,
 MISSING:display.MISSING,
 WEAK:['🔴',0xff627e,'HỒI QUA MÉP · SHORT YẾU'],
 WAIT:['🟠',0xffb553,'SHORT · CHỜ THÊM'],
 IN_ZONE:['🟡',0xf0cd56,'SHORT · TP THAM CHIẾU TRONG CỤM'],
 PROMISING:['🟢',0x29d5a0,'SHORT · CÒN DƯ ĐỊA TRƯỚC CỤM'],
});
const finite=Number.isFinite;
const pct=n=>n.toFixed(2)+'%';
const px=n=>Number(n.toPrecision(10)).toString();
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const signed=n=>(n>0?'+':'')+n.toFixed(2);
const pair=n=>pct(n)+' LONG / '+pct(100-n)+' SHORT';

export function isFirstPushLongEvent(e,phase){
 return e?.kind==='UPPER_CLUSTER_SWEPT'&&e.direction==='UPPER'&&e.clearedCount>=1&&e.clearedCount<e.totalCount
  &&phase?.state==='FIRST_PUSH'&&validSweepPumpPhase(e,phase);
}
export function firstPushReviewClose(e,sentAt){
 return (Math.floor(Math.max(e.at,e.observedAt??e.at,sentAt)/S)+2)*S;
}
function barMap(rows){
 const map=new Map();
 for(const r of rows){
  if(!r||r.isClosed===false)continue;
  const t=+(Array.isArray(r)?r[0]:r.openTime),end=+(Array.isArray(r)?r[6]:r.closeTime);
  const [o,h,l,c]=(Array.isArray(r)?r.slice(1,5):[r.open,r.high,r.low,r.close]).map(Number);
  if(finite(t)&&t%S===0&&end===t+S-1&&[o,h,l,c].every(x=>finite(x)&&x>0)&&h>=Math.max(o,c)&&l<=Math.min(o,c))map.set(t,{high:h,low:l,close:c});
 }
 return map;
}
function ratioAt(rows,symbol,at){
 const points=new Map();
 for(const r of rows){
  const t=+r.timestamp, long=+r.longAccount, short=+r.shortAccount;
  if(r.symbol===symbol&&Number.isSafeInteger(t)&&t<=at-S&&at-t<=H+3*S&&r.longAccount!=null&&r.shortAccount!=null
   &&long>=0&&long<=1&&short>=0&&short<=1&&Math.abs(long+short-1)<=.002)points.set(t,100*long);
 }
 const t=Math.max(...points.keys());
 if(t<at-3*S)return null;
 const longPct=points.get(t),prev=points.get(t-H);
 return {at:t,longPct,delta1h:finite(prev)?longPct-prev:null};
}

export function firstPushWhaleAt(e,position,closeAt){
 const point=closeAt!==null&&position?.symbol===e.symbol&&position.at===closeAt?position.point:null;
 const prev=point?position.previous:null;
 return point?{sourceAt:point.sourceAt,whaleLong:point.whaleLong,smartLong:point.smartLong,crowdLong:point.crowdLong,
  whaleDelta:prev?point.whaleLong-prev.whaleLong:null,smartDelta:prev?point.smartLong-prev.smartLong:null}:null;
}

export function continuationKey(e){
 if(e?.kind==='LOWER_CLUSTER_SWEPT'&&e.direction==='LOWER')return 'lowerShort';
 if(e?.kind==='UPPER_CLUSTER_SWEPT'&&e.direction==='UPPER')return 'firstPushLong';
 return null;
}
export function isSweepContinuationEvent(e,phase){
 return continuationKey(e)==='lowerShort'
  ?e.clearedCount>=1&&e.clearedCount<e.totalCount
  :isFirstPushLongEvent(e,phase);
}
export function continuationReviewJob(e){
 const key=continuationKey(e),d=e?.delivery;
 if(!key||d?.status!=='SENT')return null;
 const review=d[key],message=d[key+'Message'],update=d[key+'Update'],recovery=d[key+'Recovery'];
 if(!review||!message)return null;
 if(!update&&review.state==='PENDING')return {key,review,message,mode:'pending'};
 if(update==='UPDATED'&&review.state==='MISSING'&&!recovery)return {key,review,message,mode:'recovery'};
 if(recovery==='UPDATED'&&!d[key+'ContextRepair']&&review.whale===null)return {key,review,message,mode:'context'};
 return null;
}
export function assessSweepContinuation(e,{closeAt=null,tradeRows=[],markRows=[],topRows=[],globalRows=[],position=null}={}){
 const validZone=z=>z&&finite(z.low)&&finite(z.high)&&z.low>0&&z.high>z.low&&finite(z.establishedAt)&&finite(z.asOf)
  &&z.establishedAt<=z.asOf&&z.asOf<=e.zonesAsOf;
 const zonesValid=finite(e.zonesAsOf)&&finite(e.armedAt)&&e.zonesAsOf<=e.armedAt&&e.armedAt<=e.at&&Array.isArray(e.zones)
  &&e.zones.length===e.totalCount&&e.zones.every(validZone);
 const zones=zonesValid?e.zones:[];
 const lower=e.direction==='LOWER';
 const sign=lower?-1:1;
 const nearEdge=z=>lower?z.high:z.low;
 const farEdge=z=>lower?z.low:z.high;
 const cleared=zones.filter(z=>z.cleared);
 const edge=cleared.length?sign*Math.max(...cleared.map(z=>sign*farEdge(z))):null;
 const candidates=zones.filter(z=>!z.cleared&&!z.touched&&sign*(nearEdge(z)-e.markPrice)>0)
  .sort((a,b)=>sign*(nearEdge(a)-nearEdge(b)));
 const pending=closeAt===null;
 const trade=pending?null:barMap(tradeRows).get(closeAt-S);
 const marks=barMap(markRows);
 const markStart=Math.floor(e.at/S)*S;
 let extreme=sign*e.markPrice, complete=!pending&&closeAt>e.at&&closeAt-markStart<=3*S;
 for(let t=markStart;complete&&t<closeAt;t+=S){
  const m=marks.get(t);
  if(!m){complete=false;break;}
  extreme=Math.max(extreme,sign*(lower?m.low:m.high));
 }
 const price=pending?e.markPrice:trade?.close??null;
 const headroomKnown=zonesValid&&(pending||complete&&price!==null);
 const remaining=headroomKnown&&price>0?candidates.filter(z=>sign*nearEdge(z)>Math.max(extreme,sign*price)).map(z=>({
  low:z.low,high:z.high,strength:finite(z.overlapStrength)?z.overlapStrength:null,
  nearPct:sign*(nearEdge(z)/price-1)*100,farPct:sign*(farEdge(z)/price-1)*100,
 })):null;
 const edgeGapPct=trade&&edge!==null?sign*(trade.close/edge-1)*100:null;
 const top=pending?null:ratioAt(topRows,e.symbol,closeAt),global=pending?null:ratioAt(globalRows,e.symbol,closeAt);
 const whale=firstPushWhaleAt(e,position,closeAt);
 let state='MISSING',reason='Thiếu nến giao dịch 5m đúng mốc, cụm đã chốt hoặc đường MARK trước điểm xét.';
 if(pending){state='PENDING';reason='Cập nhật trên tin này sau nến 5m trọn vẹn đầu tiên kể từ khi gửi.';}
 else if(edgeGapPct!==null&&edgeGapPct<0){
  state='WEAK';reason=lower?'Nến 5m đóng trở lại trên mép dưới cụm đã quét.':'Nến 5m đóng dưới mép trên cụm đã quét.';
 }else if(edgeGapPct!==null&&remaining!==null){
  const target=remaining[0];
  if(edgeGapPct>=BUFFER_PCT&&target?.nearPct>=HEADROOM_PCT){
   state='PROMISING';reason=lower?'Nến 5m giữ dưới mép quét; mốc giảm 1,67% nằm trước hoặc tại mép gần cụm tiếp theo.'
    :'Nến 5m giữ mép và cụm chưa chạm gần nhất còn đủ khoảng cách tới mốc giá tham chiếu.';
  }else if(lower&&edgeGapPct>=BUFFER_PCT&&target?.farPct>=HEADROOM_PCT){
   state='IN_ZONE';reason='Giá cần đi vào cụm kế tiếp để chạm mốc giảm 1,67%.';
  }else{
   state='WAIT';
   reason=edgeGapPct<BUFFER_PCT?(lower?'Giá đóng chỉ thấp hơn mép quét dưới 0,14%.':'Giá đóng chỉ nhỉnh hơn mép cụm dưới 0,14%.')
    :!target?'Tập cụm đã chốt không còn mục tiêu phía '+(lower?'dưới':'trên')+' chưa chạm.'
    :lower?'Mép xa của cụm kế tiếp vẫn gần hơn mốc giảm 1,67%.':'Cụm kế tiếp nằm gần hơn mốc +1,67% giá.';
  }
 }
 return {version:lower?LOWER_SHORT_REVIEW_VERSION:FIRST_PUSH_LONG_REVIEW_VERSION,eventId:e.id,symbol:e.symbol,state,reason,closeAt,edge,price,
  [lower?'belowEdgePct':'aboveEdgePct']:edgeGapPct,remaining,top,global,whale,observeOnly:true,affectsOrders:false};
}

export function sweepContinuationDiscord(e){
 const key=continuationKey(e),lower=key==='lowerShort',q=e[key];
 const palette=lower?lowerDisplay:display;
 if(!isSweepContinuationEvent(e,e.pumpPhase)||q?.version!==(lower?LOWER_SHORT_REVIEW_VERSION:FIRST_PUSH_LONG_REVIEW_VERSION)
  ||q.eventId!==e.id||q.symbol!==e.symbol||!Object.hasOwn(palette,q.state)||q.observeOnly!==true||q.affectsOrders!==false)return null;
 const [icon,color,title]=palette[q.state],where=lower?'dưới':'trên',sign=lower?'−':'+';
 const gap=lower?q.belowEdgePct:q.aboveEdgePct,side=lower?'SHORT':'LONG',direction=lower?-1:1;
 const fields=[{name:lower?'ĐÁNH GIÁ SHORT SAU QUÉT CỤM DƯỚI':'ĐÁNH GIÁ LONG SAU QUÉT · BƠM ĐẦU',value:[
  icon+' '+title,q.reason,
  q.closeAt?('Nến 5m '+vn(q.closeAt)+' VN · giá đóng '+(q.price===null?'—':px(q.price))
   +' · mép '+where+' '+(q.edge===null?'—':px(q.edge))+(gap===null?'':' · chênh '+signed(direction*gap)+'%')):'',
  'Màu quan sát thử nghiệm. Mốc giữ mép '+sign+'0,14% và dư địa '+sign+'1,67% giá dùng để phân loại tin.',
 ].filter(Boolean).join('\n')},{name:'DƯ ĐỊA '+(lower?'XUỐNG':'LÊN')+' · CỤM MODEL 1/3 CHƯA CHẠM',value:[
  q.price!==null?'So với '+(q.state==='PENDING'?'MARK lúc quét ':'giá đóng 5m ')+px(q.price)+'.':'Chưa có giá tham chiếu đúng mốc.',
  q.remaining===null?'Thiếu dữ liệu để kiểm tra cụm còn hiệu lực.':q.remaining.length
   ?q.remaining.length+' cụm còn phía '+where+' trong tập đã chốt.':'Không còn cụm chưa chạm phía '+where+' trong tập đã chốt.',
  ...(q.remaining??[]).slice(0,2).map((z,i)=>`#${i+1} ${px(z.low)}–${px(z.high)} · ${sign}${pct(z.nearPct)} đến ${sign}${pct(z.farPct)} · điểm ${z.strength===null?'—':z.strength.toFixed(1)}`),
  'TP +5% ROE tại 3× tương đương '+sign+'1,67% giá trước chi phí.'
   +(lower&&q.closeAt&&q.price!==null?' Giá TP tham chiếu '+px(q.price*(1-HEADROOM_PCT/100))+'.':'')+' Cụm là ước lượng.',
 ].join('\n')}];
 if(q.state!=='PENDING'){
  const w=q.whale,top=q.top,crowd=q.global;
  fields.push({name:'TỶ TRỌNG LONG / SHORT · TRƯỚC MỐC XÉT',value:[
   top?'Top Binance (vị thế): '+pair(top.longPct)+(top.delta1h===null?'':' · Δ1h '+side+' '+signed(direction*top.delta1h)+' điểm %'):'Top Binance (vị thế): thiếu dữ liệu mới.',
   crowd?'Thị trường Binance (tài khoản): '+pair(crowd.longPct):'Thị trường Binance (tài khoản): thiếu dữ liệu mới.',
   w?'PumpGlass · Cá voi '+pair(w.whaleLong)+' · Smart '+pair(w.smartLong)+' · Đám đông '+pair(w.crowdLong):'PumpGlass: thiếu ảnh chụp mới ≤15 phút.',
   w?.whaleDelta!=null?'Δ'+side+' ~1h · Cá voi '+signed(direction*w.whaleDelta)+' · Smart '+signed(direction*w.smartDelta)+' điểm %'
    +(direction*w.whaleDelta>0&&direction*w.smartDelta>0?' · cùng tăng.':'.'):'Xu hướng cá voi và Smart: thiếu mốc đối chiếu.',
  ].join('\n')});
 }
 return {icon,color,title,fields};
}

