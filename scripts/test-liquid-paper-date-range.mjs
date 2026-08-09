import assert from 'node:assert/strict';
import {
  liquidPaperDayInRange,
  liquidPaperDayKey,
  liquidPaperTradeDayKey,
  normalizeLiquidPaperDateRange,
} from '../src/liquidPaperDateRange.js';

assert.equal(
  liquidPaperDayKey('2026-07-27T16:59:59.000Z'),
  '2026-07-27',
  'Bangkok day must stay on 27 before 17:00 UTC',
);
assert.equal(
  liquidPaperDayKey('2026-07-27T17:00:00.000Z'),
  '2026-07-28',
  'Bangkok day must roll over at 17:00 UTC',
);
assert.equal(
  liquidPaperTradeDayKey({ createdAt: '2026-07-27T18:30:00.000Z' }),
  '2026-07-28',
  'trade day must use createdAt in Bangkok timezone',
);

assert.deepEqual(
  normalizeLiquidPaperDateRange({ fromDay: '2026-07-25', toDay: '2026-07-28' }),
  { fromDay: '2026-07-25', toDay: '2026-07-28', mode: 'range' },
);
assert.deepEqual(
  normalizeLiquidPaperDateRange({ fromDay: '2026-07-28', toDay: '2026-07-25' }),
  { fromDay: '2026-07-25', toDay: '2026-07-28', mode: 'range' },
  'reverse date input must be normalized',
);
assert.deepEqual(
  normalizeLiquidPaperDateRange({ day: '2026-07-27', fromDay: '2026-07-20', toDay: '2026-07-28' }),
  { fromDay: '2026-07-27', toDay: '2026-07-27', mode: 'day' },
  'legacy day query must remain compatible',
);
assert.equal(liquidPaperDayInRange('2026-07-25', { fromDay: '2026-07-25', toDay: '2026-07-28' }), true);
assert.equal(liquidPaperDayInRange('2026-07-28', { fromDay: '2026-07-25', toDay: '2026-07-28' }), true);
assert.equal(liquidPaperDayInRange('2026-07-29', { fromDay: '2026-07-25', toDay: '2026-07-28' }), false);

console.log('Liquid paper date-range tests passed.');
