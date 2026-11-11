import { PROFILE_RATIO } from '../src/heatmapEntryScenarios.js';
export function preContext(e,now) {
  const step=300000,asOf=e.candleAt-1;
  const bins=[100,104].map(price=>[Math.round(Math.log(price)/Math.log(PROFILE_RATIO)),1]);
  const profiles=Array.from({length:3},(_,i)=>({at:asOf-(2-i)*step,mark:true,oiFresh:true,bins}));
  const models=[1,3].map(model=>({model,status:'OK',data:{source:'BINANCE_LOCAL',symbol:e.symbol,range:'24h',step,end:e.candleAt,profiles}}));
  const latest=Math.floor(e.at/step)*step;
  const rows=Array.from({length:8},(_,i)=>{const r=i===7?1.78:2;return {timestamp:latest-(7-i)*step,longShortRatio:r,longAccount:r/(1+r),shortAccount:1/(1+r)};});
  return structuredClone({bundle:{models},ratio:{source:'BINANCE_TOP_TRADER_ACCOUNT_RATIO',symbol:e.symbol,period:'5m',status:'OK',fetchedAt:now,rows}});
}
