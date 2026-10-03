import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  analyzeToxicTwoSideCoin,
  buildToxicTwoSideMarketSnapshot,
  selectToxicTwoSideSupplyFallbackMarkets,
} from '../src/toxicTwoSideMarket.js';
import {
  filterToxicTwoSideRows,
  sortToxicTwoSideRows,
  toxicTwoSideCardKey,
  toxicTwoSideTradeKey,
} from '../public/toxic-two-side-model.js';
import { isBinanceCardAvgRoeEligible } from '../public/binance-card-visibility.js';
import { injectToxicTwoSideNavigation } from '../src/toxicTwoSideNavigation.js';

const now = Date.parse('2026-10-01T04:00:00Z');
function candles({ intervalMs, count, start, step, sweep = false }) {
  return Array.from({ length: count }, (_, index) => {
    const close = start + step * index;
    const prior = start + step * Math.max(0, index - 1);
    const wiggle = Math.abs(step) * 2 + Math.max(close * 0.002, 0.00001);
    const high = Math.max(prior, close) + wiggle * (sweep && index % 7 === 0 ? 4 : 1);
    const low = Math.min(prior, close) - wiggle * (sweep && index % 9 === 0 ? 4 : 1);
    return {
      openTime: now - (count - index) * intervalMs,
      open: prior,
      high,
      low: Math.max(0.000001, low),
      close,
      closeTime: now - (count - index - 1) * intervalMs - 1,
      quoteVolume: 1_000_000,
    };
  });
}

const toxic = analyzeToxicTwoSideCoin({
  market: {
    symbol: '龙虾USDT', markPrice: 0.039, change24hPct: -38.18,
    range24hPct: 110.99, quoteVolume: 165_000_000, fundingRate: 0.000338,
  },
  supply: { marketCapUsd: 39_000_000 },
  klines: {
    '5m': candles({ intervalMs:300_000, count:110, start:0.02, step:0.00018, sweep:true }),
    '15m': candles({ intervalMs:900_000, count:110, start:0.02, step:0.00018 }),
    '1h': candles({ intervalMs:3_600_000, count:110, start:0.15, step:-0.001 }),
    '4h': candles({ intervalMs:14_400_000, count:110, start:0.3, step:-0.002 }),
  },
  now,
});
assert.equal(toxic.symbol, '龙虾USDT');
assert.equal(toxic.tier, 'EXTREME');
assert(toxic.score >= 80);
assert.equal(toxic.trendConflict, true);
assert.equal(toxic.fundingDivergence, true);
assert(toxic.binanceTurnoverPct > 400);
assert.equal(toxic.observation.watchOnly, true);
assert.equal(toxic.observation.binanceEligible, false);
assert.equal(toxic.whitelistKey, 'toxic-two-side:EXTREME');

const normal = analyzeToxicTwoSideCoin({
  market: {
    symbol:'CALMUSDT', markPrice:1, change24hPct:1, range24hPct:4,
    quoteVolume:5_000_000, fundingRate:0.0001,
  },
  supply:{marketCapUsd:500_000_000},
  klines:Object.fromEntries([
    ['5m',300_000],['15m',900_000],['1h',3_600_000],['4h',14_400_000],
  ].map(([interval,intervalMs]) => [interval,candles({intervalMs,count:110,start:1,step:0.0001})])),
  now,
});
assert.equal(normal.tier, 'NORMAL');
assert(normal.score < 45);

const snapshot = buildToxicTwoSideMarketSnapshot({
  marketRows:[
    {symbol:'龙虾USDT',markPrice:0.039,change24hPct:-38.18,range24hPct:110.99,quoteVolume:165_000_000,fundingRate:0.000338},
    {symbol:'CALMUSDT',markPrice:1,change24hPct:1,range24hPct:4,quoteVolume:5_000_000,fundingRate:0.0001},
  ],
  supplyRows:[{symbol:'龙虾USDT',marketCapUsd:39_000_000},{symbol:'CALMUSDT',marketCapUsd:500_000_000}],
  getKlines:(symbol,interval) => symbol === '龙虾USDT'
    ? ({'5m':toxic,'15m':toxic,'1h':toxic,'4h':toxic}[interval]?.unused ?? [])
    : [],
  now,
});
assert.equal(snapshot.observeOnly, true);
assert.equal(snapshot.execution.binanceEnabled, false);
assert.equal(snapshot.rows.length, 2);
assert.equal(filterToxicTwoSideRows([toxic,normal], {minimumScore:45}).length, 1);
assert.equal(sortToxicTwoSideRows([normal,toxic])[0].symbol, '龙虾USDT');
assert.equal(toxicTwoSideCardKey('EXTREME'), 'toxic-two-side:EXTREME');
assert.equal(toxicTwoSideTradeKey({toxicTwoSideObservation:toxic.observation}), 'toxic-two-side:EXTREME');
assert.equal(toxicTwoSideTradeKey({toxicTwoSideObservation:{...toxic.observation,version:'OLD'}}), null);
assert.deepEqual(selectToxicTwoSideSupplyFallbackMarkets({
  marketRows: [
    { symbol:'龙虾USDT', range24hPct:110, quoteVolume:165_000_000 },
    { symbol:'COVEREDUSDT', range24hPct:90, quoteVolume:200_000_000 },
    { symbol:'CALMUSDT', range24hPct:10, change24hPct:2 },
  ],
  supplyRows: [{ symbol:'COVEREDUSDT', marketCapUsd:50_000_000 }],
}), [{ symbol:'龙虾USDT', range24hPct:110, quoteVolume:165_000_000 }]);
assert.equal(isBinanceCardAvgRoeEligible(4), false);
assert.equal(isBinanceCardAvgRoeEligible(4.01), true);

const semanticMenu = injectToxicTwoSideNavigation('<nav><a href="/">Home</a></nav>');
assert.match(semanticMenu, /href="\/toxic-two-side-market"/);
assert.equal(injectToxicTwoSideNavigation(semanticMenu), semanticMenu);
const legacyMenu = injectToxicTwoSideNavigation('<div><a class="nav-link" href="/coin-level-analysis">Coin</a></div>');
assert.match(legacyMenu, /href="\/toxic-two-side-market"/);
assert.equal(injectToxicTwoSideNavigation('<main>no menu</main>'), '<main>no menu</main>');

const pageHtml = await readFile(new URL('../public/toxic-two-side-market.html', import.meta.url), 'utf8');
for (const tier of ['EXTREME','HIGH','WATCH','NORMAL']) {
  assert.match(pageHtml, new RegExp(`data-live-card-key="toxic-two-side:${tier}"`));
}

console.log('toxic two-side market tests passed');
