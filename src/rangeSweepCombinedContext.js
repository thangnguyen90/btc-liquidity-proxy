import {model13NearbyContext} from './pumpTurnCombinedContext.js';
import {sweepPositionContext,sweepPositionFields,SWEEP_POSITION_VERSION} from './heatmapSweepPositionAnalysis.js';

export const RANGE_SWEEP_DECISION_VERSION='RANGE_SWEEP_COMBINED_SEND_GATE_V1_20261111';
export const RANGE_SWEEP_ENTRY_VERSION='RANGE_SWEEP_RETEST_ENTRY_V1_20261111';
export const RANGE_SWEEP_CONTEXT_VERSION='RANGE_SWEEP_MODEL13_POSITION_WHALE_V1_20261111';
export const RANGE_SWEEP_CONTEXT_TITLES=Object.freeze({ALIGNED:'CÙNG HƯỚNG',CONFLICT:'TRÁI CHIỀU',WAIT:'CHƯA ĐỦ ĐỒNG THUẬN',MISSING:'THIẾU BỐI CẢNH'});
const S=300000,finite=Number.isFinite,number=x=>finite(x)?Number(x.toPrecision(7)).toString():'—';
const time=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
const side=pct=>pct>50?'LONG':pct<50?'SHORT':null;

export function rangeSweepPositionRatio(event,snapshot,at){
  if(!finite(snapshot?.fetchedAt)||snapshot.fetchedAt>at||at-snapshot.fetchedAt>60000||!Array.isArray(snapshot.rows))return null;
  const cutoff=event.at-S,map=new Map();
  for(const r of snapshot.rows){
    const t=Number(r.timestamp),ratio=Number(r.longShortRatio);
    if(!finite(t)||t>cutoff||!finite(ratio)||ratio<=0||r.symbol&&r.symbol!==event.symbol)continue;
    if(map.has(t)&&map.get(t)!==ratio)return null;
    map.set(t,ratio);
  }
  const rows=[...map].sort((a,b)=>a[0]-b[0]),last=rows.at(-1);
  if(!last||cutoff-last[0]>S)return null;
  const previous=rows.find(r=>r[0]===last[0]-3600000),longPct=100*last[1]/(1+last[1]);
  return {at:last[0],readAt:snapshot.fetchedAt,ratio:last[1],longPct,
    deltaLong1hPp:previous?longPct-100*previous[1]/(1+previous[1]):null};
}

export function rangeSweepEntryPlan(event,context,at){
  const b=event.base;
  if(event.kind!=='DIRECTION_CONFIRMED'||!['LONG','SHORT'].includes(event.side)||!b
    ||![b.low,b.high,b.atr,b.asOf,event.price,event.at,at].every(finite)
    ||b.low<=0||b.high<=b.low||b.atr<=0||b.asOf>=event.at||event.price<=0||at<event.at)return null;
  const up=event.side==='LONG',level=up?b.high:b.low;
  const low=up?level:level-.25*b.atr,high=up?level+.25*b.atr:level;
  if(low<=0)return null;
  const move=up?event.price-level:level-event.price;
  const expired=finite(event.expiresAt)&&at>=event.expiresAt;
  const status=expired?'EXPIRED':move<=0?'INVALIDATED':move>b.atr?'NO_CHASE'
    :context.state!=='ALIGNED'?'WAIT_CONTEXT':event.price>=low&&event.price<=high?'IN_ZONE':'WAIT_RETEST';
  return {version:RANGE_SWEEP_ENTRY_VERSION,side:event.side,low,high,level,atr:b.atr,
    invalidationClose:level,maxChasePrice:up?level+b.atr:level-b.atr,status,
    signalPrice:event.price,signalAt:event.at,at,expiresAt:event.expiresAt??null,
    source:'FROZEN_BASE_ATR',requiresRetest:true,observeOnly:true,affectsOrders:false};
}

export function classifyRangeSweepContext(event,{bundle=null,position=null,positionRatio=null,at=Date.now()}={}){
  if(event.kind!=='DIRECTION_CONFIRMED'||!['LONG','SHORT'].includes(event.side))return null;
  const model=model13NearbyContext({bundle,symbol:event.symbol,price:event.price,at:event.at});
  const p=position?.version===SWEEP_POSITION_VERSION&&position.symbol===event.symbol&&position.sweepAt===event.at
    &&finite(position.at)&&position.at<=at&&at-position.at<=30000?sweepPositionContext(event,{
      points:[position.previous,position.point].filter(Boolean),
      ratioRows:position.top?[{timestamp:position.top.at,longShortRatio:position.top.ratio}]:[],
      ratioReadAt:position.top?.readAt,at:position.at}):null;
  const ratio=rangeSweepPositionRatio(event,positionRatio,at);
  const point=p?.point,whaleSide=!point?null:point.whaleLong>=60&&point.smartLong>=60?'LONG'
    :point.whaleLong<=40&&point.smartLong<=40?'SHORT':null;
  const modelSide=!model?null:model.upperScore>model.lowerScore?'LONG':model.lowerScore>model.upperScore?'SHORT':null;
  const ratioSide=ratio?side(ratio.longPct):null,accountSide=p?.top?side(p.top.longPct):null;
  const target=event.side==='LONG'?model?.above:model?.below;
  const opposing=[whaleSide,modelSide,ratioSide,accountSide].some(s=>s&&s!==event.side);
  const state=!model||!point||!ratio?'MISSING':opposing?'CONFLICT'
    :whaleSide===event.side&&modelSide===event.side&&ratioSide===event.side&&target?'ALIGNED':'WAIT';
  const context={version:RANGE_SWEEP_CONTEXT_VERSION,eventId:event.id,symbol:event.symbol,side:event.side,at,signalAt:event.at,
    state,model,position:p,positionRatio:ratio,whaleSide,modelSide,ratioSide,observeOnly:true,affectsOrders:false};
  context.entry=rangeSweepEntryPlan(event,context,at);
  return context;
}

export async function collectRangeSweepContext(event,{loadBundle,loadPosition,loadPositionRatio,budgetMs=2300,now=Date.now}={}){
  const found={};
  const jobs=[['bundle',loadBundle],['position',loadPosition],['positionRatio',loadPositionRatio]]
    .filter(([,load])=>typeof load==='function')
    .map(([key,load])=>Promise.resolve().then(()=>load(event)).then(value=>{found[key]=value;}));
  let timer;
  try{await Promise.race([Promise.allSettled(jobs),new Promise(resolve=>{timer=setTimeout(resolve,budgetMs);})]);}
  finally{clearTimeout(timer);}
  return classifyRangeSweepContext(event,{...found,at:now()});
}

export function assessRangeSweepSignal(event,{at=Date.now(),current={price:event.price,at:event.at}}={}){
  if(event.kind!=='DIRECTION_CONFIRMED'||!['LONG','SHORT'].includes(event.side))return null;
  const c=event.analysis,up=event.side==='LONG';
  const out={version:RANGE_SWEEP_DECISION_VERSION,eventId:event.id,symbol:event.symbol,side:event.side,at,
    outcome:'WAIT',priority:'WAIT',reasonCode:null,reason:null,reference:null,entry:null,target:null,
    observeOnly:true,affectsOrders:false,affectsDiscord:true};
  const result=(outcome,reasonCode,reason)=>({...out,outcome,priority:outcome==='SEND'?'QUALIFIED':outcome==='REJECT'?'AVOID':'WAIT',reasonCode,reason});
  if(!finite(event.at)||!finite(at)||at-event.at>30000)return result('REJECT','EVENT_EXPIRED','Tín hiệu quá30 giây.');
  if(finite(event.expiresAt)&&at>=event.expiresAt)return result('REJECT','WATCH_EXPIRED','Nhịp theo dõi đã hết hạn.');
  if(!current||![current.price,current.at].every(finite)||current.price<=0||current.at<event.at||current.at>at+1000||at-current.at>10000)
    return result('WAIT','MARK_NOT_FRESH','Chưa có MARK mới trong10 giây để xác nhận điểm gửi.');
  out.reference={price:current.price,at:current.at};
  if(current.done||current.invalidReason)return result('REJECT','WATCH_INVALIDATED','Nhịp theo dõi đã bị hủy hoặc kết thúc.');
  if(current.touchedAt)return result('REJECT','TARGET_ALREADY_TOUCHED','Giá đã chạm cụm mục tiêu trước khi gửi.');
  if(!c||c.version!==RANGE_SWEEP_CONTEXT_VERSION||c.eventId!==event.id||c.symbol!==event.symbol||c.side!==event.side
    ||!finite(c.at)||c.at>at||at-c.at>30000)return result('WAIT','CONTEXT_MISSING','Thiếu đánh giá tổng hợp hợp lệ.');
  if(c.state==='CONFLICT')return result('REJECT','CONTEXT_CONFLICT','Model1/3 hoặc vị thế đang trái hướng tín hiệu.');
  if(c.state!=='ALIGNED')return result('WAIT',c.state==='MISSING'?'CONTEXT_MISSING':'CONTEXT_NOT_ALIGNED',
    c.state==='MISSING'?'Thiếu Model1/3, tỷ lệ vị thế top hoặc cá voi mới.':'Model1/3 và vị thế chưa đủ đồng thuận cùng hướng.');
  const m=c.model,p=c.position?.point,r=c.positionRatio;
  const pointValid=p&&!p.ambiguous&&finite(p.sourceAt)&&finite(p.observedAt)&&p.sourceAt<=p.observedAt&&p.observedAt<=at
    &&at-p.sourceAt<=900000&&p.whaleCount>=10&&[p.whaleLong,p.smartLong,p.crowdLong].every(v=>finite(v)&&v>=0&&v<=100);
  if(!m||!pointValid||!r||!finite(m.at)||m.at>event.at||event.at-m.at>420000
    ||!finite(r.at)||r.at>event.at-S||event.at-S-r.at>S||!finite(r.readAt)||r.readAt>at||at-r.readAt>60000)
    return result('WAIT','SOURCE_NOT_FRESH','Nguồn tổng hợp thiếu hoặc đã quá hạn trước lúc gửi.');
  const groupsAgree=up?p.whaleLong>=60&&p.smartLong>=60:p.whaleLong<=40&&p.smartLong<=40;
  const account=c.position?.top,accountOpposite=account&&(up?account.longPct<50:account.longPct>50);
  if(!groupsAgree||!(up?m.upperScore>m.lowerScore:m.lowerScore>m.upperScore)||!finite(r.longPct)
    ||!(up?r.longPct>50:r.longPct<50)||accountOpposite)
    return result('REJECT','SOURCE_DISAGREES','Dữ liệu nguồn không còn đủ đồng thuận cho hướng tín hiệu.');
  const b=event.base,f=event.flow;
  if(!b||![b.low,b.high,b.atr].every(finite)||b.atr<=0||!f||![f.end,f.o,f.c,f.volumeX,f.buyPct].every(finite)
    ||f.end>=at||at-f.end>75000||f.volumeX<2||f.buyPct<0||f.buyPct>100
    ||!(up?f.c>b.high&&f.c>f.o&&f.buyPct>=55:f.c<b.low&&f.c<f.o&&f.buyPct<=45))
    return result('REJECT','FLOW_NOT_CONFIRMED','Nến1m, volume hoặc taker không còn thỏa điều kiện phá nền.');
  out.entry=rangeSweepEntryPlan({...event,price:current.price},c,at);
  if(!out.entry)return result('WAIT','ENTRY_UNAVAILABLE','Chưa dựng được vùng entry từ nền và ATR hợp lệ.');
  out.entry={...out.entry,signalPrice:event.price,referencePrice:current.price,referenceAt:current.at};
  if(!['IN_ZONE','WAIT_RETEST'].includes(out.entry.status))
    return result('REJECT',out.entry.status==='NO_CHASE'?'PRICE_TOO_FAR':'BASE_REENTERED',
      out.entry.status==='NO_CHASE'?'MARK đã xa nền quá1 ATR; không đuổi giá.':'MARK đã quay lại nền hoặc nhịp đã hết hạn.');
  const modelTarget=up?m.above:m.below;
  if(!modelTarget)return result('WAIT','MODEL_TARGET_MISSING','Chưa có cụm Model1/3 chưa chạm cùng hướng.');
  const targets=[modelTarget,event.zone].filter(z=>z&&[z.low,z.high].every(finite)&&z.low>0&&z.high>z.low)
    .sort((a,b)=>up?a.low-b.low:b.high-a.high);
  const target=targets[0];
  if(!target)return result('WAIT','TARGET_MISSING','Thiếu cụm mục tiêu hợp lệ.');
  const remaining=up?target.low-current.price:current.price-target.high;
  out.target={low:target.low,high:target.high,remainingAtr:remaining/b.atr,remainingPct:remaining/current.price*100};
  if(remaining<.25*b.atr)return result('REJECT','TARGET_TOO_CLOSE','Cụm mục tiêu đã quá gần hoặc bị vượt; dư địa dưới0,25 ATR.');
  return result('SEND','COMBINED_QUALIFIED','Phá nền đạt volume/taker; Model1/3, cá voi+Smart và vị thế top cùng hướng; còn dư địa tới cụm.');
}

export function rangeSweepEntryIntro(event){
  const c=event.analysis,a=event.assessment;
  const qualified=a?.version===RANGE_SWEEP_DECISION_VERSION&&a.eventId===event.id&&a.symbol===event.symbol&&a.side===event.side&&a.outcome==='SEND';
  const p=qualified?a.entry:c?.entry;
  if(c?.version!==RANGE_SWEEP_CONTEXT_VERSION||c.eventId!==event.id||c.symbol!==event.symbol||c.side!==event.side
    ||event.kind!=='DIRECTION_CONFIRMED'||p?.version!==RANGE_SWEEP_ENTRY_VERSION||p.side!==event.side)return '';
  const remarks={IN_ZONE:'Giá lúc báo nằm trong vùng; chờ retest và nến1m đóng giữ ngoài nền.',
    WAIT_RETEST:'Ưu tiên chờ hồi kiểm tra vùng entry; tránh đuổi giá.',
    WAIT_CONTEXT:'Chưa ưu tiên vào: '+(RANGE_SWEEP_CONTEXT_TITLES[c.state]??'thiếu bối cảnh')+'. Vùng entry chỉ là mốc chờ.',
    INVALIDATED:'Giá đã trở lại nền tại mốc báo; hủy kịch bản entry.',
    NO_CHASE:'Giá đã cách nền quá1 ATR; bỏ điểm vào hiện tại.',
    EXPIRED:'Nhịp theo dõi đã hết hạn; hủy vùng entry này.'};
  return ['**ENTRY '+event.side+' THAM KHẢO: '+number(p.low)+' – '+number(p.high)+'**',
    ...(qualified?['**ĐÃ QUA BỘ LỌC TỔNG HỢP · ƯU TIÊN '+event.side+' KHI RETEST GIỮ VÙNG**']:[]),
    remarks[p.status]??'Chưa đủ điều kiện để xét entry.',
    'Hủy nếu nến1m đóng '+(event.side==='LONG'?'≤':'≥')+number(p.invalidationClose)+' (trở lại nền).',
    ...(qualified?['MARK kiểm tra '+number(a.reference.price)+' · '+time(a.reference.at)+' VN · dư địa đến cụm '+number(a.target.remainingPct)+'% ('+number(a.target.remainingAtr)+' ATR).']:[]),
    'Giá lúc phát hiện '+number(p.signalPrice)+' · '+time(p.signalAt)+' VN. Vùng chờ retest .25 ATR, chưa backtest riêng.',
  ].join('\n');
}

export function rangeSweepContextFields(event){
  const c=event.analysis;
  if(!c||c.version!==RANGE_SWEEP_CONTEXT_VERSION||c.eventId!==event.id||c.symbol!==event.symbol||c.side!==event.side
    ||!Object.hasOwn(RANGE_SWEEP_CONTEXT_TITLES,c.state))return [];
  const m=c.model,p=c.positionRatio;
  const zone=(z,d)=>z?number(z.low)+'–'+number(z.high)+' · cách '+number(d)+'%':'chưa thấy cụm đủ điều kiện trong ±5%';
  return [
    {name:(event.assessment?.version===RANGE_SWEEP_DECISION_VERSION&&event.assessment.eventId===event.id&&event.assessment.outcome==='SEND'?'KẾT LUẬN TỔNG HỢP · ƯU TIÊN '+event.side:'ĐÁNH GIÁ BỔ SUNG · '+RANGE_SWEEP_CONTEXT_TITLES[c.state]),value:[
      'Hướng tín hiệu '+c.side+' · Model 1/3 '+(c.modelSide??'chưa rõ')+' · cá voi và Smart '+(c.whaleSide??'chưa cùng nghiêng ≥60%')+' · vị thế top '+(c.ratioSide??'thiếu hoặc cân bằng'),
      'Đối chiếu lúc '+time(c.at)+' VN. Tín hiệu gốc '+time(c.signalAt)+' VN.',
      'Phân loại quan sát thử nghiệm, chưa backtest hiệu quả riêng.',
    ].join('\n')},
    {name:'MODEL 1/3 · VÙNG VÀ DƯ ĐỊA',value:m?[
      'Giá lúc báo '+number(event.price)+' · nến Model chốt '+time(m.at)+' VN',
      'Cụm trên '+zone(m.above,m.aboveDistancePct),
      'Cụm dưới '+zone(m.below,m.belowDistancePct),
      'Điểm tương đối ±5% · trên '+number(m.upperScore)+' / dưới '+number(m.lowerScore),
      'Các cụm là ước lượng từ hai Model.',
    ].join('\n'):'Thiếu hai Model đồng bộ trước lúc báo, MARK 100% hoặc OI ≥95%.'},
    ...sweepPositionFields(c.position).slice(0,1),
    {name:'LONG / SHORT TOP BINANCE · VỊ THẾ',value:p?[
      'LONG '+p.longPct.toFixed(1)+'% / SHORT '+(100-p.longPct).toFixed(1)+'% · L/S '+p.ratio.toFixed(3),
      'Δ LONG 1h '+(p.deltaLong1hPp===null?'thiếu mốc':p.deltaLong1hPp.toFixed(2)+' điểm %'),
      'Mốc ratio '+time(p.at)+' VN · chốt trễ ít nhất 5 phút so với tín hiệu.',
      'Tỷ trọng vị thế. Tỷ lệ tài khoản top được ghi riêng ở bảng cá voi.',
    ].join('\n'):'Thiếu tỷ lệ vị thế top Binance đủ mới trước lúc báo.'},
  ];
}
