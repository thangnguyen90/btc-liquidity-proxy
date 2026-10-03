import assert from 'node:assert/strict';
import {
  POST_MOVE_IMPULSE_CONFIRMATION_DISCORD_VERSION,
  selectPostMoveImpulseConfirmationWatches,
} from '../src/postMoveImpulseConfirmationDiscord.js';
import { POST_DUMP_NO_SELL_STAGE } from '../src/postDumpNoSellWatch.js';
import { POST_PUMP_NO_BUY_STAGE } from '../src/postPumpNoBuyWatch.js';

const common = { watchOnly: true, binanceEligible: false };
const longConfirmed = { ...common, symbol: 'LONGUSDT', side: 'LONG', stage: POST_DUMP_NO_SELL_STAGE.NO_SELL_CONFIRMATION };
const shortConfirmed = { ...common, symbol: 'SHORTUSDT', side: 'SHORT', stage: POST_PUMP_NO_BUY_STAGE.NO_BUY_CONFIRMATION };
const result = selectPostMoveImpulseConfirmationWatches({
  postDumpNoSellWatches: [
    longConfirmed,
    { ...common, symbol: 'EARLYLONGUSDT', side: 'LONG', stage: POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE },
    { ...longConfirmed, symbol: 'UNSAFELONGUSDT', binanceEligible: true },
  ],
  postPumpNoBuyWatches: [
    shortConfirmed,
    { ...common, symbol: 'EARLYSHORTUSDT', side: 'SHORT', stage: POST_PUMP_NO_BUY_STAGE.SELL_IMPULSE },
    { ...shortConfirmed, symbol: 'UNSAFESHORTUSDT', watchOnly: false },
  ],
});

assert.equal(result.version, POST_MOVE_IMPULSE_CONFIRMATION_DISCORD_VERSION);
assert.deepEqual(result.long, [longConfirmed]);
assert.deepEqual(result.short, [shortConfirmed]);
assert.deepEqual(selectPostMoveImpulseConfirmationWatches(), {
  version: POST_MOVE_IMPULSE_CONFIRMATION_DISCORD_VERSION,
  long: [],
  short: [],
});

console.log('post-move impulse dedicated confirmation Discord tests passed');
