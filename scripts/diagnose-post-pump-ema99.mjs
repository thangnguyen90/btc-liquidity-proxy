import { readFile } from 'node:fs/promises';
import { detectPostPumpEma99Retest } from '../src/postPumpEma99Retest.js';
// Read-only diagnostics: evaluate all numeric gates with the production formulas.
let source=await readFile(new URL('../src/postPumpEma99Retest.js',import.meta.url),'utf8');
for(const pattern of [
  'if(decline<0.8||slopePct> -0.3)continue;',
  'if(pumpPct<8||dropPct<5||fadePct> -0.5||belowCount<6||candle.open>=priorE)continue;',
  'if(!(atr>0)||spike<Math.max(candle.open*0.01,atr*0.8)||volRatio<1.5||overshoot< -nearLimitPct||overshoot>Math.max(3,atr/e*150))continue;',
]) {if(!source.includes(pattern))throw new Error('Diagnostic source no longer matches detector');source=source.replace(pattern,'');}
source=source.replace('price:candle.close,ema99:e,',`debugFailures:[
  decline<0.8&&'EMA declining steps <80%',slopePct> -0.3&&'EMA slope >-0.3%',
  pumpPct<8&&'prior pump <8%',dropPct<5&&'drop from peak <5%',fadePct> -0.5&&'6vs6 fade >-0.5%',
  belowCount<6&&'below EMA <6/8 closes',candle.open>=priorE&&'open >= prior EMA',
  !(atr>0)&&'invalid ATR',spike<Math.max(candle.open*0.01,atr*0.8)&&'spike too small',
  volRatio<1.5&&'volume <1.5x',overshoot< -nearLimitPct&&'too far below EMA',
  overshoot>Math.max(3,atr/e*150)&&'too far above EMA'
].filter(Boolean),belowCount,price:candle.close,ema99:e,`);
const diagnostic=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const symbol=process.argv[2]??'MARSCOINUSDT';
const now=process.argv[3]?Date.parse(process.argv[3]):Date.now();
if(!Number.isFinite(now))throw new Error('Invalid as-of date');
for(const interval of ['5m','15m']){
  const url=new URL('https://fapi.binance.com/fapi/v1/klines');
  for(const [key,v] of Object.entries({symbol,interval,limit:300,endTime:now}))url.searchParams.set(key,v);
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const fetched=await response.json();
  // Historical REST returns final OHLC even for a candle open at the cutoff.
  // Exclude that candle rather than leak its later price/volume into a replay.
  const all=process.argv[3]?fetched.filter(r=>r[6]<now):fetched; const recent=[];
  for(let end=all.length-(interval==='5m'?24:8);end<=all.length;end++){
    const rows=all.slice(Math.max(0,end-240),end),bar=rows.at(-1),time=Math.min(now,bar[6]+1);
    const e=diagnostic.detectPostPumpEma99Retest(rows,{symbol,interval,now:time}).find(e=>e.candleAt===bar[0]);
    if(e)recent.push({timeVN:new Date(e.candleAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false}),
      stage:e.stage,high:+bar[2],ema99:e.ema99,gapPct:e.gapToEmaPct,nearLimitPct:e.nearLimitPct,
      pumpPct:e.pumpPct,dropPct:e.dropPct,fadePct:e.fadePct,recentFadePct:e.recentFadePct,reboundBars:e.reboundBars,
      emaSlopePct:e.emaSlopePct,decliningShare:e.decliningShare,volumeRatio:e.volumeRatio,
      failed:e.debugFailures,productionPass:detectPostPumpEma99Retest(rows,{symbol,interval,now:time}).some(x=>x.candleAt===bar[0])});
  }
  console.log(JSON.stringify({symbol,interval,current:recent.slice(-3),nearest:recent.sort((a,b)=>a.gapPct-b.gapPct).slice(0,5)},null,2));
}
