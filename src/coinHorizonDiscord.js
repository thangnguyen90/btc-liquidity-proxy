import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { buildCoinHorizonAnalysis } from './coinHorizonAnalysis.js';

export const COIN_HORIZON_DISCORD_VERSION = 'COIN_HORIZON_DIRECTION_DISCORD_V1_20260906';
const FOUR_HOURS = 4 * 3600_000;
const n = value => Number.isFinite(value) ? Number(value.toFixed(8)).toString() : '—';
const zone = value => value ? `${n(value.low ?? value.bandLow)}–${n(value.high ?? value.bandHigh)}` : 'Chưa có vùng hợp lệ';
const localTime = value => new Date(value).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',hour12:false});

export function collectHorizonDirectionEvent(analysis, now = Date.now()) {
  const horizon = buildCoinHorizonAnalysis(analysis, now);
  if (!horizon.available || horizon.stale || !analysis?.symbol) return null;
  const frames = horizon.scenarios.filter(s=>['UPPER','LOWER'].includes(s.direction));
  if (!frames.length) return null;
  // All current horizons share the same directional model. Fail closed if they disagree.
  if (new Set(frames.map(s=>s.direction)).size!==1) return null;
  return {version:COIN_HORIZON_DISCORD_VERSION,symbol:analysis.symbol,
    side:frames[0].direction==='UPPER'?'LONG':'SHORT',horizon,frames,
    reason:`Nến đóng 1h và 4h cùng ${frames[0].direction==='UPPER'?'xu hướng tăng':'xu hướng giảm'}; không có xung đột CoinGlass được phát hiện.`,
    observeOnly:true};
}

export function buildHorizonDiscordPayload(event) {
  const symbol = encodeURIComponent(event.symbol);
  const base = encodeURIComponent(event.symbol.replace(/USDT$/,''));
  return {username:'Coin Horizon Scenarios',allowed_mentions:{parse:[]},embeds:[{
    title:`${event.side==='LONG'?'🟢 ↑':'🔴 ↓'} KỊCH BẢN GIÁ · ${event.symbol} · ${event.side} · 4h / 8h / 12h`,
    color:event.side==='LONG'?0x10b981:0xef4444,
    description:`**ĐÁNH GIÁ THAM KHẢO · KHÔNG PHẢI LỆNH VÀO BINANCE**\n${event.reason}\nGiá mốc **${n(event.horizon.anchor)}** · ${localTime(event.horizon.generatedAt)} (VN)`,
    fields:[...event.frames.map(s=>({name:`${s.hours} GIỜ TỚI · ${event.side}`,inline:false,value:[
      `Đến ${localTime(s.validUntil)} (VN)`,
      `Cận trên **${n(s.upper)}** (+${n(s.upperPct)}%) · Cận dưới **${n(s.lower)}** (${n(s.lowerPct)}%)`,
      `Kháng cự: ${zone(s.resistance)} · Hỗ trợ: ${zone(s.support)}`,
      `Quét trên: ${zone(s.upperLiquidity)} · Quét dưới: ${zone(s.lowerLiquidity)}`,
      `CoinGlass: ${s.liquidityRange??'thiếu dữ liệu mới'} · Đồng thuận: ${s.agreement==='PARTIAL'?'một phần':'thấp'}`,
      s.upperBreak,s.lowerBreak,
    ].join('\n').slice(0,1024)})),
    {name:'LƯU Ý',value:event.horizon.notes.join('\n').slice(0,1024)},
    {name:'MỞ NHANH',value:`[Binance](https://www.binance.com/en/futures/${symbol}) · [CoinGlass](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${base})`}],
    timestamp:event.horizon.generatedAt,footer:{text:COIN_HORIZON_DISCORD_VERSION},
  }]};
}

export class CoinHorizonDiscordNotifier {
  constructor({stateFile,webhookUrl=()=>'',now=()=>Date.now(),fetchImpl=fetch,eventBuilder=collectHorizonDirectionEvent,payloadBuilder=buildHorizonDiscordPayload}) {
    Object.assign(this,{stateFile,webhookUrl,now,fetchImpl,eventBuilder,payloadBuilder});
    this.queue=Promise.resolve(); this.retryAfter=0; this.memory=null;
  }
  notify(analysis) {
    // Serialize checks and writes; recheck freshness after waiting in the queue.
    const job=this.queue.catch(()=>{}).then(()=>this.process(analysis));
    this.queue=job;return job;
  }
  async process(analysis) {
    const now=this.now(), event=this.eventBuilder(analysis,now);
    if (!event) return {sent:0,reason:'no_direction'};
    const url=String(typeof this.webhookUrl==='function'?this.webhookUrl():this.webhookUrl).trim();
    if (!url) return {sent:0,reason:'not_configured'};
    if (now<this.retryAfter) return {sent:0,reason:'backoff'};
    if (!this.memory) {
      try {this.memory=JSON.parse(await readFile(this.stateFile,'utf8'));}
      catch(error) { if(error.code!=='ENOENT') throw new Error('Cannot read horizon Discord dedupe state'); this.memory={symbols:{}}; }
    }
    const state=this.memory;
    state.symbols??={};
    const key=event.dedupeKey??event.symbol;
    const prior=state.symbols[key];
    const sideAt=prior?.sentBySide?.[event.side];
    if ((Number.isFinite(sideAt)&&now-sideAt<15*60_000)
      || (prior?.side===event.side&&now-prior.sentAt<FOUR_HOURS)) return {sent:0,reason:'deduped'};
    let response;
    try { response=await this.fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(this.payloadBuilder(event)),signal:AbortSignal.timeout(10000)}); }
    catch {this.retryAfter=now+60_000;throw new Error('Horizon Discord network failure; retry delayed');}
    if (!response.ok) {
      const rate=response.status===429 ? await response.json().catch(()=>({})) : {};
      this.retryAfter=now+Math.max(60_000,Math.min(3600_000,(Number(rate.retry_after)||0)*1000));
      throw new Error(`Horizon Discord HTTP ${response.status}`);
    }
    state.symbols[key]={side:event.side,sentAt:now,sentBySide:{...prior?.sentBySide,[event.side]:now}};
    state.version=event.version??COIN_HORIZON_DISCORD_VERSION;
    state.updatedAt=new Date(now).toISOString();
    state.symbols=Object.fromEntries(Object.entries(state.symbols).filter(([,item])=>now-item.sentAt<7*24*3600_000));
    await mkdir(dirname(this.stateFile),{recursive:true});
    const temp=`${this.stateFile}.tmp`;
    await writeFile(temp,JSON.stringify(state,null,2),'utf8');
    await rename(temp,this.stateFile);
    return {sent:1,side:event.side,reason:'sent'};
  }
}
