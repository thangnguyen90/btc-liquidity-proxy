import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {HEATMAP_TOP_RATIO_VERSION,topRatioQuery,normalizeTopRatioRows,RATIO_PERIODS,RATIO_RANGES} from '../public/heatmap-top-ratio-model.js';
import {buildTopRatioChart} from '../public/heatmap-top-ratio.js';
import {HeatmapTopTraderRatio} from '../src/heatmapTopTraderRatio.js';
let now=Date.UTC(2026,9,22,8);const symbol='QUSDT',step=300000;
const raw=(overrides={})=>Array.from({length:30},(_,i)=>({symbol,timestamp:now-(29-i)*step,longShortRatio:String(1.5+i*.002),longAccount:'0.6001',shortAccount:'0.3999',...overrides}));
for(const [range,period] of Object.entries({'12h':'5m','24h':'5m','3d':'15m','7d':'30m','30d':'2h'})){
 const q=topRatioQuery({symbol,range});assert.equal(q.resolvedPeriod,period);assert(q.limit<=500);assert.equal(q.truncated,false);
}
assert.equal(topRatioQuery({symbol,range:'30d',period:'5m'}).truncated,true);assert.equal(topRatioQuery({symbol,range:'30d',period:'5m'}).limit,500);
assert.equal(topRatioQuery({symbol:'龙虾USDT'}).symbol,'龙虾USDT');
for(const args of [{symbol:'bad'},{symbol,range:'1h'},{symbol,period:'7m'},{symbol:'<svg>USDT'},{symbol,range:'toString'},{symbol,period:'constructor'}])assert.throws(()=>topRatioQuery(args));
const source=raw(),before=structuredClone(source),normalized=normalizeTopRatioRows(source,{symbol,step,now,from:now-86400000});assert.deepEqual(source,before);assert.equal(normalized.at(-1).longAccount,.6001);assert.equal(normalized.at(-1).longShortRatio,1.558);
assert.notEqual(normalized[0].longAccount,normalized[0].longShortRatio/(1+normalized[0].longShortRatio),'account bars use independent Binance fields, not ratio-derived fractions');
for(const rows of [source.toReversed(),[...source,source.at(-1)],raw({symbol:'ERAUSDT'}),raw({timestamp:now+2001}),raw({longShortRatio:'NaN'}),raw({longAccount:null}),raw({shortAccount:.8}),raw({longAccount:-1}),Array(501).fill(source[0]),{}])assert.throws(()=>normalizeTopRatioRows(rows,{symbol,step,now,from:now-86400000}));
assert.equal(normalizeTopRatioRows([{...source[0],timestamp:now+1000}],{symbol,step,now,from:now-86400000}).length,0,'slightly future points are not plotted');
assert.equal(normalizeTopRatioRows(raw({longAccount:0,shortAccount:1,longShortRatio:0}),{symbol,step,now,from:0})[0].longShortRatio,0);
const chart=buildTopRatioChart(normalized,step);assert.match(chart.html,/stroke="#111827"/);assert.match(chart.html,/fill="#27c99b"/);assert.match(chart.html,/fill="#f24b64"/);assert.equal((chart.html.match(/class="top-ratio-bar"/g)??[]).length,30);assert.doesNotMatch(chart.html,/PASS|FAIL|NaN|Infinity/);
const gap=normalized.filter((_,i)=>i!==15);assert.equal((buildTopRatioChart(gap,step).html.match(/class="top-ratio-line"/g)??[]).length,2,'missing intervals break line, never interpolate a gap');
for(const rows of [normalized.slice(-1),normalized.map(r=>({...r,longShortRatio:0})),normalized.map(r=>({...r,longShortRatio:1}))])assert.doesNotMatch(buildTopRatioChart(rows,step).html,/NaN|Infinity/);
let reads=0;const service=new HeatmapTopTraderRatio({now:()=>now,loadRows:async q=>{reads++;assert.deepEqual(q,{symbol,period:'5m',limit:289});return raw();}});
const [a,b]=await Promise.all([service.get({symbol}),service.get({symbol})]);assert.equal(reads,1);assert.deepEqual(a,b);assert.equal(a.status,'OK');assert.equal(a.affectsOrders,false);assert.equal(a.version,HEATMAP_TOP_RATIO_VERSION);a.rows[0].longAccount=0;
assert.equal((await service.get({symbol,period:'5m'})).rows[0].longAccount,.6001);assert.equal(reads,1,'auto/explicit same interval share cache and immutable response');
now+=60001;await service.get({symbol});assert.equal(reads,2);
const stale=new HeatmapTopTraderRatio({now:()=>now,loadRows:async()=>raw().slice(0,-3)});assert.equal((await stale.get({symbol})).status,'STALE');
const empty=new HeatmapTopTraderRatio({now:()=>now,loadRows:async()=>[]});assert.equal((await empty.get({symbol})).status,'EMPTY');
let failures=0;const blocked=new HeatmapTopTraderRatio({now:()=>now,loadRows:async()=>{failures++;throw Object.assign(Error('IP block'),{status:429,retryAfterMs:300000});}});
assert.equal((await blocked.get({symbol})).reason,'RATIO_RATE_LIMIT');now+=61000;assert.equal((await blocked.get({symbol})).reason,'RATIO_RATE_LIMIT');assert.equal(failures,1,'failure cache honors ban/backoff');
now+=300000;await blocked.get({symbol});assert.equal(failures,2);
let release;const busy=new HeatmapTopTraderRatio({now:()=>now,maxConcurrent:1,loadRows:()=>new Promise(r=>release=r)}),pending=busy.get({symbol});assert.equal((await busy.get({symbol:'ERAUSDT'})).reason,'RATIO_BUSY');release(raw());await pending;
const invalid=new HeatmapTopTraderRatio({now:()=>now,loadRows:async()=>raw({longAccount:NaN})});assert.equal((await invalid.get({symbol})).reason,'INVALID_RATIO_DATA');
const limited=new HeatmapTopTraderRatio({now:()=>now,maxReads:1,loadRows:async()=>[]});await limited.get({symbol});assert.equal((await limited.get({symbol:'ERAUSDT'})).reason,'RATIO_BUSY');
const bounded=new HeatmapTopTraderRatio({now:()=>now,maxCache:2,loadRows:async()=>[]});for(const name of ['QUSDT','ERAUSDT','ARBUSDT'])await bounded.get({symbol:name});assert.equal(bounded.cache.size,2);
// Read-only native route. It must not touch any order/session/notification hooks.
const server=await readFile('src/server.js','utf8'),start=server.indexOf("if(requestUrl.pathname==='/api/coinglass-heatmap-lab/ratio')"),end=server.indexOf("if(requestUrl.pathname==='/api/coinglass-heatmap-lab/order')",start);assert(start>0&&end>start);
for(const method of ['GET','POST','DELETE']){let calls=0;const out=[];await vm.runInNewContext('(async()=>{'+server.slice(start,end)+'})()',{
 requestUrl:new URL('http://local/api/coinglass-heatmap-lab/ratio?symbol=QUSDT&period=5m&range=24h'),request:{method},response:{setHeader(){}},heatmapTopTraderRatio:{get:async q=>{calls++;assert.equal(q.symbol,'QUSDT');return {observeOnly:true};}},sendJson:async(_r,data,status=200)=>out.push({data,status})
 });assert.equal(out[0].status,method==='GET'?200:405);assert.equal(calls,method==='GET'?1:0);}
assert.match(server,/client\.getTopLongShortAccountRatio\(symbol,period,limit,\{priority:7,dropOnCongestion:true,source:'heatmapTopTraderRatio:display'\}\)/);
assert.equal(Object.keys(RATIO_PERIODS).length,9);assert.equal(Object.keys(RATIO_RANGES).length,5);
console.log('PASS Heatmap top-account ratio: real account fields/black ratio/gaps, auto periods/cap500/Unicode, no synthetic or future data, cache/dedupe/backoff/bounds/stale/empty, shared low-priority GET-only native route. Zero order/notification IO.');
