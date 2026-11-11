import {createHash} from 'node:crypto';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
export const SELL_FLOW_SOURCE='pump-squeeze-sell-flow-short';
export const SELL_FLOW_VERSION='SHORT_EP_LONG_SELL55_MARKET_2USD_3X_TP5_SL20_V1_20261108';
export const SELL_FLOW_ROUTE=Object.freeze({source:SELL_FLOW_SOURCE,streamId:'closed-15m-sell-flow',signalLabel:'SHORT_EP_LONG_SELL_GE55',side:'SHORT'});
export const SELL_FLOW_RULE=Object.freeze({marginUsdt:2,leverage:3,takeProfitRoePct:5,stopLossRoePct:20,maxOpenPositions:5,maxHoldMs:8*3600000,maxEventAgeMs:30000,maxPriceDrift:.005});
export const SELL_FLOW_KEY=JSON.stringify([SELL_FLOW_SOURCE,SELL_FLOW_ROUTE.streamId,SELL_FLOW_ROUTE.signalLabel,'SHORT']);
const clone=x=>structuredClone(x),num=x=>typeof x==='number'&&Number.isFinite(x),epoch=x=>typeof x==='number'?x:Date.parse(x??''),same=(a,b)=>num(a)&&num(b)&&Math.abs(a-b)<1e-9;
export function sellFlowVolume(rows,decisionAt){
 const xs=(Array.isArray(rows)?rows:[]).filter(b=>+b[6]<decisionAt).slice(-23);
 if(xs.length!==23||xs.some((b,i)=>+b[0]!==decisionAt-(23-i)*300000||+b[6]!==+b[0]+299999||![1,2,3,4,7,10].every(k=>Number.isFinite(+b[k]))||+b[7]<0||+b[10]<0||+b[10]>+b[7]+1e-6))return null;
 const q=xs.slice(-3).reduce((s,b)=>s+ +b[7],0),buy=xs.slice(-3).reduce((s,b)=>s+ +b[10],0),old=xs.slice(0,20).reduce((s,b)=>s+ +b[7],0);
 if(!(q>0&&old>0))return null;
 return{sellPct:100*(1-buy/q),quote15m:q,volume15m:q/(old/20*3),rows:clone(xs),asOf:decisionAt-1};
}
export function sellFlowProof(e,rows,now=Date.now()){
 const p=e?.position;
 if(e?.version!=='PUMP_SQUEEZE_WHALE_SMART_SHORT_V1_20261106'||e.status!=='QUALIFIED'||e.side!=='SHORT'||e.group!=='PUMP_SQUEEZE_WHALE_SMART_LONG_WEAKENING'||e.delivery?.status!=='SENT'
 ||!/^[\p{L}\p{N}]{1,32}USDT$/u.test(e.symbol??'')||![e.decisionAt,e.observedAt,e.tokenSourceAt,e.delivery.at].every(num)
 ||e.tokenSourceAt>e.observedAt||e.observedAt>now||e.delivery.at>now||e.decisionAt>e.observedAt||now-e.observedAt>30000||now-e.decisionAt>450000||now-e.tokenSourceAt>900000
 ||!p||!num(p.whaleCount)||p.whaleCount<10||!['whaleLong','smartLong','previousWhaleLong','previousSmartLong','crowdLong'].every(k=>num(p[k])&&p[k]>=0&&p[k]<=100)
 ||p.crowdLong<60||!(p.whaleLong<p.previousWhaleLong&&p.smartLong<p.previousSmartLong)
 ||!num(p.whaleAt)||p.whaleAt>e.decisionAt-900000||!num(p.previousWhaleAt)||(p.whaleAt-p.previousWhaleAt)<3*3600000||(p.whaleAt-p.previousWhaleAt)>5*3600000
 ||!num(p.whaleObservedAt)||p.whaleObservedAt>e.observedAt||!num(p.previousWhaleObservedAt)||p.previousWhaleObservedAt>e.observedAt
 ||e.eventId!==e.symbol+':'+e.decisionAt+':'+p.whaleAt)return null;
 const f=sellFlowVolume(rows,e.decisionAt);if(!f||Math.abs(+f.rows.at(-1)[4]/e.price.price-1)>1e-9)return null;return f;
}
export function buildSellFlowOrder(e,rows,{now=Date.now(),enabledAt,startedAt,markPrice}={}){
 const f=sellFlowProof(e,rows,now),activation=epoch(enabledAt),start=epoch(startedAt),mark=Number(markPrice);
 if(!f||f.sellPct<55||![activation,start,mark].every(Number.isFinite)||!(activation>0&&start>0&&mark>0)||e.decisionAt<=Math.max(activation,start)||Math.abs(mark/e.price.price-1)>.005)return null;
 return{...SELL_FLOW_ROUTE,...SELL_FLOW_RULE,side:'SELL',symbol:e.symbol,orderType:'MARKET',notionalUsdt:6,
 signalType:SELL_FLOW_ROUTE.signalLabel,signalInterval:'5m',executionPage:'pump-squeeze-whale-smart-short',signalCombo:'CROWD_LONG60|WHALE_SMART_DOWN4H|SELL15M_GE55',
 signalEntryPrice:mark,takeProfitPrice:mark*(1-.05/3),stopLossPrice:mark*(1+.20/3),takeProfitDistanceFraction:.05/3,stopLossDistanceFraction:.20/3,
 protectionSignalEntryPrice:mark,protectionSignalTakeProfitPrice:mark*(1-.05/3),protectionSignalStopLossPrice:mark*(1+.20/3),
 protectionOnFill:true,preserveSignalProtection:true,fillAnchorEnabled:true,fillAnchorVersion:SELL_FLOW_VERSION,
 maxOpenPositionsScope:SELL_FLOW_SOURCE,entryActivationAt:activation,entryRunnerStartedAt:start,entryExpiresAt:e.observedAt+30000,
 allowMinNotionalCeil:false,dryRun:false,sellFlowSnapshot:{event:clone(e),proof:f},
 clientOrderId:'sq55_'+createHash('sha256').update(e.eventId).digest('hex').slice(0,28),
 signalReason:SELL_FLOW_VERSION+' | sell15m='+f.sellPct.toFixed(4)+'% | vol15m='+f.volume15m.toFixed(4)+'x | '+e.eventId};
}
export function validSellFlowOrder(p,mark=p?.signalEntryPrice,now=Date.now()){
 const e=p?.sellFlowSnapshot?.event,rows=p?.sellFlowSnapshot?.proof?.rows;if(!e)return false;
 const rebuilt=buildSellFlowOrder(e,rows,{now,enabledAt:p.entryActivationAt,startedAt:p.entryRunnerStartedAt,markPrice:p.signalEntryPrice});
 if(!rebuilt||p.source!==SELL_FLOW_SOURCE||p.streamId!==SELL_FLOW_ROUTE.streamId||p.signalLabel!==SELL_FLOW_ROUTE.signalLabel||p.side!=='SELL'||p.orderType!=='MARKET'||p.fillAnchorVersion!==SELL_FLOW_VERSION||p.clientOrderId!==rebuilt.clientOrderId||p.dryRun!==false||p.allowMinNotionalCeil!==false||p.protectionOnFill!==true||p.fillAnchorEnabled!==true||p.preserveSignalProtection!==true||p.maxOpenPositionsScope!==SELL_FLOW_SOURCE||!(Number(mark)>0)||Math.abs(Number(mark)/p.signalEntryPrice-1)>.005)return false;
 return['marginUsdt','leverage','notionalUsdt','takeProfitRoePct','stopLossRoePct','maxOpenPositions','entryExpiresAt','takeProfitPrice','stopLossPrice','takeProfitDistanceFraction','stopLossDistanceFraction','protectionSignalEntryPrice','protectionSignalTakeProfitPrice','protectionSignalStopLossPrice'].every(k=>same(p[k],rebuilt[k]));
}
export function sellFlowOpenSlots({positions=[],fills={},attempts={},excludeClientOrderId=null}={}){
 if(!Array.isArray(positions)||positions.some(p=>!Number.isFinite(Number(p.positionAmt))))throw Error('ACCOUNT_DATA_MISSING');
 const live=new Set(positions.filter(p=>+p.positionAmt<0).map(p=>p.symbol)),slots=new Set(),closed=new Set();
 for(const x of Object.values(fills)){const r=x.record??x;if(r.signalSource!==SELL_FLOW_SOURCE)continue;if(r.positionStatus==='CLOSED')closed.add(r.clientOrderId);else if(live.has(r.symbol))slots.add(r.symbol);}
 for(const a of Object.values(attempts)){if(a.clientOrderId===excludeClientOrderId||closed.has(a.clientOrderId))continue;if(['SUBMITTING','UNKNOWN'].includes(a.status)||a.status==='SUBMITTED'&&live.has(a.symbol))slots.add(a.symbol);}return slots.size;
}
export function sellFlowMinimum(symbolInfo,mark){const lot=symbolInfo?.filters?.find(f=>f.filterType==='MARKET_LOT_SIZE')??symbolInfo?.filters?.find(f=>f.filterType==='LOT_SIZE'),minimum=Number(symbolInfo?.filters?.find(f=>f.filterType==='MIN_NOTIONAL')?.notional),step=Number(lot?.stepSize),qty=Math.floor((6/mark)/step+1e-9)*step;if(!symbolInfo||!(minimum>0&&step>0&&mark>0&&qty>0))return false;return qty>=Number(lot.minQty)&&qty<=Number(lot.maxQty)&&qty*mark>=minimum-1e-9&&qty*mark<=6+1e-8;}
export class SellFlowBinanceRunner{
 constructor({file,controls,getContext,getSymbols,getFills,submit,close,isProtectionExcluded=()=>false,now=Date.now,startedAt=now()}={}){Object.assign(this,{file,controls,getContext,getSymbols,getFills,submit,close,isProtectionExcluded,now,startedAt});this.queue=Promise.resolve();this.state={version:SELL_FLOW_VERSION,attempts:{}};this.error=null;}
 async init(){return this.initPromise??=(async()=>{try{const x=JSON.parse(await readFile(this.file,'utf8'));if(x.version!==SELL_FLOW_VERSION||!x.attempts||Array.isArray(x.attempts))throw Error('SCHEMA');this.state=x;}catch(e){if(e.code!=='ENOENT')this.error='LEDGER_READ_FAILED';}})();}
 async save(){await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(this.state));await rename(tmp,this.file);}
 snapshot(){const c=this.controls.read(),r=c.routes?.[SELL_FLOW_KEY];return{version:SELL_FLOW_VERSION,...SELL_FLOW_RULE,thresholdSellPct:55,enabled:c.enabled===true&&r?.enabled===true,enabledAt:r?.enabledAt??null,startedAt:this.startedAt,error:this.error,attempts:Object.values(this.state.attempts).slice(-50).reverse().map(({plan,...a})=>a)};}
 process(e,rows){const copy=clone({e,rows});const run=this.queue.catch(()=>{}).then(()=>this.handle(copy.e,copy.rows));this.queue=run.catch(()=>{});return run;}
 async handle(e,rows){await this.init();if(this.error)return{status:'STATE_ERROR'};const c=this.controls.read(),route=c.routes?.[SELL_FLOW_KEY];if(!c.enabled||!route?.enabled)return{status:'OFF'};
 const preview=buildSellFlowOrder(e,rows,{now:this.now(),enabledAt:route.enabledAt,startedAt:this.startedAt,markPrice:e.price?.price});if(!preview)return{status:'INELIGIBLE_OR_OLD'};if(this.state.attempts[e.eventId])return{status:'DEDUPED'};
 const a={id:e.eventId,symbol:e.symbol,at:this.now(),clientOrderId:preview.clientOrderId,status:'CHECKING',sellPct:preview.sellFlowSnapshot.proof.sellPct,marginUsdt:2,leverage:3};this.state.attempts[e.eventId]=a;try{await this.save();}catch{this.error='STORAGE_FAILED';return{status:'STATE_ERROR'};}
 let sending=false;try{
 if(this.isProtectionExcluded(e.symbol))throw Error('PROTECTION_EXCLUDED');
 const ctx=await this.getContext(e.symbol);if(ctx?.enabled!==true)throw Error('RUNTIME_OFF');if(!Array.isArray(ctx.positions)||!Array.isArray(ctx.openOrders))throw Error('ACCOUNT_DATA_MISSING');
 if(ctx.positions.some(p=>p.symbol===e.symbol&&+p.positionAmt!==0)||ctx.openOrders.some(o=>o.symbol===e.symbol&&![true,'true'].includes(o.reduceOnly)&&![true,'true'].includes(o.closePosition)))throw Error('EXISTING_POSITION_OR_ORDER');
 const fills=await this.getFills();if(sellFlowOpenSlots({positions:ctx.positions,fills,attempts:this.state.attempts,excludeClientOrderId:a.clientOrderId})>=5)throw Error('MAX_OWN_POSITIONS');
 const info=(await this.getSymbols()).find(s=>s.symbol===e.symbol);if(!sellFlowMinimum(info,ctx.markPrice))throw Error('MINIMUM_OR_PRECISION_EXCEEDS_2USD');
 const latest=this.controls.read().routes?.[SELL_FLOW_KEY];if(!latest?.enabled||latest.enabledAt!==route.enabledAt)throw Error('CONTROL_CHANGED');
 const plan=buildSellFlowOrder(e,rows,{now:this.now(),enabledAt:latest.enabledAt,startedAt:this.startedAt,markPrice:ctx.markPrice});if(!plan)throw Error('STALE_OR_PRICE_DRIFT');
 this.controls.assertEntry(plan);a.plan=plan;a.planBuiltAt=this.now();a.status='SUBMITTING';await this.save();sending=true;
 const result=await this.submit(plan,ctx);a.status='SUBMITTED';a.orderId=result?.orderResult?.orderId??null;a.submittedAt=this.now();await this.save();return{status:a.status,orderId:a.orderId};
 }catch(err){a.status=sending?'UNKNOWN':'SKIPPED';a.reason=String(err.message??err).slice(0,220);try{await this.save();}catch{this.error='STORAGE_FAILED';}return{status:a.status,reason:a.reason};}}
 async protectionPlanFor({symbol,side,orderId,clientOrderId}={}){await this.init();if(this.error||!orderId||!clientOrderId||!['SELL','SHORT'].includes(side))return null;const a=Object.values(this.state.attempts).find(a=>a.symbol===symbol&&a.clientOrderId===String(clientOrderId)&&(!a.orderId||String(a.orderId)===String(orderId))&&['SUBMITTING','SUBMITTED','UNKNOWN'].includes(a.status));return a?.plan&&validSellFlowOrder(a.plan,a.plan.signalEntryPrice,a.planBuiltAt)?clone(a.plan):null;}
 async expire(){await this.init();if(this.error||this.expiring||!this.close)return;this.expiring=true;try{const fills=await this.getFills();for(const a of Object.values(this.state.attempts)){if(a.status!=='SUBMITTED'||a.closeAttempt)continue;const rs=Object.values(fills).map(x=>x.record??x).filter(r=>r.symbol===a.symbol&&r.positionStatus!=='CLOSED');if(rs.length!==1)continue;const r=rs[0];if(r.signalSource!==SELL_FLOW_SOURCE||r.clientOrderId!==a.clientOrderId||!(Date.parse(r.filledAt)>0)||this.now()-Date.parse(r.filledAt)<SELL_FLOW_RULE.maxHoldMs)continue;
 const ctx=await this.getContext(a.symbol);if(!ctx.enabled||this.isProtectionExcluded(a.symbol))continue;const pos=ctx.positions.find(p=>p.symbol===a.symbol&&+p.positionAmt<0);if(!pos||Math.abs(Math.abs(+pos.positionAmt)-+r.filledQty)>Math.max(1e-9,+r.filledQty*1e-7))continue;
 a.closeAttempt={at:this.now(),status:'RESERVED'};await this.save();try{const out=await this.close(a,ctx,pos);a.closeAttempt.status='SUBMITTED';a.closeAttempt.orderId=out?.orderId??null;}catch{a.closeAttempt.status='UNKNOWN';}await this.save();}}catch(e){this.lastMaintenanceError=String(e.message).slice(0,120);}finally{this.expiring=false;}}
}

