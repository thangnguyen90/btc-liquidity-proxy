export const COIN_HORIZON_VERSION = 'COIN_HORIZON_SCENARIOS_OBSERVE_V1_20260906';
const rounded = n => Number.isFinite(n) ? Number(n.toFixed(8)) : null;

export function buildCoinHorizonAnalysis(analysis, now = Date.now()) {
  const price = analysis?.market?.markPrice;
  const frames = analysis?.trend?.frames ?? [];
  const h1 = frames.find(f=>f.interval==='1h'), h4 = frames.find(f=>f.interval==='4h');
  const fresh = (time, max) => Number.isFinite(time) && now-time>=0 && now-time<=max;
  const available = [price,h1?.atr14,h4?.atr14].every(n=>Number.isFinite(n)&&n>0) && Number.isFinite(Date.parse(analysis?.generatedAt));
  const stale = analysis?.freshness?.stale === true || !fresh(Date.parse(analysis?.generatedAt),90_000)
    || !fresh(h1?.closeTime,65*60_000) || !fresh(h4?.closeTime,245*60_000);
  const cgFrames = analysis?.coinglass?.available ? (analysis.coinglass.frames??[]).filter(f=>fresh(Date.parse(f.scrapedAt),20*60_000)) : [];
  const cgFrame = ['24h','12h','48h'].map(range=>cgFrames.find(f=>f.range===range)).find(Boolean);
  const bias = h1?.state==='UP' && h4?.state==='UP' ? 'UPPER'
    : h1?.state==='DOWN' && h4?.state==='DOWN' ? 'LOWER' : 'MIXED';
  const cgBias = analysis?.coinglass?.timeframeTrial?.weighted?.liquidityBias ?? analysis?.coinglass?.combined?.liquidityBias;
  const opposite = Boolean(cgFrame && ((bias==='UPPER'&&cgBias==='LOWER_FIRST') || (bias==='LOWER'&&cgBias==='UPPER_FIRST')));
  const notes = ['Biên kịch bản từ ATR, chưa hiệu chỉnh xác suất bằng backtest; giá có thể vượt biên.',
    '4h/8h/12h là thời gian phía trước; CoinGlass 24h là cửa sổ dữ liệu nhìn lại.',
    'Không dùng biên này làm TP/SL tự động.'];
  if (!cgFrame) notes.push('Thiếu CoinGlass mới; vùng thanh lý chưa tham gia đối chiếu.');
  if (stale) notes.push('Dữ liệu cũ hoặc thiếu thời điểm nến 1h/4h; chờ cập nhật, không kết luận hướng.');
  if (opposite) notes.push('Cấu trúc 1h/4h và CoinGlass ngược hướng.');
  const structural = (side, low, high) => (analysis?.zones?.[side==='UPPER'?'resistances':'supports']??[])
    .filter(z=>z.sources?.some(s=>/^(1h|4h)\s/.test(s)) && z.low>0 && z.high>=z.low
      && z.low>=low && z.high<=high && (side==='UPPER'?z.low>price:z.high<price))
    .sort((a,b)=>Math.abs(a.mid-price)-Math.abs(b.mid-price))[0]??null;
  const liq = (side, low, high) => (cgFrame?.[side==='UPPER'?'above':'below']??[])
    .filter(z=>['FRESH','APPROACHING','UNTRACKED'].includes(z.lifecycle)&&z.effectiveAttractionScore>0
      && z.bandLow>=low&&z.bandHigh<=high&&(side==='UPPER'?z.bandLow>price:z.bandHigh<price))
    .sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price))[0]??null;
  return { version:COIN_HORIZON_VERSION, observeOnly:true, available, stale,
    generatedAt:analysis?.generatedAt??null, anchor:price??null, notes,
    method:'width = max(ATR14_1h × sqrt(hours), ATR14_4h × sqrt(hours/4)); symmetric scenario, not probability interval',
    scenarios: available ? [4,8,12].map(hours=>{
      const width=Math.max(h1.atr14*Math.sqrt(hours),h4.atr14*Math.sqrt(hours/4));
      const lower=Math.max(price*0.01,price-width), upper=price+width;
      const clipped=lower!==price-width;
      return {hours,asOf:analysis.generatedAt,validUntil:new Date(Date.parse(analysis.generatedAt)+hours*3600000).toISOString(),
        lower:rounded(lower),upper:rounded(upper),lowerPct:rounded((lower/price-1)*100),upperPct:rounded((upper/price-1)*100),
        direction:stale?'WAIT_DATA':opposite?'CONFLICT':bias, agreement:!stale&&!opposite&&bias!=='MIXED'&&cgFrame?'PARTIAL':'LOW',
        support:structural('LOWER',lower,upper),resistance:structural('UPPER',lower,upper),
        lowerLiquidity:liq('LOWER',lower,upper),upperLiquidity:liq('UPPER',lower,upper),liquidityRange:cgFrame?.range??null,
        atr1h:rounded(h1.atr14),atr4h:rounded(h4.atr14),clipped,
        upperBreak:`Nến 1h đóng trên ${rounded(upper)}, sau đó retest 15m giữ được: đánh giá lại biên phía trên.`,
        lowerBreak:`Nến 1h đóng dưới ${rounded(lower)}, sau đó retest 15m không lấy lại: đánh giá lại biên phía dưới.`,
      };
    }) : [],
  };
}
