import {buildRisingVolumeRatioProof} from '../src/risingVolumeRatioGate.js';
export function ratioRowsFor(event) {
  const latest=Math.floor(event.snapshot.closedAt/300000)*300000;
  return Array.from({length:20},(_,i)=>({timestamp:latest-(19-i)*300000,
    longShortRatio:i<17?2:event.snapshot.side==='LONG'?[1.92,1.85,1.7][i-17]:[2.08,2.15,2.3][i-17]}));
}
export const ratioProofFor=(event,now)=>buildRisingVolumeRatioProof(event,ratioRowsFor(event),now);
