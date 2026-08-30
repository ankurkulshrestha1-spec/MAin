export type FundCategory =
  | 'equity'
  | 'index'
  | 'balanced'
  | 'debt'
  | 'liquid';

export type NavSource = 'scrape' | 'csv' | 'manual' | 'seed';

export interface Fund {
  id: number;
  sfin: string | null;
  /** True when the SFIN was confirmed against a PNB MetLife source, false when seeded but unverified. */
  sfinVerified: boolean;
  name: string;
  slug: string;
  category: FundCategory;
  benchmark: string | null;
  inceptionDate: string | null;
  aumCr: number | null;
  /** Funds the app's owner personally manages — these drive the dashboard. */
  isManaged: boolean;
  isActive: boolean;
  updatedAt: string;
}

export interface NavPoint {
  date: string;
  nav: number;
}

export interface FundReturns {
  d1: number | null;
  w1: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
  /** Annualised (CAGR) beyond one year. */
  y3: number | null;
  y5: number | null;
  y7: number | null;
  sinceInception: number | null;
}

export interface RiskMetrics {
  /** Annualised standard deviation of daily returns, in %. */
  volatility: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
  /** Trading days of history the metrics were computed over. */
  observations: number;
}

export interface FundSummary extends Fund {
  latestNav: number | null;
  latestNavDate: string | null;
  previousNav: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  returns: FundReturns;
  navHistoryDays: number;
  /** Downsampled recent NAVs for the card sparkline. */
  sparkline: NavPoint[];
}

export interface FundDetail extends FundSummary {
  risk: RiskMetrics;
  /** Rank of this fund within its category over the ranking window (1 = best). */
  categoryRank: number | null;
  categorySize: number;
  benchmarkSeries: NavPoint[] | null;
  series: NavPoint[];
}

export interface ScrapeRun {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  fundsUpdated: number;
  message: string | null;
}
