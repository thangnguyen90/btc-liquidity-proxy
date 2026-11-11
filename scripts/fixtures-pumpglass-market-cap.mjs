import {PUMPGLASS_MARKET_CAP_VERSION} from '../src/pumpglassMarketCap.js';
export function capFixture(symbol,now,marketCapUsd=100000000,providerId='test-coin'){
 return {version:PUMPGLASS_MARKET_CAP_VERSION,symbol,status:'OK',source:'CoinGecko',basis:'CIRCULATING_MARKET_CAP_USD',providerId,
  marketCapUsd,circulatingSupply:1000000000,providerPriceUsd:marketCapUsd/1000000000,sourceAt:now-60000,fetchedAt:now,
  identity:{exchange:'binance_futures',contractSymbol:symbol,coinId:providerId,verifiedAt:now-120000}};
}
