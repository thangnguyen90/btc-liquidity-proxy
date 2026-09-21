import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {POST_PUMP_EMA99_RETEST_VERSION,EMA99_REBOUND_PUMP_NEAR_REJECT_STAGE} from './postPumpEma99Retest.js';
import {ema99Margin,ema99Leverage,ema99TakeProfitRoe} from './ema99EntryCatalog.js';
import {withEma99EntryProtection} from './ema99ShortStopLoss.js';
export const EMA99_NEAR_REJECT_BINANCE_VERSION='EMA99_NEAR_REJECT_MARKET_EDITABLE_LEVERAGE_V2_20260913';
export const EMA99_NEAR_REJECT_ROUTE={source:'ema99-near-reject-short',signalLabel:EMA99_REBOUND_PUMP_NEAR_REJECT_STAGE,signalType:EMA99_REBOUND_PUMP_NEAR_REJECT_STAGE,streamId:'ema99-retest',executionPage:'binance-auto-controls',side:'SELL'};
export function buildEma99NearRejectOrder(event,{now=Date.now(),enabledAt,markPrice,leverage=5,takeProfitRoePct=15}={}) {
  if(event?.version!==POST_PUMP_EMA99_RETEST_VERSION||event.stage!==EMA99_REBOUND_PUMP_NEAR_REJECT_STAGE
    ||event.pumpLegType!=='REBOUND_PUMP_AFTER_DUMP'
    ||event.side!=='SHORT'||event.closed!==true||event.nearMiss!==true||!['5m','15m'].includes(event.interval))return null;
  const closeAt=Number(event.candleCloseAt),generated=Date.parse(event.generatedAt),start=Date.parse(enabledAt);
  if(![closeAt,generated,start].every(Number.isFinite)||closeAt<start||closeAt>=now||now-closeAt>90_000
    ||generated>now||now-generated>90_000)return null;
  const entry=Number(event.referenceEntry),tp=Number(event.takeProfit),sl=Number(event.invalidation),mark=Number(markPrice);
  if(![entry,tp,sl,mark].every(v=>Number.isFinite(v)&&v>0)||!(tp<mark&&mark<sl)||!(tp<entry&&entry<sl))return null;
  // Do not chase a price that has already left the candle-close reference.
  if(Math.abs(mark/entry-1)>.005)return null;
  const key=`${event.symbol}|${event.interval}|${event.candleAt}|${event.stage}`;
  return withEma99EntryProtection({...EMA99_NEAR_REJECT_ROUTE,signalInterval:event.interval,symbol:event.symbol,orderType:'MARKET',notionalUsdt:5*leverage,leverage,takeProfitRoePct,
    signalEntryPrice:entry,entryExpiresAt:closeAt+90_000,
    takeProfitPrice:tp,stopLossPrice:sl,protectionOnFill:true,preserveSignalProtection:true,
    allowMinNotionalCeil:false,dryRun:false,clientOrderId:`enrs_${createHash('sha256').update(key).digest('hex').slice(0,26)}`,
    signalReason:`${event.reason} | ${event.interval} | closed=${new Date(closeAt).toISOString()} | gap=${event.gapToEmaPct}% | wick=${event.upperWickPct}% | vol=${event.volumeRatio}x`,
    signalCombo:`${event.interval}|${event.stage}`,maxOpenPositions:30});
}
export class Ema99NearRejectRunner {
  constructor({file,controls,now=()=>Date.now(),getContext,submit,routeSpec=EMA99_NEAR_REJECT_ROUTE,buildOrder=buildEma99NearRejectOrder,referencePrice=e=>e?.referenceEntry}){Object.assign(this,{file,controls,now,getContext,submit,routeSpec,buildOrder,referencePrice});this.running=false;}
  async handle(event){
    const result=await this.handleEvent(event);
    const route=this.controls.register({...this.routeSpec,signalInterval:event?.interval});
    const routeState=this.controls.read().routes[route.key];
    return {marginUsdt:ema99Margin(routeState),leverage:ema99Leverage(routeState),takeProfitRoePct:ema99TakeProfitRoe(routeState),...result};
  }
  async handleEvent(event){
    if(this.running)return {status:'busy'};
    this.running=true;
    try {
      const route=this.controls.register({...this.routeSpec,signalInterval:event?.interval}),settings=this.controls.read();
      if(!settings.enabled||!settings.routes[route.key]?.enabled)return {status:'off'};
      const leverage=ema99Leverage(settings.routes[route.key]),takeProfitRoePct=ema99TakeProfitRoe(settings.routes[route.key]);
      if(takeProfitRoePct===null)return {status:'invalid-tp'};
      let plan=this.buildOrder(event,{now:this.now(),enabledAt:settings.routes[route.key].enabledAt,markPrice:this.referencePrice(event),leverage,takeProfitRoePct});
      if(!plan)return {status:'ineligible'};
      const margin=ema99Margin(settings.routes[route.key]);
      if(margin===null)return {status:'invalid-size'};
      plan={...plan,marginUsdt:margin,leverage,notionalUsdt:margin*leverage};
      let state;
      try{state=JSON.parse(readFileSync(this.file,'utf8'));if(!state.attempts||!state.symbols)throw new Error('invalid');}
      catch(e){if(e.code!=='ENOENT')return {status:'state-error'};state={attempts:{},symbols:{}};}
      if(state.attempts[plan.clientOrderId]||this.now()-(state.symbols[plan.symbol]??0)<4*3600_000)return {status:'deduped'};
      const context=await this.getContext(plan.symbol);
      if(!context?.enabled)return {status:'runtime-off'};
      if(context.positions.some(p=>p.symbol===plan.symbol&&Math.abs(Number(p.positionAmt))>0))return {status:'existing-position'};
      if(context.openOrders.some(o=>o.symbol===plan.symbol&&o.reduceOnly!==true&&o.reduceOnly!=='true'&&o.closePosition!==true&&o.closePosition!=='true'))return {status:'existing-order'};
      const latest=this.controls.read();
      this.controls.assertEntry(plan);
      const latestLeverage=ema99Leverage(latest.routes[route.key]),latestTakeProfitRoePct=ema99TakeProfitRoe(latest.routes[route.key]);
      if(latestTakeProfitRoePct===null)return {status:'invalid-tp'};
      plan=this.buildOrder(event,{now:this.now(),enabledAt:latest.routes[route.key]?.enabledAt,markPrice:context.markPrice,leverage:latestLeverage,takeProfitRoePct:latestTakeProfitRoePct});
      if(!plan)return {status:'price-or-age-blocked'};
      const latestMargin=ema99Margin(latest.routes[route.key]);
      if(latestMargin===null)return {status:'invalid-size'};
      plan={...plan,marginUsdt:latestMargin,leverage:latestLeverage,notionalUsdt:latestMargin*latestLeverage};
      const save=()=>{mkdirSync(dirname(this.file),{recursive:true});writeFileSync(`${this.file}.tmp`,JSON.stringify(state));renameSync(`${this.file}.tmp`,this.file);};
      // Write before submitting: uncertain network results never trigger a second order.
      state.attempts[plan.clientOrderId]={symbol:plan.symbol,at:this.now(),status:'SUBMITTING'};state.symbols[plan.symbol]=this.now();save();
      try {
        const result=await this.submit(plan,context);
        state.attempts[plan.clientOrderId].status=result?.status??'UNKNOWN';save();
        return {status:result?.status??'UNKNOWN',orderId:result?.orderResult?.orderId??null,marginUsdt:latestMargin,leverage:latestLeverage,takeProfitRoePct:latestTakeProfitRoePct};
      } catch(error){state.attempts[plan.clientOrderId].status='ERROR_OR_UNKNOWN';save();throw error;}
    } finally{this.running=false;}
  }
}
