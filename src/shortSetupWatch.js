import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {wickClosedRows} from './btcWickRecovery.js';
import {SHORT_SETUP_VERSION as VERSION, SHORT_SETUP_LEGACY_VERSION, SHORT_SETUP_PUSH_TYPE, SHORT_SETUP_PATTERNS, rankShortSetups} from '../public/short-setup-model.js';

const MIN = 60_000, DAY = 86400_000;
const mean = xs => xs.reduce((a,b) => a+b,0) / xs.length;
const pct = (a,b) => (a/b-1)*100;
const clone = x => JSON.parse(JSON.stringify(x));
const validSymbol = x => /^[\p{L}\p{N}]{1,32}USDT$/u.test(x ?? '');
const active = e => ['WAIT_BREAK','WAIT_RETEST','READY','CHASE'].includes(e.state);
export const SHORT_SETUP_POLICY = Object.freeze({requiredBars:81, maxAgeMs:75_000,
  waitMinutes:15, readyMinutes:10, minRewardRisk:1.5, maxChaseAtr:0.5,
  pumpMinPct:2, pumpAtrMultiple:3, minVolumeRatio:1.3, minTakerSellPct:55});

function atr(rows) {
  return mean(rows.map((r,i) => Math.max(r.high-r.low,
    Math.abs(r.high-(rows[i-1]?.close ?? r.open)), Math.abs(r.low-(rows[i-1]?.close ?? r.open)))));
}
function ema(rows, period) {
  let value = rows[0].close;
  for(const r of rows.slice(1)) value += (r.close-value)*2/(period+1);
  return value;
}
function rsi(rows) {
  const tail=rows.slice(-15); let up=0, down=0;
  for(let i=1;i<tail.length;i++) {const d=tail[i].close-tail[i-1].close;up+=Math.max(d,0);down+=Math.max(-d,0);}
  return up+down===0 ? 50 : down===0 ? 100 : 100-100/(1+up/down);
}
// Every swing requires two already closed candles on its right. Nothing uses future bars.
function swings(rows, side) {
  const key=side==='HIGH'?'high':'low', out=[];
  for(let i=2;i<rows.length-2;i++) {
    const v=rows[i][key], neighbors=[rows[i-2],rows[i-1],rows[i+1],rows[i+2]].map(r=>r[key]);
    if(side==='HIGH'?neighbors.every(x=>v>=x)&&neighbors.some(x=>v>x):neighbors.every(x=>v<=x)&&neighbors.some(x=>v<x))
      out.push({price:v,at:rows[i].closeTime,confirmedAt:rows[i+2].closeTime});
  }
  return out;
}
function cluster(points, tolerance) {
  const groups=[];
  for(const p of points) {
    let g=groups.find(g=>Math.abs(p.price-g.center)<=tolerance);
    if(!g) {g={center:p.price,points:[]};groups.push(g);}
    g.points.push(p);g.center=mean(g.points.map(x=>x.price));
  }
  return groups.map(g=>({low:Math.min(...g.points.map(p=>p.price))-tolerance/2,
    high:Math.max(...g.points.map(p=>p.price))+tolerance/2,touches:g.points.length,
    establishedAt:Math.max(...g.points.map(p=>p.confirmedAt))}));
}
export function shortStructureContext(prior) {
  if(prior.length<80)return null;
  const base=prior.slice(-60,-40),wave=prior.slice(-40),last=prior.at(-1);
  const a=atr(prior.slice(-20));
  if(!(a>0))return null;
  const floor=Math.min(...wave.map(r=>r.low)),peak=Math.max(...wave.map(r=>r.high));
  const floorIndex=wave.findIndex(r=>r.low===floor),peakIndex=wave.findLastIndex(r=>r.high===peak);
  const baseline=mean(base.map(r=>r.quoteVolume)),waveVolume=mean(wave.map(r=>r.quoteVolume));
  const gain=pct(peak,floor), pumped=peakIndex>floorIndex && gain>=Math.max(2,3*a/last.close*100)
    && baseline>0 && waveVolume>=baseline*1.3 && last.close>=floor+(peak-floor)*.5;
  const drop=(1-floor/peak)*100, dumped=peakIndex<floorIndex && drop>=Math.max(2,3*a/last.close*100)
    && baseline>0 && waveVolume>=baseline*1.3 && last.close<=floor+(peak-floor)*.5;
  const tolerance=Math.min(last.close*.006,Math.max(last.close*.0012,a*.4));
  const resistance=cluster(swings(prior.slice(-60),'HIGH'),tolerance);
  const support=cluster(swings(prior.slice(-60),'LOW'),tolerance);
  return {atr:a,atrPct:a/last.close*100,pumped,dumped,pumpGainPct:gain,dumpDropPct:drop,waveVolumeRatio:baseline>0?waveVolume/baseline:null,
    baseline:mean(prior.slice(-20).map(r=>r.quoteVolume)),tolerance,resistance,support,
    ema9:ema(prior,9),ema21:ema(prior,21),rsi14:rsi(prior),priorRsi14:rsi(prior.slice(0,-1))};
}
function targetFor(context, entry, excluded=null) {
  // The nearest pre-existing support is the first obstacle. No target invented from an arbitrary %.
  return context.support.filter(z=>z.high<entry-context.tolerance && (!excluded || z.high<excluded.low-context.tolerance))
    .sort((a,b)=>b.high-a.high)[0]?.high ?? null;
}
function assess(e, candle, now) {
  const long=e.side==='LONG',price=candle.close,entry=e.state==='WAIT_RETEST'?(long?e.zone.high:e.zone.low)
    :(long?Math.max(price,e.triggerPrice):Math.min(price,e.triggerPrice));
  const risk=long?entry-e.invalidationPrice:e.invalidationPrice-entry;
  const reward=e.targetPrice==null?null:long?e.targetPrice-entry:entry-e.targetPrice;
  const rr=risk>0 && reward>0 ? reward/risk : null;
  const sell=candle.quoteVolume>0?(1-candle.takerBuyQuoteVolume/candle.quoteVolume)*100:null;
  const volume=e.baseline>0?candle.quoteVolume/e.baseline:null;
  const breakPattern=['BREAK_RETEST','BREAK_HOLD'].includes(e.pattern),buy=sell==null?null:100-sell;
  const factors=[{label:long?(breakPattern?'Kháng cự đã vượt':'Có nến quét đáy lấy lại vùng'):(breakPattern?'Hỗ trợ đã bị phá':'Có nến vượt đỉnh thất bại'),points:breakPattern?35:25},
    {label:'Vùng có ít nhất 2 swing đã xác nhận',points:e.zone.touches>=2?10:0},
    {label:long?'Mua chủ động ≥60%':'Bán chủ động ≥60%',points:(long?buy:sell)>=60?10:0},
    {label:'Volume nến ≥2× nền20',points:volume>=2?10:0},
    {label:long?'Giá trên EMA9':'Giá dưới EMA9',points:(long?price>e.context.ema9:price<e.context.ema9)?5:0},
    {label:long?'RSI14 tăng từ vùng ≤35':'RSI14 giảm từ vùng ≥65',points:(long?e.context.priorRsi14<=35&&e.context.rsi14>e.context.priorRsi14:e.context.priorRsi14>=65&&e.context.rsi14<e.context.priorRsi14)?5:0},
    {label:long?'R:R tới kháng cự gần nhất ≥1,5':'R:R tới hỗ trợ gần nhất ≥1,5',points:rr>=1.5?15:0},
    {label:'Đã có nến kích hoạt',points:e.triggeredAt?10:0}];
  return {...e,price,updatedAt:candle.closeTime,observedAt:now,referenceEntry:entry,rewardRisk:rr,
    riskPct:risk>0?risk/entry*100:null,rewardPct:reward>0?reward/entry*100:null,
    takerSellPct:sell,takerBuyPct:buy,volumeRatio:volume,score:Math.min(100,factors.reduce((s,x)=>s+x.points,0)),factors,
    priorityEligible:e.state==='READY'&&rr>=1.5};
}
export function detectShortSetup({symbol,rows=[],now=Date.now()}={}) {
  const closed=wickClosedRows(rows,now,90);
  if(!validSymbol(symbol)||closed.length<81)return {status:'WAIT_DATA'};
  const prior=closed.slice(0,-1),candle=closed.at(-1),context=shortStructureContext(prior);
  if(!context?.pumped)return {status:'NO_PUMP'};
  const range=candle.high-candle.low,upper=range>0?(candle.high-Math.max(candle.open,candle.close))/range:0;
  const lower=range>0?(Math.min(candle.open,candle.close)-candle.low)/range:0;
  const sell=candle.quoteVolume>0?(1-candle.takerBuyQuoteVolume/candle.quoteVolume)*100:0;
  const volume=context.baseline>0?candle.quoteVolume/context.baseline:0;
  const resistance=context.resistance.filter(z=>z.low>=prior.at(-1).close-context.tolerance*2 && candle.high>=z.high)
    .sort((a,b)=>b.touches-a.touches||Math.abs(a.low-candle.close)-Math.abs(b.low-candle.close))[0];
  let pattern,zone,state,trigger,invalidation,reason;
  if(resistance && candle.close<resistance.low && candle.close<candle.open && upper>=.35 && lower<.4
    && volume>=1.3 && sell>=55) {
    pattern='FAILED_HIGH';zone=resistance;state='WAIT_BREAK';trigger=candle.low;
    invalidation=candle.high+context.atr*.2;
    reason='Chọc qua swing đỉnh, đóng lại dưới vùng với râu trên và lực bán; chờ nến sau đóng dưới đáy nến từ chối.';
  } else {
    const supports=context.support.filter(z=>prior.at(-1).close>=z.low && candle.close<z.low-context.atr*.1)
      .sort((a,b)=>b.high-a.high);
    zone=supports[0];
    if(zone && candle.close<candle.open && lower<.4 && volume>=1.3 && sell>=55) {
      pattern='BREAK_RETEST';state='WAIT_RETEST';trigger=zone.low;
      invalidation=zone.high+context.atr*.3;
      reason='Nến bán đóng dưới hỗ trợ đã xác định; chờ hồi chạm vùng rồi đóng lại dưới vùng.';
    } else {
      zone=context.resistance.filter(z=>z.low>=candle.close-context.tolerance && z.low-candle.close<=context.atr*2)
        .sort((a,b)=>a.low-b.low)[0];
      if(!zone)return {status:'PUMP_ONLY'};
      return {status:'WATCH',row:{id:`short-watch:${symbol}`,symbol,side:'SHORT',pattern:'RESISTANCE_WATCH',state:'WATCH',
        version:VERSION,observeOnly:true,interval:'1m',chart:closed.slice(-60),
        zone,price:candle.close,updatedAt:candle.closeTime,observedAt:now,score:0,context,
        reason:'Giá gần swing đỉnh; chưa có nến từ chối và chưa phá cấu trúc tăng.',priorityEligible:false}};
    }
  }
  const id=`short-setup:${symbol}:${pattern}:${candle.closeTime}`;
  const setup={version:VERSION,observeOnly:true,id,symbol,side:'SHORT',interval:'1m',pattern,state,zone,
    createdAt:candle.closeTime,deadline:candle.closeTime+15*MIN,triggerPrice:trigger,invalidationPrice:invalidation,
    targetPrice:targetFor(context,state==='WAIT_RETEST'?zone.low:trigger,pattern==='BREAK_RETEST'?zone:null),
    context,baseline:context.baseline,reason,originCandle:candle,originRows:closed,transitionRows:[],chart:closed.slice(-60),timeline:[]};
  return {status:'SETUP',row:assess(setup,candle,now)};
}
export function detectLongSetup({symbol,rows=[],now=Date.now()}={}) {
  const closed=wickClosedRows(rows,now,90);
  if(!validSymbol(symbol)||closed.length<81)return {status:'WAIT_DATA'};
  const prior=closed.slice(0,-1),candle=closed.at(-1),context=shortStructureContext(prior);
  if(!context || !(context.pumped||context.dumped))return {status:'NO_WAVE'};
  const range=candle.high-candle.low,upper=range>0?(candle.high-Math.max(candle.open,candle.close))/range:0;
  const lower=range>0?(Math.min(candle.open,candle.close)-candle.low)/range:0;
  const buy=candle.quoteVolume>0?candle.takerBuyQuoteVolume/candle.quoteVolume*100:0;
  const volume=context.baseline>0?candle.quoteVolume/context.baseline:0;
  let zone=context.support.filter(z=>z.high<=prior.at(-1).close+context.tolerance*2&&candle.low<=z.low)
    .sort((a,b)=>b.touches-a.touches||Math.abs(a.high-candle.close)-Math.abs(b.high-candle.close))[0];
  let pattern,state,trigger,invalidation,reason;
  if(zone&&candle.close>zone.high&&candle.close>candle.open&&lower>=.35&&upper<.4&&volume>=1.3&&buy>=55) {
    pattern='FAILED_LOW';state='WAIT_BREAK';trigger=candle.high;invalidation=candle.low+(-context.atr*.2);
    reason='Quét qua swing đáy rồi nến xanh đóng lấy lại hỗ trợ với râu dưới và lực mua; chờ nến sau đóng vượt đỉnh nến lấy lại vùng.';
  }else {
    zone=context.resistance.filter(z=>prior.at(-1).close<=z.high&&candle.close>z.high+context.atr*.1)
      .sort((a,b)=>a.low-b.low)[0];
    if(zone&&candle.close>candle.open&&upper<.4&&volume>=1.3&&buy>=55) {
      pattern='BREAK_HOLD';state='WAIT_RETEST';trigger=zone.high;invalidation=zone.low-context.atr*.3;
      reason='Nến mua đóng vượt kháng cự đã xác định; chờ retest chạm vùng rồi nến xanh đóng giữ phía trên.';
    }else {
      zone=context.support.filter(z=>z.high<=candle.close+context.tolerance&&candle.close-z.high<=context.atr*2)
        .sort((a,b)=>b.high-a.high)[0];
      if(!zone)return {status:'WAVE_ONLY'};
      return {status:'WATCH',row:{id:`long-watch:${symbol}`,symbol,side:'LONG',pattern:'SUPPORT_WATCH',state:'WATCH',
        version:VERSION,observeOnly:true,interval:'1m',chart:closed.slice(-60),zone,price:candle.close,
        updatedAt:candle.closeTime,observedAt:now,score:0,context,priorityEligible:false,
        reason:'Giá gần swing đáy; chưa có nến lấy lại vùng hoặc retest giữ vùng để kích hoạt LONG.'}};
    }
  }
  const entry=state==='WAIT_RETEST'?zone.high:trigger;
  const target=context.resistance.filter(z=>z.low>entry+context.tolerance
    &&(pattern!=='BREAK_HOLD'||z.low>zone.high+context.tolerance)).sort((a,b)=>a.low-b.low)[0]?.low??null;
  return {status:'SETUP',row:assess({version:VERSION,observeOnly:true,id:`long-setup:${symbol}:${pattern}:${candle.closeTime}`,
    symbol,side:'LONG',interval:'1m',pattern,state,zone,createdAt:candle.closeTime,deadline:candle.closeTime+15*MIN,
    triggerPrice:trigger,invalidationPrice:invalidation,targetPrice:target,context,baseline:context.baseline,
    reason,originCandle:candle,originRows:closed,transitionRows:[],chart:closed.slice(-60),timeline:[]},candle,now)};
}
export function advanceShortSetup(e,candle,previous,now=Date.now()) {
  if(!active(e)||candle.closeTime<=e.updatedAt)return e;
  const long=e.side==='LONG';let next={...e,chart:[...(e.chart??[]),candle].slice(-60),
    ...(Array.isArray(e.originRows)?{transitionRows:[...(e.transitionRows??[]),candle]}:{})};
  // Intrabar path is unknown: any trade above the fixed invalidation cancels first, even on a red close.
  if(long?candle.low<=e.invalidationPrice:candle.high>=e.invalidationPrice) {next.state='INVALIDATED';next.reason=`Giá đã chạm mức vô hiệu phía ${long?'dưới':'trên'}.`;}
  else if(candle.closeTime>e.deadline) {next.state='EXPIRED';next.reason='Hết thời gian theo dõi setup.';}
  else if(e.state==='WAIT_BREAK' && (long?candle.close>e.triggerPrice&&candle.close>candle.open:candle.close<e.triggerPrice&&candle.close<candle.open)) {
    next.state='READY';next.triggeredAt=candle.closeTime;next.deadline=candle.closeTime+10*MIN;
    next.referenceEntry=candle.close;next.triggerPrice=candle.close;
    next.reason=long?'Nến sau xanh đóng vượt đỉnh nến lấy lại hỗ trợ; căn cứ LONG đã kích hoạt.':'Nến sau đóng dưới đáy nến từ chối; căn cứ SHORT sớm đã kích hoạt.';
  } else if(e.state==='WAIT_RETEST') {
    if(long?candle.low<=e.zone.high:candle.high>=e.zone.low) next.retestedAt=candle.closeTime;
    const confirmed=long?candle.close>e.zone.high&&candle.close>candle.open&&candle.close>previous.high
      &&candle.quoteVolume>0&&candle.takerBuyQuoteVolume/candle.quoteVolume>=.55
      :candle.close<e.zone.low&&candle.close<candle.open&&candle.close<previous.low
      &&candle.quoteVolume>0&&candle.takerBuyQuoteVolume/candle.quoteVolume<=.45;
    if(next.retestedAt && confirmed) {
      next.state='READY';next.triggeredAt=candle.closeTime;next.deadline=candle.closeTime+10*MIN;
      next.triggerPrice=candle.close;next.reason=long?'Retest vùng kháng cự đã vượt, nến xanh đóng trên vùng và trên đỉnh nến trước với lực mua.':'Hồi chạm hỗ trợ đã mất, đóng dưới vùng và dưới đáy nến trước với lực bán.';
    }
  }
  if(['READY','CHASE'].includes(next.state) && ((long?candle.close>next.triggerPrice+next.context.atr*.5:candle.close<next.triggerPrice-next.context.atr*.5)
    || next.targetPrice!=null&&(long?candle.high>=next.targetPrice:candle.low<=next.targetPrice))) {
    next.state='CHASE';next.reason='Giá đã đi xa khỏi điểm kích hoạt hoặc chạm mục tiêu cấu trúc; hạ ưu tiên.';
  }
  return assess(next,candle,now);
}
export function shortSetupPushPayload(e,now=Date.now()) {
  const long=e.side==='LONG',side=long?'LONG':'SHORT';
  return {signalType:SHORT_SETUP_PUSH_TYPE,eventId:`${e.id}:${e.state}:${e.updatedAt}`,expiresAt:now+120_000,
    title:`${long?'🔴':'🟢'} ${e.symbol} · ${SHORT_SETUP_PATTERNS[e.pattern]} · ${e.state==='READY'?side+' kích hoạt':'cảnh báo sớm '+side}`,
    body:`Điểm ${e.score}/100 · giá ${e.price} · kích hoạt ${e.triggerPrice} · vô hiệu ${e.invalidationPrice} · ${long?'kháng cự':'hỗ trợ'} ${e.targetPrice??'chưa có'} · R:R ${e.rewardRisk?.toFixed(2)??'chưa đủ'}. ${e.reason}`,
    symbol:e.symbol,side,interval:'1m',url:`/short-setup-watch?signal=${encodeURIComponent(e.id)}`};
}

export class ShortSetupWatch {
  constructor({file,getRows=()=>[],getSymbols=()=>[],pushSender=async()=>({sent:0}),discordSender=null,onEntry=null,now=()=>Date.now()}={}) {
    Object.assign(this,{file,getRows,getSymbols,pushSender,discordSender,onEntry,now});this.startedAt=now();this.history=[];this.live=[];
    this.pushEnabled=true;this.pushEarly=false;this.discordEnabled=true;this.error=null;this.busy=false;this.lastClosed=new Map();this.coverage={};
  }
  async init() {
    if(!this.file)return this;
    try {
      const raw=JSON.parse(await readFile(this.file,'utf8'));
      const versions=[VERSION,SHORT_SETUP_LEGACY_VERSION];
      if(!versions.includes(raw.version)||!Array.isArray(raw.history)||typeof raw.pushEnabled!=='boolean'||typeof raw.pushEarly!=='boolean'
        ||raw.discordEnabled!==undefined&&typeof raw.discordEnabled!=='boolean')throw new Error('schema');
      if(raw.history.some(e=>!validSymbol(e.symbol)||!versions.includes(e.version)||!Array.isArray(e.timeline)||!Number.isFinite(e.updatedAt)))throw new Error('schema');
      this.history=raw.history;this.pushEnabled=raw.pushEnabled;this.pushEarly=raw.pushEarly;
      this.discordEnabled=raw.discordEnabled??true;
      for(const e of this.history) {
        for(const event of e.timeline)for(const key of ['delivery','discordDelivery'])
          if(event[key]?.status==='POSTING')event[key]={status:'UNKNOWN_AFTER_RESTART'};
        if(active(e)) {e.state='DATA_GAP';e.reason='Backend đã restart; giữ mẫu cũ để đối chiếu, chờ setup mới.';}
      }
    }catch(e){if(e.code!=='ENOENT')this.error='Không đọc được lịch sử hợp lệ; dừng push và giữ file cũ.';}
    return this;
  }
  async save() {
    if(this.error)throw new Error('storage unavailable');
    this.history=this.history.filter(e=>this.now()-e.createdAt<=14*DAY).slice(-2000);
    if(!this.file)return;
    await mkdir(dirname(this.file),{recursive:true});const tmp=`${this.file}.tmp-${process.pid}`;
    await writeFile(tmp,JSON.stringify({version:VERSION,pushEnabled:this.pushEnabled,pushEarly:this.pushEarly,discordEnabled:this.discordEnabled,history:this.history}));
    await rename(tmp,this.file);
  }
  async settings({pushEnabled,pushEarly,discordEnabled=this.discordEnabled}={}) {
    if(this.busy)throw new Error('busy');
    if(typeof pushEnabled!=='boolean'||typeof pushEarly!=='boolean'||typeof discordEnabled!=='boolean')throw new Error('invalid');
    this.busy=true;try {this.pushEnabled=pushEnabled;this.pushEarly=pushEarly;this.discordEnabled=discordEnabled;await this.save();return this.snapshot();}
    finally{this.busy=false;}
  }
  async scan() {
    if(this.busy||this.error)return;this.busy=true;
    try {
      const now=this.now(),symbols=[...new Set(this.getSymbols())].filter(validSymbol),notifications=[],entries=[];
      const c={total:symbols.length,ready:0,pumping:0,updatedAt:now};this.live=[];let changed=false;
      for(const symbol of symbols) {
        const rows=wickClosedRows(this.getRows(symbol),now,90);
        if(rows.length<81) {
          for(const e of this.history.filter(e=>e.symbol===symbol&&active(e))) {
            e.state='DATA_GAP';e.reason='Nến thiếu, cũ hoặc có khoảng trống; ngừng xếp ưu tiên.';changed=true;
          }
          continue;
        }
        c.ready++;const candle=rows.at(-1),previous=rows.at(-2),newBar=this.lastClosed.get(symbol)!==candle.closeTime;
        let current=this.history.filter(e=>e.symbol===symbol&&active(e));
        if(newBar) {
          this.lastClosed.set(symbol,candle.closeTime);
          for(const e of current) {
            const next=candle.closeTime-e.updatedAt!==MIN?{...e,state:'DATA_GAP',updatedAt:candle.closeTime,
              reason:'Bỏ lỡ nến giữa setup; chờ setup mới.'}:advanceShortSetup(e,candle,previous,now);
            if(next.state!==e.state) {
              this.transition(next,now,notifications);changed=true;
              if(next.state==='READY'&&next.rewardRisk>=1.5&&next.updatedAt>this.startedAt)entries.push(clone(next));
            }
            Object.assign(e,next);changed=true;
          }
        }
        current=this.history.filter(e=>e.symbol===symbol&&active(e));
        const evaluations=[detectShortSetup({symbol,rows,now}),detectLongSetup({symbol,rows,now})];
        if(evaluations.some(e=>['SETUP','WATCH','PUMP_ONLY','WAVE_ONLY'].includes(e.status))||current.length)c.pumping++;
        for(const [index,evaluation] of evaluations.entries()) {
          const side=index===0?'SHORT':'LONG',sideCurrent=current.filter(e=>(e.side??'SHORT')===side);
          if(!sideCurrent.length && evaluation.status==='SETUP') {
            const candidate=evaluation.row;
            const recent=this.history.find(e=>e.symbol===symbol&&(e.side??'SHORT')===side&&e.pattern===candidate.pattern
            && now-e.createdAt<10*MIN && Math.abs(e.zone.low-candidate.zone.low)<candidate.context.tolerance);
            if(!recent && !this.history.some(e=>e.id===candidate.id)) {
              this.transition(candidate,now,notifications);this.history.push(candidate);changed=true;sideCurrent.push(candidate);
            }
          }
          this.live.push(...sideCurrent);
          if(!sideCurrent.length&&evaluation.status==='WATCH')this.live.push(evaluation.row);
        }
      }
      this.coverage=c;
      if(changed)await this.save(); // Persist intent and fixed levels before calling Web Push.
      // Entry does not depend on Push/Discord subscriptions, toggles or quiet hours.
      for(const e of entries)if(this.onEntry) {
        try {void Promise.resolve(this.onEntry(e)).catch(()=>{this.entryError='Không xử lý được MARKET; không tự gửi lại setup.';});}
        catch{this.entryError='Không xử lý được MARKET; không tự gửi lại setup.';}
      }
      for(const {setup,event} of notifications) {
        const snapshot={...setup,state:event.state,updatedAt:event.at};
        await Promise.all([['delivery',this.pushSender,shortSetupPushPayload(snapshot,this.now())],
          ['discordDelivery',this.discordSender,snapshot]].map(async([key,sender,payload])=>{
          if(event[key]?.status!=='POSTING'||!sender)return;
          if(this.now()-event.at>75_000){event[key]={status:'STALE'};return;}
          try {
            const d=await sender(payload);
            event[key]={status:d.skipped==='QUIET_HOURS'?'QUIET_HOURS':d.sent>0?(d.failed>0?'PARTIAL':'SENT'):d.error||d.attempted>0?'FAILED':'NO_SUBSCRIBERS'};
          }catch{event[key]={status:'FAILED'};}
        }));
      }
      if(notifications.length)await this.save();
    }catch{this.error='Không xử lý/lưu được setup; dừng push để kiểm tra.';this.live=[];}
    finally{this.busy=false;}
  }
  transition(e,now,notifications) {
    const eligible=e.state==='READY'&&e.rewardRisk>=1.5 || this.pushEarly&&e.state==='WAIT_BREAK';
    const status=enabled=>!enabled?'DISABLED':!eligible?'NOT_SELECTED':e.updatedAt<=this.startedAt?'PRE_START':now-e.updatedAt>75_000?'STALE':'POSTING';
    const event={state:e.state,at:e.updatedAt,reason:e.reason,price:e.price,score:e.score,rewardRisk:e.rewardRisk,
      delivery:{status:status(this.pushEnabled)},
      discordDelivery:{status:!this.discordSender?'NOT_CONFIGURED':status(this.discordEnabled)}};
    e.timeline.push(event);
    if(event.delivery.status==='POSTING'||event.discordDelivery.status==='POSTING')notifications.push({setup:e,event});
  }
  start() {void this.init().then(()=>{void this.scan();this.timer=setInterval(()=>void this.scan(),5000);this.timer.unref?.();});}
  stop(){clearInterval(this.timer);}
  snapshot(id=null) {
    const publicRow=({originRows,transitionRows,...e})=>e;
    return clone({version:VERSION,observeOnly:true,policy:SHORT_SETUP_POLICY,startedAt:this.startedAt,error:this.error,
      pushEnabled:this.pushEnabled,pushEarly:this.pushEarly,discordEnabled:this.discordEnabled,discordConfigured:Boolean(this.discordSender),coverage:this.coverage,
      live:rankShortSetups(this.live).map(publicRow),history:[...this.history].reverse().slice(0,100).map(publicRow),
      selected:id?this.history.find(e=>e.id===id)?publicRow(this.history.find(e=>e.id===id)):null:null});
  }
}
