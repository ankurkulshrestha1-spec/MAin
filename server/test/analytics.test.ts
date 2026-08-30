import test from 'node:test';
import assert from 'node:assert/strict';
import {
  absoluteReturn, cagr, computeReturns, navAsOf, shiftDays, shiftMonths, yearsBetween,
} from '../src/analytics/returns.js';
import { annualisedVolatility, maxDrawdown } from '../src/analytics/risk.js';
import { rankWithinCategory } from '../src/analytics/ranking.js';
import type { FundSummary, NavPoint } from '../src/types.js';

test('absoluteReturn computes simple percentage change', () => {
  assert.equal(absoluteReturn(100, 110), 10);
  assert.equal(absoluteReturn(50, 25), -50);
});

test('cagr annualises multi-year growth', () => {
  // Doubling over 3 years is ~25.99% a year.
  assert.ok(Math.abs(cagr(100, 200, 3)! - 25.992) < 0.01);
  assert.equal(cagr(100, 200, 0), null);
});

test('shiftMonths clamps end-of-month rollover', () => {
  assert.equal(shiftMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(shiftMonths('2026-01-15', -12), '2025-01-15');
});

test('yearsBetween uses calendar years', () => {
  assert.ok(Math.abs(yearsBetween('2020-01-01', '2023-01-01') - 3) < 0.01);
});

test('navAsOf falls back to the last trading day before a holiday', () => {
  const series: NavPoint[] = [
    { date: '2026-01-02', nav: 10 },
    { date: '2026-01-05', nav: 11 },
    { date: '2026-01-06', nav: 12 },
  ];
  // 2026-01-03 is a Saturday: expect Friday's NAV, not null.
  assert.deepEqual(navAsOf(series, '2026-01-03'), { date: '2026-01-02', nav: 10 });
  assert.deepEqual(navAsOf(series, '2026-01-06'), { date: '2026-01-06', nav: 12 });
  assert.equal(navAsOf(series, '2025-12-31'), null);
});

test('computeReturns annualises beyond a year and leaves short windows absolute', () => {
  const series: NavPoint[] = [];
  // 4 years of daily NAVs compounding at a steady rate.
  const start = Date.UTC(2022, 0, 3);
  let nav = 100;
  for (let i = 0; i < 4 * 365; i++) {
    const date = new Date(start + i * 86_400_000);
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue;
    nav *= 1 + 0.10 / 252;
    series.push({ date: date.toISOString().slice(0, 10), nav });
  }
  const returns = computeReturns(series, '2022-01-03');
  assert.ok(returns.y1! > 9 && returns.y1! < 11, `1Y was ${returns.y1}`);
  // 3Y is annualised, so it should land near the same 10%, not near 33%.
  assert.ok(returns.y3! > 9 && returns.y3! < 11, `3Y was ${returns.y3}`);
  // No 5 years of history exists, so 5Y must be null rather than extrapolated.
  assert.equal(returns.y5, null);
});

test('computeReturns returns nulls for an empty or single-point series', () => {
  assert.equal(computeReturns([], null).y1, null);
  assert.equal(computeReturns([{ date: '2026-01-01', nav: 10 }], null).d1, null);
});

test('maxDrawdown finds the worst peak-to-trough decline', () => {
  const series: NavPoint[] = [
    { date: '2026-01-01', nav: 100 },
    { date: '2026-01-02', nav: 120 },
    { date: '2026-01-03', nav: 60 },
    { date: '2026-01-04', nav: 110 },
  ];
  assert.equal(maxDrawdown(series), -50);
});

test('annualisedVolatility needs enough observations', () => {
  const short: NavPoint[] = Array.from({ length: 5 }, (_, i) => ({
    date: `2026-01-0${i + 1}`, nav: 100 + i,
  }));
  assert.equal(annualisedVolatility(short), null);
});

test('rankWithinCategory ranks by return and leaves nulls unranked', () => {
  const make = (id: number, category: string, y1: number | null): FundSummary =>
    ({ id, category, returns: { y1 } } as unknown as FundSummary);
  const ranks = rankWithinCategory(
    [make(1, 'equity', 12), make(2, 'equity', 20), make(3, 'equity', null), make(4, 'debt', 7)],
    'y1',
  );
  assert.deepEqual(ranks.get(2), { rank: 1, size: 2 });
  assert.deepEqual(ranks.get(1), { rank: 2, size: 2 });
  assert.equal(ranks.get(3), undefined);
  assert.deepEqual(ranks.get(4), { rank: 1, size: 1 });
});
