import {BTC_ALT_STRUCTURE_VERSION,BTC_ALT_STRUCTURE_LABELS,BTC_TREND_LABELS,btcAltStructureKey} from './btc-alt-structure-model.js?v=20261014-phase-v2';
import {BTC_ALT_REACTION_VERSION,BTC_ALT_REACTION_LABELS,btcAltReactionKey} from './btc-alt-reaction-model.js?v=20261014-phase-v2';
const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=2)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:n});
const time=x=>Number(x)>0?new Date(x).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
export function structureView(data={}){
 const m=data.coinStructure?.version===BTC_ALT_STRUCTURE_VERSION&&data.coinStructure.ready?data.coinStructure:null;
 if(!m)return '<h3>Xu hướng riêng của coin & phản ứng nhịp BTC</h3><p>Đang chờ dữ liệu nền và phản ứng đồng bộ. Không dùng cùng dấu1h để suy xu hướng.</p>';
 const r=data.btcReaction?.version===BTC_ALT_REACTION_VERSION?data.btcReaction:null,b=m.btc??{},c=r?.context??{};
 return `<h3>BTC nền: ${esc(BTC_TREND_LABELS[b.state]??'Chưa rõ')} · tách riêng nền coin và nhịp mới</h3>
 <p>BTC1h ${num(b.ret1h)}% /3h ${num(b.ret3h)}% /6h ${num(b.ret6h)}% /24h ${num(b.ret24h)}% · hiệu suất đường giá6h ${num(b.efficiency)} · ATR15m ${num(b.atr15mPct)}% · nền đóng ${time(b.closedAt)} VN.</p>
 <p><b>Không gọi là bám BTC chỉ vì cùng dấu1h.</b> Nền cần EMA20/50 và độ dốc đồng thuận, kèm nhánh6h/3h có hiệu suất đường giá hoặc nhánh nền24h đủ lớn theo ATR. Một đoạn6h nhiễu không tự xóa nền24h; tăng/giảm1h chỉ là thông tin thêm. Chưa backtest lợi thế và không chứng minh quan hệ nhân quả.</p>
 <p class="weak-reaction-status">${c.ready?`Nhịp BTC gần nhất: ${c.direction==='DOWN'?'↓ GIẢM':c.direction==='UP'?'↑ TĂNG':'CHƯA RÕ'} ${num(c.btcReturn,3)}% · cùng mốc ${time(c.anchorAt)} → ${time(c.endAt)} VN · ${c.mode==='LIVE_PREVIEW'?'LIVE TẠM THỜI · có thể đổi khi nến đóng':'NẾN1M ĐÃ ĐÓNG'} · ${num(r.coverage?.ready,0)}/${num(r.total,0)} coin đồng bộ.`:'Phản ứng1m chưa đủ dữ liệu; không thay bằng nền1h.'}</p>
 <details><summary>Vì sao phân loại nền BTC như vậy?</summary><ul>${(b.conditions??[]).map(x=>`<li>${x.met?'✓':'—'} ${esc(x.label)}</li>`).join('')}</ul><p>${esc(b.reason??'Đây là ngưỡng mô tả xu hướng, không phải dự báo.')}</p></details>`+
 Object.entries(BTC_ALT_STRUCTURE_LABELS).map(([group,label])=>{
  const rows=m.coins.filter(x=>x.group===group);
  return `<section class="weak-structure-group" data-structure-group="${group}" data-live-card-key="${btcAltStructureKey(group)}" data-binance-card-avg-roe="" data-binance-card-avg-roe-eligible="false"><h4>${esc(label)} · ${num(m.counts[group],0)} coin</h4>`+
   (rows.length?'<div class="weak-alt-table-wrap"><table><thead><tr><th>Coin / nền riêng</th><th>Nền coin1h /3h /6h /24h %</th><th>Phản ứng trong chính nhịp BTC</th><th>Giá từ cùng mốc → nay</th></tr></thead><tbody>'+rows.map(x=>{
    const p=x.profile??{},z=x.reaction??{},valid=r?.ready&&z.ready;
    return `<tr data-structure-symbol="${esc(x.symbol)}"><td><a href="/coin-level-analysis?symbol=${encodeURIComponent(x.symbol)}">${esc(x.symbol)}</a><p>${esc(x.relation)}</p><details><summary>Vì sao nền này?</summary><p>Hiệu suất6h ${num(p.efficiency)} · ATR15m ${num(p.atr15mPct)}% · giá/EMA20/EMA50 ${num(p.price,8)} /${num(p.ema20,8)} /${num(p.ema50,8)}</p><ul>${(p.conditions??[]).map(v=>`<li>${v.met?'✓':'—'} ${esc(v.label)}</li>`).join('')}</ul><p>${esc(p.reason??'')}</p></details></td>
    <td>${num(p.ret1h)} /${num(p.ret3h)} /${num(p.ret6h)} /${num(p.ret24h)}</td>
    <td><div data-reaction-symbol="${esc(x.symbol)}" data-live-card-key="${btcAltReactionKey(z.group)??''}" data-binance-card-avg-roe="" data-binance-card-avg-roe-eligible="false"><strong>${esc(BTC_ALT_REACTION_LABELS[z.group]??'Chưa đủ dữ liệu')}</strong><p>${valid?`BTC ${num(z.btcReturn,3)}% → coin ${num(z.coinReturn,3)}% · chênh ${num(z.relativeStrengthPct,3)} điểm%` :esc(z.reason??'Phản ứng1m chưa đủ dữ liệu.')}</p></div></td>
    <td>${valid?`${num(z.anchorPrice,8)} → ${num(z.price,8)}<p>${time(c.anchorAt)} → ${time(z.priceAt)} VN</p>`:'—'}</td></tr>`;
   }).join('')+'</tbody></table></div>':'<p>Chưa có coin thuộc nhóm.</p>')+'</section>';
 }).join('')+`<p>Toàn bộ ${num(m.total,0)} coin đang theo dõi; thiếu dữ liệu có nhóm riêng, không cắt30. Phản ứng đo cùng mốc BTC gần nhất trong15 phút; giữ giá |coin|&lt;0,1%. Không kết luận “nhiều SHORT” hoặc “kill SHORT” từ giá; cần ratio/OI/thanh lý riêng. Không thay đổi Binance/Push.</p>`;
}
