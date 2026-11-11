// Offline DCA experiment. Capital reserved per signal = 1 USDT; no order APIs.
export const VERSION='EARLY_PUMP_DCA_FIXED_BUDGET_V1_20261102';
export const VARIANTS=['FULL','THIRD_ONLY','DCA','DCA_RECLAIM'];
export function dcaTrade(path,level,funding=[],variant='DCA'){
 if(path.length!==48||path.some((b,i)=>i&&b.t!==path[i-1].t+300000))throw Error('INVALID_PATH');
 if(!VARIANTS.includes(variant))throw Error('INVALID_VARIANT');
 const start=path[0].t,initial=path[0].o,stop=initial*(1-.2/3),part=variant==='FULL'?1:1/3,entries=[];
 let qty=0,notional=0,margin=0,pending=false,exitPrice=null,exitAt=null,reason=null,ambiguous=false;
 const buy=(b)=>{const q=3*part/b.o;qty+=q;notional+=3*part;margin+=part;entries.push({at:b.t,price:b.o,qty:q,margin:part});};
 buy(path[0]);let target=notional/qty*(1+.1/3);
 for(let i=0;i<path.length;i++){
  const b=path[i];
  // Old protection is checked at OPEN before any extra exposure.
  if(b.o<=stop){exitPrice=b.o;exitAt=b.t;reason='SL_GAP';break;}
  if(b.o>=target){exitPrice=target;exitAt=b.t;reason='TP_GAP';break;}
  if(pending&&entries.length<3){
   const threshold=initial*(1-.02*entries.length);
   if(b.o<=threshold&&b.o>stop&&(variant!=='DCA_RECLAIM'||b.o>=level))buy(b);
   target=notional/qty*(1+.1/3);pending=false;
  }
  const sl=b.l<=stop,tp=b.h>=target;
  if(sl||tp){ambiguous=sl&&tp;exitPrice=sl?stop:target;exitAt=b.end-1;reason=sl?'SL':'TP';break;}
  if(['DCA','DCA_RECLAIM'].includes(variant)&&entries.length<3&&i<47){
   const threshold=initial*(1-.02*entries.length);
   pending=b.c<=threshold&&(variant!=='DCA_RECLAIM'||b.c>=level&&b.c>b.o);
  }
 }
 if(exitPrice===null){exitPrice=path.at(-1).c;exitAt=path.at(-1).end-1;reason='TIME';}
 let fundingCash=0;
 for(const f of funding){const at=+f.fundingTime;if(at<=start||at>exitAt)continue;const held=entries.filter(e=>e.at<at).reduce((s,e)=>s+e.qty,0);fundingCash+=held*(+f.markPrice>0?+f.markPrice:initial)*(+f.fundingRate);}
 const gross=qty*exitPrice-notional,turnover=notional+qty*exitPrice,fee=turnover*.0007,stressFee=turnover*.0015;
 return {variant,start,initial,stop,target,entries,entryCount:entries.length,marginUsed:margin,averagePrice:notional/qty,exitPrice,exitAt,reason,ambiguous,gross,fundingCash,fee,turnover,netPct:(gross-fee-fundingCash)*100,stressNetPct:(gross-stressFee-fundingCash)*100};
}
export function summarizeDca(rows,key='netPct'){
 const n=rows.length,vs=rows.map(r=>r.trade[key]),sorted=[...vs].sort((a,b)=>a-b),positive=vs.filter(v=>v>0).reduce((s,v)=>s+v,0),negative=-vs.filter(v=>v<0).reduce((s,v)=>s+v,0);
 return {n,coins:new Set(rows.map(r=>r.symbol)).size,mean:n?vs.reduce((s,v)=>s+v,0)/n:null,winPct:n?100*vs.filter(v=>v>0).length/n:null,pf:negative?positive/negative:null,median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.ceil((n-1)/2)])/2:null,worst:n?sorted[0]:null,tail5Mean:n?sorted.slice(0,Math.max(1,Math.ceil(n*.05))).reduce((s,v)=>s+v,0)/Math.max(1,Math.ceil(n*.05)):null,avgMarginPct:n?100*rows.reduce((s,r)=>s+r.trade.marginUsed,0)/n:null,added:rows.filter(r=>r.trade.entryCount>1).length,threeEntries:rows.filter(r=>r.trade.entryCount===3).length,stopped:rows.filter(r=>r.trade.reason.startsWith('SL')).length,ambiguous:rows.filter(r=>r.trade.ambiguous).length};
}
