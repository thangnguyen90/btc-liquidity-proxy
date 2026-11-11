export const EXTREME_REBOUND_SWEEP_VERSION = 'EXTREME_REBOUND_SWEEP_DISCORD_V1_20261109';
export const EXTREME_REBOUND_SWEEP_KIND = 'EXTREME_REBOUND_SWEEP_CONFIRMED';
export const EXTREME_REBOUND_SWEEP_TITLE = 'NẾN HỒI SAU XẢ · ĐÃ QUÉT CỤM SHORT';
const FIVE_MINUTES = 300_000;
const SEND_GRACE = 90_000;
const UPPER_SWEEPS = new Set(['UPPER_CLUSTER_SWEPT', 'ALL_TRACKED_UPPER_SWEPT']);
const vn = value => new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',hour12:false});

export function describeExtremeRebound(priorBars, spike) {
  let peak = priorBars[0];
  let drop = null;
  for (const bar of priorBars.slice(1)) {
    const dropPct = (1 - bar.low / peak.high) * 100;
    if (!drop || dropPct > drop.dropPct) {
      drop = {peakAt:peak.openTime,peakPrice:peak.high,troughAt:bar.openTime,troughPrice:bar.low,dropPct};
    }
    // Only bars strictly before the trough can supply its peak.
    if (bar.high > peak.high) peak = bar;
  }
  if (!drop || drop.dropPct < 6 || spike.close <= spike.open) return null;
  const dropSize = drop.peakPrice - drop.troughPrice;
  const priorRecoveryPct = (priorBars.at(-1).close - drop.troughPrice) / dropSize * 100;
  const recoveryPct = (spike.close - drop.troughPrice) / dropSize * 100;
  const closePositionPct = (spike.close - spike.low) / (spike.high - spike.low) * 100;
  if (priorRecoveryPct > 35 || recoveryPct < 50 || closePositionPct < 60) return null;
  return {...drop,priorRecoveryPct,recoveryPct,closePositionPct,
    bodyPct:(spike.close / spike.open - 1) * 100};
}

function validSweep(pump, sweep, now) {
  return sweep.symbol === pump.symbol && sweep.viewRange === '24h' && UPPER_SWEEPS.has(sweep.kind)
    && typeof sweep.id === 'string' && sweep.id.length > 0
    && [sweep.at,sweep.observedAt,sweep.zonesAsOf,sweep.armedAt,sweep.previousTickAt,
      sweep.previousMarkPrice,sweep.markPrice,sweep.maxTickGapMs].every(Number.isFinite)
    && sweep.at >= pump.candleAt && sweep.at <= pump.candleCloseAt + FIVE_MINUTES
    && sweep.at <= sweep.observedAt && sweep.observedAt <= now
    && sweep.zonesAsOf < pump.candleAt && sweep.zonesAsOf <= sweep.armedAt
    && sweep.armedAt <= sweep.previousTickAt && sweep.previousTickAt < sweep.at
    && sweep.at - sweep.previousTickAt <= 10_000 && sweep.maxTickGapMs <= 10_000
    && sweep.previousMarkPrice > 0 && now - Math.max(sweep.at,pump.candleCloseAt) <= SEND_GRACE;
}

function crossedZone(pump, sweep) {
  return (sweep.zones ?? []).find(zone =>
    [zone.low,zone.high,zone.overlapStrength,zone.establishedAt,zone.asOf].every(Number.isFinite)
    && zone.low > 0 && zone.low < zone.high && zone.high > pump.spikeOpen
    && zone.overlapStrength >= 35 && zone.persistenceBars >= 3
    && zone.establishedAt <= zone.asOf && zone.asOf <= sweep.zonesAsOf
    && zone.cleared === true && zone.clearedAt === sweep.at
    && sweep.previousMarkPrice < zone.high && sweep.markPrice >= zone.high);
}

export function findExtremeReboundSweep(pump, history, now) {
  if (pump?.stage !== 'EXTREME_PUMP_CLOSED' || pump.interval !== '5m' || !pump.reboundContext
    || !(pump.candleCloseAt < now)) return null;
  let match = null;
  for (const sweep of history) {
    if (!validSweep(pump,sweep,now) || (match && match.sweep.at <= sweep.at)) continue;
    const zone = crossedZone(pump,sweep);
    if (zone) match = {sweep,zone};
  }
  if (!match) return null;
  const {sweep,zone} = match;
  return {
    version:EXTREME_REBOUND_SWEEP_VERSION,kind:EXTREME_REBOUND_SWEEP_KIND,
    symbol:pump.symbol,interval:'5m',side:'UPWARD_SPIKE',observeOnly:false,binanceEligible:true,
    candleAt:pump.candleAt,candleCloseAt:pump.candleCloseAt,spikeClose:pump.spikeClose,
    dedupeKey:EXTREME_REBOUND_SWEEP_KIND+'|'+pump.symbol+'|5m|'+pump.candleAt,
    rebound:pump.reboundContext,sweepId:sweep.id,sweptAt:sweep.at,zonesAsOf:sweep.zonesAsOf,
    previousMarkPrice:sweep.previousMarkPrice,markPrice:sweep.markPrice,
    low:zone.low,high:zone.high,overlapStrength:zone.overlapStrength,
  };
}

export function extremeReboundSweepDiscordEvent(event, now) {
  return event?.kind === EXTREME_REBOUND_SWEEP_KIND && event.version === EXTREME_REBOUND_SWEEP_VERSION
    && event.observeOnly === false && event.binanceEligible === true
    && event.interval === '5m' && event.candleCloseAt < now && event.sweptAt <= now
    && now - Math.max(event.sweptAt,event.candleCloseAt) <= SEND_GRACE ? event : null;
}

export function extremeReboundSweepDiscordPayload(event) {
  const rebound = event.rebound;
  const execution = event.binanceExecution;
  const executionText = execution
    ? 'SHORT MARKET · **'+execution.status+'**'+(execution.code?' · '+execution.code:'')
      +(execution.marginUsdt?' · '+execution.marginUsdt+' USDT × '+execution.leverage+'x':'')
    : 'Chưa có kết quả gửi lệnh.';
  const url = new URL('https://liquidity.nhathadev.trade/coinglass-heatmap-lab');
  url.search = new URLSearchParams({symbol:event.symbol,range:'24h',sweep:event.sweepId});
  url.hash = 'heatmap-sweep';
  return {username:'Extreme Short Squeeze',allowed_mentions:{parse:[]},embeds:[{
    title:'🟣 '+event.symbol+' · 5m · '+EXTREME_REBOUND_SWEEP_TITLE,
    color:0x8b5cf6,
    description:'Nến hồi đã đóng và MARK đã vượt mép trên cụm Model 1/3 có từ trước. Cụm là vùng thanh lý ước lượng.',
    fields:[
      {name:'NHỊP XẢ VÀ NẾN HỒI',value:'Đỉnh '+rebound.peakPrice+' → đáy '+rebound.troughPrice
        +' · giảm **'+rebound.dropPct.toFixed(2)+'%**\nNến 5m đóng **'+event.spikeClose
        +'** · tăng **+'+rebound.bodyPct.toFixed(2)+'%** so với mở nến · đóng lúc '+vn(event.candleCloseAt+1)+' VN'},
      {name:'CỤM MODEL 1/3 ĐÃ QUÉT',value:'Vùng **'+Number(event.low.toPrecision(9))+'–'+Number(event.high.toPrecision(9))
        +'** · điểm đồng thuận '+event.overlapStrength.toFixed(1)+'/100\nMARK '+event.previousMarkPrice
        +' → **'+event.markPrice+'** lúc '+vn(event.sweptAt)+' VN'},
      {name:'BINANCE',value:executionText},
      {name:'MỞ ĐÚNG LẦN QUÉT',value:'[Heatmap và cụm đã chốt]('+url.href+')'},
    ],
    timestamp:new Date(event.sweptAt).toISOString(),
    footer:{text:EXTREME_REBOUND_SWEEP_VERSION},
  }]};
}

export class ExtremeReboundSweepFollowups {
  constructor(startedAt = Date.now()) {
    this.startedAt = startedAt;
    this.pending = new Map();
  }

  track(pump) {
    if (!pump.reboundContext || pump.candleCloseAt <= this.startedAt || this.pending.has(pump.dedupeKey)) return;
    this.pending.set(pump.dedupeKey,{pump,finished:false,execution:null});
  }

  async flush(history, {execute,notify}, now = Date.now()) {
    let sent = 0;
    let failed = 0;
    for (const [key, item] of this.pending) {
      if (now > item.pump.candleCloseAt + FIVE_MINUTES + SEND_GRACE) {
        this.pending.delete(key);
        continue;
      }
      if (item.finished) continue;
      const event = findExtremeReboundSweep(item.pump,history,now);
      if (!event) continue;
      // Reserve before sending. Retry only if the notifier skipped the POST in backoff.
      item.finished = true;
      try {
        if (!item.execution) {
          item.execution = await execute(event).catch(()=>({status:'error'}));
        }
        const result = await notify({...event,binanceExecution:item.execution});
        sent += result.sent;
        if (result.reason === 'backoff') item.finished = false;
      } catch {
        failed++;
      }
    }
    return {sent,failed};
  }
}
