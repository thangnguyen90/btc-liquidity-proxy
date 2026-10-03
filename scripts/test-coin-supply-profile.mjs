import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COIN_SUPPLY_PROFILE_VERSION,
  CoinSupplyProfileService,
  buildCoinSupplySnapshot,
  classifyCoinSupply,
  coinSupplyBaseSymbol,
} from '../src/coinSupplyProfile.js';

assert.equal(coinSupplyBaseSymbol('QNTUSDT'), 'QNT');
assert.equal(coinSupplyBaseSymbol('1000PEPEUSDT'), 'PEPE');
assert.equal(classifyCoinSupply({ circulatingSupply: 14_500_000, marketCapUsd: 3_000_000_000 }).key,
  'LARGE_CAP_VERY_LOW_UNIT_SUPPLY');
assert.equal(classifyCoinSupply({ circulatingSupply: 60_000_000, marketCapUsd: 100_000_000 }).key,
  'LOW_UNIT_SUPPLY');
assert.equal(classifyCoinSupply({ circulatingSupply: 700_000_000, marketCapUsd: 100_000_000 }).highlighted,
  false);

let calls = 0;
const service = new CoinSupplyProfileService({
  now: () => Date.UTC(2026, 8, 28, 1, 2, 3),
  fetchImpl: async (url) => {
    calls += 1;
    assert.match(String(url), /symbols=qnt/);
    return {
      ok: true,
      async json() {
        return [
          {
            id: 'wrong-small-cap', symbol: 'qnt', name: 'Wrong', market_cap: 10,
            circulating_supply: 2, total_supply: 2, max_supply: 2, total_volume: 1,
          },
          {
            id: 'quant-network', symbol: 'qnt', name: 'Quant', market_cap: 3_000_000_000,
            circulating_supply: 14_500_000, total_supply: 14_600_000, max_supply: 14_600_000,
            total_volume: 300_000_000, last_updated: '2026-09-28T00:00:00Z',
          },
        ];
      },
    };
  },
});

const raw = await service.get('QNTUSDT');
const cached = await service.get('QNTUSDT');
assert.equal(calls, 1);
assert.equal(cached.providerId, 'quant-network');
assert.equal(raw.ambiguousMatches, 1);

const snapshot = buildCoinSupplySnapshot({
  profile: raw,
  markPrice: 200,
  binanceQuoteVolume24h: 725_000_000,
});
assert.equal(snapshot.version, COIN_SUPPLY_PROFILE_VERSION);
assert.equal(snapshot.available, true);
assert.equal(snapshot.marketCapUsd, 2_900_000_000);
assert.equal(snapshot.marketCapMethod, 'BINANCE_MARK_X_CIRCULATING_SUPPLY');
assert.equal(snapshot.classification.key, 'LARGE_CAP_VERY_LOW_UNIT_SUPPLY');
assert.equal(snapshot.providerTurnoverPct, 10);
assert.equal(snapshot.binanceTurnoverPct, 25);
assert.equal(snapshot.execution.binanceEnabled, false);
assert.equal(snapshot.execution.affectsEntry, false);

const unavailableService = new CoinSupplyProfileService({
  fetchImpl: async () => ({ ok: false, status: 429 }),
});
const unavailableRaw = await unavailableService.get('ORCAUSDT');
const unavailable = buildCoinSupplySnapshot({ profile: unavailableRaw, markPrice: 2 });
assert.equal(unavailable.available, false);
assert.match(unavailable.reason, /HTTP_429/);

const html = await readFile(new URL('../public/coin-level-analysis.html', import.meta.url), 'utf8');
const browser = await readFile(new URL('../public/coin-level-analysis.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/coin-level-analysis.css', import.meta.url), 'utf8');
for (const id of [
  'supply-profile', 'supply-profile-badge', 'supply-market-cap', 'supply-circulating',
  'supply-total', 'supply-max', 'supply-float-pct', 'supply-turnover',
]) assert.match(html, new RegExp(`id="${id}"`));
assert.match(browser, /function renderSupplyProfile\(profile\)/);
assert.match(browser, /renderSupplyProfile\(data\.supplyProfile\)/);
assert.match(css, /\.supply-profile\.critical/);

console.log('coin supply profile tests: OK');
