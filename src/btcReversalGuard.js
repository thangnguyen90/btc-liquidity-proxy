// Monitors BTC price for bearish→bullish reversals and closes profitable short positions.
const priceBuffer = []; // { price, at }[]
const BUFFER_SIZE = 4;
const MIN_REVERSAL_PCT = 0.1; // BTC must bounce at least 0.1% to count as reversal

export function startBtcReversalGuard({ client, getSymbols, getRuntimeSettings, intervalMs = 30000, getPositionData = null }) {
  console.log('[BRG] BTC reversal short-exit guard loaded.');

  const run = async () => {
    const settings = getRuntimeSettings();
    if (!settings.btcReversalGuard) return;

    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) return;

    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

    try {
      const premium = await client.getPremiumIndex('BTCUSDT');
      const btcPrice = Number(premium.markPrice);
      priceBuffer.push({ price: btcPrice, at: Date.now() });
      if (priceBuffer.length > BUFFER_SIZE) priceBuffer.shift();

      if (priceBuffer.length < 3) return;

      const n = priceBuffer.length;
      const p0 = priceBuffer[n - 3].price;
      const p1 = priceBuffer[n - 2].price;
      const p2 = priceBuffer[n - 1].price;

      // Was falling (p1 < p0) AND now rising (p2 > p1) with minimum bounce
      const wasFalling = p1 < p0;
      const nowRising = p2 > p1;
      const bouncePct = ((p2 - p1) / p1) * 100;

      if (!wasFalling || !nowRising || bouncePct < MIN_REVERSAL_PCT) return;

      console.log(`[BRG] BTC reversal: ${p0.toFixed(1)} → ${p1.toFixed(1)} → ${p2.toFixed(1)} (+${bouncePct.toFixed(2)}%) — scanning shorts.`);

      const minRoe = settings.btcReversalGuardRoe ?? 1;
      const [posData, symbols] = await Promise.all([
        getPositionData ? getPositionData() : client.getPositions({ apiKey, apiSecret }),
        getSymbols(),
      ]);
      const positions = Array.isArray(posData) ? posData : (posData.positions ?? []);

      const shorts = positions.filter((p) => Number(p.positionAmt) < 0);
      if (!shorts.length) {
        console.log('[BRG] No short positions.');
        return;
      }

      for (const pos of shorts) {
        const amt = Number(pos.positionAmt);
        const entry = Number(pos.entryPrice);
        const lev = Number(pos.leverage) || 1;
        const upnl = Number(pos.unRealizedProfit);
        const isolatedMargin = Number(pos.isolatedMargin);
        const initialMargin = Number(pos.initialMargin);
        const margin = isolatedMargin > 0 ? isolatedMargin
          : initialMargin > 0 ? initialMargin
            : Math.abs(amt) * entry / lev;
        const roe = margin > 0 ? (upnl / margin) * 100 : 0;

        console.log(`[BRG] ${pos.symbol} SHORT ROE=${roe.toFixed(2)}%`);

        if (roe < minRoe) {
          console.log(`[BRG] ${pos.symbol} ROE ${roe.toFixed(2)}% < ${minRoe}% — skip.`);
          continue;
        }

        if (settings.dryRun) {
          console.log(`[BRG] [DRY RUN] Would close ${pos.symbol} SHORT ROE=${roe.toFixed(2)}%`);
          continue;
        }

        const symbolInfo = symbols.find((s) => s.symbol === pos.symbol);
        const quantity = formatQty(Math.abs(amt), symbolInfo);
        const positionSide = pos.positionSide ?? 'BOTH';
        const isHedge = positionSide !== 'BOTH';

        const closeParams = {
          symbol: pos.symbol,
          side: 'BUY',
          type: 'MARKET',
          quantity,
          recvWindow,
          newClientOrderId: `lp_brg_${pos.symbol}_${Date.now()}`.slice(0, 36),
        };
        if (isHedge) closeParams.positionSide = 'SHORT';
        else closeParams.reduceOnly = 'true';

        try {
          const result = await client.placeFuturesOrder({ params: closeParams, apiKey, apiSecret });
          console.log(`[BRG] ✅ ${pos.symbol} SHORT closed. ROE=${roe.toFixed(2)}% orderId=${result.orderId}`);
        } catch (err) {
          console.error(`[BRG] ❌ ${pos.symbol} close failed:`, err.message);
        }
      }
    } catch (err) {
      console.error('[BRG] Error:', err.message);
    }
  };

  setTimeout(run, 15000);
  setInterval(run, intervalMs);
}

function formatQty(qty, symbolInfo) {
  const lotSize = symbolInfo?.filters?.find((f) => f.filterType === 'LOT_SIZE');
  const step = Number(lotSize?.stepSize ?? 0.001);
  const s = String(step);
  const dec = s.includes('.') ? s.replace(/0+$/, '').split('.')[1]?.length ?? 0 : 0;
  return (Math.floor(qty / step) * step).toFixed(dec).replace(/\.?0+$/, '');
}
