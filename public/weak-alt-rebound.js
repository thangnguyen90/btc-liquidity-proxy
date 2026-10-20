import {WEAK_ALT_VERSION,WEAK_ALT_LABELS,WEAK_ALT_THEMES,WEAK_ALT_STATES,weakAltLabel,weakAltKey,COUNTERTREND_VERSION,COUNTERTREND_LABELS,countertrendKey,COIN_RELATION_VERSION,COIN_RELATION_LABELS,coinRelationKey} from './weak-alt-rebound-model.js?v=20261014-phase-v2';
import {installLiveCardWhitelistUi} from './live-card-whitelist-ui.js';
import {structureView} from './btc-alt-structure-view.js?v=20261014-phase-v2';
import './opposite-liquidity-toast.js?v=20261013-btc-alt-v2';
const root=document.querySelector('#weak-alt-rebound');
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=2)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:n});
const time=v=>Number(v)>0?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
const target=new URLSearchParams(location.search).get('weakAlt');let busy=false,focused=false;
const whitelist=installLiveCardWhitelistUi({page:'weak-alt-rebound',label:'Trạng thái BTC/ALT · chỉ quan sát',root:document});
const counterWhitelist=installLiveCardWhitelistUi({page:'weak-alt-coin',label:'Coin ngược BTC · chỉ quan sát',root:document});
const relationWhitelist=installLiveCardWhitelistUi({page:'weak-alt-relation',label:'Toàn bộ nhóm coin/BTC · chỉ quan sát',root:document});
const structureWhitelist=installLiveCardWhitelistUi({page:'weak-alt-structure',label:'Nền riêng coin · chỉ quan sát',root:document});
const reactionWhitelist=installLiveCardWhitelistUi({page:'weak-alt-reaction',label:'Phản ứng nhịp BTC · chỉ quan sát',root:document});
const delivery={SENT:'Push đã gửi',PARTIAL:'Push một phần',QUIET_HOURS:'Giờ yên lặng · không gửi',DISABLED:'Push loại này đang tắt',STALE:'Quá cũ · không gửi',
  COOLDOWN:'Trạng thái này đã báo trong30phút',DOWNGRADE:'Hạ mức rủi ro · không gửi thêm',POSTING:'Đang gửi',NO_SUBSCRIBERS:'Chưa có thiết bị đăng ký',FAILED:'Gửi lỗi',UNKNOWN_DELIVERY:'Chưa rõ kết quả gửi',UNKNOWN_AFTER_RESTART:'Chưa rõ kết quả sau restart'};
export function renderWeakAlt(data={}){
  if(!root)return;const valid=data.version===WEAK_ALT_VERSION,ready=valid&&data.ready===true;
  const state=ready&&Object.hasOwn(WEAK_ALT_LABELS,data.state)?data.state:'WAIT_DATA';root.dataset.state=state;
  const theme=WEAK_ALT_THEMES[state];root.style.setProperty('--weak-accent',theme.accent);root.style.setProperty('--weak-bg',theme.bg);root.style.setProperty('--weak-ink',theme.ink);
  const key=weakAltKey(state);if(key)root.dataset.liveCardKey=key;else delete root.dataset.liveCardKey;
  root.dataset.binanceCardAvgRoe='';root.dataset.binanceCardAvgRoeEligible='false';
  root.querySelector('[data-weak-heading]').textContent=`${theme.emoji} Diễn biến15m/1h: ${WEAK_ALT_LABELS[state]}`;
  root.querySelector('[data-weak-legend]').innerHTML=WEAK_ALT_STATES.map(s=>`<span><i style="background:${WEAK_ALT_THEMES[s].accent}"></i>${esc(WEAK_ALT_LABELS[s])}</span>`).join('');
  const c=data.coverage??{},b=ready?data.breadth??{}:{},btc=ready?data.btc??{}:{};
  root.querySelector('[data-weak-status]').textContent=data.error??`${c.ready??0}/${c.universe??0} coin đủ nến 15m đồng bộ · beta hai chiều: ${c.betaReady??0} coin · đóng ${time(data.closedAt)} VN`;
  root.querySelector('[data-weak-enabled]').checked=data.enabled===true;root.querySelector('[data-weak-enabled]').disabled=Boolean(data.error)||!valid;
  root.querySelector('[data-weak-metrics]').innerHTML=[['BTC 15m / 1h',`${num(btc.ret15m)}% / ${num(btc.ret1h)}%`,'Nến 15m đóng, không dùng nến mở'],
    ['ALT dưới EMA20',`${num(b.belowEma20Pct)}%`,`Giảm 3h ${num(b.down3hPct)}% · tăng 1h/3h/6h ${num(b.alignedUpPct)}%`],
    ['Coin hồi yếu',`${num(b.recoveryWeakPct)}%`,`Volume hồi/giảm đủ mẫu: ${num(b.volumeReady,0)} coin · giữ đáy cao ${num(b.higherLowPct)}%`],
    ['Hồi yếu + nhạy BTC giảm',`${num(b.fragilePct)}%`,'Beta mỗi chiều ≥8 mẫu, BTC biến động ≥0,05%']]
    .concat([['ALT mạnh / yếu 1h',`${num(b.up1hPct)}% / ${num(b.down1hPct)}%`,'Coin tăng≥0,15% /giảm≤−0,15% trong1h'],
      ['ALT giữ giá / giảm nhanh',`${num(b.resilientPct)}% / ${num(b.fasterDownPct)}%`,'KhiBTC giảm: ≤0,5× /≥1,5× mức giảmBTC']])
    .map(([label,value,note])=>`<article><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
  root.querySelector('[data-weak-conditions]').innerHTML=ready?(data.conditions??[]).map(x=>`<li class="${x.met?'weak-met':''}">${x.met?'✓':'—'} ${esc(x.label)}</li>`).join('')
    :(data.reasons??['Runtime chưa có dữ liệu mới; không suy ra an toàn.']).map(x=>`<li>${esc(x)}</li>`).join('');
  root.querySelector('[data-weak-coins]').innerHTML=`<p>VOLhồi/giảm = mean quotevolume nến xanh /đỏ trong12 nến15m; thiếu≥2 nến mỗi loại → —. Beta là slope có điều kiện96 khoảng15m, không phải ratioLong/Short.</p><table><thead><tr><th>Coin</th><th>1h /3h%</th><th>EMA20</th><th>VOLhồi/giảm</th><th>Beta tăng/giảm</th><th>Mẫu tăng/giảm</th><th>Phân loại</th></tr></thead><tbody>`+
    (ready?data.coins??[]:[]).slice(0,30).map(x=>`<tr><td>${esc(x.symbol)}</td><td>${num(x.ret1h)} /${num(x.ret3h)}</td><td>${x.aboveEma20?'Trên':'Dưới'}</td><td>${num(x.volumeRecoveryRatio)}×</td><td>${num(x.betaUp)} /${num(x.betaDown)}</td><td>${num(x.upN,0)} /${num(x.downN,0)}</td><td>${x.fasterDown?'Giảm mạnh hơnBTC':x.resilient?'Giữ giá tốt':x.fragile?'Hồi yếu + nhạy giảm':x.recoveryWeak?'Hồi yếu':x.volumeRecoveryRatio==null?'Thiếu mẫu volume':!x.betaReady?'Thiếu mẫu beta':'Chưa đủ tổ hợp'}</td></tr>`).join('')+'</tbody></table>';
  const structure=root.querySelector('[data-weak-structure]');if(structure)structure.innerHTML=structureView(valid?data:{});
  const matrix=root.querySelector('[data-weak-relations]'),m=ready&&data.coinRelations?.version===COIN_RELATION_VERSION&&data.coinRelations.ready===true?data.coinRelations:null;
  if(matrix)matrix.innerHTML=`<h3>So sánh mức thay đổi1h/15m cũ · không phải xu hướng / phản ứng mới</h3>`+(!m?'<p>Chưa có danh sách đầy đủ từ runtime mới. Không gán nhóm từ JSON cũ hoặc mẫu thiếu.</p>':
    `<p>${num(m.total,0)}/${num(c.universe,0)} coin đủ dữ liệu · BTC ${esc(m.basis)} ${num(m.btcReturn)}%. Ưu tiên1h nếu |BTC1h|≥0,1%, còn lại15m nếu đạt ngưỡng; hai khung trái chiều vẫn ghi rõ cửa sổ, không trộn với xu hướng chung.</p>
    <p>Mạnh/yếu = <b>biên độ</b>, không phải xác suất hoặc điểm vào: mạnh khi |coin|≥max(0,15%; |BTC|), yếu khi nhỏ hơn. Đi ngang |coin|&lt;0,05%; BTC trung tính |BTC|&lt;0,1%. Coin giảm mạnh cùng BTC vẫn là coin đang giảm, không phải LONG. Không tự gọi ngược chiều là kill LONG/SHORT.</p>`+
    Object.entries(COIN_RELATION_LABELS).map(([group,label])=>{
      const coins=(m.coins??[]).filter(x=>x.group===group);
      const btcUp=m.btcReturn>=0,withBtc=group.startsWith('WITH_'),against=group.startsWith('AGAINST_');
      const direction=withBtc||against?`BTC ${btcUp?'↑ tăng':'↓ giảm'} → coin ${(withBtc?btcUp:!btcUp)?'↑ tăng':'↓ giảm'} · ${group.endsWith('_STRONG')?'biên độ coin đạt ngưỡng mạnh':'biên độ coin dưới ngưỡng mạnh'}`:group==='FLAT'?'Coin gần như đi ngang dù BTC có hướng.':'BTC chưa có hướng đủ rõ trong cửa sổ đang xét.';
      return `<section class="weak-relation-group" data-relation-group="${group}" data-live-card-key="${coinRelationKey(group)}" data-binance-card-avg-roe="" data-binance-card-avg-roe-eligible="false"><h4>${esc(label)} · ${num(m.counts?.[group]??0,0)} coin</h4><p>${esc(direction)}</p>`+
        (coins.length?`<div class="weak-alt-table-wrap"><table><thead><tr><th>Coin</th><th>Coin / BTC ${esc(m.basis)} %</th><th>Biên độ × BTC</th><th>Coin − BTC · điểm %</th><th>1h / 3h %</th><th>Giá / EMA20 / EMA50</th></tr></thead><tbody>`+
          coins.map(x=>`<tr data-relation-symbol="${esc(x.symbol)}"><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(x.symbol)}">${esc(x.symbol)}</a></td><td>${num(x.coinReturn)} / ${num(x.btcReturn)}</td><td>${num(x.amplitudeRatio)}×</td><td>${num(x.relativeStrengthPct)}</td><td>${num(x.ret1h)} / ${num(x.ret3h)}</td><td>${num(x.price,8)} / ${num(x.ema20,8)} / ${num(x.ema50,8)}</td></tr>`).join('')+'</tbody></table></div>':'<p>Chưa có coin thuộc nhóm ở snapshot này.</p>')+'</section>';
    }).join('')+'<small>Hiển thị toàn bộ coin đủ dữ liệu, không cắt top30. Counts là số coin, không phải PnL/AvgROE. Ngưỡng quan sát thử nghiệm; không thay đổi Binance.</small>');
  const counter=root.querySelector('[data-weak-countertrend]'),ct=ready&&data.countertrend?.version===COUNTERTREND_VERSION&&data.countertrend.ready===true?data.countertrend:null;
  if(counter)counter.innerHTML=`<h3>Coin giữ giá / tăng ngược khi BTC giảm</h3><p>Danh sách riêng, không bị nhóm ALT giảm mạnh che mất. Cùng cửa sổ với BTC (ưu tiên1h nếu BTC1h≤−0,1%). Ngưỡng thử nghiệm, chưa backtest lợi thế; không phải khuyến nghị LONG hoặc SHORT.</p>`+
    (!ct?'<p>Chưa có dữ liệu phân loại coin ngược BTC; mẫu cũ không được tự gán nhãn.</p>':!ct.btcDown?'<p>BTC chưa giảm≥0,1% ở15m hoặc1h; chưa xét nhóm này.</p>':
      `<p>${Object.entries(COUNTERTREND_LABELS).map(([tier,label])=>`${esc(label)}: ${num(ct.counts?.[tier]??0,0)}`).join(' · ')}</p>`+
      ((ct.coins??[]).map(x=>`<article class="weak-counter-coin" data-tier="${esc(x.tier)}" data-live-card-key="${esc(countertrendKey(x.tier))}" data-binance-card-avg-roe="" data-binance-card-avg-roe-eligible="false">
      <header><strong>${esc(x.symbol)} · ${esc(COUNTERTREND_LABELS[x.tier]??'Chưa phân loại')}</strong><a href="/coin-level-analysis?symbol=${encodeURIComponent(x.symbol)}">Xem coin</a></header>
      <p>BTC ${esc(x.basis)} ${num(x.btcReturn)}% → coin ${num(x.coinReturn)}% · vượt BTC ${num(x.relativeStrengthPct)} điểm % · coin1h ${num(x.ret1h)}% /3h ${num(x.ret3h)}%</p>
      <p>Giá đóng ${num(x.price,8)} · EMA20 ${num(x.ema20,8)} / EMA50 ${num(x.ema50,8)} · đáy cao hơn ${x.higherLow?'có':'chưa'}</p>
      <p>Volume1h/nền ${num(x.volumeRatio)}× · taker mua ${num(x.takerBuyPct)}% · OI15m ${x.oi?.covered?`${num(x.oi.changePct)}%`:'thiếu/gap'} · thanh lý SHORT ${x.shortLiquidation?.covered?`${num(x.shortLiquidation.usd,0)} USDT / ${num(x.shortLiquidation.count,0)} sự kiện mẫu`:'nguồn chưa phủ đủ, không xác nhận'}</p>
      <details><summary>Vì sao được phân loại?</summary><ul>${(x.conditions??[]).map(c=>`<li>${c.met?'✓':'—'} ${esc(c.label)}</li>`).join('')}</ul><p>${esc(x.note)}</p><small>Snapshot ${esc(time(x.closedAt))} VN · chỉ quan sát, chưa có real CLOSED AvgROE đối chiếu</small></details></article>`).join('')||'<p>Chưa có coin đủ điều kiện trong mẫu hiện tại.</p>'));
  const history=valid?[...(data.history??[])]:[];if(valid&&data.selected&&!history.some(e=>e.id===data.selected.id))history.unshift(data.selected);
  root.querySelector('[data-weak-history]').innerHTML=history.map(e=>`<article class="weak-alt-event${e.id===target?' selected':''}" style="border-color:${WEAK_ALT_THEMES[e.state]?.accent??'#64748b'}" data-weak-id="${esc(e.id)}"><header><strong>${esc(WEAK_ALT_THEMES[e.state]?.emoji??'⚪')} ${esc(weakAltLabel(e.state,e.version))}</strong><time>${esc(time(e.at))}</time></header>
    <p>BTC15m ${num(e.btc?.ret15m)}% /1h ${num(e.btc?.ret1h)}% · ALT dướiEMA20 ${num(e.breadth?.belowEma20Pct)}% · hồi yếu ${num(e.breadth?.recoveryWeakPct)}% · nhạy giảm ${num(e.breadth?.fragilePct)}%</p>
    <small>${esc(delivery[e.delivery?.status]??'Chưa gửi')} · ${esc(e.version??'phiên bản cũ')} · snapshot lịch sử, không phải cảnh báo live hoặc PnL</small><p><a href="/local-ai-trend-evaluation?weakAlt=${encodeURIComponent(e.id)}#weak-alt-rebound">Mở cảnh báo cụ thể</a></p></article>`).join('')||'<p>Chưa có trạng thái mới được lưu. Không dựng lại trạng thái từ lịch sử trước khi detector chạy.</p>';
  whitelist?.decorate?.();
  counterWhitelist?.decorate?.();
  relationWhitelist?.decorate?.();
  structureWhitelist?.decorate?.();reactionWhitelist?.decorate?.();
  if(target&&!focused){const row=[...root.querySelectorAll('[data-weak-id]')].find(x=>x.dataset.weakId===target);if(row){root.querySelector('[data-weak-history-details]').open=true;row.scrollIntoView({block:'center'});focused=true;}}
}
async function refresh(){if(!root||busy||document.hidden)return;busy=true;
  try{const r=await fetch(`/api/weak-alt-rebound${target?`?weakAlt=${encodeURIComponent(target)}`:''}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();renderWeakAlt(await r.json());}
  catch{renderWeakAlt({reasons:['Không tải được trạng thái mới; không dùng dữ liệu cũ để kết luận an toàn.']});}finally{busy=false;}}
if(root){root.querySelector('[data-weak-enabled]').addEventListener('change',async event=>{
  if(busy)return;busy=true;const toggle=event.target;toggle.disabled=true;
  try{const r=await fetch('/api/weak-alt-rebound',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:toggle.checked}),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();renderWeakAlt(await r.json());}
  catch{toggle.checked=!toggle.checked;root.querySelector('[data-weak-status]').textContent='Không lưu được lựa chọn Push; thử lại.';}
  finally{busy=false;toggle.disabled=false;}});
  void refresh();setInterval(refresh,10_000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});}
