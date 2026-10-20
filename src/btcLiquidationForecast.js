import { BTC_LIQUIDATION_FORECAST_VERSION as VERSION } from '../public/btc-liquidation-forecast-model.js';

// Evidence tiers, NOT probabilities. No force-order totals, future bars or order transport.
export function forecastLiquidationRisk(m,now=Date.now()) {
  const f=m?.forecastData;
  const valid=m?.ready===true && f?.ready===true && m.closedAt>0 && m.closedAt<=now && now-m.closedAt<=420_000
    && [m.account?.value,m.account?.p20,m.account?.p80,m.position?.value,m.position?.p20,m.position?.p80,
      m.oi?.change15mPct,m.oi?.change30mPct,m.oi?.buildBefore15mPct,m.price15mPct,m.price5mPct,
      m.takerBuy15m,f.volumeRatio15m,f.support30m,f.resistance30m].every(v=>typeof v==='number' && Number.isFinite(v));
  if(!valid) return {version:VERSION,ready:false,evaluatedAt:now,horizonMinutes:30,
    sides:['LONG','SHORT'].map(side=>({side,tier:'WAIT_DATA',conditions:[]})),
    reasons:m?.ready===false?m.errors??[]:['Thiếu chuỗi BTC/volume hoặc nền OI 45 phút để cảnh báo sớm.']};
  const oiBuild=m.oi.change30mPct>=.3 || m.oi.buildBefore15mPct>=.3;
  const oiStillOpen=m.oi.change15mPct>=-.3;
  const sides=['LONG','SHORT'].map(side=>{
    const long=side==='LONG';
    const crowded=long
      ? m.account.value>=1.2 && m.account.value>=m.account.p80 || m.position.value>=1.2 && m.position.value>=m.position.p80
      : m.account.value<=1/1.2 && m.account.value<=m.account.p20 || m.position.value<=1/1.2 && m.position.value<=m.position.p20;
    const priceWeak=long ? m.price15mPct<=-.15 || m.price5mPct<=-.1 || f.breakSupport
      : m.price15mPct>=.15 || m.price5mPct>=.1 || f.breakResistance;
    const flowAgainst=f.volumeRatio15m>=1.3 && (long?m.takerBuy15m<=.45:m.takerBuy15m>=.55);
    const exposure=crowded||oiBuild;
    const early=exposure&&priceWeak&&flowAgainst&&oiStillOpen;
    const watch=crowded&&oiBuild || exposure&&priceWeak;
    const directionalMove=long?m.price15mPct<=-.3:m.price15mPct>=.3;
    const oiUnwinding=m.oi.change15mPct<=-.3;
    const unwinding=directionalMove&&flowAgainst&&oiUnwinding;
    const tier=unwinding?'UNWINDING':early?'EARLY':watch?'WATCH':'MONITOR';
    return {side,tier,conditions:[
      {id:'crowded',met:crowded,label:`Ratio nghiêng ${side} và ở vùng cực trị so với nền trước đó`,
        detail:`Tài khoản ${m.account.value.toFixed(3)}× / ${long?'P80':'P20'} ${(long?m.account.p80:m.account.p20).toFixed(3)}×; vị thế top ${m.position.value.toFixed(3)}× / ${(long?m.position.p80:m.position.p20).toFixed(3)}×`},
      {id:'oiBuild',met:oiBuild,label:'OI tích tụ ≥0,3%/30m hoặc 30m trước nhịp gần nhất',
        detail:`30m ${m.oi.change30mPct.toFixed(2)}%; nền trước ${m.oi.buildBefore15mPct.toFixed(2)}%`},
      {id:'priceWeak',met:priceWeak,label:long?'Giá yếu / mất đáy 30m trước đó':'Giá tăng / vượt đỉnh 30m trước đó',
        detail:`BTC 15m ${m.price15mPct.toFixed(2)}%; 5m ${m.price5mPct.toFixed(2)}%`},
      {id:'flowAgainst',met:flowAgainst,label:long?'Volume ≥1,3× nền + bán chủ động ≥55%':'Volume ≥1,3× nền + mua chủ động ≥55%',
        detail:`Volume ${f.volumeRatio15m.toFixed(2)}×; ${long?'bán':'mua'} chủ động ${((long?1-m.takerBuy15m:m.takerBuy15m)*100).toFixed(1)}%`},
      {id:'oiStillOpen',met:oiStillOpen,label:'EARLY: OI 15m chưa giảm quá 0,3%',detail:`OI 15m ${m.oi.change15mPct.toFixed(2)}%`},
      {id:'oiUnwinding',met:oiUnwinding,label:'ĐANG THÁO: OI 15m giảm ≥0,3%',detail:`OI 15m ${m.oi.change15mPct.toFixed(2)}%`},
      {id:'directionalMove',met:directionalMove,label:`ĐANG THÁO: BTC 15m ${long?'giảm':'tăng'} ≥0,3%`,detail:`BTC 15m ${m.price15mPct.toFixed(2)}%`}],
      level:long?f.support30m:f.resistance30m,
      scenario:unwinding?`Giá ${long?'giảm':'tăng'}, OI giảm và volume ${long?'bán':'mua'} tăng: đang tháo vị thế, nghiêng đóng/ép ${side}. Đây là suy luận giá/OI, chưa xác nhận bên thanh lý từ forceOrder.`
        :long?'Nếu lực bán tiếp diễn và BTC mất hỗ trợ, nguy cơ ép LONG tăng.':'Nếu lực mua tiếp diễn và BTC vượt kháng cự, nguy cơ ép SHORT tăng.'};
  });
  return {version:VERSION,ready:true,evaluatedAt:now,closedAt:m.closedAt,horizonMinutes:30,sides,
    note:'Cảnh báo nguy cơ cho 30 phút tới, không xác suất đã hiệu chuẩn; có thể báo sai hoặc bỏ sót. OI không cho biết riêng bên LONG/SHORT; không cần thanh lý đạt ngưỡng, không đảm bảo báo trước mọi đợt thanh lý.'};
}
