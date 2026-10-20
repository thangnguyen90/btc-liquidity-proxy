import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {WEAK_ALT_VERSION as VERSION,WEAK_ALT_LEGACY_VERSION,WEAK_ALT_PUSH_TYPE,WEAK_ALT_LABELS,WEAK_ALT_STATES,WEAK_ALT_THEMES,COUNTERTREND_VERSION,COIN_RELATION_VERSION,COIN_RELATION_LABELS} from '../public/weak-alt-rebound-model.js';
const STEP=15*60_000,FRESH=16*60_000;
const clone=x=>JSON.parse(JSON.stringify(x));
const finite=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const round=(v,n=2)=>v==null?null:Number(v.toFixed(n));
const pct=(a,b)=>(a/b-1)*100;
function ema(a,p){let e=mean(a.slice(0,p));for(const x of a.slice(p))e=x*2/(p+1)+e*(1-2/(p+1));return e;}
export function classifyBtcAltState(b,breadth,betaReady=0){
  if(!Number.isFinite(b?.ret15m)||!Number.isFinite(b?.ret1h))return {state:'WAIT_DATA',regime:'UNKNOWN',strong:false,weak:false,reboundWeak:false,fragile:false,resilient:false,fastDown:false};
  const regime=Math.abs(b.ret15m)<.1&&Math.abs(b.ret1h)<.1?'NEUTRAL'
    :(b.ret15m>=.1&&b.ret1h<=-.1)||(b.ret15m<=-.1&&b.ret1h>=.1)?'DIVERGENT'
      :b.ret15m>=.1||b.ret1h>=.1?'UP':'DOWN';
  const strong=breadth.aboveEma20Pct>=65&&breadth.up1hPct>=60&&breadth.higherLowPct>=50
    &&(breadth.alignedUpPct>=25||breadth.buyingVolumePct>=50);
  const weak=breadth.belowEma20Pct>=65&&(breadth.down1hPct>=60||breadth.down3hPct>=60);
  const reboundWeak=breadth.belowEma20Pct>=65&&(breadth.down3hPct>=60||breadth.alignedUpPct<=15);
  const fragile=breadth.recoveryWeakPct>=50&&breadth.fragilePct>=20&&betaReady>=30;
  const resilient=breadth.resilientPct>=60&&(breadth.higherLowPct>=50||breadth.aboveEma20Pct>=50);
  const fastDown=breadth.fasterDownPct>=60&&breadth.downBasisPct>=60;
  let state='NORMAL';
  if(regime==='NEUTRAL')state=strong?'BTC_NEUTRAL_ALT_STRONG':weak?'BTC_NEUTRAL_ALT_WEAK':'NORMAL';
  if(regime==='UP')state=reboundWeak?(fragile?'FRAGILE_REBOUND':'WEAK_REBOUND'):strong?'BTC_UP_ALT_STRONG':breadth.laggingPct>=50?'BTC_UP_ALT_LAGGING':'NORMAL';
  if(regime==='DOWN')state=fastDown?'BTC_DOWN_ALT_WEAK':resilient?'BTC_DOWN_ALT_RESILIENT':'NORMAL';
  // Preserve V1 rebound-risk alerts when one horizon rebounds even if the other disagrees.
  if((b.ret15m>=.1||b.ret1h>=.1)&&reboundWeak)state=fragile?'FRAGILE_REBOUND':'WEAK_REBOUND';
  return {state,regime,strong,weak,reboundWeak,fragile,resilient,fastDown};
}
export function weakAltClosedRows(input=[],now=Date.now()){
  const a=input.map(r=>Object.fromEntries([['openTime',0],['open',1],['high',2],['low',3],['close',4],['closeTime',6],['quoteVolume',7]]
    .map(([k,i])=>[k,finite(r?.[k]??r?.[i])]))).filter(r=>r.closeTime!=null&&r.closeTime<=now).sort((a,b)=>a.closeTime-b.closeTime).slice(-100);
  if(a.length<97||now-a.at(-1).closeTime>FRESH)return [];
  if(a.some((r,i)=>Object.values(r).some(v=>v==null)||r.close<=0||r.open<=0||r.low<=0||r.high<Math.max(r.open,r.close,r.low)
    ||r.low>Math.min(r.open,r.close)||r.quoteVolume<0||r.closeTime-r.openTime!==STEP-1
    ||i>0&&r.openTime-a[i-1].openTime!==STEP))return [];
  return a.map(r=>{const original=input.find(x=>finite(x?.closeTime??x?.[6])===r.closeTime);return {...r,takerBuyQuoteVolume:finite(original?.takerBuyQuoteVolume??original?.[10])};});
}
// Conditional through-origin capture slopes, not general correlation or a causal forecast.
export function directionalCapture(btc,coin){
  if(btc.length!==coin.length)return {up:null,down:null,upN:0,downN:0};
  const beta=sign=>{const pairs=btc.map((x,i)=>({x,y:coin[i]})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x*sign>=.05);
    return {n:pairs.length,value:pairs.length>=8?pairs.reduce((s,p)=>s+p.x*p.y,0)/pairs.reduce((s,p)=>s+p.x*p.x,0):null};};
  const up=beta(1),down=beta(-1);return {up:up.value,down:down.value,upN:up.n,downN:down.n};
}
export function classifyCoinRelation(btcReturn,coinReturn){
  if(!Number.isFinite(btcReturn)||!Number.isFinite(coinReturn))return null;
  if(Math.abs(btcReturn)<.1)return coinReturn>=.05?'NEUTRAL_UP':coinReturn<=-.05?'NEUTRAL_DOWN':'NEUTRAL_FLAT';
  if(Math.abs(coinReturn)<.05)return 'FLAT';
  const direction=Math.sign(btcReturn)===Math.sign(coinReturn)?'WITH':'AGAINST';
  return `${direction}_${Math.abs(coinReturn)>=Math.max(.15,Math.abs(btcReturn))?'STRONG':'WEAK'}`;
}
export function evaluateCoinRelation({symbol,rows,btc,now}){
  const basis=Math.abs(btc.ret1h)>=.1?'1h':Math.abs(btc.ret15m)>=.1?'15m':'1h';
  const btcReturn=basis==='1h'?btc.ret1h:btc.ret15m,last=rows.at(-1),coinReturn=pct(last.close,rows.at(basis==='1h'?-5:-2).close);
  const closes=rows.map(r=>r.close),ema20=ema(closes,20),ema50=ema(closes,50);
  return {version:COIN_RELATION_VERSION,ready:true,evaluatedAt:now,closedAt:last.closeTime,symbol,basis,
    group:classifyCoinRelation(btcReturn,coinReturn),btcReturn:round(btcReturn),coinReturn:round(coinReturn),relativeStrengthPct:round(coinReturn-btcReturn),
    amplitudeRatio:Math.abs(btcReturn)>=.1?round(Math.abs(coinReturn/btcReturn)):null,
    ret1h:round(pct(last.close,rows.at(-5).close)),ret3h:round(pct(last.close,rows.at(-13).close)),price:last.close,ema20,ema50,aboveEma20:last.close>ema20};
}
export function countertrendEvidence({oiRows=[],events=[],connectedAt=null,lastTransportAt=null,socketState,startAt,endAt,now=Date.now()}={}){
  const covered=socketState==='OPEN'&&Number.isFinite(connectedAt)&&connectedAt<=startAt&&Number.isFinite(lastTransportAt)&&lastTransportAt<=now&&now-lastTransportAt<=240000;
  const sampled=events.filter(e=>e.side==='BUY'&&Number.isFinite(e.at)&&e.at>=startAt&&e.at<=endAt&&Number.isFinite(e.usd)&&e.usd>0);
  const oi=oiRows.filter(r=>Number.isFinite(r.at)&&r.at>=startAt&&r.at<=endAt&&Number.isFinite(r.value)&&r.value>0).sort((a,b)=>a.at-b.at);
  const oiCovered=oi.length>=8&&oi[0].at-startAt<=120000&&endAt-oi.at(-1).at<=120000&&oi.every((r,i)=>i===0||r.at>oi[i-1].at&&r.at-oi[i-1].at<=120000);
  return {startAt,endAt,shortLiquidation:{covered,usd:covered?sampled.reduce((s,e)=>s+e.usd,0):null,count:covered?sampled.length:null},
    oi:{covered:oiCovered,changePct:oiCovered?pct(oi.at(-1).value,oi[0].value):null,samples:oi.length,at:oiCovered?oi.at(-1).at:null}};
}
export function evaluateAltCountertrend({symbol,rows,btc,now,getEvidence=()=>null}={}){
  const oneHour=btc.ret1h<=-.1,basis=oneHour?'1h':'15m',btcReturn=oneHour?btc.ret1h:btc.ret15m;
  if(!(btcReturn<=-.1))return null;
  const last=rows.at(-1),closes=rows.map(r=>r.close),coinReturn=pct(last.close,rows.at(oneHour?-5:-2).close),ret1h=pct(last.close,rows.at(-5).close),ret3h=pct(last.close,rows.at(-13).close);
  const e20=ema(closes,20),e50=ema(closes,50),slope=ema(closes.slice(0,-3),20),higherLow=Math.min(...rows.slice(-3).map(r=>r.low))>Math.min(...rows.slice(-6,-3).map(r=>r.low));
  const holding=coinReturn>=-.05||coinReturn>=btcReturn*.5&&(last.close>e20||higherLow);
  if(!holding)return null;
  const above=last.close>e20,trend=coinReturn>=.15&&ret1h>=.3&&ret3h>.1&&above&&e20>e50&&e20>slope&&higherLow;
  const previousHigh=Math.max(...rows.slice(-21,-1).map(r=>r.high)),breakout=last.close>previousHigh;
  const volume=mean(rows.slice(-4).map(r=>r.quoteVolume)),base=mean(rows.slice(-24,-4).map(r=>r.quoteVolume)),volumeRatio=base>0?volume/base:null;
  const recent=rows.slice(-4),takerReady=recent.every(r=>Number.isFinite(r.takerBuyQuoteVolume)&&r.takerBuyQuoteVolume>=0&&r.takerBuyQuoteVolume<=r.quoteVolume),q=recent.reduce((s,r)=>s+r.quoteVolume,0);
  const taker=takerReady&&q>0?recent.reduce((s,r)=>s+r.takerBuyQuoteVolume,0)/q*100:null;
  const startAt=last.closeTime-900000+1,endAt=last.closeTime;
  let evidence;try{evidence=getEvidence(symbol,startAt,endAt,now);}catch{evidence=null;}
  const aligned=evidence?.startAt===startAt&&evidence?.endAt===endAt;
  const liq=aligned&&evidence.shortLiquidation?.covered===true?evidence.shortLiquidation:{covered:false,usd:null,count:null};
  const oi=aligned&&evidence.oi?.covered===true&&Number.isFinite(evidence.oi.changePct)?evidence.oi:{covered:false,changePct:null,samples:0};
  const observed=trend&&Number.isFinite(liq.usd)&&liq.usd>0&&liq.count>0;
  const flow=volumeRatio!=null&&volumeRatio>=1.3&&taker!=null&&taker>=55;
  const squeeze=trend&&flow&&(breakout||oi.covered&&oi.changePct<=-.3);
  const tier=observed?'SHORT_LIQ_OBSERVED':squeeze?'SQUEEZE_SUSPECTED':trend?'COUNTERTREND_UP':'HOLDING';
  return {version:COUNTERTREND_VERSION,symbol,tier,ready:true,evaluatedAt:now,closedAt:endAt,basis,btcReturn:round(btcReturn),coinReturn:round(coinReturn),
    relativeStrengthPct:round(coinReturn-btcReturn),ret1h:round(ret1h),ret3h:round(ret3h),price:last.close,aboveEma20:above,ema20:e20,ema50:e50,higherLow,
    breakout,previousHigh,volumeRatio:round(volumeRatio),takerBuyPct:round(taker),oi:{...oi,changePct:round(oi.changePct)},shortLiquidation:liq,
    conditions:[{met:true,label:`BTC ${basis} giảm, coin giữ giá tương đối`},{met:trend,label:'Coin tăng cùng cửa sổ≥0,15%, 1h≥0,3%, 3h>0,1%; giá>EMA20>EMA50, EMA20 lên, đáy cao'},
      {met:flow,label:'Volume1h≥1,3× nền20 nến trước và taker mua≥55%'},{met:breakout,label:'Close vượt đỉnh20 nến trước'},
      {met:oi.covered&&oi.changePct<=-.3,label:oi.covered?'OI hợp đồng15m giảm≥0,3% (chỉ hỗ trợ suy luận)':'OI15m thiếu/gap, không dùng xác nhận'},
      {met:observed,label:liq.covered?'Binance có sự kiện BUY thanh lý SHORT trong chính nến15m':'Nguồn thanh lý thiếu/cũ; chưa có bằng chứng phủ đủ cửa sổ'}],
    note:observed?'Có thanh lý SHORT thực đã quan sát (mẫu), không phải tổng đầy đủ hay bảo đảm tiếp tục tăng.':squeeze?'Nghi ép SHORT từ giá/flow và breakout/OI; chưa xác nhận thanh lý.':'Giữ giá/tăng ngược không tự chứng minh kill SHORT. Không phải tín hiệu vào lệnh.'};
}
export function evaluateWeakAltRebound({universe=[],btcRows=[],now=Date.now(),getCountertrendEvidence=()=>null}={}){
  const result={version:VERSION,evaluatedAt:now,ready:false,state:'WAIT_DATA',observeOnly:true,affectsOrders:false,coins:[],
    coverage:{universe:universe.length,ready:0,betaReady:0},closedStats:{closed:0,avgRoe:null}};
  const btc=weakAltClosedRows(btcRows,now);
  if(!btc.length)return {...result,reasons:['BTC15m thiếu/cũ/gap; không suy ra thị trường an toàn.']};
  const closedAt=btc.at(-1).closeTime,returns=btc.slice(-97).slice(1).map((r,i)=>pct(r.close,btc[btc.length-97+i].close));
  const b={ret15m:pct(btc.at(-1).close,btc.at(-2).close),ret1h:pct(btc.at(-1).close,btc.at(-5).close)};
  const seen=new Set(),countertrend=[],relations=[];
  for(const item of universe){
    const symbol=item.symbol;if(!/^[\p{L}\p{N}]{1,32}USDT$/u.test(symbol??'')||symbol==='BTCUSDT'||seen.has(symbol))continue;seen.add(symbol);
    const rows=weakAltClosedRows(item.candles15m??[],now);
    if(!rows.length||rows.at(-1).closeTime!==closedAt)continue;
    const sample=rows.slice(-97);if(sample.some((r,i)=>r.closeTime!==btc[btc.length-97+i].closeTime))continue;
    relations.push(evaluateCoinRelation({symbol,rows,btc:b,now}));
    const counter=evaluateAltCountertrend({symbol,rows,btc:b,now,getEvidence:getCountertrendEvidence});if(counter)countertrend.push(counter);
    const closes=rows.map(r=>r.close),last=rows.at(-1),ret15m=pct(last.close,rows.at(-2).close),ret1h=pct(last.close,rows.at(-5).close),
      ret3h=pct(last.close,rows.at(-13).close),ret6h=pct(last.close,rows.at(-25).close);
    const recent=rows.slice(-12),upVol=recent.filter(r=>r.close>r.open).map(r=>r.quoteVolume),downVol=recent.filter(r=>r.close<r.open).map(r=>r.quoteVolume);
    const volumeRecoveryRatio=upVol.length>=2&&downVol.length>=2&&mean(downVol)>0?mean(upVol)/mean(downVol):null;
    const coinReturns=sample.slice(1).map((r,i)=>pct(r.close,sample[i].close)),capture=directionalCapture(returns,coinReturns);
    const underperforms=b.ret1h>=.1?ret1h<b.ret1h*.5:b.ret15m>=.1?ret15m<b.ret15m*.5:false;
    const downBasis=b.ret1h<=-.1?ret1h:ret15m,btcDownBasis=b.ret1h<=-.1?b.ret1h:b.ret15m;
    const downside=btcDownBasis<=-.1;
    const recoveryWeak=underperforms&&volumeRecoveryRatio!=null&&volumeRecoveryRatio<=.8;
    const betaReady=capture.up!=null&&capture.down!=null;
    const asymmetry=betaReady&&capture.down>=1.5&&capture.down>=capture.up+.5;
    result.coins.push({symbol,closedAt,ret15m:round(ret15m),ret1h:round(ret1h),ret3h:round(ret3h),ret6h:round(ret6h),
      aboveEma20:last.close>ema(closes,20),higherLow:Math.min(...rows.slice(-3).map(r=>r.low))>Math.min(...rows.slice(-6,-3).map(r=>r.low)),
      alignedUp:ret1h>.05&&ret3h>.1&&ret6h>.2,up1h:ret1h>=.15,down1h:ret1h<=-.15,down3h:ret3h<-.1,
      buyingVolume:volumeRecoveryRatio!=null&&volumeRecoveryRatio>=1,volumeRecoveryRatio:round(volumeRecoveryRatio),
      resilient:downside&&downBasis>=btcDownBasis*.5,fasterDown:downside&&downBasis<=btcDownBasis*1.5,downBasis:downBasis<0,
      betaUp:round(capture.up),betaDown:round(capture.down),upN:capture.upN,downN:capture.downN,betaReady,
      underperforms,recoveryWeak,asymmetry,fragile:recoveryWeak&&asymmetry});
  }
  const coins=result.coins,total=coins.length;result.coverage.ready=total;result.coverage.betaReady=coins.filter(r=>r.betaReady).length;
  if(total<30)return {...result,closedAt,btc:b,reasons:[`Chỉ ${total}/30 coin đủ97 nến15m đồng bộ BTC; thiếu dữ liệu, chưa kết luận.`]};
  const share=test=>coins.filter(test).length/total*100;
  const breadth={belowEma20Pct:share(r=>!r.aboveEma20),aboveEma20Pct:share(r=>r.aboveEma20),higherLowPct:share(r=>r.higherLow),down3hPct:share(r=>r.down3h),
    up1hPct:share(r=>r.up1h),down1hPct:share(r=>r.down1h),buyingVolumePct:share(r=>r.buyingVolume),laggingPct:share(r=>r.underperforms),
    resilientPct:share(r=>r.resilient),fasterDownPct:share(r=>r.fasterDown),downBasisPct:share(r=>r.downBasis),
    alignedUpPct:share(r=>r.alignedUp),recoveryWeakPct:share(r=>r.recoveryWeak),fragilePct:share(r=>r.fragile),
    volumeReady:coins.filter(r=>r.volumeRecoveryRatio!=null).length};
  const c=classifyBtcAltState(b,breadth,result.coverage.betaReady),{state,regime}=c;
  return {...result,ready:true,closedAt,state,btc:{ret15m:round(b.ret15m),ret1h:round(b.ret1h)},
    breadth:Object.fromEntries(Object.entries(breadth).map(([k,v])=>[k,round(v)])),
    btcRegime:regime,downsideBasis:b.ret1h<=-.1?'1h':'15m',
    coinRelations:{version:COIN_RELATION_VERSION,ready:true,total:relations.length,
      basis:relations[0].basis,btcReturn:relations[0].btcReturn,
      counts:Object.fromEntries(Object.keys(COIN_RELATION_LABELS).map(g=>[g,relations.filter(r=>r.group===g).length])),
      coins:relations.sort((a,b)=>Object.keys(COIN_RELATION_LABELS).indexOf(a.group)-Object.keys(COIN_RELATION_LABELS).indexOf(b.group)||Math.abs(b.coinReturn)-Math.abs(a.coinReturn)||a.symbol.localeCompare(b.symbol))},
    countertrend:{version:COUNTERTREND_VERSION,ready:true,btcDown:b.ret1h<=-.1||b.ret15m<=-.1,counts:Object.fromEntries(['HOLDING','COUNTERTREND_UP','SQUEEZE_SUSPECTED','SHORT_LIQ_OBSERVED'].map(t=>[t,countertrend.filter(r=>r.tier===t).length])),
      coins:countertrend.sort((a,b)=>['SHORT_LIQ_OBSERVED','SQUEEZE_SUSPECTED','COUNTERTREND_UP','HOLDING'].indexOf(a.tier)-['SHORT_LIQ_OBSERVED','SQUEEZE_SUSPECTED','COUNTERTREND_UP','HOLDING'].indexOf(b.tier)||b.relativeStrengthPct-a.relativeStrengthPct||a.symbol.localeCompare(b.symbol))},
    conditions:[{key:'BTC_REGIME',met:regime!=='DIVERGENT',label:`BTC ${regime}: trung tính khi cả15m/1h nằm trong(-0,1%;+0,1%); hai khung trái dấu vượt ngưỡng → phân hóa`},
      {key:'ALT_STRONG',met:c.strong,label:'ALT mạnh: ≥65% trênEMA20, ≥60% tăng1h≥0,15%, ≥50% giữ đáy cao; ≥25% tăng1/3/6h hoặc ≥50%volume xanh/đỏ≥1×'},
      {key:'ALT_WEAK',met:c.weak,label:'ALT yếu: ≥65% dướiEMA20 và ≥60% giảm1h≤-0,15% hoặc giảm3h<-0,1%'},
      {key:'REBOUND_RISK',met:(b.ret15m>=.1||b.ret1h>=.1)&&c.reboundWeak,label:'Giữ cảnh báo hồi yếuV1: một khungBTC hồi≥0,1% +breadth yếu; hai khung có thể trái chiều'},
      {key:'LAGGING',met:breadth.laggingPct>=50,label:'ALT không theo: ≥50% coin chỉ tăng dưới50% nhịpBTC cùng cửa sổ'},
      {key:'RECOVERY_WEAK',met:breadth.recoveryWeakPct>=50,label:'≥50% coin theoBTC kém và volume hồi/giảm≤0,8×'},
      {key:'ASYMMETRY',met:c.fragile,label:'≥20% vừa hồi yếu vừa beta giảm≥1,5 và hơnbeta tăng≥0,5; ≥30coin đủbeta'},
      {key:'RESILIENT',met:c.resilient,label:'Giữ giá: ≥60% coin giảm không quá50% mứcBTC; ≥50% giữ đáy cao hoặc trênEMA20'},
      {key:'FAST_DOWN',met:c.fastDown,label:'Giảm nhanh hơn: ≥60% coin giảm ít nhất1,5× mứcBTC và ≥60% đang giảm cùng cửa sổ'}],
    reasons:[state==='NORMAL'?'Chưa đủ tổ hợp hoặc BTC trái chiều hai khung; không suy ra ALT mạnh/yếu hay thị trường an toàn.':'Phân loại diễn biến đã đóng, không phải điểm LONG/SHORT hoặc xác suất dự báo.',
      'Hệ số phản ứng dựa96 khoảng15m, mỗi chiềuBTC phải có≥8 mẫu biến động≥0,05%; không phải nguyên nhân hay xác suất thắng.'],
    coins:coins.map(r=>({...r,scenarioMatch:state.endsWith('ALT_STRONG')?r.aboveEma20&&r.up1h&&r.higherLow
      :state==='BTC_NEUTRAL_ALT_WEAK'?!r.aboveEma20&&(r.down1h||r.down3h):state==='BTC_UP_ALT_LAGGING'?r.underperforms
        :state==='BTC_DOWN_ALT_RESILIENT'?r.resilient&&(r.higherLow||r.aboveEma20):state==='BTC_DOWN_ALT_WEAK'?r.fasterDown&&r.downBasis
          :state==='FRAGILE_REBOUND'?r.fragile:state==='WEAK_REBOUND'?r.underperforms&&!r.aboveEma20:false}))
      .sort((a,b)=>Number(b.scenarioMatch)-Number(a.scenarioMatch)||Number(b.fragile)-Number(a.fragile)||Number(b.recoveryWeak)-Number(a.recoveryWeak)||b.ret1h-a.ret1h||a.symbol.localeCompare(b.symbol))};
}
export function weakAltPushPayload(e,now=Date.now()){
  return {signalType:WEAK_ALT_PUSH_TYPE,state:e.state,eventId:e.id,title:`${WEAK_ALT_THEMES[e.state]?.emoji??'⚪'} ${WEAK_ALT_LABELS[e.state]} · BTC/ALT`,
    body:`BTC15m ${e.btc.ret15m}% /1h ${e.btc.ret1h}% · ALT trênEMA20 ${e.breadth.aboveEma20Pct}% · tăng1h ${e.breadth.up1hPct}% · giữ giá ${e.breadth.resilientPct}% · giảm nhanh ${e.breadth.fasterDownPct}%. Chỉ quan sát, không tự vào/đóng lệnh.`,
    expiresAt:now+120_000,notifiedAt:now,url:`/local-ai-trend-evaluation?weakAlt=${encodeURIComponent(e.id)}#weak-alt-rebound`};
}
export class WeakAltReboundMonitor{
  constructor({file,pushSender=async()=>({sent:0}),now=()=>Date.now()}={}){
    Object.assign(this,{file,pushSender,now});this.startedAt=now();this.enabled=true;this.history=[];this.active=null;this.lastClosedAt=0;this.lastPushAt=0;
    this.statePushAt={};this.error=null;this.current={version:VERSION,state:'WAIT_DATA',ready:false,reasons:['Đang chờ nến15m và dữ liệu ALT đồng bộ.']};this.queue=Promise.resolve();this.initializing=null;
  }
  init(){return this.initializing??=this.load();}
  async load(){if(!this.file)return;try{const p=JSON.parse(await readFile(this.file,'utf8'));
    if(![VERSION,WEAK_ALT_LEGACY_VERSION].includes(p.version)||!Array.isArray(p.history)||typeof p.enabled!=='boolean'||(p.active!=null&&(!Array.isArray(p.active.tiers)||!Number.isFinite(p.active.at))))throw Error('schema');
    this.enabled=p.enabled;this.history=p.history.map(e=>e.delivery?.status==='POSTING'?{...e,delivery:{status:'UNKNOWN_AFTER_RESTART'}}:e);
    this.active=p.active??null;this.lastClosedAt=finite(p.lastClosedAt)??0;this.lastPushAt=finite(p.lastPushAt)??0;
    if(this.active)this.active={...this.active,state:this.active.state??this.active.tiers.at(-1)};
    this.statePushAt=p.statePushAt&&typeof p.statePushAt==='object'?p.statePushAt:{};
    if(p.version===WEAK_ALT_LEGACY_VERSION)for(const e of this.history)if(['SENT','PARTIAL','POSTING','UNKNOWN_AFTER_RESTART','QUIET_HOURS','FAILED','NO_SUBSCRIBERS'].includes(e.delivery?.status))this.statePushAt[e.state]=Math.max(this.statePushAt[e.state]??0,e.evaluatedAt??e.at);
  }catch(e){if(e.code!=='ENOENT')this.error='Lịch sử không hợp lệ; giữ file cũ và dừng Push.';}}
  async save(){if(this.error)throw Error(this.error);if(!this.file)return;
    this.history=this.history.filter(e=>this.now()-e.at<=14*86400_000).slice(-200);
    try{await mkdir(dirname(this.file),{recursive:true});const tmp=`${this.file}.tmp-${process.pid}`;
      await writeFile(tmp,JSON.stringify({version:VERSION,enabled:this.enabled,history:this.history,active:this.active,lastClosedAt:this.lastClosedAt,lastPushAt:this.lastPushAt,statePushAt:this.statePushAt}));await rename(tmp,this.file);
    }catch(e){this.error='Không lưu được lịch sử; dừng Push.';throw e;}}
  process(data){const task=this.queue.catch(()=>{}).then(async()=>{await this.init();this.current=data;
    if(this.error||data.version!==VERSION||!data.ready||!Number.isFinite(data.closedAt)||data.closedAt>this.now()||data.closedAt<=this.lastClosedAt)return;
    this.lastClosedAt=data.closedAt;
    if(data.state==='NORMAL'){this.active=null;await this.save();return;}
    if(!WEAK_ALT_STATES.includes(data.state)||data.closedAt<=this.startedAt)return;
    if(this.active?.state===data.state)return;
    const downgrade=data.state==='WEAK_REBOUND'&&this.active?.state==='FRAGILE_REBOUND';
    this.active={at:data.closedAt,state:data.state,tiers:[data.state]};
    const e={...clone(data),id:`weak-alt:${data.closedAt}:${data.state}`,at:data.closedAt,coins:data.coins.slice(0,30)};
    if(e.countertrend)e.countertrend={...e.countertrend,coins:e.countertrend.coins.slice(0,30),truncated:e.countertrend.coins.length>30};
    if(e.coinRelations)e.coinRelations={...e.coinRelations,coins:e.coinRelations.coins.slice(0,30),truncated:e.coinRelations.coins.length>30};
    const now=this.now(),status=downgrade?'DOWNGRADE':!this.enabled?'DISABLED':now-data.closedAt>120_000?'STALE':now-(this.statePushAt[data.state]??0)<30*60_000?'COOLDOWN':'POSTING';
    e.delivery={status};this.history.push(e);if(status==='POSTING'){this.lastPushAt=now;this.statePushAt[data.state]=now;}
    await this.save(); // Durable intent and tier dedupe before external transport.
    if(status==='POSTING')try{const d=await this.pushSender(weakAltPushPayload(e,this.now()));e.delivery={...d,status:d.skipped==='QUIET_HOURS'?'QUIET_HOURS':d.sent>0?(d.failed>0?'PARTIAL':'SENT'):d.error||d.attempted>0?'FAILED':'NO_SUBSCRIBERS'};
    }catch{e.delivery={status:'UNKNOWN_DELIVERY'};}
    await this.save();
  });this.queue=task.catch(()=>{});return task;}
  setEnabled(enabled){if(typeof enabled!=='boolean')return Promise.reject(Error('invalid enabled'));const task=this.queue.catch(()=>{}).then(async()=>{await this.init();const previous=this.enabled;this.enabled=enabled;try{await this.save();}catch(e){this.enabled=previous;throw e;}return this.snapshot();});this.queue=task.catch(()=>{});return task;}
  snapshot(id=null){return clone({...this.current,version:VERSION,observeOnly:true,affectsOrders:false,enabled:this.enabled,error:this.error,startedAt:this.startedAt,
    coins:(this.current.coins??[]).slice(0,30),history:[...this.history].reverse().slice(0,20),selected:id?this.history.find(e=>e.id===id)??null:null,closedStats:{closed:0,avgRoe:null}});}
}
