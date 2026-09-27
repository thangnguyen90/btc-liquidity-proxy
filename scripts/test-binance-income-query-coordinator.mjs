import assert from 'node:assert/strict';
import {
  BINANCE_INCOME_QUERY_COORDINATOR_VERSION,
  BinanceIncomeQueryBudgetError,
  BinanceIncomeQueryIncompleteError,
  createBinanceIncomeQueryCoordinator,
} from '../src/binanceIncomeQueryCoordinator.js';

assert.match(BINANCE_INCOME_QUERY_COORDINATOR_VERSION, /BUDGETED_SERIAL_CACHE/);

{
  let calls = 0;
  const coordinator = createBinanceIncomeQueryCoordinator({
    fetchPage: async () => {
      calls += 1;
      return [{ tranId: 1, time: 100, income: '1' }];
    },
    minRequestGapMs: 0,
  });
  const input = { startTime: 100, endTime: 200, scope: 'account-a' };
  assert.equal((await coordinator.query(input)).length, 1);
  assert.equal((await coordinator.query(input)).length, 1);
  assert.equal(calls, 1, 'fresh covering cache must suppress duplicate income reads');
}

{
  let active = 0;
  let maxActive = 0;
  const calls = [];
  const coordinator = createBinanceIncomeQueryCoordinator({
    fetchPage: async ({ startTime, endTime }) => {
      calls.push([startTime, endTime]);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (startTime === 1 && endTime === 101) {
        return Array.from({ length: 1000 }, (_, index) => ({ tranId: `root-${index}` }));
      }
      return [{ tranId: `${startTime}-${endTime}` }];
    },
    minRequestGapMs: 0,
    maxRequestsPerJob: 4,
    minRangeMs: 1,
  });
  const rows = await coordinator.query({ startTime: 1, endTime: 101, scope: 'account-b' });
  assert.equal(calls.length, 3, 'one full page should split into two serial child ranges');
  assert.equal(maxActive, 1, 'recursive income reads must never fan out concurrently');
  assert.equal(rows.length, 2);
}

{
  let calls = 0;
  const coordinator = createBinanceIncomeQueryCoordinator({
    fetchPage: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 3));
      return [{ tranId: 7 }];
    },
    minRequestGapMs: 0,
  });
  const query = { startTime: 10, endTime: 20, scope: 'account-c' };
  const [a, b] = await Promise.all([coordinator.query(query), coordinator.query(query)]);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(calls, 1, 'concurrent callers for the same account/range must share one job');
}

{
  let calls = 0;
  const coordinator = createBinanceIncomeQueryCoordinator({
    fetchPage: async () => {
      calls += 1;
      return Array.from({ length: 1000 }, (_, index) => ({ tranId: `${calls}-${index}` }));
    },
    minRequestGapMs: 0,
    maxRequestsPerJob: 2,
    failureBackoffMs: 60_000,
    minRangeMs: 1,
  });
  const query = { startTime: 1, endTime: 1_000_000, scope: 'account-d' };
  await assert.rejects(() => coordinator.query(query), BinanceIncomeQueryBudgetError);
  assert.equal(calls, 2, 'hard budget must stop recursive income reads');
  await assert.rejects(
    () => coordinator.query(query),
    (error) => error?.code === 'BINANCE_INCOME_QUERY_COOLDOWN',
  );
  assert.equal(calls, 2, 'failure cooldown must prevent immediate retry storms');
}

{
  let calls = 0;
  const coordinator = createBinanceIncomeQueryCoordinator({
    fetchPage: async () => {
      calls += 1;
      return Array.from({ length: 1000 }, (_, index) => ({ tranId: index }));
    },
    minRequestGapMs: 0,
    minRangeMs: 100,
  });
  await assert.rejects(
    () => coordinator.query({ startTime: 1, endTime: 10, scope: 'account-incomplete' }),
    BinanceIncomeQueryIncompleteError,
  );
  assert.equal(calls, 1, 'a full terminal page must fail closed instead of caching partial income');
}

console.log('binance income query coordinator tests passed');
