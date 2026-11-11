import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { evaluatePrePumpConfluence, PRE_PUMP_CONFLUENCE_RULE } from './parabolicPrePumpConfluence.js';

export const PARABOLIC_RISK_LEGACY_VERSION = 'PARABOLIC_PUMP_RISK_PREBUILD_LIVE5M_V1_20261024';
export const PARABOLIC_RISK_VERSION = 'PARABOLIC_PUMP_RISK_MODEL13_RATIO_V2_20261025';
export const PARABOLIC_RISK_RULE = Object.freeze({
  intervalMs: 15_000, minBars: 74, closedMaxAgeMs: 375_000, liveMaxAgeMs: 15_000,
  closedAlertMaxAgeMs: 90_000, cooldownMs: 6 * 3600_000, maxAlerts: 5,
  preBaseRangePct: 4, preVolumeRatio: 3, preBuyPct: 60, preQuoteVolume: 300_000,
  preMoveMinPct: .5, preMoveMaxPct: 3, preNearTopPct: 2, preMaxBreakPct: 1,
  acceleration3BarsPct: 8, acceleration12BarsPct: 20, volumeRatio: 2,
  minQuoteVolume: 100_000, danger12BarsPct: 50, dangerBasePct: 100,
  dangerCandlePct: 20, exhaustionDropPct: 10, crashDropPct: 50,
  preChecksPerScan: 3, preCheckCooldownMs: 30_000,
});
const M5 = 300_000, DAY = 86400_000;
const validSymbol = s => /^[\p{L}\p{N}]{1,32}USDT$/u.test(s ?? '');
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const median = a => { const b = [...a].sort((x,y) => x-y), i = Math.floor(b.length/2); return b.length % 2 ? b[i] : (b[i-1]+b[i])/2; };
const pct = (a,b) => (a/b-1)*100;
const sum = (a,k) => a.reduce((s,r) => s+r[k],0);
const number = v => Number.isFinite(v) ? Number(v.toPrecision(9)).toString() : '—';
const f = v => Number.isFinite(v) ? v.toFixed(2) : '—';
const vn = t => new Date(t).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
export const PARABOLIC_RISK_STYLES = Object.freeze({
  PRE_PUMP_WATCH: { rank: 0, icon: '🔵', color: 0x38bdf8, title: 'NGHI TÍCH LŨY TRƯỚC BƠM', meaning: 'Giá còn sát nền hẹp, volume tăng và mua chủ động áp đảo. Chưa xác nhận breakout; có thể không bơm.' },
  PUMP_ACCELERATING: { rank: 1, icon: '🟡', color: 0xfbbf24, title: 'BƠM ĐANG TĂNG TỐC', meaning: 'Đã có nhịp tăng và vượt nền với volume lớn. Chưa chứng minh short squeeze.' },
  PARABOLIC_DANGER: { rank: 2, icon: '🟠', color: 0xf97316, title: 'TĂNG DỰNG ĐỨNG · RỦI RO CAO', meaning: 'Tốc độ tăng hoặc độ kéo xa nền đã lớn. Có thể tiếp tục tăng, chưa xác nhận đỉnh.' },
  EXHAUSTION: { rank: 3, icon: '🟣', color: 0xa855f7, title: 'SÓNG BƠM MẤT LỰC / RÚT ĐỈNH', meaning: 'Nến đóng có rút đỉnh hoặc phá đáy ngắn hạn sau sóng bơm. Chưa bảo đảm đảo chiều.' },
  CRASH_OBSERVED: { rank: 4, icon: '🔴', color: 0xef4444, title: 'ĐÃ XẢ ≥50% TỪ ĐỈNH QUAN SÁT', meaning: 'Đây là trạng thái xả đã xảy ra; không gọi là dự báo trước cú sập.' },
});

function normalize(r) {
  const out = { openTime: Number(r?.openTime), closeTime: Number(r?.closeTime),
    open: Number(r?.open), high: Number(r?.high), low: Number(r?.low), close: Number(r?.close),
    quoteVolume: Number(r?.quoteVolume), takerBuyQuoteVolume: Number(r?.takerBuyQuoteVolume), isClosed: r?.isClosed };
  if (!Object.entries(out).filter(([k]) => k !== 'isClosed').every(([,v]) => Number.isFinite(v))
    || [out.open,out.high,out.low,out.close].some(v => v <= 0)
    || out.high < Math.max(out.open,out.close) || out.low > Math.min(out.open,out.close)
    || out.quoteVolume < 0 || out.takerBuyQuoteVolume < 0 || out.takerBuyQuoteVolume > out.quoteVolume
    || out.closeTime !== out.openTime + M5 - 1 || out.openTime % M5 !== 0) return null;
  return out;
}

// Every feature is known at evaluation time; no right-side swing confirmation or future outcome.
export function evaluateParabolicPumpRisk(input, { symbol, now = Date.now(), liveAt = null } = {}) {
  if (!validSymbol(symbol)) return { status: 'INVALID_SYMBOL', event: null };
  const source = Array.isArray(input) ? input : [];
  const closedRaw = source.filter(r => Number(r?.closeTime) < now && r?.isClosed !== false).slice(-90);
  if (closedRaw.length < PARABOLIC_RISK_RULE.minBars) return { status: 'INSUFFICIENT', event: null };
  const closed = closedRaw.map(normalize);
  if (closed.some(r => !r) || closed.some((r,i) => i && r.openTime !== closed[i-1].openTime + M5))
    return { status: 'INVALID_OR_GAP', event: null };
  if (now - closed.at(-1).closeTime > PARABOLIC_RISK_RULE.closedMaxAgeMs) return { status: 'STALE', event: null };
  const liveRaw = source.findLast(r => Number(r?.openTime) <= now && Number(r?.closeTime) >= now);
  const live = normalize(liveRaw);
  const liveFresh = live && live.openTime === closed.at(-1).openTime + M5
    && Number.isFinite(liveAt) && now-liveAt >= 0 && now-liveAt <= PARABOLIC_RISK_RULE.liveMaxAgeMs;
  // Evaluate closed exhaustions even if a fresh live candle is already present.
  const closedEvent = now-closed.at(-1).closeTime <= PARABOLIC_RISK_RULE.closedAlertMaxAgeMs
    ? detect(closed, symbol, now, false, closed.at(-1).closeTime) : null;
  const liveEvent = liveFresh ? detect([...closed, live], symbol, now, true, liveAt) : null;
  const event = closedEvent && (!liveEvent || PARABOLIC_RISK_STYLES[closedEvent.stage].rank >= PARABOLIC_RISK_STYLES[liveEvent.stage].rank) ? closedEvent : liveEvent;
  return { status: 'READY', event, lastClosedAt: closed.at(-1).closeTime, liveReady: !!liveFresh };
}

function detect(rows, symbol, now, isLive, at) {
  const rule = PARABOLIC_RISK_RULE, current = rows.at(-1), prior = rows.slice(0,-1);
  const v20 = median(prior.slice(-20).map(r => r.quoteVolume));
  if (!(v20 > 0)) return null;
  const volumeRatio = current.quoteVolume/v20;
  const buyPct = current.quoteVolume > 0 ? current.takerBuyQuoteVolume/current.quoteVolume*100 : null;
  const r3 = pct(current.close, rows.at(-4).close), r12 = pct(current.close, rows.at(-13).close);
  const base6h = Math.min(...prior.slice(-72).map(r => r.close));
  const gainBasePct = pct(current.close,base6h);
  const peakRows = rows.slice(-36), peak = peakRows.reduce((a,b) => b.high > a.high ? b : a);
  const pi = rows.findIndex(r => r.openTime === peak.openTime);
  const peakPrior = rows.slice(Math.max(0,pi-20),pi);
  const peakV20 = peakPrior.length >= 20 ? median(peakPrior.map(r => r.quoteVolume)) : 0;
  const peakVolumeRatio = peakV20 > 0 ? peak.quoteVolume/peakV20 : null;
  const beforePeak = rows.slice(Math.max(0,pi-36),pi);
  const peakGainPct = beforePeak.length ? pct(peak.high,Math.min(...beforePeak.map(r => r.close))) : 0;
  const dropPct = (1-current.close/peak.high)*100;
  const range = current.high-current.low;
  const upperWickPct = range > 0 ? (current.high-Math.max(current.open,current.close))/range*100 : 0;
  const retracePct = current.high > current.open ? (current.high-current.close)/(current.high-current.open)*100 : 0;
  const base = rows.slice(-15,-3), build = rows.slice(-3);
  const baseLow = Math.min(...base.map(r => r.low)), baseHigh = Math.max(...base.map(r => r.high));
  const baseRangePct = pct(baseHigh,baseLow), baseVol = mean(base.map(r => r.quoteVolume));
  const buildQ = sum(build,'quoteVolume'), buildVolumeRatio = baseVol > 0 ? buildQ/3/baseVol : null;
  const buildBuyPct = buildQ > 0 ? sum(build,'takerBuyQuoteVolume')/buildQ*100 : null;
  const buildMovePct = pct(current.close,base.at(-1).close);
  const higherLows = Number(build[1].low >= build[0].low)+Number(build[2].low >= build[1].low);
  const pre = baseRangePct <= rule.preBaseRangePct && buildVolumeRatio >= rule.preVolumeRatio
    && buildBuyPct >= rule.preBuyPct && buildQ >= rule.preQuoteVolume
    && buildMovePct >= rule.preMoveMinPct && buildMovePct <= rule.preMoveMaxPct
    && current.close >= baseHigh*(1-rule.preNearTopPct/100) && current.close <= baseHigh*(1+rule.preMaxBreakPct/100)
    && higherLows === 2 && gainBasePct < 20;
  const breakout = pct(current.close,Math.max(...prior.slice(-12).map(r => r.high)));
  const accelerating = (r3 >= rule.acceleration3BarsPct || r12 >= rule.acceleration12BarsPct)
    && current.close > current.open && breakout >= .2 && volumeRatio >= rule.volumeRatio
    && current.quoteVolume >= rule.minQuoteVolume && buyPct >= 55;
  const danger = accelerating && (r12 >= rule.danger12BarsPct || gainBasePct >= rule.dangerBasePct || pct(current.high,current.open) >= rule.dangerCandlePct);
  const pumped = peakGainPct >= 20 && peak.quoteVolume >= rule.minQuoteVolume && peakVolumeRatio >= 2;
  const red = current.close < current.open;
  const rejection = upperWickPct >= 35 && retracePct >= 30 && current.high >= peak.high*.98;
  const breakdown = red && current.close < Math.min(...prior.slice(-3).map(r => r.low)) && buyPct <= 45;
  const crash = !isLive && pumped && dropPct >= rule.crashDropPct && red
    && buyPct <= 45 && current.quoteVolume >= rule.minQuoteVolume;
  const exhaustion = !isLive && pumped && dropPct >= rule.exhaustionDropPct
    && (rejection || breakdown) && volumeRatio >= 1.2 && current.quoteVolume >= rule.minQuoteVolume;
  const stage = crash ? 'CRASH_OBSERVED' : exhaustion ? 'EXHAUSTION' : danger ? 'PARABOLIC_DANGER'
    : accelerating ? 'PUMP_ACCELERATING' : pre ? 'PRE_PUMP_WATCH' : null;
  if (!stage) return null;
  return { version: PARABOLIC_RISK_VERSION, id: `parabolic-risk:${symbol}:${stage}:${current.openTime}:${isLive?'live':'closed'}`,
    symbol, stage, interval:'5m', observeOnly:true, isLive, at, observedAt:now,
    candleAt:current.openTime, candleCloseAt:current.closeTime, price:current.close,
    priceSource:'FUTURES_TRADE_KLINE', open:current.open, high:current.high, low:current.low,
    quoteVolume:current.quoteVolume, volumeRatio, buyPct, return3BarsPct:r3, return12BarsPct:r12,
    base6h, gainBasePct, breakoutPct:breakout, peak:peak.high, peakAt:peak.openTime,
    peakGainPct, peakVolumeRatio, dropPct, upperWickPct, retracePct,
    baseLow, baseHigh, baseRangePct, buildVolumeRatio, buildBuyPct, buildQuoteVolume:buildQ, buildMovePct, higherLows,
    derivativesUsed:false, experimental:true };
}

export function parabolicPumpRiskPayload(e) {
  const s = PARABOLIC_RISK_STYLES[e.stage];
  const checks={
    PRE_PUMP_WATCH:'Nền12 nến ≤4%; volume bình quân3 nến ≥3× nền; mua ≥60%; tổng3 nến ≥300k USDT; giá +0,5–3%, cách mép trên −2% đến +1%; hai đáy giữ/nâng. Giá chưa tăng20% từ nền6h. V2 cần cả Model1/3 và ratio PASS theo bằng chứng bên dưới.',
    PUMP_ACCELERATING:'Giá tăng≥8% so với3 nến5m trước HOẶC ≥20% so với12 nến trước; vượt HIGH12 nến trước≥0,2%; nến xanh, volume≥2×median20, ≥100k USDT, mua≥55%.',
    PARABOLIC_DANGER:'Đạt điều kiện tăng tốc; thêm ít nhất một: tăng≥50%/12 nến5m, ≥100% từ nền6h, hoặc HIGH/open nến≥20%.',
    EXHAUSTION:'Đỉnh đã thấy trong3h tăng≥20%, volume đỉnh≥2×median20 trước đỉnh và≥100k. Close thấp hơn đỉnh≥10%; râu trên≥35% + trả nhịp≥30% HOẶC nến đỏ đóng dưới3 đáy trước với bán≥55%. Volume hiện≥1,2×, ≥100k; nến đã đóng.',
    CRASH_OBSERVED:'Đỉnh đã thấy trong3h tăng≥20%, volume đỉnh≥2×median20 trước đỉnh và≥100k. Close thấp hơn đỉnh≥50%; nến đỏ, bán≥55%, volume≥100k; nến đã đóng.',
  };
  return { username:'Pump Risk · Cảnh báo sớm', allowed_mentions:{parse:[]}, embeds:[{
    title:`${s.icon} ${e.symbol} · ${s.title}`, color:s.color,
    description:`${s.meaning}\n${e.isLive?'LIVE 5m · nến chưa đóng, số liệu có thể thay đổi.':'CLOSED 5m · nến đã đóng.'}\nOBSERVE ONLY · Ngưỡng thử nghiệm, chưa kiểm chứng độ chính xác cảnh báo sớm.`,
    fields:[
      {name:'ĐIỀU KIỆN ĐANG ĐẠT',value:checks[e.stage]},
      {name:'GIÁ / THỜI ĐIỂM',value:`Giá giao dịch ${number(e.price)} · ${vn(e.at)} VN\nNến ${vn(e.candleAt)} · ${e.isLive?'đang chạy':'đã đóng'} · không phải MARK.`},
      {name:'NỀN TRƯỚC NHỊP TĂNG',value:`Nền ${number(e.baseLow)}–${number(e.baseHigh)} · biên ${f(e.baseRangePct)}%\n3 nến gần nhất: giá +${f(e.buildMovePct)}% · volume ${f(e.buildVolumeRatio)}× nền · mua ${f(e.buildBuyPct)}% · ${number(e.buildQuoteVolume)} USDT\n${e.stage==='PRE_PUMP_WATCH'?'PASS: nền ≤4%, volume ≥3×, mua ≥60%, tổng ≥300k; giá tăng 0,5–3%, sát mép trên, hai đáy nâng.':'Tham chiếu nền, không suy ra đã có cảnh báo trước đó.'}`},
      {name:'TỐC ĐỘ / LỰC MUA BÁN',value:`So với 3 / 12 nến5m trước: ${f(e.return3BarsPct)}% / ${f(e.return12BarsPct)}%\nVolume nến ${f(e.volumeRatio)}× median20 trước · ${number(e.quoteVolume)} USDT · mua chủ động ${f(e.buyPct)}%\nLIVE là số liệu tích lũy thực, không nhân dự phóng volume cả nến.`},
      {name:'ĐỈNH ĐÃ QUAN SÁT / RÚT ĐỈNH',value:`Đỉnh trong tối đa3h ${number(e.peak)} · giá hiện thấp hơn ${f(e.dropPct)}%\nRâu trên ${f(e.upperWickPct)}% · trả lại open→high ${f(e.retracePct)}%\nĐỉnh là mốc đã thấy, chưa xác nhận đỉnh cuối sóng.`},
      ...(e.stage==='PRE_PUMP_WATCH'?[{name:'MODEL 1 / 3 · KIỂM TRA TRƯỚC CẢNH BÁO',value:e.prePumpAssessment?.heatmap?.pass===true
        ?`PASS · cụm đồng thuận ≥35% ở 3 nến đóng trước nến tín hiệu.\nCụm dưới ${number(e.prePumpAssessment.heatmap.support.low)}–${number(e.prePumpAssessment.heatmap.support.high)} · cách ${f(e.prePumpAssessment.heatmap.supportDistancePct)}%\nMục tiêu tham chiếu ${number(e.prePumpAssessment.heatmap.target.low)} · cách ${f(e.prePumpAssessment.heatmap.targetDistancePct)}% · R:R sau chi phí ${f(e.prePumpAssessment.heatmap.rewardRisk)}\nVùng tại ${vn(e.prePumpAssessment.heatmap.asOf)} VN; không phải TP/SL Binance.`:'Chưa có bằng chứng Model1/3 tại thời điểm cảnh báo; mẫu V1 không được coi là PASS V2.'},
      {name:'TOP TRADER LONG/SHORT · TÀI KHOẢN · 5m',value:e.prePumpAssessment?.topAccountRatio?.pass===true
        ?`PASS · ratio ${f(e.prePumpAssessment.topAccountRatio.baselineMedian)} → ${f(e.prePumpAssessment.topAccountRatio.latestRatio)} (${f(e.prePumpAssessment.topAccountRatio.changePct)}%)\nNền30phút biên ${f(e.prePumpAssessment.topAccountRatio.widthPct)}% · giảm trong ${e.prePumpAssessment.topAccountRatio.transitionMinutes}phút\nLong ${f(e.prePumpAssessment.topAccountRatio.longAccountPct)}% / Short ${f(e.prePumpAssessment.topAccountRatio.shortAccountPct)}% · ${vn(e.prePumpAssessment.topAccountRatio.latestAt)} VN\nRatio giảm không chứng minh short squeeze hoặc lượng tiền short.`:'Không có ratio lưu tại thời điểm cảnh báo; không suy ra PASS.'}]:[]),
      {name:'PHẠM VI',value:e.stage==='PRE_PUMP_WATCH'?'V2: giá/volume/taker + hai model Binance ước lượng (volume/OI) + ratio tài khoản top trader. Hai model có chung giả định đòn bẩy, không độc lập. Funding/thanh lý thực chưa dùng. Chỉ cảnh báo quan sát, không đặt lệnh.':'Giá/volume/taker Binance Futures; các nhánh tăng tốc/dựng đứng/mất lực/đã xả giữ rule riêng, không dùng gate Model1/3/ratio của nhánh nghi tích lũy.'},
      {name:'MODEL 1 / 3',value:`[Mở đúng coin](https://liquidity.nhathadev.trade/coinglass-heatmap-lab?symbol=${encodeURIComponent(e.symbol)}&range=24h)`},
    ], footer:{text:(e.version??PARABOLIC_RISK_VERSION)+' | '+e.stage}, timestamp:new Date(e.at).toISOString(),
  }] };
}

export function parabolicRiskWebhook(value) {
  const text=String(value ?? '').trim();if (!text) return null;
  let u; try { u = new URL(text); } catch { throw Error('INVALID_PARABOLIC_RISK_WEBHOOK'); }
  if (u.protocol !== 'https:' || !['discord.com','discordapp.com'].includes(u.hostname) || u.username || u.password || u.port || u.search || u.hash || !/^\/api\/webhooks\/\d+\/[^/]+$/.test(u.pathname)) throw Error('INVALID_PARABOLIC_RISK_WEBHOOK');
  return u.href;
}

export class ParabolicPumpRiskWatch {
  constructor({file,getSymbols=()=>[],getRows=()=>[],getLiveAt=()=>null,loadPrePumpContext=async()=>({}),webhookUrl,fetchImpl=fetch,now=Date.now}={}) {
    Object.assign(this,{file,getSymbols,getRows,getLiveAt,loadPrePumpContext,fetchImpl,now});
    this.webhook=parabolicRiskWebhook(webhookUrl); this.startedAt=now();
    this.state={version:PARABOLIC_RISK_VERSION,alerts:{},history:[],diagnostics:[],retryUntil:0};
    this.preCheckedAt=new Map();
    this.coverage={total:0,ready:0,insufficient:0,stale:0,gap:0}; this.busy=false;this.error=null;
  }
  async init(){return this.initializing??=this.load();}
  async load(){
    try{
      const s=JSON.parse(await readFile(this.file,'utf8'));
      if(![PARABOLIC_RISK_VERSION,PARABOLIC_RISK_LEGACY_VERSION].includes(s.version)||!s.alerts||typeof s.alerts!=='object'||Array.isArray(s.alerts)||!Array.isArray(s.history)
        ||(s.diagnostics!==undefined&&!Array.isArray(s.diagnostics))) throw Error('STATE_SCHEMA');
      if(Object.values(s.alerts).some(v=>!Number.isFinite(v?.at)||!Number.isFinite(v?.candleAt)))throw Error('STATE_SCHEMA');
      this.state={...s,diagnostics:s.diagnostics??[]}; // Preserve old observations and cooldowns verbatim; no eager rewrite.
    }catch(e){if(e.code!=='ENOENT')this.error='STATE_READ_FAILED';}
  }
  async save(){
    const now=this.now();
    this.state.version=PARABOLIC_RISK_VERSION;
    this.state.diagnostics=this.state.diagnostics.filter(e=>now-e.observedAt<DAY).slice(-100);
    this.state.history=this.state.history.filter(e=>now-e.observedAt<7*DAY).slice(-500);
    this.state.alerts=Object.fromEntries(Object.entries(this.state.alerts).filter(([,v])=>now-v.at<7*DAY));
    await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp-'+process.pid;
    await writeFile(tmp,JSON.stringify(this.state));await rename(tmp,this.file);
  }
  fresh(e){const now=this.now();return e.version===PARABOLIC_RISK_VERSION && e.observeOnly===true && validSymbol(e.symbol)
    && !!PARABOLIC_RISK_STYLES[e.stage] && e.at>=this.startedAt && e.at<=now && e.observedAt<=now
    && now-e.at<=(e.isLive?PARABOLIC_RISK_RULE.liveMaxAgeMs:PARABOLIC_RISK_RULE.closedAlertMaxAgeMs)
    && (!e.isLive||e.candleAt>=this.startedAt);}
  async scan(){
    await this.init();if(this.busy||this.error||!this.webhook)return;
    this.busy=true;
    try{
      const now=this.now(),symbols=[...new Set(this.getSymbols())].filter(validSymbol),events=[];
      const coverage={total:symbols.length,ready:0,liveReady:0,insufficient:0,stale:0,gap:0,updatedAt:now};
      for(const symbol of symbols){
        const r=evaluateParabolicPumpRisk(this.getRows(symbol),{symbol,now,liveAt:this.getLiveAt(symbol)});
        if(r.liveReady)coverage.liveReady++;
        if(r.status==='READY')coverage.ready++;else coverage[r.status==='STALE'?'stale':r.status==='INSUFFICIENT'?'insufficient':'gap']++;
        if(r.event)events.push(r.event);
      }
      this.coverage=coverage;this.lastDetected=events.length;
      events.sort((a,b)=>PARABOLIC_RISK_STYLES[b.stage].rank-PARABOLIC_RISK_STYLES[a.stage].rank
        ||(a.stage==='PRE_PUMP_WATCH'?(this.preCheckedAt.get(a.symbol)??0)-(this.preCheckedAt.get(b.symbol)??0):0)||b.quoteVolume-a.quoteVolume);
      let attempts=0,preChecks=0,diagnosticsChanged=false;
      for(const e of events){
        if(attempts>=PARABOLIC_RISK_RULE.maxAlerts||this.now()<(this.state.retryUntil??0))break;
        if(!this.fresh(e))continue;
        const key=e.symbol+'|'+e.stage,prior=this.state.alerts[key];
        if(prior&&(prior.candleAt===e.candleAt||this.now()-prior.at<PARABOLIC_RISK_RULE.cooldownMs))continue;
        if(e.stage==='PRE_PUMP_WATCH'){
          if(preChecks>=PARABOLIC_RISK_RULE.preChecksPerScan||this.now()-(this.preCheckedAt.get(e.symbol)??0)<PARABOLIC_RISK_RULE.preCheckCooldownMs)continue;
          preChecks++;this.preCheckedAt.set(e.symbol,this.now());
          let context={};try{context=await this.loadPrePumpContext(e);}catch{/* Missing upstream data blocks only this candidate. */}
          e.prePumpAssessment=evaluatePrePumpConfluence({event:e,bundle:context?.bundle,ratio:context?.ratio,rows:this.getRows(e.symbol),now:this.now()});
          const record={id:e.id,symbol:e.symbol,stage:e.stage,price:e.price,candleAt:e.candleAt,observedAt:this.now(),assessment:e.prePumpAssessment};
          this.state.diagnostics=this.state.diagnostics.filter(d=>d.id!==e.id);this.state.diagnostics.push(record);diagnosticsChanged=true;
          if(e.prePumpAssessment.pass!==true||!this.fresh(e))continue;
          e.derivativesUsed=true;
        }
        const alert={...e,delivery:{status:'RESERVED',at:this.now()}};
        this.state.alerts[key]={at:this.now(),candleAt:e.candleAt,id:e.id};this.state.history.push(alert);
        await this.save(); // Reserve durably BEFORE POST: unknown delivery is not replayed.
        attempts++;
        if(!this.fresh(e)){alert.delivery={status:'EXPIRED',at:this.now()};await this.save();continue;}
        try{
          const r=await this.fetchImpl(this.webhook,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(parabolicPumpRiskPayload(e)),signal:AbortSignal.timeout(8000)});
          alert.delivery={status:r.ok?'SENT':'FAILED',httpStatus:r.status,at:this.now()};
          if(r.status===429){const b=await r.json().catch(()=>({}));const retry=Number(b.retry_after);this.state.retryUntil=this.now()+Math.max(60_000,Math.min(3600_000,Number.isFinite(retry)?retry*1000:60_000));}
        }catch{alert.delivery={status:'UNKNOWN',at:this.now()};this.state.retryUntil=this.now()+60_000;}
        await this.save();
      }
      if(diagnosticsChanged)await this.save();
      for(const [symbol,at] of this.preCheckedAt)if(this.now()-at>DAY)this.preCheckedAt.delete(symbol);
    }catch{this.error='SCAN_OR_STORAGE_FAILED';}
    finally{this.busy=false;}
  }
  start(){if(this.timer||!this.webhook)return;void this.scan();this.timer=setInterval(()=>void this.scan(),PARABOLIC_RISK_RULE.intervalMs);this.timer.unref?.();}
  stop(){clearInterval(this.timer);this.timer=null;}
  snapshot(){return structuredClone({version:PARABOLIC_RISK_VERSION,observeOnly:true,experimental:true,configured:!!this.webhook,
    startedAt:this.startedAt,error:this.error,busy:this.busy,rule:PARABOLIC_RISK_RULE,coverage:this.coverage,
    prePumpRule:PRE_PUMP_CONFLUENCE_RULE,diagnostics:(this.state.diagnostics??[]).slice(-100).reverse(),
    lastDetected:this.lastDetected??0,retryUntil:this.state.retryUntil??0,history:this.state.history.slice(-50).reverse()});}
}
