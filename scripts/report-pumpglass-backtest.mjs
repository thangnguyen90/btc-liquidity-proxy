import fs from 'node:fs/promises';
import {VERSION,FILTERS,selectPoints,outcome,stats,coinCI} from './research-pumpglass-positioning.mjs';
const dir='data/research/pumpglass-positioning-20261102',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const manifest=await read(dir+'/manifest.json'),records=[],coverage=[],errors=[],buckets={};let auditCount=0;
for(const {symbol}of manifest.universe){
 try{
  const h=await read(dir+'/raw/'+encodeURIComponent(symbol)+'-history.json'),price=await read(manifest.source+'/raw/'+encodeURIComponent(symbol)+'-price.json'),funding=await read(dir+'/raw/'+encodeURIComponent(symbol)+'-funding.json');buckets[h.bucket]=(buckets[h.bucket]??0)+1;
  if(h.bucket!==28800){errors.push({symbol,error:'BUCKET_NOT_8H',bucket:h.bucket});continue;}
  coverage.push({symbol,basis:h.basis,bars:h.bars.length,first:h.bars[0]?.t,last:h.bars.at(-1)?.t});
  for(const lagBuckets of [1,2])for(const side of [1,-1])for(const filter of Object.keys(FILTERS)){
   for(const point of selectPoints(h,{start:manifest.start,end:manifest.end,filter,side,lagBuckets})){
    const phase=point.decision<manifest.split-86400000?'TRAIN':point.decision>=manifest.split?'TEST':'PURGED';if(phase==='PURGED')continue;
    const trade=outcome(price,point,side,funding);
    if(trade.status==='OK'){
     if(point.entryAt<point.sourceAt+point.bucket*lagBuckets+300000)throw Error('ASOF_LEAK');
     const sign=side,entryIndex=price.findIndex(x=>+x[0]===point.entryAt),path=price.slice(entryIndex,entryIndex+96);let exit=+path.at(-1)[4],at=+path.at(-1)[6];
     for(const b of path){const o=+b[1],hi=+b[2],lo=+b[3];if(sign*(o-trade.stop)<=0){exit=o;at=+b[0];break;}if(sign*(o-trade.target)>=0){exit=trade.target;at=+b[0];break;}if(sign===1?lo<=trade.stop:hi>=trade.stop){exit=trade.stop;at=+b[6];break;}if(sign===1?hi>=trade.target:lo<=trade.target){exit=trade.target;at=+b[6];break;}}
     const carry=funding.filter(f=>+f.fundingTime>point.entryAt&&+f.fundingTime<=at).reduce((s,f)=>s+(+f.fundingRate)*(+f.markPrice>0?+f.markPrice/trade.entry:1)*100*sign,0),expected=((exit/trade.entry-1)*100*sign-.14-carry)*3;
     if(Math.abs(trade.netRoe-expected)>1e-9||trade.exitAt!==at)throw Error('INDEPENDENT_REPLAY_MISMATCH');auditCount++;
    }
    records.push({symbol,side:side===1?'LONG':'SHORT',filter,phase,lagBuckets,point,basis:h.basis,trade});
   }
  }
 }catch(e){errors.push({symbol,error:e.message});}
}
const groups=[];
for(const side of ['LONG','SHORT'])for(const filter of Object.keys(FILTERS)){
 const primary=records.filter(r=>r.side===side&&r.filter===filter&&r.lagBuckets===1),train=primary.filter(r=>r.phase==='TRAIN'),test=primary.filter(r=>r.phase==='TEST'),a=stats(train),b=stats(test),ci=coinCI(test);
 const byCoin=new Map();for(const r of test.filter(r=>r.trade.status==='OK'))byCoin.set(r.symbol,(byCoin.get(r.symbol)??0)+r.trade.netRoe);const best=[...byCoin].sort((a,b)=>b[1]-a[1])[0]?.[0];
 const sensitivity=records.filter(r=>r.side===side&&r.filter===filter&&r.lagBuckets===2&&r.phase==='TEST');
 groups.push({side,filter,train:a,test:b,ciTest:ci,stressTest:stats(test,'stressRoe'),extraBucketDelay:stats(sensitivity),withoutAinEsports:stats(test.filter(r=>!['AINUSDT','ESPORTSUSDT'].includes(r.symbol))),bestCoin:best,withoutBestCoin:stats(test.filter(r=>r.symbol!==best)),whalesOnly:stats(test.filter(r=>r.basis==='whales')),byDay:Object.fromEntries([...new Set(test.map(r=>new Date(r.point.entryAt+7*3600000).toISOString().slice(0,10)))].map(day=>[day,stats(test.filter(r=>new Date(r.point.entryAt+7*3600000).toISOString().startsWith(day)))])),passesExploratoryCriteria:filter!=='ALL'&&a.n>=40&&b.n>=40&&a.coins>=15&&b.coins>=15&&a.mean>0&&b.mean>0&&ci?.[0]>0&&stats(test,'stressRoe').mean>0&&stats(sensitivity).mean>0});
}
const unavailable=records.filter(r=>r.trade.status!=='OK').reduce((a,r)=>(a[r.trade.status]=(a[r.trade.status]??0)+1,a),{});
const summary={version:VERSION,manifest,coverage:{downloaded:coverage.length,universe:manifest.universe.length,buckets,bases:coverage.reduce((a,r)=>(a[r.basis]=(a[r.basis]??0)+1,a),{}),unavailable,errors},groups,validation:{auditCount,passed:!errors.some(e=>/LEAK|MISMATCH/.test(e.error))}};
await fs.writeFile(dir+'/results.json',JSON.stringify({...summary,records}));await fs.writeFile(dir+'/summary.json',JSON.stringify(summary,null,2));await fs.writeFile(dir+'/coverage.json',JSON.stringify(coverage,null,2));
const fmt=x=>Number.isFinite(x)?x.toFixed(2):'—',vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
const lines=['# Backtest PumpGlass — cá voi và đám đông', '',`Version ${VERSION}. Giá Binance ${vn(manifest.start)} – ${vn(manifest.end)} VN.`, '',
`Đã đọc ${coverage.length}/${manifest.universe.length} lịch sử. Source bucket: ${JSON.stringify(buckets)}; lỗi: ${JSON.stringify(errors)}.`, '',
'## Cách làm và giới hạn thời điểm', '',
'- Dùng h.bars có t,p,w,c; w là tỷ trọng LONG của nhóm mà PumpGlass gọi whales/smart, c là tỷ trọng LONG crowd. Không có lịch sử PnL,giávốn,sốwhales hoặc smart riêng. basis hiện tại không chứng minh thành phần nhóm lịch sử giữ nguyên.',
'- Không dùng giá p do PumpGlass trả để tính lợi nhuận. Giá vào/ra dùng Binance5m cached. Tín hiệu chỉ dùng w/c và delta so bucket liền trước.',
'- Chưa biết nhà cung cấp dùng đầu/cuối/trung bình bucket hay độ trễ công bố. Lùi đến t+8h rồi vàoOPEN5m sau; sensitivity t+16h+5m. Điều này giảm rò rỉ trong bucket nhưng không loại được sửa lịch sử/nhìn lại để chọn nhóm thắng.',
'- 4ngày đầu/3ngày sau, purge24h. Khoảng dữ liệu này đã được xem qua nghiên cứu khác, không coi là holdout hoàn toàn mới. Mỗi rule/coin tối đa một mẫu8h; entry cần đủ8h giá tương lai kể cả chạmSL/TP sớm.',
'- LONG/SHORT cùng3x,TP+10%/SL−20%grossROE, tối đa8h; phí+trượt0.14%notional, stress0.30%;funding Binance lịch sử. GapSLopen; cùngnếnSL/TP tínhSLtrước. Tính signal độc lập, không phảiPnLtài khoản.',
'- Các rule cố định trước kết quả: WHALE70(whaleLONG>=70% hoặc<=30% choSHORT), DIVERGENCE70_40(whale>=70/crowd<=40 hoặc đối xứng), GAP30_60(whale>=60 và hơncrowd>=30điểm%,hoặc đối xứng), RISING5_60(whale>=60 và tăng>=5điểm%so buckettrước,hoặc đối xứng), BOTH70(cảhai>=70 hoặc<=30). ALL là đối chứng hướng cố định mọi mốc, không dùng cávoi.',
'- Mọi tổ hợp được công bố, không tối ưu ngưỡng. Tiêu chí thăm dò: train/test>=40mẫu,>=15coin,mean cảhai dương,testCI95%theocoin lower>0,stressvàlùithêm8h dương. Vẫn cần kiểm chứng tiến tới vì nhiều giả thuyết và thay đổi thành phần nhóm chưa xác minh.', '',
'## Kết quả', '',
'| Hướng | Bộ lọc | N đầu | TB ROE đầu % | N sau | Coin sau | Thắng sau % | TB ROE sau % | PF sau | Stress sau % | Trễ thêm8h % |',
'|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
...groups.map(g=>`| ${g.side} | ${g.filter} | ${g.train.n} | ${fmt(g.train.mean)} | ${g.test.n} | ${g.test.coins} | ${fmt(g.test.winPct)} | ${fmt(g.test.mean)} | ${fmt(g.test.pf)} | ${fmt(g.stressTest.mean)} | ${fmt(g.extraBucketDelay.mean)} |`),'',
'## Độ tin cậy/coin ảnh hưởng', '', '```json',JSON.stringify(groups.map(g=>({side:g.side,filter:g.filter,ci:g.ciTest,equalCoinMean:g.test.coinEqualMean,withoutAinEsports:g.withoutAinEsports,bestCoin:g.bestCoin,withoutBestCoin:g.withoutBestCoin,passes:g.passesExploratoryCriteria})),null,2),'```', '',
'## Kết luận về dữ liệu', '',
'- Đây là backtest tỷ trọng nhóm theo lịch sử tổng hợp; KHÔNG kiểm chứng độ chính xác của 70%đanglãi/giávốncávoi/101cávoi trong ảnh. Không thể dùng snapshot hiện tại làm feature quá khứ.',
'- Tỷ trọng whales và crowd mô tả hai nhóm có thể khác cách cân trọng số; gap không phải lượng tiền chênh lệch LONG/SHORT. Nguồn/cách tuyển chọn trader chưa kiểm toán độc lập. Dùng người thắng hiện tại gán cho quá khứ có thể tạo survivorship/lookahead bias.',
'- Universe hiện tại, thanh khoản/thực thi/funding và lot/minnotional có giới hạn mô phỏng. Mẫu nhiều nhưng tương quan theo thị trường; bootstrapcoin không loại hết phụ thuộc ngày. Kết quả tốt củaSHORT có thể đơn thuần là thị trường giảm; phải đối chiếuALL SHORT.',
'- Không thay đổi runtime, không bật lệnh, khôngDiscord;JSONnghiêncứu táchriêng. Nguồn: https://pumpglass.com/about và /smart-money/api/history.', '',`Audit độc lập ${auditCount} kết quả, validation=${JSON.stringify(summary.validation)}.`, ''];
await fs.writeFile(dir+'/BAO_CAO.md',lines.join('\n'));
const cols=['symbol','side','filter','phase','lagBuckets','basis','sourceAt','entryAt','whaleLongPct','crowdLongPct','deltaWhalePp','status','entry','exit','outcome','netRoe','fundingPct'];const csv=records.map(r=>[r.symbol,r.side,r.filter,r.phase,r.lagBuckets,r.basis,vn(r.point.sourceAt),vn(r.point.entryAt),r.point.w,r.point.c,r.point.delta,r.trade.status,r.trade.entry,r.trade.exit,r.trade.kind,r.trade.netRoe,r.trade.fundingPct].map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(','));await fs.writeFile(dir+'/CHI_TIET.csv','\uFEFF'+cols.join(',')+'\n'+csv.join('\n'));
console.log(JSON.stringify({coverage:summary.coverage,validation:summary.validation,groups:groups.map(g=>({side:g.side,filter:g.filter,train:g.train,test:g.test,ci:g.ciTest,stress:g.stressTest.mean,lag:g.extraBucketDelay.mean,pass:g.passesExploratoryCriteria}))},null,2));
