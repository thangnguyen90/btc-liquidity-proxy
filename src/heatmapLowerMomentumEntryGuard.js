import {validLowerMomentum} from '../public/heatmap-lower-momentum-model.js';
export const LOWER_MOMENTUM_ENTRY_GUARD_VERSION='HEATMAP_LOWER_CONTINUATION_NO_ENTRY_V1_20261026';
export const LOWER_MOMENTUM_BLOCK_STATUS='LOWER_MOMENTUM_CONTINUATION_BLOCKED';
// Entry veto only; never apply to existing protection-plan recovery.
export function blocksLowerMomentumEntry(event){return validLowerMomentum(event)&&event.lowerMomentum.state==='CONTINUATION';}
