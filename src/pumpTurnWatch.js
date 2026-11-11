import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {PUMP_TURN_VERSION as VERSION,closedPumpRows,plannedPumpZones,confirmationChecks,livePumpZone} from '../public/pump-turn-model.js';
import {PumpTurnWarmup} from './pumpTurnWarmup.js';
import {capturePumpTurnLongPhase} from './pumpTurnNearShortBinance.js';
import {capturePumpTurnContext,PUMP_TURN_CONTEXT_VERSION} from '../public/pump-turn-context-model.js';
import {captureLongContext,PUMP_TURN_LONG_CONTEXT_VERSION} from '../public/pump-turn-long-context-model.js';
import {buildEarlyFlowZone,captureEarlyFlowContext,isEarlyFlow,EARLY_SHORT_VERSION,EARLY_SHORT_POLICY,EARLY_LONG_VERSION,EARLY_LONG_POLICY} from '../public/pump-turn-early-short-model.js';
import {plannedShortFlowZone,captureShortFlowContext,SHORT_FLOW_VERSION} from '../public/pump-turn-short-flow-model.js';
const DAY=86400000;
const validSymbol=s=>/^[\p{L}\p{N}]{1,32}USDT$/u.test(s??'');
const copy=x=>structuredClone(x);
function captureFlowContext(event){
  const key=event.side==='LONG'?'earlyLongContext':'earlyShortContext';
  event[key]=captureEarlyFlowContext(event);
}
export class PumpTurnWatch{
  constructor({file,getSymbols=()=>[],getRows=()=>[],getForming=()=>null,getLive=()=>null,seed=null,subscribe=null,blocked=()=>false,discordSender=null,onNearShort=null,nearShortEnabled=()=>false,onNearLong=null,nearLongEnabled=()=>false,getLongPhaseRows=()=>[],nearExecutionLeverage=()=>5,onNearShortPush=null,nearShortPushEnabled=()=>false,now=Date.now}={}){
    Object.assign(this,{file,getSymbols,getRows,getForming,getLive,seed,blocked,discordSender,onNearShort,nearShortEnabled,onNearLong,nearLongEnabled,getLongPhaseRows,nearExecutionLeverage,onNearShortPush,nearShortPushEnabled,now});
    this.startedAt=now();this.settings={discordEnabled:true,nearPct:.75};this.history=[];this.confirmed=[];this.lastAlerts={};this.rows=[];this.coverage={total:0,ready:0,updatedAt:null};
    this.earlyPending=new Map();this.busy=false;this.error=null;this.initPromise=null;
    this.warmer=new PumpTurnWarmup({getSymbols,getRows,seed,subscribe,blocked,now,
      getPrioritySymbols:()=>[...this.rows.filter(r=>r.side==='SHORT'&&['NEAR','IN_ZONE'].includes(r.state)).map(r=>r.symbol),
        ...this.history.filter(e=>e.side==='SHORT'&&now()-e.observedAt<3600000).slice(-10).reverse().map(e=>e.symbol)]});
  }
  async init(){return this.initPromise??=this.load();}
  async load(){if(!this.file)return;try{const s=JSON.parse(await readFile(this.file,'utf8'));if(s.version!==VERSION)throw Error('schema');
    this.history=Array.isArray(s.history)?s.history:[];this.confirmed=Array.isArray(s.confirmed)?s.confirmed:[];this.lastAlerts=s.lastAlerts&&typeof s.lastAlerts==='object'?s.lastAlerts:{};
    if(typeof s.settings?.discordEnabled==='boolean')this.settings.discordEnabled=s.settings.discordEnabled;
    if(Number.isFinite(s.settings?.nearPct)&&s.settings.nearPct>=.1&&s.settings.nearPct<=3)this.settings.nearPct=s.settings.nearPct;
  }catch(e){if(e.code!=='ENOENT')this.error='Không đọc được lịch sử; dừng gửi để kiểm tra.';}}
  async save(){
    const now=this.now();this.history=this.history.filter(e=>now-e.observedAt<14*DAY).slice(-1000);this.confirmed=this.confirmed.filter(e=>now-e.at<14*DAY).slice(-1000);
    this.lastAlerts=Object.fromEntries(Object.entries(this.lastAlerts).filter(([,v])=>Number.isFinite(v)&&now-v<14*DAY));
    if(!this.file)return;
    try{await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;
      await writeFile(tmp,JSON.stringify({version:VERSION,settings:this.settings,history:this.history,confirmed:this.confirmed,lastAlerts:this.lastAlerts}));await rename(tmp,this.file);
    }catch{this.error='Không lưu được lịch sử; dừng gửi.';throw Error('PUMP_TURN_STORAGE_FAILED');}
  }
  async update(body){await this.init();if(this.busy||this.error)throw Error('BUSY_OR_STORAGE');
    if(typeof body.discordEnabled!=='boolean'||!Number.isFinite(body.nearPct)||body.nearPct<.1||body.nearPct>3)throw Error('INVALID_SETTINGS');
    this.busy=true;try{this.settings={discordEnabled:body.discordEnabled,nearPct:body.nearPct};await this.save();return this.snapshot();}finally{this.busy=false;}}
  async warmup(){await this.warmer.run();}
  async scan(){
    await this.init();if(this.busy||this.error)return;this.busy=true;
    try{
      const now=this.now(),symbols=[...new Set(this.getSymbols())].filter(validSymbol),out=[],updates=[],confirmed=[],proofs=new Map(),pushIds=new Set();
      const coverage={total:symbols.length,ready:0,insufficient:0,stale:0,gap:0,updatedAt:now};
      for(const symbol of symbols){
        const read=closedPumpRows(this.getRows(symbol),now);
        if(read.status!=='READY'){coverage[read.status==='STALE'?'stale':read.status==='INSUFFICIENT'?'insufficient':'gap']++;continue;}
        coverage.ready++;const closed=read.rows,last=closed.at(-1),point=this.getLive(symbol);
        const shortFlow=plannedShortFlowZone(symbol,closed);
        const next=[...plannedPumpZones(symbol,closed),...(shortFlow?[shortFlow]:[])].filter(p=>p.contextEligible).map(p=>livePumpZone(p,point,now,this.settings.nearPct));
        const early=buildEarlyFlowZone(symbol,closed,this.getForming(symbol),point,now);
        if(early){
          const prior=this.earlyPending.get(symbol),same=prior&&prior.side===early.side&&prior.formingAt===early.earlyFormingAt&&now-prior.lastAt<=25000;
          const pending=same?{...prior,lastAt:now,samples:prior.samples+(point.at>prior.liveAt?1:0),liveAt:point.at}
            :{side:early.side,formingAt:early.earlyFormingAt,firstAt:now,lastAt:now,liveAt:point.at,samples:1};
          this.earlyPending.set(symbol,pending);
          if(pending.samples>=2&&now-pending.firstAt>=EARLY_SHORT_POLICY.sustainMs)
            next.push({...early,earlyFirstAt:pending.firstAt,earlySustainMs:now-pending.firstAt,earlySamples:pending.samples});
        }else this.earlyPending.delete(symbol);
        const priorPlans=plannedPumpZones(symbol,closed.slice(0,-1));
        const passed=priorPlans.map(p=>({...p,...confirmationChecks(p,last)})).filter(p=>p.passed);
        for(const p of passed){
          const e={id:`pump-turn-confirmed:${symbol}:${p.side}:${last.end}`,symbol,side:p.side,at:last.end,referencePrice:last.c,zoneLow:p.zoneLow,zoneHigh:p.zoneHigh,checks:p.checks};
          const previous=[...this.confirmed,...confirmed].filter(x=>x.symbol===symbol&&x.side===p.side&&x.id!==e.id).at(-1);
          if(previous&&e.at-previous.at<6*3600000)continue;
          if(!this.confirmed.some(x=>x.id===e.id)&&!confirmed.some(x=>x.id===e.id)&&e.at>this.startedAt)confirmed.push(e);
          // Latest completed signal is evidence only, current entry distance is shown separately.
          const row=livePumpZone({...p,id:e.id,asOf:last.end,expiresAt:last.end+300001,chart:closed.slice(-48),confirmation:e,contextEligible:true},point,now,this.settings.nearPct);
          row.closedConfirmed=true;row.alertEligible=false;out.push(row);
        }
        for(const row of next)if(['NEAR','IN_ZONE'].includes(row.state)){
          row.observedAt=now;if(isEarlyFlow(row))captureFlowContext(row);else if(row.side==='LONG')row.longContext=captureLongContext(row);else if(row.shortFlowOnly)row.shortFlowContext=captureShortFlowContext(row);else row.nearContext=capturePumpTurnContext(row);
        }
        out.push(...next);
        for(const row of next){
          if(updates.length>=5)break;
          const earlyFlow=isEarlyFlow(row);
          if(earlyFlow&&updates.filter(e=>isEarlyFlow(e)&&e.side===row.side).length>=EARLY_SHORT_POLICY.maxPerCycle)continue;
          const key=symbol+':'+(earlyFlow?row.side+'_FLOW_EARLY':row.shortFlowOnly?'SHORT_FLOW':row.side);
          const strongLong=row.side==='LONG'&&row.longContext?.label==='STRONG_BUY';
          let trading=!earlyFlow&&(row.side==='SHORT'?!row.shortFlowOnly&&this.onNearShort&&this.nearShortEnabled():this.onNearLong&&strongLong&&this.nearLongEnabled());
          const pushing=!earlyFlow&&row.side==='SHORT'&&!row.shortFlowOnly&&this.onNearShortPush&&this.nearShortPushEnabled();
          if(!row.alertEligible||(!(this.settings.discordEnabled&&this.discordSender)&&!trading&&!pushing)||point?.at<this.startedAt||now-(this.lastAlerts[key]??0)<3600000)continue;
          const e={...row,chart:undefined,id:'pump-turn-near:'+row.id,observedAt:now,marketRuleEnabled:!!trading,marketExecutionLeverage:this.nearExecutionLeverage(),delivery:{status:'PENDING'}};
          if(earlyFlow)captureFlowContext(e);else if(e.shortFlowOnly)e.shortFlowContext=captureShortFlowContext(e);else if(e.side==='SHORT')e.nearContext=capturePumpTurnContext(e);else e.longContext=captureLongContext(e);
          let phaseRows;
          if(strongLong){
            try{phaseRows=this.getLongPhaseRows(symbol,now);}catch{phaseRows=[];}
            e.longPumpPhase=capturePumpTurnLongPhase(e,phaseRows);
            if(e.longPumpPhase.state!=='FIRST_PUSH'){trading=false;e.marketRuleEnabled=false;}
          }
          if(!(this.settings.discordEnabled&&this.discordSender)&&!trading&&!pushing)continue;
          this.lastAlerts[key]=now;this.history.push(e);updates.push(e);
          if(trading)proofs.set(e.id,{...copy(e),nearPct:this.settings.nearPct,preRows:copy(closed.slice(-72)),
            ...(e.side==='LONG'?{phaseRows:copy(phaseRows)}:{})});
          if(pushing)pushIds.add(e.id);
          // Avoid an initial burst monopolizing the scanner. Other eligible coins remain for a later cycle.
        }
      }
      for(const [symbol,p] of this.earlyPending)if(now-p.lastAt>30000)this.earlyPending.delete(symbol);
      this.rows=out;this.coverage=coverage;this.confirmed.push(...confirmed);
      if(updates.length||confirmed.length)await this.save(); // reserve before POST, no replay after unknown delivery/restart
      for(const e of updates)if(proofs.has(e.id))void Promise.resolve().then(()=> (e.side==='LONG'?this.onNearLong:this.onNearShort)(proofs.get(e.id))).catch(()=>{});
      for(const e of updates)if(pushIds.has(e.id))void Promise.resolve().then(()=>this.onNearShortPush(copy(e))).catch(()=>{});
      for(const e of updates){
        if(!this.settings.discordEnabled||!this.discordSender){e.delivery={status:'DISABLED'};continue;}
        try{const r=await this.discordSender(e);e.delivery={...r,status:r.sent>0?'SENT':'FAILED',at:this.now()};}
        catch{e.delivery={status:'UNKNOWN',at:this.now()};}
      }
      if(updates.length)await this.save();
      if(now-(this.lastPruneAt??0)>3600000){this.lastPruneAt=now;await this.save();}
      void this.warmup();
    }catch{if(!this.error)this.error='Quét vùng dự tính lỗi; dừng gửi để kiểm tra.';}
    finally{this.busy=false;}
  }
  start(){if(this.timer)return;this.warmer.start();void this.scan();this.timer=setInterval(()=>void this.scan(),10000);this.timer.unref?.();}
  stop(){clearInterval(this.timer);this.timer=null;this.warmer.stop();}
  snapshot(id=null){
    const now=this.now(),rank={IN_ZONE:0,NEAR:1,FAR:2,WAIT_PRICE:3,CHASE:4,INVALIDATED:5,EXPIRED:6};
    const rows=this.rows.map(r=>({...r,state:now>=r.expiresAt?'EXPIRED':r.liveAt&&now-r.liveAt>30000?'WAIT_PRICE':r.state})).sort((a,b)=>(rank[a.state]??9)-(rank[b.state]??9)||(a.distancePct??Infinity)-(b.distancePct??Infinity));
    const selected=id?[...rows,...this.history,...this.confirmed].find(e=>e.id===id)??null:null;
    const pending=[...this.earlyPending.values()];
    const earlyLongPolicy={version:EARLY_LONG_VERSION,...EARLY_LONG_POLICY,pending:pending.filter(p=>p.side==='LONG').length,observeOnly:true,affectsOrders:false};
    return copy({version:VERSION,contextVersion:PUMP_TURN_CONTEXT_VERSION,longContextVersion:PUMP_TURN_LONG_CONTEXT_VERSION,shortFlowVersion:SHORT_FLOW_VERSION,earlyShortPolicy:{version:EARLY_SHORT_VERSION,...EARLY_SHORT_POLICY,pending:pending.filter(p=>p.side==='SHORT').length,observeOnly:true,affectsOrders:false},earlyLongPolicy,observeOnly:true,settings:this.settings,discordConfigured:!!this.discordSender,strongLongDiscordRoute:this.discordSender?.strongLongRoute??null,error:this.error,startedAt:this.startedAt,coverage:this.coverage,warmup:this.warmer.snapshot(),warmupError:this.warmer.error,rows,history:this.history.slice(-100).reverse(),confirmed:this.confirmed.slice(-100).reverse(),selected});
  }
}
