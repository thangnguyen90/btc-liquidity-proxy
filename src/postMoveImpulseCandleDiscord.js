import { POST_DUMP_NO_SELL_STAGE } from './postDumpNoSellWatch.js';
import { POST_PUMP_NO_BUY_STAGE } from './postPumpNoBuyWatch.js';

export const POST_MOVE_IMPULSE_CANDLE_DISCORD_VERSION =
  'POST_MOVE_IMPULSE_CANDLE_DISCORD_V1_DEDICATED_20260927';

function eligible(watch, side, stage) {
  return watch?.side === side
    && watch?.stage === stage
    && watch?.watchOnly === true
    && watch?.binanceEligible === false;
}

export function selectPostMoveImpulseCandleWatches({
  postDumpNoSellWatches = [],
  postPumpNoBuyWatches = [],
} = {}) {
  return {
    version: POST_MOVE_IMPULSE_CANDLE_DISCORD_VERSION,
    long: Array.isArray(postDumpNoSellWatches)
      ? postDumpNoSellWatches.filter((watch) => eligible(
        watch,
        'LONG',
        POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE,
      ))
      : [],
    short: Array.isArray(postPumpNoBuyWatches)
      ? postPumpNoBuyWatches.filter((watch) => eligible(
        watch,
        'SHORT',
        POST_PUMP_NO_BUY_STAGE.SELL_IMPULSE,
      ))
      : [],
  };
}
