export const MIN=60000,start=Date.UTC(2026,9,9,0);
export const bar=(i,p=100)=>({openTime:start+i*MIN,closeTime:start+(i+1)*MIN-1,
  open:p,high:p+.1,low:p-.1,close:p,quoteVolume:100,takerBuyQuoteVolume:50});
export function pumpWickRows({immediate=false}={}) {
  const rows=Array.from({length:20},(_,i)=>bar(i));
  for(let i=0;i<10;i++)rows.push({...bar(i+20),open:100+i*.25,close:100+(i+1)*.25,
    high:100+(i+1)*.25+.08,low:100+i*.25-.08,quoteVolume:i<5?180:300,
    takerBuyQuoteVolume:(i<5?180:300)*.65});
  rows.push({...bar(30),open:102.5,high:102.6,low:100,close:immediate?102.3:100.2,
    quoteVolume:600,takerBuyQuoteVolume:180});
  return rows;
}
export const recovery={...bar(31),open:100.2,high:102.1,low:100.1,close:102,
  quoteVolume:300,takerBuyQuoteVolume:210};
