export const EMA99_ENTRY_SETTINGS_VERSION='EMA99_ROUTE_EDITABLE_LEVERAGE_CONTROLS_V6_20260913';
export const EMA99_ROUTE_LEVERAGE_VERSION='EMA99_EDITABLE_ROUTE_LEVERAGE_V2_20260913';
export const EMA99_ENTRY_INTERVALS=['5m','15m'];
const shorts=[['NEAR_EMA_WATCH','Gần chạm EMA99'],
  ['REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH','Bơm hồi · bật hụt EMA99 + râu reject',true],
  ['FIRST_PUMP_NEAR_REJECT_SHORT_WATCH','Bơm lần đầu · bật hụt EMA99 + râu reject',false],
  ['TOUCH_WATCH','Chạm EMA99'],['REJECTED_SHORT_WATCH','Đã reject EMA99'],['CLOSED_ABOVE_EMA_WATCH','Đóng trên EMA99 · chờ phân định']];
const longs=[['NEAR_EMA_LONG_WATCH','Gần chạm EMA99'],['NEAR_RECLAIM_LONG_WATCH','Bật trước EMA99'],['RECLAIM_LONG_WATCH','Rút râu / lấy lại EMA99'],['CLOSED_BELOW_EMA_LONG_WAIT','Đóng dưới EMA99 · chưa LONG'],['TOUCH_EMA_LONG_WATCH','Chạm EMA99'],['BOUNCE_CONFIRMED_LONG_WATCH','Xác nhận bật']];
const sources={REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH:'ema99-near-reject-short',FIRST_PUMP_NEAR_REJECT_SHORT_WATCH:'ema99-first-pump-near-reject-short',RECLAIM_LONG_WATCH:'ema99-reclaim-long',BOUNCE_CONFIRMED_LONG_WATCH:'ema99-bounce-long'};
export const EMA99_ENTRY_CATALOG=[...shorts.map(([label,title,executable=true])=>[label,title,'SHORT',executable]),
  ...longs.map(([label,title,executable=true])=>[label,title,'LONG',executable])].map(([label,title,side,executable])=>({
 source:sources[label]??'ema99-observe-only',streamId:'ema99-retest',signalLabel:label,side,title,executable}));
export const EMA99_CONTROL_CATALOG=EMA99_ENTRY_INTERVALS.flatMap(signalInterval=>EMA99_ENTRY_CATALOG.map(r=>({...r,signalInterval})));
export function ema99RouteMeta(r){return EMA99_ENTRY_CATALOG.find(c=>c.source===r.source&&c.streamId===r.stream&&c.signalLabel===r.label&&c.side===r.side);}
export function validEma99Margin(value){return typeof value==='number'&&Number.isFinite(value)&&value>=1&&value<=100&&Math.abs(value*100-Math.round(value*100))<1e-8;}
export function ema99Margin(r){const value=r?.marginUsdt===undefined?5:r.marginUsdt;return validEma99Margin(value)?value:null;}
export function validEma99TakeProfitRoe(value){return typeof value==='number'&&Number.isFinite(value)&&value>=1&&value<=100&&Math.abs(value*100-Math.round(value*100))<1e-8;}
export function ema99TakeProfitRoe(r){const value=r?.takeProfitRoePct===undefined?15:r.takeProfitRoePct;return validEma99TakeProfitRoe(value)?value:null;}
export function validEma99Leverage(value){return typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=125;}
export function defaultEma99Leverage(r={}){
  const side=['SELL','SHORT'].includes(r.side)?'SHORT':r.side;
  const label=r.label??r.signalLabel;
  const interval=r.interval??r.signalInterval;
  return side==='SHORT'&&((label==='NEAR_EMA_WATCH'&&interval==='5m')
    ||(label==='CLOSED_ABOVE_EMA_WATCH'&&interval==='15m'))?10:5;
}
export function ema99Leverage(r={}){const value=r?.leverage===undefined?defaultEma99Leverage(r):r.leverage;return validEma99Leverage(value)?value:null;}
export function validEma99OrderSize(p){const margin=p.marginUsdt??5,leverage=ema99Leverage(p);
  return validEma99Margin(margin)&&leverage!==null&&p.leverage===leverage&&Math.abs(p.notionalUsdt-margin*leverage)<1e-8;}
