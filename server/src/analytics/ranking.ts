import type { FundReturns, FundSummary } from '../types.js';

export type RankWindow = keyof FundReturns;

/**
 * Ranks funds against the peers in their own category over one window.
 * Funds with no return for that window are unranked rather than ranked last,
 * so a newly launched fund is not reported as the category's worst performer.
 */
export function rankWithinCategory(
  funds: FundSummary[],
  window: RankWindow,
): Map<number, { rank: number; size: number }> {
  const byCategory = new Map<string, FundSummary[]>();
  for (const fund of funds) {
    const list = byCategory.get(fund.category) ?? [];
    list.push(fund);
    byCategory.set(fund.category, list);
  }

  const result = new Map<number, { rank: number; size: number }>();
  for (const peers of byCategory.values()) {
    const ranked = peers
      .filter((f) => f.returns[window] !== null)
      .sort((a, b) => (b.returns[window] as number) - (a.returns[window] as number));
    ranked.forEach((fund, index) => {
      result.set(fund.id, { rank: index + 1, size: ranked.length });
    });
  }
  return result;
}
