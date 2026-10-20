// Offline only. No application imports, network, credentials, or order calls.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const VERSION='PUMP_ENTRY_FILTER_RESEARCH_V1_20261015';
const finite=Number.isFinite;
export function inputs(e, timing){
  const p=timing==='T0'?e.atSignal:e.after3m;
  return p?{...p,breakout:e.breakout,volumeX:e.volumeX,gainPct:e.gainPct,
    btc1h:e.btcContext?.ready?e.btcContext.return1hPct:null,
    oi:e.derivatives?.oi?.ready?e.derivatives.oi.change15mPct:null,
    ratio:e.derivatives?.ratio?.ready?e.derivatives.ratio.change15mPct:null}:null;
}
const bounded=(v,a,b)=>finite(v)&&v>=a&&v<=b;
// Explicit small exploratory set, not a threshold grid. All inputs precede entry.
export const FILTERS=[
  ['all','T0','Không lọc',p=>true],
  ['volume20','T0','Volume 3–20×',p=>bounded(p.volumeX,3,20)],
  ['rsi90','T0','RSI14 ≤90',p=>bounded(p.rsi14,0,90)],
  ['ema8','T0','Giá cách EMA20 ≤8%',p=>bounded(p.ema20DistancePct,0,8)],
  ['buy55','T0','Taker mua ≥55%',p=>bounded(p.takerBuyPct,55,100)],
  ['oi_positive','T0','OI 15m tăng',p=>finite(p.oi)&&p.oi>0],
  ['ratio_falling','T0','Ratio tài khoản top trader 15m giảm',p=>finite(p.ratio)&&p.ratio<0],
  ['btc_nonnegative','T0','BTC 1h không giảm',p=>finite(p.btc1h)&&p.btc1h>=0],
  ['not_extended','T0','RSI ≤90 và cách EMA20 ≤8%',p=>bounded(p.rsi14,0,90)&&bounded(p.ema20DistancePct,0,8)],
  ['moderate_buy','T0','Volume 3–20×, taker mua ≥55%',p=>bounded(p.volumeX,3,20)&&bounded(p.takerBuyPct,55,100)],
  ['not_extended_buy','T0','RSI ≤90, cách EMA20 ≤8%, taker mua ≥55%',p=>bounded(p.rsi14,0,90)&&bounded(p.ema20DistancePct,0,8)&&bounded(p.takerBuyPct,55,100)],
  ['oi_ratio','T0','OI tăng và ratio giảm trong 15m',p=>finite(p.oi)&&p.oi>0&&finite(p.ratio)&&p.ratio<0],
  ['keep','T3','Giữ giá trên AVWAP/breakout, trả ≤30%',p=>p.state==='KEEP_HIGH'],
  ['keep_buy','T3','Giữ giá và taker mua ≥55%',p=>p.state==='KEEP_HIGH'&&bounded(p.takerBuyPct,55,100)],
  ['pullback_reclaim','T3','Trả 20–50%, trên AVWAP/breakout, taker mua ≥50%',p=>p.forecastEligible&&bounded(p.retracePct,20,50)&&p.price>p.avwap&&p.price>p.breakout&&bounded(p.takerBuyPct,50,100)],
  ['fade','T3','Xả ≥50%, dưới AVWAP, quote nến đỏ ≥55% (đối chứng)',p=>p.state==='FADE_RISK'],
].map(([id,timing,label,test])=>({id,timing,label,test}));
export function matches(e,f){const p=inputs(e,f.timing);return !!p&&f.test(p);}
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const day=t=>new Date(t+7*3600000).toISOString().slice(0,10);
export function stats(events,f){
  const eligible=events.filter(e=>matches(e,f));
  const rows=eligible.filter(e=>(f.timing==='T0'?e.path:e.pathAfter3m)?.complete)
    .map(e=>({symbol:e.symbol,at:e.at,trade:f.timing==='T0'?e.tradeAtSignal:e.tradeAfter3m}))
    .filter(r=>['TP','SL','TIMEOUT'].includes(r.trade?.status)&&finite(r.trade.netRoe5x));
  const values=rows.map(r=>r.trade.netRoe5x),coins=[...new Set(rows.map(r=>r.symbol))];
  const daily=Object.fromEntries([...new Set(rows.map(r=>day(r.at)))].map(d=>{
    const rs=rows.filter(r=>day(r.at)===d);return [d,{n:rs.length,avg:avg(rs.map(r=>r.trade.netRoe5x))}];
  }));
  const exclusions=coins.map(c=>avg(rows.filter(r=>r.symbol!==c).map(r=>r.trade.netRoe5x))).filter(finite);
  return {selected:eligible.length,n:rows.length,coins:coins.length,days:Object.keys(daily).length,
    tp:rows.filter(r=>r.trade.status==='TP').length,sl:rows.filter(r=>r.trade.status==='SL').length,
    timeout:rows.filter(r=>r.trade.status==='TIMEOUT').length,
    positivePct:values.length?100*values.filter(v=>v>0).length/values.length:null,
    avgNetRoe5x:avg(values),stressAvgNetRoe5x:avg(values.map(v=>v-.8)),
    worstLeaveOneCoinOut:exclusions.length?Math.min(...exclusions):null,daily,rows};
}
export function analyze(data){
  const split=data.start+4*86400000,purge=363*60000;
  const train=data.events.filter(e=>e.at<split-purge),later=data.events.filter(e=>e.at>=split);
  const candidates=FILTERS.map(f=>({id:f.id,timing:f.timing,label:f.label,
    train:stats(train,f),later:stats(later,f),all:stats(data.events,f)}));
  // Selection uses training only; later sample has already been seen in earlier research.
  const ranked=candidates.filter(c=>c.id!=='all'&&c.train.n>=20&&c.train.coins>=10&&c.train.days>=3&&c.train.stressAvgNetRoe5x>0&&c.train.worstLeaveOneCoinOut>0)
    .sort((a,b)=>b.train.stressAvgNetRoe5x-a.train.stressAvgNetRoe5x||a.id.localeCompare(b.id));
  return {version:VERSION,generatedAt:new Date().toISOString(),sourceVersion:data.version,
    split,purgeMinutes:363,selection:'Train N>=20, coins>=10, days>=3, stress avg>0, leave-one-coin-out avg>0; rank stress avg',
    selectedId:ranked[0]?.id??null,laterPreviouslySeen:true,noLiveChanges:true,candidates};
}
function report(r){
  const n=v=>finite(v)?v.toFixed(2):'—';
  const lines=['# Lọc entry sau sóng bơm — nghiên cứu bổ sung', '',r.version,'',
    'Dữ liệu 08/10 20:00–15/10/2026 20:00 VN. 16 ứng viên định trước cho lần chạy này, không quét lưới ngưỡng. Train 4 ngày, purge 6h03; 3 ngày sau đã được xem ở nghiên cứu trước, KHÔNG phải kiểm định mù mới.',
    'Chỉ mô phỏng LONG; cùng tập phát hiện pump ≥8%/15m của báo cáo gốc, KHÔNG phải toàn bộ rule Volume 1m liền mạch đang chạy. Không chứng minh thanh lý short thực tế.',
    'Next 1m OPEN sau T0 hoặc T0+3m; TP giá +2%, SL −6%, 5x; chỉ cửa sổ đủ 6h. Chi phí roundtrip 0,14% giá; stress 0,30% giá. Chưa funding/depth/lot/cap/latency; không PnL tài khoản, không đổi Binance.',
    'OI/ratio lấy as-of T0 (timestamp không phải bằng chứng thời điểm nhận); thiếu dữ liệu không PASS. T3 dùng AVWAP và nến đã đóng. Chiến lược pullback_reclaim không yêu cầu retest được xác nhận thêm.',
    '', '## So sánh đầy đủ (Avg = ROE ròng mỗi lệnh, không phải lợi nhuận tổng danh mục)', '',
    '| Lọc | Entry | Train N / coin | Train Avg % | 3 ngày sau N / coin | TP / SL / timeout | Sau Avg % | Sau stress % | Toàn mẫu Avg % |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|'];
  for(const c of r.candidates)lines.push('| '+[c.label,c.timing,c.train.n+' / '+c.train.coins,n(c.train.avgNetRoe5x),c.later.n+' / '+c.later.coins,c.later.tp+' / '+c.later.sl+' / '+c.later.timeout,n(c.later.avgNetRoe5x),n(c.later.stressAvgNetRoe5x),n(c.all.avgNetRoe5x)].join(' | ')+' |');
  lines.push('','## Chọn bằng train','',r.selection,'','Ứng viên được chọn: '+(r.selectedId??'KHÔNG CÓ')+'.',
    'Không được chọn lại dựa trên cột 3 ngày sau. Nhiều phép thử, mẫu nhỏ và đồng biến thị trường làm số dương dễ là ngẫu nhiên; cần forward/paper mới. Không tự kích hoạt lệnh thật.',
    '', '## Chi tiết từng ứng viên', '');
  for(const c of r.candidates){lines.push('### '+c.id+' — '+c.label,'',
    'Toàn mẫu: '+c.all.n+' lệnh / '+c.all.coins+' coin; tỉ lệ dương '+n(c.all.positivePct)+'%; train thấp nhất khi bỏ một coin: '+n(c.train.worstLeaveOneCoinOut)+'% ROE.',
    'Theo ngày VN (3 ngày sau): '+JSON.stringify(c.later.daily),'',
    '| Coin | Thời gian VN | Kết quả | Net ROE 5x % |','|---|---|---|---:|');
    for(const x of c.later.rows)lines.push('| '+x.symbol+' | '+new Date(x.at+7*3600000).toISOString().slice(0,19).replace('T',' ')+' | '+x.trade.status+' | '+n(x.trade.netRoe5x)+' |');
    lines.push('');
  }
  return lines.join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const data=JSON.parse(fs.readFileSync(path.join(root,'data/research/pump-path-week-20261015/results.json'),'utf8'));
  const result=analyze(data);
  fs.writeFileSync(path.join(root,'data/research/pump-path-week-20261015/entry-filters.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(root,'reports/pump-entry-filters-20261015.md'),report(result));
  console.log(JSON.stringify({selectedId:result.selectedId,rows:result.candidates.map(c=>({id:c.id,trainN:c.train.n,train:c.train.avgNetRoe5x,laterN:c.later.n,later:c.later.avgNetRoe5x,all:c.all.avgNetRoe5x}))},null,2));
}
