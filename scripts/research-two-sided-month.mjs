// Public OHLCV research only; no account, server, notifier or trading imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const VERSION = 'TWO_SIDED_PRICE_PATH_RESEARCH_V1_20261018';
const H = 3600000;
export const bar = r => ({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5],end:+r[6],q:+r[7]});
const pct = (a,b) => (a/b-1)*100;
export function candidates(rows,start,end) {
  const out=[];
  for(let i=72;i<rows.length;i++) {
    const r=rows[i]; if(r.t<start || r.end>=end) continue;
    const history=rows.slice(i-72,i);
    if(history.some((b,j)=>b.t!==r.t-(72-j)*H)) continue;
    const p24=history.slice(-24), b24=p24.reduce((a,b)=>a.c<b.c?a:b), b72=history.reduce((a,b)=>a.c<b.c?a:b);
    const gain24=pct(r.h,b24.c),gain72=pct(r.h,b72.c);
    if(gain24<30 && gain72<60) continue;
    // Retrospective local maximum; never represent this as a real-time signal.
    const neighbours=rows.slice(Math.max(0,i-6),i+7);
    if(neighbours.some(b=>b.h>r.h || (b.h===r.h && b.t<r.t))) continue;
    const base=gain24>=30?b24:b72;
    const early=rows.slice(i-30,i-6),recent=rows.slice(i-6,i);
    out.push({symbol:null,peakHour:r.t,peak:r.h,base:base.c,baseAt:base.end,gain24,gain72,
      baseWindowHours:gain24>=30?24:72,volumePre6hX:recent.reduce((s,b)=>s+b.v,0)/6/(early.reduce((s,b)=>s+b.v,0)/24),
      peakHourQuoteVolume:r.q,peakHourVolumeX:r.v/(history.slice(-24).reduce((s,b)=>s+b.v,0)/24)});
  }
  return out;
}
export function evaluate(candidate,hours,minutes,end) {
  if(minutes.length!==60 || minutes.some((b,i)=>b.t!==candidate.peakHour+i*60000)) return {...candidate,status:'MINUTE_GAP'};
  const pi=minutes.findIndex(b=>b.h===Math.max(...minutes.map(x=>x.h)));
  const peak=minutes[pi].h,peakAt=minutes[pi].t;
  // Ignore low inside the peak minute: OHLC cannot establish high/low order.
  const after=[...minutes.slice(pi+1),...hours.filter(b=>b.t>=candidate.peakHour+H && b.end<end)];
  const horizon24=candidate.peakHour+24*H,horizon72=candidate.peakHour+72*H;
  const a24=after.filter(b=>b.end<horizon24),a72=after.filter(b=>b.end<horizon72);
  const low=xs=>xs.length?xs.reduce((a,b)=>a.l<b.l?a:b):null;
  const l24=low(a24),l72=low(a72);
  const drop24=l24?(1-l24.l/peak)*100:0,drop72=l72?(1-l72.l/peak)*100:0;
  const matched=drop24>=20||drop72>=30;
  const lowBar=l72;
  const threshold=after.find(b=>b.end<horizon24&&b.l<=peak*.8)??after.find(b=>b.end<horizon72&&b.l<=peak*.7);
  const baseTouch=after.find(b=>b.end<horizon72&&b.l<=candidate.base);
  const rebound=lowBar?after.filter(b=>b.t>lowBar.t && b.end<horizon72):[];
  const reboundHigh=rebound.length?Math.max(...rebound.map(b=>b.h)):null;
  const complete72=end>=horizon72 && a72.at(-1)?.end===horizon72-1;
  const expectedHours=Math.max(0,Math.min(71,Math.floor((end-candidate.peakHour)/H)-1));
  const futureHours=hours.filter(b=>b.t>=candidate.peakHour+H&&b.t<horizon72&&b.end<end);
  const gap=futureHours.length!==expectedHours || futureHours.some((b,j)=>b.t!==candidate.peakHour+(j+1)*H);
  return {...candidate,peak,peakAt,drop24,drop72,low24:l24?.l??null,low72:l72?.l??null,lowAt:lowBar?.t??null,
    thresholdAt:threshold?.t??null,thresholdEnd:threshold?.end??null,
    hoursToThreshold:threshold?Math.max(0,(threshold.t-peakAt-60000)/H):null,
    hoursToThresholdUpper:threshold?(threshold.end+1-peakAt)/H:null,
    baseTouched:Boolean(baseTouch),baseTouchAt:baseTouch?.t??null,
    returnedPumpPct:lowBar?(peak-lowBar.l)/(peak-candidate.base)*100:null,
    reboundPct:reboundHigh?pct(reboundHigh,lowBar.l):null,complete72,futureGap:gap,
    status:gap?'FUTURE_GAP':matched?'MATCH':complete72?'NO_MATCH':'PENDING_72H',
    liquidationEvidence:'NOT_AVAILABLE',peakMinuteOrderUnknown:true};
}
export function dedupe(events) {
  const kept=[];
  for(const e of [...events].sort((a,b)=>b.peak-a.peak)) {
    if(!kept.some(x=>x.symbol===e.symbol&&Math.abs(x.peakAt-e.peakAt)<72*H)) kept.push(e);
  }
  return kept.sort((a,b)=>b.drop24-a.drop24||b.gain24-a.gain24);
}

async function main() {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const dir=path.join(root,'data/research/two-sided-month-20261018');
  await fs.mkdir(path.join(dir,'raw'),{recursive:true});
  const read=async p=>{try{return JSON.parse(await fs.readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  const save=(p,x)=>fs.writeFile(p,JSON.stringify(x));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let weight=0,requests=0,last=0;
  async function get(endpoint,params={}) {
    for(let attempt=0;attempt<3;attempt++) {
      await sleep(Math.max(0,500-(Date.now()-last)));
      if(weight>1000){await sleep(61000-Date.now()%60000);weight=0;}
      last=Date.now();
      const u=new URL(endpoint,'https://fapi.binance.com');u.search=new URLSearchParams(params);
      let r;
      try{r=await fetch(u,{signal:AbortSignal.timeout(15000)});}catch(e){if(attempt===2)throw e;await sleep(2000);continue;}
      requests++;weight=+(r.headers.get('x-mbx-used-weight-1m')??weight);
      if([418,429].includes(r.status))throw Error(`RATE_LIMIT_${r.status}`);
      if(!r.ok){if(r.status>=500&&attempt<2){await sleep(2000);continue;}throw Error(`HTTP_${r.status}`);}
      return r.json();
    }
  }
  let meta=await read(path.join(dir,'meta.json'));
  if(!meta){const time=await get('/fapi/v1/time'),info=await get('/fapi/v1/exchangeInfo');
    const end=Math.floor(time.serverTime/H)*H;
    meta={version:VERSION,start:end-30*24*H,end,fetchedAt:Date.now(),symbols:info.symbols.filter(x=>x.quoteAsset==='USDT'&&['PERPETUAL','PERPETUAL_DELIVERING'].includes(x.contractType)&&x.status==='TRADING').map(x=>({symbol:x.symbol,onboardDate:x.onboardDate})).sort((a,b)=>a.symbol.localeCompare(b.symbol))};
    await save(path.join(dir,'meta.json'),meta);
  }
  async function loadBars(symbol,interval,from,to) {
    const file=path.join(dir,'raw',`${encodeURIComponent(symbol)}-${interval}-${from}-${to}.json`);
    let raw=await read(file);
    if(!raw){raw=await get('/fapi/v1/klines',{symbol,interval,startTime:String(from),endTime:String(to-1),limit:'1000'});if(!Array.isArray(raw))throw Error('INVALID_KLINES');await save(file,raw);}
    return raw.map(bar).filter(b=>b.t>=from&&b.end<to);
  }
  const coverage=[],errors=[],allCandidates=[],allEvents=[];const history=new Map();
  for(const [i,s] of meta.symbols.entries()) {
    try{const rows=await loadBars(s.symbol,'1h',meta.start-72*H,meta.end);history.set(s.symbol,rows);
      const expectedStart=Math.max(meta.start-72*H,Math.ceil(s.onboardDate/H)*H);
      coverage.push({...s,bars:rows.length,first:rows[0]?.t,last:rows.at(-1)?.end,gaps:rows.slice(1).filter((b,j)=>b.t!==rows[j].t+H).length,expectedStart});
      allCandidates.push(...candidates(rows,meta.start,meta.end).map(e=>({...e,symbol:s.symbol})));
    }catch(e){if(e.message.startsWith('RATE_LIMIT'))throw e;errors.push({symbol:s.symbol,stage:'hour',error:e.message});}
    if((i+1)%25===0)console.log(JSON.stringify({stage:'hour',done:i+1,total:meta.symbols.length,candidates:allCandidates.length,requests,weight}));
  }
  await save(path.join(dir,'screen.json'),{meta,coverage,errors,candidates:allCandidates});
  console.log(JSON.stringify({stage:'screen-complete',coins:coverage.length,candidates:allCandidates.length,errors:errors.length}));
  for(const [i,c] of allCandidates.entries()) {
    try{const mins=await loadBars(c.symbol,'1m',c.peakHour,c.peakHour+H);allEvents.push(evaluate(c,history.get(c.symbol),mins,meta.end));}
    catch(e){if(e.message.startsWith('RATE_LIMIT'))throw e;errors.push({symbol:c.symbol,stage:'minute',peakHour:c.peakHour,error:e.message});}
    if((i+1)%25===0)console.log(JSON.stringify({stage:'minute',done:i+1,total:allCandidates.length,matched:allEvents.filter(e=>e.status==='MATCH').length,requests,weight}));
  }
  const matches=dedupe(allEvents.filter(e=>e.status==='MATCH'));
  const result={...meta,coverage,errors,candidates:allEvents,matches,summary:{requested:meta.symbols.length,scanned:coverage.length,rawMatches:allEvents.filter(e=>e.status==='MATCH').length,events:matches.length,coins:new Set(matches.map(e=>e.symbol)).size,pending:allEvents.filter(e=>e.status==='PENDING_72H').length,baseTouches:matches.filter(e=>e.baseTouched).length,complete72:matches.filter(e=>e.complete72).length}};
  await save(path.join(dir,'results.json'),result);
  const time=t=>t==null?'—':new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});
  const f=n=>n==null?'—':n.toFixed(2);
  const header='| Coin | Đỉnh (VN) | Tăng 24h | Tăng 72h | Đỉnh → đáy 24h | Đỉnh → đáy 72h | Giờ đạt ngưỡng xả | Về chân | Vol giờ đỉnh × nền |';
  const table=xs=>header+'\n|---|---|---:|---:|---:|---:|---:|---|---:|\n'+xs.map(e=>`| ${e.symbol} | ${time(e.peakAt)} | +${f(e.gain24)}% | +${f(e.gain72)}% | −${f(e.drop24)}% | −${f(e.drop72)}% | ${f(e.hoursToThreshold)}–${f(e.hoursToThresholdUpper)} | ${e.baseTouched?'Có':'Chưa'} | ${f(e.peakHourVolumeX)}× |`).join('\n');
  const text=`# Quét bơm mạnh rồi xả sâu — 30 ngày\n\nVersion ${VERSION}. Từ ${time(meta.start)} đến ${time(meta.end)} (VN), chỉ nến đóng.\n\nQuét ${coverage.length}/${meta.symbols.length} hợp đồng USDT perpetual hiện còn giao dịch trên Binance, ${errors.length} lỗi. Tìm ${matches.length} cụm nhịp / ${result.summary.coins} coin; ${result.summary.baseTouches} nhịp chạm lại chân bơm. ${result.summary.complete72} nhịp đủ 72h sau đỉnh; các nhịp còn lại đã đạt ngưỡng trên phần dữ liệu quan sát nhưng còn có thể thay đổi độ sâu. ${result.summary.pending} đỉnh ứng viên chưa đạt ngưỡng xả và chưa đủ72h, không tính là không có mẫu.\n\n## Phương pháp\n\n- Quét toàn bộ danh sách hiện tại, không chọn trước theo tăng trưởng hay volume hôm nay. Có survivorship bias: coin đã delist không nằm trong danh sách. Cần72nến1h liên tục trước đỉnh, vì vậy không xét72h đầu của coin mới.\n- Pump: HIGH giờ đỉnh tăng≥30% so với CLOSE thấp nhất24h trước, hoặc≥60% so với CLOSE thấp nhất72h trước. Đây là mức bật từ nền, không phải phần trăm ticker24h.\n- Đỉnh là cực đại trong ±6nến1h có sẵn. Tải60nến1m trong giờ đỉnh để xác định phút đạt HIGH; không dùng LOW cùng phút đỉnh vì không biết thứ tự.\n- Xả: LOW sau phút đỉnh giảm≥20% trong cửa sổ24h, hoặc≥30% trong72h. Cửa sổ tính từ đầu giờ đỉnh, bảo thủ tối đa59phút. Sau giờ đỉnh dùng1h, thời gian chạm/đáy có sai số tối đa1h; không đo thanh lý.\n- Gộp đỉnh cùng coin cách nhau<72h: giữ giá đỉnh cao nhất trong các mẫu đạt điều kiện; không đếm lặp một vùng đỉnh. Xếp theo độ sụt24h.\n- Volume = volume COIN giờ đỉnh / trung bình24giờ trước; không chứng minh mua/bán mới. Về chân khi LOW sau đỉnh≤CLOSE nền đã chọn.\n- Dùng dữ liệu tương lai để nhận diện mẫu lịch sử: không phải backtest entry, không có PnL/WR/ROE, không khẳng định dự báo được đỉnh hoặc kill cả hai phía. Không có chuỗi thanh lý lịch sử đầy đủ để xác nhận điều đó.\n- JSON/cache nghiên cứu độc lập, không đọc/sửa trade cũ, không sửa gate/entry/size/SL/TP/WHITELIST, không restart hoặc gửi thông báo.\n\n## Danh sách đầy đủ\n\n${table(matches)}\n\n## Nguồn và tái lập\n\nDữ liệu công khai Binance /fapi/v1/exchangeInfo, /fapi/v1/time, /fapi/v1/klines; lưu raw, coverage, lỗi, ứng viên và kết quả tại data/research/two-sided-month-20261018. Chạy node scripts/research-two-sided-month.mjs dùng lại cache và cửa sổ đã khóa. [Binance Market Data](https://developers.binance.com/en/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data).\n\nLỗi: ${JSON.stringify(errors)}\n`;
  await fs.writeFile(path.join(root,'reports/two-sided-month-20261018.md'),text);
  const fields=['symbol','peakAt','peak','base','gain24','gain72','drop24','drop72','hoursToThreshold','hoursToThresholdUpper','baseTouched','peakHourVolumeX','complete72','reboundPct'];
  await fs.writeFile(path.join(root,'reports/two-sided-month-20261018.csv'),'\uFEFF'+fields.join(',')+'\n'+matches.map(e=>fields.map(k=>e[k]??'').join(',')).join('\n'));
  const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  function chart(e){const rows=history.get(e.symbol).filter(b=>b.t>=e.peakHour-72*H&&b.t<e.peakHour+72*H),lo=Math.min(...rows.map(b=>b.l)),hi=Math.max(...rows.map(b=>b.h));
    const x=i=>40+i*900/Math.max(1,rows.length-1),y=p=>230-(p-lo)/(hi-lo)*200;
    const candles=rows.map((b,i)=>`<line x1="${x(i)}" x2="${x(i)}" y1="${y(b.h)}" y2="${y(b.l)}" stroke="${b.c>=b.o?'#27d5a1':'#ff627e'}"/><line x1="${x(i)}" x2="${x(i)}" y1="${y(b.o)}" y2="${y(b.c)}" stroke-width="4" stroke="${b.c>=b.o?'#27d5a1':'#ff627e'}"/>`).join('');
    return `<article><h2>${esc(e.symbol)} · ${time(e.peakAt)}</h2><p>Tăng24h +${f(e.gain24)}% · giảm24h −${f(e.drop24)}% · giảm72h −${f(e.drop72)}% · ${e.baseTouched?'Đã về chân':'Chưa về chân'} · ${e.complete72?'Đủ72h':'Chưa đủ72h'}</p><svg viewBox="0 0 980 265" role="img" aria-label="Nến1h ${esc(e.symbol)}"><text x="40" y="17" fill="#d8e9f0">${hi.toPrecision(6)}</text>${candles}<line x1="40" x2="940" y1="${y(e.base)}" y2="${y(e.base)}" stroke="#ffcb59" stroke-dasharray="5 5"/><text x="40" y="250" fill="#d8e9f0">${time(rows[0].t)}</text><text x="680" y="250" fill="#d8e9f0">${time(rows.at(-1).t)}</text></svg><p>Đỉnh ${e.peak} → đáy72h ${e.low72}; nền ${e.base}. Đường vàng: nền trước bơm. Volume giờ đỉnh ${f(e.peakHourVolumeX)}×.</p></article>`;}
  await fs.writeFile(path.join(root,'reports/two-sided-month-20261018.html'),`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quét bơm xả 30 ngày</title><style>body{background:#09171e;color:#e3eef2;font:16px system-ui;margin:24px auto;max-width:1100px;padding:0 15px}article{background:#10252d;border:1px solid #31515b;border-radius:12px;padding:18px;margin:20px 0}svg{width:100%;background:#07151b}p{line-height:1.6;color:#adc6d0}h2{font-size:20px}</style><h1>Bơm mạnh rồi xả sâu · 30 ngày</h1><p>${time(meta.start)} → ${time(meta.end)} VN. ${coverage.length} hợp đồng, ${matches.length} nhịp/${result.summary.coins} coin. Mẫu hình giá lịch sử, chưa xác nhận thanh lý. Biểu đồ1h; dữ liệu quanh đỉnh đã đối chiếu1m. Xếp theo giảm24h. Ngưỡngpump30%/24h hoặc60%/72h; xả20%/24h hoặc30%/72h. Coin đã delist/72h đầu niêm yết không được bao phủ. Đây không phải kết quả giao dịch hay dự báo.</p>${matches.map(chart).join('')}</html>`);
  console.log(JSON.stringify({stage:'complete',...result.summary,errors,top:matches.slice(0,15),q:matches.filter(e=>e.symbol==='QUSDT')},null,2));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
