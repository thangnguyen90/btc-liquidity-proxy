import fs from 'node:fs/promises';
import {earlyPumpBars} from '../src/earlyPumpWatch.js';
import {STUDY_VERSION,detectResearch,decisionFor,liquidityAt,featuresAt,simulateTrade,STEP,HOUR} from './research-early-pump-model.mjs';
const dir='data/research/early-pump-liquidity-20261102';
await fs.mkdir(dir+'/evaluated',{recursive:true});
const read=async f=>JSON.parse(await fs.readFile(f,'utf8')),save=async(f,x)=>{await fs.writeFile(f+'.tmp',JSON.stringify(x));await fs.rename(f+'.tmp',f);};
const manifest=await read(dir+'/manifest.json');let done=0,totalEvents=0,totalTrades=0,waiting=0,noCandidates=0;
for(const item of manifest.universe){
 const symbol=item.symbol,stem=dir+'/raw/'+encodeURIComponent(symbol),output=dir+'/evaluated/'+encodeURIComponent(symbol)+'.json';
 try{const cached=await read(output);if(cached.version===STUDY_VERSION){done++;totalEvents+=cached.events.length;totalTrades+=cached.rows.length;continue;}}catch(e){if(e.code!=='ENOENT')throw e;}
 let raw,events;try{raw={symbol,price:await read(stem+'-price.json')};events=detectResearch(raw.price,manifest.start,manifest.end);if(!events.length){noCandidates++;continue;}for(const type of ['mark','oi','position','funding'])raw[type]=await read(stem+'-'+type+'.json');}catch(e){if(e.code!=='ENOENT')throw e;waiting++;continue;}
 const bars=earlyPumpBars(raw.price,manifest.end),rows=[],excluded={},liquidityCache=new Map();
 for(const event of events){
  for(const mode of ['BREAKOUT','HOLD','RETEST']){
   const decision=decisionFor(event,bars,mode);if(!decision){excluded[mode+'_NO_CONFIRMATION']=(excluded[mode+'_NO_CONFIRMATION']??0)+1;continue;}
   // No partial forward outcomes, and purge train labels crossing into the holdout boundary.
   if(decision.at+STEP+4*HOUR>manifest.end){excluded.IMMATURE=(excluded.IMMATURE??0)+1;continue;}
   const phase=event.at<manifest.split-6*HOUR?'TRAIN':event.at>=manifest.split?'TEST':'PURGED';
   if(phase==='PURGED'){excluded.PURGED=(excluded.PURGED??0)+1;continue;}
   for(const lag of [STEP,2*STEP]){
    const key=decision.at+':'+lag;let liq=liquidityCache.get(key);if(!liq){liq=liquidityAt(raw,decision,bars[decision.index].c,lag);liquidityCache.set(key,liq);}
    const features=featuresAt(event,bars,decision,liq,raw.position);
    for(const exit of ['FIXED','MODEL']){
     const trade=simulateTrade(bars,decision,features,raw.funding,manifest.end,{exit});
     const delayed=lag===STEP?simulateTrade(bars,decision,features,raw.funding,manifest.end,{exit,delay:2*STEP}):null;
     rows.push({symbol,id:symbol+':'+event.at,at:event.at,phase,mode,exit,lag,decision,features,trade,delayed});
    }
   }
  }
 }
 await save(output,{version:STUDY_VERSION,symbol,events,rows,excluded,coverage:{price:raw.price.length,mark:raw.mark.length,oi:raw.oi.length,position:raw.position.length,funding:raw.funding.length}});
 done++;totalEvents+=events.length;totalTrades+=rows.length;
 await save(dir+'/progress-evaluate.json',{done,waiting,noCandidates,total:manifest.universe.length,totalEvents,totalTrades,at:Date.now()});
 console.log(JSON.stringify({symbol,done,events:events.length,rows:rows.length,waiting}));
}
console.log(JSON.stringify({complete:waiting===0,done,waiting,noCandidates,totalEvents,totalTrades}));
