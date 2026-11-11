import fs from 'node:fs/promises';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const dir='data/research/dominance-model13-20261106',read=async f=>JSON.parse(await fs.readFile(f,'utf8')),r=await read(dir+'/results.json'),m=r.manifest,bySymbol=new Map();
let checked=0;for(const x of r.records){let j=bySymbol.get(x.symbol);if(!j){j=await read(dir+'/journal/'+x.symbol+'.json');bySymbol.set(x.symbol,j);}
 const p=j.points.find(p=>p.sourceAt===x.sourceAt&&p.observedAt===x.observedAt);assert.ok(p);assert.equal(p.whaleLong,x.whaleLongPct);assert.equal(p.smartLong,x.smartLongPct);assert.equal(p.crowdLong,x.crowdLongPct);assert.ok(x.sourceAt<=x.decisionAt&&x.entryAt>x.decisionAt&&x.entryAt+28800000<=m.end);assert.ok(x.crowdOppositePct>60&&x.crowdTrend.currentPct>60&&x.crowdTrend.delta1hPp>0);assert.ok(x.crowdTrend.currentAt<=x.sourceAt&&x.crowdTrend.previousAt<=x.sourceAt-3600000);
 if(x.phase==='TRAIN')assert.ok(x.entryAt+28800000<=m.split);if(x.phase==='TEST')assert.ok(x.decisionAt>=m.split);
 if(x.features.status==='OK')assert.ok(x.features.liq.asOf<=x.modelDecision-x.modelLagMinutes*60000);
 if(x.trade.status==='OK')assert.ok(Math.abs(x.trade.netRoe-x.trade.stressRoe-.48)<1e-9);checked++;
}
const hashes={};for(const f of ['manifest.json','cohort.json','funding.json','results.json'])hashes[f]=crypto.createHash('sha256').update(await fs.readFile(dir+'/'+f)).digest('hex');
const before=await read(dir+'/runtime-preserved-before.json');for(const[f,h]of Object.entries(before.hashes))assert.equal(crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex'),h,'runtime changed '+f);
const live=await(await fetch('http://127.0.0.1:19082/api/pumpglass-whale-smart-dominance-watch')).json();assert.deepEqual(live.rule,before.rule);assert.equal(live.destinationWebhookId,before.destinationWebhookId);
const funding=await read(dir+'/funding.json'),missingFundingMark=funding.filter(f=>!(+f.markPrice>0)||!Number.isFinite(+f.fundingRate)).length;assert.equal(missingFundingMark,0);
const result={at:Date.now(),passed:true,recordsChecked:checked,firstObservedValuesVerified:true,sourceAndModelAsOfChecked:true,fullOutcomeAndPurgeChecked:true,fixedIndependentReplays:r.validation.fixedIndependentReplays,runtimeCodeConfigRulesDestinationUnchanged:true,missingFundingMark,hashes};await fs.writeFile(dir+'/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
