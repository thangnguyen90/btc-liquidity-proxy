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

## Auto Trader

The backend can auto-place setup orders when the all-market scanner score reaches the threshold. It is disabled and dry-run by default.

```text
AUTO_TRADE_ENABLED=false
AUTO_TRADE_DRY_RUN=true
AUTO_TRADE_THRESHOLD=0.7
AUTO_TRADE_MARGIN_USDT=2
AUTO_TRADE_LEVERAGE=10
AUTO_TRADE_INTERVAL_MS=15000
AUTO_TRADE_COOLDOWN_MS=900000
AUTO_TRADE_MAX_ORDERS_PER_SCAN=1
```

With the default margin/leverage, order notional is:

```text
2 USDT margin * 10x = 20 USDT notional
```

To allow real orders, all of these must be true:

```text
AUTO_TRADE_ENABLED=true
AUTO_TRADE_DRY_RUN=false
BINANCE_ORDER_ENABLED=true
```

Status endpoint:

```text
http://127.0.0.1:19082/api/auto-trade/status
```

## Restart BE/FE

This project serves both backend API and frontend pages from the same Node server. Restarting `npm run web` restarts both BE and FE.

Stop the current server:

```bash
pkill -f "node src/server.js"
```

Start it again:

```bash
cd /Users/thang/Documents/RESOURCE/btc-liquidity-proxy
npm run web
```

One-line restart:

```bash
cd /Users/thang/Documents/RESOURCE/btc-liquidity-proxy && (pkill -f "node src/server.js" || true) && npm run web
```

After restart, open:

```text
http://127.0.0.1:19082
http://127.0.0.1:19082/signals
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
