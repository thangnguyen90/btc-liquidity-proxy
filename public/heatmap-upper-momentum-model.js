export const UPPER_MOMENTUM_VERSION='HEATMAP_UPPER_MOMENTUM_OBSERVE_V1_20261026';
export const UPPER_MOMENTUM_TITLES=Object.freeze({CONTINUATION:'QUÉT TRÊN · CÒN ĐÀ BƠM',NOT_CONFIRMED:'QUÉT TRÊN · CHƯA ĐỦ DẤU HIỆU BƠM TIẾP',UNKNOWN:'QUÉT TRÊN · THIẾU DỮ LIỆU ĐÀ BƠM'});
export const upperMomentumKey=state=>Object.hasOwn(UPPER_MOMENTUM_TITLES,state)?'heatmap-upper-momentum:'+state:null;
export function upperMomentumChecks(f={}){return [
 {key:'RETURN15',label:'Giá 15m ≥1%',value:f.return15m,pass:Number.isFinite(f.return15m)?f.return15m>=1:null},
 {key:'RETURN60',label:'Giá 1h ≥3%',value:f.return1h,pass:Number.isFinite(f.return1h)?f.return1h>=3:null},
 {key:'VOLUME',label:'Volume USDT nến5m / 20 nến trước ≥1,5×',value:f.volumeRatio,pass:Number.isFinite(f.volumeRatio)?f.volumeRatio>=1.5:null},
 {key:'CLOSE',label:'Vị trí đóng nến trong biên cao–thấp ≥75%',value:f.closePositionPct,pass:Number.isFinite(f.closePositionPct)?f.closePositionPct>=75:null},
 ];}
export function upperMomentumState(f){const c=upperMomentumChecks(f);return c.some(x=>x.pass===null)?'UNKNOWN':c.every(x=>x.pass)?'CONTINUATION':'NOT_CONFIRMED';}
export function validUpperMomentum(e){
 const q=e?.upperMomentum,s=q?.sources,f=q?.features,step=300000;
 if(e?.kind!=='ALL_TRACKED_UPPER_SWEPT'||e.direction!=='UPPER'||q?.version!==UPPER_MOMENTUM_VERSION||q.symbol!==e.symbol||q.eventId!==e.id||q.asOf!==e.at
  ||q.observeOnly!==true||q.affectsOrders!==false||!Number.isFinite(q.evaluatedAt)||q.evaluatedAt<e.at-1000||q.evaluatedAt>e.at+10000||!s||!f
  ||q.state!==upperMomentumState(f)||JSON.stringify(q.checks)!==JSON.stringify(upperMomentumChecks(f)))return false;
 if(q.state==='UNKNOWN')return true;
 return s.coinBars===21&&s.coinClosedAt===Math.floor(e.at/step)*step-1&&s.coinReadAt===q.evaluatedAt
  &&f.return15m>-100&&f.return1h>-100&&f.volumeRatio>=0&&f.closePositionPct>=0&&f.closePositionPct<=100;
}
export function upperMomentumTradeKey(r){const e=r?.heatmapSweepAtEntry;return r?.signalSource==='heatmap-full-sweep'&&r.direction==='SHORT'&&r.symbol===e?.symbol&&validUpperMomentum(e)?upperMomentumKey(e.upperMomentum.state):null;}
export function upperMomentumClosedStats(fills={},state){
 const key=upperMomentumKey(state),all=Object.values(fills??{}).map(r=>r?.record??r),seen=new Set(),rows=[];
 for(const r of all){const id=r?.symbol+':'+(r?.clientOrderId??r?.orderId);
  if(!key||!r||(!r.clientOrderId&&!r.orderId)||seen.has(id)||r.isDca===true||r.positionStatus!=='CLOSED'||!Number.isFinite(r.realizedRoePct)||upperMomentumTradeKey(r)!==key)continue;
  if(r.closeGroupId&&all.some(x=>x?.closeGroupId===r.closeGroupId&&(x.isDca===true||upperMomentumTradeKey(x)!==key)))continue;
  seen.add(id);rows.push(r);
 }
 const avgRoePct=rows.length?rows.reduce((s,r)=>s+r.realizedRoePct,0)/rows.length:null;
 return {key,state,closed:rows.length,avgRoePct,eligible:rows.length>0&&avgRoePct>4,observeOnly:true,affectsOrders:false};
}
