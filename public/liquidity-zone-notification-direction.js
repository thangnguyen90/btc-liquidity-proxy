// Display frozen observations only. No fetch, orders, gates or inference from current prices.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tone=d=>d==='UP'?'up':d==='DOWN'?'down':d==='FLAT'||d==='INSIDE'?'flat':'unknown';
export function notificationDirectionClass(n){
  return n.kind==='RISK'?'':`direction-${tone(n.directionNote?.target)}`;
}
export function notificationDirectionHtml(n){
  if(n.kind==='RISK')return '';
  const note=n.directionNote;
  if(!note)return '<div class="notification-direction"><span class="direction-badge direction-unknown">? Chưa lưu hướng coin/BTC lúc phát</span></div>';
  const badge=(direction,label)=>`<span class="direction-badge direction-${tone(direction)}">${esc(label)}</span>`;
  const target=note.target==='UP'?'↑ Hướng tới vùng: lên':note.target==='DOWN'?'↓ Hướng tới vùng: xuống':note.target==='INSIDE'?'↔ Giá đang trong vùng':'? Hướng tới vùng: chưa rõ';
  const movement=(label,m)=>{
    const direction=['UP','DOWN','FLAT'].includes(m?.direction)?m.direction:'UNKNOWN';
    const pct=m?.changePct!=null&&Number.isFinite(Number(m.changePct))?Number(m.changePct):null;
    const suffix=pct==null?'':` ${pct>=0?'+':''}${pct.toFixed(2)}%`;
    return badge(direction,`${label}: ${direction==='UP'?'↑ tăng':direction==='DOWN'?'↓ giảm':direction==='FLAT'?'→ ngang':'? thiếu dữ liệu'}${suffix}`);
  };
  const btc=note.btc?.['15m']?.direction;
  const opposed=['UP','DOWN'].includes(note.target)&&['UP','DOWN'].includes(btc)&&note.target!==btc;
  const aligned=['UP','DOWN'].includes(note.target)&&btc===note.target;
  const alignment=opposed?'<span class="direction-badge direction-conflict">⚠ BTC 15m ngược hướng tới vùng</span>':aligned?'<span class="direction-badge direction-aligned">BTC 15m cùng hướng tới vùng</span>':'';
  return `<div class="notification-direction" aria-label="Hướng giá đã lưu lúc phát">${badge(note.target,target)}${movement('Coin 5m',note.coin?.['5m'])}${movement('Coin 15m',note.coin?.['15m'])}${movement('BTC 5m',note.btc?.['5m'])}${movement('BTC 15m',note.btc?.['15m'])}${alignment}</div><small class="direction-caption">Hướng lúc phát · 2 nến đã đóng · chỉ quan sát, không xác nhận entry</small>`;
}
