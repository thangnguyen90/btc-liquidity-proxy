import {closedPumpRows} from '../public/pump-turn-model.js';

export const PUMP_TURN_WARMUP_VERSION='PUMP_TURN_5M_REPAIR_V2_BOUNDED_PRIORITY6_20261018';
export const PUMP_TURN_WARMUP_POLICY=Object.freeze({intervalMs:10000,maxPerCycle:6,prioritySlots:2,
  limit:90,retryMs:60000,maxAgeMs:375000,requestPriority:6});
const symbolsOf=xs=>[...new Set((Array.isArray(xs)?xs:[]).filter(s=>/^[\p{L}\p{N}]{1,32}USDT$/u.test(s??'')))];

// Repair the exact closed tail the detector validates. A long cache or a recent
// socket tick alone does not prove that its closed candles are continuous.
export class PumpTurnWarmup{
  constructor({getSymbols=()=>[],getPrioritySymbols=()=>[],getRows=()=>[],seed=null,
    subscribe=null,blocked=()=>false,now=Date.now}={}){
    Object.assign(this,{getSymbols,getPrioritySymbols,getRows,seed,subscribe,blocked,now});
    this.cursor=0;this.busy=false;this.lastAttempts=new Map();this.lastCycleAt=null;this.lastCompletedAt=null;
    this.attempted=0;this.refreshed=0;this.failed=0;this.lastBatch=[];this.deferredReason=null;this.error=null;
  }
  async run(){
    if(this.busy)return;
    const at=this.now(),p=PUMP_TURN_WARMUP_POLICY;
    if(this.lastCycleAt!=null&&at-this.lastCycleAt<p.intervalMs)return;
    this.busy=true;
    try{
      const symbols=symbolsOf(this.getSymbols());
      if(!symbols.length){this.deferredReason='WAIT_UNIVERSE';return;}
      if(!this.seed){this.deferredReason='NO_SEED';return;}
      // Idempotent shared subscription; never wait for unrelated EMA/core tiers.
      this.subscribe?.(symbols);
      if(this.blocked()){this.deferredReason='REST_BLOCKED_OR_CONGESTED';return;}
      this.lastCycleAt=at;this.lastBatch=[];this.deferredReason=null;
      const wanted=s=>closedPumpRows(this.getRows(s),at).status!=='READY'
        &&(!this.lastAttempts.has(s)||at-this.lastAttempts.get(s)>=p.retryMs);
      const universe=new Set(symbols),selected=new Set(),jobs=[];
      for(const s of symbolsOf(this.getPrioritySymbols())){
        if(jobs.length>=p.prioritySlots)break;
        if(universe.has(s)&&wanted(s)){jobs.push(s);selected.add(s);}
      }
      // At least four slots remain for a fair, full-universe rotating cursor.
      for(let checked=0;checked<symbols.length&&jobs.length<p.maxPerCycle;checked++){
        const s=symbols[this.cursor++%symbols.length];
        if(!selected.has(s)&&wanted(s)){jobs.push(s);selected.add(s);}
      }
      let failed=false;
      for(const s of jobs){
        if(this.blocked()){this.deferredReason='REST_BLOCKED_OR_CONGESTED';break;}
        this.lastAttempts.set(s,this.now());this.attempted++;this.lastBatch.push(s);
        try{
          await this.seed(s,{subscribe:false,batchSize:1,batchDelayMs:0,force:true,maxAgeMs:p.maxAgeMs,
            requestPriority:p.requestPriority,requestSource:'PumpTurn.repair:5m'});
          if(closedPumpRows(this.getRows(s),this.now()).status==='READY')this.refreshed++;
          else{this.failed++;failed=true;}
        }catch{this.failed++;failed=true;}
      }
      this.error=failed?'Nạp/bù nến5m chưa thành công; đang thử lại theo lượt.':null;
      this.lastCompletedAt=this.now();
      for(const s of this.lastAttempts.keys())if(!universe.has(s))this.lastAttempts.delete(s);
    }catch{this.error='Không chạy được vòng bù nến5m; sẽ thử lại.';}
    finally{this.busy=false;}
  }
  start(){
    if(this.timer)return;
    void this.run();this.timer=setInterval(()=>void this.run(),PUMP_TURN_WARMUP_POLICY.intervalMs);this.timer.unref?.();
  }
  stop(){clearInterval(this.timer);this.timer=null;}
  snapshot(){
    const counts={READY:0,INSUFFICIENT:0,STALE:0,INVALID_OR_GAP:0},samples=[],now=this.now();
    const symbols=symbolsOf(this.getSymbols());
    for(const symbol of symbols){const r=closedPumpRows(this.getRows(symbol),now);counts[r.status]++;
      if(r.status!=='READY'&&samples.length<5)samples.push({symbol,status:r.status,reason:r.reason,bars:r.bars,lastClosedAt:r.lastClosedAt});}
    return {version:PUMP_TURN_WARMUP_VERSION,independentOfCoreWarmup:true,policy:PUMP_TURN_WARMUP_POLICY,
      busy:this.busy,updatedAt:this.lastCompletedAt,lastCycleAt:this.lastCycleAt,total:symbols.length,ready:counts.READY,
      pending:symbols.length-counts.READY,counts,attempted:this.attempted,refreshed:this.refreshed,failed:this.failed,
      lastBatch:[...this.lastBatch],deferredReason:this.deferredReason,error:this.error,samples};
  }
}
