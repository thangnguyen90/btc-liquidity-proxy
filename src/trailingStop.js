const protectedPositions = new Map(); // symbol → { orderId, stopPrice, roe, at }

export function startTrailingStopScanner({ client, getSymbols, intervalMs = 30000 }) {
  if (process.env.TRAILING_STOP_ENABLED !== 'true') {
    console.log('[TSL] Disabled. Set TRAILING_STOP_ENABLED=true to enable.');
    return { protectedPositions };
  }

  const triggerRoe = Number(process.env.TRAILING_STOP_TRIGGER_ROE ?? 1);
  const lockMarginPct = Number(process.env.TRAILING_STOP_LOCK_MARGIN_PCT ?? 1) / 100;
  // Dời SL mỗi khi ROE tăng thêm triggerRoe/3 (e.g. mỗi 5pp với trigger=15)
  const updateRoe = Math.max(3, triggerRoe / 3);

  console.log(`[TSL] Enabled. Trigger ROE >= ${triggerRoe}% → lock ${lockMarginPct * 100}% margin. Update every ${updateRoe}pp. Interval: ${intervalMs / 1000}s`);

  const run = async () => {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) return;

    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

    try {
      const [positions, openAlgoOrders, openOrders, symbols] = await Promise.all([
        client.getPositions({ apiKey, apiSecret }),
        client.getOpenAlgoOrders({ apiKey, apiSecret }),
        client.getOpenOrders({ apiKey, apiSecret }),
        getSymbols(),
      ]);

      const active = positions.filter((p) => Number(p.positionAmt) !== 0);

      // Clean up closed positions from map
      const activeSymbols = new Set(active.map((p) => p.symbol));
      for (const sym of protectedPositions.keys()) {
        if (!activeSymbols.has(sym)) {
          console.log(`[TSL] ${sym} closed — removed from protected.`);
          protectedPositions.delete(sym);
        }
      }

      if (active.length === 0) {
        console.log('[TSL] No open positions.');
        return;
      }

      for (const pos of active) {
        const amt = Number(pos.positionAmt);
        const entry = Number(pos.entryPrice);
        const mark = Number(pos.markPrice);
        const lev = Number(pos.leverage) || 1;
        const upnl = Number(pos.unRealizedProfit);

        // Prefer isolatedMargin (non-zero for isolated), fallback to initialMargin, then notional/leverage
        const isolatedMargin = Number(pos.isolatedMargin);
        const initialMargin = Number(pos.initialMargin);
        const notionalMargin = Math.abs(amt) * entry / lev;
        const margin = isolatedMargin > 0 ? isolatedMargin
          : initialMargin > 0 ? initialMargin
            : notionalMargin;

        const roe = margin > 0 ? (upnl / margin) * 100 : 0;
        const existingProtected = protectedPositions.get(pos.symbol);

        console.log(`[TSL] ${pos.symbol} | amt=${amt} entry=${entry} mark=${mark} upnl=${upnl.toFixed(4)} margin=${margin.toFixed(4)} ROE=${roe.toFixed(2)}%${existingProtected ? ` (SL@${existingProtected.stopPrice} placed@ROE${existingProtected.roe?.toFixed(1)}%)` : ''}`);

        if (roe < triggerRoe) continue;

        const algoList = Array.isArray(openAlgoOrders?.orders) ? openAlgoOrders.orders
          : Array.isArray(openAlgoOrders) ? openAlgoOrders : [];

        // Kiểm tra bằng algoId đã lưu — algo order type là 'CONDITIONAL' không phải 'STOP_MARKET'
        const myAlgoOpen = existingProtected?.algoId &&
          algoList.some((o) => String(o.algoId) === String(existingProtected.algoId));

        // Check manual SL (regular order STOP_MARKET từ user, không phải TSL)
        const isSlOrder = (o) => { const t = String(o.type || '').toUpperCase(); return t === 'STOP_MARKET' || t === 'STOP'; };
        const hasManualSl = openOrders.some((o) => o.symbol === pos.symbol && isSlOrder(o));

        const roeGain = existingProtected?.roe != null ? roe - existingProtected.roe : 0;
        const shouldUpdate = myAlgoOpen && !existingProtected.manual && roeGain >= updateRoe;

        if (hasManualSl) {
          // User đặt SL tay → không đụng vào
          if (!existingProtected) protectedPositions.set(pos.symbol, { algoId: null, stopPrice: null, roe: Number(roe.toFixed(2)), at: new Date().toISOString(), manual: true });
          continue;
        }

        if (myAlgoOpen && !shouldUpdate) {
          // TSL đã đặt và ROE chưa tăng đủ updateRoe → giữ nguyên
          continue;
        }

        // Cancel algo SL cũ nếu có (trường hợp update hoặc filled/cancelled từ bên ngoài)
        if (existingProtected?.algoId) {
          try {
            await client.cancelAlgoOrder({ algoId: existingProtected.algoId, apiKey, apiSecret });
            if (shouldUpdate) {
              console.log(`[TSL] ${pos.symbol} dời SL lên — ROE ${existingProtected.roe?.toFixed(1)}% → ${roe.toFixed(1)}% (+${roeGain.toFixed(1)}pp)`);
            }
          } catch { /* already gone */ }
        }
        protectedPositions.delete(pos.symbol);

        // Progressive lock: khoá nhiều hơn khi ROE tăng
        // ROE=15% → lock 1×, ROE=30% → lock 2×, ROE=45% → lock 3×, ...
        const progressiveLockPct = lockMarginPct * (roe / triggerRoe);
        const lockedProfit = margin * progressiveLockPct;
        const isLong = amt > 0;
        const rawStop = isLong
          ? entry + lockedProfit / Math.abs(amt)
          : entry - lockedProfit / Math.abs(amt);

        const symbolInfo = symbols.find((s) => s.symbol === pos.symbol);
        const stopPrice = roundToTick(rawStop, symbolInfo);
        const side = isLong ? 'SELL' : 'BUY';

        // Sanity check: stop must be between entry and mark (in profit zone)
        if (isLong && stopPrice >= mark) {
          console.warn(`[TSL] ${pos.symbol} SKIP: stopPrice ${stopPrice} >= mark ${mark} — would trigger immediately.`);
          continue;
        }
        if (!isLong && stopPrice <= mark) {
          console.warn(`[TSL] ${pos.symbol} SKIP: stopPrice ${stopPrice} <= mark ${mark} — would trigger immediately.`);
          continue;
        }

        const quantity = formatQty(Math.abs(amt), symbolInfo);
        const positionSide = pos.positionSide ?? 'BOTH';
        const isHedgeMode = positionSide !== 'BOTH';
        const algoParams = {
          algoType: 'CONDITIONAL',
          symbol: pos.symbol,
          side,
          type: 'STOP_MARKET',
          triggerPrice: String(stopPrice),
          quantity,
          workingType: 'MARK_PRICE',
          recvWindow,
          newClientOrderId: `lp_tsl_${pos.symbol}_${Date.now()}`.slice(0, 36),
        };
        if (isHedgeMode) {
          algoParams.positionSide = positionSide;
        } else {
          algoParams.reduceOnly = 'true';
        }
        try {
          const result = await client.placeAlgoOrder({
            params: algoParams,
            apiKey,
            apiSecret,
          });
          protectedPositions.set(pos.symbol, {
            algoId: result.algoId ?? result.orderId,
            stopPrice,
            roe: Number(roe.toFixed(2)),
            at: new Date().toISOString(),
          });
          console.log(`[TSL] ✅ ${pos.symbol} ROE=${roe.toFixed(1)}% → SL @ ${stopPrice} (locks ${(progressiveLockPct * 100).toFixed(1)}% margin)${shouldUpdate ? ' [TRAIL]' : ''} algoId=${result.algoId ?? result.orderId}`);
        } catch (err) {
          console.error(`[TSL] ❌ ${pos.symbol} place SL failed:`, err.message);
        }
      }
    } catch (err) {
      console.error('[TSL] Scan error:', err.message);
    }
  };

  setTimeout(run, 5000);
  setInterval(run, intervalMs);

  return { protectedPositions };
}

function roundToTick(price, symbolInfo) {
  const filter = symbolInfo?.filters?.find((f) => f.filterType === 'PRICE_FILTER');
  const tick = Number(filter?.tickSize ?? 0.01);
  const dec = decimals(tick);
  return Number((Math.round(price / tick) * tick).toFixed(dec));
}

function decimals(step) {
  const s = String(step);
  if (!s.includes('.')) return 0;
  return s.replace(/0+$/, '').split('.')[1]?.length ?? 0;
}

function formatQty(qty, symbolInfo) {
  const lotSize = symbolInfo?.filters?.find((f) => f.filterType === 'LOT_SIZE');
  const step = Number(lotSize?.stepSize ?? 0.001);
  const dec = decimals(step);
  const stepped = Math.floor(qty / step) * step;
  return stepped.toFixed(dec).replace(/\.?0+$/, '');
}
