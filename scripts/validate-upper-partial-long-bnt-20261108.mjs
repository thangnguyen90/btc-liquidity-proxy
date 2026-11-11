import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Independent replay: no imports from the evaluator or running strategy.
const dir='data/research/upper-partial-long-bnt-20261108', S=300000, H=3600000;
const read=async n=>JSON.parse(await fs.readFile(`${dir}/${n}`));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const result=await read('results.json'), m=await read('manifest.json'), f=await read('fetch-complete.json');
const state=await read('sweeps-frozen.json'), events=await read('events.json'), funding=await read('funding.json');
assert.equal(digest(await fs.readFile(`${dir}/sweeps-frozen.json`)),m.stateHash);
assert.equal(digest(await fs.readFile(`${dir}/funding.json`)),f.fundingHash);
const market=new Map(), journals=new Map();
for(const symbol of m.symbols){
  const bytes=await fs.readFile(`${dir}/raw/${encodeURIComponent(symbol)}-data.json`);
  assert.equal(digest(bytes),f.hashes[symbol]);
  const raw=JSON.parse(bytes); assert.equal(raw.symbol,symbol); market.set(symbol,raw);
  for(const type of ['price','mark']){
    assert.equal(new Set(raw[type].map(b=>+b[0])).size,raw[type].length);
    for(const b of raw[type]){
      assert.ok(+b[0]<m.end&&+b[6]<m.end);
      assert.equal(+b[0]%S,0); assert.equal(+b[6],+b[0]+S-1);
      assert.ok([1,2,3,4].every(i=>+b[i]>0));
      assert.ok(+b[2]>=Math.max(+b[1],+b[4])&&+b[3]<=Math.min(+b[1],+b[4]));
    }
  }
  if(m.journalHashes[symbol]){
    const bytes=await fs.readFile(`${dir}/journal/${symbol}.json`);
    assert.equal(digest(bytes),m.journalHashes[symbol]); journals.set(symbol,JSON.parse(bytes).points);
  }
}
assert.equal(new Set(funding.map(v=>`${v.symbol}:${v.fundingTime}:${v.rateType??'Regular'}`)).size,funding.length);
assert.ok(funding.every(v=>Number.isFinite(+v.fundingRate)&&+v.fundingTime<m.end));

const derived=[], seen=new Set(), last=new Map();
for(const e of [...state.history].sort((a,b)=>a.at-b.at)){
  if(e.direction!=='UPPER'||e.clearedCount<1||e.clearedCount>=e.totalCount)continue;
  if(!(e.delivery?.sent>0||e.delivery?.status==='SENT')||!(e.delivery.httpStatus>=200&&e.delivery.httpStatus<300))continue;
  if(seen.has(e.cohortId)||e.at-(last.get(e.symbol)??-Infinity)<8*H)continue;
  last.set(e.symbol,e.at);seen.add(e.cohortId);
  const availableAt=Math.max(e.observedAt??e.at,e.delivery.at??e.at);
  derived.push({...e,availableAt,entryAt:(Math.ceil(availableAt/S)+1)*S});
}
assert.deepEqual(derived,events);
const mature=events.filter(e=>e.entryAt+8*H<=m.end);
assert.deepEqual(result.records.map(r=>r.id),mature.map(r=>r.id));
assert.equal(events.length,result.records.length+result.counts.pending);
assert.equal(result.counts.mature,158);assert.equal(result.records.length,158);

function point(e){
  const valid=p=>p&&[p.sourceAt,p.observedAt,p.whaleLong,p.smartLong,p.crowdLong].every(Number.isFinite)
    &&p.sourceAt<=p.observedAt&&p.observedAt<=e.at&&e.at-p.sourceAt<=15*60000
    &&p.whaleCount>=10&&['whaleLong','smartLong','crowdLong'].every(k=>p[k]>=0&&p[k]<=100);
  const p=e.delivery?.positionAnalysis?.point;
  if(valid(p))return {status:'OK',source:'RECORDED_AT_ALERT',...p};
  if(!journals.has(e.symbol))return {status:'MISSING'};
  const q=journals.get(e.symbol).filter(p=>p.observedAt<=e.at&&p.sourceAt<=e.at).sort((a,b)=>a.observedAt-b.observedAt).at(-1);
  return valid(q)?{status:'OK',source:'FIRST_OBSERVED_JOURNAL',...q}:{status:'MISSING_OR_STALE'};
}
function price(e,raw){
  const p=e.delivery?.sweepVerdict?.price;
  if(p&&p.closedAt<=e.at&&e.at-p.closedAt<=450000&&[p.return15m,p.return1h,p.closePositionPct].every(Number.isFinite))
    return {status:'OK',source:'RECORDED_AT_ALERT',closedAt:p.closedAt,return15m:p.return15m,return1h:p.return1h,closePositionPct:p.closePositionPct};
  const end=(Math.floor(e.at/S)-1)*S;
  const bs=raw.price.filter(b=>+b[6]<end).slice(-13);
  assert.equal(bs.length,13);bs.forEach((b,i)=>assert.equal(+b[0],end-(13-i)*S));
  const b=bs.at(-1),hi=+b[2],lo=+b[3];
  return {status:'OK',source:'RECONSTRUCTED_LAG5M',closedAt:end,return15m:100*(+b[4]/+bs[9][4]-1),return1h:100*(+b[4]/+bs[0][4]-1),closePositionPct:hi>lo?100*(+b[4]-lo)/(hi-lo):50};
}
function zone(e,raw){
  assert.ok(e.zonesAsOf<=e.armedAt&&e.armedAt<=e.at);
  const z=e.zones.filter(z=>!z.cleared&&!z.touched&&z.establishedAt<=z.asOf&&z.asOf<=e.at&&z.high>z.low&&z.low>e.markPrice).sort((a,b)=>a.low-b.low)[0];
  if(!z)return {status:'NO_FURTHER_UNTOUCHED_UPPER'};
  const wait=raw.mark.filter(b=>+b[0]>=Math.floor(e.at/S)*S&&+b[0]<e.entryAt);
  const bars=raw.mark.filter(b=>+b[0]>=e.entryAt&&+b[0]<e.entryAt+8*H);
  assert.equal(bars.length,96);
  if(wait.some(b=>+b[2]>=z.low)||+bars[0][1]>=z.low)return {status:'TARGET_TOUCHED_BEFORE_DELAYED_ENTRY',zone:z};
  const entry=+bars[0][1];
  return {status:'OK',zone:z,entry,distancePct:(z.high/entry-1)*100,touched:Math.max(...bars.map(b=>+b[2]))>=z.low,swept:Math.max(...bars.map(b=>+b[2]))>=z.high,target:z.high};
}
function replay(e,raw,tp=5,z=null){
  const bs=raw.price.filter(b=>+b[0]>=e.entryAt&&+b[0]<e.entryAt+8*H);
  assert.equal(bs.length,96);bs.forEach((b,i)=>assert.equal(+b[0],e.entryAt+i*S));
  const entry=+bs[0][1],stop=entry*14/15,target=z?z.target:entry*(1+tp/300);
  if(z&&!(target>entry))return {status:'NO_MODEL_PLAN'};
  let exit=+bs[95][4],at=+bs[95][6],kind='TIME',ambiguous=false;
  for(const b of bs){
    const open=+b[1],hi=+b[2],lo=+b[3];
    if(open<=stop){exit=open;at=+b[0];kind='SL_GAP';break;}
    if(open>=target){exit=target;at=+b[0];kind='TP_GAP';break;}
    if(lo<=stop||hi>=target){const sl=lo<=stop;exit=sl?stop:target;at=+b[6];kind=sl?'SL':'TP';ambiguous=sl&&hi>=target;break;}
  }
  let feeFunding=0;
  for(const f of funding)if(f.symbol===e.symbol&&+f.fundingTime>e.entryAt&&+f.fundingTime<=at)
    feeFunding+=+f.fundingRate*(+f.markPrice>0?+f.markPrice/entry:1)*100;
  const grossPct=100*(exit-entry)/entry,netRoe=3*(grossPct-.14-feeFunding);
  return {status:'OK',entry,stop,target,exit,exitAt:at,kind,ambiguous,fundingPct:feeFunding,grossPct,netRoe,stressRoe:netRoe-.48,return8h:100*(+bs[95][4]/entry-1)};
}
function compare(a,b){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(a))typeof a[k]==='number'?near(a[k],b[k]):assert.deepEqual(a[k],b[k]);}
let simulated=0,zones=0,causal=0,future=0;
for(const r of result.records){
  const e=events.find(e=>e.id===r.id),raw=market.get(r.symbol);
  assert.deepEqual(point(e),r.position);compare(price(e,raw),r.price);causal++;
  assert.equal(r.pricePass,r.price.return15m>=0&&r.price.return1h>0&&r.price.closePositionPct>35);
  assert.equal(r.positionPass,r.position.status==='OK'&&r.position.whaleLong<50&&r.position.smartLong<50&&r.position.crowdLong>=60);
  assert.deepEqual(zone(e,raw),r.model);zones++;
  compare(replay(e,raw),r.trade);compare(replay(e,raw,10),r.tp10);simulated+=2;
  if(r.model.status==='OK'){compare(replay(e,raw,5,r.model),r.modelTrade);simulated++;}
  const fast={...e,entryAt:e.entryAt-S};
  assert.ok(fast.entryAt>e.availableAt);compare(replay(fast,raw),r.fast);simulated++;
  assert.deepEqual(zone(fast,raw),r.fastModel);zones++;
  if(r.fastModel.status==='OK'){compare(replay(fast,raw,5,r.fastModel),r.fastModelTrade);simulated++;}
  // Price features cannot change when all post-signal candles are removed.
  const past={...raw,price:raw.price.filter(b=>+b[6]<e.at)};
  compare(price(e,past),r.price);future++;
}
const defs={ALL:()=>true,PRICE:r=>r.pricePass,POSITION:r=>r.positionPass,PRICE_POSITION:r=>r.pricePass&&r.positionPass};
function checkStats(rows,s,key='trade',mk='model'){
  const xs=rows.filter(r=>r[key].status==='OK'),zs=xs.filter(r=>r[mk].status==='OK');
  assert.equal(s.n,xs.length);assert.equal(s.coins,new Set(xs.map(r=>r.symbol)).size);
  assert.equal(s.tp,xs.filter(r=>/^TP/.test(r[key].kind)).length);assert.equal(s.sl,xs.filter(r=>/^SL/.test(r[key].kind)).length);
  assert.equal(s.time,xs.filter(r=>r[key].kind==='TIME').length);assert.equal(s.ambiguous,xs.filter(r=>r[key].ambiguous).length);
  assert.equal(s.modelEligible,zs.length);assert.equal(s.modelSwept,zs.filter(r=>r[mk].swept).length);
  if(!xs.length)return;
  near(s.meanRoe,xs.reduce((a,r)=>a+r[key].netRoe,0)/xs.length);
  near(s.stressMeanRoe,xs.reduce((a,r)=>a+r[key].stressRoe,0)/xs.length);
  near(s.winPct,100*xs.filter(r=>r[key].netRoe>0).length/xs.length);
  near(s.correct8hPct,100*xs.filter(r=>r[key].return8h>0).length/xs.length);
}
for(const [name,predicate] of Object.entries(defs)){
  const rows=result.records.filter(predicate),g=result.groups[name];assert.deepEqual(g.ids,rows.map(r=>r.id));
  checkStats(rows,g.fixed);checkStats(rows,g.fast,'fast','fastModel');checkStats(rows,g.tp10,'tp10');
  checkStats(rows.filter(r=>r.model.status==='OK'),g.modelExit,'modelTrade');
  checkStats(rows.filter(r=>r.model.status==='OK'),g.matchedFixed);
  checkStats(rows.filter(r=>r.fastModel.status==='OK'),g.fastModelExit,'fastModelTrade','fastModel');
  checkStats(rows.filter(r=>r.fastModel.status==='OK'),g.fastMatchedFixed,'fast','fastModel');
  checkStats(result.records.filter(r=>!predicate(r)),g.rejected);assert.equal(g.fixed.n+g.rejected.n,158);
}
const bnt=result.pending.find(e=>e.symbol==='BNTUSDT');assert.ok(bnt&&bnt.fullyMaturesAt>m.end);
assert.equal(bnt.fullyMaturesAt,bnt.entryAt+8*H);assert.ok(!result.records.some(e=>e.id===bnt.id));
assert.deepEqual(point(bnt),bnt.position);compare(price(bnt,market.get('BNTUSDT')),bnt.price);
const out={status:'PASS',version:m.version,at:Date.now(),frozenStateHash:true,rawHashes:market.size,journalHashes:journals.size,fundingHashAndDedup:true,cohortIndependentlyRebuilt:events.length,mature:158,pendingNotGraded:result.counts.pending,causalPositionAndPriceRecomputed:causal,futurePriceRemovalInvariance:future,zoneOutcomesRecomputed:zones,independentTradeReplays:simulated,allGroupPartitionsAndMetrics:true,sameSubsetModelVsFixed:true,fastTimingSame158Events:true,bntKeptPending:true};
await fs.writeFile(`${dir}/independent-validation.json`,JSON.stringify(out,null,2));console.log(JSON.stringify(out));
