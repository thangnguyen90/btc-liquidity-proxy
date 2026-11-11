import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
export const NEW_MANUAL_TP_VERSION='NEW_MANUAL_ENTRY_TP10_ROE_V1_20261111';
export const NEW_MANUAL_TP_ROE=10;
const scope='NEW_MANUAL_ORDERS_ONLY';
const direction=side=>['BUY','LONG'].includes(side)?'LONG':['SELL','SHORT'].includes(side)?'SHORT':null;
const reducing=p=>[true,'true'].includes(p.reduceOnly)||[true,'true'].includes(p.closePosition)
 ||p.positionSide==='LONG'&&p.side==='SELL'||p.positionSide==='SHORT'&&p.side==='BUY';
export function validManualTakeProfitProof(p){
 return !!p&&p.version===NEW_MANUAL_TP_VERSION&&p.scope===scope&&p.roePct===10&&p.manual===true
  &&/^[\p{L}\p{N}]{1,32}USDT$/u.test(p.symbol??'')&&direction(p.side)&&Number.isInteger(p.leverage)&&p.leverage>=1&&p.leverage<=125
  &&Number.isFinite(p.createdAt)&&Number.isFinite(p.activatedAt)&&p.createdAt>=p.activatedAt;
}
export function resolveFrozenManualTakeProfit({proof,symbol,side,entryPrice,leverage}={}){
 const entry=Number(entryPrice),lev=Number(leverage),d=direction(side);
 if(!validManualTakeProfitProof(proof)||symbol!==proof.symbol||d!==direction(proof.side)
  ||![entry,lev].every(Number.isFinite)||!(entry>0)||!Number.isInteger(lev)||lev<1||lev>125)return null;
 return {applied:true,direction:d,takeProfitPrice:entry*(1+(d==='LONG'?1:-1)*.1/lev),
  roePct:10,version:NEW_MANUAL_TP_VERSION,manualTakeProfitProof:proof};
}
export class NewManualTakeProfitPolicy{
 constructor({file,now=Date.now}={}){
  Object.assign(this,{file,now});this.policy=null;this.entries={};this.error=null;
  try{
   let s;
   try{s=JSON.parse(readFileSync(file,'utf8'));}
   catch(e){
    if(e.code!=='ENOENT')throw e;
    mkdirSync(dirname(file),{recursive:true});
    s={version:NEW_MANUAL_TP_VERSION,scope,roePct:10,activatedAt:now(),entries:{}};
    try{writeFileSync(file,JSON.stringify(s),{flag:'wx'});}
    catch(x){if(x.code!=='EEXIST')throw x;s=JSON.parse(readFileSync(file,'utf8'));}
   }
   const {entries={},...policy}=s;
   if(policy.version!==NEW_MANUAL_TP_VERSION||policy.scope!==scope||policy.roePct!==10
    ||!Number.isFinite(policy.activatedAt)||policy.activatedAt>now()||!entries||typeof entries!=='object'||Array.isArray(entries)
    ||Object.values(entries).some(e=>!e||!validManualTakeProfitProof(e.proof)||e.symbol!==e.proof.symbol))throw Error('SCHEMA');
   this.policy=policy;this.entries=entries;
  }catch{this.error='NEW_MANUAL_TP_POLICY_UNAVAILABLE';}
 }
 save(){
  if(this.error)throw Error(this.error);
  const temp=this.file+'.tmp-'+process.pid;
  try{writeFileSync(temp,JSON.stringify({...this.policy,entries:this.entries}));renameSync(temp,this.file);}
  catch{this.error='NEW_MANUAL_TP_STORAGE_FAILED';throw Error(this.error);}
 }
 preview({manual=false,symbol,source,side,entryPrice,leverage,entryAt=this.now()}={}){
  if(manual!==true)return null;
  if(this.error)throw Error(this.error);
  if(!Number.isFinite(entryAt)||entryAt<this.policy.activatedAt||entryAt>this.now()+1000)return null;
  const proof={...this.policy,symbol,source:String(source??'manual'),side,leverage:Number(leverage),manual:true,createdAt:entryAt};
  return resolveFrozenManualTakeProfit({proof,symbol,side,entryPrice,leverage});
 }
 clientProof(symbol,id,order=null){
  const e=this.entries[String(id??'')];
  if(!e||e.symbol!==symbol||!validManualTakeProfitProof(e.proof))return null;
  if(order&&(String(order.clientOrderId)!==String(id)||order.symbol!==symbol||direction(order.side)!==direction(e.proof.side)
    ||!(Number(order.time)>=e.proof.createdAt-1000)||e.orderId!=null&&String(order.orderId)!==String(e.orderId)))return null;
  return e.proof;
 }
 snapshot(){return {policy:this.policy,error:this.error,entries:Object.keys(this.entries).length};}
 install(client){
  const place=client.placeFuturesOrder.bind(client);
  client.placeFuturesOrder=async args=>{
   const p=args.params??{},type=String(p.type??'').toUpperCase(),control=args.entryControl;
   if(control?.manual!==true||reducing(p)||/STOP|TAKE_PROFIT|TRAILING/.test(type))return place(args);
   if(this.error)throw Error(this.error);
   const proof=control.manualTakeProfitProof,id=String(p.newClientOrderId??'');
   if(!id||!validManualTakeProfitProof(proof)||proof.symbol!==p.symbol||direction(proof.side)!==direction(p.side)
    ||proof.activatedAt!==this.policy.activatedAt)throw Error('NEW_MANUAL_TP_REQUIRES_EXACT_PROOF');
   const previous=this.entries[id];
   if(previous&&(!previous.confirmedZeroFillIOC||previous.symbol!==p.symbol||direction(previous.proof.side)!==direction(p.side)||previous.proof.leverage!==proof.leverage))throw Error('NEW_MANUAL_TP_ORDER_ALREADY_RESERVED');
   this.entries[id]={symbol:p.symbol,side:p.side,clientOrderId:id,proof:previous?.proof??proof,status:'RESERVED',at:this.now()};
   this.save();
   try{
    const result=await place(args);
    Object.assign(this.entries[id],{status:'SUBMITTED',orderId:result?.orderId??null,submittedAt:this.now(),
     confirmedZeroFillIOC:p.type==='LIMIT'&&p.timeInForce==='IOC'&&Number(result?.executedQty)===0&&['EXPIRED','CANCELED'].includes(result?.status)});
    this.save();return result;
   }catch(error){
    Object.assign(this.entries[id],{status:'UNKNOWN_OR_REJECTED',at:this.now()});
    try{this.save();}catch{}throw error;
   }
  };
 }
}
