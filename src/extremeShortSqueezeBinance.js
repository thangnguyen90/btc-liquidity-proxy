import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {EXTREME_SHORT_SQUEEZE_VERSION} from './extremeShortSqueeze.js';
import {EXTREME_REBOUND_SWEEP_ROUTE,resolveOtherEntrySettings} from './otherEntryCatalog.js';
import {EXTREME_REBOUND_SWEEP_KIND,extremeReboundSweepDiscordEvent} from './extremeReboundSweepDiscord.js';

export const EXTREME_REBOUND_SWEEP_BINANCE_VERSION='EXTREME_REBOUND_SWEEP_SHORT_3USDT_V1_20261109';

export const EXTREME_SHORT_SQUEEZE_BINANCE_VERSION='EXTREME_SHORT_SQUEEZE_SAGA_15M_CLOSED_FOLLOW_6USDT_V5_20260926';
export const EXTREME_SHORT_SQUEEZE_ROUTE=Object.freeze({
  source:'extreme-short-squeeze',streamId:'extreme-short-squeeze',signalLabel:'EXTREME_PUMP_CLOSED',side:'SHORT',
});
export const EXTREME_SHORT_SQUEEZE_LIVE_FOLLOW_ROUTE=Object.freeze({
  source:'extreme-short-squeeze',streamId:'extreme-short-squeeze',signalLabel:'FOLLOW_REJECTION_LIVE',side:'SHORT',
});
export const EXTREME_SHORT_SQUEEZE_PEAK_ZONE_ROUTE=Object.freeze({
  source:'extreme-short-squeeze',streamId:'extreme-short-squeeze',signalLabel:'PEAK_ZONE_SHORT_WATCH',side:'SHORT',
});
export const EXTREME_SHORT_SQUEEZE_SAGA_15M_CLOSED_FOLLOW_ROUTE=Object.freeze({
  source:'extreme-short-squeeze',streamId:'extreme-short-squeeze-saga-15m',
  signalLabel:'FOLLOW_REJECTION_CLOSED',side:'SHORT',
});
export const EXTREME_SHORT_SQUEEZE_ROUTES=Object.freeze([
  EXTREME_SHORT_SQUEEZE_ROUTE,EXTREME_SHORT_SQUEEZE_LIVE_FOLLOW_ROUTE,EXTREME_SHORT_SQUEEZE_PEAK_ZONE_ROUTE,
  EXTREME_SHORT_SQUEEZE_SAGA_15M_CLOSED_FOLLOW_ROUTE,EXTREME_REBOUND_SWEEP_ROUTE,
]);
export const EXTREME_SHORT_SQUEEZE_MARGIN_USDT=1;
export const EXTREME_SHORT_SQUEEZE_PEAK_MARGIN_USDT=2;
export const EXTREME_SHORT_SQUEEZE_LEVERAGE=5;
export const EXTREME_SHORT_SQUEEZE_TP_ROE=.15;
export const EXTREME_SHORT_SQUEEZE_SL_ROE=.30;

export function isExtremeReboundSweepOrder(payload) {
  return payload.source===EXTREME_REBOUND_SWEEP_ROUTE.source
    &&payload.streamId===EXTREME_REBOUND_SWEEP_ROUTE.streamId
    &&payload.signalLabel===EXTREME_REBOUND_SWEEP_ROUTE.signalLabel;
}

export function validExtremeReboundSweepOrder(payload,markPrice,now=Date.now()) {
  return isExtremeReboundSweepOrder(payload) && payload.signalInterval==='5m'
    && payload.side==='SELL' && payload.orderType==='MARKET'
    && payload.fillAnchorVersion===EXTREME_REBOUND_SWEEP_BINANCE_VERSION
    && Number.isFinite(payload.entryExpiresAt) && now<=payload.entryExpiresAt
    && Number.isFinite(markPrice) && markPrice>0
    && Number.isFinite(payload.signalEntryPrice) && payload.signalEntryPrice>0
    && Math.abs(markPrice/payload.signalEntryPrice-1)<=.005;
}

export function extremeReboundPositionClear(context,symbol) {
  return context?.enabled===true && Array.isArray(context.positions) && Array.isArray(context.openOrders)
    && context.positions.every(p=>Number.isFinite(Number(p.positionAmt))
      && (p.symbol!==symbol || Number(p.positionAmt)===0))
    && !context.openOrders.some(o=>o.symbol===symbol
      && ![true,'true'].includes(o.reduceOnly) && ![true,'true'].includes(o.closePosition));
}

export function extremeShortSqueezeRoute(event) {
  if(event?.binanceEligible!==true||event?.observeOnly!==false)return null;
  if(event.kind===EXTREME_REBOUND_SWEEP_KIND&&event.interval==='5m')return EXTREME_REBOUND_SWEEP_ROUTE;
  if(event.symbol==='SAGAUSDT'&&event.interval==='15m'&&event.kind==='FOLLOW_REJECTION'
    &&event.stage==='FOLLOW_REJECTION_CLOSED'&&event.closed===true) {
    return EXTREME_SHORT_SQUEEZE_SAGA_15M_CLOSED_FOLLOW_ROUTE;
  }
  if(event.interval!=='5m')return null;
  if(event.kind==='EXTREME_PUMP'&&event.stage==='EXTREME_PUMP_CLOSED'&&event.closed===true)return EXTREME_SHORT_SQUEEZE_ROUTE;
  if(event.kind==='FOLLOW_REJECTION'&&event.stage==='FOLLOW_REJECTION_LIVE'&&event.closed===false)return EXTREME_SHORT_SQUEEZE_LIVE_FOLLOW_ROUTE;
  if(event.kind==='PEAK_ZONE_SHORT_WATCH'&&event.stage==='PEAK_ZONE_SHORT_WATCH_LIVE'&&event.closed===false)return EXTREME_SHORT_SQUEEZE_PEAK_ZONE_ROUTE;
  return null;
}

export function buildExtremeShortSqueezeOrder(event,{now=Date.now(),enabledAt,markPrice,routeState}={}) {
  const route=extremeShortSqueezeRoute(event);
  if(!route)return null;
  const rebound=route===EXTREME_REBOUND_SWEEP_ROUTE;
  const entrySettings=resolveOtherEntrySettings(route,routeState);
  if(!entrySettings)return null;
  const enabled=Date.parse(enabledAt);
  if(!Number.isFinite(enabled))return null;
  const eventAt=rebound?Math.max(event.candleCloseAt+1,event.sweptAt)
    :event.closed?Number(event.evaluatedCloseAt):Number(event.observedAt);
  if(rebound) {
    if(!extremeReboundSweepDiscordEvent(event,now)||!(event.candleAt>=enabled)
      ||!event.rebound||typeof event.sweepId!=='string'||!event.sweepId)return null;
  } else {
    const activationAt=event.closed?Number(event.evaluatedCloseAt):Number(event.evaluatedCandleAt);
    const generated=Date.parse(event.generatedAt);
    if(event.version!==EXTREME_SHORT_SQUEEZE_VERSION
      ||![activationAt,eventAt,generated].every(Number.isFinite)||activationAt<enabled||eventAt>now
      ||now-eventAt>90_000||generated>now||now-generated>90_000)return null;
    if(event.closed) {
      if(!(Number(event.evaluatedCloseAt)<now)||now-Number(event.evaluatedCloseAt)>90_000)return null;
    } else if(!(Number(event.evaluatedCandleAt)<=now&&Number(event.evaluatedCloseAt)>=now
      &&Number(event.liveUpdatedAt)<=now&&now-Number(event.liveUpdatedAt)<=30_000))return null;
  }
  const entry=Number(rebound?event.markPrice:event.price),mark=Number(markPrice);
  if(![entry,mark].every(v=>Number.isFinite(v)&&v>0)||Math.abs(mark/entry-1)>.005)return null;
  const leverage=entrySettings.leverage;
  const margin=entrySettings.marginUsdt;
  const takeProfitRoe=entrySettings.takeProfitRoePct/100;
  const tpDistance=takeProfitRoe/leverage;
  const slDistance=EXTREME_SHORT_SQUEEZE_SL_ROE/leverage;
  const stage=rebound?event.kind:event.stage;
  const key=`${event.symbol}|${event.interval}|${event.candleAt}|${stage}`;
  const version=rebound?EXTREME_REBOUND_SWEEP_BINANCE_VERSION:EXTREME_SHORT_SQUEEZE_BINANCE_VERSION;
  const expiresAt=rebound?eventAt+90_000
    :event.closed?Number(event.evaluatedCloseAt)+90_000:Number(event.liveUpdatedAt)+30_000;
  return {
    source:route.source,streamId:route.streamId,
    signalLabel:route.signalLabel,signalType:route.signalLabel,
    signalInterval:event.interval,executionPage:'binance-auto-controls',side:'SELL',symbol:event.symbol,
    orderType:'MARKET',marginUsdt:margin,
    notionalUsdt:margin*leverage,
    leverage,signalEntryPrice:entry,entryExpiresAt:expiresAt,
    takeProfitPrice:entry*(1-tpDistance),stopLossPrice:entry*(1+slDistance),
    takeProfitRoePct:entrySettings.takeProfitRoePct,
    protectionOnFill:true,preserveSignalProtection:true,fillAnchorEnabled:true,
    fillAnchorVersion:version,takeProfitDistanceFraction:tpDistance,
    stopLossDistanceFraction:slDistance,protectionSignalEntryPrice:entry,
    protectionSignalTakeProfitPrice:entry*(1-tpDistance),protectionSignalStopLossPrice:entry*(1+slDistance),
    allowMinNotionalCeil:!rebound,dryRun:false,maxOpenPositions:30,
    clientOrderId:`ess_${createHash('sha256').update(key).digest('hex').slice(0,26)}`,
    signalCombo:`${event.interval}|${stage}`,
    signalReason:rebound
      ? `${version} | sweep=${event.sweepId} | sweptAt=${new Date(event.sweptAt).toISOString()} | mark=${entry} | zone=${event.low}–${event.high} | drop=${event.rebound.dropPct}%`
      : `${version} | stage=${stage} | eventAt=${new Date(eventAt).toISOString()} | eval=${entry} | retrace=${event.retracePct}% | pump=${event.pumpPct}% | ATR=${event.spikeAtr}x | volume=${event.volumeRatio}x`,
  };
}

export class ExtremeShortSqueezeBinanceRunner {
  constructor({file,controls,now=()=>Date.now(),getContext,submit}) {
    Object.assign(this,{file,controls,now,getContext,submit});this.running=false;
  }
  async handle(event) {
    if(this.running)return {status:'busy'};
    this.running=true;
    try {
      const routeSpec=extremeShortSqueezeRoute(event);
      if(!routeSpec)return {status:'ineligible'};
      const route=this.controls.register(routeSpec),settings=this.controls.read();
      if(!settings.enabled||!settings.routes[route.key]?.enabled)return {status:'off'};
      let plan=buildExtremeShortSqueezeOrder(event,{now:this.now(),enabledAt:settings.routes[route.key].enabledAt,
        markPrice:routeSpec===EXTREME_REBOUND_SWEEP_ROUTE?event.markPrice:event.price,routeState:settings.routes[route.key]});
      if(!plan)return {status:'ineligible'};
      let state;
      try {state=JSON.parse(readFileSync(this.file,'utf8'));if(!state.attempts||!state.symbols)throw new Error('invalid');}
      catch(error){if(error.code!=='ENOENT')return {status:'state-error'};state={attempts:{},symbols:{}};}
      if(state.attempts[plan.clientOrderId]||this.now()-(state.symbols[plan.symbol]??0)<4*3600_000)return {status:'deduped'};
      const context=await this.getContext(plan.symbol);
      if(!context?.enabled)return {status:'runtime-off'};
      if(context.positions.some(p=>p.symbol===plan.symbol&&Math.abs(Number(p.positionAmt))>0))return {status:'existing-position'};
      if(context.openOrders.some(o=>o.symbol===plan.symbol&&o.reduceOnly!==true&&o.reduceOnly!=='true'&&o.closePosition!==true&&o.closePosition!=='true'))return {status:'existing-order'};
      const latest=this.controls.read();
      const latestRoute=latest.routes[route.key];
      if(!latest.enabled||latestRoute?.enabled!==true)return {status:'control-changed'};
      plan=buildExtremeShortSqueezeOrder(event,{now:this.now(),enabledAt:latestRoute.enabledAt,
        markPrice:context.markPrice,routeState:latestRoute});
      if(!plan)return {status:'price-or-age-blocked'};
      this.controls.assertEntry(plan);
      const save=()=>{mkdirSync(dirname(this.file),{recursive:true});writeFileSync(`${this.file}.tmp`,JSON.stringify(state));renameSync(`${this.file}.tmp`,this.file);};
      state.attempts[plan.clientOrderId]={symbol:plan.symbol,at:this.now(),status:'SUBMITTING'};state.symbols[plan.symbol]=this.now();save();
      try {
        const result=await this.submit(plan,context);
        state.attempts[plan.clientOrderId].status=result?.status??'UNKNOWN';save();
        return {status:result?.status??'UNKNOWN',orderId:result?.orderResult?.orderId??null,
          marginUsdt:plan.marginUsdt,leverage:plan.leverage,takeProfitRoePct:plan.takeProfitRoePct};
      } catch(error){state.attempts[plan.clientOrderId].status='ERROR_OR_UNKNOWN';save();throw error;}
    } finally {this.running=false;}
  }
}
