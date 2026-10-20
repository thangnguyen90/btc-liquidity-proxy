import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {CONTRACT_RISK_NOTIFICATION_TYPE,zoneNotificationUrl} from './liquidityZoneNotifications.js';

export const CONTRACT_RISK_VERSION='BINANCE_CONTRACT_RISK_V2_INDEPENDENT_DISCORD_20261017';
const DAY=86_400_000, RETAIN=7*DAY;
const ANNOUNCEMENT='https://www.binance.com/en/support/announcement/detail/2f1a743334f044abbd82e34093c7b771';
const API_DOC='https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data';
// Verified official notice; no inference that all delistings restrict entry 30 minutes before settlement.
export const VERIFIED_CONTRACT_NOTICES=['PROMPTUSDT','PUMPBTCUSDT','1000000BOBUSDT'].map(symbol=>({symbol,
  settlementAt:Date.parse('2026-10-05T09:00:00Z'),restrictedAt:Date.parse('2026-10-05T08:30:00Z'),sourceUrl:ANNOUNCEMENT}));
const statusRisk=s=>['PRE_SETTLE','SETTLING','PRE_DELIVERING','DELIVERING','DELIVERED','CLOSE'].includes(s);
const local=v=>new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});

export function contractRiskStage(r,now){
  if(r.settlementAt && now>=r.settlementAt)return 'SETTLEMENT_DUE';
  if((r.restrictedAt && now>=r.restrictedAt)||statusRisk(r.status))return 'RESTRICTED';
  if(!r.settlementAt)return 'STATUS_WARNING';
  if(r.settlementAt-now<=3_600_000)return 'ONE_HOUR';
  if(r.settlementAt-now<=DAY)return 'ONE_DAY';
  return 'ANNOUNCED';
}
export function collectContractRisks(exchangeInfo,notices=VERIFIED_CONTRACT_NOTICES,now=Date.now()){
  if(!Array.isArray(exchangeInfo?.symbols))throw Error('exchangeInfo thiếu danh sách hợp đồng; không xóa cảnh báo cũ.');
  const api=new Map(exchangeInfo.symbols.filter(s=>s.quoteAsset==='USDT'
    && ['PERPETUAL','PERPETUAL_DELIVERING'].includes(s.contractType)).map(s=>[s.symbol,s]));
  const announced=new Map(notices.filter(r=>r.settlementAt>=now-RETAIN&&r.settlementAt<=now+RETAIN).map(r=>[r.symbol,r]));
  const risks=[];
  for(const symbol of new Set([...api.keys(),...announced.keys()])){
    const info=api.get(symbol),notice=announced.get(symbol),delivery=Number(info?.deliveryDate);
    if(!notice&&Number.isFinite(delivery)&&delivery>0&&delivery<now-RETAIN)continue;
    const nearDelivery=Number.isFinite(delivery)&&delivery>0&&delivery>=now-RETAIN&&delivery<=now+RETAIN;
    if(!nearDelivery&&!notice&&!statusRisk(info?.status))continue;
    // Old delivered contracts are not new live warnings. Far-future perpetual sentinel dates are ignored.
    if(!nearDelivery&&!notice&&['DELIVERED','CLOSE'].includes(info?.status))continue;
    const settlementAt=nearDelivery?delivery:notice?.settlementAt??null;
    const sourceConflict=!!(notice&&nearDelivery&&notice.settlementAt!==delivery);
    const restrictedAt=sourceConflict?null:notice?.restrictedAt??null;
    risks.push({riskId:`${symbol}:${settlementAt??'status'}`,symbol,settlementAt,restrictedAt,
      status:info?.status??'NOT_IN_EXCHANGE_INFO',source:nearDelivery||!notice?'BINANCE_EXCHANGE_INFO':'BINANCE_OFFICIAL_NOTICE',
      sourceUrl:notice?.sourceUrl??API_DOC,sourceConflict,observedAt:now,
      stage:contractRiskStage({settlementAt,restrictedAt,status:info?.status},now)});
  }
  return risks.sort((a,b)=>(a.settlementAt??Infinity)-(b.settlementAt??Infinity)||a.symbol.localeCompare(b.symbol));
}
export function buildContractRiskPush(r,now){
  const stage=contractRiskStage(r,now);
  const prefix=stage==='SETTLEMENT_DUE'?'ĐÃ ĐẾN GIỜ TẤT TOÁN':stage==='RESTRICTED'?'HẠN CHẾ GIAO DỊCH':stage==='ONE_HOUR'?'TẤT TOÁN TRONG ≤1 GIỜ':stage==='ONE_DAY'?'TẤT TOÁN TRONG ≤24 GIỜ':'RỦI RO DELIST / TẤT TOÁN';
  const eventId=`contract-risk:${r.riskId}:${stage}`;
  return {signalType:CONTRACT_RISK_NOTIFICATION_TYPE,eventId,riskId:r.riskId,symbol:r.symbol,notifiedAt:now,
    title:`⚠ ${r.symbol} · ${prefix}`,
    body:`${r.settlementAt?`Sàn dự kiến tự tất toán: ${local(r.settlementAt)} (UTC+7).`:'Chưa có giờ tất toán xác nhận.'} ${r.restrictedAt?`Ngừng mở lệnh mới: ${local(r.restrictedAt)} (UTC+7), không đồng nghĩa khóa đóng vị thế.`:'Chưa xác nhận giờ ngừng mở lệnh mới; không suy đoán từ giờ tất toán.'} Trạng thái API: ${r.status}. ${r.sourceConflict?'Giờ API khác thông báo: cần kiểm tra lại. ':''}Cảnh báo lịch hợp đồng, không kết luận thao túng. Web không tự đóng lệnh hoặc chặn entry.`,
    url:zoneNotificationUrl({symbol:r.symbol,riskId:r.riskId,eventId})};
}

export class BinanceContractRiskMonitor{
  constructor({file,loadExchangeInfo,pushSender,discordSender=null,discordChannel=null,now=Date.now,notices=VERIFIED_CONTRACT_NOTICES}){
    Object.assign(this,{file,loadExchangeInfo,pushSender,discordSender,discordChannel,now,notices});this.state=null;this.running=false;
  }
  async initialize(){
    if(this.state)return;
    if(!this.loading)this.loading=(async()=>{
      let s;try{s=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;s={};}
      this.state={...s,risks:Array.isArray(s.risks)?s.risks:[],alerts:Array.isArray(s.alerts)?s.alerts:[],sent:s.sent??{},discordSent:s.discordSent??{}};
    })().finally(()=>{this.loading=null;});return this.loading;
  }
  async save(){
    await mkdir(dirname(this.file),{recursive:true});
    const tmp=`${this.file}.tmp-${process.pid}`;
    await writeFile(tmp,JSON.stringify({...this.state,version:CONTRACT_RISK_VERSION},null,2));await rename(tmp,this.file);
  }
  snapshot(){
    const now=this.now(),s=this.state??{};
    return {version:CONTRACT_RISK_VERSION,observeOnly:true,entryGate:false,pushEnabled:true,discordConfigured:!!this.discordSender,
      discordChannel:this.discordSender?this.discordChannel:null,checkedAt:s.checkedAt??null,
      error:s.error??null,stale:!s.checkedAt||now-s.checkedAt>900_000,
      risks:(s.risks??[]).filter(r=>!r.settlementAt||r.settlementAt>=now-RETAIN).map(r=>{
        const stage=contractRiskStage(r,now),id=`contract-risk:${r.riskId}:${stage}`;
        return {...r,stage,discordDelivery:(s.alerts??[]).find(a=>a.eventId===id)?.discordDelivery??null};
      })};
  }
  async tick(){
    if(this.running)return;this.running=true;
    try{
      await this.initialize();const now=this.now();
      if(now>=(this.state.nextCheckAt??0)){
        try{
          const info=await this.loadExchangeInfo();
          this.state.risks=collectContractRisks(info,this.notices,this.now());
          this.state.checkedAt=this.now();this.state.error=null;this.state.nextCheckAt=this.now()+300_000;
        }catch(e){this.state.error=String(e.message).slice(0,200);this.state.nextCheckAt=this.now()+60_000;}
        await this.save();
      }
      // Stale/failed observations never assert that a market is safe, and do not send speculative deadline alerts.
      if(this.state.error||this.snapshot().stale)return;
      for(const r of this.snapshot().risks){
        const payload=buildContractRiskPush(r,this.now());
        const push=!this.state.sent[payload.eventId],discord=!!this.discordSender&&!this.state.discordSent[payload.eventId];
        if(!push&&!discord)continue;
        let alert=this.state.alerts.find(a=>a.eventId===payload.eventId);
        if(!alert){alert={...payload};this.state.alerts.unshift(alert);}
        // Reserve each channel durably BEFORE sending. Legacy Push delivery does
        // not suppress the first Discord warning for a CURRENT active schedule.
        if(push){this.state.sent[payload.eventId]=this.now();alert.delivery={skipped:'PENDING'};}
        if(discord){this.state.discordSent[payload.eventId]=this.now();alert.discordNotifiedAt=this.now();alert.discordDelivery={skipped:'PENDING'};}
        await this.save();
        const historical=r.settlementAt&&this.now()-r.settlementAt>120_000;
        await Promise.all([
          push?(async()=>{
            if(historical){alert.delivery={skipped:'HISTORICAL_EVENT'};return;}
            try{alert.delivery=await this.pushSender(payload);}catch{alert.delivery={failed:1,error:'PUSH_FAILED_OR_UNKNOWN'};}
          })():null,
          discord?(async()=>{
            if(historical){alert.discordDelivery={skipped:'HISTORICAL_EVENT'};return;}
            try{alert.discordDelivery=await this.discordSender(r,this.now());}catch{alert.discordDelivery={failed:1,error:'DISCORD_FAILED_OR_UNKNOWN'};}
          })():null,
        ]);
        await this.save();
      }
      this.state.alerts=this.state.alerts.filter(a=>now-a.notifiedAt<=RETAIN).slice(0,1000);
      this.state.sent=Object.fromEntries(Object.entries(this.state.sent).filter(([,at])=>now-at<=RETAIN));
      this.state.discordSent=Object.fromEntries(Object.entries(this.state.discordSent).filter(([,at])=>now-at<=RETAIN));await this.save();
    }finally{this.running=false;}
  }
}
