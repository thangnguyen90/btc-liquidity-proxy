import {model13NearbyContext,MODEL13_CONTEXT_MAX_AGE_MS} from './pumpTurnCombinedContext.js';
import {sweepPositionFields,SWEEP_POSITION_VERSION} from './heatmapSweepPositionAnalysis.js';

export const RISING_VOLUME_CONTEXT_VERSION='RISING_VOLUME_MODEL13_WHALE_DISCORD_V1_20261109';
const MIN=60000;
const finite=Number.isFinite;
const px=x=>Number(x.toPrecision(8)).toString();
const vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});

function closedRange(rows,from,end,price){
 if(!finite(from)||from>end||end-from>MODEL13_CONTEXT_MAX_AGE_MS||from%MIN||end%MIN)return null;
 const byTime=new Map(rows.filter(r=>r&&r.isClosed!==false&&Number(r.openTime)>=from&&Number(r.closeTime)<end)
  .map(r=>[Number(r.openTime),r]));
 let high=price,low=price;
 for(let t=from;t<end;t+=MIN){
  const r=byTime.get(t),h=Number(r?.high),l=Number(r?.low),o=Number(r?.open),c=Number(r?.close);
  if(Number(r?.closeTime)!==t+MIN-1||![h,l,o,c].every(finite)||l<=0||h<Math.max(o,c)||l>Math.min(o,c))return null;
  high=Math.max(high,h);low=Math.min(low,l);
 }
 return {observedHigh:high,observedLow:low};
}
export function risingVolumeContext(e,{bundle=null,position=null,minuteRows=[],at=Date.now()}={}){
 const s=e.snapshot,decisionAt=s.closedAt+1;
 const selected=bundle?.models?.find(m=>m.model===1&&m.status==='OK')?.data;
 const range=closedRange(minuteRows,selected?.end,decisionAt,s.price);
 const model=range?model13NearbyContext({bundle,symbol:s.symbol,price:s.price,at:decisionAt,...range}):null;
 const p=position?.point;
 const verified=position?.version===SWEEP_POSITION_VERSION&&position.symbol===s.symbol&&finite(position.at)&&position.at<=at
  &&at-position.at<=30000&&p&&finite(p.sourceAt)&&finite(p.observedAt)&&p.sourceAt<=p.observedAt&&p.observedAt<=position.at
  &&at-p.sourceAt<=15*MIN&&p.whaleCount>=10&&[p.whaleLong,p.smartLong,p.crowdLong].every(x=>finite(x)&&x>=0&&x<=100);
 const whaleSide=verified?(p.whaleLong>=60&&p.smartLong>=60?'LONG':p.whaleLong<=40&&p.smartLong<=40?'SHORT':null):null;
 const target=model?(s.side==='LONG'?model.above:model.below):null;
 const liquiditySide=model?(model.upperScore>model.lowerScore?'LONG':model.lowerScore>model.upperScore?'SHORT':null):null;
 const contrary=[];
 if(whaleSide&&whaleSide!==s.side)contrary.push('cá voi và Smart nghiêng '+whaleSide);
 if(liquiditySide&&liquiditySide!==s.side)contrary.push('điểm Model 1/3 dày hơn phía '+(liquiditySide==='LONG'?'trên':'dưới'));
 const missing=[];
 if(!verified)missing.push('ảnh chụp cá voi/Smart mới');
 if(!model)missing.push('hai model đồng bộ và nến đối chiếu');
 const aligned=whaleSide===s.side&&liquiditySide===s.side&&!!target;
 const state=contrary.length?'CONFLICT':missing.length?'MISSING':aligned?'ALIGNED':'WAIT';
 const reason=contrary.length?contrary.join(' · '):missing.length?'Thiếu '+missing.join(' và ')+'.':aligned?
  'Cá voi và Smart cùng nghiêng theo tín hiệu; phía theo hướng tín hiệu có điểm cao hơn và còn cụm kế tiếp.':
  !target?'Chưa có cụm chưa chạm theo hướng tín hiệu trong phạm vi ±5%.':'Chưa đủ đồng thuận giữa vị thế và cụm giá.';
 return {version:RISING_VOLUME_CONTEXT_VERSION,id:e.id,symbol:s.symbol,side:s.side,decisionAt,at,state,reason,missing,whaleSide,liquiditySide,
  position:verified?position:null,model,observeOnly:true,affectsOrders:false};
}

const titles={ALIGNED:'🟢 CÙNG HƯỚNG',CONFLICT:'🟠 BỐI CẢNH TRÁI CHIỀU',WAIT:'🟡 CHỜ THÊM',MISSING:'⚪ THIẾU BỐI CẢNH'};
function zoneLine(z,price,side){
 if(!z)return 'chưa thấy cụm đủ điều kiện';
 const sign=side==='LONG'?'+':'−';
 const [near,far]=side==='LONG'?[(z.low/price-1)*100,(z.high/price-1)*100]:[(1-z.high/price)*100,(1-z.low/price)*100];
 return `${px(z.low)}–${px(z.high)} · ${sign}${near.toFixed(2)}% đến ${sign}${far.toFixed(2)}% · điểm ${z.overlapStrength.toFixed(1)}`;
}
export function risingVolumeContextFields(e,c){
 if(c?.version!==RISING_VOLUME_CONTEXT_VERSION||c.id!==e.id||c.symbol!==e.snapshot.symbol||c.side!==e.snapshot.side
  ||c.decisionAt!==e.snapshot.closedAt+1||c.observeOnly!==true||c.affectsOrders!==false||!Object.hasOwn(titles,c.state))return [];
 const m=c.model,p=c.position,positionField=p?sweepPositionFields(p)[0]:null;
 return [
  {name:'ĐỐI CHIẾU VOLUME · MODEL 1/3 · CÁ VOI',value:[
   titles[c.state]+' · tín hiệu '+c.side,c.reason,
   c.state==='CONFLICT'&&c.missing.length?'Thiếu thêm '+c.missing.join(' và ')+'.':'',
   'Đánh giá quan sát thử nghiệm. Gate Binance nằm ở mục riêng.',
  ].filter(Boolean).join('\n')},
  {name:'MODEL 1/3 · CỤM QUANH GIÁ ĐÓNG 1M',value:m?[
   'Giá đóng '+px(m.price)+' · mốc model '+vn(m.at)+' VN.',
   'Phía trên: '+zoneLine(m.above,m.price,'LONG'),
   'Phía dưới: '+zoneLine(m.below,m.price,'SHORT'),
   'Điểm tương đối ±5%: trên '+m.upperScore.toFixed(0)+' / dưới '+m.lowerScore.toFixed(0)+'. Các cụm là ước lượng.',
  ].join('\n'):'Thiếu hai model đồng bộ, dữ liệu MARK/OI hoặc nến 1m để đối chiếu cụm đã chạm.'},
  positionField?{...positionField,value:positionField.value+
   (p.point.observedAt>=c.decisionAt?'\nBot đọc vị thế sau khi nến đóng; bối cảnh lúc gửi.':'\nSnapshot vị thế đã được bot đọc trước lúc đóng nến tín hiệu.')}
   :{name:'CÁ VOI · SMART · TOP BINANCE',value:'Thiếu ảnh chụp PumpGlass mới ≤15 phút. Chưa xác nhận xu hướng vị thế.'},
 ];
}

