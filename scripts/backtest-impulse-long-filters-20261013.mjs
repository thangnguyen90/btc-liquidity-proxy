// Research only: replay filters over real audited exits, NOT a broker/TP-SL simulator.
// No private API, order, state, or file writes. Optional --candles uses public GET only.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {POST_MOVE_IMPULSE_LEGACY_SIZING_VERSION as SIZING} from '../src/postMoveImpulseSizing.js';

export const VERSION='IMPULSE_LONG_FILTER_REPLAY_V1_20261013';
const n=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const median=a=>{const b=[...a].filter(Number.isFinite).sort((x,y)=>x-y);return b.length?b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2:null;};
const vnDay=t=>new Date(t+7*3600_000).toISOString().slice(0,10);
const digest=t=>createHash('sha256').update(t).digest('hex');
const group=a=>{const m=new Map();for(const r of a){const k=r.closeGroupId??`${r.symbol}|${r.direction}|${r.orderId}`;m.set(k,[...(m.get(k)??[]),r]);}return [...m];};
export function fields(r){return Object.fromEntries(String(r.entryReason??'').split('|').map(s=>s.trim()).filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));}
function eligible(r){const p=fields(r);return r.direction==='LONG'&&r.signalSource==='post-move-impulse'&&r.signalLabel==='POST_DUMP_NO_SELL_BUY_IMPULSE_LONG'&&p.sizing===SIZING&&[1,5].includes(n(p.margin))&&['BASE_SIZE','GOOD_HOUR','BTC_ALIGNED','GOOD_HOUR_AND_BTC_ALIGNED'].includes(p.sizeReason);}
function consistent(r){const p=fields(r),m=n(r.marginUsdt),v=n(r.filledNotionalUsdt),l=n(r.leverage);return eligible(r)&&r.isDca!==true&&m>0&&v>0&&l>0&&n(p.margin)===m&&Math.abs(v/l-m)/m<=.05;}
export function cohort(raw){
  const all=Object.values(raw.fills??{}).map(x=>x.record).filter(Boolean);
  const out=[],excluded={multiOpening:0,mixedOrInconsistent:0,missingOrFutureProof:0,notClosed:0};
  for(const [id,g] of group(all)){
    if(!g.some(eligible))continue;
    if(g.some(r=>r.positionStatus!=='CLOSED'||n(r.netRealizedPnlUsdt)==null)){excluded.notClosed++;continue;}
    if(!g.every(consistent)||new Set(g.map(r=>fields(r).margin)).size!==1){excluded.mixedOrInconsistent++;continue;}
    // A gate could change later add-on entries: cannot replay these as one frozen entry.
    if(g.length!==1){excluded.multiOpening++;continue;}
    const r=g[0],p=fields(r),entryAt=Date.parse(r.filledAt),signalAt=Date.parse(p.observedAt),btcAt=n(p.btcAt);
    if(!Number.isFinite(signalAt)||signalAt>entryAt||!Number.isFinite(btcAt)||btcAt>entryAt||!Number.isFinite(Date.parse(r.closedAt))||Date.parse(r.closedAt)<entryAt){excluded.missingOrFutureProof++;continue;}
    out.push({id,symbol:r.symbol,entryAt,signalAt,btcAt,closedAt:Date.parse(r.closedAt),day:vnDay(entryAt),margin:n(p.margin),
      reason:p.sizeReason,score:n(p.score),btc15m:n(p.btc15m),btc1h:n(p.btc1h),btcTrend:p.btc,btcFresh:p.btcFresh==='true',
      pnl:n(r.netRealizedPnlUsdt),roe:n(r.netRealizedPnlUsdt)/n(p.margin)*100,exit:r.closeReason});
  }
  return {rows:out.sort((a,b)=>a.entryAt-b.entryAt||a.id.localeCompare(b.id)),excluded};
}
export function ema(a,period){if(a.length<period)return null;let e=mean(a.slice(0,period));for(const v of a.slice(period))e=v*2/(period+1)+e*(1-2/(period+1));return e;}
export function candleFeatures(input,asOf){
  const a=input.filter(r=>r[6]<=asOf).sort((x,y)=>x[0]-y[0]);
  if(a.length<200||asOf-a.at(-1)[6]>300_000)return null;
  if(a.some((r,i)=>i>0&&r[0]-a[i-1][0]!==300_000)||a.some(r=>[1,2,3,4,5,7,10].some(i=>!Number.isFinite(r[i]))||r[4]<=0))return null;
  const closes=a.map(r=>r[4]),last=a.at(-1),e13=ema(closes,13),e20=ema(closes,20),e99=ema(closes,99);
  let gains=0,losses=0;for(let i=closes.length-14;i<closes.length;i++){const d=closes[i]-closes[i-1];gains+=Math.max(0,d);losses+=Math.max(0,-d);}
  const rsi=losses===0?100:100-100/(1+gains/losses);
  const atr=mean(a.slice(-14).map((r,i)=>{const prev=a[a.length-15+i][4];return Math.max(r[2]-r[3],Math.abs(r[2]-prev),Math.abs(r[3]-prev));}));
  const volumeBaseline=median(a.slice(-21,-1).map(r=>r[7]));
  return {closeAt:last[6],bars:a.length,sha256:digest(JSON.stringify(a)),rsi14:rsi,volumeRatio:volumeBaseline>0?last[7]/volumeBaseline:null,
    takerBuyPct:last[7]>0?last[10]/last[7]*100:null,ema20DistancePct:(last[4]/e20-1)*100,aboveEma99:last[4]>e99,
    ema20Up:e20>ema(closes.slice(0,-3),20),ema13DistanceAtr:atr>0?(last[4]-e13)/atr:null,
    ret15m:(last[4]/closes.at(-4)-1)*100,ret1h:(last[4]/closes.at(-13)-1)*100};
}
export function stats(a){const w=a.filter(r=>r.pnl>0),l=a.filter(r=>r.pnl<0),gp=w.reduce((s,r)=>s+r.pnl,0),gl=-l.reduce((s,r)=>s+r.pnl,0);return {
  positions:a.length,wins:w.length,losses:l.length,net:gp-gl,pf:gl>0?gp/gl:null,winRate:a.length?w.length/a.length*100:null,
  avgWin:mean(w.map(r=>r.pnl)),avgLoss:mean(l.map(r=>r.pnl)),avgRoe:mean(a.map(r=>r.roe)),sumRoe:a.reduce((s,r)=>s+r.roe,0)};}
export function folds(rows){return {
  train:rows.filter(r=>r.day<='2026-10-08'&&r.closedAt<Date.parse('2026-10-09T00:00:00+07:00')),
  validation:rows.filter(r=>r.day>='2026-10-09'&&r.day<='2026-10-12'),
  stress:rows.filter(r=>r.day==='2026-10-13'),
  purgedTrain:rows.filter(r=>r.day<='2026-10-08'&&r.closedAt>=Date.parse('2026-10-09T00:00:00+07:00'))};}
const present=(r,k)=>r[k]!=null&&Number.isFinite(r[k]);
export function rules(candles=false){const out=[
  ['BASELINE',()=>true],
  ['HOUR_AND_BTC',r=>r.reason==='GOOD_HOUR_AND_BTC_ALIGNED'],
  ['BTC15_POSITIVE',r=>present(r,'btc15m')&&r.btc15m>0],
  ['BTC15_GE_0_15',r=>present(r,'btc15m')&&r.btc15m>=.15],
  ['BTC1H_POSITIVE',r=>present(r,'btc1h')&&r.btc1h>0],
  ['BTC_BOTH_POSITIVE',r=>present(r,'btc1h')&&present(r,'btc15m')&&r.btc1h>0&&r.btc15m>0],
  ['SCORE_GE_40',r=>present(r,'score')&&r.score>=40],
  ['SCORE_GE_50',r=>present(r,'score')&&r.score>=50],
  ['BTC15_POS_SCORE40',r=>present(r,'btc15m')&&r.btc15m>0&&present(r,'score')&&r.score>=40],
  ['BTC15_GE_0_15_SCORE40',r=>present(r,'btc15m')&&r.btc15m>=.15&&present(r,'score')&&r.score>=40]];
  if(candles)out.push(
    ['RSI_45_65',r=>r.candle?.rsi14>=45&&r.candle.rsi14<=65],
    ['RSI_50_70',r=>r.candle?.rsi14>=50&&r.candle.rsi14<=70],
    ['VOL_GE_3',r=>r.candle?.volumeRatio>=3],
    ['VOL_GE_5',r=>r.candle?.volumeRatio>=5],
    ['TAKER_GE_65',r=>r.candle?.takerBuyPct>=65],
    ['EMA20_UP',r=>r.candle?.ema20Up===true],
    ['ABOVE_EMA99',r=>r.candle?.aboveEma99===true],
    ['NOT_EXTENDED_ATR2_RSI75',r=>r.candle!=null&&r.candle.ema13DistanceAtr<=2&&r.candle.rsi14<=75],
    ['BTC15_POS_EMA20_UP',r=>present(r,'btc15m')&&r.btc15m>0&&r.candle?.ema20Up===true],
    ['BTC15_POS_VOL3',r=>present(r,'btc15m')&&r.btc15m>0&&r.candle?.volumeRatio>=3],
    ['BTC15_POS_TAKER65',r=>present(r,'btc15m')&&r.btc15m>0&&r.candle?.takerBuyPct>=65]);
  return out;
}
export function evaluate(rows,candles=false){
  // Same candle coverage for every candidate, including baseline.
  const universe=candles?rows.filter(r=>r.candle!=null):rows,split=folds(universe);
  const results=rules(candles).map(([key,test])=>({key,...Object.fromEntries(['train','validation','stress'].map(k=>{
    const kept=split[k].filter(test),removed=split[k].filter(r=>!test(r));
    return [k,{...stats(kept),removed:stats(removed)}];})),all:stats(universe.filter(test))}));
  // Minimum 20 TRAIN positions; selection uses train avg ROE only, never test PnL.
  const ranked=results.filter(r=>r.key!=='BASELINE'&&r.train.positions>=20).sort((a,b)=>b.train.avgRoe-a.train.avgRoe||b.train.positions-a.train.positions||a.key.localeCompare(b.key));
  return {coverage:universe.length,purgedTrain:split.purgedTrain.length,selectedByTrain:ranked[0]?.key??null,results};
}
async function publicCandles(symbol,asOf){
  const q=new URLSearchParams({symbol,interval:'5m',endTime:String(asOf),limit:'250'});
  const response=await fetch(`https://fapi.binance.com/fapi/v1/klines?${q}`,{signal:AbortSignal.timeout(20000)});
  if(response.status===429||response.status===418)throw new Error(`RATE_LIMIT_STOP ${response.status}`);
  if(!response.ok)throw new Error(`HTTP_${response.status}`);
  const used=n(response.headers.get('x-mbx-used-weight-1m'));
  const raw=await response.json();if(!Array.isArray(raw))throw new Error('NOT_ARRAY');
  return {bars:raw.map(r=>r.map(Number)),used};
}
export function selfTest(){
  assert.equal(fields({entryReason:'x | btc15m=0 | score=42'}).btc15m,'0');
  const bars=Array.from({length:250},(_,i)=>[i*300000,100,102,99,100+i/100,1,(i+1)*300000-1,10,0,0,6]);
  const a=candleFeatures(bars,250*300000-1);assert(a);assert.equal(a.bars,250);
  assert.deepEqual(candleFeatures([...bars,[250*300000,1,1,1,99999,1,251*300000-1,99999,0,0,1]],250*300000-1),a);
  assert.equal(candleFeatures(bars.filter((_,i)=>i!==200),250*300000-1),null);
  assert.equal(candleFeatures(bars,251*300000),null);
  assert.equal(rules().find(([k])=>k==='BTC15_POSITIVE')[1]({btc15m:null}),false);
  assert.equal(rules(true).find(([k])=>k==='VOL_GE_3')[1]({}),false);
  const f=folds([{day:'2026-10-08',closedAt:Date.parse('2026-10-09T00:00:00+07:00')}]);assert.equal(f.train.length,0);assert.equal(f.purgedTrain.length,1);
  const records=Array.from({length:20},(_,i)=>({id:i,day:'2026-10-01',closedAt:0,score:50,btc15m:.2,btc1h:.2,pnl:1,roe:20}));
  assert.equal(evaluate(records).selectedByTrain,evaluate([...records,{day:'2026-10-13',pnl:-999,roe:-999,score:0,btc15m:-1}]).selectedByTrain);
  process.stderr.write('SELF_TEST_PASS\n');
}
async function main(){
  selfTest();if(process.argv.includes('--self-test'))return;
  const inputIdx=process.argv.indexOf('--input');let rows,source,asOf,excluded;
  if(inputIdx>=0){const text=await readFile(process.argv[inputIdx+1],'utf8'),saved=JSON.parse(text);({rows,source,asOf,excluded}=saved);}
  else {const text=await readFile('data/binance-filled-signal-audit/state.json','utf8'),raw=JSON.parse(text);({rows,excluded}=cohort(raw));source=digest(text);asOf=raw.updatedAt;}
  let errors=[];
  if(process.argv.includes('--candles')){
    let count=0;for(const r of rows){
      try{const {bars,used}=await publicCandles(r.symbol,r.signalAt);r.candle=candleFeatures(bars,r.signalAt);if(!r.candle)errors.push({symbol:r.symbol,entryAt:r.entryAt,error:'GAP_OR_SHORT_HISTORY'});
        if(used>700){process.stderr.write(`WEIGHT_PAUSE ${used}\n`);await new Promise(resolve=>setTimeout(resolve,45000));}}
      catch(e){errors.push({symbol:r.symbol,entryAt:r.entryAt,error:e.message});if(e.message.startsWith('RATE_LIMIT_STOP'))throw e;}
      count++;if(count%25===0)process.stderr.write(`CANDLES ${count}/${rows.length}\n`);
      await new Promise(resolve=>setTimeout(resolve,350));
    }
  }
  const candleMode=rows.some(r=>r.candle!=null);
  const output={version:VERSION,asOf,source,excluded,errors,positions:rows.length,rawReplay:evaluate(rows),
    size5:evaluate(rows.filter(r=>r.margin===5),candleMode),size1:evaluate(rows.filter(r=>r.margin===1),candleMode),
    distributions:candleMode?[5,1].map(margin=>({margin,winners:featureSummary(rows.filter(r=>r.margin===margin&&r.pnl>0&&r.candle)),losers:featureSummary(rows.filter(r=>r.margin===margin&&r.pnl<0&&r.candle))})):[],
    rows,notes:['Real audited exits retained; filtering is not an independent TP/SL/path or portfolio simulation.',
      'Chronological sensitivity: earlier whole-period audit already viewed; validation is not a blind prospective test.',
      'Closed-only survivor/censoring bias, same entry regime changes, multiple tests; no live rule decision.',
      'Candle metrics reconstructed at signal close, not exact frozen runtime EMA/RSI or market breadth.',
      'Training entries 01-08 Oct with exits before 09 Oct VN; validation entries 09-12; stress 13 (partial day).']};
  process.stdout.write(`RESULT_JSON=${JSON.stringify(output)}\n`);
}
function featureSummary(rows){return {n:rows.length,...Object.fromEntries(['score','btc15m','btc1h'].map(k=>[k,median(rows.map(r=>r[k]))])),
  ...Object.fromEntries(['rsi14','volumeRatio','takerBuyPct','ema20DistancePct','ema13DistanceAtr','ret1h'].map(k=>[k,median(rows.map(r=>r.candle[k]))]))};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
