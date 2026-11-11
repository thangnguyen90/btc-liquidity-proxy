// Independent arithmetic/outcome audit; does not call the research simulator.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const dir='data/research/early-pump-liquidity-20261102',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const manifest=await read(dir+'/manifest.json');let checked=0,features=0,decisions=0;const failures=[];
for(const file of (await fs.readdir(dir+'/evaluated')).filter(f=>f.endsWith('.json'))){
 const study=await read(dir+'/evaluated/'+file),stem=dir+'/raw/'+encodeURIComponent(study.symbol),price=await read(stem+'-price.json'),funding=await read(stem+'-funding.json');
 const index=new Map(price.map((b,i)=>[+b[0],i]));
 for(const row of study.rows){try{
  const liq=row.features.liquidity;if(liq.status==='OK'){assert(liq.asOf<=row.decision.at-row.lag);assert(liq.zones.every(z=>z.asOf<liq.asOf&&z.establishedAt<=z.asOf));features++;}
  assert(row.decision.at>=row.at);assert(row.phase!=='TRAIN'||row.at<manifest.split-21600000);assert(row.phase!=='TEST'||row.at>=manifest.split);decisions++;
  for(const [variant,t]of [['primary',row.trade],['delayed',row.delayed]]){
   if(!t||t.status!=='OK')continue;
   assert.equal(t.start,row.decision.at+(variant==='primary'?300000:600000));assert(t.start+14400000<=manifest.end);
   const i=index.get(t.start);assert(Number.isInteger(i));const path=price.slice(i,i+48);assert.equal(path.length,48);assert(path.every((b,j)=>+b[0]===t.start+j*300000));
   const entry=+path[0][1];assert.equal(entry,t.entry);
   if(row.exit==='FIXED'){assert(Math.abs(t.stop/entry-(1-.2/3))<1e-10);assert(Math.abs(t.target/entry-(1+.1/3))<1e-10);}else{assert.equal(t.target,row.features.target);assert.equal(t.stop,Math.max(entry*(1-.2/3),row.features.stop));assert((t.target-entry-entry*.0014)/(entry-t.stop+entry*.0014)>=1.5);}
   let px=+path[47][4],end=+path[47][6],kind='TIME',ambiguous=false;
   for(const b of path){const o=+b[1],h=+b[2],l=+b[3];
    if(o<=t.stop){px=o;end=+b[0];kind='SL_GAP';break;}
    if(o>=t.target){px=t.target;end=+b[0];kind='TP_GAP';break;}
    if(l<=t.stop||h>=t.target){ambiguous=l<=t.stop&&h>=t.target;kind=l<=t.stop?'SL':'TP';px=l<=t.stop?t.stop:t.target;end=+b[6];break;}
   }
   assert.equal(t.kind,kind);assert.equal(t.exitAt,end);assert.equal(t.exitPrice,px);assert.equal(t.ambiguous,ambiguous);
   let fundingCash=0;for(const f of funding)if(+f.fundingTime>t.start&&+f.fundingTime<=end)fundingCash+=+f.fundingRate*(+f.markPrice>0?+f.markPrice:entry);
   const net=((px-entry)/entry*100-.14-fundingCash/entry*100)*3;
   assert(Math.abs(net-t.netRoe)<1e-8);assert(Math.abs(t.stressNetRoe-(net-.48))<1e-8);checked++;
  }
 }catch(e){failures.push({symbol:row.symbol,id:row.id,mode:row.mode,exit:row.exit,lag:row.lag,error:e.message});}}
}
const result={checkedTrades:checked,modelAsOfChecks:features,decisionChecks:decisions,failures,pass:failures.length===0,at:Date.now()};
await fs.writeFile(dir+'/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,failures:failures.slice(0,5)}));if(failures.length)process.exitCode=1;
