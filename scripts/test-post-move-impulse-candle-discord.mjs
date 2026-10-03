import assert from 'node:assert/strict';
import {
  POST_MOVE_IMPULSE_CANDLE_DISCORD_VERSION,
  selectPostMoveImpulseCandleWatches,
} from '../src/postMoveImpulseCandleDiscord.js';
import { POST_DUMP_NO_SELL_STAGE } from '../src/postDumpNoSellWatch.js';
import { POST_PUMP_NO_BUY_STAGE } from '../src/postPumpNoBuyWatch.js';

const common = { watchOnly: true, binanceEligible: false };
const longImpulse = {
  ...common,
  symbol: 'LONGUSDT',
  side: 'LONG',
  stage: POST_DUMP_NO_SELL_STAGE.BUY_IMPULSE,
};
const shortImpulse = {
  ...common,
  symbol: 'SHORTUSDT',
  side: 'SHORT',
  stage: POST_PUMP_NO_BUY_STAGE.SELL_IMPULSE,
};
const longInput = [
  longImpulse,
  { ...common, symbol: 'CONFIRMEDLONGUSDT', side: 'LONG', stage: POST_DUMP_NO_SELL_STAGE.NO_SELL_CONFIRMATION },
  { ...common, symbol: 'LATELONGUSDT', side: 'LONG', stage: POST_DUMP_NO_SELL_STAGE.LATE_NO_CHASE },
  { ...longImpulse, symbol: 'UNSAFELONGUSDT', binanceEligible: true },
];
const shortInput = [
  shortImpulse,
  { ...common, symbol: 'CONFIRMEDSHORTUSDT', side: 'SHORT', stage: POST_PUMP_NO_BUY_STAGE.NO_BUY_CONFIRMATION },
  { ...common, symbol: 'LATESHORTUSDT', side: 'SHORT', stage: POST_PUMP_NO_BUY_STAGE.LATE_NO_CHASE },
  { ...shortImpulse, symbol: 'UNSAFESHORTUSDT', watchOnly: false },
];

const result = selectPostMoveImpulseCandleWatches({
  postDumpNoSellWatches: longInput,
  postPumpNoBuyWatches: shortInput,
});

assert.equal(result.version, POST_MOVE_IMPULSE_CANDLE_DISCORD_VERSION);
assert.deepEqual(result.long, [longImpulse]);
assert.deepEqual(result.short, [shortImpulse]);
assert.deepEqual(longInput.map((watch) => watch.symbol), [
  'LONGUSDT',
  'CONFIRMEDLONGUSDT',
  'LATELONGUSDT',
  'UNSAFELONGUSDT',
]);
assert.deepEqual(shortInput.map((watch) => watch.symbol), [
  'SHORTUSDT',
  'CONFIRMEDSHORTUSDT',
  'LATESHORTUSDT',
  'UNSAFESHORTUSDT',
]);
assert.deepEqual(selectPostMoveImpulseCandleWatches(), {
  version: POST_MOVE_IMPULSE_CANDLE_DISCORD_VERSION,
  long: [],
  short: [],
});

console.log('post-move impulse candle Discord selector tests passed');
