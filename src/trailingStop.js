import { sharedMarkTicker } from './sharedMarkTicker.js';

const protectedPositions = new Map(); // symbol → { orderId, stopPrice, roe, at }
const positionDataCache = new Map();  // symbol → { amt, entry, margin, positionSide } — updated each REST scan
const symbolInfoCache   = new Map();  // symbol → symbolInfo (filters) — updated each REST scan

export function startTrailingStopScanner({ client, getSymbols, intervalMs = 30000, webhookUrl, isExcluded = null, getPositionData = null }) {
  if (process.env.TRAILING_STOP_ENABLED !== 'true') {
    console.log('[TSL] Disabled. Set TRAILING_STOP_ENABLED=true to enable.');
    return { protectedPositions };
  }

  const triggerRoe = Number(process.env.TRAILING_STOP_TRIGGER_ROE ?? 10);
  // Ladder khóa lời: 10→1, 15→5, 20→10, 25→15...
  const updateRoe = Number(process.env.TRAILING_STOP_UPDATE_ROE ?? 5);

  console.log(`[TSL] Enabled. Trigger ROE >= ${triggerRoe}% → SL ladder 10→3%, 15→5%, 20→10%, 25→15%, 30→15%, 35→20%, 40→25%... Dời mỗi ${updateRoe}pp. Interval: ${intervalMs / 1000}s`);

  const notify = (content) => {
    if (!webhookUrl) return;
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    }).catch(() => {});
  };

  // Startup ping
  notify(`🟢 **[TSL]** Khởi động — trigger ROE ≥ ${triggerRoe}% → SL ladder 10→3, 15→5, 20→10, 25→15, 30→15, 35→20, 40→25%... dời mỗi ${updateRoe}pp`);

  function getTargetLockRoe(roe) {
    if (roe >= 30) {
      const steps = Math.floor((roe - 30) / 5);
      return 15 + steps * 5;        // 30→15, 35→20, 40→25, 45→30, ...
    }
    if (roe >= 15) {
      const steps = Math.floor((roe - 15) / 5);
      return (15 + steps * 5) - 10; // 15→5, 20→10, 25→15
    }
    if (roe >= 10) return 3;
    return null;
  }

  const run = async () => {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) return;

    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);

    try {
      const [posData, symbols] = await Promise.all([
        getPositionData ? getPositionData() : client.getPositions({ apiKey, apiSecret }).then((p) => ({ positions: p.filter((x) => Number(x.positionAmt) !== 0), openOrders: [], algoOrders: [] })),
        getSymbols(),
      ]);
      const positions = posData.positions ?? posData.filter?.((p) => Number(p.positionAmt) !== 0) ?? posData;
      const openOrders = posData.openOrders ?? [];
      const sharedAlgoOrders = posData.algoOrders ?? null; // pre-fetched algo orders for all symbols

      const active = positions;

      // Cache symbol info for tick-path rounding
      for (const s of symbols) symbolInfoCache.set(s.symbol, s);

      // Update position cache + ticker subscription
      const activeSymbolSet = new Set(active.map((p) => p.symbol));
      sharedMarkTicker.setSymbols('trailingStop', [...activeSymbolSet]);

      // Clean up closed positions from map
      const activeSymbols = activeSymbolSet;
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

      console.log(`[TSL] Scanning ${active.length} position(s): ${active.map(p => p.symbol).join(', ')}`);

      for (const pos of active) {
        if (isExcluded?.(pos.symbol)) {
          console.log(`[TSL] ${pos.symbol} skipped — excluded from position management`);
          continue;
        }
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

        // Cache cho tick-triggered check
        positionDataCache.set(pos.symbol, { amt, entry, margin, positionSide: pos.positionSide ?? 'BOTH' });

        const existingProtected = protectedPositions.get(pos.symbol);

        console.log(`[TSL] ${pos.symbol} | amt=${amt} entry=${entry} mark=${mark} upnl=${upnl.toFixed(4)} margin=${margin.toFixed(4)} ROE=${roe.toFixed(2)}%${existingProtected ? ` (SL@${existingProtected.stopPrice} placed@ROE${existingProtected.roe?.toFixed(1)}%)` : ''}`);

        if (roe < triggerRoe) continue;

        let algoList;
        if (sharedAlgoOrders) {
          algoList = sharedAlgoOrders.filter((o) => o.symbol === pos.symbol);
        } else {
          const openAlgoOrders = await client.getOpenAlgoOrders({ symbol: pos.symbol, apiKey, apiSecret }).catch(() => ({ orders: [] }));
          algoList = Array.isArray(openAlgoOrders?.orders) ? openAlgoOrders.orders
            : Array.isArray(openAlgoOrders) ? openAlgoOrders : [];
        }

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
          notify(`🔼 **[TSL] ${pos.symbol}** dời SL — ROE ${existingProtected.roe?.toFixed(1)}% → ${roe.toFixed(1)}% (+${roeGain.toFixed(1)}pp) | SL cũ: ${existingProtected.stopPrice}`);
            }
          } catch { /* already gone */ }
        }
        protectedPositions.delete(pos.symbol);

        const lockRoe = getTargetLockRoe(roe);
        if (lockRoe === null) continue;
        const progressiveLockPct = lockRoe / 100;
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
          console.log(`[TSL] ✅ ${pos.symbol} ROE=${roe.toFixed(1)}% → SL @ ${stopPrice} (locks ${lockRoe.toFixed(1)}% ROE)${shouldUpdate ? ' [TRAIL]' : ''} algoId=${result.algoId ?? result.orderId}`);
          notify(`✅ **[TSL] ${pos.symbol}** ROE=${roe.toFixed(1)}% → SL @ **${stopPrice}** (khóa ${lockRoe.toFixed(1)}% ROE)${shouldUpdate ? ' **[TRAIL]**' : ' [NEW]'} | algoId=${result.algoId ?? result.orderId}`);
        } catch (err) {
          console.error(`[TSL] ❌ ${pos.symbol} place SL failed:`, err.message);
        }
      }
    } catch (err) {
      console.error('[TSL] Scan error:', err.message);
    }
  };

  // ── Tick-path: đặt SL trực tiếp từ WebSocket price, không gọi getPositions() ──
  // Dùng positionDataCache + symbolInfoCache đã có từ lần REST scan gần nhất.
  // Chỉ cần 1-2 REST calls: cancelAlgoOrder (nếu dời) + placeAlgoOrder.
  const tickApply = async (symbol, markPrice) => {
    const apiKey    = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) return;

    const cached = positionDataCache.get(symbol);
    if (!cached) return;

    const { amt, entry, margin, positionSide } = cached;
    const upnl = (markPrice - entry) * amt;
    const roe  = margin > 0 ? (upnl / margin) * 100 : 0;
    if (roe < triggerRoe) return;

    const existing  = protectedPositions.get(symbol);
    const roeGain   = existing?.roe != null ? roe - existing.roe : 0;
    const needsNew  = !existing;
    const needsUpd  = existing && !existing.manual && roeGain >= updateRoe;
    if (!needsNew && !needsUpd) return;

    // Cancel SL cũ nếu đang dời lên
    if (existing?.algoId && needsUpd) {
      try {
        await client.cancelAlgoOrder({ algoId: existing.algoId, apiKey, apiSecret });
        console.log(`[TSL-Tick] ${symbol} dời SL — ROE ${existing.roe?.toFixed(1)}% → ${roe.toFixed(1)}% (+${roeGain.toFixed(1)}pp)`);
        notify(`🔼 **[TSL-Tick] ${symbol}** dời SL — ROE ${existing.roe?.toFixed(1)}% → ${roe.toFixed(1)}% | SL cũ: ${existing.stopPrice}`);
      } catch { /* already gone */ }
    }
    protectedPositions.delete(symbol);

    const lockRoe = getTargetLockRoe(roe);
    if (lockRoe === null) return;

    const lockedProfit = margin * (lockRoe / 100);
    const isLong       = amt > 0;
    const rawStop      = isLong
      ? entry + lockedProfit / Math.abs(amt)
      : entry - lockedProfit / Math.abs(amt);

    const symbolInfo = symbolInfoCache.get(symbol);
    const stopPrice  = roundToTick(rawStop, symbolInfo);
    const side       = isLong ? 'SELL' : 'BUY';

    // Sanity: stop phải nằm giữa entry và mark (vùng có lời)
    if (isLong  && stopPrice >= markPrice) { console.warn(`[TSL-Tick] ${symbol} SKIP: stop ${stopPrice} >= mark ${markPrice}`); return; }
    if (!isLong && stopPrice <= markPrice) { console.warn(`[TSL-Tick] ${symbol} SKIP: stop ${stopPrice} <= mark ${markPrice}`); return; }

    const quantity   = formatQty(Math.abs(amt), symbolInfo);
    const recvWindow = Number(process.env.BINANCE_DEFAULT_RECV_WINDOW ?? 5000);
    const isHedge    = positionSide !== 'BOTH';
    const algoParams = {
      algoType: 'CONDITIONAL',
      symbol,
      side,
      type: 'STOP_MARKET',
      triggerPrice: String(stopPrice),
      quantity,
      workingType: 'MARK_PRICE',
      recvWindow,
      newClientOrderId: `lp_tsl_${symbol}_${Date.now()}`.slice(0, 36),
    };
    if (isHedge) { algoParams.positionSide = positionSide; }
    else         { algoParams.reduceOnly = 'true'; }

    try {
      const result = await client.placeAlgoOrder({ params: algoParams, apiKey, apiSecret });
      protectedPositions.set(symbol, {
        algoId:    result.algoId ?? result.orderId,
        stopPrice,
        roe:       Number(roe.toFixed(2)),
        at:        new Date().toISOString(),
        fromTick:  true,
      });
      console.log(`[TSL-Tick] ✅ ${symbol} ROE=${roe.toFixed(1)}% → SL @ ${stopPrice} (locks ${lockRoe.toFixed(1)}% ROE) algoId=${result.algoId ?? result.orderId}`);
      notify(`✅ **[TSL-Tick] ${symbol}** ROE=${roe.toFixed(1)}% → SL @ **${stopPrice}** (khóa ${lockRoe.toFixed(1)}% ROE)${needsUpd ? ' **[TRAIL]**' : ' [NEW]'}`);
    } catch (err) {
      console.error(`[TSL-Tick] ❌ ${symbol} place SL failed:`, err.message);
      // Fallback: schedule full REST run để retry
      setTimeout(() => run().catch(() => {}), 2_000);
    }
  };

  // Mark price ticker — chạy tickApply ngay trên mỗi tick thay vì gọi run()
  let lastTickScan = 0;
  let wsNotified = false;
  sharedMarkTicker.register('trailingStop', ({ symbol, markPrice }) => {
    if (!wsNotified) {
      wsNotified = true;
      console.log('[MarkTick] ✅ First tick received — realtime price tracking active');
      notify(`📡 **[MarkTick]** WebSocket connected — TSL chạy theo tick realtime`);
    }
    const cached = positionDataCache.get(symbol);
    if (!cached) return;
    if (isExcluded?.(symbol)) return;

    const { amt, entry, margin } = cached;
    const upnl = (markPrice - entry) * amt;
    const roe  = margin > 0 ? (upnl / margin) * 100 : 0;

    const existing = protectedPositions.get(symbol);
    const roeGain  = existing?.roe != null ? roe - existing.roe : 0;

    const needsAction = roe >= triggerRoe && (
      (!existing) ||
      (!existing.manual && roeGain >= updateRoe)
    );
    if (!needsAction) return;

    const now = Date.now();
    if (now - lastTickScan < 2_000) return; // debounce 2s (giảm từ 8s — tick-path nhẹ hơn)
    lastTickScan = now;

    console.log(`[TSL-Tick] 🎯 ${symbol} ROE≈${roe.toFixed(1)}% → đặt SL ngay từ tick`);
    tickApply(symbol, markPrice).catch((e) => console.error('[TSL-Tick] error:', e.message));
  });

  setTimeout(run, 5000);
  setInterval(run, intervalMs);

  // scheduleRun — gọi từ bên ngoài khi có position mới (onOrderFill)
  // debounce 2s để nhiều fill liên tiếp không trigger nhiều REST call
  let _scheduleTimer = null;
  function scheduleRun(delayMs = 2_000) {
    clearTimeout(_scheduleTimer);
    _scheduleTimer = setTimeout(() => {
      _scheduleTimer = null;
      console.log('[TSL] scheduleRun triggered (new position event)');
      run().catch((e) => console.error('[TSL] scheduleRun error:', e.message));
    }, delayMs);
  }

  return { protectedPositions, scheduleRun };
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
