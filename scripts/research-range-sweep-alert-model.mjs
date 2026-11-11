// Pure OHLC exit model; research only.
export function simulateBracket(bars,entry,sign,atr,tpAtr,slAtr){
 const tp=entry+sign*tpAtr*atr,sl=entry-sign*slAtr*atr;
 if(!(tp>0&&sl>0))return null;
 let ambiguous=false;
 for(const b of bars){
  // Gaps execute at the observed open. Intrabar TP/SL collision uses SL first.
  const openStop=sign*(b.o-sl)<=0,openTp=sign*(b.o-tp)>=0;
  if(openStop||openTp)return {exit:b.o,exitAt:b.t,outcome:openStop?'SL_GAP':'TP_GAP',ambiguous};
  const stop=sign===1?b.l<=sl:b.h>=sl,profit=sign===1?b.h>=tp:b.l<=tp;
  if(stop||profit)return {exit:stop?sl:tp,exitAt:b.end,outcome:stop?'SL':'TP',ambiguous:stop&&profit};
 }
 return {exit:bars.at(-1).c,exitAt:bars.at(-1).end,outcome:'TIMEOUT',ambiguous};
}
