import { BTC_LIQUIDATION_STATES, btcLiquidationKey } from './btc-liquidation-context-model.js?v=20261013-v4';
import { BTC_LIQUIDATION_FORECAST_VERSION, BTC_LIQUIDATION_FORECAST_TIERS,btcLiquidationForecastKey } from './btc-liquidation-forecast-model.js?v=20261013-v2';
import { installLiveCardWhitelistUi } from './live-card-whitelist-ui.js';

const root = document.querySelector('#btc-liquidation-context');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const num = (value, digits = 2) => value == null || !Number.isFinite(Number(value)) ? '—'
  : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: digits });
const usd = value => value == null ? '—' : `${num(value / 1_000_000)} triệu USD`;
const time = value => value > 0 ? new Date(value).toLocaleString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh' }) : '—';
const whitelist = installLiveCardWhitelistUi({ page:'btc-liquidation-context', label:'Bối cảnh thanh lý · quan sát', root:document });
const forecastWhitelist=installLiveCardWhitelistUi({page:'btc-liquidation-forecast',label:'Nguy cơ thanh lý sớm · thử nghiệm',root:document});
let busy = false;
let lastEpisode = null;

export function renderBtcLiquidationContext(data = {}) {
  if (!root) return;
  const state = Object.hasOwn(BTC_LIQUIDATION_STATES, data.state) ? data.state : 'WAIT_DATA';
  root.dataset.state = state;
  root.dataset.version = data.version ?? '';
  const key = btcLiquidationKey(state);
  if (key) root.dataset.liveCardKey = key; else delete root.dataset.liveCardKey;
  // This feature has observation history only. Never substitute an estimated
  // return or alert count for causally matched, real CLOSED AvgROE.
  root.dataset.binanceCardAvgRoe = '';
  root.dataset.binanceCardAvgRoeEligible = 'false';
  const heading = root.querySelector('[data-context-heading]');
  if (heading.textContent !== BTC_LIQUIDATION_STATES[state]) heading.textContent = BTC_LIQUIDATION_STATES[state];
  const m = data.inputs ?? {}, liq = data.liquidation ?? {};
  const forecastBox=root.querySelector('[data-context-forecast]');
  if(forecastBox) {
    const f=data.forecast?.version===BTC_LIQUIDATION_FORECAST_VERSION?data.forecast:null;
    forecastBox.innerHTML=['LONG','SHORT'].map(side=>{
      const s=f?.sides?.find(row=>row.side===side);
      const tier=f?.ready===true && Object.hasOwn(BTC_LIQUIDATION_FORECAST_TIERS,s?.tier)?s.tier:'WAIT_DATA';
      const key=btcLiquidationForecastKey(side,tier);
      return `<article class="context-forecast-card" data-forecast-side="${side}" data-tier="${esc(tier)}"
        ${key?`data-live-card-key="${esc(key)}"`:''} data-binance-card-avg-roe="" data-binance-card-avg-roe-eligible="false">
        <h3>${side} · ${esc(BTC_LIQUIDATION_FORECAST_TIERS[tier])}</h3>
        ${tier==='WAIT_DATA'?`<p>${esc((f?.reasons??['Runtime chưa cung cấp cảnh báo sớm; không suy ra an toàn.']).join(' '))}</p>`
          : `<p>${esc(s.scenario)} Mốc cấu trúc BTC: <b>${esc(num(s.level))}</b> USDT.</p>
          <ul>${(s.conditions??[]).map(c=>`<li class="${c.met===true?'condition-met':'condition-wait'}">${c.met===true?'✓':'—'} ${esc(c.label)}${c.detail?`<small>${esc(c.detail)}</small>`:''}</li>`).join('')}</ul>`}
      </article>`;
    }).join('')+`<p class="context-forecast-note">WATCH/EARLY: nguy cơ 30 phút tới · ĐANG THÁO: diễn biến hiện tại, không phải dự báo.
      Nến 5m đóng ${esc(time(f?.closedAt))} · tải đầy đủ lúc ${esc(time(f?.dataFetchedAt))}.
      ${esc(f?.refreshWarning??'')} Không chờ thanh lý đạt ngưỡng; không phải xác suất, không đảm bảo báo trước mọi đợt thanh lý, không tự vào/đóng lệnh.</p>`;
  }
  const totalsBox=root.querySelector('[data-context-totals]');
  if(totalsBox) totalsBox.innerHTML=['LONG','SHORT'].map(side=>{
    const long=side==='LONG', amount=long?liq.long5m:liq.short5m, one=long?liq.long1m:liq.short1m;
    const large=Number.isFinite(amount)&&amount>=5_000_000;
    return `<div class="context-volume-card${large?' volume-large':''}"><span>Thanh lý ${side} · 5m</span>
      <strong>${esc(usd(amount))}${large?' · LỚN':''}</strong>
      <small class="${one>=1_000_000?'volume-large-text':''}">1m: ${esc(usd(one))}${one>=1_000_000?' · LỚN':''}</small>
      <small>${liq.ready===true?`${esc(num(long?liq.longBurst:liq.shortBurst))}× nền · nguồn đã đủ nền`
        :liq.transportReady===true?'Số đã quan sát; nền chưa đủ, vẫn ghi nhận từ ≥1 triệu USD/5m, chưa tính tăng đột biến':'Nguồn thiếu/mất kết nối; không suy ra ít thanh lý'}</small></div>`;
  }).join('')+`<p class="context-forecast-note${m.forecastData?.volumeRatio15m>=1.3?' volume-large-text':''}">Volume giao dịch BTC 15m: ${esc(usd(m.forecastData?.volume15mUsd))} · ${esc(num(m.forecastData?.volumeRatio15m))}× nền 60m trước đó. Tô đỏ khi ≥1,3×; không phải tiền thanh lý.</p>`;
  const forecastHistory=root.querySelector('[data-context-forecast-history]');
  if(forecastHistory) forecastHistory.innerHTML=(data.forecastHistory??[]).slice(0,8).map(row=>
    `<li>${esc(time(row.at))} · ${(row.forecast?.sides??[]).map(s=>`${esc(s.side)}: ${esc(BTC_LIQUIDATION_FORECAST_TIERS[s.tier]??'Dữ liệu cũ')}`).join(' / ')}</li>`
  ).join('') || '<li>Chưa có lịch sử cảnh báo sớm được lưu; không dựng lại từ tín hiệu cũ.</li>';
  root.querySelector('[data-context-reasons]').innerHTML = (data.reasons ?? ['Đang tải dữ liệu…'])
    .map(r => `<li>${esc(r)}</li>`).join('');
  if (data.lastEpisode) lastEpisode = data.lastEpisode;
  const episode = data.lastEpisode ?? lastEpisode;
  const episodeBox = root.querySelector('[data-context-episode]');
  if (episodeBox) {
    const recent = episode && ['LONG','SHORT'].includes(episode.side) && episode.at > 0
      && episode.at <= (data.evaluatedAt ?? Date.now()) && (data.evaluatedAt ?? Date.now()) - episode.at <= 60 * 60_000;
    episodeBox.hidden = !recent;
    episodeBox.innerHTML = recent ? `<strong class="${episode.peak>=5_000_000?'volume-large-text':''}">Đợt thanh lý ${esc(episode.side)} gần nhất · đỉnh ${esc(usd(episode.peak))}/5m</strong>
      <small>Đỉnh lúc ${esc(time(episode.peakAt ?? episode.at))} · lần cuối đạt ngưỡng ${esc(time(episode.at))}</small>
      <span>${episode.confirmed === true ? 'Đã từng xác nhận áp lực dây chuyền' : 'Đã ghi nhận tăng đột biến, chưa xác nhận dây chuyền'}.
      ${episode.historicalOnly === true ? 'Dấu vết lưu trước restart; không dùng xác nhận hiện tại.'
        : data.ready !== true ? 'BTC/ratio/OI hoặc nguồn thanh lý chưa đủ mới; không kết luận đã hết rủi ro.'
        : 'Số 5m hiện tại giảm không xóa đợt đã ghi nhận; không đồng nghĩa đang thanh lý mạnh hoặc đã hồi phục.'}</span>` : '';
  }
  root.querySelector('[data-context-metrics]').innerHTML = [
    ['Thanh lý LONG / SHORT · 5m', `${usd(liq.long5m)} / ${usd(liq.short5m)}`, `${num(liq.longBurst)}× / ${num(liq.shortBurst)}× nền trước · ${num(liq.symbols5m, 0)} coin`],
    ['Thanh lý LONG / SHORT · 1m', `${usd(liq.long1m)} / ${usd(liq.short1m)}`, 'SELL đóng LONG · BUY đóng SHORT'],
    ['BTC · nến đóng', `${num(m.price)} USDT`, `15m ${num(m.price15mPct)}% · mua chủ động ${num(m.takerBuy15m == null ? null : m.takerBuy15m * 100)}%`],
    ['Volume giao dịch BTC · 15m',usd(m.forecastData?.volume15mUsd),`${num(m.forecastData?.volumeRatio15m)}× nền 60m trước đó · không phải thanh lý`],
    ['OI BTC · 15m', `${num(m.oi?.change15mPct)}%`, `Lượng vị thế mở · ${time(m.oi?.at)}`],
    ['Ratio tài khoản LONG/SHORT', `${num(m.account?.value, 3)}×`, `Thay đổi 15m ${num(m.account?.change15mPct)}% · ${num(m.account?.samples, 0)} mẫu 5m`],
    ['Ratio vị thế top trader', `${num(m.position?.value, 3)}×`, `Thay đổi 15m ${num(m.position?.change15mPct)}%`],
  ].map(([label, value, note]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
  root.querySelector('[data-context-time]').textContent = `Cập nhật ${time(data.evaluatedAt)} (VN) · socket ${liq.socketState ?? '—'} · nền ${num((liq.coverageMs ?? 0) / 60_000, 0)}/35 phút${data.storageError ? ` · ${data.storageError}` : ''}`;
  root.querySelector('[data-context-history]').innerHTML = (data.history ?? []).slice(0, 8)
    .map(row => `<li><time>${esc(time(row.at))}</time> — ${esc(BTC_LIQUIDATION_STATES[row.state] ?? 'Dữ liệu cũ')}
      ${row.liquidation ? ` · LONG ${esc(usd(row.liquidation.long5m))} / SHORT ${esc(usd(row.liquidation.short5m))} · ${esc(num(row.liquidation.longBurst))}× / ${esc(num(row.liquidation.shortBurst))}× nền` : ''}</li>`).join('')
      || '<li>Chưa có chuyển trạng thái.</li>';
  whitelist?.decorate?.();
  forecastWhitelist?.decorate?.();
}

async function refresh() {
  if (busy || !root || document.hidden) return;
  busy = true;
  try {
    const response = await fetch('/api/btc-liquidation-context', { cache:'no-store', signal:AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('unavailable');
    renderBtcLiquidationContext(await response.json());
  } catch {
    renderBtcLiquidationContext({ state:'WAIT_DATA', reasons:['Không lấy được trạng thái thanh lý mới; đang kết nối lại.'] });
  } finally { busy = false; }
}
if (root) {
  void refresh(); setInterval(refresh, 10_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
}
