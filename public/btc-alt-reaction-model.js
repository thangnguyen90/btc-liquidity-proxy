export const BTC_ALT_REACTION_VERSION='BTC_ALT_SWING_REACTION_V1_20261014';
export const BTC_ALT_REACTION_LABELS=Object.freeze({
  FLAT:'Giữ giá / đứng ngoài nhịp BTC',AGAINST_STRONG:'Ngược nhịp BTC · biên độ mạnh',AGAINST_WEAK:'Ngược nhịp BTC · biên độ yếu',
  WITH_WEAK:'Cùng nhịp BTC · biên độ nhẹ hơn',WITH_STRONG:'Cùng nhịp BTC · biên độ mạnh',
  NEUTRAL_UP:'BTC chưa có nhịp rõ · coin tăng',NEUTRAL_DOWN:'BTC chưa có nhịp rõ · coin giảm',NEUTRAL_FLAT:'BTC chưa có nhịp rõ · coin đi ngang',
  DATA_MISSING:'Chưa đủ dữ liệu đồng bộ · không kết luận'
});
export function btcAltReactionKey(group){return Object.hasOwn(BTC_ALT_REACTION_LABELS,group)?`weak-alt-reaction:${group}`:null;}
export function btcAltReactionTradeKey(trade={}){
  const c=trade.btcAltReactionAtEntry,entry=Number(trade.entryAt??trade.openedAt);
  if(!c||c.version!==BTC_ALT_REACTION_VERSION||c.source!=='AT_ENTRY'||c.ready!==true||c.symbol!==trade.symbol||c.group==='DATA_MISSING'
    ||!Number.isFinite(entry)||!Number.isFinite(c.evaluatedAt)||c.evaluatedAt<=0||c.evaluatedAt>entry||entry-c.evaluatedAt>60000)return null;
  return btcAltReactionKey(c.group);
}
