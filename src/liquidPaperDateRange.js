export const LIQUID_PAPER_DAY_TIME_ZONE = 'Asia/Bangkok';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const formatterCache = new Map();

function dayFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }));
  }
  return formatterCache.get(timeZone);
}

export function isLiquidPaperIsoDay(value) {
  return ISO_DAY_RE.test(String(value ?? ''));
}

export function liquidPaperDayKey(value, timeZone = LIQUID_PAPER_DAY_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(
    dayFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function liquidPaperTradeDayKey(trade, timeZone = LIQUID_PAPER_DAY_TIME_ZONE) {
  return liquidPaperDayKey(
    trade?.createdAt ?? trade?.openedAt ?? trade?.closedAt ?? null,
    timeZone,
  );
}

export function normalizeLiquidPaperDateRange({ day = 'all', fromDay = '', toDay = '' } = {}) {
  const legacyDay = isLiquidPaperIsoDay(day) ? String(day) : null;
  let from = legacyDay ?? (isLiquidPaperIsoDay(fromDay) ? String(fromDay) : null);
  let to = legacyDay ?? (isLiquidPaperIsoDay(toDay) ? String(toDay) : null);
  if (from && to && from > to) [from, to] = [to, from];
  return {
    fromDay: from,
    toDay: to,
    mode: !from && !to ? 'all' : from === to ? 'day' : 'range',
  };
}

export function liquidPaperDayInRange(dayKey, range = {}) {
  if (!isLiquidPaperIsoDay(dayKey)) return false;
  if (range.fromDay && dayKey < range.fromDay) return false;
  if (range.toDay && dayKey > range.toDay) return false;
  return true;
}
