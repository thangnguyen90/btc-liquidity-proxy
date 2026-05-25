# GENIUS Trend Analysis - 2026-05-25

Generated from the current repo logic:

- `fetchAnalysis({ symbol: "GENIUSUSDT", interval: "15m" })`
- `fetchAnalysis({ symbol: "GENIUSUSDT", interval: "1h" })`
- `fetchAnalysis({ symbol: "GENIUSUSDT", interval: "4h" })`

Snapshot time: `2026-05-25 09:51 Asia/Ho_Chi_Minh`

## Quick Verdict

GENIUS is still structurally bullish on `1h` and `4h`, but the short-term `15m` liquidity map warns that price may sweep down first before continuing.

Best read:

- Main bias: `LONG`, but do not chase blindly.
- Safer long zone: after reclaim/hold above `0.7039 - 0.7046`, or after a sweep into `0.6997 - 0.6976` and bullish rejection.
- Danger zone: losing `0.6983` cleanly opens a deeper pullback toward `0.6835 - 0.6765`.

## Current Price

```text
GENIUSUSDT mark price: ~0.7025
```

## 15m View

```text
Momentum 24h: +6.517%
Momentum 48h: +12.502%
Trend aligned: true
Taker buy ratio: 49.91%
Funding: +0.0050%
Long/Short ratio: 0.7053
Signal label: uptrend
Signal score: +0.3336
Code setup: LONG / medium confidence
Quick scan: WAIT
```

EMA:

```text
Price vs EMA99 15m: -1.158%
Price vs EMA99 1h: +16.888%
Price vs EMA99 4h: +26.702%
```

Liquidity:

```text
Liquidity above: 147.88M
Liquidity below: 624.17M
Bias: -0.6169
Sweep target: below @ 0.69969 (-0.4%)
```

Important zones:

```text
Above: 0.706715, 0.708823, 0.708120, 0.711633, 0.713740
Below: 0.699690, 0.697583, 0.701798, 0.696178, 0.694773
```

Interpretation:

15m is not clean for immediate long because liquidity below is much thicker. This often means price can be pulled down to sweep late longs before resuming. If long, better after rejection from the lower sweep zone or after reclaiming the near upper trigger.

## 1h View

```text
Momentum 24h: +6.517%
Momentum 48h: +11.697%
Trend aligned: true
Taker buy ratio: 50.54%
Funding: +0.0050%
Long/Short ratio: 0.7173
Signal label: uptrend
Signal score: +0.4468
Code setup: LONG / medium confidence
Quick scan: WAIT
```

EMA:

```text
Price vs EMA99 1h: +13.313%
Price vs higher 1h EMA ref: +16.882%
Price vs EMA99 4h: +26.697%
```

Liquidity:

```text
Liquidity above: 820.55M
Liquidity below: 1,001.91M
Bias: -0.0995
Sweep target: none
```

Code trade setup:

```text
Direction: LONG
Entry zone: 0.701773 - 0.707955
Trigger: 0.703177
Invalidation / SL: 0.678026
Targets: 0.704582, 0.738301, 0.703880
```

Important zones:

```text
Above: 0.704582, 0.738301, 0.703880, 0.710202, 0.708095
Below: 0.676483, 0.698260, 0.686318, 0.699665, 0.701070
```

Interpretation:

1h supports long continuation, but liquidity is almost balanced and slightly heavier below. The nearer risk is a dip to `0.7011 - 0.6983`. If this zone holds, the long structure remains healthy. If it breaks, the deeper magnet is `0.6863 - 0.6765`.

## 4h View

```text
Momentum 24h: +6.630%
Momentum 48h: +11.697%
Trend aligned: true
Taker buy ratio: 50.47%
Funding: +0.0050%
Long/Short ratio: 0.7015
Signal label: uptrend
Signal score: +0.4669
Code setup: LONG / high confidence
Quick scan: WAIT
```

EMA:

```text
Price vs EMA99 4h: +28.794%
Price vs EMA99 1h ref: +16.884%
Price vs EMA99 4h ref: +26.697%
```

Liquidity:

```text
Liquidity above: 1,427.33M
Liquidity below: 1,420.91M
Bias: +0.0023
Sweep target: none
```

Code trade setup:

```text
Direction: LONG
Entry zone: 0.698260 - 0.711868
Trigger: 0.703880
Invalidation / SL: 0.657556
Targets: 0.708095, 0.761483, 0.725657
```

Important zones:

```text
Above: 0.708095, 0.761483, 0.725657, 0.772723, 0.845780
Below: 0.698260, 0.683508, 0.676483, 0.641360, 0.687021
```

Interpretation:

4h is the strongest bullish argument. Price is far above EMA99 and momentum is aligned across 24h and 48h. However, because price is extended above EMA, the trade is vulnerable to sharp pullbacks. The best long setups are pullback-and-hold or breakout-and-retest, not chasing a vertical candle.

## Trading Plan

Bullish plan:

```text
Preferred entry 1: sweep 0.6997 - 0.6976, then reclaim with bullish rejection.
Preferred entry 2: reclaim/hold above 0.7039 - 0.7046.
First targets: 0.7081 - 0.7116.
Stretch targets: 0.7257, 0.7383, 0.7615.
```

Bearish / caution plan:

```text
If price loses 0.6983 cleanly, avoid long chase.
Next downside magnets: 0.6835 - 0.6765.
Harder 4h invalidation area from code: 0.6576.
```

Practical conclusion:

```text
GENIUS trend = bullish, but short-term sweep-down risk is high.
Do not short blindly into the 4h uptrend.
Do not long blindly while 15m liquidity below remains dominant.
Best setup is long after liquidity sweep + rejection, or after reclaiming 0.7046.
```

## Reusable Coin Analysis Template

Use this structure for any coin:

```text
Symbol:
Snapshot time:
Current price:

1. Multi-timeframe bias
- 15m direction:
- 1h direction:
- 4h direction:
- Are 24h and 48h momentum aligned?
- Is price above/below EMA99 on 1h and 4h?

2. Liquidity map
- 15m liquidity above/below/bias:
- 1h liquidity above/below/bias:
- 4h liquidity above/below/bias:
- Main sweep target:
- Nearest upper zones:
- Nearest lower zones:

3. Flow confirmation
- Taker buy ratio:
- Orderbook imbalance:
- Funding:
- Long/short ratio:

4. Code setup
- Direction:
- Confidence:
- Entry zone:
- Trigger:
- Invalidation / SL:
- Targets:

5. Final read
- Main trend:
- Short-term trap risk:
- Best entry condition:
- Invalidated when:
- Do not trade if:
```

## Command Used

```bash
node --input-type=module -e "import {BinanceClient} from './src/binanceClient.js'; import {fetchAnalysis} from './src/marketAnalysis.js'; ..."
```
