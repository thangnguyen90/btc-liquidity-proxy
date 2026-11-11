// Pure offline SHORT risk-management replay.
export const MINUTE=60000,HOUR=3600000;
function setup(bars,e,cfg){if(!Array.isArray(bars)||bars.length!==480||bars.some((b,j)=>+b[0]!==e.entryAt+j*MINUTE||+b[6]!==e.entryAt+(j+1)*MINUTE-1))throw Error('INCOMPLETE_1M_PATH');const entry=+bars[0][1],lev=cfg.leverage??3;if(!(entry>0&&cfg.slRoe>0&&cfg.tpRoe>0))throw Error('INVALID_LEVELS');if(cfg.beTriggerRoe!==null&&!(cfg.beTriggerRoe>0&&cfg.beTriggerRoe<cfg.tpRoe))throw Error('INVALID_BE_TRIGGER');return{entry,lev,initialStop:entry*(1+cfg.slRoe/(100*lev)),target:entry*(1-cfg.tpRoe/(100*lev)),trigger:cfg.beTriggerRoe===null?null:entry*(1-cfg.beTriggerRoe/(100*lev))};}
function finish(levels,e,cfg,funding,{price,at,kind,state}){const {entry,lev}=levels,side=-1,fundingPct=side*funding.filter(f=>f.symbol===e.symbol&&+f.fundingTime>e.entryAt&&+f.fundingTime<=at).reduce((s,f)=>s+ +f.fundingRate*(+f.markPrice>0?+f.markPrice/entry:1)*100,0),grossPct=(1-price/entry)*100,costPct=cfg.costPct??.14,netRoe=(grossPct-costPct-fundingPct)*lev;
return{status:'OK',entry,initialStop:levels.initialStop,target:levels.target,trigger:levels.trigger,exit:price,exitAt:at,kind,armed:state.armed,armedAt:state.armedAt??null,grossRoe:grossPct*lev,fundingPct,costPct,netRoe,stressRoe:netRoe-((cfg.stressCostPct??.30)-costPct)*lev};}
const stopKind=(state,gap=false)=>(state.armed?'ENTRY_SL':'INITIAL_SL')+(gap?'_GAP':'');
export function replayClosedBE(bars,e,cfg,funding=[]){const l=setup(bars,e,cfg),state={armed:false,armedAt:null};
for(const b of bars){const open=+b[1],high=+b[2],low=+b[3],close=+b[4],stop=state.armed?l.entry:l.initialStop;
if(open>=stop)return finish(l,e,cfg,funding,{price:open,at:+b[0],kind:stopKind(state,true),state});
if(open<=l.target)return finish(l,e,cfg,funding,{price:l.target,at:+b[0],kind:'TP_GAP',state});
if(high>=stop)return finish(l,e,cfg,funding,{price:stop,at:+b[6],kind:stopKind(state),state});
if(low<=l.target)return finish(l,e,cfg,funding,{price:l.target,at:+b[6],kind:'TP',state});
if(!state.armed&&l.trigger!==null&&close<=l.trigger&&+b[6]<+bars.at(-1)[6]){state.armed=true;state.armedAt=+b[6]+1;}
}return finish(l,e,cfg,funding,{price:+bars.at(-1)[4],at:+bars.at(-1)[6],kind:'TIME',state});}
function walkMinute(points,bar,initial,l){const state={...initial},open=points[0],stop=()=>state.armed?l.entry:l.initialStop;
if(open>=stop())return{price:open,at:+bar[0],kind:stopKind(state,true),state};if(open<=l.target)return{price:l.target,at:+bar[0],kind:'TP_GAP',state};
if(!state.armed&&l.trigger!==null&&open<=l.trigger){state.armed=true;state.armedAt=+bar[0];}
for(let i=1;i<points.length;i++){const from=points[i-1],to=points[i];if(to>from&&from<=stop()&&to>=stop())return{price:stop(),at:+bar[6],kind:stopKind(state),state};
if(to<from){if(!state.armed&&l.trigger!==null&&from>=l.trigger&&to<=l.trigger){state.armed=true;state.armedAt=+bar[6];}if(from>=l.target&&to<=l.target)return{price:l.target,at:+bar[6],kind:'TP',state};}}
return{state};}
export function replayTouchRange(bars,e,cfg,funding=[]){const l=setup(bars,e,cfg),finished=new Map();let live=[{armed:false,armedAt:null}];
for(const b of bars){if(!live.length)break;const [o,h,lo,c]=[+b[1],+b[2],+b[3],+b[4]],next=new Map();for(const st of live){const paths=[[o,h,lo,c],[o,lo,h,c]];if(!st.armed&&l.trigger!==null&&l.trigger>=lo&&l.trigger<=h)paths.push([o,l.trigger,h,lo,c]);
for(const path of paths){const out=walkMinute(path,b,st,l);if(out.price!==undefined){const r=finish(l,e,cfg,funding,out);finished.set(r.kind+':'+r.exitAt+':'+r.exit+':'+r.armed,r);}else next.set(String(out.state.armed),out.state);}}live=[...next.values()];}
for(const state of live){const r=finish(l,e,cfg,funding,{price:+bars.at(-1)[4],at:+bars.at(-1)[6],kind:'TIME',state});finished.set(r.kind+':'+r.exitAt+':'+r.exit+':'+r.armed,r);}
const outcomes=[...finished.values()].sort((a,b)=>a.netRoe-b.netRoe);if(!outcomes.length)throw Error('NO_OUTCOMES');return{worst:outcomes[0],best:outcomes.at(-1),outcomeCount:outcomes.length,uncertain:outcomes.at(-1).netRoe-outcomes[0].netRoe>1e-8};}
export function diagnostics(result,bars){const future=bars.filter(b=>+b[0]>result.exitAt),stop=/SL/.test(result.kind);return{...result,stopThenTarget:stop&&future.some(b=>+b[3]<=result.target),stopThenBelowEntry:stop&&future.some(b=>+b[3]<result.entry)};}
export function statistics(rows,key='closed'){const xs=rows.map(r=>r[key]),n=xs.length,mean=vs=>vs.length?vs.reduce((a,b)=>a+b,0)/vs.length:null;const gain=xs.filter(x=>x.netRoe>0).reduce((s,x)=>s+x.netRoe,0),loss=-xs.filter(x=>x.netRoe<0).reduce((s,x)=>s+x.netRoe,0),vals=xs.map(x=>x.netRoe).sort((a,b)=>a-b);
return{n,coins:new Set(rows.map(r=>r.symbol)).size,win:xs.filter(x=>x.netRoe>0).length,winPct:n?100*xs.filter(x=>x.netRoe>0).length/n:null,meanRoe:mean(xs.map(x=>x.netRoe)),medianRoe:n?(vals[Math.floor((n-1)/2)]+vals[Math.ceil((n-1)/2)])/2:null,worstRoe:n?vals[0]:null,stressMeanRoe:mean(xs.map(x=>x.stressRoe)),profitFactor:loss?gain/loss:null,tp:xs.filter(x=>x.kind.startsWith('TP')).length,initialSL:xs.filter(x=>x.kind.startsWith('INITIAL_SL')).length,entrySL:xs.filter(x=>x.kind.startsWith('ENTRY_SL')).length,gaps:xs.filter(x=>x.kind.endsWith('_GAP')).length,armed:xs.filter(x=>x.armed).length,time:xs.filter(x=>x.kind==='TIME').length,stopThenTarget:xs.filter(x=>x.stopThenTarget).length,stopThenBelowEntry:xs.filter(x=>x.stopThenBelowEntry).length};}

