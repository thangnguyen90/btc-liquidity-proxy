// Offline SHORT research. Only reads public-data cache; no network or runtime imports.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stats} from './backtest-pump-entry-filters.mjs';
export const VERSION='PUMP_SHORT_FILTER_RESEARCH_V1_20261015';
export function shortSimulation(rows,index,endTime){
  const signal=rows[index],entryBar=rows[index+1];
  if(!signal||!entryBar||entryBar.t!==signal.t+60000)return {status:'NO_ENTRY_DATA'};
  const entry=entryBar.o,tp=entry*.98,sl=entry*1.06,deadline=signal.end+360*60000;
  const future=rows.slice(index+1).filter(r=>r.end<=deadline&&r.end<endTime);
  let exit=null,status=null,ambiguous=false;
  for(let j=0;j<future.length;j++){
    const r=future[j];if(j&&r.t-future[j-1].t!==60000)return {status:'DATA_GAP'};
    if(r.h>=sl){exit=Math.max(sl,r.o);status='SL';ambiguous=r.l<=tp;break;}
    if(r.l<=tp){exit=tp;status='TP';break;}
  }
  if(exit==null){if(!future.length||future.at(-1).end<deadline)return {status:'CENSORED'};exit=future.at(-1).c;status='TIMEOUT';}
  // Linear USDT short PnL / entry notional, NOT entry/exit - 1.
  const gross=(entry-exit)/entry*100;
  return {status,entry,entryAt:entryBar.t,exit,grossPricePct:gross,netPricePct:gross-.14,netRoe5x:(gross-.14)*5,ambiguousStopFirst:ambiguous};
}
const finite=Number.isFinite;
const sell=p=>finite(p.takerBuyPct)&&p.takerBuyPct<=45;
const loss=p=>p.forecastEligible&&p.price<p.avwap&&p.retracePct>=30;
export const FILTERS=[
  ['short_all','T0','SHORT ngay sau tín hiệu bơm',p=>true],
  ['short_rsi90','T0','SHORT ngay khi RSI ≥90',p=>finite(p.rsi14)&&p.rsi14>=90],
  ['short_sell55','T0','SHORT ngay khi taker bán ≥55%',sell],
  ['short_loss_vwap','T3','Sau3m mất AVWAP, trả ≥30%',loss],
  ['short_loss_sell','T3','Sau3m mất AVWAP, trả ≥30%, taker bán ≥55%',p=>loss(p)&&sell(p)],
  ['short_failed_breakout','T3','Sau3m mất AVWAP và breakout, taker bán ≥55%',p=>loss(p)&&p.price<p.breakout&&sell(p)],
  ['short_fade','T3','Sau3m FADE_RISK: trả ≥50%, dưới AVWAP, quote nến đỏ ≥55%',p=>p.state==='FADE_RISK'],
  ['short_keep_control','T3','Đối chứng: SHORT khi vẫn KEEP_HIGH',p=>p.state==='KEEP_HIGH'],
].map(([id,timing,label,test])=>({id,timing,label,test}));
export function analyze(data){
  const split=data.start+4*86400000;
  const train=data.events.filter(e=>e.at<split-363*60000),later=data.events.filter(e=>e.at>=split);
  const candidates=FILTERS.map(f=>({id:f.id,timing:f.timing,label:f.label,train:stats(train,f),later:stats(later,f),all:stats(data.events,f)}));
  const ranked=candidates.filter(c=>c.id!=='short_all'&&c.id!=='short_keep_control'&&c.train.n>=20&&c.train.coins>=10&&c.train.days>=3&&c.train.stressAvgNetRoe5x>0&&c.train.worstLeaveOneCoinOut>0).sort((a,b)=>b.train.stressAvgNetRoe5x-a.train.stressAvgNetRoe5x||a.id.localeCompare(b.id));
  return {version:VERSION,start:data.start,end:data.end,split,purgeMinutes:363,selectedId:ranked[0]?.id??null,
    selection:'Train N>=20, coins>=10, days>=3, stress avg>0, leave-one-coin-out avg>0; rank stress avg',
    laterPreviouslySeen:true,noLiveChanges:true,candidates};
}
function report(r){
  const num=v=>finite(v)?v.toFixed(2):'—';
  const lines=['# SHORT sau sóng bơm — nghiên cứu 7 ngày','',r.version,'',
    '08/10 20:00–15/10/2026 20:00 VN. Tái dùng 137 event pump ≥8%/15m từ universe 525 USDT perpetual hiện tại; có survivorship bias. Không phải backtest mọi tín hiệu SHORT hoặc exact Volume1m liền mạch live.',
    '8 giả thuyết cố định trước lần chạy, không quét lưới. T0 hoặc sau3 nến1m đóng, entry nextOPEN. SHORT TP giá−2%, SL+6%, leverage5x (grossROE +10%/−30%); timeout6h. Cùng nến hai mốc: SL trước; gap lên SL lấy open xấu hơn. Chi phí roundtrip0,14%giá; stress0,30%. Chưa funding/depth/latency/lot/cap/portfolio. Không PnL thật.',
    'Chỉ cửa sổ đủ6h, kể cả TP sớm của mẫu censored vẫn loại. Taker bán=100−taker mua quote5m. FADE_RISK dựa quote nến đỏ, không đồng nhất với taker bán. Nhánh T3 mất AVWAP loại mẫu đã chạm B0 hoặc H0+2% trước quyết định. Không đợi retest, không dùng thông tin tương lai để lọc.',
    'Train4ngày với purge6h03; phần3ngày sau đã được xem trong nghiên cứu trước, không phải kiểm định mù mới. Điều kiện chọn: '+r.selection+'.',
    '', '| Lọc | Entry | Toàn mẫu N/coin | TP/SL/timeout | Avg netROE % | Train N / Avg % | Sau N / Avg % | Sau stress % |',
    '|---|---|---:|---:|---:|---:|---:|---:|'];
  for(const c of r.candidates)lines.push('| '+[c.label,c.timing,c.all.n+'/'+c.all.coins,c.all.tp+'/'+c.all.sl+'/'+c.all.timeout,num(c.all.avgNetRoe5x),c.train.n+' / '+num(c.train.avgNetRoe5x),c.later.n+' / '+num(c.later.avgNetRoe5x),num(c.later.stressAvgNetRoe5x)].join(' | ')+' |');
  lines.push('','Ứng viên đạt tiêu chuẩn chọn trên train: '+(r.selectedId??'KHÔNG CÓ')+'. Không tự kích hoạt Binance; nhiều phép thử và mẫu nhỏ có thể tạo kết quả dương ngẫu nhiên. Không suy ra chắc chắn coin sẽ xả chỉ vì vừa bơm.','');
  for(const c of r.candidates){lines.push('## '+c.id,'','Theo ngày (toàn mẫu): '+JSON.stringify(c.all.daily),'',
    'Train worst leave-one-coin-out Avg: '+num(c.train.worstLeaveOneCoinOut)+'%.','',
    '| Coin | Tín hiệu VN | TP/SL/timeout | NetROE % |','|---|---|---|---:|');
    for(const x of c.all.rows)lines.push('| '+x.symbol+' | '+new Date(x.at+7*3600000).toISOString().slice(0,19).replace('T',' ')+' | '+x.trade.status+' | '+num(x.trade.netRoe5x)+' |');
    lines.push('');
  }
  return lines.join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'data/research/pump-path-week-20261015');
  const data=JSON.parse(fs.readFileSync(path.join(dir,'results.json'),'utf8'));
  const files=fs.readdirSync(path.join(dir,'raw')),cache=new Map();
  for(const e of data.events){
    if(!cache.has(e.symbol)){
      const byTime=new Map();
      for(const name of files.filter(n=>n.startsWith(encodeURIComponent(e.symbol)+'-1m-'))){
        for(const raw of JSON.parse(fs.readFileSync(path.join(dir,'raw',name),'utf8'))){
          const row={t:+raw[0],o:+raw[1],h:+raw[2],l:+raw[3],c:+raw[4],end:+raw[6]};
          if(byTime.has(row.t)&&JSON.stringify(byTime.get(row.t))!==JSON.stringify(row))throw Error('Conflicting cached bars');
          byTime.set(row.t,row);
        }
      }
      cache.set(e.symbol,[...byTime.values()].sort((a,b)=>a.t-b.t));
    }
    const rows=cache.get(e.symbol),i=rows.findIndex(r=>r.end===e.at);
    if(i<0)throw Error('Missing signal bar '+e.symbol);
    e.tradeAtSignal=shortSimulation(rows,i,data.end);
    const j=rows.findIndex(r=>r.end===e.after3m?.at);
    e.tradeAfter3m=j>=0?shortSimulation(rows,j,data.end):null;
  }
  const result=analyze(data);
  fs.writeFileSync(path.join(dir,'short-filters.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(root,'reports/pump-short-filters-20261015.md'),report(result));
  console.log(JSON.stringify({selectedId:result.selectedId,rows:result.candidates.map(c=>({id:c.id,n:c.all.n,coins:c.all.coins,tp:c.all.tp,sl:c.all.sl,timeout:c.all.timeout,avg:c.all.avgNetRoe5x,trainN:c.train.n,train:c.train.avgNetRoe5x,laterN:c.later.n,later:c.later.avgNetRoe5x}))},null,2));
}
