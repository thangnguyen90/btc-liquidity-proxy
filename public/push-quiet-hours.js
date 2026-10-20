import {normalizePushQuietHours} from './push-quiet-hours-model.js?v=20261012-quiet-v1';
for(const host of document.querySelectorAll('[data-push-quiet-hours]')) {
  host.classList.add('quiet-hours');
  host.innerHTML=`<h2>Giờ yên lặng · Web Push</h2>
    <p>Áp dụng chung cho mọi thiết bị đã đăng ký, kể cả khi đóng web. Giờ Việt Nam (UTC+7). Mặc định <b>00:00–06:00</b> mỗi ngày.</p>
    <form class="quiet-form"><label class="quiet-toggle"><input name="enabled" type="checkbox"> Bật giờ yên lặng</label>
      <label>Tắt Push từ<input name="start" type="time" required step="60" value="00:00"></label>
      <label>Nhận lại từ<input name="end" type="time" required step="60" value="06:00"></label>
      <button type="submit" disabled>Lưu giờ Push</button></form>
    <p class="quiet-status" role="status">Đang đọc lịch tắt Push…</p><p class="quiet-message" role="status" aria-live="polite"></p>
    <p class="quiet-note">Chỉ tắt Web Push, không đổi Discord, toast trong trang hoặc lệnh Binance. Không gửi dồn tín hiệu bị bỏ qua khi hết giờ yên lặng. Chọn giờ bắt đầu lớn hơn giờ kết thúc để đặt lịch qua đêm.</p>`;
  const form=host.querySelector('form'),enabled=form.elements.enabled,start=form.elements.start,end=form.elements.end;
  const button=form.querySelector('button'),status=host.querySelector('.quiet-status'),message=host.querySelector('.quiet-message');
  let dirty=false,busy=false,loaded=false;
  function apply(config) {
    const rule=normalizePushQuietHours(config.quietHours);
    if(!dirty){enabled.checked=rule.enabled;start.value=rule.start;end.value=rule.end;}
    status.textContent=!rule.enabled?'Giờ yên lặng đang TẮT · Push theo lựa chọn từng nhóm.'
      :`${config.quietHoursActive?'ĐANG TẠM NGỪNG PUSH':'Ngoài giờ yên lặng'} · lịch mỗi ngày ${rule.start}–${rule.end} (giờ Việt Nam).`;
    loaded=true;button.disabled=busy;
  }
  async function readConfig() {
    if(busy)return;
    try {
      const response=await fetch('/api/opposite-liquidity-web-push/config',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      apply(await response.json());
    }catch {
      status.textContent=loaded?'Không cập nhật được trạng thái giờ yên lặng; giữ lịch đã đọc.':'Runtime chưa cung cấp lịch Push; chưa thể lưu.';
    }
  }
  form.addEventListener('input',()=>{dirty=true;message.textContent='Có thay đổi chưa lưu.';message.classList.remove('error');});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!loaded)return;
    let rule;
    try {rule=normalizePushQuietHours({enabled:enabled.checked,start:start.value,end:end.value});}
    catch {message.textContent='Nhập giờ hợp lệ và chọn giờ bắt đầu khác giờ kết thúc.';message.classList.add('error');return;}
    busy=true;button.disabled=true;button.textContent='Đang lưu…';message.textContent='';
    try {
      const response=await fetch('/api/opposite-liquidity-web-push/quiet-hours',{method:'POST',
        headers:{'content-type':'application/json'},body:JSON.stringify(rule),signal:AbortSignal.timeout(15000)});
      const config=await response.json();if(!response.ok)throw Error(config.error||`HTTP ${response.status}`);
      dirty=false;apply(config);message.textContent='Đã lưu trên server · áp dụng cho mọi thiết bị.';message.classList.remove('error');
    }catch {message.textContent='Chưa xác nhận lưu thành công. Hãy tải lại lịch trước khi thử lại.';message.classList.add('error');}
    finally {busy=false;button.disabled=!loaded;button.textContent='Lưu giờ Push';}
  });
  void readConfig();setInterval(()=>{if(!document.hidden)void readConfig();},30000);
}
