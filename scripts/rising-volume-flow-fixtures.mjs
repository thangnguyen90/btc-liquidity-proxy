import {RISING_VOLUME_FRAMES} from '../public/rising-volume-model.js';
export const flowTestNow=Date.UTC(2026,9,8,6,0,5);
export const FLOW_VOLUMES=Object.freeze({
  // ON-like SHAPE fixture, not a claim about the real coin/history.
  SUSTAINED:[150,180,210,190,230,210,250,230,270,260],
  // ARC-like peak -> tiny volume -> recovery. Larger-frame MA5 can still rise.
  BURSTY:[1200,15,30,60,70,400,350,320,280,450],
  OTHER:[100,100,100,100,100,150,180,210,240,280],
});
export function flowRows({interval='1m',side='LONG',pattern='SUSTAINED',recent=null,now=flowTestNow,baseline=100}={}) {
  const duration=RISING_VOLUME_FRAMES[interval],end=Math.floor(now/duration)*duration;
  const volumes=recent??FLOW_VOLUMES[pattern];let close=100;
  return Array.from({length:30},(_,i)=>{
    const open=close;if(i>=25)close*=side==='LONG'?1.004:.996;
    const volume=i<20?baseline:volumes[i-20];
    return {openTime:end-(30-i)*duration,closeTime:end-(29-i)*duration-1,isClosed:true,
      open,close,high:Math.max(open,close)*1.001,low:Math.min(open,close)*.999,
      volume,quoteVolume:volume*close,takerBuyQuoteVolume:volume*close*(side==='LONG'?.7:.3)};
  });
}
