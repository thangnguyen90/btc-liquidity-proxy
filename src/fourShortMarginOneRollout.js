// Explicit one-time configuration operation, NOT a recurring migration/gate.
// Keeping exact identities prevents changing unrelated SHORT or LONG strategies.
export const FOUR_SHORT_MARGIN_ONE_VERSION='FOUR_ACTIVE_SHORT_MARGIN5_TO1_V1_20261020';
export const FOUR_SHORT_MARGIN_ONE_TARGETS=Object.freeze([
 {source:'ema99-near-reject-short',stream:'ema99-retest',label:'REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH',side:'SHORT',interval:'15m'},
 {source:'coin-horizon-sweep-transition',stream:'coin-horizon-4h8h12h',label:'LOWER',side:'SHORT'},
 {source:'liqscan-high-score',stream:'coin-level-analysis',label:'LIQSCAN_HIGH_SCORE_BELOW_SHORT',side:'SHORT'},
 {source:'post-move-impulse',stream:'post-pump-no-buy-5m',label:'POST_PUMP_NO_BUY_SELL_IMPULSE_SHORT',side:'SHORT'},
].map(Object.freeze));
export function fourShortMarginOneKeys(state){
 return FOUR_SHORT_MARGIN_ONE_TARGETS.map(target=>{
  const matches=Object.entries(state?.routes??{}).filter(([,r])=>Object.entries(target).every(([k,v])=>r[k]===v));
  if(matches.length!==1)throw Error(`SHORT_MARGIN_TARGET_MISSING_OR_AMBIGUOUS: ${target.label}`);
  return matches[0][0];
 });
}
export function applyFourShortMarginOne(state){
 const next=structuredClone(state),keys=fourShortMarginOneKeys(next);
 for(const key of keys){const r=next.routes[key];if(![1,5].includes(r.marginUsdt))throw Error(`SHORT_MARGIN_CHANGED: ${r.label}`);r.marginUsdt=1;}
 next.shortMarginOneRolloutVersion=FOUR_SHORT_MARGIN_ONE_VERSION;
 return next;
}
