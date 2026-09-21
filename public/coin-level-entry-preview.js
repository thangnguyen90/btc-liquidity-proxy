export const COIN_LEVEL_ENTRY_PREVIEW_VERSION = 'COIN_LEVEL_ENTRY_PREVIEW_V1_20260920';
export const COIN_LEVEL_ENTRY_DISPLAY_VERSION = 'COIN_LEVEL_ENTRY_DISPLAY_V2_20260920';

export function buildCoinLevelEntryPreview(analysis, side) {
  const key = side === 'LONG' ? 'longPlan' : side === 'SHORT' ? 'shortPlan' : null;
  const plan = key ? analysis?.recommendation?.[key] : null;
  const stale = analysis?.freshness?.stale === true
    || analysis?.freshness?.binance === 'STALE_LAST_GOOD';
  const low = Number(plan?.entryZone?.low);
  const high = Number(plan?.entryZone?.high);
  const valid = plan?.entryZone?.low != null && plan?.entryZone?.high != null
    && Number.isFinite(low) && Number.isFinite(high) && low > 0 && high >= low;
  return {
    version: COIN_LEVEL_ENTRY_PREVIEW_VERSION,
    side,
    observeOnly: true,
    available: Boolean(valid && !stale),
    status: stale ? 'STALE' : valid ? 'WAIT_CONFIRMATION' : 'NO_ZONE',
    // A visual midpoint of the EXISTING conditional entry zone, not a forecast
    // or an order price. Retain the exact bounds for users to inspect.
    referencePrice: valid && !stale ? (low + high) / 2 : null,
    zone: valid && !stale ? { low, high } : null,
  };
}

// Presentation only: the same support zone is a two-sided decision boundary,
// never two independent predicted fill prices.
export function buildCoinLevelEntryDisplay(analysis) {
  const recommendation = analysis?.recommendation ?? {};
  const previews = {
    LONG: buildCoinLevelEntryPreview(analysis, 'LONG'),
    SHORT: buildCoinLevelEntryPreview(analysis, 'SHORT'),
  };
  const stale = analysis?.freshness?.stale === true
    || analysis?.freshness?.binance === 'STALE_LAST_GOOD';
  const sameZone = previews.LONG.available && previews.SHORT.available
    && previews.LONG.zone.low === previews.SHORT.zone.low
    && previews.LONG.zone.high === previews.SHORT.zone.high;
  const sharedSupport = sameZone && recommendation.context === 'AT_SUPPORT';
  const confirmedSide = recommendation.stance === 'BEARISH_BREAKDOWN_15M_CONFIRMED' ? 'SHORT'
    : recommendation.stance === 'BULLISH_BREAKOUT_15M_CONFIRMED' ? 'LONG' : null;
  const trendLabel = stale ? 'DỮ LIỆU CŨ · CHƯA ĐỌC XU HƯỚNG'
    : recommendation.bias === 'BULLISH' ? 'XU HƯỚNG TỔNG HỢP: NGHIÊNG LONG'
      : recommendation.bias === 'BEARISH' ? 'XU HƯỚNG TỔNG HỢP: NGHIÊNG SHORT'
        : 'XU HƯỚNG TỔNG HỢP: CHƯA RÕ';
  const actionLabel = stale ? 'CHỜ DỮ LIỆU MỚI · KHÔNG CHỌN HƯỚNG'
    : confirmedSide === 'SHORT' ? '15M PHÁ HỖ TRỢ · ƯU TIÊN SHORT SAU RETEST 5M'
      : confirmedSide === 'LONG' ? '15M VƯỢT KHÁNG CỰ · ƯU TIÊN LONG SAU RETEST 5M'
        : sharedSupport ? 'CHƯA CHỌN HƯỚNG · CHỜ 15M GIỮ HOẶC PHÁ HỖ TRỢ'
          : 'CHƯA CÓ ĐIỂM VÀO · CHỜ XÁC NHẬN 15M VÀ RETEST 5M';
  const cards = Object.fromEntries(['LONG', 'SHORT'].map((side) => {
    const preview = previews[side];
    const opposite = confirmedSide != null && confirmedSide !== side;
    const level = sharedSupport
      ? side === 'LONG' ? preview.zone.high : preview.zone.low
      : sameZone ? null : preview.referencePrice;
    const visible = preview.available && !opposite && Number.isFinite(level);
    const condition = sharedSupport
      ? side === 'LONG' ? 'NGƯỠNG 15M ĐÓNG TRÊN' : 'NGƯỠNG 15M ĐÓNG DƯỚI'
      : sameZone ? 'CÙNG MỘT VÙNG · XEM ĐIỀU KIỆN NẾN'
        : 'TRUNG ĐIỂM VÙNG THEO DÕI';
    const state = stale ? 'CHỜ DỮ LIỆU MỚI'
      : !preview.available ? 'CHỜ VÙNG GIÁ HỢP LỆ'
        : opposite ? 'ĐỐI CHIỀU · TẠM ẨN MỐC GIÁ'
          : confirmedSide === side ? '15M ĐÃ XÁC NHẬN · CHỜ RETEST 5M'
            : sharedSupport ? side === 'LONG' ? 'CHỜ GIỮ VÙNG + RETEST 5M' : 'CHỜ PHÁ VÙNG + RETEST 5M'
              : 'CHỜ XÁC NHẬN 15M + RETEST 5M';
    return [side, { ...preview, visible, displayPrice: visible ? level : null, condition, state }];
  }));
  return {
    version: COIN_LEVEL_ENTRY_DISPLAY_VERSION,
    observeOnly: true,
    trendLabel,
    actionLabel,
    confirmedSide,
    sameZone,
    sharedSupport,
    cards,
  };
}
