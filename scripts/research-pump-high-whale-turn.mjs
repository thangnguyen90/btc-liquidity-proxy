// Offline research only. No server, execution or notification imports.
import {S,H,normalizeChart,asof,refreshOverlap,priceFeatures,positioningAt} from '../src/pumpHighWhaleShortModel.js';
export {S,H,normalizeChart,asof,refreshOverlap,priceFeatures,positioningAt};
export const VERSION='PUMP_HIGH_WHALE_TURN_RESEARCH_V1_20261103';
export function confirmationIndex(raw,i){
 for(let j=i+1;j<=i+24&&j<raw.length;j++){
  if(+raw[j][0]!==+raw[i][0]+(j-i)*S)return null;
  if(+raw[j][4]<Math.min(...raw.slice(j-6,j).map(b=>+b[3])))return j;
 }
 return null;
}
export function simulate(raw,entryAt,side,funding=[],end=Infinity){
 const i=raw.findIndex(b=>+b[0]===entryAt),path=raw.slice(i,i+96);
 if(i<0||path.length!==96||entryAt+8*H>end||path.some((b,j)=>+b[0]!==entryAt+j*S||+b[6]!==+b[0]+S-1))return {status:'PRICE_GAP'};
 const entry=+path[0][1],stop=entry*(1-side*.2/3),target=entry*(1+side*.1/3);let exit=+path.at(-1)[4],exitAt=+path.at(-1)[6],kind='TIME',ambiguous=false;
 for(const b of path){const o=+b[1],sl=side===1?+b[3]<=stop:+b[2]>=stop,tp=side===1?+b[2]>=target:+b[3]<=target;
  if(side*(o-stop)<=0){exit=o;exitAt=+b[0];kind='SL_GAP';break;}
  if(side*(o-target)>=0){exit=target;exitAt=+b[0];kind='TP_GAP';break;}
  if(sl||tp){ambiguous=sl&&tp;exit=sl?stop:target;exitAt=+b[6];kind=sl?'SL':'TP';break;}
 }
 const fundingPct=side*funding.filter(f=>+f.fundingTime>entryAt&&+f.fundingTime<=exitAt).reduce((sum,f)=>sum+(+f.fundingRate)*(+f.markPrice>0?+f.markPrice/entry:1)*100,0),netRoe=(side*(exit/entry-1)*100-.14-fundingPct)*3;
 const returns=Object.fromEntries([1,4,8].map(h=>[h+'h',100*(+path[h*12-1][4]/entry-1)]));
 return {status:'OK',entry,stop,target,exit,exitAt,kind,ambiguous,fundingPct,netRoe,stressRoe:netRoe-.48,returns,mfePct:100*(Math.max(...path.map(b=>+b[2]))/entry-1),maePct:100*(Math.min(...path.map(b=>+b[3]))/entry-1)};
}
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const median=a=>{const x=a.slice().sort((a,b)=>a-b);return x.length?(x[Math.floor((x.length-1)/2)]+x[Math.ceil((x.length-1)/2)])/2:null;};
export function summarize(rows,side='SHORT'){
 const rs=rows.filter(r=>r.trades?.[side]?.status==='OK'),t=rs.map(r=>r.trades[side]),v=t.map(x=>x.netRoe),byCoin={};
 for(const r of rs)(byCoin[r.symbol]??=[]).push(r.trades[side].netRoe);
 const win=v.filter(x=>x>0).length,loss=v.filter(x=>x<0).length;
 return {n:v.length,coins:Object.keys(byCoin).length,win,loss,winPct:v.length?100*win/v.length:null,meanRoe:mean(v),medianRoe:median(v),stressMeanRoe:mean(t.map(x=>x.stressRoe)),coinEqualMean:mean(Object.values(byCoin).map(mean)),profitFactor:v.some(x=>x<0)?v.filter(x=>x>0).reduce((s,x)=>s+x,0)/-v.filter(x=>x<0).reduce((s,x)=>s+x,0):null,tp:t.filter(x=>x.kind.startsWith('TP')).length,sl:t.filter(x=>x.kind.startsWith('SL')).length,ambiguous:t.filter(x=>x.ambiguous).length,direction:Object.fromEntries([1,4,8].map(h=>[h+'h',{priceMeanPct:mean(t.map(x=>x.returns[h+'h'])),priceMedianPct:median(t.map(x=>x.returns[h+'h'])),downPct:t.length?100*t.filter(x=>x.returns[h+'h']<0).length/t.length:null}])),byCoin:Object.fromEntries(Object.entries(byCoin).map(([k,v])=>[k,{n:v.length,meanRoe:mean(v)}]))};
}
export function bootstrapCoins(rows,side='SHORT'){
 const groups=new Map();for(const r of rows.filter(x=>x.trades?.[side]?.status==='OK')){if(!groups.has(r.symbol))groups.set(r.symbol,[]);groups.get(r.symbol).push(r.trades[side].netRoe);}
 const a=[...groups.values()];if(a.length<2)return null;let seed=20261103;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},means=[];
 for(let n=0;n<2000;n++){let total=0,count=0;for(let j=0;j<a.length;j++){const b=a[Math.floor(rand()*a.length)];total+=b.reduce((s,x)=>s+x,0);count+=b.length;}means.push(total/count);}means.sort((a,b)=>a-b);return [means[50],means[1949]];
}
