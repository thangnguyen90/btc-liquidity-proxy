const $=id=>document.getElementById(id);
let state=null,busy=false;
let authAttempted=false,authFailure='';
async function restoreSession(){
  authAttempted=true;
  try{
    const res=await fetch('/api/auth/env',{method:'POST',cache:'no-store'});
    const data=await res.json();
    if(!res.ok||!data.token)throw new Error(data.error??'Không tạo được phiên Orders.');
    localStorage.setItem('orders_token',data.token);authFailure='';return true;
  }catch(error){authFailure=error.message;return false;}
}
const drafts=new Map(),leverageDrafts=new Map(),tpDrafts=new Map();
// Display guidance only; never used as an entry gate or authorization.
const ema99Notes={
  NEAR_EMA_WATCH:'GẦN CHẠM EMA99 · THEO DÕI — Giá hồi gần EMA99 đang dốc xuống, chưa xác nhận râu reject. Chỉ theo dõi, không tự vào Binance.',
  REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH:'BƠM HỒI · BẬT HỤT EMA99 + RÂU REJECT — Đã có pump ≥8%, dump ≥5% rồi giá bơm hồi về gần EMA99. Đây là nhánh MARKET cũ, quyền và size cũ được giữ.',
  FIRST_PUMP_NEAR_REJECT_SHORT_WATCH:'BƠM LẦN ĐẦU TỪ NỀN · BẬT HỤT EMA99 + RÂU REJECT — Nền 24 nến còn gọn và chưa thấy chu kỳ pump–dump trong 96 nến. OBSERVE ONLY, chưa được bật Binance.',
  TOUCH_WATCH:'CHẠM EMA99 · THEO DÕI — Giá chạm hoặc vượt nhẹ EMA99, chưa xác nhận reject. Chỉ theo dõi, không tự vào Binance.',
  REJECTED_SHORT_WATCH:'ĐÃ REJECT · SHORT WATCH — Nến chạm/xuyên EMA99 rồi đóng dưới EMA với râu trên reject. Chờ phá đáy nến reject hoặc retest thất bại; loại này chưa nối Binance.',
  CLOSED_ABOVE_EMA_WATCH:'ĐÓNG TRÊN EMA99 · CHỜ PHÂN ĐỊNH — Thuộc bộ phát hiện SHORT, nhưng nến đã đóng trên EMA99 nên chưa xác nhận reject để SHORT. Chờ xem giá giữ được EMA hay mất lại; không tự coi là LONG. Chỉ theo dõi, không tự vào Binance.',
  NEAR_EMA_LONG_WATCH:'GẦN CHẠM EMA99 · LONG WATCH — Giá điều chỉnh gần EMA99 đang dốc lên, đáy chưa chạm EMA. Chưa xác nhận bật; chỉ theo dõi, không tự vào Binance.',
  NEAR_RECLAIM_LONG_WATCH:'BẬT TRƯỚC EMA99 · LONG WATCH — Đáy còn trên EMA99, nến đóng trên EMA và có râu dưới. Không coi là reclaim trực tiếp EMA; loại này chưa nối Binance.',
  RECLAIM_LONG_WATCH:'RÚT RÂU / LẤY LẠI EMA99 · LONG WATCH — Nến chạm/xuyên nhẹ EMA99 rồi đóng trên EMA với râu dưới. Có route LONG MARKET riêng sau nến reclaim khi bật và đủ điều kiện; không cần chờ nhãn xác nhận bật.',
  CLOSED_BELOW_EMA_LONG_WAIT:'ĐÓNG DƯỚI EMA99 · CHƯA LONG — Thuộc bộ phát hiện LONG nhưng nến đã đóng mất EMA99. Chưa xác nhận bật, không tự coi là SHORT; chỉ theo dõi, không tự vào Binance.',
  TOUCH_EMA_LONG_WATCH:'CHẠM EMA99 · LONG WATCH — Giá kiểm tra EMA99, chưa đủ xác nhận rút râu/lấy lại EMA. Chỉ theo dõi, không tự vào Binance.',
  BOUNCE_CONFIRMED_LONG_WATCH:'XÁC NHẬN BẬT · LONG WATCH — Sau nến rút râu, nến tiếp theo đóng vượt đỉnh hoặc retest EMA99 giữ được. Có route LONG MARKET riêng khi bật và đủ điều kiện; tuổi tín hiệu tính từ nến xác nhận, không cộng lệnh nếu đã có vị thế.'
};
const isEma99Route=r=>r.stream==='ema99-retest'||/ema99/i.test(`${r.source} ${r.label}`);
const otherRouteNotes={
  LIQSCAN_MAIN_KILL_UPPER_SWEEP_SHORT:'LIQSCAN MAIN KILL · SIÊU LỚN ≥50M — Quét xuyên hết vùng MAIN KILL phía trên rồi SHORT đảo chiều. Chỉ tín hiệu đỏ mới có quyền MARKET; không replay, không DCA.',
  LIQSCAN_MAIN_KILL_LOWER_SWEEP_LONG:'LIQSCAN MAIN KILL · SIÊU LỚN ≥50M — Quét xuyên hết vùng MAIN KILL phía dưới rồi LONG đảo chiều. Chỉ tín hiệu đỏ mới có quyền MARKET; không replay, không DCA.',
  LIQSCAN_HIGH_SCORE_ABOVE_LONG:'LIQSCAN >80 · THANH KHOẢN PHÍA TRÊN ÁP ĐẢO — LONG MARKET theo ký quỹ, đòn bẩy và TP đang lưu; SL −20% ROE. Chỉ nhận lần vượt ngưỡng hoặc đổi hướng mới, snapshot ≤90 giây, mark lệch tối đa 0,5%, cooldown 4 giờ và không DCA/replay.',
  LIQSCAN_HIGH_SCORE_BELOW_SHORT:'LIQSCAN >80 · THANH KHOẢN PHÍA DƯỚI ÁP ĐẢO — SHORT MARKET theo ký quỹ, đòn bẩy và TP đang lưu; SL −30% ROE. Chỉ nhận lần vượt ngưỡng hoặc đổi hướng mới, snapshot ≤90 giây, mark lệch tối đa 0,5%, cooldown 4 giờ và không DCA/replay.',
  EXTREME_PUMP_CLOSED:'NẾN BƠM SIÊU CAO 5m ĐÃ ĐÓNG · SHORT thử nghiệm — dùng ký quỹ, đòn bẩy và TP đang lưu của route; mark phải còn cách giá đánh giá tối đa 0,5%. SL giữ −30% ROE từ full-fill.',
  FOLLOW_REJECTION_LIVE:'GIÁ ĐANG TRẢ LẠI NHỊP BƠM · 5m LIVE — trong 1–3 nến sau spike, giá đã trả lại ≥50%. Dùng cấu hình route đang lưu khi tick ≤30 giây và mark còn sát giá đánh giá; 15m/closed-follow/quét hai đầu vẫn quan sát.',
  PEAK_ZONE_SHORT_WATCH:'VÙNG GẦN ĐỈNH · SHORT SỚM — nến bơm 5m đang chạy đã trả lại 15–25%, cách rolling high ≤2%, râu trên ≥20% và high không tăng ≥15 giây. Dùng cấu hình route đang lưu; SL giữ −30% ROE. Không replay nến bắt đầu trước lúc bật.',
  RETEST_LONG_READY:'4h/1h SẬP SÂU → ĐÁY SIDEWAY → RETEST LONG READY — dùng ký quỹ, đòn bẩy và TP đang lưu; SL giữ −30% ROE từ full-fill. Chỉ xác nhận 5m/15m mới ≤90 giây, không replay/DCA.',
  RETEST_SHORT_READY:'CASE NGƯỢC: 4h/1h BƠM SÂU → ĐỈNH SIDEWAY → RETEST SHORT READY — dùng ký quỹ, đòn bẩy và TP đang lưu; SL giữ −30% ROE từ full-fill. Chỉ xác nhận 5m/15m mới ≤90 giây, không replay/DCA.',
  HYBRID_UPPER_FIRST_SHORT_SQUEEZE_READY:'HYBRID LIQUIDITY · UPPER FIRST — CoinGlass có cụm hai phía; Binance 5m xác nhận impulse tăng còn giữ giá. LONG MARKET theo ký quỹ, đòn bẩy và TP đang lưu. Chỉ tín hiệu mới ≤7 phút, không DCA.',
  HYBRID_LOWER_FIRST_LONG_FLUSH_READY:'HYBRID LIQUIDITY · LOWER FIRST — CoinGlass có cụm hai phía; Binance 5m xác nhận impulse giảm còn giữ giá. SHORT MARKET theo ký quỹ, đòn bẩy và TP đang lưu. Chỉ tín hiệu mới ≤7 phút, không DCA.',
  BIG_CANDLE_PUMP_LONG:'TĂNG MẠNH · NẾN 15m ĐÃ ĐÓNG — thân nến tăng ít nhất 8%. LONG MARKET theo ký quỹ, đòn bẩy và TP đang lưu; SL cố định −20% ROE. Chỉ nhận nến đóng mới ≤90 giây, mark lệch giá phát tối đa 0,5%, không replay/DCA.',
};
const otherRouteProfile=r=>r.otherSettingsEditable===true?{
  margin:r.marginUsdt,leverage:r.leverage,tp:r.takeProfitRoePct,
  dynamic:r.takeProfitMode==='DYNAMIC_LIQUIDITY_TARGET',
  sl:r.source==='coin-horizon-sweep-transition'?25:r.source==='coinglass-hybrid-liquidity'?null:r.source==='big-candle-pump-15m'?20:r.source==='liqscan-high-score'&&r.side==='LONG'?20:30,
}:null;
const otherRouteNote=r=>r.otherSettingsEditable!==true?null:r.source==='coin-horizon-sweep-transition'
  ?r.label==='UPPER'
    ?'CHUYỂN SANG QUÉT LÊN · 4h/8h/12h đồng thuận UPPER — LONG MARKET theo ký quỹ và đòn bẩy đang lưu. TP động tại mép gần vùng thanh khoản trên hợp lệ, yêu cầu R:R ≥1; SL −25% ROE.'
    :'CHUYỂN SANG QUÉT XUỐNG · 4h/8h/12h đồng thuận LOWER — SHORT MARKET theo ký quỹ và đòn bẩy đang lưu. TP động tại mép gần vùng thanh khoản dưới hợp lệ, yêu cầu R:R ≥1; SL −25% ROE.'
  :r.source==='coin-level-entry-watch'
    ?r.side==='LONG'
      ?'COIN LEVEL · BREAKOUT 15m — LONG LIMIT cố định 3 USDT margin tại entry dự kiến khi mark cao hơn 0,15–5%, tín hiệu ≤90 giây, lệnh chờ tối đa 45 phút; nếu retest 5m đã đóng thì LONG MARKET theo margin route. Không replay/DCA; SL −30% ROE.'
      :'COIN LEVEL · BREAKDOWN 15m — SHORT LIMIT cố định 3 USDT margin tại entry dự kiến khi mark thấp hơn 0,15–5%, tín hiệu ≤90 giây, lệnh chờ tối đa 45 phút; nếu retest 5m đã đóng thì SHORT MARKET theo margin route. Không replay/DCA; SL −30% ROE.'
    :otherRouteNotes[r.label];
const watchGuidance={
 NEAR_EMA_WATCH:'Hồi gần EMA99 giảm, chưa reject.',TOUCH_WATCH:'Chạm EMA99, chưa xác nhận reject.',REJECTED_SHORT_WATCH:'Chạm/xuyên EMA99 rồi đóng dưới với râu reject.',
 CLOSED_ABOVE_EMA_WATCH:'Đóng trên EMA99, chưa reject. Nếu bật vẫn vào SHORT theo nhóm — không tự đổi LONG.',
 NEAR_EMA_LONG_WATCH:'Điều chỉnh gần EMA99 tăng, chưa xác nhận bật.',NEAR_RECLAIM_LONG_WATCH:'Rút râu trước EMA99, chưa chạm trực tiếp.',
 CLOSED_BELOW_EMA_LONG_WAIT:'Đóng dưới EMA99, chưa xác nhận bật. Nếu bật vẫn vào LONG theo nhóm — không tự đổi SHORT.',TOUCH_EMA_LONG_WATCH:'Kiểm tra EMA99, chưa đủ xác nhận reclaim.'
};
for(const [key,value] of Object.entries(watchGuidance))ema99Notes[key]=`${value} Có quyền tick và lưu ký quỹ riêng. ON cho phép MARKET theo hướng nhóm sau nến đóng, còn phải đạt tuổi≤90s, giá/TP/SL và không có vị thế. WATCH không phải xác nhận đảo chiều.`;
async function api(body){
  const r=await fetch('/api/auto-entry-controls',{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json','x-orders-token':localStorage.getItem('orders_token')??''},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();if(!r.ok)throw new Error(data.error??`HTTP ${r.status}`);return data;
}
function renderProtectionExclusions(){
  const symbols=Array.isArray(state?.protectionExclusions)?state.protectionExclusions:[];
  $('protection-exclusion-count').textContent=`${symbols.length} coin đang bỏ qua đến khi vị thế đóng`;
  $('protection-exclusion-add').disabled=busy||!state?.canEdit;
  $('protection-exclusion-symbol').disabled=busy||!state?.canEdit;
  const list=$('protection-exclusion-list');list.replaceChildren();
  if(!symbols.length){const empty=document.createElement('span');empty.className='muted';empty.textContent='Chưa có coin nào. Ngoại lệ mới sẽ chỉ tồn tại đến khi vòng vị thế của coin đó kết thúc.';list.append(empty);return;}
  for(const symbol of symbols){
    const chip=document.createElement('span');chip.className='protection-chip';
    const name=document.createElement('strong');name.textContent=`${symbol} · tự reset khi đóng`;
    const remove=document.createElement('button');remove.type='button';remove.textContent='Dùng lại tự động';remove.disabled=busy||!state.canEdit;
    remove.setAttribute('aria-label',`Dùng lại quản lý TP SL tự động cho ${symbol}`);
    remove.onclick=()=>{if(!confirm(`Cho ${symbol} dùng lại TP/SL và dời SL tự động? Bot không hủy lệnh đang có, nhưng các scanner có thể đặt bù protection còn thiếu ở lượt kế tiếp.`))return;void change({action:'protection-exclusion-remove',symbol});};
    chip.append(name,remove);list.append(chip);
  }
}
function render(){
  if(!state)return;
  $('master-status').textContent=state.enabled?'KHÓA TỔNG: ON':'ĐÃ TẮT MỞ LỆNH TỰ ĐỘNG';
  document.querySelector('.master').classList.toggle('on',state.enabled);
  const all=Object.values(state.routes);
  $('summary').textContent=`${all.filter(r=>r.enabled).length}/${all.length} loại bật ở trang này · ${state.enabled?'Vẫn phải đạt rule gốc':'Tất cả bị khóa bởi công tắc tổng'}`;
  $('master').textContent=state.enabled?'Tắt khóa tổng':'Bật khóa tổng';$('master').disabled=busy||!state.canEdit;
  $('auth').textContent=state.canEdit?'Đã xác thực Orders. Thay đổi được lưu qua restart.':'Chế độ xem. Đăng nhập tại Orders để bật/tắt từng loại; không nhập API key tại trang này.';
  if(!state.canEdit)$('auth').textContent=authFailure?`Chưa mở được quyền: ${authFailure} Bạn có thể thử lại hoặc đăng nhập Orders.`:'Phiên chỉnh sửa chưa có hoặc đã hết hạn. Bấm Mở quyền chỉnh sửa; không cần nhập API key tại đây.';
  $('unlock').hidden=state.canEdit;$('unlock').disabled=busy;
  const daily=state.dailyStats?.totals;
  $('daily-entries').textContent=daily?.entries??'—';$('daily-open').textContent=daily?.openEntries??'—';$('daily-closed').textContent=daily?.closedPositions??'—';
  const dailyPnl=Number(daily?.realizedPnlUsdt);$('daily-pnl').textContent=Number.isFinite(dailyPnl)?`${dailyPnl>=0?'+':''}${dailyPnl.toFixed(4)} USDT`:'—';
  $('daily-pnl').className=Number.isFinite(dailyPnl)?dailyPnl>0?'pnl-win':dailyPnl<0?'pnl-loss':'':'';
  $('daily-scope').textContent=state.dailyStats?`${state.dailyStats.date} · Entry thật khớp route, không đếm DCA · PnL net của vị thế đóng hôm nay.`:'Chưa đọc được audit Binance.';
  renderProtectionExclusions();
  const q=$('search').value.trim().toLowerCase(),side=$('side').value;
  const rows=all.filter(r=>(!side||r.side===side)&&`${r.label} ${r.title??''} ${r.source} ${r.stream} ${r.side} ${r.interval??''}`.toLowerCase().includes(q)).sort((a,b)=>a.source.localeCompare(b.source)||a.stream.localeCompare(b.stream)||a.side.localeCompare(b.side)||a.label.localeCompare(b.label)||String(a.interval??'').localeCompare(String(b.interval??'')));
  for(const id of ['routes','ema99-5m-routes','ema99-15m-routes'])$(id).replaceChildren();
  for(const r of rows){
    const tr=document.createElement('tr');
    const timeframe=r.interval?` · ${r.interval}`:'';
    for(const value of [r.label,`${r.stream}${timeframe}`,r.side]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    if(r.title){const title=document.createElement('small');title.textContent=r.title;tr.children[0].append(title);}
    if(r.stream==='ema99-retest'&&ema99Notes[r.label]){const note=document.createElement('small');note.className='signal-note';note.textContent=ema99Notes[r.label];tr.children[0].append(note);}
    const routeNote=otherRouteNote(r);if(routeNote){const note=document.createElement('small');note.className='signal-note';note.textContent=routeNote;tr.children[0].append(note);}
    const small=document.createElement('small');small.textContent=r.source;tr.children[1].append(small);tr.children[2].className=r.side;
    const td=document.createElement('td'),label=document.createElement('label'),check=document.createElement('input');
    check.type='checkbox';check.checked=r.enabled;check.disabled=busy||!state.canEdit||r.executable===false||r.source==='UNCLASSIFIED'||r.side==='UNKNOWN';
    check.setAttribute('aria-label',`${r.label} ${r.side} ${r.stream}${timeframe}`);
    label.className='toggle';label.append(check,document.createTextNode(r.enabled?'ON':'OFF'));td.append(label);tr.append(td);
    const effective=document.createElement('td');effective.textContent=r.executable===false?'CHỈ THEO DÕI · chưa nối Binance':state.enabled&&r.enabled?'ĐÃ GỠ KHÓA':'ĐANG KHÓA';effective.className=state.enabled&&r.enabled?'enabled':'off';tr.append(effective);
    const settingsEditable=r.ema99SettingsEditable===true||r.otherSettingsEditable===true;
    const settingsScope=r.ema99SettingsEditable===true?'EMA99':'luồng này';
    const size=document.createElement('td');
    if(settingsEditable){
      const leverage=Number(r.leverage)||5;
      const saved=document.createElement('small');saved.textContent=`Đã lưu: ${r.marginUsdt??'LỖI'} USDT margin × ${leverage}x · notional ${r.marginUsdt===null?'—':Number((r.marginUsdt*leverage).toFixed(2))} USDT`;
      const input=document.createElement('input');input.type='number';input.min='1';input.max='100';input.step='0.01';input.value=drafts.get(r.key)?.value??r.marginUsdt??'';input.disabled=busy||!state.canEdit;
      input.setAttribute('aria-label',`Ký quỹ USDT ${r.label}${timeframe}`);input.style.width='105px';
      input.oninput=()=>{const old=drafts.get(r.key);drafts.set(r.key,{value:input.value,expected:old?.expected??r.marginUsdt});};
      const save=document.createElement('button');save.textContent='Lưu';save.disabled=busy||!state.canEdit;
      save.onclick=async()=>{if(!input.reportValidity()||!input.value)return;const marginUsdt=Number(input.value),draft=drafts.get(r.key);
        if(!confirm(`Lưu ${r.label}${timeframe}: ${marginUsdt} USDT ký quỹ × ${leverage}x cho lệnh MỚI của ${settingsScope}? Không bật loại đang OFF, không sửa vị thế cũ.`))return;
        await change({action:'margin',key:r.key,marginUsdt,expectedMarginUsdt:draft?.expected??r.marginUsdt});};
      size.append(saved,input,document.createTextNode(' USDT '),save);
    }else size.textContent=r.executable===false?'— Chưa có entry thật':'Theo cấu hình luồng gốc';
    tr.append(size);
    const leverageCell=document.createElement('td');
    if(settingsEditable){
      const saved=document.createElement('small');saved.textContent=`Đã lưu: ${r.leverage??'LỖI'}x`;
      const input=document.createElement('input');input.type='number';input.min='1';input.max='125';input.step='1';input.value=leverageDrafts.get(r.key)?.value??r.leverage??'';input.disabled=busy||!state.canEdit;
      input.setAttribute('aria-label',`Đòn bẩy ${r.label}${timeframe}`);input.style.width='82px';
      input.oninput=()=>{const old=leverageDrafts.get(r.key);leverageDrafts.set(r.key,{value:input.value,expected:old?.expected??r.leverage});};
      const save=document.createElement('button');save.textContent='Lưu x';save.disabled=busy||!state.canEdit;
      save.onclick=async()=>{if(!input.reportValidity()||!input.value)return;const leverage=Number(input.value),draft=leverageDrafts.get(r.key);
        if(!confirm(`Lưu ${r.label}${timeframe}: đòn bẩy ${leverage}x cho lệnh MỚI của ${settingsScope}? Notional sẽ bằng margin × leverage; TP/SL ROE vẫn giữ đúng phần trăm đã cấu hình. Không sửa vị thế cũ.`))return;
        await change({action:'leverage',key:r.key,leverage,expectedLeverage:draft?.expected??r.leverage});};
      leverageCell.append(saved,input,document.createTextNode(' x '),save);
    }else leverageCell.textContent=r.executable===false?'— Chưa có entry thật':'Theo rule gốc của luồng';
    tr.append(leverageCell);
    const tp=document.createElement('td');
    if(r.takeProfitSettingsEditable===true){
      const saved=document.createElement('small');saved.textContent=`Đã lưu: +${r.takeProfitRoePct??'LỖI'}% ROE`;
      const input=document.createElement('input');input.type='number';input.min='1';input.max='100';input.step='0.01';input.value=tpDrafts.get(r.key)?.value??r.takeProfitRoePct??'';input.disabled=busy||!state.canEdit;
      input.setAttribute('aria-label',`TP ROE ${r.label}${timeframe}`);input.style.width='92px';
      input.oninput=()=>{const old=tpDrafts.get(r.key);tpDrafts.set(r.key,{value:input.value,expected:old?.expected??r.takeProfitRoePct});};
      const save=document.createElement('button');save.textContent='Lưu TP';save.disabled=busy||!state.canEdit;
      save.onclick=async()=>{if(!input.reportValidity()||!input.value)return;const takeProfitRoePct=Number(input.value),draft=tpDrafts.get(r.key);
        if(!confirm(`Lưu ${r.label}${timeframe}: TP +${takeProfitRoePct}% ROE cho lệnh MỚI của ${settingsScope}? Không bật loại đang OFF và không sửa TP/vị thế cũ.`))return;
        await change({action:'takeProfit',key:r.key,takeProfitRoePct,expectedTakeProfitRoePct:draft?.expected??r.takeProfitRoePct});};
      tp.append(saved,input,document.createTextNode(' % '),save);
    }else if(otherRouteProfile(r)){const p=otherRouteProfile(r);tp.textContent=p.dynamic?`TP động theo vùng thanh khoản gần nhất · R:R ≥1 · SL −${p.sl}% ROE từ full-fill`:p.sl==null?`TP +${p.tp}% ROE từ full-fill · không đặt SL riêng`:`TP +${p.tp}% · SL −${p.sl}% ROE từ full-fill`;}
    else tp.textContent=r.executable===false?'— Chưa có entry thật':'Theo rule gốc của luồng';
    tr.append(tp);
    const today=document.createElement('td'),stats=state.dailyStats?.routes?.[r.key];
    if(stats){const pnl=Number(stats.realizedPnlUsdt)||0;today.innerHTML=`<strong>${stats.entries} entry</strong><small>${stats.openEntries} còn mở · ${stats.closedPositions} đóng</small><small class="${pnl>0?'pnl-win':pnl<0?'pnl-loss':''}">${pnl>=0?'+':''}${pnl.toFixed(4)} USDT</small>`;}
    else today.innerHTML='<strong>0 entry</strong><small>0 đóng</small><small>+0.0000 USDT</small>';
    tr.append(today);
    check.addEventListener('change',()=>{const enabled=check.checked;const detail=r.source==='coin-horizon-sweep-transition'
      ?`Coin Horizon dùng ${r.marginUsdt} USDT margin ×${r.leverage}, TP động theo vùng thanh khoản hợp lệ gần nhất, R:R ≥1 và SL −25% ROE từ full-fill.`
      :r.otherSettingsEditable===true
        ?`Luồng này dùng ${r.marginUsdt} USDT margin ×${r.leverage}, TP +${r.takeProfitRoePct}% ROE đang lưu; rule SL gốc không đổi.`
        :'EMA99 dùng margin, đòn bẩy và TP% đang lưu của đúng route; SL LONG −20% / SHORT −30% ROE từ giá khớp.';
      if(enabled&&!confirm(`Cho phép loại ${r.label} / ${r.side} / ${r.stream}${timeframe} gửi lệnh mới khi khóa tổng ON và rule gốc đạt?\n${detail}`)){render();return;}void change({action:'route',key:r.key,enabled});});
    $(isEma99Route(r)&&['5m','15m'].includes(r.interval)?`ema99-${r.interval}-routes`:'routes').append(tr);
  }
  for(const id of ['ema99-5m-routes','ema99-15m-routes','routes'])if(!$(id).children.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=9;td.textContent='Không có loại phù hợp với bộ lọc trong nhóm này.';tr.append(td);$(id).append(tr);}
}
async function refresh(){if(busy||document.querySelector('.route-group input:focus,.protection-exclusions input:focus'))return;try{state=await api();if(!state.canEdit&&!authAttempted){busy=true;render();$('status').textContent='Đang xác thực phiên chỉnh sửa trên máy này…';try{if(await restoreSession())state=await api();}finally{busy=false;}}render();$('status').textContent=`Cập nhật ${new Date().toLocaleTimeString('vi-VN')}${drafts.size||leverageDrafts.size||tpDrafts.size?' · Có cấu hình chưa lưu':''}`;}catch(e){$('status').textContent=`Không đọc được trạng thái: ${e.message}`;}}
async function change(body){busy=true;render();try{state=await api(body);if(body.action==='margin')drafts.delete(body.key);if(body.action==='leverage')leverageDrafts.delete(body.key);if(body.action==='takeProfit')tpDrafts.delete(body.key);$('status').textContent=body.action==='protection-exclusion-add'?`Đã bỏ qua ${body.symbol.toUpperCase()} trong vòng vị thế này. Bot không hủy TP/SL hiện có; ngoại lệ tự xóa sau khi Binance xác nhận vị thế đóng.`:body.action==='protection-exclusion-remove'?`Đã cho ${body.symbol.toUpperCase()} dùng lại quản lý protection tự động ngay.`:body.action==='takeProfit'?'Đã lưu TP%. Chỉ lệnh mới của đúng route dùng giá trị này; không sửa lệnh đang mở.':body.action==='leverage'?'Đã lưu đòn bẩy. Chỉ lệnh mới của đúng route dùng giá trị này; không sửa vị thế, TP hoặc SL đang mở.':'Đã lưu. Chỉ áp dụng yêu cầu mở lệnh mới; không sửa vị thế đang mở.';}catch(e){$('status').textContent=e.message;}finally{busy=false;render();}}
$('pause').onclick=()=>change({action:'pauseAll'});
$('unlock').onclick=async()=>{if(busy)return;busy=true;render();$('status').textContent='Đang xác thực…';try{if(await restoreSession())state=await api();}catch(e){authFailure=e.message;}finally{busy=false;render();$('status').textContent=state?.canEdit?'Đã mở quyền tick và Lưu. Không bật thêm loại nào.':'Chưa xác thực được. Xem lý do phía trên.';}};
$('master').onclick=()=>{if(!state)return;if(!state.enabled&&!confirm('Bật khóa tổng? Chỉ các loại ON mới được đi tiếp qua rule gốc. Không bật lại các loại OFF.'))return;void change({action:'master',enabled:!state.enabled});};
$('protection-exclusion-form').onsubmit=event=>{event.preventDefault();const symbol=$('protection-exclusion-symbol').value.trim();if(!symbol)return;if(!confirm(`Bỏ qua quản lý TP/SL tự động cho ${symbol.toUpperCase()} trong một vòng vị thế?\n\nEntry vẫn có thể được mở. Bot không hủy TP/SL đang có, nhưng sẽ không tạo/bù/đổi TP/SL, không dời SL và không dùng Fast Wave. Ngoại lệ tự xóa sau khi Binance xác nhận vị thế đóng hẳn hoặc đảo chiều.`))return;$('protection-exclusion-symbol').value='';void change({action:'protection-exclusion-add',symbol});};
$('protection-exclusion-symbol').oninput=()=>{$('protection-exclusion-symbol').value=$('protection-exclusion-symbol').value.toUpperCase();};
$('search').oninput=render;$('side').onchange=render;$('refresh').onclick=refresh;
void refresh();setInterval(refresh,10000);
