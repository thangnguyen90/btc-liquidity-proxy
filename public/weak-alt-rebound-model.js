export const WEAK_ALT_LEGACY_VERSION='BTC_WEAK_ALT_REBOUND_V1_20261013';
export const WEAK_ALT_VERSION='BTC_ALT_MARKET_STATE_V2_20261013';
export const WEAK_ALT_PUSH_TYPE='BTC_ALT_MARKET_STATE';
export const COUNTERTREND_VERSION='BTC_DOWN_ALT_COUNTERTREND_V1_20261014';
export const COIN_RELATION_VERSION='BTC_ALT_COIN_MATRIX_V1_20261014';
export const COIN_RELATION_LABELS=Object.freeze({
  AGAINST_STRONG:'Ngược chiều BTC · biên độ mạnh',AGAINST_WEAK:'Ngược chiều BTC · biên độ yếu',
  WITH_STRONG:'Cùng chiều BTC · biên độ mạnh',WITH_WEAK:'Cùng chiều BTC · biên độ yếu',FLAT:'Giữ giá / đi ngang khi BTC có hướng',
  NEUTRAL_UP:'BTC trung tính · coin tăng',NEUTRAL_DOWN:'BTC trung tính · coin giảm',NEUTRAL_FLAT:'BTC trung tính · coin đi ngang'
});
export function coinRelationKey(group){return Object.hasOwn(COIN_RELATION_LABELS,group)?`weak-alt-relation:${group}`:null;}
export function coinRelationTradeKey(trade={}){
  const c=trade.altBtcRelationAtEntry,entry=Number(trade.entryAt??trade.openedAt);
  if(!c||c.version!==COIN_RELATION_VERSION||c.source!=='AT_ENTRY'||c.ready!==true||c.symbol!==trade.symbol
    ||!Number.isFinite(entry)||!Number.isFinite(c.evaluatedAt)||c.evaluatedAt<=0||c.evaluatedAt>entry||entry-c.evaluatedAt>60000)return null;
  return coinRelationKey(c.group);
}
export const COUNTERTREND_LABELS=Object.freeze({HOLDING:'Giữ giá · chưa xác nhận tăng',COUNTERTREND_UP:'Tăng ngược BTC · giữ xu hướng',SQUEEZE_SUSPECTED:'Nghi ép SHORT · giá/volume',SHORT_LIQ_OBSERVED:'Có thanh lý SHORT quan sát'});
export function countertrendKey(tier){return Object.hasOwn(COUNTERTREND_LABELS,tier)?`weak-alt-coin:${tier}`:null;}
export function countertrendTradeKey(trade={}){
  const c=trade.altCountertrendAtEntry,entry=Number(trade.entryAt??trade.openedAt);
  if(!c||c.version!==COUNTERTREND_VERSION||c.source!=='AT_ENTRY'||c.ready!==true||c.symbol!==trade.symbol
    ||!Number.isFinite(entry)||!Number.isFinite(c.evaluatedAt)||c.evaluatedAt<=0||c.evaluatedAt>entry||entry-c.evaluatedAt>60000)return null;
  return countertrendKey(c.tier);
}
export const WEAK_ALT_LEGACY_LABELS=Object.freeze({WAIT_DATA:'Chưa đủ dữ liệu đánh giá ALT hồi yếu',NORMAL:'Chưa đủ dấu hiệu BTC hồi nhưng ALT yếu',WEAK_REBOUND:'BTC hồi nhưng ALT yếu',FRAGILE_REBOUND:'ALT hồi yếu · nhạy khi BTC giảm'});
export const WEAK_ALT_LABELS=Object.freeze({WAIT_DATA:'Chưa đủ dữ liệu BTC/ALT',NORMAL:'BTC/ALT phân hóa · chưa rõ kịch bản',
  BTC_NEUTRAL_ALT_STRONG:'BTC trung tính · ALT mạnh',BTC_NEUTRAL_ALT_WEAK:'BTC trung tính · ALT yếu',
  BTC_UP_ALT_STRONG:'BTC tăng · ALT đồng thuận mạnh',BTC_UP_ALT_LAGGING:'BTC tăng · ALT không theo',
  WEAK_REBOUND:'BTC hồi nhưng ALT yếu',FRAGILE_REBOUND:'ALT hồi yếu · nhạy khi BTC giảm',
  BTC_DOWN_ALT_RESILIENT:'BTC giảm · ALT giữ giá tốt',BTC_DOWN_ALT_WEAK:'BTC giảm · ALT giảm mạnh hơn'});
export const WEAK_ALT_STATES=Object.freeze(Object.keys(WEAK_ALT_LABELS).filter(s=>!['WAIT_DATA','NORMAL'].includes(s)));
export const WEAK_ALT_THEMES=Object.freeze({
  WAIT_DATA:{emoji:'⚪',accent:'#94a3b8',bg:'#14202d',ink:'#d1dbe8',icon:'wait'},
  NORMAL:{emoji:'⚫',accent:'#64748b',bg:'#1b2229',ink:'#d0d5df',icon:'mixed'},
  BTC_NEUTRAL_ALT_STRONG:{emoji:'🩵',accent:'#22d3ee',bg:'#0a2932',ink:'#a5f3fc',icon:'neutral-strong'},
  BTC_NEUTRAL_ALT_WEAK:{emoji:'🟡',accent:'#facc15',bg:'#30290d',ink:'#fef08a',icon:'neutral-weak'},
  BTC_UP_ALT_STRONG:{emoji:'🟢',accent:'#4ade80',bg:'#0c2c1c',ink:'#bbf7d0',icon:'up-strong'},
  BTC_UP_ALT_LAGGING:{emoji:'🟠',accent:'#fb923c',bg:'#34200f',ink:'#fed7aa',icon:'up-lagging'},
  WEAK_REBOUND:{emoji:'🟣',accent:'#c084fc',bg:'#24133e',ink:'#e9d5ff',icon:'weak'},
  FRAGILE_REBOUND:{emoji:'💗',accent:'#f472b6',bg:'#35132b',ink:'#fbcfe8',icon:'fragile'},
  BTC_DOWN_ALT_RESILIENT:{emoji:'🔵',accent:'#60a5fa',bg:'#102442',ink:'#bfdbfe',icon:'down-resilient'},
  BTC_DOWN_ALT_WEAK:{emoji:'🔴',accent:'#fb7185',bg:'#35151e',ink:'#fecdd3',icon:'down-weak'},
});
export function weakAltKey(state){return WEAK_ALT_STATES.includes(state)?`weak-alt-rebound:${state}`:null;}
export function weakAltLabel(state,version=WEAK_ALT_VERSION){return (version===WEAK_ALT_LEGACY_VERSION?WEAK_ALT_LEGACY_LABELS:WEAK_ALT_LABELS)[state]??'Lịch sử cũ · không phân loại lại';}
export function weakAltTradeKey(trade={}){
  const c=trade.weakAltReboundAtEntry,entry=Number(trade.entryAt??trade.openedAt);
  if(!c||![WEAK_ALT_VERSION,WEAK_ALT_LEGACY_VERSION].includes(c.version)||c.source!=='AT_ENTRY'||c.ready!==true||!Number.isFinite(entry)
    ||!Number.isFinite(c.evaluatedAt)||c.evaluatedAt<=0||c.evaluatedAt>entry||entry-c.evaluatedAt>60_000)return null;
  if(c.version===WEAK_ALT_LEGACY_VERSION&&!['WEAK_REBOUND','FRAGILE_REBOUND'].includes(c.state))return null;
  return weakAltKey(c.state);
}
