// Rebuild the event universe from cached raw candles and independently check path order.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {detectPumps,VERSION} from './research-pump-path-model.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'data/research/pump-path-week-20261015'),rawDir=path.join(dir,'raw');
const result=JSON.parse(await fs.readFile(path.join(dir,'results.json'),'utf8'));
const files=await fs.readdir(rawDir),manifest=[],bySymbol=new Map();
for(const file of files){
  const bytes=await fs.readFile(path.join(rawDir,file));
  manifest.push({file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  if(!file.includes('-1m-'))continue;
  const symbol=decodeURIComponent(file.split('-1m-')[0]),rows=JSON.parse(bytes);
  if(!bySymbol.has(symbol))bySymbol.set(symbol,new Map());
  for(const r of rows){
    assert(r.slice(0,11).every(x=>Number.isFinite(Number(x))),'finite OHLCV');
    assert(+r[3]>0&&+r[2]>=Math.max(+r[1],+r[4])&&+r[3]<=Math.min(+r[1],+r[4]),'valid OHLC');
    assert(+r[6]<result.end,'closed cutoff');
    const old=bySymbol.get(symbol).get(+r[0]);if(old)assert.deepEqual(old,r,'overlapping downloads must agree');
    bySymbol.get(symbol).set(+r[0],r);
  }
}
const reconstructed=[];let pathsChecked=0;
for(const [symbol,map] of bySymbol){
  const bars=[...map.values()].sort((a,b)=>a[0]-b[0]).map(r=>({t:+r[0],end:+r[6],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5],q:+r[7],buy:+r[10]}));
  for(const e of detectPumps(bars,{start:result.start,end:result.end}))reconstructed.push(`${symbol}|${e.at}`);
  for(const e of result.events.filter(e=>e.symbol===symbol)){
    const i=bars.findIndex(r=>r.end===e.at);assert(i>=80);
    assert.equal(e.base,bars[i-15].c);
    assert.equal(e.atSignal.price,bars[i].c);
    assert.equal(e.atSignal.h0,Math.max(...bars.slice(i-14,i+1).map(r=>r.h)));
    assert.equal(e.tradeAtSignal.entry,bars[i+1].o);
    if(e.derivatives?.oi?.ready)assert(e.derivatives.oi.at<=e.at);
    if(e.derivatives?.ratio?.ready)assert(e.derivatives.ratio.at<=e.at);
    if(!e.path.complete)continue;
    const future=bars.slice(i+1,i+361);assert.equal(future.length,360);assert.equal(future.at(-1).end,e.at+360*60000);
    const b=future.findIndex(r=>r.l<=e.base),h=future.findIndex(r=>r.h>=e.atSignal.h0*1.02);
    const first=b>=0&&h>=0?(b===h?'AMBIGUOUS':b<h?'BASE':'CONTINUATION'):b>=0?'BASE':h>=0?'CONTINUATION':null;
    assert.equal(e.path.firstObserved,first);
    assert.equal(e.path.baseTouched,b>=0);
    if(e.path.recoveryAt)assert(future.slice(b+1).some(r=>r.end===e.path.recoveryAt&&r.c>=e.path.recoveryLevel));
    pathsChecked++;
  }
}
assert.deepEqual(reconstructed.sort(),result.events.map(e=>`${e.symbol}|${e.at}`).sort(),'superset screening must not omit causal events inside downloaded intervals');
const audit={version:VERSION,checkedAt:Date.now(),events:result.events.length,pathsChecked,rawFiles:manifest.length,totalRawBytes:manifest.reduce((s,x)=>s+x.bytes,0),causalReconstruction:true,independentPathOrderCheck:true,manifest};
await fs.writeFile(path.join(dir,'audit-manifest.json'),JSON.stringify(audit));
console.log(JSON.stringify({...audit,manifest:undefined}));
