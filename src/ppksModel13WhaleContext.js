import {model13NearbyContext} from './pumpTurnCombinedContext.js';
import {sweepPositionFields,SWEEP_POSITION_VERSION} from './heatmapSweepPositionAnalysis.js';

export const PPKS_CONTEXT_VERSION='PPKS_MODEL13_WHALE_CONTEXT_V1_20261110';

export function classifyPpksContext(signal,{bundle=null,position=null}={}) {
  const {symbol,scannedAt:at,stage}=signal;
  const side=stage==='confirmed_long'?'LONG':stage==='confirmed_short'?'SHORT':null;
  if(!side||!Number.isFinite(at))return null;
  const price=bundle?.models?.find(item=>item.model===1&&item.status==='OK')?.data?.candles?.at(-1)?.close;
  const model=model13NearbyContext({bundle,symbol,at,price});
  const checkedPosition=position?.version===SWEEP_POSITION_VERSION&&position.symbol===symbol&&position.at===at
    ?position:null;
  const point=checkedPosition?.point;
  const whaleSide=!point?null:point.whaleLong>=60&&point.smartLong>=60?'LONG'
    :point.whaleLong<=40&&point.smartLong<=40?'SHORT':null;
  const target=side==='LONG'?model?.above:model?.below;
  const modelSide=!model?null:model.upperScore>model.lowerScore?'LONG':model.lowerScore>model.upperScore?'SHORT':null;
  const whalePass=whaleSide===side;
  const modelPass=modelSide===side&&!!target;
  const state=!point||!model?'MISSING':whalePass&&modelPass?'ALIGNED'
    :(whaleSide&&whaleSide!==side)||(modelSide&&modelSide!==side)?'CONFLICT':'WAIT';
  return {version:PPKS_CONTEXT_VERSION,symbol,at,side,state,whaleSide,modelSide,whalePass,modelPass,
    position:checkedPosition,model,observeOnly:true,affectsOrders:false};
}

export function ppksContextFields(context) {
  const states={ALIGNED:'CÙNG HƯỚNG',CONFLICT:'TRÁI CHIỀU',WAIT:'CHƯA ĐỦ ĐỒNG THUẬN',MISSING:'THIẾU BỐI CẢNH'};
  if(!context)return [];
  const m=context.model;
  const zone=(item,distance)=>item?Number(item.low.toPrecision(8))+'–'+Number(item.high.toPrecision(8))
    +' · cách '+distance.toFixed(2)+'% · điểm '+item.overlapStrength.toFixed(1):'chưa thấy cụm đủ điều kiện';
  return [
    {name:'MODEL 1/3 + CÁ VOI · '+states[context.state],value:m?[
      'Model 1/3 nghiêng '+(context.modelSide??'chưa rõ')+' · cá voi và Smart '+(context.whaleSide??'chưa cùng nghiêng ≥60%'),
      'Điểm tương đối ±5% · trên '+m.upperScore.toFixed(0)+' / dưới '+m.lowerScore.toFixed(0),
      'Cụm trên '+zone(m.above,m.aboveDistancePct),'Cụm dưới '+zone(m.below,m.belowDistancePct),
      'Mốc giá đóng 5m '+m.price+'. Cụm ước lượng dùng để đối chiếu.',
    ].join('\n'):'Thiếu hai Model 1/3 đồng bộ trước lúc phát tín hiệu.'},
    sweepPositionFields(context.position)[0],
  ];
}
