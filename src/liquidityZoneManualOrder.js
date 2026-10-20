import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {mainDistanceCandidate,mainDistancePlan,MAIN_DISTANCE_MAX_POSITIONS} from './mainKillDistanceEntry.js';

export const ZONE_MANUAL_SOURCE='liquidity-zone-manual';
export const ZONE_MANUAL_VERSION='LIQUIDITY_ZONE_MANUAL_V1_MARGIN_CONFIRM_20261005';
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,24);
export function zoneManualPlan(w,input,accountKey,now=Date.now()) {
  const c=mainDistanceCandidate(w,now),margin=Number(input.marginUsdt);
  if(!c)throw Error('Vùng MAIN không còn đủ điều kiện: cần ACTIVE, chưa vượt, đủ nến, giá mới và khoảng cách ≥2,5%.');
  if(!Number.isFinite(margin)||margin<=0||!Number.isFinite(margin*5))throw Error('Margin USDT phải là số hữu hạn lớn hơn 0.');
  if(!(Number(input.referenceMark)>0)||!Number.isFinite(Number(input.referenceMark))||Math.abs(c.mark/Number(input.referenceMark)-1)>.005)
    throw Error('Giá đã lệch quá 0,5% so với cửa sổ xác nhận. Mở lại để xem giá mới.');
  if(input.side!==c.side||Number(input.zone?.low)!==c.zone.low||Number(input.zone?.high)!==c.zone.high)
    throw Error('Hướng hoặc vùng đã thay đổi. Mở lại cửa sổ để xác nhận.');
  const key=hash(`${accountKey}|${c.key}`);
  return {...mainDistancePlan(c,now),source:ZONE_MANUAL_SOURCE,streamId:'manual-main-zone',signalLabel:'orders-manual',
    signalType:'orders-manual',marginUsdt:margin,notionalUsdt:margin*5,maxOpenPositions:MAIN_DISTANCE_MAX_POSITIONS,
    maxOpenPositionsScope:'main-kill-distance-entry',fillAnchorVersion:ZONE_MANUAL_VERSION,
    clientOrderId:`mzm_${key}`,manualZoneKey:key,manualZoneVersion:ZONE_MANUAL_VERSION,
    signalReason:`${ZONE_MANUAL_VERSION} | human confirmed ${c.side} | margin=${margin} USDT | zone=${c.zone.low}-${c.zone.high}`};
}
export function validZoneManualPlan(p,w,mark,now=Date.now()) {
  const c=mainDistanceCandidate({...w,markPrice:mark},now);
  return !!c&&p.source===ZONE_MANUAL_SOURCE&&p.manualZoneVersion===ZONE_MANUAL_VERSION
    &&p.mainDistanceWatchId===w.id&&p.mainDistanceZone?.low===c.zone.low&&p.mainDistanceZone?.high===c.zone.high
    &&p.side===(c.side==='LONG'?'BUY':'SELL')&&p.takeProfitPrice===c.takeProfitPrice
    &&p.leverage===5&&Number.isFinite(p.marginUsdt)&&p.marginUsdt>0&&p.notionalUsdt===p.marginUsdt*5
    &&p.orderType==='MARKET'&&p.dryRun===false&&p.allowMinNotionalCeil===false
    &&p.entryExpiresAt>=now&&p.entryExpiresAt<=now+15000&&p.protectionOnFill===true&&p.preserveSignalProtection===true
    &&Math.abs(mark/p.signalEntryPrice-1)<=.005
    &&p.stopLossRoePct===30&&p.stopLossDistanceFraction===.06&&p.takeProfitDistanceFraction==null
    &&Math.abs(p.stopLossPrice/p.signalEntryPrice-(c.side==='LONG'?.94:1.06))<1e-10;
}
// One immutable attempt per account + frozen MAIN cluster. A timeout is not proof
// of rejection: persist before submission, never replay after restart/double click.
export class LiquidityZoneManualOrders {
  constructor({file,getWatch,submit,now=Date.now}){Object.assign(this,{file,getWatch,submit,now});this.state=null;this.queue=Promise.resolve();}
  async load(){
    if(this.state)return;
    this.loading??=(async()=>{try{this.state=JSON.parse(await readFile(this.file,'utf8'));if(!this.state.attempts)throw Error('Invalid manual zone ledger');}
      catch(e){if(e.code!=='ENOENT')throw e;this.state={version:ZONE_MANUAL_VERSION,attempts:{}};}})();
    await this.loading;
  }
  async save(){await mkdir(dirname(this.file),{recursive:true});await writeFile(`${this.file}.tmp`,JSON.stringify(this.state,null,2));await rename(`${this.file}.tmp`,this.file);}
  async execute(input,accountKey,context){
    const run=this.queue.then(async()=>{
      await this.load();
      const plan=zoneManualPlan(await this.getWatch(input.watchId),input,accountKey,this.now());
      const previous=this.state.attempts[plan.manualZoneKey];
      if(previous)return {...previous,replayed:true};
      const a={key:plan.manualZoneKey,watchId:plan.mainDistanceWatchId,symbol:plan.symbol,side:input.side,
        marginUsdt:plan.marginUsdt,leverage:5,zone:plan.mainDistanceZone,takeProfitPrice:plan.takeProfitPrice,
        stopLossPrice:plan.stopLossPrice,at:this.now(),clientOrderId:plan.clientOrderId,status:'SUBMITTING'};
      this.state.attempts[a.key]=a;await this.save();
      try{const r=await this.submit(plan,context);a.status=r.status==='submitted'&&r.orderResult?.orderId?'SUBMITTED':'UNKNOWN';
        a.orderId=r.orderResult?.orderId??null;a.order=r.order;}
      catch(e){a.status=e.beforeZoneMarket===true?'REJECTED':'ERROR_OR_UNKNOWN';a.error=String(e.message).slice(0,500);}
      await this.save();return {...a};
    });this.queue=run.catch(()=>{});return run;
  }
}
