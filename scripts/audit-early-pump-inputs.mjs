import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {detectResearch} from './research-early-pump-model.mjs';
const dir='data/research/early-pump-liquidity-20261102',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const manifest=await read(dir+'/manifest.json'),missing=[],coins=[];let samples=0,withSignals=0;
for(const item of manifest.universe){
 const stem=dir+'/raw/'+encodeURIComponent(item.symbol),row={symbol:item.symbol,inputs:{}};let price;
 try{price=await read(stem+'-price.json');}catch{missing.push({symbol:item.symbol,type:'price'});continue;}
 const events=detectResearch(price,manifest.start,manifest.end);samples+=events.length;if(events.length)withSignals++;
 row.events=events.length;row.first=price[0]?.[0];row.last=price.at(-1)?.[6];row.priceGaps=price.filter((b,i)=>i&&+b[0]-price[i-1][0]!==300000).length;
 for(const type of ['price',...(events.length?['mark','oi','position','funding']:[])]){
  try{const text=await fs.readFile(stem+'-'+type+'.json','utf8'),a=JSON.parse(text);row.inputs[type]={rows:a.length,sha256:crypto.createHash('sha256').update(text).digest('hex')};}catch{missing.push({symbol:item.symbol,type});}
 }
 coins.push(row);
}
const out={version:manifest.version,universe:manifest.universe.length,downloadedPrice:coins.length,candidateEvents:samples,candidateCoins:withSignals,missing,coins,at:Date.now()};
await fs.writeFile(dir+'/coverage.json',JSON.stringify(out,null,2));console.log(JSON.stringify({...out,coins:undefined}));
if(missing.length)process.exitCode=1;
