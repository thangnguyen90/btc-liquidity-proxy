export const ZONE_OBSERVATION_VERSION = 'ZONE_DIRECTION_NOTE_V1_CLOSED_CACHE_ONLY_20261005';
export const ZONE_DATA_VERSION = 'ZONE_REFRESH_V5_CACHE_FIRST_RETRY_20261005';

// Reuse the same 240-bar input as REST; never promote a partial/stale cache to a new snapshot.
export function cachedZoneKlines(rows, now = Date.now()) {
  if (!Array.isArray(rows) || rows.length < 240) return null;
  const bars = rows.slice(-240), interval = 900_000;
  if (bars.some((b, i) => ![b.open,b.high,b.low,b.close].every(v => Number.isFinite(Number(v)) && Number(v) > 0)
    || Number(b.high) < Math.max(Number(b.open),Number(b.close))
    || Number(b.low) > Math.min(Number(b.open),Number(b.close))
    || Number(b.closeTime) !== Number(b.openTime) + interval - 1
    || Number(b.openTime) % interval !== 0
    || Number(b.openTime) > now
    || (i > 0 && Number(b.openTime) !== Number(bars[i-1].openTime) + interval))) return null;
  const closed = bars.filter(b => Number(b.closeTime) < now && b.isClosed !== false);
  const last = closed.at(-1);
  return last && now - Number(last.closeTime) <= 930_000 ? bars : null;
}

export async function loadZoneKlines({ cachedRows, loadRest, restBusy = () => false, now = Date.now() }) {
  const cached = cachedZoneKlines(cachedRows, now);
  if (cached) return cached;
  // Low-priority background work should not join an already starved analysis queue.
  if (restBusy()) throw Error('Cập nhật vùng tạm hoãn: REST phân tích đang bận; chờ cache/socket hoặc thử lại.');
  return loadRest();
}

function closedMovement(rows, interval, now) {
  const valid = (Array.isArray(rows) ? rows : []).filter(b => b.isClosed !== false
    && Number(b.closeTime) < now && Number(b.openTime) % interval === 0
    && Number(b.closeTime) === Number(b.openTime) + interval - 1
    && Number.isFinite(Number(b.close)) && Number(b.close) > 0);
  const bars = [...new Map(valid.map(b => [Number(b.openTime), b])).values()]
    .sort((a,b) => Number(a.openTime) - Number(b.openTime)).slice(-2);
  const [previous, latest] = bars;
  if (!previous || !latest || now - Number(latest.closeTime) > interval + 60_000
    || Number(latest.openTime) !== Number(previous.openTime) + interval) return { direction:'UNKNOWN', closeAt:null, changePct:null };
  const changePct = (Number(latest.close)/Number(previous.close)-1)*100;
  return { direction:changePct > 0 ? 'UP' : changePct < 0 ? 'DOWN' : 'FLAT',
    closeAt:Number(latest.closeTime), changePct };
}
const movementText = movement => movement.direction === 'UNKNOWN' ? 'chưa đủ dữ liệu mới'
  : `${movement.direction === 'UP' ? '↑ tăng' : movement.direction === 'DOWN' ? '↓ giảm' : '→ ngang'} ${movement.changePct >= 0 ? '+' : ''}${movement.changePct.toFixed(2)}%`;

// Observation only: this object is never read by candidate/plan/authorization/protection gates.
export function buildZoneDirectionNote({ mark, zone, getRows = () => [], symbol, now = Date.now() }) {
  const target = mark < zone?.low ? 'UP' : mark > zone?.high ? 'DOWN' : 'INSIDE';
  const coin = {}, btc = {};
  for (const [label, interval] of [['5m',300_000],['15m',900_000]]) {
    coin[label] = closedMovement(getRows(symbol,label), interval, now);
    btc[label] = closedMovement(getRows('BTCUSDT',label), interval, now);
  }
  const alignment = target === 'INSIDE' ? 'Giá đang trong vùng'
    : btc['15m'].direction === 'UNKNOWN' ? 'BTC 15m chưa đủ dữ liệu'
      : btc['15m'].direction === 'FLAT' ? 'BTC 15m đang ngang'
        : btc['15m'].direction === target ? 'BTC 15m cùng hướng tới vùng' : 'BTC 15m ngược hướng tới vùng';
  return { version:ZONE_OBSERVATION_VERSION, observedAt:now, target, coin, btc, alignment,
    text:`Hướng tới vùng: ${target === 'UP' ? '↑ lên' : target === 'DOWN' ? '↓ xuống' : 'đang trong vùng'}. Coin 5m ${movementText(coin['5m'])}, 15m ${movementText(coin['15m'])}. BTC 5m ${movementText(btc['5m'])}, 15m ${movementText(btc['15m'])}. ${alignment}. So sánh 2 nến đã đóng; khoảng cách không xác nhận hướng giá/sẽ quét, không chặn entry.` };
}

export function safeZoneDirectionNote(input, reader) {
  try { return reader?.(input) ?? buildZoneDirectionNote(input); }
  catch { return buildZoneDirectionNote(input); } // Missing observation must not block an otherwise valid order.
}

export const historicalDirectionText = note => note?.text
  ?? 'Thông báo cũ chưa lưu hướng coin/BTC lúc phát; không suy ngược bằng dữ liệu hiện tại.';
