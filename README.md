# BTC Liquidity Proxy

Free liquidation heatmap proxy using Binance Futures public data.

It does not reproduce CoinGlass paid heatmap data. Instead, it estimates likely liquidation/liquidity zones from recent futures candles, common leverage levels, order book depth, open interest, funding, and long/short ratios.

## Run

```bash
npm start
```

## Web UI

```bash
npm run web
```

Open:

```text
http://127.0.0.1:19082
```

The web UI defaults to `BTCUSDT`, loads all Binance USD-M perpetual symbols into the symbol input, and renders both raw metrics plus Vietnamese explanations for strong liquidity zones above and below price.

All-symbol WebSocket signal board:

```text
http://127.0.0.1:19082/signals
```

The signal board uses Binance Futures WebSocket streams in the browser for all-symbol mark price, funding, and ticker updates. It avoids continuous REST polling and links each symbol back to the detailed dashboard.

## Binance Order Button

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set:

```text
BINANCE_API_KEY=your_key
BINANCE_API_SECRET=your_secret
BINANCE_FUTURES_BASE_URL=https://fapi.binance.com
BINANCE_ORDER_ENABLED=false
```

The order button is protected in two ways:

- `Dry run` is checked by default in the UI.
- Real orders are blocked unless `BINANCE_ORDER_ENABLED=true`.

For testnet, use:

```text
BINANCE_FUTURES_BASE_URL=https://testnet.binancefuture.com
BINANCE_ORDER_ENABLED=true
```

Useful options:

```bash
node src/index.js BTC
node src/index.js ETH
node src/index.js SOL
node src/index.js ETHUSDT --interval 15m --limit 192 --range-pct 0.04
node src/index.js --symbol BNB
```

Continuous watch mode:

```bash
node src/index.js ETH --watch --refresh-ms 15000 --slow-refresh-ms 60000 --depth-limit 100
```

Watch mode keeps Binance request usage low by refreshing price/depth more often and refreshing candles, open interest, and long/short ratio more slowly. If Binance returns `429` or `418`, it respects `Retry-After` and backs off before trying again.

## Output

The CLI prints:

- current BTC mark price
- estimated liquidation clusters above and below price
- order book bid/ask liquidity near price
- momentum, open interest, funding, long/short ratio
- a simple bias: `bullish_squeeze`, `bearish_sweep`, `uptrend`, `downtrend`, or `neutral`

## Notes

This is a trading research helper, not financial advice. Treat the signal as context and combine it with your existing risk management.
