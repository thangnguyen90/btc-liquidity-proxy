import {validUpperMomentum} from '../public/heatmap-upper-momentum-model.js';
export const UPPER_MOMENTUM_ENTRY_GUARD_VERSION='HEATMAP_UPPER_CONTINUATION_NO_ENTRY_V1_20261026';
export const UPPER_MOMENTUM_BLOCK_STATUS='UPPER_MOMENTUM_CONTINUATION_BLOCKED';
// New entries only. Never use this guard to validate/recover an existing protection plan.
export function blocksUpperMomentumEntry(event){
 return validUpperMomentum(event)&&event.upperMomentum.state==='CONTINUATION';
}
