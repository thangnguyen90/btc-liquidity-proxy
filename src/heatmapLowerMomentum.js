import {readSweepMomentumSnapshot} from './heatmapUpperMomentum.js';
import {LOWER_MOMENTUM_VERSION,lowerMomentumChecks,lowerMomentumState} from '../public/heatmap-lower-momentum-model.js';
export function evaluateLowerMomentum(input={}){
 const e=input.event;if(e?.kind!=='ALL_TRACKED_LOWER_SWEPT'||e.direction!=='LOWER')return null;
 const q=readSweepMomentumSnapshot(input);return {...q,version:LOWER_MOMENTUM_VERSION,state:lowerMomentumState(q.features),checks:lowerMomentumChecks(q.features)};
}
