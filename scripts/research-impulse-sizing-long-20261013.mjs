// Read-only descriptive audit. No exchange calls, no state/order writes, not a backtest.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {POST_MOVE_IMPULSE_LEGACY_SIZING_VERSION as VERSION} from '../src/postMoveImpulseSizing.js';

const sourceText=await readFile('data/binance-filled-signal-audit/state.json','utf8');
const raw=JSON.parse(sourceText);
const all=Object.values(raw.fills??{}).map(x=>x.record).filter(Boolean);
const n=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const day=t=>new Date(Date.parse(t)+7*3600_000).toISOString().slice(0,10);
const sum=(a,key)=>a.reduce((s,x)=>s+(n(x[key])??0),0);
const med=vs=>{const a=vs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2:null;};
const group=(a,key)=>{const m=new Map();for(const x of a){const k=key(x);m.set(k,[...(m.get(k)??[]),x]);}return m;};
function proof(r){
  const fields=Object.fromEntries(String(r.entryReason??'').split('|').map(s=>s.trim()).filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
  if(r.direction!=='LONG'||r.signalSource!=='post-move-impulse'||r.signalLabel!=='POST_DUMP_NO_SELL_BUY_IMPULSE_LONG'
    ||fields.sizing!==VERSION||![1,5].includes(n(fields.margin))||!['BASE_SIZE','GOOD_HOUR','BTC_ALIGNED','GOOD_HOUR_AND_BTC_ALIGNED'].includes(fields.sizeReason))return null;
  return fields;
}
const selected=all.filter(r=>proof(r));
const byClose=group(all.filter(r=>r.positionStatus==='CLOSED'),r=>r.closeGroupId??`${r.symbol}|${r.direction}|${r.orderId}`);
function sizeConsistent(r){
  const margin=n(r.marginUsdt), notional=n(r.filledNotionalUsdt),lev=n(r.leverage),p=proof(r);
  return margin>0 && notional>0 && lev>0 && p && n(p.margin)===margin
    && Math.abs(notional/lev-margin)/margin<=.05;
}
function annotate(r){
  const p=proof(r), margin=n(r.marginUsdt),notional=n(r.filledNotionalUsdt),lev=n(r.leverage);
  const impliedMargin=notional>0&&lev>0?notional/lev:null;
  const mismatch=!(margin>0&&impliedMargin>0)||Math.abs(impliedMargin-margin)/margin>.05;
  const g=byClose.get(r.closeGroupId??`${r.symbol}|${r.direction}|${r.orderId}`)??[r];
  const mixed=g.some(x=>!proof(x)||x.isDca===true||n(proof(x)?.margin)!==n(p.margin));
  const sameReason=g.every(x=>proof(x)?.sizeReason===p.sizeReason);
  return {...r,planned:n(p.margin),sizeReason:p.sizeReason,hour:n(p.hourVN),btcTrend:p.btc,
    btc1h:n(p.btc1h),btc15m:n(p.btc15m),score:n(p.score),proof:p,day:day(r.filledAt),pnl:n(r.netRealizedPnlUsdt),
    margin,notional,impliedMargin,notionalMismatch:mismatch,mixedLifecycle:mixed,sameReason,
    lifecycle:r.closeGroupId??`${r.symbol}|${r.direction}|${r.orderId}`,
    comparable:!mixed&&g.every(x=>sizeConsistent(x)&&x.isDca!==true)};
}
const rows=selected.map(annotate),closed=rows.filter(r=>r.positionStatus==='CLOSED'&&r.pnl!=null);
const comparable=closed.filter(r=>r.comparable);
function stats(a){
  const wins=a.filter(r=>r.pnl>0),loss=a.filter(r=>r.pnl<0),gp=sum(wins,'pnl'),gl=-sum(loss,'pnl');
  const lifecycles=[...group(a,r=>r.lifecycle)].map(([id,g])=>({id,pnl:sum(g,'pnl')}));
  const lifeWins=lifecycles.filter(x=>x.pnl>0),lifeLosses=lifecycles.filter(x=>x.pnl<0);
  return {fills:a.length,positions:lifecycles.length,positionWins:lifecycles.filter(x=>x.pnl>0).length,
    positionLosses:lifecycles.filter(x=>x.pnl<0).length,net:sum(a,'pnl'),gross:sum(a,'grossRealizedPnlUsdt'),
    fees:sum(a,'commissionUsdt'),funding:sum(a,'fundingPnlUsdt'),grossWins:gp,grossLosses:gl,
    profitFactor:gl>0?gp/gl:null,avgWin:wins.length?gp/wins.length:null,avgLoss:loss.length?-gl/loss.length:null,
    avgPositionWin:lifeWins.length?gp/lifeWins.length:null,avgPositionLoss:lifeLosses.length?-gl/lifeLosses.length:null,
    breakEvenWinRate:lifeWins.length && lifeLosses.length?(gl/lifeLosses.length)/((gp/lifeWins.length)+(gl/lifeLosses.length))*100:null,
    avgNetPerFill:a.length?sum(a,'pnl')/a.length:null,avgPlannedRoe:a.length?a.reduce((s,r)=>s+r.pnl/r.planned*100,0)/a.length:null,
    medianPlannedRoe:med(a.map(r=>r.pnl/r.planned*100)),weightedPlannedRoe:sum(a,'margin')>0?sum(a,'pnl')/sum(a,'margin')*100:null,
    maxLoss:a.length?Math.min(...a.map(r=>r.pnl)):null,medianHoldMinutes:med(a.map(r=>(Date.parse(r.closedAt)-Date.parse(r.filledAt))/60000)),
    mixedFills:a.filter(r=>r.mixedLifecycle).length,notionalMismatchFills:a.filter(r=>r.notionalMismatch).length};
}
const partitions=(a,key)=>[...group(a,key)].map(([key,g])=>({key,...stats(g)}));
const exposureMismatch=closed.filter(r=>r.notionalMismatch);
const output={version:'IMPULSE_SIZE_DESCRIPTIVE_AUDIT_20261013',asOf:raw.updatedAt,sourceVersion:VERSION,
  range:{first:rows.map(r=>r.filledAt).sort()[0],last:rows.map(r=>r.filledAt).sort().at(-1)},
  eligibility:{fills:rows.length,closed:closed.length,open:rows.length-closed.length,notionalMismatch:exposureMismatch.length,
    mixed:closed.filter(r=>r.mixedLifecycle).length,comparableClosed:comparable.length},
  allPlannedSizes:partitions(closed,r=>String(r.planned)),comparableSizes:partitions(comparable,r=>String(r.planned)),
  reasonsAll:partitions(closed,r=>r.sizeReason),reasonsComparable:partitions(comparable,r=>r.sizeReason),
  dailyAll:partitions(closed,r=>`${r.day}|size${r.planned}`),dailyComparable:partitions(comparable,r=>`${r.day}|size${r.planned}`),
  hourComparable:partitions(comparable.filter(r=>r.planned===5),r=>String(r.hour)),
  btc15mComparable:partitions(comparable.filter(r=>r.planned===5),r=>r.btc15m==null?'MISSING':r.btc15m<=0?'BTC15_NONPOSITIVE':r.btc15m<.15?'BTC15_SMALL_UP':'BTC15_UP_GE_0_15'),
  exitReasonsComparable:partitions(comparable.filter(r=>r.planned===5),r=>r.closeReason??'UNKNOWN'),
  btc1hComparable:partitions(comparable.filter(r=>r.planned===5),r=>r.btc1h==null?'MISSING':r.btc1h<=0?'BTC1H_NONPOSITIVE':r.btc1h<.15?'BTC1H_SMALL_UP':'BTC1H_UP_GE_0_15'),
  scoreComparable:partitions(comparable.filter(r=>r.planned===5),r=>r.score==null?'MISSING':r.score<40?'SCORE_LT40':r.score<50?'SCORE_40_49':'SCORE_GE50'),
  mixedCountBySize:partitions(closed.filter(r=>r.mixedLifecycle),r=>String(r.planned)),
  inconsistentExamples:exposureMismatch.sort((a,b)=>a.pnl-b.pnl).slice(0,8).map(r=>({symbol:r.symbol,filledAt:r.filledAt,planned:r.planned,
    margin:r.margin,leverage:r.leverage,notional:r.notional,impliedMargin:r.impliedMargin,pnl:r.pnl,source:r.fillEventSource,reason:r.closeReason,
    groupSize:byClose.get(r.lifecycle)?.length,groupSources:[...new Set((byClose.get(r.lifecycle)??[]).map(x=>x.signalSource))]})),
  worstComparable:comparable.filter(r=>r.planned===5).sort((a,b)=>a.pnl-b.pnl).slice(0,8).map(r=>({symbol:r.symbol,filledAt:r.filledAt,
    pnl:r.pnl,reason:r.sizeReason,btc1h:r.btc1h,btc15m:r.btc15m,score:r.score,exit:r.closeReason})),
  matchedDayDelta:[...group(comparable,r=>r.day)].filter(([,g])=>g.some(r=>r.planned===1)&&g.some(r=>r.planned===5)).map(([day,g])=>({day,
    size1:stats(g.filter(r=>r.planned===1)),size5:stats(g.filter(r=>r.planned===5))})),
  notes:['Sizes are selected cohorts, not randomized/counterfactual.','PnL allocated by audit filled-notional on shared position close; no clean-trade claim without size/mix checks.',
    'Notional/margin consistency is an audit quality screen, not verification with Binance trade history.','No frozen breadth/candle-volume proof in these audit rows; cannot assert historical breadth caused each loss.']};
output.sourceSha256=createHash('sha256').update(sourceText).digest('hex');
const totalNet=output.allPlannedSizes.reduce((s,x)=>s+x.net,0);
if(Math.abs(totalNet-sum(closed,'pnl'))>1e-8)throw new Error('size partitions do not reconcile');
for(const x of output.comparableSizes)if(Math.abs(x.gross-x.fees+x.funding-x.net)>1e-6)throw new Error('net reconciliation failed');
process.stdout.write(JSON.stringify(output));
