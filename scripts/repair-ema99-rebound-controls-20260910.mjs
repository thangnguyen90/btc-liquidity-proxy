import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';

const file=resolve(process.argv[2]??'data/auto-entry-controls.json');
const backup=resolve(process.argv[3]??'data/auto-entry-controls.before-timeframes-20260910.json');
const state=JSON.parse(readFileSync(file,'utf8'));
const old=JSON.parse(readFileSync(backup,'utf8'));
const original=Object.values(old.routes??{}).find(r=>r.source==='ema99-near-reject-short'
  &&r.stream==='ema99-retest'&&r.label==='NEAR_REJECT_SHORT_WATCH'&&r.side==='SHORT');
if(!original||original.enabled!==true||Number(original.marginUsdt)!==2||!original.enabledAt) {
  throw new Error('Known pre-split rebound permission is missing from backup; refusing repair.');
}
for(const interval of ['5m','15m']) {
  const key=JSON.stringify(['ema99-near-reject-short','ema99-retest','REBOUND_PUMP_NEAR_REJECT_SHORT_WATCH','SHORT',interval]);
  const row=state.routes?.[key];
  if(!row||row.source!=='ema99-near-reject-short'||row.interval!==interval)throw new Error(`Missing target ${interval}; refusing repair.`);
  Object.assign(row,{enabled:true,enabledAt:original.enabledAt,marginUsdt:2,leverage:5,executable:true});
}
for(const [key,row] of Object.entries(state.routes??{})) {
  if(row.source==='ema99-near-reject-short'&&row.stream==='ema99-retest'
    &&row.label==='NEAR_REJECT_SHORT_WATCH'&&row.side==='SHORT')delete state.routes[key];
}
const temp=`${file}.repair.tmp`;
writeFileSync(temp,JSON.stringify({...state,updatedAt:new Date().toISOString()},null,2));
renameSync(temp,file);
console.log('Restored rebound 5m/15m: enabled=true, margin=2; first-pump routes untouched and OFF.');
