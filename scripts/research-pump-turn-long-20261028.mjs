// Offline research. Public OHLCV GET only, no account/order/notification clients.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {captureLongContext,LONG_CONTEXT_TITLES} from '../public/pump-turn-long-context-model.js';
import {M,H,mergeWindows,toBar,aggregate5m,summarize,blockBootstrap} from './research-pump-turn-near-20261028.mjs';
export const VERSION='PUMP_TURN_LONG_BACKTEST_V1_20261028';
export function simulateLong(e,rows,cutoff,variant='immediate'){
 let entryAt=(Math.floor(e.observedAt/M)+1)*M;
 if(variant==='wait_full_5m'){
  const b=aggregate5m(rows).find(b=>b.end>=e.observedAt&&b.end<cutoff&&b.end<e.observedAt+15*M&&b.c>e.zoneLow&&b.c/e.returnBase>=1.08&&b.q>=100000&&e.baseline>0&&b.q/e.baseline>=2&&b.buy/b.q>=.55&&b.h>b.l&&(b.c-b.l)/(b.h-b.l)>=.7);
  if(!b)return {complete:false,status:e.observedAt+15*M>cutoff?'CONFIRMATION_CENSORED':'NO_CONFIRMATION'};
  entryAt=b.end+1;
 }
 const bar=rows.find(b=>b.t===entryAt);if(!bar)return {complete:false,status:'NO_ENTRY_DATA'};
 const entry=bar.o,tp=entry*1.02,sl=entry*.94,deadline=entryAt+6*H;
 const bs=rows.filter(b=>b.t>=entryAt&&b.t<deadline&&b.end<cutoff);
 if(bs.some((b,i)=>b.t!==entryAt+i*M))return {complete:false,status:'DATA_GAP',entryAt};
 let status=null,exit=null,exitAt=null,ambiguous=false;
 for(const b of bs){const hitSL=b.l<=sl,hitTP=b.h>=tp;
  if(hitSL){status='SL';exit=Math.min(sl,b.o);exitAt=b.end;ambiguous=hitTP;break;}
  if(hitTP){status='TP';exit=tp;exitAt=b.end;break;}
 }
 if(!status&&bs.length===360){status='TIMEOUT';exit=bs.at(-1).c;exitAt=bs.at(-1).end;}
 const gross=exit==null?null:(exit/entry-1)*100;
 return {complete:status!=null,status:status??'CENSORED',entryAt,entry,tp,sl,exit,exitAt,ambiguous,waitMinutes:(entryAt-e.observedAt)/M,netRoe5x:gross==null?null:(gross-.14)*5,stressRoe5x:gross==null?null:(gross-.30)*5};
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'data/research/pump-turn-long-backtest-20261028');
const read=async p=>{try{return JSON.parse(await fs.readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function main(){
 await fs.mkdir(path.join(dir,'raw'),{recursive:true});let snapshot=await read(path.join(dir,'cohort.json'));
 if(!snapshot){const w=await read(path.join(root,'data/pump-turn-watch.json'));snapshot={version:VERSION,cutoff:Date.now(),events:[...new Map(w.history.filter(e=>e.side==='LONG').map(e=>[e.id,e])).values()].sort((a,b)=>a.observedAt-b.observedAt),historyCap:1000};await fs.writeFile(path.join(dir,'cohort.json'),JSON.stringify(snapshot));}
 console.log(JSON.stringify({stage:'frozen',events:snapshot.events.length,cutoff:snapshot.cutoff}));
 // Reuse already downloaded SHORT research candles, without changing that cohort.
 const oldDir=path.join(root,'data/research/pump-turn-near-eval-20261028/raw'),store=new Map();
 for(const cacheDir of [oldDir,path.join(dir,'raw')])for(const file of await fs.readdir(cacheDir)){let raw=await read(path.join(cacheDir,file));raw=raw?.[0]?.t!=null?raw.map(b=>[b.t,b.o,b.h,b.l,b.c,b.v,b.end,b.q,0,0,b.buy]):raw;if(!Array.isArray(raw))continue;const symbol=decodeURIComponent(file.split('-1m-')[0]);const m=store.get(symbol)??new Map();for(const r of raw)m.set(+r[0],toBar(r));store.set(symbol,m);}
 let requests=0,reused=0,downloaded=0;const symbols=[...new Set(snapshot.events.map(e=>e.symbol))];
 for(const [index,symbol] of symbols.entries()){
  const ev=snapshot.events.filter(e=>e.symbol===symbol),map=store.get(symbol)??new Map();
  const windows=mergeWindows(ev.map(e=>[Math.floor(e.observedAt/(5*M))*5*M,Math.min(Math.ceil(e.observedAt/M)*M+6*H+16*M,Math.floor(snapshot.cutoff/M)*M)]));
  for(const [from,to]of windows){const file=path.join(dir,'raw',encodeURIComponent(symbol)+'-1m-'+from+'-'+to+'.json');const cache=await read(file);if(cache)for(const b of cache)map.set(b.t,b);
   const missing=[];for(let t=from;t<to;t+=M)if(!map.has(t))missing.push([t,t+M]);
   if(!missing.length){reused++;continue;}
   for(const [start,end]of mergeWindows(missing)){
    let cursor=start;while(cursor<end){
     await new Promise(r=>setTimeout(r,800));
     const url='https://fapi.binance.com/fapi/v1/klines?'+new URLSearchParams({symbol,interval:'1m',startTime:String(cursor),endTime:String(end-1),limit:'1500'});
     const res=await fetch(url,{signal:AbortSignal.timeout(20000)});requests++;if(!res.ok)throw Error('PUBLIC_KLINES_HTTP_'+res.status+'_'+symbol);
     const raw=await res.json();if(!Array.isArray(raw)||!raw.length)break;
     if(+raw[0][0]<cursor||raw.some((r,i)=>i&&+r[0]<=+raw[i-1][0]))throw Error('INVALID_KLINE_ORDER');
     for(const r of raw){const b=toBar(r);if(![b.t,b.end,b.o,b.h,b.l,b.c,b.q,b.buy].every(Number.isFinite)||b.end!==b.t+M-1||Math.min(b.o,b.h,b.l,b.c)<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c))throw Error('INVALID_KLINE');map.set(b.t,b);downloaded++;}
     cursor=+raw.at(-1)[0]+M;if(raw.length<1500)break;
    }
   }
   await fs.writeFile(file,JSON.stringify([...map.values()].filter(b=>b.t>=from&&b.t<to).sort((a,b)=>a.t-b.t)));
  }
  store.set(symbol,map);if(index%5===0||index===symbols.length-1)console.log(JSON.stringify({stage:'candles',done:index+1,total:symbols.length,requests,reused}));
 }
 const records=snapshot.events.map(e=>{const classification=captureLongContext(e);const rows=[...(store.get(e.symbol)?.values()??[])].sort((a,b)=>a.t-b.t);return {...e,researchClassification:classification,results:Object.fromEntries(['immediate','wait_full_5m'].map(v=>[v,simulateLong(e,rows,snapshot.cutoff,v)]))};});
 const primary=records.filter(e=>(Math.floor(e.observedAt/M)+1)*M+6*H+15*M<=snapshot.cutoff),splitAt=primary[Math.floor(primary.length*.7)]?.observedAt;
 const stats=xs=>{const s=summarize(xs);return {...s,ci:xs.filter(e=>e.results.immediate.complete).length>=30?blockBootstrap(xs):null};};
 const groups=Object.fromEntries(Object.keys(LONG_CONTEXT_TITLES).map(label=>{const xs=primary.filter(e=>e.researchClassification.label===label);const firstByHour=new Set();const independent=xs.filter(e=>{const k=e.symbol+':'+Math.floor(e.observedAt/(6*H));if(firstByHour.has(k))return false;firstByHour.add(k);return true;});const coins=[...new Set(xs.map(e=>e.symbol))].map(symbol=>({symbol,sum:xs.filter(e=>e.symbol===symbol).reduce((s,e)=>s+(e.results.immediate.netRoe5x??0),0)})).sort((a,b)=>b.sum-a.sum);return [label,{title:LONG_CONTEXT_TITLES[label],all:stats(xs),first70:stats(xs.filter(e=>e.observedAt<splitAt)),last30:stats(xs.filter(e=>e.observedAt>=splitAt)),firstCoin6h:stats(independent),withoutTopCoin:stats(xs.filter(e=>e.symbol!==coins[0]?.symbol)),topCoin:coins[0],confirmation:summarize(xs,'wait_full_5m')}];}));
 const days=Object.fromEntries([...new Set(primary.map(e=>new Date(e.observedAt+7*H).toISOString().slice(0,10)))].map(d=>[d,stats(primary.filter(e=>new Date(e.observedAt+7*H).toISOString().slice(0,10)===d))]));
 const summary={version:VERSION,at:new Date().toISOString(),cutoff:snapshot.cutoff,cohortHash:hash(snapshot),events:records.length,symbols:symbols.length,range:[records[0]?.observedAt,records.at(-1)?.observedAt],primary:primary.length,recentExcluded:records.length-primary.length,splitAt,acquisition:{requests,reused,downloaded},baseline:stats(primary),confirmation:summarize(primary,'wait_full_5m'),groups,days};
 await fs.writeFile(path.join(dir,'results.json'),JSON.stringify(records));await fs.writeFile(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));
 const f=x=>Number.isFinite(x)?x.toFixed(2):'—',vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'});
 const row=(title,s)=>'| '+[title,s.n,s.winPct==null?'—':f(s.winPct)+'%',s.tp+'/'+s.sl+'/'+s.timeout,f(s.avgNetRoe5x)+'%',f(s.avgStressRoe5x)+'%',f(s.profitFactor)].join(' | ')+' |';
 const lines=['# Backtest GẦN VÙNG LONG và phân loại V1','', 'Khóa dữ liệu '+vn(snapshot.cutoff)+' VN. '+records.length+' cảnh báo / '+symbols.length+' coin, từ '+vn(summary.range[0])+' đến '+vn(summary.range[1])+'. Cohort chính '+primary.length+' cảnh báo đủ 6h15m; loại '+summary.recentExcluded+' mẫu mới theo thời gian, không chọn theo kết quả.','',
 'Nhãn tính hồi cứu bằng đúng classifier LONG V1 từ snapshot gốc trước entry. Không sửa history live. Ngưỡng V1 giữ nguyên, không tối ưu theo kết quả; không phải dữ liệu ngoài mẫu độc lập. History chỉ giữ 1.000 LONG/SHORT chung, có thiên lệch do cắt lịch sử.','',
 'Giả định: vào OPEN phút đầy đủ kế tiếp; LONG TP +2% giá, SL −6%, 5×, timeout6h. Chi phí hai chiều0,14% giá; stress0,30%; funding/spread/orderbook/latency chưa mô phỏng. SL trước nếu TP/SL cùng phút; SL gap dùng giá OPEN bất lợi, TP gap chỉ mức TP. Đây là mô phỏng lệnh độc lập, không phải PnL tài khoản hay route LONG đang bật.','',
 '| Nhóm | N hoàn tất | Thắng ròng | TP/SL/hết giờ | ROE TB net5× | Stress5× | PF |','|---|---:|---:|---|---:|---:|---:|',row('Toàn bộ',summary.baseline),...Object.values(groups).map(g=>row(g.title,g.all)),'',
 '## Kiểm tra độ ổn định','', '| Nhóm | 70% đầu N/ROE | 30% cuối N/ROE | Mẫu đầu mỗi coin/khung6h N/ROE | Bỏ coin đóng góp lãi cao nhất N/ROE | CI95% coin-ngày |','|---|---|---|---|---|---|',
 ...Object.values(groups).map(g=>'| '+[g.title,g.first70.n+'/'+f(g.first70.avgNetRoe5x)+'%',g.last30.n+'/'+f(g.last30.avgNetRoe5x)+'%',g.firstCoin6h.n+'/'+f(g.firstCoin6h.avgNetRoe5x)+'%',g.withoutTopCoin.n+'/'+f(g.withoutTopCoin.avgNetRoe5x)+'%',g.all.ci&&g.all.ci.blocks>=10?'['+f(g.all.ci.lo)+'; '+f(g.all.ci.hi)+']%':'Không đủ mẫu/cụm'].join(' | ')+' |'),'','Mẫu đầu mỗi coin/khung6h chỉ giảm bớt phụ thuộc, không xác định được sóng độc lập. Chia70/30 hồi cứu; CI chưa điều chỉnh đa kiểm định và tương quan thị trường giữa coin.','',
 '## Chờ đủ xác nhận 5m','', 'Chờ tối đa15phút: nến đóng vượt zoneLow frozen, gain60≥8% từ returnBase frozen, quotevol≥100k và≥2×baseline, takerbuy≥55%, đóng30%trên biên nến. Vào OPEN phút sau nến đóng, có thể dùng nến chứa thời điểm cảnh báo nhưng chỉ sau khi đóng. Không phải detector cập nhật lại vùng.','',row('Chờ xác nhận',summary.confirmation),'',
 '## Theo ngày VN','',...Object.entries(days).map(([d,x])=>d+': N='+x.n+', netROE='+f(x.avgNetRoe5x)+'%.'),'',
 'Dữ liệu: public Binance Futures /fapi/v1/klines 1m. Tái dùng cache nghiên cứu SHORT; request mới '+requests+'. Không đọc khóa/API account, không gửi lệnh/Discord/Push/restart, không đổi controls/entry/size/SL/TP/WHITELIST. Không thêm thống kê/card runtime.','',
 'Kết quả máy đọc: data/research/pump-turn-long-backtest-20261028/{cohort,results,summary}.json. Mẫu gốc hash '+summary.cohortHash+'. Tái lập: node scripts/research-pump-turn-long-20261028.mjs.',''];
 await fs.writeFile(path.join(root,'reports/pump-turn-long-backtest-20261028.md'),lines.join('\n'));
 const cols=['id','symbol','observedAt','label','primary','status','netRoe5x','stressRoe5x'];await fs.writeFile(path.join(root,'reports/pump-turn-long-backtest-20261028.csv'),[cols.join(','),...records.map(e=>[e.id,e.symbol,e.observedAt,e.researchClassification.label,primary.some(p=>p.id===e.id),e.results.immediate.status,e.results.immediate.netRoe5x,e.results.immediate.stressRoe5x].join(','))].join('\n'));
 console.log(JSON.stringify({stage:'complete',...summary}));return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
