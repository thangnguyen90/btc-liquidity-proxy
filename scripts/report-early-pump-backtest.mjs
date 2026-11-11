import fs from 'node:fs/promises';
import {FILTERS,stats,STEP,STUDY_VERSION} from './research-early-pump-model.mjs';
const dir='data/research/early-pump-liquidity-20261102',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const manifest=await read(dir+'/manifest.json'),files=(await fs.readdir(dir+'/evaluated')).filter(f=>f.endsWith('.json'));
const studies=[];for(const f of files)studies.push(await read(dir+'/evaluated/'+f));
const rows=studies.flatMap(s=>s.rows),main=rows.filter(r=>r.lag===STEP),events=studies.flatMap(s=>s.events.map(e=>({...e,symbol:s.symbol})));
const round=x=>Number.isFinite(x)?+x.toFixed(4):null;
function bootstrap(rs){
 const groups=new Map();for(const r of rs.filter(r=>r.trade.status==='OK')){if(!groups.has(r.symbol))groups.set(r.symbol,[]);groups.get(r.symbol).push(r.trade.netRoe);}
 const gs=[...groups.values()].map(a=>[a.reduce((s,x)=>s+x,0),a.length]);if(gs.length<2)return null;
 let seed=20261102;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const values=[];for(let i=0;i<1500;i++){let sum=0,n=0;for(let j=0;j<gs.length;j++){const g=gs[Math.floor(random()*gs.length)];sum+=g[0];n+=g[1];}values.push(sum/n);}values.sort((a,b)=>a-b);return [round(values[37]),round(values[1462])];
}
const grid=[];
for(const mode of ['BREAKOUT','HOLD','RETEST'])for(const exit of ['FIXED','MODEL'])for(const [filter,fn]of Object.entries(FILTERS)){
 const cohort=main.filter(r=>r.mode===mode&&r.exit===exit&&fn(r.features)),train=cohort.filter(r=>r.phase==='TRAIN'),test=cohort.filter(r=>r.phase==='TEST');
 const a=stats(train),b=stats(test),stressTrain=stats(train,'stressNetRoe');
 grid.push({mode,exit,filter,train:a,test:b,stressTrain,stressTest:stats(test,'stressNetRoe'),eligibleForSelection:!['ALL','MODEL_AVAILABLE'].includes(filter)&&a.n>=40&&a.coins>=15&&a.mean>0&&stressTrain.mean>0});
}
// Select using train ONLY. Do not choose a second formula after reading holdout.
const ranked=grid.filter(g=>g.eligibleForSelection).sort((a,b)=>b.train.mean-a.train.mean||b.train.n-a.train.n),selected=ranked[0]??null;
let selection=null;
if(selected){
 const match=r=>r.mode===selected.mode&&r.exit===selected.exit&&FILTERS[selected.filter](r.features);
 const chosen=main.filter(match),train=chosen.filter(r=>r.phase==='TRAIN'),test=chosen.filter(r=>r.phase==='TEST'),ci=bootstrap(test);
 const ids=new Set(test.filter(r=>r.trade.status==='OK').map(r=>r.id));
 const pairedBaseline=main.filter(r=>r.mode===selected.mode&&r.exit==='FIXED'&&r.phase==='TEST'&&ids.has(r.id));
 const coinPnl=new Map();for(const r of test.filter(r=>r.trade.status==='OK'))coinPnl.set(r.symbol,(coinPnl.get(r.symbol)??0)+r.trade.netRoe);const topCoin=[...coinPnl].sort((a,b)=>b[1]-a[1])[0]?.[0];
 selection={...selected,trainCI:bootstrap(train),testCI:ci,matchedFixedBaseline:stats(pairedBaseline),withoutEsports:stats(test.filter(r=>r.symbol!=='ESPORTSUSDT')),topCoin,withoutTopCoin:stats(test.filter(r=>r.symbol!==topCoin)),lag10:stats(rows.filter(r=>r.lag===2*STEP&&r.phase==='TEST'&&match(r))),entryDelay10:stats(test.map(r=>({...r,trade:r.delayed})).filter(r=>r.trade)),days:Object.fromEntries([...new Set(test.map(r=>new Date(r.at+7*3600000).toISOString().slice(0,10)))].map(d=>[d,stats(test.filter(r=>new Date(r.at+7*3600000).toISOString().startsWith(d)))])),passedHoldout:!!(selected.test.n>=30&&selected.test.coins>=10&&ci?.[0]>0&&selected.stressTest.mean>0)};
 const comparable=main.filter(r=>r.phase==='TEST'&&r.mode===selected.mode&&r.exit===selected.exit&&r.features.liquidity.status==='OK');
 selection.comparableAll=stats(comparable);selection.rejected=stats(comparable.filter(r=>!FILTERS[selected.filter](r.features)));selection.keepPct=selection.comparableAll.n?selected.test.n/selection.comparableAll.n*100:null;
 const busy=new Map(),nonOverlap=[];for(const r of test.filter(r=>r.trade.status==='OK').sort((a,b)=>a.trade.start-b.trade.start)){if(r.trade.start<(busy.get(r.symbol)??0))continue;nonOverlap.push(r);busy.set(r.symbol,r.trade.exitAt);}
 selection.onePositionPerCoin=stats(nonOverlap);selection.worstNetRoe=Math.min(...test.filter(r=>r.trade.status==='OK').map(r=>r.trade.netRoe));
}
const availability={};for(const r of main.filter(r=>r.exit==='FIXED'))availability[r.features.liquidity.status]=(availability[r.features.liquidity.status]??0)+1;
const exclusions={};for(const r of main)if(r.trade.status!=='OK')exclusions[r.trade.status]=(exclusions[r.trade.status]??0)+1;
const matchedEntry=[];for(const mode of ['HOLD','RETEST']){
 const a=main.filter(r=>r.mode===mode&&r.exit==='FIXED'&&r.phase==='TEST'&&r.trade.status==='OK'),ids=new Set(a.map(r=>r.id)),b=main.filter(r=>r.mode==='BREAKOUT'&&r.exit==='FIXED'&&r.phase==='TEST'&&r.trade.status==='OK'&&ids.has(r.id)),bid=new Set(b.map(r=>r.id));matchedEntry.push({mode,delayed:stats(a.filter(r=>bid.has(r.id))),breakoutSameEvents:stats(b)});
}
const output={version:STUDY_VERSION,generatedAt:Date.now(),manifest,evaluatedSymbols:studies.length,events:events.length,coins:studies.length,availability,exclusions,grid,selection,matchedEntry,method:{leverage:3,costPct:.14,stressCostPct:.30,funding:'Historical fundingRate; LONG funding deducted using reported mark/entry ratio. Payment exactly at entry excluded; no funding included after exit.',entry:'Next full 5m open, 5m after decision; if level lost while waiting cancel. +10m sensitivity.',stop:'Fixed SL20% gross ROE and TP10% gross ROE; model exit uses lower of last3 lows/breakout minus .2ATR14 with SL20 cap, nearest upper consensus cluster as target, net RR>=1.5 at actual entry. Same bar SL first, gap stop at open.',model:'Same backend simulation with 432 closed5m bars, all MARK, >=95% OI timestamps, three fresh profiles. 5m lag; 10m sensitivity. Missing is unavailable, not zero liquidity.',limits:'Survivorship current universe; historical revisions/publication delay unknown; model1/3 share leverage assumptions, not actual L2 or liquidation. Only 7d, correlated events; bootstrap by coin. Multiple exploratory filters; one train-selected formula tested once. Fixed size independent event returns, not portfolio or actual account PnL.'}};
await fs.writeFile(dir+'/results.json',JSON.stringify(output,null,2));
const fmt=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):'—',vn=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
const table=g=>`| ${g.mode} | ${g.exit} | ${g.filter} | ${g.train.n} | ${fmt(g.train.mean)} | ${g.test.n} | ${g.test.coins} | ${fmt(g.test.winPct)} | ${fmt(g.test.mean)} | ${fmt(g.test.pf)} |`;
const lines=[`# Backtest Bơm sớm + thanh khoản Model 1/3`, '',`Version ${STUDY_VERSION}. Khoảng ${vn(manifest.start)} – ${vn(manifest.end)} VN.`,
`Universe hiện tại ${manifest.universe.length} hợp đồng USDT perpetual. ${events.length} mẫu nhận diện trên ${studies.length} coin có đủ tệp đầu vào để đánh giá. Xem coverage.json để đối chiếu mẫu thiếu.`, '',
`## Kết luận kiểm chứng`, '', selection?(selection.passedHoldout?'Công thức chọn từ tập đầu đạt tiêu chí sơ bộ trên tập sau; chỉ phù hợp chạy quan sát tiếp, chưa chứng minh bền vững.':'Công thức tốt nhất trên tập đầu KHÔNG vượt tiêu chí kiểm chứng đã định. Chưa có cơ sở đưa vào gate/lệnh thật.'):'Không có công thức thanh khoản đạt điều kiện chọn trên tập đầu (ít nhất40 lệnh/15coin, mean dương cả chi phí cơ sở và stress). Không chọn công thức theo kết quả tập kiểm chứng.', '',
`## Thiết kế`, '',
`- Tìm quy tắc trước ${vn(manifest.split-6*3600000)}; purge6h; kiểm chứng từ ${vn(manifest.split)}. Mỗi lệnh cần đủ4h nến tương lai kể cả đã chạmTP/SL sớm.`,
'- Chỉ LONG theo bộ phát hiện bơm sớm V1. Quét lịch sử liên tục, cooldown1h/coin; không lấy tín hiệu SHORT hoặc nhánh4USDT đã tắt.',
'- BREAKOUT: quyết định khi nến vượt đóng. HOLD: sau2–3 nến giữ/nâng đáy, volume bình quân>=1.5x nền. RETEST: trong6 nến, low<=vùng+.25ATR và nến xanh đóng trên vùng; hủy khi có close mất vùng trước đó.',
'- Vào open5m sau quyết định5phút, không giả định khớp giá đã đóng. 3x; FIXED TP+10%/SL−20% gross ROE; MODEL SL cấu trúc/cap20 và TP cụm trên, netRR>=1.5. Dừng sau4h. Cùng nến chạm2mức tínhSL; gap bất lợi khớpopen.',
'- Phí+trượt giá tổng0.14% notional (0.42% margin ở3x); stress0.30%. Funding theo lịch sử trong thời gian giữ. Không tái dựng sổ lệnh, độ sâu, mark-trigger SL hay thanh lý thật.',
'- Model dựng lại đúng simulator hiện có với36h cửa sổ và dữ liệu MARK/OI lịch sử, lùi5phút; kiểm tra lại10phút. Không dùng vùng hiện tại để gán cho tín hiệu cũ. Đây vẫn là tái dựng, không phải snapshot đã lưu tại thời điểm phát.',
'- 9 bộ lọc ×3 kiểu vào ×2 kiểu thoát được công bố toàn bộ. Chọn một công thức dựa tập đầu; yêu cầu tập sau>=30lệnh/10coin, bootstrap coin CI95% lower>0 và chi phí stress còn dương. Không sửa công thức theo tập sau.', '',
'## Nền giá/volume và chỉ yêu cầu đủ dữ liệu Model', '',
'| Vào | Thoát | Bộ lọc | N train | TB ROE train | N test | Coin test | Thắng test % | TB ROE test | PF test |','|---|---|---|---:|---:|---:|---:|---:|---:|---:|',...grid.filter(g=>['ALL','MODEL_AVAILABLE'].includes(g.filter)).map(table),'',
'## Các giả thuyết thanh khoản — vào BREAKOUT, thoát FIXED', '',
'| Vào | Thoát | Bộ lọc | N train | TB ROE train | N test | Coin test | Thắng test % | TB ROE test | PF test |','|---|---|---|---:|---:|---:|---:|---:|---:|---:|',...grid.filter(g=>g.mode==='BREAKOUT'&&g.exit==='FIXED'&&!['ALL','MODEL_AVAILABLE'].includes(g.filter)).map(table),'',
'UPPER_2X: điểm cụm trên trong5% >=2x điểm dưới, điểm trên>0. UPPER_GROWING: trên> dưới và điểm tương đối tăng>=20%/15m. LOWER_RECLAIM: nến quét mép dưới cụm có trước rồi đóng xanh phía trên. ROOM_RR15: mục tiêu cụm trên/vô hiệu cấu trúc cho RR>=1.5 sau chi phí. SHORT_RISING: tỷ trọng SHORT vị thế top15m tăng so đúng1h trước, timestamp trễ>=15m.', '',
'## Công thức được chọn duy nhất từ tập đầu', '', '```json',JSON.stringify(selection,null,2),'```','',
'## So kiểu vào trên cùng mẫu kiểm chứng', '', '```json',JSON.stringify(matchedEntry,null,2),'```','',
'## Toàn bộ tổ hợp (không chọn lại theo test)', '',
'| Vào | Thoát | Bộ lọc | N train | TB ROE train | N test | Coin test | Thắng test % | TB ROE test | PF test |','|---|---|---|---:|---:|---:|---:|---:|---:|---:|',...grid.map(table),'',
'## Dữ liệu thiếu và giới hạn', '', '```json',JSON.stringify({availability,exclusions},null,2),'```', '',
'- Hai model là ước lượng vùng thanh lý dùng chung giả định leverage và chiaLONG/SHORT50/50, không chứng minh ý định của sàn. Điểm vùng được chuẩn hóa riêng, không phải USD hay bằng chứng dòng tiền.',
'- Bảy ngày ngắn; universe hiện tại có survivorship bias. Mẫu cùngcoin/ngày tương quan, lệnh có thể chồng nhau; meanROE không phải tăng trưởng tài khoản. Chi phí khi pump mạnh có thể vượt giả định.',
'- Cụm thanh lý phía dưới không đương nhiên là vùng hỗ trợ; các giả thuyết vị trí/quét cụm được kiểm tra thay vì coi là đúng sẵn.',
'- Không sửa runtime, không bật lệnh Binance, không gửi Discord. Nhánh SHORT4 giữ OFF. Tất cả JSON nghiên cứu mới tách riêng.', ''];
await fs.writeFile(dir+'/BAO_CAO.md',lines.join('\n'));
const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
const columns=['symbol','atVN','phase','mode','exit','lagMinutes','modelStatus','upperScore','lowerScore','upperGrowth15m','reclaim','rr','positionShortDelta','tradeStatus','entryAtVN','entry','stop','target','outcome','netRoe','stressNetRoe','fundingPct'];
const csv=main.map(r=>[r.symbol,vn(r.at),r.phase,r.mode,r.exit,r.lag/60000,r.features.liquidity.status,r.features.liquidity.upperScore,r.features.liquidity.lowerScore,r.features.liquidity.upperGrowth15m,r.features.reclaim,r.features.rr,r.features.position?.shortDelta1hPp,r.trade.status,vn(r.trade.start??r.at),r.trade.entry,r.trade.stop,r.trade.target,r.trade.kind,r.trade.netRoe,r.trade.stressNetRoe,r.trade.fundingPct].map(quote).join(','));
await fs.writeFile(dir+'/CHI_TIET.csv','\uFEFF'+columns.join(',')+'\n'+csv.join('\n'));
console.log(JSON.stringify({events:events.length,symbols:studies.length,selection,baseline:grid.filter(g=>g.filter==='ALL'&&g.exit==='FIXED')},null,2));
