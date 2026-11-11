import fs from 'node:fs/promises';import crypto from 'node:crypto';
import {earlyPumpBars} from '../src/earlyPumpWatch.js';
import {FILTERS,STEP} from './research-early-pump-model.mjs';
import {VERSION,VARIANTS,dcaTrade,summarizeDca} from './research-early-pump-dca.mjs';
const source='data/research/early-pump-liquidity-20261102',dir='data/research/early-pump-dca-20261102';
await fs.mkdir(dir,{recursive:true});const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const base=await read(source+'/results.json'),manifest=base.manifest;
const protocol={version:VERSION,frozenAt:Date.now(),sourceManifest:manifest,modelHash:crypto.createHash('sha256').update(await fs.readFile('scripts/research-early-pump-dca.mjs')).digest('hex'),scope:'Exploratory DCA on already-seen seven-day data, not fresh out-of-sample. Same initial admissible trades as base study, no optimization.',budget:'Reserve1USDT/signal, 3x, FULL1USDT or THIRD_ONLY/DCA thirds. No martingale/no new cash/no stop widening.',adds:'DCA after a closed5m close<=initialEntry*(1-2%*entryCount), at next open only if still<=threshold and above initial SL. At most one add/bar, max3entries. DCA_RECLAIM also requires green closed candle and close/open above original breakout level. Buy at funding timestamp occurs after payment.',exits:'Initial stop=initialEntry*(1-.2/3) fixed absolute price throughout. TP=weightedAverage*(1+.1/3). Max4h from first fill. Stop checked before add on open; both TP/SL samebar=SL. Not exact intrabar limit-order DCA.',costs:'0.07% each side on actual turnover (totalapprox0.14%), stress0.15% each side, historical funding on held quantity. Net% denominator all reserved capital, including unused margin. No reinvestment.',cohorts:['BREAKOUT_ALL','HOLD_ALL','RETEST_ALL','RETEST_RR15_PREVIOUS_SELECTION','HOLD_UPPER2X_EXPLORATORY']};
await fs.writeFile(dir+'/protocol.json',JSON.stringify(protocol,null,2));
const records=[];let ledgerChecks=0,initialMatches=0;
for(const file of (await fs.readdir(source+'/evaluated')).filter(f=>f.endsWith('.json'))){
 const s=await read(source+'/evaluated/'+file),stem=source+'/raw/'+encodeURIComponent(s.symbol),bars=earlyPumpBars(await read(stem+'-price.json'),manifest.end),funding=await read(stem+'-funding.json');const byTime=new Map(bars.map((b,i)=>[b.t,i]));
 for(const row of s.rows.filter(r=>r.lag===STEP&&r.exit==='FIXED'&&r.trade.status==='OK')){
  const i=byTime.get(row.trade.start),path=bars.slice(i,i+48),cohorts=[row.mode+'_ALL'];
  if(row.mode==='RETEST'&&FILTERS.ROOM_RR15(row.features))cohorts.push('RETEST_RR15_PREVIOUS_SELECTION');
  if(row.mode==='HOLD'&&FILTERS.UPPER_2X(row.features))cohorts.push('HOLD_UPPER2X_EXPLORATORY');
  for(const variant of VARIANTS){
   const trade=dcaTrade(path,row.features.level,funding,variant);
   if(variant==='FULL'){
    if(Math.abs(trade.exitPrice-row.trade.exitPrice)>1e-10||trade.exitAt!==row.trade.exitAt)throw Error('BASELINE_EXIT_MISMATCH '+row.id);initialMatches++;
   }
   // Independent cash ledger arithmetic audit, separate from weighted-average calculation.
   const costs=trade.entries.reduce((a,e)=>a+e.qty*e.price*.0007,0)+trade.entries.reduce((a,e)=>a+e.qty,0)*trade.exitPrice*.0007;
   const pnl=trade.entries.reduce((a,e)=>a+e.qty*(trade.exitPrice-e.price),0)-costs-trade.fundingCash;
   if(Math.abs(pnl*100-trade.netPct)>1e-8||trade.marginUsed>1+1e-10||trade.stop!==trade.initial*(1-.2/3))throw Error('LEDGER_MISMATCH');ledgerChecks++;
   records.push({id:row.id,symbol:row.symbol,at:row.at,phase:row.phase,mode:row.mode,cohorts,variant,trade});
  }
 }
}
function pairedCI(rs,a,b){const map=new Map();for(const r of rs){if(!map.has(r.id))map.set(r.id,{symbol:r.symbol});map.get(r.id)[r.variant]=r.trade.netPct;}const groups=new Map();for(const r of map.values())if(Number.isFinite(r[a])&&Number.isFinite(r[b])){if(!groups.has(r.symbol))groups.set(r.symbol,[]);groups.get(r.symbol).push(r[a]-r[b]);}const gs=[...groups.values()].map(x=>[x.reduce((s,v)=>s+v,0),x.length]);if(gs.length<2)return null;let seed=20261102;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},out=[];for(let i=0;i<2000;i++){let sum=0,n=0;for(let j=0;j<gs.length;j++){const g=gs[Math.floor(rng()*gs.length)];sum+=g[0];n+=g[1];}out.push(sum/n);}out.sort((a,b)=>a-b);return[out[50],out[1949]];}
const groups={};for(const cohort of protocol.cohorts){groups[cohort]={};for(const phase of ['TRAIN','TEST']){const rs=records.filter(r=>r.cohorts.includes(cohort)&&r.phase===phase);groups[cohort][phase]={variants:Object.fromEntries(VARIANTS.map(v=>[v,{...summarizeDca(rs.filter(r=>r.variant===v)),stress:summarizeDca(rs.filter(r=>r.variant===v),'stressNetPct'),withoutEsports:summarizeDca(rs.filter(r=>r.variant===v&&r.symbol!=='ESPORTSUSDT'))}])),dcaMinusThirdCI:pairedCI(rs,'DCA','THIRD_ONLY'),dcaMinusFullCI:pairedCI(rs,'DCA','FULL')};}}
const result={version:VERSION,protocol,groups,validation:{ledgerChecks,initialMatches,pass:true},records};await fs.writeFile(dir+'/results.json',JSON.stringify(result));await fs.writeFile(dir+'/summary.json',JSON.stringify({...result,records:undefined},null,2));
const fmt=v=>Number.isFinite(v)?v.toFixed(2):'—',vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
const lines=['# Backtest DCA Bơm sớm — cùng tổng vốn', '',`Version ${VERSION}. ${vn(manifest.start)} → ${vn(manifest.end)} VN.`, '',
'Đây là thử nghiệm bổ sung trên bộ dữ liệu đã xem, không phải một tập kiểm chứng mới. Không tối ưu mức DCA theo kết quả.', '',
'## Quy tắc cố định trước khi chạy', '',
'- Mỗi tín hiệu dự trù1USDT vốn, leverage3x. FULL dùng toàn bộ; THIRD_ONLY chỉ dùng1/3 và không mua thêm; DCA và DCA_RECLAIM chia3phần bằng nhau, không tăng tổng ngân sách.',
'- Hai ngưỡng thêm vốn: giá đóng5m giảm2%/4% so với giá vào đầu. Mua ởOPEN nến kế tiếp nếu vẫn ở/dưới ngưỡng, trênSL; tối đa một lần/nến. Không giả định đặtLIMIT khớp tại râu nến. DCA_RECLAIM thêm yêu cầu nến xanh đóng trên vùng breakout và open khớp cũng trên vùng.',
'- Giữ nguyên giáSL ban đầu (giá đầu−6,667%, tương đương−20% grossROE nếu vào toàn bộ ngay). Không dờiSL theo giá vốn. TP cách giá vốn bình quân+3,333% (10%grossROE trên margin đã dùng). Giữ tối đa4h từ entry đầu, không khởi động lại thời hạn sauDCA.',
'- Chi phí0,07%mỗi chiều theo notional thật, stress0,15%mỗi chiều; funding theo số lượng đang giữ tại kỳ trả. Mua đúngtimestampfunding được xem thực hiện sau kỳ trả. GapSL khớpopen, cùngnếnTP/SL chọnSL; bảo vệ cũ kiểm tra trước khi mua thêm.',
'- Lợi nhuận% trong báo cáo = PnL/tổng vốn dự trù, gồm phần chưa dùng. Không gọi làROE trên margin thực dùng, không phải lợi nhuận toàn tài khoản. Nếu dùng4USDT thay1USDT thì PnLUSDT gấp4, tỷ lệ không đổi trong mô phỏng bỏ qua lot/minnotional.', '',
'## Giai đoạn sau (đã xem ở nghiên cứu trước)', '',
'| Nhóm | Phương án | N | Thắng % | TB % vốn dự trù | PF | Vốn dùng TB % | Có thêm vốn | Xấu nhất % | TB 5% xấu nhất |',
'|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
...Object.entries(groups).flatMap(([k,g])=>VARIANTS.map(v=>{const x=g.TEST.variants[v];return `| ${k} | ${v} | ${x.n} | ${fmt(x.winPct)} | ${fmt(x.mean)} | ${fmt(x.pf)} | ${fmt(x.avgMarginPct)} | ${x.added} | ${fmt(x.worst)} | ${fmt(x.tail5Mean)} |`;})), '',
'## So trước/sau và chi phí cao', '',
'| Nhóm | Phương án | TB giai đoạn đầu % | TB giai đoạn sau % | Sau với chi phí cao % | Sau bỏ ESPORTS % |', '|---|---|---:|---:|---:|---:|',
...Object.entries(groups).flatMap(([k,g])=>VARIANTS.map(v=>`| ${k} | ${v} | ${fmt(g.TRAIN.variants[v].mean)} | ${fmt(g.TEST.variants[v].mean)} | ${fmt(g.TEST.variants[v].stress.mean)} | ${fmt(g.TEST.variants[v].withoutEsports.mean)} |`)), '',
'## Khoảng tin cậy chênh lệch trên cùng tín hiệu, bootstrap theo coin', '',
'```json',JSON.stringify(Object.fromEntries(Object.entries(groups).map(([k,g])=>[k,{dcaMinusThirdCI:g.TEST.dcaMinusThirdCI,dcaMinusFullCI:g.TEST.dcaMinusFullCI}])),null,2),'```','',
'## Giới hạn', '',
'- Nếu giảm lỗ chỉ vì dùng ít vốn, THIRD_ONLY giúp tách hiệu ứng đó khỏi tác dụng mua thêm. Không so DCA vốn3phần với lệnh đơn chỉ1phần rồi kết luận DCA lời hơn.',
'- Chỉ thử LONG,3x,DCA2%/4%,3phần,SLcố định và4h. Không suy ra kết quả cho martingale, DCA khôngSL, TPđặc biệt, lệnhshort hoặc kỳ hạn dài.',
'- Bộ dữ liệu này đã được xem; mọi kết quả dương cần kiểm chứng tiến tới/ngoài mẫu. Model1/3 là thanh lý ước lượng, không phải lịch sử sổ lệnh. Trạng thái/điều kiện ở thời điểm DCA_RECLAIM chỉ dùng giá, không dựng lại Model tại từng lệnhthêm.',
'- Phí cách tính theo turnover thật nên FULL chênh nhẹ nghiên cứu trước (trước tính chi phí cố định trên notionalentry); giá/giờthoátFULL đã đối chiếu trùng hoàn toàn. Vốn/khả năng khớp/giới hạnlot và thanh lý tài khoản không mô phỏng.',
'- Không có thay đổi giao dịch thật, không gọiBinanceorder, không gửiDiscord. Không tạo nhãn/card/gate mới.', '',`Audit ledger ${ledgerChecks} kết quả; đối chiếu ${initialMatches} lệnhFULL với baseline trước.`, ''];
await fs.writeFile(dir+'/BAO_CAO.md',lines.join('\n'));console.log(JSON.stringify({groups,validation:result.validation},null,2));
