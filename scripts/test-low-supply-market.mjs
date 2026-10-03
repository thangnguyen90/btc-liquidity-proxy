import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
  COIN_SUPPLY_MARKET_DEFAULT_FILTER,
  COIN_SUPPLY_MARKET_VERSION,
  CoinSupplyMarketService,
} from '../src/coinSupplyMarket.js';
import {
  LOW_SUPPLY_MARKET_UI_VERSION,
  describeLowSupplySort,
  filterLowSupplyRows,
  sortLowSupplyRows,
} from '../public/low-supply-market-model.js';

const symbols = Array.from({ length: 53 }, (_, index) => ({
  symbol: `T${index}USDT`,
  baseAsset: `T${index}`,
}));
let calls = 0;
const service = new CoinSupplyMarketService({
  file: null,
  now: () => Date.UTC(2026, 8, 28, 2, 0, 0),
  concurrency: 2,
  fetchImpl: async (url) => {
    calls += 1;
    const requestUrl = new URL(url);
    if (requestUrl.pathname.endsWith('/coins/list')) {
      return {
        ok: true,
        async json() {
          return symbols.map((item, index) => ({ id: `token-${index}`, symbol: item.baseAsset.toLowerCase(), name: `Token ${index}` }));
        },
      };
    }
    const ids = requestUrl.searchParams.get('ids');
    const requested = ids ? ids.split(',') : ['token-0'];
    assert.ok(requested.length <= 220);
    return {
      ok: true,
      async json() {
        return requested.flatMap((id) => {
          const index = Number(id.replace('token-', ''));
          const symbol = `t${index}`;
          const marketCap = index === 0 ? 5_000_000_000 : index === 1 ? 3_000_000_000 : 100_000_000;
          const supply = index === 2 ? 20_000_000 : 10_000_000 + index;
          const main = {
            id: `token-${index}`,
            symbol,
            name: `Token ${index}`,
            market_cap: marketCap,
            market_cap_rank: index + 1,
            current_price: 1,
            price_change_percentage_24h: index,
            total_volume: marketCap / 10,
            circulating_supply: supply,
            total_supply: supply + 1_000,
            max_supply: supply + 2_000,
            last_updated: '2026-09-28T02:00:00Z',
          };
          return index === 0
            ? [{ ...main, id: 'wrong-small-cap', market_cap: 10 }, main]
            : [main];
        });
      },
    };
  },
});

const snapshot = await service.getSnapshot(symbols);
assert.equal(snapshot.version, COIN_SUPPLY_MARKET_VERSION);
assert.equal(calls, 3);
assert.equal(snapshot.universe.binanceUsdtPerpetualCount, 53);
assert.equal(snapshot.universe.providerCoverageCount, 53);
assert.equal(snapshot.defaultMatchCount, 1);
assert.deepEqual(snapshot.defaultMatchSymbols, ['T0USDT']);
assert.equal(snapshot.rows[0].symbol, 'T0USDT');
assert.equal(snapshot.rows[0].providerId, 'token-0');
assert.equal(snapshot.execution.binanceEnabled, false);
await service.getSnapshot(symbols);
assert.equal(calls, 3, 'fresh cache must avoid a second provider scan');

const filtered = filterLowSupplyRows(snapshot.rows, {
  minimumMarketCapUsd: COIN_SUPPLY_MARKET_DEFAULT_FILTER.minimumMarketCapUsd,
  maximumCirculatingSupply: COIN_SUPPLY_MARKET_DEFAULT_FILTER.maximumCirculatingSupply,
});
assert.equal(filtered.length, 1);
assert.equal(sortLowSupplyRows(snapshot.rows, 'market-cap-desc')[0].symbol, 'T0USDT');
assert.equal(sortLowSupplyRows(snapshot.rows, 'circulating-asc')[0].symbol, 'T0USDT');
const sortFixture = [
  { symbol: 'BBB', marketCapUsd: 20, circulatingSupply: 5, totalSupply: 8, maxSupply: null, volume24hUsd: 2, change24hPct: null, sourceUpdatedAt: null, classification: { severity: 'warning' } },
  { symbol: 'AAA', marketCapUsd: 10, circulatingSupply: 2, totalSupply: 9, maxSupply: 10, volume24hUsd: 4, change24hPct: 3, sourceUpdatedAt: '2026-09-28T01:00:00Z', classification: { severity: 'critical' } },
];
assert.deepEqual(sortLowSupplyRows(sortFixture, 'symbol-asc').map((row) => row.symbol), ['AAA','BBB']);
assert.deepEqual(sortLowSupplyRows(sortFixture, 'circulating-desc').map((row) => row.symbol), ['BBB','AAA']);
assert.deepEqual(sortLowSupplyRows(sortFixture, 'severity-asc').map((row) => row.symbol), ['AAA','BBB']);
assert.deepEqual(sortLowSupplyRows(sortFixture, 'change-desc').map((row) => row.symbol), ['AAA','BBB'], 'missing numeric values stay last');
assert.deepEqual(sortLowSupplyRows(sortFixture, 'updated-desc').map((row) => row.symbol), ['AAA','BBB'], 'missing dates stay last');
assert.equal(describeLowSupplySort('volume-desc'), 'volume 24h giảm dần');
assert.equal(LOW_SUPPLY_MARKET_UI_VERSION, 'LOW_SUPPLY_MARKET_UI_V2_COLUMN_SORT_20260928');

const html = await readFile(new URL('../public/low-supply-market.html', import.meta.url), 'utf8');
const browser = await readFile(new URL('../public/low-supply-market.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
for (const id of ['minimum-cap','maximum-supply','sort-key','match-count','coverage-count','rows']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.match(browser, /sortLowSupplyRows\(filterLowSupplyRows/);
assert.match(browser, /th\[data-sort-column\] button/);
assert.match(html, /data-sort-column="circulating"/);
assert.match(html, /aria-sort="ascending"/);
assert.match(server, /requestUrl\.pathname === '\/api\/low-supply-market'/);
assert.match(server, /pathname === '\/low-supply-market'/);

const publicDirectory = new URL('../public/', import.meta.url);
const htmlFiles = (await readdir(publicDirectory)).filter((name) => name.endsWith('.html'));
const missingLowSupplyMenu = [];
for (const name of htmlFiles) {
  const page = await readFile(new URL(name, publicDirectory), 'utf8');
  if (page.includes('href="/liquid-flow-v2"') && !page.includes('href="/low-supply-market"')) {
    missingLowSupplyMenu.push(name);
  }
}
assert.deepEqual(missingLowSupplyMenu, [], 'mọi menu có Liquid Flow V2 phải có link Cung thấp');

console.log('low supply market tests: OK');
