import {BTC_ALT_REACTION_VERSION as VERSION,BTC_ALT_REACTION_LABELS} from '../public/btc-alt-reaction-model.js';
const STEP=60000,ratio=(a,b)=>(a/b-1)*100,round=x=>x==null?null:Number(x.toFixed(3));
const num=x=>x==null||x===''||!Number.isFinite(Number(x))?null:Number(x);
export function reactionClosedRows(input=[],now=Date.now()){
  const rows=input.map(r=>Object.fromEntries([['openTime',0],['open',1],['high',2],['low',3],['close',4],['closeTime',6]].map(([k,i])=>[k,num(r?.[k]??r?.[i])]))).filter(r=>r.closeTime!=null&&r.closeTime<=now).sort((a,b)=>a.closeTime-b.closeTime).slice(-16);
  if(rows.length<16||now-rows.at(-1).closeTime>90000||rows.some((r,i)=>Object.values(r).some(v=>v==null)||r.open<=0||r.close<=0||r.low<=0||r.high<Math.max(r.open,r.close,r.low)||r.low>Math.min(r.open,r.close)||r.closeTime-r.openTime!==STEP-1||i>0&&r.openTime-rows[i-1].openTime!==STEP))return [];
  return rows;
}
function livePoint(value,rows,now){
  if(!value||!rows.length)return null;
  const price=num(value.price),at=num(value.at),openTime=num(value.openTime),next=rows.at(-1).closeTime+1;
  return price>0&&at>=next&&at<=now&&now-at<=10000&&openTime===next&&now>=next&&now<next+STEP?{price,at,openTime}:null;
}
export function classifyBtcReaction(btcReturn,coinReturn){
  if(!Number.isFinite(btcReturn)||!Number.isFinite(coinReturn))return 'DATA_MISSING';
  if(Math.abs(btcReturn)<.15)return coinReturn>=.1?'NEUTRAL_UP':coinReturn<=-.1?'NEUTRAL_DOWN':'NEUTRAL_FLAT';
  if(Math.abs(coinReturn)<.1)return 'FLAT';
  return `${Math.sign(btcReturn)===Math.sign(coinReturn)?'WITH':'AGAINST'}_${Math.abs(coinReturn)>=Math.max(.15,Math.abs(btcReturn))?'STRONG':'WEAK'}`;
}
export function btcReactionContext(input,now=Date.now(),point=null){
  const rows=reactionClosedRows(input,now);if(!rows.length)return {ready:false,reason:'BTC1m thiếu/cũ/gap; không dùng nền1h thay phản ứng mới.'};
  const live=livePoint(point,rows,now),endAt=live?.at??rows.at(-1).closeTime,price=live?.price??rows.at(-1).close;
  const anchors=rows.filter(r=>r.closeTime<endAt&&endAt-r.closeTime<=15*STEP);
  const peak=anchors.reduce((a,b)=>b.close>=a.close?b:a),trough=anchors.reduce((a,b)=>b.close<=a.close?b:a);
  const candidates=[{row:peak,move:ratio(price,peak.close),direction:'DOWN'},{row:trough,move:ratio(price,trough.close),direction:'UP'}]
    .filter(c=>c.direction==='DOWN'?c.move<=-.15:c.move>=.15).sort((a,b)=>b.row.closeTime-a.row.closeTime);
  const active=candidates[0],base=active?.row??rows.filter(r=>r.closeTime<=endAt-5*STEP).at(-1);
  return {ready:true,mode:live?'LIVE_PREVIEW':'CLOSED_1M',direction:active?.direction??'NEUTRAL',
    anchorAt:base.closeTime,anchorPrice:base.close,endAt,price,closedAt:rows.at(-1).closeTime,
    btcReturn:ratio(price,base.close),btcRet1m:ratio(rows.at(-1).close,rows.at(-2).close),btcRet5m:ratio(rows.at(-1).close,rows.at(-6).close)};
}
export function evaluateBtcAltReaction({symbols=[],getRows=()=>[],getLivePoint=()=>null,now=Date.now()}={}){
  const btcRows=getRows('BTCUSDT')??[],context=btcReactionContext(btcRows,now,getLivePoint('BTCUSDT',btcRows));
  const result={version:VERSION,evaluatedAt:now,observeOnly:true,affectsOrders:false,ready:context.ready,context,counts:{},coins:[],total:0,coverage:{ready:0,missing:0}};
  const unique=[...new Set(symbols)].filter(s=>/^[\p{L}\p{N}]{1,32}USDT$/u.test(s)&&s!=='BTCUSDT');
  for(const symbol of unique){
    let reason=context.ready?null:context.reason,row;
    if(context.ready){
      const raw=getRows(symbol)??[],rows=reactionClosedRows(raw,now),anchor=rows.find(r=>r.closeTime===context.anchorAt);
      const point=context.mode==='LIVE_PREVIEW'?livePoint(getLivePoint(symbol,raw),rows,now):null;
      if(!rows.length||rows.at(-1).closeTime!==context.closedAt||!anchor)reason='Thiếu/gap1m hoặc không cùng mốc BTC; không dùng giá cũ thay thế.';
      else if(context.mode==='LIVE_PREVIEW'&&(!point||Math.abs(point.at-context.endAt)>5000))reason='Giá live thiếu/cũ hoặc lệch BTC>5s; không gán cùng/ngược chiều.';
      else {
        const price=point?.price??rows.at(-1).close,coinReturn=ratio(price,anchor.close);
        row={symbol,group:classifyBtcReaction(context.btcReturn,coinReturn),ready:true,anchorPrice:anchor.close,price,
          priceAt:point?.at??context.endAt,coinReturn:round(coinReturn),btcReturn:round(context.btcReturn),relativeStrengthPct:round(coinReturn-context.btcReturn),
          amplitudeRatio:Math.abs(context.btcReturn)>=.15?round(Math.abs(coinReturn/context.btcReturn)):null,
          holdShare:context.direction==='DOWN'?round(Math.max(0,-coinReturn)/Math.abs(context.btcReturn)*100):null};
      }
    }
    result.coins.push(row??{symbol,group:'DATA_MISSING',ready:false,reason});
  }
  result.total=result.coins.length;result.coverage.ready=result.coins.filter(c=>c.ready).length;result.coverage.missing=result.total-result.coverage.ready;
  result.counts=Object.fromEntries(Object.keys(BTC_ALT_REACTION_LABELS).map(g=>[g,result.coins.filter(c=>c.group===g).length]));
  result.context={...context,btcReturn:round(context.btcReturn),btcRet1m:round(context.btcRet1m),btcRet5m:round(context.btcRet5m)};
  result.coins.sort((a,b)=>Object.keys(BTC_ALT_REACTION_LABELS).indexOf(a.group)-Object.keys(BTC_ALT_REACTION_LABELS).indexOf(b.group)||Math.abs(b.coinReturn??0)-Math.abs(a.coinReturn??0)||a.symbol.localeCompare(b.symbol));
  return result;
}
