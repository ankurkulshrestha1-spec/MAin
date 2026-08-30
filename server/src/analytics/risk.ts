import type { NavPoint, RiskMetrics } from '../types.js';

const TRADING_DAYS_PER_YEAR = 252;

/** Daily log returns between consecutive NAV observations. */
export function dailyLogReturns(series: NavPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!.nav;
    const curr = series[i]!.nav;
    if (prev > 0 && curr > 0) out.push(Math.log(curr / prev));
  }
  return out;
}

/** Annualised standard deviation of daily returns, in percent. */
export function annualisedVolatility(series: NavPoint[]): number | null {
  const returns = dailyLogReturns(series);
  if (returns.length < 20) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  // Sample variance (n-1): these are a sample of the fund's return process.
  const variance =
    returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

/** Largest peak-to-trough decline over the series, as a negative percent. */
export function maxDrawdown(series: NavPoint[]): number | null {
  if (series.length < 2) return null;
  let peak = series[0]!.nav;
  let worst = 0;
  for (const point of series) {
    if (point.nav > peak) peak = point.nav;
    if (peak > 0) {
      const drawdown = ((point.nav - peak) / peak) * 100;
      if (drawdown < worst) worst = drawdown;
    }
  }
  return worst;
}

export function computeRisk(
  series: NavPoint[],
  annualisedReturnPct: number | null,
  riskFreeRatePct: number,
): RiskMetrics {
  const volatility = annualisedVolatility(series);
  const sharpe =
    volatility && volatility > 0 && annualisedReturnPct !== null
      ? (annualisedReturnPct - riskFreeRatePct) / volatility
      : null;
  return {
    volatility,
    maxDrawdown: maxDrawdown(series),
    sharpe,
    observations: series.length,
  };
}
