import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyBinanceLiquidityFilter,
  assessCoinglassLiquidity,
  buildCoinglassZoneProposal,
  COINGLASS_WEB_TOP20_ISOLATION,
  COINGLASS_WEB_TOP20_MODE,
  mergeLastGoodHeatmapRows,
  safeCoinglassSymbol,
  selectTopBinanceUsdtPerpetuals,
  summarizeCoinglassHeatmap,
} from '../src/coinglassWebTop20.js';

const exchangeInfo = {
  symbols: [
    { symbol: 'AAAUSDT', baseAsset: 'AAA', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
    { symbol: 'BBBUSDT', baseAsset: 'BBB', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL' },
    { symbol: 'CCCUSDC', baseAsset: 'CCC', quoteAsset: 'USDC', status: 'TRADING', contractType: 'PERPETUAL' },
    { symbol: 'OLDUSDT', baseAsset: 'OLD', quoteAsset: 'USDT', status: 'BREAK', contractType: 'PERPETUAL' },
  ],
};
const ranked = selectTopBinanceUsdtPerpetuals(exchangeInfo, [
  { symbol: 'AAAUSDT', quoteVolume: '100', lastPrice: '2', priceChangePercent: '3', count: 7 },
  { symbol: 'BBBUSDT', quoteVolume: '900', lastPrice: '4', priceChangePercent: '-2', count: 8 },
  { symbol: 'CCCUSDC', quoteVolume: '9999' },
  { symbol: 'OLDUSDT', quoteVolume: '8888' },
], 2);
assert.deepEqual(ranked.map((row) => row.symbol), ['BBBUSDT', 'AAAUSDT']);
assert.deepEqual(ranked.map((row) => row.rank), [1, 2]);
assert.equal(ranked[0].quoteVolume24h, 900);

const liquidSelection = applyBinanceLiquidityFilter([
  { symbol: 'BTCUSDT', quoteVolume24h: 1, tradeCount24h: 1 },
  { symbol: 'GOODUSDT', quoteVolume24h: 100_000_000, tradeCount24h: 100_000 },
  { symbol: 'LINKUSDT', quoteVolume24h: 900_000_000, tradeCount24h: 100_000 },
], {
  BTCUSDT: {},
  GOODUSDT: { spreadBps: 2, bidDepthUsd: 200_000, askDepthUsd: 180_000, openInterestNotional: 20_000_000 },
  LINKUSDT: { spreadBps: 2, bidDepthUsd: 5_000, askDepthUsd: 4_000, openInterestNotional: 20_000_000 },
}, 3);
assert.deepEqual(liquidSelection.rows.map((row) => row.symbol), ['BTCUSDT', 'GOODUSDT']);
assert.equal(liquidSelection.rows[0].binanceLiquidity.forcedBtc, true);
assert.equal(liquidSelection.excluded.some((row) => row.symbol === 'LINKUSDT'), true);

assert.equal(safeCoinglassSymbol('btcusdt'), 'BTCUSDT');
assert.equal(safeCoinglassSymbol('../../etc/passwd'), '');
assert.equal(safeCoinglassSymbol('BTCBUSD'), '');

const summary = summarizeCoinglassHeatmap({
  instrument: { exName: 'Binance', instrumentId: 'AAAUSDT', baseAsset: 'AAA', quoteAsset: 'USDT', contractType: 'PERPETUAL' },
  updateTime: 123,
  rangeLow: 80,
  rangeHigh: 120,
  prices: [[1, '98', '102', '97', '100', '5']],
  y: [90, 95, 100, 105, 110, 115, 120],
  liq: [
    [0, 0, 10], [1, 0, 10],
    [0, 1, 5],
    [0, 3, 40], [1, 3, 60],
    [0, 4, 10],
    [0, 6, 50], [1, 6, 50],
  ],
}, { maxZones: 3, minIndexGap: 2 });
assert.equal(summary.currentPrice, 100);
assert.equal(summary.liquidationCellCount, 8);
assert.equal(summary.zones[0].strength, 100);
assert.equal(summary.zones[0].side, 'ABOVE');
assert.equal(summary.zones.some((zone) => zone.price === 90 && zone.side === 'BELOW'), true);

const richHeatmap = {
  liquidationCellCount: 300,
  zones: [
    { price: 105, side: 'ABOVE', distancePct: 5, strength: 100, persistenceBars: 10 },
    { price: 110, side: 'ABOVE', distancePct: 10, strength: 80, persistenceBars: 8 },
    { price: 95, side: 'BELOW', distancePct: -5, strength: 20, persistenceBars: 5 },
  ],
};
assert.equal(assessCoinglassLiquidity(richHeatmap, { symbol: 'GOODUSDT' }).eligible, true);
assert.equal(assessCoinglassLiquidity({ liquidationCellCount: 2, zones: [] }, { symbol: 'LINKUSDT' }).eligible, false);
assert.equal(assessCoinglassLiquidity({ liquidationCellCount: 0, zones: [] }, { symbol: 'BTCUSDT' }).eligible, true);
const longProposal = buildCoinglassZoneProposal(richHeatmap, { symbol: 'GOODUSDT', lastPrice: 100 });
assert.equal(longProposal.action, 'WAIT_LONG_CONFIRMATION');
assert.equal(longProposal.targetZone.price, 105);
const shortProposal = buildCoinglassZoneProposal({
  zones: [
    { price: 95, strength: 100, persistenceBars: 10 },
    { price: 90, strength: 80, persistenceBars: 8 },
    { price: 105, strength: 15, persistenceBars: 5 },
  ],
}, { symbol: 'GOODUSDT', lastPrice: 100 });
assert.equal(shortProposal.action, 'WAIT_SHORT_CONFIRMATION');
const balancedProposal = buildCoinglassZoneProposal({
  zones: [
    { price: 105, strength: 100, persistenceBars: 5 },
    { price: 95, strength: 100, persistenceBars: 5 },
  ],
}, { symbol: 'GOODUSDT', lastPrice: 100 });
assert.equal(balancedProposal.action, 'WAIT_BALANCED');
assert.equal(buildCoinglassZoneProposal({}, {}).action, 'NO_DATA');

const retained = mergeLastGoodHeatmapRows({
  markets: [{ symbol: 'AAAUSDT', rank: 1 }, { symbol: 'BBBUSDT', rank: 2 }],
  freshRows: [{ symbol: 'AAAUSDT', rank: 1, status: 'OK' }],
  failures: [{ symbol: 'BBBUSDT', error: 'CoinGlass 40000' }],
  previousRows: [{ symbol: 'BBBUSDT', rank: 8, status: 'SCREEN_ONLY', imageUrl: '/old.png' }],
});
assert.equal(retained.length, 2);
assert.equal(retained[0].status, 'OK');
assert.equal(retained[1].status, 'STALE_LAST_GOOD');
assert.equal(retained[1].rank, 2);
assert.equal(retained[1].imageUrl, '/old.png');
assert.equal(retained[1].lastError, 'CoinGlass 40000');

assert.equal(COINGLASS_WEB_TOP20_MODE, 'OBSERVE_ONLY');
assert.equal(Object.values(COINGLASS_WEB_TOP20_ISOLATION).every((value, index) => index === 0 ? value === true : value === false), true);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /\/api\/coinglass-web-top20/);
assert.match(serverSource, /coinGlassWebTop20\.startRefresh\('manual'\)/);
assert.match(serverSource, /coinGlassWebTop20\.startLogin\(\)/);
const collectorSource = await readFile(new URL('../src/coinglassWebTop20.js', import.meta.url), 'utf8');
assert.doesNotMatch(collectorSource, /placeFuturesOrder|LiquidFlowV2PaperManager|BinanceClient/);
const crawlSource = await readFile(new URL('./crawl-coinglass-web-top20.mjs', import.meta.url), 'utf8');
assert.match(crawlSource, /launchPersistentContext/);
assert.match(crawlSource, /assessCoinglassLiquidity/);

console.log('CoinGlass web top20 tests passed.');
