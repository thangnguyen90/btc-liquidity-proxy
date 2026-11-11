export function longQualityInputs(event,{priceDirection=-1,ratioChange=0,oiChange=0}={}){
 const STEP=300000,end=Math.floor(event.at/STEP)*STEP;
 return {event,now:event.observedAt,raw:{symbol:event.symbol,savedAt:event.observedAt,
  price:Array.from({length:240},(_,i)=>{const t=end-(240-i)*STEP,p=100+priceDirection*i*.01;return [t,p,p+1,p-1,p,100,t+STEP-1,1000,1,50,500];}),
  oi:Array.from({length:13},(_,i)=>({symbol:event.symbol,timestamp:end-(13-i)*STEP,sumOpenInterest:1000*(1+oiChange/100*i/12)}))},
 ratio:{symbol:event.symbol,source:'BINANCE_TOP_TRADER_ACCOUNT_RATIO',period:'5m',status:'OK',fetchedAt:event.observedAt,
  rows:Array.from({length:13},(_,i)=>{const v=2*(1+ratioChange/100*i/12);return {timestamp:end-(13-i)*STEP,longShortRatio:v,longAccount:v/(1+v),shortAccount:1/(1+v)};})},
 btcRows:Array.from({length:13},(_,i)=>{const t=end-(13-i)*STEP,p=60000+i;return [t,p,p+1,p-1,p,1,t+STEP-1,100,1,1,50];})};
}
