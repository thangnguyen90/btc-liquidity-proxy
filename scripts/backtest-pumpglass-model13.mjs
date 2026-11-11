import fs from 'node:fs/promises';
import {earlyPumpBars} from '../src/earlyPumpWatch.js';
import {liquidityAt} from './research-early-pump-model.mjs';
import {stats,coinCI} from './research-pumpglass-positioning.mjs';
import {VERSION,planAt,FILTERS,modelExit} from './research-pumpglass-model13.mjs';
const dir='data/research/pumpglass-model13-20261102',read=async f=>JSON.parse(await fs.readFile(f,'utf8')),m=await read(dir+'/manifest.json');
const records=[],coverage={},audit={baselineCount:0,modelCount:0,asOfChecks:0,failures:[]};
for(const symbol of m.symbols){
 const raw={symbol,price:await read(m.priceSource+'/raw/'+encodeURIComponent(symbol)+'-price.json'),mark:await read(dir+'/raw/'+encodeURIComponent(symbol)+'-mark.json'),oi:await read(dir+'/raw/'+encodeURIComponent(symbol)+'-oi.json')};
 const funding=await read(m.source+'/raw/'+encodeURIComponent(symbol)+'-funding.json'),bars=earlyPumpBars(raw.price,m.end),cache=new Map();
 for(const source of m.sourceRecords.filter(r=>r.symbol===symbol))for(const lag of [300000,600000]){
  const key=source.point.decision+':'+lag;let f=cache.get(key);if(!f){const c=bars.find(b=>b.end===source.point.decision),liq=c?liquidityAt(raw,{at:source.point.decision},c.c,lag):{status:'PRICE_MISSING'};f=planAt(bars,source.point.decision,liq);cache.set(key,f);}
  coverage[f.liq?.status??f.status]=(coverage[f.liq?.status??f.status]??0)+1;
  if(f.liq?.status==='OK'){if(f.liq.asOf>source.point.decision-lag)throw Error('MODEL_FUTURE_LEAK');audit.asOfChecks++;}
  const row={symbol,filter:source.filter,phase:source.phase,lagBuckets:source.lagBuckets,lag,point:source.point,features:f,trade:source.trade,modelTrade:modelExit(raw.price,source.point,f,funding,m.end)};
  // Independent replay for model brackets and accounting. Baseline outcomes reused verbatim.
  audit.baselineCount++;
  if(row.modelTrade.status==='OK'){
   const t=row.modelTrade,path=raw.price.filter(b=>+b[0]>=source.point.entryAt).slice(0,96);let px=+path.at(-1)[4],at=+path.at(-1)[6];
   for(const b of path){if(+b[1]<=t.stop){px=+b[1];at=+b[0];break;}if(+b[1]>=t.target){px=t.target;at=+b[0];break;}if(+b[3]<=t.stop){px=t.stop;at=+b[6];break;}if(+b[2]>=t.target){px=t.target;at=+b[6];break;}}
   const carry=funding.filter(x=>+x.fundingTime>source.point.entryAt&&+x.fundingTime<=at).reduce((s,x)=>s+(+x.fundingRate)*(+x.markPrice>0?+x.markPrice/t.entry:1)*100,0),net=((px/t.entry-1)*100-.14-carry)*3;
   if(Math.abs(net-t.netRoe)>1e-9||px!==t.exit||at!==t.exitAt)throw Error('MODEL_EXIT_AUDIT');audit.modelCount++;
  }
  records.push(row);
 }
 console.log(JSON.stringify({symbol,done:new Set(records.map(r=>r.symbol)).size,total:m.symbols.length,rows:records.length}));
}
const groups=[];
for(const group of ['DIVERGENCE70_40','GAP30_60'])for(const [filter,fn]of Object.entries(FILTERS)){
 const rs=records.filter(r=>r.filter===group&&r.lagBuckets===1&&r.lag===300000&&fn(r.features)),train=rs.filter(r=>r.phase==='TRAIN'),test=rs.filter(r=>r.phase==='TEST');
 groups.push({group,filter,exit:'FIXED',train:stats(train),test:stats(test),ci:coinCI(test),stress:stats(test,'stressRoe'),lag10:stats(records.filter(r=>r.filter===group&&r.lagBuckets===1&&r.lag===600000&&r.phase==='TEST'&&fn(r.features))),extraBucket:stats(records.filter(r=>r.filter===group&&r.lagBuckets===2&&r.lag===300000&&r.phase==='TEST'&&fn(r.features))),withoutAin:stats(test.filter(r=>r.symbol!=='AINUSDT')),rejected:stats(records.filter(r=>r.filter===group&&r.lagBuckets===1&&r.lag===300000&&r.phase==='TEST'&&r.features.liq?.status==='OK'&&!fn(r.features)))});
}
for(const group of ['DIVERGENCE70_40','GAP30_60']){
 const rs=records.filter(r=>r.filter===group&&r.lagBuckets===1&&r.lag===300000).map(r=>({...r,trade:r.modelTrade})),train=rs.filter(r=>r.phase==='TRAIN'),test=rs.filter(r=>r.phase==='TEST');
 const ids=new Set(test.filter(r=>r.trade.status==='OK').map(r=>r.point.sourceAt+':'+r.symbol));
 groups.push({group,filter:'TARGET_RR15',exit:'MODEL',train:stats(train),test:stats(test),ci:coinCI(test),stress:stats(test,'stressRoe'),withoutAin:stats(test.filter(r=>r.symbol!=='AINUSDT')),matchedFixed:stats(records.filter(r=>r.filter===group&&r.lagBuckets===1&&r.lag===300000&&r.phase==='TEST'&&ids.has(r.point.sourceAt+':'+r.symbol))),lag10:stats(records.filter(r=>r.filter===group&&r.lagBuckets===1&&r.lag===600000&&r.phase==='TEST').map(r=>({...r,trade:r.modelTrade}))),extraBucket:stats(records.filter(r=>r.filter===group&&r.lagBuckets===2&&r.lag===300000&&r.phase==='TEST').map(r=>({...r,trade:r.modelTrade})))});
}
const access=await read(dir+'/source-access-audit.json');const result={version:VERSION,manifest:m,sourceAccess:access,coverage,audit,groups,records};await fs.writeFile(dir+'/results.json',JSON.stringify(result));await fs.writeFile(dir+'/summary.json',JSON.stringify({...result,records:undefined},null,2));
const fmt=x=>Number.isFinite(x)?x.toFixed(2):'—',vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
const lines=['# PumpGlass + Model 1/3 — backtest kết hợp', '',`Version ${VERSION}; ${vn(m.start)} → ${vn(m.end)} VN.`, '',
'## Phạm vi thực hiện', '',
'- Hai nhóm LONG đang gửi Discord: DIVERGENCE70_40(cá voi>=70%,đám đông<=40%) và GAP30_60(cá voi>=60%,cao hơn đám đông>=30điểm%). Giữ nguyên từng mẫu vào và kết quả gốc nghiên cứu PumpGlass, không trộn sang tín hiệu bơm sớm5m.',
'- Entry sau cuối bucketPumpGlass8h+5m, hold8h,3x,TP10/SL20grossROE; phí+trượt0.14%notional,stress0.30%,fundinglịchsử. Model tính lại tại decision với độ trễ5m, sensitivity10m; cần432nến5m/MARK đầy đủ,OI>=95% và3profileđồngbộ. Không dùng bảnđồ hiện tại.',
'- Upper2x: điểm cụm trên trong5% ít nhất2lần phía dưới và>0. UpperGrowing: phía trên mạnh hơn dưới, điểm tương đối tăng>=20%/15m. TargetRR15: cụm mục tiêu trên chưa bị chạm bởi nến đãbiết, SLdưới3đáygầnnhất−.2ATR,RRnet>=1.5. LowerReclaim:nến5m quétcụmdưới cótrước rồiđóngxanhtrêncụm. Khôngsuyra vùngthanh lýdưới là hỗtrợthật.',
'- Thêm nhánhMODEL_EXIT: dùngTPcụmtrên,SLcấu trúccap20%grossROE vàkiểmtraRR>=1.5theoentrythật; giữnguyên8h,SLtrướckhicùngnến,gapSLopen. Hủyplan nếu target/stop đãbịchạm trong5phút chờentry. So vớiFIXED trêncùngmẫu đượcnhận.',
'- Cùngkhungtrain/test từnghiêncứutrước,purge24h. Tậpnàyđãđượcxem,khôngphải kiểmchứngđộclập mới. Tấtcảruleđượccôngbố,khôngtốiưulạibằngtest.', '',
'## Giá vốn và PnL cá voi', '',
'Đã kiểmtraendpointbiểuđồlịchsửpublic tạiAIN/BTC. Response locked=true, cộtlong_avg/short_avg=null; khôngcóseriesPnL. Không thể backtest PnL/giávốn hoặc tỷlệđanglãi đúngthờiđiểm từdữliệutruycậpđược. Khôngbypassquyềntruycập,khônggángiávốnhiệntạichoquákhứ. Phầnnàychưađượckiểmchứng; source-access-audit.jsonlưubằngchứng.', '',
'## Kết quả', '',
'| Nhóm | Bộlọc | Thoát | Nđầu | TBROEđầu% | Nsau | Coinsau | Thắngsau% | TBROEsau% | PFsau | BỏAIN% |',
'|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
...groups.map(g=>`| ${g.group} | ${g.filter} | ${g.exit} | ${g.train.n} | ${fmt(g.train.mean)} | ${g.test.n} | ${g.test.coins} | ${fmt(g.test.winPct)} | ${fmt(g.test.mean)} | ${fmt(g.test.pf)} | ${fmt(g.withoutAin?.mean)} |`), '',
'## Độ nhạy và so cùng mẫu', '', '```json',JSON.stringify(groups.map(g=>({group:g.group,filter:g.filter,exit:g.exit,ci:g.ci,stress:g.stress,lag10:g.lag10,extraBucket:g.extraBucket,matchedFixed:g.matchedFixed,rejected:g.rejected})),null,2),'```', '',
'## Coverage/audit', '', '```json',JSON.stringify({coverage,audit,access},null,2),'```', '',
'Không tạo/sửa lệnh, không đổi gate hay màu Discord, không đổi DCA/leverage/SL/TP runtime. Giữ JSON nghiên cứu riêng. Hai nhóm có thể trùng mẫu, không cộng số mẫu. Model1/3 là ước lượng và cùnggiảđịnhleverage, không phải thanh khoản/L2thật;nguồncávoicóchọnnhómhồicứu chưa kiểmtoán. MeanROE từngmẫu không phải PnLtài khoản.', ''];
await fs.writeFile(dir+'/BAO_CAO.md',lines.join('\n'));
const columns=['symbol','group','phase','pgLagBuckets','modelLagMin','sourceTime','decisionTime','entryTime','modelStatus','upperScore','lowerScore','modelTarget','planRR','fixedRoe','modelExitStatus','modelRoe'];const csv=records.map(r=>[r.symbol,r.filter,r.phase,r.lagBuckets,r.lag/60000,vn(r.point.sourceAt),vn(r.point.decision),vn(r.point.entryAt),r.features.liq?.status??r.features.status,r.features.liq?.upperScore,r.features.liq?.lowerScore,r.features.target,r.features.rr,r.trade.netRoe,r.modelTrade.status,r.modelTrade.netRoe].map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(','));await fs.writeFile(dir+'/CHI_TIET.csv','\uFEFF'+columns.join(',')+'\n'+csv.join('\n'));
console.log(JSON.stringify({coverage,audit,groups},null,2));
