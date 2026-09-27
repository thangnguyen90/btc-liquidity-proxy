import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {ema99RouteMeta,ema99Margin,ema99Leverage,ema99TakeProfitRoe,validEma99Margin,validEma99Leverage,validEma99TakeProfitRoe,EMA99_ENTRY_INTERVALS,EMA99_ENTRY_SETTINGS_VERSION} from './ema99EntryCatalog.js';
import {otherRouteMeta,resolveOtherEntrySettings,validOtherMargin,validOtherLeverage,validOtherTakeProfitRoe,OTHER_ENTRY_SETTINGS_VERSION} from './otherEntryCatalog.js';
export const AUTO_ENTRY_CONTROLS_VERSION='AUTO_ENTRY_CONTROLS_V25_POST_MOVE_IMPULSE_8USDT_20260927';
export const BINANCE_PROTECTION_EXCLUSION_VERSION='BINANCE_SYMBOL_PROTECTION_EXCLUSION_V4_AUTO_RESUME_ROE15_OR_NEG25_20260926';
export const DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_ROE=15;
export const DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_LOSS_ROE=-25;
export function protectionExclusionAutoResumeRoe(value=DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_ROE){
  const roe=Number(value);
  return Number.isFinite(roe)&&roe>0?roe:DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_ROE;
}
export function protectionExclusionAutoResumeLossRoe(value=DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_LOSS_ROE){
  const roe=Number(value);
  return Number.isFinite(roe)&&roe<0?roe:DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_LOSS_ROE;
}
export function shouldAutoResumeProtectionExclusion({
  excluded=false,
  roe,
  thresholdRoe=DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_ROE,
  lossThresholdRoe=DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_LOSS_ROE,
}={}){
  const current=Number(roe),profitThreshold=protectionExclusionAutoResumeRoe(thresholdRoe);
  const lossThreshold=protectionExclusionAutoResumeLossRoe(lossThresholdRoe);
  return excluded===true&&Number.isFinite(current)
    &&(current>=profitThreshold||current<=lossThreshold);
}
const OLD_NEAR_REJECT={source:'ema99-near-reject-short',stream:'ema99-retest',label:'NEAR_REJECT_SHORT_WATCH',side:'SHORT'};
const REBOUND_NEAR_REJECT={...OLD_NEAR_REJECT,label:'REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH'};
const isOldNearReject=r=>r?.source===OLD_NEAR_REJECT.source&&r?.stream===OLD_NEAR_REJECT.stream
  &&r?.label===OLD_NEAR_REJECT.label&&r?.side===OLD_NEAR_REJECT.side;
const clean=v=>String(v??'').trim().slice(0,200);
export function normalizeProtectionExclusionSymbol(value) {
  const compact=String(value??'').normalize('NFKC').trim().toUpperCase().replace(/[\s/_-]+/g,'');
  const symbol=compact.endsWith('USDT')?compact:`${compact}USDT`;
  if(symbol==='USDT'||symbol.length>50||!/^[\p{L}\p{N}]+USDT$/u.test(symbol)) {
    throw new Error('Mã coin không hợp lệ. Ví dụ: AIN hoặc AINUSDT.');
  }
  return symbol;
}
function normalizeProtectionExclusions(value) {
  const symbols=[];
  for(const raw of Array.isArray(value)?value:[]) {
    try {symbols.push(normalizeProtectionExclusionSymbol(raw));} catch {}
  }
  return [...new Set(symbols)].sort((a,b)=>a.localeCompare(b));
}
export function entryRoute(payload={}) {
  const source=clean(payload.source??payload.signalSource)||'UNCLASSIFIED';
  const label=clean(payload.protectionMeta?.signalLabel??payload.protectionMeta?.coinglassZoneLifecycleSignalLabel??payload.signalLabel)
    ||clean(payload.protectionMeta?.signalType??payload.signalType)||source;
  const stream=clean(payload.streamId??payload.protectionMeta?.streamId??payload.executionPage??payload.protectionMeta?.executionPage)||'default';
  const side=['BUY','LONG'].includes(payload.side)?'LONG':['SELL','SHORT'].includes(payload.side)?'SHORT':'UNKNOWN';
  const r={source,stream,label,side};
  if(ema99RouteMeta(r)) {
    const interval=clean(payload.signalInterval??payload.interval??payload.protectionMeta?.signalInterval);
    return {...r,interval,key:JSON.stringify([source,stream,label,side,interval])};
  }
  return {key:JSON.stringify([source,stream,label,side]),...r};
}
export function isReducingOrder(p={}) {
  return p.reduceOnly===true||p.reduceOnly==='true'||p.closePosition===true||p.closePosition==='true'
    ||(p.positionSide==='LONG'&&p.side==='SELL')||(p.positionSide==='SHORT'&&p.side==='BUY');
}
const DAY_FORMATTERS=new Map();
function dayKey(value,timeZone){
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
  if(!DAY_FORMATTERS.has(timeZone))DAY_FORMATTERS.set(timeZone,new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}));
  const parts=DAY_FORMATTERS.get(timeZone).formatToParts(date);
  const get=type=>parts.find(part=>part.type===type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function auditInterval(record={}){
  const explicit=clean(record.signalInterval??record.interval);
  if(EMA99_ENTRY_INTERVALS.includes(explicit))return explicit;
  const textValue=[record.signalCombo,record.entryReason,record.signalReason].filter(Boolean).join(' | ');
  return textValue.match(/(?:^|[^a-z0-9])(5m|15m)(?:[^a-z0-9]|$)/i)?.[1]?.toLowerCase()??'';
}
function blankDaily(){return {entries:0,openEntries:0,closedPositions:0,wins:0,losses:0,breakeven:0,realizedPnlUsdt:0};}
export function buildAutoEntryDailyStats(fills={},routes={},options={}){
  const timeZone=options.timeZone??'Asia/Bangkok',now=options.now??Date.now(),date=dayKey(now,timeZone);
  const records=(Array.isArray(fills)?fills:Object.values(fills??{}).map(fill=>fill?.record??fill)).filter(Boolean);
  const routeKeys=new Set(Object.keys(routes??{})),internal=new Map(),overall={...blankDaily(),closeGroups:new Map()};
  const bucket=key=>{if(!internal.has(key))internal.set(key,{...blankDaily(),closeGroups:new Map()});return internal.get(key);};
  for(const record of records){
    const route=entryRoute({source:record.signalSource,streamId:record.streamId??record.executionPage,
      signalLabel:record.signalLabel??record.signalType,side:record.direction,signalInterval:auditInterval(record)});
    if(!routeKeys.has(route.key))continue;
    const row=bucket(route.key),filledToday=dayKey(record.filledAt,timeZone)===date;
    if(filledToday&&record.isDca!==true){row.entries++;overall.entries++;if(record.positionStatus!=='CLOSED'){row.openEntries++;overall.openEntries++;}}
    if(dayKey(record.closedAt,timeZone)!==date)continue;
    const pnl=Number(record.netRealizedPnlUsdt);if(Number.isFinite(pnl)){row.realizedPnlUsdt+=pnl;overall.realizedPnlUsdt+=pnl;}
    const group=clean(record.closeGroupId)||`${record.symbol}|${record.direction}|${record.closedAt}`;
    row.closeGroups.set(group,record.outcome);overall.closeGroups.set(group,record.outcome);
  }
  const finish=value=>{for(const outcome of value.closeGroups.values()){
    value.closedPositions++;if(outcome==='WIN')value.wins++;else if(outcome==='LOSS')value.losses++;else value.breakeven++;
  }delete value.closeGroups;value.realizedPnlUsdt=Number(value.realizedPnlUsdt.toFixed(8));return value;};
  const routeStats=Object.fromEntries([...internal].map(([key,value])=>[key,finish(value)]));
  return {version:'AUTO_ENTRY_DAILY_REALIZED_STATS_V1_20260912',date,timeZone,generatedAt:new Date(now).toISOString(),totals:finish(overall),routes:routeStats,
    scope:'Real Binance fills matched to control routes; entries exclude DCA, realized PnL uses positions closed during this local day.'};
}
export class AutoEntryControls {
  constructor(file){this.file=file;this.protectionExclusions=new Set();this.read();}
  read(){
    let protectionExclusions=[...this.protectionExclusions];
    try {
      const s=JSON.parse(readFileSync(this.file,'utf8'));
      protectionExclusions=normalizeProtectionExclusions(s.protectionExclusions);
      this.protectionExclusions=new Set(protectionExclusions);
      if(typeof s.enabled!=='boolean'||!s.routes||typeof s.routes!=='object'||Array.isArray(s.routes)
        ||Object.entries(s.routes).some(([key,r])=>!r||r.key!==key||typeof r.enabled!=='boolean'||!['source','stream','label','side'].every(k=>typeof r[k]==='string')))throw new Error('invalid');
      // V2 label meant the rebound-after-dump case. Rename it without granting
      // the new first-pump observation any Binance permission.
      for(const [key,r] of Object.entries(s.routes)) {
        if(!isOldNearReject(r))continue;
        const intervals=EMA99_ENTRY_INTERVALS.includes(r.interval)?[r.interval]:EMA99_ENTRY_INTERVALS;
        for(const interval of intervals) {
          const child=entryRoute({source:REBOUND_NEAR_REJECT.source,streamId:REBOUND_NEAR_REJECT.stream,
            signalLabel:REBOUND_NEAR_REJECT.label,side:REBOUND_NEAR_REJECT.side,signalInterval:interval});
          s.routes[child.key]??={...r,...child};
        }
        delete s.routes[key];
      }
      // Old switches covered BOTH intervals. Preserve their exact permissions,
      // amount and enabledAt, without overwriting already-separated children.
      for(const [key,r] of Object.entries(s.routes)) {
        if(!ema99RouteMeta(r))continue;
        if(r.interval==null && key===JSON.stringify([r.source,r.stream,r.label,r.side])) {
          for(const interval of EMA99_ENTRY_INTERVALS) {
            const child=entryRoute({source:r.source,streamId:r.stream,signalLabel:r.label,side:r.side,signalInterval:interval});
            s.routes[child.key]??={...r,...child};
          }
          delete s.routes[key];
        } else if(!EMA99_ENTRY_INTERVALS.includes(r.interval)
          ||key!==JSON.stringify([r.source,r.stream,r.label,r.side,r.interval]))throw new Error('invalid EMA99 timeframe');
      }
      for(const r of Object.values(s.routes)) {
        const meta=ema99RouteMeta(r);
        r.ema99SettingsEditable=meta?.executable===true;
        if(meta){if(r.executable===false&&r.marginUsdt===null){r.marginUsdt=5;delete r.leverage;r.enabled=false;delete r.enabledAt;}
          r.title=meta.title;r.executable=meta.executable;r.marginUsdt=meta.executable?ema99Margin(r):null;r.leverage=meta.executable?ema99Leverage(r):null;
          r.takeProfitRoePct=meta.executable?ema99TakeProfitRoe(r):null;
          r.takeProfitSettingsEditable=meta.executable===true;
          if(!meta.executable||r.marginUsdt===null||r.leverage===null||r.takeProfitRoePct===null)r.enabled=false;}
        const otherMeta=otherRouteMeta(r);
        r.otherSettingsEditable=otherMeta!==null;
        if(otherMeta){
          const settings=resolveOtherEntrySettings(r,r);
          r.takeProfitSettingsEditable=otherMeta.takeProfitMode==='FIXED_ROE';
          r.takeProfitMode=otherMeta.takeProfitMode;
          r.marginUsdt=settings?.marginUsdt??null;
          r.leverage=settings?.leverage??null;
          r.takeProfitRoePct=settings?.takeProfitRoePct??null;
          if(!settings)r.enabled=false;
        }
      }
      s.protectionExclusions=protectionExclusions;
      return {...s,version:AUTO_ENTRY_CONTROLS_VERSION,protectionExclusionVersion:BINANCE_PROTECTION_EXCLUSION_VERSION};
    } catch {this.protectionExclusions=new Set(protectionExclusions);return {version:AUTO_ENTRY_CONTROLS_VERSION,protectionExclusionVersion:BINANCE_PROTECTION_EXCLUSION_VERSION,enabled:false,routes:{},protectionExclusions,failClosed:true};}
  }
  save(s){const protectionExclusions=normalizeProtectionExclusions(s.protectionExclusions);mkdirSync(dirname(this.file),{recursive:true});writeFileSync(`${this.file}.tmp`,JSON.stringify({...s,protectionExclusions,version:AUTO_ENTRY_CONTROLS_VERSION,protectionExclusionVersion:BINANCE_PROTECTION_EXCLUSION_VERSION,ema99TimeframeVersion:EMA99_ENTRY_SETTINGS_VERSION,otherEntrySettingsVersion:OTHER_ENTRY_SETTINGS_VERSION,updatedAt:new Date().toISOString()},null,2));renameSync(`${this.file}.tmp`,this.file);this.protectionExclusions=new Set(protectionExclusions);}
  register(payload){
    const r=entryRoute(payload),s=this.read();
    if(isOldNearReject(r))return r;
    if(ema99RouteMeta(r)&&!EMA99_ENTRY_INTERVALS.includes(r.interval))return r;
    if(!s.routes[r.key]){s.routes[r.key]={...r,enabled:false};this.save(s);}
    return r;
  }
  seed(payloads){
    const s=this.read();let changed=s.ema99TimeframeVersion!==EMA99_ENTRY_SETTINGS_VERSION
      ||s.otherEntrySettingsVersion!==OTHER_ENTRY_SETTINGS_VERSION;
    for(const payload of payloads){
      const r=entryRoute(payload);
      if(isOldNearReject(r))continue;
      if(ema99RouteMeta(r)&&!EMA99_ENTRY_INTERVALS.includes(r.interval))continue;
      if(r.source==='UNCLASSIFIED'||/manual|unattributed|test/i.test(r.source)||r.side==='UNKNOWN')continue;
      if(!s.routes[r.key]){s.routes[r.key]={...r,enabled:false};changed=true;}
    }
    if(changed)this.save(s);
  }
  update(body){
    const s=this.read();
    if(body.action==='pauseAll'){s.enabled=false;for(const r of Object.values(s.routes))r.enabled=false;}
    else if(body.action==='master'&&typeof body.enabled==='boolean')s.enabled=body.enabled;
    else if(body.action==='protection-exclusion-add'){
      const symbol=normalizeProtectionExclusionSymbol(body.symbol);
      s.protectionExclusions=normalizeProtectionExclusions([...(s.protectionExclusions??[]),symbol]);
    }
    else if(body.action==='protection-exclusion-remove'){
      const symbol=normalizeProtectionExclusionSymbol(body.symbol);
      s.protectionExclusions=normalizeProtectionExclusions(s.protectionExclusions).filter(item=>item!==symbol);
    }
    else if(body.action==='margin'&&s.routes[body.key]) {
      const r=s.routes[body.key];
      const emaEditable=ema99RouteMeta(r)?.executable===true,otherEditable=otherRouteMeta(r)!==null;
      if((!emaEditable&&!otherEditable)||!(emaEditable?validEma99Margin(body.marginUsdt):validOtherMargin(body.marginUsdt)))
        throw new Error('Margin phải từ 1–100 USDT, tối đa 2 số lẻ.');
      const current=emaEditable?ema99Margin(r):r.marginUsdt;
      if(body.expectedMarginUsdt!==current)throw new Error('Size đã thay đổi ở nơi khác. Làm mới trước khi lưu.');
      r.marginUsdt=body.marginUsdt;
    }
    else if(body.action==='leverage'&&s.routes[body.key]) {
      const r=s.routes[body.key];
      const emaEditable=ema99RouteMeta(r)?.executable===true,otherEditable=otherRouteMeta(r)!==null;
      if((!emaEditable&&!otherEditable)||!(emaEditable?validEma99Leverage(body.leverage):validOtherLeverage(body.leverage)))
        throw new Error('Đòn bẩy phải là số nguyên từ 1–125x.');
      const current=emaEditable?ema99Leverage(r):r.leverage;
      if(body.expectedLeverage!==current)throw new Error('Đòn bẩy đã thay đổi ở nơi khác. Làm mới trước khi lưu.');
      r.leverage=body.leverage;
    }
    else if(body.action==='takeProfit'&&s.routes[body.key]) {
      const r=s.routes[body.key];
      const emaEditable=ema99RouteMeta(r)?.executable===true,otherMeta=otherRouteMeta(r);
      const otherEditable=otherMeta?.takeProfitMode==='FIXED_ROE';
      if((!emaEditable&&!otherEditable)||!(emaEditable?validEma99TakeProfitRoe(body.takeProfitRoePct):validOtherTakeProfitRoe(body.takeProfitRoePct)))
        throw new Error('TP phải từ 1–100% ROE, tối đa 2 số lẻ; route TP động không nhận TP cố định.');
      const current=emaEditable?ema99TakeProfitRoe(r):r.takeProfitRoePct;
      if(body.expectedTakeProfitRoePct!==current)throw new Error('TP đã thay đổi ở nơi khác. Làm mới trước khi lưu.');
      r.takeProfitRoePct=body.takeProfitRoePct;
    }
    else if(body.action==='route'&&typeof body.enabled==='boolean'&&s.routes[body.key]){
      if(body.enabled&&ema99RouteMeta(s.routes[body.key])?.executable===false)throw new Error('OBSERVE ONLY: loại này chưa có executor Binance.');
      if(body.enabled&&(s.routes[body.key].source==='UNCLASSIFIED'||s.routes[body.key].side==='UNKNOWN'))throw new Error('Unclassified entries cannot be enabled');
      if(body.enabled&&!s.routes[body.key].enabled)s.routes[body.key].enabledAt=new Date().toISOString();
      s.routes[body.key].enabled=body.enabled;
    }
    else throw new Error('Invalid control update');
    this.save(s);return this.read();
  }
  isProtectionExcluded(symbol){
    try{return this.protectionExclusions.has(normalizeProtectionExclusionSymbol(symbol));}
    catch{return false;}
  }
  autoResumeProtectionExclusion(symbol,roe,thresholdRoe=DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_ROE,
    lossThresholdRoe=DEFAULT_PROTECTION_EXCLUSION_AUTO_RESUME_LOSS_ROE){
    if(!shouldAutoResumeProtectionExclusion({excluded:this.isProtectionExcluded(symbol),roe,thresholdRoe,lossThresholdRoe}))return false;
    return this.clearProtectionExclusion(symbol);
  }
  clearProtectionExclusion(symbol){
    const normalized=normalizeProtectionExclusionSymbol(symbol),s=this.read();
    const current=normalizeProtectionExclusions(s.protectionExclusions);
    if(!current.includes(normalized))return false;
    s.protectionExclusions=current.filter(item=>item!==normalized);
    this.save(s);return true;
  }
  assertEntry(payload={},manual=false){
    if(manual)return;
    const r=this.register(payload),s=this.read();
    if(r.source==='UNCLASSIFIED'||r.side==='UNKNOWN'||!s.enabled||s.routes[r.key]?.enabled!==true){const e=new Error(`Auto Binance OFF: ${r.label} / ${r.side}`);e.code='AUTO_ENTRY_CONTROL_DISABLED';throw e;}
    if(ema99RouteMeta(r)?.executable){const routeState=s.routes[r.key],leverage=ema99Leverage(routeState),margin=ema99Margin(routeState),takeProfitRoePct=ema99TakeProfitRoe(routeState);
      if(Number(payload.leverage)!==leverage||!Number.isFinite(Number(payload.notionalUsdt))||Math.abs(Number(payload.notionalUsdt)-margin*leverage)>1e-8)
        throw new Error('EMA99 size/leverage changed; entry blocked until next scan.');
      if(Number(payload.takeProfitRoePct??15)!==takeProfitRoePct)throw new Error('EMA99 TP changed; entry blocked until next scan.');}
    if(otherRouteMeta(r)){const routeState=s.routes[r.key],settings=resolveOtherEntrySettings(r,routeState);
      const coinLevelLimit=r.source==='coin-level-entry-watch'&&payload.orderType==='LIMIT';
      const margin=coinLevelLimit?3:settings?.marginUsdt;
      if(!settings||Number(payload.marginUsdt)!==margin||Number(payload.leverage)!==settings.leverage
        ||!Number.isFinite(Number(payload.notionalUsdt))||Math.abs(Number(payload.notionalUsdt)-margin*settings.leverage)>1e-8)
        throw new Error('Other-route size/leverage changed; entry blocked until next scan.');
      if(settings.takeProfitEditable&&Number(payload.takeProfitRoePct)!==settings.takeProfitRoePct)
        throw new Error('Other-route TP changed; entry blocked until next scan.');}
  }
  guardClient(client){
    for(const method of ['placeFuturesOrder','placeAlgoOrder']) {
      const original=client[method].bind(client);
      client[method]=args=>{
        if(!isReducingOrder(args.params))this.assertEntry(args.entryControl?.payload??legacyRoute(args.params),args.entryControl?.manual===true);
        return original(args);
      };
    }
  }
}
function legacyRoute(p={}) {
  const id=String(p.newClientOrderId??p.clientAlgoId??'');
  const source=id.startsWith('paper_probe_')?'paper-auto-probe':id.startsWith('lp_auto_')?'legacy-pump-auto'
    :/^liq_(probe|mkt|conf)_/.test(id)?'auto-liq':'UNCLASSIFIED';
  return {source,signalLabel:source==='auto-liq'?(id.startsWith('liq_probe_')?'LIQUID_PROBE':id.startsWith('liq_mkt_')?'LIQUID_CONFIRMED_MARKET':'LIQUID_CONFIRMED_LIMIT'):source,side:p.side};
}
