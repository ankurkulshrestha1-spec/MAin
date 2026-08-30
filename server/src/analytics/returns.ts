import type { FundReturns, NavPoint } from '../types.js';

const MS_PER_DAY = 86_400_000;

/** Parses a YYYY-MM-DD date as UTC midnight so arithmetic is timezone-stable. */
export function parseDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function shiftDays(iso: string, days: number): string {
  return formatDate(parseDate(iso) + days * MS_PER_DAY);
}

export function shiftMonths(iso: string, months: number): string {
  const d = new Date(parseDate(iso));
  const targetDay = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp Jan 31 -> Feb 28 rather than letting it roll into March.
  if (d.getUTCDate() < targetDay) d.setUTCDate(0);
  return formatDate(d.getTime());
}

export function yearsBetween(fromIso: string, toIso: string): number {
  return (parseDate(toIso) - parseDate(fromIso)) / (MS_PER_DAY * 365.25);
}

/**
 * NAV as of `target`, using the most recent observation on or before it.
 * ULIP NAVs are only published on business days, so an exact-date lookup
 * would return null for any period boundary that lands on a weekend or
 * holiday. `series` must be sorted ascending by date.
 */
export function navAsOf(series: NavPoint[], target: string): NavPoint | null {
  let lo = 0;
  let hi = series.length - 1;
  let found: NavPoint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const point = series[mid]!;
    if (point.date <= target) {
      found = point;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Simple percentage change between two NAVs. */
export function absoluteReturn(from: number, to: number): number {
  return ((to - from) / from) * 100;
}

/** Compound annual growth rate, in percent. */
export function cagr(from: number, to: number, years: number): number | null {
  if (years <= 0 || from <= 0) return null;
  return (Math.pow(to / from, 1 / years) - 1) * 100;
}

/**
 * Return over a window ending at the latest NAV.
 *
 * Windows of a year or less are reported as absolute change; longer windows
 * are annualised, which is how ULIP factsheets and IRDAI disclosures quote
 * them. Returns null when history does not reach far enough back — we never
 * extrapolate from a shorter window.
 */
function windowReturn(
  series: NavPoint[],
  latest: NavPoint,
  startDate: string,
  annualise: boolean,
): number | null {
  const first = series[0];
  if (!first || first.date > startDate) return null;
  const start = navAsOf(series, startDate);
  if (!start || start.date === latest.date || start.nav <= 0) return null;
  if (!annualise) return absoluteReturn(start.nav, latest.nav);
  return cagr(start.nav, latest.nav, yearsBetween(start.date, latest.date));
}

export function computeReturns(
  series: NavPoint[],
  inceptionDate: string | null,
): FundReturns {
  const empty: FundReturns = {
    d1: null, w1: null, m1: null, m3: null, m6: null,
    y1: null, y3: null, y5: null, y7: null, sinceInception: null,
  };
  const latest = series[series.length - 1];
  if (!latest || series.length < 2) return empty;

  const prev = series[series.length - 2]!;
  const first = series[0]!;

  // Since-inception is annualised only once the fund is over a year old;
  // a 4-month-old fund's annualised number would be meaningless.
  const siYears = yearsBetween(inceptionDate ?? first.date, latest.date);
  const sinceInception =
    first.nav > 0
      ? siYears > 1
        ? cagr(first.nav, latest.nav, siYears)
        : absoluteReturn(first.nav, latest.nav)
      : null;

  return {
    d1: prev.nav > 0 ? absoluteReturn(prev.nav, latest.nav) : null,
    w1: windowReturn(series, latest, shiftDays(latest.date, -7), false),
    m1: windowReturn(series, latest, shiftMonths(latest.date, -1), false),
    m3: windowReturn(series, latest, shiftMonths(latest.date, -3), false),
    m6: windowReturn(series, latest, shiftMonths(latest.date, -6), false),
    y1: windowReturn(series, latest, shiftMonths(latest.date, -12), false),
    y3: windowReturn(series, latest, shiftMonths(latest.date, -36), true),
    y5: windowReturn(series, latest, shiftMonths(latest.date, -60), true),
    y7: windowReturn(series, latest, shiftMonths(latest.date, -84), true),
    sinceInception,
  };
}
