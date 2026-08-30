/** Response shapes returned by the tracker API. Mirrors server/src/types.ts. */

export type FundCategory = 'equity' | 'index' | 'balanced' | 'debt' | 'liquid';

export interface FundReturns {
  d1: number | null;
  w1: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
  y3: number | null;
  y5: number | null;
  y7: number | null;
  sinceInception: number | null;
}

export type ReturnWindow = keyof FundReturns;

export interface NavPoint {
  date: string;
  nav: number;
}

export interface FundSummary {
  id: number;
  sfin: string | null;
  sfinVerified: boolean;
  name: string;
  slug: string;
  category: FundCategory;
  benchmark: string | null;
  inceptionDate: string | null;
  aumCr: number | null;
  isManaged: boolean;
  isActive: boolean;
  updatedAt: string;
  latestNav: number | null;
  latestNavDate: string | null;
  previousNav: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  returns: FundReturns;
  navHistoryDays: number;
  /** Downsampled recent NAVs for the card sparkline. */
  sparkline: NavPoint[];
  categoryRank: number | null;
}

export interface RiskMetrics {
  volatility: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
  observations: number;
}

export interface FundDetail extends FundSummary {
  risk: RiskMetrics;
  categorySize: number;
  benchmarkSeries: NavPoint[] | null;
  series: NavPoint[];
}

export type Period = '1m' | '3m' | '6m' | '1y' | '3y' | '5y' | 'max';

export interface CompareSeries {
  id: number;
  name: string;
  slug: string;
  category: FundCategory;
  series: NavPoint[];
  changePct: number | null;
}

export interface CompareResponse {
  period: Period;
  funds: CompareSeries[];
}

export interface RankingsResponse {
  window: ReturnWindow;
  categories: Record<string, FundSummary[]>;
}

export interface HealthResponse {
  ok: boolean;
  activeFunds: number;
  navPoints: number;
  latestNavDate: string | null;
  sources: Record<string, number>;
}

export interface ScrapeResult {
  status: 'success' | 'partial' | 'failed';
  fundsUpdated: number;
  fundsSeen: number;
  unmatched: string[];
  message: string | null;
}
