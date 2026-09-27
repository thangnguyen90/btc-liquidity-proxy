import { setTimeout as delay } from 'node:timers/promises';

export const BINANCE_INCOME_QUERY_COORDINATOR_VERSION =
  'BINANCE_INCOME_QUERY_COORDINATOR_V1_BUDGETED_SERIAL_CACHE_20260925';

export class BinanceIncomeQueryBudgetError extends Error {
  constructor({ requests, maxRequests, startTime, endTime }) {
    super(
      `Binance income query budget exhausted (${requests}/${maxRequests})`
      + ` for ${new Date(startTime).toISOString()}..${new Date(endTime).toISOString()}`,
    );
    this.name = 'BinanceIncomeQueryBudgetError';
    this.code = 'BINANCE_INCOME_QUERY_BUDGET_EXHAUSTED';
    this.requests = requests;
    this.maxRequests = maxRequests;
  }
}

export class BinanceIncomeQueryIncompleteError extends Error {
  constructor({ reason, startTime, endTime, rows }) {
    super(
      `Binance income query cannot prove range is complete (${reason}; ${rows} rows)`
      + ` for ${new Date(startTime).toISOString()}..${new Date(endTime).toISOString()}`,
    );
    this.name = 'BinanceIncomeQueryIncompleteError';
    this.code = 'BINANCE_INCOME_QUERY_INCOMPLETE';
    this.reason = reason;
    this.rows = rows;
  }
}

function finiteTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function dedupeIncomeRows(rows = []) {
  return [...new Map((Array.isArray(rows) ? rows : []).map((row) => [[
    row?.tranId ?? '',
    row?.tradeId ?? '',
    row?.symbol ?? '',
    row?.incomeType ?? '',
    row?.time ?? '',
    row?.income ?? '',
  ].join(':'), row])).values()];
}

/**
 * Process-wide coordinator for Binance income history reads.
 *
 * Income history costs 30 request-weight per page. A full page used to fan out
 * into two concurrent recursive branches, allowing a single stats refresh to
 * consume more weight than the rest of the trading process. This coordinator
 * makes that work single-flight, serial, budgeted and cacheable. When the hard
 * budget cannot produce a complete range it throws instead of returning a
 * deceptively partial PnL result.
 */
export function createBinanceIncomeQueryCoordinator({
  fetchPage,
  cacheTtlMs = 15 * 60_000,
  maxRequestsPerJob = 4,
  minRequestGapMs = 3_000,
  maxDepth = 8,
  minRangeMs = 60_000,
  pageLimit = 1000,
  failureBackoffMs = 15 * 60_000,
  canRequest = () => true,
  now = () => Date.now(),
  sleep = delay,
} = {}) {
  if (typeof fetchPage !== 'function') throw new TypeError('fetchPage is required');

  const states = new Map();

  const stateFor = (scope) => {
    const key = String(scope ?? 'default') || 'default';
    if (!states.has(key)) states.set(key, {
      cache: null,
      inflight: null,
      lastRequestAt: 0,
      retryAfter: 0,
      lastError: '',
    });
    return states.get(key);
  };

  const cacheCovers = (state, startTime, endTime) => Boolean(
    state.cache
    && now() - state.cache.at < cacheTtlMs
    && state.cache.startTime <= startTime
    && state.cache.endTime >= endTime,
  );

  const requestPage = async ({ startTime, endTime, budget, state, context }) => {
    if (budget.requests >= maxRequestsPerJob) {
      throw new BinanceIncomeQueryBudgetError({
        requests: budget.requests,
        maxRequests: maxRequestsPerJob,
        startTime: budget.rootStartTime,
        endTime: budget.rootEndTime,
      });
    }
    if (!canRequest()) {
      const error = new Error('Binance income query deferred to protect order/position REST capacity');
      error.code = 'BINANCE_INCOME_QUERY_DEFERRED';
      throw error;
    }
    const waitMs = Math.max(0, minRequestGapMs - (now() - state.lastRequestAt));
    if (waitMs > 0) await sleep(waitMs);
    if (!canRequest()) {
      const error = new Error('Binance income query deferred to protect order/position REST capacity');
      error.code = 'BINANCE_INCOME_QUERY_DEFERRED';
      throw error;
    }
    budget.requests += 1;
    state.lastRequestAt = now();
    return fetchPage({ startTime, endTime, limit: pageLimit, context });
  };

  const fetchCompleteRange = async ({ startTime, endTime, depth, budget, state, context }) => {
    const rows = await requestPage({ startTime, endTime, budget, state, context });
    if (!Array.isArray(rows) || rows.length < pageLimit) {
      return Array.isArray(rows) ? rows : [];
    }
    if (depth >= maxDepth || endTime - startTime <= minRangeMs) {
      throw new BinanceIncomeQueryIncompleteError({
        reason: depth >= maxDepth ? 'max depth reached' : 'minimum time range reached',
        startTime,
        endTime,
        rows: rows.length,
      });
    }
    const midpoint = Math.floor((startTime + endTime) / 2);
    // Deliberately serial: stats must never burst against protection traffic.
    const left = await fetchCompleteRange({
      startTime,
      endTime: midpoint,
      depth: depth + 1,
      budget,
      state,
      context,
    });
    const right = await fetchCompleteRange({
      startTime: midpoint + 1,
      endTime,
      depth: depth + 1,
      budget,
      state,
      context,
    });
    return [...left, ...right];
  };

  const query = async ({
    startTime: rawStartTime,
    endTime: rawEndTime,
    scope = 'default',
    context = null,
  } = {}) => {
    const startTime = finiteTimestamp(rawStartTime);
    const endTime = finiteTimestamp(rawEndTime);
    if (!startTime || !endTime || endTime < startTime) {
      throw new TypeError('Valid Binance income startTime/endTime are required');
    }
    const state = stateFor(scope);
    if (cacheCovers(state, startTime, endTime)) return state.cache.rows;
    if (state.retryAfter > now()) {
      const error = new Error(
        `Binance income query cooling down until ${new Date(state.retryAfter).toISOString()}`
        + `${state.lastError ? ` after ${state.lastError}` : ''}`,
      );
      error.code = 'BINANCE_INCOME_QUERY_COOLDOWN';
      error.retryAfter = state.retryAfter;
      throw error;
    }

    // Every caller shares one job. After it finishes, a caller whose range was
    // not covered may start the next serial job; concurrent fan-out is impossible.
    if (state.inflight) {
      await state.inflight;
      if (cacheCovers(state, startTime, endTime)) return state.cache.rows;
    }

    const job = (async () => {
      const budget = {
        requests: 0,
        rootStartTime: startTime,
        rootEndTime: endTime,
      };
      const rows = dedupeIncomeRows(await fetchCompleteRange({
        startTime,
        endTime,
        depth: 0,
        budget,
        state,
        context,
      }));
      state.cache = { at: now(), startTime, endTime, rows, requests: budget.requests };
      state.retryAfter = 0;
      state.lastError = '';
      return rows;
    })();
    state.inflight = job;
    try {
      return await job;
    } catch (error) {
      state.retryAfter = now() + failureBackoffMs;
      state.lastError = String(error?.code ?? error?.message ?? error).slice(0, 160);
      throw error;
    } finally {
      if (state.inflight === job) state.inflight = null;
    }
  };

  return {
    version: BINANCE_INCOME_QUERY_COORDINATOR_VERSION,
    query,
    status() {
      const scopes = [...states.entries()].map(([scope, state]) => ({
        scope,
        inflight: Boolean(state.inflight),
        cache: state.cache ? {
          at: state.cache.at,
          startTime: state.cache.startTime,
          endTime: state.cache.endTime,
          rows: state.cache.rows.length,
          requests: state.cache.requests,
        } : null,
        retryAfter: state.retryAfter > now() ? state.retryAfter : 0,
        lastError: state.retryAfter > now() ? state.lastError : '',
      }));
      return {
        version: BINANCE_INCOME_QUERY_COORDINATOR_VERSION,
        inflight: scopes.some((row) => row.inflight),
        scopes,
        cacheTtlMs,
        maxRequestsPerJob,
        minRequestGapMs,
        failureBackoffMs,
      };
    },
  };
}
