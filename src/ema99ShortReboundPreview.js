export const EMA99_REBOUND_PREVIEW_VERSION='EMA99_REJECT_REBOUND_PREVIEW_V1_20260908';
export function ema99ShortReboundPreview(e){
  if(e?.stage!=='REJECTED_SHORT_WATCH'||e.side!=='SHORT'||e.closed!==true)return null;
  const ema=Number(e.ema99),price=Number(e.price),invalid=Number(e.invalidation);
  if(![ema,price,invalid].every(v=>Number.isFinite(v)&&v>0))return null;
  const lower=ema*.995,upper=ema*1.005;
  if(!(price<lower&&upper<invalid))return null;
  return {lower,upper,reference:ema,invalidation:invalid,version:EMA99_REBOUND_PREVIEW_VERSION};
}
