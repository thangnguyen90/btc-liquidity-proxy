const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=2)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:n});
const time=v=>!Number.isFinite(Number(v))||!(v>0)?'—':new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
const reasons={RATIO_PENDING:'Đang nạp hoặc chờ lượt nạp ratio public; chưa được kết luận PASS/FAIL.',
  RATIO_UNAVAILABLE:'Không lấy được ratio public (lỗi, rate limit hoặc nghẽn). Không coi thiếu dữ liệu là PASS.',
  RATIO_DATA_MISSING:'Thiếu ratio hoặc hướng tín hiệu.',RATIO_DATA_INVALID:'Chuỗi ratio không hợp lệ, trùng hoặc sai timestamp.',
  RATIO_STALE:'Thiếu điểm ratio mới tại thời điểm nến tín hiệu đóng (yêu cầu tuổi dưới 5 phút).',
  RATIO_HISTORY_MISSING:'Chưa đủ điểm để kiểm tra nền đi ngang 30 phút rồi đổi dốc.',
  RATIO_WINDOW_GAP:'Chuỗi ratio bị đứt trong cửa sổ nền/đổi dốc.',
  RATIO_NOT_FLAT:'Không có nền 30 phút nào có biên ≤5% trong các cửa sổ được rule kiểm tra.',
  RATIO_WRONG_DIRECTION:'Ratio đi ngược hướng yêu cầu: LONG cần ratio giảm, SHORT cần ratio tăng.',
  RATIO_SHIFT_TOO_SMALL:'Có nền đi ngang nhưng mức đổi ratio chưa đạt 10% theo hướng yêu cầu.',
  RATIO_NOT_OUTSIDE_BASE:'Ratio mới nhất chưa vượt ra ngoài nền theo hướng yêu cầu.',
  RATIO_NOT_SAVED:'Không lưu ratio tại lần xử lý gốc. Không lấy ratio hôm nay để gán PASS/FAIL cho tín hiệu cũ.',
  RATIO_PROOF_INVALID:'Proof lưu không khớp signal ID/coin/khung/thời điểm hoặc kết quả rule; không dùng để kết luận.',
  RATIO_CACHE_EXPIRED:'Cache ratio đã hết hạn, đang chờ nạp mới; chưa kết luận PASS/FAIL.'};

export function buildRatioCurve(d={}) {
  const rows=d.rows??[],step=300000;
  if(!Array.isArray(rows)||rows.length<2||rows.length>20||rows.some((r,i)=>!Number.isFinite(r.timestamp)
    ||r.timestamp%step!==0||!Number.isFinite(r.longShortRatio)||r.longShortRatio<=0
    ||Number.isFinite(d.asOf)&&r.timestamp>d.asOf||i>0&&r.timestamp<=rows[i-1].timestamp))return '';
  const width=820,height=245,left=48,right=750,top=24,bottom=206,span=rows.at(-1).timestamp-rows[0].timestamp;
  const validBase=[d.baselineStartAt,d.baselineEndAt,d.baselineMedian,d.baselineLow,d.baselineHigh].every(Number.isFinite)
    &&d.baselineStartAt>=rows[0].timestamp&&d.baselineEndAt<=rows.at(-1).timestamp
    &&d.baselineEndAt>d.baselineStartAt&&d.baselineMedian>0;
  const threshold=validBase&&['LONG','SHORT'].includes(d.side)?d.baselineMedian*(d.side==='LONG'?.9:1.1):null;
  const values=[...rows.map(r=>r.longShortRatio),...(validBase?[d.baselineLow,d.baselineHigh]:[]),...(threshold?[threshold]:[])];
  const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.15,hi*.015),min=Math.max(0,lo-pad),max=hi+pad;
  const x=t=>left+(t-rows[0].timestamp)/span*(right-left),y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  const barWidth=Math.max(3,Math.min(24,step/span*(right-left)*.7));
  const grid=[0,50,100].map(p=>{const yy=bottom-p/100*(bottom-top);return `<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="#e4e8ed"/><text x="5" y="${yy+4}">${p}%</text><text x="${right+12}" y="${yy+4}">${num(min+p/100*(max-min),3)}</text>`;}).join('');
  const base=validBase?`<rect class="ratio-base-band" x="${x(d.baselineStartAt)}" y="${top}" width="${x(d.baselineEndAt)-x(d.baselineStartAt)}" height="${bottom-top}" fill="#ffd772" opacity=".2"/>` : '';
  const bars=rows.map(r=>{const long=r.longShortRatio/(1+r.longShortRatio)*100,short=100-long;
    const split=bottom-long/100*(bottom-top);return `<g class="ratio-account-bar" pointer-events="none"><rect x="${x(r.timestamp)-barWidth/2}" y="${top}" width="${barWidth}" height="${split-top}" fill="#f64e69"/><rect x="${x(r.timestamp)-barWidth/2}" y="${split}" width="${barWidth}" height="${bottom-split}" fill="#27c99b"/></g>`;}).join('');
  // Break at missing 5m points. Never join a gap into a fictitious continuous curve.
  const segments=[];for(const r of rows){if(!segments.length||r.timestamp-segments.at(-1).at(-1).timestamp!==step)segments.push([]);segments.at(-1).push(r);}
  const curve=segments.map(s=>`<polyline class="ratio-line" points="${s.map(r=>`${x(r.timestamp)},${y(r.longShortRatio)}`).join(' ')}" fill="none" stroke="#111827" stroke-width="2.5" pointer-events="none"/>`).join('');
  const medianLine=validBase?`<line class="ratio-median" x1="${x(d.baselineStartAt)}" x2="${x(d.baselineEndAt)}" y1="${y(d.baselineMedian)}" y2="${y(d.baselineMedian)}" stroke="#ae7411" stroke-dasharray="5 4"/>`:'';
  const gateLine=threshold?`<line class="ratio-threshold" x1="${x(d.baselineEndAt)}" x2="${right}" y1="${y(threshold)}" y2="${y(threshold)}" stroke="#376bbe" stroke-dasharray="6 4"/><text x="${right-3}" y="${y(threshold)-5}" text-anchor="end">${d.side==='LONG'?'−10%':'+10%'} nền: ${num(threshold,4)}</text>`:'';
  const points=rows.map(r=>{const long=r.longShortRatio/(1+r.longShortRatio)*100,readout=`${time(r.timestamp)} · Ratio ${num(r.longShortRatio,4)} · Long ${num(long)}% / Short ${num(100-long)}%${validBase?' · so với nền '+num((r.longShortRatio/d.baselineMedian-1)*100)+'%':''}`;
    return `<g class="ratio-point" tabindex="0" role="button" aria-label="${esc(readout)}" data-readout="${esc(readout)}"><rect x="${x(r.timestamp)-Math.max(barWidth/2,10)}" y="${top}" width="${Math.max(barWidth,20)}" height="${bottom-top}" fill="transparent"/><circle cx="${x(r.timestamp)}" cy="${y(r.longShortRatio)}" r="3.5" fill="#111827" pointer-events="none"/><title>${esc(readout)}</title></g>`;}).join('');
  return `<details class="ratio-curve"><summary>Chart kiểu Binance · % tài khoản LONG/SHORT & đường ratio 5m</summary>
    <div class="ratio-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cột tỷ lệ tài khoản Long Short và đường ratio top trader 5 phút">
    ${grid}${base}${bars}${medianLine}${gateLine}${curve}${points}
    <text x="${left}" y="15">% tài khoản</text><text x="${right}" y="15" text-anchor="end">Ratio · trục phải</text>
    <text x="${left}" y="234">${esc(time(rows[0].timestamp))}</text><text x="${right}" y="234" text-anchor="end">${esc(time(rows.at(-1).timestamp))}</text></svg></div>
    <div class="ratio-legend"><span class="ratio-long">■ Tài khoản Long %</span><span class="ratio-short">■ Tài khoản Short %</span><span>━ Đen: Long/Short ratio</span><span>Vàng: nền30m · gạch xanh: ngưỡng ±10%</span></div>
    <p class="muted">Cột % suy từ ratio đã làm tròn: Long = ratio/(1+ratio), Short = 1/(1+ratio); có thể lệch nhẹ số hiển thị sàn. Không phải tỷ lệ vị thế, OI hay giá.${validBase?` Nền tham chiếu: ${esc(time(d.baselineStartAt))} → ${esc(time(d.baselineEndAt))}.`:''}${d.state!=='PASS'?' Biểu đồ chỉ giải thích dữ liệu có sẵn, không tự cấp PASS.':''} Điện thoại: vuốt ngang xem cả chuỗi. Rê chuột/chạm cột để xem, chạm lại để tắt.</p>
    <div class="ratio-readout" role="status" hidden></div></details>`;
}

export function installRatioChartInteraction(root) {
  root.addEventListener('toggle',event=>{if(event.target.matches?.('.ratio-curve')&&event.target.open){
    const chart=event.target.querySelector('.ratio-chart');chart.scrollLeft=chart.scrollWidth-chart.clientWidth;
  }},true);
  const pointOf=event=>event.target.closest?.('.ratio-point');
  const show=(point,pin=false)=>{const curve=point.closest('.ratio-curve'),out=curve.querySelector('.ratio-readout');
    if(pin&&curve.dataset.pinnedReadout===point.dataset.readout){delete curve.dataset.pinnedReadout;out.hidden=true;return;}
    if(pin)curve.dataset.pinnedReadout=point.dataset.readout;
    out.textContent=point.dataset.readout;out.hidden=false;};
  root.addEventListener('click',event=>{const point=pointOf(event);if(point)show(point,true);});
  root.addEventListener('keydown',event=>{const point=pointOf(event);if(point&&['Enter',' '].includes(event.key)){event.preventDefault();show(point,true);}});
  root.addEventListener('pointerover',event=>{const point=pointOf(event);if(point&&event.pointerType!=='touch'&&!point.closest('.ratio-curve').dataset.pinnedReadout)show(point);});
  root.addEventListener('focusin',event=>{const point=pointOf(event);if(point&&!point.closest('.ratio-curve').dataset.pinnedReadout)show(point);});
  for(const type of ['pointerout','focusout'])root.addEventListener(type,event=>{
    const point=pointOf(event);if(!point||point.contains(event.relatedTarget))return;
    const curve=point.closest('.ratio-curve');if(!curve.dataset.pinnedReadout)curve.querySelector('.ratio-readout').hidden=true;
  });
}

export function renderRatioDiagnostics(row={}) {
  const d=row.ratioDiagnostics;
  if(!['RISING_VOLUME_RATIO_EXPLANATION_V1_20261011','RISING_VOLUME_RATIO_EXPLANATION_V2_BINANCE_CHART_20261012'].includes(d?.version))return '<section class="ratio-diagnostics unavailable"><strong>Ratio Long/Short top trader · tài khoản · 5m</strong><p>Runtime chưa cung cấp dữ liệu giải thích ratio cho mẫu này. Không suy ra PASS hoặc FAIL.</p></section>';
  const ready=['PASS','FAIL'].includes(d.state),pass=d.state==='PASS';
  const scope=d.entryScope?'Ratio PASS chỉ là một điều kiện; Binance vẫn cần route/guards và tín hiệu đầu đợt mới.':'OBSERVE ONLY · khung/loại này không thuộc MARKET Volume 1m liền mạch, kể cả ratio PASS.';
  const source=d.source==='AT_ENTRY'?`Ratio đã lưu tại lần xử lý đầu đợt · nến đóng ${time(d.asOf)}${d.asOf!==row.closedAt?' · KHÁC nến mới nhất đang hiển thị':''}`
    :d.source==='ATTEMPT_NO_RATIO'?'Nhật ký lần xử lý gốc · không lấy được snapshot ratio'
      :d.source==='HISTORY_MISSING'?'Snapshot lịch sử · không backfill ratio':`Kiểm tra khi xem · tới nến đóng ${time(d.asOf)} · KHÔNG phải proof pre-entry hay quyết định đã vào lệnh`;
  const mark=v=>v?'✓':'✗',shift=row.side==='SHORT'?'tăng':'giảm';
  return `<section class="ratio-diagnostics ${pass?'pass':ready?'fail':'unavailable'}">
    <div class="ratio-head"><strong>Ratio Long/Short top trader · tài khoản · 5m</strong><span class="ratio-badge">${pass?'RATIO PASS':ready?'RATIO KHÔNG PASS':'CHƯA ĐỦ DỮ LIỆU'}</span></div>
    <p class="ratio-source">${esc(source)} · Nạp ${esc(time(d.fetchedAt))}${d.pending?' · đang cập nhật':''}</p>
    ${ready?`<div class="ratio-metrics">
      <div><span>Ratio mới nhất</span><b>${num(d.latestRatio,4)}</b><small>${esc(time(d.latestAt))} · Long ${num(d.longAccountPct)}% / Short ${num(d.shortAccountPct)}% (suy từ ratio)</small></div>
      <div><span>Nền 30 phút · median</span><b>${num(d.baselineMedian,4)}</b><small>Min ${num(d.baselineLow,4)} → Max ${num(d.baselineHigh,4)}</small></div>
      <div class="${d.flat?'check-pass':'check-fail'}"><span>${mark(d.flat)} Biên nền ≤5%</span><b>${num(d.widthPct)}%</b><small>7 điểm ratio liên tục / 30 phút</small></div>
      <div class="${d.shift&&d.outside?'check-pass':'check-fail'}"><span>${mark(d.shift&&d.outside)} ${esc(row.side)} cần ${shift} ≥10%</span><b>${d.changePct>=0?'+':''}${num(d.changePct)}% / ${num(d.transitionMinutes,0)}m</b><small>Cửa sổ đổi dốc ≤30 phút · ${d.outside?'đã ra ngoài nền':'chưa ra ngoài nền'}</small></div>
    </div><p class="ratio-reason">${pass?'✓ Nền và đổi dốc đạt đúng gate ratio hiện tại.':`✗ ${esc(reasons[d.reason]??d.reason)}`}</p>${buildRatioCurve(d)}`
      :`<p class="ratio-reason">${esc(reasons[d.reason]??'Chưa đủ dữ liệu ratio; không kết luận PASS/FAIL.')}</p>${d.latestRatio!=null?`<p class="muted">Điểm có sẵn: ratio ${num(d.latestRatio,4)} · ${esc(time(d.latestAt))}; chưa đủ để kết luận gate.</p>`:''}${buildRatioCurve(d)}`}
    <p class="ratio-scope">${esc(scope)}</p></section>`;
}
