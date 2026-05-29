# BTC Trend Analysis - 2026-05-29

Generated from the current repo logic:

- `fetchAnalysis({ symbol: "BTCUSDT", interval: "15m" })`
- `fetchAnalysis({ symbol: "BTCUSDT", interval: "1h" })`
- `fetchAnalysis({ symbol: "BTCUSDT", interval: "4h" })`

Snapshot time: `2026-05-29 09:42 Asia/Ho_Chi_Minh`

## Quick Verdict

BTC is bearish / caution today. The code does not give a clean market entry on `15m` or `4h`, but the `1h` setup leans short with low confidence.

Best read:

- Main bias: `SHORT / WAIT`, not clean long.
- Main magnet: lower liquidity around `72886 - 72740`, then `72520 - 72006`.
- Short trigger area: clean loss of `73252` with sell-flow confirmation.
- Long only improves after reclaiming `73619 - 73986`; stronger reversal confirmation is above the `1h` EMA zone near `75058 - 75186`.

## Current Price

```text
BTCUSDT mark price: ~73326
```

## 15m View

```text
Momentum 24h: -1.217%
Momentum 48h: -3.326%
Trend aligned: true
Taker buy ratio: 50.49%
Funding: +0.0100%
Long/Short ratio: 1.7375
Signal label: neutral
Signal score: -0.1118
Code setup: WAIT / low confidence
Quick scan: WAIT
```

EMA:

```text
Price vs EMA99 15m: -0.521%
Price vs EMA99 1h: -2.474%
Price vs EMA99 4h: -5.152%
```

Liquidity:

```text
Liquidity above: 67.13B
Liquidity below: 83.17B
Bias: -0.1067
Sweep target: below @ 72739.54 (-0.8%)
```

Important zones:

```text
Above: 73986.09, 73692.78, 74279.39, 73912.76, 74426.04
Below: 72739.54, 72666.21, 72592.89, 72446.24, 72812.87
```

Interpretation:

15m is not bullish. Price is below EMA99 and liquidity below is thicker. There is a large bid wall around `73300`, so shorting directly into that wall is not ideal. Better wait for breakdown below `73252` or a failed reclaim near `73692 - 73986`.

## 1h View

```text
Momentum 24h: -1.250%
Momentum 48h: -3.326%
Trend aligned: true
Taker buy ratio: 48.47%
Funding: +0.0100%
Long/Short ratio: 1.7465
Signal label: neutral
Signal score: -0.1791
Code setup: SHORT / low confidence
Quick scan: WAIT
```

EMA:

```text
Price vs EMA99 1h: -2.307%
Price vs higher 1h EMA ref: -2.474%
Price vs EMA99 4h: -5.152%
```

Liquidity:

```text
Liquidity above: 137.40B
Liquidity below: 227.88B
Bias: -0.2477
Sweep target: below @ 72812.87 (-0.7%)
```

Code trade setup:

```text
Direction: SHORT
Entry zone: 73255.99 - 73536.64
Trigger: 73252.82
Invalidation / SL: 73923.50
Targets: 72812.87, 72079.61, 72666.21
```

Important zones:

```text
Above: 73986.09, 73692.78, 74426.04, 73912.76, 75892.56
Below: 72812.87, 72079.61, 72666.21, 72739.54, 72886.19
```

Interpretation:

1h is the cleanest bearish argument. Momentum is negative, taker buy ratio is below 50%, price is below EMA99, and lower liquidity is materially thicker. The only reason confidence remains low is that order book bids are still supporting price near the current area.

## 4h View

```text
Momentum 24h: +0.134%
Momentum 48h: -3.058%
Trend aligned: false
Taker buy ratio: 49.63%
Funding: +0.0100%
Long/Short ratio: 1.7685
Signal label: neutral
Signal score: -0.0285
Code setup: WAIT / low confidence
Quick scan: WAIT
```

EMA:

```text
Price vs EMA99 4h: -4.534%
Price vs EMA99 1h ref: -2.474%
Price vs EMA99 4h ref: -5.152%
```

Liquidity:

```text
Liquidity above: 147.01B
Liquidity below: 630.18B
Bias: -0.6217
Sweep target: below @ 72886.19 (-0.6%)
```

Important zones:

```text
Above: 73619.45, 73839.43, 74352.72, 73986.09, 74206.06
Below: 72886.19, 72739.54, 72666.21, 72006.28, 72519.56
```

Interpretation:

4h is the main reason not to force long. The lower liquidation proxy is much thicker than the upper side, and price is still under the important EMA references. A bounce is possible from nearby bid support, but structurally the chart is still vulnerable to a sweep down.

## Trading Plan

Bearish plan:

```text
Preferred short 1: lose 73252, then retest/fail with taker sell confirmation.
Preferred short 2: bounce into 73619 - 73986, then reject.
First targets: 72886 - 72740.
Next targets: 72666 - 72520.
Stretch target: 72006 - 72080.
Invalidation: reclaim and hold above 73923 - 73986.
```

Bullish / caution plan:

```text
Avoid early long while price stays below 73619.
Short-term long only improves if price reclaims 73619, then 73986.
Stronger bullish reversal requires reclaim toward 75058 - 75186.
```

Practical conclusion:

```text
BTC trend today = bearish / wait-for-confirmation.
The nearest attractive move is a lower liquidity sweep toward 72886 - 72740.
Do not short blindly into the 73300 bid wall.
Do not long blindly while 1h and 4h remain below EMA99 and lower liquidity is dominant.
```

## Command Used

```bash
node --input-type=module -e "import { BinanceClient } from './src/binanceClient.js'; import { fetchAnalysis } from './src/marketAnalysis.js'; ..."
```
