import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export const MAIN_DISTANCE_VERSION='MAIN_KILL_DISTANCE_V2_SCOPED_MAX10_20261004';
export const MAIN_DISTANCE_SOURCE='main-kill-distance-entry';
export const MAIN_DISTANCE_MAX_POSITIONS=10;
export const MAIN_DISTANCE_ROUTES=['LONG','SHORT'].map(side=>({source:MAIN_DISTANCE_SOURCE,streamId:'active-main-distance',signalLabel:'MAIN_KILL_DISTANCE_2_5',side}));
export const mainDistanceRouteKey=r=>JSON.stringify([r.source,r.streamId,r.signalLabel,r.side]);
export const mainDistanceOldGlobalBlocked=a=>a?.status==='ERROR_OR_UNKNOWN'&&!a.orderId
  && /^Max open positions \(50\) reached\./.test(a.error??'');
const definitiveNotionalRejection=e=>/Order's notional must be no smaller than|Order notional below/i.test(String(e?.message??e?.error??''));
export function mainDistanceOpenSlots({positions,fills,attempts,now=Date.now(),excludeClientOrderId=null}){
  if(!Array.isArray(positions))throw Error('MAIN distance position snapshot missing');
  const live=new Set(positions.filter(p=>Number.isFinite(Number(p.positionAmt))&&Number(p.positionAmt)!==0)
    .map(p=>`${p.symbol}|${Number(p.positionAmt)>0?'LONG':'SHORT'}`));
  const slots=new Set(),closedClients=new Set();
  for(const item of Object.values(fills??{})){
    const r=item?.record??item;
    if(r?.signalSource!==MAIN_DISTANCE_SOURCE||r.streamId!=='active-main-distance'||r.signalLabel!=='MAIN_KILL_DISTANCE_2_5')continue;
    if(r.positionStatus==='CLOSED'){if(r.clientOrderId)closedClients.add(r.clientOrderId);continue;}
    const key=`${r.symbol}|${r.direction}`;
    if(live.has(key))slots.add(key);
  }
  for(const a of Object.values(attempts??{})){
    if(a.clientOrderId===excludeClientOrderId||closedClients.has(a.clientOrderId))continue;
    // Existing V1 max50 rejections occurred before submitting to Binance.
    if(mainDistanceOldGlobalBlocked(a))continue;
    if(a.status==='ERROR_OR_UNKNOWN'&&!a.orderId&&definitiveNotionalRejection(a))continue;
    const key=`${a.symbol}|${a.side}`;
    if(['SUBMITTED','FILLED','NEW','PARTIALLY_FILLED'].includes(a.status)){
      if(live.has(key)||now-Number(a.at)<120000)slots.add(key);
    }else if(['SUBMITTING','UNKNOWN','ERROR_OR_UNKNOWN'].includes(a.status)){
      // A timeout keeps its slot until reconciled; never assume no execution.
      slots.add(key);
    }
  }
  return slots.size;
}
export function mainDistanceClosedStats(fills,side){
  const groups=new Map();
  for(const item of Object.values(fills??{})){
    const r=item?.record??item;
    if(r?.signalSource!==MAIN_DISTANCE_SOURCE||r.streamId!=='active-main-distance'||r.signalLabel!=='MAIN_KILL_DISTANCE_2_5'
      ||r.direction!==side||r.positionStatus!=='CLOSED'||!(Number(r.marginUsdt)>0)||r.netRealizedPnlUsdt==null||!Number.isFinite(Number(r.netRealizedPnlUsdt)))continue;
    const key=r.closeGroupId??`${r.symbol}|${r.direction}|${r.closedAt}`;
    const g=groups.get(key)??{pnl:0,margin:0};g.pnl+=Number(r.netRealizedPnlUsdt);g.margin+=Number(r.marginUsdt);groups.set(key,g);
  }
  const roes=[...groups.values()].map(g=>100*g.pnl/g.margin),avgRoe=roes.length?roes.reduce((a,b)=>a+b,0)/roes.length:null;
  return {closedCount:roes.length,avgRoe,whitelistEligible:avgRoe!=null&&avgRoe>4};
}
export function mainDistanceCandidate(w,now=Date.now()) {
  if(!w?.enabled || w.role!=='MAIN_KILL' || w.consumedAtCapture || w.status!=='ACTIVE'
    || !w.seen || ['PRICE_PASSED','CLOSED_BEYOND','REJECTED_AFTER_SWEEP'].some(s=>w.seen[s])
    || w.historyIncomplete || !w.socketFresh || !(w.priceAt>0) || now-w.priceAt>15000 || w.priceAt>now+5000
    || !(w.lastClosedAt>0) || now-w.lastClosedAt>360000 || w.lastClosedAt>=now) return null;
  const mark=Number(w.markPrice),low=Number(w.zone?.low),high=Number(w.zone?.high);
  if(!Number.isFinite(mark)||!Number.isFinite(low)||!Number.isFinite(high)||!(mark>0&&low>0&&high>=low))return null;
  const side=mark<low?'LONG':mark>high?'SHORT':null;
  if(!side || (side==='LONG'?w.direction!=='UPPER':w.direction!=='LOWER'))return null;
  const tp=side==='LONG'?low:high, distancePct=Math.abs(tp-mark)/mark*100;
  if(distancePct<2.5)return null;
  if(!/^[\p{L}\p{N}]{1,40}USDT$/u.test(w.symbol))return null;
  const key=createHash('sha256').update(`${w.symbol}|MAIN_KILL|${low}|${high}`).digest('hex').slice(0,24);
  return {key,symbol:w.symbol,watchId:w.id,side,mark,zone:{low,high},takeProfitPrice:tp,distancePct,priceAt:w.priceAt};
}
export function mainDistancePlan(candidate,now=Date.now()) {
  const route=MAIN_DISTANCE_ROUTES.find(r=>r.side===candidate.side);
  return {...route,symbol:candidate.symbol,side:candidate.side==='LONG'?'BUY':'SELL',orderType:'MARKET',
    marginUsdt:2,leverage:5,notionalUsdt:10,dryRun:false,allowMinNotionalCeil:false,maxOpenPositions:MAIN_DISTANCE_MAX_POSITIONS,
    maxOpenPositionsScope:MAIN_DISTANCE_SOURCE,
    signalType:route.signalLabel,signalStageKey:'ACTIVE_MAIN_DISTANCE',executionPage:'liquidity-zone-manager',
    signalEntryPrice:candidate.mark,takeProfitPrice:candidate.takeProfitPrice,
    stopLossPrice:candidate.mark*(candidate.side==='LONG'?0.94:1.06),stopLossRoePct:30,
    protectionOnFill:true,preserveSignalProtection:true,fillAnchorEnabled:true,fillAnchorVersion:MAIN_DISTANCE_VERSION,
    // Only SL rebases to actual fill; TP stays at the frozen zone boundary.
    takeProfitDistanceFraction:null,stopLossDistanceFraction:0.06,
    protectionSignalEntryPrice:candidate.mark,protectionSignalTakeProfitPrice:candidate.takeProfitPrice,
    protectionSignalStopLossPrice:candidate.mark*(candidate.side==='LONG'?0.94:1.06),
    mainDistanceZone:candidate.zone,mainDistanceWatchId:candidate.watchId,entryExpiresAt:now+15000,
    clientOrderId:`mkd_${candidate.key}`,signalReason:`${MAIN_DISTANCE_VERSION} | distance=${candidate.distancePct}% | zone=${candidate.zone.low}-${candidate.zone.high}`};
}
export function validMainDistancePlan(p,mark=Number(p.signalEntryPrice),now=Date.now()) {
  const low=Number(p.mainDistanceZone?.low),high=Number(p.mainDistanceZone?.high),tp=Number(p.takeProfitPrice);
  return p.source===MAIN_DISTANCE_SOURCE && p.streamId==='active-main-distance' && p.signalLabel==='MAIN_KILL_DISTANCE_2_5'
    && p.orderType==='MARKET' && p.marginUsdt===2 && p.leverage===5 && p.notionalUsdt===10
    && p.stopLossRoePct===30 && p.stopLossDistanceFraction===0.06 && p.takeProfitDistanceFraction==null
    && p.protectionOnFill===true && p.preserveSignalProtection===true && p.fillAnchorEnabled===true
    && p.fillAnchorVersion===MAIN_DISTANCE_VERSION && p.allowMinNotionalCeil===false && p.maxOpenPositions===MAIN_DISTANCE_MAX_POSITIONS
    && p.maxOpenPositionsScope===MAIN_DISTANCE_SOURCE
    && Number.isFinite(mark) && mark>0 && low>0 && high>=low && Number.isFinite(high)
    && Number.isFinite(p.entryExpiresAt) && now<=p.entryExpiresAt && p.entryExpiresAt<=now+15000
    && Math.abs(tp-mark)/mark*100>=2.5
    && (p.side==='BUY'?tp===low&&tp>mark:p.side==='SELL'?tp===high&&tp<mark:false)
    && Math.abs(Number(p.stopLossPrice)/Number(p.signalEntryPrice)-(p.side==='BUY'?0.94:1.06))<1e-10;
}

export class MainKillDistanceRunner {
  constructor({file,controls,getWatches,getContext,getFills=async()=>({}),submit,pushSender,isProtectionExcluded,now=Date.now}) {
    Object.assign(this,{file,controls,getWatches,getContext,getFills,submit,pushSender,isProtectionExcluded,now});
    this.state=null;this.running=false;
  }
  async load(){
    if(this.state)return;
    try{this.state=JSON.parse(await readFile(this.file,'utf8'));if(!this.state.attempts)throw Error('Invalid MAIN distance state');}
    catch(e){if(e.code!=='ENOENT')throw e;this.state={version:MAIN_DISTANCE_VERSION,attempts:{}};}
  }
  async save(){this.state.version=MAIN_DISTANCE_VERSION;await mkdir(dirname(this.file),{recursive:true});await writeFile(`${this.file}.tmp`,JSON.stringify(this.state,null,2));await rename(`${this.file}.tmp`,this.file);}
  async tick(){
    if(this.running)return;this.running=true;
    try{
      await this.load();
      // Bounded sequential work; all watches are scanned again, processed keys never replay.
      const candidates=(await this.getWatches()).map(w=>mainDistanceCandidate(w,this.now())).filter(Boolean);
      let processed=0;
      for(const first of candidates){
        const previous=this.state.attempts[first.key];
        if(previous&&!mainDistanceOldGlobalBlocked(previous))continue;
        const route=MAIN_DISTANCE_ROUTES.find(r=>r.side===first.side), registered=this.controls.register(route);
        const settings=this.controls.read(),rs=settings.routes?.[registered.key];
        if(!settings.enabled||!rs?.enabled)continue;
        if(++processed>3)break;
        if(this.isProtectionExcluded(first.symbol))continue;
        const context=await this.getContext(first.symbol);
        if(!context?.enabled)continue;
        const openSlots=mainDistanceOpenSlots({positions:context.positions,fills:await this.getFills(),attempts:this.state.attempts,now:this.now()});
        this.openSlots=openSlots;
        if(openSlots>=MAIN_DISTANCE_MAX_POSITIONS)continue;
        if((context.positions??[]).some(p=>p.symbol===first.symbol&&Math.abs(Number(p.positionAmt))>0)
          ||(context.openOrders??[]).some(o=>o.symbol===first.symbol && ![true,'true'].includes(o.reduceOnly)&&![true,'true'].includes(o.closePosition)))continue;
        // Refresh lifecycle after REST latency before reserving an immutable attempt.
        const current=(await this.getWatches()).find(w=>w.id===first.watchId);
        const fresh=mainDistanceCandidate(current,this.now());
        const candidate=mainDistanceCandidate({...current,markPrice:context.markPrice},this.now());
        const latest=this.controls.read(),lr=latest.routes?.[registered.key];
        if(!fresh||!candidate||candidate.key!==first.key||candidate.side!==first.side||!latest.enabled||!lr?.enabled
          ||lr.enabledAt!==rs.enabledAt||this.isProtectionExcluded(first.symbol))continue;
        const plan=mainDistancePlan(candidate,this.now());
        if(!validMainDistancePlan(plan,context.markPrice,this.now()))continue;
        this.controls.assertEntry(plan);
        const attempt={...candidate,at:this.now(),status:'SUBMITTING',clientOrderId:plan.clientOrderId,
          ...(previous?{previousAttempts:[{...previous,previousAttempts:undefined}]}:{})};
        this.state.attempts[first.key]=attempt;await this.save(); // reserve before any order; unknown result never retried
        try{
          const result=await this.submit(plan,context);
          attempt.status=String(result?.status??'UNKNOWN').toUpperCase();attempt.orderId=result?.orderResult?.orderId??null;
        }catch(e){attempt.status=definitiveNotionalRejection(e)?'REJECTED':'ERROR_OR_UNKNOWN';attempt.error=String(e.message).slice(0,240);attempt.errorCode=e.code??null;}
        await this.save();
        try{attempt.push=await this.pushSender({signalType:'BINANCE_LIQUIDITY_ZONE_LIFECYCLE',eventId:`main-distance:${first.key}:${MAIN_DISTANCE_VERSION}`,
          title:`MAIN KILL ≥2.5% · ${candidate.side} ${first.symbol}`,
          body:`${attempt.status} · 2 USDT ×5x · cách ${candidate.distancePct.toFixed(2)}% · TP ${plan.takeProfitPrice} · SL −30% ROE. ${attempt.error??''}`,
          symbol:first.symbol,notifiedAt:this.now(),url:`/liquidity-zone-manager?symbol=${encodeURIComponent(first.symbol)}`});}
        catch(e){attempt.push={error:String(e.message).slice(0,160)};}
        await this.save();
      }
    }finally{this.running=false;}
  }
}
