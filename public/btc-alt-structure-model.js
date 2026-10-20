export const BTC_ALT_STRUCTURE_VERSION='BTC_ALT_SEPARATE_TREND_REACTION_V1_20261014';
export const BTC_ALT_STRUCTURE_LABELS=Object.freeze({UP:'Coin có nền tăng',DOWN:'Coin có nền giảm',SIDEWAYS:'Coin đi ngang',MIXED:'Coin phân hóa / chuyển pha',DATA_MISSING:'Thiếu dữ liệu nền coin'});
export const BTC_TREND_LABELS=Object.freeze({UP:'Nền tăng',DOWN:'Nền giảm',SIDEWAYS:'Đi ngang / chưa có trend rõ',MIXED:'Phân hóa / chuyển pha',DATA_MISSING:'Chưa đủ dữ liệu nền'});
export function btcAltStructureKey(group){return Object.hasOwn(BTC_ALT_STRUCTURE_LABELS,group)?`weak-alt-structure:${group}`:null;}
export function btcAltStructureTradeKey(trade={}){
 const c=trade.btcAltStructureAtEntry,entry=Number(trade.entryAt??trade.openedAt);
 if(!c||c.version!==BTC_ALT_STRUCTURE_VERSION||c.source!=='AT_ENTRY'||c.ready!==true||c.symbol!==trade.symbol||c.group==='DATA_MISSING'||!Number.isFinite(entry)||!Number.isFinite(c.evaluatedAt)||c.evaluatedAt<=0||c.evaluatedAt>entry||entry-c.evaluatedAt>60000)return null;
 return btcAltStructureKey(c.group);
}
