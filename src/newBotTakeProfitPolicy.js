import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export const NEW_BOT_TP_VERSION='NEW_BOT_ENTRY_TP5_ROE_V1_20261108';
export const NEW_BOT_TP_FILL_IDENTITY_VERSION='NEW_BOT_TP_FILL_IDENTITY_V2_20261108';
const reducing=p=>[true,'true'].includes(p.reduceOnly)||[true,'true'].includes(p.closePosition)||p.positionSide==='LONG'&&p.side==='SELL'||p.positionSide==='SHORT'&&p.side==='BUY';
const direction=s=>['BUY','LONG'].includes(s)?'LONG':['SELL','SHORT'].includes(s)?'SHORT':null;
export function botTpSource(source){const s=String(source??'').trim().toLowerCase();return !!s&&!/manual/.test(s)&&!['signal','unclassified','binance_unattributed','binance-position-fallback','set-tp-sl','rest_sync','rest-fill-recovery','rest_fill_recovery'].includes(s);}
export function newBotTakeProfitPolicy(state={}){const p=state.newBotTakeProfitPolicy;if(p==null)return null;if(p.version!==NEW_BOT_TP_VERSION||p.roePct!==5||p.scope!=='NEW_BOT_ORDERS_ONLY'||!Number.isFinite(Date.parse(p.activatedAt)))throw Error('INVALID_NEW_BOT_TP_POLICY');return p;}
export function validNewBotTpProof(p){return !!p&&p.version===NEW_BOT_TP_VERSION&&p.roePct===5&&p.scope==='NEW_BOT_ORDERS_ONLY'&&botTpSource(p.source)&&direction(p.side)&&p.symbol&&p.leverage>0&&Number.isFinite(p.createdAt)&&p.createdAt>=Date.parse(p.activatedAt);}
export function resolveFrozenNewBotTakeProfit({proof,side,entryPrice,leverage}={}){const entry=Number(entryPrice),lev=Number(leverage),d=direction(side);if(!validNewBotTpProof(proof)||d!==direction(proof.side)||!(entry>0)||!(lev>0))return null;return{applied:true,direction:d,takeProfitPrice:entry*(1+(d==='LONG'?1:-1)*.05/lev),roePct:5,version:NEW_BOT_TP_VERSION,newBotTakeProfitProof:proof};}
export class NewBotTakeProfitLedger{
 constructor({file,readPolicy,readLeverage=()=>3,now=Date.now}={}){Object.assign(this,{file,readPolicy,readLeverage,now});this.state={version:NEW_BOT_TP_VERSION,entries:{}};this.error=null;try{const s=JSON.parse(readFileSync(file,'utf8'));if(s.version!==NEW_BOT_TP_VERSION||!s.entries||typeof s.entries!=='object'||Array.isArray(s.entries))throw Error('SCHEMA');this.state=s;}catch(e){if(e.code!=='ENOENT')this.error='NEW_BOT_TP_LEDGER_INVALID';}}
 save(){if(this.error)throw Error(this.error);mkdirSync(dirname(this.file),{recursive:true});const temp=this.file+'.tmp-'+process.pid;writeFileSync(temp,JSON.stringify(this.state));renameSync(temp,this.file);}
 preview(payload={},manual=false){if(manual||payload.dryRun===true||!botTpSource(payload.source??payload.signalSource)||!direction(payload.side))return null;const p=this.readPolicy();if(!p||this.now()<Date.parse(p.activatedAt))return null;if(this.error)throw Error(this.error);return{version:NEW_BOT_TP_VERSION,scope:p.scope,roePct:5,activatedAt:p.activatedAt,createdAt:this.now(),symbol:payload.symbol,source:payload.source??payload.signalSource,side:payload.side,leverage:Number(this.readLeverage(payload.leverage??3))};}
 clientProof(symbol,clientOrderId){const e=this.state.entries[clientOrderId];return e&&e.symbol===symbol&&validNewBotTpProof(e.proof)?e.proof:null;}
 trackedPositionProof(symbol,pos,tracking,fills={}){
  const d=direction(Number(pos?.positionAmt??pos?.amt)>0?'LONG':Number(pos?.positionAmt??pos?.amt)<0?'SHORT':null);
  const t=tracking,e=this.state.entries[t?.entryClientOrderId],proof=e?.proof;
  // The socket's verified opening-order identity is available before recordFill
  // finishes its asynchronous audit write. Never adopt by symbol or time alone.
  if(!d||!t||!e||e.status!=='SUBMITTED'||!validNewBotTpProof(proof)||e.symbol!==symbol||proof.symbol!==symbol
    ||!e.orderId||String(e.orderId)!==String(t.entryOrderId)||direction(proof.side)!==d||direction(t.signalSide)!==d
    ||t.signalSource!==proof.source||!(Number(t.openedAt)>=proof.createdAt)
    ||!(Number(t.protectionOrderCreatedAt)>=Date.parse(proof.activatedAt))
    ||!(Number(pos.entryPrice)>0)||!(Number(t.entry)>0)||Math.abs(Number(pos.entryPrice)/Number(t.entry)-1)>1e-8)return null;
  if(Object.values(fills).map(x=>x.record??x).some(r=>r.symbol===symbol&&r.clientOrderId===t.entryClientOrderId&&r.positionStatus==='CLOSED'))return null;
  return proof;
 }
 positionProof(symbol,pos,fills={},tracking=null){const d=direction(Number(pos?.positionAmt??pos?.amt)>0?'LONG':Number(pos?.positionAmt??pos?.amt)<0?'SHORT':null);if(!d)return null;const rs=Object.values(fills).map(x=>x.record??x).filter(r=>r.symbol===symbol&&r.direction===d&&r.positionStatus!=='CLOSED');if(!rs.length)return this.trackedPositionProof(symbol,pos,tracking,fills);if(rs.some(r=>{const e=this.state.entries[r.clientOrderId];return !e||e.status!=='SUBMITTED'||e.orderId!=null&&String(e.orderId)!==String(r.orderId)||!(Date.parse(r.filledAt)>=e.proof.createdAt)||Number(pos.entryPrice)>0&&Number(r.avgFillPrice)>0&&Math.abs(Number(pos.entryPrice)/Number(r.avgFillPrice)-1)>1e-8;}))return null;const proofs=rs.map(r=>this.clientProof(symbol,r.clientOrderId));if(proofs.some(p=>!p||direction(p.side)!==d))return null;return proofs[0];}
 snapshot(){return{version:NEW_BOT_TP_VERSION,policy:this.readPolicy(),error:this.error,entries:Object.keys(this.state.entries).length};}
 install(client){const place=client.placeFuturesOrder.bind(client);client.placeFuturesOrder=async args=>{const p=args.params??{},type=String(p.type??'').toUpperCase();if(reducing(p)||/STOP|TAKE_PROFIT|TRAILING/.test(type))return place(args);
 const payload=args.entryControl?.payload??{},proof=this.preview({...payload,symbol:p.symbol,side:p.side},args.entryControl?.manual===true);
 if(!proof)return place(args);
 const id=String(p.newClientOrderId??'');if(!id)throw Error('NEW_BOT_TP_REQUIRES_CLIENT_ID');const old=this.state.entries[id];if(old){if(old.symbol!==p.symbol)throw Error('NEW_BOT_TP_ID_COLLISION');if(!old.confirmedZeroFillIOC)throw Error('NEW_BOT_TP_ORDER_ALREADY_RESERVED');}
 this.state.entries[id]={symbol:p.symbol,side:p.side,clientOrderId:id,proof:old?.proof??proof,status:'RESERVED',at:this.now()};try{this.save();}catch(e){this.error='NEW_BOT_TP_STORAGE_FAILED';throw e;}
 try{const r=await place(args);Object.assign(this.state.entries[id],{status:'SUBMITTED',orderId:r?.orderId??null,submittedAt:this.now(),confirmedZeroFillIOC:p.type==='LIMIT'&&p.timeInForce==='IOC'&&Number(r?.executedQty)===0&&['EXPIRED','CANCELED'].includes(r?.status)});try{this.save();}catch{this.error='NEW_BOT_TP_STORAGE_FAILED_AFTER_SEND';}return r;}catch(e){Object.assign(this.state.entries[id],{status:'UNKNOWN_OR_REJECTED',at:this.now()});try{this.save();}catch{this.error='NEW_BOT_TP_STORAGE_FAILED';}throw e;}
 };}
}

