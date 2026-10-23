export const HEATMAP_TOP_RATIO_VERSION='HEATMAP_TOP_TRADER_ACCOUNT_CHART_V1_20261022';
export const RATIO_PERIODS=Object.freeze({'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'6h':21600000,'12h':43200000,'1d':86400000});
export const RATIO_RANGES=Object.freeze({'12h':43200000,'24h':86400000,'3d':259200000,'7d':604800000,'30d':2592000000});
const autoPeriods={'12h':'5m','24h':'5m','3d':'15m','7d':'30m','30d':'2h'};
export function topRatioQuery({symbol,range='24h',period='auto'}={}){
 symbol=String(symbol??'').trim().toUpperCase();
 if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol)||!Object.hasOwn(RATIO_RANGES,range)||period!=='auto'&&!Object.hasOwn(RATIO_PERIODS,period))throw Error('INVALID_QUERY');
 const resolvedPeriod=period==='auto'?autoPeriods[range]:period,step=RATIO_PERIODS[resolvedPeriod],wanted=Math.ceil(RATIO_RANGES[range]/step)+1;
 return {symbol,range,period,resolvedPeriod,step,limit:Math.min(500,wanted),truncated:wanted>500};
}
export function normalizeTopRatioRows(raw,{symbol,step,now,from}){
 if(!Array.isArray(raw)||raw.length>500)throw Error('INVALID_RATIO_DATA');
 const number=v=>typeof v==='number'||typeof v==='string'&&v.trim()!==''?Number(v):NaN;
 const rows=raw.map(r=>({symbol:r?.symbol,timestamp:number(r?.timestamp),longShortRatio:number(r?.longShortRatio),longAccount:number(r?.longAccount),shortAccount:number(r?.shortAccount)}));
 if(rows.some((r,i)=>r.symbol!==symbol||!Number.isSafeInteger(r.timestamp)||r.timestamp<=0||r.timestamp>now+2000||!Number.isFinite(r.longShortRatio)||r.longShortRatio<0
  ||![r.longAccount,r.shortAccount].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||Math.abs(r.longAccount+r.shortAccount-1)>.001
  ||i>0&&r.timestamp<=rows[i-1].timestamp))throw Error('INVALID_RATIO_DATA');
 // No synthetic account fractions, sorting, deduplication, gap filling or future points.
 return rows.filter(r=>r.timestamp>=from&&r.timestamp<=now).map(({symbol:_,...r})=>r);
}
export function topRatioGapCount(rows,step){return rows.slice(1).filter((r,i)=>r.timestamp-rows[i].timestamp!==step).length;}
