import {newBotTakeProfitPolicy} from './newBotTakeProfitPolicy.js';
import {createHash} from 'node:crypto';
export const NEW_ENTRY_LEVERAGE_VERSION='NEW_ENTRY_LEVERAGE_3X_V1_20261029';
export function newEntryLeveragePolicy(state={}){
 const p=state.newEntryLeveragePolicy;if(p==null)return null;
 if(p.version!==NEW_ENTRY_LEVERAGE_VERSION||p.leverage!==3||p.scope!=='NEW_ENTRIES_ONLY')throw Error('INVALID_NEW_ENTRY_LEVERAGE_POLICY');
 return p;
}
export function newEntrySizing(payload,policy){
 const originalLeverage=Number(payload.leverage??1),originalNotional=Number(payload.notionalUsdt);
 if(!policy)return {leverage:originalLeverage,notionalUsdt:originalNotional};
 if(!Number.isInteger(originalLeverage)||originalLeverage<1||originalLeverage>125||!Number.isFinite(originalNotional)||originalNotional<=0)throw Error('INVALID_ENTRY_SIZING');
 const marginUsdt=originalNotional/originalLeverage;
 return {leverage:policy.leverage,notionalUsdt:marginUsdt*policy.leverage,marginUsdt,originalLeverage,policyVersion:policy.version};
}
export function newEntryControlView(state){
 const policy=newEntryLeveragePolicy(state),tp=newBotTakeProfitPolicy(state);if(!policy&&!tp)return state;
 return {...state,routes:Object.fromEntries(Object.entries(state.routes).map(([key,r])=>[key,{...r,strategyLeverage:r.leverage??null,leverage:policy?.leverage??r.leverage,executionLeverage:policy?.leverage??r.leverage,...(tp?{strategyTakeProfitRoePct:r.takeProfitRoePct??null,takeProfitRoePct:5,executionTakeProfitRoePct:5}:{}),title:policy?r.title?.replace(/×\s*\d+/g,'×3'):r.title}]))};
}
export function assertFlatEntry(symbol,positions,orders){
 if(!Array.isArray(positions)||!Array.isArray(orders)||positions.some(p=>!Number.isFinite(Number(p.positionAmt))))throw Error('NEW_3X_PREFLIGHT_UNAVAILABLE');
 if(positions.some(p=>p.symbol===symbol&&Number(p.positionAmt)!==0))throw Error('NEW_3X_EXISTING_POSITION_KEEP_UNCHANGED');
 if(orders.some(o=>o.symbol===symbol&&![true,'true'].includes(o.reduceOnly)&&![true,'true'].includes(o.closePosition)))throw Error('NEW_3X_EXISTING_ENTRY_KEEP_UNCHANGED');
}
const reducing=p=>[true,'true'].includes(p.reduceOnly)||[true,'true'].includes(p.closePosition)||p.positionSide==='LONG'&&p.side==='SELL'||p.positionSide==='SHORT'&&p.side==='BUY';
const protection=p=>/STOP|TAKE_PROFIT|TRAILING/.test(String(p.type??''));
// Installed outside the existing route/permission guard. Every direct entry
// path must have a recent confirmed 3x setting; reducing/protection are untouched.
export function installNewEntryLeverageGuard(client,readPolicy,{now=Date.now}={}){
 const set=client.setLeverage.bind(client),place=client.placeFuturesOrder.bind(client),verified=new Map();
 const key=a=>createHash('sha256').update(String(a.apiKey)+'\0'+String(a.apiSecret)).digest('hex')+':'+(a.symbol??a.params?.symbol);
 const flat=async a=>{const symbol=a.symbol??a.params?.symbol;const [positions,orders]=await Promise.all([client.getPositions({apiKey:a.apiKey,apiSecret:a.apiSecret}),client.getOpenOrders({symbol,apiKey:a.apiKey,apiSecret:a.apiSecret})]);assertFlatEntry(symbol,positions,orders);};
 client.setLeverage=async a=>{
  const policy=readPolicy();if(!policy)return set(a);
  verified.delete(key(a));if(Number(a.leverage)!==policy.leverage)throw Error('NEW_ENTRY_LEVERAGE_MUST_BE_3');
  await flat(a);const r=await set({...a,leverage:policy.leverage});
  if(Number(r?.leverage)!==policy.leverage)throw Error('NEW_ENTRY_LEVERAGE_NOT_CONFIRMED');
  verified.set(key(a),now());return r;
 };
 client.placeFuturesOrder=async a=>{
  const p=a.params??{};
  if(reducing(p)||protection(p))return place(a);
  const policy=readPolicy();
  if(policy){
   const at=verified.get(key(a));if(!Number.isFinite(at)||now()-at>30000)throw Error('NEW_ENTRY_3X_UNVERIFIED');
   await flat(a);
  }
  return place(a);
 };
}
