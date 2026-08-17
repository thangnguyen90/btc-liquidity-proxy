import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyBinanceLiquidityFilter,
  assessCoinglassLiquidity,
  buildCoinglassZoneProposal,
  COINGLASS_WEB_TOP20_ISOLATION,
  COINGLASS_WEB_TOP20_MODE,
  CoinGlassWebTop20Manager,
  mergeLastGoodHeatmapRows,
  safeCoinglassSymbol,
  selectBinanceAppMoverCandidates,
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

const moverExchangeInfo = {
  symbols: ['BTC', 'AAA', 'BBB', 'CCC', 'SOL', 'PEPE'].map((baseAsset) => ({
    symbol: `${baseAsset}USDT`, baseAsset, quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL',
  })),
};
const moverRows = selectBinanceAppMoverCandidates(moverExchangeInfo, [
  { symbol: 'BTCUSDT', quoteVolume: '999000000', lastPrice: '60000', priceChangePercent: '0.2', count: 900000 },
  { symbol: 'SOLUSDT', quoteVolume: '800000000', lastPrice: '150', priceChangePercent: '-0.5', count: 800000 },
  { symbol: 'PEPEUSDT', quoteVolume: '700000000', lastPrice: '0.1', priceChangePercent: '1', count: 700000 },
  { symbol: 'AAAUSDT', quoteVolume: '100000000', lastPrice: '2', priceChangePercent: '50', count: 100000 },
  { symbol: 'BBBUSDT', quoteVolume: '80000000', lastPrice: '4', priceChangePercent: '-30', count: 80000 },
  { symbol: 'CCCUSDT', quoteVolume: '50000000', lastPrice: '3', priceChangePercent: '20', count: 50000 },
], { topPerSide: 3, maxSymbols: 6, minQuoteVolume: 2_000_000 });
assert.deepEqual(moverRows.map((row) => row.symbol), ['BTCUSDT', 'AAAUSDT', 'BBBUSDT', 'CCCUSDT', 'SOLUSDT', 'PEPEUSDT']);
assert.deepEqual(moverRows.map((row) => row.moverSide), ['REFERENCE', 'UP', 'DOWN', 'UP', 'DOWN', 'UP']);
assert.equal(moverRows.find((row) => row.symbol === 'AAAUSDT').moverRank, 1);
assert.equal(moverRows.find((row) => row.symbol === 'PEPEUSDT').moverRank, 3);

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
const preservedMoverOrder = applyBinanceLiquidityFilter([
  { symbol: 'FIRSTUSDT', quoteVolume24h: 100, tradeCount24h: 100 },
  { symbol: 'SECONDUSDT', quoteVolume24h: 1_000, tradeCount24h: 1_000 },
], {
  FIRSTUSDT: { spreadBps: 1, bidDepthUsd: 100, askDepthUsd: 100, openInterestNotional: 100 },
  SECONDUSDT: { spreadBps: 1, bidDepthUsd: 1_000, askDepthUsd: 1_000, openInterestNotional: 1_000 },
}, 2, {
  preserveOrder: true,
  quoteVolume24h: 0,
  tradeCount24h: 0,
  openInterestNotional: 0,
  bookDepthUsd: 0,
  maxSpreadBps: 15,
});
assert.deepEqual(preservedMoverOrder.rows.map((row) => row.symbol), ['FIRSTUSDT', 'SECONDUSDT']);

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

const legacyDataDir = await mkdtemp(join(tmpdir(), 'coinglass-movers-v3-'));
await writeFile(join(legacyDataDir, 'snapshot.json'), JSON.stringify({
  version: 'COINGLASS_WEB_MODEL3_LIQUID_MARKETS_V2_20260817',
  source: { ranking: 'legacy-volume' },
  rows: [
    { symbol: 'BTCUSDT', heatmap: richHeatmap, lastPrice: 100 },
    { symbol: 'SOLUSDT', heatmap: richHeatmap, lastPrice: 100 },
  ],
}), 'utf8');
const legacyView = await new CoinGlassWebTop20Manager({
  rootDir: new URL('..', import.meta.url).pathname,
  dataDir: legacyDataDir,
}).snapshot();
assert.deepEqual(legacyView.rows.map((row) => row.symbol), ['BTCUSDT']);
assert.equal(legacyView.source.viewLiquidityExcluded, 1);
await rm(legacyDataDir, { recursive: true, force: true });

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
assert.match(collectorSource, /viewLiquidityExcluded/);
const crawlSource = await readFile(new URL('./crawl-coinglass-web-top20.mjs', import.meta.url), 'utf8');
assert.match(crawlSource, /launchPersistentContext/);
assert.match(crawlSource, /assessCoinglassLiquidity/);

console.log('CoinGlass web top20 tests passed.');
