import { PUMP_SUPPORT_VERSION, supportNetRR } from '../public/pump-support-model.js';

function levelsBefore(rows, end, pumpIndex, retestIndex, atr) {
  const levels = [{type:'FOOT', level:rows[pumpIndex].open, formedAt:rows[pumpIndex].closeTime}];
  for(let i=retestIndex+2;i<=end-2;i++) {
    if ([i-2,i-1,i+1,i+2].every(j=>rows[i].low<rows[j].low)) levels.push({type:'SWING_LOW',level:rows[i].low,formedAt:rows[i+2].closeTime});
  }
  for(let i=Math.max(retestIndex+3,end-24);i<=end;i++) {
    const base=rows.slice(i-3,i), high=Math.max(...base.map(r=>r.high)), low=Math.min(...base.map(r=>r.low));
    if(high-low<=1.5*atr && rows[i].close>high && rows[i].close>rows[i].open) levels.push({type:'BASE_BREAK',level:high,formedAt:rows[i].closeTime});
  }
  return levels.map(l=>({...l,zoneLow:l.level-.15*atr,zoneHigh:l.level+.15*atr}));
}
function nearestResistance(rows, end, pumpIndex, entry) {
  const levels=[rows[pumpIndex].high];
  // Confirmed pivots only: both right-side candles closed before the entry candle.
  for(let i=Math.max(2,pumpIndex-20);i<=end-2;i++) if([i-2,i-1,i+1,i+2].every(j=>rows[i].high>rows[j].high)) levels.push(rows[i].high);
  return levels.filter(p=>p>entry).sort((a,b)=>a-b)[0] ?? null;
}
export function buildPumpSupport(rows, { pumpIndex, retestIndex, atr, duration, now }) {
  const last=rows.at(-1), expiresAt=last.closeTime+duration+90000;
  const common={version:PUMP_SUPPORT_VERSION,watchOnly:true,binanceEligible:false,atr,expiresAt};
  if(!(atr>0) || rows.length<3 || retestIndex>=rows.length-1) return {...common,status:'WAIT_CONFIRM'};
  const plans=[];
  // A confirmation lives for at most two further closed bars; all levels are frozen BEFORE its bounce.
  for(let ci=Math.max(retestIndex+2,rows.length-3);ci<rows.length;ci++) {
    const bi=ci-1, bounce=rows[bi], confirm=rows[ci];
    const upVolumes=rows.slice(Math.max(retestIndex,bi-6),bi).filter(r=>r.close>r.open).map(r=>r.volume);
    if(!upVolumes.length || bounce.volume>0.8*Math.max(...upVolumes) || !(confirm.volume>bounce.volume)
      || !(confirm.close>bounce.high && confirm.close>confirm.open)) continue;
    for(const level of levelsBefore(rows,bi-1,pumpIndex,retestIndex,atr)) {
      if(level.formedAt>=bounce.openTime || bounce.low>level.zoneHigh || bounce.high<level.zoneLow
        || !(bounce.close>level.zoneHigh) || Math.min(bounce.open,bounce.close)-bounce.low < .25*(bounce.high-bounce.low)) continue;
      const reclaimed=rows.slice(retestIndex,bi).some(r=>r.closeTime>=level.formedAt && r.close>level.zoneHigh);
      if(!reclaimed) continue;
      const stop=Math.min(level.zoneLow,bounce.low)-.1*atr;
      const entry=confirm.close, target=nearestResistance(rows,ci-1,pumpIndex,entry), rr=supportNetRR(entry,stop,target);
      const rrCeiling=target>0 ? (target+1.5*stop)/(2.5*1.0012) : null;
      const entryLow=Math.max(bounce.high,level.zoneHigh,entry-.25*atr);
      const entryHigh=Math.min(entry+.35*atr,level.zoneHigh+atr,rrCeiling ?? entry);
      const broken=rows.slice(ci).some(r=>r.low<=stop);
      const status=broken?'BROKEN':!(rr>=1.5)?'NO_ROOM':entry>entryHigh||entryLow>entryHigh?'WAIT_RETEST':'WAIT_LIVE';
      plans.push({...common,...level,status,entry,entryLow,entryHigh,stop,target,rr,
        confirmedAt:confirm.closeTime,bounceAt:bounce.closeTime,expiresAt:Math.min(expiresAt,confirm.closeTime+3*duration),
        pullbackVolumeRatio:bounce.volume/Math.max(...upVolumes),confirmationVolumeRatio:confirm.volume/bounce.volume});
    }
  }
  if(plans.length) {
    const latestAt=Math.max(...plans.map(p=>p.confirmedAt));
    return plans.filter(p=>p.confirmedAt===latestAt).sort((a,b)=>(a.status==='WAIT_LIVE'?0:1)-(b.status==='WAIT_LIVE'?0:1)||b.zoneHigh-a.zoneHigh)[0];
  }
  const candidates=levelsBefore(rows,rows.length-2,pumpIndex,retestIndex,atr);
  const held=candidates.filter(l=>rows.slice(retestIndex,-1).some(r=>r.closeTime>=l.formedAt && r.close>l.zoneHigh));
  const level=held.sort((a,b)=>Math.abs(last.close-a.level)-Math.abs(last.close-b.level))[0];
  if(!level) return {...common,status:'NO_SUPPORT'};
  const stop=level.zoneLow-.1*atr;
  return {...common,...level,stop,status:last.close<=stop?'BROKEN':last.close-level.zoneHigh>atr?'WAIT_RETEST':'WAIT_CONFIRM'};
}
