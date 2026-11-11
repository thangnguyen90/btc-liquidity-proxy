import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {VERSION,S,H,normalizeChart,priceFeatures,positioningAt,confirmationIndex,simulate,summarize,bootstrapCoins} from './research-pump-high-whale-turn.mjs';
import {outcome as independentOutcome} from './research-pumpglass-positioning.mjs';
import {liquidityAt} from './research-early-pump-model.mjs';
const dir='data/research/pump-high-whale-turn-20261103',read=async p=>JSON.parse(await fs.readFile(p,'utf8')),m=await read(dir+'/manifest.json');
let auditCount=0;
const records=[],coverage=[],errors=[],diagnostics={expiredConfirmations:0,unsafeSourceSignals:0},rawBySymbol=new Map(),chartBySymbol=new Map();
const variants=['PUMP_HIGH','PLUS_CROWD','PLUS_WHALE_DROP','PLUS_WHALE_FLIP','DROP_CONFIRM','FLIP_CONFIRM','DROP_REFRESH_UNFILTERED','CROWD_DOWN','CROWD_STEADY_DOWN','CROWD_DOWN_WHALE_STILL_LONG','CROWD_DOWN_WHALE_WEAK','CROWD_DOWN_WHALE_DROP5','CROWD_DOWN_WHALE_DROP10','WHALE_DROP10','WEAK_CONFIRM'];
function phaseAt(at){return at<m.split-24*H?'TRAIN':at>=m.split?'TEST':'PURGED';}
function makeRecord(symbol,variant,lagMinutes,setup,decisionIndex,raw,chart,funding,position){
 const decision=+raw[decisionIndex][0]+S,entryAt=decision+S;
 if(entryAt+8*H>m.end||phaseAt(decision)==='PURGED')return null;
 const trades=Object.fromEntries([['LONG',1],['SHORT',-1]].map(([name,side])=>[name,simulate(raw,entryAt,side,funding,m.end)]));
 if(Object.values(trades).some(t=>t.status!=='OK'))return null;
 const info={symbol,variant,lagMinutes,phase:phaseAt(decision),setupAt:setup.at,decision,entryAt,setup,position,trades};
 for(const [name,side]of [['LONG',1],['SHORT',-1]]){const other=independentOutcome(raw,{entryAt},side,funding);assert.equal(other.status,'OK');assert.ok(Math.abs(other.netRoe-trades[name].netRoe)<1e-9);assert.equal(other.exitAt,trades[name].exitAt);auditCount++;}
 assert.ok(position.whaleAt<=decision-lagMinutes*60000&&position.crowdAt<=decision-lagMinutes*60000,'as-of source leak');
 return info;
}
for(const {symbol}of m.candidates){
 try{
  const h=await read(m.historySource+'/raw/'+encodeURIComponent(symbol)+'-history.json');
  if(h.basis!=='whales'){coverage.push({symbol,status:'NOT_WHALES_BASIS',basis:h.basis});continue;}
  const chart=normalizeChart(await read(dir+'/raw/'+encodeURIComponent(symbol)+'-chart.json'));
  const raw=await read(m.priceSource+'/raw/'+encodeURIComponent(symbol)+'-price.json'),funding=await read(m.historySource+'/raw/'+encodeURIComponent(symbol)+'-funding.json'),features=priceFeatures(raw),row={symbol,status:'OK',whaleRows:chart.whales.length,crowdRows:chart.crowd.length,firstWhaleAt:chart.whales[0]?.t,lastWhaleAt:chart.whales.at(-1)?.t,locked:chart.locked,normalizedTo1000:chart.whales.filter(x=>x.normalizedTotal===1000).length,pumpHighBars:0,eligible:0,sourceMissing:0,refreshExcluded:0};
  rawBySymbol.set(symbol,{symbol,price:raw,funding});chartBySymbol.set(symbol,chart);
  const last=new Map();
  for(const setup of features){if(!setup?.pumpHigh||setup.at<m.start||setup.at>=m.end-8*H-S||phaseAt(setup.at)==='PURGED')continue;row.pumpHighBars++;
   for(const lagMinutes of [15,30]){
    const p=positioningAt(chart,setup.at,lagMinutes);
    if(p.status!=='OK'){if(lagMinutes===15)row.sourceMissing++;continue;}
    if(p.listRefresh&&lagMinutes===15)row.refreshExcluded++;
    if(!p.listRefresh&&lagMinutes===15)row.eligible++;
    const base=!p.listRefresh,crowdDown=p.crowdShort>=60&&p.crowdDelta1hPp<0,checks={PUMP_HIGH:base,PLUS_CROWD:base&&p.crowdUnwinding,PLUS_WHALE_DROP:base&&p.crowdUnwinding&&p.whaleWeakening,PLUS_WHALE_FLIP:base&&p.crowdUnwinding&&p.whaleFlip,DROP_CONFIRM:base&&p.crowdUnwinding&&p.whaleWeakening,FLIP_CONFIRM:base&&p.crowdUnwinding&&p.whaleFlip,DROP_REFRESH_UNFILTERED:p.crowdUnwinding&&p.whaleWeakening,CROWD_DOWN:base&&crowdDown,CROWD_STEADY_DOWN:base&&crowdDown&&p.crowdFallingSteadily,CROWD_DOWN_WHALE_STILL_LONG:base&&crowdDown&&p.whaleLong>=60&&p.whaleDelta4hPp>=0,CROWD_DOWN_WHALE_WEAK:base&&crowdDown&&p.whaleDelta4hPp<0,CROWD_DOWN_WHALE_DROP5:base&&crowdDown&&p.whaleDelta4hPp<=-5,CROWD_DOWN_WHALE_DROP10:base&&crowdDown&&p.whaleWeakening,WHALE_DROP10:base&&p.whaleWeakening,WEAK_CONFIRM:base&&crowdDown&&p.whaleDelta4hPp<=-5};
    for(const variant of variants){if(!checks[variant])continue;let idx=setup.index,position=p;
     if(variant.endsWith('_CONFIRM')){
      idx=confirmationIndex(raw,idx);if(idx===null){diagnostics.expiredConfirmations++;continue;}
      position=positioningAt(chart,+raw[idx][0]+S,lagMinutes);
      if(position.status!=='OK'||position.listRefresh||!(variant==='WEAK_CONFIRM'?position.crowdShort>=60&&position.crowdDelta1hPp<0&&position.whaleDelta4hPp<=-5:position.crowdUnwinding&&(variant==='DROP_CONFIRM'?position.whaleWeakening:position.whaleFlip))){diagnostics.expiredConfirmations++;continue;}
     }
     const key=variant+':'+lagMinutes,entryAt=+raw[idx][0]+2*S;if(entryAt-(last.get(key)??-Infinity)<8*H)continue;
     const r=makeRecord(symbol,variant,lagMinutes,setup,idx,raw,chart,funding,position);if(!r)continue;
     if(r.position.listRefresh&&variant==='DROP_REFRESH_UNFILTERED')diagnostics.unsafeSourceSignals++;
     records.push(r);last.set(key,r.entryAt);
    }
   }
  }
  coverage.push(row);
 }catch(e){errors.push({symbol,error:e.message});}
}
console.log(JSON.stringify({stage:'signals',coverage:coverage.length,errors,counts:Object.fromEntries(variants.map(v=>[v,records.filter(r=>r.variant===v&&r.lagMinutes===15).length]))}));
// Compare liquidity filters only on the whale weakening/flip cohorts, keeping unavailable data explicit.
let built=0;const modelCache=new Map();
for(const r of records.filter(r=>['PLUS_WHALE_DROP','PLUS_WHALE_FLIP','DROP_CONFIRM','FLIP_CONFIRM','CROWD_DOWN_WHALE_DROP5','CROWD_DOWN_WHALE_DROP10','WHALE_DROP10','WEAK_CONFIRM','CROWD_DOWN_WHALE_WEAK'].includes(r.variant))){
 const k=r.symbol+':'+r.decision;let model=modelCache.get(k);
 if(!model){
  const raw=rawBySymbol.get(r.symbol);if(!raw.mark){for(const type of ['mark','oi']){try{raw[type]=await read(m.priceSource+'/raw/'+encodeURIComponent(r.symbol)+'-'+type+'.json');}catch{try{raw[type]=await read('data/research/pumpglass-model13-20261102/raw/'+encodeURIComponent(r.symbol)+'-'+type+'.json');}catch{raw[type]=[];}}}}
  const reference=+raw.price.find(b=>+b[6]+1===r.decision)?.[4];model=liquidityAt(raw,{at:r.decision},reference,2*S);
  if(model.status==='OK'){
   const since=raw.price.filter(b=>+b[0]>=model.asOf&&+b[6]<r.decision),seenLow=Math.min(reference,...since.map(b=>+b[3]));
   const below=model.zones.filter(z=>z.high<seenLow&&z.high>=reference*.95).sort((a,b)=>b.high-a.high)[0];
   model={status:'OK',asOf:model.asOf,upperScore:model.upperScore,lowerScore:model.lowerScore,belowZone:below??null,passes:!!below&&model.lowerScore>0&&model.lowerScore>=2*model.upperScore};
  }
  modelCache.set(k,model);built++;if(built%10===0)console.log(JSON.stringify({stage:'models',built}));
 }
 r.model=model;
}
const modelVariants=[];for(const r of records){if(!r.model)continue;if(r.model.status==='OK')modelVariants.push({...r,variant:r.variant+'_MODEL_AVAILABLE',includeOriginal:false});if(r.model.passes)modelVariants.push({...r,variant:r.variant+'_MODEL_LOWER2X',includeOriginal:false});}
records.push(...modelVariants);
const groups=[];
for(const variant of [...new Set([...variants,...records.map(r=>r.variant)])]){
 const primary=records.filter(r=>r.variant===variant&&r.lagMinutes===15),test=primary.filter(r=>r.phase==='TEST'),train=primary.filter(r=>r.phase==='TRAIN');
 const best=Object.entries(summarize(test).byCoin).sort((a,b)=>b[1].n*b[1].meanRoe-a[1].n*a[1].meanRoe)[0]?.[0]??null;
 groups.push({variant,all:summarize(primary),train:summarize(train),test:summarize(test),testLong:summarize(test,'LONG'),testCi:bootstrapCoins(test),lag30Test:summarize(records.filter(r=>r.variant===variant&&r.lagMinutes===30&&r.phase==='TEST')),testWithoutAinEsports:summarize(test.filter(r=>!['AINUSDT','ESPORTSUSDT'].includes(r.symbol))),bestCoin:best,testWithoutBestCoin:summarize(test.filter(r=>r.symbol!==best)),modelCoverage:Object.fromEntries([...new Set(primary.map(r=>r.model?.status??'NOT_EVALUATED'))].map(s=>[s,primary.filter(r=>(r.model?.status??'NOT_EVALUATED')===s).length]))});
}
const summary={version:VERSION,manifest:m,coverage,errors,diagnostics,modelBuilds:built,groups,validation:{independentTradeReplays:auditCount,sourceLagChecked:true,stopFirstOnAmbiguous:true,cohortRefreshMasked:true,passed:errors.length===0},limitations:['Whale share series only. Guest quantities normalized; actual new SHORT sizes unavailable.','Historical publication delay unknown;15m and30m lag sensitivities. Source may revise past cohorts.','Crowd share from PumpGlass chart, not an independently downloaded Binance global account series.','Already-used7d, exploratory train/test with24h purge; not unseen holdout.','Binance active universe selection as of previous study; excludes delisted historical contracts.','Model1/3 are reconstructed estimates, not real liquidation USD.']};
await fs.writeFile(dir+'/results.json',JSON.stringify({...summary,records}));await fs.writeFile(dir+'/summary.json',JSON.stringify(summary,null,2));
const headers=['symbol','variant','phase','lagMinutes','setupAt','entryAt','pumpPct','heightPct','crowdShort','crowdDelta1hPp','whaleLong','whaleDelta4hPp','listRefresh','shortNetRoe','longNetRoe','price1hPct','price4hPct','price8hPct','modelStatus'];
const csv=[headers.join(','),...records.map(r=>[r.symbol,r.variant,r.phase,r.lagMinutes,new Date(r.setupAt).toISOString(),new Date(r.entryAt).toISOString(),r.setup.pumpPct,r.setup.heightPct,r.position.crowdShort,r.position.crowdDelta1hPp,r.position.whaleLong,r.position.whaleDelta4hPp,r.position.listRefresh,r.trades.SHORT.netRoe,r.trades.LONG.netRoe,r.trades.SHORT.returns['1h'],r.trades.SHORT.returns['4h'],r.trades.SHORT.returns['8h'],r.model?.status??''].join(','))].join('\n');await fs.writeFile(dir+'/signals.csv',csv);
console.log(JSON.stringify({complete:true,groups:groups.map(g=>({variant:g.variant,all:g.all.n,train:g.train.n,test:g.test.n,coins:g.test.coins,shortMeanRoe:g.test.meanRoe,longMeanRoe:g.testLong.meanRoe,down4hPct:g.test.direction['4h']?.downPct,lag30:g.lag30Test.meanRoe})),errors,modelBuilds:built}));
