import { EXTREME_REBOUND_SWEEP_KIND, EXTREME_REBOUND_SWEEP_TITLE } from './extremeReboundSweepDiscord.js';

export function binanceSignalDisplayName({signalLabel, signalType} = {}) {
  if (signalLabel === EXTREME_REBOUND_SWEEP_KIND || signalType === EXTREME_REBOUND_SWEEP_KIND) {
    return EXTREME_REBOUND_SWEEP_TITLE;
  }
  return null;
}
