import { db, type FundRow } from './db.js';
import { config } from './config.js';
import type {
  Fund,
  FundCategory,
  FundDetail,
  FundSummary,
  NavPoint,
  NavSource,
} from './types.js';
import { computeReturns, navAsOf, shiftMonths } from './analytics/returns.js';
import { computeRisk } from './analytics/risk.js';
import { rankWithinCategory, type RankWindow } from './analytics/ranking.js';

function toFund(row: FundRow): Fund {
  return {
    id: row.id,
    sfin: row.sfin,
    sfinVerified: row.sfin_verified === 1,
    name: row.name,
    slug: row.slug,
    category: row.category as FundCategory,
    benchmark: row.benchmark,
    inceptionDate: row.inception_date,
    aumCr: row.aum_cr,
    isManaged: row.is_managed === 1,
    isActive: row.is_active === 1,
    updatedAt: row.updated_at,
  };
}

export function listFundRows(includeInactive = false): FundRow[] {
  const sql = includeInactive
    ? `SELECT * FROM funds ORDER BY name`
    : `SELECT * FROM funds WHERE is_active = 1 ORDER BY name`;
  return db.prepare(sql).all() as FundRow[];
}

export function getFundRow(idOrSlug: string | number): FundRow | null {
  const row =
    typeof idOrSlug === 'number' || /^\d+$/.test(String(idOrSlug))
      ? db.prepare(`SELECT * FROM funds WHERE id = ?`).get(Number(idOrSlug))
      : db.prepare(`SELECT * FROM funds WHERE slug = ?`).get(String(idOrSlug));
  return (row as FundRow | undefined) ?? null;
}

export function getNavSeries(fundId: number, from?: string): NavPoint[] {
  const sql = from
    ? `SELECT date, nav FROM nav_history WHERE fund_id = ? AND date >= ? ORDER BY date ASC`
    : `SELECT date, nav FROM nav_history WHERE fund_id = ? ORDER BY date ASC`;
  const stmt = db.prepare(sql);
  return (from ? stmt.all(fundId, from) : stmt.all(fundId)) as NavPoint[];
}

export function getBenchmarkSeries(name: string | null, from?: string): NavPoint[] | null {
  if (!name) return null;
  const benchmark = db
    .prepare(`SELECT id FROM benchmarks WHERE name = ?`)
    .get(name) as { id: number } | undefined;
  if (!benchmark) return null;
  const sql = from
    ? `SELECT date, value AS nav FROM benchmark_history WHERE benchmark_id = ? AND date >= ? ORDER BY date ASC`
    : `SELECT date, value AS nav FROM benchmark_history WHERE benchmark_id = ? ORDER BY date ASC`;
  const stmt = db.prepare(sql);
  const rows = (from ? stmt.all(benchmark.id, from) : stmt.all(benchmark.id)) as NavPoint[];
  return rows.length ? rows : null;
}

/**
 * Downsamples a series to at most `points` evenly spaced observations.
 * Card sparklines only need the shape of the trend, and sending a year of
 * daily NAVs for 25 funds would dominate the list response.
 */
function downsample(series: NavPoint[], points: number): NavPoint[] {
  if (series.length <= points) return series;
  const step = (series.length - 1) / (points - 1);
  const out: NavPoint[] = [];
  for (let i = 0; i < points; i++) out.push(series[Math.round(i * step)]!);
  return out;
}

export function summariseFund(row: FundRow): FundSummary {
  const series = getNavSeries(row.id);
  const latest = series[series.length - 1] ?? null;
  const previous = series.length > 1 ? series[series.length - 2]! : null;
  const dayChange = latest && previous ? latest.nav - previous.nav : null;
  return {
    ...toFund(row),
    latestNav: latest?.nav ?? null,
    latestNavDate: latest?.date ?? null,
    previousNav: previous?.nav ?? null,
    dayChange,
    dayChangePct:
      dayChange !== null && previous && previous.nav > 0
        ? (dayChange / previous.nav) * 100
        : null,
    returns: computeReturns(series, row.inception_date),
    navHistoryDays: series.length,
    sparkline: downsample(series.slice(-180), 32),
  };
}

export interface ListOptions {
  managedOnly?: boolean;
  category?: FundCategory;
  rankWindow?: RankWindow;
}

export function listFundSummaries(options: ListOptions = {}): FundSummary[] {
  const rows = listFundRows();
  const all = rows.map(summariseFund);
  // Rank against every active peer, then filter — so a managed-only view still
  // shows each fund's true standing in its full category, not within the subset.
  const ranks = rankWithinCategory(all, options.rankWindow ?? 'y1');

  return all
    .filter((f) => (options.managedOnly ? f.isManaged : true))
    .filter((f) => (options.category ? f.category === options.category : true))
    .map((f) => ({ ...f, categoryRank: ranks.get(f.id)?.rank ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type Period = '1m' | '3m' | '6m' | '1y' | '3y' | '5y' | 'max';

const PERIOD_MONTHS: Record<Exclude<Period, 'max'>, number> = {
  '1m': 1, '3m': 3, '6m': 6, '1y': 12, '3y': 36, '5y': 60,
};

export function periodStartDate(period: Period, latestDate: string): string | undefined {
  if (period === 'max') return undefined;
  return shiftMonths(latestDate, -PERIOD_MONTHS[period]);
}

export function getFundDetail(
  idOrSlug: string | number,
  period: Period = '1y',
  rankWindow: RankWindow = 'y1',
): FundDetail | null {
  const row = getFundRow(idOrSlug);
  if (!row) return null;

  const summary = summariseFund(row);
  const fullSeries = getNavSeries(row.id);
  const latestDate = summary.latestNavDate;
  const from = latestDate ? periodStartDate(period, latestDate) : undefined;

  // Chart window, anchored so the line starts at the period boundary rather
  // than at whatever the first trading day after it happens to be.
  const series = from
    ? fullSeries.filter((p) => p.date >= from)
    : fullSeries;
  const anchor = from ? navAsOf(fullSeries, from) : null;
  const windowed =
    anchor && series[0] && anchor.date < series[0].date ? [anchor, ...series] : series;

  // Risk is measured over the displayed window so it matches the chart.
  const annualised =
    period === '3y' ? summary.returns.y3
    : period === '5y' ? summary.returns.y5
    : period === 'max' ? summary.returns.sinceInception
    : summary.returns.y1;

  const peers = listFundSummaries({ category: summary.category, rankWindow });
  const rankEntry = rankWithinCategory(
    listFundRows().map(summariseFund),
    rankWindow,
  ).get(row.id);

  return {
    ...summary,
    risk: computeRisk(windowed, annualised, config.riskFreeRate),
    categoryRank: rankEntry?.rank ?? null,
    categorySize: rankEntry?.size ?? peers.length,
    benchmarkSeries: getBenchmarkSeries(row.benchmark, from),
    series: windowed,
  };
}

export function setManaged(fundId: number, isManaged: boolean): void {
  db.prepare(
    `UPDATE funds SET is_managed = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(isManaged ? 1 : 0, fundId);
}

export interface NavUpsert {
  fundId: number;
  date: string;
  nav: number;
  source: NavSource;
}

/** Inserts or overwrites NAV points. Returns how many rows changed. */
export function upsertNavPoints(points: NavUpsert[]): number {
  const stmt = db.prepare(`
    INSERT INTO nav_history (fund_id, date, nav, source)
    VALUES (@fundId, @date, @nav, @source)
    ON CONFLICT(fund_id, date) DO UPDATE SET nav = excluded.nav, source = excluded.source
  `);
  let changed = 0;
  db.transaction(() => {
    for (const point of points) {
      changed += stmt.run(point).changes;
    }
  })();
  return changed;
}
